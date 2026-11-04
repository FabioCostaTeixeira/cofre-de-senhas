import Link from 'next/link';
import { ChamadosBoard } from '@/components/ChamadosBoard';
import { FiltroChamados } from '@/components/FiltroChamados';
import { VerComoBarra } from '@/components/VerComoBarra';
import { requireModulo } from '@/lib/auth/guards';
import { atorVisualizado } from '@/lib/auth/ver-como';
import { resolverVisaoChamados } from '@/lib/chamados-visao';
import { listCategorias } from '@/lib/db/categorias-produto';
import { listChamados } from '@/lib/db/chamados';
import { listProdutos } from '@/lib/db/produtos';
import { listUsers } from '@/lib/db/users';
import {
  apagarChamadoAction, criarChamadoAction, editarChamadoAction, moverChamadoAction, reordenarChamadosAction,
} from './actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROTA = '/working/projetos';

/** Botão das abas Geral/Individual: o ativo fica em destaque. */
function Opcao({ href, ativo, children }: { href: string; ativo: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} className={`btn ${ativo ? 'btn-primary' : ''}`} aria-current={ativo ? 'page' : undefined}>
      {children}
    </Link>
  );
}

/** Quadro de chamados da equipe: produtos de categoria com planejamento 'projeto'
 *  (Projeto › Chamado). Diferente dos quadros do Planejamento, o card nasce aqui.
 *
 *  Master e gestor têm as abas Geral (todos os chamados) e Individual
 *  (`?visao=individual`). Na Individual e para o usuário comum há ainda o filtro
 *  pessoal (`?filtro=todos|abertos|designados`, ver lib/chamados-visao.ts). */
export default async function ProjetosPage({
  searchParams,
}: { searchParams: Promise<{ visao?: string; filtro?: string }> }) {
  const logado = await requireModulo('working');
  const actor = await atorVisualizado(logado);
  const visao = resolverVisaoChamados(actor, await searchParams);

  const [chamados, categorias, produtos, users] = await Promise.all([
    listChamados(visao.consulta), listCategorias(), listProdutos(), listUsers(),
  ]);

  const base = visao.individual ? `${ROTA}?visao=individual&` : `${ROTA}?`;
  const controles = (
    <>
      {visao.temAbas && (
        <nav aria-label="Visão dos chamados" className="flex gap-2">
          <Opcao href={ROTA} ativo={!visao.individual}>Geral</Opcao>
          <Opcao href={`${ROTA}?visao=individual`} ativo={visao.individual}>Individual</Opcao>
        </nav>
      )}
      {visao.filtro && <FiltroChamados atual={visao.filtro} base={base} />}
    </>
  );

  return (
    <main className="p-4 md:p-6 space-y-4">
      <VerComoBarra logado={logado} visto={actor} users={users} />
      <ChamadosBoard
        chamados={chamados} categorias={categorias} produtos={produtos} users={users}
        ator={{ id: actor.id, role: actor.role }} abas={controles} parcial={visao.individual}
        criarChamadoAction={criarChamadoAction} editarChamadoAction={editarChamadoAction}
        moverChamadoAction={moverChamadoAction} reordenarChamadosAction={reordenarChamadosAction}
        apagarChamadoAction={apagarChamadoAction}
      />
    </main>
  );
}
