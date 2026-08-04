'use client';

import { useState } from 'react';
import { expurgar } from '@/app/(app)/admin/lixeira/actions';

export function PurgeButton({
  kind, id, title, credentialCount,
}: {
  kind: 'credential' | 'room';
  id: string;
  title: string;
  /** Só se aplica a `kind === 'room'`: quantas senhas serão destruídas junto. */
  credentialCount: number | null;
}) {
  const [erro, setErro] = useState<string | null>(null);

  async function apagar() {
    const mensagem = kind === 'room' && credentialCount
      ? `Apagar de vez a sala “${title}” vai destruir para sempre ${credentialCount} ` +
        `senha${credentialCount === 1 ? '' : 's'} dela. Esta ação não pode ser desfeita. ` +
        'Deseja continuar?'
      : `Apagar “${title}” de vez? Esta ação não pode ser desfeita.`;
    if (!confirm(mensagem)) return;

    const r = await expurgar(kind, id);
    if (r.error) setErro(r.error);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button className="btn btn-danger" onClick={apagar}>Apagar de vez</button>
      {erro && <p className="text-xs" style={{ color: 'var(--danger)' }}>{erro}</p>}
    </div>
  );
}
