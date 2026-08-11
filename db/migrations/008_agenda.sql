-- Agendamento de servico de gravacao. Uma tabela so — nao ha hierarquia como em
-- locais_gravacao/estudios. status='cancelado' NAO conta pra checagem de conflito
-- de horario (feita em codigo, lib/db/agenda.ts): um agendamento cancelado libera
-- o estudio pra outro, mas continua visivel na grade (vermelho) como historico.
-- Sem on delete cascade nas 4 FKs: apagar cliente/local/estudio/categoria nao deve
-- apagar agendamento nenhum implicitamente (mesma filosofia do resto do projeto).

-- Habilita a FK composta abaixo: garante em nivel de banco que o estudio_id
-- escolhido pertence de fato ao local_id escolhido (sem isso, estudio_id e
-- local_id sao duas FKs independentes que podem apontar pra locais diferentes).
alter table estudios add constraint estudios_id_local_id_key unique (id, local_id);

create table agendamentos (
  id                   uuid primary key default gen_random_uuid(),
  cliente_id           uuid not null references clientes(id),
  local_id             uuid not null references locais_gravacao(id),
  estudio_id           uuid not null,
  categoria_produto_id uuid not null references categorias_produto(id),
  status               text not null check (
    status in ('cancelado', 'agendado', 'pre_agendado', 'gravando', 'concluido')
  ),
  data                 date not null,
  hora_inicio          time not null,
  hora_fim             time not null check (hora_fim > hora_inicio),
  deleted_at           timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  foreign key (estudio_id, local_id) references estudios (id, local_id)
);

create index agendamentos_estudio_data_idx on agendamentos (estudio_id, data);
