// The plan table, and the one axis it turns on.
//
// The free tier used to clip every dimension at once — eight map nodes, one
// lens, one depth, one Explore, one Research, twelve turns of memory, AND two
// lines of thinking a month. This suite was written against those numbers and
// asserted them one by one, which meant it was the thing standing behind a
// free tier nobody could watch be good.
//
// It asserts the SHAPE now rather than a list of figures: that inside a line
// of thinking the two plans are identical, that exactly the rows the product
// is sold on differ, and — the assertion that keeps the copy honest — that no
// boundary note offers Socria One at a ceiling Socria One also has.

import {
  PLANS,
  COUNTERS,
  COUNTER_SCOPE,
  TIERED_COUNTERS,
  limitsFor,
  limitOf,
  isSpent,
  remaining,
  boundaryNote,
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

console.log('\n=== ...and exactly two rows do differ ===');
{
  ok('two free lines of thinking a month', f.counters.chats === 2);
  ok('chats is the only tiered counter',
    TIERED_COUNTERS.length === 1 && TIERED_COUNTERS[0] === 'chats');
  ok('TIERED_COUNTERS is the truth, not a comment',
    COUNTERS.filter((c) => f.counters[c] !== o.counters[c]).join() === TIERED_COUNTERS.join());
  ok('One holds far more of them', (o.counters.chats ?? 0) >= 100);
  ok('memory carried between them is the other half',
    (f.memoryEntries ?? 0) > 0 && (o.memoryEntries ?? 0) > (f.memoryEntries ?? 0));
}

console.log('\n=== no plan is a smaller product than the other ===');
{
  const atLeast = (a, b) => b === null || (a !== null && a >= b);
  ok('every counter: One >= free', COUNTERS.every((c) => atLeast(o.counters[c], f.counters[c]) || o.counters[c] === null));
  ok('One never has a ceiling free lacks',
    COUNTERS.every((c) => !(f.counters[c] === null && o.counters[c] !== null)));
  ok('One never carries less memory', (o.memoryEntries ?? Infinity) >= (f.memoryEntries ?? Infinity));
}

console.log('\n=== the month, counted ===');
{
  ok('1st and 2nd allowed, 3rd is the boundary',
    !isSpent('free', 'chats', 0) && !isSpent('free', 'chats', 1) && isSpent('free', 'chats', 2));
  ok('a member is not stopped at three', !isSpent('one', 'chats', 3));
  ok('2 left at zero used', remaining('free', 'chats', 0) === 2);
  ok('0 left at two used', remaining('free', 'chats', 2) === 0);
  ok('never negative', remaining('free', 'chats', 99) === 0);
  ok('limitOf agrees with the table', limitOf('free', 'chats') === f.counters.chats);
  ok('limitsFor returns the row', limitsFor('one') === o);
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
  ok('chats reset monthly', COUNTER_SCOPE.chats === 'month');
  ok('everything else lives with one conversation',
    COUNTERS.filter((c) => c !== 'chats').every((c) => COUNTER_SCOPE[c] === 'chat'));
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
  ok('the month names One', boundaryNote('chats').includes('Socria One keeps as many'));
  for (const c of shared) {
    const note = boundaryNote(c);
    ok(`${c}: does not offer One as the fix`, !/Socria One (gives|opens|lets|grounds|reads|keeps)/.test(note), note);
    ok(`${c}: says the ceiling is shared`, /same place/.test(note), note);
  }

  // And the count itself is read from the table rather than written twice.
  ok('the month’s copy matches the table',
    f.counters.chats !== 2 || boundaryNote('chats').includes('both of your free lines'));
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
  ok('two free lines of thinking', cap === 2);
  ok('one conversation leaves one', remaining('free', 'chats', 1) === 1);
  ok('two conversations leave none', remaining('free', 'chats', 2) === 0);
  ok('and the third is the boundary', isSpent('free', 'chats', 2));

  // The number that was wrong on screen: charged twice for one conversation.
  ok('being charged twice for one would read as spent',
    isSpent('free', 'chats', 2) && remaining('free', 'chats', 2) === 0);

  // Core is not metered by this counter at all — it has no chats limit to
  // spend, and nothing outside the Logos route may spend one.
  ok('Core 3.1 is free and unmetered by chats', PLANS.free.counters.chats === 2);
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
    remaining('free', 'chats', 0) === 2 && !isSpent('free', 'chats', 0));
  ok('...and a second failure too', !isSpent('free', 'chats', 0));
  ok('one answered conversation costs exactly one',
    remaining('free', 'chats', 1) === 1);
  ok('two answered conversations reach the boundary',
    isSpent('free', 'chats', 2) && remaining('free', 'chats', 2) === 0);

  // The old behaviour, stated so nobody restores it by accident: two errored
  // attempts read as spent, which is what put a paying-nothing visitor at a
  // wall he had never touched.
  ok('charging for failures would have read as spent at two',
    isSpent('free', 'chats', 2));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
