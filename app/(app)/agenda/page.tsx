import { AgendaClient } from '@/components/AgendaClient';
import { requireModulo } from '@/lib/auth/guards';
import { diasDaGradeDoMes, mesDe, mesValido } from '@/lib/agenda-calendario';
import { listAgendamentosDaSemana, listAgendamentosDoEstudio, listAgendamentosDoPeriodo } from '@/lib/db/agenda';
import { listBloqueiosAtivos, listBloqueiosDaSemana, listBloqueiosDoEstudio } from '@/lib/db/bloqueios';
import { listLocais } from '@/lib/db/locais-gravacao';
import { listProdutos } from '@/lib/db/produtos';
import { listTerceiros } from '@/lib/db/terceiros';
import { apagarAgendamento, apagarBloqueio, criarAgendamento, criarBloqueio, moverAgendamento, salvarAgendamento } from './actions';

export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';
function segundaAtualISO() { const hoje = new Date(); const dia = hoje.getDay(); hoje.setDate(hoje.getDate() + (dia === 0 ? -6 : 1 - dia)); return hoje.toISOString().slice(0, 10); }
export default async function AgendaPage({ searchParams }: { searchParams: Promise<{ estudioId?: string; semana?: string; visao?: string; mes?: string }> }) {
  await requireModulo('agenda'); const { estudioId: param, semana, visao, mes: mesParam } = await searchParams;
  const [clientes, produtos, locais] = await Promise.all([listTerceiros('clientes'), listProdutos(), listLocais()]);
  const primeiro = locais.flatMap((l) => l.estudios)[0]?.id ?? ''; const estudioId = param || primeiro; const inicioSemana = semana || segundaAtualISO();
  const [itens, itensDoEstudio, bloqueiosDaSemana, bloqueiosAtivos, bloqueiosDoEstudio] = estudioId
    ? await Promise.all([
      listAgendamentosDaSemana(estudioId, inicioSemana),
      listAgendamentosDoEstudio(estudioId),
      listBloqueiosDaSemana(estudioId, inicioSemana),
      listBloqueiosAtivos(estudioId),
      listBloqueiosDoEstudio(estudioId),
    ])
    : [[], [], [], [], []];
  // Calendário mensal: todos os estúdios, cobrindo a grade inteira (inclui as pontas dos meses vizinhos).
  let calendario: { mes: string; itens: Awaited<ReturnType<typeof listAgendamentosDoPeriodo>> } | undefined;
  if (visao === 'calendario') {
    const mes = mesValido(mesParam) ? mesParam : mesDe(inicioSemana);
    const grade = diasDaGradeDoMes(mes);
    calendario = { mes, itens: await listAgendamentosDoPeriodo(grade[0], grade[grade.length - 1]) };
  }
  return <main className={`p-4 md:p-6 mx-auto ${calendario ? 'max-w-[100rem]' : 'max-w-6xl'}`}>{!estudioId ? <p className="text-sm" style={{ color: 'var(--text-dim)' }}>Cadastre um local de gravação com pelo menos um estúdio antes de usar a agenda.</p> : <AgendaClient itens={itens} itensDoEstudio={itensDoEstudio} bloqueiosDaSemana={bloqueiosDaSemana} bloqueiosAtivos={bloqueiosAtivos} bloqueiosDoEstudio={bloqueiosDoEstudio} clientes={clientes} locais={locais} produtos={produtos.filter((p) => p.ativo)} estudioId={estudioId} inicioSemana={inicioSemana} criar={criarAgendamento} salvar={salvarAgendamento} apagar={apagarAgendamento} mover={moverAgendamento} criarBloqueio={criarBloqueio} apagarBloqueio={apagarBloqueio} calendario={calendario} />}</main>;
}
