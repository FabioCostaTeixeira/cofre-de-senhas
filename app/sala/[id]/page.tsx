import Link from 'next/link';
import { Nav } from '@/components/Nav';
import { CredentialRowItem } from '@/components/CredentialRow';
import { SearchBox } from '@/components/SearchBox';
import { CredentialForm } from '@/components/CredentialForm';
import { requireReadyUser } from '@/lib/auth/guards';
import {
  getCredentialForEdit, getRoomForActor, listCredentials, listPersonalCredentials,
  listRoomMembersDetailed, listRoomsForActor,
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
  // Busca a credencial em edição direto no banco (não em `creds`, já filtrada pelo
  // termo de busca `q`): assim um filtro ativo que não a inclua não faz o
  // formulário desaparecer sem explicação.
  const edicao = editar ? await getCredentialForEdit(actor, editar) : null;
  const emEdicao = edicao?.row ?? null;
  const notasAtuais = edicao?.notes ?? '';

  // Membros de cada sala do usuário: o formulário troca a lista de pessoas quando
  // a sala muda no dropdown, então precisa de todas de uma vez.
  const precisaMembros = Boolean(nova || emEdicao);
  const membrosPorSala = precisaMembros
    ? Object.fromEntries(
        await Promise.all(
          salasDoUsuario.map(async (s) => [s.id, await listRoomMembersDetailed(s.id)] as const),
        ),
      )
    : {};

  return (
    <>
      <Nav actor={actor} />
      <main className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">
        <div className="flex items-center gap-3 flex-wrap">
          <Link href="/" className="btn">←</Link>
          <h1 className="text-xl font-semibold">
            {pessoal ? '👤 Minhas senhas' : sala!.name}
          </h1>
          {/* Também dá para cadastrar a partir de "Minhas senhas": ali a senha nasce
              pessoal e o usuário escolhe em qual das suas salas ela fica. */}
          {salasDoUsuario.length > 0 && (
            <Link href={`/sala/${id}?nova=1`} className="btn btn-primary ml-auto">
              + Nova senha
            </Link>
          )}
        </div>

        <SearchBox placeholder="Buscar nesta lista..." />

        {nova && salasDoUsuario.length === 0 && (
          <p className="surface p-4 text-sm" style={{ color: 'var(--text-dim)' }}>
            Você ainda não tem acesso a nenhuma sala, e toda senha precisa ficar em uma.
            Peça ao administrador para liberar seu acesso.
          </p>
        )}

        {(nova || emEdicao) && salasDoUsuario.length > 0 && (
          <CredentialForm
            salas={salasDoUsuario.map((s) => ({ id: s.id, name: s.name }))}
            salaPadrao={pessoal ? salasDoUsuario[0]?.id ?? '' : id}
            credencial={emEdicao}
            notasAtuais={notasAtuais}
            globalPorPadrao={!pessoal}
            membrosPorSala={membrosPorSala}
            compartilhadaCom={edicao?.compartilhadaCom ?? []}
            actorId={actor.id}
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
