'use server';

import { revalidatePath } from 'next/cache';
import { requireMaster } from '@/lib/auth/guards';
import { isUuid } from '@/lib/validation';
import { audit } from '@/lib/db/audit';
import {
  createRoom, listRoomMembers, setRoomMembers, softDeleteRoom, updateRoom,
} from '@/lib/db/queries';

export type SalaState = { error?: string; ok?: string };

export async function saveRoom(_prev: SalaState, formData: FormData): Promise<SalaState> {
  const actor = await requireMaster();
  const id = String(formData.get('id') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  if (!name) return { error: 'Informe o nome da sala.' };
  if (id && !isUuid(id)) return { error: 'Sala não encontrada.' };

  if (id) {
    await updateRoom(id, name, description);
    await audit({ actorId: actor.id, action: 'room_update', entityType: 'room', entityId: id,
                  metadata: { name } });
  } else {
    const novoId = await createRoom(actor.id, name, description);
    await audit({ actorId: actor.id, action: 'room_create', entityType: 'room', entityId: novoId,
                  metadata: { name } });
  }

  revalidatePath('/admin/salas');
  revalidatePath('/');
  return { ok: 'Sala salva.' };
}

export async function deleteRoom(_prev: SalaState, formData: FormData): Promise<SalaState> {
  const actor = await requireMaster();
  const id = String(formData.get('id') ?? '');
  if (!isUuid(id)) return { error: 'Sala não encontrada.' };
  await softDeleteRoom(id);
  await audit({ actorId: actor.id, action: 'room_delete', entityType: 'room', entityId: id });
  revalidatePath('/admin/salas');
  revalidatePath('/');
  return { ok: 'Sala movida para a lixeira.' };
}

export async function saveMembers(_prev: SalaState, formData: FormData): Promise<SalaState> {
  const actor = await requireMaster();
  const roomId = String(formData.get('roomId') ?? '');
  if (!isUuid(roomId)) return { error: 'Sala não encontrada.' };
  // Ids de usuário fora do formato uuid são descartados em vez de derrubar a query
  // (`unnest(...::uuid[])` lançaria erro de sintaxe do Postgres em vez de 404).
  const userIds = formData.getAll('userIds').map(String).filter(isUuid);

  const antes = await listRoomMembers(roomId);
  await setRoomMembers(roomId, userIds);

  // Registra o que de fato mudou — quem entrou e quem saiu — em vez de sempre
  // gravar 'member_add' com só o total, para permitir rastrear perda de acesso.
  const antesSet = new Set(antes);
  const depoisSet = new Set(userIds);
  const adicionados = userIds.filter((id) => !antesSet.has(id));
  const removidos = antes.filter((id) => !depoisSet.has(id));

  if (adicionados.length > 0) {
    await audit({ actorId: actor.id, action: 'member_add', entityType: 'room', entityId: roomId,
                  metadata: { userIds: adicionados } });
  }
  if (removidos.length > 0) {
    await audit({ actorId: actor.id, action: 'member_remove', entityType: 'room', entityId: roomId,
                  metadata: { userIds: removidos } });
  }

  revalidatePath('/admin/salas');
  revalidatePath('/');
  return { ok: 'Membros atualizados.' };
}
