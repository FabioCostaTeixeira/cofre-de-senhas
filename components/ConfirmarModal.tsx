'use client';

import { useEffect, useState } from 'react';

/**
 * Pergunta de sim/não antes de uma ação que não se desfaz pela tela (excluir, concluir).
 * `onConfirmar` devolve `{ error }` para manter o modal aberto mostrando o motivo; sem
 * erro, quem chamou fecha o modal (normalmente dentro do próprio `onConfirmar`).
 */
export function ConfirmarModal({
  titulo, mensagem, confirmarLabel, perigo = false, onConfirmar, onCancelar,
}: {
  titulo: string;
  mensagem: React.ReactNode;
  confirmarLabel: string;
  /** Botão de confirmar em vermelho (exclusão). */
  perigo?: boolean;
  onConfirmar: () => Promise<{ error?: string } | void>;
  onCancelar: () => void;
}) {
  const [pendente, setPendente] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !pendente) onCancelar(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [pendente, onCancelar]);

  async function confirmar() {
    setPendente(true);
    setErro(null);
    try {
      const res = await onConfirmar();
      if (res?.error) setErro(res.error);
    } catch {
      setErro('Não foi possível concluir a operação.');
    } finally {
      setPendente(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={() => { if (!pendente) onCancelar(); }}
    >
      <div
        className="glass w-full max-w-sm p-6 space-y-4 rounded-2xl"
        role="alertdialog" aria-modal="true" aria-labelledby="confirmar-titulo"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirmar-titulo" className="text-lg font-semibold">{titulo}</h2>
        <div className="text-sm" style={{ color: 'var(--text-dim)' }}>{mensagem}</div>
        {erro && <p className="text-sm" style={{ color: 'var(--danger)' }}>{erro}</p>}
        <div className="flex gap-3 justify-end pt-2">
          <button
            type="button" onClick={onCancelar} disabled={pendente}
            className="px-4 py-2 rounded-lg hover:bg-white/10 transition"
          >
            Cancelar
          </button>
          <button
            type="button" onClick={confirmar} disabled={pendente}
            className="btn btn-primary"
            style={perigo ? { background: 'var(--danger)', color: '#fff', borderColor: 'var(--danger)' } : undefined}
          >
            {pendente ? '...' : confirmarLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
