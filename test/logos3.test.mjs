// Logos 3 — Logos 2 with the room back in it.
//
// The room was parked for the production cut (docs/LOGOS-ROOMS-PARKED.md).
// This holds the wiring that brought it back: a model that is offered on dev
// and preview and nowhere else, routes that are on by default only off
// production, the LogosApp guards that keep one person's words out of the
// other's account, and the chat route answering as the layer between two
// people — driven through the real route with the model scripted.

import { build } from 'esbuild';
import { mkdirSync, rmSync, readFileSync } from 'node:fs';
import { dirname, join, resolve as res } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SOCRIA_MODELS } from './.tmp/socria-prompt.mjs';
import { isOffered, offeredModels, withdrawnTo } from './.tmp/socria-model-store.mjs';
import { roomsEnabled } from './.tmp/rooms-flag.mjs';
import { joinUrl, joinCodeFrom } from './.tmp/collab.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

const withEnv = (vars, fn) => {
  const keep = {};
  for (const k of Object.keys(vars)) { keep[k] = process.env[k]; if (vars[k] === undefined) delete process.env[k]; else process.env[k] = vars[k]; }
  try { return fn(); } finally { for (const k of Object.keys(keep)) { if (keep[k] === undefined) delete process.env[k]; else process.env[k] = keep[k]; } }
};

console.log('=== the model ===');
{
  const m = SOCRIA_MODELS['logos-3'];
  ok('Logos 3 is registered', !!m && m.short === 'Logos 3');
  ok('  as a Logos surface with the room in it', m.logosSurface && m.collab);
  ok('  that needs an account and has no depth modes', m.requiresAuth && m.supportsDepth === false);
  ok('  and says what it is for', /Think together/.test(m.description));
  ok('Logos 2 stays single-player', !SOCRIA_MODELS['logos-2'].collab);
}

console.log('\n=== offered everywhere, production included ===');
{
  for (const env of ['production', 'preview']) {
    withEnv({ NEXT_PUBLIC_VERCEL_ENV: env, VERCEL_ENV: env }, () => {
      // On production it opens with its access code (Manage Account → Access
      // code, test/feature-gates.test.mjs); everywhere else it is simply there.
      if (env === 'production') {
        ok('on production, hidden until its access code is entered', !isOffered('logos-3', []) && isOffered('logos-3', ['logos3']));
      } else {
        ok(`offered on ${env}`, isOffered('logos-3', []) && offeredModels([]).includes('logos-3'));
      }
    });
  }
  ok('it is not marked dev-only any more', !SOCRIA_MODELS['logos-3'].devOnly);
  ok('/chat opens a ?model= link by the same rule as the menus', /isOffered\(m as SocriaModel\)/.test(read('app/chat/page.tsx')));
  // The mechanism stays, for the next model that needs it.
  ok('a dev-only model would still be held back on production', /!\(m\.devOnly && isProduction\(\)\)/.test(read('lib/socria-model-store.ts')));
}

console.log('\n=== the room switch ===');
{
  withEnv({ LOGOS_ROOMS: undefined, NEXT_PUBLIC_VERCEL_ENV: 'production', VERCEL_ENV: 'production' }, () => ok('on by default on production', roomsEnabled()));
  withEnv({ LOGOS_ROOMS: undefined, NEXT_PUBLIC_VERCEL_ENV: 'preview', VERCEL_ENV: 'preview' }, () => ok('on by default on dev', roomsEnabled()));
  withEnv({ LOGOS_ROOMS: 'off', NEXT_PUBLIC_VERCEL_ENV: 'production', VERCEL_ENV: 'production' }, () => ok('LOGOS_ROOMS=off turns it off, anywhere', !roomsEnabled()));
  for (const r of ['app/api/logos/room/route.ts', 'app/api/logos/room/join/route.ts', 'app/api/logos/room/leave/route.ts', 'app/api/logos/room/events/route.ts']) {
    const src = read(r);
    ok(`${r.split('/').slice(-2).join('/')} answers only behind the switch`, /roomsEnabled\(\)/.test(src));
    ok(`  and only to a signed-in person`, /const \{ userId \} = auth\(\);/.test(src) && /Unauthorized/.test(src));
  }
}

console.log('\n=== the invite ===');
{
  const u = joinUrl('https://dev.socria.app', 'ABCDEFGH');
  ok('the link opens Logos 3', u === 'https://dev.socria.app/chat?model=logos-3&join=ABCDEFGH', u);
  ok('  and its code reads back', joinCodeFrom(new URL(u).search) === 'ABCDEFGH');
}

console.log('\n=== the surface ===');
{
  const app = read('components/LogosApp.tsx');
  ok('the room is on exactly when the model says so', /const collab = !!SOCRIA_MODELS\[model\]\?\.collab;/.test(app) && /enabled: collab,/.test(app));
  // Think Together is now begun from Share (docs/SHARING.md); a room joined by
  // its old code keeps its own bar in the header.
  ok('the bar is in the header while a room is live; Share otherwise', /collab && room\.active \? \(\s*<CollabBar room=\{room\} \/>/.test(app) && /setShareOpen\(true\)/.test(app));
  ok('a sent turn is stamped and broadcast, in the room only', /if \(roomRef\.current\.active && sharedIdsRef\.current\.has\(activeIdRef\.current \?\? ''\)\) \{[\s\S]{0,200}return roomRef\.current\.onLocalMessage\(turn\);/.test(app) && /const sent = postTurn\(turn, group\);/.test(app));
  ok('the map is attributed before it is shown', /roomRef\.current\.onLocalMap\(/.test(app));
  ok('a shared room is never saved to one account', /if \(roomRef\.current\?\.active \|\| sharedIdsRef\.current\.has\(s\.id\)\) return;/.test(app));
  ok('the private understanding pass never reads one', /!sharedIdsRef\.current\.has\(sid\)/.test(app));
  ok('Socria is told the names only when others are here — a room, or a shared line of thinking', /const people = inShared\s*\? roomRef\.current\.people/.test(app) && /\.\.\.\(people\.length >= 2 \? \{ collab: \{ people \} \} : \{\}\)/.test(app));
  ok('the picker calls it what it is', /m\.collab \? 'think together' : 'a different surface'/.test(read('components/ModelPicker.tsx')));
}

console.log('\n=== Socria, between two people (the real chat route) ===');
{
  const OUT = join(here, '.tmp', 'e2e-logos3');
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const FAKE_DB = join(here, 'helpers', 'fake-supabase.mjs');
  const swap = { name: 'swap', setup(b) {
    b.onResolve({ filter: /(^|\/)supabase$/ }, (a) => {
      const p = a.path.startsWith('@/') ? join(root, a.path.slice(2)) : res(a.resolveDir, a.path);
      if (p === join(root, 'lib', 'supabase')) return { path: pathToFileURL(FAKE_DB).href, external: true };
      return undefined;
    });
    b.onResolve({ filter: /^@clerk\/nextjs\/server$/ }, () => ({ path: pathToFileURL(join(here, 'helpers', 'fake-clerk.mjs')).href, external: true }));
    b.onResolve({ filter: /^openai$/ }, () => ({ path: pathToFileURL(join(here, 'helpers', 'fake-openai-logos.mjs')).href, external: true }));
    b.onResolve({ filter: /^server-only$/ }, () => ({ path: join(here, 'helpers', 'server-only-shim.mjs') }));
    b.onResolve({ filter: /^next\/(server|headers)$/ }, (a) => ({ path: `${a.path}.js`, external: true }));
  } };
  await build({ entryPoints: [join(root, 'app/api/logos/chat/route.ts')], bundle: true, format: 'esm', platform: 'node',
    outfile: join(OUT, 'chat.mjs'), tsconfig: join(root, 'tsconfig.json'), plugins: [swap],
    external: ['next', 'next/*', 'undici', '@supabase/*', 'stripe', 'resend'], logLevel: 'error' });
  const quiet = (orig) => (...a) => { if (typeof a[0] === 'string' && /^\[(logos|socria)/.test(a[0])) return; orig(...a); };
  console.warn = quiet(console.warn.bind(console)); console.error = quiet(console.error.bind(console));
  process.env.OPENAI_API_KEY = 'test'; process.env.RATE_LIMIT_DISABLED = '1'; globalThis.__uid = 'user_logos3';
  const chat = await import(pathToFileURL(join(OUT, 'chat.mjs')).href);
  const { NextRequest } = await import('next/server.js');
  const turn = async (body) => {
    globalThis.__logosCalls = []; globalThis.__logosPrompts = []; globalThis.__logosReply = 'Noted.';
    const r = await chat.POST(new NextRequest('http://localhost/api/logos/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
    try { await r.text(); } catch {}
    const call = globalThis.__logosCalls.find((c) => c.stream);
    return { status: r.status, system: String(call?.messages?.[0]?.content ?? ''), msgs: call?.messages?.slice(1) ?? [] };
  };
  const messages = [
    { role: 'user', content: 'We should launch in March.', by: { id: 'u1', name: 'Ana', seat: 'host' } },
    { role: 'assistant', content: 'What makes March the month?' },
    { role: 'user', content: 'March is too early, the pricing is not settled.', by: { id: 'u2', name: 'Ben', seat: 'guest' } },
  ];
  const two = await turn({ messages, collab: { people: [{ name: 'Ana', seat: 'host' }, { name: 'Ben', seat: 'guest' }] } });
  ok('the route answers a room', two.status === 200, String(two.status));
  ok('Socria is told two people are thinking together, by name', /TWO PEOPLE ARE THINKING HERE TOGETHER: Ana and Ben/.test(two.system));
  ok('  and never to take a side', /Never take a side/.test(two.system));
  ok('each person’s line is signed with their name', two.msgs.some((m) => m.content === 'Ana: We should launch in March.') && two.msgs.some((m) => /^Ben: March is too early/.test(m.content)), JSON.stringify(two.msgs));
  const alone = await turn({ messages: [{ role: 'user', content: 'We should launch in March.' }] });
  ok('alone, nothing about a room reaches Socria', !/THINKING HERE TOGETHER/.test(alone.system) && alone.msgs[0]?.content === 'We should launch in March.');
  const spoof = await turn({ messages, collab: { people: [{ name: 'Ana', seat: 'host' }] } });
  ok('one name is not a room', !/THINKING HERE TOGETHER/.test(spoof.system) && !spoof.msgs.some((m) => /^Ana: /.test(m.content)));

  // ── Think Together: who asked, what a reply answers, and whose memory ──
  const people3 = [{ name: 'Ana', seat: 'host' }, { name: 'Ben', seat: 'guest' }, { name: 'Cy', seat: 'guest' }];
  const asked = [
    ...messages,
    { role: 'user', content: '@socria which of us is assuming more?', by: { id: 'u3', name: 'Cy', seat: 'guest' } },
  ];
  const group = await turn({ messages: asked, collab: { people: people3 }, addressed: { name: 'Cy', how: 'mention' } });
  ok('a shared line of thinking with three people names all three', /3 PEOPLE ARE THINKING HERE TOGETHER: Ana, Ben and Cy/.test(group.system), group.system.slice(-900));
  ok('asked directly, Socria is told to answer that person', /THIS MESSAGE IS FOR YOU\. Cy asked you directly \(with @socria\)\. Answer Cy/.test(group.system));
  ok('  and the asker\'s line reaches it under their name', group.msgs.some((m) => m.content === 'Cy: @socria which of us is assuming more?'));
  const aloneAsk = await turn({ messages: [{ role: 'user', content: 'hi' }], addressed: { name: 'Cy', how: 'mention' } });
  ok('"asked directly" means nothing alone — it is never taken from a request with one person', !/THIS MESSAGE IS FOR YOU/.test(aloneAsk.system));
  const replied = await turn({
    messages: [
      { role: 'user', content: 'Plan my week.' },
      { role: 'assistant', content: 'Start with the rent, then the commute.' },
      { role: 'user', content: 'Why that order?', replyTo: { id: 'm_abcdef12', role: 'assistant', who: 'Socria', excerpt: 'Start with the rent,\nthen the commute.' } },
    ],
  });
  const last = replied.msgs[replied.msgs.length - 1]?.content ?? '';
  ok('a reply reaches the model with one quoted line saying what it answers — alone too', /^\[Replying to your earlier message: “Start with the rent, then the commute\.”\]\nWhy that order\?$/.test(last), JSON.stringify(last));
  const forgedQuote = await turn({ messages: [{ role: 'assistant', content: 'x', replyTo: { role: 'user', who: 'A', excerpt: 'b' } }, { role: 'user', content: 'y' }] });
  ok('  and only on a person\'s turn — Socria\'s own carry none', !forgedQuote.msgs.some((m) => /\[Replying to/.test(m.content)));
  const now = Date.now();
  // a memory about exactly what is being discussed, so it would be chosen if it were allowed
  const understanding = { entries: [{ id: 'mem_private1', kind: 'decision', text: 'PRIVATELY decided to launch in March regardless', firstSeen: now, lastSeen: now, seen: 3, confidence: 'stated' }], updatedAt: now };
  const solo = await turn({ messages: [{ role: 'user', content: 'We should launch in March.' }], understanding });
  ok('(control: alone, that memory does reach the prompt)', /PRIVATELY decided to launch in March/.test(solo.system), solo.system.slice(-700));
  const withMemory = await turn({ messages, collab: { people: [{ name: 'Ana', seat: 'host' }, { name: 'Ben', seat: 'guest' }] }, understanding });
  ok('what Socria knows about one person never reaches an answer the others will read', !/PRIVATELY decided to launch in March/.test(withMemory.system));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
