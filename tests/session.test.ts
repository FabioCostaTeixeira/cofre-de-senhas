import { beforeAll, describe, expect, it } from 'vitest';

beforeAll(() => {
  process.env.SESSION_SECRET = 'segredo-de-teste-com-mais-de-32-caracteres!!';
});

describe('token de sessão', () => {
  it('assina e verifica devolvendo o userId', async () => {
    const { signToken, verifyToken } = await import('@/lib/auth/session');
    const token = await signToken('u-1');
    expect(await verifyToken(token)).toBe('u-1');
  });

  it('rejeita token adulterado', async () => {
    const { signToken, verifyToken } = await import('@/lib/auth/session');
    const token = await signToken('u-1');
    expect(await verifyToken(token.slice(0, -3) + 'aaa')).toBeNull();
  });

  it('rejeita lixo', async () => {
    const { verifyToken } = await import('@/lib/auth/session');
    expect(await verifyToken('nao-e-um-jwt')).toBeNull();
  });
});
