import { randomUUID } from 'node:crypto';
import { sql } from '@/lib/db/client';
import { decrypt, encrypt } from '@/lib/crypto';
import {
  canCreateCredential, canDeleteCredential, canEditCredential, canReadCredential,
  NotFoundError, type CredentialAcl,
} from '@/lib/authz';
import { assertUuid } from '@/lib/validation';
import type { Actor, CredentialRow, Room, RoomCard } from '@/lib/types';

/** Salas visíveis: todas para o master, apenas as de que é membro para os demais. */
export async function listRoomsForActor(actor: Actor): Promise<RoomCard[]> {
  const visibilidade = actor.role === 'master' ? null : actor.id;
  return (await sql`
    select r.id, r.name, r.description, r.created_at,
           (select count(*) from credentials c
             where c.room_id = r.id and c.deleted_at is null
               and (${actor.role} = 'master' or c.is_global or c.owner_id = ${actor.id})
           )::int as credential_count
      from rooms r
     where r.deleted_at is null
       and (${visibilidade}::uuid is null
            or exists (select 1 from room_members m
                        where m.room_id = r.id and m.user_id = ${visibilidade}))
     order by r.name`) as RoomCard[];
}

export async function getRoomForActor(actor: Actor, roomId: string): Promise<Room> {
  assertUuid(roomId);
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
       and (${actor.role} = 'master' or c.is_global or c.owner_id = ${actor.id}
            or exists (select 1 from credential_shares s
                        where s.credential_id = c.id and s.user_id = ${actor.id}))
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
                and (c.is_global or c.owner_id = ${actor.id}
                     or exists (select 1 from credential_shares s
                                 where s.credential_id = c.id and s.user_id = ${actor.id}))))
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
  assertUuid(id);
  const rows = (await sql`
    select c.id, c.room_id, c.owner_id, c.is_global, c.deleted_at, r.deleted_at as room_deleted_at,
           exists (select 1 from credential_shares s
                    where s.credential_id = c.id and s.user_id = ${actor.id}) as shared_with_actor,
           c.password_ct, c.password_iv, c.password_tag
      from credentials c
      join rooms r on r.id = c.room_id
     where c.id = ${id}`) as CredentialSecret[];
  const row = rows[0];
  if (!row) throw new NotFoundError('Credencial não encontrada');
  const isMember = await isRoomMember(actor.id, row.room_id);
  return { row, isMember };
}

type CredentialNotes = CredentialAcl & CredentialRow & {
  notes_ct: Buffer | null; notes_iv: Buffer | null; notes_tag: Buffer | null;
};

/**
 * Carrega a credencial (para preencher o formulário de edição) independentemente
 * de qualquer termo de busca em vigor na tela — buscar por id direto no banco, em
 * vez de procurar dentro da lista já filtrada, evita que um filtro ativo que não
 * inclua a credencial em edição derrube o formulário sem explicação.
 * Nunca devolve a senha — só as notas decifradas (string vazia quando não houver).
 */
export async function getCredentialForEdit(
  actor: Actor, id: string,
): Promise<{ row: CredentialRow; notes: string; compartilhadaCom: string[] }> {
  assertUuid(id);
  const rows = (await sql`
    select c.id, c.room_id, r.name as room_name, c.title, c.username, c.url,
           c.is_global, c.owner_id, u.name as owner_name, c.updated_at,
           c.deleted_at, r.deleted_at as room_deleted_at,
           c.notes_ct, c.notes_iv, c.notes_tag
      from credentials c
      join rooms r on r.id = c.room_id
      join users u on u.id = c.owner_id
     where c.id = ${id}`) as CredentialNotes[];
  const row = rows[0];
  if (!row) throw new NotFoundError('Credencial não encontrada');
  const isMember = await isRoomMember(actor.id, row.room_id);
  if (!canEditCredential(actor, row, isMember)) throw new NotFoundError();

  const {
    notes_ct, notes_iv, notes_tag, deleted_at, room_deleted_at, ...credRow
  } = row;
  const notes = (!notes_ct || !notes_iv || !notes_tag) ? '' : decrypt(
    { ct: Buffer.from(notes_ct), iv: Buffer.from(notes_iv), tag: Buffer.from(notes_tag) },
    `${row.id}:notes`,
  );
  const compartilhadaCom = await listCredentialShares(row.id);
  return { row: credRow, notes, compartilhadaCom };
}

/** Único caminho pelo qual uma senha em claro sai do banco. */
export async function revealPassword(actor: Actor, id: string): Promise<string> {
  const { row, isMember } = await loadForActor(actor, id);
  if (!canReadCredential(actor, row, isMember)) throw new NotFoundError();
  return decrypt(
    { ct: Buffer.from(row.password_ct), iv: Buffer.from(row.password_iv), tag: Buffer.from(row.password_tag) },
    `${row.id}:password`,
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
  /**
   * Quem mais, entre os membros da sala, enxerga esta senha. Só vale quando
   * `isGlobal` é falso — senha global já é de toda a sala, e manter uma lista
   * pendurada nela deixaria acesso fantasma se ela voltasse a ser restrita.
   */
  compartilharCom?: string[];
};

/**
 * Grava a lista de compartilhamento numa única transação.
 *
 * Só entra quem é membro da sala **no momento da gravação**: compartilhar com
 * alguém de fora criaria uma linha que nenhuma listagem honraria, já que a
 * autorização exige associação à sala antes de olhar para o compartilhamento.
 * O dono nunca entra na lista — ele já enxerga por ser dono.
 */
async function definirCompartilhamento(
  credentialId: string, roomId: string, ownerId: string,
  isGlobal: boolean, userIds: string[],
): Promise<void> {
  const alvos = isGlobal ? [] : userIds.filter((u) => u !== ownerId);
  alvos.forEach(assertUuid);

  await sql.transaction([
    sql`delete from credential_shares
         where credential_id = ${credentialId} and user_id <> all(${alvos}::uuid[])`,
    sql`insert into credential_shares (credential_id, user_id)
         select ${credentialId}, m.user_id
           from room_members m
          where m.room_id = ${roomId} and m.user_id = any(${alvos}::uuid[])
         on conflict do nothing`,
  ]);
}

/** Os ids com quem a credencial está compartilhada hoje. */
export async function listCredentialShares(credentialId: string): Promise<string[]> {
  assertUuid(credentialId);
  const rows = (await sql`
    select user_id from credential_shares
     where credential_id = ${credentialId}`) as { user_id: string }[];
  return rows.map((r) => r.user_id);
}

/** Membros da sala, com nome — alimenta a escolha de quem enxerga a senha. */
export async function listRoomMembersDetailed(
  roomId: string,
): Promise<{ id: string; name: string }[]> {
  assertUuid(roomId);
  return (await sql`
    select u.id, u.name
      from room_members m
      join users u on u.id = m.user_id
     where m.room_id = ${roomId} and u.is_active = true
     order by u.name`) as { id: string; name: string }[];
}

export async function insertCredential(actor: Actor, input: CredentialInput): Promise<string> {
  // O roomId vem do formulário: sem isso, um id malformado derruba a query com erro do Postgres.
  assertUuid(input.roomId);
  // A sala precisa existir e não estar na lixeira, para qualquer ator (inclusive o master).
  const rooms = (await sql`
    select 1 from rooms where id = ${input.roomId} and deleted_at is null`) as unknown[];
  if (!rooms[0]) throw new NotFoundError('Sala não encontrada');

  const isMember = await isRoomMember(actor.id, input.roomId);
  if (!canCreateCredential(actor, isMember)) throw new NotFoundError('Sala não encontrada');

  const id = randomUUID();
  const senha = encrypt(input.password, `${id}:password`);
  const notas = input.notes ? encrypt(input.notes, `${id}:notes`) : null;

  await sql`
    insert into credentials (
      id, room_id, title, username, password_ct, password_iv, password_tag,
      url, notes_ct, notes_iv, notes_tag, is_global, owner_id)
    values (
      ${id}, ${input.roomId}, ${input.title}, ${input.username || null},
      ${senha.ct}, ${senha.iv}, ${senha.tag},
      ${input.url || null}, ${notas?.ct ?? null}, ${notas?.iv ?? null}, ${notas?.tag ?? null},
      ${input.isGlobal}, ${actor.id})`;

  await definirCompartilhamento(
    id, input.roomId, actor.id, input.isGlobal, input.compartilharCom ?? [],
  );
  return id;
}

/**
 * Senha em branco no formulário significa "manter a senha atual".
 * Se `input.roomId` for diferente da sala atual, a credencial é movida de fato —
 * validando a sala de destino do mesmo jeito que `insertCredential` valida.
 * Devolve `roomChanged` para a action registrar a mudança de sala no audit.
 */
export async function updateCredential(
  actor: Actor, id: string, input: CredentialInput,
): Promise<{ roomChanged: boolean }> {
  const { row, isMember } = await loadForActor(actor, id);
  if (!canEditCredential(actor, row, isMember)) throw new NotFoundError();

  assertUuid(input.roomId);
  const roomChanged = input.roomId !== row.room_id;
  if (roomChanged) {
    const rooms = (await sql`
      select 1 from rooms where id = ${input.roomId} and deleted_at is null`) as unknown[];
    if (!rooms[0]) throw new NotFoundError('Sala não encontrada');

    const isMemberDestino = await isRoomMember(actor.id, input.roomId);
    if (!canCreateCredential(actor, isMemberDestino)) throw new NotFoundError('Sala não encontrada');
  }

  const notas = input.notes ? encrypt(input.notes, `${id}:notes`) : null;

  if (input.password) {
    const senha = encrypt(input.password, `${id}:password`);
    await sql`
      update credentials
         set title = ${input.title}, username = ${input.username || null},
             url = ${input.url || null}, is_global = ${input.isGlobal}, room_id = ${input.roomId},
             password_ct = ${senha.ct}, password_iv = ${senha.iv}, password_tag = ${senha.tag},
             notes_ct = ${notas?.ct ?? null}, notes_iv = ${notas?.iv ?? null},
             notes_tag = ${notas?.tag ?? null}, updated_at = now()
       where id = ${id}`;
    await definirCompartilhamento(
      id, input.roomId, row.owner_id, input.isGlobal, input.compartilharCom ?? [],
    );
    return { roomChanged };
  }

  await sql`
    update credentials
       set title = ${input.title}, username = ${input.username || null},
           url = ${input.url || null}, is_global = ${input.isGlobal}, room_id = ${input.roomId},
           notes_ct = ${notas?.ct ?? null}, notes_iv = ${notas?.iv ?? null},
           notes_tag = ${notas?.tag ?? null}, updated_at = now()
     where id = ${id}`;

  // Reavalia o compartilhamento depois do update: se a credencial mudou de sala,
  // quem ficou para trás deixa de ser membro do destino e é removido aqui.
  await definirCompartilhamento(
    id, input.roomId, row.owner_id, input.isGlobal, input.compartilharCom ?? [],
  );
  return { roomChanged };
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
             where c.room_id = r.id and c.deleted_at is null)::int as credential_count
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

/** As salas de que um usuário é membro. Espelho de `listRoomMembers`, pelo outro lado. */
export async function listRoomsOfUser(userId: string): Promise<string[]> {
  const rows = (await sql`
    select m.room_id
      from room_members m
      join rooms r on r.id = m.room_id
     where m.user_id = ${userId} and r.deleted_at is null`) as { room_id: string }[];
  return rows.map((r) => r.room_id);
}

/**
 * Substitui as salas de um usuário numa única transação — o acesso passou a ser
 * concedido na tela do usuário, porque salas costumam ser muito mais numerosas
 * que pessoas. Remove só o que saiu e insere só o que entrou, para não haver
 * instante em que o usuário fique sem nenhuma sala.
 *
 * Salas na lixeira são ignoradas no insert: conceder acesso a uma sala apagada
 * criaria uma associação que nenhuma listagem mostraria.
 */
export async function setUserRooms(userId: string, roomIds: string[]): Promise<void> {
  await sql.transaction([
    sql`delete from room_members
         where user_id = ${userId} and room_id <> all(${roomIds}::uuid[])`,
    sql`insert into room_members (room_id, user_id)
         select r.id, ${userId} from rooms r
          where r.id = any(${roomIds}::uuid[]) and r.deleted_at is null
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
  /**
   * Só preenchido para `kind === 'room'`: quantas credenciais daquela sala (na
   * lixeira ou não) serão destruídas junto se a sala for expurgada. `null` para
   * itens do tipo `credential`, onde o expurgo não arrasta mais nada.
   */
  credential_count: number | null;
};

export async function listTrash(): Promise<TrashItem[]> {
  return (await sql`
    select c.id, 'credential' as kind, c.title, r.name as room_name, c.deleted_at,
           null::int as credential_count
      from credentials c join rooms r on r.id = c.room_id
     where c.deleted_at is not null
    union all
    select r.id, 'room' as kind, r.name as title, null as room_name, r.deleted_at,
           (select count(*) from credentials c2 where c2.room_id = r.id)::int as credential_count
      from rooms r where r.deleted_at is not null
     order by deleted_at desc`) as TrashItem[];
}

/** Restaurar uma credencial cuja sala ainda está na lixeira devolveria um item que
 *  não aparece em nenhuma listagem (a sala apagada corta o acesso a tudo dentro
 *  dela). `restoreItem` recusa esse caso em vez de restaurar silenciosamente. */
export class RoomTrashedError extends Error {
  constructor() {
    super('A sala desta senha ainda está na lixeira. Restaure a sala antes de restaurar a senha.');
  }
}

export async function restoreItem(kind: 'credential' | 'room', id: string): Promise<void> {
  assertUuid(id);
  if (kind === 'credential') {
    const rows = (await sql`
      select r.deleted_at as room_deleted_at
        from credentials c join rooms r on r.id = c.room_id
       where c.id = ${id}`) as { room_deleted_at: string | null }[];
    if (!rows[0]) throw new NotFoundError('Senha não encontrada');
    if (rows[0].room_deleted_at) throw new RoomTrashedError();
    await sql`update credentials set deleted_at = null where id = ${id}`;
  } else {
    await sql`update rooms set deleted_at = null where id = ${id}`;
  }
}

export async function purgeItem(kind: 'credential' | 'room', id: string): Promise<void> {
  assertUuid(id);
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

/* ---------- Módulos externos (permissão por usuário) ---------- */

/** Os módulos a que um usuário tem acesso explícito. Master não entra aqui — bypassa em código. */
export async function listModulesOfUser(userId: string): Promise<string[]> {
  const rows = (await sql`
    select module_key from module_access where user_id = ${userId}`) as { module_key: string }[];
  return rows.map((r) => r.module_key);
}

/**
 * Substitui o conjunto de módulos de um usuário numa única transação, espelhando
 * `setUserRooms`: remove só o que saiu, insere só o que entrou. `grantedBy` é o id
 * do master que fez a alteração (vai pra `module_access.granted_by`).
 */
export async function setUserModules(
  userId: string, grantedBy: string, moduleKeys: string[],
): Promise<void> {
  await sql.transaction([
    sql`delete from module_access
         where user_id = ${userId} and module_key <> all(${moduleKeys}::text[])`,
    sql`insert into module_access (user_id, module_key, granted_by)
         select ${userId}, m, ${grantedBy} from unnest(${moduleKeys}::text[]) as m
         on conflict do nothing`,
  ]);
}
