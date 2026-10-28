import { sql } from '@/lib/db/client';
import { NotFoundError } from '@/lib/authz';
import { assertUuid } from '@/lib/validation';
import type { AtributoMolde, CategoriaProduto, Planejamento } from '@/lib/types';

export async function listCategorias(): Promise<CategoriaProduto[]> {
  return (await sql`
    select id, nome, unidade_consumo, atributos_molde, ativo, planejamento, produtos_exclusivos
      from categorias_produto order by nome`) as CategoriaProduto[];
}

export async function getCategoria(id: string): Promise<CategoriaProduto | null> {
  assertUuid(id);
  const rows = (await sql`
    select id, nome, unidade_consumo, atributos_molde, ativo, planejamento, produtos_exclusivos
      from categorias_produto where id = ${id}`) as CategoriaProduto[];
  return rows[0] ?? null;
}

/** `planejamento` e `produtos_exclusivos` opcionais: sem eles valem os padrões das
 *  colunas ('edicao' e false). */
type DadosCategoria = {
  nome: string; unidade_consumo: string | null; atributos_molde: AtributoMolde[]; ativo: boolean;
  planejamento?: Planejamento; produtos_exclusivos?: boolean;
};

export async function createCategoria(dados: DadosCategoria): Promise<string> {
  const rows = (await sql`
    insert into categorias_produto (nome, unidade_consumo, atributos_molde, ativo, planejamento, produtos_exclusivos)
    values (${dados.nome}, ${dados.unidade_consumo}, ${JSON.stringify(dados.atributos_molde)}::jsonb, ${dados.ativo},
            ${dados.planejamento ?? 'edicao'}, ${dados.produtos_exclusivos ?? false})
    returning id`) as { id: string }[];
  return rows[0].id;
}

export async function updateCategoria(id: string, dados: DadosCategoria): Promise<void> {
  assertUuid(id);
  const rows = (await sql`
    update categorias_produto
       set nome = ${dados.nome}, unidade_consumo = ${dados.unidade_consumo},
           atributos_molde = ${JSON.stringify(dados.atributos_molde)}::jsonb, ativo = ${dados.ativo},
           planejamento = ${dados.planejamento ?? 'edicao'},
           produtos_exclusivos = ${dados.produtos_exclusivos ?? false},
           updated_at = now()
     where id = ${id}
     returning id`) as { id: string }[];
  if (!rows[0]) throw new NotFoundError();
}

export class CategoriaEmUsoError extends Error {
  constructor(qtd: number) {
    super(`Categoria em uso por ${qtd} produto${qtd === 1 ? '' : 's'}.`);
  }
}

export async function deleteCategoria(id: string): Promise<void> {
  assertUuid(id);
  if (!(await getCategoria(id))) throw new NotFoundError();
  const [{ n }] = (await sql`
    select count(*)::int as n from produtos where categoria_id = ${id}`) as { n: number }[];
  if (n > 0) throw new CategoriaEmUsoError(n);
  await sql`delete from categorias_produto where id = ${id}`;
}
