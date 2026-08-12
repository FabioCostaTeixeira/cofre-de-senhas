import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ContratacaoClient } from '@/components/ContratacaoClient';
import type { Combo, Contratacao, Plano, Produto, Terceiro } from '@/lib/types';

const cliente: Terceiro = {
  id: '11111111-1111-1111-1111-111111111111', nome: 'Cliente Um', contato_responsavel: null,
  email: null, telefone: null, cidade: null, uf: null, created_at: '2026-01-01T00:00:00Z',
};
const produto: Produto = {
  id: '22222222-2222-2222-2222-222222222222', categoria_id: 'cat1', nome: 'Sessão de Estúdio',
  descricao: null, atributos: {}, preco: 100, ativo: true, created_at: '2026-01-01T00:00:00Z',
};
const combo: Combo = {
  id: '33333333-3333-3333-3333-333333333333', nome: 'Combo Foto', descricao: null, preco: 250,
  ativo: true, created_at: '2026-01-01T00:00:00Z', itens: [],
};
const plano: Plano = {
  id: '44444444-4444-4444-4444-444444444444', nome: 'Plano Mensal', descricao: null,
  tipo_cobranca: 'assinatura', validade_dias: null, ciclo: 'mensal', preco: 300, ativo: true,
  created_at: '2026-01-01T00:00:00Z', itens: [],
};
const contratacaoExistente: Contratacao = {
  id: '55555555-5555-5555-5555-555555555555', cliente_id: cliente.id, cliente_nome: cliente.nome,
  tipo: 'avulso', produto_id: produto.id, combo_id: null, plano_id: null, item_nome: produto.nome,
  quantidade: 2, preco_total: 200, data_validade: null, cancelada: false, created_at: '2026-01-01T00:00:00Z',
  itens: [{ produto_id: produto.id, produto_nome: produto.nome, quantidade_total: 2, quantidade_consumida: 0 }],
};

const criar = vi.fn();
const apagar = vi.fn();

afterEach(() => cleanup());

describe('ContratacaoClient', () => {
  it('lista contratações com cliente, item e saldo', () => {
    render(
      <ContratacaoClient
        itens={[contratacaoExistente]} clientes={[cliente]} produtos={[produto]} combos={[combo]} planos={[plano]}
        criar={criar} apagar={apagar}
      />,
    );
    expect(screen.getByText('Cliente Um')).toBeInTheDocument();
    expect(screen.getByText('Sessão de Estúdio')).toBeInTheDocument();
    expect(screen.getByText('2/2')).toBeInTheDocument();
  });

  it('trocar o tipo troca as opções do select de item e calcula o total', () => {
    render(
      <ContratacaoClient
        itens={[]} clientes={[cliente]} produtos={[produto]} combos={[combo]} planos={[plano]}
        criar={criar} apagar={apagar}
      />,
    );
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'combo' } });
    expect(screen.getByLabelText('Combo')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Combo'), { target: { value: combo.id } });
    fireEvent.change(screen.getByLabelText('Quantidade'), { target: { value: '2' } });
    expect(screen.getByText('Total: R$ 500.00')).toBeInTheDocument();
  });

  it('cancelar chama apagar com o id da contratação', async () => {
    apagar.mockResolvedValueOnce({});
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(
      <ContratacaoClient
        itens={[contratacaoExistente]} clientes={[cliente]} produtos={[produto]} combos={[combo]} planos={[plano]}
        criar={criar} apagar={apagar}
      />,
    );
    fireEvent.click(screen.getByText('Cancelar'));
    await vi.waitFor(() => expect(apagar).toHaveBeenCalledWith(contratacaoExistente.id));
  });
});
