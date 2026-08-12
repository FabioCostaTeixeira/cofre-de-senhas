# Contratação (avulso / combo / plano) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tela nova onde o operador registra que um cliente comprou um produto avulso, um
combo ou um plano, gerando saldo consumível por produto — pré-requisito do módulo de Ordem
de Serviço (spec futura).

**Architecture:** Duas tabelas novas: `contratacoes` (a venda) e `contratacao_itens` (o
saldo, sempre achatado no nível de produto). Ao criar a contratação, o backend expande
combo/plano em produtos via `combo_itens`/`plano_itens` (até 2 níveis: plano → combo →
produto), soma quantidades repetidas, e grava tudo numa transação. Segue o mesmo padrão de
CRUD já usado em Produtos/Combos/Planos (server actions, `useActionState`, soft-delete,
`requireMaster()`).

**Tech Stack:** Next.js 15 App Router, TypeScript strict, Neon Postgres sem ORM, vitest
(node + jsdom).

**Spec:** [docs/superpowers/specs/2026-08-12-contratacao-plano-design.md](../specs/2026-08-12-contratacao-plano-design.md)

## Global Constraints

- `npx tsc --noEmit` limpo e `npm test` passando ao fim de toda task.
- Colunas Postgres `numeric` voltam como **string** no driver `@neondatabase/serverless`:
  toda query que lê `preco_total` faz `preco_total::float8 as preco_total` (mesma regra já
  usada em `produtos`/`combos`/`planos`).
- `sql.transaction([...])` não é interativo: todo id necessário dentro dela nasce antes, com
  `randomUUID()` (mesmo padrão de `createCombo`/`createPlano`).
- Autorização: `requireMaster()` na rota/actions; `canManageContratacoes()` só decide
  visibilidade no menu (cosmético — mesmo padrão de `canManageProdutos`).
- `contratacao_itens` nunca referencia combo/plano diretamente, só `produto_id` — a
  expansão acontece em código (`lib/db/contratacoes.ts`), não em SQL.
- Cancelamento = soft-delete (`deleted_at`), preserva `quantidade_consumida` intacta.
- Identificadores em português. Sem dependência nova, sem env var nova.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `db/migrations/010_contratacoes.sql` (novo) | Tabelas `contratacoes` e `contratacao_itens`. |
| `lib/types.ts` (modificar) | `TipoContratacao`, `ContratacaoItemSaldo`, `Contratacao`, `DadosContratacao`. |
| `lib/authz.ts` (modificar) | `canManageContratacoes()`. |
| `lib/db/audit.ts` (modificar) | `entityType` ganha `'contratacao'`. |
| `lib/contratacao-form.ts` (novo) | Leitura/validação de `FormData` — puro, sem I/O. |
| `lib/db/contratacoes.ts` (novo) | Expansão avulso/combo/plano → itens, `createContratacao`, `listContratacoes`, `softDeleteContratacao`. |
| `components/ContratacaoClient.tsx` (novo) | Formulário (3 modos) + lista com saldo e cancelamento. |
| `app/(app)/contratacoes/page.tsx`, `actions.ts` (novos) | Rota master-only. |
| `components/Sidebar.tsx` (modificar) | Item de menu novo "Contratações". |

---

## Task 1: Migration, tipos, permissão e auditoria

**Files:**
- Create: `db/migrations/010_contratacoes.sql`
- Modify: `lib/types.ts`, `lib/authz.ts`, `lib/db/audit.ts`

**Interfaces:**
- Produces: tabelas `contratacoes`, `contratacao_itens`; tipos `TipoContratacao`,
  `ContratacaoItemSaldo`, `Contratacao`, `DadosContratacao`; `canManageContratacoes(actor): boolean`;
  `'contratacao'` no union `entityType` de `audit()`.

- [ ] **Step 1: Escrever a migration**

Criar `db/migrations/010_contratacoes.sql`:

```sql
-- Contratação: registro de que um cliente comprou um produto avulso, combo ou plano.
-- Gera saldo consumível por produto em contratacao_itens, que o módulo de Ordem de
-- Serviço (spec futura) vai consultar e decrementar. deleted_at aqui significa
-- "contratação cancelada" (mesmo padrão de soft-delete do resto do sistema) — cancelar
-- não mexe em quantidade_consumida, preservando o histórico de consumo já feito.
create table contratacoes (
  id              uuid primary key default gen_random_uuid(),
  cliente_id      uuid not null references clientes(id),
  tipo            text not null check (tipo in ('avulso', 'combo', 'plano')),
  produto_id      uuid references produtos(id),
  combo_id        uuid references combos(id),
  plano_id        uuid references planos(id),
  quantidade      int not null check (quantidade > 0),
  preco_total     numeric(10,2) not null check (preco_total >= 0),
  data_validade   date,
  deleted_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (
    (tipo = 'avulso' and produto_id is not null and combo_id is null and plano_id is null) or
    (tipo = 'combo' and combo_id is not null and produto_id is null and plano_id is null) or
    (tipo = 'plano' and plano_id is not null and produto_id is null and combo_id is null)
  )
);
create index contratacoes_cliente_idx on contratacoes (cliente_id);

-- Sempre no nível de produto (nunca combo/plano diretamente), mesmo quando a
-- contratação foi de um combo/plano — o produto_id vem da expansão de combo_itens/
-- plano_itens feita em código (lib/db/contratacoes.ts) no momento da criação.
create table contratacao_itens (
  id                    uuid primary key default gen_random_uuid(),
  contratacao_id        uuid not null references contratacoes(id) on delete cascade,
  produto_id            uuid not null references produtos(id),
  quantidade_total      int not null check (quantidade_total > 0),
  quantidade_consumida  int not null default 0 check (quantidade_consumida >= 0 and quantidade_consumida <= quantidade_total)
);
create index contratacao_itens_contratacao_idx on contratacao_itens (contratacao_id);
create index contratacao_itens_produto_idx on contratacao_itens (produto_id);
```

- [ ] **Step 2: Aplicar**

```bash
npm run migrate
```

Esperado: `+ aplicando 010_contratacoes.sql...` seguido de sucesso.

- [ ] **Step 3: Acrescentar os tipos em `lib/types.ts`**

No final do arquivo:

```ts
export type TipoContratacao = 'avulso' | 'combo' | 'plano';

export type ContratacaoItemSaldo = {
  produto_id: string;
  produto_nome: string;
  quantidade_total: number;
  quantidade_consumida: number;
};

export type Contratacao = {
  id: string;
  cliente_id: string;
  cliente_nome: string;
  tipo: TipoContratacao;
  produto_id: string | null;
  combo_id: string | null;
  plano_id: string | null;
  item_nome: string;
  quantidade: number;
  preco_total: number;
  data_validade: string | null;
  cancelada: boolean;
  created_at: string;
  itens: ContratacaoItemSaldo[];
};

export type DadosContratacao = {
  cliente_id: string;
  tipo: TipoContratacao;
  produto_id: string | null;
  combo_id: string | null;
  plano_id: string | null;
  quantidade: number;
};
```

- [ ] **Step 4: Acrescentar a permissão em `lib/authz.ts`**

Logo abaixo de `canManageAgenda`:

```ts
export const canManageContratacoes = (actor: Actor) => isMaster(actor);
```

- [ ] **Step 5: Acrescentar `'contratacao'` ao `entityType` em `lib/db/audit.ts`**

```ts
  entityType?: 'credential' | 'room' | 'user' | 'cliente' | 'fornecedor' | 'categoria_produto'
    | 'produto' | 'combo' | 'plano' | 'local_gravacao' | 'estudio' | 'agendamento' | 'bloqueio_estudio'
    | 'contratacao';
```

- [ ] **Step 6: Verificar**

```bash
npx tsc --noEmit
npm test
```

Esperado: ambos limpos (o `entityType` novo e os tipos novos não quebram nada existente,
pois só acrescentam opções).

- [ ] **Step 7: Commit**

```bash
git add db/migrations/010_contratacoes.sql lib/types.ts lib/authz.ts lib/db/audit.ts
git commit -m "Adiciona schema, tipos e permissão de Contratação"
```

---

## Task 2: Validação de formulário (`lib/contratacao-form.ts`)

**Files:**
- Create: `lib/contratacao-form.ts`
- Test: `tests/contratacao-form.test.ts`

**Interfaces:**
- Consumes: `DadosContratacao`, `TipoContratacao` (Task 1).
- Produces: `lerDadosContratacao(fd: FormData): DadosContratacao | { error: string }`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/contratacao-form.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { lerDadosContratacao } from '@/lib/contratacao-form';

function formData(campos: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
}

describe('lerDadosContratacao', () => {
  it('sem cliente retorna erro', () => {
    const r = lerDadosContratacao(formData({ tipo: 'avulso', produtoId: 'p1', quantidade: '2' }));
    expect(r).toEqual({ error: 'Escolha o cliente.' });
  });

  it('tipo inválido retorna erro', () => {
    const r = lerDadosContratacao(formData({ clienteId: 'c1', tipo: 'combo_avulso', quantidade: '1' }));
    expect(r).toEqual({ error: 'Escolha o tipo de contratação.' });
  });

  it('quantidade vazia retorna erro', () => {
    const r = lerDadosContratacao(formData({ clienteId: 'c1', tipo: 'avulso', produtoId: 'p1', quantidade: '' }));
    expect(r).toEqual({ error: 'Quantidade precisa ser um número inteiro maior que zero.' });
  });

  it('quantidade zero retorna erro', () => {
    const r = lerDadosContratacao(formData({ clienteId: 'c1', tipo: 'avulso', produtoId: 'p1', quantidade: '0' }));
    expect(r).toEqual({ error: 'Quantidade precisa ser um número inteiro maior que zero.' });
  });

  it('quantidade não inteira retorna erro', () => {
    const r = lerDadosContratacao(formData({ clienteId: 'c1', tipo: 'avulso', produtoId: 'p1', quantidade: '2.5' }));
    expect(r).toEqual({ error: 'Quantidade precisa ser um número inteiro maior que zero.' });
  });

  it('avulso sem produto retorna erro', () => {
    const r = lerDadosContratacao(formData({ clienteId: 'c1', tipo: 'avulso', quantidade: '1' }));
    expect(r).toEqual({ error: 'Escolha o produto.' });
  });

  it('combo sem combo retorna erro', () => {
    const r = lerDadosContratacao(formData({ clienteId: 'c1', tipo: 'combo', quantidade: '1' }));
    expect(r).toEqual({ error: 'Escolha o combo.' });
  });

  it('plano sem plano retorna erro', () => {
    const r = lerDadosContratacao(formData({ clienteId: 'c1', tipo: 'plano', quantidade: '1' }));
    expect(r).toEqual({ error: 'Escolha o plano.' });
  });

  it('avulso válido é lido corretamente', () => {
    const r = lerDadosContratacao(formData({ clienteId: 'c1', tipo: 'avulso', produtoId: 'p1', quantidade: '3' }));
    expect(r).toEqual({ cliente_id: 'c1', tipo: 'avulso', produto_id: 'p1', combo_id: null, plano_id: null, quantidade: 3 });
  });

  it('combo válido é lido corretamente', () => {
    const r = lerDadosContratacao(formData({ clienteId: 'c1', tipo: 'combo', comboId: 'cb1', quantidade: '2' }));
    expect(r).toEqual({ cliente_id: 'c1', tipo: 'combo', produto_id: null, combo_id: 'cb1', plano_id: null, quantidade: 2 });
  });

  it('plano válido é lido corretamente', () => {
    const r = lerDadosContratacao(formData({ clienteId: 'c1', tipo: 'plano', planoId: 'pl1', quantidade: '1' }));
    expect(r).toEqual({ cliente_id: 'c1', tipo: 'plano', produto_id: null, combo_id: null, plano_id: 'pl1', quantidade: 1 });
  });
});
```

Run: `npx vitest run tests/contratacao-form.test.ts`
Expected: FAIL (`Cannot find module '@/lib/contratacao-form'`).

- [ ] **Step 2: Implementar `lib/contratacao-form.ts`**

```ts
import type { DadosContratacao, TipoContratacao } from '@/lib/types';

export function lerDadosContratacao(fd: FormData): DadosContratacao | { error: string } {
  const cliente_id = String(fd.get('clienteId') ?? '');
  if (!cliente_id) return { error: 'Escolha o cliente.' };

  const tipoBruto = String(fd.get('tipo') ?? '');
  if (tipoBruto !== 'avulso' && tipoBruto !== 'combo' && tipoBruto !== 'plano') {
    return { error: 'Escolha o tipo de contratação.' };
  }
  const tipo = tipoBruto as TipoContratacao;

  const quantidadeBruta = String(fd.get('quantidade') ?? '').trim();
  const quantidade = Number(quantidadeBruta);
  if (!quantidadeBruta || !Number.isInteger(quantidade) || quantidade <= 0) {
    return { error: 'Quantidade precisa ser um número inteiro maior que zero.' };
  }

  if (tipo === 'avulso') {
    const produto_id = String(fd.get('produtoId') ?? '');
    if (!produto_id) return { error: 'Escolha o produto.' };
    return { cliente_id, tipo, produto_id, combo_id: null, plano_id: null, quantidade };
  }
  if (tipo === 'combo') {
    const combo_id = String(fd.get('comboId') ?? '');
    if (!combo_id) return { error: 'Escolha o combo.' };
    return { cliente_id, tipo, produto_id: null, combo_id, plano_id: null, quantidade };
  }
  const plano_id = String(fd.get('planoId') ?? '');
  if (!plano_id) return { error: 'Escolha o plano.' };
  return { cliente_id, tipo, produto_id: null, combo_id: null, plano_id, quantidade };
}
```

- [ ] **Step 3: Rodar e confirmar que passa**

```bash
npx vitest run tests/contratacao-form.test.ts
```

Expected: PASS, 11 testes.

- [ ] **Step 4: Commit**

```bash
git add lib/contratacao-form.ts tests/contratacao-form.test.ts
git commit -m "Adiciona validação de formulário de Contratação"
```

---

## Task 3: Persistência e expansão de saldo (`lib/db/contratacoes.ts`)

Esta é a task mais sensível do plano: a expansão de combo/plano em `contratacao_itens`
achatados por produto. Testada contra o banco real (mesmo padrão do resto do projeto —
não há mocks de SQL nesta base).

**Files:**
- Create: `lib/db/contratacoes.ts`
- Test: acrescentar em `tests/integracao.test.ts`

**Interfaces:**
- Consumes: `getProduto` (`lib/db/produtos.ts`), `getCombo` (`lib/db/combos.ts`),
  `getPlano` (`lib/db/planos.ts`), `sql`/`sql.transaction` (`lib/db/client.ts`),
  `assertUuid`/`NotFoundError`, `DadosContratacao`/`Contratacao` (Task 1).
- Produces: `listContratacoes(): Promise<Contratacao[]>`,
  `createContratacao(dados: DadosContratacao): Promise<string>`,
  `softDeleteContratacao(id: string): Promise<void>`, `ItemInativoError`.

- [ ] **Step 1: Teste de integração que falha**

Em `tests/integracao.test.ts`, acrescentar dentro do describe principal (depois do último
`it`, antes do `});` final):

```ts
  it('avulso e combo: expande itens corretamente e calcula preço total', async () => {
    const terceiros = await import('@/lib/db/terceiros');
    const cat = await import('@/lib/db/categorias-produto');
    const prod = await import('@/lib/db/produtos');
    const combos = await import('@/lib/db/combos');
    const ct = await import('@/lib/db/contratacoes');

    const clienteId = await terceiros.createTerceiro('clientes', {
      nome: `${marca}-cliente-contratacao-1`, contato_responsavel: null, email: null,
      telefone: null, cidade: null, uf: null,
    });
    const categoriaId = await cat.createCategoria({
      nome: `${marca}-categoria-contratacao-1`, unidade_consumo: null, atributos_molde: [], ativo: true,
    });
    const produtoAId = await prod.createProduto({
      categoria_id: categoriaId, nome: `${marca}-produtoA`, descricao: null, atributos: {}, preco: 100, ativo: true,
    });
    const produtoBId = await prod.createProduto({
      categoria_id: categoriaId, nome: `${marca}-produtoB`, descricao: null, atributos: {}, preco: 50, ativo: true,
    });
    const comboId = await combos.createCombo({
      nome: `${marca}-combo`, descricao: null, preco: 300, ativo: true,
      itens: [{ tipo: 'produto', valor: produtoAId, quantidade: 2 }, { tipo: 'produto', valor: produtoBId, quantidade: 1 }],
    });

    // Avulso: 3x produtoA, preço = 100 * 3.
    const avulsoId = await ct.createContratacao({
      cliente_id: clienteId, tipo: 'avulso', produto_id: produtoAId, combo_id: null, plano_id: null, quantidade: 3,
    });
    const lista1 = await ct.listContratacoes();
    const avulso = lista1.find((c) => c.id === avulsoId)!;
    expect(avulso.preco_total).toBe(300);
    expect(avulso.data_validade).toBeNull();
    expect(avulso.itens).toEqual([
      { produto_id: produtoAId, produto_nome: `${marca}-produtoA`, quantidade_total: 3, quantidade_consumida: 0 },
    ]);

    // Combo comprado 2x: itens do combo (2x produtoA, 1x produtoB) multiplicados por 2.
    const comboContratId = await ct.createContratacao({
      cliente_id: clienteId, tipo: 'combo', produto_id: null, combo_id: comboId, plano_id: null, quantidade: 2,
    });
    const lista2 = await ct.listContratacoes();
    const comboContrat = lista2.find((c) => c.id === comboContratId)!;
    expect(comboContrat.preco_total).toBe(600);
    const itensOrdenados = [...comboContrat.itens].sort((a, b) => a.produto_nome.localeCompare(b.produto_nome));
    expect(itensOrdenados).toEqual([
      { produto_id: produtoAId, produto_nome: `${marca}-produtoA`, quantidade_total: 4, quantidade_consumida: 0 },
      { produto_id: produtoBId, produto_nome: `${marca}-produtoB`, quantidade_total: 2, quantidade_consumida: 0 },
    ]);

    await sql`delete from contratacoes where id in (${avulsoId}, ${comboContratId})`;
    await sql`delete from combo_itens where combo_id = ${comboId}`;
    await sql`delete from combos where id = ${comboId}`;
    await sql`delete from produtos where id in (${produtoAId}, ${produtoBId})`;
    await sql`delete from categorias_produto where id = ${categoriaId}`;
    await sql`delete from clientes where id = ${clienteId}`;
  });

  it('plano pacote_fechado expande produto direto e combo aninhado, soma repetidos e calcula validade; assinatura não expira', async () => {
    const terceiros = await import('@/lib/db/terceiros');
    const cat = await import('@/lib/db/categorias-produto');
    const prod = await import('@/lib/db/produtos');
    const combos = await import('@/lib/db/combos');
    const planos = await import('@/lib/db/planos');
    const ct = await import('@/lib/db/contratacoes');

    const clienteId = await terceiros.createTerceiro('clientes', {
      nome: `${marca}-cliente-contratacao-2`, contato_responsavel: null, email: null,
      telefone: null, cidade: null, uf: null,
    });
    const categoriaId = await cat.createCategoria({
      nome: `${marca}-categoria-contratacao-2`, unidade_consumo: null, atributos_molde: [], ativo: true,
    });
    const produtoAId = await prod.createProduto({
      categoria_id: categoriaId, nome: `${marca}-produtoA2`, descricao: null, atributos: {}, preco: 100, ativo: true,
    });
    const produtoBId = await prod.createProduto({
      categoria_id: categoriaId, nome: `${marca}-produtoB2`, descricao: null, atributos: {}, preco: 50, ativo: true,
    });
    // Combo com 2x produtoA — usado dentro do plano, pra testar expansão de 2 níveis.
    const comboId = await combos.createCombo({
      nome: `${marca}-combo2`, descricao: null, preco: 250, ativo: true,
      itens: [{ tipo: 'produto', valor: produtoAId, quantidade: 2 }],
    });
    // Plano pacote_fechado: 1x produtoA direto + 1x comboId (que expande em 2x produtoA) → total produtoA = 3.
    const planoFechadoId = await planos.createPlano({
      nome: `${marca}-plano-fechado`, descricao: null, tipo_cobranca: 'pacote_fechado',
      validade_dias: 30, ciclo: null, preco: 500, ativo: true,
      itens: [{ tipo: 'produto', valor: produtoAId, quantidade: 1 }, { tipo: 'combo', valor: comboId, quantidade: 1 }],
    });
    const planoAssinaturaId = await planos.createPlano({
      nome: `${marca}-plano-assinatura`, descricao: null, tipo_cobranca: 'assinatura',
      validade_dias: null, ciclo: 'mensal', preco: 200, ativo: true,
      itens: [{ tipo: 'produto', valor: produtoBId, quantidade: 3 }],
    });

    const fechadoId = await ct.createContratacao({
      cliente_id: clienteId, tipo: 'plano', produto_id: null, combo_id: null, plano_id: planoFechadoId, quantidade: 1,
    });
    const listaFechado = await ct.listContratacoes();
    const fechado = listaFechado.find((c) => c.id === fechadoId)!;
    expect(fechado.itens).toEqual([
      { produto_id: produtoAId, produto_nome: `${marca}-produtoA2`, quantidade_total: 3, quantidade_consumida: 0 },
    ]);
    const esperado = new Date();
    esperado.setDate(esperado.getDate() + 30);
    expect(fechado.data_validade).toBe(esperado.toISOString().slice(0, 10));

    const assinaturaId = await ct.createContratacao({
      cliente_id: clienteId, tipo: 'plano', produto_id: null, combo_id: null, plano_id: planoAssinaturaId, quantidade: 1,
    });
    const listaAssinatura = await ct.listContratacoes();
    const assinatura = listaAssinatura.find((c) => c.id === assinaturaId)!;
    expect(assinatura.data_validade).toBeNull();
    expect(assinatura.itens).toEqual([
      { produto_id: produtoBId, produto_nome: `${marca}-produtoB2`, quantidade_total: 3, quantidade_consumida: 0 },
    ]);

    await sql`delete from contratacoes where id in (${fechadoId}, ${assinaturaId})`;
    await sql`delete from plano_itens where plano_id in (${planoFechadoId}, ${planoAssinaturaId})`;
    await sql`delete from planos where id in (${planoFechadoId}, ${planoAssinaturaId})`;
    await sql`delete from combo_itens where combo_id = ${comboId}`;
    await sql`delete from combos where id = ${comboId}`;
    await sql`delete from produtos where id in (${produtoAId}, ${produtoBId})`;
    await sql`delete from categorias_produto where id = ${categoriaId}`;
    await sql`delete from clientes where id = ${clienteId}`;
  });

  it('contratação de item inativo é rejeitada', async () => {
    const terceiros = await import('@/lib/db/terceiros');
    const cat = await import('@/lib/db/categorias-produto');
    const prod = await import('@/lib/db/produtos');
    const ct = await import('@/lib/db/contratacoes');

    const clienteId = await terceiros.createTerceiro('clientes', {
      nome: `${marca}-cliente-contratacao-3`, contato_responsavel: null, email: null,
      telefone: null, cidade: null, uf: null,
    });
    const categoriaId = await cat.createCategoria({
      nome: `${marca}-categoria-contratacao-3`, unidade_consumo: null, atributos_molde: [], ativo: true,
    });
    const produtoId = await prod.createProduto({
      categoria_id: categoriaId, nome: `${marca}-produto-inativo`, descricao: null, atributos: {}, preco: 10, ativo: false,
    });

    await expect(ct.createContratacao({
      cliente_id: clienteId, tipo: 'avulso', produto_id: produtoId, combo_id: null, plano_id: null, quantidade: 1,
    })).rejects.toThrow(ct.ItemInativoError);

    await sql`delete from produtos where id = ${produtoId}`;
    await sql`delete from categorias_produto where id = ${categoriaId}`;
    await sql`delete from clientes where id = ${clienteId}`;
  });

  it('cancelamento faz soft-delete sem alterar quantidade_consumida', async () => {
    const terceiros = await import('@/lib/db/terceiros');
    const cat = await import('@/lib/db/categorias-produto');
    const prod = await import('@/lib/db/produtos');
    const ct = await import('@/lib/db/contratacoes');

    const clienteId = await terceiros.createTerceiro('clientes', {
      nome: `${marca}-cliente-contratacao-4`, contato_responsavel: null, email: null,
      telefone: null, cidade: null, uf: null,
    });
    const categoriaId = await cat.createCategoria({
      nome: `${marca}-categoria-contratacao-4`, unidade_consumo: null, atributos_molde: [], ativo: true,
    });
    const produtoId = await prod.createProduto({
      categoria_id: categoriaId, nome: `${marca}-produto-cancelamento`, descricao: null, atributos: {}, preco: 10, ativo: true,
    });

    const id = await ct.createContratacao({
      cliente_id: clienteId, tipo: 'avulso', produto_id: produtoId, combo_id: null, plano_id: null, quantidade: 5,
    });
    // Simula consumo parcial que a futura OS faria.
    await sql`update contratacao_itens set quantidade_consumida = 2 where contratacao_id = ${id}`;

    await ct.softDeleteContratacao(id);
    const lista = await ct.listContratacoes();
    const cancelada = lista.find((c) => c.id === id)!;
    expect(cancelada.cancelada).toBe(true);
    expect(cancelada.itens[0].quantidade_consumida).toBe(2);
    expect(cancelada.itens[0].quantidade_total).toBe(5);

    await expect(ct.softDeleteContratacao(id)).rejects.toThrow();

    await sql`delete from contratacoes where id = ${id}`;
    await sql`delete from produtos where id = ${produtoId}`;
    await sql`delete from categorias_produto where id = ${categoriaId}`;
    await sql`delete from clientes where id = ${clienteId}`;
  });
```

Run: `npx vitest run tests/integracao.test.ts`
Expected: FAIL (`@/lib/db/contratacoes` inexistente) — ou SKIP inteiro se `DATABASE_URL`/`VAULT_KEY`
não estiverem no ambiente (nesse caso, prossiga para o Step 2 e valide via `npx tsc --noEmit`;
rode a suíte de integração quando tiver acesso ao banco).

- [ ] **Step 2: Implementar `lib/db/contratacoes.ts`**

```ts
import { randomUUID } from 'node:crypto';
import { sql } from '@/lib/db/client';
import { NotFoundError } from '@/lib/authz';
import { assertUuid } from '@/lib/validation';
import { getCombo } from '@/lib/db/combos';
import { getPlano } from '@/lib/db/planos';
import { getProduto } from '@/lib/db/produtos';
import type { Contratacao, DadosContratacao } from '@/lib/types';

export class ItemInativoError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
  }
}

type ItemFlat = { produto_id: string; quantidade: number };
type Resolvido = { precoTotal: number; dataValidade: string | null; itens: ItemFlat[] };

/** Soma quantidades repetidas do mesmo produto numa única entrada. */
function mesclarPorProduto(itens: ItemFlat[]): ItemFlat[] {
  const mapa = new Map<string, number>();
  for (const i of itens) mapa.set(i.produto_id, (mapa.get(i.produto_id) ?? 0) + i.quantidade);
  return [...mapa.entries()].map(([produto_id, quantidade]) => ({ produto_id, quantidade }));
}

async function resolverAvulso(produtoId: string, quantidade: number): Promise<Resolvido> {
  assertUuid(produtoId);
  const produto = await getProduto(produtoId);
  if (!produto || !produto.ativo) throw new ItemInativoError('Este produto não está disponível.');
  return { precoTotal: produto.preco * quantidade, dataValidade: null, itens: [{ produto_id: produtoId, quantidade }] };
}

async function resolverCombo(comboId: string, quantidade: number): Promise<Resolvido> {
  assertUuid(comboId);
  const combo = await getCombo(comboId);
  if (!combo || !combo.ativo) throw new ItemInativoError('Este combo não está disponível.');
  const itens = mesclarPorProduto(
    combo.itens.map((i) => ({ produto_id: i.valor, quantidade: i.quantidade * quantidade })),
  );
  return { precoTotal: combo.preco * quantidade, dataValidade: null, itens };
}

async function resolverPlano(planoId: string, quantidade: number): Promise<Resolvido> {
  assertUuid(planoId);
  const plano = await getPlano(planoId);
  if (!plano || !plano.ativo) throw new ItemInativoError('Este plano não está disponível.');

  const flat: ItemFlat[] = [];
  for (const item of plano.itens) {
    if (item.tipo === 'produto') {
      flat.push({ produto_id: item.valor, quantidade: item.quantidade * quantidade });
      continue;
    }
    const combo = await getCombo(item.valor);
    if (!combo) throw new ItemInativoError('Este plano contém um combo que não existe mais.');
    for (const ci of combo.itens) {
      flat.push({ produto_id: ci.valor, quantidade: ci.quantidade * item.quantidade * quantidade });
    }
  }

  let dataValidade: string | null = null;
  if (plano.tipo_cobranca === 'pacote_fechado' && plano.validade_dias !== null) {
    const data = new Date();
    data.setDate(data.getDate() + plano.validade_dias);
    dataValidade = data.toISOString().slice(0, 10);
  }

  return { precoTotal: plano.preco * quantidade, dataValidade, itens: mesclarPorProduto(flat) };
}

export async function createContratacao(dados: DadosContratacao): Promise<string> {
  const resolvido = dados.tipo === 'avulso'
    ? await resolverAvulso(dados.produto_id!, dados.quantidade)
    : dados.tipo === 'combo'
      ? await resolverCombo(dados.combo_id!, dados.quantidade)
      : await resolverPlano(dados.plano_id!, dados.quantidade);

  const id = randomUUID();
  await sql.transaction([
    sql`insert into contratacoes (id, cliente_id, tipo, produto_id, combo_id, plano_id, quantidade, preco_total, data_validade)
        values (${id}, ${dados.cliente_id}, ${dados.tipo}, ${dados.produto_id}, ${dados.combo_id}, ${dados.plano_id},
                ${dados.quantidade}, ${resolvido.precoTotal}, ${resolvido.dataValidade})`,
    ...resolvido.itens.map((i) => sql`
      insert into contratacao_itens (contratacao_id, produto_id, quantidade_total)
      values (${id}, ${i.produto_id}, ${i.quantidade})`),
  ]);
  return id;
}

export async function listContratacoes(): Promise<Contratacao[]> {
  return (await sql`
    select ct.id, ct.cliente_id, cl.nome as cliente_nome, ct.tipo,
           ct.produto_id, ct.combo_id, ct.plano_id,
           coalesce(p.nome, c.nome, pl.nome) as item_nome,
           ct.quantidade, ct.preco_total::float8 as preco_total,
           ct.data_validade::text as data_validade,
           (ct.deleted_at is not null) as cancelada,
           ct.created_at,
           coalesce(
             json_agg(
               json_build_object(
                 'produto_id', ci.produto_id, 'produto_nome', cp.nome,
                 'quantidade_total', ci.quantidade_total, 'quantidade_consumida', ci.quantidade_consumida
               ) order by cp.nome
             ) filter (where ci.id is not null), '[]'
           ) as itens
      from contratacoes ct
      join clientes cl on cl.id = ct.cliente_id
      left join produtos p on p.id = ct.produto_id
      left join combos c on c.id = ct.combo_id
      left join planos pl on pl.id = ct.plano_id
      left join contratacao_itens ci on ci.contratacao_id = ct.id
      left join produtos cp on cp.id = ci.produto_id
     group by ct.id, cl.nome, p.nome, c.nome, pl.nome
     order by ct.created_at desc`) as Contratacao[];
}

export async function softDeleteContratacao(id: string): Promise<void> {
  assertUuid(id);
  const rows = (await sql`
    update contratacoes set deleted_at = now()
     where id = ${id} and deleted_at is null
     returning id`) as { id: string }[];
  if (!rows[0]) throw new NotFoundError();
}
```

- [ ] **Step 3: Rodar e confirmar que passa**

```bash
npx vitest run tests/integracao.test.ts
npx tsc --noEmit
```

Expected: PASS (ou SKIP da suíte inteira sem `DATABASE_URL`, sem falhas de tipo).

- [ ] **Step 4: Commit**

```bash
git add lib/db/contratacoes.ts tests/integracao.test.ts
git commit -m "Adiciona persistência e expansão de saldo de Contratação"
```

---

## Task 4: Tela, rota, actions e menu

**Files:**
- Create: `components/ContratacaoClient.tsx`, `app/(app)/contratacoes/actions.ts`,
  `app/(app)/contratacoes/page.tsx`
- Modify: `components/Sidebar.tsx`
- Test: `tests/ContratacaoClient.test.tsx`

**Interfaces:**
- Consumes: `lerDadosContratacao` (Task 2); `createContratacao`, `ItemInativoError`,
  `listContratacoes`, `softDeleteContratacao` (Task 3); `canManageContratacoes` (Task 1);
  `listTerceiros('clientes')`, `listProdutos`, `listCombos`, `listPlanos` (infra existente);
  `requireMaster`, `audit`, `isUuid`.
- Produces: componente `ContratacaoClient` com `export type ContratacaoState = { error?: string; ok?: string }`.

- [ ] **Step 1: Tela — teste jsdom que falha**

Criar `tests/ContratacaoClient.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ContratacaoClient } from '@/components/ContratacaoClient';
import type { Combo, Contratacao, Plano, Produto, Terceiro } from '@/lib/types';

const cliente: Terceiro = {
  id: '11111111-1111-1111-1111-111111111111', nome: 'Cliente Um', contato_responsavel: null,
  email: null, telefone: null, cidade: null, uf: null, created_at: '2026-01-01T00:00:00Z',
};
const produto: Produto = {
  id: '22222222-2222-2222-2222-222222222222', categoria_id: 'cat1', nome: 'Sessão de Estúdio',
  descricao: null, atributos: {}, preco: 100, ativo: true, created_at: '2026-01-01T00:00:00Z',
};
const combo: Combo = {
  id: '33333333-3333-3333-3333-333333333333', nome: 'Combo Foto', descricao: null, preco: 250,
  ativo: true, created_at: '2026-01-01T00:00:00Z', itens: [],
};
const plano: Plano = {
  id: '44444444-4444-4444-4444-444444444444', nome: 'Plano Mensal', descricao: null,
  tipo_cobranca: 'assinatura', validade_dias: null, ciclo: 'mensal', preco: 300, ativo: true,
  created_at: '2026-01-01T00:00:00Z', itens: [],
};
const contratacaoExistente: Contratacao = {
  id: '55555555-5555-5555-5555-555555555555', cliente_id: cliente.id, cliente_nome: cliente.nome,
  tipo: 'avulso', produto_id: produto.id, combo_id: null, plano_id: null, item_nome: produto.nome,
  quantidade: 2, preco_total: 200, data_validade: null, cancelada: false, created_at: '2026-01-01T00:00:00Z',
  itens: [{ produto_id: produto.id, produto_nome: produto.nome, quantidade_total: 2, quantidade_consumida: 0 }],
};

const criar = vi.fn();
const apagar = vi.fn();

afterEach(() => cleanup());

describe('ContratacaoClient', () => {
  it('lista contratações com cliente, item e saldo', () => {
    render(
      <ContratacaoClient
        itens={[contratacaoExistente]} clientes={[cliente]} produtos={[produto]} combos={[combo]} planos={[plano]}
        criar={criar} apagar={apagar}
      />,
    );
    expect(screen.getByText('Cliente Um')).toBeInTheDocument();
    expect(screen.getByText('Sessão de Estúdio')).toBeInTheDocument();
    expect(screen.getByText('2/2')).toBeInTheDocument();
  });

  it('trocar o tipo troca as opções do select de item e calcula o total', () => {
    render(
      <ContratacaoClient
        itens={[]} clientes={[cliente]} produtos={[produto]} combos={[combo]} planos={[plano]}
        criar={criar} apagar={apagar}
      />,
    );
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'combo' } });
    expect(screen.getByLabelText('Combo')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Combo'), { target: { value: combo.id } });
    fireEvent.change(screen.getByLabelText('Quantidade'), { target: { value: '2' } });
    expect(screen.getByText('Total: R$ 500.00')).toBeInTheDocument();
  });

  it('cancelar chama apagar com o id da contratação', async () => {
    apagar.mockResolvedValueOnce({});
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(
      <ContratacaoClient
        itens={[contratacaoExistente]} clientes={[cliente]} produtos={[produto]} combos={[combo]} planos={[plano]}
        criar={criar} apagar={apagar}
      />,
    );
    fireEvent.click(screen.getByText('Cancelar'));
    await vi.waitFor(() => expect(apagar).toHaveBeenCalledWith(contratacaoExistente.id));
  });
});
```

Run: `npx vitest run tests/ContratacaoClient.test.tsx`
Expected: FAIL (`@/components/ContratacaoClient` inexistente).

- [ ] **Step 2: Implementar `components/ContratacaoClient.tsx`**

```tsx
'use client';

import { useActionState, useEffect, useState } from 'react';
import type { Combo, Contratacao, Plano, Produto, Terceiro, TipoContratacao } from '@/lib/types';

export type ContratacaoState = { error?: string; ok?: string };
const inicial: ContratacaoState = {};
type Acao = (prev: ContratacaoState, fd: FormData) => Promise<ContratacaoState>;

const ROTULOS_TIPO: Record<TipoContratacao, string> = { avulso: 'Avulso', combo: 'Combo', plano: 'Plano' };

function Formulario({
  clientes, produtos, combos, planos, criar,
}: { clientes: Terceiro[]; produtos: Produto[]; combos: Combo[]; planos: Plano[]; criar: Acao }) {
  const [state, action, pending] = useActionState(criar, inicial);
  const [tipo, setTipo] = useState<TipoContratacao>('avulso');
  const [itemId, setItemId] = useState('');
  const [quantidade, setQuantidade] = useState('1');

  const opcoes: { id: string; nome: string; preco: number }[] =
    tipo === 'avulso' ? produtos.filter((p) => p.ativo)
      : tipo === 'combo' ? combos.filter((c) => c.ativo)
        : planos.filter((p) => p.ativo);

  const itemEscolhido = opcoes.find((o) => o.id === itemId);
  const precoTotal = (itemEscolhido?.preco ?? 0) * (Number(quantidade) || 0);
  const campoItem = tipo === 'avulso' ? 'produtoId' : tipo === 'combo' ? 'comboId' : 'planoId';
  const rotuloItem = tipo === 'avulso' ? 'Produto' : tipo === 'combo' ? 'Combo' : 'Plano';

  useEffect(() => { setItemId(''); }, [tipo]);
  useEffect(() => {
    if (state.ok) { setTipo('avulso'); setItemId(''); setQuantidade('1'); }
  }, [state.ok]);

  return (
    <details className="glass p-5">
      <summary className="cursor-pointer font-semibold">Nova contratação</summary>
      <form action={action} className="space-y-4 mt-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-sm">Cliente</span>
            <select name="clienteId" className="input" defaultValue="" required>
              <option value="" disabled>Escolha…</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-sm">Tipo</span>
            <select
              aria-label="Tipo" name="tipo" className="input" value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoContratacao)}
            >
              <option value="avulso">Avulso</option>
              <option value="combo">Combo</option>
              <option value="plano">Plano</option>
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-sm">{rotuloItem}</span>
            <select
              aria-label={rotuloItem} name={campoItem} className="input" value={itemId}
              onChange={(e) => setItemId(e.target.value)} required
            >
              <option value="" disabled>Escolha…</option>
              {opcoes.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-sm">Quantidade</span>
            <input
              aria-label="Quantidade" type="number" name="quantidade" className="input" min={1} step={1}
              value={quantidade} onChange={(e) => setQuantidade(e.target.value)} required
            />
          </label>
        </div>
        <p className="text-sm" style={{ color: 'var(--text-dim)' }}>Total: R$ {precoTotal.toFixed(2)}</p>
        {state.error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{state.error}</p>}
        {state.ok && <p className="text-sm" style={{ color: 'var(--ok)' }}>{state.ok}</p>}
        <button className="btn btn-primary" disabled={pending}>Contratar</button>
      </form>
    </details>
  );
}

function Lista({ itens, apagar }: { itens: Contratacao[]; apagar: (id: string) => Promise<{ error?: string }> }) {
  const [erro, setErro] = useState<string | null>(null);
  const [cancelando, setCancelando] = useState<string | null>(null);

  async function cancelarClique(id: string) {
    if (!confirm('Cancelar esta contratação?')) return;
    setCancelando(id);
    const r = await apagar(id);
    setCancelando(null);
    if (r.error) setErro(r.error);
  }

  return (
    <div className="space-y-2">
      <table className="w-full text-sm">
        <thead>
          <tr style={{ color: 'var(--text-dim)' }}>
            <th className="text-left p-2">Cliente</th>
            <th className="text-left p-2">Tipo</th>
            <th className="text-left p-2">Item</th>
            <th className="text-left p-2">Qtd</th>
            <th className="text-left p-2">Total</th>
            <th className="text-left p-2">Validade</th>
            <th className="text-left p-2">Status</th>
            <th className="text-left p-2">Saldo</th>
            <th className="p-2" />
          </tr>
        </thead>
        <tbody>
          {itens.map((c) => (
            <tr key={c.id}>
              <td className="p-2">{c.cliente_nome}</td>
              <td className="p-2">{ROTULOS_TIPO[c.tipo]}</td>
              <td className="p-2">{c.item_nome}</td>
              <td className="p-2">{c.quantidade}</td>
              <td className="p-2">R$ {c.preco_total.toFixed(2)}</td>
              <td className="p-2">
                {c.data_validade ? `${c.data_validade.slice(8, 10)}/${c.data_validade.slice(5, 7)}/${c.data_validade.slice(0, 4)}` : '—'}
              </td>
              <td className="p-2">{c.cancelada ? 'Cancelada' : 'Ativa'}</td>
              <td className="p-2">
                {c.itens.map((i) => (
                  <div key={i.produto_id}>{i.produto_nome}: {i.quantidade_total - i.quantidade_consumida}/{i.quantidade_total}</div>
                ))}
              </td>
              <td className="p-2">
                {!c.cancelada && (
                  <button
                    type="button" className="btn btn-danger" disabled={cancelando === c.id}
                    onClick={() => void cancelarClique(c.id)}
                  >
                    Cancelar
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {itens.length === 0 && <p className="text-sm" style={{ color: 'var(--text-dim)' }}>Nenhuma contratação cadastrada.</p>}
      {erro && <p className="text-sm" style={{ color: 'var(--danger)' }}>{erro}</p>}
    </div>
  );
}

export function ContratacaoClient({
  itens, clientes, produtos, combos, planos, criar, apagar,
}: {
  itens: Contratacao[]; clientes: Terceiro[]; produtos: Produto[]; combos: Combo[]; planos: Plano[];
  criar: Acao; apagar: (id: string) => Promise<{ error?: string }>;
}) {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Contratações</h1>
      <Formulario clientes={clientes} produtos={produtos} combos={combos} planos={planos} criar={criar} />
      <Lista itens={itens} apagar={apagar} />
    </div>
  );
}
```

- [ ] **Step 3: Rodar e confirmar que a tela passa**

```bash
npx vitest run tests/ContratacaoClient.test.tsx
```

Expected: PASS, 3 testes.

- [ ] **Step 4: Implementar `app/(app)/contratacoes/actions.ts`**

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { requireMaster } from '@/lib/auth/guards';
import { audit } from '@/lib/db/audit';
import { createContratacao, ItemInativoError, softDeleteContratacao } from '@/lib/db/contratacoes';
import { lerDadosContratacao } from '@/lib/contratacao-form';
import { isUuid } from '@/lib/validation';
import type { ContratacaoState } from '@/components/ContratacaoClient';

const ROTA = '/contratacoes';

export async function criarContratacao(_prev: ContratacaoState, formData: FormData): Promise<ContratacaoState> {
  const actor = await requireMaster();
  const dados = lerDadosContratacao(formData);
  if ('error' in dados) return dados;

  let id: string;
  try {
    id = await createContratacao(dados);
  } catch (err) {
    if (err instanceof ItemInativoError) return { error: err.message };
    throw err;
  }
  await audit({ actorId: actor.id, action: 'create', entityType: 'contratacao', entityId: id });
  revalidatePath(ROTA);
  return { ok: 'Contratação registrada.' };
}

export async function apagarContratacao(id: string): Promise<{ error?: string }> {
  const actor = await requireMaster();
  if (!isUuid(id)) return { error: 'Contratação não encontrada.' };

  await softDeleteContratacao(id);
  await audit({ actorId: actor.id, action: 'delete', entityType: 'contratacao', entityId: id });
  revalidatePath(ROTA);
  return {};
}
```

- [ ] **Step 5: Implementar `app/(app)/contratacoes/page.tsx`**

```tsx
import { ContratacaoClient } from '@/components/ContratacaoClient';
import { requireMaster } from '@/lib/auth/guards';
import { listCombos } from '@/lib/db/combos';
import { listContratacoes } from '@/lib/db/contratacoes';
import { listPlanos } from '@/lib/db/planos';
import { listProdutos } from '@/lib/db/produtos';
import { listTerceiros } from '@/lib/db/terceiros';
import { apagarContratacao, criarContratacao } from './actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function ContratacoesPage() {
  await requireMaster();
  const [itens, clientes, produtos, combos, planos] = await Promise.all([
    listContratacoes(), listTerceiros('clientes'), listProdutos(), listCombos(), listPlanos(),
  ]);
  return (
    <main className="p-4 md:p-6 max-w-6xl mx-auto">
      <ContratacaoClient
        itens={itens} clientes={clientes} produtos={produtos} combos={combos} planos={planos}
        criar={criarContratacao} apagar={apagarContratacao}
      />
    </main>
  );
}
```

- [ ] **Step 6: Acrescentar o item de menu em `components/Sidebar.tsx`**

No import do topo, acrescentar `ShoppingCart` à lista de ícones do `lucide-react`:

```ts
import { Building2, Boxes, CalendarClock, CalendarDays, FolderKanban, Home, Layers, MapPin, Package, ScrollText, ShoppingCart, Trash2, Truck, UserSquare2, Users, Vault } from 'lucide-react';
```

No import de `lib/authz`, acrescentar `canManageContratacoes`:

```ts
import { canManageAgenda, canManageContratacoes, canManageLocaisGravacao, canManageProdutos, canManageTerceiros } from '@/lib/authz';
```

Logo depois do grupo `Agenda` (`...(canManageAgenda(actor) ? [...] : [])`), acrescentar:

```ts
    ...(canManageContratacoes(actor)
      ? [{
          label: 'Contratações',
          icon: <ShoppingCart size={18} className={iconClass} />,
          items: [{ href: '/contratacoes', label: 'Contratações', icon: <ShoppingCart size={18} className={iconClass} /> }],
        }]
      : []),
```

- [ ] **Step 7: Rodar toda a suíte e verificar tipos**

```bash
npx tsc --noEmit
npm test
```

Expected: ambos limpos.

- [ ] **Step 8: Teste manual local**

```bash
npm run dev
```

Acessar `http://localhost:3000/contratacoes` logado como master, cadastrar uma contratação
avulsa, uma de combo e uma de plano, confirmar que a lista mostra saldo e total corretos, e
cancelar uma.

- [ ] **Step 9: Commit**

```bash
git add components/ContratacaoClient.tsx app/\(app\)/contratacoes components/Sidebar.tsx tests/ContratacaoClient.test.tsx
git commit -m "Adiciona tela, rota e menu de Contratação"
```

---

## Self-Review

- **Cobertura da spec:** modelo de dados (Task 1), 3 modos de contratação com validação
  (Task 2), expansão avulso/combo/plano com soma de repetidos e cálculo de validade (Task 3),
  tela com lista/saldo/cancelamento e wiring de rota/menu (Task 4) — todas as seções da spec
  têm task correspondente.
- **Placeholders:** nenhum "TBD"/"implementar depois" — todo código está completo em cada step.
- **Consistência de tipos:** `DadosContratacao`/`Contratacao` (Task 1) usados sem alteração de
  forma em `lerDadosContratacao` (Task 2), `createContratacao`/`listContratacoes` (Task 3) e
  `ContratacaoClient`/`actions.ts` (Task 4). `ItemInativoError` exportado na Task 3, importado
  na Task 4. `canManageContratacoes` da Task 1 usado no Sidebar na Task 4.
