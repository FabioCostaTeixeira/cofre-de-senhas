import { Nav } from '@/components/Nav';
import { requireMaster } from '@/lib/auth/guards';
import { listUsers } from '@/lib/db/users';
import { UsuariosClient } from './UsuariosClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function UsuariosPage() {
  const actor = await requireMaster();
  const usuarios = await listUsers();

  return (
    <>
      <Nav actor={actor} />
      <main className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
        <h1 className="text-xl font-semibold">Usuários</h1>
        <UsuariosClient usuarios={usuarios} />
      </main>
    </>
  );
}
