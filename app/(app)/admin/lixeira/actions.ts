'use server';

import { revalidatePath } from 'next/cache';
import { requireMaster } from '@/lib/auth/guards';
import { NotFoundError } from '@/lib/authz';
import { isUuid } from '@/lib/validation';
import { audit } from '@/lib/db/audit';
import { ItemEmUsoError, purgeItem, restoreItem, RoomTrashedError } from '@/lib/db/queries';

export type RestoreResult = { error?: string };

/**
 * Chamada diretamente pelo Client Component `RestoreButton` (não via `<form action>`),
 * porque restaurar uma credencial pode falhar (sala ainda na lixeira) e precisa
 * devolver uma mensagem — mesmo padrão de `expurgar` logo abaixo.
 */
export async function restaurar(
  kind: 'credential' | 'room' | 'cliente' | 'fornecedor' | 'produto' | 'combo' | 'plano', id: string,
): Promise<RestoreResult> {
  const actor = await requireMaster();
  if (!isUuid(id)) return { error: 'Item não encontrado.' };
  try {
    await restoreItem(kind, id);
  } catch (err) {
    if (err instanceof NotFoundError) return { error: 'Item não encontrado.' };
    if (err instanceof RoomTrashedError) return { error: err.message };
    throw err;
  }
  await audit({ actorId: actor.id, action: 'restore', entityType: kind, entityId: id });
  revalidatePath('/admin/lixeira');
  revalidatePath('/');
  return {};
}

export type ExpurgarResult = { error?: string };

/**
 * Chamada diretamente pelo Client Component `PurgeButton` (não via `<form action>`),
 * o que permite pedir `confirm()` no cliente antes de destruir os dados —
 * mesmo padrão de `deleteCredential` em `app/credenciais/actions.ts`.
 */
export async function expurgar(
  kind: 'credential' | 'room' | 'cliente' | 'fornecedor' | 'produto' | 'combo' | 'plano', id: string,
): Promise<ExpurgarResult> {
  const actor = await requireMaster();
  if (!isUuid(id)) return { error: 'Item não encontrado.' };
  try {
    await purgeItem(kind, id);
  } catch (err) {
    if (err instanceof NotFoundError) return { error: 'Item não encontrado.' };
    if (err instanceof ItemEmUsoError) return { error: err.message };
    throw err;
  }
  await audit({ actorId: actor.id, action: 'purge', entityType: kind, entityId: id });
  revalidatePath('/admin/lixeira');
  return {};
}
