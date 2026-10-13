import { describe, expect, it } from 'vitest';
import {
  isPrioridadeTi,
  isStatusAtividade,
  isStatusProjeto,
  isStatusTarefa,
  parsePesoTi,
} from '@/lib/ti-validation';

describe('validação do módulo TI', () => {
  it('aceita apenas status definidos para cada nível', () => {
    expect(isStatusProjeto('backlog')).toBe(true);
    expect(isStatusProjeto('roadmap')).toBe(true);
    expect(isStatusProjeto('a_fazer')).toBe(false);

    expect(isStatusTarefa('planejamento')).toBe(true);
    expect(isStatusTarefa('bloqueada')).toBe(true);
    expect(isStatusTarefa('cancelado')).toBe(false);

    expect(isStatusAtividade('roadmap')).toBe(true);
    expect(isStatusAtividade('planejamento')).toBe(false);
    expect(isStatusAtividade('concluido')).toBe(true);
  });

  it('rejeita prioridade forjada', () => {
    expect(isPrioridadeTi('critica')).toBe(true);
    expect(isPrioridadeTi('urgente')).toBe(false);
  });

  it('aceita peso finito de 0 a 100', () => {
    expect(parsePesoTi('0')).toBe(0);
    expect(parsePesoTi('37.5')).toBe(37.5);
    expect(parsePesoTi('100')).toBe(100);
  });

  it('rejeita peso ausente, inválido ou fora de faixa', () => {
    expect(parsePesoTi(null)).toBeNull();
    expect(parsePesoTi('')).toBeNull();
    expect(parsePesoTi('NaN')).toBeNull();
    expect(parsePesoTi('Infinity')).toBeNull();
    expect(parsePesoTi('-1')).toBeNull();
    expect(parsePesoTi('100.01')).toBeNull();
  });
});
