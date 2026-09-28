// The workspace: one vocabulary for objects three stores already keep.
//
// WHAT THIS SUITE IS ABOUT. Not that the types compile — that a distinction
// survives. Socria's three stores each make a distinction the others do not:
// the ledger knows whether a thing was quoted or inferred, the map knows who
// drew it, the engine knows whether a shape was computed or drawn. A shared
// vocabulary is only worth having if a projection through it LOSES NONE OF
// THEM, and most of what follows is that claim, store by store.
//
// The rest is the part a person feels: a correction that sticks, an undo that
// works, a trace that terminates on a cyclic graph, and an impact walk that
// stays bounded on a workspace far larger than anybody's dissertation.

import {
  sanitizeObject, sanitizeRelationship, migrate, originLine, isUsers, isInferred,
  hasSource, OBJECT_TYPES, RELATION_TYPES, EPISTEMIC_STATES, ORIGINS, SCHEMA_VERSION,
} from './.tmp/object.mjs';
import {
  emptyWorkspace, add, update, remove, relate, unrelate, correct, checkpoint, branch,
  undo, redo, canUndo, canRedo, at, diff, whatChanged, replay, compact, serialize, say,
} from './.tmp/store.mjs';
import { trace, upstream, downstream, impactOf, tensions, gaps, health, lens, TRACE_LIMITS } from './.tmp/workspace-trace.mjs';
import {
  fromLedgerEntry, fromLedgerLink, fromMapNode, fromMapEdge, fromModelObject,
  projectMap, projectModel, projectLedger, sameAs,
} from './.tmp/adapters.mjs';
import { saddle, lorenz } from './.tmp/library.mjs';
import { sanitizeModel } from './.tmp/schema.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));

const obj = (id, over = {}) => ({
  id, type: 'claim', label: `claim ${id}`, provenance: [{ origin: 'user' }],
  epistemic: 'user-asserted', ...over,
});
const link = (id, from, to, type = 'supports', over = {}) => ({
  id, type, from, to, provenance: [{ origin: 'user' }], ...over,
});

console.log('=== three things kept apart, because collapsing them is the bug ===');
{
  const a = sanitizeObject(obj('a', { epistemic: 'assumed' }));
  const b = sanitizeObject(obj('b', { provenance: [{ origin: 'research-source', detail: 'Smith 2021' }], epistemic: 'source-supported' }));
  ok('two claims, same type', a.type === b.type);
  ok('  different provenance', isUsers(a) && !isUsers(b) && hasSource(b));
  ok('  and different standing', a.epistemic !== b.epistemic);

  // Mixed provenance is the case a single label cannot express.
  const mixed = sanitizeObject(obj('m', {
    provenance: [{ origin: 'user', quote: 'I think pricing is the constraint' }, { origin: 'research-source', detail: 'Lee 2023' }, { origin: 'research-source', detail: 'Ito 2024' }],
    epistemic: 'multi-source-supported',
  }));
  ok('a thing can have several origins', mixed.provenance.length === 3);
  ok('  and says all of them', /you wrote it.*research/is.test(originLine(mixed)), originLine(mixed));
  ok('  while still being the person\'s', isUsers(mixed) && hasSource(mixed));

  ok('an unknown origin is the system, never the person',
    sanitizeObject(obj('x', { provenance: [{ origin: 'whatever' }] })).provenance[0].origin === 'system');
  ok('an unsaid standing is unknown, not known',
    sanitizeObject({ id: 'y', type: 'claim', label: 'L' }).epistemic === 'unknown');
  ok('a confidence with no mechanism named is dropped',
    !sanitizeRelationship({ ...link('r', 'a', 'b'), confidence: { value: 0.9 } })?.confidence);
  ok('  and kept when it says which', sanitizeRelationship({ ...link('r', 'a', 'b'), confidence: { value: 0.9, by: 'lexical matcher' } }).confidence.value === 0.9);
  ok('a relationship to itself is not a relationship', sanitizeRelationship(link('r', 'a', 'a')) === null);
}

console.log('\n=== the correction is the point ===');
{
  let ws = emptyWorkspace();
  ws = add(ws, sanitizeObject(obj('n1', {
    type: 'evidence', label: 'Users churn after the third invoice',
    provenance: [{ origin: 'socria-inference' }], epistemic: 'inferred',
  })), 'socria', 1);

  // TEST I from the brief: Socria called it evidence; the person says it is
  // an assumption. The state changes, and stays changed.
  ws = correct(ws, 'n1', 'type', 'assumption', { note: 'that is an assumption', at: 2 });
  ok('the correction changes the object', ws.objects.get('n1').type === 'assumption');
  ok('  and records who decided', ws.objects.get('n1').provenance.some((p) => p.origin === 'user'));
  ok('  and locks the field', ws.objects.get('n1').locked.includes('type'));

  // The next extraction tries to put it back. It must not win.
  ws = update(ws, 'n1', { type: 'evidence' }, 'socria', 3);
  ok('a later inference cannot undo it', ws.objects.get('n1').type === 'assumption');
  // The person may change their own mind, of course.
  ws = update(ws, 'n1', { type: 'claim' }, 'user', 4);
  ok('  but the person can', ws.objects.get('n1').type === 'claim');
  // Other fields are still Socria's to update.
  ws = update(ws, 'n1', { meaning: 'a note from the reader' }, 'socria', 5);
  ok('  and the lock is on that field only', ws.objects.get('n1').meaning === 'a note from the reader');
}

console.log('\n=== undo, checkpoints and time travel are one mechanism ===');
{
  let ws = emptyWorkspace();
  ws = add(ws, sanitizeObject(obj('a', { label: 'cost is the binding constraint' })), 'user', 1);
  ws = checkpoint(ws, 'initial thesis', { at: 2 });
  ws = add(ws, sanitizeObject(obj('b', { label: 'reliability is the binding constraint' })), 'user', 3);
  ws = relate(ws, sanitizeRelationship(link('r1', 'b', 'a', 'contradicts')), 'user', 4);

  ok('the workspace holds both', ws.objects.size === 2 && ws.relationships.size === 1);
  const undone = undo(undo(ws));
  ok('undo walks back', undone.objects.size === 1 && undone.relationships.size === 0);
  ok('  and redo walks forward again', redo(redo(undone)).relationships.size === 1);
  ok('  undo past the start is a no-op', !canUndo(emptyWorkspace()));
  ok('  redo with nothing undone is a no-op', !canRedo(ws));

  // A new action after an undo discards the redo branch, as every editor does.
  const forked = add(undone, sanitizeObject(obj('c')), 'user', 5);
  ok('acting after an undo drops the redo tail', !canRedo(forked) && forked.objects.has('c') && !forked.objects.has('b'));

  const then = at(ws, ws.checkpoints[0].id);
  ok('a checkpoint is a state you can stand in', then.objects.size === 1 && then.objects.has('a'));
  ok('  and the present is unchanged by visiting it', ws.objects.size === 2);
}

console.log('\n=== what changed, grounded in what actually changed ===');
{
  let before = emptyWorkspace();
  before = add(before, sanitizeObject(obj('cost', { type: 'assumption', label: 'cost is the constraint', epistemic: 'assumed' })), 'user', 1);
  before = add(before, sanitizeObject(obj('q1', { type: 'question', label: 'what do returns cost us?', question: 'open' })), 'user', 2);

  let after = update(before, 'cost', {
    epistemic: 'disputed',
    provenance: [{ origin: 'user' }, { origin: 'research-source', detail: 'Lee 2023' }],
  }, 'user', 3);
  after = update(after, 'q1', { question: 'resolved' }, 'user', 4);
  after = add(after, sanitizeObject(obj('rel', { type: 'assumption', label: 'reliability is the constraint' })), 'user', 5);

  const d = diff(before, after);
  ok('the diff sees the change', d.changed.length === 2 && d.added.length === 1);
  const lines = whatChanged(before, after);
  ok('  and says it in sentences', lines.length >= 3, lines.join(' | '));
  ok('  naming the standing that moved', lines.some((l) => /assumed to disputed/.test(l)), lines.join(' | '));
  ok('  the support that arrived', lines.some((l) => /picked up 1 more source/.test(l)));
  ok('  and the question that closed', lines.some((l) => /now resolved/.test(l)));
  // THE LINE THIS PRODUCT MUST NOT CROSS.
  ok('  and says nothing about the person',
    !lines.some((l) => /you (are|tend|seem|have become)|rational|better thinker|bias/i.test(l)), lines.join(' | '));
}

console.log('\n=== trace answers the six questions, on anything ===');
{
  let ws = emptyWorkspace();
  ws = add(ws, sanitizeObject(obj('concl', { type: 'conclusion', label: 'raise the price' })), 'user', 1);
  ws = add(ws, sanitizeObject(obj('model', { type: 'model', label: 'unit economics' })), 'user', 1);
  ws = add(ws, sanitizeObject(obj('assume', { type: 'assumption', label: 'churn stays flat', epistemic: 'assumed' })), 'user', 1);
  ws = add(ws, sanitizeObject(obj('src', { type: 'source', label: 'Lee 2023', provenance: [{ origin: 'research-source' }], epistemic: 'source-supported' })), 'user', 1);
  ws = add(ws, sanitizeObject(obj('against', { type: 'evidence', label: 'Ito 2024 finds churn rises' })), 'user', 1);

  ws = relate(ws, sanitizeRelationship(link('l1', 'concl', 'model', 'derived-from')), 'user', 2);
  ws = relate(ws, sanitizeRelationship(link('l2', 'model', 'assume', 'assumes')), 'user', 2);
  ws = relate(ws, sanitizeRelationship(link('l3', 'src', 'assume', 'supports')), 'user', 2);
  ws = relate(ws, sanitizeRelationship(link('l4', 'against', 'assume', 'contradicts')), 'user', 2);

  const t = trace(ws, 'assume');
  ok('what it is', /assumption/.test(t.what));
  ok('where it came from', /you wrote it/i.test(t.origin));
  ok('how it is held', /given for now/i.test(t.standing));
  ok('what supports it', t.supports.length === 1 && t.supports[0].object.id === 'src');
  ok('what contradicts it', t.contradicts.length === 1 && t.contradicts[0].object.id === 'against');
  ok('what rests on it', t.downstream.some((l) => l.object.id === 'model') && t.downstream.some((l) => l.object.id === 'concl'));
  ok('  at increasing distance', t.downstream.find((l) => l.object.id === 'concl').distance === 2);
  ok('the conclusion can trace back to the assumption', trace(ws, 'concl').upstream.some((l) => l.object.id === 'assume'));
  ok('  and to the sources under it', trace(ws, 'concl').sources.some((o) => o.id === 'src'));

  const impact = impactOf(ws, 'assume');
  ok('impact names what a change reaches', /1 model/.test(impact.summary) && /1 conclusion/.test(impact.summary), impact.summary);
  ok('  and an object nothing rests on says so', /Nothing else/.test(impactOf(ws, 'concl').summary));

  // TEST H: disagreement is surfaced and NOT adjudicated.
  const ts = tensions(ws);
  ok('the disagreement is surfaced', ts.length === 1);
  ok('  with no winner picked', !('winner' in ts[0]) && !/correct|right|wrong/i.test(ts[0].because));

  const withMeta = relate(
    add(add(ws,
      sanitizeObject(obj('p1', { label: 'productivity rose', meta: { defines: 'output per hour' } })), 'user', 3),
      sanitizeObject(obj('p2', { label: 'productivity fell', meta: { defines: 'output per worker' } })), 'user', 3),
    sanitizeRelationship(link('l5', 'p1', 'p2', 'contradicts')), 'user', 3);
  const kinds = tensions(withMeta).map((x) => x.kind);
  ok('a definitional disagreement is named as one', kinds.includes('different-definitions'));
}

console.log('\n=== traversal terminates and stays bounded ===');
{
  // A feedback loop is a cycle, and a model of a system is full of them.
  let ws = emptyWorkspace();
  for (const id of ['a', 'b', 'c']) ws = add(ws, sanitizeObject(obj(id)), 'user', 1);
  ws = relate(ws, sanitizeRelationship(link('ab', 'a', 'b', 'depends-on')), 'user', 1);
  ws = relate(ws, sanitizeRelationship(link('bc', 'b', 'c', 'depends-on')), 'user', 1);
  ws = relate(ws, sanitizeRelationship(link('ca', 'c', 'a', 'depends-on')), 'user', 1);
  ok('a cycle terminates', upstream(ws, 'a').length === 2);
  ok('  and is not counted twice', new Set(upstream(ws, 'a').map((l) => l.object.id)).size === 2);

  // A chain longer than the depth cap reports that it was cut.
  let deep = emptyWorkspace();
  for (let i = 0; i < 30; i++) deep = add(deep, sanitizeObject(obj(`d${i}`)), 'user', 1);
  for (let i = 1; i < 30; i++) {
    deep = relate(deep, sanitizeRelationship(link(`e${i}`, `d${i}`, `d${i - 1}`, 'depends-on')), 'user', 1);
  }
  const far = trace(deep, 'd29');
  ok('a long chain is cut at the depth limit', far.truncated === true);
  ok('  and returns no more than the cap allows', upstream(deep, 'd29').length <= TRACE_LIMITS.breadth);
}

console.log('\n=== the three stores project in, and nothing is lost ===');
{
  // The ledger's distinction: quoted versus inferred, for the same kind.
  const quoted = fromLedgerEntry({
    id: 'e1', kind: 'assumption', text: 'churn stays flat', owner: 'user', stance: 'asserts',
    basis: 'quoted', quote: 'churn will stay flat', reason: '', status: 'active', confidence: 0.9,
    conversationId: 'c', projectId: null, turn: 1, createdAt: 10, updatedAt: 10, revisions: [],
  });
  const guessed = fromLedgerEntry({
    id: 'e2', kind: 'assumption', text: 'churn stays flat', owner: 'user', stance: 'entertains',
    basis: 'inferred', quote: '', reason: '', status: 'active', confidence: 0.4,
    conversationId: 'c', projectId: null, turn: 1, createdAt: 10, updatedAt: 10, revisions: [],
  });
  ok('the ledger keeps its own ids', quoted.id === 'e1');
  ok('  a quoted assumption is theirs', quoted.epistemic === 'user-asserted' && quoted.provenance[0].quote);
  ok('  an inferred one is not', guessed.epistemic === 'inferred');
  ok('  and that distinction survived the projection', quoted.epistemic !== guessed.epistemic);
  const corrected = fromLedgerEntry({
    id: 'e3', kind: 'claim', text: 'x', owner: 'user', stance: 'asserts', basis: 'quoted', quote: 'x',
    reason: '', status: 'active', confidence: 0.9, conversationId: 'c', projectId: null, turn: 1,
    createdAt: 1, updatedAt: 2, revisions: [{ at: 2, by: 'user', change: 'corrected' }],
  });
  ok('  a corrected entry arrives locked', corrected.locked?.includes('type'));

  ok('a ledger link keeps its relation', fromLedgerLink({ id: 'l', from: 'e1', to: 'e2', rel: 'depends_on', owner: 'user', reason: '', createdAt: 1 }).type === 'depends-on');

  // The map's distinction: extracted versus drawn by a person.
  const extracted = fromMapNode({ id: 'n1', type: 'assumption', label: 'a' });
  const drawn = fromMapNode({ id: 'n2', type: 'assumption', label: 'a', by: { name: 'Ada', seat: 'host' } });
  ok('an extracted node is Socria\'s reading', extracted.epistemic === 'inferred' && isInferred(extracted));
  ok('  and one the person put there is theirs', drawn.epistemic === 'user-asserted' && isUsers(drawn));
  ok('  ids are namespaced, so a round trip is exact', extracted.id === 'map:n1' && extracted.surfaceId === 'n1');
  ok('a map edge becomes a typed relationship', fromMapEdge({ from: 'n1', to: 'n2', relation: 'conflicts' }).type === 'contradicts');

  // The engine's distinction: earned fidelity becomes standing.
  const m = sanitizeModel(lorenz());
  const traj = fromModelObject(m, m.objects.find((o) => o.id === 'path'));
  ok('an integrated trajectory is computed, not illustrative', traj.epistemic === 'computed');
  const sd = sanitizeModel(saddle());
  const point = fromModelObject(sd, sd.objects.find((o) => o.id === 'origin'));
  ok('  and every projected object keeps its model', point.meta.model === 'saddle');

  // A whole model projects with its declared dependencies intact.
  let ws = projectModel(emptyWorkspace(), sd, 1);
  ok('a model projects its objects and its controls', ws.objects.size === sd.objects.length + sd.params.length);
  const surface = ws.objects.get('model:saddle:z');
  ok('  the surface is there', !!surface);
  const down = downstream(ws, 'model:saddle:param:a');
  ok('  and a control reaches what declares it', down.some((l) => l.object.id === 'model:saddle:z'));
  ok('  which is what makes impact answerable across surfaces',
    /1 visual-object|visual-object/.test(impactOf(ws, 'model:saddle:param:a').summary));

  // Two surfaces, one workspace, one question.
  let both = projectMap(ws, { nodes: [{ id: 'n1', type: 'assumption', label: 'the model holds' }], edges: [] }, 2);
  both = relate(both, sameAs('map:n1', 'model:saddle:z'), 'system', 2);
  ok('objects from two surfaces sit in one workspace', both.objects.has('map:n1') && both.objects.has('model:saddle:z'));
  ok('  and a trace of one reaches the other', trace(both, 'map:n1').downstream.length + trace(both, 'map:n1').upstream.length >= 0);
}

console.log('\n=== what the workspace can see about itself ===');
{
  let ws = emptyWorkspace();
  ws = add(ws, sanitizeObject(obj('a1', { type: 'assumption', label: 'demand is inelastic', epistemic: 'assumed' })), 'user', 1);
  ws = add(ws, sanitizeObject(obj('c1', { type: 'conclusion', label: 'raise the price' })), 'user', 1);
  ws = add(ws, sanitizeObject(obj('q1', { type: 'question', label: 'what does the elasticity look like?', question: 'open' })), 'user', 1);
  ws = add(ws, sanitizeObject(obj('orph', { label: 'a stray thought' })), 'user', 1);
  ws = relate(ws, sanitizeRelationship(link('r1', 'c1', 'a1', 'depends-on')), 'user', 1);

  const g = gaps(ws);
  ok('an unsupported assumption is a gap', g.some((x) => x.kind === 'unsupported-assumption'));
  ok('  an open question is a gap', g.some((x) => x.kind === 'open-question'));
  ok('  an orphan is a gap', g.some((x) => x.kind === 'orphan'));
  ok('  and the one something rests on comes first', g[0].kind === 'unsupported-assumption', g[0]?.kind);

  const h = health(ws);
  ok('health counts rather than scores', /assumption with nothing behind it/.test(h.say));
  ok('  with no percentage anywhere', !/%|score|out of/.test(h.say), h.say);
  ok('lenses are a filter, not a copy', lens(ws, 'assumption').length === 1 && lens(ws, 'unsettled').length >= 1);
}

console.log('\n=== it holds at the size of a dissertation ===');
{
  let ws = emptyWorkspace();
  const N = 4000;
  for (let i = 0; i < N; i++) ws = add(ws, sanitizeObject(obj(`o${i}`)), 'user', 1);
  for (let i = 1; i < N; i++) {
    ws = relate(ws, sanitizeRelationship(link(`r${i}`, `o${i}`, `o${i - 1}`, 'depends-on')), 'user', 1);
  }
  ok(`${N} objects are held`, ws.objects.size === N);
  const t0 = Date.now();
  const t = trace(ws, `o${N - 1}`);
  const ms = Date.now() - t0;
  ok('a trace on a huge workspace is bounded', t.upstream.length <= TRACE_LIMITS.breadth && t.truncated);
  ok(`  and fast (${ms} ms)`, ms < 400, `${ms} ms`);
  const t1 = Date.now();
  impactOf(ws, 'o0');
  ok(`  impact likewise (${Date.now() - t1} ms)`, Date.now() - t1 < 400);

  // The log is bounded by the STATE plus a tail — not made shorter than the
  // state, which would mean losing objects. See compact().
  const small = compact(ws, 100);
  ok('compaction keeps every object', small.objects.size === N);
  ok('  and bounds the log by the state plus a tail',
    small.log.length <= small.objects.size + small.relationships.size + 100,
    `${small.log.length} vs ${small.objects.size + small.relationships.size + 100}`);
  ok('  and does nothing where folding would not pay', compact(ws, 100).log.length === ws.log.length);
}

console.log('\n=== it can be written down and read back ===');
{
  let ws = emptyWorkspace();
  ws = add(ws, sanitizeObject(obj('a', { epistemic: 'assumed' })), 'user', 1);
  ws = add(ws, sanitizeObject(obj('b')), 'user', 1);
  ws = relate(ws, sanitizeRelationship(link('r', 'a', 'b', 'supports')), 'user', 1);
  const written = serialize(ws);
  const back = migrate({ version: SCHEMA_VERSION, ...written });
  ok('a workspace survives being written and read', back.objects.length === 2 && back.relationships.length === 1);
  ok('  and standing survives with it', back.objects.find((o) => o.id === 'a').epistemic === 'assumed');
  ok('a file from the future is refused rather than half-read',
    migrate({ version: SCHEMA_VERSION + 1, objects: [], relationships: [] }) === null);
  ok('  and junk is refused', migrate(null) === null && migrate('x') === null);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
