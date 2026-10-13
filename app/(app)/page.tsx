import Link from 'next/link';
import { redirect } from 'next/navigation';
import { modulosDoAtor, requireReadyUser } from '@/lib/auth/guards';
import {
  contarAgendamentosPorStatus, contarClientesAtivos, listarStudiosComAgendamentos,
  somarVendasPorTipo,
} from '@/lib/db/dashboard';
import {
  calcularTempoStudio, formatarMinutos, periodoParaIntervalo, type Periodo,
} from '@/lib/dashboard-calc';
import { rotaInicial } from '@/lib/modules';
import type { StatusAgendamento, TipoContratacao } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LABEL_STATUS: Record<StatusAgendamento, string> = {
  agendado: 'Agendado', pre_agendado: 'Pré-agendado', gravando: 'Gravando',
  concluido: 'Concluído', cancelado: 'Cancelado',
};

const LABEL_TIPO: Record<TipoContratacao, string> = {
  avulso: 'Avulso', combo: 'Combo', plano: 'Plano',
};

const PERIODOS: { valor: Periodo; label: string }[] = [
  { valor: 'hoje', label: 'Hoje' },
  { valor: 'semana', label: 'Semana' },
  { valor: 'mes', label: 'Mês' },
];

function periodoValido(v: string | undefined): Periodo {
  return v === 'semana' || v === 'mes' ? v : 'hoje';
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  // `/` é o destino pós-login de todo mundo: sem o Painel, manda pra primeira área
  // liberada em vez de 404 (não dá pra usar `requireModulo('painel')` aqui).
  const liberados = await modulosDoAtor(await requireReadyUser());
  if (!liberados.includes('painel')) redirect(rotaInicial(liberados));
  const { periodo: periodoParam } = await searchParams;
  const periodo = periodoValido(periodoParam);
  const { inicio, fim, dias } = periodoParaIntervalo(periodo);

  const [totalClientes, porStatus, porTipo, studios] = await Promise.all([
    contarClientesAtivos(),
    contarAgendamentosPorStatus(inicio, fim),
    somarVendasPorTipo(inicio, fim),
    listarStudiosComAgendamentos(inicio, fim),
  ]);

  return (
    <main className="p-4 md:p-6 max-w-6xl mx-auto space-y-8">
      <section className="glass p-6 max-w-xs">
        <p className="text-sm" style={{ color: 'var(--text-dim)' }}>Total de Clientes</p>
        <p
          className="text-4xl font-semibold"
          style={{ color: 'var(--accent)', fontFamily: 'var(--font-heading)' }}
        >
          {totalClientes}
        </p>
      </section>

      <section className="space-y-6">
        <nav className="flex gap-2">
          {PERIODOS.map((p) => (
            <Link
              key={p.valor}
              href={`/?periodo=${p.valor}`}
              className={p.valor === periodo ? 'btn btn-primary' : 'btn'}
            >
              {p.label}
            </Link>
          ))}
        </nav>

        <div className="space-y-2">
          <h2 className="text-sm" style={{ color: 'var(--text-dim)' }}>
            Agendamentos por status
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(Object.keys(LABEL_STATUS) as StatusAgendamento[]).map((s) => (
              <div key={s} className="glass p-4">
                <p className="text-sm" style={{ color: 'var(--text-dim)' }}>{LABEL_STATUS[s]}</p>
                <p className="text-2xl font-semibold">{porStatus[s]}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="text-sm" style={{ color: 'var(--text-dim)' }}>Vendas por tipo</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(Object.keys(LABEL_TIPO) as TipoContratacao[]).map((t) => (
              <div key={t} className="glass p-4">
                <p className="text-sm" style={{ color: 'var(--text-dim)' }}>{LABEL_TIPO[t]}</p>
                <p className="text-2xl font-semibold">{porTipo[t]}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="text-sm" style={{ color: 'var(--text-dim)' }}>Tempo por studio</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {studios.map((s) => {
              const { minutosLivres, minutosAgendados } = calcularTempoStudio(s.blocos, dias);
              const total = minutosLivres + minutosAgendados;
              const pctAgendado = total > 0 ? Math.round((minutosAgendados / total) * 100) : 0;
              return (
                <div key={s.estudio_id} className="glass p-4 space-y-2">
                  <p className="text-sm font-medium">{s.local_nome} — {s.estudio_nome}</p>
                  <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
                    {formatarMinutos(minutosLivres)} livres / {formatarMinutos(minutosAgendados)} agendadas
                  </p>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                    <div
                      className="h-2 rounded-full"
                      style={{ width: `${pctAgendado}%`, background: 'var(--accent)' }}
                    />
                  </div>
                </div>
              );
            })}
            {studios.length === 0 && (
              <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
                Nenhum studio cadastrado.
              </p>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
