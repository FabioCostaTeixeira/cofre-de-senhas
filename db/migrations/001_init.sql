create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

create table users (
  id                   uuid primary key default gen_random_uuid(),
  email                text not null unique,
  name                 text not null,
  password_hash        text not null,
  role                 text not null check (role in ('master', 'user')),
  is_active            boolean not null default true,
  must_change_password boolean not null default true,
  failed_attempts      int not null default 0,
  locked_until         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table rooms (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  created_by  uuid not null references users(id),
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table room_members (
  room_id uuid not null references rooms(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  primary key (room_id, user_id)
);

create table credentials (
  id           uuid primary key,
  room_id      uuid not null references rooms(id),
  title        text not null,
  username     text,
  password_ct  bytea not null,
  password_iv  bytea not null,
  password_tag bytea not null,
  url          text,
  notes_ct     bytea,
  notes_iv     bytea,
  notes_tag    bytea,
  key_version  int not null default 1,
  is_global    boolean not null default true,
  owner_id     uuid not null references users(id),
  deleted_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index credentials_room_title_idx on credentials (room_id, title);
create index credentials_owner_idx      on credentials (owner_id);
create index credentials_title_trgm     on credentials using gin (title gin_trgm_ops);
create index credentials_username_trgm  on credentials using gin (username gin_trgm_ops);
create index credentials_url_trgm       on credentials using gin (url gin_trgm_ops);

create table audit_log (
  id          bigserial primary key,
  actor_id    uuid references users(id),
  action      text not null,
  entity_type text,
  entity_id   uuid,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index audit_log_created_idx on audit_log (created_at desc);
create index audit_log_actor_idx   on audit_log (actor_id, created_at desc);
