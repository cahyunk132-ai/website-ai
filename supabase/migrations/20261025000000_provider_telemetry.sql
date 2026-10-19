-- =============================================================================
-- Hyunk AI Hub - Persistent Provider Telemetry
-- =============================================================================
-- The provider statistics (requests, failures, tokens, cost, last success and
-- last error) were kept in the memory of a single server process. On a
-- serverless platform every request can land in another instance, so the
-- telemetry dashboard always showed "0 requests" and "None yet".
--
-- This table persists the telemetry per provider, model and day. Only the
-- service role may read or write it (it is platform wide), the dashboard
-- reads it on the server.
--
-- The script is idempotent: re-running it refreshes the function and the
-- policies without touching the collected data.
-- =============================================================================

create extension if not exists "uuid-ossp";

create table if not exists public.provider_usage_daily (
  id uuid default uuid_generate_v4() primary key,
  provider text not null,
  model text not null default 'unknown',
  date date not null default (timezone('utc'::text, now())::date),
  request_count integer not null default 0,
  failed_count integer not null default 0,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  cost_usd numeric(18, 8) not null default 0,
  last_success_at timestamptz,
  last_error text,
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (provider, model, date)
);

create index if not exists provider_usage_daily_date_idx
  on public.provider_usage_daily (date desc);

alter table public.provider_usage_daily enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'provider_usage_daily'
      and policyname = 'Service role manages provider telemetry'
  ) then
    create policy "Service role manages provider telemetry"
      on public.provider_usage_daily for all
      using (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');
  end if;
end $$;

-- Atomic helper: several requests of the same provider may arrive at the same
-- time, a read/modify/write cycle would lose counts.
create or replace function public.record_provider_usage(
  p_provider text,
  p_model text,
  p_date date,
  p_requests integer,
  p_failures integer,
  p_prompt_tokens integer,
  p_completion_tokens integer,
  p_cost_usd numeric,
  p_last_success timestamptz,
  p_last_error text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.provider_usage_daily
    (provider, model, date, request_count, failed_count, prompt_tokens,
     completion_tokens, cost_usd, last_success_at, last_error, updated_at)
  values (
    p_provider,
    coalesce(nullif(p_model, ''), 'unknown'),
    p_date,
    greatest(coalesce(p_requests, 0), 0),
    greatest(coalesce(p_failures, 0), 0),
    greatest(coalesce(p_prompt_tokens, 0), 0),
    greatest(coalesce(p_completion_tokens, 0), 0),
    greatest(coalesce(p_cost_usd, 0), 0),
    p_last_success,
    p_last_error,
    timezone('utc'::text, now())
  )
  on conflict (provider, model, date)
  do update set
    request_count = public.provider_usage_daily.request_count + greatest(coalesce(p_requests, 0), 0),
    failed_count = public.provider_usage_daily.failed_count + greatest(coalesce(p_failures, 0), 0),
    prompt_tokens = public.provider_usage_daily.prompt_tokens + greatest(coalesce(p_prompt_tokens, 0), 0),
    completion_tokens = public.provider_usage_daily.completion_tokens + greatest(coalesce(p_completion_tokens, 0), 0),
    cost_usd = public.provider_usage_daily.cost_usd + greatest(coalesce(p_cost_usd, 0), 0),
    last_success_at = coalesce(p_last_success, public.provider_usage_daily.last_success_at),
    last_error = coalesce(p_last_error, public.provider_usage_daily.last_error),
    updated_at = timezone('utc'::text, now());
end;
$$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.record_provider_usage(text, text, date, integer, integer, integer, integer, numeric, timestamptz, text) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.record_provider_usage(text, text, date, integer, integer, integer, integer, numeric, timestamptz, text) from authenticated';
  end if;
end $$;
