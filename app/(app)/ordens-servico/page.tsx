import { OSClient } from '@/components/OSClient';
import { requireModulo } from '@/lib/auth/guards';
import { listCategorias } from '@/lib/db/categorias-produto';
import { listLocais } from '@/lib/db/locais-gravacao';
import { listOrdensServico } from '@/lib/db/ordens-servico';
import { listProdutos } from '@/lib/db/produtos';
import { listTerceiros } from '@/lib/db/terceiros';
import { isPlanejamento } from '@/lib/kanban';
import { cancelarOS, criarOS } from './actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** `?origem=edicao|gravacao`: veio do botão "Nova tarefa" do Planejamento — o formulário
 *  só oferece categorias daquele quadro e, criada a OS, volta para ele. */
export default async function OrdensServicoPage({ searchParams }: { searchParams: Promise<{ origem?: string }> }) {
  await requireModulo('ordens_servico');
  const { origem: origemParam } = await searchParams;
  const origem = origemParam && isPlanejamento(origemParam) ? origemParam : undefined;
  const [itens, clientes, categorias, produtos, locais] = await Promise.all([
    listOrdensServico(), listTerceiros('clientes'), listCategorias(), listProdutos(), listLocais(),
  ]);
  return (
    <main className="p-4 md:p-6 max-w-6xl mx-auto">
      <OSClient
        itens={itens} clientes={clientes} categorias={categorias} produtos={produtos} locais={locais}
        criar={criarOS} apagar={cancelarOS} origem={origem}
      />
    </main>
  );
}
