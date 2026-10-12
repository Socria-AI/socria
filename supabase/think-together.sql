-- supabase/think-together.sql — everything Sharing and Think Together need, in one paste.
--
-- Run this once in the Supabase SQL editor for a deployment that says
-- "Sharing is not set up on this deployment yet." It is safe to run again:
-- every statement is "if not exists", or a lock-down that is the same the
-- second time. It only ADDS tables and indexes — nothing existing is changed,
-- and no row is touched.
--
-- What it creates (copied from schema.sql and rooms.sql, the sources of truth):
--   shares, share_members, share_comments, share_activity, share_presence
--       sharing a Project or a conversation: people, links, codes, comments,
--       change history, and who is looking right now (Think Together)
--   logos_rooms, logos_room_members, logos_room_events
--       a live Logos room two people think in together
--
-- Then row-level security, as rls.sql has it: these tables are reached only by
-- the server (lib/share/server.ts, lib/logos-rooms-server.ts) with the service
-- key, so browsers get no access to them at all.

-- ── Sharing: people, links, codes, comments, history ─────────────────
--
-- One share per resource (a Project or a conversation), owned by the person
-- whose rows it opens. The resource itself never changes owner: every read a
-- collaborator makes is the owner's row, reached through lib/share/server.ts,
-- which checks the role first. No token is stored: a link token is an HMAC of
-- the share and a random nonce under a server secret (so the owner can copy
-- it again, and rotating the nonce revokes it), and only its hash is kept for
-- lookup. An emailed invite's token is stored hashed and nothing else.
-- See lib/share/roles.ts for what each role may do.
create table if not exists shares (
  id text primary key,
  resource_type text not null,
  resource_id text not null,
  owner_id text not null,
  link_role text,
  link_nonce text,
  link_hash text,
  code text,
  code_role text,
  created_at bigint not null,
  updated_at bigint not null
);
create unique index if not exists shares_resource_idx on shares (owner_id, resource_type, resource_id);
create index if not exists shares_lookup_idx on shares (resource_type, resource_id);
create unique index if not exists shares_link_idx on shares (link_hash) where link_hash is not null;
create unique index if not exists shares_code_idx on shares (code) where code is not null;

create table if not exists share_members (
  id text primary key,
  share_id text not null,
  user_id text,
  email text,
  role text not null,
  via text not null,
  invited_by text not null,
  display_name text,
  invite_hash text,
  created_at bigint not null,
  accepted_at bigint,
  removed_at bigint
);
create index if not exists share_members_share_idx on share_members (share_id);
create index if not exists share_members_user_idx on share_members (user_id);
create unique index if not exists share_members_user_once on share_members (share_id, user_id)
  where user_id is not null and removed_at is null;
create unique index if not exists share_members_email_once on share_members (share_id, email)
  where email is not null and user_id is null and removed_at is null;

create table if not exists share_comments (
  id text primary key,
  share_id text not null,
  resource_type text not null,
  resource_id text not null,
  anchor text not null default '',
  parent_id text,
  user_id text not null,
  display_name text,
  body text not null,
  created_at bigint not null,
  edited_at bigint,
  resolved_at bigint,
  resolved_by text,
  deleted_at bigint
);
create index if not exists share_comments_resource_idx on share_comments (resource_type, resource_id, created_at);

create table if not exists share_activity (
  id text primary key,
  share_id text not null,
  resource_type text not null,
  resource_id text not null,
  user_id text not null,
  display_name text,
  kind text not null,
  summary text not null,
  created_at bigint not null
);
create index if not exists share_activity_resource_idx on share_activity (resource_type, resource_id, created_at desc);

-- Who is looking at a shared thing right now, and where their pointer is —
-- Think Together's presence. One row per person per resource, overwritten on
-- every heartbeat; a row older than half a minute is somebody who has gone.
create table if not exists share_presence (
  resource_type text not null,
  resource_id text not null,
  user_id text not null,
  display_name text,
  cursor jsonb,
  seen_at bigint not null,
  primary key (resource_type, resource_id, user_id)
);


-- ── Live Logos rooms (rooms.sql) ──────────────────────────────────

create table if not exists logos_rooms (
  id text primary key,
  -- The share code, normalised upper-case. Unique while the room is open; a
  -- closed room keeps its code so the history stays addressable.
  code text not null,
  -- Nullable ON PURPOSE. When the host deletes their account the room does
  -- not vanish from under the other participant — the host reference is
  -- cleared and the room is closed. See the deletion note below.
  host_user_id text,
  -- The line of thinking the host opened the room around, captured ONCE at
  -- creation and never again.
  --
  -- It lives on the room rather than inside a `hello` event for two reasons.
  -- A guest may only read the event log from where they sat down (see
  -- joined_seq), so a session sent as the first event would be invisible to
  -- everyone who arrived after it. And a `hello` re-sent later would carry
  -- the MERGED session — both people's words — into a row attributed to
  -- whoever sent it, which is the exact defect this table exists to remove.
  -- Written at creation, when the room is empty and every word in it is
  -- necessarily the host's own.
  seed_session jsonb,
  created_at bigint not null,
  closed_at bigint
);

create unique index if not exists logos_rooms_open_code_idx
  on logos_rooms (code) where closed_at is null;

create table if not exists logos_room_members (
  room_id text not null references logos_rooms(id) on delete cascade,
  user_id text not null,
  seat text not null check (seat in ('host', 'guest')),
  display_name text not null,
  joined_at bigint not null,
  -- Where the room was when this person sat down. A member may read the log
  -- from here forward and no further back: without it, a guest could ask for
  -- everything since seq 0 and replay the host's session from before they
  -- were invited, including anything a PREVIOUS guest said.
  joined_seq bigint not null default 0,
  left_at bigint,
  primary key (room_id, user_id)
);

create unique index if not exists logos_room_members_seat_idx
  on logos_room_members (room_id, seat) where left_at is null;

create index if not exists logos_room_members_user_idx
  on logos_room_members (user_id);

create table if not exists logos_room_events (
  id text not null,
  room_id text not null references logos_rooms(id) on delete cascade,
  seq bigserial,
  user_id text not null,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at bigint not null,
  -- The event id is the client's idempotence key and is unique WITHIN a room,
  -- not globally. As a bare global primary key it meant an id minted in one
  -- room could collide with one in another — and because a duplicate insert
  -- is deliberately reported as success (a client retrying on a flaky network
  -- must not see an error), that collision would silently drop a message
  -- instead of raising one.
  primary key (room_id, id)
);

create index if not exists logos_room_events_room_seq_idx
  on logos_room_events (room_id, seq);

create index if not exists logos_room_events_user_idx
  on logos_room_events (user_id);



-- ── Row-level security: server only ─────────────────────────────────
alter table shares             enable row level security;
alter table shares             force row level security;
alter table share_members      enable row level security;
alter table share_members      force row level security;
alter table share_comments     enable row level security;
alter table share_comments     force row level security;
alter table share_activity     enable row level security;
alter table share_activity     force row level security;
alter table share_presence     enable row level security;
alter table share_presence     force row level security;
alter table logos_rooms        enable row level security;
alter table logos_rooms        force row level security;
alter table logos_room_members enable row level security;
alter table logos_room_members force row level security;
alter table logos_room_events  enable row level security;
alter table logos_room_events  force row level security;
revoke all on shares             from anon, authenticated;
revoke all on share_members      from anon, authenticated;
revoke all on share_comments     from anon, authenticated;
revoke all on share_activity     from anon, authenticated;
revoke all on share_presence     from anon, authenticated;
revoke all on logos_rooms        from anon, authenticated;
revoke all on logos_room_members from anon, authenticated;
revoke all on logos_room_events  from anon, authenticated;
