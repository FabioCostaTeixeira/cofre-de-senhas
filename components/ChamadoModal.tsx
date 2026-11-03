'use client';

import { useActionState, useEffect, useState } from 'react';
import { ModalForm } from '@/components/ModalForm';
import { produtoPermitidoNaCategoria } from '@/lib/produtos-regra';
import type { CategoriaProduto, Chamado, Produto, User } from '@/lib/types';

export type ChamadoState = { error?: string; ok?: boolean };
const inicial: ChamadoState = {};
type Acao = (prev: ChamadoState, fd: FormData) => Promise<ChamadoState>;

/**
 * Abrir (sem `chamado`) ou editar um chamado do quadro Working › Projetos. Só montado com
 * o modal aberto, então reabrir começa com o `useActionState` limpo. Categoria e produto
 * seguem a regra da OS, só que restrita às categorias do quadro de Projetos; com uma única
 * opção (o caso normal: Projeto › Chamado), ela já vem escolhida.
 */
export function ChamadoModal({
  chamado, categorias, produtos, users, salvar, apagar, onFechar,
}: {
  chamado?: Chamado; categorias: CategoriaProduto[]; produtos: Produto[]; users: User[];
  salvar: Acao; apagar?: (id: string) => Promise<{ error?: string }>; onFechar: () => void;
}) {
  const [state, action, pending] = useActionState(salvar, inicial);
  const [erroApagar, setErroApagar] = useState<string | null>(null);

  useEffect(() => { if (state.ok) onFechar(); }, [state.ok, onFechar]);

  const doQuadro = categorias.filter((c) => c.planejamento === 'projeto' && (c.ativo || c.id === chamado?.categoria_id));
  const [categoriaId, setCategoriaId] = useState(chamado?.categoria_id ?? (doQuadro.length === 1 ? doQuadro[0].id : ''));
  const escolhida = categorias.find((c) => c.id === categoriaId);
  const produtosDaCategoria = escolhida
    ? produtos.filter((p) => {
        const doProduto = categorias.find((c) => c.id === p.categoria_id);
        return (p.ativo || p.id === chamado?.produto_id) && !!doProduto && produtoPermitidoNaCategoria(doProduto, escolhida);
      })
    : [];
  const [produtoId, setProdutoId] = useState(chamado?.produto_id ?? '');
  const produtoEfetivo = produtoId || (produtosDaCategoria.length === 1 ? produtosDaCategoria[0].id : '');

  // Usuário desativado some da lista, a não ser que já seja o responsável deste chamado.
  const opcoes = users.filter((u) => u.is_active || u.id === chamado?.responsavel_id);

  async function apagarClique() {
    if (!chamado || !apagar || !confirm('Excluir este chamado?')) return;
    const r = await apagar(chamado.id);
    if (r.error) setErroApagar(r.error);
    else onFechar();
  }

  return (
    <ModalForm
      title={chamado ? 'Editar chamado' : 'Novo chamado'} isOpen onClose={onFechar} action={action}
      isLoading={pending} submitLabel={chamado ? 'Salvar' : 'Abrir chamado'}
    >
      {chamado && <input type="hidden" name="id" value={chamado.id} />}
      <label className="block space-y-1">
        <span className="text-sm">Categoria</span>
        <select
          name="categoriaId" className="input" value={categoriaId} required
          // Produto escolhido pertence à categoria anterior: trocar a categoria o descarta.
          onChange={(e) => { setCategoriaId(e.target.value); setProdutoId(''); }}
        >
          <option value="" disabled>Escolha…</option>
          {doQuadro.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </label>
      {doQuadro.length === 0 && (
        <p className="text-sm" style={{ color: 'var(--warn)' }}>
          Nenhuma categoria com planejamento “Projetos” cadastrada.
        </p>
      )}
      <label className="block space-y-1">
        <span className="text-sm">Produto</span>
        <select
          name="produtoId" className="input" value={produtoEfetivo} required disabled={!categoriaId}
          onChange={(e) => setProdutoId(e.target.value)}
        >
          <option value="" disabled>{categoriaId ? 'Escolha…' : 'Escolha a categoria primeiro'}</option>
          {produtosDaCategoria.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
      </label>
      <label className="block space-y-1">
        <span className="text-sm">Responsável</span>
        <select name="responsavelId" className="input" defaultValue={chamado?.responsavel_id ?? ''} required>
          <option value="" disabled>Escolha…</option>
          {opcoes.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </label>
      <label className="block space-y-1">
        <span className="text-sm">Título</span>
        <input name="titulo" className="input" defaultValue={chamado?.titulo ?? ''} required />
      </label>
      <label className="block space-y-1">
        <span className="text-sm">Descrição</span>
        <textarea name="descricao" className="input" rows={4} defaultValue={chamado?.descricao ?? ''} />
      </label>
      {state.error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{state.error}</p>}
      {erroApagar && <p className="text-sm" style={{ color: 'var(--danger)' }}>{erroApagar}</p>}
      {chamado && apagar && (
        <button type="button" className="btn btn-danger" disabled={pending} onClick={() => void apagarClique()}>
          Excluir chamado
        </button>
      )}
    </ModalForm>
  );
}
