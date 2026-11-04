'use client';

import { useEffect, useState } from 'react';
import { ModalForm } from '@/components/ModalForm';
import { anotarCardTiAction, listarHistoricoTiAction, moverCardTiAction } from '@/app/(app)/ti/historico-actions';
import { formatarDataHora } from '@/lib/formato';
import type { CardTi, TiHistorico } from '@/lib/db/ti-historico';

/** Movimentação pendente: o card foi solto em outra coluna e espera o motivo. */
export type MovimentoTi = { de: string; para: string };

/**
 * Card de TI expandido: timeline (o que aconteceu, por quê, quando e quem) mais um campo
 * de texto. Aberto pelo clique, o campo é uma anotação opcional. Aberto pelo arraste
 * (`movimento`), o campo é o motivo e é obrigatório: o card só muda de coluna quando
 * ele é enviado — cancelar deixa o card onde estava.
 */
export function TiHistoricoModal({
  card, nome, movimento, rotulos, onFechar,
}: {
  card: CardTi; nome: string; movimento?: MovimentoTi;
  /** Rótulo de cada status do quadro (id -> "Em Progresso"). */
  rotulos: Record<string, string>;
  onFechar: () => void;
}) {
  const [historico, setHistorico] = useState<TiHistorico[] | null>(null);
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const rotulo = (s: string | null) => (s ? rotulos[s] ?? s : '—');

  // Depende de tipo/id, não do objeto `card`, que o pai recria a cada render.
  const { tipo, id } = card;
  useEffect(() => {
    let vivo = true;
    listarHistoricoTiAction({ tipo, id }).then((h) => { if (vivo) setHistorico(h); });
    return () => { vivo = false; };
  }, [tipo, id]);

  async function enviar() {
    if (!texto.trim()) {
      setErro(movimento ? 'Informe o motivo da movimentação.' : 'Escreva a anotação.');
      return;
    }
    setSalvando(true);
    setErro(null);
    const r = movimento
      ? await moverCardTiAction(card, movimento.para, texto)
      : await anotarCardTiAction(card, texto);
    setSalvando(false);
    if (r.error) { setErro(r.error); return; }
    if (movimento) { onFechar(); return; }
    // Anotação: fica aberto mostrando a entrada nova no topo da timeline.
    setTexto('');
    setHistorico(await listarHistoricoTiAction(card));
  }

  return (
    <ModalForm
      title={nome} isOpen onClose={onFechar} isLoading={salvando} maxWidth="2xl"
      onSubmit={() => enviar()} submitLabel={movimento ? 'Confirmar movimentação' : 'Registrar anotação'}
    >
      {movimento && (
        <p className="text-sm rounded-lg p-3" role="alert" style={{ border: '1px solid var(--warn)', color: 'var(--warn)' }}>
          Movendo de <strong>{rotulo(movimento.de)}</strong> para <strong>{rotulo(movimento.para)}</strong>.
          Atualize a descrição com o motivo da movimentação — sem ela o card não muda de coluna.
        </p>
      )}
      <label className="block space-y-1">
        <span className="text-sm">{movimento ? 'Motivo da movimentação' : 'Nova anotação (opcional)'}</span>
        <textarea
          className="input" rows={3} value={texto} autoFocus={!!movimento}
          required={!!movimento} onChange={(e) => setTexto(e.target.value)}
          placeholder={movimento ? 'Por que o card está mudando de coluna?' : 'O que aconteceu com este card?'}
        />
      </label>
      {erro && <p className="text-sm" style={{ color: 'var(--danger)' }}>{erro}</p>}

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Histórico</h3>
        {historico === null && <p className="text-sm" style={{ color: 'var(--text-dim)' }}>Carregando…</p>}
        {historico?.length === 0 && (
          <p className="text-sm" style={{ color: 'var(--text-dim)' }}>Nenhum registro ainda.</p>
        )}
        <ol className="space-y-3">
          {historico?.map((h) => (
            <li key={h.id} className="pl-3 text-sm space-y-0.5" style={{ borderLeft: '2px solid var(--border)' }}>
              <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
                {formatarDataHora(h.created_at)} · {h.usuario_nome}
              </p>
              <p className="font-medium">
                {h.tipo === 'movimentacao' ? `${rotulo(h.status_de)} → ${rotulo(h.status_para)}` : 'Anotação'}
              </p>
              <p className="whitespace-pre-wrap">{h.descricao}</p>
            </li>
          ))}
        </ol>
      </section>
    </ModalForm>
  );
}
