import { describe, expect, it } from 'vitest';
import {
  canDeleteCredential, canEditCredential, canManageRooms, canManageUsers,
  canReadCredential, canViewAudit, type CredentialAcl,
} from '@/lib/authz';
import type { Actor } from '@/lib/types';

const master: Actor = { id: 'u-master', email: 'm@x', name: 'M', role: 'master', mustChangePassword: false };
const dono: Actor   = { id: 'u-dono',   email: 'd@x', name: 'D', role: 'user',   mustChangePassword: false };
const membro: Actor = { id: 'u-membro', email: 'b@x', name: 'B', role: 'user',   mustChangePassword: false };
const estranho: Actor = { id: 'u-estranho', email: 'e@x', name: 'E', role: 'user', mustChangePassword: false };

const global_: CredentialAcl = {
  id: 'c1', room_id: 'r1', owner_id: 'u-dono', is_global: true, deleted_at: null,
};
const pessoal: CredentialAcl = {
  id: 'c2', room_id: 'r1', owner_id: 'u-dono', is_global: false, deleted_at: null,
};
const apagada: CredentialAcl = { ...global_, id: 'c3', deleted_at: '2026-01-01T00:00:00Z' };

describe('leitura', () => {
  it('master lê tudo, inclusive pessoal de terceiro', () => {
    expect(canReadCredential(master, global_, false)).toBe(true);
    expect(canReadCredential(master, pessoal, false)).toBe(true);
  });

  it('membro lê a global da sala', () => {
    expect(canReadCredential(membro, global_, true)).toBe(true);
  });

  it('membro NÃO lê a pessoal de outro', () => {
    expect(canReadCredential(membro, pessoal, true)).toBe(false);
  });

  it('dono lê a própria pessoal', () => {
    expect(canReadCredential(dono, pessoal, true)).toBe(true);
  });

  it('estranho à sala não lê nada dela', () => {
    expect(canReadCredential(estranho, global_, false)).toBe(false);
    expect(canReadCredential(estranho, pessoal, false)).toBe(false);
  });

  it('ninguém lê credencial na lixeira, exceto master', () => {
    expect(canReadCredential(membro, apagada, true)).toBe(false);
    expect(canReadCredential(master, apagada, false)).toBe(true);
  });
});

describe('edição', () => {
  it('dono edita a própria global', () => {
    expect(canEditCredential(dono, global_, true)).toBe(true);
  });

  it('master edita global de terceiro', () => {
    expect(canEditCredential(master, global_, false)).toBe(true);
  });

  it('master NÃO edita pessoal de terceiro', () => {
    expect(canEditCredential(master, pessoal, false)).toBe(false);
  });

  it('membro não edita global de outro', () => {
    expect(canEditCredential(membro, global_, true)).toBe(false);
  });
});

describe('remoção', () => {
  it('master apaga qualquer uma, inclusive pessoal de terceiro', () => {
    expect(canDeleteCredential(master, pessoal, false)).toBe(true);
    expect(canDeleteCredential(master, global_, false)).toBe(true);
  });

  it('dono apaga a própria', () => {
    expect(canDeleteCredential(dono, pessoal, true)).toBe(true);
  });

  it('membro não apaga a de outro', () => {
    expect(canDeleteCredential(membro, global_, true)).toBe(false);
  });
});

describe('administração', () => {
  it('só master gerencia salas, usuários e vê auditoria', () => {
    expect(canManageRooms(master)).toBe(true);
    expect(canManageRooms(dono)).toBe(false);
    expect(canManageUsers(master)).toBe(true);
    expect(canManageUsers(dono)).toBe(false);
    expect(canViewAudit(master)).toBe(true);
    expect(canViewAudit(dono)).toBe(false);
  });
});
