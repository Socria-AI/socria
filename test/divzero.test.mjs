// Dividing by zero, as a picture.
//
// "What actually happens if you divide by zero" is one of the few questions
// where the honest answer IS a graph: nothing happens, because there is no
// number for it to be — and the reason is visible the moment you watch the
// height as the divisor shrinks.
//
// The mathematics for this already worked; what did not was the panel SAYING
// any of it. f(0) was missing from the readouts entirely — the one value
// somebody arrives asking about — the asymptote was drawn like an ordinary
// point marker, and the narration described a curve "running away" without
// naming the division that makes it run.
//
// Three cases are pinned here because they are three different answers, and a
// change that collapses them is a change that has stopped teaching:
//
//   1/x    at 0 — no limit AT ALL, because the sides oppose. Not infinity.
//   1/x^2  at 0 — genuinely +∞: both sides agree, so there IS an answer.
//   x/x    at 0 — 0/0, and the limit is 1. Undefined at the point, fine near it.

import { sanitizeViz, compileScene, resolveView, buildFrame, defaults } from './.tmp/logos-viz.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

/** Build one scene at a given δ and hand back what the panel would show. */
function panel(raw, delta) {
  const s = sanitizeViz(raw);
  const fn = compileScene(s);
  const view = resolveView(s, defaults(s));
  const d = s.params.find((p) => p.id === 'd');
  const vals = { ...defaults(s), d: delta ?? d.min };
  const f = buildFrame(s, fn, vals, view, false);
  const read = (id) => (f.readouts || []).find((r) => r.id === id);
  return { scene: s, frame: f, read, delta: vals.d, dMin: d.min };
}

const overZero = (expr, a = 0, view = { xMin: -4, xMax: 4, yMin: -8, yMax: 8 }) =>
  ({ kind: 'limit', expr, varName: 'x', a, view, params: [] });

console.log('=== the value they asked about is on the board ===');
{
  for (const expr of ['1/x', '1/x^2', 'x/x']) {
    const p = panel(overZero(expr));
    const fa = p.read('fa');
    ok(`${expr}: f(0) is shown`, !!fa, 'missing');
    ok(`${expr}: and says undefined`, fa?.value === 'undefined', fa?.value);
    ok(`${expr}: with an explanation`, (fa?.help || '').length > 40);
  }
  // Where the function IS defined at the point, there is nothing to report
  // and the row must not appear.
  const fine = panel({ kind: 'limit', expr: 'x^2', varName: 'x', a: 2, view: { xMin: -1, xMax: 4, yMin: -1, yMax: 9 }, params: [] });
  ok('a defined point shows no undefined row', !fine.read('fa'));
}

console.log('\n=== dividing by less gives more, and it is visible ===');
{
  // The mechanism, in numbers: halve the divisor, double the height. If this
  // stops holding, the picture has stopped demonstrating the thing.
  const at = (d) => Number(panel(overZero('1/x'), d).read('fr').value);
  const a1 = at(1), a2 = at(0.5), a3 = at(0.25), a4 = at(0.05);
  ok('1/1 reads 1', a1 === 1, a1);
  ok('1/0.5 reads 2', a2 === 2, a2);
  ok('1/0.25 reads 4', a3 === 4, a3);
  ok('1/0.05 reads 20', a4 === 20, a4);
  ok('each halving doubles it', a2 === a1 * 2 && a3 === a2 * 2);
  ok('and it never settles', a4 > a3 && a3 > a2);
}

console.log('\n=== three questions, three different answers ===');
{
  const one = panel(overZero('1/x'));
  ok('1/x: left runs to −∞', one.read('limL').value === '−∞', one.read('limL')?.value);
  ok('1/x: right runs to +∞', one.read('limR').value === '+∞', one.read('limR')?.value);
  ok('1/x: so there is NO limit — not infinity',
    one.read('L').value === 'does not exist', one.read('L')?.value);

  const sq = panel(overZero('1/x^2', 0, { xMin: -4, xMax: 4, yMin: -2, yMax: 20 }));
  ok('1/x^2: both sides run to +∞',
    sq.read('limL').value === '+∞' && sq.read('limR').value === '+∞');
  ok('1/x^2: so the limit IS +∞', sq.read('L').value === '+∞', sq.read('L')?.value);

  const zz = panel(overZero('x/x'));
  ok('x/x: undefined at 0', zz.read('fa')?.value === 'undefined');
  ok('x/x: but the limit is 1', zz.read('L').value === '1', zz.read('L')?.value);
  ok('x/x: and no one-sided rows, because they agree', !zz.read('limL'));
}

console.log('\n=== the asymptote is drawn as a wall, not a marker ===');
{
  const pole = panel(overZero('1/x'));
  const line = pole.frame.objects.find((o) => o.id === 'a');
  ok('a pole colours the line as a tension', line.tone === 'tension', line.tone);

  // A removable hole is NOT a wall: same marker, ordinary weight.
  const hole = panel({ kind: 'limit', expr: '(x^2-1)/(x-1)', varName: 'x', a: 1, view: { xMin: -2, xMax: 4, yMin: -2, yMax: 6 }, params: [] });
  ok('a removable hole leaves it muted',
    hole.frame.objects.find((o) => o.id === 'a').tone === 'muted');
  ok('and its limit is 2', hole.read('L').value === '2', hole.read('L')?.value);

  // The curve must BREAK at the pole rather than joining the two branches
  // with a vertical line that is not part of the function.
  const curve = pole.frame.objects.find((o) => o.id === 'f');
  const breaks = curve.pts.filter((p) => p.y === null || !Number.isFinite(p.y)).length;
  ok('the curve breaks at the pole', breaks >= 1, String(breaks));
}

console.log('\n=== the narration names the division ===');
{
  const one = panel(overZero('1/x')).frame.narration;
  ok('1/x: says the sides oppose', /OPPOSITE directions/.test(one), one);
  ok('1/x: and refuses "infinity" as the answer', /not even infinity/.test(one), one);

  const sq = panel(overZero('1/x^2', 0, { xMin: -4, xMax: 4, yMin: -2, yMax: 20 })).frame.narration;
  ok('1/x^2: says halving doubles it', /doubles/.test(sq), sq);
  ok('1/x^2: and names the rule', /smaller always gives something bigger/.test(sq), sq);
  ok('1/x^2: does NOT claim the sides disagree', !/OPPOSITE/.test(sq), sq);

  // Wide δ is still the early narration: the point has not been made yet.
  const wide = panel(overZero('1/x'), 2).frame.narration;
  ok('at a wide δ it has not jumped to the conclusion',
    !/OPPOSITE directions/.test(wide), wide);
}

console.log('\n=== the guard still holds the answer ===');
{
  // With the Answer Guard up, the limit is the thing being withheld. That
  // f(0) is undefined is the PREMISE and stays — a question with its own
  // setup hidden is not a question.
  const s = sanitizeViz(overZero('1/x'));
  const fn = compileScene(s);
  const view = resolveView(s, defaults(s));
  const f = buildFrame(s, fn, defaults(s), view, true);
  const read = (id) => (f.readouts || []).find((r) => r.id === id);
  ok('the limit is withheld', read('L').value === null, String(read('L')?.value));
  ok('the one-sided limits too', read('limL').value === null);
  ok('but f(0) = undefined still shows', read('fa')?.value === 'undefined');
  ok('and the readings off the graph still show', read('fr')?.value != null);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
