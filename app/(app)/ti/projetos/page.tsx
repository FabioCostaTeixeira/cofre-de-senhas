import Link from 'next/link';
import { listTiProjetos } from '@/lib/db/ti';
import { requireTiAccess } from '@/lib/auth/guards';
import { ProjetosClient } from './ProjetosClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function TiProjetosPage() {
  await requireTiAccess();
  const projetos = await listTiProjetos();

  return (
    <main className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Projetos de TI (Epics)</h1>
        <Link href="/ti" className="btn text-sm">Voltar ao Módulo</Link>
      </div>
      <ProjetosClient projetos={projetos} />
    </main>
  );
}
