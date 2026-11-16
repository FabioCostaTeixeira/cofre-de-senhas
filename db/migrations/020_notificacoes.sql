-- Notificações internas (sino no menu). Primeiro uso: tarefa do Planejamento concluída
-- avisa os gestores (ver app/(app)/working/planejamento/actions.ts). `link` leva para a
-- tela de origem; `lida_em` nulo = não lida.
create table notificacoes (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null references users(id) on delete cascade,
  titulo      text not null check (length(trim(titulo)) > 0),
  mensagem    text,
  link        text,
  lida_em     timestamptz,
  created_at  timestamptz not null default now()
);
create index notificacoes_usuario_idx on notificacoes (usuario_id, created_at desc);
create index notificacoes_nao_lidas_idx on notificacoes (usuario_id) where lida_em is null;
