'use client';

import { useActionState, useEffect, useState } from 'react';
import type { AgendaFormState } from '@/components/AgendaFormularioModal';
import type { BloqueioEstudio } from '@/lib/types';

const inicial: AgendaFormState = {};
type Acao = (prev: AgendaFormState, fd: FormData) => Promise<AgendaFormState>;

export function BloqueioFormularioModal({
  estudioId, bloqueios, criar, apagar, onFechar, onAtualizar,
}: {
  estudioId: string; bloqueios: BloqueioEstudio[];
  criar: Acao; apagar: (id: string) => Promise<{ error?: string }>; onFechar: () => void; onAtualizar?: () => void;
}) {
  const [state, action, pending] = useActionState(criar, inicial);
  const [erroRemover, setErroRemover] = useState<string | null>(null);
  const [removendo, setRemovendo] = useState<string | null>(null);

  useEffect(() => { if (state.ok) { onAtualizar?.(); onFechar(); } }, [state.ok, onFechar, onAtualizar]);

  async function removerClique(id: string) {
    if (!confirm('Remover este bloqueio?')) return;
    setRemovendo(id);
    const r = await apagar(id);
    setRemovendo(null);
    if (r.error) setErroRemover(r.error); else onAtualizar?.();
  }

  return (
    <div className="glass p-5 space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="font-semibold flex-1">Bloquear horário do estúdio</h2>
        <button type="button" className="btn" onClick={onFechar}>Fechar</button>
      </div>
      <form action={action} className="space-y-4">
        <input type="hidden" name="estudioId" value={estudioId} />
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1"><span className="text-sm">Data</span><input type="date" name="data" className="input" required /></label>
          <div />
          <label className="block space-y-1"><span className="text-sm">Início</span><input type="time" step={1800} min="07:00" max="21:00" name="horaInicio" className="input" required /></label>
          <label className="block space-y-1"><span className="text-sm">Fim</span><input type="time" step={1800} min="07:00" max="21:00" name="horaFim" className="input" required /></label>
          <label className="block space-y-1 sm:col-span-2"><span className="text-sm">Motivo</span><input type="text" name="motivo" className="input" placeholder="Ex.: manutenção do equipamento" /></label>
        </div>
        {state.error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{state.error}</p>}
        <button className="btn btn-primary" disabled={pending}>Bloquear</button>
      </form>
      <div className="space-y-2">
        <h3 className="text-sm font-medium" style={{ color: 'var(--text-dim)' }}>Bloqueios ativos deste estúdio</h3>
        {bloqueios.length === 0 && <p className="text-sm" style={{ color: 'var(--text-dim)' }}>Nenhum bloqueio ativo.</p>}
        {bloqueios.map((b) => (
          <div key={b.id} className="flex items-center gap-2 text-sm">
            <span className="flex-1">
              {b.data.slice(8, 10)}/{b.data.slice(5, 7)} · {b.hora_inicio.slice(0, 5)}–{b.hora_fim.slice(0, 5)}
              {b.motivo ? ` · ${b.motivo}` : ''}
            </span>
            <button
              type="button"
              className="btn btn-danger"
              disabled={removendo === b.id}
              onClick={() => void removerClique(b.id)}
            >
              Remover
            </button>
          </div>
        ))}
        {erroRemover && <p className="text-sm" style={{ color: 'var(--danger)' }}>{erroRemover}</p>}
      </div>
    </div>
  );
}
