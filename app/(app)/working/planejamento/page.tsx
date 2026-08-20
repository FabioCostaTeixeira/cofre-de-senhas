import { KanbanBoard } from '@/components/KanbanBoard';
import { requireReadyUser } from '@/lib/auth/guards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function PlanejamentoPage() {
  await requireReadyUser();

  return (
    <main className="p-4 md:p-6 space-y-4">
      <h1 className="text-xl font-semibold">Planejamento</h1>
      <KanbanBoard />
    </main>
  );
}
