import { randomUUID } from 'node:crypto';
import { sql } from '@/lib/db/client';
import { assertUuid } from '@/lib/validation';

export type TiProjeto = {
  id: string;
  nome: string;
  descricao: string | null;
  status: string;
  prioridade: string;
  responsavel: string | null;
  data_inicio: string | null;
  data_fim: string | null;
  created_at: string;
  total_features?: number;
  progresso?: number;
};

export type TiTarefa = {
  id: string;
  projeto_id: string;
  nome: string;
  status: string;
  prioridade: string;
  responsavel: string | null;
  descricao: string | null;
  peso: number;
  created_at: string;
  total_stories?: number;
};

export type TiAtividade = {
  id: string;
  tarefa_id: string;
  nome: string;
  status: string;
  prioridade: string;
  responsavel: string | null;
  descricao: string | null;
  peso: number;
  created_at: string;
};

export type TiTarefaOption = {
  id: string;
  projeto_id: string;
  nome: string;
  projeto_nome: string;
};

export async function listTiProjetos(): Promise<TiProjeto[]> {
  return (await sql`
    select p.id, p.nome, p.descricao, p.status, p.prioridade, p.responsavel,
           to_char(p.data_inicio, 'YYYY-MM-DD') as data_inicio,
           to_char(p.data_fim, 'YYYY-MM-DD') as data_fim,
           p.created_at,
           (select count(*)::int from ti_tarefas t where t.projeto_id = p.id) as total_features,
           -- Mesma regra da barra da página do projeto: peso das features concluídas / peso total.
           (
             select coalesce(
               sum(case when t.status = 'concluido' then t.peso else 0 end) * 100.0
                 / nullif(sum(t.peso), 0),
               0
             )::int
             from ti_tarefas t
             where t.projeto_id = p.id
           ) as progresso
      from ti_projetos p
     order by p.nome
  `) as TiProjeto[];
}

export async function createTiProjeto(data: {
  nome: string;
  descricao: string | null;
  status: string;
  prioridade: string;
  responsavel: string | null;
  data_inicio: string | null;
  data_fim: string | null;
}): Promise<void> {
  await sql`
    insert into ti_projetos (nome, descricao, status, prioridade, responsavel, data_inicio, data_fim)
    values (${data.nome}, ${data.descricao}, ${data.status}, ${data.prioridade}, ${data.responsavel}, ${data.data_inicio}, ${data.data_fim})
  `;
}

export async function duplicateTiProjeto(id: string): Promise<string | null> {
  assertUuid(id);
  const novoProjetoId = randomUUID();

  const rows = (await sql`
    with projeto_origem as (
      select nome, descricao, prioridade, responsavel, data_inicio, data_fim
        from ti_projetos
       where id = ${id}
    ),
    novo_projeto as (
      insert into ti_projetos (
        id, nome, descricao, status, prioridade, responsavel, data_inicio, data_fim
      )
      select ${novoProjetoId}, nome || ' (Cópia)', descricao, 'roadmap', prioridade,
             responsavel, data_inicio, data_fim
        from projeto_origem
      returning id
    ),
    mapa_tarefas as (
      select t.id as tarefa_origem_id, gen_random_uuid() as nova_tarefa_id,
             t.nome, t.descricao, t.prioridade, t.responsavel, t.peso, t.ordem
        from ti_tarefas t
       where t.projeto_id = ${id}
    ),
    novas_tarefas as (
      insert into ti_tarefas (
        id, projeto_id, nome, descricao, status, prioridade, responsavel, peso, ordem
      )
      select m.nova_tarefa_id, p.id, m.nome, m.descricao, 'roadmap',
             m.prioridade, m.responsavel, m.peso, m.ordem
        from mapa_tarefas m
        cross join novo_projeto p
      returning id
    ),
    novas_atividades as (
      insert into ti_atividades (
        id, tarefa_id, nome, descricao, status, prioridade, responsavel, peso, ordem
      )
      select gen_random_uuid(), m.nova_tarefa_id, a.nome, a.descricao, 'roadmap',
             a.prioridade, a.responsavel, a.peso, a.ordem
        from ti_atividades a
        join mapa_tarefas m on m.tarefa_origem_id = a.tarefa_id
        join novas_tarefas t on t.id = m.nova_tarefa_id
      returning id
    )
    select id from novo_projeto
  `) as { id: string }[];

  return rows[0]?.id ?? null;
}

export async function updateTiProjeto(data: {
  id: string;
  nome: string;
  descricao: string | null;
  status: string;
  prioridade: string;
  responsavel: string | null;
  data_inicio: string | null;
  data_fim: string | null;
}): Promise<void> {
  assertUuid(data.id);
  await sql`
    update ti_projetos
       set nome = ${data.nome},
           descricao = ${data.descricao},
           status = ${data.status},
           prioridade = ${data.prioridade},
           responsavel = ${data.responsavel},
           data_inicio = ${data.data_inicio},
           data_fim = ${data.data_fim}
     where id = ${data.id}
  `;
}

export async function deleteTiProjeto(id: string): Promise<void> {
  assertUuid(id);
  await sql`delete from ti_projetos where id = ${id}`;
}
