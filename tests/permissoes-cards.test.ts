import { describe, expect, it } from 'vitest';
import {
  gerePlanejamento, podeEditarChamado, podeMoverChamado, podeMoverTarefa, podeReordenarChamados, veTodosChamados,
} from '@/lib/permissoes-cards';

const master = { id: 'm', role: 'master' as const };
const gestor = { id: 'g', role: 'gestor' as const };
const user = { id: 'u', role: 'user' as const };

describe('Planejamento (Edição/Gravação)', () => {
  it('master e gestor gerem tudo; usuário não', () => {
    expect(gerePlanejamento(master)).toBe(true);
    expect(gerePlanejamento(gestor)).toBe(true);
    expect(gerePlanejamento(user)).toBe(false);
  });

  it('usuário só move a tarefa atribuída a ele', () => {
    expect(podeMoverTarefa(user, { responsavel_id: 'u' })).toBe(true);
    expect(podeMoverTarefa(user, { responsavel_id: 'outro' })).toBe(false);
    expect(podeMoverTarefa(user, { responsavel_id: null })).toBe(false);
    expect(podeMoverTarefa(gestor, { responsavel_id: 'outro' })).toBe(true);
  });
});

describe('Chamados (Projetos)', () => {
  const deOutros = { criado_por: 'x', responsavel_id: 'y', coluna: 'aberto' };

  it('master e gestor veem todos; usuário não', () => {
    expect(veTodosChamados(master)).toBe(true);
    expect(veTodosChamados(gestor)).toBe(true);
    expect(veTodosChamados(user)).toBe(false);
  });

  it('só quem abriu (ou master) edita — gestor não', () => {
    expect(podeEditarChamado(user, { criado_por: 'u' })).toBe(true);
    expect(podeEditarChamado(gestor, { criado_por: 'x' })).toBe(false);
    expect(podeEditarChamado(master, { criado_por: 'x' })).toBe(true);
  });

  it('responsável e master movem em qualquer coluna', () => {
    expect(podeMoverChamado(user, { criado_por: 'x', responsavel_id: 'u', coluna: 'aberto' })).toBe(true);
    expect(podeMoverChamado(master, deOutros)).toBe(true);
    expect(podeMoverChamado(gestor, deOutros)).toBe(false);
  });

  it('usuário comum que abriu só move a partir de Homologação', () => {
    for (const coluna of ['aberto', 'em_andamento', 'block', 'concluido']) {
      expect(podeMoverChamado(user, { criado_por: 'u', responsavel_id: 'y', coluna })).toBe(false);
    }
    expect(podeMoverChamado(user, { criado_por: 'u', responsavel_id: 'y', coluna: 'homologacao' })).toBe(true);
  });

  it('quem abriu e também é o responsável move à vontade; gestor que abriu também', () => {
    expect(podeMoverChamado(user, { criado_por: 'u', responsavel_id: 'u', coluna: 'aberto' })).toBe(true);
    expect(podeMoverChamado(gestor, { criado_por: 'g', responsavel_id: 'y', coluna: 'aberto' })).toBe(true);
  });

  it('só o master reordena', () => {
    expect(podeReordenarChamados(master)).toBe(true);
    expect(podeReordenarChamados(gestor)).toBe(false);
    expect(podeReordenarChamados(user)).toBe(false);
  });
});
