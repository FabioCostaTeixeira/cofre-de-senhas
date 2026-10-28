import { describe, expect, it } from 'vitest';
import { produtoPermitidoNaCategoria } from '@/lib/produtos-regra';

const gravacao = { id: 'cat1', produtos_exclusivos: false };
const edicao = { id: 'cat2', produtos_exclusivos: false };
const cortes = { id: 'cat3', produtos_exclusivos: true };

describe('produtoPermitidoNaCategoria', () => {
  it('categoria comum aceita produto de qualquer categoria comum, inclusive de outra', () => {
    expect(produtoPermitidoNaCategoria(gravacao, gravacao)).toBe(true);
    expect(produtoPermitidoNaCategoria(edicao, gravacao)).toBe(true);
  });

  it('categoria comum recusa produto de categoria exclusiva', () => {
    expect(produtoPermitidoNaCategoria(cortes, gravacao)).toBe(false);
    expect(produtoPermitidoNaCategoria(cortes, edicao)).toBe(false);
  });

  it('categoria exclusiva só aceita os produtos dela', () => {
    expect(produtoPermitidoNaCategoria(cortes, cortes)).toBe(true);
    expect(produtoPermitidoNaCategoria(gravacao, cortes)).toBe(false);
  });
});
