// lib/sleep.ts — SLEEP MODE: A FREE ACCOUNT'S WEEK OF TOKENS.
//
// A signed-in free account may spend WEEKLY_TOKENS model tokens a week: the
// tokens of every AI request made for it, input and output together, across
// conversations, artifacts and Logic Maps. The week starts on Monday at
// 00:00:00.000 UTC and ends at the next Monday 00:00 UTC, the same instant on
// every device, so a phone and a laptop can never disagree about whether
// Socria is awake. When the week's tokens are spent, Socria sleeps until the
// reset: no new AI requests, and everything already made is still theirs —
// every conversation, Logic Map and artifact, and everything done by hand.
//
// WHAT COUNTS, AND WHAT DOES NOT (docs/SLEEP-MODE.md has the rule in full).
//
//   Counted     a model call whose answer reaches the person: the reply, a
//               Logic Map pass, an artifact or display drafted, Explore, a
//               write assist, a reading, sorting files, practice, a synthesis,
//               a file read into Memory. Counted at the input the provider
//               read afresh plus everything it wrote (countedTokens below).
//   Not counted our own overhead: an attempt that failed (only the attempt
//               that answered counts), a second attempt we make because our
//               own check rejected the first, the input the provider served
//               from its prompt cache, and work the person did not ask for —
//               a conversation's title, the memory kept about them, checks and
//               regulation of a draft, reading a conversation's state. A web
//               search is not a call of its own here: what it finds is counted
//               where it is read, in the reply or the Explore panel it feeds.
//
// Socria One is never counted (its own subscription limits are in
// lib/entitlements.ts); a guest has their own, smaller pass (lib/guest-pass.ts).
//
// PURE: the week's arithmetic, the words, and how a call's tokens are counted.
// The holding and settling is lib/token-allowance.ts; the store, the gate and
// the routes' side is lib/sleep-server.ts.

/** A free account's tokens a week, input and output together. */
export const WEEKLY_TOKENS = 30_000;

/** The counter's name in the usage table (one row per person per week). */
export const SLEEP_COUNTER = 'tokens';

const DAY_MS = 86_400_000;
/** A week, in milliseconds. UTC keeps no daylight saving, so every week is exactly this long. */
export const WEEK_MS = 7 * DAY_MS;

/** The most a limit may be set to: the usage table counts in 32-bit integers. */
const MAX_LIMIT = 2_000_000_000;

/**
 * The week's limit: SOCRIA_FREE_WEEKLY_TOKENS when it is a positive whole
 * number (written as digits, nothing else), else WEEKLY_TOKENS.
 */
export function weeklyLimit(env: Record<string, string | undefined> = {}): number {
  const raw = (env.SOCRIA_FREE_WEEKLY_TOKENS ?? '').trim();
  if (!/^\d+$/.test(raw)) return WEEKLY_TOKENS;
  const v = Number(raw);
  return Number.isSafeInteger(v) && v > 0 ? Math.min(v, MAX_LIMIT) : WEEKLY_TOKENS;
}

/** The Monday 00:00:00.000 UTC that begins the week holding `now`. */
export function weekStart(now: number): number {
  const d = new Date(now);
  // getUTCDay: 0 is Sunday, 1 Monday … 6 Saturday — so Sunday is six days after Monday
  const sinceMonday = (d.getUTCDay() + 6) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - sinceMonday);
}

/** When the week holding `now` ends and Socria wakes: the next Monday 00:00 UTC. */
export function resetAt(now: number): number {
  return weekStart(now) + WEEK_MS;
}

/**
 * The week's key in the usage table: its Monday, `week:2026-11-02`. Prefixed
 * so it can never be read as a month (`2026-11`), a day (`day:…`) or a
 * conversation (`chat:…`).
 */
export function weekKey(now: number): string {
  return `week:${new Date(weekStart(now)).toISOString().slice(0, 10)}`;
}

/** The week's state, as the routes and the screen read it. */
export interface SleepState {
  /** the week's tokens are spent: Socria is asleep */
  asleep: boolean;
  used: number;
  limit: number;
  left: number;
  /** when the week began (ms, Monday 00:00 UTC) */
  weekStart: number;
  /** when Socria wakes (ms, the next Monday 00:00 UTC) */
  resetAt: number;
}

export function sleepState(used: number, limit: number, now: number): SleepState {
  const u = Math.max(0, Math.floor(Number.isFinite(used) ? used : 0));
  const start = weekStart(now);
  return { asleep: u >= limit, used: u, limit, left: Math.max(0, limit - u), weekStart: start, resetAt: start + WEEK_MS };
}

// ── the words ────────────────────────────────────────────────────────

/** The reset, as the server keeps it — the same words on every device. */
export const RESET_WORDS = 'Monday 00:00 UTC';

/** A number of tokens, as the copy says it: "12,400". */
export const formatTokens = (n: number) => Math.max(0, Math.round(n)).toLocaleString('en-GB');

/** How long until the reset, in words: "2 days 4 h", "1 day", "5 h 12 min", "38 min", "less than a minute". */
export function wakesIn(ms: number): string {
  if (!(ms > 0)) return 'any moment';
  const mins = Math.ceil(ms / 60_000);
  if (mins <= 1) return 'less than a minute';
  const days = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (days) return `${days} ${days === 1 ? 'day' : 'days'}${h ? ` ${h} h` : ''}`;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/**
 * The reset in the person's own time, "Sunday 7:00 pm" — or '' where no
 * local time is available, or where theirs is UTC itself (the server's words
 * already say it).
 */
export function localReset(at: number, opts: { locale?: string; timeZone?: string } = {}): string {
  try {
    const f = new Intl.DateTimeFormat(opts.locale, { weekday: 'long', hour: 'numeric', minute: '2-digit', ...(opts.timeZone ? { timeZone: opts.timeZone } : {}) });
    const zone = f.resolvedOptions().timeZone;
    if (!zone || /^(?:UTC|Etc\/UTC|Etc\/GMT|GMT|Etc\/Universal|Universal|Etc\/Zulu|Zulu)$/i.test(zone)) return '';
    return f.format(new Date(at));
  } catch {
    return '';
  }
}

/** "12,400 of 30,000 left this week" — or, asleep, "This week’s 30,000 tokens are used". */
export function leftLine(s: SleepState): string {
  return s.asleep ? `This week’s ${formatTokens(s.limit)} tokens are used` : `${formatTokens(s.left)} of ${formatTokens(s.limit)} left this week`;
}

/** "resets Monday 00:00 UTC (in 2 days 4 h)" */
export function resetLine(s: SleepState, now: number): string {
  return `resets ${RESET_WORDS} (in ${wakesIn(s.resetAt - now)})`;
}

/** The allowance in one line: "12,400 of 30,000 left this week · resets Monday 00:00 UTC (in 2 days 4 h)". */
export function allowanceLine(s: SleepState, now: number): string {
  return `${leftLine(s)} · ${resetLine(s, now)}`;
}

/** What a refused request says — short, and never a scolding. */
export const SLEEP_NOTE = `You’ve used this week’s free tokens. Socria is resting until ${RESET_WORDS}, and everything you’ve made is still here.`;

/** What a free account is told when its week cannot be checked: paused, plainly, and nothing lost. */
export const TOKENS_UNAVAILABLE =
  'This week’s free tokens can’t be checked right now, so new requests to Socria are paused. Everything you already have stays open — try again in a minute.';

/** What a call is told when every token left is held by the person's other requests, still running. */
export const TOKENS_BUSY = 'Socria is still finishing your other request. Try again in a moment.';

/** The body of a refused AI request: the state, so any screen can count down to the reset. */
export function sleepRefusal(s: SleepState): { error: string; sleep: true; used: number; limit: number; left: number; weekStart: number; resetAt: number } {
  return { error: SLEEP_NOTE, sleep: true, used: s.used, limit: s.limit, left: 0, weekStart: s.weekStart, resetAt: s.resetAt };
}

// ── what a call is counted at ────────────────────────────────────────

/** A provider's usage report, as a chat completion carries it. */
export interface UsageReport {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number | null } | null;
}

/**
 * The tokens a call is counted at: the input the provider read afresh plus
 * everything it wrote. Input it served from its prompt cache is ours to have
 * made cacheable and is not counted; what it wrote includes any reasoning,
 * which the provider bills as output.
 */
export function countedTokens(u: UsageReport | null | undefined): number {
  if (!u) return 0;
  const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? Math.floor(x) : 0);
  const input = n(u.prompt_tokens);
  const cached = Math.min(input, n(u.prompt_tokens_details?.cached_tokens));
  const output = n(u.completion_tokens);
  return input - cached + output;
}
