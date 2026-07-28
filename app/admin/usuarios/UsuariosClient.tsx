'use client';

import { useActionState, useState } from 'react';
import { resetUserPassword, saveUser, type AdminState } from './actions';
import type { User } from '@/lib/types';

const inicial: AdminState = {};

export function UsuariosClient({ usuarios }: { usuarios: User[] }) {
  const [novoState, novoAction, novoPending] = useActionState(saveUser, inicial);
  const [resetState, resetAction, resetPending] = useActionState(resetUserPassword, inicial);
  const [resetandoId, setResetandoId] = useState<string | null>(null);

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
            <input name="senhaInicial" className="input" minLength={10} required />
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
          <div key={u.id} className="p-4 space-y-3">
            <form action={novoAction} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="id" value={u.id} />
              <label className="space-y-1">
                <span className="text-xs" style={{ color: 'var(--text-dim)' }}>Nome</span>
                <input name="name" className="input" defaultValue={u.name} />
              </label>
              <label className="space-y-1">
                <span className="text-xs" style={{ color: 'var(--text-dim)' }}>Papel</span>
                <select name="role" className="input" defaultValue={u.role}>
                  <option value="user">Usuário</option>
                  <option value="master">Master</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="isActive" defaultChecked={u.is_active} />
                Ativo
              </label>
              <span className="text-xs" style={{ color: 'var(--text-dim)' }}>{u.email}</span>
              <button className="btn ml-auto">Salvar</button>
              <button type="button" className="btn"
                      onClick={() => setResetandoId(resetandoId === u.id ? null : u.id)}>
                Resetar senha
              </button>
            </form>

            {resetandoId === u.id && (
              <form action={resetAction} className="flex items-end gap-3">
                <input type="hidden" name="id" value={u.id} />
                <label className="space-y-1 flex-1">
                  <span className="text-xs" style={{ color: 'var(--text-dim)' }}>Nova senha</span>
                  <input name="novaSenha" className="input" minLength={10} required />
                </label>
                <button className="btn btn-primary" disabled={resetPending}>Redefinir</button>
              </form>
            )}
          </div>
        ))}
      </div>
      {resetState.error && (
        <p className="text-sm" style={{ color: 'var(--danger)' }}>{resetState.error}</p>
      )}
      {resetState.ok && <p className="text-sm" style={{ color: 'var(--ok)' }}>{resetState.ok}</p>}
    </div>
  );
}
