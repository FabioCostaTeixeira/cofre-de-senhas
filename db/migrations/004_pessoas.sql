-- Separa QUEM A PESSOA É de UM VÍNCULO DE TRABALHO.
--
-- O gatilho foi a readmissão: um funcionário demitido pode voltar, e o cadastro
-- antigo deve virar histórico em vez de ser reativado. Com tudo numa tabela só isso
-- é impossível — CPF único global barra o segundo cadastro, e e-mail único global
-- barra junto, porque a pessoa costuma receber de volta o mesmo e-mail corporativo.
--
-- Agora: 1 linha em `pessoas`, N linhas em `users` (uma por passagem).
create table pessoas (
  id                 uuid primary key default gen_random_uuid(),
  telefone           text,
  cep                text,
  logradouro         text,
  numero             text,
  complemento        text,
  bairro             text,
  cidade             text,
  uf                 text check (uf is null or uf ~ '^[A-Z]{2}$'),
  data_nascimento    date,
  -- CPF e RG cifrados (AES-256-GCM). AAD = `${pessoa_id}:cpf` / `${pessoa_id}:rg`,
  -- prendendo o valor à linha E ao campo: sem o campo no AAD, quem tiver escrita no
  -- banco copiaria rg_ct/iv/tag para cpf_ct/iv/tag e leria um pelo outro.
  cpf_ct             bytea,
  cpf_iv             bytea,
  cpf_tag            bytea,
  -- Coluna cifrada não aceita UNIQUE (IV novo a cada gravação). Este HMAC
  -- determinístico é o índice de unicidade: um CPF, uma pessoa.
  cpf_hmac           bytea unique,
  rg_ct              bytea,
  rg_iv              bytea,
  rg_tag             bytea,
  -- Órgão expedidor fica em claro: não identifica ninguém sozinho.
  rg_orgao_expedidor text,
  -- CNPJ é público na Receita; não justifica o custo de cifrar.
  cnpj               text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table users
  add column pessoa_id        uuid references pessoas(id),
  add column data_contratacao date,
  add column data_demissao    date;

-- Backfill: cada usuário existente ganha sua pessoa, reaproveitando o próprio id.
-- É migração única; ids coincidentes nas linhas antigas são inofensivos e fáceis de
-- conferir depois. Só depois disso a coluna vira NOT NULL, para o resto do código
-- nunca precisar tratar "usuário sem pessoa".
insert into pessoas (id) select id from users;
update users set pessoa_id = id;
alter table users alter column pessoa_id set not null;

-- E-mail deixa de ser único global e passa a ser único entre vínculos NÃO encerrados,
-- senão o readmitido não conseguiria reusar o e-mail corporativo enquanto a linha
-- antiga existisse. O recorte é `data_demissao is null`, e não `is_active`: suspensão
-- temporária não pode liberar o e-mail de alguém para outra pessoa.
alter table users drop constraint users_email_key;
create unique index users_email_ativo_idx on users (email) where data_demissao is null;

create index users_pessoa_idx on users (pessoa_id);
