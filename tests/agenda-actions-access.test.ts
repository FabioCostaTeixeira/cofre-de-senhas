import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireModulo: vi.fn(),
  createAgendamento: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/guards', () => ({ requireModulo: mocks.requireModulo }));
vi.mock('@/lib/db/audit', () => ({ audit: vi.fn() }));
vi.mock('@/lib/db/agenda', () => ({
  ConflitoHorarioError: class extends Error {},
  createAgendamento: mocks.createAgendamento,
  moverOuRedimensionar: vi.fn(),
  softDeleteAgendamento: vi.fn(),
  updateAgendamento: vi.fn(),
}));
vi.mock('@/lib/db/bloqueios', () => ({
  ConflitoBloqueioError: class extends Error {},
  createBloqueio: vi.fn(),
  softDeleteBloqueio: vi.fn(),
}));

import { criarAgendamento } from '@/app/(app)/agenda/actions';

describe('ações da Agenda', () => {
  it('exige a área agenda e não grava quando o acesso é negado', async () => {
    mocks.requireModulo.mockRejectedValueOnce(new Error('not-found'));

    await expect(criarAgendamento({}, new FormData())).rejects.toThrow('not-found');
    expect(mocks.requireModulo).toHaveBeenCalledWith('agenda');
    expect(mocks.createAgendamento).not.toHaveBeenCalled();
  });
});
