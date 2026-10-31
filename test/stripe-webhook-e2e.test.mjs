// The Stripe webhook, end to end, through the real route.
//
// Stripe does not deliver events in order and retries a failed one for days,
// so an event is a notice that a subscription moved, never a statement of what
// it now is. What is proved here is what a person meets: what they paid for
// arrives; what ended stays ended, whatever arrives late; a subscription they
// no longer hold cannot end the one they do, or a complimentary month; Stripe
// being unreachable is a 500 that Stripe retries, never a guess; and a body
// that is not signed by us writes nothing.
//
// The route is bundled from app/api with the in-memory database, a Clerk that
// keeps the account mirror, and a Stripe whose own record (the latest state)
// can differ from what an event carries.
//
//   pat    subscribes; the ordinary path
//   quinn  ended; then a stale "active" arrives late
//   rosa   a delivery while Stripe is unreachable, then its retry
//   sam    cancelled an old subscription, holds a new one; the old one's late events
//   cora   complimentary, with a dead subscription behind it; then subscribes for real
//   uma    events for subscriptions Stripe no longer has

import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve as res } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, '.tmp', 'e2e-stripe-webhook');
const FAKE_DB = join(here, 'helpers', 'fake-supabase.mjs');
const FAKE_CLERK = join(here, 'helpers', 'fake-clerk.mjs');
const FAKE_STRIPE = join(here, 'helpers', 'fake-stripe.mjs');
const SHIM = join(here, 'helpers', 'server-only-shim.mjs');

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const swap = {
  name: 'swap',
  setup(b) {
    b.onResolve({ filter: /(^|\/)supabase$/ }, (a) => {
      const p = a.path.startsWith('@/') ? join(root, a.path.slice(2)) : res(a.resolveDir, a.path);
      if (p === join(root, 'lib', 'supabase')) return { path: pathToFileURL(FAKE_DB).href, external: true };
      return undefined;
    });
    b.onResolve({ filter: /^@clerk\/nextjs\/server$/ }, () => ({ path: pathToFileURL(FAKE_CLERK).href, external: true }));
    b.onResolve({ filter: /^stripe$/ }, () => ({ path: pathToFileURL(FAKE_STRIPE).href, external: true }));
    b.onResolve({ filter: /^server-only$/ }, () => ({ path: SHIM }));
    b.onResolve({ filter: /^next\/(server|headers)$/ }, (a) => ({ path: `${a.path}.js`, external: true }));
  },
};
await build({
  entryPoints: [join(root, 'app/api/stripe/webhook/route.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: join(OUT, 'webhook.mjs'),
  tsconfig: join(root, 'tsconfig.json'),
  plugins: [swap],
  external: ['next', 'next/*', 'undici', '@supabase/*', 'resend', '@vercel/functions', 'openai'],
  logLevel: 'error',
});

const quiet = (orig) => (...a) => {
  const first = typeof a[0] === 'string' ? a[0] : '';
  if (first.startsWith('stripe webhook') || first.startsWith('writeStripeMirror') || first.startsWith('[')) return;
  orig(...a);
};
console.error = quiet(console.error.bind(console));
console.warn = quiet(console.warn.bind(console));

process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
const { db } = await import(pathToFileURL(FAKE_DB).href);
const { NextRequest } = await import('next/server.js');
await build({ entryPoints: [join(root, 'lib/entitlement-rule.ts')], bundle: true, format: 'esm', platform: 'node', outfile: join(OUT, 'rule.mjs'), logLevel: 'error' });
const { entitledBy } = await import(pathToFileURL(join(OUT, 'rule.mjs')).href);

let pass = 0,
  fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));

const SECRET = 'whsec_test';
const DAY = 86_400;
const now = Math.floor(Date.now() / 1000);
let seq = 0;
const event = (type, object, extra = {}) => ({ id: `evt_${++seq}`, type, data: { object, ...extra } });
const sub = (id, user, customer, status, o = {}) => ({
  id,
  object: 'subscription',
  customer,
  status,
  cancel_at_period_end: !!o.cancelAtPeriodEnd,
  metadata: user ? { clerkUserId: user } : {},
  items: { data: [{ price: { id: 'price_one' }, current_period_end: o.periodEnd ?? now + 20 * DAY }] },
});
const send = async (ev, { sig = `sig:${SECRET}` } = {}) => {
  const { POST } = await import(pathToFileURL(join(OUT, 'webhook.mjs')).href);
  const headers = { 'content-type': 'application/json' };
  if (sig) headers['stripe-signature'] = sig;
  const r = await POST(new NextRequest('http://localhost/api/stripe/webhook', { method: 'POST', headers, body: JSON.stringify(ev) }));
  return { status: r.status, json: await r.json().catch(() => null) };
};
const row = (uid) => db.rows('socria_subscriptions').find((r) => r.user_id === uid) ?? null;
const rowEntitles = (uid) => {
  const r = row(uid);
  return !!r && entitledBy(r.status, r.current_period_end);
};
const mirror = (uid) => globalThis.__users[uid]?.privateMetadata?.socriaOneStripe ?? null;
const holds = (subs) => (globalThis.__stripe = { subs, down: false, calls: [] });

db.reset();
globalThis.__users = Object.fromEntries(['pat', 'quinn', 'rosa', 'sam', 'cora', 'uma'].map((u) => [u, { firstName: u, emails: [`${u}@example.com`] }]));

console.log('\na body that is not ours writes nothing');
{
  delete process.env.STRIPE_WEBHOOK_SECRET;
  holds({});
  ok('no signing secret configured: 503, and nothing is read', (await send(event('customer.subscription.created', sub('sub_x', 'pat', 'cus_pat', 'active')))).status === 503);
  process.env.STRIPE_WEBHOOK_SECRET = SECRET;
  ok('no signature: 400', (await send(event('customer.subscription.created', sub('sub_x', 'pat', 'cus_pat', 'active')), { sig: null })).status === 400);
  const forged = await send(event('customer.subscription.created', sub('sub_x', 'pat', 'cus_pat', 'active')), { sig: 'sig:somebody-else' });
  ok('a forged signature: 400', forged.status === 400);
  ok('  and nobody was given anything', row('pat') === null && mirror('pat') === null && globalThis.__stripe.calls.length === 0);
  const other = await send(event('invoice.paid', { id: 'in_1' }));
  ok('an event this route does not handle is acknowledged and left alone', other.status === 200 && other.json?.ignored === 'invoice.paid');
}

console.log('\nwhat was paid for arrives');
{
  const live = sub('sub_pat', 'pat', 'cus_pat', 'active');
  holds({ sub_pat: live });
  const r = await send(event('customer.subscription.created', live));
  ok('created: 200', r.status === 200);
  ok('  the table says active, with its price and period', row('pat')?.status === 'active' && row('pat')?.price_id === 'price_one' && row('pat')?.current_period_end === live.items.data[0].current_period_end);
  ok('  and so does the account', mirror('pat')?.status === 'active' && mirror('pat')?.periodEnd === live.items.data[0].current_period_end);
  ok('  read back from Stripe, not taken from the event', globalThis.__stripe.calls.some((c) => c[0] === 'subscriptions.retrieve' && c[1] === 'sub_pat'));
  holds({ sub_pat: live });
  const c = await send(event('checkout.session.completed', { id: 'cs_1', object: 'checkout.session', customer: 'cus_pat', subscription: 'sub_pat', client_reference_id: 'pat', metadata: {} }));
  ok('checkout completed: 200, still active', c.status === 200 && row('pat')?.status === 'active' && rowEntitles('pat'));
}

console.log('\nwhat ended stays ended, whatever arrives late');
{
  const ended = now - DAY;
  // Stripe's record: the subscription is over.
  const over = sub('sub_q', 'quinn', 'cus_q', 'canceled', { periodEnd: ended });
  holds({ sub_q: over });
  await send(event('customer.subscription.deleted', over));
  ok('the ending is written', row('quinn')?.status === 'canceled' && !rowEntitles('quinn'));
  // A retry of an older "updated", from when it was still active, lands after.
  const stale = sub('sub_q', 'quinn', 'cus_q', 'active', { periodEnd: ended });
  const r = await send(event('customer.subscription.updated', stale, { previous_attributes: {} }));
  ok('the stale "active" is acknowledged', r.status === 200);
  ok('  and the table still says it ended', row('quinn')?.status === 'canceled', `status=${row('quinn')?.status}`);
  ok('  so nothing is handed back', !rowEntitles('quinn'));
  ok('  and the account mirror agrees', mirror('quinn')?.status === 'canceled', `mirror=${JSON.stringify(mirror('quinn'))}`);
}

console.log('\nStripe unreachable is a retry, never a guess');
{
  const live = sub('sub_r', 'rosa', 'cus_r', 'active');
  globalThis.__stripe = { subs: { sub_r: live }, down: true, calls: [] };
  const r = await send(event('customer.subscription.created', live));
  ok('a 500, so Stripe tries again', r.status === 500, `status=${r.status}`);
  ok('  and nothing was written from the event alone', row('rosa') === null && mirror('rosa') === null);
  globalThis.__stripe.down = false;
  const again = await send(event('customer.subscription.created', live));
  ok('the retry lands', again.status === 200 && row('rosa')?.status === 'active' && mirror('rosa')?.status === 'active');
}

console.log('\na subscription they no longer hold cannot end the one they do');
{
  const old = sub('sub_s_old', 'sam', 'cus_s', 'canceled', { periodEnd: now - 40 * DAY });
  const cur = sub('sub_s_new', 'sam', 'cus_s', 'active');
  holds({ sub_s_old: old, sub_s_new: cur });
  await send(event('customer.subscription.created', cur));
  ok('the new one is held', row('sam')?.stripe_subscription_id === 'sub_s_new' && rowEntitles('sam'));
  const late = await send(event('customer.subscription.deleted', old));
  ok('the old one’s late ending is acknowledged', late.status === 200);
  ok('  and the new one is still held', row('sam')?.stripe_subscription_id === 'sub_s_new' && row('sam')?.status === 'active' && rowEntitles('sam'), JSON.stringify(row('sam')));
  ok('  on the account too', mirror('sam')?.status === 'active');
  // The new one ending is its own event, and is written.
  const curOver = { ...cur, status: 'canceled', items: { data: [{ price: { id: 'price_one' }, current_period_end: now - 1 }] } };
  holds({ sub_s_old: old, sub_s_new: curOver });
  await send(event('customer.subscription.deleted', curOver));
  ok('when the one they hold ends, that is written', row('sam')?.status === 'canceled' && !rowEntitles('sam'));
}

console.log('\na dead subscription\'s late event, over a complimentary row from before (comps no longer entitle)');
{
  const dead = sub('sub_c_dead', 'cora', 'cus_c', 'canceled', { periodEnd: now - 10 * DAY });
  // A comp over a dead real subscription keeps the customer and the old id (grantComplimentary).
  db.rows('socria_subscriptions').push({ user_id: 'cora', stripe_customer_id: 'cus_c', stripe_subscription_id: 'sub_c_dead', status: 'comp', price_id: null, current_period_end: null, cancel_at_period_end: false, updated_at: Date.now() });
  holds({ sub_c_dead: dead });
  const r = await send(event('customer.subscription.deleted', dead));
  ok('the dead one’s late event is acknowledged', r.status === 200);
  // Complimentary rows entitle nobody since October 31, 2026 (lib/entitlement-rule.ts RETIRED_STATUSES):
  // the late event records what Stripe says, and opens nothing either way.
  ok('  and opens nothing: neither the comp row nor the dead subscription entitles', !rowEntitles('cora'), JSON.stringify(row('cora')));
  const real = sub('sub_c_new', 'cora', 'cus_c', 'active');
  holds({ sub_c_dead: dead, sub_c_new: real });
  await send(event('customer.subscription.created', real));
  ok('subscribing for real replaces the complimentary row', row('cora')?.stripe_subscription_id === 'sub_c_new' && row('cora')?.status === 'active');
}

console.log('\nwhen Stripe no longer has the subscription');
{
  holds({});
  const gone = sub('sub_u', 'uma', 'cus_u', 'canceled', { periodEnd: now - DAY });
  db.rows('socria_subscriptions').push({ user_id: 'uma', stripe_customer_id: 'cus_u', stripe_subscription_id: 'sub_u', status: 'active', price_id: 'price_one', current_period_end: now - DAY, cancel_at_period_end: false, updated_at: Date.now() });
  const r = await send(event('customer.subscription.deleted', gone));
  ok('an ending is applied as sent', r.status === 200 && row('uma')?.status === 'canceled' && !rowEntitles('uma'));
  const phantom = sub('sub_u2', 'uma', 'cus_u', 'active');
  const p = await send(event('customer.subscription.updated', phantom, { previous_attributes: {} }));
  ok('an "active" for a subscription Stripe does not have is acknowledged', p.status === 200);
  ok('  and grants nothing', row('uma')?.status === 'canceled' && !rowEntitles('uma'), JSON.stringify(row('uma')));
}

console.log(`\nstripe-webhook-e2e: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
