// The map, edited by hand — from the conversation or from a card.
//
// What is checked is the thing the person asked for: "delete the node about
// X" said in chat takes X off the map, deterministically, with no model in the
// loop; and a node taken off stays off when the extractor rebuilds the map
// from a transcript that still mentions it.

import { applyMapEdits, dropRemoved, findNode, keyOf, readMapCommand } from './.tmp/map-edit.mjs';
import { sanitizeMap, buildMapPrompt } from './.tmp/logos.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

const MAP = sanitizeMap({
  context: 'deciding',
  nodes: [
    { id: 'a', type: 'question', label: 'Should we move to Berlin?' },
    { id: 'b', type: 'constraint', label: 'Rent in Berlin is rising' },
    { id: 'c', type: 'value', label: 'Being near family' },
    { id: 'd', type: 'belief', label: 'Remote work will stay' },
    { id: 'e', type: 'assumption', label: 'Rent in Lisbon is lower' },
  ],
  edges: [
    { from: 'b', to: 'a', relation: 'constrains' },
    { from: 'c', to: 'a', relation: 'relates' },
    { from: 'd', to: 'a', relation: 'supports' },
  ],
});
const labels = (m) => m.nodes.map((n) => n.label);

console.log('=== naming a node ===');
{
  ok('an exact label', findNode(MAP, 'Being near family')?.node?.id === 'c');
  ok('  case and quotes do not count', findNode(MAP, '"being NEAR family"')?.node?.id === 'c');
  ok('a fragment that one label contains', findNode(MAP, 'remote work')?.node?.id === 'd');
  ok('content words that one label holds', findNode(MAP, 'the family one')?.node?.id === 'c');
  ok('an id', findNode(MAP, 'd')?.node?.id === 'd');
  const amb = findNode(MAP, 'rent');
  ok('a word two labels share is a question, not a guess', amb && 'ambiguous' in amb && amb.ambiguous.length === 2, JSON.stringify(amb));
  ok('nothing is nothing', findNode(MAP, 'the weather in Oslo') === null);
  ok('keyOf strips what does not count', keyOf('  “Rent, in Berlin!” ') === 'rent in berlin');
}

console.log('=== reading a command ===');
{
  const r = (t) => readMapCommand(t, MAP);
  const rm = r('delete the node about remote work');
  ok('"delete the node about X" removes X', rm?.edits?.[0]?.op === 'remove' && rm.edits[0].id === 'd', JSON.stringify(rm));
  ok('  and says so with the map\'s own label', /Removed “Remote work will stay” from the map\./.test(rm?.said ?? ''), rm?.said);
  ok('"remove X from the map"', r('remove "Being near family" from the map')?.edits?.[0]?.id === 'c');
  ok('"get rid of X"', r('get rid of the belief that remote work will stay')?.edits?.[0]?.id === 'd');
  ok('"take off X"', r('take off the one about family')?.edits?.[0]?.id === 'c');
  ok('"drop X and Y" takes both', r('drop remote work and being near family')?.edits?.length === 2, JSON.stringify(r('drop remote work and being near family')));
  const rn = r('rename "Being near family" to "Being close to family"');
  ok('"rename X to Y"', rn?.edits?.[0]?.op === 'rename' && rn.edits[0].label === 'Being close to family', JSON.stringify(rn));
  const mk = r('mark the question about Berlin as resolved');
  ok('"mark X as resolved"', mk?.edits?.[0]?.op === 'status' && mk.edits[0].status === 'resolved' && mk.edits[0].id === 'a', JSON.stringify(mk));
  ok('"resolve X"', r('resolve the Berlin question')?.edits?.[0]?.status === 'resolved');
  ok('"reopen X"', r('reopen the Berlin question')?.edits?.[0]?.status === 'open');
  ok('"mark X done" is resolved', r('mark remote work done')?.edits?.[0]?.status === 'resolved');
  const ln = r('connect remote work to being near family');
  ok('"connect X to Y"', ln?.edits?.[0]?.op === 'link' && ln.edits[0].from === 'd' && ln.edits[0].to === 'c', JSON.stringify(ln));
  ok('"disconnect X from Y"', r('disconnect remote work from the Berlin question')?.edits?.[0]?.op === 'unlink');

  // What is NOT a command.
  ok('a question is not a command', r('should I remove the carpet before moving?') === null);
  ok('prose that starts with the verb is not a command when it names nothing on the map', r('drop the formality, talk to me plainly') === null);
  ok('a long paragraph is prose', r('remove ' + 'x'.repeat(230)) === null);
  ok('an empty map has nothing to command', readMapCommand('delete the node about rent', sanitizeMap({ nodes: [], edges: [] })) === null);
  // A miss that plainly meant the map is answered, not forwarded.
  const miss = r('delete the node about the weather');
  ok('a miss that says "node" is a refusal', miss && 'refused' in miss && /Nothing on the map is called/.test(miss.refused), JSON.stringify(miss));
  const amb = r('delete the rent node');
  ok('an ambiguous name asks which', amb && 'refused' in amb && /Which one\?/.test(amb.refused) && /Berlin/.test(amb.refused) && /Lisbon/.test(amb.refused), JSON.stringify(amb));
}

console.log('=== applying edits ===');
{
  const out = applyMapEdits(MAP, [{ op: 'remove', id: 'b' }]);
  ok('the node is gone', !out.map.nodes.some((n) => n.id === 'b'));
  ok('  and its edges with it', !out.map.edges.some((e) => e.from === 'b' || e.to === 'b') && out.map.edges.length === 2);
  ok('  the others are untouched', out.map.nodes.length === 4 && out.map.edges.length === 2);
  ok('  and the removal is remembered by key', out.map.removed?.[0] === 'rent in berlin is rising', JSON.stringify(out.map.removed));
  ok('  said', out.applied[0].said === 'Removed “Rent in Berlin is rising” from the map.');

  const rn = applyMapEdits({ ...MAP, nodes: MAP.nodes.map((n) => (n.id === 'a' ? { ...n, tex: 'x' } : n)) }, [{ op: 'rename', id: 'a', label: '  Move  to Berlin? ' }]);
  ok('a rename sets the label, tidied', rn.map.nodes.find((n) => n.id === 'a').label === 'Move to Berlin?');
  ok('  and drops TeX set for the old wording', rn.map.nodes.find((n) => n.id === 'a').tex === undefined);
  ok('  a rename to nothing is refused, not applied', applyMapEdits(MAP, [{ op: 'rename', id: 'a', label: '  ' }]).refused.length === 1);

  const st = applyMapEdits(MAP, [{ op: 'status', id: 'a', status: 'resolved' }]);
  ok('a status edit sets the status', st.map.nodes.find((n) => n.id === 'a').status === 'resolved');
  ok('  "Marked … resolved."', st.applied[0].said === 'Marked “Should we move to Berlin?” resolved.');

  const ln = applyMapEdits(MAP, [{ op: 'link', from: 'e', to: 'a' }]);
  ok('a link adds one edge', ln.map.edges.length === 4 && ln.map.edges.some((e) => e.from === 'e' && e.to === 'a' && e.relation === 'relates'));
  ok('  linking twice adds nothing', applyMapEdits(ln.map, [{ op: 'link', from: 'a', to: 'e' }]).map.edges.length === 4);
  ok('  to itself is refused', applyMapEdits(MAP, [{ op: 'link', from: 'a', to: 'a' }]).refused.length === 1);
  const ul = applyMapEdits(MAP, [{ op: 'unlink', from: 'a', to: 'b' }]);
  ok('an unlink removes the edge either way round', ul.map.edges.length === 2);

  ok('an unknown id is refused, and nothing else changes', (() => { const o = applyMapEdits(MAP, [{ op: 'remove', id: 'zz' }]); return o.refused.length === 1 && o.map.nodes.length === 5; })());
}

console.log('=== a removal stays removed ===');
{
  const gone = applyMapEdits(MAP, [{ op: 'remove', id: 'b' }]).map;
  // The extractor, reading a transcript that still mentions rent, puts it back
  // under a new id and slightly different casing.
  const fromExtractor = sanitizeMap({
    context: 'deciding',
    nodes: [...gone.nodes, { id: 'n9', type: 'constraint', label: 'Rent in Berlin is rising.' }],
    edges: [...gone.edges, { from: 'n9', to: 'a', relation: 'constrains' }],
  });
  const kept = dropRemoved(fromExtractor, gone.removed);
  ok('the resurrected node is dropped on arrival', !labels(kept).some((l) => /Rent in Berlin/.test(l)), JSON.stringify(labels(kept)));
  ok('  and the edge it brought', !kept.edges.some((e) => e.from === 'n9'));
  ok('  and the memory is carried forward', kept.removed?.[0] === 'rent in berlin is rising');
  ok('  nothing to drop changes nothing but the memory', dropRemoved(MAP, []).nodes.length === 5 && dropRemoved(MAP, undefined) === MAP);

  // Round trip through the sanitizer: storage keeps it.
  const stored = sanitizeMap(JSON.parse(JSON.stringify(gone)), { trust: 'stored' });
  ok('sanitizeMap keeps the removed list', stored.removed?.[0] === 'rent in berlin is rising', JSON.stringify(stored.removed));
  ok('  and refuses junk in it', sanitizeMap({ nodes: [], edges: [], removed: [3, null, ' X '] }).removed?.join() === 'x');
  ok('  absent when empty', !('removed' in sanitizeMap({ nodes: [], edges: [] })));

  // The extractor is told.
  const prompt = buildMapPrompt(gone);
  ok('the prompt names what was removed', /REMOVED BY THE PERSON/.test(prompt) && /- rent in berlin is rising/.test(prompt));
  ok('  and says nothing of it when nothing was', !/REMOVED BY THE PERSON/.test(buildMapPrompt(MAP)));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
