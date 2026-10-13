import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTiTarefa, listTiAtividades, listTiTarefasDisponiveis } from '@/lib/db/ti-tarefas';
import { requireTiAccess } from '@/lib/auth/guards';
import { AtividadesClient } from './AtividadesClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function TarefaDetalhesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireTiAccess();
  const { id } = await params;
  const tarefa = await getTiTarefa(id);
  if (!tarefa) notFound();

  const [atividades, tarefasDisponiveis] = await Promise.all([
    listTiAtividades(id),
    listTiTarefasDisponiveis(),
  ]);

  return (
    <main className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Detalhes da Tarefa (Feature)</h1>
        <Link href={`/ti/projetos/${tarefa.projeto_id}`} className="btn text-sm">Voltar ao Projeto</Link>
      </div>
      <AtividadesClient tarefa={tarefa} atividades={atividades} tarefasDisponiveis={tarefasDisponiveis} />
    </main>
  );
}
