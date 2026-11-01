// lib/inline-math.ts — THE ARITHMETIC OF THE CONVERSATION'S LIVE ELEMENTS.
//
// A graph the person can change, a small simulation, a question with an
// answer to check (lib/inline-ui.ts): everything they show is computed here,
// from the formula the reply wrote, by the math engine's own parser
// (lib/logos-math.ts compileExpr — no eval). Nothing a reply asserts is drawn
// as a result: a turning point is found on the curve, a range is evaluated, an
// answer is worked out from its formula and compared with what was typed.
//
// Also the expression as it is read: a formula written for the engine
// ("a*x^2 + b*x + c") laid out as maths, its parameters marked so a renderer
// can make them the numbers the person drags.
//
// Pure: no React, no DOM, no clock.

import { compileExpr, samplePlot, type CompiledExpr } from './logos-math';

export interface Pt {
  x: number;
  /** NaN where the pen lifts */
  y: number;
}

/** An expression over x and the named parameters, compiled once; null when the engine cannot read it. */
export function compileOver(expr: string, names: readonly string[]): CompiledExpr | null {
  return compileExpr(expr, ['x', ...names]);
}

/**
 * A curve sampled across a window, with the pen lifted across jumps and poles
 * (lib/logos-math.ts samplePlot), and the window's sensible height for it.
 */
export function sampleCurve(c: CompiledExpr, values: Readonly<Record<string, number>>, x0: number, x1: number, n = 320): { pts: Pt[]; yMin: number; yMax: number } | null {
  const fn = { varName: 'x', eval: (x: number) => c.eval({ ...values, x }) };
  const d = samplePlot(fn, x0, x1, n);
  if (!d) return null;
  return { pts: d.samples.map((s) => ({ x: s.x, y: s.y })), yMin: d.yMin, yMax: d.yMax };
}

export interface Feature {
  kind: 'turning' | 'root' | 'intercept';
  x: number;
  y: number;
  /** a turning point at the top of a hill, not the bottom of a valley */
  max?: boolean;
}

const GOLD = (Math.sqrt(5) - 1) / 2;
/** The x of the lowest (or highest) point of f on [a, b], by golden-section search. */
function extremum(f: (x: number) => number, a: number, b: number, max: boolean): number {
  const g = max ? (x: number) => -f(x) : f;
  let lo = a, hi = b;
  let c = hi - GOLD * (hi - lo);
  let d = lo + GOLD * (hi - lo);
  for (let i = 0; i < 60; i++) {
    if (g(c) < g(d)) hi = d;
    else lo = c;
    c = hi - GOLD * (hi - lo);
    d = lo + GOLD * (hi - lo);
  }
  return (lo + hi) / 2;
}
/** Where f crosses zero on [a, b] (signs differ at the ends), by bisection. */
function root(f: (x: number) => number, a: number, b: number): number {
  let lo = a, hi = b;
  let flo = f(lo);
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const fm = f(mid);
    if (fm === 0) return mid;
    if ((fm < 0) === (flo < 0)) {
      lo = mid;
      flo = fm;
    } else hi = mid;
  }
  return (lo + hi) / 2;
}
/** A value as the label shows it, without the float's dust: 0.30000000000000004 is 0.3, −0.0000001 is 0. */
const tidy = (v: number) => (Math.abs(v) < 1e-9 ? 0 : Math.round(v * 1e6) / 1e6);

/**
 * What is worth marking on a curve, found on the curve itself: its turning
 * points (where it stops falling and starts rising, or the reverse), where it
 * crosses zero, and where it meets the y-axis. A few of each at most; none on
 * a line that has none, and none across a pole.
 */
export function curveFeatures(c: CompiledExpr, values: Readonly<Record<string, number>>, x0: number, x1: number, kinds: readonly Feature['kind'][] = ['turning', 'root', 'intercept']): Feature[] {
  const f = (x: number) => c.eval({ ...values, x });
  const N = 400;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i <= N; i++) {
    const x = x0 + ((x1 - x0) * i) / N;
    xs.push(x);
    ys.push(f(x));
  }
  const finite = ys.filter(Number.isFinite);
  if (finite.length < 8) return [];
  const span = Math.max(...finite) - Math.min(...finite);
  const out: Feature[] = [];
  if (kinds.includes('turning') && span > 1e-9) {
    const turning: Feature[] = [];
    for (let i = 1; i < N && turning.length < 3; i++) {
      const [a, b, d] = [ys[i - 1], ys[i], ys[i + 1]];
      if (![a, b, d].every(Number.isFinite)) continue;
      const max = b > a && b >= d;
      const min = b < a && b <= d;
      if (!max && !min) continue;
      // a kink in noise is not a hill: it must stand out from what is around it
      const lo = Math.max(0, i - 6), hi = Math.min(N, i + 6);
      const around = ys.slice(lo, hi + 1).filter(Number.isFinite);
      const rise = max ? b - Math.min(...around) : Math.max(...around) - b;
      if (rise < span * 1e-4) continue;
      const x = extremum(f, xs[i - 1], xs[i + 1], max);
      const y = f(x);
      if (Number.isFinite(y)) turning.push({ kind: 'turning', x: tidy(x), y: tidy(y), ...(max ? { max: true } : {}) });
    }
    out.push(...turning);
  }
  if (kinds.includes('root')) {
    let found = 0;
    for (let i = 0; i < N && found < 4; i++) {
      const [a, b] = [ys[i], ys[i + 1]];
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      if (a === 0) {
        out.push({ kind: 'root', x: tidy(xs[i]), y: 0 });
        found++;
        continue;
      }
      // a sign change across a pole (1/x) is not a crossing: its sides are far apart
      if ((a < 0) !== (b < 0) && b !== 0 && Math.abs(a - b) < span / 4) {
        out.push({ kind: 'root', x: tidy(root(f, xs[i], xs[i + 1])), y: 0 });
        found++;
      }
    }
  }
  if (kinds.includes('intercept') && x0 <= 0 && 0 <= x1) {
    const y = f(0);
    if (Number.isFinite(y) && !out.some((p) => p.x === 0 && p.y === tidy(y))) out.push({ kind: 'intercept', x: 0, y: tidy(y) });
  }
  return out;
}

/**
 * The height of a graph's window, chosen around what matters on it: its
 * turning points, where it crosses zero and meets the y-axis, with room
 * around them — not the full sweep of a curve whose arms run off to 25 while
 * the turn happens at −2. With nothing marked, the curve's own robust range.
 */
export function fitWindow(c: CompiledExpr, values: readonly Readonly<Record<string, number>>[], x0: number, x1: number): [number, number] {
  const pts = values.flatMap((v) => curveFeatures(c, v, x0, x1));
  if (pts.length) {
    const lo = Math.min(...pts.map((p) => p.y), 0);
    const hi = Math.max(...pts.map((p) => p.y), 0);
    const span = Math.max(hi - lo, 4);
    return [tidy(lo - span * 0.5), tidy(hi + span * 0.5)];
  }
  const s = sampleCurve(c, values[0] ?? {}, x0, x1, 200);
  return s ? [s.yMin, s.yMax] : [-10, 10];
}

/** A number as the conversation writes it: a true minus, a few digits, no trailing zeros. */
export function fmtVal(v: number, digits?: number): string {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  const d = digits ?? (a >= 100 ? 0 : a >= 10 ? 1 : 2);
  let s = (Math.round(a * 10 ** d) / 10 ** d).toFixed(d);
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  if (s === '0') return '0';
  return v < 0 ? `−${s}` : s;
}
export const fmtPoint = (p: { x: number; y: number }) => `(${fmtVal(p.x)}, ${fmtVal(p.y)})`;

// ── a simulation: a path traced over time ────────────────────────────

/** A simulation's formula over time t and its parameters, compiled once. */
export function compileOverT(expr: string, names: readonly string[]): CompiledExpr | null {
  return compileExpr(expr, ['t', ...names]);
}

/** The path (x(t), y(t)) for t across [t0, t1], with the pen lifted where either is undefined. */
export function samplePath(cx: CompiledExpr, cy: CompiledExpr, values: Readonly<Record<string, number>>, t0: number, t1: number, n = 160): Pt[] {
  const pts: Pt[] = [];
  if (!(t1 > t0) || !Number.isFinite(t0) || !Number.isFinite(t1)) return pts;
  for (let i = 0; i <= n; i++) {
    const t = t0 + ((t1 - t0) * i) / n;
    const scope = { ...values, t };
    const x = cx.eval(scope);
    const y = cy.eval(scope);
    pts.push(Number.isFinite(x) && Number.isFinite(y) ? { x, y } : { x: NaN, y: NaN });
  }
  return pts;
}

/** An end of a simulation's time, given as a number or as a formula over its parameters ("2*v*sin(a)/9.8"). */
export function timeAt(v: number | string, names: readonly string[], values: Readonly<Record<string, number>>): number {
  if (typeof v === 'number') return v;
  const c = compileExpr(v, [...names]);
  return c ? c.eval({ ...values }) : NaN;
}

// ── a question with an answer to check ───────────────────────────────

/**
 * What was typed, read as a number: "2", "−2", "1/2", "2.5", "3e2", "−(−8)/(2·2)".
 * Only arithmetic — no names — so a typed "x = 2" reads as 2 and "two" as nothing.
 */
export function readTyped(typed: string): number | null {
  const s = typed.trim().replace(/^[a-zA-Z]\w*\s*=\s*/, '');
  if (!s || s.length > 60) return null;
  const c = compileExpr(s, []);
  if (!c || c.vars.length) return null;
  const v = c.eval({});
  return Number.isFinite(v) ? v : null;
}

/** The answer a question holds, worked out from its formula — never a number a reply asserted. */
export function answerOf(formula: string): number | null {
  const c = compileExpr(formula, []);
  if (!c || c.vars.length) return null;
  const v = c.eval({});
  return Number.isFinite(v) ? v : null;
}

/**
 * Is what they typed the answer? Within the question's own tolerance, or by
 * default within half a percent (so 1.41 is √2 and 0.33 is a third) — and a
 * zero answer within a few thousandths.
 */
export function checkTyped(formula: string, typed: string, tolerance?: number): { answer: number | null; got: number | null; right: boolean } {
  const answer = answerOf(formula);
  const got = readTyped(typed);
  if (answer === null || got === null) return { answer, got, right: false };
  const tol = tolerance !== undefined && tolerance >= 0 ? tolerance : Math.max(0.005 * Math.abs(answer), 0.0005);
  return { answer, got, right: Math.abs(got - answer) <= tol + 1e-12 };
}

// ── a formula, read as maths ─────────────────────────────────────────

export type Seg =
  | { k: 'num'; v: string }
  | { k: 'var'; v: string }
  | { k: 'param'; v: string }
  | { k: 'fn'; v: string }
  | { k: 'op'; v: string; unary?: boolean }
  | { k: 'sup'; s: Seg[] };

const FNS = new Set(['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh', 'sqrt', 'log', 'ln', 'exp', 'abs', 'floor', 'ceil', 'min', 'max', 'sec', 'csc', 'cot']);
const GREEK: Record<string, string> = { alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', theta: 'θ', lambda: 'λ', mu: 'μ', omega: 'ω', phi: 'φ', sigma: 'σ', tau: 'τ', rho: 'ρ', pi: 'π' };

type Tok = { t: 'num' | 'name' | 'op'; v: string };
function tokens(expr: string): Tok[] | null {
  const s = expr
    .replace(/^\s*[a-zA-Z]\w*\s*(\([^)]*\))?\s*=\s*/, '')
    .replace(/[−–—]/g, '-')
    .replace(/\*\*/g, '^')
    .replace(/[×·⋅]/g, '*');
  const out: Tok[] = [];
  const re = /\s*(?:(\d+(?:\.\d+)?|\.\d+)|([A-Za-z_][A-Za-z0-9_]*)|([-+*/^(),]))/y;
  let i = 0;
  while (i < s.length) {
    if (/\s/.test(s[i])) {
      i++;
      continue;
    }
    re.lastIndex = i;
    const m = re.exec(s);
    if (!m) return null;
    out.push(m[1] ? { t: 'num', v: m[1] } : m[2] ? { t: 'name', v: m[2] } : { t: 'op', v: m[3] });
    i = re.lastIndex;
  }
  return out.length ? out : null;
}

/**
 * A formula laid out as maths: implicit multiplication where a reader expects
 * it ("4x", "a(x − h)"), a raised dot where two numbers meet, true minus signs,
 * exponents raised, Greek names as letters — and each parameter marked, so a
 * renderer can draw it as the number it stands for. Null for anything this
 * reading does not understand (the renderer falls back to the formula as written).
 */
export function prettyExpr(expr: string, params: readonly string[]): Seg[] | null {
  const toks = tokens(expr);
  if (!toks || toks.length > 120) return null;
  const isParam = (v: string) => params.includes(v.toLowerCase());
  const isOp = (tk: Tok | undefined, v: string) => !!tk && tk.t === 'op' && tk.v === v;
  const kindOf = (tk: Tok): Seg['k'] => (tk.t === 'num' ? 'num' : tk.t === 'name' ? (isParam(tk.v) ? 'param' : FNS.has(tk.v.toLowerCase()) ? 'fn' : 'var') : 'op');
  const leaf = (tk: Tok): Seg => {
    if (tk.t === 'num') return { k: 'num', v: tk.v };
    if (tk.t === 'name') {
      const low = tk.v.toLowerCase();
      if (isParam(low)) return { k: 'param', v: low };
      if (FNS.has(low)) return { k: 'fn', v: low === 'sqrt' ? '√' : low };
      return { k: 'var', v: GREEK[low] ?? tk.v };
    }
    return { k: 'op', v: tk.v };
  };
  // a sequence of tokens laid out; null for anything malformed (an unclosed group, a dangling operator)
  const seq = (list: Tok[]): Seg[] | null => {
    // one primary, from position k: a number, a name, a group (parentheses dropped — it is read as an exponent),
    // a function and its group, or a minus and one of those
    const primaryAt = (k: number): { segs: Seg[]; next: number } | null => {
      const tk = list[k];
      if (!tk) return null;
      if (isOp(tk, '-')) {
        const p = primaryAt(k + 1);
        return p ? { segs: [{ k: 'op', v: '−', unary: true }, ...p.segs], next: p.next } : null;
      }
      if (isOp(tk, '(')) {
        let depth = 0;
        let m = k;
        for (; m < list.length; m++) {
          if (isOp(list[m], '(')) depth++;
          else if (isOp(list[m], ')') && --depth === 0) break;
        }
        if (depth !== 0 || m >= list.length) return null;
        const inner = seq(list.slice(k + 1, m));
        return inner ? { segs: inner, next: m + 1 } : null;
      }
      if (tk.t === 'name' && FNS.has(tk.v.toLowerCase()) && isOp(list[k + 1], '(')) {
        const g = primaryAt(k + 1);
        return g ? { segs: [leaf(tk), { k: 'op', v: '(' }, ...g.segs, { k: 'op', v: ')' }], next: g.next } : null;
      }
      if (tk.t === 'op') return null;
      return { segs: [leaf(tk)], next: k + 1 };
    };
    const out: Seg[] = [];
    let j = 0;
    let depth = 0;
    while (j < list.length) {
      const tk = list[j];
      if (isOp(tk, '^')) {
        const p = primaryAt(j + 1);
        if (!p || !out.length) return null;
        out.push({ k: 'sup', s: p.segs });
        j = p.next;
        continue;
      }
      if (isOp(tk, '*')) {
        const prev = out[out.length - 1];
        const next = list[j + 1];
        if (!next || !prev) return null;
        const nk = kindOf(next);
        const pk = prev.k;
        // "4x", "a(x − h)", "b sin x" sit together; two numbers, or a number and a parameter, take a dot
        const together = nk === 'var' || nk === 'fn' || isOp(next, '(') || (nk === 'param' && pk !== 'num' && pk !== 'param' && pk !== 'sup');
        if (!together) out.push({ k: 'op', v: '·' });
        j++;
        continue;
      }
      if (isOp(tk, '-') || isOp(tk, '+')) {
        const prev = out[out.length - 1];
        const unary = !prev || (prev.k === 'op' && (prev.v === '(' || prev.v === ',' || !!prev.unary || ['+', '−', '·', '/'].includes(prev.v)));
        out.push({ k: 'op', v: tk.v === '-' ? '−' : '+', ...(unary ? { unary: true } : {}) });
        j++;
        continue;
      }
      if (isOp(tk, '(')) depth++;
      if (isOp(tk, ')') && --depth < 0) return null;
      out.push(leaf(tk));
      j++;
    }
    if (depth !== 0) return null;
    const last = out[out.length - 1];
    if (last && last.k === 'op' && last.v !== ')') return null;
    return out;
  };
  const segs = seq(toks);
  return segs && segs.length ? segs : null;
}

/** A formula's parameters as the person set them, written into it: "a*x^2 + b*x" with a = 1, b = −4 reads "x² − 4x". */
export function exprWithValues(expr: string, values0: Readonly<Record<string, number>>): string {
  const values = Object.fromEntries(Object.entries(values0).map(([k, v]) => [k.toLowerCase(), v]));
  const segs = prettyExpr(expr, Object.keys(values));
  if (!segs) return expr;
  const say = (list: Seg[]): string => {
    let s = '';
    list.forEach((g, idx) => {
      if (g.k === 'sup') {
        const inner = say(g.s);
        s += /^\d+$/.test(inner) ? inner.replace(/[0-9]/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(d)]) : /^[A-Za-zα-ω]+$/.test(inner) ? `^${inner}` : `^(${inner})`;
        return;
      }
      if (g.k === 'param') {
        const v = values[g.v] ?? NaN;
        const prev = list[idx - 1];
        const next = list[idx + 1];
        // a term that is zero is not written: "x² + 0" is "x²"
        const additive = (g2: Seg | undefined) => !!g2 && g2.k === 'op' && !g2.unary && (g2.v === '+' || g2.v === '−');
        if (v === 0 && additive(prev) && (!next || additive(next))) {
          s = s.replace(/ [+−] $/, '');
          return;
        }
        // a coefficient of one is not written: "1x²" is "x²", "−1x" is "−x"
        const multiplies = !!next && (next.k === 'var' || next.k === 'fn' || (next.k === 'op' && next.v === '('));
        if (multiplies && Math.abs(v) === 1) {
          if (v < 0) {
            if (prev && prev.k === 'op' && !prev.unary && (prev.v === '+' || prev.v === '−')) s = s.replace(/ [+−] $/, prev.v === '+' ? ' − ' : ' + ');
            else s += '−';
          }
          return;
        }
        if (prev && prev.k === 'op' && !prev.unary && (prev.v === '+' || prev.v === '−') && v < 0) {
          s = s.replace(/ [+−] $/, prev.v === '+' ? ' − ' : ' + ');
          s += fmtVal(-v);
          return;
        }
        s += fmtVal(v);
        return;
      }
      if (g.k === 'op') s += g.unary ? g.v : g.v === '+' || g.v === '−' ? ` ${g.v} ` : g.v;
      else s += g.v;
    });
    return s;
  };
  return say(segs);
}
