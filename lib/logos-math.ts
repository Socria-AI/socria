// lib/logos-math.ts
//
// Two things maths needs that prose doesn't: a way to detect and plot a
// function, and the layout for a solution chain. Both are pure.
//
// The expression evaluator is a hand-written shunting-yard parser + RPN
// evaluator — NOT eval(). It only ever produces a number from a whitelisted
// grammar (numbers, one variable, + - * / ^, unary minus, and a fixed set of
// functions/constants), so a hostile string can compute a NaN, never run code.

// ── expression evaluator ────────────────────────────────────────────

type Tok =
  | { t: 'num'; v: number }
  | { t: 'var'; v: string }
  | { t: 'op'; v: string }
  | { t: 'fn'; v: string }
  | { t: 'lp' }
  | { t: 'rp' };

// Null-prototype, and this matters. With a plain object literal, `'constructor'
// in FUNCS` is true, inherited from Object.prototype -- as are toString,
// valueOf, hasOwnProperty and the rest. That made every one of those names
// read as a known function or constant: `freeNames` counted them as bound,
// the tokenizer emitted Object itself as a numeric literal, and
// `FUNCS[name](x)` reached for a prototype method. compileFunction happened to
// survive it, but only because its "does this ever produce a finite number"
// check threw the results away afterwards. Removing the prototype fixes the
// lookup, the membership test, and the name census in one move.
const FUNCS: Record<string, (x: number) => number> = Object.assign(Object.create(null), {
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  ln: Math.log, log: (x: number) => Math.log10(x), log2: Math.log2,
  sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs,
  exp: Math.exp, sign: Math.sign, floor: Math.floor, ceil: Math.ceil, round: Math.round,

  // The other names for the same functions.
  //
  // An unknown name is a HARD failure — the expression does not compile and
  // the curve simply is not drawn — so every spelling a model might
  // reasonably reach for is a curve that silently vanishes. arcsin is as
  // common as asin in written mathematics, log10 is what a chemist types,
  // and the reciprocal trig functions have no other spelling at all.
  arcsin: Math.asin, arccos: Math.acos, arctan: Math.atan,
  arcsinh: Math.asinh, arccosh: Math.acosh, arctanh: Math.atanh,
  asinh: Math.asinh, acosh: Math.acosh, atanh: Math.atanh,
  sec: (x: number) => 1 / Math.cos(x),
  csc: (x: number) => 1 / Math.sin(x),
  cot: (x: number) => 1 / Math.tan(x),
  log10: (x: number) => Math.log10(x),
  lg: (x: number) => Math.log10(x),
  // A step, for anything that switches on: a phase change, a threshold, a
  // piecewise definition the grammar has no other way to express.
  step: (x: number) => (x >= 0 ? 1 : 0),
  heaviside: (x: number) => (x >= 0 ? 1 : 0),
});
const CONSTS: Record<string, number> = Object.assign(Object.create(null), {
  pi: Math.PI, e: Math.E, tau: Math.PI * 2,
});
const PREC: Record<string, number> = Object.assign(Object.create(null), {
  '+': 1, '-': 1, '*': 2, '/': 2, '%': 2, '^': 4, 'u-': 3,
});
const RIGHT = new Set(['^', 'u-']);

/**
 * Normalize common human notation into the grammar the tokenizer knows.
 *
 * Everything here exists because the alternative is silence. An expression
 * this does not understand does not compile, and a curve that does not
 * compile is simply absent from the picture — no error, no gap, just a
 * diagram missing the line it was drawn for. So the rule is to accept what a
 * person or a model would actually write, and only then be strict.
 *
 * The typographic minus is the one that matters most. Models emit U+2212 and
 * en dashes constantly, because that is what a minus sign looks like in
 * prose, and "20 − 5*x" was rejected outright while "20 - 5*x" drew fine.
 */
function normalizeExpr(raw: string): string {
  let s = raw.trim();
  // strip a leading "y =" / "f(x) =" so we evaluate the right-hand side
  s = s.replace(/^\s*[a-zA-Z]\w*\s*(\([^)]*\))?\s*=\s*/, '');
  // every dash that is meant as a minus
  s = s.replace(/[\u2212\u2013\u2014\u2010\u2011]/g, '-');
  s = s.replace(/[×·⋅]/g, '*').replace(/[÷∕]/g, '/');
  s = s.replace(/\*\*/g, '^'); // Python's power operator
  s = s.replace(/\\cdot|\\times/g, '*').replace(/\\div/g, '/');
  s = s.replace(/\\left|\\right/g, '');
  s = s.replace(/\\pi/g, 'pi').replace(/\\/g, '');
  s = s.replace(/\bpi\b/gi, 'pi');
  // superscript digits: x² → x^2, and ⁻¹ → ^-1
  s = s.replace(/([⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+)/g, (run) => {
    const body = run.replace(/./g, (ch) => '⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(ch) >= 0
      ? String('⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(ch))
      : (ch === '⁻' ? '-' : ''));
    return body ? `^(${body})` : '';
  });
  // |x| → abs(x). Pairs, left to right; nothing nested, which is how anyone
  // actually writes it.
  s = s.replace(/\|([^|]+)\|/g, 'abs($1)');
  return s;
}

// `vars` is the closed set of names that may appear free. Anything else is
// still a hard failure — an unknown name means we did not understand the
// expression, and guessing is worse than declining to draw it.
function tokenize(src: string, vars: Set<string>): Tok[] | null {
  const toks: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ' ') { i++; continue; }
    if (/[0-9.]/.test(c)) {
      let j = i + 1;
      while (j < src.length && /[0-9.eE]/.test(src[j])) {
        // allow exponent sign
        if ((src[j] === 'e' || src[j] === 'E') && /[+-]/.test(src[j + 1] ?? '')) j++;
        j++;
      }
      const num = Number(src.slice(i, j));
      if (!Number.isFinite(num)) return null;
      toks.push({ t: 'num', v: num });
      i = j;
      continue;
    }
    if (/[a-zA-Z]/.test(c)) {
      let j = i + 1;
      while (j < src.length && /[a-zA-Z0-9]/.test(src[j])) j++;
      const word = src.slice(i, j).toLowerCase();
      if (vars.has(word)) toks.push({ t: 'var', v: word });
      else if (word in CONSTS) toks.push({ t: 'num', v: CONSTS[word] });
      else if (word in FUNCS) toks.push({ t: 'fn', v: word });
      else return null; // an unknown name → not plottable, bail
      i = j;
      continue;
    }
    if ('+-*/%^'.includes(c)) { toks.push({ t: 'op', v: c }); i++; continue; }
    if (c === '(') { toks.push({ t: 'lp' }); i++; continue; }
    if (c === ')') { toks.push({ t: 'rp' }); i++; continue; }
    return null; // anything else (=, <, commas…) → not a single function
  }
  return toks;
}

// Insert an explicit multiply between adjacent operands so "2x", "3x^2",
// "2(x+1)" and "x sin(x)" mean what they look like. Without this the natural
// way to write a coefficient silently fails to evaluate.
function insertImplicitMult(toks: Tok[]): Tok[] {
  const out: Tok[] = [];
  const endsOperand = (t: Tok) => t.t === 'num' || t.t === 'var' || t.t === 'rp';
  const startsOperand = (t: Tok) => t.t === 'num' || t.t === 'var' || t.t === 'fn' || t.t === 'lp';
  for (let i = 0; i < toks.length; i++) {
    out.push(toks[i]);
    const next = toks[i + 1];
    if (next && endsOperand(toks[i]) && startsOperand(next)) out.push({ t: 'op', v: '*' });
  }
  return out;
}

function toRpn(toks: Tok[]): Tok[] | null {
  const out: Tok[] = [];
  const ops: Tok[] = [];
  let prev: Tok | null = null;
  for (let k = 0; k < toks.length; k++) {
    let tk = toks[k];
    // unary minus / plus: an operator with nothing usable before it
    if (tk.t === 'op' && (tk.v === '-' || tk.v === '+')) {
      const unary = !prev || prev.t === 'op' || prev.t === 'lp';
      if (unary) {
        if (tk.v === '+') { prev = tk; continue; }
        tk = { t: 'op', v: 'u-' };
      }
    }
    if (tk.t === 'num' || tk.t === 'var') out.push(tk);
    else if (tk.t === 'fn') ops.push(tk);
    else if (tk.t === 'op' && tk.v === 'u-') {
      // prefix operator: applies to what follows, so never pop for it
      ops.push(tk);
    } else if (tk.t === 'op') {
      while (
        ops.length &&
        ops[ops.length - 1].t !== 'lp' &&
        (ops[ops.length - 1].t === 'fn' ||
          (PREC[(ops[ops.length - 1] as any).v] > PREC[tk.v] ||
            (PREC[(ops[ops.length - 1] as any).v] === PREC[tk.v] && !RIGHT.has(tk.v))))
      ) {
        out.push(ops.pop()!);
      }
      ops.push(tk);
    } else if (tk.t === 'lp') ops.push(tk);
    else if (tk.t === 'rp') {
      while (ops.length && ops[ops.length - 1].t !== 'lp') out.push(ops.pop()!);
      if (!ops.length) return null; // mismatched )
      ops.pop();
      if (ops.length && ops[ops.length - 1].t === 'fn') out.push(ops.pop()!);
    }
    prev = tk;
  }
  while (ops.length) {
    const o = ops.pop()!;
    if (o.t === 'lp') return null; // mismatched (
    out.push(o);
  }
  return out;
}

export interface CompiledFn {
  varName: string;
  eval: (x: number) => number;
}

/** A compiled expression over a named scope — the general form. */
export interface CompiledExpr {
  /** every free name the expression actually referenced */
  vars: string[];
  eval: (scope: Record<string, number>) => number;
}

/** The free single-letter names in an expression, minus functions/constants. */
export function freeNames(raw: string): string[] {
  const rhs = raw.replace(/^\s*[a-zA-Z]\w*\s*(\([^)]*\))?\s*=\s*/, '');
  const words = (rhs.toLowerCase().match(/[a-z][a-z0-9]*/g) ?? []).filter(
    (w) => !(w in FUNCS) && !(w in CONSTS)
  );
  return [...new Set(words)];
}

/**
 * Compile an expression over a declared set of variables.
 *
 * This is the general form the single-variable `compileFunction` is built on.
 * Parameterised visualisations need it: "a*x^2 + b" is one expression whose
 * meaning depends on which of its names are being swept and which are held.
 *
 * Names outside `varNames` still fail rather than defaulting to zero — an
 * expression we only half understand should not be drawn as if we understood
 * it. Undefined names at eval time give NaN, which the renderers already treat
 * as "no point here".
 */
export function compileExpr(raw: string, varNames: string[]): CompiledExpr | null {
  if (typeof raw !== 'string' || raw.length > 400) return null;
  const allowed = new Set(varNames.map((v) => v.toLowerCase()));
  const toks0 = tokenize(normalizeExpr(raw), allowed);
  if (!toks0 || !toks0.length) return null;
  const toks = insertImplicitMult(toks0);
  const rpn = toRpn(toks);
  if (!rpn) return null;
  const used = [...new Set(rpn.filter((t) => t.t === 'var').map((t) => (t as any).v as string))];

  const evaluate = (scope: Record<string, number>): number => {
    const st: number[] = [];
    for (const tk of rpn) {
      if (tk.t === 'num') st.push(tk.v);
      else if (tk.t === 'var') {
        const val = scope[tk.v];
        st.push(typeof val === 'number' ? val : NaN);
      } else if (tk.t === 'fn') {
        const a = st.pop();
        if (a === undefined) return NaN;
        st.push(FUNCS[tk.v](a));
      } else if (tk.t === 'op') {
        if (tk.v === 'u-') {
          const a = st.pop();
          if (a === undefined) return NaN;
          st.push(-a);
          continue;
        }
        const b = st.pop(), a = st.pop();
        if (a === undefined || b === undefined) return NaN;
        st.push(
          tk.v === '+' ? a + b : tk.v === '-' ? a - b : tk.v === '*' ? a * b :
          tk.v === '/' ? a / b : tk.v === '%' ? a % b : Math.pow(a, b)
        );
      }
    }
    return st.length === 1 ? st[0] : NaN;
  };
  return { vars: used, eval: evaluate };
}

/** Compile "y = x^2 - 3" into a numeric function of one variable, or null. */
export function compileFunction(raw: string): CompiledFn | null {
  if (typeof raw !== 'string' || raw.length > 400) return null;
  const letters = freeNames(raw);
  if (letters.length > 1) return null; // more than one free variable -> not a curve
  const varName = letters.length === 1 ? letters[0] : 'x';
  const compiled = compileExpr(raw, [varName]);
  if (!compiled) return null;
  if (!compiled.vars.includes(varName)) return null; // a constant, not a function
  const fn = (x: number) => compiled.eval({ [varName]: x });
  // sanity: it must produce a finite number somewhere in a normal window
  let ok = false;
  for (let x = -6; x <= 6 && !ok; x += 1.5) if (Number.isFinite(fn(x))) ok = true;
  if (!ok) return null;
  return { varName, eval: fn };
}

export interface PlotSample {
  x: number;
  y: number;
}
export interface PlotData {
  samples: PlotSample[];
  varName: string;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

/** Sample a compiled function into points + a sensible viewport, or null. */
export function samplePlot(fn: CompiledFn, xMin = -10, xMax = 10, n = 240): PlotData | null {
  const samples: PlotSample[] = [];
  const ys: number[] = [];
  for (let i = 0; i <= n; i++) {
    const x = xMin + ((xMax - xMin) * i) / n;
    const y = fn.eval(x);
    samples.push({ x, y });
    if (Number.isFinite(y)) ys.push(y);
  }
  if (ys.length < 4) return null;
  ys.sort((a, b) => a - b);
  // robust range: clip to the 2nd–98th percentile so an asymptote doesn't
  // flatten the whole curve, then pad.
  const lo = ys[Math.floor(ys.length * 0.02)];
  const hi = ys[Math.floor(ys.length * 0.98)];
  let yMin = Math.min(lo, 0);
  let yMax = Math.max(hi, 0);
  if (yMax - yMin < 1e-6) { yMin -= 1; yMax += 1; }
  const pad = (yMax - yMin) * 0.08;
  const out = { samples, varName: fn.varName, xMin, xMax, yMin: yMin - pad, yMax: yMax + pad };
  // A function that overflows the float range gives an infinite viewport, which
  // would render NaN SVG coordinates — refuse to plot it rather than break.
  if (!Number.isFinite(out.yMin) || !Number.isFinite(out.yMax)) return null;
  return out;
}

/** Does this node label / tex look like a single-variable function to plot? */
export function plottable(node: { tex?: string; label: string }): CompiledFn | null {
  return compileFunction(node.tex || node.label);
}

// ── Taylor-mode automatic differentiation ───────────────────────────
//
// Exact Taylor coefficients of an expression about a point, computed by
// propagating truncated power series through the same RPN the evaluator runs.
// This is the honest way to get high-order derivatives: finite differences
// turn to noise past the third order, but series arithmetic is closed-form —
// each operation has a classical recurrence, so the only error is float
// rounding.
//
// A series here is number[] of length order+1: s[k] is the coefficient of
// (x − a)^k. Operations that are not analytic (abs, floor, sign, …) have no
// Taylor series and return null, which callers treat as "this function is not
// one this lens can serve".

type Series = number[];

const sNew = (n: number): Series => new Array(n).fill(0);
const sConst = (v: number, n: number): Series => {
  const s = sNew(n);
  s[0] = v;
  return s;
};

function sAdd(a: Series, b: Series): Series {
  return a.map((v, i) => v + b[i]);
}
function sSub(a: Series, b: Series): Series {
  return a.map((v, i) => v - b[i]);
}
function sNeg(a: Series): Series {
  return a.map((v) => -v);
}
/** Cauchy product, truncated. */
function sMul(a: Series, b: Series): Series {
  const n = a.length;
  const out = sNew(n);
  for (let i = 0; i < n; i++) {
    if (a[i] === 0) continue;
    for (let j = 0; i + j < n; j++) out[i + j] += a[i] * b[j];
  }
  return out;
}
/** q = a / b, needs b[0] ≠ 0. */
function sDiv(a: Series, b: Series): Series | null {
  if (b[0] === 0) return null;
  const n = a.length;
  const q = sNew(n);
  for (let k = 0; k < n; k++) {
    let acc = a[k];
    for (let j = 0; j < k; j++) acc -= q[j] * b[k - j];
    q[k] = acc / b[0];
  }
  return q;
}
/** e = exp(a): e' = a'·e gives e_k = (1/k) Σ_{j=1..k} j·a_j·e_{k−j}. */
function sExp(a: Series): Series {
  const n = a.length;
  const e = sNew(n);
  e[0] = Math.exp(a[0]);
  for (let k = 1; k < n; k++) {
    let acc = 0;
    for (let j = 1; j <= k; j++) acc += j * a[j] * e[k - j];
    e[k] = acc / k;
  }
  return e;
}
/** l = ln(a), needs a[0] > 0: a·l' = a' gives the recurrence below. */
function sLn(a: Series): Series | null {
  if (!(a[0] > 0)) return null;
  const n = a.length;
  const l = sNew(n);
  l[0] = Math.log(a[0]);
  for (let k = 1; k < n; k++) {
    let acc = k * a[k];
    for (let j = 1; j < k; j++) acc -= j * l[j] * a[k - j];
    l[k] = acc / (k * a[0]);
  }
  return l;
}
/** sin and cos advance together: s' = a'·c, c' = −a'·s. */
function sSinCos(a: Series): [Series, Series] {
  const n = a.length;
  const s = sNew(n);
  const c = sNew(n);
  s[0] = Math.sin(a[0]);
  c[0] = Math.cos(a[0]);
  for (let k = 1; k < n; k++) {
    let sa = 0;
    let ca = 0;
    for (let j = 1; j <= k; j++) {
      sa += j * a[j] * c[k - j];
      ca += j * a[j] * s[k - j];
    }
    s[k] = sa / k;
    c[k] = -ca / k;
  }
  return [s, c];
}
/**
 * w = a^α for real α, needs a[0] > 0:
 * w_k = (1/(k·a_0)) Σ_{j=1..k} (αj − (k−j)) a_j w_{k−j}.
 */
function sPowReal(a: Series, alpha: number): Series | null {
  if (!(a[0] > 0)) return null;
  const n = a.length;
  const w = sNew(n);
  w[0] = Math.pow(a[0], alpha);
  for (let k = 1; k < n; k++) {
    let acc = 0;
    for (let j = 1; j <= k; j++) acc += (alpha * j - (k - j)) * a[j] * w[k - j];
    w[k] = acc / (k * a[0]);
  }
  return w;
}
/** Integer powers by binary exponentiation — no positivity requirement. */
function sPowInt(a: Series, p: number): Series | null {
  if (p < 0) {
    const inv = sDiv(sConst(1, a.length), a);
    return inv ? sPowInt(inv, -p) : null;
  }
  let out = sConst(1, a.length);
  let base = a;
  let e = p;
  while (e > 0) {
    if (e & 1) out = sMul(out, base);
    base = sMul(base, base);
    e >>= 1;
  }
  return out;
}

/** Series for one whitelisted function applied to a series, or null. */
function sFn(name: string, a: Series): Series | null {
  switch (name) {
    case 'sin': return sSinCos(a)[0];
    case 'cos': return sSinCos(a)[1];
    case 'tan': {
      const [s, c] = sSinCos(a);
      return sDiv(s, c);
    }
    case 'exp': return sExp(a);
    case 'ln': return sLn(a);
    case 'log': {
      const l = sLn(a);
      return l ? l.map((v) => v / Math.LN10) : null;
    }
    case 'log2': {
      const l = sLn(a);
      return l ? l.map((v) => v / Math.LN2) : null;
    }
    case 'sqrt': return sPowReal(a, 0.5);
    case 'cbrt': return a[0] > 0 ? sPowReal(a, 1 / 3) : null;
    case 'sinh': {
      const e = sExp(a);
      const em = sExp(sNeg(a));
      return sSub(e, em).map((v) => v / 2);
    }
    case 'cosh': {
      const e = sExp(a);
      const em = sExp(sNeg(a));
      return sAdd(e, em).map((v) => v / 2);
    }
    case 'tanh': {
      const e = sExp(a);
      const em = sExp(sNeg(a));
      return sDiv(sSub(e, em), sAdd(e, em));
    }
    // atan: v = atan(a) has v' = a'/(1+a²) — integrate the derivative series.
    case 'atan': {
      const n = a.length;
      const denom = sAdd(sConst(1, n), sMul(a, a));
      const da = a.map((v, i) => (i + 1 < n ? (i + 1) * a[i + 1] : 0));
      const dv = sDiv(da, denom);
      if (!dv) return null;
      const v = sNew(n);
      v[0] = Math.atan(a[0]);
      for (let k = 1; k < n; k++) v[k] = dv[k - 1] / k;
      return v;
    }
    // abs, sign, floor, ceil, round, asin, acos: not analytic (or not worth
    // the edge cases) — no series.
    default:
      return null;
  }
}

/**
 * The Taylor coefficients of `raw` about x = a, to the given order, with any
 * other free names bound by `scope`. Returns null when the expression does not
 * compile over the declared names, uses a non-analytic operation, or produces
 * a non-finite coefficient (a pole at the centre, say).
 */
export function taylorCoeffs(
  raw: string,
  varName: string,
  scope: Record<string, number>,
  a: number,
  order: number
): number[] | null {
  // Number.isInteger also rejects NaN — a NaN order would otherwise sail
  // through both comparisons and hand new Array() an invalid length.
  if (typeof raw !== 'string' || raw.length > 400) return null;
  if (!Number.isInteger(order) || order < 0 || order > 24) return null;
  const vars = new Set([varName.toLowerCase(), ...Object.keys(scope).map((k) => k.toLowerCase())]);
  const toks0 = tokenize(normalizeExpr(raw), vars);
  if (!toks0 || !toks0.length) return null;
  const rpn = toRpn(insertImplicitMult(toks0));
  if (!rpn) return null;

  const n = order + 1;
  const st: Series[] = [];
  for (const tk of rpn) {
    if (tk.t === 'num') st.push(sConst(tk.v, n));
    else if (tk.t === 'var') {
      if (tk.v === varName.toLowerCase()) {
        const s = sConst(a, n);
        if (n > 1) s[1] = 1; // the variable itself: a + 1·(x − a)
        st.push(s);
      } else {
        const bound = scope[tk.v];
        if (typeof bound !== 'number') return null;
        st.push(sConst(bound, n));
      }
    } else if (tk.t === 'fn') {
      const arg = st.pop();
      if (!arg) return null;
      const out = sFn(tk.v, arg);
      if (!out) return null;
      st.push(out);
    } else if (tk.t === 'op') {
      if (tk.v === 'u-') {
        const x = st.pop();
        if (!x) return null;
        st.push(sNeg(x));
        continue;
      }
      const b = st.pop();
      const x = st.pop();
      if (!x || !b) return null;
      let out: Series | null = null;
      if (tk.v === '+') out = sAdd(x, b);
      else if (tk.v === '-') out = sSub(x, b);
      else if (tk.v === '*') out = sMul(x, b);
      else if (tk.v === '/') out = sDiv(x, b);
      else if (tk.v === '%') return null; // not analytic
      else if (tk.v === '^') {
        // Only a CONSTANT exponent has a classical recurrence. x^x needs
        // exp(b·ln x); handle it when the exponent series is genuinely
        // varying, via exp/ln, which then imposes x > 0.
        const constant = b.slice(1).every((v) => v === 0);
        if (constant) {
          out = Number.isInteger(b[0]) ? sPowInt(x, b[0]) : sPowReal(x, b[0]);
        } else {
          const l = sLn(x);
          out = l ? sExp(sMul(b, l)) : null;
        }
      }
      if (!out) return null;
      st.push(out);
    }
  }
  if (st.length !== 1) return null;
  const coeffs = st[0];
  return coeffs.every(Number.isFinite) ? coeffs : null;
}
