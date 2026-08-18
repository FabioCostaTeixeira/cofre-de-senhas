import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { PlanoClient } from '@/components/PlanoClient';
import type { Combo, Produto } from '@/lib/types';

const produto: Produto = {
  id: '11111111-1111-1111-1111-111111111111', categoria_id: 'c1', nome: 'Gravação',
  descricao: null, atributos: {}, preco: 399, ativo: true, created_at: '2026-08-08T00:00:00Z',
};
const combo: Combo = {
  id: '22222222-2222-2222-2222-222222222222', nome: 'Combo cortes', descricao: null, preco: 596,
  ativo: true, created_at: '2026-08-08T00:00:00Z', itens: [],
};

const criar = vi.fn();
const salvar = vi.fn();
const apagar = vi.fn();

afterEach(() => cleanup());

describe('PlanoClient', () => {
  it('escolher pacote_fechado mostra campo de validade; assinatura esconde', () => {
    render(<PlanoClient itens={[]} produtos={[produto]} combos={[combo]} criar={criar} salvar={salvar} apagar={apagar} />);
    fireEvent.click(screen.getByText('Novo Plano'));
    fireEvent.change(screen.getByLabelText('Tipo de cobrança'), { target: { value: 'pacote_fechado' } });
    expect(screen.getByLabelText('Validade (dias)')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Tipo de cobrança'), { target: { value: 'assinatura' } });
    expect(screen.queryByLabelText('Validade (dias)')).not.toBeInTheDocument();
  });

  it('repetidor de itens mistura opção de produto e de combo', () => {
    render(<PlanoClient itens={[]} produtos={[produto]} combos={[combo]} criar={criar} salvar={salvar} apagar={apagar} />);
    fireEvent.click(screen.getByText('Novo Plano'));
    const select = screen.getByLabelText('Item');
    const rotulos = Array.from(select.querySelectorAll('option')).map((o) => o.textContent);
    expect(rotulos).toEqual(['Gravação', 'Combo cortes']);
  });
});
