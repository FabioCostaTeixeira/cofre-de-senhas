import { describe, expect, it } from 'vitest';
import { formatarDataHora } from '@/lib/formato';

describe('formatarDataHora', () => {
  it('converte UTC para o horário de Brasília', () => {
    // 14:16 UTC = 11:16 em Brasília (UTC-3).
    expect(formatarDataHora('2026-07-30T14:16:21.000Z')).toBe('30/07/2026, 11:16:21');
  });

  it('vira o dia corretamente perto da meia-noite', () => {
    // 01:30 UTC do dia 31 ainda é 22:30 do dia 30 em Brasília.
    expect(formatarDataHora('2026-07-31T01:30:00.000Z')).toBe('30/07/2026, 22:30:00');
  });

  it('ignora o fuso da máquina que renderiza', () => {
    const emUtc = formatarDataHora(new Date('2026-01-15T12:00:00.000Z'));
    expect(emUtc).toBe('15/01/2026, 09:00:00');
  });
});
