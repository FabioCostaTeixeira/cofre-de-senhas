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
 *  de `listContratacoes` em lib/db/contratacoes.ts. */
export async function somarVendasPorTipo(inicio: string, fim: string): Promise<QuantidadePorTipo> {
  const rows = (await sql`
    select tipo, coalesce(sum(quantidade), 0)::int as total
      from contratacoes
     where deleted_at is null and created_at >= ${inicio}::date and created_at < ${fim}::date
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

/** Um studio sem nenhum agendamento no período vem com `blocos: []`. `fim` exclusivo.
 *  Cancelados não entram nos blocos (liberam o studio, mesmo padrão de `existeConflito`
 *  em lib/db/agenda.ts). */
export async function listarStudiosComAgendamentos(
  inicio: string, fim: string,
): Promise<StudioComBlocos[]> {
  const rows = (await sql`
    select e.id as estudio_id, e.nome as estudio_nome, l.nome as local_nome,
           coalesce(
             json_agg(
               json_build_object('hora_inicio', a.hora_inicio::text, 'hora_fim', a.hora_fim::text)
               order by a.hora_inicio
             ) filter (where a.id is not null), '[]'
           ) as blocos
      from estudios e
      join locais_gravacao l on l.id = e.local_id and l.deleted_at is null
      left join agendamentos a on a.estudio_id = e.id and a.deleted_at is null
        and a.status <> 'cancelado' and a.data >= ${inicio}::date and a.data < ${fim}::date
     where e.deleted_at is null
     group by e.id, e.nome, l.nome
     order by l.nome, e.nome`) as StudioComBlocos[];
  return rows;
}
