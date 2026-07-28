'use client';

import { useActionState } from 'react';
import { changePassword, type ChangeState } from './actions';

const inicial: ChangeState = {};

export default function TrocarSenhaPage() {
  const [state, action, pending] = useActionState(changePassword, inicial);

  return (
    <main className="min-h-dvh grid place-items-center p-6">
      <form action={action} className="glass w-full max-w-sm p-8 space-y-5">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Defina sua senha</h1>
          <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
            Escolha uma senha nova para continuar.
          </p>
        </div>

        <label className="block space-y-1">
          <span className="text-sm">Senha atual</span>
          <input name="atual" type="password" className="input" required />
        </label>
        <label className="block space-y-1">
          <span className="text-sm">Nova senha</span>
          <input name="nova" type="password" className="input" required minLength={10} />
        </label>
        <label className="block space-y-1">
          <span className="text-sm">Confirme a nova senha</span>
          <input name="confirma" type="password" className="input" required minLength={10} />
        </label>

        {state.error && (
          <p className="text-sm" style={{ color: 'var(--danger)' }} role="alert">
            {state.error}
          </p>
        )}

        <button type="submit" className="btn btn-primary w-full" disabled={pending}>
          {pending ? 'Salvando...' : 'Salvar senha'}
        </button>
      </form>
    </main>
  );
}
