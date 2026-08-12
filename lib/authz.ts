import type { Actor } from '@/lib/types';

export type CredentialAcl = {
  id: string;
  room_id: string;
  owner_id: string;
  is_global: boolean;
  deleted_at: string | null;
  /** `deleted_at` da sala dona da credencial — sala na lixeira corta o acesso direto. */
  room_deleted_at: string | null;
  /**
   * O ator está na lista de compartilhamento desta credencial (tabela
   * `credential_shares`). Vale só para senha não-global: é como o dono libera
   * a senha para algumas pessoas da sala, em vez de para todas.
   * Dá direito a ver e copiar — nunca a editar ou apagar.
   */
  shared_with_actor?: boolean;
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
  // Sala na lixeira corta o acesso direto de todo mundo, exceto o master (isenção acima).
  if (c.room_deleted_at) return false;
  if (!isMember) return false;
  // Global: toda a sala. Não-global: o dono, mais quem ele escolheu compartilhar.
  return c.is_global || c.owner_id === actor.id || c.shared_with_actor === true;
}

/**
 * O dono edita a própria credencial (global ou pessoal) desde que ainda seja
 * membro da sala. O master edita as credenciais globais de terceiros e também
 * as próprias (mesmo pessoais), mas nunca a senha pessoal de outra pessoa.
 * Credencial ou sala na lixeira bloqueiam a edição para todos, master incluso
 * (é preciso restaurar antes) — mesmo padrão já usado para `c.deleted_at`.
 */
export function canEditCredential(actor: Actor, c: CredentialAcl, isMember: boolean): boolean {
  if (c.deleted_at) return false;
  if (c.room_deleted_at) return false;
  if (c.owner_id === actor.id) {
    if (isMaster(actor)) return true;
    // A sala controla o acesso: sem ser membro, nem o próprio dono edita a credencial.
    return isMember;
  }
  if (isMaster(actor)) return c.is_global;
  return false;
}

/**
 * Master pode mandar qualquer credencial para a lixeira. Credencial ou sala já na
 * lixeira bloqueiam a remoção para todos, master incluso (é preciso restaurar antes).
 */
export function canDeleteCredential(actor: Actor, c: CredentialAcl, isMember: boolean): boolean {
  if (c.deleted_at) return false;
  if (c.room_deleted_at) return false;
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

/**
 * Master-only por enquanto, no mesmo formato de `canManageUsers`. Função
 * própria (e não reuso de `canManageUsers`) porque são permissões
 * conceitualmente diferentes — gerenciar usuário do sistema vs. gerenciar
 * cadastro de terceiro — mesmo empatando em "só master" hoje. Se um dia
 * usuário comum ganhar acesso a um mas não ao outro, a separação já existe.
 */
export const canManageTerceiros = (actor: Actor) => isMaster(actor);
export const canManageProdutos = (actor: Actor) => isMaster(actor);
export const canManageLocaisGravacao = (actor: Actor) => isMaster(actor);
export const canManageAgenda = (actor: Actor) => isMaster(actor);
export const canManageContratacoes = (actor: Actor) => isMaster(actor);
export const canManageOrdensServico = (actor: Actor) => isMaster(actor);
export const canViewAudit = (actor: Actor) => isMaster(actor);

/**
 * O que o ator pode escrever no cadastro de `alvoUserId`.
 *
 * `'contato'` cobre telefone e os sete campos de endereço. Fora disso é `'todos'`
 * (master) ou `'nenhum'`.
 *
 * O terceiro valor existe porque `'todos' | 'contato'` deixaria um usuário comum
 * apontando para outra pessoa cair em `'contato'` — ou seja, alterando telefone e
 * endereço alheios.
 */
export type EscopoCampos = 'todos' | 'contato' | 'nenhum';

export function camposEditaveis(actor: Actor, alvoUserId: string): EscopoCampos {
  if (isMaster(actor)) return 'todos';
  if (actor.id === alvoUserId) return 'contato';
  return 'nenhum';
}

/**
 * Revelar CPF e RG é restrito ao dono do dado e ao master. Toda revelação é
 * auditada por quem chama (`action: 'view'`, `entityType: 'user'`).
 */
export function podeRevelarDados(actor: Actor, alvoUserId: string): boolean {
  return isMaster(actor) || actor.id === alvoUserId;
}
