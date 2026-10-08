// The field block in the model engine: a quantity spread over space, stepped
// through time. What a proposal may say, what is refused and why, which solver
// claims it, what the run says about itself, and what the picture is — each
// against the declaration, never against a domain.
import { buildProposal } from './.tmp/propose.mjs';
import { readPde, pdeRunFor, fieldAt, forgetPdeRuns } from './.tmp/pde.mjs';
import { buildSpec } from './.tmp/spec.mjs';
import { viewsFor } from './.tmp/views.mjs';
import { frameFor } from './.tmp/viewdata.mjs';
import { route, capabilityOf, solverTable } from './.tmp/solve.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const build = (p) => buildProposal({ id: 'f', title: 'A field', ...p });
const obj = (pde, extra = {}) => ({ id: 'f', kind: 'field', label: 'The field', pde, ...extra });
const missingOf = (b) => (b.ok ? route(b.model, b.model.objects.find((o) => o.pde), 'simulate').missing ?? [] : null);
const says = (b) => (missingOf(b) ?? []).map((m) => m.because ?? m.what).join(' / ');
const rod = (over = {}) =>
  build({
    params: [{ id: 'alpha', label: 'diffusivity', value: 0.01, min: 0.001, max: 0.1 }],
    objects: [obj({ x: [0, 1], n: 50, species: [{ name: 'temp', init: 'sin(pi*x)', D: 'alpha' }], left: { value: 0 }, right: { value: 0 }, tEnd: 2, ...over })],
  });

console.log('=== what a proposal may say, kept and bounded ===');
{
  const b = rod();
  ok('a field proposal builds', b.ok, JSON.stringify(b.refusal ?? ''));
  const p = b.model.objects[0].pde;
  ok('its extent, grid, species, ends and duration are kept', p.x[1] === 1 && p.n === 50 && p.species[0].name === 'temp' && p.species[0].D === 'alpha' && p.left.value === 0 && p.right.value === 0 && p.tEnd === 2);
  const junk = build({ objects: [obj({ x: [1, 0], species: [{ name: 'u', init: 1 }] })] });
  ok('an extent that runs backwards is not a field', !junk.ok || !junk.model.objects[0].pde);
  const edges = build({ objects: [obj({ x: [0, 1], y: [0, 1], edges: 'sideways', species: [{ name: 'u', init: 1, D: 1 }] })] });
  ok('an edge rule it does not know is dropped, then refused by name', edges.ok && !edges.model.objects[0].pde.edges && /edges: periodic, insulated or held/.test(says(edges)));
  const many = build({ objects: [obj({ x: [0, 1], species: 'abcdef'.split('').map((n) => ({ name: n, init: 0 })) })] });
  ok('five or six species are kept, to be refused with their true count', many.ok && /at most 4 species — this one has 6/.test(says(many)), says(many));
}

console.log('=== refusals, each naming what is missing ===');
{
  ok('no starting field: refused, not zeroed', /a starting field for u/.test(says(build({ objects: [obj({ x: [0, 1], species: [{ name: 'u', D: 1 }], left: { value: 0 }, right: { value: 0 }, tEnd: 1 })] }))));
  ok('an end not stated: refused, with the choices', /what happens at the right end for u: a value held there, or a flux in \(0 for insulated\)/.test(says(build({ objects: [obj({ x: [0, 1], species: [{ name: 'u', init: 1, D: 1 }], left: { value: 0 }, tEnd: 1 })] }))));
  ok('ends need not be stated for a species that does not move', missingOf(build({ objects: [obj({ x: [0, 1], species: [{ name: 'u', init: 1 }], react: { u: '-u' }, tEnd: 1 })] })).length === 0);
  ok('a negative diffusivity: refused, with the reason', /no less than zero/.test(says(build({ objects: [obj({ x: [0, 1], species: [{ name: 'u', init: 1, D: -1 }], left: { value: 0 }, right: { value: 0 }, tEnd: 1 })] }))));
  ok('a rate for a species the field does not carry: refused', /a species called w/.test(says(build({ objects: [obj({ x: [0, 1], species: [{ name: 'u', init: 1 }], react: { w: '1' }, tEnd: 1 })] }))));
  ok('an expression it cannot read: refused', /a readable starting field for u/.test(says(build({ objects: [obj({ x: [0, 1], species: [{ name: 'u', init: 'sin(x', D: 1 }], left: { value: 0 }, right: { value: 0 }, tEnd: 1 })] }))));
  ok('a species called T is time: refused, with another name suggested', /T is read as t[^]*temp or theta/.test(says(build({ objects: [obj({ x: [0, 1], species: [{ name: 'T', init: 1, D: 1 }], left: { value: 0 }, right: { value: 0 }, tEnd: 1 })] }))));
  ok('transport across a plane: refused, saying it is built for a line', /built for a line, not yet for a plane/.test(says(build({ objects: [obj({ x: [0, 1], y: [0, 1], edges: 'periodic', species: [{ name: 'u', init: 1, D: 1, flux: 'u' }], tEnd: 1 })] }))));
  ok('held edges need the value held', /the value held at the edges for u/.test(says(build({ objects: [obj({ x: [0, 1], y: [0, 1], edges: 'held', species: [{ name: 'u', init: 1, D: 1 }], tEnd: 1 })] }))));
  ok('nothing spreads and no duration: refused, rather than a length invented', /how long to run it/.test(says(build({ objects: [obj({ x: [0, 1], species: [{ name: 'u', init: 1 }], react: { u: '-u' } })] }))));
  const big = build({ objects: [obj({ x: [0, 1], y: [0, 1], n: 128, edges: 'periodic', species: [{ name: 'u', init: 1, D: 1 }], tEnd: 100 })] });
  ok('a plane too large to run under a slider: refused with the arithmetic', /cell-steps/.test(says(big)) && /coarser grid/.test(says(big)), says(big));
}

console.log('=== what the engine chooses, it says ===');
{
  const clock = build({ time: { t: 0, min: 0, max: 3 }, objects: [obj({ x: [0, 1], species: [{ name: 'u', init: 1, D: 0.1 }], left: { flux: 0 }, right: { flux: 0 } })] });
  const r1 = pdeRunFor(clock.model, clock.model.objects[0]);
  ok('no duration, a clock: it runs to the clock’s end, and says so', r1.ok && r1.run.tEnd === 3 && r1.run.chose.some((c) => /end of the model's clock/.test(c)));
  const none = build({ objects: [obj({ x: [0, 2], species: [{ name: 'u', init: 1, D: 0.5 }], left: { flux: 0 }, right: { flux: 0 } })] });
  const r2 = pdeRunFor(none.model, none.model.objects[0]);
  ok('no duration, no clock: one diffusion time L²/D = 8, said', r2.ok && Math.abs(r2.run.tEnd - 8) < 1e-12 && r2.run.chose.some((c) => /one diffusion time/.test(c)));
  const fine = rod({ n: 5000 });
  const r3 = pdeRunFor(fine.model, fine.model.objects[0]);
  ok('a grid finer than a line is given is capped, and the cap said', r3.ok && r3.run.x.length === 401 && r3.run.chose.some((c) => /the most a line is given \(5000 were asked for\)/.test(c)));
}

console.log('=== the router, the capability and the solver table ===');
{
  const b = rod();
  const o = b.model.objects[0];
  const r = route(b.model, o, 'simulate');
  ok('the field solver claims it, and it is runnable', r.status === 'runnable' && r.solver.id === 'field');
  ok('the sampler does not claim a field declared by its block', route(b.model, o, 'evaluate').status !== 'runnable');
  ok('a model with a field evolves: its capability is dynamic', capabilityOf(b.model).level === 'dynamic');
  const t = solverTable();
  ok('the solver table lists the field solver as real, and finite elements as future', t.some((s) => s.id === 'field' && s.real) && t.some((s) => s.id === 'fem' && !s.real));
}

console.log('=== the run marks its own work ===');
{
  const b = rod();
  const r = pdeRunFor(b.model, b.model.objects[0]).run;
  const exact = (x, t) => Math.exp(-0.01 * Math.PI ** 2 * t) * Math.sin(Math.PI * x);
  const err = Math.max(...r.x.map((x, i) => Math.abs(r.u[0].at(-1)[i] - exact(x, 2))));
  ok('a sine mode decays as e^{−απ²t}', err < 1e-4, err);
  ok('… and the run checks itself against the series, and says so', r.checks.some((c) => /series/.test(c.what) && c.value < 1e-3 && /sine series/.test(c.says)));
  const shut = build({ objects: [obj({ x: [0, 1], n: 60, species: [{ name: 'u', init: 'step(0.4 - x)', D: 0.05 }], left: { flux: 0 }, right: { flux: 0 }, tEnd: 1 })] });
  const rs = pdeRunFor(shut.model, shut.model.objects[0]).run;
  ok('insulated ends: what it holds is kept, and the check says it', rs.checks.some((c) => /∫u dx/.test(c.what) && c.value < 1e-12));
  ok('… and against the cosine series', rs.checks.some((c) => /cosine series/.test(c.says)));
  const leaky = build({ objects: [obj({ x: [0, 1], species: [{ name: 'u', init: 1, D: 0.05 }], left: { flux: 'sin(t)' }, right: { flux: 0 }, tEnd: 1 })] });
  ok('a flux in that varies is not called closed, however it starts and ends', !pdeRunFor(leaky.model, leaky.model.objects[0]).run.checks.some((c) => /∫u/.test(c.what)));
  const plane = build({ objects: [obj({ x: [0, 1], y: [0, 1], n: 24, edges: 'insulated', species: [{ name: 'u', init: 'exp(-((x-0.5)^2 + (y-0.5)^2)/0.02)', D: 0.01 }], tEnd: 2 })] });
  const rp = pdeRunFor(plane.model, plane.model.objects[0]).run;
  ok('a plane with insulated edges keeps its total, and says so', rp.dim === 2 && rp.checks.some((c) => /∬u dA/.test(c.what) && c.value < 1e-12));
  const blow = build({ objects: [obj({ x: [0, 1], species: [{ name: 'u', init: 1 }], react: { u: 'u^2' }, tEnd: 3 })] });
  const rb = pdeRunFor(blow.model, blow.model.objects[0]).run;
  ok('a field that leaves the numbers stops, and says when', rb.stopped?.why === 'diverged' && /left the numbers at t = /.test(rb.note));
}

console.log('=== the picture ===');
{
  const b = build({
    params: [{ id: 'alpha', label: 'diffusivity', value: 0.01, min: 0.001, max: 0.1 }],
    time: { t: 1, min: 0, max: 2, units: 's' },
    units: { temp: '°C', x: 'm' },
    objects: [obj({ x: [0, 1], n: 50, species: [{ name: 'temp', init: 'sin(pi*x)', D: 'alpha', units: '°C' }], left: { value: 0 }, right: { value: 0 }, tEnd: 2 })],
  });
  const spec = buildSpec(b.model);
  const mesh = spec.primitives.find((p) => p.p === 'mesh');
  ok('along a line: the whole run as one filled mesh, time against position, the value as its scalar', spec.dimensionality === 2 && mesh && mesh.fill && mesh.rows.length === 101 && mesh.rows[0].length === 51 && mesh.scalar.length === 101);
  ok('… rows at the times kept, columns at the points', mesh.rows[100][0].y === 2 && mesh.rows[0][50].x === 1 && mesh.rows[50][25].z === mesh.scalar[50][25]);
  const cursor = spec.primitives.find((p) => p.p === 'polyline');
  ok('… with a line at the clock’s time, at the run’s own values there', cursor && cursor.at.every((p) => p.y === 1) && Math.abs(cursor.at[25].z - Math.exp(-0.01 * Math.PI ** 2) * Math.sin(Math.PI / 2)) < 1e-3);
  ok('the axes are position, time and the quantity, in their units', spec.axisNames[0] === 'x (m)' && spec.axisNames[1] === 't (s)' && spec.axisNames[2] === 'temp (°C)', spec.axisNames.join(' | '));
  ok('a history is two kinds of quantity: the box is fitted, not squared', spec.aspect === 'fit');
  const views = viewsFor(b.model);
  ok('its views: the field first, then the same run as a surface', views[0].id === 'field:f' && views.some((v) => v.id === 'surface:f' && !v.notDrawnYet));
  ok('the surface view is the same mesh in three dimensions', frameFor(b.model, 'surface:f').dimensionality === 3 && frameFor(b.model, 'field:f').dimensionality === 2);
  ok('the note says how it was stepped and how it checked itself', /Crank–Nicolson/.test(spec.notes[0].note) && /series/.test(spec.notes[0].note));

  const plane = build({ time: { t: 1, min: 0, max: 2 }, objects: [obj({ x: [0, 1], y: [0, 2], n: 16, edges: 'periodic', species: [{ name: 'u', init: 'sin(2*pi*x)', D: 0.01 }], tEnd: 2 })] });
  const ps = buildSpec(plane.model);
  const pm = ps.primitives.find((p) => p.p === 'mesh');
  ok('across a plane: the field at the clock’s time, one row a line of cells', pm.rows.length === 16 && pm.rows[0].length === 16 && /at t = 1/.test(ps.notes[0].note));
  const run = pdeRunFor(plane.model, plane.model.objects[0]).run;
  const mid = fieldAt(run, 0, 1).u;
  ok('… interpolated between the frames kept, from the run itself', Math.abs(pm.scalar[3][5] - mid[3 * 16 + 5]) < 1e-15);
  ok('a plane’s axes are x and y, and the box keeps lengths equal', ps.axisNames[0] === 'x' && ps.axisNames[1] === 'y' && ps.aspect === 'equal');
}

console.log('=== one run per model state ===');
{
  forgetPdeRuns();
  const b = rod();
  const o = b.model.objects[0];
  const a1 = pdeRunFor(b.model, o);
  const a2 = pdeRunFor({ ...b.model, time: { t: 0.5, min: 0, max: 2 } }, o);
  ok('scrubbing the clock replays the run rather than solving again', a1 === a2 || a1.run === a2.run);
  const faster = { ...b.model, params: b.model.params.map((p) => ({ ...p, value: 0.05 })) };
  const a3 = pdeRunFor(faster, o);
  ok('a parameter moved is a new run, and it differs', a3.run !== a1.run && a3.run.u[0].at(-1)[25] < a1.run.u[0].at(-1)[25]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
