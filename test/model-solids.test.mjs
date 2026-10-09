// Solids and formulas in the model engine (lib/model/solid.ts, formula.ts).
//
// "Model a 2 × 2 × 2 metre cube" came back as "A 3D model of a cube is being
// created…" over a refusal: "Nothing in that is written down as a relationship
// I can hold." A cone proposed as `kind: "cone"` became an annotation. This
// holds the engine's half of the fix: a shape is a formal statement, its
// dimensions are expressions a slider moves, its measures are the closed-form
// formulas computed from those dimensions — never a number the proposal typed
// in — and the same body draws in the model panel and in Live 3D.

import { sanitizeModel } from './.tmp/schema.mjs';
import { unpack } from './.tmp/unpack.mjs';
import { buildProposal, revalidate } from './.tmp/propose.mjs';
import { route, capabilityOf } from './.tmp/solve.mjs';
import { symbolTable } from './.tmp/symbols.mjs';
import { dimValues, sceneOfModel, hasSolids, shapeTrouble, SOLID_MEASURES } from './.tmp/solid.mjs';
import { evaluateFormulas, isFormula } from './.tmp/formula.mjs';
import { viewsFor, primaryView } from './.tmp/views.mjs';
import { panelFor, frameFor } from './.tmp/viewdata.mjs';
import { buildSpec } from './.tmp/spec.mjs';
import { measure } from './.tmp/scene-geometry.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const near = (a, b, tol = 1e-9) => typeof a === 'number' && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const obj = (m, id) => m.objects.find((o) => o.id === id);
const measureOf = (m, solid, key) => m.objects.find((o) => o.meta?.role === 'measure' && o.meta?.of === solid && o.meta?.measure === key);
const valueOf = (m, solid, key) => measureOf(m, solid, key)?.meta?.value;

/** "a 2 × 2 × 2 metre cube", as a proposal would write it */
const CUBE = {
  id: 'cube', title: 'A 2 m cube',
  objects: [{ id: 'cube', kind: 'cube', label: 'Cube', units: 'm', defs: { s: '2' } }],
};

/** "a nose cone 20 cm across and 40 cm tall, with sliders for the diameter and the height" */
const CONE = () => ({
  id: 'nose', title: 'Rocket nose cone',
  params: [
    { id: 'd', label: 'diameter', value: 20, min: 5, max: 40, units: 'cm' },
    { id: 'h', label: 'height', value: 40, min: 10, max: 80, units: 'cm' },
  ],
  objects: [{ id: 'nose', kind: 'solid', label: 'Nose cone', solid: { shape: 'cone', material: 'aluminium' }, defs: { d: 'd', h: 'h' } }],
});

console.log('=== a shape is read as a solid, in its own words ===');
{
  const m = sanitizeModel(CUBE);
  const o = obj(m, 'cube');
  ok('`kind: "cube"` is a solid box', o.kind === 'solid' && o.solid?.shape === 'box');
  ok('  and the reading is said, not silent', (m.dropped ?? []).some((d) => /read as a solid box/.test(d)), JSON.stringify(m.dropped));
  const short = sanitizeModel({ id: 'x', title: 'x', objects: [{ id: 'b', kind: 'solid', label: 'Ball', solid: 'ball', defs: { diameter: '1' } }] });
  ok('`solid: "ball"` is a sphere', obj(short, 'b').solid?.shape === 'sphere');
  const odd = sanitizeModel({ id: 'x', title: 'x', objects: [{ id: 'b', kind: 'solid', label: 'Blob', solid: { shape: 'blob' } }] });
  ok('a shape the engine does not draw is said, and the block is left off', !obj(odd, 'b').solid && (odd.dropped ?? []).some((d) => /does not draw/.test(d)));
  for (const [word, shape] of [['washer', 'ring'], ['truncated cone', 'frustum'], ['doughnut', 'torus'], ['disc', 'cylinder'], ['brick', 'box']]) {
    const s = sanitizeModel({ id: 'x', title: 'x', objects: [{ id: 'o', kind: 'solid', label: 'Thing', solid: word }] });
    ok(`  “${word}” is a ${shape}`, obj(s, 'o').solid?.shape === shape);
  }
}

console.log('\n=== the cube: built, measured, and not a refusal ===');
{
  const b = buildProposal(CUBE);
  ok('it builds', b.ok, b.ok ? '' : b.refusal.says);
  ok('  and the reply never says nothing is written down', b.ok && !/Nothing in that is written down/.test(b.report.says), b.ok ? b.report.says : '');
  const m = unpack(b.model);
  ok('the solid geometry solver runs it', route(m, obj(m, 'cube')).status === 'runnable' && route(m, obj(m, 'cube')).solver.id === 'solid');
  ok('its volume is 8 m³, computed', near(valueOf(m, 'cube', 'volume'), 8) && measureOf(m, 'cube', 'volume').units === 'm^3');
  ok('its surface area is 24 m²', near(valueOf(m, 'cube', 'surface_area'), 24) && measureOf(m, 'cube', 'surface_area').units === 'm^2');
  ok('  each measure is the engine’s, model-derived, with a formula', ['volume', 'surface_area'].every((k) => {
    const q = measureOf(m, 'cube', k);
    return q.provenance?.origin === 'computation' && q.fidelity === 'model-derived' && !!q.definition;
  }));
  ok('a cube’s sides are all one dimension', JSON.stringify(dimValues(m, obj(m, 'cube'))) === JSON.stringify({ w: 2, d: 2, h: 2 }));
  ok('the capability is not prose', capabilityOf(m).level !== 'structural', capabilityOf(m).level);
  ok('it is a solid', hasSolids(m) && !hasSolids(unpack(sanitizeModel({ id: 'x', title: 'x', objects: [{ id: 'z', kind: 'surface', label: 'z', definition: 'x*y', over: { x: [-1, 1], y: [-1, 1] } }] }))));
}

console.log('\n=== the nose cone: dimensions are controls, measures follow them ===');
{
  const b = buildProposal(CONE());
  ok('it builds', b.ok, b.ok ? '' : b.refusal.says);
  let m = unpack(b.model);
  const r = 10, h = 40, s = Math.hypot(r, h);
  ok('a diameter becomes a radius: r = d/2', near(dimValues(m, obj(m, 'nose')).r, 10));
  ok('volume = π r² h / 3', near(valueOf(m, 'nose', 'volume'), (Math.PI * r * r * h) / 3, 1e-12));
  ok('base area = π r²', near(valueOf(m, 'nose', 'base_area'), Math.PI * r * r, 1e-12));
  ok('surface area = π r (r + slant)', near(valueOf(m, 'nose', 'surface_area'), Math.PI * r * (r + s), 1e-12));
  ok('lateral area = π r × slant', near(valueOf(m, 'nose', 'lateral_area'), Math.PI * r * s, 1e-12));
  ok('slant height = √(r² + h²)', near(valueOf(m, 'nose', 'slant_height'), s, 1e-12));
  ok('the units follow the controls’ (cm, cm², cm³)', measureOf(m, 'nose', 'volume').units === 'cm^3' && measureOf(m, 'nose', 'base_area').units === 'cm^2' && measureOf(m, 'nose', 'slant_height').units === 'cm');
  // A SLIDER MOVE. The measures are recomputed from the new value on the next
  // unpack — the value at the last parameters is not the value.
  m = unpack({ ...b.model, params: b.model.params.map((p) => (p.id === 'h' ? { ...p, value: 60 } : p)) });
  ok('moving the height moves the volume', near(valueOf(m, 'nose', 'volume'), (Math.PI * 100 * 60) / 3, 1e-12));
  ok('  and the slant height', near(valueOf(m, 'nose', 'slant_height'), Math.hypot(10, 60), 1e-12));
  const twice = unpack(m);
  ok('unpacking twice changes nothing', JSON.stringify(twice.objects.map((o) => [o.id, o.meta?.value])) === JSON.stringify(m.objects.map((o) => [o.id, o.meta?.value])));
  ok('  and leaves one of each measure', twice.objects.filter((o) => o.meta?.role === 'measure').length === SOLID_MEASURES.cone.length);
}

console.log('\n=== the trust boundary: a proposal describes, the engine computes ===');
{
  // A number typed in as a computed value, with an engine provenance.
  const forged = buildProposal({
    ...CONE(),
    objects: [
      ...CONE().objects,
      { id: 'mass', kind: 'scalar', label: 'Mass', units: 'kg', meta: { value: 999, role: 'readout' }, provenance: { origin: 'computation' }, fidelity: 'numerically-computed' },
    ],
  });
  ok('a forged value builds nothing from it', forged.ok);
  const fm = unpack(forged.model);
  const q = symbolTable(fm).by.get('mass');
  ok('  the value is not taken', q?.value === undefined && obj(fm, 'mass').meta?.value === undefined, JSON.stringify(q));
  ok('  nor the engine’s provenance or role', obj(fm, 'mass').provenance?.origin !== 'computation' && obj(fm, 'mass').meta?.role === undefined);
  ok('  nor the fidelity that came with the claim', obj(fm, 'mass').fidelity === 'conceptual');

  // A proposal's own "volume", with a WRONG formula, that another formula names.
  const own = buildProposal({
    ...CONE(),
    params: [...CONE().params, { id: 'rho', label: 'density', value: 0.0027, min: 0.001, max: 0.01, units: 'kg/cm^3' }],
    objects: [
      ...CONE().objects,
      { id: 'volume', kind: 'scalar', label: 'Volume', units: 'cm^3', definition: '999' },
      { id: 'mass', kind: 'scalar', label: 'Mass', units: 'kg', definition: 'rho*volume' },
    ],
  });
  ok('the proposal builds', own.ok, own.ok ? '' : own.refusal.says);
  const om = unpack(own.model);
  const v = (Math.PI * 100 * 40) / 3;
  ok('its “volume” keeps its id and its label', !!obj(om, 'volume') && obj(om, 'volume').label === 'Volume');
  ok('  but is the closed form, not the 999 it proposed', near(obj(om, 'volume').meta?.value, v, 1e-12) && !/^999$/.test(obj(om, 'volume').definition), obj(om, 'volume').definition);
  ok('  and says so', /in place of the formula proposed for it/.test(obj(om, 'volume').provenance?.detail ?? ''));
  ok('a formula naming it follows: mass = ρ·V', near(obj(om, 'mass').meta?.value, 0.0027 * v, 1e-12));
  ok('no second volume is added beside it', om.objects.filter((o) => /volume/i.test(o.label)).length === 1, om.objects.filter((o) => /volume/i.test(o.label)).map((o) => o.id).join());
  ok('it stays taken over across passes', near(obj(unpack(unpack(om)), 'volume').meta?.value, v, 1e-12) && obj(unpack(om), 'volume').meta?.role === 'measure');

  // A fake engine measure, named as the engine names them.
  const fake = buildProposal({
    ...CONE(),
    objects: [...CONE().objects, { id: 'nose__volume', kind: 'scalar', label: 'Nose cone volume', definition: '1', meta: { role: 'measure', of: 'nose', measure: 'volume' } }],
  });
  const km = unpack(fake.model);
  ok('a measure proposed as the engine’s is the engine’s formula', near(obj(km, 'nose__volume').meta?.value, v, 1e-12));

  // The person's own formula is theirs.
  const mine = sanitizeModel({
    ...CONE(),
    objects: [...CONE().objects, { id: 'volume', kind: 'scalar', label: 'Volume', definition: 'pi*(d/2)^2*h/3', provenance: { origin: 'user' } }],
  });
  const mm = unpack(mine);
  ok('a formula the person wrote stands', obj(mm, 'volume').definition === 'pi*(d/2)^2*h/3' && obj(mm, 'volume').meta?.role === 'formula');
  ok('  and the engine adds no volume beside it', !measureOf(mm, 'nose', 'volume'));

  // Round trip: what comes back from storage is re-checked, not believed.
  const back = revalidate(JSON.parse(JSON.stringify(own.model)));
  ok('a stored model comes back whole', !!back && near(obj(unpack(back), 'volume').meta?.value, v, 1e-12));
}

console.log('\n=== formulas, in dependency order, and what stops one ===');
{
  const m = sanitizeModel({
    id: 'f', title: 'Formulas',
    params: [{ id: 'r', label: 'radius', value: 2, min: 0, max: 10 }],
    objects: [
      // written in the wrong order on purpose
      { id: 'c', kind: 'scalar', label: 'c', definition: 'b*2' },
      { id: 'b', kind: 'scalar', label: 'b', definition: 'a + 1' },
      { id: 'a', kind: 'scalar', label: 'a', definition: 'pi*r^2' },
      { id: 'self', kind: 'scalar', label: 'self', definition: 'self + 1' },
      { id: 'p', kind: 'scalar', label: 'p', definition: 'q + 1' },
      { id: 'q', kind: 'scalar', label: 'q', definition: 'p + 1' },
      { id: 'lost', kind: 'scalar', label: 'lost', definition: 'nowhere * 2' },
      { id: 'neg', kind: 'scalar', label: 'neg', definition: 'sqrt(-r)' },
    ],
  });
  const res = evaluateFormulas(m);
  ok('a chain evaluates in order, whatever order it was written in', near(res.get('c').value, (Math.PI * 4 + 1) * 2, 1e-12));
  ok('a formula that names itself is said', res.get('self').value === null && /itself/.test(res.get('self').why));
  ok('a loop is said', res.get('p').value === null && /itself/.test(res.get('p').why));
  ok('a name the model does not have is said', res.get('lost').value === null && /not in this model/.test(res.get('lost').why), res.get('lost').why);
  ok('no real value is said', res.get('neg').value === null && /no real value/.test(res.get('neg').why), res.get('neg').why);
  const u = unpack(m);
  ok('an unevaluated formula is conceptual, not model-derived', obj(u, 'neg').fidelity === 'conceptual' && obj(u, 'c').fidelity === 'model-derived');
  ok('the router says what one needs', route(u, obj(u, 'lost')).status !== 'runnable' && route(u, obj(u, 'c')).status === 'runnable');
  ok('an equation is not a formula', !isFormula({ id: 'e', kind: 'scalar', label: 'e', definition: 'x = 2*y' }));
}

console.log('\n=== what a solid needs, said in its own terms ===');
{
  const half = sanitizeModel({ id: 'h', title: 'h', objects: [{ id: 'c', kind: 'solid', label: 'Cone', solid: 'cone', defs: { h: '3' } }] });
  const b = buildProposal(half);
  ok('a cone with no radius still builds — it is a statement', b.ok, b.ok ? '' : b.refusal.says);
  ok('  and the reply names the radius it waits on', b.ok && /base radius/.test(b.report.says), b.ok ? b.report.says : '');
  const r = route(unpack(b.model), obj(unpack(b.model), 'c'));
  ok('  the router is not runnable, and says why', r.status !== 'runnable');
  ok('a ring whose hole is wider than it is is not a ring', /inner radius/.test(shapeTrouble('ring', { R: 1, r: 2, h: 1 }) ?? ''));
  ok('a prism needs three sides', /three sides/.test(shapeTrouble('prism', { n: 2, r: 1, h: 1 }) ?? ''));
  ok('a zero height is said', /greater than zero/.test(shapeTrouble('cylinder', { r: 1, h: 0 }) ?? ''));
}

console.log('\n=== the views a solid offers, and the ones it does not ===');
{
  const m = unpack(buildProposal(CONE()).model);
  const views = viewsFor(m);
  const p = primaryView(m);
  ok('the primary view is the solid, in 3D', p?.id === 'surface:nose' && p.variant === 'Solid' && p.dimensionality === 3, p?.id);
  ok('its measures are a view', views.some((v) => v.id === 'table:nose' && v.variant === 'Measures'));
  ok('no level sets or cross-sections of a solid', !views.some((v) => v.of === 'nose' && (v.family === 'contour' || v.family === 'slice')));
  ok('no one-cell table per measure', !views.some((v) => v.of.startsWith('nose__')));
  const t = panelFor(m, 'table:nose');
  ok('the measures table has the dimensions and the measures', t?.kind === 'table' && t.rows.some((r) => r[0] === 'base radius' && r[1] === '10') && t.rows.some((r) => /volume/.test(r[0]) && Number(r[1]) > 4188 && Number(r[1]) < 4189), JSON.stringify(t?.rows));
  ok('  and says what the body is', /a cone 20 cm across the base and 40 cm tall/.test(t?.note ?? ''), t?.note);
  const f = frameFor(m, 'surface:nose');
  ok('the frame draws marks, in 3D', !!f && f.dimensionality === 3 && f.primitives.length > 4);
  ok('  with its dimensions labelled by the controls that move them', f.primitives.some((q) => q.p === 'label' && q.text === 'h = 40 cm') && f.primitives.some((q) => q.p === 'label' && q.text === 'd = 20 cm'), JSON.stringify(f.primitives.filter((q) => q.p === 'label').map((q) => q.text)));

  // A PARAMETRIC SURFACE IS A SHAPE: no level sets, cross-sections or grid of values.
  const para = unpack(sanitizeModel({
    id: 'pc', title: 'Parametric cone',
    objects: [{ id: 'pc', kind: 'surface', label: 'Cone surface', defs: { px: 'v*cos(u)', py: 'v*sin(u)', pz: '1-v' }, over: { u: [0, 6.283], v: [0, 1] } }],
  }));
  const pv = viewsFor(para);
  ok('a parametric surface is drawn', pv.some((v) => v.id === 'surface:pc'));
  ok('  without the views of a height over a plane', !pv.some((v) => v.of === 'pc' && ['contour', 'slice', 'table'].includes(v.family)), pv.map((v) => v.id).join());
  const zf = unpack(sanitizeModel({ id: 's', title: 's', objects: [{ id: 's', kind: 'surface', label: 'Saddle', definition: 'x^2 - y^2', over: { x: [-1, 1], y: [-1, 1] } }] }));
  ok('z = f(x, y) keeps its level sets and cross-section', ['contour:s', 'slice:s', 'table:s'].every((id) => viewsFor(zf).some((v) => v.id === id)));

  // Formulas alone: their picture is the number.
  const vals = unpack(sanitizeModel({ id: 'v', title: 'v', params: [{ id: 'r', label: 'r', value: 2, min: 0, max: 5 }], objects: [{ id: 'area', kind: 'scalar', label: 'Area', definition: 'pi*r^2' }] }));
  ok('a model of formulas opens on its values', primaryView(vals)?.id === 'table:values', primaryView(vals)?.id);
  const vt = panelFor(vals, 'table:values');
  ok('  which list the formula’s value', vt?.kind === 'table' && vt.rows.some((r) => r[0] === 'Area' && near(Number(r[1]), Math.PI * 4, 1e-5)), JSON.stringify(vt?.rows));
}

console.log('\n=== the same body in Live 3D, derived, and measured the same ===');
{
  const m = unpack(buildProposal(CONE()).model);
  const scene = sceneOfModel(m);
  const n = scene.nodes[0];
  ok('one node, a cone', scene.nodes.length === 1 && n.shape === 'cone');
  ok('  in metres, from centimetres', near(n.dims.r, 0.1) && near(n.dims.h, 0.4));
  ok('  shown in the solid’s own unit', scene.unit === 'cm');
  ok('  sitting on the floor', near(n.pos[1], 0.2));
  ok('  looking like what it is made of', n.mat === 'metal' && n.material === 'aluminium');
  const live = measure(n);
  ok('Live 3D measures the same volume (m³ ↔ cm³)', near(live.volume * 1e6, valueOf(m, 'nose', 'volume'), 1e-9));
  ok('  and the same surface area (m² ↔ cm²)', near(live.area * 1e4, valueOf(m, 'nose', 'surface_area'), 1e-9));

  // Every shape, against Live 3D's own measures.
  const SHAPES = {
    box: { w: '2', d: '3', h: '4' },
    cylinder: { r: '1.5', h: '2' },
    sphere: { r: '1.2' },
    torus: { R: '2', r: '0.5' },
    capsule: { r: '0.5', h: '3' },
    prism: { n: '6', r: '1', h: '2' },
    ring: { R: '2', r: '1', h: '0.5' },
  };
  for (const [shape, defs] of Object.entries(SHAPES)) {
    const sm = unpack(sanitizeModel({ id: shape, title: shape, objects: [{ id: 'o', kind: 'solid', label: shape, units: 'm', solid: shape, defs }] }));
    const node = sceneOfModel(sm).nodes[0];
    const mm = node ? measure(node) : null;
    const vol = valueOf(sm, 'o', 'volume');
    const area = valueOf(sm, 'o', 'surface_area');
    // a ring's and a prism's outline is drawn as a polygon in Live 3D, so they agree to the polygon's accuracy
    const tol = shape === 'ring' ? 2e-2 : 1e-9;
    ok(`${shape}: the volume agrees with Live 3D`, !!mm && near(mm.volume, vol, tol), `${mm?.volume} vs ${vol}`);
    ok(`${shape}: the surface area agrees with Live 3D`, !!mm && near(mm.area, area, tol), `${mm?.area} vs ${area}`);
  }
  // the frustum draws as a revolved profile, measured numerically, its ends open
  const fr = unpack(sanitizeModel({ id: 'f', title: 'f', objects: [{ id: 'o', kind: 'solid', label: 'frustum', units: 'm', solid: 'frustum', defs: { r1: '2', r2: '1', h: '3' } }] }));
  const fm = measure(sceneOfModel(fr).nodes[0]);
  ok('frustum: the volume agrees with Live 3D’s integral', near(fm.volume, valueOf(fr, 'o', 'volume'), 1e-6), `${fm.volume} vs ${valueOf(fr, 'o', 'volume')}`);
  ok('frustum: the lateral area agrees (Live 3D leaves the ends open)', near(fm.area, valueOf(fr, 'o', 'lateral_area'), 1e-4), `${fm.area} vs ${valueOf(fr, 'o', 'lateral_area')}`);
  ok('a solid that is not whole is not drawn in Live 3D', sceneOfModel(unpack(sanitizeModel({ id: 'x', title: 'x', objects: [{ id: 'c', kind: 'solid', label: 'c', solid: 'cone', defs: { h: '1' } }] }))).nodes.length === 0);
}

console.log('\n=== the model panel draws it in 3D, at true proportions ===');
{
  const spec = buildSpec(unpack(sanitizeModel(CUBE)));
  ok('a solid is a 3D picture', spec.dimensionality === 3, String(spec.dimensionality));
  ok('  with equal axes, so a cube is a cube', spec.aspect === 'equal', String(spec.aspect));
  ok('  and axes named in its unit', spec.axisNames?.some((a) => /\(m\)|m$/.test(a)), JSON.stringify(spec.axisNames));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
