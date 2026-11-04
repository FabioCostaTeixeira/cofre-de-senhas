'use client';

import { useState } from 'react';

/**
 * Campo Status dos formulários de Feature/User Story. Na edição, trocar o status é
 * movimentação do card: aparece o "Motivo da movimentação" (obrigatório), que a action
 * grava na timeline — mesma regra do arraste no kanban. Na criação não há motivo.
 */
export function TiStatusComMotivo({
  opcoes, inicial, editando,
}: { opcoes: readonly { id: string; label: string }[]; inicial: string; editando: boolean }) {
  const [status, setStatus] = useState(inicial);
  const mudou = editando && status !== inicial;

  return (
    <>
      <label className="block space-y-1">
        <span className="text-sm">Status</span>
        <select name="status" className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
          {opcoes.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </label>
      {mudou && (
        <label className="block space-y-1 sm:col-span-2">
          <span className="text-sm" style={{ color: 'var(--warn)' }}>
            Motivo da movimentação (obrigatório, entra no histórico do card)
          </span>
          <textarea name="motivo" className="input" rows={2} required placeholder="Por que o status está mudando?" />
        </label>
      )}
    </>
  );
}
