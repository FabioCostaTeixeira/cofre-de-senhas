import { LocalGravacaoClient } from '@/components/LocalGravacaoClient';
import { requireModulo } from '@/lib/auth/guards';
import { listLocais } from '@/lib/db/locais-gravacao';
import { apagarLocal, criarLocal, salvarLocal } from './actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function LocaisGravacaoPage() {
  await requireModulo('locais_gravacao');
  const itens = await listLocais();

  return (
    <main className="p-4 md:p-6 max-w-5xl mx-auto">
      <LocalGravacaoClient itens={itens} criar={criarLocal} salvar={salvarLocal} apagar={apagarLocal} />
    </main>
  );
}
