// What the expression compiler will accept from a model.
//
// This is the quietest failure Logos has. An expression that does not compile
// is not an error and not a gap — the curve is simply absent from the picture,
// and the diagram looks like it was drawn that way on purpose. So the bar is
// not "is this valid notation", it is "would a model plausibly write this",
// and every plausible string that fails is a line somebody asked for and did
// not get.
//
// The one that shipped: models emit U+2212 and en dashes for minus, because
// that is what a minus sign looks like in prose. "20 − 5*x" was rejected
// outright while "20 - 5*x" drew fine.

import { compileExpr, freeNames } from './.tmp/logos-math.mjs';
import { sanitizeViz } from './.tmp/logos-viz.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

const NAMES = ['x', 'a', 'b', 'c', 'f', 'k', 'm', 'p', 'r', 's', 't', 'v', 'w'];
const SCOPE = { x: 1, a: 0.5, b: 0.2, c: 0.1, f: 10, k: 2, m: 1, p: 3, r: 1, s: 1, t: 2, v: 4, w: 3 };
const val = (src, names = NAMES, scope = SCOPE) => {
  const fn = compileExpr(src, names);
  return fn ? fn.eval(scope) : null;
};
const draws = (src) => { const v = val(src); return v !== null && Number.isFinite(v); };
const near = (a, b, tol = 1e-9) => a !== null && Math.abs(a - b) < tol;

console.log('=== the real use cases compile and produce numbers ===');
{
  const real = [
    ['titration',     '7 + 3.2*tanh((x - 25)/3)'],
    ['maxwell',       '4*pi*(x^2)*exp(-x^2/(2*t))'],
    ['logistic',      'k/(1 + exp(-r*(x - 5)))'],
    ['michaelis',     'v*x/(m + x)'],
    ['damped',        'exp(-b*x)*cos(w*x)'],
    ['projectile',    'x*tan(a) - 9.81*x^2/(2*(v*cos(a))^2)'],
    ['cooling',       '20 + 60*exp(-k*x)'],
    ['retention',     '100*(1 - c)^x'],
    ['normal',        'exp(-(x-m)^2/(2*s^2))/(s*sqrt(2*pi))'],
    ['break-even',    'p*x - (f + v*x)'],
  ];
  for (const [name, src] of real) ok(`${name} draws`, draws(src), src);
}

console.log('\n=== a typographic minus is a minus ===');
{
  // U+2212, en dash, em dash, figure dash, non-breaking hyphen.
  for (const [name, dash] of [['minus sign', '−'], ['en dash', '–'], ['em dash', '—'], ['figure dash', '‐'], ['nb hyphen', '‑']]) {
    ok(`${name} works as subtraction`, near(val(`20 ${dash} 5*x`), 15), `20 ${dash} 5*x`);
    ok(`${name} works as a sign`, near(val(`${dash}x + 3`), 2));
  }
  ok('and a plain hyphen still does', near(val('20 - 5*x'), 15));
  // The one that was reported as a diagram with a missing line.
  ok('a whole expression in typographic minus', draws('7 + 3.2*tanh((x − 25)/3)'));
}

console.log('\n=== the other spellings of the same functions ===');
{
  ok('arcsin is asin', near(val('arcsin(x)', ['x'], { x: 1 }), Math.asin(1)));
  ok('arccos is acos', near(val('arccos(x)', ['x'], { x: 1 }), Math.acos(1)));
  ok('arctan is atan', near(val('arctan(x)', ['x'], { x: 1 }), Math.atan(1)));
  ok('sec is 1/cos', near(val('sec(x)', ['x'], { x: 0 }), 1));
  ok('csc is 1/sin', near(val('csc(x)', ['x'], { x: Math.PI / 2 }), 1));
  ok('cot is 1/tan', near(val('cot(x)', ['x'], { x: Math.PI / 4 }), 1, 1e-9));
  ok('log10 is log', near(val('log10(x)', ['x'], { x: 100 }), 2));
  ok('lg is log', near(val('lg(x)', ['x'], { x: 100 }), 2));
  ok('atanh works', near(val('atanh(x)', ['x'], { x: 0 }), 0));
  // A threshold, for anything that switches on.
  ok('step is 0 below', val('step(x)', ['x'], { x: -1 }) === 0);
  ok('step is 1 at and above', val('step(x)', ['x'], { x: 0 }) === 1);
  ok('heaviside is the same', val('heaviside(x)', ['x'], { x: 3 }) === 1);
  // And the originals still work.
  for (const f of ['sin', 'cos', 'tan', 'asin', 'atan', 'sinh', 'tanh', 'ln', 'log', 'log2', 'sqrt', 'cbrt', 'abs', 'exp', 'sign', 'floor', 'ceil', 'round']) {
    ok(`${f} still compiles`, compileExpr(`${f}(x)`, ['x']) !== null);
  }
}

console.log('\n=== notation people actually type ===');
{
  ok('x² is x^2', near(val('x²', ['x'], { x: 3 }), 9));
  ok('x³ too', near(val('x³', ['x'], { x: 2 }), 8));
  ok('and it composes', near(val('2*x² + 1', ['x'], { x: 3 }), 19));
  ok('|x| is abs', near(val('|x|', ['x'], { x: -4 }), 4));
  ok('two bars in one expression', near(val('|x| + |a|', ['x', 'a'], { x: -4, a: -1 }), 5));
  ok('** is ^', near(val('x**2', ['x'], { x: 5 }), 25));
  ok('a leading y= is stripped', near(val('y = 2*x + 1', ['x'], { x: 3 }), 7));
  ok('so is f(x)=', near(val('f(x) = x^2', ['x'], { x: 4 }), 16));
  ok('unicode times', near(val('2 × x', ['x'], { x: 3 }), 6));
  ok('unicode divide', near(val('6 ÷ x', ['x'], { x: 3 }), 2));
  ok('implicit multiplication', near(val('2x + 3', ['x'], { x: 4 }), 11));
  ok('implicit before a paren', near(val('2(x+1)', ['x'], { x: 4 }), 10));
  ok('scientific notation', near(val('1.6e-19*x', ['x'], { x: 1 }), 1.6e-19));
  ok('unary minus with a power', near(val('-x^2 + 3', ['x'], { x: 2 }), -1));
}

console.log('\n=== LaTeX, because a maths model writes LaTeX ===');
{
  // The extractor is asked for `tex` on every mathematical node, so LaTeX is
  // the notation it is already thinking in. `\\frac{x}{2}` used to lose its
  // backslash and arrive as `frac{x}{2}`, which is not an expression.
  ok('a fraction', near(val('\\frac{1}{x}', ['x'], { x: 4 }), 0.25));
  ok('a display fraction', near(val('\\dfrac{1}{x}', ['x'], { x: 4 }), 0.25));
  ok('a square root', near(val('\\sqrt{x}', ['x'], { x: 9 }), 3));
  ok('an nth root', near(val('\\sqrt[3]{x}', ['x'], { x: 8 }), 2));
  ok('a braced power', near(val('x^{2}', ['x'], { x: 5 }), 25));
  ok('e to a braced power', near(val('e^{x}', ['x'], { x: 1 }), Math.E, 1e-12));
  ok('cdot is multiplication', near(val('2\\cdot x', ['x'], { x: 3 }), 6));
  ok('left and right are dropped', near(val('\\left(x+1\\right)', ['x'], { x: 3 }), 4));
  ok('pi survives', near(val('\\pi', ['x'], { x: 0 }), Math.PI));

  // Nesting is the common case, not the exotic one: each pattern matches only
  // brace-free arguments, so one pass would leave this untouched.
  ok('a power inside a fraction', near(val('\\frac{x^{2}}{2}', ['x'], { x: 3 }), 4.5));
  ok('a fraction inside a root', near(val('\\sqrt{\\frac{x}{4}}', ['x'], { x: 16 }), 2));
  ok('a fraction of two powers', near(val('\\frac{x^{2}}{x^{1}}', ['x'], { x: 5 }), 5));

  // And nothing pathological may hang the normalizer.
  for (const src of ['\\frac{'.repeat(40), '{'.repeat(200), '\\sqrt{'.repeat(50) + 'x']) {
    const t0 = process.hrtime.bigint();
    compileExpr(src, ['x']);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    ok(`pathological input returns fast (${ms.toFixed(1)}ms)`, ms < 250);
  }
}

console.log('\n=== e and pi are numbers, and stay numbers ===');
{
  ok("e^x is Euler's", near(val('e^x', ['x'], { x: 1 }), Math.E));
  ok('pi is pi', near(val('sin(pi*x)', ['x'], { x: 0.5 }), 1));
  ok('tau too', near(val('tau', ['x'], { x: 0 }), Math.PI * 2));
  // freeNames must not offer a constant as a slider, or the editor invents
  // a control that redefines a number.
  ok('e is not a free name', !freeNames('e^x').includes('e'));
  ok('pi is not a free name', !freeNames('2*pi*r').includes('pi'));

  // And a scene may not declare one either: a slider called e shadows the
  // constant in every expression beside it, and the curve quietly becomes NaN.
  const sc = sanitizeViz({
    kind: 'function', expr: 'e^x', view: { xMin: -2, xMax: 2 },
    params: [{ id: 'e', min: 0, max: 5, step: 1, value: 2 }, { id: 'k', min: 0, max: 5, step: 1, value: 2 }],
  });
  ok('a slider named e is refused', !sc.params.some((q) => q.id === 'e'), JSON.stringify(sc.params));
  ok('but an ordinary one is kept', sc.params.some((q) => q.id === 'k'));
  for (const bad of ['pi', 'tau']) {
    const s2 = sanitizeViz({
      kind: 'function', expr: 'x', view: { xMin: -2, xMax: 2 },
      params: [{ id: bad, min: 0, max: 5, step: 1, value: 2 }],
    });
    ok(`a slider named ${bad} is refused`, !s2.params.some((q) => q.id === bad));
  }
}

console.log('\n=== still refused, and deliberately ===');
{
  // Nothing here is a silent gap: each needs a grammar feature the parser
  // does not have (comma arguments, postfix, ternary), and inventing one
  // quietly is worse than declining. Listed so the boundary is explicit.
  for (const [name, src] of [
    ['a ternary', 'x > 0 ? x : 0'],
    ['a factorial', 'x!'],
    ['an equality', 'x == 2'],
    ['an inequality', 'x < 2'],
  ]) {
    ok(`${name} is refused`, compileExpr(src, NAMES) === null, src);
  }
}

console.log('\n=== two arguments, because most real shapes are piecewise ===');
{
  // A payoff floored at zero, a budget line with a kink, a supply curve that
  // hits capacity, a tax bracket. The grammar has no conditional, so max and
  // min ARE the conditional.
  ok('max floors', near(val('max(0, x)', ['x'], { x: -5 }), 0));
  ok('and passes through', near(val('max(0, x)', ['x'], { x: 5 }), 5));
  ok('min caps', near(val('min(2*x, 6)', ['x'], { x: 9 }), 6));
  ok('and passes through', near(val('min(2*x, 6)', ['x'], { x: 1 }), 2));
  ok('they nest', near(val('min(max(0, x), 2)', ['x'], { x: 5 }), 2));
  ok('and compose with operators', near(val('3*max(0, x - 1) + 1', ['x'], { x: 4 }), 10));
  ok('a power of one', near(val('max(0, x)^2', ['x'], { x: 3 }), 9));
  ok('mod wraps', near(val('mod(x, 3)', ['x'], { x: 7 }), 1));
  ok('and is never negative', near(val('mod(x, 3)', ['x'], { x: -1 }), 2));
  ok('atan2 knows its quadrant', near(val('atan2(x, 1)', ['x'], { x: 1 }), Math.atan2(1, 1)));
  ok('a log to any base', near(val('logbase(2, 8)', ['x'], { x: 0 }), 3));
  ok('written the way people write it', near(val('log_2(8)', ['x'], { x: 0 }), 3));
  ok('and log_10 too', near(val('log_10(1000)', ['x'], { x: 0 }), 3));
  // Not sliders.
  ok('max is not a free name', !freeNames('max(0, x)').includes('max'));
  ok('min is not either', !freeNames('min(0, x)').includes('min'));

  // Malformed calls must never yield a confident number.
  for (const src of ['max(0, )', 'max(,x)', 'max(0 x)', ',x', 'max(0,x', 'x,', 'max()']) {
    const fn = compileExpr(src, NAMES);
    ok(`"${src}" yields no number`, fn === null || !Number.isFinite(fn.eval(SCOPE)), String(fn && fn.eval(SCOPE)));
  }
  // Genuinely meaningless input stays refused.
  for (const src of ['(((', '', '   ', 'constructor(x)', '__proto__', 'x)', '(x']) {
    ok(`"${src}" is refused`, compileExpr(src, NAMES) === null);
  }
  ok('an unknown name is still refused', compileExpr('zz9*x', ['x']) === null);

  // A dangling operator is not refused — the parser has no arity check — but
  // it evaluates to NaN, so the curve is not drawn. That is the same outcome
  // as refusing it, and the invariant worth holding is the one below: nothing
  // malformed may produce a confident WRONG number, which would be a line on
  // the diagram that means nothing.
  for (const src of ['x +', '*/x', 'x*', '2 + * 3']) {
    const fn = compileExpr(src, NAMES);
    ok(`"${src}" never yields a number`, fn === null || !Number.isFinite(fn.eval(SCOPE)), String(fn && fn.eval(SCOPE)));
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
