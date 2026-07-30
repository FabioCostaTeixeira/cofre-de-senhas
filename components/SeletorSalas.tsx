'use client';

import { useState } from 'react';

export type SalaOpcao = { id: string; name: string };

/**
 * Escolha das salas a que um usuário tem acesso.
 *
 * Fica na tela do usuário, e não na da sala, porque a instalação tende a ter
 * muito mais salas do que pessoas: conceder acesso uma sala por vez obrigaria a
 * percorrer dezenas de telas para liberar um único usuário novo.
 *
 * As caixas são controladas (`checked`, não `defaultChecked`) porque o conjunto
 * muda sozinho em duas situações: ao clicar em "Todas"/"Nenhuma" e ao trocar o
 * papel para master, que já enxerga tudo.
 */
export function SeletorSalas({
  salas, selecionadas, onChange, desabilitado = false, dica,
}: {
  salas: SalaOpcao[];
  selecionadas: string[];
  onChange: (ids: string[]) => void;
  desabilitado?: boolean;
  dica?: string;
}) {
  const todasMarcadas = salas.length > 0 && selecionadas.length === salas.length;

  function alternar(id: string, marcada: boolean) {
    onChange(marcada ? [...selecionadas, id] : selecionadas.filter((s) => s !== id));
  }

  return (
    <div className="space-y-2">
      {/* Cada id selecionado vira um campo do formulário, mesmo quando as caixas
          estão desabilitadas — assim a seleção do master chega na Server Action. */}
      {selecionadas.map((id) => (
        <input key={id} type="hidden" name="salas" value={id} />
      ))}

      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm">Salas com acesso</span>
        <button
          type="button"
          className="btn text-xs"
          disabled={desabilitado || salas.length === 0}
          onClick={() => onChange(todasMarcadas ? [] : salas.map((s) => s.id))}
        >
          {todasMarcadas ? 'Desmarcar todas' : 'Marcar todas'}
        </button>
        <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
          {selecionadas.length} de {salas.length}
        </span>
      </div>

      {dica && <p className="text-xs" style={{ color: 'var(--text-dim)' }}>{dica}</p>}

      {salas.length === 0 ? (
        <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
          Nenhuma sala cadastrada ainda.
        </p>
      ) : (
        <div
          className="flex flex-wrap gap-x-4 gap-y-2 max-h-48 overflow-y-auto"
          style={{ opacity: desabilitado ? 0.55 : 1 }}
        >
          {salas.map((s) => (
            <label key={s.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selecionadas.includes(s.id)}
                disabled={desabilitado}
                onChange={(e) => alternar(s.id, e.target.checked)}
              />
              {s.name}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
