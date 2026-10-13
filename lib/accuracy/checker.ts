// lib/accuracy/checker.ts
//
// EACH CLAIM, DECIDED BY COMPUTING IT.
//
// lib/accuracy/claims.ts says what a text claims; this says whether it is so.
// A derivative is differentiated by the symbolic engine (lib/model/expr.ts —
// exact rules, csc′ = −csc·cot among them) and compared with the claim at
// fixed points. An antiderivative is checked the way a person checks one: by
// differentiating it back. A definite integral is a quadrature, a limit is
// approached, a solution is substituted, a domain is scanned for a
// counterexample, a unit conversion goes through SI.
//
// FOUR VERDICTS, AND THEY MEAN DIFFERENT THINGS.
//
//   verified    computed, and the claim agrees (a derivative, an integral, an
//               identity at every comparison point, a value to its stated
//               precision)
//   refuted     computed, and the claim disagrees — with the computed value,
//               or a concrete counterexample
//   consistent  a scan found no counterexample, which is NOT a proof: domain
//               and range claims, and solution sets on a bounded window, can
//               only be refuted this way, never confirmed
//   unchecked   the engine cannot decide it: notation it cannot read, an
//               integral with no convergence, an antiderivative of something
//               it cannot differentiate. Never reported as either of the above.
//
// When a derivative claim is wrong, the checker also says HOW, because "wrong"
// is useless to a reply that has to fix it: the sign, a missing chain-rule
// factor, a quotient rule with its numerator added, the product rule applied
// as f′g′, the derivative of the neighbouring function (sec for csc), a
// constant factor. Each diagnosis is itself computed — the claim is compared
// with the derivative that mistake would produce — not inferred from its look.
//
// PURE.

import { parse, print, simplify, differentiate, substitute, namesOf, type Expr } from '@/lib/model/expr';
import { parseUnit } from '@/lib/numeric/dimensional';
import { toGrammar, unicodeToPlain, isSymbolName } from './notation';
import { agree, compile, evalNumber, integrate, limitAt, limitFrom, realRoots, scopes, show, type Agreement, type Evaluator } from './numeric-check';
import type { Claim, Posed } from './claims';

export type Status = 'verified' | 'refuted' | 'consistent' | 'unchecked';

export interface Verdict {
  claim: Claim;
  status: Status;
  /** what the engine computed, in the evaluator's notation, when it computed something */
  computed?: string;
  /** what exactly is wrong, in a clause a reply could use */
  why?: string;
  /** how it was decided */
  method: 'symbolic' | 'differentiation' | 'quadrature' | 'limit' | 'evaluation' | 'substitution' | 'scan' | 'units' | 'none';
  /** an honest qualification: a partial domain, the window searched, a convention */
  caveat?: string;
}

/** The engine's notation, a little easier on the eye: products as a middle dot. */
export function pretty(grammar: string): string {
  return grammar.replace(/\s\*\s/g, '·');
}

/**
 * A claim written out the same way however it arrived — LaTeX, Unicode or
 * prose — so the block a reply reads quotes it unambiguously.
 */
export function describe(c: Claim): string {
  const at = (v: number) => (v === Infinity ? '∞' : v === -Infinity ? '−∞' : show(v));
  switch (c.kind) {
    case 'derivative':
      return `${c.order === 2 ? `d²/d${c.wrt}²` : `d/d${c.wrt}`}[${pretty(c.subject)}] = ${pretty(c.claimed)}`;
    case 'antiderivative':
      return `∫ ${pretty(c.integrand)} d${c.wrt} = ${pretty(c.claimed)} + C`;
    case 'definite':
      return `∫ from ${pretty(c.lower)} to ${pretty(c.upper)} of ${pretty(c.integrand)} d${c.wrt} ${c.approx ? '≈' : '='} ${pretty(c.claimed)}`;
    case 'limit':
      return `lim ${c.wrt}→${at(c.at)}${c.side > 0 ? '⁺' : c.side < 0 ? '⁻' : ''} of ${pretty(c.subject)} = ${c.claimed}`;
    case 'equal':
      return `${pretty(c.left)} = ${pretty(c.right)}`;
    case 'arithmetic':
      return `${pretty(c.left)} ${c.approx ? '≈' : '='} ${pretty(c.right)}`;
    case 'solution':
      return `${c.variable} = ${c.values.map(pretty).join(', ')}`;
    case 'set':
      return `the ${c.which} of ${pretty(c.subject)} is ${c.set}`;
    case 'unit':
      return c.text;
  }
}

// ── expressions ────────────────────────────────────────────────────────

// Every name a parameter may have. Not `e`: a legal name outranks a constant
// in the lexer, so listing it would turn Euler's number into a variable.
const LEGAL = [...'abcdfghijklmnopqrstuvwxyz', 'theta', 'phi', 'alpha', 'beta', 'gamma', 'omega', 'lambda', 'mu', 'sigma', 'rho', 'tau_', 'psi'];

function names(grammar: string, main: string): string[] {
  const out = [main];
  const tree = parse(grammar, LEGAL);
  for (const n of tree ? namesOf(tree) : []) if (!out.includes(n) && isSymbolName(n)) out.push(n);
  return out;
}

function nthDerivative(e: Expr, wrt: string, order: 1 | 2): Expr | null {
  let cur = e;
  for (let i = 0; i < order; i++) {
    const d = differentiate(cur, wrt);
    if (!d.ok) return null;
    cur = d.got.expr;
  }
  return cur;
}

const evaluator = (e: Expr, ns: readonly string[]): Evaluator | null => compile(print(e), ns);
const depends = (e: Expr, wrt: string) => namesOf(e).includes(wrt);
const num = (v: number): Expr => ({ k: 'num', v });

/** f′ at u, with u's own derivative left out: the outer derivative of a call. */
function outer(fn: string, arg: Expr): Expr | null {
  const d = differentiate({ k: 'call', fn, args: [{ k: 'name', id: 'u__' }] }, 'u__');
  return d.ok ? substitute(d.got.expr, { u__: arg }) : null;
}

/**
 * The derivative a particular, common mistake produces. Mirrors the real
 * rules everywhere except the one being mis-applied, so a claim that matches
 * it was made by exactly that mistake.
 */
function mistaken(e: Expr, wrt: string, mistake: 'chain' | 'quotient' | 'product'): Expr | null {
  const d = (n: Expr): Expr | null => {
    switch (n.k) {
      case 'num':
        return num(0);
      case 'name':
        return num(n.id === wrt ? 1 : 0);
      case 'neg': {
        const a = d(n.a);
        return a && { k: 'neg', a };
      }
      case 'add':
      case 'sub': {
        const a = d(n.a);
        const b = d(n.b);
        return a && b ? { k: n.k, a, b } : null;
      }
      case 'mul': {
        const da = d(n.a);
        const db = d(n.b);
        if (!da || !db) return null;
        if (mistake === 'product' && depends(n.a, wrt) && depends(n.b, wrt)) return { k: 'mul', a: da, b: db };
        return { k: 'add', a: { k: 'mul', a: da, b: n.b }, b: { k: 'mul', a: n.a, b: db } };
      }
      case 'div': {
        const da = d(n.a);
        const db = d(n.b);
        if (!da || !db) return null;
        const top: Expr = mistake === 'quotient'
          ? { k: 'add', a: { k: 'mul', a: da, b: n.b }, b: { k: 'mul', a: n.a, b: db } }
          : { k: 'sub', a: { k: 'mul', a: da, b: n.b }, b: { k: 'mul', a: n.a, b: db } };
        return { k: 'div', a: top, b: { k: 'pow', a: n.b, b: num(2) } };
      }
      case 'pow': {
        const exp = simplify(n.b);
        if (exp.k !== 'num') {
          // a^u, e^(2x): (a^u)·ln(a)·u′ — the u′ is the chain factor.
          const base = simplify(n.a);
          if (base.k === 'num' && base.v > 0) {
            const du = d(n.b);
            if (!du) return null;
            const outerPart: Expr = { k: 'mul', a: n, b: { k: 'call', fn: 'ln', args: [base] } };
            return mistake === 'chain' && n.b.k !== 'name' ? outerPart : { k: 'mul', a: outerPart, b: du };
          }
          const g = differentiate(n, wrt);
          return g.ok ? g.got.expr : null;
        }
        const da = d(n.a);
        if (!da) return null;
        const outerPart: Expr = { k: 'mul', a: exp, b: { k: 'pow', a: n.a, b: num(exp.v - 1) } };
        return mistake === 'chain' && n.a.k !== 'name' ? outerPart : { k: 'mul', a: outerPart, b: da };
      }
      case 'call': {
        if (n.args.length !== 1) return null;
        const o = outer(n.fn, n.args[0]);
        const da = d(n.args[0]);
        if (!o || !da) return null;
        return mistake === 'chain' && n.args[0].k !== 'name' ? o : { k: 'mul', a: o, b: da };
      }
      default:
        return null;
    }
  };
  const got = d(e);
  return got ? simplify(got) : null;
}

const SIBLING: Record<string, string> = { sin: 'cos', cos: 'sin', tan: 'cot', cot: 'tan', sec: 'csc', csc: 'sec' };

/** Peel a constant factor and a minus sign off the front: −3·csc(2x) → csc(2x). */
function core(e: Expr): Expr {
  if (e.k === 'neg') return core(e.a);
  if (e.k === 'mul' && e.a.k === 'num') return core(e.b);
  return e;
}

/** Name the mistake that turns the right derivative into the claimed one, when one does. */
function diagnose(subject: Expr, wrt: string, ns: readonly string[], params: readonly string[], claimed: Evaluator, a: Agreement): string | undefined {
  if (a.ratio !== undefined && Math.abs(a.ratio + 1) < 1e-6) return 'the sign is wrong — the whole result should be negated';
  const matches = (alt: Expr | null) => {
    if (!alt) return false;
    const ev = evaluator(alt, ns);
    return !!ev && agree(ev, claimed, wrt, params).verdict === 'equal';
  };
  if (matches(mistaken(subject, wrt, 'chain'))) return "the chain-rule factor is missing: the outer derivative was not multiplied by the derivative of the inside";
  if (matches(mistaken(subject, wrt, 'quotient'))) return "the quotient rule's numerator is f′g − fg′; here the two terms were added";
  if (matches(mistaken(subject, wrt, 'product'))) return 'the product rule is f′g + fg′, not f′·g′';
  const c = core(subject);
  if (c.k === 'call' && SIBLING[c.fn]) {
    const sib: Expr = { k: 'call', fn: SIBLING[c.fn], args: c.args };
    const d = differentiate(sib, wrt);
    if (d.ok && matches(d.got.expr)) return `that is the derivative of ${SIBLING[c.fn]}(…), not ${c.fn}(…)`;
    // Neighbour and sign together: d/dx csc x given as −sec x tan x.
    if (d.ok && matches({ k: 'neg', a: d.got.expr })) return `that is the derivative of ${SIBLING[c.fn]}(…) with its sign flipped, not the derivative of ${c.fn}(…)`;
  }
  if (a.ratio !== undefined) return `it is off by a factor of ${show(a.ratio)}`;
  if (a.offset !== undefined) return `it is off by a constant ${show(a.offset)}`;
  return undefined;
}

function counterexample(a: Agreement, wrt: string, what: string, claim: string): string | undefined {
  if (!a.witness) return undefined;
  const x = a.witness.at[wrt];
  return `at ${wrt} = ${show(x)}, ${what} is ${show(a.witness.a)} but ${claim} gives ${show(a.witness.b)}`;
}

// ── by kind ────────────────────────────────────────────────────────────

function checkDerivative(c: Extract<Claim, { kind: 'derivative' }>): Verdict {
  const ns = names(c.subject, c.wrt);
  const params = ns.filter((n) => n !== c.wrt);
  const subject = parse(c.subject, ns);
  const claimed = parse(c.claimed, ns);
  if (!subject || !claimed) return { claim: c, status: 'unchecked', method: 'none' };
  const d = nthDerivative(subject, c.wrt, c.order);
  if (!d) return { claim: c, status: 'unchecked', method: 'none', caveat: 'the engine cannot differentiate this expression' };
  const ed = evaluator(d, ns);
  const ec = evaluator(claimed, ns);
  if (!ed || !ec) return { claim: c, status: 'unchecked', method: 'none' };
  const a = agree(ed, ec, c.wrt, params);
  const computed = print(d);
  if (a.verdict === 'equal') return { claim: c, status: 'verified', computed, method: 'symbolic', ...(a.partial ? { caveat: 'the two forms agree wherever both are defined' } : {}) };
  if (a.verdict === 'unknown') return { claim: c, status: 'unchecked', computed, method: 'symbolic' };
  const why = (c.order === 1 ? diagnose(subject, c.wrt, ns, params, ec, a) : undefined) ?? counterexample(a, c.wrt, 'the derivative', 'the claimed form');
  return { claim: c, status: 'refuted', computed, method: 'symbolic', ...(why ? { why } : {}) };
}

function checkAntiderivative(c: Extract<Claim, { kind: 'antiderivative' }>): Verdict {
  const ns = names(`${c.integrand} + ${c.claimed}`, c.wrt);
  const params = ns.filter((n) => n !== c.wrt);
  const f = parse(c.integrand, ns);
  const F = parse(c.claimed, ns);
  if (!f || !F) return { claim: c, status: 'unchecked', method: 'none' };
  const dF = differentiate(F, c.wrt);
  if (!dF.ok) return { claim: c, status: 'unchecked', method: 'none', caveat: 'the claimed antiderivative cannot be differentiated by the engine' };
  const ef = evaluator(f, ns);
  const edF = evaluator(dF.got.expr, ns);
  if (!ef || !edF) return { claim: c, status: 'unchecked', method: 'none' };
  const a = agree(ef, edF, c.wrt, params);
  const back = print(dF.got.expr);
  if (a.verdict === 'equal') {
    // Right where it is defined — but is it defined wherever the integrand is?
    // ln(x) differentiates to 1/x and is undefined for x < 0, where 1/x is not.
    const eF = evaluator(F, ns);
    const narrower = !!eF && scopes(c.wrt, params).some((s) => {
      const fv = ef(s);
      const Fv = eF(s);
      return Number.isFinite(fv) && Math.abs(fv) < 1e9 && !Number.isFinite(Fv);
    });
    return { claim: c, status: 'verified', computed: back, method: 'differentiation', ...(a.partial || narrower ? { caveat: 'it is an antiderivative only where it is defined, which is not everywhere the integrand is — for 1/x, ln|x| + C covers x < 0 as well' } : {}) };
  }
  if (a.verdict === 'unknown') return { claim: c, status: 'unchecked', method: 'differentiation' };
  const why = a.ratio !== undefined && Math.abs(a.ratio + 1) < 1e-6
    ? 'the sign is wrong: differentiating it gives the negative of the integrand'
    : a.ratio !== undefined
      ? `differentiating it gives ${show(a.ratio)} times the integrand, so a constant factor is wrong`
      : `differentiating it gives ${pretty(back)}, which is not the integrand`;
  return { claim: c, status: 'refuted', computed: back, method: 'differentiation', why };
}

/**
 * How far a stated value may sit from the true one: one unit in its last
 * stated digit, so a rounded value (√2 = 1.414) and a truncated one
 * (π ≈ 3.1415) both stand, and a wrong one (π ≈ 3.24) does not. A whole
 * number with "=" is exact (2^10 = 1000 is wrong); with "≈" its trailing
 * zeros are its precision (≈ 1600 means to the hundred).
 */
function tolerance(statedGrammar: string, value: number, approx: boolean): number {
  const m = /^-?(\d+)(?:\.(\d+))?$/.exec(statedGrammar.trim());
  const rel = 1e-9 * Math.max(1, Math.abs(value));
  if (!m) return approx ? Math.max(rel, 1e-3 * Math.max(1, Math.abs(value))) : rel;
  const digits = m[2]?.length ?? 0;
  if (digits === 0) {
    if (!approx) return rel;
    const zeros = /0*$/.exec(m[1])![0].length;
    return Math.pow(10, Math.min(zeros, m[1].length - 1)) * 1.01 + rel;
  }
  return Math.pow(10, -digits) * 1.01 + rel;
}

function checkDefinite(c: Extract<Claim, { kind: 'definite' }>): Verdict {
  const f = compile(c.integrand, [c.wrt]);
  const lo = evalNumber(c.lower);
  const hi = evalNumber(c.upper);
  const claimed = evalNumber(c.claimed);
  if (!f || lo === null || hi === null || claimed === null) return { claim: c, status: 'unchecked', method: 'none' };
  const v = integrate((x) => f({ [c.wrt]: x }), lo, hi);
  if (v === null) return { claim: c, status: 'unchecked', method: 'quadrature', caveat: 'the integral did not converge numerically (a singularity inside the interval, or too oscillatory)' };
  const ok = Math.abs(v - claimed) <= tolerance(c.claimed, v, c.approx);
  return ok
    ? { claim: c, status: 'verified', computed: show(v), method: 'quadrature' }
    : { claim: c, status: 'refuted', computed: show(v), method: 'quadrature', why: `numerical integration gives ${show(v)}, not ${show(claimed)}` };
}

function checkLimit(c: Extract<Claim, { kind: 'limit' }>): Verdict {
  const f = compile(c.subject, [c.wrt]);
  if (!f) return { claim: c, status: 'unchecked', method: 'none' };
  const g = (x: number) => f({ [c.wrt]: x });
  const L = c.side === 0 ? limitAt(g, c.at) : limitFrom(g, c.at, c.side);
  if (!L) return { claim: c, status: 'unchecked', method: 'limit' };
  const claimedInf = /∞/.test(c.claimed) ? (c.claimed.startsWith('-') ? -1 : 1) : 0;
  const claimed = claimedInf ? null : evalNumber(c.claimed);
  if (!claimedInf && claimed === null) return { claim: c, status: 'unchecked', method: 'none' };
  if (L.kind === 'finite') {
    const ok = !claimedInf && Math.abs(L.value - claimed!) <= 1e-3 * Math.max(1, Math.abs(L.value));
    return ok
      ? { claim: c, status: 'verified', computed: show(L.value), method: 'limit' }
      : { claim: c, status: 'refuted', computed: show(L.value), method: 'limit', why: `approaching the point numerically settles at ${show(L.value)}` };
  }
  if (L.kind === 'infinite') {
    const ok = claimedInf === L.sign;
    return ok
      ? { claim: c, status: 'verified', computed: L.sign > 0 ? '∞' : '-∞', method: 'limit' }
      : { claim: c, status: 'refuted', computed: L.sign > 0 ? '∞' : '-∞', method: 'limit', why: `the function grows without bound (toward ${L.sign > 0 ? '+∞' : '−∞'}) there` };
  }
  // It does not settle. Refutable only when both sides settle on different values.
  if (c.side === 0 && Number.isFinite(c.at) && !claimedInf) {
    const lo = limitFrom(g, c.at, -1);
    const hi = limitFrom(g, c.at, 1);
    if (lo?.kind === 'finite' && hi?.kind === 'finite') {
      return { claim: c, status: 'refuted', method: 'limit', why: `the left and right limits differ (${show(lo.value)} and ${show(hi.value)}), so the two-sided limit does not exist` };
    }
  }
  return { claim: c, status: 'unchecked', method: 'limit', caveat: 'the values did not settle numerically' };
}

function checkEqual(c: Extract<Claim, { kind: 'equal' }>): Verdict {
  const all = names(`${c.left} + ${c.right}`, 'x').filter((n) => n !== 'x' || /\bx\b/.test(`${c.left} ${c.right}`));
  if (!all.length) return { claim: c, status: 'unchecked', method: 'none' };
  const main = all.includes('x') ? 'x' : all[0];
  const params = all.filter((n) => n !== main);
  const el = compile(c.left, all);
  const er = compile(c.right, all);
  if (!el || !er) return { claim: c, status: 'unchecked', method: 'none' };
  const a = agree(el, er, main, params);
  if (a.verdict === 'equal') return { claim: c, status: 'verified', method: 'evaluation', ...(a.partial ? { caveat: 'the two sides agree wherever both are defined, but one is defined where the other is not' } : {}) };
  if (a.verdict === 'unknown') return { claim: c, status: 'unchecked', method: 'evaluation' };
  let why = counterexample(a, main, 'the left side', 'the right side')?.replace('the right side gives', 'the right side is');
  if (a.ratio !== undefined && Math.abs(a.ratio + 1) < 1e-6) why = `the two sides differ by a sign${why ? ` (${why})` : ''}`;
  if (c.why === 'reciprocal') {
    const recip: Record<string, string> = { csc: '1/sin', sec: '1/cos', cot: 'cos/sin (or 1/tan)', tan: 'sin/cos' };
    const fn = /^(sec|csc|cot|tan)\(/.exec(c.left)?.[1] ?? /^(sec|csc|cot|tan)\(/.exec(c.right)?.[1];
    if (fn) why = `${fn} is ${recip[fn]}${why ? `; ${why}` : ''}`;
  }
  return { claim: c, status: 'refuted', method: 'evaluation', ...(why ? { why } : {}) };
}

function checkArithmetic(c: Extract<Claim, { kind: 'arithmetic' }>): Verdict {
  const left = evalNumber(c.left);
  const right = evalNumber(c.right);
  if (left === null || right === null) return { claim: c, status: 'unchecked', method: 'none' };
  const ok = Math.abs(left - right) <= tolerance(c.right, left, c.approx);
  return ok
    ? { claim: c, status: 'verified', computed: show(left), method: 'evaluation' }
    : { claim: c, status: 'refuted', computed: show(left), method: 'evaluation', why: `${pretty(c.left)} evaluates to ${show(left)}, not ${show(right)}` };
}

export interface Equation { left: string; right: string; variable: string }

const PERIODIC = /\b(?:sin|cos|tan|sec|csc|cot)\(/;

function checkSolution(c: Extract<Claim, { kind: 'solution' }>, eq: Equation | null): Verdict {
  if (!eq || eq.variable !== c.variable) return { claim: c, status: 'unchecked', method: 'none' };
  const L = compile(eq.left, [eq.variable]);
  const R = compile(eq.right, [eq.variable]);
  if (!L || !R) return { claim: c, status: 'unchecked', method: 'none' };
  const at = (x: number) => ({ l: L({ [eq.variable]: x }), r: R({ [eq.variable]: x }) });
  const f = (x: number) => {
    const { l, r } = at(x);
    return l - r;
  };
  const values: number[] = [];
  for (const g of c.values) {
    const v = evalNumber(g);
    if (v === null) return { claim: c, status: 'unchecked', method: 'none' };
    const { l, r } = at(v);
    if (!Number.isFinite(l) || !Number.isFinite(r)) {
      return { claim: c, status: 'refuted', method: 'substitution', why: `${c.variable} = ${show(v)} is outside the equation's domain — one side is undefined there` };
    }
    const scale = Math.max(1, Math.abs(l), Math.abs(r));
    let satisfied = Math.abs(l - r) <= 1e-7 * scale;
    // A rounded decimal is a solution if a root lies within its rounding.
    const digits = /^-?\d+\.(\d+)$/.exec(g)?.[1]?.length ?? 0;
    if (!satisfied && digits >= 2) {
      const d = 0.5 * Math.pow(10, -digits) * 1.01;
      const a = f(v - d);
      const b = f(v + d);
      satisfied = (Number.isFinite(a) && Number.isFinite(b) && a * b <= 0) || Math.min(Math.abs(a), Math.abs(b)) <= 1e-7 * scale;
    }
    if (!satisfied) {
      return { claim: c, status: 'refuted', method: 'substitution', why: `substituting ${c.variable} = ${show(v)} gives ${show(l)} on the left and ${show(r)} on the right` };
    }
    values.push(v);
  }
  // Every root accounted for — only where a bounded scan can say so.
  if (c.complete && !PERIODIC.test(`${eq.left} ${eq.right}`)) {
    const roots = realRoots(f, -1000, 1000);
    if (roots.length && roots.length <= 12) {
      const missing = roots.filter((r) => !values.some((v) => Math.abs(v - r) <= 1e-4 * Math.max(1, Math.abs(r))));
      if (missing.length) {
        return { claim: c, status: 'refuted', computed: roots.map(show).join(', '), method: 'scan', why: `it misses ${missing.map((m) => `${c.variable} = ${show(m)}`).join(' and ')}` };
      }
      return { claim: c, status: 'verified', computed: roots.map(show).join(', '), method: 'substitution', caveat: 'every real solution in −1000…1000 is accounted for' };
    }
  }
  return { claim: c, status: 'verified', method: 'substitution', ...(c.complete ? { caveat: 'each value satisfies the equation; whether it lists every solution was not checked' } : {}) };
}

// ── domains and ranges ─────────────────────────────────────────────────

interface SetPred { has: (v: number) => boolean; edges: number[] }

const ALL_REALS = /^(?:all real numbers|all reals|all real (?:x|values(?: of x)?)|every real number|the real line|the reals|all x|ℝ|\(-∞, ?∞\)|\(-inf, ?inf\))$/;

function bound(raw: string): number | null {
  const t = raw.trim();
  if (/^\+?(?:∞|inf(?:inity)?)$/.test(t)) return Infinity;
  if (/^-(?:∞|inf(?:inity)?)$/.test(t)) return -Infinity;
  const g = toGrammar(t);
  return g ? evalNumber(g) : null;
}

function piece(p: string): SetPred | null {
  const t = p.trim();
  let m: RegExpExecArray | null;
  if (ALL_REALS.test(t)) return { has: () => true, edges: [] };
  if (/^(?:all )?positive(?: real)?(?: numbers)?$/.test(t)) return { has: (v) => v > 0, edges: [0] };
  if (/^(?:all )?(?:non-?negative)(?: real)?(?: numbers)?$/.test(t)) return { has: (v) => v >= 0, edges: [0] };
  if (/^(?:all )?negative(?: real)?(?: numbers)?$/.test(t)) return { has: (v) => v < 0, edges: [0] };
  if ((m = /^([[(])\s*([^,]+?)\s*,\s*([^,]+?)\s*([\])])$/.exec(t))) {
    const a = bound(m[2]);
    const b = bound(m[3]);
    if (a === null || b === null || a > b) return null;
    const lc = m[1] === '[';
    const rc = m[4] === ']';
    return { has: (v) => (lc ? v >= a : v > a) && (rc ? v <= b : v < b), edges: [a, b].filter(Number.isFinite) };
  }
  if ((m = /^(.+?)\s*(≤|<)\s*([a-z])\s*(≤|<)\s*(.+)$/.exec(t))) {
    const a = bound(m[1]);
    const b = bound(m[5]);
    if (a === null || b === null) return null;
    return { has: (v) => (m![2] === '≤' ? v >= a : v > a) && (m![4] === '≤' ? v <= b : v < b), edges: [a, b].filter(Number.isFinite) };
  }
  if ((m = /^([a-z])\s*(≥|>|≤|<|≠)\s*(.+)$/.exec(t))) {
    const a = bound(m[3]);
    if (a === null) return null;
    const op = m[2];
    const has = op === '≥' ? (v: number) => v >= a : op === '>' ? (v: number) => v > a : op === '≤' ? (v: number) => v <= a : op === '<' ? (v: number) => v < a : (v: number) => v !== a;
    return { has, edges: Number.isFinite(a) ? [a] : [] };
  }
  if ((m = /^(.+?)\s*(≤|<|≥|>)\s*([a-z])$/.exec(t))) {
    const flip: Record<string, string> = { '≤': '≥', '<': '>', '≥': '≤', '>': '<' };
    return piece(`${m[3]} ${flip[m[2]]} ${m[1]}`);
  }
  return null;
}

/** A set as written — intervals, inequalities, "all real numbers except 0" — as a membership test. */
export function parseSet(raw: string): SetPred | null {
  let t = unicodeToPlain(raw).toLowerCase().replace(/\s+/g, ' ').replace(/[.;]+$/, '').trim();
  t = t.replace(/^(?:the set of |all of )/, '').replace(/\bx\s*∈\s*/, '');
  t = t.replace(/\bgreater than or equal to\b|\bat least\b/g, '≥').replace(/\bless than or equal to\b|\bat most\b/g, '≤')
    .replace(/\bgreater than\b/g, '>').replace(/\bless than\b/g, '<').replace(/\bnot equal to\b/g, '≠');
  // "all real numbers ≥ 2" is x ≥ 2.
  const implicit = /^(?:all )?(?:real )?(?:numbers|values|reals|x(?: values)?)\s*(?:that are |which are )?([≥>≤<≠].*)$/.exec(t);
  if (implicit) return piece(`x ${implicit[1]}`);
  // "all real numbers except 0 and 2", "ℝ ∖ ⦃0⦄", "x ≠ 0"
  const ex = /^(.+?)\s*(?:,\s*)?(?:except(?: for)?|excluding|other than|apart from|besides|but not|∖)\s+(.+)$/.exec(t);
  if (ex) {
    const base = parseSet(ex[1]);
    const vals = ex[2].replace(/^⦃|⦄$/g, '').replace(/\b[a-z]\s*=\s*/g, '').split(/\s*(?:,|\band\b|\bor\b)\s*/).filter(Boolean).map(bound);
    if (!base || !vals.length || vals.some((v) => v === null || !Number.isFinite(v))) return null;
    const out = vals as number[];
    return { has: (v) => base.has(v) && !out.some((o) => Math.abs(o - v) < 1e-12), edges: [...base.edges, ...out] };
  }
  // Unions: ∪, "or", and "U" between intervals.
  const unions = t.split(/\s*(?:∪|\bor\b|(?<=[\])])\s*u\s*(?=[[(]))\s*/);
  if (unions.length > 1) {
    const ps = unions.map(parseSet);
    if (ps.some((p) => !p)) return null;
    return { has: (v) => ps.some((p) => p!.has(v)), edges: ps.flatMap((p) => p!.edges) };
  }
  // Intersections of inequalities: "x > 0 and x ≠ 1".
  const ands = t.split(/\s*(?:\band\b|,)\s*(?=[a-z]\s*[≥>≤<≠])/);
  if (ands.length > 1) {
    const ps = ands.map(piece);
    if (ps.some((p) => !p)) return null;
    return { has: (v) => ps.every((p) => p!.has(v)), edges: ps.flatMap((p) => p!.edges) };
  }
  return piece(t);
}

function testPoints(edges: number[]): number[] {
  const pts = new Set<number>();
  for (let i = -400; i <= 400; i++) pts.add(i / 20);
  for (let k = -8; k <= 8; k++) {
    pts.add((k * Math.PI) / 2);
    pts.add((k * Math.PI) / 4);
  }
  for (const e of edges) for (const d of [0, 1e-6, -1e-6, 0.25, -0.25, 1, -1]) pts.add(e + d);
  for (const big of [-1000, -100, -37.5, 37.5, 100, 1000]) pts.add(big);
  return [...pts];
}

function checkSet(c: Extract<Claim, { kind: 'set' }>): Verdict {
  const set = parseSet(c.set);
  const f = compile(c.subject, [c.variable]);
  if (!set || !f) return { claim: c, status: 'unchecked', method: 'none' };
  const pts = testPoints(set.edges);
  const nearEdge = (x: number) => set.edges.some((e) => x !== e && Math.abs(x - e) < 1e-5);
  const fractional = /\^\s*\(?\s*-?\d+\s*\/\s*\d+/.test(c.subject) || /cbrt\(/.test(c.subject);
  const caveat = fractional ? 'powers are read as real roots: x^(1/3) is defined for negative x, x^(1/2) is not' : undefined;
  if (c.which === 'domain') {
    for (const x of pts) {
      if (nearEdge(x)) continue;
      const v = f({ [c.variable]: x });
      const defined = Number.isFinite(v) && Math.abs(v) < 1e9;
      if (defined !== set.has(x)) {
        const why = defined
          ? `${c.variable} = ${show(x)} belongs in the domain (the function is ${show(v)} there) but the stated domain leaves it out`
          : `${c.variable} = ${show(x)} is in the stated domain but the function is undefined there`;
        return { claim: c, status: 'refuted', method: 'scan', why, ...(caveat ? { caveat } : {}) };
      }
    }
    return { claim: c, status: 'consistent', method: 'scan', caveat: `no counterexample in a scan of ${pts.length} points; a scan is not a proof${caveat ? `. ${caveat}` : ''}` };
  }
  for (const x of [...pts, ...Array.from({ length: 2001 }, (_, i) => -50 + i * 0.05)]) {
    const y = f({ [c.variable]: x });
    if (!Number.isFinite(y) || Math.abs(y) >= 1e9) continue;
    const slack = 1e-9 * Math.max(1, Math.abs(y));
    if (!set.has(y) && !set.has(y + slack) && !set.has(y - slack)) {
      return { claim: c, status: 'refuted', method: 'scan', why: `at ${c.variable} = ${show(x)} the function is ${show(y)}, which is outside the stated range`, ...(caveat ? { caveat } : {}) };
    }
  }
  return { claim: c, status: 'consistent', method: 'scan', caveat: 'no value outside the stated range in a scan; whether every value in it is reached was not checked' };
}

// ── units ──────────────────────────────────────────────────────────────

/** Units parseUnit does not know, in terms of ones it does. Temperatures are refused: they are affine. */
const EXTRA: Record<string, [number, string]> = {
  mi: [1609.344, 'm'], mile: [1609.344, 'm'], miles: [1609.344, 'm'], yd: [0.9144, 'm'], yard: [0.9144, 'm'], yards: [0.9144, 'm'],
  foot: [0.3048, 'm'], feet: [0.3048, 'm'], inch: [0.0254, 'm'], inches: [0.0254, 'm'], nmi: [1852, 'm'],
  meter: [1, 'm'], meters: [1, 'm'], metre: [1, 'm'], metres: [1, 'm'], kilometer: [1000, 'm'], kilometers: [1000, 'm'], kilometre: [1000, 'm'], kilometres: [1000, 'm'],
  centimeter: [0.01, 'm'], centimeters: [0.01, 'm'], millimeter: [0.001, 'm'], millimeters: [0.001, 'm'],
  mph: [0.44704, 'm/s'], kph: [1 / 3.6, 'm/s'], knot: [1852 / 3600, 'm/s'], knots: [1852 / 3600, 'm/s'],
  lb: [0.45359237, 'kg'], lbs: [0.45359237, 'kg'], pound: [0.45359237, 'kg'], pounds: [0.45359237, 'kg'],
  oz: [0.028349523125, 'kg'], ounce: [0.028349523125, 'kg'], ounces: [0.028349523125, 'kg'],
  gram: [0.001, 'kg'], grams: [0.001, 'kg'], kilogram: [1, 'kg'], kilograms: [1, 'kg'], tonne: [1000, 'kg'], tonnes: [1000, 'kg'],
  gal: [0.003785411784, 'm^3'], gallon: [0.003785411784, 'm^3'], gallons: [0.003785411784, 'm^3'],
  liter: [0.001, 'm^3'], liters: [0.001, 'm^3'], litre: [0.001, 'm^3'], litres: [0.001, 'm^3'], ml: [1e-6, 'm^3'], milliliter: [1e-6, 'm^3'], milliliters: [1e-6, 'm^3'],
  second: [1, 's'], seconds: [1, 's'], sec: [1, 's'], secs: [1, 's'], minute: [60, 's'], minutes: [60, 's'], mins: [60, 's'],
  hour: [3600, 's'], hours: [3600, 's'], hrs: [3600, 's'], week: [604800, 's'], weeks: [604800, 's'],
  acre: [4046.8564224, 'm^2'], acres: [4046.8564224, 'm^2'], hectare: [1e4, 'm^2'], hectares: [1e4, 'm^2'], ha: [1e4, 'm^2'],
  cal: [4.184, 'J'], kcal: [4184, 'J'], eV: [1.602176634e-19, 'J'], psi: [6894.757293168, 'Pa'], mmHg: [133.322387415, 'Pa'],
};

function unitOf(raw: string): { dims: number[]; si: number } | null {
  const u = raw.trim();
  if (/°|^deg|celsius|fahrenheit|kelvin|^[KFC]$/i.test(u)) return null;
  const extra = EXTRA[u] ?? EXTRA[u.toLowerCase()];
  if (extra) {
    const base = parseUnit(extra[1]);
    return base ? { dims: base.dims, si: base.si * extra[0] } : null;
  }
  const p = parseUnit(u);
  return p ? { dims: p.dims, si: p.si } : null;
}

function checkUnit(c: Extract<Claim, { kind: 'unit' }>): Verdict {
  const a = unitOf(c.leftUnit);
  const b = unitOf(c.rightUnit);
  const lv = Number(c.leftValue);
  const rv = Number(c.rightValue);
  if (!a || !b || !Number.isFinite(lv) || !Number.isFinite(rv)) return { claim: c, status: 'unchecked', method: 'none' };
  if (a.dims.some((d, i) => Math.abs(d - b.dims[i]) > 1e-9)) {
    return { claim: c, status: 'refuted', method: 'units', why: `${c.leftUnit} and ${c.rightUnit} measure different things, so no number makes them equal` };
  }
  const converted = (lv * a.si) / b.si;
  const ok = Math.abs(converted - rv) <= tolerance(c.rightValue, converted, c.approx);
  return ok
    ? { claim: c, status: 'verified', computed: `${show(converted)} ${c.rightUnit}`, method: 'units' }
    : { claim: c, status: 'refuted', computed: `${show(converted)} ${c.rightUnit}`, method: 'units', why: `${c.leftValue} ${c.leftUnit} is ${show(converted)} ${c.rightUnit}` };
}

// ── the public face ────────────────────────────────────────────────────

export interface CheckContext {
  /** the equation on the table, for solution claims */
  equation?: Equation | null;
}

export function checkClaim(c: Claim, ctx: CheckContext = {}): Verdict {
  try {
    switch (c.kind) {
      case 'derivative': return checkDerivative(c);
      case 'antiderivative': return checkAntiderivative(c);
      case 'definite': return checkDefinite(c);
      case 'limit': return checkLimit(c);
      case 'equal': return checkEqual(c);
      case 'arithmetic': return checkArithmetic(c);
      case 'solution': return checkSolution(c, ctx.equation ?? null);
      case 'set': return checkSet(c);
      case 'unit': return checkUnit(c);
    }
  } catch {
    // A checker that throws must never take the reply with it.
    return { claim: c, status: 'unchecked', method: 'none' };
  }
}

// ── computing what was asked ───────────────────────────────────────────

export interface Computed {
  posed: Posed;
  /** the result, or null when the engine could not produce one */
  result: string | null;
  how: string;
  /** the same result reached another valid way, each one checked equal */
  alternatives: { method: string; form: string }[];
  note?: string;
}

const RECIPROCALS: Record<string, (u: Expr) => Expr> = {
  csc: (u) => ({ k: 'div', a: num(1), b: { k: 'call', fn: 'sin', args: [u] } }),
  sec: (u) => ({ k: 'div', a: num(1), b: { k: 'call', fn: 'cos', args: [u] } }),
  cot: (u) => ({ k: 'div', a: { k: 'call', fn: 'cos', args: [u] }, b: { k: 'call', fn: 'sin', args: [u] } }),
  tan: (u) => ({ k: 'div', a: { k: 'call', fn: 'sin', args: [u] }, b: { k: 'call', fn: 'cos', args: [u] } }),
};
const AS_POWER: Record<string, (u: Expr) => Expr> = {
  csc: (u) => ({ k: 'pow', a: { k: 'call', fn: 'sin', args: [u] }, b: num(-1) }),
  sec: (u) => ({ k: 'pow', a: { k: 'call', fn: 'cos', args: [u] }, b: num(-1) }),
  cot: (u) => ({ k: 'pow', a: { k: 'call', fn: 'tan', args: [u] }, b: num(-1) }),
};

function rewrite(e: Expr, table: Record<string, (u: Expr) => Expr>): Expr {
  switch (e.k) {
    case 'num':
    case 'name':
      return e;
    case 'neg':
      return { k: 'neg', a: rewrite(e.a, table) };
    case 'call': {
      const args = e.args.map((a) => rewrite(a, table));
      return table[e.fn] && args.length === 1 ? table[e.fn](args[0]) : { k: 'call', fn: e.fn, args };
    }
    default:
      return { k: e.k, a: rewrite(e.a, table), b: rewrite(e.b, table) };
  }
}

/** The same derivative by the quotient rule and by the chain rule, when the subject has reciprocal trig in it. */
function otherMethods(subject: Expr, wrt: string, ns: readonly string[], direct: Expr): { method: string; form: string }[] {
  const out: { method: string; form: string }[] = [];
  const ed = evaluator(direct, ns);
  if (!ed) return out;
  const params = ns.filter((n) => n !== wrt);
  const tries: [string, Record<string, (u: Expr) => Expr>][] = [
    ['quotient rule, writing csc, sec, cot and tan as quotients of sin and cos', RECIPROCALS],
    ['chain rule, writing csc, sec and cot as (sin)^-1, (cos)^-1 and (tan)^-1', AS_POWER],
  ];
  for (const [method, table] of tries) {
    const rewritten = rewrite(subject, table);
    if (print(rewritten) === print(subject)) continue;
    const d = differentiate(rewritten, wrt);
    if (!d.ok) continue;
    const ev = evaluator(d.got.expr, ns);
    if (ev && agree(ed, ev, wrt, params).verdict === 'equal') out.push({ method, form: print(d.got.expr) });
  }
  return out;
}

/** What the engine can compute for a problem somebody posed, before anyone answers it. */
export function computePosed(p: Posed): Computed {
  try {
    if (p.kind === 'derivative') {
      const ns = names(p.subject, p.wrt);
      const tree = parse(p.subject, ns);
      const d = tree ? nthDerivative(tree, p.wrt, p.order) : null;
      if (!tree || !d) return { posed: p, result: null, how: 'symbolic differentiation', alternatives: [], note: 'the engine could not differentiate this' };
      return { posed: p, result: print(d), how: 'symbolic differentiation', alternatives: p.order === 1 ? otherMethods(tree, p.wrt, ns, d) : [] };
    }
    if (p.kind === 'definite') {
      const f = compile(p.integrand, [p.wrt]);
      const lo = evalNumber(p.lower);
      const hi = evalNumber(p.upper);
      const v = f && lo !== null && hi !== null ? integrate((x) => f({ [p.wrt]: x }), lo, hi) : null;
      return { posed: p, result: v === null ? null : show(v), how: 'numerical integration (adaptive Gauss–Kronrod); a decimal, not an exact form', alternatives: [], ...(v === null ? { note: 'it did not converge numerically' } : {}) };
    }
    if (p.kind === 'limit') {
      const f = compile(p.subject, [p.wrt]);
      const g = f ? (x: number) => f({ [p.wrt]: x }) : null;
      const L = g ? (p.side === 0 ? limitAt(g, p.at) : limitFrom(g, p.at, p.side)) : null;
      const result = !L ? null : L.kind === 'finite' ? show(L.value) : L.kind === 'infinite' ? (L.sign > 0 ? '∞' : '-∞') : 'does not exist (the values do not settle)';
      return { posed: p, result, how: 'numerical approach to the point from both sides', alternatives: [] };
    }
    if (p.kind === 'equation') {
      const L = compile(p.left, [p.variable]);
      const R = compile(p.right, [p.variable]);
      if (!L || !R) return { posed: p, result: null, how: 'root finding', alternatives: [] };
      const f = (x: number) => L({ [p.variable]: x }) - R({ [p.variable]: x });
      const periodic = PERIODIC.test(`${p.left} ${p.right}`);
      const [lo, hi] = periodic ? [0, 2 * Math.PI] : [-1000, 1000];
      const roots = realRoots(f, lo, hi);
      if (roots.length > 12) return { posed: p, result: null, how: 'root finding', alternatives: [], note: 'too many roots to list' };
      const window = periodic ? 'in [0, 2π) — the equation is periodic, so add the period to get the rest' : 'in −1000…1000';
      return { posed: p, result: roots.length ? roots.map((r) => `${p.variable} = ${show(r)}`).join(', ') : 'no real solutions', how: `numerical root finding ${window}`, alternatives: [] };
    }
    if (p.kind === 'identity') {
      const all = [...new Set([...names(p.left, 'x'), ...names(p.right, 'x')])].filter((n) => /\bx\b/.test(`${p.left} ${p.right}`) || n !== 'x');
      const main = all.includes('x') ? 'x' : all[0];
      const el = main ? compile(p.left, all) : null;
      const er = main ? compile(p.right, all) : null;
      if (!el || !er) return { posed: p, result: null, how: 'evaluation', alternatives: [] };
      const a = agree(el, er, main, all.filter((n) => n !== main));
      const result = a.verdict === 'equal' ? 'holds (the two sides agree at every comparison point)'
        : a.verdict === 'differ' ? `does not hold (${counterexample(a, main, 'the left side', 'the right side')?.replace('the right side gives', 'the right side is') ?? 'the sides differ'})`
          : null;
      return { posed: p, result, how: 'evaluation at fixed points', alternatives: [] };
    }
    return { posed: p, result: null, how: 'none', alternatives: [], note: 'the engine does not integrate symbolically; an answer can still be checked by differentiating it' };
  } catch {
    return { posed: p, result: null, how: 'none', alternatives: [] };
  }
}
