'use server';

import { revalidatePath } from 'next/cache';
import { requireModulo } from '@/lib/auth/guards';
import { audit } from '@/lib/db/audit';
import { createTerceiro, softDeleteTerceiro, updateTerceiro } from '@/lib/db/terceiros';
import { lerDadosTerceiro } from '@/lib/terceiros-form';
import { isUuid } from '@/lib/validation';
import type { TerceiroState } from '@/components/TerceiroClient';

const TABELA = 'fornecedores' as const;
const ROTA = '/cadastros/fornecedores';

export async function criarFornecedor(
  _prev: TerceiroState, formData: FormData,
): Promise<TerceiroState> {
  const actor = await requireModulo('fornecedores');
  const dados = lerDadosTerceiro(formData);
  if ('error' in dados) return dados;

  const id = await createTerceiro(TABELA, dados);
  await audit({ actorId: actor.id, action: 'create', entityType: 'fornecedor', entityId: id });
  revalidatePath(ROTA);
  return { ok: 'Fornecedor cadastrado.' };
}

export async function salvarFornecedor(
  _prev: TerceiroState, formData: FormData,
): Promise<TerceiroState> {
  const actor = await requireModulo('fornecedores');
  const id = String(formData.get('id') ?? '');
  if (!isUuid(id)) return { error: 'Fornecedor não encontrado.' };

  const dados = lerDadosTerceiro(formData);
  if ('error' in dados) return dados;

  await updateTerceiro(TABELA, id, dados);
  await audit({ actorId: actor.id, action: 'update', entityType: 'fornecedor', entityId: id });
  revalidatePath(ROTA);
  return { ok: 'Fornecedor atualizado.' };
}

export async function apagarFornecedor(id: string): Promise<{ error?: string }> {
  const actor = await requireModulo('fornecedores');
  if (!isUuid(id)) return { error: 'Fornecedor não encontrado.' };

  await softDeleteTerceiro(TABELA, id);
  await audit({ actorId: actor.id, action: 'delete', entityType: 'fornecedor', entityId: id });
  revalidatePath(ROTA);
  return {};
}
