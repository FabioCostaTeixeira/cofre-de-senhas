import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireTiAccess: vi.fn(),
  revalidatePath: vi.fn(),
  createTiProjeto: vi.fn(),
  updateTiProjeto: vi.fn(),
  createTiTarefa: vi.fn(),
  updateTiTarefa: vi.fn(),
  updateTiTarefaStatus: vi.fn(),
  duplicateTiTarefa: vi.fn(),
  createTiAtividade: vi.fn(),
  updateTiAtividade: vi.fn(),
  updateTiAtividadeStatus: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('@/lib/auth/guards', () => ({ requireTiAccess: mocks.requireTiAccess }));
vi.mock('@/lib/db/ti', () => ({
  createTiProjeto: mocks.createTiProjeto,
  updateTiProjeto: mocks.updateTiProjeto,
  deleteTiProjeto: vi.fn(),
  duplicateTiProjeto: vi.fn(),
}));
vi.mock('@/lib/db/ti-tarefas', () => ({
  createTiTarefa: mocks.createTiTarefa,
  updateTiTarefa: mocks.updateTiTarefa,
  updateTiTarefaStatus: mocks.updateTiTarefaStatus,
  deleteTiTarefa: vi.fn(),
  duplicateTiTarefa: mocks.duplicateTiTarefa,
  atualizarOrdemTarefas: vi.fn(),
  createTiAtividade: mocks.createTiAtividade,
  updateTiAtividade: mocks.updateTiAtividade,
  updateTiAtividadeStatus: mocks.updateTiAtividadeStatus,
  deleteTiAtividade: vi.fn(),
  atualizarOrdemAtividades: vi.fn(),
}));

import { criarOuEditarProjetoAction } from '@/app/(app)/ti/projetos/actions';
import {
  criarOuEditarTarefaAction,
  duplicarTarefaAction,
  mudarStatusTarefaAction,
} from '@/app/(app)/ti/projetos/[id]/actions';
import {
  criarOuEditarAtividadeAction,
  mudarStatusAtividadeAction,
} from '@/app/(app)/ti/tarefas/[id]/actions';

const projetoId = '11111111-1111-1111-1111-111111111111';
const tarefaId = '22222222-2222-2222-2222-222222222222';
const atividadeId = '33333333-3333-3333-3333-333333333333';

function formulario(campos: Record<string, string>): FormData {
  const dados = new FormData();
  for (const [chave, valor] of Object.entries(campos)) dados.set(chave, valor);
  return dados;
}

describe('validação das Server Actions TI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireTiAccess.mockResolvedValue(undefined);
  });

  it('rejeita status ou prioridade forjados para projeto sem gravar', async () => {
    const status = await criarOuEditarProjetoAction({}, formulario({
      nome: 'Projeto', status: 'apagado', prioridade: 'media',
    }));
    const prioridade = await criarOuEditarProjetoAction({}, formulario({
      nome: 'Projeto', status: 'roadmap', prioridade: 'urgente',
    }));

    expect(status).toEqual({ error: 'Status inválido.' });
    expect(prioridade).toEqual({ error: 'Prioridade inválida.' });
    expect(mocks.createTiProjeto).not.toHaveBeenCalled();
  });

  it('rejeita peso forjado para Feature sem gravar', async () => {
    const resultado = await criarOuEditarTarefaAction({}, formulario({
      projetoId, nome: 'Feature', status: 'a_fazer', prioridade: 'media', peso: 'Infinity',
    }));

    expect(resultado).toEqual({ error: 'Informe um peso entre 0 e 100.' });
    expect(mocks.createTiTarefa).not.toHaveBeenCalled();
  });

  it('rejeita status forjado no drag de Feature sem gravar', async () => {
    await mudarStatusTarefaAction(formulario({ id: tarefaId, projetoId, status: 'apagado' }));

    expect(mocks.updateTiTarefaStatus).not.toHaveBeenCalled();
  });

  it('rejeita peso e status forjados para User Story sem gravar', async () => {
    const peso = await criarOuEditarAtividadeAction({}, formulario({
      tarefaId, nome: 'Story', status: 'a_fazer', prioridade: 'media', peso: '-1',
    }));
    await mudarStatusAtividadeAction(formulario({ id: atividadeId, tarefaId, status: 'planejamento' }));

    expect(peso).toEqual({ error: 'Informe um peso entre 0 e 100.' });
    expect(mocks.createTiAtividade).not.toHaveBeenCalled();
    expect(mocks.updateTiAtividadeStatus).not.toHaveBeenCalled();
  });

  it('rejeita id forjado ao duplicar Feature sem gravar', async () => {
    await duplicarTarefaAction(formulario({ id: 'nao-e-uuid', projetoId }));
    await duplicarTarefaAction(formulario({ id: tarefaId, projetoId: 'nao-e-uuid' }));

    expect(mocks.duplicateTiTarefa).not.toHaveBeenCalled();
  });

  it('duplica Feature válida e revalida a página do projeto', async () => {
    await duplicarTarefaAction(formulario({ id: tarefaId, projetoId }));

    expect(mocks.duplicateTiTarefa).toHaveBeenCalledWith(tarefaId);
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/ti/projetos/${projetoId}`);
  });

  it('não duplica Feature quando acesso TI é negado', async () => {
    mocks.requireTiAccess.mockRejectedValueOnce(new Error('not-found'));

    await expect(duplicarTarefaAction(formulario({ id: tarefaId, projetoId }))).rejects.toThrow('not-found');
    expect(mocks.duplicateTiTarefa).not.toHaveBeenCalled();
  });

  it('encaminha peso zero válido sem convertê-lo', async () => {
    await criarOuEditarTarefaAction({}, formulario({
      projetoId, nome: 'Feature', status: 'a_fazer', prioridade: 'media', peso: '0',
    }));

    expect(mocks.createTiTarefa).toHaveBeenCalledWith(expect.objectContaining({ peso: 0 }));
  });
});
