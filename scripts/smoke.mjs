// Socria in a real browser, against the production build — what CI runs
// after `next build` (npm run smoke).
//
// The unit and route suites prove the parts; this proves they were put
// together: that the built app starts, that its pages render without an
// uncaught error or a 5xx, that a visitor can say a thought and get Socria's
// answer back (on a desk and on a phone), and that axe finds nothing it calls
// critical or serious on any of them.
//
// Nothing here leaves the machine. The database is scripts/dev/fake-postgrest,
// the model is scripts/dev/fake-openai, Clerk's network is refused (a visitor
// is signed out, which is the case being checked), and so is every request
// that is not to this server. It needs no secret.
//
//   npm run build && npm run smoke
//   SMOKE_CHROME=/path/to/chrome   which browser (else the first one found)
//   SMOKE_KEEP=1                   leave screenshots in .smoke/ on success too

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, '.smoke');
const APP = 3400;
const DB = 54329;
const MODEL = 3998;
// Next is left to bind its own interfaces: bound to 127.0.0.1 alone (-H),
// `next start` answered nothing that went through the middleware. The
// browser is sent to 127.0.0.1, which some sandboxes resolve and localhost not.
const BASE = `http://127.0.0.1:${APP}`;

const chrome =
  process.env.SMOKE_CHROME ||
  ['/opt/pw-browsers/chromium', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => existsSync(p));
if (!chrome) {
  console.error('smoke: no Chrome found; set SMOKE_CHROME');
  process.exit(1);
}
if (!existsSync(join(root, '.next', 'BUILD_ID'))) {
  console.error('smoke: no production build; run `npm run build` first');
  process.exit(1);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const kids = [];
const VERBOSE = !!process.env.SMOKE_VERBOSE;
const run = (args, env) => {
  const k = spawn(process.execPath, args, { cwd: root, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  const keep = (d) => {
    log = (log + d).slice(-20000);
    if (VERBOSE) process.stdout.write(`[${args[0].split('/').pop()}] ${d}`);
  };
  k.stdout.on('data', keep);
  k.stderr.on('data', keep);
  k.on('exit', (code, sig) => VERBOSE && console.log(`[${args[0].split('/').pop()}] exited ${code ?? sig}`));
  kids.push(k);
  return { k, log: () => log };
};
const stop = () => kids.forEach((k) => k.kill('SIGTERM'));
process.on('exit', stop);

run(['scripts/dev/fake-postgrest.mjs'], { PORT: String(DB) });
run(['scripts/dev/fake-openai.mjs', String(MODEL)], {});
const app = run([require.resolve('next/dist/bin/next'), 'start', '-p', String(APP)], {
  NODE_ENV: 'production',
  SUPABASE_URL: `http://127.0.0.1:${DB}`,
  SUPABASE_SERVICE_ROLE_KEY: 'smoke',
  // A development instance's shape, and never reached: the browser refuses Clerk's network.
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_ZXhhbXBsZS5jbGVyay5hY2NvdW50cy5kZXYk',
  CLERK_SECRET_KEY: 'sk_test_smokesmokesmokesmoke',
  OPENAI_API_KEY: 'sk-smoke',
  OPENAI_BASE_URL: `http://127.0.0.1:${MODEL}/v1`,
  RATE_LIMIT_DISABLED: '1',
  SOCRIA_TAKEOVER: 'off',
  NEXT_TELEMETRY_DISABLED: '1',
});

const ready = async () => {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`${BASE}/api/logos/plan`, { signal: AbortSignal.timeout(5000) });
      if (r.status === 200) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
};
console.log('smoke: waiting for the app');
if (!(await ready())) {
  console.error('smoke: the app did not start\n' + app.log());
  process.exit(1);
}

console.log('smoke: the app is up');
const { chromium } = require('playwright-core');
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const browser = await chromium.launch({ executablePath: chrome, args: ['--no-proxy-server'] });

let pass = 0,
  fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + (x ? '\n       ' + x : ''))));

// What is noise rather than a fault: Clerk, refused on purpose, and the
// analytics beacon, which only exists on Vercel.
const NOISE = /clerk|_vercel\/insights|speed-insights|Failed to load resource: net::ERR_FAILED|ERR_BLOCKED_BY_CLIENT/i;

async function visit(name, path, { phone = false, firstVisit = false, act } = {}) {
  console.log(`\n${name}`);
  const ctx = await browser.newContext(
    phone ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : { viewport: { width: 1440, height: 900 } }
  );
  // Signed out, without a round trip to Clerk: a development key's middleware
  // otherwise answers a page request with a handshake redirect to Clerk
  // ("dev-browser-missing"), which this run refuses.
  await ctx.addCookies([
    { name: '__client_uat', value: '0', url: BASE },
    { name: '__clerk_db_jwt', value: 'dvb_smoke', url: BASE },
  ]);
  await ctx.route('**/*', (r) => (r.request().url().startsWith(BASE) ? r.continue() : r.abort()));
  if (!firstVisit) {
    // Someone who has been before: the first-run introduction is behind them.
    await ctx.addInitScript((now) => {
      try {
        if (!localStorage.getItem('socria.firstrun.v1'))
          localStorage.setItem('socria.firstrun.v1', JSON.stringify({ v: 1, at: { 'socria.intro': now - 40 * 864e5, 'socria.opened': now - 30 * 864e5, 'socria.new': now - 30 * 864e5 } }));
      } catch {}
    }, Date.now());
  }
  const page = await ctx.newPage();
  const errors = [];
  const fives = [];
  page.on('pageerror', (e) => errors.push(`uncaught: ${String(e).slice(0, 300)}`));
  page.on('console', (m) => m.type() === 'error' && !NOISE.test(m.text()) && errors.push(`console: ${m.text().slice(0, 300)}`));
  page.on('response', (r) => r.url().startsWith(BASE) && r.status() >= 500 && fives.push(`${r.status()} ${r.url().slice(BASE.length)}`));

  const res = await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 60000 });
  ok(`${path} answers 200`, res?.status() === 200, String(res?.status()));
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  if (act) await act(page);
  await page.waitForTimeout(500);

  await page.addScriptTag({ content: axeSource });
  const found = await page.evaluate(async () => {
    const r = await window.axe.run(document, { resultTypes: ['violations'], runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, where: v.nodes.slice(0, 3).map((x) => x.target.join(' ')) }));
  });
  const blocking = found.filter((v) => v.impact === 'critical' || v.impact === 'serious');
  for (const v of found.filter((x) => !blocking.includes(x))) console.log(`  note  axe ${v.impact}: ${v.id} ×${v.n}  ${v.where.join(' | ')}`);
  ok('axe: nothing critical or serious', blocking.length === 0, blocking.map((v) => `${v.impact} ${v.id} ×${v.n}: ${v.where.join(' | ')}`).join('\n       '));
  ok('no uncaught error, no console error', errors.length === 0, errors.slice(0, 5).join('\n       '));
  ok('no 5xx from the server', fives.length === 0, fives.slice(0, 5).join('\n       '));
  await page.screenshot({ path: join(OUT, `${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`) });
  await ctx.close();
}

// A thought in, Socria's answer back — the loop the product is.
const converse = async (page) => {
  const box = page.locator('.l5-dock textarea:visible, textarea:visible').first();
  await box.waitFor({ timeout: 60000 });
  await box.click();
  await box.fill('Should I take the job in Austin or stay where I am?');
  await box.press('Enter');
  const mine = page.locator('article.l5-msg.l5-u');
  const answer = page.locator('article.l5-msg.l5-a:not(.is-pending)');
  await answer.first().waitFor({ timeout: 60000 }).catch(() => {});
  ok('their words are in the conversation', (await mine.count()) >= 1 && /Austin/.test((await mine.first().innerText()) || ''));
  ok('Socria answered', (await answer.count()) >= 1 && ((await answer.first().innerText()) || '').trim().length > 0);
  ok('  and the box is empty again, ready for the next', (await box.inputValue()) === '');
};

await visit('the landing page', '/');
await visit('Socria One', '/one');
await visit('the Charter', '/charter');
await visit('a first visit to Logos 5', '/chat', { firstVisit: true });
await visit('a visitor says a thought, on a desk', '/chat', { act: converse });
await visit('a visitor says a thought, on a phone', '/chat', { phone: true, act: converse });

await browser.close();
stop();
console.log(`\nsmoke: ${pass} passed, ${fail} failed${fail ? ` — screenshots in ${OUT}` : ''}`);
if (!fail && !process.env.SMOKE_KEEP) rmSync(OUT, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
