// An in-memory stand-in for the Supabase client, for end-to-end route tests.
//
// It implements the slice of PostgREST the app actually uses — select with a
// column list or *, eq / in / lt / gte / not-is-null filters, order, limit, range, maybeSingle,
// head counts, insert / upsert / update / delete with exact counts (and gt /
// lte, for the email ledger's paging) — and it
// enforces the constraints that matter to the code under test: primary keys,
// the unique Project name per person, and (when a test asks for it) a table
// that is MISSING a column, answered with the same error codes Postgres and
// PostgREST send. A fake that accepted anything would let the routes pass by
// doing things the real database refuses.

const PK = {
  conversations: ['id'],
  mind_nodes: ['user_id', 'id'],
  mind_edges: ['user_id', 'id'],
  mind_tombstones: ['user_id', 'fingerprint'],
  mind_pending: ['user_id', 'fingerprint'],
  mind_sources: ['user_id', 'id'],
  mind_projects: ['user_id', 'id'],
  core4_state: ['user_id', 'conversation_id'],
  reasoning_entries: ['user_id', 'id'],
  reasoning_links: ['user_id', 'id'],
  core4_turns: ['user_id', 'conversation_id', 'turn'],
  capability_evidence: ['user_id', 'id'],
  share_presence: ['resource_type', 'resource_id', 'user_id'],
  lifecycle_emails: ['user_id', 'kind'],
  event_sheet_sync: ['event_id'],
  captures: ['id'],
};

// Unique indexes beyond the primary key (supabase/schema.sql), as Postgres
// applies them: a NULL never collides with anything.
const UNIQUE = {
  event_registrations: [['event_id', 'email_norm'], ['event_id', 'code'], ['token_hash']],
};
const collides = (t, row, all) =>
  (UNIQUE[t] ?? []).some((cols) => cols.every((c) => row[c] !== null && row[c] !== undefined) && all.some((r) => cols.every((c) => r[c] === row[c])));

export const db = {
  tables: {},
  /** table -> Set of columns the table DOES NOT have, to simulate an old schema */
  missing: {},
  /**
   * Tables that are NOT IN THE DATABASE AT ALL — a schema that was never
   * applied, which is a different fault from a schema that is out of date and
   * has different consequences: every read and write on the table fails, on
   * every turn, forever, instead of one column going quiet.
   */
  absent: new Set(),
  /** every write, in order, for tests that care about sequencing */
  log: [],
  /**
   * Database functions a test supplies (`db.rpcs.bump_logos_usage = …`). A
   * suite that supplies none sees what every suite always saw — an rpc that
   * answers nothing — so counting is opt-in and no older suite starts meeting
   * a limit it never asked about.
   */
  rpcs: {},
  reset() { this.tables = {}; this.missing = {}; this.absent = new Set(); this.log = []; this.rpcs = {}; },
  rows(t) { return (this.tables[t] ??= []); },
};

const keyOf = (t, r) => (PK[t] ?? ['id']).map((k) => String(r[k])).join('|');

function colErr(table, col, write) {
  return write
    ? { code: 'PGRST204', message: `Could not find the '${col}' column of '${table}' in the schema cache` }
    : { code: '42703', message: `column ${table}.${col} does not exist` };
}

/** What PostgREST says about a relation that is not there. */
function tableErr(table) {
  return { code: '42P01', message: `relation "public.${table}" does not exist` };
}

function checkCols(table, cols, write) {
  if (db.absent.has(table)) return tableErr(table);
  const gone = db.missing[table];
  if (!gone) return null;
  for (const c of cols) if (gone.has(c)) return colErr(table, c, write);
  return null;
}

class Query {
  constructor(table) {
    this.table = table;
    this.filters = [];
    this.op = 'select';
    this.cols = '*';
    this.opts = {};
    this._orders = [];
    this._limit = null;
    this._single = false;
  }
  select(cols = '*', opts = {}) { if (this.op === 'select') { this.cols = cols; this.opts = opts; } return this; }
  insert(rows) { this.op = 'insert'; this.payload = Array.isArray(rows) ? rows : [rows]; return this; }
  upsert(rows, opts = {}) { this.op = 'upsert'; this.payload = Array.isArray(rows) ? rows : [rows]; this.upsertOpts = opts; return this; }
  update(patch, opts = {}) { this.op = 'update'; this.payload = patch; this.opts = opts; return this; }
  delete(opts = {}) { this.op = 'delete'; this.opts = opts; return this; }
  eq(c, v) { this.filters.push((r) => r[c] === v); this._cols = [...(this._cols ?? []), c]; return this; }
  in(c, vs) { this.filters.push((r) => vs.includes(r[c])); this._cols = [...(this._cols ?? []), c]; return this; }
  lt(c, v) { this.filters.push((r) => r[c] < v); this._cols = [...(this._cols ?? []), c]; return this; }
  gt(c, v) { this.filters.push((r) => r[c] > v); this._cols = [...(this._cols ?? []), c]; return this; }
  lte(c, v) { this.filters.push((r) => r[c] <= v); this._cols = [...(this._cols ?? []), c]; return this; }
  gte(c, v) { this.filters.push((r) => r[c] >= v); this._cols = [...(this._cols ?? []), c]; return this; }
  // PostgREST paging: rows from..to inclusive, after ordering (the dashboard reads every table a page at a time).
  range(from, to) { this._range = [from, to]; return this; }
  is(c, v) { this.filters.push((r) => (v === null ? r[c] === null || r[c] === undefined : r[c] === v)); this._cols = [...(this._cols ?? []), c]; return this; }
  not(c, op, v) {
    if (op === 'is' && v === null) this.filters.push((r) => r[c] !== null && r[c] !== undefined);
    this._cols = [...(this._cols ?? []), c];
    return this;
  }
  // Each call adds a key, as PostgREST's does: .order('a').order('b') sorts by a, then b.
  order(c, { ascending = true } = {}) { this._orders.push({ c, ascending }); return this; }
  limit(n) { this._limit = n; return this; }
  maybeSingle() { this._single = true; return this; }
  single() { this._single = true; return this; }
  then(res, rej) { return Promise.resolve().then(() => this.run()).then(res, rej); }

  run() {
    const t = this.table;
    const all = db.rows(t);
    const match = (r) => this.filters.every((f) => f(r));
    const filterErr = checkCols(t, this._cols ?? [], false);

    if (this.op === 'select') {
      const cols = this.cols === '*' ? [] : this.cols.split(',').map((s) => s.trim()).filter(Boolean);
      const err = filterErr ?? checkCols(t, cols, false);
      if (err) return { data: null, error: err, count: null };
      let out = all.filter(match);
      if (this._orders.length) {
        const by = (a, b) => {
          for (const { c, ascending } of this._orders) {
            const d = a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0;
            if (d) return ascending ? d : -d;
          }
          return 0;
        };
        out = [...out].sort(by);
      }
      if (this._limit != null) out = out.slice(0, this._limit);
      if (this._range) out = out.slice(this._range[0], this._range[1] + 1);
      const project = (r) => {
        if (!cols.length) return { ...r };
        const o = {};
        for (const c of cols) o[c] = r[c] ?? null;
        return o;
      };
      const count = out.length;
      if (this.opts.head) return { data: null, error: null, count };
      const data = out.map(project);
      if (this._single) return { data: data[0] ?? null, error: null, count };
      return { data, error: null, count };
    }

    if (this.op === 'insert' || this.op === 'upsert') {
      for (const row of this.payload) {
        const err = checkCols(t, Object.keys(row), true);
        if (err) return { data: null, error: err, count: null };
      }
      for (const row of this.payload) {
        const k = keyOf(t, row);
        const i = all.findIndex((r) => keyOf(t, r) === k);
        if (i >= 0) {
          if (this.op === 'insert') {
            return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' }, count: null };
          }
          // ON CONFLICT DO NOTHING
          if (this.upsertOpts?.ignoreDuplicates) continue;
          all[i] = { ...all[i], ...row };
        } else {
          if (collides(t, row, all)) return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' }, count: null };
          if (t === 'mind_projects' && all.some((r) => r.user_id === row.user_id && String(r.name).toLowerCase() === String(row.name).toLowerCase())) {
            return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "mind_projects_user_name_idx"' }, count: null };
          }
          all.push({ ...row });
        }
        db.log.push([this.op, t, k]);
      }
      return { data: null, error: null, count: this.payload.length };
    }

    if (this.op === 'update') {
      const err = filterErr ?? checkCols(t, Object.keys(this.payload), true);
      if (err) return { data: null, error: err, count: null };
      let n = 0;
      for (let i = 0; i < all.length; i++) {
        if (!match(all[i])) continue;
        all[i] = { ...all[i], ...this.payload };
        n++;
      }
      db.log.push(['update', t, n]);
      return { data: null, error: null, count: n };
    }

    if (this.op === 'delete') {
      if (filterErr) return { data: null, error: filterErr, count: null };
      const keep = all.filter((r) => !match(r));
      const n = all.length - keep.length;
      db.tables[t] = keep;
      db.log.push(['delete', t, n]);
      return { data: null, error: null, count: n };
    }
    return { data: null, error: { message: 'unsupported' }, count: null };
  }
}

const client = {
  from: (t) => new Query(t),
  rpc: async (name, args) => (typeof db.rpcs?.[name] === 'function' ? db.rpcs[name](args ?? {}) : { data: null, error: null }),
};

export function supabaseAdmin() {
  return client;
}
