// Every API route, called by nobody.
//
// The database is reached with the service-role key, so row-level security
// protects nothing: each route's own check is the only thing between the
// internet and a person's thinking. This suite finds every route under
// app/api — a new one is in it the day it is added — bundles them all against
// the in-memory database, a Clerk with nobody signed in, a scripted model and
// a Stripe stand-in, and calls every method with no identity: no session, no
// access cookie, no cron secret, no signature. Two people's data is in the
// database while it does.
//
// What each call must do, unless the route is listed in PUBLIC below with the
// reason it may answer a stranger:
//
//   - refuse (a 4xx; never a 2xx, a redirect or a crash),
//   - write nothing,
//   - ask the model nothing (a model call is money), and
//   - say nothing of what is stored — neither person's words appear in it.
//
// A PUBLIC route is still held to the last three. The list is checked against
// the routes that exist, so an entry cannot outlive its route.

import { build } from 'esbuild';
import { mkdirSync, rmSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve as res } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const API = join(root, 'app', 'api');
const OUT = join(here, '.tmp', 'e2e-boundary');
const H = (f) => join(here, 'helpers', f);

const walk = (d) => readdirSync(d).flatMap((f) => {
  const p = join(d, f);
  return statSync(p).isDirectory() ? walk(p) : f === 'route.ts' ? [p] : [];
});
const files = walk(API).sort();
const nameOf = (file) => relative(API, file).replace(/\/?route\.ts$/, '');
const keyOf = (name) => name.replace(/[[\]]/g, '_').replace(/\//g, '__') || 'root';

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const swap = {
  name: 'swap',
  setup(b) {
    b.onResolve({ filter: /(^|\/)supabase$/ }, (a) => {
      const p = a.path.startsWith('@/') ? join(root, a.path.slice(2)) : res(a.resolveDir, a.path);
      if (p === join(root, 'lib', 'supabase')) return { path: pathToFileURL(H('fake-supabase.mjs')).href, external: true };
      return undefined;
    });
    b.onResolve({ filter: /^@clerk\/nextjs\/server$/ }, () => ({ path: pathToFileURL(H('fake-clerk.mjs')).href, external: true }));
    b.onResolve({ filter: /^openai$/ }, () => ({ path: pathToFileURL(H('fake-openai.mjs')).href, external: true }));
    b.onResolve({ filter: /^stripe$/ }, () => ({ path: pathToFileURL(H('fake-stripe.mjs')).href, external: true }));
    b.onResolve({ filter: /^server-only$/ }, () => ({ path: H('server-only-shim.mjs') }));
    b.onResolve({ filter: /^next\/headers$/ }, () => ({ path: pathToFileURL(H('next-headers-shim.mjs')).href, external: true }));
    b.onResolve({ filter: /^next\/server$/ }, (a) => ({ path: `${a.path}.js`, external: true }));
  },
};
await build({
  entryPoints: Object.fromEntries(files.map((f) => [keyOf(nameOf(f)), f])),
  bundle: true,
  splitting: true,
  format: 'esm',
  platform: 'node',
  outdir: OUT,
  tsconfig: join(root, 'tsconfig.json'),
  plugins: [swap],
  packages: 'external',
  logLevel: 'error',
});

const EXPLORE = process.argv.includes('--explore');
const silence = (orig) => (...a) => (EXPLORE ? orig(...a) : undefined);
console.error = silence(console.error.bind(console));
console.warn = silence(console.warn.bind(console));
const say = console.log.bind(console);
console.log = silence(console.log);

process.env.NODE_ENV = 'production';
process.env.OPENAI_API_KEY = 'test';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
process.env.STRIPE_PRICE_SOCRIA_ONE = 'price_one';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
process.env.CRON_SECRET = 'cron-test-secret';
process.env.SHARE_SECRET = 'test-share-secret';
process.env.RATE_LIMIT_DISABLED = '1';
// What signs a guest's pass in production; without it the guest route is closed and proves nothing.
process.env.CLERK_SECRET_KEY = 'sk_test_clerk';

const { db } = await import(pathToFileURL(H('fake-supabase.mjs')).href);
const { NextRequest } = await import('next/server.js');

// Nothing leaves the machine: a route that reaches for the network is recorded and refused.
const fetches = [];
globalThis.fetch = async (url) => {
  fetches.push(String(url?.url ?? url));
  throw new TypeError('fetch failed');
};

const SECRET_A = 'ANN-PRIVATE-7f3a';
const SECRET_B = 'BEN-PRIVATE-91cd';
const CAP = { ann: 'cp_annCapture01', ben: 'cp_benCapture01' };
const seed = () => {
  db.reset();
  const now = Date.now();
  for (const [uid, s] of [['ann', SECRET_A], ['ben', SECRET_B]]) {
    db.rows('conversations').push({
      id: `c_${uid}`, user_id: uid, title: `${s} title`, kind: 'logos', model: 'logos-5',
      messages: [{ role: 'user', content: `${s} words` }, { role: 'assistant', content: `${s} reply` }],
      memory: {}, map: { nodes: [], edges: [] }, created_at: new Date(now).toISOString(), updated_at: now,
    });
    db.rows('user_profiles').push({ user_id: uid, profile: { about: `${s} profile` }, understanding: { summary: `${s} understanding` }, updated_at: now });
    db.rows('mind_nodes').push({ user_id: uid, id: `n_${uid}`, label: `${s} node`, type: 'idea', content: `${s} content`, status: 'active', created_at: now, updated_at: now });
    db.rows('mind_projects').push({ user_id: uid, id: `p_${uid}`, name: `${s} project`, created_at: now, updated_at: now });
    db.rows('captures').push({ id: CAP[uid], user_id: uid, text: `${s} capture`, created_at: now, updated_at: now });
    db.rows('socria_subscriptions').push({ user_id: uid, stripe_customer_id: `cus_${uid}`, stripe_subscription_id: `sub_${uid}`, status: 'active', current_period_end: Math.floor(now / 1000) + 86400 });
  }
  db.log.length = 0;
};
/** Everything of Ben's, as it is stored — compared byte for byte after a call made by somebody else. */
const bens = () =>
  JSON.stringify(
    Object.keys(db.tables)
      .sort()
      .map((t) => [t, db.tables[t].filter((r) => r.user_id === 'ben' || String(r.id ?? '').includes('ben')).map((r) => JSON.stringify(r)).sort()])
      .filter(([, rows]) => rows.length)
  );

globalThis.__users = { ann: { firstName: 'Ann', emails: ['ann@example.com'] }, ben: { firstName: 'Ben', emails: ['ben@example.com'] } };
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const QUERY = '?id=c_ben&conversationId=c_ben&projectId=p_ben&nodeId=n_ben&token=x&code=x&u=ben&email=ben%40example.com';
const paramsFor = (name) => ({ id: name.startsWith('projects/') ? 'p_ben' : 'c_ben', provider: 'google' });

// Where a route checks what it was sent before who sent it, the body it
// would accept, so the refusal seen is the one about identity.
const SHAPED = {
  'POST chat': { messages: [{ role: 'user', content: 'hello' }], model: 'logos-5' },
  'POST logos/chat': { messages: [{ role: 'user', content: 'hello' }] },
};

// Ann, signed in, aimed at Ben's things: every field a route might take an id from names one of his.
const ANN = 'ann was here';
const AIMED = {
  id: 'c_ben', conversationId: 'c_ben', projectId: 'p_ben', nodeId: 'n_ben', title: ANN, label: ANN, text: ANN, name: ANN,
  messages: [{ role: 'user', content: ANN }], append: [{ role: 'user', content: ANN }],
  conversation: { id: 'c_ben', title: ANN, messages: [{ role: 'user', content: ANN }] },
  conversations: [{ id: 'c_ben', title: ANN, messages: [{ role: 'user', content: ANN }] }],
};
const AIMED_AT = {
  'PATCH conversations': [{ id: 'c_ben', title: ANN }, { id: 'c_ben', projectId: 'p_ann' }, { id: 'c_ben', firstMap: { nodes: [], edges: [] } }, { id: 'c_ben', kind: 'chat' }],
  'PATCH mind/node': [{ id: 'n_ben', label: ANN }, { id: 'n_ben', confirm: true }, { id: 'n_ben', challenge: ANN }],
  'DELETE mind/node': [{ id: 'n_ben' }, { id: 'n_ben', kind: 'node' }],
  'PATCH captures': [{ id: CAP.ben, text: ANN }],
  'DELETE captures': [{ id: CAP.ben }],
  'PATCH projects/[id]': [{ name: ANN, archived: true }],
  'DELETE projects/[id]': [{ files: 'delete' }],
};

// Routes that may answer a stranger, and why. Each is still held to: no
// writes, no model call, nothing fetched, nothing of anyone's said.
const PUBLIC = {
  'POST access/enter': 'the campaign code is typed by people without an account (checked on the server, rate limited)',
  'DELETE access/enter': 'leaving the campaign clears the caller’s own cookie',
  'POST access/unlock': 'an access code is typed by people without an account (checked on the server, rate limited)',
  'DELETE access/unlock': 'locking again clears the caller’s own cookie',
  'POST dev/dashboard-code': 'the dashboard’s two-step code; issues a cookie, never data (rate limited)',
  'POST logos-5-internal': 'the internal preview’s code; issues a cookie, never data (rate limited)',
  'POST logos/redeem': 'a code can be checked before signing up; it grants an account only when signed in',
  'POST logos/guest': 'a visitor’s one guest line of thinking begins here: a signed cookie, no account',
  'GET email/unsubscribe': 'one-click unsubscribe works signed out, with the email’s signed token',
  'POST email/unsubscribe': 'one-click unsubscribe works signed out, with the email’s signed token',
  'POST events': 'product beacons are counted for visitors too: aggregate counters, rate limited',
  'GET events/[id]/ics': 'a public event’s calendar file',
  'POST events/rsvp': 'signing up for an event needs no account',
  'POST events/checkin': 'checking in at the door needs no account',
  'POST events/ticket': 'a ticket is opened with its own secret token',
  'DELETE events/ticket': 'a ticket is cancelled with its own secret token',
  'GET first-touch': 'attribution for a first visit, before any account exists',
  'GET logos/plan': 'a stranger is on the free plan, and may read what it is',
  'GET logos/usage': 'a stranger’s allowance is the free plan’s, used by nobody',
  'GET logos/one-prompt': 'the Socria One prompt’s defaults; nothing is kept without an account',
  'POST logos/one-prompt': 'the Socria One prompt’s defaults; nothing is kept without an account',
  'GET transcribe': 'whether voice-to-text is available on this deployment',
  'POST rewards/invite': 'remembers, in a cookie, who invited a visitor before they sign up',
  'POST waitlist': 'joining the waitlist needs no account',
  'GET logos/connect/[provider]': 'a stranger is sent back to /logos to sign in, never to a consent screen',
  'GET logos/connect/[provider]/callback': 'a stranger is sent back to /logos to sign in; nothing is stored',
};

const call = async (mod, method, name, { uid = null, cookie = '', auth = '', sig = '', body } = {}) => {
  globalThis.__uid = uid;
  globalThis.__calls = [];
  fetches.length = 0;
  const headers = { 'content-type': 'application/json' };
  if (cookie) headers.cookie = cookie;
  if (auth) headers.authorization = auth;
  if (sig) headers['stripe-signature'] = sig;
  const send = body ?? (method === 'GET' ? undefined : SHAPED[`${method} ${name}`] ?? {});
  const req = new NextRequest(`http://localhost/api/${name}${QUERY}`, { method, headers, ...(send !== undefined && method !== 'GET' ? { body: JSON.stringify(send) } : {}) });
  globalThis.__req = req;
  let status = 0, text = '', threw = '', location = '';
  try {
    const r = await mod[method](req, { params: paramsFor(name) });
    status = r?.status ?? 0;
    location = r?.headers?.get?.('location') ?? '';
    text = r ? await r.text().catch(() => '') : '';
  } catch (e) {
    threw = e instanceof Error ? e.message : String(e);
  }
  return { status, threw, location, text, writes: db.log.length, model: (globalThis.__calls ?? []).length, fetched: fetches.length };
};

const mods = [];
for (const file of files) {
  const name = nameOf(file);
  const mod = await import(pathToFileURL(join(OUT, `${keyOf(name)}.js`)).href);
  for (const method of METHODS) if (typeof mod[method] === 'function') mods.push({ name, method, mod, key: `${method} ${name}` });
}

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, EXPLORE && say('  ok   ' + n)) : (fail++, say('  FAIL ' + n + (x ? '  ' + x : ''))));
const leaks = (r) => r.text.includes(SECRET_A) || r.text.includes(SECRET_B);
const refused = (r) => r.status >= 400 && r.status < 500;
const sentBack = (r) => (r.status === 307 || r.status === 302) && /^http:\/\/localhost\/logos\?connect=(signin|error)/.test(r.location);
const shown = (r) =>
  `${r.status}${r.threw ? ` threw "${r.threw}"` : ''} writes=${r.writes} model=${r.model} fetched=${r.fetched}${r.text.includes(SECRET_A) ? ' showed-Ann' : ''}${r.text.includes(SECRET_B) ? ' showed-Ben' : ''}`;

const FORGED = [
  'socria_access=v1.forged.forged',
  'socria_guest=v1.forged.forged',
  'socria_l5i_pass=v1.forged.forged',
  'socria_dash_pass=v1.forged.forged',
  'socria_dash_half=v1.forged.forged',
  'socria_entry=v1.forged.forged',
].join('; ');

for (const [label, opts] of [
  ['nobody', {}],
  ['forged credentials', { cookie: FORGED, auth: 'Bearer not-the-cron-secret', sig: 'sig:not-ours' }],
]) {
  say(`\n${mods.length} route methods, called by ${label}`);
  let seen = 0;
  for (const m of mods) {
    seed();
    const r = await call(m.mod, m.method, m.name, opts);
    const pub = PUBLIC[m.key];
    const answer = pub ? r.status > 0 && r.status < 500 && !r.threw : refused(r) || (m.name.startsWith('logos/connect/') && sentBack(r));
    const clean = r.writes === 0 && r.model === 0 && r.fetched === 0 && !leaks(r);
    if (!answer || !clean) ok(`${m.key} — ${pub ? 'public, and quiet' : 'refused, and quiet'}`, false, shown(r));
    else (pass++, seen++);
    if (m.name.startsWith('logos/connect/') && !sentBack(r) && !refused(r)) ok(`${m.key} sends a stranger back to sign in`, false, `${r.status} ${r.location}`);
  }
  say(`  ${seen} of ${mods.length} held`);
}

say('\nevery PUBLIC entry is a route that exists');
for (const k of Object.keys(PUBLIC)) ok(`PUBLIC "${k}" exists`, mods.some((m) => m.key === k));
say(`  ${Object.keys(PUBLIC).length} entries checked`);

say('\nthe probe can see: a signed-in read returns that person’s words, and only theirs');
{
  const conv = mods.find((m) => m.key === 'GET conversations');
  seed();
  const a = await call(conv.mod, 'GET', 'conversations', { uid: 'ann' });
  ok('Ann reads her own conversation', a.status === 200 && a.text.includes(SECRET_A), shown(a));
  ok('  and not Ben’s', !a.text.includes(SECRET_B));
  const b = await call(conv.mod, 'GET', 'conversations', { uid: 'ben' });
  ok('Ben reads his', b.status === 200 && b.text.includes(SECRET_B) && !b.text.includes(SECRET_A), shown(b));
}

say(`\n${mods.length} route methods, called by Ann with Ben’s ids`);
{
  let held = 0, calls = 0;
  for (const m of mods) {
    if (PUBLIC[m.key] || m.name.startsWith('cron/') || m.name.startsWith('stripe/webhook')) continue;
    const bodies = m.method === 'GET' ? [undefined] : AIMED_AT[m.key] ?? [SHAPED[m.key] ? { ...AIMED, ...SHAPED[m.key] } : AIMED];
    for (const body of bodies) {
      seed();
      const before = bens();
      const r = await call(m.mod, m.method, m.name, { uid: 'ann', body });
      calls++;
      const untouched = bens() === before;
      const quiet = !r.text.includes(SECRET_B);
      if (!untouched || !quiet) ok(`${m.key} ${body ? JSON.stringify(body).slice(0, 60) : ''} leaves Ben’s things alone`, false, `${shown(r)}${untouched ? '' : ' BEN CHANGED'}`);
      else (pass++, held++);
    }
  }
  say(`  ${held} of ${calls} calls held`);
}

say('\na cron route with no secret configured refuses, rather than running for anyone');
{
  const secret = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;
  for (const m of mods.filter((x) => x.name.startsWith('cron/') || x.key === 'POST email/newsletter')) {
    seed();
    const r = await call(m.mod, m.method, m.name, { auth: 'Bearer ' });
    ok(`${m.key} with CRON_SECRET unset`, (r.status === 503 || r.status === 401) && r.writes === 0, shown(r));
  }
  process.env.CRON_SECRET = secret;
}

say(`\nroute-boundary: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
