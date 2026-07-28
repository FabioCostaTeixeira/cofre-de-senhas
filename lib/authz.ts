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

/** Master edita globais de terceiros, mas nunca uma senha pessoal alheia. */
export function canEditCredential(actor: Actor, c: CredentialAcl, isMember: boolean): boolean {
  if (c.deleted_at) return false;
  if (c.owner_id === actor.id) return true;
  if (isMaster(actor)) return c.is_global;
  return false;
}

/** Master pode mandar qualquer credencial para a lixeira. */
export function canDeleteCredential(actor: Actor, c: CredentialAcl, isMember: boolean): boolean {
  if (c.deleted_at) return false;
  if (c.owner_id === actor.id) return true;
  return isMaster(actor);
}

export const canManageRooms = (actor: Actor) => isMaster(actor);
export const canManageUsers = (actor: Actor) => isMaster(actor);
export const canViewAudit = (actor: Actor) => isMaster(actor);
export const canUseTrash = (actor: Actor) => isMaster(actor);
