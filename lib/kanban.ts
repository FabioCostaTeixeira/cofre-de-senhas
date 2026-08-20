/**
 * Colunas do quadro de Planejamento. Fixas no código de propósito — o cliente não
 * configura colunas (ver spec 2026-08-20-working-planejamento-design.md, §3).
 *
 * `id` é o identificador estável, separado do `label` exibido: quando cards existirem,
 * a coluna do card será persistida por `id`, então renomear um rótulo ("Block" ->
 * "Bloqueado") não pode quebrar dado já gravado.
 */
export type ColunaKanban = { id: string; label: string };

export const COLUNAS_KANBAN: readonly ColunaKanban[] = [
  { id: 'roadmap', label: 'RoadMap' },
  { id: 'a_fazer', label: 'A Fazer' },
  { id: 'executando', label: 'Executando' },
  { id: 'block', label: 'Block' },
  { id: 'homologacao_cliente', label: 'Homologação Cliente' },
  { id: 'concluido', label: 'Concluído' },
];
