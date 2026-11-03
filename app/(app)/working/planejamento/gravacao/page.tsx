import Link from 'next/link';
import { KanbanBoard } from '@/components/KanbanBoard';
import { VerComoBarra } from '@/components/VerComoBarra';
import { modulosDoAtor, requireModulo } from '@/lib/auth/guards';
import { atorVisualizado } from '@/lib/auth/ver-como';
import { listTarefas } from '@/lib/db/tarefas';
import { listUsers } from '@/lib/db/users';
import { gerePlanejamento } from '@/lib/permissoes-cards';
import { editarTarefaAction, moverTarefaAction, reordenarTarefasAction } from '../actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Quadro de Gravação: tarefas de produtos cuja categoria tem planejamento 'gravacao'.
 *  Gêmeo de ../edicao/page.tsx. */
export default async function PlanejamentoGravacaoPage() {
  const logado = await requireModulo('working');
  const actor = await atorVisualizado(logado);

  // Usuário comum só recebe as tarefas atribuídas a ele (lib/permissoes-cards.ts).
  const gestao = gerePlanejamento(actor);
  const [tarefas, modulos, users] = await Promise.all([
    listTarefas('gravacao', gestao ? undefined : actor.id), modulosDoAtor(actor), listUsers(),
  ]);

  return (
    <main className="p-4 md:p-6 space-y-4">
      <VerComoBarra logado={logado} visto={actor} users={users} />
      <div className="flex items-center gap-4 flex-wrap">
        <h1 className="text-xl font-semibold">Planejamento · Gravação</h1>
        {/* Tarefa nasce de OS: sem acesso à área de OS, o botão nem aparece. */}
        {modulos.includes('ordens_servico') && (
          <Link href="/ordens-servico?origem=gravacao" className="btn btn-primary">Nova tarefa</Link>
        )}
      </div>
      <KanbanBoard
        tarefas={tarefas} users={users}
        moverTarefaAction={moverTarefaAction} reordenarTarefasAction={reordenarTarefasAction}
        editarTarefaAction={editarTarefaAction} gestao={gestao}
      />
    </main>
  );
}
