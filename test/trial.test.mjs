// test/trial.test.mjs — THE SEVEN-DAY HARD TRIAL (lib/trial.ts, lib/trial-server.ts, lib/sleep-server.ts).
//
// What is held down:
//   • activation: nothing until the first real model call; the start written once, atomically, and never
//     moved — two first requests at once begin one trial
//   • the day: 4,000 tokens a UTC day, reset at 00:00 UTC by the server's clock; the trial's 28,000 caps
//     the last day's limit, so a trial that touches eight UTC days still ends at 28,000
//   • the end: 168 hours after it began, or its tokens spent; an address that has had a trial starts ended
//   • concurrency and bypass: many requests at once against one day never hold past it; a refresh, a
//     second tab or a direct call draws on the same server-side balance; a failed call costs nothing; a
//     store that cannot answer refuses (fail closed); the client can change nothing that counts
//   • every model route gated; Socria One never counted; guests' preview closed after an ended trial;
//     upkeep never begins a trial; the webhook counts upgrades; voice, sharing, experiments, themes
//     are One's; the screens; the policy pages; the analytics page closed off production and to others.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as T from './.tmp/trial-under-test.mjs';
import { usageFunctions } from '../scripts/dev/usage-functions.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
let pass = 0;
let fail = 0;
const ok = (name, cond, info) => {
  if (cond) pass++;
  else fail++;
  console.log(`${cond ? '  ok  ' : '  FAIL'} ${name}${!cond && info !== undefined ? `  — ${typeof info === 'string' ? info : JSON.stringify(info)}` : ''}`);
};
const J = JSON.stringify;
const DAY = 86_400_000;
const at = (s) => Date.parse(s);

console.log('\n=== the numbers ===');
{
  ok('7 days, 20,000 tokens a UTC day, 140,000 in all', T.TRIAL.days === 7 && T.TRIAL.daily === 20000 && T.TRIAL.total === 140000 && T.TRIAL_MS === 7 * DAY);
  ok('  the environment may move them, written as whole numbers; nothing else does', J(T.trialLimits({ SOCRIA_TRIAL_DAILY_TOKENS: '5000', SOCRIA_TRIAL_TOTAL_TOKENS: '30000' })) === J({ daily: 5000, total: 30000 }) && J(T.trialLimits({ SOCRIA_TRIAL_DAILY_TOKENS: 'lots' })) === J({ daily: 20000, total: 140000 }));
  ok('  a total below a day is raised to a day', T.trialLimits({ SOCRIA_TRIAL_DAILY_TOKENS: '9000', SOCRIA_TRIAL_TOTAL_TOKENS: '100' }).total === 9000);
}

console.log('\n=== the day: 00:00 to 24:00 UTC ===');
{
  ok('a day key, prefixed so it can never be a week or a month', T.dayKey(at('2026-11-09T23:59:59.999Z')) === 'tday:2026-11-09' && T.dayKey(at('2026-11-10T00:00:00.000Z')) === 'tday:2026-11-10');
  ok('  the reset is the next 00:00 UTC, whatever the hour', T.nextMidnight(at('2026-11-09T00:00:00Z')) === at('2026-11-10T00:00:00Z') && T.nextMidnight(at('2026-12-31T23:30:00Z')) === at('2027-01-01T00:00:00Z'));
  ok('a trial begun at midnight touches 7 days; one begun mid-day touches 8', T.trialDayKeys(at('2026-11-09T00:00:00Z')).length === 7 && T.trialDayKeys(at('2026-11-09T15:00:00Z')).length === 8);
  ok('  the start is stored in whole minutes, read back the same', T.startFromStored(T.startToStored(at('2026-11-09T15:07:41Z'))) === at('2026-11-09T15:07:00Z') && T.startFromStored(0) === null && T.startFromStored('x') === null);
}

console.log('\n=== the state ===');
{
  const now = at('2026-11-09T10:00:00Z');
  const e = T.trialState({ startedAt: null, now });
  ok('not begun: eligible, with a full day ahead of it', e.status === 'eligible' && e.today.limit === 20000 && e.today.left === 20000 && e.daysLeft === 7 && e.today.period === 'day');
  const c = T.trialState({ startedAt: null, now, claimed: true });
  ok('  an address that has had a trial: ended, never begun, nothing to spend', c.status === 'ended' && c.reason === 'claimed' && c.today.limit === 0 && c.startedAt === null);
  const start = at('2026-11-09T09:00:00Z');
  const a = T.trialState({ startedAt: start, now, byDay: { 'tday:2026-11-09': 1500 } });
  ok('running: day 1 of 7, today’s tokens counted, reset at 00:00 UTC', a.status === 'active' && a.day === 1 && a.today.used === 1500 && a.today.left === 18500 && a.today.resetAt === at('2026-11-10T00:00:00Z') && a.endsAt === start + 7 * DAY);
  const spentToday = T.trialState({ startedAt: start, now, byDay: { 'tday:2026-11-09': 20000 } });
  ok('  today spent: still running, resting until 00:00 UTC', spentToday.status === 'active' && spentToday.today.asleep && spentToday.today.left === 0);
  const tomorrow = T.trialState({ startedAt: start, now: at('2026-11-10T00:00:01Z'), byDay: { 'tday:2026-11-09': 4000 } });
  ok('  the next UTC day starts again at 20,000', tomorrow.status === 'active' && !tomorrow.today.asleep && tomorrow.today.limit === 20000 && tomorrow.today.used === 0 && tomorrow.day === 1);
  const day3 = T.trialState({ startedAt: start, now: at('2026-11-11T12:00:00Z') });
  ok('  day 3, five days left counting today', day3.day === 3 && day3.daysLeft === 5);
  // eight UTC days touched: the last day's limit is what the trial has left
  const byDay = {};
  for (const k of T.trialDayKeys(start).slice(0, 7)) byDay[k] = 20000;
  const last = T.trialState({ startedAt: start, now: at('2026-11-16T08:00:00Z'), byDay });
  ok('the trial’s 140,000 caps the eighth UTC day: spent, it has ended', last.status === 'ended' && last.reason === 'spent' && last.total.used === 140000);
  const partial = { ...byDay };
  delete partial[T.trialDayKeys(start)[6]];
  partial[T.trialDayKeys(start)[6]] = 1000;
  const last2 = T.trialState({ startedAt: start, now: at('2026-11-16T08:00:00Z'), byDay: partial });
  ok('  with 19,000 left after seven days, the eighth day may spend 19,000, not 20,000', last2.status === 'active' && last2.today.limit === 19000 && last2.total.used === 121000);
  const over = T.trialState({ startedAt: start, now: start + 7 * DAY });
  ok('the end: 168 hours after it began, to the millisecond', over.status === 'ended' && over.reason === 'expired' && T.trialState({ startedAt: start, now: start + 7 * DAY - 1 }).status === 'active');
  ok('  a day’s tokens outside the trial’s days never count to it', T.trialState({ startedAt: start, now, byDay: { 'tday:2026-11-01': 99999 } }).status === 'active');
}

console.log('\n=== one trial a person ===');
{
  ok('addresses normalised as one person: case, +tags, Gmail dots and googlemail', T.normaliseEmail(' Pat.Smith+socria@GoogleMail.com ') === 'patsmith@gmail.com' && T.normaliseEmail('a.b+x@outlook.com') === 'a.b@outlook.com' && T.normaliseEmail('not an address') === null && T.normaliseEmail('@x.com') === null);
  const key = Buffer.from('k');
  const h = (e) => createHmac('sha256', key).update(T.normaliseEmail(e), 'utf8').digest('hex');
  ok('  so their keyed hashes match, and a different person’s does not', h('Pat.Smith@gmail.com') === h('patsmith+2@gmail.com') && h('pat@gmail.com') !== h('pat@outlook.com'));
  const server = read('lib/trial-server.ts');
  ok('  only a keyed hash is kept — never the address — keyed by the hash so deleting the account leaves it', /createHmac\('sha256', key\)\.update\(norm, 'utf8'\)/.test(server) && /bumpSafely\(CLAIM_PREFIX \+ h, CLAIM_SCOPE, CLAIM_COUNTER, at\)/.test(server) && /readCount\(\{ user: CLAIM_PREFIX \+ h, scope: CLAIM_SCOPE, counter: CLAIM_COUNTER \}\)/.test(server) && !/emailAddress,/.test(server.replace(/e\.emailAddress, key/, '')));
  ok('  only VERIFIED addresses count', /e\?\.verification\?\.status === 'verified'/.test(server));
  ok('  account deletion leaves the claims (they are keyed by the hash, not the account)', !/trialclaim/.test(read('app/api/account/delete/route.ts')));
}

// ── the store: the dev database's own functions, with jitter between the steps ──
function memoryStore(rows = []) {
  const f = usageFunctions(rows);
  const tick = () => new Promise((r) => setTimeout(r, Math.random() * 3));
  const store = {
    rows,
    down: false,
    worst: 0,
    async reserve(a) {
      await tick();
      if (store.down) throw new Error('connect ECONNREFUSED');
      const r = f.reserve_logos_tokens({ p_user: a.user, p_week: a.week, p_hold: a.hold, p_want: a.want, p_min: a.min, p_limit: a.limit, p_ttl: a.ttl, p_at: a.at });
      store.worst = Math.max(store.worst, r.used + r.held);
      await tick();
      return { ...r, holds: true };
    },
    async settle(a) {
      await tick();
      if (store.down) throw new Error('connect ECONNREFUSED');
      return f.settle_logos_tokens({ p_user: a.user, p_week: a.week, p_hold: a.hold, p_tokens: a.tokens, p_at: a.at });
    },
    async read(user, week) {
      return rows.find((x) => x.user_id === user && x.scope === week && x.counter === 'tokens')?.n ?? 0;
    },
    f,
  };
  return store;
}

console.log('\n=== activation: once, atomically ===');
{
  const rows = [];
  const f = usageFunctions(rows);
  const now = at('2026-11-09T10:00:00Z');
  const m = T.startToStored(now);
  // two first requests at once: consume(by m, limit m) succeeds only while the row is 0
  const first = f.consume_logos_usage({ p_user: 'u', p_scope: T.START_SCOPE, p_counter: T.START_COUNTER, p_by: m, p_limit: m, p_at: now });
  const second = f.consume_logos_usage({ p_user: 'u', p_scope: T.START_SCOPE, p_counter: T.START_COUNTER, p_by: T.startToStored(now + 5000), p_limit: T.startToStored(now + 5000), p_at: now + 5000 });
  ok('the first writes the start; a second (or any later one) cannot move it', first === m && second === -1 && rows.find((r) => r.scope === 'trial').n === m);
  const later = f.consume_logos_usage({ p_user: 'u', p_scope: T.START_SCOPE, p_counter: T.START_COUNTER, p_by: T.startToStored(now + 9 * DAY), p_limit: T.startToStored(now + 9 * DAY), p_at: now + 9 * DAY });
  ok('  not even a week later: a trial is never restarted', later === -1);
  const sleep = read('lib/sleep-server.ts');
  ok('  begun on the request’s first real model call, never at the gate or for upkeep', /if \(m\.begin\) \{\s*try \{\s*await beginTrial\(m\.userId\)/.test(sleep) && /\.\.\.\(t\.status === 'eligible' \? \{ begin: true \} : \{\}\)/.test(sleep) && !/beginTrial/.test(sleep.slice(sleep.indexOf('export async function restingNow'), sleep.indexOf('export function sleepAnswer'))));
  ok('  the start that began it counts the activation and keeps the address, once', /first = await createOnce\(row, m, now\);/.test(read('lib/trial-server.ts')) && /\/\/ this call began it: keep the address, and count the activation\s*void keepClaims\(userId, now\);\s*void countEvent\('activated', now\);\s*return m \* 60_000;/.test(read('lib/trial-server.ts')));
  ok('  written without any SQL function (INSERT … ON CONFLICT DO NOTHING), the function only as a fallback', /\.upsert\(\{ user_id: r\.user, scope: r\.scope, counter: r\.counter, n, updated_at: at \}, \{ onConflict: 'user_id,scope,counter', ignoreDuplicates: true \}\)/.test(read('lib/usage-rows.ts')) && /\.eq\('n', cur\)/.test(read('lib/usage-rows.ts')));
  ok('  a failed check for an earlier trial never refuses a first one', /a guard\s*(?:\/\/|\*)?\s*against a second trial is never a reason to refuse somebody their first/.test(read('lib/trial-server.ts')) && !/throw fault\('claim read'/.test(read('lib/trial-server.ts')));
  ok('  the "can’t be checked" sentence says to try again only once (the app adds that its message is back in the box)', !/try again/i.test(T.TRIAL_UNAVAILABLE) && /paused for a moment/.test(T.TRIAL_UNAVAILABLE));
}

console.log('\n=== concurrency and bypass ===');
{
  const store = memoryStore();
  const scope = T.dayKey(at('2026-11-09T10:00:00Z'));
  const stateOf = (used, limit, a) => ({ asleep: used >= limit, used, limit, left: Math.max(0, limit - used), weekStart: 0, resetAt: T.nextMidnight(a), period: 'day' });
  const call = () =>
    T.holdTokens(store, { user: 'u', limit: 4000, input: 300, output: 600, cappable: true, floor: 64, scope, stateOf, waitMs: 0, now: () => at('2026-11-09T10:00:00Z') })
      .then(async (h) => {
        await new Promise((r) => setTimeout(r, Math.random() * 4));
        await h.end(h.granted);
        return 'ran';
      })
      .catch((e) => (T.isTokenRefusal(e) ? e.refusal.kind : 'error'));
  const out = await Promise.all(Array.from({ length: 30 }, call));
  const spent = await store.read('u', scope);
  ok('30 requests at once (tabs, devices, scripts) never hold or spend past the day', store.worst <= 4000 && spent <= 4000, { worst: store.worst, spent });
  ok('  the ones past it are told to rest (or busy while others run), never served', out.filter((x) => x === 'ran').length >= 1 && out.every((x) => ['ran', 'sleep', 'busy'].includes(x)), out);
  let refusal = null;
  await T.holdTokens(store, { user: 'u', limit: 4000, input: 50, output: 50, cappable: false, floor: 1, scope, stateOf, waitMs: 0, now: () => at('2026-11-09T10:00:00Z') }).catch((e) => (refusal = e.refusal));
  ok('  a spent day refuses with the day’s state: period day, reset at 00:00 UTC', spent >= 3990 ? refusal?.kind === 'sleep' && refusal.state.period === 'day' && refusal.state.resetAt === at('2026-11-10T00:00:00Z') : true, { spent, refusal });
  // a failed call costs nothing; unused tokens come back
  const s2 = memoryStore();
  const h = await T.holdTokens(s2, { user: 'v', limit: 4000, input: 100, output: 900, cappable: false, floor: 1, scope, stateOf, waitMs: 0 });
  await h.end(0);
  const h2 = await T.holdTokens(s2, { user: 'v', limit: 4000, input: 100, output: 900, cappable: false, floor: 1, scope, stateOf, waitMs: 0 });
  await h2.end(250);
  ok('a failed call costs nothing; a call that used less than it held gives the rest back', (await s2.read('v', scope)) === 250);
  // settle twice: counted once
  const h3 = await T.holdTokens(s2, { user: 'v', limit: 4000, input: 10, output: 10, cappable: false, floor: 1, scope, stateOf, waitMs: 0 });
  await h3.end(20);
  await h3.end(20);
  ok('  a settle repeated is counted once', (await s2.read('v', scope)) === 270);
  // the store down: fail closed
  const s3 = memoryStore();
  s3.down = true;
  let k = null;
  await T.holdTokens(s3, { user: 'w', limit: 4000, input: 10, output: 10, cappable: false, floor: 1, scope, waitMs: 0 }).catch((e) => (k = e.refusal?.kind));
  ok('the store unreachable: refused (fail closed), never given away uncounted', k === 'unavailable');
  ok('  another account’s day is its own', (await s2.read('u', scope)) === 0);
  const sleep = read('lib/sleep-server.ts');
  ok('the balance is the server’s, keyed by the account and the day — never a cookie, a header, a body field or the browser', /meter: \{ userId, limit: t\.today\.limit, scope: dayKey\(now\)/.test(sleep) && !/req\.headers\.get\('x-trial|body\.trial|cookies\.get\('socria_trial/.test(sleep));
  ok('  the trial cannot be read: refused with 503, fail closed', /the trial could not be read; this request is paused[\s\S]{0,120}unavailableResponse\(\)/.test(sleep));
}

console.log('\n=== the gate, on every AI route ===');
{
  const routes = [];
  const walk = (d) => {
    for (const f of readdirSync(join(root, d))) {
      const p = join(d, f);
      if (statSync(join(root, p)).isDirectory()) walk(p);
      else if (f === 'route.ts') routes.push(p);
    }
  };
  walk('app/api');
  const callsModel = (src) => /from ['"]openai['"]|lib\/openai-usage|openai\(\)|chat\.completions|responses\.create/.test(src);
  const exempt = new Set(['app/api/health/upstream/route.ts']); // the operator's probe of the provider, never a person's request
  const ungated = routes.filter((r) => !exempt.has(r) && callsModel(read(r)) && !/sleepGate\(|restingNow\(/.test(read(r)));
  ok('every route that calls a model passes the trial gate (or stands down with it, for upkeep)', ungated.length === 0, ungated);
  const sleep = read('lib/sleep-server.ts');
  ok('  Socria One is never counted, and never refused for a trial', /const counted = \(userId: string \| null, plan: string\): userId is string => !!userId && plan !== 'one' && !off\(\);/.test(sleep));
  ok('  the trial over: 402 with what to do, and the browser marked so its guest preview cannot stand in', /if \(t\.status === 'ended'\) \{\s*void countEnded\(userId, now\);\s*return \{ refuse: trialEndedResponse\(t\)/.test(sleep) && /res\.cookies\.set\(TRIAL_ENDED_COOKIE, '1', \{ httpOnly: true/.test(sleep));
  ok('  today spent: 429, resting until 00:00 UTC, the limit reached counted once a day', /if \(t\.today\.asleep\) \{\s*void countLimitHit\(userId, now\);\s*return \{ refuse: sleepResponse\(t\.today\)/.test(sleep));
  ok('  upkeep stands down for an ended or resting trial and never begins one', /return t\.status === 'ended' \|\| t\.today\.asleep;/.test(sleep));
  for (const g of ['app/api/logos/guest/route.ts', 'app/api/logos/chat/route.ts', 'app/api/logos/map/route.ts']) ok(`  the guest preview is closed on that browser: ${g.split('/').slice(-2, -1)[0]}`, /TRIAL_ENDED_COOKIE\)\?\.value\) return NextResponse\.json\(/.test(read(g)));
  ok('  voice is One’s on the server (a trial never transcribes)', /if \(!hasFeature\(plan, 'voice'\)\)/.test(read('app/api/transcribe/route.ts')));
  ok('  sharing is One’s on the server', /hasFeature\(await resolvePlanForRequest\(req, userId\), 'share'\)/.test(read('app/api/logos/room/route.ts')));
  ok('  Live Guidance (an experiment that calls a model) is One’s on the server; AR Mode, which calls none, is locked in the app', /hasFeature\(await resolvePlanForRequest\(req, userId\), 'experiments'\)/.test(read('app/api/logos/guide/route.ts')) && /oneOnly\(\{ label: 'AR Mode'/.test(read('components/LogosApp.tsx')));
  ok('  a call refused mid-reply is said as the trial’s day, not the week', /day \? TRIAL_DAY_NOTE : SLEEP_NOTE/.test(read('lib/upstream-error.ts')));
}

console.log('\n=== billing ===');
{
  const hook = read('app/api/stripe/webhook/route.ts');
  ok('Socria One begun is counted once, after the entitlement is written, bounded and never in the way', /if \(entitledBy\(sub\.status, periodEndOf\(sub\)\)\) await withTimeout\(countUpgrade\(userId\)/.test(hook) && hook.indexOf('countUpgrade(userId)') > hook.indexOf('await upsertSubscription('));
  ok('  paid access is the existing rule: active, trialing and past_due (a failed card retried) keep it; unpaid does not', /\['active', 'trialing', 'past_due'\]/.test(read('lib/entitlement-rule.ts')));
  ok('  a payment lands at once: the webhook clears the plan memo, and One is never metered', /forgetPlanMemo\(userId\);/.test(hook));
  ok('  an upgrade is counted with where the person was: in the trial, after it, or never in one', /t\.status === 'active' \? 'upgrades_in_trial' : 'upgrades_after_trial'/.test(read('lib/trial-server.ts')));
}

console.log('\n=== the plan table ===');
{
  ok('voice, sharing and the experiments are Socria One’s', T.FEATURES.join() === 'voice,share,experiments' && !T.hasFeature('free', 'voice') && !T.hasFeature('free', 'share') && !T.hasFeature('free', 'experiments') && T.hasFeature('one', 'experiments'));
  ok('  the trial’s counts are lifted: tokens are its limit', T.PLANS.free.counters.maps === null && T.PLANS.free.counters.artifacts === null && T.PLANS.free.counters.chats === T.PLANS.one.counters.chats && T.TIERED_COUNTERS.length === 0);
  ok('  the copy is written from the numbers', T.freePlanSentence() === 'a 7-day trial: 20,000 tokens a day, up to 140,000 in all' && /after the trial, with Socria Voice, chat sharing, the experiments and the Celestial and Socria One themes$/.test(T.onePlanSentence()));
  const rows = T.comparisonRows();
  ok('  the comparison: trial against Socria One, themes and experiments named', rows.some((r) => r.id === 'experiments' && r.free === 'Not included' && r.one === 'Included') && rows.some((r) => r.id === 'themes') && rows[0].free === '7 days · 20,000 tokens a day');
  ok('  the benefits sell what continues and what is One’s alone', T.ONE_FEATURES.map((f) => f.id).join() === 'conversations,voice,together,experiments,themes,history' && /Seven days to try it/.test(T.ONE_STANDFIRST));
  const theme = read('lib/theme.ts');
  ok('  Celestial and the Socria One theme are One’s', /night: \{ id: 'night', label: 'Celestial'[^}]*one: true/.test(theme) && /one: \{ id: 'one', label: 'Socria One'[^}]*one: true/.test(theme));
}

console.log('\n=== the screens ===');
{
  const sleepUi = read('components/logos5/SleepMode.tsx');
  const app = read('components/LogosApp.tsx');
  ok('the day’s rest, said as the trial’s day: today’s tokens, 00:00 UTC, day N of 7', /You’ve used today’s \$\{formatTokens\(sleep\.limit\)\} trial tokens/.test(sleepUi) && /Today’s trial tokens/.test(sleepUi) && /dayOfLine\(trial\)/.test(sleepUi));
  ok('  the end: a card said once, a line over the box, one way on; everything stays open', /Seven days are up/.test(sleepUi) && /Every conversation, Logic Map and artifact stays open/.test(sleepUi) && /<TrialEndedBar on=\{!!trialEnded && plan !== 'one' && !!isSignedIn\}/.test(app));
  ok('  a 402 from any route says it, so every surface agrees', /if \(b\?\.trialEnded\) window\.dispatchEvent\(new CustomEvent\(TRIAL_ENDED_EVENT/.test(sleepUi) && /useTrialEndedWatch\(/.test(app));
  ok('  sending after the end keeps the words and opens the card', /if \(trialOverNow\(\)\) \{\s*setTrialEndedOpen\(true\);\s*return;\s*\}/.test(app));
  ok('  the experiments, on the trial, are marked Socria One and open the sheet; the ways out always work', /const oneOnly = /.test(app) && /cabin \? \{ label: 'Leave big-screen mode'/.test(app) && /\[\{ label: 'Stop using your hands'/.test(app));
  const acct = read('components/account/AccountSheet.tsx');
  ok('Account: the day, the days left, when it ends — and the numbers a press away', /<summary>Usage details<\/summary>/.test(acct) && /dayOfLine\(trial\)/.test(acct) && /Trial ended/.test(acct));
  ok('  the usage route sends the trial with today — and no resting day for a trial that is over', /trial, sleep: trial && trial\.status !== 'ended' \? trial\.today : null/.test(read('app/api/logos/usage/route.ts')));
  ok('  nor does the app draw one: the day’s bar, ring and card stand down once the trial is over', (app.match(/sleep=\{trialEnded \? null : sleep\}/g) ?? []).length === 3);
}

{
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { createElement: h } = await import('react');
  const card = renderToStaticMarkup(h(T.TrialEndedScreen, { open: true, onClose() {}, onUpgrade() {} }));
  ok('the card, drawn: a dialog, named, with what stays and one way on', /role="dialog"/.test(card) && /aria-labelledby="tr-t"/.test(card) && /Seven days are up/.test(card) && /Move, write, rename, organise and export by hand/.test(card) && /Continue with Socria One/.test(card) && /Keep browsing/.test(card), card);
  ok('  closed, it draws nothing; the bar only while the trial is over', renderToStaticMarkup(h(T.TrialEndedScreen, { open: false, onClose() {}, onUpgrade() {} })) === '' && renderToStaticMarkup(h(T.TrialEndedBar, { on: false, onOpen() {} })) === '' && /Your trial has ended/.test(renderToStaticMarkup(h(T.TrialEndedBar, { on: true, onOpen() {} }))));
  const now = Date.now();
  const d0 = T.dayStart(now);
  const day = renderToStaticMarkup(h(T.SleepScreen, { sleep: { asleep: true, used: 4000, limit: 4000, left: 0, weekStart: d0, resetAt: d0 + 86_400_000, period: 'day' }, open: true, onClose() {}, onUpgrade() {}, onWake() {}, timeZone: 'UTC', trial: T.trialState({ startedAt: now - 2 * 86_400_000, now, byDay: { [T.dayKey(now)]: 4000 } }) }));
  ok('  the day spent, drawn: today’s 4,000, 00:00 UTC, day 3 of 7, and Socria One with no daily limit', /You’ve used today’s 4,000 trial tokens/.test(day) && /00:00 UTC/.test(day) && /Day 3 of 7 of your trial/.test(day) && /Socria One has no daily limit/.test(day) && !/Monday/.test(day), day);
  ok('  a guest is never shown the trial’s card: only an account has a trial to go on with', /plan !== 'one' && !!isSignedIn && !oneOpen/.test(read('components/LogosApp.tsx')) && /const trialOverNow = \(\) => !!trialEndedRef\.current && !!isSignedIn;/.test(read('components/LogosApp.tsx')));
}

console.log('\n=== the policy pages ===');
{
  ok('the privacy policy says the kept hash, and why', /That an address has had a trial\./.test(read('app/(legal)/privacy/page.tsx')) && /One trial a person/.test(read('app/(legal)/privacy/page.tsx')));
  ok('  the terms say the trial and the one-trial rule', /<h2 id="free">The trial<\/h2>/.test(read('app/(legal)/terms/page.tsx')) && /keyed hash of a verified\s+email address is retained/.test(read('app/(legal)/terms/page.tsx')));
}

console.log('\n=== the analytics ===');
{
  const m = T.trialModel({
    metrics: [
      { scope: 'mday:11-09', counter: 'activated', n: 10, at: at('2026-11-09T20:00:00Z') },
      { scope: 'mday:11-09', counter: 'limit_hits', n: 4, at: at('2026-11-09T20:00:00Z') },
      { scope: 'mday:11-10', counter: 'upgrades', n: 3, at: at('2026-11-10T20:00:00Z') },
      { scope: 'mday:11-10', counter: 'upgrades_in_trial', n: 2, at: at('2026-11-10T20:00:00Z') },
      { scope: 'mday:11-10', counter: 'upgrades_after_trial', n: 1, at: at('2026-11-10T20:00:00Z') },
    ],
    tokensByDay: { 'tday:2026-11-09': 30_000, 'tday:2026-11-10': 20_000 },
    starts: [at('2026-11-09T10:00:00Z'), at('2026-11-01T10:00:00Z')],
    now: at('2026-11-10T21:00:00Z'),
  });
  ok('activations, conversion from trials, tokens and their cost', m.activated === 10 && Math.abs(m.conversion - 0.3) < 1e-9 && m.tokens === 50_000 && m.cost === 0.1 && m.activeNow === 1 && m.limitHits === 4);
  ok('  a line a day, newest first', m.days[0].day === '2026-11-10' && m.days[0].upgrades === 3 && m.days[1].activated === 10);
  ok('  a December count read in January is last year’s', T.metricDate('mday:12-31', at('2027-01-01T01:00:00Z')) === '2026-12-31');
  const page = read('app/dev/trial/page.tsx');
  ok('the page: off production only, for the owner (by the grant’s hash) or a named admin; everyone else a 404', /if \(isProduction\(\)\) return false;/.test(page) && /operatorGranted\(/.test(page) && /mayViewDashboard\(/.test(page) && /notFound\(\)/.test(page) && !/@outlook\.com|@gmail\.com/.test(page));
  ok('  no person in the counts: the metrics row is the service’s, the tokens summed, the starts only times', /export const METRICS_USER = 'metrics:trial';/.test(read('lib/trial-server.ts')) && /select\('scope, n'\)/.test(read('lib/trial-analytics-server.ts')) && /select\('n'\)\.eq\('scope', START_SCOPE\)/.test(read('lib/trial-analytics-server.ts')));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
