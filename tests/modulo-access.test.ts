import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readSession: vi.fn(),
  findUserById: vi.fn(),
  listModulesOfUser: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('not-found');
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  notFound: mocks.notFound,
}));
vi.mock('@/lib/auth/session', () => ({ readSession: mocks.readSession }));
vi.mock('@/lib/db/users', () => ({ findUserById: mocks.findUserById }));
vi.mock('@/lib/db/queries', () => ({ listModulesOfUser: mocks.listModulesOfUser }));

import { modulosDoAtor, requireModulo } from '@/lib/auth/guards';
import { MODULES } from '@/lib/modules';

const usuario = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'usuario@x.com',
  name: 'Usuário',
  role: 'user' as const,
  is_active: true,
  must_change_password: false,
};

describe('requireModulo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readSession.mockResolvedValue(usuario.id);
    mocks.findUserById.mockResolvedValue(usuario);
  });

  it('libera master em qualquer área sem consultar concessões', async () => {
    mocks.findUserById.mockResolvedValue({ ...usuario, role: 'master' });

    await expect(requireModulo('agenda')).resolves.toMatchObject({ role: 'master' });
    expect(mocks.listModulesOfUser).not.toHaveBeenCalled();
  });

  it('libera usuário só na área concedida', async () => {
    mocks.listModulesOfUser.mockResolvedValue(['clientes']);

    await expect(requireModulo('clientes')).resolves.toMatchObject({ id: usuario.id });
    await expect(requireModulo('fornecedores')).rejects.toThrow('not-found');
  });

  it('Painel e Working começam bloqueados para usuário sem concessão', async () => {
    mocks.listModulesOfUser.mockResolvedValue([]);

    await expect(requireModulo('painel')).rejects.toThrow('not-found');
    await expect(requireModulo('working')).rejects.toThrow('not-found');
  });
});

describe('modulosDoAtor', () => {
  const ator = { id: usuario.id, email: usuario.email, name: usuario.name, mustChangePassword: false };

  it('master enxerga todas as áreas', async () => {
    await expect(modulosDoAtor({ ...ator, role: 'master' }))
      .resolves.toEqual(MODULES.map((m) => m.key));
  });

  it('descarta concessões que não são áreas do catálogo (ex.: gestao)', async () => {
    mocks.listModulesOfUser.mockResolvedValue(['gestao', 'agenda']);

    await expect(modulosDoAtor({ ...ator, role: 'user' })).resolves.toEqual(['agenda']);
  });
});
