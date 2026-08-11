import { describe, expect, it } from 'vitest';
import { lerDadosAgendamento } from '@/lib/agenda-form';

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

  it('horário fora do múltiplo de 15 minutos retorna erro', () => {
    const r = lerDadosAgendamento(formData({ ...CAMPOS_VALIDOS, horaInicio: '09:05' }));
    expect(r).toEqual({ error: 'Horário precisa ser múltiplo de 15 minutos.' });
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
