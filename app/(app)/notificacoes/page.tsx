import { requireReadyUser } from '@/lib/auth/guards';
import { listNotificacoes } from '@/lib/db/notificacoes';
import { NotificacoesClient } from './NotificacoesClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Caixa de notificações do usuário logado. De todo usuário ativo, como "Meus dados". */
export default async function NotificacoesPage() {
  const actor = await requireReadyUser();
  const notificacoes = await listNotificacoes(actor.id);
  return (
    <main className="p-4 md:p-6 space-y-4">
      <NotificacoesClient notificacoes={notificacoes} />
    </main>
  );
}
