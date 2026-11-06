// test/weekly-tokens.test.mjs — SLEEP MODE'S WEEK, ITS COUNTING RULE, AND HOLDING TOKENS STRICTLY.
//
// What is held down, without a network:
//   • the week: Monday 00:00:00.000 UTC to the next Monday, across the last
//     millisecond of a Sunday, months, years, leap years and every hour of
//     four years; the limit and its one environment switch; the words;
//   • what a call is counted at: the input read afresh (never what the prompt
//     cache served) plus what it wrote;
//   • holding and settling (lib/token-allowance.ts) against the same usage
//     functions the dev database and the route suites run
//     (scripts/dev/usage-functions.mjs, the semantics of
//     supabase/weekly-tokens.sql): N requests at once at the edge never hold
//     more than the week has free, and never spend past it when each costs
//     what it held; a naive read-then-spend store, run the same way, does —
//     so the test can tell; one account's balance is the same in every
//     session; a store that is down refuses (fail closed); a settle is
//     counted once; a hold that never settles stops counting; a call that
//     waits for the person's other calls, and one told busy;
//   • the call wrapper (lib/openai-usage.ts): held before the provider is
//     asked, capped where it can be shortened, settled at the counted tokens,
//     nothing for a failure, once for a refused parameter asked again, an
//     estimate for a stream stopped early;
//   • whose request a call is (lib/token-meter.ts): uncounted() hides it.

import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as S from './.tmp/sleep.mjs';
import * as A from './.tmp/token-allowance.mjs';
import * as U from './.tmp/openai-usage.mjs';
import * as M from './.tmp/token-meter.mjs';
import { usageFunctions } from '../scripts/dev/usage-functions.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
let pass = 0;
let fail = 0;
const ok = (name, cond, info) => {
  if (cond) pass++;
  else fail++;
  console.log(`${cond ? '  ok  ' : '  FAIL'} ${name}${!cond && info !== undefined ? `  — ${typeof info === 'string' ? info : JSON.stringify(info)}` : ''}`);
};
const iso = (t) => new Date(t).toISOString();
const DAY = 86_400_000;
const WEEK = 7 * DAY;

console.log('\n=== the week, in numbers (lib/sleep.ts) ===');
{
  ok('30,000 tokens a week', S.WEEKLY_TOKENS === 30_000 && S.weeklyLimit({}) === 30_000);
  ok(
    '  SOCRIA_FREE_WEEKLY_TOKENS moves it, written as a positive whole number — nothing else does',
    S.weeklyLimit({ SOCRIA_FREE_WEEKLY_TOKENS: '50000' }) === 50_000 &&
      S.weeklyLimit({ SOCRIA_FREE_WEEKLY_TOKENS: ' 45000 ' }) === 45_000 &&
      ['lots', '-5', '0', '1e5', '12.5', '30,000', ''].every((v) => S.weeklyLimit({ SOCRIA_FREE_WEEKLY_TOKENS: v }) === 30_000) &&
      S.weeklyLimit({ SOCRIA_FREE_WEEKLY_TOKENS: '99999999999' }) === 2_000_000_000
  );
  ok('  and the daily switch is gone: SOCRIA_FREE_DAILY_TOKENS moves nothing', S.weeklyLimit({ SOCRIA_FREE_DAILY_TOKENS: '90000' }) === 30_000 && !('DAILY_TOKENS' in S) && !('dailyLimit' in S));

  const lastMs = Date.UTC(2026, 10, 8, 23, 59, 59, 999); // Sunday 8 November 2026
  const monday = Date.UTC(2026, 10, 9); // Monday 9 November 2026
  ok('the last millisecond of a Sunday is the old week', S.weekStart(lastMs) === Date.UTC(2026, 10, 2) && S.resetAt(lastMs) === monday, [iso(S.weekStart(lastMs)), iso(S.resetAt(lastMs))]);
  ok('  Monday 00:00:00.000 UTC begins the new one', S.weekStart(monday) === monday && S.resetAt(monday) === Date.UTC(2026, 10, 16));
  ok('  and they are different weeks in the table', S.weekKey(lastMs) === 'week:2026-11-02' && S.weekKey(monday) === 'week:2026-11-09');
  ok('a Wednesday afternoon belongs to its Monday', S.weekStart(Date.UTC(2026, 10, 4, 15, 30)) === Date.UTC(2026, 10, 2));
  ok('across a month: Wednesday 2 December 2026 began on Monday 30 November', S.weekStart(Date.UTC(2026, 11, 2, 9)) === Date.UTC(2026, 10, 30) && S.resetAt(Date.UTC(2026, 11, 2, 9)) === Date.UTC(2026, 11, 7) && S.weekKey(Date.UTC(2026, 11, 2)) === 'week:2026-11-30');
  ok(
    'across a year: New Year’s Day 2027 (a Friday) began on Monday 28 December 2026, and resets Monday 4 January',
    S.weekStart(Date.UTC(2027, 0, 1, 12)) === Date.UTC(2026, 11, 28) && S.resetAt(Date.UTC(2027, 0, 1, 12)) === Date.UTC(2027, 0, 4)
  );
  ok('  Friday 31 December 2027 resets on Monday 3 January 2028', S.resetAt(Date.UTC(2027, 11, 31, 23, 59, 59, 999)) === Date.UTC(2028, 0, 3));
  ok(
    'leap years: Tuesday 29 February 2028 is in the week of Monday 28 February, which resets on Monday 6 March',
    new Date(Date.UTC(2028, 1, 29)).getUTCDay() === 2 && S.weekStart(Date.UTC(2028, 1, 29, 18)) === Date.UTC(2028, 1, 28) && S.resetAt(Date.UTC(2028, 1, 29, 18)) === Date.UTC(2028, 2, 6)
  );
  ok('  Thursday 29 February 2024: the week of Monday 26 February, reset Monday 4 March', S.weekStart(Date.UTC(2024, 1, 29)) === Date.UTC(2024, 1, 26) && S.resetAt(Date.UTC(2024, 1, 29)) === Date.UTC(2024, 2, 4));
  ok(
    'UTC keeps no summer time: the clocks changing in Europe and America move nothing',
    [Date.UTC(2026, 2, 29, 1, 30), Date.UTC(2026, 2, 8, 7, 30), Date.UTC(2026, 9, 25, 0, 59), Date.UTC(2026, 10, 1, 6, 30)].every((t) => {
      const s = S.weekStart(t);
      return new Date(s).getUTCDay() === 1 && s % DAY === 0 && S.resetAt(t) - s === WEEK;
    })
  );
  let broken = null;
  for (let t = Date.UTC(2025, 11, 29); t < Date.UTC(2029, 11, 31) && !broken; t += 3600_000 + 37_000) {
    const s = S.weekStart(t);
    const r = S.resetAt(t);
    if (new Date(s).getUTCDay() !== 1 || s % DAY !== 0 || !(s <= t && t < r) || r - s !== WEEK || S.weekStart(r) !== r || S.weekKey(t) !== `week:${iso(s).slice(0, 10)}`) broken = iso(t);
  }
  ok('every hour of four years: the week starts on a Monday at 00:00 UTC, holds the moment, lasts 7 × 24 h, and the reset begins the next', broken === null, broken);
  ok('the week’s key can never be read as a month, a day or a conversation', /^week:\d{4}-\d{2}-\d{2}$/.test(S.weekKey(Date.now())));

  const t = Date.UTC(2026, 10, 6, 19, 47); // Friday
  ok('29,999 is awake; 30,000 is asleep; what is left never goes below nothing', !S.sleepState(29_999, 30_000, t).asleep && S.sleepState(30_000, 30_000, t).asleep && S.sleepState(31_200, 30_000, t).left === 0);
  const st = S.sleepState(17_600, 30_000, t);
  ok('  the state carries the week it is in and when it resets', st.weekStart === Date.UTC(2026, 10, 2) && st.resetAt === Date.UTC(2026, 10, 9) && st.left === 12_400);
}

console.log('\n=== the words ===');
{
  ok(
    'how long until the reset',
    S.wakesIn(2 * DAY + 4 * 3600_000 + 5 * 60_000) === '2 days 4 h' &&
      S.wakesIn(DAY) === '1 day' &&
      S.wakesIn(6 * DAY + 23 * 3600_000 + 59 * 60_000 + 1) === '7 days' &&
      S.wakesIn(6 * DAY + 23 * 3600_000) === '6 days 23 h' &&
      S.wakesIn(5 * 3600_000 + 12 * 60_000) === '5 h 12 min' &&
      S.wakesIn(38 * 60_000) === '38 min' &&
      S.wakesIn(3600_000) === '1 h' &&
      S.wakesIn(20_000) === 'less than a minute' &&
      S.wakesIn(-1) === 'any moment',
    [S.wakesIn(2 * DAY + 4 * 3600_000 + 5 * 60_000), S.wakesIn(6 * DAY + 23 * 3600_000)]
  );
  const now = Date.UTC(2026, 10, 9) - (2 * DAY + 4 * 3600_000); // two days and four hours before the reset
  const st = S.sleepState(17_600, 30_000, now);
  ok('the allowance in one line, as the account sees it', S.allowanceLine(st, now) === '12,400 of 30,000 left this week · resets Monday 00:00 UTC (in 2 days 4 h)', S.allowanceLine(st, now));
  ok('  spent, it says so', S.leftLine(S.sleepState(30_400, 30_000, now)) === 'This week’s 30,000 tokens are used');
  // (newer ICU puts a narrow no-break space before AM/PM; any space is a space here)
  const said = (tz) => S.localReset(Date.UTC(2026, 10, 9), { locale: 'en-US', timeZone: tz }).replace(/\s/g, ' ');
  ok('the reset in their own time: Monday 00:00 UTC is Sunday 6:00 PM in Chicago in November', said('America/Chicago') === 'Sunday 6:00 PM', said('America/Chicago'));
  ok('  and 9:00 AM on Monday in Tokyo', said('Asia/Tokyo') === 'Monday 9:00 AM');
  ok('  nothing extra where their time is UTC itself, or no zone can be read', S.localReset(Date.UTC(2026, 10, 9), { timeZone: 'UTC' }) === '' && S.localReset(Date.UTC(2026, 10, 9), { timeZone: 'Not/AZone' }) === '');
  const r = S.sleepRefusal(S.sleepState(30_400, 30_000, now));
  ok('a refusal carries the week’s state, so any screen can count down', r.sleep === true && r.resetAt === Date.UTC(2026, 10, 9) && r.weekStart === Date.UTC(2026, 10, 2) && r.used === 30_400 && r.limit === 30_000 && r.left === 0);
  const words = [S.SLEEP_NOTE, S.TOKENS_BUSY, S.TOKENS_UNAVAILABLE, S.allowanceLine(st, now), S.leftLine(S.sleepState(30_400, 30_000, now))].join(' ');
  ok('  every sentence is about the week: no “today”, “tomorrow”, “midnight”, “daily” or “a day”', /this week/.test(S.SLEEP_NOTE) && /Monday 00:00 UTC/.test(S.SLEEP_NOTE) && !/\b(today|tomorrow|midnight|daily|tonight)\b|\ba day\b|\bday['’]s\b/i.test(words), words);
}

console.log('\n=== what a call is counted at ===');
{
  ok('input read afresh plus output: what the prompt cache served is not counted', S.countedTokens({ prompt_tokens: 20_000, completion_tokens: 612, prompt_tokens_details: { cached_tokens: 19_456 } }) === 1_156);
  ok('  nothing cached: all of it', S.countedTokens({ prompt_tokens: 1_200, completion_tokens: 300 }) === 1_500);
  ok('  a cache report larger than the input never counts below zero', S.countedTokens({ prompt_tokens: 100, completion_tokens: 50, prompt_tokens_details: { cached_tokens: 999 } }) === 50);
  ok('  reasoning is output, and counts (the provider bills it)', S.countedTokens({ prompt_tokens: 100, completion_tokens: 900, completion_tokens_details: { reasoning_tokens: 800 } }) === 1_000);
  ok('  no report, or nonsense, is nothing', S.countedTokens(null) === 0 && S.countedTokens({ prompt_tokens: -4, completion_tokens: NaN }) === 0);
  ok('an estimate: about four bytes a token, in UTF-8', A.estimateTokens('abcd'.repeat(25)) === 25 && A.estimateTokens('') === 0 && A.utf8Length('é') === 2 && A.utf8Length('漢') === 3 && A.utf8Length('😀') === 4);
  const req = { messages: [{ role: 'system', content: 'x'.repeat(400) }, { role: 'user', content: [{ type: 'text', text: 'y'.repeat(40) }, { type: 'image_url', image_url: { url: 'data:', detail: 'high' } }] }] };
  ok('  a request: its messages’ text, a fixed allowance an image, a little for the framing', A.requestTokens(req) === 3 + (4 + 100) + (4 + 10 + A.IMAGE_TOKENS), A.requestTokens(req));
  ok('  a hold is the input with its margin, plus the most it may write', A.wantFor(1_000, 500) === 1_700 && A.wantFor(0, 0) === 1);
}

// ── an in-memory store over the dev functions, with the network's jitter between the steps ──
function memoryStore(rows = [], o = {}) {
  const f = usageFunctions(rows);
  const tick = () => new Promise((r) => setTimeout(r, o.jitter === false ? 0 : Math.random() * 3));
  const store = {
    rows,
    down: false,
    settleFails: 0,
    reserves: 0,
    settles: 0,
    worst: 0,
    limit: null,
    async reserve(a) {
      await tick();
      if (store.down) throw new Error('connect ECONNREFUSED');
      store.reserves++;
      const r = f.reserve_logos_tokens({ p_user: a.user, p_week: a.week, p_hold: a.hold, p_want: a.want, p_min: a.min, p_limit: a.limit, p_ttl: a.ttl, p_at: a.at });
      // what was ever held or settled at once, for the edge tests
      store.worst = Math.max(store.worst, r.used + r.held);
      await tick();
      return { ...r, holds: true };
    },
    async settle(a) {
      await tick();
      if (store.down) throw new Error('connect ECONNREFUSED');
      if (store.settleFails > 0) {
        store.settleFails--;
        // the write went through, but the answer was lost on the way back
        f.settle_logos_tokens({ p_user: a.user, p_week: a.week, p_hold: a.hold, p_tokens: a.tokens, p_at: a.at });
        throw new Error('socket hang up');
      }
      store.settles++;
      return f.settle_logos_tokens({ p_user: a.user, p_week: a.week, p_hold: a.hold, p_tokens: a.tokens, p_at: a.at });
    },
    async read(user, week) {
      await tick();
      if (store.down) throw new Error('connect ECONNREFUSED');
      return rows.find((x) => x.user_id === user && x.scope === week && x.counter === 'tokens')?.n ?? 0;
    },
  };
  return store;
}
const settledOf = (store, user, at = Date.now()) => store.rows.find((x) => x.user_id === user && x.scope === S.weekKey(at) && x.counter === 'tokens')?.n ?? 0;
const holdsOf = (store, user) => store.rows.filter((x) => x.user_id === user && x.scope.startsWith('tokhold:')).length;
const setUsed = (store, user, n, at = Date.now()) => {
  const r = store.rows.find((x) => x.user_id === user && x.scope === S.weekKey(at) && x.counter === 'tokens');
  if (r) r.n = n;
  else store.rows.push({ user_id: user, scope: S.weekKey(at), counter: 'tokens', n, updated_at: at });
};
const refusalOf = async (p) => {
  try {
    await p;
    return null;
  } catch (e) {
    return A.isTokenRefusal(e) ? e.refusal : { kind: 'thrown', e };
  }
};
const base = (store, user, extra = {}) => ({ user, limit: 30_000, input: 1_000, output: 500, cappable: false, floor: 300, waitMs: 0, ...extra });

console.log('\n=== one call: held, then settled at what it cost (lib/token-allowance.ts) ===');
{
  const store = memoryStore();
  const h = await A.holdTokens(store, base(store, 'ann'));
  ok('held in full when the week has room: its input with the margin, plus its output', h.granted === 1_700 && holdsOf(store, 'ann') === 1 && settledOf(store, 'ann') === 0, h);
  await h.end(640);
  ok('  settled at what it cost: the hold released, 640 added', settledOf(store, 'ann') === 640 && holdsOf(store, 'ann') === 0);
  await h.end(640);
  ok('  ending twice counts once', settledOf(store, 'ann') === 640 && store.settles === 1);
  const f = await A.holdTokens(store, base(store, 'ann'));
  await f.end(0);
  ok('a call that never answered costs nothing, and gives its hold back', settledOf(store, 'ann') === 640 && holdsOf(store, 'ann') === 0);
}

console.log('\n=== at the edge: what is left, capped, and the one call that may run past it ===');
{
  const store = memoryStore();
  setUsed(store, 'bo', 29_500);
  const h = await A.holdTokens(store, base(store, 'bo', { input: 2_000, output: 1_200, cappable: true }));
  ok('a call wanting more than is left holds what is left', h.granted === 500, h);
  ok('  and a reply is capped to what is left — with a floor, so an answer is never a stub', h.outputCap === 500);
  const tiny = memoryStore();
  setUsed(tiny, 'bo', 29_990);
  const t = await A.holdTokens(tiny, base(tiny, 'bo', { input: 2_000, output: 1_200, cappable: true, floor: 300 }));
  ok('  ten tokens left: the floor holds (300)', t.granted === 10 && t.outputCap === 300, t);
  const json = await A.holdTokens(memoryStore([{ user_id: 'bo', scope: S.weekKey(Date.now()), counter: 'tokens', n: 29_500, updated_at: 0 }]), base(store, 'bo', { input: 2_000, output: 1_200, cappable: false }));
  ok('  a JSON call keeps its own cap: a cut-off answer is no answer', json.outputCap === null && json.granted === 500);
  const roomy = await A.holdTokens(memoryStore(), base(store, 'bo', { cappable: true }));
  ok('  with room to spare nothing is capped', roomy.outputCap === null);
  await h.end(2_600);
  ok('the call that read more than was left is recorded as it was: the week ends a little past its limit', settledOf(store, 'bo') === 32_100);
  const after = await refusalOf(A.holdTokens(store, base(store, 'bo')));
  ok('  and from then on Socria rests: refused before any model, with the week’s state', after?.kind === 'sleep' && after.state.asleep === true && after.state.used === 32_100 && after.state.resetAt === S.resetAt(Date.now()), after);
}

console.log('\n=== N requests at once at the edge never hold, or spend, more than is free ===');
{
  const N = 24;
  const store = memoryStore();
  setUsed(store, 'cy', 28_000);
  const tries = await Promise.all(Array.from({ length: N }, () => refusalOf(A.holdTokens(store, base(store, 'cy', { input: 250, output: 200 })))));
  const held = store.rows.filter((x) => x.user_id === 'cy' && x.scope.startsWith('tokhold:')).reduce((s, x) => s + x.n, 0);
  const admitted = tries.filter((r) => r === null).length;
  ok(`${N} at once with 2,000 free and 500 each: exactly 4 are held, the rest told busy — none past the limit`, admitted === 4 && held === 2_000 && tries.filter((r) => r?.kind === 'busy').length === N - 4, { admitted, held });
  ok('  at no moment did settled + held pass the limit', store.worst <= 30_000, store.worst);

  // the same, end to end: each request holds, runs, and settles at no more than it held — waiting for
  // the others when it must — and the week ends at or under the limit
  const run = memoryStore();
  setUsed(run, 'di', 26_000);
  const costs = [];
  const results = await Promise.all(
    Array.from({ length: N }, async (_, i) => {
      try {
        const h = await A.holdTokens(run, base(run, 'di', { input: 250, output: 200, waitMs: 3_000 }));
        await new Promise((r) => setTimeout(r, 5 + (i % 7)));
        const cost = Math.min(h.granted, 380 + (i % 5) * 10);
        costs.push(cost);
        await h.end(cost);
        return 'ran';
      } catch (e) {
        return A.isTokenRefusal(e) ? e.refusal.kind : 'thrown';
      }
    })
  );
  ok('  run to the end: the week ends at or under 30,000', settledOf(run, 'di') <= 30_000 && settledOf(run, 'di') === 26_000 + costs.reduce((s, c) => s + c, 0), settledOf(run, 'di'));
  ok('  every request ran or was refused cleanly — none thrown, none counted twice', results.every((r) => r === 'ran' || r === 'sleep' || r === 'busy') && results.filter((r) => r === 'ran').length === costs.length, results);
  ok('  and the holds and the week together never passed the limit', run.worst <= 30_000, run.worst);

  // what the test would see without the atomic hold: a store that reads, then adds — as a request that
  // checks the count and spends after the model answers does
  const naive = { used: 28_000, worst: 28_000 };
  const naiveSpend = async () => {
    const seen = naive.used;
    await new Promise((r) => setTimeout(r, Math.random() * 5));
    if (seen >= 30_000) return 'refused';
    naive.used += 500;
    naive.worst = Math.max(naive.worst, naive.used);
    return 'ran';
  };
  const ran = (await Promise.all(Array.from({ length: N }, naiveSpend))).filter((r) => r === 'ran').length;
  ok('  (read-then-spend, run the same way, lets them all through: the test can tell the difference)', ran === N && naive.used === 28_000 + N * 500, { ran, used: naive.used });
}

console.log('\n=== one account, every session: a refresh, a second tab, a second device ===');
{
  const store = memoryStore();
  setUsed(store, 'eve', 20_000);
  const tab1 = await A.holdTokens(store, base(store, 'eve', { input: 4_000, output: 1_000 }));
  // a refresh, or a second tab, or a phone: a new request, the same account
  const tab2 = await A.holdTokens(store, base(store, 'eve', { input: 4_000, output: 1_000 }));
  ok('two sessions draw on one balance: the second holds only what the first left', tab1.granted === 5_800 && tab2.granted === 4_200, [tab1.granted, tab2.granted]);
  const third = await refusalOf(A.holdTokens(store, base(store, 'eve', { input: 10 })));
  ok('  a third, while both run, waits its turn — and is told busy, not handed tokens', third?.kind === 'busy', third);
  const other = await A.holdTokens(store, base(store, 'fay', { input: 4_000, output: 1_000 }));
  ok('  another account is untouched by it', other.granted === 5_800);
  await tab1.end(3_000);
  await tab2.end(2_000);
  ok('  both settle into the one week', settledOf(store, 'eve') === 25_000);
}

console.log('\n=== the store down: fail closed, said plainly ===');
{
  // a fixed Wednesday, so ten minutes on is still the same week whenever the suite runs
  const t0 = Date.UTC(2026, 10, 4, 12);
  const at = (t) => () => t;
  const store = memoryStore();
  store.down = true;
  const r = await refusalOf(A.holdTokens(store, base(store, 'gus', { now: at(t0) })));
  ok('a store that cannot be reached refuses the call — never lets it through uncounted', r?.kind === 'unavailable', r);
  store.down = false;
  const h = await A.holdTokens(store, base(store, 'gus', { now: at(t0) }));
  store.settleFails = 1;
  const h2 = await A.holdTokens(store, base(store, 'gus', { now: at(t0) }));
  await h2.end(300);
  ok('a settle whose answer was lost is sent again, and counted once (the database adds only with the hold)', settledOf(store, 'gus', t0) === 300 && holdsOf(store, 'gus') === 1, [settledOf(store, 'gus', t0), holdsOf(store, 'gus')]);
  store.down = true;
  let back = false;
  await h.end(500).then(() => (back = true));
  ok('  a settle that cannot be written at all never throws into the reply', back);
  store.down = false;
  const later = t0 + A.HOLD_TTL_MS + 1_000;
  const r2 = await A.holdTokens(store, base(store, 'gus', { now: at(later) }));
  ok('  and its hold stops counting after ten minutes: the person is never charged for it', holdsOf(store, 'gus') === 1 && r2.granted === 1_700 && settledOf(store, 'gus', t0) === 300, [holdsOf(store, 'gus'), r2.granted]);
  const told = [];
  const s2 = memoryStore();
  const h3 = await A.holdTokens(s2, base(s2, 'gus', { onLost: (t) => told.push(t), wait: () => Promise.resolve() }));
  s2.down = true;
  await h3.end(777);
  ok('  the loss is said in the log, with the tokens', told[0] === 777);
}

console.log('\n=== nothing free while the person’s other calls run: a short wait, then busy or Sleep ===');
{
  const store = memoryStore();
  setUsed(store, 'hal', 28_000);
  const reply = await A.holdTokens(store, base(store, 'hal', { input: 1_500, output: 600 }));
  ok('their reply holds every token left', reply.granted === 2_000);
  setTimeout(() => void reply.end(700), 60);
  const map = await A.holdTokens(store, base(store, 'hal', { input: 900, output: 300, waitMs: 2_000 }));
  ok('  the map pass waits for the reply to settle, then holds what is really left', map.granted === 1_300, map.granted);
  await map.end(1_100);
  const stuck = memoryStore();
  setUsed(stuck, 'ivy', 29_000);
  await A.holdTokens(stuck, base(stuck, 'ivy'));
  const started = Date.now();
  const busy = await refusalOf(A.holdTokens(stuck, base(stuck, 'ivy', { waitMs: 150 })));
  ok('  a call that never settles: busy after the wait — not Sleep, the week is not spent', busy?.kind === 'busy' && Date.now() - started >= 140, busy);
  const spent = memoryStore();
  setUsed(spent, 'jo', 30_000);
  const sl = await refusalOf(A.holdTokens(spent, base(spent, 'jo', { waitMs: 5_000 })));
  ok('  a spent week is Sleep at once, without waiting', sl?.kind === 'sleep');
}

console.log('\n=== the week a call settles into is the week it began in ===');
{
  const store = memoryStore();
  let clock = Date.UTC(2026, 10, 8, 23, 59, 59, 900);
  const h = await A.holdTokens(store, base(store, 'kim', { now: () => clock }));
  clock = Date.UTC(2026, 10, 9, 0, 0, 0, 100);
  await h.end(1_234);
  ok('a reply that ran across Monday 00:00 UTC is last week’s', settledOf(store, 'kim', Date.UTC(2026, 10, 8)) === 1_234 && settledOf(store, 'kim', Date.UTC(2026, 10, 9)) === 0);
}

console.log('\n=== the older counter, until supabase/weekly-tokens.sql is run ===');
{
  const rows = [];
  const f = usageFunctions(rows);
  const counter = {
    async reserve(a) {
      const used = rows.find((x) => x.user_id === a.user && x.scope === a.week)?.n ?? 0;
      const free = a.limit - used;
      if (free < 1) return { granted: 0, used, held: 0, holds: false };
      const take = Math.min(a.want, free);
      const n = f.consume_logos_usage({ p_user: a.user, p_scope: a.week, p_counter: 'tokens', p_by: take, p_limit: a.limit, p_at: a.at });
      return n === -1 ? { granted: 0, used, held: 0, holds: false } : { granted: take, used: n - take, held: take, holds: false };
    },
    async settle(a) {
      const d = a.tokens - a.reserved;
      return d < 0 ? f.refund_logos_usage({ p_user: a.user, p_scope: a.week, p_counter: 'tokens', p_by: -d }) : f.bump_logos_usage({ p_user: a.user, p_scope: a.week, p_counter: 'tokens', p_by: d, p_at: a.at });
    },
    async read() {
      return 0;
    },
  };
  const h = await A.holdTokens(counter, base(counter, 'lu'));
  const week = () => rows.find((x) => x.user_id === 'lu')?.n ?? 0;
  ok('a hold is part of the week until it settles', week() === 1_700);
  await h.end(400);
  ok('  settled: what it did not use is given back', week() === 400);
  rows.find((x) => x.user_id === 'lu').n = 30_000;
  const r = await refusalOf(A.holdTokens(counter, base(counter, 'lu', { waitMs: 1_000 })));
  ok('  as strict at the limit: Sleep, at once', r?.kind === 'sleep');
}

console.log('\n=== the call wrapper (lib/openai-usage.ts): held, capped, settled ===');
{
  const events = [];
  let refuse = null;
  let cap = null;
  U.onMetering({
    async begin(call) {
      events.push(['begin', call]);
      if (refuse) throw refuse;
      return { outputCap: cap, end: (t) => events.push(['end', t]) };
    },
  });
  const client = (script) => {
    const seen = [];
    return {
      seen,
      chat: {
        completions: {
          create: async (p) => {
            seen.push(p);
            const step = script.shift();
            if (step instanceof Error) throw step;
            return typeof step === 'function' ? step(p) : step;
          },
        },
      },
    };
  };
  const quiet = console.info;
  console.info = () => {};
  console.warn = () => {};

  const c1 = client([{ usage: { prompt_tokens: 5_000, completion_tokens: 300, prompt_tokens_details: { cached_tokens: 4_600 } }, choices: [{ message: { content: 'ok' } }] }]);
  await U.tracked(c1, 'logos/read').chat.completions.create({ model: 'm', max_tokens: 420, messages: [{ role: 'user', content: 'x'.repeat(400) }] });
  ok('held before the provider is asked: its input estimated, its cap, plain text so it may be shortened', events[0][0] === 'begin' && events[0][1].input === 3 + 4 + 100 && events[0][1].output === 420 && events[0][1].cappable === true && events[0][1].floor === U.MIN_ANSWER_TOKENS, events[0]);
  ok('  settled at the counted tokens: 5,000 read, 4,600 of them from the cache, 300 written = 700', events[1][0] === 'end' && events[1][1] === 700, events[1]);

  events.length = 0;
  cap = 500;
  const c2 = client([{ usage: { prompt_tokens: 10, completion_tokens: 10 }, choices: [] }]);
  await U.tracked(c2, 'logos/chat').chat.completions.create({ model: 'm', max_tokens: 1_200, messages: [] });
  ok('a hold that caps it: the call is sent writing no more than what is left', c2.seen[0].max_tokens === 500);
  const c3 = client([{ usage: { prompt_tokens: 10, completion_tokens: 10 }, choices: [] }]);
  await U.tracked(c3, 'logos/map').chat.completions.create({ model: 'm', max_tokens: 1_200, response_format: { type: 'json_object' }, messages: [] });
  ok('  a JSON call is never shortened', c3.seen[0].max_tokens === 1_200 && events.at(-2)[1].cappable === false);
  ok(
    '  a reasoning call keeps its reasoning room above the floor; a plain one has the answer’s alone',
    U.floorFor({ max_completion_tokens: 4_272, reasoning_effort: 'low' }) === U.MIN_ANSWER_TOKENS + 3_072 && U.floorFor({ max_tokens: 500 }) === U.MIN_ANSWER_TOKENS && U.floorFor({ max_completion_tokens: 900, reasoning_effort: 'none' }) === U.MIN_ANSWER_TOKENS
  );
  cap = null;

  events.length = 0;
  const down = Object.assign(new Error('500 upstream'), { status: 500 });
  const c5 = client([down]);
  const thrown = await U.tracked(c5, 'logos/map').chat.completions.create({ model: 'm', messages: [] }).catch((e) => e);
  ok('a call that failed costs nothing: its hold is given back whole', thrown === down && events.length === 2 && events[1][1] === 0, events);

  events.length = 0;
  const refusedParam = Object.assign(new Error("400 Unsupported parameter: 'temperature' is not supported with this model."), { status: 400, param: 'temperature', code: 'unsupported_parameter' });
  const c6 = client([refusedParam, { usage: { prompt_tokens: 800, completion_tokens: 200 }, choices: [{ message: { content: 'ok' } }] }]);
  await U.tracked(c6, 'logos/write').chat.completions.create({ model: 'm', temperature: 0.4, messages: [] });
  ok('a parameter refused and asked again is one call: held once, settled once, at the answer’s usage', c6.seen.length === 2 && events.filter((e) => e[0] === 'begin').length === 1 && events.filter((e) => e[0] === 'end').length === 1 && events.at(-1)[1] === 1_000, events);

  events.length = 0;
  const c7 = client([{ choices: [{ message: { content: 'abcd'.repeat(30) } }] }]);
  await U.tracked(c7, 'logos/read').chat.completions.create({ model: 'm', messages: [{ role: 'user', content: 'x'.repeat(40) }] });
  ok('an answer with no usage report is settled at an estimate of what it read and wrote', events.at(-1)[1] === 3 + 4 + 10 + 30, events.at(-1));

  events.length = 0;
  const gen = async function* () {
    yield { choices: [{ delta: { content: 'Hel' } }] };
    yield { choices: [{ delta: { content: 'lo' } }] };
    yield { choices: [], usage: { prompt_tokens: 9_000, completion_tokens: 2, prompt_tokens_details: { cached_tokens: 8_000 } } };
  };
  const s1 = await U.tracked(client([gen()]), 'logos/chat').chat.completions.create({ model: 'm', stream: true, messages: [] });
  ok('  a stream is not settled until it ends', events.length === 1);
  for await (const ch of s1) void ch;
  ok('a stream is settled when it ends, at its usage chunk: 1,000 read afresh and 2 written', events.at(-1)[0] === 'end' && events.at(-1)[1] === 1_002, events.at(-1));

  events.length = 0;
  const long = async function* () {
    for (let i = 0; i < 50; i++) yield { choices: [{ delta: { content: 'word ' } }] };
    yield { choices: [], usage: { prompt_tokens: 9_000, completion_tokens: 50 } };
  };
  const s2 = await U.tracked(client([long()]), 'logos/chat').chat.completions.create({ model: 'm', stream: true, messages: [{ role: 'user', content: 'x'.repeat(400) }] });
  let n = 0;
  for await (const ch of s2) {
    void ch;
    if (++n === 10) break;
  }
  ok('a stream stopped before its usage came (stop, a refresh): settled at what it read and had written — never free', events.at(-1)[0] === 'end' && events.at(-1)[1] === 3 + 4 + 100 + 10 * 2, events.at(-1));

  events.length = 0;
  refuse = Object.assign(new Error('the week’s tokens are spent'), { tokenRefusal: true, refusal: { kind: 'sleep' } });
  const c8 = client([{ choices: [] }]);
  const r8 = await U.tracked(c8, 'logos/chat').chat.completions.create({ model: 'm', messages: [] }).catch((e) => e);
  ok('a call that cannot be held is refused before the provider is asked', r8 === refuse && c8.seen.length === 0);
  refuse = null;

  U.onMetering(null);
  const c9 = client([{ usage: { prompt_tokens: 1, completion_tokens: 1 }, choices: [] }]);
  await U.tracked(c9, 'x').chat.completions.create({ model: 'm', max_tokens: 9, messages: [] });
  ok('nothing metering (Socria One, a guest, a test): the call goes as it was asked', JSON.stringify(c9.seen[0]) === JSON.stringify({ model: 'm', max_tokens: 9, messages: [] }));
  console.info = quiet;
}

console.log('\n=== whose request a call is (lib/token-meter.ts) ===');
{
  const seen = [];
  await new Promise((resolve) =>
    setTimeout(async () => {
      M.enterMeter({ userId: 'mae', limit: 30_000 });
      seen.push(M.currentMeter()?.userId);
      await new Promise((r) => setTimeout(r, 5));
      seen.push(M.currentMeter()?.userId);
      await M.uncounted(async () => {
        await new Promise((r) => setTimeout(r, 5));
        seen.push(M.currentMeter());
      });
      seen.push(M.currentMeter()?.userId);
      resolve();
    }, 0)
  );
  ok('the account follows the request across awaits; inside uncounted() there is none; after it, it is back', JSON.stringify(seen) === JSON.stringify(['mae', 'mae', null, 'mae']), seen);
  let elsewhere = 'unset';
  await new Promise((r) => setTimeout(() => ((elsewhere = M.currentMeter()), r()), 0));
  ok('  and another request never sees it', elsewhere === null, elsewhere);
}

console.log('\n=== over the wire: the real store, through supabase-js, against the dev database (scripts/dev/fake-postgrest.mjs) ===');
{
  // lib/sleep-server.ts as the server runs it — supabase-js and all — pointed at the local stand-in, which
  // serves the same functions: what a local run in a browser exercises
  const OUT = join(here, '.tmp', 'weekly-store');
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  await build({
    entryPoints: [join(root, 'lib', 'sleep-server.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: join(OUT, 'sleep-server.mjs'),
    tsconfig: join(root, 'tsconfig.json'),
    plugins: [
      {
        name: 'shim',
        setup: (b) => {
          b.onResolve({ filter: /^@clerk\/nextjs\/server$/ }, () => ({ path: pathToFileURL(join(here, 'helpers', 'fake-clerk.mjs')).href, external: true }));
          b.onResolve({ filter: /^server-only$/ }, () => ({ path: join(here, 'helpers', 'server-only-shim.mjs') }));
          b.onResolve({ filter: /^next\/(server|headers)$/ }, (a) => ({ path: `${a.path}.js`, external: true }));
        },
      },
    ],
    external: ['next', 'next/*', '@supabase/*', '@vercel/functions', 'stripe', 'resend', 'undici'],
    logLevel: 'error',
  });
  const port = await new Promise((resolve) => {
    const srv = createServer();
    srv.listen(0, '127.0.0.1', () => {
      const p = srv.address().port;
      srv.close(() => resolve(p));
    });
  });
  const pg = spawn(process.execPath, [join(root, 'scripts', 'dev', 'fake-postgrest.mjs')], { env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('fake PostgREST did not start')), 10_000);
    pg.stdout.on('data', (d) => /fake PostgREST on/.test(String(d)) && (clearTimeout(t), resolve()));
  });
  try {
    process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'dev';
    const { supabaseTokenStore: store } = await import(pathToFileURL(join(OUT, 'sleep-server.mjs')).href);
    const rpc = (name, body) => fetch(`http://127.0.0.1:${port}/rest/v1/rpc/${name}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
    const at = Date.now();
    const wk = S.weekKey(at);
    await rpc('bump_logos_usage', { p_user: 'wire', p_scope: wk, p_counter: 'tokens', p_by: 27_000, p_at: at });
    ok('the real store reads the week through supabase-js', (await store.read('wire', wk)) === 27_000);
    const N = 30;
    const tries = await Promise.all(Array.from({ length: N }, () => refusalOf(A.holdTokens(store, { user: 'wire', limit: 30_000, input: 250, output: 200, cappable: false, floor: 0, waitMs: 0 }))));
    const holds = tries.filter((r) => r === null).length;
    ok(`${N} holds at once over HTTP with 3,000 free and 500 each: exactly 6 — the stand-in is as atomic as the database`, holds === 6 && tries.filter((r) => r?.kind === 'busy').length === N - 6, { holds, kinds: tries.map((r) => r?.kind ?? 'held') });
    const run = await Promise.all(
      Array.from({ length: N }, async () => {
        try {
          const h = await A.holdTokens(store, { user: 'wire2', limit: 30_000, input: 250, output: 200, cappable: false, floor: 0, waitMs: 2_000 });
          await h.end(Math.min(h.granted, 420));
          return 'ran';
        } catch (e) {
          return A.isTokenRefusal(e) ? e.refusal.kind : 'thrown';
        }
      })
    );
    const settled = await store.read('wire2', wk);
    ok('  run to the end, holding and settling over the wire: every one ran or was refused cleanly, the week is exact', run.every((r) => r === 'ran' || r === 'sleep' || r === 'busy') && settled === run.filter((r) => r === 'ran').length * 420, { settled, ran: run.filter((r) => r === 'ran').length });
    const r0 = await store.reserve({ user: 'wire3', week: wk, hold: 'h1', want: 900, min: 1, limit: 30_000, ttl: A.HOLD_TTL_MS, at });
    const t1 = await store.settle({ user: 'wire3', week: wk, hold: 'h1', reserved: r0.granted, tokens: 610, at, holds: true });
    const t2 = await store.settle({ user: 'wire3', week: wk, hold: 'h1', reserved: r0.granted, tokens: 610, at, holds: true });
    ok('  a hold and its settle on the wire: held 900, settled 610 — and a settle sent twice adds once', r0.granted === 900 && r0.holds === true && t1 === 610 && t2 === 610 && (await store.read('wire3', wk)) === 610, { r0, t1, t2 });
  } finally {
    pg.kill();
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
