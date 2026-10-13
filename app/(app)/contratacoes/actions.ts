'use server';

import { revalidatePath } from 'next/cache';
import { requireModulo } from '@/lib/auth/guards';
import { audit } from '@/lib/db/audit';
import { createContratacao, ItemInativoError, softDeleteContratacao } from '@/lib/db/contratacoes';
import { lerDadosContratacao } from '@/lib/contratacao-form';
import { isUuid } from '@/lib/validation';
import type { ContratacaoState } from '@/components/ContratacaoClient';

const ROTA = '/contratacoes';

export async function criarContratacao(_prev: ContratacaoState, formData: FormData): Promise<ContratacaoState> {
  const actor = await requireModulo('contratacoes');
  const dados = lerDadosContratacao(formData);
  if ('error' in dados) return dados;

  let id: string;
  try {
    id = await createContratacao(dados);
  } catch (err) {
    if (err instanceof ItemInativoError) return { error: err.message };
    throw err;
  }
  await audit({ actorId: actor.id, action: 'create', entityType: 'contratacao', entityId: id });
  revalidatePath(ROTA);
  return { ok: 'Contratação registrada.' };
}

export async function apagarContratacao(id: string): Promise<{ error?: string }> {
  const actor = await requireModulo('contratacoes');
  if (!isUuid(id)) return { error: 'Contratação não encontrada.' };

  await softDeleteContratacao(id);
  await audit({ actorId: actor.id, action: 'delete', entityType: 'contratacao', entityId: id });
  revalidatePath(ROTA);
  return {};
}
