-- =============================================================================
-- Hyunk AI Hub - Fixes & Feature Migration
-- =============================================================================
-- Adds:
--   * conversations.folder_id / system_prompt / temperature
--   * conversation_folders table (persistent, per user folders)
--   * usage_logs table (daily request quota + token accounting)
--   * atomic RPC helpers for quota accounting
--   * multi-key support for provider_settings (key pool)
--   * search friendly indexes
--
-- The script is idempotent: it can safely be executed more than once.
-- =============================================================================

-- Ensure the UUID generator is available (required by the default primary keys).
create extension if not exists "uuid-ossp";

-- -----------------------------------------------------------------------------
-- 1. CONVERSATIONS: folder assignment + per conversation parameters
-- -----------------------------------------------------------------------------
create table if not exists public.conversation_folders (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  color text default '#38bdf8',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.conversation_folders enable row level security;

-- The application resolves the user through its own signed session cookie and
-- performs these writes with the service role, therefore the "auth.uid() is null"
-- branch keeps the schema usable with an anon-only configuration as well.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'conversation_folders'
      and policyname = 'Users can view own folders'
  ) then
    create policy "Users can view own folders"
      on public.conversation_folders for select
      using (auth.uid() = user_id or auth.uid() is null);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'conversation_folders'
      and policyname = 'Users can insert own folders'
  ) then
    create policy "Users can insert own folders"
      on public.conversation_folders for insert
      with check (auth.uid() = user_id or auth.uid() is null);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'conversation_folders'
      and policyname = 'Users can update own folders'
  ) then
    create policy "Users can update own folders"
      on public.conversation_folders for update
      using (auth.uid() = user_id or auth.uid() is null);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'conversation_folders'
      and policyname = 'Users can delete own folders'
  ) then
    create policy "Users can delete own folders"
      on public.conversation_folders for delete
      using (auth.uid() = user_id or auth.uid() is null);
  end if;
end $$;

alter table public.conversations
  add column if not exists folder_id uuid references public.conversation_folders(id) on delete set null;
alter table public.conversations
  add column if not exists system_prompt text;
alter table public.conversations
  add column if not exists temperature double precision;

-- -----------------------------------------------------------------------------
-- 2. USAGE LOGS: daily request quota + token accounting
-- -----------------------------------------------------------------------------
create table if not exists public.usage_logs (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  date date not null,
  request_count integer default 0,
  tokens_used integer default 0,
  unique (user_id, date)
);

alter table public.usage_logs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'usage_logs'
      and policyname = 'Users can view own usage'
  ) then
    create policy "Users can view own usage"
      on public.usage_logs for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'usage_logs'
      and policyname = 'Users can insert own usage'
  ) then
    create policy "Users can insert own usage"
      on public.usage_logs for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'usage_logs'
      and policyname = 'Users can update own usage'
  ) then
    create policy "Users can update own usage"
      on public.usage_logs for update
      using (auth.uid() = user_id);
  end if;
end $$;

-- Atomic helpers: avoid read/modify/write races when several requests of the
-- same user arrive at the same time.
create or replace function public.increment_daily_usage(p_user_id uuid, p_date date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.usage_logs (user_id, date, request_count, tokens_used)
  values (p_user_id, p_date, 1, 0)
  on conflict (user_id, date)
  do update set request_count = public.usage_logs.request_count + 1
  returning request_count into v_count;

  return v_count;
end;
$$;

create or replace function public.add_usage_tokens(p_user_id uuid, p_date date, p_tokens integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer;
begin
  insert into public.usage_logs (user_id, date, request_count, tokens_used)
  values (p_user_id, p_date, 0, greatest(coalesce(p_tokens, 0), 0))
  on conflict (user_id, date)
  do update set tokens_used = public.usage_logs.tokens_used + greatest(coalesce(p_tokens, 0), 0)
  returning tokens_used into v_total;

  return v_total;
end;
$$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.increment_daily_usage(uuid, date) from anon';
    execute 'revoke all on function public.add_usage_tokens(uuid, date, integer) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.increment_daily_usage(uuid, date) to service_role';
    execute 'grant execute on function public.add_usage_tokens(uuid, date, integer) to service_role';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.increment_daily_usage(uuid, date) to authenticated';
    execute 'grant execute on function public.add_usage_tokens(uuid, date, integer) to authenticated';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 3. MESSAGES: token accounting columns
-- -----------------------------------------------------------------------------
alter table public.messages
  add column if not exists tokens_prompt integer default 0;
alter table public.messages
  add column if not exists tokens_completion integer default 0;

-- -----------------------------------------------------------------------------
-- 4. PROVIDER SETTINGS: support a pool of API keys per provider
-- -----------------------------------------------------------------------------
-- The previous schema enforced `provider` to be unique which made a multi-key
-- pool impossible. The uniqueness is moved to the (provider, encrypted_api_key)
-- pair so the same provider can hold several distinct keys.
alter table public.provider_settings drop constraint if exists provider_settings_provider_key;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'provider_settings_provider_encrypted_key'
  ) then
    alter table public.provider_settings
      add constraint provider_settings_provider_encrypted_key
      unique (provider, encrypted_api_key);
  end if;
end $$;

alter table public.provider_settings
  add column if not exists created_at timestamp with time zone default timezone('utc'::text, now()) not null;

-- -----------------------------------------------------------------------------
-- 5. INDEXES (search & listing performance)
-- -----------------------------------------------------------------------------
create index if not exists conversations_user_updated_idx
  on public.conversations (user_id, updated_at desc);
create index if not exists conversations_folder_idx
  on public.conversations (folder_id);
create index if not exists conversations_title_lower_idx
  on public.conversations (lower(title));
create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at);
create index if not exists conversation_folders_user_created_idx
  on public.conversation_folders (user_id, created_at);
create index if not exists usage_logs_user_date_idx
  on public.usage_logs (user_id, date);

-- Trigram index for fast message content search (optional extension).
do $$
begin
  begin
    create extension if not exists pg_trgm;
    create index if not exists messages_content_trgm_idx
      on public.messages using gin (content gin_trgm_ops);
  exception when others then
    -- pg_trgm is not available: the ILIKE search still works (sequential scan).
    null;
  end;
end $$;
