'use server';

import { revalidatePath } from 'next/cache';
import { requireMaster } from '@/lib/auth/guards';
import { hashPassword } from '@/lib/auth/password';
import { isUuid } from '@/lib/validation';
import { audit } from '@/lib/db/audit';
import { listModulesOfUser, listRoomsOfUser, setUserModules, setUserRooms } from '@/lib/db/queries';
import { createUser, setPassword, updateUser } from '@/lib/db/users';
import type { Role } from '@/lib/types';

export type AdminState = { error?: string; ok?: string };

/**
 * Aplica as salas escolhidas no formulário e registra no audit só o que mudou
 * de fato — quem entrou e quem saiu, não a lista inteira toda vez.
 */
async function aplicarSalas(
  actorId: string, userId: string, salas: string[],
): Promise<void> {
  const antes = await listRoomsOfUser(userId);
  await setUserRooms(userId, salas);

  const entraram = salas.filter((s) => !antes.includes(s));
  const sairam = antes.filter((s) => !salas.includes(s));

  if (entraram.length) {
    await audit({ actorId, action: 'member_add', entityType: 'user', entityId: userId,
                  metadata: { salas: entraram } });
  }
  if (sairam.length) {
    await audit({ actorId, action: 'member_remove', entityType: 'user', entityId: userId,
                  metadata: { salas: sairam } });
  }
}

/**
 * Aplica os módulos escolhidos no formulário e registra no audit só o que mudou
 * de fato — quem entrou e quem saiu, não a lista inteira toda vez.
 */
async function aplicarModulos(
  actorId: string, userId: string, modulos: string[],
): Promise<void> {
  const antes = await listModulesOfUser(userId);
  await setUserModules(userId, actorId, modulos);

  const concedidos = modulos.filter((m) => !antes.includes(m));
  const revogados = antes.filter((m) => !modulos.includes(m));

  if (concedidos.length) {
    await audit({ actorId, action: 'module_grant', entityType: 'user', entityId: userId,
                  metadata: { modulos: concedidos } });
  }
  if (revogados.length) {
    await audit({ actorId, action: 'module_revoke', entityType: 'user', entityId: userId,
                  metadata: { modulos: revogados } });
  }
}

export async function saveUser(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const actor = await requireMaster();
  const id = String(formData.get('id') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim();
  const role = String(formData.get('role') ?? 'user') as Role;
  const isActive = formData.get('isActive') === 'on';
  const senhaInicial = String(formData.get('senhaInicial') ?? '');
  const salas = formData.getAll('salas').map(String);
  const modulos = formData.getAll('modulos').map(String);

  if (!name) return { error: 'Informe o nome.' };
  if (role !== 'master' && role !== 'user') return { error: 'Papel inválido.' };
  if (id && !isUuid(id)) return { error: 'Usuário não encontrado.' };
  if (salas.some((s) => !isUuid(s))) return { error: 'Sala inválida na seleção.' };

  if (id) {
    // O próprio master não pode mudar seu papel nem se desativar: `requireMaster()`
    // relê o usuário do banco a cada request, então isso travaria o /admin sem
    // caminho de recuperação. A troca de nome continua permitida.
    let finalRole = role;
    let finalIsActive = isActive;
    let aviso = '';
    if (id === actor.id) {
      finalRole = actor.role;
      finalIsActive = true;
      if (role !== actor.role || !isActive) {
        aviso = ' O master não pode alterar o próprio papel nem se desativar; essa parte da alteração foi ignorada.';
      }
    }

    await updateUser(id, name, finalRole, finalIsActive);
    await audit({ actorId: actor.id, action: 'user_update', entityType: 'user', entityId: id,
                  metadata: { name, role: finalRole, isActive: finalIsActive } });
    await aplicarSalas(actor.id, id, salas);
    await aplicarModulos(actor.id, id, modulos);

    revalidatePath('/admin/usuarios');
    revalidatePath('/admin/salas');
    revalidatePath('/');
    return { ok: `Usuário atualizado.${aviso}` };
  }

  if (!email) return { error: 'Informe o e-mail.' };
  if (senhaInicial.length < 10) {
    return { error: 'A senha inicial precisa ter ao menos 10 caracteres.' };
  }

  let novoId: string;
  try {
    novoId = await createUser(email, name, await hashPassword(senhaInicial), role);
  } catch (err) {
    // Só a violação de unicidade do Postgres (e-mail duplicado) vira essa mensagem;
    // qualquer outro erro (ex.: banco fora do ar) é relançado, senão uma falha real
    // de conexão apareceria disfarçada de "e-mail duplicado" e mandaria o master
    // caçar um duplicado que não existe.
    if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
      return { error: 'Já existe um usuário com esse e-mail.' };
    }
    throw err;
  }
  await audit({ actorId: actor.id, action: 'user_create', entityType: 'user', entityId: novoId,
                metadata: { email, role } });
  await aplicarSalas(actor.id, novoId, salas);
  await aplicarModulos(actor.id, novoId, modulos);

  revalidatePath('/admin/usuarios');
  revalidatePath('/admin/salas');
  revalidatePath('/');
  return { ok: 'Usuário criado. Ele trocará a senha no primeiro acesso.' };
}

export async function resetUserPassword(
  _prev: AdminState, formData: FormData,
): Promise<AdminState> {
  const actor = await requireMaster();
  const id = String(formData.get('id') ?? '');
  const nova = String(formData.get('novaSenha') ?? '');
  if (!isUuid(id)) return { error: 'Usuário não encontrado.' };
  if (nova.length < 10) return { error: 'A senha precisa ter ao menos 10 caracteres.' };

  await setPassword(id, await hashPassword(nova), true);
  await audit({
    actorId: actor.id, action: 'user_reset_password', entityType: 'user', entityId: id,
  });
  revalidatePath('/admin/usuarios');
  return { ok: 'Senha redefinida. O usuário trocará no próximo acesso.' };
}
