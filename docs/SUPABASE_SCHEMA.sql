-- Dev30 0.8 SaaS persistence schema
-- Run this in the Supabase SQL editor for the project used by the Dev30 backend.
-- Dev30 accesses these tables only from its server using a Supabase secret key.

create table if not exists public.dev30_sessions (
  id text primary key,
  workspace_id text not null,
  viewer jsonb not null,
  encrypted_credential text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create unique index if not exists dev30_sessions_workspace_idx
  on public.dev30_sessions (workspace_id);

create table if not exists public.dev30_snapshots (
  id uuid primary key,
  workspace_id text not null,
  series_key text not null,
  username text not null,
  include_private boolean not null default false,
  generated_at timestamptz not null,
  signature text not null,
  payload jsonb not null
);

create index if not exists dev30_snapshots_series_generated_idx
  on public.dev30_snapshots (series_key, generated_at desc);

create index if not exists dev30_snapshots_workspace_idx
  on public.dev30_snapshots (workspace_id, generated_at desc);

create table if not exists public.dev30_reports (
  id uuid primary key,
  workspace_id text not null,
  username text not null,
  include_private boolean not null default false,
  shareable boolean not null default false,
  signature text not null,
  created_at timestamptz not null,
  payload jsonb not null
);

create unique index if not exists dev30_reports_workspace_signature_idx
  on public.dev30_reports (workspace_id, signature);

create index if not exists dev30_reports_workspace_created_idx
  on public.dev30_reports (workspace_id, created_at desc);

alter table public.dev30_sessions enable row level security;
alter table public.dev30_snapshots enable row level security;
alter table public.dev30_reports enable row level security;

-- The browser never talks to these tables directly. Keep anon/authenticated locked out.
revoke all on table public.dev30_sessions from anon, authenticated;
revoke all on table public.dev30_snapshots from anon, authenticated;
revoke all on table public.dev30_reports from anon, authenticated;

-- The backend secret key maps to the service_role database role and bypasses RLS.
grant select, insert, update, delete on table public.dev30_sessions to service_role;
grant select, insert, update, delete on table public.dev30_snapshots to service_role;
grant select, insert, update, delete on table public.dev30_reports to service_role;
