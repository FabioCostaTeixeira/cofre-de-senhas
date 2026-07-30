'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { saveCredential, type SaveState } from '@/app/credenciais/actions';
import type { CredentialRow } from '@/lib/types';

const inicial: SaveState = {};

export type MembroSala = { id: string; name: string };

export function CredentialForm({
  salas, salaPadrao, credencial, notasAtuais = '', globalPorPadrao = true,
  membrosPorSala, compartilhadaCom = [], actorId, voltarPara,
}: {
  salas: { id: string; name: string }[];
  salaPadrao: string;
  credencial: CredentialRow | null;
  notasAtuais?: string;
  /** Falso quando o cadastro parte de "Minhas senhas": ali a senha nasce pessoal. */
  globalPorPadrao?: boolean;
  /** Membros de cada sala do usuário, para escolher quem enxerga uma senha não-global. */
  membrosPorSala: Record<string, MembroSala[]>;
  /** Ids com quem a credencial já está compartilhada (ao editar). */
  compartilhadaCom?: string[];
  actorId: string;
  voltarPara: string;
}) {
  const [state, action, pending] = useActionState(saveCredential, inicial);
  const editando = Boolean(credencial);

  const [global, setGlobal] = useState(
    credencial ? credencial.is_global : globalPorPadrao,
  );
  const [salaId, setSalaId] = useState(credencial?.room_id ?? salaPadrao);
  const [selecionados, setSelecionados] = useState<string[]>(compartilhadaCom);

  // O dono nunca aparece na lista: ele enxerga a senha por ser dono.
  const donoId = credencial?.owner_id ?? actorId;
  const membros = (membrosPorSala[salaId] ?? []).filter((m) => m.id !== donoId);
  const todosMarcados = membros.length > 0 && membros.every((m) => selecionados.includes(m.id));

  function alternar(id: string, marcado: boolean) {
    setSelecionados(marcado ? [...selecionados, id] : selecionados.filter((s) => s !== id));
  }

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
        <select name="roomId" className="input" value={salaId}
                onChange={(e) => setSalaId(e.target.value)}>
          {salas.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </label>

      <label className="flex items-start gap-3">
        <input type="checkbox" name="isGlobal" className="mt-1"
               checked={global} onChange={(e) => setGlobal(e.target.checked)} />
        <span className="text-sm">
          Senha global
          <span className="block text-xs" style={{ color: 'var(--text-dim)' }}>
            Visível a todos os membros desta sala. Desmarque para escolher quem vê.
          </span>
        </span>
      </label>

      {/* Só faz sentido escolher pessoas quando a senha não é de toda a sala.
          Enquanto marcada como global, nem exibimos nomes nem enviamos a lista. */}
      {!global && (
        <div className="space-y-2 rounded-lg p-3"
             style={{ border: '1px solid var(--border)' }}>
          {selecionados
            .filter((id) => membros.some((m) => m.id === id))
            .map((id) => (
              <input key={id} type="hidden" name="compartilhar" value={id} />
            ))}

          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm">Quem mais vê esta senha</span>
            {membros.length > 0 && (
              <button
                type="button"
                className="btn text-xs"
                onClick={() =>
                  setSelecionados(todosMarcados ? [] : membros.map((m) => m.id))}
              >
                {todosMarcados ? 'Desmarcar todos' : 'Marcar todos'}
              </button>
            )}
          </div>

          {membros.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
              Você é a única pessoa com acesso a esta sala. A senha ficará só com você.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-x-4 gap-y-2 max-h-40 overflow-y-auto">
                {membros.map((m) => (
                  <label key={m.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selecionados.includes(m.id)}
                      onChange={(e) => alternar(m.id, e.target.checked)}
                    />
                    {m.name}
                  </label>
                ))}
              </div>
              <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
                Quem você marcar pode ver e copiar. Editar e apagar seguem só com você.
                Sem ninguém marcado, a senha fica só com você.
              </p>
            </>
          )}
        </div>
      )}

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
