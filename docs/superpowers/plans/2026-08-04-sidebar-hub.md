# Sidebar Retrátil + Cara de Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o menu horizontal do Cofre de Senhas (`components/Nav.tsx`, montado à mão em 6
páginas) por um sidebar lateral retrátil, compartilhado via layout, com a marca "4NEXUS" no topo
posicionando o Cofre como um módulo do ecossistema.

**Architecture:** Route group `app/(app)/` com um `layout.tsx` compartilhado que resolve o
usuário logado uma vez e renderiza `<Sidebar>` (server component, busca dados) em volta de
`<SidebarShell>` (`'use client'`, cuida do estado de colapso/gaveta mobile). As 6 páginas
autenticadas movem pra dentro do grupo e perdem o `<Nav>` que montavam sozinhas.

**Tech Stack:** Next.js 15 (App Router, Server/Client Components), Tailwind CSS 4, `lucide-react`
(ícones, nova dependência).

## Global Constraints

- Mantém o visual dark/glassmorphism atual (`.glass`, `.surface`, tokens `var(--text)` etc de
  `app/globals.css`) — não adota a paleta slate/light do Gestor de Projetos.
- Estado de colapso do sidebar: `localStorage`, expandido por padrão na primeira visita.
- Mobile (abaixo do breakpoint `md`): sidebar vira gaveta (overlay), fecha ao clicar fora ou ao
  navegar para um item.
- Marca do topo: "4NEXUS". Duas seções fixas: "Cofre de Senhas" e "Módulos" (esta última some se
  o usuário não tiver nenhum módulo liberado).
- `/login` e `/trocar-senha` ficam fora do route group — sem sidebar.
- `revalidatePath` já usa caminhos de URL (`/admin/usuarios` etc), não caminhos de arquivo —
  mover as páginas pro route group `(app)` não muda a URL, então essas chamadas não mudam.

---

### Task 1: Dependência `lucide-react` + ícone por módulo

**Files:**
- Modify: `package.json` (via `npm install`)
- Modify: `lib/modules.ts`

**Interfaces:**
- Produces: `ModuleDef` ganha o campo `icon: LucideIcon`; `MODULES[0].icon = FolderKanban` —
  consumido pela Task 3 (`Sidebar.tsx`).

- [ ] **Step 1: Instalar a dependência**

Run: `npm install lucide-react`
Expected: `lucide-react` aparece em `dependencies` no `package.json`.

- [ ] **Step 2: Adicionar o campo `icon` ao tipo e à entrada existente**

Editar `lib/modules.ts` (arquivo inteiro):

```typescript
import type { LucideIcon } from 'lucide-react';
import { FolderKanban } from 'lucide-react';

/**
 * Módulos externos disponíveis pra conceder acesso na tela de usuário. O Cofre em
 * si não entra aqui — todo usuário ativo já o acessa por definição. Novo módulo:
 * adiciona uma entrada aqui, nada mais muda no cadastro de usuário.
 */
export type ModuleDef = { key: string; label: string; href: string; icon: LucideIcon };

export const MODULES: ModuleDef[] = [
  { key: 'gestao', label: 'Gestão de Projetos', href: '/gestao', icon: FolderKanban },
];
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erro (`SeletorModulos.tsx`/`UsuariosClient.tsx`/`actions.ts` só leem `key`/`label`
de `ModuleDef`, o campo novo não quebra nada que já usa o tipo).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json lib/modules.ts
git commit -m "feat: adiciona lucide-react e icone por modulo"
```

---

### Task 2: Estilos base + `SidebarShell` (client)

**Files:**
- Modify: `app/globals.css` (adiciona `.sidebar-link` no final do arquivo)
- Create: `components/SidebarShell.tsx`

**Interfaces:**
- Consumes: nada de tasks anteriores além do CSS global já existente (`var(--text)`,
  `var(--text-dim)`, `var(--border)`, `.glass`, `.btn`).
- Produces: `type SidebarLink = { href: string; label: string; icon: LucideIcon }`,
  `type SidebarGroup = { label: string; items: SidebarLink[] }`,
  `SidebarShell({ groups: SidebarGroup[]; actorName: string; logoutAction: (formData: FormData) => Promise<void>;
  children: React.ReactNode })` — consumido pela Task 3.

- [ ] **Step 1: Adicionar o estilo do link de navegação**

No final de `app/globals.css`:

```css

/* Item de navegação do sidebar: mesmo vocabulário visual dos outros elementos
   interativos (.btn, .input), só que sem borda — o hover é que dá o contorno. */
.sidebar-link {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  border-radius: 0.5rem;
  padding: 0.55rem 0.75rem;
  font-size: 0.875rem;
  color: var(--text-dim);
  transition: background 140ms ease, color 140ms ease;
}
.sidebar-link:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text);
}
```

- [ ] **Step 2: Criar `components/SidebarShell.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronLeft, ChevronRight, Lock, LogOut, Menu, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type SidebarLink = { href: string; label: string; icon: LucideIcon };
export type SidebarGroup = { label: string; items: SidebarLink[] };

const STORAGE_KEY = 'sidebar-colapsado';

function NavGroups({
  groups, colapsado, onNavigate,
}: {
  groups: SidebarGroup[];
  colapsado: boolean;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex-1 overflow-y-auto px-2 space-y-4">
      {groups.map((grupo) => (
        <div key={grupo.label}>
          {!colapsado && (
            <p
              className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: 'var(--text-dim)' }}
            >
              {grupo.label}
            </p>
          )}
          {grupo.items.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                onClick={onNavigate}
                className="sidebar-link"
                style={{ justifyContent: colapsado ? 'center' : 'flex-start' }}
              >
                <Icon size={18} className="shrink-0" />
                {!colapsado && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function Rodape({
  actorName, colapsado, logoutAction, onNavigate,
}: {
  actorName: string;
  colapsado: boolean;
  logoutAction: (formData: FormData) => Promise<void>;
  onNavigate?: () => void;
}) {
  return (
    <div className="p-3 space-y-2 border-t" style={{ borderColor: 'var(--border)' }}>
      {!colapsado && (
        <p className="px-1 text-sm truncate" style={{ color: 'var(--text-dim)' }}>{actorName}</p>
      )}
      <Link
        href="/trocar-senha"
        title="Trocar senha"
        onClick={onNavigate}
        className="sidebar-link"
        style={{ justifyContent: colapsado ? 'center' : 'flex-start' }}
      >
        <Lock size={18} className="shrink-0" />
        {!colapsado && <span>Trocar senha</span>}
      </Link>
      <form action={logoutAction}>
        <button className="btn w-full flex items-center justify-center gap-2" type="submit">
          <LogOut size={16} />
          {!colapsado && <span>Sair</span>}
        </button>
      </form>
    </div>
  );
}

/**
 * Duas `<aside>` separadas (desktop e mobile) em vez de uma só com classes
 * responsivas combinadas: `fixed`/`sticky`/`translate` misturados no mesmo
 * elemento é frágil. Cada uma cuida do seu breakpoint via `hidden md:flex` /
 * `md:hidden`, só uma fica visível por vez.
 */
export function SidebarShell({
  groups, actorName, logoutAction, children,
}: {
  groups: SidebarGroup[];
  actorName: string;
  logoutAction: (formData: FormData) => Promise<void>;
  children: React.ReactNode;
}) {
  const [colapsado, setColapsado] = useState(false);
  const [gavetaAberta, setGavetaAberta] = useState(false);
  const pathname = usePathname();

  // Lê a preferência salva só depois de montar: no servidor sempre renderiza
  // expandido, então ler localStorage antes disso causaria hydration mismatch.
  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) === '1') setColapsado(true);
  }, []);

  useEffect(() => {
    setGavetaAberta(false);
  }, [pathname]);

  function alternarColapso() {
    setColapsado((atual) => {
      const novo = !atual;
      localStorage.setItem(STORAGE_KEY, novo ? '1' : '0');
      return novo;
    });
  }

  return (
    <div className="flex min-h-dvh">
      {/* Sidebar desktop: fluxo normal, largura anima entre retraído/expandido. */}
      <aside
        className={`glass hidden md:flex md:flex-col m-4 mr-0 shrink-0 transition-all duration-200 ${
          colapsado ? 'md:w-16' : 'md:w-60'
        }`}
      >
        <div className="flex items-center gap-2 p-4">
          {!colapsado && <span className="font-semibold flex-1 truncate">4NEXUS</span>}
          <button
            className="btn"
            onClick={alternarColapso}
            aria-label={colapsado ? 'Expandir menu' : 'Retrair menu'}
          >
            {colapsado ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>
        <NavGroups groups={groups} colapsado={colapsado} />
        <Rodape actorName={actorName} colapsado={colapsado} logoutAction={logoutAction} />
      </aside>

      {/* Barra fina + gaveta, só em mobile. */}
      <div className="glass fixed inset-x-4 top-4 z-30 flex items-center justify-between px-4 py-3 md:hidden">
        <span className="font-semibold">4NEXUS</span>
        <button className="btn" onClick={() => setGavetaAberta(true)} aria-label="Abrir menu">
          <Menu size={18} />
        </button>
      </div>

      {gavetaAberta && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setGavetaAberta(false)}
        />
      )}

      <aside
        className={`glass fixed inset-y-4 left-4 z-50 flex w-60 flex-col transition-transform duration-200 md:hidden ${
          gavetaAberta ? 'translate-x-0' : '-translate-x-[120%]'
        }`}
      >
        <div className="flex items-center gap-2 p-4">
          <span className="font-semibold flex-1 truncate">4NEXUS</span>
          <button className="btn" onClick={() => setGavetaAberta(false)} aria-label="Fechar menu">
            <X size={16} />
          </button>
        </div>
        <NavGroups groups={groups} colapsado={false} onNavigate={() => setGavetaAberta(false)} />
        <Rodape
          actorName={actorName} colapsado={false} logoutAction={logoutAction}
          onNavigate={() => setGavetaAberta(false)}
        />
      </aside>

      <div className="flex-1 min-w-0 pt-20 md:pt-0">
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erro.

- [ ] **Step 4: Commit**

```bash
git add app/globals.css components/SidebarShell.tsx
git commit -m "feat: componente SidebarShell (sidebar retratil + gaveta mobile)"
```

---

### Task 3: `Sidebar.tsx` (server)

**Files:**
- Create: `components/Sidebar.tsx`

**Interfaces:**
- Consumes: `SidebarShell`, `SidebarGroup`, `SidebarLink` de `@/components/SidebarShell` (Task
  2); `listModulesOfUser` de `@/lib/db/queries`; `MODULES` de `@/lib/modules` (Task 1); `logout`
  de `@/app/login/actions`; `Actor` de `@/lib/types`.
- Produces: `Sidebar({ actor: Actor; children: React.ReactNode })` — consumido pela Task 4
  (`app/(app)/layout.tsx`).

- [ ] **Step 1: Criar `components/Sidebar.tsx`**

```tsx
import { FolderKanban, Home, ScrollText, Trash2, Users } from 'lucide-react';
import { logout } from '@/app/login/actions';
import { listModulesOfUser } from '@/lib/db/queries';
import { MODULES } from '@/lib/modules';
import type { Actor } from '@/lib/types';
import { SidebarShell, type SidebarGroup } from './SidebarShell';

export async function Sidebar({ actor, children }: { actor: Actor; children: React.ReactNode }) {
  const modulosLiberados =
    actor.role === 'master' ? MODULES.map((m) => m.key) : await listModulesOfUser(actor.id);
  const modulosVisiveis = MODULES.filter((m) => modulosLiberados.includes(m.key));

  const groups: SidebarGroup[] = [
    {
      label: 'Cofre de Senhas',
      items: [
        { href: '/', label: 'Salas', icon: Home },
        ...(actor.role === 'master'
          ? [
              { href: '/admin/usuarios', label: 'Usuários', icon: Users },
              { href: '/admin/salas', label: 'Salas (admin)', icon: FolderKanban },
              { href: '/admin/auditoria', label: 'Auditoria', icon: ScrollText },
              { href: '/admin/lixeira', label: 'Lixeira', icon: Trash2 },
            ]
          : []),
      ],
    },
    ...(modulosVisiveis.length > 0
      ? [{
          label: 'Módulos',
          items: modulosVisiveis.map((m) => ({ href: m.href, label: m.label, icon: m.icon })),
        }]
      : []),
  ];

  return (
    <SidebarShell groups={groups} actorName={actor.name} logoutAction={logout}>
      {children}
    </SidebarShell>
  );
}
```

Nota: "Salas (admin)" reusa o ícone `FolderKanban` — mesmo ícone do módulo "Gestão de Projetos",
mas em seções diferentes (uma é "Cofre de Senhas", outra "Módulos"), não há ambiguidade visual
na prática. Se quiser um ícone distinto aqui depois, troque só essa linha.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erro.

- [ ] **Step 3: Commit**

```bash
git add components/Sidebar.tsx
git commit -m "feat: componente Sidebar resolve modulos liberados e monta os grupos"
```

---

### Task 4: Route group `app/(app)/` — corta o `Nav` das 6 páginas

**Files:**
- Create: `app/(app)/layout.tsx`
- Move: `app/page.tsx` → `app/(app)/page.tsx`
- Move: `app/sala/[id]/page.tsx` → `app/(app)/sala/[id]/page.tsx`
- Move: `app/admin/usuarios/{actions.ts,page.tsx,UsuariosClient.tsx}` → `app/(app)/admin/usuarios/`
- Move: `app/admin/salas/{actions.ts,page.tsx,SalasClient.tsx}` → `app/(app)/admin/salas/`
- Move: `app/admin/auditoria/page.tsx` → `app/(app)/admin/auditoria/page.tsx`
- Move: `app/admin/lixeira/{actions.ts,page.tsx}` → `app/(app)/admin/lixeira/`
- Delete: `components/Nav.tsx`

**Interfaces:**
- Consumes: `Sidebar` de `@/components/Sidebar` (Task 3); `requireReadyUser` de
  `@/lib/auth/guards` (já existe).

- [ ] **Step 1: Mover os arquivos preservando histórico do git**

```bash
mkdir -p "app/(app)/sala/[id]" "app/(app)/admin/usuarios" "app/(app)/admin/salas" "app/(app)/admin/auditoria" "app/(app)/admin/lixeira"

git mv app/page.tsx "app/(app)/page.tsx"
git mv "app/sala/[id]/page.tsx" "app/(app)/sala/[id]/page.tsx"
git mv app/admin/usuarios/actions.ts "app/(app)/admin/usuarios/actions.ts"
git mv app/admin/usuarios/page.tsx "app/(app)/admin/usuarios/page.tsx"
git mv app/admin/usuarios/UsuariosClient.tsx "app/(app)/admin/usuarios/UsuariosClient.tsx"
git mv app/admin/salas/actions.ts "app/(app)/admin/salas/actions.ts"
git mv app/admin/salas/page.tsx "app/(app)/admin/salas/page.tsx"
git mv app/admin/salas/SalasClient.tsx "app/(app)/admin/salas/SalasClient.tsx"
git mv app/admin/auditoria/page.tsx "app/(app)/admin/auditoria/page.tsx"
git mv app/admin/lixeira/actions.ts "app/(app)/admin/lixeira/actions.ts"
git mv app/admin/lixeira/page.tsx "app/(app)/admin/lixeira/page.tsx"

rmdir app/sala/[id] app/sala app/admin/usuarios app/admin/salas app/admin/auditoria app/admin/lixeira app/admin 2>/dev/null || true
```

Expected: `app/sala`, `app/admin` não existem mais; tudo vive sob `app/(app)/`. `app/login` e
`app/trocar-senha` continuam onde estavam (fora do grupo).

- [ ] **Step 2: Criar `app/(app)/layout.tsx`**

```tsx
import { Sidebar } from '@/components/Sidebar';
import { requireReadyUser } from '@/lib/auth/guards';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireReadyUser();
  return <Sidebar actor={actor}>{children}</Sidebar>;
}
```

- [ ] **Step 3: Tirar o `<Nav>` de `app/(app)/page.tsx`**

Trocar:
```tsx
  return (
    <>
      <Nav actor={actor} />
      <main className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
```
por:
```tsx
  return (
      <main className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
```
E no fechamento, trocar:
```tsx
      </main>
    </>
  );
```
por:
```tsx
      </main>
  );
```
Remover também a linha `import { Nav } from '@/components/Nav';` do topo do arquivo.

- [ ] **Step 4: Tirar o `<Nav>` de `app/(app)/sala/[id]/page.tsx`**

Mesma operação do Step 3: remover o import de `Nav`, remover `<Nav actor={actor} />` e a
fragment (`<>`/`</>`) que sobrava só por causa dele — o retorno passa a ser só o `<main>...</main>`.

- [ ] **Step 5: Tirar o `<Nav>` de `app/(app)/admin/usuarios/page.tsx`**

Mesma operação.

- [ ] **Step 6: Tirar o `<Nav>` de `app/(app)/admin/salas/page.tsx`**

Mesma operação.

- [ ] **Step 7: Tirar o `<Nav>` de `app/(app)/admin/auditoria/page.tsx`**

Mesma operação.

- [ ] **Step 8: Tirar o `<Nav>` de `app/(app)/admin/lixeira/page.tsx`**

Mesma operação.

- [ ] **Step 9: Apagar `components/Nav.tsx`**

Run: `rm components/Nav.tsx`
Expected: nenhum arquivo mais importa `@/components/Nav` (`grep -r "components/Nav" app
components` não deve retornar nada).

- [ ] **Step 10: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erro.

- [ ] **Step 11: Rodar a suíte de testes**

Run: `npx vitest run`
Expected: todos os testes passam (nenhum teste existente cobre páginas/layout diretamente —
verificação real é manual, no próximo passo).

- [ ] **Step 12: Testar manualmente**

Run: `npm run dev`, logar em `http://localhost:3000/login`.

Expected, no desktop (janela larga):
- Sidebar aparece à esquerda com "4NEXUS" no topo, grupo "Cofre de Senhas" com "Salas" (e, se
  master, também Usuários/Salas (admin)/Auditoria/Lixeira).
- Se o usuário tiver módulo liberado, aparece o grupo "Módulos" com "Gestão de Projetos".
- Clicar no botão de retrair encolhe o sidebar pra só ícones; recarregar a página mantém retraído.
- Clicar de novo expande e recarregar mantém expandido.
- Navegar entre páginas (Salas → uma sala → Admin) não faz o sidebar piscar/recarregar.

Expected, com a janela estreita (ou DevTools em modo mobile):
- Sidebar de desktop some, aparece uma barra fina no topo com "4NEXUS" e um botão de menu.
- Clicar no botão abre a gaveta por cima do conteúdo, com fundo escurecido atrás.
- Clicar fora da gaveta (no fundo escurecido) fecha.
- Clicar num item de menu navega e fecha a gaveta sozinha.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "feat: substitui Nav horizontal por sidebar retratil via layout compartilhado"
```

---

## Ordem de execução

Sequencial: Task 1 → 2 → 3 → 4. Cada uma depende da anterior (ícone → componente client →
componente server que o usa → integração final que corta o `Nav` antigo). Não paralelizável.
