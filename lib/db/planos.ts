import { randomUUID } from 'node:crypto';
import { sql } from '@/lib/db/client';
import { NotFoundError } from '@/lib/authz';
import { assertUuid } from '@/lib/validation';
import type { DadosPlano, Plano } from '@/lib/types';

export async function listPlanos(): Promise<Plano[]> {
  return (await sql`
    select pl.id, pl.nome, pl.descricao, pl.tipo_cobranca, pl.validade_dias, pl.ciclo,
           pl.preco::float8 as preco, pl.ativo, pl.created_at,
           coalesce(
             json_agg(
               json_build_object(
                 'tipo', pi.tipo_item, 'valor', coalesce(pi.produto_id, pi.combo_id),
                 'nome', coalesce(p.nome, c.nome), 'quantidade', pi.quantidade,
                 'ativo', coalesce(p.ativo and p.deleted_at is null, c.ativo and c.deleted_at is null)
               ) order by coalesce(p.nome, c.nome)
             ) filter (where pi.id is not null), '[]'
           ) as itens
      from planos pl
      left join plano_itens pi on pi.plano_id = pl.id
      left join produtos p on p.id = pi.produto_id
      left join combos c on c.id = pi.combo_id
     where pl.deleted_at is null
     group by pl.id
     order by pl.nome`) as Plano[];
}

export async function getPlano(id: string): Promise<Plano | null> {
  assertUuid(id);
  const rows = (await sql`
    select pl.id, pl.nome, pl.descricao, pl.tipo_cobranca, pl.validade_dias, pl.ciclo,
           pl.preco::float8 as preco, pl.ativo, pl.created_at,
           coalesce(
             json_agg(
               json_build_object(
                 'tipo', pi.tipo_item, 'valor', coalesce(pi.produto_id, pi.combo_id),
                 'nome', coalesce(p.nome, c.nome), 'quantidade', pi.quantidade,
                 'ativo', coalesce(p.ativo and p.deleted_at is null, c.ativo and c.deleted_at is null)
               ) order by coalesce(p.nome, c.nome)
             ) filter (where pi.id is not null), '[]'
           ) as itens
      from planos pl
      left join plano_itens pi on pi.plano_id = pl.id
      left join produtos p on p.id = pi.produto_id
      left join combos c on c.id = pi.combo_id
     where pl.id = ${id} and pl.deleted_at is null
     group by pl.id`) as Plano[];
  return rows[0] ?? null;
}

function inserirItem(planoId: string, item: DadosPlano['itens'][number]) {
  return item.tipo === 'produto'
    ? sql`insert into plano_itens (plano_id, tipo_item, produto_id, quantidade)
          values (${planoId}, 'produto', ${item.valor}, ${item.quantidade})`
    : sql`insert into plano_itens (plano_id, tipo_item, combo_id, quantidade)
          values (${planoId}, 'combo', ${item.valor}, ${item.quantidade})`;
}

export async function createPlano(dados: DadosPlano): Promise<string> {
  const id = randomUUID();
  await sql.transaction([
    sql`insert into planos (id, nome, descricao, tipo_cobranca, validade_dias, ciclo, preco, ativo)
        values (${id}, ${dados.nome}, ${dados.descricao}, ${dados.tipo_cobranca},
                ${dados.validade_dias}, ${dados.ciclo}, ${dados.preco}, ${dados.ativo})`,
    ...dados.itens.map((i) => inserirItem(id, i)),
  ]);
  return id;
}

export async function updatePlano(id: string, dados: DadosPlano): Promise<void> {
  assertUuid(id);
  if (!(await getPlano(id))) throw new NotFoundError();
  await sql.transaction([
    sql`update planos
           set nome = ${dados.nome}, descricao = ${dados.descricao}, tipo_cobranca = ${dados.tipo_cobranca},
               validade_dias = ${dados.validade_dias}, ciclo = ${dados.ciclo}, preco = ${dados.preco},
               ativo = ${dados.ativo}, updated_at = now()
         where id = ${id}`,
    sql`delete from plano_itens where plano_id = ${id}`,
    ...dados.itens.map((i) => inserirItem(id, i)),
  ]);
}

export async function softDeletePlano(id: string): Promise<void> {
  assertUuid(id);
  const rows = (await sql`
    update planos set deleted_at = now()
     where id = ${id} and deleted_at is null returning id`) as { id: string }[];
  if (!rows[0]) throw new NotFoundError();
}
