-- Socria conversation storage.
-- Run this once against your Supabase project (SQL Editor or psql).
-- All access goes through the Next.js API using the service role key, which
-- bypasses RLS; every query there is scoped with .eq('user_id', ...) and that
-- is the control that keeps accounts apart. Run rls.sql alongside this file
-- anyway: it turns RLS on with no policies, so a leaked anon key or an
-- accidentally exposed REST endpoint returns nothing instead of everything.

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

-- Which moment led to the subscription — the prompt trigger ('map-full',
-- 'explore-spent') and the surface it was on ('logos', 'one-page'). Short
-- tokens from a fixed allow-list (lib/checkout-attribution.ts), never free
-- text. Written best-effort by the webhook; the entitlement never waits on it.
alter table socria_subscriptions
  add column if not exists attributed_trigger text;
alter table socria_subscriptions
  add column if not exists attributed_surface text;

create index if not exists socria_subscriptions_customer_idx
  on socria_subscriptions (stripe_customer_id);

-- Metered usage, for the free tier's boundaries.
--
-- One row per (person, scope, counter). `scope` is what the counter resets
-- with: a calendar month for the monthly ones ('2026-08'), or a single
-- conversation for the per-chat ones ('chat:lg_abc123'). Sharing one table
-- between the two keeps a single place to read, write and expire — and makes
-- adding a counter a config change rather than a migration.
--
-- Deliberately NOT in `conversations`: a per-chat counter must survive the
-- conversation being deleted, or deleting a chat would refund what it spent.
create table if not exists logos_usage (
  user_id text not null,
  scope text not null,
  counter text not null,
  n integer not null default 0,
  updated_at bigint not null,
  primary key (user_id, scope, counter)
);

create index if not exists logos_usage_user_scope_idx
  on logos_usage (user_id, scope);

-- Atomic increment. Read-then-write from the application would race two
-- tabs against each other and lose counts; this cannot.
create or replace function bump_logos_usage(
  p_user text, p_scope text, p_counter text, p_by integer, p_at bigint
) returns integer
language plpgsql
as $$
declare
  out_n integer;
begin
  insert into logos_usage (user_id, scope, counter, n, updated_at)
  values (p_user, p_scope, p_counter, p_by, p_at)
  on conflict (user_id, scope, counter)
  do update set n = logos_usage.n + p_by, updated_at = p_at
  returning n into out_n;
  return out_n;
end;
$$;

-- Lifecycle email: the ledger of who has had which note, and who has said
-- stop.
--
-- One row per (person, kind), and the primary key is the idempotency: a
-- sender INSERTS first and sends only if the insert went in, so two crons
-- overlapping or a webhook retried by Stripe collide on the key and only one
-- of them sends. `due_at` is for the deferred kinds (limit-chats is claimed
-- at the refusal and sent a day later); `sent_at` is set once the provider
-- accepted it, and an unsent row is deleted when the provider refused.
--
-- The opt-out is a row too, with kind = 'unsubscribed'. Same table, so a
-- database that can send can record a refusal without a second migration.
-- Holds ids and timestamps only — never an address, never content.
create table if not exists lifecycle_emails (
  user_id text not null,
  kind text not null,
  created_at bigint not null,
  due_at bigint,
  sent_at bigint,
  primary key (user_id, kind)
);

-- The cron reads "due and unsent" by kind; without this it scans the table.
create index if not exists lifecycle_emails_due_idx
  on lifecycle_emails (kind, due_at)
  where sent_at is null;

-- Who the day-N notes may go to, decided in the database rather than by
-- reading every conversation into the application to find two hundred people.
--
-- A candidate's FIRST conversation was made in [p_from, p_to) — the window
-- for "between N and N+1 days in" — and nothing of theirs has changed for a
-- day (max(updated_at) < p_now - 24h): a note that lands while the person is
-- still working is noise. The anti-join drops anyone who has had this kind
-- already, or who has said stop. The kind is a parameter so day-3 and day-7
-- share one function and one set of rules.
--
-- Times are epoch milliseconds (bigint) throughout, matching updated_at and
-- the rest of the ledger; created_at is a timestamptz and is converted.
create or replace function lifecycle_candidates(
  p_kind text, p_from bigint, p_to bigint, p_now bigint, p_limit integer
) returns table (user_id text, first_at bigint, last_at bigint)
language plpgsql
stable
as $$
begin
  return query
    select c.user_id,
           (extract(epoch from min(c.created_at)) * 1000)::bigint as first_at,
           max(c.updated_at)::bigint as last_at
      from conversations c
     where not exists (
             select 1 from lifecycle_emails l
              where l.user_id = c.user_id
                and l.kind in (p_kind, 'unsubscribed')
           )
     group by c.user_id
    having (extract(epoch from min(c.created_at)) * 1000)::bigint >= p_from
       and (extract(epoch from min(c.created_at)) * 1000)::bigint <  p_to
       and max(c.updated_at) < p_now - 86400000
     order by first_at
     limit p_limit;
end;
$$;

-- The grouping above walks conversations by person and first date.
create index if not exists conversations_user_created_idx
  on conversations (user_id, created_at);
