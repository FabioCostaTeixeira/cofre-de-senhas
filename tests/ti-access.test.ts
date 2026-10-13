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

import { requireTiAccess } from '@/lib/auth/guards';

const usuario = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'usuario@x.com',
  name: 'Usuário',
  role: 'user' as const,
  is_active: true,
  must_change_password: false,
};

describe('requireTiAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readSession.mockResolvedValue(usuario.id);
    mocks.findUserById.mockResolvedValue(usuario);
  });

  it('libera master sem consultar concessão de módulo', async () => {
    mocks.findUserById.mockResolvedValue({ ...usuario, role: 'master' });

    await expect(requireTiAccess()).resolves.toMatchObject({ role: 'master' });
    expect(mocks.listModulesOfUser).not.toHaveBeenCalled();
  });

  it('libera usuário com módulo TI concedido', async () => {
    mocks.listModulesOfUser.mockResolvedValue(['ti']);

    await expect(requireTiAccess()).resolves.toMatchObject({ id: usuario.id });
    expect(mocks.listModulesOfUser).toHaveBeenCalledWith(usuario.id);
  });

  it('nega usuário sem módulo TI antes de carregar dados', async () => {
    mocks.listModulesOfUser.mockResolvedValue(['gestao']);

    await expect(requireTiAccess()).rejects.toThrow('not-found');
    expect(mocks.notFound).toHaveBeenCalledOnce();
  });
});
