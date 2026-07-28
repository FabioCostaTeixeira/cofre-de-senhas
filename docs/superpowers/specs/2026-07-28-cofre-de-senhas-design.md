# Cofre de Senhas — Design

**Data:** 2026-07-28
**Status:** aprovado (brainstorming)

## 1. Objetivo

Gerenciador de senhas web para equipe, inspirado no gestor de senhas do Chrome. Senhas ficam
cifradas no banco, são reveladas sob demanda (botão de olho), podem ser copiadas com um clique e
são organizadas em **salas** — containers que definem quais usuários têm acesso a quais senhas.

Um usuário **master** administra usuários, salas e senhas globais.

## 2. Decisões de arquitetura

| Decisão | Escolha | Motivo |
|---|---|---|
| Criptografia | AES-256-GCM com chave mestra no servidor | Permite busca, gestão pelo master e compartilhamento em salas. Zero-knowledge foi descartado por impedir o master de gerenciar senhas globais. |
| Visibilidade | Sala + checkbox global/pessoal dentro dela | Sala controla quem entra; checkbox controla o que é compartilhado lá dentro. |
| Stack | Next.js 15 (App Router), TypeScript, Tailwind, Neon (Postgres) | Deploy natural na Vercel, um só provedor de banco. |
| Auth | Própria: bcrypt + JWT em cookie httpOnly | Sem dependência externa, controle total, sem custo. |
| Acesso a dados | Server Components + Server Actions | Autorização centralizada; senha cifrada nunca chega ao cliente sem checagem. |
| Extras v1 | Log de auditoria + lixeira (soft delete) | Pedidos explícitos. Gerador de senha ficou fora da v1. |
| Visual | Dark minimalista moderno com detalhes de glassmorphism | Preferência do usuário. |

### Risco aceito (explícito)

Neste modelo, quem tiver simultaneamente a `VAULT_KEY` e acesso ao banco Neon consegue ler todas
as senhas — isso inclui o dono do projeto, quem tiver acesso ao painel da Vercel e um eventual
invasor dessa conta. Foi uma escolha consciente. Mitigações que fazem parte do projeto:

- `VAULT_KEY` existe apenas como variável de ambiente de Production na Vercel, nunca no git.
- Nenhuma senha em texto claro é gravada em log, audit ou mensagem de erro.
- Toda revelação e cópia de senha vai para o audit log.
- Fora do escopo do código, mas requerido: 2FA nas contas GitHub, Vercel e Neon.

## 3. Modelo de dados (Postgres / Neon)

```sql
users
  id                   uuid pk
  email                text unique not null
  name                 text not null
  password_hash        text not null            -- bcrypt cost 12
  role                 text not null            -- 'master' | 'user'
  is_active            bool not null default true
  must_change_password bool not null default true
  failed_attempts      int  not null default 0
  locked_until         timestamptz
  created_at, updated_at timestamptz not null default now()

rooms
  id          uuid pk
  name        text not null
  description text
  created_by  uuid not null references users(id)
  deleted_at  timestamptz
  created_at, updated_at

room_members
  room_id  uuid not null references rooms(id)
  user_id  uuid not null references users(id)
  primary key (room_id, user_id)

credentials
  id            uuid pk                          -- gerado pela app antes do insert (usado como AAD)
  room_id       uuid not null references rooms(id)
  title         text not null
  username      text
  password_ct   bytea not null                   -- AES-256-GCM
  password_iv   bytea not null                   -- 12 bytes, aleatório por registro
  password_tag  bytea not null                   -- 16 bytes
  url           text
  notes_ct      bytea
  notes_iv      bytea
  notes_tag     bytea
  key_version   int  not null default 1
  is_global     bool not null default true
  owner_id      uuid not null references users(id)
  deleted_at    timestamptz
  created_at, updated_at

  index (room_id, title)
  index trigram em title, username, url          -- busca por texto

audit_log
  id          bigserial pk
  actor_id    uuid references users(id)
  action      text not null    -- login_ok, login_fail, view, copy, create, update,
                               -- delete, restore, purge, room_create, member_add, ...
  entity_type text             -- 'credential' | 'room' | 'user'
  entity_id   uuid
  metadata    jsonb            -- ip, user agent, campos alterados. NUNCA a senha.
  created_at  timestamptz not null default now()
```

Notas:

- **Toda senha pertence a uma sala**, inclusive as pessoais. Não existe sala pessoal automática:
  o usuário escolhe uma sala e desmarca o checkbox.
- O card **"Minhas senhas"** da home não é uma sala — é o filtro
  `owner_id = :eu AND is_global = false` atravessando todas as salas.
- A **busca opera sobre `title`, `username` e `url` em texto claro**. A senha em si nunca é
  buscável, por estar cifrada. Mesmo comportamento do Chrome.

## 4. Criptografia

Módulo único `lib/crypto.ts`, com `encrypt(plaintext, aad)` e `decrypt(record)`. Nenhum outro
arquivo chama o módulo `crypto` do Node diretamente.

- Algoritmo: `AES-256-GCM` (runtime `nodejs`, não edge).
- Chave: env var `VAULT_KEY`, 32 bytes em base64.
- IV: 12 bytes aleatórios por registro, nunca reutilizados.
- AAD: o `id` (uuid) do registro. Impede que um ciphertext copiado para outra linha decifre.
- `key_version` permite rotação de chave futura sem migration destrutiva.

## 5. Autenticação

- Senha de login: bcrypt cost 12.
- Sessão: JWT HS256 assinado com `SESSION_SECRET`, em cookie `httpOnly`, `secure`,
  `sameSite=lax`, validade de 8 horas.
- O JWT carrega apenas `user_id` e `iat`. **`role` e `is_active` são lidos do banco a cada
  request**, para que revogação de acesso tenha efeito imediato sem tabela de sessões.
- Não há auto-cadastro. O master cria o usuário com senha temporária; `must_change_password`
  força a troca no primeiro acesso, na rota `/trocar-senha`.
- Anti-brute-force: 5 tentativas erradas travam a conta por 15 minutos (`failed_attempts`,
  `locked_until`). Sucessos e falhas vão para o audit log.
- A mensagem de erro de login é sempre genérica ("e-mail ou senha inválidos") e nunca revela se o
  e-mail existe.

## 6. Autorização

Toda a regra vive em `lib/authz.ts`. Nenhuma query de credencial roda fora dele.

### Leitura

| Papel | Salas visíveis | Senhas visíveis |
|---|---|---|
| `master` | todas | todas, inclusive pessoais de terceiros |
| `user` | onde é membro | da sala: as `is_global = true` mais as próprias (`owner_id = :eu`) |

Query canônica para usuário comum:

```sql
WHERE c.deleted_at IS NULL
  AND c.room_id IN (SELECT room_id FROM room_members WHERE user_id = :eu)
  AND (c.is_global = true OR c.owner_id = :eu)
```

Para o master, apenas `c.deleted_at IS NULL`.

### Escrita

| Ação | Quem pode |
|---|---|
| Criar senha numa sala | qualquer membro da sala |
| Editar ou apagar senha global | o dono ou o master |
| Editar senha pessoal | somente o dono |
| Apagar senha pessoal | o dono ou o master (vai para a lixeira; o valor permanece cifrado) |
| CRUD de salas | somente master |
| Adicionar/remover membro de sala | somente master |
| CRUD de usuários | somente master |
| Ver audit log e lixeira | somente master |

### Aplicação

- `requireUser()` — valida o cookie, busca o usuário no banco, barra inativo. Primeira linha de
  toda página e toda Server Action.
- `requireMaster()` — o mesmo, mais a checagem de `role`. Protege `/admin/*` **no servidor**;
  esconder o menu na UI é apenas cosmético.
- `assertCanRead(credentialId)` / `assertCanWrite(credentialId)` — obrigatórias em reveal, copy,
  update e delete.
- Falha de permissão retorna **404, não 403** — não confirma a existência do recurso.

`authz.ts` é uma função pura de `(usuário, recurso) → decisão`, testável sem servidor. A matriz
master/dono/membro/estranho × global/pessoal × ler/escrever é a rede de segurança do projeto.

## 7. Telas

```
/login                 e-mail + senha
/trocar-senha          troca forçada no primeiro acesso
/                      home: grade de cards de salas + busca global
/sala/[id]             lista de senhas da sala + busca local
/admin/usuarios        CRUD de usuários            (master)
/admin/salas           CRUD de salas e membros     (master)
/admin/auditoria       log filtrável               (master)
/admin/lixeira         restaurar / expurgar        (master)
```

**Home.** Grade de cards de salas em vidro fosco. Cada card mostra nome, descrição, quantidade de
senhas e de membros. Um card fixo adicional, "Minhas senhas", agrega as senhas pessoais de todas as
salas. A busca global no topo pesquisa em tudo que o usuário pode ver e exibe a sala de origem de
cada resultado.

**Sala.** Cabeçalho com nome e botão "Nova senha". A busca filtra a lista ao vivo. Cada linha
mostra título, badge `[global]` ou `[pessoal]`, usuário, senha mascarada e as ações:

- olho — revela por 30 segundos, via chamada ao servidor, registrada no audit
- copiar usuário / copiar senha — limpa a área de transferência após 30 segundos
- link — abre a URL em nova aba (`target="_blank" rel="noopener noreferrer"`), só quando há `url`
- menu — editar / apagar, renderizado apenas para quem tem permissão

**Formulário de senha.** Campos: título, usuário, senha, URL, notas, sala (dropdown das salas do
usuário) e o checkbox **"Senha global", marcado por padrão**, com o texto de apoio: "Visível a
todos os membros desta sala. Desmarque para que só você veja."

**Admin.** O item de menu só é renderizado para o master, e as rotas são barradas no servidor.
Usuários: criar, editar, ativar/desativar, resetar senha, promover a master. Salas: criar,
renomear, gerenciar membros por checkbox.

**Erros.** Falhas de Server Action viram toast em português, sem stack trace.

## 8. Visual

Dark, minimalista e moderno, com detalhes de glassmorphism: cards de sala e modais com fundo
translúcido e blur, bordas de 1px sutis, sombras suaves e um gradiente discreto no fundo da página.
A lista de senhas usa superfícies sólidas — legibilidade vem antes do efeito. Interface em
português, responsiva, funcional no celular.

Ícone e favicon: cadeado/cofre geométrico minimalista desenhado em SVG, exportado em PNG 512, 192 e
180 para favicon, manifest PWA e apple-touch-icon.

## 9. Infraestrutura e deploy

- **GitHub:** repositório privado novo, `cofre-de-senhas`, branch `main`. `.gitignore` bloqueia
  `.env*`; `.env.example` versionado apenas com os nomes das variáveis.
- **Vercel:** projeto ligado ao repositório, deploy automático a cada push em `main` e preview
  deploy em pull request. As variáveis `DATABASE_URL`, `VAULT_KEY` e `SESSION_SECRET` são
  configuradas **apenas no ambiente Production**, para que previews não toquem dados reais.
- **Neon:** migrations em SQL puro versionado (`db/migrations/001_init.sql`, ...), aplicadas por
  `npm run migrate`. Sem ORM — o schema é pequeno e explícito. O seed cria o primeiro usuário
  master com senha temporária e `must_change_password = true`.

As credenciais do Neon só são necessárias no momento de rodar a primeira migration.

## 10. Testes

- **Criptografia:** ida e volta, IV único por registro, ciphertext trocado entre registros falha a
  verificação de AAD.
- **Autorização:** matriz completa master/dono/membro/estranho × global/pessoal × ler/escrever.
- **Auth:** senha errada, conta inativa, conta travada, expiração do JWT, troca forçada de senha.
- **Fluxo:** criar sala, adicionar membro, criar senha global e pessoal, revelar, copiar, apagar,
  restaurar da lixeira.

## 11. Fora de escopo (v1)

- Extensão de navegador e autofill em sites de destino.
- Gerador de senha forte.
- Compartilhamento de senha por link externo, importação/exportação, 2FA no cofre.
- Login social.
