// lib/starters.ts
//
// The chips on an empty screen.
//
// For someone new these are the four generic openings — there is nothing else
// honest to offer. For someone returning they should be about what that person
// has actually been thinking about, so the empty screen picks up where they
// left off instead of asking them to start over.
//
// Two sources feed them, both already on the client:
//
//   * OPEN THREADS from the Thinking Journey — genuinely unfinished lines of
//     thought, each with the topic and where it was left. The strongest signal
//     there is, because an open thread is by definition not done.
//   * RECENT TITLES — conversations name themselves after the question
//     underneath them ("Ambition vs Security"), which makes a title a
//     serviceable handle for returning to one.
//
// Deterministic and free: no model call, no request, no new state. The same
// choice the draft's node-lighting makes — a cheap rule beats a smart one when
// it runs on every render.

/** An unfinished line of thought, as the journey records it. */
export interface StarterThread {
  topic: string;
  lastTouched?: number;
}

/** A conversation, by the name it gave itself. */
export interface StarterRecent {
  title: string;
  updatedAt?: number;
}

export interface StarterInput {
  threads?: StarterThread[];
  recent?: StarterRecent[];
  /** the generic openings, used for a new person and to top up the rest */
  fallback: string[];
}

/** How many chips the screen shows. */
export const STARTER_COUNT = 4;

/**
 * At least one chip is always a generic opening. However much history someone
 * has, the empty screen must not become a list of old topics with no way to
 * start something new.
 */
const MAX_PERSONAL = STARTER_COUNT - 1;

/** Long enough to name a thought, short enough for one line on a chip. */
const MAX_LEN = 58;

/** Titles a conversation carries before it has earned a real one. */
const UNNAMED = /^(new (thought session|line of thinking|chat|conversation)|untitled|conversation|chat|discussion|session)$/i;

/** Compare on words alone, so "Ambition vs Security" and "ambition vs. security" are one thing. */
function key(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Trim to length at a word boundary rather than mid-word. */
function clip(s: string, max: number): string {
  const t = s.trim().replace(/\s+/g, ' ');
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[,;:.\-\s]+$/, '')}…`;
}

/**
 * A topic reads as a fragment ("whether to launch the private beta"), so it
 * follows "Back to" directly and a leading capital would read as a title.
 *
 * Only these openers are lowered. Nothing about a word's SHAPE distinguishes a
 * sentence-start capital from a proper noun — "Whether" and "Berlin" look
 * identical — so the safe move is to lower a closed set of function words that
 * can never be a name, and leave everything else exactly as written.
 */
const OPENERS = new Set([
  'a', 'an', 'the', 'my', 'our', 'this', 'that', 'these', 'those',
  'whether', 'how', 'what', 'why', 'when', 'where', 'which', 'who',
  'if', 'should', 'could', 'would', 'do', 'does', 'is', 'are', 'was',
  'going', 'getting', 'trying', 'picking', 'choosing', 'deciding',
]);

function lowerFirst(s: string): string {
  if (!s) return s;
  const first = s.split(/[\s,]/)[0];
  if (!OPENERS.has(first.toLowerCase())) return s;
  return s[0].toLowerCase() + s.slice(1);
}

function usable(s: unknown): s is string {
  return typeof s === 'string' && s.trim().length > 2 && !UNNAMED.test(s.trim());
}

/**
 * The chips to show, most personal first, always exactly `count` of them and
 * always ending with at least one generic opening.
 */
export function buildStarters(input: StarterInput, count = STARTER_COUNT): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  const add = (text: string, k: string): void => {
    if (out.length >= MAX_PERSONAL || seen.has(k)) return;
    // a title that restates a thread already offered is not a second choice
    for (const s of seen) if (s.includes(k) || k.includes(s)) return;
    seen.add(k);
    out.push(text);
  };

  const threads = (input.threads ?? [])
    .filter((t) => usable(t?.topic))
    .sort((a, b) => (b.lastTouched ?? 0) - (a.lastTouched ?? 0));
  for (const t of threads) add(`Back to ${clip(lowerFirst(t.topic.trim()), MAX_LEN - 9)}`, key(t.topic));

  const recent = (input.recent ?? [])
    .filter((r) => usable(r?.title))
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  for (const r of recent) add(`More on ${clip(r.title.trim(), MAX_LEN - 8)}`, key(r.title));

  // top up with the generic openings, skipping any already offered
  for (const f of input.fallback) {
    if (out.length >= count) break;
    const k = key(f);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(f);
  }
  return out.slice(0, count);
}
