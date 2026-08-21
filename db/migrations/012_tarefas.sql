-- Cards do quadro de Planejamento (Working). Cada tarefa é UMA unidade de trabalho:
-- reserva e consome exatamente 1 de um contratacao_itens. Precisa de 3? São 3 tarefas.
-- Isso evita ter que dividir reserva entre contratações, como os_itens faz via
-- os_item_saldos. Ver docs/superpowers/specs/2026-08-20-kanban-cards-design.md.

-- Reserva: criada ao abrir a tarefa, vira consumo quando ela (ou o agendamento dela)
-- conclui. Sem isso, mover o débito para a conclusão deixaria de barrar venda acima do
-- saldo. Linhas existentes nascem com 0 — deduções antigas seguem válidas como consumo.
alter table contratacao_itens
  add column quantidade_reservada int not null default 0 check (quantidade_reservada >= 0);

-- Backstop do invariante que o módulo inteiro depende: disponivel = total - reservada -
-- consumida nunca pode ficar negativo. A aritmética mora no código (lib/db/tarefas.ts,
-- ordens-servico.ts, agenda.ts), e esse mesmo código já teve uma vez um bug de alocar a
-- mesma unidade duas vezes (ver comentário "achado Critical 2" em ordens-servico.ts) —
-- aqui o banco recusa em vez de vender saldo que o cliente não tem.
-- Implica que "concluir" tem que ser UM update só (reservada -1, consumida +1 juntos):
-- consumir antes de liberar estoura a soma no meio do caminho.
alter table contratacao_itens
  add constraint contratacao_itens_saldo_check
  check (quantidade_reservada + quantidade_consumida <= quantidade_total);

create table tarefas (
  id                   uuid primary key default gen_random_uuid(),
  cliente_id           uuid not null references clientes(id),
  responsavel_id       uuid references users(id),
  produto_id           uuid not null references produtos(id),
  contratacao_item_id  uuid not null references contratacao_itens(id),
  -- Preenchido => quem consome é o agendamento, não o card (evita débito duplo em
  -- produto de gravação).
  agendamento_id       uuid references agendamentos(id),
  -- Preenchido => tarefa nasceu de um item de OS.
  os_item_id           uuid references os_itens(id),
  tarefa               text,
  coluna               text not null check (coluna in
                         ('roadmap','a_fazer','executando','block','homologacao_cliente','concluido')),
  prioridade           int not null default 0,
  deadline_cliente     date,
  deadline_tarefa      date,
  -- Voltou de Homologação Cliente para coluna que não é Concluído.
  ajuste               boolean not null default false,
  -- Marca que ESTA tarefa já converteu sua reserva em consumo, para não debitar duas
  -- vezes nem devolver o que não debitou.
  consumido            boolean not null default false,
  deleted_at           timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index tarefas_coluna_idx on tarefas (coluna) where deleted_at is null;
create index tarefas_cliente_idx on tarefas (cliente_id);
create index tarefas_agendamento_idx on tarefas (agendamento_id);
create index tarefas_os_item_idx on tarefas (os_item_id);
