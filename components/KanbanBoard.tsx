'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext, PointerSensor, useDroppable, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, arrayMove, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ModalForm } from '@/components/ModalForm';
import { TarefaCard } from '@/components/TarefaCard';
import { COLUNAS_KANBAN, type ColunaKanban } from '@/lib/kanban';
import { ordenarTarefas } from '@/lib/tarefas-calc';
import type { Tarefa, Terceiro, User } from '@/lib/types';
import type { ItemDisponivel } from '@/lib/db/tarefas';

export type TarefaFormState = { error?: string; ok?: boolean };
const inicial: TarefaFormState = {};
type CriarAcao = (prev: TarefaFormState, fd: FormData) => Promise<TarefaFormState>;
type BuscarItensAcao = (clienteId: string) =>
  Promise<{ itens: ItemDisponivel[] } | { error: string }>;
type MoverAcao = (id: string, coluna: string) => Promise<{ error?: string }>;
type ReordenarAcao = (ids: string[]) => Promise<{ error?: string }>;

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
    // Limpa a lista já na troca de cliente (não só no erro): impede que o produto do
    // cliente anterior fique selecionável enquanto a busca do novo cliente ainda não
    // resolveu, ou se ela falhar.
    setItens([]);
    setErroItens(null);
    if (!clienteId) return;
    let cancelado = false;
    setCarregandoItens(true);
    buscarItens(clienteId)
      .then((r) => {
        if (cancelado) return;
        if ('error' in r) setErroItens(r.error);
        else setItens(r.itens);
      })
      .catch(() => {
        if (!cancelado) setErroItens('Não foi possível carregar os produtos deste cliente.');
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
 * Card arrastável: `useSortable` cuida do transform/transition visual e expõe
 * `coluna` via `data` — é assim que `onDragEnd` sabe em qual coluna o alvo do
 * drop (`over`) está, sem precisar procurar em `COLUNAS_KANBAN`.
 *
 * A `<div>` recebe os listeners de arraste; o `<TarefaCard>` continua um
 * `<button>` por dentro com seu próprio onClick de expandir/recolher — o
 * `PointerSensor` com `activationConstraint.distance` (ver `KanbanBoard`) é o
 * que evita que um clique simples sem arrastar dispare um drag em vez do
 * toggle do card.
 */
function TarefaCardArrastavel({ tarefa, coluna }: { tarefa: Tarefa; coluna: string }) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: tarefa.id, data: { coluna } });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: transition ?? undefined,
        opacity: isDragging ? 0.5 : 1,
      }}
      {...attributes}
      {...listeners}
    >
      <TarefaCard tarefa={tarefa} />
    </div>
  );
}

/**
 * Uma coluna do quadro. `useDroppable` no `<section>` cobre o caso de soltar
 * numa coluna vazia (sem nenhum card pra servir de `over`); o `data.coluna`
 * espelha o mesmo formato usado por `TarefaCardArrastavel`, então `onDragEnd`
 * lê `over.data.current?.coluna` sem se importar se o alvo foi um card ou o
 * fundo da coluna.
 */
function KanbanColuna({
  coluna, tarefas, onNovaTarefa,
}: { coluna: ColunaKanban; tarefas: Tarefa[]; onNovaTarefa: () => void }) {
  const { setNodeRef } = useDroppable({ id: coluna.id, data: { coluna: coluna.id } });
  const ids = tarefas.map((t) => t.id);

  return (
    <section ref={setNodeRef} className="glass w-72 shrink-0 p-4 space-y-3">
      <h2 className="text-sm font-semibold">
        <button type="button" className="w-full text-left" onClick={onNovaTarefa}>
          {coluna.label}
        </button>
      </h2>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {tarefas.length === 0 && (
          <p className="text-sm" style={{ color: 'var(--text-dim)' }}>Nenhuma tarefa</p>
        )}
        {tarefas.map((t) => <TarefaCardArrastavel key={t.id} tarefa={t} coluna={coluna.id} />)}
      </SortableContext>
    </section>
  );
}

/**
 * Quadro Kanban do Planejamento. Seis colunas fixas (rolagem lateral, spec §1),
 * cada uma filtrando e ordenando as tarefas que recebeu por prop (Task 2:
 * `ordenarTarefas`, ajuste desc / prioridade asc / created_at asc).
 *
 * Clique no cabeçalho da coluna confirma e abre o modal de criação já com a coluna
 * de origem definida (spec §5).
 *
 * Task 7 (drag and drop): `tarefasState` é a cópia local que a UI edita
 * otimisticamente — arrastar aplica a mudança (nova coluna ou nova prioridade)
 * antes da Server Action resolver, pra não travar o quadro esperando o
 * servidor. O `useEffect` abaixo resincroniza sempre que a prop `tarefas`
 * mudar (ex.: `revalidatePath` depois de uma action bem-sucedida, ou
 * `router.refresh()` disparado no `catch` de erro).
 */
export function KanbanBoard({
  tarefas, clientes, users, criarTarefaAction, buscarItensDoClienteAction,
  moverTarefaAction, reordenarTarefasAction,
}: {
  tarefas: Tarefa[]; clientes: Terceiro[]; users: User[];
  criarTarefaAction: CriarAcao; buscarItensDoClienteAction: BuscarItensAcao;
  moverTarefaAction: MoverAcao; reordenarTarefasAction: ReordenarAcao;
}) {
  const router = useRouter();
  const [colunaModal, setColunaModal] = useState<string | null>(null);
  const [tarefasState, setTarefasState] = useState(tarefas);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => { setTarefasState(tarefas); }, [tarefas]);

  // `distance` evita que um clique simples (sem mover o ponteiro) no card já
  // conte como início de drag — é isso que deixa o toggle de expandir do
  // `TarefaCard` continuar funcionando.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeId = String(active.id);
    const atual = tarefasState.find((t) => t.id === activeId);
    if (!atual) return;

    const overData = over.data.current as { coluna?: string } | undefined;
    const novaColuna = overData?.coluna ?? String(over.id);

    // Decisão de UX registrada como pendência desde a Task 3: soltar na mesma
    // coluna onde a tarefa já está (drag redundante, duplo-drop) não deve
    // disparar `moverTarefaAction` nem aparecer como erro — é um no-op
    // silencioso resolvido aqui, na UI, comparando com o estado local, antes
    // de qualquer chamada ao servidor.
    if (novaColuna !== atual.coluna) {
      if (!COLUNAS_KANBAN.some((c) => c.id === novaColuna)) return;

      const anterior = tarefasState;
      setErro(null);
      setTarefasState((prev) => prev.map(
        (t) => (t.id === activeId ? { ...t, coluna: novaColuna } : t),
      ));
      moverTarefaAction(activeId, novaColuna).then((res) => {
        if (res.error) {
          // Corrida genuína (ex.: outra aba moveu a mesma tarefa): reverte pro
          // último estado conhecido localmente e busca a verdade do servidor —
          // não inventa um estado novo.
          setTarefasState(anterior);
          setErro(res.error);
          router.refresh();
        }
      });
      return;
    }

    // Mesma coluna: reordena. `overId` igual ao próprio card arrastado, ou sem
    // posição encontrada na lista visível da coluna, também é no-op.
    const overId = String(over.id);
    if (overId === activeId) return;

    const idsAtuais = ordenarTarefas(tarefasState.filter((t) => t.coluna === novaColuna))
      .map((t) => t.id);
    const oldIndex = idsAtuais.indexOf(activeId);
    const newIndex = idsAtuais.indexOf(overId);
    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

    const novaOrdem = arrayMove(idsAtuais, oldIndex, newIndex);
    const anterior = tarefasState;
    setErro(null);
    setTarefasState((prev) => prev.map((t) => {
      const idx = novaOrdem.indexOf(t.id);
      return idx === -1 ? t : { ...t, prioridade: idx };
    }));
    reordenarTarefasAction(novaOrdem).then((res) => {
      if (res.error) {
        setTarefasState(anterior);
        setErro(res.error);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-3">
      {erro && <p className="text-sm" style={{ color: 'var(--danger)' }}>{erro}</p>}
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {COLUNAS_KANBAN.map((coluna) => {
            const daColuna = ordenarTarefas(tarefasState.filter((t) => t.coluna === coluna.id));
            return (
              <KanbanColuna
                key={coluna.id} coluna={coluna} tarefas={daColuna}
                onNovaTarefa={() => {
                  if (confirm('Deseja incluir uma nova tarefa?')) setColunaModal(coluna.id);
                }}
              />
            );
          })}
        </div>
      </DndContext>
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
