import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
const { push, refresh } = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }));
// Mesmo truque do KanbanBoard.test.tsx: captura o `onDragEnd` real do `DndContext`.
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
import { ChamadoCard } from '@/components/ChamadoCard';
import { ChamadosBoard } from '@/components/ChamadosBoard';
import { COLUNAS_CHAMADO } from '@/lib/kanban';
import type { CategoriaProduto, Chamado, Produto, User } from '@/lib/types';

afterEach(() => cleanup());

function chamado(overrides: Partial<Chamado> = {}): Chamado {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    categoria_id: 'cat-proj', produto_id: 'p-chamado', produto_nome: 'Chamado',
    responsavel_id: 'u1', responsavel_nome: 'Fulano',
    criado_por: 'u2', criado_por_nome: 'Beltrano',
    titulo: 'Arrumar impressora', descricao: 'A da recepção não imprime.',
    coluna: 'aberto', prioridade: 0,
    created_at: '2026-11-03T17:05:00Z',
    ...overrides,
  };
}

const categorias: CategoriaProduto[] = [
  { id: 'cat-proj', nome: 'Projeto', unidade_consumo: null, atributos_molde: [], ativo: true, planejamento: 'projeto', produtos_exclusivos: true },
  { id: 'cat-ed', nome: 'Edição', unidade_consumo: null, atributos_molde: [], ativo: true, planejamento: 'edicao', produtos_exclusivos: false },
];
const produtos = [
  { id: 'p-chamado', categoria_id: 'cat-proj', nome: 'Chamado', descricao: null, atributos: {}, preco: 0, ativo: true },
  { id: 'p-video', categoria_id: 'cat-ed', nome: 'Vídeo', descricao: null, atributos: {}, preco: 10, ativo: true },
] as Produto[];
const users: User[] = [
  { id: 'u1', email: 'f@ex.com', name: 'Fulano', role: 'user', is_active: true, must_change_password: false, created_at: '' },
];
const MASTER = { id: 'u-master', role: 'master' as const };
const acoes = () => ({
  ator: MASTER,
  criarChamadoAction: vi.fn(async () => ({ ok: true })),
  editarChamadoAction: vi.fn(async () => ({ ok: true })),
  moverChamadoAction: vi.fn(async () => ({})),
  reordenarChamadosAction: vi.fn(async () => ({})),
  apagarChamadoAction: vi.fn(async () => ({})),
});

describe('ChamadoCard', () => {
  it('mostra título, data/hora de abertura (Brasília) e responsável', () => {
    render(<ChamadoCard chamado={chamado()} />);
    expect(screen.getByText('Arrumar impressora')).toBeInTheDocument();
    expect(screen.getByText('Aberto em 03/11/2026, 14:05:00')).toBeInTheDocument();
    expect(screen.getByText('Atribuído a Fulano')).toBeInTheDocument();
    expect(screen.queryByText(/não imprime/)).not.toBeInTheDocument();
  });

  it('expandido mostra descrição e quem abriu', () => {
    render(<ChamadoCard chamado={chamado()} />);
    fireEvent.click(screen.getByText('Arrumar impressora'));
    expect(screen.getByText('A da recepção não imprime.')).toBeInTheDocument();
    expect(screen.getByText('Beltrano')).toBeInTheDocument();
  });
});

describe('ChamadosBoard', () => {
  it('renderiza as cinco colunas e o chamado na dele', () => {
    render(<ChamadosBoard chamados={[chamado()]} categorias={categorias} produtos={produtos} users={users} {...acoes()} />);
    for (const c of COLUNAS_CHAMADO) expect(screen.getByRole('heading', { name: c.label })).toBeInTheDocument();
    const aberto = screen.getByRole('heading', { name: 'Aberto' }).closest('section')!;
    expect(within(aberto).getByText('Arrumar impressora')).toBeInTheDocument();
  });

  it('Novo chamado já escolhe Projeto › Chamado e só oferece categorias de Projetos', () => {
    render(<ChamadosBoard chamados={[]} categorias={categorias} produtos={produtos} users={users} {...acoes()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Novo chamado' }));
    const dialog = screen.getByRole('dialog');
    const categoria = dialog.querySelector('select[name="categoriaId"]') as HTMLSelectElement;
    const produto = dialog.querySelector('select[name="produtoId"]') as HTMLSelectElement;
    expect(categoria.value).toBe('cat-proj');
    expect(produto.value).toBe('p-chamado');
    expect(within(categoria).queryByText('Edição')).not.toBeInTheDocument();
    expect(within(produto).queryByText('Vídeo')).not.toBeInTheDocument();
  });

  it('arrastar para outra coluna chama moverChamadoAction e reverte se der erro', async () => {
    const a = acoes();
    a.moverChamadoAction.mockResolvedValueOnce({ error: 'falhou' } as never);
    render(<ChamadosBoard chamados={[chamado()]} categorias={categorias} produtos={produtos} users={users} {...a} />);
    const onDragEnd = (globalThis as { __onDragEnd?: (e: unknown) => void }).__onDragEnd!;
    await act(async () => {
      onDragEnd({ active: { id: chamado().id }, over: { id: 'em_andamento', data: { current: { coluna: 'em_andamento' } } } });
    });
    expect(a.moverChamadoAction).toHaveBeenCalledWith(chamado().id, 'em_andamento');
    expect(screen.getByText('falhou')).toBeInTheDocument();
    const aberto = screen.getByRole('heading', { name: 'Aberto' }).closest('section')!;
    expect(within(aberto).getByText('Arrumar impressora')).toBeInTheDocument();
  });

  it('gestor vê chamado de outros, mas sem lápis e sem arrastar', async () => {
    const a = acoes();
    render(
      <ChamadosBoard
        chamados={[chamado()]} categorias={categorias} produtos={produtos} users={users}
        {...a} ator={{ id: 'u-gestor', role: 'gestor' }}
      />,
    );
    expect(screen.getByText('Arrumar impressora')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar chamado' })).not.toBeInTheDocument();
    const onDragEnd = (globalThis as { __onDragEnd?: (e: unknown) => void }).__onDragEnd!;
    await act(async () => {
      onDragEnd({ active: { id: chamado().id }, over: { id: 'block', data: { current: { coluna: 'block' } } } });
    });
    expect(a.moverChamadoAction).not.toHaveBeenCalled();
  });

  it('responsável move mas não edita; quem abriu tem o lápis', () => {
    const { unmount } = render(
      <ChamadosBoard chamados={[chamado()]} categorias={categorias} produtos={produtos} users={users} {...acoes()} ator={{ id: 'u1', role: 'user' }} />,
    );
    expect(screen.queryByRole('button', { name: 'Editar chamado' })).not.toBeInTheDocument();
    unmount();
    render(
      <ChamadosBoard chamados={[chamado()]} categorias={categorias} produtos={produtos} users={users} {...acoes()} ator={{ id: 'u2', role: 'user' }} />,
    );
    expect(screen.getByRole('button', { name: 'Editar chamado' })).toBeInTheDocument();
  });

  it('aba Individual (parcial): mostra as abas e não reordena, mesmo para o master', async () => {
    const a = acoes();
    const c1 = chamado({ id: 'c1', titulo: 'Um', prioridade: 0 });
    const c2 = chamado({ id: 'c2', titulo: 'Dois', prioridade: 1 });
    render(
      <ChamadosBoard
        chamados={[c1, c2]} categorias={categorias} produtos={produtos} users={users} {...a}
        parcial abas={<nav aria-label="Visão dos chamados">abas</nav>}
      />,
    );
    expect(screen.getByRole('navigation', { name: 'Visão dos chamados' })).toBeInTheDocument();
    const onDragEnd = (globalThis as { __onDragEnd?: (e: unknown) => void }).__onDragEnd!;
    await act(async () => {
      onDragEnd({ active: { id: 'c1' }, over: { id: 'c2', data: { current: { coluna: 'aberto' } } } });
    });
    expect(a.reordenarChamadosAction).not.toHaveBeenCalled();
  });
});

