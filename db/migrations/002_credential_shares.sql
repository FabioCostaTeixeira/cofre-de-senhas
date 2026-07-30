-- Compartilhamento individual de senha dentro da sala.
--
-- Até aqui uma senha era "global" (todos os membros da sala) ou pessoal (só o dono).
-- Esta tabela cria o meio-termo: o dono escolhe, entre os membros da sala, quem mais
-- enxerga aquela senha. Quem recebe pode ver e copiar; editar e apagar seguem com o
-- dono e com o master.
--
-- `on delete cascade` nos dois lados: apagar a credencial ou o usuário não pode
-- deixar para trás uma linha de acesso apontando para o vazio.
create table credential_shares (
  credential_id uuid not null references credentials(id) on delete cascade,
  user_id       uuid not null references users(id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (credential_id, user_id)
);

create index credential_shares_user_idx on credential_shares (user_id);
