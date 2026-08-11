import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { AgendaFormularioModal } from '@/components/AgendaFormularioModal';
import type { Agendamento, CategoriaProduto, LocalGravacao, Terceiro } from '@/lib/types';

const cliente: Terceiro = { id: 'c1', nome: 'ACME', contato_responsavel: null, email: null, telefone: null, cidade: null, uf: null, created_at: '2026-08-20T00:00:00Z' };
const categoria: CategoriaProduto = { id: 'cat1', nome: 'Gravação', unidade_consumo: null, atributos_molde: [], ativo: true };
const localA: LocalGravacao = { id: 'l1', nome: 'P7 BH', endereco: null, responsavel: null, created_at: '2026-08-20T00:00:00Z', estudios: [{ id: 'e1', local_id: 'l1', nome: 'Estúdio A', created_at: '2026-08-20T00:00:00Z' }] };
const localB: LocalGravacao = { id: 'l2', nome: '4Nexus Vitória', endereco: null, responsavel: null, created_at: '2026-08-20T00:00:00Z', estudios: [{ id: 'e2', local_id: 'l2', nome: 'Estúdio B', created_at: '2026-08-20T00:00:00Z' }] };
const item: Agendamento = { id: 'a1', cliente_id: 'c1', cliente_nome: 'ACME', local_id: 'l1', estudio_id: 'e1', estudio_nome: 'Estúdio A', categoria_produto_id: 'cat1', categoria_nome: 'Gravação', status: 'agendado', data: '2026-08-24', hora_inicio: '09:00:00', hora_fim: '10:00:00', created_at: '2026-08-20T00:00:00Z' };
const criar = vi.fn(); const salvar = vi.fn(); const apagar = vi.fn();
afterEach(() => cleanup());

describe('AgendaFormularioModal', () => {
  it('sem item (criação): título "Novo agendamento" e campos em branco', () => { render(<AgendaFormularioModal clientes={[cliente]} locais={[localA, localB]} categorias={[categoria]} criar={criar} salvar={salvar} apagar={apagar} onFechar={vi.fn()} />); expect(screen.getByText('Novo agendamento')).toBeInTheDocument(); expect(screen.queryByText('Apagar')).not.toBeInTheDocument(); });
  it('com item (edição): título "Editar agendamento" e campos preenchidos', () => { render(<AgendaFormularioModal item={item} clientes={[cliente]} locais={[localA, localB]} categorias={[categoria]} criar={criar} salvar={salvar} apagar={apagar} onFechar={vi.fn()} />); expect(screen.getByText('Editar agendamento')).toBeInTheDocument(); expect(screen.getByDisplayValue('09:00')).toBeInTheDocument(); expect(screen.getByText('Apagar')).toBeInTheDocument(); });
  it('trocar o local muda as opções de estúdio disponíveis', () => { render(<AgendaFormularioModal clientes={[cliente]} locais={[localA, localB]} categorias={[categoria]} criar={criar} salvar={salvar} apagar={apagar} onFechar={vi.fn()} />); fireEvent.change(screen.getByLabelText('Local de gravação'), { target: { value: 'l2' } }); expect(screen.getByRole('option', { name: 'Estúdio B' })).toBeInTheDocument(); expect(screen.queryByRole('option', { name: 'Estúdio A' })).not.toBeInTheDocument(); });
});
