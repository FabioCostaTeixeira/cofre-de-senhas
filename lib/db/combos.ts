import { randomUUID } from 'node:crypto';
import { sql } from '@/lib/db/client';
import { NotFoundError } from '@/lib/authz';
import { assertUuid } from '@/lib/validation';
import type { Combo, DadosCombo } from '@/lib/types';

export async function listCombos(): Promise<Combo[]> {
  return (await sql`
    select c.id, c.nome, c.descricao, c.preco::float8 as preco, c.ativo, c.created_at,
           coalesce(
             json_agg(
               json_build_object(
                 'tipo', 'produto', 'valor', ci.produto_id, 'nome', p.nome,
                 'quantidade', ci.quantidade, 'ativo', (p.ativo and p.deleted_at is null)
               ) order by p.nome
             ) filter (where ci.id is not null), '[]'
           ) as itens
      from combos c
      left join combo_itens ci on ci.combo_id = c.id
      left join produtos p on p.id = ci.produto_id
     where c.deleted_at is null
     group by c.id
     order by c.nome`) as Combo[];
}

export async function getCombo(id: string): Promise<Combo | null> {
  assertUuid(id);
  const rows = (await sql`
    select c.id, c.nome, c.descricao, c.preco::float8 as preco, c.ativo, c.created_at,
           coalesce(
             json_agg(
               json_build_object(
                 'tipo', 'produto', 'valor', ci.produto_id, 'nome', p.nome,
                 'quantidade', ci.quantidade, 'ativo', (p.ativo and p.deleted_at is null)
               ) order by p.nome
             ) filter (where ci.id is not null), '[]'
           ) as itens
      from combos c
      left join combo_itens ci on ci.combo_id = c.id
      left join produtos p on p.id = ci.produto_id
     where c.id = ${id} and c.deleted_at is null
     group by c.id`) as Combo[];
  return rows[0] ?? null;
}

export async function createCombo(dados: DadosCombo): Promise<string> {
  const id = randomUUID();
  await sql.transaction([
    sql`insert into combos (id, nome, descricao, preco, ativo)
        values (${id}, ${dados.nome}, ${dados.descricao}, ${dados.preco}, ${dados.ativo})`,
    ...dados.itens.map((i) => sql`
      insert into combo_itens (combo_id, produto_id, quantidade)
      values (${id}, ${i.valor}, ${i.quantidade})`),
  ]);
  return id;
}

export async function updateCombo(id: string, dados: DadosCombo): Promise<void> {
  assertUuid(id);
  if (!(await getCombo(id))) throw new NotFoundError();
  await sql.transaction([
    sql`update combos
           set nome = ${dados.nome}, descricao = ${dados.descricao}, preco = ${dados.preco},
               ativo = ${dados.ativo}, updated_at = now()
         where id = ${id}`,
    sql`delete from combo_itens where combo_id = ${id}`,
    ...dados.itens.map((i) => sql`
      insert into combo_itens (combo_id, produto_id, quantidade)
      values (${id}, ${i.valor}, ${i.quantidade})`),
  ]);
}

export async function softDeleteCombo(id: string): Promise<void> {
  assertUuid(id);
  const rows = (await sql`
    update combos set deleted_at = now()
     where id = ${id} and deleted_at is null returning id`) as { id: string }[];
  if (!rows[0]) throw new NotFoundError();
}
