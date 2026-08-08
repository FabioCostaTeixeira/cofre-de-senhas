import { PlanoClient } from '@/components/PlanoClient';
import { requireMaster } from '@/lib/auth/guards';
import { listCombos } from '@/lib/db/combos';
import { listPlanos } from '@/lib/db/planos';
import { listProdutos } from '@/lib/db/produtos';
import { apagarPlano, criarPlano, salvarPlano } from './actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function PlanosPage() {
  await requireMaster();
  const [itens, produtos, combos] = await Promise.all([listPlanos(), listProdutos(), listCombos()]);
  return (
    <main className="p-4 md:p-6 max-w-5xl mx-auto">
      <PlanoClient itens={itens} produtos={produtos} combos={combos} criar={criarPlano} salvar={salvarPlano} apagar={apagarPlano} />
    </main>
  );
}
