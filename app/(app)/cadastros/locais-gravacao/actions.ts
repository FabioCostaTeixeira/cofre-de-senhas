'use server';

import { revalidatePath } from 'next/cache';
import { requireMaster } from '@/lib/auth/guards';
import { audit } from '@/lib/db/audit';
import { createLocal, softDeleteLocal, updateLocal } from '@/lib/db/locais-gravacao';
import { lerDadosLocal } from '@/lib/locais-gravacao-form';
import { isUuid } from '@/lib/validation';
import type { LocalGravacaoState } from '@/components/LocalGravacaoClient';

const ROTA = '/cadastros/locais-gravacao';

export async function criarLocal(
  _prev: LocalGravacaoState, formData: FormData,
): Promise<LocalGravacaoState> {
  const actor = await requireMaster();
  const dados = lerDadosLocal(formData);
  if ('error' in dados) return dados;

  const id = await createLocal(dados);
  await audit({ actorId: actor.id, action: 'create', entityType: 'local_gravacao', entityId: id });
  revalidatePath(ROTA);
  return { ok: 'Local de gravação cadastrado.' };
}

export async function salvarLocal(
  _prev: LocalGravacaoState, formData: FormData,
): Promise<LocalGravacaoState> {
  const actor = await requireMaster();
  const id = String(formData.get('id') ?? '');
  if (!isUuid(id)) return { error: 'Local de gravação não encontrado.' };

  const dados = lerDadosLocal(formData);
  if ('error' in dados) return dados;

  await updateLocal(id, dados);
  await audit({ actorId: actor.id, action: 'update', entityType: 'local_gravacao', entityId: id });
  revalidatePath(ROTA);
  return { ok: 'Local de gravação atualizado.' };
}

export async function apagarLocal(id: string): Promise<{ error?: string }> {
  const actor = await requireMaster();
  if (!isUuid(id)) return { error: 'Local de gravação não encontrado.' };

  await softDeleteLocal(id);
  await audit({ actorId: actor.id, action: 'delete', entityType: 'local_gravacao', entityId: id });
  revalidatePath(ROTA);
  return {};
}
