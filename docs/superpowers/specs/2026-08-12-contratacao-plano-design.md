# Contratação (avulso / combo / plano) — Design

## Contexto

Cliente pediu uma Ordem de Serviço (OS): despacho de demanda que vincula produto/combo a
um cliente, deduzindo automaticamente de um plano que ele possua (quando houver) e
pré-agendando a gravação. Investigando o schema atual, não existe hoje nenhum registro de
"cliente contratou o plano X" — só o catálogo (`planos`, `plano_itens`, `combos`,
`combo_itens`, `produtos`). A OS depende desse vínculo pra poder deduzir saldo.

Decisão: separar em dois módulos. Este documento cobre só a **Contratação** — o registro de
que um cliente comprou algo (avulso, combo ou plano) e a geração do saldo consumível
resultante. A **OS** (que consome esse saldo e pré-agenda) é um módulo posterior, com spec
própria, construído em cima deste.

## Escopo

Tela nova onde o operador registra uma venda em um de três modos:

- **Avulso**: escolhe um produto do catálogo + quantidade. Preço vem do cadastro do
  produto (não editável na contratação); só a quantidade é livre.
- **Combo**: escolhe um combo do catálogo + quantidade (quantas vezes esse combo foi
  comprado). Itens e preço do combo são fixos, herdados do cadastro.
- **Plano**: escolhe um plano do catálogo + quantidade. Itens e preço do plano são fixos,
  herdados do cadastro.

Se o combo/plano que o cliente quer não existe ainda, o operador cadastra antes em
Produtos/Combos/Planos — esta tela não cria catálogo, só vende o que já existe.

Fora de escopo (fica para a spec da OS): consumo/dedução do saldo gerado aqui, geração de
pré-agendamento, qualquer fluxo de despacho de trabalho.

## Modelo de dados

### `contratacoes`

O registro da venda em si.

```sql
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
```

- `preco_total`: snapshot do valor cobrado (preço do catálogo × `quantidade`) no momento da
  compra — não recalcula se o preço do catálogo mudar depois.
- `data_validade`: preenchida só quando `tipo = 'plano'` e o plano tem
  `tipo_cobranca = 'pacote_fechado'` (`data da contratação + validade_dias` do plano). Null
  para assinatura (fica ativa até cancelar manualmente, sem expiração automática) e para
  avulso/combo (não expiram).
- `deleted_at`: soft-delete = cancelamento da contratação. Mesmo padrão do resto do
  sistema. Cancelar não mexe em `quantidade_consumida` dos itens (histórico preservado).

### `contratacao_itens`

O saldo consumível gerado pela contratação, sempre no nível de produto (nunca combo/plano
diretamente) — é o que a futura OS vai consultar e decrementar.

```sql
create table contratacao_itens (
  id                    uuid primary key default gen_random_uuid(),
  contratacao_id        uuid not null references contratacoes(id) on delete cascade,
  produto_id            uuid not null references produtos(id),
  quantidade_total      int not null check (quantidade_total > 0),
  quantidade_consumida  int not null default 0 check (quantidade_consumida >= 0 and quantidade_consumida <= quantidade_total)
);
create index contratacao_itens_contratacao_idx on contratacao_itens (contratacao_id);
create index contratacao_itens_produto_idx on contratacao_itens (produto_id);
```

`quantidade_consumida` começa em 0 nesta spec — só é decrementada pela OS (módulo futuro).

### Expansão avulso/combo/plano → itens

Ao criar a contratação, o backend "achata" a compra em linhas de `contratacao_itens` por
produto:

- **avulso**: 1 linha — `produto_id` escolhido, `quantidade_total = quantidade` da
  contratação.
- **combo**: expande `combo_itens` do combo escolhido — para cada item,
  `quantidade_total = combo_itens.quantidade × contratacao.quantidade`.
- **plano**: expande `plano_itens` do plano escolhido:
  - item com `tipo_item = 'produto'`: `quantidade_total = plano_itens.quantidade × contratacao.quantidade`.
  - item com `tipo_item = 'combo'`: expande recursivamente `combo_itens` desse combo,
    multiplicando por `plano_itens.quantidade × contratacao.quantidade` (2 níveis de
    expansão, nunca mais que isso — combos não podem conter outros combos hoje).

Se dois níveis de expansão resultarem no mesmo `produto_id` mais de uma vez (ex.: plano com
dois itens que expandem pro mesmo produto), soma as quantidades numa única linha de
`contratacao_itens` por produto.

## Tela

- Rota `/contratacoes`, protegida por `requireMaster()` (mesmo padrão de
  Produtos/Combos/Planos).
- **Lista**: contratações, com busca por cliente. Cada linha mostra tipo, item (produto/
  combo/plano), quantidade, itens de saldo gerados com `quantidade_total -
  quantidade_consumida` restante, validade (se houver) e status (ativa/cancelada via
  `deleted_at`). Botão "Cancelar" nas ativas.
- **Formulário**: seleciona cliente → seleciona tipo (avulso/combo/plano) → campo
  correspondente aparece:
  - avulso: select de produto (só ativos) + input de quantidade
  - combo: select de combo (só ativos) + input de quantidade
  - plano: select de plano (só ativos) + input de quantidade
  - preço total calculado e exibido antes de confirmar (preço do catálogo × quantidade)

## Validações

- Cliente obrigatório.
- Tipo obrigatório, um dos três valores.
- Produto/combo/plano obrigatório conforme o tipo, e precisa estar ativo
  (`ativo = true and deleted_at is null` no catálogo) — não pode contratar item
  desativado.
- Quantidade > 0, inteiro.

## Arquivos (seguindo o padrão dos módulos existentes)

- `db/migrations/010_contratacoes.sql` — as duas tabelas acima.
- `lib/types.ts` — `Contratacao`, `ContratacaoItem`, `DadosContratacao`.
- `lib/contratacao-form.ts` — `lerDadosContratacao(fd: FormData)`, parsing/validação de
  FormData (mesmo padrão de `lib/agenda-form.ts`, `lib/produtos-form.ts`).
- `lib/db/contratacoes.ts` — `listContratacoes()`, `createContratacao()` (com a lógica de
  expansão), `softDeleteContratacao()`.
- `app/(app)/contratacoes/page.tsx` + `actions.ts` — server component + server actions
  (`criarContratacao`, `apagarContratacao`), mesmo padrão de `app/(app)/produtos/planos/`.
- `components/ContratacaoClient.tsx` — client component com formulário + lista.
- `lib/db/audit.ts` — adicionar `'contratacao'` ao union de `entityType`.

## Testes

- `tests/contratacao-form.test.ts` — parsing/validação de `lerDadosContratacao` (campos
  obrigatórios, quantidade inválida, tipo inválido).
- `tests/db/contratacoes.test.ts` ou incluído em `tests/integracao.test.ts` — expansão
  avulso/combo/plano → `contratacao_itens` (casos: avulso simples, combo com múltiplos
  itens, plano com item-produto e item-combo, soma de produto repetido, plano
  pacote_fechado gera `data_validade`, plano assinatura não gera `data_validade`,
  contratação de item inativo é rejeitada, cancelamento faz soft-delete sem alterar
  `quantidade_consumida`).
- `tests/ContratacaoClient.test.tsx` — fluxo dos 3 tipos no formulário, exibição de saldo
  na lista, cancelamento.
