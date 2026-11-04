import Link from 'next/link';
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

const ROTA = '/working/projetos';

/** Quadro de chamados da equipe: produtos de categoria com planejamento 'projeto'
 *  (Projeto › Chamado). Diferente dos quadros do Planejamento, o card nasce aqui.
 *
 *  Master e gestor têm duas abas: Geral (todos os chamados) e Individual
 *  (`?visao=individual`, só os atribuídos a ele, sem a poluição dos alheios). O usuário
 *  comum não tem abas: vê os que abriu ou que foram atribuídos a ele. */
export default async function ProjetosPage({ searchParams }: { searchParams: Promise<{ visao?: string }> }) {
  const logado = await requireModulo('working');
  const actor = await atorVisualizado(logado);
  const { visao } = await searchParams;

  const geral = veTodosChamados(actor);
  const individual = geral && visao === 'individual';
  const filtro = !geral ? { envolvido: actor.id } : individual ? { responsavel: actor.id } : {};

  const [chamados, categorias, produtos, users] = await Promise.all([
    listChamados(filtro), listCategorias(), listProdutos(), listUsers(),
  ]);

  const abas = geral && (
    <nav aria-label="Visão dos chamados" className="flex gap-2">
      <Link href={ROTA} className={`btn ${individual ? '' : 'btn-primary'}`} aria-current={individual ? undefined : 'page'}>
        Geral
      </Link>
      <Link
        href={`${ROTA}?visao=individual`} className={`btn ${individual ? 'btn-primary' : ''}`}
        aria-current={individual ? 'page' : undefined}
      >
        Individual
      </Link>
    </nav>
  );

  return (
    <main className="p-4 md:p-6 space-y-4">
      <VerComoBarra logado={logado} visto={actor} users={users} />
      <ChamadosBoard
        chamados={chamados} categorias={categorias} produtos={produtos} users={users}
        ator={{ id: actor.id, role: actor.role }} abas={abas} parcial={individual}
        criarChamadoAction={criarChamadoAction} editarChamadoAction={editarChamadoAction}
        moverChamadoAction={moverChamadoAction} reordenarChamadosAction={reordenarChamadosAction}
        apagarChamadoAction={apagarChamadoAction}
      />
    </main>
  );
}
