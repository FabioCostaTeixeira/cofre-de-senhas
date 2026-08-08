import { sql } from '@/lib/db/client';
import { NotFoundError } from '@/lib/authz';
import { assertUuid } from '@/lib/validation';
import type { DadosProduto, Produto } from '@/lib/types';

export async function listProdutos(): Promise<Produto[]> {
  return (await sql`
    select id, categoria_id, nome, descricao, atributos, preco::float8 as preco, ativo, created_at
      from produtos where deleted_at is null order by nome`) as Produto[];
}

export async function getProduto(id: string): Promise<Produto | null> {
  assertUuid(id);
  const rows = (await sql`
    select id, categoria_id, nome, descricao, atributos, preco::float8 as preco, ativo, created_at
      from produtos where id = ${id} and deleted_at is null`) as Produto[];
  return rows[0] ?? null;
}

export async function createProduto(dados: DadosProduto): Promise<string> {
  const rows = (await sql`
    insert into produtos (categoria_id, nome, descricao, atributos, preco, ativo)
    values (${dados.categoria_id}, ${dados.nome}, ${dados.descricao},
            ${JSON.stringify(dados.atributos)}::jsonb, ${dados.preco}, ${dados.ativo})
    returning id`) as { id: string }[];
  return rows[0].id;
}

export async function updateProduto(id: string, dados: DadosProduto): Promise<void> {
  assertUuid(id);
  const rows = (await sql`
    update produtos
       set categoria_id = ${dados.categoria_id}, nome = ${dados.nome}, descricao = ${dados.descricao},
           atributos = ${JSON.stringify(dados.atributos)}::jsonb, preco = ${dados.preco},
           ativo = ${dados.ativo}, updated_at = now()
     where id = ${id} and deleted_at is null
     returning id`) as { id: string }[];
  if (!rows[0]) throw new NotFoundError();
}

export async function softDeleteProduto(id: string): Promise<void> {
  assertUuid(id);
  const rows = (await sql`
    update produtos set deleted_at = now()
     where id = ${id} and deleted_at is null returning id`) as { id: string }[];
  if (!rows[0]) throw new NotFoundError();
}
