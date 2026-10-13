import { redirect } from 'next/navigation';
import { notFound } from 'next/navigation';
import { readSession } from '@/lib/auth/session';
import { findUserById } from '@/lib/db/users';
import { listModulesOfUser } from '@/lib/db/queries';
import { MODULES, isModuleKey, type ModuleKey } from '@/lib/modules';
import type { Actor } from '@/lib/types';

/**
 * Valida o cookie e carrega o usuário do banco a cada request — assim
 * desativar um usuário ou rebaixar seu papel tem efeito imediato.
 */
export async function requireUser(): Promise<Actor> {
  const userId = await readSession();
  if (!userId) redirect('/login');

  const user = await findUserById(userId);
  if (!user || !user.is_active) redirect('/login');

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    mustChangePassword: user.must_change_password,
  };
}

/** Usuário autenticado que já trocou a senha inicial. */
export async function requireReadyUser(): Promise<Actor> {
  const actor = await requireUser();
  if (actor.mustChangePassword) redirect('/trocar-senha');
  return actor;
}

/** Áreas que o ator enxerga: todas para o master, as concedidas para os demais. */
export async function modulosDoAtor(actor: Actor): Promise<ModuleKey[]> {
  if (actor.role === 'master') return MODULES.map((m) => m.key);
  return (await listModulesOfUser(actor.id)).filter(isModuleKey);
}

/**
 * Barreira real de cada área liberável (página e server action). Sem acesso vira
 * 404, nunca 403 — mesmo padrão do resto do app. Esconder o menu é só cosmético.
 */
export async function requireModulo(key: ModuleKey): Promise<Actor> {
  const actor = await requireReadyUser();
  if (actor.role === 'master') return actor;
  if (!(await listModulesOfUser(actor.id)).includes(key)) notFound();
  return actor;
}

export const requireTiAccess = () => requireModulo('ti');

/** Barreira real do /admin. Esconder o menu na UI é apenas cosmético. */
export async function requireMaster(): Promise<Actor> {
  const actor = await requireReadyUser();
  if (actor.role !== 'master') notFound();
  return actor;
}
