-- OS escolhe categoria e depois produto; a categoria escolhida (não a do produto)
-- decide o quadro do Planejamento. Agenda passa a registrar o produto.
--
-- Tudo aditivo e nullable de propósito: o código que está em produção (main) não
-- conhece estas colunas e continua inserindo sem elas. Linha sem valor cai no
-- comportamento antigo (ver os `coalesce` em lib/db/tarefas.ts e lib/db/agenda.ts).

-- Produtos de categoria exclusiva só aparecem quando ela é a escolhida (Cortes);
-- os das demais aparecem para qualquer categoria não exclusiva.
alter table categorias_produto
  add column produtos_exclusivos boolean not null default false;
update categorias_produto set produtos_exclusivos = true where nome = 'Cortes';

-- Categoria escolhida no item da OS.
alter table os_itens
  add column categoria_id uuid references categorias_produto(id);

-- Quadro da tarefa, gravado na criação (OS: planejamento da categoria escolhida; tela:
-- o quadro onde foi criada). Null = tarefa antiga, segue a categoria do produto.
alter table tarefas
  add column planejamento text check (planejamento in ('edicao', 'gravacao'));

-- Tipo de gravação do agendamento passa a ser um produto. `categoria_produto_id`
-- continua preenchido (com a categoria do produto) enquanto o código antigo existir.
alter table agendamentos
  add column produto_id uuid references produtos(id);
update agendamentos a set produto_id = oi.produto_id
  from os_itens oi where oi.agendamento_id = a.id;
