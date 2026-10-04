// /mind-ar — the Mind Graph in AR. The geometry is pure (lib/mind/ar.ts), so
// it is held here; the page is held to being a dev-only secret.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { layout3d, project, pick, pinchZoom, clampDist, easeCamera, toCamera, SAMPLE_GRAPH, ZOOM } from './.tmp/ar.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const cam = (o = {}) => ({ pivot: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, dist: 2.5, ...o });

console.log('=== the layout ===');
{
  const { nodes, edges } = SAMPLE_GRAPH;
  const a = layout3d(nodes, edges);
  const b = layout3d([...nodes].reverse(), edges);
  ok('every node is placed', nodes.every((n) => a[n.id]));
  ok('the same graph lands in the same place, whatever order it arrives in', nodes.every((n) => Math.abs(a[n.id].x - b[n.id].x) < 1e-9 && Math.abs(a[n.id].z - b[n.id].z) < 1e-9));
  const r = nodes.map((n) => Math.hypot(a[n.id].x, a[n.id].y, a[n.id].z));
  ok('it fits the unit ball, with the furthest node on its edge', Math.max(...r) <= 1 + 1e-9 && Math.max(...r) > 0.999, String(Math.max(...r)));
  ok('nothing is NaN', nodes.every((n) => [a[n.id].x, a[n.id].y, a[n.id].z].every(Number.isFinite)));
  const d = (p, q) => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
  const linked = edges.map((e) => d(a[e.sourceId], a[e.targetId]));
  const all = [];
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) all.push(d(a[nodes[i].id], a[nodes[j].id]));
  const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
  ok('linked thoughts sit closer than thoughts in general', mean(linked) < mean(all), `${mean(linked).toFixed(3)} vs ${mean(all).toFixed(3)}`);
  ok('an empty graph is an empty layout', Object.keys(layout3d([], [])).length === 0);
  const one = layout3d([{ id: 'x', type: 't', label: 'x' }], []);
  ok('a single node sits at the centre', one.x.x === 0 && one.x.y === 0 && one.x.z === 0);
  ok('an edge to nowhere is ignored', Object.keys(layout3d(nodes.slice(0, 3), [{ sourceId: 's1', targetId: 'ghost' }])).length === 3);
}

console.log('\n=== the camera ===');
{
  const c = project({ x: 0, y: 0, z: 0 }, cam(), 800, 600);
  ok('the pivot is the centre of the screen', Math.abs(c.x - 400) < 1e-9 && Math.abs(c.y - 300) < 1e-9);
  ok('up in the graph is up on the screen', project({ x: 0, y: 0.5, z: 0 }, cam(), 800, 600).y < 300);
  ok('right is right', project({ x: 0.5, y: 0, z: 0 }, cam(), 800, 600).x > 400);
  ok('closer looks bigger', project({ x: 0, y: 0, z: 0 }, cam({ dist: 0.5 }), 800, 600).scale > c.scale);
  ok('behind the camera is not drawn', project({ x: 0, y: 0, z: -3 }, cam(), 800, 600) === null);
  const turned = toCamera({ x: 1, y: 0, z: 0 }, cam({ yaw: Math.PI / 2 }));
  ok('a quarter turn moves a point from the side to the front or back', Math.abs(turned.x) < 1e-9, JSON.stringify(turned));
}

console.log('\n=== zoom, pick, fly ===');
{
  ok('pinching out zooms in', pinchZoom(2, 100, 200) === 1);
  ok('pinching in zooms out', pinchZoom(1, 200, 100) === 2);
  ok('zoom stops at its limits', clampDist(0) === ZOOM.min && clampDist(99) === ZOOM.max);
  ok('a zero-length pinch changes nothing', pinchZoom(1.5, 0, 50) === 1.5);
  const pos = { a: { x: 0, y: 0, z: 0 }, b: { x: 0.6, y: 0, z: 0 } };
  const pb = project(pos.b, cam(), 800, 600);
  ok('tapping a node picks it', pick(pos, cam(), 800, 600, pb.x + 3, pb.y - 2) === 'b');
  ok('tapping empty space picks nothing', pick(pos, cam(), 800, 600, 20, 20) === null);
  let c = cam();
  for (let i = 0; i < 80; i++) c = easeCamera(c, { pivot: { x: 1, y: 0, z: 0 }, dist: 0.75 }, 0.12);
  ok('flying to a node arrives at it', Math.abs(c.pivot.x - 1) < 1e-3 && Math.abs(c.dist - 0.75) < 1e-3);
}

console.log('\n=== a secret, and dev only ===');
{
  const page = readFileSync(join(root, 'app/mind-ar/page.tsx'), 'utf8');
  ok('production gets a 404', /if \(isProduction\(\)\) notFound\(\)/.test(page));
  ok('  and search engines are told to stay out', /index: false/.test(page));
  const ui = readFileSync(join(root, 'app/mind-ar/MindAR.tsx'), 'utf8');
  ok('the camera is asked for, never recorded', /getUserMedia/.test(ui) && !/MediaRecorder|toDataURL|captureStream/.test(ui));
  ok('the sample says it is a sample', /A sample graph/.test(ui));
  // Not linked from anywhere: it is found by typing the address.
  const hits = [];
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) { if (!/node_modules|\.next|mind-ar/.test(p)) walk(p); continue; }
      if (/\.(tsx?|mdx?)$/.test(f) && readFileSync(p, 'utf8').includes('/mind-ar')) hits.push(p);
    }
  };
  walk(join(root, 'app')); walk(join(root, 'components'));
  ok('nothing in the app links to it', hits.length === 0, hits.join(', '));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
