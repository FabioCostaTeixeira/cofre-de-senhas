'use server';

import { revalidatePath } from 'next/cache';
import { requireModulo } from '@/lib/auth/guards';
import { audit } from '@/lib/db/audit';
import { createCombo, softDeleteCombo, updateCombo } from '@/lib/db/combos';
import { lerDadosCombo } from '@/lib/produtos-form';
import { isUuid } from '@/lib/validation';
import type { ComboState } from '@/components/ComboClient';

const ROTA = '/produtos/combos';

export async function criarCombo(_prev: ComboState, formData: FormData): Promise<ComboState> {
  const actor = await requireModulo('produtos');
  const dados = lerDadosCombo(formData);
  if ('error' in dados) return dados;

  const id = await createCombo(dados);
  await audit({ actorId: actor.id, action: 'create', entityType: 'combo', entityId: id });
  revalidatePath(ROTA);
  return { ok: 'Combo cadastrado.' };
}

export async function salvarCombo(_prev: ComboState, formData: FormData): Promise<ComboState> {
  const actor = await requireModulo('produtos');
  const id = String(formData.get('id') ?? '');
  if (!isUuid(id)) return { error: 'Combo não encontrado.' };

  const dados = lerDadosCombo(formData);
  if ('error' in dados) return dados;

  await updateCombo(id, dados);
  await audit({ actorId: actor.id, action: 'update', entityType: 'combo', entityId: id });
  revalidatePath(ROTA);
  return { ok: 'Combo atualizado.' };
}

export async function apagarCombo(id: string): Promise<{ error?: string }> {
  const actor = await requireModulo('produtos');
  if (!isUuid(id)) return { error: 'Combo não encontrado.' };

  await softDeleteCombo(id);
  await audit({ actorId: actor.id, action: 'delete', entityType: 'combo', entityId: id });
  revalidatePath(ROTA);
  return {};
}
