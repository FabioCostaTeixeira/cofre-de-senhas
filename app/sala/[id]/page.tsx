import Link from 'next/link';
import { Nav } from '@/components/Nav';
import { CredentialRowItem } from '@/components/CredentialRow';
import { SearchBox } from '@/components/SearchBox';
import { CredentialForm } from '@/components/CredentialForm';
import { requireReadyUser } from '@/lib/auth/guards';
import {
  getRoomForActor, listCredentials, listPersonalCredentials, listRoomsForActor,
} from '@/lib/db/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function SalaPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; nova?: string; editar?: string }>;
}) {
  const actor = await requireReadyUser();
  const { id } = await params;
  const { q = '', nova, editar } = await searchParams;

  const pessoal = id === 'minhas';
  const sala = pessoal ? null : await getRoomForActor(actor, id);
  const todas = pessoal
    ? await listPersonalCredentials(actor)
    : await listCredentials(actor, id, q);
  const creds = pessoal && q
    ? todas.filter((c) =>
        [c.title, c.username, c.url].some((v) => v?.toLowerCase().includes(q.toLowerCase())))
    : todas;

  const salasDoUsuario = await listRoomsForActor(actor);
  const emEdicao = editar ? creds.find((c) => c.id === editar) ?? null : null;

  return (
    <>
      <Nav actor={actor} />
      <main className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">
        <div className="flex items-center gap-3 flex-wrap">
          <Link href="/" className="btn">←</Link>
          <h1 className="text-xl font-semibold">
            {pessoal ? '👤 Minhas senhas' : sala!.name}
          </h1>
          {!pessoal && (
            <Link href={`/sala/${id}?nova=1`} className="btn btn-primary ml-auto">
              + Nova senha
            </Link>
          )}
        </div>

        <SearchBox placeholder="Buscar nesta lista..." />

        {(nova || emEdicao) && (
          <CredentialForm
            salas={salasDoUsuario.map((s) => ({ id: s.id, name: s.name }))}
            salaPadrao={pessoal ? salasDoUsuario[0]?.id ?? '' : id}
            credencial={emEdicao}
            voltarPara={`/sala/${id}`}
          />
        )}

        <div className="surface divide-y" style={{ borderColor: 'var(--border)' }}>
          {creds.map((c) => (
            <CredentialRowItem
              key={c.id} cred={c} actorId={actor.id}
              isMaster={actor.role === 'master'} showRoom={pessoal}
            />
          ))}
          {creds.length === 0 && (
            <p className="p-8 text-center text-sm" style={{ color: 'var(--text-dim)' }}>
              Nenhuma senha aqui ainda.
            </p>
          )}
        </div>
      </main>
    </>
  );
}
