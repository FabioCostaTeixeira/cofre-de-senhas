'use server';

import { revalidatePath } from 'next/cache';
import { requireMaster } from '@/lib/auth/guards';
import { hashPassword } from '@/lib/auth/password';
import { audit } from '@/lib/db/audit';
import { createUser, setPassword, updateUser } from '@/lib/db/users';
import type { Role } from '@/lib/types';

export type AdminState = { error?: string; ok?: string };

export async function saveUser(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const actor = await requireMaster();
  const id = String(formData.get('id') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim();
  const role = String(formData.get('role') ?? 'user') as Role;
  const isActive = formData.get('isActive') === 'on';
  const senhaInicial = String(formData.get('senhaInicial') ?? '');

  if (!name) return { error: 'Informe o nome.' };
  if (role !== 'master' && role !== 'user') return { error: 'Papel inválido.' };

  if (id) {
    await updateUser(id, name, role, isActive);
    await audit({ actorId: actor.id, action: 'user_update', entityType: 'user', entityId: id,
                  metadata: { name, role, isActive } });
    revalidatePath('/admin/usuarios');
    return { ok: 'Usuário atualizado.' };
  }

  if (!email) return { error: 'Informe o e-mail.' };
  if (senhaInicial.length < 10) {
    return { error: 'A senha inicial precisa ter ao menos 10 caracteres.' };
  }

  try {
    const novoId = await createUser(email, name, await hashPassword(senhaInicial), role);
    await audit({ actorId: actor.id, action: 'user_create', entityType: 'user', entityId: novoId,
                  metadata: { email, role } });
  } catch {
    return { error: 'Já existe um usuário com esse e-mail.' };
  }

  revalidatePath('/admin/usuarios');
  return { ok: 'Usuário criado. Ele trocará a senha no primeiro acesso.' };
}

export async function resetUserPassword(
  _prev: AdminState, formData: FormData,
): Promise<AdminState> {
  const actor = await requireMaster();
  const id = String(formData.get('id') ?? '');
  const nova = String(formData.get('novaSenha') ?? '');
  if (nova.length < 10) return { error: 'A senha precisa ter ao menos 10 caracteres.' };

  await setPassword(id, await hashPassword(nova), true);
  await audit({
    actorId: actor.id, action: 'user_reset_password', entityType: 'user', entityId: id,
  });
  revalidatePath('/admin/usuarios');
  return { ok: 'Senha redefinida. O usuário trocará no próximo acesso.' };
}
