/**
 * Colunas do quadro de Planejamento. Fixas no código de propósito — o cliente não
 * configura colunas (ver spec 2026-08-20-working-planejamento-design.md, §3).
 *
 * `id` é o identificador estável, separado do `label` exibido: quando cards existirem,
 * a coluna do card será persistida por `id`, então renomear um rótulo ("Block" ->
 * "Bloqueado") não pode quebrar dado já gravado.
 */
import type { Planejamento, QuadroCategoria } from '@/lib/types';

export type ColunaKanban = { id: string; label: string };

/** Os dois quadros do Planejamento. Cada um mostra as tarefas cujo produto é de uma
 *  categoria com aquele `planejamento` (ver migração 015). */
export const PLANEJAMENTOS: readonly { id: Planejamento; label: string }[] = [
  { id: 'edicao', label: 'Edição' },
  { id: 'gravacao', label: 'Gravação' },
];

export function isPlanejamento(valor: string): valor is Planejamento {
  return PLANEJAMENTOS.some((p) => p.id === valor);
}

/** Opções do campo "Planejamento" da categoria: os dois quadros de tarefas mais o de
 *  Projetos, onde caem os chamados (ver migração 017). */
export const QUADROS_CATEGORIA: readonly { id: QuadroCategoria; label: string }[] = [
  ...PLANEJAMENTOS,
  { id: 'projeto', label: 'Projetos' },
];

export function isQuadroCategoria(valor: string): valor is QuadroCategoria {
  return QUADROS_CATEGORIA.some((q) => q.id === valor);
}

export const COLUNAS_KANBAN: readonly ColunaKanban[] = [
  { id: 'roadmap', label: 'RoadMap' },
  { id: 'a_fazer', label: 'A Fazer' },
  { id: 'executando', label: 'Executando' },
  { id: 'block', label: 'Block' },
  { id: 'homologacao_cliente', label: 'Homologação Cliente' },
  { id: 'concluido', label: 'Concluído' },
];

/** Colunas do quadro Working › Projetos (chamados). Chamado nasce em Aberto. */
export const COLUNAS_CHAMADO: readonly ColunaKanban[] = [
  { id: 'aberto', label: 'Aberto' },
  { id: 'em_andamento', label: 'Em andamento' },
  { id: 'block', label: 'Block' },
  { id: 'homologacao', label: 'Homologação' },
  { id: 'concluido', label: 'Concluído' },
];
