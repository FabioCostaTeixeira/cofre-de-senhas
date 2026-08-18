import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { CategoriaClient } from '@/components/CategoriaClient';
import type { CategoriaProduto } from '@/lib/types';

const categoria: CategoriaProduto = {
  id: '11111111-1111-1111-1111-111111111111', nome: 'Gravação', unidade_consumo: 'gravação',
  atributos_molde: [{ chave: 'qtd_cameras', rotulo: 'Câmeras', tipo: 'numero', obrigatorio: true }],
  ativo: true,
};

const criar = vi.fn();
const salvar = vi.fn();
const apagar = vi.fn();

afterEach(() => cleanup());

describe('CategoriaClient', () => {
  it('lista categorias e mostra a quantidade de atributos', () => {
    render(<CategoriaClient itens={[categoria]} criar={criar} salvar={salvar} apagar={apagar} />);
    expect(screen.getByText('Gravação')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '1' })).toBeInTheDocument();
  });

  it('adicionar linha no molde do formulário novo cria um campo de chave', () => {
    render(<CategoriaClient itens={[]} criar={criar} salvar={salvar} apagar={apagar} />);
    fireEvent.click(screen.getByText('Nova Categoria'));
    fireEvent.click(screen.getByText('+ Adicionar atributo'));
    expect(screen.getByText('Chave')).toBeInTheDocument();
  });
});
