# Cadastro de Clientes e Fornecedores — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dois cadastros novos — Clientes e Fornecedores — dentro do grupo de menu "Cadastros", com CRUD completo (criar, editar, apagar via lixeira), master-only.

**Architecture:** Duas tabelas (`clientes`, `fornecedores`) de forma idêntica, mas uma camada de dados genérica só (`lib/db/terceiros.ts`) parametrizada pelo nome da tabela — evita duplicar CRUD. A UI espelha isso: um componente `TerceiroClient` genérico reusado pelas duas rotas. Lixeira e auditoria estendem o mecanismo já existente (usado hoje por salas e credenciais) em vez de criar um segundo.

**Tech Stack:** Next.js 15 (App Router), TypeScript strict, Neon Postgres sem ORM (`@neondatabase/serverless`), vitest (projetos `node` e `jsdom`).

**Spec:** [docs/superpowers/specs/2026-08-08-cadastro-clientes-fornecedores-design.md](../specs/2026-08-08-cadastro-clientes-fornecedores-design.md) (commit `6809239`)

## Global Constraints

- TypeScript strict. `npx tsc --noEmit` precisa sair limpo ao fim de toda task.
- `npm test` precisa passar inteiro ao fim de toda task. Base atual: **116 testes**.
- Nenhuma dependência de runtime nova. Nenhuma variável de ambiente nova.
- Identificadores em português, como no resto do projeto.
- `tabela: TipoTerceiro` (`'clientes' | 'fornecedores'`) só pode vir de um literal escolhido pelo próprio código — nunca de formulário, query string ou qualquer entrada externa. É isso que torna seguro usar `sql.unsafe(tabela)` para interpolar o nome da tabela dentro do tagged template `sql\`...\`` (confirmado contra o banco real: `sql.unsafe('rooms')` dentro de `sql\`select count(*) from ${t}\`` funciona).
- Autorização é reaplicada no servidor (`requireMaster()` em toda rota/action de `/cadastros/*`). Esconder item no menu é cosmético.
- Não escrever teste que jsdom não consegue verificar de verdade: layout e máscara de digitação ficam fora da suíte automatizada (mesma regra já registrada no plano do sidebar).

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `db/migrations/005_clientes_fornecedores.sql` (novo) | Tabelas `clientes` e `fornecedores`. |
| `lib/types.ts` (modificar) | Tipos `TipoTerceiro`, `Terceiro`, `DadosTerceiro`. |
| `lib/terceiros-form.ts` (novo) | Ler e validar o `FormData` dos 6 campos editáveis. Puro, sem I/O. |
| `lib/db/terceiros.ts` (novo) | CRUD genérico parametrizado por `tabela: TipoTerceiro`. |
| `lib/authz.ts` (modificar) | Ganha `canManageTerceiros()`. |
| `lib/db/queries.ts` (modificar) | `TrashItem.kind`, `listTrash`, `restoreItem`, `purgeItem` ganham `'cliente' | 'fornecedor'`. |
| `lib/db/audit.ts` (modificar) | `entity_type` ganha `'cliente' | 'fornecedor'`. |
| `components/RestoreButton.tsx` (modificar) | `kind` amplia a união. |
| `components/PurgeButton.tsx` (modificar) | `kind` amplia a união. |
| `app/(app)/admin/lixeira/actions.ts` (modificar) | `kind` amplia a união em `restaurar`/`expurgar`. |
| `app/(app)/admin/lixeira/page.tsx` (modificar) | Rótulo (`badge`) pros dois `kind` novos. |
| `components/TerceiroClient.tsx` (novo) | Grid + formulário de novo + modal de edição, genérico (`tipo: 'cliente' | 'fornecedor'`). |
| `app/(app)/cadastros/clientes/actions.ts` (novo) | `criarCliente`, `salvarCliente`, `apagarCliente`. |
| `app/(app)/cadastros/clientes/page.tsx` (novo) | Server component, `requireMaster()` + `listTerceiros('clientes')`. |
| `app/(app)/cadastros/fornecedores/actions.ts` (novo) | Espelha o de clientes, tabela `'fornecedores'`. |
| `app/(app)/cadastros/fornecedores/page.tsx` (novo) | Espelha o de clientes. |
| `components/Sidebar.tsx` (modificar) | Grupo "Cadastros" ganha "Clientes" e "Fornecedores", visíveis só a master. |

---

## Task 1: Migration e tipos

**Files:**
- Create: `db/migrations/005_clientes_fornecedores.sql`
- Modify: `lib/types.ts`

**Interfaces:**
- Consumes: nada.
- Produces: schema com as tabelas `clientes` e `fornecedores`; tipos `TipoTerceiro`, `Terceiro`, `DadosTerceiro`.

- [ ] **Step 1: Escrever a migration**

Criar `db/migrations/005_clientes_fornecedores.sql`:

```sql
-- Cadastro de clientes e fornecedores. Duas tabelas separadas (não uma com
-- campo `tipo`): são conceitos diferentes que hoje têm os mesmos campos, mas
-- não necessariamente vão continuar assim.
create table clientes (
  id                  uuid primary key default gen_random_uuid(),
  nome                text not null,
  contato_responsavel text,
  email               text,
  telefone            text,
  cidade              text,
  uf                  text check (uf is null or uf ~ '^[A-Z]{2}$'),
  deleted_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table fornecedores (
  id                  uuid primary key default gen_random_uuid(),
  nome                text not null,
  contato_responsavel text,
  email               text,
  telefone            text,
  cidade              text,
  uf                  text check (uf is null or uf ~ '^[A-Z]{2}$'),
  deleted_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
```

- [ ] **Step 2: Aplicar e conferir**

```bash
npm run migrate
```

Esperado: `+ aplicando 005_clientes_fornecedores.sql...` seguido de sucesso, sem erro.

```bash
node -e "const{config}=require('dotenv');config({path:'.env.local'});config();const pg=require('pg');(async()=>{const c=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:true}});await c.connect();console.log((await c.query(\"select table_name from information_schema.tables where table_name in ('clientes','fornecedores')\")).rows);await c.end();})()"
```

Esperado: duas linhas, `clientes` e `fornecedores`.

- [ ] **Step 3: Acrescentar os tipos**

Em `lib/types.ts`, acrescentar ao final do arquivo:

```ts
/** `tabela` nunca vem de input do usuário — sempre um literal escolhido pelo
 *  próprio código de cada rota (`/cadastros/clientes` chama sempre com
 *  `'clientes'`). Isso é o que torna seguro usar `sql.unsafe(tabela)` em
 *  `lib/db/terceiros.ts` para interpolar o nome da tabela. */
export type TipoTerceiro = 'clientes' | 'fornecedores';

export type Terceiro = {
  id: string;
  nome: string;
  contato_responsavel: string | null;
  email: string | null;
  telefone: string | null;
  cidade: string | null;
  uf: string | null;
  created_at: string;
};

export type DadosTerceiro = {
  nome: string;
  contato_responsavel: string | null;
  email: string | null;
  telefone: string | null;
  cidade: string | null;
  uf: string | null;
};
```

- [ ] **Step 4: Conferir e commitar**

```bash
npx tsc --noEmit
npm test
```

Esperado: `tsc` sem saída; **116 testes** passando (nenhum teste novo nesta task).

```bash
git add db/migrations/005_clientes_fornecedores.sql lib/types.ts
git commit -m "Cria tabelas clientes e fornecedores"
```

---

## Task 2: Leitura e validação do formulário (`lib/terceiros-form.ts`)

**Files:**
- Create: `lib/terceiros-form.ts`
- Test: `tests/terceiros-form.test.ts`

**Interfaces:**
- Consumes: `soDigitos` de `lib/documentos.ts`; tipo `DadosTerceiro` de `lib/types.ts`.
- Produces: `lerDadosTerceiro(fd: FormData): DadosTerceiro | { error: string }`.

- [ ] **Step 1: Escrever os testes que falham**

Criar `tests/terceiros-form.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { lerDadosTerceiro } from '@/lib/terceiros-form';

function formData(campos: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
}

describe('lerDadosTerceiro', () => {
  it('nome vazio retorna erro', () => {
    const r = lerDadosTerceiro(formData({ nome: '  ' }));
    expect(r).toEqual({ error: 'Informe o nome.' });
  });

  it('UF com formato inválido retorna erro', () => {
    const r = lerDadosTerceiro(formData({ nome: 'ACME', uf: 'SPX' }));
    expect(r).toEqual({ error: 'Estado inválido. Use a sigla, ex.: SP.' });
  });

  it('UF minúscula é aceita e vira maiúscula', () => {
    const r = lerDadosTerceiro(formData({ nome: 'ACME', uf: 'sp' }));
    expect('error' in r).toBe(false);
    if (!('error' in r)) expect(r.uf).toBe('SP');
  });

  it('campos opcionais em branco viram null', () => {
    const r = lerDadosTerceiro(formData({ nome: 'ACME' }));
    expect('error' in r).toBe(false);
    if (!('error' in r)) {
      expect(r.contato_responsavel).toBeNull();
      expect(r.email).toBeNull();
      expect(r.telefone).toBeNull();
      expect(r.cidade).toBeNull();
      expect(r.uf).toBeNull();
    }
  });

  it('telefone com máscara vira só dígitos', () => {
    const r = lerDadosTerceiro(formData({ nome: 'ACME', telefone: '(11) 98765-4321' }));
    expect('error' in r).toBe(false);
    if (!('error' in r)) expect(r.telefone).toBe('11987654321');
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx vitest run tests/terceiros-form.test.ts
```

Esperado: FAIL — `Cannot find module '@/lib/terceiros-form'`.

- [ ] **Step 3: Implementar**

Criar `lib/terceiros-form.ts`:

```ts
import { soDigitos } from '@/lib/documentos';
import type { DadosTerceiro } from '@/lib/types';

/** `''` vira `null`: campo em branco é ausência de dado, não string vazia no banco. */
function ouNulo(fd: FormData, campo: string): string | null {
  const v = String(fd.get(campo) ?? '').trim();
  return v === '' ? null : v;
}

const UF_RE = /^[A-Z]{2}$/;

/**
 * Lê e valida os campos editáveis do formulário de cliente/fornecedor. `nome`
 * vazio ou UF fora do formato voltam como `{ error }` em vez de deixar o banco
 * rejeitar com um erro de constraint cru (a UF também tem `check` no schema —
 * esta validação só existe para dar mensagem amigável antes de chegar lá).
 */
export function lerDadosTerceiro(fd: FormData): DadosTerceiro | { error: string } {
  const nome = String(fd.get('nome') ?? '').trim();
  if (!nome) return { error: 'Informe o nome.' };

  const uf = ouNulo(fd, 'uf')?.toUpperCase() ?? null;
  if (uf && !UF_RE.test(uf)) return { error: 'Estado inválido. Use a sigla, ex.: SP.' };

  const telefone = ouNulo(fd, 'telefone');

  return {
    nome,
    contato_responsavel: ouNulo(fd, 'contatoResponsavel'),
    email: ouNulo(fd, 'email'),
    telefone: telefone ? soDigitos(telefone) : null,
    cidade: ouNulo(fd, 'cidade'),
    uf,
  };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
npx vitest run tests/terceiros-form.test.ts
```

Esperado: PASS, 5 testes.

- [ ] **Step 5: Conferir tudo e commitar**

```bash
npx tsc --noEmit
npm test
```

Esperado: `tsc` sem saída; **121 testes** (116 + 5).

```bash
git add lib/terceiros-form.ts tests/terceiros-form.test.ts
git commit -m "Adiciona leitura e validacao do formulario de terceiro"
```

---

## Task 3: Camada de dados genérica (`lib/db/terceiros.ts`)

**Files:**
- Create: `lib/db/terceiros.ts`
- Modify (append): `tests/integracao.test.ts`

**Interfaces:**
- Consumes: `sql` de `lib/db/client.ts`; `NotFoundError` de `lib/authz.ts`; `assertUuid` de `lib/validation.ts`; tipos `TipoTerceiro`, `Terceiro`, `DadosTerceiro` de `lib/types.ts`.
- Produces:
  - `listTerceiros(tabela: TipoTerceiro): Promise<Terceiro[]>`
  - `getTerceiro(tabela: TipoTerceiro, id: string): Promise<Terceiro | null>`
  - `createTerceiro(tabela: TipoTerceiro, dados: DadosTerceiro): Promise<string>`
  - `updateTerceiro(tabela: TipoTerceiro, id: string, dados: DadosTerceiro): Promise<void>` (lança `NotFoundError` se `id` não existe ou já está apagado)
  - `softDeleteTerceiro(tabela: TipoTerceiro, id: string): Promise<void>` (lança `NotFoundError` nas mesmas condições)

- [ ] **Step 1: Escrever o teste que falha**

Abrir `tests/integracao.test.ts`. O arquivo termina em dois `describe` aninhados
(`'module_access'` na linha 260, `'cadastro de pessoa e vínculo'` na linha 277) dentro do
`descreve('integração com o banco real', ...)` principal — os últimos `});` do arquivo fecham,
nessa ordem, o describe `'cadastro de pessoa e vínculo'`, depois o describe principal. Acrescentar
os `it`s abaixo **depois do `});` que fecha `'cadastro de pessoa e vínculo'`** e **antes do `});`
final** que fecha o describe principal:

```ts
  it('cria, edita e apaga (soft) um cliente', async () => {
    const terceiros = await import('@/lib/db/terceiros');

    const id = await terceiros.createTerceiro('clientes', {
      nome: `${marca}-cliente`, contato_responsavel: 'Fulano', email: 'f@x.com',
      telefone: '11987654321', cidade: 'São Paulo', uf: 'SP',
    });

    const criado = await terceiros.getTerceiro('clientes', id);
    expect(criado?.nome).toBe(`${marca}-cliente`);
    expect((await terceiros.listTerceiros('clientes')).map((c) => c.id)).toContain(id);

    await terceiros.updateTerceiro('clientes', id, {
      nome: `${marca}-cliente-editado`, contato_responsavel: null, email: null,
      telefone: null, cidade: null, uf: null,
    });
    expect((await terceiros.getTerceiro('clientes', id))?.nome).toBe(`${marca}-cliente-editado`);

    await terceiros.softDeleteTerceiro('clientes', id);
    expect(await terceiros.getTerceiro('clientes', id)).toBeNull();
    expect((await terceiros.listTerceiros('clientes')).map((c) => c.id)).not.toContain(id);

    await sql`delete from clientes where id = ${id}`;
  });

  it('cria e apaga (soft) um fornecedor, mesma forma da tabela de clientes', async () => {
    const terceiros = await import('@/lib/db/terceiros');

    const id = await terceiros.createTerceiro('fornecedores', {
      nome: `${marca}-fornecedor`, contato_responsavel: null, email: null,
      telefone: null, cidade: null, uf: null,
    });

    expect((await terceiros.getTerceiro('fornecedores', id))?.nome).toBe(`${marca}-fornecedor`);

    await terceiros.softDeleteTerceiro('fornecedores', id);
    expect(await terceiros.getTerceiro('fornecedores', id)).toBeNull();

    await sql`delete from fornecedores where id = ${id}`;
  });
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx vitest run tests/integracao.test.ts
```

Esperado: FAIL — `Cannot find module '@/lib/db/terceiros'`.

- [ ] **Step 3: Implementar**

Criar `lib/db/terceiros.ts`:

```ts
import { sql } from '@/lib/db/client';
import { NotFoundError } from '@/lib/authz';
import { assertUuid } from '@/lib/validation';
import type { DadosTerceiro, Terceiro, TipoTerceiro } from '@/lib/types';

/**
 * `tabela` é sempre um dos dois literais do union `TipoTerceiro`, escolhido
 * pelo próprio código de cada rota (`/cadastros/clientes` chama sempre com
 * `'clientes'`) — nunca vem de formulário nem de qualquer entrada externa.
 * `sql.unsafe` só é seguro aqui por isso: não é interpolação de identificador
 * a partir de input do usuário.
 */
function nomeTabela(tabela: TipoTerceiro) {
  return sql.unsafe(tabela);
}

export async function listTerceiros(tabela: TipoTerceiro): Promise<Terceiro[]> {
  const t = nomeTabela(tabela);
  return (await sql`
    select id, nome, contato_responsavel, email, telefone, cidade, uf, created_at
      from ${t}
     where deleted_at is null
     order by nome`) as Terceiro[];
}

export async function getTerceiro(tabela: TipoTerceiro, id: string): Promise<Terceiro | null> {
  assertUuid(id);
  const t = nomeTabela(tabela);
  const rows = (await sql`
    select id, nome, contato_responsavel, email, telefone, cidade, uf, created_at
      from ${t}
     where id = ${id} and deleted_at is null`) as Terceiro[];
  return rows[0] ?? null;
}

export async function createTerceiro(tabela: TipoTerceiro, dados: DadosTerceiro): Promise<string> {
  const t = nomeTabela(tabela);
  const rows = (await sql`
    insert into ${t} (nome, contato_responsavel, email, telefone, cidade, uf)
    values (${dados.nome}, ${dados.contato_responsavel}, ${dados.email}, ${dados.telefone},
            ${dados.cidade}, ${dados.uf})
    returning id`) as { id: string }[];
  return rows[0].id;
}

export async function updateTerceiro(
  tabela: TipoTerceiro, id: string, dados: DadosTerceiro,
): Promise<void> {
  assertUuid(id);
  const t = nomeTabela(tabela);
  const rows = (await sql`
    update ${t}
       set nome = ${dados.nome}, contato_responsavel = ${dados.contato_responsavel},
           email = ${dados.email}, telefone = ${dados.telefone}, cidade = ${dados.cidade},
           uf = ${dados.uf}, updated_at = now()
     where id = ${id} and deleted_at is null
     returning id`) as { id: string }[];
  if (!rows[0]) throw new NotFoundError();
}

export async function softDeleteTerceiro(tabela: TipoTerceiro, id: string): Promise<void> {
  assertUuid(id);
  const t = nomeTabela(tabela);
  const rows = (await sql`
    update ${t} set deleted_at = now()
     where id = ${id} and deleted_at is null
     returning id`) as { id: string }[];
  if (!rows[0]) throw new NotFoundError();
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
npx vitest run tests/integracao.test.ts
```

Esperado: PASS, todos os testes do arquivo, incluindo os 2 novos.

- [ ] **Step 5: Conferir tudo e commitar**

```bash
npx tsc --noEmit
npm test
```

Esperado: `tsc` sem saída; **123 testes** (121 + 2).

```bash
git add lib/db/terceiros.ts tests/integracao.test.ts
git commit -m "Adiciona camada de dados generica para clientes e fornecedores"
```

---

## Task 4: Permissão (`canManageTerceiros`)

**Files:**
- Modify: `lib/authz.ts`
- Modify: `tests/authz.test.ts`

**Interfaces:**
- Consumes: `Actor` de `lib/types.ts`.
- Produces: `canManageTerceiros(actor: Actor): boolean`.

- [ ] **Step 1: Escrever o teste que falha**

Em `tests/authz.test.ts`, dentro do `describe('administração', ...)` existente (depois do último `it`, antes do `});` que fecha esse describe), acrescentar:

```ts
  it('só master gerencia clientes e fornecedores', () => {
    expect(canManageTerceiros(master)).toBe(true);
    expect(canManageTerceiros(dono)).toBe(false);
  });
```

E no topo do arquivo, acrescentar `canManageTerceiros` ao import existente de `@/lib/authz`.

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx vitest run tests/authz.test.ts
```

Esperado: FAIL — `canManageTerceiros is not defined` / `is not a function`.

- [ ] **Step 3: Implementar**

Em `lib/authz.ts`, logo abaixo da linha `export const canManageUsers = (actor: Actor) => isMaster(actor);`, acrescentar:

```ts
/**
 * Master-only por enquanto, no mesmo formato de `canManageUsers`. Função
 * própria (e não reuso de `canManageUsers`) porque são permissões
 * conceitualmente diferentes — gerenciar usuário do sistema vs. gerenciar
 * cadastro de terceiro — mesmo empatando em "só master" hoje. Se um dia
 * usuário comum ganhar acesso a um mas não ao outro, a separação já existe.
 */
export const canManageTerceiros = (actor: Actor) => isMaster(actor);
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
npx vitest run tests/authz.test.ts
```

Esperado: PASS.

- [ ] **Step 5: Conferir tudo e commitar**

```bash
npx tsc --noEmit
npm test
```

Esperado: `tsc` sem saída; **124 testes** (123 + 1).

```bash
git add lib/authz.ts tests/authz.test.ts
git commit -m "Adiciona canManageTerceiros"
```

---

## Task 5: Lixeira e auditoria estendidas

**Files:**
- Modify: `lib/db/queries.ts:422-489` (bloco "Lixeira")
- Modify: `lib/db/audit.ts:5-11` (tipo `Entry`)
- Modify: `components/RestoreButton.tsx`
- Modify: `components/PurgeButton.tsx`
- Modify: `app/(app)/admin/lixeira/actions.ts`
- Modify: `app/(app)/admin/lixeira/page.tsx`
- Modify (append): `tests/integracao.test.ts`

**Interfaces:**
- Consumes: `createTerceiro`, `softDeleteTerceiro` de `lib/db/terceiros.ts` (task 3).
- Produces: `TrashItem['kind']`, `restoreItem`, `purgeItem` aceitando `'cliente' | 'fornecedor'`.

- [ ] **Step 1: Escrever o teste que falha**

Em `tests/integracao.test.ts`, acrescentar mais um `it` dentro do describe principal, depois dos dois adicionados na Task 3:

```ts
  it('cliente apagado aparece na lixeira, restaura e depois expurga', async () => {
    const terceiros = await import('@/lib/db/terceiros');

    const id = await terceiros.createTerceiro('clientes', {
      nome: `${marca}-lixeira`, contato_responsavel: null, email: null,
      telefone: null, cidade: null, uf: null,
    });
    await terceiros.softDeleteTerceiro('clientes', id);

    const lixeira = await q.listTrash();
    const item = lixeira.find((i) => i.kind === 'cliente' && i.id === id);
    expect(item?.title).toBe(`${marca}-lixeira`);

    await q.restoreItem('cliente', id);
    expect(await terceiros.getTerceiro('clientes', id)).not.toBeNull();

    await terceiros.softDeleteTerceiro('clientes', id);
    await q.purgeItem('cliente', id);
    const linhas = (await sql`select id from clientes where id = ${id}`) as { id: string }[];
    expect(linhas).toHaveLength(0);
  });
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx vitest run tests/integracao.test.ts
```

Esperado: FAIL — erro de tipo/runtime em `q.restoreItem('cliente', id)` (`kind` não aceita `'cliente'` ainda) ou `item` chega `undefined` porque `listTrash()` não inclui clientes.

- [ ] **Step 3: Estender `lib/db/queries.ts`**

Trocar o bloco inteiro de `TrashItem` até o fim de `purgeItem` (linhas 424–490 hoje) por:

```ts
export type TrashItem = {
  id: string;
  kind: 'credential' | 'room' | 'cliente' | 'fornecedor';
  title: string;
  room_name: string | null;
  deleted_at: string;
  /**
   * Só preenchido para `kind === 'room'`: quantas credenciais daquela sala (na
   * lixeira ou não) serão destruídas junto se a sala for expurgada. `null` para
   * os demais tipos, onde o expurgo não arrasta mais nada.
   */
  credential_count: number | null;
};

export async function listTrash(): Promise<TrashItem[]> {
  return (await sql`
    select c.id, 'credential' as kind, c.title, r.name as room_name, c.deleted_at,
           null::int as credential_count
      from credentials c join rooms r on r.id = c.room_id
     where c.deleted_at is not null
    union all
    select r.id, 'room' as kind, r.name as title, null as room_name, r.deleted_at,
           (select count(*) from credentials c2 where c2.room_id = r.id)::int as credential_count
      from rooms r where r.deleted_at is not null
    union all
    select cl.id, 'cliente' as kind, cl.nome as title, null as room_name, cl.deleted_at,
           null::int as credential_count
      from clientes cl where cl.deleted_at is not null
    union all
    select f.id, 'fornecedor' as kind, f.nome as title, null as room_name, f.deleted_at,
           null::int as credential_count
      from fornecedores f where f.deleted_at is not null
     order by deleted_at desc`) as TrashItem[];
}

/** Restaurar uma credencial cuja sala ainda está na lixeira devolveria um item que
 *  não aparece em nenhuma listagem (a sala apagada corta o acesso a tudo dentro
 *  dela). `restoreItem` recusa esse caso em vez de restaurar silenciosamente. */
export class RoomTrashedError extends Error {
  constructor() {
    super('A sala desta senha ainda está na lixeira. Restaure a sala antes de restaurar a senha.');
  }
}

export async function restoreItem(
  kind: 'credential' | 'room' | 'cliente' | 'fornecedor', id: string,
): Promise<void> {
  assertUuid(id);
  if (kind === 'credential') {
    const rows = (await sql`
      select r.deleted_at as room_deleted_at
        from credentials c join rooms r on r.id = c.room_id
       where c.id = ${id}`) as { room_deleted_at: string | null }[];
    if (!rows[0]) throw new NotFoundError('Senha não encontrada');
    if (rows[0].room_deleted_at) throw new RoomTrashedError();
    await sql`update credentials set deleted_at = null where id = ${id}`;
  } else if (kind === 'room') {
    await sql`update rooms set deleted_at = null where id = ${id}`;
  } else if (kind === 'cliente') {
    await sql`update clientes set deleted_at = null where id = ${id}`;
  } else {
    await sql`update fornecedores set deleted_at = null where id = ${id}`;
  }
}

export async function purgeItem(
  kind: 'credential' | 'room' | 'cliente' | 'fornecedor', id: string,
): Promise<void> {
  assertUuid(id);
  if (kind === 'credential') {
    await sql`delete from credentials where id = ${id} and deleted_at is not null`;
  } else if (kind === 'room') {
    // A sala só pode ser expurgada se já estiver na lixeira; a subconsulta reaplica
    // essa mesma guarda ao delete de credenciais, para uma sala ativa jamais perder
    // credenciais aqui (Server Action é endpoint HTTP, invocável com qualquer id).
    // As duas instruções rodam numa única transação não-interativa do driver.
    await sql.transaction([
      sql`delete from credentials
           where room_id = (select id from rooms where id = ${id} and deleted_at is not null)`,
      sql`delete from rooms where id = ${id} and deleted_at is not null`,
    ]);
  } else if (kind === 'cliente') {
    await sql`delete from clientes where id = ${id} and deleted_at is not null`;
  } else {
    await sql`delete from fornecedores where id = ${id} and deleted_at is not null`;
  }
}
```

- [ ] **Step 4: Estender `lib/db/audit.ts`**

Trocar:

```ts
  entityType?: 'credential' | 'room' | 'user';
```

por:

```ts
  entityType?: 'credential' | 'room' | 'user' | 'cliente' | 'fornecedor';
```

- [ ] **Step 5: Estender os componentes e a tela de lixeira**

Em `components/RestoreButton.tsx`, trocar a assinatura da prop `kind`:

```ts
export function RestoreButton({
  kind, id,
}: { kind: 'credential' | 'room' | 'cliente' | 'fornecedor'; id: string }) {
```

Em `components/PurgeButton.tsx`, mesma troca no tipo de `kind`:

```ts
export function PurgeButton({
  kind, id, title, credentialCount,
}: {
  kind: 'credential' | 'room' | 'cliente' | 'fornecedor';
  id: string;
  title: string;
  credentialCount: number | null;
}) {
```

Em `app/(app)/admin/lixeira/actions.ts`, trocar a assinatura de `restaurar` e `expurgar`:

```ts
export async function restaurar(
  kind: 'credential' | 'room' | 'cliente' | 'fornecedor', id: string,
): Promise<RestoreResult> {
```

```ts
export async function expurgar(
  kind: 'credential' | 'room' | 'cliente' | 'fornecedor', id: string,
): Promise<ExpurgarResult> {
```

Em `app/(app)/admin/lixeira/page.tsx`, trocar a linha do `badge`:

```tsx
                <span className="badge">{item.kind === 'room' ? 'sala' : 'senha'}</span>
```

por:

```tsx
                <span className="badge">
                  {{ room: 'sala', credential: 'senha', cliente: 'cliente', fornecedor: 'fornecedor' }[item.kind]}
                </span>
```

- [ ] **Step 6: Rodar e confirmar que passa**

```bash
npx tsc --noEmit
npx vitest run tests/integracao.test.ts
```

Esperado: `tsc` sem saída; todos os testes de integração passando, incluindo o novo.

- [ ] **Step 7: Conferir tudo e commitar**

```bash
npm test
```

Esperado: **125 testes** (124 + 1).

```bash
git add lib/db/queries.ts lib/db/audit.ts components/RestoreButton.tsx components/PurgeButton.tsx app/\(app\)/admin/lixeira/actions.ts app/\(app\)/admin/lixeira/page.tsx tests/integracao.test.ts
git commit -m "Estende lixeira e auditoria para clientes e fornecedores"
```

---

## Task 6: Componente genérico `TerceiroClient`

**Files:**
- Create: `components/TerceiroClient.tsx`
- Test: `tests/TerceiroClient.test.tsx`

**Interfaces:**
- Consumes: `mascararTelefone`, `soDigitos` de `lib/documentos.ts`; `formatarDataHora` de `lib/formato.ts`; tipo `Terceiro` de `lib/types.ts`.
- Produces: `TerceiroClient` (componente) e `type TerceiroState = { error?: string; ok?: string }`, ambos exportados de `components/TerceiroClient.tsx`. Recebe as três server actions (`criar`, `salvar`, `apagar`) como props — cada rota (`/cadastros/clientes`, `/cadastros/fornecedores`) passa as suas (task 7 e 8).

- [ ] **Step 1: Escrever os testes que falham**

Criar `tests/TerceiroClient.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { TerceiroClient } from '@/components/TerceiroClient';
import type { Terceiro } from '@/lib/types';

const item: Terceiro = {
  id: '11111111-1111-1111-1111-111111111111',
  nome: 'ACME Ltda', contato_responsavel: 'Fulano', email: 'contato@acme.com',
  telefone: '11987654321', cidade: 'São Paulo', uf: 'SP', created_at: '2026-08-08T10:00:00Z',
};

const criar = vi.fn();
const salvar = vi.fn();
const apagar = vi.fn();

afterEach(() => cleanup());

describe('TerceiroClient', () => {
  it('tipo cliente mostra os rótulos de cliente', () => {
    render(
      <TerceiroClient tipo="cliente" itens={[item]} criar={criar} salvar={salvar} apagar={apagar} />,
    );
    expect(screen.getByText('Clientes')).toBeInTheDocument();
    expect(screen.getByText('Novo cliente')).toBeInTheDocument();
  });

  it('tipo fornecedor mostra os rótulos de fornecedor', () => {
    render(
      <TerceiroClient tipo="fornecedor" itens={[item]} criar={criar} salvar={salvar} apagar={apagar} />,
    );
    expect(screen.getByText('Fornecedores')).toBeInTheDocument();
    expect(screen.getByText('Novo fornecedor')).toBeInTheDocument();
  });

  it('clicar na linha abre o modal com os dados preenchidos', () => {
    render(
      <TerceiroClient tipo="cliente" itens={[item]} criar={criar} salvar={salvar} apagar={apagar} />,
    );
    fireEvent.click(screen.getByText('ACME Ltda'));
    expect(screen.getByDisplayValue('ACME Ltda')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Fulano')).toBeInTheDocument();
  });

  it('sem itens mostra mensagem vazia com o tipo certo', () => {
    render(
      <TerceiroClient tipo="fornecedor" itens={[]} criar={criar} salvar={salvar} apagar={apagar} />,
    );
    expect(screen.getByText('Nenhum fornecedor cadastrado.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx vitest run tests/TerceiroClient.test.tsx
```

Esperado: FAIL — `Cannot find module '@/components/TerceiroClient'`.

- [ ] **Step 3: Implementar**

Criar `components/TerceiroClient.tsx`:

```tsx
'use client';

import { useActionState, useEffect, useState } from 'react';
import { mascararTelefone, soDigitos } from '@/lib/documentos';
import { formatarDataHora } from '@/lib/formato';
import type { Terceiro } from '@/lib/types';

export type TerceiroState = { error?: string; ok?: string };

const ROTULOS = {
  cliente: { titulo: 'Clientes', novo: 'Novo cliente', vazio: 'Nenhum cliente cadastrado.', confirmarApagar: 'Apagar este cliente?' },
  fornecedor: { titulo: 'Fornecedores', novo: 'Novo fornecedor', vazio: 'Nenhum fornecedor cadastrado.', confirmarApagar: 'Apagar este fornecedor?' },
} as const;

const inicial: TerceiroState = {};

type Acao = (prev: TerceiroState, fd: FormData) => Promise<TerceiroState>;

export function TerceiroClient({
  tipo, itens, criar, salvar, apagar,
}: {
  tipo: 'cliente' | 'fornecedor';
  itens: Terceiro[];
  criar: Acao;
  salvar: Acao;
  apagar: (id: string) => Promise<{ error?: string }>;
}) {
  const rotulos = ROTULOS[tipo];
  const [aberto, setAberto] = useState<Terceiro | null>(null);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{rotulos.titulo}</h1>
      <FormularioNovo rotulos={rotulos} criar={criar} />

      <table className="w-full text-sm">
        <thead>
          <tr style={{ color: 'var(--text-dim)' }}>
            <th className="text-left p-2">Nome</th>
            <th className="text-left p-2">Contato responsável</th>
            <th className="text-left p-2">E-mail</th>
            <th className="text-left p-2">Telefone</th>
            <th className="text-left p-2">Cidade/UF</th>
            <th className="text-left p-2">Criado em</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((t) => (
            <tr key={t.id} className="cursor-pointer" onClick={() => setAberto(t)}>
              <td className="p-2">{t.nome}</td>
              <td className="p-2">{t.contato_responsavel ?? '—'}</td>
              <td className="p-2">{t.email ?? '—'}</td>
              <td className="p-2">{t.telefone ? mascararTelefone(t.telefone) : '—'}</td>
              <td className="p-2">{[t.cidade, t.uf].filter(Boolean).join('/') || '—'}</td>
              <td className="p-2">{formatarDataHora(t.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {itens.length === 0 && (
        <p className="text-sm" style={{ color: 'var(--text-dim)' }}>{rotulos.vazio}</p>
      )}

      {aberto && (
        <ModalEdicao
          key={aberto.id} item={aberto} rotulos={rotulos} salvar={salvar} apagar={apagar}
          onFechar={() => setAberto(null)}
        />
      )}
    </div>
  );
}

function CamposComuns({
  item, telefoneDigitos, onTelefone,
}: {
  item?: Terceiro;
  telefoneDigitos: string;
  onTelefone: (digitos: string) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="block space-y-1">
        <span className="text-sm">Nome completo</span>
        <input name="nome" className="input" defaultValue={item?.nome ?? ''} required />
      </label>
      <label className="block space-y-1">
        <span className="text-sm">Contato responsável</span>
        <input name="contatoResponsavel" className="input" defaultValue={item?.contato_responsavel ?? ''} />
      </label>
      <label className="block space-y-1">
        <span className="text-sm">E-mail</span>
        <input name="email" type="email" className="input" defaultValue={item?.email ?? ''} />
      </label>
      <label className="block space-y-1">
        <span className="text-sm">Telefone</span>
        <input name="telefone" className="input" inputMode="numeric" maxLength={15}
               value={mascararTelefone(telefoneDigitos)}
               onChange={(e) => onTelefone(soDigitos(e.target.value))} />
      </label>
      <label className="block space-y-1">
        <span className="text-sm">Cidade</span>
        <input name="cidade" className="input" defaultValue={item?.cidade ?? ''} />
      </label>
      <label className="block space-y-1">
        <span className="text-sm">Estado (UF)</span>
        <input name="uf" className="input" maxLength={2} defaultValue={item?.uf ?? ''}
               style={{ textTransform: 'uppercase' }} />
      </label>
    </div>
  );
}

function FormularioNovo({
  rotulos, criar,
}: {
  rotulos: typeof ROTULOS['cliente'];
  criar: Acao;
}) {
  const [state, action, pending] = useActionState(criar, inicial);
  const [telefoneDigitos, setTelefoneDigitos] = useState('');

  return (
    <details className="glass p-5">
      <summary className="cursor-pointer font-semibold">{rotulos.novo}</summary>
      <form action={action} className="space-y-4 mt-4">
        <CamposComuns telefoneDigitos={telefoneDigitos} onTelefone={setTelefoneDigitos} />
        {state.error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{state.error}</p>}
        {state.ok && <p className="text-sm" style={{ color: 'var(--ok)' }}>{state.ok}</p>}
        <button className="btn btn-primary" disabled={pending}>Cadastrar</button>
      </form>
    </details>
  );
}

function ModalEdicao({
  item, rotulos, salvar, apagar, onFechar,
}: {
  item: Terceiro;
  rotulos: typeof ROTULOS['cliente'];
  salvar: Acao;
  apagar: (id: string) => Promise<{ error?: string }>;
  onFechar: () => void;
}) {
  const [state, action, pending] = useActionState(salvar, inicial);
  const [telefoneDigitos, setTelefoneDigitos] = useState(item.telefone ?? '');
  const [erroApagar, setErroApagar] = useState<string | null>(null);

  // Salvou com sucesso: fecha o modal sozinho, mesmo padrão do modal de usuário.
  useEffect(() => {
    if (state.ok) onFechar();
  }, [state.ok, onFechar]);

  async function apagarClique() {
    if (!confirm(rotulos.confirmarApagar)) return;
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
      <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
        Cadastrado em {formatarDataHora(item.created_at)}
      </p>

      <form action={action} className="space-y-4">
        <input type="hidden" name="id" value={item.id} />
        <CamposComuns item={item} telefoneDigitos={telefoneDigitos} onTelefone={setTelefoneDigitos} />
        {state.error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{state.error}</p>}
        <button className="btn btn-primary" disabled={pending}>Salvar</button>
      </form>

      <button type="button" className="btn btn-danger" onClick={() => void apagarClique()}>Apagar</button>
      {erroApagar && <p className="text-sm" style={{ color: 'var(--danger)' }}>{erroApagar}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
npx vitest run tests/TerceiroClient.test.tsx
```

Esperado: PASS, 4 testes.

- [ ] **Step 5: Conferir tudo e commitar**

```bash
npx tsc --noEmit
npm test
```

Esperado: `tsc` sem saída; **129 testes** (125 + 4).

```bash
git add components/TerceiroClient.tsx tests/TerceiroClient.test.tsx
git commit -m "Adiciona componente generico TerceiroClient"
```

---

## Task 7: Rota `/cadastros/clientes`

**Files:**
- Create: `app/(app)/cadastros/clientes/actions.ts`
- Create: `app/(app)/cadastros/clientes/page.tsx`

**Interfaces:**
- Consumes: `requireMaster` de `lib/auth/guards.ts`; `createTerceiro`, `listTerceiros`, `softDeleteTerceiro`, `updateTerceiro` de `lib/db/terceiros.ts`; `lerDadosTerceiro` de `lib/terceiros-form.ts`; `audit` de `lib/db/audit.ts`; `isUuid` de `lib/validation.ts`; `TerceiroClient`, `TerceiroState` de `components/TerceiroClient.tsx`.
- Produces: rota `/cadastros/clientes`, funções `criarCliente`, `salvarCliente`, `apagarCliente`.

- [ ] **Step 1: Criar as actions**

Criar `app/(app)/cadastros/clientes/actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { requireMaster } from '@/lib/auth/guards';
import { audit } from '@/lib/db/audit';
import { createTerceiro, softDeleteTerceiro, updateTerceiro } from '@/lib/db/terceiros';
import { lerDadosTerceiro } from '@/lib/terceiros-form';
import { isUuid } from '@/lib/validation';
import type { TerceiroState } from '@/components/TerceiroClient';

const TABELA = 'clientes' as const;
const ROTA = '/cadastros/clientes';

export async function criarCliente(
  _prev: TerceiroState, formData: FormData,
): Promise<TerceiroState> {
  const actor = await requireMaster();
  const dados = lerDadosTerceiro(formData);
  if ('error' in dados) return dados;

  const id = await createTerceiro(TABELA, dados);
  await audit({ actorId: actor.id, action: 'create', entityType: 'cliente', entityId: id });
  revalidatePath(ROTA);
  return { ok: 'Cliente cadastrado.' };
}

export async function salvarCliente(
  _prev: TerceiroState, formData: FormData,
): Promise<TerceiroState> {
  const actor = await requireMaster();
  const id = String(formData.get('id') ?? '');
  if (!isUuid(id)) return { error: 'Cliente não encontrado.' };

  const dados = lerDadosTerceiro(formData);
  if ('error' in dados) return dados;

  await updateTerceiro(TABELA, id, dados);
  await audit({ actorId: actor.id, action: 'update', entityType: 'cliente', entityId: id });
  revalidatePath(ROTA);
  return { ok: 'Cliente atualizado.' };
}

export async function apagarCliente(id: string): Promise<{ error?: string }> {
  const actor = await requireMaster();
  if (!isUuid(id)) return { error: 'Cliente não encontrado.' };

  await softDeleteTerceiro(TABELA, id);
  await audit({ actorId: actor.id, action: 'delete', entityType: 'cliente', entityId: id });
  revalidatePath(ROTA);
  return {};
}
```

- [ ] **Step 2: Criar a página**

Criar `app/(app)/cadastros/clientes/page.tsx`:

```tsx
import { TerceiroClient } from '@/components/TerceiroClient';
import { requireMaster } from '@/lib/auth/guards';
import { listTerceiros } from '@/lib/db/terceiros';
import { apagarCliente, criarCliente, salvarCliente } from './actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function ClientesPage() {
  await requireMaster();
  const itens = await listTerceiros('clientes');

  return (
    <main className="p-4 md:p-6 max-w-5xl mx-auto">
      <TerceiroClient
        tipo="cliente" itens={itens}
        criar={criarCliente} salvar={salvarCliente} apagar={apagarCliente}
      />
    </main>
  );
}
```

- [ ] **Step 3: Conferir e commitar**

```bash
npx tsc --noEmit
npm test
```

Esperado: `tsc` sem saída; **129 testes** (sem teste novo — rota fina, coberta pelo que `TerceiroClient` e `terceiros.ts` já testam).

```bash
npm run dev
```

Acessar `http://localhost:3000/cadastros/clientes` logado como master: cadastrar um cliente, editar, apagar (some da lista, aparece em `/admin/lixeira` como "cliente"). Encerrar o servidor (Ctrl+C) depois de conferir.

```bash
git add "app/(app)/cadastros/clientes"
git commit -m "Adiciona rota de cadastro de clientes"
```

---

## Task 8: Rota `/cadastros/fornecedores`

**Files:**
- Create: `app/(app)/cadastros/fornecedores/actions.ts`
- Create: `app/(app)/cadastros/fornecedores/page.tsx`

**Interfaces:**
- Consumes: os mesmos da Task 7, trocando a tabela.
- Produces: rota `/cadastros/fornecedores`, funções `criarFornecedor`, `salvarFornecedor`, `apagarFornecedor`.

- [ ] **Step 1: Criar as actions**

Criar `app/(app)/cadastros/fornecedores/actions.ts` — igual à Task 7, trocando `TABELA`, `ROTA`, `entityType` e nomes das funções:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { requireMaster } from '@/lib/auth/guards';
import { audit } from '@/lib/db/audit';
import { createTerceiro, softDeleteTerceiro, updateTerceiro } from '@/lib/db/terceiros';
import { lerDadosTerceiro } from '@/lib/terceiros-form';
import { isUuid } from '@/lib/validation';
import type { TerceiroState } from '@/components/TerceiroClient';

const TABELA = 'fornecedores' as const;
const ROTA = '/cadastros/fornecedores';

export async function criarFornecedor(
  _prev: TerceiroState, formData: FormData,
): Promise<TerceiroState> {
  const actor = await requireMaster();
  const dados = lerDadosTerceiro(formData);
  if ('error' in dados) return dados;

  const id = await createTerceiro(TABELA, dados);
  await audit({ actorId: actor.id, action: 'create', entityType: 'fornecedor', entityId: id });
  revalidatePath(ROTA);
  return { ok: 'Fornecedor cadastrado.' };
}

export async function salvarFornecedor(
  _prev: TerceiroState, formData: FormData,
): Promise<TerceiroState> {
  const actor = await requireMaster();
  const id = String(formData.get('id') ?? '');
  if (!isUuid(id)) return { error: 'Fornecedor não encontrado.' };

  const dados = lerDadosTerceiro(formData);
  if ('error' in dados) return dados;

  await updateTerceiro(TABELA, id, dados);
  await audit({ actorId: actor.id, action: 'update', entityType: 'fornecedor', entityId: id });
  revalidatePath(ROTA);
  return { ok: 'Fornecedor atualizado.' };
}

export async function apagarFornecedor(id: string): Promise<{ error?: string }> {
  const actor = await requireMaster();
  if (!isUuid(id)) return { error: 'Fornecedor não encontrado.' };

  await softDeleteTerceiro(TABELA, id);
  await audit({ actorId: actor.id, action: 'delete', entityType: 'fornecedor', entityId: id });
  revalidatePath(ROTA);
  return {};
}
```

- [ ] **Step 2: Criar a página**

Criar `app/(app)/cadastros/fornecedores/page.tsx`:

```tsx
import { TerceiroClient } from '@/components/TerceiroClient';
import { requireMaster } from '@/lib/auth/guards';
import { listTerceiros } from '@/lib/db/terceiros';
import { apagarFornecedor, criarFornecedor, salvarFornecedor } from './actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function FornecedoresPage() {
  await requireMaster();
  const itens = await listTerceiros('fornecedores');

  return (
    <main className="p-4 md:p-6 max-w-5xl mx-auto">
      <TerceiroClient
        tipo="fornecedor" itens={itens}
        criar={criarFornecedor} salvar={salvarFornecedor} apagar={apagarFornecedor}
      />
    </main>
  );
}
```

- [ ] **Step 3: Conferir e commitar**

```bash
npx tsc --noEmit
npm test
```

Esperado: `tsc` sem saída; **129 testes**.

```bash
npm run dev
```

Acessar `http://localhost:3000/cadastros/fornecedores` logado como master e repetir a checagem manual da Task 7. Encerrar o servidor depois.

```bash
git add "app/(app)/cadastros/fornecedores"
git commit -m "Adiciona rota de cadastro de fornecedores"
```

---

## Task 9: Menu

**Files:**
- Modify: `components/Sidebar.tsx`

**Interfaces:**
- Consumes: `canManageTerceiros` de `lib/authz.ts` (task 4).
- Produces: itens "Clientes" e "Fornecedores" no grupo "Cadastros" do menu.

- [ ] **Step 1: Editar `components/Sidebar.tsx`**

Trocar a linha do import de ícones:

```ts
import { FolderKanban, Home, ScrollText, Trash2, UserSquare2, Users, Vault } from 'lucide-react';
```

por:

```ts
import { Building2, FolderKanban, Home, ScrollText, Trash2, Truck, UserSquare2, Users, Vault } from 'lucide-react';
```

Acrescentar o import de `canManageTerceiros` junto aos demais imports:

```ts
import { canManageTerceiros } from '@/lib/authz';
```

Trocar o grupo "Cadastros":

```tsx
    {
      label: 'Cadastros',
      icon: <UserSquare2 size={18} className={iconClass} />,
      items: [
        { href: '/usuarios', label: 'Usuários', icon: <Users size={18} className={iconClass} /> },
      ],
    },
```

por:

```tsx
    {
      label: 'Cadastros',
      icon: <UserSquare2 size={18} className={iconClass} />,
      items: [
        { href: '/usuarios', label: 'Usuários', icon: <Users size={18} className={iconClass} /> },
        ...(canManageTerceiros(actor)
          ? [
              {
                href: '/cadastros/clientes', label: 'Clientes',
                icon: <Building2 size={18} className={iconClass} />,
              },
              {
                href: '/cadastros/fornecedores', label: 'Fornecedores',
                icon: <Truck size={18} className={iconClass} />,
              },
            ]
          : []),
      ],
    },
```

- [ ] **Step 2: Conferir e commitar**

```bash
npx tsc --noEmit
npm test
```

Esperado: `tsc` sem saída; **129 testes** (sem teste novo — `Sidebar.tsx` não tem suíte própria hoje, mesmo padrão dos itens de `/admin/*` já existentes nele).

```bash
npm run dev
```

Logado como master: menu mostra "Clientes" e "Fornecedores" dentro de "Cadastros". Logado como usuário comum: os dois itens não aparecem. Encerrar o servidor depois.

```bash
git add components/Sidebar.tsx
git commit -m "Adiciona Clientes e Fornecedores ao menu Cadastros"
```
