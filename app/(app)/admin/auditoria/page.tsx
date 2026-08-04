import Link from 'next/link';
import { requireMaster } from '@/lib/auth/guards';
import { listAudit } from '@/lib/db/audit';
import { formatarDataHora } from '@/lib/formato';
import { AUDIT_ACTIONS } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function paginaLink(acao: string, pagina: number): string {
  const params = new URLSearchParams();
  if (acao) params.set('acao', acao);
  if (pagina > 1) params.set('pagina', String(pagina));
  const query = params.toString();
  return query ? `/admin/auditoria?${query}` : '/admin/auditoria';
}

export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<{ acao?: string; pagina?: string }>;
}) {
  const actor = await requireMaster();
  const { acao = '', pagina: paginaParam } = await searchParams;
  const pagina = Math.max(1, Number(paginaParam) || 1);
  const { linhas, temProxima } = await listAudit(pagina, acao || undefined);

  return (
      <main className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
        <h1 className="text-xl font-semibold">Auditoria</h1>

        <form className="flex gap-2 items-end">
          <label className="space-y-1">
            <span className="text-sm">Ação</span>
            <select name="acao" className="input" defaultValue={acao}>
              <option value="">todas</option>
              {AUDIT_ACTIONS.map((a) => (
                <option key={a} value={a}>{a}</option>
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
                    {formatarDataHora(l.created_at)}
                  </td>
                  <td className="p-3">{l.actor_name ?? '—'}</td>
                  <td className="p-3">{l.action}</td>
                  <td className="p-3">{l.entity_type ?? '—'}</td>
                  <td className="p-3 font-mono text-xs">{JSON.stringify(l.metadata)}</td>
                </tr>
              ))}
              {linhas.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center" style={{ color: 'var(--text-dim)' }}>
                    Nenhum registro nesta página.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center gap-3">
          {pagina > 1 ? (
            <Link href={paginaLink(acao, pagina - 1)} className="btn">← Anterior</Link>
          ) : (
            <button className="btn" disabled>← Anterior</button>
          )}
          <span className="text-sm" style={{ color: 'var(--text-dim)' }}>Página {pagina}</span>
          {temProxima ? (
            <Link href={paginaLink(acao, pagina + 1)} className="btn">Próxima →</Link>
          ) : (
            <button className="btn" disabled>Próxima →</button>
          )}
        </div>
      </main>
  );
}
