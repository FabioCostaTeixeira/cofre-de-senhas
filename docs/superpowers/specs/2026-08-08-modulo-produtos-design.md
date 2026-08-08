# Módulo Produtos — Design

**Data:** 2026-08-08
**Status:** aprovado (brainstorming)
**Branch:** `dev`

## 1. Objetivo

Catálogo comercial da 4Nexus: produtos avulsos (Gravação, Edição, Corte, Fakecast...), combos
(pacotes de produtos com preço fechado) e planos recorrentes (combos e/ou produtos com cota e
prazo/ciclo). Serve de base pro módulo de Vendas (futuro, fora de escopo): lá o cliente cadastrado
vai contratar produto/combo/plano e o consumo será abatido — aqui só nasce o catálogo.

**Fora de escopo desta rodada:** venda em si, ficha de consumo do cliente, financeiro, agenda.

## 2. Produto com atributos variáveis: categoria como molde

Produto de categorias diferentes tem campos diferentes (Gravação tem `qtd_cameras`; Corte não).
Colocar isso em colunas fixas obriga migration a cada atributo novo; EAV puro (`produto_atributos`
chave/valor) é flexível mas ruim de consultar e sem tipo.

Solução: **categoria carrega um molde de atributos**, e o produto guarda os valores em JSONB
seguindo esse molde.

```
categorias_produto                    produtos
  nome: "Gravação"                      categoria_id → categorias_produto
  atributos_molde: [                    atributos (jsonb, segue o molde da categoria):
    {chave: qtd_cameras,                  { qtd_cameras: 3, tempo_horas: 1,
     rotulo: "Qtd. de câmeras",             inclui_edicao: false, prazo_entrega_dias: 0 }
     tipo: numero, obrigatorio: true},
    {chave: tempo_horas, ...},
    {chave: inclui_edicao, tipo: booleano},
    {chave: prazo_entrega_dias, ...}
  ]
```

O formulário de produto é **dinâmico**: ao escolher a categoria, monta os campos a partir do molde
dela (tipo `numero` → `<input type="number">`, `texto` → `<input>`, `booleano` → checkbox).
Categoria nova é puro cadastro — zero deploy. Produto com atributo nunca visto: edita o molde da
categoria, não migration.

A action de salvar produto **relê o molde da categoria no servidor** e só aceita chaves que
constam nele (rejeitando/ignorando o resto do que vier no formulário) — o formulário no cliente é
cosmético, a validação de forma é sempre revalidada no servidor, mesmo padrão do resto do projeto.

## 3. Schema

Migration: `db/migrations/006_produtos.sql`.

```sql
create type tipo_atributo_produto as enum ('numero', 'texto', 'booleano');

create table categorias_produto (
  id                uuid primary key default gen_random_uuid(),
  nome              text not null unique,
  unidade_consumo   text,              -- rótulo livre, ex.: "gravação", "corte", "vídeo"
  atributos_molde   jsonb not null default '[]',
  -- cada item: {chave, rotulo, tipo: numero|texto|booleano, obrigatorio}
  ativo             boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table produtos (
  id                  uuid primary key default gen_random_uuid(),
  categoria_id        uuid not null references categorias_produto(id),
  nome                text not null,
  descricao           text,
  atributos           jsonb not null default '{}',
  preco               numeric(10,2) not null check (preco >= 0),
  ativo               boolean not null default true,
  deleted_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index produtos_categoria_idx on produtos (categoria_id);

create table combos (
  id                uuid primary key default gen_random_uuid(),
  nome              text not null,
  descricao         text,
  preco             numeric(10,2) not null check (preco >= 0),
  ativo             boolean not null default true,
  deleted_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table combo_itens (
  id          uuid primary key default gen_random_uuid(),
  combo_id    uuid not null references combos(id) on delete cascade,
  produto_id  uuid not null references produtos(id),
  quantidade  int not null check (quantidade > 0),
  unique (combo_id, produto_id)
);

create table planos (
  id              uuid primary key default gen_random_uuid(),
  nome            text not null,
  descricao       text,
  tipo_cobranca   text not null check (tipo_cobranca in ('pacote_fechado', 'assinatura')),
  -- pacote_fechado: paga uma vez, tem prazo (dias) pra consumir a cota toda.
  -- assinatura: cobra e renova a cota a cada ciclo (só 'mensal' por ora).
  validade_dias   int,
  ciclo           text check (ciclo in ('mensal')),
  preco           numeric(10,2) not null check (preco >= 0),
  ativo           boolean not null default true,
  deleted_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (
    (tipo_cobranca = 'pacote_fechado' and validade_dias is not null and ciclo is null) or
    (tipo_cobranca = 'assinatura' and ciclo is not null and validade_dias is null)
  )
);

create table plano_itens (
  id          uuid primary key default gen_random_uuid(),
  plano_id    uuid not null references planos(id) on delete cascade,
  tipo_item   text not null check (tipo_item in ('produto', 'combo')),
  produto_id  uuid references produtos(id),
  combo_id    uuid references combos(id),
  quantidade  int not null check (quantidade > 0),
  check (
    (tipo_item = 'produto' and produto_id is not null and combo_id is null) or
    (tipo_item = 'combo' and combo_id is not null and produto_id is null)
  )
);
```

`combo_itens`/`plano_itens` referenciam `produtos`/`combos` sem filtrar `deleted_at`: um combo
antigo continua mostrando os itens originais mesmo que o produto tenha sido descontinuado depois
— a tela marca esse item com um selo "produto descontinuado" em vez de escondê-lo ou quebrar.

**Categorias não têm lixeira.** É cadastro de referência, pequeno, raramente removido. Apagar só é
permitido se nenhum produto referenciar a categoria (senão erro amigável "categoria em uso por N
produtos"); pra "desativar sem apagar" existe o campo `ativo`, que tira a categoria do seletor de
produto novo sem quebrar produto existente.

## 4. Preço de combo/plano: sugerido, nunca calculado por trigger

Preço de combo/plano é **sempre digitado pelo cadastrador** — confere com o PDF: nenhum pacote
bate com a soma simples dos avulsos (Plano Duo R$2.500 não é 2 gravações + 2 edições + 8 cortes
avulsos somados). A tela calcula a soma dos preços avulsos dos itens escolhidos **no cliente**, só
como referência visual ("soma dos itens avulsos: R$X"), e preenche o campo preço com esse valor
como ponto de partida editável. O servidor nunca recalcula nem valida contra essa soma.

## 5. Telas e menu

Grupo de topo novo no menu, **"Produtos"**, paralelo a "Cadastros"/"Gestão"/"Cofre de Senhas"
(mesmo padrão já usado: cada domínio é seu próprio grupo). Master-only, mesmo critério dos outros
grupos administrativos — `canManageProdutos(actor)` em `lib/authz.ts`, mesmo formato de
`canManageTerceiros`.

| Rota | Conteúdo |
|---|---|
| `/produtos/categorias` | CRUD de categoria: nome, unidade de consumo, molde de atributos (lista editável de `{chave, rótulo, tipo, obrigatório}`) |
| `/produtos` | CRUD de produto: escolhe categoria → formulário nasce dinâmico a partir do molde |
| `/produtos/combos` | CRUD de combo: nome, itens (produto + quantidade, repetível), preço |
| `/produtos/planos` | CRUD de plano: nome, tipo de cobrança, validade/ciclo, itens (produto OU combo + quantidade, repetível), preço |

Todas com lixeira (exceto categoria, seção 3) e auditoria, reaproveitando o mecanismo genérico já
existente (`TrashItem.kind` ganha `'produto' | 'combo' | 'plano'`; `entity_type` da auditoria
idem).

### Molde de atributos na tela de categoria

Lista editável em memória no client component (cada linha: chave, rótulo, tipo, obrigatório;
botão adicionar/remover linha), serializada num `<input type="hidden">` como JSON ao salvar. A
action revalida a forma (`chave` não vazia e única na lista, `tipo` é um dos três valores) antes de
gravar.

### Formulário de produto

Client component recebe a `categoria` escolhida (via seleção que recarrega os campos dinâmicos —
troca de categoria via `<select>` com o array de categorias já carregado no client, sem round-trip
ao servidor) e desenha um campo por entrada do molde. Campos fixos (nome, descrição, preço) sempre
aparecem; os dinâmicos vêm depois, num fieldset "Detalhes da categoria X".

### Montagem de combo/plano

Repetidor de itens: um seletor (produto, ou produto/combo no caso de plano) + campo de quantidade
+ botão "adicionar"; lista abaixo mostra os itens já adicionados com botão remover. Cada linha
alimenta um `<input type="hidden">` por item ao submeter (serializado como JSON, mesmo mecanismo
do molde de atributos). A soma de referência (seção 4) recalcula a cada item adicionado/removido.

## 6. Fora de escopo (confirmado com o usuário)

- Venda/contratação por cliente, ficha de consumo, abatimento de cota — módulo de Vendas futuro.
- Cobrança recorrente de verdade (gerar fatura mensal da assinatura) — Financeiro futuro.
- Validade própria de combo avulso (definido: combo não vence; só plano tem prazo/ciclo).
- Ciclo de assinatura diferente de mensal (trimestral etc.) — schema permite estender o `check` de
  `ciclo` depois, sem redesenho.

## 7. Testes

**Puros:** `canManageProdutos` (mesmas 2 combinações de `canManageTerceiros`); validação do molde
de atributos (chave vazia, chave duplicada, tipo inválido); validação da forma de item de
combo/plano (quantidade ≤ 0, `tipo_item` sem o id correspondente).

**Integração:** criar categoria → criar produto com atributos conforme o molde → editar produto
trocando um valor → soft-delete; criar combo com 2 itens → soft-delete → aparece na lixeira como
`combo` → restaura; criar plano `pacote_fechado` (com `validade_dias`) e um `assinatura` (com
`ciclo`) → o `check` do banco rejeita um plano com os dois campos preenchidos ou nenhum; apagar
categoria em uso falha com mensagem amigável, apagar categoria sem uso funciona.

**Componente:** formulário de produto muda os campos exibidos ao trocar de categoria (molde
diferente); repetidor de itens de combo soma/atualiza a referência de preço ao adicionar/remover
linha.
