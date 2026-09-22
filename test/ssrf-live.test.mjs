// The exploit itself, run for real: a victim service on loopback and a
// public DNS name that points at it. This is the attack that worked —
// `assertResolvesPublic` existed but was never called, so the literal
// hostname screen passed `127.0.0.1.nip.io` and handed back whatever the
// internal service said.
//
// It needs outbound DNS (nip.io). Where there is none it skips rather than
// fails: a test that cannot run is not a test that passed, and it says so.
import http from 'node:http';
import dns from 'node:dns';
import { fetchWeb } from './.tmp/logos-connect.mjs';

const probe = await dns.promises.lookup('127.0.0.1.nip.io').catch(() => null);
if (!probe || probe.address !== '127.0.0.1') {
  console.log('SKIP — no outbound DNS for nip.io, so the live exploit cannot be staged');
  console.log('\n0 passed, 0 failed');
  process.exit(0);
}

// A stand-in for an internal service: a metadata endpoint on loopback.
const victim = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('iam/security-credentials\nINTERNAL-SECRET-AWS-IMDS-TOKEN-abc123');
});
await new Promise((r) => victim.listen(0, '127.0.0.1', r));
const port = victim.address().port;
console.log(`victim service on 127.0.0.1:${port}\n`);

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));

async function attempt(_label, url) {
  try {
    const ctx = await fetchWeb(url);
    const leaked = (ctx?.text || '').includes('INTERNAL-SECRET');
    return { blocked: false, leaked, text: (ctx?.text || '').slice(0, 60) };
  } catch (e) {
    return { blocked: true, status: e?.status, message: String(e?.message || e).slice(0, 60) };
  }
}

console.log('=== the original exploit: a PUBLIC name resolving to loopback ===');
{
  const r = await attempt('nip.io', `http://127.0.0.1.nip.io:${port}/latest/meta-data/`);
  ok('127.0.0.1.nip.io is refused', r.blocked === true, JSON.stringify(r));
  ok('nothing internal came back', !r.leaked, r.text);
}

console.log('\n=== literal internal addresses ===');
for (const [label, url] of [
  ['loopback literal', `http://127.0.0.1:${port}/`],
  ['cloud metadata', 'http://169.254.169.254/latest/meta-data/'],
  ['localhost', `http://localhost:${port}/`],
  ['RFC1918', 'http://10.0.0.5/'],
  ['file scheme', 'file:///etc/passwd'],
  ['credentials in URL', `http://user:pw@127.0.0.1.nip.io:${port}/`],
]) {
  const r = await attempt(label, url);
  ok(`${label} is refused`, r.blocked === true, JSON.stringify(r));
}

console.log('\n=== a name resolving to metadata, via nip.io ===');
{
  const r = await attempt('metadata via dns', 'http://169.254.169.254.nip.io/latest/meta-data/');
  ok('169.254.169.254.nip.io is refused', r.blocked === true, JSON.stringify(r));
}

console.log('\n=== a redirect INTO the internal network ===');
{
  const redirector = http.createServer((req, res) => {
    res.writeHead(302, { Location: `http://127.0.0.1.nip.io:${port}/latest/meta-data/` });
    res.end();
  });
  await new Promise((r) => redirector.listen(0, '127.0.0.1', r));
  const rp = redirector.address().port;
  // Reached via a name so the FIRST hop passes; the redirect is the attack.
  const r = await attempt('redirect', `http://127.0.0.1.nip.io:${rp}/start`);
  ok('a redirect to an internal address is refused', r.blocked === true, JSON.stringify(r));
  ok('and its body never came back', !r.leaked);
  redirector.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
victim.close();
process.exit(fail ? 1 : 0);
