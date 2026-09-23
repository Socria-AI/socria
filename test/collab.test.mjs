// Logos 2 — two people, one map. The part with no browser in it.
//
// The design's whole claim is that two clients which have seen the same
// events, in ANY order, hold the same state. Every interesting assertion
// here is about that: the same events shuffled, repeated, and interleaved
// must converge. If these hold, the transport only has to deliver.

import {
  CODE_ALPHABET, CODE_LEN, MAX_PEOPLE, SEAT_COLOR,
  applyAll, applyEvent, byOf, cleanName, collabBlock, contributions, eventId,
  handNode, initialOf, initialState, isShareCode, joinCodeFrom, joinUrl,
  makeShareCode, normalizeCode, roomFor, sanitizeBy, seatFor, signTurns,
} from './.tmp/collab.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const HOST = { id: 'u_host', name: 'Ada', seat: 'host' };
const GUEST = { id: 'u_guest', name: 'Ben', seat: 'guest' };
const SESSION = { id: 's1', title: 'The offer', messages: [], map: { nodes: [], edges: [] }, updatedAt: 1 };
let t = 1000;
const ev = (kind, by, extra) => ({ id: eventId(++t, () => 0.5), at: t, by: byOf(by), kind, ...extra });

// ── the share code ────────────────────────────────────────────────────
{
  const code = makeShareCode(() => 0.999);
  ok('the length the server issues', code.length === CODE_LEN);
  ok('from the alphabet', [...code].every((c) => CODE_ALPHABET.includes(c)));
  // Nothing that reads as something else over the phone.
  for (const bad of ['0', 'O', '1', 'I', 'L']) ok(`no ${bad} in the alphabet`, !CODE_ALPHABET.includes(bad));
  ok('validates', isShareCode(code));
  ok('rejects the wrong length', !isShareCode('ABC'));
  ok('rejects a bad letter', !isShareCode('ABCDE0'));
  // Was `... !== null || true`, which could not fail (caught by the test-lint in core4-p0-reproduce).
  ok('lower case is fine', normalizeCode(CODE_ALPHABET.slice(0, CODE_LEN).toLowerCase()) === CODE_ALPHABET.slice(0, CODE_LEN));
  ok('spaces and dashes are what people add', normalizeCode(' abcd-efgh ') === 'ABCDEFGH');
  ok('a real one round-trips', normalizeCode(code.toLowerCase()) === code);
  ok('one room per code', roomFor('ABCDEF') === 'logos2:ABCDEF');
  // deterministic under a fixed rng
  ok('deterministic', makeShareCode(() => 0.1) === makeShareCode(() => 0.1));
}

// ── people ────────────────────────────────────────────────────────────
{
  ok('a name is cleaned', cleanName('  ada   lovelace ', 'x') === 'ada lovelace');
  ok('an empty name falls back', cleanName('', 'Guest') === 'Guest');
  ok('a novel is cut', cleanName('a'.repeat(200), 'x').length === 40);
  ok('the initial', initialOf('ben') === 'B' && initialOf('') === '?');
  ok('the host is moss', SEAT_COLOR.host === '#5e7633');
  ok('the guest is slate', SEAT_COLOR.guest === '#3A6EA5');
  ok('vermilion is not a person', !Object.values(SEAT_COLOR).includes('#D8402F'));
  ok('the first arrival is the host', seatFor([]) === 'host');
  ok('the second is the guest', seatFor([HOST]) === 'guest');
  ok('a by is small', same(byOf(HOST), { id: 'u_host', name: 'Ada', seat: 'host' }));
  ok('a broken by is nothing', sanitizeBy({ seat: 'host' }) === undefined && sanitizeBy(null) === undefined);
  ok('a good by survives', same(sanitizeBy({ id: 'x', name: 'Y', seat: 'guest' }), { id: 'x', name: 'Y', seat: 'guest' }));
  ok('a nameless by gets its seat as a name', sanitizeBy({ id: 'x', seat: 'guest' }).name === 'Guest');
}

// ── hello: the guest adopts the host's session ────────────────────────
{
  const guest = initialState('ABCDEF', GUEST, null);
  ok('a guest starts without a session', guest.session === null);
  const after = applyEvent(guest, ev('hello', HOST, { participant: HOST, session: SESSION }));
  ok('and adopts the host\'s on hello', after.session?.id === 's1');
  ok('host first in presence', after.present[0].seat === 'host' && after.present[1].seat === 'guest');
  // a second hello from the host must not reset what has happened since
  const withMsg = applyEvent(after, ev('message', GUEST, { message: { role: 'user', content: 'hi' } }));
  const again = applyEvent(withMsg, ev('hello', HOST, { participant: HOST, session: SESSION }));
  ok('a repeat hello does not roll the session back', again.session.messages.length === 1);
  // a third person cannot get in
  const third = applyEvent(after, ev('hello', { id: 'u3', name: 'Cy', seat: 'guest' }, { participant: { id: 'u3', name: 'Cy', seat: 'guest' } }));
  ok(`presence is capped at ${MAX_PEOPLE}`, third.present.length === MAX_PEOPLE);
  ok('bye removes them', applyEvent(after, ev('bye', GUEST, {})).present.length === 1);
}

// ── messages: attributed, appended, once ──────────────────────────────
{
  const s0 = initialState('ABCDEF', HOST, SESSION);
  const m1 = ev('message', HOST, { message: { role: 'user', content: 'I think we should take it.' } });
  const m2 = ev('message', GUEST, { message: { role: 'user', content: 'I am not sure the money is the point.' } });
  const s = applyAll(s0, [m1, m2]);
  ok('both messages land', s.session.messages.length === 2);
  ok('each carries its author', s.session.messages[0].by.seat === 'host' && s.session.messages[1].by.seat === 'guest');
  ok('the author on the event wins over any on the message', applyEvent(s0, ev('message', GUEST, { message: { role: 'user', content: 'x', by: byOf(HOST) } })).session.messages[0].by.seat === 'guest');
  ok('a repeated event is a no-op', applyAll(s0, [m1, m1, m1]).session.messages.length === 1);
  ok('idempotent under re-delivery', same(applyAll(s0, [m1, m2, m1, m2]).session, s.session));
}

// ── nodes: add, edit, remove — converging from either order ───────────
{
  const s0 = initialState('ABCDEF', HOST, SESSION);
  const add = ev('node.add', GUEST, { node: handNode('n1', 'the tension between pay and growth') });
  const s1 = applyEvent(s0, add);
  ok('a guest can put a node on the map', s1.session.map.nodes.length === 1);
  ok('and it is theirs', s1.session.map.nodes[0].by.seat === 'guest');
  ok('adding it twice is once', applyAll(s0, [add, add]).session.map.nodes.length === 1);

  // two people edit the same node; both clients must agree on the label
  const e1 = ev('node.edit', HOST, { nodeId: 'n1', label: 'pay vs growth' });
  const e2 = ev('node.edit', GUEST, { nodeId: 'n1', label: 'growth, not pay' }); // later
  const a = applyAll(s1, [e1, e2]);
  const b = applyAll(s1, [e2, e1]);
  ok('concurrent edits converge', a.session.map.nodes[0].label === b.session.map.nodes[0].label);
  ok('and the later one wins', a.session.map.nodes[0].label === 'growth, not pay');

  // a tie on the clock still converges
  const tie1 = { ...ev('node.edit', HOST, { nodeId: 'n1', label: 'alpha' }), at: 5000 };
  const tie2 = { ...ev('node.edit', GUEST, { nodeId: 'n1', label: 'beta' }), at: 5000 };
  ok('a clock tie converges', applyAll(s1, [tie1, tie2]).session.map.nodes[0].label === applyAll(s1, [tie2, tie1]).session.map.nodes[0].label);

  const rm = ev('node.remove', HOST, { nodeId: 'n1' });
  ok('remove takes it off', applyEvent(s1, rm).session.map.nodes.length === 0);
  ok('editing a removed node is a no-op', applyAll(s1, [rm, e2]).session.map.nodes.length === 0);
}

// ── the extractor's map: attribution survives it ──────────────────────
{
  const s0 = initialState('ABCDEF', HOST, SESSION);
  const s1 = applyAll(s0, [
    ev('message', HOST, { message: { role: 'user', content: 'it pays more' } }),
    ev('node.add', GUEST, { node: handNode('g1', 'growth') }),
    ev('message', GUEST, { message: { role: 'user', content: 'growth matters more' } }),
  ]);
  // the extractor rebuilds the map and knows nothing about who said what
  const extracted = { nodes: [{ id: 'g1', type: 'idea', label: 'growth' }, { id: 'x1', type: 'claim', label: 'it pays more' }], edges: [] };
  const s2 = applyEvent(s1, ev('map', HOST, { map: extracted }));
  ok('a node that survives keeps its author', s2.session.map.nodes.find((n) => n.id === 'g1').by.seat === 'guest');
  ok('a new node is credited to the last speaker', s2.session.map.nodes.find((n) => n.id === 'x1').by.seat === 'guest');
  ok('the scoreboard is honest', same(contributions(s2.session.map), { host: 0, guest: 2 }));
}

// ── the whole point: any order, same state ────────────────────────────
{
  const s0 = initialState('ABCDEF', HOST, SESSION);
  const evs = [
    ev('message', HOST, { message: { role: 'user', content: 'a' } }),
    ev('node.add', GUEST, { node: handNode('n1', 'one') }),
    ev('node.edit', HOST, { nodeId: 'n1', label: 'one, refined' }),
    ev('message', GUEST, { message: { role: 'user', content: 'b' } }),
    ev('node.add', HOST, { node: handNode('n2', 'two') }),
    ev('node.remove', GUEST, { nodeId: 'n2' }),
  ];
  // messages are order-sensitive by design (a conversation IS its order), so
  // compare the MAP under every permutation and the thread under the same order
  const perms = (arr) => arr.length <= 1 ? [arr] : arr.flatMap((x, i) => perms([...arr.slice(0, i), ...arr.slice(i + 1)]).map((p) => [x, ...p]));
  const maps = new Set(perms(evs).map((p) => JSON.stringify(applyAll(s0, p).session.map)));
  ok(`the map converges under all ${perms(evs).length} orderings`, maps.size === 1, `${maps.size} distinct`);
  // and re-delivering everything twice changes nothing
  const once = applyAll(s0, evs), twice = applyAll(once, evs);
  ok('re-delivery is a no-op', same(once.session, twice.session));
}

// ── Socria between them ───────────────────────────────────────────────
{
  const block = collabBlock([HOST, GUEST]);
  ok('names both people', block.includes('Ada') && block.includes('Ben'));
  for (const w of ['CONNECTIONS', 'DISAGREEMENTS', 'ASSUMPTIONS', 'QUESTIONS']) ok(`names its job: ${w}`, block.includes(w));
  ok('never takes a side', /Never take a side/.test(block));
  ok('never concludes', /never conclude/i.test(block));
  ok('is the layer between, not a voice', /not a third voice/.test(block));
  ok('one person is no block', collabBlock([HOST]) === '');
  const signed = signTurns([
    { role: 'user', content: 'x', by: byOf(HOST) },
    { role: 'assistant', content: 'y' },
    { role: 'user', content: 'z' },
  ]);
  ok('a human turn is signed', signed[0].content === 'Ada: x');
  ok('Socria\'s is not', signed[1].content === 'y');
  ok('an unattributed one is left alone', signed[2].content === 'z');
}

// ── the link ──────────────────────────────────────────────────────────
{
  const u = joinUrl('https://socria.app/', 'ABCDEFGH');
  ok('the link opens the right surface', u === 'https://socria.app/chat?model=logos-2&join=ABCDEFGH');
  // The length here must match what the server issues, or every invite
  // link silently fails to open — which is exactly what an earlier CODE_LEN
  // of 6 did once the server moved to 8.
  ok('and reads back', joinCodeFrom('?model=logos-2&join=abcdefgh') === 'ABCDEFGH');
  ok('a bad code reads as none', joinCodeFrom('?join=nope') === null);
  ok('no code reads as none', joinCodeFrom('') === null);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
