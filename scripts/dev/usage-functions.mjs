// scripts/dev/usage-functions.mjs — the free plan's usage functions
// (supabase/schema.sql: bump_logos_usage, consume_logos_usage,
// refund_logos_usage, claim_logos_unit, release_logos_unit, and the week of
// tokens' reserve_logos_tokens and settle_logos_tokens from
// supabase/weekly-tokens.sql), in memory, over rows shaped like the
// logos_usage table. One copy, shared by the local fake PostgREST
// (scripts/dev/fake-postgrest.mjs) and the suites (test/helpers/fake-supabase.mjs
// users supply it as db.rpcs), so a limit behaves the same in a browser run, in
// a route test and in Postgres.
//
// ATOMIC AS THE DATABASE IS. Each function runs to its end without yielding —
// Node runs one at a time — which is what the week's row lock gives the
// Postgres functions: two requests at once are held one after the other, so
// they can never both be given the same last tokens.
//
// usageFunctions(rows) → { name: (args) => value }   (rows is mutated)

export function usageFunctions(rows) {
  const find = (u, scope, counter) => rows.find((x) => x.user_id === u && x.scope === scope && x.counter === counter);
  const ensure = (u, scope, counter, at) => {
    let r = find(u, scope, counter);
    if (!r) rows.push((r = { id: `${u}|${scope}|${counter}`, user_id: u, scope, counter, n: 0, updated_at: at ?? Date.now() }));
    return r;
  };
  return {
    bump_logos_usage: ({ p_user, p_scope, p_counter, p_by, p_at }) => {
      const r = ensure(p_user, p_scope, p_counter, p_at);
      r.n += p_by;
      return r.n;
    },
    consume_logos_usage: ({ p_user, p_scope, p_counter, p_by, p_limit, p_at }) => {
      if (!p_by || p_by < 1) return -1;
      const r = ensure(p_user, p_scope, p_counter, p_at);
      if (p_limit !== null && p_limit !== undefined && r.n + p_by > p_limit) return -1;
      r.n += p_by;
      return r.n;
    },
    refund_logos_usage: ({ p_user, p_scope, p_counter, p_by }) => {
      const r = find(p_user, p_scope, p_counter);
      if (!r) return 0;
      r.n = Math.max(0, r.n - Math.max(p_by ?? 0, 0));
      return r.n;
    },
    claim_logos_unit: ({ p_user, p_mark, p_scope, p_counter, p_limit, p_at }) => {
      const r = ensure(p_user, p_scope, p_counter, p_at);
      const mark = find(p_user, p_mark, p_counter);
      if (mark && mark.n > 0) return 'already';
      if (p_limit !== null && p_limit !== undefined && r.n >= p_limit) return 'refused';
      r.n += 1;
      ensure(p_user, p_mark, p_counter, p_at).n = 1;
      return 'claimed';
    },
    release_logos_unit: ({ p_user, p_mark, p_scope, p_counter }) => {
      const at = rows.findIndex((x) => x.user_id === p_user && x.scope === p_mark && x.counter === p_counter && x.n > 0);
      if (at < 0) return false;
      rows.splice(at, 1);
      const r = find(p_user, p_scope, p_counter);
      if (r) r.n = Math.max(0, r.n - 1);
      return true;
    },
    // a call's hold on the week: up to p_want, never past p_limit with what is settled and still held
    reserve_logos_tokens: ({ p_user, p_week, p_hold, p_want, p_min, p_limit, p_ttl, p_at }) => {
      const at = p_at ?? Date.now();
      const week = ensure(p_user, p_week, 'tokens', at);
      // holds whose call never came back stop counting
      const ttl = p_ttl ?? 600_000;
      for (let i = rows.length - 1; i >= 0; i--) {
        const x = rows[i];
        if (x.user_id === p_user && x.counter === 'tokens' && x.scope.startsWith('tokhold:') && x.updated_at < at - ttl) rows.splice(i, 1);
      }
      const prefix = `tokhold:${p_week}:`;
      const held = rows.filter((x) => x.user_id === p_user && x.counter === 'tokens' && x.scope.startsWith(prefix)).reduce((s, x) => s + x.n, 0);
      const want = Math.max(1, p_want ?? 1);
      let take = want;
      if (p_limit !== null && p_limit !== undefined) {
        const free = p_limit - week.n - held;
        if (free < Math.max(1, p_min ?? 1)) return { granted: 0, used: week.n, held };
        take = Math.min(want, free);
      }
      const hold = ensure(p_user, prefix + p_hold, 'tokens', at);
      hold.n = take;
      hold.updated_at = at;
      return { granted: take, used: week.n, held: held + take };
    },
    // the hold released, and what the call really cost added — once: a second settle adds nothing
    settle_logos_tokens: ({ p_user, p_week, p_hold, p_tokens, p_at }) => {
      const week = ensure(p_user, p_week, 'tokens', p_at);
      const i = rows.findIndex((x) => x.user_id === p_user && x.scope === `tokhold:${p_week}:${p_hold}` && x.counter === 'tokens');
      if (i < 0) return week.n;
      rows.splice(i, 1);
      week.n += Math.max(0, p_tokens ?? 0);
      week.updated_at = p_at ?? Date.now();
      return week.n;
    },
  };
}
