create table categorias_produto (
  id                uuid primary key default gen_random_uuid(),
  nome              text not null unique,
  unidade_consumo   text,
  -- cada item: {chave, rotulo, tipo: numero|texto|booleano, obrigatorio}. `tipo` é
  -- texto livre aqui dentro (vive no jsonb); os 3 valores aceitos são validados em
  -- código (lib/produtos-form.ts), não por enum do banco.
  atributos_molde   jsonb not null default '[]',
  ativo             boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table produtos (
  id                  uuid primary key default gen_random_uuid(),
  categoria_id        uuid not null references categorias_produto(id),
  nome                text not null,
  descricao           text,
  atributos           jsonb not null default '{}',
  preco               numeric(10,2) not null check (preco >= 0),
  ativo               boolean not null default true,
  deleted_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index produtos_categoria_idx on produtos (categoria_id);

create table combos (
  id                uuid primary key default gen_random_uuid(),
  nome              text not null,
  descricao         text,
  preco             numeric(10,2) not null check (preco >= 0),
  ativo             boolean not null default true,
  deleted_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table combo_itens (
  id          uuid primary key default gen_random_uuid(),
  combo_id    uuid not null references combos(id) on delete cascade,
  produto_id  uuid not null references produtos(id),
  quantidade  int not null check (quantidade > 0),
  unique (combo_id, produto_id)
);

create table planos (
  id              uuid primary key default gen_random_uuid(),
  nome            text not null,
  descricao       text,
  tipo_cobranca   text not null check (tipo_cobranca in ('pacote_fechado', 'assinatura')),
  validade_dias   int,
  ciclo           text check (ciclo in ('mensal')),
  preco           numeric(10,2) not null check (preco >= 0),
  ativo           boolean not null default true,
  deleted_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (
    (tipo_cobranca = 'pacote_fechado' and validade_dias is not null and ciclo is null) or
    (tipo_cobranca = 'assinatura' and ciclo is not null and validade_dias is null)
  )
);

create table plano_itens (
  id          uuid primary key default gen_random_uuid(),
  plano_id    uuid not null references planos(id) on delete cascade,
  tipo_item   text not null check (tipo_item in ('produto', 'combo')),
  produto_id  uuid references produtos(id),
  combo_id    uuid references combos(id),
  quantidade  int not null check (quantidade > 0),
  check (
    (tipo_item = 'produto' and produto_id is not null and combo_id is null) or
    (tipo_item = 'combo' and combo_id is not null and produto_id is null)
  )
);
