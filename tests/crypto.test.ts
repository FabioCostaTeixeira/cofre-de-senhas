import { beforeAll, describe, expect, it } from 'vitest';

beforeAll(() => {
  // 32 bytes em base64
  process.env.VAULT_KEY = Buffer.alloc(32, 7).toString('base64');
});

describe('crypto', () => {
  it('faz ida e volta preservando o texto', async () => {
    const { encrypt, decrypt } = await import('@/lib/crypto');
    const aad = '11111111-1111-1111-1111-111111111111';
    const field = encrypt('minha-senha-secreta', aad);
    expect(decrypt(field, aad)).toBe('minha-senha-secreta');
  });

  it('nunca reutiliza o IV', async () => {
    const { encrypt } = await import('@/lib/crypto');
    const aad = '11111111-1111-1111-1111-111111111111';
    const a = encrypt('igual', aad);
    const b = encrypt('igual', aad);
    expect(a.iv.equals(b.iv)).toBe(false);
    expect(a.ct.equals(b.ct)).toBe(false);
  });

  it('rejeita ciphertext movido para outro registro (AAD diferente)', async () => {
    const { encrypt, decrypt } = await import('@/lib/crypto');
    const field = encrypt('segredo', 'registro-A');
    expect(() => decrypt(field, 'registro-B')).toThrow();
  });

  it('rejeita ciphertext adulterado', async () => {
    const { encrypt, decrypt } = await import('@/lib/crypto');
    const aad = 'registro-A';
    const field = encrypt('segredo', aad);
    field.ct[0] = field.ct[0] ^ 0xff;
    expect(() => decrypt(field, aad)).toThrow();
  });

  it('gera chave de 32 bytes', async () => {
    const { generateKey } = await import('@/lib/crypto');
    expect(Buffer.from(generateKey(), 'base64')).toHaveLength(32);
  });
});
