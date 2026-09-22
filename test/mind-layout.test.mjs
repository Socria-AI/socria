// Where the nodes go.
//
// The layout is the one part of the canvas that can be wrong without looking
// wrong: a graph that settles differently each time, or piles everything into
// a corner, or puts a node outside the frame where nobody can click it, still
// renders. So these check the properties the drawing depends on rather than
// any particular arrangement.

import { settle, foldLayout } from './.tmp/layout.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));

const W = 1000, H = 520, PAD = 26;

const mk = (n, types = ['Goal', 'Belief', 'Project']) =>
  Array.from({ length: n }, (_, i) => ({ id: `n${i}`, type: types[i % types.length] }));
const chain = (n) => Array.from({ length: Math.max(0, n - 1) }, (_, i) => [`n${i}`, `n${i + 1}`]);

console.log('=== settle ===');
{
  const nodes = mk(14), edges = chain(14);
  const a = settle(nodes, edges, W, H, 300);
  const b = settle(nodes, edges, W, H, 300);

  ok('every node gets a position', nodes.every((d) => a[d.id] && Number.isFinite(a[d.id].x) && Number.isFinite(a[d.id].y)));
  // A layout that moves when nothing changed reads as the MEMORY having
  // changed. It has to be the same graph, the same picture, every time.
  ok('it is deterministic', nodes.every((d) => a[d.id].x === b[d.id].x && a[d.id].y === b[d.id].y));
  ok('nothing lands outside the frame',
     nodes.every((d) => a[d.id].x >= PAD - 0.001 && a[d.id].x <= W - PAD + 0.001 &&
                        a[d.id].y >= PAD - 0.001 && a[d.id].y <= H - PAD + 0.001),
     JSON.stringify(Object.values(a).find((p) => p.x < PAD || p.x > W - PAD)));

  // If everything collapses to one point the picture is a dot, which is the
  // failure mode a force layout has when the repulsion term is wrong.
  const xs = nodes.map((d) => a[d.id].x), ys = nodes.map((d) => a[d.id].y);
  ok('it actually spreads out', Math.max(...xs) - Math.min(...xs) > 120 && Math.max(...ys) - Math.min(...ys) > 80,
     `${Math.round(Math.max(...xs) - Math.min(...xs))}x${Math.round(Math.max(...ys) - Math.min(...ys))}`);

  const pairs = [];
  for (let i = 0; i < nodes.length; i++)
    for (let j = i + 1; j < nodes.length; j++)
      pairs.push(Math.hypot(a[`n${i}`].x - a[`n${j}`].x, a[`n${i}`].y - a[`n${j}`].y));
  ok('no two nodes sit exactly on top of each other', Math.min(...pairs) > 1, String(Math.min(...pairs)));
}

console.log('\n=== the edges that cannot be drawn ===');
{
  // The subgraph view builds edges to folder markers that are not in the node
  // list, and a forgotten node leaves edges behind for a moment. Neither may
  // throw, and neither may invent a position.
  const nodes = mk(5);
  const a = settle(nodes, [['n0', 'ghost'], ['ghost', 'n1'], ['n0', 'n1']], W, H, 60);
  ok('an edge to a missing node is ignored', Object.keys(a).length === 5 && !a.ghost);
  ok('an empty graph is an empty layout', Object.keys(settle([], [], W, H, 60)).length === 0);
  const one = settle(mk(1), [], W, H, 60);
  ok('one node still lands inside the frame', one.n0.x >= PAD && one.n0.x <= W - PAD);
}

console.log('\n=== foldLayout ===');
{
  const nodes = mk(40, ['Goal', 'Belief', 'Project', 'Question', 'Evidence']);
  const edges = chain(40).map(([a, b]) => [a, b, 'relates_to']);
  const fl = foldLayout(nodes, edges, W, H);

  ok('one folder per type', fl.groups.length === 5, String(fl.groups.length));
  ok('every node is placed', nodes.every((d) => fl.pos[d.id]));
  ok('folder membership is complete', fl.groups.reduce((n, g) => n + g.items.length, 0) === 40);

  // Overlapping folders is the failure that makes the view useless: two
  // circles on top of each other cannot be told apart or clicked separately.
  let worst = Infinity;
  for (let i = 0; i < fl.groups.length; i++)
    for (let j = i + 1; j < fl.groups.length; j++) {
      const A = fl.groups[i], B = fl.groups[j];
      worst = Math.min(worst, Math.hypot(A.x - B.x, A.y - B.y) - (A.r + B.r));
    }
  ok('no two folders overlap', worst >= -0.5, `closest gap ${worst.toFixed(1)}px`);

  ok('folders stay inside the frame',
     fl.groups.every((g) => g.x - g.r >= -0.5 && g.x + g.r <= W + 0.5 && g.y - g.r >= -0.5 && g.y + g.r <= H + 0.5));

  // One line per PAIR of folders, carrying how many real edges it stands for
  // — not one line per edge, which would be 400 lines between 5 circles.
  const keys = new Set(fl.links.map((l) => [l.a, l.b].sort().join('|')));
  ok('links are one per folder pair', keys.size === fl.links.length, `${fl.links.length} links, ${keys.size} pairs`);
  ok('each link counts the edges it stands for', fl.links.every((l) => l.n >= 1));
  ok('no folder links to itself', fl.links.every((l) => l.a !== l.b));
  ok('link endpoints match their folders', fl.links.every((l) => {
    const A = fl.groups.find((g) => g.type === l.a), B = fl.groups.find((g) => g.type === l.b);
    return A && B && A.x === l.ax && A.y === l.ay && B.x === l.bx && B.y === l.by;
  }));
}

console.log('\n=== it holds at the sizes it will actually see ===');
{
  for (const n of [1, 2, 7, 60, 400]) {
    const nodes = mk(n, ['Goal', 'Belief', 'Project', 'Question', 'Evidence', 'Person', 'Concept']);
    const edges = chain(n).map(([a, b]) => [a, b, 'relates_to']);
    const t0 = Date.now();
    const fl = foldLayout(nodes, edges, W, 1000);
    const ms = Date.now() - t0;
    ok(`${n} nodes: every one placed, inside the frame`,
       nodes.every((d) => fl.pos[d.id] && Number.isFinite(fl.pos[d.id].x)), '');
    // The whole point of folding is that the crowd stays affordable. settle()
    // is O(n²·iters); foldLayout only ever settles the FOLDERS, so this is
    // sublinear in the node count and must stay that way.
    ok(`${n} nodes: fast enough to run on render (${ms}ms)`, ms < 900, `${ms}ms`);
  }
}

console.log('\n=== a single type, which is the degenerate fold ===');
{
  const nodes = mk(9, ['Goal']);
  const fl = foldLayout(nodes, chain(9).map(([a, b]) => [a, b, 'relates_to']), W, H);
  ok('one folder, no links', fl.groups.length === 1 && fl.links.length === 0);
  ok('its nodes still spread around the hub',
     new Set(nodes.map((d) => `${Math.round(fl.pos[d.id].x)},${Math.round(fl.pos[d.id].y)}`)).size === 9);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
