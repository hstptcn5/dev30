-- Dev30 hosted background-analysis job persistence.
-- Apply after docs/SUPABASE_SCHEMA.sql for existing hosted projects.
-- Browser clients never access this table directly; only service_role may read/write.

create table if not exists public.dev30_analysis_jobs (
  id uuid primary key,
  workspace_id text not null,
  status text not null check (status in ('running', 'completed', 'failed')),
  request jsonb not null,
  result jsonb,
  error text,
  response_status integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists dev30_analysis_jobs_workspace_created_idx
  on public.dev30_analysis_jobs (workspace_id, created_at desc);

alter table public.dev30_analysis_jobs enable row level security;
revoke all on table public.dev30_analysis_jobs from anon, authenticated;
grant select, insert, update, delete on table public.dev30_analysis_jobs to service_role;
