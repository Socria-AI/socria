// lib/new-logos/expr.ts — THE EXPRESSION LANGUAGE of composable artifacts: parsed, evaluated, never executed.
//
// Equations, plotted functions, table formulas and the live values in text all speak one small mathematical language:
// numbers, names, + − × ÷ ^ %, comparisons (true is 1), brackets, implicit multiplication where it is unambiguous
// (2x, 3(x+1), (a)(b)), and a fixed set of functions. An expression is TOKENISED and PARSED into a tree here and
// EVALUATED by walking that tree: there is no eval, no Function constructor, no property access and no way to reach
// anything but numbers. Arbitrary code execution is out of scope on purpose (docs/NEW-LOGOS.md).
//
// The same tree is written out as LaTeX for display, so what a person sees is drawn from the structure, never stored as
// markup; and identifiers are found and renamed by token, so renaming a variable rewrites every expression that uses it
// without touching anything else.
//
// Pure: no I/O.

export const EXPR_LIMITS = { length: 500, nodes: 400, depth: 48, callDepth: 24, steps: 20_000 } as const;

export type Ast =
  | { t: 'num'; v: number }
  | { t: 'id'; n: string }
  | { t: 'un'; op: '-' | '+' | '!'; a: Ast }
  | { t: 'bin'; op: Bin; a: Ast; b: Ast }
  | { t: 'call'; f: string; args: Ast[] };
type Bin = '+' | '-' | '*' | '/' | '^' | '%' | '<' | '<=' | '>' | '>=' | '==' | '!=' | '&&' | '||';

interface Tok {
  k: 'num' | 'id' | 'op' | '(' | ')' | ',';
  s: string;
  at: number;
}

/** A lookup table with no prototype: a name like "constructor" or "__proto__" finds nothing in it. */
const table = <T>(o: Record<string, T>): Record<string, T> => Object.assign(Object.create(null) as Record<string, T>, o);
const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/** Built-in functions: name → arity range. */
export const FUNCTIONS: Record<string, [number, number]> = table({
  sin: [1, 1], cos: [1, 1], tan: [1, 1], asin: [1, 1], acos: [1, 1], atan: [1, 1], atan2: [2, 2],
  sinh: [1, 1], cosh: [1, 1], tanh: [1, 1], sqrt: [1, 1], cbrt: [1, 1], abs: [1, 1], exp: [1, 1],
  ln: [1, 1], log: [1, 2], log10: [1, 1], log2: [1, 1], floor: [1, 1], ceil: [1, 1], round: [1, 2],
  sign: [1, 1], min: [1, 12], max: [1, 12], pow: [2, 2], mod: [2, 2], clamp: [3, 3], if: [3, 3],
});
export const CONSTANTS: Record<string, number> = table({ pi: Math.PI, e: Math.E, tau: Math.PI * 2 });
/** Names a person cannot give a variable, equation or column: they already mean something (here, or to JavaScript
 *  objects, which a name must never reach). */
export const RESERVED = new Set([
  ...Object.keys(FUNCTIONS),
  ...Object.keys(CONSTANTS),
  'and', 'or', 'not', 'true', 'false', 'infinity',
  ...Object.getOwnPropertyNames(Object.prototype).map((k) => k.toLowerCase()),
  'prototype',
]);

export const IDENT_RE = /^(?!__)[A-Za-z_][A-Za-z0-9_]{0,31}$/;
export const isIdent = (s: unknown): s is string => typeof s === 'string' && IDENT_RE.test(s) && !RESERVED.has(s.toLowerCase());

export class ExprError extends Error {
  at: number;
  constructor(message: string, at = -1) {
    super(message);
    this.name = 'ExprError';
    this.at = at;
  }
}

// ── tokens ───────────────────────────────────────────────────────────

export function tokenize(src: string): Tok[] {
  if (src.length > EXPR_LIMITS.length) throw new ExprError(`Too long: ${EXPR_LIMITS.length} characters at most.`);
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      const m = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(src.slice(i));
      if (!m) throw new ExprError(`Unexpected “${c}”.`, i);
      out.push({ k: 'num', s: m[0], at: i });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))!;
      out.push({ k: 'id', s: m[0], at: i });
      i += m[0].length;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (['<=', '>=', '==', '!=', '&&', '||', '**'].includes(two)) {
      out.push({ k: 'op', s: two === '**' ? '^' : two, at: i });
      i += 2;
      continue;
    }
    if ('+-*/^%<>!'.includes(c)) {
      out.push({ k: 'op', s: c, at: i });
      i++;
      continue;
    }
    // a few symbols people type or paste from mathematics
    if (c === '×' || c === '·' || c === '⋅') {
      out.push({ k: 'op', s: '*', at: i });
      i++;
      continue;
    }
    if (c === '÷') {
      out.push({ k: 'op', s: '/', at: i });
      i++;
      continue;
    }
    if (c === '−') {
      out.push({ k: 'op', s: '-', at: i });
      i++;
      continue;
    }
    if (c === 'π') {
      out.push({ k: 'id', s: 'pi', at: i });
      i++;
      continue;
    }
    if (c === '(' || c === '[') {
      out.push({ k: '(', s: '(', at: i });
      i++;
      continue;
    }
    if (c === ')' || c === ']') {
      out.push({ k: ')', s: ')', at: i });
      i++;
      continue;
    }
    if (c === ',') {
      out.push({ k: ',', s: ',', at: i });
      i++;
      continue;
    }
    throw new ExprError(`Unexpected “${c}”.`, i);
  }
  return out;
}

// ── parsing: precedence climbing ─────────────────────────────────────

const PREC: Record<string, number> = table({ '||': 1, '&&': 2, '==': 3, '!=': 3, '<': 4, '<=': 4, '>': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6, '^': 8 });
const WORD_OPS: Record<string, string> = table({ and: '&&', or: '||' });

export function parse(src: string): Ast {
  const toks = tokenize(src);
  if (!toks.length) throw new ExprError('Empty expression.');
  let i = 0;
  let count = 0;
  const node = <T extends Ast>(n: T, depth: number): T => {
    if (++count > EXPR_LIMITS.nodes) throw new ExprError('Too complex.');
    if (depth > EXPR_LIMITS.depth) throw new ExprError('Nested too deeply.');
    return n;
  };
  const peek = () => toks[i];
  const opOf = (t: Tok | undefined): string | null => {
    if (!t) return null;
    if (t.k === 'op' && t.s in PREC) return t.s;
    if (t.k === 'id' && WORD_OPS[t.s.toLowerCase()]) return WORD_OPS[t.s.toLowerCase()];
    return null;
  };
  // where a value ends and another begins with nothing between, they multiply: 2x, 2(x), (a)(b), x(…) is a call
  const startsValue = (t: Tok | undefined) => !!t && (t.k === 'num' || t.k === '(' || (t.k === 'id' && !WORD_OPS[t.s.toLowerCase()]));

  function primary(depth: number): Ast {
    const t = toks[i];
    if (!t) throw new ExprError('The expression ends too soon.', toks.length ? toks[toks.length - 1].at + 1 : 0);
    if (t.k === 'op' && (t.s === '-' || t.s === '+' || t.s === '!')) {
      i++;
      // unary minus binds looser than ^ (−x² is −(x²)) and tighter than × and ÷
      const a = binary(7, depth + 1);
      return node({ t: 'un', op: t.s as '-' | '+' | '!', a }, depth);
    }
    if (t.k === 'id' && t.s.toLowerCase() === 'not') {
      i++;
      return node({ t: 'un', op: '!', a: binary(7, depth + 1) }, depth);
    }
    if (t.k === 'num') {
      i++;
      const v = Number(t.s);
      if (!Number.isFinite(v)) throw new ExprError('That number is too large.', t.at);
      return node({ t: 'num', v }, depth);
    }
    if (t.k === 'id') {
      i++;
      const lower = t.s.toLowerCase();
      if (lower === 'true') return node({ t: 'num', v: 1 }, depth);
      if (lower === 'false') return node({ t: 'num', v: 0 }, depth);
      if (peek()?.k === '(') {
        i++;
        const args: Ast[] = [];
        if (peek()?.k !== ')') {
          for (;;) {
            args.push(binary(0, depth + 1));
            if (peek()?.k === ',') {
              i++;
              continue;
            }
            break;
          }
        }
        if (peek()?.k !== ')') throw new ExprError('A bracket is not closed.', peek()?.at ?? t.at);
        i++;
        return node({ t: 'call', f: t.s, args }, depth);
      }
      return node({ t: 'id', n: t.s }, depth);
    }
    if (t.k === '(') {
      i++;
      const inner = binary(0, depth + 1);
      if (peek()?.k !== ')') throw new ExprError('A bracket is not closed.', peek()?.at ?? t.at);
      i++;
      return inner;
    }
    throw new ExprError(`Unexpected “${t.s}”.`, t.at);
  }

  function binary(minPrec: number, depth: number): Ast {
    let a = primary(depth);
    for (;;) {
      let op = opOf(peek());
      let implicit = false;
      // implicit multiplication: a value followed directly by another (2x, 3(x+1), (a)(b), a b, x^2 y) is a product
      // at the level of × — so 2x^2 is 2·x² and x^2y is x²·y. Two numbers side by side, or a name then a number, are
      // a mistake rather than a product; a name then a bracket is a call (primary).
      if (!op) {
        const prev = toks[i - 1];
        const t = peek();
        if (!startsValue(t) || (t!.k === 'num' && (prev.k === 'num' || prev.k === 'id'))) break;
        op = '*';
        implicit = true;
      }
      const p = PREC[op];
      if (p < minPrec) break;
      if (!implicit) i++;
      // ^ is right-associative (2^3^2 is 2^9); everything else is left-associative
      const b = binary(op === '^' ? p : p + 1, depth + 1);
      a = node({ t: 'bin', op: op as Bin, a, b }, depth);
    }
    return a;
  }

  const ast = binary(0, 0);
  if (i < toks.length) throw new ExprError(`Unexpected “${toks[i].s}”.`, toks[i].at);
  return ast;
}

/** Parse, or the error in words. */
export function tryParse(src: string): { ast: Ast; error: null } | { ast: null; error: string } {
  try {
    return { ast: parse(src), error: null };
  } catch (e) {
    return { ast: null, error: e instanceof ExprError ? e.message : 'Not an expression.' };
  }
}

// ── what an expression refers to ────────────────────────────────────

/** The names an expression reads (not functions called, not constants) and the user functions it calls. */
export function referencesOf(ast: Ast): { names: Set<string>; calls: Set<string> } {
  const names = new Set<string>();
  const calls = new Set<string>();
  const walk = (n: Ast) => {
    switch (n.t) {
      case 'id':
        if (!(n.n.toLowerCase() in CONSTANTS)) names.add(n.n);
        break;
      case 'un':
        walk(n.a);
        break;
      case 'bin':
        walk(n.a);
        walk(n.b);
        break;
      case 'call':
        if (!(n.f.toLowerCase() in FUNCTIONS)) calls.add(n.f);
        n.args.forEach(walk);
        break;
    }
  };
  walk(ast);
  return { names, calls };
}

/** An expression with every use of the name `from` replaced by `to`, the rest of the text exactly as it was. */
export function renameIn(src: string, from: string, to: string): string {
  let toks: Tok[];
  try {
    toks = tokenize(src);
  } catch {
    return src;
  }
  let out = '';
  let last = 0;
  for (const t of toks) {
    if (t.k === 'id' && t.s === from) {
      out += src.slice(last, t.at) + to;
      last = t.at + t.s.length;
    }
  }
  return out + src.slice(last);
}

// ── evaluation ───────────────────────────────────────────────────────

export interface UserFn {
  params: string[];
  ast: Ast;
}

export interface Env {
  /** values by name; looked up after `locals` */
  values: Readonly<Record<string, number>>;
  fns?: Readonly<Record<string, UserFn>>;
  locals?: Readonly<Record<string, number>>;
  /** steps left for this evaluation: functions calling functions cannot run away with the page */
  budget?: { left: number };
}

const truth = (v: number) => (v !== 0 && !Number.isNaN(v) ? 1 : 0);

function builtin(f: string, a: number[]): number {
  switch (f) {
    case 'sin': return Math.sin(a[0]);
    case 'cos': return Math.cos(a[0]);
    case 'tan': return Math.tan(a[0]);
    case 'asin': return Math.asin(a[0]);
    case 'acos': return Math.acos(a[0]);
    case 'atan': return Math.atan(a[0]);
    case 'atan2': return Math.atan2(a[0], a[1]);
    case 'sinh': return Math.sinh(a[0]);
    case 'cosh': return Math.cosh(a[0]);
    case 'tanh': return Math.tanh(a[0]);
    case 'sqrt': return Math.sqrt(a[0]);
    case 'cbrt': return Math.cbrt(a[0]);
    case 'abs': return Math.abs(a[0]);
    case 'exp': return Math.exp(a[0]);
    case 'ln': return Math.log(a[0]);
    case 'log': return a.length === 2 ? Math.log(a[0]) / Math.log(a[1]) : Math.log10(a[0]);
    case 'log10': return Math.log10(a[0]);
    case 'log2': return Math.log2(a[0]);
    case 'floor': return Math.floor(a[0]);
    case 'ceil': return Math.ceil(a[0]);
    case 'round': {
      if (a.length === 1) return Math.round(a[0]);
      const p = 10 ** Math.max(0, Math.min(12, Math.floor(a[1])));
      return Math.round(a[0] * p) / p;
    }
    case 'sign': return Math.sign(a[0]);
    case 'min': return Math.min(...a);
    case 'max': return Math.max(...a);
    case 'pow': return a[0] ** a[1];
    case 'mod': return ((a[0] % a[1]) + a[1]) % a[1];
    case 'clamp': return Math.max(a[1], Math.min(a[2], a[0]));
    default: return NaN;
  }
}

/** Evaluate a tree. Unknown names, wrong argument counts and runaway recursion are errors in words. */
export function evaluate(ast: Ast, env: Env, depth = 0): number {
  if (depth > EXPR_LIMITS.callDepth) throw new ExprError('Calls itself too deeply.');
  const budget = env.budget ?? { left: EXPR_LIMITS.steps };
  const ev = (n: Ast): number => {
    if (--budget.left < 0) throw new ExprError('Too much work to work out.');
    switch (n.t) {
      case 'num':
        return n.v;
      case 'id': {
        if (env.locals && has(env.locals, n.n)) return env.locals[n.n];
        if (has(env.values, n.n)) return env.values[n.n];
        if (has(CONSTANTS, n.n.toLowerCase())) return CONSTANTS[n.n.toLowerCase()];
        throw new ExprError(`“${n.n}” is not defined.`);
      }
      case 'un': {
        const a = ev(n.a);
        return n.op === '-' ? -a : n.op === '!' ? 1 - truth(a) : a;
      }
      case 'bin': {
        const a = ev(n.a);
        if (n.op === '&&') return truth(a) ? truth(ev(n.b)) : 0;
        if (n.op === '||') return truth(a) ? 1 : truth(ev(n.b));
        const b = ev(n.b);
        switch (n.op) {
          case '+': return a + b;
          case '-': return a - b;
          case '*': return a * b;
          case '/': return a / b;
          case '^': return a ** b;
          case '%': return a % b;
          case '<': return a < b ? 1 : 0;
          case '<=': return a <= b ? 1 : 0;
          case '>': return a > b ? 1 : 0;
          case '>=': return a >= b ? 1 : 0;
          case '==': return Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(a), Math.abs(b)) ? 1 : 0;
          case '!=': return Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(a), Math.abs(b)) ? 0 : 1;
        }
        return NaN;
      }
      case 'call': {
        const lower = n.f.toLowerCase();
        const user = env.fns && has(env.fns, n.f) ? env.fns[n.f] : undefined;
        if (user) {
          if (n.args.length !== user.params.length) throw new ExprError(`${n.f} takes ${user.params.length} value${user.params.length === 1 ? '' : 's'}.`);
          const locals: Record<string, number> = {};
          user.params.forEach((p, k) => (locals[p] = ev(n.args[k])));
          return evaluate(user.ast, { values: env.values, fns: env.fns, locals, budget }, depth + 1);
        }
        const arity = has(FUNCTIONS, lower) ? FUNCTIONS[lower] : undefined;
        if (!arity) {
          // a(b + 1) where a is a value, not a function: the way mathematics writes a product
          const isValue = (env.locals && has(env.locals, n.f)) || has(env.values, n.f);
          if (isValue && n.args.length === 1) return ev({ t: 'id', n: n.f }) * ev(n.args[0]);
          throw new ExprError(`“${n.f}” is not defined.`);
        }
        if (n.args.length < arity[0] || n.args.length > arity[1])
          throw new ExprError(arity[0] === arity[1] ? `${lower} takes ${arity[0]} value${arity[0] === 1 ? '' : 's'}.` : `${lower} takes ${arity[0]} to ${arity[1]} values.`);
        if (lower === 'if') return truth(ev(n.args[0])) ? ev(n.args[1]) : ev(n.args[2]);
        return builtin(lower, n.args.map(ev));
      }
    }
  };
  return ev(ast);
}

/** Evaluate, or NaN and the error in words. */
export function tryEvaluate(ast: Ast, env: Env): { value: number; error: string | null } {
  try {
    return { value: evaluate(ast, env), error: null };
  } catch (e) {
    return { value: NaN, error: e instanceof ExprError ? e.message : 'Could not be worked out.' };
  }
}

// ── display ──────────────────────────────────────────────────────────

const GREEK = new Set(['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'rho', 'sigma', 'tau', 'upsilon', 'phi', 'chi', 'psi', 'omega', 'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Sigma', 'Phi', 'Psi', 'Omega']);

/** A name as mathematics writes it: Greek letters as letters, a trailing number or _part as a subscript. */
export function nameTex(n: string): string {
  if (n === 'pi') return '\\pi';
  const m = /^([A-Za-z]+?)(?:_?([0-9]+)|_([A-Za-z0-9]+))?$/.exec(n);
  const head = m ? m[1] : n;
  const sub = m ? m[2] ?? m[3] : undefined;
  const base = GREEK.has(head) ? `\\${head}` : head.length === 1 ? head : `\\mathrm{${head.replace(/_/g, '\\_')}}`;
  return sub ? `${base}_{${sub.length === 1 ? sub : `\\mathrm{${sub}}`}}` : base;
}

const FN_TEX: Record<string, string> = table({ sin: '\\sin', cos: '\\cos', tan: '\\tan', sinh: '\\sinh', cosh: '\\cosh', tanh: '\\tanh', ln: '\\ln', log: '\\log', exp: '\\exp', min: '\\min', max: '\\max', asin: '\\arcsin', acos: '\\arccos', atan: '\\arctan' });
const TEX_PREC: Record<string, number> = table({ '||': 1, '&&': 2, '==': 3, '!=': 3, '<': 4, '<=': 4, '>': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6, '^': 8 });

/** The tree as LaTeX, for display only (KaTeX renders it with trust off). */
export function toTex(ast: Ast): string {
  const prec = (n: Ast) => (n.t === 'bin' ? TEX_PREC[n.op] : n.t === 'un' ? 7 : 10);
  const wrap = (n: Ast, min: number) => (prec(n) < min ? `\\left(${tex(n)}\\right)` : tex(n));
  function tex(n: Ast): string {
    switch (n.t) {
      case 'num': {
        const s = Math.abs(n.v) >= 1e6 || (Math.abs(n.v) < 1e-4 && n.v !== 0) ? n.v.toExponential(3) : String(n.v);
        const m = /^(-?[\d.]+)e([+-]\d+)$/.exec(s);
        return m ? `${m[1]}\\times 10^{${Number(m[2])}}` : s;
      }
      case 'id':
        return nameTex(n.n);
      case 'un':
        return n.op === '!' ? `\\lnot ${wrap(n.a, 7)}` : `${n.op === '-' ? '-' : '+'}${wrap(n.a, 6)}`;
      case 'bin': {
        const p = TEX_PREC[n.op];
        switch (n.op) {
          case '/':
            return `\\frac{${tex(n.a)}}{${tex(n.b)}}`;
          case '^':
            return `{${wrap(n.a, 9)}}^{${tex(n.b)}}`;
          case '*': {
            // juxtapose where it reads clearly (2x, a b), a dot where two numbers would run together
            const l = wrap(n.a, p);
            const r = n.b.t === 'un' && n.b.op !== '!' ? `\\left(${tex(n.b)}\\right)` : wrap(n.b, p + 1);
            const numeric = (x: Ast) => x.t === 'num' || (x.t === 'un' && x.a.t === 'num');
            return numeric(n.b) || (n.b.t === 'bin' && n.b.op === '^' && n.b.a.t === 'num') ? `${l} \\cdot ${r}` : `${l}\\,${r}`;
          }
          case '%':
            return `${wrap(n.a, p)} \\bmod ${wrap(n.b, p + 1)}`;
          default: {
            const sym: Record<string, string> = { '+': '+', '-': '-', '<': '<', '<=': '\\le', '>': '>', '>=': '\\ge', '==': '=', '!=': '\\ne', '&&': '\\land', '||': '\\lor' };
            return `${wrap(n.a, p)} ${sym[n.op]} ${wrap(n.b, p + 1)}`;
          }
        }
      }
      case 'call': {
        const f = n.f.toLowerCase();
        if (f === 'sqrt' && n.args.length === 1) return `\\sqrt{${tex(n.args[0])}}`;
        if (f === 'cbrt' && n.args.length === 1) return `\\sqrt[3]{${tex(n.args[0])}}`;
        if (f === 'abs' && n.args.length === 1) return `\\left|${tex(n.args[0])}\\right|`;
        if (f === 'floor' && n.args.length === 1) return `\\left\\lfloor ${tex(n.args[0])}\\right\\rfloor`;
        if (f === 'ceil' && n.args.length === 1) return `\\left\\lceil ${tex(n.args[0])}\\right\\rceil`;
        if (f === 'exp' && n.args.length === 1) return `e^{${tex(n.args[0])}}`;
        if (f === 'log10' && n.args.length === 1) return `\\log_{10}\\left(${tex(n.args[0])}\\right)`;
        if (f === 'log2' && n.args.length === 1) return `\\log_{2}\\left(${tex(n.args[0])}\\right)`;
        if (f === 'log' && n.args.length === 2) return `\\log_{${tex(n.args[1])}}\\left(${tex(n.args[0])}\\right)`;
        if (f === 'if' && n.args.length === 3) return `\\begin{cases} ${tex(n.args[1])} & \\text{if } ${tex(n.args[0])} \\\\ ${tex(n.args[2])} & \\text{otherwise} \\end{cases}`;
        const head = FN_TEX[f] ?? (f in FUNCTIONS ? `\\operatorname{${f}}` : nameTex(n.f));
        return `${head}\\left(${n.args.map(tex).join(', ')}\\right)`;
      }
    }
  }
  return tex(ast);
}

// ── numbers, as a person reads them ─────────────────────────────────

/** A value for display: up to `digits` significant figures, no float noise, plain words for what is not a number. */
export function formatNumber(v: number, digits = 4): string {
  if (Number.isNaN(v)) return 'undefined';
  if (v === Infinity) return '∞';
  if (v === -Infinity) return '−∞';
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e9 || a < 1e-5) {
    const [m, e] = v.toExponential(digits - 1).split('e');
    return `${String(Number(m))}×10^${Number(e)}`.replace('-', '−');
  }
  const decimals = Math.max(0, digits - 1 - Math.floor(Math.log10(a)));
  const s = v.toFixed(Math.min(decimals, 10));
  const trimmed = s.includes('.') ? s.replace(/\.?0+$/, '') : s;
  // thousands, the way a person writes a large quantity
  const [int, frac] = trimmed.replace('-', '').split('.');
  const grouped = int.length > 4 ? int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : int;
  return `${v < 0 ? '−' : ''}${grouped}${frac ? `.${frac}` : ''}`;
}
