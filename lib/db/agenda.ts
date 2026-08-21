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

/**
 * Histórico completo de agendamentos de um cliente, em todos os studios, inclusive
 * `status = 'cancelado'` (cancelado é um status, não uma exclusão — o registro
 * continua existindo). Só exclui de fato apagados (`deleted_at`). Usado no modal de
 * cliente (aba Agendamento).
 */
export async function listAgendamentosDoCliente(clienteId: string): Promise<Agendamento[]> {
  assertUuid(clienteId);
  return (await sql`
    select a.id, a.cliente_id, cl.nome as cliente_nome, a.local_id, a.estudio_id, e.nome as estudio_nome,
           a.categoria_produto_id, cp.nome as categoria_nome, a.status,
           a.data::text as data, a.hora_inicio::text as hora_inicio, a.hora_fim::text as hora_fim,
           a.created_at
      from agendamentos a
      join clientes cl on cl.id = a.cliente_id
      join estudios e on e.id = a.estudio_id
      join categorias_produto cp on cp.id = a.categoria_produto_id
     where a.cliente_id = ${clienteId} and a.deleted_at is null
     order by a.data desc, a.hora_inicio desc`) as Agendamento[];
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

/**
 * Statement (não executado — devolve a query pra entrar num `sql.transaction([...])`)
 * que consome pelas tarefas do agendamento: cada tarefa com `agendamento_id =
 * agendamentoId`, `deleted_at is null` e `consumido = false` devolve 1 de
 * `quantidade_reservada` e soma 1 em `quantidade_consumida` do `contratacao_item_id`
 * dela, marcando `consumido = true`.
 *
 * O filtro `consumido = false` no `where` do update de `tarefas` é o guard-in-where que torna
 * a operação idempotente: chamar de novo para um agendamento que já estava concluído não
 * afeta nenhuma linha (todas já `consumido = true`), então não debita segunda vez. O `exists
 * (select 1 from agendamentos where id = ... and deleted_at is null)` no mesmo `where` é o
 * segundo guard-in-where: dentro do `sql.transaction` de `updateAgendamento`, este statement
 * roda como comando independente do `update agendamentos` — o driver neon-http não aborta o
 * batch por zero-rows, só por erro real de constraint — então a checagem de existência não
 * pode depender da ordem/resultado do outro statement, tem que estar no próprio `where`
 * (mesmo raciocínio do achado Critical documentado em lib/db/ordens-servico.ts:167-182).
 * Tudo num único statement (CTE encadeado: update de `tarefas` → agrega por
 * `contratacao_item_id` → update de `contratacao_itens`), atômico por ser um statement só —
 * sem select-then-update.
 *
 * Contrato com `cancelarOrdemServico` (lib/db/ordens-servico.ts): marcar `consumido = true`
 * aqui é o que permite aquela função decidir, só por `!consumido`, se uma tarefa pré-agendada
 * ainda tem reserva pra devolver. Ver lib/db/tarefas.ts:6-15.
 */
function statementConsumirTarefasDoAgendamento(agendamentoId: string) {
  return sql`
    with mov as (
      update tarefas
         set consumido = true, updated_at = now()
       where agendamento_id = ${agendamentoId} and deleted_at is null and consumido = false
         and exists (
           select 1 from agendamentos
            where id = ${agendamentoId} and deleted_at is null
         )
      returning contratacao_item_id
    ), agregado as (
      select contratacao_item_id, count(*) as qtd from mov group by contratacao_item_id
    )
    update contratacao_itens ci
       set quantidade_reservada = quantidade_reservada - agregado.qtd,
           quantidade_consumida = quantidade_consumida + agregado.qtd
      from agregado
     where ci.id = agregado.contratacao_item_id`;
}

/**
 * Simétrico a `statementConsumirTarefasDoAgendamento`: tarefas do agendamento com
 * `consumido = true` voltam `quantidade_reservada + 1 / quantidade_consumida - 1` e
 * `consumido = false`. Mesmos dois guards-in-where na direção inversa (`consumido = true` e
 * `exists (... agendamentos ...)`) — chamar de novo para um agendamento que já não estava
 * concluído, ou que não existe mais, é no-op.
 */
function statementDevolverTarefasDoAgendamento(agendamentoId: string) {
  return sql`
    with mov as (
      update tarefas
         set consumido = false, updated_at = now()
       where agendamento_id = ${agendamentoId} and deleted_at is null and consumido = true
         and exists (
           select 1 from agendamentos
            where id = ${agendamentoId} and deleted_at is null
         )
      returning contratacao_item_id
    ), agregado as (
      select contratacao_item_id, count(*) as qtd from mov group by contratacao_item_id
    )
    update contratacao_itens ci
       set quantidade_reservada = quantidade_reservada + agregado.qtd,
           quantidade_consumida = quantidade_consumida - agregado.qtd
      from agregado
     where ci.id = agregado.contratacao_item_id`;
}

/**
 * `dados.status === 'concluido'` consome pelas tarefas do agendamento (spec Task 5 §2);
 * qualquer outro status devolve (§3). Roda em toda chamada, não só numa transição — a
 * idempotência não vem de comparar status antigo x novo, vem só do `consumido = false`/`=
 * true` no `where` de cada função acima (ver seus comentários). Isso também cobre o caso de
 * editar um agendamento já concluído sem trocar o status: continua rodando
 * `consumirTarefasDoAgendamento`, que é no-op porque não sobra tarefa com `consumido = false`.
 */
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
  // Status do agendamento e consumo/devolução de saldo têm que ser um só round-trip HTTP —
  // no driver neon-http, dois `await sql\`...\`` separados são dois autocommits
  // independentes (achado Important da revisão da Task 5): se o segundo falhar (timeout,
  // blip de rede, pool esgotado) depois do primeiro já ter commitado, o agendamento fica
  // "Concluído" no banco mas `tarefas.consumido`/`quantidade_reservada` nunca são
  // atualizados — saldo errado até alguém reeditar, e `cancelarOrdemServico` (que decide só
  // por `!consumido`) libera reserva de um serviço já entregue. `sql.transaction([...])`
  // resolve isso — os dois statements não dependem um do outro para decidir se rodam (o
  // update de `agendamentos` sempre roda; o statement de saldo já é idempotente e correto
  // sozinho via seu próprio guard-in-where, incluindo o `exists (... agendamentos ...)` que
  // substitui a checagem de `NotFoundError` de antes, ver comentário das funções acima), só
  // precisam commitar juntos ou nenhum dos dois.
  const stmtAgendamento = sql`
    update agendamentos
       set cliente_id = ${dados.cliente_id}, local_id = ${dados.local_id}, estudio_id = ${dados.estudio_id},
           categoria_produto_id = ${dados.categoria_produto_id}, status = ${dados.status},
           data = ${dados.data}, hora_inicio = ${dados.hora_inicio}, hora_fim = ${dados.hora_fim},
           updated_at = now()
     where id = ${id} and deleted_at is null
     returning id`;
  const stmtSaldo = dados.status === 'concluido'
    ? statementConsumirTarefasDoAgendamento(id)
    : statementDevolverTarefasDoAgendamento(id);

  const [rows] = await sql.transaction([stmtAgendamento, stmtSaldo]) as [{ id: string }[], unknown];
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
