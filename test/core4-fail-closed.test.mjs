// When Socria cannot read what somebody asked for, it does not guess.
//
// THE BUG, and it is the shape of bug that never gets found in production
// because it only happens while something else is already broken.
// `loadState` answered `null` for two different things: "this is the first
// turn" and "the read failed". They are not the same, and `persistPolicy` —
// the field carrying OFF THE RECORD and THIS IS SENSITIVE — lives in that row.
//
// So a transient database error on turn five of an off-the-record conversation
// looked exactly like turn one: the state restarted from EMPTY_STATE with
// persistPolicy 'full', and the conversation somebody had explicitly asked not
// to be remembered was written to durable memory. An explicit instruction,
// reversed silently, only when the database was already having a bad minute.
//
// The read now says which it was, and a turn that cannot read the policy does
// not write. One turn of continuity is lost on a turn that was already
// degraded; nothing is remembered that somebody asked to keep off the record.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));

const store = read('lib/core4/store.ts');
const turn = read('lib/core4/turn.ts');
const route = read('app/api/chat/route.ts');

console.log('=== the read distinguishes "no row" from "it failed" ===');
{
  ok('loadState returns both the state and whether the read worked',
    /Promise<\{ state: CognitiveState \| null; ok: boolean \}>/.test(store));
  ok('  a database error is not silently a first turn', /fail\('core4_state', error\);\s*\n\s*return \{ state: null, ok: false \}/.test(store));
  ok('  a thrown error is not either', /catch \(e\) \{\s*\n\s*fail\('core4_state', e\);\s*\n\s*return \{ state: null, ok: false \}/.test(store));
  ok('  and an empty table still reads as ok', /return \{ state: \(data\?\.state as CognitiveState\) \?\? null, ok: true \}/.test(store));
}

console.log('\n=== a turn that cannot read the policy does not write ===');
{
  ok('the turn notices', /const policyUnknown = !priorRead\.ok/.test(turn));
  ok('  and fails closed on persistence', /policyUnknown \? \{ persistPolicy: 'none' as const \} : \{\}/.test(turn));
  // And 'none' is what the route already honours, so nothing new had to be
  // taught to the writers — this rides the existing off-the-record path.
  ok('the route already refuses to write on that policy', /persistPolicy === 'none'\) return;/.test(route));
}

console.log('\n=== the signed-out and no-conversation paths still read as ok ===');
{
  // Those are not failures; they are turns with nowhere to load from, and
  // treating them as unknown would stop memory working for everybody.
  ok('no store means ok, not unknown', /Promise\.resolve\(\{ state: null, ok: true \}\)/.test(turn));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
