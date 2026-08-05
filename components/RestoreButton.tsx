'use client';

import { useState } from 'react';
import { restaurar } from '@/app/(app)/admin/lixeira/actions';

export function RestoreButton({ kind, id }: { kind: 'credential' | 'room'; id: string }) {
  const [erro, setErro] = useState<string | null>(null);

  async function restaurarItem() {
    const r = await restaurar(kind, id);
    setErro(r.error ?? null);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button className="btn" onClick={restaurarItem}>Restaurar</button>
      {erro && <p className="text-xs" style={{ color: 'var(--danger)' }}>{erro}</p>}
    </div>
  );
}
