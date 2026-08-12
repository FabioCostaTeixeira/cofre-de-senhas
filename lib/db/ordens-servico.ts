import { randomUUID } from 'node:crypto';
import { sql } from '@/lib/db/client';
import { NotFoundError } from '@/lib/authz';
import { assertUuid } from '@/lib/validation';
import { existeConflito } from '@/lib/db/agenda';
import { existeBloqueioNoHorario } from '@/lib/db/bloqueios';
import { getProduto } from '@/lib/db/produtos';
import type { DadosOS, OrdemServico } from '@/lib/types';

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
    select ci.id as contratacao_item_id, (ci.quantidade_total - ci.quantidade_consumida) as disponivel
      from contratacao_itens ci
      join contratacoes ct on ct.id = ci.contratacao_id
     where ct.cliente_id = ${clienteId} and ct.deleted_at is null and ci.produto_id = ${produtoId}
       and ci.quantidade_total > ci.quantidade_consumida
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
    ...descontos.map((d) => sql`
      update contratacao_itens set quantidade_consumida = quantidade_consumida + ${d.quantidade}
       where id = ${d.contratacao_item_id}`),
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

  const saldos = (await sql`
    select os_item_saldos.contratacao_item_id as contratacao_item_id, os_item_saldos.quantidade as quantidade
      from os_item_saldos
      join os_itens on os_itens.id = os_item_saldos.os_item_id
     where os_itens.os_id = ${id}`) as { contratacao_item_id: string; quantidade: number }[];

  const agendamentos = (await sql`
    select agendamento_id from os_itens where os_id = ${id} and agendamento_id is not null`) as
    { agendamento_id: string }[];

  await sql.transaction([
    sql`update ordens_servico set deleted_at = now() where id = ${id}`,
    ...saldos.map((s) => sql`
      update contratacao_itens set quantidade_consumida = quantidade_consumida - ${s.quantidade}
       where id = ${s.contratacao_item_id}`),
    ...agendamentos.map((a) => sql`
      update agendamentos set status = 'cancelado', updated_at = now() where id = ${a.agendamento_id}`),
  ]);
}
