# Cadastro de Local de Gravação — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cadastro novo, dentro do grupo de menu "Cadastros": Local de Gravação (nome, endereço, responsável), cada um com uma lista de Estúdios (nome) aninhada. CRUD completo, lixeira, auditoria, master-only.

**Architecture:** Duas tabelas em relação 1-N (`locais_gravacao`, `estudios`). Diferente do CRUD genérico de terceiros (duas tabelas irmãs sem relação), aqui o formulário edita o local e a lista de estúdios dele numa única submissão — o update faz **diff** contra o banco (renomeia quem tem `id`, insere quem não tem, soft-deleta quem sumiu da lista) em vez de apagar-e-reinserir tudo, porque a próxima feature (Agenda) vai referenciar `estudio_id` e precisa que esse id sobreviva a uma edição do local.

**Tech Stack:** Next.js 15 (App Router), TypeScript strict, Neon Postgres sem ORM (`@neondatabase/serverless`), vitest (projetos `node` e `jsdom`).

**Spec:** [docs/superpowers/specs/2026-08-10-local-gravacao-design.md](../specs/2026-08-10-local-gravacao-design.md)

## Global Constraints

- TypeScript strict. `npx tsc --noEmit` precisa sair limpo ao fim de toda task.
- `npm test` precisa passar inteiro ao fim de toda task. Base atual: **168 testes**.
- Nenhuma dependência de runtime nova. Nenhuma variável de ambiente nova.
- Identificadores em português, como no resto do projeto.
- Autorização é reaplicada no servidor (`requireMaster()` em toda rota/action de
  `/cadastros/locais-gravacao`). Esconder item no menu é cosmético.
- Sem `on delete cascade` de `estudios.local_id` pra `locais_gravacao.id`: apagar um local não
  apaga estúdio nenhum por baixo dos panos (mesma filosofia de `combo_itens`/`plano_itens` no
  módulo Produtos).
- Update do local faz **diff** nos estúdios (update por id / insert sem id / soft-delete do que
  sumiu), nunca apaga-e-reinsere tudo — é isso que mantém o `id` do estúdio estável entre edições.
- Sem checagem de "estúdio em uso" no expurgo nesta rodada — a Agenda (spec futura) ainda não
  referencia `estudio_id`, não há o que checar.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `db/migrations/007_locais_gravacao.sql` (novo) | Tabelas `locais_gravacao` e `estudios`. |
| `lib/types.ts` (modificar) | Tipos `Estudio`, `LocalGravacao`, `DadosLocal`. |
| `lib/locais-gravacao-form.ts` (novo) | Ler e validar o `FormData` (nome/endereço/responsável + lista de estúdios em JSON). Puro, sem I/O. |
| `lib/db/locais-gravacao.ts` (novo) | CRUD, com diff de estúdios no update. |
| `lib/authz.ts` (modificar) | Ganha `canManageLocaisGravacao()`. |
| `lib/db/queries.ts` (modificar) | `TrashItem.kind`, `listTrash`, `restoreItem`, `purgeItem` ganham `'local_gravacao' | 'estudio'`. |
| `lib/db/audit.ts` (modificar) | `entityType` ganha `'local_gravacao' | 'estudio'`. |
| `components/RestoreButton.tsx` (modificar) | `kind` amplia a união. |
| `components/PurgeButton.tsx` (modificar) | `kind` amplia a união. |
| `app/(app)/admin/lixeira/actions.ts` (modificar) | `kind` amplia a união em `restaurar`/`expurgar`. |
| `app/(app)/admin/lixeira/page.tsx` (modificar) | Rótulo (`badge`) pros dois `kind` novos. |
| `components/EstudiosRepetidor.tsx` (novo) | Lista editável de estúdios (nome livre, sem quantidade) — controlado, estado no pai. |
| `components/LocalGravacaoClient.tsx` (novo) | Grid + formulário de novo + modal de edição. |
| `app/(app)/cadastros/locais-gravacao/actions.ts` (novo) | `criarLocal`, `salvarLocal`, `apagarLocal`. |
| `app/(app)/cadastros/locais-gravacao/page.tsx` (novo) | Server component, `requireMaster()` + `listLocais()`. |
| `components/Sidebar.tsx` (modificar) | Grupo "Cadastros" ganha "Locais de Gravação". |

---

## Task 1: Migration e tipos

**Files:**
- Create: `db/migrations/007_locais_gravacao.sql`
- Modify: `lib/types.ts`

**Interfaces:**
- Consumes: nada.
- Produces: schema com as tabelas `locais_gravacao` e `estudios`; tipos `Estudio`, `LocalGravacao`, `DadosLocal`.

- [ ] **Step 1: Escrever a migration**

Criar `db/migrations/007_locais_gravacao.sql`:

```sql
-- Local físico onde gravações acontecem (ex.: "P7 Belo Horizonte"), com uma lista de
-- estúdios (salas) dentro. Sem `on delete cascade` em estudios.local_id: apagar um
-- local não apaga estúdio nenhum por baixo dos panos (mesma filosofia de
-- combo_itens/plano_itens no módulo Produtos — destrutivo demais pra ser implícito).
create table locais_gravacao (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  endereco    text,
  responsavel text,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table estudios (
  id          uuid primary key default gen_random_uuid(),
  local_id    uuid not null references locais_gravacao(id),
  nome        text not null,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index estudios_local_id_idx on estudios(local_id);
```

- [ ] **Step 2: Aplicar e conferir**

```bash
npm run migrate
```

Esperado: `+ aplicando 007_locais_gravacao.sql...` seguido de sucesso, sem erro.

```bash
node -e "const{config}=require('dotenv');config({path:'.env.local'});config();const pg=require('pg');(async()=>{const c=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:true}});await c.connect();console.log((await c.query(\"select table_name from information_schema.tables where table_name in ('locais_gravacao','estudios')\")).rows);await c.end();})()"
```

Esperado: duas linhas, `locais_gravacao` e `estudios`.

- [ ] **Step 3: Acrescentar os tipos**

Em `lib/types.ts`, acrescentar ao final do arquivo:

```ts
export type Estudio = { id: string; local_id: string; nome: string; created_at: string };

export type LocalGravacao = {
  id: string;
  nome: string;
  endereco: string | null;
  responsavel: string | null;
  created_at: string;
  estudios: Estudio[];
};

export type DadosLocal = {
  nome: string;
  endereco: string | null;
  responsavel: string | null;
  /** Com `id` presente: renomeia o estúdio existente. Sem `id`: cria um novo. Um
   *  estúdio existente que não aparece nesta lista é soft-deleted (ver
   *  `lib/db/locais-gravacao.ts`, `updateLocal`). */
  estudios: { id?: string; nome: string }[];
};
```

- [ ] **Step 4: Conferir e commitar**

```bash
npx tsc --noEmit
npm test
```

Esperado: `tsc` sem saída; **168 testes** passando (nenhum teste novo nesta task).

```bash
git add db/migrations/007_locais_gravacao.sql lib/types.ts
git commit -m "Cria tabelas locais_gravacao e estudios"
```

---

## Task 2: Leitura e validação do formulário (`lib/locais-gravacao-form.ts`)

**Files:**
- Create: `lib/locais-gravacao-form.ts`
- Test: `tests/locais-gravacao-form.test.ts`

**Interfaces:**
- Consumes: tipo `DadosLocal` de `lib/types.ts`.
- Produces:
  - `lerEstudios(json: string): DadosLocal['estudios'] | { error: string }`
  - `lerDadosLocal(fd: FormData): DadosLocal | { error: string }`

- [ ] **Step 1: Escrever os testes que falham**

Criar `tests/locais-gravacao-form.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { lerDadosLocal, lerEstudios } from '@/lib/locais-gravacao-form';

function formData(campos: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
}

describe('lerEstudios', () => {
  it('JSON inválido retorna erro', () => {
    expect(lerEstudios('não é json')).toEqual({ error: 'Lista de estúdios inválida.' });
  });

  it('não-array retorna erro', () => {
    expect(lerEstudios('{}')).toEqual({ error: 'Lista de estúdios inválida.' });
  });

  it('lista vazia é aceita', () => {
    expect(lerEstudios('[]')).toEqual([]);
  });

  it('item sem nome retorna erro', () => {
    expect(lerEstudios('[{"id":"x"}]')).toEqual({ error: 'Lista de estúdios inválida.' });
  });

  it('nome em branco retorna erro', () => {
    expect(lerEstudios('[{"nome":"   "}]')).toEqual({ error: 'Todo estúdio precisa de um nome.' });
  });

  it('item com id preserva o id; item sem id não ganha um', () => {
    const r = lerEstudios('[{"id":"e1","nome":"Estúdio A"},{"nome":"Estúdio B"}]');
    expect(r).toEqual([{ id: 'e1', nome: 'Estúdio A' }, { nome: 'Estúdio B' }]);
  });
});

describe('lerDadosLocal', () => {
  it('nome vazio retorna erro', () => {
    const r = lerDadosLocal(formData({ nome: '  ', estudios: '[]' }));
    expect(r).toEqual({ error: 'Informe o nome.' });
  });

  it('estúdio inválido propaga o erro', () => {
    const r = lerDadosLocal(formData({ nome: 'P7 BH', estudios: 'x' }));
    expect(r).toEqual({ error: 'Lista de estúdios inválida.' });
  });

  it('campos opcionais em branco viram null; estúdios sem "estudios" no form viram []', () => {
    const r = lerDadosLocal(formData({ nome: 'P7 BH' }));
    expect('error' in r).toBe(false);
    if (!('error' in r)) {
      expect(r.endereco).toBeNull();
      expect(r.responsavel).toBeNull();
      expect(r.estudios).toEqual([]);
    }
  });

  it('lê nome, endereço, responsável e estúdios completos', () => {
    const r = lerDadosLocal(formData({
      nome: 'P7 BH', endereco: 'Rua X, 100', responsavel: 'Fulano',
      estudios: '[{"nome":"Estúdio A"}]',
    }));
    expect('error' in r).toBe(false);
    if (!('error' in r)) {
      expect(r.endereco).toBe('Rua X, 100');
      expect(r.responsavel).toBe('Fulano');
      expect(r.estudios).toEqual([{ nome: 'Estúdio A' }]);
    }
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx vitest run tests/locais-gravacao-form.test.ts
```

Esperado: FAIL — `Cannot find module '@/lib/locais-gravacao-form'`.

- [ ] **Step 3: Implementar**

Criar `lib/locais-gravacao-form.ts`:

```ts
import type { DadosLocal } from '@/lib/types';

export function lerEstudios(json: string): DadosLocal['estudios'] | { error: string } {
  let bruto: unknown;
  try {
    bruto = JSON.parse(json);
  } catch {
    return { error: 'Lista de estúdios inválida.' };
  }
  if (!Array.isArray(bruto)) return { error: 'Lista de estúdios inválida.' };

  const estudios: DadosLocal['estudios'] = [];
  for (const item of bruto) {
    if (
      typeof item !== 'object' || item === null ||
      typeof (item as Record<string, unknown>).nome !== 'string'
    ) {
      return { error: 'Lista de estúdios inválida.' };
    }
    const { id, nome } = item as { id?: unknown; nome: string };
    if (id !== undefined && typeof id !== 'string') return { error: 'Lista de estúdios inválida.' };

    const nomeNormalizado = nome.trim();
    if (!nomeNormalizado) return { error: 'Todo estúdio precisa de um nome.' };

    estudios.push(id ? { id, nome: nomeNormalizado } : { nome: nomeNormalizado });
  }
  return estudios;
}

/** `''` vira `null`: campo em branco é ausência de dado, não string vazia no banco. */
function ouNulo(fd: FormData, campo: string): string | null {
  const v = String(fd.get(campo) ?? '').trim();
  return v === '' ? null : v;
}

export function lerDadosLocal(fd: FormData): DadosLocal | { error: string } {
  const nome = String(fd.get('nome') ?? '').trim();
  if (!nome) return { error: 'Informe o nome.' };

  const estudios = lerEstudios(String(fd.get('estudios') ?? '[]'));
  if ('error' in estudios) return estudios;

  return {
    nome, endereco: ouNulo(fd, 'endereco'), responsavel: ouNulo(fd, 'responsavel'), estudios,
  };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
npx vitest run tests/locais-gravacao-form.test.ts
```

Esperado: PASS, 10 testes.

- [ ] **Step 5: Conferir tudo e commitar**

```bash
npx tsc --noEmit
npm test
```

Esperado: `tsc` sem saída; **178 testes** (168 + 10).

```bash
git add lib/locais-gravacao-form.ts tests/locais-gravacao-form.test.ts
git commit -m "Adiciona leitura e validacao do formulario de local de gravacao"
```

---

## Task 3: Camada de dados (`lib/db/locais-gravacao.ts`)

**Files:**
- Create: `lib/db/locais-gravacao.ts`
- Modify (append): `tests/integracao.test.ts`

**Interfaces:**
- Consumes: `sql` de `lib/db/client.ts`; `NotFoundError` de `lib/authz.ts`; `assertUuid` de `lib/validation.ts`; tipos `DadosLocal`, `LocalGravacao` de `lib/types.ts`.
- Produces:
  - `listLocais(): Promise<LocalGravacao[]>`
  - `getLocal(id: string): Promise<LocalGravacao | null>`
  - `createLocal(dados: DadosLocal): Promise<string>`
  - `updateLocal(id: string, dados: DadosLocal): Promise<void>` (lança `NotFoundError` se `id` não existe ou já está apagado)
  - `softDeleteLocal(id: string): Promise<void>` (lança `NotFoundError` nas mesmas condições)

- [ ] **Step 1: Escrever o teste que falha**

Abrir `tests/integracao.test.ts`. Acrescentar os `it`s abaixo dentro do describe principal
(`descreve('integração com o banco real', ...)`), depois do último `it` existente e antes do `});`
final que fecha esse describe:

```ts
  it('cria local com estudios, edita renomeando um e adicionando outro sem perder o id do renomeado', async () => {
    const lg = await import('@/lib/db/locais-gravacao');

    const id = await lg.createLocal({
      nome: `${marca}-local`, endereco: 'Rua X, 100', responsavel: 'Fulano',
      estudios: [{ nome: 'Estúdio A' }, { nome: 'Estúdio B' }],
    });

    const criado = await lg.getLocal(id);
    expect(criado?.estudios).toHaveLength(2);
    const estudioA = criado!.estudios.find((e) => e.nome === 'Estúdio A')!;

    await lg.updateLocal(id, {
      nome: `${marca}-local-editado`, endereco: null, responsavel: null,
      estudios: [{ id: estudioA.id, nome: 'Estúdio A renomeado' }, { nome: 'Estúdio C' }],
    });

    const editado = await lg.getLocal(id);
    expect(editado?.nome).toBe(`${marca}-local-editado`);
    expect(editado?.estudios.map((e) => e.nome).sort()).toEqual(['Estúdio A renomeado', 'Estúdio C']);
    // O id do estúdio renomeado não mudou — é o que garante que uma referência futura
    // (Agenda) sobreviveria a essa edição.
    expect(editado?.estudios.find((e) => e.nome === 'Estúdio A renomeado')?.id).toBe(estudioA.id);
    // "Estúdio B" saiu da lista enviada: some da listagem ativa (soft-deleted).
    expect(editado?.estudios.some((e) => e.nome === 'Estúdio B')).toBe(false);

    await sql`delete from estudios where local_id = ${id}`;
    await sql`delete from locais_gravacao where id = ${id}`;
  });

  it('estudio removido da lista no update aparece na lixeira; apagar o local nao arrasta os estudios', async () => {
    const lg = await import('@/lib/db/locais-gravacao');

    const id = await lg.createLocal({
      nome: `${marca}-local-lixeira`, endereco: null, responsavel: null,
      estudios: [{ nome: 'Estúdio A' }],
    });
    const [estudioA] = (await lg.getLocal(id))!.estudios;

    await lg.updateLocal(id, {
      nome: `${marca}-local-lixeira`, endereco: null, responsavel: null, estudios: [],
    });

    // Checagem direto na tabela, não via `q.listTrash()`: `listTrash` só passa a
    // reconhecer `kind: 'estudio'` na Task 5 — esta task ainda não a modifica.
    const linhaEstudioRemovido = (await sql`
      select deleted_at from estudios where id = ${estudioA.id}`) as { deleted_at: string | null }[];
    expect(linhaEstudioRemovido[0]?.deleted_at).not.toBeNull();

    await lg.softDeleteLocal(id);
    const linhaEstudio = (await sql`
      select deleted_at from estudios where id = ${estudioA.id}`) as { deleted_at: string }[];
    // O estúdio já estava soft-deleted desde o update acima; apagar o local não altera
    // esse timestamp (cada um soft-deleta na própria hora, sem cascata).
    expect(linhaEstudio[0]?.deleted_at).not.toBeNull();

    await sql`delete from estudios where local_id = ${id}`;
    await sql`delete from locais_gravacao where id = ${id}`;
  });

  it('editar um local nao renomeia estudio pertencente a outro local', async () => {
    const lg = await import('@/lib/db/locais-gravacao');

    const idA = await lg.createLocal({
      nome: `${marca}-local-A`, endereco: null, responsavel: null, estudios: [{ nome: 'Estúdio A' }],
    });
    const idB = await lg.createLocal({
      nome: `${marca}-local-B`, endereco: null, responsavel: null, estudios: [],
    });
    const [estudioDoLocalA] = (await lg.getLocal(idA))!.estudios;

    // Tenta renomear, a partir do local B, um estúdio que pertence ao local A.
    await lg.updateLocal(idB, {
      nome: `${marca}-local-B`, endereco: null, responsavel: null,
      estudios: [{ id: estudioDoLocalA.id, nome: 'Nome hostil' }],
    });

    const linha = (await sql`select nome, local_id from estudios where id = ${estudioDoLocalA.id}`) as
      { nome: string; local_id: string }[];
    expect(linha[0]?.nome).toBe('Estúdio A');
    expect(linha[0]?.local_id).toBe(idA);

    await sql`delete from estudios where local_id in (${idA}, ${idB})`;
    await sql`delete from locais_gravacao where id in (${idA}, ${idB})`;
  });
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx vitest run tests/integracao.test.ts
```

Esperado: FAIL — `Cannot find module '@/lib/db/locais-gravacao'`.

- [ ] **Step 3: Implementar**

Criar `lib/db/locais-gravacao.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { sql } from '@/lib/db/client';
import { NotFoundError } from '@/lib/authz';
import { assertUuid } from '@/lib/validation';
import type { DadosLocal, LocalGravacao } from '@/lib/types';

// A mesma consulta se repete nas duas funções abaixo (`listLocais`/`getLocal`), em vez
// de virar uma constante compartilhada: o tagged template `sql\`...\`` deste driver não
// é composable — `sql\`${outraQuery} where ...\`` tentaria bindar a query como
// parâmetro, não colar o texto SQL dela. `lib/db/produtos.ts`/`lib/db/combos.ts` repetem
// os SELECTs pelo mesmo motivo, sem comentário próprio — este aqui existe pra não
// reintroduzir a tentativa de "otimizar" numa constante compartilhada.
export async function listLocais(): Promise<LocalGravacao[]> {
  return (await sql`
    select l.id, l.nome, l.endereco, l.responsavel, l.created_at,
           coalesce(
             json_agg(
               json_build_object('id', e.id, 'local_id', e.local_id, 'nome', e.nome, 'created_at', e.created_at)
               order by e.nome
             ) filter (where e.id is not null), '[]'
           ) as estudios
      from locais_gravacao l
      left join estudios e on e.local_id = l.id and e.deleted_at is null
     where l.deleted_at is null
     group by l.id
     order by l.nome`) as LocalGravacao[];
}

export async function getLocal(id: string): Promise<LocalGravacao | null> {
  assertUuid(id);
  const rows = (await sql`
    select l.id, l.nome, l.endereco, l.responsavel, l.created_at,
           coalesce(
             json_agg(
               json_build_object('id', e.id, 'local_id', e.local_id, 'nome', e.nome, 'created_at', e.created_at)
               order by e.nome
             ) filter (where e.id is not null), '[]'
           ) as estudios
      from locais_gravacao l
      left join estudios e on e.local_id = l.id and e.deleted_at is null
     where l.id = ${id} and l.deleted_at is null
     group by l.id`) as LocalGravacao[];
  return rows[0] ?? null;
}

export async function createLocal(dados: DadosLocal): Promise<string> {
  const id = randomUUID();
  await sql.transaction([
    sql`insert into locais_gravacao (id, nome, endereco, responsavel)
        values (${id}, ${dados.nome}, ${dados.endereco}, ${dados.responsavel})`,
    ...dados.estudios.map((e) => sql`
      insert into estudios (id, local_id, nome) values (${randomUUID()}, ${id}, ${e.nome})`),
  ]);
  return id;
}

/**
 * Diferente de `updateCombo`/`updatePlano` (que apagam e reinserem todos os itens a
 * cada save): aqui o `id` do estúdio precisa sobreviver a uma edição, porque a Agenda
 * (spec futura) vai referenciar `estudio_id`. Por isso o update é um diff:
 * - item com `id`: `update` (renomeia);
 * - item sem `id`: `insert` (novo estúdio);
 * - estúdio existente cujo `id` não aparece na lista enviada: soft-delete.
 */
export async function updateLocal(id: string, dados: DadosLocal): Promise<void> {
  assertUuid(id);
  if (!(await getLocal(id))) throw new NotFoundError();

  const existentes = dados.estudios.filter((e): e is { id: string; nome: string } => Boolean(e.id));
  // Cada `id` de estúdio enviado precisa ter formato de uuid antes de virar `where id = ...`
  // — sem isso, um id malformado vira erro de cast do Postgres (500) em vez de 404.
  existentes.forEach((e) => assertUuid(e.id));
  const novos = dados.estudios
    .filter((e) => !e.id)
    .map((e) => ({ id: randomUUID(), nome: e.nome }));
  // Os ids recém-gerados pros novos entram aqui também: sem isso, o soft-delete final
  // (que roda na mesma transação) apagaria de volta o estúdio que acabou de ser
  // inserido, por não reconhecer o id dele como "enviado".
  const idsEnviados = [...existentes.map((e) => e.id), ...novos.map((e) => e.id)];

  await sql.transaction([
    sql`update locais_gravacao
           set nome = ${dados.nome}, endereco = ${dados.endereco}, responsavel = ${dados.responsavel},
               updated_at = now()
         where id = ${id}`,
    // `and local_id = ${id}`: sem isso, um id de estúdio de OUTRO local enviado no
    // payload renomearia silenciosamente um registro que não pertence a este local.
    ...existentes.map((e) => sql`
      update estudios set nome = ${e.nome}, updated_at = now() where id = ${e.id} and local_id = ${id}`),
    ...novos.map((e) => sql`insert into estudios (id, local_id, nome) values (${e.id}, ${id}, ${e.nome})`),
    sql`update estudios set deleted_at = now()
         where local_id = ${id} and deleted_at is null and id <> all(${idsEnviados}::uuid[])`,
  ]);
}

export async function softDeleteLocal(id: string): Promise<void> {
  assertUuid(id);
  const rows = (await sql`
    update locais_gravacao set deleted_at = now()
     where id = ${id} and deleted_at is null
     returning id`) as { id: string }[];
  if (!rows[0]) throw new NotFoundError();
}
```

**Nota:** `id <> all(${idsEnviados}::uuid[])` com array vazio é sempre verdadeiro para qualquer
`id` (`ALL` sobre conjunto vazio é vacuamente verdadeiro) — é o mesmo idioma já usado em
`setRoomMembers`/`setUserModules` (`lib/db/queries.ts`), então quando a lista enviada não tem
nenhum `id` (todos os estúdios do local foram removidos), a cláusula soft-deleta todos.

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

Esperado: `tsc` sem saída; **181 testes** (178 + 3).

```bash
git add lib/db/locais-gravacao.ts tests/integracao.test.ts
git commit -m "Adiciona camada de dados de local de gravacao com diff de estudios"
```

---

## Task 4: Permissão (`canManageLocaisGravacao`)

**Files:**
- Modify: `lib/authz.ts`
- Modify: `tests/authz.test.ts`

**Interfaces:**
- Consumes: `Actor` de `lib/types.ts`.
- Produces: `canManageLocaisGravacao(actor: Actor): boolean`.

- [ ] **Step 1: Escrever o teste que falha**

Em `tests/authz.test.ts`, dentro do `describe('administração', ...)` existente (depois do `it`
"só master gerencia produtos", antes do `});` que fecha esse describe), acrescentar:

```ts
  it('só master gerencia locais de gravação', () => {
    expect(canManageLocaisGravacao(master)).toBe(true);
    expect(canManageLocaisGravacao(dono)).toBe(false);
  });
```

No topo do arquivo, acrescentar `canManageLocaisGravacao` ao import existente de `@/lib/authz`.

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx vitest run tests/authz.test.ts
```

Esperado: FAIL — `canManageLocaisGravacao is not defined` / `is not a function`.

- [ ] **Step 3: Implementar**

Em `lib/authz.ts`, logo abaixo da linha `export const canManageProdutos = (actor: Actor) => isMaster(actor);`, acrescentar:

```ts
export const canManageLocaisGravacao = (actor: Actor) => isMaster(actor);
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

Esperado: `tsc` sem saída; **182 testes** (181 + 1).

```bash
git add lib/authz.ts tests/authz.test.ts
git commit -m "Adiciona canManageLocaisGravacao"
```

---

## Task 5: Lixeira e auditoria estendidas

**Files:**
- Modify: `lib/db/queries.ts` (bloco `TrashItem`/`listTrash`/`restoreItem`/`purgeItem`)
- Modify: `lib/db/audit.ts` (tipo `Entry`)
- Modify: `components/RestoreButton.tsx`
- Modify: `components/PurgeButton.tsx`
- Modify: `app/(app)/admin/lixeira/actions.ts`
- Modify: `app/(app)/admin/lixeira/page.tsx`
- Modify (append): `tests/integracao.test.ts`

**Interfaces:**
- Consumes: `createLocal`, `softDeleteLocal`, `updateLocal` de `lib/db/locais-gravacao.ts` (task 3).
- Produces: `TrashItem['kind']`, `restoreItem`, `purgeItem` aceitando `'local_gravacao' | 'estudio'`.

- [ ] **Step 1: Escrever o teste que falha**

Em `tests/integracao.test.ts`, acrescentar mais um `it` dentro do describe principal, depois dos
dois adicionados na Task 3:

```ts
  it('local apagado aparece na lixeira, restaura e depois expurga', async () => {
    const lg = await import('@/lib/db/locais-gravacao');

    const id = await lg.createLocal({
      nome: `${marca}-local-crud-lixeira`, endereco: null, responsavel: null, estudios: [],
    });
    await lg.softDeleteLocal(id);

    const lixeira = await q.listTrash();
    const item = lixeira.find((i) => i.kind === 'local_gravacao' && i.id === id);
    expect(item?.title).toBe(`${marca}-local-crud-lixeira`);

    await q.restoreItem('local_gravacao', id);
    expect(await lg.getLocal(id)).not.toBeNull();

    await lg.softDeleteLocal(id);
    await q.purgeItem('local_gravacao', id);
    const linhas = (await sql`select id from locais_gravacao where id = ${id}`) as { id: string }[];
    expect(linhas).toHaveLength(0);
  });
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx vitest run tests/integracao.test.ts
```

Esperado: FAIL — `kind` não aceita `'local_gravacao'` ainda / `item` chega `undefined`.

- [ ] **Step 3: Estender `lib/db/queries.ts`**

No tipo `TrashItem`, trocar a linha `kind`:

```ts
  kind: 'credential' | 'room' | 'cliente' | 'fornecedor' | 'produto' | 'combo' | 'plano';
```

por:

```ts
  kind: 'credential' | 'room' | 'cliente' | 'fornecedor' | 'produto' | 'combo' | 'plano'
    | 'local_gravacao' | 'estudio';
```

Em `listTrash()`, acrescentar dois `union all` antes do `order by deleted_at desc` final. Para o
estúdio, `room_name` reaproveita a coluna existente pra mostrar o nome do local (mesmo truque que
já dá contexto pra credencial dentro de sala):

```sql
    union all
    select lg.id, 'local_gravacao' as kind, lg.nome as title, null as room_name, lg.deleted_at,
           null::int as credential_count
      from locais_gravacao lg where lg.deleted_at is not null
    union all
    select e.id, 'estudio' as kind, e.nome as title, l.nome as room_name, e.deleted_at,
           null::int as credential_count
      from estudios e join locais_gravacao l on l.id = e.local_id
     where e.deleted_at is not null
```

Em `restoreItem`, trocar a assinatura e acrescentar os dois `else if`:

```ts
export async function restoreItem(
  kind: 'credential' | 'room' | 'cliente' | 'fornecedor' | 'produto' | 'combo' | 'plano'
    | 'local_gravacao' | 'estudio',
  id: string,
): Promise<void> {
```

```ts
  } else if (kind === 'local_gravacao') {
    await sql`update locais_gravacao set deleted_at = null where id = ${id}`;
  } else if (kind === 'estudio') {
    await sql`update estudios set deleted_at = null where id = ${id}`;
  }
```

Em `purgeItem`, mesma troca de assinatura e mais dois `else if`:

```ts
export async function purgeItem(
  kind: 'credential' | 'room' | 'cliente' | 'fornecedor' | 'produto' | 'combo' | 'plano'
    | 'local_gravacao' | 'estudio',
  id: string,
): Promise<void> {
```

```ts
  } else if (kind === 'local_gravacao') {
    await sql`delete from locais_gravacao where id = ${id} and deleted_at is not null`;
  } else if (kind === 'estudio') {
    await sql`delete from estudios where id = ${id} and deleted_at is not null`;
  }
```

- [ ] **Step 4: Estender `lib/db/audit.ts`**

Trocar:

```ts
  entityType?: 'credential' | 'room' | 'user' | 'cliente' | 'fornecedor' | 'categoria_produto' | 'produto' | 'combo' | 'plano';
```

por:

```ts
  entityType?: 'credential' | 'room' | 'user' | 'cliente' | 'fornecedor' | 'categoria_produto'
    | 'produto' | 'combo' | 'plano' | 'local_gravacao' | 'estudio';
```

- [ ] **Step 5: Estender os componentes e a tela de lixeira**

Em `components/RestoreButton.tsx`, trocar o tipo de `kind`:

```ts
export function RestoreButton({
  kind, id,
}: {
  kind: 'credential' | 'room' | 'cliente' | 'fornecedor' | 'produto' | 'combo' | 'plano'
    | 'local_gravacao' | 'estudio';
  id: string;
}) {
```

Em `components/PurgeButton.tsx`, mesma troca no tipo de `kind`:

```ts
export function PurgeButton({
  kind, id, title, credentialCount,
}: {
  kind: 'credential' | 'room' | 'cliente' | 'fornecedor' | 'produto' | 'combo' | 'plano'
    | 'local_gravacao' | 'estudio';
  id: string;
  title: string;
  credentialCount: number | null;
}) {
```

Em `app/(app)/admin/lixeira/actions.ts`, trocar a assinatura de `restaurar` e `expurgar` (mesmo
tipo em cada):

```ts
export async function restaurar(
  kind: 'credential' | 'room' | 'cliente' | 'fornecedor' | 'produto' | 'combo' | 'plano'
    | 'local_gravacao' | 'estudio',
  id: string,
): Promise<RestoreResult> {
```

```ts
export async function expurgar(
  kind: 'credential' | 'room' | 'cliente' | 'fornecedor' | 'produto' | 'combo' | 'plano'
    | 'local_gravacao' | 'estudio',
  id: string,
): Promise<ExpurgarResult> {
```

Em `app/(app)/admin/lixeira/page.tsx`, trocar o objeto de rótulos do `badge`:

```tsx
                <span className="badge">
                  {{ room: 'sala', credential: 'senha', cliente: 'cliente', fornecedor: 'fornecedor', produto: 'produto', combo: 'combo', plano: 'plano' }[item.kind]}
                </span>
```

por:

```tsx
                <span className="badge">
                  {{
                    room: 'sala', credential: 'senha', cliente: 'cliente', fornecedor: 'fornecedor',
                    produto: 'produto', combo: 'combo', plano: 'plano',
                    local_gravacao: 'local de gravação', estudio: 'estúdio',
                  }[item.kind]}
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

Esperado: **183 testes** (182 + 1).

```bash
git add lib/db/queries.ts lib/db/audit.ts components/RestoreButton.tsx components/PurgeButton.tsx "app/(app)/admin/lixeira/actions.ts" "app/(app)/admin/lixeira/page.tsx" tests/integracao.test.ts
git commit -m "Estende lixeira e auditoria para local de gravacao e estudio"
```

---

## Task 6: Componentes `EstudiosRepetidor` e `LocalGravacaoClient`

**Files:**
- Create: `components/EstudiosRepetidor.tsx`
- Test: `tests/EstudiosRepetidor.test.tsx`
- Create: `components/LocalGravacaoClient.tsx`
- Test: `tests/LocalGravacaoClient.test.tsx`

**Interfaces:**
- Consumes: tipos `LocalGravacao`, `Estudio` de `lib/types.ts`.
- Produces:
  - `EstudiosRepetidor({ itens, onChange }: { itens: DadosLocal['estudios']; onChange: (itens: DadosLocal['estudios']) => void })` — controlado, sem estado de lista próprio (mesmo contrato de `ItemRepetidor`).
  - `LocalGravacaoClient` (componente) e `type LocalGravacaoState = { error?: string; ok?: string }`, ambos exportados de `components/LocalGravacaoClient.tsx`. Recebe `criar`, `salvar`, `apagar` como props (task 7 passa as reais).

- [ ] **Step 1: Escrever o teste do `EstudiosRepetidor` que falha**

Criar `tests/EstudiosRepetidor.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { EstudiosRepetidor } from '@/components/EstudiosRepetidor';

afterEach(() => cleanup());

describe('EstudiosRepetidor', () => {
  it('adicionar um nome novo chama onChange com o item incluído', () => {
    const onChange = vi.fn();
    render(<EstudiosRepetidor itens={[]} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Estúdio'), { target: { value: 'Estúdio A' } });
    fireEvent.click(screen.getByText('Adicionar'));

    expect(onChange).toHaveBeenCalledWith([{ nome: 'Estúdio A' }]);
  });

  it('remover um item preserva o id dos que restaram', () => {
    const onChange = vi.fn();
    const itens = [{ id: 'e1', nome: 'Estúdio A' }, { id: 'e2', nome: 'Estúdio B' }];
    render(<EstudiosRepetidor itens={itens} onChange={onChange} />);

    fireEvent.click(screen.getAllByText('Remover')[0]);

    expect(onChange).toHaveBeenCalledWith([{ id: 'e2', nome: 'Estúdio B' }]);
  });

  it('sem itens mostra mensagem vazia', () => {
    render(<EstudiosRepetidor itens={[]} onChange={vi.fn()} />);
    expect(screen.getByText('Nenhum estúdio adicionado.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx vitest run tests/EstudiosRepetidor.test.tsx
```

Esperado: FAIL — `Cannot find module '@/components/EstudiosRepetidor'`.

- [ ] **Step 3: Implementar `EstudiosRepetidor`**

Criar `components/EstudiosRepetidor.tsx`:

```tsx
'use client';

import { useState } from 'react';
import type { DadosLocal } from '@/lib/types';

type EstudioEntrada = DadosLocal['estudios'][number];

export function EstudiosRepetidor({
  itens, onChange,
}: { itens: EstudioEntrada[]; onChange: (itens: EstudioEntrada[]) => void }) {
  const [nome, setNome] = useState('');

  function adicionar() {
    const nomeNormalizado = nome.trim();
    if (!nomeNormalizado) return;
    onChange([...itens, { nome: nomeNormalizado }]);
    setNome('');
  }

  return (
    <div className="space-y-3">
      <input type="hidden" name="estudios" value={JSON.stringify(itens)} />
      <div className="flex flex-wrap items-end gap-2">
        <label className="block space-y-1 flex-1 min-w-[12rem]">
          <span className="text-sm">Estúdio</span>
          <input
            aria-label="Estúdio" className="input" value={nome}
            onChange={(e) => setNome(e.target.value)} placeholder="ex.: Estúdio A"
          />
        </label>
        <button type="button" className="btn" onClick={adicionar}>Adicionar</button>
      </div>
      <ul className="text-sm space-y-1">
        {itens.map((item, i) => (
          <li key={item.id ?? `novo-${i}`} className="flex items-center gap-2">
            <span className="flex-1">{item.nome}</span>
            <button type="button" className="btn" onClick={() => onChange(itens.filter((_, idx) => idx !== i))}>
              Remover
            </button>
          </li>
        ))}
      </ul>
      {itens.length === 0 && (
        <p className="text-xs" style={{ color: 'var(--text-dim)' }}>Nenhum estúdio adicionado.</p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
npx vitest run tests/EstudiosRepetidor.test.tsx
```

Esperado: PASS, 3 testes.

- [ ] **Step 5: Escrever o teste do `LocalGravacaoClient` que falha**

Criar `tests/LocalGravacaoClient.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { LocalGravacaoClient } from '@/components/LocalGravacaoClient';
import type { LocalGravacao } from '@/lib/types';

const item: LocalGravacao = {
  id: '11111111-1111-1111-1111-111111111111', nome: 'P7 Belo Horizonte',
  endereco: 'Rua X, 100', responsavel: 'Fulano', created_at: '2026-08-10T00:00:00Z',
  estudios: [{ id: 'e1', local_id: '11111111-1111-1111-1111-111111111111', nome: 'Estúdio A', created_at: '2026-08-10T00:00:00Z' }],
};

const criar = vi.fn();
const salvar = vi.fn();
const apagar = vi.fn();

afterEach(() => cleanup());

describe('LocalGravacaoClient', () => {
  it('lista locais com o nome', () => {
    render(<LocalGravacaoClient itens={[item]} criar={criar} salvar={salvar} apagar={apagar} />);
    expect(screen.getByText('P7 Belo Horizonte')).toBeInTheDocument();
  });

  it('clicar na linha abre o modal com os dados e estúdios preenchidos', () => {
    render(<LocalGravacaoClient itens={[item]} criar={criar} salvar={salvar} apagar={apagar} />);
    fireEvent.click(screen.getByText('P7 Belo Horizonte'));
    expect(screen.getByDisplayValue('P7 Belo Horizonte')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Rua X, 100')).toBeInTheDocument();
    expect(screen.getByText('Estúdio A')).toBeInTheDocument();
  });

  it('sem itens mostra mensagem vazia', () => {
    render(<LocalGravacaoClient itens={[]} criar={criar} salvar={salvar} apagar={apagar} />);
    expect(screen.getByText('Nenhum local de gravação cadastrado.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Rodar e confirmar que falha**

```bash
npx vitest run tests/LocalGravacaoClient.test.tsx
```

Esperado: FAIL — `Cannot find module '@/components/LocalGravacaoClient'`.

- [ ] **Step 7: Implementar `LocalGravacaoClient`**

Criar `components/LocalGravacaoClient.tsx`:

```tsx
'use client';

import { useActionState, useEffect, useState } from 'react';
import { EstudiosRepetidor } from '@/components/EstudiosRepetidor';
import type { DadosLocal, LocalGravacao } from '@/lib/types';

export type LocalGravacaoState = { error?: string; ok?: string };
const inicial: LocalGravacaoState = {};
type Acao = (prev: LocalGravacaoState, fd: FormData) => Promise<LocalGravacaoState>;
type EstudioEntrada = DadosLocal['estudios'][number];

function CamposComuns({
  item, estudios, onEstudios,
}: { item?: LocalGravacao; estudios: EstudioEntrada[]; onEstudios: (e: EstudioEntrada[]) => void }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-sm">Nome</span>
          <input name="nome" className="input" defaultValue={item?.nome ?? ''} required />
        </label>
        <label className="block space-y-1">
          <span className="text-sm">Endereço</span>
          <input name="endereco" className="input" defaultValue={item?.endereco ?? ''} />
        </label>
        <label className="block space-y-1">
          <span className="text-sm">Responsável</span>
          <input name="responsavel" className="input" defaultValue={item?.responsavel ?? ''} />
        </label>
      </div>
      <EstudiosRepetidor itens={estudios} onChange={onEstudios} />
    </>
  );
}

function FormularioNovo({ criar }: { criar: Acao }) {
  const [state, action, pending] = useActionState(criar, inicial);
  const [estudios, setEstudios] = useState<EstudioEntrada[]>([]);

  useEffect(() => {
    if (state.ok) setEstudios([]);
  }, [state.ok]);

  return (
    <details className="glass p-5">
      <summary className="cursor-pointer font-semibold">Novo local de gravação</summary>
      <form action={action} className="space-y-4 mt-4">
        <CamposComuns estudios={estudios} onEstudios={setEstudios} />
        {state.error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{state.error}</p>}
        {state.ok && <p className="text-sm" style={{ color: 'var(--ok)' }}>{state.ok}</p>}
        <button className="btn btn-primary" disabled={pending}>Cadastrar</button>
      </form>
    </details>
  );
}

function ModalEdicao({
  item, salvar, apagar, onFechar,
}: { item: LocalGravacao; salvar: Acao; apagar: (id: string) => Promise<{ error?: string }>; onFechar: () => void }) {
  const [state, action, pending] = useActionState(salvar, inicial);
  const [estudios, setEstudios] = useState<EstudioEntrada[]>(
    item.estudios.map((e) => ({ id: e.id, nome: e.nome })),
  );
  const [erroApagar, setErroApagar] = useState<string | null>(null);

  useEffect(() => {
    if (state.ok) onFechar();
  }, [state.ok, onFechar]);

  async function apagarClique() {
    if (!confirm('Apagar este local de gravação?')) return;
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
        <CamposComuns item={item} estudios={estudios} onEstudios={setEstudios} />
        {state.error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{state.error}</p>}
        <button className="btn btn-primary" disabled={pending}>Salvar</button>
      </form>
      <button type="button" className="btn btn-danger" onClick={() => void apagarClique()}>Apagar</button>
      {erroApagar && <p className="text-sm" style={{ color: 'var(--danger)' }}>{erroApagar}</p>}
    </div>
  );
}

export function LocalGravacaoClient({
  itens, criar, salvar, apagar,
}: { itens: LocalGravacao[]; criar: Acao; salvar: Acao; apagar: (id: string) => Promise<{ error?: string }> }) {
  const [aberto, setAberto] = useState<LocalGravacao | null>(null);
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Locais de Gravação</h1>
      <FormularioNovo criar={criar} />
      <table className="w-full text-sm">
        <thead>
          <tr style={{ color: 'var(--text-dim)' }}>
            <th className="text-left p-2">Nome</th>
            <th className="text-left p-2">Responsável</th>
            <th className="text-left p-2">Estúdios</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((l) => (
            <tr key={l.id} className="cursor-pointer" onClick={() => setAberto(l)}>
              <td className="p-2">{l.nome}</td>
              <td className="p-2">{l.responsavel ?? '—'}</td>
              <td className="p-2">{l.estudios.length}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {itens.length === 0 && (
        <p className="text-sm" style={{ color: 'var(--text-dim)' }}>Nenhum local de gravação cadastrado.</p>
      )}
      {aberto && (
        <ModalEdicao key={aberto.id} item={aberto} salvar={salvar} apagar={apagar} onFechar={() => setAberto(null)} />
      )}
    </div>
  );
}
```

- [ ] **Step 8: Rodar e confirmar que passa**

```bash
npx vitest run tests/LocalGravacaoClient.test.tsx
```

Esperado: PASS, 3 testes.

- [ ] **Step 9: Conferir tudo e commitar**

```bash
npx tsc --noEmit
npm test
```

Esperado: `tsc` sem saída; **189 testes** (183 + 3 + 3).

```bash
git add components/EstudiosRepetidor.tsx tests/EstudiosRepetidor.test.tsx components/LocalGravacaoClient.tsx tests/LocalGravacaoClient.test.tsx
git commit -m "Adiciona componentes EstudiosRepetidor e LocalGravacaoClient"
```

---

## Task 7: Rota `/cadastros/locais-gravacao`

**Files:**
- Create: `app/(app)/cadastros/locais-gravacao/actions.ts`
- Create: `app/(app)/cadastros/locais-gravacao/page.tsx`

**Interfaces:**
- Consumes: `requireMaster` de `lib/auth/guards.ts`; `createLocal`, `listLocais`, `softDeleteLocal`, `updateLocal` de `lib/db/locais-gravacao.ts`; `lerDadosLocal` de `lib/locais-gravacao-form.ts`; `audit` de `lib/db/audit.ts`; `isUuid` de `lib/validation.ts`; `LocalGravacaoClient`, `LocalGravacaoState` de `components/LocalGravacaoClient.tsx`.
- Produces: rota `/cadastros/locais-gravacao`, funções `criarLocal`, `salvarLocal`, `apagarLocal`.

- [ ] **Step 1: Criar as actions**

Criar `app/(app)/cadastros/locais-gravacao/actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { requireMaster } from '@/lib/auth/guards';
import { audit } from '@/lib/db/audit';
import { createLocal, softDeleteLocal, updateLocal } from '@/lib/db/locais-gravacao';
import { lerDadosLocal } from '@/lib/locais-gravacao-form';
import { isUuid } from '@/lib/validation';
import type { LocalGravacaoState } from '@/components/LocalGravacaoClient';

const ROTA = '/cadastros/locais-gravacao';

export async function criarLocal(
  _prev: LocalGravacaoState, formData: FormData,
): Promise<LocalGravacaoState> {
  const actor = await requireMaster();
  const dados = lerDadosLocal(formData);
  if ('error' in dados) return dados;

  const id = await createLocal(dados);
  await audit({ actorId: actor.id, action: 'create', entityType: 'local_gravacao', entityId: id });
  revalidatePath(ROTA);
  return { ok: 'Local de gravação cadastrado.' };
}

export async function salvarLocal(
  _prev: LocalGravacaoState, formData: FormData,
): Promise<LocalGravacaoState> {
  const actor = await requireMaster();
  const id = String(formData.get('id') ?? '');
  if (!isUuid(id)) return { error: 'Local de gravação não encontrado.' };

  const dados = lerDadosLocal(formData);
  if ('error' in dados) return dados;

  await updateLocal(id, dados);
  await audit({ actorId: actor.id, action: 'update', entityType: 'local_gravacao', entityId: id });
  revalidatePath(ROTA);
  return { ok: 'Local de gravação atualizado.' };
}

export async function apagarLocal(id: string): Promise<{ error?: string }> {
  const actor = await requireMaster();
  if (!isUuid(id)) return { error: 'Local de gravação não encontrado.' };

  await softDeleteLocal(id);
  await audit({ actorId: actor.id, action: 'delete', entityType: 'local_gravacao', entityId: id });
  revalidatePath(ROTA);
  return {};
}
```

- [ ] **Step 2: Criar a página**

Criar `app/(app)/cadastros/locais-gravacao/page.tsx`:

```tsx
import { LocalGravacaoClient } from '@/components/LocalGravacaoClient';
import { requireMaster } from '@/lib/auth/guards';
import { listLocais } from '@/lib/db/locais-gravacao';
import { apagarLocal, criarLocal, salvarLocal } from './actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function LocaisGravacaoPage() {
  await requireMaster();
  const itens = await listLocais();

  return (
    <main className="p-4 md:p-6 max-w-5xl mx-auto">
      <LocalGravacaoClient itens={itens} criar={criarLocal} salvar={salvarLocal} apagar={apagarLocal} />
    </main>
  );
}
```

- [ ] **Step 3: Conferir e commitar**

```bash
npx tsc --noEmit
npm test
```

Esperado: `tsc` sem saída; **189 testes** (sem teste novo — rota fina, coberta pelo que `LocalGravacaoClient` e `locais-gravacao.ts` já testam).

```bash
npm run dev
```

Acessar `http://localhost:3000/cadastros/locais-gravacao` logado como master: cadastrar um local
com 2 estúdios, editar renomeando um e removendo outro, apagar (some da lista, aparece em
`/admin/lixeira` como "local de gravação"). Encerrar o servidor (Ctrl+C) depois de conferir.

```bash
git add "app/(app)/cadastros/locais-gravacao"
git commit -m "Adiciona rota de cadastro de locais de gravacao"
```

---

## Task 8: Menu

**Files:**
- Modify: `components/Sidebar.tsx`

**Interfaces:**
- Consumes: `canManageLocaisGravacao` de `lib/authz.ts` (task 4).
- Produces: item "Locais de Gravação" no grupo "Cadastros" do menu.

- [ ] **Step 1: Editar `components/Sidebar.tsx`**

Trocar a linha do import de ícones:

```ts
import { Building2, Boxes, CalendarClock, FolderKanban, Home, Layers, Package, ScrollText, Trash2, Truck, UserSquare2, Users, Vault } from 'lucide-react';
```

por (acrescenta `MapPin`):

```ts
import { Building2, Boxes, CalendarClock, FolderKanban, Home, Layers, MapPin, Package, ScrollText, Trash2, Truck, UserSquare2, Users, Vault } from 'lucide-react';
```

Trocar a linha do import de `authz`:

```ts
import { canManageProdutos, canManageTerceiros } from '@/lib/authz';
```

por:

```ts
import { canManageLocaisGravacao, canManageProdutos, canManageTerceiros } from '@/lib/authz';
```

No grupo "Cadastros", acrescentar o item de Locais de Gravação depois de Fornecedores:

```tsx
              {
                href: '/cadastros/fornecedores', label: 'Fornecedores',
                icon: <Truck size={18} className={iconClass} />,
              },
            ]
          : []),
```

por:

```tsx
              {
                href: '/cadastros/fornecedores', label: 'Fornecedores',
                icon: <Truck size={18} className={iconClass} />,
              },
            ]
          : []),
        ...(canManageLocaisGravacao(actor)
          ? [
              {
                href: '/cadastros/locais-gravacao', label: 'Locais de Gravação',
                icon: <MapPin size={18} className={iconClass} />,
              },
            ]
          : []),
```

- [ ] **Step 2: Conferir e commitar**

```bash
npx tsc --noEmit
npm test
```

Esperado: `tsc` sem saída; **189 testes** (sem teste novo — `Sidebar.tsx` não tem suíte própria hoje, mesmo padrão dos itens já existentes nele).

```bash
npm run dev
```

Logado como master: menu mostra "Locais de Gravação" dentro de "Cadastros". Logado como usuário
comum: o item não aparece. Encerrar o servidor depois.

```bash
git add components/Sidebar.tsx
git commit -m "Adiciona Locais de Gravacao ao menu Cadastros"
```
