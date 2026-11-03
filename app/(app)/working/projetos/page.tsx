import { ChamadosBoard } from '@/components/ChamadosBoard';
import { requireModulo } from '@/lib/auth/guards';
import { listCategorias } from '@/lib/db/categorias-produto';
import { listChamados } from '@/lib/db/chamados';
import { listProdutos } from '@/lib/db/produtos';
import { listUsers } from '@/lib/db/users';
import {
  apagarChamadoAction, criarChamadoAction, editarChamadoAction, moverChamadoAction, reordenarChamadosAction,
} from './actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Quadro de chamados da equipe: produtos de categoria com planejamento 'projeto'
 *  (Projeto › Chamado). Diferente dos quadros do Planejamento, o card nasce aqui. */
export default async function ProjetosPage() {
  await requireModulo('working');

  const [chamados, categorias, produtos, users] = await Promise.all([
    listChamados(), listCategorias(), listProdutos(), listUsers(),
  ]);

  return (
    <main className="p-4 md:p-6">
      <ChamadosBoard
        chamados={chamados} categorias={categorias} produtos={produtos} users={users}
        criarChamadoAction={criarChamadoAction} editarChamadoAction={editarChamadoAction}
        moverChamadoAction={moverChamadoAction} reordenarChamadosAction={reordenarChamadosAction}
        apagarChamadoAction={apagarChamadoAction}
      />
    </main>
  );
}
