import { describe, expect, it } from 'vitest';
import { lerDadosOS } from '@/lib/os-form';

function formData(campos: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
}

const ITEM_SIMPLES = { produto_id: 'p1', quantidade: 2, pre_agendar: false };
const ITEM_PRE_AGENDADO = {
  produto_id: 'p1', quantidade: 1, pre_agendar: true,
  data: '2026-09-10', hora_inicio: '09:00', hora_fim: '10:00', local_id: 'l1', estudio_id: 'e1',
};

describe('lerDadosOS', () => {
  it('sem cliente retorna erro', () => {
    const r = lerDadosOS(formData({ itens: JSON.stringify([ITEM_SIMPLES]) }));
    expect(r).toEqual({ error: 'Escolha o cliente.' });
  });

  it('itens em JSON inválido retorna erro', () => {
    const r = lerDadosOS(formData({ clienteId: 'c1', itens: '{not json' }));
    expect(r).toEqual({ error: 'Itens inválidos.' });
  });

  it('sem nenhum item retorna erro', () => {
    const r = lerDadosOS(formData({ clienteId: 'c1', itens: '[]' }));
    expect(r).toEqual({ error: 'Adicione pelo menos um item.' });
  });

  it('item sem produto_id retorna erro', () => {
    const r = lerDadosOS(formData({ clienteId: 'c1', itens: JSON.stringify([{ ...ITEM_SIMPLES, produto_id: '' }]) }));
    expect(r).toEqual({ error: 'Escolha o produto de cada item.' });
  });

  it('item com quantidade zero retorna erro', () => {
    const r = lerDadosOS(formData({ clienteId: 'c1', itens: JSON.stringify([{ ...ITEM_SIMPLES, quantidade: 0 }]) }));
    expect(r).toEqual({ error: 'Quantidade precisa ser um número inteiro maior que zero.' });
  });

  it('item com quantidade não inteira retorna erro', () => {
    const r = lerDadosOS(formData({ clienteId: 'c1', itens: JSON.stringify([{ ...ITEM_SIMPLES, quantidade: 1.5 }]) }));
    expect(r).toEqual({ error: 'Quantidade precisa ser um número inteiro maior que zero.' });
  });

  it('item pré-agendado sem local retorna erro', () => {
    const r = lerDadosOS(formData({ clienteId: 'c1', itens: JSON.stringify([{ ...ITEM_PRE_AGENDADO, local_id: '' }]) }));
    expect(r).toEqual({ error: 'Escolha o local de gravação do item pré-agendado.' });
  });

  it('item pré-agendado sem estúdio retorna erro', () => {
    const r = lerDadosOS(formData({ clienteId: 'c1', itens: JSON.stringify([{ ...ITEM_PRE_AGENDADO, estudio_id: '' }]) }));
    expect(r).toEqual({ error: 'Escolha o estúdio do item pré-agendado.' });
  });

  it('item pré-agendado com data inválida retorna erro', () => {
    const r = lerDadosOS(formData({ clienteId: 'c1', itens: JSON.stringify([{ ...ITEM_PRE_AGENDADO, data: '10/09/2026' }]) }));
    expect(r).toEqual({ error: 'Informe a data.' });
  });

  it('item pré-agendado fora do múltiplo de 30 minutos retorna erro (mesma regra da Agenda)', () => {
    const r = lerDadosOS(formData({ clienteId: 'c1', itens: JSON.stringify([{ ...ITEM_PRE_AGENDADO, hora_inicio: '09:15' }]) }));
    expect(r).toEqual({ error: 'Horário precisa ser múltiplo de 30 minutos.' });
  });

  it('item pré-agendado fora de 07:00–21:00 retorna erro (mesma regra da Agenda)', () => {
    const r = lerDadosOS(formData({ clienteId: 'c1', itens: JSON.stringify([{ ...ITEM_PRE_AGENDADO, hora_inicio: '06:00' }]) }));
    expect(r).toEqual({ error: 'Horário precisa estar entre 07:00 e 21:00.' });
  });

  it('item sem pré-agendar é lido com campos de agenda nulos', () => {
    const r = lerDadosOS(formData({ clienteId: 'c1', itens: JSON.stringify([ITEM_SIMPLES]) }));
    expect(r).toEqual({
      cliente_id: 'c1',
      itens: [{
        produto_id: 'p1', quantidade: 2, pre_agendar: false,
        data: null, hora_inicio: null, hora_fim: null, local_id: null, estudio_id: null,
      }],
    });
  });

  it('item pré-agendado é lido com todos os campos de agenda', () => {
    const r = lerDadosOS(formData({ clienteId: 'c1', itens: JSON.stringify([ITEM_PRE_AGENDADO]) }));
    expect(r).toEqual({
      cliente_id: 'c1',
      itens: [{
        produto_id: 'p1', quantidade: 1, pre_agendar: true,
        data: '2026-09-10', hora_inicio: '09:00', hora_fim: '10:00', local_id: 'l1', estudio_id: 'e1',
      }],
    });
  });

  it('múltiplos itens são todos lidos, mistura de pré-agendado e não', () => {
    const r = lerDadosOS(formData({ clienteId: 'c1', itens: JSON.stringify([ITEM_SIMPLES, ITEM_PRE_AGENDADO]) }));
    expect('error' in r).toBe(false);
    if (!('error' in r)) expect(r.itens).toHaveLength(2);
  });
});
