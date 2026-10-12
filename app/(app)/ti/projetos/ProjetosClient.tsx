'use client';

import { useActionState, useEffect, useState } from 'react';
import Link from 'next/link';
import { ModalForm } from '@/components/ModalForm';
import { Copy } from 'lucide-react';
import { criarOuEditarProjetoAction, duplicarProjetoAction, excluirProjetoAction, type TiActionState } from './actions';
import type { TiProjeto } from '@/lib/db/ti';
import { formatarDataBR } from '@/lib/documentos';

const inicial: TiActionState = {};

const STATUS_LABELS: Record<string, { label: string; bg: string }> = {
  roadmap: { label: 'Roadmap', bg: '#64748b' },
  backlog: { label: 'Backlog', bg: 'var(--border)' },
  planejamento: { label: 'Planejamento', bg: 'var(--warn)' },
  andamento: { label: 'Em Andamento', bg: 'var(--ok)' },
  homologacao: { label: 'Homologação', bg: '#3b82f6' },
  concluido: { label: 'Concluído', bg: '#10b981' },
  cancelado: { label: 'Cancelado', bg: 'var(--danger)' },
};

const PRIORIDADE_LABELS: Record<string, string> = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
  critica: 'Crítica',
};

export function ProjetosClient({ projetos }: { projetos: TiProjeto[] }) {
  const [modalAberto, setModalAberto] = useState(false);
  const [projetoEditando, setProjetoEditando] = useState<TiProjeto | null>(null);
  const [state, action, pending] = useActionState(criarOuEditarProjetoAction, inicial);

  useEffect(() => {
    if (state.ok) {
      setModalAberto(false);
      setProjetoEditando(null);
    }
  }, [state.ok]);

  const abrirCriacao = () => {
    setProjetoEditando(null);
    setModalAberto(true);
  };

  const abrirEdicao = (p: TiProjeto) => {
    setProjetoEditando(p);
    setModalAberto(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
          Gerencie os projetos principais (Epics) do setor de TI. Clique em um projeto para gerenciar suas Tarefas (Features).
        </p>
        <button type="button" className="btn btn-primary" onClick={abrirCriacao}>
          Novo Projeto (Epic)
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {projetos.map((p) => {
          const st = STATUS_LABELS[p.status] || { label: p.status, bg: 'var(--border)' };
          return (
            <div key={p.id} className="glass p-4 space-y-3 flex flex-col justify-between relative">
              <form action={duplicarProjetoAction} className="absolute right-3 top-3 z-10">
                <input type="hidden" name="id" value={p.id} />
                <button
                  type="submit"
                  className="p-1.5 rounded-md bg-black/20 hover:bg-white/10 transition-colors"
                  style={{ color: 'var(--text-dim)' }}
                  aria-label={`Duplicar projeto ${p.nome}`}
                  title="Duplicar projeto com tarefas e atividades (com status roadmap)"
                >
                  <Copy size={16} aria-hidden="true" />
                </button>
              </form>
              <Link href={`/ti/projetos/${p.id}`} className="space-y-2 block group">
                <div className="flex items-center justify-between gap-2 pr-9">
                  <span
                    className="text-xs px-2 py-0.5 rounded font-medium text-white"
                    style={{ backgroundColor: st.bg }}
                  >
                    {st.label}
                  </span>
                  <span className="text-xs font-semibold" style={{ color: 'var(--text-dim)' }}>
                    Prioridade: {PRIORIDADE_LABELS[p.prioridade] || p.prioridade}
                  </span>
                </div>
                <h2 className="font-semibold text-lg group-hover:underline">{p.nome}</h2>
                <p className="text-sm line-clamp-2" style={{ color: 'var(--text-dim)' }}>
                  {p.descricao || 'Sem descrição'}
                </p>

                {/* Barra de Progresso */}
                <div className="space-y-1 pt-1">
                  <div className="flex justify-between text-xs" style={{ color: 'var(--text-dim)' }}>
                    <span>Progresso</span>
                    <span>{p.progresso ?? 0}%</span>
                  </div>
                  <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 transition-all" style={{ width: `${p.progresso ?? 0}%` }} />
                  </div>
                </div>

                <div className="text-xs space-y-1 pt-1" style={{ color: 'var(--text-dim)' }}>
                  {p.responsavel && <p>Responsável: <span className="font-medium">{p.responsavel}</span></p>}
                  {(p.data_inicio || p.data_fim) && (
                    <p>
                      Prazo: {p.data_inicio ? formatarDataBR(p.data_inicio) : '...'} até{' '}
                      {p.data_fim ? formatarDataBR(p.data_fim) : '...'}
                    </p>
                  )}
                </div>
              </Link>
              <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                <button
                  type="button"
                  onClick={() => abrirEdicao(p)}
                  className="text-xs hover:underline"
                  style={{ color: 'var(--warn)' }}
                >
                  Editar
                </button>
                <form action={excluirProjetoAction}>
                  <input type="hidden" name="id" value={p.id} />
                  <button type="submit" className="text-xs" style={{ color: 'var(--danger)' }}>Excluir</button>
                </form>
              </div>
            </div>
          );
        })}
        {projetos.length === 0 && (
          <p className="text-sm" style={{ color: 'var(--text-dim)' }}>Nenhum projeto cadastrado.</p>
        )}
      </div>

      {modalAberto && (
        <ModalForm
          title={projetoEditando ? 'Editar Projeto (Epic)' : 'Novo Projeto (Epic)'}
          isOpen
          onClose={() => {
            setModalAberto(false);
            setProjetoEditando(null);
          }}
          action={action}
          isLoading={pending}
          submitLabel={projetoEditando ? 'Salvar Alterações' : 'Salvar'}
        >
          {projetoEditando && <input type="hidden" name="id" value={projetoEditando.id} />}
          <label className="block space-y-1">
            <span className="text-sm">Nome do Projeto (Epic)</span>
            <input name="nome" className="input" required defaultValue={projetoEditando?.nome ?? ''} placeholder="Ex: Migração de Infraestrutura" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-sm">Status</span>
              <select name="status" className="input" defaultValue={projetoEditando?.status ?? 'roadmap'}>
                <option value="roadmap">Roadmap</option>
                <option value="backlog">Backlog</option>
                <option value="planejamento">Planejamento</option>
                <option value="andamento">Em Andamento</option>
                <option value="homologacao">Homologação</option>
                <option value="concluido">Concluído</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-sm">Prioridade</span>
              <select name="prioridade" className="input" defaultValue={projetoEditando?.prioridade ?? 'media'}>
                <option value="baixa">Baixa</option>
                <option value="media">Média</option>
                <option value="alta">Alta</option>
                <option value="critica">Crítica</option>
              </select>
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-sm">Responsável</span>
            <input name="responsavel" className="input" defaultValue={projetoEditando?.responsavel ?? ''} placeholder="Ex: Nome do Tech Lead" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-sm">Data Início</span>
              <input type="date" name="dataInicio" className="input" defaultValue={projetoEditando?.data_inicio ?? ''} />
            </label>
            <label className="block space-y-1">
              <span className="text-sm">Data Fim (Previsão)</span>
              <input type="date" name="dataFim" className="input" defaultValue={projetoEditando?.data_fim ?? ''} />
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-sm">Descrição (opcional)</span>
            <textarea name="descricao" className="input" rows={3} defaultValue={projetoEditando?.descricao ?? ''} placeholder="Detalhes do projeto..." />
          </label>
          {state.error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{state.error}</p>}
        </ModalForm>
      )}
    </div>
  );
}
