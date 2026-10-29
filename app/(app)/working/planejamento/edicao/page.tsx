import Link from 'next/link';
import { KanbanBoard } from '@/components/KanbanBoard';
import { modulosDoAtor, requireModulo } from '@/lib/auth/guards';
import { listTarefas } from '@/lib/db/tarefas';
import { listUsers } from '@/lib/db/users';
import { editarTarefaAction, moverTarefaAction, reordenarTarefasAction } from '../actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Quadro de Edição: tarefas de produtos cuja categoria tem planejamento 'edicao'
 *  (Edição e Cortes). Gêmeo de ../gravacao/page.tsx. */
export default async function PlanejamentoEdicaoPage() {
  const actor = await requireModulo('working');

  const [tarefas, modulos, users] = await Promise.all([listTarefas('edicao'), modulosDoAtor(actor), listUsers()]);

  return (
    <main className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-4 flex-wrap">
        <h1 className="text-xl font-semibold">Planejamento · Edição</h1>
        {/* Tarefa nasce de OS: sem acesso à área de OS, o botão nem aparece. */}
        {modulos.includes('ordens_servico') && (
          <Link href="/ordens-servico?origem=edicao" className="btn btn-primary">Nova tarefa</Link>
        )}
      </div>
      <KanbanBoard
        tarefas={tarefas} users={users}
        moverTarefaAction={moverTarefaAction} reordenarTarefasAction={reordenarTarefasAction}
        editarTarefaAction={editarTarefaAction}
      />
    </main>
  );
}
