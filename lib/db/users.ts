import { sql } from '@/lib/db/client';
import type { Role, User, UserComContato } from '@/lib/types';

type UserRow = User & {
  password_hash: string;
  failed_attempts: number;
  locked_until: string | null;
};

/**
 * Login ignora vínculo encerrado. Depois de uma readmissão existem duas linhas com o
 * mesmo e-mail; sem este filtro a função devolveria `rows[0]`, que poderia ser a conta
 * antiga — quebrando o login da atual em silêncio, sem erro e sem log.
 */
export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const rows = (await sql`
    select * from users
     where email = ${email.toLowerCase()} and data_demissao is null
  `) as UserRow[];
  return rows[0] ?? null;
}

export async function findUserById(id: string): Promise<UserRow | null> {
  const rows = (await sql`select * from users where id = ${id}`) as UserRow[];
  return rows[0] ?? null;
}

export async function listUsers(): Promise<User[]> {
  return (await sql`
    select id, email, name, role, is_active, must_change_password, created_at
    from users order by name
  `) as User[];
}

export async function registerFailedLogin(id: string): Promise<void> {
  // Se locked_until já expirou (passado), a contagem recomeça do zero: a tentativa
  // em curso vale 1 e o bloqueio anterior é limpo. Caso contrário, mantém a janela
  // normal de 5 tentativas em 15 minutos.
  await sql`
    update users
       set failed_attempts = case when locked_until is not null and locked_until <= now()
                                   then 1
                                   else failed_attempts + 1 end,
           locked_until = case when locked_until is not null and locked_until <= now()
                                then null
                                when failed_attempts + 1 >= 5
                                then now() + interval '15 minutes'
                                else locked_until end,
           updated_at = now()
     where id = ${id}`;
}

export async function clearFailedLogins(id: string): Promise<void> {
  await sql`
    update users set failed_attempts = 0, locked_until = null, updated_at = now()
     where id = ${id}`;
}

export async function setPassword(id: string, hash: string, mustChange: boolean): Promise<void> {
  await sql`
    update users
       set password_hash = ${hash}, must_change_password = ${mustChange},
           failed_attempts = 0, locked_until = null, updated_at = now()
     where id = ${id}`;
}

export async function createUser(
  email: string, name: string, hash: string, role: Role,
): Promise<string> {
  const rows = (await sql`
    insert into users (email, name, password_hash, role, must_change_password)
    values (${email.toLowerCase()}, ${name}, ${hash}, ${role}, true)
    returning id`) as { id: string }[];
  return rows[0].id;
}

export async function updateUser(
  id: string, name: string, role: Role, isActive: boolean,
): Promise<void> {
  await sql`
    update users set name = ${name}, role = ${role}, is_active = ${isActive}, updated_at = now()
     where id = ${id}`;
}

/** Linha da grid. Não traz nenhum blob cifrado — documento só sai pela action de revelar. */
export async function listUsersComContato(
  incluirDesligados: boolean,
): Promise<UserComContato[]> {
  return (await sql`
    select u.id, u.email, u.name, u.role, u.is_active, u.must_change_password,
           u.created_at, u.pessoa_id, u.data_contratacao, u.data_demissao,
           p.telefone
      from users u
      join pessoas p on p.id = u.pessoa_id
     where ${incluirDesligados} or u.data_demissao is null
     order by u.data_demissao nulls first, u.name`) as UserComContato[];
}

export async function getUserComContato(id: string): Promise<UserComContato | null> {
  const rows = (await sql`
    select u.id, u.email, u.name, u.role, u.is_active, u.must_change_password,
           u.created_at, u.pessoa_id, u.data_contratacao, u.data_demissao,
           p.telefone
      from users u
      join pessoas p on p.id = u.pessoa_id
     where u.id = ${id}`) as UserComContato[];
  return rows[0] ?? null;
}

/** Passagens anteriores da mesma pessoa, para o histórico do modal. */
export type VinculoResumo = {
  id: string;
  name: string;
  email: string;
  data_contratacao: string | null;
  data_demissao: string | null;
};

export async function listVinculosDaPessoa(pessoaId: string): Promise<VinculoResumo[]> {
  return (await sql`
    select id, name, email, data_contratacao, data_demissao
      from users where pessoa_id = ${pessoaId}
     order by data_contratacao nulls last, created_at`) as VinculoResumo[];
}

/**
 * Cria pessoa e vínculo numa transação. `pessoaId` vem pronto de quem chama:
 * `sql.transaction([...])` do Neon recebe um array de queries e não é interativo,
 * então não existe "insert ... returning id" utilizável no meio dela — e o AAD da
 * cifragem depende do id existir antes.
 *
 * Passar `pessoaId` de uma pessoa que já existe é o caminho da readmissão: cria só o
 * vínculo novo, apontando para ela.
 */
export async function createUserComPessoa(args: {
  userId: string;
  pessoaId: string;
  pessoaJaExiste: boolean;
  email: string;
  name: string;
  hash: string;
  role: Role;
  dataContratacao: string | null;
}): Promise<void> {
  const queries = [];
  if (!args.pessoaJaExiste) {
    queries.push(sql`insert into pessoas (id) values (${args.pessoaId})`);
  }
  queries.push(sql`
    insert into users (id, email, name, password_hash, role, must_change_password,
                       pessoa_id, data_contratacao)
    values (${args.userId}, ${args.email.toLowerCase()}, ${args.name}, ${args.hash},
            ${args.role}, true, ${args.pessoaId}, ${args.dataContratacao})`);
  await sql.transaction(queries);
}

/**
 * Atualiza o vínculo. Gravar `data_demissao` desativa o acesso na MESMA transação: o
 * risco concreto é alguém sair da empresa e seguir com acesso ao cofre porque ninguém
 * lembrou de desmarcar "ativo". Limpar a data não reativa — reativar é decisão
 * consciente, feita na caixa "ativo".
 */
export async function updateVinculo(args: {
  id: string;
  name: string;
  role: Role;
  isActive: boolean;
  dataContratacao: string | null;
  dataDemissao: string | null;
}): Promise<void> {
  const ativo = args.dataDemissao ? false : args.isActive;
  await sql`
    update users
       set name = ${args.name}, role = ${args.role}, is_active = ${ativo},
           data_contratacao = ${args.dataContratacao},
           data_demissao = ${args.dataDemissao}, updated_at = now()
     where id = ${args.id}`;
}
