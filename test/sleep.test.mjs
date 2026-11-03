// test/sleep.test.mjs — SLEEP MODE: A FREE ACCOUNT'S 35,000 TOKENS A DAY (lib/sleep.ts, lib/sleep-server.ts).
//
// Through the real routes (the reply, the map, the usage the app reads), with
// only Clerk, the database and the model replaced: every call's input and
// output tokens are counted on the server, to the account that made the
// request; past the day's limit Socria rests — the routes refuse with the day's
// state and call no model — until the next UTC midnight; Socria One is never
// counted or put to sleep; a subscription that starts or ends mid-day takes
// effect on the next request; the count is one row per person per day, so
// every device and tab shares it. And the screen: what it says and offers.

import { build } from 'esbuild';
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve as res } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, '.tmp', 'e2e-sleep');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const swap = {
  name: 'swap',
  setup(b) {
    b.onResolve({ filter: /(^|\/)supabase$/ }, (a) => {
      const p = a.path.startsWith('@/') ? join(root, a.path.slice(2)) : res(a.resolveDir, a.path);
      if (p === join(root, 'lib', 'supabase')) return { path: pathToFileURL(join(here, 'helpers', 'fake-supabase.mjs')).href, external: true };
      return undefined;
    });
    b.onResolve({ filter: /^@clerk\/nextjs\/server$/ }, () => ({ path: pathToFileURL(join(here, 'helpers', 'fake-clerk.mjs')).href, external: true }));
    b.onResolve({ filter: /^openai$/ }, () => ({ path: pathToFileURL(join(here, 'helpers', 'fake-openai-logos.mjs')).href, external: true }));
    b.onResolve({ filter: /^server-only$/ }, () => ({ path: join(here, 'helpers', 'server-only-shim.mjs') }));
    b.onResolve({ filter: /^next\/(server|headers)$/ }, (a) => ({ path: `${a.path}.js`, external: true }));
  },
};
for (const [entry, out] of [['app/api/logos/chat/route.ts', 'chat.mjs'], ['app/api/logos/map/route.ts', 'map.mjs'], ['app/api/logos/usage/route.ts', 'usage.mjs'], ['lib/sleep.ts', 'sleep.mjs'], ['components/logos5/SleepMode.tsx', 'screen.mjs']]) {
  await build({
    entryPoints: [join(root, entry)], bundle: true, format: 'esm', platform: 'node', jsx: 'automatic',
    outfile: join(OUT, out), tsconfig: join(root, 'tsconfig.json'), plugins: [swap], loader: { '.css': 'empty' },
    external: ['next', 'next/*', 'undici', '@supabase/*', 'stripe', 'resend', 'react', 'react-dom'], logLevel: 'error',
  });
}
for (const k of ['info', 'warn', 'error']) {
  const orig = console[k].bind(console);
  console[k] = (...a) => (typeof a[0] === 'string' && /^\[|^logos|^conversations/.test(a[0]) ? undefined : orig(...a));
}
process.env.OPENAI_API_KEY = 'test';
process.env.RATE_LIMIT_DISABLED = '1';

const { db } = await import(pathToFileURL(join(here, 'helpers', 'fake-supabase.mjs')).href);
const chat = await import(pathToFileURL(join(OUT, 'chat.mjs')).href);
const map = await import(pathToFileURL(join(OUT, 'map.mjs')).href);
const usage = await import(pathToFileURL(join(OUT, 'usage.mjs')).href);
const S = await import(pathToFileURL(join(OUT, 'sleep.mjs')).href);
const UI = await import(pathToFileURL(join(OUT, 'screen.mjs')).href);
const { NextRequest } = await import('next/server.js');

let pass = 0;
let fail = 0;
const ok = (name, cond, info) => {
  if (cond) pass++;
  else fail++;
  console.log(`${cond ? '  ok  ' : '  FAIL'} ${name}${!cond && info !== undefined ? `  — ${typeof info === 'string' ? info : JSON.stringify(info)}` : ''}`);
};
const settle = () => new Promise((r) => setTimeout(r, 30));
const day = (at = Date.now()) => `day:${new Date(at).toISOString().slice(0, 10)}`;

// the database's atomic bump, as supabase/freemium.sql has it: one row per person, scope and counter
const bump = ({ p_user, p_scope, p_counter, p_by }) => {
  const rows = db.rows('logos_usage');
  let r = rows.find((x) => x.user_id === p_user && x.scope === p_scope && x.counter === p_counter);
  if (!r) rows.push((r = { user_id: p_user, scope: p_scope, counter: p_counter, n: 0, updated_at: Date.now() }));
  r.n += p_by;
  return { data: r.n, error: null };
};
const tokensOf = (user, at = Date.now()) => db.rows('logos_usage').find((r) => r.user_id === user && r.scope === day(at) && r.counter === 'tokens')?.n ?? 0;
const setTokens = (user, n, at = Date.now()) => {
  const rows = db.rows('logos_usage');
  const r = rows.find((x) => x.user_id === user && x.scope === day(at) && x.counter === 'tokens');
  if (r) r.n = n;
  else rows.push({ user_id: user, scope: day(at), counter: 'tokens', n, updated_at: at });
};
const fresh = () => {
  db.reset();
  db.rpcs.bump_logos_usage = bump;
  globalThis.__logosScript = [];
  globalThis.__logosRefuse = [];
};

async function turn(user, said = 'What should I look for in a used bike?', { usageReport = { prompt_tokens: 20_000, completion_tokens: 500 } } = {}) {
  globalThis.__uid = user;
  globalThis.__logosCalls = [];
  globalThis.__logosReply = 'Look at the frame and the chain first.';
  globalThis.__logosUsage = usageReport;
  const r = await chat.POST(new NextRequest('http://localhost/api/logos/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: said }], sessionId: `s-${user}` }) }));
  const text = r.status === 200 ? await r.text() : null;
  const body = r.status === 200 ? null : await r.json().catch(() => null);
  await settle();
  return { status: r.status, text, body, calls: globalThis.__logosCalls.length, retry: r.headers.get('retry-after') };
}
async function mapTurn(user) {
  globalThis.__uid = user;
  globalThis.__logosCalls = [];
  globalThis.__logosScript = [{ nodes: [{ id: 'n1', label: 'Frame first', type: 'idea' }], edges: [] }];
  const r = await map.POST(new NextRequest('http://localhost/api/logos/map', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: 'Frame first?' }], map: { nodes: [], edges: [] }, sessionId: `m-${user}` }) }));
  const body = await r.json().catch(() => null);
  await settle();
  return { status: r.status, body, calls: globalThis.__logosCalls.length };
}
async function usageOf(user) {
  globalThis.__uid = user;
  const r = await usage.GET(new NextRequest('http://localhost/api/logos/usage'));
  return (await r.json()).sleep;
}

console.log('\n=== the day, in numbers (lib/sleep.ts) ===');
{
  ok('35,000 tokens a day', S.DAILY_TOKENS === 35_000 && S.dailyLimit({}) === 35_000);
  ok('  SOCRIA_FREE_DAILY_TOKENS moves it; nonsense does not', S.dailyLimit({ SOCRIA_FREE_DAILY_TOKENS: '50000' }) === 50_000 && S.dailyLimit({ SOCRIA_FREE_DAILY_TOKENS: 'lots' }) === 35_000 && S.dailyLimit({ SOCRIA_FREE_DAILY_TOKENS: '-5' }) === 35_000);
  const t = Date.UTC(2026, 10, 3, 22, 47, 10);
  ok('the day resets at the next UTC midnight', S.resetAt(t) === Date.UTC(2026, 10, 4));
  ok('  at midnight itself, the next one', S.resetAt(Date.UTC(2026, 10, 4)) === Date.UTC(2026, 10, 5));
  ok('34,999 is awake; 35,000 is asleep', !S.sleepState(34_999, 35_000, t).asleep && S.sleepState(35_000, 35_000, t).asleep && S.sleepState(41_000, 35_000, t).left === 0);
  ok('input and output together', S.tokensOf({ prompt_tokens: 1200, completion_tokens: 300 }) === 1500 && S.tokensOf(null) === 0 && S.tokensOf({ prompt_tokens: -4, completion_tokens: NaN }) === 0);
  ok('the countdown in words', S.wakesIn(4 * 3600_000 + 12 * 60_000) === '4 h 12 min' && S.wakesIn(38 * 60_000) === '38 min' && S.wakesIn(3600_000) === '1 h' && S.wakesIn(20_000) === 'less than a minute' && S.wakesIn(-1) === 'any moment');
  const r = S.sleepRefusal(S.sleepState(36_000, 35_000, t));
  ok('a refusal carries the state, so any screen can count down', r.sleep === true && r.resetAt === Date.UTC(2026, 10, 4) && r.used === 36_000 && /resting/.test(r.error));
}

console.log('\n=== counted on the server, every call, input and output ===');
{
  fresh();
  const a = await turn('user_free_a');
  ok('a free account’s first turn is answered', a.status === 200 && /frame/.test(a.text ?? ''), a);
  ok('  and what it spent is counted: 20,500 tokens', tokensOf('user_free_a') === 20_500, tokensOf('user_free_a'));
  const b = await turn('user_free_a');
  ok('a turn begun under the limit is answered in full, even if it crosses it', b.status === 200 && tokensOf('user_free_a') === 41_000, tokensOf('user_free_a'));
  const c = await turn('user_free_a');
  ok('past the limit: Socria rests — a 429 with the day’s state', c.status === 429 && c.body?.sleep === true && c.body.used === 41_000 && c.body.limit === 35_000, c);
  ok('  no model is asked, and nothing more is counted', c.calls === 0 && tokensOf('user_free_a') === 41_000);
  ok('  it wakes at the next UTC midnight, and says so', c.body?.resetAt === S.resetAt(Date.now()) && Number(c.retry) > 0);
  const m = await mapTurn('user_free_a');
  ok('the Logic Map rests too: no model, the map they have untouched', m.status === 429 && m.body?.sleep === true && m.calls === 0);
  const u = await usageOf('user_free_a');
  ok('the app reads the same state, on any device', u?.asleep === true && u.used === 41_000 && u.limit === 35_000 && u.resetAt === S.resetAt(Date.now()));
  ok('another free account is untouched by it', (await turn('user_free_b')).status === 200 && tokensOf('user_free_b') === 20_500);
}

console.log('\n=== the map, the memory and every other call count too ===');
{
  fresh();
  globalThis.__logosUsage = { prompt_tokens: 11_000, completion_tokens: 800 };
  const m = await mapTurn('user_map');
  ok('a map pass is counted to the account that asked', m.status === 200 && tokensOf('user_map') === 11_800, tokensOf('user_map'));
  process.env.SOCRIA_SLEEP_METER = 'reply';
  await mapTurn('user_map');
  ok('SOCRIA_SLEEP_METER=reply counts the replies alone', tokensOf('user_map') === 11_800, tokensOf('user_map'));
  delete process.env.SOCRIA_SLEEP_METER;
}

console.log('\n=== two requests at once, two people: each counted to their own ===');
{
  fresh();
  const [x, y] = await Promise.all([turn('user_x', 'One?', { usageReport: { prompt_tokens: 1000, completion_tokens: 0 } }), turn('user_y', 'Two?', { usageReport: { prompt_tokens: 1000, completion_tokens: 0 } })]);
  ok('both answered', x.status === 200 && y.status === 200);
  // the fake model reports the same usage for both; what matters is that each account got its own and no more
  ok('  and each account holds its own count — none charged to the other', tokensOf('user_x') >= 1000 && tokensOf('user_y') >= 1000 && tokensOf('user_x') + tokensOf('user_y') === 2000, [tokensOf('user_x'), tokensOf('user_y')]);
}

console.log('\n=== resets, and subscriptions changing ===');
{
  fresh();
  const yesterday = Date.now() - 86_400_000;
  setTokens('user_r', 90_000, yesterday);
  ok('yesterday’s spend is yesterday’s: a new day starts awake', (await turn('user_r')).status === 200 && tokensOf('user_r') === 20_500);

  setTokens('user_s', 50_000);
  ok('asleep on the free plan', (await turn('user_s')).status === 429);
  process.env.SOCRIA_ONE_USER_IDS = 'user_s';
  const one = await turn('user_s');
  ok('subscribing wakes Socria at once — Socria One has no daily limit', one.status === 200);
  ok('  and a member is never counted', tokensOf('user_s') === 50_000, tokensOf('user_s'));
  ok('  the app says so: no sleep state for a member', (await usageOf('user_s')) === null);
  process.env.SOCRIA_ONE_USER_IDS = '';
  ok('a subscription that ends mid-day: the day’s free count applies again', (await turn('user_s')).status === 429);

  process.env.SOCRIA_FREE_DAILY_TOKENS = '60000';
  ok('a higher limit, set in the environment, wakes it with no redeploy', (await turn('user_s')).status === 200);
  delete process.env.SOCRIA_FREE_DAILY_TOKENS;
  process.env.SOCRIA_SLEEP = 'off';
  setTokens('user_s', 999_999);
  ok('SOCRIA_SLEEP=off switches Sleep Mode off', (await turn('user_s')).status === 200);
  delete process.env.SOCRIA_SLEEP;
}

console.log('\n=== nobody is put to sleep by a fault ===');
{
  fresh();
  db.absent.add('logos_usage');
  ok('a usage store that cannot be read lets the turn through', (await turn('user_fault')).status === 200);
}

console.log('\n=== the screen (components/logos5/SleepMode.tsx) ===');
{
  const st = S.sleepState(41_000, 35_000, Date.now());
  const html = renderToStaticMarkup(h(UI.SleepScreen, { sleep: st, open: true, onClose() {}, onUpgrade() {}, onWake() {} }));
  ok('a dialog, named and described', /role="dialog"/.test(html) && /aria-modal="true"/.test(html) && /aria-labelledby="sl-t"/.test(html));
  ok('"Socria is resting", and what still works', /Socria is resting/.test(html) && /Everything you’ve made is still here — open any conversation, move your Logic Maps, edit your writing/.test(html));
  ok('when it wakes: a countdown and a clock time', /Wakes in/.test(html) && /class="sl-when-v">\d/.test(html) && /class="sl-when-at">at /.test(html));
  ok('Socria One, offered beside "Keep exploring" — never in place of it', /Keep exploring/.test(html) && /Stay awake with Socria One/.test(html) && /Socria One has no daily limit/.test(html));
  const member = renderToStaticMarkup(h(UI.SleepScreen, { sleep: st, open: true, onClose() {}, onWake() {} }));
  ok('  and not offered where there is no upgrade to make', !/Socria One/.test(member));
  ok('closed, or awake, it draws nothing', renderToStaticMarkup(h(UI.SleepScreen, { sleep: st, open: false, onClose() {}, onWake() {} })) === '' && renderToStaticMarkup(h(UI.SleepScreen, { sleep: S.sleepState(10, 35_000, Date.now()), open: true, onClose() {}, onWake() {} })) === '');
  const bar = renderToStaticMarkup(h(UI.SleepBar, { sleep: st, onOpen() {}, onWake() {} }));
  ok('the bar over the box: resting until a time, in how long', /class="sl-bar"/.test(bar) && /Resting until/.test(bar) && /aria-label="Socria is resting\. Wakes in/.test(bar));
}

console.log('\n=== wired everywhere a model is called ===');
{
  const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : f === 'route.ts' ? [join(d, f)] : []));
  // every route that picks a model, and the two study routes that ask through lib/logos5/ask-json.ts
  const routes = walk(join(root, 'app', 'api')).filter((f) => /chooseModel\(|chooseAuxModel\(|askJson\(/.test(readFileSync(f, 'utf8')));
  const ungated = routes.filter((f) => !/const sleep = await sleepGate\(req, userId[^)]*\);\s*if \(sleep\.refuse\) return sleep\.refuse;\s*if \(sleep\.meter\) meterFor\(sleep\.meter\);/.test(readFileSync(f, 'utf8')));
  ok(`every routed Logos 5 route rests when the day is spent (${routes.length})`, routes.length >= 12 && ungated.length === 0, { routes: routes.length, ungated: ungated.map((f) => f.replace(root, '')) });
  ok('every model call is counted, where the usage is logged', /if \(usage && usageSink\) usageSink\(route, usage\)/.test(readFileSync(join(root, 'lib', 'openai-usage.ts'), 'utf8')) && /onUsage\(\(route, usage\) => void chargeTokens\(route, usage\)\)/.test(readFileSync(join(root, 'lib', 'sleep-server.ts'), 'utf8')));
  const app = readFileSync(join(root, 'components', 'LogosApp.tsx'), 'utf8');
  ok('the app: a send while resting opens the screen and keeps the words', /if \(asleepNow\(\)\) \{\s*setSleepOpen\(true\);\s*return;\s*\}/.test(app));
  ok('  a refused turn goes back in the box', /if \(body\?\.sleep\) \{[\s\S]{0,900}giveBack\(sid, content, replying\)/.test(app));
  ok('  the map stays as it is', /if \(res\.status === 429\) return;/.test(app));
  ok('  the day is read from the server, the same on every device', /if \(json && 'sleep' in json\) setSleep\(/.test(app));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
