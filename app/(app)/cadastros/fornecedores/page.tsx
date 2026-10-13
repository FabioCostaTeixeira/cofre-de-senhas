import { TerceiroClient } from '@/components/TerceiroClient';
import { requireModulo } from '@/lib/auth/guards';
import { listTerceiros } from '@/lib/db/terceiros';
import { apagarFornecedor, criarFornecedor, salvarFornecedor } from './actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function FornecedoresPage() {
  await requireModulo('fornecedores');
  const itens = await listTerceiros('fornecedores');

  return (
    <main className="p-4 md:p-6 max-w-5xl mx-auto">
      <TerceiroClient
        tipo="fornecedor" itens={itens}
        criar={criarFornecedor} salvar={salvarFornecedor} apagar={apagarFornecedor}
      />
    </main>
  );
}
