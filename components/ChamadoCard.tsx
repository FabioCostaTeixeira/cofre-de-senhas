'use client';

import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { formatarDataHora } from '@/lib/formato';
import type { Chamado } from '@/lib/types';

/** Card do quadro Working › Projetos: resumido mostra título, quando foi aberto e para
 *  quem está atribuído; clicar expande descrição, produto e quem abriu. O lápis segue o
 *  mesmo arranjo do `TarefaCard` (fora do botão de expandir, sem iniciar arraste). */
export function ChamadoCard({ chamado, onEditar }: { chamado: Chamado; onEditar?: () => void }) {
  const [expandido, setExpandido] = useState(false);

  return (
    <div className="solid solid-raised relative rounded-lg border-l-4" style={{ borderLeftColor: 'var(--border)' }}>
      {onEditar && (
        <button
          type="button" aria-label="Editar chamado" title="Editar chamado"
          className="absolute top-2 right-2 p-1 rounded hover:bg-white/10"
          style={{ color: 'var(--text-dim)' }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onEditar}
        >
          <Pencil size={14} />
        </button>
      )}
      <button
        type="button"
        onClick={() => setExpandido((v) => !v)}
        className={`w-full text-left p-3 space-y-1 ${onEditar ? 'pr-9' : ''}`}
      >
        <p className="text-sm font-semibold">{chamado.titulo}</p>
        <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
          Aberto em {formatarDataHora(chamado.created_at)}
        </p>
        <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
          Atribuído a {chamado.responsavel_nome ?? 'ninguém'}
        </p>

        {expandido && (
          <div className="pt-2 mt-2 space-y-1 text-sm" style={{ borderTop: '1px solid var(--border)' }}>
            <p className="whitespace-pre-wrap">{chamado.descricao || '—'}</p>
            <p><span style={{ color: 'var(--text-dim)' }}>Produto: </span>{chamado.produto_nome}</p>
            <p><span style={{ color: 'var(--text-dim)' }}>Aberto por: </span>{chamado.criado_por_nome}</p>
          </div>
        )}
      </button>
    </div>
  );
}
