create table ti_projetos (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null,
  descricao    text,
  status       text not null default 'roadmap',
  prioridade   text not null default 'media',
  responsavel  text,
  data_inicio  date,
  data_fim     date,
  created_at   timestamptz not null default now()
);

create table ti_tarefas (
  id           uuid primary key default gen_random_uuid(),
  projeto_id   uuid not null references ti_projetos(id) on delete cascade,
  nome         text not null,
  descricao    text,
  status       text not null default 'a_fazer',
  prioridade   text not null default 'media',
  responsavel  text,
  created_at   timestamptz not null default now()
);
create index ti_tarefas_projeto_idx on ti_tarefas (projeto_id);

create table ti_atividades (
  id           uuid primary key default gen_random_uuid(),
  tarefa_id    uuid not null references ti_tarefas(id) on delete cascade,
  nome         text not null,
  descricao    text,
  status       text not null default 'a_fazer',
  prioridade   text not null default 'media',
  responsavel  text,
  created_at   timestamptz not null default now()
);
create index ti_atividades_tarefa_idx on ti_atividades (tarefa_id);
