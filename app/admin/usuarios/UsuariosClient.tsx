'use client';

import { useActionState, useState } from 'react';
import { SeletorSalas, type SalaOpcao } from '@/components/SeletorSalas';
import { resetUserPassword, saveUser, type AdminState } from './actions';
import type { Role, User } from '@/lib/types';

const inicial: AdminState = {};

const DICA_MASTER = 'O master enxerga todas as salas por definição; a seleção fica travada.';

function UsuarioRow({
  usuario, salas, salasDoUsuario,
}: {
  usuario: User;
  salas: SalaOpcao[];
  salasDoUsuario: string[];
}) {
  const [state, action, pending] = useActionState(saveUser, inicial);
  const [resetState, resetAction, resetPending] = useActionState(resetUserPassword, inicial);
  const [resetando, setResetando] = useState(false);
  const [papel, setPapel] = useState<Role>(usuario.role);
  const [selecionadas, setSelecionadas] = useState<string[]>(
    usuario.role === 'master' ? salas.map((s) => s.id) : salasDoUsuario,
  );

  // Trocar o papel redefine a seleção: master começa com tudo, usuário comum com nada.
  function trocarPapel(novo: Role) {
    setPapel(novo);
    setSelecionadas(novo === 'master' ? salas.map((s) => s.id) : salasDoUsuario);
  }

  return (
    <div className="p-4 space-y-3">
      <form action={action} className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="id" value={usuario.id} />
          <label className="space-y-1">
            <span className="text-xs" style={{ color: 'var(--text-dim)' }}>Nome</span>
            <input name="name" className="input" defaultValue={usuario.name} />
          </label>
          <label className="space-y-1">
            <span className="text-xs" style={{ color: 'var(--text-dim)' }}>Papel</span>
            <select name="role" className="input" value={papel}
                    onChange={(e) => trocarPapel(e.target.value as Role)}>
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
        </div>

        <SeletorSalas
          salas={salas}
          selecionadas={selecionadas}
          onChange={setSelecionadas}
          desabilitado={papel === 'master'}
          dica={papel === 'master' ? DICA_MASTER : undefined}
        />
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

export function UsuariosClient({
  usuarios, salas, membros,
}: {
  usuarios: User[];
  salas: SalaOpcao[];
  membros: Record<string, string[]>;
}) {
  const [novoState, novoAction, novoPending] = useActionState(saveUser, inicial);
  const [papel, setPapel] = useState<Role>('user');
  const [selecionadas, setSelecionadas] = useState<string[]>([]);

  function trocarPapel(novo: Role) {
    setPapel(novo);
    setSelecionadas(novo === 'master' ? salas.map((s) => s.id) : []);
  }

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
            <select name="role" className="input" value={papel}
                    onChange={(e) => trocarPapel(e.target.value as Role)}>
              <option value="user">Usuário</option>
              <option value="master">Master</option>
            </select>
          </label>
        </div>

        <SeletorSalas
          salas={salas}
          selecionadas={selecionadas}
          onChange={setSelecionadas}
          desabilitado={papel === 'master'}
          dica={papel === 'master' ? DICA_MASTER : undefined}
        />

        {novoState.error && (
          <p className="text-sm" style={{ color: 'var(--danger)' }}>{novoState.error}</p>
        )}
        {novoState.ok && <p className="text-sm" style={{ color: 'var(--ok)' }}>{novoState.ok}</p>}
        <button className="btn btn-primary" disabled={novoPending}>Criar usuário</button>
      </form>

      <div className="surface divide-y" style={{ borderColor: 'var(--border)' }}>
        {usuarios.map((u) => (
          <UsuarioRow
            key={u.id} usuario={u} salas={salas} salasDoUsuario={membros[u.id] ?? []}
          />
        ))}
      </div>
    </div>
  );
}
