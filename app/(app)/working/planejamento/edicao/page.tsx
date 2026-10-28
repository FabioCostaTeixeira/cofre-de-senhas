import { KanbanBoard } from '@/components/KanbanBoard';
import { requireModulo } from '@/lib/auth/guards';
import { listTarefas } from '@/lib/db/tarefas';
import { listTerceiros } from '@/lib/db/terceiros';
import { listUsers } from '@/lib/db/users';
import {
  buscarItensDoClienteAction, criarTarefaAction, moverTarefaAction, reordenarTarefasAction,
} from '../actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Quadro de Edição: tarefas de produtos cuja categoria tem planejamento 'edicao'
 *  (Edição e Cortes). Gêmeo de ../gravacao/page.tsx. */
export default async function PlanejamentoEdicaoPage() {
  await requireModulo('working');

  const [tarefas, clientes, users] = await Promise.all([
    listTarefas('edicao'), listTerceiros('clientes'), listUsers(),
  ]);

  return (
    <main className="p-4 md:p-6 space-y-4">
      <h1 className="text-xl font-semibold">Planejamento · Edição</h1>
      <KanbanBoard
        tarefas={tarefas} clientes={clientes} users={users}
        criarTarefaAction={criarTarefaAction}
        buscarItensDoClienteAction={buscarItensDoClienteAction.bind(null, 'edicao')}
        moverTarefaAction={moverTarefaAction} reordenarTarefasAction={reordenarTarefasAction}
      />
    </main>
  );
}
