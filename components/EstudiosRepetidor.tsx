'use client';

import { useState } from 'react';
import type { DadosLocal } from '@/lib/types';

type EstudioEntrada = DadosLocal['estudios'][number];

export function EstudiosRepetidor({
  itens, onChange,
}: { itens: EstudioEntrada[]; onChange: (itens: EstudioEntrada[]) => void }) {
  const [nome, setNome] = useState('');

  function adicionar() {
    const nomeNormalizado = nome.trim();
    if (!nomeNormalizado) return;
    onChange([...itens, { nome: nomeNormalizado }]);
    setNome('');
  }

  return (
    <div className="space-y-3">
      <input type="hidden" name="estudios" value={JSON.stringify(itens)} />
      <div className="flex flex-wrap items-end gap-2">
        <label className="block space-y-1 flex-1 min-w-[12rem]">
          <span className="text-sm">Estúdio</span>
          <input
            aria-label="Estúdio" className="input" value={nome}
            onChange={(e) => setNome(e.target.value)} placeholder="ex.: Estúdio A"
          />
        </label>
        <button type="button" className="btn" onClick={adicionar}>Adicionar</button>
      </div>
      <ul className="text-sm space-y-1">
        {itens.map((item, i) => (
          <li key={item.id ?? `novo-${i}`} className="flex items-center gap-2">
            <span className="flex-1">{item.nome}</span>
            <button type="button" className="btn" onClick={() => onChange(itens.filter((_, idx) => idx !== i))}>
              Remover
            </button>
          </li>
        ))}
      </ul>
      {itens.length === 0 && (
        <p className="text-xs" style={{ color: 'var(--text-dim)' }}>Nenhum estúdio adicionado.</p>
      )}
    </div>
  );
}
