import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { UsuariosClient } from '@/app/(app)/usuarios/UsuariosClient';
import { buscarDadosUsuario } from '@/app/(app)/usuarios/actions';
import type { Pessoa, UserComContato } from '@/lib/types';

vi.mock('@/app/(app)/usuarios/actions', () => ({
  salvarCadastro: vi.fn(),
  criarUsuario: vi.fn(),
  revelarDocumentosAction: vi.fn(),
  buscarCep: vi.fn(),
  resetUserPassword: vi.fn(),
  buscarDadosUsuario: vi.fn(),
}));

const usuario: UserComContato = {
  id: '11111111-1111-1111-1111-111111111111',
  pessoa_id: '22222222-2222-2222-2222-222222222222',
  email: 'joao@x.com', name: 'Joao', role: 'user',
  is_active: true, must_change_password: false, created_at: '2026-01-01',
  telefone: '11987654321', data_contratacao: null, data_demissao: null,
};

const pessoa: Pessoa = {
  id: '22222222-2222-2222-2222-222222222222',
  telefone: '11987654321', cep: null, logradouro: null, numero: null, complemento: null,
  bairro: null, cidade: null, uf: null, data_nascimento: null,
  rg_orgao_expedidor: null, cnpj: null, tem_cpf: false, tem_rg: false,
};

// Pessoa A: o master logado (ator). Pessoa B: linha clicada na grid.
const usuarioA: UserComContato = {
  ...usuario,
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  pessoa_id: 'aaaaaaaa-bbbb-aaaa-aaaa-aaaaaaaaaaaa',
  name: 'Master A', email: 'a@x.com',
};
const pessoaA: Pessoa = { ...pessoa, id: usuarioA.pessoa_id };

const usuarioB: UserComContato = {
  ...usuario,
  id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  pessoa_id: 'bbbbbbbb-cccc-bbbb-bbbb-bbbbbbbbbbbb',
  name: 'Pessoa B', email: 'b@x.com',
};
const pessoaB: Pessoa = { ...pessoa, id: usuarioB.pessoa_id, cidade: 'Cidade de B' };

afterEach(() => cleanup());

describe('UsuariosClient', () => {
  it('master vê a grid com os usuários', () => {
    render(
      <UsuariosClient
        escopo="todos" usuarios={[usuario]} eu={null} pessoa={null}
        salas={[]} salasDoUsuario={[]} modulosDoUsuario={[]} vinculos={[]}
      />,
    );
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('Joao')).toBeInTheDocument();
  });

  it('usuário comum não vê grid nenhuma', () => {
    render(
      <UsuariosClient
        escopo="contato" usuarios={[]} eu={usuario} pessoa={pessoa}
        salas={[]} salasDoUsuario={[]} modulosDoUsuario={[]} vinculos={[]}
      />,
    );
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('usuário comum edita telefone, mas recebe o nome desabilitado', () => {
    render(
      <UsuariosClient
        escopo="contato" usuarios={[]} eu={usuario} pessoa={pessoa}
        salas={[]} salasDoUsuario={[]} modulosDoUsuario={[]} vinculos={[]}
      />,
    );
    expect(screen.getByLabelText('Telefone')).toBeEnabled();
    expect(screen.getByLabelText('Nome')).toBeDisabled();
  });

  it('ao clicar na linha de B, o modal mostra os dados de B, não os do ator A', async () => {
    // Regressão do vazamento achado na revisão final: o bug original mostrava/gravava
    // endereço, salas e módulos DO ATOR (A) no cadastro da linha clicada (B) — nome e
    // e-mail já vinham certos mesmo na versão com bug, então só asserta-los não prova
    // nada. As linhas abaixo checam exatamente o dado que vazava.
    const salas = [
      { id: 'sala-a', name: 'Sala do Master A' },
      { id: 'sala-b', name: 'Sala da Pessoa B' },
    ];
    vi.mocked(buscarDadosUsuario).mockResolvedValue({
      usuario: usuarioB, pessoa: pessoaB,
      salasDoUsuario: ['sala-b'], modulosDoUsuario: [], vinculos: [],
    });

    render(
      <UsuariosClient
        escopo="todos" usuarios={[usuarioB]} eu={usuarioA} pessoa={pessoaA}
        salas={salas} salasDoUsuario={['sala-a']} modulosDoUsuario={[]} vinculos={[]}
      />,
    );

    fireEvent.click(screen.getByText('Pessoa B'));

    const titulo = await screen.findByRole('heading', { name: 'Pessoa B' });
    expect(titulo).toBeInTheDocument();
    expect(screen.getByDisplayValue('b@x.com')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('a@x.com')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Master A' })).not.toBeInTheDocument();
    expect(buscarDadosUsuario).toHaveBeenCalledWith(usuarioB.id);

    // Endereço: precisa vir de pessoaB (cidade preenchida), não de pessoaA (cidade null).
    expect(screen.getByDisplayValue('Cidade de B')).toBeInTheDocument();

    // Salas: a caixa de B tem que estar marcada e a de A desmarcada — o bug original
    // fazia o oposto (concedia ao alvo as salas do ator). Escopado ao modal porque o
    // NovoUsuarioForm (master) também renderiza um SeletorSalas com o mesmo rótulo.
    const modal = titulo.parentElement?.parentElement as HTMLElement;
    expect(within(modal).getByLabelText('Sala da Pessoa B')).toBeChecked();
    expect(within(modal).getByLabelText('Sala do Master A')).not.toBeChecked();
  });
});
