import { randomUUID } from 'node:crypto';
import { sql } from '@/lib/db/client';
import { NotFoundError } from '@/lib/authz';
import { assertUuid } from '@/lib/validation';
import { existeConflito } from '@/lib/db/agenda';
import { existeBloqueioNoHorario } from '@/lib/db/bloqueios';
import { getProduto } from '@/lib/db/produtos';
import type { DadosOS, OrdemServico } from '@/lib/types';

// Coluna em que toda tarefa gerada por OS nasce. `tarefas.coluna` guarda o id de
// COLUNAS_KANBAN (lib/kanban.ts), nunca o rótulo — 'a_fazer' é um id válido lá.
const COLUNA_INICIAL_TAREFA = 'a_fazer';

export class SaldoInsuficienteError extends Error {
  constructor(produtoNome: string) {
    super(`Saldo insuficiente de "${produtoNome}" para este cliente.`);
  }
}

export class ConflitoAgendaError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
  }
}

export class ItemInativoError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
  }
}

type SaldoLinha = { contratacao_item_id: string; disponivel: number };

async function buscarSaldoDisponivel(clienteId: string, produtoId: string): Promise<SaldoLinha[]> {
  return (await sql`
    select ci.id as contratacao_item_id,
           (ci.quantidade_total - ci.quantidade_reservada - ci.quantidade_consumida) as disponivel
      from contratacao_itens ci
      join contratacoes ct on ct.id = ci.contratacao_id
     where ct.cliente_id = ${clienteId} and ct.deleted_at is null and ci.produto_id = ${produtoId}
       and ci.quantidade_total - ci.quantidade_reservada - ci.quantidade_consumida > 0
     order by ct.created_at asc`) as SaldoLinha[];
}

type ItemValidado = {
  produto_id: string;
  categoria_produto_id: string;
  quantidade: number;
  pre_agendar: boolean;
  data: string | null;
  hora_inicio: string | null;
  hora_fim: string | null;
  local_id: string | null;
  estudio_id: string | null;
};

export async function createOrdemServico(dados: DadosOS): Promise<string> {
  assertUuid(dados.cliente_id);

  const itensValidados: ItemValidado[] = [];
  const descontos: { itemIndex: number; contratacao_item_id: string; quantidade: number }[] = [];
  // Rastreia, durante todo o loop, quanto já foi reservado de cada `contratacao_item_id` por
  // linhas anteriores desta mesma OS — sem isso, duas linhas do mesmo produto releem o saldo
  // do banco do zero e podem alocar a mesma unidade duas vezes (ver achado Critical 2).
  const jaAlocado = new Map<string, number>();

  for (let i = 0; i < dados.itens.length; i++) {
    const item = dados.itens[i];
    assertUuid(item.produto_id);
    const produto = await getProduto(item.produto_id);
    if (!produto || !produto.ativo) throw new ItemInativoError('Este produto não está disponível.');

    const saldoLinhas = await buscarSaldoDisponivel(dados.cliente_id, item.produto_id);
    let restante = item.quantidade;
    for (const linha of saldoLinhas) {
      if (restante <= 0) break;
      const disponivelReal = linha.disponivel - (jaAlocado.get(linha.contratacao_item_id) ?? 0);
      if (disponivelReal <= 0) continue;
      const usar = Math.min(restante, disponivelReal);
      descontos.push({ itemIndex: i, contratacao_item_id: linha.contratacao_item_id, quantidade: usar });
      jaAlocado.set(linha.contratacao_item_id, (jaAlocado.get(linha.contratacao_item_id) ?? 0) + usar);
      restante -= usar;
    }
    if (restante > 0) throw new SaldoInsuficienteError(produto.nome);

    if (item.pre_agendar) {
      assertUuid(item.local_id!);
      assertUuid(item.estudio_id!);
      if (await existeBloqueioNoHorario(item.estudio_id!, item.data!, item.hora_inicio!, item.hora_fim!)) {
        throw new ConflitoAgendaError('Este horário está bloqueado para manutenção.');
      }
      if (await existeConflito(item.estudio_id!, item.data!, item.hora_inicio!, item.hora_fim!, null)) {
        throw new ConflitoAgendaError('Este estúdio já tem outro agendamento nesse horário.');
      }
      // As checagens acima só olham o banco — agendamentos de outras linhas desta mesma OS
      // ainda não foram gravados (só existem depois da transação). Compara também contra as
      // linhas pré-agendadas já validadas nesta chamada (ver achado Critical 3).
      const colideComOutraLinha = itensValidados.some((outro) =>
        outro.pre_agendar && outro.estudio_id === item.estudio_id && outro.data === item.data
        && item.hora_inicio! < outro.hora_fim! && item.hora_fim! > outro.hora_inicio!);
      if (colideComOutraLinha) {
        throw new ConflitoAgendaError('Dois itens desta OS pedem o mesmo estúdio no mesmo horário.');
      }
    }

    itensValidados.push({
      produto_id: item.produto_id, categoria_produto_id: produto.categoria_id,
      quantidade: item.quantidade, pre_agendar: item.pre_agendar,
      data: item.data, hora_inicio: item.hora_inicio, hora_fim: item.hora_fim,
      local_id: item.local_id, estudio_id: item.estudio_id,
    });
  }

  const osId = randomUUID();
  const osItemIds = itensValidados.map(() => randomUUID());
  const agendamentoIds = itensValidados.map((item) => (item.pre_agendar ? randomUUID() : null));

  await sql.transaction([
    sql`insert into ordens_servico (id, cliente_id) values (${osId}, ${dados.cliente_id})`,
    // Agendamentos precisam existir antes dos `os_itens` que os referenciam via
    // `agendamento_id` (FK), então essa etapa vem antes da inserção dos itens.
    ...itensValidados
      .map((item, i) => ({ item, i }))
      .filter(({ item }) => item.pre_agendar)
      .map(({ item, i }) => sql`
        insert into agendamentos (id, cliente_id, local_id, estudio_id, categoria_produto_id, status, data, hora_inicio, hora_fim)
        values (${agendamentoIds[i]}, ${dados.cliente_id}, ${item.local_id}, ${item.estudio_id}, ${item.categoria_produto_id},
                'pre_agendado', ${item.data}, ${item.hora_inicio}, ${item.hora_fim})`),
    ...itensValidados.map((item, i) => sql`
      insert into os_itens (id, os_id, produto_id, quantidade, pre_agendar, agendamento_id)
      values (${osItemIds[i]}, ${osId}, ${item.produto_id}, ${item.quantidade}, ${item.pre_agendar}, ${agendamentoIds[i]})`),
    ...descontos.map((d) => sql`
      insert into os_item_saldos (os_item_id, contratacao_item_id, quantidade)
      values (${osItemIds[d.itemIndex]}, ${d.contratacao_item_id}, ${d.quantidade})`),
    // A OS reserva na criação; consumo só acontece quando a tarefa (ou o agendamento
    // dela) conclui — ver lib/db/tarefas.ts. Guard-in-where igual ao resto do módulo:
    // a constraint `contratacao_itens_saldo_check` (migração 012) é o backstop atômico,
    // não um select-then-update.
    ...descontos.map((d) => sql`
      update contratacao_itens set quantidade_reservada = quantidade_reservada + ${d.quantidade}
       where id = ${d.contratacao_item_id}`),
    // Card = 1 unidade (Global Constraints): uma tarefa por unidade reservada, nunca uma
    // por item. Um item de quantidade 3 que puxou 2 de uma contratação e 1 de outra gera
    // 3 tarefas, cada uma com o `contratacao_item_id` de onde a unidade saiu. Tarefa nasce
    // com `agendamento_id` quando o item é pré-agendado (senão null) e `consumido = false`
    // sempre — é a Task 5 (agenda) que decide marcar `consumido` quando o agendamento
    // conclui; a OS nunca antecipa isso.
    ...descontos.flatMap((d) =>
      Array.from({ length: d.quantidade }, () => sql`
        insert into tarefas (cliente_id, produto_id, contratacao_item_id, agendamento_id, os_item_id, coluna)
        values (${dados.cliente_id}, ${itensValidados[d.itemIndex].produto_id}, ${d.contratacao_item_id},
                ${agendamentoIds[d.itemIndex]}, ${osItemIds[d.itemIndex]}, ${COLUNA_INICIAL_TAREFA})`)),
  ]);

  return osId;
}

/** Só OS ativas — cancelada some da lista, mesmo padrão de `listContratacoes`. */
export async function listOrdensServico(): Promise<OrdemServico[]> {
  return (await sql`
    select os.id, os.cliente_id, cl.nome as cliente_nome, os.created_at,
           coalesce(
             json_agg(
               json_build_object(
                 'produto_id', oi.produto_id, 'produto_nome', p.nome,
                 'quantidade', oi.quantidade, 'pre_agendar', oi.pre_agendar
               ) order by p.nome
             ) filter (where oi.id is not null), '[]'
           ) as itens
      from ordens_servico os
      join clientes cl on cl.id = os.cliente_id
      left join os_itens oi on oi.os_id = os.id
      left join produtos p on p.id = oi.produto_id
     where os.deleted_at is null
     group by os.id, cl.nome
     order by os.created_at desc`) as OrdemServico[];
}

export async function cancelarOrdemServico(id: string): Promise<void> {
  assertUuid(id);
  const existe = (await sql`
    select id from ordens_servico where id = ${id} and deleted_at is null`) as { id: string }[];
  if (!existe[0]) throw new NotFoundError();

  // Devolução tem que ser derivada do estado real das tarefas da OS, não de
  // `os_itens.quantidade`/`os_item_saldos`: depois da Task 4 uma OS pode ter parte das
  // unidades ainda reservada e parte já consumida (mover de tarefa é independente de
  // cancelar OS). Tarefa com `consumido = true` já converteu reserva em consumo real —
  // esse consumo não se desfaz por cancelamento de OS (mesmo princípio de 010_contratacoes.sql).
  const tarefas = (await sql`
    select t.id, t.contratacao_item_id, t.consumido
      from tarefas t
      join os_itens oi on oi.id = t.os_item_id
     where oi.os_id = ${id} and t.deleted_at is null`) as
    { id: string; contratacao_item_id: string; consumido: boolean }[];

  const agendamentos = (await sql`
    select agendamento_id from os_itens where os_id = ${id} and agendamento_id is not null`) as
    { agendamento_id: string }[];

  await sql.transaction([
    sql`update ordens_servico set deleted_at = now() where id = ${id}`,
    // Ainda não consumida: libera a reserva e soft-deleta num CTE só (guard-in-where,
    // mesmo padrão de softDeleteTarefa em lib/db/tarefas.ts) — nunca select-then-update.
    ...tarefas.filter((t) => !t.consumido).map((t) => sql`
      with mov as (
        update tarefas set deleted_at = now()
         where id = ${t.id} and deleted_at is null and consumido = false
        returning contratacao_item_id
      )
      update contratacao_itens ci
         set quantidade_reservada = quantidade_reservada - 1
        from mov
       where ci.id = mov.contratacao_item_id
      returning ci.id`),
    // Já consumida: saldo fica como está, só soft-deleta o card.
    ...tarefas.filter((t) => t.consumido).map((t) => sql`
      update tarefas set deleted_at = now()
       where id = ${t.id} and deleted_at is null and consumido = true`),
    ...agendamentos.map((a) => sql`
      update agendamentos set status = 'cancelado', updated_at = now() where id = ${a.agendamento_id}`),
  ]);
}
