// lib/model/expr.ts
//
// AN EXPRESSION AS A TREE, SO THAT IT CAN BE DIFFERENTIATED.
//
// WHAT WAS HERE BEFORE: nothing. `compileExpr` (lib/logos-math.ts) turns a
// string into a CLOSURE — you can evaluate it and you can list the names it
// mentions, and that is all. There is no tree, so there is nothing to
// differentiate, nothing to rewrite, and nothing to inspect structurally. The
// `rearrange` operation has been a `FUTURE` solver whose `requires()` returns
// the string "a symbolic backend" since the registry was written.
//
// WHY THAT MATTERS BEYOND ALGEBRA. The econometrics digest makes marginal
// effects central from chapter 6 onwards: a quadratic term exists precisely so
// that the effect of a variable is not constant, and an interaction exists
// precisely so that one variable's effect depends on another. Both are
// statements about a DERIVATIVE, and neither can be answered by evaluating the
// function — you have to differentiate it. The same primitive is a gradient in
// an optimisation, an elasticity in a demand system, a velocity in kinematics
// and a Jacobian in a stability analysis. It is not an econometrics feature.
//
// WHAT THIS DELIBERATELY IS NOT. A computer algebra system. It parses the
// grammar lib/logos-math.ts already accepts, differentiates it, simplifies
// enough to be legible, and prints it back into the SAME grammar so the result
// compiles and evaluates through the existing evaluator. It does not solve, it
// does not integrate, it does not factor, and it REFUSES rather than guessing:
// `floor`, `sign`, `mod`, `max` and `min` have no derivative this can produce,
// and the refusal names the function.
//
// ONE GRAMMAR, and it is the evaluator's. `parse` takes the same closed set of
// legal names `compileExpr` takes and fails on anything else, for the same
// reason: an unknown name means the expression was not understood, and guessing
// is worse than declining.
//
// PURE. No clock, no network, no React.

import { normalizeExpr } from '@/lib/logos-math';
import { fractionOf, realPow } from '@/lib/real-power';

export type Expr =
  | { k: 'num'; v: number }
  | { k: 'name'; id: string }
  | { k: 'neg'; a: Expr }
  | { k: 'add'; a: Expr; b: Expr }
  | { k: 'sub'; a: Expr; b: Expr }
  | { k: 'mul'; a: Expr; b: Expr }
  | { k: 'div'; a: Expr; b: Expr }
  | { k: 'pow'; a: Expr; b: Expr }
  | { k: 'mod'; a: Expr; b: Expr }
  | { k: 'call'; fn: string; args: Expr[] };

const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E, tau: Math.PI * 2 };

/** One-argument functions this grammar knows, and whether a derivative exists. */
const ONE = new Set([
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'arcsin', 'arccos', 'arctan',
  'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh', 'arcsinh', 'arccosh', 'arctanh',
  'sec', 'csc', 'cot', 'ln', 'log', 'log2', 'log10', 'lg', 'sqrt', 'cbrt', 'abs',
  'exp', 'sign', 'floor', 'ceil', 'round', 'step',
]);
const TWO = new Set(['max', 'min', 'atan2', 'mod', 'logbase']);

// ── parsing ─────────────────────────────────────────────────────────

type Tok =
  | { t: 'num'; v: number }
  | { t: 'name'; v: string }
  | { t: 'fn'; v: string }
  | { t: 'op'; v: string }
  | { t: 'lp' }
  | { t: 'rp' }
  | { t: 'comma' };

function lex(src: string, names: Set<string>): Tok[] | null {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ' ') { i++; continue; }
    if (c === ',') { out.push({ t: 'comma' }); i++; continue; }
    if (/[0-9.]/.test(c)) {
      let j = i + 1;
      while (j < src.length && /[0-9.eE]/.test(src[j])) {
        if ((src[j] === 'e' || src[j] === 'E') && /[+-]/.test(src[j + 1] ?? '')) j++;
        j++;
      }
      const v = Number(src.slice(i, j));
      if (!Number.isFinite(v)) return null;
      out.push({ t: 'num', v });
      i = j;
      continue;
    }
    if (/[a-zA-Z]/.test(c)) {
      // Underscores belong to a name, exactly as in the evaluator's tokenizer.
      let j = i + 1;
      while (j < src.length && /[a-zA-Z0-9_]/.test(src[j])) j++;
      const word = src.slice(i, j).toLowerCase();
      if (names.has(word)) out.push({ t: 'name', v: word });
      else if (word in CONSTS) out.push({ t: 'num', v: CONSTS[word] });
      else if (ONE.has(word) || TWO.has(word)) out.push({ t: 'fn', v: word });
      else return null;
      i = j;
      continue;
    }
    if ('+-*/%^'.includes(c)) { out.push({ t: 'op', v: c }); i++; continue; }
    if (c === '(') { out.push({ t: 'lp' }); i++; continue; }
    if (c === ')') { out.push({ t: 'rp' }); i++; continue; }
    return null;
  }
  return out;
}

/** "2x" and "3(x+1)" mean what they look like — the evaluator's rule, kept. */
function implicitMul(toks: Tok[]): Tok[] {
  const out: Tok[] = [];
  const ends = (t: Tok) => t.t === 'num' || t.t === 'name' || t.t === 'rp';
  const starts = (t: Tok) => t.t === 'num' || t.t === 'name' || t.t === 'fn' || t.t === 'lp';
  for (let i = 0; i < toks.length; i++) {
    out.push(toks[i]);
    const next = toks[i + 1];
    if (next && ends(toks[i]) && starts(next)) out.push({ t: 'op', v: '*' });
  }
  return out;
}

/**
 * Parse into a tree, over the same closed name set the evaluator takes.
 *
 * Recursive descent rather than shunting-yard, because the output is a tree and
 * the precedence table is four lines: `+ -` then `* / %` then unary minus then
 * `^`, right-associative.
 */
export function parse(raw: string, names: readonly string[]): Expr | null {
  const set = new Set(names.map((n) => n.toLowerCase()));
  const toks = lex(normalizeExpr(raw), set);
  if (!toks || !toks.length) return null;
  let at = 0;
  const peek = () => toks[at];
  const eat = () => toks[at++];

  const primary = (): Expr | null => {
    const t = peek();
    if (!t) return null;
    if (t.t === 'num') { eat(); return { k: 'num', v: t.v }; }
    if (t.t === 'name') { eat(); return { k: 'name', id: t.v }; }
    if (t.t === 'lp') {
      eat();
      const e = sum();
      if (!e || peek()?.t !== 'rp') return null;
      eat();
      return e;
    }
    if (t.t === 'fn') {
      eat();
      if (peek()?.t !== 'lp') return null;
      eat();
      const args: Expr[] = [];
      for (;;) {
        const a = sum();
        if (!a) return null;
        args.push(a);
        if (peek()?.t === 'comma') { eat(); continue; }
        break;
      }
      if (peek()?.t !== 'rp') return null;
      eat();
      if (ONE.has(t.v) && args.length !== 1) return null;
      if (TWO.has(t.v) && args.length !== 2) return null;
      return { k: 'call', fn: t.v, args };
    }
    return null;
  };

  // `^` binds tighter than unary minus, so -x^2 is -(x^2) and 2^-1 parses.
  const power = (): Expr | null => {
    const base = primary();
    if (!base) return null;
    const t = peek();
    if (t?.t === 'op' && t.v === '^') {
      eat();
      const exp = unary();
      if (!exp) return null;
      return { k: 'pow', a: base, b: exp };
    }
    return base;
  };

  const unary = (): Expr | null => {
    const t = peek();
    if (t?.t === 'op' && (t.v === '-' || t.v === '+')) {
      eat();
      const a = unary();
      if (!a) return null;
      return t.v === '-' ? { k: 'neg', a } : a;
    }
    return power();
  };

  const product = (): Expr | null => {
    let a = unary();
    if (!a) return null;
    for (;;) {
      const t = peek();
      if (t?.t !== 'op' || !'*/%'.includes(t.v)) return a;
      eat();
      const b = unary();
      if (!b) return null;
      a = t.v === '*' ? { k: 'mul', a, b } : t.v === '/' ? { k: 'div', a, b } : { k: 'mod', a, b };
    }
  };

  const sum = (): Expr | null => {
    let a = product();
    if (!a) return null;
    for (;;) {
      const t = peek();
      if (t?.t !== 'op' || !'+-'.includes(t.v)) return a;
      eat();
      const b = product();
      if (!b) return null;
      a = t.v === '+' ? { k: 'add', a, b } : { k: 'sub', a, b };
    }
  };

  const whole = sum();
  return whole && at === toks.length ? whole : null;
}

// ── printing ────────────────────────────────────────────────────────

const PREC: Record<Expr['k'], number> = {
  num: 9, name: 9, call: 9, pow: 4, neg: 3, mul: 2, div: 2, mod: 2, add: 1, sub: 1,
};

/**
 * Back into the grammar it came from, with only the parentheses it needs.
 *
 * A NEGATION ON THE RIGHT OF AN OPERATOR ALWAYS GETS ITS PARENTHESES. By
 * precedence `a * -b` needs none, and the evaluator's shunting-yard does not
 * accept it — so a derivative like `f(u) * -(du)`, which the quotient and chain
 * rules produce constantly, printed correctly and then failed to compile. Three
 * library surfaces stopped drawing their slopes for exactly this reason. It is
 * one parenthesis, and the alternative is a printer whose output its own
 * evaluator rejects.
 */
/**
 * A number as the evaluator will read it back — exactly enough to be the same
 * number.
 *
 * Twelve significant figures is right for nearly everything: it turns float
 * noise back into the number meant (0.30000000000000004 prints as 0.3). It is
 * wrong for a fraction that has no short decimal. Two thirds printed as
 * 0.666666666667 is no longer two thirds — and a power is only real for a
 * negative base when its exponent IS a fraction with an odd denominator
 * (lib/real-power.ts), so x^(2/3) folded and printed as x^0.666666666667, and
 * its derivative as 0.666666666667 * x^-0.333333333333, lost the left half of
 * both curves. Such a number prints as the fraction it is, in parentheses so
 * it binds as one operand wherever it lands: x^(2/3), (2/3) * x^(-1/3).
 */
function printNum(v: number): string {
  const short = Number(v.toPrecision(12));
  if (Math.abs(short - v) <= 8 * Number.EPSILON * Math.abs(v)) return String(short);
  const f = fractionOf(v);
  if (f && f.q > 1) return `(${f.p}/${f.q})`;
  return String(short);
}

export function print(e: Expr): string {
  const wrap = (child: Expr, need: number) =>
    PREC[child.k] < need || child.k === 'neg' ? `(${print(child)})` : print(child);
  switch (e.k) {
    case 'num':
      return printNum(e.v);
    case 'name':
      return e.id;
    case 'neg':
      return `-${PREC[e.a.k] < 3 ? `(${print(e.a)})` : print(e.a)}`;
    case 'add':
      // A leading minus on the LEFT is fine — `-a + b` parses — so only the right
      // operand is wrapped, by `wrap`.
      return `${PREC[e.a.k] < 1 ? `(${print(e.a)})` : print(e.a)} + ${wrap(e.b, 1)}`;
    case 'sub':
      // `a - (b - c)` needs its parentheses; `a - b - c` does not.
      return `${wrap(e.a, 1)} - ${PREC[e.b.k] <= 1 ? `(${print(e.b)})` : print(e.b)}`;
    case 'mul':
      return `${wrap(e.a, 2)} * ${wrap(e.b, 2)}`;
    case 'div':
      return `${wrap(e.a, 2)} / ${PREC[e.b.k] <= 2 ? `(${print(e.b)})` : print(e.b)}`;
    case 'mod':
      return `${wrap(e.a, 2)} % ${PREC[e.b.k] <= 2 ? `(${print(e.b)})` : print(e.b)}`;
    case 'pow':
      return `${PREC[e.a.k] <= 4 ? `(${print(e.a)})` : print(e.a)}^${wrap(e.b, 4)}`;
    case 'call':
      return `${e.fn}(${e.args.map(print).join(', ')})`;
  }
}

/** Every name the tree mentions, deduplicated, in the order first seen. */
export function namesOf(e: Expr): string[] {
  const out: string[] = [];
  const walk = (n: Expr) => {
    switch (n.k) {
      case 'name':
        if (!out.includes(n.id)) out.push(n.id);
        return;
      case 'num':
        return;
      case 'neg':
        return walk(n.a);
      case 'call':
        return n.args.forEach(walk);
      default:
        walk(n.a);
        walk(n.b);
    }
  };
  walk(e);
  return out;
}

// ── simplifying ─────────────────────────────────────────────────────

const num = (v: number): Expr => ({ k: 'num', v });
/**
 * TWO PREDICATES, NOT ONE WITH AN OPTIONAL ARGUMENT.
 *
 * `isVal(e, 0)` as a type guard tells TypeScript that the FALSE branch is not a
 * number at all — when all it means is "not the number zero" — so every later
 * `isNum(a) && isNum(b)` in the same block narrowed to `never`. A guard that
 * lies about its negative case is worse than no guard.
 */
const isNum = (e: Expr): e is { k: 'num'; v: number } => e.k === 'num';
const isVal = (e: Expr, v: number): boolean => e.k === 'num' && e.v === v;

/**
 * Enough rewriting to be legible, and no more.
 *
 * WHY THIS IS NOT OPTIONAL. The raw derivative of
 * `b0 + b1*educ + b2*exper + b3*exper^2` with respect to `exper` is
 *
 *   0 + (0 * educ + b1 * 0) + (0 * exper + b2 * 1) + (0 * exper^2 + b3 * (2 * exper^1 * 1))
 *
 * which is correct and unreadable, and a person asked to check it would not. The
 * rules below are the identities — a zero term, a unit factor, a unit exponent,
 * folded constants — and they are applied bottom-up until nothing changes.
 *
 * It does NOT collect like terms or normalise polynomials: `2 * b3 * exper` is
 * as far as it goes, and a reader can see that is `2β₃·exper`.
 */
export function simplify(e: Expr): Expr {
  const s = (n: Expr): Expr => {
    switch (n.k) {
      case 'num':
      case 'name':
        return n;
      case 'neg': {
        const a = s(n.a);
        if (isNum(a)) return num(-a.v);
        if (a.k === 'neg') return a.a;
        return { k: 'neg', a };
      }
      case 'call': {
        const args = n.args.map(s);
        return { k: 'call', fn: n.fn, args };
      }
      case 'add': {
        const a = s(n.a);
        const b = s(n.b);
        if (isVal(a, 0)) return b;
        if (isVal(b, 0)) return a;
        if (isNum(a) && isNum(b)) return num(a.v + b.v);
        // a + (-b) reads better as a - b.
        if (b.k === 'neg') return s({ k: 'sub', a, b: b.a });
        if (isNum(b) && b.v < 0) return s({ k: 'sub', a, b: num(-b.v) });
        return { k: 'add', a, b };
      }
      case 'sub': {
        const a = s(n.a);
        const b = s(n.b);
        if (isVal(b, 0)) return a;
        if (isNum(a) && isNum(b)) return num(a.v - b.v);
        if (isVal(a, 0)) return s({ k: 'neg', a: b });
        if (b.k === 'neg') return s({ k: 'add', a, b: b.a });
        return { k: 'sub', a, b };
      }
      case 'mul': {
        const a = s(n.a);
        const b = s(n.b);
        if (isVal(a, 0) || isVal(b, 0)) return num(0);
        if (isVal(a, 1)) return b;
        if (isVal(b, 1)) return a;
        if (isNum(a) && isNum(b)) return num(a.v * b.v);
        // A number in front reads as a coefficient; a number behind reads as an
        // accident of the differentiation order.
        if (isNum(b) && !isNum(a)) return { k: 'mul', a: b, b: a };
        // Fold a number through a product that already starts with one:
        // 2 * (3 * x) → 6 * x.
        if (isNum(a) && b.k === 'mul' && isNum(b.a)) return s({ k: 'mul', a: num(a.v * b.a.v), b: b.b });
        return { k: 'mul', a, b };
      }
      case 'div': {
        const a = s(n.a);
        const b = s(n.b);
        if (isVal(a, 0)) return num(0);
        if (isVal(b, 1)) return a;
        if (isNum(a) && isNum(b) && b.v !== 0) return num(a.v / b.v);
        return { k: 'div', a, b };
      }
      case 'pow': {
        const a = s(n.a);
        const b = s(n.b);
        if (isVal(b, 0)) return num(1);
        if (isVal(b, 1)) return a;
        if (isNum(a) && isNum(b)) {
          // the same real-valued power the evaluator uses: (−8)^(2/3) is 4
          const v = realPow(a.v, b.v);
          if (Number.isFinite(v)) return num(v);
        }
        return { k: 'pow', a, b };
      }
      case 'mod':
        return { k: 'mod', a: s(n.a), b: s(n.b) };
    }
  };
  // Bottom-up until it settles; bounded, because a rewriter that can loop will.
  let cur = e;
  for (let i = 0; i < 12; i++) {
    const next = s(cur);
    if (print(next) === print(cur)) return next;
    cur = next;
  }
  return cur;
}

// ── differentiating ─────────────────────────────────────────────────

/** The derivative of a one-argument function at its argument, or null. */
function dOne(fn: string, a: Expr): Expr | null {
  const mul = (x: Expr, y: Expr): Expr => ({ k: 'mul', a: x, b: y });
  const div = (x: Expr, y: Expr): Expr => ({ k: 'div', a: x, b: y });
  const call = (f: string, x: Expr): Expr => ({ k: 'call', fn: f, args: [x] });
  const pow = (x: Expr, p: number): Expr => ({ k: 'pow', a: x, b: num(p) });
  const one = num(1);
  switch (fn) {
    case 'sin': return call('cos', a);
    case 'cos': return { k: 'neg', a: call('sin', a) };
    case 'tan': return div(one, pow(call('cos', a), 2));
    case 'exp': return call('exp', a);
    case 'ln': return div(one, a);
    case 'log': case 'log10': case 'lg':
      return div(one, mul(a, call('ln', num(10))));
    case 'log2': return div(one, mul(a, call('ln', num(2))));
    case 'sqrt': return div(one, mul(num(2), call('sqrt', a)));
    case 'cbrt': return div(one, mul(num(3), pow(call('cbrt', a), 2)));
    case 'abs': return call('sign', a);
    case 'sinh': return call('cosh', a);
    case 'cosh': return call('sinh', a);
    case 'tanh': return { k: 'sub', a: one, b: pow(call('tanh', a), 2) };
    case 'asin': case 'arcsin':
      return div(one, call('sqrt', { k: 'sub', a: one, b: pow(a, 2) }));
    case 'acos': case 'arccos':
      return { k: 'neg', a: div(one, call('sqrt', { k: 'sub', a: one, b: pow(a, 2) })) };
    case 'atan': case 'arctan':
      return div(one, { k: 'add', a: one, b: pow(a, 2) });
    case 'asinh': case 'arcsinh':
      return div(one, call('sqrt', { k: 'add', a: pow(a, 2), b: one }));
    case 'acosh': case 'arccosh':
      return div(one, call('sqrt', { k: 'sub', a: pow(a, 2), b: one }));
    case 'atanh': case 'arctanh':
      return div(one, { k: 'sub', a: one, b: pow(a, 2) });
    case 'sec': return mul(call('sec', a), call('tan', a));
    case 'csc': return { k: 'neg', a: mul(call('csc', a), call('cot', a)) };
    case 'cot': return { k: 'neg', a: div(one, pow(call('sin', a), 2)) };
    // NOT DIFFERENTIABLE HERE, and saying so is the point. `sign`, `floor`,
    // `ceil`, `round` and `step` are constant almost everywhere and undefined
    // at their jumps; reporting 0 would be true almost everywhere and wrong
    // exactly where the model is interesting.
    default: return null;
  }
}

export interface Derivative {
  /** the derivative, simplified and ready to compile */
  expr: Expr;
  /** what it is with respect to */
  wrt: string;
}

/**
 * ∂e/∂wrt, or a named refusal.
 *
 * Structured, not textual: the tree is walked and the rules applied, so the
 * result is exact for everything in the grammar that has a derivative and
 * ABSENT for everything that does not. There is no path here that produces a
 * plausible-looking derivative of `floor(x)`.
 */
export function differentiate(e: Expr, wrt: string): { ok: true; got: Derivative } | { ok: false; why: string } {
  const target = wrt.toLowerCase();
  let refusal: string | null = null;

  const d = (n: Expr): Expr | null => {
    if (refusal) return null;
    switch (n.k) {
      case 'num':
        return num(0);
      case 'name':
        return num(n.id === target ? 1 : 0);
      case 'neg': {
        const a = d(n.a);
        return a && { k: 'neg', a };
      }
      case 'add': {
        const a = d(n.a);
        const b = d(n.b);
        return a && b ? { k: 'add', a, b } : null;
      }
      case 'sub': {
        const a = d(n.a);
        const b = d(n.b);
        return a && b ? { k: 'sub', a, b } : null;
      }
      case 'mul': {
        const da = d(n.a);
        const db = d(n.b);
        if (!da || !db) return null;
        return { k: 'add', a: { k: 'mul', a: da, b: n.b }, b: { k: 'mul', a: n.a, b: db } };
      }
      case 'div': {
        const da = d(n.a);
        const db = d(n.b);
        if (!da || !db) return null;
        return {
          k: 'div',
          a: { k: 'sub', a: { k: 'mul', a: da, b: n.b }, b: { k: 'mul', a: n.a, b: db } },
          b: { k: 'pow', a: n.b, b: num(2) },
        };
      }
      case 'pow': {
        const da = d(n.a);
        const db = d(n.b);
        if (!da || !db) return null;
        // A CONSTANT EXPONENT IS THE CASE THAT ACTUALLY TURNS UP, and it has a
        // much cleaner answer than the general one: n·a^(n−1)·a'. Taking the
        // general path for x^2 would produce x^2·(0·ln(x) + 2·1/x), which is
        // equal and unreadable — and undefined at x = 0, which x^2 is not.
        const constExp = simplify(n.b);
        if (isNum(constExp)) {
          return {
            k: 'mul',
            a: { k: 'mul', a: constExp, b: { k: 'pow', a: n.a, b: num(constExp.v - 1) } },
            b: da,
          };
        }
        // The general rule needs ln of the base, which is where a negative base
        // stops being real. Refused rather than returned with a caveat nobody
        // would see.
        return {
          k: 'mul',
          a: n,
          b: {
            k: 'add',
            a: { k: 'mul', a: db, b: { k: 'call', fn: 'ln', args: [n.a] } },
            b: { k: 'div', a: { k: 'mul', a: n.b, b: da }, b: n.a },
          },
        };
      }
      case 'mod':
        refusal = 'a remainder has no derivative this can produce: it is a sawtooth, and its slope is undefined at every jump';
        return null;
      case 'call': {
        if (TWO.has(n.fn)) {
          // max, min, atan2 and logbase all have derivatives in principle; two
          // of them are piecewise and none of them turn up in a model often
          // enough to be worth a wrong answer.
          refusal = `${n.fn} takes two arguments and this differentiates one-argument functions`;
          return null;
        }
        const inner = dOne(n.fn, n.args[0]);
        if (!inner) {
          refusal = `${n.fn} has no derivative this can produce — it is flat between jumps and undefined at them`;
          return null;
        }
        const da = d(n.args[0]);
        return da && { k: 'mul', a: inner, b: da };
      }
    }
  };

  const got = d(e);
  if (!got) return { ok: false, why: refusal ?? 'the expression could not be differentiated' };
  return { ok: true, got: { expr: simplify(got), wrt: target } };
}

/**
 * The whole job, as text: an expression in, a derivative out, or a refusal.
 *
 * `names` is the closed legal set, exactly as `compileExpr` takes it, so a
 * derivative this produces is guaranteed to compile over the same scope the
 * original did.
 */
export function derivativeOf(
  raw: string,
  wrt: string,
  names: readonly string[]
): { ok: true; expr: string; tree: Expr } | { ok: false; why: string } {
  const tree = parse(raw, names);
  if (!tree) return { ok: false, why: `“${raw}” did not parse over ${names.join(', ')}` };
  if (!namesOf(tree).includes(wrt.toLowerCase())) {
    // NOT A REFUSAL. A quantity the expression does not mention has a
    // derivative of exactly zero, and that is a real and useful answer: it is
    // how "does this depend on x at all?" is answered.
    return { ok: true, expr: '0', tree: num(0) };
  }
  const got = differentiate(tree, wrt);
  if (!got.ok) return { ok: false, why: got.why };
  return { ok: true, expr: print(got.got.expr), tree: got.got.expr };
}

/**
 * Every name in the tree replaced according to a map, structurally.
 *
 * WHY THIS IS NOT A STRING REPLACE. The response surface has to rewrite a term's
 * expression over the axes it is drawn against: `(exper)^2` becomes `(y)^2`
 * because `exper` is the vertical axis. Doing that textually is the string hack
 * the whole IR exists to avoid — `exper` is a substring of `experience`,
 * `x` appears inside `exp`, and a regex that gets it right for one model gets it
 * wrong for the next. Renaming a leaf of a tree cannot go wrong.
 */
export function rename(e: Expr, map: Readonly<Record<string, string>>): Expr {
  switch (e.k) {
    case 'num':
      return e;
    case 'name':
      return { k: 'name', id: map[e.id] ?? e.id };
    case 'neg':
      return { k: 'neg', a: rename(e.a, map) };
    case 'call':
      return { k: 'call', fn: e.fn, args: e.args.map((a) => rename(a, map)) };
    default:
      return { k: e.k, a: rename(e.a, map), b: rename(e.b, map) };
  }
}

/**
 * Substitute a name with a whole subtree.
 *
 * What `wage_hat = β₀ + β₁·educ + β₂·exper + β₃·exper_pow2` needs before it can
 * be differentiated with respect to `exper`: `exper_pow2` has to become
 * `exper^2` first, or the derivative comes back as zero — which is true of the
 * expression as written and false of the model it stands for. Composition is a
 * tree operation, and this is it.
 */
export function substitute(e: Expr, into: Readonly<Record<string, Expr>>): Expr {
  switch (e.k) {
    case 'num':
      return e;
    case 'name':
      return into[e.id] ?? e;
    case 'neg':
      return { k: 'neg', a: substitute(e.a, into) };
    case 'call':
      return { k: 'call', fn: e.fn, args: e.args.map((a) => substitute(a, into)) };
    default:
      return { k: e.k, a: substitute(e.a, into), b: substitute(e.b, into) };
  }
}
