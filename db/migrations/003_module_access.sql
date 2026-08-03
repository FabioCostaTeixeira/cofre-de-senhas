-- Permissão por módulo externo (ex.: Gestor de Projetos). O Cofre em si não precisa
-- de linha aqui: todo usuário ativo já enxerga o Cofre por definição.
--
-- Espelha `room_members`: master tem acesso implícito a tudo (checado em código,
-- não aqui), este cadastro é só para usuário comum.
create table module_access (
  user_id     uuid not null references users(id) on delete cascade,
  module_key  text not null,
  granted_by  uuid not null references users(id),
  created_at  timestamptz not null default now(),
  primary key (user_id, module_key)
);

create index module_access_user_idx on module_access (user_id);
