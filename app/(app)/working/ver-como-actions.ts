'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';
import { requireModulo } from '@/lib/auth/guards';
import { COOKIE_VER_COMO, VER_COMO_ATIVO } from '@/lib/auth/ver-como';
import { isUuid } from '@/lib/validation';

/** Seletor "Visualizar como" (só em dev, ver lib/auth/ver-como.ts). Vazio = voltar a si. */
export async function definirVerComo(formData: FormData): Promise<void> {
  if (!VER_COMO_ATIVO) notFound();
  await requireModulo('working');
  const id = String(formData.get('userId') ?? '');
  const jar = await cookies();
  if (isUuid(id)) jar.set(COOKIE_VER_COMO, id, { httpOnly: true, sameSite: 'lax', path: '/' });
  else jar.delete(COOKIE_VER_COMO);
  revalidatePath('/working', 'layout');
}
