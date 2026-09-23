// The fetcher must not be a way to read the inside of our own network.
//
// There was no test here, which is why `assertResolvesPublic` could sit in
// lib/logos-connect.ts for months without ever being called: the literal
// hostname screen passed, nothing complained, and `127.0.0.1.nip.io` — an
// ordinary public domain with an A record for loopback — was fetched and its
// body handed to whoever asked. These pin the address screen itself.

import { isForbiddenIp, isForbiddenHost, screenResolved } from './.tmp/logos-connect.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));

console.log('=== v4 addresses that must never be dialled ===');
for (const ip of [
  '127.0.0.1', '127.1.1.1', '0.0.0.0', '169.254.169.254', '169.254.0.1',
  '10.0.0.5', '10.255.255.255', '192.168.1.1', '172.16.0.1', '172.31.255.255',
  '100.64.0.1', '192.0.2.1', '198.18.0.1', '224.0.0.1', '255.255.255.255',
]) ok(`${ip} is forbidden`, isForbiddenIp(ip) === true);

console.log('\n=== v4 addresses that are ordinary internet ===');
for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.32.0.1', '11.0.0.1'])
  ok(`${ip} is allowed`, isForbiddenIp(ip) === false);

console.log('\n=== v6, including the forms that carry a v4 inside ===');
for (const ip of [
  '::1', '::', '::ffff:127.0.0.1', '::ffff:169.254.169.254', '::ffff:10.0.0.1',
  'fc00::1', 'fd00::1', 'fe80::1',
  '64:ff9b::7f00:1',          // NAT64 wrapping 127.0.0.1
  '64:ff9b::a9fe:a9fe',       // NAT64 wrapping 169.254.169.254
  '2001:db8::1',              // documentation
  'ff02::1',                  // multicast
]) ok(`${ip} is forbidden`, isForbiddenIp(ip) === true, JSON.stringify(ip));

ok('2606:4700:4700::1111 is allowed', isForbiddenIp('2606:4700:4700::1111') === false);

console.log('\n=== hostnames screened before any lookup ===');
for (const h of ['localhost', 'foo.localhost', 'thing.local', 'api.internal', 'box.lan', ''])
  ok(`${h || '(empty)'} is forbidden`, isForbiddenHost(h) === true);
ok('example.com is allowed', isForbiddenHost('example.com') === false);

console.log('\n=== the socket lookup screens what it dials ===');
// This is where DNS rebinding is actually stopped. The pre-flight screen
// resolves the name to check it; fetch() would then resolve it AGAIN, and an
// attacker controlling authoritative DNS can answer differently the second
// time. screenResolved runs inside the socket's lookup, so the address that
// is approved is the address that is connected to — there is no second,
// unscreened resolution to poison.
ok('a public answer is allowed', screenResolved([{ address: '93.184.216.34', family: 4 }])?.length === 1);
ok('a loopback answer is refused', screenResolved([{ address: '127.0.0.1', family: 4 }]) === null);
ok('a metadata answer is refused', screenResolved([{ address: '169.254.169.254', family: 4 }]) === null);
ok('an empty answer is refused', screenResolved([]) === null);
ok('a non-array is refused', screenResolved(null) === null);
ok('a malformed entry is refused', screenResolved([{ family: 4 }]) === null);
// The rebinding shape: one public address and one private one in the same
// answer. Connecting to the public one would be a coin flip the attacker
// gets to re-run, so the whole answer is refused.
ok('a mixed public+private answer is refused ENTIRELY',
   screenResolved([{ address: '93.184.216.34', family: 4 }, { address: '127.0.0.1', family: 4 }]) === null,
   'connecting to the public sibling leaves the rebinding window open');
ok('private-then-public is refused too',
   screenResolved([{ address: '10.0.0.5', family: 4 }, { address: '8.8.8.8', family: 4 }]) === null);
ok('several public answers all pass',
   screenResolved([{ address: '8.8.8.8', family: 4 }, { address: '1.1.1.1', family: 4 }])?.length === 2);

console.log('\n=== the DNS screen is actually wired in ===');
// The defect this file exists for: a guard that is defined and never called.
// Read the source and assert the call is there, because a unit test of the
// helper cannot tell whether fetchWeb uses it.
const { readFileSync } = await import('node:fs');
const { join, dirname } = await import('node:path');
const { fileURLToPath } = await import('node:url');
const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'lib/logos-connect.ts'),
  'utf8'
);
ok('fetchWeb screens the destination', /await assertDestinationAllowed\(url\)/.test(src));
ok('the screen resolves the name, not just the literal', /resolvePublicAddresses/.test(src));
ok('assertDestinationAllowed is called more than once (initial + each hop)',
  (src.match(/await assertDestinationAllowed\(/g) || []).length >= 2);
ok('redirects are followed by hand, not by fetch', /redirect: 'manual'/.test(src));
ok("no 'follow' redirect remains in fetchWeb", !/redirect: 'follow'/.test(src));
ok('the body is read with a ceiling', /readCapped\(res, MAX_WEB_BYTES\)/.test(src));
ok('the whole body is no longer buffered first', !/await res\.arrayBuffer\(\)/.test(src));
ok('the pinned dispatcher is used on every hop', /dispatcher: safeAgent/.test(src));
ok('and the agent screens inside its own lookup', /lookup\(hostname, options, callback\)[\s\S]{0,300}screenResolved/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
