'use client';

import { useActionState, useEffect, useState } from 'react';
import { mascararMoeda, soDigitos } from '@/lib/documentos';
import type { AtributoMolde, CategoriaProduto, Produto, ValorAtributo } from '@/lib/types';

export type ProdutoState = { error?: string; ok?: string };
const inicial: ProdutoState = {};
type Acao = (prev: ProdutoState, fd: FormData) => Promise<ProdutoState>;

function CampoAtributo({
  campo, valor, onChange,
}: { campo: AtributoMolde; valor: ValorAtributo | undefined; onChange: (v: ValorAtributo) => void }) {
  const nome = `attr_${campo.chave}`;
  const ariaLabel = `${campo.rotulo}${campo.obrigatorio ? ' *' : ''}`;
  if (campo.tipo === 'booleano') {
    return (
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name={nome} checked={Boolean(valor)} onChange={(e) => onChange(e.target.checked)} />
        {campo.rotulo}
        {campo.obrigatorio && ' *'}
      </label>
    );
  }
  return (
    <label className="block space-y-1">
      <span className="text-sm">{campo.rotulo}{campo.obrigatorio && ' *'}</span>
      <input
        aria-label={ariaLabel} name={nome} className="input" type={campo.tipo === 'numero' ? 'number' : 'text'}
        value={valor === undefined ? '' : String(valor)} required={campo.obrigatorio}
        // Mantém o valor local sempre como string (mesmo pra "numero"): `Number('')` é
        // `0`, então convertendo aqui um campo obrigatório apagado nunca voltaria a
        // "vazio" e salvaria 0 em silêncio em vez de disparar a validação de
        // "informe X". A conversão pra número de verdade fica só em
        // `lerValorAtributo` (lib/produtos-form.ts), que já trata string vazia como
        // "não informado".
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function CamposComuns({
  item, categorias, categoriaId, onCategoriaId, atributos, onAtributo, preco, onPreco,
}: {
  item?: Produto; categorias: CategoriaProduto[]; categoriaId: string; onCategoriaId: (id: string) => void;
  atributos: Record<string, ValorAtributo>; onAtributo: (chave: string, valor: ValorAtributo) => void;
  preco: string; onPreco: (v: string) => void;
}) {
  const categoria = categorias.find((c) => c.id === categoriaId);
  const opcoes = categorias.filter((c) => c.ativo || c.id === categoriaId);
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-sm">Nome</span>
          <input name="nome" className="input" defaultValue={item?.nome ?? ''} required />
        </label>
        <label className="block space-y-1">
          <span className="text-sm">Categoria</span>
          <select name="categoriaId" className="input" value={categoriaId} onChange={(e) => onCategoriaId(e.target.value)}>
            {opcoes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
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
      {categoria && categoria.atributos_molde.length > 0 && (
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Detalhes de {categoria.nome}</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            {categoria.atributos_molde.map((campo) => (
              <CampoAtributo
                key={campo.chave} campo={campo} valor={atributos[campo.chave]}
                onChange={(v) => onAtributo(campo.chave, v)}
              />
            ))}
          </div>
        </fieldset>
      )}
    </>
  );
}

function FormularioNovo({ categorias, criar, isModalOpen }: { categorias: CategoriaProduto[]; criar: Acao; isModalOpen: boolean }) {
  const [state, action, pending] = useActionState(criar, inicial);
  const [categoriaId, setCategoriaId] = useState(categorias[0]?.id ?? '');
  const [atributos, setAtributos] = useState<Record<string, ValorAtributo>>({});
  const [preco, setPreco] = useState('');
  const [detalhesAberto, setDetalhesAberto] = useState(true);

  useEffect(() => {
    if (state.ok) { setAtributos({}); setPreco(''); }
  }, [state.ok]);

  useEffect(() => {
    if (isModalOpen) setDetalhesAberto(false);
  }, [isModalOpen]);

  if (isModalOpen) return null;

  return (
    <div className="glass p-5">
      <div className="cursor-pointer font-semibold mb-4" onClick={() => setDetalhesAberto(!detalhesAberto)}>
        Novo produto
      </div>
      {detalhesAberto && (
        <form action={action} className="space-y-4">
          <CamposComuns
            categorias={categorias} categoriaId={categoriaId} onCategoriaId={setCategoriaId}
            atributos={atributos} onAtributo={(chave, valor) => setAtributos({ ...atributos, [chave]: valor })}
            preco={preco} onPreco={setPreco}
          />
          {state.error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{state.error}</p>}
          {state.ok && <p className="text-sm" style={{ color: 'var(--ok)' }}>{state.ok}</p>}
          <button className="btn btn-primary" disabled={pending}>Cadastrar</button>
        </form>
      )}
    </div>
  );
}

/**
 * Os atributos vindos do produto salvo trazem "numero" como `number` de verdade
 * (é o que fica no banco). O estado local do formulário representa "numero" sempre
 * como string (ver `CampoAtributo`), então precisa converter uma vez ao carregar —
 * senão o valor pré-preenchido teria um tipo diferente do que o campo produz depois
 * de qualquer edição.
 */
function normalizarAtributosParaEdicao(
  atributos: Record<string, ValorAtributo>, molde: AtributoMolde[],
): Record<string, ValorAtributo> {
  const normalizados = { ...atributos };
  for (const campo of molde) {
    const valor = normalizados[campo.chave];
    if (campo.tipo === 'numero' && typeof valor === 'number') {
      normalizados[campo.chave] = String(valor);
    }
  }
  return normalizados;
}

function ModalEdicao({
  item, categorias, salvar, apagar, onFechar,
}: {
  item: Produto; categorias: CategoriaProduto[]; salvar: Acao;
  apagar: (id: string) => Promise<{ error?: string }>; onFechar: () => void;
}) {
  const [state, action, pending] = useActionState(salvar, inicial);
  const [categoriaId, setCategoriaId] = useState(item.categoria_id);
  const [atributos, setAtributos] = useState<Record<string, ValorAtributo>>(() => normalizarAtributosParaEdicao(
    item.atributos, categorias.find((c) => c.id === item.categoria_id)?.atributos_molde ?? [],
  ));
  const [preco, setPreco] = useState(String(Math.round(item.preco * 100)));
  const [erroApagar, setErroApagar] = useState<string | null>(null);

  useEffect(() => {
    if (state.ok) onFechar();
  }, [state.ok, onFechar]);

  async function apagarClique() {
    if (!confirm('Apagar este produto?')) return;
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
          item={item} categorias={categorias} categoriaId={categoriaId} onCategoriaId={setCategoriaId}
          atributos={atributos} onAtributo={(chave, valor) => setAtributos({ ...atributos, [chave]: valor })}
          preco={preco} onPreco={setPreco}
        />
        {state.error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{state.error}</p>}
        <button className="btn btn-primary" disabled={pending}>Salvar</button>
      </form>
      <button type="button" className="btn btn-danger" onClick={() => void apagarClique()}>Apagar</button>
      {erroApagar && <p className="text-sm" style={{ color: 'var(--danger)' }}>{erroApagar}</p>}
    </div>
  );
}

export function ProdutoClient({
  itens, categorias, criar, salvar, apagar,
}: {
  itens: Produto[]; categorias: CategoriaProduto[]; criar: Acao; salvar: Acao;
  apagar: (id: string) => Promise<{ error?: string }>;
}) {
  const [aberto, setAberto] = useState<Produto | null>(null);
  const nomeCategoria = (id: string) => categorias.find((c) => c.id === id)?.nome ?? '—';
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Produtos</h1>
      {categorias.length === 0
        ? <p className="text-sm" style={{ color: 'var(--text-dim)' }}>Cadastre uma categoria antes de criar um produto.</p>
        : <FormularioNovo categorias={categorias} criar={criar} isModalOpen={aberto !== null} />}
      <table className="w-full text-sm">
        <thead>
          <tr style={{ color: 'var(--text-dim)' }}>
            <th className="text-left p-2">Nome</th>
            <th className="text-left p-2">Categoria</th>
            <th className="text-left p-2">Preço</th>
            <th className="text-left p-2">Ativo</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((p) => (
            <tr key={p.id} className="cursor-pointer" onClick={() => setAberto(p)}>
              <td className="p-2">{p.nome}</td>
              <td className="p-2">{nomeCategoria(p.categoria_id)}</td>
              <td className="p-2">R$ {p.preco.toFixed(2)}</td>
              <td className="p-2">{p.ativo ? 'Sim' : 'Não'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {itens.length === 0 && <p className="text-sm" style={{ color: 'var(--text-dim)' }}>Nenhum produto cadastrado.</p>}
      {aberto && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pt-16"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setAberto(null); }}
        >
          <div className="w-full max-w-2xl">
            <ModalEdicao key={aberto.id} item={aberto} categorias={categorias} salvar={salvar} apagar={apagar} onFechar={() => setAberto(null)} />
          </div>
        </div>
      )}
    </div>
  );
}
