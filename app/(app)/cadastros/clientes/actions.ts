'use server';

import { revalidatePath } from 'next/cache';
import { requireMaster } from '@/lib/auth/guards';
import { audit } from '@/lib/db/audit';
import { createTerceiro, softDeleteTerceiro, updateTerceiro } from '@/lib/db/terceiros';
import { lerDadosTerceiro } from '@/lib/terceiros-form';
import { isUuid } from '@/lib/validation';
import type { TerceiroState } from '@/components/TerceiroClient';

const TABELA = 'clientes' as const;
const ROTA = '/cadastros/clientes';

export async function criarCliente(
  _prev: TerceiroState, formData: FormData,
): Promise<TerceiroState> {
  const actor = await requireMaster();
  const dados = lerDadosTerceiro(formData);
  if ('error' in dados) return dados;

  const id = await createTerceiro(TABELA, dados);
  await audit({ actorId: actor.id, action: 'create', entityType: 'cliente', entityId: id });
  revalidatePath(ROTA);
  return { ok: 'Cliente cadastrado.' };
}

export async function salvarCliente(
  _prev: TerceiroState, formData: FormData,
): Promise<TerceiroState> {
  const actor = await requireMaster();
  const id = String(formData.get('id') ?? '');
  if (!isUuid(id)) return { error: 'Cliente não encontrado.' };

  const dados = lerDadosTerceiro(formData);
  if ('error' in dados) return dados;

  await updateTerceiro(TABELA, id, dados);
  await audit({ actorId: actor.id, action: 'update', entityType: 'cliente', entityId: id });
  revalidatePath(ROTA);
  return { ok: 'Cliente atualizado.' };
}

export async function apagarCliente(id: string): Promise<{ error?: string }> {
  const actor = await requireMaster();
  if (!isUuid(id)) return { error: 'Cliente não encontrado.' };

  await softDeleteTerceiro(TABELA, id);
  await audit({ actorId: actor.id, action: 'delete', entityType: 'cliente', entityId: id });
  revalidatePath(ROTA);
  return {};
}
