import { PurgeButton } from '@/components/PurgeButton';
import { RestoreButton } from '@/components/RestoreButton';
import { requireMaster } from '@/lib/auth/guards';
import { listTrash } from '@/lib/db/queries';
import { formatarDataHora } from '@/lib/formato';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function LixeiraPage() {
  const actor = await requireMaster();
  const itens = await listTrash();

  return (
      <main className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
        <h1 className="text-xl font-semibold">Lixeira</h1>

        <div className="surface divide-y" style={{ borderColor: 'var(--border)' }}>
          {itens.map((item) => (
            <div key={`${item.kind}-${item.id}`} className="p-4 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <span className="font-medium">{item.title}</span>{' '}
                <span className="badge">
                  {{
                    room: 'sala', credential: 'senha', cliente: 'cliente', fornecedor: 'fornecedor',
                    produto: 'produto', combo: 'combo', plano: 'plano',
                    local_gravacao: 'local de gravação', estudio: 'estúdio',
                  }[item.kind]}
                </span>
                <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
                  {item.room_name ? `${item.room_name} · ` : ''}
                  apagado em {formatarDataHora(item.deleted_at)}
                  {item.kind === 'room' && item.credential_count !== null && (
                    <>
                      {' · '}
                      {item.credential_count} senha{item.credential_count === 1 ? '' : 's'} nela
                    </>
                  )}
                </p>
              </div>
              <RestoreButton kind={item.kind} id={item.id} />
              <PurgeButton
                kind={item.kind} id={item.id} title={item.title}
                credentialCount={item.kind === 'room' ? item.credential_count : null}
              />
            </div>
          ))}
          {itens.length === 0 && (
            <p className="p-8 text-center text-sm" style={{ color: 'var(--text-dim)' }}>
              A lixeira está vazia.
            </p>
          )}
        </div>
      </main>
  );
}
