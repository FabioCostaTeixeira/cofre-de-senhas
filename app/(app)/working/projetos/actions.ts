'use server';

import { revalidatePath } from 'next/cache';
import { requireModulo } from '@/lib/auth/guards';
import { NotFoundError } from '@/lib/authz';
import { lerDadosChamado } from '@/lib/chamados-form';
import { audit } from '@/lib/db/audit';
import {
  ChamadoInvalidoError, createChamado, moverChamado, reordenarChamados, softDeleteChamado, updateChamado,
} from '@/lib/db/chamados';
import { podeReordenarChamados } from '@/lib/permissoes-cards';
import { isUuid } from '@/lib/validation';
import type { ChamadoState } from '@/components/ChamadoModal';

const ROTA = '/working/projetos';

// Regra de linha (lib/permissoes-cards.ts): master passa `undefined` (sem filtro); os
// demais só editam/apagam o que abriram e só movem o que abriram ou lhes foi atribuído.
const somenteSe = (actor: { id: string; role: string }) => (actor.role === 'master' ? undefined : actor.id);

export async function criarChamadoAction(_prev: ChamadoState, formData: FormData): Promise<ChamadoState> {
  const actor = await requireModulo('working');
  const dados = lerDadosChamado(formData);
  if ('error' in dados) return dados;
  if (![dados.categoria_id, dados.produto_id, dados.responsavel_id].every(isUuid)) {
    return { error: 'Dados do chamado inválidos.' };
  }

  let id: string;
  try {
    id = await createChamado(dados, actor.id);
  } catch (e) {
    if (e instanceof ChamadoInvalidoError) return { error: e.message };
    throw e;
  }
  await audit({ actorId: actor.id, action: 'create', entityType: 'chamado', entityId: id });
  revalidatePath(ROTA);
  return { ok: true };
}

export async function editarChamadoAction(_prev: ChamadoState, formData: FormData): Promise<ChamadoState> {
  const actor = await requireModulo('working');
  const id = String(formData.get('id') ?? '');
  if (!isUuid(id)) return { error: 'Chamado não encontrado.' };
  const dados = lerDadosChamado(formData);
  if ('error' in dados) return dados;
  if (![dados.categoria_id, dados.produto_id, dados.responsavel_id].every(isUuid)) {
    return { error: 'Dados do chamado inválidos.' };
  }

  try {
    await updateChamado(id, dados, somenteSe(actor));
  } catch (e) {
    if (e instanceof ChamadoInvalidoError) return { error: e.message };
    if (e instanceof NotFoundError) return { error: 'Chamado não encontrado.' };
    throw e;
  }
  await audit({ actorId: actor.id, action: 'update', entityType: 'chamado', entityId: id });
  revalidatePath(ROTA);
  return { ok: true };
}

export async function moverChamadoAction(id: string, coluna: string): Promise<{ error?: string }> {
  const actor = await requireModulo('working');
  if (!isUuid(id)) return { error: 'Chamado não encontrado.' };

  try {
    await moverChamado(id, coluna, somenteSe(actor));
  } catch (e) {
    if (e instanceof ChamadoInvalidoError) return { error: e.message };
    if (e instanceof NotFoundError) return { error: 'Chamado não encontrado.' };
    throw e;
  }
  await audit({ actorId: actor.id, action: 'update', entityType: 'chamado', entityId: id });
  revalidatePath(ROTA);
  return {};
}

export async function reordenarChamadosAction(ids: string[]): Promise<{ error?: string }> {
  const actor = await requireModulo('working');
  if (!podeReordenarChamados(actor)) return { error: 'Sem permissão para reordenar os chamados.' };
  if (!ids.every(isUuid)) return { error: 'Lista de chamados inválida.' };

  await reordenarChamados(ids);
  await audit({ actorId: actor.id, action: 'update', entityType: 'chamado' });
  revalidatePath(ROTA);
  return {};
}

export async function apagarChamadoAction(id: string): Promise<{ error?: string }> {
  const actor = await requireModulo('working');
  if (!isUuid(id)) return { error: 'Chamado não encontrado.' };

  try {
    await softDeleteChamado(id, somenteSe(actor));
  } catch (e) {
    if (e instanceof NotFoundError) return { error: 'Chamado não encontrado.' };
    throw e;
  }
  await audit({ actorId: actor.id, action: 'delete', entityType: 'chamado', entityId: id });
  revalidatePath(ROTA);
  return {};
}
