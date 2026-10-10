// Keeping one shared line of thinking in step across screens.
//
// The failures this guards against are the ones that made "Socria disappear":
// a client that tracked unsent turns by POSITION drifted whenever the other
// person wrote in between, so its next turn and Socria's answer were never
// sent — and the next adoption wiped them from its own screen. Every scenario
// the diagnosis reproduced is replayed here against a tiny server with the
// route's rules (app/api/shared/conversation/[id]) and two clients that run
// the same pure decisions the hook does (lib/share/sync.ts): nothing anyone
// said may be lost, and both screens must end up holding the same thing.

//
// THE MAP, TOO. A refused map used to be adopted wholesale, which cost the
// person whose write lost the race their slider moves, scene steps and the
// model they had just built — and a client could be refused against its OWN
// write and see its drag revert. The scenarios the audit demonstrated
// (exp5-sync, exp8-selfconflict) are replayed below against real model
// documents and a real Live 3D scene, with the server storing what it is sent
// through the real sanitiser, as the route does.

import { outgoing, settled, absorb, seenOf, unseen, mapKey, mergeTurns, pendingTurns, MAX_APPEND, toWorld, toScreen, camFromTransform, mergeMaps, mergeObjects } from './.tmp/sync.mjs';
import { openFromProposal, adopt, current, docOf, remove as removeDoc, EMPTY_WORKSPACE } from './.tmp/docs.mjs';
import { setParam } from './.tmp/schema.mjs';
import { sanitizeMap } from './.tmp/logos.mjs';
import { torus, saddle } from './.tmp/library.mjs';
import { create, apply as applyOp, currentOf, seek } from './.tmp/index.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

let seq = 0;
const id = () => `m_test${(++seq).toString(36).padStart(4, '0')}`;
const T = (role, content, extra = {}) => ({ id: id(), role, content, ...extra });
const words = (list) => list.map((m) => m.content).join(' | ');
const map1 = { nodes: [{ id: 'a', type: 'idea', label: 'One' }], edges: [] };
const map2 = { nodes: [{ id: 'a', type: 'idea', label: 'One' }, { id: 'b', type: 'idea', label: 'Two' }], edges: [] };
const map3 = { nodes: [{ id: 'c', type: 'idea', label: 'Three' }], edges: [] };

// ── the route, in miniature ─────────────────────────────────────────────
// Appends land on the row as it stands; a turn the row already holds (by id)
// is skipped; a map must be drawn on the row's own version or it is refused —
// and the turns sent with a refused map are appended anyway. Every answer
// carries the row's turns and map as they now stand. `store`, when given, is
// what the route does to a map before it keeps it (sanitizeMap), so what it
// answers with is not the bytes it was sent.
function server(initial, opts = {}) {
  const store = opts.store ?? ((m) => m);
  const row = { messages: initial.messages.map((m) => ({ ...m })), map: initial.map, updatedAt: initial.updatedAt };
  const log = [];
  return {
    row,
    log,
    get(since) {
      if (since && row.updatedAt <= since) return { unchanged: true };
      return { messages: row.messages.map((m) => ({ ...m })), map: row.map, updatedAt: row.updatedAt };
    },
    post(body, author) {
      const wantsMap = body.map !== undefined;
      const stale = wantsMap && body.base !== row.updatedAt;
      const have = new Set(row.messages.map((m) => m.id).filter(Boolean));
      const append = (body.append ?? []).slice(0, 4).map((m) => (m.role === 'user' ? { ...m, by: author } : { ...m }));
      const fresh = append.filter((m) => !m.id || !have.has(m.id));
      const prior = row.updatedAt;
      if (fresh.length || (wantsMap && !stale)) {
        if (fresh.length) row.messages = [...row.messages, ...fresh].slice(-200);
        if (wantsMap && !stale) row.map = store(JSON.parse(JSON.stringify(body.map)));
        row.updatedAt = prior + 1;
      }
      log.push({ by: author.name, status: stale ? 409 : 200, map: wantsMap, ...(wantsMap && !stale ? { sentKey: mapKey(body.map), storedKey: mapKey(row.map) } : {}) });
      const answer = { updatedAt: row.updatedAt, prior, map: row.map, messages: row.messages.map((m) => ({ ...m })), accepted: { map: wantsMap && !stale, turns: fresh.length } };
      return stale ? { status: 409, conflict: true, ...answer } : { status: 200, ...answer };
    },
  };
}

// ── a client, running the hook's decisions ──────────────────────────────
// As components/share/useSharedSession.ts does: a refused map is merged
// (`conflict`), an accepted one is acknowledged (`sent`), and the screen shows
// `r.map` whenever `r.takeMap`. `during`, when set, runs between a write going
// out and its answer being taken in — a slider moved while the save is in flight.
function client(srv, name, opts = {}) {
  const c = { name, seen: null, local: { messages: [], map: null }, busy: false, readOnly: !!opts.readOnly, lost: [], during: null, author: { id: `alias_${name}`, name, seat: 'guest' } };
  const take = (remote, how = {}) => {
    const base = c.seen ?? unseen(c.local);
    const r = absorb(base, remote, c.local, { busy: c.busy, conflict: how.conflict, sent: how.sent, readOnly: c.readOnly });
    c.seen = r.seen;
    c.local = { messages: r.messages, map: r.takeMap ? r.map : c.local.map };
    if (r.lost) c.lost.push(...r.lost);
    return r;
  };
  c.read = () => {
    const r = srv.get(c.seen ? c.seen.version : 0);
    if (!r.unchanged) take(r);
    if (!c.readOnly && !settled(c.seen, c.local)) c.push();
  };
  c.push = () => {
    for (let round = 0; round < 3; round++) {
      const o = outgoing(c.seen, c.local);
      if (!o.append.length && o.map === undefined) return true;
      const res = srv.post({ base: c.seen.version, append: o.append, ...(o.map !== undefined ? { map: o.map } : {}) }, c.author);
      const conflict = res.status === 409;
      if (c.during) {
        const f = c.during;
        c.during = null;
        f();
      }
      take(res, { conflict, sent: o.map !== undefined && !conflict && res.accepted?.map !== false ? o.map : undefined });
    }
    return settled(c.seen, c.local);
  };
  /** something said on this screen (not yet sent) */
  c.say = (role, content) => {
    const m = T(role, content);
    c.local = { ...c.local, messages: [...c.local.messages, m] };
    return m;
  };
  c.draw = (map) => {
    c.local = { ...c.local, map };
  };
  return c;
}

const legacy = [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }];

console.log('=== what goes out ===');
{
  const srv = { messages: legacy, map: map1, updatedAt: 100 };
  const seen = seenOf(srv);
  ok('a version is what was seen', seen.version === 100 && seen.map === mapKey(map1) && seen.acked.size === 0);
  ok('turns written before ids existed are the server\'s, and never sent', outgoing(seen, { messages: legacy, map: map1 }).append.length === 0);
  ok('  and that is settled', settled(seen, { messages: legacy, map: map1 }));
  const a = T('user', 'and naps?'), b = T('assistant', 'maybe');
  const more = outgoing(seen, { messages: [...legacy, a, b], map: map1 });
  ok('a turn the server has never held goes out, with its id', more.append.length === 2 && more.append[0].id === a.id && more.append[1].content === 'maybe' && more.map === undefined);
  ok('  as words and id — never an author; the server names the author', !('by' in more.append[0]));
  const blank = outgoing(seen, { messages: [...legacy, T('user', '   '), { id: id(), role: 'system', content: 'x' }], map: map1 });
  ok('an empty turn, and anything not a turn, is not sent', blank.append.length === 0);
  const many = Array.from({ length: 7 }, (_, i) => T('user', `t${i}`));
  ok(`no more than ${MAX_APPEND} go in one write`, outgoing(seen, { messages: many, map: map1 }).append.length === MAX_APPEND);
  ok('a changed map is sent whole', outgoing(seen, { messages: legacy, map: map2 }).map === map2);
  ok('  an equal map (a new object, same content) is not', outgoing(seen, { messages: legacy, map: JSON.parse(JSON.stringify(map1)) }).map === undefined);
  const acked = { ...seen, acked: new Set([a.id]) };
  ok('a turn the server has held is never sent again — even after it scrolled out of the 200', pendingTurns(acked, { messages: [a, b] }).length === 1);
}

console.log('=== joining, never replacing ===');
{
  const s1 = T('user', 'server one'), s2 = T('assistant', 'server two'), mine = T('user', 'still sending');
  const joined = mergeTurns([s1, s2], [s1, mine], new Set([s1.id, s2.id]));
  ok('the server\'s turns, then this screen\'s unsent ones', words(joined) === 'server one | server two | still sending');
  const att = { ...s1, attachments: [{ name: 'note.txt' }] };
  ok('a turn this screen also holds keeps what only this screen carries', mergeTurns([s1], [att], new Set()).find((m) => m.id === s1.id)?.attachments?.length === 1);
  ok('a turn the server let go of is let go here too', mergeTurns([s2], [s1, s2], new Set([s1.id, s2.id])).length === 1);
  ok('two turns with the same words are two turns', mergeTurns([T('user', 'yes'), T('user', 'yes')], [], new Set()).length === 2);
  ok('the same id twice in a row is one turn', mergeTurns([s1, s1], [], new Set()).length === 1);
}

console.log('=== the drift that lost a turn and its answer (positional sync) ===');
{
  const srv = server({ messages: legacy, map: map1, updatedAt: 100 });
  const A = client(srv, 'Ana'), B = client(srv, 'Ben');
  A.read(); B.read();
  // Ben writes first; Ana has not seen it when her own pair goes out
  B.say('user', 'b1'); B.say('assistant', 'B1'); B.push();
  A.say('user', 'a1'); A.say('assistant', 'A1'); A.push();
  // the next pair from Ana — the one the counter used to swallow
  A.say('user', 'a2'); A.say('assistant', 'A2'); A.push();
  B.say('user', 'b2'); B.say('assistant', 'B2'); B.push();
  A.read(); B.read();
  const want = ['a1', 'A1', 'a2', 'A2', 'b1', 'B1', 'b2', 'B2'];
  ok('every turn and every answer reached the server', want.every((w) => srv.row.messages.some((m) => m.content === w)), words(srv.row.messages));
  ok('Ana\'s second turn and Socria\'s answer to it are still on her screen', A.local.messages.some((m) => m.content === 'a2') && A.local.messages.some((m) => m.content === 'A2'), words(A.local.messages));
  ok('both screens hold exactly what the server holds, in its order', words(A.local.messages) === words(srv.row.messages) && words(B.local.messages) === words(srv.row.messages), `${words(A.local.messages)} // ${words(B.local.messages)}`);
  ok('  and neither has anything left to send', settled(A.seen, A.local) && settled(B.seen, B.local));
}

console.log('=== a turn pushed alone mid-answer, while someone else writes ===');
{
  const srv = server({ messages: legacy, map: map1, updatedAt: 100 });
  const A = client(srv, 'Ana'), B = client(srv, 'Ben');
  A.read(); B.read();
  A.busy = true;
  A.say('user', 'a1'); A.push(); // the map pass or a picture op saves before the answer lands
  B.say('user', 'b1'); B.say('assistant', 'B1'); B.push();
  A.read(); // a poll mid-answer: Ben's words join Ana's screen
  ok('mid-answer, Ben\'s words appear on Ana\'s screen', A.local.messages.some((m) => m.content === 'b1'));
  A.say('assistant', 'A1'); A.busy = false; A.push();
  ok('Socria\'s answer reached the server — it used to be swallowed', srv.row.messages.some((m) => m.content === 'A1'), words(srv.row.messages));
  ok('  and is still on Ana\'s screen', A.local.messages.some((m) => m.content === 'A1'));
  B.read();
  ok('  and Ben sees it', B.local.messages.some((m) => m.content === 'A1'));
}

const ids = (map) => (map?.nodes ?? []).map((n) => n.id).join(',');

console.log('=== a map refused (409) with a turn beside it ===');
{
  const srv = server({ messages: legacy, map: map1, updatedAt: 100 });
  const A = client(srv, 'Ana'), B = client(srv, 'Ben');
  A.read(); B.read();
  B.draw(map3); B.push(); // Ben's map lands first: he replaced One with Three
  A.say('user', 'a1'); A.say('assistant', 'A1'); A.draw(map2); // Ana, on the older version, added Two
  A.push(); // refused, merged with Ben's, and the merge sent
  ok('the turns sent beside a refused map went in anyway', srv.row.messages.some((m) => m.content === 'a1') && srv.row.messages.some((m) => m.content === 'A1'), words(srv.row.messages));
  ok('Ben\'s map was not overwritten: his node is there', srv.row.map.nodes.some((n) => n.id === 'c'), ids(srv.row.map));
  ok('  and neither was Ana\'s — the one she added is there too', srv.row.map.nodes.some((n) => n.id === 'b'), ids(srv.row.map));
  ok('  and the node Ben took off stays off', !srv.row.map.nodes.some((n) => n.id === 'a'), ids(srv.row.map));
  ok('Ana shows the merge, and her own words', ids(A.local.map) === ids(srv.row.map) && A.local.messages.some((m) => m.content === 'A1'), `${ids(A.local.map)} vs ${ids(srv.row.map)}`);
  ok('  and has nothing left to send', settled(A.seen, A.local));
  B.read();
  ok('Ben sees what Ana added, beside his own', ids(B.local.map) === ids(srv.row.map));
}

console.log('=== someone else\'s map is never overwritten silently ===');
{
  const srv = server({ messages: legacy, map: map1, updatedAt: 100 });
  const A = client(srv, 'Ana'), B = client(srv, 'Ben');
  A.read(); B.read();
  B.draw(map3); B.push();
  // Ana, mid-answer, sends a turn alone: the answer to it carries Ben's map, which she cannot show yet
  A.busy = true;
  A.say('user', 'a1'); A.push();
  ok('her version does not move past a map she has not taken', A.seen.version < srv.row.updatedAt);
  A.draw(map2); A.busy = false;
  A.push(); // her own map, drawn without Ben's
  ok('so the map she drew without his is merged with his, not written over it', srv.row.map.nodes.some((n) => n.id === 'c') && srv.row.map.nodes.some((n) => n.id === 'b'), JSON.stringify(srv.row.map));
  ok('  and she holds that merge', ids(A.local.map) === ids(srv.row.map));
  const C = client(srv, 'Cy');
  C.read();
  B.read(); // Ben catches up first — a map drawn on a stale version is refused, as above
  B.draw(map2); B.push();
  ok('a map drawn on the current version lands', mapKey(srv.row.map) === mapKey(map2));
  C.say('user', 'c1'); C.push();
  ok('a screen with no map of its own takes someone else\'s at once', mapKey(C.local.map) === mapKey(map2) && C.seen.version === srv.row.updatedAt);
}

console.log('=== mid-answer: words join, the map waits ===');
{
  const srv = server({ messages: legacy, map: map1, updatedAt: 100 });
  const A = client(srv, 'Ana'), B = client(srv, 'Ben');
  A.read(); B.read();
  B.say('user', 'b1'); B.draw(map3); B.push();
  A.busy = true; A.read();
  ok('Ben\'s turn is on Ana\'s screen while she waits on Socria', A.local.messages.some((m) => m.content === 'b1'));
  ok('  but the map she is about to redraw is not swapped under her', mapKey(A.local.map) === mapKey(map1));
  A.busy = false; A.read();
  ok('once the answer is in, his map is taken', mapKey(A.local.map) === mapKey(map3));
}

console.log('=== reopening a session keeps what it had not sent ===');
{
  const srv = server({ messages: legacy, map: map1, updatedAt: 100 });
  const A = client(srv, 'Ana');
  A.read();
  A.say('user', 'a1'); A.push();
  // the answer lands while the session is not the open one: never sent
  const late = A.say('assistant', 'A1 (landed while away)');
  A.seen = null; // reopened: the first read
  A.read();
  ok('the first read joins, keeping the answer that landed while away', A.local.messages.some((m) => m.id === late.id));
  ok('  and sends it', srv.row.messages.some((m) => m.id === late.id));
}

console.log('=== a write that is retried lands once ===');
{
  const srv = server({ messages: legacy, map: map1, updatedAt: 100 });
  const a = T('user', 'once');
  srv.post({ base: 100, append: [a] }, { id: 'x', name: 'Ana', seat: 'guest' });
  srv.post({ base: 100, append: [a] }, { id: 'x', name: 'Ana', seat: 'guest' });
  ok('the same id twice is one turn on the server', srv.row.messages.filter((m) => m.id === a.id).length === 1);
}

console.log('=== past the 200 the server keeps ===');
{
  const full = Array.from({ length: 200 }, (_, i) => T(i % 2 ? 'assistant' : 'user', `t${i}`));
  const srv = server({ messages: full, map: map1, updatedAt: 100 });
  const A = client(srv, 'Ana');
  A.read();
  A.say('user', 'new'); A.push();
  ok('the new turn is on the server', srv.row.messages.some((m) => m.content === 'new') && srv.row.messages.length === 200);
  ok('the one that fell off the top is let go here too, never re-sent', !A.local.messages.some((m) => m.content === 't0') && settled(A.seen, A.local));
  A.say('user', 'newer'); A.push();
  ok('  and the next turn still goes', srv.row.messages.some((m) => m.content === 'newer'));
}

// ── the map, merged: models and Live 3D, through the real sanitiser ──────
const stored = (m) => sanitizeMap(m, { trust: 'stored' });
const EMPTY_SCENE = { nodes: [], next: 1, unit: 'm' };
const valueOf = (map, doc, param) => current(docOf(map.models, doc)).params.find((p) => p.id === param)?.value;
const partsOf = (map, obj) => {
  const o = map?.objects?.objs.find((x) => x.id === obj);
  return o ? currentOf(o).nodes : [];
};
const slide = (map, doc, param, value, at) => ({ ...map, models: adopt(map.models, doc, setParam(current(docOf(map.models, doc)), param, value, at), at) });
const step = (map, obj, op, args, at) => {
  const r = applyOp(map.objects, obj, op, args, { by: 'person', at });
  if (!r.ok) throw new Error(`test step refused: ${r.why}`);
  return { ...map, objects: r.space };
};

console.log('=== a refused map is merged: a collaborator\'s slider, scene step and built model all survive (audit exp5) ===');
{
  const built = openFromProposal(EMPTY_WORKSPACE, torus(), { at: 1 });
  const scene = create({ objs: [] }, 'scene', EMPTY_SCENE, { name: 'Scene', origin: 'person' });
  const start = stored({ nodes: [{ id: 'n1', type: 'concept', label: 'Torus' }], edges: [], models: built.workspace, objects: scene.space });
  const srv = server({ messages: [], map: start, updatedAt: 100 }, { store: stored });
  const A = client(srv, 'Ana'), B = client(srv, 'Ben');
  A.read(); B.read();
  // Ana moves R (the torus's `r`) to 3 and saves first
  A.draw(slide(A.local.map, 'torus', 'r', 3, 1000));
  A.push();
  // Ben, on the older version, moves the tube radius, adds a cone to the scene, builds a saddle, adds a node
  let mine = slide(B.local.map, 'torus', 'c', 1.2, 1100);
  mine = { ...mine, models: openFromProposal(mine.models, saddle(), { at: 1200 }).workspace };
  mine = step(mine, 'Scene', 'add', { shape: 'cone', dims: 'r=0.1;h=0.4' }, 1300);
  mine = { ...mine, nodes: [...mine.nodes, { id: 'n2', type: 'idea', label: 'an ogive instead?', status: 'open' }] };
  B.draw(mine);
  B.push();
  ok('Ben\'s map was refused once, merged, and then went in', srv.log.filter((l) => l.by === 'Ben').map((l) => l.status).join() === '409,200', JSON.stringify(srv.log.map((l) => `${l.by}:${l.status}`)));
  const row = srv.row.map;
  ok('Ana\'s slider move survives Ben\'s write (R = 3)', valueOf(row, 'torus', 'r') === 3, String(valueOf(row, 'torus', 'r')));
  ok('Ben\'s slider move survives Ana\'s (r = 1.2)', valueOf(row, 'torus', 'c') === 1.2, String(valueOf(row, 'torus', 'c')));
  ok('Ben\'s scene step survives — a cone in the scene', partsOf(row, 'Scene').some((n) => n.shape === 'cone'), JSON.stringify(partsOf(row, 'Scene')));
  ok('  and it is still a computed history (it went through the server\'s re-check)', row.objects.objs[0].steps.length === 1);
  ok('the model Ben built survives', !!docOf(row.models, 'saddle'));
  ok('  and is the one Ben is looking at', row.models.active === 'saddle');
  ok('Ben\'s node survives', row.nodes.some((n) => n.id === 'n2'));
  ok('on Ben\'s own screen, nothing of his vanished', valueOf(B.local.map, 'torus', 'c') === 1.2 && !!docOf(B.local.map.models, 'saddle') && partsOf(B.local.map, 'Scene').length === 1);
  ok('  and he holds exactly the server\'s map', mapKey(B.local.map) === mapKey(srv.row.map));
  A.read();
  ok('Ana sees all of Ben\'s work beside her own', mapKey(A.local.map) === mapKey(srv.row.map));
  ok('nothing was lost, so nothing is said', B.lost.length === 0, JSON.stringify(B.lost));
  // the model's own history carries both changes, each undoable
  const doc = docOf(row.models, 'torus');
  ok('the torus\'s history holds both moves, each its own revision', doc.revisions.length === 3 && doc.log.some((l) => /r to 3/.test(l.said)) && doc.log.some((l) => /c to 1\.2/.test(l.said)), JSON.stringify(doc.log));
}

console.log('=== a client is never refused against its own write (audit exp8) ===');
{
  const built = openFromProposal(EMPTY_WORKSPACE, torus(), { at: 1 });
  const srv = server({ messages: [], map: stored({ nodes: [{ id: 'n1', type: 'concept', label: 'Torus' }], edges: [] }), updatedAt: 100 }, { store: stored });
  const A = client(srv, 'Ana');
  A.read();
  A.draw({ ...A.local.map, models: built.workspace }); // the map pass built the torus
  // while that save is in flight, R is dragged to 3
  A.during = () => A.draw(slide(A.local.map, 'torus', 'r', 3, 5));
  A.push();
  ok('the server stored the built model in other bytes than were sent — the condition that used to cost the drag', srv.log[0]?.sentKey !== srv.log[0]?.storedKey);
  ok('no write of hers was refused', srv.log.every((l) => l.status === 200), JSON.stringify(srv.log.map((l) => l.status)));
  ok('the drag reached the server (R = 3)', valueOf(srv.row.map, 'torus', 'r') === 3, String(valueOf(srv.row.map, 'torus', 'r')));
  ok('  and R = 3 is still on her screen — it used to snap back to 2', valueOf(A.local.map, 'torus', 'r') === 3);
  ok('  with nothing left to send', settled(A.seen, A.local));
  ok('  at the server\'s version', A.seen.version === srv.row.updatedAt);
}

console.log('=== the version moves on the server\'s word, whatever bytes it stored ===');
{
  const built = openFromProposal(EMPTY_WORKSPACE, torus(), { at: 1 });
  const srv = server({ messages: [], map: stored({ nodes: [], edges: [] }), updatedAt: 100 }, { store: stored });
  const A = client(srv, 'Ana'), B = client(srv, 'Ben');
  A.read(); B.read();
  // mid-reply, so the screen keeps its own bytes of the map it sent
  A.busy = true;
  A.draw({ ...A.local.map, models: built.workspace });
  A.push(); // accepted — and stored in the server's bytes
  ok('the acknowledgement moves her version though her screen keeps its own bytes', A.seen.version === srv.row.updatedAt && !!A.seen.held && A.seen.held !== A.seen.map);
  B.say('user', 'only words'); B.push(); // someone else writes turns only: the version moves, the map does not
  A.read(); // still mid-reply: the row carries her own map, in the server's bytes
  ok('a row carrying her own map in the server\'s bytes is not mistaken for someone else\'s write', A.seen.version === srv.row.updatedAt, `${A.seen.version} vs ${srv.row.updatedAt}`);
  A.busy = false;
  A.draw(slide(A.local.map, 'torus', 'r', 2.5, 9));
  A.push();
  ok('  so her next change goes in first time — no refusal against a version she already held', srv.log.filter((l) => l.by === 'Ana').every((l) => l.status === 200), JSON.stringify(srv.log.map((l) => `${l.by}:${l.status}`)));
  ok('  and it is the server\'s now', valueOf(srv.row.map, 'torus', 'r') === 2.5);
  ok('  and Ben\'s words are on her screen', A.local.messages.some((m) => m.content === 'only words'));
}

console.log('=== what either side deleted since the base stays deleted ===');
{
  const ws = openFromProposal(openFromProposal(EMPTY_WORKSPACE, torus(), { at: 1 }).workspace, saddle(), { at: 2 }).workspace;
  let scene = create({ objs: [] }, 'scene', EMPTY_SCENE, { name: 'Scene', origin: 'person' }).space;
  scene = applyOp(scene, 'Scene', 'add', { shape: 'box', dims: 'w=1;h=1;d=1' }, { by: 'person', at: 3 }).space;
  const start = stored({ nodes: [{ id: 'n1', type: 'concept', label: 'Torus' }, { id: 'n2', type: 'idea', label: 'An ogive' }], edges: [{ from: 'n1', to: 'n2', relation: 'relates' }], models: ws, objects: scene });
  const srv = server({ messages: [], map: start, updatedAt: 100 }, { store: stored });
  const A = client(srv, 'Ana'), B = client(srv, 'Ben');
  A.read(); B.read();
  // Ana closes the torus and takes "An ogive" off the map by hand
  A.draw({ ...A.local.map, models: removeDoc(A.local.map.models, 'torus'), nodes: A.local.map.nodes.filter((n) => n.id !== 'n2'), edges: [], removed: ['an ogive'] });
  A.push();
  // Ben, meanwhile: moves the torus's R, renames the ogive node, and removes the scene
  let mine = slide(B.local.map, 'torus', 'r', 3.5, 50);
  mine = { ...mine, nodes: mine.nodes.map((n) => (n.id === 'n2' ? { ...n, label: 'An ogive, perhaps' } : n)) };
  const { objects: _scene, ...noScene } = mine;
  B.draw(noScene);
  B.push();
  const row = srv.row.map;
  ok('the model Ana closed stays closed — Ben\'s edited copy does not bring it back', !docOf(row.models, 'torus') && !!docOf(row.models, 'saddle'), JSON.stringify(row.models?.docs.map((d) => d.id)));
  ok('  and Ben is told what of his was not kept', B.lost.some((l) => /closed on another screen/.test(l)), JSON.stringify(B.lost));
  ok('the node Ana took off stays off, though Ben renamed it', !row.nodes.some((n) => n.id === 'n2'), ids(row));
  ok('  and her removal is remembered, so no copy of it comes back under another id', (row.removed ?? []).includes('an ogive'));
  ok('the scene Ben removed stays removed', !row.objects, JSON.stringify(row.objects));
  ok('  and no edge points at a node that is gone', row.edges.every((e) => row.nodes.some((n) => n.id === e.to) && row.nodes.some((n) => n.id === e.from)));
}

console.log('=== a hand edit made here is not undone by the server\'s copy ===');
{
  const srv = server({ messages: [], map: map2, updatedAt: 100 });
  const A = client(srv, 'Ana'), B = client(srv, 'Ben');
  A.read(); B.read();
  // Ben's extraction lands first: One is redrawn, Three appears
  B.draw({ nodes: [{ id: 'a', type: 'idea', label: 'One, as extracted' }, { id: 'b', type: 'idea', label: 'Two' }, { id: 'c', type: 'idea', label: 'Three' }], edges: [] });
  B.push();
  // Ana, on the older version, renamed Two by hand
  A.draw({ nodes: [{ id: 'a', type: 'idea', label: 'One' }, { id: 'b', type: 'idea', label: 'Two, as I mean it' }], edges: [] });
  A.push();
  const label = (id) => srv.row.map.nodes.find((n) => n.id === id)?.label;
  ok('Ana\'s rename stands', label('b') === 'Two, as I mean it', label('b'));
  ok('Ben\'s redrawing of the node Ana did not touch stands', label('a') === 'One, as extracted', label('a'));
  ok('Ben\'s new node stands', label('c') === 'Three');
}

console.log('=== two people add to one scene: both parts are kept, and still computed ===');
{
  let scene = create({ objs: [] }, 'scene', EMPTY_SCENE, { name: 'Scene', origin: 'person' }).space;
  scene = applyOp(scene, 'Scene', 'add', { shape: 'box', dims: 'w=1;h=1;d=1' }, { by: 'person', at: 1 }).space;
  const srv = server({ messages: [], map: stored({ nodes: [], edges: [], objects: scene }), updatedAt: 100 }, { store: stored });
  const A = client(srv, 'Ana'), B = client(srv, 'Ben');
  A.read(); B.read();
  A.draw(step(A.local.map, 'Scene', 'add', { shape: 'sphere', dims: 'r=0.25' }, 20));
  A.push();
  B.draw(step(B.local.map, 'Scene', 'add', { shape: 'cone', dims: 'r=0.1;h=0.4' }, 30));
  B.push();
  const shapes = partsOf(srv.row.map, 'Scene').map((n) => n.shape).sort().join(',');
  ok('the box, Ana\'s sphere and Ben\'s cone are all in the scene', shapes === 'box,cone,sphere', shapes);
  ok('  as one history: Ana\'s step, then Ben\'s computed again on top of it', srv.row.map.objects.objs[0].steps.map((s) => s.op).join() === 'add,add,add');
  A.read();
  ok('  on both screens', mapKey(A.local.map) === mapKey(srv.row.map) && mapKey(B.local.map) === mapKey(srv.row.map));

  // a step that no longer applies is said, never dropped quietly
  const base = srv.row.map;
  const theirs = step(base, 'Scene', 'remove', { id: 'box1' }, 40);
  const mine = step(base, 'Scene', 'set', { id: 'box1', key: 'h', value: 3 }, 41);
  const m = mergeMaps(base, mine, theirs);
  ok('a step on a part the other person removed is not applied', !partsOf(m.map, 'Scene').some((n) => n.id === 'box1'));
  ok('  and that is said', m.lost.some((l) => /could not be applied/.test(l)), JSON.stringify(m.lost));
  const looked = mergeObjects(base.objects, seek(base.objects, 'Scene', 0), theirs.objects);
  ok('a look back along the history here does not undo their step', partsOf({ objects: looked.space }, 'Scene').length === partsOf(theirs, 'Scene').length);
}

console.log('=== a viewer\'s screen follows the owner\'s, whatever it touched (audit exp5) ===');
{
  const srv = server({ messages: [], map: map1, updatedAt: 100 });
  const V = client(srv, 'Vee', { readOnly: true }), O = client(srv, 'Owner');
  V.read(); O.read();
  V.draw(map2); // a viewer touched the map — a slider, before the panels were read-only
  O.draw(map3); O.push();
  V.read();
  ok('the viewer\'s screen takes the owner\'s map — it used to freeze on its own edit', mapKey(V.local.map) === mapKey(map3), JSON.stringify(V.local.map));
  ok('  at the server\'s version', V.seen.version === srv.row.updatedAt);
  O.draw(map1); O.push(); V.read();
  ok('  and keeps following it', mapKey(V.local.map) === mapKey(map1));
  ok('a viewer never sends a map', !srv.log.some((l) => l.by === 'Vee'));
}

console.log('=== a pointer lands on the same card on every screen ===');
{
  const camA = { x: 120, y: -40, k: 1.5 };
  const camB = { x: -300, y: 80, k: 0.6 };
  const card = { x: 400, y: 260 };
  const onA = toScreen(card, camA);
  const world = toWorld(onA, camA);
  ok('A\'s pointer over the card is the card\'s map position', Math.abs(world.x - card.x) < 1e-9 && Math.abs(world.y - card.y) < 1e-9);
  const onB = toScreen(world, camB);
  ok('and on B\'s screen, with a different pan and zoom, it is over the same card', Math.abs(onB.x - toScreen(card, camB).x) < 1e-9 && Math.abs(onB.y - toScreen(card, camB).y) < 1e-9);
  ok('the camera is read off the world layer\'s transform', JSON.stringify(camFromTransform('matrix(1.5, 0, 0, 1.5, 120, -40)')) === JSON.stringify(camA));
  ok('  no transform is the identity', JSON.stringify(camFromTransform('none')) === JSON.stringify({ x: 0, y: 0, k: 1 }) && JSON.stringify(camFromTransform(null)) === JSON.stringify({ x: 0, y: 0, k: 1 }));
  ok('  a zero scale never divides by zero', Number.isFinite(toWorld({ x: 1, y: 1 }, { x: 0, y: 0, k: 0 }).x));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
