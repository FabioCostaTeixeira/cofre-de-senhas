import { COLUNAS_KANBAN } from '@/lib/kanban';

/**
 * Quadro Kanban do Planejamento. Nesta rodada só o esqueleto: seis colunas fixas,
 * todas vazias (sem cards, sem persistência — ver spec §1).
 *
 * Rolagem lateral em vez de empilhar: seis colunas não cabem lado a lado em tela
 * estreita, e empilhar descaracterizaria o quadro.
 */
export function KanbanBoard() {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {COLUNAS_KANBAN.map((coluna) => (
        <section key={coluna.id} className="glass w-72 shrink-0 p-4 space-y-3">
          <h2 className="text-sm font-semibold">{coluna.label}</h2>
          <p className="text-sm" style={{ color: 'var(--text-dim)' }}>Nenhuma tarefa</p>
        </section>
      ))}
    </div>
  );
}
