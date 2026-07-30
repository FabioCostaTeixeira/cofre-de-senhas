'use server';

import { redirect } from 'next/navigation';
import { createSession, destroySession, readSession } from '@/lib/auth/session';
import { verifyPassword } from '@/lib/auth/password';
import { audit } from '@/lib/db/audit';
import {
  clearFailedLogins, findUserByEmail, registerFailedLogin,
} from '@/lib/db/users';

export type LoginState = { error?: string };

const GENERICO = 'E-mail ou senha inválidos.';

// Hash bcrypt (custo 12) de uma string arbitrária, sem relação com qualquer senha real.
// Existe só para gastar o mesmo tempo de CPU que `verifyPassword` gastaria num login
// legítimo, quando o e-mail não existe ou a conta está inativa. Sem isso, essas duas
// respostas voltam quase instantaneamente enquanto uma senha errada em conta válida
// demora ~100ms por causa do bcrypt, e essa diferença de tempo denuncia quais e-mails
// existem no sistema (timing side-channel). NÃO REMOVER achando que é código morto:
// o resultado da comparação é descartado, só o tempo gasto importa.
const HASH_FANTASMA = '$2b$12$KI2ozafUNPtHxqLrKI3/UuWe61dO0TMwp3QPvqGTMRmWdD/r0owb6';

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim();
  const senha = String(formData.get('senha') ?? '');

  if (!email || !senha) return { error: 'Preencha e-mail e senha.' };

  const user = await findUserByEmail(email);
  if (!user || !user.is_active) {
    // Comparação descartável: iguala o tempo de resposta ao caminho de senha errada,
    // sem influenciar em nada a decisão — a resposta já está definida como genérica.
    await verifyPassword(senha, HASH_FANTASMA);
    await audit({ actorId: null, action: 'login_fail', metadata: { email } });
    return { error: GENERICO };
  }

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    // Mesma comparação descartável do ramo "e-mail inexistente" logo acima: gasta o
    // tempo do bcrypt e devolve a mensagem genérica. Contar pro usuário que a conta
    // está bloqueada (como a versão anterior fazia) entrega de graça, pelo texto e
    // pelo tempo de resposta, quais e-mails existem no sistema — a mesma falha que o
    // HASH_FANTASMA existe para evitar. Perder essa conveniência para o usuário
    // legítimo (que não fica sabendo do motivo exato) vale menos que fechar a
    // enumeração de contas para um atacante.
    await verifyPassword(senha, HASH_FANTASMA);
    await audit({
      actorId: user.id, action: 'login_fail', entityType: 'user', entityId: user.id,
      metadata: { bloqueada: true },
    });
    return { error: GENERICO };
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
  const actorId = await readSession();
  await destroySession();
  if (actorId) {
    await audit({
      actorId, action: 'logout', entityType: 'user', entityId: actorId,
    });
  }
  redirect('/login');
}
