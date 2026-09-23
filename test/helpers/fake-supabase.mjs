// An in-memory stand-in for the Supabase client, for end-to-end route tests.
//
// It implements the slice of PostgREST the app actually uses — select with a
// column list or *, eq / in / lt / not-is-null filters, order, limit, maybeSingle,
// head counts, insert / upsert / update / delete with exact counts — and it
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
};

export const db = {
  tables: {},
  /** table -> Set of columns the table DOES NOT have, to simulate an old schema */
  missing: {},
  /** every write, in order, for tests that care about sequencing */
  log: [],
  reset() { this.tables = {}; this.missing = {}; this.log = []; },
  rows(t) { return (this.tables[t] ??= []); },
};

const keyOf = (t, r) => (PK[t] ?? ['id']).map((k) => String(r[k])).join('|');

function colErr(table, col, write) {
  return write
    ? { code: 'PGRST204', message: `Could not find the '${col}' column of '${table}' in the schema cache` }
    : { code: '42703', message: `column ${table}.${col} does not exist` };
}

function checkCols(table, cols, write) {
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
    this._order = null;
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
  not(c, op, v) {
    if (op === 'is' && v === null) this.filters.push((r) => r[c] !== null && r[c] !== undefined);
    this._cols = [...(this._cols ?? []), c];
    return this;
  }
  order(c, { ascending = true } = {}) { this._order = { c, ascending }; return this; }
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
      if (this._order) {
        const { c, ascending } = this._order;
        out = [...out].sort((a, b) => (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * (ascending ? 1 : -1));
      }
      if (this._limit != null) out = out.slice(0, this._limit);
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
          all[i] = { ...all[i], ...row };
        } else {
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
  rpc: async () => ({ data: null, error: null }),
};

export function supabaseAdmin() {
  return client;
}
