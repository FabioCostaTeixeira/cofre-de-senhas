import Link from 'next/link';
import { KanbanBoard } from '@/components/KanbanBoard';
import { modulosDoAtor, requireModulo } from '@/lib/auth/guards';
import { listTarefas } from '@/lib/db/tarefas';
import { moverTarefaAction, reordenarTarefasAction } from '../actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Quadro de Gravação: tarefas de produtos cuja categoria tem planejamento 'gravacao'.
 *  Gêmeo de ../edicao/page.tsx. */
export default async function PlanejamentoGravacaoPage() {
  const actor = await requireModulo('working');

  const [tarefas, modulos] = await Promise.all([listTarefas('gravacao'), modulosDoAtor(actor)]);

  return (
    <main className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-4 flex-wrap">
        <h1 className="text-xl font-semibold">Planejamento · Gravação</h1>
        {/* Tarefa nasce de OS: sem acesso à área de OS, o botão nem aparece. */}
        {modulos.includes('ordens_servico') && (
          <Link href="/ordens-servico?origem=gravacao" className="btn btn-primary">Nova tarefa</Link>
        )}
      </div>
      <KanbanBoard
        tarefas={tarefas}
        moverTarefaAction={moverTarefaAction} reordenarTarefasAction={reordenarTarefasAction}
      />
    </main>
  );
}
