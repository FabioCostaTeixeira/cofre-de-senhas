'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireReadyUser } from '@/lib/auth/guards';
import { NotFoundError } from '@/lib/authz';
import { audit } from '@/lib/db/audit';
import {
  insertCredential, revealPassword, softDeleteCredential, updateCredential,
  type CredentialInput,
} from '@/lib/db/queries';

export type RevealResult = { password?: string; error?: string };

async function ler(id: string, acao: 'view' | 'copy'): Promise<RevealResult> {
  try {
    const actor = await requireReadyUser();
    const password = await revealPassword(actor, id);
    await audit({ actorId: actor.id, action: acao, entityType: 'credential', entityId: id });
    return { password };
  } catch (err) {
    if (err instanceof NotFoundError) return { error: 'Credencial não encontrada.' };
    throw err;
  }
}

export async function revealCredential(id: string): Promise<RevealResult> {
  return ler(id, 'view');
}

export async function copyCredential(id: string): Promise<RevealResult> {
  return ler(id, 'copy');
}

export async function deleteCredential(id: string): Promise<{ error?: string }> {
  try {
    const actor = await requireReadyUser();
    await softDeleteCredential(actor, id);
    await audit({ actorId: actor.id, action: 'delete', entityType: 'credential', entityId: id });
    revalidatePath('/', 'layout');
    return {};
  } catch (err) {
    if (err instanceof NotFoundError) return { error: 'Credencial não encontrada.' };
    throw err;
  }
}

export type SaveState = { error?: string };

export async function saveCredential(
  _prev: SaveState, formData: FormData,
): Promise<SaveState> {
  const actor = await requireReadyUser();

  const id = String(formData.get('id') ?? '');
  const voltarPara = String(formData.get('voltarPara') ?? '/');
  const input: CredentialInput = {
    roomId: String(formData.get('roomId') ?? ''),
    title: String(formData.get('title') ?? '').trim(),
    username: String(formData.get('username') ?? '').trim(),
    password: String(formData.get('password') ?? ''),
    url: String(formData.get('url') ?? '').trim(),
    notes: String(formData.get('notes') ?? '').trim(),
    // Ausência do checkbox no FormData significa desmarcado → senha pessoal.
    isGlobal: formData.get('isGlobal') === 'on',
  };

  if (!input.title) return { error: 'Informe um título.' };
  if (!input.roomId) return { error: 'Escolha uma sala.' };
  if (!id && !input.password) return { error: 'Informe a senha.' };
  if (input.url && !/^https?:\/\//i.test(input.url)) {
    return { error: 'O endereço deve começar com http:// ou https://' };
  }

  try {
    if (id) {
      await updateCredential(actor, id, input);
      await audit({
        actorId: actor.id, action: 'update', entityType: 'credential', entityId: id,
        metadata: { title: input.title, is_global: input.isGlobal },
      });
    } else {
      const novoId = await insertCredential(actor, input);
      await audit({
        actorId: actor.id, action: 'create', entityType: 'credential', entityId: novoId,
        metadata: { title: input.title, is_global: input.isGlobal },
      });
    }
  } catch (err) {
    if (err instanceof NotFoundError) return { error: 'Credencial não encontrada.' };
    throw err;
  }

  revalidatePath('/', 'layout');
  redirect(voltarPara);
}
