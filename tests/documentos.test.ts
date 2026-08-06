import { describe, expect, it } from 'vitest';
import {
  formatarDataBR, mascararCep, mascararCnpj, mascararCpf, mascararTelefone,
  soDigitos, validarCnpj, validarCpf,
} from '@/lib/documentos';

describe('soDigitos', () => {
  it('remove tudo que não é dígito', () => {
    expect(soDigitos('529.982.247-25')).toBe('52998224725');
    expect(soDigitos('(11) 98765-4321')).toBe('11987654321');
    expect(soDigitos('')).toBe('');
  });
});

describe('validarCpf', () => {
  it('aceita CPF válido com e sem máscara', () => {
    expect(validarCpf('529.982.247-25')).toBe(true);
    expect(validarCpf('52998224725')).toBe(true);
  });

  it('rejeita dígito verificador errado', () => {
    expect(validarCpf('529.982.247-26')).toBe(false);
  });

  it('rejeita sequência repetida, que passa no cálculo mas nunca é documento real', () => {
    expect(validarCpf('111.111.111-11')).toBe(false);
    expect(validarCpf('00000000000')).toBe(false);
    expect(validarCpf('99999999999')).toBe(false);
  });

  it('rejeita tamanho errado e string vazia', () => {
    expect(validarCpf('')).toBe(false);
    expect(validarCpf('5299822472')).toBe(false);
    expect(validarCpf('529982247250')).toBe(false);
  });
});

describe('validarCnpj', () => {
  it('aceita CNPJ válido com e sem máscara', () => {
    expect(validarCnpj('11.222.333/0001-81')).toBe(true);
    expect(validarCnpj('11222333000181')).toBe(true);
  });

  it('rejeita dígito verificador errado', () => {
    expect(validarCnpj('11.222.333/0001-82')).toBe(false);
  });

  it('rejeita sequência repetida', () => {
    expect(validarCnpj('11111111111111')).toBe(false);
  });

  it('rejeita tamanho errado e string vazia', () => {
    expect(validarCnpj('')).toBe(false);
    expect(validarCnpj('1122233300018')).toBe(false);
  });
});

describe('máscaras', () => {
  it('formata documentos completos', () => {
    expect(mascararCpf('52998224725')).toBe('529.982.247-25');
    expect(mascararCnpj('11222333000181')).toBe('11.222.333/0001-81');
    expect(mascararCep('01310100')).toBe('01310-100');
  });

  it('formata telefone de 11 e de 10 dígitos', () => {
    expect(mascararTelefone('11987654321')).toBe('(11) 98765-4321');
    expect(mascararTelefone('1133334444')).toBe('(11) 3333-4444');
  });

  it('devolve a entrada intacta quando o tamanho não bate, em vez de truncar', () => {
    expect(mascararCpf('529')).toBe('529');
    expect(mascararCnpj('112')).toBe('112');
    expect(mascararCep('013')).toBe('013');
    expect(mascararTelefone('119')).toBe('119');
  });
});

describe('formatarDataBR', () => {
  it('converte yyyy-mm-dd para dd/mm/yyyy por manipulação de string', () => {
    expect(formatarDataBR('2026-08-06')).toBe('06/08/2026');
    expect(formatarDataBR('2000-01-31')).toBe('31/01/2000');
  });

  it('não desloca o dia por fuso horário — 1º de um mês continua 1º', () => {
    // Regressão do motivo de não usar Date/Intl aqui: new Date('2026-01-01') é
    // meia-noite UTC, que em America/Sao_Paulo (UTC-3) é 31/12/2025 21:00 — um
    // formatador baseado em Date devolveria "31/12/2025" para esta entrada.
    expect(formatarDataBR('2026-01-01')).toBe('01/01/2026');
  });

  it('devolve a entrada intacta se não tiver o formato esperado', () => {
    expect(formatarDataBR('')).toBe('');
    expect(formatarDataBR('data-invalida')).toBe('data-invalida');
  });
});
