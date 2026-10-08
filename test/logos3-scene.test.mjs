// Live 3D (experimental): a scene graph built by describing it. The geometry
// is computed, not drawn from pictures; a part keeps its identity across every
// edit; what rests on what is kept as structure; and the reader turns words
// into the scene kind's own operations — so the preview a person sees is
// exactly what committing computes. Nothing here is a physical simulation,
// and the scene says so.
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { create, apply, sanitizeSpace, kindOf, currentOf, SCENE, SCENE_OPS, settle, sanitizeScene, dependents, nodeLine, objectsBlock } from './.tmp/index.mjs';
import { massOf, sceneMass } from './.tmp/scene.mjs';
import { readScene, clausesOf, readsAsDescription } from './.tmp/scene-intent.mjs';
import { sceneTurn } from './.tmp/scene-chat.mjs';
import { measure, rotationMatrix, eulerOf, rotateAbout, worldBox, localBox, profile, surfaceGrid, revolveProfile, tubePath, parsePoints, polygonArea, nacaSection, centroid, toWorld, sectionOf } from './.tmp/scene-geometry.mjs';
import { planOf } from './.tmp/scene-plan.mjs';
import { factsFrom, suggestViews } from './.tmp/surfaces.mjs';
import { singleLayout, sanitizeLayout, isOpen, addPanel } from './.tmp/tiling.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
const S = (shape, dims, extra = {}) => ({ shape, dims, pos: [0, 0, 0], rot: [0, 0, 0], scale: [1, 1, 1], ...extra });
const EMPTY = { nodes: [], next: 1, unit: 'm' };
const node = (s, id) => s.nodes.find((n) => n.id === id);
const byName = (s, name) => s.nodes.find((n) => n.name === name);
const read = (text, s = EMPTY, ctx = {}) => readScene(text, s, ctx);
const PI = Math.PI;

// ── geometry: exact where a formula exists, numerical and said to be elsewhere ──
console.log('=== volumes and areas ===');
{
  const box = measure(S('box', { w: 2, h: 3, d: 4 }));
  ok('box volume', near(box.volume, 24) && box.how === 'exact');
  ok('box area', near(box.area, 52));
  const sp = measure(S('sphere', { r: 0.5 }));
  ok('sphere', near(sp.volume, (4 / 3) * PI * 0.125) && near(sp.area, PI));
  const cy = measure(S('cylinder', { r: 1, h: 2 }));
  ok('cylinder', near(cy.volume, 2 * PI) && near(cy.area, 6 * PI));
  const co = measure(S('cone', { r: 3, h: 4 }));
  ok('cone: slant 5', near(co.volume, 12 * PI) && near(co.area, 24 * PI));
  const to = measure(S('torus', { R: 2, r: 0.5 }));
  ok('torus (Pappus)', near(to.volume, PI * PI) && near(to.area, 4 * PI * PI));
  const ca = measure(S('capsule', { r: 0.5, h: 2 }));
  ok('capsule: cylinder plus a sphere', near(ca.volume, (5 / 12) * PI) && near(ca.area, 2 * PI));
  const pr = measure(S('prism', { n: 4, r: 1, h: 1 }));
  ok('square prism of circumradius 1', near(pr.volume, 2) && near(pr.area, 4 + 4 * Math.SQRT2));
  const ri = measure(S('ring', { R: 1, r: 0.5, h: 2 }));
  ok('ring: exact annulus, not the drawn 96-gon', near(ri.volume, 1.5 * PI) && near(ri.area, 7.5 * PI));
  const st = measure(S('star', { n: 5, r: 1, ri: 0.5, h: 1 }));
  ok('star: n·r·rᵢ·sin(π/n)', near(st.volume, 5 * 0.5 * Math.sin(PI / 5)));
  const pg = measure(S('polygon', { h: 0.5 }, { exprs: { pts: '0,0;2,0;2,1;0,1' } }));
  ok('a shape from its corners', near(pg.volume, 1) && near(pg.area, 7));
  const pl = measure(S('plane', { w: 2, d: 3 }));
  ok('a plane has area and no volume', pl.volume === null && near(pl.area, 6) && /no thickness/.test(pl.note));
  const big = measure(S('box', { w: 1, h: 1, d: 1 }, { scale: [2, 2, 2] }));
  ok('an even scale scales both', near(big.volume, 8) && near(big.area, 24));
  const stretched = measure(S('box', { w: 1, h: 1, d: 1 }, { scale: [1, 2, 1] }));
  ok('an uneven stretch: volume yes, area not a formula — and said', near(stretched.volume, 2) && stretched.area === null && /stretched/.test(stretched.note));
}

console.log('=== shapes from expressions, computed ===');
{
  const cyl = measure(S('revolve', { y0: 0, y1: 2, n: 64 }, { exprs: { r: '1' } }));
  ok('revolving r = 1 gives a cylinder', near(cyl.volume, 2 * PI, 1e-9) && near(cyl.area, 4 * PI, 1e-6) && cyl.how === 'numerical');
  const cone = measure(S('revolve', { y0: 0, y1: 3, n: 64 }, { exprs: { r: 'y' } }));
  ok('revolving r = y gives a cone: 9π', near(cone.volume, 9 * PI, 1e-9), cone.volume);
  ok('… and its side 9√2π', near(cone.area, 9 * Math.SQRT2 * PI, 1e-6), cone.area);
  const vase = revolveProfile(S('revolve', { y0: 0, y1: 4, n: 100 }, { exprs: { r: '1 + 0.3*sin(3*y)' } }));
  ok('the profile is sampled from the expression', vase.pts.length === 101 && near(vase.pts[50][0], 1 + 0.3 * Math.sin(6)));
  ok('negative r is not a radius: clipped, and counted', revolveProfile(S('revolve', { y0: -1, y1: 1, n: 10 }, { exprs: { r: 'y' } })).clipped === 5);
  const helix = S('tube', { t0: 0, t1: 2 * PI, r: 0.1, n: 400 }, { exprs: { x: 'cos(t)', y: 'sin(t)', z: 't' } });
  const hm = measure(helix);
  const L = 2 * PI * Math.SQRT2;
  ok('a helix tube: πr² times its length', near(hm.volume, PI * 0.01 * L, 1e-4), hm.volume);
  const path = tubePath(helix);
  ok('the curve is in math axes, z up: (x, y, z) → (x, z, −y)', near(path[100][0], Math.cos(PI / 2)) && near(path[100][1], PI / 2) && near(path[100][2], -Math.sin(PI / 2)));
  const flat = surfaceGrid(S('surface', { x0: -1, x1: 1, y0: -2, y1: 2, n: 16 }, { exprs: { f: '0' } }));
  ok('z = 0 over 2 × 4 has area 8', near(flat.area, 8));
  const tilted = surfaceGrid(S('surface', { x0: 0, x1: 1, y0: 0, y1: 1, n: 8 }, { exprs: { f: 'x' } }));
  ok('z = x over the unit square has area √2', near(tilted.area, Math.SQRT2));
  const saddle = surfaceGrid(S('surface', { x0: -1, x1: 1, y0: -1, y1: 1, n: 10 }, { exprs: { f: 'x^2 - y^2' } }));
  ok('every vertex is f evaluated: (x, f(x,y), −y)', near(saddle.positions[1], 0) && near(saddle.positions[0 * 3 + 1], 1 - 1) && saddle.minY === -1 && saddle.maxY === 1);
  const holed = surfaceGrid(S('surface', { x0: -1, x1: 1, y0: 0, y1: 1, n: 8 }, { exprs: { f: 'log(x)' } }));
  ok('where f is undefined the surface has holes, counted, not invented', holed && holed.holes > 0 && holed.indices.length > 0);
  ok('a surface that is nowhere defined is no surface', surfaceGrid(S('surface', { x0: -2, x1: -1, y0: 0, y1: 1, n: 4 }, { exprs: { f: 'sqrt(x)' } })) === null);
  ok('corners read as numbers, or not at all', parsePoints('0,0; 1,0; 0,1')?.length === 3 && parsePoints('0,0; 1,0') === null && parsePoints('a,b;1,2;3,4') === null);
  ok('a profile is counter-clockwise, area positive', polygonArea(profile(S('polygon', { h: 1 }, { exprs: { pts: '0,0;0,1;1,1;1,0' } })).outer) > 0);
}

console.log('=== orientation: the same XYZ Euler as Three.js ===');
{
  const deg = Math.PI / 180;
  let same = true;
  let round = true;
  for (let i = 0; i < 60; i++) {
    const r = [((i * 37) % 170) - 85, ((i * 53) % 170) - 85, ((i * 71) % 340) - 170];
    const ours = rotationMatrix(r);
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(r[0] * deg, r[1] * deg, r[2] * deg, 'XYZ')).elements;
    // three is column-major
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) if (!near(ours[a][b], m[b * 4 + a], 1e-12)) same = false;
    const back = rotationMatrix(eulerOf(ours));
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) if (!near(back[a][b], ours[a][b], 1e-9)) round = false;
  }
  ok('rotationMatrix is THREE.Euler XYZ, entry for entry', same);
  ok('eulerOf inverts it', round);
  const turned = rotateAbout([10, 20, 30], 'x', 25);
  const want = new THREE.Matrix4().makeRotationX(25 * deg).multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(10 * deg, 20 * deg, 30 * deg, 'XYZ'))).elements;
  const got = rotationMatrix(turned);
  ok('a turn about a world axis composes on the left', [0, 1, 2].every((a) => [0, 1, 2].every((b) => near(got[a][b], want[b * 4 + a], 1e-9))));
  ok('turns about one axis add, and stay readable', rotateAbout([0, 200, 0], 'y', 25).join() === '0,-135,0' && rotateAbout([0, 0, 0], 'z', 90).join() === '0,0,90');
  const lying = worldBox(S('box', { w: 2, h: 1, d: 1 }, { rot: [0, 0, 90] }));
  ok('a box turned 90° about z: its width becomes its height', near(lying.max[0] - lying.min[0], 1) && near(lying.max[1] - lying.min[1], 2));
  const lb = localBox(S('torus', { R: 1, r: 0.25 }));
  ok('a torus lies flat', near(lb.max[1], 0.25) && near(lb.max[0], 1.25));
}

// ── the scene kind: identity, support, history ─────────────────────
const space0 = { objs: [] };
const made = create(space0, 'scene', EMPTY, { name: 'Scene', origin: 'person' });
ok('a scene is an object of thought', made && made.obj.kind === 'scene' && made.obj.name === 'Scene' && kindOf('scene') === kindOf('scene'));
let space = made.space;
const id = made.obj.id;
const step = (op, args) => {
  const r = apply(space, id, op, args, { by: 'person', at: 1 });
  if (r.ok) space = r.space;
  return r;
};
const now = () => currentOf(space.objs.find((o) => o.id === id));

console.log('=== a part keeps its identity, and what rests on it follows ===');
{
  ok('add a box', step('add', { shape: 'box', dims: 'w=2;h=1;d=1' }).ok);
  const box = now().nodes[0];
  ok('ids come from a counter', box.id === 'box1' && now().next === 2);
  ok('it stands on the floor', near(box.pos[1], 0.5) && box.on === 'ground');
  ok('add a sphere on it', step('add', { shape: 'sphere', dims: 'r=0.25', place: 'on=box1;side=top;gap=0' }).ok);
  const sp = node(now(), 'sphere2');
  ok('it rests on the box', sp.on === 'box1' && near(sp.pos[1], 1.25));
  const taller = step('set', { id: 'box1', key: 'h', value: 3 });
  ok('the box grows', taller.ok && near(node(now(), 'box1').dims.h, 3));
  ok('… and the sphere stays on it', near(node(now(), 'sphere2').pos[1], 3.25));
  const moved = step('move', { id: 'box1', dx: 2, dy: 0, dz: 0 });
  ok('move the box: the sphere goes with it', moved.ok && near(node(now(), 'sphere2').pos[0], 2));
  ok('… and the step says so', /sphere moved with it/.test(moved.step.note ?? ''), moved.step.note);
  ok('dependents', dependents(now(), 'box1').join() === 'sphere2');
  ok('a part cannot rest on what rests on it', !step('place', { id: 'box1', target: 'sphere2', side: 'top', gap: 0 }).ok);
  const removed = step('remove', { id: 'box1' });
  ok('remove the box: the sphere stays where it was, resting on nothing', removed.ok && node(now(), 'sphere2').on === undefined && near(node(now(), 'sphere2').pos[1], 3.25));
  ok('… said', /resting on nothing/.test(removed.step.note ?? ''));
  step('add', { shape: 'cone' });
  ok('an id is never reused', node(now(), 'cone3') && !node(now(), 'box1') && now().next === 4);
  ok('a default size is marked as one', node(now(), 'cone3').assumed?.join() === 'r,h' && /defaults used/.test(space.objs[0].steps.at(-1).note ?? ''));
  step('place', { id: 'sphere2', target: 'ground', side: 'ground', gap: 0 });
  ok('put back on the floor', near(node(now(), 'sphere2').pos[1], 0.25) && node(now(), 'sphere2').on === 'ground');
  const gz = step('transform', { id: 'cone3', x: 1, y: 2, z: -1, rx: 0, ry: 45, rz: 0, sx: 1, sy: 2, sz: 1 });
  ok('a gizmo drag sets the transform exactly', gz.ok && node(now(), 'cone3').pos.join() === '1,2,-1' && node(now(), 'cone3').scale[1] === 2);
  ok('… and lifting it off the floor leaves it standing free', node(now(), 'cone3').on === undefined);
  ok('a transform must be nine numbers', !step('transform', { id: 'cone3', x: 1 }).ok);
  ok('a scale must be positive', !step('scale', { id: 'cone3', sx: 0 }).ok);
  ok('nonsense dimensions are refused, not clamped', !step('set', { id: 'sphere2', key: 'r', value: -1 }).ok && !step('set', { id: 'sphere2', key: 'w', value: 1 }).ok);
  ok('a plane has no height to set', !step('add', { shape: 'plane' }).ok === false && !step('fit', { id: 'plane4', axis: 'y', size: 2 }).ok);
  const copies = step('copy', { id: 'sphere2', count: 3, dx: 1 });
  ok('copies are new parts with new ids', copies.ok && ['sphere5', 'sphere6', 'sphere7'].every((k) => node(now(), k)));
  ok('… named as copies', ['sphere 2', 'sphere 3', 'sphere 4'].every((nm) => byName(now(), nm)));
}

console.log('=== a stored history is re-computed, not believed ===');
{
  const stored = JSON.parse(JSON.stringify(space));
  const back = sanitizeSpace(stored);
  const o = back.objs[0];
  ok('every step survives a round trip', o.steps.length === space.objs[0].steps.length && o.states.length === space.objs[0].states.length);
  ok('… its long arguments too (argLimits)', o.steps[1].args.place === 'on=box1;side=top;gap=0');
  ok('… and the state it ends in is the one computed', SCENE.same(currentOf(o), now()));
  const forged = JSON.parse(JSON.stringify(space));
  forged.objs[0].states[3].nodes[0].pos[1] = 9;
  const cut = sanitizeSpace(forged).objs[0];
  ok('a state that does not follow from its step cuts the history there', cut.states.length === 3, cut.states.length);
  const badArgs = JSON.parse(JSON.stringify(space));
  badArgs.objs[0].steps[0].args.dims = 'x'.repeat(500);
  ok('an argument past the kind’s limit is not read', sanitizeSpace(badArgs).objs[0].states.length === 1);
  ok('a node with a broken shape is dropped on load', sanitizeScene({ nodes: [{ id: 'box1', shape: 'box', dims: { w: 1, h: -2, d: 1 } }], next: 2 }).nodes.length === 0);
  ok('a support that is not there is no support', sanitizeScene({ nodes: [{ id: 'box1', shape: 'box', dims: { w: 1, h: 1, d: 1 }, on: 'ghost7' }], next: 2 }).nodes[0].on === undefined);
}

console.log('=== a long history survives storage ===');
{
  let sp = create({ objs: [] }, 'scene', EMPTY, { name: 'Long', origin: 'person' }).space;
  const lid = sp.objs[0].id;
  for (let t = 0; t < 45; t++) sp = apply(sp, lid, 'add', { shape: t % 2 ? 'box' : 'sphere', at: `${t},0,0` }, { by: 'person', at: 1 }).space;
  const o = sp.objs[0];
  ok('a scene keeps fewer states than a matrix — each is the whole scene', o.states.length === 24 && o.trimmed === 46 - 24);
  const back = sanitizeSpace(JSON.parse(JSON.stringify(sp))).objs[0];
  ok('forty-five parts, reloaded, are forty-five parts', currentOf(back).nodes.length === 45 && back.states.length === 24, `${currentOf(back).nodes.length} parts, ${back.states.length} states`);
  ok('… and the oldest kept state is still undoable to', SCENE.same(back.states[0], o.states[0]));
}

console.log('=== the scene says what it is, and what it is not ===');
{
  const facts = SCENE.facts(now(), { guarded: false });
  ok('a geometric preview, nothing simulated', /geometric preview/.test(facts[0]) && /nothing in it is loaded, stressed or simulated/.test(facts[0]) && /mass only as density × volume/.test(facts[0]));
  const text = SCENE.text(now());
  ok('each part written out with its exact size and support', /sphere2 “sphere”: sphere, radius 0\.25 m/.test(text) && /rests on the floor/.test(text), text);
  ok('… once: the facts do not repeat the parts', !facts.some((f) => /sphere2 “sphere”/.test(f)));
  ok('the parts as text carry no volumes, whoever reads them', !/volume/.test(text));
  ok('volumes as facts when not guarded', facts.some((f) => /^volumes: .*sphere 0\.06545 m³/.test(f)), JSON.stringify(facts));
  const guarded = SCENE.facts(now(), { guarded: true });
  ok('guarded: no volumes, and that is said', !guarded.some((f) => /volume/.test(f) && /m³/.test(f)) && guarded.some((f) => /withheld/.test(f)));
  const pf = SCENE.partFacts(now(), 'sphere2');
  ok('a part’s own facts: its area', pf.some((f) => /surface area 0\.7854 m²/.test(f)));
  ok('the facts are what the conversation reads, in its unit', /at \(2, 0\.25, 0\) m/.test(nodeLine(now(), node(now(), 'sphere2'))), nodeLine(now(), node(now(), 'sphere2')));
}

// ── reading descriptions ────────────────────────────────────────────
console.log('=== a description becomes operations ===');
{
  const r = read('a red box 2 m wide, 1 tall and 3 deep, then put a blue sphere of radius 0.5 on top of it');
  const [b, s] = r.preview.nodes;
  ok('two parts', r.preview.nodes.length === 2 && r.ops.length === 2);
  ok('the box’s sizes, with the clause’s unit carried', b.dims.w === 2 && b.dims.h === 1 && b.dims.d === 3);
  ok('its colour', b.color === '#d43f3a');
  ok('the radius is the sphere’s, not a gap', s.dims.r === 0.5 && s.on === b.id && near(s.pos[1], 1.5));
  ok('nothing skipped', r.clauses.every((c) => c.understood && !c.skipped && !c.problem), JSON.stringify(r.clauses));
  ok('the preview is what committing computes', (() => {
    let sp = create({ objs: [] }, 'scene', EMPTY, { name: 'S', origin: 'person' }).space;
    for (const o of r.ops) sp = apply(sp, sp.objs[0].id, o.op, o.args, { by: 'person', at: 1 }).space;
    return SCENE.same(currentOf(sp.objs[0]), r.preview);
  })());
  ok('changes are reported by id', r.changes.added.join() === 'box1,sphere2' && !r.changes.changed.length);
  ok('clauses split on "then", commas and "and" before a new thing — not inside sizes', clausesOf('a box 2 m wide and 1 m tall, then a cone and a sphere').length === 3);
}

console.log('=== sizes, units, counts, arrangements ===');
{
  ok('cm', read('a box 50 cm wide').preview.nodes[0].dims.w === 0.5);
  ok('inches', near(read('a cylinder 10 inches tall').preview.nodes[0].dims.h, 0.254));
  ok('a × b × c is width × depth × height, and the note says so', (() => {
    const r = read('a box 2 x 1 x 0.1 m');
    const n = r.preview.nodes[0];
    return n.dims.w === 2 && n.dims.d === 1 && n.dims.h === 0.1 && r.clauses[0].notes.some((x) => /width × depth × height/.test(x));
  })());
  ok('a cube has equal sides', read('a cube with side 2').preview.nodes[0].dims.w === 2 && read('a cube with side 2').preview.nodes[0].dims.h === 2);
  ok('diameter halves', read('a sphere 3 m in diameter').preview.nodes[0].dims.r === 1.5);
  ok('a hexagonal prism has six sides', read('a hexagonal prism 2 m tall').preview.nodes[0].dims.n === 6);
  ok('a pentagon is a five-sided prism', read('a pentagon').preview.nodes[0].dims.n === 5);
  ok('a torus with a tube radius', (() => { const n = read('a torus with ring radius 2 and tube radius 0.5').preview.nodes[0]; return n.dims.R === 2 && n.dims.r === 0.5; })());
  const row = read('a row of 5 cubes');
  ok('a row of five', row.preview.nodes.length === 5 && near(row.preview.nodes[4].pos[0], 5) && row.preview.nodes.every((n) => n.on === 'ground'));
  ok('… with the spacing said, since none was given', row.clauses[0].notes.some((x) => /spaced 1\.25 m apart/.test(x)));
  ok('spaced as asked', near(read('3 spheres spaced 2 m apart').preview.nodes[2].pos[0], 4));
  ok('along z', near(read('4 cubes along z spaced 3').preview.nodes[3].pos[2], 9));
  const stack = read('stack 4 boxes');
  ok('a stack rests each on the one below', stack.preview.nodes.length === 4 && stack.preview.nodes[3].on === stack.preview.nodes[2].id && near(stack.preview.nodes[3].pos[1], 3.5));
  ok('a tower is a stack', read('a tower of 3 cubes').preview.nodes[2].on === 'box2');
  const ring = read('a ring of 8 spheres of radius 3');
  ok('a ring of eight at radius 3', ring.preview.nodes.length === 8 && ring.preview.nodes.every((n) => near(Math.hypot(n.pos[0], n.pos[2]), 3)));
  const grid = read('a grid of 9 cubes');
  ok('a grid of nine is three by three', grid.preview.nodes.length === 9 && new Set(grid.preview.nodes.map((n) => n.pos[2])).size === 3 && new Set(grid.preview.nodes.map((n) => n.pos[0])).size === 3);
  ok('too many is refused, not truncated', !!read('a row of 60 cubes').clauses[0].problem && read('a row of 60 cubes').preview.nodes.length === 0);
}

console.log('=== placements ===');
{
  const base = read('a box').preview;
  const left = read('a cone 2 m left of the box', base).preview;
  const cone = left.nodes[1];
  ok('a distance before a direction is a gap', near(cone.pos[0], -0.5 - 2 - 0.5), cone.pos[0]);
  const on = read('a sphere on the box', base).preview.nodes[1];
  ok('on is resting', on.on === 'box1' && near(on.pos[1], 1.5));
  const above = read('a sphere above the box', base);
  ok('above is hovering, with the gap said', above.preview.nodes[1].on === undefined && near(above.preview.nodes[1].pos[1], 1 + 1 + 0.5) && above.clauses[0].notes.some((x) => /1 m gap/.test(x)));
  ok('behind is −z, in front +z', read('a cube behind the box', base).preview.nodes[1].pos[2] < 0 && read('a cube in front of the box', base).preview.nodes[1].pos[2] > 0);
  ok('at (x, y, z)', read('a sphere at (1, 2, 3)').preview.nodes[0].pos.join() === '1,2,3');
  ok('at (x, z) is on the floor', (() => { const n = read('a sphere at (1, 3)').preview.nodes[0]; return n.pos[0] === 1 && n.pos[2] === 3 && near(n.pos[1], 0.5) && n.on === 'ground'; })());
  const nothing = read('a sphere on the dragon', base);
  ok('a place that is not there is a problem, and nothing is made', !!nothing.clauses[0].problem && nothing.preview.nodes.length === 1);
}

console.log('=== shapes by equation stand at their own coordinates ===');
{
  const sf = read('a surface z = sin(x)*cos(y) for x from -3 to 3 and y from -2 to 2');
  const n = sf.preview.nodes[0];
  ok('the surface is f, read as an expression', n.shape === 'surface' && n.exprs.f === 'sin(x)*cos(y)' && n.dims.x0 === -3 && n.dims.x1 === 3 && n.dims.y1 === 2);
  ok('… at the origin, not lifted onto the floor', n.pos.join() === '0,0,0' && n.on === undefined);
  const tube = read('a tube x = cos t, y = sin t, z = t/4 for t from 0 to 12');
  ok('a tube along a curve', tube.preview.nodes[0].shape === 'tube' && tube.preview.nodes[0].dims.t1 === 12 && tube.preview.nodes[0].exprs.z === 't/4');
  const rev = read('revolve r = 1 + 0.3 sin(3y) for y from 0 to 4');
  ok('a revolved shape spans its own heights', rev.preview.nodes[0].shape === 'revolve' && near(rev.preview.nodes[0].pos[1], 2) && near(worldBox(rev.preview.nodes[0]).min[1], 0));
  ok('an expression that is not one is refused', !!read('a surface z = sin(').clauses[0].problem);
  const poly = read('a shape with corners (0,0) (2,0) (2,1) (0,1)');
  ok('a shape from corners, extruded', poly.preview.nodes[0].shape === 'polygon' && near(measure(poly.preview.nodes[0]).volume, 2 * 0.2));
}

console.log('=== edits, against what is there ===');
{
  let s = read('a red box and a blue sphere on top of it').preview;
  const r1 = read('move the box left 2', s);
  ok('move: an edit, not a new box', r1.preview.nodes.length === 2 && near(node(r1.preview, 'box1').pos[0], -2) && r1.clauses[0].understood);
  ok('… and the sphere goes with it', near(node(r1.preview, 'sphere2').pos[0], -2));
  s = r1.preview;
  const r2 = read('make the sphere twice as big', s);
  ok('twice as big', node(r2.preview, 'sphere2').scale.join() === '2,2,2' && near(node(r2.preview, 'sphere2').pos[1], 2));
  const r3 = read('paint it green', s, { last: 'sphere2' });
  ok('it = the last part changed', node(r3.preview, 'sphere2').color === '#3a9a52' && node(r3.preview, 'box1').color === '#d43f3a');
  const r3b = read('paint it green', s, { last: 'sphere2', selected: 'box1' });
  ok('… unless a part is selected: then it is that one', node(r3b.preview, 'box1').color === '#3a9a52');
  const r4 = read('copy the box 3 times to the right', s);
  ok('copies, stepping by the part’s own size', r4.preview.nodes.length === 5 && near(node(r4.preview, 'box5').pos[0], -2 + 3 * 1.25));
  const r5 = read('remove the sphere', s);
  ok('remove', r5.preview.nodes.length === 1 && r5.changes.removed.join() === 'sphere2');
  const r6 = read('rotate the box 45 degrees', s);
  ok('rotate about y by default', node(r6.preview, 'box1').rot.join() === '0,45,0');
  ok('about an axis', node(read('rotate it 90 degrees about x', s, { last: 'box1' }).preview, 'box1').rot.join() === '90,0,0');
  ok('upside down', node(read('turn the box upside down', s).preview, 'box1').rot[0] === 180);
  ok('turn it red is a colour, not a rotation', node(read('turn the box yellow', s).preview, 'box1').color === '#e8c53a' && node(read('turn the box yellow', s).preview, 'box1').rot.join() === '0,0,0');
  ok('make it 2 m tall', node(read('make the box 2 m tall', s).preview, 'box1').dims.h === 2);
  ok('taller by', node(read('make the box taller by 0.5', s).preview, 'box1').dims.h === 1.5);
  ok('taller and wider', (() => { const n = node(read('make the box taller and wider', s).preview, 'box1'); return near(n.dims.h, 1.25) && near(n.dims.w, 1.25); })());
  ok('set the radius of the sphere', node(read('set the radius of the sphere to 2', s).preview, 'sphere2').dims.r === 2);
  ok('a possessive', node(read("the box's height to 3", s).preview, 'box1').dims.h === 3 && node(read('make its radius 0.75', s, { last: 'sphere2' }).preview, 'sphere2').dims.r === 0.75);
  ok('glass', node(read('make the sphere glass', s).preview, 'sphere2').mat === 'glass' && node(read('make the sphere glass', s).preview, 'sphere2').opacity < 1);
  ok('rename', node(read('call the box table', s).preview, 'box1').name === 'table');
  ok('a renamed part answers to its name', (() => { const t = read('call the box table', s).preview; return node(read('move the table up 1', t).preview, 'box1').pos[1] > 1; })());
  ok('put an existing part on another', (() => { const p = read('a cone', s).preview; const q = read('put the cone on the sphere', p).preview; return node(q, 'cone3').on === 'sphere2'; })());
  ok('lift: off its support', node(read('lift the sphere 1 m', s).preview, 'sphere2').on === undefined);
  ok('move to a point', node(read('move the sphere to (3, 0, 1)', s).preview, 'sphere2').pos.join() === '3,0,1');
  ok('scale by a factor', node(read('scale the box by 3', s).preview, 'box1').scale.join() === '3,3,3');
  ok('stack the copies', (() => { const p = read('3 cubes').preview; const q = read('stack them', p, {}).preview; return node(q, 'box3').on === 'box2' && node(q, 'box2').on === 'box1'; })());
  ok('clear', read('clear the scene', s).preview.nodes.length === 0);
  ok('the display unit', read('use cm', s).preview.unit === 'cm' && read('a box 20 wide', { ...s, unit: 'cm' }).preview.nodes[2].dims.w === 0.2);
}

console.log('=== which part is meant ===');
{
  const s = read('a box 1 m wide, a box 3 m wide, a red sphere, a blue sphere').preview;
  ok('the big box is the bigger one', node(read('paint the big box red', s).preview, 'box2').color === '#d43f3a');
  ok('the small box', node(read('paint the small box red', s).preview, 'box1').color === '#d43f3a');
  ok('the second sphere', node(read('paint the second sphere green', s).preview, 'sphere4').color === '#3a9a52');
  ok('the red one', node(read('move the red one up 2', s).preview, 'sphere3').on === undefined);
  ok('all the spheres', read('paint all the spheres black', s).preview.nodes.filter((n) => n.color === '#1e1e1e').length === 2);
  ok('a plural noun is all of them', read('paint the boxes gold', s).preview.nodes.filter((n) => n.mat === 'metal').length === 2);
  ok('by name with its number', node(read('remove box 2', s).preview, 'box2') === undefined);
  const amb = read('paint the box green', s);
  ok('two match: the most recent, and that is said', node(amb.preview, 'box2').color === '#3a9a52' && amb.clauses[0].notes.some((x) => /2 parts match/.test(x)));
  ok('two match and one is selected: that one', node(read('paint the box green', s, { selected: 'box1' }).preview, 'box1').color === '#3a9a52');
  ok('nothing by that name is a problem, not a guess', /nothing called “cone”/.test(read('move the cone left', s).clauses[0].problem ?? ''));
}

console.log('=== nowhere given: beside what is there ===');
{
  const base = read('a box 2 m wide').preview;
  const next = read('a cone', base);
  const cone = next.preview.nodes[1];
  ok('a new part with no place goes beside the scene, not inside it', worldBox(cone).min[0] >= worldBox(base.nodes[0]).max[0] - 1e-9 && cone.on === 'ground', JSON.stringify(cone.pos));
  ok('… and that is said', next.clauses[0].notes?.some((x) => /beside what is already there/.test(x)));
  const ring = read('a ring of 6 spheres', base).preview;
  ok('a ring with no place stands clear of the scene too', ring.nodes.slice(1).every((n) => worldBox(n).min[0] >= worldBox(base.nodes[0]).max[0] - 1e-9));
  ok('a shape given by its equation keeps its own coordinates', read('a surface z = x*y', base).preview.nodes[1].pos.join() === '0,0,0');
  ok('"next to" is a place, not "next, …"', clausesOf('a sphere next to the box').length === 1 && read('a sphere next to the box', base).preview.nodes[1].pos[0] > 1);
  const ref = read('next to the box', base);
  ok('a clause whose only shape is a reference makes nothing', ref.preview.nodes.length === 1 && !!ref.clauses[0].problem);
}

console.log('=== what it could not read is said, and leaves nothing behind ===');
{
  const r = read('a dragon');
  ok('an unknown thing is not made', r.preview.nodes.length === 0 && !!r.clauses[0].problem);
  ok('a pyramid is not faked', /not one of this scene’s shapes yet/.test(read('a pyramid').clauses[0].problem));
  const sk = read('a box with a chimney');
  ok('content words not read are listed', sk.clauses[0].skipped?.includes('chimney'), JSON.stringify(sk.clauses[0]));
  ok('a number not read is listed too', read('a box 7').clauses[0].skipped?.includes('7'));
  const edit = read('move a box left');
  ok('an edit verb never makes something new', edit.preview.nodes.length === 0 && !!edit.clauses[0].problem);
  ok('copy, likewise', read('copy a sphere').preview.nodes.length === 0);
  const partial = read('a box, then put a sphere on the dragon, then make it red');
  ok('a failed clause leaves no trace: "it" is the box', partial.preview.nodes.length === 1 && partial.preview.nodes[0].color === '#d43f3a' && !!partial.clauses[1].problem && !!partial.clauses[2].understood);
  ok('an empty scene says so', /empty/.test(read('make it red').clauses[0].problem ?? ''));
}

console.log('=== what the reply model is told ===');
{
  const big = read('a grid of 40 cubes').preview;
  let sp = create({ objs: [] }, 'scene', big, { name: 'Big', origin: 'person' }).space;
  const block = objectsBlock(sp, { guarded: false });
  ok('a scene is described to the conversation', /Scene Big — scene · 40 parts/.test(block));
  ok('… and however large, the rules are never what is cut', /never say it would stand, balance, hold a load/.test(block) && block.length <= 3400, block.length);
  ok('a scene is never offered as physics', /It is not a physical model/.test(block));
}

console.log('=== on the map: the plan, computed ===');
{
  const s = read('a box 2 m wide, 1 tall and 3 deep').preview;
  const p = planOf(s);
  const area = (r) => Math.abs(polygonArea(r));
  ok('a box seen from above is its width by its depth', near(area(p.parts[0].rings[0]), 6) && p.parts[0].silhouette);
  ok('… and the plan’s bounds are the box’s', p.bounds.map((v) => Number(v.toFixed(9))).join() === '-1,-1.5,1,1.5');
  const turned = planOf(read('rotate it 90 degrees', s, { last: 'box1' }).preview);
  ok('turned a quarter about the vertical, the footprint turns with it', near(turned.bounds[2] - turned.bounds[0], 3) && near(turned.bounds[3] - turned.bounds[1], 2));
  const ring = planOf(read('a ring with outer radius 1 and inner radius 0.5').preview).parts[0];
  ok('a ring keeps its hole', ring.rings.length === 2 && near(area(ring.rings[0]) - area(ring.rings[1]), Math.PI * 0.75, 2e-3));
  const surf = planOf(read('a surface z = x*y').preview).parts[0];
  ok('a surface is only the outline of its extent — and says so', surf.silhouette === false);
  ok('an empty scene has no plan', planOf(EMPTY).bounds === null);
}

console.log('=== in the workspace: offered, opened, kept ===');
{
  const sceneMap = (st) => ({ nodes: [], edges: [], objects: create({ objs: [] }, 'scene', st, { name: 'Scene', origin: 'person' }).space });
  const one = sceneMap(read('a box and a cone').preview);
  const f = factsFrom(one);
  ok('the workspace knows the scene and its parts', f.scenes.length === 1 && f.scenes[0].parts === 2 && f.scenes[0].name === 'Scene');
  const views = suggestViews(f, singleLayout('map'));
  const live = views.find((v) => v.type === 'scene');
  ok('+ View offers the scene by name, pinned to it', live && live.label === 'Live 3D · Scene' && live.config.obj === one.objects.objs[0].id, JSON.stringify(live));
  ok('… as a geometric preview', /geometric preview/.test(live.why));
  const none = suggestViews(factsFrom({ nodes: [], edges: [] }), singleLayout('map'));
  const start = none.find((v) => v.type === 'scene');
  const closed = none.filter((v) => !v.open);
  ok('with no scene, starting one is offered — after everything else not yet open — and said to be experimental', start && start.label === 'Live 3D · experimental' && closed.indexOf(start) === closed.length - 1 && /not a simulation/.test(start.why), none.map((v) => v.label).join(' | '));
  const laid = addPanel(singleLayout('map'), { type: 'scene', config: { obj: 'Scene' } }).layout;
  const back = sanitizeLayout(JSON.parse(JSON.stringify(laid)));
  ok('a layout keeps the scene its panel is pinned to', back && isOpen(back, 'scene', { obj: 'Scene' }) && !isOpen(back, 'scene', { obj: 'Scene2' }));
  ok('a scene panel survives a reload of the layout', sanitizeLayout({ v: 1, root: { kind: 'panel', id: 'p1', type: 'scene' } })?.root?.type === 'scene');
}

console.log('=== an airfoil, from the NACA formulas (Atlas benchmark 29) ===');
{
  const sec = nacaSection({ m: 0, p: 0, t: 12 }, 1, 400);
  const A = Math.abs(polygonArea(sec));
  // ∫₀¹ 2yₜ dξ = 10t[0.2969·⅔ − 0.1260/2 − 0.3516/3 + 0.2843/4 − 0.1036/5] = 0.68088·t
  ok('NACA 0012: its area is ∫2yₜ = 0.68088·t·c²', near(A, 0.68088 * 0.12, 2e-3), A);
  const tmax = Math.max(...[...Array(101).keys()].map((i) => { const x = i / 100 - 0.5; const zs = sec.filter((q) => Math.abs(q[0] - x) < 0.006).map((q) => q[1]); return zs.length > 1 ? Math.max(...zs) - Math.min(...zs) : 0; }));
  ok('… 12% of the chord at its thickest', near(tmax, 0.12, 0.003), tmax);
  ok('… and symmetric about its chord', near(Math.max(...sec.map((q) => q[1])), -Math.min(...sec.map((q) => q[1])), 1e-12));
  const cam = nacaSection({ m: 2, p: 4, t: 12 }, 1, 400);
  const mid = (x) => { const zs = cam.filter((q) => Math.abs(q[0] + 0.5 - x) < 0.004).map((q) => q[1]); return (Math.max(...zs) + Math.min(...zs)) / 2; };
  ok('NACA 2412: the camber line peaks near 2% of the chord, at 40%', near(mid(0.4), 0.02, 0.002), mid(0.4));
  const te = cam.reduce((a, q) => (q[0] > a[0] ? q : a));
  ok('… and closes: the trailing edge is one point on the chord line', near(te[0], 0.5, 1e-12) && near(te[1], 0, 1e-12) && cam.filter((q) => near(q[0], 0.5, 1e-12)).length === 1);
  ok('… with the leading edge, on the chord line, a vertex of it', cam.some((q) => near(q[0], -0.5, 1e-12) && near(q[1], 0, 1e-12)));
  const r = read('a NACA 2412 airfoil with chord 1.5 m and span 4 m');
  const af = r.preview.nodes[0];
  ok('read: the four digits, the chord and the span', af.shape === 'airfoil' && af.dims.m === 2 && af.dims.p === 4 && af.dims.t === 12 && af.dims.c === 1.5 && af.dims.h === 4, JSON.stringify(af.dims));
  ok('… said with its name', /an? NACA 2412 airfoil/.test(r.clauses[0].understood), r.clauses[0].understood);
  // a cambered section's upper surface, offset normal to the camber, reaches a hair ahead of the chord's start
  ok('it lies as a wing: chord along x, thickness up, span along z', (() => { const b = worldBox(af); return near(b.max[0] - b.min[0], 1.5, 1.5e-3) && near(b.max[2] - b.min[2], 4, 1e-9) && b.max[1] - b.min[1] < 0.25 && b.min[1] > -1e-9; })());
  ok('its volume is the section times the span — numerical, and said', (() => { const m = measure(af); return m.how === 'numerical' && near(m.volume, Math.abs(polygonArea(profile(af).outer)) * 4, 1e-12) && /NACA section sampled/.test(m.note); })());
  ok('an impossible section is refused, with the reason', /second digit/.test(read('a naca 2012 wing').clauses[0].problem ?? ''));
  ok('the chord is a dimension to set', read('set the chord to 2', r.preview).preview.nodes[0].dims.c === 2);
}

console.log('=== what it is made of: mass and centre of mass ===');
{
  const r = read('a steel cube with side 1');
  const n = r.preview.nodes[0];
  ok('a named material takes its nominal density, marked nominal', n.material === 'steel' && n.density === 7850 && n.densityFrom === 'nominal');
  ok('… and the reading says it is a typical value', r.clauses[0].notes?.some((x) => /nominal density of 7850/.test(x)));
  ok('mass is ρ times the exact volume', near(massOf(n).kg, 7850, 1e-9) && massOf(n).nominal);
  const g = read('a box 2 x 1 x 0.5 m, density 2700 kg/m3').preview.nodes[0];
  ok('a density given is given', g.density === 2700 && g.densityFrom === 'given' && near(massOf(g).kg, 2700, 1e-9));
  ok('a part with no density has no mass, rather than a guessed one', massOf(read('a box').preview.nodes[0]) === null);
  ok('a colour that is also a metal is not taken for one', read('a gold torus').preview.nodes[0].density === undefined);
  const cone = { shape: 'cone', dims: { r: 1, h: 4 }, pos: [0, 0, 0], rot: [0, 0, 0], scale: [1, 1, 1] };
  ok('a cone’s centroid is a quarter of its height above its base', centroid(cone)[1] === -1);
  const lshape = { shape: 'polygon', dims: { h: 1 }, exprs: { pts: '0,0|2,0|2,1|1,1|1,2|0,2' }, pos: [0, 0, 0], rot: [0, 0, 0], scale: [1, 1, 1] };
  const cL = centroid(lshape);
  // an L of three unit squares: its area centroid is (5/6, 5/6) from the corner; the outline is centred on its corners, (1, 1)
  ok('an outline’s centroid is its area’s, not its corners’', near(cL[0], 5 / 6 - 1, 1e-12) && near(cL[2], 5 / 6 - 1, 1e-12), cL.join());
  let s = read('a steel box 1 m wide, 1 tall and 1 deep, then an aluminium box 1 m wide, 1 tall and 1 deep to the right of it').preview;
  const sm = sceneMass(s);
  const a = s.nodes[0], b = s.nodes[1];
  ok('the scene’s mass is the sum', near(sm.kg, 7850 + 2700, 1e-6) && sm.weighed === 2 && sm.nominal === 2);
  ok('… and its centre of mass the weighted mean of the centroids', near(sm.at[0], (7850 * a.pos[0] + 2700 * b.pos[0]) / 10550, 1e-9) && near(sm.at[1], 0.5, 1e-9));
  s = read('a cone', s).preview;
  ok('a part with no density is counted, not weighed', sceneMass(s).unweighed === 1 && near(sceneMass(s).kg, 10550, 1e-6));
  const facts = SCENE.facts(s, { guarded: false });
  ok('the facts say the mass, the centre, and that the densities are nominal', facts.some((f) => /^mass 10\.55 t over the 2 parts with a density \(1 without one, not counted\)/.test(f) && /nominal densities/.test(f)), JSON.stringify(facts));
  ok('guarded: no mass', !SCENE.facts(s, { guarded: true }).some((f) => /^mass/.test(f)));
  ok('make it steel: an edit sets the material', read('make the cone 7800 kg/m3', s).preview.nodes[2].density === 7800);
  ok('a material survives storage', sanitizeScene(JSON.parse(JSON.stringify(s))).nodes[0].density === 7850 && sanitizeScene(JSON.parse(JSON.stringify(s))).nodes[0].densityFrom === 'nominal');
  ok('nonsense density refused', typeof SCENE_OPS.matter.check(s, { id: 'box1', density: -3 }) === 'string');
}

console.log('=== layouts for designs: gaps, centring, rings around a part, outlines extruded ===');
{
  const clean = (r) => r.clauses.every((c) => c.understood && !(c.skipped && c.skipped.length));
  // a row put on top of something stands across it, centred
  const fins = read('a box 1 m wide, 0.1 m tall and 1 m deep called base, then a row of 5 boxes 0.05 m wide, 0.3 m tall and 1 m deep on top of it with a gap of 0.15 m');
  const f = fins.preview.nodes.slice(1);
  ok('a row on a part is centred on it', clean(fins) && f.length === 5 && near(Math.min(...f.map((n) => n.pos[0])), -0.4) && near(Math.max(...f.map((n) => n.pos[0])), 0.4), JSON.stringify(fins.clauses));
  ok('… with the gap edge to edge: a 0.2 m pitch', f.every((n, i) => i === 0 || near(n.pos[0] - f[i - 1].pos[0], 0.2)));
  ok('… still resting on it, and it says it centred them', f.every((n) => n.on === 'box1') && fins.clauses[1].notes.some((x) => /centred on base/.test(x)));
  ok('a row on the floor is not moved', near(read('a row of 3 cubes').preview.nodes[0].pos[0], 0));
  const apart = read('a row of 4 spheres of radius 0.1 0.5 m apart').preview.nodes;
  ok('“0.5 m apart” is centre to centre', apart.length === 4 && near(apart[3].pos[0] - apart[0].pos[0], 1.5));
  // a ring around a part, or around the origin
  const base = read('a cylinder 1 m in diameter and 0.2 m tall at (3, 0.1, 2) called hub').preview;
  const ring = read('a ring of 6 spheres 0.2 m in diameter with radius 1 around the hub', base);
  const balls = ring.preview.nodes.slice(1);
  ok('a ring around a part is centred on it', clean(ring) && balls.length === 6 && balls.every((n) => near(Math.hypot(n.pos[0] - 3, n.pos[2] - 2), 1)), JSON.stringify(ring.clauses));
  const o = read('a ring of 4 cubes with radius 2 around the origin', base).preview.nodes.slice(1);
  ok('… or around the origin, not put beside the scene', o.length === 4 && o.every((n) => near(Math.hypot(n.pos[0], n.pos[2]), 2)));
  ok('around something that is not there is a problem, and builds nothing', !!read('a ring of 4 cubes around the dragon', base).clauses[0].problem && read('a ring of 4 cubes around the dragon', base).preview.nodes.length === 1);
  // a copy with a gap
  const cp = read('a box 0.5 m wide, then copy it 3 times to the right with a gap of 0.1 m');
  ok('copies with a gap: each one width plus the gap further on', clean(cp) && near(cp.preview.nodes[3].pos[0] - cp.preview.nodes[0].pos[0], 3 * 0.6), JSON.stringify(cp.clauses));
  // an outline is extruded by the length given, and its noun is read
  const tall = read('a polygon with corners (0, 0), (1, 0), (1, 1), (0, 1), 2 m tall');
  ok('an outline extruded “2 m tall”, nothing skipped', clean(tall) && near(tall.preview.nodes[0].dims.h, 2), JSON.stringify(tall.clauses));
  const long = read('a steel polygon with corners (0, 0), (0.2, 0), (0.2, 0.02), (0, 0.02), 3 m long');
  ok('… or “3 m long”, as a section to be laid down', clean(long) && near(long.preview.nodes[0].dims.h, 3) && near(massOf(long.preview.nodes[0]).kg, 7850 * 0.004 * 3));
  // a shape given by an equation keeps the name it is given, after the equation or before it
  const named = read('revolve r = 1 + 0.2*y for y from 0 to 1 called vase');
  ok('“called vase” after an equation is read, not swallowed', clean(named) && named.preview.nodes[0].name === 'vase', JSON.stringify(named.preview.nodes[0]?.name));
  const tube = read('a tube called coil x = cos(t), y = sin(t), z = 0.1*t for t from 0 to 6.28');
  ok('… and before it', tube.preview.nodes[0]?.name === 'coil' && tube.preview.nodes[0]?.shape === 'tube');
}

console.log('=== a section’s area and second moments, exact ===');
{
  const sec = (shape, dims, exprs, scale = [1, 1, 1]) => sectionOf({ shape, dims, exprs, pos: [0, 0, 0], rot: [0, 0, 0], scale });
  // a rectangle b × d: I about its own x axis (∫z²) is b·d³/12
  const rect = sec('polygon', { h: 1 }, { pts: '0,0|0.3,0|0.3,0.1|0,0.1' });
  ok('a rectangle: A = b·d, I = b·d³/12 and d·b³/12', near(rect.area, 0.03) && near(rect.Ix, (0.3 * 0.1 ** 3) / 12) && near(rect.Iz, (0.1 * 0.3 ** 3) / 12));
  // the same corners the other way round are the same section
  const cw = sec('polygon', { h: 1 }, { pts: '0,0.1|0.3,0.1|0.3,0|0,0' });
  ok('… whichever way the corners run', near(cw.area, rect.area) && near(cw.Ix, rect.Ix));
  // a T: centroid and I by the parallel-axis theorem, worked by hand
  const tee = sec('polygon', { h: 1 }, { pts: '0,0|0.2,0|0.2,0.02|0.11,0.02|0.11,0.2|0.09,0.2|0.09,0.02|0,0.02' });
  const zc = (0.004 * 0.01 + 0.0036 * 0.11) / 0.0076;
  const IxT = (0.2 * 0.02 ** 3) / 12 + 0.004 * (zc - 0.01) ** 2 + (0.02 * 0.18 ** 3) / 12 + 0.0036 * (0.11 - zc) ** 2;
  ok('a T-section: its centroid off the middle of its corners, and I about it', near(tee.area, 0.0076) && near(tee.cz, zc - 0.06) && near(tee.Ix, IxT, 1e-9), JSON.stringify(tee));
  // a ring from the annulus formulas, not its drawn 96-gon
  const ring = sec('ring', { R: 0.05, r: 0.045, h: 1 });
  ok('a ring: π(R⁴ − r⁴)/4 exactly', near(ring.Ix, (PI * (0.05 ** 4 - 0.045 ** 4)) / 4) && near(ring.Iz, ring.Ix) && near(ring.area, PI * (0.05 ** 2 - 0.045 ** 2)));
  // a square prism is the same about any centroidal axis: a⁴/12
  const sq = sec('prism', { n: 4, r: Math.SQRT2 / 2, h: 1 });
  ok('a square prism of side 1: I = 1/12 about either axis', near(sq.area, 1) && near(sq.Ix, 1 / 12) && near(sq.Iz, 1 / 12));
  // stretched: x by 2 doubles the area and I about x, and multiplies I about z by eight
  const st = sec('polygon', { h: 1 }, { pts: '0,0|0.3,0|0.3,0.1|0,0.1' }, [2, 1, 1]);
  ok('a stretch is followed: A·sx·sz, Ix·sx·sz³, Iz·sx³·sz', near(st.area, 0.06) && near(st.Ix, 2 * rect.Ix) && near(st.Iz, 8 * rect.Iz));
  ok('no section for a shape that is not an extrusion', sec('box', { w: 1, h: 1, d: 1 }) === null && sec('sphere', { r: 1 }) === null);
}

console.log('=== built from the conversation: the chat box is the only box ===');
{
  const turn = (text, sc = EMPTY, ctx = {}) => sceneTurn(text, sc, ctx);
  const b = turn('a red box 2 m wide, then a blue sphere of radius 0.5 on top of it');
  ok('a description that reads fully is built', b?.kind === 'build' && b.reading.preview.nodes.length === 2);
  ok('… and what was built is said, clause by clause', /^Built in Live 3D: add a red box.*; add a blue sphere/.test(b?.said ?? ''), b?.said);
  ok('the reading is the scene reader’s own: the same operations the preview drew', JSON.stringify(b?.reading.ops) === JSON.stringify(read('a red box 2 m wide, then a blue sphere of radius 0.5 on top of it').ops));
  ok('a request put politely is still a description', turn('can you make a red cube please')?.kind === 'build' && turn('could you add a sphere?')?.kind === 'build');
  ok('“build me …” keeps its count', /9 steel spheres in a ring/.test(turn('build me a ring of 9 steel balls')?.said ?? ''));
  ok('… and so does “could you build us …”', /8 cylinders in a ring/.test(turn('could you build us a ring of 8 cylinders')?.said ?? ''));
  const surf = turn('a surface z = sin(x)*cos(y)');
  ok('a surface by its equation is built, with the range nobody gave said', surf?.kind === 'build' && /no range given/.test(surf.said));
  // a question that names a shape is a question — it goes to the conversation, and the scene is not touched
  for (const q of ['what is the volume of a sphere of radius 2?', "Can you explain how a cylinder's moment of inertia is derived?", 'compare a cylinder and a cone', 'how would a cone look if it was taller?', 'why is the flywheel so heavy?', 'show me how a gyroscope works', 'explain the four subspaces of this matrix', 'thanks!', 'hello']) {
    ok(`an ordinary message is not the scene’s: “${q}”`, turn(q) === null, JSON.stringify(turn(q)?.problems ?? turn(q)?.said));
  }
  ok('… nor is a statement that happens to name one', turn('my house is shaped like a cube') === null);
  ok('nothing to build, nothing said', turn('') === null && turn('   ') === null && turn('make it red') === null);
  const part = turn('add a red box and make it glow');
  ok('a description read only in part builds nothing', part?.kind === 'partial');
  ok('… and says what could not be read, in the reader’s words', /^Nothing was built/.test(part?.said ?? '') && /“make it glow”: Make it what\?/.test(part?.said ?? ''), part?.said);
  ok('… words skipped are named too', /not read — rounded, corners/.test(turn('add a box with rounded corners')?.said ?? ''));
  ok('a message that names a shape among many other words is left to the conversation', turn('a lot of people think a sphere is the most efficient shape for a tank') === null);
  const s0 = read('a red box').preview;
  const edit = turn('make it twice as tall', s0, { selected: s0.nodes[0].id });
  ok('with a part in hand, “it” is that part', edit?.kind === 'build' && edit.reading.changes.changed.includes(s0.nodes[0].id) && !edit.reading.changes.added.length);
  ok('… and with none selected, the part the conversation last made', turn('paint it gold', s0, { last: s0.nodes[0].id })?.kind === 'build');
  ok('what reads as a description, and what does not', readsAsDescription('add a cube') && readsAsDescription('could you add a sphere') && readsAsDescription('a ball bearing') && readsAsDescription('3 cubes in a row') && !readsAsDescription('what is a cube') && !readsAsDescription('add a cube?') && !readsAsDescription('the cube is nice') && !readsAsDescription('compare a cube and a sphere'));
}

console.log('=== the wiring: no box but the chat’s ===');
{
  const panel = readFileSync(new URL('../components/scene3d/ScenePanel.tsx', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../components/LogosApp.tsx', import.meta.url), 'utf8');
  const fig = readFileSync(new URL('../components/objects/ObjectFigure.tsx', import.meta.url), 'utf8');
  const composer = readFileSync(new URL('../components/LogosComposer.tsx', import.meta.url), 'utf8');
  ok('Live 3D has no text box or Build button of its own', !/<input\b(?![^>]*type="(?:number|range)")[^>]*aria-label="Describe/.test(panel) && !/s3-say/.test(panel) && !/>\s*Build\s*</.test(panel));
  ok('… it previews what is being typed in the chat, with the same reading', /sceneTurn\(draft, scene/.test(panel) && /draft=\{target \? input : ''\}/.test(app));
  ok('… and only what sending will build is ghosted', /turn\?\.kind === 'build' \? turn\.reading : null/.test(panel));
  ok('its starting points go into the chat box', /p\.onSuggest!\(s\)/.test(panel) && /onSuggest=\{\(text\) => draftToComposer\(text\)\}/.test(app));
  ok('a description sent in the chat is built before the reply is asked anything', /const turn = sceneTurn\(content, st/.test(app) && app.indexOf('if (objTurn.scene)') > app.indexOf('const objTurn = takeObjects(content, atts)') && app.indexOf('if (objTurn.scene)') < app.indexOf('readViewRequest(content)'));
  const local = app.slice(app.indexOf('if (objTurn.scene)'), app.indexOf('readViewRequest(content)'));
  ok('… and is answered here, without the model', /patchActive/.test(local) && !/fetch\(/.test(local));
  ok('every operation of one description shares a moment, so undo takes it back whole', /const at = Date\.now\(\);[\s\S]{0,400}applyObjectOp\(sp, id, o\.op, o\.args, \{ by: 'person', at \}\)/.test(app));
  ok('the matrix and the function have no text box of their own', !/<input\b(?![^>]*type="range")/.test(fig.slice(fig.indexOf('function MatrixFigure'))) && !/<form/.test(fig));
  ok('… their forms are finished in the chat box, the caret where the number goes', /onDraft\?\.\(t, dot >= 0 \? dot : undefined\)/.test(fig) && /if \(a\.type === 'draft'\)/.test(app));
  ok('the chat box takes the caret when something is put in it', /focusSignal/.test(composer) && /setSelectionRange\(at, at\)/.test(composer));
}

console.log('=== the source keeps its promises ===');
{
  const src = readFileSync(new URL('../lib/objects/scene.ts', import.meta.url), 'utf8');
  ok('the scene is a registered kind, not a parallel store', /register\(SCENE\)/.test(src) && /kind: 'scene'/.test(src));
  ok('pure: no React, no three', !/from 'react'|from 'three'/.test(src));
  const intent = readFileSync(new URL('../lib/objects/scene-intent.ts', import.meta.url), 'utf8');
  ok('the reader applies the kind’s own operations', /SCENE_OPS\[op\]/.test(intent) && !/fetch\(/.test(intent));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
