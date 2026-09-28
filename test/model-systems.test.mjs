// The general substrate: systems, mechanisms, estimation, routing.
//
// WHAT THIS SUITE IS FOR. Not that the new files run — that a system with six
// states is the SAME code as one with two, that a mechanism's motion comes from
// an integrator rather than from a formula that looks like motion, that a fitted
// coefficient is the least-squares one and not approximately it, and that the
// architecture refuses rather than invents when something is missing.
//
// Every numerical claim here is checked against something known independently:
// the analytic solution of a damped oscillator, the conservation of energy with
// the damping removed, the algebraic identity between a within estimate and a
// dummy-variable one, and coefficients recovered from data generated with known
// ones. A benchmark that only agrees with itself is not a check.

import { sanitizeModel } from './.tmp/schema.mjs';
import { simulate, stateAt, seriesOf, phaseOf, driftOf, runFor, forgetRuns, readSystem, STATE_CAP } from './.tmp/system.mjs';
import { assemble, expand, equationsOf, readMechanism } from './.tmp/mechanism.mjs';
import { ols, estimate, compareFits, METHODS, UNSUPPORTED } from './.tmp/estimate.mjs';
import { route, capabilityOf, missingStructure, solverTable, SOLVERS, LEVELS } from './.tmp/solve.mjs';
import { buildSpec, chooseRepresentation } from './.tmp/spec.mjs';
import { modelStateFrom, applyOps } from './.tmp/model-state.mjs';
import {
  oscillator, chain, epidemic, circuit,
  linearModel, multivariateModel, panelModel, timeSeriesModel, openSpecification,
  LIBRARY, modelById,
} from './.tmp/library.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));
const near = (a, b, tol) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= Math.abs(b) * tol + tol;
const okNear = (n, a, b, tol = 1e-6) => ok(n, near(a, b, tol), `got ${a}, expected ${b}`);

const M = (over) => sanitizeModel({ id: 'test', title: 'Test', params: [], objects: [], ...over });

console.log('=== a system has as many states as it has, with its own names ===');
{
  // The old ceiling: four states called x, y, z, w. Six named states is the test.
  const six = M({
    params: [{ id: 'k', label: 'k', value: 1, min: 0, max: 10 }],
    objects: [{
      id: 'sys', kind: 'system', label: 'Six states',
      system: {
        states: [
          { name: 'a', init: 1 }, { name: 'b', init: 0 }, { name: 'c', init: 0 },
          { name: 'd', init: 0 }, { name: 'e', init: 0 }, { name: 'f', init: 0 },
        ],
        rhs: { a: 'b', b: '0 - k * a', c: 'd', d: '0 - k * c', e: 'f', f: '0 - k * e' },
        dt: 0.01, steps: 200,
      },
    }],
  });
  const got = simulate(six, six.objects[0]);
  ok('six named states integrate', got.ok, JSON.stringify(got.missing ?? []));
  ok('  and the run carries all six', got.run.names.join() === 'a,b,c,d,e,f');
  ok('  with a row per step', got.run.y.every((row) => row.length === 6));
  ok('  named however the model named them', !!seriesOf(got.run, 'f'));

  const named = M({
    objects: [{
      id: 'sys', kind: 'system', label: 'Odd names',
      system: { states: [{ name: 'i_L', init: 1 }, { name: 'v_C', init: 0 }], rhs: { i_L: 'v_C', v_C: '0 - i_L' }, dt: 0.01, steps: 50 },
    }],
  });
  ok('a state may be called i_L rather than x', simulate(named, named.objects[0]).ok);

  const short = M({
    objects: [{
      id: 'sys', kind: 'system', label: 'Missing a derivative',
      system: { states: [{ name: 'p', init: 1 }, { name: 'q', init: 0 }], rhs: { p: 'q' } },
    }],
  });
  const refused = simulate(short, short.objects[0]);
  ok('a state with no derivative is refused, by name', !refused.ok && /dq\/dt/.test(refused.missing[0].what));
  ok('  and says what supplying it would unlock', /cannot move/.test(refused.missing[0].unlocks));
}

console.log('\n=== the integration is checked against an answer we already know ===');
{
  // A damped oscillator has a closed-form solution. This is the assertion that
  // the mechanism grammar produces the right equations AND that the integrator
  // solves them — neither of which a self-consistent test would catch.
  const m = sanitizeModel({
    id: 'osc', title: 'Oscillator', params: [
      { id: 'm', label: 'm', value: 1, min: 0.1, max: 5 },
      { id: 'k', label: 'k', value: 4, min: 1, max: 100 },
      { id: 'c', label: 'c', value: 0.4, min: 0, max: 12 },
    ],
    time: { t: 0, min: 0, max: 10 },
    objects: [{
      id: 'mech', kind: 'component', label: 'One mass',
      mechanism: {
        bodies: [{ id: 'm1', mass: 'm', x0: 1, v0: 0 }],
        springs: [{ id: 'k1', between: ['m1', 'ground'], value: 'k' }],
        dampers: [{ id: 'c1', between: ['m1', 'ground'], value: 'c' }],
        dt: 0.001, steps: 8000,
      },
    }],
  });
  const built = assemble(m.objects[0].mechanism);
  ok('parts assemble into a system', built.ok);
  ok('  with two states per body', built.system.states.length === 2);
  ok('  the displacement’s derivative is the velocity', built.system.rhs.x_m1 === 'v_m1');
  ok('  and the velocity’s is the sum of forces over the mass',
    /-\(?k\)? \* \(x_m1 - 0\)/.test(built.system.rhs.v_m1) && /\/ \(\(m\)\)/.test(built.system.rhs.v_m1),
    built.system.rhs.v_m1);

  const expanded = expand(m);
  const sys = expanded.objects.find((o) => o.id === 'mech');
  const run = simulate(expanded, sys);
  ok('the assembled system integrates', run.ok);

  // x(t) = e^{−ζω t}[cos(ω_d t) + (ζω/ω_d) sin(ω_d t)] for x(0)=1, v(0)=0.
  const w0 = Math.sqrt(4 / 1), zeta = 0.4 / (2 * Math.sqrt(4 * 1));
  const wd = w0 * Math.sqrt(1 - zeta * zeta);
  const exact = (t) => Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
  for (const t of [0.5, 2, 5, 7.5]) {
    const got = stateAt(run.run, t).x_m1;
    okNear(`  x(${t}) matches the analytic damped oscillator`, got, exact(t), 2e-3);
  }

  ok('asking for a time past the run returns its last state, rather than extrapolating',
    Math.abs(stateAt(run.run, 500).x_m1 - stateAt(run.run, 8).x_m1) < 1e-9);

  // Energy: an invariant is a STRUCTURAL claim, so it is declared when there is
  // no damper and no driving force at all — not when a damper happens to be set
  // to zero, because the structure is what the integrator is being judged on.
  const conservative = sanitizeModel({
    id: 'free', title: 'Undamped', params: [
      { id: 'm', label: 'm', value: 1, min: 0.1, max: 5 },
      { id: 'k', label: 'k', value: 4, min: 1, max: 100 },
    ],
    time: { t: 0, min: 0, max: 10 },
    objects: [{
      id: 'mech', kind: 'component', label: 'One mass, no damper',
      mechanism: {
        bodies: [{ id: 'm1', mass: 'm', x0: 1, v0: 0 }],
        springs: [{ id: 'k1', between: ['m1', 'ground'], value: 'k' }],
        dt: 0.001, steps: 8000,
      },
    }],
  });
  const freeEx = expand(conservative);
  const freeRun = simulate(freeEx, freeEx.objects.find((o) => o.id === 'mech'));
  const drift = driftOf(freeRun.run, 'energy');
  ok('with no damper and no force the model declares energy an invariant',
    freeEx.objects.find((o) => o.id === 'mech').system.invariant === 'energy');
  ok('  and a damped one does not claim it',
    !expand(m).objects.find((o) => o.id === 'mech').system.invariant);
  ok('  and the integration keeps it to better than a thousandth of a per cent',
    Math.abs(drift.relative) < 1e-5, `${drift.relative}`);
  const damped = driftOf(run.run, 'energy');
  ok('  while with damping the energy genuinely falls', damped.relative < -0.5);
}

console.log('\n=== the same grammar, three bodies, six states, no new code ===');
{
  const m = chain();
  const ex = expand(m);
  const sys = ex.objects.find((o) => o.id === 'mech');
  ok('three bodies give six states', sys.system.states.length === 6);
  const run = simulate(ex, sys);
  ok('  and it integrates', run.ok);
  ok('  every body ends up moving, though only the first was displaced',
    ['m1', 'm2', 'm3'].every((b) => Math.max(...run.run.y.map((r) => Math.abs(r[run.run.names.indexOf(`x_${b}`)]))) > 1e-3));
  // Coupling is what makes the second mass move at all: with it at zero it never does.
  const decoupled = { ...m, params: m.params.map((p) => (p.id === 'kc' ? { ...p, value: 0 } : p)) };
  const dex = expand(decoupled);
  const dr = simulate(dex, dex.objects.find((o) => o.id === 'mech'));
  const moved = Math.max(...dr.run.y.map((r) => Math.abs(r[dr.run.names.indexOf('x_m2')])));
  ok('  and with the coupling removed the second mass stays put', moved < 1e-9, `${moved}`);

  ok('the parts became first-class objects',
    ['mech__m1', 'mech__k2', 'mech__c1'].every((id) => ex.objects.some((o) => o.id === id)));
  const spring = ex.objects.find((o) => o.id === 'mech__k2');
  ok('  a spring knows what it is', spring.kind === 'spring' && /stiffness/.test(spring.meaning));
  ok('  what it depends on', spring.depends.includes('kc'));
  ok('  and what it connects', spring.relations.some((r) => r.to === 'mech__m1'));
  ok('expanding twice adds nothing', expand(ex).objects.length === ex.objects.length);
}

console.log('\n=== a mechanism is drawn from the computed state, at the clock’s instant ===');
{
  const m = expand(oscillator());
  const atZero = buildSpec({ ...m, time: { ...m.time, t: 0 } });
  const atTwo = buildSpec({ ...m, time: { ...m.time, t: 2.2 } });
  const bodyAt = (spec) => {
    const prim = spec.primitives.find((p) => p.of === 'mech__m1' && p.p === 'region');
    return prim ? prim.at.reduce((s, q) => s + q.x, 0) / prim.at.length : null;
  };
  ok('the body is drawn', bodyAt(atZero) !== null);
  ok('  and it is somewhere else two seconds later', Math.abs(bodyAt(atTwo) - bodyAt(atZero)) > 0.05);
  ok('the spring is drawn between the ends', atTwo.primitives.some((p) => p.of === 'mech__k1' && p.p === 'polyline'));
  ok('the damper is drawn', atTwo.primitives.some((p) => p.of === 'mech__c1'));
  ok('every mechanism primitive is attributed to its own part',
    atTwo.primitives.filter((p) => String(p.of).startsWith('mech__')).every((p) => m.objects.some((o) => o.id === p.of)));
  ok('the note says the placement was computed',
    atTwo.notes.some((n) => n.of === 'mech__m1' && /computed displacement/.test(n.note)));
  ok('  and carries the integrator’s fidelity',
    atTwo.notes.find((n) => n.of === 'mech__m1').fidelity === 'numerically-computed');
  ok('a mechanism is shown in the plane, not in a box', chooseRepresentation(m).dimensionality === 2);
  ok('  and says why', /perspective error|plane shows/.test(chooseRepresentation(m).why));
}

console.log('\n=== changing a parameter changes the computation, not the drawing ===');
{
  forgetRuns();
  const m = expand(oscillator());
  const soft = buildSpec({ ...m, time: { ...m.time, t: 3 } });
  const stiffer = expand({ ...oscillator(), params: oscillator().params.map((p) => (p.id === 'k' ? { ...p, value: 80 } : p)) });
  const hard = buildSpec({ ...stiffer, time: { ...stiffer.time, t: 3 } });
  const path = (spec) => spec.primitives.find((p) => p.of === 'mech' && p.p === 'polyline');
  ok('the phase path exists', !!path(soft));
  ok('  and stiffening the spring changes it', JSON.stringify(path(soft).at[40]) !== JSON.stringify(path(hard).at[40]));

  const applied = applyOps(oscillator(), [{ op: 'set', id: 'k', value: 60 }]);
  ok('a set operation records what it affected', applied.changes[0].affected.length > 0);
  ok('  including the mechanism that depends on it', applied.changes[0].affected.includes('mech'));
  ok('  and the model’s version moved', (applied.model.version ?? 0) > 0);
}

console.log('\n=== a system that is not a mechanism runs on the same integrator ===');
{
  const m = epidemic();
  const run = simulate(m, m.objects[0]);
  ok('the epidemic integrates', run.ok);
  const total = seriesOf(run.run, 'total');
  ok('  the population is conserved to a part in a million',
    Math.abs(total.v[total.v.length - 1] - total.v[0]) / total.v[0] < 1e-6);
  const I = seriesOf(run.run, 'I');
  ok('  the outbreak peaks and falls', Math.max(...I.v) > I.v[0] * 5 && I.v[I.v.length - 1] < Math.max(...I.v) / 2);
  // Below threshold it must NOT take off — the model's own qualitative check.
  const quiet = { ...m, params: m.params.map((p) => (p.id === 'beta' ? { ...p, value: 0.05 } : p)) };
  const qr = simulate(quiet, quiet.objects[0]);
  ok('  and below the reproduction threshold it never takes off',
    Math.max(...seriesOf(qr.run, 'I').v) <= seriesOf(qr.run, 'I').v[0] + 1e-9);
  ok('the phase plane is available from the same run', !!phaseOf(run.run, 'S', 'I'));

  const c = circuit();
  const cr = simulate(c, c.objects[0]);
  ok('the circuit integrates on the same code path', cr.ok);
  ok('  and resonates near 1/√(LC)', (() => {
    const at = (w) => {
      const tuned = { ...c, params: c.params.map((p) => (p.id === 'w' ? { ...p, value: w } : p)) };
      const r = simulate(tuned, tuned.objects[0]);
      return Math.max(...seriesOf(r.run, 'i').v.slice(-2000).map(Math.abs));
    };
    const w0 = 1 / Math.sqrt(1 * 0.05);
    return at(w0) > 2 * at(w0 * 3);
  })());
}

console.log('\n=== least squares, against coefficients we generated ===');
{
  const m = linearModel();
  const got = estimate(m, m.objects.find((o) => o.id === 'fit'));
  ok('the linear model fits', got.ok, JSON.stringify(got.missing ?? got.choice ?? {}));
  const b = (name) => got.fit.terms.find((t) => t.name === name);
  okNear('  the intercept is recovered', b('intercept').value, 2.5, 0.12);
  okNear('  and the slope', b('x').value, 0.8, 0.06);
  ok('  standard errors are positive and finite', got.fit.terms.every((t) => t.se > 0 && Number.isFinite(t.se)));
  ok('  R² is in range', got.fit.r2 > 0.7 && got.fit.r2 <= 1);
  ok('  residuals sum to zero when an intercept is fitted',
    Math.abs(got.fit.residuals.reduce((s, e) => s + e, 0)) < 1e-9);
  ok('  the fitted values and residuals reconstruct y',
    got.fit.y.every((v, i) => Math.abs(v - (got.fit.fitted[i] + got.fit.residuals[i])) < 1e-12));
  ok('  an interval is offered only through the normal approximation', !!b('x').ci95 && got.fit.df >= 30);
  ok('  and the fit never calls itself causal',
    got.fit.warnings.some((w) => /conditional association/.test(w)));

  // Collinearity is refused rather than answered.
  const x = [1, 2, 3, 4, 5, 6];
  const dup = ols(x.map((v) => v * 2 + 1), x.map((v) => [v, v * 3]));
  ok('two regressors carrying the same information are refused',
    !dup.ok && /collinear/.test(dup.why), JSON.stringify(dup));
  const tooFew = ols([1, 2], [[1, 2], [2, 3]]);
  ok('fewer observations than coefficients is refused', !tooFew.ok);
  const withNaN = ols([1, 2, NaN, 4, 5, 6, 7, 8], [[1], [2], [3], [4], [5], [6], [7], [8]]);
  ok('a non-finite row is dropped and reported', withNaN.ok && withNaN.fit.dropped.rows === 1);

  // HC1 changes the errors and not the estimates.
  const mv = multivariateModel();
  const robust = estimate(mv, mv.objects.find((o) => o.id === 'fit'));
  const plain = ols(
    mv.data.sample.columns.y,
    mv.data.sample.columns.x1.map((v, i) => [v, mv.data.sample.columns.x2[i]]),
    { names: ['x1', 'x2'] }
  );
  ok('robust errors leave the coefficients alone',
    robust.fit.terms.every((t, i) => Math.abs(t.value - plain.fit.terms[i].value) < 1e-9));
  ok('  and change the standard errors', robust.fit.se === 'HC1' &&
    robust.fit.terms.some((t, i) => Math.abs(t.se - plain.fit.terms[i].se) > 1e-9));
  okNear('  the controlled coefficients are the generated ones',
    robust.fit.terms.find((t) => t.name === 'x1').value, 0.5, 0.15);
  okNear('  including the control’s own', robust.fit.terms.find((t) => t.name === 'x2').value, -0.9, 0.1);

  // Leaving the control out moves the estimate: the comparison the model keeps.
  const simple = estimate(mv, mv.objects.find((o) => o.id === 'simple'));
  ok('omitting a correlated control moves the coefficient',
    Math.abs(simple.fit.terms.find((t) => t.name === 'x1').value - 0.5) > 0.1);
  const cmp = compareFits(simple.fit, robust.fit);
  ok('  and the comparison names what changed', /added x2/.test(cmp.says), cmp.says);
}

console.log('\n=== panel and time series, and what each one costs ===');
{
  const p = panelModel();
  const within = estimate(p, p.objects.find((o) => o.id === 'within'));
  const pooled = estimate(p, p.objects.find((o) => o.id === 'pooled'));
  ok('the within estimate runs', within.ok);
  okNear('  and recovers the generated coefficient', within.fit.terms[0].value, 0.6, 0.12);
  ok('the pooled estimate is pulled away by the unit effects',
    Math.abs(pooled.fit.terms.find((t) => t.name === 'x').value - 0.6) >
      Math.abs(within.fit.terms[0].value - 0.6));
  ok('  which is the point of the benchmark', pooled.ok && within.ok);
  ok('the within fit says what it removed',
    within.fit.warnings.some((w) => /within-unit/.test(w)));
  ok('  and spends a degree of freedom per unit', within.fit.df === within.fit.n - 1 - 12);

  // The within estimate must equal least squares with a dummy per unit. Same
  // number by two routes: the algebraic identity, not a tolerance.
  const cols = p.data.sample.columns;
  const units = [...new Set(cols.unit)];
  const X = cols.x.map((v, i) => [v, ...units.slice(1).map((u) => (cols.unit[i] === u ? 1 : 0))]);
  const dummies = ols(cols.y, X, { names: ['x', ...units.slice(1).map((u) => `unit${u}`)] });
  okNear('the within transform equals a dummy for every unit',
    within.fit.terms.find((t) => t.name === 'x').value,
    dummies.fit.terms.find((t) => t.name === 'x').value, 1e-9);

  const ts = timeSeriesModel();
  const ar = estimate(ts, ts.objects.find((o) => o.id === 'ar1'));
  ok('the lagged specification runs', ar.ok);
  okNear('  and recovers the autoregressive coefficient', ar.fit.terms.find((t) => /t−1/.test(t.name)).value, 0.7, 0.1);
  ok('  the row lost to the lag is reported', ar.fit.warnings.some((w) => /no lag to use/.test(w)));
  ok('  and the fit is on one fewer observation', ar.fit.n === 159);
}

console.log('\n=== the method is the person’s, and the architecture keeps it that way ===');
{
  const m = openSpecification();
  const got = estimate(m, m.objects[0]);
  ok('a specification with no method is NOT fitted', !got.ok && 'choice' in got);
  ok('  the question comes back to the person', /yours to choose/.test(got.choice.says));
  ok('  with the candidates named', got.choice.candidates.length === 3);
  ok('  each saying what it assumes', got.choice.candidates.every((c) => c.assumes.length >= 2));
  ok('  and what it needs', got.choice.candidates.every((c) => c.needs.length >= 1));
  ok('  what the data appears to be is offered as evidence, not as a decision',
    got.choice.observed.some((o) => /panel/.test(o)) && !/you should/.test(got.choice.says));
  ok('  and what cannot be done at all is listed', got.choice.unsupported.length >= 4);
  ok('nothing in the method list recommends one',
    !METHODS.some((c) => /best|recommend|should/i.test(JSON.stringify(c))));
  ok('the absences are stated rather than silent', UNSUPPORTED.some((u) => /instrumental/.test(u)));

  // The router reports it as a missing CHOICE, not a missing number.
  const routed = route(m, m.objects[0]);
  ok('the router says the fit is incomplete', routed.status === 'incomplete');
  ok('  because a method has not been chosen', /chosen by you/.test(routed.missing[0].what));
}

console.log('\n=== routing, and what a model may honestly claim ===');
{
  ok('every registered solver says whether it is real', solverTable().every((s) => typeof s.real === 'boolean'));
  ok('  and the future ones are marked as interfaces', solverTable().some((s) => !s.real));
  ok('  each one names its method', solverTable().every((s) => s.method.length > 20));

  const osc = expand(oscillator());
  ok('a mechanism routes to the assembler', route(osc, osc.objects.find((o) => o.id === 'mech')).solver.id === 'mechanism');
  const ep = epidemic();
  ok('a system routes to the integrator', route(ep, ep.objects[0]).solver.id === 'rk4');
  const lm = linearModel();
  ok('a specification routes to the estimator', route(lm, lm.objects.find((o) => o.id === 'fit')).solver.id === 'ols');
  const sad = modelById('saddle');
  ok('a surface routes to the sampler', route(sad, sad.objects.find((o) => o.kind === 'surface')).solver.id === 'sample');

  const optimiser = M({ objects: [{ id: 'obj', kind: 'objective', label: 'Maximise something', definition: 'max x' }] });
  const no = route(optimiser, optimiser.objects[0]);
  ok('an objective is honestly unsupported', no.status === 'unsupported');
  ok('  and says what would be needed', /backend/.test(no.wouldNeed));
  ok('  rather than being quietly drawn', !('solver' in no));

  const structural = M({ objects: [{ id: 'idea', kind: 'annotation', label: 'A thought' }] });
  ok('a model with nothing computable is structural', capabilityOf(structural).level === 'structural');
  ok('  and says what the next level would take',
    capabilityOf(structural).short.some((s) => s.level === 'mathematical'));
  ok('a surface model is computational', capabilityOf(sad).level === 'computational');
  ok('a mechanism is dynamic', capabilityOf(osc).level === 'dynamic');
  ok('a fitted specification is data-grounded', capabilityOf(lm).level === 'data-grounded');
  ok('there is no level a function can award for research-grade', !LEVELS.includes('research-grade'));
  ok('the capability reads as a sentence', /This model is/.test(capabilityOf(osc).says));

  const half = M({
    objects: [{
      id: 'sys', kind: 'system', label: 'Half a system',
      system: { states: [{ name: 'p', init: 1 }, { name: 'q', init: 0 }], rhs: { p: 'q' } },
    }],
  });
  const miss = missingStructure(half);
  ok('what is missing is listed per object, by name', miss[0].missing.some((x) => /dq\/dt/.test(x.what)));
  const spec = buildSpec(half);
  ok('and the picture says it was not computed rather than drawing something',
    spec.notes.some((n) => n.of === 'sys' && /not computed/.test(n.problem ?? n.note ?? '')),
    JSON.stringify(spec.notes));
}

console.log('\n=== the conversation sees the state, the fit and the honest level ===');
{
  const m = expand(oscillator());
  const spec = buildSpec({ ...m, time: { ...m.time, t: 1.4 } });
  const state = modelStateFrom({ ...m, time: { ...m.time, t: 1.4 } }, spec, { selected: 'mech__k1' });
  const ent = (id) => state.entities.find((e) => e.id === id);
  ok('every part is an entity the conversation can be asked about',
    !!ent('mech__m1') && !!ent('mech__k1') && !!ent('mech__c1'));
  ok('a body reports its computed displacement at the clock’s instant',
    /displacement/.test(ent('mech__m1').state ?? ''), ent('mech__m1').state);
  ok('a spring reports its extension', /extension/.test(ent('mech__k1').state ?? ''));
  ok('  and what it is', /restoring/.test(ent('mech__k1').meaning));
  ok('  and what controls it', (ent('mech__k1').depends ?? []).includes('k'));
  ok('the selection is part of the state', state.selected === 'mech__k1');
  ok('the readouts say what the model can honestly do', state.readouts.some((r) => /This model is dynamic/.test(r)));
  // The damped oscillator declares no invariant, so no drift line is expected;
  // the conservative model does, and that is where the claim is checked.
  const freeModel = expand(sanitizeModel({
    id: 'free2', title: 'Undamped', params: [{ id: 'k', label: 'k', value: 4, min: 1, max: 100 }],
    time: { t: 0, min: 0, max: 5 },
    objects: [{
      id: 'mech', kind: 'component', label: 'One mass',
      mechanism: { bodies: [{ id: 'm1', mass: 1, x0: 1 }], springs: [{ id: 'k1', between: ['m1', 'ground'], value: 'k' }], dt: 0.002, steps: 2000 },
    }],
  }));
  const freeState = modelStateFrom(freeModel, buildSpec(freeModel), {});
  ok('  and reports the integrator’s own drift where the model declares an invariant',
    freeState.readouts.some((r) => /drifted/.test(r)), JSON.stringify(freeState.readouts));

  const lm = linearModel();
  const lspec = buildSpec(lm);
  const lstate = modelStateFrom(lm, lspec, {});
  const fit = lstate.entities.find((e) => e.id === 'fit');
  ok('a fitted specification reports its actual coefficients to the conversation',
    /x = 0\.7|x = 0\.8/.test(fit.state ?? ''), fit.state);
  ok('  with the standard errors', /se /.test(fit.state));
  ok('  and where they came from', /dataset|data/.test((fit.relations ?? []).join(' ')));
  ok('  marked as data-derived rather than computed from a formula', fit.from === 'measured');

  const open = openSpecification();
  const ostate = modelStateFrom(open, buildSpec(open), {});
  const oent = ostate.entities[0];
  ok('an unchosen method is reported as unchosen, to the conversation',
    /no method chosen/.test(oent.state ?? ''), oent.state);
}

console.log('\n=== one model, several views, ONE computation ===');
{
  forgetRuns();
  const m = expand(oscillator());
  const spec = buildSpec({ ...m, time: { ...m.time, t: 4 } });
  const panels = spec.panels ?? [];
  ok('a dynamic model carries secondary views', panels.length >= 2, `${panels.length}`);
  ok('  each says which object it is a view of', panels.every((p) => m.objects.some((o) => o.id === p.of)));
  ok('  and each is marked as computed', panels.every((p) => p.fidelity === 'numerically-computed'));

  // THE CLAIM THAT MATTERS: the panel is the SAME run as the main view, not a
  // second integration that happens to look similar. Checked by reading the run
  // directly and comparing values.
  const sys = m.objects.find((o) => o.id === 'mech');
  const run = runFor(m, sys).run;
  const xPanel = panels.find((p) => p.y === 'x_m1');
  ok('the displacement panel exists', !!xPanel);
  const sample = xPanel.at[10];
  const fromRun = stateAt(run, sample.x).x_m1;
  okNear('  and its points ARE the run’s own values', sample.y, fromRun, 1e-9);

  // And they move together: one parameter change, every view different.
  const stiff = expand({ ...oscillator(), params: oscillator().params.map((p) => (p.id === 'k' ? { ...p, value: 90 } : p)) });
  const spec2 = buildSpec({ ...stiff, time: { ...stiff.time, t: 4 } });
  const xPanel2 = (spec2.panels ?? []).find((p) => p.y === 'x_m1');
  ok('changing a parameter changes the panel as well as the mechanism',
    Math.abs(xPanel2.at[10].y - xPanel.at[10].y) > 1e-6);

  ok('a model with no dynamics has no panels, rather than empty ones',
    (buildSpec(modelById('saddle')).panels ?? []).length === 0);
  ok('the panel count is bounded', (buildSpec(expand(chain())).panels ?? []).length <= 4);
}

console.log('\n=== nothing that worked before stopped working ===');
{
  for (const entry of LIBRARY) {
    const built = entry.build();
    const spec = buildSpec(built);
    ok(`${entry.id} builds`, spec.primitives.length > 0 || spec.notes.length > 0);
    ok(`  ${entry.id} produces only finite coordinates`,
      spec.primitives.every((p) => {
        const pts = p.p === 'mesh' ? p.rows.flat().filter(Boolean) : p.at ? (Array.isArray(p.at) ? p.at : [p.at]) : [];
        return pts.every((q) => Number.isFinite(q.x) && Number.isFinite(q.y) && Number.isFinite(q.z ?? 0));
      }));
    ok(`  ${entry.id} says how each object was produced`, spec.notes.every((n) => !!n.fidelity));
    const st = modelStateFrom(built, spec, {});
    ok(`  ${entry.id} is describable to the conversation`, st.entities.length > 0 && st.readouts.length > 0);
  }
  ok('the library is nineteen benchmarks', LIBRARY.length === 19, `${LIBRARY.length}`);
  ok('a four-state trajectory still works the old way',
    buildSpec(modelById('double-pendulum')).primitives.some((p) => p.p === 'polyline'));
  ok('the state cap is stated rather than implied', STATE_CAP >= 12);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
