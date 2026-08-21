import { KanbanBoard } from '@/components/KanbanBoard';
import { requireReadyUser } from '@/lib/auth/guards';
import { listTarefas } from '@/lib/db/tarefas';
import { listTerceiros } from '@/lib/db/terceiros';
import { listUsers } from '@/lib/db/users';
import {
  buscarItensDoClienteAction, criarTarefaAction, moverTarefaAction, reordenarTarefasAction,
} from './actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function PlanejamentoPage() {
  await requireReadyUser();

  const [tarefas, clientes, users] = await Promise.all([
    listTarefas(), listTerceiros('clientes'), listUsers(),
  ]);

  return (
    <main className="p-4 md:p-6 space-y-4">
      <h1 className="text-xl font-semibold">Planejamento</h1>
      <KanbanBoard
        tarefas={tarefas} clientes={clientes} users={users}
        criarTarefaAction={criarTarefaAction} buscarItensDoClienteAction={buscarItensDoClienteAction}
        moverTarefaAction={moverTarefaAction} reordenarTarefasAction={reordenarTarefasAction}
      />
    </main>
  );
}
