import { Nav } from '@/components/Nav';
import { requireMaster } from '@/lib/auth/guards';
import { listAudit } from '@/lib/db/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACOES = [
  '', 'login_ok', 'login_fail', 'view', 'copy', 'create', 'update', 'delete',
  'restore', 'purge', 'room_create', 'member_add', 'user_create',
];

export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<{ acao?: string }>;
}) {
  const actor = await requireMaster();
  const { acao = '' } = await searchParams;
  const linhas = await listAudit(200, acao || undefined);

  return (
    <>
      <Nav actor={actor} />
      <main className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
        <h1 className="text-xl font-semibold">Auditoria</h1>

        <form className="flex gap-2 items-end">
          <label className="space-y-1">
            <span className="text-sm">Ação</span>
            <select name="acao" className="input" defaultValue={acao}>
              {ACOES.map((a) => (
                <option key={a} value={a}>{a || 'todas'}</option>
              ))}
            </select>
          </label>
          <button className="btn">Filtrar</button>
        </form>

        <div className="surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead style={{ color: 'var(--text-dim)' }}>
              <tr className="text-left">
                <th className="p-3">Quando</th><th className="p-3">Quem</th>
                <th className="p-3">Ação</th><th className="p-3">Alvo</th>
                <th className="p-3">Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                  <td className="p-3 whitespace-nowrap">
                    {new Date(l.created_at).toLocaleString('pt-BR')}
                  </td>
                  <td className="p-3">{l.actor_name ?? '—'}</td>
                  <td className="p-3">{l.action}</td>
                  <td className="p-3">{l.entity_type ?? '—'}</td>
                  <td className="p-3 font-mono text-xs">{JSON.stringify(l.metadata)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
