'use server';

import { revalidatePath } from 'next/cache';
import { requireReadyUser } from '@/lib/auth/guards';
import { NotFoundError } from '@/lib/authz';
import { audit } from '@/lib/db/audit';
import {
  SaldoIndisponivelError,
  TarefaDivergenteError,
  createTarefa,
  listItensDisponiveisDoCliente,
  moverTarefa,
  reordenarTarefas,
  softDeleteTarefa,
  type ItemDisponivel,
} from '@/lib/db/tarefas';
import { isUuid } from '@/lib/validation';
import type { DadosTarefa } from '@/lib/types';

const ROTA = '/working/planejamento';

export type TarefaFormState = { error?: string; ok?: boolean };
const inicial: TarefaFormState = {};

function lerDadosTarefa(formData: FormData): DadosTarefa | { error: string } {
  const cliente_id = String(formData.get('clienteId') ?? '');
  const contratacao_item_id = String(formData.get('contratacaoItemId') ?? '');
  const coluna = String(formData.get('coluna') ?? '');
  if (!isUuid(cliente_id) || !isUuid(contratacao_item_id) || !coluna) {
    return { error: 'Preencha cliente, produto e coluna.' };
  }

  const responsavelId = String(formData.get('responsavelId') ?? '');
  const prioridadeRaw = String(formData.get('prioridade') ?? '');
  const prioridade = prioridadeRaw ? Number(prioridadeRaw) : 0;
  if (Number.isNaN(prioridade)) return { error: 'Prioridade inválida.' };

  const tarefa = String(formData.get('tarefa') ?? '').trim();
  const deadlineCliente = String(formData.get('deadlineCliente') ?? '').trim();
  const deadlineTarefa = String(formData.get('deadlineTarefa') ?? '').trim();

  return {
    cliente_id,
    responsavel_id: isUuid(responsavelId) ? responsavelId : null,
    contratacao_item_id,
    tarefa: tarefa || null,
    coluna,
    prioridade,
    deadline_cliente: deadlineCliente || null,
    deadline_tarefa: deadlineTarefa || null,
  };
}

export async function criarTarefaAction(
  _prev: TarefaFormState, formData: FormData,
): Promise<TarefaFormState> {
  const actor = await requireReadyUser();
  const dados = lerDadosTarefa(formData);
  if ('error' in dados) return dados;

  let id: string;
  try {
    id = await createTarefa(dados);
  } catch (e) {
    if (e instanceof SaldoIndisponivelError) return { error: e.message };
    if (e instanceof NotFoundError) return { error: 'Tarefa não encontrada.' };
    throw e;
  }

  await audit({ actorId: actor.id, action: 'create', entityType: 'tarefa', entityId: id });
  revalidatePath(ROTA);
  return { ok: true };
}

export async function moverTarefaAction(id: string, coluna: string): Promise<{ error?: string }> {
  const actor = await requireReadyUser();
  if (!isUuid(id)) return { error: 'Tarefa não encontrada.' };

  try {
    await moverTarefa(id, coluna);
  } catch (e) {
    if (e instanceof TarefaDivergenteError) return { error: e.message };
    if (e instanceof NotFoundError) return { error: 'Tarefa não encontrada.' };
    throw e;
  }

  await audit({ actorId: actor.id, action: 'update', entityType: 'tarefa', entityId: id });
  revalidatePath(ROTA);
  return {};
}

export async function reordenarTarefasAction(ids: string[]): Promise<{ error?: string }> {
  const actor = await requireReadyUser();
  if (!ids.every(isUuid)) return { error: 'Lista de tarefas inválida.' };

  await reordenarTarefas(ids);
  await audit({ actorId: actor.id, action: 'update', entityType: 'tarefa' });
  revalidatePath(ROTA);
  return {};
}

export async function apagarTarefaAction(id: string): Promise<{ error?: string }> {
  const actor = await requireReadyUser();
  if (!isUuid(id)) return { error: 'Tarefa não encontrada.' };

  try {
    await softDeleteTarefa(id);
  } catch (e) {
    if (e instanceof TarefaDivergenteError) return { error: e.message };
    if (e instanceof NotFoundError) return { error: 'Tarefa não encontrada.' };
    throw e;
  }

  await audit({ actorId: actor.id, action: 'delete', entityType: 'tarefa', entityId: id });
  revalidatePath(ROTA);
  return {};
}

/**
 * Busca os itens da carteira do cliente com saldo livre, chamada direto do client
 * component (não é submissão de formulário) — mesmo padrão de
 * `buscarDadosClienteAction` em app/(app)/cadastros/clientes/actions.ts.
 */
export async function buscarItensDoClienteAction(
  clienteId: string,
): Promise<{ itens: ItemDisponivel[] } | { error: string }> {
  await requireReadyUser();
  if (!isUuid(clienteId)) return { error: 'Cliente não encontrado.' };

  const itens = await listItensDisponiveisDoCliente(clienteId);
  return { itens };
}
