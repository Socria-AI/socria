// THE NEWSLETTER'S SCHEDULE — one approved issue every other day.
//
// The rule (lib/newsletter.ts planNewsletter) and the daily cron that follows
// it (app/api/cron/newsletter), through the real sender
// (lib/newsletter-send.ts). Only the database (fake-supabase), Clerk
// (fake-clerk), the issue list and the email provider are replaced.
//
// What is held down: approved issues go in the order written, one per window;
// a daily run lands every other day despite the cron's jitter; a draft never
// goes; with nothing approved, nothing goes; a run repeated the same day
// sends no one a second copy, and a new subscriber gets the current issue;
// the switch, the secret and every missing setting stop a send before anyone
// is claimed; a rehearsal sends nothing.

import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve as res } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, '.tmp', 'newsletter-schedule');
const FAKE_DB = join(here, 'helpers', 'fake-supabase.mjs');
const FAKE_ISSUES = join(here, 'helpers', 'fake-newsletter-schedule-issues.mjs');
const BASE = 'https://socria.test';

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const swap = {
  name: 'swap',
  setup(b) {
    b.onResolve({ filter: /(^|\/)supabase$/ }, (a) => {
      const p = a.path.startsWith('@/') ? join(root, a.path.slice(2)) : res(a.resolveDir, a.path);
      if (p === join(root, 'lib', 'supabase')) return { path: pathToFileURL(FAKE_DB).href, external: true };
      return undefined;
    });
    b.onResolve({ filter: /(^|\/)newsletter-issues$/ }, () => ({ path: pathToFileURL(FAKE_ISSUES).href, external: true }));
    b.onResolve({ filter: /^@clerk\/nextjs\/server$/ }, () => ({ path: pathToFileURL(join(here, 'helpers', 'fake-clerk.mjs')).href, external: true }));
    b.onResolve({ filter: /^server-only$/ }, () => ({ path: join(here, 'helpers', 'server-only-shim.mjs') }));
    b.onResolve({ filter: /^next\/(server|headers)$/ }, (a) => ({ path: `${a.path}.js`, external: true }));
  },
};
await build({
  entryPoints: { cron: join(root, 'app/api/cron/newsletter/route.ts'), letter: join(root, 'lib/newsletter.ts') },
  bundle: true,
  format: 'esm',
  platform: 'node',
  outdir: OUT,
  outExtension: { '.js': '.mjs' },
  tsconfig: join(root, 'tsconfig.json'),
  plugins: [swap],
  external: ['next', 'next/*', 'undici', '@supabase/*', 'stripe', 'resend', '@upstash/*'],
  logLevel: 'error',
});
console.warn = ((orig) => (...a) => (typeof a[0] === 'string' && /^(lifecycle store|email)/.test(a[0]) ? undefined : orig(...a)))(console.warn.bind(console));

const L = await import(pathToFileURL(join(OUT, 'letter.mjs')).href);
const cron = await import(pathToFileURL(join(OUT, 'cron.mjs')).href);
const { NEWSLETTER_ISSUES: ISSUES } = await import(pathToFileURL(FAKE_ISSUES).href);
const { db } = await import(pathToFileURL(FAKE_DB).href);
const { NextRequest } = await import('next/server.js');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));
const J = JSON.stringify;
const DAY = 86_400_000;
const H = 3_600_000;

// ── the rule ──────────────────────────────────────────────────────────
console.log('\n=== the rule ===');
{
  const A = { id: 'a', subject: 'A', paragraphs: ['a'] };
  const B = { id: 'b', subject: 'B', paragraphs: ['b'] };
  const Cd = { id: 'c', draft: true, subject: 'C', paragraphs: ['c'] };
  const bad = { id: 'bad', subject: 'Bad', paragraphs: ['<b>x</b>'] };
  const plan = (issues, started, now, every = 2) => L.planNewsletter({ issues, startedAt: new Map(Object.entries(started)), now, everyDays: every });
  const t0 = Date.UTC(2026, 10, 1, 16);

  ok('nothing approved → nothing, and says so', J(plan([Cd], {}, t0)) === J({ action: 'nothing', reason: 'no-ready-issue' }));
  ok('a broken issue is not approved', plan([bad], {}, t0).action === 'nothing');
  ok('nothing started → the first approved issue starts', plan([Cd, A, B], {}, t0).action === 'start' && plan([Cd, A, B], {}, t0).issue.id === 'a');
  const day1 = plan([A, B], { a: t0 }, t0 + DAY);
  ok('a day later → the current issue keeps going out', day1.action === 'continue' && day1.issue.id === 'a', J(day1));
  const day2 = plan([A, B], { a: t0 }, t0 + 2 * DAY);
  ok('two days later → the next one starts', day2.action === 'start' && day2.issue.id === 'b', J(day2));
  ok('every issue sent → nothing (all sent)', J(plan([A, B], { a: t0, b: t0 + 2 * DAY }, t0 + 4 * DAY)) === J({ action: 'nothing', reason: 'all-sent' }));
  ok('every 3 days: day 2 still continues', plan([A, B], { a: t0 }, t0 + 2 * DAY, 3).action === 'continue');
  ok('every 3 days: day 3 starts the next', plan([A, B], { a: t0 }, t0 + 3 * DAY, 3).action === 'start');
  const redrafted = plan([{ ...A, draft: true }, B], { a: t0 }, t0 + DAY);
  ok('an issue taken back to draft mid-window is not continued, and the next waits its turn', redrafted.action === 'wait' && redrafted.current.id === 'a', J(redrafted));
  const handSent = plan([A, B, { id: 'd', subject: 'D', paragraphs: ['d'] }], { a: t0, d: t0 + 3 * DAY }, t0 + 4 * DAY);
  ok('an issue sent by hand is the current one; the schedule waits out its window', handSent.action === 'wait' || handSent.action === 'continue', J(handSent));
  const after = plan([A, B, { id: 'd', subject: 'D', paragraphs: ['d'] }], { a: t0, d: t0 + 3 * DAY }, t0 + 5 * DAY);
  ok('…then picks up the earliest one nobody has had, in list order', after.action === 'start' && after.issue.id === 'b', J(after));

  ok('NEWSLETTER_EVERY_DAYS: unset → 2', L.everyDays(undefined) === 2);
  ok('NEWSLETTER_EVERY_DAYS: "3" → 3, "0"/"x"/"1.5"/"99" → 2', L.everyDays('3') === 3 && ['0', 'x', '1.5', '99'].every((v) => L.everyDays(v) === 2));

  // A month of daily runs, each landing up to 25 minutes either side of 16:00.
  const five = ['p', 'q', 'r', 's', 't'].map((id) => ({ id, subject: id, paragraphs: [id] }));
  const started = {};
  const startDays = [];
  for (let d = 0; d < 14; d++) {
    const jitter = ((d * 37) % 51 - 25) * 60_000;
    const now = t0 + d * DAY + jitter;
    const s = plan(five, started, now);
    if (s.action === 'start') {
      started[s.issue.id] = now;
      startDays.push(d);
    }
  }
  ok('daily runs with jitter start an issue every other day: days 0, 2, 4, 6, 8', J(startDays) === J([0, 2, 4, 6, 8]), J(startDays));
}

// ── the cron ──────────────────────────────────────────────────────────
console.log('\n=== the cron ===');
Object.assign(process.env, {
  CRON_SECRET: 'cron-secret',
  EMAIL_SECRET: 'email-secret',
  RESEND_API_KEY: 're_test',
  NEXT_PUBLIC_SITE_URL: BASE,
  NEWSLETTER_POSTAL_ADDRESS: 'Socria, 1 Test St, Arlington, TX 76019, USA',
});
delete process.env.NEWSLETTER_EMAILS;
delete process.env.NEWSLETTER_EVERY_DAYS;
delete process.env.SOCRIA_EDU_DOMAINS;

const sent = [];
globalThis.fetch = async (url, init) => {
  const body = JSON.parse(init.body);
  sent.push({ to: body.to[0], subject: body.subject });
  return { ok: true, json: async () => ({ id: `em_${sent.length}` }) };
};
globalThis.__users = {
  user_ann: { firstName: 'Ann', emails: ['ann@example.com'] },
  user_bo: { firstName: 'Bo', emails: ['bo@example.com'] },
  user_cy: { firstName: 'Cy', emails: ['cy@example.com'] },
};
const subscribe = (uid) => db.rows('lifecycle_emails').push({ user_id: uid, kind: 'newsletter', created_at: 1, due_at: null, sent_at: null });
subscribe('user_ann');
subscribe('user_bo');

const run = async (q = '', bearer = 'cron-secret') => {
  const r = await cron.GET(new NextRequest(`${BASE}/api/cron/newsletter${q}`, { headers: bearer ? { authorization: `Bearer ${bearer}` } : {} }));
  return { status: r.status, j: await r.json() };
};
const got = (id) => db.rows('lifecycle_emails').filter((r) => r.kind === `newsletter:${id}`).map((r) => r.user_id).sort();

{
  const s = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;
  ok('no CRON_SECRET → 503', (await run()).status === 503);
  process.env.CRON_SECRET = s;
  ok('wrong bearer → 401', (await run('', 'nope')).status === 401);
  ok('no bearer → 401', (await run('', '')).status === 401);

  const off = await run();
  ok('switch off → quiet 200, nothing sent', off.status === 200 && off.j.off === true && sent.length === 0, J(off));

  const dry = await run('?dry=1');
  ok('a rehearsal works with the switch off', dry.status === 200 && dry.j.mode === 'rehearsal' && dry.j.action === 'start' && dry.j.issue === 'issue-a', J(dry));
  ok('…counts who would get it', dry.j.counts?.['would-send'] === 2, J(dry.j.counts));
  ok('…and sends and claims nothing', sent.length === 0 && got('issue-a').length === 0);
  ok('…and lists what is waiting after it (not the draft)', J(dry.j.waiting) === J(['issue-b']), J(dry.j.waiting));

  process.env.NEWSLETTER_EMAILS = 'on';
  delete process.env.NEWSLETTER_POSTAL_ADDRESS;
  const noPostal = await run();
  ok('a missing setting stops the send, named, before anyone is claimed', noPostal.status === 409 && noPostal.j.missing?.includes('NEWSLETTER_POSTAL_ADDRESS') && got('issue-a').length === 0, J(noPostal));
  process.env.NEWSLETTER_POSTAL_ADDRESS = 'Socria, 1 Test St, Arlington, TX 76019, USA';

  const first = await run();
  ok('day 0: the first approved issue starts and goes to every subscriber', first.j.action === 'start' && first.j.issue === 'issue-a' && first.j.counts?.sent === 2 && first.j.done === true, J(first.j));
  ok('…the ledger holds one claim per person', J(got('issue-a')) === J(['user_ann', 'user_bo']));
  ok('…the email is the issue', sent.every((m) => m.subject === 'First') && sent.length === 2);
  ok('…the answer is counts — no address, no id', !/@example\.com|user_/.test(J(first.j)));

  const again = await run();
  ok('a second run the same day sends no one a second copy', again.j.action === 'continue' && (again.j.counts?.sent ?? 0) === 0 && sent.length === 2, J(again.j));

  subscribe('user_cy');
  const late = await run();
  ok('someone who subscribes during the window gets the current issue', late.j.action === 'continue' && late.j.counts?.sent === 1 && J(got('issue-a')) === J(['user_ann', 'user_bo', 'user_cy']), J(late.j));
  ok('…and only that one', sent.at(-1).to === 'cy@example.com' && sent.length === 3);

  // two days pass: move issue A's claims back in time, as the clock would
  for (const r of db.rows('lifecycle_emails')) if (r.kind === 'newsletter:issue-a') r.created_at -= 2 * DAY;
  const next = await run();
  ok('two days later: the next approved issue starts', next.j.action === 'start' && next.j.issue === 'issue-b' && next.j.counts?.sent === 3, J(next.j));
  ok('…in list order, and the draft is not among what waits', J(next.j.waiting) === J([]), J(next.j.waiting));

  for (const r of db.rows('lifecycle_emails')) if (r.kind === 'newsletter:issue-b') r.created_at -= 2 * DAY;
  const empty = await run();
  ok('with nothing approved left, nothing goes — the schedule never invents an issue', empty.j.action === 'nothing' && empty.j.reason === 'all-sent' && sent.length === 6, J(empty.j));

  ISSUES[2] = { ...ISSUES[2], draft: false };
  const approved = await run();
  ok('approving the draft (and deploying) puts it next', approved.j.action === 'start' && approved.j.issue === 'issue-c' && approved.j.counts?.sent === 3, J(approved.j));

  process.env.NEWSLETTER_EVERY_DAYS = '3';
  for (const r of db.rows('lifecycle_emails')) if (r.kind === 'newsletter:issue-c') r.created_at -= 2 * DAY;
  ISSUES.push({ id: 'issue-d', subject: 'Fourth', paragraphs: ['Issue D.'] });
  const slower = await run();
  ok('NEWSLETTER_EVERY_DAYS=3: two days in, the next waits', slower.j.action === 'continue' && slower.j.everyDays === 3 && (slower.j.counts?.sent ?? 0) === 0, J(slower.j));
  delete process.env.NEWSLETTER_EVERY_DAYS;

  db.absent.add('lifecycle_emails');
  const down = await run();
  ok('a ledger that cannot be read → 503, nothing sent', down.status === 503 && sent.length === 9, J(down));
  db.absent.delete('lifecycle_emails');
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
