import Link from 'next/link';
import { logout } from '@/app/login/actions';
import { listModulesOfUser } from '@/lib/db/queries';
import { MODULES } from '@/lib/modules';
import type { Actor } from '@/lib/types';

export async function Nav({ actor }: { actor: Actor }) {
  const modulosLiberados =
    actor.role === 'master' ? MODULES.map((m) => m.key) : await listModulesOfUser(actor.id);
  const modulosVisiveis = MODULES.filter((m) => modulosLiberados.includes(m.key));

  return (
    <header className="glass mx-4 mt-4 px-5 py-3 flex items-center gap-4">
      <Link href="/" className="font-semibold">🔐 Cofre</Link>
      <nav className="flex items-center gap-3 text-sm" style={{ color: 'var(--text-dim)' }}>
        <Link href="/">Salas</Link>
        {modulosVisiveis.map((m) => (
          <Link key={m.key} href={m.href}>{m.label}</Link>
        ))}
        {actor.role === 'master' && (
          <>
            <Link href="/admin/usuarios">Usuários</Link>
            <Link href="/admin/salas">Salas (admin)</Link>
            <Link href="/admin/auditoria">Auditoria</Link>
            <Link href="/admin/lixeira">Lixeira</Link>
          </>
        )}
      </nav>
      <div className="ml-auto flex items-center gap-3 text-sm">
        <span style={{ color: 'var(--text-dim)' }}>{actor.name}</span>
        <Link href="/trocar-senha" style={{ color: 'var(--text-dim)' }}>Trocar senha</Link>
        <form action={logout}>
          <button className="btn" type="submit">Sair</button>
        </form>
      </div>
    </header>
  );
}
