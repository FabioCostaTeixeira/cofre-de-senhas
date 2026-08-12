import { OSClient } from '@/components/OSClient';
import { requireMaster } from '@/lib/auth/guards';
import { listLocais } from '@/lib/db/locais-gravacao';
import { listOrdensServico } from '@/lib/db/ordens-servico';
import { listProdutos } from '@/lib/db/produtos';
import { listTerceiros } from '@/lib/db/terceiros';
import { cancelarOS, criarOS } from './actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function OrdensServicoPage() {
  await requireMaster();
  const [itens, clientes, produtos, locais] = await Promise.all([
    listOrdensServico(), listTerceiros('clientes'), listProdutos(), listLocais(),
  ]);
  return (
    <main className="p-4 md:p-6 max-w-6xl mx-auto">
      <OSClient
        itens={itens} clientes={clientes} produtos={produtos} locais={locais}
        criar={criarOS} apagar={cancelarOS}
      />
    </main>
  );
}
