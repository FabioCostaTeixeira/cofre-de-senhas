'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { saveCredential, type SaveState } from '@/app/credenciais/actions';
import type { CredentialRow } from '@/lib/types';

const inicial: SaveState = {};

export function CredentialForm({
  salas, salaPadrao, credencial, notasAtuais = '', globalPorPadrao = true, voltarPara,
}: {
  salas: { id: string; name: string }[];
  salaPadrao: string;
  credencial: CredentialRow | null;
  notasAtuais?: string;
  /** Falso quando o cadastro parte de "Minhas senhas": ali a senha nasce pessoal. */
  globalPorPadrao?: boolean;
  voltarPara: string;
}) {
  const [state, action, pending] = useActionState(saveCredential, inicial);
  const editando = Boolean(credencial);

  return (
    <form action={action} className="glass p-5 space-y-4">
      <h2 className="font-semibold">{editando ? 'Editar senha' : 'Nova senha'}</h2>

      <input type="hidden" name="id" value={credencial?.id ?? ''} />
      <input type="hidden" name="voltarPara" value={voltarPara} />

      <label className="block space-y-1">
        <span className="text-sm">Título</span>
        <input name="title" className="input" defaultValue={credencial?.title ?? ''} required />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-sm">Usuário</span>
          <input name="username" className="input" autoComplete="off"
                 defaultValue={credencial?.username ?? ''} />
        </label>

        <label className="block space-y-1">
          <span className="text-sm">Senha</span>
          <input name="password" type="password" className="input" autoComplete="new-password"
                 placeholder={editando ? 'Deixe em branco para manter' : ''} />
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-sm">Endereço (URL)</span>
        <input name="url" className="input" placeholder="https://"
               defaultValue={credencial?.url ?? ''} />
      </label>

      <label className="block space-y-1">
        <span className="text-sm">Notas</span>
        <textarea name="notes" className="input" rows={3} defaultValue={notasAtuais} />
      </label>

      <label className="block space-y-1">
        <span className="text-sm">Sala</span>
        <select name="roomId" className="input" defaultValue={credencial?.room_id ?? salaPadrao}>
          {salas.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </label>

      <label className="flex items-start gap-3">
        <input type="checkbox" name="isGlobal" className="mt-1"
               defaultChecked={credencial ? credencial.is_global : globalPorPadrao} />
        <span className="text-sm">
          Senha global
          <span className="block text-xs" style={{ color: 'var(--text-dim)' }}>
            Visível a todos os membros desta sala. Desmarque para que só você veja.
          </span>
        </span>
      </label>

      {state.error && (
        <p className="text-sm" style={{ color: 'var(--danger)' }} role="alert">{state.error}</p>
      )}

      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? 'Salvando...' : 'Salvar'}
        </button>
        <Link href={voltarPara} className="btn">Cancelar</Link>
      </div>
    </form>
  );
}
