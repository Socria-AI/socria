// lib/sleep-server.ts — SLEEP MODE, ENFORCED AND COUNTED ON THE SERVER.
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
// Without either, free accounts' AI requests are paused and the log says why.
//
// Switches, read per request (no redeploy): SOCRIA_FREE_WEEKLY_TOKENS sets the
// limit; SOCRIA_SLEEP=off switches Sleep Mode off for everyone (an operator's
// switch for an incident — nothing is counted while it is off);
// SOCRIA_TOKEN_WAIT_MS sets how long a call waits for the person's other calls
// to settle before it is told busy.

import { NextResponse, type NextRequest } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { supabaseAdmin } from './supabase';
import { resolvePlanForRequest } from './socria-one-server';
import { SLEEP_COUNTER, sleepRefusal, sleepState, TOKENS_BUSY, TOKENS_UNAVAILABLE, weekKey, weeklyLimit, type SleepState } from './sleep';

export { TOKENS_BUSY, TOKENS_UNAVAILABLE };
import { holdTokens, isTokenRefusal, WAIT_MS, type Reserved, type TokenStore } from './token-allowance';
import { currentMeter, enterMeter } from './token-meter';
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
    if (!missingFunction(error)) throw fault('reserve', error);
    warnOnce('reserve', '[sleep] reserve_logos_tokens is not installed — the week’s tokens are held through consume_logos_usage until supabase/weekly-tokens.sql is run (docs/SLEEP-MODE.md)');
    return reserveByCounter(a);
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
    if (error) throw fault('settle', error);
    return typeof data === 'number' ? data : 0;
  },
  read: readWeek,
};

// ── the week, for the routes and the screen ─────────────────────────

/** Whether this account's AI requests are counted: signed in, on the free plan, Sleep Mode on. */
const counted = (userId: string | null, plan: string): userId is string => !!userId && plan !== 'one' && !off();

/**
 * The week's state for this account, as the app shows it. Null when it is not
 * counted (signed out, Socria One, switched off); undefined when the store
 * cannot be read — the app then keeps what it last knew.
 */
export async function sleepFor(userId: string | null, plan: string, now = Date.now()): Promise<SleepState | null | undefined> {
  if (!counted(userId, plan)) return null;
  try {
    return sleepState(await readWeek(userId, weekKey(now)), weeklyLimit(process.env), now);
  } catch (e) {
    console.error('[sleep] the week could not be read:', e instanceof Error ? e.message : 'error');
    return undefined;
  }
}

function sleepResponse(s: SleepState): NextResponse {
  const wait = Math.max(1, Math.ceil((s.resetAt - Date.now()) / 1000));
  return NextResponse.json(sleepRefusal(s), { status: 429, headers: { 'Retry-After': String(wait) } });
}
const unavailableResponse = () => NextResponse.json({ error: TOKENS_UNAVAILABLE, unavailable: true }, { status: 503, headers: { 'Retry-After': '60' } });
const busyResponse = () => NextResponse.json({ error: TOKENS_BUSY, busy: true }, { status: 429, headers: { 'Retry-After': '5' } });

/**
 * Before a model is called. `refuse`: the answer to send — the week is spent
 * (429, Sleep Mode) or cannot be checked (503). `meter`: a free account,
 * awake — the caller meters the request with meterFor(userId) in its own
 * context (AsyncLocalStorage carries a store set in the route itself, not one
 * set inside an awaited helper):
 *
 *   const sleep = await sleepGate(req, userId, plan);
 *   if (sleep.refuse) return sleep.refuse;
 *   if (sleep.meter) meterFor(sleep.meter);
 */
export async function sleepGate(req: NextRequest, userId: string | null, plan?: string): Promise<{ refuse: NextResponse | null; meter: string | null; state: SleepState | null }> {
  if (!userId || off()) return { refuse: null, meter: null, state: null };
  const p = plan ?? (await resolvePlanForRequest(req, userId));
  if (!counted(userId, p)) return { refuse: null, meter: null, state: null };
  const now = Date.now();
  let s: SleepState;
  try {
    s = sleepState(await readWeek(userId, weekKey(now)), weeklyLimit(process.env), now);
  } catch (e) {
    console.error('[sleep] the week could not be read; this free request is paused:', e instanceof Error ? e.message : 'error');
    return { refuse: unavailableResponse(), meter: null, state: null };
  }
  if (s.asleep) return { refuse: sleepResponse(s), meter: null, state: s };
  return { refuse: null, meter: userId, state: s };
}

/** Meter the rest of this request — called by the route itself, after sleepGate said so. */
export function meterFor(userId: string): void {
  enterMeter({ userId, limit: weeklyLimit(process.env) });
}

/**
 * For the routes that only do our own upkeep (a conversation's title, the
 * memory kept about the person): never counted, but resting while the
 * account is — no model is asked for a free account whose week is spent or
 * cannot be checked. True when the route should stand down.
 */
export async function restingNow(req: NextRequest, userId: string | null): Promise<boolean> {
  if (!userId || off()) return false;
  const gate = await sleepGate(req, userId);
  return !!gate.refuse;
}

/**
 * A model call refused mid-request (lib/token-allowance.ts TokenRefusal) as
 * the answer a route sends: Sleep Mode (429 with the week's state), busy (429),
 * or the week unreadable (503). Null for any other error.
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
    const hold = await holdTokens(supabaseTokenStore, {
      user: m.userId,
      limit: m.limit,
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
