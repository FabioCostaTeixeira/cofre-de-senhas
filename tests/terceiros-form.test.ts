import { describe, expect, it } from 'vitest';
import { lerDadosTerceiro } from '@/lib/terceiros-form';

function formData(campos: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
}

describe('lerDadosTerceiro', () => {
  it('nome vazio retorna erro', () => {
    const r = lerDadosTerceiro(formData({ nome: '  ' }));
    expect(r).toEqual({ error: 'Informe o nome.' });
  });

  it('UF com formato inválido retorna erro', () => {
    const r = lerDadosTerceiro(formData({ nome: 'ACME', uf: 'SPX' }));
    expect(r).toEqual({ error: 'Estado inválido. Use a sigla, ex.: SP.' });
  });

  it('UF minúscula é aceita e vira maiúscula', () => {
    const r = lerDadosTerceiro(formData({ nome: 'ACME', uf: 'sp' }));
    expect('error' in r).toBe(false);
    if (!('error' in r)) expect(r.uf).toBe('SP');
  });

  it('campos opcionais em branco viram null', () => {
    const r = lerDadosTerceiro(formData({ nome: 'ACME' }));
    expect('error' in r).toBe(false);
    if (!('error' in r)) {
      expect(r.contato_responsavel).toBeNull();
      expect(r.email).toBeNull();
      expect(r.telefone).toBeNull();
      expect(r.cidade).toBeNull();
      expect(r.uf).toBeNull();
    }
  });

  it('telefone com máscara vira só dígitos', () => {
    const r = lerDadosTerceiro(formData({ nome: 'ACME', telefone: '(11) 98765-4321' }));
    expect('error' in r).toBe(false);
    if (!('error' in r)) expect(r.telefone).toBe('11987654321');
  });
});
