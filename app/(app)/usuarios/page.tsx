import Link from 'next/link';
import { requireReadyUser } from '@/lib/auth/guards';
import { camposEditaveis } from '@/lib/authz';
import { listAllRooms, listModulesOfUser, listRoomsOfUser } from '@/lib/db/queries';
import { getPessoa } from '@/lib/db/pessoas';
import { getUserComContato, listUsersComContato, listVinculosDaPessoa } from '@/lib/db/users';
import { UsuariosClient } from './UsuariosClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function UsuariosPage({
  searchParams,
}: {
  searchParams: Promise<{ desligados?: string }>;
}) {
  const actor = await requireReadyUser();
  const escopo = camposEditaveis(actor, actor.id);
  const { desligados } = await searchParams;
  const incluirDesligados = desligados === '1';

  // Usuário comum não recebe a lista de ninguém: o servidor nem busca.
  const eu = await getUserComContato(actor.id);
  const pessoa = eu ? await getPessoa(eu.pessoa_id) : null;

  const usuarios = escopo === 'todos' ? await listUsersComContato(incluirDesligados) : [];
  const salas = escopo === 'todos' ? await listAllRooms() : [];
  const salasDoUsuario = eu ? await listRoomsOfUser(eu.id) : [];
  const modulosDoUsuario = eu ? await listModulesOfUser(eu.id) : [];
  const vinculos = eu ? await listVinculosDaPessoa(eu.pessoa_id) : [];

  return (
    <main className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold flex-1">
          {escopo === 'todos' ? 'Usuários' : 'Meus dados'}
        </h1>
        {escopo === 'todos' && (
          // Link, e não checkbox: o estado vive na URL, então recarregar ou
          // compartilhar o endereço preserva o filtro sem estado de cliente.
          <Link
            href={incluirDesligados ? '/usuarios' : '/usuarios?desligados=1'}
            className="btn text-sm"
          >
            {incluirDesligados ? 'Ocultar desligados' : 'Incluir desligados'}
          </Link>
        )}
      </div>
      <UsuariosClient
        escopo={escopo}
        usuarios={usuarios}
        eu={eu}
        pessoa={pessoa}
        salas={salas.map((s) => ({ id: s.id, name: s.name }))}
        salasDoUsuario={salasDoUsuario}
        modulosDoUsuario={modulosDoUsuario}
        vinculos={vinculos}
      />
    </main>
  );
}
