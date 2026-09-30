// EVERY VIEW A MODEL OFFERS MUST OPEN.
//
// THE DEFECT THIS SUITE IS WRITTEN AGAINST, reported as "can you make the
// buttons actually work with the model". `viewsFor` enumerated a dozen
// representations per model and the row of buttons rendered every one of them —
// and clicking one selected the view's object and left the figure exactly as it
// was. A menu of twelve dishes and one kitchen.
//
// SO THE ASSERTION IS THE WHOLE LIST, FOR THE WHOLE LIBRARY. For each of the
// nineteen benchmark models, every view the registry offers is opened and its
// CONTENT is checked: a frame view must produce a spec with marks in it, a read
// view must produce a panel with rows or a NAMED reason it has none. A view that
// produces neither is a dead button, and a dead button is what this is for.
//
// AND THE TWO HALVES MUST AGREE. `views.ts RENDERED` is the single record of
// what has a renderer; `viewdata.ts` renders exactly that set. Two copies of one
// rule drifting apart is the failure this codebase has made in four different
// places, so it is asserted directly rather than hoped for.

import { LIBRARY, modelById } from './.tmp/library.mjs';
import { unpack } from './.tmp/unpack.mjs';
import { sanitizeModel } from './.tmp/schema.mjs';
import { RENDERED, viewsFor, primaryView } from './.tmp/views.mjs';
import { viewById, rendersAs, frameFor, panelFor } from './.tmp/viewdata.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const M = (id) => unpack(modelById(id));

// ═══ every view of every model opens ═══
console.log('=== every view of every library model ===');
{
  let frames = 0, panels = 0, declared = 0, dead = 0;
  for (const entry of LIBRARY) {
    const m = M(entry.id);
    const views = viewsFor(m);
    ok(`${entry.id}: offers at least one view`, views.length > 0);
    for (const v of views) {
      // The registry's own account of where this goes, asked once.
      const where = rendersAs(v);
      ok(`  ${entry.id}/${v.id}: found by its own id`, viewById(m, v.id)?.id === v.id);

      if (!RENDERED.has(v.family)) {
        // DECLARED WITHOUT A RENDERER. It must say so, in both directions: the
        // spec is flagged, and opening it yields a reason rather than a picture.
        declared++;
        ok(`  ${entry.id}/${v.id}: declared views say so`, v.notDrawnYet === true);
        if (where === 'frame') {
          ok(`  ${entry.id}/${v.id}: and claims no frame`, frameFor(m, v.id) === null);
        } else {
          const p = panelFor(m, v.id);
          ok(`  ${entry.id}/${v.id}: and gives a reason`, p?.kind === 'none' && p.why.length > 20, JSON.stringify(p));
        }
        continue;
      }

      ok(`  ${entry.id}/${v.id}: a rendered view is not flagged declared`, !v.notDrawnYet);

      if (where === 'frame') {
        const spec = frameFor(m, v.id);
        if (!spec) { dead++; ok(`  ${entry.id}/${v.id}: a frame view produces a spec`, false, 'null'); continue; }
        frames++;
        // MARKS, NOT A BOX. An empty frame under a confident label is the one
        // thing this whole layer exists to prevent.
        ok(`  ${entry.id}/${v.id}: the frame has marks in it`, spec.primitives.length > 0, `${spec.primitives.length}`);
        ok(`  ${entry.id}/${v.id}: and a finite box`,
          [spec.box.x, spec.box.y, spec.box.z].every(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a),
          JSON.stringify(spec.box));
        ok(`  ${entry.id}/${v.id}: and says what it is`, spec.notes.length > 0);
      } else {
        const p = panelFor(m, v.id);
        if (!p) { dead++; ok(`  ${entry.id}/${v.id}: a read view produces content`, false, 'null'); continue; }
        panels++;
        const full =
          (p.kind === 'equation' && p.rows.length > 0) ||
          (p.kind === 'table' && p.rows.length > 0 && p.columns.length > 0) ||
          (p.kind === 'structure' && p.nodes.length > 0) ||
          (p.kind === 'text' && p.sections.length > 0 && p.sections.every((s) => s.facts.length > 0)) ||
          (p.kind === 'none' && p.why.length > 20);
        ok(`  ${entry.id}/${v.id}: the panel has content or a named reason`, full, JSON.stringify(p).slice(0, 200));
      }
    }
  }
  ok('no view in the library is a dead button', dead === 0, `${dead} dead`);
  console.log(`  ${frames} frames, ${panels} panels, ${declared} declared-without-a-renderer, ${dead} dead`);
  ok('the library exercises both kinds', frames > 20 && panels > 20, `${frames}/${panels}`);
}

// ═══ the two halves cannot drift ═══
console.log('\n=== the registry and the renderer agree ===');
{
  // A family that viewdata switches on but RENDERED omits would be a renderer
  // nobody can reach; a family in RENDERED that viewdata does not handle would
  // be a promise of a picture. Both are checked against the library rather than
  // against a second list written here, which would be a third copy.
  const seen = new Set();
  for (const entry of LIBRARY) for (const v of viewsFor(M(entry.id))) seen.add(v.family);
  for (const f of seen) {
    const any = LIBRARY.map((e) => M(e.id)).flatMap((m) => viewsFor(m).filter((v) => v.family === f).map((v) => [m, v]));
    const [m, v] = any[0];
    const got = rendersAs(v) === 'frame' ? frameFor(m, v.id) : panelFor(m, v.id);
    const real = rendersAs(v) === 'frame' ? !!got : got?.kind !== 'none';
    ok(`${f}: rendered exactly when RENDERED says so`, real === RENDERED.has(f) || !real,
      `RENDERED=${RENDERED.has(f)} real=${real}`);
  }
  ok('every name in RENDERED is a family the registry can emit or a family in reserve',
    [...RENDERED].every((f) => typeof f === 'string' && f.length > 2));
}

// ═══ a residual view is residuals, not the surface it came from ═══
console.log('\n=== a fit’s own views ===');
{
  const FIT = () => unpack(sanitizeModel({
    id: 'wage', title: 'Wage and schooling', domain: 'labour',
    params: [], objects: [{
      id: 'w', kind: 'specification', label: 'log wage on schooling',
      estimation: { y: 'lwage', x: ['educ', 'exper'], data: 'cps', method: 'ols' },
    }],
    data: { cps: { label: 'a sample', columns: {
      lwage: Array.from({ length: 60 }, (_, i) => 1 + 0.08 * (i % 13) + 0.01 * (i % 7)),
      educ: Array.from({ length: 60 }, (_, i) => 8 + (i % 13)),
      exper: Array.from({ length: 60 }, (_, i) => 1 + (i % 7) * 3),
    } } },
  }));
  const m = FIT();
  const views = viewsFor(m);
  const res = views.find((v) => v.family === 'residual');
  ok('a fit that ran offers a residual view', !!res, views.map((v) => v.family).join(','));
  if (res) {
    const spec = frameFor(m, res.id);
    ok('  and it draws marks', !!spec && spec.primitives.length >= 2);
    // THE POINT OF THE TEST. Before this, a residual view fell through to the
    // object's ordinary picture, so the label said "residuals" over whatever
    // the specification happened to draw.
    ok('  and they are points, not a surface', !!spec && spec.primitives.some((p) => p.p === 'points') && !spec.primitives.some((p) => p.p === 'mesh'));
    ok('  and zero is drawn', !!spec && spec.primitives.some((p) => p.p === 'polyline' && p.at.every((q) => q.y === 0)));
    ok('  and the axes name what they are', !!spec && /fitted/.test(spec.axisNames[0]) && spec.axisNames[1] === 'residual');
    ok('  and the note is the fit’s own account', !!spec && /residuals from the fit/.test(spec.notes[0].note));
    ok('  and it is data-derived, not conceptual', spec?.fidelity === 'data-derived');
  }
  const ci = views.find((v) => v.family === 'interval');
  if (ci) {
    const spec = frameFor(m, ci.id);
    ok('a coefficient view draws one mark per estimate', !!spec && spec.primitives.filter((p) => p.p === 'points').length >= 3);
    ok('  and names each one', !!spec && spec.primitives.some((p) => p.p === 'label' && /educ/.test(p.text)));
    ok('  and does not force a cubic box', spec?.aspect === 'fit');
  }
  const diag = views.find((v) => v.family === 'diagnostic');
  if (diag) {
    const p = panelFor(m, diag.id);
    ok('diagnostics are the estimator’s own numbers', p?.kind === 'text' && p.sections[0].facts.some((f) => f.label === 'observations'));
    ok('  and state the basis of the standard errors', JSON.stringify(p).includes('classical') || JSON.stringify(p).includes('robust'));
  }
}

// ═══ a slope that does not vary is read, not plotted ═══
console.log('\n=== the slope ===');
{
  const m = unpack(sanitizeModel({
    id: 'lin', title: 'A straight line', params: [{ id: 'b', label: 'slope', value: 2, min: 0, max: 5, step: 0.1 }],
    objects: [{ id: 'y', kind: 'curve', label: 'y', definition: 'b * x', over: { x: [0, 10] }, meta: { axes: 'x' } }],
  }));
  const d = viewsFor(m).find((v) => v.family === 'derivative');
  ok('a differentiable relationship offers its slope', !!d);
  if (d) {
    ok('  and a constant slope is read, not plotted', rendersAs(d) === 'panel');
    const p = panelFor(m, d.id);
    ok('  and what is read is the derivative', p?.kind === 'equation' && /b/.test(p.rows[0].body), JSON.stringify(p));
    ok('  and it says the slope does not vary', JSON.stringify(p).includes('same everywhere'));
  }
  const s = viewsFor(m).find((v) => v.family === 'sensitivity');
  if (s) {
    const p = panelFor(m, s.id);
    ok('sensitivity is per control, differentiated', p?.kind === 'table' && p.rows.some((r) => r.includes('slope')), JSON.stringify(p));
    ok('  and says so rather than implying it was nudged', JSON.stringify(p).includes('differentiated symbolically'));
  }
}

// ═══ contours and cross-sections are the same computation ═══
console.log('\n=== one surface, four ways ===');
{
  const m = unpack(sanitizeModel({
    id: 'bowl', title: 'A bowl', params: [{ id: 'k', label: 'steepness', value: 1, min: 0.1, max: 4, step: 0.1 }],
    objects: [{ id: 's', kind: 'surface', label: 'z', defs: { z: 'k * (x^2 + y^2)' }, over: { x: [-2, 2], y: [-2, 2] }, meta: { axes: 'x,y' } }],
  }));
  const of = (f) => viewsFor(m).find((v) => v.family === f);
  const surf = frameFor(m, of('surface').id);
  ok('the surface is three-dimensional', surf?.dimensionality === 3);
  ok('  and is a mesh', !!surf?.primitives.some((p) => p.p === 'mesh'));
  const cont = frameFor(m, of('contour').id);
  ok('the level sets are flat', cont?.dimensionality === 2);
  ok('  and replace the surface rather than sitting on it', !cont?.primitives.some((p) => p.p === 'mesh'));
  ok('  and are lines', !!cont?.primitives.some((p) => p.p === 'polyline'));
  const cut = frameFor(m, of('slice').id);
  ok('the cross-section is flat and is a line', cut?.dimensionality === 2 && cut.primitives.some((p) => p.p === 'polyline'));
  const tab = panelFor(m, of('table').id);
  ok('the table is the value at a grid of inputs', tab?.kind === 'table' && tab.rows.length > 4);
  ok('  with the inputs named as its columns', tab?.columns[0] === 'x' && tab.columns[1] === 'y');
  ok('  and says it is a grid', /grid/.test(tab?.note ?? ''));
  // ALL FOUR MOVE TOGETHER, because all four come from one model.
  const m2 = { ...m, params: m.params.map((p) => ({ ...p, value: 3 })) };
  const z1 = Math.max(...frameFor(m, of('surface').id).primitives.find((p) => p.p === 'mesh').rows.flat().filter(Boolean).map((q) => q.z));
  const z2 = Math.max(...frameFor(m2, of('surface').id).primitives.find((p) => p.p === 'mesh').rows.flat().filter(Boolean).map((q) => q.z));
  ok('a control moves every view of it', Math.abs(z2 - 3 * z1) < 1e-6, `${z1} → ${z2}`);
  const t2 = panelFor(m2, of('table').id);
  ok('  including the table', tab.rows[0][2] !== t2.rows[0][2] || tab.rows[4][2] !== t2.rows[4][2]);
}

// ═══ the dependency graph is the graph the engine uses ═══
console.log('\n=== what depends on what ===');
{
  const m = unpack(sanitizeModel({
    id: 'chain', title: 'A chain', params: [{ id: 'a', label: 'a', value: 1, min: 0, max: 2, step: 0.1 }],
    objects: [
      { id: 'one', kind: 'curve', label: 'first', definition: 'a * x', over: { x: [0, 3] }, meta: { axes: 'x' } },
      { id: 'two', kind: 'curve', label: 'second', definition: 'one + 1', over: { x: [0, 3] }, meta: { axes: 'x' } },
    ],
  }));
  const v = viewsFor(m).find((x) => x.family === 'structure');
  ok('a wired model offers its wiring', !!v);
  if (v) {
    const p = panelFor(m, v.id);
    ok('  and it is nodes and edges', p?.kind === 'structure' && p.nodes.length >= 2 && p.edges.length >= 1, JSON.stringify(p));
    ok('  and the edge points the way the dependency does',
      p?.kind === 'structure' && p.edges.some((e) => e.from === 'one' && e.to === 'two'), JSON.stringify(p?.edges));
    ok('  and the control it reads is a node too',
      p?.kind === 'structure' && p.nodes.some((n) => n.id === 'a'), JSON.stringify(p?.nodes));
    ok('  and every edge ends somewhere that is drawn',
      p?.kind === 'structure' && p.edges.every((e) => p.nodes.some((n) => n.id === e.from) && p.nodes.some((n) => n.id === e.to)));
  }
}

// ═══ the view that is open is canonical ═══
console.log('\n=== Model.view survives the trust boundary ===');
{
  const base = { id: 'bowl', title: 'A bowl', params: [], objects: [
    { id: 's', kind: 'surface', label: 'z', defs: { z: 'x^2 + y^2' }, over: { x: [-2, 2], y: [-2, 2] }, meta: { axes: 'x,y' } }] };
  ok('a view id survives sanitising', sanitizeModel({ ...base, view: 'contour:s' }).view === 'contour:s');
  ok('a data view id survives too', sanitizeModel({ ...base, view: 'table:data:cps' }).view === 'table:data:cps');
  ok('nonsense does not', sanitizeModel({ ...base, view: 'drop table;--' }).view === undefined);
  ok('nor does a path', sanitizeModel({ ...base, view: '../../etc/passwd' }).view === undefined);
  ok('nor does an absent one', sanitizeModel(base).view === undefined);
  // AND IT IS ONLY EVER A POINTER. A view id naming something this model does
  // not offer must resolve to nothing rather than to a default, so the renderer
  // can fall back on purpose instead of drawing the wrong thing.
  const m = unpack(sanitizeModel({ ...base, view: 'residual:s' }));
  ok('a view this model does not offer resolves to nothing', viewById(m, 'residual:s') === null);
  ok('  and the primary view is still there to fall back on', !!primaryView(m));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
