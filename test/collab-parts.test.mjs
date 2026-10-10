// A room's models and objects of thought — the part of the room that used to
// be lost.
//
// Rooms carried a model or a Live 3D scene only inside the host's whole-map
// event, and that event REPLACED them: the audit's exp9-room.mjs showed Ben's
// later extraction erasing the model and the scene Ana's had carried, while
// slider moves and scene steps never reached the other seat at all. And the
// transport ignored every failed send, so a map over the 512 KB batch limit
// silently stopped arriving.
//
// What is held here, on the reducer and the transport with nothing faked but
// the network:
//
//   · `model.revision` and `object.step` are applied by id, and only to that
//     document or object;
//   · a `map` event adds what it carries and erases nothing it leaves out —
//     and never rolls back a person's edit with an extraction's older copy;
//   · two seats that saw the same events, in ANY order, hold the same map;
//   · every send that does not arrive is said.

import { applyAll, applyEvent, byOf, eventId, initialState, nextStamp, partOf } from './.tmp/collab.mjs';
import { sanitizeEvent, openTransport, MAX_BATCH, MAX_BATCH_BYTES, SEND_RETRY_MS } from './.tmp/collab-transport.mjs';
import { openFromProposal, adopt, current, docOf, EMPTY_WORKSPACE } from './.tmp/docs.mjs';
import { setParam } from './.tmp/schema.mjs';
import { torus, saddle } from './.tmp/library.mjs';
import { create, apply as applyOp, currentOf } from './.tmp/index.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const ANA = { id: 'u_ana', name: 'Ana', seat: 'host' };
const BEN = { id: 'u_ben', name: 'Ben', seat: 'guest' };
let clock = 10_000;
/** an event as it arrives off the wire: through the same check the route and the transport apply */
const wire = (by, kind, extra) => {
  const at = ++clock;
  const ev = sanitizeEvent({ id: eventId(at, () => Math.random()), at, by: byOf(by), kind, ...extra });
  if (!ev) throw new Error(`the wire refused a ${kind} the test meant to be valid`);
  return ev;
};
let stamp = 1_000;
const revision = (by, doc, extra = {}) => wire(by, 'model.revision', { docId: doc?.id ?? extra.docId, doc, stamp: ++stamp, ...extra });
const objStep = (by, obj, extra = {}) => wire(by, 'object.step', { objId: obj?.id ?? extra.objId, obj, stamp: ++stamp, ...extra });
const mapEv = (by, map) => wire(by, 'map', { map });

const EMPTY_SCENE = { nodes: [], next: 1, unit: 'm' };
const torusWs = openFromProposal(EMPTY_WORKSPACE, torus(), { at: 1 }).workspace;
const saddleWs = openFromProposal(EMPTY_WORKSPACE, saddle(), { at: 1 }).workspace;
const TORUS = docOf(torusWs, 'torus');
const SADDLE = docOf(saddleWs, 'saddle');
const moved = (doc, param, value, at) => docOf(adopt({ docs: [doc], active: doc.id }, doc.id, setParam(current(doc), param, value, at), at), doc.id);
const valueIn = (map, docId, param) => {
  const d = map?.models?.docs.find((x) => x.id === docId);
  return d ? current(d).params.find((p) => p.id === param)?.value : undefined;
};
const sceneObj = create({ objs: [] }, 'scene', EMPTY_SCENE, { name: 'Scene', origin: 'person' }).obj;
const withPart = (obj, shape, dims, at) => {
  const r = applyOp({ objs: [obj] }, obj.id, 'add', { shape, dims }, { by: 'person', at });
  if (!r.ok) throw new Error(r.why);
  return r.obj;
};
const partsIn = (map, id) => {
  const o = map?.objects?.objs.find((x) => x.id === id);
  return o ? currentOf(o).nodes.map((n) => n.shape) : [];
};
const session = (map = { nodes: [{ id: 'n1', type: 'concept', label: 'Nose cone' }], edges: [] }) => ({ id: 'room_x', title: 't', messages: [], map, updatedAt: 0 });

console.log('=== a map event no longer erases the other seat\'s model or scene (audit exp9) ===');
{
  let st = initialState('ABCDEFGH', ANA, session());
  st = applyEvent(st, wire(BEN, 'node.add', { node: { id: 'h1', type: 'idea', label: 'Ben: use an ogive' } }));
  // Ana's extraction lands with a built model and a scene
  st = applyEvent(st, mapEv(ANA, { nodes: [{ id: 'n1', type: 'concept', label: 'Nose cone' }, { id: 'n2', type: 'value', label: 'Volume' }], edges: [], models: torusWs, objects: { objs: [sceneObj] } }));
  ok('Ana\'s map brings the model and the scene', st.session.map.models?.docs.length === 1 && st.session.map.objects?.objs.length === 1);
  // Ben's extraction, requested before Ana's arrived, lands later without them
  st = applyEvent(st, mapEv(BEN, { nodes: [{ id: 'n1', type: 'concept', label: 'Nose cone' }], edges: [] }));
  ok('Ben\'s later map does not erase Ana\'s model', st.session.map.models?.docs.length === 1 && st.session.map.models.docs[0].id === 'torus', JSON.stringify(st.session.map.models?.docs.map((d) => d.id)));
  ok('  nor her scene', st.session.map.objects?.objs.length === 1);
  ok('  and Ben\'s hand node still survives an extraction', st.session.map.nodes.some((n) => n.id === 'h1'));
  ok('  while the extractor\'s nodes are the latest extraction\'s', !st.session.map.nodes.some((n) => n.id === 'n2'));
}

console.log('=== a model revision is applied by id, and to nothing else ===');
{
  let st = initialState('ABCDEFGH', ANA, session({ nodes: [], edges: [], models: { docs: [TORUS, SADDLE], active: 'torus' } }));
  st = applyEvent(st, revision(BEN, moved(TORUS, 'r', 3, 50)));
  ok('Ben\'s slider move reaches Ana (R = 3)', valueIn(st.session.map, 'torus', 'r') === 3);
  ok('  the other model is untouched', same(st.session.map.models.docs.find((d) => d.id === 'saddle'), docOf(st.session.map.models, 'saddle')) && current(docOf(st.session.map.models, 'saddle')).params.every((p, i) => p.value === current(SADDLE).params[i].value));
  ok('  and which model is shown did not move', st.session.map.models.active === 'torus');
  // an extraction carrying the OLDER copy does not roll it back
  st = applyEvent(st, mapEv(ANA, { nodes: [], edges: [], models: { docs: [TORUS, SADDLE], active: 'torus' } }));
  ok('an extraction\'s older copy does not roll Ben\'s move back', valueIn(st.session.map, 'torus', 'r') === 3, String(valueIn(st.session.map, 'torus', 'r')));
  // only which document is shown
  st = applyEvent(st, revision(BEN, undefined, { docId: 'saddle', active: true }));
  ok('a revision can say only which model is shown', st.session.map.models.active === 'saddle' && valueIn(st.session.map, 'torus', 'r') === 3);
  // deleted, and not brought back by a stale map
  st = applyEvent(st, revision(ANA, null, { docId: 'saddle' }));
  ok('a model deleted on one seat is deleted on the other', !st.session.map.models.docs.some((d) => d.id === 'saddle'));
  ok('  and the one shown falls back to what is left', st.session.map.models.active === 'torus');
  st = applyEvent(st, mapEv(BEN, { nodes: [], edges: [], models: { docs: [TORUS, SADDLE], active: 'saddle' } }));
  ok('  an extraction carrying the deleted model does not bring it back', !st.session.map.models.docs.some((d) => d.id === 'saddle'));
  st = applyEvent(st, revision(BEN, SADDLE));
  ok('  a person building it again does', st.session.map.models.docs.some((d) => d.id === 'saddle'));
  // a map event still adds a model the room does not have
  const fresh = docOf(openFromProposal(EMPTY_WORKSPACE, { ...torus(), id: 'donut' }, { at: 2 }).workspace, 'donut');
  st = applyEvent(st, mapEv(ANA, { nodes: [], edges: [], models: { docs: [fresh], active: 'donut' } }));
  ok('a map event adds a model the room lacks', st.session.map.models.docs.some((d) => d.id === 'donut'));
  ok('  and leaves the ones it did not carry', st.session.map.models.docs.some((d) => d.id === 'torus') && st.session.map.models.docs.some((d) => d.id === 'saddle'));
}

console.log('=== an object step is applied by id, its steps computed again ===');
{
  let st = initialState('ABCDEFGH', ANA, session({ nodes: [], edges: [], objects: { objs: [sceneObj] } }));
  const cone = withPart(sceneObj, 'cone', 'r=0.1;h=0.4', 5);
  st = applyEvent(st, objStep(BEN, cone));
  ok('Ben\'s scene step reaches Ana', same(partsIn(st.session.map, 'Scene'), ['cone']));
  ok('  as a computed step, with who chose it', st.session.map.objects.objs[0].steps[0]?.op === 'add' && st.session.map.objects.objs[0].steps[0]?.by === 'person');
  st = applyEvent(st, mapEv(ANA, { nodes: [], edges: [], objects: { objs: [sceneObj] } }));
  ok('an extraction carrying the empty scene does not undo the step', same(partsIn(st.session.map, 'Scene'), ['cone']));
  const both = withPart(cone, 'box', 'w=1;h=1;d=1', 6);
  st = applyEvent(st, objStep(ANA, both));
  ok('the next step lands on top', same(partsIn(st.session.map, 'Scene'), ['cone', 'box']));
  st = applyEvent(st, objStep(BEN, null, { objId: 'Scene' }));
  ok('a removed object is removed on both seats', !st.session.map.objects);
}

console.log('=== the picture: carried, it is drawn; left out, it stays ===');
{
  const viz1 = { kind: 'function', expr: 'x^2', varName: 'x', view: { xMin: -3, xMax: 3 }, params: [] };
  let st = initialState('ABCDEFGH', ANA, session({ nodes: [], edges: [], context: 'math' }));
  st = applyEvent(st, mapEv(ANA, { nodes: [], edges: [], context: 'math', viz: viz1 }));
  ok('a map event\'s picture is drawn', st.session.map.viz?.kind === 'function');
  st = applyEvent(st, mapEv(BEN, { nodes: [], edges: [], context: 'math' }));
  ok('a later map event without one leaves it', st.session.map.viz?.kind === 'function');
}

console.log('=== any order, same room ===');
{
  const seedMap = { nodes: [{ id: 'n1', type: 'concept', label: 'Torus' }], edges: [], models: { docs: [TORUS], active: 'torus' }, objects: { objs: [sceneObj] } };
  const s0 = initialState('ABCDEFGH', ANA, session(seedMap));
  const evs = [
    revision(BEN, moved(TORUS, 'c', 1.2, 10)),
    revision(ANA, moved(TORUS, 'r', 3, 11)), // the same document, concurrently: one wins, the same one everywhere
    mapEv(ANA, { nodes: [{ id: 'n1', type: 'concept', label: 'Torus' }], edges: [], models: { docs: [TORUS, SADDLE], active: 'saddle' } }),
    objStep(BEN, withPart(sceneObj, 'cone', 'r=0.1;h=0.4', 12)),
    revision(ANA, null, { docId: 'saddle' }),
    wire(BEN, 'node.add', { node: { id: 'h1', type: 'idea', label: 'a hand node' } }),
  ];
  const perms = (arr) => (arr.length <= 1 ? [arr] : arr.flatMap((x, i) => perms([...arr.slice(0, i), ...arr.slice(i + 1)]).map((p) => [x, ...p])));
  const all = perms(evs);
  const maps = new Set(all.map((p) => JSON.stringify(applyAll(s0, p).session.map)));
  ok(`models, objects and nodes converge under all ${all.length} orderings`, maps.size === 1, `${maps.size} distinct`);
  const end = applyAll(s0, evs).session.map;
  ok('  the deleted model stays deleted whichever came first', !end.models.docs.some((d) => d.id === 'saddle'));
  ok('  Ben\'s scene step is there whichever came first', same(partsIn(end, 'Scene'), ['cone']));
  ok('  the later revision of the torus wins on both seats', valueIn(end, 'torus', 'r') === 3);
  const once = applyAll(s0, evs);
  ok('re-delivery changes nothing', same(applyAll(once, evs).session, once.session));
  // the stamp rides in the payload: the receiver sees the server's `at`, the sender its own — the same result
  const ev = evs[0];
  const asServed = { ...ev, at: ev.at + 987654 };
  ok('a seat that saw another `at` for the same event holds the same model', same(applyEvent(s0, ev).session.map.models, applyEvent(s0, asServed).session.map.models));
}

console.log('=== an edit made here outranks everything it was looking at ===');
{
  let st = initialState('ABCDEFGH', ANA, session({ nodes: [], edges: [], models: { docs: [TORUS], active: 'torus' } }));
  const far = wire(BEN, 'model.revision', { docId: 'torus', doc: moved(TORUS, 'r', 3.5, 1), stamp: Date.now() + 3_600_000 }); // a seat whose clock runs an hour ahead
  st = applyEvent(st, far);
  const s = nextStamp(st);
  ok('the next stamp here is past the highest seen, even a clock running ahead', s > far.stamp);
  const mine = { id: eventId(), at: Date.now(), by: byOf(ANA), kind: 'model.revision', docId: 'torus', doc: moved(TORUS, 'r', 1, 2), stamp: s };
  st = applyEvent(st, mine);
  ok('  so an edit made after seeing it wins, on this seat', valueIn(st.session.map, 'torus', 'r') === 1);
  ok('the room\'s copy and what it won by can be read', partOf(st, 'doc', 'torus')?.stamp === s && partOf(st, 'doc', 'nothing') === null);
}

console.log('=== the wire: the same check as storage ===');
{
  const BY = byOf(ANA);
  const base = (kind, extra) => ({ id: 'e1', at: 1, by: BY, kind, ...extra });
  const good = sanitizeEvent(base('model.revision', { docId: 'torus', doc: TORUS, stamp: 5 }));
  ok('a model revision survives, re-validated', good?.doc?.id === 'torus' && good.doc.revisions.length === 1 && good.stamp === 5);
  ok('a document whose revisions do not compute is dropped', sanitizeEvent(base('model.revision', { docId: 'x', doc: { id: 'x', title: 'X', revisions: [{ id: 'x', title: 'X', params: [], objects: [{ id: 'a', kind: 'annotation', label: 'A' }] }], at: 0, log: [] }, stamp: 5 })) === null);
  ok('a document under another id than the event names is dropped', sanitizeEvent(base('model.revision', { docId: 'saddle', doc: TORUS, stamp: 5 })) === null);
  ok('a bad document id is dropped', sanitizeEvent(base('model.revision', { docId: 'no spaces!', doc: null, stamp: 5 })) === null);
  ok('a deletion survives', sanitizeEvent(base('model.revision', { docId: 'torus', doc: null, stamp: 5 }))?.doc === null);
  ok('only which model is shown survives', sanitizeEvent(base('model.revision', { docId: 'torus', active: true, stamp: 5 }))?.active === true);
  ok('a revision that says nothing is dropped', sanitizeEvent(base('model.revision', { docId: 'torus', stamp: 5 })) === null);
  ok('a stamp below one is raised to one — an edit always outranks an extraction', sanitizeEvent(base('model.revision', { docId: 'torus', doc: null, stamp: -9 }))?.stamp === 1);
  ok('a stamp that could not be counted past is capped', sanitizeEvent(base('model.revision', { docId: 'torus', doc: null, stamp: 1e300 }))?.stamp === 1e15);
  const step = sanitizeEvent(base('object.step', { objId: 'Scene', obj: withPart(sceneObj, 'cone', 'r=0.1;h=0.4', 3), stamp: 7 }));
  ok('an object step survives, its step computed again', step?.obj?.steps.length === 1 && currentOf(step.obj).nodes[0].shape === 'cone');
  const forged = withPart(sceneObj, 'cone', 'r=0.1;h=0.4', 3);
  forged.states[1] = { ...forged.states[1], nodes: forged.states[1].nodes.map((n) => ({ ...n, dims: { ...n.dims, r: 9 } })) };
  ok('a state no step produced is cut from the history', sanitizeSpace_cut(sanitizeEvent(base('object.step', { objId: 'Scene', obj: forged, stamp: 7 }))));
  ok('an object under another id is dropped', sanitizeEvent(base('object.step', { objId: 'Other', obj: sceneObj, stamp: 7 })) === null);
  ok('a removal survives', sanitizeEvent(base('object.step', { objId: 'Scene', obj: null, stamp: 7 }))?.obj === null);
}
function sanitizeSpace_cut(ev) {
  return !!ev && ev.obj.steps.length === 0 && currentOf(ev.obj).nodes.length === 0;
}

console.log('=== the new events survive the server\'s row and back ===');
{
  // as app/api/logos/room/events does: sanitised, split into columns, reassembled on the way out
  const toRow = (ev) => {
    const clean = sanitizeEvent({ ...ev, by: byOf(ANA) });
    const { id, kind, at: _at, by: _by, ...payload } = clean;
    return { id, kind, payload: JSON.parse(JSON.stringify(payload)) };
  };
  const fromRow = (row, at) => sanitizeEvent({ id: row.id, at, kind: row.kind, seq: 3, by: byOf(ANA), ...row.payload });
  const r1 = fromRow(toRow({ id: 'e_rev', at: 1, by: byOf(ANA), kind: 'model.revision', docId: 'torus', doc: moved(TORUS, 'r', 3, 1), stamp: 42 }), 999);
  ok('a model revision comes back with its document and its stamp', r1?.kind === 'model.revision' && r1.stamp === 42 && valueIn({ models: { docs: [r1.doc] } }, 'torus', 'r') === 3);
  const r2 = fromRow(toRow({ id: 'e_step', at: 1, by: byOf(ANA), kind: 'object.step', objId: 'Scene', obj: withPart(sceneObj, 'cone', 'r=0.1;h=0.4', 1), stamp: 43 }), 999);
  ok('an object step comes back with its object and its stamp', r2?.kind === 'object.step' && r2.stamp === 43 && currentOf(r2.obj).nodes.length === 1);
}

console.log('=== every send that does not arrive is said ===');
{
  const realSetTimeout = globalThis.setTimeout;
  const realSetInterval = globalThis.setInterval;
  const realClearInterval = globalThis.clearInterval;
  const realFetch = globalThis.fetch;
  globalThis.setTimeout = (fn) => realSetTimeout(fn, 0); // retries fire at once
  globalThis.setInterval = () => 0; // no polling loop
  globalThis.clearInterval = () => {};
  const posts = [];
  let script = [];
  globalThis.fetch = async (url, init) => {
    if (!init || init.method !== 'POST') return new Response(JSON.stringify({ events: [], cursor: 0 }), { status: 200 });
    const body = JSON.parse(init.body);
    posts.push({ body, keepalive: !!init.keepalive });
    const next = script.shift() ?? { status: 200, body: { ok: true, written: body.events.length } };
    // a request still in flight, so what is sent meanwhile waits behind it
    if (next.wait) await new Promise((r) => realSetTimeout(r, next.wait));
    if (next.throw) throw new TypeError('network down');
    return new Response(JSON.stringify(next.body ?? { ok: true, written: body.events.length }), { status: next.status ?? 200, headers: next.headers ?? {} });
  };
  const ev = (kind, extra = {}) => ({ id: eventId(++clock), at: clock, by: byOf(ANA), kind, ...extra });
  const settle = () => new Promise((r) => realSetTimeout(r, 30));

  const t = openTransport('room_1');
  const errors = [];
  t.onError((f) => errors.push(f));

  // a change too large for any request is said at once — no request is spent on it
  const huge = ev('message', { message: { role: 'user', content: 'x'.repeat(MAX_BATCH_BYTES) } });
  const before = posts.length;
  const r1 = await t.send(huge);
  ok('a change over the limit is refused here, not silently dropped', !r1.ok && r1.tooLarge && r1.status === 413);
  ok('  and reported, in words', errors.length === 1 && /too large to share/.test(errors[0].error) && errors[0].kinds[0] === 'message');
  ok('  without a request that could only fail', posts.length === before);

  // the server refuses a batch for its size (it measured otherwise): sent again one at a time
  posts.length = 0;
  script = [{ wait: 40 }, { status: 413, body: { error: 'That is too much at once.' } }];
  const first = t.send(ev('node.add', { node: { id: 'n0', type: 'idea', label: 'zero' } })); // in flight
  const a = t.send(ev('node.add', { node: { id: 'n1', type: 'idea', label: 'one' } })); // these two wait behind it, as one batch
  const b = t.send(ev('node.add', { node: { id: 'n2', type: 'idea', label: 'two' } }));
  const [r0, ra, rb] = await Promise.all([first, a, b]);
  ok('what is sent while a request is in flight goes as one batch', posts[1]?.body.events.length === 2, JSON.stringify(posts.map((p) => p.body.events.length)));
  ok('a batch the route measured too large is split and sent again', r0.ok && ra.ok && rb.ok && posts.slice(2).every((p) => p.body.events.length === 1), JSON.stringify([r0, ra, rb]));

  // a dropped connection is tried again, and in order
  errors.length = 0;
  posts.length = 0;
  script = [{ throw: true }, { status: 503, body: { error: 'later' } }];
  const order = [t.send(ev('message', { message: { role: 'user', content: 'first' } })), t.send(ev('message', { message: { role: 'user', content: 'second' } }))];
  const res = await Promise.all(order);
  ok('a connection that dropped, then a server error, are tried again until it goes', res.every((r) => r.ok) && errors.length === 0, JSON.stringify(res));
  const delivered = posts.at(-1).body.events.map((e) => e.message.content);
  ok('  in the order it was sent', same(delivered, ['first', 'second']), JSON.stringify(delivered));

  // out of retries: said
  errors.length = 0;
  script = Array.from({ length: SEND_RETRY_MS.length + 1 }, () => ({ throw: true }));
  const gone = await t.send(ev('model.revision', { docId: 'torus', doc: null, stamp: 9 }));
  ok('a send that never reaches the server is reported once the retries run out', !gone.ok && gone.status === 0 && errors.length === 1 && errors[0].kinds[0] === 'model.revision');

  // refused by the route's own check: named back, and said
  errors.length = 0;
  const bad = ev('node.add', { node: { id: 'n3', type: 'idea', label: 'three' } });
  script = [{ status: 200, body: { ok: true, written: 0, dropped: [bad.id] } }];
  const rb2 = await t.send(bad);
  ok('an event the route refused is reported, not counted as sent', !rb2.ok && rb2.status === 422 && errors.length === 1 && errors[0].ids[0] === bad.id);

  // a 404 (no longer a member) is said, not retried
  errors.length = 0;
  posts.length = 0;
  script = [{ status: 404, body: { error: 'No such room.' } }];
  const r404 = await t.send(ev('bye'));
  ok('a room that is gone is said once, not retried', !r404.ok && r404.status === 404 && posts.length === 1 && /no longer open/.test(errors[0]?.error ?? ''));

  // batches respect the route's limits
  posts.length = 0;
  const many = Array.from({ length: MAX_BATCH + 5 }, (_, i) => t.send(ev('node.add', { node: { id: `m${i}`, type: 'idea', label: `m${i}` } })));
  await Promise.all(many);
  ok(`no request carries more than ${MAX_BATCH} events`, posts.length >= 2 && posts.every((p) => p.body.events.length <= MAX_BATCH));
  ok(`  nor more than ${MAX_BATCH_BYTES / 1024} KB`, posts.every((p) => JSON.stringify(p.body.events).length <= MAX_BATCH_BYTES));

  // leaving: what is still waiting goes once, best effort
  posts.length = 0;
  script = [{ wait: 40 }];
  const inFlight = t.send(ev('message', { message: { role: 'user', content: 'in flight' } }));
  const waiting = t.send(ev('message', { message: { role: 'user', content: 'last words' } })); // queued behind it
  t.close();
  await Promise.all([inFlight, waiting]);
  await settle();
  ok('what is waiting when the room is left goes once, best effort', posts.some((p) => p.keepalive && p.body.events.some((e) => e.message?.content === 'last words')), JSON.stringify(posts.map((p) => [p.keepalive, p.body.events.map((e) => e.message?.content)])));
  const after = await t.send(ev('bye'));
  ok('  and nothing is sent after it is closed', !after.ok);

  globalThis.setTimeout = realSetTimeout;
  globalThis.setInterval = realSetInterval;
  globalThis.clearInterval = realClearInterval;
  globalThis.fetch = realFetch;
}

console.log('=== the hook, wired ===');
{
  const { readFileSync } = await import('node:fs');
  const hook = readFileSync(new URL('../components/useLogosCollab.ts', import.meta.url), 'utf8');
  const route = readFileSync(new URL('../app/api/logos/room/events/route.ts', import.meta.url), 'utf8');
  ok('the room hook offers a model edit, a workspace, an object step and a space', ['onLocalModel', 'onLocalModels', 'onLocalObjectStep', 'onLocalObjects'].every((f) => new RegExp(`const ${f} = useCallback`).test(hook)));
  ok('  each stamped past everything seen, and applied here at once', /stamp: nextStamp\(st, at\)/.test(hook) && /stateRef\.current = applyEvent\(st, ev\);\s*flush\(\);\s*pendingRef\.current\.set\(key, ev\);/.test(hook));
  ok('  a drag is sent at most every SEND_EVERY_MS, the last position winning', /setTimeout\(sendPending, SEND_EVERY_MS\)/.test(hook));
  ok('a map from this seat sends a model the room lacks as its own revision first', /if \(!cell \|\| cell\.value === null\) \{\s*emitPart\(`doc:\$\{d\.id\}`/.test(hook));
  ok('every failed send reaches sendError and onError', /t\.onError\?\.\(\(f\) => \{\s*setSendError\(f\.error\);\s*onErrorRef\.current\?\.\(f\);/.test(hook));
  ok('the route batches by the transport\'s own limits', /import \{ MAX_BATCH, MAX_BATCH_BYTES, sanitizeEvent \} from '@\/lib\/collab-transport';/.test(route));
  ok('  names what it refused', /dropped\.push\(rid\)/.test(route) && /\.\.\.\(dropped\.length \? \{ dropped \} : \{\}\)/.test(route));
  ok('  and asks for a retry when the store failed, not the event', /status: 503/.test(route));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
