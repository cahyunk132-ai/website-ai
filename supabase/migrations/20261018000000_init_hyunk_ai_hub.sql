-- ==============================================================================
-- Hyunk AI Hub - Initial PostgreSQL Schema & Row Level Security (RLS)
-- ==============================================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. PROFILES TABLE
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text,
  display_name text,
  role text default 'user' check (role in ('user', 'admin')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- 2. CONVERSATIONS TABLE
create table if not exists public.conversations (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  title text not null default 'New Conversation',
  selected_model text not null,
  selected_provider text not null check (selected_provider in ('radox', 'inkstone', 'experiential', 'auto')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.conversations enable row level security;

create policy "Users can view own conversations"
  on public.conversations for select
  using (auth.uid() = user_id or auth.uid() is null);

create policy "Users can insert own conversations"
  on public.conversations for insert
  with check (auth.uid() = user_id or auth.uid() is null);

create policy "Users can update own conversations"
  on public.conversations for update
  using (auth.uid() = user_id or auth.uid() is null);

create policy "Users can delete own conversations"
  on public.conversations for delete
  using (auth.uid() = user_id or auth.uid() is null);

-- 3. MESSAGES TABLE
create table if not exists public.messages (
  id uuid default uuid_generate_v4() primary key,
  conversation_id uuid references public.conversations(id) on delete cascade not null,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  model text,
  provider text,
  is_fallback boolean default false,
  fallback_reason text,
  tokens_prompt integer default 0,
  tokens_completion integer default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.messages enable row level security;

create policy "Users can view messages of their conversations"
  on public.messages for select
  using (
    exists (
      select 1 from public.conversations
      where conversations.id = messages.conversation_id
      and (conversations.user_id = auth.uid() or auth.uid() is null)
    )
  );

create policy "Users can insert messages into their conversations"
  on public.messages for insert
  with check (
    exists (
      select 1 from public.conversations
      where conversations.id = messages.conversation_id
      and (conversations.user_id = auth.uid() or auth.uid() is null)
    )
  );

create policy "Users can delete messages of their conversations"
  on public.messages for delete
  using (
    exists (
      select 1 from public.conversations
      where conversations.id = messages.conversation_id
      and (conversations.user_id = auth.uid() or auth.uid() is null)
    )
  );

-- 4. PROVIDER SETTINGS (Encrypted Secrets - Admin Only)
create table if not exists public.provider_settings (
  id uuid default uuid_generate_v4() primary key,
  provider text unique not null check (provider in ('radox', 'inkstone', 'experiential')),
  encrypted_api_key text,
  is_enabled boolean default true,
  custom_base_url text,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.provider_settings enable row level security;

-- Only service role can access provider_settings directly (No client SELECT policy)
create policy "Service role only for provider settings"
  on public.provider_settings
  using (false);

-- 5. MODEL CATALOG
create table if not exists public.model_catalog (
  id text primary key,
  name text not null,
  provider text not null check (provider in ('radox', 'inkstone', 'experiential')),
  context_window integer not null,
  supports_streaming boolean default true,
  supports_vision boolean default false,
  supports_tools boolean default false,
  input_price_per_million numeric(10, 4) default 0,
  output_price_per_million numeric(10, 4) default 0,
  is_free_quota_eligible boolean default false,
  fallback_model_id text,
  fallback_provider text,
  is_active boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.model_catalog enable row level security;

create policy "Public read access for model catalog"
  on public.model_catalog for select
  using (true);

-- 6. USAGE EVENTS
create table if not exists public.usage_events (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  provider text not null check (provider in ('radox', 'inkstone', 'experiential')),
  model text not null,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  total_tokens integer not null default 0,
  estimated_cost_usd numeric(10, 6) not null default 0,
  is_fallback boolean default false,
  status text not null default 'success',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.usage_events enable row level security;

create policy "Users can view own usage events"
  on public.usage_events for select
  using (auth.uid() = user_id or auth.uid() is null);

create policy "Insert usage events permitted"
  on public.usage_events for insert
  with check (true);
