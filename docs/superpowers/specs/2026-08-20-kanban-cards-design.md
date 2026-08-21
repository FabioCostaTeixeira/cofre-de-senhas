# Kanban — Cards e Modelo de Reserva/Consumo — Design

**Data:** 2026-08-20
**Status:** aprovado (brainstorming)
**Branch:** `dev`

## 1. Objetivo

Dar cards ao quadro de Planejamento (spec `2026-08-20-working-planejamento-design.md`,
que entregou só as colunas vazias) e mudar **quando** o saldo do cliente é debitado.

Duas frentes numa entrega só, por decisão do cliente. Elas são inseparáveis: o card é o
que dispara o consumo, e sem mudar o momento do débito o card duplicaria dedução já
feita pela OS.

## 2. Mudança de regra: consumo passa a ter duas fases

**Hoje:** `createOrdemServico` (`lib/db/ordens-servico.ts`) debita
`quantidade_consumida` no ato da criação da OS, e valida saldo ali (`SaldoInsuficienteError`).

**Passa a ser:** criar **reserva**, concluir **consome**.

`contratacao_itens` ganha a coluna `quantidade_reservada`. O disponível de um item passa
de `total - consumida` para:

```
disponivel = quantidade_total - quantidade_reservada - quantidade_consumida
```

| Evento | Efeito |
|---|---|
| Tarefa criada (inclusive a gerada por OS) | `reservada + 1` — barra com erro se não houver disponível |
| Card → Concluído, **sem** agendamento vinculado | `reservada - 1`, `consumida + 1` |
| Agendamento → status `concluido` | `reservada - 1`, `consumida + 1` |
| Card sai de Concluído | `consumida - 1`, `reservada + 1` — só se o card foi quem consumiu |
| Tarefa apagada | `reservada - 1` |
| OS cancelada | libera a reserva das tarefas dela ainda não concluídas |

**Quem consome, card ou agenda:** se a tarefa tem `agendamento_id`, o consumo é do
agendamento — o card não debita ao ir pra Concluído. Sem isso, um produto de gravação
debitaria duas vezes. Uma tarefa sem `agendamento_id` consome pelo próprio card.

A simetria vale na volta: card com `agendamento_id` que sai de Concluído **não** devolve
nada, porque não foi ele quem consumiu. Devolver ali creditaria saldo que o card nunca
debitou.

**Card = 1 unidade.** Uma tarefa reserva e consome exatamente 1 unidade de 1
`contratacao_item_id`. Não há campo de quantidade — precisa de 3, criam-se 3 tarefas.
Isso é o que mantém o modelo de saldo simples: nenhuma tarefa precisa dividir reserva
entre várias contratações, ao contrário de `os_itens`, que faz isso via `os_item_saldos`.

**OS passa a gerar card:** cada item de OS cria **`quantidade` tarefas** em "A Fazer" —
um item de quantidade 3 vira 3 cards de 1 unidade. Sem isso, item de OS sem
pré-agendamento não teria nenhum evento de conclusão e ficaria reservado pra sempre.
Item com `pre_agendar` gera as tarefas já com `agendamento_id` preenchido.

**Dado existente:** as deduções já feitas em `quantidade_consumida` continuam válidas
como consumo realizado. `quantidade_reservada` nasce `0` para todas as linhas atuais.
Sem migração de dado, sem reverter nada. A regra nova vale para o que for criado a
partir do deploy.

## 3. Tabela `tarefas`

| Coluna | Tipo | Nota |
|---|---|---|
| `id` | uuid pk | |
| `cliente_id` | uuid not null → `clientes` | |
| `responsavel_id` | uuid null → `users` | null = sem responsável definido |
| `produto_id` | uuid not null → `produtos` | |
| `contratacao_item_id` | uuid not null → `contratacao_itens` | qual linha da carteira debita |
| `agendamento_id` | uuid null → `agendamentos` | preenchido → quem consome é a agenda |
| `os_item_id` | uuid null → `os_itens` | preenchido → tarefa nasceu de uma OS |
| `tarefa` | text null | texto livre, o que precisa ser feito |
| `coluna` | text not null | um dos ids de `COLUNAS_KANBAN` (`lib/kanban.ts`) |
| `prioridade` | int not null | menor = mais no topo |
| `deadline_cliente` | date null | governa a cor do card |
| `deadline_tarefa` | date null | prazo interno, só exibido |
| `ajuste` | boolean not null default false | voltou da homologação |
| `consumido` | boolean not null default false | esta tarefa já virou consumo — impede debitar duas vezes e devolver o que não debitou |
| `created_at` / `updated_at` / `deleted_at` | timestamptz | soft-delete, padrão do projeto |

`coluna` guarda o **id** (`a_fazer`), nunca o rótulo — é o contrato que `lib/kanban.ts`
já fixa em teste, justamente pra renomear rótulo não quebrar dado.

## 4. Card

**Resumido** (sempre visível): cliente · responsável · prioridade · produto.

**Estendido** (um clique no resumido): os quatro acima + tarefa · deadline cliente ·
deadline tarefa.

### Cor, por `deadline_cliente`

Dias restantes = `deadline_cliente - hoje`, em Brasília (`America/Sao_Paulo`, mesma
convenção de `lib/formato.ts` e `lib/dashboard-calc.ts`).

| Dias restantes | Cor |
|---|---|
| 4 ou mais | verde |
| 2 ou 3 | amarelo |
| 1, 0 ou negativo | vermelho |
| sem deadline | neutro, sem cor |

### Flag de ajuste

Card movido de **Homologação Cliente** para qualquer coluna que **não** seja Concluído
recebe `ajuste = true`: vermelho mais vivo que o vermelho de prazo, ícone de exclamação,
e prioridade sobre todos os outros cards da coluna.

`ajuste` volta a `false` quando o card chega em Concluído.

### Ordenação dentro da coluna

1. `ajuste = true` primeiro
2. `prioridade` ascendente
3. empate → `created_at` ascendente (mais antigo primeiro)

## 5. Criar tarefa

Clique no **cabeçalho da coluna** → confirmação "Deseja incluir uma nova tarefa?" →
modal de cadastro (`ModalForm`, padrão do projeto), já com a coluna de origem definida.

Campos e suas origens:

| Campo | Origem |
|---|---|
| Cliente | `clientes` cadastrados |
| Responsável | `users` |
| Produto | produtos **contratados por aquele cliente**, só os com disponível > 0 |
| Tarefa | texto livre |
| Prioridade | número, informado no cadastro |
| Deadline cliente | data |
| Deadline tarefa | data |

Produto depende de cliente: a lista só carrega depois de escolher o cliente, e reflete a
carteira dele (`contratacao_itens` com disponível). Escolher o produto define também o
`contratacao_item_id` que será reservado.

## 6. Drag and drop

Biblioteca nova: `@dnd-kit` (o projeto não tem nenhuma de DnD; `@dnd-kit` é a opção
mantida e compatível com React 19).

- **Entre colunas:** muda `coluna`. Dispara as regras de §2 (consumo ao entrar em
  Concluído) e de §4 (flag de ajuste ao sair de Homologação).
- **Dentro da coluna:** reordena, reescrevendo `prioridade` dos cards afetados.

## 7. Fora de escopo

- Reverter deduções antigas ou qualquer migração de dado existente.
- Colunas configuráveis pelo usuário.
- Anexos, comentários, histórico de movimentação, notificação.
- Filtro/busca no quadro.
- Permissão por usuário: quem vê o quadro vê e move tudo, como já é hoje.

## 8. Teste

- **Unidade (lógica pura):** faixa de cor por dias restantes (incluindo os limites 4/3/2/1
  e o caso sem deadline) e ordenação da coluna (ajuste no topo, prioridade, empate por
  data). São as regras com mais chance de erro de borda.
- **Integração (banco real, `tests/integracao.test.ts`, já existente e gateado por
  `DATABASE_URL`):** o ciclo de saldo. Reserva ao criar, consumo ao concluir, devolução
  ao sair de Concluído, e o caso de tarefa com agendamento — onde o card **não** pode
  debitar. É onde um erro custa saldo de cliente, então precisa de banco de verdade.
- **Componente:** card resumido vs estendido, e o modal de criação.
- **Manual:** criar tarefa, arrastar entre colunas, conferir saldo em
  `/cadastros/clientes` (aba Compras) antes e depois de concluir.
