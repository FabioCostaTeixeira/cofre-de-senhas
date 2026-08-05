# Cofre de Senhas — Contexto do Projeto

## Iniciativa em andamento: Unificação de Módulos (hub)

Cliente contratou módulos adicionais além do Cofre de Senhas. Decisão: o Cofre de Senhas vira o
**hub central** (dono de login/usuário/permissão). Detalhe completo em
[docs/superpowers/specs/2026-08-03-unificacao-modulos-design.md](docs/superpowers/specs/2026-08-03-unificacao-modulos-design.md).

Resumo:
- **Gestor de Projetos** (`C:\Users\2P CONNECT\Desktop\gestor projetos 1`, Vite/React, Vercel
  Functions) já está pronto → integra por **SSO**, mantém-se app separado, exposto em
  `/gestao` via rewrite no mesmo domínio. Passa a validar o cookie `cofre_session` do Cofre em
  vez do próprio login/tabela de usuário (que serão desligados, sem migração de dado). A regra
  de rewrite vive em `vercel.json`; o destino é `https://projectmanager01-lovat.vercel.app`
  (domínio real do projeto na Vercel — `projectmanager01.vercel.app`, usado antes, não existe;
  achado em 2026-08-05 quando o link quebrou em produção com `DEPLOYMENT_NOT_FOUND`). Vai
  precisar ser atualizado de novo se/quando um domínio próprio for configurado pra esse projeto.
  Em `npm run dev` local, `/gestao` dá 404 — os rewrites do `vercel.json` não se aplicam ao dev
  server local; isso é esperado, não é bug.
  **Pendência crítica (2026-08-05):** mesmo com o domínio certo, `/gestao` continua quebrado —
  a produção do Gestor de Projetos ainda serve o deploy antigo (`target: production` da branch
  `main`, de antes do SSO). A branch `dev` de lá (commit `f0e8181`, com `/gestao` basePath e
  validação de `cofre_session`) nunca foi promovida a produção. Falta: cadastrar
  `COFRE_DATABASE_URL`/`SESSION_SECRET` nas env vars do projeto `projectmanager01` na Vercel,
  mergear `dev` → `main` nesse repo e promover o deploy a produção.
- **Bancos são separados.** Cofre e Gestor de Projetos vivem em bancos Neon distintos
  (`ep-dark-pond…` e `ep-autumn-union…`) — o desenho original supunha um banco só, e não é o
  caso. O Gestor mantém o `DATABASE_URL` dele para os próprios dados (schema
  `gestor_projetos`, 39 tabelas) e usa uma segunda conexão, `COFRE_DATABASE_URL`, só para ler
  `public.users` / `public.module_access` do Cofre. Migrar tudo para um banco só foi
  considerado e adiado (exigiria migrar dados de produção).
- **Módulos novos** (ainda não escritos) nascem **dentro** do Cofre de Senhas, reusando
  `lib/auth/session.ts` / `lib/auth/guards.ts`.
- Permissão por módulo: tabela nova `module_access` (`user_id`, `module_key`), checkbox por
  módulo na tela de usuário (`app/admin/usuarios/UsuariosClient.tsx`), mesmo padrão já usado pro
  acesso a sala.
- Trabalho começou na branch `dev` (criada a partir de `main`, já no remoto).

Status (2026-08-04): as 13 tasks do plano foram implementadas e revisadas nas branches `dev` dos
dois repos (Cofre: commit `8c7d640`; Gestor de Projetos: commit `f0e8181`), ambas pushadas, nenhuma
mergeada em `main` ainda. Testado local de ponta a ponta (login no Cofre, `/gestao/api/me` e
`/gestao/api/projects` respondendo certo com o usuário master).

Pendências antes de ir pra produção:
1. Cadastrar `COFRE_DATABASE_URL` e `SESSION_SECRET` nas env vars do projeto `projectmanager01`
   na Vercel (hoje só existem no `.env` local do Gestor de Projetos).
2. Validar o rewrite `/gestao` batendo em produção de verdade (só dá pra testar depois do deploy).
3. `/api/me` do Gestor devolve `profileId: null` sempre — usuário não-master do SSO fica sem
   acesso a nenhum módulo interno lá (deny-by-default, decisão consciente). Mapear perfil real é
   trabalho futuro, ainda não iniciado.
4. Decidir se/quando fazer o merge `dev` → `main` nos dois repos.

Como rodar local: ver [[unificacao-modulos-hub]] na memória, ou a seção "Rodando local" logo
abaixo.

## Rodando local (Cofre + Gestor de Projetos)

1. Cofre: `npm run dev` (porta 3000), precisa de `.env.local` com `DATABASE_URL`, `VAULT_KEY`,
   `SESSION_SECRET`.
2. Gestor de Projetos (`C:\Users\2P CONNECT\Desktop\gestor projetos 1\app`): `npm run dev`
   (porta 5173), precisa de `.env` com `DATABASE_URL` (banco próprio), `COFRE_DATABASE_URL`
   (banco do Cofre), `SESSION_SECRET` (idêntico ao do Cofre) e `VITE_LOGIN_URL` (só em dev, ex.
   `http://localhost:3000/login`).
3. Loga em `http://localhost:3000/login`.
4. Acessa `http://localhost:5173/gestao/` (com a barra final) — cookie compartilhado via
   `localhost`, entra sem pedir login de novo.
5. O link "Gestão de Projetos" no menu do Cofre **não funciona local** (usa `vercel.json`, só
   existe no deploy real) — sempre entra direto pela porta 5173.

## Stack

- Next.js 15 (App Router) + TypeScript + Tailwind
- Neon (Postgres), sem ORM — `lib/db/*`
- Auth própria: JWT (`jose`) em cookie httpOnly (`lib/auth/session.ts`), guards em
  `lib/auth/guards.ts`
- Deploy: Vercel
