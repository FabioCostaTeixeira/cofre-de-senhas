import { CategoriaClient } from '@/components/CategoriaClient';
import { requireModulo } from '@/lib/auth/guards';
import { listCategorias } from '@/lib/db/categorias-produto';
import { apagarCategoria, criarCategoria, salvarCategoria } from './actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function CategoriasProdutoPage() {
  await requireModulo('produtos');
  const itens = await listCategorias();
  return (
    <main className="p-4 md:p-6 max-w-5xl mx-auto">
      <CategoriaClient itens={itens} criar={criarCategoria} salvar={salvarCategoria} apagar={apagarCategoria} />
    </main>
  );
}
