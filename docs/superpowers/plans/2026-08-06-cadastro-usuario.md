# Cadastro Completo de Usuário — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separar a pessoa (documentos, contato, endereço) da conta de acesso (vínculo), permitindo readmissão sem conflito de CPF ou e-mail, e entregar uma tela `/usuarios` que serve master (grid + modal) e usuário comum (modal próprio).

**Architecture:** Tabela `pessoas` nova guarda identidade e contato, com CPF e RG cifrados em AES-256-GCM. `users` ganha `pessoa_id`, `data_contratacao` e `data_demissao`, e passa a representar um vínculo — uma pessoa pode ter vários ao longo do tempo. Regras de autorização ficam em funções puras em `lib/authz.ts`, reaplicadas nas server actions.

**Tech Stack:** Next.js 15 (App Router), TypeScript strict, Neon Postgres sem ORM, vitest (projetos `node` e `jsdom`), `lib/crypto.ts` (AES-256-GCM + HKDF).

**Spec:** [docs/superpowers/specs/2026-08-06-cadastro-usuario-design.md](../specs/2026-08-06-cadastro-usuario-design.md) (commit `729b8f1`)

## Global Constraints

- TypeScript strict. `npx tsc --noEmit` precisa sair limpo ao fim de toda task.
- `npm test` precisa passar inteiro ao fim de toda task. Base atual: **78 testes**.
- Nenhuma dependência de runtime nova. Nenhuma variável de ambiente nova.
- Identificadores em português, como no resto do projeto (`camposEditaveis`, `podeRevelarDados`, `grupoAberto`).
- `sql.transaction([...])` do Neon recebe um **array** de queries e **não é interativo**: não existe "insert … returning id" utilizável dentro da transação. Todo id necessário à transação é gerado na aplicação com `randomUUID()` antes dela.
- AAD da cifragem: `${pessoa_id}:cpf` e `${pessoa_id}:rg`. Nunca `user_id`.
- Nenhuma consulta que desenhe lista pode selecionar `cpf_ct`, `cpf_iv`, `cpf_tag`, `rg_ct`, `rg_iv` ou `rg_tag`. Blob cifrado só é lido pela action de revelar, de uma pessoa por vez.
- Autorização é reaplicada no servidor. Campo escondido ou desabilitado na tela é cosmético.
- Não escrever teste que jsdom não consegue verificar de verdade: layout, máscara de digitação e foco real ficam fora da suíte automatizada.

### Desvio consciente da spec

A spec (seção 7) declara `camposEditaveis(actor, alvoUserId): 'todos' | 'contato'`. Com apenas esses dois valores, um usuário comum apontando para **outra** pessoa receberia `'contato'` e poderia alterar telefone e endereço alheios — o oposto do que a matriz da mesma seção define. O tipo passa a ser **`'todos' | 'contato' | 'nenhum'`**, e a Task 4 cobre as quatro combinações de ator × alvo.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `lib/documentos.ts` (novo) | Validar e mascarar CPF, CNPJ, CEP e telefone. Sem I/O. |
| `lib/crypto.ts` (modificar) | Ganha `cpfHmac()` — HMAC determinístico para o índice único. |
| `lib/authz.ts` (modificar) | Ganha `camposEditaveis()` e `podeRevelarDados()`. |
| `db/migrations/004_pessoas.sql` (novo) | Tabela `pessoas`, colunas em `users`, backfill, índice parcial de e-mail. |
| `lib/types.ts` (modificar) | Tipos `Pessoa` e `UserComContato`. |
| `lib/db/pessoas.ts` (novo) | Consultas de `pessoas`, incluindo cifrar/decifrar documentos. |
| `lib/db/users.ts` (modificar) | Filtro de vínculo encerrado, `listUsersComContato`, criação com `pessoa_id`. |
| `app/(app)/usuarios/actions.ts` (novo) | Server actions: salvar, revelar, buscar CEP. |
| `app/(app)/usuarios/page.tsx` (novo) | Server component; decide grid vs modal pelo papel. |
| `app/(app)/usuarios/UsuariosClient.tsx` (novo) | Grid + modal. |
| `app/(app)/admin/usuarios/` (remover) | Tela antiga sai inteira. |
| `components/Sidebar.tsx` (modificar) | Item "Usuários" aponta para `/usuarios` e fica visível a todos. |

---

## Task 1: Validação e máscara de documentos

**Files:**
- Create: `lib/documentos.ts`
- Test: `tests/documentos.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `soDigitos(valor: string): string`
  - `validarCpf(valor: string): boolean`
  - `validarCnpj(valor: string): boolean`
  - `mascararCpf(digitos: string): string`
  - `mascararCnpj(digitos: string): string`
  - `mascararCep(digitos: string): string`
  - `mascararTelefone(digitos: string): string`

- [ ] **Step 1: Escrever os testes que falham**

Criar `tests/documentos.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  mascararCep, mascararCnpj, mascararCpf, mascararTelefone,
  soDigitos, validarCnpj, validarCpf,
} from '@/lib/documentos';

describe('soDigitos', () => {
  it('remove tudo que não é dígito', () => {
    expect(soDigitos('529.982.247-25')).toBe('52998224725');
    expect(soDigitos('(11) 98765-4321')).toBe('11987654321');
    expect(soDigitos('')).toBe('');
  });
});

describe('validarCpf', () => {
  it('aceita CPF válido com e sem máscara', () => {
    expect(validarCpf('529.982.247-25')).toBe(true);
    expect(validarCpf('52998224725')).toBe(true);
  });

  it('rejeita dígito verificador errado', () => {
    expect(validarCpf('529.982.247-26')).toBe(false);
  });

  it('rejeita sequência repetida, que passa no cálculo mas nunca é documento real', () => {
    expect(validarCpf('111.111.111-11')).toBe(false);
    expect(validarCpf('00000000000')).toBe(false);
    expect(validarCpf('99999999999')).toBe(false);
  });

  it('rejeita tamanho errado e string vazia', () => {
    expect(validarCpf('')).toBe(false);
    expect(validarCpf('5299822472')).toBe(false);
    expect(validarCpf('529982247250')).toBe(false);
  });
});

describe('validarCnpj', () => {
  it('aceita CNPJ válido com e sem máscara', () => {
    expect(validarCnpj('11.222.333/0001-81')).toBe(true);
    expect(validarCnpj('11222333000181')).toBe(true);
  });

  it('rejeita dígito verificador errado', () => {
    expect(validarCnpj('11.222.333/0001-82')).toBe(false);
  });

  it('rejeita sequência repetida', () => {
    expect(validarCnpj('11111111111111')).toBe(false);
  });

  it('rejeita tamanho errado e string vazia', () => {
    expect(validarCnpj('')).toBe(false);
    expect(validarCnpj('1122233300018')).toBe(false);
  });
});

describe('máscaras', () => {
  it('formata documentos completos', () => {
    expect(mascararCpf('52998224725')).toBe('529.982.247-25');
    expect(mascararCnpj('11222333000181')).toBe('11.222.333/0001-81');
    expect(mascararCep('01310100')).toBe('01310-100');
  });

  it('formata telefone de 11 e de 10 dígitos', () => {
    expect(mascararTelefone('11987654321')).toBe('(11) 98765-4321');
    expect(mascararTelefone('1133334444')).toBe('(11) 3333-4444');
  });

  it('devolve a entrada intacta quando o tamanho não bate, em vez de truncar', () => {
    expect(mascararCpf('529')).toBe('529');
    expect(mascararCnpj('112')).toBe('112');
    expect(mascararCep('013')).toBe('013');
    expect(mascararTelefone('119')).toBe('119');
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx vitest run tests/documentos.test.ts
```

Esperado: FAIL — `Failed to resolve import "@/lib/documentos"`.

- [ ] **Step 3: Implementar**

Criar `lib/documentos.ts`:

```ts
/**
 * Validação e formatação de documentos brasileiros. Sem I/O e sem dependência de
 * banco: o banco guarda só dígitos, e máscara é assunto de apresentação.
 */

export function soDigitos(valor: string): string {
  return valor.replace(/\D/g, '');
}

/** Todos os dígitos iguais passam no cálculo do DV, mas nunca são documento real. */
function todosIguais(digitos: string): boolean {
  return /^(\d)\1+$/.test(digitos);
}

function digitoVerificador(digitos: string, pesos: number[]): number {
  const soma = pesos.reduce((acc, peso, i) => acc + Number(digitos[i]) * peso, 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function validarCpf(valor: string): boolean {
  const d = soDigitos(valor);
  if (d.length !== 11 || todosIguais(d)) return false;

  const dv1 = digitoVerificador(d, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const dv2 = digitoVerificador(d, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return dv1 === Number(d[9]) && dv2 === Number(d[10]);
}

export function validarCnpj(valor: string): boolean {
  const d = soDigitos(valor);
  if (d.length !== 14 || todosIguais(d)) return false;

  const dv1 = digitoVerificador(d, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const dv2 = digitoVerificador(d, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return dv1 === Number(d[12]) && dv2 === Number(d[13]);
}

/**
 * As máscaras devolvem a entrada intacta quando o tamanho não bate. Truncar ou
 * completar esconderia dado ruim atrás de um formato bonito.
 */
export function mascararCpf(digitos: string): string {
  const d = soDigitos(digitos);
  if (d.length !== 11) return digitos;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function mascararCnpj(digitos: string): string {
  const d = soDigitos(digitos);
  if (d.length !== 14) return digitos;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function mascararCep(digitos: string): string {
  const d = soDigitos(digitos);
  if (d.length !== 8) return digitos;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

export function mascararTelefone(digitos: string): string {
  const d = soDigitos(digitos);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return digitos;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
npx vitest run tests/documentos.test.ts
npx tsc --noEmit
```

Esperado: 15 testes passando, `tsc` sem saída.

- [ ] **Step 5: Commit**

```bash
git add lib/documentos.ts tests/documentos.test.ts
git commit -m "Adiciona validacao e mascara de CPF, CNPJ, CEP e telefone"
```

---

## Task 2: HMAC determinístico de CPF

**Files:**
- Modify: `lib/crypto.ts`
- Test: `tests/crypto.test.ts` (arquivo existente — acrescentar bloco)

**Interfaces:**
- Consumes: `soDigitos` da Task 1.
- Produces: `cpfHmac(cpfDigitos: string): Buffer`

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar ao final de `tests/crypto.test.ts`:

```ts
describe('cpfHmac', () => {
  it('é determinístico: mesma entrada, mesmo HMAC', () => {
    const a = cpfHmac('52998224725');
    const b = cpfHmac('52998224725');
    expect(a.equals(b)).toBe(true);
  });

  it('ignora máscara, porque o índice é sobre os dígitos', () => {
    expect(cpfHmac('529.982.247-25').equals(cpfHmac('52998224725'))).toBe(true);
  });

  it('CPFs diferentes produzem HMACs diferentes', () => {
    expect(cpfHmac('52998224725').equals(cpfHmac('11144477735'))).toBe(false);
  });

  it('devolve 32 bytes (SHA-256)', () => {
    expect(cpfHmac('52998224725')).toHaveLength(32);
  });

  it('não é o CPF em claro nem contém o CPF', () => {
    const hmac = cpfHmac('52998224725');
    expect(hmac.toString('hex')).not.toContain('52998224725');
    expect(hmac.toString('utf8')).not.toContain('52998224725');
  });
});
```

Acrescentar `cpfHmac` ao import existente do topo do arquivo, que hoje traz `encrypt`/`decrypt`/`generateKey` de `@/lib/crypto`.

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx vitest run tests/crypto.test.ts
```

Esperado: FAIL — `cpfHmac is not a function`.

- [ ] **Step 3: Implementar**

Em `lib/crypto.ts`, trocar a linha de import do topo e acrescentar a função ao final:

```ts
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';
```

```ts
/**
 * HMAC determinístico do CPF, usado só como índice de unicidade — coluna cifrada
 * não aceita `UNIQUE`, porque cada cifragem gera IV novo e o mesmo CPF vira bytes
 * diferentes a cada gravação.
 *
 * A chave é derivada da `VAULT_KEY` por HKDF em vez de ser a própria: a mesma chave
 * não deve servir para cifrar e para indexar. Derivar também evita criar variável de
 * ambiente nova — uma a mais seria mais uma para esquecer de cadastrar na Vercel.
 *
 * Aceita entrada com ou sem máscara; o índice é sempre sobre os dígitos.
 */
export function cpfHmac(cpfDigitos: string): Buffer {
  const subchave = Buffer.from(
    hkdfSync('sha256', key(), Buffer.alloc(0), 'cpf-index', 32),
  );
  return createHmac('sha256', subchave).update(soDigitos(cpfDigitos)).digest();
}
```

E o import de `soDigitos` no topo:

```ts
import { soDigitos } from '@/lib/documentos';
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
npx vitest run tests/crypto.test.ts
npx tsc --noEmit
```

Esperado: os testes de cripto que já existiam mais os 5 novos, todos passando.

- [ ] **Step 5: Commit**

```bash
git add lib/crypto.ts tests/crypto.test.ts
git commit -m "Adiciona cpfHmac para indexar CPF sem guardar em claro"
```

---

## Task 3: Migration — tabela `pessoas` e vínculo em `users`

**Files:**
- Create: `db/migrations/004_pessoas.sql`
- Modify: `lib/types.ts`

**Interfaces:**
- Consumes: nada.
- Produces: schema com `pessoas` e `users.pessoa_id | data_contratacao | data_demissao`; tipos `Pessoa` e `UserComContato`.

- [ ] **Step 1: Conferir o nome da constraint de e-mail antes de removê-la**

```bash
node -e "const{config}=require('dotenv');config({path:'.env.local'});config();const pg=require('pg');(async()=>{const c=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:true}});await c.connect();const r=await c.query(\"select conname from pg_constraint where conrelid='users'::regclass and contype='u'\");console.log(r.rows);await c.end();})()"
```

Esperado: uma linha com `users_email_key`. **Se o nome for outro, usar o nome real no Step 2** — o `drop constraint` falha e aborta a migration inteira se o nome não existir.

- [ ] **Step 2: Escrever a migration**

Criar `db/migrations/004_pessoas.sql`:

```sql
-- Separa QUEM A PESSOA É de UM VÍNCULO DE TRABALHO.
--
-- O gatilho foi a readmissão: um funcionário demitido pode voltar, e o cadastro
-- antigo deve virar histórico em vez de ser reativado. Com tudo numa tabela só isso
-- é impossível — CPF único global barra o segundo cadastro, e e-mail único global
-- barra junto, porque a pessoa costuma receber de volta o mesmo e-mail corporativo.
--
-- Agora: 1 linha em `pessoas`, N linhas em `users` (uma por passagem).
create table pessoas (
  id                 uuid primary key default gen_random_uuid(),
  telefone           text,
  cep                text,
  logradouro         text,
  numero             text,
  complemento        text,
  bairro             text,
  cidade             text,
  uf                 text check (uf is null or uf ~ '^[A-Z]{2}$'),
  data_nascimento    date,
  -- CPF e RG cifrados (AES-256-GCM). AAD = `${pessoa_id}:cpf` / `${pessoa_id}:rg`,
  -- prendendo o valor à linha E ao campo: sem o campo no AAD, quem tiver escrita no
  -- banco copiaria rg_ct/iv/tag para cpf_ct/iv/tag e leria um pelo outro.
  cpf_ct             bytea,
  cpf_iv             bytea,
  cpf_tag            bytea,
  -- Coluna cifrada não aceita UNIQUE (IV novo a cada gravação). Este HMAC
  -- determinístico é o índice de unicidade: um CPF, uma pessoa.
  cpf_hmac           bytea unique,
  rg_ct              bytea,
  rg_iv              bytea,
  rg_tag             bytea,
  -- Órgão expedidor fica em claro: não identifica ninguém sozinho.
  rg_orgao_expedidor text,
  -- CNPJ é público na Receita; não justifica o custo de cifrar.
  cnpj               text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table users
  add column pessoa_id        uuid references pessoas(id),
  add column data_contratacao date,
  add column data_demissao    date;

-- Backfill: cada usuário existente ganha sua pessoa, reaproveitando o próprio id.
-- É migração única; ids coincidentes nas linhas antigas são inofensivos e fáceis de
-- conferir depois. Só depois disso a coluna vira NOT NULL, para o resto do código
-- nunca precisar tratar "usuário sem pessoa".
insert into pessoas (id) select id from users;
update users set pessoa_id = id;
alter table users alter column pessoa_id set not null;

-- E-mail deixa de ser único global e passa a ser único entre vínculos NÃO encerrados,
-- senão o readmitido não conseguiria reusar o e-mail corporativo enquanto a linha
-- antiga existisse. O recorte é `data_demissao is null`, e não `is_active`: suspensão
-- temporária não pode liberar o e-mail de alguém para outra pessoa.
alter table users drop constraint users_email_key;
create unique index users_email_ativo_idx on users (email) where data_demissao is null;

create index users_pessoa_idx on users (pessoa_id);
```

- [ ] **Step 3: Aplicar e conferir o resultado**

```bash
npm run migrate
```

Esperado: `+ aplicando 004_pessoas.sql...` seguido de sucesso.

```bash
node -e "const{config}=require('dotenv');config({path:'.env.local'});config();const pg=require('pg');(async()=>{const c=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:true}});await c.connect();console.log('usuarios sem pessoa:',(await c.query('select count(*)::int n from users where pessoa_id is null')).rows[0].n);console.log('pessoas:',(await c.query('select count(*)::int n from pessoas')).rows[0].n);console.log('usuarios:',(await c.query('select count(*)::int n from users')).rows[0].n);await c.end();})()"
```

Esperado: `usuarios sem pessoa: 0`, e `pessoas` com a mesma contagem de `usuarios`.

- [ ] **Step 4: Acrescentar os tipos**

Em `lib/types.ts`, acrescentar após o tipo `User` existente:

```ts
/**
 * Dados da pessoa sem os blobs cifrados. `tem_cpf` e `tem_rg` são derivados no SQL
 * (`cpf_ct is not null`) para a tela saber se deve oferecer o botão de revelar sem
 * carregar o documento cifrado só para desenhar o formulário.
 */
export type Pessoa = {
  id: string;
  telefone: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  data_nascimento: string | null;
  rg_orgao_expedidor: string | null;
  cnpj: string | null;
  tem_cpf: boolean;
  tem_rg: boolean;
};

/** Linha da grid de usuários: o vínculo mais o telefone, que vive em `pessoas`. */
export type UserComContato = User & {
  pessoa_id: string;
  telefone: string | null;
  data_contratacao: string | null;
  data_demissao: string | null;
};
```

- [ ] **Step 5: Conferir e commitar**

```bash
npx tsc --noEmit
npm test
```

Esperado: `tsc` sem saída; 83 testes passando (78 anteriores + 5 de `cpfHmac`).

```bash
git add db/migrations/004_pessoas.sql lib/types.ts
git commit -m "Cria tabela pessoas e transforma users em vinculo"
```

---

## Task 4: Regras de autorização do cadastro

**Files:**
- Modify: `lib/authz.ts`
- Test: `tests/authz.test.ts` (arquivo existente — acrescentar bloco)

**Interfaces:**
- Consumes: `Actor` de `lib/types.ts`.
- Produces:
  - `type EscopoCampos = 'todos' | 'contato' | 'nenhum'`
  - `camposEditaveis(actor: Actor, alvoUserId: string): EscopoCampos`
  - `podeRevelarDados(actor: Actor, alvoUserId: string): boolean`

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar ao final de `tests/authz.test.ts`:

```ts
describe('camposEditaveis', () => {
  const master: Actor = {
    id: 'm1', email: 'm@x.com', name: 'Master', role: 'master', mustChangePassword: false,
  };
  const comum: Actor = {
    id: 'u1', email: 'u@x.com', name: 'Comum', role: 'user', mustChangePassword: false,
  };

  it('master edita tudo de qualquer pessoa', () => {
    expect(camposEditaveis(master, 'u1')).toBe('todos');
  });

  it('master edita tudo de si mesmo', () => {
    expect(camposEditaveis(master, 'm1')).toBe('todos');
  });

  it('comum edita só o contato do próprio cadastro', () => {
    expect(camposEditaveis(comum, 'u1')).toBe('contato');
  });

  it('comum não edita nada de outra pessoa', () => {
    expect(camposEditaveis(comum, 'u2')).toBe('nenhum');
  });
});

describe('podeRevelarDados', () => {
  const master: Actor = {
    id: 'm1', email: 'm@x.com', name: 'Master', role: 'master', mustChangePassword: false,
  };
  const comum: Actor = {
    id: 'u1', email: 'u@x.com', name: 'Comum', role: 'user', mustChangePassword: false,
  };

  it('master revela documento de qualquer pessoa', () => {
    expect(podeRevelarDados(master, 'u1')).toBe(true);
  });

  it('dono revela o próprio documento', () => {
    expect(podeRevelarDados(comum, 'u1')).toBe(true);
  });

  it('comum não revela documento de outra pessoa', () => {
    expect(podeRevelarDados(comum, 'u2')).toBe(false);
  });

  it('master revela o próprio documento', () => {
    expect(podeRevelarDados(master, 'm1')).toBe(true);
  });
});
```

Acrescentar `camposEditaveis` e `podeRevelarDados` ao import existente de `@/lib/authz` no topo do arquivo.

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx vitest run tests/authz.test.ts
```

Esperado: FAIL — `camposEditaveis is not a function`.

- [ ] **Step 3: Implementar**

Acrescentar ao final de `lib/authz.ts`:

```ts
/**
 * O que o ator pode escrever no cadastro de `alvoUserId`.
 *
 * `'contato'` cobre telefone e os sete campos de endereço. Fora disso é `'todos'`
 * (master) ou `'nenhum'`.
 *
 * O terceiro valor existe porque `'todos' | 'contato'` deixaria um usuário comum
 * apontando para outra pessoa cair em `'contato'` — ou seja, alterando telefone e
 * endereço alheios.
 */
export type EscopoCampos = 'todos' | 'contato' | 'nenhum';

export function camposEditaveis(actor: Actor, alvoUserId: string): EscopoCampos {
  if (isMaster(actor)) return 'todos';
  if (actor.id === alvoUserId) return 'contato';
  return 'nenhum';
}

/**
 * Revelar CPF e RG é restrito ao dono do dado e ao master. Toda revelação é
 * auditada por quem chama (`action: 'view'`, `entityType: 'user'`).
 */
export function podeRevelarDados(actor: Actor, alvoUserId: string): boolean {
  return isMaster(actor) || actor.id === alvoUserId;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
npx vitest run tests/authz.test.ts
npx tsc --noEmit
```

Esperado: os testes de authz que já existiam mais os 8 novos.

- [ ] **Step 5: Commit**

```bash
git add lib/authz.ts tests/authz.test.ts
git commit -m "Adiciona regras de edicao e revelacao do cadastro de pessoa"
```

---

## Task 5: Camada de dados de `pessoas` e ajustes em `users`

**Files:**
- Create: `lib/db/pessoas.ts`
- Modify: `lib/db/users.ts`

**Interfaces:**
- Consumes: `cpfHmac`, `encrypt`, `decrypt` de `lib/crypto.ts`; `soDigitos` de `lib/documentos.ts`; `Pessoa`, `UserComContato` de `lib/types.ts`.
- Produces:
  - `getPessoa(id: string): Promise<Pessoa | null>`
  - `findPessoaIdByCpf(cpf: string): Promise<string | null>`
  - `revelarDocumentos(pessoaId: string): Promise<{ cpf: string | null; rg: string | null }>`
  - `updateContato(pessoaId: string, dados: DadosContato): Promise<void>`
  - `updatePessoa(pessoaId: string, dados: DadosPessoa): Promise<void>`
  - `type DadosContato`, `type DadosPessoa`
  - `listUsersComContato(incluirDesligados: boolean): Promise<UserComContato[]>`
  - `getUserComContato(id: string): Promise<UserComContato | null>`
  - `createUserComPessoa(...)` — assinatura no Step 3
  - `listVinculosDaPessoa(pessoaId: string): Promise<VinculoResumo[]>`

- [ ] **Step 1: Criar o módulo de `pessoas`**

Criar `lib/db/pessoas.ts`:

```ts
import { sql } from '@/lib/db/client';
import { decrypt, encrypt } from '@/lib/crypto';
import { cpfHmac } from '@/lib/crypto';
import { soDigitos } from '@/lib/documentos';
import { assertUuid } from '@/lib/validation';
import type { Pessoa } from '@/lib/types';

/** Campos que o próprio dono pode alterar. */
export type DadosContato = {
  telefone: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
};

/** Contato mais o que só o master altera. `cpf` e `rg` vêm em claro e são cifrados aqui. */
export type DadosPessoa = DadosContato & {
  data_nascimento: string | null;
  cpf: string | null;
  rg: string | null;
  rg_orgao_expedidor: string | null;
  cnpj: string | null;
};

/**
 * Seleção explícita, sem `select *`: os blobs cifrados nunca saem daqui para desenhar
 * tela. `tem_cpf`/`tem_rg` dizem se existe documento guardado, o suficiente para a
 * tela decidir se mostra o botão de revelar.
 */
export async function getPessoa(id: string): Promise<Pessoa | null> {
  assertUuid(id);
  const rows = (await sql`
    select id, telefone, cep, logradouro, numero, complemento, bairro, cidade, uf,
           data_nascimento, rg_orgao_expedidor, cnpj,
           (cpf_ct is not null) as tem_cpf,
           (rg_ct is not null) as tem_rg
      from pessoas where id = ${id}`) as Pessoa[];
  return rows[0] ?? null;
}

/** Usado no cadastro para detectar readmissão: CPF já conhecido → pessoa já existe. */
export async function findPessoaIdByCpf(cpf: string): Promise<string | null> {
  const digitos = soDigitos(cpf);
  if (digitos.length !== 11) return null;
  const rows = (await sql`
    select id from pessoas where cpf_hmac = ${cpfHmac(digitos)}`) as { id: string }[];
  return rows[0]?.id ?? null;
}

/**
 * Única função que lê os blobs cifrados. Quem chama já checou `podeRevelarDados` e
 * é responsável por auditar.
 */
export async function revelarDocumentos(
  pessoaId: string,
): Promise<{ cpf: string | null; rg: string | null }> {
  assertUuid(pessoaId);
  const rows = (await sql`
    select cpf_ct, cpf_iv, cpf_tag, rg_ct, rg_iv, rg_tag
      from pessoas where id = ${pessoaId}`) as {
        cpf_ct: Buffer | null; cpf_iv: Buffer | null; cpf_tag: Buffer | null;
        rg_ct: Buffer | null; rg_iv: Buffer | null; rg_tag: Buffer | null;
      }[];
  const r = rows[0];
  if (!r) return { cpf: null, rg: null };

  const cpf = r.cpf_ct && r.cpf_iv && r.cpf_tag
    ? decrypt({ ct: r.cpf_ct, iv: r.cpf_iv, tag: r.cpf_tag }, `${pessoaId}:cpf`)
    : null;
  const rg = r.rg_ct && r.rg_iv && r.rg_tag
    ? decrypt({ ct: r.rg_ct, iv: r.rg_iv, tag: r.rg_tag }, `${pessoaId}:rg`)
    : null;
  return { cpf, rg };
}

// (não existe outra função de leitura aqui: quem precisa do documento chama
// `revelarDocumentos`, que é a única que toca nos blobs cifrados.)

export async function updateContato(pessoaId: string, d: DadosContato): Promise<void> {
  assertUuid(pessoaId);
  await sql`
    update pessoas
       set telefone = ${d.telefone}, cep = ${d.cep}, logradouro = ${d.logradouro},
           numero = ${d.numero}, complemento = ${d.complemento}, bairro = ${d.bairro},
           cidade = ${d.cidade}, uf = ${d.uf}, updated_at = now()
     where id = ${pessoaId}`;
}

/**
 * Atualiza o cadastro inteiro. CPF e RG só são regravados quando vêm preenchidos:
 * campo em branco no formulário significa "não mexi nele", não "apague o documento" —
 * a tela mostra o documento mascarado, então o master normalmente salva sem redigitar.
 * Para limpar, existe a string `'-'`, tratada como remoção explícita.
 */
export async function updatePessoa(pessoaId: string, d: DadosPessoa): Promise<void> {
  assertUuid(pessoaId);
  await updateContato(pessoaId, d);

  await sql`
    update pessoas
       set data_nascimento = ${d.data_nascimento},
           rg_orgao_expedidor = ${d.rg_orgao_expedidor},
           cnpj = ${d.cnpj ? soDigitos(d.cnpj) : null},
           updated_at = now()
     where id = ${pessoaId}`;

  if (d.cpf === '-') {
    await sql`
      update pessoas set cpf_ct = null, cpf_iv = null, cpf_tag = null, cpf_hmac = null
       where id = ${pessoaId}`;
  } else if (d.cpf) {
    const digitos = soDigitos(d.cpf);
    const e = encrypt(digitos, `${pessoaId}:cpf`);
    await sql`
      update pessoas
         set cpf_ct = ${e.ct}, cpf_iv = ${e.iv}, cpf_tag = ${e.tag},
             cpf_hmac = ${cpfHmac(digitos)}
       where id = ${pessoaId}`;
  }

  if (d.rg === '-') {
    await sql`
      update pessoas set rg_ct = null, rg_iv = null, rg_tag = null where id = ${pessoaId}`;
  } else if (d.rg) {
    const e = encrypt(d.rg.trim(), `${pessoaId}:rg`);
    await sql`
      update pessoas set rg_ct = ${e.ct}, rg_iv = ${e.iv}, rg_tag = ${e.tag}
       where id = ${pessoaId}`;
  }
}
```

- [ ] **Step 2: Ajustar `lib/db/users.ts`**

Substituir `findUserByEmail` e acrescentar as funções novas:

```ts
/**
 * Login ignora vínculo encerrado. Depois de uma readmissão existem duas linhas com o
 * mesmo e-mail; sem este filtro a função devolveria `rows[0]`, que poderia ser a conta
 * antiga — quebrando o login da atual em silêncio, sem erro e sem log.
 */
export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const rows = (await sql`
    select * from users
     where email = ${email.toLowerCase()} and data_demissao is null
  `) as UserRow[];
  return rows[0] ?? null;
}
```

Acrescentar ao final do arquivo:

```ts
/** Linha da grid. Não traz nenhum blob cifrado — documento só sai pela action de revelar. */
export async function listUsersComContato(
  incluirDesligados: boolean,
): Promise<UserComContato[]> {
  return (await sql`
    select u.id, u.email, u.name, u.role, u.is_active, u.must_change_password,
           u.created_at, u.pessoa_id, u.data_contratacao, u.data_demissao,
           p.telefone
      from users u
      join pessoas p on p.id = u.pessoa_id
     where ${incluirDesligados} or u.data_demissao is null
     order by u.data_demissao nulls first, u.name`) as UserComContato[];
}

export async function getUserComContato(id: string): Promise<UserComContato | null> {
  const rows = (await sql`
    select u.id, u.email, u.name, u.role, u.is_active, u.must_change_password,
           u.created_at, u.pessoa_id, u.data_contratacao, u.data_demissao,
           p.telefone
      from users u
      join pessoas p on p.id = u.pessoa_id
     where u.id = ${id}`) as UserComContato[];
  return rows[0] ?? null;
}

/** Passagens anteriores da mesma pessoa, para o histórico do modal. */
export type VinculoResumo = {
  id: string;
  name: string;
  email: string;
  data_contratacao: string | null;
  data_demissao: string | null;
};

export async function listVinculosDaPessoa(pessoaId: string): Promise<VinculoResumo[]> {
  return (await sql`
    select id, name, email, data_contratacao, data_demissao
      from users where pessoa_id = ${pessoaId}
     order by data_contratacao nulls last, created_at`) as VinculoResumo[];
}

/**
 * Cria pessoa e vínculo numa transação. `pessoaId` vem pronto de quem chama:
 * `sql.transaction([...])` do Neon recebe um array de queries e não é interativo,
 * então não existe "insert ... returning id" utilizável no meio dela — e o AAD da
 * cifragem depende do id existir antes.
 *
 * Passar `pessoaId` de uma pessoa que já existe é o caminho da readmissão: cria só o
 * vínculo novo, apontando para ela.
 */
export async function createUserComPessoa(args: {
  userId: string;
  pessoaId: string;
  pessoaJaExiste: boolean;
  email: string;
  name: string;
  hash: string;
  role: Role;
  dataContratacao: string | null;
}): Promise<void> {
  const queries = [];
  if (!args.pessoaJaExiste) {
    queries.push(sql`insert into pessoas (id) values (${args.pessoaId})`);
  }
  queries.push(sql`
    insert into users (id, email, name, password_hash, role, must_change_password,
                       pessoa_id, data_contratacao)
    values (${args.userId}, ${args.email.toLowerCase()}, ${args.name}, ${args.hash},
            ${args.role}, true, ${args.pessoaId}, ${args.dataContratacao})`);
  await sql.transaction(queries);
}

/**
 * Atualiza o vínculo. Gravar `data_demissao` desativa o acesso na MESMA transação: o
 * risco concreto é alguém sair da empresa e seguir com acesso ao cofre porque ninguém
 * lembrou de desmarcar "ativo". Limpar a data não reativa — reativar é decisão
 * consciente, feita na caixa "ativo".
 */
export async function updateVinculo(args: {
  id: string;
  name: string;
  role: Role;
  isActive: boolean;
  dataContratacao: string | null;
  dataDemissao: string | null;
}): Promise<void> {
  const ativo = args.dataDemissao ? false : args.isActive;
  await sql`
    update users
       set name = ${args.name}, role = ${args.role}, is_active = ${ativo},
           data_contratacao = ${args.dataContratacao},
           data_demissao = ${args.dataDemissao}, updated_at = now()
     where id = ${args.id}`;
}
```

Acrescentar `UserComContato` ao import de `@/lib/types` no topo do arquivo.

- [ ] **Step 3: Conferir compilação e suíte**

```bash
npx tsc --noEmit
npm test
```

Esperado: `tsc` sem saída; 91 testes passando (83 + 8 de authz).

- [ ] **Step 4: Commit**

```bash
git add lib/db/pessoas.ts lib/db/users.ts
git commit -m "Adiciona camada de dados de pessoas e vinculo"
```

---

## Task 6: Server actions do cadastro

**Files:**
- Create: `app/(app)/usuarios/actions.ts`

**Interfaces:**
- Consumes: tudo das Tasks 1, 2, 4 e 5; `requireReadyUser`/`requireMaster` de `lib/auth/guards.ts`; `audit` de `lib/db/audit.ts`; `setUserRooms`/`setUserModules`/`listRoomsOfUser`/`listModulesOfUser` de `lib/db/queries.ts`.
- Produces: `salvarCadastro`, `criarUsuario`, `revelarDocumentosAction`, `buscarCep`, `resetUserPassword`, `type CadastroState`.

- [ ] **Step 1: Implementar as actions**

Criar `app/(app)/usuarios/actions.ts`:

```ts
'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { requireMaster, requireReadyUser } from '@/lib/auth/guards';
import { hashPassword } from '@/lib/auth/password';
import { camposEditaveis, podeRevelarDados } from '@/lib/authz';
import { audit } from '@/lib/db/audit';
import { listModulesOfUser, listRoomsOfUser, setUserModules, setUserRooms } from '@/lib/db/queries';
import {
  findPessoaIdByCpf, getPessoa, revelarDocumentos, updateContato, updatePessoa,
} from '@/lib/db/pessoas';
import {
  createUserComPessoa, getUserComContato, setPassword, updateVinculo,
} from '@/lib/db/users';
import { soDigitos, validarCnpj, validarCpf } from '@/lib/documentos';
import { MODULES } from '@/lib/modules';
import { isUuid } from '@/lib/validation';
import type { Role } from '@/lib/types';

export type CadastroState = { error?: string; ok?: string; pessoaExistenteId?: string };

/** `''` vira `null`: campo em branco é ausência de dado, não string vazia no banco. */
function ouNulo(fd: FormData, campo: string): string | null {
  const v = String(fd.get(campo) ?? '').trim();
  return v === '' ? null : v;
}

function lerContato(fd: FormData) {
  const tel = ouNulo(fd, 'telefone');
  const cep = ouNulo(fd, 'cep');
  return {
    telefone: tel ? soDigitos(tel) : null,
    cep: cep ? soDigitos(cep) : null,
    logradouro: ouNulo(fd, 'logradouro'),
    numero: ouNulo(fd, 'numero'),
    complemento: ouNulo(fd, 'complemento'),
    bairro: ouNulo(fd, 'bairro'),
    cidade: ouNulo(fd, 'cidade'),
    uf: ouNulo(fd, 'uf')?.toUpperCase() ?? null,
  };
}

/**
 * Salva o cadastro de um usuário existente. O escopo do que pode ser escrito é
 * decidido no servidor por `camposEditaveis` e o que estiver fora dele é ignorado —
 * o formulário nunca é fonte de autoridade.
 */
export async function salvarCadastro(
  _prev: CadastroState, formData: FormData,
): Promise<CadastroState> {
  const actor = await requireReadyUser();
  const id = String(formData.get('id') ?? '');
  if (!isUuid(id)) return { error: 'Usuário não encontrado.' };

  const escopo = camposEditaveis(actor, id);
  if (escopo === 'nenhum') return { error: 'Você não pode editar este cadastro.' };

  const alvo = await getUserComContato(id);
  if (!alvo) return { error: 'Usuário não encontrado.' };

  const contato = lerContato(formData);

  if (escopo === 'contato') {
    await updateContato(alvo.pessoa_id, contato);
    await audit({ actorId: actor.id, action: 'user_update', entityType: 'user', entityId: id,
                  metadata: { escopo: 'contato' } });
    revalidatePath('/usuarios');
    return { ok: 'Dados atualizados.' };
  }

  // Daqui para baixo, só master.
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return { error: 'Informe o nome.' };

  const role = String(formData.get('role') ?? 'user') as Role;
  if (role !== 'master' && role !== 'user') return { error: 'Papel inválido.' };

  const cpf = ouNulo(formData, 'cpf');
  if (cpf && cpf !== '-' && !validarCpf(cpf)) return { error: 'CPF inválido.' };

  const cnpj = ouNulo(formData, 'cnpj');
  if (cnpj && !validarCnpj(cnpj)) return { error: 'CNPJ inválido.' };

  const salas = formData.getAll('salas').map(String);
  const modulos = formData.getAll('modulos').map(String);
  if (salas.some((s) => !isUuid(s))) return { error: 'Sala inválida na seleção.' };
  if (modulos.some((m) => !MODULES.some((x) => x.key === m))) {
    return { error: 'Módulo inválido na seleção.' };
  }

  // O master não pode mudar o próprio papel nem se desativar: `requireMaster()` relê o
  // usuário do banco a cada request, então isso travaria o /admin sem recuperação.
  let finalRole = role;
  let isActive = formData.get('isActive') === 'on';
  let dataDemissao = ouNulo(formData, 'dataDemissao');
  let aviso = '';
  if (id === actor.id) {
    finalRole = actor.role;
    isActive = true;
    dataDemissao = null;
    aviso = ' O master não pode alterar o próprio papel, se desativar nem se demitir;'
      + ' essa parte da alteração foi ignorada.';
  }

  await updateVinculo({
    id, name, role: finalRole, isActive,
    dataContratacao: ouNulo(formData, 'dataContratacao'),
    dataDemissao,
  });

  await updatePessoa(alvo.pessoa_id, {
    ...contato,
    data_nascimento: ouNulo(formData, 'dataNascimento'),
    cpf,
    rg: ouNulo(formData, 'rg'),
    rg_orgao_expedidor: ouNulo(formData, 'rgOrgao'),
    cnpj,
  });

  await aplicarSalas(actor.id, id, salas);
  await aplicarModulos(actor.id, id, modulos);

  await audit({ actorId: actor.id, action: 'user_update', entityType: 'user', entityId: id,
                metadata: { escopo: 'todos', demitido: Boolean(dataDemissao) } });

  revalidatePath('/usuarios');
  revalidatePath('/admin/salas');
  revalidatePath('/');
  return { ok: `Cadastro atualizado.${aviso}` };
}

async function aplicarSalas(actorId: string, userId: string, salas: string[]): Promise<void> {
  const antes = await listRoomsOfUser(userId);
  await setUserRooms(userId, salas);
  const entraram = salas.filter((s) => !antes.includes(s));
  const sairam = antes.filter((s) => !salas.includes(s));
  if (entraram.length) {
    await audit({ actorId, action: 'member_add', entityType: 'user', entityId: userId,
                  metadata: { salas: entraram } });
  }
  if (sairam.length) {
    await audit({ actorId, action: 'member_remove', entityType: 'user', entityId: userId,
                  metadata: { salas: sairam } });
  }
}

async function aplicarModulos(actorId: string, userId: string, modulos: string[]): Promise<void> {
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

/**
 * Cria um vínculo. Se o CPF informado já pertence a alguém, reaproveita a pessoa em vez
 * de falhar — é assim que a readmissão acontece: cadastro antigo vira histórico e o novo
 * nasce limpo, sem herdar salas nem módulos.
 */
export async function criarUsuario(
  _prev: CadastroState, formData: FormData,
): Promise<CadastroState> {
  const actor = await requireMaster();

  const name = String(formData.get('name') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim();
  const senhaInicial = String(formData.get('senhaInicial') ?? '');
  const role = String(formData.get('role') ?? 'user') as Role;
  const cpf = ouNulo(formData, 'cpf');

  if (!name) return { error: 'Informe o nome.' };
  if (!email) return { error: 'Informe o e-mail.' };
  if (role !== 'master' && role !== 'user') return { error: 'Papel inválido.' };
  if (senhaInicial.length < 10) {
    return { error: 'A senha inicial precisa ter ao menos 10 caracteres.' };
  }
  if (cpf && !validarCpf(cpf)) return { error: 'CPF inválido.' };

  const pessoaExistente = cpf ? await findPessoaIdByCpf(cpf) : null;
  const pessoaId = pessoaExistente ?? randomUUID();
  const userId = randomUUID();

  try {
    await createUserComPessoa({
      userId, pessoaId, pessoaJaExiste: Boolean(pessoaExistente),
      email, name, hash: await hashPassword(senhaInicial), role,
      dataContratacao: ouNulo(formData, 'dataContratacao'),
    });
  } catch (err) {
    // Só a violação de unicidade vira mensagem amigável; qualquer outro erro é
    // relançado, senão uma falha de conexão apareceria disfarçada de duplicidade.
    if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
      return { error: 'Já existe um vínculo ativo com esse e-mail.' };
    }
    throw err;
  }

  if (cpf && !pessoaExistente) {
    await updatePessoa(pessoaId, {
      ...lerContato(formData),
      data_nascimento: ouNulo(formData, 'dataNascimento'),
      cpf,
      rg: ouNulo(formData, 'rg'),
      rg_orgao_expedidor: ouNulo(formData, 'rgOrgao'),
      cnpj: ouNulo(formData, 'cnpj'),
    });
  }

  await audit({ actorId: actor.id, action: 'user_create', entityType: 'user', entityId: userId,
                metadata: { email, role, readmissao: Boolean(pessoaExistente) } });

  await aplicarSalas(actor.id, userId, formData.getAll('salas').map(String));
  await aplicarModulos(actor.id, userId, formData.getAll('modulos').map(String));

  revalidatePath('/usuarios');
  revalidatePath('/');
  return {
    ok: pessoaExistente
      ? 'Vínculo criado para pessoa já cadastrada. O acesso a salas e módulos não foi herdado.'
      : 'Usuário criado. Ele trocará a senha no primeiro acesso.',
  };
}

/** Revela CPF e RG. Restrito ao dono e ao master, e sempre auditado. */
export async function revelarDocumentosAction(
  userId: string,
): Promise<{ cpf: string | null; rg: string | null } | { error: string }> {
  const actor = await requireReadyUser();
  if (!isUuid(userId)) return { error: 'Usuário não encontrado.' };
  if (!podeRevelarDados(actor, userId)) return { error: 'Sem permissão.' };

  const alvo = await getUserComContato(userId);
  if (!alvo) return { error: 'Usuário não encontrado.' };

  const docs = await revelarDocumentos(alvo.pessoa_id);
  await audit({ actorId: actor.id, action: 'view', entityType: 'user', entityId: userId });
  return docs;
}

/**
 * Autocompleta o endereço pelo CEP. Falha em silêncio de propósito: busca de CEP nunca
 * pode impedir alguém de salvar um cadastro. A chamada sai do servidor para não expor o
 * IP de quem edita a um terceiro.
 */
export async function buscarCep(
  cep: string,
): Promise<{ logradouro: string; bairro: string; cidade: string; uf: string } | null> {
  await requireReadyUser();
  const digitos = soDigitos(cep);
  if (digitos.length !== 8) return null;

  try {
    const resposta = await fetch(`https://brasilapi.com.br/api/cep/v2/${digitos}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!resposta.ok) return null;
    const dado = (await resposta.json()) as {
      street?: string; neighborhood?: string; city?: string; state?: string;
    };
    return {
      logradouro: dado.street ?? '',
      bairro: dado.neighborhood ?? '',
      cidade: dado.city ?? '',
      uf: dado.state ?? '',
    };
  } catch {
    return null;
  }
}

export async function resetUserPassword(
  _prev: CadastroState, formData: FormData,
): Promise<CadastroState> {
  const actor = await requireMaster();
  const id = String(formData.get('id') ?? '');
  const nova = String(formData.get('novaSenha') ?? '');
  if (!isUuid(id)) return { error: 'Usuário não encontrado.' };
  if (nova.length < 10) return { error: 'A senha precisa ter ao menos 10 caracteres.' };

  await setPassword(id, await hashPassword(nova), true);
  await audit({
    actorId: actor.id, action: 'user_reset_password', entityType: 'user', entityId: id,
  });
  revalidatePath('/usuarios');
  return { ok: 'Senha redefinida. O usuário trocará no próximo acesso.' };
}
```

- [ ] **Step 2: Conferir compilação**

```bash
npx tsc --noEmit
```

Esperado: sem saída. Se acusar `getPessoa` não usado, remover o import — não deixar import morto.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/usuarios/actions.ts"
git commit -m "Adiciona server actions do cadastro de usuario"
```

---

## Task 7: Tela `/usuarios` e remoção da tela antiga

**Files:**
- Create: `app/(app)/usuarios/page.tsx`
- Create: `app/(app)/usuarios/UsuariosClient.tsx`
- Delete: `app/(app)/admin/usuarios/page.tsx`, `app/(app)/admin/usuarios/UsuariosClient.tsx`, `app/(app)/admin/usuarios/actions.ts`
- Modify: `components/Sidebar.tsx`
- Test: `tests/UsuariosClient.test.tsx`

**Interfaces:**
- Consumes: actions da Task 6; `listUsersComContato`, `getUserComContato`, `listVinculosDaPessoa` da Task 5; `getPessoa` da Task 5.
- Produces: rota `/usuarios`.

- [ ] **Step 1: Escrever o teste de componente que falha**

Criar `tests/UsuariosClient.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { UsuariosClient } from '@/app/(app)/usuarios/UsuariosClient';
import type { Pessoa, UserComContato } from '@/lib/types';

vi.mock('@/app/(app)/usuarios/actions', () => ({
  salvarCadastro: vi.fn(),
  criarUsuario: vi.fn(),
  revelarDocumentosAction: vi.fn(),
  buscarCep: vi.fn(),
  resetUserPassword: vi.fn(),
}));

const usuario: UserComContato = {
  id: '11111111-1111-1111-1111-111111111111',
  pessoa_id: '22222222-2222-2222-2222-222222222222',
  email: 'joao@x.com', name: 'Joao', role: 'user',
  is_active: true, must_change_password: false, created_at: '2026-01-01',
  telefone: '11987654321', data_contratacao: null, data_demissao: null,
};

const pessoa: Pessoa = {
  id: '22222222-2222-2222-2222-222222222222',
  telefone: '11987654321', cep: null, logradouro: null, numero: null, complemento: null,
  bairro: null, cidade: null, uf: null, data_nascimento: null,
  rg_orgao_expedidor: null, cnpj: null, tem_cpf: false, tem_rg: false,
};

afterEach(() => cleanup());

describe('UsuariosClient', () => {
  it('master vê a grid com os usuários', () => {
    render(
      <UsuariosClient
        escopo="todos" usuarios={[usuario]} eu={null} pessoa={null}
        salas={[]} salasDoUsuario={[]} modulosDoUsuario={[]} vinculos={[]}
      />,
    );
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('Joao')).toBeInTheDocument();
  });

  it('usuário comum não vê grid nenhuma', () => {
    render(
      <UsuariosClient
        escopo="contato" usuarios={[]} eu={usuario} pessoa={pessoa}
        salas={[]} salasDoUsuario={[]} modulosDoUsuario={[]} vinculos={[]}
      />,
    );
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('usuário comum edita telefone, mas recebe o nome desabilitado', () => {
    render(
      <UsuariosClient
        escopo="contato" usuarios={[]} eu={usuario} pessoa={pessoa}
        salas={[]} salasDoUsuario={[]} modulosDoUsuario={[]} vinculos={[]}
      />,
    );
    expect(screen.getByLabelText('Telefone')).toBeEnabled();
    expect(screen.getByLabelText('Nome')).toBeDisabled();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx vitest run tests/UsuariosClient.test.tsx
```

Esperado: FAIL — módulo `@/app/(app)/usuarios/UsuariosClient` não existe.

- [ ] **Step 3: Escrever o client**

Criar `app/(app)/usuarios/UsuariosClient.tsx`. O componente recebe `escopo` já resolvido pelo servidor e desabilita no formulário tudo que estiver fora dele — lembrando que a barreira real é a action, não o `disabled`.

```tsx
'use client';

import { useActionState, useState } from 'react';
import { SeletorSalas, type SalaOpcao } from '@/components/SeletorSalas';
import { SeletorModulos } from '@/components/SeletorModulos';
import { MODULES } from '@/lib/modules';
import { mascararCep, mascararCpf, mascararTelefone } from '@/lib/documentos';
import {
  buscarCep, criarUsuario, revelarDocumentosAction, salvarCadastro,
  type CadastroState,
} from './actions';
import type { EscopoCampos } from '@/lib/authz';
import type { Pessoa, Role, UserComContato } from '@/lib/types';
import type { VinculoResumo } from '@/lib/db/users';

const inicial: CadastroState = {};

const DICA_MASTER = 'O master enxerga todas as salas por definição; a seleção fica travada.';

export function UsuariosClient({
  escopo, usuarios, eu, pessoa, salas, salasDoUsuario, modulosDoUsuario, vinculos,
}: {
  escopo: EscopoCampos;
  usuarios: UserComContato[];
  eu: UserComContato | null;
  pessoa: Pessoa | null;
  salas: SalaOpcao[];
  salasDoUsuario: string[];
  modulosDoUsuario: string[];
  vinculos: VinculoResumo[];
}) {
  const [aberto, setAberto] = useState<UserComContato | null>(eu);

  if (escopo !== 'todos') {
    return eu && pessoa
      ? <Modal usuario={eu} pessoa={pessoa} escopo={escopo} salas={salas}
               salasDoUsuario={salasDoUsuario} modulosDoUsuario={modulosDoUsuario}
               vinculos={vinculos} onFechar={null} />
      : <p>Cadastro não encontrado.</p>;
  }

  return (
    <div className="space-y-4">
      <table className="w-full text-sm">
        <thead>
          <tr style={{ color: 'var(--text-dim)' }}>
            <th className="text-left p-2">Nome</th>
            <th className="text-left p-2">Telefone</th>
            <th className="text-left p-2">E-mail</th>
          </tr>
        </thead>
        <tbody>
          {usuarios.map((u) => (
            <tr key={u.id} className="cursor-pointer" onClick={() => setAberto(u)}>
              <td className="p-2">{u.name}</td>
              <td className="p-2">{u.telefone ? mascararTelefone(u.telefone) : '—'}</td>
              <td className="p-2">{u.email}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {aberto && pessoa && (
        <Modal usuario={aberto} pessoa={pessoa} escopo={escopo} salas={salas}
               salasDoUsuario={salasDoUsuario} modulosDoUsuario={modulosDoUsuario}
               vinculos={vinculos} onFechar={() => setAberto(null)} />
      )}
    </div>
  );
}

function Modal({
  usuario, pessoa, escopo, salas, salasDoUsuario, modulosDoUsuario, vinculos, onFechar,
}: {
  usuario: UserComContato;
  pessoa: Pessoa;
  escopo: EscopoCampos;
  salas: SalaOpcao[];
  salasDoUsuario: string[];
  modulosDoUsuario: string[];
  vinculos: VinculoResumo[];
  onFechar: (() => void) | null;
}) {
  const [state, action, pending] = useActionState(salvarCadastro, inicial);
  const [docs, setDocs] = useState<{ cpf: string | null; rg: string | null } | null>(null);
  const [endereco, setEndereco] = useState({
    logradouro: pessoa.logradouro ?? '', bairro: pessoa.bairro ?? '',
    cidade: pessoa.cidade ?? '', uf: pessoa.uf ?? '',
  });
  // `SeletorSalas` e `SeletorModulos` são controlados e geram os
  // `<input type="hidden" name="salas">` a partir da seleção. Sem estado real aqui, a
  // caixa marcaria na tela e nada chegaria na Server Action.
  const [salasSel, setSalasSel] = useState<string[]>(salasDoUsuario);
  const [modulosSel, setModulosSel] = useState<string[]>(modulosDoUsuario);
  const [papel, setPapel] = useState<Role>(usuario.role);
  const soMaster = escopo !== 'todos';

  // Master enxerga tudo por definição: trocar o papel redefine a seleção inteira.
  function trocarPapel(novo: Role) {
    setPapel(novo);
    setSalasSel(novo === 'master' ? salas.map((s) => s.id) : salasDoUsuario);
    setModulosSel(novo === 'master' ? MODULES.map((m) => m.key) : modulosDoUsuario);
  }

  async function preencherPorCep(cep: string) {
    const achado = await buscarCep(cep);
    if (achado) setEndereco(achado);
  }

  async function revelar() {
    const r = await revelarDocumentosAction(usuario.id);
    if ('error' in r) return;
    setDocs(r);
  }

  return (
    <div className="glass p-5 space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="font-semibold flex-1">{usuario.name}</h2>
        {onFechar && <button type="button" className="btn" onClick={onFechar}>Fechar</button>}
      </div>

      <form action={action} className="space-y-4">
        <input type="hidden" name="id" value={usuario.id} />

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-sm">Nome</span>
            <input name="name" className="input" defaultValue={usuario.name} disabled={soMaster} />
          </label>
          <label className="block space-y-1">
            <span className="text-sm">E-mail</span>
            <input name="email" className="input" defaultValue={usuario.email} disabled />
          </label>
          <label className="block space-y-1">
            <span className="text-sm">Telefone</span>
            <input name="telefone" className="input"
                   defaultValue={usuario.telefone ? mascararTelefone(usuario.telefone) : ''} />
          </label>
          <label className="block space-y-1">
            <span className="text-sm">Data de nascimento</span>
            <input name="dataNascimento" type="date" className="input"
                   defaultValue={pessoa.data_nascimento ?? ''} disabled={soMaster} />
          </label>
        </div>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Endereço</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-sm">CEP</span>
              <input name="cep" className="input"
                     defaultValue={pessoa.cep ? mascararCep(pessoa.cep) : ''}
                     onBlur={(e) => void preencherPorCep(e.target.value)} />
            </label>
            <label className="block space-y-1">
              <span className="text-sm">Logradouro</span>
              <input name="logradouro" className="input" value={endereco.logradouro}
                     onChange={(e) => setEndereco({ ...endereco, logradouro: e.target.value })} />
            </label>
            <label className="block space-y-1">
              <span className="text-sm">Número</span>
              <input name="numero" className="input" defaultValue={pessoa.numero ?? ''} />
            </label>
            <label className="block space-y-1">
              <span className="text-sm">Complemento</span>
              <input name="complemento" className="input" defaultValue={pessoa.complemento ?? ''} />
            </label>
            <label className="block space-y-1">
              <span className="text-sm">Bairro</span>
              <input name="bairro" className="input" value={endereco.bairro}
                     onChange={(e) => setEndereco({ ...endereco, bairro: e.target.value })} />
            </label>
            <label className="block space-y-1">
              <span className="text-sm">Cidade</span>
              <input name="cidade" className="input" value={endereco.cidade}
                     onChange={(e) => setEndereco({ ...endereco, cidade: e.target.value })} />
            </label>
            <label className="block space-y-1">
              <span className="text-sm">UF</span>
              <input name="uf" className="input" maxLength={2} value={endereco.uf}
                     onChange={(e) => setEndereco({ ...endereco, uf: e.target.value.toUpperCase() })} />
            </label>
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Documentos</legend>
          {(pessoa.tem_cpf || pessoa.tem_rg) && !docs && (
            <button type="button" className="btn" onClick={() => void revelar()}>
              Revelar CPF e RG
            </button>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-sm">CPF</span>
              <input name="cpf" className="input" disabled={soMaster}
                     defaultValue={docs?.cpf ? mascararCpf(docs.cpf) : ''}
                     placeholder={pessoa.tem_cpf ? '•••.•••.•••-••' : ''} />
            </label>
            <label className="block space-y-1">
              <span className="text-sm">Identidade (RG)</span>
              <input name="rg" className="input" disabled={soMaster}
                     defaultValue={docs?.rg ?? ''}
                     placeholder={pessoa.tem_rg ? '••••••••' : ''} />
            </label>
            <label className="block space-y-1">
              <span className="text-sm">Órgão expedidor</span>
              <input name="rgOrgao" className="input" disabled={soMaster}
                     defaultValue={pessoa.rg_orgao_expedidor ?? ''} placeholder="SSP/SP" />
            </label>
            <label className="block space-y-1">
              <span className="text-sm">CNPJ</span>
              <input name="cnpj" className="input" disabled={soMaster}
                     defaultValue={pessoa.cnpj ?? ''} />
            </label>
          </div>
        </fieldset>

        {!soMaster && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className="text-sm">Data de contratação</span>
                <input name="dataContratacao" type="date" className="input"
                       defaultValue={usuario.data_contratacao ?? ''} />
              </label>
              <label className="block space-y-1">
                <span className="text-sm">Data de demissão</span>
                <input name="dataDemissao" type="date" className="input"
                       defaultValue={usuario.data_demissao ?? ''} />
              </label>
              <label className="block space-y-1">
                <span className="text-sm">Papel</span>
                <select name="role" className="input" value={papel}
                        onChange={(e) => trocarPapel(e.target.value as Role)}>
                  <option value="user">Usuário</option>
                  <option value="master">Master</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="isActive" defaultChecked={usuario.is_active} />
                Ativo
              </label>
            </div>

            <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
              Preencher a data de demissão desativa o acesso imediatamente.
            </p>

            <SeletorSalas
              salas={salas} selecionadas={salasSel} onChange={setSalasSel}
              desabilitado={papel === 'master'}
              dica={papel === 'master' ? DICA_MASTER : undefined}
            />
            <SeletorModulos
              modulos={MODULES} selecionados={modulosSel} onChange={setModulosSel}
              desabilitado={papel === 'master'}
              dica={papel === 'master' ? DICA_MASTER : undefined}
            />
          </>
        )}

        {state.error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{state.error}</p>}
        {state.ok && <p className="text-sm" style={{ color: 'var(--ok)' }}>{state.ok}</p>}
        <button className="btn btn-primary" disabled={pending}>Salvar</button>
      </form>

      {vinculos.length > 1 && (
        <section className="space-y-1">
          <h3 className="text-sm font-medium">Passagens anteriores</h3>
          <ul className="text-xs" style={{ color: 'var(--text-dim)' }}>
            {vinculos.map((v) => (
              <li key={v.id}>
                {v.name} — {v.data_contratacao ?? '?'} até {v.data_demissao ?? 'atual'}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Escrever a página**

Criar `app/(app)/usuarios/page.tsx`:

```tsx
import Link from 'next/link';
import { requireReadyUser } from '@/lib/auth/guards';
import { camposEditaveis } from '@/lib/authz';
import { listAllRooms, listModulesOfUser, listRoomsOfUser } from '@/lib/db/queries';
import { getPessoa } from '@/lib/db/pessoas';
import { getUserComContato, listUsersComContato, listVinculosDaPessoa } from '@/lib/db/users';
import { UsuariosClient } from './UsuariosClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function UsuariosPage({
  searchParams,
}: {
  searchParams: Promise<{ desligados?: string }>;
}) {
  const actor = await requireReadyUser();
  const escopo = camposEditaveis(actor, actor.id);
  const { desligados } = await searchParams;
  const incluirDesligados = desligados === '1';

  // Usuário comum não recebe a lista de ninguém: o servidor nem busca.
  const eu = await getUserComContato(actor.id);
  const pessoa = eu ? await getPessoa(eu.pessoa_id) : null;

  const usuarios = escopo === 'todos' ? await listUsersComContato(incluirDesligados) : [];
  const salas = escopo === 'todos' ? await listAllRooms() : [];
  const salasDoUsuario = eu ? await listRoomsOfUser(eu.id) : [];
  const modulosDoUsuario = eu ? await listModulesOfUser(eu.id) : [];
  const vinculos = eu ? await listVinculosDaPessoa(eu.pessoa_id) : [];

  return (
    <main className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold flex-1">
          {escopo === 'todos' ? 'Usuários' : 'Meus dados'}
        </h1>
        {escopo === 'todos' && (
          // Link, e não checkbox: o estado vive na URL, então recarregar ou
          // compartilhar o endereço preserva o filtro sem estado de cliente.
          <Link
            href={incluirDesligados ? '/usuarios' : '/usuarios?desligados=1'}
            className="btn text-sm"
          >
            {incluirDesligados ? 'Ocultar desligados' : 'Incluir desligados'}
          </Link>
        )}
      </div>
      <UsuariosClient
        escopo={escopo}
        usuarios={usuarios}
        eu={eu}
        pessoa={pessoa}
        salas={salas.map((s) => ({ id: s.id, name: s.name }))}
        salasDoUsuario={salasDoUsuario}
        modulosDoUsuario={modulosDoUsuario}
        vinculos={vinculos}
      />
    </main>
  );
}
```

- [ ] **Step 5: Remover a tela antiga e apontar o menu**

```bash
git rm -r "app/(app)/admin/usuarios"
```

Em `components/Sidebar.tsx`, mover o item de usuários para fora do bloco `actor.role === 'master'` e trocar o href:

```tsx
{ href: '/usuarios', label: 'Usuários', icon: <Users size={18} className={iconClass} /> },
```

Ele passa a ser o segundo item fixo do grupo "Cofre de Senhas", logo abaixo de "Salas", visível para todos os papéis. Remover a entrada antiga `/admin/usuarios` do bloco de master.

- [ ] **Step 6: Rodar tudo**

```bash
npx tsc --noEmit
npm test
DATABASE_URL="postgres://u:p@h/d" VAULT_KEY="$(node -e 'console.log(require("crypto").randomBytes(32).toString("base64"))')" SESSION_SECRET="0123456789abcdef0123456789abcdef" npx next build
```

Esperado: `tsc` sem saída; 94 testes passando (91 + 3 do client); build listando `/usuarios` e **sem** `/admin/usuarios`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Substitui a tela de usuarios por /usuarios com grid e modal"
```

---

## Task 8: Testes de integração contra o banco real

**Files:**
- Modify: `tests/integracao.test.ts`

**Interfaces:**
- Consumes: tudo das tasks anteriores.
- Produces: nada.

- [ ] **Step 1: Escrever os testes**

Acrescentar um `describe` novo dentro do `descreve(...)` existente em `tests/integracao.test.ts`, usando o mesmo padrão de criar dados com prefixo `marca` e limpar no `afterAll`:

```ts
describe('cadastro de pessoa e vínculo', () => {
  it('gravar data de demissão desativa o acesso na mesma transação', async () => {
    const u = await import('@/lib/db/users');
    const id = randomUUID();
    const pessoaId = randomUUID();
    await u.createUserComPessoa({
      userId: id, pessoaId, pessoaJaExiste: false,
      email: `${marca}-dem@x.com`, name: 'Demitido',
      hash: 'x', role: 'user', dataContratacao: '2020-01-01',
    });

    await u.updateVinculo({
      id, name: 'Demitido', role: 'user', isActive: true,
      dataContratacao: '2020-01-01', dataDemissao: '2026-08-06',
    });

    const linha = (await sql`select is_active from users where id = ${id}`) as
      { is_active: boolean }[];
    expect(linha[0].is_active).toBe(false);
  });

  it('CPF duplicado em pessoas é rejeitado pelo índice único', async () => {
    const p = await import('@/lib/db/pessoas');
    const a = randomUUID();
    const b = randomUUID();
    await sql`insert into pessoas (id) values (${a})`;
    await sql`insert into pessoas (id) values (${b})`;

    await p.updatePessoa(a, {
      telefone: null, cep: null, logradouro: null, numero: null, complemento: null,
      bairro: null, cidade: null, uf: null, data_nascimento: null,
      cpf: '529.982.247-25', rg: null, rg_orgao_expedidor: null, cnpj: null,
    });

    await expect(p.updatePessoa(b, {
      telefone: null, cep: null, logradouro: null, numero: null, complemento: null,
      bairro: null, cidade: null, uf: null, data_nascimento: null,
      cpf: '52998224725', rg: null, rg_orgao_expedidor: null, cnpj: null,
    })).rejects.toMatchObject({ code: '23505' });
  });

  it('ida e volta do CPF cifrado devolve o valor original', async () => {
    const p = await import('@/lib/db/pessoas');
    const id = randomUUID();
    await sql`insert into pessoas (id) values (${id})`;
    await p.updatePessoa(id, {
      telefone: null, cep: null, logradouro: null, numero: null, complemento: null,
      bairro: null, cidade: null, uf: null, data_nascimento: null,
      cpf: '111.444.777-35', rg: 'MG-12.345.678', rg_orgao_expedidor: 'SSP/MG', cnpj: null,
    });

    const docs = await p.revelarDocumentos(id);
    expect(docs.cpf).toBe('11144477735');
    expect(docs.rg).toBe('MG-12.345.678');
  });

  it('AAD trocado impede ler o CPF como se fosse RG', async () => {
    const { decrypt } = await import('@/lib/crypto');
    const id = randomUUID();
    await sql`insert into pessoas (id) values (${id})`;
    const p = await import('@/lib/db/pessoas');
    await p.updatePessoa(id, {
      telefone: null, cep: null, logradouro: null, numero: null, complemento: null,
      bairro: null, cidade: null, uf: null, data_nascimento: null,
      cpf: '111.444.777-35', rg: null, rg_orgao_expedidor: null, cnpj: null,
    });

    const linha = (await sql`
      select cpf_ct, cpf_iv, cpf_tag from pessoas where id = ${id}`) as
      { cpf_ct: Buffer; cpf_iv: Buffer; cpf_tag: Buffer }[];

    expect(() => decrypt(
      { ct: linha[0].cpf_ct, iv: linha[0].cpf_iv, tag: linha[0].cpf_tag },
      `${id}:rg`,
    )).toThrow();
  });

  it('readmissão: reusa o e-mail e findUserByEmail devolve o vínculo atual', async () => {
    const u = await import('@/lib/db/users');
    const email = `${marca}-readmitido@x.com`;
    const pessoaId = randomUUID();
    const antigo = randomUUID();
    const novo = randomUUID();

    await u.createUserComPessoa({
      userId: antigo, pessoaId, pessoaJaExiste: false,
      email, name: 'Primeira passagem', hash: 'x', role: 'user',
      dataContratacao: '2020-01-01',
    });
    await u.updateVinculo({
      id: antigo, name: 'Primeira passagem', role: 'user', isActive: true,
      dataContratacao: '2020-01-01', dataDemissao: '2022-06-30',
    });

    // Só é possível porque o unique de e-mail é parcial (`where data_demissao is null`).
    await u.createUserComPessoa({
      userId: novo, pessoaId, pessoaJaExiste: true,
      email, name: 'Segunda passagem', hash: 'x', role: 'user',
      dataContratacao: '2026-08-06',
    });

    const achado = await u.findUserByEmail(email);
    expect(achado?.id).toBe(novo);

    const vinculos = await u.listVinculosDaPessoa(pessoaId);
    expect(vinculos).toHaveLength(2);
  });

  it('dois vínculos ativos com o mesmo e-mail continuam sendo rejeitados', async () => {
    const u = await import('@/lib/db/users');
    const email = `${marca}-dup@x.com`;
    await u.createUserComPessoa({
      userId: randomUUID(), pessoaId: randomUUID(), pessoaJaExiste: false,
      email, name: 'A', hash: 'x', role: 'user', dataContratacao: null,
    });

    await expect(u.createUserComPessoa({
      userId: randomUUID(), pessoaId: randomUUID(), pessoaJaExiste: false,
      email, name: 'B', hash: 'x', role: 'user', dataContratacao: null,
    })).rejects.toMatchObject({ code: '23505' });
  });
});
```

Acrescentar `import { randomUUID } from 'node:crypto';` ao topo do arquivo, e incluir a limpeza das linhas novas no `afterAll` existente — apagar `users` e `pessoas` criados com a `marca`, nesta ordem (o `users` referencia `pessoas`).

- [ ] **Step 2: Rodar**

```bash
npx vitest run tests/integracao.test.ts
```

Esperado: os testes de integração que já existiam mais os 6 novos, todos passando. Se `DATABASE_URL` não estiver no ambiente, a suíte inteira é pulada — nesse caso, configurar `.env.local` antes.

- [ ] **Step 3: Rodar tudo e commitar**

```bash
npx tsc --noEmit
npm test
```

Esperado: 100 testes passando.

```bash
git add tests/integracao.test.ts
git commit -m "Adiciona testes de integracao de cadastro, demissao e readmissao"
```

---

## Verificação manual (antes do merge)

Nenhuma das tasks substitui isto. Com `npm run dev` e login de master:

1. `/usuarios` mostra a grid com nome, telefone e e-mail.
2. Clicar numa linha abre o modal com o cadastro completo.
3. Salvar telefone e endereço persiste após recarregar.
4. CEP válido autocompleta logradouro, bairro, cidade e UF.
5. CEP inexistente não trava o formulário — dá para salvar mesmo assim.
6. CPF inválido (`529.982.247-26`) é rejeitado com mensagem.
7. Revelar CPF/RG mostra o documento e gera linha em `/admin/auditoria` com ação "view".
8. Preencher data de demissão e salvar: o usuário some da grid.
9. "Incluir desligados" traz o demitido de volta à lista; o filtro sobrevive a recarregar a página, porque vive na URL.
10. Criar usuário novo com o CPF de alguém demitido: aceita, e a mensagem avisa que salas e módulos não foram herdados.
11. Logar como usuário comum: `/usuarios` mostra só o próprio modal, sem grid; nome e CPF chegam desabilitados; telefone e endereço são editáveis.
12. O item "Usuários" aparece no menu para o usuário comum.
13. `/admin/usuarios` responde 404.
