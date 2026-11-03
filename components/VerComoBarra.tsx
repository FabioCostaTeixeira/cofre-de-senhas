import { definirVerComo } from '@/app/(app)/working/ver-como-actions';
import { VER_COMO_ATIVO } from '@/lib/auth/ver-como';
import type { Actor, User } from '@/lib/types';

const ROTULO_PAPEL = { master: 'Master', gestor: 'Gestor', user: 'Usuário' } as const;

/** Barra do "Visualizar como" no topo dos quadros do Working. Só renderiza em dev. */
export function VerComoBarra({ logado, visto, users }: { logado: Actor; visto: Actor; users: User[] }) {
  if (!VER_COMO_ATIVO) return null;
  const simulando = visto.id !== logado.id;

  return (
    <form
      action={definirVerComo}
      className="flex items-center gap-2 flex-wrap rounded-lg p-2 text-sm"
      style={{ border: `1px dashed ${simulando ? 'var(--warn)' : 'var(--border)'}` }}
    >
      <span style={{ color: 'var(--text-dim)' }}>[dev] Visualizar como</span>
      <select name="userId" className="input w-auto" defaultValue={simulando ? visto.id : ''}>
        <option value="">Eu mesmo ({logado.name})</option>
        {users.filter((u) => u.is_active && u.id !== logado.id).map((u) => (
          <option key={u.id} value={u.id}>{u.name} · {ROTULO_PAPEL[u.role]}</option>
        ))}
      </select>
      <button className="btn">Aplicar</button>
      {simulando && (
        <span style={{ color: 'var(--warn)' }}>
          Vendo como {visto.name} ({ROTULO_PAPEL[visto.role]}). O que você fizer aqui é salvo como você.
        </span>
      )}
    </form>
  );
}
