'use server';

import { redirect } from 'next/navigation';
import { createSession, destroySession } from '@/lib/auth/session';
import { verifyPassword } from '@/lib/auth/password';
import { audit } from '@/lib/db/audit';
import {
  clearFailedLogins, findUserByEmail, registerFailedLogin,
} from '@/lib/db/users';

export type LoginState = { error?: string };

const GENERICO = 'E-mail ou senha inválidos.';

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim();
  const senha = String(formData.get('senha') ?? '');

  if (!email || !senha) return { error: 'Preencha e-mail e senha.' };

  const user = await findUserByEmail(email);
  if (!user || !user.is_active) {
    await audit({ actorId: null, action: 'login_fail', metadata: { email } });
    return { error: GENERICO };
  }

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    return { error: 'Conta temporariamente bloqueada. Tente novamente em 15 minutos.' };
  }

  if (!(await verifyPassword(senha, user.password_hash))) {
    await registerFailedLogin(user.id);
    await audit({ actorId: user.id, action: 'login_fail', entityType: 'user', entityId: user.id });
    return { error: GENERICO };
  }

  await clearFailedLogins(user.id);
  await createSession(user.id);
  await audit({ actorId: user.id, action: 'login_ok', entityType: 'user', entityId: user.id });

  redirect(user.must_change_password ? '/trocar-senha' : '/');
}

/** Recebe FormData porque é usada direto como `action` de um <form>. */
export async function logout(_formData: FormData): Promise<void> {
  await destroySession();
  redirect('/login');
}
