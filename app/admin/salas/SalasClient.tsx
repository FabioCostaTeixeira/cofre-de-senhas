'use client';

import { useActionState } from 'react';
import { deleteRoom, saveMembers, saveRoom, type SalaState } from './actions';
import type { RoomCard, User } from '@/lib/types';

const inicial: SalaState = {};

function SalaRow({
  sala, usuarios, membrosAtuais,
}: {
  sala: RoomCard;
  usuarios: User[];
  membrosAtuais: string[];
}) {
  const [salaState, salaAction, salaPending] = useActionState(saveRoom, inicial);
  const [memState, memAction] = useActionState(saveMembers, inicial);
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

      <form action={memAction} className="space-y-2">
        <input type="hidden" name="roomId" value={sala.id} />
        <p className="text-sm" style={{ color: 'var(--text-dim)' }}>Membros</p>
        <div className="flex flex-wrap gap-3">
          {usuarios.map((u) => (
            <label key={u.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="userIds" value={u.id}
                     defaultChecked={membrosAtuais.includes(u.id)} />
              {u.name}
            </label>
          ))}
        </div>
        <button className="btn">Salvar membros</button>
      </form>
      {memState.ok && <p className="text-sm" style={{ color: 'var(--ok)' }}>{memState.ok}</p>}

      <form action={delAction}>
        <input type="hidden" name="id" value={sala.id} />
        <button className="btn btn-danger">Mover sala para a lixeira</button>
      </form>
      {delState.ok && <p className="text-sm" style={{ color: 'var(--ok)' }}>{delState.ok}</p>}
    </div>
  );
}

export function SalasClient({
  salas, usuarios, membros,
}: {
  salas: RoomCard[];
  usuarios: User[];
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
        <button className="btn btn-primary" disabled={novaSalaPending}>Criar sala</button>
      </form>

      {salas.map((sala) => (
        <SalaRow key={sala.id} sala={sala} usuarios={usuarios} membrosAtuais={membros[sala.id] ?? []} />
      ))}
    </div>
  );
}
