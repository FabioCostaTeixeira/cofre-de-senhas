import { sql } from '@/lib/db/client';
import type { StatusAgendamento, TipoContratacao } from '@/lib/types';

export async function contarClientesAtivos(): Promise<number> {
  const rows = (await sql`
    select count(*)::int as total from clientes where deleted_at is null`) as { total: number }[];
  return rows[0].total;
}

export type ContagemPorStatus = Record<StatusAgendamento, number>;

/** `fim` é exclusivo: `data >= inicio and data < fim`. */
export async function contarAgendamentosPorStatus(
  inicio: string, fim: string,
): Promise<ContagemPorStatus> {
  const rows = (await sql`
    select status, count(*)::int as total
      from agendamentos
     where deleted_at is null and data >= ${inicio}::date and data < ${fim}::date
     group by status`) as { status: StatusAgendamento; total: number }[];
  const base: ContagemPorStatus = {
    agendado: 0, pre_agendado: 0, gravando: 0, concluido: 0, cancelado: 0,
  };
  for (const r of rows) base[r.status] = r.total;
  return base;
}

export type QuantidadePorTipo = Record<TipoContratacao, number>;

/** `fim` é exclusivo. Contratações canceladas (`deleted_at`) não contam — mesmo padrão
 *  de `listContratacoes` em lib/db/contratacoes.ts.
 *
 *  `created_at` é `timestamptz` e o servidor roda em UTC (mesmo motivo do fuso fixo em
 *  `lib/formato.ts`): comparar direto com `${inicio}::date`/`${fim}::date` compararia
 *  contra meia-noite UTC, que é 21h do dia anterior em Brasília — uma venda registrada
 *  depois das 21h local cairia no bucket do dia seguinte. `(${inicio}::date)::timestamp
 *  at time zone 'America/Sao_Paulo'` converte a meia-noite *local* de Brasília pro
 *  `timestamptz` equivalente antes de comparar. */
export async function somarVendasPorTipo(inicio: string, fim: string): Promise<QuantidadePorTipo> {
  const rows = (await sql`
    select tipo, coalesce(sum(quantidade), 0)::int as total
      from contratacoes
     where deleted_at is null
       and created_at >= (${inicio}::date)::timestamp at time zone 'America/Sao_Paulo'
       and created_at < (${fim}::date)::timestamp at time zone 'America/Sao_Paulo'
     group by tipo`) as { tipo: TipoContratacao; total: number }[];
  const base: QuantidadePorTipo = { avulso: 0, combo: 0, plano: 0 };
  for (const r of rows) base[r.tipo] = r.total;
  return base;
}

export type StudioComBlocos = {
  estudio_id: string;
  estudio_nome: string;
  local_nome: string;
  blocos: { hora_inicio: string; hora_fim: string }[];
};

/** Um studio sem nenhum agendamento/bloqueio no período vem com `blocos: []`. `fim`
 *  exclusivo. Cancelados não entram nos blocos (liberam o studio, mesmo padrão de
 *  `existeConflito` em lib/db/agenda.ts).
 *
 *  `blocos` junta duas fontes de indisponibilidade: agendamentos (tabela `agendamentos`)
 *  e bloqueios do próprio estúdio (tabela `bloqueios_estudio` — motivo de indisponibilidade
 *  que não é agendamento, ex.: manutenção; ver lib/db/bloqueios.ts, onde `existeBloqueioNoHorario`
 *  já é checado antes de permitir um agendamento novo). As duas são unidas numa CTE antes do
 *  `left join` com `estudios`: um `left join` direto nas duas tabelas sob o mesmo `group by`
 *  produziria produto cartesiano (cada agendamento repetido uma vez por bloqueio do mesmo
 *  estúdio, e vice-versa), inflando/corrompendo a soma de minutos feita depois por
 *  `calcularTempoStudio`. */
export async function listarStudiosComAgendamentos(
  inicio: string, fim: string,
): Promise<StudioComBlocos[]> {
  const rows = (await sql`
    with blocos_periodo as (
      select estudio_id, hora_inicio, hora_fim
        from agendamentos
       where deleted_at is null and status <> 'cancelado'
         and data >= ${inicio}::date and data < ${fim}::date
      union all
      select estudio_id, hora_inicio, hora_fim
        from bloqueios_estudio
       where deleted_at is null
         and data >= ${inicio}::date and data < ${fim}::date
    )
    select e.id as estudio_id, e.nome as estudio_nome, l.nome as local_nome,
           coalesce(
             json_agg(
               json_build_object('hora_inicio', b.hora_inicio::text, 'hora_fim', b.hora_fim::text)
               order by b.hora_inicio
             ) filter (where b.hora_inicio is not null), '[]'
           ) as blocos
      from estudios e
      join locais_gravacao l on l.id = e.local_id and l.deleted_at is null
      left join blocos_periodo b on b.estudio_id = e.id
     where e.deleted_at is null
     group by e.id, e.nome, l.nome
     order by l.nome, e.nome`) as StudioComBlocos[];
  return rows;
}
