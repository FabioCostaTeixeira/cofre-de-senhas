import { ComboClient } from '@/components/ComboClient';
import { requireMaster } from '@/lib/auth/guards';
import { listCombos } from '@/lib/db/combos';
import { listProdutos } from '@/lib/db/produtos';
import { apagarCombo, criarCombo, salvarCombo } from './actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function CombosPage() {
  await requireMaster();
  const [itens, produtos] = await Promise.all([listCombos(), listProdutos()]);
  return (
    <main className="p-4 md:p-6 max-w-5xl mx-auto">
      <ComboClient itens={itens} produtos={produtos} criar={criarCombo} salvar={salvarCombo} apagar={apagarCombo} />
    </main>
  );
}
