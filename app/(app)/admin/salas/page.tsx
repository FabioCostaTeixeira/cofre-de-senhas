import { requireMaster } from '@/lib/auth/guards';
import { listAllRooms, listRoomMembers } from '@/lib/db/queries';
import { listUsers } from '@/lib/db/users';
import { SalasClient } from './SalasClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function SalasAdminPage() {
  const actor = await requireMaster();
  const [salas, usuarios] = await Promise.all([listAllRooms(), listUsers()]);

  // Aqui os membros são apenas exibidos. Conceder acesso acontece na tela do
  // usuário, onde se resolve tudo de uma vez em vez de sala por sala.
  const nomePorId = new Map(usuarios.map((u) => [u.id, u.name]));
  const membros = Object.fromEntries(
    await Promise.all(
      salas.map(async (s) => {
        const ids = await listRoomMembers(s.id);
        return [s.id, ids.map((id) => nomePorId.get(id) ?? '—').sort()] as const;
      }),
    ),
  );

  return (
      <main className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
        <h1 className="text-xl font-semibold">Salas</h1>
        <SalasClient salas={salas} membros={membros} />
      </main>
  );
}
