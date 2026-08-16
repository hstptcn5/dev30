-- Dev30 hosted SaaS persistence schema
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

-- A browser session is intentionally separate from a durable workspace connection.
-- Scheduled reports must still be able to run after the browser session expires.
create table if not exists public.dev30_connections (
  workspace_id text primary key,
  viewer jsonb not null,
  encrypted_credential text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dev30_schedules (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null unique,
  username text not null,
  email text not null,
  timezone text not null,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  hour_local smallint not null check (hour_local between 0 and 23),
  audience text not null check (audience in ('client', 'founder')),
  days integer not null default 7 check (days in (7, 30, 90)),
  enabled boolean not null default true,
  next_run_at timestamptz not null,
  lease_until timestamptz,
  last_run_at timestamptz,
  last_status text,
  last_report_id uuid,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dev30_schedules_due_idx
  on public.dev30_schedules (next_run_at)
  where enabled = true;

create table if not exists public.dev30_usage (
  workspace_id text not null,
  period_start date not null,
  counters jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, period_start)
);

create table if not exists public.dev30_billing (
  workspace_id text primary key,
  plan text not null default 'free',
  status text not null default 'none',
  stripe_customer_id text,
  stripe_subscription_id text,
  price_id text,
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

create unique index if not exists dev30_billing_customer_idx
  on public.dev30_billing (stripe_customer_id)
  where stripe_customer_id is not null;

create unique index if not exists dev30_billing_subscription_idx
  on public.dev30_billing (stripe_subscription_id)
  where stripe_subscription_id is not null;

create table if not exists public.dev30_billing_events (
  event_id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);

create table if not exists public.dev30_deliveries (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null,
  schedule_id uuid,
  report_id uuid,
  recipient text not null,
  provider text not null default 'resend',
  provider_id text,
  status text not null,
  attempt_count integer not null default 0,
  idempotency_key text not null unique,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dev30_deliveries_workspace_created_idx
  on public.dev30_deliveries (workspace_id, created_at desc);

-- Atomically claim due schedules so two cron runners cannot execute the same
-- scheduled window at the same time. An expired lease makes a crashed job retryable.
create or replace function public.dev30_claim_due_schedules(
  p_now timestamptz,
  p_lease_seconds integer default 900,
  p_limit integer default 10
)
returns setof public.dev30_schedules
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select id
    from public.dev30_schedules
    where enabled = true
      and next_run_at <= p_now
      and (lease_until is null or lease_until < p_now)
    order by next_run_at asc
    limit greatest(1, least(50, p_limit))
    for update skip locked
  )
  update public.dev30_schedules s
  set lease_until = p_now + make_interval(secs => greatest(60, p_lease_seconds)),
      updated_at = p_now
  from candidates c
  where s.id = c.id
  returning s.*;
end;
$$;

-- Quota consumption is atomic. The caller supplies the entitlement limit and
-- receives accepted=false without incrementing when the cap would be exceeded.
create or replace function public.dev30_consume_usage(
  p_workspace_id text,
  p_period_start date,
  p_metric text,
  p_amount integer,
  p_limit integer
)
returns table (
  accepted boolean,
  used integer,
  limit_value integer,
  counters jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_value integer;
  next_counters jsonb;
begin
  if p_metric not in ('analysis', 'report', 'scheduled_run', 'email_delivery') then
    raise exception 'unsupported Dev30 usage metric';
  end if;
  if p_amount < 1 or p_limit < 0 then
    raise exception 'invalid Dev30 usage amount or limit';
  end if;

  insert into public.dev30_usage (workspace_id, period_start, counters, updated_at)
  values (p_workspace_id, p_period_start, '{}'::jsonb, now())
  on conflict (workspace_id, period_start) do nothing;

  select coalesce((u.counters ->> p_metric)::integer, 0)
    into current_value
  from public.dev30_usage u
  where u.workspace_id = p_workspace_id and u.period_start = p_period_start
  for update;

  if current_value + p_amount > p_limit then
    select u.counters into next_counters
    from public.dev30_usage u
    where u.workspace_id = p_workspace_id and u.period_start = p_period_start;
    return query select false, current_value, p_limit, next_counters;
    return;
  end if;

  update public.dev30_usage u
  set counters = jsonb_set(
        coalesce(u.counters, '{}'::jsonb),
        array[p_metric],
        to_jsonb(current_value + p_amount),
        true
      ),
      updated_at = now()
  where u.workspace_id = p_workspace_id and u.period_start = p_period_start
  returning u.counters into next_counters;

  return query select true, current_value + p_amount, p_limit, next_counters;
end;
$$;

alter table public.dev30_sessions enable row level security;
alter table public.dev30_snapshots enable row level security;
alter table public.dev30_reports enable row level security;
alter table public.dev30_connections enable row level security;
alter table public.dev30_schedules enable row level security;
alter table public.dev30_usage enable row level security;
alter table public.dev30_billing enable row level security;
alter table public.dev30_billing_events enable row level security;
alter table public.dev30_deliveries enable row level security;

-- The browser never talks to these tables directly. Keep anon/authenticated locked out.
revoke all on table public.dev30_sessions from anon, authenticated;
revoke all on table public.dev30_snapshots from anon, authenticated;
revoke all on table public.dev30_reports from anon, authenticated;
revoke all on table public.dev30_connections from anon, authenticated;
revoke all on table public.dev30_schedules from anon, authenticated;
revoke all on table public.dev30_usage from anon, authenticated;
revoke all on table public.dev30_billing from anon, authenticated;
revoke all on table public.dev30_billing_events from anon, authenticated;
revoke all on table public.dev30_deliveries from anon, authenticated;
revoke all on function public.dev30_claim_due_schedules(timestamptz, integer, integer) from public, anon, authenticated;
revoke all on function public.dev30_consume_usage(text, date, text, integer, integer) from public, anon, authenticated;

-- The backend secret key maps to the service_role database role and bypasses RLS.
grant select, insert, update, delete on table public.dev30_sessions to service_role;
grant select, insert, update, delete on table public.dev30_snapshots to service_role;
grant select, insert, update, delete on table public.dev30_reports to service_role;
grant select, insert, update, delete on table public.dev30_connections to service_role;
grant select, insert, update, delete on table public.dev30_schedules to service_role;
grant select, insert, update, delete on table public.dev30_usage to service_role;
grant select, insert, update, delete on table public.dev30_billing to service_role;
grant select, insert, update, delete on table public.dev30_billing_events to service_role;
grant select, insert, update, delete on table public.dev30_deliveries to service_role;
grant execute on function public.dev30_claim_due_schedules(timestamptz, integer, integer) to service_role;
grant execute on function public.dev30_consume_usage(text, date, text, integer, integer) to service_role;
