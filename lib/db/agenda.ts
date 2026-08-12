import { sql } from '@/lib/db/client';
import { NotFoundError } from '@/lib/authz';
import { assertUuid } from '@/lib/validation';
import { existeBloqueioNoHorario } from '@/lib/db/bloqueios';
import type { Agendamento, DadosAgendamento } from '@/lib/types';

export class ConflitoHorarioError extends Error {
  constructor(mensagem = 'Este estúdio já tem outro agendamento nesse horário.') {
    super(mensagem);
  }
}

/**
 * `status = 'cancelado'` nunca conta (spec): um agendamento cancelado libera o
 * estúdio pra outro. `ignorarId` exclui o próprio registro da checagem, usado por
 * update/mover (sem isso, editar um agendamento sem mudar horário "conflitaria"
 * consigo mesmo).
 */
export async function existeConflito(
  estudioId: string, data: string, horaInicio: string, horaFim: string, ignorarId: string | null,
): Promise<boolean> {
  const rows = (await sql`
    select 1 from agendamentos
     where estudio_id = ${estudioId} and data = ${data} and status <> 'cancelado'
       and deleted_at is null
       and (${ignorarId}::uuid is null or id <> ${ignorarId})
       and hora_inicio < ${horaFim} and hora_fim > ${horaInicio}
     limit 1`) as unknown[];
  return rows.length > 0;
}

export async function listAgendamentosDaSemana(
  estudioId: string, inicioSemana: string,
): Promise<Agendamento[]> {
  assertUuid(estudioId);
  return (await sql`
    select a.id, a.cliente_id, cl.nome as cliente_nome, a.local_id, a.estudio_id, e.nome as estudio_nome,
           a.categoria_produto_id, cp.nome as categoria_nome, a.status,
           a.data::text as data, a.hora_inicio::text as hora_inicio, a.hora_fim::text as hora_fim,
           a.created_at
      from agendamentos a
      join clientes cl on cl.id = a.cliente_id
      join estudios e on e.id = a.estudio_id
      join categorias_produto cp on cp.id = a.categoria_produto_id
     where a.estudio_id = ${estudioId} and a.deleted_at is null
       and a.data >= ${inicioSemana}::date and a.data < (${inicioSemana}::date + interval '7 days')
     order by a.data, a.hora_inicio`) as Agendamento[];
}

/** Todos os agendamentos ativos do estúdio (sem recorte de semana), pra visão em lista. */
export async function listAgendamentosDoEstudio(estudioId: string): Promise<Agendamento[]> {
  assertUuid(estudioId);
  return (await sql`
    select a.id, a.cliente_id, cl.nome as cliente_nome, a.local_id, a.estudio_id, e.nome as estudio_nome,
           a.categoria_produto_id, cp.nome as categoria_nome, a.status,
           a.data::text as data, a.hora_inicio::text as hora_inicio, a.hora_fim::text as hora_fim,
           a.created_at
      from agendamentos a
      join clientes cl on cl.id = a.cliente_id
      join estudios e on e.id = a.estudio_id
      join categorias_produto cp on cp.id = a.categoria_produto_id
     where a.estudio_id = ${estudioId} and a.deleted_at is null
     order by a.data, a.hora_inicio`) as Agendamento[];
}

export async function createAgendamento(dados: DadosAgendamento): Promise<string> {
  assertUuid(dados.cliente_id);
  assertUuid(dados.local_id);
  assertUuid(dados.estudio_id);
  assertUuid(dados.categoria_produto_id);

  if (await existeBloqueioNoHorario(dados.estudio_id, dados.data, dados.hora_inicio, dados.hora_fim)) {
    throw new ConflitoHorarioError('Este horário está bloqueado para manutenção.');
  }
  if (await existeConflito(dados.estudio_id, dados.data, dados.hora_inicio, dados.hora_fim, null)) {
    throw new ConflitoHorarioError();
  }
  const rows = (await sql`
    insert into agendamentos (
      cliente_id, local_id, estudio_id, categoria_produto_id, status, data, hora_inicio, hora_fim)
    values (
      ${dados.cliente_id}, ${dados.local_id}, ${dados.estudio_id}, ${dados.categoria_produto_id},
      ${dados.status}, ${dados.data}, ${dados.hora_inicio}, ${dados.hora_fim})
    returning id`) as { id: string }[];
  return rows[0].id;
}

export async function updateAgendamento(id: string, dados: DadosAgendamento): Promise<void> {
  assertUuid(id);
  assertUuid(dados.cliente_id);
  assertUuid(dados.local_id);
  assertUuid(dados.estudio_id);
  assertUuid(dados.categoria_produto_id);

  if (await existeBloqueioNoHorario(dados.estudio_id, dados.data, dados.hora_inicio, dados.hora_fim)) {
    throw new ConflitoHorarioError('Este horário está bloqueado para manutenção.');
  }
  if (await existeConflito(dados.estudio_id, dados.data, dados.hora_inicio, dados.hora_fim, id)) {
    throw new ConflitoHorarioError();
  }
  const rows = (await sql`
    update agendamentos
       set cliente_id = ${dados.cliente_id}, local_id = ${dados.local_id}, estudio_id = ${dados.estudio_id},
           categoria_produto_id = ${dados.categoria_produto_id}, status = ${dados.status},
           data = ${dados.data}, hora_inicio = ${dados.hora_inicio}, hora_fim = ${dados.hora_fim},
           updated_at = now()
     where id = ${id} and deleted_at is null
     returning id`) as { id: string }[];
  if (!rows[0]) throw new NotFoundError();
}

/**
 * Só troca a janela de tempo — usado por mover (arrastar o card, muda dia+início,
 * duração preservada) e redimensionar (muda só o fim). Os outros campos do
 * agendamento ficam intactos.
 */
export async function moverOuRedimensionar(
  id: string, data: string, horaInicio: string, horaFim: string,
): Promise<void> {
  assertUuid(id);
  const atual = (await sql`
    select estudio_id from agendamentos where id = ${id} and deleted_at is null`) as { estudio_id: string }[];
  if (!atual[0]) throw new NotFoundError();

  if (await existeBloqueioNoHorario(atual[0].estudio_id, data, horaInicio, horaFim)) {
    throw new ConflitoHorarioError('Este horário está bloqueado para manutenção.');
  }
  if (await existeConflito(atual[0].estudio_id, data, horaInicio, horaFim, id)) {
    throw new ConflitoHorarioError();
  }
  await sql`
    update agendamentos set data = ${data}, hora_inicio = ${horaInicio}, hora_fim = ${horaFim}, updated_at = now()
     where id = ${id}`;
}

export async function softDeleteAgendamento(id: string): Promise<void> {
  assertUuid(id);
  const rows = (await sql`
    update agendamentos set deleted_at = now()
     where id = ${id} and deleted_at is null
     returning id`) as { id: string }[];
  if (!rows[0]) throw new NotFoundError();
}
