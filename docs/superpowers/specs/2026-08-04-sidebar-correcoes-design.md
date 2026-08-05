# Correções do Sidebar Retrátil — Design

**Data:** 2026-08-04
**Status:** aprovado
**Branch:** `dev`
**Origem:** revisão crítica dos commits `75d4fca..cd86bbe` (implementação de
[2026-08-04-sidebar-hub-design.md](2026-08-04-sidebar-hub-design.md))

## 1. Objetivo

A implementação do sidebar atende 100% do spec original, mas a revisão encontrou cinco defeitos
de implementação que o spec não previa — três Importantes (layout quebrado em página longa,
gaveta mobile focável quando fechada, botão de logout sem nome acessível) e dois de qualidade
(estado ativo ausente, efeito colateral dentro de updater do React).

Este documento corrige esses defeitos. **Não altera o desenho aprovado**: mesma estrutura de
route group, mesmos componentes, mesmo visual dark/glassmorphism, mesmas rotas.

Escopo fechado: só `components/SidebarShell.tsx` e `app/globals.css`, mais (se aprovada a Task 3)
a infraestrutura de teste de componente.

## 2. Contexto necessário

Arquivos envolvidos:

- `components/SidebarShell.tsx` (174 linhas, `'use client'`) — único arquivo de comportamento.
  Contém três componentes no mesmo módulo: `NavGroups`, `Rodape`, `SidebarShell`.
- `app/globals.css` — vocabulário de classes do projeto (`.glass`, `.btn`, `.sidebar-link`).
  Segue o padrão de classe semântica em CSS puro, não utilitários Tailwind soltos.
- `components/Sidebar.tsx` (server) monta os grupos e passa por prop. **Não muda.**
- `app/(app)/layout.tsx` — **não muda.**

Estado atual verificado: `tsc --noEmit` limpo, `npm test` 73/73, `next build` de produção OK com
as 7 rotas corretas. Qualquer regressão nesses três é falha da correção.

## 3. Global Constraints

- React 19.2.8, Next.js 15.5.22, TypeScript strict. `tsc --noEmit` precisa continuar limpo.
- Nenhuma dependência de runtime nova. (A Task 3, se aprovada, adiciona apenas `devDependencies`.)
- Nenhuma mudança de URL, de rota, de guard de autorização ou de server action. As barreiras
  reais de acesso vivem nas páginas e nas actions — o sidebar é cosmético e continua sendo.
- Manter o vocabulário de CSS do projeto: estilo novo entra como classe semântica em
  `app/globals.css`, no mesmo padrão de `.sidebar-link`, não como string de utilitários inline.
- Manter os nomes de identificador em português usados no arquivo (`colapsado`, `gavetaAberta`,
  `alternarColapso`, `Rodape`, `NavGroups`).
- Chave de `localStorage` continua `'sidebar-colapsado'`, valores `'0'`/`'1'`. Não renomear:
  usuários já têm a chave gravada.
- Não introduzir biblioteca de UI, headless ou de animação. As correções são CSS + atributo HTML.

---

## 4. Correções

### C1 — Sidebar desktop estica com o conteúdo (Importante)

**Sintoma.** Em página longa (muitas salas, auditoria paginada), o rodapé do sidebar — nome do
usuário, "Trocar senha" e o botão **Sair** — vai parar no fim do documento. O usuário precisa
rolar a página inteira para deslogar. É uma regressão: o `Nav.tsx` antigo era barra de topo,
visível no carregamento.

**Mecanismo.** Em `SidebarShell.tsx:117-121`:

```jsx
<div className="flex min-h-dvh">
  <aside className="glass hidden md:flex md:flex-col m-4 mr-0 shrink-0 transition-all duration-200 ...">
```

O wrapper tem `min-height` apenas — cresce com o conteúdo. O `<aside>` não declara altura,
`sticky` nem `align-self`, então herda o `align-items: stretch` padrão do flex e sua altura passa
a ser a altura da linha, isto é, a altura do conteúdo da página. Consequência secundária:
`NavGroups` tem `flex-1 overflow-y-auto` (`SidebarShell.tsx:22`) que **nunca dispara**, porque
altura ilimitada nunca produz overflow.

Confirmado que nada limita a altura acima: `app/globals.css` define só `body { min-height: 100dvh }`,
sem `height` nem `overflow` em `html`/`body`.

**Correção.** Fixar o aside na viewport no breakpoint desktop:

```diff
       <aside
-        className={`glass hidden md:flex md:flex-col m-4 mr-0 shrink-0 transition-all duration-200 ${
+        className={`glass hidden md:flex md:flex-col m-4 mr-0 shrink-0 md:sticky md:top-4 md:self-start md:h-[calc(100dvh-2rem)] transition-all duration-200 ${
           colapsado ? 'md:w-16' : 'md:w-60'
         }`}
       >
```

Racional de cada peça:

- `md:self-start` — desliga o `stretch`. Sem isso um item esticado não rola como `sticky`.
- `md:h-[calc(100dvh-2rem)]` — altura exata da viewport menos as margens `m-4` de topo e base
  (`1rem + 1rem = 2rem`). Dá ao `flex-1 overflow-y-auto` do `NavGroups` um contêiner limitado,
  ativando a rolagem interna que já estava escrita.
- `md:sticky md:top-4` — gruda a 16px do topo, casando com `m-4`.

`position: sticky` funciona aqui porque nenhum ancestral tem `overflow` diferente de `visible`.
Ao mexer no wrapper, não introduzir `overflow-hidden` — quebraria o sticky silenciosamente.

**Verificação.** Com o sidebar expandido e uma página que ultrapasse a altura da tela: rolar até
o fim e confirmar que o botão **Sair** continua visível na tela. Com master logado e mais itens de
menu do que cabem na altura da viewport, confirmar que a lista de links rola dentro do sidebar
sem levar o rodapé junto.

---

### C2 — Gaveta mobile fechada continua focável e no a11y tree (Importante)

**Sintoma.** No mobile, com a gaveta fechada, a navegação por teclado tabula para dentro de links
que estão fora da tela, e o leitor de tela anuncia o menu inteiro como se estivesse aberto.

**Mecanismo.** `SidebarShell.tsx:151-154` fecha a gaveta só com transform:

```jsx
<aside className={`glass fixed inset-y-4 left-4 z-50 flex w-60 flex-col ... md:hidden ${
  gavetaAberta ? 'translate-x-0' : '-translate-x-[120%]'
}`}>
```

`transform` apenas desloca o pixel: o elemento continua renderizado, focável e exposto à árvore de
acessibilidade. O `<aside>` do desktop escapa disso por acaso, porque usa `hidden md:flex`
(`display: none` no mobile). A gaveta não tem equivalente.

Efeito colateral: o mesmo conteúdo de navegação existe duas vezes no DOM e, no mobile, ambas as
cópias estão no a11y tree.

**Correção.** Marcar a gaveta como inerte quando fechada:

```diff
       <aside
+        inert={!gavetaAberta}
         className={`glass fixed inset-y-4 left-4 z-50 flex w-60 flex-col transition-transform duration-200 md:hidden ${
           gavetaAberta ? 'translate-x-0' : '-translate-x-[120%]'
         }`}
       >
```

`inert` remove a subárvore inteira do foco, do a11y tree e de eventos de ponteiro — exatamente o
comportamento desejado. React 19 trata `inert` como booleano: renderiza o atributo quando `true`,
omite quando `false`.

**Se `tsc --noEmit` reclamar** de `inert` não existir em `HTMLAttributes` (versão de
`@types/react` sem o suporte), **não** silenciar com `as any` nem com `@ts-expect-error`.
Usar o fallback CSS, que produz o mesmo resultado de a11y:

```diff
-        inert={!gavetaAberta}
+        aria-hidden={!gavetaAberta}
         className={`glass fixed inset-y-4 left-4 z-50 flex w-60 flex-col transition-transform duration-200 md:hidden ${
-          gavetaAberta ? 'translate-x-0' : '-translate-x-[120%]'
+          gavetaAberta ? 'visible translate-x-0' : 'invisible -translate-x-[120%]'
         }`}
```

`visibility: hidden` (o `invisible` do Tailwind) remove do foco e do a11y tree, e é herdado pelos
filhos. Relatar no report qual das duas variantes ficou.

**Verificação.** No viewport mobile com a gaveta fechada: `Tab` repetidamente a partir do topo da
página e confirmar que o foco nunca entra em item do menu — só o botão "Abrir menu" e depois o
conteúdo da página. Abrir a gaveta e confirmar que os links voltam a ser alcançáveis por `Tab`.

---

### C3 — Botão "Sair" colapsado sem nome acessível (Importante)

**Sintoma.** Com o sidebar retraído, o botão de logout não tem nome acessível. Leitor de tela
anuncia "botão" e mais nada. É o controle mais destrutivo do sidebar.

**Mecanismo.** `SidebarShell.tsx:78-83`:

```jsx
<button className="btn w-full flex items-center justify-center gap-2" type="submit">
  <LogOut size={16} />
  {!colapsado && <span>Sair</span>}
</button>
```

Colapsado, o `<span>` some e resta só o SVG do lucide, que vem com `aria-hidden` por padrão. Os
links de navegação escapam do mesmo problema por acidente — carregam `title={item.label}`
(`SidebarShell.tsx:39`), que serve de nome acessível. O botão não tem `title` nem `aria-label`.

**Correção.**

```diff
-      <form action={logoutAction}>
-        <button className="btn w-full flex items-center justify-center gap-2" type="submit">
+      <form action={logoutAction}>
+        <button
+          className="btn w-full flex items-center justify-center gap-2"
+          type="submit"
+          aria-label="Sair"
+        >
```

`aria-label` fixo, não condicional a `colapsado`: quando expandido ele apenas repete o texto
visível, o que é correto e evita ramificação.

**Verificação.** Retrair o sidebar e inspecionar o botão no accessibility inspector do navegador
(ou rodar `getByRole('button', { name: 'Sair' })` se a Task 3 for feita) — precisa ter nome
"Sair" nos dois estados.

---

### C4 — Sem indicação de página atual (Importante)

**Sintoma.** Nenhum item do sidebar mostra qual página está aberta. Não há destaque visual nem
`aria-current`. Em menu horizontal de 5 itens numa linha isso passava; em sidebar de dois grupos
com até seis itens empilhados, é defeito de navegação.

**Mecanismo.** `usePathname()` já é chamado em `SidebarShell.tsx:98`, mas usado só para fechar a
gaveta ao navegar (`SidebarShell.tsx:104-106`). `NavGroups` não recebe o pathname e `.sidebar-link`
não tem variante ativa.

**Correção — parte CSS.** Em `app/globals.css`, logo após o bloco `.sidebar-link:hover`:

```css
.sidebar-link-ativo {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text);
  font-weight: 500;
}
```

Segue o vocabulário existente: classe semântica, cor via variável do tema, sem utilitário inline.
O estado ativo é mais forte que o `:hover` (`0.10` contra `0.08`) para se distinguir dele.

**Correção — parte comportamento.** `NavGroups` recebe o pathname por prop e resolve o item ativo.

Regra de casamento — implementar exatamente assim:

- `href === '/'` → ativo somente quando `pathname === '/'`. Prefixo aqui casaria com tudo.
- demais → ativo quando `pathname === href` **ou** `pathname.startsWith(href + '/')`. O sufixo
  `'/'` evita que `/admin/salas` acenda em uma rota futura `/admin/salas-arquivadas`.
- `/gestao` é um rewrite do `vercel.json` para outra aplicação; o `pathname` deste app nunca
  assume esse valor. Nenhum tratamento especial — a regra acima simplesmente nunca o marca.

```diff
 function NavGroups({
-  groups, colapsado, onNavigate,
+  groups, colapsado, pathname, onNavigate,
 }: {
   groups: SidebarGroup[];
   colapsado: boolean;
+  pathname: string;
   onNavigate?: () => void;
 }) {
```

```diff
           {grupo.items.map((item) => {
             const Icon = item.icon;
+            const ativo = item.href === '/'
+              ? pathname === '/'
+              : pathname === item.href || pathname.startsWith(`${item.href}/`);
             return (
               <Link
                 key={item.href}
                 href={item.href}
                 title={item.label}
                 onClick={onNavigate}
-                className="sidebar-link"
+                className={ativo ? 'sidebar-link sidebar-link-ativo' : 'sidebar-link'}
+                aria-current={ativo ? 'page' : undefined}
                 style={{ justifyContent: colapsado ? 'center' : 'flex-start' }}
               >
```

Nas duas chamadas de `NavGroups` (aside desktop em `SidebarShell.tsx:133`, gaveta em
`SidebarShell.tsx:162`), passar `pathname={pathname}`. A variável já existe no escopo.

**Verificação.** Como master, navegar por `/`, `/admin/usuarios`, `/admin/salas`,
`/admin/auditoria`, `/admin/lixeira` e confirmar que exatamente um item fica destacado em cada.
Entrar em `/sala/<uuid>`: **nenhum** item destacado — comportamento esperado da regra acima, já
que `/sala/<id>` não é filho de `/`. Confirmar também com o sidebar retraído, onde o destaque é a
única pista de contexto.

---

### C5 — Efeito colateral dentro do updater de estado (Menor)

**Sintoma.** Nenhum hoje. É armadilha para a próxima alteração.

**Mecanismo.** `SidebarShell.tsx:108-114`:

```jsx
function alternarColapso() {
  setColapsado((atual) => {
    const novo = !atual;
    localStorage.setItem(STORAGE_KEY, novo ? '1' : '0');
    return novo;
  });
}
```

Função de atualização precisa ser pura. React invoca o updater duas vezes em StrictMode (dev).
Hoje o efeito é idempotente — as duas invocações recebem o mesmo `atual` e gravam o mesmo valor —
então não quebra. Passa a quebrar assim que alguém escrever algo não idempotente ali.

**Correção.** O componente é a fonte da verdade do estado; não há necessidade do updater
funcional:

```diff
 function alternarColapso() {
-    setColapsado((atual) => {
-      const novo = !atual;
-      localStorage.setItem(STORAGE_KEY, novo ? '1' : '0');
-      return novo;
-    });
+    const novo = !colapsado;
+    setColapsado(novo);
+    localStorage.setItem(STORAGE_KEY, novo ? '1' : '0');
 }
```

**Verificação.** Retrair, recarregar a página, confirmar que continua retraído. Expandir,
recarregar, confirmar que continua expandido.

---

## 5. Fora de escopo desta rodada

Achados Menores da mesma revisão, registrados e **deliberadamente adiados**. Não implementar:

- `<nav>` duplicado sem `aria-label` — dois landmarks de navegação idênticos.
- Árvore de navegação renderizada duas vezes (desktop + gaveta), escondida só por CSS.
- Gaveta não fecha com `Escape` e não tem focus trap.
- `title={item.label}` presente também quando expandido, gerando tooltip nativo redundante.
- Gap entre sidebar e conteúdo dependente do padding de cada página (`m-4 mr-0` no aside,
  `flex-1` sem margem esquerda no conteúdo).

Nota: C2 reduz o impacto prático do `<nav>` duplicado no mobile — a cópia inerte sai do a11y tree.
O landmark duplicado só permanece enquanto a gaveta está aberta, o que é aceitável.

---

## 6. Lacuna de cobertura de teste

**Constatação.** Os quatro commits do sidebar (`75d4fca..cd86bbe`) não tocam nenhum arquivo de
teste. `grep -rn sidebar tests/` não retorna nada. O projeto roda `vitest` com
`environment: 'node'` e não tem jsdom nem testing-library instalados.

Consequência: os 73 testes que passam são de `authz`, `crypto`, `session`, `formato`,
`auditSanitize` e `integracao` — passariam idênticos se o sidebar não existisse. **Eles não são
evidência sobre esta branch.** O spec original (§6) dispensou teste automatizado e delegou a
verificação ao teste manual, que não foi executado.

Todas as cinco correções acima são de comportamento de DOM, e todas são verificáveis
automaticamente. A decisão sobre montar essa infraestrutura está na Task 3 abaixo, marcada como
condicional.

---

## 7. Decomposição em tasks

### Task 1 — Correções de layout e acessibilidade

**Arquivo:** `components/SidebarShell.tsx` (só ele).
**Conteúdo:** C1, C2, C3, C5. São mudanças pequenas, no mesmo arquivo, sem dependência entre si.
**Saída:** `tsc --noEmit` limpo, `npm test` 73/73, `next build` de produção com as mesmas 7 rotas.
No report, informar qual variante de C2 foi usada (`inert` ou o fallback `invisible`).

### Task 2 — Estado ativo de navegação

**Arquivos:** `app/globals.css` (classe `.sidebar-link-ativo`), `components/SidebarShell.tsx`
(prop `pathname` em `NavGroups`, cálculo de `ativo`, `aria-current`, as duas chamadas).
**Conteúdo:** C4.
**Depende da Task 1** — mesmo arquivo, evita conflito de edição.
**Saída:** mesmos três verificadores da Task 1.

### Task 3 — Cobertura de teste do SidebarShell

Aprovada pelo usuário em 2026-08-04. Adiciona `devDependencies`
(`jsdom`, `@testing-library/react`, `@testing-library/jest-dom`) e um segundo projeto no
`vitest.config.ts` com `environment: 'jsdom'`, mantendo a suíte `node` atual intacta — os 73
testes existentes não podem mudar de ambiente.

Testes a escrever, um por correção verificável:

- C3: com `colapsado` verdadeiro, `getByRole('button', { name: 'Sair' })` encontra o botão.
- C4: dado `pathname = '/admin/salas'`, o link de "Salas (admin)" tem `aria-current="page"` e o
  de "Salas" (`/`) não tem.
- C4: dado `pathname = '/'`, só o link `/` tem `aria-current="page"`.
- C4: dado `pathname = '/sala/<uuid>'`, nenhum link tem `aria-current`.
- C5: `alternarColapso` grava `'1'` em `localStorage` e a leitura na montagem seguinte restaura o
  estado retraído.

C1 é geometria de layout e C2 depende de comportamento real de foco do navegador — jsdom não
computa nenhum dos dois de forma confiável. **Não escrever teste que finja verificá-los**; ficam
na checklist manual da seção 8.

---

## 8. Verificação manual (obrigatória antes do merge)

Nenhuma das tasks acima substitui isto. Executar com o servidor de desenvolvimento rodando,
logado como master:

1. Página longa, sidebar expandido: rolar até o fim — botão **Sair** continua visível. (C1)
2. Sidebar retraído: mesma checagem. (C1)
3. Retrair, recarregar → continua retraído. Expandir, recarregar → continua expandido. (C5)
4. Viewport mobile, gaveta fechada: `Tab` a partir do topo nunca entra em item de menu. (C2)
5. Gaveta aberta: links alcançáveis por `Tab`; fecha ao clicar no backdrop e ao escolher um item.
6. Retraído, accessibility inspector no botão de logout: nome acessível é "Sair". (C3)
7. Navegar por `/`, `/admin/usuarios`, `/admin/salas`, `/admin/auditoria`, `/admin/lixeira`:
   exatamente um item destacado em cada. (C4)
8. Abrir `/sala/<uuid>`: nenhum item destacado. (C4)
9. Logar como usuário comum sem módulo liberado: vê só "Salas", sem grupo "Módulos", sem itens de
   admin. Confirma que a Task 2 não vazou item de master no cálculo de estado ativo.
10. Usuário comum com o módulo `gestao` liberado: grupo "Módulos" aparece com "Gestão de Projetos".

Os itens 9 e 10 são conferência de regressão do que já funcionava — o cálculo de
`modulosVisiveis` vive em `components/Sidebar.tsx`, que nenhuma task toca.
