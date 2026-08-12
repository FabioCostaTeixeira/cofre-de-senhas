import { randomUUID } from 'node:crypto';
import { sql } from '@/lib/db/client';
import { NotFoundError } from '@/lib/authz';
import { assertUuid } from '@/lib/validation';
import { getCombo } from '@/lib/db/combos';
import { getPlano } from '@/lib/db/planos';
import { getProduto } from '@/lib/db/produtos';
import type { Contratacao, DadosContratacao } from '@/lib/types';

export class ItemInativoError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
  }
}

type ItemFlat = { produto_id: string; quantidade: number };
type Resolvido = { precoTotal: number; dataValidade: string | null; itens: ItemFlat[] };

/** Soma quantidades repetidas do mesmo produto numa única entrada. */
function mesclarPorProduto(itens: ItemFlat[]): ItemFlat[] {
  const mapa = new Map<string, number>();
  for (const i of itens) mapa.set(i.produto_id, (mapa.get(i.produto_id) ?? 0) + i.quantidade);
  return [...mapa.entries()].map(([produto_id, quantidade]) => ({ produto_id, quantidade }));
}

async function resolverAvulso(produtoId: string, quantidade: number): Promise<Resolvido> {
  assertUuid(produtoId);
  const produto = await getProduto(produtoId);
  if (!produto || !produto.ativo) throw new ItemInativoError('Este produto não está disponível.');
  return { precoTotal: produto.preco * quantidade, dataValidade: null, itens: [{ produto_id: produtoId, quantidade }] };
}

async function resolverCombo(comboId: string, quantidade: number): Promise<Resolvido> {
  assertUuid(comboId);
  const combo = await getCombo(comboId);
  if (!combo || !combo.ativo) throw new ItemInativoError('Este combo não está disponível.');
  const itens = mesclarPorProduto(
    combo.itens.map((i) => ({ produto_id: i.valor, quantidade: i.quantidade * quantidade })),
  );
  return { precoTotal: combo.preco * quantidade, dataValidade: null, itens };
}

async function resolverPlano(planoId: string, quantidade: number): Promise<Resolvido> {
  assertUuid(planoId);
  const plano = await getPlano(planoId);
  if (!plano || !plano.ativo) throw new ItemInativoError('Este plano não está disponível.');

  const flat: ItemFlat[] = [];
  for (const item of plano.itens) {
    if (item.tipo === 'produto') {
      flat.push({ produto_id: item.valor, quantidade: item.quantidade * quantidade });
      continue;
    }
    const combo = await getCombo(item.valor);
    if (!combo) throw new ItemInativoError('Este plano contém um combo que não existe mais.');
    for (const ci of combo.itens) {
      flat.push({ produto_id: ci.valor, quantidade: ci.quantidade * item.quantidade * quantidade });
    }
  }

  let dataValidade: string | null = null;
  if (plano.tipo_cobranca === 'pacote_fechado' && plano.validade_dias !== null) {
    const data = new Date();
    data.setDate(data.getDate() + plano.validade_dias);
    dataValidade = data.toISOString().slice(0, 10);
  }

  return { precoTotal: plano.preco * quantidade, dataValidade, itens: mesclarPorProduto(flat) };
}

export async function createContratacao(dados: DadosContratacao): Promise<string> {
  assertUuid(dados.cliente_id);
  const resolvido = dados.tipo === 'avulso'
    ? await resolverAvulso(dados.produto_id!, dados.quantidade)
    : dados.tipo === 'combo'
      ? await resolverCombo(dados.combo_id!, dados.quantidade)
      : await resolverPlano(dados.plano_id!, dados.quantidade);

  const id = randomUUID();
  await sql.transaction([
    sql`insert into contratacoes (id, cliente_id, tipo, produto_id, combo_id, plano_id, quantidade, preco_total, data_validade)
        values (${id}, ${dados.cliente_id}, ${dados.tipo}, ${dados.produto_id}, ${dados.combo_id}, ${dados.plano_id},
                ${dados.quantidade}, ${resolvido.precoTotal}, ${resolvido.dataValidade})`,
    ...resolvido.itens.map((i) => sql`
      insert into contratacao_itens (contratacao_id, produto_id, quantidade_total)
      values (${id}, ${i.produto_id}, ${i.quantidade})`),
  ]);
  return id;
}

export async function listContratacoes(): Promise<Contratacao[]> {
  return (await sql`
    select ct.id, ct.cliente_id, cl.nome as cliente_nome, ct.tipo,
           ct.produto_id, ct.combo_id, ct.plano_id,
           coalesce(p.nome, c.nome, pl.nome) as item_nome,
           ct.quantidade, ct.preco_total::float8 as preco_total,
           ct.data_validade::text as data_validade,
           (ct.deleted_at is not null) as cancelada,
           ct.created_at,
           coalesce(
             json_agg(
               json_build_object(
                 'produto_id', ci.produto_id, 'produto_nome', cp.nome,
                 'quantidade_total', ci.quantidade_total, 'quantidade_consumida', ci.quantidade_consumida
               ) order by cp.nome
             ) filter (where ci.id is not null), '[]'
           ) as itens
      from contratacoes ct
      join clientes cl on cl.id = ct.cliente_id
      left join produtos p on p.id = ct.produto_id
      left join combos c on c.id = ct.combo_id
      left join planos pl on pl.id = ct.plano_id
      left join contratacao_itens ci on ci.contratacao_id = ct.id
      left join produtos cp on cp.id = ci.produto_id
     group by ct.id, cl.nome, p.nome, c.nome, pl.nome
     order by ct.created_at desc`) as Contratacao[];
}

export async function softDeleteContratacao(id: string): Promise<void> {
  assertUuid(id);
  const rows = (await sql`
    update contratacoes set deleted_at = now()
     where id = ${id} and deleted_at is null
     returning id`) as { id: string }[];
  if (!rows[0]) throw new NotFoundError();
}
