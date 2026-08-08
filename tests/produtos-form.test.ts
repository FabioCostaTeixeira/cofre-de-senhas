import { describe, expect, it } from 'vitest';
import {
  lerDadosCombo, lerDadosPlano, lerDadosProduto, lerItensCombo, lerItensPlano, lerMoldeAtributos,
} from '@/lib/produtos-form';
import type { AtributoMolde } from '@/lib/types';

function fd(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

describe('lerMoldeAtributos', () => {
  it('chave vazia retorna erro', () => {
    const r = lerMoldeAtributos(JSON.stringify([{ chave: '  ', rotulo: 'X', tipo: 'texto', obrigatorio: false }]));
    expect(r).toEqual({ error: 'Todo atributo precisa de uma chave.' });
  });

  it('chave duplicada retorna erro', () => {
    const item = { chave: 'qtd', rotulo: 'Qtd', tipo: 'numero', obrigatorio: false };
    const r = lerMoldeAtributos(JSON.stringify([item, item]));
    expect(r).toEqual({ error: 'Chave "qtd" duplicada no molde.' });
  });

  it('molde válido retorna o array', () => {
    const r = lerMoldeAtributos(JSON.stringify([
      { chave: 'qtd_cameras', rotulo: 'Câmeras', tipo: 'numero', obrigatorio: true },
    ]));
    expect(r).toEqual([{ chave: 'qtd_cameras', rotulo: 'Câmeras', tipo: 'numero', obrigatorio: true }]);
  });
});

const molde: AtributoMolde[] = [
  { chave: 'qtd_cameras', rotulo: 'Câmeras', tipo: 'numero', obrigatorio: true },
  { chave: 'inclui_edicao', rotulo: 'Inclui edição', tipo: 'booleano', obrigatorio: false },
];

describe('lerDadosProduto', () => {
  it('nome vazio retorna erro', () => {
    const r = lerDadosProduto(fd({ nome: '', categoriaId: 'c1', preco: '10' }), molde);
    expect(r).toEqual({ error: 'Informe o nome.' });
  });

  it('preço inválido retorna erro', () => {
    const r = lerDadosProduto(fd({ nome: 'Gravação', categoriaId: 'c1', preco: 'abc' }), molde);
    expect(r).toEqual({ error: 'Preço inválido.' });
  });

  it('atributo numérico obrigatório faltando retorna erro', () => {
    const r = lerDadosProduto(fd({ nome: 'Gravação', categoriaId: 'c1', preco: '399' }), molde);
    expect(r).toEqual({ error: 'Informe "Câmeras".' });
  });

  it('lê atributo numérico e booleano (checkbox marcado)', () => {
    const dados = fd({
      nome: 'Gravação', categoriaId: 'c1', preco: '399', attr_qtd_cameras: '3',
    });
    dados.set('attr_inclui_edicao', 'on');
    const r = lerDadosProduto(dados, molde);
    expect('error' in r).toBe(false);
    if (!('error' in r)) {
      expect(r.atributos).toEqual({ qtd_cameras: 3, inclui_edicao: true });
      expect(r.preco).toBe(399);
    }
  });
});

describe('lerItensCombo', () => {
  it('lista vazia retorna erro', () => {
    expect(lerItensCombo('[]')).toEqual({ error: 'Adicione pelo menos um item.' });
  });

  it('item com tipo combo é rejeitado (combo só aceita produto)', () => {
    const r = lerItensCombo(JSON.stringify([{ tipo: 'combo', valor: 'x', quantidade: 1 }]));
    expect(r).toEqual({ error: 'Itens do combo inválidos.' });
  });

  it('itens válidos retornam o array', () => {
    const r = lerItensCombo(JSON.stringify([{ tipo: 'produto', valor: 'p1', quantidade: 4 }]));
    expect(r).toEqual([{ tipo: 'produto', valor: 'p1', quantidade: 4 }]);
  });

  it('mescla itens repetidos (mesmo tipo+valor) somando a quantidade', () => {
    const r = lerItensCombo(JSON.stringify([
      { tipo: 'produto', valor: 'p1', quantidade: 1 },
      { tipo: 'produto', valor: 'p2', quantidade: 5 },
      { tipo: 'produto', valor: 'p1', quantidade: 2 },
    ]));
    expect(r).toEqual([
      { tipo: 'produto', valor: 'p1', quantidade: 3 },
      { tipo: 'produto', valor: 'p2', quantidade: 5 },
    ]);
  });
});

describe('lerItensPlano', () => {
  it('aceita item tipo produto e tipo combo misturados', () => {
    const r = lerItensPlano(JSON.stringify([
      { tipo: 'produto', valor: 'p1', quantidade: 2 },
      { tipo: 'combo', valor: 'c1', quantidade: 1 },
    ]));
    expect(r).toEqual([
      { tipo: 'produto', valor: 'p1', quantidade: 2 },
      { tipo: 'combo', valor: 'c1', quantidade: 1 },
    ]);
  });

  it('quantidade zero retorna erro', () => {
    const r = lerItensPlano(JSON.stringify([{ tipo: 'produto', valor: 'p1', quantidade: 0 }]));
    expect(r).toEqual({ error: 'Quantidade precisa ser maior que zero.' });
  });

  it('mescla itens repetidos preservando a ordem da primeira aparição', () => {
    const r = lerItensPlano(JSON.stringify([
      { tipo: 'combo', valor: 'c1', quantidade: 1 },
      { tipo: 'produto', valor: 'p1', quantidade: 1 },
      { tipo: 'combo', valor: 'c1', quantidade: 3 },
    ]));
    expect(r).toEqual([
      { tipo: 'combo', valor: 'c1', quantidade: 4 },
      { tipo: 'produto', valor: 'p1', quantidade: 1 },
    ]);
  });
});

describe('lerDadosCombo', () => {
  it('nome vazio retorna erro', () => {
    const r = lerDadosCombo(fd({ nome: '', preco: '10', itens: '[{"tipo":"produto","valor":"p1","quantidade":1}]' }));
    expect(r).toEqual({ error: 'Informe o nome.' });
  });
});

describe('lerDadosPlano', () => {
  it('tipo de cobrança inválido retorna erro', () => {
    const r = lerDadosPlano(fd({ nome: 'X', tipoCobranca: 'errado', preco: '10', itens: '[]' }));
    expect(r).toEqual({ error: 'Escolha o tipo de cobrança.' });
  });

  it('pacote_fechado sem validade retorna erro', () => {
    const r = lerDadosPlano(fd({
      nome: 'X', tipoCobranca: 'pacote_fechado', preco: '10',
      itens: '[{"tipo":"produto","valor":"p1","quantidade":1}]',
    }));
    expect(r).toEqual({ error: 'Informe a validade em dias.' });
  });

  it('assinatura monta ciclo mensal automaticamente', () => {
    const r = lerDadosPlano(fd({
      nome: 'X', tipoCobranca: 'assinatura', preco: '1500',
      itens: '[{"tipo":"produto","valor":"p1","quantidade":1}]',
    }));
    expect('error' in r).toBe(false);
    if (!('error' in r)) {
      expect(r.ciclo).toBe('mensal');
      expect(r.validade_dias).toBeNull();
    }
  });
});
