'use client';

import { useActionState, useEffect, useState } from 'react';
import { formatarDataHora } from '@/lib/formato';
import type { LocalGravacao, OrdemServico, Produto, Terceiro } from '@/lib/types';

export type OSState = { error?: string; ok?: string };
const inicial: OSState = {};
type Acao = (prev: OSState, fd: FormData) => Promise<OSState>;

type LinhaOS = {
  produtoId: string;
  quantidade: string;
  preAgendar: boolean;
  data: string;
  horaInicio: string;
  horaFim: string;
  localId: string;
  estudioId: string;
};

function linhaVazia(): LinhaOS {
  return { produtoId: '', quantidade: '1', preAgendar: false, data: '', horaInicio: '', horaFim: '', localId: '', estudioId: '' };
}

function serializarItens(linhas: LinhaOS[]): string {
  return JSON.stringify(linhas.map((l) => ({
    produto_id: l.produtoId,
    quantidade: Number(l.quantidade) || 0,
    pre_agendar: l.preAgendar,
    data: l.preAgendar ? l.data : null,
    hora_inicio: l.preAgendar ? l.horaInicio : null,
    hora_fim: l.preAgendar ? l.horaFim : null,
    local_id: l.preAgendar ? l.localId : null,
    estudio_id: l.preAgendar ? l.estudioId : null,
  })));
}

function LinhaFormulario({
  linha, index, produtos, locais, onChange, onRemover,
}: {
  linha: LinhaOS; index: number; produtos: Produto[]; locais: LocalGravacao[];
  onChange: (i: number, campo: Partial<LinhaOS>) => void; onRemover: (i: number) => void;
}) {
  const localAtual = locais.find((l) => l.id === linha.localId);

  return (
    <div className="glass p-4 space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block space-y-1">
          <span className="text-sm">Produto</span>
          <select
            aria-label={`Produto ${index + 1}`} className="input" value={linha.produtoId}
            onChange={(e) => onChange(index, { produtoId: e.target.value })} required
          >
            <option value="" disabled>Escolha…</option>
            {produtos.filter((p) => p.ativo).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-sm">Quantidade</span>
          <input
            aria-label={`Quantidade ${index + 1}`} type="number" className="input" min={1} step={1}
            value={linha.quantidade} onChange={(e) => onChange(index, { quantidade: e.target.value })} required
          />
        </label>
        <label className="flex items-end gap-2 text-sm pb-2">
          <input
            type="checkbox" aria-label={`Pré-agendar item ${index + 1}`} checked={linha.preAgendar}
            onChange={(e) => onChange(index, { preAgendar: e.target.checked })}
          />
          Pré-agendar?
        </label>
      </div>
      {linha.preAgendar && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-sm">Local de gravação</span>
            <select
              aria-label={`Local ${index + 1}`} className="input" value={linha.localId}
              onChange={(e) => onChange(index, { localId: e.target.value, estudioId: '' })} required
            >
              <option value="" disabled>Escolha…</option>
              {locais.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-sm">Estúdio</span>
            <select
              aria-label={`Estúdio ${index + 1}`} className="input" value={linha.estudioId}
              onChange={(e) => onChange(index, { estudioId: e.target.value })} required
            >
              <option value="" disabled>Escolha…</option>
              {(localAtual?.estudios ?? []).map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-sm">Data</span>
            <input
              aria-label={`Data ${index + 1}`} type="date" className="input"
              value={linha.data} onChange={(e) => onChange(index, { data: e.target.value })} required
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-sm">Início</span>
              <input
                aria-label={`Início ${index + 1}`} type="time" step={900} className="input"
                value={linha.horaInicio} onChange={(e) => onChange(index, { horaInicio: e.target.value })} required
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm">Fim</span>
              <input
                aria-label={`Fim ${index + 1}`} type="time" step={900} className="input"
                value={linha.horaFim} onChange={(e) => onChange(index, { horaFim: e.target.value })} required
              />
            </label>
          </div>
        </div>
      )}
      <button type="button" className="btn btn-danger" onClick={() => onRemover(index)}>Remover item</button>
    </div>
  );
}

function Formulario({
  clientes, produtos, locais, criar, abertoPorPadrao,
}: {
  clientes: Terceiro[]; produtos: Produto[]; locais: LocalGravacao[]; criar: Acao;
  abertoPorPadrao: boolean;
}) {
  const [state, action, pending] = useActionState(criar, inicial);
  const [clienteId, setClienteId] = useState('');
  const [linhas, setLinhas] = useState<LinhaOS[]>([linhaVazia()]);
  // Aberto por padrão só quando ainda não há nenhuma OS (guia o primeiro uso); com a lista
  // já povoada, o formulário some pra não duplicar nome de cliente/produto que já aparece na
  // tabela abaixo — o próprio usuário reabre clicando no <summary> (mesmo padrão de
  // ContratacaoClient, ver nota no teste).
  const [aberto, setAberto] = useState(abertoPorPadrao);

  function atualizarLinha(i: number, campo: Partial<LinhaOS>) {
    setLinhas((atual) => atual.map((l, idx) => (idx === i ? { ...l, ...campo } : l)));
  }
  function removerLinha(i: number) {
    setLinhas((atual) => atual.filter((_, idx) => idx !== i));
  }

  useEffect(() => {
    if (state.ok) { setClienteId(''); setLinhas([linhaVazia()]); }
  }, [state.ok]);

  return (
    <details className="glass p-5" open={aberto} onToggle={(e) => setAberto(e.currentTarget.open)}>
      <summary className="cursor-pointer font-semibold">Nova ordem de serviço</summary>
      {aberto && (
        <form action={action} className="space-y-4 mt-4">
          <input type="hidden" name="itens" value={serializarItens(linhas)} />
          <label className="block space-y-1">
            <span className="text-sm">Cliente</span>
            <select name="clienteId" className="input" value={clienteId} onChange={(e) => setClienteId(e.target.value)} required>
              <option value="" disabled>Escolha…</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </label>
          <div className="space-y-3">
            {linhas.map((linha, i) => (
              <LinhaFormulario
                key={i} linha={linha} index={i} produtos={produtos} locais={locais}
                onChange={atualizarLinha} onRemover={removerLinha}
              />
            ))}
          </div>
          <button type="button" className="btn" onClick={() => setLinhas((atual) => [...atual, linhaVazia()])}>
            + Adicionar item
          </button>
          {state.error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{state.error}</p>}
          {state.ok && <p className="text-sm" style={{ color: 'var(--ok)' }}>{state.ok}</p>}
          <button className="btn btn-primary" disabled={pending}>Confirmar OS</button>
        </form>
      )}
    </details>
  );
}

function Lista({ itens, apagar }: { itens: OrdemServico[]; apagar: (id: string) => Promise<{ error?: string }> }) {
  const [erro, setErro] = useState<string | null>(null);
  const [cancelando, setCancelando] = useState<string | null>(null);

  async function cancelarClique(id: string) {
    if (!confirm('Cancelar esta ordem de serviço?')) return;
    setCancelando(id);
    const r = await apagar(id);
    setCancelando(null);
    if (r.error) setErro(r.error);
  }

  return (
    <div className="space-y-2">
      <table className="w-full text-sm">
        <thead>
          <tr style={{ color: 'var(--text-dim)' }}>
            <th className="text-left p-2">Cliente</th>
            <th className="text-left p-2">Itens</th>
            <th className="text-left p-2">Criada em</th>
            <th className="p-2" />
          </tr>
        </thead>
        <tbody>
          {itens.map((os) => (
            <tr key={os.id}>
              <td className="p-2">{os.cliente_nome}</td>
              <td className="p-2">
                {os.itens.map((i) => (
                  <div key={i.produto_id}>
                    {i.quantidade}x {i.produto_nome}{i.pre_agendar ? ' (pré-agendado)' : ''}
                  </div>
                ))}
              </td>
              <td className="p-2">{formatarDataHora(os.created_at)}</td>
              <td className="p-2">
                <button
                  type="button" className="btn btn-danger" disabled={cancelando === os.id}
                  onClick={() => void cancelarClique(os.id)}
                >
                  Cancelar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {itens.length === 0 && <p className="text-sm" style={{ color: 'var(--text-dim)' }}>Nenhuma ordem de serviço cadastrada.</p>}
      {erro && <p className="text-sm" style={{ color: 'var(--danger)' }}>{erro}</p>}
    </div>
  );
}

export function OSClient({
  itens, clientes, produtos, locais, criar, apagar,
}: {
  itens: OrdemServico[]; clientes: Terceiro[]; produtos: Produto[]; locais: LocalGravacao[];
  criar: Acao; apagar: (id: string) => Promise<{ error?: string }>;
}) {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Ordens de Serviço</h1>
      <Formulario clientes={clientes} produtos={produtos} locais={locais} criar={criar} abertoPorPadrao={itens.length === 0} />
      <Lista itens={itens} apagar={apagar} />
    </div>
  );
}
