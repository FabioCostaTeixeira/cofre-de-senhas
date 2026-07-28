import { sql } from '@/lib/db/client';
import type { Role, User } from '@/lib/types';

type UserRow = User & {
  password_hash: string;
  failed_attempts: number;
  locked_until: string | null;
};

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const rows = (await sql`
    select * from users where email = ${email.toLowerCase()}
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
