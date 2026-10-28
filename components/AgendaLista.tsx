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

export function mesRotulo(anoMes: string): string {
  const [ano, mes] = anoMes.split('-').map(Number);
  return `${MESES[mes - 1]} de ${ano}`;
}

/** Todos os meses entre o primeiro e o último item, inclusive, mesmo os sem
 *  nenhum registro — pra deixar visível que não houve agendamento naquele período. */
export function calcularMesesDisponiveis(datas: string[]): string[] {
  if (datas.length === 0) return [new Date().toISOString().slice(0, 7)];
  const anosMeses = datas.map((d) => d.slice(0, 7)).sort();
  const meses: string[] = [];
  let [ano, mes] = anosMeses[0].split('-').map(Number);
  const [anoFim, mesFim] = anosMeses[anosMeses.length - 1].split('-').map(Number);
  while (ano < anoFim || (ano === anoFim && mes <= mesFim)) {
    meses.push(`${ano}-${String(mes).padStart(2, '0')}`);
    mes += 1;
    if (mes > 12) { mes = 1; ano += 1; }
  }
  return meses;
}

export function AgendaLista({
  agendamentos, bloqueios, mesesDisponiveis, busca, mesFiltro,
}: {
  agendamentos: Agendamento[]; bloqueios: BloqueioEstudio[]; mesesDisponiveis: string[]; busca: string; mesFiltro: string;
}) {
  const buscaNormalizada = busca.trim().toLowerCase();
  const agendamentosFiltrados = buscaNormalizada
    ? agendamentos.filter((a) => a.cliente_nome.toLowerCase().includes(buscaNormalizada))
    : agendamentos;

  const linhas: Linha[] = [
    ...agendamentosFiltrados.map((item): Linha => ({ tipo: 'agendamento', data: `${item.data}T${item.hora_inicio}`, item })),
    ...bloqueios.map((item): Linha => ({ tipo: 'bloqueio', data: `${item.data}T${item.hora_inicio}`, item })),
  ].sort((a, b) => a.data.localeCompare(b.data));

  const meses = mesFiltro === 'todos' ? mesesDisponiveis : [mesFiltro];

  return (
    <div className="space-y-6">
      {meses.map((anoMes) => {
        const linhasDoMes = linhas.filter((l) => l.data.slice(0, 7) === anoMes);
        return (
          <div key={anoMes} className="space-y-2">
            <h3 className="font-medium">{mesRotulo(anoMes)}</h3>
            {linhasDoMes.length === 0
              ? <p className="text-sm" style={{ color: 'var(--text-dim)' }}>Nenhum agendamento ou bloqueio neste mês.</p>
              : (
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
                    {linhasDoMes.map((linha) => linha.tipo === 'agendamento' ? (
                      <tr key={`a-${linha.item.id}`}>
                        <td className="p-2">{linha.item.data.slice(8, 10)}/{linha.item.data.slice(5, 7)}</td>
                        <td className="p-2">{linha.item.hora_inicio.slice(0, 5)}</td>
                        <td className="p-2">{linha.item.hora_fim.slice(0, 5)}</td>
                        <td className="p-2">{linha.item.cliente_nome}</td>
                        <td className="p-2">{linha.item.produto_nome}</td>
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
              )}
          </div>
        );
      })}
    </div>
  );
}
