'use client';

import { AGENDA_BLOCO_MIN, AGENDA_INICIO_MIN } from '@/lib/agenda-form';
import type { PosicaoColuna } from '@/lib/agenda-layout';
import type { Agendamento, StatusAgendamento } from '@/lib/types';

export const ALTURA_BLOCO_PX = 25;

export const CORES_STATUS: Record<StatusAgendamento, string> = {
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

/** Horizontal do bloco na coluna do dia: ocupa a fatia `coluna` de `total` (horários sobrepostos lado a lado). */
export function estiloHorizontal(posicao?: PosicaoColuna): React.CSSProperties {
  const { coluna, total } = posicao ?? { coluna: 0, total: 1 };
  return { left: `calc(${(coluna / total) * 100}% + 2px)`, width: `calc(${100 / total}% - 4px)` };
}

export function AgendaCard({
  item, posicao, corEstudio, onPointerDownMover, onPointerDownRedimensionar, onClick,
}: {
  item: Agendamento;
  posicao?: PosicaoColuna;
  /** Visão "Todos os estúdios": faixa lateral com a cor do estúdio. */
  corEstudio?: string;
  onPointerDownMover: (e: React.PointerEvent) => void;
  onPointerDownRedimensionar: (e: React.PointerEvent) => void;
  onClick: () => void;
}) {
  const { top, height } = calcularPosicaoCard(item.hora_inicio, item.hora_fim);
  return (
    <div
      data-agenda-card
      className="absolute rounded text-xs text-white overflow-hidden cursor-pointer select-none"
      title={`${item.cliente_nome} · ${item.estudio_nome} · ${item.produto_nome} · ${ROTULOS_STATUS[item.status]} · ${item.hora_inicio.slice(0, 5)}–${item.hora_fim.slice(0, 5)}`}
      style={{
        top, height, ...estiloHorizontal(posicao), backgroundColor: CORES_STATUS[item.status],
        ...(corEstudio ? { borderLeft: `6px solid ${corEstudio}`, boxShadow: `inset 0 0 0 1px ${corEstudio}` } : {}),
      }}
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
