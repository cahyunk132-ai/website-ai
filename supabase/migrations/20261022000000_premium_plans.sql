-- ============================================================================
-- Hyunk AI Hub - Premium Plans (2026-10-22)
--
-- Adds the subscription tier that drives the daily AI prompt quota:
--   * user_plans.plan           -> 'free' (5 prompt/hari) | 'premium' (10x)
--   * user_plans.premium_until  -> optional end of the premium period
--
-- The table is only reachable with the service role: the plan decides how
-- much quota a user gets, so a user must never be able to raise it himself.
-- ============================================================================

-- The UUID generator is needed for the default primary keys.
create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------------
-- User plans
-- ---------------------------------------------------------------------------
create table if not exists public.user_plans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'premium')),
  premium_until timestamp with time zone,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.user_plans enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_plans'
      and policyname = 'Service role only for user plans'
  ) then
    create policy "Service role only for user plans"
      on public.user_plans for all
      using (false)
      with check (false);
  end if;
end $$;

create index if not exists user_plans_plan_idx on public.user_plans (plan);

-- ---------------------------------------------------------------------------
-- Resolver used by the server to read the effective plan of a user.
-- A premium plan whose period has expired falls back to 'free'.
-- ---------------------------------------------------------------------------
create or replace function public.get_user_plan(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_until timestamp with time zone;
begin
  select plan, premium_until into v_plan, v_until
  from public.user_plans
  where user_id = p_user_id;

  if v_plan is null then
    return 'free';
  end if;

  if v_plan = 'premium' and v_until is not null and v_until < timezone('utc'::text, now()) then
    return 'free';
  end if;

  return v_plan;
end;
$$;

-- The function reads the table with elevated rights, so it must not be
-- callable by the anonymous or the authenticated role.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.get_user_plan(uuid) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.get_user_plan(uuid) from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.get_user_plan(uuid) to service_role';
  end if;
end $$;
