'use server';

import { revalidatePath } from 'next/cache';
import { requireReadyUser } from '@/lib/auth/guards';
import {
  createTiTarefa,
  updateTiTarefa,
  updateTiTarefaStatus,
  deleteTiTarefa,
  atualizarOrdemTarefas,
} from '@/lib/db/ti-tarefas';
import { isUuid } from '@/lib/validation';

export type TarefaActionState = { error?: string; ok?: string };

export async function criarOuEditarTarefaAction(_prev: TarefaActionState, formData: FormData): Promise<TarefaActionState> {
  await requireReadyUser();
  const id = String(formData.get('id') ?? '').trim();
  const projetoId = String(formData.get('projetoId') ?? '');
  const nome = String(formData.get('nome') ?? '').trim();
  const descricao = String(formData.get('descricao') ?? '').trim() || null;
  const status = String(formData.get('status') ?? 'a_fazer');
  const prioridade = String(formData.get('prioridade') ?? 'media');
  const responsavel = String(formData.get('responsavel') ?? '').trim() || null;
  const peso = parseFloat(formData.get('peso') as string) || 0;

  if (!isUuid(projetoId)) return { error: 'Projeto inválido.' };
  if (!nome) return { error: 'Informe o nome da Tarefa (Feature).' };

  try {
    if (id && isUuid(id)) {
      await updateTiTarefa({ id, nome, descricao, status, prioridade, responsavel, peso });
      revalidatePath(`/ti/projetos/${projetoId}`);
      return { ok: 'Tarefa atualizada com sucesso!' };
    } else {
      await createTiTarefa({ projetoId, nome, descricao, status, prioridade, responsavel, peso });
      revalidatePath(`/ti/projetos/${projetoId}`);
      return { ok: 'Tarefa criada com sucesso!' };
    }
  } catch (err) {
    return { error: 'Erro ao salvar tarefa.' };
  }
}

export async function mudarStatusTarefaAction(formData: FormData): Promise<void> {
  await requireReadyUser();
  const id = String(formData.get('id') ?? '');
  const projetoId = String(formData.get('projetoId') ?? '');
  const status = String(formData.get('status') ?? '');

  if (!isUuid(id) || !isUuid(projetoId) || !status) return;
  await updateTiTarefaStatus(id, status);
  revalidatePath(`/ti/projetos/${projetoId}`);
}

export async function excluirTarefaAction(formData: FormData): Promise<void> {
  await requireReadyUser();
  const id = String(formData.get('id') ?? '');
  const projetoId = String(formData.get('projetoId') ?? '');
  if (!isUuid(id) || !isUuid(projetoId)) return;

  await deleteTiTarefa(id);
  revalidatePath(`/ti/projetos/${projetoId}`);
}

export async function reordenarTarefasAction(projetoId: string, idsOrdenados: string[]): Promise<void> {
  await requireReadyUser();
  if (!isUuid(projetoId) || !Array.isArray(idsOrdenados)) return;
  await atualizarOrdemTarefas(idsOrdenados);
  revalidatePath(`/ti/projetos/${projetoId}`);
}
