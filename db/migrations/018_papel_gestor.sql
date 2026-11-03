-- Papel "gestor": distribui e edita todos os cards do Planejamento (Edição/Gravação) e
-- vê todos os chamados. Usuário comum passa a ver só os cards atribuídos a ele. Regra
-- aplicada na aplicação (lib/permissoes-cards.ts). Aditivo: o código anterior nunca grava
-- 'gestor', só deixa de reconhecê-lo.
alter table users drop constraint users_role_check;
alter table users
  add constraint users_role_check check (role in ('master', 'gestor', 'user'));
