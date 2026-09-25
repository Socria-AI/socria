// lib/core4/activity.ts
//
// The word under the dots, and it has to be true.
//
// "thinking" for eleven seconds while Socria reads four database tables, runs a
// search, checks somebody's arithmetic and compares two options is not wrong so
// much as uninformative — and the operations it is actually performing are the
// most interesting thing about the product. So the indicator says which one.
//
// THE RULE THAT MAKES THIS WORTH HAVING: never say an operation that is not
// happening. Every state below is emitted from the place that actually does the
// work, at the moment it starts, and nothing here invents or rotates a synonym
// for variety. If the only thing running is generation, the word is "thinking",
// which is the honest default rather than the boring one.
//
// PRESENTATION ONLY. Nothing in this file reaches the model, changes a move,
// costs a call or alters what Core 4 does. It is a reading of orchestration that
// was already happening, and it can be deleted without changing a reply.

/**
 * What the person sees, in the order that decides ties.
 *
 * Earlier wins when two things are genuinely running at once: retrieval and
 * reading are the operations somebody would most want named, and generation is
 * last because it is always true and therefore says the least.
 */
export const ACTIVITIES = [
  'searching',     // a query is out to a search provider
  'reading',       // fetched pages are being read
  'remembering',   // the record of earlier conversations is being read
  'connecting',    // relationships across that record are being computed
  'calculating',   // arithmetic they posed is being evaluated exactly
  'checking',      // their own work is being checked
  'verifying',     // the reply is being checked before it is sent
  'comparing',     // options are being weighed against each other
  'examining',     // premises are being ablated, contradictions tested
  'organizing',    // their material is being put in order
  'mapping',       // structure is being made visible
  'synthesizing',  // several sources are being pulled together
  'thinking',      // the honest default
] as const;
export type Activity = (typeof ACTIVITIES)[number];

const RANK = new Map<Activity, number>(ACTIVITIES.map((a, i) => [a, i]));

/** The line format on the wire. U+0001 cannot occur in model prose or in text a person types. */
export const ACTIVITY_MARK = '\u0001';
export function encodeActivity(a: Activity): string {
  return `${ACTIVITY_MARK}${a}\n`;
}

/**
 * Pull activity markers out of a stream chunk, leaving the prose.
 *
 * Tolerates a marker split across chunk boundaries by returning the unconsumed
 * tail, which the caller prepends to the next chunk — a partial line is not an
 * activity yet and must not be printed as text either.
 */
export function readActivity(chunk: string): { text: string; activities: Activity[]; tail: string } {
  const activities: Activity[] = [];
  let text = '';
  let rest = chunk;
  for (;;) {
    const at = rest.indexOf(ACTIVITY_MARK);
    if (at === -1) return { text: text + rest, activities, tail: '' };
    text += rest.slice(0, at);
    const end = rest.indexOf('\n', at);
    if (end === -1) return { text, activities, tail: rest.slice(at) };
    const word = rest.slice(at + 1, end);
    if ((ACTIVITIES as readonly string[]).includes(word)) activities.push(word as Activity);
    rest = rest.slice(end + 1);
  }
}

/**
 * Which word to show, given what is running.
 *
 * NOT THE NEWEST ONE. Several stages overlap by design — research runs beside
 * the state read, the measure stage runs beside nothing else — and a display
 * that followed the newest event would flicker between two true words several
 * times a second. The most meaningful one wins, and it only changes when the
 * winner changes.
 */
export function shownActivity(running: readonly Activity[]): Activity {
  let best: Activity = 'thinking';
  for (const a of running) {
    if ((RANK.get(a) ?? 99) < (RANK.get(best) ?? 99)) best = a;
  }
  return best;
}

/**
 * A display that will not flicker.
 *
 * MINIMUM DWELL, because the truth changes faster than a person can read. The
 * state read finishes in 300 ms on a warm connection, and a word that appears
 * and vanishes inside half a second is noise wearing the costume of information.
 * Once shown, a word stays for at least `dwellMs` even if its operation has
 * finished — it did happen, and saying so a moment longer is honest.
 *
 * Pure and clock-injected, so the whole behaviour is testable without a timer.
 */
export class ActivityTrack {
  private running = new Set<Activity>();
  private shown: Activity = 'thinking';
  private shownAt = 0;
  constructor(private readonly dwellMs = 700) {}

  /** An operation started. Returns the word to display now. */
  start(a: Activity, now: number): Activity {
    this.running.add(a);
    return this.settle(now);
  }

  /** An operation finished. Returns the word to display now. */
  end(a: Activity, now: number): Activity {
    this.running.delete(a);
    return this.settle(now);
  }

  current(): Activity {
    return this.shown;
  }

  private settle(now: number): Activity {
    const want = shownActivity([...this.running]);
    if (want === this.shown) return this.shown;
    // A word that has not had its moment yet holds the display. The next
    // start/end settles it, and generation outlasts every one of these anyway.
    if (now - this.shownAt < this.dwellMs && this.shown !== 'thinking') return this.shown;
    this.shown = want;
    this.shownAt = now;
    return this.shown;
  }
}
