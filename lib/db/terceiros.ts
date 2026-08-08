import { sql } from '@/lib/db/client';
import { NotFoundError } from '@/lib/authz';
import { assertUuid } from '@/lib/validation';
import type { DadosTerceiro, Terceiro, TipoTerceiro } from '@/lib/types';

/**
 * `tabela` é sempre um dos dois literais do union `TipoTerceiro`, escolhido
 * pelo próprio código de cada rota (`/cadastros/clientes` chama sempre com
 * `'clientes'`) — nunca vem de formulário nem de qualquer entrada externa.
 * `sql.unsafe` só é seguro aqui por isso: não é interpolação de identificador
 * a partir de input do usuário.
 */
function nomeTabela(tabela: TipoTerceiro) {
  return sql.unsafe(tabela);
}

export async function listTerceiros(tabela: TipoTerceiro): Promise<Terceiro[]> {
  const t = nomeTabela(tabela);
  return (await sql`
    select id, nome, contato_responsavel, email, telefone, cidade, uf, created_at
      from ${t}
     where deleted_at is null
     order by nome`) as Terceiro[];
}

export async function getTerceiro(tabela: TipoTerceiro, id: string): Promise<Terceiro | null> {
  assertUuid(id);
  const t = nomeTabela(tabela);
  const rows = (await sql`
    select id, nome, contato_responsavel, email, telefone, cidade, uf, created_at
      from ${t}
     where id = ${id} and deleted_at is null`) as Terceiro[];
  return rows[0] ?? null;
}

export async function createTerceiro(tabela: TipoTerceiro, dados: DadosTerceiro): Promise<string> {
  const t = nomeTabela(tabela);
  const rows = (await sql`
    insert into ${t} (nome, contato_responsavel, email, telefone, cidade, uf)
    values (${dados.nome}, ${dados.contato_responsavel}, ${dados.email}, ${dados.telefone},
            ${dados.cidade}, ${dados.uf})
    returning id`) as { id: string }[];
  return rows[0].id;
}

export async function updateTerceiro(
  tabela: TipoTerceiro, id: string, dados: DadosTerceiro,
): Promise<void> {
  assertUuid(id);
  const t = nomeTabela(tabela);
  const rows = (await sql`
    update ${t}
       set nome = ${dados.nome}, contato_responsavel = ${dados.contato_responsavel},
           email = ${dados.email}, telefone = ${dados.telefone}, cidade = ${dados.cidade},
           uf = ${dados.uf}, updated_at = now()
     where id = ${id} and deleted_at is null
     returning id`) as { id: string }[];
  if (!rows[0]) throw new NotFoundError();
}

export async function softDeleteTerceiro(tabela: TipoTerceiro, id: string): Promise<void> {
  assertUuid(id);
  const t = nomeTabela(tabela);
  const rows = (await sql`
    update ${t} set deleted_at = now()
     where id = ${id} and deleted_at is null
     returning id`) as { id: string }[];
  if (!rows[0]) throw new NotFoundError();
}
