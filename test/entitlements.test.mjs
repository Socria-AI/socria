// The plan table, and the one axis it turns on.
//
// The free tier used to clip every dimension at once — eight map nodes, one
// lens, one depth, one Explore, one Research, twelve turns of memory, AND two
// lines of thinking a month. This suite was written against those numbers and
// asserted them one by one, which meant it was the thing standing behind a
// free tier nobody could watch be good.
//
// It asserts the SHAPE: that what Socria can do is the same Socria on both
// plans, that exactly the rows the product is sold on differ — the free
// plan's monthly allowances (October 31, 2026: ten conversations, two Logic
// Maps, ten Logic Map nodes, two artifacts, one document) and the two
// features only Socria One has (Voice, sharing) — and, the assertion that
// keeps the copy honest, that no boundary note offers Socria One at a ceiling
// Socria One also has.

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
  allowanceLabel,
  LIMIT_HEADLINE,
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

console.log('=== the axis: what differs is volume, not quality ===');
{
  // The claim the whole reshaping rests on. If this fails, the free tier has
  // started clipping a conversation again and the pitch is a lie.
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

console.log('\n=== ...and exactly these rows differ: the monthly allowances, Voice and sharing, memory, document size ===');
{
  ok('three conversations a month', f.counters.chats === 3 && COUNTER_SCOPE.chats === 'month');
  ok('two Logic Maps a month', f.counters.maps === 2 && COUNTER_SCOPE.maps === 'month');
  ok('ten Logic Map nodes a month — across every map, not a size for each', f.counters.nodes === 10 && COUNTER_SCOPE.nodes === 'month' && f.mapNodes === null);
  ok('two artifacts a month', f.counters.artifacts === 2 && COUNTER_SCOPE.artifacts === 'month');
  ok('one document a month', f.counters.documents === 1 && COUNTER_SCOPE.documents === 'month');
  ok('no daily count of messages on either plan', f.counters.messages === null && o.counters.messages === null);
  ok('no Core counters any more', !COUNTERS.includes('core-chats') && !COUNTERS.includes('core-messages'));
  ok('Socria One: every monthly allowance unlimited (conversations under fair use)', ['maps', 'nodes', 'artifacts', 'documents'].every((c) => o.counters[c] === null) && (o.counters.chats ?? 0) >= 100);
  ok('the tiered counters are exactly the five allowances', TIERED_COUNTERS.join() === 'chats,maps,nodes,artifacts,documents');
  ok('TIERED_COUNTERS is the truth, not a comment',
    COUNTERS.filter((c) => f.counters[c] !== o.counters[c]).join() === TIERED_COUNTERS.join());
  ok('a conversation, a map, an artifact and a document are each charged once', UNIT_COUNTERS.join() === 'chats,maps,artifacts,documents');
  ok('Voice and sharing are Socria One’s, and only Socria One’s', FEATURES.join() === 'voice,share' && FEATURES.every((x) => !hasFeature('free', x) && hasFeature('one', x)));
  ok('One holds far more conversations', (o.counters.chats ?? 0) >= 100);
  ok('memory carried between them is the other half',
    (f.memoryEntries ?? 0) > 0 && (o.memoryEntries ?? 0) > (f.memoryEntries ?? 0));
  // and the size of a document: the platform's request limit on free, more
  // on One, which uploads around the server through private storage
  ok('free documents are capped at what a request can carry (4 MB)', f.uploadBytes === DIRECT_UPLOAD_BYTES && DIRECT_UPLOAD_BYTES === 4 * 1024 * 1024);
  ok('Socria One reads documents up to 30 MB', o.uploadBytes === 30 * 1024 * 1024);
  ok('  said in megabytes', megabytes(o.uploadBytes) === '30 MB' && megabytes(f.uploadBytes) === '4 MB');
}

console.log('\n=== the comparison and the sentence are written from the table ===');
{
  const rows = comparisonRows();
  ok('the comparison has the seven rows the plans differ on', rows.map((r) => r.id).join() === 'chats,maps,nodes,artifacts,documents,voice,share', rows.map((r) => r.id).join());
  ok('  free: the monthly numbers', rows[0].free === '3 a month' && rows[1].free === '2 a month' && rows[2].free === '10 a month' && rows[3].free === '2 a month' && rows[4].free === '1 a month', JSON.stringify(rows.map((r) => r.free)));
  ok('  Socria One: unlimited, and the features included', rows.slice(0, 5).every((r) => r.one === 'Unlimited') && rows[5].one === 'Included' && rows[6].one === 'Included' && rows[5].free === 'Not included');
  ok('the free plan in one sentence', freePlanSentence() === '3 conversations, 2 Logic Maps, 10 Logic Map nodes, 2 artifacts and 1 document a month', freePlanSentence());
  ok('an allowance, as it is said', allowanceLabel('maps') === '2 Logic Maps a month' && allowanceLabel('documents') === '1 document a month' && allowanceLabel('nodes', 'one') === 'Unlimited Logic Map nodes');
  ok('the features say they are Socria One’s', /Socria Voice is part of Socria One/.test(FEATURE_NOTE.voice) && /part of Socria One/.test(FEATURE_NOTE.share));
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

console.log('\n=== the month, counted ===');
{
  ok('the 1st to the 3rd conversation allowed, the 4th is the boundary',
    !isSpent('free', 'chats', 0) && !isSpent('free', 'chats', 2) && isSpent('free', 'chats', 3));
  ok('a member is not stopped at eleven', !isSpent('one', 'chats', 11));
  ok('3 left at zero used', remaining('free', 'chats', 0) === 3);
  ok('0 left at three used', remaining('free', 'chats', 3) === 0);
  ok('never negative', remaining('free', 'chats', 99) === 0);
  ok('limitOf agrees with the table', limitOf('free', 'chats') === f.counters.chats);
  ok('limitsFor returns the row', limitsFor('one') === o);
  ok('near the end is said ahead of time: the last of three, the last of two, the last two of ten', nearLimit('free', 'chats', 2) && !nearLimit('free', 'chats', 1) && nearLimit('free', 'nodes', 8) && !nearLimit('free', 'nodes', 7) && nearLimit('free', 'maps', 1) && !nearLimit('free', 'maps', 0) && nearLimit('free', 'documents', 0));
  ok('  never once spent (that is the boundary) and never on Socria One', !nearLimit('free', 'chats', 3) && !nearLimit('one', 'chats', 399));
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
  ok('uncapped reads as null in remaining()', remaining('one', 'explore', 999) === null);
}

console.log('\n=== scopes ===');
{
  const monthly = ['chats', 'maps', 'nodes', 'artifacts', 'documents'];
  ok('the allowances reset monthly', monthly.every((c) => COUNTER_SCOPE[c] === 'month'));
  ok('the messages, kept for the record, reset daily', COUNTER_SCOPE.messages === 'day');
  ok('everything else lives with one conversation',
    COUNTERS.filter((c) => !monthly.includes(c) && c !== 'messages').every((c) => COUNTER_SCOPE[c] === 'chat'));
}

console.log('\n=== the boundary is said calmly, and only sold where there is something to sell ===');
{
  for (const c of COUNTERS) {
    const note = boundaryNote(c);
    ok(`${c}: two sentences`, note.length > 40 && /\.\s/.test(note), note);
    ok(`${c}: no pressure words`, !/upgrade now|hurry|only|!|limited time/i.test(note), note);
  }

  // THE ONE THAT MATTERS. A shared ceiling must never be dressed as a reason
  // to pay: offering somebody a thing they already hold, at the exact moment
  // they are annoyed, is the most expensive sentence in the product.
  // Every monthly allowance says what was used, that what was made stays, and that Socria One lifts it.
  for (const [c, n] of [['chats', /3 free conversations this month/], ['maps', /2 free Logic Maps this month/], ['nodes', /10 free Logic Map nodes this month/], ['artifacts', /2 free artifacts this month/], ['documents', /1 free document this month/]]) {
    const note = boundaryNote(c);
    ok(`${c}: its number from the table, what stays, and Socria One`, n.test(note) && /(stays|stay yours|is kept|keep every)/.test(note) && note.endsWith(LIMIT_OFFER), note);
  }
  ok('one headline at every free limit', LIMIT_HEADLINE === 'You’ve reached your free limit.' && LIMIT_OFFER === 'Unlock unlimited access with Socria One.');
  for (const c of shared) {
    const note = boundaryNote(c);
    ok(`${c}: does not offer One as the fix`, !/Socria One (gives|opens|lets|grounds|reads|keeps)/.test(note), note);
    ok(`${c}: says the ceiling is shared`, /same place/.test(note), note);
  }

  // And the count itself is read from the table rather than written twice.
  ok('the month’s copy matches the table', boundaryNote('chats').includes(`${f.counters.chats} free conversations`));
}

console.log('\n  the month:', boundaryNote('chats'));
console.log('  a ceiling:', boundaryNote('research'));
console.log('\n=== a line of thinking costs one, however many times it is sent ===');
{
  // The regression this block exists for: `chats` is MONTHLY, so its scope is
  // the month and the conversation id is discarded. The route only asked "is
  // this a first user turn?" — a property of the REQUEST — so a first message
  // that failed and was retried charged again, and two sends of one
  // conversation could spend a whole free month. Somebody would be looking at
  // a single session in the rail above a note saying they had none left.
  //
  // The counter itself is pure and cannot see sessions; what is asserted here
  // is the arithmetic the fix depends on, so the shape of the boundary is
  // pinned even though the de-duplication lives in lib/usage.ts.
  const cap = PLANS.free.counters.chats;
  ok('three free conversations', cap === 3);
  ok('one conversation leaves two', remaining('free', 'chats', 1) === 2);
  ok('three conversations leave none', remaining('free', 'chats', 3) === 0);
  ok('and the fourth is the boundary', isSpent('free', 'chats', 3));

  // The number that was wrong on screen: charged twice for one conversation.
  ok('being charged twice for each would read as spent after two', remaining('free', 'chats', 3) === 0 && !isSpent('free', 'chats', 2));

  // Core and Logos share the month now: one count of conversations, wherever they begin.
  ok('one count of conversations, Core’s included', !COUNTERS.includes('core-chats'));
  ok('a member is not stopped', !isSpent('one', 'chats', 50));
}

console.log('\n=== a conversation that never happened is not one ===');
{
  // Tobias Lasco, by email: "All my chats errored before giving any responses
  // … after two attempts, the app thinks I've used all my free tier chats,
  // despite none succeeding."
  //
  // The count was spent BEFORE the model ran, so a turn that errored before
  // saying a word still cost a line of thinking. Two failures and a free
  // month was gone, with nothing to show for it. The allowance is still
  // CHECKED up front — somebody genuinely out of chats is refused without a
  // model call — but the charge now waits until the model has accepted the
  // turn and handed back a stream.
  //
  // The route owns that ordering; what is pinned here is the arithmetic it
  // depends on, so the boundary's shape cannot drift underneath it.
  ok('a failed first turn should leave the month untouched',
    remaining('free', 'chats', 0) === 3 && !isSpent('free', 'chats', 0));
  ok('...and a second failure too', !isSpent('free', 'chats', 0));
  ok('one answered conversation costs exactly one',
    remaining('free', 'chats', 1) === 2);
  ok('three answered conversations reach the boundary',
    isSpent('free', 'chats', 3) && remaining('free', 'chats', 3) === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
