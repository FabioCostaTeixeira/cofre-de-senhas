# Dashboard (nova home) — Design

**Data:** 2026-08-19
**Status:** aprovado (brainstorming)
**Branch:** `dev`

## 1. Objetivo

Criar um painel de indicadores gerenciais que passa a ser a página inicial da aplicação
(`/`), substituindo a home atual (Cofre de Senhas — lista de salas + busca de credenciais),
que se move para `/senhas`. O dashboard mostra uma visão consolidada do negócio: clientes,
agendamentos por status, vendas por tipo, e ocupação de tempo por studio.

## 2. Mudança de rotas

| Rota | Antes | Depois |
|---|---|---|
| `/` | Cofre de Senhas (salas + busca) | **Dashboard (novo)** |
| `/senhas` | não existe | Cofre de Senhas (conteúdo movido de `/`, sem mudança de comportamento) |

`app/(app)/page.tsx` (conteúdo atual, inalterado) move para `app/(app)/senhas/page.tsx`.
`app/(app)/page.tsx` passa a ser o novo dashboard.

**Sidebar** (`components/Sidebar.tsx`): novo grupo `Painel` inserido como **primeiro** item
do array `groups`, antes de `Cadastros` (que hoje é o primeiro). `Cofre de Senhas` (grupo já
existente, hoje aponta pra `/`) passa a apontar pra `/senhas`, mantendo label e ícone
(`Vault`) — só o `href` muda.

Nenhum module_access novo: dashboard e Cofre de Senhas continuam visíveis pra todo usuário
logado, mesmo padrão de hoje.

## 3. Fonte de dados

| Indicador | Tabela/campo | Observação |
|---|---|---|
| Total de clientes | `terceiros` (tipo `'clientes'`) | Contagem simples, **sem filtro de período** — é o total cadastrado hoje, não uma métrica histórica por data. |
| Agendamentos por status | `agenda.status` (`StatusAgendamento`: `agendado`, `pre_agendado`, `gravando`, `concluido`, `cancelado`) | Contagem por status, filtrado por período (campo `data` do agendamento). |
| Vendas por tipo | `contratacoes.tipo` (`avulso`, `combo`, `plano`) × `contratacoes.quantidade` | Soma de `quantidade` agrupada por `tipo`, filtrado por período (`created_at`), **excluindo `deleted_at is not null`** (cancelamentos já saem da lista, mesmo padrão do resto do sistema). |
| Tempo livre / agendado por studio | `estudios` (nome, `local_id`) × `agenda` (`estudio_id`, `hora_inicio`, `hora_fim`, `status <> 'cancelado'`) | Ver §5. |

## 4. Seletor de período

Três opções: **Hoje** (padrão), **Semana** (semana corrente, segunda a domingo), **Mês** (mês
corrente). Implementado como querystring (`?periodo=hoje\|semana\|mes`) em vez de estado
client-side — permite refresh/compartilhar link com o período certo, e mantém o dashboard como
Server Component (sem client JS extra pra isso). O total de clientes (§3) não é afetado pelo
seletor.

## 5. Cálculo de tempo livre/agendado por studio

Janela de disponibilidade fixa: **08:00–20:00** (12h/dia), igual para todos os studios — não
existe hoje campo de horário de funcionamento no cadastro de `estudios`/`locais_gravacao`, e
criar esse campo fica fora de escopo deste dashboard (consideração futura, se algum studio
precisar de janela diferente).

Por studio, no período selecionado:
- **Capacidade total** = 12h × número de dias do período (1 pra "hoje", 7 pra "semana", dias
  do mês corrente pra "mês")
- **Tempo agendado** = soma de `hora_fim - hora_inicio` de todos os agendamentos daquele
  `estudio_id` no período com `status <> 'cancelado'`, **truncado à janela 08:00–20:00**
  (um agendamento que começa às 07:00 ou termina às 21:00 só conta a parte dentro da janela —
  evita que um agendamento fora do horário comercial gere tempo agendado negativo em relação
  à capacidade)
- **Tempo livre** = capacidade total − tempo agendado (nunca negativo; se der negativo por
  algum caso de sobreposição não coberto pela truncagem acima, mostra 0)

Exibido como par de números (ex: "18h livres / 6h agendadas" por studio) mais uma barra de
progresso simples (`.glass`, preenchimento laranja proporcional ao % agendado) — sem gráfico
de terceiros, CSS puro.

## 6. Layout e visual

Duas seções na página, mesma grade responsiva já usada na home atual
(`grid gap-4 sm:grid-cols-2 lg:grid-cols-3`), cards `.glass`:

1. **Topo, sem seletor:** um card único "Total de Clientes" com o número em destaque
   (cor `--accent`, fonte `--font-heading`).
2. **Abaixo, com seletor de período** (`Hoje | Semana | Mês` como pills/tabs, mesmo padrão
   visual de botões secundários já usado no app):
   - 5 cards pequenos, um por status de agendamento (label + contagem)
   - 3 cards pequenos, um por tipo de venda (avulso/combo/plano + quantidade)
   - N cards (um por studio ativo) com o par tempo livre/agendado + barra

Sem gráficos de biblioteca externa (recharts, chart.js, etc.) — não há dependência de chart
no projeto hoje, e os indicadores pedidos são todos números/barras simples, não séries
temporais que justifiquem essa dependência nova.

## 7. Server Component, sem novo client JS

O dashboard inteiro é Server Component (`app/(app)/page.tsx`), buscando os dados direto via
`lib/db/*` (mesmo padrão da home atual e das outras páginas do app). O seletor de período é
um conjunto de `<Link>` que muda a querystring — sem `useState`/`'use client'` na página.
Uma função nova em `lib/db/dashboard.ts` centraliza as queries agregadas (uma função por
indicador, ou uma função só que retorna tudo — decisão de implementação, não de design).

## 8. Fora de escopo

- Horário de funcionamento configurável por studio (janela fixa 08:00–20:00 por ora).
- Gráficos/séries temporais, exportação, ou qualquer analytics além dos indicadores pedidos.
- Filtro de período customizado (intervalo de datas livre) — só as 3 opções fixas.
- Qualquer mudança de permissão/`module_access` — dashboard e Cofre de Senhas continuam
  abertos pra todo usuário logado.

## 9. Teste

Sem UI interativa complexa (é leitura + agregação). Cobertura:
- Testes de unidade pras funções de `lib/db/dashboard.ts` que fazem o cálculo de tempo
  livre/agendado (a lógica de truncagem à janela 08:00–20:00 é a parte com mais chance de
  bug de borda — merece casos de teste dedicados: agendamento totalmente dentro da janela,
  parcialmente fora dos dois lados, totalmente fora).
- Teste de que `/senhas` renderiza o que `/` renderizava antes (smoke test de que a mudança
  de rota não quebrou nada).
- Manual: `npm run dev`, visita `/`, alterna os 3 períodos, confere números batem com o que
  existe em `/agenda` e `/contratacoes` pro mesmo intervalo.
