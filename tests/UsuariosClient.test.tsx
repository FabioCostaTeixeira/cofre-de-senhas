import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { UsuariosClient } from '@/app/(app)/usuarios/UsuariosClient';
import type { Pessoa, UserComContato } from '@/lib/types';

vi.mock('@/app/(app)/usuarios/actions', () => ({
  salvarCadastro: vi.fn(),
  criarUsuario: vi.fn(),
  revelarDocumentosAction: vi.fn(),
  buscarCep: vi.fn(),
  resetUserPassword: vi.fn(),
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
});
