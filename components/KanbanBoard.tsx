'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext, PointerSensor, useDroppable, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, arrayMove, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { EditarTarefaModal, type EditarTarefaState } from '@/components/EditarTarefaModal';
import { TarefaCard } from '@/components/TarefaCard';
import { COLUNAS_KANBAN, type ColunaKanban } from '@/lib/kanban';
import { ordenarTarefas } from '@/lib/tarefas-calc';
import type { Tarefa, User } from '@/lib/types';

type EditarAcao = (prev: EditarTarefaState, fd: FormData) => Promise<EditarTarefaState>;
type MoverAcao = (id: string, coluna: string) => Promise<{ error?: string }>;
type ReordenarAcao = (ids: string[]) => Promise<{ error?: string }>;

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
function TarefaCardArrastavel({
  tarefa, coluna, onEditar,
}: { tarefa: Tarefa; coluna: string; onEditar: () => void }) {
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
      <TarefaCard tarefa={tarefa} onEditar={onEditar} />
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
  coluna, tarefas, onEditar,
}: { coluna: ColunaKanban; tarefas: Tarefa[]; onEditar: (t: Tarefa) => void }) {
  const { setNodeRef } = useDroppable({ id: coluna.id, data: { coluna: coluna.id } });
  const ids = tarefas.map((t) => t.id);

  return (
    <section ref={setNodeRef} className="solid w-72 shrink-0 p-4 space-y-3">
      <h2 className="text-sm font-semibold">{coluna.label}</h2>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {tarefas.length === 0 && (
          <p className="text-sm" style={{ color: 'var(--text-dim)' }}>Nenhuma tarefa</p>
        )}
        {tarefas.map((t) => (
          <TarefaCardArrastavel key={t.id} tarefa={t} coluna={coluna.id} onEditar={() => onEditar(t)} />
        ))}
      </SortableContext>
    </section>
  );
}

/**
 * Quadro Kanban do Planejamento. Seis colunas fixas (rolagem lateral, spec §1),
 * cada uma filtrando e ordenando as tarefas que recebeu por prop (Task 2:
 * `ordenarTarefas`, ajuste desc / prioridade asc / created_at asc).
 *
 * Tarefa nova não nasce aqui: o botão "Nova tarefa" da página leva à criação de
 * Ordem de Serviço, que gera as tarefas em "A fazer" e volta para o quadro.
 *
 * Task 7 (drag and drop): `tarefasState` é a cópia local que a UI edita
 * otimisticamente — arrastar aplica a mudança (nova coluna ou nova prioridade)
 * antes da Server Action resolver, pra não travar o quadro esperando o
 * servidor. O `useEffect` abaixo resincroniza sempre que a prop `tarefas`
 * mudar (ex.: `revalidatePath` depois de uma action bem-sucedida, ou
 * `router.refresh()` disparado no `catch` de erro).
 */
export function KanbanBoard({
  tarefas, users, moverTarefaAction, reordenarTarefasAction, editarTarefaAction,
}: {
  tarefas: Tarefa[]; users: User[];
  moverTarefaAction: MoverAcao; reordenarTarefasAction: ReordenarAcao; editarTarefaAction: EditarAcao;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState<Tarefa | null>(null);
  const fecharEdicao = useCallback(() => setEditando(null), []);
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
      }).catch(() => {
        // Falha inesperada (ex.: conexão com o banco caiu): a action rejeitou
        // a promise em vez de devolver `{error}`, então nenhum `.then` acima
        // roda. Reverte do mesmo jeito que o ramo de erro conhecido, senão o
        // card fica preso na coluna errada até o usuário recarregar sozinho.
        setTarefasState(anterior);
        setErro('Não foi possível salvar a alteração.');
        router.refresh();
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
    }).catch(() => {
      // Mesmo motivo do `.catch` em `moverTarefaAction` acima: falha por
      // exceção (não `{error}`) não passa pelo `.then`, então reverte aqui
      // também.
      setTarefasState(anterior);
      setErro('Não foi possível salvar a alteração.');
      router.refresh();
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
              <KanbanColuna key={coluna.id} coluna={coluna} tarefas={daColuna} onEditar={setEditando} />
            );
          })}
        </div>
      </DndContext>
      {editando && (
        <EditarTarefaModal tarefa={editando} users={users} salvar={editarTarefaAction} onFechar={fecharEdicao} />
      )}
    </div>
  );
}
