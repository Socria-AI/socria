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
  | { t: 'var' }
  | { t: 'op'; v: string }
  | { t: 'fn'; v: string }
  | { t: 'lp' }
  | { t: 'rp' };

const FUNCS: Record<string, (x: number) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  ln: Math.log, log: (x) => Math.log10(x), log2: Math.log2,
  sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs,
  exp: Math.exp, sign: Math.sign, floor: Math.floor, ceil: Math.ceil, round: Math.round,
};
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E, tau: Math.PI * 2 };
const PREC: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2, '^': 4, 'u-': 3 };
const RIGHT = new Set(['^', 'u-']);

/** Normalize common human notation into the grammar the tokenizer knows. */
function normalizeExpr(raw: string, varName: string): string {
  let s = raw.trim();
  // strip a leading "y =" / "f(x) =" so we evaluate the right-hand side
  s = s.replace(/^\s*[a-zA-Z]\w*\s*(\([^)]*\))?\s*=\s*/, '');
  s = s.replace(/[×·]/g, '*').replace(/÷/g, '/');
  s = s.replace(/\\cdot|\\times/g, '*').replace(/\\div/g, '/');
  s = s.replace(/\\left|\\right/g, '');
  s = s.replace(/\\pi/g, 'pi').replace(/\\/g, '');
  s = s.replace(/\bpi\b/gi, 'pi');
  return s;
}

function tokenize(src: string, varName: string): Tok[] | null {
  const toks: Tok[] = [];
  let i = 0;
  const v = varName.toLowerCase();
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
      if (word === v) toks.push({ t: 'var' });
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

/** Compile "y = x^2 - 3" into a numeric function of one variable, or null. */
export function compileFunction(raw: string): CompiledFn | null {
  if (typeof raw !== 'string' || raw.length > 400) return null;
  // detect the variable: x by default, else the single letter used
  const rhs = raw.replace(/^\s*[a-zA-Z]\w*\s*(\([^)]*\))?\s*=\s*/, '');
  const letters = new Set(
    (rhs.toLowerCase().match(/[a-z]+/g) ?? []).filter(
      (w) => !(w in FUNCS) && !(w in CONSTS)
    )
  );
  if (letters.size > 1) return null; // more than one free variable → not a curve
  const varName = letters.size === 1 ? [...letters][0] : 'x';
  const toks0 = tokenize(normalizeExpr(raw, varName), varName);
  if (!toks0 || !toks0.length) return null;
  const toks = insertImplicitMult(toks0);
  if (!toks.some((t) => t.t === 'var')) return null; // a constant, not a function
  const rpn = toRpn(toks);
  if (!rpn) return null;

  const fn = (x: number): number => {
    const st: number[] = [];
    for (const tk of rpn) {
      if (tk.t === 'num') st.push(tk.v);
      else if (tk.t === 'var') st.push(x);
      else if (tk.t === 'fn') {
        const a = st.pop();
        if (a === undefined) return NaN;
        st.push(FUNCS[tk.v](a));
      } else if (tk.t === 'op') {
        if (tk.v === 'u-') { const a = st.pop(); if (a === undefined) return NaN; st.push(-a); continue; }
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
