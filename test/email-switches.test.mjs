// The three switches, and the order they are checked in.
//
// Everything about lifecycle email is off until somebody decides otherwise,
// and this suite is the thing that keeps it that way. The failure it guards
// is specific and expensive: a preview deployment with production's
// environment copied into it mailing real people. So the kill switch is
// checked first, before any key, and an unset switch is off — not "on if the
// keys happen to be there".

import {
  DEFAULT_FROM,
  RACE_MS,
  SEND_TIMEOUT_MS,
  emailBaseUrl,
  emailFrom,
  lifecycleEmailsOn,
  sendEmail,
  withTimeout,
} from './.tmp/email.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

const env = { ...process.env };
const reset = () => {
  for (const k of ['LIFECYCLE_EMAILS', 'EMAIL_SECRET', 'RESEND_API_KEY', 'EMAIL_FROM', 'NEXT_PUBLIC_SITE_URL']) delete process.env[k];
  Object.assign(process.env, Object.fromEntries(Object.entries(env).filter(([k]) => !k.startsWith('EMAIL') && k !== 'LIFECYCLE_EMAILS' && k !== 'RESEND_API_KEY')));
};

console.log('=== unset is off ===');
{
  reset();
  ok('no switch → off', lifecycleEmailsOn() === false);
  for (const v of ['', 'off', 'true', '1', 'yes', 'ON ', 'On']) {
    process.env.LIFECYCLE_EMAILS = v;
    const want = v.trim().toLowerCase() === 'on';
    ok(`${JSON.stringify(v)} → ${want}`, lifecycleEmailsOn() === want);
  }
  process.env.LIFECYCLE_EMAILS = 'on';
  ok('exactly "on" → on', lifecycleEmailsOn() === true);
}

console.log('\n=== nothing is sent until all three are set ===');
{
  reset();
  // A send is attempted with fetch replaced, so a leak would be visible.
  let called = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { called++; return { ok: true, json: async () => ({ id: 'x' }) }; };
  const msg = { to: 'someone@example.com', subject: 's', text: 't' };

  let r = await sendEmail(msg);
  ok('switch off → refused', r.ok === false && r.reason === 'off');
  ok('...and the provider was never called', called === 0);

  process.env.LIFECYCLE_EMAILS = 'on';
  r = await sendEmail(msg);
  ok('no EMAIL_SECRET → refused', r.ok === false && r.reason === 'unconfigured');
  ok('...and still no call', called === 0);

  process.env.EMAIL_SECRET = 'a-long-enough-secret-for-tests';
  r = await sendEmail(msg);
  ok('no API key → refused', r.ok === false && r.reason === 'unconfigured');
  ok('...and still no call', called === 0);

  process.env.RESEND_API_KEY = 're_test';
  r = await sendEmail({ ...msg, to: 'not an address' });
  ok('a bad address → refused', r.ok === false && r.reason === 'bad-address');
  ok('...and still no call', called === 0);

  r = await sendEmail(msg);
  ok('all three set → sent', r.ok === true);
  ok('...and the provider was called once', called === 1);
  globalThis.fetch = realFetch;
}

console.log('\n=== the unsubscribe headers, and where links point ===');
{
  reset();
  process.env.LIFECYCLE_EMAILS = 'on';
  process.env.EMAIL_SECRET = 's';
  process.env.RESEND_API_KEY = 're_test';
  let body = null;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => { body = JSON.parse(init.body); return { ok: true, json: async () => ({ id: 'x' }) }; };
  await sendEmail({ to: 'a@b.co', subject: 's', text: 't', unsubscribeUrl: 'https://socria.app/api/email/unsubscribe?u=1&t=2' });
  ok('List-Unsubscribe is set', body.headers['List-Unsubscribe'] === '<https://socria.app/api/email/unsubscribe?u=1&t=2>');
  ok('one-click is offered', body.headers['List-Unsubscribe-Post'] === 'List-Unsubscribe=One-Click');
  await sendEmail({ to: 'a@b.co', subject: 's', text: 't' });
  ok('no address → no headers', !('List-Unsubscribe' in body.headers));
  globalThis.fetch = realFetch;

  ok('from falls back to the product', emailFrom() === DEFAULT_FROM);
  process.env.EMAIL_FROM = 'Socria <notes@socria.app>';
  ok('...and is used when set', emailFrom() === 'Socria <notes@socria.app>');
  ok('links point at the canonical site, never a request origin', emailBaseUrl() === 'https://socria.app');
  process.env.NEXT_PUBLIC_SITE_URL = 'https://dev.socria.app/';
  ok('...and the trailing slash goes', emailBaseUrl() === 'https://dev.socria.app');
}

console.log('\n=== waiting, bounded ===');
{
  ok('the provider gets longer than a caller does', SEND_TIMEOUT_MS > RACE_MS);
  const slow = new Promise((r) => setTimeout(() => r('late'), 200));
  ok('a slow promise yields the fallback', (await withTimeout(slow, 20, 'gave-up')) === 'gave-up');
  ok('a quick one yields its value', (await withTimeout(Promise.resolve('here'), 50, 'gave-up')) === 'here');
  // A rejection must never propagate: the callers are a webhook and a 402.
  ok('a rejection becomes the fallback', (await withTimeout(Promise.reject(new Error('no')), 50, 'gave-up')) === 'gave-up');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
