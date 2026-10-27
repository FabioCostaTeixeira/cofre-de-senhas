'use server';

import { revalidatePath } from 'next/cache';
import { requireTiAccess } from '@/lib/auth/guards';
import {
  createTiTarefa,
  updateTiTarefa,
  updateTiTarefaStatus,
  deleteTiTarefa,
  duplicateTiTarefa,
  atualizarOrdemTarefas,
} from '@/lib/db/ti-tarefas';
import { isPrioridadeTi, isStatusTarefa, parsePesoTi } from '@/lib/ti-validation';
import { isUuid } from '@/lib/validation';

export type TarefaActionState = { error?: string; ok?: string };

export async function criarOuEditarTarefaAction(_prev: TarefaActionState, formData: FormData): Promise<TarefaActionState> {
  await requireTiAccess();
  const id = String(formData.get('id') ?? '').trim();
  const projetoId = String(formData.get('projetoId') ?? '');
  const nome = String(formData.get('nome') ?? '').trim();
  const descricao = String(formData.get('descricao') ?? '').trim() || null;
  const status = String(formData.get('status') ?? 'a_fazer');
  const prioridade = String(formData.get('prioridade') ?? 'media');
  const responsavel = String(formData.get('responsavel') ?? '').trim() || null;
  const peso = parsePesoTi(formData.get('peso'));

  if (!isUuid(projetoId)) return { error: 'Projeto inválido.' };
  if (id && !isUuid(id)) return { error: 'Tarefa inválida.' };
  if (!nome) return { error: 'Informe o nome da Tarefa (Feature).' };
  if (!isStatusTarefa(status)) return { error: 'Status inválido.' };
  if (!isPrioridadeTi(prioridade)) return { error: 'Prioridade inválida.' };
  if (peso === null) return { error: 'Informe um peso entre 0 e 100.' };

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
  await requireTiAccess();
  const id = String(formData.get('id') ?? '');
  const projetoId = String(formData.get('projetoId') ?? '');
  const status = String(formData.get('status') ?? '');

  if (!isUuid(id) || !isUuid(projetoId) || !isStatusTarefa(status)) return;
  await updateTiTarefaStatus(id, status);
  revalidatePath(`/ti/projetos/${projetoId}`);
}

export async function duplicarTarefaAction(formData: FormData): Promise<void> {
  await requireTiAccess();
  const id = String(formData.get('id') ?? '');
  const projetoId = String(formData.get('projetoId') ?? '');
  if (!isUuid(id) || !isUuid(projetoId)) return;

  await duplicateTiTarefa(id);
  revalidatePath(`/ti/projetos/${projetoId}`);
}

export async function excluirTarefaAction(formData: FormData): Promise<void> {
  await requireTiAccess();
  const id = String(formData.get('id') ?? '');
  const projetoId = String(formData.get('projetoId') ?? '');
  if (!isUuid(id) || !isUuid(projetoId)) return;

  await deleteTiTarefa(id);
  revalidatePath(`/ti/projetos/${projetoId}`);
}

export async function reordenarTarefasAction(projetoId: string, idsOrdenados: string[]): Promise<void> {
  await requireTiAccess();
  if (!isUuid(projetoId) || !Array.isArray(idsOrdenados) || idsOrdenados.some((id) => !isUuid(id))) return;
  await atualizarOrdemTarefas(idsOrdenados);
  revalidatePath(`/ti/projetos/${projetoId}`);
}
