// Keeping one shared line of thinking in step across screens.
//
// The failures: a poll wiping a turn someone is still sending; a client
// re-sending turns the server already has; a map pushed when nothing changed;
// a pointer landing on a different card on someone else's screen.

import { outgoing, settled, mayAdopt, seenOf, mapKey, toWorld, toScreen, camFromTransform } from './.tmp/sync.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

const T = (role, content) => ({ role, content });
const map1 = { nodes: [{ id: 'a', type: 'idea', label: 'One' }], edges: [] };
const map2 = { nodes: [{ id: 'a', type: 'idea', label: 'One' }, { id: 'b', type: 'idea', label: 'Two' }], edges: [] };
const server = { messages: [T('user', 'hi'), T('assistant', 'hello')], map: map1, updatedAt: 100 };
const seen = seenOf(server);

console.log('=== what goes out ===');
{
  ok('a version is what was seen', seen.count === 2 && seen.version === 100 && seen.map === mapKey(map1));
  const same = outgoing(seen, { messages: server.messages, map: map1 });
  ok('nothing new, nothing sent', same.append.length === 0 && same.map === undefined);
  ok('  and that is settled', settled(seen, { messages: server.messages, map: map1 }));
  const more = outgoing(seen, { messages: [...server.messages, T('user', 'and naps?'), T('assistant', 'maybe')], map: map1 });
  ok('only the turns after the ones seen are appended', more.append.length === 2 && more.append[0].content === 'and naps?' && more.map === undefined);
  ok('  as role and words only — the server names the author', !('by' in more.append[0]));
  const blank = outgoing(seen, { messages: [...server.messages, T('user', '   '), { role: 'system', content: 'x' }], map: map1 });
  ok('empty turns and anything not a turn are not sent', blank.append.length === 0);
  const mapped = outgoing(seen, { messages: server.messages, map: map2 });
  ok('a changed map is sent whole', mapped.map === map2 && mapped.append.length === 0);
  ok('  an equal map (a new object, same content) is not', outgoing(seen, { messages: server.messages, map: JSON.parse(JSON.stringify(map1)) }).map === undefined);
}

console.log('=== what comes in ===');
{
  const local = { messages: server.messages, map: map1 };
  ok('a newer version replaces the screen when nothing is pending', mayAdopt(seen, 101, local, false));
  ok('  not an older or equal one', !mayAdopt(seen, 100, local, false) && !mayAdopt(seen, 50, local, false));
  ok('  not while a reply is streaming', !mayAdopt(seen, 101, local, true));
  ok('  and never over a turn still being sent', !mayAdopt(seen, 101, { messages: [...server.messages, T('user', 'unsent')], map: map1 }, false));
  ok('  nor over an unsent map', !mayAdopt(seen, 101, { messages: server.messages, map: map2 }, false));
}

console.log('=== two clients converge ===');
{
  // a tiny server with the route's semantics: append to the row as it stands,
  // refuse a map drawn on an older version
  const row = { messages: [...server.messages], map: map1, updatedAt: 100 };
  const write = (body) => {
    if (body.map !== undefined && body.base !== row.updatedAt) return { status: 409, map: row.map, messages: row.messages, updatedAt: row.updatedAt };
    if (body.append) row.messages = [...row.messages, ...body.append];
    if (body.map !== undefined) row.map = body.map;
    row.updatedAt += 1;
    return { status: 200, updatedAt: row.updatedAt, messages: row.messages };
  };
  const client = () => ({ seen: seenOf(row), local: { messages: [...row.messages], map: row.map } });
  const A = client(), B = client();
  A.local.messages.push(T('user', 'from A'));
  B.local.messages.push(T('user', 'from B'));
  for (const c of [A, B]) {
    const o = outgoing(c.seen, c.local);
    const r = write({ base: c.seen.version, append: o.append });
    c.seen = { count: r.messages.length, map: c.seen.map, version: r.updatedAt };
  }
  ok('both turns land on the server', row.messages.some((m) => m.content === 'from A') && row.messages.some((m) => m.content === 'from B') && row.messages.length === 4);
  // A changes the map first; B's map, drawn on the older version, is refused
  A.local.map = map2;
  const ra = write({ base: row.updatedAt, map: outgoing(seenOf(row), A.local).map });
  const rb = write({ base: 100, map: { nodes: [], edges: [] } });
  ok('the first map lands; the stale one is refused with the current map', ra.status === 200 && rb.status === 409 && mapKey(rb.map) === mapKey(map2));
  // B adopts what is there, and both now see the same thing
  B.seen = seenOf({ messages: rb.messages, map: rb.map, updatedAt: rb.updatedAt });
  B.local = { messages: [...rb.messages], map: rb.map };
  const Aseen = seenOf(row);
  ok('after the refusal both screens hold the same state', mapKey(B.local.map) === mapKey(row.map) && B.local.messages.length === row.messages.length && B.seen.version === Aseen.version);
  ok('  and neither has anything left to send', settled(B.seen, B.local));
}

console.log('=== a pointer lands on the same card on every screen ===');
{
  const camA = { x: 120, y: -40, k: 1.5 };
  const camB = { x: -300, y: 80, k: 0.6 };
  const card = { x: 400, y: 260 }; // a card's position on the map
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
