-- Em qual quadro do Planejamento (Working) caem as tarefas dos produtos desta
-- categoria. A tarefa não guarda o tipo: ele vem de produto -> categoria, então
-- tarefa criada à mão e tarefa criada pela OS seguem a mesma regra. Cortes é
-- edição (decisão do cliente, 2026-10-28), por isso o padrão é 'edicao'.
alter table categorias_produto
  add column planejamento text not null default 'edicao'
    check (planejamento in ('edicao', 'gravacao'));
