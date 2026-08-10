import { describe, expect, it } from 'vitest';
import { lerDadosLocal, lerEstudios } from '@/lib/locais-gravacao-form';

function formData(campos: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
}

describe('lerEstudios', () => {
  it('JSON inválido retorna erro', () => {
    expect(lerEstudios('não é json')).toEqual({ error: 'Lista de estúdios inválida.' });
  });

  it('não-array retorna erro', () => {
    expect(lerEstudios('{}')).toEqual({ error: 'Lista de estúdios inválida.' });
  });

  it('lista vazia é aceita', () => {
    expect(lerEstudios('[]')).toEqual([]);
  });

  it('item sem nome retorna erro', () => {
    expect(lerEstudios('[{"id":"x"}]')).toEqual({ error: 'Lista de estúdios inválida.' });
  });

  it('nome em branco retorna erro', () => {
    expect(lerEstudios('[{"nome":"   "}]')).toEqual({ error: 'Todo estúdio precisa de um nome.' });
  });

  it('item com id preserva o id; item sem id não ganha um', () => {
    const r = lerEstudios('[{"id":"e1","nome":"Estúdio A"},{"nome":"Estúdio B"}]');
    expect(r).toEqual([{ id: 'e1', nome: 'Estúdio A' }, { nome: 'Estúdio B' }]);
  });
});

describe('lerDadosLocal', () => {
  it('nome vazio retorna erro', () => {
    const r = lerDadosLocal(formData({ nome: '  ', estudios: '[]' }));
    expect(r).toEqual({ error: 'Informe o nome.' });
  });

  it('estúdio inválido propaga o erro', () => {
    const r = lerDadosLocal(formData({ nome: 'P7 BH', estudios: 'x' }));
    expect(r).toEqual({ error: 'Lista de estúdios inválida.' });
  });

  it('campos opcionais em branco viram null; estúdios sem "estudios" no form viram []', () => {
    const r = lerDadosLocal(formData({ nome: 'P7 BH' }));
    expect('error' in r).toBe(false);
    if (!('error' in r)) {
      expect(r.endereco).toBeNull();
      expect(r.responsavel).toBeNull();
      expect(r.estudios).toEqual([]);
    }
  });

  it('lê nome, endereço, responsável e estúdios completos', () => {
    const r = lerDadosLocal(formData({
      nome: 'P7 BH', endereco: 'Rua X, 100', responsavel: 'Fulano',
      estudios: '[{"nome":"Estúdio A"}]',
    }));
    expect('error' in r).toBe(false);
    if (!('error' in r)) {
      expect(r.endereco).toBe('Rua X, 100');
      expect(r.responsavel).toBe('Fulano');
      expect(r.estudios).toEqual([{ nome: 'Estúdio A' }]);
    }
  });
});
