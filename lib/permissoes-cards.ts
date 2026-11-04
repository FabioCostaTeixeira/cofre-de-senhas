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
 *   colunas mas não editar. Nos chamados, os que abriu ou que foram atribuídos a ele;
 *   o responsável move à vontade, mas quem abriu só move depois que o responsável o
 *   põe em Homologação (decisão do cliente, 2026-11-04).
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

/** Coluna em que o chamado volta para as mãos de quem o abriu. */
export const COLUNA_HOMOLOGACAO_CHAMADO = 'homologacao';

/** Quem abriu só move o chamado a partir de Homologação — vale para o usuário comum;
 *  o gestor que abriu um chamado continua movendo-o livremente. */
export function criadorSoMoveDaHomologacao(a: AtorCard): boolean {
  return a.role === 'user';
}

export function podeMoverChamado(
  a: AtorCard, c: Pick<Chamado, 'criado_por' | 'responsavel_id' | 'coluna'>,
): boolean {
  if (isMaster(a) || c.responsavel_id === a.id) return true;
  if (c.criado_por !== a.id) return false;
  return !criadorSoMoveDaHomologacao(a) || c.coluna === COLUNA_HOMOLOGACAO_CHAMADO;
}

/** Prioridade é uma ordem só para o quadro inteiro: só quem vê todos os cards e pode
 *  mexer em todos reordena, senão reescreveria a ordem de cards que não enxerga. */
export function podeReordenarChamados(a: AtorCard): boolean {
  return isMaster(a);
}
