// GUESTS USE LOGOS 5: one line of thinking, and its map.
//
//   the pass     lib/guest-pass.ts — a signed cookie naming the guest's one
//                line of thinking: claimed once, the same one accepted, another
//                refused, anything forged or late is no pass, and with no
//                server secret there is no pass at all
//   the claim    app/api/logos/guest — sets the pass (httpOnly, kept to the
//                Logos routes), refuses a second line of thinking with a way
//                to sign up, and asks nothing of somebody signed in
//   the turns    app/api/logos/chat and app/api/logos/map — a guest turn goes
//                ahead only in the line of thinking the pass names; signed in,
//                nothing changes
//   the screen   components/LogosApp.tsx — no cover for a guest; a second line
//                of thinking opens the sign-up note; the first comes with them
//                when they sign up

import { build } from 'esbuild';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve as res } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, '.tmp', 'e2e-guest');
const FAKE_DB = join(here, 'helpers', 'fake-supabase.mjs');
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
    b.onResolve({ filter: /^@clerk\/nextjs\/server$/ }, () => ({ path: pathToFileURL(join(here, 'helpers', 'fake-clerk.mjs')).href, external: true }));
    b.onResolve({ filter: /^openai$/ }, () => ({ path: pathToFileURL(join(here, 'helpers', 'fake-openai-logos.mjs')).href, external: true }));
    b.onResolve({ filter: /^server-only$/ }, () => ({ path: join(here, 'helpers', 'server-only-shim.mjs') }));
    b.onResolve({ filter: /^next\/(server|headers)$/ }, (a) => ({ path: `${a.path}.js`, external: true }));
  },
};
await Promise.all(
  Object.entries({ pass: 'lib/guest-pass.ts', claim: 'app/api/logos/guest/route.ts', chat: 'app/api/logos/chat/route.ts', map: 'app/api/logos/map/route.ts' }).map(([name, file]) =>
    build({
      entryPoints: [join(root, file)],
      bundle: true,
      format: 'esm',
      platform: 'node',
      outfile: join(OUT, `${name}.mjs`),
      tsconfig: join(root, 'tsconfig.json'),
      plugins: [swap],
      external: ['next', 'next/*', 'undici', '@supabase/*', 'stripe', 'resend'],
      logLevel: 'error',
    })
  )
);
const quiet = (orig) => (...a) => {
  const first = typeof a[0] === 'string' ? a[0] : '';
  if (/^\[(socria|logos|core4|tokens|search|epistemic|mr)/.test(first) || first.startsWith('logos') || first.startsWith('conversations')) return;
  orig(...a);
};
console.info = quiet(console.info.bind(console));
console.warn = quiet(console.warn.bind(console));
console.error = quiet(console.error.bind(console));

process.env.OPENAI_API_KEY = 'test';
process.env.RATE_LIMIT_DISABLED = '1';
delete process.env.CLERK_SECRET_KEY;
const P = await import(pathToFileURL(join(OUT, 'pass.mjs')).href);
const claim = await import(pathToFileURL(join(OUT, 'claim.mjs')).href);
const chat = await import(pathToFileURL(join(OUT, 'chat.mjs')).href);
const mapRoute = await import(pathToFileURL(join(OUT, 'map.mjs')).href);
const { NextRequest } = await import('next/server.js');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 300))));
const NOW = Date.now();
const req = (url, body, cookie = '') => new NextRequest(`http://localhost${url}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
const cookieOf = (r) => r.cookies.get(P.GUEST_COOKIE);

console.log('\n=== the pass ===');
ok('no server secret: no pass, and the claim says so', P.issueGuestPass('lg_a', NOW) === null && P.claimGuest(undefined, 'lg_a', NOW).ok === false && P.claimGuest(undefined, 'lg_a', NOW).why === 'unavailable');
process.env.CLERK_SECRET_KEY = 'sk_test_guest';
const first = P.claimGuest(undefined, 'lg_a', NOW);
ok('a guest with no line of thinking yet: yes, and a pass naming it', first.ok && typeof first.pass === 'string' && P.guestSession(first.pass, NOW) === 'lg_a');
ok('the same one again: yes, nothing new to set', JSON.stringify(P.claimGuest(first.pass, 'lg_a', NOW)) === JSON.stringify({ ok: true, pass: null }));
ok('another one: no — one line of thinking until they sign up', JSON.stringify(P.claimGuest(first.pass, 'lg_b', NOW)) === JSON.stringify({ ok: false, why: 'other-session' }));
ok('a session id that is not one is no claim', P.claimGuest(undefined, '../x', NOW).why === 'bad-session' && P.claimGuest(undefined, 'a.b', NOW).why === 'bad-session' && P.claimGuest(undefined, 42, NOW).why === 'bad-session');
const [g, id, until, sig] = first.pass.split('.');
ok('a pass with its session changed is no pass', P.guestSession(`${g}.lg_b.${until}.${sig}`, NOW) === null);
ok('a pass with its end moved is no pass', P.guestSession(`${g}.${id}.${Number(until) + 1}.${sig}`, NOW) === null);
ok('a pass past its end is no pass — and a guest can claim again', P.guestSession(first.pass, Number(until) + 1) === null && P.claimGuest(first.pass, 'lg_b', Number(until) + 1).ok === true);
ok('a new server secret ends every pass', (() => {
  process.env.CLERK_SECRET_KEY = 'sk_test_other';
  const gone = P.guestSession(first.pass, NOW) === null;
  process.env.CLERK_SECRET_KEY = 'sk_test_guest';
  return gone;
})());
ok('guestMay: only the line of thinking the pass names', P.guestMay(first.pass, 'lg_a', NOW) && !P.guestMay(first.pass, 'lg_b', NOW) && !P.guestMay(undefined, 'lg_a', NOW) && !P.guestMay(first.pass, undefined, NOW));

console.log('\n=== the claim ===');
globalThis.__uid = null;
let r = await claim.POST(req('/api/logos/guest', { sessionId: 'lg_guest1' }));
const set = cookieOf(r);
ok('a guest claims their first line of thinking: a pass is set', r.status === 200 && !!set?.value && (await r.json()).guest === true);
ok('  httpOnly, lax, kept to the Logos routes, for thirty days', set?.httpOnly === true && set?.sameSite === 'lax' && set?.path === '/api/logos' && set?.maxAge === 30 * 24 * 3600, JSON.stringify(set));
const passCookie = `${P.GUEST_COOKIE}=${set.value}`;
r = await claim.POST(req('/api/logos/guest', { sessionId: 'lg_guest1' }, passCookie));
ok('the same one again: fine, nothing new set', r.status === 200 && !cookieOf(r)?.value);
r = await claim.POST(req('/api/logos/guest', { sessionId: 'lg_guest2' }, passCookie));
const refused = await r.json();
ok('a second line of thinking: refused, with a way to sign up', r.status === 403 && refused.guestLimit === true && /Sign up free/.test(refused.error) && /comes with you/.test(refused.error), JSON.stringify(refused));
delete process.env.CLERK_SECRET_KEY;
r = await claim.POST(req('/api/logos/guest', { sessionId: 'lg_guest9' }));
ok('no server secret: no pass, and no guest use', r.status === 503 && !cookieOf(r)?.value);
process.env.CLERK_SECRET_KEY = 'sk_test_guest';
globalThis.__uid = 'user_guest_test';
r = await claim.POST(req('/api/logos/guest', { sessionId: 'lg_guest2' }));
ok('somebody signed in needs no pass', r.status === 200 && (await r.json()).guest === false && !cookieOf(r)?.value);

console.log('\n=== the turns ===');
const U = (content) => ({ role: 'user', content });
const turn = async (body, cookie = '') => {
  globalThis.__logosCalls = [];
  globalThis.__logosPrompts = [];
  globalThis.__logosReply = 'Noted.';
  globalThis.__logosScript = [];
  const res = await chat.POST(req('/api/logos/chat', { surface: 'logos5', ...body }, cookie));
  const text = await res.text().catch(() => '');
  await new Promise((done) => setTimeout(done, 30));
  const streamed = (globalThis.__logosCalls ?? []).find((c) => c.stream);
  return { status: res.status, text, first: String(streamed?.messages?.[0]?.content ?? ''), calls: globalThis.__logosCalls ?? [] };
};
globalThis.__uid = null;
let t = await turn({ sessionId: 'lg_guest1', messages: [U('What is opportunity cost?')] });
ok('a guest turn with no pass: refused before any model is asked', t.status === 401 && /guestLimit/.test(t.text) && t.calls.length === 0, t.text.slice(0, 200));
t = await turn({ sessionId: 'lg_guest1', messages: [U('What is opportunity cost?')] }, passCookie);
ok('in the line of thinking their pass names: answered, as Logos 5', t.status === 200 && /^You are Socria\. People come to you to think out loud/.test(t.first), `${t.status} ${t.text.slice(0, 120)}`);
t = await turn({ sessionId: 'lg_guest2', messages: [U('A second thing')] }, passCookie);
ok('in another one: refused before any model is asked, with a way to sign up', t.status === 401 && /Sign up free/.test(t.text) && t.calls.length === 0, t.text.slice(0, 200));
globalThis.__uid = 'user_guest_test';
t = await turn({ sessionId: 'lg_any', messages: [U('What is opportunity cost?')] });
ok('somebody signed in: as before, any line of thinking', t.status === 200);

globalThis.__uid = null;
const mapReq = (sessionId, cookie) => mapRoute.POST(req('/api/logos/map', { sessionId, messages: [U('What is opportunity cost?'), { role: 'assistant', content: 'What you give up.' }], map: { nodes: [], edges: [] } }, cookie));
ok('a guest map with no pass: refused', (await mapReq('lg_guest1', '')).status === 401);
ok('the map of another line of thinking: refused', (await mapReq('lg_guest2', passCookie)).status === 401);
ok('the map of their one line of thinking: drawn (not refused)', (await mapReq('lg_guest1', passCookie)).status !== 401);

console.log('\n=== the screen ===');
const app = readFileSync(join(root, 'components', 'LogosApp.tsx'), 'utf8');
ok('no cover for a guest: everyone has Logos 5 once the account has answered', /const hasAccess = unlocked \|\| !!isSignedIn \|\| authSettled;/.test(app) && !/<LogosCover/.test(app));
ok('a guest is signed out with no access key', /const guest = authSettled && !isSignedIn && !unlocked;/.test(app));
ok('a second line of thinking opens the sign-up note, from newSession and from send', /if \(guestRef\.current && sessionsRef\.current\.some\(\(x\) => x\.messages\.length > 0\)\) \{\s*setGuestWall\(true\);/.test(app) && /guestHasAnother\(activeIdRef\.current\) \|\| !\(await claimGuestPass\(activeIdRef\.current\)\)/.test(app));
ok('the server refusing a guest turn puts the words back and opens the note', /if \(body\?\.guestLimit\) \{[\s\S]{0,400}setInput\(content\);[\s\S]{0,200}setGuestWall\(true\);/.test(app));
ok('the map pass says which line of thinking it is', /sessionId: forSession,\s*messages: chronRef\.current,/.test(app));
ok('the first line of thinking comes with them when they sign up, once', /A GUEST WHO SIGNED UP/.test(app) && /saveLocal\(loadLocal\(\)\.filter\(\(x\) => !keptIds\.has\(x\.id\)\)\)/.test(app));
const wall = readFileSync(join(root, 'components', 'logos5', 'GuestWall.tsx'), 'utf8');
ok('the note: a dialog, what the limit is, free to sign up, theirs comes with them, a way to keep going', /role="dialog"/.test(wall) && /aria-modal="true"/.test(wall) && /\{GUEST_TURNS\} messages, and one map/.test(wall) && /Sign up free/.test(wall) && /come with you/.test(wall) && /Keep going with this one/.test(wall));

console.log('\n=== five messages, and the way to sign in ===');
const lim = readFileSync(join(root, 'lib', 'guest-limits.ts'), 'utf8');
ok('a guest gets five messages', /export const GUEST_TURNS = 5;/.test(lim));
ok('  counted as their own turns', /m\.role === 'user'/.test(lim));
const chatRoute = readFileSync(join(root, 'app', 'api', 'logos', 'chat', 'route.ts'), 'utf8');
ok('the server refuses the sixth, with the sign-up note', /if \(guest && guestTurnsUsed\(messages\) > GUEST_TURNS\)/.test(chatRoute) && /guestLimit: true, guestTurns: true/.test(chatRoute));
ok('the app shows the note before sending a sixth', /guestUsedNow\(\) >= GUEST_TURNS \|\| guestHasAnother/.test(app));
ok('top right, a guest sees what is left and Sign in', /const accountEl = guest \?/.test(app) && /className="l5-signin" href=\{signInHref\}/.test(app) && /free left/.test(app));

console.log(`\nguest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
