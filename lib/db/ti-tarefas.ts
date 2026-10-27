import { randomUUID } from 'node:crypto';
import { sql } from '@/lib/db/client';
import { assertUuid } from '@/lib/validation';
import type { TiProjeto, TiTarefa, TiAtividade, TiTarefaOption } from './ti';

// --- Helpers de Redistribuição de Pesos ---

async function balancearPesosTarefas(projetoId: string): Promise<void> {
  const tarefas = await listTiTarefas(projetoId);
  const n = tarefas.length;
  if (n === 0) return;
  const pesoIgual = parseFloat((100 / n).toFixed(2));
  for (let i = 0; i < n; i++) {
    const pesoFinal = i === n - 1 ? parseFloat((100 - pesoIgual * (n - 1)).toFixed(2)) : pesoIgual;
    await sql`update ti_tarefas set peso = ${pesoFinal} where id = ${tarefas[i].id}`;
  }
}

async function balancearPesosAtividades(tarefaId: string): Promise<void> {
  const atividades = await listTiAtividades(tarefaId);
  const n = atividades.length;
  if (n === 0) return;
  const pesoIgual = parseFloat((100 / n).toFixed(2));
  for (let i = 0; i < n; i++) {
    const pesoFinal = i === n - 1 ? parseFloat((100 - pesoIgual * (n - 1)).toFixed(2)) : pesoIgual;
    await sql`update ti_atividades set peso = ${pesoFinal} where id = ${atividades[i].id}`;
  }
}

export async function getTiProjeto(id: string): Promise<TiProjeto | null> {
  assertUuid(id);
  const rows = (await sql`
    select id, nome, descricao, status, prioridade, responsavel,
           to_char(data_inicio, 'YYYY-MM-DD') as data_inicio,
           to_char(data_fim, 'YYYY-MM-DD') as data_fim,
           created_at
      from ti_projetos
     where id = ${id}
  `) as TiProjeto[];
  return rows[0] ?? null;
}

export async function listTiTarefas(projetoId: string): Promise<TiTarefa[]> {
  assertUuid(projetoId);
  return (await sql`
    select t.id, t.projeto_id, t.nome, t.status, t.prioridade, t.responsavel, t.descricao, t.peso, t.ordem, t.created_at,
           (select count(*)::int from ti_atividades a where a.tarefa_id = t.id) as total_stories
      from ti_tarefas t
     where t.projeto_id = ${projetoId}
     order by t.ordem asc, t.created_at desc
  `) as TiTarefa[];
}

export async function listTiTarefasDisponiveis(): Promise<TiTarefaOption[]> {
  return (await sql`
    select t.id, t.projeto_id, t.nome, p.nome as projeto_nome
      from ti_tarefas t
      join ti_projetos p on p.id = t.projeto_id
     order by p.nome, t.nome
  `) as TiTarefaOption[];
}

export async function getTiTarefa(id: string): Promise<TiTarefa | null> {
  assertUuid(id);
  const rows = (await sql`
    select id, projeto_id, nome, status, prioridade, responsavel, descricao, peso, created_at
      from ti_tarefas
     where id = ${id}
  `) as TiTarefa[];
  return rows[0] ?? null;
}

export async function createTiTarefa(data: {
  projetoId: string;
  nome: string;
  descricao: string | null;
  status: string;
  prioridade: string;
  responsavel: string | null;
  peso?: number;
}): Promise<void> {
  assertUuid(data.projetoId);
  await sql`
    insert into ti_tarefas (projeto_id, nome, descricao, status, prioridade, responsavel, peso)
    values (${data.projetoId}, ${data.nome}, ${data.descricao}, ${data.status}, ${data.prioridade}, ${data.responsavel}, ${data.peso ?? 0})
  `;
  await balancearPesosTarefas(data.projetoId);
}

/**
 * Duplica a Feature no mesmo projeto, com suas User Stories, tudo em status
 * roadmap — mesmo padrão de `duplicateTiProjeto`. A cópia vai para o fim da
 * ordem e os pesos das Features do projeto são rebalanceados, como na criação.
 */
export async function duplicateTiTarefa(id: string): Promise<string | null> {
  assertUuid(id);
  const novaTarefaId = randomUUID();

  const rows = (await sql`
    with tarefa_origem as (
      select projeto_id, nome, descricao, prioridade, responsavel, peso
        from ti_tarefas
       where id = ${id}
    ),
    nova_tarefa as (
      insert into ti_tarefas (
        id, projeto_id, nome, descricao, status, prioridade, responsavel, peso, ordem
      )
      select ${novaTarefaId}, o.projeto_id, o.nome || ' (Cópia)', o.descricao, 'roadmap',
             o.prioridade, o.responsavel, o.peso,
             coalesce((select max(t.ordem) + 1 from ti_tarefas t where t.projeto_id = o.projeto_id), 0)
        from tarefa_origem o
      returning id, projeto_id
    ),
    novas_atividades as (
      insert into ti_atividades (
        id, tarefa_id, nome, descricao, status, prioridade, responsavel, peso, ordem
      )
      select gen_random_uuid(), n.id, a.nome, a.descricao, 'roadmap',
             a.prioridade, a.responsavel, a.peso, a.ordem
        from ti_atividades a
        cross join nova_tarefa n
       where a.tarefa_id = ${id}
      returning id
    )
    select id, projeto_id from nova_tarefa
  `) as { id: string; projeto_id: string }[];

  const nova = rows[0];
  if (!nova) return null;
  await balancearPesosTarefas(nova.projeto_id);
  return nova.id;
}

export async function updateTiTarefa(data: {
  id: string;
  nome: string;
  descricao: string | null;
  status: string;
  prioridade: string;
  responsavel: string | null;
  peso: number;
}): Promise<void> {
  assertUuid(data.id);
  const atual = await getTiTarefa(data.id);
  if (!atual) return;

  await sql`
    update ti_tarefas
       set nome = ${data.nome},
           descricao = ${data.descricao},
           status = ${data.status},
           prioridade = ${data.prioridade},
           responsavel = ${data.responsavel},
           peso = ${data.peso}
     where id = ${data.id}
  `;

  // Redistribui o restante entre os irmãos
  const irmãos = (await listTiTarefas(atual.projeto_id)).filter(t => t.id !== data.id);
  const restante = Math.max(0, 100 - data.peso);
  const n = irmãos.length;
  if (n > 0) {
    const pesoIgual = parseFloat((restante / n).toFixed(2));
    for (let i = 0; i < n; i++) {
      const pesoFinal = i === n - 1 ? parseFloat((restante - pesoIgual * (n - 1)).toFixed(2)) : pesoIgual;
      await sql`update ti_tarefas set peso = ${pesoFinal} where id = ${irmãos[i].id}`;
    }
  }
}

export async function updateTiTarefaStatus(id: string, status: string): Promise<void> {
  assertUuid(id);
  await sql`update ti_tarefas set status = ${status} where id = ${id}`;
}

export async function deleteTiTarefa(id: string): Promise<void> {
  assertUuid(id);
  const atual = await getTiTarefa(id);
  if (!atual) return;
  const projetoId = atual.projeto_id;

  await sql`delete from ti_tarefas where id = ${id}`;
  await balancearPesosTarefas(projetoId);
}

export async function listTiAtividades(tarefaId: string): Promise<TiAtividade[]> {
  assertUuid(tarefaId);
  return (await sql`
    select id, tarefa_id, nome, status, prioridade, responsavel, descricao, peso, ordem, created_at
      from ti_atividades
     where tarefa_id = ${tarefaId}
     order by ordem asc, created_at desc
  `) as TiAtividade[];
}

export async function createTiAtividade(data: {
  tarefaId: string;
  nome: string;
  descricao: string | null;
  status: string;
  prioridade: string;
  responsavel: string | null;
  peso?: number;
}): Promise<void> {
  assertUuid(data.tarefaId);
  await sql`
    insert into ti_atividades (tarefa_id, nome, descricao, status, prioridade, responsavel, peso)
    values (${data.tarefaId}, ${data.nome}, ${data.descricao}, ${data.status}, ${data.prioridade}, ${data.responsavel}, ${data.peso ?? 0})
  `;
  await balancearPesosAtividades(data.tarefaId);
}

export type TiAtividadeMoveResult = {
  tarefaAnteriorId: string;
  tarefaNovaId: string;
  projetoAnteriorId: string;
  projetoNovoId: string;
};

export async function updateTiAtividade(data: {
  id: string;
  tarefaId: string;
  nome: string;
  descricao: string | null;
  status: string;
  prioridade: string;
  responsavel: string | null;
  peso: number;
}): Promise<TiAtividadeMoveResult | null> {
  assertUuid(data.id);
  assertUuid(data.tarefaId);

  const rows = (await sql`
    select a.tarefa_id, t.projeto_id
      from ti_atividades a
      join ti_tarefas t on t.id = a.tarefa_id
     where a.id = ${data.id}
  `) as { tarefa_id: string; projeto_id: string }[];
  const anterior = rows[0];
  if (!anterior) return null;

  const novosPais = (await sql`
    select projeto_id
      from ti_tarefas
     where id = ${data.tarefaId}
  `) as { projeto_id: string }[];
  const novoPai = novosPais[0];
  if (!novoPai) throw new Error('Tarefa pai não encontrada.');

  const mudouDePai = anterior.tarefa_id !== data.tarefaId;
  const [irmãosAnteriores, irmãosNovos] = await Promise.all([
    mudouDePai
      ? listTiAtividades(anterior.tarefa_id)
      : Promise.resolve([] as TiAtividade[]),
    listTiAtividades(data.tarefaId).then((atividades) => atividades.filter((a) => a.id !== data.id)),
  ]);

  const queries = [sql`
    update ti_atividades
       set tarefa_id = ${data.tarefaId},
           nome = ${data.nome},
           descricao = ${data.descricao},
           status = ${data.status},
           prioridade = ${data.prioridade},
           responsavel = ${data.responsavel},
           peso = ${irmãosNovos.length === 0 ? 100 : data.peso},
           ordem = case
             when tarefa_id <> ${data.tarefaId} then coalesce((
               select max(a.ordem) + 1
                 from ti_atividades a
                where a.tarefa_id = ${data.tarefaId}
                  and a.id <> ${data.id}
             ), 0)
             else ordem
           end
     where id = ${data.id}
  `];

  if (mudouDePai && irmãosAnteriores.length > 0) {
    const pesoIgual = parseFloat((100 / irmãosAnteriores.length).toFixed(2));
    for (let i = 0; i < irmãosAnteriores.length; i++) {
      const pesoFinal = i === irmãosAnteriores.length - 1
        ? parseFloat((100 - pesoIgual * (irmãosAnteriores.length - 1)).toFixed(2))
        : pesoIgual;
      queries.push(sql`update ti_atividades set peso = ${pesoFinal} where id = ${irmãosAnteriores[i].id}`);
    }
  }

  if (irmãosNovos.length > 0) {
    const restante = 100 - data.peso;
    const pesoIgual = parseFloat((restante / irmãosNovos.length).toFixed(2));
    for (let i = 0; i < irmãosNovos.length; i++) {
      const pesoFinal = i === irmãosNovos.length - 1
        ? parseFloat((restante - pesoIgual * (irmãosNovos.length - 1)).toFixed(2))
        : pesoIgual;
      queries.push(sql`update ti_atividades set peso = ${pesoFinal} where id = ${irmãosNovos[i].id}`);
    }
  }

  await sql.transaction(queries);

  return {
    tarefaAnteriorId: anterior.tarefa_id,
    tarefaNovaId: data.tarefaId,
    projetoAnteriorId: anterior.projeto_id,
    projetoNovoId: novoPai.projeto_id,
  };
}

export async function updateTiAtividadeStatus(id: string, status: string): Promise<void> {
  assertUuid(id);
  await sql`update ti_atividades set status = ${status} where id = ${id}`;
}

export async function deleteTiAtividade(id: string): Promise<void> {
  assertUuid(id);
  const rows = (await sql`select tarefa_id from ti_atividades where id = ${id}`) as { tarefa_id: string }[];
  if (!rows[0]) return;
  const tarefaId = rows[0].tarefa_id;

  await sql`delete from ti_atividades where id = ${id}`;
  await balancearPesosAtividades(tarefaId);
}

export async function atualizarOrdemTarefas(ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i++) {
    if (ids[i]) {
      assertUuid(ids[i]);
      await sql`update ti_tarefas set ordem = ${i} where id = ${ids[i]}`;
    }
  }
}

export async function atualizarOrdemAtividades(ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i++) {
    if (ids[i]) {
      assertUuid(ids[i]);
      await sql`update ti_atividades set ordem = ${i} where id = ${ids[i]}`;
    }
  }
}
