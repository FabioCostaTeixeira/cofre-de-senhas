import { describe, expect, it } from 'vitest';
import {
  canCreateCredential, canDeleteCredential, canEditCredential, canManageRooms, canManageUsers,
  canManageTerceiros, canManageProdutos, canManageLocaisGravacao, canManageAgenda,
  canReadCredential, canViewAudit, camposEditaveis, podeRevelarDados, type CredentialAcl,
} from '@/lib/authz';
import type { Actor } from '@/lib/types';

const master: Actor = { id: 'u-master', email: 'm@x', name: 'M', role: 'master', mustChangePassword: false };
const dono: Actor   = { id: 'u-dono',   email: 'd@x', name: 'D', role: 'user',   mustChangePassword: false };
const membro: Actor = { id: 'u-membro', email: 'b@x', name: 'B', role: 'user',   mustChangePassword: false };
const estranho: Actor = { id: 'u-estranho', email: 'e@x', name: 'E', role: 'user', mustChangePassword: false };

const global_: CredentialAcl = {
  id: 'c1', room_id: 'r1', owner_id: 'u-dono', is_global: true, deleted_at: null,
  room_deleted_at: null,
};
const pessoal: CredentialAcl = {
  id: 'c2', room_id: 'r1', owner_id: 'u-dono', is_global: false, deleted_at: null,
  room_deleted_at: null,
};
const apagada: CredentialAcl = { ...global_, id: 'c3', deleted_at: '2026-01-01T00:00:00Z' };
const pessoalDoMaster: CredentialAcl = {
  id: 'c5', room_id: 'r1', owner_id: 'u-master', is_global: false, deleted_at: null,
  room_deleted_at: null,
};
const naSalaApagada: CredentialAcl = {
  id: 'c6', room_id: 'r2', owner_id: 'u-dono', is_global: true, deleted_at: null,
  room_deleted_at: '2026-01-02T00:00:00Z',
};
const pessoalNaSalaApagada: CredentialAcl = {
  id: 'c7', room_id: 'r2', owner_id: 'u-dono', is_global: false, deleted_at: null,
  room_deleted_at: '2026-01-02T00:00:00Z',
};

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

  it('dono que saiu da sala (não é mais membro) não edita a própria pessoal', () => {
    expect(canEditCredential(dono, pessoal, false)).toBe(false);
  });

  it('master não membro continua editando a global de terceiro', () => {
    expect(canEditCredential(master, global_, false)).toBe(true);
  });

  it('master não edita item já na lixeira, mesmo sendo global', () => {
    expect(canEditCredential(master, apagada, false)).toBe(false);
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

  it('dono que saiu da sala (não é mais membro) não apaga a própria pessoal', () => {
    expect(canDeleteCredential(dono, pessoal, false)).toBe(false);
  });

  it('master não membro continua apagando qualquer credencial', () => {
    expect(canDeleteCredential(master, global_, false)).toBe(true);
    expect(canDeleteCredential(master, pessoal, false)).toBe(true);
  });

  it('master não apaga item já na lixeira (precisa restaurar antes)', () => {
    expect(canDeleteCredential(master, apagada, false)).toBe(false);
  });
});

describe('coerência dono removido da sala', () => {
  it('dono não membro não lê, não edita e não apaga a própria pessoal', () => {
    expect(canReadCredential(dono, pessoal, false)).toBe(false);
    expect(canEditCredential(dono, pessoal, false)).toBe(false);
    expect(canDeleteCredential(dono, pessoal, false)).toBe(false);
  });
});

describe('leitura de credencial pessoal apagada', () => {
  const pessoalApagada: CredentialAcl = { ...pessoal, id: 'c4', deleted_at: '2026-01-01T00:00:00Z' };

  it('dono não lê a própria credencial pessoal se ela estiver na lixeira', () => {
    expect(canReadCredential(dono, pessoalApagada, true)).toBe(false);
  });

  it('membro não lê credencial pessoal apagada de outro', () => {
    expect(canReadCredential(membro, pessoalApagada, true)).toBe(false);
  });
});

describe('master dono de senha pessoal', () => {
  it('master edita a própria pessoal mesmo não sendo membro da sala', () => {
    expect(canEditCredential(master, pessoalDoMaster, false)).toBe(true);
  });

  it('master apaga a própria pessoal', () => {
    expect(canDeleteCredential(master, pessoalDoMaster, false)).toBe(true);
  });
});

describe('criação', () => {
  it('master pode criar mesmo não sendo membro da sala', () => {
    expect(canCreateCredential(master, false)).toBe(true);
  });

  it('usuário comum membro da sala pode criar', () => {
    expect(canCreateCredential(membro, true)).toBe(true);
  });

  it('usuário comum não membro da sala não pode criar', () => {
    expect(canCreateCredential(estranho, false)).toBe(false);
  });
});

describe('sala na lixeira corta acesso direto à credencial', () => {
  it('membro não lê credencial de sala apagada, mesmo sendo global', () => {
    expect(canReadCredential(membro, naSalaApagada, true)).toBe(false);
  });

  it('dono não lê a própria credencial se a sala dela foi apagada', () => {
    expect(canReadCredential(dono, pessoalNaSalaApagada, true)).toBe(false);
  });

  it('master continua lendo credencial de sala apagada', () => {
    expect(canReadCredential(master, naSalaApagada, false)).toBe(true);
    expect(canReadCredential(master, pessoalNaSalaApagada, false)).toBe(true);
  });

  it('dono não edita a própria credencial se a sala dela foi apagada', () => {
    expect(canEditCredential(dono, pessoalNaSalaApagada, true)).toBe(false);
  });

  it('master não edita credencial de sala apagada (precisa restaurar a sala antes)', () => {
    expect(canEditCredential(master, naSalaApagada, false)).toBe(false);
  });

  it('dono não apaga a própria credencial se a sala dela foi apagada', () => {
    expect(canDeleteCredential(dono, pessoalNaSalaApagada, true)).toBe(false);
  });

  it('master não apaga credencial de sala apagada (precisa restaurar a sala antes)', () => {
    expect(canDeleteCredential(master, naSalaApagada, false)).toBe(false);
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

  it('só master gerencia clientes e fornecedores', () => {
    expect(canManageTerceiros(master)).toBe(true);
    expect(canManageTerceiros(dono)).toBe(false);
  });

  it('só master gerencia produtos', () => {
    expect(canManageProdutos(master)).toBe(true);
    expect(canManageProdutos(dono)).toBe(false);
  });

  it('só master gerencia locais de gravação', () => {
    expect(canManageLocaisGravacao(master)).toBe(true);
    expect(canManageLocaisGravacao(dono)).toBe(false);
  });

  it('só master gerencia a agenda', () => {
    expect(canManageAgenda(master)).toBe(true);
    expect(canManageAgenda(dono)).toBe(false);
  });
});

describe('compartilhamento individual', () => {
  const compartilhada: CredentialAcl = {
    id: 'c9', room_id: 'r1', owner_id: 'u-dono', is_global: false,
    deleted_at: null, room_deleted_at: null, shared_with_actor: true,
  };
  const naoCompartilhada: CredentialAcl = { ...compartilhada, shared_with_actor: false };

  it('membro da sala lê a senha restrita compartilhada com ele', () => {
    expect(canReadCredential(membro, compartilhada, true)).toBe(true);
  });

  it('membro NÃO lê a restrita que não foi compartilhada com ele', () => {
    expect(canReadCredential(membro, naoCompartilhada, true)).toBe(false);
  });

  it('compartilhamento não vale fora da sala', () => {
    expect(canReadCredential(membro, compartilhada, false)).toBe(false);
  });

  it('compartilhamento dá leitura, nunca edição ou remoção', () => {
    expect(canEditCredential(membro, compartilhada, true)).toBe(false);
    expect(canDeleteCredential(membro, compartilhada, true)).toBe(false);
  });

  it('sala na lixeira corta o acesso mesmo compartilhado', () => {
    const emSalaApagada = { ...compartilhada, room_deleted_at: '2026-01-01T00:00:00Z' };
    expect(canReadCredential(membro, emSalaApagada, true)).toBe(false);
  });
});

describe('camposEditaveis', () => {
  const master: Actor = {
    id: 'm1', email: 'm@x.com', name: 'Master', role: 'master', mustChangePassword: false,
  };
  const comum: Actor = {
    id: 'u1', email: 'u@x.com', name: 'Comum', role: 'user', mustChangePassword: false,
  };

  it('master edita tudo de qualquer pessoa', () => {
    expect(camposEditaveis(master, 'u1')).toBe('todos');
  });

  it('master edita tudo de si mesmo', () => {
    expect(camposEditaveis(master, 'm1')).toBe('todos');
  });

  it('comum edita só o contato do próprio cadastro', () => {
    expect(camposEditaveis(comum, 'u1')).toBe('contato');
  });

  it('comum não edita nada de outra pessoa', () => {
    expect(camposEditaveis(comum, 'u2')).toBe('nenhum');
  });
});

describe('podeRevelarDados', () => {
  const master: Actor = {
    id: 'm1', email: 'm@x.com', name: 'Master', role: 'master', mustChangePassword: false,
  };
  const comum: Actor = {
    id: 'u1', email: 'u@x.com', name: 'Comum', role: 'user', mustChangePassword: false,
  };

  it('master revela documento de qualquer pessoa', () => {
    expect(podeRevelarDados(master, 'u1')).toBe(true);
  });

  it('dono revela o próprio documento', () => {
    expect(podeRevelarDados(comum, 'u1')).toBe(true);
  });

  it('comum não revela documento de outra pessoa', () => {
    expect(podeRevelarDados(comum, 'u2')).toBe(false);
  });

  it('master revela o próprio documento', () => {
    expect(podeRevelarDados(master, 'm1')).toBe(true);
  });
});
