// lib/starters.ts
//
// The chips on an empty screen.
//
// A chip is not a label. Pressing one SENDS its text as a message, so whatever
// is on it has to be a thing worth saying — and that is where this used to go
// wrong. It wrote "More on " in front of a conversation's title, which is fine
// when a title is a noun phrase ("Ambition vs Security") and nonsense when it
// is the person's own first sentence, which is what a title actually is until
// something renames it:
//
//     More on Why did concert ticket prices go up when the…
//     More on I don't understand why the production…
//
// Three separate faults in one line. It prefixed a sentence as though it were
// a topic; it pointed BACKWARD at what was already asked instead of forward at
// what might be asked next; and because the chip's text was also the message,
// the truncation went out with it — pressing that chip sent a question cut off
// mid-clause.
//
// So a starter is now a pair. `label` is what the chip shows, clipped to fit;
// `prompt` is what gets sent, never clipped. And the sources are ordered by
// how much they actually know about this person:
//
//   1. SUGGESTIONS — questions the journey extractor proposed for this person
//      specifically, from what they have been working through. The only source
//      that can look forward, and the reason the others are fallbacks.
//   2. PENDING — a map's own unfinished business: an open question, a tension
//      nobody resolved, an assumption never tested. Free, exact, and available
//      the moment a map exists.
//   3. OPEN THREADS — unfinished lines of thought from the Thinking Journey,
//      each already a short noun phrase by contract.
//   4. RECENT TITLES — the weakest, and now shape-aware: a noun phrase takes
//      "More on", a sentence is offered as itself, and nothing is prefixed
//      onto a sentence ever again.
//
// Everything but the first is deterministic and free: no model call, no
// request, no new state.

/** A chip: what it shows, and what pressing it says. */
export interface Starter {
  label: string;
  prompt: string;
}

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

/** A node on a map that has not been resolved. */
export interface StarterPending {
  label: string;
  type: string;
  /** when the map it belongs to was last touched, for ordering */
  updatedAt?: number;
}

export interface StarterInput {
  /** proposed next questions, already in the person's own voice */
  suggestions?: string[];
  pending?: StarterPending[];
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
 * Does this read as a sentence someone said, rather than a topic?
 *
 * The distinction decides whether anything may be written in front of it.
 * "Ambition vs Security" is a handle and takes "More on"; "Why did ticket
 * prices go up" is already a whole utterance and takes nothing.
 *
 * Three signals, any one of which is enough: it ends in a question mark, it
 * opens with a word that can only begin a clause, or it is simply long — past
 * about eight words nothing is a title any more, whatever it starts with.
 */
const CLAUSE_OPENERS = new Set([
  'i', "i'm", 'im', "i've", 'ive', "i'd", 'id', "i'll",
  'why', 'how', 'what', 'when', 'where', 'who', 'which', 'whose',
  'is', 'are', 'was', 'were', 'do', 'does', 'did', 'can', 'could',
  'should', 'would', 'will', 'has', 'have', 'had', 'help', 'explain',
  'tell', 'show', 'give', 'find', 'solve', 'prove', 'let', 'if',
  "don't", 'dont', "doesn't", 'doesnt', "isn't", 'isnt', 'we', 'my',
]);

export function isSentence(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  if (/[?!]$/.test(t)) return true;
  const words = t.split(/\s+/);
  if (words.length > 8) return true;
  const first = words[0].toLowerCase().replace(/[^a-z']/g, '');
  return CLAUSE_OPENERS.has(first);
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
 * How to reopen an unresolved node, by what kind of thing it is.
 *
 * Only the types where a single opener genuinely fits are here. A `question`
 * node is already a question and is sent as written; a `goal` or an `idea` is
 * not unfinished business and never becomes a chip at all. Anything missing
 * from this table is simply not offered, which is the right default — a chip
 * that does not quite parse is worse than one fewer chip.
 */
const PENDING_OPENER: Record<string, (label: string) => string> = {
  question: (l) => l,
  tension: (l) => `Work through the tension: ${l}`,
  counterpoint: (l) => `Take seriously the objection that ${lowerFirst(l)}`,
  assumption: (l) => `Test the assumption that ${lowerFirst(l)}`,
  misconception: (l) => `Clear up ${lowerFirst(l)}`,
  conjecture: (l) => `Try to prove ${lowerFirst(l)}`,
  unknown: (l) => `Solve for ${lowerFirst(l)}`,
  error: (l) => `Go back to where it went wrong: ${l}`,
};

/** The node types worth reopening, for callers that filter before passing. */
export const PENDING_TYPES: readonly string[] = Object.keys(PENDING_OPENER);

/**
 * The chips to show, most personal first, always exactly `count` of them and
 * always ending with at least one generic opening.
 */
export function buildStarters(input: StarterInput, count = STARTER_COUNT): Starter[] {
  const out: Starter[] = [];
  const seen = new Set<string>();
  const maxPersonal = Math.max(0, Math.min(MAX_PERSONAL, count - 1));

  const add = (prompt: string, k: string): void => {
    if (out.length >= maxPersonal || seen.has(k)) return;
    // a chip that restates one already offered is not a second choice
    for (const s of seen) if (s.includes(k) || k.includes(s)) return;
    seen.add(k);
    out.push({ label: clip(prompt, MAX_LEN), prompt: prompt.trim().replace(/\s+/g, ' ') });
  };

  // 1. what the extractor thinks they would ask next
  for (const q of input.suggestions ?? []) {
    if (usable(q)) add(q.trim(), key(q));
  }

  // 2. a map's unfinished business
  const pending = (input.pending ?? [])
    .filter((n) => usable(n?.label) && PENDING_OPENER[n.type])
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  for (const n of pending) {
    add(PENDING_OPENER[n.type](n.label.trim().replace(/[.]+$/, '')), key(n.label));
  }

  // 3. unfinished lines of thought
  const threads = (input.threads ?? [])
    .filter((t) => usable(t?.topic))
    .sort((a, b) => (b.lastTouched ?? 0) - (a.lastTouched ?? 0));
  for (const t of threads) add(`Back to ${lowerFirst(t.topic.trim())}`, key(t.topic));

  // 4. conversations by name — and only a name may be prefixed
  const recent = (input.recent ?? [])
    .filter((r) => usable(r?.title))
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  for (const r of recent) {
    const title = r.title.trim();
    add(isSentence(title) ? title : `More on ${title}`, key(title));
  }

  // top up with the generic openings, skipping any already offered
  for (const f of input.fallback) {
    if (out.length >= count) break;
    const k = key(f);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ label: clip(f, MAX_LEN), prompt: f });
  }
  return out.slice(0, count);
}
