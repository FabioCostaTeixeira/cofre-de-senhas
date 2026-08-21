import { describe, expect, it } from 'vitest';
import { corPorDeadline, ordenarTarefas } from '@/lib/tarefas-calc';

// 2026-08-20T12:00Z = 09:00 em Brasília, mesmo dia. Data fixa pra não depender de "hoje".
const HOJE = new Date('2026-08-20T12:00:00Z');

describe('corPorDeadline', () => {
  it('sem deadline é neutro', () => {
    expect(corPorDeadline(null, HOJE)).toBe('neutro');
  });

  it('4 dias ou mais é verde', () => {
    expect(corPorDeadline('2026-08-24', HOJE)).toBe('verde');
    expect(corPorDeadline('2026-09-30', HOJE)).toBe('verde');
  });

  it('2 ou 3 dias é amarelo', () => {
    expect(corPorDeadline('2026-08-23', HOJE)).toBe('amarelo');
    expect(corPorDeadline('2026-08-22', HOJE)).toBe('amarelo');
  });

  it('1 dia, hoje ou atrasado é vermelho', () => {
    expect(corPorDeadline('2026-08-21', HOJE)).toBe('vermelho');
    expect(corPorDeadline('2026-08-20', HOJE)).toBe('vermelho');
    expect(corPorDeadline('2026-08-19', HOJE)).toBe('vermelho');
  });

  it('usa o dia em Brasília, não em UTC', () => {
    // 2026-08-21T02:00Z ainda é dia 20 em Brasília (UTC-3). Deadline 24 => 4 dias.
    expect(corPorDeadline('2026-08-24', new Date('2026-08-21T02:00:00Z'))).toBe('verde');
  });

  it('dia 5 é verde (limite superior da faixa)', () => {
    expect(corPorDeadline('2026-08-25', HOJE)).toBe('verde');
  });

  // O driver do Neon entrega coluna `date` como objeto Date, não string. Uma query
  // sem `::text` cai aqui — .slice num Date estourava.
  it('aceita deadline como Date, não só string', () => {
    expect(corPorDeadline(new Date('2026-08-24T03:00:00Z'), HOJE)).toBe('verde');
    expect(corPorDeadline(new Date('2026-08-21T03:00:00Z'), HOJE)).toBe('vermelho');
  });

  it('deadline malformado é neutro, não vermelho', () => {
    // Vermelho é sinal acionável na tela; lixo não pode virar alarme falso.
    expect(corPorDeadline('invalido', HOJE)).toBe('neutro');
  });
});

describe('ordenarTarefas', () => {
  const base = { ajuste: false, prioridade: 5, created_at: '2026-08-10T00:00:00Z' };

  it('ajuste vem primeiro, mesmo com prioridade pior', () => {
    const r = ordenarTarefas([
      { id: 'a', ...base, prioridade: 1 },
      { id: 'b', ...base, prioridade: 99, ajuste: true },
    ]);
    expect(r.map((t) => t.id)).toEqual(['b', 'a']);
  });

  it('prioridade menor vem primeiro', () => {
    const r = ordenarTarefas([
      { id: 'a', ...base, prioridade: 3 },
      { id: 'b', ...base, prioridade: 1 },
    ]);
    expect(r.map((t) => t.id)).toEqual(['b', 'a']);
  });

  it('empate na prioridade: mais antigo primeiro', () => {
    const r = ordenarTarefas([
      { id: 'novo', ...base, created_at: '2026-08-15T00:00:00Z' },
      { id: 'velho', ...base, created_at: '2026-08-01T00:00:00Z' },
    ]);
    expect(r.map((t) => t.id)).toEqual(['velho', 'novo']);
  });

  it('não muta o array recebido', () => {
    const entrada = [
      { id: 'a', ...base, prioridade: 3 },
      { id: 'b', ...base, prioridade: 1 },
    ];
    ordenarTarefas(entrada);
    expect(entrada.map((t) => t.id)).toEqual(['a', 'b']);
  });

  // Empate de ajuste E prioridade é o único caminho que chega no desempate por
  // created_at — e é rotineiro, não exótico. Com Date, localeCompare estourava.
  it('desempata por created_at mesmo quando ele chega como Date', () => {
    const r = ordenarTarefas([
      { id: 'novo', ...base, created_at: new Date('2026-08-15T00:00:00Z') },
      { id: 'velho', ...base, created_at: new Date('2026-08-01T00:00:00Z') },
    ]);
    expect(r.map((t) => t.id)).toEqual(['velho', 'novo']);
  });
});
