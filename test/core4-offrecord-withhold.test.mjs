// Off the record must not mean off duty.
//
// THE BUG. `withoutText` empties every free-text field before the state of an
// off-the-record conversation is saved, which is right: nothing the person
// wrote should reach durable storage after they asked for that. But the quote
// a withhold rests on (council D6) lives in exactly those fields, and it was
// emptied while `source` stayed 'explicit'. So on turn 2 the state still said
// "they explicitly asked not to be given the answer" and no longer carried the
// words proving it, allocate() found a quote-less withhold, and — because a
// withhold without a quote degrades to helping in production — handed over the
// answer. Someone who said "I want to work this out myself" got it done for
// them, silently, from their second message onward. Also true of any
// conversation whose Core 4 state read failed once, because a failed read is
// treated as off the record.
//
// WHY NO SUITE CAUGHT IT. allocate() throws on a quote-less withhold under
// CORE4_STRICT=1, and the chat route catches everything prepareTurn throws.
// The throw could not fail a test. So this suite asserts the invariant over
// the real save function instead of relying on that throw.

import { EMPTY_STATE } from './.tmp/state.mjs';
import { readSignals, NO_SIGNALS } from './.tmp/signals.mjs';
import { allocate } from './.tmp/allocation.mjs';
// EVIDENCE_WITHHELD comes through turn.mjs: lib/mind/types.ts already owns
// the bundle name types.mjs.
import { withoutText, EVIDENCE_WITHHELD } from './.tmp/turn.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));

const field = (value, evidence) => ({ value, source: 'explicit', confidence: 1, evidence });
const said = 'do not give me the answer, I want to work this out myself';

// Turn 1: they say it, and it holds.
const turn1 = {
  ...EMPTY_STATE,
  turn: 1,
  persistPolicy: 'none',
  latest: 'attempt',
  attempt: 'wrong',
  work: 'practice',
  taskKind: 'solve',
  directness: field('no_answer', said),
  learningGoal: field(true, said),
};
const alloc = (s) => allocate({ state: s, signals: NO_SIGNALS, contract: NO_SIGNALS, lastUserText: 'is this right?' });

console.log('=== turn 1 withholds ===');
const a1 = alloc(turn1);
ok('the answer is kept with them', !!a1.withhold, JSON.stringify(a1.withhold));
ok('  on the strength of their own words', a1.withhold?.quote?.includes('work this out myself'));

console.log('=== the saved state still withholds on turn 2 ===');
const saved = withoutText(turn1);
ok('their sentence is not stored', !JSON.stringify(saved).includes('work this out myself'));
ok('  nor is any other free text', saved.currentFocus === '' && saved.relations.length === 0);
ok('  the explicit reading survives', saved.directness.value === 'no_answer' && saved.directness.source === 'explicit');
ok('  with a marker in place of the quote', saved.directness.evidence === EVIDENCE_WITHHELD, saved.directness.evidence);

const a2 = alloc({ ...saved, turn: 2 });
ok('THE INVARIANT: turn 2 still withholds', !!a2.withhold, JSON.stringify(a2.withhold));
ok('  and the withhold has a quote, so it is never dropped', !!a2.withhold?.quote?.trim());
ok('  the same thing is kept back as on turn 1', a2.withhold?.what === a1.withhold?.what, `${a2.withhold?.what} vs ${a1.withhold?.what}`);

console.log('=== a marker is not mistaken for their words ===');
ok('an inferred field keeps nothing at all',
  withoutText({ ...turn1, directness: { value: 'no_answer', source: 'inferred', confidence: 0.7, evidence: said } }).directness.evidence === '');
ok('an empty field stays empty',
  withoutText({ ...turn1, directness: { value: 'none', source: 'default', confidence: 0, evidence: '' } }).directness.evidence === '');

console.log('=== and the strict guard can no longer fire on this path ===');
{
  // CORE4_STRICT=1 is set by test/run.mjs, so a regression here throws rather
  // than degrading — which is what this assertion is checking is not needed.
  let threw = null;
  try { alloc({ ...saved, turn: 2 }); } catch (e) { threw = e; }
  ok('no "withhold without a quote" from a saved off-record state', threw === null, String(threw));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
