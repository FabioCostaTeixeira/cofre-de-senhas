import { redirect } from 'next/navigation';
import { requireModulo } from '@/lib/auth/guards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** O Planejamento virou dois quadros (edicao/ e gravacao/). Esta rota fica porque é o
 *  `href` do módulo 'working' em lib/modules.ts — quem cai aqui vai para Edição. */
export default async function PlanejamentoPage() {
  await requireModulo('working');
  redirect('/working/planejamento/edicao');
}
