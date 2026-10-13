// lib/accuracy/accuracy.ts
//
// ONE TURN'S ACCURACY: WHAT IS COMPUTED BEFORE THE REPLY, WHAT IS CHECKED AFTER.
//
// THE FAILURE THIS EXISTS FOR. Asked for d/dx[csc(x)], a reply said
// csc(x)cot(x) — the sign gone — with full confidence. Challenged ("doesn't
// the quotient rule apply?"), it agreed with the challenge instead of
// re-deriving. Two separate faults with one root: nothing in the pipeline ever
// COMPUTED anything. The symbolic engine (lib/model/expr.ts) had the rule
// right all along — csc′ = −csc·cot — but only the graphs used it; the chat
// did calculus from memory, and when pushed, from mood.
//
// So both chat surfaces now do the same three things, all deterministic, none
// of them another model call:
//
//   planTurn    BEFORE generation. Computes what they asked (a derivative, an
//               integral's value, a limit, an equation's roots, whether an
//               identity holds), checks the claims in THEIR message, and — when
//               they push back — re-checks the claims in the PREVIOUS reply.
//               The results go to the reply model as a block it can stand on.
//               It also decides whether this turn is risky enough to be read
//               before it is sent (`check`): mathematics, or a challenge to
//               mathematics. Everything else streams as it always did.
//
//   checkDraft  AFTER generation, on a turn that was held. Every claim the
//               draft makes that the engine can read is checked; a wrong one
//               becomes a specific retry note (what, why, the right result)
//               for the ONE regeneration the pipeline already allows.
//
//   correction  THE LAST RESORT. If the regeneration is still wrong — or the
//               turn streamed and was only checked once it had been sent — a
//               correction is stated in plain words after the reply rather
//               than letting the error stand silently.
//
// WITHHOLD. When the answer is theirs to find (Core 4's withhold, the Logos
// Answer Guard), no computed result reaches the reply model and no retry note
// or correction states one: the checks still run, but they report THAT a line
// is wrong and what kind of slip it is, never the value.
//
// WHAT IT CANNOT DO is listed in docs/ACCURACY.md: it reads a closed grammar
// (no matrices, no proofs, no multivariable calculus), it does not integrate
// symbolically (an antiderivative is checked by differentiating it back), and
// non-mathematical claims are handled by the prompt rules and the citation
// checks, not by computation.
//
// PURE.

import { extract, type Claim, type Defs, type Posed } from './claims';
import { checkClaim, computePosed, describe, pretty, type Computed, type Equation, type Verdict } from './checker';
import { readPushback, type Pushback } from './pushback';
import { hasMath } from '@/lib/tex-split';

export interface Turn { role: 'user' | 'assistant'; content: string }

export interface AccuracyInput {
  /** their latest message */
  lastUserText: string;
  /** everything before it, oldest first */
  history: readonly Turn[];
  /** the answer to what they are working on is theirs to find */
  withhold: boolean;
}

/** What the draft check needs to know about the turn. */
export interface DraftContext {
  defs: Defs;
  /** the problem on the table */
  current: Posed | null;
  /** the equation on the table, for solution claims */
  equation: Equation | null;
  withhold: boolean;
  /** claims they made themselves that checked out: never a secret */
  theirsRight: Claim[];
  /** a deterministic check ran this turn, so "this was checked" is a true sentence */
  computed: boolean;
}

export interface AccuracyPlan {
  /** hold the reply and check it before it is sent */
  check: boolean;
  /** why, for the trace */
  reasons: string[];
  /** for the reply model; '' when there is nothing to say */
  block: string;
  context: DraftContext;
  pushback: Pushback | null;
  /** their claims, checked */
  theirs: Verdict[];
  /** the previous reply's claims, re-checked (on pushback only) */
  previous: Verdict[];
  /** what they asked, computed */
  computed: Computed[];
  /**
   * They pushed back, and the engine confirms the previous reply was wrong
   * (and nothing of theirs is): "you're right" is the honest first word, not
   * flattery, and the guard lets it stand.
   */
  theyCaughtIt: boolean;
}

// ── reading the conversation ───────────────────────────────────────────

/** A turn that is about mathematics, even before anything in it can be read as a claim. */
const MATH_TOPIC = /\b(?:derivatives?|differentiat\w*|anti-?derivatives?|integra(?:l|ls|te|tes|ting|tion)|chain rule|quotient rule|product rule|power rule|l['’]?h[oô]pital\w*|trig(?:onometr\w*)?|sine|cosine|tangent|secant|cosecant|cotangent|logarithm\w*|exponential|polynomials?|quadratic|equations?|simplif\w*|factori[sz]\w*|asymptot\w*|critical points?|inflection|concav\w*|calculus|algebra|limit of|limits? as|domain of|range of|unit conversion|convert\w* \d)\b/i;
// Notation that means mathematics, and not a date (2024-10-13), a range
// (3–5), a fraction-looking date (10/13), a model size (340M) or SQL
// (id = 5). Measured on the scenario corpus: the broader first version held a
// third of all turns for checking, most of them for nothing.
const MATH_NOTATION = /\\\(|\\\[|d\/d[a-zθ]|∫|√|\b(?:sin|cos|tan|sec|csc|cot|ln|log|sqrt|exp)\s*\(|\d\s*[+*^×÷]\s*\d|\b[a-z]\s*\^\s*\(?-?\d|\b[a-z]\s*=\s*-?\d|\b\d+\s*[a-z]\s*[+\-=^]/i;

const lastOf = (h: readonly Turn[], role: Turn['role']) => {
  for (let i = h.length - 1; i >= 0; i--) if (h[i].role === role) return h[i].content;
  return null;
};

function sameText(a: string, b: string): boolean {
  return a.replace(/\s+/g, '') === b.replace(/\s+/g, '');
}

/** Does a claim answer the problem on the table? */
export function answers(c: Claim, p: Posed | null): boolean {
  if (!p) return false;
  if (c.kind === 'derivative' && p.kind === 'derivative') return sameText(c.subject, p.subject) && c.wrt === p.wrt && c.order === p.order;
  if (c.kind === 'antiderivative' && p.kind === 'antiderivative') return sameText(c.integrand, p.integrand);
  if (c.kind === 'definite' && p.kind === 'definite') return sameText(c.integrand, p.integrand) && sameText(c.lower, p.lower) && sameText(c.upper, p.upper);
  if (c.kind === 'limit' && p.kind === 'limit') return sameText(c.subject, p.subject) && c.at === p.at;
  if (c.kind === 'solution' && p.kind === 'equation') return c.variable === p.variable;
  return false;
}

/** The problem a claim answers, as a posed problem: how "isn't it positive?" finds what "it" is. */
function asPosed(c: Claim): Posed | null {
  if (c.kind === 'derivative') return { kind: 'derivative', subject: c.subject, wrt: c.wrt, order: c.order, text: c.text };
  if (c.kind === 'antiderivative') return { kind: 'antiderivative', integrand: c.integrand, wrt: c.wrt, text: c.text };
  if (c.kind === 'definite') return { kind: 'definite', integrand: c.integrand, wrt: c.wrt, lower: c.lower, upper: c.upper, text: c.text };
  if (c.kind === 'limit') return { kind: 'limit', subject: c.subject, wrt: c.wrt, at: c.at, side: c.side, text: c.text };
  return null;
}

// ── saying it ──────────────────────────────────────────────────────────

const HOW: Record<Verdict['method'], string> = {
  symbolic: 'symbolic differentiation',
  differentiation: 'differentiating it gives back the integrand',
  quadrature: 'numerical integration',
  limit: 'approached numerically',
  evaluation: 'evaluated',
  substitution: 'substituted back',
  scan: 'numerical scan',
  units: 'converted through SI units',
  none: 'not checked',
};

/** What kind of slip, with no value in it: safe to show somebody working it out. */
export function kindOfSlip(v: Verdict): string {
  const w = v.why ?? '';
  if (/sign/.test(w)) return 'a sign error';
  if (/chain-rule|chain rule/.test(w)) return 'a missing chain-rule factor';
  if (/quotient rule/.test(w)) return "the quotient rule's numerator";
  if (/product rule/.test(w)) return 'the product rule';
  if (/derivative of \w+\(…\)/.test(w)) return 'the derivative of a different function';
  if (/factor/.test(w)) return 'a constant factor';
  if (/constant/.test(w)) return 'an extra constant';
  if (/misses/.test(w)) return 'a missing solution';
  if (/substitut|domain/.test(w)) return 'a value that does not satisfy the equation';
  if (/measure different things/.test(w)) return 'mismatched units';
  return 'a result that does not match the computed one';
}

/** Whether `computed` IS the correct answer to the claim (it is not, for an antiderivative). */
function correctable(v: Verdict): boolean {
  if (!v.computed) return false;
  return v.claim.kind === 'derivative' || v.claim.kind === 'definite' || v.claim.kind === 'limit' || v.claim.kind === 'arithmetic' || v.claim.kind === 'unit' || (v.claim.kind === 'solution' && v.method === 'scan');
}

/** The claim, restated with the computed result in place of the claimed one. */
function corrected(v: Verdict): string | null {
  const c = v.claim;
  const r = v.computed ? pretty(v.computed) : '';
  if (!correctable(v)) return null;
  switch (c.kind) {
    case 'derivative': return `${c.order === 2 ? `d²/d${c.wrt}²` : `d/d${c.wrt}`}[${pretty(c.subject)}] = ${r}`;
    case 'definite': return `∫ from ${pretty(c.lower)} to ${pretty(c.upper)} of ${pretty(c.integrand)} d${c.wrt} = ${r}`;
    case 'limit': return `the limit is ${r}`;
    case 'arithmetic': return `${pretty(c.left)} = ${r}`;
    case 'unit': return `${c.leftValue} ${c.leftUnit} = ${r}`;
    case 'solution': return `the real solutions are ${c.variable} = ${r}`;
    default: return null;
  }
}

function verdictLine(v: Verdict, reveal: boolean): string {
  const what = describe(v.claim);
  if (v.status === 'verified') return `- ${what} — correct (${HOW[v.method]})${v.caveat ? `; ${v.caveat}` : ''}`;
  if (v.status === 'consistent') return `- ${what} — no counterexample found (${v.caveat ?? 'a numerical scan, which is not a proof'})`;
  if (v.status === 'refuted') {
    const why = reveal ? v.why ?? 'it does not match the computed result' : kindOfSlip(v);
    const fix = reveal ? corrected(v) : null;
    return `- ${what} — WRONG: ${why}${fix ? `. Correct: ${fix}` : ''}${v.caveat && reveal ? ` (${v.caveat})` : ''}`;
  }
  return '';
}

function computedLines(cs: Computed[]): string[] {
  const out: string[] = [];
  for (const c of cs) {
    if (!c.result) continue;
    const p = c.posed;
    const head =
      p.kind === 'derivative' ? `${p.order === 2 ? `d²/d${p.wrt}²` : `d/d${p.wrt}`}[${pretty(p.subject)}] = ${pretty(c.result)}`
        : p.kind === 'definite' ? `∫ from ${pretty(p.lower)} to ${pretty(p.upper)} of ${pretty(p.integrand)} d${p.wrt} ≈ ${c.result}`
          : p.kind === 'limit' ? `lim ${p.wrt}→${p.at === Infinity ? '∞' : p.at === -Infinity ? '−∞' : p.at}${p.side > 0 ? '⁺' : p.side < 0 ? '⁻' : ''} of ${pretty(p.subject)} = ${c.result}`
            : p.kind === 'equation' ? `${pretty(p.left)} = ${pretty(p.right)}: ${c.result}`
              : p.kind === 'identity' ? `${pretty(p.left)} = ${pretty(p.right)} ${c.result}`
                : '';
    if (!head) continue;
    out.push(`- ${head}   (${c.how})`);
    for (const a of c.alternatives) out.push(`  · the same result by the ${a.method}: ${pretty(a.form)}`);
  }
  return out;
}

// ── before the reply ───────────────────────────────────────────────────

export function planTurn(input: AccuracyInput): AccuracyPlan {
  const reasons: string[] = [];
  const history = input.history.slice(-8);
  const lastUser = input.lastUserText ?? '';
  const previousReply = lastOf(history, 'assistant');

  // Definitions and problems from earlier turns: "f(x) = csc x" three messages ago.
  // A reply is read against the question before it, so its bare "It is
  // −csc(x)cot(x)" is a claim about the derivative that was asked for.
  let defs: Defs = {};
  let earlier: Posed | null = null;
  let prevEx: ReturnType<typeof extract> | null = null;
  for (let i = 0; i < history.length; i++) {
    const t = history[i];
    const isPrevious = t.role === 'assistant' && i === history.map((h) => h.role).lastIndexOf('assistant');
    const ex = extract(t.content.slice(0, isPrevious ? 12000 : 8000), { role: t.role === 'user' ? 'person' : 'reply', defs, current: t.role === 'assistant' ? earlier : null });
    defs = ex.defs;
    if (t.role === 'user' && ex.posed.length) earlier = ex.posed[ex.posed.length - 1];
    if (isPrevious) prevEx = ex;
  }
  // What "it" is in "isn't it positive?": the last problem posed, or what the previous reply answered.
  const fromPrevious = prevEx?.claims.map(asPosed).find(Boolean) ?? null;
  const theirsEx = extract(lastUser.slice(0, 8000), { role: 'person', defs: { ...defs, ...(prevEx?.defs ?? {}) }, current: earlier ?? fromPrevious });
  const posedNow = theirsEx.posed.slice(-3);
  const current = posedNow[posedNow.length - 1] ?? earlier ?? fromPrevious;
  const eqPosed = [...posedNow, ...(earlier ? [earlier] : [])].find((p): p is Extract<Posed, { kind: 'equation' }> => p.kind === 'equation');
  const equation: Equation | null = eqPosed ? { left: eqPosed.left, right: eqPosed.right, variable: eqPosed.variable } : null;

  const pushback = readPushback(lastUser, previousReply);
  const previous = pushback && prevEx ? prevEx.claims.slice(0, 12).map((c) => checkClaim(c, { equation })).filter((v) => v.status !== 'unchecked') : [];
  const theirs = theirsEx.claims.slice(0, 12).map((c) => checkClaim(c, { equation })).filter((v) => v.status !== 'unchecked');

  // What to compute: what they asked now — and, when they push back on a
  // derivative, that derivative again, with the other valid methods.
  const toCompute: Posed[] = [...posedNow];
  if (pushback && current && !toCompute.includes(current)) toCompute.push(current);
  if (pushback) {
    for (const v of previous) {
      const p = asPosed(v.claim);
      if (p && !toCompute.some((q) => JSON.stringify({ ...q, text: '' }) === JSON.stringify({ ...p, text: '' }))) toCompute.push(p);
    }
  }
  const computed = toCompute.slice(0, 4).map(computePosed);

  if (posedNow.length) reasons.push('posed');
  if (theirs.length) reasons.push('their_claims');
  if (pushback) reasons.push(`pushback:${pushback.kind}`);
  if (previous.some((v) => v.status === 'refuted')) reasons.push('previous_wrong');
  // Code is not mathematics to be checked: read the prose, and the LaTeX.
  const prose = lastUser.replace(/```[\s\S]*?```/g, ' ');
  const topical = MATH_TOPIC.test(prose) || MATH_NOTATION.test(prose) || hasMath(prose);
  if (topical) reasons.push('math');
  const check = posedNow.length > 0 || theirs.length > 0 || previous.length > 0 || topical;

  const reveal = !input.withhold;
  const blocks: string[] = [];

  const lines = computedLines(computed);
  if (lines.length) {
    blocks.push(reveal
      ? `=== Computed by Socria's math engine this turn (deterministic, not recalled) ===\n${lines.join('\n')}\nThese results are checked: state them as settled, without hedging. If your own working disagrees with a line here, the slip is in the working — find it rather than reporting both. You may say a result here was checked; do not claim any other tool, calculation or check was run.`
      : `=== The answer to what they are working on has been computed — and is deliberately not shown to you ===\nThey are working it out themselves. Do not state the result. Every mathematical statement in your reply is checked against the computed answer before it is sent, so say nothing about it you are not sure of.`);
  }

  if (theirs.length) {
    const tl = theirs.map((v) => verdictLine(v, reveal)).filter(Boolean);
    if (tl.length) {
      blocks.push(`=== What they wrote, checked by the math engine ===\n${tl.join('\n')}\n${reveal
        ? 'Tell them plainly which of their statements hold and which do not, and where a wrong one goes wrong.'
        : 'Tell them plainly whether it holds and what kind of slip it is — not the corrected value.'}`);
    }
  }

  if (pushback) blocks.push(pushbackBlock(pushback, previous, theirs, computed, reveal));

  const context: DraftContext = {
    defs: { ...defs, ...(prevEx?.defs ?? {}), ...theirsEx.defs },
    current,
    equation,
    withhold: input.withhold,
    theirsRight: theirs.filter((v) => v.status === 'verified').map((v) => v.claim),
    computed: computed.some((c) => !!c.result) || theirs.length > 0 || previous.length > 0,
  };
  const theyCaughtIt = !!pushback && previous.some((v) => v.status === 'refuted') && !theirs.some((v) => v.status === 'refuted');
  return { check, reasons, block: blocks.length ? `\n${blocks.join('\n\n')}\n` : '', context, pushback, theirs, previous, computed, theyCaughtIt };
}

function pushbackBlock(pb: Pushback, previous: Verdict[], theirs: Verdict[], computed: Computed[], reveal: boolean): string {
  const out = [`=== They are pushing back on your previous reply (${pb.kind === 'doubt' ? 'doubting it' : 'disputing it'}) ===`, `They wrote: "${pb.quote}"`];
  const prevLines = previous.map((v) => verdictLine(v, reveal)).filter(Boolean);
  if (prevLines.length) out.push(`Your previous reply, re-checked by the math engine just now:\n${prevLines.join('\n')}`);
  const prevWrong = previous.some((v) => v.status === 'refuted');
  const prevRight = previous.length > 0 && !prevWrong;
  const theirWrong = theirs.some((v) => v.status === 'refuted');
  const theirRight = theirs.some((v) => v.status === 'verified');

  if (pb.methods.length) {
    const alts = computed.flatMap((c) => c.alternatives.map((a) => ({ ...a, result: c.result })));
    const named = alts.filter((a) => pb.methods.some((m) => a.method.includes(m)));
    if (named.length) {
      out.push(`They mention the ${pb.methods.join(' and the ')}. ${named.map((a) => `The ${a.method.split(',')[0]} gives ${pretty(a.form)}, which is the same function as ${pretty(a.result ?? '')} (checked)`).join('; ')}. Valid methods agree — a different answer means a slip in applying one, not a second truth. Say that the method they name is valid here if it is, and show where it lands.`);
    } else {
      out.push(`They mention the ${pb.methods.join(' and the ')}. If it is a valid route here, say so: valid methods must agree, so a different result means a slip in applying one, not a second right answer.`);
    }
  }

  const how: string[] = ['How to answer: identify exactly what they are disputing, and decide it on the evidence — not on who said it last.'];
  if (prevWrong) {
    how.push(`Your previous reply was wrong where marked. Say so in your first sentence — what was wrong and ${reveal ? 'the corrected result' : 'what kind of slip it was (not the corrected value: they are working it out)'} — and fix anything that depended on it. One plain acknowledgement; no grovelling, no invented reason for the mistake, no claim that you meant something else.`);
    if (theirRight) how.push('Where they are right, say so directly.');
    if (theirWrong) how.push('Their own version is not right either — say that too, kindly, and where it slips.');
  } else if (prevRight && theirWrong) {
    how.push('Your previous answer was right and their alternative is not. Keep your answer. Show briefly, without condescension, where theirs goes wrong. Do not concede to make them feel right.');
  } else if (prevRight && theirRight) {
    how.push('Both their version and yours are right — they are equal. Say so and show why in a line.');
  } else if (prevRight) {
    how.push('Your previous answer checks out. Say so plainly and give the reason in a line or two. Do not back away from it because they asked, and do not pad it with hedges.');
  } else {
    how.push('Nothing in this could be checked by computation, so re-examine it on its merits. If you were wrong, say exactly what was wrong and correct it. If you were right, hold the position and give the reason or the evidence. If it genuinely depends on something — a definition, a convention, a date, a source — say what. If you cannot tell, say what would settle it. Do not agree because they insist, and do not insist because you said it first.');
  }
  out.push(how.join(' '));
  return out.join('\n');
}

// ── after the reply ────────────────────────────────────────────────────

export interface DraftCheck {
  verdicts: Verdict[];
  refuted: Verdict[];
  /** under withhold: the draft states the answer they are working out */
  leaked: Verdict[];
  /** for the one regeneration, or null when the draft passes */
  retryNote: string | null;
}

/** Every claim in a draft that the engine can read, checked. */
export function checkDraft(draft: string, ctx: DraftContext): DraftCheck {
  const ex = extract(draft ?? '', { role: 'reply', defs: ctx.defs, current: ctx.current });
  const verdicts = ex.claims.slice(0, 40).map((c) => checkClaim(c, { equation: ctx.equation }));
  const refuted = verdicts.filter((v) => v.status === 'refuted');
  const leaked = ctx.withhold
    ? verdicts.filter((v) => v.status === 'verified' && answers(v.claim, ctx.current) && !ctx.theirsRight.some((t) => answers(t, ctx.current) && t.kind === v.claim.kind))
    : [];
  const notes: string[] = [];
  if (refuted.length) {
    const reveal = !ctx.withhold;
    const lines = refuted.slice(0, 4).map((v) => {
      const fix = reveal ? corrected(v) : null;
      return `- ${describe(v.claim)} — ${reveal ? v.why ?? 'it does not match the computed result' : kindOfSlip(v)}${fix ? ` (correct: ${fix})` : ''}`;
    });
    notes.push(`Socria's math engine checked the mathematics in the draft and found ${refuted.length === 1 ? 'an error' : 'errors'}:\n${lines.join('\n')}\n${reveal
      ? 'Correct it, and anything that depends on it; keep everything else. State the corrected mathematics as settled — no hedging about it.'
      : 'Fix or remove it without stating the correct result: they are working it out themselves.'}`);
  }
  if (leaked.length) notes.push(`The draft states the answer they are working out (${describe(leaked[0].claim)}). Take it out and point them at the step instead.`);
  return { verdicts, refuted, leaked, retryNote: notes.length ? notes.join('\n') : null };
}

/**
 * A correction in plain words, for a reply that is still wrong after its one
 * regeneration, or that streamed before it could be checked. Empty when there
 * is nothing to correct.
 */
export function correctionFor(check: DraftCheck, withhold: boolean): string {
  const lines = check.refuted.slice(0, 3).map((v) => {
    if (withhold) return `One line above is wrong — ${kindOfSlip(v)}. Recheck it before relying on it.`;
    const fix = corrected(v);
    return fix
      ? `Correction: ${fix}, not ${claimedSide(v.claim)} as written above.`
      : `Correction: ${describe(v.claim)} does not hold — ${v.why ?? 'it does not check out'}.`;
  });
  return lines.join('\n');
}

function claimedSide(c: Claim): string {
  switch (c.kind) {
    case 'derivative': return pretty(c.claimed);
    case 'antiderivative': return pretty(c.claimed);
    case 'definite': return pretty(c.claimed);
    case 'limit': return c.claimed;
    case 'arithmetic': return pretty(c.right);
    case 'unit': return `${c.rightValue} ${c.rightUnit}`;
    case 'solution': return c.values.map(pretty).join(', ');
    default: return describe(c);
  }
}

/** The draft, with a correction appended when it still states something the engine refutes. */
export function repairDraft(draft: string, ctx: DraftContext): { text: string; corrected: boolean } {
  const check = checkDraft(draft, ctx);
  if (!check.refuted.length) return { text: draft, corrected: false };
  const note = correctionFor(check, ctx.withhold);
  return note ? { text: `${draft.trimEnd()}\n\n${note}`, corrected: true } : { text: draft, corrected: false };
}

/**
 * The person's own answer to the problem on the table, decided by computing
 * it — for Core 4's Verify Mode, which until now sent calculus to a cheaper
 * model to judge. `slip` and `expected` are kept apart because under a
 * withhold only the slip may be shown.
 */
export function attemptVerdict(plan: AccuracyPlan): { correct: boolean; slip: string; expected: string } | null {
  const v = plan.theirs.find((t) => (t.status === 'verified' || t.status === 'refuted') && answers(t.claim, plan.context.current));
  if (!v) return null;
  return {
    correct: v.status === 'verified',
    slip: v.status === 'refuted' ? kindOfSlip(v) : '',
    expected: v.status === 'refuted' && correctable(v) ? pretty(v.computed!) : '',
  };
}
