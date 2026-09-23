// A browser holds conversations, Logos sessions, the imported profile and the
// derived journey. Account deletion emptied the database and left all of it —
// so the next person on a shared device inherited it, and the sync-on-load
// paths pushed the deleted person's data up into the new account.
//
// The sweep is by PREFIX rather than by a list, because a list is what left
// logos_usage out of account deletion for months. These tests pin that: a key
// nobody has thought of yet is still covered.

import { clearSocriaLocalData, clearLocalMemory, MEMORY_KEYS, SOCRIA_PREFIX } from './.tmp/local-data.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));

function makeStore() {
  const m = new Map();
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear(),
    _map: m,
  };
}

globalThis.window = { localStorage: makeStore(), sessionStorage: makeStore() };
const L = globalThis.window.localStorage;
const S = globalThis.window.sessionStorage;

console.log('=== the sweep takes what belongs to a person ===');
const PERSONAL = [
  'socria.conversations.v1',
  'socria.logos.sessions.v1',
  'socria.importedProfile.v1',
  'socria.journey.v1',
  'socria.style.v1',
  'socria.personality.v1',
  'socria.pfp.v1',
  'socria.one.v1',
  'socria.activeConversationId.v1',
  // A key invented after this test was written. The point of the prefix
  // sweep is that it goes too, with nobody remembering to come back here.
  'socria.some.future.key.v9',
];
for (const k of PERSONAL) L.setItem(k, 'x');
S.setItem('socria.tab.v1', 'x');
L.setItem('socria.tour.v1', '1');
L.setItem('socria.hints.seen.v1', '1');
L.setItem('unrelated.other.app', 'keep me');

const removed = clearSocriaLocalData();
ok('it reports what it removed', removed === PERSONAL.length + 1, `${removed}`);
for (const k of PERSONAL) ok(`${k} is gone`, L.getItem(k) === null);
ok('sessionStorage is swept too', S.getItem('socria.tab.v1') === null);

console.log('\n=== and leaves what describes the device ===');
ok('the tour flag stays', L.getItem('socria.tour.v1') === '1');
ok('the hints flag stays', L.getItem('socria.hints.seen.v1') === '1');
ok('another app is untouched', L.getItem('unrelated.other.app') === 'keep me');

console.log('\n=== removing while iterating must not skip entries ===');
for (let i = 0; i < 20; i++) L.setItem(`${SOCRIA_PREFIX}bulk.${i}`, 'x');
clearSocriaLocalData();
const leftover = [...L._map.keys()].filter((k) => k.startsWith(SOCRIA_PREFIX) && k !== 'socria.tour.v1' && k !== 'socria.hints.seen.v1');
ok('nothing is left behind', leftover.length === 0, leftover.join(','));

console.log('\n=== clear-memory takes the imported profile too ===');
L.setItem('socria.journey.v1', 'x');
L.setItem('socria.importedProfile.v1', 'x');
L.setItem('socria.conversations.v1', 'keep — this is what they WROTE');
clearLocalMemory();
ok('the journey goes', L.getItem('socria.journey.v1') === null);
ok('the imported profile goes', L.getItem('socria.importedProfile.v1') === null, 'left behind, it is re-uploaded on the next load');
ok('what they wrote stays', L.getItem('socria.conversations.v1') !== null);
ok('the imported profile is in the memory list', MEMORY_KEYS.includes('socria.importedProfile.v1'));

console.log('\n=== a browser that refuses storage must not throw ===');
globalThis.window = {
  get localStorage() { throw new Error('blocked'); },
  get sessionStorage() { throw new Error('blocked'); },
};
let threw = false;
try { clearSocriaLocalData(); clearLocalMemory(); } catch { threw = true; }
ok('blocked storage is survivable', threw === false);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
