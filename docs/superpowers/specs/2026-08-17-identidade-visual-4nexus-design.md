# Identidade Visual 4nexus — Design

**Data:** 2026-08-17
**Status:** aprovado (brainstorming)
**Branch:** `dev`

## 1. Objetivo

Aplicar a identidade visual da 4nexus (empresa dona do produto) ao app, hoje com uma paleta
azul/roxo genérica sem relação com a marca. Primeira de duas frentes pedidas pelo cliente — a
segunda, navegação e efeitos de transição/motion (3D, blur, sombra em modais), é uma spec
separada, depois desta, construída em cima dos tokens definidos aqui.

**Escopo desta rodada:** paleta de cores, tipografia, logo no sidebar, favicon/ícones PWA, nome
do produto. Nenhuma mudança de layout, navegação ou animação entra aqui.

## 2. Origem da paleta e tipografia

Extraídos do site institucional (`4nexus.com.br`, WordPress/Elementor) via download direto do
HTML e dos CSS gerados pelo kit global do Elementor (`post-58.css`, `post-85.css`,
`post-1293.css`) — não da paleta genérica do editor de blocos do WordPress, que também aparece no
HTML mas não é a marca.

| Token | Hex | Uso no site |
|---|---|---|
| Índigo primário | `#271E5D` | cor de marca dominante |
| Índigo escuro | `#1E1749` | variante escura |
| Laranja (accent) | `#FF9400` | destaque/CTA |
| Dourado escuro | `#D08824` | variante do accent |
| Neutros | `#F4F4F4`, `#1C2326`, `#020101`, `#C2C2C2` | fundo/texto |

Tipografia: **Montserrat** (títulos) + **Poppins** (corpo), ambas Google Fonts.

## 3. Paleta — antes e depois

O app já usa uma base dark/glass (fundo com gradiente, blur, glassmorphism) — não é reconstrução
visual do zero, é retonalização. `--accent` só é referenciado dentro do próprio `globals.css`
(nenhum hex de marca espalhado por componente), então a troca fica contida num arquivo.

| Token (`app/globals.css`) | Antes | Depois |
|---|---|---|
| `--bg` | `#0a0b0f` | `#0f0a1f` (índigo bem escuro, família `#271E5D`) |
| `--surface` | `#14161d` | `#1a1530` |
| `--surface-2` | `#1b1e27` | `#221c3d` |
| `--accent` | `#6c8cff` (azul) | `#FF9400` (laranja da marca) |
| `--text` / `--text-dim` / `--border` / `--danger` / `--ok` | mantidos | mantidos — cores semânticas, sem motivo de marca pra mudar |
| Gradiente de `body` | azul/roxo genérico | tons de índigo (`#271E5D`/`#1E1749`) |
| Blobs de luz (`body::before`) | `rgba(108,140,255,…)` azul, `rgba(180,108,255,…)` roxo, etc. | retintados pra família índigo + um blob laranja de destaque, mantendo o mesmo efeito de "fonte de luz" atrás do vidro |
| `.btn-primary` (gradiente) | `#8aa2ff` → `var(--accent)` | tom claro de laranja → `var(--accent)` |
| `.input:focus` (ring/borda) | `rgba(108,140,255,…)` | `rgba(255,148,0,…)` |

**Verificação de contraste:** laranja `#FF9400` com texto escuro em cima (`.btn-primary` já usa
texto quase preto, `#0a0b0f`) passa 4.5:1 sem ajuste. Vale conferir no fim da implementação com
o texto claro padrão (`--text`) sobre laranja em qualquer lugar novo que usar `--accent` como
fundo — se algum caso não passar, o texto naquele elemento específico usa `#0a0b0f` em vez de
`var(--text)`, igual já é feito no botão primário.

## 4. Tipografia

Carregada via `next/font/google` (self-hosted no build, sem chamada externa em runtime):

- **Montserrat** → `h1`–`h3`, título de tela, nome de item em destaque
- **Poppins** → corpo, labels, botões, tabelas, inputs (substitui a pilha `ui-sans-serif,
  system-ui, …` atual)

Expostas como `--font-heading` e `--font-body`, aplicadas em `app/globals.css` — mesma mecânica
de hoje (declaração direta no seletor, sem tocar componente por componente).

## 5. Logo, favicon e nome

- **Sidebar** (`components/SidebarShell.tsx`): as 3 ocorrências do texto literal `"4NEXUS"`
  (header desktop, topbar mobile, gaveta mobile) viram a logo real — ícone sozinho quando
  colapsado (rail de 4rem não cabe o wordmark), ícone + wordmark quando expandido.
- **Favicon + PWA**: `app/icon.svg`, `app/apple-icon.png`, `public/icon-192.png`,
  `public/icon-512.png` regenerados a partir do arquivo real da logo.
- **Nome do produto**: `"4Nexus Administrativo"` em `<title>` (`app/layout.tsx`), no `<h1>` da
  tela de login (`app/login/page.tsx`), e em `manifest.name`
  (`public/manifest.webmanifest`). `manifest.short_name` fica `"4Nexus"` (espaço curto embaixo do
  ícone instalado no SO).
- **Tela de login**: sem mudança estrutural — herda cor/fonte novas automaticamente por já usar
  `.glass`/`.input`/`.btn`. Não ganha logo/hero própria (fora do escopo escolhido pelo cliente).

## 6. Pendência bloqueante

Arquivo real da logo (PNG ou SVG, alta resolução / fundo transparente) ainda não recebido — só
foi visto renderizado no chat, sem acesso aos pixels/vetores originais. **Favicon, ícones PWA e
logo do sidebar não podem ser implementados sem esse arquivo.** Paleta e tipografia (seções 3 e
4) não dependem dele e podem seguir de forma independente.

## 7. Fora de escopo (spec futura)

- Navegação, transições de abertura de modal, efeitos 3D/blur/sombra adicionais — spec separada,
  depois desta, construída sobre os tokens de cor/fonte definidos aqui.
- Hero/capa na tela de login.
- Tema por módulo (multi-brand) — hoje é um token set só; se o hub precisar de tema por módulo
  no futuro, é decisão e spec própria.

## 8. Arquivos afetados

- `app/globals.css` — tokens de cor, gradiente, fontes
- `app/layout.tsx` — `<title>`, fontes via `next/font/google`
- `app/login/page.tsx` — texto do `<h1>`
- `public/manifest.webmanifest` — `name`, `short_name`
- `components/SidebarShell.tsx` — logo no lugar do texto `"4NEXUS"`
- `app/icon.svg`, `app/apple-icon.png`, `public/icon-192.png`, `public/icon-512.png` — regerados
  a partir do arquivo da logo (bloqueado pela seção 6)
- Novo: `public/brand/` (ou equivalente) para guardar o arquivo-fonte da logo

## 9. Teste

Sem lógica nova (é troca de token visual + asset), não há teste automatizado a escrever. Verificação manual: `npm run dev`, conferir em light do navegador (app é dark-only) — login, sidebar
colapsado/expandido, botão primário, foco de input, favicon na aba — e rodar `npm test` pra
garantir que nenhum teste existente que compara texto/snapshot quebrou com a troca de "4NEXUS"
por logo no sidebar (os testes de `AgendaClient`, etc. não deveriam depender disso, mas vale
conferir).
