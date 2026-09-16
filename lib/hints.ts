// lib/hints.ts
//
// One-line hints, shown once.
//
// The rule that makes them bearable is the one the design states plainly:
// never a tour, never sequenced, never more than one on screen. A hint is a
// single sentence beside the thing it describes, dismissing it is a quiet
// "got it", and the account sheet can bring them all back.
//
// That last part matters more than it sounds. A product that can only ever
// teach you something once punishes the person who dismissed a hint before
// reading it, so the reset is not a debug affordance — it is the thing that
// makes showing hints at all defensible.
//
// Pure, because the failure here is not the markup. It is showing a hint
// twice, showing three at once, or showing one to somebody who dismissed it
// a month ago.

/** The order a first-time visitor should meet them in. */
export const HINT_ORDER = ['insight', 'picker', 'logos', 'find'] as const;
export type HintId = (typeof HINT_ORDER)[number];

export const HINT_KEY = 'socria.hints.seen.v1';

/**
 * The one hint to show, out of those the screen could currently justify.
 *
 * ONLY THE FIRST eligible unseen one, in HINT_ORDER — never the first
 * eligible, and never all of them. Two hints on screen at once is the moment
 * a hint stops reading as help and starts reading as a tour, which is the
 * thing this is deliberately not.
 */
export function pickHint(eligible: readonly string[], seen: readonly string[]): HintId | null {
  return (
    HINT_ORDER.find((id) => eligible.includes(id) && !seen.includes(id)) ?? null
  );
}

/**
 * Read the dismissed set.
 *
 * TWO FAILURES, DELIBERATELY TREATED DIFFERENTLY — they look identical from
 * a single try/catch and they are not:
 *
 *   The STORE throws (a private window, blocked site data). We cannot know
 *   what this person has seen, and interrupting somebody who has dismissed
 *   everything is worse than staying quiet, so it reads as "all seen".
 *
 *   The VALUE is corrupt (a half-written key, an older shape). Reading that
 *   as "all seen" would let one bad key permanently disable every hint with
 *   nothing to notice. It reads as "none seen" and the next dismissal
 *   overwrites the garbage.
 */
export function readSeen(store: Pick<Storage, 'getItem'> | null | undefined): string[] {
  let raw: string | null;
  try {
    raw = store?.getItem(HINT_KEY) ?? null;
  } catch {
    return HINT_ORDER.slice();
  }
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Mark one dismissed, idempotently. */
export function markSeen(
  store: Pick<Storage, 'getItem' | 'setItem'> | null | undefined,
  id: string
): string[] {
  const seen = readSeen(store);
  if (!seen.includes(id)) seen.push(id);
  try {
    store?.setItem(HINT_KEY, JSON.stringify(seen));
  } catch {
    /* the hint still hides for this session */
  }
  return seen;
}

/** Bring them all back — the account sheet's "Show hints again". */
export function resetSeen(store: Pick<Storage, 'setItem'> | null | undefined): void {
  try {
    store?.setItem(HINT_KEY, '[]');
  } catch {}
}
