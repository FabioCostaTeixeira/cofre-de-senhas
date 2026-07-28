import { NotFoundError } from '@/lib/authz';

/** Formato geral de uuid (8-4-4-4-12 em hex) — o mesmo que o Postgres aceita como `uuid`. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * Garante que `value` tem formato de uuid antes de chegar a uma query `where id = ...`.
 * Um id malformado vindo de URL/FormData vira `NotFoundError` — o mesmo tratamento de
 * "não existe" — nunca um erro de sintaxe do Postgres vazando como 500.
 */
export function assertUuid(value: string): void {
  if (!isUuid(value)) throw new NotFoundError();
}
