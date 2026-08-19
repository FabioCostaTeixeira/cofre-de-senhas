# Modal de Cliente — Layout Mais Largo + Abas de Compras/Agendamento — Design

**Data:** 2026-08-19
**Status:** aprovado (brainstorming)
**Branch:** `dev`

## 1. Objetivo

O modal de cliente (`components/TerceiroClient.tsx`, `tipo='cliente'`) hoje só edita os
dados cadastrais (nome, contato, e-mail, telefone, cidade/UF). Passa a também mostrar, no
modal de edição, o histórico do cliente: o que ele contratou (produtos/combos/planos) com
o que já consumiu e o que tem disponível, e os agendamentos que já teve/tem.

## 2. Escopo

- Modal mais largo: `maxWidth` de `'md'` pra `'2xl'`, tanto no de criar quanto no de editar.
- Campos cadastrais em grid de 3 colunas (2 linhas) em vez de 2 colunas (3 linhas) — só
  muda o `className` do grid em `CamposComuns`, compartilhado com Fornecedores, que
  herda o layout mais largo mas **sem abas** (fora do pedido original).
- Duas abas novas, **só no modal de edição, só para `tipo='cliente'`**: "Compras" e
  "Agendamento".
- Fora de escopo: qualquer alteração na lista principal de clientes, em `/contratacoes`
  ou `/agenda`, ou no fluxo de criação/edição de contratação/agendamento em si — este
  modal é só leitura do histórico do cliente.

## 3. Abas: quando aparecem e como carregam

As abas só existem dentro de `ModalEdicao` (não em `FormularioNovo`, que é criação —
cliente novo não tem histórico) e só quando `tipo === 'cliente'`.

Ao montar `ModalEdicao` para um cliente, um `useEffect` chama uma nova Server Action
(`buscarDadosClienteAction`, em `app/(app)/cadastros/clientes/actions.ts`) diretamente —
não via `useActionState`/`<form action>`, é uma chamada de função assíncrona comum, já
que não é uma submissão de formulário. Ela busca contratações e agendamentos do cliente
de uma vez (uma função, duas queries em paralelo) e guarda o resultado em estado local
(`useState`). Enquanto carrega, cada aba mostra "Carregando...".

## 4. Aba Compras

Uma linha por contratação, com colunas: Tipo (Avulso/Combo/Plano), Item (nome do
produto/combo/plano), Quantidade, Preço total, Data, Status (Ativa/Cancelada). Clicar na
linha expande e mostra os itens de produto daquela contratação: nome, quantidade total,
quantidade consumida, disponível (`total - consumida`).

**Inclui contratações canceladas** — a nova query `listContratacoesDoCliente` não filtra
`deleted_at is null` (diferente de `listContratacoes`, que filtra). Uma contratação com
`deleted_at` não nulo aparece com Status "Cancelada". Isso resolve, no escopo deste modal,
parte da pendência já registrada no projeto sobre falta de visibilidade de histórico de
cancelamento — a lista principal de `/contratacoes` continua filtrando como antes, essa
mudança é só na visão por cliente.

## 5. Aba Agendamento

Tabela com uma linha por agendamento: Produto (nome da categoria), Studio, Data, Hora
início, Hora fim, Status. Ordenado por data/hora decrescente (mais recente primeiro).

**Inclui todos os status, inclusive `cancelado`** — `cancelado` é um valor de status, não
uma exclusão de registro (agendamento cancelado libera o studio, mas continua existindo).
A nova query `listAgendamentosDoCliente` não filtra por `status`, só por
`deleted_at is null` (que é a exclusão de fato — um agendamento apagado pelo usuário,
conceito diferente de cancelado).

## 6. Novas queries

- `lib/db/contratacoes.ts`: `listContratacoesDoCliente(clienteId: string): Promise<Contratacao[]>`
  — mesmo `select`/`join` de `listContratacoes`, filtrado por `ct.cliente_id = ${clienteId}`,
  **sem** o `where ct.deleted_at is null`, mesma ordenação (`order by ct.created_at desc`).
- `lib/db/agenda.ts`: `listAgendamentosDoCliente(clienteId: string): Promise<Agendamento[]>`
  — mesmo `select`/`join` de `listAgendamentosDoEstudio`, filtrado por
  `a.cliente_id = ${clienteId} and a.deleted_at is null`, **sem** filtro de `status`,
  `order by a.data desc, a.hora_inicio desc`.

## 7. Fora de escopo

- Editar ou cancelar uma contratação/agendamento a partir deste modal (é só leitura).
- Paginação — assume-se que o histórico de um cliente cabe numa lista rolável dentro do
  modal (`ModalForm` já tem `max-h-[90vh] overflow-y-auto`).
- Aplicar abas em Fornecedores.
- Qualquer mudança na tabela `contratacoes`/`agendamentos` ou em suas colunas.

## 8. Teste

Sem lógica de negócio nova além das duas queries (que seguem o padrão já testado por
`lib/db/contratacoes.ts`/`lib/db/agenda.ts`, sem teste dedicado, mesmo padrão do resto
de `lib/db/*.ts`). Cobertura:
- Teste de componente (`TerceiroClient.test.tsx`): abrir modal de cliente mostra as duas
  abas; abrir modal de fornecedor não mostra abas; trocar de aba mostra o conteúdo certo
  (usando dados mockados da Server Action, sem bater no banco real).
- Manual: `npm run dev`, abre um cliente com contratações/agendamentos reais, confere
  que os dados batem com o que aparece em `/contratacoes` e `/agenda` pra esse cliente.
