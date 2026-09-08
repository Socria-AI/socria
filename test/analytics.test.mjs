// What analytics is allowed to carry.
//
// This suite exists for one assertion, restated many ways: no part of
// anyone's thinking leaves through here. Everything else in the file is in
// service of proving that the allow-list actually holds when it is handed
// things it was not designed for — because the way conversation content ends
// up in an analytics payload is never a deliberate decision, it is a key
// somebody added in a hurry.

import { scrub, EVENTS, nthBucket, tenureBucket } from './.tmp/analytics.mjs';

let pass = 0,
  fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

console.log('=== the events we claim to emit ===');
{
  const expected = [
    'one_prompt_shown',
    'one_prompt_dismissed',
    'one_prompt_clicked',
    'one_checkout_started',
    // The funnel used to stop at "checkout opened". These two come back from
    // the Stripe webhook, so a trigger can finally be judged by what it
    // earned rather than by how often it was pressed.
    'one_subscribed',
    'one_cancelled',
    'lifecycle_email_sent',
    'one_cancel_scheduled',
    'logos_session_started',
    'first_map_shaped',
  ];
  for (const e of expected) ok(`${e} is declared`, EVENTS.includes(e));
  ok('every event name is snake_case', EVENTS.every((e) => /^[a-z][a-z0-9_]*$/.test(e)), EVENTS.join());
  ok('no duplicates', new Set(EVENTS).size === EVENTS.length);
}

console.log('\n=== the allow-list keeps what it should ===');
{
  const out = scrub({
    trigger: 'explore-spent',
    category: 'entitlement',
    intent: 'urgent',
    surface: 'logos',
    hard_limit: true,
    counter: 'explore',
    plan: 'free',
    dismissals: 2,
    signed_in: true,
  });
  ok('trigger kept', out.trigger === 'explore-spent');
  ok('category kept', out.category === 'entitlement');
  ok('intent kept', out.intent === 'urgent');
  ok('surface kept', out.surface === 'logos');
  ok('hard_limit kept as a boolean', out.hard_limit === true);
  ok('counter kept', out.counter === 'explore');
  ok('plan kept', out.plan === 'free');
  ok('dismissals kept as a number', out.dismissals === 2);
  ok('signed_in kept', out.signed_in === true);
  ok('nothing extra invented', Object.keys(out).length === 9, Object.keys(out).join());

  // The two keys the server events carry: a lifecycle email's KIND, and where
  // a server event came from. Both are short tokens by construction.
  const srv = scrub({ kind: 'day-3', source: 'cron' });
  ok('kind kept', srv.kind === 'day-3');
  ok('source kept', srv.source === 'cron');
  // And an address is not a key that exists, so it cannot ride along.
  const leak = scrub({ kind: 'day-3', to: 'someone@example.com', email: 'x@y.z' });
  ok('a recipient address cannot get through', !('to' in leak) && !('email' in leak));
  // The activation and cancellation keys: all short tokens, all bounded.
  const act = scrub({ nth: '3+', opening: 'limit', tenure: 'd1-3', feedback: 'too_expensive', comment: 'free text a person typed' });
  ok('nth kept', act.nth === '3+');
  ok('opening kept', act.opening === 'limit');
  ok('tenure kept', act.tenure === 'd1-3');
  ok('feedback kept', act.feedback === 'too_expensive');
  ok('a cancellation comment is not a key and cannot get through', !('comment' in act));
}

console.log('\n=== conversation content cannot get through ===');
{
  const secret = 'I am deciding whether to leave my job and it is keeping me up';
  const out = scrub({
    trigger: 'chats-spent',
    // Every one of these is a key somebody could plausibly add.
    message: secret,
    content: secret,
    text: secret,
    prompt: secret,
    node_label: 'Leaving the job',
    map_title: 'Career decision',
    file_name: 'resignation-draft.docx',
    query: secret,
    email: 'someone@example.com',
    user_id: 'user_2abcdef',
    userId: 'user_2abcdef',
    conversation: [{ role: 'user', content: secret }],
  });
  ok('only the allowed key survives', JSON.stringify(out) === JSON.stringify({ trigger: 'chats-spent' }), JSON.stringify(out));

  const blob = JSON.stringify(out);
  ok('no message text anywhere in the payload', !blob.includes('job'), blob);
  ok('no node label', !blob.includes('Leaving'), blob);
  ok('no file name', !blob.includes('resignation'), blob);
  ok('no email address', !blob.includes('@'), blob);
  ok('no user id', !blob.includes('user_2'), blob);
}

console.log('\n=== allowed keys still cannot smuggle long values ===');
{
  const essay = 'x'.repeat(5000);
  const out = scrub({ trigger: essay, surface: essay });
  ok('a long trigger is truncated', out.trigger.length === 64, String(out.trigger.length));
  ok('a long surface is truncated', out.surface.length === 64, String(out.surface.length));
  const real = 'My whole private conversation about something painful'.repeat(20);
  const o2 = scrub({ counter: real });
  ok('truncation bounds the damage', o2.counter.length === 64);
  ok('and it is only ever a prefix', real.startsWith(o2.counter));
}

console.log('\n=== nested and odd values are dropped, not flattened ===');
{
  // The dangerous case: an object under an ALLOWED key. Flattening it would
  // walk straight into whatever it contains.
  const out = scrub({
    trigger: { text: 'private thought' },
    counter: ['a', 'private', 'array'],
    surface: () => 'private',
    plan: Symbol('private'),
  });
  ok('an object under an allowed key is dropped', out.trigger === undefined, JSON.stringify(out));
  ok('an array is dropped', out.counter === undefined);
  ok('a function is dropped', out.surface === undefined);
  ok('a symbol is dropped', out.plan === undefined);
  ok('the result is empty', Object.keys(out).length === 0, JSON.stringify(out));
}

console.log('\n=== degenerate input does not throw ===');
{
  ok('empty object', JSON.stringify(scrub({})) === '{}');
  ok('undefined values are skipped', JSON.stringify(scrub({ trigger: undefined })) === '{}');
  ok('null values are skipped', JSON.stringify(scrub({ trigger: null })) === '{}');
  ok('NaN becomes 0 rather than null in JSON', scrub({ dismissals: NaN }).dismissals === 0);
  ok('Infinity becomes 0', scrub({ dismissals: Infinity }).dismissals === 0);
  ok('false is kept, not treated as absent', scrub({ hard_limit: false }).hard_limit === false);
  ok('zero is kept', scrub({ dismissals: 0 }).dismissals === 0);
  ok('empty string is kept', scrub({ trigger: '' }).trigger === '');
}

console.log('\n=== the output is always flat scalars ===');
{
  const out = scrub({
    trigger: 'x',
    dismissals: 1,
    hard_limit: true,
    suppressed: 'cooldown',
  });
  const flat = Object.values(out).every(
    (v) => ['string', 'number', 'boolean'].includes(typeof v)
  );
  ok('every value is a scalar', flat, JSON.stringify(out));
  ok('prototype is not walked', !('constructor' in out) || out.constructor === Object);
}

console.log('\n=== the buckets say a shape, never a number ===');
{
  ok('first', nthBucket(1) === '1' && nthBucket(0) === '1' && nthBucket(NaN) === '1');
  ok('second', nthBucket(2) === '2');
  ok('everything after is one bucket', nthBucket(3) === '3+' && nthBucket(40) === '3+');
  ok('same day', tenureBucket(0) === 'd0' && tenureBucket(-1) === 'd0');
  ok('first days', tenureBucket(1) === 'd1-3' && tenureBucket(3) === 'd1-3');
  ok('first week', tenureBucket(4) === 'd4-7' && tenureBucket(7) === 'd4-7');
  ok('first month', tenureBucket(8) === 'd8-30' && tenureBucket(30) === 'd8-30');
  ok('longer', tenureBucket(31) === '30+' && tenureBucket(400) === '30+');
  ok('unknown when there is no first activity', tenureBucket(null) === 'unknown' && tenureBucket(undefined) === 'unknown' && tenureBucket(NaN) === 'unknown');
  ok('every value is one of six words', ['d0', 'd1-3', 'd4-7', 'd8-30', '30+', 'unknown'].includes(tenureBucket(12)));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
