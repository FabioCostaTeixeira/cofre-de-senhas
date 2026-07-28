'use client';

import { useActionState } from 'react';
import { login, type LoginState } from './actions';

const inicial: LoginState = {};

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, inicial);

  return (
    <main className="min-h-dvh grid place-items-center p-6">
      <form action={action} className="glass w-full max-w-sm p-8 space-y-5">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Cofre de Senhas</h1>
          <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
            Entre com suas credenciais
          </p>
        </div>

        <label className="block space-y-1">
          <span className="text-sm">E-mail</span>
          <input name="email" type="email" autoComplete="username" className="input" required />
        </label>

        <label className="block space-y-1">
          <span className="text-sm">Senha</span>
          <input
            name="senha" type="password" autoComplete="current-password"
            className="input" required
          />
        </label>

        {state.error && (
          <p className="text-sm" style={{ color: 'var(--danger)' }} role="alert">
            {state.error}
          </p>
        )}

        <button type="submit" className="btn btn-primary w-full" disabled={pending}>
          {pending ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </main>
  );
}
