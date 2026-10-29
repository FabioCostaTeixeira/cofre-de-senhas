'use server';

import { revalidatePath } from 'next/cache';
import { requireModulo } from '@/lib/auth/guards';
import { NotFoundError } from '@/lib/authz';
import { audit } from '@/lib/db/audit';
import {
  TarefaDivergenteError,
  moverTarefa,
  reordenarTarefas,
  softDeleteTarefa,
} from '@/lib/db/tarefas';
import { isUuid } from '@/lib/validation';

// Revalidada como 'layout' para cobrir os dois quadros (/edicao e /gravacao) de uma vez.
// Tarefa nova não é criada aqui: nasce da Ordem de Serviço (botão "Nova tarefa" dos quadros).
const ROTA = '/working/planejamento';

export async function moverTarefaAction(id: string, coluna: string): Promise<{ error?: string }> {
  const actor = await requireModulo('working');
  if (!isUuid(id)) return { error: 'Tarefa não encontrada.' };

  try {
    await moverTarefa(id, coluna);
  } catch (e) {
    if (e instanceof TarefaDivergenteError) return { error: e.message };
    if (e instanceof NotFoundError) return { error: 'Tarefa não encontrada.' };
    throw e;
  }

  await audit({ actorId: actor.id, action: 'update', entityType: 'tarefa', entityId: id });
  revalidatePath(ROTA, 'layout');
  return {};
}

export async function reordenarTarefasAction(ids: string[]): Promise<{ error?: string }> {
  const actor = await requireModulo('working');
  if (!ids.every(isUuid)) return { error: 'Lista de tarefas inválida.' };

  await reordenarTarefas(ids);
  await audit({ actorId: actor.id, action: 'update', entityType: 'tarefa' });
  revalidatePath(ROTA, 'layout');
  return {};
}

export async function apagarTarefaAction(id: string): Promise<{ error?: string }> {
  const actor = await requireModulo('working');
  if (!isUuid(id)) return { error: 'Tarefa não encontrada.' };

  try {
    await softDeleteTarefa(id);
  } catch (e) {
    if (e instanceof TarefaDivergenteError) return { error: e.message };
    if (e instanceof NotFoundError) return { error: 'Tarefa não encontrada.' };
    throw e;
  }

  await audit({ actorId: actor.id, action: 'delete', entityType: 'tarefa', entityId: id });
  revalidatePath(ROTA, 'layout');
  return {};
}
