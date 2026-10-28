'use client';

import { AGENDA_BLOCO_MIN, AGENDA_INICIO_MIN } from '@/lib/agenda-form';
import type { Agendamento, StatusAgendamento } from '@/lib/types';

export const ALTURA_BLOCO_PX = 25;

const CORES: Record<StatusAgendamento, string> = {
  cancelado: '#ef4444', agendado: '#22c55e', pre_agendado: '#eab308',
  gravando: '#38bdf8', concluido: '#1d4ed8',
};

export const ROTULOS_STATUS: Record<StatusAgendamento, string> = {
  cancelado: 'Cancelado', agendado: 'Agendado', pre_agendado: 'Pré Agendado',
  gravando: 'Gravando', concluido: 'Concluído',
};

function minutosDesdeMeiaNoite(hora: string): number {
  const [h, m] = hora.slice(0, 5).split(':').map(Number);
  return h * 60 + m;
}

export function calcularPosicaoCard(horaInicio: string, horaFim: string): { top: number; height: number } {
  const inicioBlocos = (minutosDesdeMeiaNoite(horaInicio) - AGENDA_INICIO_MIN) / AGENDA_BLOCO_MIN;
  const fimBlocos = (minutosDesdeMeiaNoite(horaFim) - AGENDA_INICIO_MIN) / AGENDA_BLOCO_MIN;
  return { top: inicioBlocos * ALTURA_BLOCO_PX, height: (fimBlocos - inicioBlocos) * ALTURA_BLOCO_PX };
}

export function AgendaCard({
  item, onPointerDownMover, onPointerDownRedimensionar, onClick,
}: {
  item: Agendamento;
  onPointerDownMover: (e: React.PointerEvent) => void;
  onPointerDownRedimensionar: (e: React.PointerEvent) => void;
  onClick: () => void;
}) {
  const { top, height } = calcularPosicaoCard(item.hora_inicio, item.hora_fim);
  return (
    <div
      data-agenda-card
      className="absolute left-1 right-1 rounded text-xs text-white overflow-hidden cursor-pointer select-none"
      style={{ top, height, backgroundColor: CORES[item.status] }}
      onPointerDown={onPointerDownMover}
      onClick={onClick}
    >
      <div className="p-1">
        <div className="font-medium truncate">{item.cliente_nome}</div>
        <div className="truncate">{item.estudio_nome} · {item.produto_nome}</div>
        <div className="truncate">{ROTULOS_STATUS[item.status]}</div>
      </div>
      <div
        data-testid="agenda-card-resize"
        className="absolute bottom-0 left-0 right-0 h-1.5 cursor-ns-resize"
        onPointerDown={(e) => { e.stopPropagation(); onPointerDownRedimensionar(e); }}
      />
    </div>
  );
}
