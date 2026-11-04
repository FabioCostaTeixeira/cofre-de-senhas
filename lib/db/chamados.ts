import { sql } from '@/lib/db/client';
import { NotFoundError } from '@/lib/authz';
import { getCategoria } from '@/lib/db/categorias-produto';
import { getProduto } from '@/lib/db/produtos';
import { COLUNAS_CHAMADO } from '@/lib/kanban';
import { COLUNA_HOMOLOGACAO_CHAMADO } from '@/lib/permissoes-cards';
import { produtoPermitidoNaCategoria } from '@/lib/produtos-regra';
import { assertUuid } from '@/lib/validation';
import type { Chamado, DadosChamado } from '@/lib/types';

// Diferente de `tarefas`, chamado não mexe em saldo: mover e apagar são updates simples.
// Os parâmetros opcionais de usuário aplicam a regra de linha de lib/permissoes-cards.ts
// dentro da própria `where`: card fora do alcance do ator é tratado como inexistente.

/** Categoria/produto/responsável escolhidos não servem para chamado. */
export class ChamadoInvalidoError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
  }
}

/** Sem filtro, todos. `envolvido`: os que ele abriu ou que foram atribuídos a ele.
 *  `responsavel`: só os atribuídos a ele. `criadoPor`: só os que ele abriu. */
export async function listChamados(
  filtro: { envolvido?: string; responsavel?: string; criadoPor?: string } = {},
): Promise<Chamado[]> {
  if (filtro.envolvido) assertUuid(filtro.envolvido);
  if (filtro.responsavel) assertUuid(filtro.responsavel);
  if (filtro.criadoPor) assertUuid(filtro.criadoPor);
  const ator = filtro.envolvido ?? null;
  const responsavel = filtro.responsavel ?? null;
  const criadoPor = filtro.criadoPor ?? null;
  return (await sql`
    select c.id, c.categoria_id, c.produto_id, p.nome as produto_nome,
           c.responsavel_id, r.name as responsavel_nome,
           c.criado_por, a.name as criado_por_nome,
           c.titulo, c.descricao, c.coluna, c.prioridade, c.created_at
      from chamados c
      join produtos p on p.id = c.produto_id
      join users a on a.id = c.criado_por
      left join users r on r.id = c.responsavel_id
     where c.deleted_at is null
       and (${ator}::uuid is null or c.criado_por = ${ator} or c.responsavel_id = ${ator})
       and (${responsavel}::uuid is null or c.responsavel_id = ${responsavel})
       and (${criadoPor}::uuid is null or c.criado_por = ${criadoPor})
     order by c.prioridade, c.created_at`) as Chamado[];
}

/** Mesma regra de categoria → produto da OS, restrita a categorias do quadro de Projetos. */
async function validarCategoriaProduto(categoriaId: string, produtoId: string): Promise<void> {
  assertUuid(categoriaId);
  assertUuid(produtoId);
  const escolhida = await getCategoria(categoriaId);
  if (!escolhida || !escolhida.ativo || escolhida.planejamento !== 'projeto') {
    throw new ChamadoInvalidoError('Esta categoria não está disponível para chamados.');
  }
  const produto = await getProduto(produtoId);
  if (!produto || !produto.ativo) throw new ChamadoInvalidoError('Este produto não está disponível.');
  const categoriaDoProduto = await getCategoria(produto.categoria_id);
  if (!categoriaDoProduto || !produtoPermitidoNaCategoria(categoriaDoProduto, escolhida)) {
    throw new ChamadoInvalidoError(`"${produto.nome}" não pode ser escolhido na categoria "${escolhida.nome}".`);
  }
}

async function validarResponsavel(responsavelId: string): Promise<void> {
  assertUuid(responsavelId);
  const rows = (await sql`select id from users where id = ${responsavelId} and is_active`) as { id: string }[];
  if (!rows[0]) throw new ChamadoInvalidoError('Escolha um responsável ativo.');
}

export async function createChamado(dados: DadosChamado, criadoPor: string): Promise<string> {
  assertUuid(criadoPor);
  await validarCategoriaProduto(dados.categoria_id, dados.produto_id);
  await validarResponsavel(dados.responsavel_id);
  const rows = (await sql`
    insert into chamados (categoria_id, produto_id, responsavel_id, criado_por, titulo, descricao)
    values (${dados.categoria_id}, ${dados.produto_id}, ${dados.responsavel_id}, ${criadoPor},
            ${dados.titulo}, ${dados.descricao})
    returning id`) as { id: string }[];
  return rows[0].id;
}

/** Edição pelo lápis do card. Responsável pode continuar o atual mesmo que tenha sido
 *  desativado depois — só troca exige usuário ativo. Com `somenteCriador`, só o
 *  chamado que ele abriu. */
export async function updateChamado(id: string, dados: DadosChamado, somenteCriador?: string): Promise<void> {
  assertUuid(id);
  if (somenteCriador) assertUuid(somenteCriador);
  const criador = somenteCriador ?? null;
  await validarCategoriaProduto(dados.categoria_id, dados.produto_id);
  const atual = (await sql`
    select responsavel_id from chamados where id = ${id} and deleted_at is null
       and (${criador}::uuid is null or criado_por = ${criador})`) as
    { responsavel_id: string | null }[];
  if (!atual[0]) throw new NotFoundError();
  if (atual[0].responsavel_id !== dados.responsavel_id) await validarResponsavel(dados.responsavel_id);

  const rows = (await sql`
    update chamados
       set categoria_id = ${dados.categoria_id}, produto_id = ${dados.produto_id},
           responsavel_id = ${dados.responsavel_id}, titulo = ${dados.titulo},
           descricao = ${dados.descricao}, updated_at = now()
     where id = ${id} and deleted_at is null
       and (${criador}::uuid is null or criado_por = ${criador})
    returning id`) as { id: string }[];
  if (!rows[0]) throw new NotFoundError();
}

/** Com `restricao`, só chamado atribuído ao ator ou que ele abriu — e, se
 *  `criadorSoDaHomologacao`, o que ele abriu só sai do lugar estando em Homologação
 *  (mesma regra de `podeMoverChamado`, checada na `where` para não depender de leitura
 *  anterior). */
export async function moverChamado(
  id: string, coluna: string, restricao?: { ator: string; criadorSoDaHomologacao: boolean },
): Promise<void> {
  assertUuid(id);
  if (restricao) assertUuid(restricao.ator);
  const ator = restricao?.ator ?? null;
  const soDaHomologacao = restricao?.criadorSoDaHomologacao ?? false;
  if (!COLUNAS_CHAMADO.some((c) => c.id === coluna)) throw new ChamadoInvalidoError('Coluna inválida.');
  const rows = (await sql`
    update chamados set coluna = ${coluna}, updated_at = now()
     where id = ${id} and deleted_at is null
       and (${ator}::uuid is null or responsavel_id = ${ator}
            or (criado_por = ${ator} and (not ${soDaHomologacao}::boolean or coluna = ${COLUNA_HOMOLOGACAO_CHAMADO})))
    returning id`) as { id: string }[];
  if (!rows[0]) throw new NotFoundError();
}

/** Reescreve a prioridade na ordem recebida, mesmo padrão de `reordenarTarefas`. */
export async function reordenarChamados(ids: string[]): Promise<void> {
  for (const id of ids) assertUuid(id);
  if (ids.length === 0) return;
  await sql.transaction(
    ids.map((id, i) => sql`
      update chamados set prioridade = ${i}, updated_at = now()
       where id = ${id} and deleted_at is null`),
  );
}

export async function softDeleteChamado(id: string, somenteCriador?: string): Promise<void> {
  assertUuid(id);
  if (somenteCriador) assertUuid(somenteCriador);
  const criador = somenteCriador ?? null;
  const rows = (await sql`
    update chamados set deleted_at = now() where id = ${id} and deleted_at is null
       and (${criador}::uuid is null or criado_por = ${criador})
    returning id`) as { id: string }[];
  if (!rows[0]) throw new NotFoundError();
}
