import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
const { push, refresh } = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }));
import { AgendaClient } from '@/components/AgendaClient';
import type { Agendamento, CategoriaProduto, LocalGravacao, Terceiro } from '@/lib/types';
const cliente: Terceiro = { id: 'c1', nome: 'ACME', contato_responsavel: null, email: null, telefone: null, cidade: null, uf: null, created_at: '2026-08-20T00:00:00Z' };
const categoria: CategoriaProduto = { id: 'cat1', nome: 'Gravação', unidade_consumo: null, atributos_molde: [], ativo: true };
const local: LocalGravacao = { id: 'l1', nome: 'P7 BH', endereco: null, responsavel: null, created_at: '2026-08-20T00:00:00Z', estudios: [{ id: 'e1', local_id: 'l1', nome: 'Estúdio A', created_at: '2026-08-20T00:00:00Z' }] };
const outroLocal: LocalGravacao = { id: 'l2', nome: 'P7 SP', endereco: null, responsavel: null, created_at: '2026-08-20T00:00:00Z', estudios: [{ id: 'e2', local_id: 'l2', nome: 'Estúdio B', created_at: '2026-08-20T00:00:00Z' }] };
const item: Agendamento = { id: 'a1', cliente_id: 'c1', cliente_nome: 'ACME', local_id: 'l1', estudio_id: 'e1', estudio_nome: 'Estúdio A', categoria_produto_id: 'cat1', categoria_nome: 'Gravação', status: 'agendado', data: '2026-08-24', hora_inicio: '09:00:00', hora_fim: '10:00:00', created_at: '2026-08-20T00:00:00Z' };
const criar = vi.fn(); const salvar = vi.fn(); const apagar = vi.fn(); const mover = vi.fn().mockResolvedValue({});
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe('AgendaClient', () => {
  it('renderiza os 7 dias da semana e o card no dia certo', () => { render(<AgendaClient itens={[item]} clientes={[cliente]} locais={[local]} categorias={[categoria]} estudioId="e1" inicioSemana="2026-08-24" criar={criar} salvar={salvar} apagar={apagar} mover={mover} />); expect(screen.getByText(/Segunda/)).toBeInTheDocument(); expect(screen.getByText(/Domingo/)).toBeInTheDocument(); expect(screen.getByText('ACME')).toBeInTheDocument(); });
  it('renderiza 96 linhas de 15 minutos por dia, rótulos de hora e rolagem vertical', () => {
    render(<AgendaClient itens={[]} clientes={[cliente]} locais={[local]} categorias={[categoria]} estudioId="e1" inicioSemana="2026-08-24" criar={criar} salvar={salvar} apagar={apagar} mover={mover} />);
    expect(screen.getAllByTestId('agenda-slot')).toHaveLength(96 * 7);
    expect(screen.getByText('00:00')).toBeInTheDocument();
    expect(screen.getByText('23:00')).toBeInTheDocument();
    expect(screen.getByTestId('agenda-scroll')).toHaveClass('overflow-y-auto');
  });
  it('filtra estúdios pelo local e navega ao trocar o local', () => {
    render(<AgendaClient itens={[]} clientes={[cliente]} locais={[local, outroLocal]} categorias={[categoria]} estudioId="e1" inicioSemana="2026-08-24" criar={criar} salvar={salvar} apagar={apagar} mover={mover} />);
    expect(screen.getByLabelText('Local de gravação')).toHaveValue('l1');
    expect(screen.getByLabelText('Estúdio')).toHaveTextContent('Estúdio A');
    expect(screen.getByLabelText('Estúdio')).not.toHaveTextContent('Estúdio B');
    fireEvent.change(screen.getByLabelText('Local de gravação'), { target: { value: 'l2' } });
    expect(push).toHaveBeenCalledWith('/agenda?estudioId=e2&semana=2026-08-24');
  });
  it('clicar no card abre o modal de edição', () => { render(<AgendaClient itens={[item]} clientes={[cliente]} locais={[local]} categorias={[categoria]} estudioId="e1" inicioSemana="2026-08-24" criar={criar} salvar={salvar} apagar={apagar} mover={mover} />); fireEvent.click(screen.getByText('ACME')); expect(screen.getByText('Editar agendamento')).toBeInTheDocument(); });
  it('não abre o modal no clique fantasma depois de arrastar o card', () => {
    render(<AgendaClient itens={[item]} clientes={[cliente]} locais={[local]} categorias={[categoria]} estudioId="e1" inicioSemana="2026-08-24" criar={criar} salvar={salvar} apagar={apagar} mover={mover} />);
    const card = screen.getByText('ACME').closest('[data-agenda-card]')!;
    fireEvent.pointerDown(card, { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(document, { clientX: 110, clientY: 110 });
    fireEvent.pointerUp(document, { clientX: 110, clientY: 110 });
    fireEvent.click(card);
    expect(screen.queryByText('Editar agendamento')).not.toBeInTheDocument();
  });
  it('abre o modal em um clique real após terminar o arraste fora do card', async () => {
    render(<AgendaClient itens={[item]} clientes={[cliente]} locais={[local]} categorias={[categoria]} estudioId="e1" inicioSemana="2026-08-24" criar={criar} salvar={salvar} apagar={apagar} mover={mover} />);
    const card = screen.getByText('ACME').closest('[data-agenda-card]')!;
    fireEvent.pointerDown(card, { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(document, { clientX: 110, clientY: 110 });
    fireEvent.pointerUp(document, { clientX: 110, clientY: 110 });

    await new Promise((resolve) => setTimeout(resolve, 0));
    fireEvent.click(screen.getByText('ACME').closest('[data-agenda-card]')!);

    expect(screen.getByText('Editar agendamento')).toBeInTheDocument();
  });
  it('botão "Novo agendamento" abre o modal em branco', () => { render(<AgendaClient itens={[]} clientes={[cliente]} locais={[local]} categorias={[categoria]} estudioId="e1" inicioSemana="2026-08-24" criar={criar} salvar={salvar} apagar={apagar} mover={mover} />); fireEvent.click(screen.getByText('Novo agendamento')); expect(screen.getByText('Novo agendamento', { selector: 'h2' })).toBeInTheDocument(); });
  it('botão "Hoje" navega para a segunda-feira da semana atual', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-27T12:00:00'));
    render(<AgendaClient itens={[]} clientes={[cliente]} locais={[local]} categorias={[categoria]} estudioId="e1" inicioSemana="2026-08-03" criar={criar} salvar={salvar} apagar={apagar} mover={mover} />);
    fireEvent.click(screen.getByText('Hoje'));
    expect(push).toHaveBeenCalledWith('/agenda?estudioId=e1&semana=2026-08-24');
    vi.useRealTimers();
  });
  it('destaca a coluna do dia de hoje', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-27T12:00:00'));
    render(<AgendaClient itens={[]} clientes={[cliente]} locais={[local]} categorias={[categoria]} estudioId="e1" inicioSemana="2026-08-24" criar={criar} salvar={salvar} apagar={apagar} mover={mover} />);
    const colunas = screen.getAllByTestId('agenda-coluna-dia');
    expect(colunas[3]).toHaveStyle({ backgroundColor: 'rgba(108, 140, 255, 0.06)' });
    expect(colunas[0]).not.toHaveStyle({ backgroundColor: 'rgba(108, 140, 255, 0.06)' });
    vi.useRealTimers();
  });
  it('clicar numa célula vazia abre o modal de criação com data e horário pré-preenchidos', () => {
    render(<AgendaClient itens={[]} clientes={[cliente]} locais={[local]} categorias={[categoria]} estudioId="e1" inicioSemana="2026-08-24" criar={criar} salvar={salvar} apagar={apagar} mover={mover} />);
    const slots = screen.getAllByTestId('agenda-slot');
    fireEvent.click(slots[40]); // dia 0 (segunda, 2026-08-24), bloco 40 = 10:00
    expect(screen.getByText('Novo agendamento', { selector: 'h2' })).toBeInTheDocument();
    expect(screen.getByLabelText('Data')).toHaveValue('2026-08-24');
    expect(screen.getByLabelText('Início')).toHaveValue('10:00');
    expect(screen.getByLabelText('Fim')).toHaveValue('11:00');
    expect(screen.getAllByLabelText('Local de gravação')[1]).toHaveValue('l1');
    expect(screen.getByLabelText('Estúdio', { selector: 'select[name="estudioId"]' })).toHaveValue('e1');
  });
  it('clique fantasma depois de arrastar um card não abre criação na célula por baixo', () => {
    render(<AgendaClient itens={[item]} clientes={[cliente]} locais={[local]} categorias={[categoria]} estudioId="e1" inicioSemana="2026-08-24" criar={criar} salvar={salvar} apagar={apagar} mover={mover} />);
    const card = screen.getByText('ACME').closest('[data-agenda-card]')!;
    fireEvent.pointerDown(card, { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(document, { clientX: 110, clientY: 110 });
    fireEvent.pointerUp(document, { clientX: 110, clientY: 110 });
    fireEvent.click(screen.getAllByTestId('agenda-slot')[0]);
    expect(screen.queryByText('Novo agendamento', { selector: 'h2' })).not.toBeInTheDocument();
  });
  it('linha da hora atual fica na posição certa e acompanha o relógio', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-24T10:30:00'));
    render(<AgendaClient itens={[]} clientes={[cliente]} locais={[local]} categorias={[categoria]} estudioId="e1" inicioSemana="2026-08-24" criar={criar} salvar={salvar} apagar={apagar} mover={mover} />);
    const linha = screen.getByTestId('agenda-linha-agora');
    expect(linha).toHaveStyle({ top: '1050px' }); // (10*60+30)/15 * 25
    act(() => {
      vi.setSystemTime(new Date('2026-08-24T11:00:00'));
      vi.advanceTimersByTime(30000);
    });
    expect(linha).toHaveStyle({ top: '1100px' }); // (11*60)/15 * 25
    vi.useRealTimers();
  });
  it('"Ir para" navega para a segunda-feira da semana da data escolhida', () => {
    render(<AgendaClient itens={[]} clientes={[cliente]} locais={[local]} categorias={[categoria]} estudioId="e1" inicioSemana="2026-08-24" criar={criar} salvar={salvar} apagar={apagar} mover={mover} />);
    const botaoIrPara = screen.getByRole('button', { name: 'Ir para' });
    expect(botaoIrPara).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Data para navegar'), { target: { value: '2026-09-10' } });
    expect(botaoIrPara).toBeEnabled();
    fireEvent.click(botaoIrPara);
    expect(push).toHaveBeenCalledWith('/agenda?estudioId=e1&semana=2026-09-07');
  });
});
