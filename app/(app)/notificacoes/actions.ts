'use server';

import { revalidatePath } from 'next/cache';
import { requireReadyUser } from '@/lib/auth/guards';
import { marcarLidas } from '@/lib/db/notificacoes';
import { isUuid } from '@/lib/validation';

/** Sem `id`, marca todas. Cada usuário só mexe nas próprias (a query amarra ao dono). */
export async function marcarLidasAction(id?: string): Promise<void> {
  const actor = await requireReadyUser();
  if (id !== undefined && !isUuid(id)) return;
  await marcarLidas(actor.id, id);
  // 'layout' na raiz: o contador do sino vive no menu de todas as páginas.
  revalidatePath('/', 'layout');
}
