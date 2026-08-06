import { beforeAll, describe, expect, it } from 'vitest';

beforeAll(() => {
  // 32 bytes em base64
  process.env.VAULT_KEY = Buffer.alloc(32, 7).toString('base64');
});

// Import para os novos testes
import { cpfHmac } from '@/lib/crypto';

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

  it('lança erro se VAULT_KEY não está configurada', async () => {
    const { encrypt } = await import('@/lib/crypto');
    const original = process.env.VAULT_KEY;
    try {
      delete process.env.VAULT_KEY;
      expect(() => encrypt('segredo', 'aad')).toThrow('VAULT_KEY não configurada');
    } finally {
      process.env.VAULT_KEY = original;
    }
  });

  it('lança erro se VAULT_KEY não tem 32 bytes após decodificar de base64', async () => {
    const { encrypt } = await import('@/lib/crypto');
    const original = process.env.VAULT_KEY;
    try {
      // 16 bytes em base64 (não 32)
      process.env.VAULT_KEY = Buffer.alloc(16, 5).toString('base64');
      expect(() => encrypt('segredo', 'aad')).toThrow('VAULT_KEY deve ter 32 bytes em base64');
    } finally {
      process.env.VAULT_KEY = original;
    }
  });
});

describe('cpfHmac', () => {
  it('é determinístico: mesma entrada, mesmo HMAC', () => {
    const a = cpfHmac('52998224725');
    const b = cpfHmac('52998224725');
    expect(a.equals(b)).toBe(true);
  });

  it('ignora máscara, porque o índice é sobre os dígitos', () => {
    expect(cpfHmac('529.982.247-25').equals(cpfHmac('52998224725'))).toBe(true);
  });

  it('CPFs diferentes produzem HMACs diferentes', () => {
    expect(cpfHmac('52998224725').equals(cpfHmac('11144477735'))).toBe(false);
  });

  it('devolve 32 bytes (SHA-256)', () => {
    expect(cpfHmac('52998224725')).toHaveLength(32);
  });

  it('não é o CPF em claro nem contém o CPF', () => {
    const hmac = cpfHmac('52998224725');
    expect(hmac.toString('hex')).not.toContain('52998224725');
    expect(hmac.toString('utf8')).not.toContain('52998224725');
  });
});
