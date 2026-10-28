import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ProdutoClient } from '@/components/ProdutoClient';
import type { CategoriaProduto, Produto } from '@/lib/types';

const gravacao: CategoriaProduto = {
  id: 'aaaaaaaa-1111-1111-1111-111111111111', nome: 'Gravação', unidade_consumo: 'gravação',
  atributos_molde: [{ chave: 'qtd_cameras', rotulo: 'Câmeras', tipo: 'numero', obrigatorio: true }],
  ativo: true, planejamento: 'gravacao',
};
const corte: CategoriaProduto = {
  id: 'bbbbbbbb-2222-2222-2222-222222222222', nome: 'Corte', unidade_consumo: 'corte',
  atributos_molde: [], ativo: true, planejamento: 'edicao',
};

const produto: Produto = {
  id: '11111111-1111-1111-1111-111111111111', categoria_id: gravacao.id, nome: 'Gravação 1h',
  descricao: null, atributos: { qtd_cameras: 3 }, preco: 399, ativo: true, created_at: '2026-08-08T00:00:00Z',
};

const criar = vi.fn();
const salvar = vi.fn();
const apagar = vi.fn();

afterEach(() => cleanup());

describe('ProdutoClient', () => {
  it('mostra campo dinâmico da categoria selecionada, e some ao trocar pra categoria sem molde', () => {
    render(
      <ProdutoClient itens={[]} categorias={[gravacao, corte]} criar={criar} salvar={salvar} apagar={apagar} />,
    );
    fireEvent.click(screen.getByText('Novo Produto'));
    expect(screen.getByText('Câmeras *')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: corte.id } });
    expect(screen.queryByText('Câmeras *')).not.toBeInTheDocument();
  });

  it('clicar na linha abre o modal com o atributo dinâmico preenchido', () => {
    render(
      <ProdutoClient itens={[produto]} categorias={[gravacao, corte]} criar={criar} salvar={salvar} apagar={apagar} />,
    );
    fireEvent.click(screen.getByText('Gravação 1h'));
    expect(screen.getByLabelText('Câmeras *')).toHaveValue(3);
  });
});
