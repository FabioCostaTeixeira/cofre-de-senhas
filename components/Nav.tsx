import Link from 'next/link';
import { logout } from '@/app/login/actions';
import type { Actor } from '@/lib/types';

export function Nav({ actor }: { actor: Actor }) {
  return (
    <header className="glass mx-4 mt-4 px-5 py-3 flex items-center gap-4">
      <Link href="/" className="font-semibold">🔐 Cofre</Link>
      <nav className="flex items-center gap-3 text-sm" style={{ color: 'var(--text-dim)' }}>
        <Link href="/">Salas</Link>
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
