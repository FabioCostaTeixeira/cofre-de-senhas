'use server';

import { revalidatePath } from 'next/cache';
import { requireReadyUser } from '@/lib/auth/guards';
import { createTiProjeto, deleteTiProjeto, duplicateTiProjeto, updateTiProjeto } from '@/lib/db/ti';
import { isUuid } from '@/lib/validation';

export type TiActionState = { error?: string; ok?: string };

export async function criarOuEditarProjetoAction(_prev: TiActionState, formData: FormData): Promise<TiActionState> {
  await requireReadyUser();
  const id = String(formData.get('id') ?? '').trim();
  const nome = String(formData.get('nome') ?? '').trim();
  const descricao = String(formData.get('descricao') ?? '').trim() || null;
  const status = String(formData.get('status') ?? 'backlog');
  const prioridade = String(formData.get('prioridade') ?? 'media');
  const responsavel = String(formData.get('responsavel') ?? '').trim() || null;
  const dataInicio = String(formData.get('dataInicio') ?? '').trim() || null;
  const dataFim = String(formData.get('dataFim') ?? '').trim() || null;

  if (!nome) return { error: 'Informe o nome do projeto (Epic).' };

  try {
    if (id && isUuid(id)) {
      await updateTiProjeto({
        id,
        nome,
        descricao,
        status,
        prioridade,
        responsavel,
        data_inicio: dataInicio,
        data_fim: dataFim,
      });
      revalidatePath('/ti/projetos');
      return { ok: 'Projeto atualizado com sucesso!' };
    } else {
      await createTiProjeto({
        nome,
        descricao,
        status,
        prioridade,
        responsavel,
        data_inicio: dataInicio,
        data_fim: dataFim,
      });
      revalidatePath('/ti/projetos');
      return { ok: 'Projeto criado com sucesso!' };
    }
  } catch (err) {
    return { error: 'Erro ao salvar projeto.' };
  }
}

export async function duplicarProjetoAction(formData: FormData): Promise<void> {
  await requireReadyUser();
  const id = String(formData.get('id') ?? '');
  if (!isUuid(id)) return;

  await duplicateTiProjeto(id);
  revalidatePath('/ti/projetos');
}

export async function excluirProjetoAction(formData: FormData): Promise<void> {
  await requireReadyUser();
  const id = String(formData.get('id') ?? '');
  if (!isUuid(id)) return;

  await deleteTiProjeto(id);
  revalidatePath('/ti/projetos');
}
