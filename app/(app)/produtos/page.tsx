import { ProdutoClient } from '@/components/ProdutoClient';
import { requireMaster } from '@/lib/auth/guards';
import { listCategorias } from '@/lib/db/categorias-produto';
import { listProdutos } from '@/lib/db/produtos';
import { apagarProduto, criarProduto, salvarProduto } from './actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function ProdutosPage() {
  await requireMaster();
  const [itens, categorias] = await Promise.all([listProdutos(), listCategorias()]);
  return (
    <main className="p-4 md:p-6 max-w-5xl mx-auto">
      <ProdutoClient itens={itens} categorias={categorias} criar={criarProduto} salvar={salvarProduto} apagar={apagarProduto} />
    </main>
  );
}
