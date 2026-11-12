// lib/sleep-server.ts — THE TRIAL'S TOKENS, ENFORCED AND COUNTED ON THE SERVER.
//
// SINCE NOVEMBER 9, 2026 an account that is not on Socria One is held to the seven-day trial
// (lib/trial.ts, lib/trial-server.ts): a day's tokens (20,000) within the trial's (140,000), and nothing
// once its seven days are over. The machinery below is Sleep Mode's, unchanged in how it holds and
// settles; what changed is the period (the trial's UTC day, `tday:…`, instead of the week) and the
// gate, which now also refuses an ended trial (402, with the cookie that keeps the guest preview from
// standing in for it). The week's words and arithmetic stay in lib/sleep.ts, unused by the gate.
//
// A free account's week of tokens (lib/sleep.ts), kept in the database and
// held to on every AI request:
//
//   sleepGate(req, userId)  every route that would call a model for the
//                           person asks first. A signed-in free account whose
//                           week is spent gets a 429 with the week's state; one
//                           whose week cannot be read gets a 503 that says so
//                           (fail closed: free accounts' paid model work is
//                           never given away uncounted); anyone else goes on —
//                           and, for a free account, the route meters the rest
//                           of the request (meterFor).
//   the metering            registered with lib/openai-usage.ts: every model
//                           call made while a request is metered is held before
//                           it is made and settled when it ends
//                           (lib/token-allowance.ts holdTokens), against the
//                           account metered for that request — found through
//                           AsyncLocalStorage (lib/token-meter.ts), so a call
//                           deep in the code is counted without being told
//                           whose it is. Our own overhead runs inside
//                           uncounted() and is never held.
//   sleepAnswer(e)          a call refused mid-request (another tab took the
//                           last tokens first) as the answer the route sends.
//
// THE STORE. One row per person per week in logos_usage (counter `tokens`,
// scope `week:<Monday>`), holding the tokens settled; each call still running
// holds its share in a row of its own, which stops counting after ten minutes
// if its call never comes back. Both are written only by the two functions in
// supabase/weekly-tokens.sql, which take the week's row lock first — so a
// refresh, a second tab, a second device or two requests at once all draw on
// the one balance, one at a time. Keyed by the account id and the week, never
// by a device, a session or a browser.
//
// Until those functions are installed the hold goes through the older
// consume_logos_usage (supabase/freemium.sql) on the same row: as strict —
// nothing past the limit is ever held — but a hold is then part of the week's
// total until it is settled, so a call made while another is running may be
// told Socria is resting a moment early, and a call that dies keeps its hold.
// Without either (or when they answer an error), the hold is kept on the table
// alone (lib/usage-rows.ts: compare-and-set on the row, as strict, no function
// needed) and the log says once why. Only a store that cannot be read or
// written at all pauses the trial's requests (November 9, 2026: production
// answered every trial's first message with "Your trial can't be checked right
// now" because the functions were not there to answer).
//
// Switches, read per request (no redeploy): SOCRIA_FREE_WEEKLY_TOKENS sets the
// limit; SOCRIA_SLEEP=off switches Sleep Mode off for everyone (an operator's
// switch for an incident — nothing is counted while it is off);
// SOCRIA_TOKEN_WAIT_MS sets how long a call waits for the person's other calls
// to settle before it is told busy.

import { NextResponse, type NextRequest } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { supabaseAdmin } from './supabase';
import { addTo, readCount } from './usage-rows';
import { resolvePlanForRequest } from './socria-one-server';
import { SLEEP_COUNTER, sleepRefusal, TOKENS_BUSY, TOKENS_UNAVAILABLE, type SleepState } from './sleep';
import { TRIAL_DAY_NOTE, TRIAL_ENDED_COOKIE, TRIAL_UNAVAILABLE, dayKey, dayStart, nextMidnight, trialEndedRefusal, type TrialState } from './trial';
import { beginTrial, countEnded, countLimitHit, trialFor } from './trial-server';

export { TOKENS_BUSY, TOKENS_UNAVAILABLE };
import { holdTokens, isTokenRefusal, TokenRefusal, WAIT_MS, type Reserved, type TokenStore } from './token-allowance';

/** A trial day's state as a refused hold reports it. */
const dayState = (used: number, limit: number, at: number): SleepState => ({
  asleep: used >= limit,
  used,
  limit,
  left: Math.max(0, limit - used),
  weekStart: dayStart(at),
  resetAt: nextMidnight(at),
  period: 'day',
});
import { currentMeter, enterMeter, type Meter } from './token-meter';
import { onMetering } from './openai-usage';

const off = () => ['off', '0', 'false', 'no'].includes((process.env.SOCRIA_SLEEP ?? '').trim().toLowerCase());

// ── the store ───────────────────────────────────────────────────────

const said = new Set<string>();
function warnOnce(kind: string, message: string, error = false) {
  if (said.has(kind)) return;
  said.add(kind);
  (error ? console.error : console.warn)(message);
}

function missingFunction(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  const m = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase();
  return m.includes('42883') || m.includes('pgrst202') || (m.includes('function') && (m.includes('does not exist') || m.includes('could not find')));
}

class StoreFault extends Error {}
const fault = (what: string, error: { message?: string } | null | undefined) => new StoreFault(`${what}: ${String(error?.message ?? 'no answer').slice(0, 160)}`);

/** The tokens settled this week. Throws when the store cannot answer. */
async function readWeek(user: string, week: string): Promise<number> {
  const { data, error } = await supabaseAdmin().from('logos_usage').select('n').eq('user_id', user).eq('scope', week).eq('counter', SLEEP_COUNTER).maybeSingle();
  if (error) throw fault('read', error);
  return typeof data?.n === 'number' ? data.n : 0;
}

/** The older path: consume_logos_usage on the week's row — strict, but a hold is part of the total until it settles. */
async function reserveByCounter(a: { user: string; week: string; want: number; min: number; limit: number; at: number }): Promise<Reserved> {
  const db = supabaseAdmin();
  for (let attempt = 0; attempt < 2; attempt++) {
    const used = await readWeek(a.user, a.week);
    const free = a.limit - used;
    if (free < Math.max(1, a.min)) return { granted: 0, used, held: 0, holds: false };
    const take = Math.min(a.want, free);
    const { data, error } = await db.rpc('consume_logos_usage', { p_user: a.user, p_scope: a.week, p_counter: SLEEP_COUNTER, p_by: take, p_limit: a.limit, p_at: a.at });
    if (error) {
      if (missingFunction(error)) warnOnce('consume', '[sleep] neither reserve_logos_tokens nor consume_logos_usage is installed — free accounts’ AI requests are paused until supabase/weekly-tokens.sql is run (docs/SLEEP-MODE.md)', true);
      throw fault('consume', error);
    }
    // -1: another request took the room first — read again and try once more
    if (data === -1) continue;
    if (typeof data !== 'number') throw fault('consume', { message: 'unexpected answer' });
    return { granted: take, used: data - take, held: take, holds: false };
  }
  return { granted: 0, used: await readWeek(a.user, a.week), held: 0, holds: false };
}

/**
 * The table alone (lib/usage-rows.ts), for a database where neither function answers: the same hold,
 * as strict — the count is raised only where it is still what was read, so nothing past the limit is
 * ever held — and, like the older path, a hold is part of the period's total until it is settled.
 */
async function reserveByRows(a: { user: string; week: string; want: number; min: number; limit: number; at: number }): Promise<Reserved> {
  const row = { user: a.user, scope: a.week, counter: SLEEP_COUNTER };
  for (let attempt = 0; attempt < 2; attempt++) {
    const used = (await readCount(row)) ?? 0;
    const free = a.limit - used;
    if (free < Math.max(1, a.min)) return { granted: 0, used, held: 0, holds: false };
    const take = Math.min(a.want, free);
    const n = await addTo(row, take, a.at, { limit: a.limit });
    // -1: another request took the room first — read again and try once more
    if (n === -1) continue;
    return { granted: take, used: n - take, held: take, holds: false };
  }
  return { granted: 0, used: (await readCount(row)) ?? 0, held: 0, holds: false };
}

/** The older paths, in order: consume_logos_usage, then the table alone. Throws only when the store cannot answer at all. */
async function reserveWithoutHolds(a: { user: string; week: string; want: number; min: number; limit: number; at: number }): Promise<Reserved> {
  try {
    return await reserveByCounter(a);
  } catch (e) {
    warnOnce('rows', `[sleep] consume_logos_usage could not hold the tokens (${e instanceof Error ? e.message : 'error'}) — holding them on the table alone (lib/usage-rows.ts) until supabase/freemium.sql is run`);
    return reserveByRows(a);
  }
}

export const supabaseTokenStore: TokenStore = {
  async reserve(a) {
    const { data, error } = await supabaseAdmin().rpc('reserve_logos_tokens', {
      p_user: a.user,
      p_week: a.week,
      p_hold: a.hold,
      p_want: a.want,
      p_min: a.min,
      p_limit: a.limit,
      p_ttl: a.ttl,
      p_at: a.at,
    });
    if (!error) {
      const r = data as { granted?: unknown; used?: unknown; held?: unknown } | null;
      if (r && typeof r === 'object' && typeof r.granted === 'number' && typeof r.used === 'number') {
        return { granted: r.granted, used: r.used, held: typeof r.held === 'number' ? r.held : r.granted, holds: true };
      }
      // an answer that is not the function's: the hold cannot be trusted, so nothing is held
      throw fault('reserve', { message: 'unexpected answer' });
    }
    if (missingFunction(error)) warnOnce('reserve', '[sleep] reserve_logos_tokens is not installed — the tokens are held through consume_logos_usage (or the table alone) until supabase/weekly-tokens.sql is run (docs/SLEEP-MODE.md)');
    else warnOnce('reserve-error', `[sleep] reserve_logos_tokens answered an error (${String(error.message ?? error.code ?? 'error').slice(0, 160)}) — holding through the older paths instead`);
    return reserveWithoutHolds(a);
  },
  async settle(a) {
    const db = supabaseAdmin();
    if (a.holds) {
      const { data, error } = await db.rpc('settle_logos_tokens', { p_user: a.user, p_week: a.week, p_hold: a.hold, p_tokens: a.tokens, p_at: a.at });
      if (error) throw fault('settle', error);
      return typeof data === 'number' ? data : 0;
    }
    // the older path: the hold is already in the total — give back what it did not use, or add what it ran over
    const delta = a.tokens - a.reserved;
    if (!delta) return 0;
    const { data, error } =
      delta < 0
        ? await db.rpc('refund_logos_usage', { p_user: a.user, p_scope: a.week, p_counter: SLEEP_COUNTER, p_by: -delta, p_at: a.at })
        : await db.rpc('bump_logos_usage', { p_user: a.user, p_scope: a.week, p_counter: SLEEP_COUNTER, p_by: delta, p_at: a.at });
    if (!error) return typeof data === 'number' ? data : 0;
    // without the functions: the same change on the table alone (never below zero)
    warnOnce('settle-rows', `[sleep] ${delta < 0 ? 'refund' : 'bump'}_logos_usage could not settle (${String(error.message ?? error.code ?? 'error').slice(0, 160)}) — settling on the table alone (lib/usage-rows.ts)`);
    return addTo({ user: a.user, scope: a.week, counter: SLEEP_COUNTER }, delta, a.at);
  },
  read: readWeek,
};

// ── the trial, for the routes and the screen ────────────────────────

/** Whether this account's AI requests are counted: signed in, not on Socria One, the switch not off. */
const counted = (userId: string | null, plan: string): userId is string => !!userId && plan !== 'one' && !off();

/**
 * The trial's state for this account, as the app shows it. Null when it is not counted (signed out,
 * Socria One, switched off); undefined when the store cannot be read — the app then keeps what it last knew.
 */
export async function trialStateFor(userId: string | null, plan: string, now = Date.now()): Promise<TrialState | null | undefined> {
  if (!counted(userId, plan)) return null;
  try {
    return await trialFor(userId, now, { checkClaim: true });
  } catch (e) {
    console.error('[trial] the trial could not be read:', e instanceof Error ? e.message : 'error');
    return undefined;
  }
}

/** Today's tokens, as Sleep Mode's state (period 'day') — the usage panel's `sleep`. */
export async function sleepFor(userId: string | null, plan: string, now = Date.now()): Promise<SleepState | null | undefined> {
  const t = await trialStateFor(userId, plan, now);
  return t ? t.today : t;
}

const noteFor = (s: SleepState) => (s.period === 'day' ? TRIAL_DAY_NOTE : undefined);
function sleepResponse(s: SleepState): NextResponse {
  const wait = Math.max(1, Math.ceil((s.resetAt - Date.now()) / 1000));
  return NextResponse.json(sleepRefusal(s, noteFor(s)), { status: 429, headers: { 'Retry-After': String(wait) } });
}
const unavailableResponse = () => NextResponse.json({ error: TRIAL_UNAVAILABLE, unavailable: true }, { status: 503, headers: { 'Retry-After': '60' } });
const busyResponse = () => NextResponse.json({ error: TOKENS_BUSY, busy: true }, { status: 429, headers: { 'Retry-After': '5' } });

/**
 * The trial over: 402 with what to do, and a cookie on this browser so its guest preview cannot stand in
 * for the trial (the guest routes read it). Exported for the routes that answer it themselves.
 */
export function trialEndedResponse(t: TrialState): NextResponse {
  const res = NextResponse.json(trialEndedRefusal(t), { status: 402 });
  res.cookies.set(TRIAL_ENDED_COOKIE, '1', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 400 * 86_400 });
  return res;
}

/** What a gate hands the route: the meter to enter, or nothing to meter. */
export type GateMeter = Meter;

/**
 * Before a model is called. `refuse`: the answer to send — the trial is over (402), today's tokens are
 * spent (429, resting until 00:00 UTC), or the trial cannot be read (503, fail closed). `meter`: an
 * account on its trial (or about to begin it), with today left — the caller meters the request with
 * meterFor(meter) in its own context (AsyncLocalStorage carries a store set in the route itself, not one
 * set inside an awaited helper):
 *
 *   const sleep = await sleepGate(req, userId, plan);
 *   if (sleep.refuse) return sleep.refuse;
 *   if (sleep.meter) meterFor(sleep.meter);
 */
export async function sleepGate(
  req: NextRequest,
  userId: string | null,
  plan?: string
): Promise<{ refuse: NextResponse | null; meter: GateMeter | null; state: SleepState | null; trial?: TrialState }> {
  if (!userId || off()) return { refuse: null, meter: null, state: null };
  const p = plan ?? (await resolvePlanForRequest(req, userId));
  if (!counted(userId, p)) return { refuse: null, meter: null, state: null };
  const now = Date.now();
  let t: TrialState;
  try {
    t = await trialFor(userId, now, { checkClaim: true });
  } catch (e) {
    console.error('[trial] the trial could not be read; this request is paused:', e instanceof Error ? e.message : 'error');
    return { refuse: unavailableResponse(), meter: null, state: null };
  }
  if (t.status === 'ended') {
    void countEnded(userId, now);
    return { refuse: trialEndedResponse(t), meter: null, state: null, trial: t };
  }
  if (t.today.asleep) {
    void countLimitHit(userId, now);
    return { refuse: sleepResponse(t.today), meter: null, state: t.today, trial: t };
  }
  return { refuse: null, meter: { userId, limit: t.today.limit, scope: dayKey(now), ...(t.status === 'eligible' ? { begin: true } : {}) }, state: t.today, trial: t };
}

/** Meter the rest of this request — called by the route itself, after sleepGate said so. */
export function meterFor(meter: GateMeter): void {
  enterMeter({ ...meter });
}

/**
 * For the routes that only do our own upkeep (a conversation's title, the memory kept about the
 * person): never counted, and never begins a trial — but resting while the account is: no model is
 * asked for an account whose trial is over, whose day is spent, or whose trial cannot be read. True
 * when the route should stand down.
 */
export async function restingNow(req: NextRequest, userId: string | null): Promise<boolean> {
  if (!userId || off()) return false;
  const p = await resolvePlanForRequest(req, userId);
  if (!counted(userId, p)) return false;
  try {
    const t = await trialFor(userId, Date.now());
    return t.status === 'ended' || t.today.asleep;
  } catch {
    return true;
  }
}

/**
 * A model call refused mid-request (lib/token-allowance.ts TokenRefusal) as the answer a route sends:
 * resting (429 with the day's state), busy (429), or unreadable (503). Null for any other error.
 */
export function sleepAnswer(e: unknown): NextResponse | null {
  if (!isTokenRefusal(e)) return null;
  const r = e.refusal;
  if (r.kind === 'sleep') return sleepResponse(r.state);
  if (r.kind === 'busy') return busyResponse();
  return unavailableResponse();
}

/** A settle's write, kept alive past the response where the platform allows (a stream ends after it is returned). */
function keepAlive(p: Promise<unknown>): void {
  try {
    waitUntil(p);
  } catch {
    void p;
  }
}

const waitMs = () => {
  const v = Number((process.env.SOCRIA_TOKEN_WAIT_MS ?? '').trim());
  return Number.isFinite(v) && v >= 0 && (process.env.SOCRIA_TOKEN_WAIT_MS ?? '').trim() !== '' ? v : WAIT_MS;
};

// every model call made while a request is metered comes here (lib/openai-usage.ts) once any route has loaded this file
onMetering({
  async begin(call) {
    const m = currentMeter();
    if (!m || off()) return null;
    // the request's first real model call begins the trial (once; a second call in the request finds it begun)
    if (m.begin) {
      try {
        await beginTrial(m.userId);
      } catch (e) {
        throw new TokenRefusal({ kind: 'unavailable', detail: e instanceof Error ? e.message.slice(0, 160) : undefined });
      }
      m.begin = false;
    }
    const scope = m.scope;
    const hold = await holdTokens(supabaseTokenStore, {
      user: m.userId,
      limit: m.limit,
      ...(scope ? { scope, stateOf: (used: number, limit: number, at: number) => dayState(used, limit, at) } : {}),
      input: call.input,
      output: call.output,
      cappable: call.cappable,
      floor: call.floor,
      waitMs: waitMs(),
      onLost: (tokens, why) => console.error('[sleep] %d tokens on %s could not be settled: %s', tokens, call.route, why instanceof Error ? why.message : 'error'),
    });
    return { outputCap: hold.outputCap, end: (tokens: number) => keepAlive(hold.end(tokens)) };
  },
});
