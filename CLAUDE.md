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
  de rewrite vive em `vercel.json`; o destino está hardcoded pra
  `https://projectmanager01.vercel.app` (URL padrão do Gestor de Projetos na Vercel) e vai
  precisar ser atualizado se/quando um domínio próprio for configurado pra esse projeto. Em
  `npm run dev` local, `/gestao` dá 404 — os rewrites do `vercel.json` não se aplicam ao dev
  server local; isso é esperado, não é bug.
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

Próximo passo: plano de implementação (`docs/superpowers/plans/`) a partir do spec acima.

## Stack

- Next.js 15 (App Router) + TypeScript + Tailwind
- Neon (Postgres), sem ORM — `lib/db/*`
- Auth própria: JWT (`jose`) em cookie httpOnly (`lib/auth/session.ts`), guards em
  `lib/auth/guards.ts`
- Deploy: Vercel
