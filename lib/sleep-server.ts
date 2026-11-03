// lib/sleep-server.ts — SLEEP MODE, ENFORCED AND COUNTED ON THE SERVER.
//
// Two parts, both server-only:
//
//   sleepGate(req, userId)  every Logos 5 route that would call a model asks
//                           first. A signed-in free account whose day is
//                           spent gets a 429 with the day's state; anyone else
//                           goes on — and, for a free account, the route meters
//                           the rest of the request (meterFor).
//   chargeTokens(route, u)  lib/openai-usage.ts calls it for every model call
//                           with the provider's usage report. The tokens go to
//                           the account metered for this request — found
//                           through AsyncLocalStorage, so every call a request
//                           makes (the reply, the memory it keeps, a retry) is
//                           counted without each one being told whose it is.
//
// The count is a row in logos_usage (counter `tokens`, scope the UTC day),
// written by the same atomic bump every other counter uses — so two devices,
// two tabs or two requests at once all add to the one total. A turn already
// under way when the day runs out is finished: the next request sleeps. A
// store that cannot be read lets the request through (as every allowance
// does): nobody is put to sleep by a fault.
//
// SOCRIA_FREE_DAILY_TOKENS sets the limit; SOCRIA_SLEEP=off switches it off;
// SOCRIA_SLEEP_METER=reply counts only the replies (not the map, memory or
// readings) — both read at call time, no redeploy.

import { AsyncLocalStorage } from 'node:async_hooks';
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from './supabase';
import { resolvePlanForRequest } from './socria-one-server';
import { dayKey } from './usage-scope';
import { SLEEP_COUNTER, dailyLimit, sleepRefusal, sleepState, tokensOf, type SleepState } from './sleep';
import { onUsage } from './openai-usage';

interface Meter {
  userId: string;
}
const meters = new AsyncLocalStorage<Meter>();

const off = () => ['off', '0', 'false', 'no'].includes((process.env.SOCRIA_SLEEP ?? '').trim().toLowerCase());

/** The day's tokens spent so far. 0 when the store cannot be read (never asleep by a fault). */
export async function tokensToday(userId: string, now = Date.now()): Promise<number> {
  try {
    const { data, error } = await supabaseAdmin()
      .from('logos_usage')
      .select('n')
      .eq('user_id', userId)
      .eq('scope', dayKey(now))
      .eq('counter', SLEEP_COUNTER)
      .maybeSingle();
    if (error) return 0;
    return typeof data?.n === 'number' ? data.n : 0;
  } catch {
    return 0;
  }
}

/** The day's state for this account, or null when it is not counted (signed out, Socria One, switched off). */
export async function sleepFor(userId: string | null, plan: string, now = Date.now()): Promise<SleepState | null> {
  if (!userId || plan === 'one' || off()) return null;
  return sleepState(await tokensToday(userId, now), dailyLimit(process.env), now);
}

/**
 * Before a model is called. `refuse`: the 429 to send — the day is spent.
 * `meter`: a free account, awake — the caller meters the request with
 * meterFor(userId) in its own context (AsyncLocalStorage carries a store set in
 * the route itself, not one set inside an awaited helper):
 *
 *   const sleep = await sleepGate(req, userId, plan);
 *   if (sleep.refuse) return sleep.refuse;
 *   if (sleep.meter) meterFor(sleep.meter);
 */
export async function sleepGate(req: NextRequest, userId: string | null, plan?: string): Promise<{ refuse: NextResponse | null; meter: string | null; state: SleepState | null }> {
  if (!userId || off()) return { refuse: null, meter: null, state: null };
  const p = plan ?? (await resolvePlanForRequest(req, userId));
  const s = await sleepFor(userId, p);
  if (!s) return { refuse: null, meter: null, state: null };
  if (s.asleep) {
    const wait = Math.max(1, Math.ceil((s.resetAt - Date.now()) / 1000));
    return { refuse: NextResponse.json(sleepRefusal(s), { status: 429, headers: { 'Retry-After': String(wait) } }), meter: null, state: s };
  }
  return { refuse: null, meter: userId, state: s };
}

/** Meter the rest of this request — called by the route itself, after sleepGate said so. */
export function meterFor(userId: string): void {
  meters.enterWith({ userId });
}

/**
 * A model call's usage, charged to the account metered for this request.
 * Never throws and never delays the call: the write goes out on its own.
 */
export function chargeTokens(route: string, usage: { prompt_tokens?: number; completion_tokens?: number } | null | undefined, now = Date.now()): Promise<number | null> | null {
  const m = meters.getStore();
  if (!m || off()) return null;
  if ((process.env.SOCRIA_SLEEP_METER ?? '').trim().toLowerCase() === 'reply' && route !== 'logos/chat') return null;
  const n = tokensOf(usage);
  if (n <= 0) return null;
  return (async () => {
    try {
      const { data, error } = await supabaseAdmin().rpc('bump_logos_usage', { p_user: m.userId, p_scope: dayKey(now), p_counter: SLEEP_COUNTER, p_by: n, p_at: now });
      return error ? null : typeof data === 'number' ? data : null;
    } catch {
      return null;
    }
  })();
}

// every model call's usage comes here (lib/openai-usage.ts) once any route has loaded this file
onUsage((route, usage) => void chargeTokens(route, usage));
