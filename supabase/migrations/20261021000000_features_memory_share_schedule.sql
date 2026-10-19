-- ============================================================================
-- Hyunk AI Hub - Feature Expansion (2026-10-21)
--
-- Adds the storage for the new features:
--   * AI memory (user_memories)          -> the AI remembers facts about the user
--   * Prompt library (user_prompts)      -> reusable prompt templates
--   * Public sharing (conversation_shares)
--   * Message feedback (message_feedback)
--   * Scheduled runs (scheduled_runs)    -> cron driven background prompts
--   * Conversation tags + trash (tags, deleted_at columns)
-- ============================================================================

-- The UUID generator is needed for the default primary keys.
create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------------
-- AI memory
-- ---------------------------------------------------------------------------
create table if not exists public.user_memories (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  content text not null,
  category text not null default 'general',
  source text not null default 'manual',
  enabled boolean not null default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.user_memories enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_memories'
      and policyname = 'Users can manage own memories'
  ) then
    create policy "Users can manage own memories"
      on public.user_memories for all
      using (auth.uid() = user_id or auth.uid() is null)
      with check (auth.uid() = user_id or auth.uid() is null);
  end if;
end $$;

create index if not exists user_memories_user_id_idx on public.user_memories (user_id);

-- ---------------------------------------------------------------------------
-- Prompt library
-- ---------------------------------------------------------------------------
create table if not exists public.user_prompts (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  title text not null,
  content text not null,
  category text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.user_prompts enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_prompts'
      and policyname = 'Users can manage own prompts'
  ) then
    create policy "Users can manage own prompts"
      on public.user_prompts for all
      using (auth.uid() = user_id or auth.uid() is null)
      with check (auth.uid() = user_id or auth.uid() is null);
  end if;
end $$;

create index if not exists user_prompts_user_id_idx on public.user_prompts (user_id);

-- ---------------------------------------------------------------------------
-- Public conversation sharing
-- ---------------------------------------------------------------------------
create table if not exists public.conversation_shares (
  id uuid default uuid_generate_v4() primary key,
  conversation_id uuid references public.conversations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  token text not null unique,
  enabled boolean not null default true,
  views integer not null default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  expires_at timestamp with time zone
);

alter table public.conversation_shares enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'conversation_shares'
      and policyname = 'Users can manage own shares'
  ) then
    create policy "Users can manage own shares"
      on public.conversation_shares for all
      using (auth.uid() = user_id or auth.uid() is null)
      with check (auth.uid() = user_id or auth.uid() is null);
  end if;
end $$;

create index if not exists conversation_shares_user_id_idx on public.conversation_shares (user_id);
create index if not exists conversation_shares_conversation_id_idx on public.conversation_shares (conversation_id);

-- ---------------------------------------------------------------------------
-- Message feedback
-- ---------------------------------------------------------------------------
create table if not exists public.message_feedback (
  id uuid default uuid_generate_v4() primary key,
  message_id uuid references public.messages(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  rating text not null check (rating in ('up', 'down')),
  comment text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (message_id, user_id)
);

alter table public.message_feedback enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'message_feedback'
      and policyname = 'Users can manage own feedback'
  ) then
    create policy "Users can manage own feedback"
      on public.message_feedback for all
      using (auth.uid() = user_id or auth.uid() is null)
      with check (auth.uid() = user_id or auth.uid() is null);
  end if;
end $$;

create index if not exists message_feedback_user_id_idx on public.message_feedback (user_id);

-- ---------------------------------------------------------------------------
-- Scheduled runs (cron driven background prompts)
-- ---------------------------------------------------------------------------
create table if not exists public.scheduled_runs (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  prompt text not null,
  model text not null,
  provider text not null default 'auto',
  cron text not null default '0 9 * * *',
  enabled boolean not null default true,
  last_run_at timestamp with time zone,
  last_result text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.scheduled_runs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'scheduled_runs'
      and policyname = 'Users can manage own schedules'
  ) then
    create policy "Users can manage own schedules"
      on public.scheduled_runs for all
      using (auth.uid() = user_id or auth.uid() is null)
      with check (auth.uid() = user_id or auth.uid() is null);
  end if;
end $$;

create index if not exists scheduled_runs_user_id_idx on public.scheduled_runs (user_id);

-- ---------------------------------------------------------------------------
-- Conversation tags + trash
-- ---------------------------------------------------------------------------
alter table public.conversations add column if not exists tags text[] not null default '{}';
alter table public.conversations add column if not exists deleted_at timestamp with time zone;

create index if not exists conversations_deleted_at_idx on public.conversations (deleted_at);
create index if not exists conversations_tags_idx on public.conversations using gin (tags);
