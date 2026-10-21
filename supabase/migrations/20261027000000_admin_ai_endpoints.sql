-- endpoint credentials are platform-wide secrets: no browser/anon access.
create table if not exists public.ai_endpoints (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  "baseUrl" text not null,
  encrypted_key text not null,
  models jsonb not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.ai_endpoints enable row level security;
revoke all on public.ai_endpoints from anon, authenticated;
grant all on public.ai_endpoints to service_role;

-- custom provider identifiers can be saved with conversations, but not as
-- built-in key-pool providers. their credentials stay in ai_endpoints only.
alter table public.conversations drop constraint if exists conversations_selected_provider_check;
alter table public.conversations add constraint conversations_selected_provider_check
  check (selected_provider in ('radox', 'inkstone', 'auto') or selected_provider ~ '^custom:[0-9a-f-]{36}$');
