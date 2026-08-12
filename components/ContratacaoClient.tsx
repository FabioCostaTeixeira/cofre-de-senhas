'use client';

import { useActionState, useEffect, useState } from 'react';
import type { Combo, Contratacao, Plano, Produto, Terceiro, TipoContratacao } from '@/lib/types';

export type ContratacaoState = { error?: string; ok?: string };
const inicial: ContratacaoState = {};
type Acao = (prev: ContratacaoState, fd: FormData) => Promise<ContratacaoState>;

const ROTULOS_TIPO: Record<TipoContratacao, string> = { avulso: 'Avulso', combo: 'Combo', plano: 'Plano' };

function Formulario({
  clientes, produtos, combos, planos, criar, abertoPorPadrao,
}: {
  clientes: Terceiro[]; produtos: Produto[]; combos: Combo[]; planos: Plano[]; criar: Acao;
  abertoPorPadrao: boolean;
}) {
  const [state, action, pending] = useActionState(criar, inicial);
  const [tipo, setTipo] = useState<TipoContratacao>('avulso');
  const [itemId, setItemId] = useState('');
  const [quantidade, setQuantidade] = useState('1');
  // Aberto por padrão só quando ainda não há nenhuma contratação (guia o primeiro uso);
  // com a lista já povoada, o formulário some pra não duplicar nome de cliente/item que
  // já aparece na tabela abaixo — o próprio usuário reabre clicando no <summary>.
  const [aberto, setAberto] = useState(abertoPorPadrao);

  const opcoes: { id: string; nome: string; preco: number }[] =
    tipo === 'avulso' ? produtos.filter((p) => p.ativo)
      : tipo === 'combo' ? combos.filter((c) => c.ativo)
        : planos.filter((p) => p.ativo);

  const itemEscolhido = opcoes.find((o) => o.id === itemId);
  const precoTotal = (itemEscolhido?.preco ?? 0) * (Number(quantidade) || 0);
  const campoItem = tipo === 'avulso' ? 'produtoId' : tipo === 'combo' ? 'comboId' : 'planoId';
  const rotuloItem = tipo === 'avulso' ? 'Produto' : tipo === 'combo' ? 'Combo' : 'Plano';

  useEffect(() => { setItemId(''); }, [tipo]);
  useEffect(() => {
    if (state.ok) { setTipo('avulso'); setItemId(''); setQuantidade('1'); }
  }, [state.ok]);

  return (
    <details
      className="glass p-5" open={aberto}
      onToggle={(e) => setAberto(e.currentTarget.open)}
    >
      <summary className="cursor-pointer font-semibold">Nova contratação</summary>
      {aberto && (
        <form action={action} className="space-y-4 mt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-sm">Cliente</span>
              <select name="clienteId" className="input" defaultValue="" required>
                <option value="" disabled>Escolha…</option>
                {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-sm">Tipo</span>
              <select
                aria-label="Tipo" name="tipo" className="input" value={tipo}
                onChange={(e) => setTipo(e.target.value as TipoContratacao)}
              >
                <option value="avulso">Avulso</option>
                <option value="combo">Combo</option>
                <option value="plano">Plano</option>
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-sm">{rotuloItem}</span>
              <select
                aria-label={rotuloItem} name={campoItem} className="input" value={itemId}
                onChange={(e) => setItemId(e.target.value)} required
              >
                <option value="" disabled>Escolha…</option>
                {opcoes.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-sm">Quantidade</span>
              <input
                aria-label="Quantidade" type="number" name="quantidade" className="input" min={1} step={1}
                value={quantidade} onChange={(e) => setQuantidade(e.target.value)} required
              />
            </label>
          </div>
          <p className="text-sm" style={{ color: 'var(--text-dim)' }}>Total: R$ {precoTotal.toFixed(2)}</p>
          {state.error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{state.error}</p>}
          {state.ok && <p className="text-sm" style={{ color: 'var(--ok)' }}>{state.ok}</p>}
          <button className="btn btn-primary" disabled={pending}>Contratar</button>
        </form>
      )}
    </details>
  );
}

function Lista({
  itens, busca, apagar,
}: { itens: Contratacao[]; busca: string; apagar: (id: string) => Promise<{ error?: string }> }) {
  const [erro, setErro] = useState<string | null>(null);
  const [cancelando, setCancelando] = useState<string | null>(null);

  const buscaNormalizada = busca.trim().toLowerCase();
  const itensFiltrados = buscaNormalizada
    ? itens.filter((c) => c.cliente_nome.toLowerCase().includes(buscaNormalizada))
    : itens;

  async function cancelarClique(id: string) {
    if (!confirm('Cancelar esta contratação?')) return;
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
            <th className="text-left p-2">Tipo</th>
            <th className="text-left p-2">Item</th>
            <th className="text-left p-2">Qtd</th>
            <th className="text-left p-2">Total</th>
            <th className="text-left p-2">Validade</th>
            <th className="text-left p-2">Status</th>
            <th className="text-left p-2">Saldo</th>
            <th className="p-2" />
          </tr>
        </thead>
        <tbody>
          {itensFiltrados.map((c) => (
            <tr key={c.id}>
              <td className="p-2">{c.cliente_nome}</td>
              <td className="p-2">{ROTULOS_TIPO[c.tipo]}</td>
              <td className="p-2">{c.item_nome}</td>
              <td className="p-2">{c.quantidade}</td>
              <td className="p-2">R$ {c.preco_total.toFixed(2)}</td>
              <td className="p-2">
                {c.data_validade ? `${c.data_validade.slice(8, 10)}/${c.data_validade.slice(5, 7)}/${c.data_validade.slice(0, 4)}` : '—'}
              </td>
              <td className="p-2">{c.cancelada ? 'Cancelada' : 'Ativa'}</td>
              <td className="p-2">
                {c.itens.map((i) => (
                  <div key={i.produto_id}>
                    {i.produto_nome}: <span>{`${i.quantidade_total - i.quantidade_consumida}/${i.quantidade_total}`}</span>
                  </div>
                ))}
              </td>
              <td className="p-2">
                {!c.cancelada && (
                  <button
                    type="button" className="btn btn-danger" disabled={cancelando === c.id}
                    onClick={() => void cancelarClique(c.id)}
                  >
                    Cancelar
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {itensFiltrados.length === 0 && (
        <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
          {buscaNormalizada ? 'Nenhuma contratação encontrada.' : 'Nenhuma contratação cadastrada.'}
        </p>
      )}
      {erro && <p className="text-sm" style={{ color: 'var(--danger)' }}>{erro}</p>}
    </div>
  );
}

export function ContratacaoClient({
  itens, clientes, produtos, combos, planos, criar, apagar,
}: {
  itens: Contratacao[]; clientes: Terceiro[]; produtos: Produto[]; combos: Combo[]; planos: Plano[];
  criar: Acao; apagar: (id: string) => Promise<{ error?: string }>;
}) {
  const [busca, setBusca] = useState('');

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Contratações</h1>
      <Formulario
        clientes={clientes} produtos={produtos} combos={combos} planos={planos} criar={criar}
        abertoPorPadrao={itens.length === 0}
      />
      <label className="block space-y-1">
        <span className="text-sm">Buscar cliente</span>
        <input
          type="text"
          aria-label="Buscar cliente"
          className="input"
          style={{ width: 'auto' }}
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Nome do cliente"
        />
      </label>
      <Lista itens={itens} busca={busca} apagar={apagar} />
    </div>
  );
}
