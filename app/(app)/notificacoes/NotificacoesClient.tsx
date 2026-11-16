'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import type { Notificacao } from '@/lib/db/notificacoes';
import { marcarLidasAction } from './actions';

/** `created_at` vem como texto do Postgres (`2026-11-16 14:03:00.123+00`). */
function quando(valor: string): string {
  const d = new Date(valor.replace(' ', 'T'));
  return Number.isNaN(d.getTime())
    ? valor
    : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function NotificacoesClient({ notificacoes }: { notificacoes: Notificacao[] }) {
  const [pendente, startTransition] = useTransition();
  const naoLidas = notificacoes.filter((n) => !n.lida).length;

  const marcar = (id?: string) => startTransition(() => marcarLidasAction(id));

  return (
    <>
      <div className="flex items-center gap-4 flex-wrap">
        <h1 className="text-xl font-semibold">Notificações</h1>
        {naoLidas > 0 && (
          <button type="button" className="btn" disabled={pendente} onClick={() => marcar()}>
            Marcar todas como lidas
          </button>
        )}
      </div>

      {notificacoes.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-dim)' }}>Nenhuma notificação.</p>
      ) : (
        <ul className="space-y-2 max-w-2xl">
          {notificacoes.map((n) => (
            <li
              key={n.id}
              className="solid rounded-lg p-3 flex items-start gap-3 border-l-4"
              style={{ borderLeftColor: n.lida ? 'var(--border)' : 'var(--warn)', opacity: n.lida ? 0.7 : 1 }}
            >
              <div className="flex-1 min-w-0 space-y-1">
                <p className="text-sm font-semibold">{n.titulo}</p>
                {n.mensagem && <p className="text-sm" style={{ color: 'var(--text-dim)' }}>{n.mensagem}</p>}
                <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
                  {quando(n.created_at)}
                  {n.link && (
                    <>
                      {' · '}
                      <Link href={n.link} className="underline" onClick={() => { if (!n.lida) marcar(n.id); }}>
                        Abrir
                      </Link>
                    </>
                  )}
                </p>
              </div>
              {!n.lida && (
                <button
                  type="button" className="text-xs px-2 py-1 rounded hover:bg-white/10"
                  disabled={pendente} onClick={() => marcar(n.id)}
                >
                  Marcar como lida
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
