import { sql } from '@/lib/db/client';
import { NotFoundError } from '@/lib/authz';
import { assertUuid } from '@/lib/validation';
import type { DadosTarefa, Tarefa } from '@/lib/types';

export class SaldoIndisponivelError extends Error {
  constructor(produtoNome: string) {
    super(`Sem saldo disponível de "${produtoNome}" para este cliente.`);
  }
}

export async function listTarefas(): Promise<Tarefa[]> {
  return (await sql`
    select t.id, t.cliente_id, cl.nome as cliente_nome, t.responsavel_id, u.name as responsavel_nome,
           t.produto_id, p.nome as produto_nome, t.contratacao_item_id, t.agendamento_id, t.os_item_id,
           t.tarefa, t.coluna, t.prioridade, t.deadline_cliente::text as deadline_cliente,
           t.deadline_tarefa::text as deadline_tarefa, t.ajuste, t.consumido,
           t.created_at::text as created_at
      from tarefas t
      join clientes cl on cl.id = t.cliente_id
      join produtos p on p.id = t.produto_id
      left join users u on u.id = t.responsavel_id
     where t.deleted_at is null
     order by t.prioridade, t.created_at`) as Tarefa[];
}

export type ItemDisponivel = {
  contratacao_item_id: string;
  produto_id: string;
  produto_nome: string;
  disponivel: number;
};

/** Itens da carteira do cliente com saldo livre. Alimenta o select de produto do
 *  formulário: só faz sentido abrir tarefa contra o que ele ainda tem. */
export async function listItensDisponiveisDoCliente(clienteId: string): Promise<ItemDisponivel[]> {
  assertUuid(clienteId);
  return (await sql`
    select ci.id as contratacao_item_id, ci.produto_id, p.nome as produto_nome,
           (ci.quantidade_total - ci.quantidade_reservada - ci.quantidade_consumida) as disponivel
      from contratacao_itens ci
      join contratacoes ct on ct.id = ci.contratacao_id
      join produtos p on p.id = ci.produto_id
     where ct.cliente_id = ${clienteId} and ct.deleted_at is null
       and (ci.quantidade_total - ci.quantidade_reservada - ci.quantidade_consumida) > 0
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
     where ci.id = ${dados.contratacao_item_id}`) as
    { produto_id: string; produto_nome: string; disponivel: number }[];

  const item = itens[0];
  if (!item) throw new NotFoundError();
  if (item.disponivel < 1) throw new SaldoIndisponivelError(item.produto_nome);

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
  if (!rows[0]) throw new SaldoIndisponivelError(item.produto_nome);
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
  const vaiDevolver = atual.coluna === COLUNA_CONCLUIDO && coluna !== COLUNA_CONCLUIDO && atual.consumido;

  // Chegou em Concluído: limpa. Saiu de Homologação pra outra coluna: liga. Fora
  // desses dois casos, preserva o que já estava.
  const novoAjuste = coluna === COLUNA_CONCLUIDO
    ? false
    : atual.coluna === COLUNA_HOMOLOGACAO ? true : atual.ajuste;

  const novoConsumido = vaiConsumir ? true : vaiDevolver ? false : atual.consumido;

  await sql.transaction([
    sql`update tarefas
           set coluna = ${coluna}, consumido = ${novoConsumido}, ajuste = ${novoAjuste},
               updated_at = now()
         where id = ${id}`,
    ...(vaiConsumir
      ? [sql`update contratacao_itens
                set quantidade_reservada = quantidade_reservada - 1,
                    quantidade_consumida = quantidade_consumida + 1
              where id = ${atual.contratacao_item_id}`]
      : []),
    ...(vaiDevolver
      ? [sql`update contratacao_itens
                set quantidade_reservada = quantidade_reservada + 1,
                    quantidade_consumida = quantidade_consumida - 1
              where id = ${atual.contratacao_item_id}`]
      : []),
  ]);
}

/** Reescreve a prioridade na ordem recebida (0, 1, 2...). Usado pelo drag dentro da
 *  coluna. Tudo numa transação: ordem parcialmente aplicada embaralharia o quadro. */
export async function reordenarTarefas(ids: string[]): Promise<void> {
  for (const id of ids) assertUuid(id);
  if (ids.length === 0) return;
  await sql.transaction(
    ids.map((id, i) => sql`update tarefas set prioridade = ${i}, updated_at = now() where id = ${id}`),
  );
}

/** Apaga a tarefa e libera a reserva — mas não mexe em consumo já realizado. */
export async function softDeleteTarefa(id: string): Promise<void> {
  assertUuid(id);
  const rows = (await sql`
    select consumido, contratacao_item_id from tarefas
     where id = ${id} and deleted_at is null`) as
    { consumido: boolean; contratacao_item_id: string }[];
  if (!rows[0]) throw new NotFoundError();

  await sql.transaction([
    sql`update tarefas set deleted_at = now() where id = ${id}`,
    ...(rows[0].consumido
      ? []
      : [sql`update contratacao_itens set quantidade_reservada = quantidade_reservada - 1
              where id = ${rows[0].contratacao_item_id}`]),
  ]);
}
