'use server';

import { revalidatePath } from 'next/cache';
import { requireMaster } from '@/lib/auth/guards';
import { audit } from '@/lib/db/audit';
import { createPlano, softDeletePlano, updatePlano } from '@/lib/db/planos';
import { lerDadosPlano } from '@/lib/produtos-form';
import { isUuid } from '@/lib/validation';
import type { PlanoState } from '@/components/PlanoClient';

const ROTA = '/produtos/planos';

export async function criarPlano(_prev: PlanoState, formData: FormData): Promise<PlanoState> {
  const actor = await requireMaster();
  const dados = lerDadosPlano(formData);
  if ('error' in dados) return dados;

  const id = await createPlano(dados);
  await audit({ actorId: actor.id, action: 'create', entityType: 'plano', entityId: id });
  revalidatePath(ROTA);
  return { ok: 'Plano cadastrado.' };
}

export async function salvarPlano(_prev: PlanoState, formData: FormData): Promise<PlanoState> {
  const actor = await requireMaster();
  const id = String(formData.get('id') ?? '');
  if (!isUuid(id)) return { error: 'Plano não encontrado.' };

  const dados = lerDadosPlano(formData);
  if ('error' in dados) return dados;

  await updatePlano(id, dados);
  await audit({ actorId: actor.id, action: 'update', entityType: 'plano', entityId: id });
  revalidatePath(ROTA);
  return { ok: 'Plano atualizado.' };
}

export async function apagarPlano(id: string): Promise<{ error?: string }> {
  const actor = await requireMaster();
  if (!isUuid(id)) return { error: 'Plano não encontrado.' };

  await softDeletePlano(id);
  await audit({ actorId: actor.id, action: 'delete', entityType: 'plano', entityId: id });
  revalidatePath(ROTA);
  return {};
}
