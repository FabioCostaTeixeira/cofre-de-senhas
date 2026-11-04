import { sql } from '@/lib/db/client';
import { NotFoundError } from '@/lib/authz';
import { assertUuid } from '@/lib/validation';

/** Card de TI dono de uma timeline: Feature (`tarefa`) ou User Story (`atividade`). */
export type CardTi = { tipo: 'tarefa' | 'atividade'; id: string };

export type TiHistorico = {
  id: string;
  tipo: 'movimentacao' | 'nota';
  status_de: string | null;
  status_para: string | null;
  descricao: string;
  usuario_nome: string;
  created_at: string;
};

/** Trocar o status de um card de TI exige dizer por quê. */
export class MotivoObrigatorioError extends Error {
  constructor() {
    super('Informe o motivo da movimentação.');
  }
}

/** Mais recente primeiro. */
export async function listHistoricoTi(card: CardTi): Promise<TiHistorico[]> {
  assertUuid(card.id);
  const tarefa = card.tipo === 'tarefa' ? card.id : null;
  const atividade = card.tipo === 'atividade' ? card.id : null;
  return (await sql`
    select h.id, h.tipo, h.status_de, h.status_para, h.descricao, u.name as usuario_nome, h.created_at
      from ti_historico h
      join users u on u.id = h.usuario_id
     where (${tarefa}::uuid is not null and h.tarefa_id = ${tarefa})
        or (${atividade}::uuid is not null and h.atividade_id = ${atividade})
     order by h.created_at desc`) as TiHistorico[];
}

export async function addNotaTi(card: CardTi, usuarioId: string, descricao: string): Promise<void> {
  assertUuid(card.id);
  assertUuid(usuarioId);
  if (!descricao.trim()) throw new MotivoObrigatorioError();
  const rows = card.tipo === 'tarefa'
    ? (await sql`
        insert into ti_historico (tarefa_id, usuario_id, tipo, descricao)
        select id, ${usuarioId}, 'nota', ${descricao.trim()} from ti_tarefas where id = ${card.id}
        returning id`) as { id: string }[]
    : (await sql`
        insert into ti_historico (atividade_id, usuario_id, tipo, descricao)
        select id, ${usuarioId}, 'nota', ${descricao.trim()} from ti_atividades where id = ${card.id}
        returning id`) as { id: string }[];
  if (!rows[0]) throw new NotFoundError();
}

/**
 * Troca o status e grava a movimentação na timeline numa única instrução: os CTEs
 * enxergam o mesmo instantâneo, então `atual` traz o status de antes do update e não
 * existe troca sem registro (nem registro sem troca). Mesmo status: nada acontece.
 * Devolve o pai do card para a action revalidar a página certa.
 */
export async function moverCardTi(
  card: CardTi, status: string, usuarioId: string, motivo: string,
): Promise<{ paiId: string } | null> {
  assertUuid(card.id);
  assertUuid(usuarioId);
  if (!motivo.trim()) throw new MotivoObrigatorioError();

  if (card.tipo === 'tarefa') {
    const atual = (await sql`select projeto_id, status from ti_tarefas where id = ${card.id}`) as
      { projeto_id: string; status: string }[];
    if (!atual[0]) throw new NotFoundError();
    if (atual[0].status === status) return null;
    await sql`
      with atual as (select status from ti_tarefas where id = ${card.id}),
           mov as (update ti_tarefas set status = ${status} where id = ${card.id} and status <> ${status} returning id)
      insert into ti_historico (tarefa_id, usuario_id, tipo, status_de, status_para, descricao)
      select mov.id, ${usuarioId}, 'movimentacao', atual.status, ${status}, ${motivo.trim()} from mov, atual`;
    return { paiId: atual[0].projeto_id };
  }

  const atual = (await sql`select tarefa_id, status from ti_atividades where id = ${card.id}`) as
    { tarefa_id: string; status: string }[];
  if (!atual[0]) throw new NotFoundError();
  if (atual[0].status === status) return null;
  await sql`
    with atual as (select status from ti_atividades where id = ${card.id}),
         mov as (update ti_atividades set status = ${status} where id = ${card.id} and status <> ${status} returning id)
    insert into ti_historico (atividade_id, usuario_id, tipo, status_de, status_para, descricao)
    select mov.id, ${usuarioId}, 'movimentacao', atual.status, ${status}, ${motivo.trim()} from mov, atual`;
  return { paiId: atual[0].tarefa_id };
}

/** Status atual do card, para a edição pelo formulário saber se houve movimentação. */
export async function statusAtualTi(card: CardTi): Promise<string | null> {
  assertUuid(card.id);
  const rows = card.tipo === 'tarefa'
    ? (await sql`select status from ti_tarefas where id = ${card.id}`) as { status: string }[]
    : (await sql`select status from ti_atividades where id = ${card.id}`) as { status: string }[];
  return rows[0]?.status ?? null;
}
