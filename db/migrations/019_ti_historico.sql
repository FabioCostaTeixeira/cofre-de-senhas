-- Histórico (timeline) dos cards de TI: Features (ti_tarefas) e User Stories
-- (ti_atividades). Cada entrada diz o que aconteceu, por quê, quando e quem fez.
-- `movimentacao` nasce junto com a troca de status (motivo obrigatório); `nota` é a
-- anotação avulsa feita ao abrir o card. Ver lib/db/ti-historico.ts.
create table ti_historico (
  id            uuid primary key default gen_random_uuid(),
  tarefa_id     uuid references ti_tarefas(id) on delete cascade,
  atividade_id  uuid references ti_atividades(id) on delete cascade,
  usuario_id    uuid not null references users(id),
  tipo          text not null check (tipo in ('movimentacao', 'nota')),
  status_de     text,
  status_para   text,
  descricao     text not null check (length(trim(descricao)) > 0),
  created_at    timestamptz not null default now(),
  -- Cada entrada é de exatamente um card.
  check ((tarefa_id is null) <> (atividade_id is null)),
  check (tipo = 'nota' or (status_de is not null and status_para is not null))
);
create index ti_historico_tarefa_idx on ti_historico (tarefa_id, created_at);
create index ti_historico_atividade_idx on ti_historico (atividade_id, created_at);
