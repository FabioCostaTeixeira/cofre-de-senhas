import { randomUUID } from 'node:crypto';
import { sql } from '@/lib/db/client';
import { decrypt, encrypt } from '@/lib/crypto';
import {
  canCreateCredential, canDeleteCredential, canEditCredential, canReadCredential,
  NotFoundError, type CredentialAcl,
} from '@/lib/authz';
import type { Actor, CredentialRow, Room, RoomCard } from '@/lib/types';

/** Salas visíveis: todas para o master, apenas as de que é membro para os demais. */
export async function listRoomsForActor(actor: Actor): Promise<RoomCard[]> {
  const visibilidade = actor.role === 'master' ? null : actor.id;
  return (await sql`
    select r.id, r.name, r.description, r.created_at,
           (select count(*) from credentials c
             where c.room_id = r.id and c.deleted_at is null
               and (${actor.role} = 'master' or c.is_global or c.owner_id = ${actor.id})
           )::int as credential_count,
           (select count(*) from room_members m where m.room_id = r.id)::int as member_count
      from rooms r
     where r.deleted_at is null
       and (${visibilidade}::uuid is null
            or exists (select 1 from room_members m
                        where m.room_id = r.id and m.user_id = ${visibilidade}))
     order by r.name`) as RoomCard[];
}

export async function getRoomForActor(actor: Actor, roomId: string): Promise<Room> {
  const visibilidade = actor.role === 'master' ? null : actor.id;
  const rows = (await sql`
    select r.id, r.name, r.description, r.created_at
      from rooms r
     where r.id = ${roomId} and r.deleted_at is null
       and (${visibilidade}::uuid is null
            or exists (select 1 from room_members m
                        where m.room_id = r.id and m.user_id = ${visibilidade}))`) as Room[];
  if (!rows[0]) throw new NotFoundError('Sala não encontrada');
  return rows[0];
}

export async function isRoomMember(userId: string, roomId: string): Promise<boolean> {
  const rows = (await sql`
    select 1 from room_members where room_id = ${roomId} and user_id = ${userId}`) as unknown[];
  return rows.length > 0;
}

/** Credenciais de uma sala, já filtradas por permissão. `termo` filtra título/usuário/url. */
export async function listCredentials(
  actor: Actor, roomId: string, termo = '',
): Promise<CredentialRow[]> {
  await getRoomForActor(actor, roomId); // 404 se a sala não é visível
  const like = `%${termo.trim()}%`;
  return (await sql`
    select c.id, c.room_id, r.name as room_name, c.title, c.username, c.url,
           c.is_global, c.owner_id, u.name as owner_name, c.updated_at
      from credentials c
      join rooms r on r.id = c.room_id
      join users u on u.id = c.owner_id
     where c.room_id = ${roomId}
       and c.deleted_at is null
       and (${actor.role} = 'master' or c.is_global or c.owner_id = ${actor.id})
       and (${termo.trim()} = '' or c.title ilike ${like}
            or c.username ilike ${like} or c.url ilike ${like})
     order by c.title`) as CredentialRow[];
}

/** Busca global da home: tudo que o ator pode ver, em qualquer sala. */
export async function searchAllCredentials(
  actor: Actor, termo: string,
): Promise<CredentialRow[]> {
  const t = termo.trim();
  if (!t) return [];
  const like = `%${t}%`;
  return (await sql`
    select c.id, c.room_id, r.name as room_name, c.title, c.username, c.url,
           c.is_global, c.owner_id, u.name as owner_name, c.updated_at
      from credentials c
      join rooms r on r.id = c.room_id
      join users u on u.id = c.owner_id
     where c.deleted_at is null and r.deleted_at is null
       and (${actor.role} = 'master'
            or (exists (select 1 from room_members m
                         where m.room_id = c.room_id and m.user_id = ${actor.id})
                and (c.is_global or c.owner_id = ${actor.id})))
       and (c.title ilike ${like} or c.username ilike ${like} or c.url ilike ${like})
     order by c.title limit 50`) as CredentialRow[];
}

/** Card "Minhas senhas": as pessoais do próprio ator, de todas as salas. */
export async function listPersonalCredentials(actor: Actor): Promise<CredentialRow[]> {
  return (await sql`
    select c.id, c.room_id, r.name as room_name, c.title, c.username, c.url,
           c.is_global, c.owner_id, u.name as owner_name, c.updated_at
      from credentials c
      join rooms r on r.id = c.room_id
      join users u on u.id = c.owner_id
     where c.deleted_at is null and r.deleted_at is null
       and c.owner_id = ${actor.id} and c.is_global = false
       -- Master vê as próprias pessoais mesmo sem ser membro da sala (canReadCredential o isenta disso);
       -- para os demais, a sala precisa seguir com o ator como membro atual.
       and (${actor.role} = 'master'
            or exists (select 1 from room_members m
                        where m.room_id = c.room_id and m.user_id = ${actor.id}))
     order by c.title`) as CredentialRow[];
}

type CredentialSecret = CredentialAcl & {
  password_ct: Buffer; password_iv: Buffer; password_tag: Buffer;
};

async function loadForActor(
  actor: Actor, id: string,
): Promise<{ row: CredentialSecret; isMember: boolean }> {
  const rows = (await sql`
    select id, room_id, owner_id, is_global, deleted_at,
           password_ct, password_iv, password_tag
      from credentials where id = ${id}`) as CredentialSecret[];
  const row = rows[0];
  if (!row) throw new NotFoundError('Credencial não encontrada');
  const isMember = await isRoomMember(actor.id, row.room_id);
  return { row, isMember };
}

type CredentialNotes = CredentialAcl & {
  notes_ct: Buffer | null; notes_iv: Buffer | null; notes_tag: Buffer | null;
};

/**
 * Carrega as notas decifradas para preencher o formulário de edição.
 * Nunca devolve a senha — só as notas (string vazia quando não houver).
 */
export async function getCredentialForEdit(
  actor: Actor, id: string,
): Promise<{ notes: string }> {
  const rows = (await sql`
    select id, room_id, owner_id, is_global, deleted_at,
           notes_ct, notes_iv, notes_tag
      from credentials where id = ${id}`) as CredentialNotes[];
  const row = rows[0];
  if (!row) throw new NotFoundError('Credencial não encontrada');
  const isMember = await isRoomMember(actor.id, row.room_id);
  if (!canEditCredential(actor, row, isMember)) throw new NotFoundError();

  if (!row.notes_ct || !row.notes_iv || !row.notes_tag) return { notes: '' };

  const notes = decrypt(
    { ct: Buffer.from(row.notes_ct), iv: Buffer.from(row.notes_iv), tag: Buffer.from(row.notes_tag) },
    row.id,
  );
  return { notes };
}

export async function getCredentialAcl(
  actor: Actor, id: string,
): Promise<{ acl: CredentialAcl; isMember: boolean }> {
  const { row, isMember } = await loadForActor(actor, id);
  if (!canReadCredential(actor, row, isMember)) throw new NotFoundError();
  const { password_ct, password_iv, password_tag, ...acl } = row;
  return { acl, isMember };
}

/** Único caminho pelo qual uma senha em claro sai do banco. */
export async function revealPassword(actor: Actor, id: string): Promise<string> {
  const { row, isMember } = await loadForActor(actor, id);
  if (!canReadCredential(actor, row, isMember)) throw new NotFoundError();
  return decrypt(
    { ct: Buffer.from(row.password_ct), iv: Buffer.from(row.password_iv), tag: Buffer.from(row.password_tag) },
    row.id,
  );
}

export type CredentialInput = {
  roomId: string;
  title: string;
  username: string;
  password: string;
  url: string;
  notes: string;
  isGlobal: boolean;
};

export async function insertCredential(actor: Actor, input: CredentialInput): Promise<string> {
  // A sala precisa existir e não estar na lixeira, para qualquer ator (inclusive o master).
  const rooms = (await sql`
    select 1 from rooms where id = ${input.roomId} and deleted_at is null`) as unknown[];
  if (!rooms[0]) throw new NotFoundError('Sala não encontrada');

  const isMember = await isRoomMember(actor.id, input.roomId);
  if (!canCreateCredential(actor, isMember)) throw new NotFoundError('Sala não encontrada');

  const id = randomUUID();
  const senha = encrypt(input.password, id);
  const notas = input.notes ? encrypt(input.notes, id) : null;

  await sql`
    insert into credentials (
      id, room_id, title, username, password_ct, password_iv, password_tag,
      url, notes_ct, notes_iv, notes_tag, is_global, owner_id)
    values (
      ${id}, ${input.roomId}, ${input.title}, ${input.username || null},
      ${senha.ct}, ${senha.iv}, ${senha.tag},
      ${input.url || null}, ${notas?.ct ?? null}, ${notas?.iv ?? null}, ${notas?.tag ?? null},
      ${input.isGlobal}, ${actor.id})`;
  return id;
}

/** Senha em branco no formulário significa "manter a senha atual". */
export async function updateCredential(
  actor: Actor, id: string, input: CredentialInput,
): Promise<void> {
  const { row, isMember } = await loadForActor(actor, id);
  if (!canEditCredential(actor, row, isMember)) throw new NotFoundError();

  const notas = input.notes ? encrypt(input.notes, id) : null;

  if (input.password) {
    const senha = encrypt(input.password, id);
    await sql`
      update credentials
         set title = ${input.title}, username = ${input.username || null},
             url = ${input.url || null}, is_global = ${input.isGlobal},
             password_ct = ${senha.ct}, password_iv = ${senha.iv}, password_tag = ${senha.tag},
             notes_ct = ${notas?.ct ?? null}, notes_iv = ${notas?.iv ?? null},
             notes_tag = ${notas?.tag ?? null}, updated_at = now()
       where id = ${id}`;
    return;
  }

  await sql`
    update credentials
       set title = ${input.title}, username = ${input.username || null},
           url = ${input.url || null}, is_global = ${input.isGlobal},
           notes_ct = ${notas?.ct ?? null}, notes_iv = ${notas?.iv ?? null},
           notes_tag = ${notas?.tag ?? null}, updated_at = now()
     where id = ${id}`;
}

export async function softDeleteCredential(actor: Actor, id: string): Promise<void> {
  const { row, isMember } = await loadForActor(actor, id);
  if (!canDeleteCredential(actor, row, isMember)) throw new NotFoundError();
  await sql`update credentials set deleted_at = now() where id = ${id}`;
}

/* ---------- Salas (somente master; a checagem fica nas Server Actions) ---------- */

export async function listAllRooms(): Promise<RoomCard[]> {
  return (await sql`
    select r.id, r.name, r.description, r.created_at,
           (select count(*) from credentials c
             where c.room_id = r.id and c.deleted_at is null)::int as credential_count,
           (select count(*) from room_members m where m.room_id = r.id)::int as member_count
      from rooms r where r.deleted_at is null order by r.name`) as RoomCard[];
}

export async function createRoom(
  createdBy: string, name: string, description: string,
): Promise<string> {
  const rows = (await sql`
    insert into rooms (name, description, created_by)
    values (${name}, ${description || null}, ${createdBy}) returning id`) as { id: string }[];
  return rows[0].id;
}

export async function updateRoom(id: string, name: string, description: string): Promise<void> {
  await sql`
    update rooms set name = ${name}, description = ${description || null}, updated_at = now()
     where id = ${id}`;
}

export async function softDeleteRoom(id: string): Promise<void> {
  await sql`update rooms set deleted_at = now() where id = ${id}`;
}

export async function listRoomMembers(roomId: string): Promise<string[]> {
  const rows = (await sql`
    select user_id from room_members where room_id = ${roomId}`) as { user_id: string }[];
  return rows.map((r) => r.user_id);
}

/**
 * Substitui o conjunto de membros da sala numa única transação: remove só quem saiu
 * e insere só quem entrou, para nunca haver um instante em que a sala fique sem
 * nenhum membro (o que negaria acesso a todo mundo via `isRoomMember`/`listRoomsForActor`).
 */
export async function setRoomMembers(roomId: string, userIds: string[]): Promise<void> {
  await sql.transaction([
    sql`delete from room_members
         where room_id = ${roomId} and user_id <> all(${userIds}::uuid[])`,
    sql`insert into room_members (room_id, user_id)
         select ${roomId}, u.id from unnest(${userIds}::uuid[]) as u(id)
         on conflict do nothing`,
  ]);
}

/* ---------- Lixeira (somente master) ---------- */

export type TrashItem = {
  id: string;
  kind: 'credential' | 'room';
  title: string;
  room_name: string | null;
  deleted_at: string;
};

export async function listTrash(): Promise<TrashItem[]> {
  return (await sql`
    select c.id, 'credential' as kind, c.title, r.name as room_name, c.deleted_at
      from credentials c join rooms r on r.id = c.room_id
     where c.deleted_at is not null
    union all
    select r.id, 'room' as kind, r.name as title, null as room_name, r.deleted_at
      from rooms r where r.deleted_at is not null
     order by deleted_at desc`) as TrashItem[];
}

export async function restoreItem(kind: 'credential' | 'room', id: string): Promise<void> {
  if (kind === 'credential') {
    await sql`update credentials set deleted_at = null where id = ${id}`;
  } else {
    await sql`update rooms set deleted_at = null where id = ${id}`;
  }
}

export async function purgeItem(kind: 'credential' | 'room', id: string): Promise<void> {
  if (kind === 'credential') {
    await sql`delete from credentials where id = ${id} and deleted_at is not null`;
  } else {
    // A sala só pode ser expurgada se já estiver na lixeira; a subconsulta reaplica
    // essa mesma guarda ao delete de credenciais, para uma sala ativa jamais perder
    // credenciais aqui (Server Action é endpoint HTTP, invocável com qualquer id).
    // As duas instruções rodam numa única transação não-interativa do driver.
    await sql.transaction([
      sql`delete from credentials
           where room_id = (select id from rooms where id = ${id} and deleted_at is not null)`,
      sql`delete from rooms where id = ${id} and deleted_at is not null`,
    ]);
  }
}
