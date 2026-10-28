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
    expect(screen.getByRole('button', { name: 'Novo cliente' })).toBeInTheDocument();
  });

  it('tipo fornecedor mostra os rótulos de fornecedor', () => {
    render(
      <TerceiroClient tipo="fornecedor" itens={[item]} criar={criar} salvar={salvar} apagar={apagar} />,
    );
    expect(screen.getByText('Fornecedores')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Novo fornecedor' })).toBeInTheDocument();
  });

  it('clicar no botão flutuante abre o modal de cadastro', () => {
    render(
      <TerceiroClient tipo="cliente" itens={[]} criar={criar} salvar={salvar} apagar={apagar} />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Novo cliente' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Novo cliente' })).toBeInTheDocument();
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

  it('modal de cliente mostra as abas Compras e Agendamento', async () => {
    const buscarDadosCliente = vi.fn().mockResolvedValue({
      contratacoes: [], agendamentos: [],
    });
    render(
      <TerceiroClient
        tipo="cliente" itens={[item]} criar={criar} salvar={salvar} apagar={apagar}
        buscarDadosCliente={buscarDadosCliente}
      />,
    );
    fireEvent.click(screen.getByText('ACME Ltda'));
    expect(screen.getByRole('button', { name: 'Compras' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Agendamento' })).toBeInTheDocument();
    expect(buscarDadosCliente).toHaveBeenCalledWith(item.id);
  });

  it('modal de fornecedor não mostra abas', () => {
    render(
      <TerceiroClient tipo="fornecedor" itens={[item]} criar={criar} salvar={salvar} apagar={apagar} />,
    );
    fireEvent.click(screen.getByText('ACME Ltda'));
    expect(screen.queryByRole('button', { name: 'Compras' })).not.toBeInTheDocument();
  });

  it('troca de aba mostra o conteúdo certo', async () => {
    const buscarDadosCliente = vi.fn().mockResolvedValue({
      contratacoes: [{
        id: 'ct1', cliente_id: item.id, cliente_nome: item.nome, tipo: 'avulso',
        produto_id: 'p1', combo_id: null, plano_id: null, item_nome: 'Gravação Padrão',
        quantidade: 1, preco_total: 100, data_validade: null, created_at: new Date('2026-08-01T00:00:00Z'),
        cancelada: false, itens: [],
      }],
      agendamentos: [{
        id: 'ag1', cliente_id: item.id, cliente_nome: item.nome, local_id: 'l1',
        estudio_id: 'e1', estudio_nome: 'Estúdio A', produto_id: 'p1',
        produto_nome: 'Gravação Padrão', status: 'concluido', data: '2026-08-01',
        hora_inicio: '09:00:00', hora_fim: '10:00:00', created_at: '2026-08-01T00:00:00Z',
      }],
    });
    render(
      <TerceiroClient
        tipo="cliente" itens={[item]} criar={criar} salvar={salvar} apagar={apagar}
        buscarDadosCliente={buscarDadosCliente}
      />,
    );
    fireEvent.click(screen.getByText('ACME Ltda'));
    expect(await screen.findByText('Gravação Padrão')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Agendamento' }));
    expect(await screen.findByText('Estúdio A')).toBeInTheDocument();
  });

  it('erro ao buscar histórico mostra mensagem de erro', async () => {
    const buscarDadosCliente = vi.fn().mockRejectedValue(new Error('boom'));
    render(
      <TerceiroClient
        tipo="cliente" itens={[item]} criar={criar} salvar={salvar} apagar={apagar}
        buscarDadosCliente={buscarDadosCliente}
      />,
    );
    fireEvent.click(screen.getByText('ACME Ltda'));
    expect(await screen.findByText('Não foi possível carregar o histórico.')).toBeInTheDocument();
  });
});
