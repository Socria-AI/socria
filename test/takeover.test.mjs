// THE RELAUNCH: one page in front of the whole site, a code to get in.
//
// lib/takeover.ts decides where every request goes and checks the code and
// the entry cookie; middleware.ts carries that out; app/api/access/enter
// takes the code; app/page.tsx is the campaign page while it runs; and
// lib/campaign/scene.ts is the opening — a chat window turning into a network
// — as numbers. This suite holds each of those to what the campaign promises:
// the public pages lead to one page, Logos 5 and its thinking need the code,
// signing in, the account, billing, the legal pages, events and the backend
// never do, the code is checked on the server and written nowhere, an entry
// cannot be forged or outlive its code, the opening starts on the chat and
// ends in the network, and the page says one thing.
//
// The campaign's own code is deliberately absent here (this repository is
// public). Set TAKEOVER_TEST_CODE to check it too.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import * as K from './.tmp/campaign-under-test.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const subtle = globalThis.crypto.subtle;
let pass = 0;
let fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + (x ? '  ' + x : ''))));
const said = (d) => (d.do === 'go' ? `go:${d.to}` : d.do);

console.log('=== on, unless it is turned off ===');
ok('on by default (nothing set)', K.takeoverOn({}));
for (const v of ['off', 'OFF', ' off ', '0', 'false', 'no']) ok(`SOCRIA_TAKEOVER=${JSON.stringify(v)} turns it off`, !K.takeoverOn({ SOCRIA_TAKEOVER: v }));
for (const v of ['on', '1', 'true', 'yes', '']) ok(`SOCRIA_TAKEOVER=${JSON.stringify(v)} leaves it on`, K.takeoverOn({ SOCRIA_TAKEOVER: v }));

console.log('\n=== every address: without the code, and with it ===');
const pages = [
  // the homepage is the campaign; entered, it is Logos 5
  ['/', 'next', 'go:/chat'],
  // Logos 5, and what opens into it: the campaign at the same address until the code is in
  ['/chat', 'show', 'next'],
  ['/logos', 'show', 'next'],
  ['/logos2', 'show', 'next'],
  ['/memory', 'show', 'next'],
  ['/model', 'show', 'next'],
  ['/mind-ar', 'show', 'next'],
  ['/onboarding', 'show', 'next'],
  ['/s/tok3n', 'show', 'next'],
  ['/s/i/tok3n', 'show', 'next'],
  ['/logos-5-internal', 'show', 'next'],
  // the rest of the public site leads to the one page
  ['/one', 'go:/', 'go:/'],
  ['/charter', 'go:/', 'go:/'],
  ['/docs', 'go:/', 'go:/'],
  ['/docs/logos-5', 'go:/', 'go:/'],
  ['/blog', 'go:/', 'go:/'],
  ['/blog/clear-thinking', 'go:/', 'go:/'],
  ['/students', 'go:/', 'go:/'],
  ['/support', 'go:/', 'go:/'],
  ['/explore', 'go:/', 'go:/'],
  ['/surfaces', 'go:/', 'go:/'],
  ['/a-page-that-never-was', 'go:/', 'go:/'],
  // a prefix is a whole segment: /chatbot is not /chat
  ['/chatbot', 'go:/', 'go:/'],
  ['/sign-inside', 'go:/', 'go:/'],
  // what keeps working whatever the campaign
  ['/sign-in', 'next', 'next'],
  ['/sign-in/factor-one', 'next', 'next'],
  ['/sign-up', 'next', 'next'],
  ['/sso-callback', 'next', 'next'],
  ['/account', 'next', 'next'],
  ['/account/data', 'next', 'next'],
  ['/privacy', 'next', 'next'],
  ['/terms', 'next', 'next'],
  ['/security', 'next', 'next'],
  ['/subprocessors', 'next', 'next'],
  ['/events/ev1', 'next', 'next'],
  ['/events/ev1/ticket/t1', 'next', 'next'],
  ['/events/admin', 'next', 'next'],
  ['/r/FRIEND7', 'next', 'next'],
  ['/og/campaign', 'next', 'next'],
  ['/og/home', 'next', 'next'],
  ['/dev/dashboard', 'next', 'next'],
  ['/studio', 'next', 'next'],
  ['/_vercel/insights/view', 'next', 'next'],
  ['/__clerk/v1/client', 'next', 'next'],
];
for (const [p, without, withCode] of pages) {
  const a = said(K.decide(p, false));
  const b = said(K.decide(p, true));
  ok(`${p}: ${without} / entered ${withCode}`, a === without && b === withCode, `${a} / ${b}`);
}

console.log('\n=== the API: only the routes that do Logos 5’s thinking ask for the code ===');
const thinking = [
  'logos/chat',
  'logos/map',
  'logos/organize',
  'logos/practice',
  'logos/read',
  'logos/write',
  'logos/synthesize',
  'logos/explore',
  'logos/experience',
  'logos/guest',
  'logos/sources',
  'logos/room',
  'chat',
  'mr',
  'transcribe',
  'extract-memory',
  'update-understanding',
  'generate-insight',
  'generate-synthesis',
];
for (const r of thinking) {
  ok(`/api/${r} is a route that exists`, existsSync(join(root, 'app/api', r)));
  ok(`/api/${r}: refused without the code, through with it`, said(K.decide(`/api/${r}`, false)) === 'refuse' && said(K.decide(`/api/${r}`, true)) === 'next');
}
ok(
  '…and what is under them (/api/logos/sources/search, /api/logos/room/join)',
  ['/api/logos/sources/search', '/api/logos/room/join'].every((p) => K.decide(p, false).do === 'refuse')
);
// every other route on disk is untouched, entered or not
const apiRoutes = [];
(function walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (/^route\.tsx?$/.test(e)) apiRoutes.push('/' + relative(join(root, 'app'), dir).replace(/\\/g, '/'));
  }
})(join(root, 'app/api'));
const open = apiRoutes.filter((r) => !thinking.some((t) => r === `/api/${t}` || r.startsWith(`/api/${t}/`)));
ok(
  `${open.length} other API routes on disk, none of them gated`,
  open.length > 40 && open.every((r) => K.decide(r, false).do === 'next'),
  open.filter((r) => K.decide(r, false).do !== 'next').join(', ')
);
for (const r of [
  '/api/stripe/webhook',
  '/api/stripe/checkout',
  '/api/stripe/portal',
  '/api/cron/newsletter',
  '/api/email/unsubscribe',
  '/api/access/enter',
  '/api/health',
  '/api/logos/plan',
  '/api/conversations',
  '/api/account/data'.replace('/data', ''),
]) {
  ok(`${r} never asks for the code`, K.decide(r, false).do === 'next' && !K.needsEntry(r));
}
ok('/api/logos/chatty is not /api/logos/chat', K.decide('/api/logos/chatty', false).do === 'next');

console.log('\n=== the cookie is checked only where the answer depends on it ===');
for (const p of ['/', '/chat', '/s/x', '/api/logos/chat']) ok(`${p} needs it`, K.needsEntry(p));
for (const p of ['/one', '/sign-in', '/account', '/events/x', '/api/health', '/api/stripe/webhook']) ok(`${p} does not`, !K.needsEntry(p));

console.log('\n=== the paths named are paths that exist ===');
for (const p of [
  'chat',
  'logos',
  'logos2',
  'logos2-test',
  'memory',
  'model',
  'mind-ar',
  'onboarding',
  's',
  'logos-5-internal',
  'sign-in',
  'sign-up',
  'sso-callback',
  'account',
  'events',
  'r',
  'og',
  'dev',
  'studio',
]) {
  ok(`app/${p}`, existsSync(join(root, 'app', p)));
}
for (const p of ['privacy', 'terms', 'security', 'subprocessors']) ok(`app/(legal)/${p}`, existsSync(join(root, 'app/(legal)', p)));

console.log('\n=== the code: compared on the server, written nowhere ===');
const none = {};
for (const bad of ['', '   ', null, undefined, 42, {}, 'nope', 'x'.repeat(65)]) ok(`${JSON.stringify(bad)?.slice(0, 20)} opens nothing`, !(await K.codeMatches(subtle, bad, none)));
const set = { SOCRIA_TAKEOVER_CODE: 'open sesame 42' };
ok('an operator’s code (SOCRIA_TAKEOVER_CODE) opens it', await K.codeMatches(subtle, 'OPEN SESAME 42', set));
ok('  in any case, with or without spaces', (await K.codeMatches(subtle, 'opensesame42', set)) && (await K.codeMatches(subtle, '  Open Sesame 42 ', set)));
ok('  a near miss does not', !(await K.codeMatches(subtle, 'open sesame 43', set)));
ok('  nor does the operator’s code once the variable is gone', !(await K.codeMatches(subtle, 'open sesame 42', none)));
ok('a variable too short to be a code is ignored', !(await K.codeMatches(subtle, 'abc', { SOCRIA_TAKEOVER_CODE: 'abc' })));
const fp = await K.codeFingerprint(subtle, 'NOT-THE-CODE');
ok('a fingerprint is 64 hex, the same every time', /^[0-9a-f]{64}$/.test(fp) && fp === (await K.codeFingerprint(subtle, 'NOT-THE-CODE')));
const src = read('lib/takeover.ts');
const built = src.match(/const CODE_FINGERPRINT = '([0-9a-f]{64})'/)?.[1];
ok('lib/takeover.ts holds the code only as a fingerprint', !!built && /PBKDF2/.test(src) && /ROUNDS = 300_000/.test(src));
// no word in the campaign's own files is the code: each is fingerprinted and compared
const campaignFiles = [
  'lib/takeover.ts',
  'lib/campaign.ts',
  'lib/campaign/scene.ts',
  'components/campaign/Campaign.tsx',
  'components/campaign/draw.ts',
  'components/campaign/campaign.css',
  'app/api/access/enter/route.ts',
  'middleware.ts',
  'app/page.tsx',
  'docs/TAKEOVER.md',
  'lib/og/campaign-card.tsx',
];
const words = new Set();
for (const f of campaignFiles) for (const w of read(f).match(/[A-Za-z]{6,16}/g) ?? []) words.add(w.toUpperCase());
// each is a PBKDF2 on Node's thread pool: run them side by side, a batch at a time
let leaked = '';
const all = [...words];
for (let i = 0; i < all.length; i += 16) {
  const batch = all.slice(i, i + 16);
  const prints = await Promise.all(batch.map((w) => K.codeFingerprint(subtle, w)));
  prints.forEach((f, j) => {
    if (f === built) leaked = batch[j].slice(0, 2) + '…';
  });
}
ok(`none of the ${words.size} words in the campaign’s files is the code`, !leaked, leaked);
if (process.env.TAKEOVER_TEST_CODE) {
  const c = process.env.TAKEOVER_TEST_CODE;
  ok('the campaign’s code opens it (TAKEOVER_TEST_CODE)', await K.codeMatches(subtle, c, none));
  ok('  typed in lower case, or with spaces round it', (await K.codeMatches(subtle, c.toLowerCase(), none)) && (await K.codeMatches(subtle, ` ${c} `, none)));
  ok('  one letter off does not', !(await K.codeMatches(subtle, c.slice(0, -1) + (c.endsWith('X') ? 'Y' : 'X'), none)));
  ok('  and an operator’s code replaces it', !(await K.codeMatches(subtle, c, set)));
} else {
  console.log('  (TAKEOVER_TEST_CODE not set: the campaign’s own code is not checked here)');
}

console.log('\n=== the entry: made on the server, checked on the edge ===');
const env = { CLERK_SECRET_KEY: 'sk_test_' + 'k'.repeat(24) };
const now = Date.UTC(2026, 9, 29, 12);
const v = await K.issueEntry(subtle, env, now);
ok('an entry is v1.<expiry>.<mac>', /^v1\.\d{13}\.[0-9a-f]{64}$/.test(v ?? ''), v);
ok('  it holds now', await K.entryValid(subtle, env, v, now));
ok('  and on its last day', await K.entryValid(subtle, env, v, now + K.ENTRY_TTL_S * 1000 - 60_000));
ok('  not after it (90 days)', K.ENTRY_TTL_S === 90 * 86400 && !(await K.entryValid(subtle, env, v, now + K.ENTRY_TTL_S * 1000 + 1)));
const [, exp, mac] = v.split('.');
ok('a later expiry, written by hand, is refused', !(await K.entryValid(subtle, env, `v1.${Number(exp) + 86_400_000}.${mac}`, now)));
ok('a changed signature is refused', !(await K.entryValid(subtle, env, `v1.${exp}.${mac.slice(0, -1)}${mac.endsWith('0') ? '1' : '0'}`, now)));
for (const bad of [undefined, null, '', 'v1', 'v1.123.abc', `v2.${exp}.${mac}`, `${v}x`, 'x'.repeat(500)])
  ok(`${JSON.stringify(bad)?.slice(0, 24)} is not an entry`, !(await K.entryValid(subtle, env, bad, now)));
ok('another server’s secret does not accept it', !(await K.entryValid(subtle, { CLERK_SECRET_KEY: 'sk_live_' + 'z'.repeat(24) }, v, now)));
ok('changing the code closes every entry made with the old one', !(await K.entryValid(subtle, { ...env, ...set }, v, now)));
const v2 = await K.issueEntry(subtle, { ...env, ...set }, now);
ok('  and entries made with the new one hold under it, not under the old', (await K.entryValid(subtle, { ...env, ...set }, v2, now)) && !(await K.entryValid(subtle, env, v2, now)));
ok('  (and the first still holds under its own code: keys are not mixed up between calls)', await K.entryValid(subtle, env, v, now));
ok('SOCRIA_TAKEOVER_SECRET, when set, is the secret', K.entrySecret({ SOCRIA_TAKEOVER_SECRET: 's'.repeat(32), CLERK_SECRET_KEY: env.CLERK_SECRET_KEY }) === 's'.repeat(32));
ok('a secret under 16 characters is no secret', K.entrySecret({ CLERK_SECRET_KEY: 'short' }) === null);
ok('with no secret at all nothing can be issued, or accepted', (await K.issueEntry(subtle, {}, now)) === null && !(await K.entryValid(subtle, {}, v, now)));

console.log('\n=== the opening, as numbers ===');
const S = K.Scene;
const T = S.TIMELINE;
ok(`it lasts ${T.settled} s: within 5–7`, T.settled >= 5 && T.settled <= 7);
ok(
  'the chat, then grain, then the wave, then the line, then the field',
  T.typing < T.grain && T.grain < T.dissolve && T.dissolve < T.edges && T.edges < T.title && T.title < T.form && T.form < T.settled
);
for (const [w, hh] of [
  [1440, 900],
  [1920, 1080],
  [1024, 768],
  [390, 844],
  [360, 640],
  [844, 390],
]) {
  const sc = S.buildScene({ w, h: hh });
  const tag = `${w}×${hh}`;
  const cap = w < 600 ? 1300 : 2200;
  ok(
    `${tag}: ${sc.grains.length} grains, ${sc.nodes.length} nodes, ${sc.edges.length} links`,
    sc.grains.length > 200 && sc.grains.length <= cap && sc.nodes.length >= 16 && sc.edges.length >= sc.nodes.length - 1
  );
  const c = sc.chat;
  ok(`${tag}: the chat fits the screen`, c.x >= 0 && c.y >= 0 && c.x + c.w <= w && c.y + c.h <= hh);
  ok(
    `${tag}: every grain starts on the chat`,
    sc.grains.every((g) => g.ox >= c.x - 2 && g.ox <= c.x + c.w + 2 && g.oy >= c.y - 2 && g.oy <= c.y + c.h + 2)
  );
  ok(
    `${tag}: every node is on the screen`,
    sc.nodes.every((n) => n.x > 0 && n.x < w && n.y > 0 && n.y < hh)
  );
  ok(`${tag}: nothing shows before the chat is drawn`, sc.grains.every((g) => S.grainAt(sc, g, 0).alpha === 0) && sc.nodes.every((n) => S.nodeLight(n, 0).alpha === 0));
  ok(`${tag}: the chat is whole, then gone`, S.chatAlpha(1) === 1 && S.chatAlpha(T.dissolve + 0.5) === 0);
  ok(`${tag}: the wave starts at the typing dots`, Math.min(...sc.grains.map((g) => g.release)) < T.dissolve + 0.2 && Math.max(...sc.grains.map((g) => g.release)) <= T.dissolve + T.wave + 0.15);
  const landed = sc.grains.every((g) => {
    const s = S.grainAt(sc, g, T.settled);
    const n = S.nodeAt(sc.nodes[g.node], T.settled);
    return s.alpha < 0.001 && Math.hypot(s.x - n.x, s.y - n.y) < 0.5;
  });
  ok(`${tag}: every grain has landed in its node by ${T.settled} s`, landed);
  ok(`${tag}: every node is lit, every link drawn`, sc.nodes.every((n) => S.nodeLight(n, T.settled).alpha > 0.99) && sc.edges.every((e) => S.edgeGrown(e, T.settled) === 1));
  const seen = new Set([0]);
  const queue = [0];
  while (queue.length) {
    const i = queue.shift();
    for (const e of sc.edges) {
      const j = e.a === i ? e.b : e.b === i ? e.a : -1;
      if (j >= 0 && !seen.has(j)) (seen.add(j), queue.push(j));
    }
  }
  ok(`${tag}: one network — every node reachable`, seen.size === sc.nodes.length);
  let finite = true;
  for (let t = 0; t <= 9; t += 0.25)
    for (const g of sc.grains.slice(0, 300)) {
      const s = S.grainAt(sc, g, t, 40, -30);
      if (![s.x, s.y, s.alpha, s.size].every(Number.isFinite)) finite = false;
    }
  ok(`${tag}: everywhere finite, at every moment, with the pointer leaning`, finite);
  const mid = S.wordsDim(sc, sc.words.x, sc.words.y, T.settled);
  ok(
    `${tag}: the network steps back behind the words (${mid.toFixed(2)} in the middle), not before them`,
    mid < 0.3 && S.wordsDim(sc, sc.words.x, sc.words.y, 1) === 1 && S.wordsDim(sc, 2, 2, T.settled) > 0.95
  );
}
const a1 = JSON.stringify(S.buildScene({ w: 1280, h: 800 }));
ok('the same size makes the same scene', a1 === JSON.stringify(S.buildScene({ w: 1280, h: 800 })));
const sc = S.buildScene({ w: 1440, h: 900 });
ok('signals run only once it has settled', S.signalsAt(sc, T.signals - 0.01).length === 0 && S.signalsAt(sc, 12).length >= 1);
ok(
  '  along real links, from 0 to 1',
  [9, 12.3, 20.7].every((t) => S.signalsAt(sc, t).every((s) => s.edge >= 0 && s.edge < sc.edges.length && s.along >= 0 && s.along <= 1))
);

console.log('\n=== the page says one thing ===');
ok('the line', K.CAMPAIGN_LINE === 'WE KILLED THE CHATBOT.');
const page = renderToStaticMarkup(h(K.Campaign));
const text = page
  .replace(/<[^>]+>/g, '|')
  .split('|')
  .map((s) => s.trim())
  .filter(Boolean);
ok(
  'the headline is the line',
  /<h1 class="wk-title">.*<\/h1>/.test(page) &&
    page
      .match(/<h1[^>]*>(.*?)<\/h1>/)[1]
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim() === K.CAMPAIGN_LINE
);
ok(
  'beneath it, a field and Enter, and the way onto the waitlist — nothing else said',
  JSON.stringify(text) === JSON.stringify(['WE KILLED', 'THE CHATBOT.', 'Access code', 'Enter', 'No code? Join the waitlist']),
  JSON.stringify(text)
);
ok(
  'the field is labelled, posts the code to the server, and works as a plain form',
  /<form[^>]*method="post"[^>]*action="\/api\/access\/enter"/.test(page) &&
    /<label class="wk-sr" for="wk-code">/.test(page) &&
    /<input[^>]*name="code"/.test(page) &&
    /<button type="submit"[^>]*>Enter<\/button>/.test(page)
);
ok(
  'typed in capitals on a phone, never corrected or remembered',
  /autoCapitalize="characters"|autocapitalize="characters"/.test(page) && /autoComplete="off"|autocomplete="off"/.test(page) && /spellCheck="false"|spellcheck="false"/.test(page)
);
ok('the animation is decoration to a screen reader', /<canvas[^>]*aria-hidden="true"/.test(page));
ok('a miss is said quietly, in a live region under the field', /id="wk-error"[^>]*role="status"|role="status"[^>]*id="wk-error"/.test(page) && /aria-live="polite"/.test(page));
for (const [s, want] of [
  [400, /isn’t right/],
  [429, /Wait a minute/],
  [503, /closed/],
  [null, /Try again/],
])
  ok(`a ${s ?? 'network'} miss: “${K.enterError(s)}”`, want.test(K.enterError(s)) && K.enterError(s).length < 40);

console.log('\n=== the waitlist ===');
for (const [raw, want] of [
  ['Ada@Example.com', 'ada@example.com'],
  ['  ada.l+mav@uta.edu ', 'ada.l+mav@uta.edu'],
  ['not an email', null],
  ['a@b', null],
  ['', null],
  [42, null],
  ['x'.repeat(250) + '@e.com', null],
])
  ok(`${JSON.stringify(raw).slice(0, 30)} → ${want}`, K.cleanEmail(raw) === want);
ok('an address is its own object name, and comes back from it', K.emailFrom(K.nameFor('ada.l+mav@uta.edu')) === 'ada.l+mav@uta.edu' && /^[A-Za-z0-9_-]+$/.test(K.nameFor('ada.l+mav@uta.edu')));
ok('the same address twice is the same name (kept once)', K.nameFor(K.cleanEmail('ADA@example.com')) === K.nameFor(K.cleanEmail('ada@example.com ')));
ok('a name that is not an address reads as nothing', K.emailFrom('!!!') === null && K.emailFrom(K.nameFor('nope')) === null);
ok('the waitlist route is open, and its export never asks for the code (it has its own gate)', K.decide('/api/waitlist', false).do === 'next' && K.decide('/api/waitlist/export', false).do === 'next');
const ex = read('app/api/waitlist/export/route.ts');
ok(
  'the export is the dashboard’s to open: a named admin or its pass, else a 404',
  /mayViewDashboard\(await viewer\(\)\) \|\| holds\('pass'/.test(ex) && /status: 404/.test(ex) && /filename="waitlist.txt"/.test(ex)
);
ok('the list is kept in a private bucket', /createBucket\(WAITLIST_BUCKET, \{ public: false \}\)/.test(read('lib/waitlist.ts')));

console.log('\n=== wired in ===');
const mw = read('middleware.ts');
ok(
  'the middleware asks lib/takeover on every request, under Clerk',
  /from '@\/lib\/takeover'/.test(mw) && /clerkMiddleware\(\(_auth, req\) => takeover\(req\)\)/.test(mw) && /\(await takeover\(req\)\) \?\? NextResponse\.next\(\)/.test(mw)
);
ok('  off is off', /if \(!takeoverOn\(env\)\) return undefined;/.test(mw));
ok(
  '  the campaign at the same address; a temporary redirect; a 403 for thinking',
  /NextResponse\.rewrite\(new URL\('\/', req\.url\)\)/.test(mw) && /NextResponse\.redirect\(new URL\(d\.to, req\.url\), 307\)/.test(mw) && /status: 403/.test(mw)
);
ok('  and the cookie only where it matters', /needsEntry\(path\) && \(await entryValid\(crypto\.subtle/.test(mw));
const pg = read('app/page.tsx');
ok('the homepage is the campaign while it runs, the landing otherwise', /const TAKEOVER = takeoverOn\(\);/.test(pg) && /if \(TAKEOVER\) return <Campaign \/>;/.test(pg) && /<Landing \/>/.test(pg));
ok('  named for search and shares by the line alone, with its own card', /title: CAMPAIGN_LINE, absolute: true, description: CAMPAIGN_LINE, og: 'campaign'/.test(pg));
ok('  black to the edges of a phone', /themeColor: '#000000'/.test(pg));
const en = read('app/api/access/enter/route.ts');
ok(
  'the code is taken by a rate-limited route that answers with an httpOnly cookie',
  /enforceRateLimit\(req, signedIn\(\), 'enter'\)/.test(en) &&
    /codeMatches\(subtle, typed, env\)/.test(en) &&
    /httpOnly: true/.test(en) &&
    /sameSite: 'lax'/.test(en) &&
    /maxAge: ENTRY_TTL_S|ENTRY_TTL_S\)/.test(en)
);
ok('  and is not there when the campaign is off', /if \(!takeoverOn\(env\)\) return NextResponse\.json\(\{ ok: false \}, \{ status: 404 \}\);/.test(en));
ok('the rate limit is generous enough for a room on one Wi-Fi', /enter: \{ authed: \{ minute: 60, day: 2000 \}, anon: \{ minute: 60, day: 2000 \} \}/.test(read('lib/rate-limit.ts')));
ok('the link-preview card has the campaign’s own', /if \(key\.length === 1 && key\[0\] === 'campaign'\) return renderCampaignCard\(\);/.test(read('app/og/[...key]/route.tsx')));

console.log('\n=== the gate stays on the server ===');
const files = [];
(function walk(dir) {
  for (const e of readdirSync(dir)) {
    if (['node_modules', '.next', '.git', '.tmp', '.journeys', 'ds-bundle'].includes(e)) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(e)) files.push(p);
  }
})(root);
const clientSide = files.filter((f) => /^['"]use client['"];/m.test(readFileSync(f, 'utf8')));
const importsGate = (f) => /from '@\/lib\/takeover'|from '\.\.?\/(?:\.\.\/)*(?:lib\/)?takeover'/.test(readFileSync(f, 'utf8'));
ok(
  `no client component imports lib/takeover (${clientSide.length} checked)`,
  !clientSide.some(importsGate),
  clientSide
    .filter(importsGate)
    .map((f) => relative(root, f))
    .join(', ')
);
ok(
  'nor do the modules the page imports',
  !/takeover/.test(read('lib/campaign.ts').replace(/\/\/.*$/gm, '')) && !/from '.*takeover'/.test(read('lib/campaign/scene.ts')) && !/from '.*takeover'/.test(read('components/campaign/draw.ts'))
);
ok('the decision is documented, with how to end it', existsSync(join(root, 'docs/TAKEOVER.md')) && /SOCRIA_TAKEOVER=off/.test(read('docs/TAKEOVER.md')));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
