// Maps in the model engine: systems that step rather than flow. Each result
// is held to what is known about it — the logistic map's fixed point and its
// multiplier, its period doublings, its Lyapunov exponent at r = 4, the Hénon
// attractor — and the flows of three or more states get their Poincaré
// section.
import { buildProposal } from './.tmp/propose.mjs';
import { mapRunFor, mapBehaviour, bifurcationOf, cobwebOf, sectionOf, forgetMapRuns, feigenbaumOf } from './.tmp/iterate.mjs';
import { buildSpec } from './.tmp/spec.mjs';
import { viewsFor } from './.tmp/views.mjs';
import { frameFor } from './.tmp/viewdata.mjs';
import { route, capabilityOf } from './.tmp/solve.mjs';
import { inspectObject } from './.tmp/inspect.mjs';
import { referencesOf } from './.tmp/deps.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const logistic = (r, extra = {}) =>
  buildProposal({
    id: 'logistic',
    title: 'The logistic map',
    params: [{ id: 'r', label: 'growth rate', value: r, min: 2.5, max: 4 }],
    objects: [{ id: 'pop', kind: 'system', label: 'Population', map: { states: [{ name: 'x', init: 0.2 }], next: { x: 'r*x*(1 - x)' }, steps: 400, ...extra } }],
  });
const obj = (b) => b.model.objects.find((o) => o.map);

console.log('=== the logistic map, against what is known ===');
{
  const b = logistic(2.8);
  ok('it builds, and the map iterator claims it', b.ok && route(b.model, obj(b), 'simulate').status === 'runnable' && route(b.model, obj(b), 'simulate').solver.id === 'map');
  ok('a model that steps is dynamic', capabilityOf(b.model).level === 'dynamic');
  const run = mapRunFor(b.model, obj(b)).run;
  ok('it steps exactly: x₁ = r·x₀(1 − x₀)', run.x.length === 401 && Math.abs(run.x[1][0] - 2.8 * 0.2 * 0.8) < 1e-15);
  const be = mapBehaviour(b.model, obj(b));
  const fp = be.fixed.find((f) => f.at[0] > 0.1);
  ok('r = 2.8: it settles to a fixed point', be.period === 1, be.says);
  ok('… at 1 − 1/r, with multiplier 2 − r = −0.8, attracting', fp && near(fp.at[0], 1 - 1 / 2.8, 1e-9) && /−0\.8/.test(fp.multipliers) && fp.stable === true, JSON.stringify(fp));
  ok('… and x = 0 is a fixed point too, repelling, multiplier r', be.fixed.some((f) => near(f.at[0], 0, 1e-9) && f.stable === false && /2\.8/.test(f.multipliers)));
  ok('r = 3.2: a cycle of period 2', mapBehaviour(logistic(3.2).model, obj(logistic(3.2))).period === 2);
  ok('r = 3.5: a cycle of period 4', mapBehaviour(logistic(3.5).model, obj(logistic(3.5))).period === 4);
  const c = logistic(3.9);
  const ch = mapBehaviour(c.model, obj(c));
  ok('r = 3.9: no period, and a positive Lyapunov exponent — chaos, said so', ch.period === 0 && ch.lyapunov[0] > 0.3 && /chaos/.test(ch.says), ch.says);
  const four = mapBehaviour(logistic(4).model, obj(logistic(4)));
  ok('r = 4: the exponent is ln 2', near(four.lyapunov[0], Math.log(2), 0.02), four.lyapunov[0]);
}

console.log('=== its pictures ===');
{
  const b = logistic(3.5);
  const spec = buildSpec(b.model);
  ok('the main picture: each step’s value against n', spec.dimensionality === 2 && spec.axisNames[0] === 'n' && spec.axisNames[1] === 'x' && spec.primitives.some((p) => p.p === 'points' && p.at.length === 401));
  const views = viewsFor(b.model).map((v) => v.id);
  ok('it offers its iterates, its cobweb and its bifurcation diagram', views.includes('trajectory:pop') && views.includes('phase:pop') && views.includes('bifurcation:pop'), views.join());
  const cw = frameFor(b.model, 'phase:pop');
  ok('the cobweb: the graph, the diagonal and the walk, in xₙ and xₙ₊₁', cw && cw.primitives.filter((p) => p.p === 'polyline').length === 3 && cw.axisNames[0] === 'xₙ' && cw.axisNames[1] === 'xₙ₊₁');
  const walk = cobwebOf(b.model, obj(b)).primitives[2].at;
  ok('… each rung up to the graph, then across to the diagonal', walk.slice(1, 7).every((p, i) => (i % 2 === 1 ? near(p.x, p.y, 1e-12) : true)) && near(walk[1].y, 3.5 * walk[1].x * (1 - walk[1].x), 1e-12));
  const bf = bifurcationOf(b.model, obj(b));
  ok('the bifurcation diagram sweeps r over its control’s range', bf && near(bf.box.x[0], 2.5, 1e-12) && near(bf.box.x[1], 4, 1e-12) && bf.param.id === 'r');
  const first = Number(/period first doubles near growth rate = ([\d.]+)/.exec(bf.note)?.[1]);
  ok('… and finds the first doubling near r = 3', first > 2.99 && first < 3.08, bf.note);
  const pts = bf.primitives[0].at;
  const at = (r) => [...new Set(pts.filter((p) => near(p.x, r, 0.002)).map((p) => p.y.toFixed(4)))].length;
  ok('… one value at r = 2.8, two at 3.2, four at 3.5, many near 3.9', at(2.8) === 1 && at(3.2) === 2 && at(3.5) === 4 && at(3.9) > 20, [at(2.8), at(3.2), at(3.5), at(3.9)].join());
  ok('… with a dashed line at r’s value now', bf.primitives.some((p) => p.p === 'polyline' && p.dashed && near(p.at[0].x, 3.5, 1e-12)));
  const fr = frameFor(b.model, 'bifurcation:pop');
  ok('its frame names the axes: the parameter and the state', fr && fr.axisNames[0] === 'growth rate' && fr.axisNames[1] === 'x');
  const ins = inspectObject(b.model, 'pop').sections.find((s) => s.id === 'behaviour');
  ok('the Inspector says how it behaves', ins && /period 4/.test(ins.summary) && ins.facts.some((f) => /Lyapunov/.test(f.label)));
  ok('its dependencies reach r', referencesOf(obj(b)).has('r'));
}

console.log('=== Feigenbaum, out of the map itself — and the same for another map ===');
{
  const b = logistic(3.5);
  const fb = feigenbaumOf(b.model, obj(b));
  ok('the logistic map’s superstable cycles: r = 2, then 1 + √5', fb && Math.abs(fb.superstable[0] - 2) < 1e-9 && Math.abs(fb.superstable[1] - (1 + Math.sqrt(5))) < 1e-9, fb?.superstable.join());
  ok('… and the ratio of their gaps tends to δ = 4.6692', fb && Math.abs(fb.delta.at(-1) - 4.6692) < 2e-3, fb?.delta.at(-1));
  const sine = buildProposal({
    id: 'sine', title: 'The sine map',
    params: [{ id: 'mu', label: 'μ', value: 0.85, min: 0.6, max: 1 }],
    objects: [{ id: 's', kind: 'system', label: 'sine map', map: { states: [{ name: 'x', init: 0.3 }], next: { x: 'mu*sin(pi*x)' }, steps: 400 } }],
  });
  const fs = feigenbaumOf(sine.model, obj(sine));
  ok('a different one-humped map — μ·sin(πx) — gives the same δ: universality', fs && Math.abs(fs.delta.at(-1) - 4.6692) < 5e-3, fs?.delta.join());
  ok('the Inspector reports it under how the map behaves', inspectObject(b.model, 'pop').sections.find((x) => x.id === 'behaviour').facts.some((f) => f.label === 'Period doubling' && /4\.669/.test(f.value)));
}

console.log('=== two states: the Hénon map ===');
{
  const b = buildProposal({
    id: 'henon',
    title: 'The Hénon map',
    params: [{ id: 'a', label: 'a', value: 1.4, min: 1, max: 1.4 }, { id: 'b', label: 'b', value: 0.3, min: 0.1, max: 0.4 }],
    objects: [{ id: 'h', kind: 'system', label: 'Hénon', map: { states: [{ name: 'x', init: 0 }, { name: 'y', init: 0 }], next: { x: '1 - a*x^2 + y', y: 'b*x' }, steps: 2000, sweep: 'a' } }],
  });
  const be = mapBehaviour(b.model, obj(b));
  ok('its largest Lyapunov exponent is 0.42, its second −1.62 — summing to ln b', near(be.lyapunov[0], 0.419, 0.02) && near(be.lyapunov[0] + be.lyapunov[1], Math.log(0.3), 1e-6), be.lyapunov.join());
  const spec = buildSpec(b.model);
  ok('its picture is the attractor in x and y', spec.axisNames[0] === 'x' && spec.axisNames[1] === 'y' && spec.primitives[0].at.every((p) => Math.abs(p.x) < 1.35 && Math.abs(p.y) < 0.42));
  const views = viewsFor(b.model).map((v) => v.id);
  ok('no cobweb for two states, but a bifurcation diagram in a', !views.includes('phase:h') && views.includes('bifurcation:h'));
  const n = buildProposal({ id: 'nd', title: 'n-dependent', params: [{ id: 'k', label: 'k', value: 1, min: 0, max: 2 }], objects: [{ id: 'm', kind: 'system', label: 'm', map: { states: [{ name: 'x', init: 1 }], next: { x: 'x + k/(n + 1)' }, steps: 10 } }] });
  ok('a map that depends on n has no bifurcation diagram — it has no fixed attractor to sweep', !viewsFor(n.model).some((v) => v.family === 'bifurcation'));
}

console.log('=== refusals ===');
{
  const say = (b) => (route(b.model, obj(b), 'simulate').missing ?? []).map((m) => m.what).join(' / ');
  ok('a state with no start: refused', /a starting value for x/.test(say(buildProposal({ id: 'a', title: 'a', objects: [{ id: 'p', kind: 'system', label: 'p', map: { states: [{ name: 'x' }], next: { x: 'x/2' } } }] }))));
  ok('a state with no next value: refused', /y at the next step/.test(say(buildProposal({ id: 'b', title: 'b', objects: [{ id: 'p', kind: 'system', label: 'p', map: { states: [{ name: 'x', init: 1 }, { name: 'y', init: 1 }], next: { x: 'x/2' } } }] }))));
  ok('a sweep of something that is not a control: refused', /a parameter called q to sweep/.test(say(buildProposal({ id: 'c', title: 'c', objects: [{ id: 'p', kind: 'system', label: 'p', map: { states: [{ name: 'x', init: 1 }], next: { x: 'x/2' }, sweep: 'q' } }] }))));
  const div = buildProposal({ id: 'd', title: 'd', objects: [{ id: 'p', kind: 'system', label: 'p', map: { states: [{ name: 'x', init: 2 }], next: { x: 'x^2' }, steps: 100 } }] });
  const r = mapRunFor(div.model, obj(div)).run;
  ok('a map that leaves the numbers stops, and says at which step', r.stopped !== null && r.stopped < 15 && /left the numbers at step/.test(r.note));
  ok('no steps given: two hundred, and said', /200 steps, as none were given/.test(mapRunFor(buildProposal({ id: 'e', title: 'e', objects: [{ id: 'p', kind: 'system', label: 'p', map: { states: [{ name: 'x', init: 1 }], next: { x: 'x/2' } } }] }).model, { id: 'p', kind: 'system', label: 'p', map: { states: [{ name: 'x', init: 1 }], next: { x: 'x/2' } } }).run.chose.join()));
}

console.log('=== a flow’s Poincaré section: Lorenz ===');
{
  forgetMapRuns();
  const b = buildProposal({
    id: 'lorenz',
    title: 'Lorenz',
    params: [{ id: 'sigma', label: 'σ', value: 10, min: 1, max: 20 }, { id: 'rho', label: 'ρ', value: 28, min: 1, max: 40 }, { id: 'beta', label: 'β', value: 8 / 3, min: 1, max: 4 }],
    objects: [{ id: 'l', kind: 'system', label: 'Lorenz', system: { states: [{ name: 'x', init: 1 }, { name: 'y', init: 1 }, { name: 'z', init: 1 }], rhs: { x: 'sigma*(y - x)', y: 'x*(rho - z) - y', z: 'x*y - beta*z' }, dt: 0.01, steps: 5000 } }],
  });
  const views = viewsFor(b.model).map((v) => v.id);
  ok('a three-state flow offers its Poincaré section', views.includes('section:l'), views.join());
  const o = b.model.objects[0];
  const s = sectionOf(b.model, o);
  ok('the section: many crossings, each on its plane', s && s.primitives[0].at.length > 100, s?.primitives[0].at.length);
  ok('… on z at its mean, upward, said in the note', s && /crossings of z = 2\d\.\d+ \(its mean over the run\), upward/.test(s.note), s?.note);
  ok('… the points lie on the attractor’s wings, |x|, |y| < 25', s.primitives[0].at.every((p) => Math.abs(p.x) < 25 && Math.abs(p.y) < 30));
  const fr = frameFor(b.model, 'section:l');
  ok('its frame is drawn in x and y', fr && fr.axisNames[0] === 'x' && fr.axisNames[1] === 'y' && fr.primitives[0].p === 'points');
  const two = buildProposal({ id: 'osc', title: 'osc', objects: [{ id: 'o', kind: 'system', label: 'o', system: { states: [{ name: 'x', init: 1 }, { name: 'v', init: 0 }], rhs: { x: 'v', v: '0 - x' }, dt: 0.01, steps: 1000 } }] });
  ok('a flow of two states has no section to offer', !viewsFor(two.model).some((v) => v.family === 'section'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
