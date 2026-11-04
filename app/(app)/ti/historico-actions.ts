'use server';

import { revalidatePath } from 'next/cache';
import { requireTiAccess } from '@/lib/auth/guards';
import { NotFoundError } from '@/lib/authz';
import {
  addNotaTi, listHistoricoTi, MotivoObrigatorioError, moverCardTi, type CardTi, type TiHistorico,
} from '@/lib/db/ti-historico';
import { isStatusAtividade, isStatusTarefa } from '@/lib/ti-validation';
import { isUuid } from '@/lib/validation';

function cardValido(card: CardTi): boolean {
  return (card.tipo === 'tarefa' || card.tipo === 'atividade') && isUuid(card.id);
}

function revalidarPai(card: CardTi, paiId: string) {
  if (card.tipo === 'tarefa') {
    revalidatePath(`/ti/projetos/${paiId}`);
    revalidatePath('/ti/projetos');
  } else {
    revalidatePath(`/ti/tarefas/${paiId}`);
  }
}

/** Timeline do card, carregada quando ele é expandido. */
export async function listarHistoricoTiAction(card: CardTi): Promise<TiHistorico[]> {
  await requireTiAccess();
  if (!cardValido(card)) return [];
  return listHistoricoTi(card);
}

/** Anotação avulsa, feita ao abrir o card. */
export async function anotarCardTiAction(card: CardTi, descricao: string): Promise<{ error?: string }> {
  const actor = await requireTiAccess();
  if (!cardValido(card)) return { error: 'Card não encontrado.' };
  if (!descricao.trim()) return { error: 'Escreva a anotação.' };
  try {
    await addNotaTi(card, actor.id, descricao);
  } catch (e) {
    if (e instanceof NotFoundError) return { error: 'Card não encontrado.' };
    throw e;
  }
  return {};
}

/** Arraste entre colunas do kanban: só acontece com o motivo, gravado na timeline. */
export async function moverCardTiAction(card: CardTi, status: string, motivo: string): Promise<{ error?: string }> {
  const actor = await requireTiAccess();
  if (!cardValido(card)) return { error: 'Card não encontrado.' };
  const statusValido = card.tipo === 'tarefa' ? isStatusTarefa(status) : isStatusAtividade(status);
  if (!statusValido) return { error: 'Status inválido.' };

  try {
    const r = await moverCardTi(card, status, actor.id, motivo);
    if (r) revalidarPai(card, r.paiId);
  } catch (e) {
    if (e instanceof MotivoObrigatorioError) return { error: e.message };
    if (e instanceof NotFoundError) return { error: 'Card não encontrado.' };
    throw e;
  }
  return {};
}
