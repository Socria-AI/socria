// The developer dashboard, end to end: the onboarding's beacon, the counter it
// becomes, and the page that shows it — through the real route and the real
// page.
//
// test/dashboard.test.mjs proves the rules one at a time: the gate, the
// vocabularies, the arithmetic. This proves the wiring. That a beacon from the
// onboarding screen becomes one integer in product_events through /api/events
// and nothing else; that /dev/dashboard turns away everyone it should with the
// same 404 as a page that does not exist, before reading a single row; and
// that for the person it should answer, what the route counted is what the
// page shows — with nobody's words, address or id anywhere on it.
//
// The route and the page are the real ones, bundled from app/. Two things are
// replaced: the database (an in-memory PostgREST, with bump_product_event
// written below as supabase/schema.sql defines it) and Clerk (fixed users).

import { build } from 'esbuild';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve as res } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { ROLES } from './.tmp/onboarding-roles.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, '.tmp', 'e2e-dashboard');
const FAKE_DB = join(here, 'helpers', 'fake-supabase.mjs');
const FAKE_CLERK = join(here, 'helpers', 'fake-clerk.mjs');
const SHIM = join(here, 'helpers', 'server-only-shim.mjs');

// ── build the real route and page against the fakes ─────────────────

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const swap = {
  name: 'swap',
  setup(b) {
    // EXTERNAL, by absolute URL, so the route, the page and this file share
    // one instance of each fake: what the route counts, the page reads.
    b.onResolve({ filter: /(^|\/)supabase$/ }, (a) => {
      const p = a.path.startsWith('@/') ? join(root, a.path.slice(2)) : res(a.resolveDir, a.path);
      if (p === join(root, 'lib', 'supabase')) return { path: pathToFileURL(FAKE_DB).href, external: true };
      return undefined;
    });
    b.onResolve({ filter: /^@clerk\/nextjs\/server$/ }, () => ({ path: pathToFileURL(FAKE_CLERK).href, external: true }));
    b.onResolve({ filter: /^server-only$/ }, () => ({ path: SHIM }));
    // Next 14 has no ESM exports map, so Node needs the file spelled out —
    // and the page's 404 is Next's own notFound(), not a stand-in.
    b.onResolve({ filter: /^next\/server$/ }, (a) => ({ path: `${a.path}.js`, external: true }));
    // Two stand-ins, everything else real. cookies() needs a live request: under
    // test the request's cookies are globalThis.__cookies. The code form's
    // useRouter needs a mounted app router; notFound() stays Next's own.
    b.onResolve({ filter: /^next\/(headers|navigation)$/ }, (a) => ({ path: a.path, namespace: 'shim' }));
    b.onLoad({ filter: /.*/, namespace: 'shim' }, (a) => ({
      contents:
        a.path === 'next/headers'
          ? 'export function cookies() { const c = globalThis.__cookies ?? {}; return { get: (n) => (n in c ? { name: n, value: c[n] } : undefined) }; }'
          : "export { notFound } from 'next/navigation.js'; export const useRouter = () => ({ refresh() {}, push() {}, replace() {} });",
      loader: 'js',
      resolveDir: root,
    }));
  },
};
await Promise.all(
  Object.entries({ events: 'app/api/events/route.ts', page: 'app/dev/dashboard/page.tsx', code: 'app/api/dev/dashboard-code/route.ts' }).map(([name, file]) =>
    build({
      entryPoints: [join(root, file)],
      bundle: true,
      format: 'esm',
      platform: 'node',
      outfile: join(OUT, `${name}.mjs`),
      tsconfig: join(root, 'tsconfig.json'),
      jsx: 'automatic',
      // the page carries its stylesheet; under test the markup is what is checked
      loader: { '.css': 'empty' },
      plugins: [swap],
      external: ['next', 'next/*', 'react', 'react/*', 'react-dom', 'react-dom/*', 'undici', '@supabase/*', 'stripe', 'resend'],
      logLevel: 'error',
    })
  )
);

// A real rate limit (the in-memory one), no admins until a test names one.
process.env.CLERK_SECRET_KEY = 'sk_test_dashboard_e2e';
for (const k of ['RATE_LIMIT_DISABLED', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'SOCRIA_DASHBOARD_ADMINS', 'SOCRIA_DASHBOARD_CODE_1', 'SOCRIA_DASHBOARD_CODE_2']) delete process.env[k];

const { db, supabaseAdmin } = await import(pathToFileURL(FAKE_DB).href);
const clerk = await import(pathToFileURL(FAKE_CLERK).href);
const route = await import(pathToFileURL(join(OUT, 'events.mjs')).href);
const page = await import(pathToFileURL(join(OUT, 'page.mjs')).href);
const { NextRequest } = await import('next/server.js');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const DAY = 86_400_000;
const HOUR = 3_600_000;
const NOW = Date.now();
const title = (id) => ROLES.find((r) => r.id === id).title;

// bump_product_event as supabase/schema.sql defines it: one row per
// (env, day, event, kind), added to. Every call is kept, to be read back.
const bumps = [];
let bumpAnswer = null;
db.rpcs.bump_product_event = (a) => {
  bumps.push(a);
  if (bumpAnswer) return bumpAnswer(a);
  const rows = db.rows('product_events');
  const r = rows.find((x) => x.env === a.p_env && x.day === a.p_day && x.event === a.p_event && x.kind === a.p_kind);
  if (r) r.n += a.p_by;
  else rows.push({ env: a.p_env, day: a.p_day, event: a.p_event, kind: a.p_kind, n: a.p_by });
  return { data: r ? r.n : a.p_by, error: null };
};

const send = (body, { ip = '203.0.113.7', raw } = {}) =>
  route.POST(
    new NextRequest('http://localhost/api/events', {
      method: 'POST',
      body: raw ?? JSON.stringify(body),
      headers: { 'content-type': 'text/plain;charset=UTF-8', 'x-forwarded-for': ip },
    })
  );
const answer = (step, kind, opts) => send({ e: 'onboarding_answered', p: { step, kind } }, opts);

/** Warnings the route prints while `fn` runs. */
async function warnings(fn) {
  const seen = [];
  const orig = console.warn;
  console.warn = (...a) => seen.push(a.map(String).join(' '));
  try {
    await fn();
  } finally {
    console.warn = orig;
  }
  return seen;
}

console.log('=== /api/events: a beacon becomes one integer, and nothing else ===');
{
  globalThis.__uid = 'user_g1';
  const r = await answer('who', 'study');
  ok('answered with 204 and no body', r.status === 204 && (await r.text()) === '');
  ok('one counter bumped', bumps.length === 1, JSON.stringify(bumps));
  const a = bumps[0] ?? {};
  ok('…by one, under the answer’s step and kind', a.p_event === 'onboarding_answered' && a.p_kind === 'who:study' && a.p_by === 1);
  ok('…on today, in this environment', a.p_day === new Date(NOW).toISOString().slice(0, 10) && ['production', 'preview', 'development'].includes(a.p_env));
  ok('what is written is the counter key and nothing else — not who, not when beyond the day', JSON.stringify(Object.keys(a).sort()) === JSON.stringify(['p_by', 'p_day', 'p_env', 'p_event', 'p_kind']));
  ok('…not the signed-in id, anywhere', !JSON.stringify(a).includes('user_g1'));
  ok('the row the table holds', db.rows('product_events').length === 1 && db.rows('product_events')[0].n === 1);

  globalThis.__uid = 'user_g2';
  await answer('who', 'study');
  ok('the same answer again adds to the same row', db.rows('product_events').length === 1 && db.rows('product_events')[0].n === 2);
  globalThis.__uid = null;
  await answer('who', 'build');
  await answer('how', 'logos-3');
  await answer('name', 'given');
  await answer('thought', 'understand');
  await send({ e: 'signup_completed', p: { referrer: 'google', landing: 'students', utm_source: 'uta-flyer' } });
  ok('a sign-up counts its referrer, landing and campaign', ['ref:google', 'land:students', 'utm:uta-flyer'].every((k) => bumps.some((b) => b.p_event === 'signup_completed' && b.p_kind === k)));
  ok('…signed out, as it is sent before the session starts', bumps.filter((b) => b.p_event === 'signup_completed').length === 3);
}

console.log('=== /api/events: what it refuses, it refuses without a word ===');
{
  const before = bumps.length;
  const refused = [
    ['a name', { e: 'onboarding_answered', p: { step: 'name', kind: 'Ada Lovelace' } }],
    ['a first thought', { e: 'onboarding_answered', p: { step: 'thought', kind: 'whether to leave my job' } }],
    ['a role nobody offered', { e: 'onboarding_answered', p: { step: 'who', kind: 'astronaut' } }],
    ['an event that is not counted', { e: 'conversation_started', p: {} }],
    ['an event that is not a string', { e: 42, p: { step: 'who', kind: 'study' } }],
    ['no event', { p: { step: 'who', kind: 'study' } }],
  ];
  for (const [what, body] of refused) {
    const r = await send(body);
    ok(`${what}: 204 all the same`, r.status === 204);
  }
  ok('not JSON: 204', (await send(null, { raw: 'step=who&kind=study' })).status === 204);
  ok('empty: 204', (await send(null, { raw: '' })).status === 204);
  const big = JSON.stringify({ e: 'onboarding_answered', p: { step: 'who', kind: 'study', pad: 'x'.repeat(3000) } });
  ok('bigger than any beacon: 204', (await send(null, { raw: big })).status === 204);
  ok('…and none of them counted', bumps.length === before, String(bumps.length - before));
  ok('a junk referrer is counted as unknown, never as its text', (await send({ e: 'signup_completed', p: { referrer: 'https://evil.example/?me=1', landing: 'home' } })).status === 204 && bumps.slice(-2).map((b) => b.p_kind).join() === 'ref:unknown,land:home');
  ok('only POST is answered', typeof route.GET === 'undefined' && typeof route.POST === 'function');
}

console.log('=== /api/events: a count not taken is never an error for the person ===');
{
  const quiet = [
    ['the function is not there yet', { code: 'PGRST202', message: 'Could not find the function public.bump_product_event(p_at, p_by, p_day, p_env, p_event, p_kind) in the schema cache' }],
    ['the table is not there yet', { code: '42P01', message: 'relation "public.product_events" does not exist' }],
  ];
  for (const [what, error] of quiet) {
    bumpAnswer = () => ({ data: null, error });
    let r;
    const w = await warnings(async () => (r = await answer('who', 'life')));
    ok(`${what}: 204, and quiet — an expected state before the migration`, r.status === 204 && w.length === 0, w.join(' | '));
  }
  bumpAnswer = () => ({ data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } });
  let r;
  let w = await warnings(async () => (r = await answer('who', 'life')));
  ok('any other refusal: 204, and one line for the logs', r.status === 204 && w.length === 1 && /57014/.test(w[0]), w.join(' | '));
  // names the function, and is still a fault: the grant to the service role is missing
  bumpAnswer = () => ({ data: null, error: { code: '42501', message: 'permission denied for function bump_product_event' } });
  w = await warnings(async () => (r = await answer('who', 'life')));
  ok('a refusal that merely names the function is not mistaken for a missing one', r.status === 204 && w.length === 1 && /42501/.test(w[0]), w.join(' | '));
  bumpAnswer = () => {
    throw new Error('Supabase is not configured');
  };
  w = await warnings(async () => (r = await answer('who', 'life')));
  ok('no database at all: 204', r.status === 204);
  bumpAnswer = null;
  // what those four did not write, the rest of this file need not count
  db.tables.product_events = db.rows('product_events').filter((x) => x.kind !== 'who:life');
}

// ── the page ─────────────────────────────────────────────────────────

const USERS = {
  user_admin: { emails: ['founder@example.com'], createdAt: NOW - 200 * DAY, lastActiveAt: NOW - HOUR, providers: ['google'] },
  // the same address, typed into another account and never confirmed
  user_imposter: { emails: ['founder@example.com'], unverified: ['founder@example.com'], createdAt: NOW - 1 * DAY },
  user_g1: { emails: ['g1@gmail.com'], createdAt: NOW - 3 * DAY, lastActiveAt: NOW - 2 * HOUR, providers: ['google'] },
  user_g2: { emails: ['g2@gmail.com'], createdAt: NOW - 10 * DAY, password: true },
  user_g3: { emails: ['g3@gmail.com'], createdAt: NOW - 40 * DAY },
  user_uni: { emails: ['u1@mavs.uta.edu'], createdAt: NOW - 5 * DAY },
};
globalThis.__users = USERS;
db.rows('user_profiles').push({
  user_id: 'user_g1',
  profile: 'PRIVATE PROFILE TEXT',
  first_run: { v: 1, at: { 'socria.intro': USERS.user_g1.createdAt + 60_000, 'socria.thought': USERS.user_g1.createdAt + 20 * 60_000 } },
  conversation_style: 'direct',
  updated_at: NOW,
});
db.rows('conversations').push({
  id: 'c1',
  user_id: 'user_g1',
  kind: 'chat',
  title: 'PRIVATE TITLE',
  messages: [{ role: 'user', content: 'PRIVATE THOUGHT' }],
  memory: { note: 'PRIVATE MEMORY' },
  created_at: new Date(USERS.user_g1.createdAt + 20 * 60_000).toISOString(),
  updated_at: NOW - 2 * HOUR,
});
db.rows('lifecycle_emails').push({ user_id: 'user_g1', kind: 'newsletter', created_at: NOW - 3 * DAY });
// another environment's counts, in the same table: a preview's numbers are not production's
const env = bumps[0].p_env;
const elsewhere = env === 'production' ? 'preview' : 'production';
db.rows('product_events').push({ env: elsewhere, day: bumps[0].p_day, event: 'onboarding_answered', kind: 'who:care', n: 50 });

// Every table read and every directory read, for proving a refusal read nothing.
const client = supabaseAdmin();
const from0 = client.from;
let reads = 0;
client.from = (t) => {
  reads++;
  return from0(t);
};

/** One request for the page, as Next would make it. */
async function visit({ as = null, admins, range, cookies = {} } = {}) {
  globalThis.__uid = as;
  globalThis.__cookies = cookies;
  if (admins === undefined) delete process.env.SOCRIA_DASHBOARD_ADMINS;
  else process.env.SOCRIA_DASHBOARD_ADMINS = admins;
  reads = 0;
  clerk.calls.length = 0;
  try {
    const el = await page.default({ searchParams: range ? { range } : {} });
    return { html: renderToStaticMarkup(el), reads, listed: clerk.calls.length };
  } catch (e) {
    return { notFound: e?.digest === 'NEXT_NOT_FOUND', error: e, reads, listed: clerk.calls.length };
  }
}

console.log('=== /dev/dashboard: not indexed, not cached ===');
{
  ok('noindex, nofollow', page.metadata?.robots?.index === false && page.metadata?.robots?.follow === false);
  ok('read fresh on every request', page.dynamic === 'force-dynamic' && page.revalidate === 0);
  ok('its title', page.metadata?.title === 'Developer dashboard');
}

console.log('=== /dev/dashboard: a 404 for everyone not named, before a single read ===');
{
  const turnedAway = [
    ['nobody named: not even the founder', { as: 'user_admin' }],
    ['an empty list', { as: 'user_admin', admins: '' }],
    ['a list of nothing usable', { as: 'user_admin', admins: ' , ; not-an-entry' }],
    ['signed out', { admins: 'founder@example.com' }],
    ['someone not on the list', { as: 'user_g1', admins: 'founder@example.com' }],
    ['the listed address, unconfirmed on another account', { as: 'user_imposter', admins: 'founder@example.com' }],
    ['a signed-in id that is not the listed one', { as: 'user_g2', admins: 'user_admin' }],
  ];
  for (const [what, v] of turnedAway) {
    const r = await visit(v);
    ok(`${what}: Next's own 404`, r.notFound === true, r.error ? String(r.error?.message) : 'it rendered');
    ok(`${what}: …having read nothing`, r.reads === 0 && r.listed === 0, `${r.reads} table reads, ${r.listed} directory reads`);
  }
}

console.log('=== /dev/dashboard: the founder sees what the route counted ===');
let shown;
{
  const r = await visit({ as: 'user_admin', admins: 'someone@else.org, Founder@Example.com', range: '30' });
  shown = r.html ?? '';
  ok('the listed address, confirmed: the page', !!r.html, r.error ? String(r.error?.stack) : '');
  ok('…read from the database and the directory', r.reads > 0 && r.listed > 0);
  ok('the heading', shown.includes('Who is here, and what they chose'));
  const tile = (label, value) => new RegExp(`dash-tile-label">${label}</span><span class="dash-tile-value">${value}</span>`).test(shown);
  const tileText = (label) => shown.match(new RegExp(`dash-tile-label">${label}</span><span class="dash-tile-value">([^<]*)<`))?.[1];
  ok('every account, from the directory, as the headline', /dash-hero-label">Accounts<\/span><span class="dash-hero-value">6<\/span>/.test(shown), shown.match(/dash-hero-value">([^<]*)</)?.[1]);
  ok('new in the last 30 days', tile('New accounts', 4), tileText('New accounts'));
  ok('the two who chose “study”, as the route counted them', shown.includes(`aria-label="${title('study')}: 2,`));
  ok('…and the one who chose “build”', shown.includes(`aria-label="${title('build')}: 1,`));
  ok('another environment’s counts are not this one’s', !shown.includes(`aria-label="${title('care')}: 50,`));
  ok('the campaign the sign-up came from', shown.includes('uta-flyer'));
  ok('the 30-day range is the one marked', /<a href="\?range=30" aria-current="page">/.test(shown));
}

console.log('=== /dev/dashboard: kinds, never identities ===');
{
  ok('no address', !shown.includes('@'));
  ok('no account id', Object.keys(USERS).every((id) => !shown.includes(id)), Object.keys(USERS).filter((id) => shown.includes(id)).join());
  ok('no conversation title, message or memory, and no profile', !shown.includes('PRIVATE'));
  ok('a domain three or more accounts share is shown', shown.includes('gmail.com'));
  ok('…one fewer than three share is not — a university’s included', !shown.includes('example.com') && !shown.includes('mavs.uta.edu') && shown.includes('university address'), shown.match(/.{0,80}(example\.com|mavs\.uta\.edu).{0,40}/)?.[0]);
  const src = readFileSync(join(root, 'lib/dashboard/collect.ts'), 'utf8');
  ok('conversations are read for owner, kind and times only', /'user_id, kind, created_at, updated_at'/.test(src) && !/select\([^)]*messages/.test(src));
}

console.log('=== /dev/dashboard: other ways in, other states ===');
{
  const byId = await visit({ as: 'user_admin', admins: 'user_admin' });
  ok('a listed Clerk id: the page', !!byId.html && byId.html.includes('Who is here'));
  const all = await visit({ as: 'user_admin', admins: 'user_admin', range: 'all' });
  ok('?range=all marks all time', /<a href="\?range=all" aria-current="page">/.test(all.html ?? ''));
  const bogus = await visit({ as: 'user_admin', admins: 'user_admin', range: '<script>' });
  ok('a range nobody offered falls back to 30 days', /<a href="\?range=30" aria-current="page">/.test(bogus.html ?? '') && !(bogus.html ?? '').includes('<script>'));

  db.absent.add('product_events');
  const before = await visit({ as: 'user_admin', admins: 'user_admin' });
  ok('before the migration: the page still renders', !!before.html, before.error ? String(before.error?.stack) : '');
  ok('…and says what is missing and how to add it', (before.html ?? '').includes('product_events') && (before.html ?? '').includes('supabase/schema.sql'));
  db.absent.delete('product_events');

  delete process.env.CLERK_SECRET_KEY;
  const noClerk = await visit({ as: 'user_admin', admins: 'user_admin' });
  ok('no directory key here: the page renders from the database alone', !!noClerk.html && noClerk.html.includes('Clerk could not be read'));
  process.env.CLERK_SECRET_KEY = 'sk_test_dashboard_e2e';
}

console.log('=== /dev/dashboard: the two-step code ===');
{
  const codeRoute = await import(pathToFileURL(join(OUT, 'code.mjs')).href);
  let host = 10;
  // a fresh address each try unless one is given, so only the rate-limit check below meets the limit
  const tryCode = (step, code, { ip = `192.0.2.${host++}`, cookie = '' } = {}) =>
    codeRoute.POST(
      new NextRequest('http://localhost/api/dev/dashboard-code', {
        method: 'POST',
        body: JSON.stringify({ step, code }),
        headers: { 'content-type': 'application/json', 'x-forwarded-for': ip, ...(cookie ? { cookie } : {}) },
      })
    );
  const got = (r, name) => r.cookies.get(name)?.value;
  const HALF = 'socria_dash_half';
  const PASS = 'socria_dash_pass';
  // test values only: the real codes live in the deployment's environment, never in this public repository
  const setCodes = (a, b) => {
    for (const [k, v] of [['SOCRIA_DASHBOARD_CODE_1', a], ['SOCRIA_DASHBOARD_CODE_2', b]]) v === undefined ? delete process.env[k] : (process.env[k] = v);
  };

  setCodes(undefined, undefined);
  let r = await tryCode(1, 'anything-at-all');
  ok('no codes set: no code is right', r.status === 400 && !got(r, HALF));
  let v = await visit({ as: 'user_g1', admins: 'founder@example.com' });
  ok('…and the page is still a 404 for the unlisted', v.notFound === true && v.reads === 0);
  setCodes('first-test-code', undefined);
  ok('one code set is not enough: still a 404', (await visit({})).notFound === true);
  setCodes('abc', 'def');
  ok('codes shorter than six characters are not codes', (await tryCode(1, 'abc')).status === 400 && (await visit({})).notFound === true);

  setCodes('first-test-code', 'Second-Key');
  v = await visit({});
  ok('codes set: a stranger is asked for the first code', !!v.html && v.html.includes('First code') && v.html.includes('step 1 of 2'), v.error ? String(v.error?.stack) : '');
  ok('…having read nothing, and shown nothing of the dashboard', v.reads === 0 && v.listed === 0 && !v.html.includes('Who is here'));
  ok('…signed in but unlisted, the same', (await visit({ as: 'user_g1', admins: 'founder@example.com' })).html?.includes('First code'));
  ok('the listed founder still walks straight in', (await visit({ as: 'user_admin', admins: 'founder@example.com' })).html?.includes('Who is here'));

  r = await tryCode(1, 'wrong-guess');
  ok('a wrong first code: 400, and no cookie', r.status === 400 && !got(r, HALF));
  ok('the second code first: 400', (await tryCode(2, 'Second-Key')).status === 400);
  r = await tryCode(1, '  FIRST-TEST-CODE ');
  const half = got(r, HALF);
  const setCookie = r.headers.get('set-cookie') ?? '';
  ok('the first code, in any case and with spaces: step one done', r.status === 200 && !!half);
  ok('…in a cookie script cannot read, sent only to this site', /HttpOnly/i.test(setCookie) && /SameSite=strict/i.test(setCookie));
  ok('…which holds no code', !half.toUpperCase().includes('FIRST-TEST-CODE'));
  v = await visit({ cookies: { [HALF]: half } });
  ok('with step one done: the second code is asked for, still reading nothing', v.html?.includes('Second code') && v.reads === 0);

  ok('a forged step one does not count', (await tryCode(2, 'Second-Key', { cookie: `${HALF}=half.99999999999999.AAAA` })).status === 400);
  r = await tryCode(2, 'nope-nope', { cookie: `${HALF}=${half}` });
  ok('a wrong second code: 400, and step one is cleared', r.status === 400 && got(r, HALF) === '' && !got(r, PASS));
  r = await tryCode(2, 'second-key', { cookie: `${HALF}=${half}` });
  const passValue = got(r, PASS);
  ok('both codes right: a pass', r.status === 200 && !!passValue && got(r, HALF) === '');

  v = await visit({ cookies: { [PASS]: passValue } });
  ok('the pass opens the dashboard, signed out', v.html?.includes('Who is here, and what they chose'), v.error ? String(v.error?.stack) : '');
  ok('…and it is the same page: no address, no id, no words', !v.html.includes('@') && Object.keys(USERS).every((id) => !v.html.includes(id)) && !v.html.includes('PRIVATE'));
  const [kind, until, sig] = passValue.split('.');
  ok('a pass with its end moved is refused', (await visit({ cookies: { [PASS]: `${kind}.${Number(until) + 1}.${sig}` } })).html?.includes('First code'));
  ok('step one’s cookie is not a pass', (await visit({ cookies: { [PASS]: half } })).html?.includes('First code'));
  setCodes('first-test-code', 'a-new-second');
  ok('changing a code ends every pass already given', (await visit({ cookies: { [PASS]: passValue } })).html?.includes('First code'));
  setCodes(undefined, undefined);
  ok('removing the codes ends them too: a 404 again', (await visit({ cookies: { [PASS]: passValue } })).notFound === true);

  setCodes('first-test-code', 'Second-Key');
  const statuses = [];
  for (let i = 0; i < 7; i++) statuses.push((await tryCode(1, `guess-${i}`, { ip: '198.51.100.77' })).status);
  ok('six guesses a minute from one address, then 429', statuses.slice(0, 6).every((s) => s === 400) && statuses[6] === 429, statuses.join(','));
  ok('…even for the right code', (await tryCode(1, 'first-test-code', { ip: '198.51.100.77' })).status === 429);
  setCodes(undefined, undefined);
}

console.log('=== /api/events: its own rate-limit pool ===');
{
  const src = readFileSync(join(root, 'app/api/events/route.ts'), 'utf8');
  ok('the counters draw on their own budget, not on the thinking passes’', /enforceRateLimit\(req, userId, 'count'\)/.test(src) && !/'aux'/.test(src));
  globalThis.__uid = null;
  const ip = '198.51.100.23';
  const codes = [];
  for (let i = 0; i < 21; i++) codes.push((await answer('how', 'core-4', { ip })).status);
  ok('twenty beacons a minute from one signed-out address are counted', codes.slice(0, 20).every((c) => c === 204), codes.join(','));
  ok('…the twenty-first is refused', codes[20] === 429);
  ok('another address is not held up by it', (await answer('how', 'core-4', { ip: '198.51.100.24' })).status === 204);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
