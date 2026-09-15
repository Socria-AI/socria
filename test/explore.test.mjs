// The /explore use cases.
//
// Every exhibit on that page mounts the REAL <ThinkingMap> on these maps, so
// an authoring slip does not fail loudly — it renders. An edge pointing at a
// node that does not exist draws an arrow to nowhere; a type outside the
// ontology is silently dropped by the sanitizer and the node vanishes from
// the marketing page for the product whose whole claim is that it draws your
// reasoning. Hand-written structured data with no schema behind it is exactly
// what a suite is for.
//
// The last block is the one that would otherwise rot: the page's copy names
// the lens each map opens on, and that lens is CHOSEN BY THE PRODUCT, not by
// the page. leadLens prefers a solution chain over a plot, so adding one
// chain-typed node to the derivative map would silently move it off the
// picture the caption is describing. These assertions pin the pairing.

import { SCENARIOS, KINDS } from './.tmp/scenarios.mjs';
import { NODE_TYPES, RELATIONS, THINKING_CONTEXTS } from './.tmp/logos.mjs';
import { availableLenses, leadLens } from './.tmp/logos-layout.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

console.log('=== every map is a map the product can actually draw ===');
for (const s of SCENARIOS) {
  const m = s.map;
  if (!m) { ok(`${s.id} is the map-less one by design`, s.model === 'core'); continue; }

  ok(`${s.id} has a known context`, THINKING_CONTEXTS.includes(m.context), m.context);
  ok(`${s.id} has nodes`, m.nodes.length > 0);

  const ids = new Set(m.nodes.map((n) => n.id));
  ok(`${s.id} node ids are unique`, ids.size === m.nodes.length);

  for (const n of m.nodes) {
    ok(`${s.id}/${n.id} has a type in the ontology`, NODE_TYPES.includes(n.type), n.type);
    ok(`${s.id}/${n.id} has a label`, typeof n.label === 'string' && n.label.length > 0);
  }
  for (const e of m.edges) {
    ok(`${s.id} edge ${e.from}→${e.to} has a known relation`,
      RELATIONS.includes(e.relation), e.relation);
    ok(`${s.id} edge from ${e.from} exists`, ids.has(e.from), e.from);
    ok(`${s.id} edge to ${e.to} exists`, ids.has(e.to), e.to);
    ok(`${s.id} edge ${e.from}→${e.to} is not a self-loop`, e.from !== e.to);
  }

  // Nothing orphaned: a node with no edge sits alone in the corner of the
  // graph and reads as a rendering bug.
  const touched = new Set(m.edges.flatMap((e) => [e.from, e.to]));
  const orphans = m.nodes.filter((n) => !touched.has(n.id)).map((n) => n.id);
  ok(`${s.id} has no orphaned nodes`, orphans.length === 0, orphans.join(','));

  // Small enough to read. Ten nodes overlapped illegibly in a split panel;
  // this is the ceiling that fixed it.
  ok(`${s.id} is legible at panel width (<= 8 nodes)`, m.nodes.length <= 8, m.nodes.length);
}

console.log('\n=== the copy matches what the product will actually show ===');
for (const s of SCENARIOS) {
  if (!s.map) continue;
  const lenses = availableLenses(s.map);
  const lead = leadLens(lenses, !!s.map.viz);
  ok(`${s.id} has a lens to open on`, !!lead, JSON.stringify(lenses));

  // The derivative case exists to show the picture. leadLens puts a solution
  // chain ahead of a plot, so this is the assertion that catches somebody
  // adding a second chain-typed node and quietly turning the exhibit into a
  // step-by-step reading of work nobody is doing.
  if (s.id === 'learning') {
    ok('learning opens on the plot', lead === 'plot', lead);
    ok('and carries a scene to plot', !!s.map.viz);
  }

  // A caption must not name a lens: the lens is derived at render, and a
  // hand-written "Evidence lens —" caption was false the moment leadLens
  // disagreed with it. This is the rule that stopped it recurring.
  ok(`${s.id} caption does not hard-code a lens name`,
    !/\b(graph|structure|tensions|evidence|solution|plot|board)\s+lens\b/i.test(s.caption),
    s.caption);
}

console.log('\n=== the page holds together ===');
{
  ok('ids are unique', new Set(SCENARIOS.map((s) => s.id)).size === SCENARIOS.length);
  ok('every kind is one the filter offers',
    SCENARIOS.every((s) => KINDS.includes(s.kind)));
  ok('every filter except All matches something',
    KINDS.filter((k) => k !== 'All').every((k) => SCENARIOS.some((s) => s.kind === k)),
    KINDS.filter((k) => k !== 'All' && !SCENARIOS.some((s) => s.kind === k)).join(','));
  ok('Logos leads and Core is present',
    SCENARIOS.filter((s) => s.model === 'logos').length >= 4 &&
    SCENARIOS.some((s) => s.model === 'core'));

  for (const s of SCENARIOS) {
    ok(`${s.id} has both halves of an exchange`,
      s.turns.length >= 2 && s.turns[0].role === 'user' &&
      s.turns.some((t) => t.role === 'assistant'));
    // Turns alternate; a thread that does not is a thread nobody has read.
    ok(`${s.id} alternates speakers`,
      s.turns.every((t, i) => t.role === (i % 2 ? 'assistant' : 'user')));
    // Short enough to fit the exhibit rather than scroll out of sight.
    ok(`${s.id} turns fit the frame`,
      s.turns.every((t) => t.content.length <= 210),
      s.turns.map((t) => t.content.length).join(','));
    for (const f of ['title', 'who', 'point', 'caption']) {
      ok(`${s.id} has ${f}`, typeof s[f] === 'string' && s[f].length > 10);
    }
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
