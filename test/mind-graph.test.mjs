// The Mind Graph's pure core.
//
// Three properties matter more than the rest, and each is expensive to get
// wrong and silent when it is:
//
//   FORGETTING HOLDS — delete a node, keep extracting, it stays gone.
//   NOTHING IS OVERWRITTEN — a change produces history, never a lost prior.
//   ONE EVENT IS ONE EVENT — an afternoon does not become a personality.
//
// The rest of this file is the machinery those three depend on.

import { EMPTY_GRAPH, fingerprintNode, normalize, STATUS_WEIGHT, relWeight, classifyStoreError } from './.tmp/types.mjs';
import { resolveNode, typesCompatible } from './.tmp/resolve.mjs';
import { gate, rank, TURN_BUDGET } from './.tmp/gate.mjs';
import { applyCandidates, forgetNode, forgetEdge, challengeNode } from './.tmp/apply.mjs';
import { activate, seedActivation, scoreNode, extractionContext } from './.tmp/activate.mjs';
import { serializeSubgraph, renderMindGraph } from './.tmp/serialize.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));

const T0 = 1_700_000_000_000;
let seq = 0;
const ids = () => `x${++seq}`;
const OPTS = (over = {}) => ({
  now: T0, nextId: ids, budget: TURN_BUDGET,
  provenance: { surface: 'core', conversationId: 'c1' },
  ...over,
});
const C = (type, label, content, kind = 'stated', extra = {}) => ({ type, label, content, kind, ...extra });
const apply = (g, nodes, edges = [], o = {}) => applyCandidates(g, nodes, edges, OPTS(o));

// ── fixtures ────────────────────────────────────────────────────────
function seeded() {
  let g = EMPTY_GRAPH;
  ({ graph: g } = apply(g, [
    C('Project', 'Core 4', 'A Human-First model that judges each turn'),
    C('Organization', 'Socria', 'The product Core 4 belongs to'),
    C('Goal', 'Push frontier models', 'Push frontier models to their limits'),
    C('Concept', 'Prompt Limit', 'The 8k instruction ceiling on custom GPTs'),
    C('Evidence', '8k ceiling', 'Custom GPT instructions cap at 8000 characters'),
  ], [
    { sourceLabel: 'Socria', targetLabel: 'Core 4', relationship: 'works_on', kind: 'stated' },
    { sourceLabel: 'Core 4', targetLabel: 'Push frontier models', relationship: 'motivated_by', kind: 'stated' },
    { sourceLabel: 'Core 4', targetLabel: 'Prompt Limit', relationship: 'constrained_by', kind: 'stated' },
    { sourceLabel: 'Prompt Limit', targetLabel: '8k ceiling', relationship: 'evidence_for', kind: 'stated' },
  ]));
  return g;
}

console.log('=== the graph is built from candidates, not from a list ===');
{
  const g = seeded();
  ok('five nodes landed', g.nodes.length === 5, `${g.nodes.length}`);
  ok('four edges landed', g.edges.length === 4, `${g.edges.length}`);
  ok('a node carries its provenance', g.nodes[0].provenance.length === 1 && g.nodes[0].provenance[0].surface === 'core');
  ok('an edge is a first-class object', !!g.edges[0].id && g.edges[0].createdAt === T0 && g.edges[0].strength > 0);
  ok('edges name both ends by id', g.edges.every((e) => g.nodes.some((n) => n.id === e.sourceId) && g.nodes.some((n) => n.id === e.targetId)));
}

console.log('\n=== FORGETTING HOLDS ===');
{
  let g = seeded();
  const target = g.nodes.find((n) => n.label === 'Prompt Limit');
  const edgesBefore = g.edges.length;
  g = forgetNode(g, target.id, T0);
  ok('the node is gone', !g.nodes.some((n) => n.id === target.id));
  ok('its edges went with it', g.edges.length < edgesBefore && !g.edges.some((e) => e.sourceId === target.id || e.targetId === target.id));
  ok('a tombstone remembers it', g.tombstones.includes(fingerprintNode('Concept', 'Prompt Limit')));

  // Ten more extractions that would all re-derive it.
  for (let i = 0; i < 10; i++) {
    ({ graph: g } = apply(g, [C('Concept', 'Prompt Limit', 'The 8k instruction ceiling on custom GPTs')]));
  }
  ok('ten re-extractions do not resurrect it', !g.nodes.some((n) => n.label === 'Prompt Limit'),
     'this is THE invariant carried over from person-memory');
  // Nor under a different id, nor a different casing.
  ({ graph: g } = apply(g, [C('Concept', 'prompt limit', 'the ceiling')]));
  ({ graph: g } = apply(g, [C('Belief', 'Prompt Limit', 'the ceiling again')]));
  ok('nor under a different case', !g.nodes.some((n) => normalize(n.label) === 'prompt limit'));
  const refused = apply(g, [C('Concept', 'Prompt Limit', 'one more try')]).report.refused;
  ok('and the refusal says why', refused.some((r) => r.reason === 'forgotten'), JSON.stringify(refused));
}

console.log('\n=== ...and it holds against REWORDING, which is the real case ===');
{
  // The original test only re-proposed the IDENTICAL label, which is the one
  // case an exact fingerprint catches. Resolution is fuzzy, so forgetting had
  // to be fuzzy too — "the Berlin offer" and "Berlin job offer" both walked
  // straight past a tombstone for "Berlin offer".
  let g = EMPTY_GRAPH;
  ({ graph: g } = apply(g, [C('Concept', 'Berlin offer', 'A job offer in Berlin at twice the salary')]));
  g = forgetNode(g, g.nodes[0].id, T0);
  for (const [label, content] of [
    ['the Berlin offer', 'The offer from Berlin again'],
    ['Berlin job offer', 'A job offer in Berlin'],
    ['Berlin  offer', 'A job offer in Berlin'],
    ['BERLIN OFFER', 'that offer in Berlin'],
  ]) {
    const r = apply(g, [C('Concept', label, content)]);
    ok(`"${label}" cannot resurrect it`, r.graph.nodes.length === 0,
       `created: ${r.graph.nodes.map((n) => n.label).join(', ')}`);
  }
  // A genuinely different thing still gets in.
  const other = apply(g, [C('Concept', 'Munich offer', 'A different job offer, in Munich')]);
  ok('but an unrelated claim still lands', other.graph.nodes.length === 1, JSON.stringify(other.report.refused));

  // Relationships go too, and stay gone.
  let g2 = EMPTY_GRAPH;
  ({ graph: g2 } = apply(g2, [
    C('Project', 'Core 4', 'The model being built'),
    C('Concept', 'Prompt Limit', 'The instruction ceiling they ran into'),
  ], [{ sourceLabel: 'Core 4', targetLabel: 'Prompt Limit', relationship: 'constrained_by', kind: 'stated' }]));
  const pl = g2.nodes.find((n) => n.label === 'Prompt Limit');
  g2 = forgetNode(g2, pl.id, T0);
  ok('forgetting a node tombstones its edges', g2.tombstones.some((t) => t.startsWith('e:')),
     'otherwise the relationships return if the node is ever re-learned');
}

console.log('\n=== ...and against being RE-TYPED, which the earlier tests could not see ===');
{
  // Every test above picked Concept/Belief — one of the few pairs the
  // COMPATIBLE table happens to list. matchesForgotten used that table as a
  // PRECONDITION, so an unlisted type never reached the label comparison at
  // all, and the suite passed while the check was unreachable for most of the
  // ontology. `type` is an open string; a closed allow-list guarding it is
  // the same mistake gate 2's inverted list exists to fix.
  //
  // Reproduced before this: delete "stalls when scope is open" (Pattern),
  // propose "stalls with open scope" (Tendency) in two conversations — it was
  // created, tombstone never consulted.
  let g = EMPTY_GRAPH;
  ({ graph: g } = apply(g, [C('Pattern', 'stalls when scope is open',
    'Tends to stall when the scope of a task is left open-ended.')]));
  ok('the Pattern landed to begin with', g.nodes.length === 1, JSON.stringify(g.nodes.map((n) => n.label)));
  g = forgetNode(g, g.nodes[0].id, T0);

  // Corroborated across two conversations, so it gets PAST gate 2 and
  // actually reaches the forgetting gate. Without both sightings the refusal
  // says 'generalisation-needs-second-sighting' and proves nothing.
  const re = (type, label, content, conv) =>
    apply(g, [C(type, label, content, 'inferred')], [], { provenance: { surface: 'core', conversationId: conv } });
  for (const [type, label] of [
    ['Tendency', 'stalls with open scope'],
    ['Trait', 'stalls when scope is open'],
    ['Trait', 'stalls on open scope'],
    ['Pattern', 'stalls when the scope is open'],
  ]) {
    const content = 'Stalls whenever the scope of a task is left open-ended.';
    ({ graph: g } = re(type, label, content, 'conv-1'));  // sighting one
    const r = re(type, label, content, 'conv-2');         // sighting two: reaches gate 4
    ok(`${type} "${label}" cannot resurrect it`,
       !r.graph.nodes.length && r.report.refused.some((x) => x.reason === 'forgotten'),
       JSON.stringify(r.report.refused));
  }

  // THE LIMIT, stated rather than asserted around. A tombstone keeps no
  // content, so this is label-only, and a heavy rewording escapes it:
  // "open scope makes them stall" shares two tokens of eight with the
  // tombstone, under the 0.5 bar. Lowering that bar globally would start
  // refusing unrelated claims, which is the worse failure, so the answer is
  // not a looser matcher — it is that the reworded version still needs two
  // conversations and can be deleted again, tombstoning itself.
  const reworded = re('Characteristic', 'open scope makes them stall',
    'Stalls whenever the scope of a task is left open-ended.', 'conv-3');
  ok('a HEAVY rewording does escape the tombstone — known, and bounded',
     reworded.report.refused.some((x) => x.reason === 'generalisation-needs-second-sighting'),
     'it still needs corroboration; this documents the limit, it does not bless it');

  // One word is not a name. Deleting a multi-word claim must not blacklist
  // each word it contains.
  const oneWord = apply(g, [C('Belief', 'scope', 'Scope, as a concept in project work, matters to them.')],
    [], { provenance: { surface: 'core', conversationId: 'c8' } });
  ok('a one-word label is not swallowed by a longer tombstone',
     oneWord.graph.nodes.length === 1, JSON.stringify(oneWord.report.refused));

  // The widening is for REFUSAL only and stops at the occurrence types: a
  // Person must not inherit a Project's tombstone however alike the names.
  let g2 = EMPTY_GRAPH;
  ({ graph: g2 } = apply(g2, [C('Project', 'Hollis', 'A side project named after the street')]));
  g2 = forgetNode(g2, g2.nodes[0].id, T0);
  const person = apply(g2, [C('Person', 'Hollis', 'Their supervisor, who they see on Tuesdays')]);
  ok('a Person still lands despite a Project tombstone of the same name',
     person.graph.nodes.length === 1, JSON.stringify(person.report.refused));

  // And an unrelated claim about the person still gets in normally.
  const other = apply(g, [C('Preference', 'works in the morning',
    'Prefers to do the hard thinking before ten.')], [], { provenance: { surface: 'core', conversationId: 'c9' } });
  ok('an unrelated trait is unaffected', other.graph.nodes.length === 1, JSON.stringify(other.report.refused));
}

console.log('\n=== a failure is classified, because all three look like an empty page ===');
{
  // A missing table, a wrong key and a person with nothing yet produced the
  // same blank Memory page, because loadGraph discarded every error. They now
  // read differently, and this is the judgement that decides which — kept
  // pure so it can be tested, since the previous version of it was wrong in a
  // way nothing caught: it matched a bare "does not exist", which is also
  // Postgres's phrasing for a missing column, function or type, so a failure
  // against a LIVE table was forgiven as "not set up yet".
  const c = classifyStoreError;
  ok('42P01 is a missing table', c({ code: '42P01', message: 'relation "mind_nodes" does not exist' }) === 'missing-tables');
  ok('PGRST205 is a missing table', c({ code: 'PGRST205', message: "Could not find the table 'public.mind_nodes'" }) === 'missing-tables');
  ok('the relation phrasing alone is enough', c({ message: 'relation "mind_pending" does not exist' }) === 'missing-tables');
  ok('42501 is a refusal, not a missing table', c({ code: '42501', message: 'permission denied for table mind_nodes' }) === 'denied');
  ok('permission denied by wording too', c({ message: 'permission denied for table mind_edges' }) === 'denied');

  // The ones that must NOT be read as "not set up yet". Each of these is a
  // live table failing, and calling it missing would report success to
  // somebody whose data did not move.
  for (const [what, err] of [
    ['a missing column', { code: '42703', message: 'column "activation" does not exist' }],
    ['a missing function', { code: '42883', message: 'function foo(text) does not exist' }],
    ['a missing type', { code: '42704', message: 'type "mind_status" does not exist' }],
    ['a constraint violation', { code: '23505', message: 'duplicate key value violates unique constraint' }],
    ['a timeout', { code: '57014', message: 'canceling statement due to statement timeout' }],
    ['no code at all', { message: 'fetch failed' }],
  ]) {
    ok(`${what} is not mistaken for a missing table`, c(err) === 'unavailable', JSON.stringify(err));
  }
}

console.log('\n=== the bound holds when a chain of supersessions exists ===');
{
  // The original fixture had no edges, so the partner pass never ran — and
  // the partner pass was what broke the bound: it tested membership against
  // the set it was adding to, so each partner made its own partner eligible
  // and a 200-node chain came back whole for limit=15.
  let g = EMPTY_GRAPH;
  const nodes = [], edges = [];
  for (let i = 0; i < 60; i++) nodes.push(C('Belief', `Belief ${i}`, `A position number ${i} they once held`));
  for (let i = 0; i < 59; i++) edges.push({ sourceLabel: `Belief ${i}`, targetLabel: `Belief ${i + 1}`, relationship: 'superseded_by', kind: 'stated' });
  ({ graph: g } = apply(g, nodes, edges, { budget: { nodes: 200, edges: 200 } }));
  ok('the chain exists', g.nodes.length === 60 && g.edges.length === 59, `${g.nodes.length}/${g.edges.length}`);

  const sub = activate(g, 'Belief 0', { now: T0, limit: 15 });
  ok('the window is not blown open by it', sub.nodes.length <= 15 + Math.ceil(15 / 3),
     `${sub.nodes.length} returned for limit=15`);
  ok('and a partner still comes along', sub.nodes.length > 1);

  const text = serializeSubgraph(sub, { now: T0, maxTokens: 300 });
  ok('the token ceiling actually bites', text.length / 4 <= 320, `${Math.ceil(text.length / 4)} tokens`);
}

console.log('\n=== a short label is reachable by name ===');
{
  let g = EMPTY_GRAPH;
  ({ graph: g } = apply(g, [C('Concept', 'GPT', 'The model family they build against')]));
  const sub = activate(g, 'what about GPT', { now: T0, limit: 10 });
  ok('a three-letter label can be recalled', sub.nodes.length === 1,
     'anything at or under three characters used to be permanently unreachable');
}

console.log('\n=== a challenge survives being reinforced ===');
{
  let g = EMPTY_GRAPH;
  ({ graph: g } = apply(g, [C('Belief', 'Prefers async', 'They prefer asynchronous work')]));
  g = challengeNode(g, g.nodes[0].id, T0, 'No, I never said that');
  // Twenty-five ordinary sightings, each appending provenance.
  for (let i = 0; i < 25; i++) {
    ({ graph: g } = apply(g, [C('Belief', 'Prefers async', 'They prefer asynchronous work')]));
  }
  const n = g.nodes[0];
  ok('the provenance stays bounded', n.provenance.length <= 26, `${n.provenance.length}`);
  ok('and the challenge is still in it', n.provenance.some((p) => p.note === 'No, I never said that'),
     'a blind tail slice dropped the reason somebody disagreed');
  ok('so is where it originally came from', n.provenance[0].at === T0);
}

console.log('\n=== NOTHING IS OVERWRITTEN ===');
{
  let g = EMPTY_GRAPH;
  ({ graph: g } = apply(g, [C('Belief', 'Custom GPTs suffice', 'Custom GPTs are enough to run Core')]));
  const before = g.nodes[0];

  // A stated change of position.
  ({ graph: g } = apply(g, [
    C('Belief', 'Core needs its own runtime', 'Core needs to run outside a custom GPT', 'stated',
      { replaces: 'Custom GPTs suffice' }),
  ]));
  const old = g.nodes.find((n) => n.id === before.id);
  const fresh = g.nodes.find((n) => n.label === 'Core needs its own runtime');
  ok('the old belief still exists', !!old, 'it must not be deleted');
  ok('and is marked superseded', old.status === 'superseded', old?.status);
  ok('its original words are intact', old.content === 'Custom GPTs are enough to run Core');
  ok('the new belief exists', !!fresh && fresh.status === 'active');
  const link = g.edges.find((e) => e.relationship === 'superseded_by');
  ok('joined by superseded_by', !!link && link.sourceId === old.id && link.targetId === fresh.id);

  // A refinement keeps the old words in provenance.
  let g2 = EMPTY_GRAPH;
  ({ graph: g2 } = apply(g2, [C('Concept', 'Berlin offer', 'A job offer')]));
  ({ graph: g2 } = apply(g2, [C('Concept', 'Berlin offer', 'A job offer in Berlin at twice the salary, starting in March')]));
  const refined = g2.nodes[0];
  ok('a refinement updates the text', refined.content.includes('twice the salary'));
  ok('and keeps what it said before', refined.provenance.some((p) => (p.note ?? '').includes('was: A job offer')));
  ok('without creating a second node', g2.nodes.length === 1, `${g2.nodes.length}`);

  // A conflict leaves both standing.
  let g3 = EMPTY_GRAPH;
  ({ graph: g3 } = apply(g3, [C('Belief', 'Lease ends in June', 'The lease runs to June')]));
  ({ graph: g3 } = apply(g3, [
    C('Belief', 'Lease ends in September', 'The lease runs to September', 'stated',
      { conflictsWith: 'Lease ends in June' }),
  ]));
  ok('both claims stand', g3.nodes.length === 2, `${g3.nodes.length}`);
  ok('both marked contradicted', g3.nodes.every((n) => n.status === 'contradicted'));
  ok('joined by contradicts', g3.edges.some((e) => e.relationship === 'contradicts'));
}

console.log('\n=== ONE EVENT IS ONE EVENT ===');
{
  // The brief's own example, as a test.
  let g = EMPTY_GRAPH;
  const report = [];
  for (let i = 0; i < 10; i++) {
    const r = apply(g, [
      C('Event', 'Tense meeting with Dana', 'A difficult conversation about the deadline', 'inferred'),
      C('Belief', 'Finds conflict difficult', 'They struggle with confrontation', 'inferred'),
      C('Preference', 'Avoids conflict', 'They would rather not disagree openly', 'inferred'),
    ]);
    g = r.graph; report.push(r.report);
  }
  ok('the event is recorded', g.nodes.some((n) => n.type === 'Event'));
  const traits = g.nodes.filter((n) => n.type === 'Belief' || n.type === 'Preference');
  ok('no trait was concluded from inference alone', traits.length === 0,
     `created: ${traits.map((t) => t.label).join(', ')}`);
  // Two gates catch this and register fires first, since `inferred` is not
  // allowed to assert a Belief at all. Either is the right mechanism.
  ok('and the refusal names a gate',
     report[0].refused.some((r) =>
       r.reason === 'generalisation-needs-second-sighting' ||
       r.reason === 'type-not-allowed-for-register'),
     JSON.stringify(report[0].refused));
  // The generalisation gate covers INFERENCE specifically — Socria
  // concluding a trait nobody claimed. A tentative position is the opposite:
  // the person trying one on out loud. That is a report, and it lands, as
  // tentative.
  {
    const one = apply(EMPTY_GRAPH, [C('Preference', 'Avoids conflict', 'They would rather not disagree openly', 'tentative')]);
    ok('a position they voiced lands, marked tentative',
       one.graph.nodes.length === 1 && one.graph.nodes[0].status === 'tentative',
       JSON.stringify(one.report));
    // And a second, stated sighting hardens it.
    const two = apply(one.graph, [C('Preference', 'Avoids conflict', 'They would rather not disagree openly', 'stated')]);
    ok('and a stated repeat hardens it', two.graph.nodes[0].status === 'active' && two.graph.nodes[0].seen === 2);
  }
  // Whereas the same trait, INFERRED, has to be corroborated.
  {
    const claim = C('Assumption', 'Avoids conflict', 'They seem to dislike disagreeing openly', 'inferred');
    const a = apply(EMPTY_GRAPH, [claim]);
    ok('an inferred trait is held back on first sight', a.graph.nodes.length === 0,
       JSON.stringify(a.report.refused));
    ok('  naming the generalisation rule',
       a.report.refused[0].reason === 'generalisation-needs-second-sighting');
    ok('  but the sighting is remembered', a.graph.pending.length === 1 && a.graph.pending[0].sources.length === 1);
    ok('  where retrieval cannot reach it',
       activate(a.graph, 'avoids conflict disagreeing openly', { now: T0, limit: 10 }).nodes.length === 0,
       'a pending claim must never reach a prompt');

    // The SAME conversation saying it again is the same evidence.
    const again = apply(a.graph, [claim]);
    ok('  the same conversation does not corroborate itself', again.graph.nodes.length === 0,
       'one afternoon read twice is still one afternoon');

    // A different conversation does.
    const b = apply(a.graph, [claim], [], { provenance: { surface: 'core', conversationId: 'c2' } });
    ok('a second sighting lets it in', b.graph.nodes.length === 1, JSON.stringify(b.report));
    ok('  as tentative, not fact', b.graph.nodes[0].status === 'tentative');
    ok('  and it leaves pending', b.graph.pending.length === 0, JSON.stringify(b.graph.pending));

    // Forgetting it clears the sighting too, or it creeps back.
    let g4 = forgetNode(b.graph, b.graph.nodes[0].id, T0);
    ok('forgetting clears the pending sighting', g4.pending.length === 0);
    ({ graph: g4 } = apply(g4, [claim], [], { provenance: { surface: 'core', conversationId: 'c3' } }));
    ({ graph: g4 } = apply(g4, [claim], [], { provenance: { surface: 'core', conversationId: 'c4' } }));
    ok('so two more sightings do not revive it', g4.nodes.length === 0,
       'a tombstone outranks corroboration');
  }

  // But a STATED preference is a report, not an inference.
  let g2 = EMPTY_GRAPH;
  ({ graph: g2 } = apply(g2, [C('Preference', 'Reasons from first principles', 'Prefers to reason from first principles', 'stated')]));
  ok('a stated preference goes straight in', g2.nodes.length === 1, `${g2.nodes.length}`);
}

console.log('\n=== a synonym does not get past the gate ===');
{
  // `type` is an open string, so a list of what DOES generalise was one word
  // from being optional. Measured before the list was inverted: Belief,
  // Preference and Assumption were held back while the identical claim typed
  // Trait, Pattern, Tendency, Characteristic, Insight or Concept was believed
  // on one conversation's evidence.
  const claim = (t) => C(t, 'Avoids conflict', 'They consistently avoid disagreeing with anyone', 'inferred');
  for (const t of ['Belief', 'Preference', 'Assumption', 'Trait', 'Pattern',
                   'Tendency', 'Characteristic', 'Insight', 'Concept', 'Disposition']) {
    const r = apply(EMPTY_GRAPH, [claim(t)]);
    ok(`"${t}" needs corroboration`, r.graph.nodes.length === 0,
       `believed on one sighting as ${t}`);
  }
  // Things that HAPPENED are still recorded on one sighting.
  for (const t of ['Event', 'Experience', 'Conversation', 'Person', 'Organization',
                   'Place', 'Project', 'Source', 'Evidence', 'Question', 'Uncertainty']) {
    const r = apply(EMPTY_GRAPH, [C(t, 'The Tuesday meeting', 'A difficult conversation about the deadline', 'inferred')]);
    ok(`"${t}" is recorded as it happens`, r.graph.nodes.length === 1, JSON.stringify(r.report.refused));
  }
}

console.log('\n=== the ledger holds the CLAIM, not the type ===');
{
  const SAME = (id) => ({ provenance: { surface: 'core', conversationId: id } });
  // The same claim arriving under different words is one sighting seen twice.
  let g = EMPTY_GRAPH;
  ({ graph: g } = apply(g, [C('Belief', 'Avoids conflict', 'They avoid disagreeing with people', 'inferred')], [], SAME('c1')));
  ok('the first sighting is held', g.nodes.length === 0 && g.pending.length === 1);
  const second = apply(g, [C('Preference', 'Avoids conflict', 'They tend to avoid disagreeing openly', 'inferred')], [], SAME('c2'));
  ok('a different type in a different conversation corroborates it',
     second.graph.nodes.length === 1,
     'keyed on the type, a genuine pattern could recur for ever and stay unbelievable');

  // Two DIFFERENT claims sharing a name must not vouch for each other.
  let g2 = EMPTY_GRAPH;
  ({ graph: g2 } = apply(g2, [C('Belief', 'Deadlines', 'Deadlines are slipping on the project', 'inferred')], [], SAME('c1')));
  const unrelated = apply(g2, [C('Belief', 'Deadlines', 'They resent whoever sets a deadline', 'inferred')], [], SAME('c2'));
  ok('but two different claims with one name do not', unrelated.graph.nodes.length === 0,
     JSON.stringify(unrelated.graph.pending.map((p) => p.content)));
}

console.log('\n=== the ledger evicts by evidence, not by arrival ===');
{
  const SAME = (id) => ({ provenance: { surface: 'core', conversationId: id } });
  let g = EMPTY_GRAPH;
  // Sightings from several ordinary conversations, each waiting for a second.
  for (let i = 0; i < 5; i++) {
    ({ graph: g } = apply(g, [C('Belief', `Standing ${i}`, `Something inferred about them number ${i}`, 'inferred')], [], SAME(`conv${i}`)));
  }
  ok('they are waiting', g.pending.length === 5, `${g.pending.length}`);

  // Then one uploaded file, producing hundreds of sightings in a single pass.
  for (let i = 0; i < 300; i++) {
    ({ graph: g } = apply(g, [C('Belief', `Flood ${i}`, `Some inferred claim number ${i} about them`, 'inferred')], [], SAME('the-file')));
  }
  ok('the ledger stays bounded', g.pending.length <= 200, `${g.pending.length}`);
  const survivors = g.pending.filter((p) => p.label.startsWith('Standing')).length;
  ok('and the file did not erase what other conversations were waiting on',
     survivors === 5,
     `${survivors} of 5 survived — one document must not wipe a season of standing evidence`);
  ok('the flood crowded out its own instead',
     g.pending.filter((p) => p.label.startsWith('Flood')).length < 300);
}

console.log('\n=== a lone sighting does not refresh its own clock ===');
{
  const SAME = { provenance: { surface: 'core', conversationId: 'c1' } };
  const claim = C('Belief', 'Dislikes meetings', 'They seem to dislike meetings', 'inferred');
  let g = EMPTY_GRAPH;
  ({ graph: g } = apply(g, [claim], [], SAME));
  const first = g.pending[0].lastAt;
  ({ graph: g } = apply(g, [claim], [], { ...SAME, now: T0 + 1_000_000 }));
  ok('repeating it in the same conversation does not extend its life',
     g.pending[0].lastAt === first,
     'it would otherwise sit in the ledger for ever waiting for a second conversation');
}

console.log('\n=== a compatible neighbour does not authorise a generalisation ===');
{
  // The hole every earlier test missed, because they all started from an
  // EMPTY graph. `matchedSeen >= 1` short-circuited gate 2 — and since every
  // node is born with seen = 1, that read as "any compatible neighbour
  // authorises this". Belief, Concept and Assumption all resolve to one
  // another, so the rule got weaker the more the graph knew.
  let g = EMPTY_GRAPH;
  const SAME = { provenance: { surface: 'core', conversationId: 'c1' } };

  // One stated remark about a topic.
  ({ graph: g } = apply(g, [C('Concept', 'Deadlines', 'Deadlines came up at work')], [], SAME));
  const stated = g.nodes[0].content;
  ok('the stated topic is recorded', g.nodes.length === 1);

  // Then, in the SAME conversation, an inferred character claim wearing a
  // label the matcher treats as the same thing.
  const trait = C('Belief', 'Deadlines',
    'They resent deadlines and resent whoever sets them; it is a fixed part of how they work',
    'inferred');
  const r = apply(g, [trait], [], SAME);
  g = r.graph;
  ok('it creates no new node', g.nodes.length === 1, `${g.nodes.length}`);
  ok('and it does NOT rewrite what was said', g.nodes[0].content === stated,
     `content became: ${g.nodes[0].content.slice(0, 70)}`);
  ok('nor does it raise confidence', g.nodes[0].confidence === 0.8, `${g.nodes[0].confidence}`);
  ok('the refusal is reported', r.report.refused.some((x) => x.reason === 'generalisation-needs-second-sighting'),
     JSON.stringify(r.report.refused));
  ok('but the sighting IS recorded', g.pending.length === 1,
     'otherwise reinforcement swallows every occurrence and it can never be corroborated');

  // Repeating it in the same conversation still changes nothing.
  ({ graph: g } = apply(g, [trait], [], SAME));
  ({ graph: g } = apply(g, [trait], [], SAME));
  ok('repetition in one conversation changes nothing', g.nodes[0].content === stated);

  // A DIFFERENT conversation corroborates it — and then it may be believed,
  // as its own node rather than by overwriting somebody's words.
  const other = apply(g, [trait], [], { provenance: { surface: 'core', conversationId: 'c2' } });
  ok('a second conversation lets it in', other.graph.nodes.length >= 1);
  ok('and the stated remark is still intact',
     other.graph.nodes.some((n) => n.content === stated),
     'corroboration must not be a licence to overwrite');
}

console.log('\n=== a hypothesis cannot harden a stated node ===');
{
  let g = EMPTY_GRAPH;
  const SAME = { provenance: { surface: 'core', conversationId: 'c1' } };
  ({ graph: g } = apply(g, [C('Concept', 'The lease', 'The lease runs to June')], [], SAME));
  const before = { ...g.nodes[0] };
  ({ graph: g } = apply(g, [
    C('Assumption', 'The lease', 'They are probably trapped by the lease and cannot move at all', 'hypothesis'),
  ], [], SAME));
  ok('the stated words survive', g.nodes[0].content === before.content, g.nodes[0].content);
  ok('the status is unchanged', g.nodes[0].status === before.status);
  ok('and Socria guessing did not make it surer', g.nodes[0].confidence === before.confidence);
}

console.log('\n=== isolation fails CLOSED without a conversation id ===');
{
  // The bug this pins: notePending stored a missing id as '?' while the gate
  // compared against '', so '?' !== '' read as "a different conversation" and
  // a second sighting in the SAME one was believed. The unit tests passed
  // because they supplied an id; the live client did not send one.
  const claim = C('Belief', 'Dislikes deadlines', 'They seem to resent deadlines', 'inferred');
  const noId = { provenance: { surface: 'core' } };  // no conversationId
  let g = EMPTY_GRAPH;
  ({ graph: g } = apply(g, [claim], [], noId));
  ok('a sighting with no conversation is held back', g.nodes.length === 0);
  ({ graph: g } = apply(g, [claim], [], noId));
  ({ graph: g } = apply(g, [claim], [], noId));
  ({ graph: g } = apply(g, [claim], [], noId));
  ok('and never corroborates itself, however often', g.nodes.length === 0,
     'an unknown conversation is not a second one');

  // A real id still corroborates a genuinely different conversation.
  let g2 = EMPTY_GRAPH;
  ({ graph: g2 } = apply(g2, [claim], [], { provenance: { surface: 'core', conversationId: 'a' } }));
  ({ graph: g2 } = apply(g2, [claim], [], { provenance: { surface: 'core', conversationId: 'b' } }));
  ok('two real conversations still corroborate', g2.nodes.length === 1, JSON.stringify(g2.pending));

  // And a sighting recorded WITHOUT an id cannot be the corroborating one.
  let g3 = EMPTY_GRAPH;
  ({ graph: g3 } = apply(g3, [claim], [], noId));
  ({ graph: g3 } = apply(g3, [claim], [], { provenance: { surface: 'core', conversationId: 'a' } }));
  ok('an anonymous sighting cannot corroborate a named one', g3.nodes.length === 0,
     JSON.stringify(g3.pending));
}

console.log('\n=== register decides what may persist ===');
{
  for (const kind of ['joke', 'hypothetical', 'example', 'temporary']) {
    const r = apply(EMPTY_GRAPH, [C('Belief', 'Moving to Berlin', 'They are moving to Berlin', kind)]);
    ok(`a ${kind} persists nothing`, r.graph.nodes.length === 0, `${r.graph.nodes.length} nodes`);
    ok(`  and says so`, r.report.refused[0]?.reason === 'ephemeral-register');
  }
  const h = apply(EMPTY_GRAPH, [C('Belief', 'Maybe they want out', 'Perhaps they want to leave', 'hypothesis')]);
  ok('a hypothesis cannot assert a belief', h.graph.nodes.length === 0);
  const q = apply(EMPTY_GRAPH, [C('Question', 'Do they want out?', 'Whether they want to leave', 'hypothesis')]);
  ok('but it can record the question', q.graph.nodes.length === 1 && q.graph.nodes[0].status === 'uncertain');
  const e = apply(EMPTY_GRAPH, [C('Event', 'Missed the deadline', 'The March deadline slipped', 'inferred')]);
  ok('an inference can record an event', e.graph.nodes.length === 1 && e.graph.nodes[0].status === 'tentative');
  const tiny = apply(EMPTY_GRAPH, [C('Concept', 'x', 'y')]);
  ok('nothing without substance', tiny.graph.nodes.length === 0 && tiny.report.refused[0].reason === 'no-substance');
}

console.log('\n=== the budget bounds a turn ===');
{
  const many = Array.from({ length: 20 }, (_, i) =>
    C('Concept', `Thing ${i}`, `A distinct concept number ${i} worth remembering`));
  const r = apply(EMPTY_GRAPH, many);
  ok('at most five nodes per turn', r.graph.nodes.length === TURN_BUDGET.nodes, `${r.graph.nodes.length}`);
  ok('the rest are refused, not queued', r.report.refused.filter((x) => x.reason === 'over-budget').length === 15);
  const stated = apply(EMPTY_GRAPH, [
    C('Concept', 'Minor thing', 'Something mentioned once in passing here', 'inferred'),
    C('Decision', 'Took the Berlin job', 'Accepted the offer in Berlin after two weeks', 'stated'),
  ], [], { budget: { nodes: 1, edges: 0 } });
  ok('and the survivor is the weightier one', stated.graph.nodes[0].label === 'Took the Berlin job',
     stated.graph.nodes[0]?.label);
}

console.log('\n=== resolution: the same thing is the same node ===');
{
  let g = EMPTY_GRAPH;
  ({ graph: g } = apply(g, [C('Concept', 'Berlin offer', 'A job offer in Berlin')]));
  ({ graph: g } = apply(g, [C('Concept', 'berlin offer', 'the offer from Berlin')]));
  ok('case is not a new node', g.nodes.length === 1, `${g.nodes.length}`);
  ok('and it was reinforced', g.nodes[0].seen === 2, `seen=${g.nodes[0].seen}`);
  ({ graph: g } = apply(g, [C('Concept', 'the Berlin offer', 'that offer')]));
  ok('containment resolves too', g.nodes.length === 1, `${g.nodes.length}`);
  ok('and the variant is kept as an alias', g.nodes[0].aliases.length > 0, JSON.stringify(g.nodes[0].aliases));

  ok('a Person never resolves to a Project', !typesCompatible('Person', 'Project'));
  ok('a Concept may harden into a Belief', typesCompatible('Concept', 'Belief'));
  let g2 = EMPTY_GRAPH;
  ({ graph: g2 } = apply(g2, [C('Person', 'Dana', 'A colleague on the same team')]));
  ({ graph: g2 } = apply(g2, [C('Project', 'Dana', 'A project codenamed Dana')]));
  ok('so both can exist under one name', g2.nodes.length === 2, `${g2.nodes.length}`);

  ok('confidence rises but never reaches 1', g.nodes[0].confidence < 1 && g.nodes[0].confidence > 0.8);
}

console.log('\n=== recall spreads through edges ===');
{
  const g = seeded();
  const sub = activate(g, 'how is Core 4 going', { now: T0, limit: 20 });
  const labels = sub.nodes.map((n) => n.label);
  ok('the named node is seeded', labels.includes('Core 4'), labels.join(', '));
  ok('its goal comes with it', labels.includes('Push frontier models'), labels.join(', '));
  ok('and the constraint', labels.includes('Prompt Limit'));
  ok('and the evidence two hops away', labels.includes('8k ceiling'), 'two hops: Core 4 -> Prompt Limit -> 8k ceiling');
  ok('the subgraph is connected', sub.edges.length > 0 && sub.edges.every((e) =>
    sub.nodes.some((n) => n.id === e.sourceId) && sub.nodes.some((n) => n.id === e.targetId)),
    'no dangling arrows');
  const unrelated = activate(g, 'what should I cook tonight', { now: T0, limit: 20 });
  ok('an unrelated message activates nothing', unrelated.nodes.length === 0, `${unrelated.nodes.length}`);
}

console.log('\n=== a superseded belief is reachable, and labelled ===');
{
  let g = EMPTY_GRAPH;
  ({ graph: g } = apply(g, [C('Belief', 'Custom GPTs suffice', 'Custom GPTs are enough to run Core')]));
  ({ graph: g } = apply(g, [C('Belief', 'Core needs its own runtime', 'Core needs to run outside a custom GPT', 'stated', { replaces: 'Custom GPTs suffice' })]));
  ok('superseded is discounted, not excluded', STATUS_WEIGHT.superseded === 0.5);
  const sub = activate(g, 'tell me about the runtime', { now: T0, limit: 10 });
  ok('the current belief is recalled', sub.nodes.some((n) => n.label === 'Core needs its own runtime'));
  ok('and the one it replaced comes too', sub.nodes.some((n) => n.status === 'superseded'),
     'a belief shown without its predecessor is misleading');
  const text = serializeSubgraph(sub, { now: T0, maxTokens: 2000 });
  ok('the text marks it superseded', /superseded/.test(text), text.slice(0, 200));
  ok('and names the relationship', /superseded_by/.test(text));
}

console.log('\n=== the window bounds what reaches the prompt ===');
{
  let g = EMPTY_GRAPH;
  for (let i = 0; i < 12; i++) {
    ({ graph: g } = apply(g, [C('Concept', `Topic ${i}`, `A concept about topic number ${i} here`)], [], { budget: { nodes: 5, edges: 5 } }));
  }
  const wide = activate(g, 'Topic 1 Topic 2 Topic 3 Topic 4 Topic 5', { now: T0, limit: 3 });
  ok('the limit is respected', wide.nodes.length <= 3, `${wide.nodes.length}`);
  const text = serializeSubgraph(wide, { now: T0, maxTokens: 20 });
  ok('and the token ceiling trims', text.length / 4 <= 40, `${Math.ceil(text.length / 4)} tokens`);
  ok('the whole graph is never serialized', !text.includes('Topic 11') || wide.nodes.length <= 3);
}

console.log('\n=== private stays out of Logos ===');
{
  let g = EMPTY_GRAPH;
  ({ graph: g } = apply(g, [
    C('Concept', 'The therapy sessions', 'Something weighty they are working through', 'stated', { private: true }),
    C('Project', 'Core 4', 'The model they are building'),
  ]));
  const core = activate(g, 'the therapy sessions and Core 4', { now: T0, limit: 10 });
  ok('Core can recall it', core.nodes.some((n) => n.private));
  const logos = activate(g, 'the therapy sessions and Core 4', { now: T0, limit: 10, excludePrivate: true });
  ok('Logos cannot', !logos.nodes.some((n) => n.private), 'a Logos map can be exported as an image');
  ok('but still sees the rest', logos.nodes.some((n) => n.label === 'Core 4'));
}

console.log('\n=== correction and challenge ===');
{
  let g = seeded();
  const n = g.nodes.find((x) => x.label === 'Core 4');
  g = challengeNode(g, n.id, T0, 'No, that was never the goal');
  const after = g.nodes.find((x) => x.id === n.id);
  ok('a challenged node stays', !!after, 'it is part of the history of being wrong');
  ok('marked contradicted', after.status === 'contradicted');
  ok('with lowered confidence', after.confidence < n.confidence);
  ok('and their words attached', after.provenance.some((p) => p.note === 'No, that was never the goal'));

  const edge = g.edges[0];
  const g2 = forgetEdge(g, edge.id);
  ok('an edge can be forgotten', !g2.edges.some((e) => e.id === edge.id));
  ok('and stays forgotten', g2.tombstones.some((t) => t.startsWith('e:')), JSON.stringify(g2.tombstones.slice(-1)));
}

console.log('\n=== the prompt block ===');
{
  const g = seeded();
  const sub = activate(g, 'Core 4', { now: T0, limit: 10 });
  const block = renderMindGraph(sub, { now: T0, maxTokens: 800 });
  ok('it frames memory as context, not truth', /context, not truth/i.test(block));
  ok('it tells the model to prefer what they say now', /takes precedence/i.test(block));
  ok('it explains the statuses', /superseded or historical/i.test(block));
  ok('and it carries the relationships', /works_on|motivated_by|constrained_by/.test(block), block.slice(-300));
  ok('an empty subgraph renders nothing', renderMindGraph({ nodes: [], edges: [], seeds: [], scores: {} }, { now: T0, maxTokens: 800 }) === '');
}

console.log('\n=== what this conversation wrote is recalled on its next turn (Core 4 eval finding) ===');
{
  const person = { id: 'n-marcus', type: 'Person', label: 'Marcus', content: 'colleague who presented their analysis as his', aliases: [], status: 'active', confidence: 0.8, certainty: 0.8, importance: 0.7, activation: 0.2, seen: 1, private: false, provenance: [{ kind: 'stated', surface: 'core', at: T0, conversationId: 'conv-1' }], createdAt: T0, updatedAt: T0, lastAccessed: T0 };
  const other = { ...person, id: 'n-other', label: 'Lisbon', content: 'a city', provenance: [{ kind: 'stated', surface: 'core', at: T0, conversationId: 'conv-9' }] };
  const g = { ...EMPTY_GRAPH, nodes: [person, other], edges: [] };
  ok('a message sharing no words with it recalls nothing without the conversation', activate(g, 'Angry, mostly.', { now: T0, limit: 10 }).nodes.length === 0);
  const sub = activate(g, 'Angry, mostly.', { now: T0, limit: 10, conversationId: 'conv-1' });
  ok('with it, this conversation\'s node comes back', sub.nodes.some((n) => n.id === 'n-marcus'), JSON.stringify(sub.nodes.map((n) => n.id)));
  ok('and another conversation\'s does not', !sub.nodes.some((n) => n.id === 'n-other'));
}

console.log('\n=== run 5: a replacement under a label already in use is not a second live node ===');
{
  let g = EMPTY_GRAPH;
  ({ graph: g } = apply(g, [
    C('Concept', 'meaning of specificity', 'Specificity is the chance a positive is right'),
    C('Concept', 'specificity applies to the healthy group', 'Specificity is measured on people without the disease'),
  ]));
  ({ graph: g } = apply(g, [C('Concept', 'specificity applies to the healthy group', 'Specificity: the share of healthy people the test correctly calls negative', 'stated', { replaces: 'meaning of specificity' })]));
  const live = g.nodes.filter((n) => normalize(n.label) === normalize('specificity applies to the healthy group') && n.status !== 'superseded');
  ok('one live node under that label', live.length === 1, JSON.stringify(g.nodes.map((n) => [n.label, n.status])));
  ok('  carrying the new content', live[0]?.content.startsWith('Specificity: the share of healthy people'));
  ok('  the replaced node superseded, linked to it', g.nodes.find((n) => n.label === 'meaning of specificity')?.status === 'superseded' && g.edges.some((e) => e.relationship === 'superseded_by' && e.targetId === live[0]?.id), JSON.stringify(g.edges.map((e) => [e.relationship, e.sourceId, e.targetId])));
}

console.log('\n=== run 5: the extractor sees what this conversation already wrote ===');
{
  let g = EMPTY_GRAPH;
  const FACTS = [
    ['Office lease', 'The office lease renews in March at a higher rent'],
    ['Series A timing', 'They plan to raise a Series A after the next product launch'],
    ['Churn in SMB', 'Small-business customers churn at four percent a month'],
    ['Pricing page test', 'An experiment moved annual plans to the top of the pricing page'],
    ['On-call rota', 'Three engineers share the on-call rota every week'],
    ['Data warehouse migration', 'Analytics is moving from Redshift to BigQuery this quarter'],
    ['Board meeting', 'The next board meeting is on the ninth of October'],
    ['Hiring plan', 'Two backend engineers are budgeted for the second half'],
    ['Security audit', 'A SOC 2 readiness review found gaps in access logging'],
    ['Mobile release', 'The iOS release is blocked on App Store review'],
  ];
  ({ graph: g } = apply(g, FACTS.map(([l, c]) => C('Concept', l, c)), [], { provenance: { surface: 'core', conversationId: 'conv-x' }, budget: { ...TURN_BUDGET, nodes: 20 } }));
  ({ graph: g } = apply(g, [C('Concept', 'Hiring freeze', 'The company froze hiring for the rest of the fiscal year')], [], { provenance: { surface: 'core', conversationId: 'conv-y' } }));
  const mine = g.nodes.filter((n) => n.provenance.some((p) => p.conversationId === 'conv-x'));
  const narrow = { nodes: mine.slice(0, 1), edges: [], seeds: [], scores: {} };
  ok('the fixture wrote this conversation\'s nodes', mine.length >= 8, String(mine.length));
  const ctx = extractionContext(narrow, g, 'conv-x');
  ok('every live node of this conversation is listed', mine.every((n) => ctx.nodes.some((m) => m.id === n.id)), String(ctx.nodes.length));
  ok('  nothing added from another conversation', !ctx.nodes.some((n) => n.label === 'Hiring freeze'));
  ok('  and the recalled ones are not duplicated', new Set(ctx.nodes.map((n) => n.id)).size === ctx.nodes.length);
  ok('  capped', extractionContext(narrow, g, 'conv-x', 5).nodes.length === 5);
  ok('no conversation, no change', extractionContext(narrow, g, null) === narrow);
}

console.log('\n=== review before run 6: the replacement path never lets an inference overwrite their words ===');
{
  let g = EMPTY_GRAPH;
  ({ graph: g } = apply(g, [
    C('Belief', 'Office work', 'They prefer working from the office three days a week'),
    C('Belief', 'Remote work', 'They said remote work suits their deep-focus days'),
  ]));
  ({ graph: g } = apply(g, [C('Belief', 'Remote work', 'They secretly resent their manager and want to avoid the office', 'inferred', { replaces: 'Office work' })]));
  const remote = g.nodes.find((n) => n.label === 'Remote work' && n.status !== 'superseded');
  ok('their stated words survive an inferred replacement', remote?.content === 'They said remote work suits their deep-focus days', remote?.content);
  const again = apply(g, [C('Belief', 'Remote work', 'They said remote work suits their deep-focus days', 'stated', { replaces: 'Office work' })]).graph;
  const dup = again.edges.filter((e) => e.relationship === 'superseded_by' && e.targetId === remote?.id).length;
  ok('  and a replayed change adds no second edge', dup <= 1, String(dup));
  const full = { nodes: g.nodes.slice(0, 2), edges: [], seeds: [], scores: {} };
  ok('extraction context adds nothing when recall already fills the limit', extractionContext(full, g, 'c1', 2).nodes.length === 2);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
