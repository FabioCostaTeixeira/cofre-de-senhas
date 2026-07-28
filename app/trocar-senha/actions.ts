'use server';

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/guards';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { audit } from '@/lib/db/audit';
import { findUserById, setPassword } from '@/lib/db/users';

export type ChangeState = { error?: string };

export async function changePassword(
  _prev: ChangeState, formData: FormData,
): Promise<ChangeState> {
  const actor = await requireUser();
  const atual = String(formData.get('atual') ?? '');
  const nova = String(formData.get('nova') ?? '');
  const confirma = String(formData.get('confirma') ?? '');

  if (nova.length < 10) return { error: 'A nova senha precisa ter ao menos 10 caracteres.' };
  if (nova !== confirma) return { error: 'A confirmação não confere com a nova senha.' };

  const user = await findUserById(actor.id);
  if (!user || !(await verifyPassword(atual, user.password_hash))) {
    return { error: 'Senha atual incorreta.' };
  }

  await setPassword(actor.id, await hashPassword(nova), false);
  await audit({
    actorId: actor.id, action: 'password_change', entityType: 'user', entityId: actor.id,
  });

  redirect('/');
}
