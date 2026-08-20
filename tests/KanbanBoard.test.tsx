import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { KanbanBoard } from '@/components/KanbanBoard';
import { COLUNAS_KANBAN } from '@/lib/kanban';

afterEach(() => cleanup());

describe('KanbanBoard', () => {
  it('renderiza as seis colunas na ordem definida', () => {
    render(<KanbanBoard />);
    const titulos = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(titulos).toEqual([
      'RoadMap', 'A Fazer', 'Executando', 'Block', 'Homologação Cliente', 'Concluído',
    ]);
  });

  it('cada coluna mostra o estado vazio', () => {
    render(<KanbanBoard />);
    expect(screen.getAllByText('Nenhuma tarefa')).toHaveLength(COLUNAS_KANBAN.length);
  });
});
