// An event now makes a round trip it never used to: the client sends it, the
// server splits it into (id, kind, user_id, payload) columns, and the GET
// reassembles it by spreading the payload back out and re-attaching an
// author it looked up itself.
//
// If that reassembly does not produce exactly what sanitizeEvent expects, the
// room goes quiet with no error anywhere — the events are stored, returned,
// and silently dropped on arrival. These pin the shape at both ends.

import { sanitizeEvent } from './.tmp/collab-transport.mjs';
import { applyEvent, initialState } from './.tmp/collab.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));

const BY = { id: 'u_ada', name: 'Ada', seat: 'host' };

/** What app/api/logos/room/events POST does before it writes a row. */
function toRow(ev, userId, member) {
  const clean = sanitizeEvent({ ...ev, by: { id: userId, name: member.name, seat: member.seat } });
  if (!clean) return null;
  const { id, kind, at, by, ...payload } = clean;
  return { id, kind, user_id: userId, payload, created_at: at ?? 0 };
}

/** What the GET does when it reads rows back. */
function fromRow(row, seq, present) {
  const who = present.find((p) => p.id === row.user_id);
  return {
    id: row.id,
    at: row.created_at,
    kind: row.kind,
    seq,
    by: { id: row.user_id, name: who?.name ?? 'Someone', seat: who?.seat ?? 'guest' },
    ...row.payload,
  };
}

const PRESENT = [BY, { id: 'u_ben', name: 'Ben', seat: 'guest' }];

const CASES = [
  ['message', { kind: 'message', message: { role: 'user', content: 'I think we should take it.' } }],
  ['node.add', { kind: 'node.add', node: { id: 'n1', type: 'idea', label: 'it pays more' } }],
  ['node.edit', { kind: 'node.edit', nodeId: 'n1', label: 'it pays a lot more' }],
  ['node.remove', { kind: 'node.remove', nodeId: 'n1' }],
  ['map', { kind: 'map', map: { nodes: [{ id: 'k1', type: 'claim', label: 'x' }], edges: [] } }],
  ['hello', { kind: 'hello', participant: { id: 'u_ada', name: 'Ada', seat: 'host' } }],
  ['bye', { kind: 'bye' }],
];

console.log('=== every event kind survives the round trip ===');
for (const [label, body] of CASES) {
  const sent = { id: `e_${label}`, at: 1000, by: BY, ...body };
  const row = toRow(sent, 'u_ada', { name: 'Ada', seat: 'host' });
  ok(`${label} stores`, !!row, 'sanitizeEvent rejected it on the way in');
  if (!row) continue;
  const back = fromRow(row, 7, PRESENT);
  const parsed = sanitizeEvent(back);
  ok(`${label} comes back`, !!parsed, JSON.stringify(back).slice(0, 120));
  if (!parsed) continue;
  ok(`${label} keeps its kind`, parsed.kind === body.kind);
  ok(`${label} keeps its author`, parsed.by?.id === 'u_ada' && parsed.by?.seat === 'host');
}

console.log('\n=== the server decides the author, not the sender ===');
{
  // A client claiming to be somebody else.
  const forged = {
    id: 'e_forged', at: 1000,
    by: { id: 'u_ben', name: 'Ben', seat: 'guest' },
    kind: 'message', message: { role: 'user', content: 'Ben said this' },
  };
  const row = toRow(forged, 'u_ada', { name: 'Ada', seat: 'host' });
  ok('a forged author is overwritten', row?.user_id === 'u_ada', JSON.stringify(row));
  const back = sanitizeEvent(fromRow(row, 1, PRESENT));
  ok('and it reads back as the real sender', back?.by?.id === 'u_ada' && back?.by?.name === 'Ada');
  ok('including the seat', back?.by?.seat === 'host');
}

console.log('\n=== an unknown extra column does not break the reducer ===');
{
  const row = toRow({ id: 'e_x', at: 5, by: BY, kind: 'message', message: { role: 'user', content: 'hi' } }, 'u_ada', { name: 'Ada', seat: 'host' });
  const back = fromRow(row, 42, PRESENT);
  ok('seq rides along', back.seq === 42);
  const parsed = sanitizeEvent(back);
  ok('and sanitizeEvent drops it', parsed && parsed.seq === undefined);
  let st = initialState('ABCDEFGH', BY, { id: 's1', title: 't', messages: [], map: { nodes: [], edges: [] }, updatedAt: 0 });
  st = applyEvent(st, parsed);
  ok('the reducer accepts it', st.session.messages.length === 1, JSON.stringify(st.session.messages));
  // Replayed (our own events come back to us) — must not double up.
  st = applyEvent(st, parsed);
  ok('and a replay is idempotent', st.session.messages.length === 1, `${st.session.messages.length}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
