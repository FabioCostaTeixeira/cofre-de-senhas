-- Local físico onde gravações acontecem (ex.: "P7 Belo Horizonte"), com uma lista de
-- estúdios (salas) dentro. Sem `on delete cascade` em estudios.local_id: apagar um
-- local não apaga estúdio nenhum por baixo dos panos (mesma filosofia de
-- combo_itens/plano_itens no módulo Produtos — destrutivo demais pra ser implícito).
create table locais_gravacao (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  endereco    text,
  responsavel text,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table estudios (
  id          uuid primary key default gen_random_uuid(),
  local_id    uuid not null references locais_gravacao(id),
  nome        text not null,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index estudios_local_id_idx on estudios(local_id);
