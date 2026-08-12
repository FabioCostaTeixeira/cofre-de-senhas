# Ordem de Serviço (OS) — Design

## Contexto

Continuação da iniciativa pedida pelo cliente: uma OS (despacho de demanda de trabalho) que
vincula produto/combo a um cliente, deduz automaticamente de um plano/saldo que ele possua, e
pré-agenda a gravação quando aplicável. A primeira metade dessa iniciativa — **Contratação**
(registro de venda de avulso/combo/plano, gerando saldo consumível por produto) — já está
implementada (`docs/superpowers/specs/2026-08-12-contratacao-plano-design.md`). Este documento
cobre a segunda metade: a OS, que **consome** o saldo gerado pela Contratação.

## Escopo

Tela nova onde o operador lança uma **comanda fechada**: escolhe um cliente e monta uma lista
de linhas, cada uma com produto + quantidade + "deseja pré-agendar?" (aplica a qualquer
produto — gravação, entrega de mídia, edição, etc., não só gravação). Ao confirmar, a comanda
inteira é criada de uma vez; não há edição posterior (mesma imutabilidade da Contratação). Se
o cliente não tiver saldo suficiente pra algum item, a OS inteira é rejeitada — nada é gravado
— com uma mensagem indicando qual produto está sem saldo, e o operador cria a contratação que
falta antes de tentar de novo (a OS nunca vende avulso na hora; isso é escopo exclusivo da
Contratação).

Cada linha desconta saldo (`contratacao_itens.quantidade_consumida`) somando o saldo disponível
de **todas** as contratações ativas do cliente pra aquele produto, descontando da mais antiga
primeiro (FIFO por `contratacoes.created_at`) — o operador não precisa saber de qual
contratação o saldo veio.

Linhas marcadas "pré-agendar" pedem também data, horário de início/fim, local e estúdio (mesmos
campos do agendamento manual) e criam um registro em `agendamentos` com
`status = 'pre_agendado'`, usando `categoria_produto_id = produto.categoria_id` — reaproveitando
as checagens de conflito de horário e bloqueio de estúdio já existentes em `lib/db/agenda.ts`.

A OS pode ser cancelada depois de criada: cancelar devolve o saldo consumido por cada linha
(`quantidade_consumida -= quantidade`, usando o mesmo detalhamento por contratação gravado na
criação) e cancela (`status = 'cancelado'`) os agendamentos `pre_agendado` vinculados. Igual à
Contratação, uma OS cancelada some da lista principal.

## Modelo de dados

### `ordens_servico`

Cabeçalho da comanda.

```sql
create table ordens_servico (
  id          uuid primary key default gen_random_uuid(),
  cliente_id  uuid not null references clientes(id),
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index ordens_servico_cliente_idx on ordens_servico (cliente_id);
```

### `os_itens`

Cada linha da comanda.

```sql
create table os_itens (
  id              uuid primary key default gen_random_uuid(),
  os_id           uuid not null references ordens_servico(id) on delete cascade,
  produto_id      uuid not null references produtos(id),
  quantidade      int not null check (quantidade > 0),
  pre_agendar     boolean not null default false,
  agendamento_id  uuid references agendamentos(id),
  check (
    (pre_agendar = true and agendamento_id is not null) or
    (pre_agendar = false and agendamento_id is null)
  )
);
create index os_itens_os_idx on os_itens (os_id);
```

### `os_item_saldos`

De qual(is) `contratacao_itens` cada linha descontou saldo — necessário porque uma linha pode
consumir de mais de uma contratação (FIFO), e é o que permite devolver o saldo certinho no
cancelamento.

```sql
create table os_item_saldos (
  id                    uuid primary key default gen_random_uuid(),
  os_item_id            uuid not null references os_itens(id) on delete cascade,
  contratacao_item_id   uuid not null references contratacao_itens(id),
  quantidade            int not null check (quantidade > 0)
);
create index os_item_saldos_os_item_idx on os_item_saldos (os_item_id);
create index os_item_saldos_contratacao_item_idx on os_item_saldos (contratacao_item_id);
```

### Lógica de criação (transacional)

Para cada linha da OS, nesta ordem:

1. Busca `contratacao_itens` do cliente com aquele `produto_id` e saldo disponível
   (`quantidade_total - quantidade_consumida > 0`), via join com `contratacoes` (mesmo cliente,
   `deleted_at is null`), ordenado por `contratacoes.created_at` ascendente.
2. Vai descontando dessas linhas até completar a `quantidade` pedida, registrando cada desconto
   como uma linha de `os_item_saldos`. Se a soma de saldo disponível for menor que a quantidade
   pedida, lança erro nomeando o produto — nenhuma escrita acontece (toda a checagem de saldo de
   todas as linhas roda antes de qualquer escrita).
3. Se a linha tem `pre_agendar = true`, valida a checagem de conflito de horário
   (`existeConflito`) e de bloqueio de estúdio (`existeBloqueioNoHorario`), mesmas usadas por
   `createAgendamento` — se bloquear, rejeita a OS inteira com a mesma mensagem que o
   agendamento manual usaria.

Só depois de todas as linhas passarem nas checagens acima, uma única transação grava: o registro
em `ordens_servico`, cada `os_itens`, cada `os_item_saldos`, os updates de
`quantidade_consumida` em `contratacao_itens`, e os `agendamentos` das linhas com
`pre_agendar = true` (status `pre_agendado`).

### Lógica de cancelamento

1. Para cada `os_item_saldos` da OS, soma de volta em `contratacao_itens.quantidade_consumida`
   (`-= quantidade`).
2. Para cada `os_itens.agendamento_id` não nulo, atualiza esse agendamento pra
   `status = 'cancelado'` (não apaga — mesmo espírito do resto da agenda: cancelado continua
   visível como histórico, só libera o horário).
3. Marca `ordens_servico.deleted_at = now()`.

Tudo isso em uma transação só.

## Tela

- Rota `/ordens-servico`, `requireMaster()` (mesmo padrão dos demais módulos).
- **Formulário:** select de cliente → repetidor de linhas, cada uma com: select de produto (só
  ativos), input de quantidade, checkbox "Pré-agendar?" — quando marcado, expande os campos de
  data, hora de início, hora de fim, local de gravação e estúdio (mesmos componentes/opções já
  usados em `AgendaFormularioModal`). Botão "+ Adicionar item" pra novas linhas. Confirmar
  cria a OS inteira de uma vez.
- **Lista:** OS's ativas (canceladas somem, mesmo padrão de Contratação), mostrando cliente,
  itens resumidos (produto × quantidade, com indicação de quais foram pré-agendados), data de
  criação, e botão "Cancelar".

## Validações

- Cliente obrigatório.
- Pelo menos 1 item na comanda.
- Cada item: produto obrigatório e ativo (`ativo = true and deleted_at is null`), quantidade > 0
  inteiro.
- Item com `pre_agendar = true`: data, hora de início, hora de fim, local e estúdio obrigatórios
  e válidos — reaproveita `validarPeriodoAgendamento` (formato de data, horário múltiplo de 15
  minutos, hora fim depois da hora início).
- Saldo insuficiente em qualquer item rejeita a OS inteira antes de qualquer escrita (ver Lógica
  de criação acima).
- Conflito de horário/bloqueio de estúdio em qualquer item pré-agendado rejeita a OS inteira,
  antes de qualquer escrita.

## Arquivos (seguindo o padrão dos módulos existentes)

- `db/migrations/011_ordens_servico.sql` — as 3 tabelas acima.
- `lib/types.ts` — `OrdemServico`, `OSItemLinha` (linha resolvida pra exibição, com nome do
  produto e se foi pré-agendado), `DadosOS`, `DadosOSItem`.
- `lib/os-form.ts` — `lerDadosOS(fd: FormData)`, parsing/validação de FormData incluindo o array
  de itens (mesmo padrão de `lerItensCombo`/`lerItensPlano` em `lib/produtos-form.ts`, que já
  fazem parse de um campo JSON serializado do lado do cliente).
- `lib/db/ordens-servico.ts` — `listOrdensServico()`, `createOrdemServico()` (com a lógica de
  FIFO de saldo + checagem de agenda + transação), `cancelarOrdemServico()` (devolve saldo +
  cancela agendamentos vinculados).
- `app/(app)/ordens-servico/page.tsx` + `actions.ts` — server component + server actions
  (`criarOS`, `cancelarOS`), mesmo padrão dos demais módulos.
- `components/OSClient.tsx` — client component com formulário (repetidor de linhas) + lista.
- `lib/db/audit.ts` — adicionar `'ordem_servico'` ao union de `entityType`.
- `components/Sidebar.tsx` — item de menu novo "Ordens de Serviço".
- `lib/authz.ts` — `canManageOrdensServico` (master-only, mesmo padrão).

## Testes

- `tests/os-form.test.ts` — parsing/validação de `lerDadosOS` (cliente obrigatório, sem itens,
  item sem produto/quantidade inválida, item com pré-agendar sem data/horário, campos válidos
  com e sem pré-agendamento).
- `tests/integracao.test.ts` (acrescentar) — cobrindo, contra banco real:
  - FIFO: cliente com saldo do mesmo produto em 2 contratações diferentes, OS descontando mais
    da mais antiga primeiro, uma linha em `os_item_saldos` por contratação afetada.
  - Saldo insuficiente em uma linha rejeita a OS inteira — nenhuma linha é gravada, nem as que
    tinham saldo suficiente (nem `os_itens`, nem update de `quantidade_consumida`).
  - Item com `pre_agendar = true` cria `agendamentos` com `status = 'pre_agendado'` e
    `categoria_produto_id` igual ao do produto.
  - Conflito de horário (outro agendamento no mesmo estúdio/horário) rejeita a OS inteira sem
    gravar nada.
  - Bloqueio de estúdio (`bloqueios_estudio`) no horário pedido rejeita a OS inteira.
  - Cancelamento: devolve `quantidade_consumida` de cada contratação afetada, marca os
    agendamentos vinculados como `cancelado` (sem apagá-los), e a OS some de
    `listOrdensServico()`.
- `tests/OSClient.test.tsx` — fluxo do formulário (adicionar linha, marcar pré-agendar expande
  campos de data/horário), exibição da lista, cancelamento.
