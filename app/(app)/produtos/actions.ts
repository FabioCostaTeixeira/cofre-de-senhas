'use server';

import { revalidatePath } from 'next/cache';
import { requireModulo } from '@/lib/auth/guards';
import { audit } from '@/lib/db/audit';
import { getCategoria } from '@/lib/db/categorias-produto';
import { createProduto, softDeleteProduto, updateProduto } from '@/lib/db/produtos';
import { lerDadosProduto } from '@/lib/produtos-form';
import { isUuid } from '@/lib/validation';
import type { ProdutoState } from '@/components/ProdutoClient';

const ROTA = '/produtos';

async function moldeDaCategoria(categoriaId: string) {
  if (!isUuid(categoriaId)) return null;
  const categoria = await getCategoria(categoriaId);
  return categoria?.atributos_molde ?? null;
}

export async function criarProduto(_prev: ProdutoState, formData: FormData): Promise<ProdutoState> {
  const actor = await requireModulo('produtos');
  const molde = await moldeDaCategoria(String(formData.get('categoriaId') ?? ''));
  if (!molde) return { error: 'Categoria não encontrada.' };

  const dados = lerDadosProduto(formData, molde);
  if ('error' in dados) return dados;

  const id = await createProduto(dados);
  await audit({ actorId: actor.id, action: 'create', entityType: 'produto', entityId: id });
  revalidatePath(ROTA);
  return { ok: 'Produto cadastrado.' };
}

export async function salvarProduto(_prev: ProdutoState, formData: FormData): Promise<ProdutoState> {
  const actor = await requireModulo('produtos');
  const id = String(formData.get('id') ?? '');
  if (!isUuid(id)) return { error: 'Produto não encontrado.' };

  const molde = await moldeDaCategoria(String(formData.get('categoriaId') ?? ''));
  if (!molde) return { error: 'Categoria não encontrada.' };

  const dados = lerDadosProduto(formData, molde);
  if ('error' in dados) return dados;

  await updateProduto(id, dados);
  await audit({ actorId: actor.id, action: 'update', entityType: 'produto', entityId: id });
  revalidatePath(ROTA);
  return { ok: 'Produto atualizado.' };
}

export async function apagarProduto(id: string): Promise<{ error?: string }> {
  const actor = await requireModulo('produtos');
  if (!isUuid(id)) return { error: 'Produto não encontrado.' };

  await softDeleteProduto(id);
  await audit({ actorId: actor.id, action: 'delete', entityType: 'produto', entityId: id });
  revalidatePath(ROTA);
  return {};
}
