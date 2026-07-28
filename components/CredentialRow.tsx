'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { copyCredential, deleteCredential, revealCredential } from '@/app/credenciais/actions';
import type { CredentialRow } from '@/lib/types';

const SEGUNDOS_VISIVEL = 30;

export function CredentialRowItem({
  cred, actorId, isMaster, showRoom = false,
}: {
  cred: CredentialRow;
  actorId: string;
  isMaster: boolean;
  showRoom?: boolean;
}) {
  const [senha, setSenha] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; tipo: 'ok' | 'erro' } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A senha em claro nunca fica na tela: some sozinha após 30s.
  useEffect(() => {
    if (!senha) return;
    const t = setTimeout(() => setSenha(null), SEGUNDOS_VISIVEL * 1000);
    return () => clearTimeout(t);
  }, [senha]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function aoRevelar() {
    if (senha) { setSenha(null); return; }
    const r = await revealCredential(cred.id);
    if (r.error) setAviso({ texto: r.error, tipo: 'erro' });
    else setSenha(r.password ?? '');
  }

  async function copiar(texto: string, rotulo: string) {
    await navigator.clipboard.writeText(texto);
    setAviso({
      texto: `${rotulo} copiado — a área de transferência será limpa em ${SEGUNDOS_VISIVEL}s.`,
      tipo: 'ok',
    });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try { await navigator.clipboard.writeText(''); } catch { /* aba sem foco */ }
      setAviso(null);
    }, SEGUNDOS_VISIVEL * 1000);
  }

  async function copiarSenha() {
    const r = await copyCredential(cred.id);
    if (r.error) { setAviso({ texto: r.error, tipo: 'erro' }); return; }
    await copiar(r.password ?? '', 'Senha');
  }

  async function apagar() {
    if (!confirm(`Mover “${cred.title}” para a lixeira?`)) return;
    const r = await deleteCredential(cred.id);
    if (r.error) setAviso({ texto: r.error, tipo: 'erro' });
  }

  const podeEditar = cred.owner_id === actorId || (isMaster && cred.is_global);
  const podeApagar = cred.owner_id === actorId || isMaster;

  return (
    <div className="p-4 flex flex-wrap items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium truncate">{cred.title}</span>
          <span className="badge">{cred.is_global ? 'global' : 'pessoal'}</span>
          {showRoom && <span className="badge">{cred.room_name}</span>}
        </div>
        <div className="text-sm mt-1 flex items-center gap-3 flex-wrap"
             style={{ color: 'var(--text-dim)' }}>
          <span className="truncate">{cred.username || '—'}</span>
          <code className="font-mono">{senha ?? '••••••••'}</code>
        </div>
        {aviso && (
          <p className="text-xs mt-1"
             style={{ color: aviso.tipo === 'erro' ? 'var(--danger)' : 'var(--ok)' }}>
            {aviso.texto}
          </p>
        )}
      </div>

      <div className="flex items-center gap-1">
        <button className="btn" onClick={aoRevelar}
                title={senha ? 'Ocultar senha' : 'Revelar senha'}
                aria-label={senha ? 'Ocultar senha' : 'Revelar senha'}>
          {senha ? '🙈' : '👁'}
        </button>
        {cred.username && (
          <button className="btn" onClick={() => copiar(cred.username!, 'Usuário')}
                  title="Copiar usuário" aria-label="Copiar usuário">👤</button>
        )}
        <button className="btn" onClick={copiarSenha}
                title="Copiar senha" aria-label="Copiar senha">📋</button>
        {cred.url && (
          <a className="btn" href={cred.url} target="_blank" rel="noopener noreferrer"
             title="Abrir site" aria-label="Abrir site">🔗</a>
        )}
        {podeEditar && (
          <Link className="btn" href={`/sala/${cred.room_id}?editar=${cred.id}`}
                title="Editar" aria-label="Editar">✏️</Link>
        )}
        {podeApagar && (
          <button className="btn btn-danger" onClick={apagar}
                  title="Mover para a lixeira" aria-label="Mover para a lixeira">🗑</button>
        )}
      </div>
    </div>
  );
}
