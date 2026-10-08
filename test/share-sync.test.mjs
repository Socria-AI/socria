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

import { outgoing, settled, absorb, seenOf, unseen, mapKey, mergeTurns, pendingTurns, MAX_APPEND, toWorld, toScreen, camFromTransform } from './.tmp/sync.mjs';

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
// carries the row's turns and map as they now stand.
function server(initial) {
  const row = { messages: initial.messages.map((m) => ({ ...m })), map: initial.map, updatedAt: initial.updatedAt };
  return {
    row,
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
        if (wantsMap && !stale) row.map = body.map;
        row.updatedAt = prior + 1;
      }
      const answer = { updatedAt: row.updatedAt, prior, map: row.map, messages: row.messages.map((m) => ({ ...m })) };
      return stale ? { status: 409, conflict: true, ...answer } : { status: 200, ...answer };
    },
  };
}

// ── a client, running the hook's decisions ──────────────────────────────
function client(srv, name) {
  const c = { name, seen: null, local: { messages: [], map: null }, busy: false, author: { id: `alias_${name}`, name, seat: 'guest' } };
  const take = (remote, how = {}) => {
    const base = c.seen ?? unseen(c.local);
    const r = absorb(base, remote, c.local, { busy: c.busy, takeMap: how.takeMap });
    c.seen = r.seen;
    c.local = { messages: r.messages, map: r.takeMap ? remote.map : c.local.map };
    return r;
  };
  c.read = () => {
    const r = srv.get(c.seen ? c.seen.version : 0);
    if (!r.unchanged) take(r);
    if (!settled(c.seen, c.local)) c.push();
  };
  c.push = () => {
    for (let round = 0; round < 3; round++) {
      const o = outgoing(c.seen, c.local);
      if (!o.append.length && o.map === undefined) return true;
      const res = srv.post({ base: c.seen.version, append: o.append, ...(o.map !== undefined ? { map: o.map } : {}) }, c.author);
      const conflict = res.status === 409;
      if (o.map !== undefined && !conflict) c.seen = { ...c.seen, map: mapKey(o.map) };
      take(res, { takeMap: conflict });
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

console.log('=== a map refused (409) with a turn beside it ===');
{
  const srv = server({ messages: legacy, map: map1, updatedAt: 100 });
  const A = client(srv, 'Ana'), B = client(srv, 'Ben');
  A.read(); B.read();
  B.draw(map3); B.push(); // Ben's map lands first
  A.say('user', 'a1'); A.say('assistant', 'A1'); A.draw(map2);
  A.push(); // Ana's map was drawn on the older version
  ok('the turns sent beside a refused map went in anyway', srv.row.messages.some((m) => m.content === 'a1') && srv.row.messages.some((m) => m.content === 'A1'), words(srv.row.messages));
  ok('Ben\'s map was not overwritten', mapKey(srv.row.map) === mapKey(map3));
  ok('Ana now shows Ben\'s map, and her own words', mapKey(A.local.map) === mapKey(map3) && A.local.messages.some((m) => m.content === 'A1'));
  ok('  and has nothing left to send', settled(A.seen, A.local));
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
  ok('so the map she drew without his is refused, not written over his', mapKey(srv.row.map) === mapKey(map3), JSON.stringify(srv.row.map));
  ok('  and she takes his', mapKey(A.local.map) === mapKey(map3));
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
