// test/model-hunt.test.mjs
//
// THE BUG HUNT, AS A CONTRACT. Every block here is a failure that was
// reproduced at the model layer during the Logos 2 sign-off sprint and then
// fixed; each one says what used to happen, and asserts what happens now.
// The rule they share: nothing routes as computable that the compiler will
// not draw, nothing from outside is dropped in silence, and a picture never
// says more than the numbers behind it.

import { buildProposal } from './.tmp/propose.mjs';
import { unpack } from './.tmp/unpack.mjs';
import { buildSpec, chooseRepresentation, aspectOf } from './.tmp/spec.mjs';
import { route, capabilityOf } from './.tmp/solve.mjs';
import { sanitizeModel, setParam, setTime } from './.tmp/schema.mjs';
import { scopeOf, buildObject } from './.tmp/compile.mjs';
import { segmentsOf, clipMesh } from './.tmp/sample.mjs';
import { solveSystem } from './.tmp/algebra.mjs';
import { ols } from './.tmp/estimate.mjs';
import { namesIn } from './.tmp/deps.mjs';
import { inputsOf } from './.tmp/derive.mjs';
import { openFromProposal, EMPTY_WORKSPACE, modelFor, removeObject, applyModelOps, adopt, sanitizeWorkspace, serializeWorkspace } from './.tmp/docs.mjs';
import { MODEL_OPS } from './.tmp/viz-model.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const B = (raw) => { const b = buildProposal({ id: 'r', title: 'r', params: [], ...raw }, { at: 1 }); return b.ok ? { m: unpack(b.model), b } : { m: null, b }; };
const prob = (m, id) => buildSpec(m).notes.find((n) => n.of === id)?.problem;
const curve = (def, over, extra = {}) => ({ objects: [{ id: 'c', kind: 'curve', label: 'c', definition: def, ...(over ? { over: { x: over } } : {}), ...extra }] });
const surf = (def, x, y) => ({ objects: [{ id: 's', kind: 'surface', label: 's', defs: { z: def }, over: { x, y } }] });
const mk = (f, lo, hi, n = 384) => Array.from({ length: n + 1 }, (_, i) => { const x = lo + ((hi - lo) * i) / n; const y = f(x); return Number.isFinite(y) ? { x, y, z: 0 } : null; });

console.log('=== i. a curve with a pole is not one line ===');
{
  const r = segmentsOf(mk((x) => 1 / x, -2, 2));
  ok('1/x: two strokes', r.segments.length === 2);
  ok('  one pole, at zero', r.poles.length === 1 && Math.abs(r.poles[0]) < 0.02, JSON.stringify(r.poles));
  ok('  clipped, with the count said', !!r.clipped && r.clipped.dropped > 0);
  ok('  nothing drawn beyond the clip', r.segments.flat().every((p) => Math.abs(p.y) <= r.clipped.y[1] + 1e-9));
  const t = segmentsOf(mk(Math.tan, -3, 3));
  ok('tan: three strokes, two poles', t.segments.length === 3 && t.poles.length === 2, `${t.segments.length}/${t.poles.length}`);
  ok('exp over [0,100]: one stroke, no clip — steep is not a pole', (() => { const e = segmentsOf(mk(Math.exp, 0, 100)); return e.segments.length === 1 && !e.clipped; })());
  ok('a step keeps its riser', segmentsOf(mk((x) => (x < 0 ? 0 : 1), -1, 1)).segments.length === 1);
  ok('  and so does a sign step', segmentsOf(mk((x) => (x < 0 ? -1 : 1), -1, 1)).segments.length === 1);
  ok('log over [-10,10]: one gap, at most one pole', (() => { const l = segmentsOf(mk(Math.log, -10, 10)); return l.segments.length === 1 && l.poles.length <= 1; })());
  const { m } = B(curve('1/x', [-2, 2]));
  const spec = buildSpec(m);
  ok('through the engine: two polylines', spec.primitives.filter((p) => p.p === 'polyline').length === 2);
  ok('  the box is the curve, not the spike', spec.box.y[1] < 30, JSON.stringify(spec.box.y));
  ok('  and the note says where it broke', /broken at a pole near x = 0/.test(spec.notes.find((n) => n.of === 'c')?.note ?? ''), spec.notes.find((n) => n.of === 'c')?.note);
}

console.log('\n=== ii. a surface near a pole is clipped and said ===');
{
  const { m } = B(surf('1/(x*y)', [-2, 2], [-2, 2]));
  const spec = buildSpec(m);
  ok('box height is the sheet, not the spikes', spec.box.z[1] < 40, JSON.stringify(spec.box.z));
  ok('  and the note says so', /clipped to .* near a pole/.test(spec.notes.find((n) => n.of === 's')?.note ?? ''));
  const { m: e } = B(surf('exp(x + y)', [0, 5], [0, 5]));
  ok('exp(x+y) keeps every cell', !/clipped/.test(buildSpec(e).notes.find((n) => n.of === 's')?.note ?? ''));
  const rows = [[{ x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 2 }], [{ x: 0, y: 1, z: 3 }, { x: 1, y: 1, z: 4 }]];
  ok('clipMesh leaves a tame mesh alone', clipMesh(rows).clipped === null);
}

console.log('\n=== iii. a function graph is a graph ===');
{
  const { m } = B(curve('2*x + 3', [-5, 5]));
  ok('y = f(x) fits rather than equalises', aspectOf(m) === 'fit');
  const spec = buildSpec(m);
  ok('  so the box is the domain', spec.box.x[0] > -6 && spec.box.x[1] < 6, JSON.stringify(spec.box.x));
  const { m: e } = B(curve('exp(x)', [0, 100]));
  ok('exp(x) over [0,100] is not a box 10⁴³ wide', buildSpec(e).box.x[1] < 200, JSON.stringify(buildSpec(e).box.x));
  const { m: p } = B({ objects: [{ id: 'c', kind: 'curve', label: 'c', defs: { px: 'cos(s)', py: 'sin(s)' }, over: { s: [0, 6.28] } }] });
  ok('a parametric curve keeps equal scales', aspectOf(p) === 'equal');
}

console.log('\n=== iv. nothing from outside is dropped in silence ===');
{
  const rev = sanitizeModel({ id: 'r', title: 'r', params: [], objects: [{ id: 'c', kind: 'curve', label: 'c', definition: 'x^2', over: { x: [5, -5] } }] });
  ok('a reversed window is read the way it was meant', JSON.stringify(rev.objects[0].over) === '{"x":[-5,5]}', JSON.stringify(rev.objects[0].over));
  const empty = sanitizeModel({ id: 'r', title: 'r', params: [], objects: [{ id: 'c', kind: 'curve', label: 'c', definition: 'x', over: { x: [2, 2] } }] });
  ok('an empty window is refused and recorded', !empty.objects[0].over && (empty.dropped ?? []).some((d) => /empty/.test(d)), JSON.stringify(empty.dropped));
  const us = sanitizeModel({ id: 'r', title: 'r', params: [], objects: [{ id: 'c', kind: 'curve', label: 'c', definition: 'x', over: { exper_sq: [0, 1] } }] });
  ok('a window with an underscore is kept', !!us.objects[0].over?.exper_sq);
  const long = Array.from({ length: 40 }, (_, i) => `${i + 1}*x^${i % 3}`).join(' + ') + ' + 3.14159*x';
  const cut = sanitizeModel({ id: 'r', title: 'r', params: [], objects: [{ id: 'c', kind: 'curve', label: 'c', definition: long }] });
  ok('a definition too long to keep whole is refused, not truncated', cut.objects[0].definition === undefined && (cut.dropped ?? []).some((d) => /longer than/.test(d)), JSON.stringify(cut.dropped));
  const lhs = sanitizeModel({ id: 'r', title: 'r', params: [], objects: [{ id: 'c', kind: 'curve', label: 'c', definition: 'f(x) = x^2 + 1' }] });
  ok('a stated left-hand side is stripped', lhs.objects[0].definition === 'x^2 + 1', lhs.objects[0].definition);
  ok('  and y = too', sanitizeModel({ id: 'r', title: 'r', params: [], objects: [{ id: 'c', kind: 'curve', label: 'c', definition: 'y = 2x' }] }).objects[0].definition === '2x');
  const kind = sanitizeModel({ id: 'r', title: 'r', params: [], objects: [{ id: 's', kind: 'surfce', label: 'z', definition: 'x*y' }] });
  ok('an unknown kind is recorded', kind.objects[0].kind === 'annotation' && (kind.dropped ?? []).some((d) => /does not know \(surfce\)/.test(d)), JSON.stringify(kind.dropped));
  const dup = sanitizeModel({ id: 'r', title: 'r', params: [{ id: 'k', label: 'k', value: 1, min: 0, max: 2 }, { id: 'K', label: 'K', value: 7, min: 0, max: 9 }], objects: [{ id: 'c', kind: 'curve', label: 'c', definition: 'k*x', over: { x: [0, 1] } }] });
  ok('a second control of the same name (any case) is refused and recorded', dup.params.length === 1 && scopeOf(unpack(dup)).k === 1 && (dup.dropped ?? []).length === 1, JSON.stringify(dup.dropped));
  const data = sanitizeModel({ id: 'd', title: 'd', params: [], data: { d: { label: 'd', columns: { x: [1, 2, null, 4], y: [10, 20, 30, 40] } } }, objects: [] });
  ok('a data row with a hole is dropped from every column', JSON.stringify(data.data.d.columns) === '{"x":[1,2,4],"y":[10,20,40]}', JSON.stringify(data.data.d.columns));
  ok('  and counted', (data.dropped ?? []).some((d) => /1 row of d had a missing value/.test(d)), JSON.stringify(data.dropped));
  const many = buildProposal({ id: 'many', title: 'many', params: [], objects: Array.from({ length: 80 }, (_, i) => ({ id: 'c' + i, kind: 'curve', label: 'c' + i, definition: `x + ${i}`, over: { x: [0, 1] } })) }, { at: 1 });
  ok('a proposal trimmed to its cap says so', many.ok && (many.report.dropped ?? []).some((d) => /20 of 80 proposed objects/.test(d)), JSON.stringify(many.report?.dropped));
}

console.log('\n=== v. the router claims only what the compiler draws ===');
{
  for (const k of ['plane', 'region', 'boundary', 'mesh', 'graph']) {
    const { m } = B({ objects: [{ id: 'o', kind: k, label: k, definition: 'x', meaning: 'm' }] });
    ok(`${k}: unsupported, not runnable`, !m || route(m, m.objects[0]).status === 'unsupported', m ? route(m, m.objects[0]).status : 'refused');
  }
  const { m: dist } = B({ objects: [{ id: 'o', kind: 'distribution', label: 'd', definition: 'x' }] });
  ok('a distribution with no numbers is incomplete, not "read"', route(dist, dist.objects[0]).status === 'incomplete');
  const { m: fld } = B({ objects: [{ id: 'o', kind: 'field', label: 'f', definition: 'x' }] });
  ok('a field without fx and fy is incomplete', route(fld, fld.objects[0], 'evaluate').status === 'incomplete' && /fx and fy/.test(JSON.stringify(route(fld, fld.objects[0], 'evaluate').missing)));
  const { m: sf } = B({ objects: [{ id: 's', kind: 'surface', label: 's', defs: { f: 'x*y' }, over: { x: [0, 1], y: [0, 1] } }] });
  ok('a surface written as defs.f is incomplete, naming what a surface needs', route(sf, sf.objects[0], 'evaluate').status === 'incomplete' && /z = …/.test(JSON.stringify(route(sf, sf.objects[0], 'evaluate').missing)));
  const { m: tr } = B({ objects: [{ id: 't', kind: 'trajectory', label: 't', defs: { dx: 'y' } }] });
  ok('a trajectory with only dx is incomplete', route(tr, tr.objects[0], 'simulate').status === 'incomplete' && capabilityOf(tr).level !== 'dynamic');
  const { m: eq } = B({ objects: [{ id: 'eq', kind: 'system', label: 'u', equations: { unknowns: ['a', 'b'], relations: ['a + b = 3'] } }] });
  ok('an equation system is not the integrator’s', !/system declaration/.test(prob(eq, 'eq') ?? ''), prob(eq, 'eq'));
  ok('  and says what it needs', /one more relationship/.test(prob(eq, 'eq') ?? ''));
}

console.log('\n=== vi. names bind by machine symbol, never by label ===');
{
  const { m } = B({ objects: [{ id: 'p', kind: 'variable', label: 'Price', over: { p: [0, 50] } }, { id: 'rev', kind: 'curve', label: 'rev', definition: 'p*x', over: { x: [0, 1] } }] });
  ok('an input is keyed by its machine symbol', inputsOf(m).some((q) => q.id === 'p' && q.label === 'Price'), JSON.stringify(inputsOf(m)));
  ok('  so the scope has it', 'p' in scopeOf(m));
  ok('  and the curve draws', buildSpec(m).primitives.length > 0, prob(m, 'rev'));
  const { m: lab } = B({ params: [{ id: 'rate', label: 'r', value: 0.05, min: 0, max: 1 }], objects: [{ id: 'c', kind: 'curve', label: 'c', definition: 'exp(r*x)', over: { x: [0, 10] } }] });
  const rt = route(lab, lab.objects[0], 'evaluate');
  ok('a label used as a name is incomplete, not runnable', rt.status === 'incomplete');
  ok('  and the gap says which name to write', /write rate/.test(JSON.stringify(rt.missing)), JSON.stringify(rt.missing));
  ok('  and the router and the compiler agree', !!prob(lab, 'c'));
  ok('namesIn knows the whole language', namesIn('log2(x) + cbrt(x) + sec(x) + step(x)').join() === 'x');
  ok('  and a number with an exponent is not a name', namesIn('1e3*x + 2.5e-2').join() === 'x');
  const { m: upper } = B(curve('100 - 2*P', [0, 50], {}));
  ok('`over: {P}` with P in the expression draws', (() => { const mm = B({ objects: [{ id: 'c', kind: 'curve', label: 'c', definition: '100 - 2*P', over: { P: [0, 50] } }] }).m; return buildSpec(mm).primitives.length > 0 && !prob(mm, 'c'); })());
}

console.log('\n=== vii. the solvers ===');
{
  const abs = solveSystem(['abs(x) = -3'], ['x'], {});
  ok('abs(x) = −3 is refused as nonlinear', abs.status === 'nonlinear', abs.status);
  const cap = solveSystem(['qd = 120 - 2*p', 'qs = min(3*p, 30)', 'qd = qs'], ['qd', 'qs', 'p'], {});
  ok('a capped supply is not "solved" above its cap', cap.status === 'nonlinear', JSON.stringify(cap).slice(0, 120));
  ok('a linear system still solves', solveSystem(['qd = 100 - 2*pc', 'qs = 10 + 3*pp', 'pc = pp + 2', 'qd = qs'], ['qd', 'qs', 'pc', 'pp'], {}).status === 'solved');
  const tiny = ols([1, 2, 3, 4, 6], [[1e-7], [2e-7], [3e-7], [4e-7], [5e-7]]);
  ok('a regressor in tiny units is not collinear', tiny.ok, tiny.ok ? '' : tiny.why);
  ok('  and its slope is right', tiny.ok && Math.abs(tiny.fit.terms[1].value - 1.2e7) < 1e3, tiny.ok ? String(tiny.fit.terms[1].value) : '');
  const big = ols([1, 2, 3, 4, 6], [[1e7], [2e7], [3e7], [4e7], [5e7]]);
  ok('  and in huge units the same', big.ok && Math.abs(big.fit.terms[1].value - 1.2e-7) < 1e-10);
}

console.log('\n=== viii. edits reach the declaration, and the derived objects follow ===');
{
  const made = openFromProposal(EMPTY_WORKSPACE, { id: 'sp', title: 'sp', params: [], objects: [{ id: 'w', kind: 'specification', label: 'w', estimation: { y: 'wage', x: ['educ', 'exper'], coefficients: { intercept: 1, educ: 2, exper: 3 }, over: { educ: [0, 20], exper: [0, 40] } } }] }, { at: 1 });
  const r = removeObject(made.workspace, made.workspace.docs[0].id, 'w__x0', 2);
  const after = unpack(modelFor(r.workspace.docs[0]));
  ok('removing a regressor removes its marginal', !after.objects.some((o) => o.id === 'w__response__d_educ'));
  ok('  and rebuilds the other one', after.objects.filter((o) => o.id === 'w__response__d_exper').length === 1);
  ok('  with no duplicate on a second pass', unpack(after).objects.filter((o) => o.id === 'w__response__d_exper').length === 1);

  const g = openFromProposal(EMPTY_WORKSPACE, { id: 'g', title: 'g', params: [], time: { t: 0, min: 0, max: 5 }, objects: [{ id: 'sys', kind: 'component', label: 'g', gravity: { bodies: [{ id: 'sun', mass: 1, x: 0, y: 0, vx: 0, vy: 0 }, { id: 'earth', mass: 3e-6, x: 1, y: 0, vx: 0, vy: 6.28 }, { id: 'moon', mass: 1e-8, x: 1.0026, y: 0, vx: 0, vy: 6.5 }] } }] }, { at: 1 });
  const gr = removeObject(g.workspace, g.workspace.docs[0].id, 'sys__moon', 2);
  const gafter = unpack(modelFor(gr.workspace.docs[0]));
  ok('removing a gravity body removes it from the declaration', gr.ok && !gafter.objects.find((o) => o.id === 'sys')?.gravity?.bodies?.some((b) => b.id === 'moon'));
  ok('  and from the model', !gafter.objects.some((o) => o.id === 'sys__moon'));
  ok('  and the system is reassembled smaller', gafter.objects.find((o) => o.id === 'sys')?.system?.states?.length === 8);
  const g2 = removeObject(gr.workspace, g.workspace.docs[0].id, 'sys__earth', 3);
  ok('  but not below two bodies', !g2.ok && /only two bodies/.test(g2.says));

  const mech = openFromProposal(EMPTY_WORKSPACE, { id: 'm', title: 'm', params: [{ id: 'k', label: 'k', value: 2, min: 0, max: 5 }], time: { t: 0, min: 0, max: 5 }, objects: [{ id: 'mech', kind: 'component', label: 'm', mechanism: { bodies: [{ id: 'm1', mass: 1, x0: 1 }], springs: [{ id: 'k1', between: ['m1', 'ground'], value: 'k' }] } }] }, { at: 1 });
  const add = applyModelOps(mech.workspace, [{ op: 'add', kind: 'spring', id: 'k2', between: ['m1', 'ground'] }], 2);
  ok('a spring without a stiffness is asked for, not invented', !add.changed && add.said.some((s) => /needs a stiffness/.test(s)), JSON.stringify(add.said));
  const t = setTime(unpack(modelFor(mech.workspace.docs[0])), 2);
  ok('the clock reaches what is drawn at it', t.lastChange.affected.includes('mech__m1'), JSON.stringify(t.lastChange.affected));
  ok('reset is a model op', MODEL_OPS.includes('reset'));
}

console.log('\n=== ix. a position map that fails is a problem, not a fallback ===');
{
  const { m } = B({ time: { t: 0, min: 0, max: 5 }, objects: [{ id: 't', kind: 'trajectory', label: 't', defs: { dx: 'y', dy: '0 - x', x0: '1', y0: '0', px: 'sin(theta)', py: 'cos(x)' } }] });
  const spec = buildSpec(m);
  ok('nothing is drawn', spec.primitives.length === 0);
  ok('  and the map is named', /position map px = “sin\(theta\)” would not compile/.test(prob(m, 't') ?? ''), prob(m, 't'));
}

console.log('\n=== x. the document hears from the surface, and remembers it ===');
{
  const made = openFromProposal(EMPTY_WORKSPACE, { id: 'ed', title: 'edit me', params: [{ id: 'a', label: 'a', value: 2, min: 0, max: 5 }], time: { t: 0, min: 0, max: 5 }, objects: [{ id: 'c', kind: 'curve', label: 'c', definition: 'a*x', over: { x: [0, 2] } }] }, { at: 1 });
  const doc = made.workspace.docs[0];
  let ws = made.workspace;
  let m = modelFor(doc);
  for (const v of [2.5, 3, 3.5, 4]) { m = setParam(m, 'a', v, 5); ws = adopt(ws, doc.id, m, 5); }
  const d = ws.docs[0];
  ok('a drag is one revision, not four', d.revisions.length === 2, String(d.revisions.length));
  ok('  holding where it ended', modelFor(d).params[0].value === 4);
  // the kind names the control dragged, so a drag on another control is a change of its own
  ok('  with a kind the next drag coalesces with', d.log[d.log.length - 1].kind === 'control:a', JSON.stringify(d.log));
  const ticked = setTime(m, 1.5);
  ok('the clock is not a revision', adopt(ws, doc.id, ticked, 6) === ws);
  const stored = sanitizeWorkspace(JSON.parse(JSON.stringify(serializeWorkspace(ws))));
  ok('the log kind survives storage', stored.docs[0].log[stored.docs[0].log.length - 1].kind === 'control:a', JSON.stringify(stored.docs[0].log));
  const back = sanitizeModel(JSON.parse(JSON.stringify(m)));
  ok('lastChange survives storage', back.lastChange?.what === 'a' && back.lastChange?.to === 4, JSON.stringify(back.lastChange));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
