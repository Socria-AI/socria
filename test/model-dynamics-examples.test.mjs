// The dynamics examples in the docs: every one builds through the on-ramp,
// and every number its check states is held here to what is known about it.
// If one fails, the docs are saying something the engine does not do.
import { DYNAMICS } from './.tmp/dynamics-examples.mjs';
import { buildProposal } from './.tmp/propose.mjs';
import { viewsFor } from './.tmp/views.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const ex = (id) => DYNAMICS.find((e) => e.id === id);
const said = (id) => ex(id).check(ex(id).model());
const num = (re, s) => Number((re.exec(s)?.[1] ?? 'NaN').replace('−', '-'));

console.log('=== every example builds, opens on its view, and says what it computes ===');
for (const e of DYNAMICS) {
  const b = buildProposal(e.model());
  ok(`${e.id} builds`, b.ok, b.ok ? '' : b.refusal?.says);
  const view = e.model().view;
  ok(`${e.id} opens on a view it offers`, !view || viewsFor(b.model).some((v) => v.id === view && !v.notDrawnYet), view);
  const c = said(e.id);
  ok(`${e.id} has a check with numbers and nothing undefined`, /\d/.test(c) && !/NaN|undefined|Infinity|not computed/.test(c), c);
}
ok('ids are unique, and none collides with an engineering example', new Set(DYNAMICS.map((e) => e.id)).size === DYNAMICS.length);

console.log('=== the numbers ===');
{
  const l = said('logistic');
  ok('logistic at r = 3.5: period 4', /cycle of period 4/.test(l));
  ok('… superstable at 2, then 1 + √5', /r = 2, 3\.23607/.test(l));
  ok('… δ to four figures', Math.abs(num(/reaches ([\d.]+): Feigenbaum/, l) - 4.6692) < 5e-4, l);
  const s = said('sine-map');
  ok('the sine map’s δ is the logistic map’s', Math.abs(num(/reaches ([\d.]+) —/, s) - 4.6692) < 5e-3, s);
  const h = said('henon');
  ok('Hénon: exponents 0.42 and −1.62, summing to ln 0.3', /0\.4\d\d and −1\.6\d/.test(h) && /is ln b = −1\.204/.test(h) && /their sum, −1\.204/.test(h), h);
  const z = said('lorenz');
  ok('Lorenz: C± at (±8.485, ±8.485, 27), found by the engine with eigenvalues 0.094 ± 10.2i and −13.9', /found at \(8\.485, 8\.485, 27\)/.test(z) && /0\.09\d \+ 10\.\di/.test(z) && /−13\.\d/.test(z), z);
  ok('… and a section of hundreds of crossings', num(/pierces its plane (\d+) times/, z) > 300, z);
  const p = said('predator-prey');
  ok('Lotka–Volterra: the centre at (3, 2) with ±0.775i, as theory says', /centre at \(3, 2\)/.test(p) && /0\.775i/.test(p) && /\(3, 2\)/.test(p), p);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
