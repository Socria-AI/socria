-- Socria conversation storage.
-- Run this once against your Supabase project (SQL Editor or psql).
-- All access goes through the Next.js API using the service role key,
-- so RLS isn't required. Enable it later if you ever expose direct client access.

create table if not exists conversations (
  id text primary key,
  user_id text not null,
  title text not null default 'New thought session',
  messages jsonb not null default '[]'::jsonb,
  memory jsonb not null default '{}'::jsonb,
  updated_at bigint not null,
  created_at timestamptz not null default now()
);

-- If the conversations table already existed from an earlier deploy, add
-- the memory column. Safe to re-run.
alter table conversations
  add column if not exists memory jsonb not null default '{}'::jsonb;

create index if not exists conversations_user_updated_idx
  on conversations (user_id, updated_at desc);

-- Logos sessions share this table with ordinary chats so both surfaces can
-- list one another's work. 'kind' tells them apart; 'map' holds the Thinking
-- Map for logos rows and stays null for chats.
alter table conversations
  add column if not exists kind text not null default 'chat';
alter table conversations
  add column if not exists map jsonb;
-- The Draft Space: the person's own writing, kept with the session that
-- produced it. Null for chats and for logos sessions nobody has written in.
alter table conversations
  add column if not exists draft jsonb;
-- Grounded context: material the user attached to specific Thinking Map
-- nodes (from Drive, Notion, Calendar, Gmail, the web, pastes, uploads).
-- Keyed by node id. Null for chats and ungrounded sessions.
alter table conversations
  add column if not exists contexts jsonb;

-- Imported "about you" profiles (AI history import). One row per user;
-- stores the profile the user pasted from another AI. Safe to re-run.
create table if not exists user_profiles (
  user_id text primary key,
  profile text not null default '',
  updated_at bigint not null,
  created_at timestamptz not null default now()
);

-- Cross-conversation thinking journey (evolving understanding, open
-- threads, timeline). Safe to re-run.
alter table user_profiles
  add column if not exists understanding jsonb not null default '{}'::jsonb;


-- Per-user OAuth connections for Logos "Add context" (Google, Notion).
-- The token bundle is stored encrypted in `secret` (AES-256-GCM via
-- CONNECTION_SECRET); this table never holds a plaintext token.
create table if not exists logos_connections (
  user_id text not null,
  provider text not null,
  secret text not null,
  account text,
  updated_at bigint not null,
  created_at timestamptz not null default now(),
  primary key (user_id, provider)
);

-- Socria One subscriptions. One row per user; Stripe is the source of truth
-- and this table is its local projection, written only by the webhook.
-- `status` is Stripe's own subscription status verbatim ('active', 'trialing',
-- 'past_due', 'canceled', …) so we never invent a vocabulary of our own.
create table if not exists socria_subscriptions (
  user_id text primary key,
  stripe_customer_id text not null,
  stripe_subscription_id text,
  status text not null default 'incomplete',
  price_id text,
  -- when the paid period runs out; entitlement survives a cancellation until
  -- this passes, because someone who cancels has already paid for the month
  current_period_end bigint,
  cancel_at_period_end boolean not null default false,
  updated_at bigint not null,
  created_at timestamptz not null default now()
);

create index if not exists socria_subscriptions_customer_idx
  on socria_subscriptions (stripe_customer_id);
