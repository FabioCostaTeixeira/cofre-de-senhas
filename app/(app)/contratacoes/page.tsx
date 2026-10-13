import { ContratacaoClient } from '@/components/ContratacaoClient';
import { requireModulo } from '@/lib/auth/guards';
import { listCombos } from '@/lib/db/combos';
import { listContratacoes } from '@/lib/db/contratacoes';
import { listPlanos } from '@/lib/db/planos';
import { listProdutos } from '@/lib/db/produtos';
import { listTerceiros } from '@/lib/db/terceiros';
import { apagarContratacao, criarContratacao } from './actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function ContratacoesPage() {
  await requireModulo('contratacoes');
  const [itens, clientes, produtos, combos, planos] = await Promise.all([
    listContratacoes(), listTerceiros('clientes'), listProdutos(), listCombos(), listPlanos(),
  ]);
  return (
    <main className="p-4 md:p-6 max-w-6xl mx-auto">
      <ContratacaoClient
        itens={itens} clientes={clientes} produtos={produtos} combos={combos} planos={planos}
        criar={criarContratacao} apagar={apagarContratacao}
      />
    </main>
  );
}
