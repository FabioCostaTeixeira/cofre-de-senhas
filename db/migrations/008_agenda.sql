-- Agendamento de servico de gravacao. Uma tabela so — nao ha hierarquia como em
-- locais_gravacao/estudios. status='cancelado' NAO conta pra checagem de conflito
-- de horario (feita em codigo, lib/db/agenda.ts): um agendamento cancelado libera
-- o estudio pra outro, mas continua visivel na grade (vermelho) como historico.
-- Sem on delete cascade nas 4 FKs: apagar cliente/local/estudio/categoria nao deve
-- apagar agendamento nenhum implicitamente (mesma filosofia do resto do projeto).
create table agendamentos (
  id                   uuid primary key default gen_random_uuid(),
  cliente_id           uuid not null references clientes(id),
  local_id             uuid not null references locais_gravacao(id),
  estudio_id           uuid not null references estudios(id),
  categoria_produto_id uuid not null references categorias_produto(id),
  status               text not null check (
    status in ('cancelado', 'agendado', 'pre_agendado', 'gravando', 'concluido')
  ),
  data                 date not null,
  hora_inicio          time not null,
  hora_fim             time not null check (hora_fim > hora_inicio),
  deleted_at           timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index agendamentos_estudio_data_idx on agendamentos (estudio_id, data);
