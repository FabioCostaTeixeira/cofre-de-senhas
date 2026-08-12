-- Ordem de Serviço (OS): comanda fechada que consome saldo de Contratação (FIFO entre
-- contratações do cliente) e opcionalmente pré-agenda gravação/entrega por item.
-- Ver docs/superpowers/specs/2026-08-12-ordem-servico-design.md.
create table ordens_servico (
  id          uuid primary key default gen_random_uuid(),
  cliente_id  uuid not null references clientes(id),
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index ordens_servico_cliente_idx on ordens_servico (cliente_id);

create table os_itens (
  id              uuid primary key default gen_random_uuid(),
  os_id           uuid not null references ordens_servico(id) on delete cascade,
  produto_id      uuid not null references produtos(id),
  quantidade      int not null check (quantidade > 0),
  pre_agendar     boolean not null default false,
  agendamento_id  uuid references agendamentos(id),
  check (
    (pre_agendar = true and agendamento_id is not null) or
    (pre_agendar = false and agendamento_id is null)
  )
);
create index os_itens_os_idx on os_itens (os_id);

-- De qual(is) contratacao_itens cada os_item descontou saldo — permite devolver
-- certinho no cancelamento, mesmo quando uma linha consumiu de 2+ contratações (FIFO).
create table os_item_saldos (
  id                    uuid primary key default gen_random_uuid(),
  os_item_id            uuid not null references os_itens(id) on delete cascade,
  contratacao_item_id   uuid not null references contratacao_itens(id),
  quantidade            int not null check (quantidade > 0)
);
create index os_item_saldos_os_item_idx on os_item_saldos (os_item_id);
create index os_item_saldos_contratacao_item_idx on os_item_saldos (contratacao_item_id);
