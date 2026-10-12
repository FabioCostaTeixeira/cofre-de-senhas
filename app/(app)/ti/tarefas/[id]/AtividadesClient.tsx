'use client';

import { useActionState, useEffect, useState } from 'react';
import { ModalForm } from '@/components/ModalForm';
import { criarOuEditarAtividadeAction, type AtividadeActionState } from './actions';
import { AtividadesKanbanGrid } from './AtividadesKanbanGrid';
import type { TiTarefa, TiAtividade, TiTarefaOption } from '@/lib/db/ti';

const inicial: AtividadeActionState = {};

export function AtividadesClient({
  tarefa,
  atividades,
  tarefasDisponiveis,
}: {
  tarefa: TiTarefa;
  atividades: TiAtividade[];
  tarefasDisponiveis: TiTarefaOption[];
}) {
  const [modalAberto, setModalAberto] = useState(false);
  const [atividadeEditando, setAtividadeEditando] = useState<TiAtividade | null>(null);
  const [state, action, pending] = useActionState(criarOuEditarAtividadeAction, inicial);

  useEffect(() => {
    if (state.ok) {
      setModalAberto(false);
      setAtividadeEditando(null);
    }
  }, [state.ok]);

  const abrirCriacao = () => {
    setAtividadeEditando(null);
    setModalAberto(true);
  };

  const abrirEdicao = (a: TiAtividade) => {
    setAtividadeEditando(a);
    setModalAberto(true);
  };

  return (
    <>
      <AtividadesKanbanGrid
        tarefa={tarefa}
        atividades={atividades}
        onNovaAtividade={abrirCriacao}
        onEditarAtividade={abrirEdicao}
      />

      {modalAberto && (
        <ModalForm
          title={atividadeEditando ? 'Editar User Story (Atividade)' : 'Nova User Story (Atividade)'}
          isOpen
          onClose={() => {
            setModalAberto(false);
            setAtividadeEditando(null);
          }}
          action={action}
          isLoading={pending}
          submitLabel={atividadeEditando ? 'Salvar Alterações' : 'Salvar'}
        >
          {atividadeEditando ? (
            <label className="block space-y-1">
              <span className="text-sm">Tarefa pai (Feature)</span>
              <select
                name="tarefaId"
                className="input"
                required
                defaultValue={atividadeEditando.tarefa_id}
              >
                {tarefasDisponiveis.map((opcao) => (
                  <option key={opcao.id} value={opcao.id}>
                    {opcao.projeto_nome} — {opcao.nome}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <input type="hidden" name="tarefaId" value={tarefa.id} />
          )}
          {atividadeEditando && <input type="hidden" name="id" value={atividadeEditando.id} />}

          <label className="block space-y-1">
            <span className="text-sm">Nome da User Story</span>
            <input
              name="nome"
              className="input"
              required
              defaultValue={atividadeEditando?.nome ?? ''}
              placeholder="Ex: Como usuário, quero fazer login..."
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-sm">Status</span>
              <select name="status" className="input" defaultValue={atividadeEditando?.status ?? 'a_fazer'}>
                <option value="roadmap">Roadmap</option>
                <option value="a_fazer">A Fazer</option>
                <option value="progresso">Em Progresso</option>
                <option value="homologacao">Homologação</option>
                <option value="bloqueada">Bloqueada</option>
                <option value="concluido">Concluído</option>
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-sm">Prioridade</span>
              <select name="prioridade" className="input" defaultValue={atividadeEditando?.prioridade ?? 'media'}>
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
              defaultValue={atividadeEditando?.peso ?? 0}
              placeholder="Ex: 25"
              min="0"
              max="100"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm">Responsável</span>
            <input
              name="responsavel"
              className="input"
              defaultValue={atividadeEditando?.responsavel ?? ''}
              placeholder="Ex: Desenvolvedor"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm">Critérios de Aceite / Descrição</span>
            <textarea
              name="descricao"
              className="input"
              rows={3}
              defaultValue={atividadeEditando?.descricao ?? ''}
              placeholder="Critérios..."
            />
          </label>
          {state.error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{state.error}</p>}
        </ModalForm>
      )}
    </>
  );
}
