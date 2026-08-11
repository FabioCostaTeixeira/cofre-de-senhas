-- Bloqueio de horario de um estudio (manutencao, indisponibilidade etc). Tabela
-- separada de agendamentos -- nao e um agendamento de cliente, e um motivo de
-- indisponibilidade do proprio estudio. A camada de dados da agenda
-- (lib/db/agenda.ts) tambem consulta esta tabela na checagem de conflito, pra
-- nenhum agendamento poder ser criado/movido em cima de um horario bloqueado.
create table bloqueios_estudio (
  id          uuid primary key default gen_random_uuid(),
  estudio_id  uuid not null references estudios(id),
  data        date not null,
  hora_inicio time not null,
  hora_fim    time not null check (hora_fim > hora_inicio),
  motivo      text,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index bloqueios_estudio_estudio_data_idx on bloqueios_estudio (estudio_id, data);
