
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


