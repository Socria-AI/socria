// A FUNCTION, as an object of thought — the second kind, and the test that
// lib/objects/core.ts is general rather than a matrix in disguise.
//
// The state is an expression with its parameters and the window it is looked
// at through. The operations are the things a person does to a function while
// thinking about it: change a parameter, look at a point, look somewhere else.
// The curve is a VIEW of the state, sampled by code from the expression
// (lib/logos-math.ts compiles it); nothing about it is drawn from a
// description.
//
// PURE.

import { compileExpr, freeNames } from '@/lib/logos-math';
import { register, type ObjectKind } from './core';

export interface FunctionState {
  /** the right-hand side, as written: "a*x^2 - 3x + b" */
  expr: string;
  /** the variable */
  v: string;
  /** every other letter in it, with its current value */
  params: Record<string, number>;
  lo: number;
  hi: number;
  /** a point being looked at, on the variable's axis */
  x0?: number;
}

const MAX_PARAMS = 4;
const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
const fmt = (v: number) => {
  if (!Number.isFinite(v)) return 'undefined';
  const a = Math.abs(v);
  return (a !== 0 && (a < 1e-3 || a >= 1e6) ? v.toExponential(3) : String(r6(v))).replace(/^-/, '−');
};

export function compileState(s: FunctionState): ((x: number) => number) | null {
  const c = compileExpr(s.expr, [s.v, ...Object.keys(s.params)]);
  if (!c || !c.vars.includes(s.v)) return null;
  return (x: number) => c.eval({ ...s.params, [s.v]: x });
}

export function sanitizeFunction(raw: unknown): FunctionState | null {
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r.expr !== 'string' || r.expr.length > 200) return null;
  const v = typeof r.v === 'string' && /^[a-z]$/.test(r.v) ? r.v : 'x';
  const names = freeNames(r.expr).filter((n) => n !== v);
  if (names.length > MAX_PARAMS || names.some((n) => n.length !== 1)) return null;
  const params: Record<string, number> = {};
  for (const n of names) {
    const val = (r.params as Record<string, unknown> | undefined)?.[n];
    params[n] = fin(val) && Math.abs(val) < 1e6 ? r6(val) : 1;
  }
  const lo = fin(r.lo) ? r.lo : -6;
  const hi = fin(r.hi) ? r.hi : 6;
  if (!(lo < hi) || hi - lo > 1e6) return null;
  const s: FunctionState = { expr: r.expr.trim(), v, params, lo: r6(lo), hi: r6(hi), ...(fin(r.x0) && r.x0 >= lo && r.x0 <= hi ? { x0: r6(r.x0) } : {}) };
  const f = compileState(s);
  if (!f) return null;
  // it has to be a curve somewhere in its window
  let ok = false;
  for (let i = 0; i <= 24 && !ok; i++) ok = Number.isFinite(f(lo + ((hi - lo) * i) / 24));
  return ok ? s : null;
}

const sameFn = (a: FunctionState, b: FunctionState) => JSON.stringify(a) === JSON.stringify(b);

/** The lowest and highest points the curve reaches in its window, sampled. */
export function extremes(s: FunctionState, n = 400): { min: [number, number]; max: [number, number] } | null {
  const f = compileState(s);
  if (!f) return null;
  let min: [number, number] | null = null, max: [number, number] | null = null;
  for (let i = 0; i <= n; i++) {
    const x = s.lo + ((s.hi - s.lo) * i) / n;
    const y = f(x);
    if (!Number.isFinite(y)) continue;
    if (!min || y < min[1]) min = [x, y];
    if (!max || y > max[1]) max = [x, y];
  }
  return min && max ? { min, max } : null;
}

/** The slope at a point by a central difference — and said to be an estimate. */
export function slopeAt(s: FunctionState, x: number): number | null {
  const f = compileState(s);
  if (!f) return null;
  const h = Math.max(1e-6, Math.abs(x) * 1e-6);
  const d = (f(x + h) - f(x - h)) / (2 * h);
  return Number.isFinite(d) ? d : null;
}

export function readFunctionOp(text: string, s: FunctionState): { op: string; args: Record<string, string | number> } | null {
  if (typeof text !== 'string' || text.length > 160 || /\?\s*$/.test(text)) return null;
  const t = text.replace(/[−–]/g, '-').trim().replace(/[.!]+$/, '');
  const names = Object.keys(s.params);
  let m = /^(?:let\s+|set\s+|make\s+|try\s+)?([a-z])\s*(?:=|to|be)\s*(-?\d+(?:\.\d+)?)\s*$/i.exec(t) ??
    /^(?:set|make|change)\s+([a-z])\s+(?:to|=)\s*(-?\d+(?:\.\d+)?)$/i.exec(t);
  if (m && names.includes(m[1])) return { op: 'param', args: { name: m[1], value: Number(m[2]) } };
  m = new RegExp(`^(?:look at|at|inspect|what about)\\s+${s.v}\\s*=\\s*(-?\\d+(?:\\.\\d+)?)$`, 'i').exec(t);
  if (m) return { op: 'point', args: { x: Number(m[1]) } };
  m = /^(?:show|zoom to|window|domain|from)\s+(-?\d+(?:\.\d+)?)\s*(?:to|\.\.|,)\s*(-?\d+(?:\.\d+)?)$/i.exec(t);
  if (m) return { op: 'domain', args: { lo: Number(m[1]), hi: Number(m[2]) } };
  return null;
}

/** Functions written in a message: "f(x) = x^2 - 3x + 2". */
export function findFunctions(text: string): { name: string; state: FunctionState; index: number }[] {
  const out: { name: string; state: FunctionState; index: number }[] = [];
  if (typeof text !== 'string') return out;
  for (const m of text.matchAll(/\b([a-zA-Z])\s*\(\s*([a-z])\s*\)\s*=\s*([^\n;,]{1,120})/g)) {
    // the expression is the longest run of words that reads as one —
    // "a*x^2 - 3x + 2 — where does it go flat?" is the first five tokens
    const words = m[3].replace(/\$/g, '').split(/\s+/).filter(Boolean).slice(0, 30);
    for (let k = words.length; k >= 1; k--) {
      const expr = words.slice(0, k).join(' ').replace(/[.,;:!?]+$/, '');
      if (!expr || /[—–]|\b(where|when|what|how|and|is|the)\b/i.test(expr)) continue;
      const state = sanitizeFunction({ expr, v: m[2] });
      if (state) {
        out.push({ name: m[1], state, index: m.index ?? 0 });
        break;
      }
    }
  }
  return out;
}

export const FUNCTION: ObjectKind<FunctionState> = {
  kind: 'function',
  label: 'Function',
  sanitize: sanitizeFunction,
  same: sameFn,
  ops: {
    param: {
      label: 'Change a parameter',
      check: (s, a) =>
        !(String(a.name) in s.params)
          ? `There is no parameter ${a.name} in it.`
          : !fin(Number(a.value)) || Math.abs(Number(a.value)) >= 1e6
            ? 'That value is not a number I can use.'
            : s.params[String(a.name)] === Number(a.value)
              ? `${a.name} is already ${a.value}.`
              : null,
      apply: (s, a) => ({ ...s, params: { ...s.params, [String(a.name)]: r6(Number(a.value)) } }),
      say: (a) => `${a.name} = ${fmt(Number(a.value))}`,
    },
    point: {
      label: 'Look at a point',
      check: (s, a) => {
        const x = Number(a.x);
        if (!fin(x)) return 'That is not a point I can find.';
        if (x < s.lo || x > s.hi) return `${s.v} = ${fmt(x)} is outside the window (${fmt(s.lo)} to ${fmt(s.hi)}).`;
        const f = compileState(s);
        return f && !Number.isFinite(f(x)) ? `The function is not defined at ${s.v} = ${fmt(x)}.` : null;
      },
      apply: (s, a) => ({ ...s, x0: r6(Number(a.x)) }),
      say: (a) => `look at x = ${fmt(Number(a.x))}`,
    },
    domain: {
      label: 'Look somewhere else',
      check: (_s, a) => (!(Number(a.lo) < Number(a.hi)) || Number(a.hi) - Number(a.lo) > 1e6 ? 'The window has to run from a smaller number to a larger one.' : null),
      apply: (s, a) => {
        const lo = r6(Number(a.lo)), hi = r6(Number(a.hi));
        return { ...s, lo, hi, ...(s.x0 !== undefined && s.x0 >= lo && s.x0 <= hi ? {} : { x0: undefined }) };
      },
      say: (a) => `window ${fmt(Number(a.lo))} to ${fmt(Number(a.hi))}`,
    },
  },
  readOp: readFunctionOp,
  consequence(before, after, step) {
    const f = compileState(after);
    if (step.op === 'point' && f && after.x0 !== undefined) return `${after.v} = ${fmt(after.x0)} gives ${fmt(f(after.x0))}.`;
    if (step.op === 'param') {
      const a = extremes(before), b = extremes(after);
      const parts: string[] = [];
      if (after.x0 !== undefined && f) {
        const g = compileState(before)!;
        parts.push(`At ${after.v} = ${fmt(after.x0)} it went from ${fmt(g(after.x0))} to ${fmt(f(after.x0))}.`);
      }
      if (a && b && (Math.abs(a.min[0] - b.min[0]) > 1e-9 || Math.abs(a.min[1] - b.min[1]) > 1e-9))
        parts.push(`Its lowest point in view moved from about (${fmt(a.min[0])}, ${fmt(a.min[1])}) to about (${fmt(b.min[0])}, ${fmt(b.min[1])}).`);
      return parts.join(' ') || 'The curve changed.';
    }
    return null;
  },
  facts(s, { guarded }) {
    const f = compileState(s);
    const ps = Object.entries(s.params).map(([k, v]) => `${k} = ${fmt(v)}`).join(', ');
    const out = [`${s.v} from ${fmt(s.lo)} to ${fmt(s.hi)}${ps ? `; ${ps}` : ''}`];
    if (f && s.x0 !== undefined) {
      out.push(`looking at ${s.v} = ${fmt(s.x0)}, where it is ${fmt(f(s.x0))}`);
      const d = slopeAt(s, s.x0);
      if (d !== null) out.push(`${guarded ? 'For you to ask about, not to state: ' : ''}the slope there is about ${fmt(d)} (estimated numerically)`);
    }
    return out;
  },
  text: (s) => `${s.v} ↦ ${s.expr}`,
  parts(s) {
    return [
      { id: 'eq', label: 'The expression' },
      ...Object.keys(s.params).map((p) => ({ id: `p:${p}`, label: `Parameter ${p}` })),
      ...(s.x0 !== undefined ? [{ id: 'pt', label: `The point ${s.v} = ${fmt(s.x0)}` }] : []),
    ];
  },
  partFacts(s, part) {
    if (part === 'eq') return [`${s.expr}`];
    if (part.startsWith('p:')) {
      const p = part.slice(2);
      return p in s.params ? [`${p} = ${fmt(s.params[p])}`, 'a parameter: change it and the curve follows'] : null;
    }
    if (part === 'pt' && s.x0 !== undefined) {
      const f = compileState(s);
      return f ? [`(${fmt(s.x0)}, ${fmt(f(s.x0))})`] : null;
    }
    return null;
  },
  views: [
    { id: 'graph', label: 'Graph', shows: 'the curve, sampled from the expression', primary: true, interactions: ['pick a point', 'change a parameter', 'move the window'] },
    { id: 'equation', label: 'Expression', shows: 'the expression with its parameters', interactions: ['select a parameter'] },
    { id: 'table', label: 'Table', shows: 'values at evenly spaced points', interactions: [] },
  ],
  size(_s, mode) {
    if (mode === 'live') return { w: 380, h: 372 };
    if (mode === 'trail') return { w: 190, h: 128 };
    return { w: 168, h: 96 };
  },
  shape: (s) => `function of ${s.v}`,
};

register(FUNCTION);
