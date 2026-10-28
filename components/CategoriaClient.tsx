'use client';

import { useActionState, useEffect, useState } from 'react';
import type { AtributoMolde, CategoriaProduto, TipoAtributo } from '@/lib/types';
import { ModalForm } from '@/components/ModalForm';
import { PLANEJAMENTOS } from '@/lib/kanban';

export type CategoriaState = { error?: string; ok?: string };
const inicial: CategoriaState = {};
type Acao = (prev: CategoriaState, fd: FormData) => Promise<CategoriaState>;

function MoldeEditor({ molde, onChange }: { molde: AtributoMolde[]; onChange: (m: AtributoMolde[]) => void }) {
  function atualizar(i: number, campo: Partial<AtributoMolde>) {
    onChange(molde.map((m, idx) => (idx === i ? { ...m, ...campo } : m)));
  }
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">Atributos desta categoria</legend>
      {molde.map((m, i) => (
        <div key={i} className="grid gap-2 sm:grid-cols-5 items-end">
          <label className="block space-y-1">
            <span className="text-xs">Chave</span>
            <input className="input" value={m.chave} onChange={(e) => atualizar(i, { chave: e.target.value })} />
          </label>
          <label className="block space-y-1">
            <span className="text-xs">Rótulo</span>
            <input className="input" value={m.rotulo} onChange={(e) => atualizar(i, { rotulo: e.target.value })} />
          </label>
          <label className="block space-y-1">
            <span className="text-xs">Tipo</span>
            <select className="input" value={m.tipo} onChange={(e) => atualizar(i, { tipo: e.target.value as TipoAtributo })}>
              <option value="texto">Texto</option>
              <option value="numero">Número</option>
              <option value="booleano">Sim/Não</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={m.obrigatorio} onChange={(e) => atualizar(i, { obrigatorio: e.target.checked })} />
            Obrigatório
          </label>
          <button type="button" className="btn" onClick={() => onChange(molde.filter((_, idx) => idx !== i))}>
            Remover
          </button>
        </div>
      ))}
      <button
        type="button" className="btn"
        onClick={() => onChange([...molde, { chave: '', rotulo: '', tipo: 'texto', obrigatorio: false }])}
      >
        + Adicionar atributo
      </button>
    </fieldset>
  );
}

function CamposComuns({
  item, molde, onMolde,
}: { item?: CategoriaProduto; molde: AtributoMolde[]; onMolde: (m: AtributoMolde[]) => void }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-sm">Nome</span>
          <input name="nome" className="input" defaultValue={item?.nome ?? ''} required />
        </label>
        <label className="block space-y-1">
          <span className="text-sm">Unidade de consumo</span>
          <input name="unidadeConsumo" className="input" defaultValue={item?.unidade_consumo ?? ''} placeholder="ex.: gravação, corte" />
        </label>
        <label className="block space-y-1">
          <span className="text-sm">Planejamento</span>
          <select name="planejamento" className="input" defaultValue={item?.planejamento ?? 'edicao'}>
            {PLANEJAMENTOS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="ativo" defaultChecked={item?.ativo ?? true} />
          Ativa
        </label>
      </div>
      <MoldeEditor molde={molde} onChange={onMolde} />
      <input type="hidden" name="atributosMolde" value={JSON.stringify(molde)} />
    </>
  );
}

function FormularioNovo({ criar, onClose }: { criar: Acao; onClose: () => void }) {
  const [state, action, pending] = useActionState(criar, inicial);
  const [molde, setMolde] = useState<AtributoMolde[]>([]);

  useEffect(() => {
    if (state.ok) {
      setMolde([]);
      onClose();
    }
  }, [state.ok, onClose]);

  return (
    <ModalForm title="Nova Categoria" isOpen onClose={onClose} action={action} isLoading={pending} submitLabel="Criar" maxWidth="2xl">
      <CamposComuns molde={molde} onMolde={setMolde} />
      {state.error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{state.error}</p>}
      {state.ok && <p className="text-sm" style={{ color: 'var(--ok)' }}>{state.ok}</p>}
    </ModalForm>
  );
}

function ModalEdicao({
  item, salvar, apagar, onFechar,
}: { item: CategoriaProduto; salvar: Acao; apagar: (id: string) => Promise<{ error?: string }>; onFechar: () => void }) {
  const [state, action, pending] = useActionState(salvar, inicial);
  const [molde, setMolde] = useState<AtributoMolde[]>(item.atributos_molde);
  const [erroApagar, setErroApagar] = useState<string | null>(null);

  useEffect(() => {
    if (state.ok) onFechar();
  }, [state.ok, onFechar]);

  async function apagarClique() {
    if (!confirm('Apagar esta categoria?')) return;
    const r = await apagar(item.id);
    if (r.error) setErroApagar(r.error);
    else onFechar();
  }

  return (
    <ModalForm title="Editar Categoria" isOpen onClose={onFechar} action={action} isLoading={pending} submitLabel="Salvar" maxWidth="2xl">
      <input type="hidden" name="id" value={item.id} />
      <CamposComuns item={item} molde={molde} onMolde={setMolde} />
      {state.error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{state.error}</p>}
      <button type="button" className="btn btn-danger" onClick={() => void apagarClique()}>Apagar</button>
      {erroApagar && <p className="text-sm" style={{ color: 'var(--danger)' }}>{erroApagar}</p>}
    </ModalForm>
  );
}

export function CategoriaClient({
  itens, criar, salvar, apagar,
}: { itens: CategoriaProduto[]; criar: Acao; salvar: Acao; apagar: (id: string) => Promise<{ error?: string }> }) {
  const [aberto, setAberto] = useState<CategoriaProduto | null>(null);
  const [novoAberto, setNovoAberto] = useState(false);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Categorias de Produto</h1>
        <button type="button" className="btn btn-primary" onClick={() => setNovoAberto(true)}>Nova Categoria</button>
      </div>
      {novoAberto && <FormularioNovo criar={criar} onClose={() => setNovoAberto(false)} />}
      <table className="w-full text-sm">
        <thead>
          <tr style={{ color: 'var(--text-dim)' }}>
            <th className="text-left p-2">Nome</th>
            <th className="text-left p-2">Unidade</th>
            <th className="text-left p-2">Atributos</th>
            <th className="text-left p-2">Planejamento</th>
            <th className="text-left p-2">Ativa</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((c) => (
            <tr key={c.id} className="cursor-pointer" onClick={() => setAberto(c)}>
              <td className="p-2">{c.nome}</td>
              <td className="p-2">{c.unidade_consumo ?? '—'}</td>
              <td className="p-2">{c.atributos_molde.length}</td>
              <td className="p-2">{PLANEJAMENTOS.find((p) => p.id === c.planejamento)?.label ?? '—'}</td>
              <td className="p-2">{c.ativo ? 'Sim' : 'Não'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {itens.length === 0 && <p className="text-sm" style={{ color: 'var(--text-dim)' }}>Nenhuma categoria cadastrada.</p>}
      {aberto && (
        <ModalEdicao key={aberto.id} item={aberto} salvar={salvar} apagar={apagar} onFechar={() => setAberto(null)} />
      )}
    </div>
  );
}
