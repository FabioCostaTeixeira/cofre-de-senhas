'use server';

import { revalidatePath } from 'next/cache';
import { requireModulo } from '@/lib/auth/guards';
import { NotFoundError } from '@/lib/authz';
import { audit } from '@/lib/db/audit';
import { notificarGestores } from '@/lib/db/notificacoes';
import {
  TarefaDivergenteError,
  getResumoTarefa,
  moverTarefa,
  reordenarTarefas,
  softDeleteTarefa,
  updateTarefa,
} from '@/lib/db/tarefas';
import { COLUNA_CONCLUIDO_TAREFA } from '@/lib/kanban';
import { gerePlanejamento } from '@/lib/permissoes-cards';
import { isUuid } from '@/lib/validation';
import type { EditarTarefaState } from '@/components/EditarTarefaModal';

// Revalidada como 'layout' para cobrir os dois quadros (/edicao e /gravacao) de uma vez.
// Tarefa nova não é criada aqui: nasce da Ordem de Serviço (botão "Nova tarefa" dos quadros).
const ROTA = '/working/planejamento';

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

// Editar, reordenar e apagar são do gestor e do master; usuário comum só arrasta os
// cards atribuídos a ele (lib/permissoes-cards.ts).
const SEM_PERMISSAO = 'Só o gestor pode alterar este card.';

/** Botão de edição do card: só responsável, descrição e os dois deadlines. */
export async function editarTarefaAction(_prev: EditarTarefaState, formData: FormData): Promise<EditarTarefaState> {
  const actor = await requireModulo('working');
  if (!gerePlanejamento(actor)) return { error: SEM_PERMISSAO };
  const id = String(formData.get('id') ?? '');
  if (!isUuid(id)) return { error: 'Tarefa não encontrada.' };

  const responsavelId = String(formData.get('responsavelId') ?? '');
  const tarefa = String(formData.get('tarefa') ?? '').trim();
  const deadlineCliente = String(formData.get('deadlineCliente') ?? '').trim();
  const deadlineTarefa = String(formData.get('deadlineTarefa') ?? '').trim();
  if ((deadlineCliente && !DATA_ISO.test(deadlineCliente)) || (deadlineTarefa && !DATA_ISO.test(deadlineTarefa))) {
    return { error: 'Data inválida.' };
  }

  try {
    await updateTarefa(id, {
      responsavel_id: isUuid(responsavelId) ? responsavelId : null,
      tarefa: tarefa || null,
      deadline_cliente: deadlineCliente || null,
      deadline_tarefa: deadlineTarefa || null,
    });
  } catch (e) {
    if (e instanceof NotFoundError) return { error: 'Tarefa não encontrada.' };
    throw e;
  }

  await audit({ actorId: actor.id, action: 'update', entityType: 'tarefa', entityId: id });
  revalidatePath(ROTA, 'layout');
  return { ok: true };
}

export async function moverTarefaAction(id: string, coluna: string): Promise<{ error?: string }> {
  const actor = await requireModulo('working');
  if (!isUuid(id)) return { error: 'Tarefa não encontrada.' };

  let mudou: boolean;
  try {
    mudou = await moverTarefa(id, coluna, gerePlanejamento(actor) ? undefined : actor.id);
  } catch (e) {
    if (e instanceof TarefaDivergenteError) return { error: e.message };
    if (e instanceof NotFoundError) return { error: 'Tarefa não encontrada.' };
    throw e;
  }

  await audit({ actorId: actor.id, action: 'update', entityType: 'tarefa', entityId: id });
  // Concluída (confirmada no quadro): os gestores são avisados e o card sai do quadro
  // (listTarefas com `ocultarConcluidas`). Aviso só quando a tarefa entrou agora em
  // Concluído — mover para onde já estava não notifica de novo.
  if (mudou && coluna === COLUNA_CONCLUIDO_TAREFA) await avisarConclusao(id, actor);
  revalidatePath(ROTA, 'layout');
  return {};
}

/** Falha ao avisar não desfaz a conclusão: a tarefa já foi movida e o saldo consumido. */
async function avisarConclusao(id: string, actor: { id: string; name: string }): Promise<void> {
  try {
    const resumo = await getResumoTarefa(id);
    if (!resumo) return;
    await notificarGestores({
      titulo: `Tarefa concluída: ${resumo.cliente_nome} · ${resumo.produto_nome}`,
      mensagem: `${actor.name} concluiu a tarefa${
        resumo.responsavel_nome ? ` de ${resumo.responsavel_nome}` : ''
      }.`,
      link: ROTA,
    }, actor.id);
    revalidatePath('/', 'layout');
  } catch (e) {
    console.error('Falha ao notificar gestores da conclusão da tarefa', id, e);
  }
}

export async function reordenarTarefasAction(ids: string[]): Promise<{ error?: string }> {
  const actor = await requireModulo('working');
  if (!gerePlanejamento(actor)) return { error: SEM_PERMISSAO };
  if (!ids.every(isUuid)) return { error: 'Lista de tarefas inválida.' };

  await reordenarTarefas(ids);
  await audit({ actorId: actor.id, action: 'update', entityType: 'tarefa' });
  revalidatePath(ROTA, 'layout');
  return {};
}

export async function apagarTarefaAction(id: string): Promise<{ error?: string }> {
  const actor = await requireModulo('working');
  if (!gerePlanejamento(actor)) return { error: SEM_PERMISSAO };
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
