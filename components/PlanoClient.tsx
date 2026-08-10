'use client';

import { useActionState, useEffect, useState } from 'react';
import { calcularSomaItens, ItemRepetidor, type OpcaoItem } from '@/components/ItemRepetidor';
import { mascararMoeda, soDigitos } from '@/lib/documentos';
import type { Combo, ItemEntrada, Plano, Produto, TipoCobranca } from '@/lib/types';

export type PlanoState = { error?: string; ok?: string };
const inicial: PlanoState = {};
type Acao = (prev: PlanoState, fd: FormData) => Promise<PlanoState>;

/**
 * Opções ativas + qualquer item já referenciado pelo plano em edição, mesmo que o
 * produto/combo tenha sido desde então desativado/apagado — sem isso o `ItemRepetidor`
 * não acha o `valor` na lista e cai no fallback de mostrar o UUID cru (ver Fix 3 da
 * revisão final do módulo Produtos).
 */
function construirOpcoes(produtos: Produto[], combos: Combo[], item: Plano | undefined): OpcaoItem[] {
  const ativos: OpcaoItem[] = [
    ...produtos.filter((p) => p.ativo).map((p) => ({ tipo: 'produto' as const, valor: p.id, rotulo: p.nome, preco: p.preco })),
    ...combos.filter((c) => c.ativo).map((c) => ({ tipo: 'combo' as const, valor: c.id, rotulo: c.nome, preco: c.preco })),
  ];
  const jaIncluidos = new Set(ativos.map((o) => `${o.tipo}:${o.valor}`));
  const referenciadosInativos: OpcaoItem[] = (item?.itens ?? [])
    .filter((i) => !jaIncluidos.has(`${i.tipo}:${i.valor}`))
    .map((i) => ({ tipo: i.tipo, valor: i.valor, rotulo: `${i.nome} (descontinuado)`, preco: 0 }));
  return [...ativos, ...referenciadosInativos];
}

function CamposComuns({
  item, produtos, combos, itens, onItens, preco, onPreco, tipoCobranca, onTipoCobranca,
}: {
  item?: Plano; produtos: Produto[]; combos: Combo[]; itens: ItemEntrada[]; onItens: (i: ItemEntrada[]) => void;
  preco: string; onPreco: (v: string) => void; tipoCobranca: TipoCobranca; onTipoCobranca: (t: TipoCobranca) => void;
}) {
  const opcoes: OpcaoItem[] = construirOpcoes(produtos, combos, item);
  const soma = calcularSomaItens(itens, opcoes);
  return (
    <>
      {item && item.itens.length > 0 && (
        <div className="space-y-1">
          <span className="text-sm font-medium">Itens do plano</span>
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
          <span className="text-sm">Tipo de cobrança</span>
          <select
            aria-label="Tipo de cobrança" name="tipoCobranca" className="input" value={tipoCobranca}
            onChange={(e) => onTipoCobranca(e.target.value as TipoCobranca)}
          >
            <option value="pacote_fechado">Pacote fechado</option>
            <option value="assinatura">Assinatura (mensal)</option>
          </select>
        </label>
        {tipoCobranca === 'pacote_fechado' && (
          <label className="block space-y-1">
            <span className="text-sm">Validade (dias)</span>
            <input aria-label="Validade (dias)" name="validadeDias" className="input" type="number" defaultValue={item?.validade_dias ?? ''} required />
          </label>
        )}
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

function FormularioNovo({ produtos, combos, criar }: { produtos: Produto[]; combos: Combo[]; criar: Acao }) {
  const [state, action, pending] = useActionState(criar, inicial);
  const [itens, setItens] = useState<ItemEntrada[]>([]);
  const [preco, setPreco] = useState('');
  const [tipoCobranca, setTipoCobranca] = useState<TipoCobranca>('pacote_fechado');

  useEffect(() => {
    if (state.ok) { setItens([]); setPreco(''); }
  }, [state.ok]);

  return (
    <details className="glass p-5">
      <summary className="cursor-pointer font-semibold">Novo plano</summary>
      <form action={action} className="space-y-4 mt-4">
        <CamposComuns
          produtos={produtos} combos={combos} itens={itens} onItens={setItens} preco={preco} onPreco={setPreco}
          tipoCobranca={tipoCobranca} onTipoCobranca={setTipoCobranca}
        />
        {state.error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{state.error}</p>}
        {state.ok && <p className="text-sm" style={{ color: 'var(--ok)' }}>{state.ok}</p>}
        <button className="btn btn-primary" disabled={pending}>Cadastrar</button>
      </form>
    </details>
  );
}

function ModalEdicao({
  item, produtos, combos, salvar, apagar, onFechar,
}: {
  item: Plano; produtos: Produto[]; combos: Combo[]; salvar: Acao;
  apagar: (id: string) => Promise<{ error?: string }>; onFechar: () => void;
}) {
  const [state, action, pending] = useActionState(salvar, inicial);
  const [itens, setItens] = useState<ItemEntrada[]>(item.itens.map((i) => ({ tipo: i.tipo, valor: i.valor, quantidade: i.quantidade })));
  const [preco, setPreco] = useState(String(Math.round(item.preco * 100)));
  const [tipoCobranca, setTipoCobranca] = useState<TipoCobranca>(item.tipo_cobranca);
  const [erroApagar, setErroApagar] = useState<string | null>(null);

  useEffect(() => {
    if (state.ok) onFechar();
  }, [state.ok, onFechar]);

  async function apagarClique() {
    if (!confirm('Apagar este plano?')) return;
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
        <CamposComuns
          item={item} produtos={produtos} combos={combos} itens={itens} onItens={setItens} preco={preco} onPreco={setPreco}
          tipoCobranca={tipoCobranca} onTipoCobranca={setTipoCobranca}
        />
        {state.error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{state.error}</p>}
        <button className="btn btn-primary" disabled={pending}>Salvar</button>
      </form>
      <button type="button" className="btn btn-danger" onClick={() => void apagarClique()}>Apagar</button>
      {erroApagar && <p className="text-sm" style={{ color: 'var(--danger)' }}>{erroApagar}</p>}
    </div>
  );
}

export function PlanoClient({
  itens, produtos, combos, criar, salvar, apagar,
}: {
  itens: Plano[]; produtos: Produto[]; combos: Combo[]; criar: Acao; salvar: Acao;
  apagar: (id: string) => Promise<{ error?: string }>;
}) {
  const [aberto, setAberto] = useState<Plano | null>(null);
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Planos</h1>
      <FormularioNovo produtos={produtos} combos={combos} criar={criar} />
      <table className="w-full text-sm">
        <thead>
          <tr style={{ color: 'var(--text-dim)' }}>
            <th className="text-left p-2">Nome</th>
            <th className="text-left p-2">Cobrança</th>
            <th className="text-left p-2">Preço</th>
            <th className="text-left p-2">Ativo</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((p) => (
            <tr key={p.id} className="cursor-pointer" onClick={() => setAberto(p)}>
              <td className="p-2">{p.nome}</td>
              <td className="p-2">{p.tipo_cobranca === 'pacote_fechado' ? `${p.validade_dias} dias` : 'Mensal'}</td>
              <td className="p-2">R$ {p.preco.toFixed(2)}</td>
              <td className="p-2">{p.ativo ? 'Sim' : 'Não'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {itens.length === 0 && <p className="text-sm" style={{ color: 'var(--text-dim)' }}>Nenhum plano cadastrado.</p>}
      {aberto && (
        <ModalEdicao key={aberto.id} item={aberto} produtos={produtos} combos={combos} salvar={salvar} apagar={apagar} onFechar={() => setAberto(null)} />
      )}
    </div>
  );
}
