'use client';

import { useActionState, useState } from 'react';
import { resetUserPassword, saveUser, type AdminState } from './actions';
import type { User } from '@/lib/types';

const inicial: AdminState = {};

function UsuarioRow({ usuario }: { usuario: User }) {
  const [state, action, pending] = useActionState(saveUser, inicial);
  const [resetState, resetAction, resetPending] = useActionState(resetUserPassword, inicial);
  const [resetando, setResetando] = useState(false);

  return (
    <div className="p-4 space-y-3">
      <form action={action} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="id" value={usuario.id} />
        <label className="space-y-1">
          <span className="text-xs" style={{ color: 'var(--text-dim)' }}>Nome</span>
          <input name="name" className="input" defaultValue={usuario.name} />
        </label>
        <label className="space-y-1">
          <span className="text-xs" style={{ color: 'var(--text-dim)' }}>Papel</span>
          <select name="role" className="input" defaultValue={usuario.role}>
            <option value="user">Usuário</option>
            <option value="master">Master</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isActive" defaultChecked={usuario.is_active} />
          Ativo
        </label>
        <span className="text-xs" style={{ color: 'var(--text-dim)' }}>{usuario.email}</span>
        <button className="btn ml-auto" disabled={pending}>Salvar</button>
        <button type="button" className="btn" onClick={() => setResetando(!resetando)}>
          Resetar senha
        </button>
      </form>

      {state.error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{state.error}</p>}
      {state.ok && <p className="text-sm" style={{ color: 'var(--ok)' }}>{state.ok}</p>}

      {resetando && (
        <form action={resetAction} className="flex items-end gap-3">
          <input type="hidden" name="id" value={usuario.id} />
          <label className="space-y-1 flex-1">
            <span className="text-xs" style={{ color: 'var(--text-dim)' }}>Nova senha</span>
            <input name="novaSenha" type="password" autoComplete="new-password"
                   className="input" minLength={10} required />
          </label>
          <button className="btn btn-primary" disabled={resetPending}>Redefinir</button>
        </form>
      )}
      {resetState.error && (
        <p className="text-sm" style={{ color: 'var(--danger)' }}>{resetState.error}</p>
      )}
      {resetState.ok && <p className="text-sm" style={{ color: 'var(--ok)' }}>{resetState.ok}</p>}
    </div>
  );
}

export function UsuariosClient({ usuarios }: { usuarios: User[] }) {
  const [novoState, novoAction, novoPending] = useActionState(saveUser, inicial);

  return (
    <div className="space-y-6">
      <form action={novoAction} className="glass p-5 space-y-4">
        <h2 className="font-semibold">Novo usuário</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-sm">Nome</span>
            <input name="name" className="input" required />
          </label>
          <label className="block space-y-1">
            <span className="text-sm">E-mail</span>
            <input name="email" type="email" className="input" required />
          </label>
          <label className="block space-y-1">
            <span className="text-sm">Senha inicial</span>
            <input name="senhaInicial" type="password" autoComplete="new-password"
                   className="input" minLength={10} required />
          </label>
          <label className="block space-y-1">
            <span className="text-sm">Papel</span>
            <select name="role" className="input" defaultValue="user">
              <option value="user">Usuário</option>
              <option value="master">Master</option>
            </select>
          </label>
        </div>
        {novoState.error && (
          <p className="text-sm" style={{ color: 'var(--danger)' }}>{novoState.error}</p>
        )}
        {novoState.ok && <p className="text-sm" style={{ color: 'var(--ok)' }}>{novoState.ok}</p>}
        <button className="btn btn-primary" disabled={novoPending}>Criar usuário</button>
      </form>

      <div className="surface divide-y" style={{ borderColor: 'var(--border)' }}>
        {usuarios.map((u) => (
          <UsuarioRow key={u.id} usuario={u} />
        ))}
      </div>
    </div>
  );
}
