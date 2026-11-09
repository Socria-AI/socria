// lib/trial.ts — THE SEVEN-DAY TRIAL (Logos 5.5). A hard trial, not a free tier.
//
// Every eligible account that is not on Socria One has seven days of Socria:
//
//   · The seven days begin with the account's first model call that does real work for them — the
//     first reply, Logic Map pass, artifact or reading — never at sign-up and never for our own
//     upkeep (a title, the memory kept about them). They are seven days of 24 hours: the trial ends
//     at the same instant it began, a week later.
//   · Each day (00:00 to 24:00 UTC, the server's clock) the trial may spend DAILY tokens, input and
//     output together, counted as Sleep Mode counted them (lib/sleep.ts countedTokens). The days
//     together may spend TOTAL at most: a day's limit is the smaller of DAILY and what the trial has
//     left, so a trial that began late in a UTC day (and so touches eight of them) still ends at TOTAL.
//   · A day's tokens spent, Socria rests until 00:00 UTC. The seven days over, every new AI request
//     needs Socria One. There is no allowance after the trial.
//   · Nothing made is taken away, ever: conversations, Logic Maps, artifacts and writing stay open,
//     and everything done by hand (moving, writing, renaming, organising, exporting, deleting) goes on
//     working. Only requests that would ask a model are refused.
//   · Socria One is never counted here. An account that subscribes mid-trial simply leaves the trial.
//
// ONE TRIAL A PERSON, as far as is reasonable and private. When a trial begins, a keyed hash of the
// account's verified email, normalised (lower case; the +tag dropped; for Gmail the dots too), is
// kept — never the address. It outlives the account, so deleting an account and making a new one with
// the same address starts that one as already ended. A different address is a different person to
// us; that is the line between reasonable and invasive.
//
// EXISTING ACCOUNTS (the migration decided on November 9, 2026): every account that was on the old
// free plan simply has no trial yet, so its trial begins at its next real request, like a new one's.
//
// PURE: the arithmetic, the keys and the words. The store, the gate and the routes' side are
// lib/trial-server.ts and lib/sleep-server.ts.

import { formatTokens, wakesIn, type SleepState } from './sleep';

const DAY_MS = 86_400_000;

/** The trial's numbers. */
export const TRIAL = {
  /** how long it lasts */
  days: 7,
  /** tokens a UTC day */
  daily: 10_000,
  /** tokens across the whole trial */
  total: 70_000,
} as const;

/** The trial's length in milliseconds: seven days of 24 hours. */
export const TRIAL_MS = TRIAL.days * DAY_MS;

/** Positive whole numbers from the environment, else the default. */
function envInt(raw: string | undefined, fallback: number, max = 2_000_000_000): number {
  const s = (raw ?? '').trim();
  if (!/^\d+$/.test(s)) return fallback;
  const v = Number(s);
  return Number.isSafeInteger(v) && v > 0 ? Math.min(v, max) : fallback;
}

/** The limits in force: SOCRIA_TRIAL_DAILY_TOKENS and SOCRIA_TRIAL_TOTAL_TOKENS when set, else TRIAL. */
export function trialLimits(env: Record<string, string | undefined> = {}): { daily: number; total: number } {
  const daily = envInt(env.SOCRIA_TRIAL_DAILY_TOKENS, TRIAL.daily);
  const total = Math.max(daily, envInt(env.SOCRIA_TRIAL_TOTAL_TOKENS, TRIAL.total));
  return { daily, total };
}

// ── the keys in the usage table (logos_usage) ───────────────────────

/** The row that holds when the trial began: scope `trial`, counter `start`, n = whole minutes since 1970 (UTC). */
export const START_SCOPE = 'trial';
export const START_COUNTER = 'start';
/** A day's tokens: counter `tokens` (the same counter Sleep Mode used), scope `tday:2026-11-09`. */
export const DAY_COUNTER = 'tokens';
/** Markers that make an event count once: the first refusal of a day, the first refusal after the end. */
export const HIT_COUNTER = 'hit';
export const ENDED_COUNTER = 'ended';
/** The kept hash of a verified address: user_id `trialclaim:<hex>`, scope `claim`, counter `trial`. */
export const CLAIM_PREFIX = 'trialclaim:';
export const CLAIM_SCOPE = 'claim';
export const CLAIM_COUNTER = 'trial';

/** 00:00 UTC of the day holding `now`. */
export function dayStart(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}
/** The next 00:00 UTC: when a day's tokens start again. */
export const nextMidnight = (now: number) => dayStart(now) + DAY_MS;

/** A day's key: `tday:2026-11-09`. Prefixed so it can never be read as a week, a month or a conversation. */
export function dayKey(now: number): string {
  return `tday:${new Date(dayStart(now)).toISOString().slice(0, 10)}`;
}

/** The start as stored (whole minutes, which fit the table's 32-bit counter until the year 6053). */
export const startToStored = (at: number) => Math.max(1, Math.floor(at / 60_000));
export const startFromStored = (n: unknown): number | null => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) * 60_000 : null);

/** Every UTC day a trial begun at `startedAt` touches, first to last (seven or eight of them). */
export function trialDayKeys(startedAt: number): string[] {
  const keys: string[] = [];
  const end = startedAt + TRIAL_MS;
  for (let t = dayStart(startedAt); t < end; t += DAY_MS) keys.push(dayKey(t));
  return keys;
}

// ── the state ───────────────────────────────────────────────────────

export type TrialStatus = 'eligible' | 'active' | 'ended';

export interface TrialState {
  /** eligible: not begun (it begins with the next real request); active: running; ended: over, or not available */
  status: TrialStatus;
  /** why an ended trial ended: its seven days are over, its tokens are spent, or this address had a trial before */
  reason?: 'expired' | 'spent' | 'claimed';
  /** when it began and ends (ms), once begun */
  startedAt: number | null;
  endsAt: number | null;
  /** which day of seven it is (1–7), once begun */
  day: number;
  /** whole days left, counting today (7 … 1), once begun */
  daysLeft: number;
  /** today, as Sleep Mode's state (period 'day'): what is spent, today's limit, what is left, the next reset */
  today: SleepState;
  /** the whole trial */
  total: { used: number; limit: number };
}

/**
 * The trial's state at `now`: when it began (null: not yet), the tokens settled on each of its days
 * (by day key), and whether this address has had a trial on another account.
 */
export function trialState(a: {
  startedAt: number | null;
  now: number;
  byDay?: Readonly<Record<string, number>>;
  claimed?: boolean;
  limits?: { daily: number; total: number };
}): TrialState {
  const { daily, total } = a.limits ?? TRIAL;
  const now = a.now;
  const start = dayStart(now);
  const reset = start + DAY_MS;
  const byDay = a.byDay ?? {};
  const todayKey = dayKey(now);
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
  const day = (used: number, limit: number): SleepState => ({ asleep: used >= limit, used, limit, left: Math.max(0, limit - used), weekStart: start, resetAt: reset, period: 'day' });

  if (a.startedAt === null) {
    if (a.claimed) return { status: 'ended', reason: 'claimed', startedAt: null, endsAt: null, day: 0, daysLeft: 0, today: day(0, 0), total: { used: 0, limit: total } };
    return { status: 'eligible', startedAt: null, endsAt: null, day: 0, daysLeft: TRIAL.days, today: day(0, daily), total: { used: 0, limit: total } };
  }
  const startedAt = a.startedAt;
  const endsAt = startedAt + TRIAL_MS;
  const keys = trialDayKeys(startedAt);
  let used = 0;
  let before = 0;
  for (const k of keys) {
    used += n(byDay[k]);
    if (k < todayKey) before += n(byDay[k]);
  }
  const usedToday = n(byDay[todayKey]);
  const limitToday = Math.min(daily, Math.max(0, total - before));
  const sinceStart = Math.max(0, now - startedAt);
  const dayNo = Math.min(TRIAL.days, Math.floor(sinceStart / DAY_MS) + 1);
  const base = { startedAt, endsAt, total: { used, limit: total } };
  if (now >= endsAt) return { ...base, status: 'ended', reason: 'expired', day: TRIAL.days, daysLeft: 0, today: day(usedToday, 0) };
  if (used >= total) return { ...base, status: 'ended', reason: 'spent', day: dayNo, daysLeft: 0, today: day(usedToday, 0) };
  return { ...base, status: 'active', day: dayNo, daysLeft: Math.max(1, Math.ceil((endsAt - now) / DAY_MS)), today: day(usedToday, limitToday) };
}

// ── one trial a person ──────────────────────────────────────────────

/**
 * An address as one person: lower case, trimmed; the +tag dropped (most providers deliver
 * name+anything to name); for Gmail the dots in the name too, and googlemail.com read as gmail.com.
 * Null for anything that is not an address.
 */
export function normaliseEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().toLowerCase();
  const at = s.lastIndexOf('@');
  if (at < 1 || at === s.length - 1 || /\s/.test(s)) return null;
  let local = s.slice(0, at);
  let domain = s.slice(at + 1);
  const plus = local.indexOf('+');
  if (plus > 0) local = local.slice(0, plus);
  if (domain === 'googlemail.com') domain = 'gmail.com';
  if (domain === 'gmail.com') local = local.replace(/\./g, '');
  return local ? `${local}@${domain}` : null;
}

// ── the words ───────────────────────────────────────────────────────

/** The day's reset, as the server keeps it. */
export const DAY_RESET_WORDS = '00:00 UTC';

/** "Day 3 of 7" */
export const dayOfLine = (s: TrialState) => (s.status === 'active' ? `Day ${s.day} of ${TRIAL.days}` : '');

/** "4 days left" / "Last day" */
export function daysLeftLine(s: TrialState): string {
  if (s.status !== 'active') return '';
  return s.daysLeft <= 1 ? 'Last day of your trial' : `${s.daysLeft} days left in your trial`;
}

/** "8,600 of 10,000 left today" — or, spent, "Today’s 10,000 are used". */
export function todayLine(day: SleepState): string {
  return day.asleep ? `Today’s ${formatTokens(day.limit)} trial tokens are used` : `${formatTokens(day.left)} of ${formatTokens(day.limit)} left today`;
}

/** "resets 00:00 UTC (in 5 h 12 min)" */
export const dayResetLine = (day: SleepState, now: number) => `resets ${DAY_RESET_WORDS} (in ${wakesIn(day.resetAt - now)})`;

/** When the trial ends, in the person's own time where there is one: "Sunday 2:05 pm". */
export function endsAtWords(at: number, opts: { locale?: string; timeZone?: string } = {}): string {
  try {
    return new Intl.DateTimeFormat(opts.locale, { weekday: 'long', hour: 'numeric', minute: '2-digit', ...(opts.timeZone ? { timeZone: opts.timeZone } : {}) }).format(new Date(at));
  } catch {
    return new Date(at).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  }
}

/** What a request refused for the day says — short, and never a scolding. */
export const TRIAL_DAY_NOTE = `You’ve used today’s trial tokens. Socria rests until ${DAY_RESET_WORDS}, and everything you’ve made is still here.`;

/** What a request is told when the trial cannot be read: paused, plainly, and nothing lost (sent with 503). */
// One instruction, said once: the app adds "Your message is back in the box — try sending it again" to a
// failed send, so this sentence does not say to try again as well (it said so twice, November 9, 2026).
export const TRIAL_UNAVAILABLE = 'Your trial can’t be checked right now, so new requests to Socria are paused for a moment. Everything you already have stays open.';

/** What a request refused after the trial says. */
export const TRIAL_ENDED_NOTE = 'Your seven-day trial has ended. New questions, Logic Maps and artifacts need Socria One. Everything you’ve made is still here to open, move and edit.';

/** What an account whose address has had a trial before is told. */
export const TRIAL_CLAIMED_NOTE = 'This email address has already had a Socria trial. New questions, Logic Maps and artifacts need Socria One. Everything you’ve made is still here.';

/** The body of a request refused because the trial is over (sent with 402). */
export function trialEndedRefusal(s: TrialState): { error: string; trialEnded: true; reason: string; startedAt: number | null; endsAt: number | null } {
  return { error: s.reason === 'claimed' ? TRIAL_CLAIMED_NOTE : TRIAL_ENDED_NOTE, trialEnded: true, reason: s.reason ?? 'expired', startedAt: s.startedAt, endsAt: s.endsAt };
}

/** The cookie that tells the guest routes this browser belongs to an account whose trial is over. */
export const TRIAL_ENDED_COOKIE = 'socria_trial_over';

/** What the guest preview says on a browser whose account's trial is over: the preview is not a second trial. */
export const GUEST_AFTER_TRIAL_NOTE = 'This browser’s Socria account has finished its trial, so the guest preview is closed here. Sign in to open everything you made, and continue with Socria One.';

/** The guest routes' refusal for that browser (sent with 402). */
export const guestAfterTrial = () => ({ error: GUEST_AFTER_TRIAL_NOTE, trialEnded: true as const, guestLimit: true as const, requiresKey: true as const });

// ── what a call costs (the metering rules, stated) ──────────────────
//
// Every model call made for a trial account is held before it is made and settled after
// (lib/token-allowance.ts): text input read afresh plus everything written, reasoning included.
// Images are held at a fixed allowance each (IMAGE_TOKENS, 1,500; 100 at low detail) and settled at
// what the provider reports. A web search is counted where what it found is read. Voice is Socria
// One's, so a trial never transcribes. Our own upkeep is never counted, and never runs for an account
// whose trial is over or resting.

/** A rough cost of tokens in US dollars, for the dashboard: SOCRIA_COST_PER_MTOK (dollars a million), else $2.00. */
export function inferenceCost(tokens: number, env: Record<string, string | undefined> = {}): number {
  const rate = Number((env.SOCRIA_COST_PER_MTOK ?? '').trim());
  const perM = Number.isFinite(rate) && rate > 0 ? rate : 2;
  return Math.round(((Math.max(0, tokens) * perM) / 1_000_000) * 100) / 100;
}
