// lib/rewards/popup-rule.ts
//
// WHEN A SOCRIA REWARDS POPUP MAY OPEN BY ITSELF — and the answer is "rarely".
//
// Two popups, one per reward:
//
//   'give'       Give 7, Get 7 — the person's own link, to send a friend
//   'challenge'  the 5-Node Challenge — how far their best map has come
//
// Either can be opened at any time from its icon beside the Socria mark; that
// is the person asking, and it is never rationed. This file decides only the
// other case: a popup that opens on its own when someone arrives. That one is
// rationed, because Socria is a place to think, and a place to think that
// greets you with an offer every time you come in has stopped being one —
// but it is a roll of the dice rather than a timetable, so it feels
// occasional to somebody who opens Socria once a day and to somebody who
// opens it six times:
//
//   • one per visit at most, decided on arrival (the component keeps the
//     visit in sessionStorage)
//   • a browser's first two arrivals: nothing; on the third, the challenge
//     if it is open — its week is short
//   • after that, a chance on each arrival: 1 in 3, or 1 in 4 once only the
//     gift is left (the challenge done, or out of reach)
//   • never two within a day, and no more than three a week (two when only
//     the gift is left)
//   • the same one again no sooner than four days
//   • "Not now" puts that one away for four days; three in a row, two months
//   • acting on it (copying the link, opening Logos) for fourteen days
//   • when both may open, the challenge 60%, the gift 40%
//   • only while it still means something: a link to share; a challenge
//     still open — never one already done, never to a member it can't help
//
// The rewards themselves are the server's (lib/rewards/rewards-service.ts):
// nothing here grants, counts or stacks anything. What stacks, and how, is
// promo-engine.ts rule 2 — the popups say it; they do not decide it.
//
// PURE: no storage, no clock of its own. The memory is handed in as a value
// and handed back changed.

export const POPUP_KINDS = ['challenge', 'give'] as const;
export type PopupKind = (typeof POPUP_KINDS)[number];

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export const POPUP_RULES = {
  /** the chance one opens on an arrival, once everything else allows it */
  chance: 1 / 3,
  /** …once only the gift is left (the challenge done, or not theirs to do) */
  giveOnlyChance: 1 / 4,
  /** when both may open: how often it is the challenge */
  challengeWeight: 0.6,
  /** never two popups by themselves within this long, whichever kinds they are */
  anyGapMs: 20 * HOUR,
  /** no more than this many by themselves in seven days */
  weekCap: 3,
  /** …or this many once only the gift is left */
  giveOnlyWeekCap: 2,
  /** the same popup by itself again no sooner than this */
  sameGapMs: 4 * DAY,
  /** after "Not now", that popup waits this long */
  notNowMs: 4 * DAY,
  /** "Not now" this many times in a row… */
  notNowRun: 3,
  /** …and that popup rests this long */
  notNowRunMs: 60 * DAY,
  /** after it was acted on (link copied, Logos opened), that popup waits this long */
  actedMs: 14 * DAY,
  /** a browser's first arrivals, which nothing opens on */
  quietOpens: 2,
  /** how long the surface must have been settled and quiet before one opens */
  settleMs: 2500,
} as const;

const WEEK = 7 * DAY;

/** What this browser remembers about the popups. Times are ms since the epoch. */
export interface PopupMemory {
  shown: Partial<Record<PopupKind, number>>;
  notNow: Partial<Record<PopupKind, number>>;
  acted: Partial<Record<PopupKind, number>>;
  /** "Not now" in a row, per popup — set back to nothing when they act on it */
  notNowRun: Partial<Record<PopupKind, number>>;
  /** when any popup opened by itself, the last fortnight only — for the week's cap */
  history: number[];
  /** arrivals that reached the roll, in this browser */
  opens: number;
}

export const EMPTY_POPUP_MEMORY: PopupMemory = Object.freeze({
  shown: Object.freeze({}),
  notNow: Object.freeze({}),
  acted: Object.freeze({}),
  notNowRun: Object.freeze({}),
  history: Object.freeze([]) as unknown as number[],
  opens: 0,
}) as PopupMemory;

const fresh = (): PopupMemory => ({ shown: {}, notNow: {}, acted: {}, notNowRun: {}, history: [], opens: 0 });

/** What the server said that decides whether a popup still means anything. */
export interface PopupFacts {
  /** rewards are on, and the person is signed in */
  enabled: boolean;
  /** they have a link to give */
  give: boolean;
  /** the challenge is open to them and not yet done */
  challenge: boolean;
}

const isKind = (k: unknown): k is PopupKind => typeof k === 'string' && (POPUP_KINDS as readonly string[]).includes(k);

function times(raw: unknown): Partial<Record<PopupKind, number>> {
  const out: Partial<Record<PopupKind, number>> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (isKind(k) && typeof v === 'number' && Number.isFinite(v) && v > 0) out[k] = v;
  }
  return out;
}

function counts(raw: unknown): Partial<Record<PopupKind, number>> {
  const out: Partial<Record<PopupKind, number>> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (isKind(k) && typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 1000) out[k] = v;
  }
  return out;
}

/** Whatever was stored, as a memory. Garbage is an empty memory, never a throw. */
export function readPopupMemory(raw: string | null | undefined): PopupMemory {
  if (!raw) return fresh();
  try {
    const j = JSON.parse(raw) as Record<string, unknown>;
    const history = Array.isArray(j?.history)
      ? (j.history as unknown[]).filter((t): t is number => typeof t === 'number' && Number.isFinite(t) && t > 0).slice(-20)
      : [];
    const opens = typeof j?.opens === 'number' && Number.isInteger(j.opens) && j.opens >= 0 ? Math.min(j.opens, 1_000_000) : 0;
    return { shown: times(j?.shown), notNow: times(j?.notNow), acted: times(j?.acted), notNowRun: counts(j?.notNowRun), history, opens };
  } catch {
    return fresh();
  }
}

export function writePopupMemory(m: PopupMemory): string {
  return JSON.stringify(m);
}

/** The memory with one more thing in it. */
export function remember(m: PopupMemory, kind: PopupKind, what: 'shown' | 'notNow' | 'acted', at: number): PopupMemory {
  const next: PopupMemory = { ...m, [what]: { ...m[what], [kind]: at } };
  const run = m.notNowRun ?? {};
  if (what === 'shown') next.history = [...(m.history ?? []), at].filter((t) => at - t < 2 * WEEK).slice(-20);
  if (what === 'notNow') next.notNowRun = { ...run, [kind]: (run[kind] ?? 0) + 1 };
  if (what === 'acted') next.notNowRun = { ...run, [kind]: 0 };
  return next;
}

/** One more arrival, counted before the roll. */
export function countOpen(m: PopupMemory): PopupMemory {
  return { ...m, opens: Math.min((m.opens ?? 0) + 1, 1_000_000) };
}

/** The popups that still mean something to this person, whether or not it is time for one. */
export function relevantKinds(facts: PopupFacts): PopupKind[] {
  if (!facts.enabled) return [];
  return POPUP_KINDS.filter((k) => facts[k]);
}

/** Whether `kind` has waited long enough, on this memory, to open by itself. */
export function hasWaited(m: PopupMemory, kind: PopupKind, now: number): boolean {
  const since = (t: number | undefined, gap: number) => t === undefined || now - t >= gap || now < t;
  const putAway = (m.notNowRun?.[kind] ?? 0) >= POPUP_RULES.notNowRun ? POPUP_RULES.notNowRunMs : POPUP_RULES.notNowMs;
  return (
    since(m.shown[kind], POPUP_RULES.sameGapMs) &&
    since(m.notNow[kind], putAway) &&
    since(m.acted[kind], POPUP_RULES.actedMs)
  );
}

/**
 * The popup that may open by itself now, or null.
 *
 * Counted, then rolled: the arrival is counted first (countOpen), the caps and
 * waits decide what COULD open, and then a die decides whether anything does.
 * `rand` is handed in so the rule stays pure and a test can name the roll.
 *
 * `now < t` counts as waited: a clock set back must not silence the popups for
 * good, and the cost of the other answer is one popup sooner than planned.
 */
export function pickPopup(facts: PopupFacts, m: PopupMemory, now: number, rand: () => number = Math.random): PopupKind | null {
  const relevant = relevantKinds(facts);
  if (!relevant.length) return null;
  const opens = m.opens ?? 0;
  // a browser's first arrivals belong to whatever it came for
  if (opens <= POPUP_RULES.quietOpens) return null;
  const lastAny = Math.max(0, ...POPUP_KINDS.map((k) => m.shown[k] ?? 0));
  if (lastAny > 0 && now >= lastAny && now - lastAny < POPUP_RULES.anyGapMs) return null;
  const giveOnly = !relevant.includes('challenge');
  const week = (m.history ?? []).filter((t) => t <= now && now - t < WEEK).length;
  if (week >= (giveOnly ? POPUP_RULES.giveOnlyWeekCap : POPUP_RULES.weekCap)) return null;
  const ready = relevant.filter((k) => hasWaited(m, k, now));
  if (!ready.length) return null;
  // the first arrival after the quiet ones: the challenge, if it is open and
  // has never been shown — no roll, because its week is short
  if (opens === POPUP_RULES.quietOpens + 1 && ready.includes('challenge') && m.shown.challenge === undefined) return 'challenge';
  if (rand() >= (giveOnly ? POPUP_RULES.giveOnlyChance : POPUP_RULES.chance)) return null;
  if (ready.length === 1) return ready[0];
  return rand() < POPUP_RULES.challengeWeight ? 'challenge' : 'give';
}
