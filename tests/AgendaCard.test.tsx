import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { AgendaCard, calcularPosicaoCard } from '@/components/AgendaCard';
import type { Agendamento } from '@/lib/types';

describe('calcularPosicaoCard', () => {
  it('09:00 as 10:00 comeca no bloco 36 (9h * 4) e dura 4 blocos (1h)', () => {
    expect(calcularPosicaoCard('09:00', '10:00')).toEqual({ top: 36 * 16, height: 4 * 16 });
  });
  it('00:00 as 00:15 comeca no topo e dura 1 bloco', () => {
    expect(calcularPosicaoCard('00:00', '00:15')).toEqual({ top: 0, height: 16 });
  });
});

const item: Agendamento = {
  id: '1', cliente_id: 'c1', cliente_nome: 'ACME', local_id: 'l1', estudio_id: 'e1',
  estudio_nome: 'Estúdio A', categoria_produto_id: 'cat1', categoria_nome: 'Gravação',
  status: 'agendado', data: '2026-08-24', hora_inicio: '09:00:00', hora_fim: '10:00:00',
  created_at: '2026-08-20T00:00:00Z',
};

afterEach(() => cleanup());

describe('AgendaCard', () => {
  it('mostra cliente, estúdio e status', () => {
    render(<AgendaCard item={item} onPointerDownMover={vi.fn()} onPointerDownRedimensionar={vi.fn()} onClick={vi.fn()} />);
    expect(screen.getByText('ACME')).toBeInTheDocument();
    expect(screen.getByText(/Estúdio A/)).toBeInTheDocument();
    expect(screen.getByText('Agendado')).toBeInTheDocument();
  });
  it('clicar no corpo do card chama onClick', () => {
    const onClick = vi.fn();
    render(<AgendaCard item={item} onPointerDownMover={vi.fn()} onPointerDownRedimensionar={vi.fn()} onClick={onClick} />);
    fireEvent.click(screen.getByText('ACME'));
    expect(onClick).toHaveBeenCalled();
  });
});
