import { sql } from '@/lib/db/client';
import { NotFoundError } from '@/lib/authz';
import { assertUuid } from '@/lib/validation';
import type { BloqueioEstudio, DadosBloqueio } from '@/lib/types';

export class ConflitoBloqueioError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
  }
}

async function existeAgendamentoNoIntervalo(
  estudioId: string, data: string, horaInicio: string, horaFim: string,
): Promise<boolean> {
  const rows = (await sql`
    select 1 from agendamentos
     where estudio_id = ${estudioId} and data = ${data} and status <> 'cancelado'
       and deleted_at is null
       and hora_inicio < ${horaFim} and hora_fim > ${horaInicio}
     limit 1`) as unknown[];
  return rows.length > 0;
}

/** Usada tanto por `createBloqueio` (contra outros bloqueios) quanto por
 *  `lib/db/agenda.ts` (contra agendamentos sendo criados/movidos). */
export async function existeBloqueioNoHorario(
  estudioId: string, data: string, horaInicio: string, horaFim: string,
): Promise<boolean> {
  const rows = (await sql`
    select 1 from bloqueios_estudio
     where estudio_id = ${estudioId} and data = ${data} and deleted_at is null
       and hora_inicio < ${horaFim} and hora_fim > ${horaInicio}
     limit 1`) as unknown[];
  return rows.length > 0;
}

export async function listBloqueiosDaSemana(
  estudioId: string, inicioSemana: string,
): Promise<BloqueioEstudio[]> {
  assertUuid(estudioId);
  return (await sql`
    select id, estudio_id, data::text as data, hora_inicio::text as hora_inicio, hora_fim::text as hora_fim,
           motivo, created_at
      from bloqueios_estudio
     where estudio_id = ${estudioId} and deleted_at is null
       and data >= ${inicioSemana}::date and data < (${inicioSemana}::date + interval '7 days')
     order by data, hora_inicio`) as BloqueioEstudio[];
}

/** Todos os bloqueios ativos (hoje em diante) do estúdio, pra listar/gerenciar no modal. */
export async function listBloqueiosAtivos(estudioId: string): Promise<BloqueioEstudio[]> {
  assertUuid(estudioId);
  return (await sql`
    select id, estudio_id, data::text as data, hora_inicio::text as hora_inicio, hora_fim::text as hora_fim,
           motivo, created_at
      from bloqueios_estudio
     where estudio_id = ${estudioId} and deleted_at is null and data >= current_date
     order by data, hora_inicio`) as BloqueioEstudio[];
}

/** Todos os bloqueios ativos do estúdio (sem recorte de data), pra visão em lista. */
export async function listBloqueiosDoEstudio(estudioId: string): Promise<BloqueioEstudio[]> {
  assertUuid(estudioId);
  return (await sql`
    select id, estudio_id, data::text as data, hora_inicio::text as hora_inicio, hora_fim::text as hora_fim,
           motivo, created_at
      from bloqueios_estudio
     where estudio_id = ${estudioId} and deleted_at is null
     order by data, hora_inicio`) as BloqueioEstudio[];
}

export async function createBloqueio(dados: DadosBloqueio): Promise<string> {
  assertUuid(dados.estudio_id);

  if (await existeAgendamentoNoIntervalo(dados.estudio_id, dados.data, dados.hora_inicio, dados.hora_fim)) {
    throw new ConflitoBloqueioError('Já existe um agendamento nesse horário. Mova ou cancele o agendamento antes de bloquear.');
  }
  if (await existeBloqueioNoHorario(dados.estudio_id, dados.data, dados.hora_inicio, dados.hora_fim)) {
    throw new ConflitoBloqueioError('Já existe um bloqueio sobreposto nesse horário.');
  }
  const rows = (await sql`
    insert into bloqueios_estudio (estudio_id, data, hora_inicio, hora_fim, motivo)
    values (${dados.estudio_id}, ${dados.data}, ${dados.hora_inicio}, ${dados.hora_fim}, ${dados.motivo})
    returning id`) as { id: string }[];
  return rows[0].id;
}

export async function softDeleteBloqueio(id: string): Promise<void> {
  assertUuid(id);
  const rows = (await sql`
    update bloqueios_estudio set deleted_at = now()
     where id = ${id} and deleted_at is null
     returning id`) as { id: string }[];
  if (!rows[0]) throw new NotFoundError();
}
