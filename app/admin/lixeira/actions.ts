'use server';

import { revalidatePath } from 'next/cache';
import { requireMaster } from '@/lib/auth/guards';
import { NotFoundError } from '@/lib/authz';
import { isUuid } from '@/lib/validation';
import { audit } from '@/lib/db/audit';
import { purgeItem, restoreItem } from '@/lib/db/queries';

// `restaurar` é usada direto como `action` de um <form> (sem confirmação — reversível).

/** Valida em runtime; qualquer outro valor é ignorado (a requisição não faz nada). */
function parseKind(value: FormDataEntryValue | null): 'credential' | 'room' | null {
  return value === 'credential' || value === 'room' ? value : null;
}

export async function restaurar(formData: FormData): Promise<void> {
  const actor = await requireMaster();
  const id = String(formData.get('id') ?? '');
  const kind = parseKind(formData.get('kind'));
  if (!kind || !isUuid(id)) return;
  try {
    await restoreItem(kind, id);
  } catch (err) {
    if (err instanceof NotFoundError) return;
    throw err;
  }
  await audit({ actorId: actor.id, action: 'restore', entityType: kind, entityId: id });
  revalidatePath('/admin/lixeira');
  revalidatePath('/');
}

export type ExpurgarResult = { error?: string };

/**
 * Chamada diretamente pelo Client Component `PurgeButton` (não via `<form action>`),
 * o que permite pedir `confirm()` no cliente antes de destruir os dados —
 * mesmo padrão de `deleteCredential` em `app/credenciais/actions.ts`.
 */
export async function expurgar(kind: 'credential' | 'room', id: string): Promise<ExpurgarResult> {
  const actor = await requireMaster();
  if (!isUuid(id)) return { error: 'Item não encontrado.' };
  try {
    await purgeItem(kind, id);
  } catch (err) {
    if (err instanceof NotFoundError) return { error: 'Item não encontrado.' };
    throw err;
  }
  await audit({ actorId: actor.id, action: 'purge', entityType: kind, entityId: id });
  revalidatePath('/admin/lixeira');
  return {};
}
