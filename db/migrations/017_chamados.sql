-- Chamados da equipe: quadro Working › Projetos. Pedido interno, sem cliente nem saldo
-- de contratação — por isso tabela própria em vez de `tarefas` (que reserva e consome
-- `contratacao_itens`). Quem abre escolhe categoria (de quadro 'projeto') e produto,
-- como na OS, mais responsável, título e descrição.

-- Categoria passa a poder mandar o trabalho para o quadro de Projetos.
alter table categorias_produto drop constraint categorias_produto_planejamento_check;
alter table categorias_produto
  add constraint categorias_produto_planejamento_check
    check (planejamento in ('edicao', 'gravacao', 'projeto'));

create table chamados (
  id              uuid primary key default gen_random_uuid(),
  categoria_id    uuid not null references categorias_produto(id),
  produto_id      uuid not null references produtos(id),
  responsavel_id  uuid references users(id),
  criado_por      uuid not null references users(id),
  titulo          text not null,
  descricao       text,
  -- id de COLUNAS_CHAMADO (lib/kanban.ts), nunca o rótulo.
  coluna          text not null default 'aberto' check (coluna in
                    ('aberto','em_andamento','block','homologacao','concluido')),
  prioridade      int not null default 0,
  deleted_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index chamados_coluna_idx on chamados (coluna) where deleted_at is null;

-- Categoria e produto pedidos pelo cliente (2026-11-03). Exclusiva: o Chamado não
-- aparece sob outras categorias na OS, e Projeto só oferece os produtos dela.
insert into categorias_produto (nome, unidade_consumo, planejamento, produtos_exclusivos)
select 'Projeto', 'chamado', 'projeto', true
 where not exists (select 1 from categorias_produto where nome = 'Projeto');

insert into produtos (categoria_id, nome, preco)
select id, 'Chamado', 0 from categorias_produto
 where nome = 'Projeto'
   and not exists (select 1 from produtos p where p.categoria_id = categorias_produto.id and p.nome = 'Chamado');
