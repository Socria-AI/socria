// scripts/dev/usage-functions.mjs — the free plan's usage functions
// (supabase/schema.sql: bump_logos_usage, consume_logos_usage,
// refund_logos_usage, claim_logos_unit, release_logos_unit), in memory, over
// rows shaped like the logos_usage table. One copy, shared by the local fake
// PostgREST (scripts/dev/fake-postgrest.mjs) and the suites
// (test/helpers/fake-supabase.mjs users supply it as db.rpcs), so a limit
// behaves the same in a browser run, in a route test and in Postgres.
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
  };
}
