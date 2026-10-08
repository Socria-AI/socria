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
// rationed hard, because Socria is a place to think, and a place to think
// that greets you with an offer every time you come in has stopped being one:
//
//   • one per visit at most (the component keeps the visit, sessionStorage)
//   • never two within ANY_GAP of each other, whichever kinds they are
//   • the same one again no sooner than SAME_GAP
//   • "Not now" puts that one away for NOT_NOW
//   • acting on it (copying the link, opening Logos) for ACTED
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
  /** never two popups by themselves within this long, whichever kinds they are */
  anyGapMs: 20 * HOUR,
  /** the same popup by itself again no sooner than this */
  sameGapMs: 3 * DAY,
  /** after "Not now", that popup waits this long */
  notNowMs: 10 * DAY,
  /** after it was acted on (link copied, Logos opened), that popup waits this long */
  actedMs: 14 * DAY,
  /** how long the surface must have been settled and quiet before one opens */
  settleMs: 2500,
} as const;

/** What this browser remembers about the popups. Times are ms since the epoch. */
export interface PopupMemory {
  shown: Partial<Record<PopupKind, number>>;
  notNow: Partial<Record<PopupKind, number>>;
  acted: Partial<Record<PopupKind, number>>;
}

export const EMPTY_POPUP_MEMORY: PopupMemory = { shown: {}, notNow: {}, acted: {} };

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

/** Whatever was stored, as a memory. Garbage is an empty memory, never a throw. */
export function readPopupMemory(raw: string | null | undefined): PopupMemory {
  if (!raw) return { shown: {}, notNow: {}, acted: {} };
  try {
    const j = JSON.parse(raw) as Record<string, unknown>;
    return { shown: times(j?.shown), notNow: times(j?.notNow), acted: times(j?.acted) };
  } catch {
    return { shown: {}, notNow: {}, acted: {} };
  }
}

export function writePopupMemory(m: PopupMemory): string {
  return JSON.stringify(m);
}

/** The memory with one more thing in it. */
export function remember(m: PopupMemory, kind: PopupKind, what: 'shown' | 'notNow' | 'acted', at: number): PopupMemory {
  return { ...m, [what]: { ...m[what], [kind]: at } };
}

/** The popups that still mean something to this person, whether or not it is time for one. */
export function relevantKinds(facts: PopupFacts): PopupKind[] {
  if (!facts.enabled) return [];
  return POPUP_KINDS.filter((k) => facts[k]);
}

/** Whether `kind` has waited long enough, on this memory, to open by itself. */
export function hasWaited(m: PopupMemory, kind: PopupKind, now: number): boolean {
  const since = (t: number | undefined, gap: number) => t === undefined || now - t >= gap || now < t;
  return (
    since(m.shown[kind], POPUP_RULES.sameGapMs) &&
    since(m.notNow[kind], POPUP_RULES.notNowMs) &&
    since(m.acted[kind], POPUP_RULES.actedMs)
  );
}

/**
 * The popup that may open by itself now, or null.
 *
 * `now < t` counts as waited: a clock set back must not silence the popups for
 * good, and the cost of the other answer is one popup sooner than planned.
 *
 * Of the ones that may, the one shown longest ago goes first — so they take
 * turns — and of two never shown, the challenge: it is the one that is about
 * something to do here, rather than someone to tell.
 */
export function pickPopup(facts: PopupFacts, m: PopupMemory, now: number): PopupKind | null {
  const relevant = relevantKinds(facts);
  if (!relevant.length) return null;
  const lastAny = Math.max(0, ...POPUP_KINDS.map((k) => m.shown[k] ?? 0));
  if (lastAny > 0 && now >= lastAny && now - lastAny < POPUP_RULES.anyGapMs) return null;
  const ready = relevant.filter((k) => hasWaited(m, k, now));
  if (!ready.length) return null;
  return ready.reduce((best, k) => ((m.shown[k] ?? 0) < (m.shown[best] ?? 0) ? k : best), ready[0]);
}
