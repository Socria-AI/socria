// The plan table, and the one axis it turns on.
//
// The free tier used to clip every dimension at once — eight map nodes, one
// lens, one depth, one Explore, one Research, twelve turns of memory, AND two
// lines of thinking a month. Then (October 31, 2026) it was the same Socria
// counted by the month: three conversations, two Logic Maps, ten Logic Map
// nodes, two artifacts and one document. Since November 9, 2026 there is no
// free tier at all, only a seven-day trial (lib/trial.ts): 4,000 tokens a UTC
// day, 28,000 in all, held on the server by lib/sleep-server.ts. The `free`
// plan in the table is now the trial's, and its counts are lifted to Socria
// One's own fair-use ceilings — the tokens are the trial's limit, not a count.
//
// This suite asserts the SHAPE: that what Socria can do is the same Socria on
// both plans, that no count differs between them any more, that exactly the
// features the product is sold on are Socria One's alone (Voice, sharing, the
// experiments), that the comparison and the sentences are written from the
// table and the trial — and, the assertion that keeps the copy honest, that no
// boundary note offers Socria One at a ceiling Socria One also has.

import {
  PLANS,
  COUNTERS,
  COUNTER_SCOPE,
  TIERED_COUNTERS,
  UNIT_COUNTERS,
  FEATURES,
  hasFeature,
  nearLimit,
  comparisonRows,
  freePlanSentence,
  onePlanSentence,
  allowanceLabel,
  LIMIT_OFFER,
  FEATURE_NOTE,
  limitsFor,
  limitOf,
  isSpent,
  remaining,
  boundaryNote,
  DIRECT_UPLOAD_BYTES,
  megabytes,
} from './.tmp/entitlements.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

const f = PLANS.free;
const o = PLANS.one;
const tiered = (c) => TIERED_COUNTERS.includes(c);
const shared = COUNTERS.filter((c) => !tiered(c));
const MONTHLY = ['chats', 'maps', 'nodes', 'artifacts', 'documents'];
/** What a note at a shared ceiling must never say: an offer of Socria One, which stops in the same place. */
const SELLS_ONE = /Socria One (gives|opens|lets|lifts|grounds|reads|keeps)/;

console.log('=== the axis: what differs is the trial and the features, not quality ===');
{
  // The claim the whole reshaping rests on. If this fails, the trial has
  // started clipping a conversation and the pitch is a lie.
  for (const c of shared) {
    ok(`${c} is identical on both plans`, f.counters[c] === o.counters[c],
      `free=${f.counters[c]} one=${o.counters[c]}`);
  }
  ok('the map grows as far on both', f.mapNodes === o.mapNodes && f.mapNodes === null);
  ok('every lens on both', f.lenses === o.lenses && f.lenses === null);
  ok('every depth on both', f.allDepths === true && o.allDepths === true);
  ok('Draft Space on both', f.draftSpace === true && o.draftSpace === true);
  ok('a thread carries its own memory the whole way on both',
    f.memoryTurns === null && o.memoryTurns === null);
}

console.log('\n=== ...and exactly these rows differ: the features, memory, document size — no count ===');
{
  // The old monthly allowances, lifted to Socria One's fair-use ceilings: the trial's limit is tokens.
  ok('conversations: Socria One’s fair-use ceiling, 400 a month, on the trial too', f.counters.chats === 400 && o.counters.chats === 400 && COUNTER_SCOPE.chats === 'month');
  ok('Logic Maps, their nodes, artifacts and documents: not counted on the trial', ['maps', 'nodes', 'artifacts', 'documents'].every((c) => f.counters[c] === null), JSON.stringify(f.counters));
  ok('  nor on Socria One', ['maps', 'nodes', 'artifacts', 'documents'].every((c) => o.counters[c] === null));
  ok('  and no size for each map either', f.mapNodes === null && o.mapNodes === null);
  ok('no daily count of messages on either plan', f.counters.messages === null && o.counters.messages === null);
  ok('no Core counters any more', !COUNTERS.includes('core-chats') && !COUNTERS.includes('core-messages'));
  ok('no counter is tiered: the trial is held by tokens (lib/trial.ts), not by a count', TIERED_COUNTERS.length === 0, TIERED_COUNTERS.join());
  ok('TIERED_COUNTERS is the truth, not a comment',
    COUNTERS.filter((c) => f.counters[c] !== o.counters[c]).join() === TIERED_COUNTERS.join());
  ok('a conversation, a map, an artifact and a document are each charged once (where counted)', UNIT_COUNTERS.join() === 'chats,maps,artifacts,documents');
  ok('Voice, sharing and the experiments are Socria One’s, and only Socria One’s', FEATURES.join() === 'voice,share,experiments' && FEATURES.every((x) => !hasFeature('free', x) && hasFeature('one', x)), FEATURES.join());
  ok('memory carried between conversations is the other half',
    (f.memoryEntries ?? 0) > 0 && (o.memoryEntries ?? 0) > (f.memoryEntries ?? 0));
  // and the size of a document: the platform's request limit on the trial,
  // more on One, which uploads around the server through private storage
  ok('trial documents are capped at what a request can carry (4 MB)', f.uploadBytes === DIRECT_UPLOAD_BYTES && DIRECT_UPLOAD_BYTES === 4 * 1024 * 1024);
  ok('Socria One reads documents up to 30 MB', o.uploadBytes === 30 * 1024 * 1024);
  ok('  said in megabytes', megabytes(o.uploadBytes) === '30 MB' && megabytes(f.uploadBytes) === '4 MB');
}

console.log('\n=== the comparison and the sentences are written from the table and the trial ===');
{
  const rows = comparisonRows();
  const row = (id) => rows.find((r) => r.id === id) ?? {};
  ok('the comparison has the seven rows the trial and Socria One differ on', rows.map((r) => r.id).join() === 'ai,after,voice,share,experiments,themes,files', rows.map((r) => r.id).join());
  ok('  the trial: seven days, 10,000 tokens a day; Socria One: unlimited, under fair use', row('ai').free === '7 days · 10,000 tokens a day' && row('ai').one === 'Unlimited (fair use)', JSON.stringify(row('ai')));
  ok('  after the trial, everything made stays open — nothing is taken away', row('after').free === 'Everything you made stays open' && row('after').one === 'Keep going', JSON.stringify(row('after')));
  ok('  Voice, sharing, the experiments and the two themes: Socria One’s', ['voice', 'share', 'experiments', 'themes'].every((id) => row(id).free === 'Not included' && row(id).one === 'Included'), JSON.stringify(rows.slice(2, 6)));
  ok('  the largest file, from the table', row('files').free === '4 MB' && row('files').one === '30 MB', JSON.stringify(row('files')));
  ok('  no row sells a count the trial does not have', !rows.some((r) => /a month/.test(r.free)), JSON.stringify(rows.map((r) => r.free)));
  ok('the trial in one sentence', freePlanSentence() === 'a 7-day trial: 10,000 tokens a day, up to 70,000 in all', freePlanSentence());
  ok('Socria One in one sentence', onePlanSentence() === 'Unlimited conversations, Logic Maps and artifacts after the trial, with Socria Voice, chat sharing, the experiments and the Celestial and Socria One themes', onePlanSentence());
  ok('  selling only what the trial does not have: no depth, lens, Draft Space or map size', !/depth|lens|Draft|nodes/i.test(onePlanSentence()), onePlanSentence());
  ok('an allowance, as it is said: uncounted is unlimited, on both plans', allowanceLabel('maps') === 'Unlimited Logic Maps' && allowanceLabel('documents') === 'Unlimited documents' && allowanceLabel('nodes', 'one') === 'Unlimited Logic Map nodes', `${allowanceLabel('maps')} | ${allowanceLabel('documents')} | ${allowanceLabel('nodes', 'one')}`);
  ok('  the fair-use ceiling on conversations is said the same on both', allowanceLabel('chats') === '400 conversations a month' && allowanceLabel('chats', 'one') === allowanceLabel('chats'), `${allowanceLabel('chats')} | ${allowanceLabel('chats', 'one')}`);
  ok('the features say they are Socria One’s', /Socria Voice is part of Socria One/.test(FEATURE_NOTE.voice) && /part of Socria One/.test(FEATURE_NOTE.share) && /part of Socria One/.test(FEATURE_NOTE.experiments));
}

console.log('\n=== no plan is a smaller product than the other ===');
{
  const atLeast = (a, b) => b === null || (a !== null && a >= b);
  ok('every counter: One >= free', COUNTERS.every((c) => atLeast(o.counters[c], f.counters[c]) || o.counters[c] === null));
  ok('One never has a ceiling free lacks',
    COUNTERS.every((c) => !(f.counters[c] === null && o.counters[c] !== null)));
  ok('One never carries less memory', (o.memoryEntries ?? Infinity) >= (f.memoryEntries ?? Infinity));
  ok('One never takes smaller files', o.uploadBytes >= f.uploadBytes);
}

console.log('\n=== the month, counted: the old numbers stop nobody ===');
{
  ok('a trial account is not stopped at the old numbers: a 4th conversation, a 3rd map, an 11th node, a 3rd artifact, a 2nd document',
    !isSpent('free', 'chats', 3) && !isSpent('free', 'maps', 2) && !isSpent('free', 'nodes', 10) && !isSpent('free', 'artifacts', 2) && !isSpent('free', 'documents', 1));
  ok('  nor far past them', ['maps', 'nodes', 'artifacts', 'documents'].every((c) => !isSpent('free', c, 10_000) && remaining('free', c, 10_000) === null));
  ok('the 1st to the 400th conversation allowed, the 401st is the fair-use ceiling — on the trial',
    !isSpent('free', 'chats', 0) && !isSpent('free', 'chats', 399) && isSpent('free', 'chats', 400));
  ok('  and at the same place on Socria One', !isSpent('one', 'chats', 399) && isSpent('one', 'chats', 400));
  ok('400 left at zero used', remaining('free', 'chats', 0) === 400);
  ok('0 left at four hundred used', remaining('free', 'chats', 400) === 0);
  ok('never negative', remaining('free', 'chats', 999) === 0);
  ok('limitOf agrees with the table', limitOf('free', 'chats') === f.counters.chats && limitOf('free', 'maps') === null);
  ok('limitsFor returns the row', limitsFor('one') === o && limitsFor('free') === f);
  // Said ahead of time only for a boundary the product sells past — and there is none left: every
  // count is a fair-use ceiling both plans share, and nobody is warned towards a guard.
  ok('near the end is never said: there is no allowance left to count down', COUNTERS.every((c) => [0, 1, 2, 8, 9, 10, 59, 119, 398, 399].every((u) => !nearLimit('free', c, u))));
  ok('  and never on Socria One', COUNTERS.every((c) => !nearLimit('one', c, 399)));
}

console.log('\n=== the fair-use ceilings are guards, not boundaries ===');
{
  // Nobody working seriously meets these, on either plan. A number small
  // enough to be met in an afternoon is not fair use, it is a clip wearing
  // the word — so the bar is deliberately here and deliberately high.
  for (const c of shared) {
    const cap = f.counters[c];
    ok(`${c}: uncapped or far out of reach`, cap === null || cap >= 50, String(cap));
    ok(`${c}: not spent at 20 uses on either plan`,
      !isSpent('free', c, 20) && !isSpent('one', c, 20));
  }
  // The per-conversation ceilings, at the table's numbers, refusing on BOTH plans.
  for (const [c, n] of [['research', 120], ['images', 60], ['files', 60]]) {
    ok(`${c}: ${n} a conversation, on both plans`, f.counters[c] === n && o.counters[c] === n && COUNTER_SCOPE[c] === 'chat', `free=${f.counters[c]} one=${o.counters[c]}`);
    ok(`  ${c}: the ${n}th allowed and the ${n + 1}th refused — on the trial and on Socria One`,
      !isSpent('free', c, n - 1) && isSpent('free', c, n) && !isSpent('one', c, n - 1) && isSpent('one', c, n));
  }
  ok('uncapped reads as null in remaining()', remaining('one', 'explore', 999) === null && remaining('free', 'explore', 999) === null);
}

console.log('\n=== scopes ===');
{
  ok('the old allowances still reset monthly where counted', MONTHLY.every((c) => COUNTER_SCOPE[c] === 'month'));
  ok('the messages, kept for the record, reset daily', COUNTER_SCOPE.messages === 'day');
  ok('everything else lives with one conversation',
    COUNTERS.filter((c) => !MONTHLY.includes(c) && c !== 'messages').every((c) => COUNTER_SCOPE[c] === 'chat'));
}

console.log('\n=== the boundary is said calmly, and never sold where there is nothing to sell ===');
{
  for (const c of COUNTERS) {
    const note = boundaryNote(c);
    ok(`${c}: two sentences`, note.length > 40 && /\.\s/.test(note), note);
    ok(`${c}: no pressure words`, !/upgrade now|hurry|only|!|limited time/i.test(note), note);
  }

  // THE ONE THAT MATTERS. A shared ceiling must never be dressed as a reason
  // to pay: offering somebody a thing they already hold, at the exact moment
  // they are annoyed, is the most expensive sentence in the product. Every
  // count is shared now, so no note — on either plan — offers Socria One.
  for (const c of COUNTERS) {
    const note = boundaryNote(c);
    const oneNote = boundaryNote(c, 'one');
    ok(`${c}: does not offer One as the fix, on the trial`, !note.includes(LIMIT_OFFER) && !SELLS_ONE.test(note), note);
    ok(`${c}: nor on Socria One`, !oneNote.includes(LIMIT_OFFER) && !SELLS_ONE.test(oneNote), oneNote);
    ok(`${c}: says the ceiling is shared`, /same place/.test(note), note);
  }
  // Nothing made is hidden or taken at any limit: each of the old allowances says what stays.
  for (const c of MONTHLY) {
    const note = boundaryNote(c);
    ok(`${c}: says what was made stays`, /(stays|stay yours|is kept|keep every)/.test(note), note);
  }
  ok('Socria One at its own ceiling on conversations: what it has stays open, and nothing to buy', /stay open/.test(boundaryNote('chats', 'one')) && !/Socria One/.test(boundaryNote('chats', 'one')), boundaryNote('chats', 'one'));

  // And the count itself is read from the table rather than written twice.
  ok('the month’s copy matches the table', new RegExp(`\\b${f.counters.chats}\\b[^.]*conversations`).test(boundaryNote('chats')), boundaryNote('chats'));
}

console.log('\n  the month:', boundaryNote('chats'));
console.log('  a ceiling:', boundaryNote('research'));
console.log('\n=== a line of thinking costs one, however many times it is sent ===');
{
  // The regression this block exists for: `chats` is MONTHLY, so its scope is
  // the month and the conversation id is discarded. The route only asked "is
  // this a first user turn?" — a property of the REQUEST — so a first message
  // that failed and was retried charged again, and two sends of one
  // conversation could spend a whole free month. Conversations are still
  // counted, toward the fair-use ceiling both plans share, so the marker still
  // matters: a conversation charged twice would meet the ceiling at half of it.
  //
  // The counter itself is pure and cannot see sessions; what is asserted here
  // is the arithmetic the fix depends on, so the shape of the ceiling is
  // pinned even though the de-duplication lives in lib/usage.ts.
  const cap = PLANS.free.counters.chats;
  ok('four hundred conversations a month, under fair use', cap === 400);
  ok('one conversation leaves 399', remaining('free', 'chats', 1) === 399);
  ok('four hundred conversations leave none', remaining('free', 'chats', 400) === 0);
  ok('and the 401st is the ceiling', isSpent('free', 'chats', 400));

  // The number that would be wrong on screen: charged twice for each conversation.
  ok('being charged twice for each would read as spent after two hundred', remaining('free', 'chats', 400) === 0 && !isSpent('free', 'chats', 200));

  // Core and Logos share the month: one count of conversations, wherever they begin.
  ok('one count of conversations, Core’s included', !COUNTERS.includes('core-chats'));
  ok('a member is not stopped short of the ceiling', !isSpent('one', 'chats', 50) && !isSpent('one', 'chats', 399));
}

console.log('\n=== a conversation that never happened is not one ===');
{
  // Tobias Lasco, by email: "All my chats errored before giving any responses
  // … after two attempts, the app thinks I've used all my free tier chats,
  // despite none succeeding."
  //
  // The count was spent BEFORE the model ran, so a turn that errored before
  // saying a word still cost a line of thinking. The allowance is still
  // CHECKED up front — somebody genuinely at the ceiling is refused without a
  // model call — but the charge now waits until the model has accepted the
  // turn and handed back a stream.
  //
  // The route owns that ordering; what is pinned here is the arithmetic it
  // depends on, so the ceiling's shape cannot drift underneath it.
  ok('a failed first turn should leave the month untouched',
    remaining('free', 'chats', 0) === 400 && !isSpent('free', 'chats', 0));
  ok('...and a second failure too', !isSpent('free', 'chats', 0));
  ok('one answered conversation costs exactly one',
    remaining('free', 'chats', 1) === 399);
  ok('four hundred answered conversations reach the ceiling',
    isSpent('free', 'chats', 400) && remaining('free', 'chats', 400) === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
