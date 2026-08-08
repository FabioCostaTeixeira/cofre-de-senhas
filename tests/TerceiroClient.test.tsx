import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { TerceiroClient } from '@/components/TerceiroClient';
import type { Terceiro } from '@/lib/types';

const item: Terceiro = {
  id: '11111111-1111-1111-1111-111111111111',
  nome: 'ACME Ltda', contato_responsavel: 'Fulano', email: 'contato@acme.com',
  telefone: '11987654321', cidade: 'São Paulo', uf: 'SP', created_at: '2026-08-08T10:00:00Z',
};

const criar = vi.fn();
const salvar = vi.fn();
const apagar = vi.fn();

afterEach(() => cleanup());

describe('TerceiroClient', () => {
  it('tipo cliente mostra os rótulos de cliente', () => {
    render(
      <TerceiroClient tipo="cliente" itens={[item]} criar={criar} salvar={salvar} apagar={apagar} />,
    );
    expect(screen.getByText('Clientes')).toBeInTheDocument();
    expect(screen.getByText('Novo cliente')).toBeInTheDocument();
  });

  it('tipo fornecedor mostra os rótulos de fornecedor', () => {
    render(
      <TerceiroClient tipo="fornecedor" itens={[item]} criar={criar} salvar={salvar} apagar={apagar} />,
    );
    expect(screen.getByText('Fornecedores')).toBeInTheDocument();
    expect(screen.getByText('Novo fornecedor')).toBeInTheDocument();
  });

  it('clicar na linha abre o modal com os dados preenchidos', () => {
    render(
      <TerceiroClient tipo="cliente" itens={[item]} criar={criar} salvar={salvar} apagar={apagar} />,
    );
    fireEvent.click(screen.getByText('ACME Ltda'));
    expect(screen.getByDisplayValue('ACME Ltda')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Fulano')).toBeInTheDocument();
  });

  it('sem itens mostra mensagem vazia com o tipo certo', () => {
    render(
      <TerceiroClient tipo="fornecedor" itens={[]} criar={criar} salvar={salvar} apagar={apagar} />,
    );
    expect(screen.getByText('Nenhum fornecedor cadastrado.')).toBeInTheDocument();
  });
});
