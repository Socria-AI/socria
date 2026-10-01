// A channel is a place a stranger can shout into — the room code is a soft
// gate, not a wall. So every event off the wire goes through sanitizeEvent
// before it reaches the reducer, and it gets no weaker a check for arriving
// over a socket than a saved session gets from disk. These pin that.

import { sanitizeEvent } from './.tmp/collab-transport.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

const BY = { id: 'u1', name: 'Ada', seat: 'host' };
const base = (kind, extra) => ({ id: 'e1', at: 1000, by: BY, kind, ...extra });

// ── the envelope ──────────────────────────────────────────────────────
ok('null is nothing', sanitizeEvent(null) === null);
ok('a string is nothing', sanitizeEvent('hello') === null);
ok('an unknown kind is dropped', sanitizeEvent(base('drop.table', {})) === null);
ok('a missing id is dropped', sanitizeEvent({ at: 1, by: BY, kind: 'bye' }) === null);
ok('a missing author is dropped', sanitizeEvent({ id: 'e', at: 1, kind: 'bye' }) === null);
ok('a broken author is dropped', sanitizeEvent({ id: 'e', at: 1, by: { seat: 'host' }, kind: 'bye' }) === null);
ok('a non-number at becomes 0', sanitizeEvent(base('bye', { at: 'soon' }))?.at === 0);

// ── message ───────────────────────────────────────────────────────────
{
  const ev = sanitizeEvent(base('message', { message: { role: 'user', content: 'hi' } }));
  ok('a good message survives', ev?.message?.content === 'hi' && ev.by.seat === 'host');
  ok('a message with no role is dropped', sanitizeEvent(base('message', { message: { content: 'x' } })) === null);
  ok('a non-string content is dropped', sanitizeEvent(base('message', { message: { role: 'user', content: 5 } })) === null);
  const long = sanitizeEvent(base('message', { message: { role: 'user', content: 'a'.repeat(99999) } }));
  ok('a huge message is capped', long.message.content.length === 12_000);
}

// ── nodes: same trust as storage ──────────────────────────────────────
{
  const ev = sanitizeEvent(base('node.add', { node: { id: 'n1', type: 'idea', label: 'one' } }));
  ok('a good node survives', ev?.node?.id === 'n1' && ev.node.label === 'one');
  ok('a node with no id is dropped', sanitizeEvent(base('node.add', { node: { type: 'idea', label: 'x' } })) === null);
  ok('a node with no label is dropped', sanitizeEvent(base('node.add', { node: { id: 'n', type: 'idea' } })) === null);
  // an unfamiliar type is kept (sanitizeMap keeps thinking), a broken node is not
  ok('an odd type is kept', sanitizeEvent(base('node.add', { node: { id: 'n', type: 'zzz', label: 'x' } }))?.node.id === 'n');

  const edit = sanitizeEvent(base('node.edit', { nodeId: 'n1', label: 'two' }));
  ok('a good edit survives', edit?.nodeId === 'n1' && edit.label === 'two');
  ok('an edit with no label is dropped', sanitizeEvent(base('node.edit', { nodeId: 'n1' })) === null);

  const rm = sanitizeEvent(base('node.remove', { nodeId: 'n1' }));
  ok('a good remove survives', rm?.nodeId === 'n1');
  ok('a remove with no id is dropped', sanitizeEvent(base('node.remove', {})) === null);
}

// ── hello carries a session, sanitised ────────────────────────────────
{
  const ev = sanitizeEvent(base('hello', {
    participant: { id: 'u1', name: 'Ada', seat: 'host' },
    session: {
      id: 's1', title: 'x', updatedAt: 1,
      messages: [
        { role: 'user', content: 'keep', by: { id: 'u1', name: 'Ada', seat: 'host' } },
        { role: 'nope', content: 'drop' },
        { role: 'assistant', content: 'keep2' },
      ],
      map: { nodes: [{ id: 'n', type: 'idea', label: 'k' }, { garbage: true }], edges: [] },
    },
  }));
  ok('hello survives', ev?.kind === 'hello' && ev.participant.seat === 'host');
  ok('its session is adopted', ev.session?.id === 's1');
  ok('bad messages are dropped', ev.session.messages.length === 2);
  ok('a message keeps its author', ev.session.messages[0].by.seat === 'host');
  ok('the map is sanitised', ev.session.map.nodes.length === 1);
  ok('a hello with no participant is dropped', sanitizeEvent(base('hello', {})) === null);
  ok('a hello without a session is fine', sanitizeEvent(base('hello', { participant: { id: 'u', name: 'B', seat: 'guest' } }))?.session === undefined);
}

// ── map ───────────────────────────────────────────────────────────────
{
  const ev = sanitizeEvent(base('map', { map: { nodes: [{ id: 'a', type: 'claim', label: 'x' }], edges: [] } }));
  ok('a map survives sanitised', ev?.map?.nodes.length === 1);
  ok('a garbage map becomes empty', sanitizeEvent(base('map', { map: 'nope' }))?.map.nodes.length === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
