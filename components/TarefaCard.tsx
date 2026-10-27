'use client';

import { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { corPorDeadline, type CorPrazo } from '@/lib/tarefas-calc';
import { formatarDataBR } from '@/lib/documentos';
import type { Tarefa } from '@/lib/types';

/** Cor da borda por prazo. `ajuste` sobrepõe qualquer uma dessas com vermelho vivo
 *  (ver `CORES_BORDA_AJUSTE`) — precisa ser visualmente distinguível do vermelho
 *  normal de prazo, senão o usuário não diferencia "prazo vermelho" de "veio de
 *  ajuste". */
const CORES_BORDA: Record<CorPrazo, string> = {
  verde: 'var(--ok)',
  amarelo: 'var(--warn)',
  vermelho: 'var(--danger)',
  neutro: 'var(--border)',
};

// Vermelho mais intenso e saturado que --danger (#ff6b6b), para não se confundir
// com o vermelho normal de prazo vencido.
const COR_BORDA_AJUSTE = '#ff1f4b';

/** `listTarefas` já faz `::text` nas colunas de data, mas o driver do Neon pode
 *  entregar `Date` mesmo assim (ver nota em lib/tarefas-calc.ts) — normaliza antes
 *  de repassar pra `formatarDataBR`, que só aceita string `YYYY-MM-DD`. */
function paraDataBR(valor: string | Date): string {
  const iso = valor instanceof Date ? valor.toISOString() : valor;
  return formatarDataBR(iso.slice(0, 10));
}

export function TarefaCard({ tarefa }: { tarefa: Tarefa }) {
  const [expandido, setExpandido] = useState(false);

  const cor = corPorDeadline(tarefa.deadline_cliente);
  const corBorda = tarefa.ajuste ? COR_BORDA_AJUSTE : CORES_BORDA[cor];

  return (
    <button
      type="button"
      onClick={() => setExpandido((v) => !v)}
      className="solid solid-raised w-full text-left p-3 space-y-1 rounded-lg border-l-4"
      style={{ borderLeftColor: corBorda }}
    >
      <div className="flex items-center gap-2">
        {tarefa.ajuste && (
          <AlertCircle
            size={16} aria-label="Ajuste"
            style={{ color: COR_BORDA_AJUSTE }}
          />
        )}
        <span className="text-sm font-semibold flex-1 truncate">{tarefa.cliente_nome}</span>
      </div>
      <p className="text-sm" style={{ color: 'var(--text-dim)' }}>{tarefa.produto_nome}</p>
      <div className="flex items-center justify-between text-xs" style={{ color: 'var(--text-dim)' }}>
        <span>{tarefa.responsavel_nome ?? 'Sem responsável'}</span>
        <span>Prioridade {tarefa.prioridade}</span>
      </div>

      {expandido && (
        <div className="pt-2 mt-2 space-y-1 text-sm" style={{ borderTop: '1px solid var(--border)' }}>
          <p><span style={{ color: 'var(--text-dim)' }}>Tarefa: </span>{tarefa.tarefa || '—'}</p>
          <p>
            <span style={{ color: 'var(--text-dim)' }}>Deadline cliente: </span>
            {tarefa.deadline_cliente ? paraDataBR(tarefa.deadline_cliente) : '—'}
          </p>
          <p>
            <span style={{ color: 'var(--text-dim)' }}>Deadline tarefa: </span>
            {tarefa.deadline_tarefa ? paraDataBR(tarefa.deadline_tarefa) : '—'}
          </p>
        </div>
      )}
    </button>
  );
}
