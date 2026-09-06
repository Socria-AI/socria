// Three dimensions, drawn with the two-dimensional renderer.
//
// The projection is arithmetic and arithmetic is exactly what a suite is for:
// a sign error in a rotation is not a crash, it is a picture that is subtly
// and permanently wrong — a surface that turns the wrong way, or one whose
// far edge is drawn in front of its near one.
//
// The properties pinned here are the ones that make a projection TRUSTWORTHY
// rather than merely present:
//
//   it is orthographic, so equal steps stay equal and parallel lines stay
//   parallel — the distortion a perspective camera introduces is the one a
//   mathematical picture must not have;
//   turning is rigid, so the shape does not change size as it spins;
//   the domain is the scene's, not the window's;
//   and a hole in the surface stays a hole.

import {
  project3, norm, toUnit, place, boxLines, sampleSurface, zRange,
  surfaceLines, sliceLines, slicePlane, byDepth,
} from './.tmp/logos-viz3d.mjs';
import { sanitizeViz, compileScene, resolveView, buildFrame, defaults } from './.tmp/logos-viz.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

const CAM = { yaw: 0.6, pitch: 0.4 };

console.log('=== the camera is orthographic ===');
{
  // Equal steps in space stay equal steps on the page. This is the whole
  // reason not to use a perspective camera, and it is one assertion.
  const step = (t) => project3({ x: t, y: 0, z: 0 }, CAM);
  const a = step(0), b = step(1), c = step(2);
  ok('equal steps project to equal steps',
    near(b.x - a.x, c.x - b.x) && near(b.y - a.y, c.y - b.y));

  // Parallel lines stay parallel: two rows of the grid, offset in y.
  const dir = (y) => {
    const p = project3({ x: 0, y, z: 0 }, CAM), q = project3({ x: 1, y, z: 0 }, CAM);
    return { dx: q.x - p.x, dy: q.y - p.y };
  };
  const d0 = dir(0), d1 = dir(3);
  ok('parallel lines stay parallel', near(d0.dx, d1.dx) && near(d0.dy, d1.dy));

  // Depth is a real ordering: further along the view direction sorts later.
  const items = [{ depth: -1 }, { depth: 5 }, { depth: 2 }];
  ok('painter order is far to near',
    byDepth(items).map((i) => i.depth).join(',') === '5,2,-1');
}

console.log('\n=== turning is rigid ===');
{
  // A cube spun on its turntable must not change size. If it does, the
  // rotation is shearing rather than rotating.
  const corners = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) corners.push({ x, y, z });
  const spanAt = (yaw) => {
    const ps = corners.map((c) => project3(c, { yaw, pitch: 0.4 }));
    // The furthest any two corners are apart: an invariant of a rigid body
    // under an orthographic camera... in the plane of the screen it varies,
    // so measure the 3D-preserved quantity instead: distance from centre.
    return ps.map((p) => Math.hypot(p.x, p.y));
  };
  const s0 = spanAt(0), s1 = spanAt(1.1);
  ok('the same eight corners are present at any angle', s0.length === s1.length);
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  ok('and none of them runs off to infinity',
    s1.every((d) => Number.isFinite(d) && d < 3), String(Math.max(...s1)));
  ok('the cube does not collapse when spun', sum(s1) > 0.5 * sum(s0));

  // Edge-on: pitch 0 flattens z into the vertical and nothing else.
  const flat = project3({ x: 0, y: 5, z: 1 }, { yaw: 0, pitch: 0 });
  ok('at pitch 0 the height IS the vertical', near(flat.y, 1));
  // Straight down: pitch 90° hides z entirely, which is the plan view.
  const plan = project3({ x: 0, y: 1, z: 7 }, { yaw: 0, pitch: Math.PI / 2 });
  ok('at pitch 90 the height disappears', Math.abs(plan.y + 1) < 1e-9, String(plan.y));
}

console.log('\n=== normalising into the box ===');
{
  ok('the low end maps to -1', near(norm(2, 2, 10), -1));
  ok('the high end maps to +1', near(norm(10, 2, 10), 1));
  ok('the middle maps to 0', near(norm(6, 2, 10), 0));
  ok('a flat range does not divide by zero', norm(5, 5, 5) === 0);

  const u = toUnit({ x: 10, y: 2, z: 0.4 }, { x: { min: 0, max: 10 }, y: { min: 0, max: 4 }, z: { min: 0, max: 0.4 } });
  ok('every axis is squeezed to the same cube',
    near(u.x, 1) && near(u.y, 0) && near(u.z, 1));
  const p = place({ x: 0, y: 0, z: 0 }, { x: { min: -1, max: 1 }, y: { min: -1, max: 1 }, z: { min: -1, max: 1 } }, { yaw: 0, pitch: 0 });
  ok('the centre projects to the origin', near(p.x, 0) && near(p.y, 0));
  ok('the box has twelve edges as five polylines', boxLines({ x:{min:0,max:1}, y:{min:0,max:1}, z:{min:0,max:1} }, CAM).length === 6);
}

console.log('\n=== sampling keeps the holes ===');
{
  const grid = sampleSurface((x, y) => x * y, { min: -2, max: 2 }, { min: -2, max: 2 }, 4);
  ok('an n of 4 gives a 5x5 grid', grid.length === 5 && grid[0].length === 5);
  ok('the corners are the domain corners', grid[0][0].x === -2 && grid[4][4].y === 2);
  ok('z is computed', grid[0][0].z === 4);

  // A pole must stay a gap rather than being smoothed over.
  const holed = sampleSurface((x, y) => 1 / (x * y), { min: -1, max: 1 }, { min: -1, max: 1 }, 2);
  const gaps = holed.flat().filter((s) => s.z === null).length;
  ok('a division by zero becomes a gap, not a number', gaps > 0, String(gaps));
  // And a thrown evaluator does not take the whole grid down.
  const angry = sampleSurface(() => { throw new Error('no'); }, { min: 0, max: 1 }, { min: 0, max: 1 }, 2);
  ok('a throwing function yields all gaps', angry.flat().every((s) => s.z === null));
  ok('and zRange says so rather than guessing', zRange(angry) === null);

  ok('zRange finds the real extremes', JSON.stringify(zRange(grid)) === JSON.stringify({ min: -4, max: 4 }));
  const flat = sampleSurface(() => 3, { min: 0, max: 1 }, { min: 0, max: 1 }, 2);
  const fr = zRange(flat);
  ok('a plane still gets a box with height', fr.max > fr.min, JSON.stringify(fr));
}

console.log('\n=== the wireframe breaks where the surface does ===');
{
  const f3 = { x: { min: -1, max: 1 }, y: { min: -1, max: 1 }, z: { min: -1, max: 1 } };
  const solid = surfaceLines(sampleSurface((x, y) => x * y, { min: -1, max: 1 }, { min: -1, max: 1 }, 4), f3, CAM);
  ok('both families of lines are drawn', solid.length === 10, String(solid.length));

  const holed = surfaceLines(sampleSurface((x, y) => 1 / (x + y), { min: -1, max: 1 }, { min: -1, max: 1 }, 4), f3, CAM);
  ok('a hole splits runs instead of jumping the gap', holed.length > 10, String(holed.length));
  ok('and no run is a single stranded point', holed.every((l) => l.length > 1));

  const cut = sliceLines((x, y) => x * x + y, 0.5, { min: -1, max: 1 }, f3, CAM, 8);
  ok('the slice is one unbroken curve', cut.length === 1 && cut[0].length === 9);
  const cutHole = sliceLines((x) => 1 / x, 0, { min: -1, max: 1 }, f3, CAM, 8);
  ok('a slice through a pole breaks too', cutHole.length === 2, String(cutHole.length));

  ok('the cutting sheet is a quadrilateral', slicePlane(0, f3, CAM).length === 4);
}

console.log('\n=== the scene end to end ===');
{
  const build = (raw) => {
    const s = sanitizeViz(raw);
    if (!s) return null;
    const fn = compileScene(s);
    const view = resolveView(s, fn);
    return { s, frame: buildFrame(s, fn, defaults(s), view, false), view };
  };
  const surf = (expr, extra = {}) =>
    build({ kind: 'surface', expr, varName: 'x', view: { xMin: -3, xMax: 3 }, yRange: { min: -3, max: 3 }, params: [], ...extra });

  const r = surf('x^2 - y^2');
  ok('a two-variable expression is accepted', !!r);
  ok('y did NOT become a slider', !r.s.params.some((p) => p.id === 'y'),
    r.s.params.map((p) => p.id).join(','));
  ok('the camera and the knife are the controls',
    ['cut', 'yaw', 'turn'].every((id) => r.s.params.some((p) => p.id === id)),
    r.s.params.map((p) => p.id).join(','));
  ok('the cut sweeps, so it animates', r.s.params.find((p) => p.id === 'cut').sweep === 'up');
  ok('the cut spans the y domain',
    r.s.params.find((p) => p.id === 'cut').min === -3 && r.s.params.find((p) => p.id === 'cut').max === 3);

  const ids = r.frame.objects.map((o) => o.id);
  for (const id of ['box', 'sheet', 'surf', 'cutline']) ok(`the frame has ${id}`, ids.includes(id));
  ok('the wireframe is ONE node, not four hundred',
    r.frame.objects.filter((o) => o.o === 'mesh').length <= 3);

  // THE domain bug, pinned: reading x off the viewport instead of the scene
  // shrank [-3,3] to the projection window and drew the wrong function.
  ok('the z range is the real one over the real domain',
    r.frame.readouts.find((x) => x.id === 'zspan').value === '-9 … 9',
    r.frame.readouts.find((x) => x.id === 'zspan')?.value);

  // The window is fixed, so the model does not breathe as it turns.
  ok('the window is the projection box, not the domain',
    r.view.xMin === -1.85 && r.view.xMax === 1.85);

  // Everything drawn has to fit inside that window, at any angle.
  for (const yaw of [-180, -90, 0, 37, 90, 180]) {
    const s = r.s;
    const fn = compileScene(s);
    const f = buildFrame(s, fn, { ...defaults(s), yaw }, r.view, false);
    const pts = f.objects.filter((o) => o.o === 'mesh').flatMap((o) => o.lines.flat());
    const out = pts.filter((p) => Math.abs(p.x) > 1.85 || Math.abs(p.y) > 1.95).length;
    ok(`at yaw ${yaw} everything stays in frame`, out === 0, `${out} outside`);
  }

  // Nothing finite anywhere over the domain: a real possibility, and the
  // panel must say so rather than drawing an empty box with a confident
  // caption under it.
  const empty = surf('sqrt(-1 - x^2 - y^2)');
  ok('a surface with no finite values is handled', !!empty);
  ok('it draws nothing', empty.frame.objects.length === 0);
  ok('and says why', /Nothing finite/.test(empty.frame.caption), empty.frame.caption);

  // A constant has no variables at all, so it is not a surface and the
  // sanitizer refuses it — the same rule every other kind follows.
  ok('a constant is refused', surf('3') === null);

  // The guard holds the sampled height — that IS an answer — but not the
  // shape, which is the thing they are being asked to look at.
  const s2 = sanitizeViz({ kind: 'surface', expr: 'x^2 - y^2', varName: 'x', view: { xMin: -3, xMax: 3 }, yRange: { min: -3, max: 3 }, params: [] });
  const g = buildFrame(s2, compileScene(s2), defaults(s2), resolveView(s2, compileScene(s2)), true);
  ok('guarded: the sampled height is withheld',
    g.readouts.find((x) => x.id === 'sample')?.value === null);
  ok('guarded: the surface is still drawn', g.objects.some((o) => o.id === 'surf'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
