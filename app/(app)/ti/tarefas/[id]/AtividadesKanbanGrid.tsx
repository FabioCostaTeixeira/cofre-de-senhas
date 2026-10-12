'use client';

import { useState } from 'react';
import type { TiTarefa, TiAtividade } from '@/lib/db/ti';
import { excluirAtividadeAction, mudarStatusAtividadeAction, reordenarAtividadesAction } from './actions';

const STATUS_LABELS: Record<string, { label: string; bg: string; color?: string }> = {
  roadmap: { label: 'Roadmap', bg: '#64748b' },
  a_fazer: { label: 'A Fazer', bg: 'var(--border)' },
  progresso: { label: 'Em Progresso', bg: 'var(--warn)', color: '#1e293b' },
  homologacao: { label: 'Homologação', bg: '#3b82f6' },
  concluido: { label: 'Concluído', bg: '#10b981' },
  bloqueada: { label: 'Bloqueada', bg: 'var(--danger)' },
};

const STATUS_KANBAN = [
  { id: 'roadmap', label: 'Roadmap' },
  { id: 'a_fazer', label: 'A Fazer' },
  { id: 'progresso', label: 'Em Progresso' },
  { id: 'homologacao', label: 'Homologação' },
  { id: 'bloqueada', label: 'Bloqueada' },
  { id: 'concluido', label: 'Concluído' },
];

const PRIORIDADE_LABELS: Record<string, string> = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
  critica: 'Crítica',
};

export function AtividadesKanbanGrid({
  tarefa,
  atividades,
  onNovaAtividade,
  onEditarAtividade,
}: {
  tarefa: TiTarefa;
  atividades: TiAtividade[];
  onNovaAtividade: () => void;
  onEditarAtividade: (a: TiAtividade) => void;
}) {
  const [visao, setVisao] = useState<'grid' | 'kanban'>('grid');

  const concluido = atividades
    .filter((a) => a.status === 'concluido')
    .reduce((acc, a) => acc + (Number(a.peso) || 0), 0);

  const total = atividades.reduce((acc, a) => acc + (Number(a.peso) || 0), 0);
  const percentual = total > 0 ? (concluido / total) * 100 : 0;

  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('text/plain', id);
  };

  const handleDrop = async (e: React.DragEvent, novoStatus: string) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    if (!id) return;

    const form = document.createElement('form');
    form.method = 'POST';
    form.action = '';

    const inputId = document.createElement('input');
    inputId.type = 'hidden';
    inputId.name = 'id';
    inputId.value = id;
    form.appendChild(inputId);

    const inputTarefa = document.createElement('input');
    inputTarefa.type = 'hidden';
    inputTarefa.name = 'tarefaId';
    inputTarefa.value = tarefa.id;
    form.appendChild(inputTarefa);

    const inputStatus = document.createElement('input');
    inputStatus.type = 'hidden';
    inputStatus.name = 'status';
    inputStatus.value = novoStatus;
    form.appendChild(inputStatus);

    document.body.appendChild(form);

    const formData = new FormData(form);
    form.remove();

    await mudarStatusAtividadeAction(formData);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <div className="space-y-6">
      {/* Detalhes da Feature */}
      <div className="glass p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">{tarefa.nome}</h2>
          <span className="text-xs px-2.5 py-1 rounded font-medium text-white" style={{ backgroundColor: 'var(--ok)' }}>
            {tarefa.status}
          </span>
        </div>

        {/* Barra de Progresso */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs" style={{ color: 'var(--text-dim)' }}>
            <span>Progresso</span>
            <span>{concluido}/100</span>
          </div>
          <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${percentual}%` }} />
          </div>
        </div>

        <p className="text-sm" style={{ color: 'var(--text-dim)' }}>{tarefa.descricao || 'Sem descrição'}</p>
        <div className="flex flex-wrap gap-4 text-xs pt-2" style={{ color: 'var(--text-dim)' }}>
          <span>Prioridade: <strong className="text-white">{PRIORIDADE_LABELS[tarefa.prioridade] || tarefa.prioridade}</strong></span>
          {tarefa.responsavel && <span>Responsável: <strong className="text-white">{tarefa.responsavel}</strong></span>}
        </div>
      </div>

      {/* Header com botões de Ação e Alternância de Visão */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold">User Stories (Atividades)</h3>
          <div className="flex glass p-1 rounded-lg gap-1">
            <button
              type="button"
              className={`px-3 py-1 text-xs rounded-md transition-colors ${visao === 'grid' ? 'bg-white/10 font-medium' : ''}`}
              style={{ color: visao === 'grid' ? 'white' : 'var(--text-dim)' }}
              onClick={() => setVisao('grid')}
            >
              Visão Grid (Tabela)
            </button>
            <button
              type="button"
              className={`px-3 py-1 text-xs rounded-md transition-colors ${visao === 'kanban' ? 'bg-white/10 font-medium' : ''}`}
              style={{ color: visao === 'kanban' ? 'white' : 'var(--text-dim)' }}
              onClick={() => setVisao('kanban')}
            >
              Visão Kanban (Arraste e Solte)
            </button>
          </div>
        </div>
        <button type="button" className="btn btn-primary" onClick={onNovaAtividade}>
          Nova User Story
        </button>
      </div>

      {/* VISÃO GRID (TABELA) */}
      {visao === 'grid' && (
        <div className="glass overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                <th className="p-3 font-semibold">Nome</th>
                <th className="p-3 font-semibold">Status</th>
                <th className="p-3 font-semibold">Peso</th>
                <th className="p-3 font-semibold">Prioridade</th>
                <th className="p-3 font-semibold">Responsável</th>
                <th className="p-3 font-semibold">Descrição</th>
                <th className="p-3 font-semibold text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {atividades.map((a) => {
                const st = STATUS_LABELS[a.status] || { label: a.status, bg: 'var(--border)' };
                return (
                  <tr key={a.id} className="border-b transition-colors hover:bg-white/5" style={{ borderColor: 'var(--border)' }}>
                    <td className="p-3 font-medium">{a.nome}</td>
                    <td className="p-3">
                      <span
                        className="text-xs px-2 py-0.5 rounded font-medium inline-block"
                        style={{ backgroundColor: st.bg, color: st.color || '#ffffff' }}
                      >
                        {st.label}
                      </span>
                    </td>
                    <td className="p-3 text-xs font-semibold">{a.peso}%</td>
                    <td className="p-3 text-xs" style={{ color: 'var(--text-dim)' }}>
                      {PRIORIDADE_LABELS[a.prioridade] || a.prioridade}
                    </td>
                    <td className="p-3 text-xs" style={{ color: 'var(--text-dim)' }}>
                      {a.responsavel || '—'}
                    </td>
                    <td className="p-3 text-xs max-w-xs truncate" style={{ color: 'var(--text-dim)' }} title={a.descricao || ''}>
                      {a.descricao || '—'}
                    </td>
                    <td className="p-3 text-right space-x-2">
                      <button
                        type="button"
                        onClick={() => onEditarAtividade(a)}
                        className="text-xs hover:underline"
                        style={{ color: 'var(--warn)' }}
                      >
                        Editar
                      </button>
                      <form action={excluirAtividadeAction} className="inline-block">
                        <input type="hidden" name="id" value={a.id} />
                        <input type="hidden" name="tarefaId" value={tarefa.id} />
                        <button type="submit" className="text-xs hover:underline" style={{ color: 'var(--danger)' }}>Excluir</button>
                      </form>
                    </td>
                  </tr>
                );
              })}
              {atividades.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-sm" style={{ color: 'var(--text-dim)' }}>
                    Nenhuma User Story cadastrada nesta tarefa.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* VISÃO KANBAN */}
      {visao === 'kanban' && (
        <div className="flex gap-4 overflow-x-auto pb-4 items-start">
          {STATUS_KANBAN.map((coluna) => {
            const daColuna = atividades.filter((a) => a.status === coluna.id);
            return (
              <section
                key={coluna.id}
                className="glass w-72 shrink-0 p-4 space-y-3 min-h-[300px]"
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, coluna.id)}
              >
                <h4 className="text-sm font-semibold flex items-center justify-between">
                  <span>{coluna.label}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-white/10">{daColuna.length}</span>
                </h4>
                <div className="space-y-3">
                  {daColuna.map((a) => (
                    <div
                      key={a.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, a.id)}
                      className="glass p-3 space-y-2 border border-white/5 cursor-grab active:cursor-grabbing hover:border-white/20 transition-all"
                    >
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs" style={{ color: 'var(--text-dim)' }}>
                          <span>{PRIORIDADE_LABELS[a.prioridade]}</span>
                          <span>Peso: {a.peso}%</span>
                        </div>
                        <h5 className="font-medium text-sm">{a.nome}</h5>
                        <p className="text-xs line-clamp-2" style={{ color: 'var(--text-dim)' }}>
                          {a.descricao}
                        </p>
                      </div>

                      <div className="flex justify-between items-center pt-2 border-t text-xs" style={{ borderColor: 'var(--border)' }}>
                        <span style={{ color: 'var(--text-dim)' }}>{a.responsavel || '—'}</span>
                        <div className="space-x-2">
                          <button
                            type="button"
                            onClick={() => onEditarAtividade(a)}
                            className="hover:underline"
                            style={{ color: 'var(--warn)' }}
                          >
                            Editar
                          </button>
                          <form action={excluirAtividadeAction} className="inline-block">
                            <input type="hidden" name="id" value={a.id} />
                            <input type="hidden" name="tarefaId" value={tarefa.id} />
                            <button type="submit" className="text-xs hover:underline" style={{ color: 'var(--danger)' }}>Excluir</button>
                          </form>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Atalho clicable para nova user story logo abaixo dos cards */}
                  <button
                    type="button"
                    onClick={onNovaAtividade}
                    className="w-full py-2.5 px-3 rounded-lg border border-dashed border-white/20 hover:border-white/40 text-xs font-medium text-center transition-colors flex items-center justify-center gap-1.5"
                    style={{ color: 'var(--text-dim)' }}
                  >
                    <span>+ Nova User Story</span>
                  </button>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
