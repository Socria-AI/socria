// DIFFERENTIATION, CHECKED AGAINST DERIVATIVES WORKED OUT BY HAND.
//
// The `CALCULUS` solver's `checkedAgainst` field names this file, and a
// `checkedAgainst` that names a file which does not test the thing is the same
// class of claim as a fidelity label nobody earned.
//
// WHY A TREE AT ALL. `compileExpr` turns an expression into a CLOSURE: you can
// evaluate it and list the names it mentions, and that is all. There is nothing
// to differentiate, which is why `rearrange` has been a `FUTURE` solver returning
// the string "a symbolic backend" since the registry was written — and why a
// quadratic term could be fitted and its marginal effect could not be reported,
// although a nonconstant marginal effect is the entire reason the quadratic is
// there.
//
// EVERY DERIVATIVE BELOW IS CHECKED TWO WAYS: symbolically against the form a
// person would write, and NUMERICALLY against a central difference of the
// original expression. The second check is the one that cannot be fooled by a
// plausible-looking rule.

import { derivativeOf, parse, print, simplify, namesOf, rename, substitute } from './.tmp/expr.mjs';
import { compileExpr } from './.tmp/logos-math.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const near = (a, b, eps = 1e-6) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < eps;

const N = ['a', 'b', 'c', 'd', 'k', 'x', 'y', 'z', 'p', 'q', 'b0', 'b1', 'b2', 'b3'];

/**
 * The claim this file exists to check: the symbolic derivative agrees with a
 * central difference of the original, at several points, to the accuracy a
 * central difference has.
 */
function agreesNumerically(expr, wrt, at, scope = {}) {
  const got = derivativeOf(expr, wrt, N);
  if (!got.ok) return { ok: false, why: got.why };
  const f = compileExpr(expr, N);
  const d = compileExpr(got.expr, N);
  if (!f || !d) return { ok: false, why: `“${got.expr}” did not compile back` };
  const h = 1e-5;
  const worst = at.reduce((w, v) => {
    const up = f.eval({ ...scope, [wrt]: v + h });
    const dn = f.eval({ ...scope, [wrt]: v - h });
    const fd = (up - dn) / (2 * h);
    const sym = d.eval({ ...scope, [wrt]: v });
    const err = Math.abs(fd - sym) / Math.max(1, Math.abs(fd));
    return err > w.err ? { err, v, fd, sym } : w;
  }, { err: 0 });
  return { ok: worst.err < 1e-5, worst, expr: got.expr };
}

console.log('\n=== the rules, symbolically ===');
{
  const cases = [
    ['x^2', 'x', '2 * x'],
    ['x^3', 'x', '3 * x^2'],
    ['k * x', 'x', 'k'],
    ['b0 + b1 * x', 'x', 'b1'],
    ['b0 + b1 * x + b2 * x^2', 'x', 'b1 + b2 * 2 * x'],
    ['ln(x)', 'x', '1 / x'],
    ['exp(x)', 'x', 'exp(x)'],
    ['sin(x)', 'x', 'cos(x)'],
    ['cos(x)', 'x', '-sin(x)'],
    ['sqrt(x)', 'x', '1 / (2 * sqrt(x))'],
    ['1 / x', 'x', '-1 / x^2'],
    ['100 - 2 * p', 'p', '-2'],
    ['a', 'x', '0'],
  ];
  for (const [e, w, want] of cases) {
    const got = derivativeOf(e, w, N);
    ok(`d/d${w} ${e} = ${want}`, got.ok && got.expr === want, got.ok ? got.expr : got.why);
  }
  // A quantity the expression does not mention has a derivative of exactly zero,
  // and that is an ANSWER — it is how "does this depend on x at all?" is asked.
  const none = derivativeOf('b0 + b1 * y', 'x', N);
  ok('a variable it does not mention gives exactly 0', none.ok && none.expr === '0', JSON.stringify(none));
}

console.log('\n=== the rules, against a central difference ===');
{
  const cases = [
    ['x^2', 'x', [0.5, 1, 2, 5], {}],
    ['x^3 - 2 * x', 'x', [-2, -0.5, 1, 3], {}],
    ['ln(x)', 'x', [0.5, 1, 4, 9], {}],
    ['exp(0 - x)', 'x', [0, 1, 2], {}],
    ['sqrt(x)', 'x', [1, 4, 9], {}],
    ['sin(k * x)', 'x', [0.1, 1, 2], { k: 3 }],
    ['x / (1 + x)', 'x', [0.5, 2, 7], {}],
    ['ln(1 + x^2)', 'x', [0.3, 1, 4], {}],
    ['exp(x) / x', 'x', [0.5, 1, 3], {}],
    ['tanh(x)', 'x', [-1, 0, 1], {}],
    ['atan(x)', 'x', [-2, 0, 2], {}],
    // The two shapes the econometrics digest makes central: a quadratic, whose
    // marginal effect is not constant, and an interaction, whose marginal effect
    // depends on the other variable.
    ['b0 + b1 * x + b2 * x^2', 'x', [0, 5, 20, 40], { b0: 5, b1: 1.2, b2: -0.03 }],
    ['b0 + b1 * x + b2 * y + b3 * x * y', 'x', [0, 2, 8], { b0: 1, b1: 2, b2: 3, b3: 0.5, y: 4 }],
    ['b0 + b1 * x + b2 * y + b3 * x * y', 'y', [0, 2, 8], { b0: 1, b1: 2, b2: 3, b3: 0.5, x: 4 }],
    // A log-log specification, whose slope is an elasticity.
    ['b0 + b1 * ln(x)', 'x', [1, 3, 10], { b0: 0, b1: 0.4 }],
  ];
  for (const [e, w, at, scope] of cases) {
    const got = agreesNumerically(e, w, at, scope);
    ok(`d/d${w} ${e} agrees with a finite difference`, got.ok,
      got.ok === false ? JSON.stringify(got.worst ?? got.why) : '');
  }
}

console.log('\n=== the marginal effect the brief asked for, exactly ===');
{
  // wage_hat = 5 + 2.5·educ + 1.2·exper − 0.03·exper²  ⇒  ∂/∂exper = 1.2 − 0.06·exper
  const got = derivativeOf('b0 + b1 * y + b2 * x + b3 * x^2', 'x', N);
  ok('the derivative is the symbolic form', got.ok && got.expr === 'b2 + b3 * 2 * x', got.expr);
  const d = compileExpr(got.expr, N);
  const scope = { b0: 5, b1: 2.5, b2: 1.2, b3: -0.03 };
  for (const v of [0, 5, 10, 20, 40]) {
    ok(`  at exper = ${v} it is ${1.2 - 0.06 * v}`, near(d.eval({ ...scope, x: v }), 1.2 - 0.06 * v, 1e-12),
      String(d.eval({ ...scope, x: v })));
  }
  // The turning point — where the marginal effect crosses zero — is 1.2/0.06 = 20.
  ok('  and it crosses zero at exper = 20', near(d.eval({ ...scope, x: 20 }), 0, 1e-12));
}

console.log('\n=== what it refuses, by name ===');
{
  const refusals = [
    ['floor(x)', 'x', /floor/],
    ['ceil(x)', 'x', /ceil/],
    ['round(x)', 'x', /round/],
    ['sign(x)', 'x', /sign/],
    ['step(x - 3)', 'x', /step/],
    ['max(x, 0)', 'x', /max/],
    ['min(x, 1)', 'x', /min/],
    ['x % 3', 'x', /remainder/],
    ['atan2(x, y)', 'x', /atan2/],
  ];
  for (const [e, w, pattern] of refusals) {
    const got = derivativeOf(e, w, N);
    ok(`${e} is refused`, !got.ok, got.ok ? got.expr : '');
    ok(`  and names why`, !got.ok && pattern.test(got.why), got.ok ? '' : got.why);
  }
  // A refusal must not be a zero. `floor` is flat almost everywhere, so 0 would
  // be true almost everywhere and wrong exactly where the model is interesting.
  ok('a refusal is never a zero', !derivativeOf('floor(x)', 'x', N).ok);
  // An unknown name is a hard failure, exactly as in the evaluator.
  ok('an unknown name does not parse', derivativeOf('ghost * x', 'x', N).ok === false);
}

console.log('\n=== the tree, printed and re-read ===');
{
  const round = (e) => {
    const t = parse(e, N);
    if (!t) return null;
    const printed = print(t);
    const again = parse(printed, N);
    return again ? print(again) : null;
  };
  for (const e of [
    'a + b * c', 'a - (b - c)', 'a / (b * c)', '(a + b)^2', '-x^2', '2^-1',
    'ln(1 + x^2)', 'a * b + c * d', 'x / y / z', 'max(x, min(y, z))', 'a - b - c',
  ]) {
    const r = round(e);
    ok(`“${e}” survives a print and a re-read`, r !== null && r === round(r ?? ''), `${r}`);
  }
  // The parentheses have to MEAN something: a - (b - c) is not a - b - c.
  const f1 = compileExpr(print(parse('a - (b - c)', N)), N);
  const f2 = compileExpr(print(parse('a - b - c', N)), N);
  const at = { a: 10, b: 3, c: 2 };
  ok('a - (b - c) is 9', near(f1.eval(at), 9));
  ok('a - b - c is 5', near(f2.eval(at), 5));
  const p1 = compileExpr(print(parse('x / y / z', N)), N);
  ok('x / y / z is left-associative', near(p1.eval({ x: 8, y: 2, z: 2 }), 2));
  const e1 = compileExpr(print(parse('2^3^2', N)), N);
  ok('2^3^2 is right-associative, so 512', near(e1.eval({}), 512), String(e1.eval({})));
  ok('-x^2 is -(x^2)', near(compileExpr(print(parse('-x^2', N)), N).eval({ x: 3 }), -9));
}

console.log('\n=== renaming and substituting are tree operations ===');
{
  // The string trap: `exper` is a substring of `experience`, and `x` is inside
  // `exp`. A regex that gets one model right gets the next one wrong.
  const t = parse('exp(x) + x', ['x']);
  const r = print(rename(t, { x: 'y' }));
  ok('renaming a leaf does not touch a function name', r === 'exp(y) + y', r);
  const t2 = parse('a + b', ['a', 'b']);
  ok('renaming only what is asked for', print(rename(t2, { a: 'c' })) === 'c + b');
  // Substitution composes: a term name becomes the expression it stands for.
  const spec = parse('b0 + b2 * sq', ['b0', 'b2', 'sq']);
  const sq = parse('x^2', ['x']);
  const done = print(substitute(spec, { sq }));
  ok('a term name substitutes to its expression', done === 'b0 + b2 * x^2', done);
  // …and only then does differentiating give the right answer. Without the
  // substitution the derivative with respect to x is 0, which is true of the
  // text and false of the model.
  const bad = derivativeOf('b0 + b2 * sq', 'x', ['b0', 'b2', 'sq', 'x']);
  ok('differentiating before substituting gives 0', bad.ok && bad.expr === '0');
  const good = derivativeOf(done, 'x', N);
  ok('and after substituting gives the real slope', good.ok && good.expr === 'b2 * 2 * x', good.expr);
  ok('namesOf lists every name once', JSON.stringify(namesOf(parse('a + b * a', ['a', 'b']))) === '["a","b"]');
}

console.log('\n=== simplification is legible and does not change the value ===');
{
  const raw = 'b0 * 1 + 0 + b1 * x^1 + 0 * b2';
  const t = simplify(parse(raw, N));
  ok('identities are folded away', print(t) === 'b0 + b1 * x', print(t));
  const before = compileExpr(raw, N);
  const after = compileExpr(print(t), N);
  for (const v of [-3, 0, 2.5, 11]) {
    const at = { b0: 2, b1: 3, b2: 5, x: v };
    ok(`  and the value is unchanged at x = ${v}`, near(before.eval(at), after.eval(at), 1e-12));
  }
  ok('constants are folded', print(simplify(parse('2 * 3 + 4', N))) === '10', print(simplify(parse('2 * 3 + 4', N))));
  ok('a coefficient moves in front', print(simplify(parse('x * 2', N))) === '2 * x');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
