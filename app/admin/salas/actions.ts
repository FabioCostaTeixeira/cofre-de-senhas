'use server';

import { revalidatePath } from 'next/cache';
import { requireMaster } from '@/lib/auth/guards';
import { isUuid } from '@/lib/validation';
import { audit } from '@/lib/db/audit';
import { createRoom, softDeleteRoom, updateRoom } from '@/lib/db/queries';

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

