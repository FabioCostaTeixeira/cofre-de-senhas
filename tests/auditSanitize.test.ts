import { describe, expect, it } from 'vitest';
import { sanitizeAuditMetadata } from '@/lib/db/auditSanitize';

describe('sanitizeAuditMetadata', () => {
  it('mantém chaves inofensivas intactas', () => {
    expect(sanitizeAuditMetadata({ email: 'a@x.com', role: 'master' }))
      .toEqual({ email: 'a@x.com', role: 'master' });
  });

  it('remove chaves com nome de senha, em qualquer caixa', () => {
    expect(sanitizeAuditMetadata({ senha: '123', SenhaAtual: '123', password: 'x' }))
      .toEqual({});
  });

  it('remove chaves relacionadas a segredo, token, hash e chave', () => {
    expect(sanitizeAuditMetadata({
      secret: 'a', apiToken: 'b', password_hash: 'c', vaultKey: 'd', ok: true,
    })).toEqual({ ok: true });
  });

  it('não afeta chaves que só contêm a substring por coincidência de contexto diferente', () => {
    // "nome" não bate no padrão; garante que o regex não é ganancioso demais.
    expect(sanitizeAuditMetadata({ nome: 'Fulano' })).toEqual({ nome: 'Fulano' });
  });

  it('trunca valores de texto muito longos', () => {
    const longo = 'a'.repeat(600);
    const resultado = sanitizeAuditMetadata({ nota: longo });
    expect((resultado.nota as string).length).toBe(501);
    expect((resultado.nota as string).endsWith('…')).toBe(true);
  });

  it('preserva valores não textuais mesmo quando grandes', () => {
    expect(sanitizeAuditMetadata({ isActive: false, count: 42 }))
      .toEqual({ isActive: false, count: 42 });
  });

  it('não falha com metadata vazio', () => {
    expect(sanitizeAuditMetadata({})).toEqual({});
  });
});
