// lib/find.ts
//
// Find inside the open conversation.
//
// DEFAULTS TO WHAT YOU SAID, and that is the whole design idea rather than a
// preference: in a long thread the line somebody is hunting for is almost
// always their own. Searching everything by default buries it under the
// replies, which are longer and more numerous and were not written by them.
//
// Pure, so the suite can hold the two things that actually go wrong — a
// filter that quietly drops turns, and a highlighter that mangles the text
// around the match.

export type Speaker = 'you' | 'socria';
export type FindScope = Speaker | 'all';

export interface Turn {
  role: string;
  text?: string;
  insight?: { text?: string };
}

export interface Said {
  /** index into the original turn list, so a hit can jump to it */
  i: number;
  who: Speaker;
  text: string;
}

/**
 * Flatten a thread into searchable lines.
 *
 * An insight card carries its sentence on `insight.text` rather than `text`,
 * and it is the single most searched-for thing in a long conversation — the
 * one line somebody remembers and wants to find again. Missing it would make
 * find look broken exactly when it mattered.
 */
export function saidIn(turns: readonly Turn[] | null | undefined): Said[] {
  const out: Said[] = [];
  (turns ?? []).forEach((t, i) => {
    if (!t || typeof t.role !== 'string') return;
    const text = t.role === 'insight' ? t.insight?.text : t.text;
    if (typeof text !== 'string' || !text) return;
    out.push({ i, who: t.role === 'user' ? 'you' : 'socria', text });
  });
  return out;
}

/** How many lines each tab would show. */
export function countsOf(said: readonly Said[]): { you: number; socria: number; all: number } {
  const you = said.filter((s) => s.who === 'you').length;
  return { you, socria: said.length - you, all: said.length };
}

/**
 * The matching lines, in thread order.
 *
 * An empty query shows the whole scope rather than nothing: opening find and
 * seeing a blank panel reads as "there is nothing here", when what it means
 * is "you have not typed yet".
 */
export function findIn(
  said: readonly Said[],
  query: string,
  scope: FindScope = 'you'
): Said[] {
  const pool = said.filter((s) => scope === 'all' || s.who === scope);
  const q = (query ?? '').trim().toLowerCase();
  if (!q) return pool.slice();
  return pool.filter((s) => s.text.toLowerCase().includes(q));
}

export interface Piece {
  text: string;
  hit: boolean;
}

/**
 * Split a line around the FIRST match, for highlighting.
 *
 * Returns pieces rather than markup so the renderer decides what a hit looks
 * like, and so this can be tested without a DOM. Case-insensitive on the
 * match, but every piece is sliced from the ORIGINAL string — highlighting
 * must never change the casing of somebody's own sentence, which is what
 * happens the moment you build the output from the lowercased copy.
 */
export function splitMatch(text: string, query: string): Piece[] {
  const t = typeof text === 'string' ? text : '';
  const q = (query ?? '').trim();
  if (!q) return [{ text: t, hit: false }];
  const i = t.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return [{ text: t, hit: false }];
  const out: Piece[] = [];
  if (i > 0) out.push({ text: t.slice(0, i), hit: false });
  out.push({ text: t.slice(i, i + q.length), hit: true });
  if (i + q.length < t.length) out.push({ text: t.slice(i + q.length), hit: false });
  return out;
}
