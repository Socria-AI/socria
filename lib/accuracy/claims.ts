// lib/accuracy/claims.ts
//
// WHAT A PIECE OF TEXT CLAIMS, MATHEMATICALLY — AS DATA A COMPUTER CAN CHECK.
//
// A reply that says "d/dx [csc(x)] = csc(x)cot(x)" has made a claim, and the
// claim is either true or false whatever the reply's tone. This finds such
// claims — in LaTeX, Unicode or plain prose — and returns them as structured
// records: what operation, on what, giving what. lib/accuracy/checker.ts
// decides each one by computing.
//
// THE BAR IS "CERTAINLY A CLAIM", NOT "PROBABLY". Every record this produces
// can end in a correction that argues with the reply, so a misread is not a
// harmless miss — it is the system insisting a correct answer is wrong.
// Concretely:
//
//   - An equation is a claim only when its shape says what kind: an operator
//     on the left (d/dx, ∫, lim), a chain of rewrites (a = b = c), an
//     identity the sentence calls one, a reciprocal definition (csc x = 1/sin x),
//     arithmetic between numbers, or a solution in a sentence that says it is
//     one. "x² − 4 = 0" on its own is an equation to solve, and is left alone.
//   - The words around a formula decide what it is: "the derivative of
//     csc x = −csc x cot x" is a derivative claim, not the identity
//     csc x = −csc x cot x, and reading it the second way would "correct" a
//     right answer.
//   - "If x = 0 …", "try x = 3", "x = 1 is extraneous" are not solutions.
//   - Anything that does not read cleanly is dropped, not guessed.
//
// PURE.

import { splitMath } from '@/lib/tex-split';
import { latexToPlain, unicodeToPlain, stripMarkdown, toGrammar, namesIn, isSymbolName, FUNCTIONS, CONSTANTS } from './notation';
import { evalNumber } from './numeric-check';

export type Claim =
  | { kind: 'derivative'; text: string; subject: string; wrt: string; order: 1 | 2; claimed: string }
  | { kind: 'antiderivative'; text: string; integrand: string; wrt: string; claimed: string }
  | { kind: 'definite'; text: string; integrand: string; wrt: string; lower: string; upper: string; claimed: string; approx: boolean }
  | { kind: 'limit'; text: string; subject: string; wrt: string; at: number; side: 0 | 1 | -1; claimed: string }
  | { kind: 'equal'; text: string; left: string; right: string; why: 'chain' | 'identity' | 'reciprocal' }
  | { kind: 'arithmetic'; text: string; left: string; right: string; approx: boolean }
  | { kind: 'solution'; text: string; variable: string; values: string[]; complete: boolean }
  | { kind: 'set'; text: string; subject: string; variable: string; set: string; which: 'domain' | 'range' }
  | { kind: 'unit'; text: string; leftValue: string; leftUnit: string; rightValue: string; rightUnit: string; approx: boolean };

/** A function the text defined: f(x) = …, y = … */
export interface Def { variable: string; expr: string }
export type Defs = Record<string, Def>;

/** A problem the text POSES rather than answers: "what is the derivative of csc x?" */
export type Posed =
  | { kind: 'derivative'; subject: string; wrt: string; order: 1 | 2; text: string }
  | { kind: 'antiderivative'; integrand: string; wrt: string; text: string }
  | { kind: 'definite'; integrand: string; wrt: string; lower: string; upper: string; text: string }
  | { kind: 'limit'; subject: string; wrt: string; at: number; side: 0 | 1 | -1; text: string }
  | { kind: 'equation'; left: string; right: string; variable: string; text: string }
  | { kind: 'identity'; left: string; right: string; text: string };

export interface Extracted {
  claims: Claim[];
  posed: Posed[];
  defs: Defs;
}

// ── text into sentences of tokens ───────────────────────────────────────

/**
 * `cut`: the run touches a word with no space between — "16ab", "2nd" — so it
 * is a fragment of something the tokenizer could not read whole, and nothing
 * is claimed or posed from it. (A real misread from the corpus: "(4a+1)(4b+1)
 * = 16ab + …" read as "= 16" and reported as an identity that does not hold.)
 */
type Token = { t: 'math'; v: string; cut?: boolean } | { t: 'word'; v: string } | { t: 'punct'; v: string };

const VAR = String.raw`(?:theta|phi|alpha|beta|gamma|omega|lambda|mu|sigma|rho|tau_|psi|[a-z])`;
const MATH_CHARS = new Set([...`0123456789+-*/^=≈≠<>≤≥()[]|'∫∞→±∓∈∪∖ℝ⦃⦄≡_,°`]);

/**
 * A text as lines of plain notation: code removed, every LaTeX span
 * converted and fenced in ⟦…⟧ so a formula is one unit however it was typed.
 */
export function flatten(text: string): string {
  const noCode = text.replace(/```[\s\S]*?```/g, '\n').replace(/~~~[\s\S]*?~~~/g, '\n');
  let out = '';
  for (const seg of splitMath(noCode)) {
    if (seg.kind === 'text') {
      // An em dash in prose is punctuation, not a minus sign.
      let body = stripMarkdown(seg.body).replace(/[’‘]/g, "'").replace(/\s*—\s*/g, ' ; ');
      if (/\\[a-zA-Z]/.test(body)) body = latexToPlain(body);
      out += unicodeToPlain(body);
    } else if (seg.kind === 'inline') {
      out += `⟦${unicodeToPlain(latexToPlain(seg.body))}⟧`;
    } else {
      out += '\n' + latexToPlain(seg.body).split('\n').map((l) => `⟦${unicodeToPlain(l)}⟧`).join('\n') + '\n';
    }
  }
  return out;
}

function isMathWord(w: string): boolean {
  const lw = w.toLowerCase();
  return FUNCTIONS.has(lw) || CONSTANTS.has(lw) || isSymbolName(lw) || /^d(?:[a-z]|theta|phi)$/.test(lw) || lw === 'lim' || lw === 'd2' ||
    // "sinx", "cos2x": a function run into x (notation.ts reads these)
    /^(?:arcsin|arccos|arctan|sinh|cosh|tanh|sin|cos|tan|sec|csc|cot|ln|exp|sqrt)\d*(?:\.\d+)?x$/.test(lw);
}

/** One line into prose words, punctuation, and maximal runs of mathematics. */
function tokenize(line: string): Token[] {
  const toks: Token[] = [];
  let buf = '';
  let cut = false;
  const flush = (glued = false) => {
    const t = buf.replace(/^[,\s]+|[,\s]+$/g, '').replace(/\s+/g, ' ');
    if (t && /[0-9a-zA-Z∞]/.test(t)) toks.push({ t: 'math', v: t, ...(cut || glued ? { cut: true } : {}) });
    buf = '';
    cut = false;
  };
  let i = 0;
  while (i < line.length) {
    const c = line[i];
    if (c === '⟦') {
      const j = line.indexOf('⟧', i);
      buf += ` ${j < 0 ? line.slice(i + 1) : line.slice(i + 1, j)} `;
      i = j < 0 ? line.length : j + 1;
      continue;
    }
    if (/[A-Za-z]/.test(c)) {
      // Contractions are words ("isn't"); a single letter and a prime is f'.
      const m = /^[A-Za-z][A-Za-z0-9_]*(?:'(?:t|s|re|ve|ll|d|m)(?![A-Za-z]))?/.exec(line.slice(i))!;
      let w = m[0];
      if (w.includes("'") && /^[A-Za-z]'/.test(w) && !/^I'/i.test(w)) w = w[0];
      const bare = w.replace(/'.*$/, '');
      if (!w.includes("'") && isMathWord(bare)) {
        buf += w;
      } else {
        // A word glued to the run before it ("16ab") cuts that run.
        flush(buf.length > 0 && !/\s$/.test(buf) && /[0-9a-zA-Z)\]]$/.test(buf));
        toks.push({ t: 'word', v: w.toLowerCase() });
        // …and the run after it, if one starts with no space ("ab+1").
        cut = /^[0-9(+\-*/^=]/.test(line[i + w.length] ?? '');
      }
      i += w.length;
      continue;
    }
    if (/[0-9]/.test(c)) {
      buf += c;
      i++;
      continue;
    }
    if (c === '.') {
      if (/[0-9]/.test(line[i + 1] ?? '')) {
        buf += c;
        i++;
        continue;
      }
      flush();
      toks.push({ t: 'punct', v: '.' });
      i++;
      continue;
    }
    if (c === ' ' || c === '\t' || c === '{' || c === '}' || MATH_CHARS.has(c)) {
      buf += c === '{' ? '(' : c === '}' ? ')' : c;
      i++;
      continue;
    }
    flush();
    toks.push({ t: 'punct', v: c });
    i++;
  }
  flush();
  return toks;
}

interface Sentence { tokens: Token[]; text: string; standalone: boolean }

function sentences(flat: string): Sentence[] {
  const out: Sentence[] = [];
  for (const rawLine of flat.split('\n')) {
    const line = rawLine.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '').trim();
    if (!line) continue;
    const standalone = /^⟦[^⟧]*⟧[\s.,;:]*$/.test(line);
    // Sentence ends: a full stop, ? or ! followed by a space and a capital, outside ⟦…⟧.
    const parts = line.split(/(?<=[.?!])\s+(?=[A-Z⟦])/);
    for (const p of parts) out.push({ tokens: tokenize(p), text: p.replace(/[⟦⟧]/g, ' '), standalone });
  }
  return out;
}

// ── splitting a formula ────────────────────────────────────────────────

/** Split at the top level (outside brackets) on any of the given relation symbols. */
function splitTop(s: string, rels: string[]): { parts: string[]; ops: string[] } {
  const parts: string[] = [];
  const ops: string[] = [];
  let depth = 0;
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(' || c === '[' || c === '⦃') depth++;
    else if (c === ')' || c === ']' || c === '⦄') depth--;
    if (depth === 0 && rels.includes(c)) {
      parts.push(cur.trim());
      ops.push(c);
      cur = '';
      continue;
    }
    cur += c;
  }
  parts.push(cur.trim());
  return { parts, ops };
}

const strip = (s: string) => s.trim().replace(/^[,;:\s]+|[,;:.\s]+$/g, '');

/** Remove one pair of brackets around the whole of s, if they enclose all of it. */
function unwrap(s: string): string {
  const t = s.trim();
  if (!/^[[(]/.test(t)) return t;
  let depth = 0;
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '(' || t[i] === '[') depth++;
    else if (t[i] === ')' || t[i] === ']') {
      depth--;
      if (depth === 0 && i < t.length - 1) return t;
    }
  }
  return t.slice(1, -1).trim();
}

const PLUS_C = /\s*\+\s*(?:C|c|C_?\d|K|constant)\s*$/;

/** The variable a grammar string is in, when there is exactly one symbol. */
function soleVariable(grammar: string): string | null {
  const names = namesIn(grammar).filter(isSymbolName);
  return names.length === 1 ? names[0] : null;
}

/** The variable of a subject: its only symbol, or x when x is one of several. */
function variableOf(grammar: string): string | null {
  return soleVariable(grammar) ?? (namesIn(grammar).includes('x') ? 'x' : null);
}

/** Names a subject may use: its variable plus single-letter parameters it mentions. */
function namesOf(grammar: string, wrt: string): string[] {
  const out = [wrt];
  for (const n of namesIn(grammar)) if (n !== wrt && isSymbolName(n)) out.push(n);
  return out;
}

/** Does `claimed` use only names the subject already used? An unknown name means it was not read. */
function sameNames(subject: string, claimed: string, wrt: string): boolean {
  const allowed = new Set(namesOf(subject, wrt));
  return namesIn(claimed).every((n) => allowed.has(n));
}

const SOLVE_WORDS = /\b(?:solve[sd]?|solving|solutions?|roots?|zeros?|zeroes|when|where|if|for which|intersect\w*|equations?|satisf\w*|suppose|assume|let|set)\b/i;
const IDENTITY_WORDS = /\bidentit(?:y|ies)\b|≡|\bfor all\b|\bfor every\b|\bfor any\b|\balways\b|\bidentically\b/i;
/** Said in words — never just ≡, which is also congruence. */
const IDENTITY_SAID = /\bidentit(?:y|ies)\b|\bfor all\b|\bfor every\b|\bfor any\b|\balways\b|\bidentically\b/i;
/** Asked to solve, explicitly: what makes an equation a problem posed. */
const SOLVE_ASKED = /\b(?:solve[sd]?|solving|find (?:all )?(?:the )?(?:values? of|roots?|zeros?|zeroes|solutions?|x\b)|roots? of|zeros? of|solutions? (?:of|to)|for what values?|which values?)\b/i;
const RECIPROCAL_CALL = /^(sec|csc|cot|tan)\((?:[^()]|\([^()]*\))+\)$/;
const TRIG = /\b(?:sin|cos|tan|sec|csc|cot)\(/;

// ── operators: d/dx, ∫, lim, f', dy/dx ─────────────────────────────────

interface Operator {
  kind: 'derivative' | 'antiderivative' | 'definite' | 'limit';
  subject: string;
  wrt: string;
  order?: 1 | 2;
  lower?: string;
  upper?: string;
  at?: number;
  side?: 0 | 1 | -1;
}

function readBound(raw: string): string | null {
  const t = unwrap(raw.trim());
  if (/∞/.test(t)) return null;
  return toGrammar(t);
}

/** The point a limit approaches, and from which side. */
function readApproach(spec: string): { at: number; side: 0 | 1 | -1 } | null {
  let t = spec.trim();
  let side: 0 | 1 | -1 = 0;
  const sided = /\^\s*\(?\s*([+-])\s*\)?$/.exec(t) ?? /(?<=[0-9a-z∞)])\s*([+-])$/.exec(t);
  if (sided) {
    side = sided[1] === '+' ? 1 : -1;
    t = t.slice(0, sided.index).trim();
  }
  if (/^\+?∞$/.test(t)) return { at: Infinity, side: 0 };
  if (/^-∞$/.test(t)) return { at: -Infinity, side: 0 };
  const g = toGrammar(t);
  const at = g ? evalNumber(g) : null;
  return at === null ? null : { at, side };
}

/** A defined function used by name: f(x) with f defined earlier. */
function byName(inner: string, defs: Defs): string | null {
  const def = /^([a-zA-Z])\s*\(\s*([a-z]+)\s*\)$/.exec(inner.trim());
  return def && defs[def[1]] ? defs[def[1]].expr : null;
}

function readOperator(seg: string, defs: Defs): Operator | null {
  const s = seg.trim();
  let m: RegExpExecArray | null;
  // d²/dx² f — "d2/dx" from LaTeX, "d^(2)/dx^(2)" from Unicode.
  if ((m = new RegExp(String.raw`^d\s*(?:2|\^\s*\(?\s*2\s*\)?)\s*/\s*d\s*(${VAR})\s*(?:\^\s*\(?\s*2\s*\)?|2)?(?![a-z])\s*([\s\S]+)$`).exec(s))) {
    const inner = unwrap(m[2]);
    const subject = byName(inner, defs) ?? toGrammar(inner);
    return subject ? { kind: 'derivative', subject, wrt: m[1], order: 2 } : null;
  }
  if ((m = new RegExp(String.raw`^d\s*/\s*d\s*(${VAR})(?![a-z0-9_])\s*([\s\S]+)$`).exec(s))) {
    const inner = unwrap(m[2]);
    const subject = byName(inner, defs) ?? toGrammar(inner);
    return subject ? { kind: 'derivative', subject, wrt: m[1], order: 1 } : null;
  }
  // dy/dx with y defined.
  if ((m = new RegExp(String.raw`^d\s*([a-zA-Z])\s*/\s*d\s*(${VAR})$`).exec(s))) {
    const def = defs[m[1]];
    return def && def.variable === m[2] ? { kind: 'derivative', subject: def.expr, wrt: m[2], order: 1 } : null;
  }
  // f'(x), f''(x), y' with f or y defined.
  if ((m = new RegExp(String.raw`^([a-zA-Z])\s*('{1,2})\s*(?:\(\s*(${VAR})\s*\))?$`).exec(s))) {
    const def = defs[m[1]];
    if (!def || (m[3] && m[3] !== def.variable)) return null;
    return { kind: 'derivative', subject: def.expr, wrt: def.variable, order: m[2].length as 1 | 2 };
  }
  // (expression)' and [expression]'
  if ((m = /^[([]([\s\S]+)[)\]]\s*('{1,2})$/.exec(s))) {
    const subject = toGrammar(m[1]);
    const wrt = subject ? soleVariable(subject) : null;
    return subject && wrt ? { kind: 'derivative', subject, wrt, order: m[2].length as 1 | 2 } : null;
  }
  // ∫ f dx and ∫_a^b f dx
  if ((m = new RegExp(String.raw`^∫\s*(?:_\s*(\([^()]*\)|[-+]?[\w.]+)\s*\^\s*(\([^()]*\)|[-+]?[\w.∞]+))?\s*([\s\S]+?)\s*\*?\s*d\s*(${VAR})\s*$`).exec(s))) {
    const inner = unwrap(m[3]);
    const integrand = byName(inner, defs) ?? toGrammar(inner);
    if (!integrand) return null;
    if (m[1] !== undefined && m[2] !== undefined) {
      const lower = readBound(m[1]);
      const upper = readBound(m[2]);
      return lower && upper ? { kind: 'definite', subject: integrand, wrt: m[4], lower, upper } : null;
    }
    return { kind: 'antiderivative', subject: integrand, wrt: m[4] };
  }
  // lim_(x → a) f — not \blim: the underscore is a word character.
  if (/^lim(?![a-zA-Z])/.test(s)) {
    let rest = s.slice(3).replace(/^\s*_?\s*/, '');
    let spec: string;
    if (rest.startsWith('(')) {
      let depth = 0;
      let end = -1;
      for (let i = 0; i < rest.length; i++) {
        if (rest[i] === '(') depth++;
        else if (rest[i] === ')' && --depth === 0) {
          end = i;
          break;
        }
      }
      if (end < 0) return null;
      spec = rest.slice(1, end);
      rest = rest.slice(end + 1);
    } else {
      const sm = /^(\S+\s*→\s*[^\s]+)\s+/.exec(rest);
      if (!sm) return null;
      spec = sm[1];
      rest = rest.slice(sm[0].length);
    }
    const am = new RegExp(String.raw`^\s*(${VAR})\s*→\s*(.+)$`).exec(spec);
    if (!am) return null;
    const approach = readApproach(am[2]);
    const subject = toGrammar(unwrap(rest));
    if (!approach || !subject) return null;
    return { kind: 'limit', subject, wrt: am[1], at: approach.at, side: approach.side };
  }
  return null;
}

// ── claims from one formula ────────────────────────────────────────────

interface Ctx { defs: Defs; sentence: string; standalone: boolean; prefix: string[] }

function operatorClaims(op: Operator, rhs: string[], ops: string[], text: string): Claim[] {
  const out: Claim[] = [];
  for (let i = 0; i < rhs.length; i++) {
    const raw = strip(rhs[i]);
    if (!raw) continue;
    const approx = ops[i] === '≈';
    if (op.kind === 'derivative') {
      const claimed = toGrammar(raw);
      if (claimed && sameNames(op.subject, claimed, op.wrt)) out.push({ kind: 'derivative', text, subject: op.subject, wrt: op.wrt, order: op.order ?? 1, claimed });
    } else if (op.kind === 'antiderivative') {
      const claimed = toGrammar(raw.replace(PLUS_C, ''));
      if (claimed && sameNames(op.subject, claimed, op.wrt)) out.push({ kind: 'antiderivative', text, integrand: op.subject, wrt: op.wrt, claimed });
    } else if (op.kind === 'definite') {
      const claimed = toGrammar(raw);
      if (claimed && !namesIn(claimed).length) out.push({ kind: 'definite', text, integrand: op.subject, wrt: op.wrt, lower: op.lower!, upper: op.upper!, claimed, approx });
    } else if (op.kind === 'limit') {
      const claimed = /^[+-]?∞$/.test(raw) ? raw.replace('+', '') : toGrammar(raw);
      if (claimed && (claimed.includes('∞') || !namesIn(claimed).length)) out.push({ kind: 'limit', text, subject: op.subject, wrt: op.wrt, at: op.at!, side: op.side ?? 0, claimed });
    }
  }
  return out;
}

/** The operator a sentence's words put in front of a formula: "the derivative of …". */
function prefixOperator(prefix: string[]): 'derivative' | 'antiderivative' | 'limit' | null {
  const p = prefix.filter((w) => w !== 'the' && w !== 'a' && w !== 'an');
  const last2 = p.slice(-2).join(' ');
  const last = p[p.length - 1];
  if (/^(?:derivative|differential) of$/.test(last2) || last === 'differentiating' || last === 'differentiate') return 'derivative';
  if (/^(?:integral|antiderivative|anti-derivative) of$/.test(last2) || last === 'integrating' || last === 'integrate') return 'antiderivative';
  if (last2 === 'limit of') return 'limit';
  return null;
}

/**
 * A sentence that holds a formula at arm's length — quoting an earlier
 * mistake, naming a common error, reporting what someone else said. The
 * formula in it is not asserted, and "correcting" it would punish exactly the
 * reply that owns up: "Earlier I wrote csc(x)cot(x) — that was wrong."
 */
const DISOWNED = /\b(?:wrong|incorrect|mistake[ns]?|mistaken|errors?|erroneous|false|typo|misstated|misspoke|should have (?:been|said|written)|i (?:wrote|said|gave|had|claimed|stated)|you (?:wrote|said|gave|had|claimed|have|got)|your (?:answer|version|result|working)|earlier|previously|common(?:ly)? (?:mistake|error|slip|confusion)|students? (?:often|sometimes|commonly|tend)|people (?:often|sometimes)|frequent (?:mistake|error)|tempting|misconception|myth|claims?|claimed|believes?|slogan|orwell)\b|["“”]/i;
const PERSON_DISOWNED = /\byou (?:wrote|said|gave|had|claimed|got)\b|\byour (?:answer|version|result)\b/i;

function formulaClaims(raw: string, ctx: Ctx, out: Extracted, role: 'reply' | 'person'): void {
  if (role === 'reply' ? DISOWNED.test(ctx.sentence) : PERSON_DISOWNED.test(ctx.sentence)) {
    // Definitions still count — "earlier I defined f(x) = x²" defines f.
    const d = new RegExp(String.raw`^\s*([a-zA-Z])\s*\(\s*(${VAR})\s*\)\s*=\s*([^=]+)$`).exec(raw);
    if (d && !FUNCTIONS.has(d[1].toLowerCase())) {
      const expr = toGrammar(strip(d[3]));
      if (expr) out.defs[d[1]] = { variable: d[2], expr };
    }
    return;
  }
  // Several equations in one run, separated by commas: f'(x) = 2x, f''(x) = 2.
  const byComma = splitTop(raw, [',']);
  if (byComma.parts.filter((p) => /[=≈]/.test(p)).length > 1) {
    for (const p of byComma.parts) formulaClaims(p, ctx, out, role);
    return;
  }
  // Code, definitions-by-assignment, and congruences (≡ … mod n) are not claims this reads.
  if (/==|:=|\bmod\b|\(mod/.test(raw)) return;
  const { parts, ops } = splitTop(raw, ['=', '≈', '≡']);
  const text = raw.trim().slice(0, 200);
  if (parts.length < 2) {
    posedFromBare(raw, ctx, out);
    return;
  }
  const [lhs, ...rhs] = parts;

  // An operator the words supplied: "the derivative of csc x = −csc x cot x".
  const said = prefixOperator(ctx.prefix);
  if (said === 'derivative' || said === 'antiderivative') {
    const inner = unwrap(lhs.replace(/\s*\*?\s*d\s*[a-z]\s*$/, ''));
    const subject = byName(inner, out.defs) ?? toGrammar(inner);
    const wrt = subject ? variableOf(subject) : null;
    if (subject && wrt) {
      out.claims.push(...operatorClaims({ kind: said, subject, wrt, order: 1 }, rhs, ops, text));
      return;
    }
  }

  const op = readOperator(strip(lhs), out.defs);
  if (op) {
    // "Set f'(x) = 0", "where dy/dx = 3": an equation to solve, not a claim
    // about the derivative.
    const constantRhs = rhs.every((r) => {
      const g = toGrammar(strip(r));
      return !!g && !namesIn(g).length;
    });
    if (op.kind === 'derivative' && constantRhs && /\b(?:set(?:ting)?|solve[sd]?|solving|when|where|at|if|critical|stationary|zero|horizontal|maxim\w*|minim\w*|extrem\w*|for which)\b/i.test(ctx.sentence)) return;
    out.claims.push(...operatorClaims(op, rhs, ops, text));
    return;
  }

  // f(x) = …, y = … : a definition, and any further links in the chain are claims.
  const defM = new RegExp(String.raw`^([a-zA-Z])\s*\(\s*(${VAR})\s*\)$`).exec(strip(lhs));
  if (defM && !FUNCTIONS.has(defM[1].toLowerCase())) {
    const expr = toGrammar(strip(rhs[0]));
    if (expr) out.defs[defM[1]] = { variable: defM[2], expr };
    chainClaims(rhs, ops.slice(1), text, ctx, out);
    return;
  }
  if (/^y$/.test(strip(lhs)) && rhs.length) {
    const expr = toGrammar(strip(rhs[0]));
    const v = expr ? soleVariable(expr) : null;
    if (expr && v && v !== 'y') {
      out.defs.y = { variable: v, expr };
      chainClaims(rhs, ops.slice(1), text, ctx, out);
      return;
    }
  }

  // x = 2, x = −1 ± √2, x = 2, 3 — a solution, if the sentence says so.
  const solM = new RegExp(String.raw`^(${VAR})$`).exec(strip(lhs));
  if (solM && rhs.length === 1) {
    const values = solutionValues(strip(rhs[0]));
    if (values.length) {
      if (solutionContext(ctx)) {
        out.claims.push({ kind: 'solution', text, variable: solM[1], values, complete: /\b(?:solutions?|roots?|zeros?|zeroes) (?:are|is)\b|\bonly\b|\bboth\b/i.test(ctx.sentence) || values.length > 1 });
      }
      return;
    }
  }

  chainClaims(parts, ops, text, ctx, out);
  if (role === 'person' && parts.length === 2 && SOLVE_ASKED.test(ctx.sentence)) posedEquation(parts[0], parts[1], text, out);
}

/** Consecutive links of a chain: a = b = c claims a = b and b = c. Arithmetic, rewrites, identities. */
function chainClaims(parts: string[], ops: string[], text: string, ctx: Ctx, out: Extracted): void {
  const g = parts.map((p) => toGrammar(strip(p)));
  // A chain that ends in "= 0" (or any constant) is an equation at that link, not a rewrite.
  const chain = parts.length >= 3;
  for (let i = 0; i + 1 < parts.length; i++) {
    const a = g[i];
    const b = g[i + 1];
    if (!a || !b) continue;
    const approx = ops[i] === '≈' || ops.includes('≈');
    const na = namesIn(a);
    const nb = namesIn(b);
    if (!na.length && !nb.length) {
      // Arithmetic: something computed on the left, a value on the right.
      if (/[-+*/^(]/.test(a.replace(/^-/, '')) || /[a-z]/.test(a)) out.claims.push({ kind: 'arithmetic', text, left: a, right: b, approx });
      continue;
    }
    // One constant side is an equation to solve — unless the sentence calls
    // it an identity: "sin²x + cos²x = 1 always holds".
    if (!na.length || !nb.length) {
      const names = na.length ? na : nb;
      if (IDENTITY_SAID.test(ctx.sentence) && !SOLVE_WORDS.test(ctx.sentence) && names.every(isSymbolName)) out.claims.push({ kind: 'equal', text, left: a, right: b, why: 'identity' });
      continue;
    }
    if (na.slice().sort().join() !== nb.slice().sort().join() || !na.every(isSymbolName)) continue;
    if (SOLVE_WORDS.test(ctx.sentence) && !IDENTITY_WORDS.test(ctx.sentence)) continue;
    if (chain) {
      out.claims.push({ kind: 'equal', text, left: a, right: b, why: 'chain' });
    } else if (IDENTITY_WORDS.test(ctx.sentence)) {
      out.claims.push({ kind: 'equal', text, left: a, right: b, why: 'identity' });
    } else if ((RECIPROCAL_CALL.test(a) && TRIG.test(b)) || (RECIPROCAL_CALL.test(b) && TRIG.test(a))) {
      out.claims.push({ kind: 'equal', text, left: a, right: b, why: 'reciprocal' });
    }
  }
}

function solutionValues(raw: string): string[] {
  const list = raw.startsWith('⦃') && raw.endsWith('⦄') ? raw.slice(1, -1) : raw;
  const items = splitTop(list, [',']).parts.map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  for (const item of items) {
    const variants = /[±∓]/.test(item) ? [item.replace(/[±∓]/, '+'), item.replace(/[±∓]/, '-')] : [item];
    for (const v of variants) {
      const g = toGrammar(v);
      if (!g || namesIn(g).length) return [];
      out.push(g);
    }
  }
  return out;
}

const HYPOTHETICAL = /\b(?:if|when|whenever|at|for|plug(?:ging)? in|substitut\w*|try(?:ing)?|test(?:ing)?|suppose|assume|let|set(?:ting)?|check(?:ing)?|instead of|not|isn't|wouldn't|doesn't|extraneous|reject\w*|discard\w*|invalid|excluded?|fails?)\b/i;

function solutionContext(ctx: Ctx): boolean {
  if (HYPOTHETICAL.test(ctx.sentence)) return false;
  if (ctx.standalone) return true;
  return /\b(?:solutions?|roots?|zeros?|zeroes|answer|so|therefore|thus|hence|gives?|giving|get|gets|obtain|which means|meaning)\b|⇒/i.test(ctx.sentence);
}

// ── problems posed, not answered ───────────────────────────────────────

function posedFromBare(raw: string, ctx: Ctx, out: Extracted): void {
  const said = prefixOperator(ctx.prefix);
  const text = raw.slice(0, 160);
  if (said === 'derivative' || said === 'antiderivative') {
    const inner = unwrap(raw.replace(/\s*\*?\s*d\s*[a-z]\s*$/, ''));
    const subject = byName(inner, out.defs) ?? toGrammar(inner);
    const wrt = subject ? variableOf(subject) : null;
    if (subject && wrt) {
      out.posed.push(said === 'derivative'
        ? { kind: 'derivative', subject, wrt, order: 1, text }
        : { kind: 'antiderivative', integrand: subject, wrt, text });
    }
    return;
  }
  const op = readOperator(strip(raw), out.defs);
  if (!op) return;
  if (op.kind === 'derivative') out.posed.push({ kind: 'derivative', subject: op.subject, wrt: op.wrt, order: op.order ?? 1, text });
  else if (op.kind === 'antiderivative') out.posed.push({ kind: 'antiderivative', integrand: op.subject, wrt: op.wrt, text });
  else if (op.kind === 'definite') out.posed.push({ kind: 'definite', integrand: op.subject, wrt: op.wrt, lower: op.lower!, upper: op.upper!, text });
  else out.posed.push({ kind: 'limit', subject: op.subject, wrt: op.wrt, at: op.at!, side: op.side ?? 0, text });
}

function posedEquation(left: string, right: string, text: string, out: Extracted): void {
  const l = toGrammar(strip(left));
  const r = toGrammar(strip(right));
  if (!l || !r) return;
  const names = [...new Set([...namesIn(l), ...namesIn(r)])];
  if (names.length !== 1 || !isSymbolName(names[0])) return;
  // "P = 20" assigns; it does not ask anything.
  const lone = (g: string) => /^\(?\s*[a-z]\w*\s*\)?$/i.test(g.trim());
  if ((lone(l) && !namesIn(r).length) || (lone(r) && !namesIn(l).length)) return;
  if (!out.posed.some((p) => p.kind === 'equation' && p.left === l && p.right === r)) out.posed.push({ kind: 'equation', left: l, right: r, variable: names[0], text });
}

// ── prose around formulas ──────────────────────────────────────────────

const IS = new Set(['is', 'equals', 'gives', 'becomes', 'yields', 'produces']);
const AFTER_OK = new Set(['by', 'because', 'since', 'using', 'which', 'so', 'and', 'but', 'not', 'for', 'when', 'where', 'as', 'from', 'in', 'on', 'at', 'with', 'via', 'here', 'there', 'then', 'too', 'also', 'instead', 'rather', 'plus', 'or', 'right']);

/** The math token at k, if what follows it ends the claim (so "is a linear function" is not "is a"). */
function mathAt(tokens: Token[], k: number, follow: ReadonlySet<string> = AFTER_OK): string | null {
  const t = tokens[k];
  if (!t || t.t !== 'math' || t.cut) return null;
  const next = tokens[k + 1];
  if (next && next.t === 'word' && !follow.has(next.v)) return null;
  return t.v;
}

// After an answer, a condition ("it is 0 at x = π/2") means it is not the
// answer — so "at", "when", "for", "where", "if" do not close one.
const AFTER_ANSWER = new Set(['by', 'because', 'since', 'using', 'which', 'so', 'and', 'but', 'not', 'via', 'here', 'there', 'too', 'also', 'instead', 'rather', 'right']);

function proseClaims(s: Sentence, out: Extracted, role: 'reply' | 'person', current: Posed | null): void {
  if (role === 'reply' && DISOWNED.test(s.text)) return;
  const tk = s.tokens;
  const word = (i: number) => (tk[i]?.t === 'word' ? (tk[i] as { v: string }).v : null);
  const math = (i: number) => (tk[i]?.t === 'math' && !(tk[i] as { cut?: boolean }).cut ? (tk[i] as { v: string }).v : null);
  for (let i = 0; i < tk.length; i++) {
    const w = word(i);
    if (!w) continue;
    // the derivative of M [with respect to V] is M2
    if ((w === 'derivative' || w === 'integral' || w === 'antiderivative') && word(i + 1) === 'of' && math(i + 2) && !/[=≈]/.test(math(i + 2)!)) {
      let k = i + 3;
      let wrt: string | null = null;
      if (word(k) === 'with' && word(k + 1) === 'respect' && word(k + 2) === 'to' && math(k + 3)) {
        wrt = math(k + 3)!.trim();
        k += 4;
      }
      if (word(k) && IS.has(word(k)!)) {
        k++;
        if (word(k) === 'just' || word(k) === 'simply') k++;
        const m2 = mathAt(tk, k);
        const subjRaw = math(i + 2)!.replace(/\s*\*?\s*d\s*[a-z]\s*$/, '');
        const subject = byName(unwrap(subjRaw), out.defs) ?? toGrammar(unwrap(subjRaw));
        const v = wrt && isSymbolName(wrt) ? wrt : subject ? variableOf(subject) : null;
        if (m2 && !/[=≈]/.test(m2) && subject && v) {
          const op: Operator = w === 'derivative' ? { kind: 'derivative', subject, wrt: v, order: 1 } : { kind: 'antiderivative', subject, wrt: v };
          out.claims.push(...operatorClaims(op, [m2], [''], `the ${w} of ${subjRaw.trim()} is ${m2}`.slice(0, 200)));
        }
      }
    }
    // the integral of M from A to B [is V] — and "between A and B"
    if (w === 'integral' && word(i + 1) === 'of' && math(i + 2) && (word(i + 3) === 'from' || word(i + 3) === 'between') && math(i + 4) && (word(i + 5) === 'to' || word(i + 5) === 'and') && math(i + 6)) {
      const integrand = toGrammar(unwrap(math(i + 2)!.replace(/\s*\*?\s*d\s*[a-z]\s*$/, '')));
      const lower = readBound(math(i + 4)!);
      const upper = readBound(math(i + 6)!);
      const wrt = integrand ? variableOf(integrand) : null;
      if (integrand && lower && upper && wrt) {
        // Posed by the question, or claimed by the reply.
        const already = out.posed.findIndex((p) => p.kind === 'antiderivative' && p.integrand === integrand);
        if (already >= 0) out.posed.splice(already, 1);
        out.posed.push({ kind: 'definite', integrand, wrt, lower, upper, text: `the integral of ${math(i + 2)} from ${math(i + 4)} to ${math(i + 6)}` });
        if (word(i + 7) === 'is' || word(i + 7) === 'equals') {
          const v = mathAt(tk, i + 8);
          if (v) out.claims.push(...operatorClaims({ kind: 'definite', subject: integrand, wrt, lower, upper }, [v], [''], `the integral of ${math(i + 2)} from ${math(i + 4)} to ${math(i + 6)} is ${v}`));
        }
      }
    }
    // M differentiates to M2
    if (w === 'differentiates' && word(i + 1) === 'to' && math(i - 1)) {
      const subject = toGrammar(unwrap(math(i - 1)!));
      const m2 = mathAt(tk, i + 2);
      const v = subject ? soleVariable(subject) : null;
      if (subject && m2 && v) out.claims.push(...operatorClaims({ kind: 'derivative', subject, wrt: v, order: 1 }, [m2], [''], `${math(i - 1)} differentiates to ${m2}`));
    }
    // the limit of M as V approaches A [from the right] is L
    if (w === 'limit' && word(i + 1) === 'of' && math(i + 2) && word(i + 3) === 'as' && math(i + 4)) {
      let k = i + 5;
      while (word(k) && ['approaches', 'goes', 'tends', 'to', 'towards'].includes(word(k)!)) k++;
      const atRaw = math(k);
      if (atRaw) {
        let side: 0 | 1 | -1 = 0;
        let j = k + 1;
        if (word(j) === 'from') {
          const dir = word(j + 1) === 'the' ? word(j + 2) : word(j + 1);
          side = dir === 'right' || dir === 'above' ? 1 : dir === 'left' || dir === 'below' ? -1 : 0;
          j += word(j + 1) === 'the' ? 3 : 2;
        }
        if (word(j) === 'is' || word(j) === 'equals') {
          const L = mathAt(tk, j + 1);
          const subject = toGrammar(unwrap(math(i + 2)!));
          const wrt = math(i + 4)!.trim();
          const approach = readApproach(atRaw);
          if (L && subject && isSymbolName(wrt) && approach) {
            out.claims.push(...operatorClaims({ kind: 'limit', subject, wrt, at: approach.at, side: side || approach.side }, [L], [''], `the limit of ${math(i + 2)} as ${wrt} → ${atRaw} is ${L}`));
          }
        }
      }
    }
    // the domain / range of M is SET
    if ((w === 'domain' || w === 'range') && word(i + 1) === 'of' && math(i + 2) && (word(i + 3) === 'is' || word(i + 3) === 'equals')) {
      const subjRaw = math(i + 2)!;
      const def = /^([a-zA-Z])\s*(?:\(\s*([a-z]+)\s*\))?$/.exec(subjRaw.trim());
      const subject = def && out.defs[def[1]] ? out.defs[def[1]].expr : toGrammar(subjRaw);
      const variable = def && out.defs[def[1]] ? out.defs[def[1]].variable : subject ? soleVariable(subject) : null;
      const set = setText(tk, i + 4);
      if (subject && variable && set) out.claims.push({ kind: 'set', text: `the ${w} of ${subjRaw} is ${set}`, subject, variable, set, which: w });
    }
    // "I got M", "isn't it M", "the answer is M": an answer to the problem on the table.
    if (current) {
      let k = role === 'person' ? answerLead(tk, i) : replyAnswerLead(tk, i, current);
      // "it is probably …", "it's still …", "I got just …"
      while (k > 0 && ['probably', 'likely', 'just', 'simply', 'actually', 'definitely', 'really', 'indeed', 'still', 'exactly'].includes(word(k) ?? '')) k++;
      if (k > 0) {
        const m = mathAt(tk, k, AFTER_ANSWER);
        if (m && !/[=≈]/.test(m)) out.claims.push(...answerClaims(current, m));
      }
    }
  }
}

/** Where an answer starts after phrasing that can introduce nothing else. */
function answerLead(tk: Token[], i: number): number {
  const w = (k: number) => (tk[k]?.t === 'word' ? (tk[k] as { v: string }).v : null);
  const seq = (...ws: string[]) => ws.every((x, j) => w(i + j) === x);
  // Only phrasings that can introduce nothing BUT an answer: "the function was
  // x^2" must not become "the derivative of csc x is x^2".
  const leads: string[][] = [
    ['i', 'got'], ['i', 'get'], ["i'm", 'getting'], ['i', 'keep', 'getting'], ['answer', 'is'], ["isn't", 'it'], ['is', 'it'],
    ["shouldn't", 'it', 'be'], ['should', 'it', 'be'], ['it', 'should', 'be'], ["wouldn't", 'it', 'be'], ["it's", 'actually'],
    ['actually', "it's"], ['i', 'think', "it's"], ['i', 'think', 'it', 'is'], ['i', 'thought', 'it', 'was'], ["it's"],
  ];
  for (const l of leads) if (seq(...l)) return i + l.length;
  // "my textbook says …", "the answer key gives …"
  if ((w(i) === 'says' || w(i) === 'gives' || w(i) === 'shows') && /^(?:book|textbook|teacher|professor|notes|calculator|key|solutions?|wolfram|tutor|lecturer|ta)$/.test(w(i - 1) ?? '')) return i + 1;
  return -1;
}

/**
 * Where a reply's own answer starts, when the question is known: "It is
 * −csc(x)cot(x)", "the derivative is …", "so we get …". Only at the start of
 * a sentence or after a connective, so "it is" mid-sentence about something
 * else is not taken for the answer.
 */
function replyAnswerLead(tk: Token[], i: number, p: Posed): number {
  const w = (k: number) => (tk[k]?.t === 'word' ? (tk[k] as { v: string }).v : null);
  const seq = (...ws: string[]) => ws.every((x, j) => w(i + j) === x);
  const opener = i === 0 || ['so', 'thus', 'therefore', 'hence', 'and', 'which', 'then'].includes(w(i - 1) ?? '') || tk[i - 1]?.t === 'punct';
  if (!opener) return -1;
  const noun = p.kind === 'derivative' ? 'derivative' : p.kind === 'limit' ? 'limit' : p.kind === 'antiderivative' || p.kind === 'definite' ? 'integral' : null;
  const leads: string[][] = [
    ["it's"], ['it', 'is'], ['answer', 'is'], ['the', 'answer', 'is'], ['result', 'is'], ['the', 'result', 'is'], ['we', 'get'], ['you', 'get'],
    ...(noun ? [[noun, 'is'], ['the', noun, 'is'], ['its', noun, 'is']] : []),
  ];
  for (const l of leads) if (seq(...l)) return i + l.length;
  return -1;
}

function answerClaims(p: Posed, m: string): Claim[] {
  const text = m.slice(0, 160);
  // A bare number is not an answer to "what is the derivative / the integral
  // of …" — it is a value at a point, or a definite integral, or something
  // else; reading it as the function would "refute" a right reply.
  if (p.kind === 'derivative' || p.kind === 'antiderivative') {
    const g = toGrammar(m);
    if (!g || !namesIn(g).includes(p.wrt)) return [];
  }
  if (p.kind === 'derivative') return operatorClaims({ kind: 'derivative', subject: p.subject, wrt: p.wrt, order: p.order }, [m], [''], `d/d${p.wrt} ${p.subject} = ${text}`);
  if (p.kind === 'antiderivative') return operatorClaims({ kind: 'antiderivative', subject: p.integrand, wrt: p.wrt }, [m], [''], `∫ ${p.integrand} d${p.wrt} = ${text}`);
  if (p.kind === 'definite') return operatorClaims({ kind: 'definite', subject: p.integrand, wrt: p.wrt, lower: p.lower, upper: p.upper }, [m], [''], `∫ ${p.integrand} from ${p.lower} to ${p.upper} = ${text}`);
  if (p.kind === 'limit') return operatorClaims({ kind: 'limit', subject: p.subject, wrt: p.wrt, at: p.at, side: p.side }, [m], [''], `lim ${p.subject} = ${text}`);
  return [];
}

/** The rest of a sentence from k, as the text of a set: "all real numbers except 0", "[2, ∞)". */
function setText(tk: Token[], k: number): string | null {
  const parts: string[] = [];
  for (let j = k; j < tk.length; j++) {
    const t = tk[j];
    if (t.t === 'punct' && (t.v === '.' || t.v === ';' || t.v === ':')) break;
    if (t.t === 'word' && ['because', 'since', 'which', 'so', 'as'].includes(t.v)) break;
    parts.push(t.v);
  }
  const s = parts.join(' ').trim();
  return s && s.length <= 120 ? s : null;
}

// ── units: "1 mile ≈ 1.609 km" ─────────────────────────────────────────

// A unit is letters (and /, ^, digits, ·) — never a parenthesis, which means
// a function call or an expression, not a unit.
const UNIT_CLAIM = /(?<![\w.])(-?\d[\d,]*(?:\.\d+)?)\s*([A-Za-zµΩ°][A-Za-z0-9µΩ°/^*·.-]*?)\s*(?:=|≈|\bis (?:about |approximately |roughly |around )?|\bequals )\s*(-?\d[\d,]*(?:\.\d+)?)\s*([A-Za-zµΩ°][A-Za-z0-9µΩ°/^*·-]*)(?![\w(])/g;

function unitClaims(plainLine: string, out: Extracted): void {
  for (const m of plainLine.matchAll(UNIT_CLAIM)) {
    const [whole, lv, lu, rv, ru] = m;
    const rightUnit = ru.replace(/[.,;:]+$/, '');
    // A variable, a function or a single letter on its own is not a unit.
    if ([lu, rightUnit].some((u) => FUNCTIONS.has(u.toLowerCase()) || (/^[a-z]$/.test(u) && !/^[mgsl]$/.test(u)))) continue;
    out.claims.push({ kind: 'unit', text: whole.trim(), leftValue: lv.replace(/,/g, ''), leftUnit: lu, rightValue: rv.replace(/,/g, ''), rightUnit, approx: /≈|about|approximately|roughly|around/.test(whole) });
  }
}

// ── the whole text ─────────────────────────────────────────────────────

export interface ExtractOptions {
  /** whose words these are: a reply's claims, or a person's claims and questions */
  role: 'reply' | 'person';
  /** definitions already made earlier in the conversation */
  defs?: Defs;
  /** the problem on the table, so "I got −csc x cot x" can be read as an answer to it */
  current?: Posed | null;
}

/** Every checkable claim, posed problem and definition in a piece of text. */
export function extract(text: string, opts: ExtractOptions): Extracted {
  const out: Extracted = { claims: [], posed: [], defs: { ...(opts.defs ?? {}) } };
  if (!text || text.length > 40_000) return out;
  const flat = flatten(text);
  for (const s of sentences(flat)) {
    const sentence = s.text;
    const before0 = out.claims.length;
    const prefixWords: string[] = [];
    for (const tok of s.tokens) {
      if (tok.t === 'word') {
        prefixWords.push(tok.v);
        continue;
      }
      if (tok.t === 'punct') {
        if (tok.v !== ',') prefixWords.length = 0;
        continue;
      }
      if (!tok.cut) formulaClaims(tok.v, { defs: out.defs, sentence, standalone: s.standalone, prefix: prefixWords.slice(-4) }, out, opts.role);
      prefixWords.length = 0;
    }
    // "The solutions are x = 2 and x = 3" is ONE answer with two values: each
    // run alone would read as an incomplete list missing the other.
    const sols = out.claims.slice(before0).filter((c): c is Extract<Claim, { kind: 'solution' }> => c.kind === 'solution');
    if (sols.length > 1 && sols.every((c) => c.variable === sols[0].variable)) {
      const merged: Claim = { kind: 'solution', text: sols.map((c) => c.text).join('; '), variable: sols[0].variable, values: sols.flatMap((c) => c.values), complete: sols.some((c) => c.complete) || /\b(?:solutions?|roots?|zeros?|zeroes) (?:are|is)\b/i.test(sentence) };
      out.claims = [...out.claims.slice(0, before0), ...out.claims.slice(before0).filter((c) => c.kind !== 'solution'), merged];
    }
    const current = out.posed[out.posed.length - 1] ?? opts.current ?? null;
    proseClaims(s, out, opts.role, current);
    if (/\d/.test(sentence)) unitClaims(sentence, out);
    // A person asking to solve: "solve x^2 - 5x + 6 = 0".
    if (opts.role === 'person' && SOLVE_ASKED.test(sentence)) {
      for (const tok of s.tokens) {
        if (tok.t !== 'math' || tok.cut) continue;
        const { parts } = splitTop(tok.v, ['=']);
        if (parts.length === 2) posedEquation(parts[0], parts[1], tok.v.slice(0, 160), out);
      }
    }
    // "is csc x = 1/sin x?", "prove that sin^2 x + cos^2 x = 1": an identity to settle.
    // Only when they ask about it in so many words — "prove", "is it true",
    // "is csc x = 1/sin x?" — and only between two expressions in the same
    // variables. "p = 0.04", "f(n) = 1/n" and "P·Q = 100Q − 2Q²" are an
    // assignment, a definition and a model: none of them asks whether
    // anything holds, and computing that they "do not hold" (as a first
    // version did, on real messages) tells the reply something false.
    const asksIdentity = /\b(?:prove|show that|verify|check (?:that|whether|if)|is it true|true that|equal to|the same as|equivalent|an identity|identical)\b/i.test(sentence) || /^\s*(?:is|are|does|do)\b[^?]*\?\s*$/i.test(sentence);
    if (opts.role === 'person' && asksIdentity && !SOLVE_ASKED.test(sentence)) {
      for (const tok of s.tokens) {
        if (tok.t !== 'math' || tok.cut || /\bmod\b/.test(tok.v)) continue;
        const { parts } = splitTop(tok.v, ['=', '≡']);
        if (parts.length !== 2 || readOperator(strip(parts[0]), out.defs)) continue;
        const l = toGrammar(strip(parts[0]));
        const r = toGrammar(strip(parts[1]));
        if (!l || !r) continue;
        const nl = namesIn(l).sort().join();
        const nr = namesIn(r).sort().join();
        const lone = (g: string) => /^\(?\s*[a-z]\w*\s*\)?$/i.test(g.trim()) || /^[a-z]\s*\(\s*[a-z]+\s*\)$/i.test(g.trim());
        if (nl && nl === nr && namesIn(l).every(isSymbolName) && !lone(l) && !lone(r)) {
          out.posed.push({ kind: 'identity', left: l, right: r, text: tok.v.slice(0, 160) });
        }
      }
    }
  }
  // The same claim found twice (a formula and the prose around it) is one claim.
  const seen = new Set<string>();
  out.claims = out.claims.filter((c) => {
    const key = JSON.stringify({ ...c, text: '' });
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return out;
}
