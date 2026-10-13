import { TerceiroClient } from '@/components/TerceiroClient';
import { requireModulo } from '@/lib/auth/guards';
import { listTerceiros } from '@/lib/db/terceiros';
import { apagarCliente, buscarDadosClienteAction, criarCliente, salvarCliente } from './actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function ClientesPage() {
  await requireModulo('clientes');
  const itens = await listTerceiros('clientes');

  return (
    <main className="p-4 md:p-6 max-w-5xl mx-auto">
      <TerceiroClient
        tipo="cliente" itens={itens}
        criar={criarCliente} salvar={salvarCliente} apagar={apagarCliente}
        buscarDadosCliente={buscarDadosClienteAction}
      />
    </main>
  );
}
