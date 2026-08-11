import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
import { AgendaClient } from '@/components/AgendaClient';
import type { Agendamento, CategoriaProduto, LocalGravacao, Terceiro } from '@/lib/types';
const cliente: Terceiro = { id: 'c1', nome: 'ACME', contato_responsavel: null, email: null, telefone: null, cidade: null, uf: null, created_at: '2026-08-20T00:00:00Z' };
const categoria: CategoriaProduto = { id: 'cat1', nome: 'Gravação', unidade_consumo: null, atributos_molde: [], ativo: true };
const local: LocalGravacao = { id: 'l1', nome: 'P7 BH', endereco: null, responsavel: null, created_at: '2026-08-20T00:00:00Z', estudios: [{ id: 'e1', local_id: 'l1', nome: 'Estúdio A', created_at: '2026-08-20T00:00:00Z' }] };
const item: Agendamento = { id: 'a1', cliente_id: 'c1', cliente_nome: 'ACME', local_id: 'l1', estudio_id: 'e1', estudio_nome: 'Estúdio A', categoria_produto_id: 'cat1', categoria_nome: 'Gravação', status: 'agendado', data: '2026-08-24', hora_inicio: '09:00:00', hora_fim: '10:00:00', created_at: '2026-08-20T00:00:00Z' };
const criar = vi.fn(); const salvar = vi.fn(); const apagar = vi.fn(); const mover = vi.fn(); afterEach(() => cleanup());
describe('AgendaClient', () => {
  it('renderiza os 7 dias da semana e o card no dia certo', () => { render(<AgendaClient itens={[item]} clientes={[cliente]} locais={[local]} categorias={[categoria]} estudioId="e1" inicioSemana="2026-08-24" criar={criar} salvar={salvar} apagar={apagar} mover={mover} />); expect(screen.getByText(/Segunda/)).toBeInTheDocument(); expect(screen.getByText(/Domingo/)).toBeInTheDocument(); expect(screen.getByText('ACME')).toBeInTheDocument(); });
  it('clicar no card abre o modal de edição', () => { render(<AgendaClient itens={[item]} clientes={[cliente]} locais={[local]} categorias={[categoria]} estudioId="e1" inicioSemana="2026-08-24" criar={criar} salvar={salvar} apagar={apagar} mover={mover} />); fireEvent.click(screen.getByText('ACME')); expect(screen.getByText('Editar agendamento')).toBeInTheDocument(); });
  it('botão "Novo agendamento" abre o modal em branco', () => { render(<AgendaClient itens={[]} clientes={[cliente]} locais={[local]} categorias={[categoria]} estudioId="e1" inicioSemana="2026-08-24" criar={criar} salvar={salvar} apagar={apagar} mover={mover} />); fireEvent.click(screen.getByText('Novo agendamento')); expect(screen.getByText('Novo agendamento', { selector: 'h2' })).toBeInTheDocument(); });
});
