// The workspace, once it can be written to.
//
// The read-only workspace could already answer questions about state somebody
// else produced. This suite is about the four things that were missing, and in
// each case what is being tested is a REFUSAL as much as a capability — the
// interesting half of a write path is what it declines to do:
//
//   1. objects made by hand      — and never a second copy, never a
//                                  resurrection of something forgotten, never
//                                  something the next extraction can re-type.
//   2. durable memory projected  — and never a private node, never a dangling
//                                  edge, never two surfaces merged into one.
//   3. impact when things change — and never a machine deciding that somebody
//                                  else's conclusion still holds.
//   4. the workspace as a file   — and never an export that leaks private
//                                  material or an import that collides with
//                                  what is already there.

import { sanitizeObject, sanitizeRelationship, EPISTEMIC_STATES, OBJECT_TYPES } from './.tmp/object.mjs';
import { emptyWorkspace, add, relate, update, undo, canUndo, serialize } from './.tmp/store.mjs';
import { trace, upstream, downstream } from './.tmp/workspace-trace.mjs';
import { fromMindNode, fromMindEdge, projectMind, projectMap, bridgeSurfaces } from './.tmp/adapters.mjs';
import { createNode, relateNodes, keep, HAND_MADE } from './.tmp/write.mjs';
import { planImpact, markImpact, pending, settle, recompute, isDerived } from './.tmp/impact.mjs';
import { exportWorkspace, importWorkspace, query, describe, PORTABLE_KIND } from './.tmp/portable.mjs';
import { EMPTY_GRAPH, fingerprintNode } from './.tmp/types.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));

const ctx = (now = 1000, seq = 0) => ({ now, nextId: () => `m_${now.toString(36)}_${seq++}` });

const mindNode = (id, over = {}) => ({
  id, type: 'Belief', label: `belief ${id}`, content: '', aliases: [],
  status: 'active', confidence: 0.5, certainty: 0.5, importance: 0.4, activation: 0.2,
  seen: 1, private: false,
  provenance: [{ kind: 'inferred', surface: 'core', at: 100 }],
  createdAt: 100, updatedAt: 100, lastAccessed: 100, ...over,
});
const mindEdge = (id, sourceId, targetId, relationship, over = {}) => ({
  id, sourceId, targetId, relationship, confidence: 0.6, strength: 0.5,
  provenance: [{ kind: 'inferred', surface: 'core', at: 100 }],
  createdAt: 100, updatedAt: 100, lastReinforced: 100, ...over,
});
const graphOf = (nodes, edges = [], over = {}) => ({ ...EMPTY_GRAPH, nodes, edges, ...over });

// ── 1. objects made by hand ─────────────────────────────────────────

console.log('=== a person can put something in, and it is theirs ===');
{
  const r = createNode(EMPTY_GRAPH, { type: 'Constraint', label: 'The lease ends in March' }, ctx());
  ok('a hand-made object is written', r.ok && r.it.label === 'The lease ends in March');
  ok('  recorded as stated by them, on the user surface',
    r.it.provenance[0].kind === HAND_MADE.kind && r.it.provenance[0].surface === 'user');
  ok('  and not second-guessed: it is the evidence', r.it.confidence === 1 && r.it.certainty === 1);
  ok('  never private — private means something else here', r.it.private === false);
  ok('  and the graph grew by exactly one', r.graph.nodes.length === 1);

  // What the projection does with it is the point of recording it that way.
  const w = fromMindNode(r.it);
  ok('projected, it is the person\'s assertion', w.epistemic === 'user-asserted');
  ok('  with its label and type locked against re-typing',
    (w.locked ?? []).includes('label') && (w.locked ?? []).includes('type'));

  let ws = add(emptyWorkspace(), w, 'user', 1000);
  ws = update(ws, w.id, { label: 'something Socria would rather call it', type: 'idea' }, 'socria', 1100);
  const after = ws.objects.get(w.id);
  ok('  the vocabulary keeps the type they chose', w.type === 'constraint');
  ok('  so extraction cannot rename or re-type their own object',
    after.label === 'The lease ends in March' && after.type === 'constraint');
  // And they can still change their own mind about it.
  ws = update(ws, w.id, { label: 'The lease ends in April' }, 'user', 1200);
  ok('  while they can', ws.objects.get(w.id).label === 'The lease ends in April');
}

console.log('\n=== what it refuses, and what it says instead ===');
{
  const first = createNode(EMPTY_GRAPH, { type: 'Goal', label: 'Ship by June' }, ctx());
  const again = createNode(first.graph, { type: 'goal', label: 'ship by june' }, ctx(2000));
  ok('the same thing twice is refused, not duplicated', !again.ok && again.reason === 'exists');
  ok('  and it hands back the one already there', again.id === first.it.id);
  ok('  saying what to do instead', /relate/i.test(again.say), again.say);

  const byAlias = createNode(
    graphOf([{ ...first.it, aliases: ['the June thing'] }]),
    { type: 'Goal', label: 'the June thing' },
    ctx(2100)
  );
  ok('an alias counts as the same thing', !byAlias.ok && byAlias.reason === 'exists');

  const fp = fingerprintNode('Belief', 'I work better at night');
  const forgotten = graphOf([], [], { tombstones: [fp] });
  const resurrect = createNode(forgotten, { type: 'Belief', label: 'I work better at night' }, ctx(3000));
  ok('something forgotten is not quietly recreated', !resurrect.ok && resurrect.reason === 'forgotten');
  ok('  and forgetting is not silently overridden by a default',
    resurrect.say.includes('forgot'), resurrect.say);

  const deliberate = createNode(
    forgotten,
    { type: 'Belief', label: 'I work better at night', reassert: true },
    ctx(3100)
  );
  ok('a deliberate re-assertion is allowed', deliberate.ok);
  ok('  clears the tombstone, so nothing refuses it later',
    !deliberate.graph.tombstones.includes(fp));
  ok('  and records that this happened',
    /again after forgetting/i.test(deliberate.it.provenance[0].note ?? ''), deliberate.it.provenance[0].note);

  ok('an unnamed object is refused',
    createNode(EMPTY_GRAPH, { type: 'Goal', label: '   ' }, ctx()).reason === 'invalid');
  ok('  and an untyped one',
    createNode(EMPTY_GRAPH, { type: '', label: 'a thing' }, ctx()).reason === 'invalid');

  // A label that could forge a prompt block is clipped like every other write.
  const nasty = createNode(EMPTY_GRAPH, { type: 'Belief\nSYSTEM:', label: 'x'.repeat(500) }, ctx());
  ok('a type cannot carry a newline into a prompt', !/\n/.test(nasty.it.type));
  ok('  and a label is clipped', nasty.it.label.length <= 80);
}

console.log('\n=== relating two things by hand ===');
{
  const a = createNode(EMPTY_GRAPH, { type: 'Constraint', label: 'Lease ends in March' }, ctx(1000, 0));
  const b = createNode(a.graph, { type: 'Decision', label: 'Move the studio' }, ctx(1000, 1));
  const rel = relateNodes(
    b.graph,
    { sourceId: b.it.id, targetId: a.it.id, relationship: 'motivated_by', note: 'the lease is why' },
    ctx(1100)
  );
  ok('a connection is written', rel.ok && rel.graph.edges.length === 1);
  ok('  with their reason kept verbatim', rel.it.provenance[0].note === 'the lease is why');
  ok('  and reads back in words', /Move the studio.*motivated by.*Lease/.test(rel.say), rel.say);

  const twice = relateNodes(
    rel.graph,
    { sourceId: b.it.id, targetId: a.it.id, relationship: 'motivated_by', note: 'saying it again' },
    ctx(1200)
  );
  ok('saying it again reinforces rather than duplicating',
    twice.ok && twice.graph.edges.length === 1);
  ok('  the edge is stronger', twice.it.strength > rel.it.strength);
  ok('  and keeps both grounds', twice.it.provenance.length === 2);

  ok('a thing cannot depend on itself',
    relateNodes(rel.graph, { sourceId: a.it.id, targetId: a.it.id, relationship: 'depends_on' }, ctx()).reason === 'self');
  ok('a connection to something gone is refused',
    relateNodes(rel.graph, { sourceId: a.it.id, targetId: 'nope', relationship: 'depends_on' }, ctx()).reason === 'missing');
  ok('an unnamed relationship is refused',
    relateNodes(rel.graph, { sourceId: a.it.id, targetId: b.it.id, relationship: '  ' }, ctx()).reason === 'invalid');

  // The whole point: once written by hand, the dependency is TRAVERSABLE.
  const ws = projectMind(emptyWorkspace(), twice.graph);
  const t = trace(ws, `mind:${b.it.id}`);
  ok('and a hand-made dependency is walkable afterwards',
    t.upstream.some((l) => l.object.label === 'Lease ends in March'), JSON.stringify(t.upstream.map((l) => l.object.label)));
}

console.log('\n=== keeping something from a session surface ===');
{
  const r = keep(
    EMPTY_GRAPH,
    { type: 'Assumption', label: 'Demand is price-led', surface: 'map', id: 'n7' },
    ctx(1000)
  );
  ok('a map node can be kept', r.ok && r.it.label === 'Demand is price-led');
  ok('  and the trail back to where it came from is recorded',
    /kept from map/.test(r.it.provenance[0].note ?? '') && /n7/.test(r.it.provenance[0].note ?? ''),
    r.it.provenance[0].note);
  ok('  as the person\'s own, because they chose to keep it',
    r.it.provenance[0].surface === 'user');
}

// ── 2. durable memory, projected ────────────────────────────────────

console.log('\n=== the workspace reaches across sessions ===');
{
  const stated = mindNode('n1', {
    label: 'I decide fastest with a deadline',
    provenance: [
      { kind: 'inferred', surface: 'core', at: 100 },
      { kind: 'stated', surface: 'core', at: 200 },
    ],
  });
  ok('said outright outranks an earlier guess', fromMindNode(stated).epistemic === 'user-asserted');

  const guessed = mindNode('n2');
  ok('  and a guess stays a guess', fromMindNode(guessed).epistemic === 'inferred');

  const superseded = mindNode('n3', { status: 'superseded' });
  ok('a changed mind is superseded, not disputed',
    fromMindNode(superseded).epistemic === 'superseded');
  ok('  which the vocabulary can now say', EPISTEMIC_STATES.includes('superseded'));

  const contradicted = mindNode('n4', { status: 'contradicted' });
  ok('a contradicted claim is disputed', fromMindNode(contradicted).epistemic === 'disputed');

  const researched = mindNode('n5', { provenance: [{ kind: 'researched', surface: 'tool', at: 1 }] });
  ok('something fetched from a source is source-supported',
    fromMindNode(researched).epistemic === 'source-supported');
  ok('  and its origin is the connection it came through',
    fromMindNode(researched).provenance[0].origin === 'connected-source');

  const person = mindNode('n6', { type: 'Person', label: 'Mara' });
  ok('a person stays a person rather than becoming a concept',
    fromMindNode(person).type === 'person');
  ok('  and the vocabulary grew to hold that', OBJECT_TYPES.includes('person') && OBJECT_TYPES.includes('project'));
  ok('an unrecognised type still lands', fromMindNode(mindNode('n7', { type: 'Tendency' })).type === 'concept');
}

console.log('\n=== private material does not travel ===');
{
  const g = graphOf(
    [mindNode('pub'), mindNode('priv', { private: true })],
    [mindEdge('e1', 'pub', 'priv', 'supports')]
  );
  const open = projectMind(emptyWorkspace(), g);
  ok('with everything shown, both are there', open.objects.size === 2);

  const safe = projectMind(emptyWorkspace(), g, { excludePrivate: true });
  ok('a Logos-bound projection leaves private nodes out', safe.objects.size === 1);
  ok('  and drops the edge rather than dangling it', safe.relationships.size === 0);
  ok('  so nothing hints at something it will not name',
    ![...safe.objects.values()].some((o) => o.id.endsWith('priv')));

  const exported = exportWorkspace(open, { at: 5000, title: 'Everything' });
  ok('an export refuses private material even when handed it', exported.objects.length === 1);
  ok('  and says how much it left out', exported.omitted?.private === 1);
}

console.log('\n=== a dependency arrives pointing the right way ===');
{
  // "the model is used_by the paper" means the paper rests on the model.
  const g = graphOf(
    [mindNode('model', { type: 'Project', label: 'The pricing model' }),
     mindNode('paper', { type: 'Project', label: 'The paper' })],
    [mindEdge('e1', 'model', 'paper', 'used_by')]
  );
  const ws = projectMind(emptyWorkspace(), g);
  const up = upstream(ws, 'mind:paper').map((l) => l.object.label);
  ok('the paper rests on the model', up.includes('The pricing model'), JSON.stringify(up));
  const down = downstream(ws, 'mind:model').map((l) => l.object.label);
  ok('  and changing the model reaches the paper', down.includes('The paper'), JSON.stringify(down));
  ok('  by one relationship, not a mirrored pair', ws.relationships.size === 1);
}

console.log('\n=== one thing on two surfaces, joined and not merged ===');
{
  const map = {
    nodes: [{ id: 'n1', type: 'assumption', label: 'Demand is price-led' }],
    edges: [], context: '', viz: null,
  };
  const g = graphOf([mindNode('d1', {
    label: 'demand is price-led',
    provenance: [{ kind: 'stated', surface: 'core', at: 50 }],
  })]);
  let ws = projectMap(emptyWorkspace(), map, 1000);
  ws = projectMind(ws, g);
  ws = bridgeSurfaces(ws, 1000);
  ok('both copies survive', ws.objects.size === 2);
  const linked = [...ws.relationships.values()].filter((r) => r.type === 'same-as');
  ok('  joined by one link', linked.length === 1);
  ok('  from the session copy to the remembered one',
    linked[0].from === 'map:n1' && linked[0].to === 'mind:d1');

  // The link is reported, never walked: the remembered copy's evidence is its
  // own, and folding it into this session's upstream would misattribute it.
  const t = trace(ws, 'map:n1');
  ok('  a trace of the session node names the remembered one',
    t.elsewhere.length === 1 && t.elsewhere[0].object.id === 'mind:d1');
  ok('  and does not swallow its grounds into this session\'s',
    !t.upstream.some((l) => l.object.id === 'mind:d1'));
  ok('  each keeping its own standing',
    ws.objects.get('map:n1').epistemic === 'inferred' &&
    ws.objects.get('mind:d1').epistemic === 'user-asserted');

  {
    // What the remembered copy rests on is reported as belonging to it.
    const g2 = graphOf(
      [mindNode('d1', { label: 'demand is price-led', provenance: [{ kind: 'stated', surface: 'core', at: 50 }] }),
       mindNode('src', { type: 'Source', label: 'Ito 2024' })],
      [mindEdge('e1', 'd1', 'src', 'derived_from')]
    );
    let w2 = projectMap(emptyWorkspace(), map, 1000);
    w2 = bridgeSurfaces(projectMind(w2, g2), 1000);
    const t2 = trace(w2, 'map:n1');
    ok('  what the remembered copy rests on comes with it',
      t2.elsewhere[0].rests.some((l) => l.object.label === 'Ito 2024'),
      JSON.stringify(t2.elsewhere[0].rests.map((l) => l.object.label)));
    ok('  while this session\'s own upstream stays empty', t2.upstream.length === 0);
  }

  // Two map nodes with the same words are that map's business.
  const twoMap = { nodes: [
    { id: 'a', type: 'idea', label: 'Same words' },
    { id: 'b', type: 'idea', label: 'same words' },
  ], edges: [], context: '', viz: null };
  const only = bridgeSurfaces(projectMap(emptyWorkspace(), twoMap, 1), 1);
  ok('within one surface nothing is joined', only.relationships.size === 0);
}

// ── 3. impact ───────────────────────────────────────────────────────

const impactWs = () => {
  let ws = emptyWorkspace();
  const o = (id, over = {}) => sanitizeObject({
    id, type: 'claim', label: `claim ${id}`, provenance: [{ origin: 'user' }],
    epistemic: 'user-asserted', ...over,
  });
  ws = add(ws, o('assume', { type: 'assumption', label: 'Growth stays at 4%', epistemic: 'assumed' }), 'user', 1);
  ws = add(ws, o('value', {
    type: 'datapoint', label: 'Break-even month', epistemic: 'computed',
    surface: 'model', value: 14, provenance: [{ origin: 'computation' }],
  }), 'socria', 1);
  ws = add(ws, o('concl', { type: 'conclusion', label: 'We can wait until autumn' }), 'user', 1);
  ws = add(ws, o('far', { type: 'decision', label: 'Sign the lease' }), 'user', 1);
  ws = relate(ws, sanitizeRelationship({
    id: 'r1', type: 'computed-from', from: 'value', to: 'assume', provenance: [{ origin: 'computation' }],
  }), 'socria', 1);
  ws = relate(ws, sanitizeRelationship({
    id: 'r2', type: 'depends-on', from: 'concl', to: 'value', provenance: [{ origin: 'user' }],
  }), 'user', 1);
  ws = relate(ws, sanitizeRelationship({
    id: 'r3', type: 'depends-on', from: 'far', to: 'concl', provenance: [{ origin: 'user' }],
  }), 'user', 1);
  return ws;
};

console.log('\n=== changing an assumption reaches what rests on it ===');
{
  const ws = impactWs();
  const plan = planImpact(ws, 'assume');
  ok('the plan names everything downstream', plan.affected.length === 3, JSON.stringify(plan.affected.map((a) => a.id)));
  ok('  a computed number is to be recomputed',
    plan.recompute.some((a) => a.id === 'value') && plan.recompute.length === 1);
  ok('  a conclusion is for the person to look at',
    plan.review.map((a) => a.id).sort().join(',') === 'concl,far');
  ok('  and it says so in one countable sentence',
    /1 to recompute and 2 to look at again/.test(plan.say), plan.say);
  ok('nothing downstream means nothing to say',
    /Nothing rests on/.test(planImpact(ws, 'far').say));
  ok('a thing computed by the engine is recognised as derived',
    isDerived(ws.objects.get('value')) && !isDerived(ws.objects.get('concl')));

  const { workspace: marked } = markImpact(ws, 'assume', 2000);
  ok('the marks land on the dependents', pending(marked).length === 3);
  ok('  and not on the thing they just changed', !marked.objects.get('assume').stale);
  ok('  each saying what caused it', marked.objects.get('concl').stale.because === 'assume');
  ok('  and how far away that was', marked.objects.get('far').stale.distance === 3);
  ok('  with the kind the plan decided', marked.objects.get('value').stale.kind === 'recompute');
  ok('  nearest cause first', pending(marked)[0].object.id === 'value');

  const again = markImpact(marked, 'assume', 2000).workspace;
  ok('marking twice changes nothing', serialize(again).objects.length === serialize(marked).objects.length &&
    again.log.length === marked.log.length);

  ok('a mark is an event, so undo reaches it', canUndo(marked));
}

console.log('\n=== only the person can say a claim still holds ===');
{
  const { workspace: marked } = markImpact(impactWs(), 'assume', 2000);
  const machine = settle(marked, 'concl', 'system', 2100);
  ok('a machine may not clear a review mark', !machine.ok);
  ok('  and says why', /Only you/.test(machine.say), machine.say);
  ok('  leaving the mark exactly where it was', machine.workspace.objects.get('concl').stale.at === 2000);

  const person = settle(marked, 'concl', 'user', 2200);
  ok('the person can', person.ok && !person.workspace.objects.get('concl').stale);
  ok('  and it reads as a judgement, not a repair', /still holds/.test(person.say), person.say);

  const auto = settle(marked, 'value', 'system', 2100);
  ok('a computed value may be settled by recomputing it', auto.ok);
  ok('nothing waiting is not an error', !settle(marked, 'assume', 'user', 1).ok);
}

console.log('\n=== recompute does the computation and nothing else ===');
{
  const { workspace: marked } = markImpact(impactWs(), 'assume', 2000);
  const done = recompute(marked, (o) => (o.id === 'value' ? { value: 17 } : null), 3000);
  ok('the derived value is re-derived', done.workspace.objects.get('value').value === 17);
  ok('  and its mark is cleared', !done.workspace.objects.get('value').stale);
  ok('  while the claims are left for the person', done.workspace.objects.get('concl').stale.kind === 'review');
  ok('  and it reports what it did', done.done.length === 1 && done.failed.length === 0);

  const failed = recompute(marked, () => { throw new Error('solver failed'); }, 3000);
  ok('a failed recompute keeps the mark', !!failed.workspace.objects.get('value').stale);
  ok('  and says it failed rather than reporting success', failed.failed.includes('value'));
}

// ── 4. the workspace as a file, and as something to ask ─────────────

console.log('\n=== a workspace you can hand to somebody ===');
{
  const ws = impactWs();
  const one = exportWorkspace(ws, { at: 9000, title: 'Studio move', about: 'Whether to sign' });
  const two = exportWorkspace(ws, { at: 9000, title: 'Studio move', about: 'Whether to sign' });
  ok('an export is a document with a kind and a version',
    one.kind === PORTABLE_KIND && typeof one.version === 'number');
  ok('  deterministic, so two days can be diffed', JSON.stringify(one) === JSON.stringify(two));
  ok('  counting what is in it', one.counts.objects === 4 && one.counts.relationships === 3);
  ok('  including how much is not settled', one.counts.unsettled === 1);
  ok('  and carrying provenance rather than bare assertions',
    one.objects.every((o) => Array.isArray(o.provenance) && o.provenance.length > 0));

  const back = importWorkspace(one, { at: 9500, into: 'theirs' });
  ok('it reads back', back && back.objects === 4 && back.relationships === 3);
  ok('  namespaced, so it cannot collide with what is here',
    [...back.workspace.objects.keys()].every((k) => k.startsWith('theirs:')));
  ok('  marked as somebody else\'s to begin with',
    [...back.workspace.objects.values()].every((o) => o.provenance[0].origin === 'imported'));
  ok('  keeping what they said it rested on underneath',
    [...back.workspace.objects.values()].every((o) => o.provenance.length >= 2));
  ok('  with standing intact',
    [...back.workspace.objects.values()].some((o) => o.epistemic === 'assumed'));
  ok('  and the relationships still walkable',
    upstream(back.workspace, 'theirs:concl').some((l) => l.object.id === 'theirs:value'));
  ok('  saying in words what it read', /Read 4 objects and 3 connections/.test(back.say), back.say);

  ok('a file that is not one of ours is refused',
    importWorkspace({ version: 1, objects: [], relationships: [] }, { at: 1 }) === null);
  ok('a file from a later version is refused whole',
    importWorkspace({ ...one, version: one.version + 1 }, { at: 1 }) === null);
  ok('junk is refused', importWorkspace(null, { at: 1 }) === null && importWorkspace('x', { at: 1 }) === null);

  const broken = importWorkspace(
    { ...one, objects: [...one.objects, { id: '', label: '' }], relationships: [...one.relationships, { id: 'x' }] },
    { at: 1 }
  );
  ok('what cannot be read is refused and counted, never guessed at',
    broken.refused.objects === 1 && broken.refused.relationships === 1);
  ok('  and the import says so out loud', /could not be read/.test(broken.say), broken.say);

  const onto = importWorkspace(one, { at: 1, into: 'a', onto: importWorkspace(one, { at: 1, into: 'b' }).workspace });
  ok('two imports of the same file live side by side', onto.workspace.objects.size === 8);
}

console.log('\n=== asking the workspace a question ===');
{
  let ws = markImpact(impactWs(), 'assume', 2000).workspace;
  ws = add(ws, sanitizeObject({
    id: 'src', type: 'source', label: 'Ito 2024 on elasticity',
    provenance: [{ origin: 'research-source', detail: 'Ito 2024' }], epistemic: 'source-supported',
  }), 'socria', 1500);

  ok('by type', query(ws, { type: ['assumption'] }).objects.map((o) => o.id).join() === 'assume');
  ok('by standing', query(ws, { epistemic: ['computed'] }).objects.map((o) => o.id).join() === 'value');
  ok('by origin', query(ws, { origin: ['research-source'] }).objects.map((o) => o.id).join() === 'src');
  ok('what is theirs', query(ws, { yours: true }).objects.length === 3);
  ok('what nothing has confirmed', query(ws, { unsettled: true }).objects.map((o) => o.id).join() === 'assume');
  ok('what is waiting on a change', query(ws, { stale: true }).total === 3);
  ok('what came from the engine', query(ws, { surface: ['model'] }).objects.map((o) => o.id).join() === 'value');

  ok('text matches every word, not any of them',
    query(ws, { text: 'break autumn' }).total === 0 &&
    query(ws, { text: 'break-even month' }).total === 1 &&
    query(ws, { text: 'autumn' }).total === 1);
  ok('  and looks at the label, content and meaning',
    query(ws, { text: 'elasticity' }).objects[0].id === 'src');

  ok('filters compose', query(ws, { stale: true, type: ['conclusion'] }).objects.map((o) => o.id).join() === 'concl');
  ok('what is attached to something, outward',
    query(ws, { connectedTo: 'concl', direction: 'out' }).objects.map((o) => o.id).join() === 'value');
  ok('  and inward', query(ws, { connectedTo: 'concl', direction: 'in' }).objects.map((o) => o.id).join() === 'far');
  ok('  by a named relationship only',
    query(ws, { connectedTo: 'value', by: ['computed-from'], direction: 'out' }).objects.map((o) => o.id).join() === 'assume');

  const since = query(ws, { since: 1500 });
  ok('by when it last changed', since.objects.every((o) => (o.modifiedAt ?? o.createdAt) >= 1500));

  const capped = query(ws, { limit: 2 });
  ok('a limit cuts the page and keeps the count', capped.objects.length === 2 && capped.total === 5);
  ok('the order is stable', JSON.stringify(query(ws, {}).objects.map((o) => o.id)) ===
    JSON.stringify(query(ws, {}).objects.map((o) => o.id)));
  ok('nothing is ranked by a made-up score',
    query(ws, { text: 'claim' }).objects.every((o) => !('score' in o) && !('relevance' in o)));
  ok('a query reads back in words',
    /things you said.*mentioning/.test(describe({ yours: true, text: 'lease' })), describe({ yours: true, text: 'lease' }));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
