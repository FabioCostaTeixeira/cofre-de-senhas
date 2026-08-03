# Unificação de Módulos (Hub) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cofre de Senhas vira o hub de login/permissão; o Gestor de Projetos (app separado, já
pronto) passa a autenticar pela sessão do Cofre em vez do próprio login, montado sob `/gestao` no
mesmo domínio.

**Architecture:** Tabela nova `module_access` (user_id, module_key) no banco do Cofre controla
quem acessa qual módulo, com checkbox na tela de usuário (mesmo padrão de `room_members` /
`SeletorSalas`). O Gestor de Projetos deixa de emitir seu próprio token e passa a validar o cookie
`cofre_session` (JWT `jose`, mesma `SESSION_SECRET`) direto contra as tabelas `public.users` e
`public.module_access` do banco do Cofre. Um rewrite no Vercel do Cofre expõe `/gestao/*`
apontando pro deploy do Gestor de Projetos, preservando a URL no navegador.

**Tech Stack:** Next.js 15 (App Router) + Postgres/Neon no Cofre; Vite + React Router 7 +
Vercel Functions + `pg` no Gestor de Projetos; `jose` para JWT nos dois.

## Global Constraints

- Usuários e permissão só existem na tabela `users` do Cofre (`public.users`). O login e a tabela
  de usuário próprios do Gestor de Projetos (`gestor_projetos.users`, `api/login.ts`, HMAC em
  `api/_lib/auth.ts`) são desligados — sem migração de dado, conforme decisão explícita do cliente.
- Domínio único: `/` = Cofre, `/gestao` = Gestor de Projetos, via rewrite (não subdomínio).
- Cookie de sessão: `cofre_session`, JWT HS256 via `jose`, claim `sub` = user id, mesma
  `SESSION_SECRET` nos dois projetos.
- Permissão por módulo: tabela `module_access` (user_id, module_key), checkbox na tela de usuário
  do Cofre. Master tem acesso implícito a todos os módulos (mesma regra hoje aplicada a salas).
- Sub-rota escolhida para o Gestor de Projetos: `/gestao` (evita colisão com a rota interna
  `/projetos`, que já existe dentro do próprio Gestor de Projetos, de lista de projetos).

---

## Parte A — Cofre de Senhas: `module_access` + UI de permissão

### Task 1: Migration `module_access`

**Files:**
- Create: `db/migrations/003_module_access.sql`

**Interfaces:**
- Produces: tabela `module_access(user_id uuid, module_key text, granted_by uuid, created_at
  timestamptz)`, PK composta `(user_id, module_key)`, usada pelas Tasks 3 e 6.

- [ ] **Step 1: Escrever a migration**

```sql
-- Permissão por módulo externo (ex.: Gestor de Projetos). O Cofre em si não precisa
-- de linha aqui: todo usuário ativo já enxerga o Cofre por definição.
--
-- Espelha `room_members`: master tem acesso implícito a tudo (checado em código,
-- não aqui), este cadastro é só para usuário comum.
create table module_access (
  user_id     uuid not null references users(id) on delete cascade,
  module_key  text not null,
  granted_by  uuid not null references users(id),
  created_at  timestamptz not null default now(),
  primary key (user_id, module_key)
);

create index module_access_user_idx on module_access (user_id);
```

- [ ] **Step 2: Rodar a migration**

Run: `npm run migrate`
Expected: log mostrando `003_module_access.sql` aplicada, sem erro.

- [ ] **Step 3: Commit**

```bash
git add db/migrations/003_module_access.sql
git commit -m "feat: adiciona tabela module_access"
```

---

### Task 2: Registro de módulos (`lib/modules.ts`)

**Files:**
- Create: `lib/modules.ts`

**Interfaces:**
- Produces: `MODULES: ModuleDef[]`, `type ModuleDef = { key: string; label: string; href: string
  }` — consumido pelas Tasks 5, 6, 8 e 9.

- [ ] **Step 1: Criar o registro**

```typescript
/**
 * Módulos externos disponíveis pra conceder acesso na tela de usuário. O Cofre em
 * si não entra aqui — todo usuário ativo já o acessa por definição. Novo módulo:
 * adiciona uma entrada aqui, nada mais muda no cadastro de usuário.
 */
export type ModuleDef = { key: string; label: string; href: string };

export const MODULES: ModuleDef[] = [
  { key: 'gestao', label: 'Gestão de Projetos', href: '/gestao' },
];
```

- [ ] **Step 2: Commit**

```bash
git add lib/modules.ts
git commit -m "feat: registro de modulos externos"
```

---

### Task 3: Consultas de `module_access` (`lib/db/queries.ts`)

**Files:**
- Modify: `lib/db/queries.ts` (final do arquivo, mesma seção de padrão de `listRoomsOfUser` /
  `setUserRooms`)
- Test: `tests/integracao.test.ts`

**Interfaces:**
- Consumes: `sql` de `@/lib/db/client` (já importado no arquivo).
- Produces: `listModulesOfUser(userId: string): Promise<string[]>`,
  `setUserModules(userId: string, grantedBy: string, moduleKeys: string[]): Promise<void>` —
  consumidos pela Task 6 (actions) e Task 9 (Nav).

- [ ] **Step 1: Escrever o teste de integração (falha primeiro)**

Adicionar ao final de `tests/integracao.test.ts`, dentro do bloco `descreve(...)` existente,
depois do último `describe`/`it` do arquivo (mesmo nível de indentação dos outros `describe`
internos, usando `master`, `comum`, `q`, `sql` já criados no `beforeAll` do arquivo):

```typescript
  describe('module_access', () => {
    it('concede e lista módulos de um usuário', async () => {
      await q.setUserModules(comumId, masterId, ['gestao']);
      expect(await q.listModulesOfUser(comumId)).toEqual(['gestao']);
    });

    it('substitui o conjunto: remove o que saiu, mantém o que ficou', async () => {
      await q.setUserModules(comumId, masterId, ['gestao']);
      await q.setUserModules(comumId, masterId, []);
      expect(await q.listModulesOfUser(comumId)).toEqual([]);
    });

    it('usuário sem módulo concedido não vê nenhum', async () => {
      expect(await q.listModulesOfUser(estranhoId)).toEqual([]);
    });
  });
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run tests/integracao.test.ts`
Expected: FAIL — `q.setUserModules is not a function` (precisa de `DATABASE_URL` e `VAULT_KEY` no
`.env.local`; se não tiver, a suíte inteira é pulada e este passo não se aplica — vá direto pro
Step 3 e valide manualmente depois de configurar o banco local).

- [ ] **Step 3: Implementar as funções**

Adicionar ao final de `lib/db/queries.ts`:

```typescript
/* ---------- Módulos externos (permissão por usuário) ---------- */

/** Os módulos a que um usuário tem acesso explícito. Master não entra aqui — bypassa em código. */
export async function listModulesOfUser(userId: string): Promise<string[]> {
  const rows = (await sql`
    select module_key from module_access where user_id = ${userId}`) as { module_key: string }[];
  return rows.map((r) => r.module_key);
}

/**
 * Substitui o conjunto de módulos de um usuário numa única transação, espelhando
 * `setUserRooms`: remove só o que saiu, insere só o que entrou. `grantedBy` é o id
 * do master que fez a alteração (vai pra `module_access.granted_by`).
 */
export async function setUserModules(
  userId: string, grantedBy: string, moduleKeys: string[],
): Promise<void> {
  await sql.transaction([
    sql`delete from module_access
         where user_id = ${userId} and module_key <> all(${moduleKeys}::text[])`,
    sql`insert into module_access (user_id, module_key, granted_by)
         select ${userId}, m, ${grantedBy} from unnest(${moduleKeys}::text[]) as m
         on conflict do nothing`,
  ]);
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run tests/integracao.test.ts`
Expected: PASS (ou skip, se `DATABASE_URL`/`VAULT_KEY` não estiverem configurados localmente).

- [ ] **Step 5: Commit**

```bash
git add lib/db/queries.ts tests/integracao.test.ts
git commit -m "feat: consultas de module_access (listModulesOfUser/setUserModules)"
```

---

### Task 4: Ações de auditoria para módulo (`lib/types.ts`)

**Files:**
- Modify: `lib/types.ts:51-57` (constante `AUDIT_ACTIONS`)

**Interfaces:**
- Produces: ações `'module_grant'` e `'module_revoke'` em `AuditAction`, consumidas pela Task 6.

- [ ] **Step 1: Adicionar as duas ações**

Em `lib/types.ts`, dentro do array `AUDIT_ACTIONS`, depois de `'member_add', 'member_remove',`:

```typescript
export const AUDIT_ACTIONS = [
  'login_ok', 'login_fail', 'logout', 'password_change',
  'view', 'copy', 'create', 'update', 'delete', 'restore', 'purge',
  'room_create', 'room_update', 'room_delete',
  'member_add', 'member_remove',
  'module_grant', 'module_revoke',
  'user_create', 'user_update', 'user_reset_password',
] as const;
```

- [ ] **Step 2: Commit**

```bash
git add lib/types.ts
git commit -m "feat: acoes de auditoria module_grant/module_revoke"
```

---

### Task 5: Componente `SeletorModulos`

**Files:**
- Create: `components/SeletorModulos.tsx`

**Interfaces:**
- Consumes: `ModuleDef` de `@/lib/modules` (Task 2).
- Produces: `<SeletorModulos modulos selecionados onChange desabilitado? dica? />`, consumido
  pela Task 8. Emite campos `<input type="hidden" name="modulos" value={key}>` no form, mesmo
  contrato de `SeletorSalas` com `name="salas"`.

- [ ] **Step 1: Criar o componente, espelhando `components/SeletorSalas.tsx`**

```tsx
'use client';

import type { ModuleDef } from '@/lib/modules';

/**
 * Escolha dos módulos externos a que um usuário tem acesso. Mesmo padrão de
 * `SeletorSalas`: caixas controladas, porque o conjunto muda sozinho ao trocar o
 * papel para master (que já enxerga todos os módulos).
 */
export function SeletorModulos({
  modulos, selecionados, onChange, desabilitado = false, dica,
}: {
  modulos: ModuleDef[];
  selecionados: string[];
  onChange: (keys: string[]) => void;
  desabilitado?: boolean;
  dica?: string;
}) {
  function alternar(key: string, marcada: boolean) {
    onChange(marcada ? [...selecionados, key] : selecionados.filter((k) => k !== key));
  }

  if (modulos.length === 0) return null;

  return (
    <div className="space-y-2">
      {selecionados.map((key) => (
        <input key={key} type="hidden" name="modulos" value={key} />
      ))}

      <span className="text-sm">Módulos externos com acesso</span>
      {dica && <p className="text-xs" style={{ color: 'var(--text-dim)' }}>{dica}</p>}

      <div className="flex flex-wrap gap-x-4 gap-y-2" style={{ opacity: desabilitado ? 0.55 : 1 }}>
        {modulos.map((m) => (
          <label key={m.key} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={selecionados.includes(m.key)}
              disabled={desabilitado}
              onChange={(e) => alternar(m.key, e.target.checked)}
            />
            {m.label}
          </label>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/SeletorModulos.tsx
git commit -m "feat: componente SeletorModulos"
```

---

### Task 6: Server Actions — salvar módulos do usuário

**Files:**
- Modify: `app/admin/usuarios/actions.ts`

**Interfaces:**
- Consumes: `setUserModules`, `listModulesOfUser` de `@/lib/db/queries` (Task 3); `MODULES` de
  `@/lib/modules` (Task 2).
- Produces: `saveUser` passa a ler `formData.getAll('modulos')` e persistir via
  `aplicarModulos`, consumido pelo form da Task 8.

- [ ] **Step 1: Importar o necessário**

Em `app/admin/usuarios/actions.ts`, ajustar o import de `@/lib/db/queries`:

```typescript
import { listModulesOfUser, listRoomsOfUser, setUserModules, setUserRooms } from '@/lib/db/queries';
```

- [ ] **Step 2: Adicionar `aplicarModulos`, espelhando `aplicarSalas`**

Logo depois da função `aplicarSalas` existente:

```typescript
async function aplicarModulos(
  actorId: string, userId: string, modulos: string[],
): Promise<void> {
  const antes = await listModulesOfUser(userId);
  await setUserModules(userId, actorId, modulos);

  const concedidos = modulos.filter((m) => !antes.includes(m));
  const revogados = antes.filter((m) => !modulos.includes(m));

  if (concedidos.length) {
    await audit({ actorId, action: 'module_grant', entityType: 'user', entityId: userId,
                  metadata: { modulos: concedidos } });
  }
  if (revogados.length) {
    await audit({ actorId, action: 'module_revoke', entityType: 'user', entityId: userId,
                  metadata: { modulos: revogados } });
  }
}
```

- [ ] **Step 3: Ler `modulos` do form e chamar `aplicarModulos` em `saveUser`**

Em `saveUser`, logo abaixo de `const salas = formData.getAll('salas').map(String);`:

```typescript
  const modulos = formData.getAll('modulos').map(String);
```

No ramo de atualização (`if (id) { ... }`), logo depois de `await aplicarSalas(actor.id, id, salas);`:

```typescript
    await aplicarModulos(actor.id, id, modulos);
```

No ramo de criação, logo depois de `await aplicarSalas(actor.id, novoId, salas);`:

```typescript
  await aplicarModulos(actor.id, novoId, modulos);
```

- [ ] **Step 4: Rodar a suíte de testes**

Run: `npx vitest run`
Expected: PASS em todos os arquivos (nenhum teste existente cobre `actions.ts` diretamente — é
Server Action, testada via UI na Task 8).

- [ ] **Step 5: Commit**

```bash
git add app/admin/usuarios/actions.ts
git commit -m "feat: saveUser aplica modulos externos concedidos"
```

---

### Task 7: Carregar módulos por usuário na página

**Files:**
- Modify: `app/admin/usuarios/page.tsx`

**Interfaces:**
- Consumes: `listModulesOfUser` de `@/lib/db/queries` (Task 3).
- Produces: prop `modulosPorUsuario: Record<string, string[]>` pro `UsuariosClient` (Task 8).

- [ ] **Step 1: Carregar os módulos de cada usuário, mesmo padrão de `membros`**

Em `app/admin/usuarios/page.tsx`, ajustar o import:

```typescript
import { listAllRooms, listModulesOfUser, listRoomsOfUser } from '@/lib/db/queries';
```

Logo depois do bloco `const membros = ...`:

```typescript
  const modulosPorUsuario = Object.fromEntries(
    await Promise.all(
      usuarios.map(async (u) => [u.id, await listModulesOfUser(u.id)] as const),
    ),
  );
```

E passar a prop nova pro client:

```tsx
        <UsuariosClient
          usuarios={usuarios}
          salas={salas.map((s) => ({ id: s.id, name: s.name }))}
          membros={membros}
          modulosPorUsuario={modulosPorUsuario}
        />
```

- [ ] **Step 2: Commit**

```bash
git add app/admin/usuarios/page.tsx
git commit -m "feat: carrega modulos externos por usuario na tela de admin"
```

---

### Task 8: Checkbox de módulo na tela de usuário

**Files:**
- Modify: `app/admin/usuarios/UsuariosClient.tsx`

**Interfaces:**
- Consumes: `SeletorModulos` (Task 5), `MODULES` de `@/lib/modules` (Task 2), prop
  `modulosPorUsuario` (Task 7).

- [ ] **Step 1: Importar `SeletorModulos` e `MODULES`**

No topo de `app/admin/usuarios/UsuariosClient.tsx`:

```typescript
import { SeletorModulos } from '@/components/SeletorModulos';
import { MODULES } from '@/lib/modules';
```

- [ ] **Step 2: Adicionar estado e seletor na linha de edição (`UsuarioRow`)**

Ajustar a assinatura de `UsuarioRow` pra receber `modulosDoUsuario`:

```tsx
function UsuarioRow({
  usuario, salas, salasDoUsuario, modulosDoUsuario,
}: {
  usuario: User;
  salas: SalaOpcao[];
  salasDoUsuario: string[];
  modulosDoUsuario: string[];
}) {
```

Logo depois de `const [selecionadas, setSelecionadas] = useState<string[]>(...)`:

```typescript
  const [modulosSel, setModulosSel] = useState<string[]>(
    usuario.role === 'master' ? MODULES.map((m) => m.key) : modulosDoUsuario,
  );
```

Em `trocarPapel`, junto da troca de `selecionadas`:

```typescript
  function trocarPapel(novo: Role) {
    setPapel(novo);
    setSelecionadas(novo === 'master' ? salas.map((s) => s.id) : salasDoUsuario);
    setModulosSel(novo === 'master' ? MODULES.map((m) => m.key) : modulosDoUsuario);
  }
```

Logo depois do `<SeletorSalas ... />` dentro do `<form>`:

```tsx
        <SeletorModulos
          modulos={MODULES}
          selecionados={modulosSel}
          onChange={setModulosSel}
          desabilitado={papel === 'master'}
          dica={papel === 'master' ? DICA_MASTER : undefined}
        />
```

- [ ] **Step 3: Passar `modulosDoUsuario` de `UsuariosClient` pra cada `UsuarioRow`**

Ajustar a assinatura de `UsuariosClient`:

```tsx
export function UsuariosClient({
  usuarios, salas, membros, modulosPorUsuario,
}: {
  usuarios: User[];
  salas: SalaOpcao[];
  membros: Record<string, string[]>;
  modulosPorUsuario: Record<string, string[]>;
}) {
```

E no `.map`:

```tsx
        {usuarios.map((u) => (
          <UsuarioRow
            key={u.id} usuario={u} salas={salas} salasDoUsuario={membros[u.id] ?? []}
            modulosDoUsuario={modulosPorUsuario[u.id] ?? []}
          />
        ))}
```

- [ ] **Step 4: Adicionar seletor no formulário de novo usuário**

Junto dos estados do topo de `UsuariosClient`:

```typescript
  const [modulosNovo, setModulosNovo] = useState<string[]>([]);
```

Em `trocarPapel` (a função do formulário de criação, não a de `UsuarioRow`):

```typescript
  function trocarPapel(novo: Role) {
    setPapel(novo);
    setSelecionadas(novo === 'master' ? salas.map((s) => s.id) : []);
    setModulosNovo(novo === 'master' ? MODULES.map((m) => m.key) : []);
  }
```

Logo depois do `<SeletorSalas ... />` no form de "Novo usuário":

```tsx
        <SeletorModulos
          modulos={MODULES}
          selecionados={modulosNovo}
          onChange={setModulosNovo}
          desabilitado={papel === 'master'}
          dica={papel === 'master' ? DICA_MASTER : undefined}
        />
```

- [ ] **Step 5: Testar manualmente**

Run: `npm run dev`, acessar `/admin/usuarios` logado como master.
Expected: cada linha de usuário e o form de novo usuário mostram "Módulos externos com acesso"
com checkbox "Gestão de Projetos"; marcar/desmarcar e salvar reflete ao recarregar a página; ao
trocar papel pra master, os checkboxes ficam marcados e desabilitados.

- [ ] **Step 6: Commit**

```bash
git add app/admin/usuarios/UsuariosClient.tsx
git commit -m "feat: checkbox de acesso a modulo externo na tela de usuario"
```

---

### Task 9: Link condicional no menu (`Nav`)

**Files:**
- Modify: `components/Nav.tsx`

**Interfaces:**
- Consumes: `listModulesOfUser` de `@/lib/db/queries` (Task 3), `MODULES` de `@/lib/modules`
  (Task 2).

- [ ] **Step 1: Tornar `Nav` async e resolver os módulos do actor**

```tsx
import Link from 'next/link';
import { logout } from '@/app/login/actions';
import { listModulesOfUser } from '@/lib/db/queries';
import { MODULES } from '@/lib/modules';
import type { Actor } from '@/lib/types';

export async function Nav({ actor }: { actor: Actor }) {
  const modulosLiberados =
    actor.role === 'master' ? MODULES.map((m) => m.key) : await listModulesOfUser(actor.id);
  const modulosVisiveis = MODULES.filter((m) => modulosLiberados.includes(m.key));

  return (
    <header className="glass mx-4 mt-4 px-5 py-3 flex items-center gap-4">
      <Link href="/" className="font-semibold">🔐 Cofre</Link>
      <nav className="flex items-center gap-3 text-sm" style={{ color: 'var(--text-dim)' }}>
        <Link href="/">Salas</Link>
        {modulosVisiveis.map((m) => (
          <Link key={m.key} href={m.href}>{m.label}</Link>
        ))}
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
        <Link href="/trocar-senha" style={{ color: 'var(--text-dim)' }}>Trocar senha</Link>
        <form action={logout}>
          <button className="btn" type="submit">Sair</button>
        </form>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Testar manualmente**

Run: `npm run dev`. Logar como usuário comum sem módulo concedido → sem link "Gestão de
Projetos" no menu. Marcar o módulo na Task 8 pra esse usuário, relogar → link aparece. Logar como
master → link sempre aparece.

- [ ] **Step 3: Commit**

```bash
git add components/Nav.tsx
git commit -m "feat: menu mostra modulo externo apenas se usuario tem acesso"
```

---

## Parte B — Gestor de Projetos: cutover de autenticação pro SSO do Cofre

> Repositório: `C:\Users\2P CONNECT\Desktop\gestor projetos 1\app` (fora do repo do Cofre — sem
> controle de versão compartilhado; confirmar se esse projeto também está em git antes do Task 10
> — se não estiver, iniciar um repo lá antes de seguir).

### Task 10: `jose` + validação da sessão do Cofre

**Files:**
- Modify: `api/_lib/auth.ts` (substitui HMAC próprio por verificação do JWT do Cofre)
- Modify: `package.json` (nova dependência `jose`)

**Interfaces:**
- Consumes: `SESSION_SECRET` (env, mesmo valor do Cofre), `req.cookies.cofre_session`
  (populado automaticamente pelo runtime do Vercel Functions).
- Produces: `requireAuth(req, res): Promise<string | null>` — mesma assinatura de retorno de
  antes (id do usuário ou `null` já respondendo 401), agora **assíncrona**; consumida pelas
  Tasks 11 e 12.

- [ ] **Step 1: Instalar `jose`**

Run: `npm install jose`
Expected: `jose` aparece em `dependencies` no `package.json`.

- [ ] **Step 2: Reescrever `api/_lib/auth.ts`**

```typescript
import { jwtVerify } from 'jose'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getPool } from './db.js'

// Mesmo segredo e mesmo cookie do Cofre de Senhas (lib/auth/session.ts). O Gestor de
// Projetos não emite mais o próprio token: só valida o que o Cofre assinou.
const COOKIE = 'cofre_session'

function secret(): Uint8Array {
  const s = process.env.SESSION_SECRET ?? ''
  if (!s) throw new Error('SESSION_SECRET não configurada')
  return new TextEncoder().encode(s)
}

async function verifyCofreSession(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ['HS256'] })
    return typeof payload.sub === 'string' ? payload.sub : null
  } catch {
    return null
  }
}

/**
 * Usuário ativo e com o módulo 'gestao' liberado, direto nas tabelas do Cofre
 * (public.users / public.module_access) — mesmo banco Postgres, schema diferente
 * do usado pelas entidades deste app (SCHEMA = 'gestor_projetos').
 */
async function temAcessoAoModulo(userId: string): Promise<boolean> {
  const pool = getPool()
  const { rows } = await pool.query(
    `SELECT role, is_active FROM public.users WHERE id = $1`,
    [userId],
  )
  const user = rows[0] as { role: string; is_active: boolean } | undefined
  if (!user || !user.is_active) return false
  if (user.role === 'master') return true

  const acesso = await pool.query(
    `SELECT 1 FROM public.module_access WHERE user_id = $1 AND module_key = 'gestao'`,
    [userId],
  )
  return (acesso.rowCount ?? 0) > 0
}

// Retorna o userId autenticado ou responde 401/403 e retorna null.
export async function requireAuth(
  req: VercelRequest, res: VercelResponse,
): Promise<string | null> {
  const token = req.cookies?.[COOKIE]
  const userId = token ? await verifyCofreSession(token) : null
  if (!userId) {
    res.status(401).json({ error: 'Não autenticado' })
    return null
  }
  if (!(await temAcessoAoModulo(userId))) {
    res.status(403).json({ error: 'Sem acesso a este módulo' })
    return null
  }
  return userId
}
```

- [ ] **Step 3: Atualizar os dois call sites pra `await`**

Em `api/[entity].ts` e `api/[entity]/[id].ts`, trocar:

```typescript
  if (!requireAuth(req, res)) return
```

por:

```typescript
  if (!(await requireAuth(req, res))) return
```

- [ ] **Step 4: Apagar o endpoint de login antigo**

Run: `rm api/login.ts`
Expected: arquivo removido — login passa a acontecer só no Cofre.

- [ ] **Step 5: Testar manualmente contra o `vite dev` local**

Requer `SESSION_SECRET` e `DATABASE_URL` (apontando pro mesmo banco do Cofre) no `.env` deste
projeto.

Run: `npm run dev`, depois em outro terminal:
```bash
curl -i http://localhost:5173/api/users
```
Expected: `401 {"error":"Não autenticado"}` (sem cookie). Logar no Cofre local, copiar o valor do
cookie `cofre_session` do navegador e repetir com
`curl -i http://localhost:5173/api/users -H "Cookie: cofre_session=<valor>"` — espera `200` se o
usuário logado for master ou tiver `module_access` pra `'gestao'`, `403` caso contrário.

- [ ] **Step 6: Commit**

```bash
git add api/_lib/auth.ts api/[entity].ts "api/[entity]/[id].ts" api/login.ts package.json package-lock.json
git commit -m "feat: valida sessao do Cofre em vez de login proprio"
```

---

### Task 11: Frontend — cookie em vez de token Bearer

**Files:**
- Modify: `src/services/api.ts`
- Modify: `src/stores/authStore.ts`
- Delete: `src/pages/Login.tsx`
- Modify: `src/App.tsx`
- Modify: `src/layouts/AppLayout.tsx`

**Interfaces:**
- Produces: `useAuthStore` sem mais `token`/`login`; `AppLayout` redireciona pro `/login` do
  Cofre (fora do basename) em vez de renderizar `<Login />` local.

- [ ] **Step 1: `api.ts` — enviar cookie em vez de header `Authorization`**

Em `src/services/api.ts`, a função `http`:

```typescript
async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/${path}`, {
    ...init,
    credentials: 'include',
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
  })
  if (res.status === 401 || res.status === 403) {
    // Sessão ausente/expirada ou sem acesso ao módulo: manda pro login do Cofre,
    // que fica na raiz do domínio, fora do basename /gestao deste app.
    window.location.href = '/login'
    throw new Error('Sessão expirada')
  }
  if (!res.ok) {
    const msg = await res.json().then((b) => b.error).catch(() => res.statusText)
    throw new Error(msg)
  }
  return res.status === 204 ? (undefined as T) : res.json()
}
```

Remover o `import { useAuthStore } from '../stores/authStore'` do topo do arquivo (não é mais
usado aqui).

- [ ] **Step 2: `authStore.ts` — sem token, sem login local**

```typescript
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface SessionUser {
  id: string
  name: string
  email: string
  workspace: string
  profileId: string | null
}

interface AuthState {
  user: SessionUser | null
  setUser: (user: SessionUser) => void
  logout: () => void
}

// Não guarda mais token: a sessão é o cookie httpOnly `cofre_session`, emitido e
// validado pelo Cofre de Senhas. Este store só guarda o usuário pra exibição na UI.
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      setUser: (user) => set({ user }),
      logout: () => {
        set({ user: null })
        window.location.href = '/login'
      },
    }),
    { name: 'gp-auth' },
  ),
)
```

- [ ] **Step 3: Buscar o usuário logado a partir da sessão, sem tela de login local**

Criar `src/services/session.ts`:

```typescript
export type MeResponse = {
  id: string
  name: string
  email: string
  profileId: string | null
}

/** GET /api/me — devolve o usuário da sessão do Cofre, ou lança se 401/403. */
export async function fetchMe(): Promise<MeResponse> {
  const res = await fetch('/api/me', { credentials: 'include' })
  if (!res.ok) {
    window.location.href = '/login'
    throw new Error('Sessão expirada')
  }
  return res.json()
}
```

Nota: `/api/me` é criado na Task 12 — este arquivo depende dela pra funcionar em runtime, mas
compila isoladamente.

- [ ] **Step 4: `AppLayout.tsx` — resolve o usuário na sessão em vez de checar `user` do store**

```tsx
import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from '../components/Sidebar'
import { Topbar } from '../components/Topbar'
import { useAuthStore } from '../stores/authStore'
import { useAccess } from '../lib/useAccess'
import { fetchMe } from '../services/session'
import { navItems } from '../nav'

export function AppLayout() {
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)
  const [carregando, setCarregando] = useState(!user)
  const allowed = useAccess()
  const { pathname } = useLocation()

  useEffect(() => {
    if (user) return
    fetchMe()
      .then((me) => setUser({ ...me, workspace: 'Meu Workspace' }))
      .finally(() => setCarregando(false))
    // fetchMe() já redireciona pro /login do Cofre em caso de sessão inválida.
  }, [user, setUser])

  if (carregando) return null
  if (!user) return null

  const base = `/${pathname.split('/')[1]}`
  if (!allowed(base)) {
    const first = navItems.find((i) => allowed(i.to))
    if (first) return <Navigate to={first.to} replace />
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 text-sm text-slate-500 dark:bg-slate-950 dark:text-slate-400">
        Seu perfil não tem acesso a nenhuma página. Fale com o administrador.
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="mx-auto max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
```

Adicionar de volta o import de `Navigate` que já existia:

```typescript
import { Navigate, Outlet, useLocation } from 'react-router-dom'
```

- [ ] **Step 5: Apagar a tela de login local e sua rota**

Run: `rm src/pages/Login.tsx`

Em `src/App.tsx`, remover o import de `Login` e a rota:

```typescript
import { Login } from './pages/Login'
```
```tsx
        <Route path="/login" element={<Login />} />
```

E adicionar `basename="/gestao"` no `BrowserRouter`:

```tsx
    <BrowserRouter basename="/gestao">
```

- [ ] **Step 6: Compilar**

Run: `npm run typecheck`
Expected: sem erro (confirma que nenhum lugar mais importa `Login` ou lê `token` do
`authStore`).

- [ ] **Step 7: Commit**

```bash
git add src/services/api.ts src/services/session.ts src/stores/authStore.ts src/layouts/AppLayout.tsx src/App.tsx
git rm src/pages/Login.tsx
git commit -m "feat: frontend usa sessao do Cofre via cookie, sem login proprio"
```

---

### Task 12: Endpoint `/api/me`

**Files:**
- Create: `api/me.ts`

**Interfaces:**
- Consumes: `requireAuth` (Task 10).
- Produces: `GET /api/me` → `{ id, name, email, profileId }`, consumido pelo `fetchMe` da
  Task 11.

- [ ] **Step 1: Criar o endpoint**

```typescript
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getPool } from './_lib/db.js'
import { requireAuth } from './_lib/auth.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const userId = await requireAuth(req, res)
  if (!userId) return

  const { rows } = await getPool().query(
    `SELECT id, name, email FROM public.users WHERE id = $1`,
    [userId],
  )
  const user = rows[0] as { id: string; name: string; email: string } | undefined
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' })

  return res.status(200).json({ ...user, profileId: null })
}
```

- [ ] **Step 2: Registrar a rota estática no `localApi` do `vite.config.ts` (dev local)**

Em `vite.config.ts`, dentro de `localApi()`, ajustar a linha que escolhe o módulo:

```typescript
          const modPath =
            entity === 'me' ? '/api/me.ts' : id ? '/api/[entity]/[id].ts' : '/api/[entity].ts'
```

- [ ] **Step 3: Testar manualmente**

Run: `npm run dev`, com `cofre_session` válido (mesmo processo do Task 10 Step 5):
```bash
curl -i http://localhost:5173/api/me -H "Cookie: cofre_session=<valor>"
```
Expected: `200` com `{"id":"...","name":"...","email":"...","profileId":null}`.

- [ ] **Step 4: Commit**

```bash
git add api/me.ts vite.config.ts
git commit -m "feat: endpoint /api/me expõe usuario da sessao do Cofre"
```

---

## Parte C — Roteamento entre os dois apps

### Task 13: Rewrite no Cofre pra `/gestao`

**Files:**
- Create: `vercel.json` (raiz do repo Cofre de Senhas)

**Interfaces:**
- Consumes: URL de produção do deploy do Gestor de Projetos na Vercel (projeto
  `projectmanager01`, ver `.vercel/project.json` dele) — usar
  `https://projectmanager01.vercel.app` como destino; trocar por domínio customizado depois, se
  o cliente configurar um.

- [ ] **Step 1: Criar o rewrite**

```json
{
  "rewrites": [
    { "source": "/gestao", "destination": "https://projectmanager01.vercel.app/gestao" },
    { "source": "/gestao/:path*", "destination": "https://projectmanager01.vercel.app/:path*" }
  ]
}
```

Nota: a primeira regra (sem `:path*`) evita 404 ao acessar `/gestao` sem barra — o React Router
do Gestor de Projetos, com `basename="/gestao"` (Task 11), assume a rota raiz dele mesmo (redireciona pra `/gestao/hoje`).

- [ ] **Step 2: Testar em produção após deploy dos dois projetos**

Acessar `https://<dominio>/gestao` logado no Cofre.
Expected: carrega o Gestor de Projetos, sem pedir login de novo; menu do Cofre mostra o link
"Gestão de Projetos" (Task 9) só se o usuário tiver o módulo liberado (Task 8); acessar
`/gestao` sem sessão do Cofre redireciona pra `/login` do Cofre (Task 11).

- [ ] **Step 3: Commit**

```bash
git add vercel.json
git commit -m "feat: rewrite /gestao aponta para o deploy do Gestor de Projetos"
```

---

## Ordem de execução e dependências

1. Tasks 1–9 (Parte A) são sequenciais entre si — cada uma depende da anterior.
2. Tasks 10–12 (Parte B) só fazem sentido depois da Task 3 (tabelas `module_access` já existem
   no banco) e da Task 1 — podem começar em paralelo com as Tasks 4–9, mas a Task 10 exige que o
   Gestor de Projetos aponte seu `DATABASE_URL` pro mesmo banco Neon do Cofre (mudança de
   variável de ambiente na Vercel, fora do código — configurar antes de testar a Task 10 Step 5).
3. Task 13 é a última: precisa dos dois apps já deployados com as mudanças anteriores.
4. Variáveis de ambiente a configurar manualmente na Vercel antes dos testes de integração reais:
   `SESSION_SECRET` (mesmo valor nos dois projetos) e `DATABASE_URL` do Gestor de Projetos
   apontando pro banco Neon do Cofre.
