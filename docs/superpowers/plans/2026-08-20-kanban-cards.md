# Kanban — Cards e Reserva/Consumo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar cards ao quadro de Planejamento e mover o débito de saldo do cliente da
criação da OS para a conclusão (card ou agendamento).

**Architecture:** Schema novo (`tarefas` + `quantidade_reservada`), uma camada de lógica
pura (cor/ordenação, TDD), uma camada de dados que concentra todas as transições de saldo
(`lib/db/tarefas.ts`), mudanças cirúrgicas em OS e Agenda pra disparar reserva/consumo, e
por fim a UI (quadro, cards, modal, DnD).

**Tech Stack:** Next.js 15 (App Router, Server Actions), TypeScript, Neon Postgres sem
ORM, Tailwind, `@dnd-kit`, Vitest.

Spec: `docs/superpowers/specs/2026-08-20-kanban-cards-design.md`.

## Global Constraints

- `disponivel = quantidade_total - quantidade_reservada - quantidade_consumida`. Toda
  leitura de saldo passa a usar essa fórmula.
- **Card = 1 unidade.** Uma tarefa reserva/consome exatamente 1 de 1 `contratacao_item_id`.
  Nunca há campo de quantidade em `tarefas`.
- **Tarefa com `agendamento_id` não debita nem devolve pelo card** — quem consome é o
  agendamento. Vale nos dois sentidos.
- `tarefas.coluna` guarda o **id** de `COLUNAS_KANBAN` (`lib/kanban.ts`), nunca o rótulo.
- Toda transição de saldo é feita em **transação** (`sql.transaction`), nunca em queries
  soltas — saldo errado é dano em dado de cliente.
- Deduções já existentes em `quantidade_consumida` não são revertidas nem migradas.
- Ordenação da coluna: `ajuste` desc, `prioridade` asc, `created_at` asc.

---

### Task 1: Schema e tipos

**Files:**
- Create: `db/migrations/012_tarefas.sql`
- Modify: `lib/types.ts`

**Interfaces:**
- Produces: tabela `tarefas`, coluna `contratacao_itens.quantidade_reservada`, tipos
  `Tarefa` e `DadosTarefa`

- [ ] **Step 1:** Cria `db/migrations/012_tarefas.sql`

```sql
-- Cards do quadro de Planejamento (Working). Cada tarefa é UMA unidade de trabalho:
-- reserva e consome exatamente 1 de um contratacao_itens. Precisa de 3? São 3 tarefas.
-- Isso evita ter que dividir reserva entre contratações, como os_itens faz via
-- os_item_saldos. Ver docs/superpowers/specs/2026-08-20-kanban-cards-design.md.

-- Reserva: criada ao abrir a tarefa, vira consumo quando ela (ou o agendamento dela)
-- conclui. Sem isso, mover o débito para a conclusão deixaria de barrar venda acima do
-- saldo. Linhas existentes nascem com 0 — deduções antigas seguem válidas como consumo.
alter table contratacao_itens
  add column quantidade_reservada int not null default 0 check (quantidade_reservada >= 0);

create table tarefas (
  id                   uuid primary key default gen_random_uuid(),
  cliente_id           uuid not null references clientes(id),
  responsavel_id       uuid references users(id),
  produto_id           uuid not null references produtos(id),
  contratacao_item_id  uuid not null references contratacao_itens(id),
  -- Preenchido => quem consome é o agendamento, não o card (evita débito duplo em
  -- produto de gravação).
  agendamento_id       uuid references agendamentos(id),
  -- Preenchido => tarefa nasceu de um item de OS.
  os_item_id           uuid references os_itens(id),
  tarefa               text,
  coluna               text not null check (coluna in
                         ('roadmap','a_fazer','executando','block','homologacao_cliente','concluido')),
  prioridade           int not null default 0,
  deadline_cliente     date,
  deadline_tarefa      date,
  -- Voltou de Homologação Cliente para coluna que não é Concluído.
  ajuste               boolean not null default false,
  -- Marca que ESTA tarefa já converteu sua reserva em consumo, para não debitar duas
  -- vezes nem devolver o que não debitou.
  consumido            boolean not null default false,
  deleted_at           timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index tarefas_coluna_idx on tarefas (coluna) where deleted_at is null;
create index tarefas_cliente_idx on tarefas (cliente_id);
create index tarefas_agendamento_idx on tarefas (agendamento_id);
create index tarefas_os_item_idx on tarefas (os_item_id);
```

- [ ] **Step 2:** Aplica a migration no banco

```bash
npm run migrate
```

**Sempre pelo runner, nunca na mão.** `db/migrate.mjs` roda cada arquivo em transação e
registra o nome em `_migrations`. Aplicar por fora deixa o objeto no banco sem a linha no
ledger — e aí a próxima `npm run migrate` tenta reaplicar, estoura `column already
exists`, dá rollback e sai com erro, travando toda migration seguinte.

Confirma depois:

```bash
node -e "require('dotenv').config({path:'.env.local'});const{neon}=require('@neondatabase/serverless');const sql=neon(process.env.DATABASE_URL);sql\`select column_name from information_schema.columns where table_name='contratacao_itens'\`.then(r=>console.log(r.map(x=>x.column_name).join(',')))"
```

Esperado: a lista inclui `quantidade_reservada`.

- [ ] **Step 3:** Adiciona os tipos em `lib/types.ts`, junto do bloco de contratação

```typescript
export type Tarefa = {
  id: string;
  cliente_id: string;
  cliente_nome: string;
  responsavel_id: string | null;
  responsavel_nome: string | null;
  produto_id: string;
  produto_nome: string;
  contratacao_item_id: string;
  agendamento_id: string | null;
  os_item_id: string | null;
  tarefa: string | null;
  coluna: string;
  prioridade: number;
  deadline_cliente: string | null;
  deadline_tarefa: string | null;
  ajuste: boolean;
  consumido: boolean;
  created_at: string;
};

export type DadosTarefa = {
  cliente_id: string;
  responsavel_id: string | null;
  contratacao_item_id: string;
  tarefa: string | null;
  coluna: string;
  prioridade: number;
  deadline_cliente: string | null;
  deadline_tarefa: string | null;
};
```

`produto_id` não entra em `DadosTarefa`: ele é derivado do `contratacao_item_id`
escolhido (a linha da carteira já sabe seu produto). Deixar o cliente mandar os dois
abriria a porta pra divergirem.

- [ ] **Step 4:** `npx tsc --noEmit` limpo, `npx vitest run --maxWorkers=2` sem regressão

- [ ] **Step 5:** Commit

```bash
git add db/migrations/012_tarefas.sql lib/types.ts
git commit -m "Adiciona tabela tarefas e coluna quantidade_reservada"
```

---

### Task 2: Lógica pura — cor e ordenação (TDD)

Duas regras com bordas fáceis de errar, sem banco. Testadas isoladas.

**Files:**
- Create: `lib/tarefas-calc.ts`
- Create: `tests/tarefas-calc.test.ts`

**Interfaces:**
- Produces:
  - `type CorPrazo = 'verde' | 'amarelo' | 'vermelho' | 'neutro'`
  - `function corPorDeadline(deadline: string | Date | null, hoje?: Date): CorPrazo`
  - `function ordenarTarefas<T extends OrdenavelTarefa>(tarefas: T[]): T[]`

- [ ] **Step 1:** Escreve `tests/tarefas-calc.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import { corPorDeadline, ordenarTarefas } from '@/lib/tarefas-calc';

// 2026-08-20T12:00Z = 09:00 em Brasília, mesmo dia. Data fixa pra não depender de "hoje".
const HOJE = new Date('2026-08-20T12:00:00Z');

describe('corPorDeadline', () => {
  it('sem deadline é neutro', () => {
    expect(corPorDeadline(null, HOJE)).toBe('neutro');
  });

  it('4 dias ou mais é verde', () => {
    expect(corPorDeadline('2026-08-24', HOJE)).toBe('verde');
    expect(corPorDeadline('2026-09-30', HOJE)).toBe('verde');
  });

  it('2 ou 3 dias é amarelo', () => {
    expect(corPorDeadline('2026-08-23', HOJE)).toBe('amarelo');
    expect(corPorDeadline('2026-08-22', HOJE)).toBe('amarelo');
  });

  it('1 dia, hoje ou atrasado é vermelho', () => {
    expect(corPorDeadline('2026-08-21', HOJE)).toBe('vermelho');
    expect(corPorDeadline('2026-08-20', HOJE)).toBe('vermelho');
    expect(corPorDeadline('2026-08-19', HOJE)).toBe('vermelho');
  });

  it('usa o dia em Brasília, não em UTC', () => {
    // 2026-08-21T02:00Z ainda é dia 20 em Brasília (UTC-3). Deadline 24 => 4 dias.
    expect(corPorDeadline('2026-08-24', new Date('2026-08-21T02:00:00Z'))).toBe('verde');
  });
});

describe('ordenarTarefas', () => {
  const base = { ajuste: false, prioridade: 5, created_at: '2026-08-10T00:00:00Z' };

  it('ajuste vem primeiro, mesmo com prioridade pior', () => {
    const r = ordenarTarefas([
      { id: 'a', ...base, prioridade: 1 },
      { id: 'b', ...base, prioridade: 99, ajuste: true },
    ]);
    expect(r.map((t) => t.id)).toEqual(['b', 'a']);
  });

  it('prioridade menor vem primeiro', () => {
    const r = ordenarTarefas([
      { id: 'a', ...base, prioridade: 3 },
      { id: 'b', ...base, prioridade: 1 },
    ]);
    expect(r.map((t) => t.id)).toEqual(['b', 'a']);
  });

  it('empate na prioridade: mais antigo primeiro', () => {
    const r = ordenarTarefas([
      { id: 'novo', ...base, created_at: '2026-08-15T00:00:00Z' },
      { id: 'velho', ...base, created_at: '2026-08-01T00:00:00Z' },
    ]);
    expect(r.map((t) => t.id)).toEqual(['velho', 'novo']);
  });

  it('não muta o array recebido', () => {
    const entrada = [
      { id: 'a', ...base, prioridade: 3 },
      { id: 'b', ...base, prioridade: 1 },
    ];
    ordenarTarefas(entrada);
    expect(entrada.map((t) => t.id)).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 2:** Roda, confirma que falha (módulo não existe)

```bash
npx vitest run tests/tarefas-calc.test.ts
```

- [ ] **Step 3:** Implementa `lib/tarefas-calc.ts`

```typescript
const FUSO = 'America/Sao_Paulo';

/** Y-M-D do instante dado, no fuso de Brasília. Mesma razão de lib/formato.ts: o
 *  servidor da Vercel roda em UTC, e "quantos dias faltam" tem que ser contado no dia
 *  que o usuário está vivendo, não no do servidor. */
function diaBrasilia(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

/** Dias inteiros entre duas datas Y-M-D, tratadas como datas puras (sem hora/fuso). */
function diasEntre(de: string, ate: string): number {
  const [ay, am, ad] = de.split('-').map(Number);
  const [by, bm, bd] = ate.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

export type CorPrazo = 'verde' | 'amarelo' | 'vermelho' | 'neutro';

export function corPorDeadline(deadline: string | null, hoje: Date = new Date()): CorPrazo {
  if (!deadline) return 'neutro';
  const dias = diasEntre(diaBrasilia(hoje), deadline.slice(0, 10));
  if (dias >= 4) return 'verde';
  if (dias >= 2) return 'amarelo';
  return 'vermelho';
}

export type OrdenavelTarefa = { ajuste: boolean; prioridade: number; created_at: string };

/** Ajuste no topo, depois prioridade asc, empate pelo mais antigo. Retorna array novo. */
export function ordenarTarefas<T extends OrdenavelTarefa>(tarefas: T[]): T[] {
  return [...tarefas].sort((a, b) => {
    if (a.ajuste !== b.ajuste) return a.ajuste ? -1 : 1;
    if (a.prioridade !== b.prioridade) return a.prioridade - b.prioridade;
    return a.created_at.localeCompare(b.created_at);
  });
}
```

- [ ] **Step 4:** Roda os testes, confirma que passam (13 casos)

- [ ] **Step 5:** `npx tsc --noEmit` e suíte inteira

- [ ] **Step 6:** Commit

```bash
git add lib/tarefas-calc.ts tests/tarefas-calc.test.ts
git commit -m "Adiciona lógica de cor por deadline e ordenação de tarefas"
```

---

### Task 3: Camada de dados das tarefas

O coração do risco: toda transição de saldo mora aqui, em transação.

**Files:**
- Create: `lib/db/tarefas.ts`

**Interfaces:**
- Consumes: `sql`, `assertUuid`, tipos `Tarefa`/`DadosTarefa`
- Produces:
  - `class SaldoIndisponivelError extends Error`
  - `function listTarefas(): Promise<Tarefa[]>`
  - `function listItensDisponiveisDoCliente(clienteId): Promise<ItemDisponivel[]>`
  - `function createTarefa(dados: DadosTarefa): Promise<string>`
  - `function moverTarefa(id: string, coluna: string): Promise<void>`
  - `function reordenarTarefas(ids: string[]): Promise<void>`
  - `function softDeleteTarefa(id: string): Promise<void>`

- [ ] **Step 1:** Cria `lib/db/tarefas.ts` com leitura e criação

```typescript
import { sql } from '@/lib/db/client';
import { NotFoundError } from '@/lib/authz';
import { assertUuid } from '@/lib/validation';
import type { DadosTarefa, Tarefa } from '@/lib/types';

export class SaldoIndisponivelError extends Error {
  constructor(produtoNome: string) {
    super(`Sem saldo disponível de "${produtoNome}" para este cliente.`);
  }
}

export async function listTarefas(): Promise<Tarefa[]> {
  return (await sql`
    select t.id, t.cliente_id, cl.nome as cliente_nome, t.responsavel_id, u.name as responsavel_nome,
           t.produto_id, p.nome as produto_nome, t.contratacao_item_id, t.agendamento_id, t.os_item_id,
           t.tarefa, t.coluna, t.prioridade, t.deadline_cliente::text as deadline_cliente,
           t.deadline_tarefa::text as deadline_tarefa, t.ajuste, t.consumido,
           t.created_at::text as created_at
      from tarefas t
      join clientes cl on cl.id = t.cliente_id
      join produtos p on p.id = t.produto_id
      left join users u on u.id = t.responsavel_id
     where t.deleted_at is null
     order by t.prioridade, t.created_at`) as Tarefa[];
}

export type ItemDisponivel = {
  contratacao_item_id: string;
  produto_id: string;
  produto_nome: string;
  disponivel: number;
};

/** Itens da carteira do cliente com saldo livre. Alimenta o select de produto do
 *  formulário: só faz sentido abrir tarefa contra o que ele ainda tem. */
export async function listItensDisponiveisDoCliente(clienteId: string): Promise<ItemDisponivel[]> {
  assertUuid(clienteId);
  return (await sql`
    select ci.id as contratacao_item_id, ci.produto_id, p.nome as produto_nome,
           (ci.quantidade_total - ci.quantidade_reservada - ci.quantidade_consumida) as disponivel
      from contratacao_itens ci
      join contratacoes ct on ct.id = ci.contratacao_id
      join produtos p on p.id = ci.produto_id
     where ct.cliente_id = ${clienteId} and ct.deleted_at is null
       and (ci.quantidade_total - ci.quantidade_reservada - ci.quantidade_consumida) > 0
     order by ct.created_at, p.nome`) as ItemDisponivel[];
}
```

- [ ] **Step 2:** Adiciona `createTarefa` no mesmo arquivo

A reserva e a inserção vão na mesma transação, e o `update` carrega o guard de saldo no
próprio `where` — se outra requisição consumiu a última unidade no meio do caminho, o
update não afeta linha nenhuma e a transação não pode seguir. Checar antes com um select
separado deixaria uma janela de corrida entre o check e o update.

```typescript
export async function createTarefa(dados: DadosTarefa): Promise<string> {
  assertUuid(dados.cliente_id);
  assertUuid(dados.contratacao_item_id);

  const itens = (await sql`
    select ci.produto_id, p.nome as produto_nome,
           (ci.quantidade_total - ci.quantidade_reservada - ci.quantidade_consumida) as disponivel
      from contratacao_itens ci
      join produtos p on p.id = ci.produto_id
     where ci.id = ${dados.contratacao_item_id}`) as
    { produto_id: string; produto_nome: string; disponivel: number }[];

  const item = itens[0];
  if (!item) throw new NotFoundError();
  if (item.disponivel < 1) throw new SaldoIndisponivelError(item.produto_nome);

  const rows = (await sql`
    with reserva as (
      update contratacao_itens
         set quantidade_reservada = quantidade_reservada + 1
       where id = ${dados.contratacao_item_id}
         and quantidade_total - quantidade_reservada - quantidade_consumida >= 1
      returning id
    )
    insert into tarefas (cliente_id, responsavel_id, produto_id, contratacao_item_id,
                         tarefa, coluna, prioridade, deadline_cliente, deadline_tarefa)
    select ${dados.cliente_id}, ${dados.responsavel_id}, ${item.produto_id},
           ${dados.contratacao_item_id}, ${dados.tarefa}, ${dados.coluna},
           ${dados.prioridade}, ${dados.deadline_cliente}, ${dados.deadline_tarefa}
      from reserva
    returning id`) as { id: string }[];

  // Sem linha => o CTE de reserva não afetou nada => alguém levou a última unidade
  // entre o select acima e este update.
  if (!rows[0]) throw new SaldoIndisponivelError(item.produto_nome);
  return rows[0].id;
}
```

- [ ] **Step 3:** Adiciona `moverTarefa` — onde moram consumo, devolução e flag de ajuste

```typescript
const COLUNA_CONCLUIDO = 'concluido';
const COLUNA_HOMOLOGACAO = 'homologacao_cliente';

/**
 * Move a tarefa de coluna e aplica os efeitos colaterais da spec §2 e §4:
 *
 * - entrando em Concluído: reserva vira consumo — mas só se a tarefa não tem
 *   `agendamento_id`, porque nesse caso quem consome é o agendamento;
 * - saindo de Concluído: desfaz, e só se foi esta tarefa que consumiu (`consumido`);
 * - saindo de Homologação para coluna que não é Concluído: liga a flag `ajuste`;
 * - chegando em Concluído: desliga a flag.
 */
export async function moverTarefa(id: string, coluna: string): Promise<void> {
  assertUuid(id);

  const rows = (await sql`
    select coluna, agendamento_id, consumido, ajuste, contratacao_item_id
      from tarefas where id = ${id} and deleted_at is null`) as
    { coluna: string; agendamento_id: string | null; consumido: boolean; ajuste: boolean;
      contratacao_item_id: string }[];

  const atual = rows[0];
  if (!atual) throw new NotFoundError();
  if (atual.coluna === coluna) return;

  const vaiConsumir = coluna === COLUNA_CONCLUIDO && !atual.agendamento_id && !atual.consumido;
  const vaiDevolver = atual.coluna === COLUNA_CONCLUIDO && coluna !== COLUNA_CONCLUIDO && atual.consumido;

  // Chegou em Concluído: limpa. Saiu de Homologação pra outra coluna: liga. Fora
  // desses dois casos, preserva o que já estava.
  const novoAjuste = coluna === COLUNA_CONCLUIDO
    ? false
    : atual.coluna === COLUNA_HOMOLOGACAO ? true : atual.ajuste;

  const novoConsumido = vaiConsumir ? true : vaiDevolver ? false : atual.consumido;

  await sql.transaction([
    sql`update tarefas
           set coluna = ${coluna}, consumido = ${novoConsumido}, ajuste = ${novoAjuste},
               updated_at = now()
         where id = ${id}`,
    ...(vaiConsumir
      ? [sql`update contratacao_itens
                set quantidade_reservada = quantidade_reservada - 1,
                    quantidade_consumida = quantidade_consumida + 1
              where id = ${atual.contratacao_item_id}`]
      : []),
    ...(vaiDevolver
      ? [sql`update contratacao_itens
                set quantidade_reservada = quantidade_reservada + 1,
                    quantidade_consumida = quantidade_consumida - 1
              where id = ${atual.contratacao_item_id}`]
      : []),
  ]);
}
```

`ajuste` e `consumido` são calculados em JS e passados como parâmetro — nada de SQL cru
no meio do update. Por isso o select do começo lê `ajuste` também: sem ele não dá pra
preservar o valor atual no caso em que nenhuma das duas regras se aplica.

- [ ] **Step 4:** Adiciona `reordenarTarefas` e `softDeleteTarefa`

```typescript
/** Reescreve a prioridade na ordem recebida (0, 1, 2...). Usado pelo drag dentro da
 *  coluna. Tudo numa transação: ordem parcialmente aplicada embaralharia o quadro. */
export async function reordenarTarefas(ids: string[]): Promise<void> {
  for (const id of ids) assertUuid(id);
  if (ids.length === 0) return;
  await sql.transaction(
    ids.map((id, i) => sql`update tarefas set prioridade = ${i}, updated_at = now() where id = ${id}`),
  );
}

/** Apaga a tarefa e libera a reserva — mas não mexe em consumo já realizado. */
export async function softDeleteTarefa(id: string): Promise<void> {
  assertUuid(id);
  const rows = (await sql`
    select consumido, contratacao_item_id from tarefas
     where id = ${id} and deleted_at is null`) as
    { consumido: boolean; contratacao_item_id: string }[];
  if (!rows[0]) throw new NotFoundError();

  await sql.transaction([
    sql`update tarefas set deleted_at = now() where id = ${id}`,
    ...(rows[0].consumido
      ? []
      : [sql`update contratacao_itens set quantidade_reservada = quantidade_reservada - 1
              where id = ${rows[0].contratacao_item_id}`]),
  ]);
}
```

- [ ] **Step 5:** Testa contra o banco real, adicionando a `tests/integracao.test.ts`

O ciclo de saldo é onde erro custa dado de cliente. Cobre, dentro do bloco que já cria
cliente/produto/contratação: criar tarefa reserva 1; mover pra Concluído troca reserva
por consumo; tirar de Concluído desfaz; apagar libera reserva; e — o caso que mais
importa — tarefa **com** `agendamento_id` indo pra Concluído **não** mexe no saldo.

Segue o padrão do arquivo (gateado por `DATABASE_URL`, limpa o que criou no final).

- [ ] **Step 6:** `npx tsc --noEmit`, suíte inteira, e o arquivo de integração

```bash
npx vitest run tests/integracao.test.ts
```

- [ ] **Step 7:** Commit

```bash
git add lib/db/tarefas.ts tests/integracao.test.ts
git commit -m "Adiciona camada de dados de tarefas com reserva e consumo de saldo"
```

---

### Task 4: OS passa a reservar e gerar tarefas

**Files:**
- Modify: `lib/db/ordens-servico.ts`

- [ ] **Step 1:** Lê `createOrdemServico` inteira antes de mexer

Ela hoje: valida saldo por FIFO, monta `descontos`, e no final faz
`quantidade_consumida + quantidade`. É esse último passo que muda.

- [ ] **Step 2:** Troca consumo por reserva na criação

Em `buscarSaldoDisponivel`, o `disponivel` e o `where` passam a descontar também
`quantidade_reservada`:

```sql
select ci.id as contratacao_item_id,
       (ci.quantidade_total - ci.quantidade_reservada - ci.quantidade_consumida) as disponivel
  from contratacao_itens ci
  join contratacoes ct on ct.id = ci.contratacao_id
 where ct.cliente_id = ${clienteId} and ct.deleted_at is null and ci.produto_id = ${produtoId}
   and ci.quantidade_total - ci.quantidade_reservada - ci.quantidade_consumida > 0
 order by ct.created_at asc
```

Na transação de `createOrdemServico`, o update de desconto vira:

```sql
update contratacao_itens set quantidade_reservada = quantidade_reservada + ${d.quantidade}
 where id = ${d.contratacao_item_id}
```

- [ ] **Step 3:** Gera uma tarefa por unidade

Ainda dentro da mesma transação, para cada `desconto` insere `d.quantidade` tarefas em
`a_fazer`, com `os_item_id` do item correspondente, `contratacao_item_id` de onde a
unidade saiu, e `agendamento_id` do item quando `pre_agendar` (senão null).

Uma tarefa por unidade, nunca uma por item — card é 1 unidade (Global Constraints).
Um item de quantidade 3 que consumiu 2 de uma contratação e 1 de outra gera 3 tarefas,
duas apontando pro primeiro `contratacao_item_id` e uma pro segundo.

- [ ] **Step 4:** Ajusta `cancelarOrdemServico`

Hoje devolve `quantidade_consumida - quantidade`. Agora precisa devolver de onde estiver:
as tarefas da OS que ainda **não** consumiram têm reserva a liberar; as que já
consumiram ficam como estão (consumo realizado não se desfaz por cancelamento de OS,
mesmo princípio já documentado em `010_contratacoes.sql`). Marca as tarefas da OS como
`deleted_at`.

- [ ] **Step 5:** Estende o teste de integração da OS

Criar OS reserva (não consome) e gera N tarefas; cancelar libera a reserva das não
consumidas. `tests/integracao.test.ts` já tem cobertura de OS — estende ali.

- [ ] **Step 6:** `npx tsc --noEmit`, suíte inteira, integração

- [ ] **Step 7:** Commit

```bash
git add lib/db/ordens-servico.ts tests/integracao.test.ts
git commit -m "OS passa a reservar saldo e gerar tarefas no Kanban"
```

---

### Task 5: Agendamento concluído consome

**Files:**
- Modify: `lib/db/agenda.ts`

- [ ] **Step 1:** Localiza onde o status muda (`updateAgendamento`)

- [ ] **Step 2:** Ao passar para `concluido`, consome pelas tarefas do agendamento

Numa transação: para cada tarefa com aquele `agendamento_id`, `deleted_at is null` e
`consumido = false`, faz `reservada - 1 / consumida + 1` no `contratacao_item_id` dela e
marca `consumido = true`.

O `consumido = false` no filtro é o que torna a operação idempotente — salvar de novo um
agendamento que já estava concluído não pode debitar segunda vez.

- [ ] **Step 3:** Saindo de `concluido`, desfaz

Simétrico: tarefas daquele agendamento com `consumido = true` voltam
`reservada + 1 / consumida - 1` e `consumido = false`.

- [ ] **Step 4:** Teste de integração: concluir agendamento consome; concluir de novo não
  duplica; voltar o status devolve

- [ ] **Step 5:** `npx tsc --noEmit`, suíte inteira, integração

- [ ] **Step 6:** Commit

```bash
git add lib/db/agenda.ts tests/integracao.test.ts
git commit -m "Agendamento concluído consome o saldo reservado da tarefa"
```

---

### Task 6: UI — cards, modal de criação, Server Actions

**Files:**
- Create: `app/(app)/working/planejamento/actions.ts`
- Create: `components/TarefaCard.tsx`
- Modify: `components/KanbanBoard.tsx`
- Modify: `app/(app)/working/planejamento/page.tsx`
- Modify: `tests/KanbanBoard.test.tsx`

- [ ] **Step 1:** Server Actions em `actions.ts`

`criarTarefaAction` (via `useActionState`, padrão de todo formulário do projeto),
`moverTarefaAction`, `reordenarTarefasAction`, `apagarTarefaAction`, e
`buscarItensDoClienteAction` (chamada direto, não é submissão — mesmo padrão de
`buscarDadosClienteAction` em `app/(app)/cadastros/clientes/actions.ts`).

Guard `requireReadyUser`, `revalidatePath('/working/planejamento')`, e `audit(...)` nas
que escrevem — padrão dos outros `actions.ts`.

- [ ] **Step 2:** `components/TarefaCard.tsx`

Client component. Resumido: cliente, responsável, prioridade, produto. Clique alterna pro
estendido, que soma tarefa, deadline cliente e deadline tarefa. Cor da borda por
`corPorDeadline` (Task 2); `ajuste` sobrepõe com vermelho vivo e ícone
`AlertCircle` (`lucide-react`).

Usa só tokens existentes (`--danger`, `--ok`, `--accent`, `.glass`).

- [ ] **Step 3:** `KanbanBoard` recebe as tarefas e distribui por coluna

Vira client component (precisa de estado pro modal e, na Task 7, pro DnD). Recebe
`tarefas: Tarefa[]` e as Server Actions por prop. Dentro de cada coluna, filtra por
`coluna` e ordena com `ordenarTarefas` (Task 2).

Cabeçalho da coluna vira botão: clique → `confirm('Deseja incluir uma nova tarefa?')` →
abre `ModalForm` com a coluna de origem já definida.

- [ ] **Step 4:** Formulário de criação

Campos da spec §5. Cliente (select de `clientes`) e responsável (select de `users`) vêm
por prop da page. Produto carrega por `buscarItensDoClienteAction` **após** escolher o
cliente, e o `value` da option é o `contratacao_item_id` — é ele que a action precisa,
não o `produto_id`.

- [ ] **Step 5:** `page.tsx` busca tarefas, clientes e usuários e passa pro board

Continua Server Component; o board é que é client.

- [ ] **Step 6:** Testes de componente

Card resumido não mostra os campos do estendido; clique revela. Cabeçalho abre o modal.
Ordenação dentro da coluna respeita ajuste/prioridade. Mocka as actions, sem banco.

- [ ] **Step 7:** `npx tsc --noEmit`, suíte inteira

- [ ] **Step 8:** Commit

```bash
git add "app/(app)/working/planejamento" components/TarefaCard.tsx \
  components/KanbanBoard.tsx tests/KanbanBoard.test.tsx
git commit -m "Adiciona cards ao Kanban com modal de criação"
```

---

### Task 7: Drag and drop

**Files:**
- Modify: `package.json`, `components/KanbanBoard.tsx`

- [ ] **Step 1:** Instala `@dnd-kit`

```bash
npm install @dnd-kit/core @dnd-kit/sortable
```

- [ ] **Step 2:** Envolve o quadro em `DndContext`, cada coluna em `SortableContext`

- [ ] **Step 3:** `onDragEnd`

Soltou em coluna diferente → `moverTarefaAction(id, novaColuna)`. Soltou na mesma coluna
→ `reordenarTarefasAction(idsNaNovaOrdem)`.

Aplica a mudança no estado local antes da action resolver (o quadro não pode congelar
esperando o servidor) e reverte se a action falhar — `moverTarefaAction` pode falhar de
verdade, por exemplo se a tarefa foi apagada em outra aba.

- [ ] **Step 4:** Verificação manual — arrastar entre colunas e dentro da coluna

Teste automatizado de DnD com `@dnd-kit` exige simular eventos de ponteiro e dá pouco
retorno; a regra de negócio que o drag dispara já está coberta nas Tasks 2, 3 e 6.

- [ ] **Step 5:** `npx tsc --noEmit`, suíte inteira

- [ ] **Step 6:** Commit

```bash
git add package.json package-lock.json components/KanbanBoard.tsx
git commit -m "Adiciona drag and drop ao quadro de Planejamento"
```

---

### Task 8: Saldo disponível nas telas existentes

`quantidade_reservada` existe desde a Task 1, mas as telas de saldo ainda mostram
`total - consumida`. Fecha essa ponta.

**Files:**
- Modify: `lib/db/contratacoes.ts`, `lib/types.ts`
- Modify: `components/ContratacaoClient.tsx`, `components/TerceiroClient.tsx`

- [ ] **Step 1:** Expõe `quantidade_reservada` no json de itens

Nas duas queries de `lib/db/contratacoes.ts` (`listContratacoes` e
`listContratacoesDoCliente`), adiciona `'quantidade_reservada', ci.quantidade_reservada`
ao `json_build_object`. Adiciona o campo em `ContratacaoItemSaldo` (`lib/types.ts`).

- [ ] **Step 2:** Corrige o disponível exibido

- `components/ContratacaoClient.tsx`: a coluna Saldo mostra
  `total - reservada - consumida`.
- `components/TerceiroClient.tsx`, `AbaCompras`: a coluna "Disponível" idem, e ganha
  coluna "Reservado" — sem ela o número não fecha na conta pro usuário.

- [ ] **Step 3:** `npx tsc --noEmit`, suíte inteira

- [ ] **Step 4:** Verificação manual: cliente com tarefa aberta mostra reservado > 0 e
  disponível menor

- [ ] **Step 5:** Commit

```bash
git add lib/db/contratacoes.ts lib/types.ts \
  components/ContratacaoClient.tsx components/TerceiroClient.tsx
git commit -m "Exibe saldo reservado e corrige disponível nas telas de contratação"
```

---

## Testing

```bash
npx tsc --noEmit
npx vitest run --maxWorkers=2
npx vitest run tests/integracao.test.ts   # precisa de DATABASE_URL
```

`--maxWorkers=2` evita o timeout de spawn de worker desta máquina, que falha por
ambiente e não por teste quebrado.

Manual, no fim: criar tarefa e conferir reserva na aba Compras do cliente; arrastar até
Concluído e conferir que virou consumo; tirar de Concluído e conferir que voltou; mover
de Homologação pra outra coluna e conferir a flag de ajuste no topo.
