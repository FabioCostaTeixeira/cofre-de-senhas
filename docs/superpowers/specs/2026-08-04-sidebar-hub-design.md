# Sidebar Retrátil + Cara de Hub — Design

**Data:** 2026-08-04
**Status:** aprovado (brainstorming)

## 1. Objetivo

O Cofre de Senhas hoje se comporta visualmente como uma ferramenta isolada — menu horizontal,
sem nenhum sinal de que ele é o hub de um ecossistema maior (Cofre + Gestão de Projetos +
módulos futuros). Este design troca o menu horizontal atual (`components/Nav.tsx`, montado à mão
em 6 páginas) por um **sidebar lateral retrátil**, compartilhado via layout, que já deixa
explícito que o Cofre é um módulo entre outros dentro da marca do ecossistema.

Escopo desta rodada: só o sidebar do Cofre de Senhas. Unificar a linguagem visual com o Gestor de
Projetos fica para um projeto futuro, à parte.

## 2. Decisões de arquitetura

| Decisão | Escolha | Motivo |
|---|---|---|
| Layout | Route group `app/(app)/` com `layout.tsx` compartilhado | Hoje cada página monta `<Nav>` sozinha; um layout comum evita repetição e permite o sidebar persistir sem piscar ao trocar de página. `/login` e `/trocar-senha` ficam fora do grupo, sem sidebar. |
| Componentes | `Sidebar.tsx` (server, busca dados) + `SidebarShell.tsx` (`'use client'`, estado interativo) | Mesma separação já usada no projeto (server busca dado, client cuida de interação) — igual ao padrão `UsuariosClient`/`page.tsx`. |
| Estado retrátil | `localStorage`, aberto por padrão | Decisão do usuário: lembrar a escolha entre sessões, mas começar expandido na primeira visita. |
| Mobile | Gaveta (overlay) abaixo do breakpoint `md` | Mesmo padrão já usado no Gestor de Projetos; fecha ao clicar fora ou escolher item. |
| Identidade do hub | Nome "4NEXUS" no topo do sidebar, com seções "Cofre de Senhas" e "Módulos" abaixo | Deixa explícito que o Cofre é um módulo, sem precisar de troca de app — só reorganiza a marca. |
| Visual | Mantém dark/glassmorphism atual (`globals.css`) | Unificar com o Gestor de Projetos (slate/light) é escopo maior, fica para depois. |
| Ícones | `lucide-react` (nova dependência) | Mesma lib já usada no Gestor de Projetos; Cofre não tinha ícones antes. |

## 3. Estrutura de páginas (route group)

Movem para dentro de `app/(app)/`, sem mudar de URL (route groups não aparecem na URL):

```
app/(app)/layout.tsx        -- novo: requireReadyUser() + <Sidebar> + children
app/(app)/page.tsx           -- era app/page.tsx
app/(app)/sala/[id]/page.tsx -- era app/sala/[id]/page.tsx
app/(app)/admin/usuarios/    -- era app/admin/usuarios/
app/(app)/admin/salas/       -- era app/admin/salas/
app/(app)/admin/auditoria/   -- era app/admin/auditoria/
app/(app)/admin/lixeira/     -- era app/admin/lixeira/
```

Ficam fora do grupo (sem sidebar): `app/login/`, `app/trocar-senha/`.

Cada página perde a linha `<Nav actor={actor}/>` e o `requireUser()`/`requireMaster()` que só
existia para pegar o `actor` de exibição — mas continua chamando o guard que já usava
(`requireMaster()` nas páginas `/admin/*`, por exemplo), porque a checagem de autorização
continua sendo responsabilidade de cada página, não do layout. O layout faz só a checagem
genérica (`requireReadyUser()`) para poder desenhar o sidebar; isso significa duas consultas ao
banco por request (uma no layout, uma na página) — aceitável, mesmo padrão de custo que
`requireMaster()` já tem hoje internamente (ele chama `requireReadyUser()` por baixo).

## 4. Componentes

**`components/Sidebar.tsx`** (server, async):
- Recebe `actor: Actor`.
- Resolve `modulosVisiveis` com a mesma lógica que hoje está em `Nav.tsx` (master vê tudo,
  usuário comum só o que tem em `module_access`).
- Monta a lista de itens (ícone + label + href + grupo), incluindo os itens condicionais de
  master (Usuários, Salas admin, Auditoria, Lixeira).
- Renderiza `<SidebarShell items={...} actor={actor} />`.

**`components/SidebarShell.tsx`** (`'use client'`):
- Estado `colapsado: boolean`, inicial `false` (expandido), sincronizado com
  `localStorage.getItem('sidebar-colapsado')` num `useEffect` pós-montagem (pequeno flash
  aceitável na primeira pintura se o usuário tinha escolhido retraído antes — mesmo trade-off já
  aceito em outros lugares do projeto que usam client state).
- Estado `gavetaAberta: boolean` (mobile), fecha ao clicar fora ou navegar.
- Renderiza a estrutura visual: topo (`4NEXUS` + botão retrair), grupo "Cofre de Senhas", grupo
  "Módulos" (só aparece se `modulosVisiveis` não estiver vazio), rodapé (nome do usuário, link
  trocar senha, form de logout — reaproveita `logout` de `app/login/actions.ts`, igual ao
  `Nav.tsx` atual).

## 5. Responsividade

- Desktop (`md` e acima): sidebar fixo à esquerda, `w-60` expandido / `w-16` retraído, transição
  suave. Botão de retrair sempre visível no topo do sidebar.
- Mobile (abaixo de `md`): sidebar escondido por padrão (`translate-x-full` ou equivalente);
  barra superior fina com botão de menu (ícone hambúrguer) abre o sidebar como overlay
  (`position: fixed`, `z-index` acima do conteúdo, com backdrop semi-transparente). Fecha ao
  clicar no backdrop ou ao navegar para um item.

## 6. Testes

- `SeletorModulos`/`SeletorSalas` (não afetados) continuam com seus testes existentes.
- Sem teste de integração novo necessário — a lógica de `modulosVisiveis` já é coberta
  indiretamente pelos testes de `listModulesOfUser` existentes; o que muda aqui é só
  apresentação. Verificação principal é manual: master vê todos os grupos, usuário comum só vê
  módulo liberado, colapsar/expandir persiste após reload, gaveta mobile abre/fecha.

## 7. Fora de escopo (v1)

- Unificar visual com o Gestor de Projetos.
- Seletor de app estilo "trocar de aplicativo" (fica só a divisão em seções por enquanto).
- Novo módulo além de Gestão de Projetos (o layout já suporta, mas nenhum outro existe ainda).
