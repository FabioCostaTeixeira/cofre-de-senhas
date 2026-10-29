import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { AgendaCalendario } from '@/components/AgendaCalendario';
import { diasDaGradeDoMes, rotuloMes, somarMeses } from '@/lib/agenda-calendario';
import type { Agendamento, LocalGravacao } from '@/lib/types';

describe('datas do calendário', () => {
  it('outubro de 2026 vai da segunda 28/09 ao domingo 01/11', () => {
    const dias = diasDaGradeDoMes('2026-10');
    expect(dias[0]).toBe('2026-09-28');
    expect(dias[dias.length - 1]).toBe('2026-11-01');
    expect(dias).toHaveLength(35);
  });
  it('mês que começa na segunda e termina no domingo não puxa dias vizinhos', () => {
    const dias = diasDaGradeDoMes('2027-02');
    expect(dias[0]).toBe('2027-02-01');
    expect(dias[dias.length - 1]).toBe('2027-02-28');
  });
  it('soma meses atravessando o ano e rotula em português', () => {
    expect(somarMeses('2026-12', 1)).toBe('2027-01');
    expect(somarMeses('2026-01', -1)).toBe('2025-12');
    expect(rotuloMes('2026-10')).toBe('outubro 2026');
  });
});

function ag(id: string, hora: string, data = '2026-10-07'): Agendamento {
  return {
    id, cliente_id: 'c1', cliente_nome: `Cliente ${id}`, local_id: 'l1', estudio_id: 'e1',
    estudio_nome: 'Estúdio A', produto_id: 'p1', produto_nome: 'POD',
    status: 'agendado', data, hora_inicio: `${hora}:00`, hora_fim: '20:00:00',
    created_at: '2026-10-01T00:00:00Z',
  };
}

const locais = [{ id: 'l1', nome: 'VIX', estudios: [{ id: 'e1', nome: 'Estúdio A' }] }] as unknown as LocalGravacao[];

afterEach(() => cleanup());

describe('AgendaCalendario', () => {
  it('mostra local - cliente - produto em ordem de horário', () => {
    render(<AgendaCalendario mes="2026-10" itens={[ag('b', '15:00'), ag('a', '09:00')]} locais={locais} onAbrir={vi.fn()} />);
    const cards = screen.getAllByTestId('calendario-card');
    expect(cards[0]).toHaveTextContent('VIX - Cliente a - POD');
    expect(cards[0]).toHaveTextContent('09:00-20:00');
    expect(cards[1]).toHaveTextContent('Cliente b');
  });
  it('clicar no card abre o agendamento', () => {
    const onAbrir = vi.fn();
    const item = ag('a', '09:00');
    render(<AgendaCalendario mes="2026-10" itens={[item]} locais={locais} onAbrir={onAbrir} />);
    fireEvent.click(screen.getByTestId('calendario-card'));
    expect(onAbrir).toHaveBeenCalledWith(item);
  });
  it('acima de 4 cards no dia mostra "+ N MAIS" e expande ao clicar', () => {
    const itens = ['08', '09', '10', '11', '12', '13'].map((h) => ag(h, `${h}:00`));
    render(<AgendaCalendario mes="2026-10" itens={itens} locais={locais} onAbrir={vi.fn()} />);
    expect(screen.getAllByTestId('calendario-card')).toHaveLength(4);
    fireEvent.click(screen.getByText('+ 2 MAIS'));
    expect(screen.getAllByTestId('calendario-card')).toHaveLength(6);
  });
});
