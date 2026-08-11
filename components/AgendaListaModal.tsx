'use client';

import { ROTULOS_STATUS } from '@/components/AgendaCard';
import type { Agendamento, BloqueioEstudio } from '@/lib/types';

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

type LinhaAgendamento = { tipo: 'agendamento'; data: string; item: Agendamento };
type LinhaBloqueio = { tipo: 'bloqueio'; data: string; item: BloqueioEstudio };
type Linha = LinhaAgendamento | LinhaBloqueio;

function mesRotulo(anoMes: string): string {
  const [ano, mes] = anoMes.split('-').map(Number);
  return `${MESES[mes - 1]} de ${ano}`;
}

function agruparPorMes(linhas: Linha[]): { anoMes: string; linhas: Linha[] }[] {
  const grupos = new Map<string, Linha[]>();
  for (const linha of linhas) {
    const anoMes = linha.data.slice(0, 7);
    if (!grupos.has(anoMes)) grupos.set(anoMes, []);
    grupos.get(anoMes)!.push(linha);
  }
  return Array.from(grupos.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([anoMes, linhas]) => ({ anoMes, linhas }));
}

export function AgendaListaModal({
  agendamentos, bloqueios, onFechar,
}: {
  agendamentos: Agendamento[]; bloqueios: BloqueioEstudio[]; onFechar: () => void;
}) {
  const linhas: Linha[] = [
    ...agendamentos.map((item): Linha => ({ tipo: 'agendamento', data: `${item.data}T${item.hora_inicio}`, item })),
    ...bloqueios.map((item): Linha => ({ tipo: 'bloqueio', data: `${item.data}T${item.hora_inicio}`, item })),
  ].sort((a, b) => a.data.localeCompare(b.data));
  const grupos = agruparPorMes(linhas);

  return (
    <div className="glass p-5 space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="font-semibold flex-1">Agendamentos e bloqueios por mês</h2>
        <button type="button" className="btn" onClick={onFechar}>Fechar</button>
      </div>
      {grupos.length === 0 && <p className="text-sm" style={{ color: 'var(--text-dim)' }}>Nenhum agendamento ou bloqueio para este estúdio.</p>}
      <div className="space-y-6 max-h-[70vh] overflow-y-auto">
        {grupos.map(({ anoMes, linhas }) => (
          <div key={anoMes} className="space-y-2">
            <h3 className="font-medium">{mesRotulo(anoMes)}</h3>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: 'var(--text-dim)' }}>
                  <th className="text-left p-2">Data</th>
                  <th className="text-left p-2">Início</th>
                  <th className="text-left p-2">Fim</th>
                  <th className="text-left p-2">Cliente</th>
                  <th className="text-left p-2">Produto</th>
                  <th className="text-left p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((linha) => linha.tipo === 'agendamento' ? (
                  <tr key={`a-${linha.item.id}`}>
                    <td className="p-2">{linha.item.data.slice(8, 10)}/{linha.item.data.slice(5, 7)}</td>
                    <td className="p-2">{linha.item.hora_inicio.slice(0, 5)}</td>
                    <td className="p-2">{linha.item.hora_fim.slice(0, 5)}</td>
                    <td className="p-2">{linha.item.cliente_nome}</td>
                    <td className="p-2">{linha.item.categoria_nome}</td>
                    <td className="p-2">{ROTULOS_STATUS[linha.item.status]}</td>
                  </tr>
                ) : (
                  <tr key={`b-${linha.item.id}`}>
                    <td className="p-2">{linha.item.data.slice(8, 10)}/{linha.item.data.slice(5, 7)}</td>
                    <td className="p-2">{linha.item.hora_inicio.slice(0, 5)}</td>
                    <td className="p-2">{linha.item.hora_fim.slice(0, 5)}</td>
                    <td className="p-2" colSpan={2} style={{ color: 'var(--text-dim)' }}>Bloqueio{linha.item.motivo ? ` — ${linha.item.motivo}` : ''}</td>
                    <td className="p-2">—</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}
