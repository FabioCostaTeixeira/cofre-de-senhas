'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { deleteRoom, saveRoom, type SalaState } from './actions';
import type { RoomCard } from '@/lib/types';

const inicial: SalaState = {};

function SalaRow({ sala, membros }: { sala: RoomCard; membros: string[] }) {
  const [salaState, salaAction, salaPending] = useActionState(saveRoom, inicial);
  const [delState, delAction] = useActionState(deleteRoom, inicial);

  return (
    <div className="surface p-5 space-y-4">
      <form action={salaAction} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="id" value={sala.id} />
        <label className="space-y-1">
          <span className="text-xs" style={{ color: 'var(--text-dim)' }}>Nome</span>
          <input name="name" className="input" defaultValue={sala.name} />
        </label>
        <label className="space-y-1 flex-1">
          <span className="text-xs" style={{ color: 'var(--text-dim)' }}>Descrição</span>
          <input name="description" className="input" defaultValue={sala.description ?? ''} />
        </label>
        <button className="btn" disabled={salaPending}>Salvar</button>
      </form>
      {salaState.error && (
        <p className="text-sm" style={{ color: 'var(--danger)' }}>{salaState.error}</p>
      )}

      {/* Somente leitura: o acesso é concedido na tela do usuário, de uma vez. */}
      <div className="space-y-1">
        <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
          Com acesso ({membros.length})
        </p>
        <p className="text-sm">
          {membros.length ? membros.join(', ') : 'Ninguém além do master.'}
        </p>
        <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
          Para liberar ou remover acesso, use{' '}
          <Link href="/usuarios" className="underline">Usuários</Link>.
        </p>
      </div>

      <form action={delAction}>
        <input type="hidden" name="id" value={sala.id} />
        <button className="btn btn-danger">Mover sala para a lixeira</button>
      </form>
      {delState.ok && <p className="text-sm" style={{ color: 'var(--ok)' }}>{delState.ok}</p>}
    </div>
  );
}

export function SalasClient({
  salas, membros,
}: {
  salas: RoomCard[];
  membros: Record<string, string[]>;
}) {
  const [novaSalaState, novaSalaAction, novaSalaPending] = useActionState(saveRoom, inicial);

  return (
    <div className="space-y-6">
      <form action={novaSalaAction} className="glass p-5 space-y-4">
        <h2 className="font-semibold">Nova sala</h2>
        <label className="block space-y-1">
          <span className="text-sm">Nome</span>
          <input name="name" className="input" required />
        </label>
        <label className="block space-y-1">
          <span className="text-sm">Descrição</span>
          <input name="description" className="input" />
        </label>
        {novaSalaState.error && (
          <p className="text-sm" style={{ color: 'var(--danger)' }}>{novaSalaState.error}</p>
        )}
        {novaSalaState.ok && (
          <p className="text-sm" style={{ color: 'var(--ok)' }}>{novaSalaState.ok}</p>
        )}
        <button className="btn btn-primary" disabled={novaSalaPending}>Criar sala</button>
      </form>

      {salas.map((sala) => (
        <SalaRow key={sala.id} sala={sala} membros={membros[sala.id] ?? []} />
      ))}
    </div>
  );
}
