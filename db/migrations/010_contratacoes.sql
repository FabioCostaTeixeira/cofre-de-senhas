-- Contratação: registro de que um cliente comprou um produto avulso, combo ou plano.
-- Gera saldo consumível por produto em contratacao_itens, que o módulo de Ordem de
-- Serviço (spec futura) vai consultar e decrementar. deleted_at aqui significa
-- "contratação cancelada" (mesmo padrão de soft-delete do resto do sistema) — cancelar
-- não mexe em quantidade_consumida, preservando o histórico de consumo já feito.
create table contratacoes (
  id              uuid primary key default gen_random_uuid(),
  cliente_id      uuid not null references clientes(id),
  tipo            text not null check (tipo in ('avulso', 'combo', 'plano')),
  produto_id      uuid references produtos(id),
  combo_id        uuid references combos(id),
  plano_id        uuid references planos(id),
  quantidade      int not null check (quantidade > 0),
  preco_total     numeric(10,2) not null check (preco_total >= 0),
  data_validade   date,
  deleted_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (
    (tipo = 'avulso' and produto_id is not null and combo_id is null and plano_id is null) or
    (tipo = 'combo' and combo_id is not null and produto_id is null and plano_id is null) or
    (tipo = 'plano' and plano_id is not null and produto_id is null and combo_id is null)
  )
);
create index contratacoes_cliente_idx on contratacoes (cliente_id);

-- Sempre no nível de produto (nunca combo/plano diretamente), mesmo quando a
-- contratação foi de um combo/plano — o produto_id vem da expansão de combo_itens/
-- plano_itens feita em código (lib/db/contratacoes.ts) no momento da criação.
create table contratacao_itens (
  id                    uuid primary key default gen_random_uuid(),
  contratacao_id        uuid not null references contratacoes(id) on delete cascade,
  produto_id            uuid not null references produtos(id),
  quantidade_total      int not null check (quantidade_total > 0),
  quantidade_consumida  int not null default 0 check (quantidade_consumida >= 0 and quantidade_consumida <= quantidade_total)
);
create index contratacao_itens_contratacao_idx on contratacao_itens (contratacao_id);
create index contratacao_itens_produto_idx on contratacao_itens (produto_id);
