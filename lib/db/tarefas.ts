import { sql } from '@/lib/db/client';
import { NotFoundError } from '@/lib/authz';
import { assertUuid } from '@/lib/validation';
import type { DadosTarefa, Planejamento, Tarefa } from '@/lib/types';

// Decisão do cliente (documentada no brief da Task 4/OS): a Task 5 (Agenda) MARCA
// `tarefas.consumido = true` quando o agendamento consome saldo em nome de uma tarefa
// com `agendamento_id`. As duas leituras de `consumido` neste arquivo (`vaiDevolver` e o
// release de `softDeleteTarefa`) já checam `!agendamento_id` primeiro, então esse valor é
// ignorado por este módulo — mas `cancelarOrdemServico` (lib/db/ordens-servico.ts) DEPENDE
// dele: o ramo de release de reserva ali usa só `!consumido` (sem checar `agendamento_id`,
// de propósito — quem reservou foi a OS), e conta com a agenda ter marcado `consumido =
// true` ao consumir. Se a Task 5 consumir sem marcar essa flag, cancelar uma OS
// pré-agendada e já concluída pela agenda tenta devolver reserva que não existe mais,
// estoura a constraint `quantidade_reservada >= 0` e a OS fica impossível de cancelar.

export class SaldoIndisponivelError extends Error {
  /** De onde veio a rejeição: `checagem` é a leitura preliminar em `createTarefa`
   *  (barato, evita bater no banco à toa, mas não é atômico); `corrida` é o
   *  guard-in-where do CTE de reserva não afetando nenhuma linha — a fonte real de
   *  verdade quando duas chamadas concorrentes disputam a última unidade
   *  (ver 'duas criações concorrentes...' em tests/integracao.test.ts). */
  readonly origem: 'checagem' | 'corrida';

  constructor(produtoNome: string, origem: 'checagem' | 'corrida') {
    super(`Sem saldo disponível de "${produtoNome}" para este cliente.`);
    this.origem = origem;
  }
}

/** A tarefa foi alterada (movida, apagada) por outra operação entre a leitura do
 *  estado atual e a escrita — o guard na `where` barrou uma segunda atualização
 *  concorrente sobre a mesma linha. Ver Finding 1 da revisão do Task 3. */
export class TarefaDivergenteError extends Error {
  constructor() {
    super('A tarefa foi alterada por outra operação simultânea. Recarregue e tente novamente.');
  }
}

/** Sem `planejamento`, lista as tarefas dos dois quadros. Com ele, só as cujo produto
 *  é de categoria daquele quadro (Edição ou Gravação). */
export async function listTarefas(planejamento?: Planejamento): Promise<Tarefa[]> {
  const filtro = planejamento ?? null;
  return (await sql`
    select t.id, t.cliente_id, cl.nome as cliente_nome, t.responsavel_id, u.name as responsavel_nome,
           t.produto_id, p.nome as produto_nome, t.contratacao_item_id, t.agendamento_id, t.os_item_id,
           t.tarefa, t.coluna, t.prioridade, t.deadline_cliente::text as deadline_cliente,
           t.deadline_tarefa::text as deadline_tarefa, t.ajuste, t.consumido,
           t.created_at::text as created_at
      from tarefas t
      join clientes cl on cl.id = t.cliente_id
      join produtos p on p.id = t.produto_id
      join categorias_produto cp on cp.id = p.categoria_id
      left join users u on u.id = t.responsavel_id
     where t.deleted_at is null
       and (${filtro}::text is null or cp.planejamento = ${filtro})
     order by t.prioridade, t.created_at`) as Tarefa[];
}

export type ItemDisponivel = {
  contratacao_item_id: string;
  produto_id: string;
  produto_nome: string;
  disponivel: number;
};

/** Itens da carteira do cliente com saldo livre. Alimenta o select de produto do
 *  formulário: só faz sentido abrir tarefa contra o que ele ainda tem. Com
 *  `planejamento`, só os produtos que cairiam naquele quadro — senão a tarefa criada
 *  na tela de Edição sumiria para a de Gravação. */
export async function listItensDisponiveisDoCliente(
  clienteId: string, planejamento?: Planejamento,
): Promise<ItemDisponivel[]> {
  assertUuid(clienteId);
  const filtro = planejamento ?? null;
  return (await sql`
    select ci.id as contratacao_item_id, ci.produto_id, p.nome as produto_nome,
           (ci.quantidade_total - ci.quantidade_reservada - ci.quantidade_consumida) as disponivel
      from contratacao_itens ci
      join contratacoes ct on ct.id = ci.contratacao_id
      join produtos p on p.id = ci.produto_id
      join categorias_produto cp on cp.id = p.categoria_id
     where ct.cliente_id = ${clienteId} and ct.deleted_at is null
       and (ci.quantidade_total - ci.quantidade_reservada - ci.quantidade_consumida) > 0
       and (${filtro}::text is null or cp.planejamento = ${filtro})
     order by ct.created_at, p.nome`) as ItemDisponivel[];
}

export async function createTarefa(dados: DadosTarefa): Promise<string> {
  assertUuid(dados.cliente_id);
  assertUuid(dados.contratacao_item_id);

  const itens = (await sql`
    select ci.produto_id, p.nome as produto_nome,
           (ci.quantidade_total - ci.quantidade_reservada - ci.quantidade_consumida) as disponivel
      from contratacao_itens ci
      join produtos p on p.id = ci.produto_id
      join contratacoes ct on ct.id = ci.contratacao_id
     where ci.id = ${dados.contratacao_item_id}
       and ct.cliente_id = ${dados.cliente_id} and ct.deleted_at is null`) as
    { produto_id: string; produto_nome: string; disponivel: number }[];

  const item = itens[0];
  if (!item) throw new NotFoundError();
  if (item.disponivel < 1) throw new SaldoIndisponivelError(item.produto_nome, 'checagem');

  const rows = (await sql`
    with reserva as (
      update contratacao_itens
         set quantidade_reservada = quantidade_reservada + 1
       where id = ${dados.contratacao_item_id}
         and quantidade_total - quantidade_reservada - quantidade_consumida >= 1
      returning id
    )
    insert into tarefas (cliente_id, responsavel_id, produto_id, contratacao_item_id,
                         tarefa, coluna, prioridade, deadline_cliente, deadline_tarefa)
    select ${dados.cliente_id}, ${dados.responsavel_id}, ${item.produto_id},
           ${dados.contratacao_item_id}, ${dados.tarefa}, ${dados.coluna},
           ${dados.prioridade}, ${dados.deadline_cliente}, ${dados.deadline_tarefa}
      from reserva
    returning id`) as { id: string }[];

  // Sem linha => o CTE de reserva não afetou nada => alguém levou a última unidade
  // entre o select acima e este update.
  if (!rows[0]) throw new SaldoIndisponivelError(item.produto_nome, 'corrida');
  return rows[0].id;
}

const COLUNA_CONCLUIDO = 'concluido';
const COLUNA_HOMOLOGACAO = 'homologacao_cliente';

/**
 * Move a tarefa de coluna e aplica os efeitos colaterais da spec §2 e §4:
 *
 * - entrando em Concluído: reserva vira consumo — mas só se a tarefa não tem
 *   `agendamento_id`, porque nesse caso quem consome é o agendamento;
 * - saindo de Concluído: desfaz, e só se foi esta tarefa que consumiu (`consumido`);
 * - saindo de Homologação para coluna que não é Concluído: liga a flag `ajuste`;
 * - chegando em Concluído: desliga a flag.
 */
export async function moverTarefa(id: string, coluna: string): Promise<void> {
  assertUuid(id);

  const rows = (await sql`
    select coluna, agendamento_id, consumido, ajuste, contratacao_item_id
      from tarefas where id = ${id} and deleted_at is null`) as
    { coluna: string; agendamento_id: string | null; consumido: boolean; ajuste: boolean;
      contratacao_item_id: string }[];

  const atual = rows[0];
  if (!atual) throw new NotFoundError();
  if (atual.coluna === coluna) return;

  const vaiConsumir = coluna === COLUNA_CONCLUIDO && !atual.agendamento_id && !atual.consumido;
  // Não devolve pelo card se quem consumiu foi o agendamento — mesma regra que impede
  // `vaiConsumir` de debitar duas vezes, espelhada na direção inversa (Finding 3).
  const vaiDevolver = atual.coluna === COLUNA_CONCLUIDO && coluna !== COLUNA_CONCLUIDO
    && atual.consumido && !atual.agendamento_id;

  // Chegou em Concluído: limpa. Saiu de Homologação pra outra coluna: liga. Fora
  // desses dois casos, preserva o que já estava.
  const novoAjuste = coluna === COLUNA_CONCLUIDO
    ? false
    : atual.coluna === COLUNA_HOMOLOGACAO ? true : atual.ajuste;

  const novoConsumido = vaiConsumir ? true : vaiDevolver ? false : atual.consumido;

  // A `where` do update de `tarefas` re-checa exatamente o estado que foi lido acima
  // (coluna, consumido) — se outra chamada concorrente já mudou a linha entre o select
  // e aqui, o CTE não afeta nenhuma linha, o `returning` fica vazio e o update de saldo
  // (que só roda `from mov`) não toca em nada. Sem isso, duas chamadas concorrentes para
  // a mesma tarefa podiam ler o mesmo estado "antes" e aplicar o efeito de saldo duas
  // vezes (Finding 1). Consumir/devolver continua sendo UM update só em
  // `contratacao_itens` — a constraint `contratacao_itens_saldo_check` é transiente se
  // reservada e consumida forem mexidas em updates separados.
  if (vaiConsumir) {
    const efeito = (await sql`
      with mov as (
        update tarefas
           set coluna = ${coluna}, consumido = ${novoConsumido}, ajuste = ${novoAjuste},
               updated_at = now()
         where id = ${id} and deleted_at is null
           and coluna = ${atual.coluna} and consumido = ${atual.consumido}
        returning contratacao_item_id
      )
      update contratacao_itens ci
         set quantidade_reservada = quantidade_reservada - 1,
             quantidade_consumida = quantidade_consumida + 1
        from mov
       where ci.id = mov.contratacao_item_id
      returning ci.id`) as { id: string }[];
    if (!efeito[0]) throw new TarefaDivergenteError();
    return;
  }

  if (vaiDevolver) {
    const efeito = (await sql`
      with mov as (
        update tarefas
           set coluna = ${coluna}, consumido = ${novoConsumido}, ajuste = ${novoAjuste},
               updated_at = now()
         where id = ${id} and deleted_at is null
           and coluna = ${atual.coluna} and consumido = ${atual.consumido}
        returning contratacao_item_id
      )
      update contratacao_itens ci
         set quantidade_reservada = quantidade_reservada + 1,
             quantidade_consumida = quantidade_consumida - 1
        from mov
       where ci.id = mov.contratacao_item_id
      returning ci.id`) as { id: string }[];
    if (!efeito[0]) throw new TarefaDivergenteError();
    return;
  }

  // Move entre duas colunas que não são Concluído (ou vice-versa sem efeito de saldo,
  // ex.: tarefa com agendamento_id): sem CTE porque não há saldo pra mexer, mas o
  // guard continua igual para não perder uma escrita concorrente de `ajuste`.
  const efeito = (await sql`
    update tarefas
       set coluna = ${coluna}, consumido = ${novoConsumido}, ajuste = ${novoAjuste},
           updated_at = now()
     where id = ${id} and deleted_at is null
       and coluna = ${atual.coluna} and consumido = ${atual.consumido}
    returning id`) as { id: string }[];
  if (!efeito[0]) throw new TarefaDivergenteError();
}

/** Reescreve a prioridade na ordem recebida (0, 1, 2...). Usado pelo drag dentro da
 *  coluna. Tudo numa transação: ordem parcialmente aplicada embaralharia o quadro. */
export async function reordenarTarefas(ids: string[]): Promise<void> {
  for (const id of ids) assertUuid(id);
  if (ids.length === 0) return;
  await sql.transaction(
    ids.map((id, i) => sql`
      update tarefas set prioridade = ${i}, updated_at = now()
       where id = ${id} and deleted_at is null`),
  );
}

/** Apaga a tarefa e libera a reserva — mas não mexe em consumo já realizado, nem em
 *  reserva que o agendamento dela já converteu (Finding 3: `agendamento_id` preenchido
 *  significa que quem controla o saldo é o agendamento, não este card). */
export async function softDeleteTarefa(id: string): Promise<void> {
  assertUuid(id);
  const rows = (await sql`
    select consumido, agendamento_id, contratacao_item_id from tarefas
     where id = ${id} and deleted_at is null`) as
    { consumido: boolean; agendamento_id: string | null; contratacao_item_id: string }[];
  const atual = rows[0];
  if (!atual) throw new NotFoundError();

  const vaiLiberar = !atual.consumido && !atual.agendamento_id;

  // Mesmo raciocínio de guard-in-where do `moverTarefa`: a `where` do update de
  // `tarefas` re-checa `consumido` como foi lido acima, então uma segunda chamada
  // concorrente (dois cliques, um duplo delete) sobre a mesma tarefa nunca libera a
  // mesma unidade de saldo duas vezes (Finding 1).
  if (vaiLiberar) {
    const efeito = (await sql`
      with mov as (
        update tarefas set deleted_at = now()
         where id = ${id} and deleted_at is null and consumido = ${atual.consumido}
        returning contratacao_item_id
      )
      update contratacao_itens ci
         set quantidade_reservada = quantidade_reservada - 1
        from mov
       where ci.id = mov.contratacao_item_id
      returning ci.id`) as { id: string }[];
    if (!efeito[0]) throw new TarefaDivergenteError();
    return;
  }

  const efeito = (await sql`
    update tarefas set deleted_at = now()
     where id = ${id} and deleted_at is null and consumido = ${atual.consumido}
    returning id`) as { id: string }[];
  if (!efeito[0]) throw new TarefaDivergenteError();
}
