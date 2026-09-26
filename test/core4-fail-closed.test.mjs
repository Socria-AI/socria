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

console.log('\n=== the database gets a deadline, like recall already had ===');
{
  // Four reads sat before the first token of every reply with no timeout at
  // all. A database having a slow minute held the entire reply for as long as
  // the connection took to give up — a turn with less continuity is a
  // degradation, a turn that never arrives is an outage.
  ok('the loads are bounded', /await withTimeout\(\s*\n\s*Promise\.all\(\[/.test(turn));
  // FOUR SECONDS, NOT TWO, AND THE CHANGE IS THE POINT. Two was "the same
  // deadline recall uses", and two seconds does not cover four Supabase round
  // trips from a cold serverless function. Missing it is not free: no
  // carried-forward state, nothing written that turn, and — for as long as a
  // failed read was treated as "off the record" — no lookups either. A cold
  // start was enough to do all three, which is what was reported from
  // production as a broken search.
  ok('  with a deadline a cold connection can actually meet', /STORE_TIMEOUT_MS = 4000/.test(turn));
  ok('  and a timeout reads as "policy unknown", not as a first turn',
    /\[\{ state: null, ok: false \}/.test(turn));
}

console.log('\n=== an empty answer from the state model is not an answer ===');
{
  const engine = read('lib/cognition/engine.ts');
  // JSON.parse(res.text || '{}') turned an empty completion into a valid,
  // empty state marked ok — and ok means "believe this", so everything carried
  // forward was replaced with defaults by a model that returned nothing.
  ok('an empty completion is a failed read', /const raw = \(res\.text \?\? ''\)\.trim\(\)/.test(engine));
  ok('  as is an object with no fields', /!Object\.keys\(parsed as object\)\.length/.test(engine));
  ok('  and it carries the prior state forward', /carrying the prior state forward'\);\s*\n\s*return \{ state: sanitizeState\(null\), ok: false \}/.test(engine));
  ok('  while a real answer is still believed', /return \{ state: sanitizeState\(parsed\), ok: true \}/.test(engine));
}

console.log('\n=== a failed read is told to research as UNKNOWN, which is not "none" ===');
{
  // THIS ASSERTION USED TO PIN THE OPPOSITE, AND IT WAS WRONG.
  //
  // It pinned `policy: policyUnknown ? 'none' : prior?.persistPolicy` under the
  // heading "a failed read does not open the internet either" — fail-closed by
  // analogy with persistence. The analogy does not hold, and the cost was paid
  // in production four times:
  //
  //   - 'none' does not mean "we don't know". It means "they asked for this to
  //     be off the record". An unreadable row was turned into an instruction
  //     nobody gave.
  //   - The read does not fail for a bad second only. A missing table, an
  //     absent service key, or a 2 s deadline a cold connection cannot meet
  //     fails EVERY read on EVERY turn — so this did not degrade search, it
  //     deleted it, while Logos searched the same provider fine.
  //   - And it deleted the explanation with it: renderNoResearch emits nothing
  //     when nothing was wanted, so the model was handed no block and wrote its
  //     own sentence — "I can't browse the web in real time." A false claim
  //     about what Socria is, manufactured by a fail-closed default.
  //
  // What still protects a sensitive conversation on a failed read is the part
  // that never needed a database: the signals from their own words. What
  // protects the rest is that a store which cannot be read is now a loud broken
  // deployment (GET /api/health/upstream) rather than one quietly missing
  // feature.
  ok("research is told 'unknown', not 'none'",
    /policy: policyUnknown \? 'unknown' : prior\?\.persistPolicy/.test(turn));
  const web = read('lib/core4/web.ts');
  ok("  'none' is still a refusal there", /policy === 'none'/.test(web));
  ok("  and 'unknown' is explicitly not one",
    /'unknown' MEANS THE ROW COULD NOT BE READ, AND IS NOT A REFUSAL/.test(web));
  // The write side is untouched: losing search was never the price of not
  // writing, and it still is not.
  ok('persistence still fails closed on the same flag',
    /p\.policyUnknown\s*\n?\s*\? Promise\.resolve\(\)/.test(turn));
  // And a refusal that IS the person's own policy no longer goes out silent.
  ok('a policy refusal reaches the prompt as a reason',
    /renderNoResearch\(wantedWeb\.want, buildQuery\(input\.lastUserText, \[\]\), refusedByPolicy\)/.test(turn));
}

console.log('\n=== a failed read does not switch memory off for good ===');
{
  // The fail-closed intent was right and the forced value was PERSISTED, and
  // mergeState carries a prior 'none' forward unchanged — so one slow Supabase
  // second switched a conversation's memory off for the rest of its life: no
  // ledger, no capability evidence, no Mind Graph write, every later state row
  // saved text-free, and no announcement, because that only fires on an
  // explicit request. "One turn of continuity is lost" is what the rule
  // promises; this is what makes it true.
  ok('the turn carries the unknown policy without writing it', /policyUnknown: boolean;/.test(turn));
  ok('  and the state save is skipped rather than written as "none"',
    /p\.policyUnknown\s*\n?\s*\? Promise\.resolve\(\)\s*\n?\s*: store\.saveState/.test(turn));
  const merge = read('lib/core4/merge.ts');
  ok("  which matters because a stored 'none' is sticky by design",
    /prev === 'none'/.test(merge) || /'none'/.test(merge));
}

console.log('\n=== the off-the-record sentence says what is true ===');
{
  // "Socria will not keep anything from this conversation" was a promise the
  // system does not keep: every Core 4 writer honours the policy, and the chat
  // itself is still saved to their account by the client, in their sidebar and
  // their export. An overstated privacy promise is worse than an accurate one.
  ok('the acknowledgement is scoped to what Socria remembers',
    /nothing from here goes into what Socria remembers about them/.test(turn));
  ok('  and says where the conversation itself lives', /stays in their sidebar/.test(turn));
  ok('  and how to turn memory back on', /"you can remember this" turns memory back on/.test(turn));
  ok('the old over-promise is gone', !/will not keep anything from this conversation/.test(turn));
}

console.log('\n=== the route outlives its own deadlines ===');
{
  // Core 4's internal budget sums past 8 s before the reply model is called,
  // and the state and ledger writes finish before the stream closes — so a
  // platform-default cut-off could both truncate the reply mid-sentence and
  // lose the turn's memory. The cron route declared a duration; the one route
  // that needed it did not.
  const route = read('app/api/chat/route.ts');
  ok('the chat route declares a maxDuration', /export const maxDuration = \d+/.test(route));
  ok('  longer than the serial budget before generation', (Number(/export const maxDuration = (\d+)/.exec(route)?.[1] ?? 0) * 1000) > 8000);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
