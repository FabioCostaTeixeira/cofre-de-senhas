'use server';

import { revalidatePath } from 'next/cache';
import { requireMaster } from '@/lib/auth/guards';
import { audit } from '@/lib/db/audit';
import { purgeItem, restoreItem } from '@/lib/db/queries';

// As duas recebem apenas FormData: são usadas direto como `action` de um <form>.

/** Valida em runtime; qualquer outro valor é ignorado (a requisição não faz nada). */
function parseKind(value: FormDataEntryValue | null): 'credential' | 'room' | null {
  return value === 'credential' || value === 'room' ? value : null;
}

export async function restaurar(formData: FormData): Promise<void> {
  const actor = await requireMaster();
  const id = String(formData.get('id') ?? '');
  const kind = parseKind(formData.get('kind'));
  if (!kind) return;
  await restoreItem(kind, id);
  await audit({ actorId: actor.id, action: 'restore', entityType: kind, entityId: id });
  revalidatePath('/admin/lixeira');
  revalidatePath('/');
}

export async function expurgar(formData: FormData): Promise<void> {
  const actor = await requireMaster();
  const id = String(formData.get('id') ?? '');
  const kind = parseKind(formData.get('kind'));
  if (!kind) return;
  await purgeItem(kind, id);
  await audit({ actorId: actor.id, action: 'purge', entityType: kind, entityId: id });
  revalidatePath('/admin/lixeira');
}
