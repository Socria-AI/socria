// Fractional powers, negative inputs, discontinuities and singularities —
// from the arithmetic up to what Socria is told about the drawn curve.
//
// The bug: y = x^(2/3) was drawn only for x ≥ 0. Every power went through
// Math.pow, which has no real answer for a negative base and a fractional
// exponent, so the left half of x^(2/3), x^(1/3), x^(−1/3) and ∛x evaluated to
// NaN and was never drawn. The model engine then printed 2/3 as 0.666666666667,
// which is no longer a fraction at all. Each layer is checked here against the
// real-valued convention: x^(p/q) in lowest terms is the real q-th root raised
// to the p — real for negative x when q is odd, absent when it is even.

import { fractionOf, realPow, realPowInto, powerDomain, POWER_CONVENTION, POWER_CONVENTION_LINES } from './.tmp/real-power.mjs';
import { compileFunction, compileExpr, compileVectorExpr, taylorCoeffs, samplePlot, findBreak, powersIn, hasFractionalPowers } from './.tmp/logos-math.mjs';
import { parse, print, simplify, derivativeOf } from './.tmp/expr.mjs';
import { sampleAdaptive, sceneBlock, sanitizeViz } from './.tmp/logos-viz.mjs';
import { curveCoverage, entitiesFromFrame } from './.tmp/viz-semantics.mjs';
import { sanitizeModelState, vizModelBlock } from './.tmp/viz-model.mjs';
import { FUNCTION, extremes, slopeAt } from './.tmp/function.mjs';
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const near = (a, b, tol = 1e-9) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const fr = (v) => JSON.stringify(fractionOf(v));

console.log('=== the fraction behind a float ===');
{
  ok('2/3 is two thirds', fr(2 / 3) === '{"p":2,"q":3}');
  ok('−1/3, and the −1/3 a derivative computes (2/3 − 1)', fr(-1 / 3) === '{"p":-1,"q":3}' && fr(2 / 3 - 1) === '{"p":-1,"q":3}');
  ok('lowest terms: 4/6 is 2/3, 2/4 is 1/2', fr(4 / 6) === '{"p":2,"q":3}' && fr(2 / 4) === '{"p":1,"q":2}');
  ok('a typed decimal is the fraction it spells: 0.2 = 1/5, 0.25 = 1/4, 0.7 = 7/10', fr(0.2) === '{"p":1,"q":5}' && fr(0.25) === '{"p":1,"q":4}' && fr(0.7) === '{"p":7,"q":10}');
  ok('even through float noise: 0.1 + 0.2 is 3/10', fr(0.1 + 0.2) === '{"p":3,"q":10}');
  ok('1/7 and 5/3 too', fr(1 / 7) === '{"p":1,"q":7}' && fr(5 / 3) === '{"p":5,"q":3}');
  ok('an integer is itself over one', fr(3) === '{"p":3,"q":1}' && fr(-2) === '{"p":-2,"q":1}');
  ok('π, √2 and the golden ratio are no fraction', fractionOf(Math.PI) === null && fractionOf(Math.SQRT2) === null && fractionOf((1 + Math.sqrt(5)) / 2) === null);
  ok('nor is a fraction finer than ten thousand', fractionOf(1 / 100003) === null);
  ok('nor NaN or infinity', fractionOf(NaN) === null && fractionOf(Infinity) === null);
}

console.log('=== powers of negative numbers ===');
{
  ok('(−8)^(1/3) = −2', near(realPow(-8, 1 / 3), -2));
  ok('(−8)^(2/3) = 4', near(realPow(-8, 2 / 3), 4));
  ok('(−8)^(−1/3) = −1/2', near(realPow(-8, -1 / 3), -0.5));
  ok('(−8)^(−2/3) = 1/4', near(realPow(-8, -2 / 3), 0.25));
  ok('(−8)^(5/3) = −32', near(realPow(-8, 5 / 3), -32));
  ok('(−32)^(1/5) = −2, and so is (−32)^0.2', near(realPow(-32, 1 / 5), -2) && near(realPow(-32, 0.2), -2));
  ok('(−27)^(4/6) = 9 — lowest terms first', near(realPow(-27, 4 / 6), 9));
  ok('an even root of a negative number is not real: (−4)^(1/2), (−16)^(3/4), (−1)^(2/4)', Number.isNaN(realPow(-4, 0.5)) && Number.isNaN(realPow(-16, 0.75)) && Number.isNaN(realPow(-1, 2 / 4)));
  ok('nor is a power that is no fraction: (−2)^π', Number.isNaN(realPow(-2, Math.PI)));
  ok('integers and non-negative bases are exactly Math.pow', realPow(-2, 3) === -8 && realPow(-2, -2) === 0.25 && realPow(2, 0.5) === Math.SQRT2 && realPow(0, 2 / 3) === 0);
  ok('at 0 a negative power is a pole', realPow(0, -1 / 3) === Infinity && realPow(0, -2 / 3) === Infinity);
  let sym = true, odd = true, cbrt = true;
  for (const [p, q] of [[2, 3], [4, 5], [2, 7], [-2, 3], [4, 3]]) for (const x of [0.3, 1, 2.5, 7, 100]) if (!near(realPow(-x, p / q), realPow(x, p / q), 1e-12)) sym = false;
  for (const [p, q] of [[1, 3], [5, 3], [3, 5], [-1, 3], [7, 9]]) for (const x of [0.3, 1, 2.5, 7, 100]) if (!near(realPow(-x, p / q), -realPow(x, p / q), 1e-12)) odd = false;
  for (let x = -50; x <= 50; x += 0.37) if (!near(realPow(x, 1 / 3), Math.cbrt(x), 1e-12)) cbrt = false;
  ok('an even numerator over an odd denominator gives an even function', sym);
  ok('an odd numerator over an odd denominator gives an odd function', odd);
  ok('x^(1/3) agrees with the cube root everywhere', cbrt);
  const xs = Float64Array.from([-8, -1, 0, 1, 8]);
  const out = new Float64Array(5);
  realPowInto(xs, 2 / 3, out);
  ok('a whole column at once gives the same answers', [...out].every((v, i) => near(v, realPow(xs[i], 2 / 3), 1e-12) || (Number.isNaN(v) && Number.isNaN(realPow(xs[i], 2 / 3)))));
  ok('where a power is real: x^(2/3) everywhere, x^(1/2) for x ≥ 0', powerDomain(2 / 3) === 'all' && powerDomain(0.5) === 'nonnegative' && powerDomain(3) === 'all' && powerDomain(Math.PI) === 'nonnegative');
}

console.log('=== every evaluator ===');
{
  const f = compileFunction('y = x^(2/3)');
  ok('y = x^(2/3) compiles', !!f);
  ok('…and is symmetric, with its cusp at 0: f(±1) = 1, f(±8) = 4, f(0) = 0', near(f.eval(-1), 1) && near(f.eval(1), 1) && near(f.eval(-8), 4) && near(f.eval(8), 4) && f.eval(0) === 0);
  const at = (src, x, names = ['x']) => compileExpr(src, names)?.eval({ x });
  ok('the LaTeX forms: x^{2/3}, \\frac exponents, \\sqrt[3]{x}', near(at('x^{2/3}', -8), 4) && near(at('x^{\\frac{2}{3}}', -8), 4) && near(at('\\sqrt[3]{x}', -8), -2));
  ok('cbrt, a negative exponent, and a power of a power', near(at('cbrt(x)', -27), -3) && near(at('x^(-1/3)', -8), -0.5) && near(at('(x^2)^(1/3)', -8), 4));
  ok('an even root stays undefined to the left: x^(1/2), x^(3/2), sqrt(x)', Number.isNaN(at('x^(1/2)', -4)) && Number.isNaN(at('x^(3/2)', -1)) && Number.isNaN(at('sqrt(x)', -1)));
  ok('a decimal exponent is the fraction it spells: x^0.6 is 3/5, so (−32)^0.6 = (−2)³ = −8; x^0.5 is 1/2', near(at('x^0.6', -32), -8) && near(at('x^0.6', 32), 8) && Number.isNaN(at('x^0.5', -4)));
  const px = compileExpr('x^(p/q)', ['x', 'p', 'q']);
  ok('an exponent built from sliders is read the same way', near(px.eval({ x: -8, p: 2, q: 3 }), 4) && Number.isNaN(px.eval({ x: -8, p: 1, q: 2 })));
  let same = true;
  for (const src of ['x^(2/3)', 'x^(1/3) + 1', '2*x^(-1/3)', 'x^(3/2)', 'x^(2/3) - x^(1/5)']) {
    const v = compileVectorExpr(src, ['x']);
    const s = compileExpr(src, ['x']);
    const xs = Float64Array.from({ length: 41 }, (_, i) => -10 + i * 0.5);
    const out = new Float64Array(xs.length);
    v.evalInto({ x: xs }, out);
    xs.forEach((x, i) => {
      const a = out[i], b = s.eval({ x });
      if (!(Number.isNaN(a) && Number.isNaN(b)) && !near(a, b, 1e-12) && !(a === b)) same = false;
    });
  }
  ok('the column evaluator agrees with the scalar one, negative x included', same);
  const t = taylorCoeffs('x^(2/3)', 'x', {}, -8, 3);
  ok('the Taylor series of x^(2/3) about −8: 4, −1/3, −1/144', !!t && near(t[0], 4) && near(t[1], -1 / 3) && near(t[2], -1 / 144));
  const c = taylorCoeffs('cbrt(x)', 'x', {}, -8, 2);
  ok('…and of ∛x about −8: −2, 1/12', !!c && near(c[0], -2) && near(c[1], 1 / 12));
  ok('no series at a cusp, or for an even root of a negative number', taylorCoeffs('x^(2/3)', 'x', {}, 0, 3) === null && taylorCoeffs('x^(1/2)', 'x', {}, -4, 3) === null);
}

console.log('=== the model engine keeps the fraction ===');
{
  const names = ['x'];
  ok('x^(2/3) prints as itself, not as x^0.666666666667', print(simplify(parse('x^(2/3)', names))) === 'x^(2/3)', print(simplify(parse('x^(2/3)', names))));
  const d = derivativeOf('x^(2/3)', 'x', names);
  ok('its derivative prints as (2/3) * x^(-1/3)', d.ok && d.expr === '(2/3) * x^(-1/3)', d.expr);
  const df = compileExpr(d.expr, names);
  ok('…and is real on both sides: −1/3 at x = −8, 1/3 at x = 8, a vertical cusp at 0', near(df.eval({ x: -8 }), -1 / 3) && near(df.eval({ x: 8 }), 1 / 3) && !Number.isFinite(df.eval({ x: 0 })));
  let agrees = true;
  for (const src of ['x^(2/3)', 'x^(1/3)', 'x^(5/3)', '3*x^(-1/3)']) {
    const g = derivativeOf(src, 'x', names);
    const dg = compileExpr(g.expr, names);
    const fn = compileExpr(src, names);
    for (const x of [-5, -2.5, -0.7, 0.7, 2.5, 5]) {
      const h = 1e-6;
      const fd = (fn.eval({ x: x + h }) - fn.eval({ x: x - h })) / (2 * h);
      if (!near(dg.eval({ x }), fd, 1e-5)) agrees = false;
    }
  }
  ok('every printed derivative matches a numerical one, negative x included', agrees);
  ok('a constant power of a negative number folds: (−8)^(2/3) → 4', print(simplify(parse('(-8)^(2/3)', names))) === '4');
  ok('a short decimal still prints short: 0.1 + 0.2 → 0.3', print(simplify(parse('0.1 + 0.2', names))) === '0.3');
  ok('a third prints as a third', print(simplify(parse('1/3 * x', names))).startsWith('(1/3)'));
}

console.log('=== sampling a picture: cusps, poles, jumps, gaps ===');
{
  const view = (xMin, xMax, yMin, yMax) => ({ xMin, xMax, yMin, yMax });
  const run = (src, v) => {
    const fn = compileExpr(src, ['x']);
    return sampleAdaptive((x) => fn.eval({ x }), v.xMin, v.xMax, 320, v);
  };
  // a pen-lift: a NaN the sampler put there (with its kind), or a sample that is itself infinite
  const breaks = (pts, kind) => pts.filter((p) => !Number.isFinite(p.y) && (!kind || p.brk === kind || (kind === 'pole' && Math.abs(p.y) === Infinity)));
  // a stroke across a pole: two neighbouring drawn points, far apart and on opposite sides of zero
  const joinsAcross = (pts, height) => pts.some((p, i) => i > 0 && Number.isFinite(p.y) && Number.isFinite(pts[i - 1].y) && Math.sign(p.y) !== Math.sign(pts[i - 1].y) && Math.abs(p.y - pts[i - 1].y) > height);
  // a riser: two neighbouring drawn points a jump apart
  const riser = (pts, height) => pts.some((p, i) => i > 0 && Number.isFinite(p.y) && Number.isFinite(pts[i - 1].y) && Math.abs(p.y - pts[i - 1].y) > height);

  const cusp = run('x^(2/3)', view(-3.1, 2.9, -0.3, 2.4));
  ok('x^(2/3) is drawn on both sides of 0', cusp.some((p) => p.x < -1 && Number.isFinite(p.y)) && cusp.some((p) => p.x > 1 && Number.isFinite(p.y)));
  ok('…unbroken', breaks(cusp).length === 0);
  ok('…and its cusp is drawn as a point, not cut off flat, in a window that does not centre it', Math.min(...cusp.filter((p) => Number.isFinite(p.y)).map((p) => p.y)) < 0.005, String(Math.min(...cusp.filter((p) => Number.isFinite(p.y)).map((p) => p.y))));

  const tangent = run('x^(1/3)', view(-2, 2, -1.5, 1.5));
  ok('∛x runs through its vertical tangent at 0 without a break', breaks(tangent).length === 0 && tangent.some((p) => p.x < 0 && p.y < -1) && tangent.some((p) => p.x > 0 && p.y > 1));
  const steep = run('atan(1000*x)', view(-1, 1, -2, 2));
  ok('a steep continuous curve is not broken', breaks(steep).length === 0);
  const fine = run('x^(1/9)', view(-0.01, 0.01, -0.7, 0.7));
  ok('nor is x^(1/9) in a tiny window, steep as it is', breaks(fine).length === 0);

  const recip = run('1/x', view(-5, 5, -10, 10));
  ok('1/x breaks at 0, as a pole', breaks(recip, 'pole').some((p) => Math.abs(p.x) < 1e-3));
  ok('…and nothing joins its two branches', !joinsAcross(recip, 20));
  const tan = run('tan(x)', view(-5, 5, -10, 10));
  const tanPoles = breaks(tan, 'pole').map((p) => p.x);
  ok('tan x breaks at each of ±π/2 and ±3π/2', [-3 * Math.PI / 2, -Math.PI / 2, Math.PI / 2, 3 * Math.PI / 2].every((c) => tanPoles.some((x) => Math.abs(x - c) < 1e-6)), JSON.stringify(tanPoles));
  ok('…with no vertical strokes', !joinsAcross(tan, 20));
  const negCube = run('x^(-1/3)', view(-3, 3, -4, 4));
  ok('x^(−1/3) has its pole at 0 and both branches', negCube.some((p) => p.x < -1 && p.y < 0) && negCube.some((p) => p.x > 1 && p.y > 0) && !joinsAcross(negCube, 8));

  const steps = run('floor(x)', view(-3.5, 3.5, -4, 4));
  const jumpsAt = breaks(steps, 'jump').map((p) => p.x);
  ok('floor x jumps at every integer in the window', [-3, -2, -1, 0, 1, 2, 3].every((k) => jumpsAt.some((x) => Math.abs(x - k) < 1e-6)), JSON.stringify(jumpsAt));
  ok('…drawn as treads, never risers', !riser(steps, 0.5));
  const sgn = run('sign(x)', view(-2, 2, -2, 2));
  ok('sign x jumps at 0', breaks(sgn, 'jump').some((p) => Math.abs(p.x) < 1e-6));

  const gap = run('sqrt(x^2 - 1)', view(-3, 3, -1, 3));
  ok('√(x²−1) has nothing between −1 and 1, and nothing is drawn there', !gap.some((p) => Math.abs(p.x) < 0.99 && Number.isFinite(p.y)));
  const sinc = run('sin(x)/x', view(-10, 10, -0.5, 1.2));
  ok('sin(x)/x is drawn through, with at most a hole at 0', breaks(sinc).filter((p) => Math.abs(p.x) > 1e-3).length === 0);

  const busy = run('sin(50*x)', view(-10, 10, -1.5, 1.5));
  ok('a fast oscillation stays within the sampling budget', busy.length < 3200 + 64 * 3 + 400, String(busy.length));

  // the small map plot, through samplePlot
  const sp = samplePlot(compileFunction('y = x^(2/3)'));
  ok('the map\'s plot of x^(2/3) draws its left half too', sp.samples.filter((s) => s.x < 0 && Number.isFinite(s.y)).length > 100);
  const spf = samplePlot(compileFunction('y = floor(x)'));
  ok('…and lifts the pen at floor\'s jumps', spf.samples.filter((s) => Number.isNaN(s.y) && s.brk === 'jump').length >= 15);
  const spr = samplePlot(compileFunction('y = 1/(x - 0.3)'));
  ok('…and at a pole between two samples', spr.samples.some((s) => Number.isNaN(s.y) && Math.abs(s.x - 0.3) < 1e-6));
  const flat = findBreak((x) => x * x, { x: 0, y: 0 }, { x: 1, y: 1 }, 0.1);
  ok('a smooth curve has no break', flat === null);
}

console.log('=== what Socria is told ===');
{
  const pts = (src, lo, hi) => {
    const fn = compileExpr(src, ['x']);
    return sampleAdaptive((x) => fn.eval({ x }), lo, hi, 320, { xMin: lo, xMax: hi, yMin: -10, yMax: 10 });
  };
  const said = (src) => curveCoverage(pts(src, -10, 10));
  ok('x^(2/3): drawn unbroken across the whole window', said('x^(2/3)') === 'drawn unbroken across the whole window', said('x^(2/3)'));
  ok('…not "only from x ≈ 0", which is what the old evaluator would have produced', !/only from/.test(said('x^(2/3)')));
  ok('√x: only from 0 rightward', /^drawn only from x ≈ 0 rightward/.test(said('sqrt(x)')), said('sqrt(x)'));
  ok('1/x: runs off to infinity at 0', /runs off to infinity at x ≈ 0/.test(said('1/x')), said('1/x'));
  ok('floor x: its jumps, listed', /jumps at x ≈ −9, −8, −7 and \d+ more/.test(said('floor(x)')), said('floor(x)'));
  ok('√(x²−1): no real value between −1 and 1', /no real value for x from −1 to 1/.test(said('sqrt(x^2 - 1)')), said('sqrt(x^2 - 1)'));
  ok('every one fits the 120 characters a picture\'s state allows', ['x^(2/3)', 'sqrt(x)', '1/x', 'floor(x)', 'tan(x)', 'sqrt(x^2 - 1)'].every((s) => (said(s) ?? '').length <= 120));

  ok('fractional powers are noticed: x^(2/3), x^(1/2), sqrt(x), cbrt(x), x^n', ['x^(2/3)', 'x^(1/2)', 'sqrt(x)', 'cbrt(x)', 'x^n'].every((e) => hasFractionalPowers([e])));
  ok('…and nothing is said for x^2 + 1, 2^x or sin(x)', !hasFractionalPowers(['x^2 + 1', '2^x', 'sin(x)']));
  const p = powersIn('x^(2/3) + x^(1/2)', ['x']);
  ok('an odd root and an even root, told apart', p.oddRoot && p.evenRoot && !p.irrational);

  const scene = sanitizeViz({ kind: 'function', overlays: [{ id: 'c1', expr: 'x^(2/3)' }], view: { xMin: -6, xMax: 6 } });
  ok('a picture of x^(2/3) carries the convention into the prompt', !!scene && sceneBlock(scene).includes(POWER_CONVENTION));
  const plain = sanitizeViz({ kind: 'function', overlays: [{ id: 'c1', expr: 'x^2' }], view: { xMin: -6, xMax: 6 } });
  ok('…and a picture of x² does not', !!plain && !sceneBlock(plain).includes('real q-th root'));
  ok('each line of the convention survives a picture\'s state, capped at 200 characters', POWER_CONVENTION_LINES.every((l) => l.length <= 200));

  const frame = [{ o: 'curve', id: 'c1', pts: pts('x^(2/3)', -6, 6), tone: 'primary' }];
  const entities = entitiesFromFrame(frame, scene);
  ok('the curve\'s entity says where it is drawn', entities[0]?.state === 'drawn unbroken across the whole window', JSON.stringify(entities[0]));
  const state = sanitizeModelState({
    surface: 'plot', title: '', model: 'graph',
    assumptions: ['A figure of an expression.', ...POWER_CONVENTION_LINES],
    equations: ['x^(2/3)'], entities, params: [], layers: [], readouts: [], selected: null,
  });
  const block = vizModelBlock(state);
  ok('…and the prompt carries both: where it is drawn, and how powers are drawn', block.includes('Right now: drawn unbroken across the whole window') && block.includes('(−8)^(2/3) = 4'));

  const extractor = readFileSync(new URL('../lib/logos.ts', import.meta.url), 'utf8');
  ok('the extractor is told to frame both sides of an odd-root power, and to write the exponent as a fraction', /POWERS ARE REAL-VALUED/.test(extractor) && /never "x\^0\.667"/.test(extractor) && /never start the window at 0 for a curve that is defined to its left/.test(extractor));
}

console.log('=== a function object ===');
{
  const st = { expr: 'x^(2/3)', v: 'x', params: {}, lo: -6, hi: 6 };
  ok('a point to the left of 0 is a point, not "not defined"', FUNCTION.ops.point.check(st, { x: -2 }) === null);
  ok('its slope at −1 is −2/3', near(slopeAt(st, -1), -2 / 3, 1e-4));
  const ex = extremes(st);
  ok('its lowest point is the cusp, its highest at both ends', !!ex && Math.abs(ex.min[0]) < 0.05 && near(ex.max[1], Math.pow(6, 2 / 3), 1e-6));
  const root = { expr: 'x^(1/2)', v: 'x', params: {}, lo: -6, hi: 6 };
  ok('an even root still has nothing to the left', /not defined/.test(FUNCTION.ops.point.check(root, { x: -2 }) ?? ''));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
