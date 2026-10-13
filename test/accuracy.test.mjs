// Accuracy: the deterministic math checker, pushback, and the per-turn plan.
//
// The failure behind all of this: asked for d/dx[csc(x)], a reply said
// csc(x)cot(x) — the sign gone — and when challenged about the quotient rule
// it agreed instead of re-deriving. Nothing in the pipeline computed anything.
// These suites hold the computing in place: every verdict here is reached by
// the symbolic engine or by evaluation, never by asking a model.
//
// Three kinds of assertion, deliberately:
//   - a wrong claim is REFUTED, with the right kind of slip named
//   - a right claim is VERIFIED (or, for scans, CONSISTENT) — never refuted
//   - prose that is not a claim produces NO claim at all
// The last two are the false-positive guard: a checker that "corrects" a
// right answer is worse than none.

import { toGrammar, latexToPlain, namesIn } from './.tmp/notation.mjs';
import { extract } from './.tmp/claims.mjs';
import { checkClaim, computePosed, describe, parseSet } from './.tmp/checker.mjs';
import { integrate, limitAt, show } from './.tmp/numeric-check.mjs';
import { readPushback } from './.tmp/pushback.mjs';
import { planTurn, checkDraft, correctionFor, repairDraft } from './.tmp/accuracy.mjs';
import { parse, derivativeOf } from './.tmp/expr.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

/** Every claim in a reply, checked. */
const verdicts = (text, opts = {}) => {
  const ex = extract(text, { role: 'reply', ...(opts.defs ? { defs: opts.defs } : {}) });
  return ex.claims.map((c) => checkClaim(c, opts.ctx ?? {}));
};
const statuses = (text, opts) => verdicts(text, opts).map((v) => v.status);
const one = (text, opts) => {
  const vs = verdicts(text, opts);
  return vs.length === 1 ? vs[0] : { status: `expected one claim, got ${vs.length}: ${vs.map((v) => describe(v.claim)).join(' | ')}` };
};

console.log('=== notation: the ways a reply writes the same thing ===');
{
  ok('plain', toGrammar('-csc(x)cot(x)') === '-csc(x)cot(x)', toGrammar('-csc(x)cot(x)'));
  ok('bare application: csc x cot x', toGrammar('csc x cot x') === 'csc(x) cot(x)', toGrammar('csc x cot x'));
  ok('unicode minus and dot', toGrammar('−csc(x)·cot(x)') === '-csc(x)*cot(x)', toGrammar('−csc(x)·cot(x)'));
  ok('function power: sin^2 x is (sin x)^2', toGrammar('sin^2 x') === '(sin(x))^(2)', toGrammar('sin^2 x'));
  ok('superscript power: sin²x', toGrammar('sin²x') === '(sin(x))^(2)', toGrammar('sin²x'));
  ok('inverse: sin^-1 x is arcsin', toGrammar('sin^(-1) x') === 'asin(x)', toGrammar('sin^(-1) x'));
  ok('csc^-1 has no name here and is unreadable, not guessed', toGrammar('csc^(-1) x') === null);
  ok('sin 2x is sin(2x)', toGrammar('sin 2x') === 'sin(2x)');
  ok('ln|x| is ln(abs(x))', toGrammar('ln|x|') === 'ln(abs(x))', toGrammar('ln|x|'));
  ok('"cost" is a variable, never cos(t)', toGrammar('cost') === 'cost');
  ok('sinx run together is sin(x)', toGrammar('sinx') === 'sin(x)');
  ok('percent is never read as a remainder', toGrammar('50%') === null);
  ok('degrees: sin 30° reads as radians of 30°', toGrammar('sin(30°)') === 'sin((30*pi/180))', toGrammar('sin(30°)'));
  ok('a temperature is not an angle', toGrammar('30°C') === null);
  ok('thousands separators', toGrammar('1,000,000') === '1000000');
  ok('a dangling operator is a fragment', toGrammar('x +') === null);
  const tex = latexToPlain('\\frac{d}{dx}\\left[\\csc(x)\\right] = -\\csc(x)\\cot(x)');
  ok('LaTeX derivative operator survives as d/dx', /d\/dx/.test(tex) && /- csc \(x\)/.test(tex.replace(/\s+/g, ' ')), tex);
  ok('LaTeX \\frac becomes a division', latexToPlain('\\frac{1}{\\sin x}').replace(/\s+/g, '') === '((1)/(sinx))', latexToPlain('\\frac{1}{\\sin x}'));
  ok('e is a constant, not a variable', namesIn('e^(x)').join() === 'x');
  ok('i is not a variable (imaginary unit)', !namesIn('2 + 3').length && toGrammar('e^(i*pi)') !== null);
}

console.log('=== the symbolic engine reads implicit products (root cause of unchecked claims) ===');
{
  ok('expr.parse reads 2x', !!parse('2x', ['x']));
  ok('expr.parse reads csc(x)cot(x)', !!parse('csc(x)cot(x)', ['x']));
  const d = derivativeOf('3x^2', 'x', ['x']);
  ok('derivativeOf("3x^2") is 6x', d.ok && /6 \* x/.test(d.expr), JSON.stringify(d));
}

console.log('=== all six trigonometric derivatives ===');
{
  const right = {
    sin: 'cos(x)', cos: '-sin(x)', tan: 'sec(x)^2', cot: '-csc(x)^2', sec: 'sec(x)tan(x)', csc: '-csc(x)cot(x)',
  };
  const signFlipped = {
    sin: '-cos(x)', cos: 'sin(x)', tan: '-sec(x)^2', cot: 'csc(x)^2', sec: '-sec(x)tan(x)', csc: 'csc(x)cot(x)',
  };
  for (const [fn, d] of Object.entries(right)) {
    ok(`d/dx ${fn}(x) = ${d} is verified`, one(`d/dx[${fn}(x)] = ${d}`).status === 'verified', JSON.stringify(one(`d/dx[${fn}(x)] = ${d}`)));
  }
  for (const [fn, d] of Object.entries(signFlipped)) {
    const v = one(`d/dx[${fn}(x)] = ${d}`);
    ok(`d/dx ${fn}(x) = ${d} is refuted as a sign error`, v.status === 'refuted' && /sign/.test(v.why ?? ''), JSON.stringify(v));
  }
  // The reported case, in the forms a reply actually writes it.
  const forms = [
    'Using the chain rule, $\\frac{d}{dx}[\\csc(x)] = \\csc(x)\\cot(x)$.',
    'd/dx[csc(x)] = csc(x)cot(x)',
    'The derivative of csc x is csc x cot x, by the chain rule.',
    'So $\\dfrac{d}{dx}\\csc x = \\csc x\\cot x$',
    'd/dx csc(x) = csc(x)·cot(x)',
  ];
  for (const f of forms) {
    const v = one(f);
    ok(`the csc(x) sign error is caught in: ${f}`, v.status === 'refuted' && /sign/.test(v.why ?? '') && /csc\(x\) \* cot\(x\)/.test(v.computed ?? ''), JSON.stringify(v));
  }
  const right2 = ['$\\frac{d}{dx}[\\csc(x)] = -\\csc(x)\\cot(x)$', 'The derivative of csc(x) is −csc(x)cot(x).', 'd/dx csc x = −csc x cot x'];
  for (const f of right2) ok(`the right csc(x) derivative is verified in: ${f}`, one(f).status === 'verified', JSON.stringify(one(f)));
  // Neighbouring function: the derivative of sec given for csc.
  const sib = one('d/dx csc x = sec x tan x');
  ok('sec x tan x for csc x is named as the derivative of sec', sib.status === 'refuted' && /derivative of sec/.test(sib.why ?? ''), JSON.stringify(sib));
  // Second derivatives.
  ok("d²/dx² sin x = −sin x verified", one('$\\frac{d^2}{dx^2} \\sin x = -\\sin x$').status === 'verified');
  ok("f''(x) = 6x for f(x) = x^3, defined earlier in the reply", statuses("Let f(x) = x^3. Then f''(x) = 6x.").join() === 'verified', statuses("Let f(x) = x^3. Then f''(x) = 6x.").join());
}

console.log('=== reciprocal identities ===');
{
  for (const [l, r] of [['csc x', '1/sin x'], ['sec x', '1/cos x'], ['cot x', 'cos x/sin x'], ['cot x', '1/tan x'], ['tan x', 'sin x/cos x']]) {
    ok(`${l} = ${r} holds`, one(`Recall that ${l} = ${r}.`).status === 'verified', JSON.stringify(one(`Recall that ${l} = ${r}.`)));
  }
  const v = one('Remember that csc x = 1/cos x.');
  ok('csc x = 1/cos x is refuted, saying csc is 1/sin', v.status === 'refuted' && /csc is 1\/sin/.test(v.why ?? ''), JSON.stringify(v));
  ok('sec x = 1/sin x is refuted', one('Note sec x = 1/sin x.').status === 'refuted');
  ok('Pythagorean identity, called an identity, holds', one('The identity $\\sin^2 x + \\cos^2 x = 1$ always holds.').status === 'verified');
  ok('1 + tan² = sec² holds', one('The identity $1 + \\tan^2 x = \\sec^2 x$ holds for all x.').status === 'verified');
  ok('a false identity is refuted with a counterexample', /at x = /.test(one('The identity sin(2x) = 2sin(x) holds for all x.').why ?? ''));
  ok('double angle holds', one('The identity sin(2x) = 2 sin x cos x holds for all x.').status === 'verified');
}

console.log('=== chain rule and quotient rule are the same derivative ===');
{
  const c = computePosed({ kind: 'derivative', subject: 'csc(x)', wrt: 'x', order: 1, text: '' });
  ok('the engine computes −csc·cot', /-\(csc\(x\) \* cot\(x\)\)/.test(c.result ?? ''), c.result);
  ok('the quotient-rule route is offered and checked equal', c.alternatives.some((a) => /quotient/.test(a.method)), JSON.stringify(c.alternatives));
  ok('the chain-rule route is offered and checked equal', c.alternatives.some((a) => /chain/.test(a.method)), JSON.stringify(c.alternatives));
  // A reply that does it both ways, every step checked.
  const steps = 'By the quotient rule, $$\\frac{d}{dx}\\left(\\frac{1}{\\sin x}\\right) = \\frac{0\\cdot\\sin x - 1\\cdot\\cos x}{\\sin^2 x} = -\\frac{\\cos x}{\\sin^2 x} = -\\csc x\\cot x$$';
  const st = statuses(steps);
  ok('every link of a quotient-rule derivation is verified', st.length >= 3 && st.every((s) => s === 'verified'), st.join());
  const chain = 'By the chain rule, $\\frac{d}{dx}(\\sin x)^{-1} = -(\\sin x)^{-2}\\cos x = -\\csc x \\cot x$.';
  const sc = statuses(chain);
  ok('a chain-rule derivation is verified', sc.length >= 2 && sc.every((s) => s === 'verified'), sc.join());
  // The quotient rule with its numerator added: named as exactly that.
  const q = one('d/dx (x/(x+1)) = (x + 1 + x)/(x+1)^2');
  ok('quotient rule with the terms added is named', q.status === 'refuted' && /quotient rule/.test(q.why ?? ''), JSON.stringify(q));
  const ch = one('d/dx sin(3x) = cos(3x)');
  ok('a dropped chain-rule factor is named', ch.status === 'refuted' && /chain-rule factor/.test(ch.why ?? ''), JSON.stringify(ch));
  const pr = one('d/dx [x sin x] = cos x');
  ok("the product rule as f'g' is named", pr.status === 'refuted' && /product rule/.test(pr.why ?? ''), JSON.stringify(pr));
}

console.log('=== sign errors beyond derivatives ===');
{
  const i1 = one('$\\int \\sin x\\,dx = \\cos x + C$');
  ok('∫ sin = cos + C is refuted as a sign error', i1.status === 'refuted' && /sign/.test(i1.why ?? ''), JSON.stringify(i1));
  ok('∫ sin = −cos + C is verified', one('$\\int \\sin x\\,dx = -\\cos x + C$').status === 'verified');
  const i3 = one('$\\int \\sin(3x)\\,dx = -\\cos(3x) + C$');
  ok('∫ sin 3x = −cos 3x + C: a constant factor is wrong', i3.status === 'refuted' && /3 times/.test(i3.why ?? ''), JSON.stringify(i3));
  ok('∫ sin 3x = −cos(3x)/3 + C is verified', one('$\\int \\sin(3x)\\,dx = -\\frac{1}{3}\\cos(3x) + C$').status === 'verified');
  ok('∫ sec² = tan + C is verified', one('∫ sec²x dx = tan x + C').status === 'verified');
  const ln = one('∫ 1/x dx = ln(x) + C');
  ok('∫ 1/x = ln x + C is verified with the ln|x| caveat', ln.status === 'verified' && /ln\|x\|/.test(ln.caveat ?? ''), JSON.stringify(ln));
}

console.log('=== fractional powers and negative inputs ===');
{
  ok("d/dx x^(2/3) = (2/3)x^(-1/3), including x < 0", one("For $f(x) = x^{2/3}$, $f'(x) = \\frac{2}{3}x^{-1/3}$.").status === 'verified');
  const wrongPow = one('d/dx x^(2/3) = (2/3)x^(1/3)');
  ok('a power that forgot to subtract one is refuted', wrongPow.status === 'refuted', JSON.stringify(wrongPow));
  const dom = one('The domain of $x^{2/3}$ is $x \\ge 0$.');
  ok('"x^(2/3) only for x ≥ 0" is refuted under real cube roots, and says so', dom.status === 'refuted' && /real roots/.test(dom.caveat ?? ''), JSON.stringify(dom));
  ok('the domain of √x is x ≥ 0 — consistent, and honest that a scan is not a proof', (() => { const v = one('The domain of sqrt(x) is x ≥ 0.'); return v.status === 'consistent' && /not a proof/.test(v.caveat ?? ''); })());
  ok('the domain of √(x − 2) is [2, ∞)', one('The domain of sqrt(x - 2) is [2, ∞).').status === 'consistent');
  ok('the domain of √(x − 2) is not (2, ∞): x = 2 is in it', one('The domain of sqrt(x - 2) is (2, ∞).').status === 'refuted');
  ok('the domain of ln x is not all reals', one('The domain of ln(x) is all real numbers.').status === 'refuted');
  ok('the domain of tan x is not all reals', one('The domain of tan(x) is all real numbers.').status === 'refuted');
  ok('∛(−8) = −2', one('$\\sqrt[3]{-8} = -2$').status === 'verified');
  ok('(−8)^(2/3) = 4', one('$(-8)^{2/3} = 4$').status === 'verified');
  ok('the range of sin x is not [0, 1]', one('The range of sin(x) is [0, 1].').status === 'refuted');
  ok('the range of x² is [0, ∞)', one('The range of x^2 is [0, ∞).').status === 'consistent');
}

console.log('=== numbers, integrals, limits, units ===');
{
  ok('17 × 23 = 391', one('17 × 23 = 391').status === 'verified');
  const a = one('2^10 = 1000');
  ok('2^10 = 1000 is refuted with the right value', a.status === 'refuted' && a.computed === '1024', JSON.stringify(a));
  ok('√2 ≈ 1.414 within its rounding', one('√2 ≈ 1.414').status === 'verified');
  ok('π ≈ 3.24 is refuted', one('π ≈ 3.24').status === 'refuted');
  ok('π ≈ 3.1415 (truncated) stands', one('π ≈ 3.1415').status === 'verified');
  ok('2^10 ≈ 1000 stands as an approximation', one('2^10 ≈ 1000').status === 'verified');
  ok('1/3 = 0.33 within its stated rounding', one('1/3 = 0.33').status === 'verified');
  ok('sin 30° = 1/2', one('sin 30° = 1/2').status === 'verified');
  ok('∫₀¹ x² dx = 1/3', one('$\\int_0^1 x^2\\,dx = \\frac{1}{3}$').status === 'verified');
  const d = one('$\\int_0^{\\pi} \\sin x\\,dx = 1$');
  ok('∫₀^π sin = 1 is refuted: it is 2', d.status === 'refuted' && d.computed === '2', JSON.stringify(d));
  ok('quadrature handles an endpoint singularity: ∫₀¹ 1/√x = 2', Math.abs(integrate((x) => 1 / Math.sqrt(x), 0, 1) - 2) < 1e-6);
  ok('lim sin x / x = 1', one('$\\lim_{x \\to 0} \\frac{\\sin x}{x} = 1$').status === 'verified');
  ok('lim (1 + 1/x)^x = e at ∞', one('$\\lim_{x \\to \\infty} (1 + 1/x)^x = e$').status === 'verified');
  ok('lim 1/x at 0⁺ is ∞', one('$\\lim_{x \\to 0^+} \\frac{1}{x} = \\infty$').status === 'verified');
  ok('lim |x|/x at 0 is not 1: the sides differ', one('$\\lim_{x \\to 0} \\frac{|x|}{x} = 1$').status === 'refuted');
  ok('a limit that does not settle is unchecked, never guessed', limitAt((x) => Math.sin(1 / x), 0)?.kind !== 'finite');
  ok('1 mile ≈ 1.609 km', one('1 mile is about 1.609 km.').status === 'verified');
  ok('60 mph ≈ 26.8 m/s', one('60 mph ≈ 26.8 m/s').status === 'verified');
  ok('1 km = 100 m is refuted', one('1 km = 100 m').status === 'refuted');
  ok('1 J = 1 N/m is refuted: different dimensions', /different things/.test(one('1 J = 1 N/m').why ?? ''));
  ok('temperatures are not converted (affine), so never "refuted"', verdicts('100 °F = 37.8 °C').every((v) => v.status !== 'refuted'));
}

console.log('=== definite integrals in words ===');
{
  const asked = planTurn({ lastUserText: 'What is the integral of x^2 from 0 to 3?', history: [], withhold: false });
  ok('"the integral of x^2 from 0 to 3" is a definite integral, computed', /∫ from 0 to 3 of x\^2 dx ≈ 9/.test(asked.block), asked.block);
  ok('…and a reply of "It is 9" is right, not an antiderivative of 9', checkDraft('It is $9$.', asked.context).refuted.length === 0);
  ok('…while "It is 27" is refuted', checkDraft('It is $27$.', asked.context).refuted.length === 1);
  ok('"the integral of x^2 from 0 to 3 is 9" in a reply is verified', one('The integral of x^2 from 0 to 3 is 9.').status === 'verified');
  const d = planTurn({ lastUserText: 'What is the derivative of x^2 at x = 3?', history: [], withhold: false });
  ok('a number answering a derivative question is a value, never "the derivative function"', checkDraft('It is 6.', d.context).refuted.length === 0);
}

console.log('=== solutions ===');
{
  const eq = { equation: { left: 'x^2 - 5x + 6', right: '0', variable: 'x' } };
  ok('the solutions are x = 2 and x = 3', one('So the solutions are x = 2 and x = 3.', { ctx: eq }).status === 'verified');
  const w = one('Therefore x = 2 or x = 4.', { ctx: eq });
  ok('x = 4 does not satisfy it, and the check says what it gives', w.status === 'refuted' && /substituting x = 4/.test(w.why ?? ''), JSON.stringify(w));
  const m = one('The only solution is x = 2.', { ctx: eq });
  ok('"the only solution is x = 2" misses x = 3', m.status === 'refuted' && /misses x = 3/.test(m.why ?? ''), JSON.stringify(m));
  ok('"if x = 0 …" is not a solution', verdicts('If x = 0, the left side is 6.', { ctx: eq }).length === 0);
  ok('"x = 1 is extraneous" is not a solution', verdicts('Checking, x = 1 is extraneous, so we reject it.', { ctx: eq }).length === 0);
  ok('x = (5 ± 1)/2 is both roots', one('So x = (5 ± 1)/2, which gives the two roots.', { ctx: eq }).status === 'verified');
}

console.log('=== not claims: prose and equations that must be left alone ===');
{
  const quiet = [
    'I think you should take the internship. A startup is riskier, and I could be wrong.',
    'The derivative of x^2 is a linear function.',
    'Set f\'(x) = 0 to find the critical points.',
    'Solve x^2 - 4 = 0 by factoring.',
    'A = πr^2 and E = mc^2 are formulas, not identities.',
    'y = mx + b is the equation of a line.',
    'The rate limit is 10 requests per minute, and the meeting runs 2-3 hours.',
    'Earlier I wrote d/dx csc(x) = csc(x)cot(x) — that was wrong.',
    'A common mistake is to write d/dx csc x = csc x cot x.',
    "Euler's identity says $e^{i\\pi} + 1 = 0$.",
    'In 1984, Orwell\'s Party insists that "2 + 2 = 5".',
    'We spent $5 + $3 = $8 on coffee.',
    'If x = 3, then 2x = 6.',
    'Let u = x^2, so du = 2x dx.',
    'Version 2.0 shipped in the 1990s.',
  ];
  for (const q of quiet) {
    const r = verdicts(q).filter((v) => v.status === 'refuted');
    ok(`no refutation in: ${q}`, r.length === 0, r.map((v) => describe(v.claim)).join(' | '));
  }
}

console.log('=== pushback: disputes and doubts, and what is not one ===');
{
  const prev = 'The derivative of csc(x) is −csc(x)cot(x).';
  ok("\"isn't it positive?\" disputes", readPushback("Isn't it positive?", prev)?.kind === 'dispute');
  ok('"are you sure?" doubts', readPushback('Are you sure?', prev)?.kind === 'doubt');
  ok('"my textbook says …" disputes', readPushback('My textbook says csc x cot x', prev)?.kind === 'dispute');
  ok('"you forgot the negative sign" disputes', readPushback('You forgot the negative sign', prev)?.kind === 'dispute');
  const m = readPushback("Wait, doesn't the quotient rule apply here? I think it's csc(x)cot(x).", prev);
  ok('the quotient rule is read as the method they invoke', m?.methods.includes('quotient rule'), JSON.stringify(m));
  ok('"why is it negative?" is a question, not a dispute', readPushback('Why is it negative?', prev) === null);
  ok('no previous reply, no pushback', readPushback('Are you sure?', null) === null);
  ok("\"isn't that interesting\" is small talk, not a dispute", readPushback("Isn't that interesting!", prev) === null);
  ok("the original challenge: \"doesn't the quotient rule apply here?\"", readPushback("Doesn't the quotient rule apply here?", prev)?.kind === 'dispute');
  // Real messages from the scenario corpus that are NOT pushback.
  const notPushback = [
    "Reading it… it's fine, but it isn't me. Nobody who knows me would believe I wrote that. I'm going to write it myself — just be the person I check it with.",
    "I think it was the right call. I just thought I'd feel something.",
    "OK, I see it: S(k) < 2 says nothing about how close to 2 it is, so the next term could push it over.",
    "Ok. So when my professor said last week that regressing inflation on the policy rate gives you a 'biased' coefficient, is that the same idea?",
    "Curious about one thing: Heizkörper or Heizung? My teacher says 'die Heizung ist kaputt' for everything.",
    "Those are white tins, so 2,000 a month is about 77 a day. I think the answer is no unless they take 3,000 and pay GBP 2.95.",
    "Tail is flat to slightly negative. I think that's a capacity thing, the student is 340M and the tail needs more parameters to memorise.",
    "There's a mistake in my code somewhere and I can't find it.",
    "Actually, it's fine — I figured it out.",
  ];
  for (const m of notPushback) ok(`not pushback: ${m.slice(0, 60)}…`, readPushback(m, prev) === null, JSON.stringify(readPushback(m, prev)));
  ok('"my textbook says csc x cot x" — a source set against the reply — is', readPushback('My textbook says csc x cot x.', prev)?.kind === 'dispute');
  ok('"but my teacher said it was different" is', readPushback('But my teacher said it was different.', prev)?.kind === 'dispute');
}

console.log('=== the turn plan: an incorrect correction is resisted ===');
{
  const history = [
    { role: 'user', content: 'What is the derivative of csc(x)?' },
    { role: 'assistant', content: 'It is $-\\csc(x)\\cot(x)$ — the derivative of csc is negative.' },
  ];
  const p = planTurn({ lastUserText: "Isn't it csc(x)cot(x)? I used the quotient rule.", history, withhold: false });
  ok('it is a pushback turn, checked before sending', !!p.pushback && p.check, JSON.stringify(p.reasons));
  ok('the previous reply re-checks as correct', p.previous.length > 0 && p.previous.every((v) => v.status === 'verified'), JSON.stringify(p.previous.map((v) => v.status)));
  ok('their alternative is refuted as a sign error', p.theirs.some((v) => v.status === 'refuted' && /sign/.test(v.why ?? '')), JSON.stringify(p.theirs.map((v) => v.why)));
  ok('the block tells the reply to keep the right answer and not concede', /Keep your answer/.test(p.block) && /Do not concede/.test(p.block), p.block);
  ok('the quotient rule is shown to land on the same function', /quotient rule gives/.test(p.block) && /same function/.test(p.block), p.block);
}

console.log('=== the turn plan: a correct correction is accepted ===');
{
  const history = [
    { role: 'user', content: 'What is the derivative of csc(x)?' },
    { role: 'assistant', content: 'Using the chain rule, $\\frac{d}{dx}[\\csc(x)] = \\csc(x)\\cot(x)$.' },
  ];
  const p = planTurn({ lastUserText: "You forgot the negative sign — isn't it −csc(x)cot(x)?", history, withhold: false });
  ok('the previous reply re-checks as wrong', p.previous.some((v) => v.status === 'refuted'), JSON.stringify(p.previous.map((v) => v.status)));
  ok('their correction checks as right', p.theirs.some((v) => v.status === 'verified'), JSON.stringify(p.theirs.map((v) => v.status)));
  ok('the block says to own the mistake in the first sentence, with the corrected result', /first sentence/.test(p.block) && /Correct: d\/dx\[csc\(x\)\] = -\(csc\(x\)·cot\(x\)\)/.test(p.block), p.block);
  ok('…and to say they are right', /they are right/.test(p.block));
  ok('…without inventing a reason', /no invented reason/.test(p.block));
}

console.log('=== the turn plan: what is asked is computed, and withheld when it must be ===');
{
  const open = planTurn({ lastUserText: 'What is the derivative of csc(x)?', history: [], withhold: false });
  ok('a derivative question is computed before the reply', /d\/dx\[csc\(x\)\] = -\(csc\(x\)·cot\(x\)\)/.test(open.block) && open.check, open.block);
  ok('…with the method alternatives', /quotient rule/.test(open.block));
  const held = planTurn({ lastUserText: "I'm practising — what's the derivative of csc(x)? Don't tell me.", history: [], withhold: true });
  ok('under withhold the computed answer never reaches the reply model', !/csc\(x\)·cot/.test(held.block) && /deliberately not shown/.test(held.block), held.block);
  const solve = planTurn({ lastUserText: 'Solve x^2 - 5x + 6 = 0', history: [], withhold: false });
  ok('an equation is solved numerically, saying where it searched', /x = 2, x = 3/.test(solve.block) && /−1000…1000/.test(solve.block), solve.block);
  const idq = planTurn({ lastUserText: 'Is csc(x) = 1/cos(x)?', history: [], withhold: false });
  ok('an identity question is settled with a counterexample', /does not hold/.test(idq.block), idq.block);
  const plain = planTurn({ lastUserText: 'Should I take the job in Denver or stay here?', history: [], withhold: false });
  ok('an ordinary question is not held, and gets no block', !plain.check && plain.block === '', JSON.stringify(plain));
  const ambiguous = planTurn({ lastUserText: "What's the derivative?", history: [], withhold: false });
  ok('an ambiguous question computes nothing it was not given', !/Computed by/.test(ambiguous.block));
}

console.log('=== the turn plan: a dispute nothing can compute ===');
{
  const history = [
    { role: 'user', content: 'What is the capital of Australia?' },
    { role: 'assistant', content: 'Canberra.' },
  ];
  const p = planTurn({ lastUserText: "No, it's Sydney.", history, withhold: false });
  ok('a factual dispute is still a pushback turn', p.pushback?.kind === 'dispute');
  ok('…told to re-examine on the merits, neither caving nor digging in', /on its merits/.test(p.block) && /Do not agree because they insist/.test(p.block) && /do not insist because you said it first/.test(p.block), p.block);
  ok('…and to say what would settle it when it cannot tell', /what would settle it/.test(p.block));
  ok('…and nothing is claimed as computed', !/Computed by/.test(p.block) && !/re-checked by the math engine/.test(p.block));
}

console.log('=== the draft check: before anyone sees it ===');
{
  const plan = planTurn({ lastUserText: 'What is the derivative of csc(x)?', history: [], withhold: false });
  const bad = checkDraft('Using the chain rule, $\\frac{d}{dx}[\\csc(x)] = \\csc(x)\\cot(x)$.', plan.context);
  ok('a wrong draft gets a retry note naming the error and the right result', !!bad.retryNote && /sign/.test(bad.retryNote) && /correct: d\/dx\[csc\(x\)\] = -\(csc\(x\)·cot\(x\)\)/.test(bad.retryNote), bad.retryNote);
  const good = checkDraft('It is $-\\csc(x)\\cot(x)$: $\\frac{d}{dx}\\csc x = -\\csc x\\cot x$.', plan.context);
  ok('a right draft passes untouched', good.retryNote === null && good.refuted.length === 0, JSON.stringify(good));
  const fixed = repairDraft('The derivative of csc x is csc x cot x.', plan.context);
  ok('the last resort appends a plain correction', fixed.corrected && /Correction: d\/dx\[csc\(x\)\] = -\(csc\(x\)·cot\(x\)\), not csc\(x\) cot\(x\)/.test(fixed.text), fixed.text);
  const owning = checkDraft('Earlier I wrote csc(x)cot(x) — that was wrong. The derivative of csc(x) is −csc(x)cot(x).', plan.context);
  ok('a draft that owns up to the old mistake is not "corrected" for quoting it', owning.refuted.length === 0, JSON.stringify(owning.refuted.map((v) => describe(v.claim))));
  // Conflicting statements within one draft: the wrong one is the one flagged.
  const conflict = checkDraft('d/dx csc x = −csc x cot x. So d/dx csc x = csc x cot x as well.', plan.context);
  ok('two conflicting statements: exactly the wrong one is flagged', conflict.refuted.length === 1 && conflict.verdicts.some((v) => v.status === 'verified'), JSON.stringify(conflict.verdicts.map((v) => v.status)));

  const held = planTurn({ lastUserText: "Find the derivative of csc(x) — I want to do it myself, just check my steps.", history: [], withhold: true });
  const leak = checkDraft('The answer is $-\\csc(x)\\cot(x)$.', held.context);
  ok('under withhold a draft that states the answer is sent back', leak.leaked.length === 1 && /Take it out/.test(leak.retryNote ?? ''), JSON.stringify(leak));
  const wrongHeld = checkDraft('Remember that d/dx csc x = csc x cot x.', held.context);
  ok('under withhold a wrong hint is caught without giving the value away', !!wrongHeld.retryNote && !/-\(csc/.test(wrongHeld.retryNote) && /sign error/.test(wrongHeld.retryNote), wrongHeld.retryNote);
  ok('…and its correction states only the kind of slip', !/csc\(x\)·cot/.test(correctionFor(wrongHeld, true)) && /sign error/.test(correctionFor(wrongHeld, true)), correctionFor(wrongHeld, true));
}

console.log('=== sets ===');
{
  const s = parseSet('all real numbers except 0');
  ok('"all real numbers except 0"', s && s.has(1) && !s.has(0));
  const u = parseSet('(-∞, 0) ∪ (0, ∞)');
  ok('a union of intervals', u && u.has(-1) && u.has(2) && !u.has(0));
  const w = parseSet('all real numbers greater than or equal to 2');
  ok('word forms: "greater than or equal to 2"', w && w.has(2) && !w.has(1.9));
  ok('an unreadable set is null, never a guess', parseSet('the set of all nice numbers') === null);
  ok('show prints sample points as decimals', show(0.53) === '0.53' && show(1 / 3) === '1/3');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
