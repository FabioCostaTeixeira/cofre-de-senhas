import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { OSClient } from '@/components/OSClient';
import { formatarDataHora } from '@/lib/formato';
import type { CategoriaProduto, LocalGravacao, OrdemServico, Produto, Terceiro } from '@/lib/types';

const cliente: Terceiro = {
  id: '11111111-1111-1111-1111-111111111111', nome: 'Cliente Um', contato_responsavel: null,
  email: null, telefone: null, cidade: null, uf: null, created_at: '2026-01-01T00:00:00Z',
};
const gravacao: CategoriaProduto = {
  id: 'cat1', nome: 'Gravação', unidade_consumo: null, atributos_molde: [], ativo: true, planejamento: 'gravacao',
};
const edicao: CategoriaProduto = {
  id: 'cat2', nome: 'Edição', unidade_consumo: null, atributos_molde: [], ativo: true, planejamento: 'edicao',
};
const categorias = [gravacao, edicao];
const produto: Produto = {
  id: '22222222-2222-2222-2222-222222222222', categoria_id: 'cat1', nome: 'Sessão de Estúdio',
  descricao: null, atributos: {}, preco: 100, ativo: true, created_at: '2026-01-01T00:00:00Z',
};
const produtoEdicao: Produto = {
  ...produto, id: '77777777-7777-7777-7777-777777777777', categoria_id: 'cat2', nome: 'Edição de Episódio',
};
const local: LocalGravacao = {
  id: '33333333-3333-3333-3333-333333333333', nome: 'Estúdio Central', endereco: null, responsavel: null,
  created_at: '2026-01-01T00:00:00Z',
  estudios: [{
    id: '44444444-4444-4444-4444-444444444444', local_id: '33333333-3333-3333-3333-333333333333',
    nome: 'Sala A', created_at: '2026-01-01T00:00:00Z',
  }],
};
const osExistente: OrdemServico = {
  id: '55555555-5555-5555-5555-555555555555', cliente_id: cliente.id, cliente_nome: cliente.nome,
  created_at: '2026-01-01T00:00:00Z',
  itens: [{ produto_id: produto.id, produto_nome: produto.nome, quantidade: 2, pre_agendar: true }],
};

const criar = vi.fn();
const apagar = vi.fn();

afterEach(() => cleanup());

describe('OSClient', () => {
  it('lista ordens de serviço com cliente e itens resumidos', () => {
    render(<OSClient itens={[osExistente]} clientes={[cliente]} categorias={categorias} produtos={[produto]} locais={[local]} criar={criar} apagar={apagar} />);
    expect(screen.getByText('Cliente Um')).toBeInTheDocument();
    expect(screen.getByText('2x Sessão de Estúdio (pré-agendado)')).toBeInTheDocument();
  });

  it('adicionar item cria nova linha, e marcar pré-agendar expande campos de data/horário', () => {
    render(<OSClient itens={[]} clientes={[cliente]} categorias={categorias} produtos={[produto]} locais={[local]} criar={criar} apagar={apagar} />);
    expect(screen.queryByLabelText('Produto 2')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('+ Adicionar item'));
    expect(screen.getByLabelText('Produto 2')).toBeInTheDocument();

    expect(screen.queryByLabelText('Data 1')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Pré-agendar item 1'));
    expect(screen.getByLabelText('Data 1')).toBeInTheDocument();
  });

  it('produto só libera depois da categoria e lista apenas os produtos dela', () => {
    render(
      <OSClient
        itens={[]} clientes={[cliente]} categorias={categorias} produtos={[produto, produtoEdicao]}
        locais={[local]} criar={criar} apagar={apagar}
      />,
    );
    const selectProduto = screen.getByLabelText('Produto 1') as HTMLSelectElement;
    expect(selectProduto).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Categoria 1'), { target: { value: 'cat2' } });
    expect(selectProduto).toBeEnabled();
    const nomes = Array.from(selectProduto.options).map((o) => o.textContent);
    expect(nomes).toContain('Edição de Episódio');
    expect(nomes).not.toContain('Sessão de Estúdio');
  });

  it('trocar a categoria descarta o produto escolhido na anterior', () => {
    render(
      <OSClient
        itens={[]} clientes={[cliente]} categorias={categorias} produtos={[produto, produtoEdicao]}
        locais={[local]} criar={criar} apagar={apagar}
      />,
    );
    fireEvent.change(screen.getByLabelText('Categoria 1'), { target: { value: 'cat1' } });
    fireEvent.change(screen.getByLabelText('Produto 1'), { target: { value: produto.id } });
    expect(screen.getByLabelText('Produto 1')).toHaveValue(produto.id);

    fireEvent.change(screen.getByLabelText('Categoria 1'), { target: { value: 'cat2' } });
    expect(screen.getByLabelText('Produto 1')).toHaveValue('');
  });

  it('lista ordem de serviço cujo created_at é um Date real (regressão do driver em runtime)', () => {
    // O driver @neondatabase/serverless devolve timestamptz como objeto Date em runtime,
    // mesmo o tipo declarando `string` — o cast abaixo simula esse valor real (diferente
    // da fixture `osExistente`, que usa string literal). Antes do fix, a Lista fazia
    // `.slice(...)` direto no valor e quebrava com `TypeError` quando o valor vinha como
    // Date de verdade — `.toISOString()` sozinho já é string e não reproduzia o bug.
    const agora = new Date();
    const osComDateReal: OrdemServico = {
      ...osExistente, id: '66666666-6666-6666-6666-666666666666', created_at: agora as unknown as string,
    };
    render(<OSClient itens={[osComDateReal]} clientes={[cliente]} categorias={categorias} produtos={[produto]} locais={[local]} criar={criar} apagar={apagar} />);
    expect(screen.getByText(formatarDataHora(agora))).toBeInTheDocument();
  });

  it('cancelar chama apagar com o id da ordem de serviço', async () => {
    apagar.mockResolvedValueOnce({});
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<OSClient itens={[osExistente]} clientes={[cliente]} categorias={categorias} produtos={[produto]} locais={[local]} criar={criar} apagar={apagar} />);
    fireEvent.click(screen.getByText('Cancelar'));
    await vi.waitFor(() => expect(apagar).toHaveBeenCalledWith(osExistente.id));
  });
});
