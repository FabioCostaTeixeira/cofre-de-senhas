import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTiProjeto, listTiTarefas } from '@/lib/db/ti-tarefas';
import { requireTiAccess } from '@/lib/auth/guards';
import { TarefasClient } from './TarefasClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function ProjetoDetalhesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireTiAccess();
  const { id } = await params;
  const projeto = await getTiProjeto(id);
  if (!projeto) notFound();

  const tarefas = await listTiTarefas(id);

  return (
    <main className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Detalhes do Projeto (Epic)</h1>
        <Link href="/ti/projetos" className="btn text-sm">Voltar aos Projetos</Link>
      </div>
      <TarefasClient projeto={projeto} tarefas={tarefas} />
    </main>
  );
}
