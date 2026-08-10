import { randomUUID } from 'node:crypto';
import { sql } from '@/lib/db/client';
import { NotFoundError } from '@/lib/authz';
import { assertUuid } from '@/lib/validation';
import type { DadosLocal, LocalGravacao } from '@/lib/types';

// A mesma consulta se repete nas duas funções abaixo (`listLocais`/`getLocal`), em vez
// de virar uma constante compartilhada: o tagged template `sql\`...\`` deste driver não
// é composable — `sql\`${outraQuery} where ...\`` tentaria bindar a query como
// parâmetro, não colar o texto SQL dela (mesmo problema já documentado no módulo
// Produtos, `lib/db/produtos.ts`).
export async function listLocais(): Promise<LocalGravacao[]> {
  return (await sql`
    select l.id, l.nome, l.endereco, l.responsavel, l.created_at,
           coalesce(
             json_agg(
               json_build_object('id', e.id, 'local_id', e.local_id, 'nome', e.nome, 'created_at', e.created_at)
               order by e.nome
             ) filter (where e.id is not null), '[]'
           ) as estudios
      from locais_gravacao l
      left join estudios e on e.local_id = l.id and e.deleted_at is null
     where l.deleted_at is null
     group by l.id
     order by l.nome`) as LocalGravacao[];
}

export async function getLocal(id: string): Promise<LocalGravacao | null> {
  assertUuid(id);
  const rows = (await sql`
    select l.id, l.nome, l.endereco, l.responsavel, l.created_at,
           coalesce(
             json_agg(
               json_build_object('id', e.id, 'local_id', e.local_id, 'nome', e.nome, 'created_at', e.created_at)
               order by e.nome
             ) filter (where e.id is not null), '[]'
           ) as estudios
      from locais_gravacao l
      left join estudios e on e.local_id = l.id and e.deleted_at is null
     where l.id = ${id} and l.deleted_at is null
     group by l.id`) as LocalGravacao[];
  return rows[0] ?? null;
}

export async function createLocal(dados: DadosLocal): Promise<string> {
  const id = randomUUID();
  await sql.transaction([
    sql`insert into locais_gravacao (id, nome, endereco, responsavel)
        values (${id}, ${dados.nome}, ${dados.endereco}, ${dados.responsavel})`,
    ...dados.estudios.map((e) => sql`
      insert into estudios (id, local_id, nome) values (${randomUUID()}, ${id}, ${e.nome})`),
  ]);
  return id;
}

/**
 * Diferente de `updateCombo`/`updatePlano` (que apagam e reinserem todos os itens a
 * cada save): aqui o `id` do estúdio precisa sobreviver a uma edição, porque a Agenda
 * (spec futura) vai referenciar `estudio_id`. Por isso o update é um diff:
 * - item com `id`: `update` (renomeia);
 * - item sem `id`: `insert` (novo estúdio);
 * - estúdio existente cujo `id` não aparece na lista enviada: soft-delete.
 */
export async function updateLocal(id: string, dados: DadosLocal): Promise<void> {
  assertUuid(id);
  if (!(await getLocal(id))) throw new NotFoundError();

  const existentes = dados.estudios.filter((e): e is { id: string; nome: string } => Boolean(e.id));
  const novos = dados.estudios
    .filter((e) => !e.id)
    .map((e) => ({ id: randomUUID(), nome: e.nome }));
  // Os ids recém-gerados pros novos entram aqui também: sem isso, o soft-delete final
  // (que roda na mesma transação) apagaria de volta o estúdio que acabou de ser
  // inserido, por não reconhecer o id dele como "enviado".
  const idsEnviados = [...existentes.map((e) => e.id), ...novos.map((e) => e.id)];

  await sql.transaction([
    sql`update locais_gravacao
           set nome = ${dados.nome}, endereco = ${dados.endereco}, responsavel = ${dados.responsavel},
               updated_at = now()
         where id = ${id}`,
    ...existentes.map((e) => sql`update estudios set nome = ${e.nome}, updated_at = now() where id = ${e.id}`),
    ...novos.map((e) => sql`insert into estudios (id, local_id, nome) values (${e.id}, ${id}, ${e.nome})`),
    sql`update estudios set deleted_at = now()
         where local_id = ${id} and deleted_at is null and id <> all(${idsEnviados}::uuid[])`,
  ]);
}

export async function softDeleteLocal(id: string): Promise<void> {
  assertUuid(id);
  const rows = (await sql`
    update locais_gravacao set deleted_at = now()
     where id = ${id} and deleted_at is null
     returning id`) as { id: string }[];
  if (!rows[0]) throw new NotFoundError();
}
