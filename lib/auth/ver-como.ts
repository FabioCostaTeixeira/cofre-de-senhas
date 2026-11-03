import { cookies } from 'next/headers';
import { findUserById } from '@/lib/db/users';
import { isUuid } from '@/lib/validation';
import type { Actor } from '@/lib/types';

/**
 * "Visualizar como": ferramenta de desenvolvimento para conferir o que cada usuário
 * enxerga nos quadros do Working sem precisar da senha dele. Só existe em
 * `npm run dev` — em produção o cookie é ignorado e o seletor nem aparece.
 *
 * Só troca o ator usado para MONTAR a página (filtro de cards, lápis, arraste). As
 * actions continuam rodando como o usuário logado, então o que for feito durante a
 * simulação é real e a auditoria registra quem fez de verdade.
 */
export const VER_COMO_ATIVO = process.env.NODE_ENV === 'development';
export const COOKIE_VER_COMO = 'ver_como';

export async function idVerComo(): Promise<string | null> {
  if (!VER_COMO_ATIVO) return null;
  const id = (await cookies()).get(COOKIE_VER_COMO)?.value;
  return id && isUuid(id) ? id : null;
}

/** O ator simulado, se houver um válido e ativo; senão o próprio `actor`. */
export async function atorVisualizado(actor: Actor): Promise<Actor> {
  const id = await idVerComo();
  if (!id || id === actor.id) return actor;
  const user = await findUserById(id);
  if (!user || !user.is_active) return actor;
  return {
    id: user.id, email: user.email, name: user.name, role: user.role,
    mustChangePassword: user.must_change_password,
  };
}
