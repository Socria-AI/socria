// The unlock grant is the thing that stands in for a Clerk session, so a
// forged one is a full authentication bypass. These are the cases an
// adversarial review found or would find.

import { readGrant, issueGrant, scopeForCode, scopeSatisfies, accessCodesConfigured } from './.tmp/access-codes-server.mjs';
import { createHash, createHmac } from 'node:crypto';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));

const NOW = 1_000_000_000_000;
const set = (core, one) => {
  if (core === null) delete process.env.SOCRIA_ACCESS_CODE; else process.env.SOCRIA_ACCESS_CODE = core;
  if (one === null) delete process.env.SOCRIA_ONE_CODE; else process.env.SOCRIA_ONE_CODE = one;
};

console.log('=== nothing configured: the gate does not exist ===');
set(null, null);
ok('no codes means not configured', accessCodesConfigured() === false);
ok('no code matches', scopeForCode('anything-at-all') === null);
ok('no grant can be issued', issueGrant('core', NOW) === null);
ok('no grant is honoured', readGrant('core.9999999999999.xxxx', NOW) === null);

console.log('\n=== the burned values are refused even from the environment ===');
set('MAVERICKS26LONGHORNS27', 'MAVERICKS26LONGHORNS27');
ok('a burned core code is ignored', scopeForCode('MAVERICKS26LONGHORNS27') === null);
ok('and the gate reports itself unconfigured', accessCodesConfigured() === false);
set('SMART', 'SMART');
ok('the short burned code is ignored too', scopeForCode('SMART') === null);

console.log('\n=== a normal configuration ===');
set('core-code-abcdefgh', 'one-code-abcdefgh');
ok('it is configured', accessCodesConfigured() === true);
ok('the core code gives core', scopeForCode('core-code-abcdefgh') === 'core');
ok('the one code gives one', scopeForCode('one-code-abcdefgh') === 'one');
ok('a wrong code gives nothing', scopeForCode('core-code-abcdefgg') === null);
ok('a short input gives nothing', scopeForCode('short') === null);
ok('a non-string gives nothing', scopeForCode({ toString: () => 'core-code-abcdefgh' }) === null);

console.log('\n=== a grant round-trips, and only when signed ===');
{
  const g = issueGrant('core', NOW);
  ok('a grant is issued', typeof g === 'string');
  ok('and reads back', readGrant(g, NOW) === 'core');
  ok('a tampered signature is refused', readGrant(g.slice(0, -1) + (g.slice(-1) === 'A' ? 'B' : 'A'), NOW) === null);
  ok('a tampered scope is refused', readGrant(g.replace(/^core/, 'one'), NOW) === null);
  ok('an expired grant is refused', readGrant(g, NOW + 40 * 24 * 60 * 60 * 1000) === null);
  ok('a malformed grant is refused', readGrant('core.123', NOW) === null);
  ok('a non-string is refused', readGrant(12345, NOW) === null);
  ok('an absurd exp is refused', readGrant('core.1e999.aaaa', NOW) === null);
  ok('a hex exp is refused', readGrant('core.0x7fffffffffff.aaaa', NOW) === null);
}

console.log('\n=== THE FORGERY: a core-code holder must not be able to mint "one" ===');
// grantKey mixes both codes. With SOCRIA_ONE_CODE unset the other half is the
// empty string, so whoever holds the core code knows the whole key input.
set('core-code-abcdefgh', null);
{
  const key = createHash('sha256').update('socria.access.v1|core-code-abcdefgh|', 'utf8').digest();
  const payload = `one.${NOW + 1_000_000}`;
  const mac = createHmac('sha256', key).update(payload, 'utf8').digest('base64url');
  const forged = `${payload}.${mac}`;
  ok('the attacker CAN derive a valid signature', createHmac('sha256', key).update(payload).digest('base64url') === mac);
  ok('but the forged "one" grant is refused', readGrant(forged, NOW) === null,
     'a demo code would have minted the paid plan');
  // The legitimate core grant still works in the same configuration.
  const good = issueGrant('core', NOW);
  ok('and a real core grant still works', readGrant(good, NOW) === 'core');
}
set(null, 'one-code-abcdefgh');
{
  const key = createHash('sha256').update('socria.access.v1||one-code-abcdefgh', 'utf8').digest();
  const payload = `core.${NOW + 1_000_000}`;
  const mac = createHmac('sha256', key).update(payload, 'utf8').digest('base64url');
  ok('and the mirror forgery is refused too', readGrant(`${payload}.${mac}`, NOW) === null);
}

console.log('\n=== one satisfies core; core does not satisfy one ===');
ok('one covers core', scopeSatisfies('one', 'core') === true);
ok('one covers one', scopeSatisfies('one', 'one') === true);
ok('core covers core', scopeSatisfies('core', 'core') === true);
ok('core does NOT cover one', scopeSatisfies('core', 'one') === false);
ok('nothing covers nothing', scopeSatisfies(null, 'core') === false);

set(null, null);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
