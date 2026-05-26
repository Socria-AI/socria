-- =============================================
-- Socria database schema
-- Run this in Supabase: SQL Editor → New Query → paste → Run
-- =============================================

-- USERS
-- We use Clerk for auth, so the `id` is Clerk's user_id (a string, e.g. "user_2abc...").
-- This table mirrors that ID so we can foreign-key from conversations/usage.
create table if not exists public.users (
  id          text primary key,
  email       text,
  created_at  timestamptz not null default now()
);

-- CONVERSATIONS
create table if not exists public.conversations (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null references public.users(id) on delete cascade,
  title       text not null default 'New thought session',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists conversations_user_id_idx
  on public.conversations(user_id, updated_at desc);

-- MESSAGES
create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role            text not null check (role in ('user','assistant','system')),
  content         text not null,
  created_at      timestamptz not null default now()
);

create index if not exists messages_conversation_id_idx
  on public.messages(conversation_id, created_at asc);

-- USAGE TRACKING (per user, per day)
create table if not exists public.usage (
  user_id        text not null references public.users(id) on delete cascade,
  date           date not null,
  message_count  integer not null default 0,
  token_estimate integer not null default 0,
  primary key (user_id, date)
);

-- Updated_at trigger for conversations
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists conversations_touch on public.conversations;
create trigger conversations_touch
before update on public.conversations
for each row execute function public.touch_updated_at();

-- =============================================
-- Row Level Security
-- We use Clerk (not Supabase Auth), so all DB access goes through
-- the server using the SERVICE_ROLE key. RLS still enabled as defense-in-depth:
-- enabling RLS without policies means anon key cannot read/write these tables,
-- which is exactly what we want.
-- =============================================
alter table public.users         enable row level security;
alter table public.conversations enable row level security;
alter table public.messages      enable row level security;
alter table public.usage         enable row level security;

-- (Intentionally no policies. Service role bypasses RLS; anon key is blocked.)
