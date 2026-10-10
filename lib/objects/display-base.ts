// THE EVERYDAY DISPLAYS — shared ground for the kinds in display-*.ts.
//
// A plan, a comparison, an argument, a worksheet, a chart of the person's own
// numbers: each is an OBJECT OF THOUGHT (core.ts), so it persists, syncs,
// keeps a computed history the person can step back through, and is read
// back to the conversation — nothing here is a second system. What the kinds
// share lives in this file:
//
//   CANONICAL STATE. A kind's `sanitize` returns one canonical form, and every
//   operation returns `sanitize(next)`, so a state read back from storage is
//   the state the operation computed (core.ts re-computes every step on load
//   and keeps a step only if the two agree).
//
//   DETERMINISM. An operation's result depends only on the state and its
//   arguments — never the clock, never chance. Anything that depends on "now"
//   (a relative date, a fresh scenario) is resolved by `readOp` at the moment
//   the person writes and travels in the arguments.
//
//   AUTHORSHIP. Everything the person or Socria put into a display carries
//   `by`. Socria may add, suggest and change what it wrote; what the person
//   wrote changes only when the person changes it (`guardOwn`). Who applied a
//   step is checked against who the arguments say wrote it (`guardBy`), so it
//   is recorded, never claimed.
//
//   HONEST CONTENT. Nothing in a display is invented to fill a gap: a number
//   the person did not give is empty, not guessed; example data is labelled
//   as example data (display-data.ts `basis`).
//
// PURE.

import type { ObjectKind, OpDef, Part, ViewDecl } from './core';

export type By = 'person' | 'socria';
export type Args = Record<string, string | number>;
export type Ctx = { replay?: boolean; by?: By } | undefined;

export const cleanBy = (v: unknown): By => (v === 'person' ? 'person' : 'socria');

// ── text ─────────────────────────────────────────────────────────────

/**
 * Words a person might see, made safe to keep: control characters out,
 * whitespace collapsed, capped at a word boundary. Not a string → ''.
 */
export function cleanText(v: unknown, max: number): string {
  if (typeof v !== 'string' && typeof v !== 'number') return '';
  // eslint-disable-next-line no-control-regex
  const s = String(v).replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return (sp > 0 && sp >= max * 0.5 ? cut.slice(0, sp) : cut).trim();
}

/** An identifier for something inside a display: short, plain, stable. */
export function cleanId(v: unknown): string | null {
  return typeof v === 'string' && /^[A-Za-z0-9_-]{1,24}$/.test(v) ? v : null;
}

/** The next free id with a prefix: i1, i2 … — from the ids already taken, never from a counter or the clock. */
export function nextId(prefix: string, taken: Iterable<string>): string {
  let max = 0;
  const re = new RegExp(`^${prefix}(\\d+)$`);
  for (const t of taken) {
    const m = re.exec(t);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}${max + 1}`;
}

/** Lower case, punctuation out, articles off the front — for matching what a person wrote against labels. */
export function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(the|a|an|my|our|this|that)\s+/, '');
}

const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'into', 'onto', 'about', 'your', 'their', 'this', 'that', 'what', 'when', 'then', 'than', 'have', 'has', 'are', 'was', 'were', 'will', 'its', 'our', 'out', 'off', 'all', 'any', 'one', 'two', 'next', 'week', 'day', 'days', 'back', 'move', 'mark', 'done', 'add', 'remove', 'delete', 'rename', 'push', 'show']);
const wordsOf = (s: string) => norm(s).split(' ').filter((w) => w.length >= 3 && !STOP.has(w));

/**
 * The thing a sentence names, by its label.
 *
 *   1. The item whose whole label appears in the words — the longest such
 *      label wins, so "essay draft" beats "essay".
 *   2. Otherwise the item the words name most of: "the essay draft" names
 *      "History essay draft" (two of its three words), "the midterm" names
 *      "Calculus midterm" because no other label has that word.
 *
 * Null when nothing is plainly named, or when two things are named equally —
 * a guess here would edit the wrong thing.
 */
export function findByLabel<T>(list: readonly T[], label: (t: T) => string, text: string): T | null {
  const said = ` ${norm(text)} `;
  let best: T | null = null;
  let bestLen = 0;
  for (const t of list) {
    const l = norm(label(t));
    if (l.length >= 2 && said.includes(` ${l} `) && l.length > bestLen) {
      best = t;
      bestLen = l.length;
    }
  }
  if (best) return best;
  // how many labels each word appears in: a word only one label has is a name
  const df = new Map<string, number>();
  for (const t of list) for (const w of new Set(wordsOf(label(t)))) df.set(w, (df.get(w) ?? 0) + 1);
  let top: T | null = null;
  let topScore = 0;
  let tie = false;
  for (const t of list) {
    const words = [...new Set(wordsOf(label(t)))];
    if (!words.length) continue;
    const hit = words.filter((w) => said.includes(` ${w} `));
    if (!hit.length) continue;
    const share = hit.length / words.length;
    const named = (hit.length >= 2 && share >= 0.5) || share >= 0.6 || (hit.length === 1 && hit[0].length >= 5 && df.get(hit[0]) === 1);
    if (!named) continue;
    const score = share + hit.length * 0.01;
    if (score > topScore + 1e-9) {
      top = t;
      topScore = score;
      tie = false;
    } else if (Math.abs(score - topScore) <= 1e-9) tie = true;
  }
  return tie ? null : top;
}

/** What follows a colon, or what is in quotes — the words a person is adding. */
export function quotedOrAfterColon(text: string): string | null {
  const q = /[“"']([^“”"']{1,400})[”"']/.exec(text);
  if (q) return q[1].trim();
  const c = text.indexOf(':');
  if (c >= 0 && c < text.length - 1) return text.slice(c + 1).trim() || null;
  return null;
}

// ── numbers ──────────────────────────────────────────────────────────

/** A finite number within bounds, or null. Strings like "1,200" and "$15" are read. */
export function num(v: unknown, lo = -1e12, hi = 1e12): number | null {
  let n: number;
  if (typeof v === 'number') n = v;
  else if (typeof v === 'string' && v.trim()) n = Number(v.replace(/[,$£€\s]/g, ''));
  else return null;
  if (!Number.isFinite(n) || n < lo || n > hi) return null;
  // stored to 10 significant figures, so a number survives a round trip unchanged
  return Number(n.toPrecision(10));
}

/** A number as a person reads it: no float noise, thousands grouped. */
export function sayNum(n: number, digits = 2): string {
  const r = Number(n.toFixed(digits));
  return r.toLocaleString('en-US', { maximumFractionDigits: digits });
}

// ── dates: calendar days, in UTC ─────────────────────────────────────

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** A real calendar day as YYYY-MM-DD, or null — "2026-02-30" is not one. */
export function isoDay(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1 || mo < 1 || mo > 12 || d < 1) return null;
  const t = Date.UTC(y, mo - 1, d);
  const back = new Date(t);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  return v.trim();
}

const dayMs = 86_400_000;
const toDay = (t: number) => new Date(t).toISOString().slice(0, 10);
const fromDay = (d: string) => Date.parse(`${d}T00:00:00Z`);

export function addDays(day: string, n: number): string {
  return toDay(fromDay(day) + Math.round(n) * dayMs);
}
/** Whole days from a to b. */
export function dayDiff(a: string, b: string): number {
  return Math.round((fromDay(b) - fromDay(a)) / dayMs);
}
/** Today, as a calendar day in UTC — only ever read where the person is writing, never inside an operation. */
export const todayDay = (): string => toDay(Date.now());

/** Today on the person's own calendar — what a browser sends, so "next Friday" is their Friday, not the server's. */
export function localDay(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "20 Oct 2026" */
export function sayDay(day: string): string {
  const t = fromDay(day);
  const d = new Date(t);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3).replace(/^./, (c) => c.toUpperCase())} ${d.getUTCFullYear()}`;
}

function monthIndex(word: string): number {
  const w = word.toLowerCase().replace(/\.$/, '');
  if (w.length < 3) return -1;
  return MONTHS.findIndex((m) => m.startsWith(w));
}

/**
 * A calendar day out of words, against today: "2026-10-20", "Oct 20",
 * "20 October 2026", "10/20", "tomorrow", "in 3 days", "next week", "Friday",
 * "next Friday". A date with no year is the next one on or after today, so
 * "Jan 15" said in October is next January. Null when the words hold no day.
 */
export function readDay(text: string, today: string): string | null {
  const t = text.toLowerCase();
  let m = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/.exec(t);
  if (m) return isoDay(`${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`);
  const upcoming = (mo: number, d: number, y?: number) => {
    if (y) return isoDay(`${y}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    const ty = Number(today.slice(0, 4));
    const thisYear = isoDay(`${ty}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    if (thisYear && dayDiff(today, thisYear) >= 0) return thisYear;
    return isoDay(`${ty + 1}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  };
  m = /\b([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/.exec(t);
  if (m && monthIndex(m[1]) >= 0) return upcoming(monthIndex(m[1]), Number(m[2]), m[3] ? Number(m[3]) : undefined);
  m = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([a-z]{3,9})\.?(?:,?\s+(\d{4}))?\b/.exec(t);
  if (m && monthIndex(m[2]) >= 0) return upcoming(monthIndex(m[2]), Number(m[1]), m[3] ? Number(m[3]) : undefined);
  m = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(t);
  if (m) {
    let [a, b] = [Number(m[1]), Number(m[2])];
    // month first, as written in the US; a first number past 12 can only be a day
    if (a > 12 && b <= 12) [a, b] = [b, a];
    const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : undefined;
    if (a >= 1 && a <= 12) return upcoming(a - 1, b, y);
  }
  if (/\btoday\b/.test(t)) return today;
  if (/\btomorrow\b/.test(t)) return addDays(today, 1);
  m = /\bin\s+(\d{1,3}|a|one|two|three|four)\s+(day|week|month)s?\b/.exec(t);
  if (m) {
    const n = ({ a: 1, one: 1, two: 2, three: 3, four: 4 } as Record<string, number>)[m[1]] ?? Number(m[1]);
    return addDays(today, m[2] === 'day' ? n : m[2] === 'week' ? 7 * n : 30 * n);
  }
  if (/\bnext week\b/.test(t)) return addDays(today, 7);
  m = /\b(?:(next|this|on)\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/.exec(t);
  if (m) {
    const want = DAYS.indexOf(m[2]);
    const now = new Date(fromDay(today)).getUTCDay();
    let ahead = (want - now + 7) % 7;
    // "Friday" and "next Friday" are both the coming Friday, as most people mean them
    if (ahead === 0) ahead = 7;
    return addDays(today, ahead);
  }
  return null;
}

/** A shift in days out of words: "a week later", "back 3 days", "two weeks earlier". Positive is later. */
export function readShift(text: string): number | null {
  const t = text.toLowerCase();
  const m = /\b(\d{1,3}|a|an|one|two|three|four|five|six)\s+(day|week)s?\b/.exec(t);
  if (!m) return null;
  const n = ({ a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 } as Record<string, number>)[m[1]] ?? Number(m[1]);
  const days = m[2] === 'week' ? n * 7 : n;
  const earlier = /\b(earlier|sooner|forward|before|up)\b/.test(t) && !/\bback\b/.test(t);
  return earlier ? -days : days;
}

// ── determinism ──────────────────────────────────────────────────────

/** JSON with keys in order — two states are the same exactly when their keys are. */
export function stableKey(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(stableKey).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableKey(o[k])}`)
    .join(',')}}`;
}
export const sameAs = (a: unknown, b: unknown): boolean => stableKey(a) === stableKey(b);

// ── authorship ───────────────────────────────────────────────────────

/** Socria may not change what the person wrote. */
export function guardOwn(item: { by?: By } | undefined | null, ctx: Ctx, what = 'That'): string | null {
  if (ctx?.by === 'socria' && item?.by === 'person') {
    return `${what} is yours — Socria does not change what you wrote. It can suggest a change for you to make.`;
  }
  return null;
}

/** Who wrote something is recorded from who applied the step, never taken from the arguments' word for it. */
export function guardBy(args: Args, ctx: Ctx): string | null {
  if (ctx?.by && args.by !== undefined && args.by !== ctx.by) return 'Who wrote it is recorded, not claimed.';
  return null;
}

// ── scaffolding for a kind ───────────────────────────────────────────

export function op<S>(
  label: string,
  check: (s: S, a: Args, ctx: Ctx) => string | null,
  apply: (s: S, a: Args) => S,
  say: (a: Args) => string
): OpDef<S> {
  return { label, check, apply, say };
}

/** What every display has: a title and the view it is shown in. */
export interface DisplayHead {
  title: string;
  view: string;
}

/** The two operations every display has: rename it, and show it another way. */
export function headOps<S extends DisplayHead>(views: readonly ViewDecl<S>[], sanitize: (raw: unknown) => S | null): Record<string, OpDef<S>> {
  return {
    title: op<S>(
      'Rename',
      (_s, a) => (cleanText(a.title, 80) ? null : 'Give it a name.'),
      (s, a) => sanitize({ ...s, title: cleanText(a.title, 80) }) ?? s,
      (a) => `named “${cleanText(a.title, 80)}”`
    ),
    view: op<S>(
      'Show as',
      (s, a) => {
        const v = views.find((x) => x.id === a.view);
        if (!v) return `It cannot be shown as ${String(a.view)}.`;
        return v.unavailable?.(s) ?? null;
      },
      (s, a) => sanitize({ ...s, view: String(a.view) }) ?? s,
      (a) => `shown as ${views.find((x) => x.id === a.view)?.label.toLowerCase() ?? a.view}`
    ),
  };
}

/** A view request in words — "show it as a board", "as a checklist" — against the kind's own views. */
export function readView<S>(text: string, views: readonly ViewDecl<S>[], words: Record<string, string[]>): string | null {
  const t = ` ${norm(text)} `;
  if (!/\b(show|view|see|display|make|turn|switch|as|into)\b/.test(t)) return null;
  for (const v of views) {
    for (const w of words[v.id] ?? [v.label.toLowerCase()]) {
      if (t.includes(` ${w} `)) return v.id;
    }
  }
  return null;
}

/** The registry entries every display kind fills in the same way, so a kind writes only what is its own. */
export function displayKind<S extends DisplayHead>(
  k: Omit<ObjectKind<S>, 'same' | 'partFacts' | 'consequence' | 'argLimits' | 'maxStates'> & {
    consequence?: ObjectKind<S>['consequence'];
    partFacts?: ObjectKind<S>['partFacts'];
    argLimits?: ObjectKind<S>['argLimits'];
    maxStates?: number;
  }
): ObjectKind<S> {
  return {
    same: sameAs,
    consequence: () => null,
    partFacts: (s: S, part: string) => {
      const p = k.parts(s).find((x: Part) => x.id === part);
      return p ? [p.label] : null;
    },
    // a display's states are larger than a matrix's, and the whole map travels on every save
    maxStates: 12,
    argLimits: { count: 12, length: 400 },
    ...k,
  };
}

/** What the catalogue knows about each display kind, for the request reader, the proposal pass and the UI. */
export interface DisplayMeta {
  kind: string;
  /** what a person calls it: "plan", "comparison" */
  noun: string;
  /** one sentence: what it is for */
  about: string;
  /** the short handle prefix objects of this kind are named with: P1, C1 … */
  handle: string;
  /**
   * The words a person uses for it, each with the view it opens on — "kanban"
   * is a plan shown as a board. Read by the request reader
   * (display-request.ts) only where a making verb governs them. A word two
   * kinds both declare ("table") leaves the choice to the proposal pass.
   */
  called?: readonly { words: readonly string[]; view?: string }[];
  /** how its state is written, for the proposal pass: the JSON shape, briefly, in the kind's own field names */
  spec?: string;
  /** a small state of this kind that its sanitizer keeps — shown to the proposal pass, and held to by a test */
  example?: unknown;
  /** what the reply model is told about displays of this kind beyond their facts — guard-aware */
  tell?: (guarded: boolean) => string;
  /** a display a person practises in (a worksheet, an exercise): what it checks is not given away while the guard is up */
  practice?: boolean;
}

const META = new Map<string, DisplayMeta>();
export function registerDisplay(m: DisplayMeta): void {
  META.set(m.kind, m);
}
export const displayMeta = (kind: string): DisplayMeta | null => META.get(kind) ?? null;
export const isDisplayKind = (kind: string): boolean => META.has(kind);
export const displayKinds = (): DisplayMeta[] => [...META.values()];

/** A handle no object in the space has: P1, P2 … — names in a space are capped at 8 characters. */
export function freshHandle(names: Iterable<string>, prefix: string): string {
  const taken = new Set(names);
  for (let i = 1; i < 100; i++) if (!taken.has(`${prefix}${i}`)) return `${prefix}${i}`;
  return `${prefix}x`;
}
