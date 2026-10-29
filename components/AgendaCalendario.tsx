'use client';

import { useState } from 'react';
import { Clock } from 'lucide-react';
import { CORES_STATUS, ROTULOS_STATUS } from '@/components/AgendaCard';
import { diasDaGradeDoMes, hojeLocalISO, mesDe } from '@/lib/agenda-calendario';
import type { Agendamento, LocalGravacao } from '@/lib/types';

const DIAS_SEMANA = ['segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado', 'domingo'];
const CARDS_VISIVEIS = 4;

/** Visão mensal só de leitura: cards por dia em ordem de horário; clique abre o agendamento. */
export function AgendaCalendario({
  mes, itens, locais, onAbrir,
}: {
  mes: string; itens: Agendamento[]; locais: LocalGravacao[]; onAbrir: (item: Agendamento) => void;
}) {
  const [diasExpandidos, setDiasExpandidos] = useState<Set<string>>(new Set());
  const dias = diasDaGradeDoMes(mes);
  const hoje = hojeLocalISO();
  const nomeLocal = new Map(locais.map((l) => [l.id, l.nome]));

  const itensDoDia = (dia: string) => itens
    .filter((item) => item.data === dia)
    .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));

  const expandir = (dia: string) => setDiasExpandidos((atual) => new Set(atual).add(dia));

  return <div className="overflow-x-auto">
    <div className="min-w-[56rem] border rounded" style={{ borderColor: 'var(--border)' }}>
      <div className="grid grid-cols-7">
        {DIAS_SEMANA.map((d) => <div key={d} className="px-2 py-1.5 text-sm border-b" style={{ borderColor: 'var(--border)' }}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {dias.map((dia, i) => {
          const doDia = itensDoDia(dia);
          const expandido = diasExpandidos.has(dia);
          const visiveis = expandido ? doDia : doDia.slice(0, CARDS_VISIVEIS);
          const restantes = doDia.length - visiveis.length;
          const foraDoMes = mesDe(dia) !== mes;
          const fimDeSemana = i % 7 >= 5;
          return <div
            key={dia}
            data-testid="calendario-dia"
            className="flex flex-col gap-1 p-1 min-h-[8rem] border-b border-r"
            style={{
              borderColor: 'var(--border)',
              backgroundColor: dia === hoje ? 'rgba(255, 148, 0, 0.06)' : fimDeSemana ? 'rgba(255, 255, 255, 0.02)' : undefined,
              opacity: foraDoMes ? 0.5 : undefined,
            }}
          >
            {visiveis.map((item) => {
              const local = nomeLocal.get(item.local_id);
              return <button
                key={item.id}
                type="button"
                data-testid="calendario-card"
                title={`${ROTULOS_STATUS[item.status]} · ${item.estudio_nome}`}
                className="text-left rounded px-1.5 py-1 text-xs"
                style={{ backgroundColor: `${CORES_STATUS[item.status]}33`, borderLeft: `3px solid ${CORES_STATUS[item.status]}`, color: 'var(--text)' }}
                onClick={() => onAbrir(item)}
              >
                <div className="truncate font-medium">{[local, item.cliente_nome, item.produto_nome].filter(Boolean).join(' - ')}</div>
                <div className="flex items-center gap-1" style={{ color: 'var(--text-dim)' }}>
                  <Clock size={10} aria-hidden="true" />
                  {item.hora_inicio.slice(0, 5)}-{item.hora_fim.slice(0, 5)}
                </div>
              </button>;
            })}
            <div className="mt-auto flex items-end justify-between text-xs" style={{ color: 'var(--text-dim)' }}>
              {restantes > 0
                ? <button type="button" className="hover:underline" onClick={() => expandir(dia)}>+ {restantes} MAIS</button>
                : <span />}
              <span style={dia === hoje ? { color: 'var(--text)', fontWeight: 600 } : undefined}>{Number(dia.slice(8, 10))}</span>
            </div>
          </div>;
        })}
      </div>
    </div>
  </div>;
}
