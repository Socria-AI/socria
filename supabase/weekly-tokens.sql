-- supabase/weekly-tokens.sql — a free account's week of tokens, held and settled atomically.
--
-- Sleep Mode (docs/SLEEP-MODE.md, lib/sleep-server.ts). ADD-ONLY: two functions
-- over the logos_usage table that supabase/freemium.sql created; no table,
-- column, constraint or row is changed or removed. Paste into the Supabase SQL
-- Editor once and run it — it is safe to run again. The same statements are at
-- the end of supabase/schema.sql, which stays the whole schema in one file.
--
-- THE ROWS. One row per person per week holds the tokens SETTLED this week:
--
--     (user_id, 'week:2026-11-02', 'tokens', n)        -- the week's Monday, UTC
--
-- and every AI call still running holds what it may cost in a row of its own:
--
--     (user_id, 'tokhold:week:2026-11-02:<call id>', 'tokens', n, updated_at = when it was taken)
--
-- A call holds before the model is asked (reserve_logos_tokens) and settles
-- when it ends (settle_logos_tokens): its hold is removed and what it really
-- cost is added to the week. A hold whose call never comes back — a crash, a
-- platform timeout — stops counting after p_ttl milliseconds, so nobody is
-- charged for a request that died.
--
--   reserve_logos_tokens(p_user, p_week, p_hold, p_want, p_min, p_limit, p_ttl, p_at) → jsonb
--       {"granted": g, "used": settled, "held": held}. Holds g = least(p_want,
--       free) tokens, where free = p_limit − settled − held by live holds —
--       and nothing (g = 0) when fewer than p_min are free. Never holds a
--       token past the limit.
--   settle_logos_tokens(p_user, p_week, p_hold, p_tokens, p_at) → integer
--       Removes the hold and adds p_tokens to the week; the week's new total.
--       Adds only when the hold was still there, so a settle sent twice (a
--       retry after a dropped connection) is never counted twice.
--
-- CONCURRENCY. Both take the person's week row lock first (SELECT … FOR
-- UPDATE), so every hold and settle for one person's week runs one at a time:
-- two tabs, two devices or two requests at once can never both be given the
-- same last tokens. The read of what is held, and the hold itself, happen
-- under that lock.
--
-- Until this is run, lib/sleep-server.ts holds through consume_logos_usage
-- (supabase/freemium.sql) instead — as strict, but coarser (docs/SLEEP-MODE.md).

create or replace function reserve_logos_tokens(
  p_user text, p_week text, p_hold text, p_want integer, p_min integer, p_limit integer, p_ttl bigint, p_at bigint
) returns jsonb
language plpgsql
as $$
declare
  cur integer;
  held integer;
  free integer;
  take integer;
  want integer := greatest(coalesce(p_want, 1), 1);
  least_free integer := greatest(coalesce(p_min, 1), 1);
begin
  insert into logos_usage (user_id, scope, counter, n, updated_at)
  values (p_user, p_week, 'tokens', 0, p_at)
  on conflict (user_id, scope, counter) do nothing;
  -- the lock every hold and settle for this person's week takes first
  select n into cur from logos_usage
   where user_id = p_user and scope = p_week and counter = 'tokens'
   for update;
  -- holds whose call never came back stop counting
  delete from logos_usage
   where user_id = p_user and counter = 'tokens' and scope like 'tokhold:%'
     and updated_at < p_at - coalesce(p_ttl, 600000);
  select coalesce(sum(n), 0)::integer into held from logos_usage
   where user_id = p_user and counter = 'tokens' and scope like 'tokhold:' || p_week || ':%';
  if p_limit is null then
    take := want;
  else
    free := p_limit - cur - held;
    if free < least_free then
      return jsonb_build_object('granted', 0, 'used', cur, 'held', held);
    end if;
    take := least(want, free);
  end if;
  insert into logos_usage (user_id, scope, counter, n, updated_at)
  values (p_user, 'tokhold:' || p_week || ':' || p_hold, 'tokens', take, p_at)
  on conflict (user_id, scope, counter) do update set n = excluded.n, updated_at = excluded.updated_at;
  return jsonb_build_object('granted', take, 'used', cur, 'held', held + take);
end;
$$;

create or replace function settle_logos_tokens(
  p_user text, p_week text, p_hold text, p_tokens integer, p_at bigint
) returns integer
language plpgsql
as $$
declare
  out_n integer;
begin
  insert into logos_usage (user_id, scope, counter, n, updated_at)
  values (p_user, p_week, 'tokens', 0, p_at)
  on conflict (user_id, scope, counter) do nothing;
  -- the same lock, in the same order, as a hold
  select n into out_n from logos_usage
   where user_id = p_user and scope = p_week and counter = 'tokens'
   for update;
  delete from logos_usage
   where user_id = p_user and scope = 'tokhold:' || p_week || ':' || p_hold and counter = 'tokens';
  if not found then
    -- settled already (a retry), or expired: nothing is added twice
    return out_n;
  end if;
  update logos_usage
     set n = n + greatest(coalesce(p_tokens, 0), 0), updated_at = p_at
   where user_id = p_user and scope = p_week and counter = 'tokens'
  returning n into out_n;
  return out_n;
end;
$$;
