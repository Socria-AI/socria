// A COMPARISON — options weighed against what matters to the person.
//
// "Help me choose between these two job offers", "compare three laptops on
// price, battery and weight", "which flat should I take?": one state —
// options, the criteria they are judged on, a weight for each criterion
// (0–10: how much it matters to the person) and, for an option on a
// criterion, a score (0–10, where 10 is best FOR THE PERSON — a short commute
// scores high, a long one low, so there is no "lower is better" switch to get
// wrong), optionally with a range when the person is unsure ("7, somewhere
// between 5 and 9"), and a note for the fact behind it ("$1,200/month"). The
// matrix, the ranking and the sensitivity view are VIEWS of that state;
// scoring a cell, moving a weight, adding an option are operations computed
// here, kept in the history and undoable.
//
// What is computed, never asserted: each option's weighted total over the
// criteria it has scores on — and how many it has none on; the band its
// ranges give it; whether the top of the ranking is too close to call; which
// criteria pull the options furthest apart; and, for the top two, the weight
// at which each criterion would turn their order around. A score nobody gave
// stays empty: it is never filled in, averaged in or guessed.
//
// EXACT. Scores are kept to two decimals and weights are whole numbers, so
// every sum is held in hundredths as a whole number: ties, overlaps and the
// order of two totals are decided by comparing whole numbers, never floats
// that merely look equal.
//
// PURE.

import { register, type Part, type ViewDecl } from './core';
import {
  cleanBy,
  cleanId,
  cleanText,
  displayKind,
  findByLabel,
  guardBy,
  guardOwn,
  headOps,
  nextId,
  norm,
  num,
  op,
  quotedOrAfterColon,
  readView,
  registerDisplay,
  todayDay,
  type Args,
  type By,
  type Ctx,
  type DisplayHead,
  type DisplayMeta,
} from './display-base';

export type CompareView = 'matrix' | 'ranking' | 'sensitivity';

export interface CompareOption {
  id: string;
  name: string;
  /** what the option is, in a few words: "Acme, downtown, hybrid" */
  note?: string;
  by: By;
}

export interface CompareCriterion {
  id: string;
  name: string;
  /** how much it matters to the person: a whole number 0..10 (0: it does not count) */
  weight: number;
  by: By;
}

/** One option judged on one criterion — at most one per pair. A pair with none is unscored, never zero. */
export interface CompareScore {
  option: string;
  criterion: string;
  /** 0..10, 10 best for the person; null when only the note is known so far */
  value: number | null;
  /** how low and how high it might really be, when the person is unsure: low < value < high (a bound equal to the value is not kept) */
  low?: number;
  high?: number;
  /** the fact behind the judgment: "$1,200/month", "40 min by train" */
  note?: string;
  by: By;
}

export interface CompareState extends DisplayHead {
  view: CompareView;
  options: CompareOption[];
  criteria: CompareCriterion[];
  /** sparse, in option order then criterion order */
  scores: CompareScore[];
}

export const COMPARE_LIMITS = {
  minOptions: 2,
  options: 8,
  minCriteria: 1,
  criteria: 10,
  /** one per option × criterion */
  scores: 80,
  name: 60,
  note: 200,
  scoreNote: 120,
  title: 80,
  maxWeight: 10,
  maxScore: 10,
} as const;
/** A criterion nobody has weighed counts in the middle. */
export const DEFAULT_WEIGHT = 5;

const L = COMPARE_LIMITS;
const VIEW_IDS: CompareView[] = ['matrix', 'ranking', 'sensitivity'];

// ── small helpers (keyOf, claimIds, fmt, andList, asking belong in display-base; see the report) ──

/** Two names are the same name when they read the same. */
const keyOf = (name: string) => norm(name) || name.toLowerCase();

/** A score as kept: 0..10 to two decimals. Anything else is no score — never clamped into one. */
function scoreNum(v: unknown): number | null {
  const n = num(v, 0, L.maxScore);
  return n === null ? null : Math.round(n * 100) / 100 || 0;
}

/** A weight read back from storage: a whole number, held within 0..10; missing, the default. */
function weightOf(v: unknown): number {
  const n = num(v, -1e6, 1e6);
  if (n === null) return DEFAULT_WEIGHT;
  return Math.min(L.maxWeight, Math.max(0, Math.round(n))) || 0;
}

/** A whole number within bounds, or null — '' is not a number. */
function wholeIn(v: unknown, lo: number, hi: number): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v.trim()) : NaN;
  return Number.isInteger(n) && n >= lo && n <= hi ? n || 0 : null;
}

/** A number as a person reads it — no locale, no float noise: 7, 7.5, 6.17. */
function fmt(n: number, digits = 2): string {
  if (Math.abs(n) < 0.5 * 10 ** -digits) return '0';
  const s = n.toFixed(digits);
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
}

function andList(xs: readonly string[], max = 6): string {
  if (xs.length > max) return `${xs.slice(0, max).join(', ')} and ${xs.length - max} more`;
  return xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}

/**
 * Ids for lists read together: each entry keeps its own id when it is valid
 * and no earlier entry claimed it; the rest take the next free one with their
 * prefix — from the ids taken, never a counter or the clock. All own ids are
 * claimed first, so a reference to one (a score's option) still finds it.
 */
function claimIds(groups: { raws: Record<string, unknown>[]; prefix: string }[]): string[][] {
  const taken = new Set<string>();
  const own = groups.map((g) =>
    g.raws.map((o) => {
      const id = cleanId(o.id);
      if (!id || taken.has(id)) return null;
      taken.add(id);
      return id;
    })
  );
  return groups.map((g, i) =>
    own[i].map((id) => {
      if (id) return id;
      const fresh = nextId(g.prefix, taken);
      taken.add(fresh);
      return fresh;
    })
  );
}

/** A question about the display, not an instruction to change it, is left to the conversation. "What if…" and "can you…" are instructions. */
function asking(t: string): boolean {
  return /\?\s*$/.test(t) && !/^\s*(?:what if|can you|could you|would you|will you|please)\b/i.test(t);
}

// ── canonical state ──────────────────────────────────────────────────

interface Named {
  raw: Record<string, unknown>;
  name: string;
}

/** Entries with a name, the first of each name, at most `cap` of them. */
function namedEntries(list: unknown, cap: number): Named[] {
  const out: Named[] = [];
  const seen = new Set<string>();
  for (const x of (Array.isArray(list) ? list : []).slice(0, cap * 8)) {
    if (out.length >= cap) break;
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    const name = cleanText(o.name ?? o.label ?? o.title, L.name);
    if (!name || seen.has(keyOf(name))) continue;
    seen.add(keyOf(name));
    out.push({ raw: o, name });
  }
  return out;
}

/** What a score points at: an id, or — from a proposal that wrote names — the name. */
function refTo<T extends { id: string; name: string }>(list: readonly T[], ref: unknown): T | undefined {
  if (typeof ref !== 'string' && typeof ref !== 'number') return undefined;
  const s = String(ref);
  if (!s) return undefined;
  return list.find((x) => x.id === s) ?? list.find((x) => keyOf(x.name) === keyOf(s));
}

export function sanitizeCompare(raw: unknown): CompareState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const opts = namedEntries(r.options, L.options);
  const crits = namedEntries(r.criteria, L.criteria);
  if (opts.length < L.minOptions || crits.length < L.minCriteria) return null;
  const [oIds, cIds] = claimIds([
    { raws: opts.map((x) => x.raw), prefix: 'o' },
    { raws: crits.map((x) => x.raw), prefix: 'c' },
  ]);
  const options: CompareOption[] = opts.map((x, i) => {
    const note = cleanText(x.raw.note, L.note);
    return { id: oIds[i], name: x.name, ...(note ? { note } : {}), by: cleanBy(x.raw.by) };
  });
  const criteria: CompareCriterion[] = crits.map((x, i) => ({ id: cIds[i], name: x.name, weight: weightOf(x.raw.weight), by: cleanBy(x.raw.by) }));
  const optAt = new Map(options.map((o, i) => [o.id, i]));
  const critAt = new Map(criteria.map((c, i) => [c.id, i]));
  const scores: CompareScore[] = [];
  const seen = new Set<string>();
  for (const x of (Array.isArray(r.scores) ? r.scores : []).slice(0, L.scores * 4)) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    const opt = refTo(options, o.option);
    const crit = refTo(criteria, o.criterion);
    if (!opt || !crit) continue;
    const k = `${opt.id}|${crit.id}`;
    if (seen.has(k)) continue;
    const value = scoreNum(o.value);
    const note = cleanText(o.note, L.scoreNote);
    if (value === null && !note) continue; // nothing known: the pair is simply unscored
    seen.add(k);
    // a range only goes round a score, and a bound equal to the score says nothing: one form
    const lo = value === null ? null : scoreNum(o.low);
    const hi = value === null ? null : scoreNum(o.high);
    scores.push({
      option: opt.id,
      criterion: crit.id,
      value,
      ...(lo !== null && value !== null && lo < value ? { low: lo } : {}),
      ...(hi !== null && value !== null && hi > value ? { high: hi } : {}),
      ...(note ? { note } : {}),
      by: cleanBy(o.by),
    });
  }
  scores.sort((a, b) => optAt.get(a.option)! - optAt.get(b.option)! || critAt.get(a.criterion)! - critAt.get(b.criterion)!);
  const view = VIEW_IDS.includes(r.view as CompareView) ? (r.view as CompareView) : 'matrix';
  return { title: cleanText(r.title, L.title) || 'Comparison', view, options, criteria, scores };
}

// ── what is computed ─────────────────────────────────────────────────

/** Hundredths: a score to two decimals times a whole weight is a whole number, so sums and comparisons are exact. */
const S = 100;
const units = (v: number) => Math.round(v * S);
const r6 = (x: number) => Math.round(x * 1e6) / 1e6 || 0;
const cellKey = (o: string, c: string) => `${o}|${c}`;
const cellsOf = (s: CompareState) => new Map(s.scores.map((x) => [cellKey(x.option, x.criterion), x]));

export function scoreOf(s: CompareState, option: string, criterion: string): CompareScore | null {
  return s.scores.find((x) => x.option === option && x.criterion === criterion) ?? null;
}

interface Sums {
  /** Σ weight × score, in hundredths; lo/hi the same with the range's bounds */
  num: number;
  lo: number;
  hi: number;
  /** Σ weight over the criteria scored */
  den: number;
  scored: number;
}

function sumsOf(s: CompareState, cells: Map<string, CompareScore>, option: string): Sums {
  const m: Sums = { num: 0, lo: 0, hi: 0, den: 0, scored: 0 };
  for (const c of s.criteria) {
    const x = cells.get(cellKey(option, c.id));
    if (!x || x.value === null) continue;
    m.scored++;
    m.num += c.weight * units(x.value);
    m.lo += c.weight * units(x.low ?? x.value);
    m.hi += c.weight * units(x.high ?? x.value);
    m.den += c.weight;
  }
  return m;
}

export interface OptionTotal {
  option: string;
  /** Σ(weight × score) ÷ Σ(weight), over the criteria this option has a score on; null when none of them weighs anything */
  total: number | null;
  /** the band its ranges give — a score with no range is its own bound */
  low: number | null;
  high: number | null;
  /** criteria it has a score on, and criteria it has none on */
  scored: number;
  unscored: number;
}

function totalOf(s: CompareState, option: string, m: Sums): OptionTotal {
  const per = (n: number) => (m.den > 0 ? r6(n / (m.den * S)) : null);
  return { option, total: per(m.num), low: per(m.lo), high: per(m.hi), scored: m.scored, unscored: s.criteria.length - m.scored };
}

/** Each option's weighted total, in option order. */
export function totals(s: CompareState): OptionTotal[] {
  const cells = cellsOf(s);
  return s.options.map((o) => totalOf(s, o.id, sumsOf(s, cells, o.id)));
}

export interface RankEntry extends OptionTotal {
  name: string;
  /** 1 for the first; an option with no total comes after every option with one */
  place: number;
  /** the other options whose bands overlap this one's: the order between them is too close to call */
  closeTo: string[];
}

export interface Ranking {
  entries: RankEntry[];
  /** the first option — only when every option has a total and no other option's band reaches the first one's */
  leader: string | null;
  /** the first two have bands that overlap (an exact tie among them) */
  tooClose: boolean;
}

interface Row {
  o: CompareOption;
  i: number;
  m: Sums;
}

/** lo/hi of a and b overlap, compared as fractions by cross-multiplying whole numbers. */
const overlaps = (a: Row, b: Row) => a.m.den > 0 && b.m.den > 0 && a.m.lo * b.m.den <= b.m.hi * a.m.den && b.m.lo * a.m.den <= a.m.hi * b.m.den;

function rowsInOrder(s: CompareState, cells: Map<string, CompareScore>): Row[] {
  const rows = s.options.map((o, i) => ({ o, i, m: sumsOf(s, cells, o.id) }));
  return rows.sort((a, b) => {
    const ha = a.m.den > 0;
    const hb = b.m.den > 0;
    if (ha !== hb) return ha ? -1 : 1;
    if (!ha) return a.i - b.i;
    // b ahead of a exactly when b.num / b.den > a.num / a.den
    const d = b.m.num * a.m.den - a.m.num * b.m.den;
    return d !== 0 ? Math.sign(d) : a.i - b.i;
  });
}

/** The options in order of their totals; equal totals keep the options' own order, and are too close to call. */
export function ranking(s: CompareState): Ranking {
  const rows = rowsInOrder(s, cellsOf(s));
  const entries: RankEntry[] = rows.map((r, k) => ({
    ...totalOf(s, r.o.id, r.m),
    name: r.o.name,
    place: k + 1,
    closeTo: rows.filter((q) => q !== r && overlaps(r, q)).map((q) => q.o.id),
  }));
  const tooClose = rows.length >= 2 && overlaps(rows[0], rows[1]);
  const leader = rows.length && rows.every((r) => r.m.den > 0) && entries[0].closeTo.length === 0 ? rows[0].o.id : null;
  return { entries, leader, tooClose };
}

export interface Completeness {
  scored: number;
  cells: number;
  complete: boolean;
  /** the pairs with no score, option by option */
  missing: { option: string; criterion: string }[];
}

export function completeness(s: CompareState): Completeness {
  const cells = cellsOf(s);
  const missing: { option: string; criterion: string }[] = [];
  for (const o of s.options) {
    for (const c of s.criteria) {
      const x = cells.get(cellKey(o.id, c.id));
      if (!x || x.value === null) missing.push({ option: o.id, criterion: c.id });
    }
  }
  const total = s.options.length * s.criteria.length;
  return { scored: total - missing.length, cells: total, complete: missing.length === 0, missing };
}

export interface Decisive {
  criterion: string;
  weight: number;
  /** the highest score on it minus the lowest, among the options scored on it */
  range: number;
  /** weight × range: how far apart it can pull the options' totals (before dividing by the total weight) */
  spread: number;
  /** the first option with the highest score, and with the lowest */
  best: string;
  worst: string;
}

/** The criteria that separate the options most — largest weighted spread first; criteria fewer than two options are scored on are left out. */
export function decisive(s: CompareState): Decisive[] {
  const cells = cellsOf(s);
  const out: (Decisive & { u: number; i: number })[] = [];
  s.criteria.forEach((c, i) => {
    let best: { o: string; u: number } | null = null;
    let worst: { o: string; u: number } | null = null;
    let n = 0;
    for (const o of s.options) {
      const x = cells.get(cellKey(o.id, c.id));
      if (!x || x.value === null) continue;
      n++;
      const u = units(x.value);
      if (!best || u > best.u) best = { o: o.id, u };
      if (!worst || u < worst.u) worst = { o: o.id, u };
    }
    if (n < 2 || !best || !worst) return;
    const rangeU = best.u - worst.u;
    out.push({ criterion: c.id, weight: c.weight, range: rangeU / S, spread: (c.weight * rangeU) / S, best: best.o, worst: worst.o, u: c.weight * rangeU, i });
  });
  out.sort((a, b) => b.u - a.u || a.i - b.i);
  return out.map(({ u: _u, i: _i, ...d }) => d);
}

// ── sensitivity: where one weight would turn the top two around ─────

/** One option's total as a function of one criterion's weight w: (n + a·w) ÷ (d + b·w), in hundredths. */
interface Line {
  n: number;
  d: number;
  a: number;
  b: number;
}

function lineOf(s: CompareState, cells: Map<string, CompareScore>, option: string, k: string): Line {
  const l: Line = { n: 0, d: 0, a: 0, b: 0 };
  for (const c of s.criteria) {
    const x = cells.get(cellKey(option, c.id));
    if (!x || x.value === null) continue;
    if (c.id === k) {
      l.a = units(x.value);
      l.b = 1;
    } else {
      l.n += c.weight * units(x.value);
      l.d += c.weight;
    }
  }
  return l;
}

export interface LeadSegment {
  /** a stretch of the weight (0..10 here; 0..1 in flipStrip) */
  from: number;
  to: number;
  /** who leads along it — the leader or the runner-up — or null where they are level throughout */
  lead: string | null;
}

interface Along {
  segs: LeadSegment[];
  /** P(w): positive where the leader is ahead, negative where the runner-up is — exact at whole weights */
  P: (w: number) => number;
  /** both totals exist at w */
  live: (w: number) => boolean;
}

/**
 * Who leads as one criterion's weight w runs over 0..10, every other weight
 * held where it is. Totals are T(w) = (n + a·w) ÷ (d + b·w), so T_A − T_B
 * has the sign of P(w) = N_A·D_B − N_B·D_A wherever both exist. When the two
 * options are scored on the same criteria — the usual case — P is (d + w)
 * times a LINEAR function of w and the order turns at its one root,
 * w = (n_B − n_A) ÷ (a − b). When they are not, P is a quadratic and both of
 * its roots are found. The coefficients are whole numbers (hundredths), so
 * how many roots there are, and P at every whole weight, are exact.
 */
function leadAlong(A: Line, B: Line, ids: readonly [string, string]): Along {
  const c0 = A.n * B.d - B.n * A.d;
  const c1 = A.n * B.b + A.a * B.d - B.n * A.b - B.a * A.d;
  const c2 = A.a * B.b - B.a * A.b;
  const P = (w: number) => c0 + c1 * w + c2 * w * w;
  const live = (w: number) => A.d + A.b * w > 0 && B.d + B.b * w > 0;
  const roots: number[] = [];
  if (c2 === 0) {
    if (c1 !== 0) roots.push(-c0 / c1);
  } else {
    const disc = c1 * c1 - 4 * c2 * c0;
    // a double root touches zero without crossing it: the order does not turn there
    if (disc > 0) {
      const q = Math.sqrt(disc);
      roots.push((-c1 - q) / (2 * c2), (-c1 + q) / (2 * c2));
    }
  }
  // a root at a whole weight is exactly that weight — P is exact there
  const snapped = roots.map((r) => {
    const m = Math.round(r);
    return Math.abs(r - m) < 1e-6 && P(m) === 0 ? m : r;
  });
  const cuts = [...new Set([0, 10, ...snapped.filter((r) => r > 0 && r < 10)])].sort((x, y) => x - y);
  const segs: LeadSegment[] = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    const mid = (cuts[i] + cuts[i + 1]) / 2;
    const p = live(mid) ? P(mid) : 0;
    const lead = p > 0 ? ids[0] : p < 0 ? ids[1] : null;
    const last = segs[segs.length - 1];
    if (last && last.lead === lead) last.to = cuts[i + 1];
    else segs.push({ from: cuts[i], to: cuts[i + 1], lead });
  }
  return { segs, P, live };
}

export interface Flip {
  criterion: string;
  /** its weight now */
  weight: number;
  /** the weight, nearest the present one, past which the runner-up would lead (they are level exactly there); null when no weight from 0 to 10 changes the order */
  at: number | null;
  /** which way the weight would have to move */
  dir: 'up' | 'down' | null;
  /** the first whole weight that way at which the runner-up does lead — what "set the weight to …" would take; null when none does */
  whole: number | null;
}

function flipOf(k: CompareCriterion, along: Along, runnerUp: string): Flip {
  const w0 = k.weight;
  let at: number | null = null;
  let dir: 'up' | 'down' | null = null;
  // level at the present weight with the runner-up ahead on both sides (a double root): any move turns it
  if (along.segs.some((g) => g.lead === runnerUp && g.from < w0 && w0 < g.to)) {
    at = w0;
    dir = w0 < 10 ? 'up' : 'down';
  } else {
    const up = along.segs.find((g) => g.lead === runnerUp && g.from >= w0);
    const down = [...along.segs].reverse().find((g) => g.lead === runnerUp && g.to <= w0);
    const du = up ? up.from - w0 : Infinity;
    const dd = down ? w0 - down.to : Infinity;
    if (up && du <= dd) {
      at = up.from;
      dir = 'up';
    } else if (down) {
      at = down.to;
      dir = 'down';
    }
  }
  let whole: number | null = null;
  if (dir && at !== null) {
    const step = dir === 'up' ? 1 : -1;
    for (let w = dir === 'up' ? Math.max(w0, Math.ceil(at)) : Math.min(w0, Math.floor(at)); w >= 0 && w <= 10; w += step) {
      if (along.live(w) && along.P(w) < 0) {
        whole = w;
        break;
      }
    }
  }
  return { criterion: k.id, weight: w0, at: at === null ? null : r6(at), dir, whole };
}

export interface Sensitivity {
  leader: string;
  runnerUp: string;
  /** the leader's total minus the runner-up's (0 when they are level) */
  gap: number;
  /** one per criterion, in criterion order */
  flips: Flip[];
}

function analyse(s: CompareState): { sen: Sensitivity; along: Along[] } | null {
  const cells = cellsOf(s);
  const rows = rowsInOrder(s, cells);
  const [A, B] = rows;
  if (!A || !B || A.m.den <= 0 || B.m.den <= 0) return null;
  const ids = [A.o.id, B.o.id] as const;
  const along = s.criteria.map((k) => leadAlong(lineOf(s, cells, A.o.id, k.id), lineOf(s, cells, B.o.id, k.id), ids));
  const gap = r6((A.m.num * B.m.den - B.m.num * A.m.den) / (A.m.den * B.m.den * S));
  return { sen: { leader: A.o.id, runnerUp: B.o.id, gap, flips: s.criteria.map((k, i) => flipOf(k, along[i], B.o.id)) }, along };
}

/** For the top two options: for each criterion, the weight at which their order would turn, holding the other weights fixed. Null with fewer than two totals. */
export function sensitivity(s: CompareState): Sensitivity | null {
  return analyse(s)?.sen ?? null;
}

// ── layouts a renderer draws, in 0..1 ────────────────────────────────

export interface GridCell {
  option: string;
  criterion: string;
  value: number | null;
  low: number | null;
  high: number | null;
  note: string | null;
  by: By | null;
  /** value ÷ 10 — how full to draw the cell; null when it is empty */
  shade: number | null;
}

/** The matrix: one row per criterion, one column per option. */
export function cellGrid(s: CompareState): { options: string[]; criteria: string[]; rows: GridCell[][] } {
  const cells = cellsOf(s);
  return {
    options: s.options.map((o) => o.id),
    criteria: s.criteria.map((c) => c.id),
    rows: s.criteria.map((c) =>
      s.options.map((o) => {
        const x = cells.get(cellKey(o.id, c.id));
        const v = x?.value ?? null;
        return {
          option: o.id,
          criterion: c.id,
          value: v,
          low: v === null ? null : (x!.low ?? v),
          high: v === null ? null : (x!.high ?? v),
          note: x?.note ?? null,
          by: x?.by ?? null,
          shade: v === null ? null : r6(v / L.maxScore),
        };
      })
    ),
  };
}

export interface RankBar {
  option: string;
  name: string;
  place: number;
  /** the total and its band along a 0..1 axis (total ÷ 10); null without a total */
  x: number | null;
  x0: number | null;
  x1: number | null;
  closeTo: string[];
  unscored: number;
}

/** The ranking as bars with their bands, best first. */
export function rankBars(s: CompareState): RankBar[] {
  const at = (v: number | null) => (v === null ? null : r6(v / L.maxScore));
  return ranking(s).entries.map((e) => ({ option: e.option, name: e.name, place: e.place, x: at(e.total), x0: at(e.low), x1: at(e.high), closeTo: e.closeTo, unscored: e.unscored }));
}

export interface FlipRow {
  criterion: string;
  /** the present weight along the strip (weight ÷ 10) */
  now: number;
  /** where the order turns along the strip, or null */
  flip: number | null;
  /** the strip 0..1 in stretches, and who leads along each */
  segments: LeadSegment[];
}

/** The sensitivity view: one strip per criterion, its weight from 0 to 10 drawn 0..1, coloured by who leads. */
export function flipStrip(s: CompareState): { leader: string; runnerUp: string; rows: FlipRow[] } | null {
  const a = analyse(s);
  if (!a) return null;
  return {
    leader: a.sen.leader,
    runnerUp: a.sen.runnerUp,
    rows: s.criteria.map((k, i) => ({
      criterion: k.id,
      now: r6(k.weight / L.maxWeight),
      flip: a.sen.flips[i].at === null ? null : r6(a.sen.flips[i].at! / L.maxWeight),
      segments: a.along[i].segs.map((g) => ({ from: r6(g.from / L.maxWeight), to: r6(g.to / L.maxWeight), lead: g.lead })),
    })),
  };
}

// ── operations ───────────────────────────────────────────────────────

const optOf = (s: CompareState, id: unknown) => s.options.find((o) => o.id === id);
const critOf = (s: CompareState, id: unknown) => s.criteria.find((c) => c.id === id);
const nameOfOpt = (s: CompareState, id: string) => optOf(s, id)?.name ?? id;
const nameOfCrit = (s: CompareState, id: string) => critOf(s, id)?.name ?? id;
const hasScore = (s: CompareState, option: string) => s.scores.some((x) => x.option === option && x.value !== null);
const scoredOn = (s: CompareState, option: string) => s.scores.filter((x) => x.option === option && x.value !== null).length;

const views: ViewDecl<CompareState>[] = [
  {
    id: 'matrix',
    label: 'Matrix',
    shows: 'every option against every criterion, with the weights and the scores',
    primary: true,
    interactions: ['score a cell', 'set a weight', 'add an option or a criterion'],
  },
  {
    id: 'ranking',
    label: 'Ranking',
    shows: 'the options in order of their weighted totals, with the band their ranges give and what is too close to call',
    interactions: ['open an option to see where its total comes from'],
    unavailable: (s) => {
      const none = s.options.filter((o) => !hasScore(s, o.id)).map((o) => o.name);
      if (!none.length) return null;
      return `${andList(none)} ${none.length === 1 ? 'has' : 'have'} no score yet — score every option on at least one criterion and they can be ranked.`;
    },
  },
  {
    id: 'sensitivity',
    label: 'Sensitivity',
    shows: 'for the top two options, how far each weight would have to move before their order turns',
    interactions: ['drag a weight and watch where the order turns'],
    unavailable: (s) =>
      s.options.filter((o) => scoredOn(s, o.id) >= 2).length >= 2
        ? null
        : 'It needs at least two options scored on at least two criteria each — then it can show which weights would change their order.',
  },
];

const VIEW_WORDS: Record<string, string[]> = {
  matrix: ['matrix', 'decision matrix', 'grid', 'table'],
  ranking: ['ranking', 'rankings', 'ranked list', 'leaderboard'],
  sensitivity: ['sensitivity', 'sensitivity analysis', 'tipping point', 'tipping points'],
};

const noOpt = (s: CompareState, id: unknown) => (optOf(s, id) ? null : 'There is no such option in the comparison.');
const noCrit = (s: CompareState, id: unknown) => (critOf(s, id) ? null : 'There is no such criterion in the comparison.');
const nameTaken = (list: readonly { id: string; name: string }[], name: string, except?: unknown) => list.some((x) => x.id !== except && keyOf(x.name) === keyOf(name));
const allIds = (s: CompareState) => [...s.options.map((o) => o.id), ...s.criteria.map((c) => c.id)];

/**
 * What the person changes becomes theirs. A change carries `by` (checked
 * against who applied the step), and when the person makes it — a weight they
 * set, a name they gave — the thing is the person's from then on, so Socria
 * cannot quietly set it back. Socria's own changes leave ownership as it was.
 */
const claim = (a: Args, was: By): By => (a.by === 'person' ? 'person' : was);

function withState(s: CompareState, patch: Partial<CompareState>): CompareState {
  return sanitizeCompare({ ...s, ...patch }) ?? s;
}

/** Socria removing an option or a criterion would take the person's scores with it. */
function guardTheirScores(s: CompareState, on: (x: CompareScore) => boolean, ctx: Ctx): string | null {
  if (ctx?.by === 'socria' && s.scores.some((x) => on(x) && x.by === 'person')) {
    return 'It holds your scores — Socria does not remove what you judged. It can suggest removing it for you to do.';
  }
  return null;
}

/** The state after a score op: the new judgment replaces the old one; the note, a fact about the pair, stays. */
function scored(s: CompareState, a: Args): CompareState {
  const old = scoreOf(s, String(a.option), String(a.criterion));
  const rest = s.scores.filter((x) => x !== old);
  // who judged it is who says so (checked against who applied the step); unsaid, a pair keeps its owner
  const by: By = a.by === 'person' || a.by === 'socria' ? a.by : (old?.by ?? cleanBy(a.by));
  if (a.value === '') {
    return withState(s, { scores: old?.note ? [...rest, { option: old.option, criterion: old.criterion, value: null, note: old.note, by }] : rest });
  }
  const v = scoreNum(a.value);
  if (v === null) return s;
  const lo = scoreNum(a.low);
  const hi = scoreNum(a.high);
  return withState(s, {
    scores: [
      ...rest,
      {
        option: String(a.option),
        criterion: String(a.criterion),
        value: v,
        ...(lo !== null && lo < v ? { low: lo } : {}),
        ...(hi !== null && hi > v ? { high: hi } : {}),
        ...(old?.note ? { note: old.note } : {}),
        by,
      },
    ],
  });
}

/** The state after a note op: on a pair when `criterion` is given, else on the option itself. */
function noted(s: CompareState, a: Args): CompareState {
  if (a.criterion === undefined || a.criterion === '') {
    const note = cleanText(a.note, L.note);
    return withState(s, {
      options: s.options.map((o) => {
        if (o.id !== a.option) return o;
        const { note: _n, ...rest } = o;
        return { ...rest, ...(note ? { note } : {}), by: claim(a, o.by) };
      }),
    });
  }
  const note = cleanText(a.note, L.scoreNote);
  const old = scoreOf(s, String(a.option), String(a.criterion));
  if (!old) return note ? withState(s, { scores: [...s.scores, { option: String(a.option), criterion: String(a.criterion), value: null, note, by: cleanBy(a.by) }] }) : s;
  const { note: _n, ...rest } = old;
  // a pair left with neither a score nor a note is unscored again (sanitize drops it)
  return withState(s, { scores: s.scores.map((x) => (x === old ? { ...rest, ...(note ? { note } : {}), by: claim(a, old.by) } : x)) });
}

function rangeSaid(a: Args): string {
  const v = scoreNum(a.value);
  if (v === null) return '';
  const lo = scoreNum(a.low) ?? v;
  const hi = scoreNum(a.high) ?? v;
  return lo < v || hi > v ? ` (${fmt(Math.min(lo, v))}–${fmt(Math.max(hi, v))})` : '';
}

export const COMPARE_OPS = {
  ...headOps<CompareState>(views, sanitizeCompare),
  addOption: op<CompareState>(
    'Add an option',
    (s, a, ctx) => {
      const name = cleanText(a.name, L.name);
      if (!name) return 'Say what the option is.';
      if (s.options.length >= L.options) return `A comparison holds ${L.options} options at most.`;
      if (nameTaken(s.options, name)) return `There is already an option called ‘${name}’.`;
      return guardBy(a, ctx);
    },
    (s, a) => {
      const note = cleanText(a.note, L.note);
      return withState(s, { options: [...s.options, { id: nextId('o', allIds(s)), name: cleanText(a.name, L.name), ...(note ? { note } : {}), by: cleanBy(a.by) }] });
    },
    (a) => `added the option “${cleanText(a.name, L.name)}”`
  ),
  renameOption: op<CompareState>(
    'Rename an option',
    (s, a, ctx) => {
      const miss = noOpt(s, a.id);
      if (miss) return miss;
      const name = cleanText(a.name, L.name);
      if (!name) return 'Say what it should be called.';
      if (optOf(s, a.id)!.name === name) return 'It is already called that.';
      if (nameTaken(s.options, name, a.id)) return `There is already an option called ‘${name}’.`;
      return guardOwn(optOf(s, a.id), ctx) ?? guardBy(a, ctx);
    },
    (s, a) => withState(s, { options: s.options.map((o) => (o.id === a.id ? { ...o, name: cleanText(a.name, L.name), by: claim(a, o.by) } : o)) }),
    (a) => `renamed “${cleanText(a.name, L.name)}”`
  ),
  removeOption: op<CompareState>(
    'Remove an option',
    (s, a, ctx) => {
      const miss = noOpt(s, a.id);
      if (miss) return miss;
      if (s.options.length <= L.minOptions) return `A comparison needs at least ${L.minOptions} options — add another before taking this one away.`;
      return guardOwn(optOf(s, a.id), ctx) ?? guardTheirScores(s, (x) => x.option === a.id, ctx);
    },
    (s, a) => withState(s, { options: s.options.filter((o) => o.id !== a.id), scores: s.scores.filter((x) => x.option !== a.id) }),
    () => 'removed an option'
  ),
  addCriterion: op<CompareState>(
    'Add a criterion',
    (s, a, ctx) => {
      const name = cleanText(a.name, L.name);
      if (!name) return 'Say what the criterion is.';
      if (s.criteria.length >= L.criteria) return `A comparison weighs ${L.criteria} criteria at most.`;
      if (nameTaken(s.criteria, name)) return `There is already a criterion called ‘${name}’.`;
      if (a.weight !== undefined && a.weight !== '' && wholeIn(a.weight, 0, L.maxWeight) === null) return `A weight is a whole number from 0 (does not count) to ${L.maxWeight} (matters most).`;
      return guardBy(a, ctx);
    },
    (s, a) =>
      withState(s, {
        criteria: [...s.criteria, { id: nextId('c', allIds(s)), name: cleanText(a.name, L.name), weight: wholeIn(a.weight, 0, L.maxWeight) ?? DEFAULT_WEIGHT, by: cleanBy(a.by) }],
      }),
    (a) => `added the criterion “${cleanText(a.name, L.name)}”${wholeIn(a.weight, 0, L.maxWeight) !== null ? `, weight ${wholeIn(a.weight, 0, L.maxWeight)}` : ''}`
  ),
  renameCriterion: op<CompareState>(
    'Rename a criterion',
    (s, a, ctx) => {
      const miss = noCrit(s, a.id);
      if (miss) return miss;
      const name = cleanText(a.name, L.name);
      if (!name) return 'Say what it should be called.';
      if (critOf(s, a.id)!.name === name) return 'It is already called that.';
      if (nameTaken(s.criteria, name, a.id)) return `There is already a criterion called ‘${name}’.`;
      return guardOwn(critOf(s, a.id), ctx) ?? guardBy(a, ctx);
    },
    (s, a) => withState(s, { criteria: s.criteria.map((c) => (c.id === a.id ? { ...c, name: cleanText(a.name, L.name), by: claim(a, c.by) } : c)) }),
    (a) => `renamed “${cleanText(a.name, L.name)}”`
  ),
  removeCriterion: op<CompareState>(
    'Remove a criterion',
    (s, a, ctx) => {
      const miss = noCrit(s, a.id);
      if (miss) return miss;
      if (s.criteria.length <= L.minCriteria) return 'A comparison needs at least one criterion to judge the options on.';
      return guardOwn(critOf(s, a.id), ctx) ?? guardTheirScores(s, (x) => x.criterion === a.id, ctx);
    },
    (s, a) => withState(s, { criteria: s.criteria.filter((c) => c.id !== a.id), scores: s.scores.filter((x) => x.criterion !== a.id) }),
    () => 'removed a criterion'
  ),
  weight: op<CompareState>(
    'Set a weight',
    (s, a, ctx) => {
      const miss = noCrit(s, a.criterion);
      if (miss) return miss;
      const w = wholeIn(a.weight, 0, L.maxWeight);
      if (w === null) return `A weight is a whole number from 0 (does not count) to ${L.maxWeight} (matters most).`;
      const c = critOf(s, a.criterion)!;
      const own = guardOwn(c, ctx, 'That weight') ?? guardBy(a, ctx);
      if (own) return own;
      // a step that changes nothing the person can see is not a step
      if (w === c.weight) return `‘${c.name}’ already weighs ${w}${w === L.maxWeight ? ', the most a weight can be' : w === 0 ? ', so it does not count at all' : ''}.`;
      return null;
    },
    (s, a) => withState(s, { criteria: s.criteria.map((c) => (c.id === a.criterion ? { ...c, weight: wholeIn(a.weight, 0, L.maxWeight) ?? c.weight, by: claim(a, c.by) } : c)) }),
    (a) => `weight set to ${wholeIn(a.weight, 0, L.maxWeight) ?? a.weight}`
  ),
  score: op<CompareState>(
    'Score',
    (s, a, ctx) => {
      const miss = noOpt(s, a.option) ?? noCrit(s, a.criterion);
      if (miss) return miss;
      const old = scoreOf(s, String(a.option), String(a.criterion));
      const ranged = (a.low !== undefined && a.low !== '') || (a.high !== undefined && a.high !== '');
      if (a.value === '') {
        if (ranged) return 'A range goes round a score — give the score too.';
        if (!old || old.value === null) return 'There is no score there to clear.';
      } else {
        const v = scoreNum(a.value);
        if (v === null) return `A score is a number from 0 to ${L.maxScore}, where ${L.maxScore} is best for you.`;
        const lo = a.low === undefined || a.low === '' ? v : scoreNum(a.low);
        const hi = a.high === undefined || a.high === '' ? v : scoreNum(a.high);
        if (lo === null || hi === null) return `A range runs within 0 to ${L.maxScore}.`;
        if (lo > v || hi < v) return 'A range has to hold the score: low ≤ score ≤ high.';
      }
      const own = guardOwn(old, ctx, 'That score') ?? guardBy(a, ctx);
      if (own) return own;
      const next = scoreOf(scored(s, a), String(a.option), String(a.criterion));
      if (old && next && old.value === next.value && old.low === next.low && old.high === next.high) return 'It already has exactly that score.';
      return null;
    },
    (s, a) => scored(s, a),
    (a) => (a.value === '' ? 'score cleared' : `scored ${fmt(scoreNum(a.value) ?? 0)}${rangeSaid(a)}`)
  ),
  note: op<CompareState>(
    'Note',
    (s, a, ctx) => {
      const miss = noOpt(s, a.option);
      if (miss) return miss;
      if (a.note === undefined) return 'Say what the note is — or leave it empty to clear it.';
      const onPair = a.criterion !== undefined && a.criterion !== '';
      if (onPair && !critOf(s, a.criterion)) return 'There is no such criterion in the comparison.';
      const target = onPair ? scoreOf(s, String(a.option), String(a.criterion)) : optOf(s, a.option);
      const own = guardOwn(target, ctx) ?? guardBy(a, ctx);
      if (own) return own;
      const note = cleanText(a.note, onPair ? L.scoreNote : L.note);
      if ((target?.note ?? '') === note) return note ? 'It already says that.' : 'There is no note there to clear.';
      return null;
    },
    (s, a) => noted(s, a),
    (a) => (cleanText(a.note, L.note) ? 'noted' : 'note cleared')
  ),
};

// ── words → an operation ─────────────────────────────────────────────

/** "commute's" names "commute": the possessive is not part of a name, in the words or the labels. */
const unS = (t: string) => t.replace(/(\w)[’']s\b/g, '$1');

type Target = { kind: 'option'; o: CompareOption } | { kind: 'criterion'; c: CompareCriterion };
const OPT_WORD = /\b(?:option|options|choice|choices|alternative|alternatives)\b/;
const CRIT_WORD = /\b(?:criterion|criteria|factor|factors|consideration|considerations)\b/;

/**
 * Every option and criterion whose WHOLE name is in the words — longest name
 * first, each taken out of the words once found, so "salary job" is not also
 * read as "salary" — and the words that are left.
 */
function namedIn(s: CompareState, text: string): { named: Target[]; rest: string } {
  const all = [
    ...s.options.map((o) => ({ t: { kind: 'option', o } as Target, l: norm(unS(o.name)) })),
    ...s.criteria.map((c) => ({ t: { kind: 'criterion', c } as Target, l: norm(unS(c.name)) })),
  ].sort((a, b) => b.l.length - a.l.length);
  let said = ` ${norm(unS(text))} `;
  const named: Target[] = [];
  for (const x of all) {
    if (x.l.length >= 2 && said.includes(` ${x.l} `)) {
      named.push(x.t);
      said = said.split(` ${x.l} `).join('  ');
    }
  }
  return { named, rest: said };
}

/** The one option or criterion the words are about — a whole name before part of one, a type word ("the option") to settle a clash — or null when it is not plain which. */
function oneTarget(s: CompareState, text: string): Target | null {
  const low = ` ${norm(text)} `;
  const wantO = OPT_WORD.test(low) && !CRIT_WORD.test(low);
  const wantC = CRIT_WORD.test(low) && !OPT_WORD.test(low);
  const fits = (t: Target) => (wantO ? t.kind === 'option' : wantC ? t.kind === 'criterion' : true);
  const { named } = namedIn(s, text);
  if (named.length) {
    const fit = named.filter(fits);
    return fit.length === 1 && (named.length === 1 || wantO || wantC) ? fit[0] : null;
  }
  const o = findByLabel(s.options, (x) => unS(x.name), unS(text));
  const c = findByLabel(s.criteria, (x) => unS(x.name), unS(text));
  const cands = [...(o ? [{ kind: 'option', o } as Target] : []), ...(c ? [{ kind: 'criterion', c } as Target] : [])].filter(fits);
  return cands.length === 1 ? cands[0] : null;
}

/**
 * The option and the criterion a score names. At least one of them by its
 * whole name; the other may be named in part, among the words the first did
 * not use — never both in part, where one shared word ("beach") could pair
 * the wrong option with the wrong criterion.
 */
function pairNamed(s: CompareState, text: string): { o: CompareOption; c: CompareCriterion } | null {
  const { named, rest } = namedIn(s, text);
  const os = named.filter((t): t is { kind: 'option'; o: CompareOption } => t.kind === 'option');
  const cs = named.filter((t): t is { kind: 'criterion'; c: CompareCriterion } => t.kind === 'criterion');
  if (os.length > 1 || cs.length > 1 || (!os.length && !cs.length)) return null;
  const o = os[0]?.o ?? findByLabel(s.options, (x) => unS(x.name), rest);
  const c = cs[0]?.c ?? findByLabel(s.criteria, (x) => unS(x.name), rest);
  return o && c ? { o, c } : null;
}

const escapeRe = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The number the words give, with the names taken out first (an option called
 * "Offer 2" is not a score of 2): exactly one number, and optionally a range
 * ("between 5 and 9", "5–9"). "7/10" and "7 out of 10" are 7. Null when there
 * is no number or more than one — a range alone is not a score, and no
 * midpoint is made up for it.
 */
function numberSaid(text: string, names: readonly string[]): { value: number; low?: number; high?: number } | null {
  let w = ` ${unS(text).toLowerCase().replace(/\s+/g, ' ')} `;
  for (const n of [...names].sort((a, b) => b.length - a.length)) {
    const l = unS(n).toLowerCase().replace(/\s+/g, ' ').trim();
    if (l.length >= 2) w = w.replace(new RegExp(`(^|[^a-z0-9])${escapeRe(l)}(?=[^a-z0-9]|$)`, 'g'), '$1 ');
  }
  w = w.replace(/(\d+(?:\.\d+)?)\s*(?:\/|out of)\s*10\b/g, '$1');
  let low: number | undefined;
  let high: number | undefined;
  const rg =
    /\b(?:between|from)\s+(\d+(?:\.\d+)?)\s+(?:and|to)\s+(\d+(?:\.\d+)?)/.exec(w) ??
    /(?:^|[\s(])(\d+(?:\.\d+)?)\s*(?:–|—|-|to)\s*(\d+(?:\.\d+)?)(?=[\s),.;!]|$)/.exec(w);
  if (rg) {
    low = Number(rg[1]);
    high = Number(rg[2]);
    w = `${w.slice(0, rg.index)} ${w.slice(rg.index + rg[0].length)}`;
  }
  const nums = [...w.matchAll(/(?:^|[^\w.])(-?\d+(?:\.\d+)?)(?![\w]|\.\d)/g)].map((m) => Number(m[1]));
  if (nums.length !== 1 || !Number.isFinite(nums[0])) return null;
  return { value: nums[0], ...(low !== undefined && high !== undefined ? { low: Math.min(low, high), high: Math.max(low, high) } : {}) };
}

const MORE = /\b(?:more important|matters more|matter more|mattered more|counts more|count more|counted more|weighs more|weigh more|weighed more|more weight|higher weight|heavier weight|care more about|cares more about|cared more about)\b/;
const LESS = /\b(?:less important|matters less|matter less|mattered less|counts less|count less|counted less|weighs less|weigh less|weighed less|less weight|lower weight|lighter weight|care less about|cares less about|cared less about|not as important|isnt as important|less of a priority)\b/;
const RAISE = /\b(?:increase|raise|boost|bump up)\b.*\bweight\b/;
const LOWER = /\b(?:decrease|lower|reduce|cut)\b.*\bweight\b/;
const MOST = /\b(?:matters most|matter most|most important)\b/;
const WEIGHT_WORD = /\bweigh(?:t|ts|ted|s|ing)?\b/;
const SCORE_VERB = /\b(?:score|scores|scored|rate|rates|rated|give|gives|gave|mark|marks|put|gets|get|got)\b/;
const RELATIVE = /\b(?:more|less|higher|lower|extra|another|increase|decrease|raise|reduce)\b/;

/**
 * An operation the words plainly ask for. Conservative by design: this runs
 * on every message while a comparison is in the workspace, so it answers only
 * when the words name an option or criterion of THIS comparison (or clearly
 * add one), and otherwise leaves the message to the conversation. Nothing in
 * a comparison depends on the day; `today` is taken so every display's reader
 * has the same shape.
 */
export function readCompareOp(text: string, s: CompareState, _today?: string): { op: string; args: Args } | null {
  const said = text.trim();
  if (!said || said.length > 200 || asking(said)) return null;
  // "can you add an option: Freelancing?" is "add an option: Freelancing"; "what if…?" keeps its words
  const t = said.replace(/^(?:(?:can|could|would|will)\s+you\s+)?(?:please\s+)?/i, '').replace(/\?+\s*$/, '').trim();
  if (!t) return null;
  const low = ` ${norm(unS(t))} `;

  // a view: "show the ranking", "as a matrix", "rank them", or just "sensitivity"
  const view = readView(t, views, VIEW_WORDS);
  if (view && t.length <= 60 && !namedIn(s, t).named.length) return { op: 'view', args: { view } };
  const bare = /^(?:(?:go\s+)?back\s+to\s+)?(?:the\s+)?(matrix|ranking|sensitivity)(?:\s+(?:view|analysis))?\s*[.!]?$/i.exec(t);
  if (bare) return { op: 'view', args: { view: bare[1].toLowerCase() } };
  if (/^(?:please\s+)?(?:rank|order)\s+(?:them|these|the options|my options|the choices)\b/i.test(t)) return { op: 'view', args: { view: 'ranking' } };

  // rename: "rename Job A to Acme", "rename the commute criterion to travel time"
  const rn = /^(?:please\s+)?rename\s+(.+?)\s+(?:to|as)\s+(.+?)[.!]*$/i.exec(t);
  if (rn) {
    const target = oneTarget(s, rn[1]);
    const name = cleanText(rn[2].replace(/^[“"']|[”"']$/g, ''), L.name);
    if (!target || !name) return null;
    return target.kind === 'option'
      ? { op: 'renameOption', args: { id: target.o.id, name, by: 'person' } }
      : { op: 'renameCriterion', args: { id: target.c.id, name, by: 'person' } };
  }

  // clear a score: "clear Job A's score on salary"
  if (/\b(?:clear|remove|delete|erase|wipe)\b/.test(low) && /\b(?:score|rating|mark)\b/.test(low)) {
    const p = pairNamed(s, t);
    if (p) return { op: 'score', args: { option: p.o.id, criterion: p.c.id, value: '', by: 'person' } };
  }

  // a note — only a sentence that is one: "note for Job A on salary: $95k base", "clear the note on Job A"
  const noteAsk = /^(?:please\s+)?(?:(?:add|put|write)\s+(?:a\s+)?note|note|(clear|remove|delete|erase)\s+the\s+note)\b/i.exec(t);
  if (noteAsk) {
    const clearing = !!noteAsk[1];
    const body = clearing ? null : quotedOrAfterColon(t);
    if (body === null && !clearing) return null;
    const head = body === null ? t : t.slice(0, Math.max(0, t.lastIndexOf(body))) || t;
    const p = pairNamed(s, head);
    const one = p ? null : oneTarget(s, head);
    const o = p?.o ?? (one?.kind === 'option' ? one.o : null);
    if (!o) return null;
    const note = clearing ? '' : cleanText(body, p ? L.scoreNote : L.note);
    if (!clearing && !note) return null;
    return { op: 'note', args: { option: o.id, ...(p ? { criterion: p.c.id } : {}), note, by: 'person' } };
  }

  // remove: "remove commute", "drop the option Job B"
  if (/^(?:please\s+)?(?:remove|delete|drop|take out|get rid of|cross off|scrap)\b/i.test(t)) {
    if (/\b(?:weight|range)\b/.test(low)) return null;
    const target = oneTarget(s, t);
    if (!target) return null;
    return target.kind === 'option' ? { op: 'removeOption', args: { id: target.o.id } } : { op: 'removeCriterion', args: { id: target.c.id } };
  }

  // add: "add an option: Freelancing", "add growth as a criterion", "add a criterion: growth, weight 8"
  const add = /^(?:please\s+)?(?:add|include)\s+(.+?)[.!]*$/i.exec(t) ?? /^((?:another|one more|a new|new)\s+(?:option|choice|alternative|criterion|factor)\s*:\s*.+?)[.!]*$/i.exec(t);
  if (add) {
    const body = add[1];
    const isOpt = OPT_WORD.test(` ${body.toLowerCase()} `);
    const isCrit = CRIT_WORD.test(` ${body.toLowerCase()} `);
    if (isOpt === isCrit) return null;
    let name =
      quotedOrAfterColon(body) ??
      body
        .replace(/\s+as\s+(?:an?|another|a new|one more|the)?\s*(?:other\s+)?(?:option|choice|alternative|criterion|factor|consideration)\s*$/i, '')
        .replace(/^(?:an?|the|another|one more|a new|new|a third|a fourth|a fifth)\s+/i, '')
        .replace(/^(?:option|choice|alternative|criterion|factor|consideration)\b\s*(?:called|named|for|of)?\s*/i, '')
        .replace(/^of\s+/i, '');
    let weight: number | null = null;
    if (isCrit) {
      const wm = /[,(]?\s*(?:with\s+)?(?:a\s+)?weight(?:ed)?\s*(?:of\s*)?(\d{1,2})\s*\)?\s*$/i.exec(name);
      if (wm) {
        weight = Number(wm[1]);
        name = name.slice(0, wm.index);
      }
    }
    name = cleanText(name.replace(/^[“"']|[”"']$/g, '').replace(/[.!,;:]+$/, ''), L.name);
    if (!name || name.split(' ').length > 8) return null;
    // "the option of working remotely to Job B" is about Job B, not a new option
    const said = ` ${norm(name)} `;
    const aboutOne = [...s.options, ...s.criteria].some((x) => {
      const l = norm(x.name);
      return l.length >= 2 && ['to', 'for', 'on', 'at', 'in', 'of'].some((p) => said.includes(` ${p} ${l} `));
    });
    if (aboutOne) return null;
    return isOpt
      ? { op: 'addOption', args: { name, by: 'person' } }
      : { op: 'addCriterion', args: { name, ...(weight !== null ? { weight } : {}), by: 'person' } };
  }

  // a score: "score Job A 7 on salary", "give Job B a 4 for commute", "rate Job A 8 for growth, 6 to 9"
  if (SCORE_VERB.test(low) && !RELATIVE.test(low) && !WEIGHT_WORD.test(low)) {
    const p = pairNamed(s, t);
    if (p) {
      const n = numberSaid(t, [p.o.name, p.c.name]);
      if (!n) return null;
      return { op: 'score', args: { option: p.o.id, criterion: p.c.id, value: n.value, ...(n.low !== undefined ? { low: n.low, high: n.high! } : {}), by: 'person' } };
    }
  }

  // a weight: "set the weight of salary to 8", "make salary more important", "what if commute mattered more"
  const rel = MORE.test(low) || RAISE.test(low) ? 1 : LESS.test(low) || LOWER.test(low) ? -1 : 0;
  if (rel || MOST.test(low) || WEIGHT_WORD.test(low)) {
    if (/\bthan\b/.test(low)) return null; // "salary matters more than commute" weighs one against another: not one plain change
    const target = oneTarget(s, t);
    if (!target || target.kind !== 'criterion') return null;
    const c = target.c;
    // "raise the weight of salary to 8" says where, not how much
    const to = /\bto\s+(\d{1,2})\b/.exec(low);
    if (rel && to) return { op: 'weight', args: { criterion: c.id, weight: Number(to[1]), by: 'person' } };
    if (rel) {
      const by = /\bby\s+(\d{1,2})\b/.exec(low);
      const w = Math.max(0, Math.min(L.maxWeight, c.weight + rel * (by ? Number(by[1]) : 2)));
      return { op: 'weight', args: { criterion: c.id, weight: w, by: 'person' } };
    }
    if (MOST.test(low)) return { op: 'weight', args: { criterion: c.id, weight: L.maxWeight, by: 'person' } };
    const n = numberSaid(t, [c.name]);
    if (n && n.low === undefined) return { op: 'weight', args: { criterion: c.id, weight: n.value, by: 'person' } };
  }
  return null;
}

// ── the kind ─────────────────────────────────────────────────────────

const bandSaid = (e: { total: number | null; low: number | null; high: number | null }) =>
  e.total !== null && e.low !== null && e.high !== null && (e.low < e.total || e.high > e.total) ? ` (${fmt(e.low)}–${fmt(e.high)})` : '';

function flipSaid(s: CompareState, f: Flip, runnerUp: string): string {
  const c = nameOfCrit(s, f.criterion);
  const b = nameOfOpt(s, runnerUp);
  if (f.at === f.weight) return `They are level at ${c}’s present weight of ${f.weight}: ${f.dir === 'up' ? 'raising' : 'lowering'} it puts ${b} ahead.`;
  return `If ${c} weighed ${f.dir === 'up' ? 'more' : 'less'} than ${fmt(f.at!)} (it weighs ${f.weight}), ${b} would lead${f.whole !== null ? ` — at ${f.whole} it does` : ''}.`;
}

function factsOf(s: CompareState, guarded: boolean): string[] {
  const nO = s.options.length;
  const nC = s.criteria.length;
  const out = [`${s.title}: a comparison of ${nO} options against ${nC} criteri${nC === 1 ? 'on' : 'a'}, shown as ${s.view}; scores run 0–10, 10 best for the person.`];
  const done = completeness(s);
  if (done.complete) out.push('Every option is scored on every criterion.');
  else {
    const miss = done.missing.map((m) => `${nameOfOpt(s, m.option)} on ${nameOfCrit(s, m.criterion)}`);
    out.push(`${done.scored} of ${done.cells} scores given; not scored yet: ${andList(miss, 4)}. A missing score is left empty, never filled in.`);
  }
  if (guarded) {
    out.push('The weighted totals, the ranking and what would change it are computed, and withheld while the person works the comparison out.');
  } else {
    const rk = ranking(s);
    const withTotal = rk.entries.filter((e) => e.total !== null);
    if (withTotal.length) {
      out.push(`Weighted totals out of 10: ${withTotal.map((e) => `${e.name} ${fmt(e.total!)}${bandSaid(e)}${e.unscored ? ` over ${e.scored} of ${nC}` : ''}`).join('; ')}.`);
    }
    const without = rk.entries.filter((e) => e.total === null).map((e) => e.name);
    if (without.length) out.push(`${andList(without)} ${without.length === 1 ? 'has' : 'have'} no total yet: nothing that counts is scored.`);
    const [a, b] = rk.entries;
    if (a && b && a.total !== null && b.total !== null) {
      if (rk.tooClose) {
        out.push(a.total === b.total && !bandSaid(a) && !bandSaid(b) ? `${a.name} and ${b.name} are level.` : `${a.name} and ${b.name} are too close to call: their ranges overlap (${fmt(a.low!)}–${fmt(a.high!)} and ${fmt(b.low!)}–${fmt(b.high!)}).`);
      } else out.push(`${a.name} leads ${b.name} by ${fmt(a.total - b.total)}.`);
      if (a.unscored || b.unscored) out.push(`Their totals do not cover the same criteria yet, so the comparison is not like for like.`);
    }
    const d = decisive(s).find((x) => x.spread > 0);
    if (d) {
      const sc = (o: string) => fmt(scoreOf(s, o, d.criterion)!.value!);
      out.push(`${nameOfCrit(s, d.criterion)} separates them most: ${nameOfOpt(s, d.best)} ${sc(d.best)} against ${nameOfOpt(s, d.worst)} ${sc(d.worst)}, at weight ${d.weight}.`);
    }
    const sen = sensitivity(s);
    if (sen) {
      const turns = sen.flips.filter((f) => f.at !== null);
      for (const f of turns.slice(0, 3)) out.push(flipSaid(s, f, sen.runnerUp));
      const never = sen.flips.filter((f) => f.at === null).map((f) => nameOfCrit(s, f.criterion));
      if (never.length) out.push(`No weight from 0 to 10 on ${andList(never)} changes the order of ${nameOfOpt(s, sen.leader)} and ${nameOfOpt(s, sen.runnerUp)}.`);
    }
  }
  const theirs = (xs: readonly { by: By }[]) => xs.filter((x) => x.by === 'person').length;
  const mine = theirs(s.options) + theirs(s.criteria) + theirs(s.scores);
  if (mine) out.push(`${mine} of its options, criteria (with their weights) and scores are the person’s own; Socria does not change those.`);
  return out;
}

function textOf(s: CompareState): string {
  const cells = cellsOf(s);
  const theirs = (x: { by: By }) => (x.by === 'person' ? ' · theirs' : '');
  const lines = [
    `COMPARISON “${s.title}” (shown as ${s.view}; scores 0–10, 10 best for the person; weights 0–10)`,
    `Criteria: ${s.criteria.map((c) => `${c.name} (weight ${c.weight})${theirs(c)}`).join('; ')}`,
  ];
  s.options.forEach((o, i) => {
    lines.push(`${i + 1}. ${o.name}${o.note ? ` — ${o.note}` : ''}${theirs(o)}`);
    const row = s.criteria.map((c) => {
      const x = cells.get(cellKey(o.id, c.id));
      if (!x) return `${c.name} —`;
      const v = x.value === null ? '— (not scored)' : `${fmt(x.value)}${x.low !== undefined || x.high !== undefined ? ` [${fmt(x.low ?? x.value)}–${fmt(x.high ?? x.value)}]` : ''}`;
      return `${c.name} ${v}${x.note ? ` “${x.note}”` : ''}${theirs(x)}`;
    });
    lines.push(`   ${row.join('; ')}`);
  });
  return lines.join('\n').slice(0, 2400);
}

function partFactsOf(s: CompareState, part: string): string[] | null {
  const o = optOf(s, part);
  if (o) {
    const e = ranking(s).entries.find((x) => x.option === o.id)!;
    return [
      o.name,
      ...(o.note ? [o.note] : []),
      e.total === null ? 'no total yet' : `total ${fmt(e.total)}${bandSaid(e)}, ${e.place === 1 ? 'first' : `place ${e.place}`} of ${s.options.length}`,
      ...(e.unscored ? [`not scored on ${e.unscored} criteri${e.unscored === 1 ? 'on' : 'a'}`] : []),
      o.by === 'person' ? 'yours' : 'from Socria',
    ];
  }
  const c = critOf(s, part);
  if (!c) return null;
  const d = decisive(s).find((x) => x.criterion === c.id);
  const f = sensitivity(s)?.flips.find((x) => x.criterion === c.id);
  return [
    c.name,
    `weight ${c.weight} of ${L.maxWeight}`,
    ...(d ? [`scores range over ${fmt(d.range)} points`] : []),
    ...(f ? [f.at === null ? 'no weight from 0 to 10 changes the top two' : `the top two turn at weight ${fmt(f.at)}`] : []),
    c.by === 'person' ? 'yours' : 'from Socria',
  ];
}

export const COMPARE = displayKind<CompareState>({
  kind: 'compare',
  label: 'Comparison',
  sanitize: sanitizeCompare,
  ops: COMPARE_OPS,
  readOp: (text, s) => readCompareOp(text, s, todayDay()),
  consequence: (before, after, step) => {
    const rb = ranking(before);
    const ra = ranking(after);
    const top = (r: Ranking) => (r.entries.length > 1 && r.entries[0].total !== null && r.entries[1].total !== null ? r.entries : null);
    const tb = top(rb);
    const ta = top(ra);
    if (ta) {
      const [a, b] = ta;
      const score = `${fmt(a.total!)} to ${fmt(b.total!)}`;
      if (tb && tb[0].option !== a.option && after.options.some((o) => o.id === tb[0].option)) return `${a.name} now leads ${b.name}: ${score}.`;
      if (!tb || rb.tooClose !== ra.tooClose) return ra.tooClose ? `${a.name} and ${b.name} are too close to call now: ${score}.` : `${a.name} leads ${b.name}: ${score}.`;
      if (step.op === 'weight' && (tb[0].total !== a.total || tb[1].total !== b.total)) {
        return ra.tooClose ? `${a.name} and ${b.name} are still too close to call: ${score}.` : `${a.name} still leads ${b.name}: ${score}.`;
      }
    }
    if (step.op === 'score') {
      const x = totals(after).find((y) => y.option === step.args.option);
      const was = totals(before).find((y) => y.option === step.args.option);
      if (x && was && x.total !== was.total) return x.total === null ? `${nameOfOpt(after, x.option)} has no total now.` : `${nameOfOpt(after, x.option)}’s total is now ${fmt(x.total)}.`;
    }
    if (!completeness(before).complete && completeness(after).complete) return 'Every option is now scored on every criterion.';
    return null;
  },
  facts: (s, { guarded }) => factsOf(s, guarded),
  text: textOf,
  parts: (s): Part[] => [...s.options.map((o) => ({ id: o.id, label: o.name })), ...s.criteria.map((c) => ({ id: c.id, label: c.name }))],
  partFacts: partFactsOf,
  views,
  size: (s, mode) => {
    if (mode === 'card') return { w: 260, h: 150 };
    if (mode === 'trail') return { w: 200, h: 110 };
    const nO = s.options.length;
    const nC = s.criteria.length;
    if (s.view === 'ranking') return { w: 560, h: Math.min(640, 150 + 48 * nO) };
    if (s.view === 'sensitivity') return { w: 600, h: Math.min(640, 170 + 44 * nC) };
    return { w: Math.min(720, 220 + 100 * nO), h: Math.min(640, 160 + 44 * nC) };
  },
  shape: (s) => `${s.view === 'matrix' ? 'comparison' : s.view} · ${s.options.length} options × ${s.criteria.length} criteri${s.criteria.length === 1 ? 'on' : 'a'}`,
});

export const COMPARE_META: DisplayMeta = {
  kind: 'compare',
  noun: 'comparison',
  handle: 'C',
  about: 'Options weighed against what matters — a decision matrix with weights, scores and their uncertainty, a ranking, and what would change it.',
};

register(COMPARE);
registerDisplay(COMPARE_META);
