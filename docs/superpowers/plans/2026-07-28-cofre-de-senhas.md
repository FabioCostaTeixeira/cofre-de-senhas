# Cofre de Senhas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir um gerenciador de senhas web para equipe, com senhas cifradas em AES-256-GCM, organizadas em salas com escopo global/pessoal, administradas por um usuário master.

**Architecture:** Next.js 15 App Router com Server Components para leitura e Server Actions para escrita. Toda autorização passa por um módulo puro `lib/authz.ts`, testável sem servidor. Toda criptografia passa por `lib/crypto.ts`. Banco Neon (Postgres) acessado por SQL puro, sem ORM; migrations versionadas em arquivos `.sql`.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript (strict), Tailwind CSS v4, Neon Postgres (`@neondatabase/serverless` no runtime, `pg` no script de migration), `bcryptjs`, `jose` (JWT), Vitest.

**Spec:** [`docs/superpowers/specs/2026-07-28-cofre-de-senhas-design.md`](../specs/2026-07-28-cofre-de-senhas-design.md)

## Global Constraints

- Idioma de toda a interface e de todas as mensagens de erro: **português do Brasil**.
- Nenhuma senha em texto claro pode aparecer em log, `console.*`, audit log, mensagem de erro ou resposta de listagem. Senha em claro só trafega na resposta da Server Action `revealCredential`.
- Todo acesso ao banco roda em Route Handlers / Server Components / Server Actions com `runtime = 'nodejs'`. Nunca edge (o módulo `crypto` do Node é obrigatório).
- Nenhum arquivo além de `lib/crypto.ts` importa `node:crypto` para cifrar/decifrar.
- Nenhuma query sobre `credentials` ou `rooms` é escrita fora de `lib/db/queries.ts`; toda uma delas recebe o `Actor` e aplica o filtro de autorização.
- Falha de autorização retorna **404**, nunca 403.
- Cookie de sessão: `httpOnly`, `secure`, `sameSite=lax`, nome `cofre_session`, validade 8h.
- Segredos vivem apenas em variáveis de ambiente: `DATABASE_URL`, `VAULT_KEY`, `SESSION_SECRET`. `.env*` fica no `.gitignore`; `.env.example` versionado só com nomes.
- TypeScript em `strict: true`. Sem `any` implícito.
- Commits em português, com `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` na última linha.
- Visual: dark minimalista com detalhes de glassmorphism (cards e modais translúcidos com blur; listas em superfície sólida).

## File Structure

```
db/migrations/001_init.sql        schema completo (tabelas, índices, extensões)
db/migrate.mjs                    aplica migrations pendentes, registra em _migrations
db/seed.mjs                       cria o primeiro usuário master

lib/crypto.ts                     encrypt/decrypt AES-256-GCM. Único consumidor de node:crypto
lib/authz.ts                      funções puras de permissão + cláusula SQL de visibilidade
lib/types.ts                      tipos compartilhados (Actor, Credential, Room, ...)
lib/db/client.ts                  conexão Neon (sql tagged template)
lib/db/queries.ts                 todas as queries de rooms/credentials, já autorizadas
lib/db/users.ts                   queries de usuários
lib/db/audit.ts                   gravação no audit_log
lib/auth/password.ts             hash e verificação bcrypt
lib/auth/session.ts              criar/ler/destruir o JWT de sessão
lib/auth/guards.ts               requireUser / requireMaster

app/layout.tsx                    shell, fontes, metadata, favicon
app/globals.css                   tokens de tema + utilitários de glass
app/login/page.tsx                formulário de login
app/login/actions.ts              Server Action de login
app/trocar-senha/page.tsx         troca forçada de senha
app/trocar-senha/actions.ts       Server Action da troca
app/page.tsx                      home: cards de salas + busca global
app/sala/[id]/page.tsx            lista de senhas da sala
app/credenciais/actions.ts        Server Actions: criar/editar/apagar/revelar
app/admin/usuarios/page.tsx       CRUD de usuários
app/admin/usuarios/actions.ts
app/admin/salas/page.tsx          CRUD de salas e membros
app/admin/salas/actions.ts
app/admin/auditoria/page.tsx      log filtrável
app/admin/lixeira/page.tsx        restaurar / expurgar
app/admin/lixeira/actions.ts

components/RoomCard.tsx           card de sala em vidro
components/CredentialRow.tsx      linha da senha: olho, copiar, link, menu
components/CredentialForm.tsx     formulário de criação/edição
components/SearchBox.tsx          busca com debounce
components/Nav.tsx                navegação; item Admin condicional

public/icon.svg                   marca (cofre minimalista)
public/favicon.ico, icon-192.png, icon-512.png, apple-touch-icon.png

tests/crypto.test.ts
tests/authz.test.ts
tests/session.test.ts
```

---

### Task 1: Scaffold do projeto, tema e ferramental de teste

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `.gitignore`, `.env.example`
- Create: `app/layout.tsx`, `app/globals.css`, `app/page.tsx`
- Test: `tests/smoke.test.ts`

**Interfaces:**
- Consumes: nada (primeira task)
- Produces: projeto Next.js executável com `npm run dev`, `npm test` rodando Vitest, e as classes utilitárias de tema `.glass`, `.surface` disponíveis globalmente.

- [ ] **Step 1: Criar o projeto e instalar dependências**

O diretório já contém `docs/` e um repositório git inicializado. Rodar dentro dele:

```bash
npm init -y
npm install next@15 react@19 react-dom@19 @neondatabase/serverless bcryptjs jose
npm install -D typescript @types/node @types/react @types/react-dom @types/bcryptjs \
  tailwindcss @tailwindcss/postcss postcss vitest pg dotenv
```

- [ ] **Step 2: Escrever os arquivos de configuração**

`package.json` — substituir a seção `scripts` por:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest",
    "migrate": "node db/migrate.mjs",
    "seed": "node db/seed.mjs"
  }
}
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`next.config.ts`:

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
```

`postcss.config.mjs`:

```js
export default {
  plugins: { '@tailwindcss/postcss': {} },
};
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
});
```

`.gitignore`:

```
node_modules
.next
out
.env
.env.local
.env*.local
.DS_Store
*.log
.vercel
```

`.env.example`:

```
DATABASE_URL=
VAULT_KEY=
SESSION_SECRET=
SEED_MASTER_EMAIL=
SEED_MASTER_NAME=
SEED_MASTER_PASSWORD=
```

- [ ] **Step 3: Escrever o tema (glassmorphism) e o layout**

`app/globals.css`:

```css
@import "tailwindcss";

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

body {
  background: var(--bg);
  color: var(--text);
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  min-height: 100dvh;
}

/* Gradiente discreto de fundo — base do efeito de vidro */
body::before {
  content: "";
  position: fixed;
  inset: 0;
  z-index: -1;
  background:
    radial-gradient(60rem 40rem at 15% -10%, rgba(108, 140, 255, 0.14), transparent 60%),
    radial-gradient(50rem 35rem at 95% 5%, rgba(180, 108, 255, 0.10), transparent 55%);
  pointer-events: none;
}

/* Vidro: cards de sala, modais, painéis */
.glass {
  background: rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(14px) saturate(140%);
  -webkit-backdrop-filter: blur(14px) saturate(140%);
  border: 1px solid var(--border);
  border-radius: 1rem;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
}

.glass-hover:hover {
  background: rgba(255, 255, 255, 0.07);
  border-color: rgba(255, 255, 255, 0.16);
}

/* Superfície sólida: listas de senha, onde legibilidade vem antes do efeito */
.surface {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 0.75rem;
}

.input {
  width: 100%;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  padding: 0.6rem 0.8rem;
  color: var(--text);
  outline: none;
}
.input:focus { border-color: var(--accent); }

.btn {
  border-radius: 0.5rem;
  padding: 0.55rem 1rem;
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--text);
  cursor: pointer;
}
.btn-primary { background: var(--accent); border-color: transparent; color: #0a0b0f; font-weight: 600; }
.btn-danger { color: var(--danger); }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }

.badge {
  font-size: 0.7rem;
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  border: 1px solid var(--border);
  color: var(--text-dim);
}
```

`app/layout.tsx`:

```tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Cofre de Senhas',
  description: 'Gerenciador de senhas da equipe',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
```

`app/page.tsx` (temporário, substituído na Task 8):

```tsx
export default function Home() {
  return <main className="p-8"><h1 className="text-2xl">Cofre de Senhas</h1></main>;
}
```

- [ ] **Step 4: Escrever o teste de fumaça**

`tests/smoke.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

describe('ferramental', () => {
  it('roda o Vitest', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Rodar teste e build**

```bash
npm test
```
Esperado: `1 passed`.

```bash
npm run build
```
Esperado: build conclui sem erro (`Compiled successfully`).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js, tema dark com glassmorphism e Vitest

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Módulo de criptografia

**Files:**
- Create: `lib/crypto.ts`
- Test: `tests/crypto.test.ts`

**Interfaces:**
- Consumes: nada
- Produces:
  - `type EncryptedField = { ct: Buffer; iv: Buffer; tag: Buffer }`
  - `encrypt(plaintext: string, aad: string): EncryptedField`
  - `decrypt(field: EncryptedField, aad: string): string`
  - `generateKey(): string` (base64 de 32 bytes, usado no setup)

- [ ] **Step 1: Escrever os testes que falham**

`tests/crypto.test.ts`:

```ts
import { beforeAll, describe, expect, it } from 'vitest';

beforeAll(() => {
  // 32 bytes em base64
  process.env.VAULT_KEY = Buffer.alloc(32, 7).toString('base64');
});

describe('crypto', () => {
  it('faz ida e volta preservando o texto', async () => {
    const { encrypt, decrypt } = await import('@/lib/crypto');
    const aad = '11111111-1111-1111-1111-111111111111';
    const field = encrypt('minha-senha-secreta', aad);
    expect(decrypt(field, aad)).toBe('minha-senha-secreta');
  });

  it('nunca reutiliza o IV', async () => {
    const { encrypt } = await import('@/lib/crypto');
    const aad = '11111111-1111-1111-1111-111111111111';
    const a = encrypt('igual', aad);
    const b = encrypt('igual', aad);
    expect(a.iv.equals(b.iv)).toBe(false);
    expect(a.ct.equals(b.ct)).toBe(false);
  });

  it('rejeita ciphertext movido para outro registro (AAD diferente)', async () => {
    const { encrypt, decrypt } = await import('@/lib/crypto');
    const field = encrypt('segredo', 'registro-A');
    expect(() => decrypt(field, 'registro-B')).toThrow();
  });

  it('rejeita ciphertext adulterado', async () => {
    const { encrypt, decrypt } = await import('@/lib/crypto');
    const aad = 'registro-A';
    const field = encrypt('segredo', aad);
    field.ct[0] = field.ct[0] ^ 0xff;
    expect(() => decrypt(field, aad)).toThrow();
  });

  it('gera chave de 32 bytes', async () => {
    const { generateKey } = await import('@/lib/crypto');
    expect(Buffer.from(generateKey(), 'base64')).toHaveLength(32);
  });
});
```

- [ ] **Step 2: Rodar para confirmar a falha**

```bash
npx vitest run tests/crypto.test.ts
```
Esperado: FAIL — `Cannot find module '@/lib/crypto'`.

- [ ] **Step 3: Implementar**

`lib/crypto.ts`:

```ts
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;

export type EncryptedField = { ct: Buffer; iv: Buffer; tag: Buffer };

function key(): Buffer {
  const raw = process.env.VAULT_KEY;
  if (!raw) throw new Error('VAULT_KEY não configurada');
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== 32) throw new Error('VAULT_KEY deve ter 32 bytes em base64');
  return buf;
}

/** Cifra um texto. `aad` deve ser o id do registro, para prender o ciphertext à linha. */
export function encrypt(plaintext: string, aad: string): EncryptedField {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key(), iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return { ct, iv, tag: cipher.getAuthTag() };
}

/** Decifra. Lança se a tag ou o AAD não conferirem. */
export function decrypt(field: EncryptedField, aad: string): string {
  const decipher = createDecipheriv(ALGO, key(), field.iv);
  decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(field.tag);
  return Buffer.concat([decipher.update(field.ct), decipher.final()]).toString('utf8');
}

/** Gera uma VAULT_KEY nova. Usado só no setup, fora do runtime. */
export function generateKey(): string {
  return randomBytes(32).toString('base64');
}
```

- [ ] **Step 4: Rodar os testes**

```bash
npx vitest run tests/crypto.test.ts
```
Esperado: `5 passed`.

- [ ] **Step 5: Commit**

```bash
git add lib/crypto.ts tests/crypto.test.ts
git commit -m "feat: modulo de criptografia AES-256-GCM com AAD por registro

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Schema, migrations e cliente de banco

**Files:**
- Create: `db/migrations/001_init.sql`, `db/migrate.mjs`, `db/seed.mjs`
- Create: `lib/db/client.ts`, `lib/types.ts`

**Interfaces:**
- Consumes: `lib/crypto.ts` (nenhum uso ainda)
- Produces:
  - `sql` — tagged template de `lib/db/client.ts`, ex.: `` await sql`select 1` ``
  - Tipos de `lib/types.ts`: `Role`, `Actor`, `User`, `Room`, `RoomCard`, `CredentialRow`, `AuditAction`
  - `npm run migrate` e `npm run seed`

- [ ] **Step 1: Escrever o schema**

`db/migrations/001_init.sql`:

```sql
create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

create table users (
  id                   uuid primary key default gen_random_uuid(),
  email                text not null unique,
  name                 text not null,
  password_hash        text not null,
  role                 text not null check (role in ('master', 'user')),
  is_active            boolean not null default true,
  must_change_password boolean not null default true,
  failed_attempts      int not null default 0,
  locked_until         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table rooms (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  created_by  uuid not null references users(id),
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table room_members (
  room_id uuid not null references rooms(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  primary key (room_id, user_id)
);

create table credentials (
  id           uuid primary key,
  room_id      uuid not null references rooms(id),
  title        text not null,
  username     text,
  password_ct  bytea not null,
  password_iv  bytea not null,
  password_tag bytea not null,
  url          text,
  notes_ct     bytea,
  notes_iv     bytea,
  notes_tag    bytea,
  key_version  int not null default 1,
  is_global    boolean not null default true,
  owner_id     uuid not null references users(id),
  deleted_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index credentials_room_title_idx on credentials (room_id, title);
create index credentials_owner_idx      on credentials (owner_id);
create index credentials_title_trgm     on credentials using gin (title gin_trgm_ops);
create index credentials_username_trgm  on credentials using gin (username gin_trgm_ops);
create index credentials_url_trgm       on credentials using gin (url gin_trgm_ops);

create table audit_log (
  id          bigserial primary key,
  actor_id    uuid references users(id),
  action      text not null,
  entity_type text,
  entity_id   uuid,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index audit_log_created_idx on audit_log (created_at desc);
create index audit_log_actor_idx   on audit_log (actor_id, created_at desc);
```

- [ ] **Step 2: Escrever o runner de migration**

`db/migrate.mjs`:

```js
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import 'dotenv/config';

const dir = path.join(process.cwd(), 'db', 'migrations');

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada');
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  await client.query(`
    create table if not exists _migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )`);

  const applied = new Set(
    (await client.query('select name from _migrations')).rows.map((r) => r.name),
  );
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`= ${file} (já aplicada)`);
      continue;
    }
    const sqlText = await readFile(path.join(dir, file), 'utf8');
    console.log(`+ aplicando ${file}...`);
    await client.query('begin');
    try {
      await client.query(sqlText);
      await client.query('insert into _migrations (name) values ($1)', [file]);
      await client.query('commit');
      console.log(`  ok`);
    } catch (err) {
      await client.query('rollback');
      throw err;
    }
  }

  await client.end();
  console.log('migrations concluídas');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
```

- [ ] **Step 3: Escrever o seed do usuário master**

`db/seed.mjs`:

```js
import bcrypt from 'bcryptjs';
import pg from 'pg';
import 'dotenv/config';

async function main() {
  const { SEED_MASTER_EMAIL, SEED_MASTER_NAME, SEED_MASTER_PASSWORD } = process.env;
  if (!SEED_MASTER_EMAIL || !SEED_MASTER_NAME || !SEED_MASTER_PASSWORD) {
    throw new Error('Defina SEED_MASTER_EMAIL, SEED_MASTER_NAME e SEED_MASTER_PASSWORD');
  }

  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  const hash = await bcrypt.hash(SEED_MASTER_PASSWORD, 12);
  const res = await client.query(
    `insert into users (email, name, password_hash, role, must_change_password)
     values ($1, $2, $3, 'master', true)
     on conflict (email) do nothing
     returning id`,
    [SEED_MASTER_EMAIL.toLowerCase(), SEED_MASTER_NAME, hash],
  );

  console.log(res.rowCount ? `master criado: ${SEED_MASTER_EMAIL}` : 'master já existia');
  await client.end();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
```

- [ ] **Step 4: Escrever o cliente e os tipos**

`lib/db/client.ts`:

```ts
import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL não configurada');
}

export const sql = neon(process.env.DATABASE_URL);
```

`lib/types.ts`:

```ts
export type Role = 'master' | 'user';

export type Actor = {
  id: string;
  email: string;
  name: string;
  role: Role;
  mustChangePassword: boolean;
};

export type User = {
  id: string;
  email: string;
  name: string;
  role: Role;
  is_active: boolean;
  must_change_password: boolean;
  created_at: string;
};

export type Room = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
};

export type RoomCard = Room & {
  credential_count: number;
  member_count: number;
};

/** Nunca carrega senha em claro. */
export type CredentialRow = {
  id: string;
  room_id: string;
  room_name: string;
  title: string;
  username: string | null;
  url: string | null;
  is_global: boolean;
  owner_id: string;
  owner_name: string;
  updated_at: string;
};

export type AuditAction =
  | 'login_ok' | 'login_fail' | 'logout' | 'password_change'
  | 'view' | 'copy' | 'create' | 'update' | 'delete' | 'restore' | 'purge'
  | 'room_create' | 'room_update' | 'room_delete'
  | 'member_add' | 'member_remove'
  | 'user_create' | 'user_update' | 'user_reset_password';
```

- [ ] **Step 5: Verificar tipagem**

```bash
npx tsc --noEmit
```
Esperado: nenhum erro. (As migrations só serão aplicadas na Task 12, quando as credenciais do Neon existirem.)

- [ ] **Step 6: Commit**

```bash
git add db lib/db/client.ts lib/types.ts
git commit -m "feat: schema inicial, runner de migrations, seed do master e tipos

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Autorização (módulo puro + testes)

**Files:**
- Create: `lib/authz.ts`
- Test: `tests/authz.test.ts`

**Interfaces:**
- Consumes: `Actor`, `Role` de `lib/types.ts`
- Produces:
  - `type CredentialAcl = { id: string; room_id: string; owner_id: string; is_global: boolean; deleted_at: string | null }`
  - `canReadCredential(actor: Actor, c: CredentialAcl, isMember: boolean): boolean`
  - `canEditCredential(actor: Actor, c: CredentialAcl, isMember: boolean): boolean`
  - `canDeleteCredential(actor: Actor, c: CredentialAcl, isMember: boolean): boolean`
  - `canManageRooms(actor: Actor): boolean`
  - `canManageUsers(actor: Actor): boolean`
  - `canViewAudit(actor: Actor): boolean`
  - `NotFoundError` — classe de erro que as rotas traduzem em 404

- [ ] **Step 1: Escrever os testes que falham**

`tests/authz.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  canDeleteCredential, canEditCredential, canManageRooms, canManageUsers,
  canReadCredential, canViewAudit, type CredentialAcl,
} from '@/lib/authz';
import type { Actor } from '@/lib/types';

const master: Actor = { id: 'u-master', email: 'm@x', name: 'M', role: 'master', mustChangePassword: false };
const dono: Actor   = { id: 'u-dono',   email: 'd@x', name: 'D', role: 'user',   mustChangePassword: false };
const membro: Actor = { id: 'u-membro', email: 'b@x', name: 'B', role: 'user',   mustChangePassword: false };
const estranho: Actor = { id: 'u-estranho', email: 'e@x', name: 'E', role: 'user', mustChangePassword: false };

const global_: CredentialAcl = {
  id: 'c1', room_id: 'r1', owner_id: 'u-dono', is_global: true, deleted_at: null,
};
const pessoal: CredentialAcl = {
  id: 'c2', room_id: 'r1', owner_id: 'u-dono', is_global: false, deleted_at: null,
};
const apagada: CredentialAcl = { ...global_, id: 'c3', deleted_at: '2026-01-01T00:00:00Z' };

describe('leitura', () => {
  it('master lê tudo, inclusive pessoal de terceiro', () => {
    expect(canReadCredential(master, global_, false)).toBe(true);
    expect(canReadCredential(master, pessoal, false)).toBe(true);
  });

  it('membro lê a global da sala', () => {
    expect(canReadCredential(membro, global_, true)).toBe(true);
  });

  it('membro NÃO lê a pessoal de outro', () => {
    expect(canReadCredential(membro, pessoal, true)).toBe(false);
  });

  it('dono lê a própria pessoal', () => {
    expect(canReadCredential(dono, pessoal, true)).toBe(true);
  });

  it('estranho à sala não lê nada dela', () => {
    expect(canReadCredential(estranho, global_, false)).toBe(false);
    expect(canReadCredential(estranho, pessoal, false)).toBe(false);
  });

  it('ninguém lê credencial na lixeira, exceto master', () => {
    expect(canReadCredential(membro, apagada, true)).toBe(false);
    expect(canReadCredential(master, apagada, false)).toBe(true);
  });
});

describe('edição', () => {
  it('dono edita a própria global', () => {
    expect(canEditCredential(dono, global_, true)).toBe(true);
  });

  it('master edita global de terceiro', () => {
    expect(canEditCredential(master, global_, false)).toBe(true);
  });

  it('master NÃO edita pessoal de terceiro', () => {
    expect(canEditCredential(master, pessoal, false)).toBe(false);
  });

  it('membro não edita global de outro', () => {
    expect(canEditCredential(membro, global_, true)).toBe(false);
  });
});

describe('remoção', () => {
  it('master apaga qualquer uma, inclusive pessoal de terceiro', () => {
    expect(canDeleteCredential(master, pessoal, false)).toBe(true);
    expect(canDeleteCredential(master, global_, false)).toBe(true);
  });

  it('dono apaga a própria', () => {
    expect(canDeleteCredential(dono, pessoal, true)).toBe(true);
  });

  it('membro não apaga a de outro', () => {
    expect(canDeleteCredential(membro, global_, true)).toBe(false);
  });
});

describe('administração', () => {
  it('só master gerencia salas, usuários e vê auditoria', () => {
    expect(canManageRooms(master)).toBe(true);
    expect(canManageRooms(dono)).toBe(false);
    expect(canManageUsers(master)).toBe(true);
    expect(canManageUsers(dono)).toBe(false);
    expect(canViewAudit(master)).toBe(true);
    expect(canViewAudit(dono)).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar para confirmar a falha**

```bash
npx vitest run tests/authz.test.ts
```
Esperado: FAIL — `Cannot find module '@/lib/authz'`.

- [ ] **Step 3: Implementar**

`lib/authz.ts`:

```ts
import type { Actor } from '@/lib/types';

export type CredentialAcl = {
  id: string;
  room_id: string;
  owner_id: string;
  is_global: boolean;
  deleted_at: string | null;
};

/** Recurso inexistente OU sem permissão. Rotas traduzem em 404, nunca 403. */
export class NotFoundError extends Error {
  constructor(message = 'Não encontrado') {
    super(message);
    this.name = 'NotFoundError';
  }
}

const isMaster = (a: Actor) => a.role === 'master';

export function canReadCredential(actor: Actor, c: CredentialAcl, isMember: boolean): boolean {
  if (isMaster(actor)) return true;
  if (c.deleted_at) return false;
  if (!isMember) return false;
  return c.is_global || c.owner_id === actor.id;
}

/** Master edita globais de terceiros, mas nunca uma senha pessoal alheia. */
export function canEditCredential(actor: Actor, c: CredentialAcl, isMember: boolean): boolean {
  if (c.deleted_at) return false;
  if (c.owner_id === actor.id) return true;
  if (isMaster(actor)) return c.is_global;
  return false;
}

/** Master pode mandar qualquer credencial para a lixeira. */
export function canDeleteCredential(actor: Actor, c: CredentialAcl, isMember: boolean): boolean {
  if (c.deleted_at) return false;
  if (c.owner_id === actor.id) return true;
  return isMaster(actor);
}

export const canManageRooms = (actor: Actor) => isMaster(actor);
export const canManageUsers = (actor: Actor) => isMaster(actor);
export const canViewAudit = (actor: Actor) => isMaster(actor);
export const canUseTrash = (actor: Actor) => isMaster(actor);
```

- [ ] **Step 4: Rodar os testes**

```bash
npx vitest run tests/authz.test.ts
```
Esperado: `16 passed`.

- [ ] **Step 5: Commit**

```bash
git add lib/authz.ts tests/authz.test.ts
git commit -m "feat: modulo puro de autorizacao com matriz de testes

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Autenticação — senha, sessão e guards

**Files:**
- Create: `lib/auth/password.ts`, `lib/auth/session.ts`, `lib/auth/guards.ts`
- Create: `lib/db/users.ts`, `lib/db/audit.ts`
- Test: `tests/session.test.ts`

**Interfaces:**
- Consumes: `sql`, `Actor`, `User`, `AuditAction`
- Produces:
  - `hashPassword(plain: string): Promise<string>` / `verifyPassword(plain, hash): Promise<boolean>`
  - `createSession(userId: string): Promise<void>` (grava o cookie) / `readSession(): Promise<string | null>` (devolve userId) / `destroySession(): Promise<void>`
  - `signToken(userId: string): Promise<string>` / `verifyToken(token: string): Promise<string | null>` — usados nos testes
  - `requireUser(): Promise<Actor>` / `requireMaster(): Promise<Actor>`
  - `findUserByEmail(email)`, `findUserById(id)`, `registerFailedLogin(id)`, `clearFailedLogins(id)`, `setPassword(id, hash)`
  - `audit(entry)` de `lib/db/audit.ts`

- [ ] **Step 1: Escrever o teste do token que falha**

`tests/session.test.ts`:

```ts
import { beforeAll, describe, expect, it } from 'vitest';

beforeAll(() => {
  process.env.SESSION_SECRET = 'segredo-de-teste-com-mais-de-32-caracteres!!';
});

describe('token de sessão', () => {
  it('assina e verifica devolvendo o userId', async () => {
    const { signToken, verifyToken } = await import('@/lib/auth/session');
    const token = await signToken('u-1');
    expect(await verifyToken(token)).toBe('u-1');
  });

  it('rejeita token adulterado', async () => {
    const { signToken, verifyToken } = await import('@/lib/auth/session');
    const token = await signToken('u-1');
    expect(await verifyToken(token.slice(0, -3) + 'aaa')).toBeNull();
  });

  it('rejeita lixo', async () => {
    const { verifyToken } = await import('@/lib/auth/session');
    expect(await verifyToken('nao-e-um-jwt')).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar para confirmar a falha**

```bash
npx vitest run tests/session.test.ts
```
Esperado: FAIL — `Cannot find module '@/lib/auth/session'`.

- [ ] **Step 3: Implementar senha e sessão**

`lib/auth/password.ts`:

```ts
import bcrypt from 'bcryptjs';

const COST = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
```

`lib/auth/session.ts`:

```ts
import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';

const COOKIE = 'cofre_session';
const MAX_AGE_SECONDS = 8 * 60 * 60;

function secret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error('SESSION_SECRET não configurada');
  return new TextEncoder().encode(s);
}

export async function signToken(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret());
}

export async function verifyToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ['HS256'] });
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

export async function createSession(userId: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE, await signToken(userId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function readSession(): Promise<string | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  return token ? verifyToken(token) : null;
}

export async function destroySession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}
```

- [ ] **Step 4: Rodar o teste de sessão**

```bash
npx vitest run tests/session.test.ts
```
Esperado: `3 passed`.

- [ ] **Step 5: Implementar as queries de usuário e o audit**

`lib/db/users.ts`:

```ts
import { sql } from '@/lib/db/client';
import type { Role, User } from '@/lib/types';

type UserRow = User & {
  password_hash: string;
  failed_attempts: number;
  locked_until: string | null;
};

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const rows = (await sql`
    select * from users where email = ${email.toLowerCase()}
  `) as UserRow[];
  return rows[0] ?? null;
}

export async function findUserById(id: string): Promise<UserRow | null> {
  const rows = (await sql`select * from users where id = ${id}`) as UserRow[];
  return rows[0] ?? null;
}

export async function listUsers(): Promise<User[]> {
  return (await sql`
    select id, email, name, role, is_active, must_change_password, created_at
    from users order by name
  `) as User[];
}

export async function registerFailedLogin(id: string): Promise<void> {
  await sql`
    update users
       set failed_attempts = failed_attempts + 1,
           locked_until = case when failed_attempts + 1 >= 5
                               then now() + interval '15 minutes' else locked_until end,
           updated_at = now()
     where id = ${id}`;
}

export async function clearFailedLogins(id: string): Promise<void> {
  await sql`
    update users set failed_attempts = 0, locked_until = null, updated_at = now()
     where id = ${id}`;
}

export async function setPassword(id: string, hash: string, mustChange: boolean): Promise<void> {
  await sql`
    update users
       set password_hash = ${hash}, must_change_password = ${mustChange},
           failed_attempts = 0, locked_until = null, updated_at = now()
     where id = ${id}`;
}

export async function createUser(
  email: string, name: string, hash: string, role: Role,
): Promise<string> {
  const rows = (await sql`
    insert into users (email, name, password_hash, role, must_change_password)
    values (${email.toLowerCase()}, ${name}, ${hash}, ${role}, true)
    returning id`) as { id: string }[];
  return rows[0].id;
}

export async function updateUser(
  id: string, name: string, role: Role, isActive: boolean,
): Promise<void> {
  await sql`
    update users set name = ${name}, role = ${role}, is_active = ${isActive}, updated_at = now()
     where id = ${id}`;
}
```

`lib/db/audit.ts`:

```ts
import { sql } from '@/lib/db/client';
import type { AuditAction } from '@/lib/types';

type Entry = {
  actorId: string | null;
  action: AuditAction;
  entityType?: 'credential' | 'room' | 'user';
  entityId?: string | null;
  metadata?: Record<string, unknown>;
};

/** Nunca receba senha em claro no metadata. */
export async function audit(e: Entry): Promise<void> {
  await sql`
    insert into audit_log (actor_id, action, entity_type, entity_id, metadata)
    values (${e.actorId}, ${e.action}, ${e.entityType ?? null}, ${e.entityId ?? null},
            ${JSON.stringify(e.metadata ?? {})}::jsonb)`;
}

export type AuditRow = {
  id: string;
  actor_name: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export async function listAudit(limit = 200, action?: string): Promise<AuditRow[]> {
  if (action) {
    return (await sql`
      select a.id, u.name as actor_name, a.action, a.entity_type, a.entity_id,
             a.metadata, a.created_at
        from audit_log a left join users u on u.id = a.actor_id
       where a.action = ${action}
       order by a.created_at desc limit ${limit}`) as AuditRow[];
  }
  return (await sql`
    select a.id, u.name as actor_name, a.action, a.entity_type, a.entity_id,
           a.metadata, a.created_at
      from audit_log a left join users u on u.id = a.actor_id
     order by a.created_at desc limit ${limit}`) as AuditRow[];
}
```

- [ ] **Step 6: Implementar os guards**

`lib/auth/guards.ts`:

```ts
import { redirect } from 'next/navigation';
import { notFound } from 'next/navigation';
import { readSession } from '@/lib/auth/session';
import { findUserById } from '@/lib/db/users';
import type { Actor } from '@/lib/types';

/**
 * Valida o cookie e carrega o usuário do banco a cada request — assim
 * desativar um usuário ou rebaixar seu papel tem efeito imediato.
 */
export async function requireUser(): Promise<Actor> {
  const userId = await readSession();
  if (!userId) redirect('/login');

  const user = await findUserById(userId);
  if (!user || !user.is_active) redirect('/login');

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    mustChangePassword: user.must_change_password,
  };
}

/** Usuário autenticado que já trocou a senha inicial. */
export async function requireReadyUser(): Promise<Actor> {
  const actor = await requireUser();
  if (actor.mustChangePassword) redirect('/trocar-senha');
  return actor;
}

/** Barreira real do /admin. Esconder o menu na UI é apenas cosmético. */
export async function requireMaster(): Promise<Actor> {
  const actor = await requireReadyUser();
  if (actor.role !== 'master') notFound();
  return actor;
}
```

- [ ] **Step 7: Verificar tipagem e rodar toda a suíte**

```bash
npx tsc --noEmit && npm test
```
Esperado: sem erros de tipo; `9 passed` no total (smoke 1, crypto 5, authz 16, session 3 → o total exato depende dos testes; nenhum deve falhar).

- [ ] **Step 8: Commit**

```bash
git add lib/auth lib/db/users.ts lib/db/audit.ts tests/session.test.ts
git commit -m "feat: autenticacao com bcrypt, sessao JWT em cookie e guards de rota

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Telas de login e troca de senha

**Files:**
- Create: `app/login/page.tsx`, `app/login/actions.ts`
- Create: `app/trocar-senha/page.tsx`, `app/trocar-senha/actions.ts`
- Create: `components/Nav.tsx`
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: `hashPassword`, `verifyPassword`, `createSession`, `destroySession`, `requireUser`, `findUserByEmail`, `registerFailedLogin`, `clearFailedLogins`, `setPassword`, `audit`
- Produces:
  - `login(prevState, formData): Promise<{ error?: string }>`
  - `logout(): Promise<void>`
  - `changePassword(prevState, formData): Promise<{ error?: string }>`
  - `<Nav actor={actor} />` — barra superior; o item Admin só renderiza para `role === 'master'`

- [ ] **Step 1: Escrever a Server Action de login**

`app/login/actions.ts`:

```ts
'use server';

import { redirect } from 'next/navigation';
import { createSession, destroySession } from '@/lib/auth/session';
import { verifyPassword } from '@/lib/auth/password';
import { audit } from '@/lib/db/audit';
import {
  clearFailedLogins, findUserByEmail, registerFailedLogin,
} from '@/lib/db/users';

export type LoginState = { error?: string };

const GENERICO = 'E-mail ou senha inválidos.';

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim();
  const senha = String(formData.get('senha') ?? '');

  if (!email || !senha) return { error: 'Preencha e-mail e senha.' };

  const user = await findUserByEmail(email);
  if (!user || !user.is_active) {
    await audit({ actorId: null, action: 'login_fail', metadata: { email } });
    return { error: GENERICO };
  }

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    return { error: 'Conta temporariamente bloqueada. Tente novamente em 15 minutos.' };
  }

  if (!(await verifyPassword(senha, user.password_hash))) {
    await registerFailedLogin(user.id);
    await audit({ actorId: user.id, action: 'login_fail', entityType: 'user', entityId: user.id });
    return { error: GENERICO };
  }

  await clearFailedLogins(user.id);
  await createSession(user.id);
  await audit({ actorId: user.id, action: 'login_ok', entityType: 'user', entityId: user.id });

  redirect(user.must_change_password ? '/trocar-senha' : '/');
}

/** Recebe FormData porque é usada direto como `action` de um <form>. */
export async function logout(_formData: FormData): Promise<void> {
  await destroySession();
  redirect('/login');
}
```

- [ ] **Step 2: Escrever a tela de login**

`app/login/page.tsx`:

```tsx
'use client';

import { useActionState } from 'react';
import { login, type LoginState } from './actions';

const inicial: LoginState = {};

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, inicial);

  return (
    <main className="min-h-dvh grid place-items-center p-6">
      <form action={action} className="glass w-full max-w-sm p-8 space-y-5">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Cofre de Senhas</h1>
          <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
            Entre com suas credenciais
          </p>
        </div>

        <label className="block space-y-1">
          <span className="text-sm">E-mail</span>
          <input name="email" type="email" autoComplete="username" className="input" required />
        </label>

        <label className="block space-y-1">
          <span className="text-sm">Senha</span>
          <input
            name="senha" type="password" autoComplete="current-password"
            className="input" required
          />
        </label>

        {state.error && (
          <p className="text-sm" style={{ color: 'var(--danger)' }} role="alert">
            {state.error}
          </p>
        )}

        <button type="submit" className="btn btn-primary w-full" disabled={pending}>
          {pending ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 3: Escrever a troca forçada de senha**

`app/trocar-senha/actions.ts`:

```ts
'use server';

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/guards';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { audit } from '@/lib/db/audit';
import { findUserById, setPassword } from '@/lib/db/users';

export type ChangeState = { error?: string };

export async function changePassword(
  _prev: ChangeState, formData: FormData,
): Promise<ChangeState> {
  const actor = await requireUser();
  const atual = String(formData.get('atual') ?? '');
  const nova = String(formData.get('nova') ?? '');
  const confirma = String(formData.get('confirma') ?? '');

  if (nova.length < 10) return { error: 'A nova senha precisa ter ao menos 10 caracteres.' };
  if (nova !== confirma) return { error: 'A confirmação não confere com a nova senha.' };

  const user = await findUserById(actor.id);
  if (!user || !(await verifyPassword(atual, user.password_hash))) {
    return { error: 'Senha atual incorreta.' };
  }

  await setPassword(actor.id, await hashPassword(nova), false);
  await audit({
    actorId: actor.id, action: 'password_change', entityType: 'user', entityId: actor.id,
  });

  redirect('/');
}
```

`app/trocar-senha/page.tsx`:

```tsx
'use client';

import { useActionState } from 'react';
import { changePassword, type ChangeState } from './actions';

const inicial: ChangeState = {};

export default function TrocarSenhaPage() {
  const [state, action, pending] = useActionState(changePassword, inicial);

  return (
    <main className="min-h-dvh grid place-items-center p-6">
      <form action={action} className="glass w-full max-w-sm p-8 space-y-5">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Defina sua senha</h1>
          <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
            Escolha uma senha nova para continuar.
          </p>
        </div>

        <label className="block space-y-1">
          <span className="text-sm">Senha atual</span>
          <input name="atual" type="password" className="input" required />
        </label>
        <label className="block space-y-1">
          <span className="text-sm">Nova senha</span>
          <input name="nova" type="password" className="input" required minLength={10} />
        </label>
        <label className="block space-y-1">
          <span className="text-sm">Confirme a nova senha</span>
          <input name="confirma" type="password" className="input" required minLength={10} />
        </label>

        {state.error && (
          <p className="text-sm" style={{ color: 'var(--danger)' }} role="alert">
            {state.error}
          </p>
        )}

        <button type="submit" className="btn btn-primary w-full" disabled={pending}>
          {pending ? 'Salvando...' : 'Salvar senha'}
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 4: Escrever a navegação**

`components/Nav.tsx`:

```tsx
import Link from 'next/link';
import { logout } from '@/app/login/actions';
import type { Actor } from '@/lib/types';

export function Nav({ actor }: { actor: Actor }) {
  return (
    <header className="glass mx-4 mt-4 px-5 py-3 flex items-center gap-4">
      <Link href="/" className="font-semibold">🔐 Cofre</Link>
      <nav className="flex items-center gap-3 text-sm" style={{ color: 'var(--text-dim)' }}>
        <Link href="/">Salas</Link>
        {actor.role === 'master' && (
          <>
            <Link href="/admin/usuarios">Usuários</Link>
            <Link href="/admin/salas">Salas (admin)</Link>
            <Link href="/admin/auditoria">Auditoria</Link>
            <Link href="/admin/lixeira">Lixeira</Link>
          </>
        )}
      </nav>
      <div className="ml-auto flex items-center gap-3 text-sm">
        <span style={{ color: 'var(--text-dim)' }}>{actor.name}</span>
        <form action={logout}>
          <button className="btn" type="submit">Sair</button>
        </form>
      </div>
    </header>
  );
}
```

- [ ] **Step 5: Verificar o build**

```bash
npx tsc --noEmit && npm run build
```
Esperado: build conclui sem erro.

- [ ] **Step 6: Commit**

```bash
git add app/login app/trocar-senha components/Nav.tsx
git commit -m "feat: telas de login e troca forcada de senha, navegacao

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Camada de queries de salas e credenciais

**Files:**
- Create: `lib/db/queries.ts`

**Interfaces:**
- Consumes: `sql`, `Actor`, `RoomCard`, `CredentialRow`, `CredentialAcl`, `NotFoundError`, `encrypt`, `decrypt`
- Produces:
  - `listRoomsForActor(actor): Promise<RoomCard[]>`
  - `getRoomForActor(actor, roomId): Promise<Room>` — lança `NotFoundError`
  - `listCredentials(actor, roomId, termo?): Promise<CredentialRow[]>`
  - `searchAllCredentials(actor, termo): Promise<CredentialRow[]>`
  - `listPersonalCredentials(actor): Promise<CredentialRow[]>`
  - `getCredentialAcl(actor, id): Promise<{ acl: CredentialAcl; isMember: boolean }>`
  - `revealPassword(actor, id): Promise<string>`
  - `insertCredential(actor, input): Promise<string>`
  - `updateCredential(actor, id, input): Promise<void>`
  - `softDeleteCredential(actor, id): Promise<void>`
  - `type CredentialInput = { roomId: string; title: string; username: string; password: string; url: string; notes: string; isGlobal: boolean }`

- [ ] **Step 1: Implementar leitura**

`lib/db/queries.ts` (primeira metade):

```ts
import { randomUUID } from 'node:crypto';
import { sql } from '@/lib/db/client';
import { decrypt, encrypt } from '@/lib/crypto';
import {
  canDeleteCredential, canEditCredential, canReadCredential,
  NotFoundError, type CredentialAcl,
} from '@/lib/authz';
import type { Actor, CredentialRow, Room, RoomCard } from '@/lib/types';

/** Salas visíveis: todas para o master, apenas as de que é membro para os demais. */
export async function listRoomsForActor(actor: Actor): Promise<RoomCard[]> {
  const visibilidade = actor.role === 'master' ? null : actor.id;
  return (await sql`
    select r.id, r.name, r.description, r.created_at,
           (select count(*) from credentials c
             where c.room_id = r.id and c.deleted_at is null
               and (${actor.role} = 'master' or c.is_global or c.owner_id = ${actor.id})
           )::int as credential_count,
           (select count(*) from room_members m where m.room_id = r.id)::int as member_count
      from rooms r
     where r.deleted_at is null
       and (${visibilidade}::uuid is null
            or exists (select 1 from room_members m
                        where m.room_id = r.id and m.user_id = ${visibilidade}))
     order by r.name`) as RoomCard[];
}

export async function getRoomForActor(actor: Actor, roomId: string): Promise<Room> {
  const visibilidade = actor.role === 'master' ? null : actor.id;
  const rows = (await sql`
    select r.id, r.name, r.description, r.created_at
      from rooms r
     where r.id = ${roomId} and r.deleted_at is null
       and (${visibilidade}::uuid is null
            or exists (select 1 from room_members m
                        where m.room_id = r.id and m.user_id = ${visibilidade}))`) as Room[];
  if (!rows[0]) throw new NotFoundError('Sala não encontrada');
  return rows[0];
}

export async function isRoomMember(userId: string, roomId: string): Promise<boolean> {
  const rows = (await sql`
    select 1 from room_members where room_id = ${roomId} and user_id = ${userId}`) as unknown[];
  return rows.length > 0;
}

/** Credenciais de uma sala, já filtradas por permissão. `termo` filtra título/usuário/url. */
export async function listCredentials(
  actor: Actor, roomId: string, termo = '',
): Promise<CredentialRow[]> {
  await getRoomForActor(actor, roomId); // 404 se a sala não é visível
  const like = `%${termo.trim()}%`;
  return (await sql`
    select c.id, c.room_id, r.name as room_name, c.title, c.username, c.url,
           c.is_global, c.owner_id, u.name as owner_name, c.updated_at
      from credentials c
      join rooms r on r.id = c.room_id
      join users u on u.id = c.owner_id
     where c.room_id = ${roomId}
       and c.deleted_at is null
       and (${actor.role} = 'master' or c.is_global or c.owner_id = ${actor.id})
       and (${termo.trim()} = '' or c.title ilike ${like}
            or c.username ilike ${like} or c.url ilike ${like})
     order by c.title`) as CredentialRow[];
}

/** Busca global da home: tudo que o ator pode ver, em qualquer sala. */
export async function searchAllCredentials(
  actor: Actor, termo: string,
): Promise<CredentialRow[]> {
  const t = termo.trim();
  if (!t) return [];
  const like = `%${t}%`;
  return (await sql`
    select c.id, c.room_id, r.name as room_name, c.title, c.username, c.url,
           c.is_global, c.owner_id, u.name as owner_name, c.updated_at
      from credentials c
      join rooms r on r.id = c.room_id
      join users u on u.id = c.owner_id
     where c.deleted_at is null and r.deleted_at is null
       and (${actor.role} = 'master'
            or (exists (select 1 from room_members m
                         where m.room_id = c.room_id and m.user_id = ${actor.id})
                and (c.is_global or c.owner_id = ${actor.id})))
       and (c.title ilike ${like} or c.username ilike ${like} or c.url ilike ${like})
     order by c.title limit 50`) as CredentialRow[];
}

/** Card "Minhas senhas": as pessoais do próprio ator, de todas as salas. */
export async function listPersonalCredentials(actor: Actor): Promise<CredentialRow[]> {
  return (await sql`
    select c.id, c.room_id, r.name as room_name, c.title, c.username, c.url,
           c.is_global, c.owner_id, u.name as owner_name, c.updated_at
      from credentials c
      join rooms r on r.id = c.room_id
      join users u on u.id = c.owner_id
     where c.deleted_at is null and c.owner_id = ${actor.id} and c.is_global = false
     order by c.title`) as CredentialRow[];
}
```

- [ ] **Step 2: Implementar ACL, revelação e escrita**

`lib/db/queries.ts` (segunda metade, anexar ao arquivo):

```ts
type CredentialSecret = CredentialAcl & {
  password_ct: Buffer; password_iv: Buffer; password_tag: Buffer;
};

async function loadForActor(
  actor: Actor, id: string,
): Promise<{ row: CredentialSecret; isMember: boolean }> {
  const rows = (await sql`
    select id, room_id, owner_id, is_global, deleted_at,
           password_ct, password_iv, password_tag
      from credentials where id = ${id}`) as CredentialSecret[];
  const row = rows[0];
  if (!row) throw new NotFoundError('Credencial não encontrada');
  const isMember = await isRoomMember(actor.id, row.room_id);
  return { row, isMember };
}

export async function getCredentialAcl(
  actor: Actor, id: string,
): Promise<{ acl: CredentialAcl; isMember: boolean }> {
  const { row, isMember } = await loadForActor(actor, id);
  if (!canReadCredential(actor, row, isMember)) throw new NotFoundError();
  const { password_ct, password_iv, password_tag, ...acl } = row;
  return { acl, isMember };
}

/** Único caminho pelo qual uma senha em claro sai do banco. */
export async function revealPassword(actor: Actor, id: string): Promise<string> {
  const { row, isMember } = await loadForActor(actor, id);
  if (!canReadCredential(actor, row, isMember)) throw new NotFoundError();
  return decrypt(
    { ct: Buffer.from(row.password_ct), iv: Buffer.from(row.password_iv), tag: Buffer.from(row.password_tag) },
    row.id,
  );
}

export type CredentialInput = {
  roomId: string;
  title: string;
  username: string;
  password: string;
  url: string;
  notes: string;
  isGlobal: boolean;
};

export async function insertCredential(actor: Actor, input: CredentialInput): Promise<string> {
  // Qualquer membro da sala pode criar. Master também.
  if (actor.role !== 'master' && !(await isRoomMember(actor.id, input.roomId))) {
    throw new NotFoundError('Sala não encontrada');
  }
  const id = randomUUID();
  const senha = encrypt(input.password, id);
  const notas = input.notes ? encrypt(input.notes, id) : null;

  await sql`
    insert into credentials (
      id, room_id, title, username, password_ct, password_iv, password_tag,
      url, notes_ct, notes_iv, notes_tag, is_global, owner_id)
    values (
      ${id}, ${input.roomId}, ${input.title}, ${input.username || null},
      ${senha.ct}, ${senha.iv}, ${senha.tag},
      ${input.url || null}, ${notas?.ct ?? null}, ${notas?.iv ?? null}, ${notas?.tag ?? null},
      ${input.isGlobal}, ${actor.id})`;
  return id;
}

/** Senha em branco no formulário significa "manter a senha atual". */
export async function updateCredential(
  actor: Actor, id: string, input: CredentialInput,
): Promise<void> {
  const { row, isMember } = await loadForActor(actor, id);
  if (!canEditCredential(actor, row, isMember)) throw new NotFoundError();

  const notas = input.notes ? encrypt(input.notes, id) : null;

  if (input.password) {
    const senha = encrypt(input.password, id);
    await sql`
      update credentials
         set title = ${input.title}, username = ${input.username || null},
             url = ${input.url || null}, is_global = ${input.isGlobal},
             password_ct = ${senha.ct}, password_iv = ${senha.iv}, password_tag = ${senha.tag},
             notes_ct = ${notas?.ct ?? null}, notes_iv = ${notas?.iv ?? null},
             notes_tag = ${notas?.tag ?? null}, updated_at = now()
       where id = ${id}`;
    return;
  }

  await sql`
    update credentials
       set title = ${input.title}, username = ${input.username || null},
           url = ${input.url || null}, is_global = ${input.isGlobal},
           notes_ct = ${notas?.ct ?? null}, notes_iv = ${notas?.iv ?? null},
           notes_tag = ${notas?.tag ?? null}, updated_at = now()
     where id = ${id}`;
}

export async function softDeleteCredential(actor: Actor, id: string): Promise<void> {
  const { row, isMember } = await loadForActor(actor, id);
  if (!canDeleteCredential(actor, row, isMember)) throw new NotFoundError();
  await sql`update credentials set deleted_at = now() where id = ${id}`;
}
```

- [ ] **Step 3: Verificar tipagem**

```bash
npx tsc --noEmit
```
Esperado: nenhum erro.

- [ ] **Step 4: Commit**

```bash
git add lib/db/queries.ts
git commit -m "feat: camada de queries de salas e credenciais com autorizacao aplicada

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Home — cards de salas e busca global

**Files:**
- Create: `components/RoomCard.tsx`, `components/SearchBox.tsx`
- Modify: `app/page.tsx` (substituir o placeholder da Task 1)

**Interfaces:**
- Consumes: `requireReadyUser`, `listRoomsForActor`, `searchAllCredentials`, `Nav`
- Produces:
  - `<RoomCard room={roomCard} />`
  - `<SearchBox placeholder param />` — escreve o termo na query string com debounce de 250 ms
  - Home renderizando a grade de salas, o card "Minhas senhas" e os resultados da busca global

- [ ] **Step 1: Escrever a busca com debounce**

`components/SearchBox.tsx`:

```tsx
'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

export function SearchBox({ placeholder, param = 'q' }: { placeholder: string; param?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [valor, setValor] = useState(params.get(param) ?? '');

  useEffect(() => {
    const t = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (valor) next.set(param, valor);
      else next.delete(param);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor]);

  return (
    <input
      className="input"
      type="search"
      placeholder={placeholder}
      value={valor}
      onChange={(e) => setValor(e.target.value)}
      aria-label={placeholder}
    />
  );
}
```

- [ ] **Step 2: Escrever o card de sala**

`components/RoomCard.tsx`:

```tsx
import Link from 'next/link';
import type { RoomCard as RoomCardData } from '@/lib/types';

export function RoomCard({ room }: { room: RoomCardData }) {
  return (
    <Link href={`/sala/${room.id}`} className="glass glass-hover p-5 block transition-colors">
      <h3 className="font-semibold text-lg">{room.name}</h3>
      {room.description && (
        <p className="text-sm mt-1 line-clamp-2" style={{ color: 'var(--text-dim)' }}>
          {room.description}
        </p>
      )}
      <p className="text-xs mt-4" style={{ color: 'var(--text-dim)' }}>
        {room.credential_count} senha{room.credential_count === 1 ? '' : 's'} ·{' '}
        {room.member_count} membro{room.member_count === 1 ? '' : 's'}
      </p>
    </Link>
  );
}

export function PersonalCard({ count }: { count: number }) {
  return (
    <Link href="/sala/minhas" className="glass glass-hover p-5 block transition-colors">
      <h3 className="font-semibold text-lg">👤 Minhas senhas</h3>
      <p className="text-sm mt-1" style={{ color: 'var(--text-dim)' }}>
        Suas senhas pessoais de todas as salas
      </p>
      <p className="text-xs mt-4" style={{ color: 'var(--text-dim)' }}>
        {count} senha{count === 1 ? '' : 's'}
      </p>
    </Link>
  );
}
```

- [ ] **Step 3: Escrever a home**

`app/page.tsx` (substitui o conteúdo da Task 1):

```tsx
import { Nav } from '@/components/Nav';
import { PersonalCard, RoomCard } from '@/components/RoomCard';
import { SearchBox } from '@/components/SearchBox';
import { CredentialRowItem } from '@/components/CredentialRow';
import { requireReadyUser } from '@/lib/auth/guards';
import {
  listPersonalCredentials, listRoomsForActor, searchAllCredentials,
} from '@/lib/db/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const actor = await requireReadyUser();
  const { q = '' } = await searchParams;

  const [salas, pessoais, resultados] = await Promise.all([
    listRoomsForActor(actor),
    listPersonalCredentials(actor),
    q ? searchAllCredentials(actor, q) : Promise.resolve([]),
  ]);

  return (
    <>
      <Nav actor={actor} />
      <main className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
        <SearchBox placeholder="Buscar em todas as senhas..." />

        {q ? (
          <section className="space-y-2">
            <h2 className="text-sm" style={{ color: 'var(--text-dim)' }}>
              {resultados.length} resultado{resultados.length === 1 ? '' : 's'} para “{q}”
            </h2>
            <div className="surface divide-y" style={{ borderColor: 'var(--border)' }}>
              {resultados.map((c) => (
                <CredentialRowItem key={c.id} cred={c} actorId={actor.id} isMaster={actor.role === 'master'} showRoom />
              ))}
              {resultados.length === 0 && (
                <p className="p-6 text-center text-sm" style={{ color: 'var(--text-dim)' }}>
                  Nada encontrado.
                </p>
              )}
            </div>
          </section>
        ) : (
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <PersonalCard count={pessoais.length} />
            {salas.map((sala) => (
              <RoomCard key={sala.id} room={sala} />
            ))}
            {salas.length === 0 && (
              <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
                Você ainda não tem acesso a nenhuma sala. Peça ao administrador.
              </p>
            )}
          </section>
        )}
      </main>
    </>
  );
}
```

- [ ] **Step 4: Verificar o build**

```bash
npx tsc --noEmit
```
Esperado: um erro apontando que `@/components/CredentialRow` não existe — ele é criado na Task 9. Seguir para a Task 9 e só então commitar as duas juntas se preferir; para commitar agora, criar o componente na Task 9 primeiro.

- [ ] **Step 5: Commit (após a Task 9 compilar)**

```bash
git add app/page.tsx components/RoomCard.tsx components/SearchBox.tsx
git commit -m "feat: home com cards de salas em vidro e busca global

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Tela da sala, linha de credencial, revelar e copiar

**Files:**
- Create: `components/CredentialRow.tsx`
- Create: `app/credenciais/actions.ts`
- Create: `app/sala/[id]/page.tsx`

**Interfaces:**
- Consumes: `listCredentials`, `listPersonalCredentials`, `getRoomForActor`, `revealPassword`, `softDeleteCredential`, `audit`, `requireReadyUser`
- Produces:
  - `revealCredential(id: string): Promise<{ password?: string; error?: string }>`
  - `copyCredential(id: string): Promise<{ password?: string; error?: string }>` (mesma leitura, audit `copy`)
  - `deleteCredential(id: string): Promise<{ error?: string }>`
  - `<CredentialRowItem cred actorId isMaster showRoom? />`

- [ ] **Step 1: Escrever as Server Actions**

`app/credenciais/actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { requireReadyUser } from '@/lib/auth/guards';
import { NotFoundError } from '@/lib/authz';
import { audit } from '@/lib/db/audit';
import { revealPassword, softDeleteCredential } from '@/lib/db/queries';

export type RevealResult = { password?: string; error?: string };

async function ler(id: string, acao: 'view' | 'copy'): Promise<RevealResult> {
  try {
    const actor = await requireReadyUser();
    const password = await revealPassword(actor, id);
    await audit({ actorId: actor.id, action: acao, entityType: 'credential', entityId: id });
    return { password };
  } catch (err) {
    if (err instanceof NotFoundError) return { error: 'Credencial não encontrada.' };
    throw err;
  }
}

export async function revealCredential(id: string): Promise<RevealResult> {
  return ler(id, 'view');
}

export async function copyCredential(id: string): Promise<RevealResult> {
  return ler(id, 'copy');
}

export async function deleteCredential(id: string): Promise<{ error?: string }> {
  try {
    const actor = await requireReadyUser();
    await softDeleteCredential(actor, id);
    await audit({ actorId: actor.id, action: 'delete', entityType: 'credential', entityId: id });
    revalidatePath('/', 'layout');
    return {};
  } catch (err) {
    if (err instanceof NotFoundError) return { error: 'Credencial não encontrada.' };
    throw err;
  }
}
```

- [ ] **Step 2: Escrever a linha da credencial**

`components/CredentialRow.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { copyCredential, deleteCredential, revealCredential } from '@/app/credenciais/actions';
import type { CredentialRow } from '@/lib/types';

const SEGUNDOS_VISIVEL = 30;

export function CredentialRowItem({
  cred, actorId, isMaster, showRoom = false,
}: {
  cred: CredentialRow;
  actorId: string;
  isMaster: boolean;
  showRoom?: boolean;
}) {
  const [senha, setSenha] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A senha em claro nunca fica na tela: some sozinha após 30s.
  useEffect(() => {
    if (!senha) return;
    const t = setTimeout(() => setSenha(null), SEGUNDOS_VISIVEL * 1000);
    return () => clearTimeout(t);
  }, [senha]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function aoRevelar() {
    if (senha) { setSenha(null); return; }
    const r = await revealCredential(cred.id);
    if (r.error) setAviso(r.error);
    else setSenha(r.password ?? '');
  }

  async function copiar(texto: string, rotulo: string) {
    await navigator.clipboard.writeText(texto);
    setAviso(`${rotulo} copiado — a área de transferência será limpa em ${SEGUNDOS_VISIVEL}s.`);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try { await navigator.clipboard.writeText(''); } catch { /* aba sem foco */ }
      setAviso(null);
    }, SEGUNDOS_VISIVEL * 1000);
  }

  async function copiarSenha() {
    const r = await copyCredential(cred.id);
    if (r.error) { setAviso(r.error); return; }
    await copiar(r.password ?? '', 'Senha');
  }

  async function apagar() {
    if (!confirm(`Mover “${cred.title}” para a lixeira?`)) return;
    const r = await deleteCredential(cred.id);
    if (r.error) setAviso(r.error);
  }

  const podeEditar = cred.owner_id === actorId || (isMaster && cred.is_global);
  const podeApagar = cred.owner_id === actorId || isMaster;

  return (
    <div className="p-4 flex flex-wrap items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium truncate">{cred.title}</span>
          <span className="badge">{cred.is_global ? 'global' : 'pessoal'}</span>
          {showRoom && <span className="badge">{cred.room_name}</span>}
        </div>
        <div className="text-sm mt-1 flex items-center gap-3 flex-wrap"
             style={{ color: 'var(--text-dim)' }}>
          <span className="truncate">{cred.username || '—'}</span>
          <code className="font-mono">{senha ?? '••••••••'}</code>
        </div>
        {aviso && <p className="text-xs mt-1" style={{ color: 'var(--ok)' }}>{aviso}</p>}
      </div>

      <div className="flex items-center gap-1">
        <button className="btn" onClick={aoRevelar}
                title={senha ? 'Ocultar senha' : 'Revelar senha'}
                aria-label={senha ? 'Ocultar senha' : 'Revelar senha'}>
          {senha ? '🙈' : '👁'}
        </button>
        {cred.username && (
          <button className="btn" onClick={() => copiar(cred.username!, 'Usuário')}
                  title="Copiar usuário" aria-label="Copiar usuário">👤</button>
        )}
        <button className="btn" onClick={copiarSenha}
                title="Copiar senha" aria-label="Copiar senha">📋</button>
        {cred.url && (
          <a className="btn" href={cred.url} target="_blank" rel="noopener noreferrer"
             title="Abrir site" aria-label="Abrir site">🔗</a>
        )}
        {podeEditar && (
          <Link className="btn" href={`/sala/${cred.room_id}?editar=${cred.id}`}
                title="Editar" aria-label="Editar">✏️</Link>
        )}
        {podeApagar && (
          <button className="btn btn-danger" onClick={apagar}
                  title="Mover para a lixeira" aria-label="Mover para a lixeira">🗑</button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Escrever a página da sala**

`app/sala/[id]/page.tsx`:

```tsx
import Link from 'next/link';
import { Nav } from '@/components/Nav';
import { CredentialRowItem } from '@/components/CredentialRow';
import { SearchBox } from '@/components/SearchBox';
import { CredentialForm } from '@/components/CredentialForm';
import { requireReadyUser } from '@/lib/auth/guards';
import {
  getRoomForActor, listCredentials, listPersonalCredentials, listRoomsForActor,
} from '@/lib/db/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function SalaPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; nova?: string; editar?: string }>;
}) {
  const actor = await requireReadyUser();
  const { id } = await params;
  const { q = '', nova, editar } = await searchParams;

  const pessoal = id === 'minhas';
  const sala = pessoal ? null : await getRoomForActor(actor, id);
  const todas = pessoal
    ? await listPersonalCredentials(actor)
    : await listCredentials(actor, id, q);
  const creds = pessoal && q
    ? todas.filter((c) =>
        [c.title, c.username, c.url].some((v) => v?.toLowerCase().includes(q.toLowerCase())))
    : todas;

  const salasDoUsuario = await listRoomsForActor(actor);
  const emEdicao = editar ? creds.find((c) => c.id === editar) ?? null : null;

  return (
    <>
      <Nav actor={actor} />
      <main className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">
        <div className="flex items-center gap-3 flex-wrap">
          <Link href="/" className="btn">←</Link>
          <h1 className="text-xl font-semibold">
            {pessoal ? '👤 Minhas senhas' : sala!.name}
          </h1>
          {!pessoal && (
            <Link href={`/sala/${id}?nova=1`} className="btn btn-primary ml-auto">
              + Nova senha
            </Link>
          )}
        </div>

        <SearchBox placeholder="Buscar nesta lista..." />

        {(nova || emEdicao) && (
          <CredentialForm
            salas={salasDoUsuario.map((s) => ({ id: s.id, name: s.name }))}
            salaPadrao={pessoal ? salasDoUsuario[0]?.id ?? '' : id}
            credencial={emEdicao}
            voltarPara={`/sala/${id}`}
          />
        )}

        <div className="surface divide-y" style={{ borderColor: 'var(--border)' }}>
          {creds.map((c) => (
            <CredentialRowItem
              key={c.id} cred={c} actorId={actor.id}
              isMaster={actor.role === 'master'} showRoom={pessoal}
            />
          ))}
          {creds.length === 0 && (
            <p className="p-8 text-center text-sm" style={{ color: 'var(--text-dim)' }}>
              Nenhuma senha aqui ainda.
            </p>
          )}
        </div>
      </main>
    </>
  );
}
```

- [ ] **Step 4: Verificar tipagem**

```bash
npx tsc --noEmit
```
Esperado: um erro apontando `@/components/CredentialForm`, criado na Task 10.

- [ ] **Step 5: Commit (após a Task 10 compilar)**

```bash
git add app/credenciais components/CredentialRow.tsx app/sala
git commit -m "feat: tela da sala com revelar, copiar, link e lixeira

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: Formulário de credencial (criar e editar)

**Files:**
- Create: `components/CredentialForm.tsx`
- Modify: `app/credenciais/actions.ts` (acrescentar `saveCredential`)

**Interfaces:**
- Consumes: `insertCredential`, `updateCredential`, `CredentialInput`, `requireReadyUser`, `audit`
- Produces:
  - `saveCredential(prevState, formData): Promise<{ error?: string }>` — cria quando `id` está vazio, edita caso contrário
  - `<CredentialForm salas salaPadrao credencial voltarPara />`

- [ ] **Step 1: Acrescentar a action de salvar**

Anexar a `app/credenciais/actions.ts`:

```ts
import { redirect } from 'next/navigation';
import { insertCredential, updateCredential, type CredentialInput } from '@/lib/db/queries';

export type SaveState = { error?: string };

export async function saveCredential(
  _prev: SaveState, formData: FormData,
): Promise<SaveState> {
  const actor = await requireReadyUser();

  const id = String(formData.get('id') ?? '');
  const voltarPara = String(formData.get('voltarPara') ?? '/');
  const input: CredentialInput = {
    roomId: String(formData.get('roomId') ?? ''),
    title: String(formData.get('title') ?? '').trim(),
    username: String(formData.get('username') ?? '').trim(),
    password: String(formData.get('password') ?? ''),
    url: String(formData.get('url') ?? '').trim(),
    notes: String(formData.get('notes') ?? '').trim(),
    // Ausência do checkbox no FormData significa desmarcado → senha pessoal.
    isGlobal: formData.get('isGlobal') === 'on',
  };

  if (!input.title) return { error: 'Informe um título.' };
  if (!input.roomId) return { error: 'Escolha uma sala.' };
  if (!id && !input.password) return { error: 'Informe a senha.' };
  if (input.url && !/^https?:\/\//i.test(input.url)) {
    return { error: 'O endereço deve começar com http:// ou https://' };
  }

  try {
    if (id) {
      await updateCredential(actor, id, input);
      await audit({
        actorId: actor.id, action: 'update', entityType: 'credential', entityId: id,
        metadata: { title: input.title, is_global: input.isGlobal },
      });
    } else {
      const novoId = await insertCredential(actor, input);
      await audit({
        actorId: actor.id, action: 'create', entityType: 'credential', entityId: novoId,
        metadata: { title: input.title, is_global: input.isGlobal },
      });
    }
  } catch (err) {
    if (err instanceof NotFoundError) return { error: 'Credencial não encontrada.' };
    throw err;
  }

  revalidatePath('/', 'layout');
  redirect(voltarPara);
}
```

- [ ] **Step 2: Escrever o formulário**

`components/CredentialForm.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { saveCredential, type SaveState } from '@/app/credenciais/actions';
import type { CredentialRow } from '@/lib/types';

const inicial: SaveState = {};

export function CredentialForm({
  salas, salaPadrao, credencial, voltarPara,
}: {
  salas: { id: string; name: string }[];
  salaPadrao: string;
  credencial: CredentialRow | null;
  voltarPara: string;
}) {
  const [state, action, pending] = useActionState(saveCredential, inicial);
  const editando = Boolean(credencial);

  return (
    <form action={action} className="glass p-5 space-y-4">
      <h2 className="font-semibold">{editando ? 'Editar senha' : 'Nova senha'}</h2>

      <input type="hidden" name="id" value={credencial?.id ?? ''} />
      <input type="hidden" name="voltarPara" value={voltarPara} />

      <label className="block space-y-1">
        <span className="text-sm">Título</span>
        <input name="title" className="input" defaultValue={credencial?.title ?? ''} required />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-sm">Usuário</span>
          <input name="username" className="input" autoComplete="off"
                 defaultValue={credencial?.username ?? ''} />
        </label>

        <label className="block space-y-1">
          <span className="text-sm">Senha</span>
          <input name="password" type="password" className="input" autoComplete="new-password"
                 placeholder={editando ? 'Deixe em branco para manter' : ''} />
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-sm">Endereço (URL)</span>
        <input name="url" className="input" placeholder="https://"
               defaultValue={credencial?.url ?? ''} />
      </label>

      <label className="block space-y-1">
        <span className="text-sm">Notas</span>
        <textarea name="notes" className="input" rows={3} />
      </label>

      <label className="block space-y-1">
        <span className="text-sm">Sala</span>
        <select name="roomId" className="input" defaultValue={credencial?.room_id ?? salaPadrao}>
          {salas.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </label>

      <label className="flex items-start gap-3">
        <input type="checkbox" name="isGlobal" className="mt-1"
               defaultChecked={credencial ? credencial.is_global : true} />
        <span className="text-sm">
          Senha global
          <span className="block text-xs" style={{ color: 'var(--text-dim)' }}>
            Visível a todos os membros desta sala. Desmarque para que só você veja.
          </span>
        </span>
      </label>

      {state.error && (
        <p className="text-sm" style={{ color: 'var(--danger)' }} role="alert">{state.error}</p>
      )}

      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? 'Salvando...' : 'Salvar'}
        </button>
        <Link href={voltarPara} className="btn">Cancelar</Link>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Verificar build e rodar a suíte**

```bash
npx tsc --noEmit && npm test && npm run build
```
Esperado: sem erros de tipo, todos os testes passam, build conclui.

- [ ] **Step 4: Commit (inclui as Tasks 8 e 9)**

```bash
git add app components lib
git commit -m "feat: formulario de credencial com escopo global por padrao

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 11: Administração — usuários, salas, auditoria e lixeira

**Files:**
- Create: `app/admin/usuarios/page.tsx`, `app/admin/usuarios/actions.ts`
- Create: `app/admin/salas/page.tsx`, `app/admin/salas/actions.ts`
- Create: `app/admin/auditoria/page.tsx`
- Create: `app/admin/lixeira/page.tsx`, `app/admin/lixeira/actions.ts`
- Modify: `lib/db/queries.ts` (acrescentar funções de sala e lixeira)

**Interfaces:**
- Consumes: `requireMaster`, `listUsers`, `createUser`, `updateUser`, `setPassword`, `hashPassword`, `listAudit`, `audit`, `sql`
- Produces:
  - `createRoom(name, description)`, `updateRoom(id, name, description)`, `softDeleteRoom(id)`, `setRoomMembers(roomId, userIds)`, `listAllRooms()`, `listRoomMembers(roomId)`
  - `listTrash()`, `restoreCredential(id)`, `purgeCredential(id)`
  - Server Actions: `saveUser`, `resetUserPassword`, `saveRoom`, `deleteRoom`, `saveMembers`, `restoreItem`, `purgeItem`

- [ ] **Step 1: Acrescentar as queries de sala e lixeira**

Anexar a `lib/db/queries.ts`:

```ts
/* ---------- Salas (somente master; a checagem fica nas Server Actions) ---------- */

export async function listAllRooms(): Promise<RoomCard[]> {
  return (await sql`
    select r.id, r.name, r.description, r.created_at,
           (select count(*) from credentials c
             where c.room_id = r.id and c.deleted_at is null)::int as credential_count,
           (select count(*) from room_members m where m.room_id = r.id)::int as member_count
      from rooms r where r.deleted_at is null order by r.name`) as RoomCard[];
}

export async function createRoom(
  createdBy: string, name: string, description: string,
): Promise<string> {
  const rows = (await sql`
    insert into rooms (name, description, created_by)
    values (${name}, ${description || null}, ${createdBy}) returning id`) as { id: string }[];
  return rows[0].id;
}

export async function updateRoom(id: string, name: string, description: string): Promise<void> {
  await sql`
    update rooms set name = ${name}, description = ${description || null}, updated_at = now()
     where id = ${id}`;
}

export async function softDeleteRoom(id: string): Promise<void> {
  await sql`update rooms set deleted_at = now() where id = ${id}`;
}

export async function listRoomMembers(roomId: string): Promise<string[]> {
  const rows = (await sql`
    select user_id from room_members where room_id = ${roomId}`) as { user_id: string }[];
  return rows.map((r) => r.user_id);
}

export async function setRoomMembers(roomId: string, userIds: string[]): Promise<void> {
  await sql`delete from room_members where room_id = ${roomId}`;
  for (const userId of userIds) {
    await sql`
      insert into room_members (room_id, user_id) values (${roomId}, ${userId})
      on conflict do nothing`;
  }
}

/* ---------- Lixeira (somente master) ---------- */

export type TrashItem = {
  id: string;
  kind: 'credential' | 'room';
  title: string;
  room_name: string | null;
  deleted_at: string;
};

export async function listTrash(): Promise<TrashItem[]> {
  return (await sql`
    select c.id, 'credential' as kind, c.title, r.name as room_name, c.deleted_at
      from credentials c join rooms r on r.id = c.room_id
     where c.deleted_at is not null
    union all
    select r.id, 'room' as kind, r.name as title, null as room_name, r.deleted_at
      from rooms r where r.deleted_at is not null
     order by deleted_at desc`) as TrashItem[];
}

export async function restoreItem(kind: 'credential' | 'room', id: string): Promise<void> {
  if (kind === 'credential') {
    await sql`update credentials set deleted_at = null where id = ${id}`;
  } else {
    await sql`update rooms set deleted_at = null where id = ${id}`;
  }
}

export async function purgeItem(kind: 'credential' | 'room', id: string): Promise<void> {
  if (kind === 'credential') {
    await sql`delete from credentials where id = ${id} and deleted_at is not null`;
  } else {
    await sql`delete from credentials where room_id = ${id}`;
    await sql`delete from rooms where id = ${id} and deleted_at is not null`;
  }
}
```

- [ ] **Step 2: Escrever a administração de usuários**

`app/admin/usuarios/actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { requireMaster } from '@/lib/auth/guards';
import { hashPassword } from '@/lib/auth/password';
import { audit } from '@/lib/db/audit';
import { createUser, setPassword, updateUser } from '@/lib/db/users';
import type { Role } from '@/lib/types';

export type AdminState = { error?: string; ok?: string };

export async function saveUser(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const actor = await requireMaster();
  const id = String(formData.get('id') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim();
  const role = String(formData.get('role') ?? 'user') as Role;
  const isActive = formData.get('isActive') === 'on';
  const senhaInicial = String(formData.get('senhaInicial') ?? '');

  if (!name) return { error: 'Informe o nome.' };
  if (role !== 'master' && role !== 'user') return { error: 'Papel inválido.' };

  if (id) {
    await updateUser(id, name, role, isActive);
    await audit({ actorId: actor.id, action: 'user_update', entityType: 'user', entityId: id,
                  metadata: { name, role, isActive } });
    revalidatePath('/admin/usuarios');
    return { ok: 'Usuário atualizado.' };
  }

  if (!email) return { error: 'Informe o e-mail.' };
  if (senhaInicial.length < 10) {
    return { error: 'A senha inicial precisa ter ao menos 10 caracteres.' };
  }

  try {
    const novoId = await createUser(email, name, await hashPassword(senhaInicial), role);
    await audit({ actorId: actor.id, action: 'user_create', entityType: 'user', entityId: novoId,
                  metadata: { email, role } });
  } catch {
    return { error: 'Já existe um usuário com esse e-mail.' };
  }

  revalidatePath('/admin/usuarios');
  return { ok: 'Usuário criado. Ele trocará a senha no primeiro acesso.' };
}

export async function resetUserPassword(
  _prev: AdminState, formData: FormData,
): Promise<AdminState> {
  const actor = await requireMaster();
  const id = String(formData.get('id') ?? '');
  const nova = String(formData.get('novaSenha') ?? '');
  if (nova.length < 10) return { error: 'A senha precisa ter ao menos 10 caracteres.' };

  await setPassword(id, await hashPassword(nova), true);
  await audit({
    actorId: actor.id, action: 'user_reset_password', entityType: 'user', entityId: id,
  });
  revalidatePath('/admin/usuarios');
  return { ok: 'Senha redefinida. O usuário trocará no próximo acesso.' };
}
```

`app/admin/usuarios/page.tsx`:

```tsx
import { Nav } from '@/components/Nav';
import { requireMaster } from '@/lib/auth/guards';
import { listUsers } from '@/lib/db/users';
import { UsuariosClient } from './UsuariosClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function UsuariosPage() {
  const actor = await requireMaster();
  const usuarios = await listUsers();

  return (
    <>
      <Nav actor={actor} />
      <main className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
        <h1 className="text-xl font-semibold">Usuários</h1>
        <UsuariosClient usuarios={usuarios} />
      </main>
    </>
  );
}
```

`app/admin/usuarios/UsuariosClient.tsx`:

```tsx
'use client';

import { useActionState, useState } from 'react';
import { resetUserPassword, saveUser, type AdminState } from './actions';
import type { User } from '@/lib/types';

const inicial: AdminState = {};

export function UsuariosClient({ usuarios }: { usuarios: User[] }) {
  const [novoState, novoAction, novoPending] = useActionState(saveUser, inicial);
  const [resetState, resetAction, resetPending] = useActionState(resetUserPassword, inicial);
  const [resetandoId, setResetandoId] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <form action={novoAction} className="glass p-5 space-y-4">
        <h2 className="font-semibold">Novo usuário</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-sm">Nome</span>
            <input name="name" className="input" required />
          </label>
          <label className="block space-y-1">
            <span className="text-sm">E-mail</span>
            <input name="email" type="email" className="input" required />
          </label>
          <label className="block space-y-1">
            <span className="text-sm">Senha inicial</span>
            <input name="senhaInicial" className="input" minLength={10} required />
          </label>
          <label className="block space-y-1">
            <span className="text-sm">Papel</span>
            <select name="role" className="input" defaultValue="user">
              <option value="user">Usuário</option>
              <option value="master">Master</option>
            </select>
          </label>
        </div>
        {novoState.error && (
          <p className="text-sm" style={{ color: 'var(--danger)' }}>{novoState.error}</p>
        )}
        {novoState.ok && <p className="text-sm" style={{ color: 'var(--ok)' }}>{novoState.ok}</p>}
        <button className="btn btn-primary" disabled={novoPending}>Criar usuário</button>
      </form>

      <div className="surface divide-y" style={{ borderColor: 'var(--border)' }}>
        {usuarios.map((u) => (
          <div key={u.id} className="p-4 space-y-3">
            <form action={novoAction} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="id" value={u.id} />
              <label className="space-y-1">
                <span className="text-xs" style={{ color: 'var(--text-dim)' }}>Nome</span>
                <input name="name" className="input" defaultValue={u.name} />
              </label>
              <label className="space-y-1">
                <span className="text-xs" style={{ color: 'var(--text-dim)' }}>Papel</span>
                <select name="role" className="input" defaultValue={u.role}>
                  <option value="user">Usuário</option>
                  <option value="master">Master</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="isActive" defaultChecked={u.is_active} />
                Ativo
              </label>
              <span className="text-xs" style={{ color: 'var(--text-dim)' }}>{u.email}</span>
              <button className="btn ml-auto">Salvar</button>
              <button type="button" className="btn"
                      onClick={() => setResetandoId(resetandoId === u.id ? null : u.id)}>
                Resetar senha
              </button>
            </form>

            {resetandoId === u.id && (
              <form action={resetAction} className="flex items-end gap-3">
                <input type="hidden" name="id" value={u.id} />
                <label className="space-y-1 flex-1">
                  <span className="text-xs" style={{ color: 'var(--text-dim)' }}>Nova senha</span>
                  <input name="novaSenha" className="input" minLength={10} required />
                </label>
                <button className="btn btn-primary" disabled={resetPending}>Redefinir</button>
              </form>
            )}
          </div>
        ))}
      </div>
      {resetState.error && (
        <p className="text-sm" style={{ color: 'var(--danger)' }}>{resetState.error}</p>
      )}
      {resetState.ok && <p className="text-sm" style={{ color: 'var(--ok)' }}>{resetState.ok}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Escrever a administração de salas**

`app/admin/salas/actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { requireMaster } from '@/lib/auth/guards';
import { audit } from '@/lib/db/audit';
import { createRoom, setRoomMembers, softDeleteRoom, updateRoom } from '@/lib/db/queries';

export type SalaState = { error?: string; ok?: string };

export async function saveRoom(_prev: SalaState, formData: FormData): Promise<SalaState> {
  const actor = await requireMaster();
  const id = String(formData.get('id') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  if (!name) return { error: 'Informe o nome da sala.' };

  if (id) {
    await updateRoom(id, name, description);
    await audit({ actorId: actor.id, action: 'room_update', entityType: 'room', entityId: id,
                  metadata: { name } });
  } else {
    const novoId = await createRoom(actor.id, name, description);
    await audit({ actorId: actor.id, action: 'room_create', entityType: 'room', entityId: novoId,
                  metadata: { name } });
  }

  revalidatePath('/admin/salas');
  revalidatePath('/');
  return { ok: 'Sala salva.' };
}

export async function deleteRoom(_prev: SalaState, formData: FormData): Promise<SalaState> {
  const actor = await requireMaster();
  const id = String(formData.get('id') ?? '');
  await softDeleteRoom(id);
  await audit({ actorId: actor.id, action: 'room_delete', entityType: 'room', entityId: id });
  revalidatePath('/admin/salas');
  revalidatePath('/');
  return { ok: 'Sala movida para a lixeira.' };
}

export async function saveMembers(_prev: SalaState, formData: FormData): Promise<SalaState> {
  const actor = await requireMaster();
  const roomId = String(formData.get('roomId') ?? '');
  const userIds = formData.getAll('userIds').map(String);
  await setRoomMembers(roomId, userIds);
  await audit({ actorId: actor.id, action: 'member_add', entityType: 'room', entityId: roomId,
                metadata: { total: userIds.length } });
  revalidatePath('/admin/salas');
  revalidatePath('/');
  return { ok: 'Membros atualizados.' };
}
```

`app/admin/salas/page.tsx`:

```tsx
import { Nav } from '@/components/Nav';
import { requireMaster } from '@/lib/auth/guards';
import { listAllRooms, listRoomMembers } from '@/lib/db/queries';
import { listUsers } from '@/lib/db/users';
import { SalasClient } from './SalasClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function SalasAdminPage() {
  const actor = await requireMaster();
  const [salas, usuarios] = await Promise.all([listAllRooms(), listUsers()]);
  const membros = Object.fromEntries(
    await Promise.all(salas.map(async (s) => [s.id, await listRoomMembers(s.id)] as const)),
  );

  return (
    <>
      <Nav actor={actor} />
      <main className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
        <h1 className="text-xl font-semibold">Salas</h1>
        <SalasClient salas={salas} usuarios={usuarios} membros={membros} />
      </main>
    </>
  );
}
```

`app/admin/salas/SalasClient.tsx`:

```tsx
'use client';

import { useActionState } from 'react';
import { deleteRoom, saveMembers, saveRoom, type SalaState } from './actions';
import type { RoomCard, User } from '@/lib/types';

const inicial: SalaState = {};

export function SalasClient({
  salas, usuarios, membros,
}: {
  salas: RoomCard[];
  usuarios: User[];
  membros: Record<string, string[]>;
}) {
  const [salaState, salaAction, salaPending] = useActionState(saveRoom, inicial);
  const [memState, memAction] = useActionState(saveMembers, inicial);
  const [delState, delAction] = useActionState(deleteRoom, inicial);

  return (
    <div className="space-y-6">
      <form action={salaAction} className="glass p-5 space-y-4">
        <h2 className="font-semibold">Nova sala</h2>
        <label className="block space-y-1">
          <span className="text-sm">Nome</span>
          <input name="name" className="input" required />
        </label>
        <label className="block space-y-1">
          <span className="text-sm">Descrição</span>
          <input name="description" className="input" />
        </label>
        {salaState.error && (
          <p className="text-sm" style={{ color: 'var(--danger)' }}>{salaState.error}</p>
        )}
        <button className="btn btn-primary" disabled={salaPending}>Criar sala</button>
      </form>

      {salas.map((sala) => (
        <div key={sala.id} className="surface p-5 space-y-4">
          <form action={salaAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="id" value={sala.id} />
            <label className="space-y-1">
              <span className="text-xs" style={{ color: 'var(--text-dim)' }}>Nome</span>
              <input name="name" className="input" defaultValue={sala.name} />
            </label>
            <label className="space-y-1 flex-1">
              <span className="text-xs" style={{ color: 'var(--text-dim)' }}>Descrição</span>
              <input name="description" className="input" defaultValue={sala.description ?? ''} />
            </label>
            <button className="btn">Salvar</button>
          </form>

          <form action={memAction} className="space-y-2">
            <input type="hidden" name="roomId" value={sala.id} />
            <p className="text-sm" style={{ color: 'var(--text-dim)' }}>Membros</p>
            <div className="flex flex-wrap gap-3">
              {usuarios.map((u) => (
                <label key={u.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="userIds" value={u.id}
                         defaultChecked={membros[sala.id]?.includes(u.id)} />
                  {u.name}
                </label>
              ))}
            </div>
            <button className="btn">Salvar membros</button>
          </form>

          <form action={delAction}>
            <input type="hidden" name="id" value={sala.id} />
            <button className="btn btn-danger">Mover sala para a lixeira</button>
          </form>
        </div>
      ))}

      {(memState.ok || delState.ok) && (
        <p className="text-sm" style={{ color: 'var(--ok)' }}>{memState.ok ?? delState.ok}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Escrever auditoria e lixeira**

`app/admin/auditoria/page.tsx`:

```tsx
import { Nav } from '@/components/Nav';
import { requireMaster } from '@/lib/auth/guards';
import { listAudit } from '@/lib/db/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACOES = [
  '', 'login_ok', 'login_fail', 'view', 'copy', 'create', 'update', 'delete',
  'restore', 'purge', 'room_create', 'member_add', 'user_create',
];

export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<{ acao?: string }>;
}) {
  const actor = await requireMaster();
  const { acao = '' } = await searchParams;
  const linhas = await listAudit(200, acao || undefined);

  return (
    <>
      <Nav actor={actor} />
      <main className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
        <h1 className="text-xl font-semibold">Auditoria</h1>

        <form className="flex gap-2 items-end">
          <label className="space-y-1">
            <span className="text-sm">Ação</span>
            <select name="acao" className="input" defaultValue={acao}>
              {ACOES.map((a) => (
                <option key={a} value={a}>{a || 'todas'}</option>
              ))}
            </select>
          </label>
          <button className="btn">Filtrar</button>
        </form>

        <div className="surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead style={{ color: 'var(--text-dim)' }}>
              <tr className="text-left">
                <th className="p-3">Quando</th><th className="p-3">Quem</th>
                <th className="p-3">Ação</th><th className="p-3">Alvo</th>
                <th className="p-3">Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                  <td className="p-3 whitespace-nowrap">
                    {new Date(l.created_at).toLocaleString('pt-BR')}
                  </td>
                  <td className="p-3">{l.actor_name ?? '—'}</td>
                  <td className="p-3">{l.action}</td>
                  <td className="p-3">{l.entity_type ?? '—'}</td>
                  <td className="p-3 font-mono text-xs">{JSON.stringify(l.metadata)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
```

`app/admin/lixeira/actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { requireMaster } from '@/lib/auth/guards';
import { audit } from '@/lib/db/audit';
import { purgeItem, restoreItem } from '@/lib/db/queries';

// As duas recebem apenas FormData: são usadas direto como `action` de um <form>.

export async function restaurar(formData: FormData): Promise<void> {
  const actor = await requireMaster();
  const id = String(formData.get('id') ?? '');
  const kind = String(formData.get('kind') ?? '') as 'credential' | 'room';
  await restoreItem(kind, id);
  await audit({ actorId: actor.id, action: 'restore', entityType: kind, entityId: id });
  revalidatePath('/admin/lixeira');
  revalidatePath('/');
}

export async function expurgar(formData: FormData): Promise<void> {
  const actor = await requireMaster();
  const id = String(formData.get('id') ?? '');
  const kind = String(formData.get('kind') ?? '') as 'credential' | 'room';
  await purgeItem(kind, id);
  await audit({ actorId: actor.id, action: 'purge', entityType: kind, entityId: id });
  revalidatePath('/admin/lixeira');
}
```

`app/admin/lixeira/page.tsx`:

```tsx
import { Nav } from '@/components/Nav';
import { requireMaster } from '@/lib/auth/guards';
import { listTrash } from '@/lib/db/queries';
import { expurgar, restaurar } from './actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function LixeiraPage() {
  const actor = await requireMaster();
  const itens = await listTrash();

  return (
    <>
      <Nav actor={actor} />
      <main className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
        <h1 className="text-xl font-semibold">Lixeira</h1>

        <div className="surface divide-y" style={{ borderColor: 'var(--border)' }}>
          {itens.map((item) => (
            <div key={`${item.kind}-${item.id}`} className="p-4 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <span className="font-medium">{item.title}</span>{' '}
                <span className="badge">{item.kind === 'room' ? 'sala' : 'senha'}</span>
                <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
                  {item.room_name ? `${item.room_name} · ` : ''}
                  apagado em {new Date(item.deleted_at).toLocaleString('pt-BR')}
                </p>
              </div>
              <form action={restaurar}>
                <input type="hidden" name="id" value={item.id} />
                <input type="hidden" name="kind" value={item.kind} />
                <button className="btn">Restaurar</button>
              </form>
              <form action={expurgar}>
                <input type="hidden" name="id" value={item.id} />
                <input type="hidden" name="kind" value={item.kind} />
                <button className="btn btn-danger">Apagar de vez</button>
              </form>
            </div>
          ))}
          {itens.length === 0 && (
            <p className="p-8 text-center text-sm" style={{ color: 'var(--text-dim)' }}>
              A lixeira está vazia.
            </p>
          )}
        </div>
      </main>
    </>
  );
}
```

- [ ] **Step 5: Verificar build e testes**

```bash
npx tsc --noEmit && npm test && npm run build
```
Esperado: sem erros; todos os testes passam.

- [ ] **Step 6: Commit**

```bash
git add app/admin lib/db/queries.ts
git commit -m "feat: area administrativa com usuarios, salas, auditoria e lixeira

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 12: Marca, favicon e metadata

**Files:**
- Create: `public/icon.svg`, `app/icon.svg`, `app/apple-icon.png`, `public/manifest.webmanifest`
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: nada
- Produces: favicon e ícone de PWA servidos pelas convenções de arquivo do Next.js

- [ ] **Step 1: Desenhar a marca**

`public/icon.svg` (e cópia idêntica em `app/icon.svg`, que o Next serve como favicon):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#6c8cff"/>
      <stop offset="1" stop-color="#b46cff"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="14" fill="#0a0b0f"/>
  <rect x="4" y="4" width="56" height="56" rx="12" fill="none"
        stroke="rgba(255,255,255,0.10)" stroke-width="1"/>
  <!-- corpo do cofre -->
  <rect x="14" y="27" width="36" height="26" rx="6" fill="url(#g)"/>
  <!-- arco do cadeado -->
  <path d="M22 27v-6a10 10 0 0 1 20 0v6" fill="none" stroke="url(#g)"
        stroke-width="5" stroke-linecap="round"/>
  <!-- segredo -->
  <circle cx="32" cy="38" r="4" fill="#0a0b0f"/>
  <rect x="30" y="38" width="4" height="8" rx="2" fill="#0a0b0f"/>
</svg>
```

- [ ] **Step 2: Gerar os PNGs**

```bash
npx --yes sharp-cli -i public/icon.svg -o public/icon-192.png resize 192 192
npx --yes sharp-cli -i public/icon.svg -o public/icon-512.png resize 512 512
npx --yes sharp-cli -i public/icon.svg -o app/apple-icon.png resize 180 180
```
Esperado: três arquivos PNG criados. Se `sharp-cli` falhar no ambiente, abrir `public/icon.svg` no navegador e exportar manualmente nos três tamanhos.

- [ ] **Step 3: Escrever o manifest e a metadata**

`public/manifest.webmanifest`:

```json
{
  "name": "Cofre de Senhas",
  "short_name": "Cofre",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0a0b0f",
  "theme_color": "#0a0b0f",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

`app/layout.tsx` — substituir o bloco `metadata`:

```tsx
export const metadata: Metadata = {
  title: 'Cofre de Senhas',
  description: 'Gerenciador de senhas da equipe',
  manifest: '/manifest.webmanifest',
  themeColor: '#0a0b0f',
  robots: { index: false, follow: false },
};
```

- [ ] **Step 4: Verificar o build**

```bash
npm run build
```
Esperado: build conclui; o favicon aparece em `npm run dev` na aba do navegador.

- [ ] **Step 5: Commit**

```bash
git add public app/icon.svg app/apple-icon.png app/layout.tsx
git commit -m "feat: marca, favicon e manifest do PWA

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 13: Banco Neon, GitHub e deploy na Vercel

**Files:**
- Create: `README.md`
- Modify: nenhum código

**Interfaces:**
- Consumes: tudo que foi construído
- Produces: aplicação no ar, com deploy automático a cada push em `main`

> Esta task exige credenciais do usuário. Pedir a `DATABASE_URL` do Neon antes de começar e confirmar antes de qualquer push.

- [ ] **Step 1: Gerar os segredos**

```bash
node -e "console.log('VAULT_KEY=' + require('crypto').randomBytes(32).toString('base64'))"
node -e "console.log('SESSION_SECRET=' + require('crypto').randomBytes(48).toString('base64'))"
```
Guardar a saída em `.env.local` junto com a `DATABASE_URL` fornecida pelo usuário. **Nunca commitar este arquivo.**

- [ ] **Step 2: Aplicar as migrations e o seed**

```bash
npm run migrate
```
Esperado: `+ aplicando 001_init.sql...` seguido de `migrations concluídas`.

Definir `SEED_MASTER_EMAIL`, `SEED_MASTER_NAME` e `SEED_MASTER_PASSWORD` em `.env.local` e rodar:

```bash
npm run seed
```
Esperado: `master criado: <email>`.

- [ ] **Step 3: Testar localmente**

```bash
npm run dev
```
Verificar manualmente, nesta ordem:
1. `/login` com o e-mail do master → redireciona para `/trocar-senha`
2. trocar a senha → chega na home
3. criar uma sala em `/admin/salas`, marcar-se como membro
4. criar uma senha global e uma pessoal na sala
5. revelar (olho), copiar usuário, copiar senha, abrir o link
6. apagar uma senha e restaurá-la em `/admin/lixeira`
7. conferir os registros em `/admin/auditoria`

- [ ] **Step 4: Escrever o README**

`README.md`:

```markdown
# Cofre de Senhas

Gerenciador de senhas da equipe. Senhas cifradas em AES-256-GCM, organizadas em salas
com escopo global ou pessoal.

## Variáveis de ambiente

| Nome | Descrição |
|---|---|
| `DATABASE_URL` | String de conexão do Neon |
| `VAULT_KEY` | Chave de 32 bytes em base64 — cifra as senhas |
| `SESSION_SECRET` | Segredo do JWT de sessão |

Gerar as duas últimas:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

> **Atenção:** trocar a `VAULT_KEY` torna todas as senhas já gravadas indecifráveis.

## Desenvolvimento

```bash
npm install
npm run migrate   # aplica as migrations
npm run seed      # cria o primeiro usuário master
npm run dev
```

## Testes

```bash
npm test
```

## Deploy

Push em `main` → deploy automático na Vercel. As variáveis de ambiente são configuradas
apenas no ambiente **Production**.
```

- [ ] **Step 5: Publicar no GitHub**

Confirmar com o usuário antes de executar. Repositório **privado**:

```bash
git add README.md
git commit -m "docs: README com setup e deploy

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
gh repo create cofre-de-senhas --private --source=. --remote=origin --push
```
Esperado: repositório criado e `main` publicada.

- [ ] **Step 6: Configurar a Vercel**

```bash
npx --yes vercel@latest link
npx --yes vercel@latest env add DATABASE_URL production
npx --yes vercel@latest env add VAULT_KEY production
npx --yes vercel@latest env add SESSION_SECRET production
npx --yes vercel@latest --prod
```

Depois, no painel da Vercel, confirmar que:
- o projeto está conectado ao repositório GitHub (deploy automático em `main`);
- as três variáveis existem **apenas** no ambiente Production.

- [ ] **Step 7: Verificar em produção**

Abrir a URL de produção e repetir os passos 1 a 3 do Step 3. Verificar que `/admin/usuarios`
retorna 404 quando acessada por um usuário comum.

- [ ] **Step 8: Commit final**

```bash
git add -A
git commit -m "chore: projeto publicado no GitHub com deploy automatico na Vercel

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
git push
```

---

## Cobertura da spec

| Requisito da spec | Task |
|---|---|
| Schema completo, migrations, seed do master | 3 |
| AES-256-GCM com IV por registro e AAD | 2 |
| bcrypt, JWT em cookie, trava por tentativas | 5, 6 |
| `requireUser` / `requireMaster`, 404 em vez de 403 | 4, 5 |
| Matriz de permissão master/dono/membro/estranho | 4 |
| Cards de sala, card "Minhas senhas", busca global | 8 |
| Lista da sala, busca local, olho, copiar, link | 9 |
| Formulário com checkbox global marcado por padrão | 10 |
| CRUD de usuários, salas e membros | 11 |
| Audit log e lixeira | 5, 9, 11 |
| Visual dark minimalista com glassmorphism | 1 (tokens), aplicado em todas as telas |
| Ícone, favicon, manifest | 12 |
| GitHub privado, Neon, Vercel com deploy automático | 13 |
