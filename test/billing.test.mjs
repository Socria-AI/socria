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
import { billingError, billingLine } from './.tmp/billing-message.mjs';
import {
  stripeFailure, priceIdProblem, isMissingResource, isMissingCustomer,
} from './.tmp/stripe-diagnosis.mjs';

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

console.log('\n=== a failure says what it was ===');
{
  // Nothing key-shaped leaves the process, whatever produced the string.
  const leak = stripeFailure({
    type: 'StripeInvalidRequestError',
    code: 'resource_missing',
    message: "No such price: 'price_1Abc' with key sk_live_51HxyzABCDEF",
  });
  ok('the code comes through', leak.code === 'resource_missing');
  ok('the price id comes through', /price_1Abc/.test(leak.detail));
  ok('the secret key does not', !/sk_live_51HxyzABCDEF/.test(leak.detail));
  ok('and is visibly redacted rather than dropped', /sk_\*\*\*/.test(leak.detail), leak.detail);
  for (const p of ['sk_live_x1', 'rk_test_y2', 'whsec_z3', 'pk_live_w4']) {
    const r = stripeFailure({ type: 'StripeInvalidRequestError', message: `saw ${p} here` });
    ok(`${p.slice(0, 6)} is redacted`, !r.detail.includes(p), r.detail);
  }

  // Only the classes whose text a person can act on are repeated back.
  ok('a network failure says nothing quotable',
    stripeFailure({ type: 'StripeConnectionError', message: 'socket hang up' }).detail === null);
  ok('but still carries a code',
    stripeFailure({ type: 'StripeConnectionError', message: 'x' }).code === 'StripeConnectionError');
  ok('an auth error IS quotable',
    stripeFailure({ type: 'StripeAuthenticationError', message: 'Invalid API Key' }).detail !== null);
  ok('something that is not an error at all', stripeFailure(null).code === 'unknown');
  ok('and does not invent a detail', stripeFailure(null).detail === null);
  ok('a bare string', stripeFailure('boom').code === 'unknown');
  ok('the detail is capped', (stripeFailure({
    type: 'StripeInvalidRequestError',
    message: 'x'.repeat(5000),
  }).detail ?? '').length <= 200);
}

console.log('\n=== the two price-id mistakes are named before Stripe is called ===');
{
  const withEnv = (env, fn) => {
    const before = { ...process.env };
    Object.assign(process.env, env);
    try { return fn(); } finally {
      for (const k of Object.keys(env)) delete process.env[k];
      Object.assign(process.env, before);
    }
  };

  ok('unset is named', /not set/i.test(
    withEnv({ STRIPE_PRICE_SOCRIA_ONE: '' }, priceIdProblem) ?? ''));
  // The commonest setup mistake: copying the product id off the dashboard.
  const prod = withEnv({ STRIPE_PRICE_SOCRIA_ONE: 'prod_ABC' }, priceIdProblem);
  ok('a product id is named as one', /product id/i.test(prod ?? ''), prod);
  ok('and says where to find the price', /price_/.test(prod ?? ''));
  ok('something else entirely is named', /does not look like/i.test(
    withEnv({ STRIPE_PRICE_SOCRIA_ONE: 'sub_123' }, priceIdProblem) ?? ''));
  ok('a real price id passes',
    withEnv({ STRIPE_PRICE_SOCRIA_ONE: 'price_1AbcDEF', STRIPE_SECRET_KEY: 'sk_live_1' }, priceIdProblem) === null);

  // The other one: it worked in testing and fails in production.
  const mixed = withEnv(
    { STRIPE_PRICE_SOCRIA_ONE: 'price_1AbcDEF', STRIPE_SECRET_KEY: 'sk_test_1', VERCEL_ENV: 'production' },
    priceIdProblem
  );
  ok('a test key on production is named', /TEST key/.test(mixed ?? ''), mixed);
  ok('but a test key on preview is fine', withEnv(
    { STRIPE_PRICE_SOCRIA_ONE: 'price_1AbcDEF', STRIPE_SECRET_KEY: 'sk_test_1', VERCEL_ENV: 'preview' },
    priceIdProblem
  ) === null);
}

console.log('\n=== the reason reaches the person, not just the log ===');
{
  const full = billingError({ error: 'Could not start checkout.', code: 'resource_missing', detail: 'No such price.' });
  ok('the sentence is the server’s', full.message === 'Could not start checkout.');
  ok('the detail survives', full.detail === 'No such price.');
  ok('and the line carries it', billingLine(full).includes('No such price.'));

  // A code with no detail is still worth showing: it is searchable, and
  // "could not start checkout" on its own is not.
  const coded = billingError({ error: 'Could not start checkout.', code: 'api_key_expired' });
  ok('a bare code is shown in brackets', billingLine(coded) === 'Could not start checkout. (api_key_expired)');

  const bare = billingError({ error: 'Could not start checkout.' });
  ok('and nothing is invented when there is nothing', billingLine(bare) === 'Could not start checkout.');

  // The surfaces each keep their own fallback for a response that never came.
  const FALLBACK = 'Could not reach checkout. Try again.';
  ok('a dead response falls back', billingError(null).message === FALLBACK);
  ok('a caller’s own fallback wins', billingError(null, 'Could not open billing. Try again.').message
    === 'Could not open billing. Try again.');
  ok('junk does not become a message', billingError({ error: 42 }).message === FALLBACK);
  ok('whitespace is not a message', billingError({ error: '   ' }).message === FALLBACK);
}

console.log('\n=== a dead customer id is recognised, not passed on ===');
{
  // The real one, as Stripe sent it: a customer created under a test key,
  // handed to a live one. Same shape as a customer deleted in the dashboard.
  const real = {
    type: 'StripeInvalidRequestError',
    code: 'resource_missing',
    param: 'customer',
    raw: { code: 'resource_missing', message: "No such customer: 'cus_V9R2dCzyrn4TZr'", param: 'customer' },
    message: "No such customer: 'cus_V9R2dCzyrn4TZr'",
  };
  ok('it is a missing resource', isMissingResource(real) === true);
  ok('and specifically a missing customer', isMissingCustomer(real) === true);

  // Recognised by the message alone, for a client that does not set `code`.
  ok('by message alone', isMissingResource({ message: "No such customer: 'cus_x'" }) === true);
  ok('case does not matter', isMissingResource({ message: 'no such customer: cus_x' }) === true);
  ok('leading space does not matter', isMissingResource({ message: '  No such price: p' }) === true);

  // A MISSING PRICE is a missing resource but not a missing customer — the
  // retry path must not fire for it, or a misconfigured price would quietly
  // create a spare customer on every attempt.
  const price = {
    code: 'resource_missing',
    param: 'line_items[0][price]',
    raw: { code: 'resource_missing', message: "No such price: 'price_x'", param: 'line_items[0][price]' },
  };
  ok('a missing price is a missing resource', isMissingResource(price) === true);
  ok('but is NOT treated as a missing customer', isMissingCustomer(price) === false);

  // Everything else must not look like one.
  ok('a card decline is not', isMissingResource({ code: 'card_declined', message: 'Your card was declined.' }) === false);
  ok('a rate limit is not', isMissingResource({ code: 'rate_limit', message: 'Too many requests' }) === false);
  ok('a network error is not', isMissingResource({ type: 'StripeConnectionError', message: 'socket hang up' }) === false);
  ok('nothing is not', isMissingResource(null) === false);
  ok('a bare string is not', isMissingResource('No such customer') === false);
  ok('prose that merely mentions one is not',
    isMissingResource({ message: 'We found no such customer problems today' }) === false);
  ok('and a missing customer needs a missing resource first',
    isMissingCustomer({ code: 'card_declined', message: 'customer declined' }) === false);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
