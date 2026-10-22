// The model viewer, redesigned (components/model/ModelView.tsx, Understand.tsx
// and the frame they share, components/surfaces/Surface3D.tsx).
//
// "I would completely redesign the layout for viewing models like this… make
// it more beautiful and more user friendly." What was wrong was concrete: the
// title and the workspace's own buttons overlapped, the composer covered the
// foot of the figure, a cube was a wire cage with its measurements behind it
// and the axis numbers printed through it, the views were a row of jargon, and
// on a phone the figure was a strip a finger tall. This holds what replaced it:
//
//   - a header (name, field, the ways of looking) and a side (what can be
//     moved, what it computes, what it is), with the figure between them;
//   - the figure fitted to its stage, a solid standing on its floor, shaded as
//     a body, its dimensions on the side that faces the reader;
//   - the readouts and the camera's tools in a bar under the picture, never
//     over it, and never capitalised — they carry units, and mK is not MK;
//   - the engine's own words shown to a person without source paths or
//     capitals;
//   - and two faults found on the way: a ring read from words lost its bore
//     (`R` and `r` are one name to the evaluator), and plot lines took the
//     paper theme's ink on every ground.

import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import { readFileSync } from 'node:fs';
import { ModelView } from './.tmp/ModelView.mjs';
import { unitText, valueText, plainLabel, plainText } from './.tmp/Understand.mjs';
import { solidFromWords } from './.tmp/solid-words.mjs';
import { EMPTY_WORKSPACE, modelFor, openFromProposal } from './.tmp/docs.mjs';
import { buildSpec, equalise } from './.tmp/spec.mjs';
import { solidPrimitives, FACING } from './.tmp/solid.mjs';
import { modelById } from './.tmp/library.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const near = (a, b, tol = 1e-6) => typeof a === 'number' && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const fromWords = (said) => {
  const r = solidFromWords(said);
  if (!r) return null;
  const made = openFromProposal(EMPTY_WORKSPACE, r.proposal, { at: 1 });
  return made.doc ? modelFor(made.doc) : null;
};
const ids = (m) => m.params.map((p) => p.id);
const solidOf = (m) => m.objects.find((o) => o.kind === 'solid');
const measure = (m, key) => m.objects.find((o) => o.meta?.role === 'measure' && o.meta?.measure === key);
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

console.log('=== a ring and a torus read from words keep both radii ===');
{
  // `R` and `r` are ONE name to the evaluator (one control per name, case
  // aside), so the second was dropped: a ring with no bore drew nothing, and
  // the plot fell back to an empty flat graph.
  const ring = fromWords('Model a ring with outer radius 10 cm, inner radius 6 cm and height 4 cm');
  ok('the ring is read', !!ring && !!solidOf(ring));
  ok('  both radii are controls, under names the evaluator tells apart', JSON.stringify(ids(ring)) === JSON.stringify(['R', 'r_inner', 'h']), JSON.stringify(ids(ring)));
  ok('  the bore is bound to its own control', solidOf(ring).defs.r === 'r_inner', JSON.stringify(solidOf(ring).defs));
  const spec = buildSpec(ring);
  ok('  and it is drawn: in space, as a body', spec.dimensionality === 3 && spec.primitives.some((p) => p.p === 'mesh' && p.fill), `${spec.dimensionality}D, ${spec.primitives.length} marks`);
  ok('  its volume is π(R² − r²)h, with r the bore — not the rim twice', /\(R\)\^2-\(r_inner\)\^2/.test(measure(ring, 'volume')?.definition ?? ''), measure(ring, 'volume')?.definition);

  const torus = fromWords('Model a torus with major radius 10 cm and minor radius 3 cm');
  ok('a torus keeps its tube', JSON.stringify(ids(torus)) === JSON.stringify(['R', 'r_tube']), JSON.stringify(ids(torus)));
  ok('  and its volume reads the tube, not the ring', /\(r_tube\)\^2/.test(measure(torus, 'volume')?.definition ?? ''), measure(torus, 'volume')?.definition);

  const two = fromWords('a cube 2 m on a side and a ring with outer radius 10 and inner radius 6 and thickness 4');
  ok('with several solids the names stay apart too', ['ring_2_R', 'ring_2_r_inner', 'ring_2_h'].every((x) => ids(two).includes(x)), JSON.stringify(ids(two)));

  const cyl = fromWords('Model a cylinder 20 cm across and 40 cm tall');
  ok('a shape with no such pair is named as before', JSON.stringify(ids(cyl)) === JSON.stringify(['r', 'h']), JSON.stringify(ids(cyl)));
}

console.log('=== a solid stands on its floor ===');
{
  const box = { x: [-2, 2], y: [-1, 1], z: [0, 1] };
  const centred = equalise(box);
  const standing = equalise(box, { floor: true });
  ok('geometry in general is made cubic about its centre', near(centred.z[0], -1.5) && near(centred.z[1], 2.5));
  ok('a part that stands is made cubic above its base', near(standing.z[0], 0) && near(standing.z[1], 4), JSON.stringify(standing.z));
  ok('  every side still the same length', near(standing.x[1] - standing.x[0], 4) && near(standing.y[1] - standing.y[0], 4));

  const slab = fromWords('Model a box 4 m wide, 2 m deep and 1 m tall');
  const spec = buildSpec(slab);
  const span = (r) => r[1] - r[0];
  ok('a 4 × 2 × 1 slab is drawn in a cube that rises from its floor', spec.box.z[0] <= 0 && spec.box.z[0] > -0.2, JSON.stringify(spec.box.z));
  ok('  and that cube is one scale every way', near(span(spec.box.z), span(spec.box.x), 1e-9) && near(span(spec.box.y), span(spec.box.x), 1e-9));

  const saddle = buildSpec(modelById('saddle'));
  ok('a graph is still fitted, not made to stand', saddle.aspect === 'fit');
}

console.log('=== every body is closed and drawn as faces ===');
{
  const v = { x: 0, y: 0, z: 0, w: 2, d: 2, h: 2, r: 1, R: 3, r1: 2, r2: 1, n: 6 };
  const model = { id: 'm', title: 'm', params: [], objects: [] };
  for (const shape of ['box', 'cylinder', 'cone', 'frustum', 'sphere', 'capsule', 'torus', 'prism', 'ring']) {
    const o = { id: shape, kind: 'solid', label: shape, solid: { shape }, defs: {} };
    const prims = solidPrimitives(model, o, v);
    const faces = prims.filter((p) => p.p === 'mesh' && p.fill);
    ok(`a ${shape} is a closed body of faces`, faces.length > 0, `${prims.length} marks`);
  }
  // the ends of a body of revolution are discs, not holes a reader could see into
  const o = { id: 'c', kind: 'solid', label: 'c', solid: { shape: 'cylinder' }, defs: {} };
  const mesh = solidPrimitives(model, o, v).find((p) => p.p === 'mesh');
  const radius = (row) => Math.max(...row.map((q) => Math.hypot(q.x, q.y)));
  ok('  a cylinder is capped at both ends', radius(mesh.rows[0]) < 1e-9 && radius(mesh.rows[mesh.rows.length - 1]) < 1e-9);
}

console.log('=== the measurements open on the side that faces the reader ===');
{
  // A figure in space opens turned FACING about z; toward the reader is
  // (sin, cos) across the floor and to their right is (cos, −sin).
  const near3 = (p) => p.x * Math.sin(FACING) + p.y * Math.cos(FACING);
  const right3 = (p) => p.x * Math.cos(FACING) - p.y * Math.sin(FACING);
  const model = { id: 'm', title: 'm', params: [], objects: [] };
  const dims = (shape, v) => {
    const o = { id: shape, kind: 'solid', label: shape, solid: { shape }, defs: {} };
    const prims = solidPrimitives(model, o, { x: 0, y: 0, z: 0, ...v });
    const lines = prims.filter((p) => p.p === 'polyline' && p.dashed);
    const labels = prims.filter((p) => p.p === 'label');
    return { lines, labels };
  };
  const mid = (l) => ({ x: (l.at[0].x + l.at[1].x) / 2, y: (l.at[0].y + l.at[1].y) / 2, z: (l.at[0].z + l.at[1].z) / 2 });
  const upright = (l) => Math.abs(l.at[0].z - l.at[1].z) > 1e-9;

  const box = dims('box', { w: 2, d: 2, h: 2 });
  const flat = box.lines.filter((l) => !upright(l));
  // turned this way the near faces are +x and +y: each floor dimension lies beyond one of them
  const beyond = (l) => (Math.abs(l.at[0].y - l.at[1].y) < 1e-9 ? mid(l).y > 1 : mid(l).x > 1);
  ok('a box has its two floor dimensions beyond its near faces', flat.length === 2 && flat.every((l) => beyond(l) && near3(mid(l)) > 0), JSON.stringify(flat.map(mid)));
  const tall = box.lines.find(upright);
  ok('  and its height up the left of its outline', !!tall && right3(mid(tall)) < -1.4, tall && right3(mid(tall)).toFixed(2));

  for (const [shape, v, R] of [['cylinder', { r: 1, h: 3 }, 1], ['cone', { r: 1, h: 3 }, 1], ['ring', { R: 2, r: 1, h: 1 }, 2], ['capsule', { r: 1, h: 4 }, 1]]) {
    const d = dims(shape, v);
    const across = d.lines.filter((l) => !upright(l));
    const up = d.lines.filter(upright);
    ok(`a ${shape}'s diameter is across the front of its base`, across.length >= 1 && near3(mid(across[0])) > R, across.map((l) => near3(mid(l)).toFixed(2)).join());
    ok(`  and its height beside it, left of the outline`, up.length === 1 && right3(mid(up[0])) < -R, up.map((l) => right3(mid(l)).toFixed(2)).join());
  }
  const sphere = dims('sphere', { r: 1 });
  ok('a sphere is measured up the left of its outline', sphere.lines.length === 1 && right3(mid(sphere.lines[0])) < -1);
  const torus = dims('torus', { R: 3, r: 1 });
  ok('a torus across the front of it', torus.lines.length === 1 && near3(mid(torus.lines[0])) > 4);

  // a height's label ends beside its line rather than lying across the body
  const label = (d, line) => d.labels.find((t) => Math.abs(t.at.z - mid(line).z) < 1e-9);
  ok('an upright dimension\'s label is set to end beside it', label(box, tall)?.anchor === 'end', JSON.stringify(label(box, tall)));
  ok('  a diameter\'s label is centred on its line', dims('cylinder', { r: 1, h: 3 }).labels.some((t) => t.anchor === 'middle'));
}

console.log('=== the frame ===');
// The view is a client component; rendered here it gives the first frame, at
// the frame's own starting size, with the layout effects not yet run.
const render = (model, extra = {}) => renderToStaticMarkup(h(ModelView, { model, ...extra }));
const cube = fromWords('Model a 2 × 2 × 2 metre cube');
{
  const html = render(cube);
  ok('a header with the model\'s name and what kind of thing it is', /class="sfx-head"/.test(html) && /<h3 class="sfx-title">A cube<\/h3>/.test(html) && /class="sfx-sub"[^>]*>Computational · Mathematical</.test(html), html.slice(0, 600));
  ok('  the ways of looking: the main ones side by side, the rest one menu away', /class="mv-seg"/.test(html) && />Solid</.test(html) && />Measures</.test(html) && /More views/.test(html));
  ok('the figure, and under it a bar of its own', /class="sfx-figure"/.test(html) && html.indexOf('class="sfx-stage"') < html.indexOf('class="sfx-bar"'));
  const bar = html.slice(html.indexOf('class="sfx-bar"'), html.indexOf('class="sfx-aside"'));
  ok('  the readout is in the bar, as written', /class="sfx-cap">3D · Cartesian</.test(bar), bar.slice(0, 300));
  ok('  and the camera\'s tools: put back, zoom out, zoom in, full screen', ['Put the view back', 'Zoom out', 'Zoom in', 'Full screen'].every((l) => bar.includes(`aria-label="${l}"`)));
  ok('the way to turn it is said, for a wheel and for a finger', /Drag to turn · scroll to zoom/.test(html) && /Drag to turn · pinch to zoom/.test(html));
  const side = html.slice(html.indexOf('class="sfx-aside"'));
  ok('a side: what can be moved, first', /Adjust/.test(side) && /type="range"/.test(side) && side.indexOf('Adjust') < side.indexOf('Results'));
  ok('  what it computes, as tiles in their units', /class="mv-result"/.test(side) && /Cube volume/.test(side) && /<small>m³<\/small>/.test(side) && /<small>m²<\/small>/.test(side));
  ok('  and what it is', /About/.test(side) && /Everything/.test(side));
  ok('no "changed: built" line for a model nobody has changed', !/class="mv-changed"/.test(html));

  // the room the cube stands in is fitted to the stage: no wall or floor
  // runs off it, so the numbers along its edges are never pushed behind it
  const W = 600, H = 320; // the frame's size before it has measured its stage
  const edges = [...html.matchAll(/class="eng-pane-edge" d="([^"]+)"/g)].map((m) => m[1]);
  const pts = edges.flatMap((d) => [...d.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map((m) => [+m[1], +m[2]]));
  ok('the room is drawn: two walls and a floor', edges.length === 3, String(edges.length));
  ok('  and all of it inside the stage', pts.length > 0 && pts.every(([x, y]) => x >= 0 && x <= W && y >= 0 && y <= H), JSON.stringify(pts.filter(([x, y]) => x < 0 || x > W || y < 0 || y > H).slice(0, 4)));
  ok('the solid is shaded faces, not a cage', /class="eng-faces is-solid"/.test(html));
  ok('its measurements are labelled on tags', /class="eng-tag is-quiet"/.test(html) && /s = 2 m/.test(html));
}
{
  const flat = render(modelById('point-charge'));
  ok('a flat figure is not offered the camera: no turning, no zoom', !/aria-label="Zoom in"/.test(flat) && !/Drag to turn/.test(flat) && /aria-label="Full screen"/.test(flat));
  ok('  and says what it is in the same bar', /class="sfx-cap">2D · Cartesian</.test(flat));
}
{
  const filled = render(cube, { fill: true });
  ok('filling its hole, the frame draws no card and no grip of its own', /class="sfx is-fill is-turnable"/.test(filled) && !/class="sfx-grip"/.test(filled), filled.slice(0, 200));
}

console.log('=== the engine\'s words, as a person is shown them ===');
{
  ok('a source path is not shown', plainText('Solid geometry would run it — draws a solid (lib/model/solid.ts)') === 'Solid geometry would run it — draws a solid');
  ok('an operation is named, not shouted', plainLabel('EVALUATE') === 'Evaluate' && plainLabel('SIMULATE — Orbit') === 'Simulate — Orbit');
  ok('  but a model\'s own capitals are its own', plainLabel('GDP') === 'GDP' && plainLabel('CO2') === 'CO2');
  ok('a fidelity tag reads as a sentence', plainText('CONCEPTUAL — drawn to make the idea legible') === 'Conceptual — drawn to make the idea legible' && plainText('NUMERICALLY COMPUTED — a solver ran') === 'Numerically computed — a solver ran');
  ok('units are set as they are written', unitText('m^3') === 'm³' && unitText('kg*m^-2') === 'kg·m⁻²' && unitText('') === '');
  ok('values: four figures and a real minus', valueText(-0.5) === '−0.5' && valueText(8) === '8' && valueText(1 / 3) === '0.3333' && valueText(NaN) === '—');
}

console.log('=== the stylesheets ===');
{
  const mv = read('components/model/model-view.css');
  const sx = read('components/surfaces/surfaces.css');
  const und = read('components/model/understand.css');
  ok('the figure follows the theme, never the computer\'s dark mode', !/prefers-color-scheme/.test(mv.replace(/\/\*[\s\S]*?\*\//g, '')));
  ok('the figure\'s inks are the theme\'s', /--eng-primary:\s*var\(--lg-primary/.test(und) && /--eng-tension:\s*var\(--lg-tension/.test(und));
  const cap = sx.slice(sx.indexOf('.sfx-cap {'), sx.indexOf('}', sx.indexOf('.sfx-cap {')));
  ok('a readout is never capitalised: mK is not MK', cap.length > 0 && !/text-transform/.test(cap), cap);
  ok('the bar is laid out under the figure, not floated over it', /\.sfx-bar \{/.test(sx) && !/\.sfx-tools \{[^}]*position: absolute/.test(sx));
  ok('the frame is one scrolling column when narrow', /@container sfx \(max-width: 760px\)[\s\S]*?\.sfx-body \{[^}]*overflow-y: auto/.test(sx));
  ok('full screen is a ground of its own', /\.sfx\.is-full\.is-fill,[\s\S]*?background: var\(--lg-paper/.test(sx));
  // the frame's header is raised so its views menu drops over the figure; the
  // workspace's floating row (+ View, Synthesize) must stay above it, or the
  // header takes the clicks meant for those buttons
  const rd = read('components/logos5/redesign.css');
  const rowZ = Number((rd.match(/\.l5x-canvas\.is-logic \.ws-top \{[^}]*z-index:\s*(\d+)/) || [])[1]);
  const headZ = Number((und.match(/\.sfx-head \{[^}]*z-index:\s*(\d+)/) || [])[1]);
  ok('+ View and Synthesize stay above a model\'s header', rowZ > headZ, `${rowZ} vs ${headZ}`);
  const tm = read('components/ThinkingMap.tsx');
  ok('the empty map\'s words are not drawn behind a model', /map\.nodes\.length === 0 && !\(lens === 'plot' && \(map\.viz \|\| doc\)\)/.test(tm));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
