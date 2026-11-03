// lib/sleep.ts — SLEEP MODE: A FREE ACCOUNT'S DAY OF THINKING TIME.
//
// A signed-in free account may spend DAILY_TOKENS model tokens a day — every
// call made for it, input and output together (the reply, the Logic Map, the
// memory it keeps, a reading, a synthesis). When the day's are spent, Socria
// sleeps until the next reset: no new AI requests, and everything already made
// still theirs — every conversation, every Logic Map, every artifact, and
// everything they can do by hand.
//
// The day is the UTC day, the same for every device, so a phone and a laptop
// can never disagree about whether Socria is awake. Socria One is never
// counted; a guest has their own, smaller pass (lib/guest-pass.ts).
//
// PURE: the arithmetic and the words. The counting is lib/sleep-server.ts.

/** A free account's tokens a day, input and output together. */
export const DAILY_TOKENS = 35_000;

/** The counter's name in the usage table (one row per person per UTC day). */
export const SLEEP_COUNTER = 'tokens';

/** The day's limit: SOCRIA_FREE_DAILY_TOKENS when it is a positive whole number, else DAILY_TOKENS. */
export function dailyLimit(env: Record<string, string | undefined> = {}): number {
  const v = Number((env.SOCRIA_FREE_DAILY_TOKENS ?? '').trim());
  return Number.isInteger(v) && v > 0 ? v : DAILY_TOKENS;
}

/** When the day being counted ends: the next midnight, UTC. */
export function resetAt(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}

/** The day's state, as the routes and the screen read it. */
export interface SleepState {
  /** the day's tokens are spent: Socria is asleep */
  asleep: boolean;
  used: number;
  limit: number;
  left: number;
  /** when Socria wakes (ms, UTC midnight) */
  resetAt: number;
}

export function sleepState(used: number, limit: number, now: number): SleepState {
  const u = Math.max(0, Math.floor(Number.isFinite(used) ? used : 0));
  return { asleep: u >= limit, used: u, limit, left: Math.max(0, limit - u), resetAt: resetAt(now) };
}

/** How long until Socria wakes, in words: "4 h 12 min", "38 min", "less than a minute". */
export function wakesIn(ms: number): string {
  if (!(ms > 0)) return 'any moment';
  const mins = Math.ceil(ms / 60_000);
  if (mins <= 1) return 'less than a minute';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** The clock time Socria wakes, in their own time zone: "1:00 am". */
export function wakeClock(at: number, locale?: string): string {
  try {
    return new Date(at).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

/** What a refused request says — short, and never a scolding. */
export const SLEEP_NOTE = 'Socria is resting until tomorrow. Everything you have made is still here.';

/** The body of a refused AI request: the state, so any screen can show the countdown. */
export function sleepRefusal(s: SleepState): { error: string; sleep: true; used: number; limit: number; resetAt: number } {
  return { error: SLEEP_NOTE, sleep: true, used: s.used, limit: s.limit, resetAt: s.resetAt };
}

/** Tokens a call cost, from the provider's usage report: input and output together. */
export function tokensOf(u: { prompt_tokens?: number; completion_tokens?: number } | null | undefined): number {
  const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? Math.floor(x) : 0);
  return u ? n(u.prompt_tokens) + n(u.completion_tokens) : 0;
}
