// A CUSTOM ARTIFACT — anything the other kinds are not, built from a few primitives.
//
// "The user should be able to choose what artifact on prompt, any artifact, it
// doesn't have to be in the list … it's completely generative, so make a few
// primitives." A habit tracker, a recipe scaler, a grade calculator, a packing
// list with a countdown: none is a kind of its own, and each is a handful of
// the same parts. The proposal pass composes them (display-propose.ts), this
// kind's sanitizer decides what of the draft it holds, and from then on it is
// an object of thought like any other — drawn, edited, undone and synced.
//
// THE PRIMITIVES (a block each, in order; a group lays a few out side by side):
//
//   text       a title, a heading, a paragraph or a note
//   list       items — a checklist when it can be ticked
//   table      columns of text, numbers, ticks, or a calc: a formula over the
//              row's own cells and the artifact's numbers
//   number     something the person sets: a field, a stepper or a slider
//   value      something computed, live, from a formula — never typed
//   chart      bars, a line or a pie, drawn from a table's columns or points
//   progress   how far along: a checklist's ticks, a table's, or a formula
//   choice     options to pick from, one or several
//   field      somewhere to write
//   timer      a countdown
//   group      a few blocks side by side
//
// WHAT IS COMPUTED, NEVER ASSERTED: every value, calc cell, total and
// progress is worked out here from what is in the state, by a small formula
// language read by this file alone (numbers, + − × ÷ ^ %, comparisons, the
// ids of numbers and values, a table's column, a list's ticks, and a dozen
// functions) — no code is ever run, and a formula that does not read is shown
// as one that does not, never guessed at.
//
// What the person writes is theirs (`by`): Socria may not change a value, an
// item or a row they wrote (display-base guardOwn).
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
  num,
  op,
  registerDisplay,
  sayNum,
  type Args,
  type By,
  type DisplayHead,
  type DisplayMeta,
} from './display-base';

// ── the state ────────────────────────────────────────────────────────

export interface ListItem {
  id: string;
  text: string;
  done?: boolean;
  by: By;
}
export interface TableColumn {
  id: string;
  label: string;
  kind: 'text' | 'number' | 'check' | 'calc';
  /** a calc column's formula, over the row's column ids and the artifact's numbers */
  expr?: string;
  unit?: string;
  /** a number or calc column summed under the table */
  total?: boolean;
}
export type Cell = string | number | boolean;
export interface TableRow {
  id: string;
  cells: Record<string, Cell>;
  by: By;
}

interface Base {
  id: string;
}
export type Block = Base &
  (
    | { type: 'text'; text: string; size: 'title' | 'heading' | 'body' | 'note' }
    | { type: 'list'; label?: string; check: boolean; items: ListItem[] }
    | { type: 'table'; label?: string; columns: TableColumn[]; rows: TableRow[] }
    | { type: 'number'; label: string; value: number; min?: number; max?: number; step: number; unit?: string; control: 'slider' | 'stepper' | 'field'; by: By }
    | { type: 'value'; label: string; expr: string; unit?: string; decimals: number }
    | { type: 'chart'; label?: string; chart: 'bar' | 'line' | 'pie'; table?: string; x?: string; y?: string; points?: { label: string; value: number }[] }
    | { type: 'progress'; label: string; of?: string; expr?: string; max: number }
    | { type: 'choice'; label: string; options: string[]; multi: boolean; picked: number[]; answer?: number[]; by: By }
    | { type: 'field'; label: string; value: string; multiline: boolean; placeholder?: string; by: By }
    | { type: 'timer'; label?: string; seconds: number }
    | { type: 'group'; label?: string; columns: 1 | 2 | 3; blocks: Block[] }
  );
export type BlockType = Block['type'];

export interface CustomState extends DisplayHead {
  title: string;
  view: 'board';
  /** one line: what it is for */
  about?: string;
  blocks: Block[];
  /** the person's own template it was made from */
  from?: string;
}

export const CUSTOM_LIMITS = { blocks: 40, items: 50, columns: 8, rows: 50, options: 8, points: 24, text: 600, field: 2000, label: 80, expr: 160, title: 80 } as const;
const L = CUSTOM_LIMITS;
export const BLOCK_TYPES: readonly BlockType[] = ['text', 'list', 'table', 'number', 'value', 'chart', 'progress', 'choice', 'field', 'timer', 'group'];

/** An id a formula can name: a letter, then letters, digits or _. */
const FORMULA_ID = /^[A-Za-z][A-Za-z0-9_]{0,23}$/;
const formulaId = (v: unknown): string | null => (typeof v === 'string' && FORMULA_ID.test(v) ? v : null);

/** Words someone writes, with their lines kept: control characters out, spaces collapsed within a line, capped. */
function cleanLines(v: unknown, max: number): string {
  if (typeof v !== 'string' && typeof v !== 'number') return '';
  // eslint-disable-next-line no-control-regex
  const s = String(v).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f\u2028\u2029]+/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return s.length <= max ? s : s.slice(0, max).trim();
}
const bool = (v: unknown) => v === true || v === 'true' || v === 1;

// ── formulas ─────────────────────────────────────────────────────────
//
// numbers, ids (price, t1.cost), + - * / % ^, < > <= >= == !=, && || !,
// parentheses and function calls. Read into a tree once, evaluated against a
// scope; any value that is not a finite number is no value (null).

type Tok = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string };
type Node =
  | { k: 'num'; v: number }
  | { k: 'ref'; name: string }
  | { k: 'un'; op: string; a: Node }
  | { k: 'bin'; op: string; a: Node; b: Node }
  | { k: 'call'; fn: string; args: Node[] };
type Val = number | number[] | null;

const FUNCS = new Set(['sum', 'avg', 'mean', 'min', 'max', 'count', 'round', 'floor', 'ceil', 'abs', 'sqrt', 'pow', 'if', 'clamp']);

function tokenize(src: string): Tok[] | null {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const rest = src.slice(i);
    if (/^\s/.test(rest)) {
      i++;
      continue;
    }
    const n = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(rest);
    if (n) {
      out.push({ t: 'num', v: Number(n[0]) });
      i += n[0].length;
      continue;
    }
    const id = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?/.exec(rest);
    if (id) {
      out.push({ t: 'id', v: id[0] });
      i += id[0].length;
      continue;
    }
    const o = /^(?:<=|>=|==|!=|&&|\|\||[-+*/^%(),<>!×÷−])/.exec(rest);
    if (o) {
      out.push({ t: 'op', v: o[0] === '×' ? '*' : o[0] === '÷' ? '/' : o[0] === '−' ? '-' : o[0] });
      i += o[0].length;
      continue;
    }
    return null;
  }
  return out;
}

/** A formula read into a tree, or null when it does not read. */
export function parseFormula(src: unknown): Node | null {
  if (typeof src !== 'string' || !src.trim() || src.length > L.expr) return null;
  const toks = tokenize(src);
  if (!toks || !toks.length) return null;
  let at = 0;
  let depth = 0;
  const peek = () => toks[at];
  const isOp = (v: string) => peek()?.t === 'op' && (peek() as { v: string }).v === v;
  const take = (v: string) => (isOp(v) ? (at++, true) : false);
  const bin = (next: () => Node | null, ops: string[]) => (): Node | null => {
    let a = next();
    while (a && peek()?.t === 'op' && ops.includes((peek() as { v: string }).v)) {
      const o = (toks[at++] as { v: string }).v;
      const b = next();
      if (!b) return null;
      a = { k: 'bin', op: o, a, b };
    }
    return a;
  };
  const primary = (): Node | null => {
    if (++depth > 40) return null;
    try {
      const t = peek();
      if (!t) return null;
      if (t.t === 'num') {
        at++;
        return { k: 'num', v: t.v };
      }
      if (t.t === 'id') {
        at++;
        if (take('(')) {
          const fn = t.v.toLowerCase();
          if (!FUNCS.has(fn)) return null;
          const args: Node[] = [];
          if (!take(')')) {
            for (;;) {
              const a = expr();
              if (!a) return null;
              args.push(a);
              if (take(')')) break;
              if (!take(',')) return null;
            }
          }
          return { k: 'call', fn, args };
        }
        return { k: 'ref', name: t.v };
      }
      if (take('(')) {
        const e = expr();
        return e && take(')') ? e : null;
      }
      return null;
    } finally {
      depth--;
    }
  };
  const unary = (): Node | null => {
    if (isOp('-') || isOp('!') || isOp('+')) {
      const o = (toks[at++] as { v: string }).v;
      const a = unary();
      return a ? (o === '+' ? a : { k: 'un', op: o, a }) : null;
    }
    return power();
  };
  const power = (): Node | null => {
    const a = primary();
    if (a && take('^')) {
      const b = unary();
      return b ? { k: 'bin', op: '^', a, b } : null;
    }
    return a;
  };
  const mul = bin(unary, ['*', '/', '%']);
  const add = bin(mul, ['+', '-']);
  const cmp = bin(add, ['<', '>', '<=', '>=', '==', '!=']);
  const and = bin(cmp, ['&&']);
  const expr: () => Node | null = bin(and, ['||']);
  const tree = expr();
  return tree && at === toks.length ? tree : null;
}

/** The names a formula reads. */
export function namesIn(node: Node | null): string[] {
  if (!node) return [];
  if (node.k === 'ref') return [node.name];
  if (node.k === 'un') return namesIn(node.a);
  if (node.k === 'bin') return [...namesIn(node.a), ...namesIn(node.b)];
  if (node.k === 'call') return node.args.flatMap(namesIn);
  return [];
}

const fin = (n: number): number | null => (Number.isFinite(n) ? n : null);
const scalar = (v: Val): number | null => (typeof v === 'number' ? v : null);
const flat = (vs: Val[]): number[] => vs.flatMap((v) => (v === null ? [] : Array.isArray(v) ? v : [v]));

/** A formula's value against a scope: a finite number, or null. */
export function evalFormula(node: Node | null, scope: (name: string) => Val): number | null {
  const v = ev(node, scope, 0);
  return typeof v === 'number' ? fin(v) : null;
}
function ev(node: Node | null, scope: (name: string) => Val, d: number): Val {
  if (!node || d > 60) return null;
  switch (node.k) {
    case 'num':
      return node.v;
    case 'ref':
      return scope(node.name);
    case 'un': {
      const a = scalar(ev(node.a, scope, d + 1));
      if (a === null) return null;
      return node.op === '-' ? -a : a ? 0 : 1;
    }
    case 'bin': {
      const a = scalar(ev(node.a, scope, d + 1));
      const b = scalar(ev(node.b, scope, d + 1));
      if (a === null || b === null) return null;
      switch (node.op) {
        case '+': return fin(a + b);
        case '-': return fin(a - b);
        case '*': return fin(a * b);
        case '/': return b === 0 ? null : fin(a / b);
        case '%': return b === 0 ? null : fin(a % b);
        case '^': return fin(Math.pow(a, b));
        case '<': return a < b ? 1 : 0;
        case '>': return a > b ? 1 : 0;
        case '<=': return a <= b ? 1 : 0;
        case '>=': return a >= b ? 1 : 0;
        case '==': return Math.abs(a - b) < 1e-9 ? 1 : 0;
        case '!=': return Math.abs(a - b) >= 1e-9 ? 1 : 0;
        case '&&': return a && b ? 1 : 0;
        case '||': return a || b ? 1 : 0;
      }
      return null;
    }
    case 'call': {
      const args = node.args.map((x) => ev(x, scope, d + 1));
      const s = args.map(scalar);
      switch (node.fn) {
        case 'sum': return fin(flat(args).reduce((t, x) => t + x, 0));
        case 'avg':
        case 'mean': {
          const xs = flat(args);
          return xs.length ? fin(xs.reduce((t, x) => t + x, 0) / xs.length) : null;
        }
        case 'min': {
          const xs = flat(args);
          return xs.length ? Math.min(...xs) : null;
        }
        case 'max': {
          const xs = flat(args);
          return xs.length ? Math.max(...xs) : null;
        }
        case 'count': return flat(args).length;
        case 'round': {
          if (s[0] === null) return null;
          const p = Math.max(0, Math.min(6, Math.round(s[1] ?? 0)));
          return Math.round(s[0] * 10 ** p) / 10 ** p;
        }
        case 'floor': return s[0] === null ? null : Math.floor(s[0]);
        case 'ceil': return s[0] === null ? null : Math.ceil(s[0]);
        case 'abs': return s[0] === null ? null : Math.abs(s[0]);
        case 'sqrt': return s[0] === null || s[0] < 0 ? null : Math.sqrt(s[0]);
        case 'pow': return s[0] === null || s[1] === null ? null : fin(Math.pow(s[0], s[1]));
        case 'if': return s[0] === null ? null : s[0] ? (args[1] ?? null) : (args[2] ?? null);
        case 'clamp': return s[0] === null || s[1] === null || s[2] === null ? null : Math.min(Math.max(s[0], s[1]), s[2]);
      }
      return null;
    }
  }
}

// ── canonical state ──────────────────────────────────────────────────

const SIZES = ['title', 'heading', 'body', 'note'] as const;
const CHARTS = ['bar', 'line', 'pie'] as const;
const CONTROLS = ['slider', 'stepper', 'field'] as const;
const COLUMN_KINDS = ['text', 'number', 'check', 'calc'] as const;
const oneOf = <T extends string>(v: unknown, list: readonly T[], dflt: T): T => (list.includes(v as T) ? (v as T) : dflt);

/** Every block id in a draft, first use first: an id written twice keeps its first block. */
function idsIn(raws: unknown[], depth: number, seen: Set<string>): void {
  for (const x of raws) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    const id = formulaId(o.id);
    if (id && !seen.has(id)) seen.add(id);
    if (depth === 0 && o.type === 'group' && Array.isArray(o.blocks)) idsIn(o.blocks, 1, seen);
  }
}

function sanitizeItems(raw: unknown, check: boolean): ListItem[] {
  const out: ListItem[] = [];
  const taken = new Set<string>();
  for (const x of (Array.isArray(raw) ? raw : []).slice(0, L.items * 2)) {
    if (out.length >= L.items) break;
    const o = typeof x === 'string' ? { text: x } : x && typeof x === 'object' ? (x as Record<string, unknown>) : null;
    if (!o) continue;
    const text = cleanText(o.text ?? o.label ?? o.name, 160);
    if (!text) continue;
    let id = cleanId(o.id);
    if (!id || taken.has(id)) id = nextId('i', taken);
    taken.add(id);
    out.push({ id, text, ...(check && bool(o.done) ? { done: true } : {}), by: cleanBy(o.by) });
  }
  return out;
}

function sanitizeTable(o: Record<string, unknown>): { columns: TableColumn[]; rows: TableRow[] } | null {
  const columns: TableColumn[] = [];
  const colIds = new Set<string>();
  for (const x of (Array.isArray(o.columns) ? o.columns : []).slice(0, L.columns * 2)) {
    if (columns.length >= L.columns) break;
    const c = typeof x === 'string' ? { label: x } : x && typeof x === 'object' ? (x as Record<string, unknown>) : null;
    if (!c) continue;
    const label = cleanText(c.label ?? c.name, 40);
    if (!label) continue;
    let id = formulaId(c.id);
    if (!id || colIds.has(id)) id = nextId('c', colIds);
    colIds.add(id);
    let kind = oneOf(c.kind ?? c.type, COLUMN_KINDS, 'text');
    const expr = kind === 'calc' ? cleanText(c.expr, L.expr) : '';
    if (kind === 'calc' && !parseFormula(expr)) kind = 'number';
    const unit = cleanText(c.unit, 12);
    columns.push({ id, label, kind, ...(kind === 'calc' ? { expr } : {}), ...(unit ? { unit } : {}), ...((kind === 'number' || kind === 'calc') && bool(c.total) ? { total: true } : {}) });
  }
  if (!columns.length) return null;
  const rows: TableRow[] = [];
  const rowIds = new Set<string>();
  for (const x of (Array.isArray(o.rows) ? o.rows : []).slice(0, L.rows * 2)) {
    if (rows.length >= L.rows) break;
    if (!x || typeof x !== 'object') continue;
    const r = x as Record<string, unknown>;
    // a row as its cells by column id or label, or as a list in the columns' order
    const given: Record<string, unknown> = Array.isArray(x)
      ? Object.fromEntries(columns.map((c, i) => [c.id, (x as unknown[])[i]]))
      : r.cells && typeof r.cells === 'object' && !Array.isArray(r.cells)
        ? (r.cells as Record<string, unknown>)
        : Array.isArray(r.cells)
          ? Object.fromEntries(columns.map((c, i) => [c.id, (r.cells as unknown[])[i]]))
          : r;
    const cells: Record<string, Cell> = {};
    for (const c of columns) {
      if (c.kind === 'calc') continue;
      const v = given[c.id] ?? given[c.label];
      if (c.kind === 'number') {
        const n = num(v);
        if (n !== null) cells[c.id] = n;
      } else if (c.kind === 'check') {
        if (bool(v)) cells[c.id] = true;
      } else {
        const t = cleanText(v, 120);
        if (t) cells[c.id] = t;
      }
    }
    let id = cleanId(Array.isArray(x) ? null : r.id);
    if (!id || rowIds.has(id)) id = nextId('r', rowIds);
    rowIds.add(id);
    rows.push({ id, cells, by: cleanBy(Array.isArray(x) ? null : r.by) });
  }
  return { columns, rows };
}

function sanitizeBlock(o: Record<string, unknown>, id: string, depth: number, budget: { n: number }, ids: { taken: Set<string>; explicit: Set<string> }): Block | null {
  const type = o.type;
  const label = cleanText(o.label ?? o.title ?? o.name, L.label);
  switch (type) {
    case 'text': {
      const text = cleanLines(o.text ?? o.content ?? o.label, L.text);
      return text ? { id, type, text, size: oneOf(o.size ?? o.style, SIZES, 'body') } : null;
    }
    case 'list': {
      const check = bool(o.check ?? o.checklist);
      const items = sanitizeItems(o.items, check);
      return items.length || label ? { id, type, ...(label ? { label } : {}), check, items } : null;
    }
    case 'table': {
      const t = sanitizeTable(o);
      return t ? { id, type, ...(label ? { label } : {}), ...t } : null;
    }
    case 'number': {
      if (!label) return null;
      let min = num(o.min);
      let max = num(o.max);
      if (min !== null && max !== null && min > max) [min, max] = [max, min];
      const stepIn = num(o.step);
      const step = stepIn !== null && stepIn > 0 ? stepIn : 1;
      let value = num(o.value ?? o.default) ?? min ?? 0;
      if (min !== null) value = Math.max(min, value);
      if (max !== null) value = Math.min(max, value);
      const unit = cleanText(o.unit, 12);
      const control = oneOf(o.control, CONTROLS, min !== null && max !== null ? 'slider' : 'field');
      return { id, type, label, value, ...(min !== null ? { min } : {}), ...(max !== null ? { max } : {}), step, ...(unit ? { unit } : {}), control: control === 'slider' && (min === null || max === null) ? 'stepper' : control, by: cleanBy(o.by) };
    }
    case 'value': {
      const expr = cleanText(o.expr ?? o.formula, L.expr);
      if (!label || !parseFormula(expr)) return null;
      const unit = cleanText(o.unit, 12);
      const dec = num(o.decimals);
      return { id, type, label, expr, ...(unit ? { unit } : {}), decimals: dec === null ? 2 : Math.max(0, Math.min(6, Math.round(dec))) };
    }
    case 'chart': {
      const chart = oneOf(o.chart ?? o.kind, CHARTS, 'bar');
      const table = formulaId(o.table);
      const x = formulaId(o.x);
      const y = formulaId(o.y);
      const points = (Array.isArray(o.points) ? o.points : [])
        .slice(0, L.points)
        .map((p) => (p && typeof p === 'object' ? { label: cleanText((p as Record<string, unknown>).label, 40), value: num((p as Record<string, unknown>).value) } : null))
        .filter((p): p is { label: string; value: number } => !!p && !!p.label && p.value !== null);
      if (table && y) return { id, type, ...(label ? { label } : {}), chart, table, ...(x ? { x } : {}), y };
      return points.length ? { id, type, ...(label ? { label } : {}), chart, points } : null;
    }
    case 'progress': {
      if (!label) return null;
      const of = formulaId(o.of);
      const expr = cleanText(o.expr, L.expr);
      const max = num(o.max);
      if (of) return { id, type, label, of, max: 1 };
      return parseFormula(expr) ? { id, type, label, expr, max: max !== null && max > 0 ? max : 100 } : null;
    }
    case 'choice': {
      const options = (Array.isArray(o.options) ? o.options : []).map((x) => cleanText(x, 80)).filter(Boolean).slice(0, L.options);
      if (!label || options.length < 2) return null;
      const multi = bool(o.multi);
      const idx = (v: unknown) => [...new Set((Array.isArray(v) ? v : typeof v === 'number' ? [v] : []).map((n) => Math.round(Number(n))).filter((n) => Number.isInteger(n) && n >= 0 && n < options.length))];
      const picked = idx(o.picked);
      const answer = idx(o.answer);
      return { id, type, label, options, multi, picked: multi ? picked : picked.slice(0, 1), ...(answer.length ? { answer: multi ? answer : answer.slice(0, 1) } : {}), by: cleanBy(o.by) };
    }
    case 'field': {
      if (!label) return null;
      const placeholder = cleanText(o.placeholder, 80);
      return { id, type, label, value: cleanLines(o.value, L.field), multiline: bool(o.multiline), ...(placeholder ? { placeholder } : {}), by: cleanBy(o.by) };
    }
    case 'timer': {
      const s = num(o.seconds ?? o.duration, 1, 86_400);
      return s === null ? null : { id, type, ...(label ? { label } : {}), seconds: Math.round(s) };
    }
    case 'group': {
      if (depth > 0) return null;
      const blocks = sanitizeBlocks(o.blocks, 1, budget, ids);
      if (!blocks.length) return null;
      const cols = num(o.columns);
      return { id, type, ...(label ? { label } : {}), columns: (cols === 2 || cols === 3 ? cols : 1) as 1 | 2 | 3, blocks };
    }
  }
  return null;
}

function sanitizeBlocks(raw: unknown, depth: number, budget: { n: number }, ids: { taken: Set<string>; explicit: Set<string> }): Block[] {
  const out: Block[] = [];
  for (const x of (Array.isArray(raw) ? raw : []).slice(0, L.blocks * 2)) {
    if (budget.n >= L.blocks) break;
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    // its own id, once; otherwise the next free one that no block named for itself (a formula may name it)
    let id = formulaId(o.id);
    if (!id || ids.taken.has(id)) id = nextId('b', [...ids.taken, ...ids.explicit]);
    ids.taken.add(id);
    budget.n++;
    const b = sanitizeBlock(o, id, depth, budget, ids);
    if (b) out.push(b);
    else budget.n--;
  }
  return out;
}

export function sanitizeCustom(raw: unknown): CustomState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const explicit = new Set<string>();
  idsIn(Array.isArray(r.blocks) ? r.blocks : [], 0, explicit);
  const blocks = sanitizeBlocks(r.blocks, 0, { n: 0 }, { taken: new Set(), explicit });
  if (!blocks.length) return null;
  const about = cleanText(r.about, 200);
  const from = cleanText(r.from, 60);
  return { title: cleanText(r.title, L.title) || 'Custom artifact', view: 'board', ...(about ? { about } : {}), blocks, ...(from ? { from } : {}) };
}

/**
 * A template's shape, for the proposal pass: every block, with a few of a
 * table's rows and a list's items kept as examples — the shape is what is
 * made again, and what was in it is not this request's content.
 */
export function templateShape(blocks: readonly Block[]): Block[] {
  return blocks.map((b) =>
    b.type === 'table' ? { ...b, rows: b.rows.slice(0, 3) } : b.type === 'list' ? { ...b, items: b.items.slice(0, 5) } : b.type === 'group' ? { ...b, blocks: templateShape(b.blocks) } : b
  );
}

// ── what is computed ─────────────────────────────────────────────────

/** Every block, groups opened, in order. */
export function allBlocks(s: CustomState): Block[] {
  return s.blocks.flatMap((b) => (b.type === 'group' ? [b, ...b.blocks] : [b]));
}
export const blockOf = (s: CustomState, id: unknown): Block | null => allBlocks(s).find((b) => b.id === id) ?? null;

export interface Computed {
  /** each number, value and choice block's number */
  values: Record<string, number | null>;
  /** a table's calc cells: table → row → column */
  cells: Record<string, Record<string, Record<string, number | null>>>;
  /** a table's totals: table → column */
  totals: Record<string, Record<string, number | null>>;
  /** each progress block, 0–1 */
  progress: Record<string, number | null>;
}

const asNumber = (v: Cell | undefined): number | null => (typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : typeof v === 'string' && v.trim() && Number.isFinite(Number(v.replace(/[,$£€\s]/g, ''))) ? Number(v.replace(/[,$£€\s]/g, '')) : null);
/** A cell as a formula reads it: a tick is 1 and an empty tick 0 — an empty number is no number. */
const cellValue = (col: TableColumn, row: TableRow): number | null => (col.kind === 'check' ? (row.cells[col.id] === true ? 1 : 0) : asNumber(row.cells[col.id]));

/** Everything the artifact works out from what it holds. */
export function computeCustom(s: CustomState): Computed {
  const blocks = allBlocks(s);
  const byId = new Map(blocks.map((b) => [b.id, b]));
  const values: Record<string, number | null> = {};
  const cells: Computed['cells'] = {};
  const totals: Computed['totals'] = {};
  const busy = new Set<string>();

  // a calc cell, worked out once: the row's other cells and the artifact's numbers are its scope
  const calcCell = (t: Extract<Block, { type: 'table' }>, row: TableRow, col: TableColumn): number | null => {
    const memo = (cells[t.id] ??= {})[row.id] ??= {};
    if (col.id in memo) return memo[col.id];
    const key = `${t.id}.${row.id}.${col.id}`;
    if (busy.has(key)) return null;
    busy.add(key);
    const scope = (name: string): Val => {
      const c = t.columns.find((x) => x.id === name);
      if (c) return c.kind === 'calc' ? calcCell(t, row, c) : cellValue(c, row);
      return global(name);
    };
    const v = evalFormula(parseFormula(col.expr), scope);
    busy.delete(key);
    memo[col.id] = v;
    return v;
  };
  const column = (t: Extract<Block, { type: 'table' }>, colId: string): number[] | null => {
    const c = t.columns.find((x) => x.id === colId);
    if (!c) return null;
    return t.rows.map((r) => (c.kind === 'calc' ? calcCell(t, r, c) : cellValue(c, r))).filter((x): x is number => x !== null);
  };
  function value(id: string): number | null {
    if (id in values) return values[id];
    const b = byId.get(id);
    if (!b || busy.has(id)) return null;
    busy.add(id);
    let v: number | null = null;
    if (b.type === 'number') v = b.value;
    else if (b.type === 'value') v = evalFormula(parseFormula(b.expr), global);
    else if (b.type === 'choice') v = b.picked.length ? b.picked[0] + 1 : null;
    else if (b.type === 'field') v = asNumber(b.value);
    busy.delete(id);
    values[id] = v;
    return v;
  }
  function global(name: string): Val {
    const dot = name.indexOf('.');
    if (dot < 0) return value(name);
    const [id, part] = [name.slice(0, dot), name.slice(dot + 1)];
    const b = byId.get(id);
    if (!b) return null;
    if (b.type === 'list') return part === 'done' ? b.items.filter((i) => i.done).length : part === 'total' ? b.items.length : null;
    if (b.type === 'table') return part === 'rows' ? b.rows.length : column(b, part);
    return null;
  }

  for (const b of blocks) {
    if (b.type === 'number' || b.type === 'value' || b.type === 'choice') value(b.id);
    if (b.type === 'table') {
      for (const r of b.rows) for (const c of b.columns) if (c.kind === 'calc') calcCell(b, r, c);
      totals[b.id] = Object.fromEntries(b.columns.filter((c) => c.total).map((c) => [c.id, (column(b, c.id) ?? []).reduce((t, x) => t + x, 0)]));
    }
  }
  const progress: Record<string, number | null> = {};
  for (const b of blocks) {
    if (b.type !== 'progress') continue;
    const of = b.of ? byId.get(b.of) : null;
    let p: number | null = null;
    if (of?.type === 'list') p = of.items.length ? of.items.filter((i) => i.done).length / of.items.length : 0;
    else if (of?.type === 'table') {
      const checks = of.columns.filter((c) => c.kind === 'check');
      const all = of.rows.length * checks.length;
      p = all ? of.rows.reduce((n, r) => n + checks.filter((c) => r.cells[c.id] === true).length, 0) / all : 0;
    } else if (b.expr) {
      const v = evalFormula(parseFormula(b.expr), global);
      p = v === null ? null : v / b.max;
    }
    progress[b.id] = p === null ? null : Math.max(0, Math.min(1, p));
  }
  return { values, cells, totals, progress };
}

/** A computed number as a person reads it: its decimals, its unit. */
export function sayValue(v: number | null, decimals = 2, unit?: string): string {
  if (v === null) return '—';
  return `${sayNum(v, decimals)}${unit ? (/^[%°]/.test(unit) ? unit : ` ${unit}`) : ''}`;
}

/** What a chart draws: labels and values, from its table's columns or its own points. */
export function chartData(s: CustomState, b: Extract<Block, { type: 'chart' }>, c: Computed = computeCustom(s)): { label: string; value: number }[] {
  if (b.points) return b.points;
  const t = b.table ? blockOf(s, b.table) : null;
  if (!t || t.type !== 'table' || !b.y) return [];
  const yc = t.columns.find((x) => x.id === b.y);
  if (!yc) return [];
  const xc = b.x ? t.columns.find((x) => x.id === b.x) : t.columns.find((x) => x.kind === 'text');
  return t.rows
    .map((r, i) => {
      const v = yc.kind === 'calc' ? (c.cells[t.id]?.[r.id]?.[yc.id] ?? null) : cellValue(yc, r);
      const lab = xc ? String(r.cells[xc.id] ?? '') : '';
      return v === null ? null : { label: lab || `Row ${i + 1}`, value: v };
    })
    .filter((p): p is { label: string; value: number } => !!p)
    .slice(0, L.points);
}

// ── operations ───────────────────────────────────────────────────────

const views: ViewDecl<CustomState>[] = [
  {
    id: 'board',
    label: 'Board',
    shows: 'the artifact as it was built: its text, lists, tables, numbers, values, charts and timers',
    primary: true,
    interactions: ['type in a field', 'set a number', 'tick an item', 'edit a table cell', 'add a row or an item', 'pick an option'],
  },
];

const withBlock = (s: CustomState, id: string, f: (b: Block) => Block): CustomState =>
  sanitizeCustom({ ...s, blocks: s.blocks.map((b) => (b.id === id ? f(b) : b.type === 'group' ? { ...b, blocks: b.blocks.map((x) => (x.id === id ? f(x) : x)) } : b)) }) ?? s;
const claim = (a: Args, was: By): By => (a.by === 'person' ? 'person' : was);
const kindIs = <T extends BlockType>(s: CustomState, id: unknown, ...types: T[]): Extract<Block, { type: T }> | null => {
  const b = blockOf(s, id);
  return b && (types as string[]).includes(b.type) ? (b as Extract<Block, { type: T }>) : null;
};
const nameOf = (b: Block): string => ('label' in b && b.label) || (b.type === 'text' ? b.text.slice(0, 40) : b.type);
const pickedOf = (b: Extract<Block, { type: 'choice' }>, raw: unknown): number[] => {
  const xs = String(raw ?? '')
    .split(',')
    .map((x) => Math.round(Number(x)))
    .filter((n) => Number.isInteger(n) && n >= 0 && n < b.options.length);
  return b.multi ? [...new Set(xs)] : xs.slice(0, 1);
};

export const CUSTOM_OPS = {
  ...headOps<CustomState>(views, sanitizeCustom),
  set: op<CustomState>(
    'Set',
    (s, a, ctx) => {
      const b = kindIs(s, a.id, 'number', 'field', 'choice');
      if (!b) return 'There is nothing to set there.';
      if (b.type === 'number' && num(a.value) === null) return 'Give it a number.';
      return guardOwn(b, ctx, `${b.label}`) ?? guardBy(a, ctx);
    },
    (s, a) =>
      withBlock(s, String(a.id), (b) => {
        if (b.type === 'number') return { ...b, value: num(a.value) ?? b.value, by: claim(a, b.by) };
        if (b.type === 'field') return { ...b, value: cleanLines(a.value, L.field), by: claim(a, b.by) };
        if (b.type === 'choice') return { ...b, picked: pickedOf(b, a.value), by: claim(a, b.by) };
        return b;
      }),
    (a) => `set ${String(a.label ?? 'a value')}`.slice(0, 80)
  ),
  tick: op<CustomState>(
    'Tick',
    (s, a, ctx) => {
      const b = kindIs(s, a.id, 'list');
      if (!b) return 'There is no list there.';
      if (!b.check) return 'That list has nothing to tick.';
      const it = b.items.find((i) => i.id === a.item);
      if (!it) return 'There is no such item.';
      return guardOwn(it, ctx) ?? guardBy(a, ctx);
    },
    (s, a) => withBlock(s, String(a.id), (b) => (b.type === 'list' ? { ...b, items: b.items.map((i) => (i.id === a.item ? { ...i, done: !i.done, by: claim(a, i.by) } : i)) } : b)),
    () => 'ticked an item'
  ),
  addItem: op<CustomState>(
    'Add an item',
    (s, a, ctx) => {
      const b = kindIs(s, a.id, 'list');
      if (!b) return 'There is no list there.';
      if (!cleanText(a.text, 160)) return 'Say what the item is.';
      if (b.items.length >= L.items) return `A list here holds ${L.items} items at most.`;
      return guardBy(a, ctx);
    },
    (s, a) => withBlock(s, String(a.id), (b) => (b.type === 'list' ? { ...b, items: [...b.items, { id: nextId('i', b.items.map((i) => i.id)), text: cleanText(a.text, 160), by: cleanBy(a.by) }] } : b)),
    (a) => `added “${cleanText(a.text, 160)}”`
  ),
  editItem: op<CustomState>(
    'Change an item',
    (s, a, ctx) => {
      const b = kindIs(s, a.id, 'list');
      const it = b?.items.find((i) => i.id === a.item);
      if (!it) return 'There is no such item.';
      if (!cleanText(a.text, 160)) return 'Say what it should say.';
      return guardOwn(it, ctx) ?? guardBy(a, ctx);
    },
    (s, a) => withBlock(s, String(a.id), (b) => (b.type === 'list' ? { ...b, items: b.items.map((i) => (i.id === a.item ? { ...i, text: cleanText(a.text, 160), by: claim(a, i.by) } : i)) } : b)),
    (a) => `changed an item to “${cleanText(a.text, 160)}”`
  ),
  removeItem: op<CustomState>(
    'Remove an item',
    (s, a, ctx) => {
      const b = kindIs(s, a.id, 'list');
      const it = b?.items.find((i) => i.id === a.item);
      if (!it) return 'There is no such item.';
      return guardOwn(it, ctx);
    },
    (s, a) => withBlock(s, String(a.id), (b) => (b.type === 'list' ? { ...b, items: b.items.filter((i) => i.id !== a.item) } : b)),
    () => 'removed an item'
  ),
  cell: op<CustomState>(
    'Change a cell',
    (s, a, ctx) => {
      const b = kindIs(s, a.id, 'table');
      if (!b) return 'There is no table there.';
      const r = b.rows.find((x) => x.id === a.row);
      const c = b.columns.find((x) => x.id === a.col);
      if (!r || !c) return 'There is no such cell.';
      if (c.kind === 'calc') return `${c.label} is worked out from the row — change what it is worked out from.`;
      if (c.kind === 'number' && String(a.value ?? '').trim() && num(a.value) === null) return 'That column holds numbers.';
      return guardOwn(r, ctx, 'That row') ?? guardBy(a, ctx);
    },
    (s, a) =>
      withBlock(s, String(a.id), (b) => {
        if (b.type !== 'table') return b;
        const c = b.columns.find((x) => x.id === a.col)!;
        return {
          ...b,
          rows: b.rows.map((r) => {
            if (r.id !== a.row) return r;
            const cells = { ...r.cells };
            const v = c.kind === 'number' ? num(a.value) : c.kind === 'check' ? bool(a.value) || null : cleanText(a.value, 120) || null;
            if (v === null) delete cells[c.id];
            else cells[c.id] = v;
            return { ...r, cells, by: claim(a, r.by) };
          }),
        };
      }),
    () => 'changed a cell'
  ),
  addRow: op<CustomState>(
    'Add a row',
    (s, a, ctx) => {
      const b = kindIs(s, a.id, 'table');
      if (!b) return 'There is no table there.';
      if (b.rows.length >= L.rows) return `A table here holds ${L.rows} rows at most.`;
      return guardBy(a, ctx);
    },
    (s, a) => withBlock(s, String(a.id), (b) => (b.type === 'table' ? { ...b, rows: [...b.rows, { id: nextId('r', b.rows.map((r) => r.id)), cells: {}, by: cleanBy(a.by) }] } : b)),
    () => 'added a row'
  ),
  removeRow: op<CustomState>(
    'Remove a row',
    (s, a, ctx) => {
      const b = kindIs(s, a.id, 'table');
      const r = b?.rows.find((x) => x.id === a.row);
      if (!r) return 'There is no such row.';
      return guardOwn(r, ctx, 'That row');
    },
    (s, a) => withBlock(s, String(a.id), (b) => (b.type === 'table' ? { ...b, rows: b.rows.filter((r) => r.id !== a.row) } : b)),
    () => 'removed a row'
  ),
};

/**
 * An operation in words, where the words plainly are one: "set servings to 6",
 * "tick milk", "untick milk", "add bread to the shopping list". A question is
 * left to the conversation.
 */
export function readCustomOp(text: string, s: CustomState): { op: string; args: Args } | null {
  const t = text.trim().replace(/[.!]+$/, '');
  if (!t || /\?\s*$/.test(t)) return null;
  const blocks = allBlocks(s);
  let m = /^(?:set|change|make|put)\s+(?:the\s+|my\s+)?(.+?)\s+(?:to|at|=)\s+(-?[\d.,]+)\s*[a-z%°]*$/i.exec(t);
  if (m) {
    const b = findByLabel(blocks.filter((x): x is Extract<Block, { type: 'number' }> => x.type === 'number'), (x) => x.label, m[1]);
    const v = num(m[2]);
    if (b && v !== null) return { op: 'set', args: { id: b.id, value: v, label: `${b.label} to ${sayNum(v)}`, by: 'person' } };
  }
  m = /^(un)?(?:tick|check|mark|cross)(?:\s+off)?\s+(.+?)(?:\s+(?:as\s+)?(?:done|complete|finished|off))?$/i.exec(t);
  if (m) {
    const items = blocks.flatMap((b) => (b.type === 'list' && b.check ? b.items.map((i) => ({ b, i })) : []));
    const hit = findByLabel(items, (x) => x.i.text, m[2]);
    if (hit && !!hit.i.done === !!m[1]) return { op: 'tick', args: { id: hit.b.id, item: hit.i.id, by: 'person' } };
  }
  m = /^add\s+(.+?)\s+to\s+(?:the\s+|my\s+)?(.+?)(?:\s+list)?$/i.exec(t);
  if (m) {
    const lists = blocks.filter((x): x is Extract<Block, { type: 'list' }> => x.type === 'list' && !!x.label);
    const b = findByLabel(lists, (x) => x.label ?? '', m[2]);
    if (b) return { op: 'addItem', args: { id: b.id, text: cleanText(m[1], 160), by: 'person' } };
  }
  return null;
}

// ── what the conversation is told ────────────────────────────────────

const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

function blockLines(s: CustomState, c: Computed, guarded: boolean, full: boolean): string[] {
  const out: string[] = [];
  for (const b of allBlocks(s)) {
    switch (b.type) {
      case 'text':
        if (b.size === 'title' || b.size === 'heading') out.push(`— ${b.text}`);
        else if (full) out.push(b.text);
        break;
      case 'list': {
        const done = b.items.filter((i) => i.done).length;
        const shown = b.items.slice(0, full ? 50 : 8).map((i) => `${b.check ? (i.done ? '[x] ' : '[ ] ') : ''}${i.text}`);
        out.push(`${b.label ?? 'List'}${b.check ? ` (${done} of ${b.items.length} done)` : ''}: ${shown.join('; ')}${b.items.length > shown.length ? `; and ${b.items.length - shown.length} more` : ''}`);
        break;
      }
      case 'table': {
        const head = `${b.label ?? 'Table'}: ${b.rows.length} row${b.rows.length === 1 ? '' : 's'}; columns ${b.columns.map((x) => `${x.label}${x.kind === 'calc' ? ` (= ${x.expr})` : ''}`).join(', ')}`;
        const tot = Object.entries(c.totals[b.id] ?? {}).map(([col, v]) => `total ${b.columns.find((x) => x.id === col)?.label}: ${sayValue(v, 2, b.columns.find((x) => x.id === col)?.unit)}`);
        out.push([head, ...tot].join('; '));
        if (full)
          for (const r of b.rows.slice(0, 20))
            out.push(`  ${b.columns.map((col) => `${col.label}: ${col.kind === 'calc' ? sayValue(c.cells[b.id]?.[r.id]?.[col.id] ?? null, 2) : col.kind === 'check' ? (r.cells[col.id] ? 'yes' : 'no') : (r.cells[col.id] ?? '—')}`).join(', ')}`);
        break;
      }
      case 'number':
        out.push(`${b.label}: ${sayValue(b.value, 6, b.unit)}${b.min !== undefined && b.max !== undefined ? ` (between ${sayNum(b.min)} and ${sayNum(b.max)})` : ''}`);
        break;
      case 'value':
        out.push(`${b.label} = ${sayValue(c.values[b.id] ?? null, b.decimals, b.unit)} (worked out from ${b.expr})`);
        break;
      case 'chart':
        out.push(`${b.label ?? 'Chart'}: a ${b.chart} chart of ${chartData(s, b, c).map((p) => `${p.label} ${sayNum(p.value)}`).slice(0, 8).join(', ') || 'nothing yet'}`);
        break;
      case 'progress': {
        const p = c.progress[b.id];
        out.push(`${b.label}: ${p === null ? '—' : `${Math.round(p * 100)}%`}`);
        break;
      }
      case 'choice': {
        const picked = b.picked.map((i) => b.options[i]).join(', ');
        const ans = !guarded && b.answer?.length ? ` (the answer: ${b.answer.map((i) => b.options[i]).join(', ')})` : '';
        out.push(`${b.label}: ${b.options.join(' / ')}${picked ? ` — picked ${picked}` : ' — nothing picked yet'}${ans}`);
        break;
      }
      case 'field':
        out.push(`${b.label}: ${b.value ? `“${b.value.slice(0, full ? 600 : 120)}”` : '(empty)'}`);
        break;
      case 'timer':
        out.push(`${b.label ?? 'Timer'}: ${clock(b.seconds)}`);
        break;
      case 'group':
        if (b.label) out.push(`— ${b.label}`);
        break;
    }
  }
  return out;
}

function factsOf(s: CustomState, guarded: boolean): string[] {
  const c = computeCustom(s);
  const about = s.about ? ` — ${s.about.replace(/[.!]+$/, '')}` : '';
  return [`A custom artifact, “${s.title}”${about}${s.from ? ` (made from their template “${s.from}”)` : ''}.`, ...blockLines(s, c, guarded, false)].slice(0, 30);
}
function textOf(s: CustomState): string {
  return [s.title, s.about ?? '', ...blockLines(s, computeCustom(s), true, true)].filter(Boolean).join('\n').slice(0, 4000);
}

/** About how tall a block is drawn, for a layout to make room. */
function heightOf(b: Block): number {
  switch (b.type) {
    case 'text': return b.size === 'title' ? 44 : b.size === 'heading' ? 34 : 24 + 18 * Math.ceil(b.text.length / 90);
    case 'list': return 30 + 32 * b.items.length + 40;
    case 'table': return 44 + 36 * (b.rows.length + 1) + (b.columns.some((c) => c.total) ? 36 : 0) + 40;
    case 'number': return 64;
    case 'value': return 56;
    case 'chart': return 240;
    case 'progress': return 52;
    case 'choice': return 36 + 38 * b.options.length;
    case 'field': return b.multiline ? 130 : 66;
    case 'timer': return 120;
    case 'group': return 30 + (b.columns === 1 ? b.blocks.reduce((h, x) => h + heightOf(x) + 12, 0) : Math.max(0, ...b.blocks.map(heightOf)) * Math.ceil(b.blocks.length / b.columns));
  }
}

export const CUSTOM = displayKind<CustomState>({
  kind: 'custom',
  label: 'Custom artifact',
  sanitize: sanitizeCustom,
  ops: CUSTOM_OPS,
  readOp: (text, s) => readCustomOp(text, s),
  facts: (s, o) => factsOf(s, o.guarded),
  text: textOf,
  parts: (s): Part[] => allBlocks(s).filter((b) => b.type !== 'group').map((b) => ({ id: b.id, label: nameOf(b) })),
  views,
  size: (s, mode) => {
    if (mode === 'card') return { w: 260, h: 160 };
    if (mode === 'trail') return { w: 200, h: 110 };
    return { w: 640, h: Math.min(1600, 120 + s.blocks.reduce((h, b) => h + heightOf(b) + 14, 0)) };
  },
  shape: (s) => {
    const kinds = [...new Set(allBlocks(s).filter((b) => b.type !== 'group' && b.type !== 'text').map((b) => b.type))];
    return `${allBlocks(s).length} block${allBlocks(s).length === 1 ? '' : 's'}${kinds.length ? ` · ${kinds.join(', ')}` : ''}`;
  },
  // a field holds a paragraph, and its history must read back whole
  argLimits: { count: 12, length: L.field },
});

export const CUSTOM_EXAMPLE = {
  title: 'Pancakes for a crowd',
  about: 'Scale the recipe to how many are eating.',
  blocks: [
    { id: 'servings', type: 'number', label: 'Servings', value: 4, min: 1, max: 24, step: 1, control: 'stepper' },
    {
      id: 'ing',
      type: 'table',
      label: 'Ingredients',
      columns: [
        { id: 'item', label: 'Ingredient', kind: 'text' },
        { id: 'per', label: 'Per serving', kind: 'number', unit: 'g' },
        { id: 'amount', label: 'Amount', kind: 'calc', expr: 'per * servings', unit: 'g', total: true },
      ],
      rows: [{ cells: { item: 'Flour', per: 30 } }, { cells: { item: 'Milk', per: 60 } }, { cells: { item: 'Egg', per: 12 } }],
    },
    { id: 'steps', type: 'list', label: 'Steps', check: true, items: [{ text: 'Whisk the dry ingredients' }, { text: 'Add the milk and eggs' }, { text: 'Cook on a hot pan' }] },
    { id: 'cooked', type: 'progress', label: 'Cooked', of: 'steps' },
  ],
};

export const CUSTOM_META: DisplayMeta = {
  kind: 'custom',
  noun: 'custom artifact',
  handle: 'B',
  about:
    'Anything the other kinds are not — a tracker, a calculator, a timer, a planner of their own, a little tool — built from blocks: text, lists, tables, numbers, formulas, charts, progress, choices, fields, timers and groups. Only when none of the other kinds is what they asked for.',
  called: [{ words: ['custom artifact', 'custom display', 'artifact of my own', 'my own artifact'], view: 'board' }],
  // asked for by what it is, in a request — "make me a habit tracker", "build a grade calculator" —
  // never "I want to make a tracker" (their own project)
  // (asked for by name — "a custom artifact" — it is read by name, below)
  intents: [
    /^(?!.*\bcustom (?:artifact|display)\b)(?:(?:hey|hi|ok|okay|so|please|pls)\s+)*(?:(?:can|could|would|will)\s+you\s+(?:please\s+)?)?(?:make|build|create|design|set\s+up|put\s+together|give)\s+(?:me\s+|us\s+)?(?:a|an|my|our)\s+(?:[a-z0-9]+\s+){0,4}?(?:tracker|calculator|counter|timer|countdown|widget|logger|log|scorecard|converter|estimator)\b/,
  ],
  prompts: ['Make me a habit tracker for exercise, reading and sleep this week', 'Make a recipe scaler for pancakes with a servings control', 'Build a grade calculator for my four assignments'],
  spec: `{"title": "short", "about": "one line: what it is for", "blocks": [ …blocks, in order… ]}
  A block is one of these (each has a short "id" — a letter, then letters, digits or _ — that formulas name):
  {"type": "text", "text": "…", "size": "title|heading|body|note"}
  {"type": "list", "label": "…", "check": true, "items": [{"text": "…", "done": false}]} — a checklist when check is true
  {"type": "table", "label": "…", "columns": [{"id": "c1", "label": "…", "kind": "text|number|check|calc", "expr": "calc only: a formula over this row's column ids and number ids", "unit": "…", "total": true}], "rows": [{"cells": {"c1": "…"}}]}
  {"type": "number", "label": "…", "value": 4, "min": 1, "max": 24, "step": 1, "unit": "…", "control": "slider|stepper|field"} — something they set
  {"type": "value", "label": "…", "expr": "a formula", "unit": "…", "decimals": 2} — worked out live, never typed
  {"type": "chart", "label": "…", "chart": "bar|line|pie", "table": "<table id>", "x": "<label column id>", "y": "<number or calc column id>"}
  {"type": "progress", "label": "…", "of": "<list or table id>"} or {"type": "progress", "label": "…", "expr": "a formula", "max": 100}
  {"type": "choice", "label": "…", "options": ["…", "…"], "multi": false}
  {"type": "field", "label": "…", "multiline": true, "placeholder": "…"} — for them to write in
  {"type": "timer", "label": "…", "seconds": 1500}
  {"type": "group", "label": "…", "columns": 2, "blocks": [ …blocks, not groups… ]}
  Formulas: numbers, + - * / ^ % ( ), comparisons, the ids of numbers and values, <table id>.<column id> (a column, for sum, avg, min, max, count), <list id>.done and <list id>.total, round(x, n), floor, ceil, abs, sqrt, pow, clamp, if(a > b, x, y).
  Build what they described, with the parts it needs and nothing more (40 blocks at most). Their own words and numbers go in as given; what they did not give is left empty for them to fill, never made up.`,
  example: CUSTOM_EXAMPLE,
  tell: (guarded) =>
    `A CUSTOM ARTIFACT's values, calc cells, totals and progress are worked out from its formulas — use them, never your own arithmetic. What the person set or wrote in it is theirs.${guarded ? ' A choice with an answer is theirs to work out: never say which option is right.' : ''}`,
};

register(CUSTOM);
registerDisplay(CUSTOM_META);
