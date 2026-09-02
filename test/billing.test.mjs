// Who is entitled, and what happens when the store is not there.
//
// The bug this suite exists to prevent shipped: recording a customer before
// checkout threw when the subscriptions table was missing, so every attempt
// to subscribe answered "Could not start checkout" — after creating a Stripe
// customer, so each try also left one behind. Bookkeeping was refusing
// people's money.
//
// The rules below are the two halves of that. A write that is only
// bookkeeping must never be able to fail the thing it is recording; and a
// person who has paid must be entitled even when the projection of Stripe we
// normally read cannot be reached at all.

import { entitles, isCompCustomer } from './.tmp/subscriptions.mjs';
import { entitledBy, LIVE_STATUSES } from './.tmp/entitlement-rule.mjs';

// The account mirror's own check, which is `entitledBy` applied to the shape
// Clerk holds. Reproduced here rather than imported, because the module it
// lives in pulls in Clerk — and the point of the assertions below is that the
// two records cannot drift apart, which is now true by construction.
const mirrorEntitles = (m) => (m ? entitledBy(m.status, m.periodEnd) : false);

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

const SEC = 1000;
const soon = Math.floor((Date.now() + 30 * 24 * 3600 * SEC) / 1000);
const past = Math.floor((Date.now() - 24 * 3600 * SEC) / 1000);

console.log('=== the account mirror agrees with the table it backs up ===');
{
  // Every status the table treats as live, the mirror must treat as live —
  // they are two records of one fact, and a disagreement between them is a
  // person whose entitlement depends on which one happened to be readable.
  for (const status of ['active', 'trialing', 'past_due', 'comp']) {
    const row = entitles({ status, currentPeriodEnd: null });
    const mir = mirrorEntitles({ status, periodEnd: null });
    ok(`${status}: the table entitles`, row === true);
    ok(`${status}: and so does the mirror`, mir === row, `table ${row}, mirror ${mir}`);
  }

  // And every status neither of them does.
  for (const status of ['canceled', 'incomplete', 'incomplete_expired', 'unpaid', '']) {
    const row = entitles({ status, currentPeriodEnd: null });
    const mir = mirrorEntitles({ status, periodEnd: null });
    ok(`${status}: the table refuses`, row === false);
    ok(`${status}: and so does the mirror`, mir === row, `table ${row}, mirror ${mir}`);
  }
}

console.log('\n=== a cancelled subscription is entitled until it is paid through ===');
{
  ok('the table honours the paid period', entitles({ status: 'canceled', currentPeriodEnd: soon }) === true);
  ok('and so does the mirror', mirrorEntitles({ status: 'canceled', periodEnd: soon }) === true);
  ok('a period that has passed does not', entitles({ status: 'canceled', currentPeriodEnd: past }) === false);
  ok('in the mirror either', mirrorEntitles({ status: 'canceled', periodEnd: past }) === false);
  // Both read Stripe's seconds, not milliseconds. Reading one as the other
  // would put every period end in 1970 and revoke everybody.
  ok('seconds, not milliseconds', mirrorEntitles({ status: 'canceled', periodEnd: soon * 1000 }) === true);
  ok('and a millisecond value read as seconds is far future, not past',
    mirrorEntitles({ status: 'canceled', periodEnd: Date.now() }) === true);
}

console.log('\n=== a cancellation revokes through the mirror too ===');
{
  // The mirror is a MIRROR: it tracks the subscription rather than outliving
  // it. If it were a permanent grant, cancelling would leave the person
  // entitled forever, which is the failure mode of writing entitlement to a
  // place nothing ever updates.
  ok('cancelled and out of period is not entitled',
    mirrorEntitles({ status: 'canceled', periodEnd: past }) === false);
  ok('nothing mirrored is not entitled', mirrorEntitles(null) === false);
  ok('undefined is not entitled', mirrorEntitles(undefined) === false);
  ok('junk is not entitled', mirrorEntitles({}) === false);
  ok('a non-string status is not entitled', mirrorEntitles({ status: 1, periodEnd: null }) === false);
  ok('a truthy but unknown status is not entitled',
    mirrorEntitles({ status: 'gestating', periodEnd: null }) === false);
}

console.log('\n=== a comp customer is not a Stripe customer ===');
{
  ok('the sentinel is recognised', isCompCustomer('comp_user_123') === true);
  ok('a real customer is not', isCompCustomer('cus_QaBcDeF') === false);
  ok('nothing is not', isCompCustomer(null) === false);
  ok('empty is not', isCompCustomer('') === false);
}

console.log('\n=== the table refuses an absent row ===');
{
  ok('no row, no entitlement', entitles(null) === false);
  ok('undefined, no entitlement', entitles(undefined) === false);
}

console.log('\n=== the rule is written once ===');
{
  // The whole reason entitlement-rule.ts exists. Both records now ask the
  // same function, so the two cannot disagree about any status at all —
  // including ones nobody has thought of yet.
  const statuses = [
    ...LIVE_STATUSES,
    'canceled', 'incomplete', 'incomplete_expired', 'unpaid', 'paused',
    'something_stripe_adds_in_2027', '', 'ACTIVE', 'Active',
  ];
  let agreed = 0;
  for (const status of statuses) {
    for (const end of [null, soon, past]) {
      const table = entitles({ status, currentPeriodEnd: end });
      const mirror = mirrorEntitles({ status, periodEnd: end });
      if (table !== mirror) ok(`${status}/${end}: disagreement`, false, `${table} vs ${mirror}`);
      else agreed++;
    }
  }
  ok(`all ${agreed} status/period combinations agree`, agreed === statuses.length * 3);

  // Case matters: Stripe's statuses are lowercase, and treating "ACTIVE" as
  // live would be accepting a status Stripe never sends.
  ok('the match is exact', entitledBy('ACTIVE', null) === false);
  ok('and past_due is deliberately live', LIVE_STATUSES.includes('past_due'));
  ok('as is our own comp', LIVE_STATUSES.includes('comp'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
