// tests/dashboard-calc.test.ts
import { describe, expect, it } from 'vitest';
import {
  calcularTempoStudio, formatarMinutos, periodoParaIntervalo,
} from '@/lib/dashboard-calc';

describe('periodoParaIntervalo', () => {
  // Os `hoje` injetados aqui usam `Date.UTC(...)` (instante absoluto), não
  // `new Date(ano, mes, dia)` (hora local do processo que roda o teste) — assim o
  // teste vale igual não importa o fuso horário da máquina que roda `vitest`, e
  // exercita de verdade a conversão pra Brasília feita dentro da função (Brasília é
  // sempre UTC-3, sem horário de verão desde 2019).

  it('hoje: intervalo de 1 dia, [hoje, amanhã)', () => {
    // 19/ago/2026 09:00 Brasília = 12:00 UTC. Quarta-feira.
    const r = periodoParaIntervalo('hoje', new Date(Date.UTC(2026, 7, 19, 12, 0, 0)));
    expect(r).toEqual({ inicio: '2026-08-19', fim: '2026-08-20', dias: 1 });
  });

  it('semana: segunda a domingo da semana corrente, 7 dias', () => {
    // 19/ago/2026 é uma quarta-feira (dia 3). Segunda dessa semana: 17/ago.
    const r = periodoParaIntervalo('semana', new Date(Date.UTC(2026, 7, 19, 12, 0, 0)));
    expect(r).toEqual({ inicio: '2026-08-17', fim: '2026-08-24', dias: 7 });
  });

  it('semana: domingo pertence à semana que termina nele, não à seguinte', () => {
    // 23/ago/2026 é domingo. Segunda dessa semana: 17/ago (mesma semana do teste acima).
    const r = periodoParaIntervalo('semana', new Date(Date.UTC(2026, 7, 23, 12, 0, 0)));
    expect(r).toEqual({ inicio: '2026-08-17', fim: '2026-08-24', dias: 7 });
  });

  it('mes: do dia 1 ao dia 1 do mês seguinte, dias = tamanho do mês', () => {
    // agosto tem 31 dias
    const r = periodoParaIntervalo('mes', new Date(Date.UTC(2026, 7, 19, 12, 0, 0)));
    expect(r).toEqual({ inicio: '2026-08-01', fim: '2026-09-01', dias: 31 });
  });

  it('mes: fevereiro (28 dias em 2026, não bissexto)', () => {
    const r = periodoParaIntervalo('mes', new Date(Date.UTC(2026, 1, 10, 12, 0, 0)));
    expect(r).toEqual({ inicio: '2026-02-01', fim: '2026-03-01', dias: 28 });
  });

  it('hoje: às 23h30 de Brasília, que já é o dia seguinte em UTC, "hoje" continua sendo o dia de Brasília', () => {
    // 20/ago/2026 02:30 UTC = 19/ago/2026 23:30 Brasília (UTC-3). Um cálculo feito em
    // cima de getters locais/UTC do servidor (bug original) devolveria 20/ago aqui;
    // o correto, em Brasília, ainda é 19/ago.
    const r = periodoParaIntervalo('hoje', new Date(Date.UTC(2026, 7, 20, 2, 30, 0)));
    expect(r).toEqual({ inicio: '2026-08-19', fim: '2026-08-20', dias: 1 });
  });

  it('semana: perto da meia-noite de Brasília, dia da semana usado é o de Brasília, não o de UTC', () => {
    // 24/ago/2026 (segunda) 02:30 UTC = 23/ago/2026 (domingo) 23:30 Brasília. Em UTC
    // seria segunda (início de nova semana); em Brasília ainda é domingo da semana
    // anterior (17/ago–24/ago, mesma dos dois testes de "semana" acima).
    const r = periodoParaIntervalo('semana', new Date(Date.UTC(2026, 7, 24, 2, 30, 0)));
    expect(r).toEqual({ inicio: '2026-08-17', fim: '2026-08-24', dias: 7 });
  });
});

describe('calcularTempoStudio', () => {
  it('sem blocos, 1 dia: 12h livres, 0 agendadas', () => {
    const r = calcularTempoStudio([], 1);
    expect(r).toEqual({ minutosLivres: 720, minutosAgendados: 0 });
  });

  it('bloco totalmente dentro da janela conta inteiro', () => {
    const r = calcularTempoStudio([{ hora_inicio: '09:00:00', hora_fim: '10:00:00' }], 1);
    expect(r).toEqual({ minutosLivres: 660, minutosAgendados: 60 });
  });

  it('bloco cruzando os dois limites é truncado pra janela inteira (08:00–20:00)', () => {
    const r = calcularTempoStudio([{ hora_inicio: '07:00:00', hora_fim: '21:00:00' }], 1);
    expect(r).toEqual({ minutosLivres: 0, minutosAgendados: 720 });
  });

  it('bloco parcialmente antes da janela conta só a parte dentro', () => {
    const r = calcularTempoStudio([{ hora_inicio: '07:00:00', hora_fim: '09:00:00' }], 1);
    expect(r).toEqual({ minutosLivres: 660, minutosAgendados: 60 });
  });

  it('bloco parcialmente depois da janela conta só a parte dentro', () => {
    const r = calcularTempoStudio([{ hora_inicio: '19:00:00', hora_fim: '21:00:00' }], 1);
    expect(r).toEqual({ minutosLivres: 660, minutosAgendados: 60 });
  });

  it('bloco totalmente fora da janela (antes) conta zero', () => {
    const r = calcularTempoStudio([{ hora_inicio: '06:00:00', hora_fim: '07:30:00' }], 1);
    expect(r).toEqual({ minutosLivres: 720, minutosAgendados: 0 });
  });

  it('bloco totalmente fora da janela (depois) conta zero', () => {
    const r = calcularTempoStudio([{ hora_inicio: '21:00:00', hora_fim: '22:00:00' }], 1);
    expect(r).toEqual({ minutosLivres: 720, minutosAgendados: 0 });
  });

  it('vários blocos somam, capacidade escala com dias', () => {
    const r = calcularTempoStudio(
      [
        { hora_inicio: '09:00:00', hora_fim: '10:00:00' },
        { hora_inicio: '14:00:00', hora_fim: '16:00:00' },
      ],
      7,
    );
    // capacidade = 720 * 7 = 5040; agendado = 60 + 120 = 180
    expect(r).toEqual({ minutosLivres: 4860, minutosAgendados: 180 });
  });
});

describe('formatarMinutos', () => {
  it('minutos exatos em horas', () => {
    expect(formatarMinutos(480)).toBe('8h');
  });

  it('minutos com resto', () => {
    expect(formatarMinutos(370)).toBe('6h10');
  });

  it('zero minutos', () => {
    expect(formatarMinutos(0)).toBe('0h');
  });

  it('menos de uma hora', () => {
    expect(formatarMinutos(45)).toBe('0h45');
  });
});
