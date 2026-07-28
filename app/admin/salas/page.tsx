import { Nav } from '@/components/Nav';
import { requireMaster } from '@/lib/auth/guards';
import { listAllRooms, listRoomMembers } from '@/lib/db/queries';
import { listUsers } from '@/lib/db/users';
import { SalasClient } from './SalasClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function SalasAdminPage() {
  const actor = await requireMaster();
  const [salas, usuarios] = await Promise.all([listAllRooms(), listUsers()]);
  const membros = Object.fromEntries(
    await Promise.all(salas.map(async (s) => [s.id, await listRoomMembers(s.id)] as const)),
  );

  return (
    <>
      <Nav actor={actor} />
      <main className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
        <h1 className="text-xl font-semibold">Salas</h1>
        <SalasClient salas={salas} usuarios={usuarios} membros={membros} />
      </main>
    </>
  );
}
