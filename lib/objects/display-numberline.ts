// lib/objects/display-numberline.ts — a set of numbers on a line.
//
// "Visualize the interval x > 3", "x ≤ −1 or 2 < x < 5", "[2, 5)", "|x − 1| < 3":
// one variable, the intervals and single values it may take, drawn on a
// number line with filled (included) and open (excluded) endpoints and
// arrows where it runs on for ever. Everything is read and computed here —
// the union of what was written, its interval notation, the inequality and
// the set-builder form — so the line, the notation and the words always say
// the same thing. Dragging an endpoint, opening or closing it, adding a
// piece or taking one away are operations, kept in the history and undoable.
//
// Nothing is solved here: an inequality is drawn as written ("2x + 1 > 7" is
// not rearranged into "x > 3"), so the person's own step stays theirs.
//
// PURE.

import { register, type Part, type ViewDecl } from './core';
import { cleanBy, cleanText, displayKind, guardBy, headOps, nextId, op, registerDisplay, type By, type DisplayHead } from './display-base';
import { niceTicks } from '@/lib/model/units';

export interface NLInterval {
  id: string;
  /** null: it runs on for ever to the left */
  lo: number | null;
  /** null: it runs on for ever to the right */
  hi: number | null;
  loOpen: boolean;
  hiOpen: boolean;
  by: By;
}

export interface NLPoint {
  id: string;
  x: number;
  by: By;
}

export interface NumberLineState extends DisplayHead {
  view: 'line' | 'notation';
  /** the variable, one letter: x, t, n */
  variable: string;
  intervals: NLInterval[];
  points: NLPoint[];
}

/** One piece of the whole set: an interval, or a single value (lo = hi, both closed). */
export interface Piece {
  lo: number | null;
  hi: number | null;
  loOpen: boolean;
  hiOpen: boolean;
}

export const NL_LIMITS = { pieces: 8, title: 80, span: 1e9 } as const;

// ── numbers ──────────────────────────────────────────────────────────

const r9 = (v: number) => {
  const r = Number(v.toPrecision(10));
  return r === 0 ? 0 : r;
};
const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= NL_LIMITS.span;

/** −3, 2.5, ½ as a person reads them: minus signs as minus signs, no float noise. */
export function sayNum(v: number): string {
  const s = String(r9(v));
  return s.replace(/^-/, '−');
}

// ── canonical state ──────────────────────────────────────────────────

export function sanitizeNumberLine(raw: unknown): NumberLineState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const variable = typeof r.variable === 'string' && /^[a-z]$/i.test(r.variable.trim()) ? r.variable.trim() : 'x';
  const ids = new Set<string>();
  const idFor = (v: unknown, prefix: string) => {
    let id = typeof v === 'string' && /^[A-Za-z0-9_-]{1,16}$/.test(v) ? v : '';
    if (!id || ids.has(id)) id = nextId(prefix, ids);
    ids.add(id);
    return id;
  };
  const intervals: NLInterval[] = [];
  for (const x of Array.isArray(r.intervals) ? r.intervals : []) {
    if (intervals.length >= NL_LIMITS.pieces || !x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    const lo = o.lo === null || o.lo === undefined ? null : fin(o.lo) ? r9(o.lo) : undefined;
    const hi = o.hi === null || o.hi === undefined ? null : fin(o.hi) ? r9(o.hi) : undefined;
    if (lo === undefined || hi === undefined) continue;
    if (lo !== null && hi !== null && !(lo < hi)) continue;
    // an end that runs on for ever is never "included"
    intervals.push({ id: idFor(o.id, 'i'), lo, hi, loOpen: lo === null ? true : !!o.loOpen, hiOpen: hi === null ? true : !!o.hiOpen, by: cleanBy(o.by) });
  }
  const points: NLPoint[] = [];
  for (const x of Array.isArray(r.points) ? r.points : []) {
    if (points.length >= NL_LIMITS.pieces || !x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    if (!fin(o.x) || points.some((p) => p.x === r9(o.x as number))) continue;
    points.push({ id: idFor(o.id, 'p'), x: r9(o.x), by: cleanBy(o.by) });
  }
  return {
    title: cleanText(r.title, NL_LIMITS.title) || 'Number line',
    view: r.view === 'notation' ? 'notation' : 'line',
    variable,
    intervals,
    points,
  };
}

// ── what is computed ─────────────────────────────────────────────────

const loKey = (p: Piece) => (p.lo === null ? -Infinity : p.lo);
const hiKey = (p: Piece) => (p.hi === null ? Infinity : p.hi);

/** Whether two pieces overlap or touch so that together they are one (a shared end included by either). */
function joins(a: Piece, b: Piece): boolean {
  if (hiKey(a) > loKey(b)) return true;
  if (hiKey(a) < loKey(b)) return false;
  return !(a.hiOpen && b.loOpen);
}

/**
 * Everything the line holds, as the fewest pieces: overlapping and touching
 * intervals merged, single values inside an interval absorbed, a single value
 * at an open end closing it. Sorted left to right.
 */
export function unionOf(s: Pick<NumberLineState, 'intervals' | 'points'>): Piece[] {
  const all: Piece[] = [
    ...s.intervals.map((i) => ({ lo: i.lo, hi: i.hi, loOpen: i.loOpen, hiOpen: i.hiOpen })),
    ...s.points.map((p) => ({ lo: p.x, hi: p.x, loOpen: false, hiOpen: false })),
  ].sort((a, b) => loKey(a) - loKey(b) || Number(a.loOpen) - Number(b.loOpen));
  const out: Piece[] = [];
  for (const p of all) {
    const last = out[out.length - 1];
    if (last && joins(last, p)) {
      if (hiKey(p) > hiKey(last)) {
        last.hi = p.hi;
        last.hiOpen = p.hiOpen;
      } else if (hiKey(p) === hiKey(last)) last.hiOpen = last.hiOpen && p.hiOpen;
      if (loKey(p) === loKey(last)) last.loOpen = last.loOpen && p.loOpen;
    } else out.push({ ...p });
  }
  return out;
}

/** "(3, ∞)", "[−2, 5) ∪ {7}", "ℝ", "∅". */
export function intervalNotation(pieces: readonly Piece[]): string {
  if (!pieces.length) return '∅';
  return pieces
    .map((p) => {
      if (p.lo === null && p.hi === null) return 'ℝ';
      if (p.lo !== null && p.hi !== null && p.lo === p.hi) return `{${sayNum(p.lo)}}`;
      const lo = p.lo === null ? '(−∞' : `${p.loOpen ? '(' : '['}${sayNum(p.lo)}`;
      const hi = p.hi === null ? '∞)' : `${sayNum(p.hi)}${p.hiOpen ? ')' : ']'}`;
      return `${lo}, ${hi}`;
    })
    .join(' ∪ ');
}

/** "x > 3", "−2 ≤ x < 5", "x < −1 or x ≥ 3", "x = 7", "every real number". */
export function inequalityOf(pieces: readonly Piece[], v = 'x'): string {
  if (!pieces.length) return 'no value of ' + v;
  return pieces
    .map((p) => {
      if (p.lo === null && p.hi === null) return `every real number`;
      if (p.lo !== null && p.hi !== null && p.lo === p.hi) return `${v} = ${sayNum(p.lo)}`;
      if (p.lo === null) return `${v} ${p.hiOpen ? '<' : '≤'} ${sayNum(p.hi!)}`;
      if (p.hi === null) return `${v} ${p.loOpen ? '>' : '≥'} ${sayNum(p.lo)}`;
      return `${sayNum(p.lo)} ${p.loOpen ? '<' : '≤'} ${v} ${p.hiOpen ? '<' : '≤'} ${sayNum(p.hi)}`;
    })
    .join(' or ');
}

/** "{ x | x > 3 }". */
export function setBuilder(pieces: readonly Piece[], v = 'x'): string {
  if (!pieces.length) return '∅';
  if (pieces.length === 1 && pieces[0].lo === null && pieces[0].hi === null) return `{ ${v} | ${v} ∈ ℝ }`;
  return `{ ${v} | ${inequalityOf(pieces, v)} }`;
}

/**
 * The stretch of the line to draw: every finite end in view, zero too when it
 * is near enough to be a landmark, room beyond each end — more on a side the
 * set runs on for ever, so a ray is seen to go somewhere — on round ticks.
 */
export function lineWindow(s: Pick<NumberLineState, 'intervals' | 'points'>): { lo: number; hi: number; ticks: number[]; step: number } {
  const ends = [...s.intervals.flatMap((i) => [i.lo, i.hi]), ...s.points.map((p) => p.x)].filter((v): v is number => v !== null);
  let lo = ends.length ? Math.min(...ends) : -5;
  let hi = ends.length ? Math.max(...ends) : 5;
  const width = Math.max(hi - lo, 4);
  if (lo > 0 && lo <= 3 * width) lo = 0;
  if (hi < 0 && -hi <= 3 * width) hi = 0;
  const span = Math.max(hi - lo, 4);
  const pad = Math.max(1, span * 0.25);
  lo -= pad + (s.intervals.some((i) => i.lo === null) ? span * 0.35 : 0);
  hi += pad + (s.intervals.some((i) => i.hi === null) ? span * 0.35 : 0);
  const ticks = niceTicks(lo, hi, 10);
  const step = ticks.length >= 2 ? ticks[1] - ticks[0] : 1;
  return { lo: Math.min(lo, ticks[0] ?? lo), hi: Math.max(hi, ticks[ticks.length - 1] ?? hi), ticks, step };
}

// ── reading a set from words ─────────────────────────────────────────

const NUM = String.raw`[-−]?\s?(?:\d+(?:\.\d+)?|\.\d+)(?:\s*/\s*\d+)?`;
const INF = String.raw`[-−+]?\s?(?:∞|inf(?:inity)?)`;
const OP = String.raw`(?:<=|>=|=<|=>|≤|≥|<|>|≠|!=|=)`;

const readN = (t: string): number | null => {
  const c = t.replace(/[−\s]/g, (m) => (m === '−' ? '-' : '')).trim();
  const f = /^(-?)(\d+(?:\.\d+)?)\/(\d+)$/.exec(c);
  if (f) return Number(f[3]) ? r9((f[1] ? -1 : 1) * (Number(f[2]) / Number(f[3]))) : null;
  const n = Number(c);
  return Number.isFinite(n) ? r9(n) : null;
};
const normOp = (o: string): string => ({ '<=': '≤', '=<': '≤', '>=': '≥', '=>': '≥', '!=': '≠' })[o] ?? o;
const flip = (o: string): string => ({ '<': '>', '>': '<', '≤': '≥', '≥': '≤' })[o] ?? o;

type ReadSet = { variable: string; intervals: Piece[]; points: number[] };

/** One clause, with its variable: "x > 3", "3 < x", "-2 ≤ x < 5", "x = 7", "x ≠ 2", "[2, 5)", "|x − 1| < 3". */
function clause(t: string, v: string | null): ReadSet | null {
  const s = t.trim().replace(/\s+/g, ' ');
  let m: RegExpExecArray | null;
  // interval notation
  m = new RegExp(String.raw`^([\[(])\s*(${NUM}|${INF})\s*,\s*(${NUM}|${INF})\s*([\])])$`, 'i').exec(s);
  if (m) {
    const lo = /∞|inf/i.test(m[2]) ? null : readN(m[2]);
    const hi = /∞|inf/i.test(m[3]) ? null : readN(m[3]);
    if ((lo === null && !/^[-−]/.test(m[2].trim())) || (hi === null && /^[-−]/.test(m[3].trim()))) return null;
    if (lo !== null && hi !== null && !(lo < hi)) return null;
    return { variable: v ?? 'x', intervals: [{ lo, hi, loOpen: lo === null || m[1] === '(', hiOpen: hi === null || m[4] === ')' }], points: [] };
  }
  // absolute value: |x − c| op r, |x| op r
  m = new RegExp(String.raw`^\|\s*([a-z])\s*(?:([+\-−])\s*(${NUM}))?\s*\|\s*(${OP})\s*(${NUM})$`, 'i').exec(s);
  if (m && (!v || v === m[1])) {
    const c = m[3] ? (m[2] === '+' ? -1 : 1) * readN(m[3])! : 0;
    const r = readN(m[5])!;
    const o = normOp(m[4]);
    const out: ReadSet = { variable: m[1], intervals: [], points: [] };
    if (r < 0) return o === '>' || o === '≥' || o === '≠' ? { ...out, intervals: [{ lo: null, hi: null, loOpen: true, hiOpen: true }] } : out;
    if (o === '<' || o === '≤') out.intervals.push({ lo: r9(c - r), hi: r9(c + r), loOpen: o === '<', hiOpen: o === '<' });
    else if (o === '>' || o === '≥') out.intervals.push({ lo: null, hi: r9(c - r), loOpen: true, hiOpen: o === '>' }, { lo: r9(c + r), hi: null, loOpen: o === '>', hiOpen: true });
    else if (o === '=') out.points.push(...new Set([r9(c - r), r9(c + r)]));
    else return null;
    if (out.intervals.some((i) => i.lo !== null && i.hi !== null && !(i.lo < i.hi))) out.intervals = [];
    return out;
  }
  // chained: a op x op b
  m = new RegExp(String.raw`^(${NUM})\s*(${OP})\s*([a-z])\s*(${OP})\s*(${NUM})$`, 'i').exec(s);
  if (m && (!v || v === m[3])) {
    const a = readN(m[1])!;
    const b = readN(m[5])!;
    const o1 = normOp(m[2]);
    const o2 = normOp(m[4]);
    const up = (o1 === '<' || o1 === '≤') && (o2 === '<' || o2 === '≤');
    const down = (o1 === '>' || o1 === '≥') && (o2 === '>' || o2 === '≥');
    if (!up && !down) return null;
    const [lo, hi, loOpen, hiOpen] = up ? [a, b, o1 === '<', o2 === '<'] : [b, a, o2 === '>', o1 === '>'];
    if (!(lo < hi)) return null;
    return { variable: m[3], intervals: [{ lo, hi, loOpen, hiOpen }], points: [] };
  }
  // x op a, or a op x
  m = new RegExp(String.raw`^([a-z])\s*(${OP})\s*(${NUM})$`, 'i').exec(s);
  let variable: string | null = null;
  let o = '';
  let a = 0;
  if (m) {
    variable = m[1];
    o = normOp(m[2]);
    a = readN(m[3])!;
  } else {
    m = new RegExp(String.raw`^(${NUM})\s*(${OP})\s*([a-z])$`, 'i').exec(s);
    if (!m) return null;
    variable = m[3];
    o = flip(normOp(m[2]));
    a = readN(m[1])!;
  }
  if (v && v !== variable) return null;
  const out: ReadSet = { variable, intervals: [], points: [] };
  if (o === '>' || o === '≥') out.intervals.push({ lo: a, hi: null, loOpen: o === '>', hiOpen: true });
  else if (o === '<' || o === '≤') out.intervals.push({ lo: null, hi: a, loOpen: true, hiOpen: o === '<' });
  else if (o === '=') out.points.push(a);
  else if (o === '≠') out.intervals.push({ lo: null, hi: a, loOpen: true, hiOpen: true }, { lo: a, hi: null, loOpen: true, hiOpen: true });
  else return null;
  return out;
}

/** Where two pieces both hold, or null where they do not meet. */
function meet(a: Piece, b: Piece): Piece | null {
  const lo = Math.max(loKey(a), loKey(b));
  const hi = Math.min(hiKey(a), hiKey(b));
  const loOpen = loKey(a) === lo && loKey(b) === lo ? a.loOpen || b.loOpen : loKey(a) === lo ? a.loOpen : b.loOpen;
  const hiOpen = hiKey(a) === hi && hiKey(b) === hi ? a.hiOpen || b.hiOpen : hiKey(a) === hi ? a.hiOpen : b.hiOpen;
  if (lo > hi || (lo === hi && (loOpen || hiOpen))) return null;
  return { lo: lo === -Infinity ? null : lo, hi: hi === Infinity ? null : hi, loOpen, hiOpen };
}

/**
 * A set of numbers written as inequalities or intervals: clauses joined by
 * "or" / "∪" are united, by "and" (or a comma between inequalities) are
 * intersected. Null when any of it cannot be read — a set half-understood is
 * not drawn as if it were understood.
 */
export function readNumberSet(text: string): ReadSet | null {
  const t = text
    .replace(/[“”"`$]/g, '')
    .replace(/−/g, '-')
    .replace(/\s+(?:or|∪|union|U)\s+/gi, ' | ')
    .replace(/\s*∪\s*/g, ' | ')
    .replace(/\)\s*U\s*[\[(]/g, (m) => m.replace(/U/, '|'))
    .trim();
  if (!t || t.length > 200) return null;
  let variable: string | null = null;
  const pieces: Piece[] = [];
  const points: number[] = [];
  for (const orPart of t.split(' | ')) {
    // "and" intersects; so does a comma between two inequalities ("x > 1, x < 4") — never inside "[2, 5)"
    const ands = orPart.split(/\s+and\s+|\s*&&?\s*|,\s*(?=[a-z]\s*[<>≤≥=!])/i).filter((x) => x.trim());
    let acc: ReadSet | null = null;
    for (const a of ands) {
      const c = clause(a, variable);
      if (!c) return null;
      variable = variable ?? c.variable;
      if (!acc) {
        acc = c;
        continue;
      }
      // intersect: every piece of one with every piece of the other; a value survives where it lies in both
      const ps: Piece[] = [];
      for (const p of acc.intervals) for (const q of c.intervals) {
        const m = meet(p, q);
        if (m) ps.push(m);
      }
      const inSet = (x: number, set: ReadSet) => set.points.includes(x) || set.intervals.some((i) => meet(i, { lo: x, hi: x, loOpen: false, hiOpen: false }));
      const prev: ReadSet = acc;
      const pts: number[] = [...prev.points.filter((x) => inSet(x, c)), ...c.points.filter((x) => inSet(x, prev))];
      acc = { variable: acc.variable, intervals: ps, points: [...new Set(pts)] };
    }
    if (!acc) return null;
    for (const p of acc.intervals) {
      if (p.lo !== null && p.hi !== null && p.lo === p.hi) points.push(p.lo);
      else pieces.push(p);
    }
    points.push(...acc.points);
  }
  if (!variable) variable = 'x';
  return { variable, intervals: pieces.slice(0, NL_LIMITS.pieces), points: [...new Set(points)].slice(0, NL_LIMITS.pieces) };
}

/** The part of a request that is the set: after a colon, or the inequalities and intervals in it. */
export function setInWords(said: string): string | null {
  const c = said.indexOf(':');
  const tail = c >= 0 ? said.slice(c + 1) : said;
  const found = new RegExp(
    String.raw`(?:\|\s*[a-z]\s*(?:[+\-−]\s*${NUM})?\s*\|\s*${OP}\s*${NUM}|${NUM}\s*${OP}\s*[a-z]\s*${OP}\s*${NUM}|[a-z]\s*${OP}\s*${NUM}|${NUM}\s*${OP}\s*[a-z]|[\[(]\s*(?:${NUM}|${INF})\s*,\s*(?:${NUM}|${INF})\s*[\])])(?:\s*(?:,|and|or|∪|U)\s*(?:\|\s*[a-z]\s*(?:[+\-−]\s*${NUM})?\s*\|\s*${OP}\s*${NUM}|${NUM}\s*${OP}\s*[a-z]\s*${OP}\s*${NUM}|[a-z]\s*${OP}\s*${NUM}|${NUM}\s*${OP}\s*[a-z]|[\[(]\s*(?:${NUM}|${INF})\s*,\s*(?:${NUM}|${INF})\s*[\])]))*`,
    'i'
  ).exec(tail);
  return found ? found[0] : null;
}

/** A number line from the person's words — "the interval x > 3" — or null when there is no set in them. */
export function numberLineFromWords(said: string): NumberLineState | null {
  const set = setInWords(said);
  if (!set) return null;
  // the set must be all of the mathematics there: "y > 2x + 1" is a region of the plane, not "y > 2"
  const at = said.indexOf(set) + set.length;
  if (/^[\p{L}\p{N}(^]|^\s*[+*/^·×-]\s*[\p{L}\p{N}(]/u.test(said.slice(at))) return null;
  const read = readNumberSet(set);
  if (!read || (!read.intervals.length && !read.points.length)) return null;
  return sanitizeNumberLine({
    title: cleanText(set.replace(/\s+/g, ' '), 60) || 'Number line',
    view: 'line',
    variable: read.variable,
    intervals: read.intervals.map((p, i) => ({ id: `i${i + 1}`, ...p, by: 'person' })),
    points: read.points.map((x, i) => ({ id: `p${i + 1}`, x, by: 'person' })),
  });
}

// ── operations ───────────────────────────────────────────────────────

const views: ViewDecl<NumberLineState>[] = [
  { id: 'line', label: 'Number line', shows: 'the set on the line, ends filled where included and open where not', primary: true, interactions: ['drag an end', 'click an end to include or exclude it'] },
  { id: 'notation', label: 'Notation', shows: 'the same set as interval notation, an inequality and set-builder form, piece by piece', interactions: ['remove a piece'] },
];

const findI = (s: NumberLineState, id: unknown) => s.intervals.find((i) => i.id === id);
const keep = (s: NumberLineState, next: Partial<NumberLineState>) => sanitizeNumberLine({ ...s, ...next }) ?? s;

export const NUMBERLINE_OPS = {
  ...headOps<NumberLineState>(views, sanitizeNumberLine),
  add: op<NumberLineState>(
    'Add to the set',
    (s, a, ctx) => {
      const read = readNumberSet(String(a.text ?? ''));
      if (!read || (!read.intervals.length && !read.points.length)) return 'Write an inequality or an interval — “x ≤ −1”, “2 < x < 5”, “[2, 5)” or “|x − 1| < 3”.';
      if (read.variable !== s.variable && (s.intervals.length || s.points.length)) return `This line is about ${s.variable}.`;
      if (s.intervals.length + read.intervals.length > NL_LIMITS.pieces || s.points.length + read.points.length > NL_LIMITS.pieces) return `A number line holds ${NL_LIMITS.pieces} pieces at most.`;
      return guardBy(a, ctx);
    },
    (s, a) => {
      const read = readNumberSet(String(a.text))!;
      const by = cleanBy(a.by);
      const taken = [...s.intervals.map((i) => i.id), ...s.points.map((p) => p.id)];
      const intervals = [...s.intervals];
      for (const p of read.intervals) {
        const id = nextId('i', [...taken, ...intervals.map((i) => i.id)]);
        intervals.push({ id, ...p, by });
      }
      const points = [...s.points];
      for (const x of read.points) points.push({ id: nextId('p', [...taken, ...points.map((q) => q.id)]), x, by });
      return keep(s, { variable: read.variable, intervals, points });
    },
    (a) => `added ${cleanText(a.text, 60)}`
  ),
  remove: op<NumberLineState>(
    'Take away',
    (s, a) => (findI(s, a.id) || s.points.some((p) => p.id === a.id) ? null : 'There is no such piece on the line.'),
    (s, a) => keep(s, { intervals: s.intervals.filter((i) => i.id !== a.id), points: s.points.filter((p) => p.id !== a.id) }),
    () => 'took a piece away'
  ),
  end: op<NumberLineState>(
    'Move an end',
    (s, a) => {
      const i = findI(s, a.id);
      if (!i) return 'There is no such interval.';
      if (a.side !== 'lo' && a.side !== 'hi') return 'Say which end.';
      const inf = a.value === 'inf';
      const v = inf ? null : Number(a.value);
      if (!inf && !fin(v)) return 'An end is a number, or runs on for ever.';
      const lo = a.side === 'lo' ? v : i.lo;
      const hi = a.side === 'hi' ? v : i.hi;
      if (lo !== null && hi !== null && !(lo < hi)) return 'The left end has to stay left of the right end.';
      return null;
    },
    (s, a) =>
      keep(s, {
        intervals: s.intervals.map((i) => {
          if (i.id !== a.id) return i;
          const v = a.value === 'inf' ? null : r9(Number(a.value));
          return a.side === 'lo' ? { ...i, lo: v, loOpen: v === null ? true : i.loOpen } : { ...i, hi: v, hiOpen: v === null ? true : i.hiOpen };
        }),
      }),
    (a) => `moved ${a.side === 'lo' ? 'the left' : 'the right'} end to ${a.value === 'inf' ? (a.side === 'lo' ? '−∞' : '∞') : sayNum(Number(a.value))}`
  ),
  open: op<NumberLineState>(
    'Include or exclude an end',
    (s, a) => {
      const i = findI(s, a.id);
      if (!i) return 'There is no such interval.';
      if (a.side !== 'lo' && a.side !== 'hi') return 'Say which end.';
      if ((a.side === 'lo' ? i.lo : i.hi) === null) return 'An end that runs on for ever cannot be included.';
      return null;
    },
    (s, a) =>
      keep(s, {
        intervals: s.intervals.map((i) => {
          if (i.id !== a.id) return i;
          const open = a.open === 'toggle' || a.open === undefined ? !(a.side === 'lo' ? i.loOpen : i.hiOpen) : a.open === 'yes' || a.open === 1;
          return a.side === 'lo' ? { ...i, loOpen: open } : { ...i, hiOpen: open };
        }),
      }),
    (a) => `${a.side === 'lo' ? 'left' : 'right'} end ${a.open === 'no' ? 'included' : a.open === 'yes' ? 'excluded' : 'switched'}`
  ),
};

/** "include 3", "exclude 5", "add x < -2", "move 3 to 4" — a step on the line, read from words. */
export function readNumberLineOp(text: string, s: NumberLineState): { op: string; args: Record<string, string | number> } | null {
  const t = text.trim().replace(/−/g, '-');
  let m = /^(?:please\s+)?(include|exclude|close|open)\s+(?:the\s+(?:end(?:point)?|value)\s+(?:at\s+)?)?(-?\d+(?:\.\d+)?)\s*[.!]?$/i.exec(t);
  if (m) {
    const v = Number(m[2]);
    for (const i of s.intervals) {
      const side = i.lo === v ? 'lo' : i.hi === v ? 'hi' : null;
      if (side) return { op: 'open', args: { id: i.id, side, open: /include|close/i.test(m[1]) ? 'no' : 'yes' } };
    }
    return null;
  }
  m = /^(?:please\s+)?(?:add|also|and|plus)\s+(.+?)[.!]?$/i.exec(t);
  if (m) {
    const read = readNumberSet(m[1]);
    return read && (read.intervals.length || read.points.length) ? { op: 'add', args: { text: m[1], by: 'person' } } : null;
  }
  m = /^(?:please\s+)?(?:move|change|shift)\s+(?:the\s+end(?:point)?\s+(?:at\s+)?)?(-?\d+(?:\.\d+)?)\s+to\s+(-?\d+(?:\.\d+)?)\s*[.!]?$/i.exec(t);
  if (m) {
    const from = Number(m[1]);
    for (const i of s.intervals) {
      const side = i.lo === from ? 'lo' : i.hi === from ? 'hi' : null;
      if (side) return { op: 'end', args: { id: i.id, side, value: Number(m[2]) } };
    }
  }
  if (/\bnotation\b/i.test(t) && /\b(show|view|switch|as)\b/i.test(t)) return s.view === 'notation' ? null : { op: 'view', args: { view: 'notation' } };
  if (/\bnumber line\b/i.test(t) && /\b(show|view|switch|as|back)\b/i.test(t)) return s.view === 'line' ? null : { op: 'view', args: { view: 'line' } };
  return null;
}

// ── the kind ─────────────────────────────────────────────────────────

function factsOf(s: NumberLineState): string[] {
  const u = unionOf(s);
  return [
    `NUMBER LINE “${s.title}” for ${s.variable}: ${inequalityOf(u, s.variable)}`,
    `interval notation ${intervalNotation(u)}; set-builder ${setBuilder(u, s.variable)}`,
    ...(s.intervals.length + s.points.length > u.length ? [`written as ${s.intervals.length + s.points.length} pieces, which together are ${u.length}`] : []),
  ];
}

export const NUMBERLINE = displayKind<NumberLineState>({
  kind: 'numberline',
  label: 'Number line',
  sanitize: sanitizeNumberLine,
  ops: NUMBERLINE_OPS,
  readOp: readNumberLineOp,
  facts: (s) => factsOf(s),
  text: (s) => factsOf(s).join('\n'),
  parts: (s): Part[] => [
    ...s.intervals.map((i) => ({ id: i.id, label: intervalNotation([i]) })),
    ...s.points.map((p) => ({ id: p.id, label: `${s.variable} = ${sayNum(p.x)}` })),
  ],
  views,
  size: (_s, mode) => (mode === 'card' ? { w: 260, h: 90 } : mode === 'trail' ? { w: 200, h: 70 } : { w: 600, h: 260 }),
  shape: (s) => `number line · ${intervalNotation(unionOf(s))}`,
  argLimits: { count: 6, length: 200 },
});

register(NUMBERLINE);
registerDisplay({
  kind: 'numberline',
  noun: 'number line',
  handle: 'N',
  about: 'A set of numbers — inequalities and intervals — on a number line, with its interval notation, inequality and set-builder form computed.',
  called: [{ words: ['number line', 'numberline', 'interval on a number line', 'solution set on a number line'], view: 'line' }],
  prompts: ['Visualize the interval x > 3', 'Show −2 ≤ x < 5 or x = 7 on a number line'],
  tell: () =>
    'A NUMBER LINE is drawn from what the person wrote, as written — it does not solve or rearrange anything. Its interval notation, inequality and set-builder form are computed: use them, never recompute them.',
});
