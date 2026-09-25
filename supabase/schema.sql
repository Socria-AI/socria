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

-- ── The Mind Graph ──────────────────────────────────────────────────
--
-- Core 4's persistent memory. Not a store that a graph is drawn FROM — the
-- graph IS the store. A row in mind_nodes is a memory; retrieval walks
-- mind_edges; the Memory page reads these same rows. If a node is not here,
-- Core does not know it.
--
-- Rows rather than a jsonb blob on user_profiles, which is where the flat
-- memory it replaces lives. One array per user means every read pulls the
-- whole thing, nothing can be indexed, two-hop traversal happens in
-- application memory, and the Memory page would load a person's entire
-- history to draw anything. Rows are the difference between a graph and a
-- list that mentions relationships.
--
-- Postgres rather than a graph database: a realistic graph is hundreds to
-- low thousands of nodes per person, which two- and three-hop traversal
-- handles comfortably here — and staying in Postgres means account deletion
-- and export already reach it by the rules this codebase enforces.

create table if not exists mind_nodes (
  user_id text not null,
  id text not null,
  -- A STRING, not an enum. The ontology is meant to grow, and an enum makes
  -- that a migration every time. Unknown types store and render; see
  -- KNOWN_NODE_TYPES in lib/mind/types.ts for the ones with colours.
  type text not null,
  label text not null,
  content text not null default '',
  aliases jsonb not null default '[]'::jsonb,
  status text not null default 'active',
  -- Two axes on purpose. `confidence` is how sure SOCRIA is this is true;
  -- `certainty` is how sure the PERSON seemed. Collapsing them loses the
  -- difference between "they are sure" and "we are sure".
  confidence real not null default 0.5,
  certainty real not null default 0.5,
  importance real not null default 0.4,
  -- Decayed recall strength, written on access: recall strengthens memory
  -- and unused regions fade.
  activation real not null default 0.2,
  seen integer not null default 1,
  -- Never carried into Logos, whose map can be exported as an image.
  private boolean not null default false,
  -- An ARRAY because grounds accumulate: first inferred from a remark, later
  -- stated outright, later supported by a file. That history is what
  -- justifies a rising confidence.
  provenance jsonb not null default '[]'::jsonb,
  created_at bigint not null,
  updated_at bigint not null,
  last_accessed bigint not null,
  primary key (user_id, id)
);

create index if not exists mind_nodes_user_type_idx on mind_nodes (user_id, type);
create index if not exists mind_nodes_user_status_idx on mind_nodes (user_id, status);
create index if not exists mind_nodes_user_seen_idx on mind_nodes (user_id, last_accessed desc);
create index if not exists mind_nodes_label_idx on mind_nodes (user_id, lower(label));

-- Edges are first-class rows with their own provenance and their own
-- reinforcement history, not a column on a node.
create table if not exists mind_edges (
  user_id text not null,
  id text not null,
  source_id text not null,
  target_id text not null,
  relationship text not null,
  confidence real not null default 0.6,
  -- How strongly activation flows across it. Reinforced on each sighting.
  strength real not null default 0.5,
  provenance jsonb not null default '[]'::jsonb,
  created_at bigint not null,
  updated_at bigint not null,
  last_reinforced bigint not null,
  primary key (user_id, id)
);

-- Indexed BOTH ways: activation spreads in both directions, because a
-- project reaches its goals and a goal reaches the project it belongs to.
create index if not exists mind_edges_source_idx on mind_edges (user_id, source_id);
create index if not exists mind_edges_target_idx on mind_edges (user_id, target_id);

-- What has been forgotten. The one table here that only ever grows.
--
-- Without it, deleting a memory is theatre: the next extraction notices the
-- same thing again and puts it back, the person deletes it a second time,
-- and concludes — correctly — that deletion does not work. The fingerprint
-- is type + normalised label rather than an id, because an id is regenerated
-- on every extraction and an id-keyed tombstone would stop nothing.
create table if not exists mind_tombstones (
  user_id text not null,
  fingerprint text not null,
  created_at bigint not null,
  primary key (user_id, fingerprint)
);

-- Claims about the person noticed once and not yet believed.
--
-- This is what makes "a generalisation needs a second sighting" possible
-- rather than merely stated. Without somewhere to record a first sighting
-- the rule blocks every sighting forever — nothing is created, so nothing
-- can be matched, so a real pattern could never be learned. These are NOT
-- nodes: retrieval cannot reach them and no prompt ever sees them.
--
-- `sources` holds distinct CONVERSATION ids, not a count. Ten turns of one
-- conversation about one difficult meeting is one afternoon read ten times,
-- not ten pieces of evidence.
create table if not exists mind_pending (
  user_id text not null,
  fingerprint text not null,
  type text not null,
  label text not null,
  content text not null default '',
  sources jsonb not null default '[]'::jsonb,
  first_at bigint not null,
  last_at bigint not null,
  primary key (user_id, fingerprint)
);

-- Uploaded files, kept so a character offset points at something. A claim
-- derived from a file carries charStart/charEnd in its provenance, and the
-- Memory page shows the sentence it came from — which needs the text.
create table if not exists mind_sources (
  user_id text not null,
  id text not null,
  name text not null,
  bytes integer not null default 0,
  text text not null default '',
  created_at bigint not null,
  primary key (user_id, id)
);

-- ── Projects ─────────────────────────────────────────────────────────
--
-- A Project is a focused REGION of the one Mind Graph, not a second store.
-- Its presence in the graph is an ordinary `Project` row in mind_nodes (the
-- anchor, node_id below) with ordinary edges running to it; everything a
-- Project "contains" is reached through those edges. This table holds only
-- the workspace: what it is called, what the person says it is for, how they
-- want its conversations handled, and whether it is archived.
--
-- There is deliberately no project_id on mind_nodes or mind_edges. A memory
-- is not owned by a Project; it is CONNECTED to one, and may be connected to
-- several. See lib/mind/projects.ts.
create table if not exists mind_projects (
  user_id text not null,
  id text not null,
  node_id text not null,
  name text not null,
  description text not null default '',
  instructions text not null default '',
  archived boolean not null default false,
  created_at bigint not null,
  updated_at bigint not null,
  primary key (user_id, id)
);

create index if not exists mind_projects_user_updated_idx on mind_projects (user_id, updated_at desc);
create unique index if not exists mind_projects_user_name_idx on mind_projects (user_id, lower(name));

-- Conversations and files are CONTAINERS, and those do belong to a Project.
-- Nullable: most conversations are in no Project, and deleting a Project
-- sets these back to null rather than deleting the conversation.
alter table conversations
  add column if not exists project_id text;
create index if not exists conversations_user_project_idx on conversations (user_id, project_id);

alter table mind_sources
  add column if not exists project_id text;
create index if not exists mind_sources_user_project_idx on mind_sources (user_id, project_id);

-- ── Core 4: the per-person reasoning state ───────────────────────────
--
-- Five tables, one responsibility each (lib/core4/store.ts;
-- docs/CORE-4-COGNITIVE-DESIGN.md, D10, D14, D15). All keyed to one person,
-- all deleted with the account, all in the export, all cleared by "forget
-- what Socria worked out" (app/api/account/memory). Timestamps are epoch ms,
-- like the Mind Graph's.

-- The Cognitive State of ONE conversation: what is happening now — the kind
-- of work, what the person has said they want (explicit) and what Socria has
-- inferred (with confidence and evidence, never shown to them as fact), and
-- a short history of the moves made. Small by construction (lib/cognition/
-- state.ts caps every list); replaced whole each turn.
create table if not exists core4_state (
  user_id text not null,
  conversation_id text not null,
  state jsonb not null,
  updated_at bigint not null,
  primary key (user_id, conversation_id)
);

-- The Reasoning Ledger: the claims, objections, alternatives, questions and
-- decisions of the person's THINKING, and what Socria contributed — each
-- attributed. `owner` is 'user' only when `basis` is quoted or paraphrased
-- from their own message (lib/core4/ledger.ts grounding); an idea Socria
-- raised is 'socria' for ever, and adoption is a separate user entry linked
-- derived_from it. `status` 'disputed' is what a correction leaves behind.
create table if not exists reasoning_entries (
  user_id text not null,
  id text not null,
  kind text not null,
  text text not null,
  owner text not null default 'unknown',
  stance text not null default 'entertains',
  basis text not null default 'inferred',
  quote text not null default '',
  reason text not null default '',
  status text not null default 'active',
  confidence real not null default 0.5,
  conversation_id text not null,
  project_id text,
  -- From a sensitive / conversation-only conversation: never used outside it.
  private boolean not null default false,
  turn integer not null default 0,
  revisions jsonb not null default '[]'::jsonb,
  created_at bigint not null,
  updated_at bigint not null,
  primary key (user_id, id)
);

create index if not exists reasoning_entries_user_updated_idx on reasoning_entries (user_id, updated_at desc);
create index if not exists reasoning_entries_user_conv_idx on reasoning_entries (user_id, conversation_id);
create index if not exists reasoning_entries_user_project_idx on reasoning_entries (user_id, project_id);

create table if not exists reasoning_links (
  user_id text not null,
  id text not null,
  from_id text not null,
  to_id text not null,
  rel text not null,
  owner text not null default 'unknown',
  reason text not null default '',
  created_at bigint not null,
  primary key (user_id, id)
);

create index if not exists reasoning_links_from_idx on reasoning_links (user_id, from_id);
create index if not exists reasoning_links_to_idx on reasoning_links (user_id, to_id);

-- Intervention history and outcomes: one row per Core 4 turn. `trace` is
-- CONTENT-FREE — enums, counts and reason codes (lib/core4/trace.ts), never
-- text from the person or from Socria. The outcome columns are written onto
-- a turn's row once the person has replied to it. Kept 180 days, purged at
-- write time (lib/core4/store.ts TRACE_RETENTION_MS).
create table if not exists core4_turns (
  user_id text not null,
  conversation_id text not null,
  turn integer not null,
  created_at bigint not null,
  trace jsonb not null,
  outcome_label text,
  outcome_confidence real,
  outcome_source text,
  primary key (user_id, conversation_id, turn)
);

create index if not exists core4_turns_user_created_idx on core4_turns (user_id, created_at);

-- Capability EVIDENCE, not a capability score: observable events ("right,
-- unassisted", "needed the answer given", "caught their own error"), each
-- tied to a concept and a turn, each deletable. Conclusions are drawn only
-- by counting them (lib/core4/capability.ts summarize).
create table if not exists capability_evidence (
  user_id text not null,
  id text not null,
  concept text not null,
  event text not null,
  assistance smallint not null default 0,
  conversation_id text not null,
  turn integer not null default 0,
  confidence real not null default 0.5,
  at bigint not null,
  primary key (user_id, id)
);

create index if not exists capability_evidence_user_concept_idx on capability_evidence (user_id, concept);
