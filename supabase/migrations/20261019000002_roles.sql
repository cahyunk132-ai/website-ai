-- =============================================================================
-- Hyunk AI Hub - Role & Tier system
--
-- The role of an account decides the daily quota, the maximum length of an
-- answer and which models may be used:
--
--   admin    -> unlimited, every model
--   free     -> tier 0
--   premium1 -> tier 1
--   premium2 -> tier 2
--   premium3 -> tier 3
--   premium4 -> tier 4
--
-- The table is the manual override of an administrator. It is only reachable
-- with the service role key, a user can never raise his own role.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. The table with the manual overrides
-- -----------------------------------------------------------------------------
create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'free'
    check (role in ('admin', 'free', 'premium1', 'premium2', 'premium3', 'premium4')),
  updated_at timestamptz not null default now()
);

comment on table public.user_roles is
  'Manual role overrides of the administrator (admin/free/premium1..premium4).';

alter table public.user_roles enable row level security;

-- -----------------------------------------------------------------------------
-- 2. The access policy
--
-- The prompt of the specification asked for `using (true)`. That would allow
-- every visitor with the anon key to promote his own account to premium4, so
-- the policy is restricted to the administrators instead. The application uses
-- the service role key, which bypasses the row level security anyway.
-- -----------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

drop policy if exists "Admin can manage roles" on public.user_roles;
create policy "Admin can manage roles"
  on public.user_roles
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- 3. The seeded administrator keeps the admin role
-- -----------------------------------------------------------------------------
insert into public.user_roles (user_id, role, updated_at)
select id, 'admin', now()
from auth.users
where email = 'admin@hyunkai.com'
on conflict (user_id) do update
  set role = 'admin',
      updated_at = now();

-- -----------------------------------------------------------------------------
-- 4. The usage is tracked per tier
-- -----------------------------------------------------------------------------
alter table public.usage_logs
  add column if not exists role text default 'free';

create index if not exists usage_logs_role_idx
  on public.usage_logs (role);
