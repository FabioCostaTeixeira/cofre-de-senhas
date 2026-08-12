# Ordem de Serviço (OS) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Comanda fechada onde o operador lança linhas de produto+quantidade pra um cliente,
descontando saldo de Contratação (FIFO entre contratações) e opcionalmente pré-agendando
gravação/entrega por linha — construída em cima do módulo Contratação já existente.

**Architecture:** Duas tabelas novas de linha (`os_itens`, `os_item_saldos`) mais o cabeçalho
(`ordens_servico`). Criação é 100% validada antes de qualquer escrita (saldo suficiente em
todas as linhas + sem conflito de agenda em nenhuma linha pré-agendada), depois grava tudo numa
transação só — tudo ou nada. Cancelamento reverte saldo e cancela os agendamentos vinculados,
também numa transação. Reaproveita `getProduto`, `existeBloqueioNoHorario` e a lógica de
conflito de horário já existentes.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, Neon Postgres sem ORM, vitest
(node + jsdom).

**Spec:** [docs/superpowers/specs/2026-08-12-ordem-servico-design.md](../specs/2026-08-12-ordem-servico-design.md)

## Global Constraints

- `npx tsc --noEmit` limpo e `npm test` passando ao fim de toda task.
- Colunas Postgres `numeric` não aparecem neste módulo (sem preço na OS), mas `assertUuid` é
  obrigatório em todo id que chega de fora antes de qualquer query — inclusive `cliente_id`,
  `produto_id`, `local_id`, `estudio_id` (lição da revisão final de Contratação: um id
  malformado sem `assertUuid` vaza como erro 500 cru do Postgres em vez de `NotFoundError`).
- `sql.transaction([...])` não é interativo: todo id necessário dentro dela nasce antes, com
  `randomUUID()` (mesmo padrão de `createContratacao`).
- A OS nunca vende avulso na hora — se o saldo for insuficiente, rejeita a criação inteira
  (nenhuma escrita) e o operador cria a contratação que falta antes de tentar de novo.
- `os_itens`/`os_item_saldos` têm `on delete cascade` a partir de `ordens_servico` — apagar
  (ou, em teste, limpar) uma OS já limpa as linhas e os descontos de saldo associados.
- Cancelamento de OS soma de volta `quantidade_consumida` em `contratacao_itens` e marca os
  agendamentos vinculados como `cancelado` (nunca apaga) — mesmo espírito do resto da agenda.
- OS cancelada some da lista (`listOrdensServico` filtra `deleted_at is null`), mesmo padrão já
  usado em `listContratacoes`.
- Identificadores em português. Sem dependência nova, sem env var nova.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `db/migrations/011_ordens_servico.sql` (novo) | Tabelas `ordens_servico`, `os_itens`, `os_item_saldos`. |
| `lib/types.ts` (modificar) | `OSItemLinha`, `OrdemServico`, `DadosOSItem`, `DadosOS`. |
| `lib/authz.ts` (modificar) | `canManageOrdensServico()`. |
| `lib/db/audit.ts` (modificar) | `entityType` ganha `'ordem_servico'`. |
| `lib/db/agenda.ts` (modificar) | `existeConflito` passa a ser exportada, reaproveitada pela OS. |
| `lib/os-form.ts` (novo) | Leitura/validação de `FormData` (cliente + array de itens em JSON) — puro, sem I/O. |
| `lib/db/ordens-servico.ts` (novo) | Busca de saldo FIFO, criação transacional, cancelamento em cascata, listagem. |
| `components/OSClient.tsx` (novo) | Formulário com repetidor de linhas (produto/quantidade/pré-agendar) + lista. |
| `app/(app)/ordens-servico/page.tsx`, `actions.ts` (novos) | Rota master-only. |
| `components/Sidebar.tsx` (modificar) | Item de menu novo "Ordens de Serviço". |

---

## Task 1: Migration, tipos, permissão e auditoria

**Files:**
- Create: `db/migrations/011_ordens_servico.sql`
- Modify: `lib/types.ts`, `lib/authz.ts`, `lib/db/audit.ts`

**Interfaces:**
- Produces: tabelas `ordens_servico`, `os_itens`, `os_item_saldos`; tipos `OSItemLinha`,
  `OrdemServico`, `DadosOSItem`, `DadosOS`; `canManageOrdensServico(actor): boolean`;
  `'ordem_servico'` no union `entityType` de `audit()`.

- [ ] **Step 1: Escrever a migration**

Criar `db/migrations/011_ordens_servico.sql`:

```sql
-- Ordem de Serviço (OS): comanda fechada que consome saldo de Contratação (FIFO entre
-- contratações do cliente) e opcionalmente pré-agenda gravação/entrega por item.
-- Ver docs/superpowers/specs/2026-08-12-ordem-servico-design.md.
create table ordens_servico (
  id          uuid primary key default gen_random_uuid(),
  cliente_id  uuid not null references clientes(id),
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index ordens_servico_cliente_idx on ordens_servico (cliente_id);

create table os_itens (
  id              uuid primary key default gen_random_uuid(),
  os_id           uuid not null references ordens_servico(id) on delete cascade,
  produto_id      uuid not null references produtos(id),
  quantidade      int not null check (quantidade > 0),
  pre_agendar     boolean not null default false,
  agendamento_id  uuid references agendamentos(id),
  check (
    (pre_agendar = true and agendamento_id is not null) or
    (pre_agendar = false and agendamento_id is null)
  )
);
create index os_itens_os_idx on os_itens (os_id);

-- De qual(is) contratacao_itens cada os_item descontou saldo — permite devolver
-- certinho no cancelamento, mesmo quando uma linha consumiu de 2+ contratações (FIFO).
create table os_item_saldos (
  id                    uuid primary key default gen_random_uuid(),
  os_item_id            uuid not null references os_itens(id) on delete cascade,
  contratacao_item_id   uuid not null references contratacao_itens(id),
  quantidade            int not null check (quantidade > 0)
);
create index os_item_saldos_os_item_idx on os_item_saldos (os_item_id);
create index os_item_saldos_contratacao_item_idx on os_item_saldos (contratacao_item_id);
```

- [ ] **Step 2: Aplicar**

```bash
npm run migrate
```

Esperado: `+ aplicando 011_ordens_servico.sql...` seguido de sucesso.

- [ ] **Step 3: Acrescentar os tipos em `lib/types.ts`**

No final do arquivo:

```ts
export type OSItemLinha = {
  produto_id: string;
  produto_nome: string;
  quantidade: number;
  pre_agendar: boolean;
};

export type OrdemServico = {
  id: string;
  cliente_id: string;
  cliente_nome: string;
  created_at: string;
  itens: OSItemLinha[];
};

export type DadosOSItem = {
  produto_id: string;
  quantidade: number;
  pre_agendar: boolean;
  data: string | null;
  hora_inicio: string | null;
  hora_fim: string | null;
  local_id: string | null;
  estudio_id: string | null;
};

export type DadosOS = {
  cliente_id: string;
  itens: DadosOSItem[];
};
```

- [ ] **Step 4: Acrescentar a permissão em `lib/authz.ts`**

Logo abaixo de `canManageContratacoes` (ou onde estiver a última `canManageX` no arquivo):

```ts
export const canManageOrdensServico = (actor: Actor) => isMaster(actor);
```

- [ ] **Step 5: Acrescentar `'ordem_servico'` ao `entityType` em `lib/db/audit.ts`**

```ts
  entityType?: 'credential' | 'room' | 'user' | 'cliente' | 'fornecedor' | 'categoria_produto'
    | 'produto' | 'combo' | 'plano' | 'local_gravacao' | 'estudio' | 'agendamento' | 'bloqueio_estudio'
    | 'contratacao' | 'ordem_servico';
```

- [ ] **Step 6: Verificar**

```bash
npx tsc --noEmit
npm test
```

Esperado: ambos limpos.

- [ ] **Step 7: Commit**

```bash
git add db/migrations/011_ordens_servico.sql lib/types.ts lib/authz.ts lib/db/audit.ts
git commit -m "Adiciona schema, tipos e permissão de Ordem de Serviço"
```

---

## Task 2: Validação de formulário (`lib/os-form.ts`)

**Files:**
- Create: `lib/os-form.ts`
- Test: `tests/os-form.test.ts`

**Interfaces:**
- Consumes: `validarPeriodoAgendamento` (`lib/agenda-form.ts`, já existe); `DadosOS`,
  `DadosOSItem` (Task 1).
- Produces: `lerDadosOS(fd: FormData): DadosOS | { error: string }`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/os-form.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { lerDadosOS } from '@/lib/os-form';

function formData(campos: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
}

const ITEM_SIMPLES = { produto_id: 'p1', quantidade: 2, pre_agendar: false };
const ITEM_PRE_AGENDADO = {
  produto_id: 'p1', quantidade: 1, pre_agendar: true,
  data: '2026-09-10', hora_inicio: '09:00', hora_fim: '10:00', local_id: 'l1', estudio_id: 'e1',
};

describe('lerDadosOS', () => {
  it('sem cliente retorna erro', () => {
    const r = lerDadosOS(formData({ itens: JSON.stringify([ITEM_SIMPLES]) }));
    expect(r).toEqual({ error: 'Escolha o cliente.' });
  });

  it('itens em JSON inválido retorna erro', () => {
    const r = lerDadosOS(formData({ clienteId: 'c1', itens: '{not json' }));
    expect(r).toEqual({ error: 'Itens inválidos.' });
  });

  it('sem nenhum item retorna erro', () => {
    const r = lerDadosOS(formData({ clienteId: 'c1', itens: '[]' }));
    expect(r).toEqual({ error: 'Adicione pelo menos um item.' });
  });

  it('item sem produto_id retorna erro', () => {
    const r = lerDadosOS(formData({ clienteId: 'c1', itens: JSON.stringify([{ ...ITEM_SIMPLES, produto_id: '' }]) }));
    expect(r).toEqual({ error: 'Escolha o produto de cada item.' });
  });

  it('item com quantidade zero retorna erro', () => {
    const r = lerDadosOS(formData({ clienteId: 'c1', itens: JSON.stringify([{ ...ITEM_SIMPLES, quantidade: 0 }]) }));
    expect(r).toEqual({ error: 'Quantidade precisa ser um número inteiro maior que zero.' });
  });

  it('item com quantidade não inteira retorna erro', () => {
    const r = lerDadosOS(formData({ clienteId: 'c1', itens: JSON.stringify([{ ...ITEM_SIMPLES, quantidade: 1.5 }]) }));
    expect(r).toEqual({ error: 'Quantidade precisa ser um número inteiro maior que zero.' });
  });

  it('item pré-agendado sem local retorna erro', () => {
    const r = lerDadosOS(formData({ clienteId: 'c1', itens: JSON.stringify([{ ...ITEM_PRE_AGENDADO, local_id: '' }]) }));
    expect(r).toEqual({ error: 'Escolha o local de gravação do item pré-agendado.' });
  });

  it('item pré-agendado sem estúdio retorna erro', () => {
    const r = lerDadosOS(formData({ clienteId: 'c1', itens: JSON.stringify([{ ...ITEM_PRE_AGENDADO, estudio_id: '' }]) }));
    expect(r).toEqual({ error: 'Escolha o estúdio do item pré-agendado.' });
  });

  it('item pré-agendado com data inválida retorna erro', () => {
    const r = lerDadosOS(formData({ clienteId: 'c1', itens: JSON.stringify([{ ...ITEM_PRE_AGENDADO, data: '10/09/2026' }]) }));
    expect(r).toEqual({ error: 'Informe a data.' });
  });

  it('item sem pré-agendar é lido com campos de agenda nulos', () => {
    const r = lerDadosOS(formData({ clienteId: 'c1', itens: JSON.stringify([ITEM_SIMPLES]) }));
    expect(r).toEqual({
      cliente_id: 'c1',
      itens: [{
        produto_id: 'p1', quantidade: 2, pre_agendar: false,
        data: null, hora_inicio: null, hora_fim: null, local_id: null, estudio_id: null,
      }],
    });
  });

  it('item pré-agendado é lido com todos os campos de agenda', () => {
    const r = lerDadosOS(formData({ clienteId: 'c1', itens: JSON.stringify([ITEM_PRE_AGENDADO]) }));
    expect(r).toEqual({
      cliente_id: 'c1',
      itens: [{
        produto_id: 'p1', quantidade: 1, pre_agendar: true,
        data: '2026-09-10', hora_inicio: '09:00', hora_fim: '10:00', local_id: 'l1', estudio_id: 'e1',
      }],
    });
  });

  it('múltiplos itens são todos lidos, mistura de pré-agendado e não', () => {
    const r = lerDadosOS(formData({ clienteId: 'c1', itens: JSON.stringify([ITEM_SIMPLES, ITEM_PRE_AGENDADO]) }));
    expect('error' in r).toBe(false);
    if (!('error' in r)) expect(r.itens).toHaveLength(2);
  });
});
```

Run: `npx vitest run tests/os-form.test.ts`
Expected: FAIL (`Cannot find module '@/lib/os-form'`).

- [ ] **Step 2: Implementar `lib/os-form.ts`**

```ts
import { validarPeriodoAgendamento } from '@/lib/agenda-form';
import type { DadosOS, DadosOSItem } from '@/lib/types';

function lerItemOS(bruto: unknown): DadosOSItem | { error: string } {
  if (
    typeof bruto !== 'object' || bruto === null ||
    typeof (bruto as Record<string, unknown>).produto_id !== 'string' ||
    typeof (bruto as Record<string, unknown>).quantidade !== 'number' ||
    typeof (bruto as Record<string, unknown>).pre_agendar !== 'boolean'
  ) {
    return { error: 'Itens inválidos.' };
  }
  const { produto_id, quantidade, pre_agendar } = bruto as {
    produto_id: string; quantidade: number; pre_agendar: boolean;
  };

  if (!produto_id) return { error: 'Escolha o produto de cada item.' };
  if (!Number.isInteger(quantidade) || quantidade <= 0) {
    return { error: 'Quantidade precisa ser um número inteiro maior que zero.' };
  }

  if (!pre_agendar) {
    return {
      produto_id, quantidade, pre_agendar: false,
      data: null, hora_inicio: null, hora_fim: null, local_id: null, estudio_id: null,
    };
  }

  const b = bruto as Record<string, unknown>;
  const local_id = String(b.local_id ?? '');
  if (!local_id) return { error: 'Escolha o local de gravação do item pré-agendado.' };
  const estudio_id = String(b.estudio_id ?? '');
  if (!estudio_id) return { error: 'Escolha o estúdio do item pré-agendado.' };

  const data = String(b.data ?? '');
  const hora_inicio = String(b.hora_inicio ?? '');
  const hora_fim = String(b.hora_fim ?? '');
  const erroPeriodo = validarPeriodoAgendamento(data, hora_inicio, hora_fim);
  if (erroPeriodo) return erroPeriodo;

  return { produto_id, quantidade, pre_agendar: true, data, hora_inicio, hora_fim, local_id, estudio_id };
}

export function lerDadosOS(fd: FormData): DadosOS | { error: string } {
  const cliente_id = String(fd.get('clienteId') ?? '');
  if (!cliente_id) return { error: 'Escolha o cliente.' };

  let bruto: unknown;
  try {
    bruto = JSON.parse(String(fd.get('itens') ?? '[]'));
  } catch {
    return { error: 'Itens inválidos.' };
  }
  if (!Array.isArray(bruto) || bruto.length === 0) return { error: 'Adicione pelo menos um item.' };

  const itens: DadosOSItem[] = [];
  for (const item of bruto) {
    const lido = lerItemOS(item);
    if ('error' in lido) return lido;
    itens.push(lido);
  }

  return { cliente_id, itens };
}
```

- [ ] **Step 3: Rodar e confirmar que passa**

```bash
npx vitest run tests/os-form.test.ts
```

Expected: PASS, 12 testes.

- [ ] **Step 4: Commit**

```bash
git add lib/os-form.ts tests/os-form.test.ts
git commit -m "Adiciona validação de formulário de Ordem de Serviço"
```

---

## Task 3: Persistência, FIFO de saldo e cancelamento (`lib/db/ordens-servico.ts`)

Task mais sensível do plano: consumo de saldo entre múltiplas contratações (FIFO), checagem
de conflito de agenda por linha, tudo-ou-nada na criação, e reversão completa no cancelamento.
Testada contra o banco real, mesmo padrão do resto do projeto.

**Files:**
- Modify: `lib/db/agenda.ts` (exportar `existeConflito`)
- Create: `lib/db/ordens-servico.ts`
- Test: acrescentar em `tests/integracao.test.ts`

**Interfaces:**
- Consumes: `getProduto` (`lib/db/produtos.ts`), `existeBloqueioNoHorario`
  (`lib/db/bloqueios.ts`), `existeConflito` (`lib/db/agenda.ts`, exportada nesta task),
  `sql`/`sql.transaction` (`lib/db/client.ts`), `assertUuid`/`NotFoundError`,
  `DadosOS`/`OrdemServico` (Task 1).
- Produces: `listOrdensServico(): Promise<OrdemServico[]>`,
  `createOrdemServico(dados: DadosOS): Promise<string>`,
  `cancelarOrdemServico(id: string): Promise<void>`, `SaldoInsuficienteError`,
  `ConflitoAgendaError`.

- [ ] **Step 1: Exportar `existeConflito` em `lib/db/agenda.ts`**

Em `lib/db/agenda.ts`, mude a assinatura da função (linha 19 hoje) de:

```ts
async function existeConflito(
```

para:

```ts
export async function existeConflito(
```

Nada mais muda nesse arquivo.

- [ ] **Step 2: Teste de integração que falha**

Em `tests/integracao.test.ts`, acrescentar dentro do describe principal (depois do último
`it`, antes do `});` final):

```ts
  it('FIFO desconta da contratação mais antiga primeiro, criando os_item_saldos correspondentes', async () => {
    const terceiros = await import('@/lib/db/terceiros');
    const cat = await import('@/lib/db/categorias-produto');
    const prod = await import('@/lib/db/produtos');
    const contr = await import('@/lib/db/contratacoes');
    const os = await import('@/lib/db/ordens-servico');

    const clienteId = await terceiros.createTerceiro('clientes', {
      nome: `${marca}-cliente-os-1`, contato_responsavel: null, email: null,
      telefone: null, cidade: null, uf: null,
    });
    const categoriaId = await cat.createCategoria({
      nome: `${marca}-categoria-os-1`, unidade_consumo: null, atributos_molde: [], ativo: true,
    });
    const produtoId = await prod.createProduto({
      categoria_id: categoriaId, nome: `${marca}-produto-os-1`, descricao: null, atributos: {}, preco: 50, ativo: true,
    });

    const contratacao1Id = await contr.createContratacao({
      cliente_id: clienteId, tipo: 'avulso', produto_id: produtoId, combo_id: null, plano_id: null, quantidade: 2,
    });
    const contratacao2Id = await contr.createContratacao({
      cliente_id: clienteId, tipo: 'avulso', produto_id: produtoId, combo_id: null, plano_id: null, quantidade: 5,
    });

    const osId = await os.createOrdemServico({
      cliente_id: clienteId,
      itens: [{
        produto_id: produtoId, quantidade: 4, pre_agendar: false,
        data: null, hora_inicio: null, hora_fim: null, local_id: null, estudio_id: null,
      }],
    });
    expect(osId).toBeTruthy();

    const itemContratacao1 = (await sql`
      select quantidade_consumida from contratacao_itens where contratacao_id = ${contratacao1Id}`) as
      { quantidade_consumida: number }[];
    const itemContratacao2 = (await sql`
      select quantidade_consumida from contratacao_itens where contratacao_id = ${contratacao2Id}`) as
      { quantidade_consumida: number }[];
    // Contratação 1 (mais antiga) tinha saldo 2 — esgota primeiro. Contratação 2 cobre o resto (2).
    expect(itemContratacao1[0].quantidade_consumida).toBe(2);
    expect(itemContratacao2[0].quantidade_consumida).toBe(2);

    await sql`delete from ordens_servico where id = ${osId}`;
    await sql`delete from contratacao_itens where contratacao_id in (${contratacao1Id}, ${contratacao2Id})`;
    await sql`delete from contratacoes where id in (${contratacao1Id}, ${contratacao2Id})`;
    await sql`delete from produtos where id = ${produtoId}`;
    await sql`delete from categorias_produto where id = ${categoriaId}`;
    await sql`delete from clientes where id = ${clienteId}`;
  });

  it('saldo insuficiente rejeita a OS inteira, sem gravar nada', async () => {
    const terceiros = await import('@/lib/db/terceiros');
    const cat = await import('@/lib/db/categorias-produto');
    const prod = await import('@/lib/db/produtos');
    const contr = await import('@/lib/db/contratacoes');
    const os = await import('@/lib/db/ordens-servico');

    const clienteId = await terceiros.createTerceiro('clientes', {
      nome: `${marca}-cliente-os-2`, contato_responsavel: null, email: null,
      telefone: null, cidade: null, uf: null,
    });
    const categoriaId = await cat.createCategoria({
      nome: `${marca}-categoria-os-2`, unidade_consumo: null, atributos_molde: [], ativo: true,
    });
    const produtoAId = await prod.createProduto({
      categoria_id: categoriaId, nome: `${marca}-produtoA-os-2`, descricao: null, atributos: {}, preco: 10, ativo: true,
    });
    const produtoBId = await prod.createProduto({
      categoria_id: categoriaId, nome: `${marca}-produtoB-os-2`, descricao: null, atributos: {}, preco: 10, ativo: true,
    });

    const contratacaoId = await contr.createContratacao({
      cliente_id: clienteId, tipo: 'avulso', produto_id: produtoAId, combo_id: null, plano_id: null, quantidade: 5,
    });
    // produtoB nunca foi contratado — saldo 0.

    await expect(os.createOrdemServico({
      cliente_id: clienteId,
      itens: [
        { produto_id: produtoAId, quantidade: 2, pre_agendar: false, data: null, hora_inicio: null, hora_fim: null, local_id: null, estudio_id: null },
        { produto_id: produtoBId, quantidade: 1, pre_agendar: false, data: null, hora_inicio: null, hora_fim: null, local_id: null, estudio_id: null },
      ],
    })).rejects.toThrow(os.SaldoInsuficienteError);

    const osRows = (await sql`select id from ordens_servico where cliente_id = ${clienteId}`) as { id: string }[];
    expect(osRows).toHaveLength(0);
    const itemA = (await sql`
      select quantidade_consumida from contratacao_itens where contratacao_id = ${contratacaoId}`) as
      { quantidade_consumida: number }[];
    expect(itemA[0].quantidade_consumida).toBe(0);

    await sql`delete from contratacao_itens where contratacao_id = ${contratacaoId}`;
    await sql`delete from contratacoes where id = ${contratacaoId}`;
    await sql`delete from produtos where id in (${produtoAId}, ${produtoBId})`;
    await sql`delete from categorias_produto where id = ${categoriaId}`;
    await sql`delete from clientes where id = ${clienteId}`;
  });

  it('item pré-agendado cria agendamento pre_agendado; conflito de horário e bloqueio de estúdio rejeitam a OS inteira', async () => {
    const terceiros = await import('@/lib/db/terceiros');
    const cat = await import('@/lib/db/categorias-produto');
    const prod = await import('@/lib/db/produtos');
    const lg = await import('@/lib/db/locais-gravacao');
    const contr = await import('@/lib/db/contratacoes');
    const ag = await import('@/lib/db/agenda');
    const bloqueios = await import('@/lib/db/bloqueios');
    const os = await import('@/lib/db/ordens-servico');

    const clienteId = await terceiros.createTerceiro('clientes', {
      nome: `${marca}-cliente-os-3`, contato_responsavel: null, email: null,
      telefone: null, cidade: null, uf: null,
    });
    const categoriaId = await cat.createCategoria({
      nome: `${marca}-categoria-os-3`, unidade_consumo: null, atributos_molde: [], ativo: true,
    });
    const produtoId = await prod.createProduto({
      categoria_id: categoriaId, nome: `${marca}-produto-os-3`, descricao: null, atributos: {}, preco: 10, ativo: true,
    });
    const localId = await lg.createLocal({
      nome: `${marca}-local-os-3`, endereco: null, responsavel: null, estudios: [{ nome: 'Estúdio OS 3' }],
    });
    const [estudio] = (await lg.getLocal(localId))!.estudios;

    const contratacaoId = await contr.createContratacao({
      cliente_id: clienteId, tipo: 'avulso', produto_id: produtoId, combo_id: null, plano_id: null, quantidade: 3,
    });

    const osId = await os.createOrdemServico({
      cliente_id: clienteId,
      itens: [{
        produto_id: produtoId, quantidade: 1, pre_agendar: true,
        data: '2026-09-10', hora_inicio: '09:00', hora_fim: '10:00', local_id: localId, estudio_id: estudio.id,
      }],
    });
    const [{ agendamento_id: agendamentoId }] = (await sql`
      select agendamento_id from os_itens where os_id = ${osId}`) as { agendamento_id: string }[];
    expect(agendamentoId).toBeTruthy();
    const agRows = (await sql`
      select status, categoria_produto_id, cliente_id from agendamentos where id = ${agendamentoId}`) as
      { status: string; categoria_produto_id: string; cliente_id: string }[];
    expect(agRows[0].status).toBe('pre_agendado');
    expect(agRows[0].categoria_produto_id).toBe(categoriaId);
    expect(agRows[0].cliente_id).toBe(clienteId);

    const conflitanteId = await ag.createAgendamento({
      cliente_id: clienteId, local_id: localId, estudio_id: estudio.id, categoria_produto_id: categoriaId,
      status: 'agendado', data: '2026-09-11', hora_inicio: '14:00', hora_fim: '15:00',
    });
    await expect(os.createOrdemServico({
      cliente_id: clienteId,
      itens: [{
        produto_id: produtoId, quantidade: 1, pre_agendar: true,
        data: '2026-09-11', hora_inicio: '14:30', hora_fim: '15:30', local_id: localId, estudio_id: estudio.id,
      }],
    })).rejects.toThrow(os.ConflitoAgendaError);
    const consumidoDepoisConflito = (await sql`
      select quantidade_consumida from contratacao_itens where contratacao_id = ${contratacaoId}`) as
      { quantidade_consumida: number }[];
    expect(consumidoDepoisConflito[0].quantidade_consumida).toBe(1);

    const bloqueioId = await bloqueios.createBloqueio({
      estudio_id: estudio.id, data: '2026-09-12', hora_inicio: '09:00', hora_fim: '12:00', motivo: 'manutenção',
    });
    await expect(os.createOrdemServico({
      cliente_id: clienteId,
      itens: [{
        produto_id: produtoId, quantidade: 1, pre_agendar: true,
        data: '2026-09-12', hora_inicio: '10:00', hora_fim: '11:00', local_id: localId, estudio_id: estudio.id,
      }],
    })).rejects.toThrow(os.ConflitoAgendaError);

    await sql`delete from ordens_servico where id = ${osId}`;
    await sql`delete from agendamentos where id in (${agendamentoId}, ${conflitanteId})`;
    await sql`delete from bloqueios_estudio where id = ${bloqueioId}`;
    await sql`delete from contratacao_itens where contratacao_id = ${contratacaoId}`;
    await sql`delete from contratacoes where id = ${contratacaoId}`;
    await sql`delete from estudios where local_id = ${localId}`;
    await sql`delete from locais_gravacao where id = ${localId}`;
    await sql`delete from produtos where id = ${produtoId}`;
    await sql`delete from categorias_produto where id = ${categoriaId}`;
    await sql`delete from clientes where id = ${clienteId}`;
  });

  it('cancelamento devolve saldo, cancela agendamentos vinculados, e a OS some da lista', async () => {
    const terceiros = await import('@/lib/db/terceiros');
    const cat = await import('@/lib/db/categorias-produto');
    const prod = await import('@/lib/db/produtos');
    const lg = await import('@/lib/db/locais-gravacao');
    const contr = await import('@/lib/db/contratacoes');
    const os = await import('@/lib/db/ordens-servico');

    const clienteId = await terceiros.createTerceiro('clientes', {
      nome: `${marca}-cliente-os-4`, contato_responsavel: null, email: null,
      telefone: null, cidade: null, uf: null,
    });
    const categoriaId = await cat.createCategoria({
      nome: `${marca}-categoria-os-4`, unidade_consumo: null, atributos_molde: [], ativo: true,
    });
    const produtoId = await prod.createProduto({
      categoria_id: categoriaId, nome: `${marca}-produto-os-4`, descricao: null, atributos: {}, preco: 10, ativo: true,
    });
    const localId = await lg.createLocal({
      nome: `${marca}-local-os-4`, endereco: null, responsavel: null, estudios: [{ nome: 'Estúdio OS 4' }],
    });
    const [estudio] = (await lg.getLocal(localId))!.estudios;

    const contratacaoId = await contr.createContratacao({
      cliente_id: clienteId, tipo: 'avulso', produto_id: produtoId, combo_id: null, plano_id: null, quantidade: 3,
    });

    const osId = await os.createOrdemServico({
      cliente_id: clienteId,
      itens: [{
        produto_id: produtoId, quantidade: 2, pre_agendar: true,
        data: '2026-09-15', hora_inicio: '09:00', hora_fim: '10:00', local_id: localId, estudio_id: estudio.id,
      }],
    });
    const [{ agendamento_id: agendamentoId }] = (await sql`
      select agendamento_id from os_itens where os_id = ${osId}`) as { agendamento_id: string }[];

    const antes = (await sql`
      select quantidade_consumida from contratacao_itens where contratacao_id = ${contratacaoId}`) as
      { quantidade_consumida: number }[];
    expect(antes[0].quantidade_consumida).toBe(2);

    await os.cancelarOrdemServico(osId);

    const depois = (await sql`
      select quantidade_consumida from contratacao_itens where contratacao_id = ${contratacaoId}`) as
      { quantidade_consumida: number }[];
    expect(depois[0].quantidade_consumida).toBe(0);

    const agDepois = (await sql`select status from agendamentos where id = ${agendamentoId}`) as { status: string }[];
    expect(agDepois[0].status).toBe('cancelado');

    const lista = await os.listOrdensServico();
    expect(lista.map((o) => o.id)).not.toContain(osId);

    await expect(os.cancelarOrdemServico(osId)).rejects.toThrow();

    await sql`delete from ordens_servico where id = ${osId}`;
    await sql`delete from agendamentos where id = ${agendamentoId}`;
    await sql`delete from contratacao_itens where contratacao_id = ${contratacaoId}`;
    await sql`delete from contratacoes where id = ${contratacaoId}`;
    await sql`delete from estudios where local_id = ${localId}`;
    await sql`delete from locais_gravacao where id = ${localId}`;
    await sql`delete from produtos where id = ${produtoId}`;
    await sql`delete from categorias_produto where id = ${categoriaId}`;
    await sql`delete from clientes where id = ${clienteId}`;
  });
```

Run: `npx vitest run tests/integracao.test.ts`
Expected: FAIL (`@/lib/db/ordens-servico` inexistente) — ou SKIP inteiro se `DATABASE_URL`/
`VAULT_KEY` não estiverem no ambiente (nesse caso, prossiga para o Step 3 e valide via
`npx tsc --noEmit`; rode a suíte de integração quando tiver acesso ao banco).

- [ ] **Step 3: Implementar `lib/db/ordens-servico.ts`**

```ts
import { randomUUID } from 'node:crypto';
import { sql } from '@/lib/db/client';
import { NotFoundError } from '@/lib/authz';
import { assertUuid } from '@/lib/validation';
import { existeConflito } from '@/lib/db/agenda';
import { existeBloqueioNoHorario } from '@/lib/db/bloqueios';
import { getProduto } from '@/lib/db/produtos';
import type { DadosOS, OrdemServico } from '@/lib/types';

export class SaldoInsuficienteError extends Error {
  constructor(produtoNome: string) {
    super(`Saldo insuficiente de "${produtoNome}" para este cliente.`);
  }
}

export class ConflitoAgendaError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
  }
}

type SaldoLinha = { contratacao_item_id: string; disponivel: number };

async function buscarSaldoDisponivel(clienteId: string, produtoId: string): Promise<SaldoLinha[]> {
  return (await sql`
    select ci.id as contratacao_item_id, (ci.quantidade_total - ci.quantidade_consumida) as disponivel
      from contratacao_itens ci
      join contratacoes ct on ct.id = ci.contratacao_id
     where ct.cliente_id = ${clienteId} and ct.deleted_at is null and ci.produto_id = ${produtoId}
       and ci.quantidade_total > ci.quantidade_consumida
     order by ct.created_at asc`) as SaldoLinha[];
}

type ItemValidado = {
  produto_id: string;
  categoria_produto_id: string;
  quantidade: number;
  pre_agendar: boolean;
  data: string | null;
  hora_inicio: string | null;
  hora_fim: string | null;
  local_id: string | null;
  estudio_id: string | null;
};

export async function createOrdemServico(dados: DadosOS): Promise<string> {
  assertUuid(dados.cliente_id);

  const itensValidados: ItemValidado[] = [];
  const descontos: { itemIndex: number; contratacao_item_id: string; quantidade: number }[] = [];

  for (let i = 0; i < dados.itens.length; i++) {
    const item = dados.itens[i];
    assertUuid(item.produto_id);
    const produto = await getProduto(item.produto_id);
    if (!produto || !produto.ativo) throw new NotFoundError();

    const saldoLinhas = await buscarSaldoDisponivel(dados.cliente_id, item.produto_id);
    let restante = item.quantidade;
    for (const linha of saldoLinhas) {
      if (restante <= 0) break;
      const usar = Math.min(restante, linha.disponivel);
      descontos.push({ itemIndex: i, contratacao_item_id: linha.contratacao_item_id, quantidade: usar });
      restante -= usar;
    }
    if (restante > 0) throw new SaldoInsuficienteError(produto.nome);

    if (item.pre_agendar) {
      assertUuid(item.local_id!);
      assertUuid(item.estudio_id!);
      if (await existeBloqueioNoHorario(item.estudio_id!, item.data!, item.hora_inicio!, item.hora_fim!)) {
        throw new ConflitoAgendaError('Este horário está bloqueado para manutenção.');
      }
      if (await existeConflito(item.estudio_id!, item.data!, item.hora_inicio!, item.hora_fim!, null)) {
        throw new ConflitoAgendaError('Este estúdio já tem outro agendamento nesse horário.');
      }
    }

    itensValidados.push({
      produto_id: item.produto_id, categoria_produto_id: produto.categoria_id,
      quantidade: item.quantidade, pre_agendar: item.pre_agendar,
      data: item.data, hora_inicio: item.hora_inicio, hora_fim: item.hora_fim,
      local_id: item.local_id, estudio_id: item.estudio_id,
    });
  }

  const osId = randomUUID();
  const osItemIds = itensValidados.map(() => randomUUID());
  const agendamentoIds = itensValidados.map((item) => (item.pre_agendar ? randomUUID() : null));

  await sql.transaction([
    sql`insert into ordens_servico (id, cliente_id) values (${osId}, ${dados.cliente_id})`,
    ...itensValidados.map((item, i) => sql`
      insert into os_itens (id, os_id, produto_id, quantidade, pre_agendar, agendamento_id)
      values (${osItemIds[i]}, ${osId}, ${item.produto_id}, ${item.quantidade}, ${item.pre_agendar}, ${agendamentoIds[i]})`),
    ...descontos.map((d) => sql`
      insert into os_item_saldos (os_item_id, contratacao_item_id, quantidade)
      values (${osItemIds[d.itemIndex]}, ${d.contratacao_item_id}, ${d.quantidade})`),
    ...descontos.map((d) => sql`
      update contratacao_itens set quantidade_consumida = quantidade_consumida + ${d.quantidade}
       where id = ${d.contratacao_item_id}`),
    ...itensValidados
      .map((item, i) => ({ item, i }))
      .filter(({ item }) => item.pre_agendar)
      .map(({ item, i }) => sql`
        insert into agendamentos (id, cliente_id, local_id, estudio_id, categoria_produto_id, status, data, hora_inicio, hora_fim)
        values (${agendamentoIds[i]}, ${dados.cliente_id}, ${item.local_id}, ${item.estudio_id}, ${item.categoria_produto_id},
                'pre_agendado', ${item.data}, ${item.hora_inicio}, ${item.hora_fim})`),
  ]);

  return osId;
}

/** Só OS ativas — cancelada some da lista, mesmo padrão de `listContratacoes`. */
export async function listOrdensServico(): Promise<OrdemServico[]> {
  return (await sql`
    select os.id, os.cliente_id, cl.nome as cliente_nome, os.created_at,
           coalesce(
             json_agg(
               json_build_object(
                 'produto_id', oi.produto_id, 'produto_nome', p.nome,
                 'quantidade', oi.quantidade, 'pre_agendar', oi.pre_agendar
               ) order by p.nome
             ) filter (where oi.id is not null), '[]'
           ) as itens
      from ordens_servico os
      join clientes cl on cl.id = os.cliente_id
      left join os_itens oi on oi.os_id = os.id
      left join produtos p on p.id = oi.produto_id
     where os.deleted_at is null
     group by os.id, cl.nome
     order by os.created_at desc`) as OrdemServico[];
}

export async function cancelarOrdemServico(id: string): Promise<void> {
  assertUuid(id);
  const existe = (await sql`
    select id from ordens_servico where id = ${id} and deleted_at is null`) as { id: string }[];
  if (!existe[0]) throw new NotFoundError();

  const saldos = (await sql`
    select os_item_saldos.contratacao_item_id as contratacao_item_id, os_item_saldos.quantidade as quantidade
      from os_item_saldos
      join os_itens on os_itens.id = os_item_saldos.os_item_id
     where os_itens.os_id = ${id}`) as { contratacao_item_id: string; quantidade: number }[];

  const agendamentos = (await sql`
    select agendamento_id from os_itens where os_id = ${id} and agendamento_id is not null`) as
    { agendamento_id: string }[];

  await sql.transaction([
    sql`update ordens_servico set deleted_at = now() where id = ${id}`,
    ...saldos.map((s) => sql`
      update contratacao_itens set quantidade_consumida = quantidade_consumida - ${s.quantidade}
       where id = ${s.contratacao_item_id}`),
    ...agendamentos.map((a) => sql`
      update agendamentos set status = 'cancelado', updated_at = now() where id = ${a.agendamento_id}`),
  ]);
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
npx vitest run tests/integracao.test.ts
npx tsc --noEmit
```

Expected: PASS (ou SKIP da suíte inteira sem `DATABASE_URL`, sem falhas de tipo).

- [ ] **Step 5: Commit**

```bash
git add lib/db/agenda.ts lib/db/ordens-servico.ts tests/integracao.test.ts
git commit -m "Adiciona persistência, FIFO de saldo e cancelamento de Ordem de Serviço"
```

---

## Task 4: Tela, rota, actions e menu

**Files:**
- Create: `components/OSClient.tsx`, `app/(app)/ordens-servico/actions.ts`,
  `app/(app)/ordens-servico/page.tsx`
- Modify: `components/Sidebar.tsx`
- Test: `tests/OSClient.test.tsx`

**Interfaces:**
- Consumes: `lerDadosOS` (Task 2); `createOrdemServico`, `SaldoInsuficienteError`,
  `ConflitoAgendaError`, `listOrdensServico`, `cancelarOrdemServico` (Task 3);
  `canManageOrdensServico` (Task 1); `listTerceiros('clientes')`, `listProdutos`, `listLocais`
  (infra existente); `requireMaster`, `audit`, `isUuid`.
- Produces: componente `OSClient` com `export type OSState = { error?: string; ok?: string }`.

- [ ] **Step 1: Tela — teste jsdom que falha**

Criar `tests/OSClient.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { OSClient } from '@/components/OSClient';
import type { LocalGravacao, OrdemServico, Produto, Terceiro } from '@/lib/types';

const cliente: Terceiro = {
  id: '11111111-1111-1111-1111-111111111111', nome: 'Cliente Um', contato_responsavel: null,
  email: null, telefone: null, cidade: null, uf: null, created_at: '2026-01-01T00:00:00Z',
};
const produto: Produto = {
  id: '22222222-2222-2222-2222-222222222222', categoria_id: 'cat1', nome: 'Sessão de Estúdio',
  descricao: null, atributos: {}, preco: 100, ativo: true, created_at: '2026-01-01T00:00:00Z',
};
const local: LocalGravacao = {
  id: '33333333-3333-3333-3333-333333333333', nome: 'Estúdio Central', endereco: null, responsavel: null,
  created_at: '2026-01-01T00:00:00Z',
  estudios: [{
    id: '44444444-4444-4444-4444-444444444444', local_id: '33333333-3333-3333-3333-333333333333',
    nome: 'Sala A', created_at: '2026-01-01T00:00:00Z',
  }],
};
const osExistente: OrdemServico = {
  id: '55555555-5555-5555-5555-555555555555', cliente_id: cliente.id, cliente_nome: cliente.nome,
  created_at: '2026-01-01T00:00:00Z',
  itens: [{ produto_id: produto.id, produto_nome: produto.nome, quantidade: 2, pre_agendar: true }],
};

const criar = vi.fn();
const apagar = vi.fn();

afterEach(() => cleanup());

describe('OSClient', () => {
  it('lista ordens de serviço com cliente e itens resumidos', () => {
    render(<OSClient itens={[osExistente]} clientes={[cliente]} produtos={[produto]} locais={[local]} criar={criar} apagar={apagar} />);
    expect(screen.getByText('Cliente Um')).toBeInTheDocument();
    expect(screen.getByText('2x Sessão de Estúdio (pré-agendado)')).toBeInTheDocument();
  });

  it('adicionar item cria nova linha, e marcar pré-agendar expande campos de data/horário', () => {
    render(<OSClient itens={[]} clientes={[cliente]} produtos={[produto]} locais={[local]} criar={criar} apagar={apagar} />);
    expect(screen.queryByLabelText('Produto 2')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('+ Adicionar item'));
    expect(screen.getByLabelText('Produto 2')).toBeInTheDocument();

    expect(screen.queryByLabelText('Data 1')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Pré-agendar item 1'));
    expect(screen.getByLabelText('Data 1')).toBeInTheDocument();
  });

  it('cancelar chama apagar com o id da ordem de serviço', async () => {
    apagar.mockResolvedValueOnce({});
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<OSClient itens={[osExistente]} clientes={[cliente]} produtos={[produto]} locais={[local]} criar={criar} apagar={apagar} />);
    fireEvent.click(screen.getByText('Cancelar'));
    await vi.waitFor(() => expect(apagar).toHaveBeenCalledWith(osExistente.id));
  });
});
```

**Nota importante:** o teste 1 e o teste 3 usam `itens={[osExistente]}` (lista não-vazia) —
isso é proposital. O formulário "Nova ordem de serviço" default fecha quando a lista já tem
itens (ver Step 2 abaixo: `abertoPorPadrao={itens.length === 0}`), exatamente pra evitar que
o `<select>` de produto do formulário (que contém `<option>Sessão de Estúdio</option>`) e o
`<select>` de cliente (`<option>Cliente Um</option>`) colidam com o mesmo texto já presente na
tabela da lista — `getByText` falha com "multiple elements found" se os dois estiverem
montados ao mesmo tempo. Essa é a mesma lição já aplicada em `ContratacaoClient`/
`ContratacaoClient.test.tsx`: não a repita como bug a redescobrir.

Run: `npx vitest run tests/OSClient.test.tsx`
Expected: FAIL (`@/components/OSClient` inexistente).

- [ ] **Step 2: Implementar `components/OSClient.tsx`**

```tsx
'use client';

import { useActionState, useEffect, useState } from 'react';
import type { LocalGravacao, OrdemServico, Produto, Terceiro } from '@/lib/types';

export type OSState = { error?: string; ok?: string };
const inicial: OSState = {};
type Acao = (prev: OSState, fd: FormData) => Promise<OSState>;

type LinhaOS = {
  produtoId: string;
  quantidade: string;
  preAgendar: boolean;
  data: string;
  horaInicio: string;
  horaFim: string;
  localId: string;
  estudioId: string;
};

function linhaVazia(): LinhaOS {
  return { produtoId: '', quantidade: '1', preAgendar: false, data: '', horaInicio: '', horaFim: '', localId: '', estudioId: '' };
}

function serializarItens(linhas: LinhaOS[]): string {
  return JSON.stringify(linhas.map((l) => ({
    produto_id: l.produtoId,
    quantidade: Number(l.quantidade) || 0,
    pre_agendar: l.preAgendar,
    data: l.preAgendar ? l.data : null,
    hora_inicio: l.preAgendar ? l.horaInicio : null,
    hora_fim: l.preAgendar ? l.horaFim : null,
    local_id: l.preAgendar ? l.localId : null,
    estudio_id: l.preAgendar ? l.estudioId : null,
  })));
}

function LinhaFormulario({
  linha, index, produtos, locais, onChange, onRemover,
}: {
  linha: LinhaOS; index: number; produtos: Produto[]; locais: LocalGravacao[];
  onChange: (i: number, campo: Partial<LinhaOS>) => void; onRemover: (i: number) => void;
}) {
  const localAtual = locais.find((l) => l.id === linha.localId);

  return (
    <div className="glass p-4 space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block space-y-1">
          <span className="text-sm">Produto</span>
          <select
            aria-label={`Produto ${index + 1}`} className="input" value={linha.produtoId}
            onChange={(e) => onChange(index, { produtoId: e.target.value })} required
          >
            <option value="" disabled>Escolha…</option>
            {produtos.filter((p) => p.ativo).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-sm">Quantidade</span>
          <input
            aria-label={`Quantidade ${index + 1}`} type="number" className="input" min={1} step={1}
            value={linha.quantidade} onChange={(e) => onChange(index, { quantidade: e.target.value })} required
          />
        </label>
        <label className="flex items-end gap-2 text-sm pb-2">
          <input
            type="checkbox" aria-label={`Pré-agendar item ${index + 1}`} checked={linha.preAgendar}
            onChange={(e) => onChange(index, { preAgendar: e.target.checked })}
          />
          Pré-agendar?
        </label>
      </div>
      {linha.preAgendar && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-sm">Local de gravação</span>
            <select
              aria-label={`Local ${index + 1}`} className="input" value={linha.localId}
              onChange={(e) => onChange(index, { localId: e.target.value, estudioId: '' })} required
            >
              <option value="" disabled>Escolha…</option>
              {locais.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-sm">Estúdio</span>
            <select
              aria-label={`Estúdio ${index + 1}`} className="input" value={linha.estudioId}
              onChange={(e) => onChange(index, { estudioId: e.target.value })} required
            >
              <option value="" disabled>Escolha…</option>
              {(localAtual?.estudios ?? []).map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-sm">Data</span>
            <input
              aria-label={`Data ${index + 1}`} type="date" className="input"
              value={linha.data} onChange={(e) => onChange(index, { data: e.target.value })} required
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-sm">Início</span>
              <input
                aria-label={`Início ${index + 1}`} type="time" step={900} className="input"
                value={linha.horaInicio} onChange={(e) => onChange(index, { horaInicio: e.target.value })} required
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm">Fim</span>
              <input
                aria-label={`Fim ${index + 1}`} type="time" step={900} className="input"
                value={linha.horaFim} onChange={(e) => onChange(index, { horaFim: e.target.value })} required
              />
            </label>
          </div>
        </div>
      )}
      <button type="button" className="btn btn-danger" onClick={() => onRemover(index)}>Remover item</button>
    </div>
  );
}

function Formulario({
  clientes, produtos, locais, criar, abertoPorPadrao,
}: {
  clientes: Terceiro[]; produtos: Produto[]; locais: LocalGravacao[]; criar: Acao;
  abertoPorPadrao: boolean;
}) {
  const [state, action, pending] = useActionState(criar, inicial);
  const [clienteId, setClienteId] = useState('');
  const [linhas, setLinhas] = useState<LinhaOS[]>([linhaVazia()]);
  // Aberto por padrão só quando ainda não há nenhuma OS (guia o primeiro uso); com a lista
  // já povoada, o formulário some pra não duplicar nome de cliente/produto que já aparece na
  // tabela abaixo — o próprio usuário reabre clicando no <summary> (mesmo padrão de
  // ContratacaoClient, ver nota no teste).
  const [aberto, setAberto] = useState(abertoPorPadrao);

  function atualizarLinha(i: number, campo: Partial<LinhaOS>) {
    setLinhas((atual) => atual.map((l, idx) => (idx === i ? { ...l, ...campo } : l)));
  }
  function removerLinha(i: number) {
    setLinhas((atual) => atual.filter((_, idx) => idx !== i));
  }

  useEffect(() => {
    if (state.ok) { setClienteId(''); setLinhas([linhaVazia()]); }
  }, [state.ok]);

  return (
    <details className="glass p-5" open={aberto} onToggle={(e) => setAberto(e.currentTarget.open)}>
      <summary className="cursor-pointer font-semibold">Nova ordem de serviço</summary>
      {aberto && (
        <form action={action} className="space-y-4 mt-4">
          <input type="hidden" name="itens" value={serializarItens(linhas)} />
          <label className="block space-y-1">
            <span className="text-sm">Cliente</span>
            <select name="clienteId" className="input" value={clienteId} onChange={(e) => setClienteId(e.target.value)} required>
              <option value="" disabled>Escolha…</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </label>
          <div className="space-y-3">
            {linhas.map((linha, i) => (
              <LinhaFormulario
                key={i} linha={linha} index={i} produtos={produtos} locais={locais}
                onChange={atualizarLinha} onRemover={removerLinha}
              />
            ))}
          </div>
          <button type="button" className="btn" onClick={() => setLinhas((atual) => [...atual, linhaVazia()])}>
            + Adicionar item
          </button>
          {state.error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{state.error}</p>}
          {state.ok && <p className="text-sm" style={{ color: 'var(--ok)' }}>{state.ok}</p>}
          <button className="btn btn-primary" disabled={pending}>Confirmar OS</button>
        </form>
      )}
    </details>
  );
}

function Lista({ itens, apagar }: { itens: OrdemServico[]; apagar: (id: string) => Promise<{ error?: string }> }) {
  const [erro, setErro] = useState<string | null>(null);
  const [cancelando, setCancelando] = useState<string | null>(null);

  async function cancelarClique(id: string) {
    if (!confirm('Cancelar esta ordem de serviço?')) return;
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
            <th className="text-left p-2">Itens</th>
            <th className="text-left p-2">Criada em</th>
            <th className="p-2" />
          </tr>
        </thead>
        <tbody>
          {itens.map((os) => (
            <tr key={os.id}>
              <td className="p-2">{os.cliente_nome}</td>
              <td className="p-2">
                {os.itens.map((i) => (
                  <div key={i.produto_id}>
                    {i.quantidade}x {i.produto_nome}{i.pre_agendar ? ' (pré-agendado)' : ''}
                  </div>
                ))}
              </td>
              <td className="p-2">{os.created_at.slice(8, 10)}/{os.created_at.slice(5, 7)}/{os.created_at.slice(0, 4)}</td>
              <td className="p-2">
                <button
                  type="button" className="btn btn-danger" disabled={cancelando === os.id}
                  onClick={() => void cancelarClique(os.id)}
                >
                  Cancelar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {itens.length === 0 && <p className="text-sm" style={{ color: 'var(--text-dim)' }}>Nenhuma ordem de serviço cadastrada.</p>}
      {erro && <p className="text-sm" style={{ color: 'var(--danger)' }}>{erro}</p>}
    </div>
  );
}

export function OSClient({
  itens, clientes, produtos, locais, criar, apagar,
}: {
  itens: OrdemServico[]; clientes: Terceiro[]; produtos: Produto[]; locais: LocalGravacao[];
  criar: Acao; apagar: (id: string) => Promise<{ error?: string }>;
}) {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Ordens de Serviço</h1>
      <Formulario clientes={clientes} produtos={produtos} locais={locais} criar={criar} abertoPorPadrao={itens.length === 0} />
      <Lista itens={itens} apagar={apagar} />
    </div>
  );
}
```

- [ ] **Step 3: Rodar e confirmar que a tela passa**

```bash
npx vitest run tests/OSClient.test.tsx
```

Expected: PASS, 3 testes.

- [ ] **Step 4: Implementar `app/(app)/ordens-servico/actions.ts`**

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { requireMaster } from '@/lib/auth/guards';
import { audit } from '@/lib/db/audit';
import { cancelarOrdemServico, ConflitoAgendaError, createOrdemServico, SaldoInsuficienteError } from '@/lib/db/ordens-servico';
import { lerDadosOS } from '@/lib/os-form';
import { isUuid } from '@/lib/validation';
import type { OSState } from '@/components/OSClient';

const ROTA = '/ordens-servico';

export async function criarOS(_prev: OSState, formData: FormData): Promise<OSState> {
  const actor = await requireMaster();
  const dados = lerDadosOS(formData);
  if ('error' in dados) return dados;

  let id: string;
  try {
    id = await createOrdemServico(dados);
  } catch (err) {
    if (err instanceof SaldoInsuficienteError || err instanceof ConflitoAgendaError) return { error: err.message };
    throw err;
  }
  await audit({ actorId: actor.id, action: 'create', entityType: 'ordem_servico', entityId: id });
  revalidatePath(ROTA);
  return { ok: 'Ordem de serviço criada.' };
}

export async function cancelarOS(id: string): Promise<{ error?: string }> {
  const actor = await requireMaster();
  if (!isUuid(id)) return { error: 'Ordem de serviço não encontrada.' };

  await cancelarOrdemServico(id);
  await audit({ actorId: actor.id, action: 'delete', entityType: 'ordem_servico', entityId: id });
  revalidatePath(ROTA);
  return {};
}
```

- [ ] **Step 5: Implementar `app/(app)/ordens-servico/page.tsx`**

```tsx
import { OSClient } from '@/components/OSClient';
import { requireMaster } from '@/lib/auth/guards';
import { listLocais } from '@/lib/db/locais-gravacao';
import { listOrdensServico } from '@/lib/db/ordens-servico';
import { listProdutos } from '@/lib/db/produtos';
import { listTerceiros } from '@/lib/db/terceiros';
import { cancelarOS, criarOS } from './actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function OrdensServicoPage() {
  await requireMaster();
  const [itens, clientes, produtos, locais] = await Promise.all([
    listOrdensServico(), listTerceiros('clientes'), listProdutos(), listLocais(),
  ]);
  return (
    <main className="p-4 md:p-6 max-w-6xl mx-auto">
      <OSClient
        itens={itens} clientes={clientes} produtos={produtos} locais={locais}
        criar={criarOS} apagar={cancelarOS}
      />
    </main>
  );
}
```

- [ ] **Step 6: Acrescentar o item de menu em `components/Sidebar.tsx`**

No import do topo, acrescentar `ClipboardList` à lista de ícones do `lucide-react`:

```ts
import { Building2, Boxes, CalendarClock, CalendarDays, ClipboardList, FolderKanban, Home, Layers, MapPin, Package, ScrollText, ShoppingCart, Trash2, Truck, UserSquare2, Users, Vault } from 'lucide-react';
```

No import de `lib/authz`, acrescentar `canManageOrdensServico`:

```ts
import { canManageAgenda, canManageContratacoes, canManageLocaisGravacao, canManageOrdensServico, canManageProdutos, canManageTerceiros } from '@/lib/authz';
```

Logo depois do grupo `Contratações` (o bloco `...(canManageContratacoes(actor) ? [...] : [])`
adicionado no módulo anterior), acrescentar:

```ts
    ...(canManageOrdensServico(actor)
      ? [{
          label: 'Ordens de Serviço',
          icon: <ClipboardList size={18} className={iconClass} />,
          items: [{ href: '/ordens-servico', label: 'Ordens de Serviço', icon: <ClipboardList size={18} className={iconClass} /> }],
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

Acessar `http://localhost:3000/ordens-servico` logado como master. Antes de testar a OS,
garanta que o cliente escolhido tenha saldo (crie uma contratação avulsa em `/contratacoes`
primeiro). Confirme: (1) criar uma OS com 1 item sem pré-agendar desconta o saldo certo; (2)
criar uma OS com 1 item pré-agendado cria um card `pre_agendado` visível em `/agenda`; (3)
cancelar a OS devolve o saldo (visível de novo em `/contratacoes`) e o card na agenda vira
`cancelado`.

- [ ] **Step 9: Commit**

```bash
git add components/OSClient.tsx app/\(app\)/ordens-servico components/Sidebar.tsx tests/OSClient.test.tsx
git commit -m "Adiciona tela, rota e menu de Ordem de Serviço"
```

---

## Self-Review

- **Cobertura da spec:** modelo de dados (`ordens_servico`/`os_itens`/`os_item_saldos`, Task 1),
  validação de formulário com array de itens e campos condicionais de pré-agendamento (Task 2),
  FIFO de saldo entre contratações + checagem de conflito de agenda + criação transacional
  tudo-ou-nada + cancelamento com reversão em cascata (Task 3), tela com repetidor de linhas,
  wiring de rota/menu (Task 4) — todas as seções da spec têm task correspondente.
- **Placeholders:** nenhum "TBD"/"implementar depois" — todo código está completo em cada step.
- **Consistência de tipos:** `DadosOS`/`DadosOSItem`/`OrdemServico`/`OSItemLinha` (Task 1) usados
  sem alteração de forma em `lerDadosOS` (Task 2), `createOrdemServico`/`listOrdensServico`/
  `cancelarOrdemServico` (Task 3) e `OSClient`/`actions.ts` (Task 4). `SaldoInsuficienteError`/
  `ConflitoAgendaError` exportados na Task 3, importados na Task 4. `existeConflito` exportado de
  `lib/db/agenda.ts` na Task 3 (mudança mínima, uma palavra) e consumido na mesma task.
  `canManageOrdensServico` da Task 1 usado no Sidebar na Task 4.
- **Lição herdada da revisão de Contratação:** `assertUuid` em todo id externo antes de query
  (Global Constraints); formulário com `abertoPorPadrao` evita ambiguidade de texto duplicado
  nos testes de tela desde o primeiro rascunho, sem precisar de correção pós-revisão.
