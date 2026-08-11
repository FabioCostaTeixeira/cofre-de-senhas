import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { LocalGravacaoClient } from '@/components/LocalGravacaoClient';
import type { LocalGravacao } from '@/lib/types';

const item: LocalGravacao = {
  id: '11111111-1111-1111-1111-111111111111', nome: 'P7 Belo Horizonte',
  endereco: 'Rua X, 100', responsavel: 'Fulano', created_at: '2026-08-10T00:00:00Z',
  estudios: [{ id: 'e1', local_id: '11111111-1111-1111-1111-111111111111', nome: 'Estúdio A', created_at: '2026-08-10T00:00:00Z' }],
};

const criar = vi.fn();
const salvar = vi.fn();
const apagar = vi.fn();

afterEach(() => cleanup());

describe('LocalGravacaoClient', () => {
  it('lista locais com o nome', () => {
    render(<LocalGravacaoClient itens={[item]} criar={criar} salvar={salvar} apagar={apagar} />);
    expect(screen.getByText('P7 Belo Horizonte')).toBeInTheDocument();
  });

  it('clicar na linha abre o modal com os dados e estúdios preenchidos', () => {
    render(<LocalGravacaoClient itens={[item]} criar={criar} salvar={salvar} apagar={apagar} />);
    fireEvent.click(screen.getByText('P7 Belo Horizonte'));
    expect(screen.getByDisplayValue('P7 Belo Horizonte')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Rua X, 100')).toBeInTheDocument();
    expect(screen.getByText('Estúdio A')).toBeInTheDocument();
  });

  it('sem itens mostra mensagem vazia', () => {
    render(<LocalGravacaoClient itens={[]} criar={criar} salvar={salvar} apagar={apagar} />);
    expect(screen.getByText('Nenhum local de gravação cadastrado.')).toBeInTheDocument();
  });
});
