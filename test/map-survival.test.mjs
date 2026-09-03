// What it takes to lose somebody's thinking.
//
// An empty Thinking Map is the most expensive failure Logos has: it is
// indistinguishable, from the outside, from the product having stopped
// working. Everything here is about a map that should have drawn and did not.
//
// The bug this suite exists to prevent shipped: a node whose `type` was not
// one of the thirty-four was dropped entirely — label and all — so a
// conversation about chemistry or biology, where the extractor reasonably
// reaches for "hypothesis" or "observation" or "mechanism", produced a map
// with nothing on it.

import { sanitizeMap, NODE_TYPES, RELATIONS } from './.tmp/logos.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

const map = (nodes, edges = []) => sanitizeMap({ context: 'learning', nodes, edges });

console.log('=== a thought is never lost for having an unfamiliar type ===');
{
  // Exactly what an extractor says about a titration, and not one of these
  // words is in NODE_TYPES.
  const chemistry = [
    { id: 'a', type: 'hypothesis', label: 'The equivalence point is where moles match' },
    { id: 'b', type: 'observation', label: 'pH jumps sharply near 25 mL' },
    { id: 'c', type: 'mechanism', label: 'The buffer resists change until it is spent' },
    { id: 'd', type: 'effect', label: 'The curve flattens either side' },
    { id: 'e', type: 'variable', label: 'Volume of base added' },
  ];
  const m = map(chemistry);
  ok('every node survives', m.nodes.length === 5, `${m.nodes.length}/5: ${JSON.stringify(m.nodes.map(n => n.label))}`);
  ok('and keeps its label exactly', m.nodes[0].label === 'The equivalence point is where moles match');
  ok('every type is a real one', m.nodes.every((n) => NODE_TYPES.includes(n.type)), JSON.stringify(m.nodes.map(n => n.type)));

  // Near misses draw as the right shape, which is what the aliases are for.
  const byId = Object.fromEntries(m.nodes.map((n) => [n.id, n.type]));
  ok('a hypothesis is a conjecture', byId.a === 'conjecture');
  ok('an observation is evidence', byId.b === 'evidence');
  ok('an effect is a consequence', byId.d === 'consequence');
  ok('a variable is an unknown', byId.e === 'unknown');
}

console.log('\n=== anything else still lives, as an idea ===');
{
  const odd = map([
    { id: 'a', type: 'wibble', label: 'Something they actually said' },
    { id: 'b', type: '', label: 'And another' },
    { id: 'c', label: 'With no type at all' },
    { id: 'd', type: 42, label: 'Or a nonsense one' },
    { id: 'e', type: null, label: 'Or none' },
  ]);
  ok('all five survive', odd.nodes.length === 5, `${odd.nodes.length}/5`);
  ok('all as ideas', odd.nodes.every((n) => n.type === 'idea'));
  ok('with their labels intact', odd.nodes[0].label === 'Something they actually said');
}

console.log('\n=== what DOES still disqualify a node ===');
{
  // The label is the thinking. Without one there is nothing to draw, and
  // without an id nothing can point at it.
  const bad = map([
    { id: 'a', type: 'idea' },                       // no label
    { id: '', type: 'idea', label: 'no id' },
    { type: 'idea', label: 'also no id' },
    { id: 'd', type: 'idea', label: '   ' },         // whitespace is not a label
    { id: 'e', type: 'idea', label: 'kept' },
  ]);
  ok('only the whole one survives', bad.nodes.length === 1 && bad.nodes[0].id === 'e', JSON.stringify(bad.nodes));

  // A repeated id is one node, not two.
  const dupe = map([
    { id: 'a', type: 'idea', label: 'first' },
    { id: 'a', type: 'idea', label: 'second' },
  ]);
  ok('a repeated id collapses', dupe.nodes.length === 1 && dupe.nodes[0].label === 'first');
}

console.log('\n=== a connection is not deleted for being oddly named ===');
{
  const m = map(
    [{ id: 'a', type: 'idea', label: 'A' }, { id: 'b', type: 'idea', label: 'B' }],
    [
      { from: 'a', to: 'b', relation: 'supports' },
      { from: 'b', to: 'a', relation: 'causes' },      // not a relation we know
      { from: 'a', to: 'b', relation: 42 },
    ]
  );
  ok('the known relation is kept as itself', m.edges.some((e) => e.relation === 'supports'));
  ok('the unknown one survives as relates', m.edges.some((e) => e.relation === 'relates'), JSON.stringify(m.edges));
  ok('every relation is a real one', m.edges.every((e) => RELATIONS.includes(e.relation)));
}

console.log('\n=== an edge still needs both ends ===');
{
  const m = map(
    [{ id: 'a', type: 'idea', label: 'A' }],
    [
      { from: 'a', to: 'ghost', relation: 'supports' },
      { from: 'ghost', to: 'a', relation: 'supports' },
      { from: 'a', to: 'a', relation: 'supports' },
    ]
  );
  ok('edges into nothing are dropped', m.edges.every((e) => e.from === 'a' && e.to === 'a') || m.edges.length === 0,
    JSON.stringify(m.edges));
  const ids = new Set(m.nodes.map((n) => n.id));
  ok('no edge points at a node that is not there', m.edges.every((e) => ids.has(e.from) && ids.has(e.to)));
}

console.log('\n=== the shape of a real conversation still comes through ===');
{
  // Physics, none of whose types are on the list either.
  const m = map(
    [
      { id: 'q', type: 'problem', label: 'Why does the block slide at 30°?' },
      { id: 'h', type: 'hypothesis', label: 'Static friction is exceeded' },
      { id: 'o', type: 'observation', label: 'It holds at 25° and goes at 30°' },
      { id: 'l', type: 'law', label: 'f = μN' },
    ],
    [
      { from: 'o', to: 'h', relation: 'supports' },
      { from: 'l', to: 'h', relation: 'underpins' },
      { from: 'h', to: 'q', relation: 'answers' },
    ]
  );
  ok('four nodes', m.nodes.length === 4);
  ok('three edges', m.edges.length === 3, JSON.stringify(m.edges));
  const byId = Object.fromEntries(m.nodes.map((n) => [n.id, n.type]));
  ok('the problem became a question', byId.q === 'question');
  ok('the law became a theorem', byId.l === 'theorem');
  ok('and the map is not empty, which is the whole point', m.nodes.length > 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
