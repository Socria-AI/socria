-- supabase/freemium.sql — the free plan's allowances, spent atomically.
--
-- The freemium change of October 31, 2026 (docs/FREEMIUM.md). Paste into the
-- Supabase SQL Editor once and run it — it is safe to run again, and it
-- changes no existing row. It creates EVERYTHING the free plan's limits need:
-- the usage table (if this database never had it), the counting function, a
-- non-negative check (NOT VALID, so old rows are not scanned) and the four
-- functions that refuse and count in one statement. The same statements are
-- in supabase/schema.sql, which stays the whole schema in one file.
--
-- WITHOUT THE TABLE the free plan cannot be counted at all, and the server
-- pauses it: new conversations, Logic Maps, artifacts and documents answer
-- "Your free plan can't be checked right now" (lib/quota.ts
-- QUOTA_UNAVAILABLE) until this has been run. Without only the functions, the
-- code still counts, through the older read-then-bump path — right except
-- when two requests race for the last unit of an allowance.
--
-- Check it worked: signed in, open /api/health/upstream — `usage` should read
-- { table: true, functions: true }.

-- ── The usage table and its counter (lib/usage.ts) ───────────────────
--
-- One row per (person, scope, counter). `scope` is what the counter resets
-- with: a calendar month for the monthly ones ('2026-11'), or a marker for a
-- thing charged once ('mapmark:<conversation>'). Deliberately not in
-- `conversations`: a count must survive the conversation being deleted, or
-- deleting a chat would refund what it spent.
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

-- Only the server (service role) reads and writes it; nobody signed in reads
-- another person's counts through the public API.
alter table logos_usage enable row level security;

-- Atomic increment: read-then-write from the application would race two tabs
-- against each other and lose counts; this cannot.
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

-- ── Free-tier allowances, spent atomically (lib/quota.ts) ─────────────
--
-- bump_logos_usage counts; it cannot refuse. The plan boundaries need a
-- function that refuses AND counts in one statement, because "read the count,
-- run the model, then add one" lets two requests that arrive together both
-- read the last free unit and both spend it. Four functions, all keyed on the
-- same table and safe to re-run:
--
--   consume_logos_usage  take p_by units if that keeps n within p_limit
--                        (null = no limit); the new n, or -1 when refused
--   refund_logos_usage   give units back after a failed operation, never
--                        below zero; the new n
--   claim_logos_unit     a unit that is charged ONCE per thing (a
--                        conversation, a Logic Map, an artifact, a document): 'already'
--                        when this thing was charged before, 'claimed' when
--                        this call charged it, 'refused' at the limit
--   release_logos_unit   undo a claim whose operation failed; true when there
--                        was one to undo
--
-- The UPDATE ... WHERE n + p_by <= p_limit is the whole of the concurrency
-- story: the row lock serialises racing updates, and READ COMMITTED re-checks
-- the WHERE against the committed row, so the loser of a race on the last
-- unit matches nothing and is refused. claim_logos_unit takes that same row
-- lock first (SELECT ... FOR UPDATE) so its marker check and its count cannot
-- interleave with another claim for the same person and counter.

-- No counter goes below zero, whatever a caller sends. NOT VALID so adding it
-- never fails on old rows; every write from here on is checked.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'logos_usage_n_nonneg') then
    alter table logos_usage add constraint logos_usage_n_nonneg check (n >= 0) not valid;
  end if;
end;
$$;

create or replace function consume_logos_usage(
  p_user text, p_scope text, p_counter text, p_by integer, p_limit integer, p_at bigint
) returns integer
language plpgsql
as $$
declare
  out_n integer;
begin
  if p_by is null or p_by < 1 then
    return -1;
  end if;
  insert into logos_usage (user_id, scope, counter, n, updated_at)
  values (p_user, p_scope, p_counter, 0, p_at)
  on conflict (user_id, scope, counter) do nothing;
  update logos_usage
     set n = n + p_by, updated_at = p_at
   where user_id = p_user and scope = p_scope and counter = p_counter
     and (p_limit is null or n + p_by <= p_limit)
  returning n into out_n;
  if not found then
    return -1;
  end if;
  return out_n;
end;
$$;

create or replace function refund_logos_usage(
  p_user text, p_scope text, p_counter text, p_by integer, p_at bigint
) returns integer
language plpgsql
as $$
declare
  out_n integer;
begin
  update logos_usage
     set n = greatest(0, n - greatest(coalesce(p_by, 0), 0)), updated_at = p_at
   where user_id = p_user and scope = p_scope and counter = p_counter
  returning n into out_n;
  return coalesce(out_n, 0);
end;
$$;

create or replace function claim_logos_unit(
  p_user text, p_mark text, p_scope text, p_counter text, p_limit integer, p_at bigint
) returns text
language plpgsql
as $$
declare
  cur integer;
begin
  insert into logos_usage (user_id, scope, counter, n, updated_at)
  values (p_user, p_scope, p_counter, 0, p_at)
  on conflict (user_id, scope, counter) do nothing;
  select n into cur from logos_usage
   where user_id = p_user and scope = p_scope and counter = p_counter
   for update;
  if exists (
    select 1 from logos_usage
     where user_id = p_user and scope = p_mark and counter = p_counter and n > 0
  ) then
    return 'already';
  end if;
  if p_limit is not null and cur >= p_limit then
    return 'refused';
  end if;
  update logos_usage set n = n + 1, updated_at = p_at
   where user_id = p_user and scope = p_scope and counter = p_counter;
  insert into logos_usage (user_id, scope, counter, n, updated_at)
  values (p_user, p_mark, p_counter, 1, p_at)
  on conflict (user_id, scope, counter) do update set n = 1, updated_at = p_at;
  return 'claimed';
end;
$$;

create or replace function release_logos_unit(
  p_user text, p_mark text, p_scope text, p_counter text, p_at bigint
) returns boolean
language plpgsql
as $$
begin
  -- the same lock order as a claim: the count first, then the marker
  perform 1 from logos_usage
   where user_id = p_user and scope = p_scope and counter = p_counter
   for update;
  delete from logos_usage
   where user_id = p_user and scope = p_mark and counter = p_counter and n > 0;
  if not found then
    return false;
  end if;
  update logos_usage set n = greatest(0, n - 1), updated_at = p_at
   where user_id = p_user and scope = p_scope and counter = p_counter;
  return true;
end;
$$;
