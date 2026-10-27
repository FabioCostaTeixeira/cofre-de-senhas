import { describe, expect, it } from 'vitest';
import { lerDadosAgendamento, lerDadosBloqueio, validarPeriodoAgendamento } from '@/lib/agenda-form';

function formData(campos: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
}

const CAMPOS_VALIDOS = {
  clienteId: 'c1', localId: 'l1', estudioId: 'e1', categoriaId: 'cat1',
  status: 'agendado', data: '2026-08-20', horaInicio: '09:00', horaFim: '10:00',
};

describe('lerDadosAgendamento', () => {
  it('sem cliente retorna erro', () => {
    const r = lerDadosAgendamento(formData({ ...CAMPOS_VALIDOS, clienteId: '' }));
    expect(r).toEqual({ error: 'Escolha o cliente.' });
  });

  it('sem local retorna erro', () => {
    const r = lerDadosAgendamento(formData({ ...CAMPOS_VALIDOS, localId: '' }));
    expect(r).toEqual({ error: 'Escolha o local de gravação.' });
  });

  it('sem estúdio retorna erro', () => {
    const r = lerDadosAgendamento(formData({ ...CAMPOS_VALIDOS, estudioId: '' }));
    expect(r).toEqual({ error: 'Escolha o estúdio.' });
  });

  it('sem categoria retorna erro', () => {
    const r = lerDadosAgendamento(formData({ ...CAMPOS_VALIDOS, categoriaId: '' }));
    expect(r).toEqual({ error: 'Escolha o tipo de gravação.' });
  });

  it('status inválido retorna erro', () => {
    const r = lerDadosAgendamento(formData({ ...CAMPOS_VALIDOS, status: 'invalido' }));
    expect(r).toEqual({ error: 'Status inválido.' });
  });

  it('data em formato errado retorna erro', () => {
    const r = lerDadosAgendamento(formData({ ...CAMPOS_VALIDOS, data: '20/08/2026' }));
    expect(r).toEqual({ error: 'Informe a data.' });
  });

  it('horário em formato errado retorna erro', () => {
    const r = lerDadosAgendamento(formData({ ...CAMPOS_VALIDOS, horaInicio: '9h' }));
    expect(r).toEqual({ error: 'Informe o horário.' });
  });

  it('horário fora do múltiplo de 30 minutos retorna erro', () => {
    const r = lerDadosAgendamento(formData({ ...CAMPOS_VALIDOS, horaInicio: '09:15' }));
    expect(r).toEqual({ error: 'Horário precisa ser múltiplo de 30 minutos.' });
  });

  it('hora fim igual ou antes da hora início retorna erro', () => {
    const r = lerDadosAgendamento(formData({ ...CAMPOS_VALIDOS, horaFim: '09:00' }));
    expect(r).toEqual({ error: 'Horário de fim precisa ser depois do início.' });
  });

  it('campos completos e válidos são lidos corretamente', () => {
    const r = lerDadosAgendamento(formData(CAMPOS_VALIDOS));
    expect(r).toEqual({
      cliente_id: 'c1', local_id: 'l1', estudio_id: 'e1', categoria_produto_id: 'cat1',
      status: 'agendado', data: '2026-08-20', hora_inicio: '09:00', hora_fim: '10:00',
    });
  });
});

describe('validarPeriodoAgendamento', () => {
  it.each([
    ['20/08/2026', '09:00', '10:00', 'Informe a data.'],
    ['2026-08-20', '9h', '10:00', 'Informe o horário.'],
    ['2026-08-20', '09:05', '10:00', 'Horário precisa ser múltiplo de 30 minutos.'],
    ['2026-08-20', '09:00', '09:45', 'Horário precisa ser múltiplo de 30 minutos.'],
    ['2026-08-20', '06:30', '08:00', 'Horário precisa estar entre 07:00 e 21:00.'],
    ['2026-08-20', '20:00', '21:30', 'Horário precisa estar entre 07:00 e 21:00.'],
    ['2026-08-20', '10:00', '10:00', 'Horário de fim precisa ser depois do início.'],
  ])('rejeita período inválido (%s, %s, %s)', (data, inicio, fim, error) => {
    expect(validarPeriodoAgendamento(data, inicio, fim)).toEqual({ error });
  });

  it('aceita data e horários válidos', () => {
    expect(validarPeriodoAgendamento('2026-08-20', '09:00', '10:00')).toBeNull();
  });

  it('aceita os limites exatos da janela (07:00 e 21:00)', () => {
    expect(validarPeriodoAgendamento('2026-08-20', '07:00', '21:00')).toBeNull();
  });
});

const CAMPOS_BLOQUEIO_VALIDOS = { estudioId: 'e1', data: '2026-08-20', horaInicio: '09:00', horaFim: '10:00', motivo: 'Manutenção do equipamento' };

describe('lerDadosBloqueio', () => {
  it('sem estúdio retorna erro', () => {
    const r = lerDadosBloqueio(formData({ ...CAMPOS_BLOQUEIO_VALIDOS, estudioId: '' }));
    expect(r).toEqual({ error: 'Escolha o estúdio.' });
  });

  it('data em formato errado retorna erro', () => {
    const r = lerDadosBloqueio(formData({ ...CAMPOS_BLOQUEIO_VALIDOS, data: '20/08/2026' }));
    expect(r).toEqual({ error: 'Informe a data.' });
  });

  it('horário fora do múltiplo de 30 minutos retorna erro', () => {
    const r = lerDadosBloqueio(formData({ ...CAMPOS_BLOQUEIO_VALIDOS, horaInicio: '09:15' }));
    expect(r).toEqual({ error: 'Horário precisa ser múltiplo de 30 minutos.' });
  });

  it('motivo é opcional (vazio vira null)', () => {
    const r = lerDadosBloqueio(formData({ ...CAMPOS_BLOQUEIO_VALIDOS, motivo: '' }));
    expect(r).toEqual({ estudio_id: 'e1', data: '2026-08-20', hora_inicio: '09:00', hora_fim: '10:00', motivo: null });
  });

  it('campos completos e válidos são lidos corretamente', () => {
    const r = lerDadosBloqueio(formData(CAMPOS_BLOQUEIO_VALIDOS));
    expect(r).toEqual({
      estudio_id: 'e1', data: '2026-08-20', hora_inicio: '09:00', hora_fim: '10:00',
      motivo: 'Manutenção do equipamento',
    });
  });
});
