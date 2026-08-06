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

export type Room = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
};

export type RoomCard = Room & {
  credential_count: number;
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

/**
 * Única fonte de verdade das ações de auditoria: o tipo é derivado da constante,
 * nunca o contrário, para que o filtro da tela de auditoria (que itera sobre
 * `AUDIT_ACTIONS`) nunca fique dessincronizado do que o sistema realmente grava.
 */
export const AUDIT_ACTIONS = [
  'login_ok', 'login_fail', 'logout', 'password_change',
  'view', 'copy', 'create', 'update', 'delete', 'restore', 'purge',
  'room_create', 'room_update', 'room_delete',
  'member_add', 'member_remove',
  'module_grant', 'module_revoke',
  'user_create', 'user_update', 'user_reset_password',
] as const;

export type AuditAction = typeof AUDIT_ACTIONS[number];
