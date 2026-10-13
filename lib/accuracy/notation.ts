// lib/accuracy/notation.ts
//
// MATHEMATICS AS A REPLY WRITES IT, INTO THE GRAMMAR THE ENGINE READS.
//
// The deterministic engines — lib/model/expr.ts (a tree, symbolic
// differentiation) and lib/logos-math.ts (the evaluator) — read one plain
// grammar: `-csc(x)*cot(x)`. A reply writes the same thing as
// `$-\csc x\cot x$`, `−csc(x)·cot(x)`, `-csc x cot x` or `**−csc(x)cot(x)**`.
// Every spelling this cannot read is a claim that goes unchecked, so the rule
// is the one normalizeExpr already follows: accept what people actually
// write, and only then be strict.
//
// IT NEVER GUESSES. An argument it cannot delimit, a name it does not know, a
// bracket that does not close — the answer is null, which upstream means
// "unchecked". It must never mean "wrong": a checker that misreads notation
// and then reports a mistake is worse than no checker, because it makes the
// reply argue with a correct answer.
//
// Three conventions are decided here and nowhere else:
//
//   sin^2 x       is (sin x)^2 — the exponent on a function name is a power
//   sin^-1 x      is arcsin x — the one exception, and only for sin, cos, tan
//                 and their hyperbolic forms; csc^-1 has no name in the
//                 grammar and stays unreadable
//   sin x cos x   is sin(x)·cos(x) — a bare argument is a coefficient, a name
//                 and an optional power: sin 2x is sin(2x), sin x^2 is sin(x²)
//
// PURE. No clock, no network.

/** One-argument functions the evaluator knows, as a set. */
export const FUNCTIONS: ReadonlySet<string> = new Set([
  'sin', 'cos', 'tan', 'sec', 'csc', 'cot',
  'asin', 'acos', 'atan', 'arcsin', 'arccos', 'arctan',
  'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh', 'arcsinh', 'arccosh', 'arctanh',
  'ln', 'log', 'log2', 'log10', 'exp', 'sqrt', 'cbrt', 'abs',
]);

/** Names that are numbers, not variables. `tau` is 2π to the evaluator. */
export const CONSTANTS: ReadonlySet<string> = new Set(['pi', 'e', 'tau']);

/** Names that belong to the grammar but are not free variables. */
const GRAMMAR_WORDS: ReadonlySet<string> = new Set([
  ...FUNCTIONS, ...CONSTANTS, 'max', 'min', 'mod', 'atan2', 'logbase', 'sign', 'floor', 'ceil', 'round', 'step',
]);

/** Greek letters a reply uses as variables, as names the lexer accepts. τ is not `tau`, which is a constant. */
const GREEK: Record<string, string> = {
  'θ': 'theta', 'ϑ': 'theta', 'φ': 'phi', 'ϕ': 'phi', 'α': 'alpha', 'β': 'beta', 'γ': 'gamma',
  'ω': 'omega', 'λ': 'lambda', 'μ': 'mu', 'σ': 'sigma', 'ρ': 'rho', 'τ': 'tau_', 'ψ': 'psi',
};
const GREEK_TEX = ['theta', 'vartheta', 'phi', 'varphi', 'alpha', 'beta', 'gamma', 'omega', 'lambda', 'mu', 'sigma', 'rho', 'tau', 'psi'];

const SUPERSCRIPT = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const SUBSCRIPT = '₀₁₂₃₄₅₆₇₈₉';

/**
 * LaTeX into plain notation, keeping the operators a claim is made of:
 * `\frac{d}{dx}` becomes `d/dx`, `\int` becomes `∫`, `\lim` stays `lim`,
 * `\to` becomes `→`, `\approx` becomes `≈`. Everything else that has a plain
 * form gets it; a command with none is left with its backslash, so the name
 * stays unknown and the fragment stays unreadable.
 */
export function latexToPlain(tex: string): string {
  let s = tex;
  s = s.replace(/\\[dt]frac/g, '\\frac');
  s = s.replace(/\\(?:displaystyle|textstyle|scriptstyle|limits|nolimits)(?![a-zA-Z])/g, ' ');
  // \left. and \right. are invisible delimiters; the dot is not a decimal point.
  s = s.replace(/\\(?:left|right)\s*\./g, ' ');
  s = s.replace(/\\(?:left|right|bigl|bigr|Bigl|Bigr|big|Big|bigg|Bigg)(?![a-zA-Z])\s*/g, '');
  s = s.replace(/\\(?:lvert|rvert|vert|mid)(?![a-zA-Z])/g, '|');
  // \{ \} are literal braces — a set, as in x \in \{2, 3\} — and must not
  // become the parentheses of an interval below.
  s = s.replace(/\\\{/g, '⦃').replace(/\\\}/g, '⦄');
  // Primes before anything turns ^{...} into a power.
  s = s.replace(/\^\s*\{\s*\\prime\s*\\prime\s*\}/g, "''").replace(/\^\s*\{\s*\\prime\s*\}/g, "'").replace(/\^\s*\\prime/g, "'").replace(/\\prime/g, "'");
  // The derivative operator, before \frac is read as a division.
  const D = String.raw`(?:\\mathrm\s*\{\s*d\s*\}|\\operatorname\s*\{\s*d\s*\}|d)`;
  const V = String.raw`([a-zA-Z]|\\(?:theta|vartheta|phi|varphi|alpha|beta|omega|lambda|mu|sigma|rho|tau|psi))`;
  s = s.replace(new RegExp(String.raw`\\frac\s*\{\s*${D}\s*\^\s*\{?\s*2\s*\}?\s*\}\s*\{\s*${D}\s*${V}\s*\^\s*\{?\s*2\s*\}?\s*\}`, 'g'), (_m, v) => ` d2/d${texVar(v)} `);
  s = s.replace(new RegExp(String.raw`\\frac\s*\{\s*${D}\s*\}\s*\{\s*${D}\s*${V}\s*\}`, 'g'), (_m, v) => ` d/d${texVar(v)} `);
  s = s.replace(new RegExp(String.raw`\\frac\s*\{\s*${D}\s*([a-zA-Z])\s*\}\s*\{\s*${D}\s*${V}\s*\}`, 'g'), (_m, f, v) => ` d${f}/d${texVar(v)} `);
  s = s.replace(/\\mathrm\s*\{\s*d\s*\}\s*/g, 'd');
  s = s.replace(/\\(?:operatorname|mathrm|mathit|mathbf|bm|boxed|mbox)\s*\{([^{}]*)\}/g, ' $1 ');
  s = s.replace(/\\(?:text|textbf|textit|textrm)\s*\{([^{}]*)\}/g, ' $1 ');
  s = s.replace(/\\mathbb\s*\{\s*R\s*\}/g, 'ℝ');
  // Structure, innermost first: each pattern matches only brace-free arguments.
  for (let i = 0; i < 8; i++) {
    const before = s;
    s = s.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '(($1)/($2))');
    s = s.replace(/\\sqrt\s*\[([^\]]*)\]\s*\{([^{}]*)\}/g, '(($2)^(1/($1)))');
    s = s.replace(/\\sqrt\s*\{([^{}]*)\}/g, 'sqrt($1)');
    s = s.replace(/\^\s*\{([^{}]*)\}/g, '^($1)');
    s = s.replace(/_\s*\{([^{}]*)\}/g, '_($1)');
    s = s.replace(/\\(?:operatorname|mathrm|mathit|mathbf|bm|boxed|mbox|text|textbf|textit)\s*\{([^{}]*)\}/g, ' $1 ');
    if (s === before) break;
  }
  // \frac12 and \sqrt2: single-token arguments without braces.
  s = s.replace(/\\frac\s*([0-9a-zA-Z])\s*([0-9a-zA-Z])/g, '(($1)/($2))');
  s = s.replace(/\\sqrt\s*([0-9a-zA-Z])/g, 'sqrt($1)');
  s = s.replace(/\\(arcsinh|arccosh|arctanh|arcsin|arccos|arctan|sinh|cosh|tanh|sin|cos|tan|sec|csc|cot|ln|log|exp)(?![a-zA-Z])/g, ' $1 ');
  s = s.replace(/\\pi(?![a-zA-Z])/g, ' pi ');
  s = s.replace(new RegExp(String.raw`\\(${GREEK_TEX.join('|')})(?![a-zA-Z])`, 'g'), (_m, g: string) => ` ${texVar('\\' + g)} `);
  s = s.replace(/\\(?:cdot|times|ast)(?![a-zA-Z])/g, ' * ').replace(/\\div(?![a-zA-Z])/g, ' / ');
  s = s.replace(/\\pm(?![a-zA-Z])/g, '±').replace(/\\mp(?![a-zA-Z])/g, '∓');
  s = s.replace(/\\approx(?![a-zA-Z])/g, '≈').replace(/\\(?:neq|ne)(?![a-zA-Z])/g, '≠');
  s = s.replace(/\\(?:geq|ge|geqslant)(?![a-zA-Z])/g, '≥').replace(/\\(?:leq|le|leqslant)(?![a-zA-Z])/g, '≤');
  s = s.replace(/\\(?:to|rightarrow|longrightarrow)(?![a-zA-Z])/g, '→');
  s = s.replace(/\\(?:Rightarrow|implies|Longrightarrow|therefore|iff|Leftrightarrow)(?![a-zA-Z])/g, ' ⇒ ');
  s = s.replace(/\\equiv(?![a-zA-Z])/g, '≡').replace(/\\infty(?![a-zA-Z])/g, '∞');
  s = s.replace(/\^\s*\(?\s*\\circ\s*\)?/g, '°').replace(/\\circ(?![a-zA-Z])/g, '°');
  s = s.replace(/\\in(?![a-zA-Z])/g, ' ∈ ').replace(/\\cup(?![a-zA-Z])/g, ' ∪ ').replace(/\\setminus(?![a-zA-Z])/g, ' ∖ ');
  s = s.replace(/\\int(?![a-zA-Z])/g, '∫').replace(/\\lim(?![a-zA-Z])/g, ' lim');
  s = s.replace(/\\(?:quad|qquad)(?![a-zA-Z])/g, ' ').replace(/\\[,;:! ]/g, ' ').replace(/~/g, ' ');
  // Alignment and line breaks in a displayed block.
  s = s.replace(/\\\\/g, '\n').replace(/&/g, ' ');
  // Anything still braced was a group, and a group is a parenthesis.
  s = s.replace(/\{/g, '(').replace(/\}/g, ')');
  return s;
}

/** A LaTeX variable as a name: `x` stays `x`, `\theta` becomes `theta`, `\tau` becomes `tau_`. */
function texVar(v: string): string {
  if (!v.startsWith('\\')) return v;
  const name = v.slice(1).replace(/^var/, '');
  return name === 'tau' ? 'tau_' : name;
}

/**
 * Unicode notation into plain: typographic minus, middle dot, superscripts,
 * subscripts, √ and ∛, π and the Greek letters used as variables.
 */
export function unicodeToPlain(raw: string): string {
  let s = raw;
  s = s.replace(/[     ]/g, ' ');
  s = s.replace(/[−–—‐‑﹣－]/g, '-');
  s = s.replace(/[·⋅∙×]/g, '*').replace(/[÷∕]/g, '/');
  s = s.replace(/[′ʹ]/g, "'").replace(/″/g, "''");
  s = s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]+/g, (run) => {
    const body = [...run].map((ch) => (SUPERSCRIPT.includes(ch) ? String(SUPERSCRIPT.indexOf(ch)) : ch === '⁻' ? '-' : '')).join('');
    return body ? `^(${body})` : '';
  });
  s = s.replace(/[₀₁₂₃₄₅₆₇₈₉]+/g, (run) => '_' + [...run].map((ch) => String(SUBSCRIPT.indexOf(ch))).join(''));
  s = s.replace(/√/g, ' sqrt ').replace(/∛/g, ' cbrt ');
  s = s.replace(/π/g, ' pi ');
  s = s.replace(/[θϑφϕαβγωλμσρτψ]/g, (ch) => ` ${GREEK[ch]} `);
  return s;
}

/** Markdown that wraps mathematics in a chat reply: bold, italics markers, code ticks. */
export function stripMarkdown(s: string): string {
  return s.replace(/\*\*|__|`/g, ' ');
}

/** The end of a balanced group that opens at `open`, or -1. */
function closeOf(s: string, open: number): number {
  const o = s[open];
  const c = o === '(' ? ')' : o === '[' ? ']' : null;
  if (!c) return -1;
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === '(' || s[i] === '[') depth++;
    else if (s[i] === ')' || s[i] === ']') {
      depth--;
      if (depth === 0) return s[i] === c ? i : -1;
    }
  }
  return -1;
}

// An exponent on a function name: ^2, ^(2), ^(-1), ^(1/2).
const FN_POWER = /^\s*\^\s*(\(\s*[-+]?\s*\d+(?:\.\d+)?(?:\s*\/\s*\d+)?\s*\)|[-+]?\d+(?:\.\d+)?)/;
// A bare argument: an optional coefficient, a name (one letter, maybe
// subscripted, or a Greek name) and an optional power — or a bare number.
const BARE_ARG = /^(\d+(?:\.\d+)?)?\s*(pi|theta|phi|alpha|beta|gamma|omega|lambda|mu|sigma|rho|tau_|psi|[a-zA-Z](?:_[a-zA-Z0-9]+)?)(?![a-zA-Z0-9_(])(\s*\^\s*(?:\([^()]*\)|[-+]?\d+(?:\.\d+)?|[a-zA-Z](?![a-zA-Z])))?|^(\d+(?:\.\d+)?)(?![a-zA-Z0-9_.(])/;
const INVERSE: Record<string, string> = { sin: 'asin', cos: 'acos', tan: 'atan', sinh: 'asinh', cosh: 'acosh', tanh: 'atanh' };

/**
 * Function application with and without parentheses, function powers, and
 * the inverse-function exponent — rewritten into calls the grammar reads.
 * Null when an application's argument cannot be delimited.
 */
function applyFunctions(s: string): string | null {
  let out = '';
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    // A letter after a digit starts a word ("2sin x"); after a letter it cannot.
    if (!/[a-zA-Z]/.test(ch) || (i > 0 && /[a-zA-Z_]/.test(s[i - 1]))) {
      out += ch;
      i++;
      continue;
    }
    const word = /^[a-zA-Z][a-zA-Z0-9_]*/.exec(s.slice(i))![0];
    let fn = word;
    let glued: string | null = null;
    if (!FUNCTIONS.has(word)) {
      // "sinx", "cos2x", "cscx": a function name run into its argument. Only
      // with x: "cost" is a variable called cost, not cos(t), and reading it
      // as one would put a function into somebody's budget.
      const g = /^(arcsin|arccos|arctan|sinh|cosh|tanh|sin|cos|tan|sec|csc|cot|ln|exp|sqrt)(\d*(?:\.\d+)?)(x)$/.exec(word);
      if (!g) {
        out += word;
        i += word.length;
        continue;
      }
      fn = g[1];
      glued = `${g[2]}${g[3]}`;
    }
    const got = applyAt(s, i, fn, glued, word.length);
    if (!got) return null;
    out += got.text;
    i = got.end;
  }
  return out;
}

function applyAt(s: string, start: number, fn: string, glued: string | null, wordLen: number): { text: string; end: number } | null {
  let j = start + wordLen;
  if (glued !== null) return { text: `${fn}(${glued})`, end: j };
  let power: string | null = null;
  const p = FN_POWER.exec(s.slice(j));
  if (p) {
    power = p[1].replace(/^\(|\)$/g, '').replace(/\s+/g, '');
    j += p[0].length;
  }
  // sin^-1 is arcsin, the one place an exponent on a name is not a power.
  if (power === '-1') {
    const inv = INVERSE[fn];
    if (!inv) return null;
    fn = inv;
    power = null;
  }
  let k = j;
  while (s[k] === ' ') k++;
  let arg: string | null = null;
  let end = k;
  if (s[k] === '(' || s[k] === '[') {
    const close = closeOf(s, k);
    if (close < 0) return null;
    const inner = applyFunctions(s.slice(k + 1, close));
    if (inner === null) return null;
    arg = inner;
    end = close + 1;
  } else {
    const nextWord = /^[a-zA-Z][a-zA-Z0-9_]*/.exec(s.slice(k))?.[0];
    if (nextWord && FUNCTIONS.has(nextWord)) {
      // ln abs(x), sin cos x: the argument is the next application.
      const inner = applyAt(s, k, nextWord, null, nextWord.length);
      if (!inner) return null;
      arg = inner.text;
      end = inner.end;
    } else {
      const m = BARE_ARG.exec(s.slice(k));
      if (!m) return null;
      arg = m[0].trim();
      end = k + m[0].length;
    }
  }
  if (!arg) return null;
  const call = `${fn}(${arg})`;
  return { text: power ? `(${call})^(${power})` : call, end };
}

/**
 * One side of a claim — an expression with no `=` in it — into the grammar,
 * or null when it cannot be read with confidence.
 */
export function toGrammar(fragment: string): string | null {
  let s = unicodeToPlain(stripMarkdown(fragment)).trim();
  if (!s) return null;
  // Anything relational or prose-structural means this is not one expression.
  // `%` is percent in prose and a remainder in the grammar: never guessed.
  if (/[=≈≠<>≤≥→∈∪∖⇒;:?!"%⦃⦄∫∞]/.test(s)) return null;
  // Square brackets group like parentheses.
  s = s.replace(/\[/g, '(').replace(/\]/g, ')');
  // 30° is 30·π/180 — so sin 30° = 1/2 is checkable, and sin(30) is radians.
  // Not °C or °F: a temperature is not an angle.
  s = s.replace(/(\d+(?:\.\d+)?)\s*°(?![CF])/g, '($1*pi/180)');
  if (s.includes('°')) return null;
  // 1,000,000 is one number.
  s = s.replace(/(\d),(?=\d{3}(?!\d))/g, '$1');
  // |x| → abs(x), in pairs; before applications, so ln|x| reads as ln(abs(x)).
  s = s.replace(/\|([^|]+)\|/g, ' abs($1) ');
  if (s.includes('|')) return null;
  const applied = applyFunctions(s);
  if (applied === null) return null;
  const out = applied.replace(/\s+/g, ' ').trim();
  // A dangling operator at either end is a fragment of something longer.
  if (!out || /^[*/^]|[-+*/^]$/.test(out)) return null;
  return out;
}

/** The free variables of a grammar string: every name that is not a function or a constant. */
export function namesIn(grammar: string): string[] {
  const out: string[] = [];
  for (const w of grammar.match(/[a-zA-Z][a-zA-Z0-9_]*/g) ?? []) {
    const lw = w.toLowerCase();
    if (GRAMMAR_WORDS.has(lw) || out.includes(lw)) continue;
    out.push(lw);
  }
  return out;
}

/** Is a name usable as a variable or parameter: one letter (maybe subscripted) or a Greek name. */
export function isSymbolName(name: string): boolean {
  // Not i or j: in a claim they are the imaginary unit far more often than a
  // real variable, and e^(iπ) + 1 = 0 evaluated over the reals is "false".
  // Leaving them out also makes "I" a word, which is what it nearly always is.
  return /^(?:[a-hk-z](?:_[a-z0-9]+)?|theta|phi|alpha|beta|gamma|omega|lambda|mu|sigma|rho|tau_|psi)$/.test(name);
}
