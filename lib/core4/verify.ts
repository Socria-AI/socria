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

/**
 * The exact path: if the problem contains an arithmetic expression the
 * evaluator can compute, and the attempt states a number, compare them.
 */
export function exactCheck(problem: string, attempt: string): CheckResult | null {
  const candidates = (problem.match(EXPR) ?? [])
    .map(cleanExpr)
    .filter((e) => /\d/.test(e) && /[-+*/^]|sqrt|sin|cos|tan|log|ln|exp/.test(e))
    .sort((a, b) => b.length - a.length);
  for (const expr of candidates) {
    const c = compileExpr(expr, []);
    if (!c || c.vars.length) continue;
    const value = c.eval({});
    if (!Number.isFinite(value)) continue;
    const given = numbersIn(attempt);
    if (!given.length) return null;
    const tol = Math.max(1e-6, Math.abs(value) * 1e-4);
    const right = given.some((g) => Math.abs(g - value) <= tol);
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

/** Below this the checker's verdict is not claimed. */
export const CHECK_FLOOR = 0.7;

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
