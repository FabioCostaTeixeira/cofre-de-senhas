# Unificação de Módulos (Hub) — Design

**Data:** 2026-08-03
**Status:** aprovado (brainstorming)
**Branch:** dev

## 1. Objetivo

Cliente contratou módulos adicionais além do Cofre de Senhas. O Cofre de Senhas vira o **hub
central**: dono do login, do cadastro de usuário e do controle de acesso por módulo. Módulos
prontos em outra stack se conectam por login único (SSO); módulos novos nascem direto dentro do
Cofre.

Primeiro módulo a integrar: **Gestor de Projetos**, já pronto, em Vite/React + Vercel Functions
(stack diferente do Cofre), localizado em `C:\Users\2P CONNECT\Desktop\gestor projetos 1`.

## 2. Decisões de arquitetura

| Decisão | Escolha | Motivo |
|---|---|---|
| Módulo já pronto (Gestor de Projetos) | Mantém-se como app separado, integra via SSO | Stack diferente (Vite vs Next.js), 30+ telas — reescrever dentro do Cofre não compensa. |
| Módulos novos (futuros) | Nascem dentro do Cofre de Senhas (Next.js) | Reaproveita auth/sessão/UI já prontos, sem repetir trabalho de login por módulo. |
| Domínio | Mesmo domínio, sub-rota (`/projetos` → Gestor de Projetos via rewrite) | Cliente vê 1 site só; cookie de sessão funciona sem configurar `Domain=` cross-subdomínio. |
| Fonte de usuário | Só a tabela `users` do Cofre. Login/tabela de usuário próprios do Gestor de Projetos são desligados, sem migração de dado. | Decisão explícita do cliente: usuários do Gestor de Projetos não serão reaproveitados. |
| Sessão | Gestor de Projetos passa a validar o cookie `cofre_session` (JWT `jose`, mesma `SESSION_SECRET`) em vez do HMAC próprio em `api/_lib/auth.ts`. | Único login, sem tela de login duplicada. |
| Permissão por módulo | Tabela nova `module_access` (`user_id`, `module_key`), checkbox por módulo na tela de usuário existente (`app/admin/usuarios/UsuariosClient.tsx`). | Padrão já usado hoje pra acesso de sala; extensível a qualquer módulo futuro sem mudar schema. |

## 3. Modelo de dados (Postgres / Neon — banco do Cofre)

```sql
module_access
  user_id     uuid not null references users(id) on delete cascade
  module_key  text not null              -- 'cofre' | 'projetos' | ...
  granted_by  uuid not null references users(id)
  created_at  timestamptz not null default now()
  primary key (user_id, module_key)
```

## 4. Fluxo de sessão entre apps

1. Usuário loga no Cofre (`/login`) → cookie `cofre_session` (httpOnly, mesmo domínio).
2. Usuário navega pra `/projetos` → rewrite do Vercel entrega a resposta do deploy do Gestor de
   Projetos, cookie vai junto (mesmo domínio).
3. Cada função em `api/` do Gestor de Projetos valida o cookie com `jwtVerify` (mesma
   `SESSION_SECRET` do Cofre) e confere `module_access` pra `module_key = 'projetos'`.
4. Sem sessão válida ou sem permissão → 401/redirect pra `/login` do Cofre.
5. Logout só existe no Cofre; derruba o cookie pros dois apps.

## 5. UI de permissão

- Estende `UsuariosClient.tsx`: lista de checkbox, um por módulo ativo no sistema.
- Master concede/revoga por usuário, mesmo padrão do acesso a sala.
- Menu do Cofre só mostra link do módulo se o usuário logado tiver `module_access` pra ele.

## 6. Módulos novos (padrão a seguir)

- Rota nova dentro de `app/<modulo>/` no Cofre.
- Reusa `lib/auth/session.ts` e `lib/auth/guards.ts`.
- Precisa só de 1 linha nova em `module_access` (chave do módulo) pra aparecer no checkbox de
  permissão — nenhum trabalho de login/sessão extra.

## 7. Fora de escopo (v1 desta unificação)

- Migração de dado de usuário do Gestor de Projetos (não vai acontecer).
- Perfis/cargos pré-definidos (fica só checkbox por módulo, por usuário).
- Qualquer outro módulo além de Gestor de Projetos (entram depois, seguindo o padrão da seção 6).
