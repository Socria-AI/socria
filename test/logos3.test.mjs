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
      ok(`offered on ${env}`, isOffered('logos-3') && offeredModels().includes('logos-3'));
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
  ok('the bar is in the header', /\{collab && <CollabBar room=\{room\} \/>\}/.test(app));
  ok('a sent turn is stamped and broadcast, in the room only', /const sent = inShared \? roomRef\.current\.onLocalMessage\(turn\) : turn;/.test(app));
  ok('the map is attributed before it is shown', /roomRef\.current\.onLocalMap\(/.test(app));
  ok('a shared room is never saved to one account', /if \(roomRef\.current\?\.active \|\| sharedIdsRef\.current\.has\(s\.id\)\) return;/.test(app));
  ok('the private understanding pass never reads one', /!sharedIdsRef\.current\.has\(sid\)/.test(app));
  ok('Socria is told the two names, only in the room', /inShared && roomRef\.current\.people\.length >= 2/.test(app));
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
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
