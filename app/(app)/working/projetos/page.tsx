import { ChamadosBoard } from '@/components/ChamadosBoard';
import { VerComoBarra } from '@/components/VerComoBarra';
import { requireModulo } from '@/lib/auth/guards';
import { atorVisualizado } from '@/lib/auth/ver-como';
import { listCategorias } from '@/lib/db/categorias-produto';
import { listChamados } from '@/lib/db/chamados';
import { listProdutos } from '@/lib/db/produtos';
import { listUsers } from '@/lib/db/users';
import { veTodosChamados } from '@/lib/permissoes-cards';
import {
  apagarChamadoAction, criarChamadoAction, editarChamadoAction, moverChamadoAction, reordenarChamadosAction,
} from './actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Quadro de chamados da equipe: produtos de categoria com planejamento 'projeto'
 *  (Projeto › Chamado). Diferente dos quadros do Planejamento, o card nasce aqui. */
export default async function ProjetosPage() {
  const logado = await requireModulo('working');
  const actor = await atorVisualizado(logado);

  // Fora master/gestor, só os chamados que a pessoa abriu ou que foram atribuídos a ela.
  const [chamados, categorias, produtos, users] = await Promise.all([
    listChamados(veTodosChamados(actor) ? undefined : actor.id), listCategorias(), listProdutos(), listUsers(),
  ]);

  return (
    <main className="p-4 md:p-6 space-y-4">
      <VerComoBarra logado={logado} visto={actor} users={users} />
      <ChamadosBoard
        chamados={chamados} categorias={categorias} produtos={produtos} users={users}
        ator={{ id: actor.id, role: actor.role }}
        criarChamadoAction={criarChamadoAction} editarChamadoAction={editarChamadoAction}
        moverChamadoAction={moverChamadoAction} reordenarChamadosAction={reordenarChamadosAction}
        apagarChamadoAction={apagarChamadoAction}
      />
    </main>
  );
}
