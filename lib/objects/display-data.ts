// A CHART OF THE PERSON'S OWN NUMBERS — a table, checked, drawn as a table or a chart.
//
// "Chart my rent for the year", "plot these lab readings", "how are my marks
// spread out?": one state — typed columns, rows of cells, where the numbers
// came from — and the table, bar, line, area, scatter, pie, histogram and
// heatmap are VIEWS of it. Editing a cell, adding a row, sorting, binning and
// binding a column to an axis are operations computed here, kept in the
// history and undoable.
//
// HONEST NUMBERS. A cell nobody filled is empty (null) — never 0, never
// guessed. A number cell holds a finite number or nothing; a date cell a real
// calendar day or nothing. Where the numbers came from is part of the state
// (`basis`): the person's own ('given' — only the person can say so),
// material they attached ('source'), or example numbers ('illustrative'),
// which are called example numbers wherever they are shown or described.
//
// What is computed, never asserted: which views can draw and why the others
// cannot; the axes (a bar's axis always includes zero, so a negative value
// hangs BELOW the baseline instead of being drawn as a short positive bar);
// pie shares; histogram bins; heatmap colours; and summary statistics that
// skip empty cells and say how many they skipped.
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
  isoDay,
  nextId,
  norm,
  op,
  readDay,
  registerDisplay,
  todayDay,
  type Args,
  type By,
  type DisplayHead,
} from './display-base';
import { niceTicks } from '@/lib/model/units';
import { MISSING_TOKENS, parseCSV } from '@/lib/science/table';

export type DataView = 'table' | 'bar' | 'line' | 'area' | 'scatter' | 'pie' | 'histogram' | 'heatmap';
export type ColumnType = 'number' | 'text' | 'category' | 'date';
/** where the numbers came from: the person, material they attached, or examples */
export type Basis = 'given' | 'source' | 'illustrative';
export type Cell = string | number | null;

export interface DataColumn {
  id: string;
  name: string;
  type: ColumnType;
  /** what a number column is measured in, as written: "$", "kg", "%" */
  unit?: string;
  by: By;
}

export interface DataRow {
  /** one per column, in column order; null is an empty cell */
  cells: Cell[];
  by: By;
}

export interface DataSort {
  col: string;
  dir: 'asc' | 'desc';
}

export interface DataState extends DisplayHead {
  view: DataView;
  columns: DataColumn[];
  rows: DataRow[];
  basis: Basis;
  /** the column on the x axis (or a heatmap's columns) */
  x?: string;
  /** the series drawn against it; a heatmap reads [row labels, value] */
  y?: string[];
  /** a histogram's bin count; absent, Sturges' rule */
  bins?: number;
  /** the order rows are SHOWN in — the stored order never changes */
  sort?: DataSort;
}

export const DATA_LIMITS = { columns: 12, rows: 200, name: 40, unit: 12, text: 80, title: 80, series: 4, minBins: 2, maxBins: 40 } as const;
export const DATA_VIEWS: readonly DataView[] = ['table', 'bar', 'line', 'area', 'scatter', 'pie', 'histogram', 'heatmap'];
const TYPES: readonly ColumnType[] = ['number', 'text', 'category', 'date'];
const BASES: readonly Basis[] = ['given', 'source', 'illustrative'];

export const VIEW_NAME: Record<DataView, string> = {
  table: 'table',
  bar: 'bar chart',
  line: 'line chart',
  area: 'area chart',
  scatter: 'scatter plot',
  pie: 'pie chart',
  histogram: 'histogram',
  heatmap: 'heatmap',
};

export const BASIS_SAID: Record<Basis, string> = {
  given: 'the person’s own numbers',
  source: 'numbers from material the person attached',
  illustrative: 'ILLUSTRATIVE numbers — examples, not real data',
};

// ── numbers and cells ────────────────────────────────────────────────

/** Float noise off: twelve significant figures, and no negative zero. */
const clean = (v: number): number => {
  const r = Number(v.toPrecision(12));
  return r === 0 ? 0 : r;
};
/** What a number is stored as: ten significant figures, so it survives a save unchanged. */
const keep = (v: number): number => {
  const r = Number(v.toPrecision(10));
  return r === 0 ? 0 : r;
};

const CURRENCY = '$£€¥₹';
const DIGITS = /^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:e[+-]?\d+)?$|^\.\d+(?:e[+-]?\d+)?$/i;

/**
 * A number as people write one: "1200", "1,200", "$1,200.50", "-3", "−3",
 * "(45)" in accounts, "12%". Thousands must be grouped properly — "1,2,3" is
 * not a number. Null for anything else: nothing is coerced into a number.
 */
export function readNumber(v: unknown): number | null {
  let n: number;
  if (typeof v === 'number') n = v;
  else if (typeof v === 'string') {
    let t = v.trim().replace(/−/g, '-');
    let sign = 1;
    const paren = /^\((.+)\)$/.exec(t);
    if (paren) {
      sign = -1;
      t = paren[1].trim();
    }
    const signed = () => {
      if (sign === 1 && /^[+-]/.test(t)) {
        if (t[0] === '-') sign = -1;
        t = t.slice(1).trim();
      }
    };
    signed();
    if (t && CURRENCY.includes(t[0])) t = t.slice(1).trim();
    signed();
    if (t.endsWith('%')) t = t.slice(0, -1).trim();
    if (!DIGITS.test(t)) return null;
    n = sign * Number(t.replace(/,/g, ''));
  } else return null;
  if (!Number.isFinite(n) || Math.abs(n) > 1e12) return null;
  return keep(n);
}

/** A number as a person reads it — no float noise, thousands grouped — the same on every machine. */
export function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const a = Math.abs(n);
  if (a < 1e-9) return '0';
  let body: string;
  if (a >= 1) {
    const [int, frac] = a.toFixed(2).split('.');
    const f = frac.replace(/0+$/, '');
    body = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (f ? `.${f}` : '');
  } else body = String(Number(a.toPrecision(4)));
  return `${n < 0 ? '-' : ''}${body}`;
}

const isMissing = (raw: string) => MISSING_TOKENS.includes(raw.trim().toLowerCase());

function cleanCell(v: unknown, type: ColumnType): Cell {
  if (v === null || v === undefined) return null;
  if (type === 'number') return readNumber(v);
  if (type === 'date') return isoDay(v);
  return cleanText(v, DATA_LIMITS.text) || null;
}

/** A value a person typed, read for a column: '' empties the cell. */
function parseFor(c: DataColumn, v: string | number | undefined): { value: Cell } | { why: string } {
  if (v === undefined || (typeof v === 'string' && !v.trim())) return { value: null };
  if (c.type === 'number') {
    const n = readNumber(v);
    return n === null ? { why: `“${cleanText(v, 40)}” is not a number, and ${c.name} holds numbers.` } : { value: n };
  }
  if (c.type === 'date') {
    const d = isoDay(v);
    return d ? { value: d } : { why: `“${cleanText(v, 40)}” is not a calendar day (YYYY-MM-DD), and ${c.name} holds dates.` };
  }
  return { value: cleanText(v, DATA_LIMITS.text) || null };
}

const labelOf = (v: Cell): string => (v === null ? '—' : typeof v === 'number' ? fmtNum(v) : v);

// ── canonical state ──────────────────────────────────────────────────

export function sanitizeData(raw: unknown): DataState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.columns)) return null;
  const rawIds = r.columns.map((x) => cleanId((x as Record<string, unknown> | null)?.id)).filter((x): x is string => !!x);
  const columns: DataColumn[] = [];
  /** where each kept column's cells sit in the rows as written */
  const src: number[] = [];
  const ids = new Set<string>();
  r.columns.forEach((x, i) => {
    if (columns.length >= DATA_LIMITS.columns || !x || typeof x !== 'object') return;
    const o = x as Record<string, unknown>;
    let id = cleanId(o.id);
    if (!id || ids.has(id)) id = nextId('c', [...ids, ...rawIds]);
    ids.add(id);
    const type = TYPES.includes(o.type as ColumnType) ? (o.type as ColumnType) : 'text';
    const unit = type === 'number' ? cleanText(o.unit, DATA_LIMITS.unit) : '';
    columns.push({
      id,
      name: cleanText(o.name ?? o.label ?? o.title, DATA_LIMITS.name) || `Column ${columns.length + 1}`,
      type,
      ...(unit ? { unit } : {}),
      by: cleanBy(o.by),
    });
    src.push(i);
  });
  if (!columns.length) return null;

  const rows: DataRow[] = [];
  for (const x of Array.isArray(r.rows) ? r.rows : []) {
    if (rows.length >= DATA_LIMITS.rows) break;
    let get: (c: DataColumn, i: number) => unknown;
    let by: unknown;
    if (Array.isArray(x)) get = (_c, i) => x[src[i]];
    else if (x && typeof x === 'object') {
      const o = x as Record<string, unknown>;
      by = o.by;
      const cells = Array.isArray(o.cells) ? (o.cells as unknown[]) : null;
      // a row written as {cells: […]}, or keyed by column id or name: {Month: "Jan", Rent: 1200}
      get = cells ? (_c, i) => cells[src[i]] : (c) => (Object.prototype.hasOwnProperty.call(o, c.id) ? o[c.id] : o[c.name]);
    } else continue;
    rows.push({ cells: columns.map((c, i) => cleanCell(get(c, i), c.type)), by: cleanBy(by) });
  }

  const has = (id: unknown): id is string => typeof id === 'string' && columns.some((c) => c.id === id);
  const x = has(r.x) ? r.x : undefined;
  const rawY = Array.isArray(r.y) ? r.y : typeof r.y === 'string' ? r.y.split(',').map((v) => v.trim()) : [];
  const y = [...new Set(rawY.filter(has))].slice(0, DATA_LIMITS.series);
  const bins = typeof r.bins === 'number' && Number.isInteger(r.bins) && r.bins >= DATA_LIMITS.minBins && r.bins <= DATA_LIMITS.maxBins ? r.bins : undefined;
  const so = r.sort && typeof r.sort === 'object' ? (r.sort as Record<string, unknown>) : null;
  const sort: DataSort | undefined = so && has(so.col) ? { col: so.col, dir: so.dir === 'desc' ? 'desc' : 'asc' } : undefined;
  const base: DataState = {
    title: cleanText(r.title, DATA_LIMITS.title) || 'Data',
    view: 'table',
    columns,
    rows,
    // where the numbers came from is never assumed to be the person: unsaid, they are examples
    basis: BASES.includes(r.basis as Basis) ? (r.basis as Basis) : 'illustrative',
    ...(x ? { x } : {}),
    ...(y.length ? { y } : {}),
    ...(bins ? { bins } : {}),
    ...(sort ? { sort } : {}),
  };
  return { ...base, view: DATA_VIEWS.includes(r.view as DataView) ? (r.view as DataView) : defaultView(base) };
}

/** The view a table opens in when none was asked for: a time series as a line, labelled numbers as bars. */
function defaultView(s: DataState): DataView {
  const av = availability(s);
  if (s.columns.some((c) => c.type === 'date') && !av.line) return 'line';
  for (const v of ['bar', 'line', 'scatter', 'histogram'] as DataView[]) if (!av[v]) return v;
  return 'table';
}

// ── which columns a view draws ───────────────────────────────────────

export interface Bindings {
  /** labels (bar, pie, heatmap columns), the x axis (line, area, scatter), the values (histogram) */
  x: DataColumn | null;
  /** the series; a heatmap's row labels */
  y: DataColumn[];
  /** a heatmap's colour */
  value: DataColumn | null;
}

const isLabel = (c: DataColumn | null | undefined): c is DataColumn => !!c && (c.type === 'text' || c.type === 'category');
const isNum = (c: DataColumn | null | undefined): c is DataColumn => !!c && c.type === 'number';
const isAxis = (c: DataColumn | null | undefined): c is DataColumn => !!c && (c.type === 'number' || c.type === 'date');

/**
 * The columns a view draws: the ones bound to it where they suit it, the
 * view's defaults where they do not (or nothing is bound). A binding that
 * does not suit one view is kept for the views it does suit.
 */
export function bindingsFor(s: DataState, view: DataView): Bindings {
  const col = (id?: string) => (id ? (s.columns.find((c) => c.id === id) ?? null) : null);
  const nums = s.columns.filter(isNum);
  const labels = s.columns.filter(isLabel);
  const boundX = col(s.x);
  const boundY = (s.y ?? []).map((id) => col(id));
  switch (view) {
    case 'bar':
    case 'pie': {
      const x = isLabel(boundX) ? boundX : (labels[0] ?? null);
      let y = boundY.filter(isNum);
      if (!y.length) y = nums.slice(0, DATA_LIMITS.series);
      return { x, y: view === 'pie' ? y.slice(0, 1) : y, value: null };
    }
    case 'line':
    case 'area': {
      const x = isAxis(boundX) ? boundX : (s.columns.find((c) => c.type === 'date') ?? nums[0] ?? null);
      let y = boundY.filter((c): c is DataColumn => isNum(c) && c !== x);
      if (!y.length) y = nums.filter((c) => c !== x).slice(0, DATA_LIMITS.series);
      return { x, y, value: null };
    }
    case 'scatter': {
      const x = isNum(boundX) ? boundX : (nums[0] ?? null);
      let y = boundY.filter((c): c is DataColumn => isNum(c) && c !== x);
      if (!y.length) y = nums.filter((c) => c !== x).slice(0, 1);
      return { x, y, value: null };
    }
    case 'histogram': {
      const x = isNum(boundX) ? boundX : (boundY.find(isNum) ?? nums[0] ?? null);
      return { x, y: [], value: null };
    }
    case 'heatmap': {
      const x = isLabel(boundX) ? boundX : (labels[0] ?? null);
      const b0 = boundY[0];
      const rowLabels = isLabel(b0) && b0 !== x ? b0 : (labels.find((c) => c !== x) ?? null);
      const b1 = boundY[1];
      return { x, y: rowLabels ? [rowLabels] : [], value: isNum(b1) ? b1 : (nums[0] ?? null) };
    }
    default:
      return { x: null, y: [], value: null };
  }
}

const cellAt = (s: DataState, row: DataRow, c: DataColumn): Cell => row.cells[s.columns.indexOf(c)] ?? null;
const numAt = (s: DataState, row: DataRow, c: DataColumn): number | null => {
  const v = cellAt(s, row, c);
  return typeof v === 'number' ? v : null;
};

/** Null when the view can draw this table; otherwise why not, in a sentence. */
export function viewUnavailable(s: DataState, view: DataView): string | null {
  if (view === 'table') return null;
  const b = bindingsFor(s, view);
  switch (view) {
    case 'bar':
    case 'pie': {
      if (!b.x || !b.y.length) return `A ${VIEW_NAME[view]} needs a column of labels (text or category) and a column of numbers.`;
      if (!s.rows.some((r) => b.y.some((c) => numAt(s, r, c) !== null))) return `No row has a number in ${b.y.map((c) => c.name).join(' or ')} yet.`;
      if (view === 'pie') {
        const c = b.y[0];
        const neg = s.rows.findIndex((r) => (numAt(s, r, c) ?? 0) < 0);
        if (neg >= 0) return `A pie cannot show a negative value, and ${c.name} has ${fmtNum(numAt(s, s.rows[neg], c)!)} in row ${neg + 1}. A bar chart can.`;
        const total = s.rows.reduce((t, r) => t + (numAt(s, r, c) ?? 0), 0);
        if (!(total > 0)) return `The values in ${c.name} add up to 0, so there is nothing to share out.`;
      }
      return null;
    }
    case 'line':
    case 'area':
    case 'scatter': {
      if (!b.x || !b.y.length) {
        return view === 'scatter'
          ? 'A scatter plot needs two columns of numbers.'
          : `A ${VIEW_NAME[view]} needs an x column of numbers or dates and a column of numbers to draw against it.`;
      }
      if (!s.rows.some((r) => cellAt(s, r, b.x!) !== null && b.y.some((c) => numAt(s, r, c) !== null))) return `No row has both a ${b.x.name} and a value to draw yet.`;
      return null;
    }
    case 'histogram': {
      if (!b.x) return 'A histogram needs a column of numbers.';
      const n = s.rows.filter((r) => numAt(s, r, b.x!) !== null).length;
      return n >= 2 ? null : `A histogram needs at least two values, and ${b.x.name} has ${n ? 'one' : 'none'}.`;
    }
    case 'heatmap': {
      if (!b.x || !b.y.length || !b.value) return 'A heatmap needs two columns of labels (text or category) and a column of numbers.';
      if (!s.rows.some((r) => cellAt(s, r, b.x!) !== null && cellAt(s, r, b.y[0]) !== null && numAt(s, r, b.value!) !== null)) {
        return `No row has all of ${b.x.name}, ${b.y[0].name} and ${b.value.name} yet.`;
      }
      return null;
    }
  }
  return null;
}

/** Every view, with null where it can draw and the reason where it cannot. */
export function availability(s: DataState): Record<DataView, string | null> {
  return Object.fromEntries(DATA_VIEWS.map((v) => [v, viewUnavailable(s, v)])) as Record<DataView, string | null>;
}

/** The order rows are shown in: the stored order, or sorted (stable; empty cells last either way). */
export function displayOrder(s: DataState): number[] {
  const idx = s.rows.map((_, i) => i);
  const ci = s.sort ? s.columns.findIndex((c) => c.id === s.sort!.col) : -1;
  if (ci < 0) return idx;
  const sign = s.sort!.dir === 'desc' ? -1 : 1;
  const numeric = s.columns[ci].type === 'number';
  return idx.sort((a, b) => {
    const va = s.rows[a].cells[ci];
    const vb = s.rows[b].cells[ci];
    if (va === null || vb === null) return va === vb ? a - b : va === null ? 1 : -1;
    let d: number;
    if (numeric) d = (va as number) - (vb as number);
    else {
      const p = String(va).toLowerCase();
      const q = String(vb).toLowerCase();
      d = p < q ? -1 : p > q ? 1 : 0;
    }
    return d ? sign * Math.sign(d) : a - b;
  });
}

// ── scales and ticks ─────────────────────────────────────────────────

export interface Scale {
  lo: number;
  hi: number;
  step: number;
  ticks: number[];
}

/**
 * An axis over some values: round ends and round ticks (niceTicks chooses
 * the step), widened to cover every value. `zero` puts 0 inside it — always
 * for bars, whose length IS the value. `integer` keeps ticks whole (counts).
 */
export function linearScale(values: readonly number[], opts: { zero?: boolean; integer?: boolean; want?: number } = {}): Scale {
  const vs = values.filter(Number.isFinite);
  let lo = vs.length ? Math.min(...vs) : 0;
  let hi = vs.length ? Math.max(...vs) : 1;
  if (opts.zero) {
    lo = Math.min(lo, 0);
    hi = Math.max(hi, 0);
  }
  if (hi === lo) {
    if (lo === 0) hi = 1;
    else {
      const pad = Math.abs(lo) * 0.1;
      lo -= pad;
      hi += pad;
    }
  }
  const t = niceTicks(lo, hi, opts.want ?? 5);
  let step = t.length >= 2 ? t[1] - t[0] : hi - lo;
  if (opts.integer) step = Math.max(1, Math.round(step));
  step = clean(step);
  const nlo = clean(Math.floor(lo / step + 1e-9) * step);
  let nhi = clean(Math.ceil(hi / step - 1e-9) * step);
  if (nhi <= nlo) nhi = clean(nlo + step);
  const ticks: number[] = [];
  for (let i = 0; nlo + i * step <= nhi + step * 1e-9 && ticks.length < 60; i++) ticks.push(clean(nlo + i * step));
  return { lo: nlo, hi: nhi, step, ticks };
}

/** Where a value falls on a scale, 0 at its low end and 1 at its high end. */
export const scaleAt = (sc: Pick<Scale, 'lo' | 'hi'>, v: number): number => clean((v - sc.lo) / (sc.hi - sc.lo));

const DAY_MS = 86_400_000;
/** A calendar day as a count of days since 1970-01-01, for placing dates on an axis. */
export const dayNumber = (day: string): number => Math.round(Date.parse(`${day}T00:00:00Z`) / DAY_MS);
const dayOf = (n: number): string => new Date(n * DAY_MS).toISOString().slice(0, 10);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface DateTick {
  day: string;
  label: string;
}

/**
 * Ticks for a date axis: whole days, weeks (on Mondays), months (on the 1st)
 * or years (on 1 January) — the finest that gives about `want` of them.
 * Labels are written out here, never through a locale.
 */
export function dateTicks(lo: string, hi: string, want = 5): DateTick[] {
  let a = dayNumber(lo);
  let b = dayNumber(hi);
  if (b < a) [a, b] = [b, a];
  const span = b - a;
  const steps: ['day' | 'month' | 'year', number, number][] = [
    ['day', 1, 1], ['day', 2, 2], ['day', 7, 7], ['day', 14, 14],
    ['month', 1, 30.44], ['month', 2, 60.88], ['month', 3, 91.31], ['month', 6, 182.6],
    ['year', 1, 365.25], ['year', 2, 730.5], ['year', 5, 1826.25], ['year', 10, 3652.5], ['year', 25, 9131], ['year', 50, 18262], ['year', 100, 36525],
  ];
  const [unit, n] = steps.find((st) => span / st[2] <= want) ?? steps[steps.length - 1];
  const out: DateTick[] = [];
  const first = dayOf(a);
  if (unit === 'day') {
    // day 4 (1970-01-05) was a Monday: weeks start there
    const offset = n % 7 === 0 ? 4 : 0;
    for (let d = a + ((((offset - a) % n) + n) % n); d <= b && out.length < 24; d += n) {
      const iso = dayOf(d);
      out.push({ day: iso, label: `${Number(iso.slice(8, 10))} ${MON[Number(iso.slice(5, 7)) - 1]}` });
    }
  } else if (unit === 'month') {
    let m = Number(first.slice(0, 4)) * 12 + Number(first.slice(5, 7)) - 1 + (first.slice(8, 10) === '01' ? 0 : 1);
    m = Math.ceil(m / n) * n;
    for (; out.length < 24; m += n) {
      const yy = Math.floor(m / 12);
      const day = `${String(yy).padStart(4, '0')}-${String((m % 12) + 1).padStart(2, '0')}-01`;
      if (dayNumber(day) > b) break;
      out.push({ day, label: `${MON[m % 12]} ${yy}` });
    }
  } else {
    let yy = Number(first.slice(0, 4)) + (first.slice(5) === '01-01' ? 0 : 1);
    yy = Math.ceil(yy / n) * n;
    for (; out.length < 24; yy += n) {
      const day = `${String(yy).padStart(4, '0')}-01-01`;
      if (dayNumber(day) > b) break;
      out.push({ day, label: String(yy) });
    }
  }
  return out.length ? out : [{ day: first, label: `${Number(first.slice(8, 10))} ${MON[Number(first.slice(5, 7)) - 1]} ${first.slice(0, 4)}` }];
}

// ── bars ─────────────────────────────────────────────────────────────

export interface BarRect {
  /** the row (stored index) and which series */
  row: number;
  series: number;
  col: string;
  value: number;
  /** across the plot, 0..1 */
  x0: number;
  x1: number;
  /** up the plot, 0 at the bottom of the axis and 1 at its top: y0 below y1 always */
  y0: number;
  y1: number;
}

export interface BarLayout {
  groups: { row: number; label: string }[];
  series: { col: string; name: string }[];
  bars: BarRect[];
  scale: Scale;
  /** where zero sits, 0..1 up the plot: every bar starts here */
  baseline: number;
  /** cells with no number, drawn as no bar */
  missing: number;
}

/**
 * Grouped bars, one group per row in display order, one bar per series. A
 * bar runs from the zero baseline to its value: a negative value extends
 * BELOW the baseline (y0 is the value, y1 is zero), never as a positive bar.
 */
export function barLayout(s: DataState): BarLayout | null {
  if (viewUnavailable(s, 'bar')) return null;
  const b = bindingsFor(s, 'bar');
  const order = displayOrder(s);
  const values = order.flatMap((r) => b.y.map((c) => numAt(s, s.rows[r], c))).filter((v): v is number => v !== null);
  const scale = linearScale(values, { zero: true });
  const gw = 1 / order.length;
  const bw = (0.8 * gw) / b.y.length;
  const bars: BarRect[] = [];
  let missing = 0;
  order.forEach((r, g) => {
    b.y.forEach((c, j) => {
      const v = numAt(s, s.rows[r], c);
      if (v === null) {
        missing++;
        return;
      }
      const x0 = g * gw + 0.1 * gw + j * bw;
      bars.push({ row: r, series: j, col: c.id, value: v, x0: clean(x0), x1: clean(x0 + bw), y0: scaleAt(scale, Math.min(0, v)), y1: scaleAt(scale, Math.max(0, v)) });
    });
  });
  return {
    groups: order.map((r) => ({ row: r, label: labelOf(cellAt(s, s.rows[r], b.x!)) })),
    series: b.y.map((c) => ({ col: c.id, name: c.name })),
    bars,
    scale,
    baseline: scaleAt(scale, 0),
    missing,
  };
}

// ── pie ──────────────────────────────────────────────────────────────

export interface PieSlice {
  row: number;
  label: string;
  value: number;
  /** of the whole, 0..1; the shares add up to 1 */
  share: number;
  /** where the slice starts and ends, as fractions of a full turn */
  a0: number;
  a1: number;
}

export function pieLayout(s: DataState): { col: string; slices: PieSlice[]; total: number; missing: number } | null {
  if (viewUnavailable(s, 'pie')) return null;
  const b = bindingsFor(s, 'pie');
  const c = b.y[0];
  const items = displayOrder(s).map((r) => ({ r, v: numAt(s, s.rows[r], c) }));
  const present = items.filter((it): it is { r: number; v: number } => it.v !== null);
  const total = present.reduce((t, it) => t + it.v, 0);
  let acc = 0;
  const slices = present.map((it, k) => {
    const share = it.v / total;
    const a0 = acc;
    acc += share;
    return { row: it.r, label: labelOf(cellAt(s, s.rows[it.r], b.x!)), value: it.v, share: clean(share), a0: clean(a0), a1: k === present.length - 1 ? 1 : clean(acc) };
  });
  return { col: c.id, slices, total: keep(total), missing: items.length - present.length };
}

// ── histogram ────────────────────────────────────────────────────────

export interface Histogram {
  /** bin edges, low to high: bin i is [edges[i], edges[i+1]), the last bin closed */
  edges: number[];
  counts: number[];
  width: number;
  /** values counted */
  n: number;
  /** the edges are round numbers (false only when a requested bin count forced exact ones) */
  nice: boolean;
}

/** Sturges' rule: ⌈log₂ n⌉ + 1 bins. */
export const sturges = (n: number): number => Math.max(1, Math.ceil(Math.log2(Math.max(1, n)) + 1));

/** The smallest round width (1, 2 or 5 × 10ⁿ) at least as wide as x. */
export function niceCeil(x: number): number {
  if (!(x > 0)) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(x)));
  for (const f of [1, 2, 5]) if (f * mag >= x * (1 - 1e-12)) return clean(f * mag);
  return clean(10 * mag);
}

/**
 * Bins for some values. The count is Sturges' unless `bins` is given; the
 * width is the round number that gives about that many, and the edges are
 * multiples of it. A requested count is honoured exactly: when round edges
 * cannot give it, the range is split evenly instead (`nice` false). A value
 * on an inner edge belongs to the bin on its right; the maximum belongs to
 * the last bin.
 */
export function histogramBins(values: readonly number[], bins?: number): Histogram | null {
  const vs = values.filter(Number.isFinite);
  if (!vs.length) return null;
  const min = Math.min(...vs);
  const max = Math.max(...vs);
  let edges: number[];
  let width: number;
  let nice = true;
  const aligned = (w: number): number[] => {
    let lo = clean(Math.floor(min / w + 1e-9) * w);
    if (lo > min) lo = clean(lo - w);
    let m = Math.max(1, Math.ceil((max - lo) / w - 1e-9));
    if (clean(lo + m * w) < max) m++;
    return Array.from({ length: m + 1 }, (_, i) => clean(lo + i * w));
  };
  if (max === min) {
    width = niceCeil(Math.abs(min) / 10 || 1);
    edges = aligned(width);
  } else {
    width = niceCeil((max - min) / (bins ?? sturges(vs.length)));
    edges = aligned(width);
    if (bins !== undefined && edges.length - 1 !== bins) {
      nice = false;
      width = clean((max - min) / bins);
      edges = Array.from({ length: bins + 1 }, (_, i) => (i === bins ? max : clean(min + (i * (max - min)) / bins)));
    }
  }
  const m = edges.length - 1;
  const counts = new Array<number>(m).fill(0);
  for (const v of vs) {
    let bin = m - 1;
    for (let j = 1; j < m; j++) {
      if (v < edges[j]) {
        bin = j - 1;
        break;
      }
    }
    counts[bin]++;
  }
  return { edges, counts, width, n: vs.length, nice };
}

/** The histogram this table draws, with how many of its cells were empty. */
export function histogramOf(s: DataState): (Histogram & { col: string; missing: number }) | null {
  if (viewUnavailable(s, 'histogram')) return null;
  const c = bindingsFor(s, 'histogram').x!;
  const vals = s.rows.map((r) => numAt(s, r, c));
  const nums = vals.filter((v): v is number => v !== null);
  const h = histogramBins(nums, s.bins);
  return h ? { ...h, col: c.id, missing: vals.length - nums.length } : null;
}

export interface HistogramLayout extends Histogram {
  col: string;
  missing: number;
  /** one per bin: its edges, its count, and where it sits (0..1 across, 0..1 up) */
  bars: { lo: number; hi: number; count: number; x0: number; x1: number; y0: number; y1: number }[];
  /** the count axis: whole numbers, from zero */
  yScale: Scale;
}

export function histogramLayout(s: DataState): HistogramLayout | null {
  const h = histogramOf(s);
  if (!h) return null;
  const yScale = linearScale(h.counts, { zero: true, integer: true });
  const e0 = h.edges[0];
  const span = h.edges[h.edges.length - 1] - e0;
  const bars = h.counts.map((count, i) => ({
    lo: h.edges[i],
    hi: h.edges[i + 1],
    count,
    x0: clean((h.edges[i] - e0) / span),
    x1: clean((h.edges[i + 1] - e0) / span),
    y0: scaleAt(yScale, 0),
    y1: scaleAt(yScale, count),
  }));
  return { ...h, bars, yScale };
}

// ── points: line, area, scatter ──────────────────────────────────────

export interface XYPoint {
  row: number;
  x: number;
  y: number;
  xv: number | string;
  yv: number;
  /** a row with no value lies between this point and the one before: do not join them */
  gap: boolean;
}

export interface XYLayout {
  x: { col: string; name: string; type: ColumnType };
  series: { col: string; name: string; points: XYPoint[] }[];
  xScale: Scale | null;
  /** for a date axis */
  xDates: { lo: string; hi: string; ticks: (DateTick & { at: number })[] } | null;
  yScale: Scale;
  /** cells left out because they were empty */
  missing: number;
}

/**
 * Points for a line, area or scatter plot. A line and an area run in x
 * order, and break where a value is missing rather than bridging it; an
 * area's axis includes zero, since its height is measured from there.
 */
export function xyLayout(s: DataState, view: 'line' | 'area' | 'scatter'): XYLayout | null {
  if (viewUnavailable(s, view)) return null;
  const b = bindingsFor(s, view);
  const xc = b.x!;
  const dated = xc.type === 'date';
  const xnum = (v: Cell): number => (dated ? dayNumber(v as string) : (v as number));
  const withX = s.rows.map((r, i) => ({ i, xv: cellAt(s, r, xc) })).filter((o): o is { i: number; xv: string | number } => o.xv !== null);
  const order = view === 'scatter' ? withX : [...withX].sort((p, q) => xnum(p.xv) - xnum(q.xv) || p.i - q.i);
  const xs = order.map((o) => xnum(o.xv));
  let lo = Math.min(...xs);
  let hi = Math.max(...xs);
  let xScale: Scale | null = null;
  let xDates: XYLayout['xDates'] = null;
  if (dated) {
    if (hi === lo) {
      lo -= 1;
      hi += 1;
    }
    const [dl, dh] = [dayOf(lo), dayOf(hi)];
    xDates = { lo: dl, hi: dh, ticks: dateTicks(dl, dh).map((t) => ({ ...t, at: clean((dayNumber(t.day) - lo) / (hi - lo)) })) };
  } else {
    xScale = linearScale(xs);
    lo = xScale.lo;
    hi = xScale.hi;
  }
  const ys = order.flatMap((o) => b.y.map((c) => numAt(s, s.rows[o.i], c))).filter((v): v is number => v !== null);
  const yScale = linearScale(ys, { zero: view === 'area' });
  let points = 0;
  const series = b.y.map((c) => {
    const pts: XYPoint[] = [];
    let gap = false;
    for (const o of order) {
      const v = numAt(s, s.rows[o.i], c);
      if (v === null) {
        gap = true;
        continue;
      }
      pts.push({ row: o.i, x: clean((xnum(o.xv) - lo) / (hi - lo)), y: scaleAt(yScale, v), xv: o.xv, yv: v, gap: gap && pts.length > 0 && view !== 'scatter' });
      gap = false;
    }
    points += pts.length;
    return { col: c.id, name: c.name, points: pts };
  });
  return { x: { col: xc.id, name: xc.name, type: xc.type }, series, xScale, xDates, yScale, missing: s.rows.length * b.y.length - points };
}

// ── heatmap ──────────────────────────────────────────────────────────

export interface HeatScale {
  /** diverging when the values run both sides of zero: zero is the neutral middle */
  kind: 'sequential' | 'diverging';
  lo: number;
  hi: number;
}

export function heatScale(values: readonly number[]): HeatScale {
  const vs = values.filter(Number.isFinite);
  const lo = vs.length ? Math.min(...vs) : 0;
  const hi = vs.length ? Math.max(...vs) : 0;
  return { kind: lo < 0 && hi > 0 ? 'diverging' : 'sequential', lo, hi };
}

/** 0..1 along the colour ramp; on a diverging scale 0.5 is zero and the two sides share one magnitude. */
export function heatPosition(sc: HeatScale, v: number): number {
  if (sc.kind === 'diverging') {
    const m = Math.max(-sc.lo, sc.hi);
    return clean(Math.min(1, Math.max(0, 0.5 + v / (2 * m))));
  }
  return sc.hi === sc.lo ? 0.5 : clean(Math.min(1, Math.max(0, (v - sc.lo) / (sc.hi - sc.lo))));
}

const SEQUENTIAL = ['#eef2ff', '#1e3a8a'];
const DIVERGING = ['#b45309', '#f4f4f5', '#1d4ed8'];
function mix(a: string, b: string, t: number): string {
  const ch = (h: string, i: number) => parseInt(h.slice(1 + 2 * i, 3 + 2 * i), 16);
  return `#${[0, 1, 2].map((i) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t).toString(16).padStart(2, '0')).join('')}`;
}

/** A heatmap cell's colour: light to dark for one-signed values; amber below zero, blue above, pale at zero. */
export function heatColour(sc: HeatScale, v: number): string {
  const p = heatPosition(sc, v);
  if (sc.kind === 'diverging') return p < 0.5 ? mix(DIVERGING[0], DIVERGING[1], p / 0.5) : mix(DIVERGING[1], DIVERGING[2], (p - 0.5) / 0.5);
  return mix(SEQUENTIAL[0], SEQUENTIAL[1], p);
}

export interface HeatCell {
  x: number;
  y: number;
  value: number;
  /** rows that fell in this cell — more than one are summed, and said to be */
  count: number;
  position: number;
  colour: string;
}

export function heatmapLayout(s: DataState): { xs: string[]; ys: string[]; cells: HeatCell[]; scale: HeatScale; missing: number; summed: number } | null {
  if (viewUnavailable(s, 'heatmap')) return null;
  const b = bindingsFor(s, 'heatmap');
  const xs: string[] = [];
  const ys: string[] = [];
  const acc = new Map<string, { x: number; y: number; value: number; count: number }>();
  let missing = 0;
  for (const r of displayOrder(s)) {
    const row = s.rows[r];
    const xv = cellAt(s, row, b.x!);
    const yv = cellAt(s, row, b.y[0]);
    const v = numAt(s, row, b.value!);
    if (xv === null || yv === null || v === null) {
      missing++;
      continue;
    }
    const xl = labelOf(xv);
    const yl = labelOf(yv);
    if (!xs.includes(xl)) xs.push(xl);
    if (!ys.includes(yl)) ys.push(yl);
    const key = `${xs.indexOf(xl)}|${ys.indexOf(yl)}`;
    const cell = acc.get(key) ?? { x: xs.indexOf(xl), y: ys.indexOf(yl), value: 0, count: 0 };
    cell.value = keep(cell.value + v);
    cell.count++;
    acc.set(key, cell);
  }
  const list = [...acc.values()];
  const scale = heatScale(list.map((c) => c.value));
  return {
    xs,
    ys,
    cells: list.map((c) => ({ ...c, position: heatPosition(scale, c.value), colour: heatColour(scale, c.value) })),
    scale,
    missing,
    summed: list.filter((c) => c.count > 1).length,
  };
}

// ── summary statistics ───────────────────────────────────────────────

export interface Stats {
  /** values counted */
  n: number;
  /** empty cells skipped */
  missing: number;
  min: number | null;
  max: number | null;
  mean: number | null;
  median: number | null;
  total: number | null;
}

/** Statistics of some cells: empty ones are skipped and counted, never read as zero. */
export function summarize(values: readonly Cell[]): Stats {
  const nums = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  const missing = values.length - nums.length;
  if (!nums.length) return { n: 0, missing, min: null, max: null, mean: null, median: null, total: null };
  const sorted = [...nums].sort((a, b) => a - b);
  const total = nums.reduce((a, b) => a + b, 0);
  const mid = sorted.length >> 1;
  return {
    n: nums.length,
    missing,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: keep(total / nums.length),
    median: keep(sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2),
    total: keep(total),
  };
}

/** A number column's statistics; null for a column that does not hold numbers. */
export function columnStats(s: DataState, col: string): (Stats & { col: string }) | null {
  const c = s.columns.find((x) => x.id === col);
  if (!isNum(c)) return null;
  return { col, ...summarize(s.rows.map((r) => cellAt(s, r, c))) };
}

// ── from a CSV ───────────────────────────────────────────────────────

/** What each written value is, for a column's type to be read from all of them. */
function inferType(values: string[]): { type: ColumnType; unit?: string } {
  const present = values.filter((v) => !isMissing(v)).map((v) => v.trim());
  if (!present.length) return { type: 'text' };
  if (present.every((v) => readNumber(v) !== null)) {
    // a unit only where every value writes the same one: "$1,200", "$950" → $
    const sym = present.map((v) => (/^[+\-−(]?\s*([$£€¥₹])/.exec(v) ?? [])[1] ?? '');
    const pct = present.every((v) => /%\)?$/.test(v));
    const unit = pct ? '%' : sym[0] && sym.every((x) => x === sym[0]) ? sym[0] : undefined;
    return { type: 'number', ...(unit ? { unit } : {}) };
  }
  if (present.every((v) => isoDay(v) !== null)) return { type: 'date' };
  const distinct = new Set(present.map((v) => v.toLowerCase())).size;
  // few distinct strings, repeated: a category ("North", "South", "North", "East")
  if (present.length >= 2 && distinct < present.length && distinct <= 12) return { type: 'category' };
  return { type: 'text' };
}

/**
 * A table from CSV text: the first row names the columns; each column's
 * type is read from every value in it — numbers (commas, currency, %, and
 * accounting brackets read), ISO calendar days, a few repeated labels
 * (category), or text. One value that is none of those makes the column
 * text rather than being dropped. Missing tokens ('', 'NA', 'n/a', '-'…) are
 * empty cells. Past 12 columns and 200 rows the rest is left out — see
 * csvOverflow to say how much.
 */
export function dataFromCSV(text: string, title: string, opts: { basis?: Basis; by?: By } = {}): DataState | null {
  const grid = parseCSV(text).filter((row) => !(row.length === 1 && row[0].trim() === ''));
  if (!grid.length) return null;
  const header = grid[0].slice(0, DATA_LIMITS.columns);
  if (!header.length) return null;
  const body = grid.slice(1, 1 + DATA_LIMITS.rows);
  const by: By = opts.by === 'socria' ? 'socria' : 'person';
  const columns = header.map((h, i) => {
    const { type, unit } = inferType(body.map((r) => r[i] ?? ''));
    return { id: `c${i + 1}`, name: cleanText(h, DATA_LIMITS.name) || `Column ${i + 1}`, type, ...(unit ? { unit } : {}), by };
  });
  const rows = body.map((r) => ({ cells: columns.map((c, i) => (isMissing(r[i] ?? '') ? null : cleanCell((r[i] ?? '').trim(), c.type))), by }));
  return sanitizeData({ title: cleanText(title, DATA_LIMITS.title) || 'Data', columns, rows, basis: opts.basis ?? 'source' });
}

/** How much of a CSV a table can hold: rows and columns written, and how many of each are kept. */
export function csvOverflow(text: string): { rows: number; columns: number; keptRows: number; keptColumns: number } {
  const grid = parseCSV(text).filter((row) => !(row.length === 1 && row[0].trim() === ''));
  const rows = Math.max(0, grid.length - 1);
  const columns = grid.reduce((m, r) => Math.max(m, r.length), 0);
  return { rows, columns, keptRows: Math.min(rows, DATA_LIMITS.rows), keptColumns: Math.min(columns, DATA_LIMITS.columns) };
}

// ── operations ───────────────────────────────────────────────────────

const views: ViewDecl<DataState>[] = [
  { id: 'table', label: 'Table', shows: 'every value as it was entered, with empty cells left empty', primary: true, interactions: ['edit a cell', 'add a row', 'sort by a column'] },
  { id: 'bar', label: 'Bar chart', shows: 'values side by side, measured from zero', interactions: ['choose the columns drawn'], unavailable: (s) => viewUnavailable(s, 'bar') },
  { id: 'line', label: 'Line chart', shows: 'how values change along an axis of numbers or dates', interactions: ['choose the columns drawn'], unavailable: (s) => viewUnavailable(s, 'line') },
  { id: 'area', label: 'Area chart', shows: 'how values change, filled down to zero', interactions: ['choose the columns drawn'], unavailable: (s) => viewUnavailable(s, 'area') },
  { id: 'scatter', label: 'Scatter plot', shows: 'how one number goes with another, row by row', interactions: ['choose the columns drawn'], unavailable: (s) => viewUnavailable(s, 'scatter') },
  { id: 'pie', label: 'Pie chart', shows: 'each value as a share of the whole', interactions: ['choose the column shared out'], unavailable: (s) => viewUnavailable(s, 'pie') },
  { id: 'histogram', label: 'Histogram', shows: 'how one column’s values are spread out', interactions: ['change the number of bins'], unavailable: (s) => viewUnavailable(s, 'histogram') },
  { id: 'heatmap', label: 'Heatmap', shows: 'a number for each pair of two labels, as colour', interactions: ['choose the columns drawn'], unavailable: (s) => viewUnavailable(s, 'heatmap') },
];

const withState = (s: DataState, patch: Partial<DataState>): DataState => sanitizeData({ ...s, ...patch }) ?? s;
const colOf = (s: DataState, id: unknown) => s.columns.find((c) => c.id === id);
const rowIndex = (s: DataState, v: unknown): number | null => {
  const i = typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : NaN;
  return Number.isInteger(i) && i >= 0 && i < s.rows.length ? i : null;
};
const nameTaken = (s: DataState, name: string, except?: string) => s.columns.some((c) => c.id !== except && c.name.toLowerCase() === name.toLowerCase());
const splitValues = (v: unknown): string[] => (typeof v === 'string' ? v.split('|').map((x) => x.trim()) : typeof v === 'number' ? [String(v)] : []);

/** The first of some columns that does not hold numbers, said as a refusal. */
function notNumbers(ys: DataColumn[], view: DataView): string | null {
  const bad = ys.find((c) => c.type !== 'number');
  return bad ? `${bad.name} does not hold numbers, and a ${VIEW_NAME[view]} draws numbers.` : null;
}

/** Whether the columns bound suit the view on show. */
function bindRefused(s: DataState, x: DataColumn | null, ys: DataColumn[]): string | null {
  const view = s.view;
  if (view === 'table') return null;
  const need = (ok: boolean, why: string) => (ok ? null : why);
  switch (view) {
    case 'bar':
    case 'pie':
      return (
        (x ? need(isLabel(x), `${x.name} does not hold labels: a ${VIEW_NAME[view]}’s groups come from a text or category column.`) : null) ??
        notNumbers(ys, view)
      );
    case 'line':
    case 'area':
    case 'scatter':
      return (
        (x ? need(view === 'scatter' ? isNum(x) : isAxis(x), `${x.name} cannot be the x axis of a ${VIEW_NAME[view]}: it needs ${view === 'scatter' ? 'numbers' : 'numbers or dates'}.`) : null) ??
        notNumbers(ys, view)
      );
    case 'histogram':
      return x ? need(isNum(x), `${x.name} does not hold numbers, and a histogram counts numbers.`) : null;
    case 'heatmap':
      return (
        (x ? need(isLabel(x), `${x.name} does not hold labels: a heatmap’s columns come from a text or category column.`) : null) ??
        (ys[0] ? need(isLabel(ys[0]), `${ys[0].name} does not hold labels: a heatmap’s rows come from a text or category column.`) : null) ??
        (ys[1] ? need(isNum(ys[1]), `${ys[1].name} does not hold numbers, and a heatmap colours numbers.`) : null)
      );
  }
  return null;
}

export const DATA_OPS = {
  ...headOps<DataState>(views, sanitizeData),
  cell: op<DataState>(
    'Set a cell',
    (s, a, ctx) => {
      const r = rowIndex(s, a.row);
      if (r === null) return 'There is no such row in the table.';
      const c = colOf(s, a.col);
      if (!c) return 'There is no such column in the table.';
      const p = parseFor(c, a.value);
      if ('why' in p) return p.why;
      return guardOwn(s.rows[r], ctx, 'That row') ?? guardBy(a, ctx);
    },
    (s, a) => {
      const r = rowIndex(s, a.row)!;
      const ci = s.columns.findIndex((c) => c.id === a.col);
      const p = parseFor(s.columns[ci], a.value) as { value: Cell };
      return withState(s, {
        // a row the person edits is theirs from then on: Socria will not change it back
        rows: s.rows.map((row, i) => (i === r ? { cells: row.cells.map((v, j) => (j === ci ? p.value : v)), by: a.by === 'person' ? 'person' : row.by } : row)),
      });
    },
    (a) => (a.value === '' || a.value === undefined ? `row ${Number(a.row) + 1}: cell emptied` : `row ${Number(a.row) + 1}: set to ${cleanText(a.value, 40)}`)
  ),
  addRow: op<DataState>(
    'Add a row',
    (s, a, ctx) => {
      if (s.rows.length >= DATA_LIMITS.rows) return `A table holds ${DATA_LIMITS.rows} rows at most.`;
      const vals = splitValues(a.values);
      if (vals.length !== s.columns.length) return `This table has ${s.columns.length} column${s.columns.length === 1 ? '' : 's'}: give one value for each, separated by | (leave one empty to leave it blank).`;
      if (vals.every((v) => !v)) return 'Give at least one value.';
      for (let i = 0; i < vals.length; i++) {
        const p = parseFor(s.columns[i], vals[i]);
        if ('why' in p) return p.why;
      }
      return guardBy(a, ctx);
    },
    (s, a) => {
      const vals = splitValues(a.values);
      const cells = s.columns.map((c, i) => (parseFor(c, vals[i]) as { value: Cell }).value);
      return withState(s, { rows: [...s.rows, { cells, by: cleanBy(a.by) }] });
    },
    (a) => `added a row: ${cleanText(String(a.values ?? '').replace(/\|/g, ', '), 80)}`
  ),
  removeRow: op<DataState>(
    'Remove a row',
    (s, a, ctx) => {
      const r = rowIndex(s, a.row);
      return r === null ? 'There is no such row in the table.' : guardOwn(s.rows[r], ctx, 'That row');
    },
    (s, a) => withState(s, { rows: s.rows.filter((_, i) => i !== rowIndex(s, a.row)) }),
    (a) => `removed row ${Number(a.row) + 1}`
  ),
  addColumn: op<DataState>(
    'Add a column',
    (s, a, ctx) => {
      const name = cleanText(a.name, DATA_LIMITS.name);
      if (!name) return 'Name the column.';
      if (s.columns.length >= DATA_LIMITS.columns) return `A table holds ${DATA_LIMITS.columns} columns at most.`;
      if (!TYPES.includes(a.type as ColumnType)) return 'A column holds numbers, text, categories or dates.';
      if (nameTaken(s, name)) return `There is a column called ${name} already.`;
      return guardBy(a, ctx);
    },
    (s, a) => {
      const type = a.type as ColumnType;
      const unit = type === 'number' ? cleanText(a.unit, DATA_LIMITS.unit) : '';
      const col: DataColumn = { id: nextId('c', s.columns.map((c) => c.id)), name: cleanText(a.name, DATA_LIMITS.name), type, ...(unit ? { unit } : {}), by: cleanBy(a.by) };
      return withState(s, { columns: [...s.columns, col], rows: s.rows.map((r) => ({ ...r, cells: [...r.cells, null] })) });
    },
    (a) => `added a ${String(a.type)} column “${cleanText(a.name, DATA_LIMITS.name)}”`
  ),
  renameColumn: op<DataState>(
    'Rename a column',
    (s, a, ctx) => {
      const c = colOf(s, a.col);
      if (!c) return 'There is no such column in the table.';
      const name = cleanText(a.name, DATA_LIMITS.name);
      if (!name) return 'Say what to call it.';
      if (nameTaken(s, name, c.id)) return `There is a column called ${name} already.`;
      return guardOwn(c, ctx, 'That column');
    },
    (s, a) => withState(s, { columns: s.columns.map((c) => (c.id === a.col ? { ...c, name: cleanText(a.name, DATA_LIMITS.name) } : c)) }),
    (a) => `column renamed “${cleanText(a.name, DATA_LIMITS.name)}”`
  ),
  removeColumn: op<DataState>(
    'Remove a column',
    (s, a, ctx) => {
      const ci = s.columns.findIndex((c) => c.id === a.col);
      if (ci < 0) return 'There is no such column in the table.';
      if (s.columns.length === 1) return 'A table needs at least one column.';
      const own = guardOwn(s.columns[ci], ctx, 'That column');
      if (own) return own;
      if (ctx?.by === 'socria' && s.rows.some((r) => r.by === 'person' && r.cells[ci] !== null)) {
        return 'That column holds values you entered — Socria does not delete what you wrote. It can suggest it for you to do.';
      }
      return null;
    },
    (s, a) => {
      const ci = s.columns.findIndex((c) => c.id === a.col);
      return withState(s, { columns: s.columns.filter((_, i) => i !== ci), rows: s.rows.map((r) => ({ ...r, cells: r.cells.filter((_, i) => i !== ci) })) });
    },
    (a) => `removed column ${String(a.col)}`
  ),
  bind: op<DataState>(
    'Choose the columns drawn',
    (s, a) => {
      if (a.x === undefined && a.y === undefined) return 'Say which column goes on which axis.';
      const x = a.x === undefined || a.x === '' ? null : colOf(s, a.x);
      if (a.x !== undefined && a.x !== '' && !x) return 'There is no such column in the table.';
      const ids = a.y === undefined || a.y === '' ? [] : String(a.y).split(',').map((v) => v.trim());
      if (ids.length > DATA_LIMITS.series) return `A chart draws ${DATA_LIMITS.series} series at most.`;
      if (new Set(ids).size !== ids.length) return 'A column is named twice.';
      const ys = ids.map((id) => colOf(s, id));
      if (ys.some((c) => !c)) return 'There is no such column in the table.';
      if (x && ys.includes(x)) return `${x.name} cannot be drawn against itself.`;
      return bindRefused(s, x ?? null, ys as DataColumn[]);
    },
    (s, a) => {
      const next: Partial<DataState> = {};
      if (a.x !== undefined) next.x = a.x === '' ? undefined : String(a.x);
      if (a.y !== undefined) next.y = a.y === '' ? undefined : String(a.y).split(',').map((v) => v.trim());
      return withState(s, next);
    },
    (a) => [a.x !== undefined ? (a.x === '' ? 'x axis chosen automatically' : `x: ${a.x}`) : '', a.y !== undefined ? (a.y === '' ? 'series chosen automatically' : `drawn: ${a.y}`) : ''].filter(Boolean).join('; ')
  ),
  bins: op<DataState>(
    'Number of bins',
    (s, a) => {
      if (a.n === '' || a.n === undefined) return s.bins ? null : 'The bins are already chosen automatically.';
      const n = Number(a.n);
      return Number.isInteger(n) && n >= DATA_LIMITS.minBins && n <= DATA_LIMITS.maxBins ? null : `A histogram has between ${DATA_LIMITS.minBins} and ${DATA_LIMITS.maxBins} bins.`;
    },
    (s, a) => withState(s, { bins: a.n === '' || a.n === undefined ? undefined : Number(a.n) }),
    (a) => (a.n === '' || a.n === undefined ? 'bins chosen automatically (Sturges’ rule)' : `${Number(a.n)} bins`)
  ),
  sort: op<DataState>(
    'Sort',
    (s, a) => {
      if (a.col === '') return s.sort ? null : 'It is not sorted.';
      if (!colOf(s, a.col)) return 'There is no such column in the table.';
      return a.dir === undefined || a.dir === 'asc' || a.dir === 'desc' ? null : 'Sort ascending or descending.';
    },
    (s, a) => withState(s, { sort: a.col === '' ? undefined : { col: String(a.col), dir: a.dir === 'desc' ? 'desc' : 'asc' } }),
    (a) => (a.col === '' ? 'shown in the order entered' : `sorted by ${String(a.col)}, ${a.dir === 'desc' ? 'descending' : 'ascending'}`)
  ),
  basis: op<DataState>(
    'Where the numbers came from',
    (s, a, ctx) => {
      if (!BASES.includes(a.basis as Basis)) return 'Numbers are the person’s own (given), from material they attached (source), or examples (illustrative).';
      if (ctx?.by === 'socria' && a.basis === 'given') return 'Only you can say these numbers are your own.';
      if (ctx?.by === 'socria' && s.basis === 'given') return 'You said these numbers are your own — Socria does not relabel them.';
      return null;
    },
    (s, a) => withState(s, { basis: a.basis as Basis }),
    (a) => `marked as ${a.basis === 'given' ? 'your own numbers' : a.basis === 'source' ? 'numbers from your material' : 'example numbers'}`
  ),
};

// ── words → an operation ─────────────────────────────────────────────

const VIEW_WORD: [RegExp, DataView][] = [
  [/^(?:bar|bars|column chart)$/, 'bar'],
  [/^(?:line|time series)$/, 'line'],
  [/^area$/, 'area'],
  [/^scatter ?plot$|^scatter$/, 'scatter'],
  [/^pie$/, 'pie'],
  [/^histogram$/, 'histogram'],
  [/^heat ?map$/, 'heatmap'],
  [/^(?:table|spreadsheet)$/, 'table'],
];
// The view's name must END the message (a trailing "instead", "please", "of this" aside) —
// "show me the table of contents" is not a request for the table view.
const VIEW_TAIL =
  /(?:^|\s)(?:an?\s+|the\s+)?(bars|bar|column chart|line|time series|area|scatter ?plot|scatter|pie|histogram|heat ?map|table|spreadsheet)(?:\s+(?:chart|graph|plot|view))?(?:\s+(?:of|for)\s+(?:it|this|that|these|them|the data|my data|the numbers))?(?:\s+(?:instead|please|again|now))*$/;
const VIEW_VERB = /\b(show|view|see|display|make|turn|switch|change|set|draw|plot|put|chart|graph|give me|use|try|go|as|into|back to)\b/;

function readDataView(text: string): DataView | null {
  const t = text.toLowerCase().replace(/[.!?]+$/, '').replace(/[’']/g, '').replace(/\s+/g, ' ').trim();
  if (t.length > 80) return null;
  const m = VIEW_TAIL.exec(t);
  if (!m) return null;
  const head = t.slice(0, m.index).replace(/[,]/g, ' ').trim();
  // bare ("pie chart", "a histogram") or asked for ("make it a bar chart", "show the table")
  if (head && !/^(please|ok|okay|now|then|actually|instead|and)$/.test(head) && !VIEW_VERB.test(head)) return null;
  for (const [re, v] of VIEW_WORD) if (re.test(m[1])) return v;
  return null;
}

const DESC = /^(descending|desc|largest first|highest first|biggest first|most first|high to low|highest to lowest|largest to smallest|biggest to smallest|newest first|latest first|z to a)$/;
const DIR_TAIL =
  /[\s,]+(descending|desc|largest first|highest first|biggest first|most first|high to low|highest to lowest|largest to smallest|biggest to smallest|newest first|latest first|z to a|ascending|asc|smallest first|lowest first|least first|low to high|lowest to highest|smallest to largest|oldest first|earliest first|a to z)$/i;

/** A column the words name, by its name — null when none is named or two are named alike. */
function findColumn(s: DataState, words: string, among = s.columns): DataColumn | null {
  const c = findByLabel(among, (x) => x.name, words);
  if (!c) return null;
  return among.filter((x) => norm(x.name) === norm(c.name)).length > 1 ? null : c;
}

/** What is left of some words once a label's words are taken out. */
function without(words: string, label: string): string {
  const w = ` ${norm(words)} `;
  const l = norm(label);
  if (l && w.includes(` ${l} `)) return w.replace(` ${l} `, ' ').trim();
  const drop = new Set(l.split(' '));
  return w.trim().split(' ').filter((x) => !drop.has(x)).join(' ');
}

/** A value from words, for a column: a number (a trailing currency word allowed), a day (words read against today), or text. */
function valueFor(c: DataColumn, raw: string, today: string): string | number | null {
  const v = raw.trim().replace(/^[“"']|[”"']$/g, '').trim();
  if (c.type !== 'text' && c.type !== 'category' && /^(empty|nothing|blank|none|n\/a)$/i.test(v)) return '';
  if (c.type === 'number') return readNumber(v.replace(/\s+(dollars?|euros?|pounds?|usd|eur|gbp|bucks)$/i, ''));
  if (c.type === 'date') return isoDay(v) ?? readDay(v, today);
  return cleanText(v, DATA_LIMITS.text) || null;
}

/**
 * An operation the words plainly ask for. Conservative by design: this runs
 * on every message while a chart is in the workspace, so it answers only
 * when the words name a row or column of THIS table, or clearly ask for a
 * view, a sort, a bin count or a new row — otherwise the message is left to
 * the conversation.
 */
export function readDataOp(text: string, s: DataState, today: string): { op: string; args: Args } | null {
  const t = text.trim().replace(/\s+/g, ' ');
  if (!t || t.length > 200) return null;
  // a question is the conversation's
  if (/^(what|why|when|where|who|which|whose|how(?! about)|is|are|was|were|does|do|did|should|shall|has|have|had)\b/i.test(t) || /^(can|could|would|will)\b(?! you\b)/i.test(t)) return null;
  const body = t.replace(/^(?:(?:can|could|would|will) you\s+)/i, '').replace(/\?$/, '');

  // "use 10 bins", "12 bins please", "set the bins to 8"
  const bn =
    /^(?:please\s+)?(?:use|try|make it|show|with|change (?:it )?to|go (?:with|to))?\s*(\d{1,3})\s+bins?(?:\s+(?:instead|please))*[.!]?$/i.exec(body) ??
    /^(?:please\s+)?set\s+(?:the\s+)?(?:number of\s+)?bins\s+(?:to\s+)?(\d{1,3})[.!]?$/i.exec(body);
  if (bn) return { op: 'bins', args: { n: Number(bn[1]) } };

  // "sort by amount", "sort by amount descending"
  const so = /^(?:please\s+)?(?:sort|order)\s+(?:it\s+|them\s+|the\s+(?:table|rows|data)\s+)?by\s+(.+?)[.!]?$/i.exec(body);
  if (so) {
    let target = so[1];
    let dir: 'asc' | 'desc' = 'asc';
    const dm = DIR_TAIL.exec(target);
    if (dm) {
      dir = DESC.test(dm[1].toLowerCase()) ? 'desc' : 'asc';
      target = target.slice(0, dm.index);
    }
    const col = findColumn(s, target);
    return col ? { op: 'sort', args: { col: col.id, dir } } : null;
  }

  // "add a row: April, 1250, 300"
  const ar = /^(?:please\s+)?add\s+(?:a\s+|another\s+|one\s+more\s+|a\s+new\s+|new\s+)?row\b\s*(?::|-|—|with|for)?\s*(.+)$/i.exec(body);
  if (ar) {
    const rest = ar[1].replace(/[.!]+$/, '').trim();
    const parts = rest.includes('|') ? rest.split('|') : rest.includes(';') ? rest.split(';') : /,\s/.test(rest) ? rest.split(/\s*,\s+/) : rest.split(',');
    const vals = parts.map((p) => p.trim().replace(/^[“"']|[”"']$/g, ''));
    if (vals.length !== s.columns.length) return null;
    // a day in words is read against today here, so the operation carries the day itself
    const resolved = vals.map((v, i) => (s.columns[i].type === 'date' && v && !isoDay(v) ? (readDay(v, today) ?? v) : v));
    return { op: 'addRow', args: { values: resolved.join('|'), by: 'person' } };
  }

  // "make it a bar chart", "pie chart", "show the table"
  const v = readDataView(body);
  if (v) return v === s.view ? null : { op: 'view', args: { view: v } };

  // "set March rent to 1200": the row by its label, the column by its name
  const sm = /^(?:please\s+)?(?:set|change|update|correct|fix|put)\s+(?:the\s+)?(.+?)\s+(?:to|=|as|at)\s+(.+?)[.!]?$/i.exec(body);
  if (sm) {
    const lc = s.columns.findIndex(isLabel);
    if (lc < 0) return null;
    const labelled = s.rows.map((r, i) => ({ i, label: r.cells[lc] })).filter((o): o is { i: number; label: string } => typeof o.label === 'string');
    const hit = findByLabel(labelled, (o) => o.label, sm[1]);
    // two rows with the same name: a guess would edit the wrong one
    if (!hit || labelled.filter((o) => norm(o.label) === norm(hit.label)).length > 1) return null;
    const rest = without(sm[1], hit.label);
    const numbers = s.columns.filter(isNum);
    const col = rest ? findColumn(s, rest, s.columns.filter((_, i) => i !== lc)) : numbers.length === 1 ? numbers[0] : null;
    if (!col) return null;
    const value = valueFor(col, sm[2], today);
    if (value === null) return null;
    return { op: 'cell', args: { row: hit.i, col: col.id, value, by: 'person' } };
  }
  return null;
}

// ── the kind ─────────────────────────────────────────────────────────

const unitSaid = (c: DataColumn) => (c.unit ? ` (${c.unit})` : '');
const rowLabel = (s: DataState, i: number): string => {
  const lc = s.columns.findIndex(isLabel);
  const v = lc >= 0 ? s.rows[i]?.cells[lc] : null;
  return typeof v === 'string' ? v : `row ${i + 1}`;
};

/** What the chart on show draws, in words. */
function drawnSaid(s: DataState): string | null {
  const b = bindingsFor(s, s.view);
  const names = (cs: DataColumn[]) => cs.map((c) => c.name).join(' and ');
  switch (s.view) {
    case 'bar':
      return `bars of ${names(b.y)} for each ${b.x!.name}, measured from zero`;
    case 'pie':
      return `${b.y[0].name} shared out by ${b.x!.name}`;
    case 'line':
    case 'area':
      return `${names(b.y)} over ${b.x!.name}`;
    case 'scatter':
      return `${names(b.y)} against ${b.x!.name}, one point per row`;
    case 'histogram': {
      const h = histogramOf(s);
      return h ? `the spread of ${b.x!.name}: ${h.counts.length} bin${h.counts.length === 1 ? '' : 's'} of width ${fmtNum(h.width)} from ${fmtNum(h.edges[0])} to ${fmtNum(h.edges[h.edges.length - 1])} (${s.bins ? `${s.bins} asked for` : 'Sturges’ rule'})` : null;
    }
    case 'heatmap': {
      const hm = heatmapLayout(s);
      return `${b.value!.name} for each ${b.y[0].name} and ${b.x!.name}, as colour${hm?.summed ? `; ${hm.summed} cell${hm.summed === 1 ? '' : 's'} sum more than one row` : ''}${hm?.scale.kind === 'diverging' ? '; the colours diverge at zero' : ''}`;
    }
  }
  return null;
}

function factsOf(s: DataState, guarded: boolean): string[] {
  const out = [`${s.title}: a table of ${s.rows.length} row${s.rows.length === 1 ? '' : 's'} and ${s.columns.length} column${s.columns.length === 1 ? '' : 's'}, shown as a ${VIEW_NAME[s.view]}.`];
  out.push(
    s.basis === 'illustrative'
      ? 'These are ILLUSTRATIVE numbers — examples, not real data. Say so whenever they are used.'
      : s.basis === 'given'
        ? 'These are the person’s own numbers.'
        : 'These numbers come from material the person attached.'
  );
  if (s.view !== 'table') {
    const why = viewUnavailable(s, s.view);
    out.push(why ? `The ${VIEW_NAME[s.view]} cannot draw: ${why}` : `Drawn: ${drawnSaid(s)}.`);
  }
  const nums = s.columns.filter(isNum).slice(0, 4);
  for (const c of nums) {
    const st = columnStats(s, c.id)!;
    const skipped = st.missing ? `, ${st.missing} empty cell${st.missing === 1 ? '' : 's'} skipped` : '';
    if (guarded || st.n === 0) out.push(`${c.name}${unitSaid(c)}: ${st.n} value${st.n === 1 ? '' : 's'}${skipped}.`);
    else out.push(`${c.name}${unitSaid(c)}: ${st.n} value${st.n === 1 ? '' : 's'}${skipped}; min ${fmtNum(st.min!)}, max ${fmtNum(st.max!)}, mean ${fmtNum(st.mean!)}, median ${fmtNum(st.median!)}, total ${fmtNum(st.total!)}.`);
  }
  if (guarded && nums.length) out.push('Summary statistics (range, mean, median, total) are withheld while the person works them out.');
  const mine = s.rows.filter((r) => r.by === 'person').length;
  if (mine) out.push(`${mine} row${mine === 1 ? ' is' : 's are'} the person’s own; Socria does not change those.`);
  if (s.basis === 'given' && mine < s.rows.length) out.push(`${s.rows.length - mine} row${s.rows.length - mine === 1 ? ' was' : 's were'} added by Socria, not given by the person.`);
  return out;
}

function textOf(s: DataState): string {
  const head = [
    `DATA “${s.title}” — ${BASIS_SAID[s.basis]}${s.sort ? `; shown sorted by ${colOf(s, s.sort.col)?.name ?? s.sort.col}, ${s.sort.dir === 'desc' ? 'descending' : 'ascending'}` : ''}`,
    `Columns: ${s.columns.map((c) => `${c.name} (${c.type}${c.unit ? `, ${c.unit}` : ''})`).join(' | ')}`,
  ];
  const lines: string[] = [];
  let used = head.join('\n').length;
  const order = displayOrder(s);
  for (let k = 0; k < order.length; k++) {
    const r = s.rows[order[k]];
    const line = `${order[k] + 1}. ${r.cells.map((v) => (v === null ? '—' : String(v))).join(' | ')}${r.by === 'person' ? ' · theirs' : ''}`;
    if (used + line.length + 40 > 2400) {
      lines.push(`… and ${order.length - k} more row${order.length - k === 1 ? '' : 's'}`);
      break;
    }
    lines.push(line);
    used += line.length + 1;
  }
  return [...head, ...(lines.length ? lines : ['(no rows yet)'])].join('\n').slice(0, 2400);
}

export const DATA = displayKind<DataState>({
  kind: 'data',
  label: 'Chart',
  sanitize: sanitizeData,
  ops: DATA_OPS,
  readOp: (text, s) => readDataOp(text, s, todayDay()),
  consequence: (before, after, step) => {
    if (step.op === 'cell' && before.rows.length === after.rows.length && before.columns.length === after.columns.length) {
      const r = rowIndex(after, step.args.row);
      const ci = after.columns.findIndex((c) => c.id === step.args.col);
      if (r !== null && ci >= 0) {
        const was = before.rows[r].cells[ci];
        const now = after.rows[r].cells[ci];
        return `${rowLabel(after, r)} · ${after.columns[ci].name}: ${was === null ? 'empty' : labelOf(was)} → ${now === null ? 'empty' : labelOf(now)}.`;
      }
    }
    const was = viewUnavailable(before, before.view);
    const now = viewUnavailable(after, after.view);
    if (now && !was && before.view === after.view) return `The ${VIEW_NAME[after.view]} cannot draw now: ${now}`;
    if (!now && was && before.view === after.view) return `The ${VIEW_NAME[after.view]} can draw again.`;
    return null;
  },
  facts: (s, { guarded }) => factsOf(s, guarded),
  text: textOf,
  parts: (s): Part[] => [...s.columns.map((c) => ({ id: c.id, label: c.name })), ...s.rows.map((_, i) => ({ id: `r${i}`, label: rowLabel(s, i) }))],
  partFacts: (s, part) => {
    const c = colOf(s, part);
    if (c) {
      const filled = s.rows.filter((r) => cellAt(s, r, c) !== null).length;
      return [`${c.name}: a ${c.type} column${c.unit ? ` in ${c.unit}` : ''}`, `${filled} filled, ${s.rows.length - filled} empty`, c.by === 'person' ? 'theirs' : 'from Socria'];
    }
    const m = /^r(\d+)$/.exec(part);
    const r = m ? s.rows[Number(m[1])] : undefined;
    if (!r) return null;
    return [r.cells.map((v, i) => `${s.columns[i].name}: ${v === null ? 'empty' : labelOf(v)}`).join('; '), r.by === 'person' ? 'theirs' : 'from Socria'];
  },
  views,
  size: (s, mode) =>
    mode === 'card'
      ? { w: 260, h: 150 }
      : mode === 'trail'
        ? { w: 200, h: 110 }
        : s.view === 'table'
          ? { w: Math.min(720, Math.max(320, 80 + 110 * s.columns.length)), h: Math.min(640, Math.max(200, 90 + 28 * (s.rows.length + 1))) }
          : { w: 640, h: 440 },
  shape: (s) => `${VIEW_NAME[s.view]} · ${s.rows.length} row${s.rows.length === 1 ? '' : 's'} × ${s.columns.length} column${s.columns.length === 1 ? '' : 's'}${s.basis === 'illustrative' ? ' · illustrative' : ''}`,
  // a row of twelve values is one argument, up to 12 × 80 characters and its separators
  argLimits: { count: 12, length: 1000 },
});

register(DATA);
registerDisplay({
  kind: 'data',
  noun: 'chart',
  handle: 'T',
  about: 'A table of the person’s own numbers, checked and drawn as a table, bar, line, area, scatter, pie, histogram or heatmap — example numbers are labelled as examples.',
  // "graph" and "plot" alone stay with the plotting surface: "graph y = x²" is a function, not a table
  called: [
    { words: ['bar chart', 'bar graph', 'column chart'], view: 'bar' },
    { words: ['line chart', 'line graph'], view: 'line' },
    { words: ['area chart'], view: 'area' },
    { words: ['scatter plot', 'scatterplot', 'scatter chart'], view: 'scatter' },
    { words: ['pie chart'], view: 'pie' },
    { words: ['histogram'], view: 'histogram' },
    { words: ['heatmap', 'heat map'], view: 'heatmap' },
    { words: ['data table', 'spreadsheet', 'table of my data', 'budget table'], view: 'table' },
    { words: ['chart', 'table'] },
  ],
  spec: `{"title": "short", "view": "table|bar|line|area|scatter|pie|histogram|heatmap", "basis": "given|source|illustrative", "columns": [{"id": "c1", "name": "Month", "type": "text|category|number|date", "unit": "$"}], "rows": [["Jan", 1200], ["Feb", 1250]], "x": "c1", "y": ["c2"]}
  "basis" is "given" only when every number is one the person wrote, "source" when they come from material they attached, otherwise "illustrative" — and then say in "gaps" that they are examples. Never present invented numbers as real; a value you do not have is an empty cell (null).`,
  example: {
    title: 'Monthly rent',
    view: 'bar',
    basis: 'given',
    columns: [
      { id: 'm', name: 'Month', type: 'text' },
      { id: 'r', name: 'Rent', type: 'number', unit: '$' },
    ],
    rows: [
      ['Jan', 1200],
      ['Feb', 1200],
      ['Mar', 1250],
    ],
    x: 'm',
    y: ['r'],
  },
  tell: () =>
    'A CHART’s numbers are the person’s, from material they attached, or examples — which one is stated above; never treat example numbers as facts. Its totals, averages, shares and scales are computed by the workspace: use them, never recompute them.',
});
