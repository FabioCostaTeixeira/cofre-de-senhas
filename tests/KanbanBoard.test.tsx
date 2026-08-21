import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
const { push, refresh } = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }));
// Captura o `onDragEnd` real passado ao `DndContext` (via `globalThis`) sem
// precisar simular um drag de ponteiro de verdade em jsdom — os testes de
// regressão do `.catch` chamam esse callback direto, como o dnd-kit chamaria
// depois de um drop.
vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/core')>();
  return {
    ...actual,
    DndContext: (props: { onDragEnd: (e: unknown) => void; children: unknown }) => {
      (globalThis as { __onDragEnd?: (e: unknown) => void }).__onDragEnd = props.onDragEnd;
      return props.children;
    },
  };
});
import { KanbanBoard } from '@/components/KanbanBoard';
import { TarefaCard } from '@/components/TarefaCard';
import { COLUNAS_KANBAN } from '@/lib/kanban';
import type { Tarefa, Terceiro, User } from '@/lib/types';

afterEach(() => cleanup());

function tarefa(overrides: Partial<Tarefa> = {}): Tarefa {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    cliente_id: 'c1',
    cliente_nome: 'ACME',
    responsavel_id: 'u1',
    responsavel_nome: 'Fulano',
    produto_id: 'p1',
    produto_nome: 'Gravação de vídeo',
    contratacao_item_id: 'ci1',
    agendamento_id: null,
    os_item_id: null,
    tarefa: 'Editar o vídeo final',
    coluna: 'a_fazer',
    prioridade: 0,
    deadline_cliente: '2026-09-01',
    deadline_tarefa: '2026-08-30',
    ajuste: false,
    consumido: false,
    created_at: '2026-08-01T00:00:00Z',
    ...overrides,
  };
}

const cliente: Terceiro = {
  id: 'c1', nome: 'ACME', contato_responsavel: null, email: null,
  telefone: null, cidade: null, uf: null, created_at: '2026-08-01T00:00:00Z',
};
const usuario: User = {
  id: 'u1', email: 'fulano@ex.com', name: 'Fulano', role: 'user',
  is_active: true, must_change_password: false, created_at: '2026-08-01T00:00:00Z',
};

const criarTarefaAction = vi.fn(async () => ({}));
const buscarItensDoClienteAction = vi.fn(async () => ({ itens: [] }));
const moverTarefaAction = vi.fn(async () => ({}));
const reordenarTarefasAction = vi.fn(async () => ({}));

describe('TarefaCard — resumido e estendido', () => {
  it('resumido mostra cliente, responsável, prioridade e produto, sem os campos do estendido', () => {
    render(<TarefaCard tarefa={tarefa()} />);
    expect(screen.getByText('ACME')).toBeInTheDocument();
    expect(screen.getByText('Fulano')).toBeInTheDocument();
    expect(screen.getByText('Prioridade 0')).toBeInTheDocument();
    expect(screen.getByText('Gravação de vídeo')).toBeInTheDocument();
    expect(screen.queryByText(/Editar o vídeo final/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Deadline cliente/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Deadline tarefa/)).not.toBeInTheDocument();
  });

  it('clique no card revela o estendido, com os mesmos campos agora presentes', () => {
    render(<TarefaCard tarefa={tarefa()} />);
    fireEvent.click(screen.getByText('ACME'));
    expect(screen.getByText(/Editar o vídeo final/)).toBeInTheDocument();
    expect(screen.getByText(/Deadline cliente/)).toBeInTheDocument();
    expect(screen.getByText(/Deadline tarefa/)).toBeInTheDocument();
    // continua mostrando o resumido também
    expect(screen.getByText('ACME')).toBeInTheDocument();
  });

  it('clicar de novo recolhe de volta ao resumido', () => {
    render(<TarefaCard tarefa={tarefa()} />);
    const botao = screen.getByText('ACME');
    fireEvent.click(botao);
    expect(screen.getByText(/Deadline cliente/)).toBeInTheDocument();
    fireEvent.click(botao);
    expect(screen.queryByText(/Deadline cliente/)).not.toBeInTheDocument();
  });

  it('ajuste=true mostra o ícone de alerta', () => {
    render(<TarefaCard tarefa={tarefa({ ajuste: true })} />);
    expect(screen.getByLabelText('Ajuste')).toBeInTheDocument();
  });

  it('ajuste=false não mostra o ícone de alerta', () => {
    render(<TarefaCard tarefa={tarefa({ ajuste: false })} />);
    expect(screen.queryByLabelText('Ajuste')).not.toBeInTheDocument();
  });
});

describe('KanbanBoard', () => {
  it('renderiza as seis colunas na ordem definida', () => {
    render(
      <KanbanBoard
        tarefas={[]} clientes={[cliente]} users={[usuario]}
        criarTarefaAction={criarTarefaAction} buscarItensDoClienteAction={buscarItensDoClienteAction}
        moverTarefaAction={moverTarefaAction} reordenarTarefasAction={reordenarTarefasAction}
      />,
    );
    const titulos = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(titulos).toEqual([
      'RoadMap', 'A Fazer', 'Executando', 'Block', 'Homologação Cliente', 'Concluído',
    ]);
  });

  it('coluna sem tarefas mostra o estado vazio', () => {
    render(
      <KanbanBoard
        tarefas={[]} clientes={[cliente]} users={[usuario]}
        criarTarefaAction={criarTarefaAction} buscarItensDoClienteAction={buscarItensDoClienteAction}
        moverTarefaAction={moverTarefaAction} reordenarTarefasAction={reordenarTarefasAction}
      />,
    );
    expect(screen.getAllByText('Nenhuma tarefa')).toHaveLength(COLUNAS_KANBAN.length);
  });

  it('mantém os identificadores estáveis das colunas', () => {
    expect(COLUNAS_KANBAN.map((c) => c.id)).toEqual([
      'roadmap', 'a_fazer', 'executando', 'block', 'homologacao_cliente', 'concluido',
    ]);
  });

  it('distribui as tarefas na coluna certa e ordena por ajuste/prioridade/created_at', () => {
    const tarefas = [
      tarefa({ id: 't-baixa', cliente_nome: 'Cliente Baixa', coluna: 'a_fazer', prioridade: 5, ajuste: false, created_at: '2026-08-05T00:00:00Z' }),
      tarefa({ id: 't-ajuste', cliente_nome: 'Cliente Ajuste', coluna: 'a_fazer', prioridade: 9, ajuste: true, created_at: '2026-08-10T00:00:00Z' }),
      tarefa({ id: 't-alta', cliente_nome: 'Cliente Alta', coluna: 'a_fazer', prioridade: 1, ajuste: false, created_at: '2026-08-01T00:00:00Z' }),
      tarefa({ id: 't-outra-coluna', cliente_nome: 'Cliente Fora', coluna: 'executando', prioridade: 0, ajuste: false }),
    ];
    render(
      <KanbanBoard
        tarefas={tarefas} clientes={[cliente]} users={[usuario]}
        criarTarefaAction={criarTarefaAction} buscarItensDoClienteAction={buscarItensDoClienteAction}
        moverTarefaAction={moverTarefaAction} reordenarTarefasAction={reordenarTarefasAction}
      />,
    );
    const colunaAFazer = screen.getByRole('heading', { name: 'A Fazer' }).closest('section')!;
    const nomes = within(colunaAFazer).getAllByText(/^Cliente /).map((el) => el.textContent);
    // Ajuste sempre no topo, depois prioridade asc (1 antes de 5); "Cliente Fora" não
    // pertence a esta coluna e não deve aparecer aqui.
    expect(nomes).toEqual(['Cliente Ajuste', 'Cliente Alta', 'Cliente Baixa']);
  });

  it('clique no cabeçalho da coluna, confirmado, abre o modal de criação', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(
      <KanbanBoard
        tarefas={[]} clientes={[cliente]} users={[usuario]}
        criarTarefaAction={criarTarefaAction} buscarItensDoClienteAction={buscarItensDoClienteAction}
        moverTarefaAction={moverTarefaAction} reordenarTarefasAction={reordenarTarefasAction}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'RoadMap' }));
    expect(screen.getByText('Nova Tarefa')).toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it('clique no cabeçalho da coluna, cancelado, não abre o modal', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(
      <KanbanBoard
        tarefas={[]} clientes={[cliente]} users={[usuario]}
        criarTarefaAction={criarTarefaAction} buscarItensDoClienteAction={buscarItensDoClienteAction}
        moverTarefaAction={moverTarefaAction} reordenarTarefasAction={reordenarTarefasAction}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'RoadMap' }));
    expect(screen.queryByText('Nova Tarefa')).not.toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it('o modal de criação carrega o produto do cliente escolhido', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const buscarItens = vi.fn(async () => ({
      itens: [{ contratacao_item_id: 'ci1', produto_id: 'p1', produto_nome: 'Gravação', disponivel: 3 }],
    }));
    render(
      <KanbanBoard
        tarefas={[]} clientes={[cliente]} users={[usuario]}
        criarTarefaAction={criarTarefaAction} buscarItensDoClienteAction={buscarItens}
        moverTarefaAction={moverTarefaAction} reordenarTarefasAction={reordenarTarefasAction}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'A Fazer' }));
    fireEvent.change(screen.getByLabelText('Cliente'), { target: { value: 'c1' } });
    expect(await screen.findByRole('option', { name: /Gravação \(3 disponível\)/ })).toBeInTheDocument();
    expect(buscarItens).toHaveBeenCalledWith('c1');
    vi.restoreAllMocks();
  });

  it('o value da option de produto é o contratacao_item_id, não o produto_id', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const buscarItens = vi.fn(async () => ({
      itens: [{ contratacao_item_id: 'ci1', produto_id: 'p1', produto_nome: 'Gravação', disponivel: 3 }],
    }));
    render(
      <KanbanBoard
        tarefas={[]} clientes={[cliente]} users={[usuario]}
        criarTarefaAction={criarTarefaAction} buscarItensDoClienteAction={buscarItens}
        moverTarefaAction={moverTarefaAction} reordenarTarefasAction={reordenarTarefasAction}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'A Fazer' }));
    fireEvent.change(screen.getByLabelText('Cliente'), { target: { value: 'c1' } });
    const option = await screen.findByRole('option', { name: /Gravação \(3 disponível\)/ }) as HTMLOptionElement;
    expect(option.value).toBe('ci1');
    expect(option.value).not.toBe('p1');
    vi.restoreAllMocks();
  });

  it('trocar de cliente reseta a lista de produtos, sem manter a option do cliente anterior', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const outroCliente: Terceiro = { ...cliente, id: 'c2', nome: 'Beta' };
    const buscarItens = vi.fn(async (clienteId: string) => (
      clienteId === 'c1'
        ? { itens: [{ contratacao_item_id: 'ci1', produto_id: 'p1', produto_nome: 'Gravação', disponivel: 3 }] }
        : { error: 'Falha ao buscar itens do cliente B.' }
    ));
    render(
      <KanbanBoard
        tarefas={[]} clientes={[cliente, outroCliente]} users={[usuario]}
        criarTarefaAction={criarTarefaAction} buscarItensDoClienteAction={buscarItens}
        moverTarefaAction={moverTarefaAction} reordenarTarefasAction={reordenarTarefasAction}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'A Fazer' }));
    fireEvent.change(screen.getByLabelText('Cliente'), { target: { value: 'c1' } });
    expect(await screen.findByRole('option', { name: /Gravação \(3 disponível\)/ })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Cliente'), { target: { value: 'c2' } });
    // A option antiga do cliente A não pode continuar disponível/submetível.
    expect(screen.queryByRole('option', { name: /Gravação \(3 disponível\)/ })).not.toBeInTheDocument();
    await screen.findByText('Falha ao buscar itens do cliente B.');
    expect(screen.queryByRole('option', { name: /Gravação \(3 disponível\)/ })).not.toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it('moverTarefaAction rejeitando (não só devolvendo {error}) reverte a mudança otimista e avisa', async () => {
    const t1 = tarefa({ id: 't1', cliente_nome: 'Cliente Move', coluna: 'a_fazer', prioridade: 0 });
    const moverFalho = vi.fn(async () => { throw new Error('falha de conexão com o banco'); });
    render(
      <KanbanBoard
        tarefas={[t1]} clientes={[cliente]} users={[usuario]}
        criarTarefaAction={criarTarefaAction} buscarItensDoClienteAction={buscarItensDoClienteAction}
        moverTarefaAction={moverFalho} reordenarTarefasAction={reordenarTarefasAction}
      />,
    );
    const onDragEnd = (globalThis as { __onDragEnd?: (e: unknown) => void }).__onDragEnd!;

    const executando = screen.getByRole('heading', { name: 'Executando' }).closest('section')!;
    act(() => {
      onDragEnd({
        active: { id: 't1' },
        over: { id: 'executando', data: { current: { coluna: 'executando' } } },
      });
    });

    // Aplicação otimista: card já aparece na coluna nova antes da action resolver.
    expect(within(executando).getByText('Cliente Move')).toBeInTheDocument();

    // A action rejeita (não devolve {error}) — sem o `.catch`, nada reverteria.
    await screen.findByText('Não foi possível salvar a alteração.');
    const aFazer = screen.getByRole('heading', { name: 'A Fazer' }).closest('section')!;
    expect(within(aFazer).getByText('Cliente Move')).toBeInTheDocument();
    expect(within(executando).queryByText('Cliente Move')).not.toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  it('reordenarTarefasAction rejeitando (não só devolvendo {error}) reverte a ordem otimista e avisa', async () => {
    const t1 = tarefa({ id: 't1', cliente_nome: 'Cliente Um', coluna: 'a_fazer', prioridade: 0 });
    const t2 = tarefa({ id: 't2', cliente_nome: 'Cliente Dois', coluna: 'a_fazer', prioridade: 1 });
    const reordenarFalho = vi.fn(async () => { throw new Error('falha de conexão com o banco'); });
    render(
      <KanbanBoard
        tarefas={[t1, t2]} clientes={[cliente]} users={[usuario]}
        criarTarefaAction={criarTarefaAction} buscarItensDoClienteAction={buscarItensDoClienteAction}
        moverTarefaAction={moverTarefaAction} reordenarTarefasAction={reordenarFalho}
      />,
    );
    const onDragEnd = (globalThis as { __onDragEnd?: (e: unknown) => void }).__onDragEnd!;
    const aFazer = screen.getByRole('heading', { name: 'A Fazer' }).closest('section')!;

    act(() => {
      onDragEnd({
        active: { id: 't1' },
        over: { id: 't2', data: { current: { coluna: 'a_fazer' } } },
      });
    });

    // Aplicação otimista: ordem já trocada antes da action resolver.
    expect(within(aFazer).getAllByText(/^Cliente /).map((el) => el.textContent)).toEqual(
      ['Cliente Dois', 'Cliente Um'],
    );

    // A action rejeita (não devolve {error}) — sem o `.catch`, a ordem ficaria errada.
    await screen.findByText('Não foi possível salvar a alteração.');
    expect(within(aFazer).getAllByText(/^Cliente /).map((el) => el.textContent)).toEqual(
      ['Cliente Um', 'Cliente Dois'],
    );
    expect(refresh).toHaveBeenCalled();
  });
});
