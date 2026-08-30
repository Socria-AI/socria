// What analytics is allowed to carry.
//
// This suite exists for one assertion, restated many ways: no part of
// anyone's thinking leaves through here. Everything else in the file is in
// service of proving that the allow-list actually holds when it is handed
// things it was not designed for — because the way conversation content ends
// up in an analytics payload is never a deliberate decision, it is a key
// somebody added in a hurry.

import { scrub, EVENTS } from './.tmp/analytics.mjs';

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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
