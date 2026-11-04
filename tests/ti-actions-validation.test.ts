import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireTiAccess: vi.fn(),
  revalidatePath: vi.fn(),
  createTiProjeto: vi.fn(),
  updateTiProjeto: vi.fn(),
  createTiTarefa: vi.fn(),
  updateTiTarefa: vi.fn(),
  duplicateTiTarefa: vi.fn(),
  createTiAtividade: vi.fn(),
  updateTiAtividade: vi.fn(),
  moverCardTi: vi.fn(),
  statusAtualTi: vi.fn(),
  addNotaTi: vi.fn(),
  listHistoricoTi: vi.fn(),
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
  deleteTiTarefa: vi.fn(),
  duplicateTiTarefa: mocks.duplicateTiTarefa,
  atualizarOrdemTarefas: vi.fn(),
  createTiAtividade: mocks.createTiAtividade,
  updateTiAtividade: mocks.updateTiAtividade,
  deleteTiAtividade: vi.fn(),
  atualizarOrdemAtividades: vi.fn(),
}));

vi.mock('@/lib/db/ti-historico', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/db/ti-historico')>();
  return {
    MotivoObrigatorioError: real.MotivoObrigatorioError,
    moverCardTi: mocks.moverCardTi,
    statusAtualTi: mocks.statusAtualTi,
    addNotaTi: mocks.addNotaTi,
    listHistoricoTi: mocks.listHistoricoTi,
  };
});

import { MotivoObrigatorioError } from '@/lib/db/ti-historico';
import { anotarCardTiAction, moverCardTiAction } from '@/app/(app)/ti/historico-actions';
import { criarOuEditarProjetoAction } from '@/app/(app)/ti/projetos/actions';
import {
  criarOuEditarTarefaAction,
  duplicarTarefaAction,
} from '@/app/(app)/ti/projetos/[id]/actions';
import {
  criarOuEditarAtividadeAction,
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
    mocks.requireTiAccess.mockResolvedValue({ id: '99999999-9999-9999-9999-999999999999', role: 'master' });
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
    const r = await moverCardTiAction({ tipo: 'tarefa', id: tarefaId }, 'apagado', 'motivo');

    expect(r).toEqual({ error: 'Status inválido.' });
    expect(mocks.moverCardTi).not.toHaveBeenCalled();
  });

  it('drag de card de TI repassa o motivo e devolve o erro de motivo vazio', async () => {
    mocks.moverCardTi.mockResolvedValueOnce({ paiId: projetoId });
    expect(await moverCardTiAction({ tipo: 'tarefa', id: tarefaId }, 'progresso', 'começou')).toEqual({});
    expect(mocks.moverCardTi).toHaveBeenCalledWith(
      { tipo: 'tarefa', id: tarefaId }, 'progresso', '99999999-9999-9999-9999-999999999999', 'começou',
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/ti/projetos/${projetoId}`);

    mocks.moverCardTi.mockRejectedValueOnce(new MotivoObrigatorioError());
    expect(await moverCardTiAction({ tipo: 'atividade', id: atividadeId }, 'progresso', ' '))
      .toEqual({ error: 'Informe o motivo da movimentação.' });
  });

  it('anotação vazia é recusada sem gravar', async () => {
    expect(await anotarCardTiAction({ tipo: 'tarefa', id: tarefaId }, '  ')).toEqual({ error: 'Escreva a anotação.' });
    expect(mocks.addNotaTi).not.toHaveBeenCalled();
  });

  it('editar Feature trocando o status exige motivo e grava a movimentação antes', async () => {
    mocks.statusAtualTi.mockResolvedValue('a_fazer');
    mocks.moverCardTi.mockRejectedValueOnce(new MotivoObrigatorioError());
    const semMotivo = await criarOuEditarTarefaAction({}, formulario({
      id: tarefaId, projetoId, nome: 'Feature', status: 'progresso', prioridade: 'media', peso: '10',
    }));
    expect(semMotivo).toEqual({ error: 'Informe o motivo da movimentação.' });
    expect(mocks.updateTiTarefa).not.toHaveBeenCalled();

    await criarOuEditarTarefaAction({}, formulario({
      id: tarefaId, projetoId, nome: 'Feature', status: 'progresso', prioridade: 'media', peso: '10', motivo: 'começou',
    }));
    expect(mocks.moverCardTi).toHaveBeenLastCalledWith(
      { tipo: 'tarefa', id: tarefaId }, 'progresso', '99999999-9999-9999-9999-999999999999', 'começou',
    );
    expect(mocks.updateTiTarefa).toHaveBeenCalled();
  });

  it('editar Feature sem trocar o status não pede motivo', async () => {
    mocks.statusAtualTi.mockResolvedValue('a_fazer');
    await criarOuEditarTarefaAction({}, formulario({
      id: tarefaId, projetoId, nome: 'Feature', status: 'a_fazer', prioridade: 'media', peso: '10',
    }));
    expect(mocks.moverCardTi).not.toHaveBeenCalled();
    expect(mocks.updateTiTarefa).toHaveBeenCalled();
  });

  it('rejeita peso e status forjados para User Story sem gravar', async () => {
    const peso = await criarOuEditarAtividadeAction({}, formulario({
      tarefaId, nome: 'Story', status: 'a_fazer', prioridade: 'media', peso: '-1',
    }));
    const status = await moverCardTiAction({ tipo: 'atividade', id: atividadeId }, 'planejamento', 'motivo');

    expect(peso).toEqual({ error: 'Informe um peso entre 0 e 100.' });
    expect(mocks.createTiAtividade).not.toHaveBeenCalled();
    expect(status).toEqual({ error: 'Status inválido.' });
    expect(mocks.moverCardTi).not.toHaveBeenCalled();
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
