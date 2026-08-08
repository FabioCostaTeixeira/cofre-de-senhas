import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ComboClient } from '@/components/ComboClient';
import type { Combo, Produto } from '@/lib/types';

const produto: Produto = {
  id: '11111111-1111-1111-1111-111111111111', categoria_id: 'c1', nome: 'Corte editado',
  descricao: null, atributos: {}, preco: 199, ativo: true, created_at: '2026-08-08T00:00:00Z',
};

const combo: Combo = {
  id: '22222222-2222-2222-2222-222222222222', nome: 'Combo 4 cortes', descricao: null, preco: 596,
  ativo: true, created_at: '2026-08-08T00:00:00Z',
  itens: [{ tipo: 'produto', valor: produto.id, nome: produto.nome, quantidade: 4, ativo: true }],
};

const criar = vi.fn();
const salvar = vi.fn();
const apagar = vi.fn();

afterEach(() => cleanup());

describe('ComboClient', () => {
  it('lista combos com a quantidade de itens', () => {
    render(<ComboClient itens={[combo]} produtos={[produto]} criar={criar} salvar={salvar} apagar={apagar} />);
    expect(screen.getByText('Combo 4 cortes')).toBeInTheDocument();
  });

  it('botão de soma sugerida preenche o campo preço com a soma dos itens', () => {
    render(<ComboClient itens={[]} produtos={[produto]} criar={criar} salvar={salvar} apagar={apagar} />);
    fireEvent.click(screen.getByText('Adicionar'));
    fireEvent.click(screen.getByText(/Usar soma sugerida/));
    expect(screen.getByLabelText('Preço (R$)')).toHaveValue('199.00');
  });
});
