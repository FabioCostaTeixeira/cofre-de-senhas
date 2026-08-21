'use client';

import { useActionState, useEffect, useState } from 'react';
import { ModalForm } from '@/components/ModalForm';
import { TarefaCard } from '@/components/TarefaCard';
import { COLUNAS_KANBAN } from '@/lib/kanban';
import { ordenarTarefas } from '@/lib/tarefas-calc';
import type { Tarefa, Terceiro, User } from '@/lib/types';
import type { ItemDisponivel } from '@/lib/db/tarefas';

export type TarefaFormState = { error?: string; ok?: boolean };
const inicial: TarefaFormState = {};
type CriarAcao = (prev: TarefaFormState, fd: FormData) => Promise<TarefaFormState>;
type BuscarItensAcao = (clienteId: string) =>
  Promise<{ itens: ItemDisponivel[] } | { error: string }>;

/**
 * Formulário de criação, dentro do `ModalForm` padrão do projeto. Só é montado
 * enquanto o modal está aberto (`{colunaModal && <NovaTarefaModal .../>}` em
 * `KanbanBoard`) — isso é o que garante que reabrir o modal começa com o
 * `useActionState` limpo, mesmo padrão usado pra corrigir o mesmo bug em
 * Categoria/Combo/Plano/Produto.
 */
function NovaTarefaModal({
  coluna, clientes, users, criar, buscarItens, onFechar,
}: {
  coluna: string; clientes: Terceiro[]; users: User[];
  criar: CriarAcao; buscarItens: BuscarItensAcao; onFechar: () => void;
}) {
  const [state, action, pending] = useActionState(criar, inicial);
  const [clienteId, setClienteId] = useState('');
  const [itens, setItens] = useState<ItemDisponivel[]>([]);
  const [carregandoItens, setCarregandoItens] = useState(false);
  const [erroItens, setErroItens] = useState<string | null>(null);

  useEffect(() => {
    if (state.ok) onFechar();
  }, [state.ok, onFechar]);

  // Produto depende de cliente (spec §5): só carrega depois de escolher o cliente, e
  // reflete a carteira dele.
  useEffect(() => {
    if (!clienteId) {
      setItens([]);
      setErroItens(null);
      return;
    }
    let cancelado = false;
    setCarregandoItens(true);
    setErroItens(null);
    buscarItens(clienteId)
      .then((r) => {
        if (cancelado) return;
        if ('error' in r) setErroItens(r.error);
        else setItens(r.itens);
      })
      .finally(() => {
        if (!cancelado) setCarregandoItens(false);
      });
    return () => { cancelado = true; };
  }, [clienteId, buscarItens]);

  return (
    <ModalForm
      title="Nova Tarefa" isOpen onClose={onFechar}
      action={action} isLoading={pending} submitLabel="Criar"
    >
      <input type="hidden" name="coluna" value={coluna} />
      <label className="block space-y-1">
        <span className="text-sm">Cliente</span>
        <select
          name="clienteId" className="input" value={clienteId}
          onChange={(e) => setClienteId(e.target.value)} required
        >
          <option value="" disabled>Escolha…</option>
          {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </label>
      <label className="block space-y-1">
        <span className="text-sm">Responsável</span>
        <select name="responsavelId" className="input" defaultValue="">
          <option value="">Sem responsável</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </label>
      <label className="block space-y-1">
        <span className="text-sm">Produto</span>
        <select
          name="contratacaoItemId" className="input" defaultValue=""
          required disabled={!clienteId || carregandoItens}
        >
          <option value="" disabled>
            {!clienteId ? 'Escolha o cliente primeiro' : carregandoItens ? 'Carregando…' : 'Escolha…'}
          </option>
          {itens.map((i) => (
            <option key={i.contratacao_item_id} value={i.contratacao_item_id}>
              {i.produto_nome} ({i.disponivel} disponível)
            </option>
          ))}
        </select>
      </label>
      {erroItens && <p className="text-sm" style={{ color: 'var(--danger)' }}>{erroItens}</p>}
      <label className="block space-y-1">
        <span className="text-sm">Tarefa</span>
        <input name="tarefa" className="input" />
      </label>
      <label className="block space-y-1">
        <span className="text-sm">Prioridade</span>
        <input type="number" name="prioridade" className="input" defaultValue={0} />
      </label>
      <label className="block space-y-1">
        <span className="text-sm">Deadline cliente</span>
        <input type="date" name="deadlineCliente" className="input" />
      </label>
      <label className="block space-y-1">
        <span className="text-sm">Deadline tarefa</span>
        <input type="date" name="deadlineTarefa" className="input" />
      </label>
      {state.error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{state.error}</p>}
    </ModalForm>
  );
}

/**
 * Quadro Kanban do Planejamento. Seis colunas fixas (rolagem lateral, spec §1),
 * cada uma filtrando e ordenando as tarefas que recebeu por prop (Task 2:
 * `ordenarTarefas`, ajuste desc / prioridade asc / created_at asc).
 *
 * Clique no cabeçalho da coluna confirma e abre o modal de criação já com a coluna
 * de origem definida (spec §5).
 */
export function KanbanBoard({
  tarefas, clientes, users, criarTarefaAction, buscarItensDoClienteAction,
}: {
  tarefas: Tarefa[]; clientes: Terceiro[]; users: User[];
  criarTarefaAction: CriarAcao; buscarItensDoClienteAction: BuscarItensAcao;
}) {
  const [colunaModal, setColunaModal] = useState<string | null>(null);

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {COLUNAS_KANBAN.map((coluna) => {
        const daColuna = ordenarTarefas(tarefas.filter((t) => t.coluna === coluna.id));
        return (
          <section key={coluna.id} className="glass w-72 shrink-0 p-4 space-y-3">
            <h2 className="text-sm font-semibold">
              <button
                type="button" className="w-full text-left"
                onClick={() => {
                  if (confirm('Deseja incluir uma nova tarefa?')) setColunaModal(coluna.id);
                }}
              >
                {coluna.label}
              </button>
            </h2>
            {daColuna.length === 0 && (
              <p className="text-sm" style={{ color: 'var(--text-dim)' }}>Nenhuma tarefa</p>
            )}
            {daColuna.map((t) => <TarefaCard key={t.id} tarefa={t} />)}
          </section>
        );
      })}
      {colunaModal && (
        <NovaTarefaModal
          coluna={colunaModal} clientes={clientes} users={users}
          criar={criarTarefaAction} buscarItens={buscarItensDoClienteAction}
          onFechar={() => setColunaModal(null)}
        />
      )}
    </div>
  );
}
