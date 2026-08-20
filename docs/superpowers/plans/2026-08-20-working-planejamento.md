# Working / Planejamento — Kanban (esqueleto) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar a aba Working no sidebar e a tela Planejamento — um quadro Kanban com
seis colunas fixas, sem cards e sem persistência.

**Architecture:** Uma constante com as seis colunas (`lib/kanban.ts`), um componente de
quadro que itera essa constante (`components/KanbanBoard.tsx`), uma rota Server Component
que o renderiza (`app/(app)/working/planejamento/page.tsx`), e uma entrada nova no
sidebar (`components/Sidebar.tsx`). Nenhuma query de banco, nenhuma tabela nova.

**Tech Stack:** Next.js 15 (App Router, Server Components), TypeScript, Tailwind,
`lucide-react` (ícone `Kanban`, já disponível), Vitest + Testing Library.

## Global Constraints

- **Sem cards, sem persistência, sem tabela nova** — esta rodada é só o esqueleto visual
  das seis colunas vazias.
- Colunas são constante no código, **não** configuráveis pelo usuário.
- Cada coluna tem um `id` estável (`roadmap`, `a_fazer`, `executando`, `block`,
  `homologacao_cliente`, `concluido`) separado do rótulo exibido — quando cards
  existirem, a coluna será persistida por esse `id`, então renomear o rótulo não pode
  quebrar dado.
- Ordem fixa: RoadMap, A Fazer, Executando, Block, Homologação Cliente, Concluído.
- Visível a **todo usuário logado**, sem gate de `module_access` (mesmo padrão de
  `Painel`/`Pessoas`).
- Página é Server Component puro — sem `'use client'`, sem estado, sem handler.
- Nenhum token de cor, fonte ou classe visual nova — herda o que já existe.

---

### Task 1: Constante das colunas, componente do quadro, rota e sidebar

Tudo numa task só: são quatro arquivos pequenos e mutuamente dependentes (a rota importa
o componente, que importa a constante; o sidebar aponta pra rota). Separar em tasks
deixaria commits intermediários com import quebrado ou link 404.

**Files:**
- Create: `lib/kanban.ts`
- Create: `components/KanbanBoard.tsx`
- Create: `app/(app)/working/planejamento/page.tsx`
- Modify: `components/Sidebar.tsx`
- Create: `tests/KanbanBoard.test.tsx`

**Interfaces:**
- Consumes: `requireReadyUser` de `@/lib/auth/guards`; `Kanban` de `lucide-react`
- Produces:
  - `type ColunaKanban = { id: string; label: string }`
  - `const COLUNAS_KANBAN: readonly ColunaKanban[]`
  - `function KanbanBoard(): React.ReactNode`

- [ ] **Step 1: Escreve o teste do quadro (falha primeiro)**

Cria `tests/KanbanBoard.test.tsx`:

```tsx
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { KanbanBoard } from '@/components/KanbanBoard';
import { COLUNAS_KANBAN } from '@/lib/kanban';

afterEach(() => cleanup());

describe('KanbanBoard', () => {
  it('renderiza as seis colunas na ordem definida', () => {
    render(<KanbanBoard />);
    const titulos = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(titulos).toEqual([
      'RoadMap', 'A Fazer', 'Executando', 'Block', 'Homologação Cliente', 'Concluído',
    ]);
  });

  it('cada coluna mostra o estado vazio', () => {
    render(<KanbanBoard />);
    expect(screen.getAllByText('Nenhuma tarefa')).toHaveLength(COLUNAS_KANBAN.length);
  });
});
```

- [ ] **Step 2: Roda o teste, confirma que falha**

```bash
npx vitest run tests/KanbanBoard.test.tsx
```

Esperado: falha com "Cannot find module '@/components/KanbanBoard'" (ou
`'@/lib/kanban'`) — os arquivos ainda não existem.

- [ ] **Step 3: Cria `lib/kanban.ts`**

```typescript
/**
 * Colunas do quadro de Planejamento. Fixas no código de propósito — o cliente não
 * configura colunas (ver spec 2026-08-20-working-planejamento-design.md, §3).
 *
 * `id` é o identificador estável, separado do `label` exibido: quando cards existirem,
 * a coluna do card será persistida por `id`, então renomear um rótulo ("Block" ->
 * "Bloqueado") não pode quebrar dado já gravado.
 */
export type ColunaKanban = { id: string; label: string };

export const COLUNAS_KANBAN: readonly ColunaKanban[] = [
  { id: 'roadmap', label: 'RoadMap' },
  { id: 'a_fazer', label: 'A Fazer' },
  { id: 'executando', label: 'Executando' },
  { id: 'block', label: 'Block' },
  { id: 'homologacao_cliente', label: 'Homologação Cliente' },
  { id: 'concluido', label: 'Concluído' },
];
```

- [ ] **Step 4: Cria `components/KanbanBoard.tsx`**

Sem `'use client'` — é markup estático, sem estado nem handler.

```tsx
import { COLUNAS_KANBAN } from '@/lib/kanban';

/**
 * Quadro Kanban do Planejamento. Nesta rodada só o esqueleto: seis colunas fixas,
 * todas vazias (sem cards, sem persistência — ver spec §1).
 *
 * Rolagem lateral em vez de empilhar: seis colunas não cabem lado a lado em tela
 * estreita, e empilhar descaracterizaria o quadro.
 */
export function KanbanBoard() {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {COLUNAS_KANBAN.map((coluna) => (
        <section key={coluna.id} className="glass w-72 shrink-0 p-4 space-y-3">
          <h2 className="text-sm font-semibold">{coluna.label}</h2>
          <p className="text-sm" style={{ color: 'var(--text-dim)' }}>Nenhuma tarefa</p>
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Cria `app/(app)/working/planejamento/page.tsx`**

Segue o padrão das outras páginas do grupo `(app)`: `runtime`/`dynamic` exportados,
guard no topo, `<main>` com o mesmo espaçamento.

```tsx
import { KanbanBoard } from '@/components/KanbanBoard';
import { requireReadyUser } from '@/lib/auth/guards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function PlanejamentoPage() {
  await requireReadyUser();

  return (
    <main className="p-4 md:p-6 space-y-4">
      <h1 className="text-xl font-semibold">Planejamento</h1>
      <KanbanBoard />
    </main>
  );
}
```

- [ ] **Step 6: Adiciona o grupo Working no sidebar**

Em `components/Sidebar.tsx`:

Na linha 1 (import de `lucide-react`), adiciona `Kanban` à lista, em ordem alfabética —
entre `Home` e `LayoutDashboard`.

No array `groups`, insere o grupo Working **logo depois do grupo `Painel`** (que é o
primeiro) e **antes do comentário** `// Pessoas primeiro: ...`:

```tsx
    // Working: gestão de tarefas internas da 4Nexus. Hub interno como Painel/Pessoas —
    // sem gate de module_access, todo usuário logado vê.
    {
      label: 'Working',
      icon: <Kanban size={18} className={iconClass} />,
      items: [{ href: '/working/planejamento', label: 'Planejamento', icon: <Kanban size={18} className={iconClass} /> }],
    },
```

- [ ] **Step 7: Roda o teste do quadro, confirma que passa**

```bash
npx vitest run tests/KanbanBoard.test.tsx
```

Esperado: 2 testes passando.

- [ ] **Step 8: Roda `tsc` e a suíte inteira**

```bash
npx tsc --noEmit
npx vitest run --maxWorkers=2
```

Esperado: `tsc` limpo; suíte com 2 testes a mais que o baseline anterior (era 317, deve
ir a 319). O flag `--maxWorkers=2` evita starvation de spawn de worker nesta máquina —
sem ele a suíte às vezes falha por timeout de worker, não por teste quebrado.

- [ ] **Step 9: Verificação manual**

```bash
npm run dev
```

Logado, confere:
- Sidebar mostra o grupo **Working** logo abaixo de **Painel**, com ícone de kanban
- Expandir Working mostra o item **Planejamento**
- Clicar leva pra `/working/planejamento`, que mostra as seis colunas na ordem certa
- Estreitando a janela, as colunas rolam lateralmente (não empilham nem espremem)

- [ ] **Step 10: Commit**

```bash
git add lib/kanban.ts components/KanbanBoard.tsx \
  "app/(app)/working/planejamento/page.tsx" components/Sidebar.tsx \
  tests/KanbanBoard.test.tsx
git commit -m "Adiciona aba Working com quadro Kanban de Planejamento"
```

---

## Testing

```bash
npx tsc --noEmit
npx vitest run --maxWorkers=2
```

Manual: login → sidebar mostra Working abaixo de Painel → Planejamento abre o quadro com
as seis colunas → colunas rolam lateralmente em tela estreita.
