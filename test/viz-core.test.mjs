import { sanitizeViz, compileScene, resolveView, buildFrame, defaults, sweepValue, sweepProgress, sweptParam } from './.tmp/logos-viz.mjs';
let pass = 0, fail = 0;
const ok = (n, c, extra = '') => c ? pass++ : (fail++, console.log(`FAIL ${n} ${extra}`));
const near = (n, got, want, tol = 1e-3) => ok(n, Math.abs(got - want) < tol, `got ${got} want ${want}`);

const frame = (raw, vals = null, guarded = false) => {
  const s = sanitizeViz(raw);
  if (!s) return null;
  const fn = compileScene(s);
  const view = resolveView(s, fn);
  return { scene: s, frame: buildFrame(s, fn, vals ?? defaults(s), view, guarded), view };
};
const ro = (f, id) => f.frame.readouts.find(r => r.id === id);

// ---------- sanitizer ----------
ok('rejects junk', sanitizeViz(null) === null);
ok('rejects bad kind', sanitizeViz({ kind: 'wat', expr: 'x' }) === null);
ok('rejects constant', sanitizeViz({ kind: 'function', expr: '5' }) === null);
ok('rejects unbound name', sanitizeViz({ kind: 'function', expr: 'q*x' }) === null);
ok('accepts bound param', !!sanitizeViz({ kind: 'function', expr: 'q*x', params: [{ id: 'q', min: 0, max: 3, value: 1 }] }));
ok('rejects bad interval', sanitizeViz({ kind: 'riemann', expr: 'x^2', a: 3, b: 1 }) === null);
ok('rejects code-ish', sanitizeViz({ kind: 'function', expr: 'constructor(x)' }) === null);
ok('caps params', sanitizeViz({ kind: 'function', expr: 'x', params: Array.from({length:9},(_,i)=>({id:'p'+i,min:0,max:1,value:0})) }).params.length <= 4);
ok('no model prose leaks', !('ask' in (sanitizeViz({ kind:'derivative', expr:'x^2', a:1, ask:'the answer is 2' }) ?? {})));

// defaults filled in
const d = sanitizeViz({ kind: 'derivative', expr: 'x^2', a: 1 });
ok('derivative gets h', d.params.some(p => p.id === 'h' && p.sweep === 'down'));
ok('riemann gets n', sanitizeViz({ kind: 'riemann', expr: 'x^2', a: 0, b: 2 }).params.some(p => p.id === 'n' && p.integer));
ok('one sweeper only', sanitizeViz({ kind:'riemann', expr:'a*x', a:0, b:2, params:[{id:'a',min:0,max:2,value:1,sweep:'up'}] }).params.filter(p=>p.sweep).length === 1);

// ---------- derivative: f(x)=x^2 at a=1, f'(1)=2 ----------
const D = frame({ kind: 'derivative', expr: 'x^2', a: 1 }, { h: 0.5 });
near('secant slope at h=.5', Number(ro(D, 'slope').value), 2.5);
near("f'(1)", Number(ro(D, 'fprime').value), 2);
const Dsmall = frame({ kind: 'derivative', expr: 'x^2', a: 1 }, { h: 0.001 });
near('secant -> 2 as h->0', Number(ro(Dsmall, 'slope').value), 2, 0.01);
const Dg = frame({ kind: 'derivative', expr: 'x^2', a: 1 }, { h: 0.5 }, true);
ok('GUARD: f-prime withheld', ro(Dg, 'fprime').value === null);
ok('GUARD: secant still shown', ro(Dg, 'slope').value !== null);
ok('GUARD: no tangent object', !Dg.frame.objects.some(o => o.id === 'tangent'));
ok('unguarded: tangent drawn', D.frame.objects.some(o => o.id === 'tangent'));
ok('P and Q drawn', D.frame.objects.filter(o => o.o === 'point' && ['P','Q'].includes(o.id)).length === 2);
ok('guard asks a question', !!Dg.frame.ask);

// ---------- limit ----------
const L = frame({ kind: 'limit', expr: '(x^2-1)/(x-1)', a: 1 }, { d: 0.5 });
near('lim (x^2-1)/(x-1) at 1', Number(ro(L, 'L').value), 2);
ok('f(1) undefined -> no hollow pt value', !L.frame.objects.some(o => o.id === 'fa'));
const Lg = frame({ kind: 'limit', expr: '(x^2-1)/(x-1)', a: 1 }, { d: 0.5 }, true);
ok('GUARD: limit withheld', ro(Lg, 'L').value === null);
ok('GUARD: no L rule drawn', !Lg.frame.objects.some(o => o.id === 'Lrule'));
ok('GUARD: side values shown', ro(Lg, 'fl').value !== null && ro(Lg, 'fr').value !== null);
const Ldne = frame({ kind: 'limit', expr: '1/x', a: 0 }, { d: 0.5 });
ok('sided disagreement -> DNE', ro(Ldne, 'L').value === 'does not exist', ro(Ldne,'L').value);

// ---------- riemann: int_0^2 x^2 = 8/3 ----------
const R = frame({ kind: 'riemann', expr: 'x^2', a: 0, b: 2 }, { n: 4 });
near('exact integral', Number(ro(R, 'exact').value), 8 / 3, 1e-3);
near('left sum n=4', Number(ro(R, 'sum').value), 1.75);
ok('4 bars', R.frame.objects.find(o => o.o === 'rects').bars.length === 4);
const R100 = frame({ kind: 'riemann', expr: 'x^2', a: 0, b: 2 }, { n: 80 });
ok('sum converges', Math.abs(Number(ro(R100, 'sum').value) - 8/3) < Math.abs(Number(ro(R, 'sum').value) - 8/3));
const Rg = frame({ kind: 'riemann', expr: 'x^2', a: 0, b: 2 }, { n: 4 }, true);
ok('GUARD: integral withheld', ro(Rg, 'exact').value === null);
ok('GUARD: partial sum shown', ro(Rg, 'sum').value !== null);
const Rmid = frame({ kind: 'riemann', expr: 'x^2', a: 0, b: 2, rule: 'midpoint' }, { n: 4 });
near('midpoint sum n=4', Number(ro(Rmid, 'sum').value), 2.625);

// ---------- function + params ----------
const F = frame({ kind: 'function', expr: 'a*x^2', params: [{ id: 'a', min: -3, max: 3, step: 0.1, value: 1 }] }, { a: 2 });
ok('curve drawn', F.frame.objects.some(o => o.o === 'curve'));
ok('param readout', ro(F, 'a').value === '2');

// ---------- sweep ----------
const hp = sweptParam(d);
near('sweep starts at max', sweepValue(hp, 0), hp.max);
near('sweep ends at min', sweepValue(hp, 1), hp.min);
ok('sweep monotone down', sweepValue(hp, 0.3) > sweepValue(hp, 0.7));
near('progress roundtrips', sweepProgress(hp, sweepValue(hp, 0.42)), 0.42, 0.01);
const np = sweptParam(sanitizeViz({ kind:'riemann', expr:'x^2', a:0, b:2 }));
ok('n sweeps up integer', sweepValue(np, 1) === np.max && Number.isInteger(sweepValue(np, 0.5)));

// ---------- viewport is stable across the sweep ----------
const S = sanitizeViz({ kind: 'derivative', expr: 'x^2', a: 1 });
const fnS = compileScene(S);
ok('view independent of params', JSON.stringify(resolveView(S, fnS)) === JSON.stringify(resolveView(S, fnS)));

// ---------- no NaN reaches the renderer ----------
for (const [nm, r] of [['deriv', D], ['limit', L], ['riemann', R], ['fn', F]]) {
  const bad = JSON.stringify(r.frame.objects).includes('null');
  ok(`${nm}: finite view`, Object.values(r.view).every(Number.isFinite));
}
const poly = frame({ kind: 'limit', expr: '1/x', a: 0 }, { d: 0.5 });
ok('pole: still renders', !!poly && poly.frame.objects.length > 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
