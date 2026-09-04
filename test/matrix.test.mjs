// The comparison lens.
//
// Every other lens draws a graph, because a Thinking Map is a graph. A
// comparison is not — it is options down one side and criteria across the top
// — and almost every field makes one: which solvent, which algorithm, which
// treatment, which policy, which reading, which supplier.
//
// It invents nothing. The matrix is a PROJECTION of the map that already
// exists: criteria are the nodes saying what matters, options are the nodes
// judged against them, and each cell is the edge between the two. So a map
// built by talking is already a comparison, if the thinking was comparative.

import { sanitizeMap } from './.tmp/logos.mjs';
import { buildMatrix, availableLenses, leadLens, LENSES } from './.tmp/logos-layout.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

const DECISION = {
  context: 'deciding',
  nodes: [
    { id: 'sp', type: 'value', label: 'Speed of iteration' },
    { id: 'co', type: 'constraint', label: 'Monthly cost' },
    { id: 'te', type: 'value', label: 'Team familiarity' },
    { id: 'a', type: 'decision', label: 'Postgres' },
    { id: 'b', type: 'decision', label: 'DynamoDB' },
    { id: 'c', type: 'decision', label: 'SQLite' },
  ],
  edges: [
    { from: 'a', to: 'sp', relation: 'supports', strength: 'strong', op: 'relational, familiar' },
    { from: 'a', to: 'co', relation: 'conflicts', strength: 'normal' },
    { from: 'a', to: 'te', relation: 'supports', strength: 'strong' },
    { from: 'b', to: 'sp', relation: 'conflicts' },
    { from: 'b', to: 'co', relation: 'supports', strength: 'weak' },
    { from: 'c', to: 'co', relation: 'supports', strength: 'strong' },
    { from: 'c', to: 'te', relation: 'relates' },
  ],
};

console.log('=== the comparison the map is already making ===');
{
  const m = sanitizeMap(DECISION);
  const mx = buildMatrix(m);
  ok('a comparison is found', !!mx);
  ok('the criteria are what matters', mx.criteria.map((c) => c.id).join(',') === 'sp,co,te', mx.criteria.map((c) => c.id).join(','));
  ok('the options are what is judged', mx.options.map((o) => o.id).join(',') === 'a,b,c', mx.options.map((o) => o.id).join(','));
  ok('the grid is complete', mx.cells.length === 3 && mx.cells.every((r) => r.length === 3));

  const at = (o, c) => mx.cells[mx.options.findIndex((x) => x.id === o)][mx.criteria.findIndex((x) => x.id === c)];
  ok('supports reads as doing well', at('a', 'sp').verdict === 'good');
  ok('conflicts reads as doing badly', at('a', 'co').verdict === 'bad');
  ok('relates reads as mentioned, not judged', at('c', 'te').verdict === 'noted');
  ok('strength carries through', at('a', 'sp').strength === 'strong');
  ok('and the reason with it', at('a', 'sp').note === 'relational, familiar');

  // The whole point: a blank is a question nobody asked.
  ok('an unasked pairing is unknown', at('b', 'te').verdict === 'unknown');
  ok('with no invented strength', at('b', 'te').strength === undefined);
  ok('and they are counted', mx.unknowns === 2, String(mx.unknowns));
}

console.log('\n=== it is offered, and it leads ===');
{
  const m = sanitizeMap(DECISION);
  const lenses = availableLenses(m);
  ok('Compare is offered', lenses.includes('matrix'), lenses.join(','));
  // When someone IS comparing, the table is what they came for — the same
  // reasoning that makes a solution chain or a plot lead.
  ok('and it leads', leadLens(lenses, false) === 'matrix', leadLens(lenses, false));
  ok('the lens has a label', LENSES.some((l) => l.id === 'matrix' && l.label === 'Compare'));
  ok('and a caption that is a question', LENSES.find((l) => l.id === 'matrix').caption.includes('?'));

  // A maths scene is more specific, so it still wins.
  const withViz = sanitizeMap({ ...DECISION, context: 'math',
    viz: { kind: 'function', expr: 'x^2', view: { xMin: -5, xMax: 5 } } });
  const vl = availableLenses(withViz);
  ok('a scene still leads over a comparison', leadLens(vl, !!withViz.viz) !== 'matrix' || !vl.includes('plot'));
}

console.log('\n=== what is NOT a comparison ===');
{
  const one = (nodes, edges) => buildMatrix(sanitizeMap({ context: 'deciding', nodes, edges }));
  // One criterion is a description, not a comparison.
  ok('one criterion is refused', one(
    [{ id: 'v', type: 'value', label: 'V' }, { id: 'a', type: 'decision', label: 'A' }, { id: 'b', type: 'decision', label: 'B' }],
    [{ from: 'a', to: 'v', relation: 'supports' }, { from: 'b', to: 'v', relation: 'conflicts' }]) === null);
  // One option is a description too.
  ok('one option is refused', one(
    [{ id: 'v', type: 'value', label: 'V' }, { id: 'w', type: 'value', label: 'W' }, { id: 'a', type: 'decision', label: 'A' }],
    [{ from: 'a', to: 'v', relation: 'supports' }, { from: 'a', to: 'w', relation: 'conflicts' }]) === null);
  // Criteria with nothing judged against them.
  ok('criteria alone are refused', one(
    [{ id: 'v', type: 'value', label: 'V' }, { id: 'w', type: 'value', label: 'W' }], []) === null);
  // An ordinary conversation is not a comparison.
  ok('a plain map is refused', one(
    [{ id: 'a', type: 'concept', label: 'A' }, { id: 'b', type: 'concept', label: 'B' }],
    [{ from: 'a', to: 'b', relation: 'relates' }]) === null);
  ok('an empty map is refused', buildMatrix(sanitizeMap({ context: 'deciding', nodes: [], edges: [] })) === null);
  ok('and Compare is not offered then', !availableLenses(sanitizeMap({
    context: 'deciding', nodes: [{ id: 'a', type: 'idea', label: 'A' }], edges: [] })).includes('matrix'));
}

console.log('\n=== evidence and questions are material, not candidates ===');
{
  // A piece of evidence supporting a criterion is not an OPTION being weighed
  // against it; putting it in the table would compare a fact with a choice.
  const m = sanitizeMap({
    context: 'deciding',
    nodes: [
      { id: 'v', type: 'value', label: 'Cost' }, { id: 'w', type: 'value', label: 'Speed' },
      { id: 'a', type: 'decision', label: 'A' }, { id: 'b', type: 'decision', label: 'B' },
      { id: 'e', type: 'evidence', label: 'The 2024 benchmark' },
      { id: 'q', type: 'question', label: 'What about latency?' },
    ],
    edges: [
      { from: 'a', to: 'v', relation: 'supports' }, { from: 'a', to: 'w', relation: 'conflicts' },
      { from: 'b', to: 'v', relation: 'conflicts' }, { from: 'b', to: 'w', relation: 'supports' },
      { from: 'e', to: 'w', relation: 'supports' }, { from: 'q', to: 'v', relation: 'relates' },
    ],
  });
  const mx = buildMatrix(m);
  ok('only the candidates are rows', mx.options.map((o) => o.id).join(',') === 'a,b', mx.options.map((o) => o.id).join(','));
  ok('evidence is not a row', !mx.options.some((o) => o.type === 'evidence'));
  ok('nor is a question', !mx.options.some((o) => o.type === 'question'));
}

console.log('\n=== two claims about one pairing ===');
{
  // A conversation can say a thing twice. The stronger claim wins rather than
  // the table hiding the disagreement behind an average.
  const m = sanitizeMap({
    context: 'deciding',
    nodes: [
      { id: 'v', type: 'value', label: 'V' }, { id: 'w', type: 'value', label: 'W' },
      { id: 'a', type: 'decision', label: 'A' }, { id: 'b', type: 'decision', label: 'B' },
    ],
    edges: [
      { from: 'a', to: 'v', relation: 'relates', strength: 'weak' },
      { from: 'a', to: 'v', relation: 'conflicts', strength: 'strong' },
      { from: 'a', to: 'w', relation: 'supports' },
      { from: 'b', to: 'v', relation: 'supports' }, { from: 'b', to: 'w', relation: 'conflicts' },
    ],
  });
  const mx = buildMatrix(m);
  const cell = mx.cells[0][0];
  ok('the stronger claim stands', cell.verdict === 'bad' && cell.strength === 'strong', JSON.stringify(cell));
}

console.log('\n=== bounded, and it reads either direction ===');
{
  // An edge pointing from the criterion to the option says the same thing.
  const rev = buildMatrix(sanitizeMap({
    context: 'deciding',
    nodes: [
      { id: 'v', type: 'value', label: 'V' }, { id: 'w', type: 'value', label: 'W' },
      { id: 'a', type: 'decision', label: 'A' }, { id: 'b', type: 'decision', label: 'B' },
    ],
    edges: [
      { from: 'v', to: 'a', relation: 'supports' }, { from: 'w', to: 'a', relation: 'conflicts' },
      { from: 'v', to: 'b', relation: 'conflicts' }, { from: 'w', to: 'b', relation: 'supports' },
    ],
  }));
  ok('an edge either way is read', !!rev && rev.options.length === 2);
  ok('and judged the same', rev.cells[0][0].verdict === 'good');

  // A wide comparison is capped rather than rendering off the screen.
  // Interleaved because sanitizeMap keeps only the first 16 nodes, and a test
  // that put every criterion first would be measuring that cap instead.
  const wide = { context: 'deciding', nodes: [], edges: [] };
  for (let i = 0; i < 8; i++) {
    wide.nodes.push({ id: `c${i}`, type: 'value', label: `Criterion ${i}` });
    wide.nodes.push({ id: `o${i}`, type: 'decision', label: `Option ${i}` });
  }
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
    wide.edges.push({ from: `o${i}`, to: `c${j}`, relation: i % 2 ? 'supports' : 'conflicts' });
  }
  const many = buildMatrix(sanitizeMap(wide));
  ok('a wide comparison survives', !!many);
  ok('options are capped', many.options.length <= 8, String(many.options.length));
  ok('criteria are capped', many.criteria.length <= 8, String(many.criteria.length));
  ok('and the grid stays rectangular', many.cells.every((r) => r.length === many.criteria.length));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
