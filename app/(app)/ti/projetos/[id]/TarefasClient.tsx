'use client';

import { useActionState, useEffect, useState } from 'react';
import { ModalForm } from '@/components/ModalForm';
import { TiStatusComMotivo } from '@/components/TiStatusComMotivo';
import { criarOuEditarTarefaAction, type TarefaActionState } from './actions';
import { TarefasKanbanGrid } from './TarefasKanbanGrid';
import type { TiProjeto, TiTarefa } from '@/lib/db/ti';

const inicial: TarefaActionState = {};

const STATUS_TAREFA = [
  { id: 'roadmap', label: 'Roadmap' },
  { id: 'planejamento', label: 'Planejamento' },
  { id: 'a_fazer', label: 'A Fazer' },
  { id: 'progresso', label: 'Em Progresso' },
  { id: 'homologacao', label: 'Homologação' },
  { id: 'bloqueada', label: 'Bloqueada' },
  { id: 'concluido', label: 'Concluído' },
] as const;

export function TarefasClient({ projeto, tarefas }: { projeto: TiProjeto; tarefas: TiTarefa[] }) {
  const [modalAberto, setModalAberto] = useState(false);
  const [tarefaEditando, setTarefaEditando] = useState<TiTarefa | null>(null);
  const [state, action, pending] = useActionState(criarOuEditarTarefaAction, inicial);

  useEffect(() => {
    if (state.ok) {
      setModalAberto(false);
      setTarefaEditando(null);
    }
  }, [state.ok]);

  const abrirCriacao = () => {
    setTarefaEditando(null);
    setModalAberto(true);
  };

  const abrirEdicao = (t: TiTarefa) => {
    setTarefaEditando(t);
    setModalAberto(true);
  };

  return (
    <>
      <TarefasKanbanGrid
        projeto={projeto}
        tarefas={tarefas}
        onNovaTarefa={abrirCriacao}
        onEditarTarefa={abrirEdicao}
      />

      {modalAberto && (
        <ModalForm
          title={tarefaEditando ? 'Editar Tarefa (Feature)' : 'Nova Tarefa (Feature)'}
          isOpen
          onClose={() => {
            setModalAberto(false);
            setTarefaEditando(null);
          }}
          action={action}
          isLoading={pending}
          submitLabel={tarefaEditando ? 'Salvar Alterações' : 'Salvar'}
        >
          <input type="hidden" name="projetoId" value={projeto.id} />
          {tarefaEditando && <input type="hidden" name="id" value={tarefaEditando.id} />}

          <label className="block space-y-1">
            <span className="text-sm">Nome da Tarefa (Feature)</span>
            <input
              name="nome"
              className="input"
              required
              defaultValue={tarefaEditando?.nome ?? ''}
              placeholder="Ex: Autenticação OAuth"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <TiStatusComMotivo
              opcoes={STATUS_TAREFA} inicial={tarefaEditando?.status ?? 'a_fazer'} editando={!!tarefaEditando}
            />
            <label className="block space-y-1">
              <span className="text-sm">Prioridade</span>
              <select name="prioridade" className="input" defaultValue={tarefaEditando?.prioridade ?? 'media'}>
                <option value="baixa">Baixa</option>
                <option value="media">Média</option>
                <option value="alta">Alta</option>
                <option value="critica">Crítica</option>
              </select>
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-sm">Peso (%)</span>
            <input
              name="peso"
              type="number"
              className="input"
              required
              defaultValue={tarefaEditando?.peso ?? 0}
              placeholder="Ex: 20"
              min="0"
              max="100"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm">Responsável</span>
            <input
              name="responsavel"
              className="input"
              defaultValue={tarefaEditando?.responsavel ?? ''}
              placeholder="Ex: Desenvolvedor"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm">Descrição (opcional)</span>
            <textarea
              name="descricao"
              className="input"
              rows={3}
              defaultValue={tarefaEditando?.descricao ?? ''}
              placeholder="Detalhes da feature..."
            />
          </label>
          {state.error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{state.error}</p>}
        </ModalForm>
      )}
    </>
  );
}
