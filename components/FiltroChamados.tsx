'use client';

import { useRouter } from 'next/navigation';
import { FILTROS_CHAMADOS, type FiltroChamados as Filtro } from '@/lib/chamados-visao';

/** Filtro pessoal do quadro de chamados numa caixa só, em vez de um botão por opção.
 *  Escolher navega para a URL do filtro (`base` já traz o `?visao=` quando há). */
export function FiltroChamados({ atual, base }: { atual: Filtro; base: string }) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 text-sm">
      <span style={{ color: 'var(--text-dim)' }}>Mostrar</span>
      <select
        aria-label="Filtrar chamados" className="input w-auto" value={atual}
        onChange={(e) => router.push(`${base}filtro=${e.target.value}`)}
      >
        {FILTROS_CHAMADOS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
      </select>
    </label>
  );
}
