# Módulo Produtos — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Catálogo comercial (categorias com molde de atributos, produtos, combos, planos) num grupo de menu novo "Produtos", master-only, com CRUD completo.

**Architecture:** Categoria carrega um "molde" de atributos (JSONB); produto guarda valores conforme o molde (JSONB); combo agrupa produtos com quantidade; plano agrupa produtos e/ou combos com quantidade, mais tipo de cobrança (pacote fechado com validade, ou assinatura com ciclo). Um componente compartilhado (`ItemRepetidor`) monta a lista de itens de combo e plano. Lixeira e auditoria reaproveitam o mecanismo genérico já existente.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, Neon Postgres sem ORM, vitest (node + jsdom).

**Spec:** [docs/superpowers/specs/2026-08-08-modulo-produtos-design.md](../specs/2026-08-08-modulo-produtos-design.md) (commit `c34d5c7`)

## Global Constraints

- `npx tsc --noEmit` limpo e `npm test` passando ao fim de toda task. Base atual: **129 testes**.
- Colunas Postgres `numeric` voltam como **string** no driver `@neondatabase/serverless`; toda
  query que lê `preco` faz `preco::float8 as preco` pra vir como `number` — confirmado contra o
  banco real nesta sessão. Sem esse cast, `preco.toFixed(2)` na tela quebra em runtime.
- JSONB (`atributos_molde`, `atributos`, `json_agg(...)`) já volta parseado como objeto/array JS —
  também confirmado contra o banco real, sem parsing manual necessário.
- `sql.transaction([...])` não é interativo: todo id necessário dentro dela nasce antes, com
  `randomUUID()` (mesmo padrão de `insertCredential`/`createUserComPessoa`).
- Autorização: `requireMaster()` nas rotas/actions; `canManageProdutos()` só decide visibilidade no
  menu (cosmético — mesmo padrão de `canManageTerceiros`).
- Identificadores em português. Sem dependência nova, sem env var nova.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `db/migrations/006_produtos.sql` (novo) | 6 tabelas: categorias_produto, produtos, combos, combo_itens, planos, plano_itens. |
| `lib/types.ts` (modificar) | Tipos de categoria/produto/combo/plano/itens. |
| `lib/authz.ts` (modificar) | `canManageProdutos()`. |
| `lib/produtos-form.ts` (novo) | Toda leitura/validação de `FormData` e JSON de itens — puro, sem I/O. |
| `lib/db/categorias-produto.ts` (novo) | CRUD de categoria. |
| `lib/db/produtos.ts` (novo) | CRUD de produto. |
| `lib/db/combos.ts` (novo) | CRUD de combo + itens. |
| `lib/db/planos.ts` (novo) | CRUD de plano + itens. |
| `components/ItemRepetidor.tsx` (novo) | Repetidor de itens (produto/combo + quantidade), usado por combo e plano. |
| `components/CategoriaClient.tsx`, `ProdutoClient.tsx`, `ComboClient.tsx`, `PlanoClient.tsx` (novos) | Grid + form + modal de cada entidade. |
| `app/(app)/produtos/categorias/`, `app/(app)/produtos/`, `app/(app)/produtos/combos/`, `app/(app)/produtos/planos/` (novos) | `page.tsx` + `actions.ts` de cada rota. |
| `lib/db/queries.ts`, `lib/db/audit.ts`, `components/RestoreButton.tsx`, `components/PurgeButton.tsx`, `app/(app)/admin/lixeira/{actions,page}.tsx` (modificar) | Lixeira/auditoria ganham `'produto' | 'combo' | 'plano'`. |
| `components/Sidebar.tsx` (modificar) | Grupo de topo novo "Produtos". |

---

## Task 1: Migration, tipos e permissão

**Files:**
- Create: `db/migrations/006_produtos.sql`
- Modify: `lib/types.ts`, `lib/authz.ts`, `tests/authz.test.ts`

**Interfaces:**
- Produces: schema das 6 tabelas; tipos `TipoAtributo`, `AtributoMolde`, `CategoriaProduto`,
  `ValorAtributo`, `Produto`, `DadosProduto`, `TipoItemPedido`, `ItemEntrada`, `ItemResolvido`,
  `Combo`, `DadosCombo`, `TipoCobranca`, `Plano`, `DadosPlano`; `canManageProdutos(actor): boolean`.

- [ ] **Step 1: Escrever a migration**

Criar `db/migrations/006_produtos.sql`:

```sql
create table categorias_produto (
  id                uuid primary key default gen_random_uuid(),
  nome              text not null unique,
  unidade_consumo   text,
  -- cada item: {chave, rotulo, tipo: numero|texto|booleano, obrigatorio}. `tipo` é
  -- texto livre aqui dentro (vive no jsonb); os 3 valores aceitos são validados em
  -- código (lib/produtos-form.ts), não por enum do banco.
  atributos_molde   jsonb not null default '[]',
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

- [ ] **Step 2: Aplicar**

```bash
npm run migrate
```

Esperado: `+ aplicando 006_produtos.sql...` seguido de sucesso.

- [ ] **Step 3: Acrescentar os tipos em `lib/types.ts`**

```ts
export type TipoAtributo = 'numero' | 'texto' | 'booleano';

export type AtributoMolde = {
  chave: string;
  rotulo: string;
  tipo: TipoAtributo;
  obrigatorio: boolean;
};

export type CategoriaProduto = {
  id: string;
  nome: string;
  unidade_consumo: string | null;
  atributos_molde: AtributoMolde[];
  ativo: boolean;
};

export type ValorAtributo = string | number | boolean;

export type Produto = {
  id: string;
  categoria_id: string;
  nome: string;
  descricao: string | null;
  atributos: Record<string, ValorAtributo>;
  preco: number;
  ativo: boolean;
  created_at: string;
};

export type DadosProduto = {
  categoria_id: string;
  nome: string;
  descricao: string | null;
  atributos: Record<string, ValorAtributo>;
  preco: number;
  ativo: boolean;
};

export type TipoItemPedido = 'produto' | 'combo';

/** O que o `ItemRepetidor` produz e o que as actions de combo/plano leem do formulário. */
export type ItemEntrada = { tipo: TipoItemPedido; valor: string; quantidade: number };

/** Item já resolvido com nome/estado do produto ou combo referenciado, pra exibição. */
export type ItemResolvido = {
  tipo: TipoItemPedido;
  valor: string;
  nome: string;
  quantidade: number;
  ativo: boolean;
};

export type Combo = {
  id: string;
  nome: string;
  descricao: string | null;
  preco: number;
  ativo: boolean;
  created_at: string;
  itens: ItemResolvido[];
};

export type DadosCombo = {
  nome: string;
  descricao: string | null;
  preco: number;
  ativo: boolean;
  itens: ItemEntrada[];
};

export type TipoCobranca = 'pacote_fechado' | 'assinatura';

export type Plano = {
  id: string;
  nome: string;
  descricao: string | null;
  tipo_cobranca: TipoCobranca;
  validade_dias: number | null;
  ciclo: 'mensal' | null;
  preco: number;
  ativo: boolean;
  created_at: string;
  itens: ItemResolvido[];
};

export type DadosPlano = {
  nome: string;
  descricao: string | null;
  tipo_cobranca: TipoCobranca;
  validade_dias: number | null;
  ciclo: 'mensal' | null;
  preco: number;
  ativo: boolean;
  itens: ItemEntrada[];
};
```

- [ ] **Step 4: `canManageProdutos` — teste primeiro**

Em `tests/authz.test.ts`, acrescentar `canManageProdutos` ao import de `@/lib/authz` e, dentro do
`describe('administração', ...)` já existente, mais um `it`:

```ts
  it('só master gerencia produtos', () => {
    expect(canManageProdutos(master)).toBe(true);
    expect(canManageProdutos(dono)).toBe(false);
  });
```

Rodar `npx vitest run tests/authz.test.ts` → falha (`canManageProdutos is not defined`).

- [ ] **Step 5: Implementar em `lib/authz.ts`**

Logo abaixo de `canManageTerceiros`:

```ts
export const canManageProdutos = (actor: Actor) => isMaster(actor);
```

- [ ] **Step 6: Conferir e commitar**

```bash
npx vitest run tests/authz.test.ts
npx tsc --noEmit
npm test
```

Esperado: **130 testes** (129 + 1).

```bash
git add db/migrations/006_produtos.sql lib/types.ts lib/authz.ts tests/authz.test.ts
git commit -m "Cria schema do modulo Produtos e canManageProdutos"
```

---

## Task 2: Validação de formulário (`lib/produtos-form.ts`)

**Files:**
- Create: `lib/produtos-form.ts`
- Test: `tests/produtos-form.test.ts`

**Interfaces:**
- Consumes: tipos da Task 1.
- Produces:
  - `lerMoldeAtributos(json: string): AtributoMolde[] | { error: string }`
  - `lerDadosCategoria(fd: FormData): Omit<CategoriaProduto, 'id'> | { error: string }`
  - `lerDadosProduto(fd: FormData, molde: AtributoMolde[]): DadosProduto | { error: string }`
  - `lerItensCombo(json: string): ItemEntrada[] | { error: string }` (só aceita `tipo: 'produto'`)
  - `lerItensPlano(json: string): ItemEntrada[] | { error: string }` (aceita os dois tipos)
  - `lerDadosCombo(fd: FormData): DadosCombo | { error: string }`
  - `lerDadosPlano(fd: FormData): DadosPlano | { error: string }`

- [ ] **Step 1: Testes**

Criar `tests/produtos-form.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  lerDadosCombo, lerDadosPlano, lerDadosProduto, lerItensCombo, lerItensPlano, lerMoldeAtributos,
} from '@/lib/produtos-form';
import type { AtributoMolde } from '@/lib/types';

function fd(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

describe('lerMoldeAtributos', () => {
  it('chave vazia retorna erro', () => {
    const r = lerMoldeAtributos(JSON.stringify([{ chave: '  ', rotulo: 'X', tipo: 'texto', obrigatorio: false }]));
    expect(r).toEqual({ error: 'Todo atributo precisa de uma chave.' });
  });

  it('chave duplicada retorna erro', () => {
    const item = { chave: 'qtd', rotulo: 'Qtd', tipo: 'numero', obrigatorio: false };
    const r = lerMoldeAtributos(JSON.stringify([item, item]));
    expect(r).toEqual({ error: 'Chave "qtd" duplicada no molde.' });
  });

  it('molde válido retorna o array', () => {
    const r = lerMoldeAtributos(JSON.stringify([
      { chave: 'qtd_cameras', rotulo: 'Câmeras', tipo: 'numero', obrigatorio: true },
    ]));
    expect(r).toEqual([{ chave: 'qtd_cameras', rotulo: 'Câmeras', tipo: 'numero', obrigatorio: true }]);
  });
});

const molde: AtributoMolde[] = [
  { chave: 'qtd_cameras', rotulo: 'Câmeras', tipo: 'numero', obrigatorio: true },
  { chave: 'inclui_edicao', rotulo: 'Inclui edição', tipo: 'booleano', obrigatorio: false },
];

describe('lerDadosProduto', () => {
  it('nome vazio retorna erro', () => {
    const r = lerDadosProduto(fd({ nome: '', categoriaId: 'c1', preco: '10' }), molde);
    expect(r).toEqual({ error: 'Informe o nome.' });
  });

  it('preço inválido retorna erro', () => {
    const r = lerDadosProduto(fd({ nome: 'Gravação', categoriaId: 'c1', preco: 'abc' }), molde);
    expect(r).toEqual({ error: 'Preço inválido.' });
  });

  it('atributo numérico obrigatório faltando retorna erro', () => {
    const r = lerDadosProduto(fd({ nome: 'Gravação', categoriaId: 'c1', preco: '399' }), molde);
    expect(r).toEqual({ error: 'Informe "Câmeras".' });
  });

  it('lê atributo numérico e booleano (checkbox marcado)', () => {
    const dados = fd({
      nome: 'Gravação', categoriaId: 'c1', preco: '399', attr_qtd_cameras: '3',
    });
    dados.set('attr_inclui_edicao', 'on');
    const r = lerDadosProduto(dados, molde);
    expect('error' in r).toBe(false);
    if (!('error' in r)) {
      expect(r.atributos).toEqual({ qtd_cameras: 3, inclui_edicao: true });
      expect(r.preco).toBe(399);
    }
  });
});

describe('lerItensCombo', () => {
  it('lista vazia retorna erro', () => {
    expect(lerItensCombo('[]')).toEqual({ error: 'Adicione pelo menos um item.' });
  });

  it('item com tipo combo é rejeitado (combo só aceita produto)', () => {
    const r = lerItensCombo(JSON.stringify([{ tipo: 'combo', valor: 'x', quantidade: 1 }]));
    expect(r).toEqual({ error: 'Itens do combo inválidos.' });
  });

  it('itens válidos retornam o array', () => {
    const r = lerItensCombo(JSON.stringify([{ tipo: 'produto', valor: 'p1', quantidade: 4 }]));
    expect(r).toEqual([{ tipo: 'produto', valor: 'p1', quantidade: 4 }]);
  });
});

describe('lerItensPlano', () => {
  it('aceita item tipo produto e tipo combo misturados', () => {
    const r = lerItensPlano(JSON.stringify([
      { tipo: 'produto', valor: 'p1', quantidade: 2 },
      { tipo: 'combo', valor: 'c1', quantidade: 1 },
    ]));
    expect(r).toEqual([
      { tipo: 'produto', valor: 'p1', quantidade: 2 },
      { tipo: 'combo', valor: 'c1', quantidade: 1 },
    ]);
  });

  it('quantidade zero retorna erro', () => {
    const r = lerItensPlano(JSON.stringify([{ tipo: 'produto', valor: 'p1', quantidade: 0 }]));
    expect(r).toEqual({ error: 'Quantidade precisa ser maior que zero.' });
  });
});

describe('lerDadosCombo', () => {
  it('nome vazio retorna erro', () => {
    const r = lerDadosCombo(fd({ nome: '', preco: '10', itens: '[{"tipo":"produto","valor":"p1","quantidade":1}]' }));
    expect(r).toEqual({ error: 'Informe o nome.' });
  });
});

describe('lerDadosPlano', () => {
  it('tipo de cobrança inválido retorna erro', () => {
    const r = lerDadosPlano(fd({ nome: 'X', tipoCobranca: 'errado', preco: '10', itens: '[]' }));
    expect(r).toEqual({ error: 'Escolha o tipo de cobrança.' });
  });

  it('pacote_fechado sem validade retorna erro', () => {
    const r = lerDadosPlano(fd({
      nome: 'X', tipoCobranca: 'pacote_fechado', preco: '10',
      itens: '[{"tipo":"produto","valor":"p1","quantidade":1}]',
    }));
    expect(r).toEqual({ error: 'Informe a validade em dias.' });
  });

  it('assinatura monta ciclo mensal automaticamente', () => {
    const r = lerDadosPlano(fd({
      nome: 'X', tipoCobranca: 'assinatura', preco: '1500',
      itens: '[{"tipo":"produto","valor":"p1","quantidade":1}]',
    }));
    expect('error' in r).toBe(false);
    if (!('error' in r)) {
      expect(r.ciclo).toBe('mensal');
      expect(r.validade_dias).toBeNull();
    }
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx vitest run tests/produtos-form.test.ts
```

Esperado: FAIL — `Cannot find module '@/lib/produtos-form'`.

- [ ] **Step 3: Implementar**

Criar `lib/produtos-form.ts`:

```ts
import type {
  AtributoMolde, CategoriaProduto, DadosCombo, DadosPlano, DadosProduto, ItemEntrada,
  TipoAtributo, ValorAtributo,
} from '@/lib/types';

const TIPOS_ATRIBUTO: TipoAtributo[] = ['numero', 'texto', 'booleano'];

export function lerMoldeAtributos(json: string): AtributoMolde[] | { error: string } {
  let bruto: unknown;
  try {
    bruto = JSON.parse(json);
  } catch {
    return { error: 'Molde de atributos inválido.' };
  }
  if (!Array.isArray(bruto)) return { error: 'Molde de atributos inválido.' };

  const chaves = new Set<string>();
  const molde: AtributoMolde[] = [];
  for (const item of bruto) {
    if (
      typeof item !== 'object' || item === null ||
      typeof (item as Record<string, unknown>).chave !== 'string' ||
      typeof (item as Record<string, unknown>).rotulo !== 'string' ||
      typeof (item as Record<string, unknown>).tipo !== 'string' ||
      typeof (item as Record<string, unknown>).obrigatorio !== 'boolean'
    ) {
      return { error: 'Molde de atributos inválido.' };
    }
    const { chave, rotulo, tipo, obrigatorio } = item as {
      chave: string; rotulo: string; tipo: string; obrigatorio: boolean;
    };
    const chaveNormalizada = chave.trim();
    if (!chaveNormalizada) return { error: 'Todo atributo precisa de uma chave.' };
    if (chaves.has(chaveNormalizada)) {
      return { error: `Chave "${chaveNormalizada}" duplicada no molde.` };
    }
    if (!TIPOS_ATRIBUTO.includes(tipo as TipoAtributo)) return { error: `Tipo "${tipo}" inválido.` };
    chaves.add(chaveNormalizada);
    molde.push({
      chave: chaveNormalizada, rotulo: rotulo.trim() || chaveNormalizada,
      tipo: tipo as TipoAtributo, obrigatorio,
    });
  }
  return molde;
}

export function lerDadosCategoria(
  fd: FormData,
): Omit<CategoriaProduto, 'id'> | { error: string } {
  const nome = String(fd.get('nome') ?? '').trim();
  if (!nome) return { error: 'Informe o nome.' };

  const molde = lerMoldeAtributos(String(fd.get('atributosMolde') ?? '[]'));
  if ('error' in molde) return molde;

  const unidade = String(fd.get('unidadeConsumo') ?? '').trim();
  return { nome, unidade_consumo: unidade || null, atributos_molde: molde, ativo: fd.get('ativo') === 'on' };
}

function lerValorAtributo(
  fd: FormData, campo: AtributoMolde,
): ValorAtributo | null | { error: string } {
  const chave = `attr_${campo.chave}`;
  if (campo.tipo === 'booleano') return fd.get(chave) === 'on';

  const bruto = String(fd.get(chave) ?? '').trim();
  if (!bruto) {
    if (campo.obrigatorio) return { error: `Informe "${campo.rotulo}".` };
    return null;
  }
  if (campo.tipo === 'numero') {
    const num = Number(bruto);
    if (Number.isNaN(num)) return { error: `"${campo.rotulo}" precisa ser um número.` };
    return num;
  }
  return bruto;
}

function lerPreco(fd: FormData): number | { error: string } {
  const preco = Number(String(fd.get('preco') ?? '').replace(',', '.'));
  if (Number.isNaN(preco) || preco < 0) return { error: 'Preço inválido.' };
  return preco;
}

export function lerDadosProduto(
  fd: FormData, molde: AtributoMolde[],
): DadosProduto | { error: string } {
  const nome = String(fd.get('nome') ?? '').trim();
  if (!nome) return { error: 'Informe o nome.' };

  const categoria_id = String(fd.get('categoriaId') ?? '');
  if (!categoria_id) return { error: 'Escolha a categoria.' };

  const preco = lerPreco(fd);
  if (typeof preco === 'object') return preco;

  const atributos: Record<string, ValorAtributo> = {};
  for (const campo of molde) {
    const valor = lerValorAtributo(fd, campo);
    if (valor !== null && typeof valor === 'object' && 'error' in valor) return valor;
    if (valor !== null) atributos[campo.chave] = valor;
  }

  const descricao = String(fd.get('descricao') ?? '').trim();
  return {
    categoria_id, nome, descricao: descricao || null, atributos, preco,
    ativo: fd.get('ativo') === 'on',
  };
}

function lerItens(json: string, tiposAceitos: ItemEntrada['tipo'][]): ItemEntrada[] | { error: string } {
  let bruto: unknown;
  try {
    bruto = JSON.parse(json);
  } catch {
    return { error: 'Itens inválidos.' };
  }
  if (!Array.isArray(bruto) || bruto.length === 0) return { error: 'Adicione pelo menos um item.' };

  const itens: ItemEntrada[] = [];
  for (const item of bruto) {
    if (
      typeof item !== 'object' || item === null ||
      typeof (item as Record<string, unknown>).tipo !== 'string' ||
      typeof (item as Record<string, unknown>).valor !== 'string' ||
      typeof (item as Record<string, unknown>).quantidade !== 'number'
    ) {
      return { error: 'Itens inválidos.' };
    }
    const { tipo, valor, quantidade } = item as ItemEntrada;
    if (!tiposAceitos.includes(tipo)) return { error: 'Itens inválidos.' };
    if (quantidade <= 0) return { error: 'Quantidade precisa ser maior que zero.' };
    itens.push({ tipo, valor, quantidade });
  }
  return itens;
}

export function lerItensCombo(json: string): ItemEntrada[] | { error: string } {
  const itens = lerItens(json, ['produto']);
  return 'error' in itens && itens.error === 'Itens inválidos.'
    ? { error: 'Itens do combo inválidos.' }
    : itens;
}

export function lerItensPlano(json: string): ItemEntrada[] | { error: string } {
  return lerItens(json, ['produto', 'combo']);
}

export function lerDadosCombo(fd: FormData): DadosCombo | { error: string } {
  const nome = String(fd.get('nome') ?? '').trim();
  if (!nome) return { error: 'Informe o nome.' };

  const preco = lerPreco(fd);
  if (typeof preco === 'object') return preco;

  const itens = lerItensCombo(String(fd.get('itens') ?? '[]'));
  if ('error' in itens) return itens;

  const descricao = String(fd.get('descricao') ?? '').trim();
  return { nome, descricao: descricao || null, preco, ativo: fd.get('ativo') === 'on', itens };
}

export function lerDadosPlano(fd: FormData): DadosPlano | { error: string } {
  const nome = String(fd.get('nome') ?? '').trim();
  if (!nome) return { error: 'Informe o nome.' };

  const tipo_cobranca = String(fd.get('tipoCobranca') ?? '');
  if (tipo_cobranca !== 'pacote_fechado' && tipo_cobranca !== 'assinatura') {
    return { error: 'Escolha o tipo de cobrança.' };
  }

  let validade_dias: number | null = null;
  let ciclo: 'mensal' | null = null;
  if (tipo_cobranca === 'pacote_fechado') {
    const bruto = String(fd.get('validadeDias') ?? '').trim();
    const num = Number(bruto);
    if (!bruto || Number.isNaN(num) || num <= 0) return { error: 'Informe a validade em dias.' };
    validade_dias = num;
  } else {
    ciclo = 'mensal';
  }

  const preco = lerPreco(fd);
  if (typeof preco === 'object') return preco;

  const itens = lerItensPlano(String(fd.get('itens') ?? '[]'));
  if ('error' in itens) return itens;

  const descricao = String(fd.get('descricao') ?? '').trim();
  return {
    nome, descricao: descricao || null, tipo_cobranca, validade_dias, ciclo, preco,
    ativo: fd.get('ativo') === 'on', itens,
  };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
npx vitest run tests/produtos-form.test.ts
```

Esperado: PASS, 16 testes.

- [ ] **Step 5: Conferir e commitar**

```bash
npx tsc --noEmit
npm test
```

Esperado: **146 testes** (130 + 16).

```bash
git add lib/produtos-form.ts tests/produtos-form.test.ts
git commit -m "Adiciona validacao de formulario do modulo Produtos"
```

---

## Task 3: Categorias — dados, tela e rota

**Files:**
- Create: `lib/db/categorias-produto.ts`, `components/CategoriaClient.tsx`,
  `app/(app)/produtos/categorias/actions.ts`, `app/(app)/produtos/categorias/page.tsx`
- Test: `tests/CategoriaClient.test.tsx`, acrescentar em `tests/integracao.test.ts`

**Interfaces:**
- Consumes: `lerDadosCategoria` (Task 2); `sql`, `NotFoundError`, `assertUuid` (infra existente).
- Produces: `listCategorias`, `getCategoria`, `createCategoria`, `updateCategoria`,
  `deleteCategoria`, `CategoriaEmUsoError` em `lib/db/categorias-produto.ts`; componente
  `CategoriaClient` com `export type CategoriaState = { error?: string; ok?: string }`.

- [ ] **Step 1: Teste de integração que falha**

Em `tests/integracao.test.ts`, acrescentar dentro do describe principal (mesmo ponto das Tasks
anteriores da rodada de clientes/fornecedores — depois do último `it`, antes do `});` final):

```ts
  it('categoria: cria, edita e apaga quando não está em uso', async () => {
    const cat = await import('@/lib/db/categorias-produto');

    const id = await cat.createCategoria({
      nome: `${marca}-categoria`, unidade_consumo: 'gravação',
      atributos_molde: [{ chave: 'qtd_cameras', rotulo: 'Câmeras', tipo: 'numero', obrigatorio: true }],
      ativo: true,
    });

    const criada = await cat.getCategoria(id);
    expect(criada?.nome).toBe(`${marca}-categoria`);
    expect(criada?.atributos_molde).toHaveLength(1);

    await cat.updateCategoria(id, { ...criada!, nome: `${marca}-categoria-editada` });
    expect((await cat.getCategoria(id))?.nome).toBe(`${marca}-categoria-editada`);

    await cat.deleteCategoria(id);
    expect(await cat.getCategoria(id)).toBeNull();
  });
```

Este teste é **autocontido** (não depende de `produtos`, que só nasce na Task 4) — assim a suíte
fica verde ao fim desta task, sem depender da task seguinte. O comportamento "categoria em uso
bloqueia exclusão" é testado na Task 4, junto com `produtos.ts` (é lá que ele passa a fazer
sentido: testar uma regra que depende de uma tabela que ainda não existe seria testar código que
não existe).

Rodar `npx vitest run tests/integracao.test.ts` → falha (`@/lib/db/categorias-produto` inexistente).

- [ ] **Step 2: Implementar `lib/db/categorias-produto.ts`**

```ts
import { sql } from '@/lib/db/client';
import { NotFoundError } from '@/lib/authz';
import { assertUuid } from '@/lib/validation';
import type { AtributoMolde, CategoriaProduto } from '@/lib/types';

export async function listCategorias(): Promise<CategoriaProduto[]> {
  return (await sql`
    select id, nome, unidade_consumo, atributos_molde, ativo
      from categorias_produto order by nome`) as CategoriaProduto[];
}

export async function getCategoria(id: string): Promise<CategoriaProduto | null> {
  assertUuid(id);
  const rows = (await sql`
    select id, nome, unidade_consumo, atributos_molde, ativo
      from categorias_produto where id = ${id}`) as CategoriaProduto[];
  return rows[0] ?? null;
}

type DadosCategoria = { nome: string; unidade_consumo: string | null; atributos_molde: AtributoMolde[]; ativo: boolean };

export async function createCategoria(dados: DadosCategoria): Promise<string> {
  const rows = (await sql`
    insert into categorias_produto (nome, unidade_consumo, atributos_molde, ativo)
    values (${dados.nome}, ${dados.unidade_consumo}, ${JSON.stringify(dados.atributos_molde)}::jsonb, ${dados.ativo})
    returning id`) as { id: string }[];
  return rows[0].id;
}

export async function updateCategoria(id: string, dados: DadosCategoria): Promise<void> {
  assertUuid(id);
  const rows = (await sql`
    update categorias_produto
       set nome = ${dados.nome}, unidade_consumo = ${dados.unidade_consumo},
           atributos_molde = ${JSON.stringify(dados.atributos_molde)}::jsonb, ativo = ${dados.ativo},
           updated_at = now()
     where id = ${id}
     returning id`) as { id: string }[];
  if (!rows[0]) throw new NotFoundError();
}

export class CategoriaEmUsoError extends Error {
  constructor(qtd: number) {
    super(`Categoria em uso por ${qtd} produto${qtd === 1 ? '' : 's'}.`);
  }
}

export async function deleteCategoria(id: string): Promise<void> {
  assertUuid(id);
  if (!(await getCategoria(id))) throw new NotFoundError();
  const [{ n }] = (await sql`
    select count(*)::int as n from produtos where categoria_id = ${id}`) as { n: number }[];
  if (n > 0) throw new CategoriaEmUsoError(n);
  await sql`delete from categorias_produto where id = ${id}`;
}
```

- [ ] **Step 3: Rodar e confirmar que passa**

```bash
npx vitest run tests/integracao.test.ts
```

Esperado: PASS, incluindo o novo `it` de categoria.

- [ ] **Step 4: Tela — teste jsdom que falha**

Criar `tests/CategoriaClient.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { CategoriaClient } from '@/components/CategoriaClient';
import type { CategoriaProduto } from '@/lib/types';

const categoria: CategoriaProduto = {
  id: '11111111-1111-1111-1111-111111111111', nome: 'Gravação', unidade_consumo: 'gravação',
  atributos_molde: [{ chave: 'qtd_cameras', rotulo: 'Câmeras', tipo: 'numero', obrigatorio: true }],
  ativo: true,
};

const criar = vi.fn();
const salvar = vi.fn();
const apagar = vi.fn();

afterEach(() => cleanup());

describe('CategoriaClient', () => {
  it('lista categorias e mostra a quantidade de atributos', () => {
    render(<CategoriaClient itens={[categoria]} criar={criar} salvar={salvar} apagar={apagar} />);
    expect(screen.getByText('Gravação')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '1' })).toBeInTheDocument();
  });

  it('adicionar linha no molde do formulário novo cria um campo de chave', () => {
    render(<CategoriaClient itens={[]} criar={criar} salvar={salvar} apagar={apagar} />);
    fireEvent.click(screen.getByText('+ Adicionar atributo'));
    expect(screen.getByText('Chave')).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Implementar `components/CategoriaClient.tsx`**

```tsx
'use client';

import { useActionState, useEffect, useState } from 'react';
import type { AtributoMolde, CategoriaProduto, TipoAtributo } from '@/lib/types';

export type CategoriaState = { error?: string; ok?: string };
const inicial: CategoriaState = {};
type Acao = (prev: CategoriaState, fd: FormData) => Promise<CategoriaState>;

function MoldeEditor({ molde, onChange }: { molde: AtributoMolde[]; onChange: (m: AtributoMolde[]) => void }) {
  function atualizar(i: number, campo: Partial<AtributoMolde>) {
    onChange(molde.map((m, idx) => (idx === i ? { ...m, ...campo } : m)));
  }
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">Atributos desta categoria</legend>
      {molde.map((m, i) => (
        <div key={i} className="grid gap-2 sm:grid-cols-5 items-end">
          <label className="block space-y-1">
            <span className="text-xs">Chave</span>
            <input className="input" value={m.chave} onChange={(e) => atualizar(i, { chave: e.target.value })} />
          </label>
          <label className="block space-y-1">
            <span className="text-xs">Rótulo</span>
            <input className="input" value={m.rotulo} onChange={(e) => atualizar(i, { rotulo: e.target.value })} />
          </label>
          <label className="block space-y-1">
            <span className="text-xs">Tipo</span>
            <select className="input" value={m.tipo} onChange={(e) => atualizar(i, { tipo: e.target.value as TipoAtributo })}>
              <option value="texto">Texto</option>
              <option value="numero">Número</option>
              <option value="booleano">Sim/Não</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={m.obrigatorio} onChange={(e) => atualizar(i, { obrigatorio: e.target.checked })} />
            Obrigatório
          </label>
          <button type="button" className="btn" onClick={() => onChange(molde.filter((_, idx) => idx !== i))}>
            Remover
          </button>
        </div>
      ))}
      <button
        type="button" className="btn"
        onClick={() => onChange([...molde, { chave: '', rotulo: '', tipo: 'texto', obrigatorio: false }])}
      >
        + Adicionar atributo
      </button>
    </fieldset>
  );
}

function CamposComuns({
  item, molde, onMolde,
}: { item?: CategoriaProduto; molde: AtributoMolde[]; onMolde: (m: AtributoMolde[]) => void }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-sm">Nome</span>
          <input name="nome" className="input" defaultValue={item?.nome ?? ''} required />
        </label>
        <label className="block space-y-1">
          <span className="text-sm">Unidade de consumo</span>
          <input name="unidadeConsumo" className="input" defaultValue={item?.unidade_consumo ?? ''} placeholder="ex.: gravação, corte" />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="ativo" defaultChecked={item?.ativo ?? true} />
          Ativa
        </label>
      </div>
      <MoldeEditor molde={molde} onChange={onMolde} />
      <input type="hidden" name="atributosMolde" value={JSON.stringify(molde)} />
    </>
  );
}

function FormularioNovo({ criar }: { criar: Acao }) {
  const [state, action, pending] = useActionState(criar, inicial);
  const [molde, setMolde] = useState<AtributoMolde[]>([]);

  useEffect(() => {
    if (state.ok) setMolde([]);
  }, [state.ok]);

  return (
    <details className="glass p-5">
      <summary className="cursor-pointer font-semibold">Nova categoria</summary>
      <form action={action} className="space-y-4 mt-4">
        <CamposComuns molde={molde} onMolde={setMolde} />
        {state.error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{state.error}</p>}
        {state.ok && <p className="text-sm" style={{ color: 'var(--ok)' }}>{state.ok}</p>}
        <button className="btn btn-primary" disabled={pending}>Cadastrar</button>
      </form>
    </details>
  );
}

function ModalEdicao({
  item, salvar, apagar, onFechar,
}: { item: CategoriaProduto; salvar: Acao; apagar: (id: string) => Promise<{ error?: string }>; onFechar: () => void }) {
  const [state, action, pending] = useActionState(salvar, inicial);
  const [molde, setMolde] = useState<AtributoMolde[]>(item.atributos_molde);
  const [erroApagar, setErroApagar] = useState<string | null>(null);

  useEffect(() => {
    if (state.ok) onFechar();
  }, [state.ok, onFechar]);

  async function apagarClique() {
    if (!confirm('Apagar esta categoria?')) return;
    const r = await apagar(item.id);
    if (r.error) setErroApagar(r.error);
    else onFechar();
  }

  return (
    <div className="glass p-5 space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="font-semibold flex-1">{item.nome}</h2>
        <button type="button" className="btn" onClick={onFechar}>Fechar</button>
      </div>
      <form action={action} className="space-y-4">
        <input type="hidden" name="id" value={item.id} />
        <CamposComuns item={item} molde={molde} onMolde={setMolde} />
        {state.error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{state.error}</p>}
        <button className="btn btn-primary" disabled={pending}>Salvar</button>
      </form>
      <button type="button" className="btn btn-danger" onClick={() => void apagarClique()}>Apagar</button>
      {erroApagar && <p className="text-sm" style={{ color: 'var(--danger)' }}>{erroApagar}</p>}
    </div>
  );
}

export function CategoriaClient({
  itens, criar, salvar, apagar,
}: { itens: CategoriaProduto[]; criar: Acao; salvar: Acao; apagar: (id: string) => Promise<{ error?: string }> }) {
  const [aberto, setAberto] = useState<CategoriaProduto | null>(null);
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Categorias de Produto</h1>
      <FormularioNovo criar={criar} />
      <table className="w-full text-sm">
        <thead>
          <tr style={{ color: 'var(--text-dim)' }}>
            <th className="text-left p-2">Nome</th>
            <th className="text-left p-2">Unidade</th>
            <th className="text-left p-2">Atributos</th>
            <th className="text-left p-2">Ativa</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((c) => (
            <tr key={c.id} className="cursor-pointer" onClick={() => setAberto(c)}>
              <td className="p-2">{c.nome}</td>
              <td className="p-2">{c.unidade_consumo ?? '—'}</td>
              <td className="p-2">{c.atributos_molde.length}</td>
              <td className="p-2">{c.ativo ? 'Sim' : 'Não'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {itens.length === 0 && <p className="text-sm" style={{ color: 'var(--text-dim)' }}>Nenhuma categoria cadastrada.</p>}
      {aberto && <ModalEdicao key={aberto.id} item={aberto} salvar={salvar} apagar={apagar} onFechar={() => setAberto(null)} />}
    </div>
  );
}
```

- [ ] **Step 6: Rodar teste jsdom**

```bash
npx vitest run tests/CategoriaClient.test.tsx
```

Esperado: PASS, 2 testes.

- [ ] **Step 7: Rota**

Criar `app/(app)/produtos/categorias/actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { requireMaster } from '@/lib/auth/guards';
import { audit } from '@/lib/db/audit';
import {
  createCategoria, deleteCategoria, updateCategoria, CategoriaEmUsoError,
} from '@/lib/db/categorias-produto';
import { lerDadosCategoria } from '@/lib/produtos-form';
import { isUuid } from '@/lib/validation';
import type { CategoriaState } from '@/components/CategoriaClient';

const ROTA = '/produtos/categorias';

export async function criarCategoria(_prev: CategoriaState, formData: FormData): Promise<CategoriaState> {
  const actor = await requireMaster();
  const dados = lerDadosCategoria(formData);
  if ('error' in dados) return dados;

  const id = await createCategoria(dados);
  await audit({ actorId: actor.id, action: 'create', entityType: 'categoria_produto', entityId: id });
  revalidatePath(ROTA);
  return { ok: 'Categoria cadastrada.' };
}

export async function salvarCategoria(_prev: CategoriaState, formData: FormData): Promise<CategoriaState> {
  const actor = await requireMaster();
  const id = String(formData.get('id') ?? '');
  if (!isUuid(id)) return { error: 'Categoria não encontrada.' };

  const dados = lerDadosCategoria(formData);
  if ('error' in dados) return dados;

  await updateCategoria(id, dados);
  await audit({ actorId: actor.id, action: 'update', entityType: 'categoria_produto', entityId: id });
  revalidatePath(ROTA);
  return { ok: 'Categoria atualizada.' };
}

export async function apagarCategoria(id: string): Promise<{ error?: string }> {
  const actor = await requireMaster();
  if (!isUuid(id)) return { error: 'Categoria não encontrada.' };

  try {
    await deleteCategoria(id);
  } catch (err) {
    if (err instanceof CategoriaEmUsoError) return { error: err.message };
    throw err;
  }
  await audit({ actorId: actor.id, action: 'delete', entityType: 'categoria_produto', entityId: id });
  revalidatePath(ROTA);
  return {};
}
```

Criar `app/(app)/produtos/categorias/page.tsx`:

```tsx
import { CategoriaClient } from '@/components/CategoriaClient';
import { requireMaster } from '@/lib/auth/guards';
import { listCategorias } from '@/lib/db/categorias-produto';
import { apagarCategoria, criarCategoria, salvarCategoria } from './actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function CategoriasProdutoPage() {
  await requireMaster();
  const itens = await listCategorias();
  return (
    <main className="p-4 md:p-6 max-w-5xl mx-auto">
      <CategoriaClient itens={itens} criar={criarCategoria} salvar={salvarCategoria} apagar={apagarCategoria} />
    </main>
  );
}
```

Em `lib/db/audit.ts`, acrescentar `'categoria_produto'` à união de `entityType` (hoje
`'credential' | 'room' | 'user' | 'cliente' | 'fornecedor'`) — sem isso o `audit({ ..., entityType: 'categoria_produto' })` acima nem compila.

- [ ] **Step 8: Conferir e commitar**

```bash
npx tsc --noEmit
npm test
```

Esperado: **149 testes** (146 + 1 de integração + 2 de `CategoriaClient.test.tsx`).

```bash
git add lib/db/categorias-produto.ts components/CategoriaClient.tsx "app/(app)/produtos/categorias" lib/db/audit.ts tests/CategoriaClient.test.tsx tests/integracao.test.ts
git commit -m "Adiciona CRUD de categoria de produto"
```

---

## Task 4: Produtos — dados, tela dinâmica e rota

**Files:**
- Create: `lib/db/produtos.ts`, `components/ProdutoClient.tsx`,
  `app/(app)/produtos/actions.ts`, `app/(app)/produtos/page.tsx`
- Test: `tests/ProdutoClient.test.tsx`, acrescentar em `tests/integracao.test.ts`

**Interfaces:**
- Consumes: `lerDadosProduto` (Task 2); `listCategorias`, `getCategoria`, `deleteCategoria`,
  `CategoriaEmUsoError` (Task 3).
- Produces: `listProdutos`, `getProduto`, `createProduto`, `updateProduto`, `softDeleteProduto` em
  `lib/db/produtos.ts`; componente `ProdutoClient`, `export type ProdutoState = { error?: string; ok?: string }`.

- [ ] **Step 1: Teste de integração que falha**

Mais um `it` em `tests/integracao.test.ts`, depois do adicionado na Task 3 — este cobre a regra
"categoria em uso não pode ser apagada" (seção 3 do spec), que só existe a partir de agora que
`produtos.ts` vai nascer:

```ts
  it('categoria em uso não pode ser apagada, mas libera depois que o produto é removido', async () => {
    const cat = await import('@/lib/db/categorias-produto');
    const prod = await import('@/lib/db/produtos');

    const categoriaId = await cat.createCategoria({
      nome: `${marca}-categoria-em-uso`, unidade_consumo: null, atributos_molde: [], ativo: true,
    });
    const produtoId = await prod.createProduto({
      categoria_id: categoriaId, nome: `${marca}-produto-em-uso`, descricao: null,
      atributos: {}, preco: 100, ativo: true,
    });

    await expect(cat.deleteCategoria(categoriaId)).rejects.toThrow('Categoria em uso por 1 produto.');

    await prod.softDeleteProduto(produtoId);
    await sql`delete from produtos where id = ${produtoId}`;
    await cat.deleteCategoria(categoriaId);
    expect(await cat.getCategoria(categoriaId)).toBeNull();
  });
```

Rodar `npx vitest run tests/integracao.test.ts` → falha (`@/lib/db/produtos` inexistente).

- [ ] **Step 2: Implementar `lib/db/produtos.ts`**

```ts
import { sql } from '@/lib/db/client';
import { NotFoundError } from '@/lib/authz';
import { assertUuid } from '@/lib/validation';
import type { DadosProduto, Produto } from '@/lib/types';

export async function listProdutos(): Promise<Produto[]> {
  return (await sql`
    select id, categoria_id, nome, descricao, atributos, preco::float8 as preco, ativo, created_at
      from produtos where deleted_at is null order by nome`) as Produto[];
}

export async function getProduto(id: string): Promise<Produto | null> {
  assertUuid(id);
  const rows = (await sql`
    select id, categoria_id, nome, descricao, atributos, preco::float8 as preco, ativo, created_at
      from produtos where id = ${id} and deleted_at is null`) as Produto[];
  return rows[0] ?? null;
}

export async function createProduto(dados: DadosProduto): Promise<string> {
  const rows = (await sql`
    insert into produtos (categoria_id, nome, descricao, atributos, preco, ativo)
    values (${dados.categoria_id}, ${dados.nome}, ${dados.descricao},
            ${JSON.stringify(dados.atributos)}::jsonb, ${dados.preco}, ${dados.ativo})
    returning id`) as { id: string }[];
  return rows[0].id;
}

export async function updateProduto(id: string, dados: DadosProduto): Promise<void> {
  assertUuid(id);
  const rows = (await sql`
    update produtos
       set categoria_id = ${dados.categoria_id}, nome = ${dados.nome}, descricao = ${dados.descricao},
           atributos = ${JSON.stringify(dados.atributos)}::jsonb, preco = ${dados.preco},
           ativo = ${dados.ativo}, updated_at = now()
     where id = ${id} and deleted_at is null
     returning id`) as { id: string }[];
  if (!rows[0]) throw new NotFoundError();
}

export async function softDeleteProduto(id: string): Promise<void> {
  assertUuid(id);
  const rows = (await sql`
    update produtos set deleted_at = now()
     where id = ${id} and deleted_at is null returning id`) as { id: string }[];
  if (!rows[0]) throw new NotFoundError();
}
```

- [ ] **Step 3: Rodar e confirmar que o teste do Step 1 passa**

```bash
npx vitest run tests/integracao.test.ts -t "categoria em uso"
```

Esperado: PASS.

- [ ] **Step 4: Teste jsdom que falha**

Criar `tests/ProdutoClient.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ProdutoClient } from '@/components/ProdutoClient';
import type { CategoriaProduto, Produto } from '@/lib/types';

const gravacao: CategoriaProduto = {
  id: 'aaaaaaaa-1111-1111-1111-111111111111', nome: 'Gravação', unidade_consumo: 'gravação',
  atributos_molde: [{ chave: 'qtd_cameras', rotulo: 'Câmeras', tipo: 'numero', obrigatorio: true }],
  ativo: true,
};
const corte: CategoriaProduto = {
  id: 'bbbbbbbb-2222-2222-2222-222222222222', nome: 'Corte', unidade_consumo: 'corte',
  atributos_molde: [], ativo: true,
};

const produto: Produto = {
  id: '11111111-1111-1111-1111-111111111111', categoria_id: gravacao.id, nome: 'Gravação 1h',
  descricao: null, atributos: { qtd_cameras: 3 }, preco: 399, ativo: true, created_at: '2026-08-08T00:00:00Z',
};

const criar = vi.fn();
const salvar = vi.fn();
const apagar = vi.fn();

afterEach(() => cleanup());

describe('ProdutoClient', () => {
  it('mostra campo dinâmico da categoria selecionada, e some ao trocar pra categoria sem molde', () => {
    render(
      <ProdutoClient itens={[]} categorias={[gravacao, corte]} criar={criar} salvar={salvar} apagar={apagar} />,
    );
    expect(screen.getByText('Câmeras')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: corte.id } });
    expect(screen.queryByText('Câmeras')).not.toBeInTheDocument();
  });

  it('clicar na linha abre o modal com o atributo dinâmico preenchido', () => {
    render(
      <ProdutoClient itens={[produto]} categorias={[gravacao, corte]} criar={criar} salvar={salvar} apagar={apagar} />,
    );
    fireEvent.click(screen.getByText('Gravação 1h'));
    expect(screen.getByLabelText('Câmeras *')).toHaveValue(3);
  });
});
```

- [ ] **Step 5: Implementar `components/ProdutoClient.tsx`**

```tsx
'use client';

import { useActionState, useEffect, useState } from 'react';
import type { AtributoMolde, CategoriaProduto, Produto, ValorAtributo } from '@/lib/types';

export type ProdutoState = { error?: string; ok?: string };
const inicial: ProdutoState = {};
type Acao = (prev: ProdutoState, fd: FormData) => Promise<ProdutoState>;

function CampoAtributo({
  campo, valor, onChange,
}: { campo: AtributoMolde; valor: ValorAtributo | undefined; onChange: (v: ValorAtributo) => void }) {
  const nome = `attr_${campo.chave}`;
  const rotulo = `${campo.rotulo}${campo.obrigatorio ? ' *' : ''}`;
  if (campo.tipo === 'booleano') {
    return (
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name={nome} checked={Boolean(valor)} onChange={(e) => onChange(e.target.checked)} />
        {rotulo}
      </label>
    );
  }
  return (
    <label className="block space-y-1">
      <span className="text-sm">{rotulo}</span>
      <input
        aria-label={rotulo} name={nome} className="input" type={campo.tipo === 'numero' ? 'number' : 'text'}
        value={valor === undefined ? '' : String(valor)} required={campo.obrigatorio}
        onChange={(e) => onChange(campo.tipo === 'numero' ? Number(e.target.value) : e.target.value)}
      />
    </label>
  );
}

function CamposComuns({
  item, categorias, categoriaId, onCategoriaId, atributos, onAtributo,
}: {
  item?: Produto; categorias: CategoriaProduto[]; categoriaId: string; onCategoriaId: (id: string) => void;
  atributos: Record<string, ValorAtributo>; onAtributo: (chave: string, valor: ValorAtributo) => void;
}) {
  const categoria = categorias.find((c) => c.id === categoriaId);
  const opcoes = categorias.filter((c) => c.ativo || c.id === categoriaId);
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-sm">Nome</span>
          <input name="nome" className="input" defaultValue={item?.nome ?? ''} required />
        </label>
        <label className="block space-y-1">
          <span className="text-sm">Categoria</span>
          <select name="categoriaId" className="input" value={categoriaId} onChange={(e) => onCategoriaId(e.target.value)}>
            {opcoes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-sm">Preço (R$)</span>
          <input name="preco" className="input" defaultValue={item?.preco ?? ''} required />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="ativo" defaultChecked={item?.ativo ?? true} />
          Ativo
        </label>
      </div>
      <label className="block space-y-1">
        <span className="text-sm">Descrição</span>
        <textarea name="descricao" className="input" defaultValue={item?.descricao ?? ''} />
      </label>
      {categoria && categoria.atributos_molde.length > 0 && (
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Detalhes de {categoria.nome}</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            {categoria.atributos_molde.map((campo) => (
              <CampoAtributo
                key={campo.chave} campo={campo} valor={atributos[campo.chave]}
                onChange={(v) => onAtributo(campo.chave, v)}
              />
            ))}
          </div>
        </fieldset>
      )}
    </>
  );
}

function FormularioNovo({ categorias, criar }: { categorias: CategoriaProduto[]; criar: Acao }) {
  const [state, action, pending] = useActionState(criar, inicial);
  const [categoriaId, setCategoriaId] = useState(categorias[0]?.id ?? '');
  const [atributos, setAtributos] = useState<Record<string, ValorAtributo>>({});

  useEffect(() => {
    if (state.ok) setAtributos({});
  }, [state.ok]);

  return (
    <details className="glass p-5">
      <summary className="cursor-pointer font-semibold">Novo produto</summary>
      <form action={action} className="space-y-4 mt-4">
        <CamposComuns
          categorias={categorias} categoriaId={categoriaId} onCategoriaId={setCategoriaId}
          atributos={atributos} onAtributo={(chave, valor) => setAtributos({ ...atributos, [chave]: valor })}
        />
        {state.error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{state.error}</p>}
        {state.ok && <p className="text-sm" style={{ color: 'var(--ok)' }}>{state.ok}</p>}
        <button className="btn btn-primary" disabled={pending}>Cadastrar</button>
      </form>
    </details>
  );
}

function ModalEdicao({
  item, categorias, salvar, apagar, onFechar,
}: {
  item: Produto; categorias: CategoriaProduto[]; salvar: Acao;
  apagar: (id: string) => Promise<{ error?: string }>; onFechar: () => void;
}) {
  const [state, action, pending] = useActionState(salvar, inicial);
  const [categoriaId, setCategoriaId] = useState(item.categoria_id);
  const [atributos, setAtributos] = useState<Record<string, ValorAtributo>>(item.atributos);
  const [erroApagar, setErroApagar] = useState<string | null>(null);

  useEffect(() => {
    if (state.ok) onFechar();
  }, [state.ok, onFechar]);

  async function apagarClique() {
    if (!confirm('Apagar este produto?')) return;
    const r = await apagar(item.id);
    if (r.error) setErroApagar(r.error);
    else onFechar();
  }

  return (
    <div className="glass p-5 space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="font-semibold flex-1">{item.nome}</h2>
        <button type="button" className="btn" onClick={onFechar}>Fechar</button>
      </div>
      <form action={action} className="space-y-4">
        <input type="hidden" name="id" value={item.id} />
        <CamposComuns
          item={item} categorias={categorias} categoriaId={categoriaId} onCategoriaId={setCategoriaId}
          atributos={atributos} onAtributo={(chave, valor) => setAtributos({ ...atributos, [chave]: valor })}
        />
        {state.error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{state.error}</p>}
        <button className="btn btn-primary" disabled={pending}>Salvar</button>
      </form>
      <button type="button" className="btn btn-danger" onClick={() => void apagarClique()}>Apagar</button>
      {erroApagar && <p className="text-sm" style={{ color: 'var(--danger)' }}>{erroApagar}</p>}
    </div>
  );
}

export function ProdutoClient({
  itens, categorias, criar, salvar, apagar,
}: {
  itens: Produto[]; categorias: CategoriaProduto[]; criar: Acao; salvar: Acao;
  apagar: (id: string) => Promise<{ error?: string }>;
}) {
  const [aberto, setAberto] = useState<Produto | null>(null);
  const nomeCategoria = (id: string) => categorias.find((c) => c.id === id)?.nome ?? '—';
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Produtos</h1>
      {categorias.length === 0
        ? <p className="text-sm" style={{ color: 'var(--text-dim)' }}>Cadastre uma categoria antes de criar um produto.</p>
        : <FormularioNovo categorias={categorias} criar={criar} />}
      <table className="w-full text-sm">
        <thead>
          <tr style={{ color: 'var(--text-dim)' }}>
            <th className="text-left p-2">Nome</th>
            <th className="text-left p-2">Categoria</th>
            <th className="text-left p-2">Preço</th>
            <th className="text-left p-2">Ativo</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((p) => (
            <tr key={p.id} className="cursor-pointer" onClick={() => setAberto(p)}>
              <td className="p-2">{p.nome}</td>
              <td className="p-2">{nomeCategoria(p.categoria_id)}</td>
              <td className="p-2">R$ {p.preco.toFixed(2)}</td>
              <td className="p-2">{p.ativo ? 'Sim' : 'Não'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {itens.length === 0 && <p className="text-sm" style={{ color: 'var(--text-dim)' }}>Nenhum produto cadastrado.</p>}
      {aberto && (
        <ModalEdicao key={aberto.id} item={aberto} categorias={categorias} salvar={salvar} apagar={apagar} onFechar={() => setAberto(null)} />
      )}
    </div>
  );
}
```

- [ ] **Step 6: Rodar teste jsdom**

```bash
npx vitest run tests/ProdutoClient.test.tsx
```

Esperado: PASS, 2 testes.

- [ ] **Step 7: Rota**

Criar `app/(app)/produtos/actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { requireMaster } from '@/lib/auth/guards';
import { audit } from '@/lib/db/audit';
import { getCategoria } from '@/lib/db/categorias-produto';
import { createProduto, softDeleteProduto, updateProduto } from '@/lib/db/produtos';
import { lerDadosProduto } from '@/lib/produtos-form';
import { isUuid } from '@/lib/validation';
import type { ProdutoState } from '@/components/ProdutoClient';

const ROTA = '/produtos';

async function moldeDaCategoria(categoriaId: string) {
  if (!isUuid(categoriaId)) return null;
  const categoria = await getCategoria(categoriaId);
  return categoria?.atributos_molde ?? null;
}

export async function criarProduto(_prev: ProdutoState, formData: FormData): Promise<ProdutoState> {
  const actor = await requireMaster();
  const molde = await moldeDaCategoria(String(formData.get('categoriaId') ?? ''));
  if (!molde) return { error: 'Categoria não encontrada.' };

  const dados = lerDadosProduto(formData, molde);
  if ('error' in dados) return dados;

  const id = await createProduto(dados);
  await audit({ actorId: actor.id, action: 'create', entityType: 'produto', entityId: id });
  revalidatePath(ROTA);
  return { ok: 'Produto cadastrado.' };
}

export async function salvarProduto(_prev: ProdutoState, formData: FormData): Promise<ProdutoState> {
  const actor = await requireMaster();
  const id = String(formData.get('id') ?? '');
  if (!isUuid(id)) return { error: 'Produto não encontrado.' };

  const molde = await moldeDaCategoria(String(formData.get('categoriaId') ?? ''));
  if (!molde) return { error: 'Categoria não encontrada.' };

  const dados = lerDadosProduto(formData, molde);
  if ('error' in dados) return dados;

  await updateProduto(id, dados);
  await audit({ actorId: actor.id, action: 'update', entityType: 'produto', entityId: id });
  revalidatePath(ROTA);
  return { ok: 'Produto atualizado.' };
}

export async function apagarProduto(id: string): Promise<{ error?: string }> {
  const actor = await requireMaster();
  if (!isUuid(id)) return { error: 'Produto não encontrado.' };

  await softDeleteProduto(id);
  await audit({ actorId: actor.id, action: 'delete', entityType: 'produto', entityId: id });
  revalidatePath(ROTA);
  return {};
}
```

Criar `app/(app)/produtos/page.tsx`:

```tsx
import { ProdutoClient } from '@/components/ProdutoClient';
import { requireMaster } from '@/lib/auth/guards';
import { listCategorias } from '@/lib/db/categorias-produto';
import { listProdutos } from '@/lib/db/produtos';
import { apagarProduto, criarProduto, salvarProduto } from './actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function ProdutosPage() {
  await requireMaster();
  const [itens, categorias] = await Promise.all([listProdutos(), listCategorias()]);
  return (
    <main className="p-4 md:p-6 max-w-5xl mx-auto">
      <ProdutoClient itens={itens} categorias={categorias} criar={criarProduto} salvar={salvarProduto} apagar={apagarProduto} />
    </main>
  );
}
```

Em `lib/db/audit.ts`, acrescentar `'produto'` à união de `entityType` (já ampliada com
`'categoria_produto'` na Task 3).

- [ ] **Step 8: Conferir e commitar**

```bash
npx tsc --noEmit
npm test
```

Esperado: **152 testes** (149 + 1 de integração + 2 de `ProdutoClient.test.tsx`).

```bash
git add lib/db/produtos.ts components/ProdutoClient.tsx "app/(app)/produtos/actions.ts" "app/(app)/produtos/page.tsx" lib/db/audit.ts tests/ProdutoClient.test.tsx tests/integracao.test.ts
git commit -m "Adiciona CRUD de produto com atributos dinamicos"
```

---

## Task 5: `ItemRepetidor` (compartilhado por combo e plano)

**Files:**
- Create: `components/ItemRepetidor.tsx`
- Test: `tests/ItemRepetidor.test.tsx`

**Interfaces:**
- Consumes: tipos `ItemEntrada`, `TipoItemPedido` (Task 1).
- Produces: `type OpcaoItem = { tipo: TipoItemPedido; valor: string; rotulo: string; preco: number }`;
  `calcularSomaItens(itens: ItemEntrada[], opcoes: OpcaoItem[]): number`; componente
  `ItemRepetidor({ nomeCampo, opcoes, itens, onChange })` — controlado: quem chama guarda o estado
  de `itens` e recebe atualizações via `onChange`.

- [ ] **Step 1: Teste que falha**

Criar `tests/ItemRepetidor.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { calcularSomaItens, ItemRepetidor, type OpcaoItem } from '@/components/ItemRepetidor';

const opcoes: OpcaoItem[] = [
  { tipo: 'produto', valor: 'p1', rotulo: 'Corte editado', preco: 199 },
  { tipo: 'combo', valor: 'c1', rotulo: 'Combo X', preco: 500 },
];

afterEach(() => cleanup());

describe('calcularSomaItens', () => {
  it('soma preço × quantidade de cada item', () => {
    const soma = calcularSomaItens([{ tipo: 'produto', valor: 'p1', quantidade: 4 }], opcoes);
    expect(soma).toBe(796);
  });
});

describe('ItemRepetidor', () => {
  it('adicionar item chama onChange com o item novo', () => {
    const onChange = vi.fn();
    render(<ItemRepetidor nomeCampo="itens" opcoes={opcoes} itens={[]} onChange={onChange} />);
    fireEvent.click(screen.getByText('Adicionar'));
    expect(onChange).toHaveBeenCalledWith([{ tipo: 'produto', valor: 'p1', quantidade: 1 }]);
  });

  it('remover item chama onChange sem ele', () => {
    const onChange = vi.fn();
    render(
      <ItemRepetidor
        nomeCampo="itens" opcoes={opcoes} onChange={onChange}
        itens={[{ tipo: 'produto', valor: 'p1', quantidade: 2 }]}
      />,
    );
    fireEvent.click(screen.getByText('Remover'));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx vitest run tests/ItemRepetidor.test.tsx
```

Esperado: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar**

Criar `components/ItemRepetidor.tsx`:

```tsx
'use client';

import { useState } from 'react';
import type { ItemEntrada, TipoItemPedido } from '@/lib/types';

export type OpcaoItem = { tipo: TipoItemPedido; valor: string; rotulo: string; preco: number };

export function calcularSomaItens(itens: ItemEntrada[], opcoes: OpcaoItem[]): number {
  return itens.reduce((acc, item) => {
    const opcao = opcoes.find((o) => o.tipo === item.tipo && o.valor === item.valor);
    return acc + (opcao?.preco ?? 0) * item.quantidade;
  }, 0);
}

export function ItemRepetidor({
  nomeCampo, opcoes, itens, onChange,
}: { nomeCampo: string; opcoes: OpcaoItem[]; itens: ItemEntrada[]; onChange: (itens: ItemEntrada[]) => void }) {
  const [opcaoEscolhida, setOpcaoEscolhida] = useState(opcoes[0] ? `${opcoes[0].tipo}:${opcoes[0].valor}` : '');
  const [quantidade, setQuantidade] = useState(1);

  function adicionar() {
    if (!opcaoEscolhida || quantidade <= 0) return;
    const [tipo, valor] = opcaoEscolhida.split(':') as [TipoItemPedido, string];
    onChange([...itens, { tipo, valor, quantidade }]);
  }

  return (
    <div className="space-y-3">
      <input type="hidden" name={nomeCampo} value={JSON.stringify(itens)} />
      <div className="flex flex-wrap items-end gap-2">
        <label className="block space-y-1 flex-1 min-w-[12rem]">
          <span className="text-sm">Item</span>
          <select className="input" value={opcaoEscolhida} onChange={(e) => setOpcaoEscolhida(e.target.value)}>
            {opcoes.map((o) => (
              <option key={`${o.tipo}:${o.valor}`} value={`${o.tipo}:${o.valor}`}>{o.rotulo}</option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 w-24">
          <span className="text-sm">Qtd.</span>
          <input type="number" min={1} className="input" value={quantidade} onChange={(e) => setQuantidade(Number(e.target.value))} />
        </label>
        <button type="button" className="btn" onClick={adicionar}>Adicionar</button>
      </div>
      <ul className="text-sm space-y-1">
        {itens.map((item, i) => {
          const opcao = opcoes.find((o) => o.tipo === item.tipo && o.valor === item.valor);
          return (
            <li key={i} className="flex items-center gap-2">
              <span className="flex-1">{item.quantidade}x {opcao?.rotulo ?? item.valor}</span>
              <button type="button" className="btn" onClick={() => onChange(itens.filter((_, idx) => idx !== i))}>
                Remover
              </button>
            </li>
          );
        })}
      </ul>
      {itens.length === 0 && <p className="text-xs" style={{ color: 'var(--text-dim)' }}>Nenhum item adicionado.</p>}
    </div>
  );
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
npx vitest run tests/ItemRepetidor.test.tsx
```

Esperado: PASS, 3 testes.

- [ ] **Step 5: Conferir e commitar**

```bash
npx tsc --noEmit
npm test
```

Esperado: **155 testes** (152 + 3).

```bash
git add components/ItemRepetidor.tsx tests/ItemRepetidor.test.tsx
git commit -m "Adiciona ItemRepetidor compartilhado por combo e plano"
```

---

## Task 6: Combos — dados, tela e rota

**Files:**
- Create: `lib/db/combos.ts`, `components/ComboClient.tsx`,
  `app/(app)/produtos/combos/actions.ts`, `app/(app)/produtos/combos/page.tsx`
- Test: acrescentar em `tests/integracao.test.ts`, `tests/ComboClient.test.tsx`

**Interfaces:**
- Consumes: `lerDadosCombo` (Task 2); `ItemRepetidor`, `calcularSomaItens`, `OpcaoItem` (Task 5);
  `Produto` (Task 1).
- Produces: `listCombos`, `getCombo`, `createCombo`, `updateCombo`, `softDeleteCombo` em
  `lib/db/combos.ts`; componente `ComboClient`, `export type ComboState = { error?: string; ok?: string }`.

- [ ] **Step 1: Teste de integração que falha**

Em `tests/integracao.test.ts`, mais um `it` no describe principal:

```ts
  it('combo: cria com itens, edita e soft-delete', async () => {
    const prod = await import('@/lib/db/produtos');
    const cmb = await import('@/lib/db/combos');
    const cat = await import('@/lib/db/categorias-produto');

    const categoriaId = await cat.createCategoria({
      nome: `${marca}-categoria-combo`, unidade_consumo: null, atributos_molde: [], ativo: true,
    });
    const produtoId = await prod.createProduto({
      categoria_id: categoriaId, nome: `${marca}-produto-combo`, descricao: null,
      atributos: {}, preco: 199, ativo: true,
    });

    const comboId = await cmb.createCombo({
      nome: `${marca}-combo`, descricao: null, preco: 700, ativo: true,
      itens: [{ tipo: 'produto', valor: produtoId, quantidade: 4 }],
    });

    const criado = await cmb.getCombo(comboId);
    expect(criado?.itens).toHaveLength(1);
    expect(criado?.itens[0].quantidade).toBe(4);
    expect(criado?.preco).toBe(700);

    await cmb.updateCombo(comboId, {
      nome: `${marca}-combo-editado`, descricao: null, preco: 750, ativo: true,
      itens: [{ tipo: 'produto', valor: produtoId, quantidade: 5 }],
    });
    const editado = await cmb.getCombo(comboId);
    expect(editado?.itens[0].quantidade).toBe(5);

    await cmb.softDeleteCombo(comboId);
    expect(await cmb.getCombo(comboId)).toBeNull();

    await sql`delete from combos where id = ${comboId}`;
    await sql`delete from produtos where id = ${produtoId}`;
    await sql`delete from categorias_produto where id = ${categoriaId}`;
  });
```

Rodar `npx vitest run tests/integracao.test.ts` → falha (`@/lib/db/combos` inexistente).

- [ ] **Step 2: Implementar `lib/db/combos.ts`**

```ts
import { randomUUID } from 'node:crypto';
import { sql } from '@/lib/db/client';
import { NotFoundError } from '@/lib/authz';
import { assertUuid } from '@/lib/validation';
import type { Combo, DadosCombo } from '@/lib/types';

export async function listCombos(): Promise<Combo[]> {
  return (await sql`
    select c.id, c.nome, c.descricao, c.preco::float8 as preco, c.ativo, c.created_at,
           coalesce(
             json_agg(
               json_build_object(
                 'tipo', 'produto', 'valor', ci.produto_id, 'nome', p.nome,
                 'quantidade', ci.quantidade, 'ativo', p.ativo
               ) order by p.nome
             ) filter (where ci.id is not null), '[]'
           ) as itens
      from combos c
      left join combo_itens ci on ci.combo_id = c.id
      left join produtos p on p.id = ci.produto_id
     where c.deleted_at is null
     group by c.id
     order by c.nome`) as Combo[];
}

export async function getCombo(id: string): Promise<Combo | null> {
  assertUuid(id);
  const rows = (await sql`
    select c.id, c.nome, c.descricao, c.preco::float8 as preco, c.ativo, c.created_at,
           coalesce(
             json_agg(
               json_build_object(
                 'tipo', 'produto', 'valor', ci.produto_id, 'nome', p.nome,
                 'quantidade', ci.quantidade, 'ativo', p.ativo
               ) order by p.nome
             ) filter (where ci.id is not null), '[]'
           ) as itens
      from combos c
      left join combo_itens ci on ci.combo_id = c.id
      left join produtos p on p.id = ci.produto_id
     where c.id = ${id} and c.deleted_at is null
     group by c.id`) as Combo[];
  return rows[0] ?? null;
}

export async function createCombo(dados: DadosCombo): Promise<string> {
  const id = randomUUID();
  await sql.transaction([
    sql`insert into combos (id, nome, descricao, preco, ativo)
        values (${id}, ${dados.nome}, ${dados.descricao}, ${dados.preco}, ${dados.ativo})`,
    ...dados.itens.map((i) => sql`
      insert into combo_itens (combo_id, produto_id, quantidade)
      values (${id}, ${i.valor}, ${i.quantidade})`),
  ]);
  return id;
}

export async function updateCombo(id: string, dados: DadosCombo): Promise<void> {
  assertUuid(id);
  if (!(await getCombo(id))) throw new NotFoundError();
  await sql.transaction([
    sql`update combos
           set nome = ${dados.nome}, descricao = ${dados.descricao}, preco = ${dados.preco},
               ativo = ${dados.ativo}, updated_at = now()
         where id = ${id}`,
    sql`delete from combo_itens where combo_id = ${id}`,
    ...dados.itens.map((i) => sql`
      insert into combo_itens (combo_id, produto_id, quantidade)
      values (${id}, ${i.valor}, ${i.quantidade})`),
  ]);
}

export async function softDeleteCombo(id: string): Promise<void> {
  assertUuid(id);
  const rows = (await sql`
    update combos set deleted_at = now()
     where id = ${id} and deleted_at is null returning id`) as { id: string }[];
  if (!rows[0]) throw new NotFoundError();
}
```

Os três selects repetem o mesmo texto por extenso — de propósito: `sql\`...\`` tagged templates
não são strings reaproveitáveis por interpolação (não dá pra montar um pedaço comum e enfiar dentro
de outro `sql\`...\``), e criar uma função que monta a query como string pra só 3 usos não paga o
custo de abstração.

- [ ] **Step 3: Rodar e confirmar que passa**

```bash
npx vitest run tests/integracao.test.ts
```

Esperado: PASS, incluindo o novo `it` de combo.

- [ ] **Step 4: Teste jsdom que falha**

Criar `tests/ComboClient.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ComboClient } from '@/components/ComboClient';
import type { Combo, Produto } from '@/lib/types';

const produto: Produto = {
  id: '11111111-1111-1111-1111-111111111111', categoria_id: 'c1', nome: 'Corte editado',
  descricao: null, atributos: {}, preco: 199, ativo: true, created_at: '2026-08-08T00:00:00Z',
};

const combo: Combo = {
  id: '22222222-2222-2222-2222-222222222222', nome: 'Combo 4 cortes', descricao: null, preco: 596,
  ativo: true, created_at: '2026-08-08T00:00:00Z',
  itens: [{ tipo: 'produto', valor: produto.id, nome: produto.nome, quantidade: 4, ativo: true }],
};

const criar = vi.fn();
const salvar = vi.fn();
const apagar = vi.fn();

afterEach(() => cleanup());

describe('ComboClient', () => {
  it('lista combos com a quantidade de itens', () => {
    render(<ComboClient itens={[combo]} produtos={[produto]} criar={criar} salvar={salvar} apagar={apagar} />);
    expect(screen.getByText('Combo 4 cortes')).toBeInTheDocument();
  });

  it('botão de soma sugerida preenche o campo preço com a soma dos itens', () => {
    render(<ComboClient itens={[]} produtos={[produto]} criar={criar} salvar={salvar} apagar={apagar} />);
    fireEvent.click(screen.getByText('Adicionar'));
    fireEvent.click(screen.getByText(/Usar soma sugerida/));
    expect(screen.getByLabelText('Preço (R$)')).toHaveValue('199.00');
  });
});
```

- [ ] **Step 5: Implementar `components/ComboClient.tsx`**

```tsx
'use client';

import { useActionState, useEffect, useState } from 'react';
import { calcularSomaItens, ItemRepetidor, type OpcaoItem } from '@/components/ItemRepetidor';
import type { Combo, ItemEntrada, Produto } from '@/lib/types';

export type ComboState = { error?: string; ok?: string };
const inicial: ComboState = {};
type Acao = (prev: ComboState, fd: FormData) => Promise<ComboState>;

function CamposComuns({
  item, produtos, itens, onItens, preco, onPreco,
}: {
  item?: Combo; produtos: Produto[]; itens: ItemEntrada[]; onItens: (i: ItemEntrada[]) => void;
  preco: string; onPreco: (v: string) => void;
}) {
  const opcoes: OpcaoItem[] = produtos.filter((p) => p.ativo).map((p) => ({ tipo: 'produto', valor: p.id, rotulo: p.nome, preco: p.preco }));
  const soma = calcularSomaItens(itens, opcoes);
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-sm">Nome</span>
          <input name="nome" className="input" defaultValue={item?.nome ?? ''} required />
        </label>
        <label className="block space-y-1">
          <span className="text-sm">Preço (R$)</span>
          <input aria-label="Preço (R$)" name="preco" className="input" value={preco} onChange={(e) => onPreco(e.target.value)} required />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="ativo" defaultChecked={item?.ativo ?? true} />
          Ativo
        </label>
      </div>
      <label className="block space-y-1">
        <span className="text-sm">Descrição</span>
        <textarea name="descricao" className="input" defaultValue={item?.descricao ?? ''} />
      </label>
      <ItemRepetidor nomeCampo="itens" opcoes={opcoes} itens={itens} onChange={onItens} />
      <button type="button" className="btn" onClick={() => onPreco(soma.toFixed(2))}>
        Usar soma sugerida (R$ {soma.toFixed(2)})
      </button>
    </>
  );
}

function FormularioNovo({ produtos, criar }: { produtos: Produto[]; criar: Acao }) {
  const [state, action, pending] = useActionState(criar, inicial);
  const [itens, setItens] = useState<ItemEntrada[]>([]);
  const [preco, setPreco] = useState('');

  useEffect(() => {
    if (state.ok) { setItens([]); setPreco(''); }
  }, [state.ok]);

  return (
    <details className="glass p-5">
      <summary className="cursor-pointer font-semibold">Novo combo</summary>
      <form action={action} className="space-y-4 mt-4">
        <CamposComuns produtos={produtos} itens={itens} onItens={setItens} preco={preco} onPreco={setPreco} />
        {state.error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{state.error}</p>}
        {state.ok && <p className="text-sm" style={{ color: 'var(--ok)' }}>{state.ok}</p>}
        <button className="btn btn-primary" disabled={pending}>Cadastrar</button>
      </form>
    </details>
  );
}

function ModalEdicao({
  item, produtos, salvar, apagar, onFechar,
}: { item: Combo; produtos: Produto[]; salvar: Acao; apagar: (id: string) => Promise<{ error?: string }>; onFechar: () => void }) {
  const [state, action, pending] = useActionState(salvar, inicial);
  const [itens, setItens] = useState<ItemEntrada[]>(item.itens.map((i) => ({ tipo: i.tipo, valor: i.valor, quantidade: i.quantidade })));
  const [preco, setPreco] = useState(String(item.preco));
  const [erroApagar, setErroApagar] = useState<string | null>(null);

  useEffect(() => {
    if (state.ok) onFechar();
  }, [state.ok, onFechar]);

  async function apagarClique() {
    if (!confirm('Apagar este combo?')) return;
    const r = await apagar(item.id);
    if (r.error) setErroApagar(r.error);
    else onFechar();
  }

  return (
    <div className="glass p-5 space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="font-semibold flex-1">{item.nome}</h2>
        <button type="button" className="btn" onClick={onFechar}>Fechar</button>
      </div>
      <form action={action} className="space-y-4">
        <input type="hidden" name="id" value={item.id} />
        <CamposComuns item={item} produtos={produtos} itens={itens} onItens={setItens} preco={preco} onPreco={setPreco} />
        {state.error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{state.error}</p>}
        <button className="btn btn-primary" disabled={pending}>Salvar</button>
      </form>
      <button type="button" className="btn btn-danger" onClick={() => void apagarClique()}>Apagar</button>
      {erroApagar && <p className="text-sm" style={{ color: 'var(--danger)' }}>{erroApagar}</p>}
    </div>
  );
}

export function ComboClient({
  itens, produtos, criar, salvar, apagar,
}: { itens: Combo[]; produtos: Produto[]; criar: Acao; salvar: Acao; apagar: (id: string) => Promise<{ error?: string }> }) {
  const [aberto, setAberto] = useState<Combo | null>(null);
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Combos</h1>
      <FormularioNovo produtos={produtos} criar={criar} />
      <table className="w-full text-sm">
        <thead>
          <tr style={{ color: 'var(--text-dim)' }}>
            <th className="text-left p-2">Nome</th>
            <th className="text-left p-2">Itens</th>
            <th className="text-left p-2">Preço</th>
            <th className="text-left p-2">Ativo</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((c) => (
            <tr key={c.id} className="cursor-pointer" onClick={() => setAberto(c)}>
              <td className="p-2">{c.nome}</td>
              <td className="p-2">{c.itens.length}</td>
              <td className="p-2">R$ {c.preco.toFixed(2)}</td>
              <td className="p-2">{c.ativo ? 'Sim' : 'Não'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {itens.length === 0 && <p className="text-sm" style={{ color: 'var(--text-dim)' }}>Nenhum combo cadastrado.</p>}
      {aberto && <ModalEdicao key={aberto.id} item={aberto} produtos={produtos} salvar={salvar} apagar={apagar} onFechar={() => setAberto(null)} />}
    </div>
  );
}
```

- [ ] **Step 6: Rodar teste jsdom**

```bash
npx vitest run tests/ComboClient.test.tsx
```

Esperado: PASS, 2 testes.

- [ ] **Step 7: Rota**

Criar `app/(app)/produtos/combos/actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { requireMaster } from '@/lib/auth/guards';
import { audit } from '@/lib/db/audit';
import { createCombo, softDeleteCombo, updateCombo } from '@/lib/db/combos';
import { lerDadosCombo } from '@/lib/produtos-form';
import { isUuid } from '@/lib/validation';
import type { ComboState } from '@/components/ComboClient';

const ROTA = '/produtos/combos';

export async function criarCombo(_prev: ComboState, formData: FormData): Promise<ComboState> {
  const actor = await requireMaster();
  const dados = lerDadosCombo(formData);
  if ('error' in dados) return dados;

  const id = await createCombo(dados);
  await audit({ actorId: actor.id, action: 'create', entityType: 'combo', entityId: id });
  revalidatePath(ROTA);
  return { ok: 'Combo cadastrado.' };
}

export async function salvarCombo(_prev: ComboState, formData: FormData): Promise<ComboState> {
  const actor = await requireMaster();
  const id = String(formData.get('id') ?? '');
  if (!isUuid(id)) return { error: 'Combo não encontrado.' };

  const dados = lerDadosCombo(formData);
  if ('error' in dados) return dados;

  await updateCombo(id, dados);
  await audit({ actorId: actor.id, action: 'update', entityType: 'combo', entityId: id });
  revalidatePath(ROTA);
  return { ok: 'Combo atualizado.' };
}

export async function apagarCombo(id: string): Promise<{ error?: string }> {
  const actor = await requireMaster();
  if (!isUuid(id)) return { error: 'Combo não encontrado.' };

  await softDeleteCombo(id);
  await audit({ actorId: actor.id, action: 'delete', entityType: 'combo', entityId: id });
  revalidatePath(ROTA);
  return {};
}
```

Criar `app/(app)/produtos/combos/page.tsx`:

```tsx
import { ComboClient } from '@/components/ComboClient';
import { requireMaster } from '@/lib/auth/guards';
import { listCombos } from '@/lib/db/combos';
import { listProdutos } from '@/lib/db/produtos';
import { apagarCombo, criarCombo, salvarCombo } from './actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function CombosPage() {
  await requireMaster();
  const [itens, produtos] = await Promise.all([listCombos(), listProdutos()]);
  return (
    <main className="p-4 md:p-6 max-w-5xl mx-auto">
      <ComboClient itens={itens} produtos={produtos} criar={criarCombo} salvar={salvarCombo} apagar={apagarCombo} />
    </main>
  );
}
```

Em `lib/db/audit.ts`, acrescentar `'combo'` à união de `entityType`.

- [ ] **Step 8: Conferir e commitar**

```bash
npx tsc --noEmit
npm test
```

Esperado: **158 testes** (155 + 1 de integração + 2 de `ComboClient.test.tsx`).

```bash
git add lib/db/combos.ts components/ComboClient.tsx "app/(app)/produtos/combos" lib/db/audit.ts tests/integracao.test.ts tests/ComboClient.test.tsx
git commit -m "Adiciona CRUD de combo"
```

---

## Task 7: Planos — dados, tela e rota

**Files:**
- Create: `lib/db/planos.ts`, `components/PlanoClient.tsx`,
  `app/(app)/produtos/planos/actions.ts`, `app/(app)/produtos/planos/page.tsx`
- Test: acrescentar em `tests/integracao.test.ts`, `tests/PlanoClient.test.tsx`

**Interfaces:**
- Consumes: `lerDadosPlano` (Task 2); `ItemRepetidor`, `calcularSomaItens`, `OpcaoItem` (Task 5);
  `Produto`, `Combo` (Tasks 1, 6).
- Produces: `listPlanos`, `getPlano`, `createPlano`, `updatePlano`, `softDeletePlano` em
  `lib/db/planos.ts`; componente `PlanoClient`, `export type PlanoState = { error?: string; ok?: string }`.

- [ ] **Step 1: Teste de integração que falha**

Mais um `it` em `tests/integracao.test.ts`:

```ts
  it('plano: pacote_fechado e assinatura, e o check do banco rejeita mistura', async () => {
    const cat = await import('@/lib/db/categorias-produto');
    const prod = await import('@/lib/db/produtos');
    const pl = await import('@/lib/db/planos');

    const categoriaId = await cat.createCategoria({
      nome: `${marca}-categoria-plano`, unidade_consumo: null, atributos_molde: [], ativo: true,
    });
    const produtoId = await prod.createProduto({
      categoria_id: categoriaId, nome: `${marca}-produto-plano`, descricao: null,
      atributos: {}, preco: 399, ativo: true,
    });

    const fechadoId = await pl.createPlano({
      nome: `${marca}-plano-fechado`, descricao: null, tipo_cobranca: 'pacote_fechado',
      validade_dias: 90, ciclo: null, preco: 2500, ativo: true,
      itens: [{ tipo: 'produto', valor: produtoId, quantidade: 2 }],
    });
    const fechado = await pl.getPlano(fechadoId);
    expect(fechado?.validade_dias).toBe(90);
    expect(fechado?.ciclo).toBeNull();

    const assinaturaId = await pl.createPlano({
      nome: `${marca}-plano-assinatura`, descricao: null, tipo_cobranca: 'assinatura',
      validade_dias: null, ciclo: 'mensal', preco: 1500, ativo: true,
      itens: [{ tipo: 'produto', valor: produtoId, quantidade: 48 }],
    });
    const assinatura = await pl.getPlano(assinaturaId);
    expect(assinatura?.ciclo).toBe('mensal');
    expect(assinatura?.validade_dias).toBeNull();

    await expect(sql`
      insert into planos (nome, tipo_cobranca, validade_dias, ciclo, preco)
      values (${`${marca}-invalido`}, 'pacote_fechado', 10, 'mensal', 100)
    `).rejects.toMatchObject({ code: '23514' });

    await pl.softDeletePlano(fechadoId);
    await pl.softDeletePlano(assinaturaId);
    await sql`delete from planos where id in (${fechadoId}, ${assinaturaId})`;
    await sql`delete from produtos where id = ${produtoId}`;
    await sql`delete from categorias_produto where id = ${categoriaId}`;
  });
```

Rodar `npx vitest run tests/integracao.test.ts` → falha (`@/lib/db/planos` inexistente).

- [ ] **Step 2: Implementar `lib/db/planos.ts`**

```ts
import { randomUUID } from 'node:crypto';
import { sql } from '@/lib/db/client';
import { NotFoundError } from '@/lib/authz';
import { assertUuid } from '@/lib/validation';
import type { DadosPlano, Plano } from '@/lib/types';

export async function listPlanos(): Promise<Plano[]> {
  return (await sql`
    select pl.id, pl.nome, pl.descricao, pl.tipo_cobranca, pl.validade_dias, pl.ciclo,
           pl.preco::float8 as preco, pl.ativo, pl.created_at,
           coalesce(
             json_agg(
               json_build_object(
                 'tipo', pi.tipo_item, 'valor', coalesce(pi.produto_id, pi.combo_id),
                 'nome', coalesce(p.nome, c.nome), 'quantidade', pi.quantidade,
                 'ativo', coalesce(p.ativo, c.ativo)
               ) order by coalesce(p.nome, c.nome)
             ) filter (where pi.id is not null), '[]'
           ) as itens
      from planos pl
      left join plano_itens pi on pi.plano_id = pl.id
      left join produtos p on p.id = pi.produto_id
      left join combos c on c.id = pi.combo_id
     where pl.deleted_at is null
     group by pl.id
     order by pl.nome`) as Plano[];
}

export async function getPlano(id: string): Promise<Plano | null> {
  assertUuid(id);
  const rows = (await sql`
    select pl.id, pl.nome, pl.descricao, pl.tipo_cobranca, pl.validade_dias, pl.ciclo,
           pl.preco::float8 as preco, pl.ativo, pl.created_at,
           coalesce(
             json_agg(
               json_build_object(
                 'tipo', pi.tipo_item, 'valor', coalesce(pi.produto_id, pi.combo_id),
                 'nome', coalesce(p.nome, c.nome), 'quantidade', pi.quantidade,
                 'ativo', coalesce(p.ativo, c.ativo)
               ) order by coalesce(p.nome, c.nome)
             ) filter (where pi.id is not null), '[]'
           ) as itens
      from planos pl
      left join plano_itens pi on pi.plano_id = pl.id
      left join produtos p on p.id = pi.produto_id
      left join combos c on c.id = pi.combo_id
     where pl.id = ${id} and pl.deleted_at is null
     group by pl.id`) as Plano[];
  return rows[0] ?? null;
}

function inserirItem(planoId: string, item: DadosPlano['itens'][number]) {
  return item.tipo === 'produto'
    ? sql`insert into plano_itens (plano_id, tipo_item, produto_id, quantidade)
          values (${planoId}, 'produto', ${item.valor}, ${item.quantidade})`
    : sql`insert into plano_itens (plano_id, tipo_item, combo_id, quantidade)
          values (${planoId}, 'combo', ${item.valor}, ${item.quantidade})`;
}

export async function createPlano(dados: DadosPlano): Promise<string> {
  const id = randomUUID();
  await sql.transaction([
    sql`insert into planos (id, nome, descricao, tipo_cobranca, validade_dias, ciclo, preco, ativo)
        values (${id}, ${dados.nome}, ${dados.descricao}, ${dados.tipo_cobranca},
                ${dados.validade_dias}, ${dados.ciclo}, ${dados.preco}, ${dados.ativo})`,
    ...dados.itens.map((i) => inserirItem(id, i)),
  ]);
  return id;
}

export async function updatePlano(id: string, dados: DadosPlano): Promise<void> {
  assertUuid(id);
  if (!(await getPlano(id))) throw new NotFoundError();
  await sql.transaction([
    sql`update planos
           set nome = ${dados.nome}, descricao = ${dados.descricao}, tipo_cobranca = ${dados.tipo_cobranca},
               validade_dias = ${dados.validade_dias}, ciclo = ${dados.ciclo}, preco = ${dados.preco},
               ativo = ${dados.ativo}, updated_at = now()
         where id = ${id}`,
    sql`delete from plano_itens where plano_id = ${id}`,
    ...dados.itens.map((i) => inserirItem(id, i)),
  ]);
}

export async function softDeletePlano(id: string): Promise<void> {
  assertUuid(id);
  const rows = (await sql`
    update planos set deleted_at = now()
     where id = ${id} and deleted_at is null returning id`) as { id: string }[];
  if (!rows[0]) throw new NotFoundError();
}
```

- [ ] **Step 3: Rodar e confirmar que passa**

```bash
npx vitest run tests/integracao.test.ts
```

Esperado: PASS, incluindo o novo `it` de plano.

- [ ] **Step 4: Teste jsdom que falha**

Criar `tests/PlanoClient.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { PlanoClient } from '@/components/PlanoClient';
import type { Combo, Produto } from '@/lib/types';

const produto: Produto = {
  id: '11111111-1111-1111-1111-111111111111', categoria_id: 'c1', nome: 'Gravação',
  descricao: null, atributos: {}, preco: 399, ativo: true, created_at: '2026-08-08T00:00:00Z',
};
const combo: Combo = {
  id: '22222222-2222-2222-2222-222222222222', nome: 'Combo cortes', descricao: null, preco: 596,
  ativo: true, created_at: '2026-08-08T00:00:00Z', itens: [],
};

const criar = vi.fn();
const salvar = vi.fn();
const apagar = vi.fn();

afterEach(() => cleanup());

describe('PlanoClient', () => {
  it('escolher pacote_fechado mostra campo de validade; assinatura esconde', () => {
    render(<PlanoClient itens={[]} produtos={[produto]} combos={[combo]} criar={criar} salvar={salvar} apagar={apagar} />);
    fireEvent.change(screen.getByLabelText('Tipo de cobrança'), { target: { value: 'pacote_fechado' } });
    expect(screen.getByLabelText('Validade (dias)')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Tipo de cobrança'), { target: { value: 'assinatura' } });
    expect(screen.queryByLabelText('Validade (dias)')).not.toBeInTheDocument();
  });

  it('repetidor de itens mistura opção de produto e de combo', () => {
    render(<PlanoClient itens={[]} produtos={[produto]} combos={[combo]} criar={criar} salvar={salvar} apagar={apagar} />);
    const select = screen.getByLabelText('Item');
    const rotulos = Array.from(select.querySelectorAll('option')).map((o) => o.textContent);
    expect(rotulos).toEqual(['Gravação', 'Combo cortes']);
  });
});
```

- [ ] **Step 5: Implementar `components/PlanoClient.tsx`**

```tsx
'use client';

import { useActionState, useEffect, useState } from 'react';
import { calcularSomaItens, ItemRepetidor, type OpcaoItem } from '@/components/ItemRepetidor';
import type { Combo, ItemEntrada, Plano, Produto, TipoCobranca } from '@/lib/types';

export type PlanoState = { error?: string; ok?: string };
const inicial: PlanoState = {};
type Acao = (prev: PlanoState, fd: FormData) => Promise<PlanoState>;

function CamposComuns({
  item, produtos, combos, itens, onItens, preco, onPreco, tipoCobranca, onTipoCobranca,
}: {
  item?: Plano; produtos: Produto[]; combos: Combo[]; itens: ItemEntrada[]; onItens: (i: ItemEntrada[]) => void;
  preco: string; onPreco: (v: string) => void; tipoCobranca: TipoCobranca; onTipoCobranca: (t: TipoCobranca) => void;
}) {
  const opcoes: OpcaoItem[] = [
    ...produtos.filter((p) => p.ativo).map((p) => ({ tipo: 'produto' as const, valor: p.id, rotulo: p.nome, preco: p.preco })),
    ...combos.filter((c) => c.ativo).map((c) => ({ tipo: 'combo' as const, valor: c.id, rotulo: c.nome, preco: c.preco })),
  ];
  const soma = calcularSomaItens(itens, opcoes);
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-sm">Nome</span>
          <input name="nome" className="input" defaultValue={item?.nome ?? ''} required />
        </label>
        <label className="block space-y-1">
          <span className="text-sm">Tipo de cobrança</span>
          <select
            aria-label="Tipo de cobrança" name="tipoCobranca" className="input" value={tipoCobranca}
            onChange={(e) => onTipoCobranca(e.target.value as TipoCobranca)}
          >
            <option value="pacote_fechado">Pacote fechado</option>
            <option value="assinatura">Assinatura (mensal)</option>
          </select>
        </label>
        {tipoCobranca === 'pacote_fechado' && (
          <label className="block space-y-1">
            <span className="text-sm">Validade (dias)</span>
            <input aria-label="Validade (dias)" name="validadeDias" className="input" type="number" defaultValue={item?.validade_dias ?? ''} required />
          </label>
        )}
        <label className="block space-y-1">
          <span className="text-sm">Preço (R$)</span>
          <input aria-label="Preço (R$)" name="preco" className="input" value={preco} onChange={(e) => onPreco(e.target.value)} required />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="ativo" defaultChecked={item?.ativo ?? true} />
          Ativo
        </label>
      </div>
      <label className="block space-y-1">
        <span className="text-sm">Descrição</span>
        <textarea name="descricao" className="input" defaultValue={item?.descricao ?? ''} />
      </label>
      <ItemRepetidor nomeCampo="itens" opcoes={opcoes} itens={itens} onChange={onItens} />
      <button type="button" className="btn" onClick={() => onPreco(soma.toFixed(2))}>
        Usar soma sugerida (R$ {soma.toFixed(2)})
      </button>
    </>
  );
}

function FormularioNovo({ produtos, combos, criar }: { produtos: Produto[]; combos: Combo[]; criar: Acao }) {
  const [state, action, pending] = useActionState(criar, inicial);
  const [itens, setItens] = useState<ItemEntrada[]>([]);
  const [preco, setPreco] = useState('');
  const [tipoCobranca, setTipoCobranca] = useState<TipoCobranca>('pacote_fechado');

  useEffect(() => {
    if (state.ok) { setItens([]); setPreco(''); }
  }, [state.ok]);

  return (
    <details className="glass p-5">
      <summary className="cursor-pointer font-semibold">Novo plano</summary>
      <form action={action} className="space-y-4 mt-4">
        <CamposComuns
          produtos={produtos} combos={combos} itens={itens} onItens={setItens} preco={preco} onPreco={setPreco}
          tipoCobranca={tipoCobranca} onTipoCobranca={setTipoCobranca}
        />
        {state.error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{state.error}</p>}
        {state.ok && <p className="text-sm" style={{ color: 'var(--ok)' }}>{state.ok}</p>}
        <button className="btn btn-primary" disabled={pending}>Cadastrar</button>
      </form>
    </details>
  );
}

function ModalEdicao({
  item, produtos, combos, salvar, apagar, onFechar,
}: {
  item: Plano; produtos: Produto[]; combos: Combo[]; salvar: Acao;
  apagar: (id: string) => Promise<{ error?: string }>; onFechar: () => void;
}) {
  const [state, action, pending] = useActionState(salvar, inicial);
  const [itens, setItens] = useState<ItemEntrada[]>(item.itens.map((i) => ({ tipo: i.tipo, valor: i.valor, quantidade: i.quantidade })));
  const [preco, setPreco] = useState(String(item.preco));
  const [tipoCobranca, setTipoCobranca] = useState<TipoCobranca>(item.tipo_cobranca);
  const [erroApagar, setErroApagar] = useState<string | null>(null);

  useEffect(() => {
    if (state.ok) onFechar();
  }, [state.ok, onFechar]);

  async function apagarClique() {
    if (!confirm('Apagar este plano?')) return;
    const r = await apagar(item.id);
    if (r.error) setErroApagar(r.error);
    else onFechar();
  }

  return (
    <div className="glass p-5 space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="font-semibold flex-1">{item.nome}</h2>
        <button type="button" className="btn" onClick={onFechar}>Fechar</button>
      </div>
      <form action={action} className="space-y-4">
        <input type="hidden" name="id" value={item.id} />
        <CamposComuns
          item={item} produtos={produtos} combos={combos} itens={itens} onItens={setItens} preco={preco} onPreco={setPreco}
          tipoCobranca={tipoCobranca} onTipoCobranca={setTipoCobranca}
        />
        {state.error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{state.error}</p>}
        <button className="btn btn-primary" disabled={pending}>Salvar</button>
      </form>
      <button type="button" className="btn btn-danger" onClick={() => void apagarClique()}>Apagar</button>
      {erroApagar && <p className="text-sm" style={{ color: 'var(--danger)' }}>{erroApagar}</p>}
    </div>
  );
}

export function PlanoClient({
  itens, produtos, combos, criar, salvar, apagar,
}: {
  itens: Plano[]; produtos: Produto[]; combos: Combo[]; criar: Acao; salvar: Acao;
  apagar: (id: string) => Promise<{ error?: string }>;
}) {
  const [aberto, setAberto] = useState<Plano | null>(null);
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Planos</h1>
      <FormularioNovo produtos={produtos} combos={combos} criar={criar} />
      <table className="w-full text-sm">
        <thead>
          <tr style={{ color: 'var(--text-dim)' }}>
            <th className="text-left p-2">Nome</th>
            <th className="text-left p-2">Cobrança</th>
            <th className="text-left p-2">Preço</th>
            <th className="text-left p-2">Ativo</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((p) => (
            <tr key={p.id} className="cursor-pointer" onClick={() => setAberto(p)}>
              <td className="p-2">{p.nome}</td>
              <td className="p-2">{p.tipo_cobranca === 'pacote_fechado' ? `${p.validade_dias} dias` : 'Mensal'}</td>
              <td className="p-2">R$ {p.preco.toFixed(2)}</td>
              <td className="p-2">{p.ativo ? 'Sim' : 'Não'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {itens.length === 0 && <p className="text-sm" style={{ color: 'var(--text-dim)' }}>Nenhum plano cadastrado.</p>}
      {aberto && (
        <ModalEdicao key={aberto.id} item={aberto} produtos={produtos} combos={combos} salvar={salvar} apagar={apagar} onFechar={() => setAberto(null)} />
      )}
    </div>
  );
}
```

- [ ] **Step 6: Rodar teste jsdom**

```bash
npx vitest run tests/PlanoClient.test.tsx
```

Esperado: PASS, 2 testes.

- [ ] **Step 7: Rota**

Criar `app/(app)/produtos/planos/actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { requireMaster } from '@/lib/auth/guards';
import { audit } from '@/lib/db/audit';
import { createPlano, softDeletePlano, updatePlano } from '@/lib/db/planos';
import { lerDadosPlano } from '@/lib/produtos-form';
import { isUuid } from '@/lib/validation';
import type { PlanoState } from '@/components/PlanoClient';

const ROTA = '/produtos/planos';

export async function criarPlano(_prev: PlanoState, formData: FormData): Promise<PlanoState> {
  const actor = await requireMaster();
  const dados = lerDadosPlano(formData);
  if ('error' in dados) return dados;

  const id = await createPlano(dados);
  await audit({ actorId: actor.id, action: 'create', entityType: 'plano', entityId: id });
  revalidatePath(ROTA);
  return { ok: 'Plano cadastrado.' };
}

export async function salvarPlano(_prev: PlanoState, formData: FormData): Promise<PlanoState> {
  const actor = await requireMaster();
  const id = String(formData.get('id') ?? '');
  if (!isUuid(id)) return { error: 'Plano não encontrado.' };

  const dados = lerDadosPlano(formData);
  if ('error' in dados) return dados;

  await updatePlano(id, dados);
  await audit({ actorId: actor.id, action: 'update', entityType: 'plano', entityId: id });
  revalidatePath(ROTA);
  return { ok: 'Plano atualizado.' };
}

export async function apagarPlano(id: string): Promise<{ error?: string }> {
  const actor = await requireMaster();
  if (!isUuid(id)) return { error: 'Plano não encontrado.' };

  await softDeletePlano(id);
  await audit({ actorId: actor.id, action: 'delete', entityType: 'plano', entityId: id });
  revalidatePath(ROTA);
  return {};
}
```

Criar `app/(app)/produtos/planos/page.tsx`:

```tsx
import { PlanoClient } from '@/components/PlanoClient';
import { requireMaster } from '@/lib/auth/guards';
import { listCombos } from '@/lib/db/combos';
import { listPlanos } from '@/lib/db/planos';
import { listProdutos } from '@/lib/db/produtos';
import { apagarPlano, criarPlano, salvarPlano } from './actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function PlanosPage() {
  await requireMaster();
  const [itens, produtos, combos] = await Promise.all([listPlanos(), listProdutos(), listCombos()]);
  return (
    <main className="p-4 md:p-6 max-w-5xl mx-auto">
      <PlanoClient itens={itens} produtos={produtos} combos={combos} criar={criarPlano} salvar={salvarPlano} apagar={apagarPlano} />
    </main>
  );
}
```

Em `lib/db/audit.ts`, acrescentar `'plano'` à união de `entityType`.

- [ ] **Step 8: Conferir e commitar**

```bash
npx tsc --noEmit
npm test
```

Esperado: **161 testes** (158 + 1 de integração + 2 de `PlanoClient.test.tsx`).

```bash
git add lib/db/planos.ts components/PlanoClient.tsx "app/(app)/produtos/planos" lib/db/audit.ts tests/integracao.test.ts tests/PlanoClient.test.tsx
git commit -m "Adiciona CRUD de plano"
```

---

## Task 8: Lixeira, auditoria e menu

**Files:**
- Modify: `lib/db/queries.ts` (bloco Lixeira), `components/RestoreButton.tsx`,
  `components/PurgeButton.tsx`, `app/(app)/admin/lixeira/{actions,page}.tsx`,
  `components/Sidebar.tsx`
- Test: acrescentar em `tests/integracao.test.ts`

**Interfaces:**
- Consumes: `softDeleteProduto` (Task 4), `softDeleteCombo` (Task 6) — usados só no teste.
- Produces: `TrashItem['kind']` ganha `'produto' | 'combo' | 'plano'`; `restoreItem`/`purgeItem`
  aceitam os três; grupo "Produtos" no menu.

- [ ] **Step 1: Teste que falha**

Mais um `it` em `tests/integracao.test.ts`:

```ts
  it('produto apagado aparece na lixeira, restaura e depois expurga', async () => {
    const cat = await import('@/lib/db/categorias-produto');
    const prod = await import('@/lib/db/produtos');

    const categoriaId = await cat.createCategoria({
      nome: `${marca}-categoria-lixeira`, unidade_consumo: null, atributos_molde: [], ativo: true,
    });
    const produtoId = await prod.createProduto({
      categoria_id: categoriaId, nome: `${marca}-produto-lixeira`, descricao: null,
      atributos: {}, preco: 100, ativo: true,
    });
    await prod.softDeleteProduto(produtoId);

    const lixeira = await q.listTrash();
    const item = lixeira.find((i) => i.kind === 'produto' && i.id === produtoId);
    expect(item?.title).toBe(`${marca}-produto-lixeira`);

    await q.restoreItem('produto', produtoId);
    expect(await prod.getProduto(produtoId)).not.toBeNull();

    await prod.softDeleteProduto(produtoId);
    await q.purgeItem('produto', produtoId);
    const linhas = (await sql`select id from produtos where id = ${produtoId}`) as { id: string }[];
    expect(linhas).toHaveLength(0);

    await sql`delete from categorias_produto where id = ${categoriaId}`;
  });
```

Rodar `npx vitest run tests/integracao.test.ts` → falha (`kind` não aceita `'produto'` ainda).

- [ ] **Step 2: Estender `lib/db/queries.ts`**

Trocar a união de `TrashItem['kind']` e as assinaturas de `restoreItem`/`purgeItem` (já contêm
`'cliente' | 'fornecedor'` da rodada anterior) para incluir também `'produto' | 'combo' | 'plano'`:

```ts
export type TrashItem = {
  id: string;
  kind: 'credential' | 'room' | 'cliente' | 'fornecedor' | 'produto' | 'combo' | 'plano';
  title: string;
  room_name: string | null;
  deleted_at: string;
  credential_count: number | null;
};
```

Em `listTrash()`, acrescentar mais 3 `union all` antes do `order by deleted_at desc` final:

```sql
    union all
    select pr.id, 'produto' as kind, pr.nome as title, null as room_name, pr.deleted_at,
           null::int as credential_count
      from produtos pr where pr.deleted_at is not null
    union all
    select cb.id, 'combo' as kind, cb.nome as title, null as room_name, cb.deleted_at,
           null::int as credential_count
      from combos cb where cb.deleted_at is not null
    union all
    select pl.id, 'plano' as kind, pl.nome as title, null as room_name, pl.deleted_at,
           null::int as credential_count
      from planos pl where pl.deleted_at is not null
```

Em `restoreItem` e `purgeItem`, trocar o parâmetro `kind` pra união completa
(`'credential' | 'room' | 'cliente' | 'fornecedor' | 'produto' | 'combo' | 'plano'`) e acrescentar,
antes do `else` final de cada função:

```ts
  } else if (kind === 'produto') {
    await sql`update produtos set deleted_at = null where id = ${id}`;
  } else if (kind === 'combo') {
    await sql`update combos set deleted_at = null where id = ${id}`;
  } else if (kind === 'plano') {
    await sql`update planos set deleted_at = null where id = ${id}`;
```

(em `restoreItem`) e, em `purgeItem`:

```ts
  } else if (kind === 'produto') {
    await sql`delete from produtos where id = ${id} and deleted_at is not null`;
  } else if (kind === 'combo') {
    await sql`delete from combos where id = ${id} and deleted_at is not null`;
  } else if (kind === 'plano') {
    await sql`delete from planos where id = ${id} and deleted_at is not null`;
```

- [ ] **Step 3: Widen `kind` nos componentes e na tela de lixeira**

Em `components/RestoreButton.tsx` e `components/PurgeButton.tsx`, troque o tipo de `kind` pra
`'credential' | 'room' | 'cliente' | 'fornecedor' | 'produto' | 'combo' | 'plano'` (mesma união do
Step 2). Em `app/(app)/admin/lixeira/actions.ts`, mesma troca nas assinaturas de `restaurar` e
`expurgar`.

Em `app/(app)/admin/lixeira/page.tsx`, o objeto de rótulos ganha as 3 chaves novas:

```tsx
                <span className="badge">
                  {{
                    room: 'sala', credential: 'senha', cliente: 'cliente', fornecedor: 'fornecedor',
                    produto: 'produto', combo: 'combo', plano: 'plano',
                  }[item.kind]}
                </span>
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
npx tsc --noEmit
npx vitest run tests/integracao.test.ts
```

Esperado: `tsc` limpo; todos os testes de integração passando, incluindo o novo.

- [ ] **Step 5: Menu — grupo "Produtos"**

Em `components/Sidebar.tsx`, acrescentar ao import de `lucide-react`: `Package`,
`Boxes`, `Layers`, `CalendarClock` (ícones do grupo e dos 4 itens). Acrescentar
`canManageProdutos` ao import de `@/lib/authz`. Acrescentar um novo grupo de topo, entre o grupo
"Cadastros" e o `...modulosVisiveis.map(...)` (ou logo depois — ordem exata não importa,
contanto que fique entre "Cadastros" e "Cofre de Senhas"):

```tsx
    ...(canManageProdutos(actor)
      ? [{
          label: 'Produtos',
          icon: <Package size={18} className={iconClass} />,
          items: [
            { href: '/produtos/categorias', label: 'Categorias', icon: <Layers size={18} className={iconClass} /> },
            { href: '/produtos', label: 'Produtos', icon: <Boxes size={18} className={iconClass} /> },
            { href: '/produtos/combos', label: 'Combos', icon: <Package size={18} className={iconClass} /> },
            { href: '/produtos/planos', label: 'Planos', icon: <CalendarClock size={18} className={iconClass} /> },
          ],
        }]
      : []),
```

- [ ] **Step 6: Conferir tudo e commitar**

```bash
npx tsc --noEmit
npm test
npm run build
```

Esperado: `tsc` sem saída; **162 testes** (161 + 1); build lista as 4 rotas novas de `/produtos*`.

```bash
git add lib/db/queries.ts components/RestoreButton.tsx components/PurgeButton.tsx app/\(app\)/admin/lixeira components/Sidebar.tsx tests/integracao.test.ts
git commit -m "Estende lixeira, auditoria e menu para o modulo Produtos"
```
