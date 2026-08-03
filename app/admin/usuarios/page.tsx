import { Nav } from '@/components/Nav';
import { requireMaster } from '@/lib/auth/guards';
import { listAllRooms, listModulesOfUser, listRoomsOfUser } from '@/lib/db/queries';
import { listUsers } from '@/lib/db/users';
import { UsuariosClient } from './UsuariosClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function UsuariosPage() {
  const actor = await requireMaster();
  const [usuarios, salas] = await Promise.all([listUsers(), listAllRooms()]);

  // O acesso às salas é concedido aqui, na tela do usuário: são muito mais salas
  // do que pessoas, e liberar um usuário novo sala por sala seria inviável.
  const membros = Object.fromEntries(
    await Promise.all(
      usuarios.map(async (u) => [u.id, await listRoomsOfUser(u.id)] as const),
    ),
  );

  const modulosPorUsuario = Object.fromEntries(
    await Promise.all(
      usuarios.map(async (u) => [u.id, await listModulesOfUser(u.id)] as const),
    ),
  );

  return (
    <>
      <Nav actor={actor} />
      <main className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
        <h1 className="text-xl font-semibold">Usuários</h1>
        <UsuariosClient
          usuarios={usuarios}
          salas={salas.map((s) => ({ id: s.id, name: s.name }))}
          membros={membros}
          modulosPorUsuario={modulosPorUsuario}
        />
      </main>
    </>
  );
}
