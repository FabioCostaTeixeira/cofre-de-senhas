import { describe, expect, it } from 'vitest';
import { lerDadosContratacao } from '@/lib/contratacao-form';

function formData(campos: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
}

describe('lerDadosContratacao', () => {
  it('sem cliente retorna erro', () => {
    const r = lerDadosContratacao(formData({ tipo: 'avulso', produtoId: 'p1', quantidade: '2' }));
    expect(r).toEqual({ error: 'Escolha o cliente.' });
  });

  it('tipo inválido retorna erro', () => {
    const r = lerDadosContratacao(formData({ clienteId: 'c1', tipo: 'combo_avulso', quantidade: '1' }));
    expect(r).toEqual({ error: 'Escolha o tipo de contratação.' });
  });

  it('quantidade vazia retorna erro', () => {
    const r = lerDadosContratacao(formData({ clienteId: 'c1', tipo: 'avulso', produtoId: 'p1', quantidade: '' }));
    expect(r).toEqual({ error: 'Quantidade precisa ser um número inteiro maior que zero.' });
  });

  it('quantidade zero retorna erro', () => {
    const r = lerDadosContratacao(formData({ clienteId: 'c1', tipo: 'avulso', produtoId: 'p1', quantidade: '0' }));
    expect(r).toEqual({ error: 'Quantidade precisa ser um número inteiro maior que zero.' });
  });

  it('quantidade não inteira retorna erro', () => {
    const r = lerDadosContratacao(formData({ clienteId: 'c1', tipo: 'avulso', produtoId: 'p1', quantidade: '2.5' }));
    expect(r).toEqual({ error: 'Quantidade precisa ser um número inteiro maior que zero.' });
  });

  it('avulso sem produto retorna erro', () => {
    const r = lerDadosContratacao(formData({ clienteId: 'c1', tipo: 'avulso', quantidade: '1' }));
    expect(r).toEqual({ error: 'Escolha o produto.' });
  });

  it('combo sem combo retorna erro', () => {
    const r = lerDadosContratacao(formData({ clienteId: 'c1', tipo: 'combo', quantidade: '1' }));
    expect(r).toEqual({ error: 'Escolha o combo.' });
  });

  it('plano sem plano retorna erro', () => {
    const r = lerDadosContratacao(formData({ clienteId: 'c1', tipo: 'plano', quantidade: '1' }));
    expect(r).toEqual({ error: 'Escolha o plano.' });
  });

  it('avulso válido é lido corretamente', () => {
    const r = lerDadosContratacao(formData({ clienteId: 'c1', tipo: 'avulso', produtoId: 'p1', quantidade: '3' }));
    expect(r).toEqual({ cliente_id: 'c1', tipo: 'avulso', produto_id: 'p1', combo_id: null, plano_id: null, quantidade: 3 });
  });

  it('combo válido é lido corretamente', () => {
    const r = lerDadosContratacao(formData({ clienteId: 'c1', tipo: 'combo', comboId: 'cb1', quantidade: '2' }));
    expect(r).toEqual({ cliente_id: 'c1', tipo: 'combo', produto_id: null, combo_id: 'cb1', plano_id: null, quantidade: 2 });
  });

  it('plano válido é lido corretamente', () => {
    const r = lerDadosContratacao(formData({ clienteId: 'c1', tipo: 'plano', planoId: 'pl1', quantidade: '1' }));
    expect(r).toEqual({ cliente_id: 'c1', tipo: 'plano', produto_id: null, combo_id: null, plano_id: 'pl1', quantidade: 1 });
  });
});
