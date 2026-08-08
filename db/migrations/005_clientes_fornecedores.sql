-- Cadastro de clientes e fornecedores. Duas tabelas separadas (não uma com
-- campo `tipo`): são conceitos diferentes que hoje têm os mesmos campos, mas
-- não necessariamente vão continuar assim.
create table clientes (
  id                  uuid primary key default gen_random_uuid(),
  nome                text not null,
  contato_responsavel text,
  email               text,
  telefone            text,
  cidade              text,
  uf                  text check (uf is null or uf ~ '^[A-Z]{2}$'),
  deleted_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table fornecedores (
  id                  uuid primary key default gen_random_uuid(),
  nome                text not null,
  contato_responsavel text,
  email               text,
  telefone            text,
  cidade              text,
  uf                  text check (uf is null or uf ~ '^[A-Z]{2}$'),
  deleted_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
