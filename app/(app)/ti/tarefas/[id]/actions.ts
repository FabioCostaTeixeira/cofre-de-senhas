'use server';

import { revalidatePath } from 'next/cache';
import { requireReadyUser } from '@/lib/auth/guards';
import {
  createTiAtividade,
  updateTiAtividade,
  updateTiAtividadeStatus,
  deleteTiAtividade,
  atualizarOrdemAtividades,
} from '@/lib/db/ti-tarefas';
import { isUuid } from '@/lib/validation';

export type AtividadeActionState = { error?: string; ok?: string };

export async function criarOuEditarAtividadeAction(_prev: AtividadeActionState, formData: FormData): Promise<AtividadeActionState> {
  await requireReadyUser();
  const id = String(formData.get('id') ?? '').trim();
  const tarefaId = String(formData.get('tarefaId') ?? '');
  const nome = String(formData.get('nome') ?? '').trim();
  const descricao = String(formData.get('descricao') ?? '').trim() || null;
  const status = String(formData.get('status') ?? 'a_fazer');
  const prioridade = String(formData.get('prioridade') ?? 'media');
  const responsavel = String(formData.get('responsavel') ?? '').trim() || null;
  const peso = parseFloat(formData.get('peso') as string) || 0;

  if (!isUuid(tarefaId)) return { error: 'Tarefa inválida.' };
  if (!nome) return { error: 'Informe o nome da User Story (Atividade).' };

  try {
    if (id && isUuid(id)) {
      const resultado = await updateTiAtividade({ id, tarefaId, nome, descricao, status, prioridade, responsavel, peso });
      if (!resultado) return { error: 'User Story não encontrada.' };

      revalidatePath(`/ti/tarefas/${resultado.tarefaAnteriorId}`);
      revalidatePath(`/ti/tarefas/${resultado.tarefaNovaId}`);
      revalidatePath(`/ti/projetos/${resultado.projetoAnteriorId}`);
      revalidatePath(`/ti/projetos/${resultado.projetoNovoId}`);
      revalidatePath('/ti/projetos');
      return { ok: 'User Story atualizada com sucesso!' };
    } else {
      await createTiAtividade({ tarefaId, nome, descricao, status, prioridade, responsavel, peso });
      revalidatePath(`/ti/tarefas/${tarefaId}`);
      return { ok: 'User Story criada com sucesso!' };
    }
  } catch (err) {
    return { error: 'Erro ao salvar User Story.' };
  }
}

export async function mudarStatusAtividadeAction(formData: FormData): Promise<void> {
  await requireReadyUser();
  const id = String(formData.get('id') ?? '');
  const tarefaId = String(formData.get('tarefaId') ?? '');
  const status = String(formData.get('status') ?? '');

  if (!isUuid(id) || !isUuid(tarefaId) || !status) return;
  await updateTiAtividadeStatus(id, status);
  revalidatePath(`/ti/tarefas/${tarefaId}`);
}

export async function excluirAtividadeAction(formData: FormData): Promise<void> {
  await requireReadyUser();
  const id = String(formData.get('id') ?? '');
  const tarefaId = String(formData.get('tarefaId') ?? '');
  if (!isUuid(id) || !isUuid(tarefaId)) return;

  await deleteTiAtividade(id);
  revalidatePath(`/ti/tarefas/${tarefaId}`);
}

export async function reordenarAtividadesAction(tarefaId: string, idsOrdenados: string[]): Promise<void> {
  await requireReadyUser();
  if (!isUuid(tarefaId) || !Array.isArray(idsOrdenados)) return;
  await atualizarOrdemAtividades(idsOrdenados);
  revalidatePath(`/ti/tarefas/${tarefaId}`);
}
