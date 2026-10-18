// scripts/dev/fake-postgrest.mjs — a local, in-memory stand-in for Supabase's
// REST API, for driving the real app in a browser without a database.
//
// DEVELOPMENT ONLY. Never deployed, never pointed at by a real environment.
// It implements the slice of PostgREST that the events routes use: select
// with eq / in / lt / gt / is filters, order, offset/limit and Range paging,
// exact counts, insert (with the events unique indexes), upsert
// (on_conflict, ignore/merge duplicates), update, delete, and the
// bump_product_event function. It starts with the one event schema.sql seeds.
//
//   node scripts/dev/fake-postgrest.mjs            # :54321
//   SUPABASE_URL=http://localhost:54321 SUPABASE_SERVICE_ROLE_KEY=dev next dev

import http from 'node:http';

const PORT = Number(process.env.PORT || 54321);
const now = Date.now();
const tables = {
  events: [
    {
      id: 'in-public-002',
      title: 'Socria: In Public 002',
      summary: 'An interactive event about building Socria in public — entrepreneurship, business, AI, product development and community.',
      description:
        'Socria is a Human-First AI company being built in the open at UT Arlington. In Public is where we show the work as it is: what we are building, what is working, what is not, and the decisions behind it.\n\nCome with questions. This is a conversation, not a lecture — about starting something, building a product people use, working with AI without handing it your thinking, and finding the people to do it with.',
      location: 'Maverick Hall, Room 1309, University of Texas at Arlington',
      starts_at: null,
      ends_at: null,
      timezone: 'America/Chicago',
      date_confirmed: false,
      tentative_note: 'Target: Wednesday, November 4, 2026 (tentative). Start time not set.',
      status: 'open',
      self_checkin: false,
      capacity: null,
      expectations: [
        'A candid look at how Socria is being built, decisions and mistakes included',
        'Open conversation about entrepreneurship, business, AI and product development',
        'Your questions, answered by the people building it',
        'Time to meet other students who are building something, or want to',
      ],
      created_at: now,
      updated_at: now,
    },
  ],
  event_registrations: [],
  event_sheet_sync: [],
  product_events: [],
};
const PK = { event_sheet_sync: ['event_id'], product_events: ['env', 'day', 'event', 'kind'] };
const UNIQUE = { event_registrations: [['event_id', 'email_norm'], ['event_id', 'code'], ['token_hash']] };

const parseVal = (v) => (v === 'null' ? null : v === 'true' ? true : v === 'false' ? false : /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : decodeURIComponent(v));
function filtersOf(q) {
  const fs = [];
  for (const [k, raw] of q) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k)) continue;
    const m = /^(not\.)?(eq|neq|lt|lte|gt|gte|in|is)\.(.*)$/.exec(raw);
    if (!m) continue;
    const [, neg, op, val] = m;
    let f;
    if (op === 'in') {
      const list = val.replace(/^\(|\)$/g, '').split(',').map((x) => parseVal(x.replace(/^"|"$/g, '')));
      f = (r) => list.includes(r[k]);
    } else if (op === 'is') f = (r) => (val === 'null' ? r[k] === null || r[k] === undefined : r[k] === parseVal(val));
    else {
      const v = parseVal(val);
      f = { eq: (r) => r[k] === v, neq: (r) => r[k] !== v, lt: (r) => r[k] < v, lte: (r) => r[k] <= v, gt: (r) => r[k] > v, gte: (r) => r[k] >= v }[op];
    }
    fs.push(neg ? (r) => !f(r) : f);
  }
  return (r) => fs.every((f) => f(r));
}
const keyOf = (t, r) => (PK[t] ?? ['id']).map((k) => String(r[k])).join('|');
const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(body === undefined ? '' : JSON.stringify(body));
};

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    let body = '';
    for await (const c of req) body += c;
    const prefer = req.headers.prefer ?? '';
    const m = /^\/rest\/v1\/(rpc\/)?([a-z_]+)$/.exec(url.pathname);
    if (!m) return send(res, 404, { message: 'not found' });
    const [, rpc, name] = m;
    if (rpc) {
      if (name !== 'bump_product_event') return send(res, 404, { message: 'no such function' });
      const a = JSON.parse(body || '{}');
      const t = tables.product_events;
      let r = t.find((x) => x.env === a.p_env && x.day === a.p_day && x.event === a.p_event && x.kind === a.p_kind);
      if (!r) t.push((r = { env: a.p_env, day: a.p_day, event: a.p_event, kind: a.p_kind, n: 0 }));
      r.n += a.p_by;
      return send(res, 200, r.n);
    }
    const t = (tables[name] ??= []);
    const match = filtersOf(url.searchParams);
    const countExact = /count=exact/.test(prefer);
    const one = /vnd\.pgrst\.object/.test(req.headers.accept ?? '');

    if (req.method === 'GET' || req.method === 'HEAD') {
      let rows = t.filter(match);
      const order = url.searchParams.get('order');
      if (order) {
        const keys = order.split(',').map((o) => o.split('.'));
        rows = [...rows].sort((a, b) => {
          for (const [c, dir] of keys) {
            const d = a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0;
            if (d) return dir === 'desc' ? -d : d;
          }
          return 0;
        });
      }
      const total = rows.length;
      const range = /^(\d+)-(\d+)$/.exec(req.headers.range ?? '');
      const offset = Number(url.searchParams.get('offset') ?? (range ? range[1] : 0));
      const limit = url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : range ? Number(range[2]) - Number(range[1]) + 1 : Infinity;
      rows = rows.slice(offset, offset + limit);
      const sel = url.searchParams.get('select');
      const cols = sel && sel !== '*' ? sel.split(',').map((s) => s.trim()) : null;
      const out = rows.map((r) => (cols ? Object.fromEntries(cols.map((c) => [c, r[c] ?? null])) : r));
      const headers = { 'content-range': `${rows.length ? `${offset}-${offset + rows.length - 1}` : '*'}/${countExact ? total : '*'}` };
      if (req.method === 'HEAD') return send(res, 200, undefined, headers);
      if (one) return out.length === 1 ? send(res, 200, out[0], headers) : send(res, 406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' });
      return send(res, 200, out, headers);
    }

    if (req.method === 'POST') {
      const rows = [].concat(JSON.parse(body || '[]'));
      const upsert = /resolution=(merge|ignore)-duplicates/.exec(prefer);
      for (const row of rows) {
        const i = t.findIndex((r) => keyOf(name, r) === keyOf(name, row));
        if (i >= 0) {
          if (!upsert) return send(res, 409, { code: '23505', message: 'duplicate key value violates unique constraint' });
          if (upsert[1] === 'merge') t[i] = { ...t[i], ...row };
          continue;
        }
        const clash = (UNIQUE[name] ?? []).some((cs) => cs.every((c) => row[c] != null) && t.some((r) => cs.every((c) => r[c] === row[c])));
        if (clash) return send(res, 409, { code: '23505', message: 'duplicate key value violates unique constraint' });
        t.push({ ...row });
      }
      return send(res, 201, [], { 'content-range': `*/${rows.length}` });
    }

    if (req.method === 'PATCH') {
      const patch = JSON.parse(body || '{}');
      let n = 0;
      for (let i = 0; i < t.length; i++) if (match(t[i])) (t[i] = { ...t[i], ...patch }), n++;
      return send(res, 200, [], { 'content-range': `*/${n}` });
    }

    if (req.method === 'DELETE') {
      const keep = t.filter((r) => !match(r));
      const n = t.length - keep.length;
      tables[name] = keep;
      return send(res, 200, [], { 'content-range': `*/${n}` });
    }
    send(res, 405, { message: 'method' });
  })
  .listen(PORT, () => console.log(`fake PostgREST on :${PORT}`));
