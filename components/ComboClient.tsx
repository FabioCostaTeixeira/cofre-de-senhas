'use client';

import { useActionState, useEffect, useState } from 'react';
import { calcularSomaItens, ItemRepetidor, type OpcaoItem } from '@/components/ItemRepetidor';
import { mascararMoeda, soDigitos } from '@/lib/documentos';
import type { Combo, ItemEntrada, Produto } from '@/lib/types';

export type ComboState = { error?: string; ok?: string };
const inicial: ComboState = {};
type Acao = (prev: ComboState, fd: FormData) => Promise<ComboState>;

/**
 * Opções ativas + qualquer item já referenciado pelo combo em edição, mesmo que o
 * produto tenha sido desde então desativado/apagado — sem isso o `ItemRepetidor` não
 * acha o `valor` na lista e cai no fallback de mostrar o UUID cru (ver Fix 3 da
 * revisão final do módulo Produtos).
 */
function construirOpcoes(produtos: Produto[], item: Combo | undefined): OpcaoItem[] {
  const ativos: OpcaoItem[] = produtos
    .filter((p) => p.ativo)
    .map((p) => ({ tipo: 'produto' as const, valor: p.id, rotulo: p.nome, preco: p.preco }));
  const jaIncluidos = new Set(ativos.map((o) => `${o.tipo}:${o.valor}`));
  const referenciadosInativos: OpcaoItem[] = (item?.itens ?? [])
    .filter((i) => !jaIncluidos.has(`${i.tipo}:${i.valor}`))
    .map((i) => ({ tipo: i.tipo, valor: i.valor, rotulo: `${i.nome} (descontinuado)`, preco: 0 }));
  return [...ativos, ...referenciadosInativos];
}

function CamposComuns({
  item, produtos, itens, onItens, preco, onPreco,
}: {
  item?: Combo; produtos: Produto[]; itens: ItemEntrada[]; onItens: (i: ItemEntrada[]) => void;
  preco: string; onPreco: (v: string) => void;
}) {
  const opcoes: OpcaoItem[] = construirOpcoes(produtos, item);
  const soma = calcularSomaItens(itens, opcoes);
  return (
    <>
      {item && item.itens.length > 0 && (
        <div className="space-y-1">
          <span className="text-sm font-medium">Itens do combo</span>
          <ul className="text-sm space-y-1">
            {item.itens.map((i) => (
              <li key={`${i.tipo}:${i.valor}`} className="flex items-center gap-2">
                <span>{i.quantidade}x {i.nome}</span>
                {!i.ativo && (
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ color: 'var(--danger)', border: '1px solid var(--danger)' }}>
                    descontinuado
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-sm">Nome</span>
          <input name="nome" className="input" defaultValue={item?.nome ?? ''} required />
        </label>
        <label className="block space-y-1">
          <span className="text-sm">Preço (R$)</span>
          <input
            aria-label="Preço (R$)" name="preco" className="input" inputMode="decimal"
            value={mascararMoeda(preco)} onChange={(e) => onPreco(soDigitos(e.target.value))} required
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="ativo" defaultChecked={item?.ativo ?? true} />
          Ativo
        </label>
      </div>
      <label className="block space-y-1">
        <span className="text-sm">Descrição</span>
        <textarea name="descricao" className="input" defaultValue={item?.descricao ?? ''} />
      </label>
      <ItemRepetidor nomeCampo="itens" opcoes={opcoes} itens={itens} onChange={onItens} />
      <button type="button" className="btn" onClick={() => onPreco(String(Math.round(soma * 100)))}>
        Usar soma sugerida ({mascararMoeda(String(Math.round(soma * 100)))})
      </button>
    </>
  );
}

function FormularioNovo({ produtos, criar }: { produtos: Produto[]; criar: Acao }) {
  const [state, action, pending] = useActionState(criar, inicial);
  const [itens, setItens] = useState<ItemEntrada[]>([]);
  const [preco, setPreco] = useState('');

  useEffect(() => {
    if (state.ok) { setItens([]); setPreco(''); }
  }, [state.ok]);

  return (
    <details className="glass p-5">
      <summary className="cursor-pointer font-semibold">Novo combo</summary>
      <form action={action} className="space-y-4 mt-4">
        <CamposComuns produtos={produtos} itens={itens} onItens={setItens} preco={preco} onPreco={setPreco} />
        {state.error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{state.error}</p>}
        {state.ok && <p className="text-sm" style={{ color: 'var(--ok)' }}>{state.ok}</p>}
        <button className="btn btn-primary" disabled={pending}>Cadastrar</button>
      </form>
    </details>
  );
}

function ModalEdicao({
  item, produtos, salvar, apagar, onFechar,
}: { item: Combo; produtos: Produto[]; salvar: Acao; apagar: (id: string) => Promise<{ error?: string }>; onFechar: () => void }) {
  const [state, action, pending] = useActionState(salvar, inicial);
  const [itens, setItens] = useState<ItemEntrada[]>(item.itens.map((i) => ({ tipo: i.tipo, valor: i.valor, quantidade: i.quantidade })));
  const [preco, setPreco] = useState(String(Math.round(item.preco * 100)));
  const [erroApagar, setErroApagar] = useState<string | null>(null);

  useEffect(() => {
    if (state.ok) onFechar();
  }, [state.ok, onFechar]);

  async function apagarClique() {
    if (!confirm('Apagar este combo?')) return;
    const r = await apagar(item.id);
    if (r.error) setErroApagar(r.error);
    else onFechar();
  }

  return (
    <div className="glass p-5 space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="font-semibold flex-1">{item.nome}</h2>
        <button type="button" className="btn" onClick={onFechar}>Fechar</button>
      </div>
      <form action={action} className="space-y-4">
        <input type="hidden" name="id" value={item.id} />
        <CamposComuns item={item} produtos={produtos} itens={itens} onItens={setItens} preco={preco} onPreco={setPreco} />
        {state.error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{state.error}</p>}
        <button className="btn btn-primary" disabled={pending}>Salvar</button>
      </form>
      <button type="button" className="btn btn-danger" onClick={() => void apagarClique()}>Apagar</button>
      {erroApagar && <p className="text-sm" style={{ color: 'var(--danger)' }}>{erroApagar}</p>}
    </div>
  );
}

export function ComboClient({
  itens, produtos, criar, salvar, apagar,
}: { itens: Combo[]; produtos: Produto[]; criar: Acao; salvar: Acao; apagar: (id: string) => Promise<{ error?: string }> }) {
  const [aberto, setAberto] = useState<Combo | null>(null);
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Combos</h1>
      <FormularioNovo produtos={produtos} criar={criar} />
      <table className="w-full text-sm">
        <thead>
          <tr style={{ color: 'var(--text-dim)' }}>
            <th className="text-left p-2">Nome</th>
            <th className="text-left p-2">Itens</th>
            <th className="text-left p-2">Preço</th>
            <th className="text-left p-2">Ativo</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((c) => (
            <tr key={c.id} className="cursor-pointer" onClick={() => setAberto(c)}>
              <td className="p-2">{c.nome}</td>
              <td className="p-2">{c.itens.length}</td>
              <td className="p-2">R$ {c.preco.toFixed(2)}</td>
              <td className="p-2">{c.ativo ? 'Sim' : 'Não'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {itens.length === 0 && <p className="text-sm" style={{ color: 'var(--text-dim)' }}>Nenhum combo cadastrado.</p>}
      {aberto && <ModalEdicao key={aberto.id} item={aberto} produtos={produtos} salvar={salvar} apagar={apagar} onFechar={() => setAberto(null)} />}
    </div>
  );
}
