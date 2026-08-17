# Identidade Visual 4nexus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar a paleta, tipografia, logo e nome da 4nexus ao app, hoje com identidade visual
genérica sem relação com a marca.

**Architecture:** Troca de valores em tokens CSS já existentes (`app/globals.css`, mecanismo
`var(--x)` já usado em todo o app — sem camada nova de indireção). Fontes via `next/font/google`
(self-hosted no build). Ícones/favicon gerados uma vez por script Node (`sharp`) a partir do
arquivo-fonte da logo.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Tailwind v4 (CSS-first, sem
`tailwind.config`), `next/font/google`, `sharp` (novo devDependency, só para o script de geração
de ícones).

## Global Constraints

- TypeScript strict. `npx tsc --noEmit` precisa sair limpo ao fim de toda task.
- `npm test` precisa passar inteiro ao fim de toda task. Base atual: **283 testes**.
- Cores semânticas (`--danger`, `--ok`, `--text`, `--text-dim`, `--border`) não mudam — são
  significado (erro/sucesso/texto), não marca.
- Nenhuma fonte carrega de CDN externo em runtime — `next/font/google` baixa e serve local no
  build.
- Task 4 depende de arquivo(s) externo(s) da logo (ainda não recebido no momento em que este
  plano foi escrito) — não pode começar sem isso. Tasks 1–3 são independentes e podem rodar antes.
- Spec de referência: `docs/superpowers/specs/2026-08-17-identidade-visual-4nexus-design.md`.

---

## Task 1: Paleta de cores

**Files:**
- Modify: `app/globals.css`
- Modify: `app/layout.tsx` (só a linha de `viewport.themeColor`)
- Modify: `public/manifest.webmanifest` (só `background_color` e `theme_color`)

**Interfaces:**
- Produces: novos valores de `--bg`, `--surface`, `--surface-2`, `--accent` em `app/globals.css`,
  consumidos por toda a UI via `var(--accent)` etc. (nenhuma outra task ou arquivo precisa saber
  o hex — só o nome do token).

- [ ] **Step 1: Trocar os tokens de cor em `:root`**

Em `app/globals.css`, substituir:

```css
:root {
  --bg: #0a0b0f;
  --surface: #14161d;
  --surface-2: #1b1e27;
  --border: rgba(255, 255, 255, 0.08);
  --text: #e8eaf0;
  --text-dim: #9aa1b1;
  --accent: #6c8cff;
  --danger: #ff6b6b;
  --ok: #4ade80;
}
```

por:

```css
:root {
  --bg: #0f0a1f;
  --surface: #1a1530;
  --surface-2: #221c3d;
  --border: rgba(255, 255, 255, 0.08);
  --text: #e8eaf0;
  --text-dim: #9aa1b1;
  --accent: #ff9400;
  --danger: #ff6b6b;
  --ok: #4ade80;
}
```

- [ ] **Step 2: Trocar o gradiente de fundo do `body`**

Substituir:

```css
  background: linear-gradient(155deg, #131b3f 0%, #0c1020 45%, #1a1030 100%);
```

por:

```css
  background: linear-gradient(155deg, #271e5d 0%, #0f0a1f 45%, #1e1749 100%);
```

- [ ] **Step 3: Retintar os blobs de luz do fundo (`body::before`)**

Substituir:

```css
  background:
    radial-gradient(45rem 32rem at 14% 6%, rgba(108, 140, 255, 0.60), transparent 62%),
    radial-gradient(40rem 30rem at 88% 10%, rgba(180, 108, 255, 0.50), transparent 60%),
    radial-gradient(42rem 34rem at 52% 48%, rgba(88, 120, 255, 0.28), transparent 66%),
    radial-gradient(38rem 30rem at 78% 92%, rgba(72, 214, 255, 0.30), transparent 60%),
    radial-gradient(34rem 26rem at 8% 86%, rgba(255, 108, 180, 0.26), transparent 58%);
```

por:

```css
  background:
    radial-gradient(45rem 32rem at 14% 6%, rgba(39, 30, 93, 0.65), transparent 62%),
    radial-gradient(40rem 30rem at 88% 10%, rgba(255, 148, 0, 0.35), transparent 60%),
    radial-gradient(42rem 34rem at 52% 48%, rgba(30, 23, 73, 0.30), transparent 66%),
    radial-gradient(38rem 30rem at 78% 92%, rgba(208, 136, 36, 0.22), transparent 60%),
    radial-gradient(34rem 26rem at 8% 86%, rgba(255, 148, 0, 0.18), transparent 58%);
```

- [ ] **Step 4: Trocar o gradiente do botão primário**

Substituir:

```css
.btn-primary {
  background: linear-gradient(140deg, #8aa2ff, var(--accent));
  border-color: transparent;
  color: #0a0b0f;
  font-weight: 600;
  box-shadow: 0 6px 20px rgba(108, 140, 255, 0.35);
}
.btn-primary:hover:not(:disabled) { background: linear-gradient(140deg, #9db1ff, #7d99ff); }
```

por:

```css
.btn-primary {
  background: linear-gradient(140deg, #ffb347, var(--accent));
  border-color: transparent;
  color: #0a0b0f;
  font-weight: 600;
  box-shadow: 0 6px 20px rgba(255, 148, 0, 0.35);
}
.btn-primary:hover:not(:disabled) { background: linear-gradient(140deg, #ffc266, #ff8500); }
```

- [ ] **Step 5: Trocar o foco do input**

Substituir:

```css
.input:focus {
  border-color: rgba(108, 140, 255, 0.75);
  background: rgba(10, 12, 20, 0.6);
  box-shadow: 0 0 0 3px rgba(108, 140, 255, 0.18);
}
```

por:

```css
.input:focus {
  border-color: rgba(255, 148, 0, 0.75);
  background: rgba(10, 12, 20, 0.6);
  box-shadow: 0 0 0 3px rgba(255, 148, 0, 0.18);
}
```

- [ ] **Step 6: Alinhar `viewport.themeColor` em `app/layout.tsx`**

Em `app/layout.tsx`, substituir:

```ts
export const viewport: Viewport = {
  themeColor: '#0a0b0f',
};
```

por:

```ts
export const viewport: Viewport = {
  themeColor: '#0f0a1f',
};
```

- [ ] **Step 7: Alinhar cores do manifest PWA**

Em `public/manifest.webmanifest`, substituir `"background_color": "#0a0b0f"` e
`"theme_color": "#0a0b0f"` por `"background_color": "#0f0a1f"` e `"theme_color": "#0f0a1f"`.
Não mexer em `name`/`short_name` aqui — isso é Task 3.

- [ ] **Step 8: Verificar**

```bash
npx tsc --noEmit
npm test
```

Expected: `tsc` sem erro, 283 testes passando.

- [ ] **Step 9: Teste manual**

```bash
npm run dev
```

Abrir `http://localhost:3000/login`: fundo deve estar em tom índigo (não mais azul/roxo
genérico), botão "Entrar" laranja, campo de input com anel laranja ao focar. Abrir qualquer tela
logada e conferir que o link ativo do sidebar e os cards `.glass`/`.surface` continuam legíveis
(sem regressão de contraste).

- [ ] **Step 10: Commit**

```bash
git add app/globals.css app/layout.tsx public/manifest.webmanifest
git commit -m "Aplica paleta de cores da 4nexus (índigo + laranja)"
```

---

## Task 2: Tipografia

**Files:**
- Modify: `app/layout.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: nenhuma (independente da Task 1, mas assume que Task 1 já rodou — mesmo arquivo
  `app/layout.tsx`, seções diferentes).
- Produces: `--font-heading` e `--font-body` em `app/globals.css`, aplicáveis por qualquer CSS
  futuro sem precisar reimportar fonte.

- [ ] **Step 1: Carregar Montserrat e Poppins via `next/font/google`**

Em `app/layout.tsx`, adicionar o import e as duas instâncias de fonte antes de `export const
metadata`:

```ts
import { Montserrat, Poppins } from 'next/font/google';

const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-heading',
  display: 'swap',
});

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-body',
  display: 'swap',
});
```

- [ ] **Step 2: Aplicar as classes de variável no `<html>`**

Substituir:

```tsx
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
```

por:

```tsx
    <html lang="pt-BR" className={`${montserrat.variable} ${poppins.variable}`}>
      <body>{children}</body>
    </html>
```

- [ ] **Step 3: Usar as variáveis no CSS**

Em `app/globals.css`, substituir a linha de `font-family` do `body`:

```css
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
```

por:

```css
  font-family: var(--font-body), ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
```

E adicionar, logo depois do bloco `body { ... }`, uma regra nova para títulos:

```css
h1, h2, h3 {
  font-family: var(--font-heading), var(--font-body), ui-sans-serif, system-ui, sans-serif;
}
```

- [ ] **Step 4: Verificar**

```bash
npx tsc --noEmit
npm test
```

Expected: `tsc` sem erro, 283 testes passando.

- [ ] **Step 5: Teste manual**

```bash
npm run dev
```

Abrir qualquer tela e conferir no DevTools (aba Network ou Fonts) que Montserrat/Poppins
carregaram como arquivo local (`/_next/static/media/...`), não como request pra
`fonts.googleapis.com`. Título da tela de login deve visualmente estar em Montserrat (mais
geométrica/bold que a fonte de sistema anterior).

- [ ] **Step 6: Commit**

```bash
git add app/layout.tsx app/globals.css
git commit -m "Aplica tipografia da 4nexus (Montserrat + Poppins)"
```

---

## Task 3: Nome do produto

**Files:**
- Modify: `app/layout.tsx`
- Modify: `app/login/page.tsx`
- Modify: `public/manifest.webmanifest`

**Interfaces:**
- Consumes: nenhuma. Independente de Task 1 e Task 2 (muda texto, não cor/fonte), mas roda depois
  delas nesta ordem por conveniência de revisão incremental — pode ser feita em paralelo se
  preferir.

- [ ] **Step 1: Trocar o título da página**

Em `app/layout.tsx`, dentro de `export const metadata`, substituir:

```ts
  title: 'Cofre de Senhas',
```

por:

```ts
  title: '4Nexus Administrativo',
```

- [ ] **Step 2: Trocar o texto da tela de login**

Em `app/login/page.tsx`, substituir:

```tsx
          <h1 className="text-xl font-semibold">Cofre de Senhas</h1>
```

por:

```tsx
          <h1 className="text-xl font-semibold">4Nexus Administrativo</h1>
```

- [ ] **Step 3: Trocar o nome no manifest PWA**

Em `public/manifest.webmanifest`, substituir:

```json
  "name": "Cofre de Senhas",
  "short_name": "Cofre",
```

por:

```json
  "name": "4Nexus Administrativo",
  "short_name": "4Nexus",
```

- [ ] **Step 4: Verificar**

```bash
npx tsc --noEmit
npm test
```

Expected: `tsc` sem erro, 283 testes passando. Se algum teste comparar o texto `Cofre de Senhas`
literal, corrigir o teste para o texto novo (nenhum teste hoje faz isso, conferido antes de este
plano ser escrito — mas confirmar no resultado do `npm test`).

- [ ] **Step 5: Teste manual**

```bash
npm run dev
```

Conferir: título da aba do navegador (`4Nexus Administrativo`), `<h1>` da tela de login, e (se o
navegador suportar "Instalar app") o nome sugerido na instalação do PWA.

- [ ] **Step 6: Commit**

```bash
git add app/layout.tsx app/login/page.tsx public/manifest.webmanifest
git commit -m "Renomeia produto para 4Nexus Administrativo"
```

---

## Task 4: Logo, favicon e ícones PWA

**Bloqueada até o arquivo da logo ser recebido.** Este plano assume um único arquivo-fonte (a
logo completa: símbolo + wordmark "4nexus" + tagline), salvo como PNG. O favicon/ícones PWA usam
um recorte automático do lado esquerdo da imagem (onde fica o símbolo) — decisão explícita do
cliente em vez de pedir um segundo arquivo já recortado. Se o recorte sair errado (símbolo não
está exatamente no canto esquerdo, ou a proporção da imagem for muito larga), o Step 3 explica
como ajustar sem precisar de arquivo novo.

**Files:**
- Create: `public/brand/logo-source.png` (fornecido externamente, ver Step 1)
- Create: `scripts/gerar-icones.mjs`
- Create (gerado pelo script): `public/brand/logo-sidebar.png`, `app/icon.png`,
  `app/apple-icon.png`, `public/icon-192.png` (sobrescrito), `public/icon-512.png` (sobrescrito)
- Delete: `app/icon.svg`
- Modify: `components/SidebarShell.tsx`

**Interfaces:**
- Consumes: nenhuma das tasks anteriores (arquivo independente), mas assume Task 1–3 já
  aplicadas (cores/fontes/nome já trocados) — só precisa disso pra não haver conflito de merge
  entre tasks, não há dependência de código real.
- Produces: nada consumido por outra task.

- [ ] **Step 1: Obter e salvar o arquivo-fonte da logo**

Salvar o arquivo da logo (a imagem completa: losango + "4nexus" + "CONTEÚDO PRA VOCÊ") em:

```
public/brand/logo-source.png
```

Se o arquivo vier em outro formato (jpg, webp, etc.), converter para PNG antes de salvar (o
script do Step 2 espera PNG especificamente, pra preservar transparência de forma previsível).

- [ ] **Step 2: Instalar `sharp` como devDependency**

```bash
npm install -D sharp
```

Expected: `package.json` ganha `"sharp": "^0.34.x"` em `devDependencies` (já existe hoje como
dependência transitiva do Next, mas sem entrada própria no `package.json` — sem isso o script do
Step 3 fica dependendo de um pacote que não está garantido no lockfile).

- [ ] **Step 3: Escrever o script de geração de ícones**

Criar `scripts/gerar-icones.mjs`:

```js
import sharp from 'sharp';
import path from 'node:path';

const origem = path.join(process.cwd(), 'public', 'brand', 'logo-source.png');

// A logo completa tem o símbolo (losango + play) à esquerda e o wordmark
// "4nexus" à direita. Favicon/ícones PWA precisam só do símbolo — em 16-32px
// o wordmark vira ruído ilegível. Sem um arquivo já recortado, assumimos que
// o símbolo ocupa um quadrado no canto esquerdo da imagem, do tamanho da
// altura total. Se o resultado em `app/icon.png` sair errado (cortando o
// símbolo pela metade, ou pegando parte do texto), ajuste só `CROP_LARGURA`
// abaixo — não precisa mexer no resto do script.
const CROP_LARGURA = null; // null = usa a altura da imagem como largura do recorte

async function main() {
  const meta = await sharp(origem).metadata();
  const ladoRecorte = CROP_LARGURA ?? meta.height;

  const simbolo = () =>
    sharp(origem).extract({ left: 0, top: 0, width: ladoRecorte, height: meta.height });

  await simbolo().resize(64, 64).png().toFile(path.join(process.cwd(), 'app', 'icon.png'));
  await simbolo().resize(180, 180).png().toFile(path.join(process.cwd(), 'app', 'apple-icon.png'));
  await simbolo().resize(192, 192).png()
    .toFile(path.join(process.cwd(), 'public', 'icon-192.png'));
  await simbolo().resize(512, 512).png()
    .toFile(path.join(process.cwd(), 'public', 'icon-512.png'));

  // Logo completa (símbolo + wordmark), redimensionada pro sidebar — altura
  // fixa, largura proporcional.
  await sharp(origem).resize({ height: 80 }).png()
    .toFile(path.join(process.cwd(), 'public', 'brand', 'logo-sidebar.png'));

  console.log('Ícones gerados a partir de', origem);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 4: Rodar o script**

```bash
node scripts/gerar-icones.mjs
```

Expected: sem erro, mensagem `Ícones gerados a partir de ...`. Confirma que os 5 arquivos
existem:

```bash
ls app/icon.png app/apple-icon.png public/icon-192.png public/icon-512.png public/brand/logo-sidebar.png
```

- [ ] **Step 5: Conferir visualmente o recorte do símbolo**

Abrir `app/icon.png` num visualizador de imagem. Se o símbolo (losango + play) estiver cortado
pela metade ou pegando parte do texto "4nexus": editar `CROP_LARGURA` no script (Step 3) para um
valor em pixels menor que `meta.height` (ex.: `const CROP_LARGURA = 300;` se a imagem for larga
e o símbolo mais estreito que a altura), salvar, e repetir o Step 4. Repetir até o recorte ficar
certo antes de seguir.

- [ ] **Step 6: Remover o ícone antigo**

```bash
rm app/icon.svg
```

Next.js só usa uma convenção de ícone por vez (`app/icon.*`) — manter os dois arquivos causaria
ambiguidade sobre qual é servido.

- [ ] **Step 7: Trocar o texto "4NEXUS" pela logo no sidebar**

Em `components/SidebarShell.tsx`, adicionar o import no topo do arquivo:

```tsx
import Image from 'next/image';
```

Substituir as duas ocorrências incondicionais:

```tsx
          <span className="font-semibold flex-1 truncate">4NEXUS</span>
```

(uma dentro da barra mobile fixa, outra dentro da gaveta mobile) por:

```tsx
          <Image src="/brand/logo-sidebar.png" alt="4Nexus" width={120} height={40} className="h-8 w-auto" priority />
```

E a ocorrência condicional (dentro do `<aside>` desktop):

```tsx
          {!colapsado && <span className="font-semibold flex-1 truncate">4NEXUS</span>}
```

por:

```tsx
          {!colapsado && <Image src="/brand/logo-sidebar.png" alt="4Nexus" width={120} height={40} className="h-8 w-auto flex-1 object-contain object-left" priority />}
```

Rail colapsado (`md:w-16`) continua sem logo — mesmo comportamento de hoje (só o botão de
expandir/retrair fica visível ali), não é regressão.

- [ ] **Step 8: Verificar**

```bash
npx tsc --noEmit
npm test
```

Expected: `tsc` sem erro, 283 testes passando.

- [ ] **Step 9: Teste manual completo**

```bash
npm run dev
```

Conferir, em `http://localhost:3000`:
1. Favicon na aba do navegador mostra o símbolo (não mais o ícone azul de cofre antigo).
2. Sidebar desktop expandido: logo completa aparece no topo, alinhada à esquerda, sem esticar.
3. Retrair o sidebar (botão de seta): logo some, só o botão de expandir fica visível — igual
   hoje.
4. Redimensionar a janela pra largura mobile (`< 768px`): topbar fixa no topo mostra a logo;
   abrir a gaveta (ícone de menu) e conferir a logo lá também.
5. `public/manifest.webmanifest` → abrir `http://localhost:3000/manifest.webmanifest`
   diretamente no navegador e conferir que os campos `icons` apontam pros arquivos novos (mesmo
   nome de arquivo, conteúdo novo — sem mudança necessária no manifest em si).

- [ ] **Step 10: Commit**

```bash
git add public/brand public/icon-192.png public/icon-512.png app/icon.png app/apple-icon.png scripts/gerar-icones.mjs components/SidebarShell.tsx package.json package-lock.json
git rm app/icon.svg
git commit -m "Aplica logo real da 4nexus (favicon, ícones PWA e sidebar)"
```

---

## Self-Review

**Cobertura da spec:** seção 3 (paleta) → Task 1. Seção 4 (tipografia) → Task 2. Seção 5 (logo,
favicon, nome) → Tasks 3 e 4. Seção 6 (pendência do arquivo) → bloqueio documentado no cabeçalho
da Task 4. Seção 7 (fora de escopo) → nenhuma task toca nisso. Seção 9 (teste) → cada task termina
com `tsc`/`npm test`/verificação manual, igual pedido na spec.

**Placeholder scan:** nenhum "TBD"/"implementar depois" — a única incerteza real (posição exata
do símbolo dentro do arquivo da logo) tem um mecanismo concreto de ajuste (Step 3/5 da Task 4),
não um placeholder.

**Consistência de tipos/nomes:** `--font-heading`/`--font-body` (Task 2) usados exatamente com
esse nome em `globals.css`. `public/brand/logo-sidebar.png` é o nome usado tanto no script (Task
4, Step 3) quanto no `SidebarShell.tsx` (Task 4, Step 7) — confirmado igual nos dois lugares.
