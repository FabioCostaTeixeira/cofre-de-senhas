import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireTiAccess: vi.fn(),
  createTiProjeto: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('@/lib/auth/guards', () => ({ requireTiAccess: mocks.requireTiAccess }));
vi.mock('@/lib/db/ti', () => ({
  createTiProjeto: mocks.createTiProjeto,
  deleteTiProjeto: vi.fn(),
  duplicateTiProjeto: vi.fn(),
  updateTiProjeto: vi.fn(),
}));

import { criarOuEditarProjetoAction } from '@/app/(app)/ti/projetos/actions';

describe('ações TI', () => {
  it('não grava projeto quando acesso TI é negado', async () => {
    mocks.requireTiAccess.mockRejectedValueOnce(new Error('not-found'));
    const formData = new FormData();
    formData.set('nome', 'Projeto forjado');

    await expect(criarOuEditarProjetoAction({}, formData)).rejects.toThrow('not-found');
    expect(mocks.createTiProjeto).not.toHaveBeenCalled();
  });
});
