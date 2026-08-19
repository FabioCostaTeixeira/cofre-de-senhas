import { PersonalCard, RoomCard } from '@/components/RoomCard';
import { SearchBox } from '@/components/SearchBox';
import { CredentialRowItem } from '@/components/CredentialRow';
import { requireReadyUser } from '@/lib/auth/guards';
import {
  listPersonalCredentials, listRoomsForActor, searchAllCredentials,
} from '@/lib/db/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const actor = await requireReadyUser();
  const { q = '' } = await searchParams;

  const [salas, pessoais, resultados] = await Promise.all([
    listRoomsForActor(actor),
    listPersonalCredentials(actor),
    q ? searchAllCredentials(actor, q) : Promise.resolve([]),
  ]);

  return (
      <main className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
        <SearchBox placeholder="Buscar em todas as senhas..." />

        {q ? (
          <section className="space-y-2">
            <h2 className="text-sm" style={{ color: 'var(--text-dim)' }}>
              {resultados.length} resultado{resultados.length === 1 ? '' : 's'} para “{q}”
            </h2>
            <div className="surface divide-y" style={{ borderColor: 'var(--border)' }}>
              {resultados.map((c) => (
                <CredentialRowItem key={c.id} cred={c} actorId={actor.id} isMaster={actor.role === 'master'} showRoom />
              ))}
              {resultados.length === 0 && (
                <p className="p-6 text-center text-sm" style={{ color: 'var(--text-dim)' }}>
                  Nada encontrado.
                </p>
              )}
            </div>
          </section>
        ) : (
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <PersonalCard count={pessoais.length} />
            {salas.map((sala) => (
              <RoomCard key={sala.id} room={sala} />
            ))}
            {salas.length === 0 && (
              <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
                Você ainda não tem acesso a nenhuma sala. Peça ao administrador.
              </p>
            )}
          </section>
        )}
      </main>
  );
}
