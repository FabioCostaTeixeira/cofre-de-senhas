import type { Actor, Chamado, Tarefa } from '@/lib/types';

/**
 * Quem vê e mexe em cada card dos quadros do Working (decisão do cliente, 2026-11-03).
 * Regra de linha aplicada na aplicação: as listagens filtram pelo ator e as actions
 * repetem o filtro na `where` (lib/db/tarefas.ts, lib/db/chamados.ts). Estas funções
 * são a mesma regra para a UI decidir o que mostrar — a barreira real é o servidor.
 *
 * - master (desenvolvedores): tudo, nos dois quadros.
 * - gestor: no Planejamento (Edição/Gravação) vê, edita, reordena e distribui todos os
 *   cards. Nos chamados só vê todos; editar é de quem abriu.
 * - usuário: no Planejamento, só os cards atribuídos a ele, que pode arrastar entre
 *   colunas mas não editar. Nos chamados, os que abriu ou que foram atribuídos a ele.
 */
export type AtorCard = Pick<Actor, 'id' | 'role'>;

const isMaster = (a: AtorCard) => a.role === 'master';
const isGestor = (a: AtorCard) => a.role === 'gestor';

/** Vê todas as tarefas do Planejamento e edita, reordena e apaga qualquer uma. */
export function gerePlanejamento(a: AtorCard): boolean {
  return isMaster(a) || isGestor(a);
}

export function podeMoverTarefa(a: AtorCard, t: Pick<Tarefa, 'responsavel_id'>): boolean {
  return gerePlanejamento(a) || t.responsavel_id === a.id;
}

/** Vê todos os chamados, inclusive os que não abriu nem lhe foram atribuídos. */
export function veTodosChamados(a: AtorCard): boolean {
  return isMaster(a) || isGestor(a);
}

export function podeEditarChamado(a: AtorCard, c: Pick<Chamado, 'criado_por'>): boolean {
  return isMaster(a) || c.criado_por === a.id;
}

export function podeMoverChamado(a: AtorCard, c: Pick<Chamado, 'criado_por' | 'responsavel_id'>): boolean {
  return isMaster(a) || c.criado_por === a.id || c.responsavel_id === a.id;
}

/** Prioridade é uma ordem só para o quadro inteiro: só quem vê todos os cards e pode
 *  mexer em todos reordena, senão reescreveria a ordem de cards que não enxerga. */
export function podeReordenarChamados(a: AtorCard): boolean {
  return isMaster(a);
}
