'use server';

import { revalidatePath } from 'next/cache';
import { requireModulo } from '@/lib/auth/guards';
import { audit } from '@/lib/db/audit';
import {
  createCategoria, deleteCategoria, updateCategoria, CategoriaEmUsoError,
} from '@/lib/db/categorias-produto';
import { lerDadosCategoria } from '@/lib/produtos-form';
import { isUuid } from '@/lib/validation';
import type { CategoriaState } from '@/components/CategoriaClient';

const ROTA = '/produtos/categorias';

export async function criarCategoria(_prev: CategoriaState, formData: FormData): Promise<CategoriaState> {
  const actor = await requireModulo('produtos');
  const dados = lerDadosCategoria(formData);
  if ('error' in dados) return dados;

  const id = await createCategoria(dados);
  await audit({ actorId: actor.id, action: 'create', entityType: 'categoria_produto', entityId: id });
  revalidatePath(ROTA);
  return { ok: 'Categoria cadastrada.' };
}

export async function salvarCategoria(_prev: CategoriaState, formData: FormData): Promise<CategoriaState> {
  const actor = await requireModulo('produtos');
  const id = String(formData.get('id') ?? '');
  if (!isUuid(id)) return { error: 'Categoria não encontrada.' };

  const dados = lerDadosCategoria(formData);
  if ('error' in dados) return dados;

  await updateCategoria(id, dados);
  await audit({ actorId: actor.id, action: 'update', entityType: 'categoria_produto', entityId: id });
  revalidatePath(ROTA);
  return { ok: 'Categoria atualizada.' };
}

export async function apagarCategoria(id: string): Promise<{ error?: string }> {
  const actor = await requireModulo('produtos');
  if (!isUuid(id)) return { error: 'Categoria não encontrada.' };

  try {
    await deleteCategoria(id);
  } catch (err) {
    if (err instanceof CategoriaEmUsoError) return { error: err.message };
    throw err;
  }
  await audit({ actorId: actor.id, action: 'delete', entityType: 'categoria_produto', entityId: id });
  revalidatePath(ROTA);
  return {};
}
