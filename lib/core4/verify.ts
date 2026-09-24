// lib/core4/verify.ts
//
// Verify Mode: know whether their work is right without handing the reply
// model the solution.
//
// WHY. When someone is practising, the most useful thing Socria can say is
// "that's wrong, and here is exactly where" — which requires knowing the
// right answer. If the right answer sits in the reply model's context, it
// leaks: into a "hint", into an "example", into "so you should get 391".
// Verify Mode computes or checks the answer in a SEPARATE step and hands the
// reply model only what it needs to guide: the verdict, where it goes wrong,
// what kind of error. The value itself goes to the Answer Guard, which
// removes any sentence that states it.
//
// TWO PATHS.
//   exact    arithmetic the Logos evaluator can compute (lib/logos-math.ts):
//            the problem's expression is evaluated and compared with the
//            number they gave. No model; cannot be wrong about arithmetic.
//   checker  a separate cheap-model call judges the attempt against the
//            problem and returns a verdict, a location and an error type.
//
// HONEST LIMITS (documented in docs/CORE-4-ARCHITECTURE.md):
//   - The separation keeps the answer out of the reply model's CONTEXT, not
//     out of its capability. A frontier model can re-derive the answer
//     itself; the guard's hidden-value check is the backstop, and it only
//     catches the value in the forms the checker reported it.
//   - The checker is a cheaper model than the reply model and can be wrong on
//     hard problems. Its verdict is presented as a check, and when it is not
//     confident no verdict is claimed.
//   - The exact path covers arithmetic only. Algebra, proofs and prose go to
//     the checker.
//
// Pure (the checker call is in lib/cognition/engine.ts).

import { compileExpr } from '../logos-math';

export interface CheckResult {
  verdict: 'correct' | 'incorrect' | 'partial' | 'unknown';
  /** where it goes wrong, in their terms — safe to show */
  location: string;
  /** what kind of error — safe to show */
  errorType: string;
  /** the correct final answer — NEVER shown to the reply model */
  expected: string;
  confidence: number;
  method: 'exact' | 'checker';
}

/** A math-looking run of characters: digits, operators, parentheses, functions. */
const EXPR = /(?:[-(]?\s*(?:\d+(?:\.\d+)?|sqrt|sin|cos|tan|log|ln|exp|pi|e)\s*[-+*/^×÷()]*\s*){2,}/gi;

function cleanExpr(s: string): string {
  return s.replace(/×/g, '*').replace(/÷/g, '/').replace(/\s+/g, '').replace(/[=?]+$/, '');
}

/** Numbers in a message, as they wrote them. */
function numbersIn(s: string): number[] {
  return (s.replace(/,(?=\d{3}\b)/g, '').match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number).filter(Number.isFinite);
}

/** Not arithmetic, even though it looks like it: dates, page and time ranges, versions, doses, money. */
const NOT_ARITHMETIC = /\d{4}-\d{2}-\d{2}|\bpp?\.\s*\d+-\d+|\d+\s*-\s*\d+\s*(?:%|min|minutes|hours?|days?|years?)|v?\d+\.\d+\.\d+|\d\s*(?:mg|mcg|kg|ml|%|\$)|\$\s*\d/i;

/** The expression the PERSON posed: after compute / evaluate / calculate / what is / find, or before "= ?". */
function posedExpressions(problem: string): string[] {
  const out: string[] = [];
  const anchored = /\b(?:compute|evaluate|calculate|what(?:'s| is)|find|work out)\b\s*:?\s*([^?\n]{1,120})|([^\n=]{1,120})=\s*\?/gi;
  let m: RegExpExecArray | null;
  while ((m = anchored.exec(problem))) {
    const seg = (m[1] ?? m[2] ?? '').trim();
    if (!seg || NOT_ARITHMETIC.test(seg)) continue;
    for (const e of seg.match(EXPR) ?? []) out.push(e);
  }
  return out;
}

/** The value they ANSWERED with: after the last "=", "is", "got", "get" or "answer"; else their last number. */
function finalValue(attempt: string): number | null {
  const t = attempt.replace(/,(?=\d{3}\b)/g, '');
  let cut = -1;
  for (const m of t.matchAll(/=|\bis\b|\bgot\b|\bget\b|\banswer\b/gi)) cut = Math.max(cut, (m.index ?? 0) + m[0].length);
  const tail = cut >= 0 ? t.slice(cut) : t;
  const nums = (tail.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number).filter(Number.isFinite);
  if (nums.length) return nums[0];
  const all = numbersIn(t);
  return all.length ? all[all.length - 1] : null;
}

/**
 * The exact path (council D13): only an arithmetic expression the PERSON
 * posed — never one from Socria's replies (a pilot run marked a correct
 * proof "incorrect (computed exactly)" against a number from Socria's own
 * counterexample) — and never dates, ranges, versions, doses or money. Their
 * FINAL stated value is compared, not any number in the message.
 */
export function exactCheck(problem: string, attempt: string): CheckResult | null {
  const candidates = posedExpressions(problem)
    .map(cleanExpr)
    .filter((e) => /\d/.test(e) && /[-+*/^]|sqrt|sin|cos|tan|log|ln|exp/.test(e))
    .sort((a, b) => b.length - a.length);
  for (const expr of candidates) {
    const c = compileExpr(expr, []);
    if (!c || c.vars.length) continue;
    const value = c.eval({});
    if (!Number.isFinite(value)) continue;
    const given = finalValue(attempt);
    if (given === null) return null;
    const tol = Math.max(1e-6, Math.abs(value) * 1e-4);
    const right = Math.abs(given - value) <= tol;
    const shown = Number.isInteger(value) ? String(value) : String(Math.round(value * 1e6) / 1e6);
    return {
      verdict: right ? 'correct' : 'incorrect',
      location: right ? '' : 'the final value',
      errorType: right ? '' : 'the computed value does not match',
      expected: shown,
      confidence: 1,
      method: 'exact',
    };
  }
  return null;
}

export const CHECK_SYSTEM = `You check one attempt at a problem. You do not talk to the person.

Given the PROBLEM (from the conversation) and their ATTEMPT, return JSON only:
{"verdict":"correct|incorrect|partial|unknown",
 "location":"<where it first goes wrong, in their own terms — e.g. 'the second line, where the derivative of the inner function is dropped'. Empty if correct>",
 "errorType":"<the kind of error: sign, missing term, wrong rule, arithmetic, assumption, incomplete — or empty>",
 "expected":"<the correct final answer, as short as possible>",
 "confidence":0-1}

"location" and "errorType" must NOT contain the correct answer or the corrected step — they will be shown to the person, who is practising. Use "unknown" with low confidence if the problem is not well-defined enough to check.`;

export function buildCheckInput(problem: string, attempt: string): string {
  return `PROBLEM (from the conversation):\n${problem.slice(0, 3000)}\n\nATTEMPT:\n${attempt.slice(0, 3000)}`;
}

export function sanitizeCheck(raw: unknown): CheckResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const verdict = ['correct', 'incorrect', 'partial', 'unknown'].includes(r.verdict as string) ? (r.verdict as CheckResult['verdict']) : 'unknown';
  const expected = typeof r.expected === 'string' ? r.expected.trim().slice(0, 200) : '';
  const scrub = (v: unknown) => {
    let t = typeof v === 'string' ? v.trim().slice(0, 240) : '';
    // A location that contains the expected answer is not safe to show.
    if (expected && expected.length >= 2 && t.toLowerCase().includes(expected.toLowerCase())) t = '';
    return t;
  };
  const confidence = typeof r.confidence === 'number' ? Math.max(0, Math.min(1, r.confidence)) : 0.5;
  return { verdict, location: scrub(r.location), errorType: scrub(r.errorType), expected, confidence, method: 'checker' };
}

/**
 * A calculation the person asked for, evaluated exactly (council D7:
 * CALCULATE only when the value was actually computed and is injected).
 */
export function computeAsked(text: string): { expr: string; value: string } | null {
  for (const raw of posedExpressions(text).map(cleanExpr).sort((a, b) => b.length - a.length)) {
    if (!/\d/.test(raw) || !/[-+*/^]|sqrt|sin|cos|tan|log|ln|exp/.test(raw)) continue;
    const c = compileExpr(raw, []);
    if (!c || c.vars.length) continue;
    const v = c.eval({});
    if (!Number.isFinite(v)) continue;
    return { expr: raw, value: Number.isInteger(v) ? String(v) : String(Math.round(v * 1e9) / 1e9) };
  }
  return null;
}

/** Below this the checker's verdict of "incorrect" is not claimed (council D13). */
export const CHECK_FLOOR = 0.85;

/** What the reply model is told — never the expected answer. */
export function renderCheck(c: CheckResult | null): string {
  if (!c || c.verdict === 'unknown' || (c.method === 'checker' && c.confidence < CHECK_FLOOR)) return '';
  const lines = ['\n=== Their attempt has been checked (privately) ==='];
  lines.push(`VERDICT: ${c.verdict}${c.method === 'exact' ? ' (computed exactly)' : ''}`);
  if (c.location) lines.push(`WHERE: ${c.location}`);
  if (c.errorType) lines.push(`KIND OF ERROR: ${c.errorType}`);
  lines.push('You were not given the correct answer on purpose. Do not work it out in the reply; guide them to it.');
  return lines.join('\n') + '\n';
}

/** Hidden values the guard must keep out of the reply: the expected answer and its common spellings. */
export function hiddenValues(c: CheckResult | null): string[] {
  if (!c?.expected) return [];
  const v = c.expected.trim();
  const out = new Set([v]);
  const n = Number(v.replace(/,/g, ''));
  if (Number.isFinite(n)) {
    out.add(String(n));
    if (Number.isInteger(n) && Math.abs(n) >= 1000) out.add(n.toLocaleString('en-US'));
  }
  return [...out].filter((x) => x.length >= 2 || /\d/.test(x));
}

/**
 * Arithmetic the person STATED, checked exactly: "A − B = C" lines in their
 * own message, money and k/M/B suffixes included. Run 6 (decision-015): a
 * vet asked to have her math checked, wrote "$410k − $163.9k = $256k" (it
 * is $246.1k), and neither Core 4 nor either baseline caught it — the exact
 * path above deliberately skips money and handles "problem, then answer",
 * not an equation someone wrote out. A slip is reported only when the
 * stated value misses by more than its own rounding.
 */
export interface StatedSlip { line: string; stated: string; actual: string }
const AMOUNT = String.raw`\$?\s*\d[\d,]*(?:\.\d+)?\s*(?:k|K|m|M|bn|B)?`;
const STATED = new RegExp(String.raw`(${AMOUNT})\s*([-−–+×x*/÷])\s*(${AMOUNT})(?:\s*([-−–+×x*/÷])\s*(${AMOUNT}))?\s*=\s*(${AMOUNT})`, 'g');
function amount(raw: string): { value: number; unit: number; money: boolean } | null {
  const m = raw.replace(/\s+/g, '').match(/^(\$?)([\d,]+(?:\.\d+)?)(k|K|m|M|bn|B)?$/);
  if (!m) return null;
  const unit = !m[3] ? 1 : /k/i.test(m[3]) ? 1e3 : /bn|B/.test(m[3]) ? 1e9 : 1e6;
  // "m" without a "$" could be metres: only a money amount scales by it.
  if (m[3] && /^m$/.test(m[3]) && !m[1]) return null;
  const n = Number(m[2].replace(/,/g, ''));
  return Number.isFinite(n) ? { value: n * unit, unit, money: !!m[1] } : null;
}
function apply(a: number, op: string, b: number): number {
  if (op === '+') return a + b;
  if (/[-−–]/.test(op)) return a - b;
  if (/[×x*]/.test(op)) return a * b;
  return a / b;
}
export function statedSlips(text: string): StatedSlip[] {
  const out: StatedSlip[] = [];
  for (const m of text.matchAll(STATED)) {
    const [line, a, op1, b, op2, c, eq] = m;
    const A = amount(a), B = amount(b), C = c ? amount(c) : null, E = amount(eq);
    if (!A || !B || !E || (c && !C)) continue;
    // Multiplying two money amounts is not arithmetic anyone states.
    let v = apply(A.value, op1, B.value);
    if (op2 && C) v = apply(v, op2, C.value);
    if (!Number.isFinite(v)) continue;
    const digits = (eq.match(/\.(\d+)/)?.[1].length ?? 0);
    const rounding = (E.unit * Math.pow(10, -digits)) / 2;
    const tol = Math.max(rounding * 1.01, Math.abs(v) * 0.002);
    if (Math.abs(v - E.value) <= tol) continue;
    const u = E.unit;
    const shown = u > 1 ? `${Math.round((v / u) * 10) / 10}${u === 1e3 ? 'k' : u === 1e6 ? 'M' : 'bn'}` : String(Math.round(v * 100) / 100);
    out.push({ line: line.trim(), stated: eq.trim(), actual: `${E.money ? '$' : ''}${shown}` });
  }
  return out;
}
