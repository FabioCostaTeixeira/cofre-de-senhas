# Working / Planejamento — Kanban (esqueleto) — Design

**Data:** 2026-08-20
**Status:** aprovado (brainstorming)
**Branch:** `dev`

## 1. Objetivo

Criar a aba **Working** — área de gestão de tarefas internas da 4Nexus — e sua primeira
tela, **Planejamento**: um quadro Kanban com seis colunas fixas.

Esta rodada entrega **só o esqueleto visual do quadro**: as seis colunas lado a lado,
com cabeçalho e estado vazio. Sem cards, sem persistência, sem tabela nova no banco.

## 2. Navegação

- Novo grupo no sidebar: **Working** (ícone `Kanban` do `lucide-react`), posicionado logo
  abaixo do grupo `Painel` e acima de `Pessoas`.
- Item dentro do grupo: **Planejamento** → `/working/planejamento`.
- Visível para **todo usuário logado**, sem gate de `module_access` — mesmo padrão do
  `Painel` e do `Pessoas` (hub interno, não é módulo externo).

## 3. As seis colunas

Ordem fixa, da esquerda pra direita:

1. RoadMap
2. A Fazer
3. Executando
4. Block
5. Homologação Cliente
6. Concluído

As colunas **não são configuráveis pelo usuário** — são uma constante no código
(`COLUNAS_KANBAN`), não uma tabela de banco. Mesmo padrão de outras listas fixas do
projeto (`ROTULOS_TIPO`, `ROTULOS_STATUS_AGENDAMENTO`, `PERIODOS` no dashboard).

Cada coluna precisa de um identificador estável além do rótulo exibido — quando cards
existirem (rodada futura), a coluna do card será persistida por esse identificador, não
pelo texto visível. Isso evita que renomear "Block" para "Bloqueado" quebre dados
existentes. Identificadores: `roadmap`, `a_fazer`, `executando`, `block`,
`homologacao_cliente`, `concluido`.

## 4. Layout

Grid horizontal com scroll lateral (`overflow-x-auto`) — seis colunas não cabem lado a
lado em tela estreita, e empilhar verticalmente descaracterizaria o quadro. Cada coluna:

- Largura fixa (não encolhe): `w-72 shrink-0`
- Painel `.glass`, mesmo tratamento visual do resto do app
- Cabeçalho com o rótulo da coluna
- Corpo com a mensagem de estado vazio: "Nenhuma tarefa"

Herda automaticamente a identidade visual já aplicada no app (índigo `#0f0a1f` / laranja
`#ff9400`, Montserrat/Poppins, glassmorphism) — nenhum token ou classe nova.

## 5. Implementação

Server Component puro (`app/(app)/working/planejamento/page.tsx`), guard
`requireReadyUser()` como as demais telas do grupo `(app)`. Nenhuma query de banco nesta
rodada — não há o que buscar.

O quadro em si é markup estático iterando `COLUNAS_KANBAN`. Não precisa de
`'use client'`: sem estado, sem interação, sem handler.

## 6. Decisões registradas para a próxima rodada (fora deste escopo)

- **Cards (tarefas)**: criação, edição e persistência ficam para a rodada seguinte. Vão
  precisar de tabela nova (`tarefas` ou similar), com a coluna do card guardada pelo
  identificador estável de §3.
- **Movimentação por drag-and-drop**: decisão já tomada pelo cliente — quando cards
  existirem, mover entre colunas será por arrastar e soltar, não por botão/select. Isso
  exigirá uma biblioteca de DnD (o projeto não tem nenhuma hoje) e é parte do custo
  daquela rodada, não desta.

## 7. Fora de escopo

- Qualquer card, tarefa, ou persistência.
- Colunas configuráveis, renomeáveis ou reordenáveis pelo usuário.
- Permissão por usuário para a aba Working (todo mundo logado vê).
- Filtros, busca, responsável, prazo, prioridade, ou qualquer atributo de tarefa.

## 8. Teste

Sem lógica de negócio (é markup estático + uma constante). Cobertura:

- Teste de componente: o quadro renderiza exatamente os seis rótulos, na ordem definida.
- Manual: `npm run dev`, login, confere que o grupo Working aparece no sidebar abaixo de
  Painel, que Planejamento abre o quadro, e que as seis colunas rolam lateralmente em
  tela estreita.
