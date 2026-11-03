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
import { ChamadoCard } from '@/components/ChamadoCard';
import { ChamadoModal, type ChamadoState } from '@/components/ChamadoModal';
import { COLUNAS_CHAMADO, type ColunaKanban } from '@/lib/kanban';
import type { CategoriaProduto, Chamado, Produto, User } from '@/lib/types';

type SalvarAcao = (prev: ChamadoState, fd: FormData) => Promise<ChamadoState>;
type MoverAcao = (id: string, coluna: string) => Promise<{ error?: string }>;
type ReordenarAcao = (ids: string[]) => Promise<{ error?: string }>;
type ApagarAcao = (id: string) => Promise<{ error?: string }>;

/** Mais antigo primeiro dentro da mesma prioridade — mesma ordem do `listChamados`. */
function ordenarChamados(chamados: Chamado[]): Chamado[] {
  return [...chamados].sort((a, b) =>
    a.prioridade - b.prioridade || new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

/** Mesmo arranjo do `TarefaCardArrastavel` (KanbanBoard): `data.coluna` diz ao
 *  `onDragEnd` em qual coluna o alvo do drop está. */
function ChamadoCardArrastavel({
  chamado, coluna, onEditar,
}: { chamado: Chamado; coluna: string; onEditar: () => void }) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: chamado.id, data: { coluna } });

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
      <ChamadoCard chamado={chamado} onEditar={onEditar} />
    </div>
  );
}

function ChamadosColuna({
  coluna, chamados, onEditar,
}: { coluna: ColunaKanban; chamados: Chamado[]; onEditar: (c: Chamado) => void }) {
  const { setNodeRef } = useDroppable({ id: coluna.id, data: { coluna: coluna.id } });

  return (
    <section ref={setNodeRef} className="solid w-72 shrink-0 p-4 space-y-3">
      <h2 className="text-sm font-semibold">{coluna.label}</h2>
      <SortableContext items={chamados.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        {chamados.length === 0 && (
          <p className="text-sm" style={{ color: 'var(--text-dim)' }}>Nenhum chamado</p>
        )}
        {chamados.map((c) => (
          <ChamadoCardArrastavel key={c.id} chamado={c} coluna={coluna.id} onEditar={() => onEditar(c)} />
        ))}
      </SortableContext>
    </section>
  );
}

/**
 * Quadro Working › Projetos. Mesmo comportamento do `KanbanBoard` do Planejamento —
 * arrastar entre colunas move, arrastar na mesma coluna reordena, com atualização
 * otimista revertida se a action falhar — mas sem efeito de saldo: chamado nasce aqui
 * mesmo, pelo botão "Novo chamado", e não por OS.
 */
export function ChamadosBoard({
  chamados, categorias, produtos, users,
  criarChamadoAction, editarChamadoAction, moverChamadoAction, reordenarChamadosAction, apagarChamadoAction,
}: {
  chamados: Chamado[]; categorias: CategoriaProduto[]; produtos: Produto[]; users: User[];
  criarChamadoAction: SalvarAcao; editarChamadoAction: SalvarAcao;
  moverChamadoAction: MoverAcao; reordenarChamadosAction: ReordenarAcao; apagarChamadoAction: ApagarAcao;
}) {
  const router = useRouter();
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<Chamado | null>(null);
  const fecharCriacao = useCallback(() => setCriando(false), []);
  const fecharEdicao = useCallback(() => setEditando(null), []);
  const [chamadosState, setChamadosState] = useState(chamados);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => { setChamadosState(chamados); }, [chamados]);

  // `distance`: clique simples no card expande em vez de iniciar arraste.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  /** Aplica a mudança local na hora e reverte (buscando a verdade do servidor) se a
   *  action devolver erro ou rejeitar. */
  function salvarOtimista(novo: (prev: Chamado[]) => Chamado[], acao: () => Promise<{ error?: string }>) {
    const anterior = chamadosState;
    setErro(null);
    setChamadosState(novo);
    acao().then((res) => {
      if (res.error) {
        setChamadosState(anterior);
        setErro(res.error);
        router.refresh();
      }
    }).catch(() => {
      setChamadosState(anterior);
      setErro('Não foi possível salvar a alteração.');
      router.refresh();
    });
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeId = String(active.id);
    const atual = chamadosState.find((c) => c.id === activeId);
    if (!atual) return;

    const overData = over.data.current as { coluna?: string } | undefined;
    const novaColuna = overData?.coluna ?? String(over.id);

    if (novaColuna !== atual.coluna) {
      if (!COLUNAS_CHAMADO.some((c) => c.id === novaColuna)) return;
      salvarOtimista(
        (prev) => prev.map((c) => (c.id === activeId ? { ...c, coluna: novaColuna } : c)),
        () => moverChamadoAction(activeId, novaColuna),
      );
      return;
    }

    const overId = String(over.id);
    if (overId === activeId) return;

    const idsAtuais = ordenarChamados(chamadosState.filter((c) => c.coluna === novaColuna)).map((c) => c.id);
    const oldIndex = idsAtuais.indexOf(activeId);
    const newIndex = idsAtuais.indexOf(overId);
    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

    const novaOrdem = arrayMove(idsAtuais, oldIndex, newIndex);
    salvarOtimista(
      (prev) => prev.map((c) => {
        const idx = novaOrdem.indexOf(c.id);
        return idx === -1 ? c : { ...c, prioridade: idx };
      }),
      () => reordenarChamadosAction(novaOrdem),
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 flex-wrap">
        <h1 className="text-xl font-semibold">Projetos</h1>
        <button type="button" className="btn btn-primary" onClick={() => setCriando(true)}>Novo chamado</button>
      </div>
      {erro && <p className="text-sm" style={{ color: 'var(--danger)' }}>{erro}</p>}
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {COLUNAS_CHAMADO.map((coluna) => (
            <ChamadosColuna
              key={coluna.id} coluna={coluna} onEditar={setEditando}
              chamados={ordenarChamados(chamadosState.filter((c) => c.coluna === coluna.id))}
            />
          ))}
        </div>
      </DndContext>
      {criando && (
        <ChamadoModal
          categorias={categorias} produtos={produtos} users={users}
          salvar={criarChamadoAction} onFechar={fecharCriacao}
        />
      )}
      {editando && (
        <ChamadoModal
          chamado={editando} categorias={categorias} produtos={produtos} users={users}
          salvar={editarChamadoAction} apagar={apagarChamadoAction} onFechar={fecharEdicao}
        />
      )}
    </div>
  );
}
