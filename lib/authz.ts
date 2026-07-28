import type { Actor } from '@/lib/types';

export type CredentialAcl = {
  id: string;
  room_id: string;
  owner_id: string;
  is_global: boolean;
  deleted_at: string | null;
};

/** Recurso inexistente OU sem permissão. Rotas traduzem em 404, nunca 403. */
export class NotFoundError extends Error {
  constructor(message = 'Não encontrado') {
    super(message);
    this.name = 'NotFoundError';
  }
}

const isMaster = (a: Actor) => a.role === 'master';

export function canReadCredential(actor: Actor, c: CredentialAcl, isMember: boolean): boolean {
  if (isMaster(actor)) return true;
  if (c.deleted_at) return false;
  if (!isMember) return false;
  return c.is_global || c.owner_id === actor.id;
}

/**
 * O dono edita a própria credencial (global ou pessoal) desde que ainda seja
 * membro da sala. O master edita as credenciais globais de terceiros e também
 * as próprias (mesmo pessoais), mas nunca a senha pessoal de outra pessoa.
 */
export function canEditCredential(actor: Actor, c: CredentialAcl, isMember: boolean): boolean {
  if (c.deleted_at) return false;
  if (c.owner_id === actor.id) {
    if (isMaster(actor)) return true;
    // A sala controla o acesso: sem ser membro, nem o próprio dono edita a credencial.
    return isMember;
  }
  if (isMaster(actor)) return c.is_global;
  return false;
}

/** Master pode mandar qualquer credencial para a lixeira. */
export function canDeleteCredential(actor: Actor, c: CredentialAcl, isMember: boolean): boolean {
  if (c.deleted_at) return false;
  if (isMaster(actor)) return true;
  // A sala controla o acesso: sem ser membro, nem o próprio dono apaga a credencial.
  if (!isMember) return false;
  return c.owner_id === actor.id;
}

/** Master sempre pode criar; usuário comum só se for membro da sala. */
export function canCreateCredential(actor: Actor, isMember: boolean): boolean {
  if (isMaster(actor)) return true;
  return isMember;
}

export const canManageRooms = (actor: Actor) => isMaster(actor);
export const canManageUsers = (actor: Actor) => isMaster(actor);
export const canViewAudit = (actor: Actor) => isMaster(actor);
export const canUseTrash = (actor: Actor) => isMaster(actor);
