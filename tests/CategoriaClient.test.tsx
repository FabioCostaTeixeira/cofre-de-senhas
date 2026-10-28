import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { CategoriaClient } from '@/components/CategoriaClient';
import type { CategoriaProduto } from '@/lib/types';

const categoria: CategoriaProduto = {
  id: '11111111-1111-1111-1111-111111111111', nome: 'Podcast', unidade_consumo: 'gravação',
  atributos_molde: [{ chave: 'qtd_cameras', rotulo: 'Câmeras', tipo: 'numero', obrigatorio: true }],
  ativo: true, planejamento: 'gravacao', produtos_exclusivos: false,
};

const criar = vi.fn();
const salvar = vi.fn();
const apagar = vi.fn();

afterEach(() => cleanup());

describe('CategoriaClient', () => {
  it('lista categorias e mostra a quantidade de atributos', () => {
    render(<CategoriaClient itens={[categoria]} criar={criar} salvar={salvar} apagar={apagar} />);
    expect(screen.getByText('Podcast')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '1' })).toBeInTheDocument();
  });

  it('mostra o planejamento da categoria na lista e no formulário de edição', () => {
    render(<CategoriaClient itens={[categoria]} criar={criar} salvar={salvar} apagar={apagar} />);
    expect(screen.getByRole('cell', { name: 'Gravação' })).toBeInTheDocument();
    fireEvent.click(screen.getByText('Podcast'));
    const select = screen.getByRole('dialog').querySelector('select[name="planejamento"]') as HTMLSelectElement;
    expect(select.value).toBe('gravacao');
  });

  it('adicionar linha no molde do formulário novo cria um campo de chave', () => {
    render(<CategoriaClient itens={[]} criar={criar} salvar={salvar} apagar={apagar} />);
    fireEvent.click(screen.getByText('Nova Categoria'));
    fireEvent.click(screen.getByText('+ Adicionar atributo'));
    expect(screen.getByText('Chave')).toBeInTheDocument();
  });

  it('reabre o modal de criação depois de um sucesso anterior (regressão Finding 1)', async () => {
    const criarComSucesso = vi.fn().mockResolvedValue({ ok: 'Categoria criada com sucesso' });
    render(<CategoriaClient itens={[]} criar={criarComSucesso} salvar={salvar} apagar={apagar} />);

    // Abre, preenche o campo obrigatório e submete com sucesso.
    fireEvent.click(screen.getByText('Nova Categoria'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('dialog').querySelector('input[name="nome"]') as HTMLInputElement, {
      target: { value: 'Gravação' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Criar' }));

    // O modal fecha sozinho depois do sucesso.
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    // Reabre: precisa mostrar o modal de novo, não fechar sozinho imediatamente.
    fireEvent.click(screen.getByText('Nova Categoria'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
