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
