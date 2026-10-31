// What a single request can make Socria send to the model is bounded.
//
// Only the newest message was checked for length; every earlier "turn" in the
// request went to the model as sent. So one request — from a guest, too —
// could carry a megabyte of invented history into a paid call. (Security
// audit: SEC-2.) Through the real Logos route with a scripted model: earlier
// turns are clipped, the window is held to a total, a request with more turns
// than any conversation holds is refused, and an ordinary conversation is
// sent exactly as before.

import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve as res } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, '.tmp', 'e2e-request-bounds');
const H = (f) => join(here, 'helpers', f);
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  entryPoints: [join(root, 'app/api/logos/chat/route.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: join(OUT, 'chat.mjs'),
  tsconfig: join(root, 'tsconfig.json'),
  plugins: [
    {
      name: 'swap',
      setup(b) {
        b.onResolve({ filter: /(^|\/)supabase$/ }, (a) => {
          const p = a.path.startsWith('@/') ? join(root, a.path.slice(2)) : res(a.resolveDir, a.path);
          if (p === join(root, 'lib', 'supabase')) return { path: pathToFileURL(H('fake-supabase.mjs')).href, external: true };
          return undefined;
        });
        b.onResolve({ filter: /^@clerk\/nextjs\/server$/ }, () => ({ path: pathToFileURL(H('fake-clerk.mjs')).href, external: true }));
        b.onResolve({ filter: /^openai$/ }, () => ({ path: pathToFileURL(H('fake-openai-logos.mjs')).href, external: true }));
        b.onResolve({ filter: /^server-only$/ }, () => ({ path: H('server-only-shim.mjs') }));
        b.onResolve({ filter: /^next\/(server|headers)$/ }, (a) => ({ path: `${a.path}.js`, external: true }));
      },
    },
  ],
  external: ['next', 'next/*', 'undici', '@supabase/*', 'stripe', 'resend'],
  logLevel: 'error',
});
console.info = () => {};
console.warn = () => {};
console.error = () => {};
process.env.OPENAI_API_KEY = 'test';
process.env.RATE_LIMIT_DISABLED = '1';
const { db } = await import(pathToFileURL(H('fake-supabase.mjs')).href);
const chat = await import(pathToFileURL(join(OUT, 'chat.mjs')).href);
const { NextRequest } = await import('next/server.js');

let pass = 0,
  fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 300))));
db.reset();
globalThis.__uid = 'rb_user';
globalThis.__users = { rb_user: { firstName: 'R', emails: ['r@example.com'] } };
const U = (content) => ({ role: 'user', content });
const A = (content) => ({ role: 'assistant', content });
let n = 0;
async function turn(messages) {
  globalThis.__logosCalls = [];
  globalThis.__logosReply = 'Noted.';
  globalThis.__logosScript = [];
  const r = await chat.POST(new NextRequest('http://localhost/api/logos/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ surface: 'logos5', sessionId: `rb_${++n}`, messages }) }));
  await r.text().catch(() => '');
  const sent = (globalThis.__logosCalls ?? []).find((c) => c.stream);
  const chars = (sent?.messages ?? []).filter((m) => m.role !== 'system').reduce((t, m) => t + String(m.content ?? '').length, 0);
  return { status: r.status, sent, chars };
}

console.log('\nan ordinary conversation is sent as it was');
{
  const t = await turn([U('Should I take the job in Austin?'), A('What would you be leaving?'), U('My friends, mostly.')]);
  ok('200, and every turn reaches the model whole', t.status === 200 && t.sent?.messages.some((m) => String(m.content).includes('What would you be leaving?')), t.status);
}

console.log('\ninvented history does not reach the model at full size');
{
  const huge = 'x'.repeat(1_000_000);
  const t = await turn([U(huge), A(huge), U('So what do you think?')]);
  ok('answered (the newest message is ordinary)', t.status === 200, t.status);
  ok('  and a megabyte of earlier turns is clipped, not sent', t.chars < 60_000, `${t.chars} characters of conversation sent`);
  const many = await turn(Array.from({ length: 20 }, (_, i) => (i % 2 ? A('y'.repeat(30_000)) : U('z'.repeat(12_000)))).concat([U('And now?')]));
  ok('the window as a whole is held to its total', many.status === 200 && many.chars <= 160_000 + 20_000, `${many.chars} characters`);
}

console.log('\nmore turns than any conversation holds are refused');
{
  const t = await turn(Array.from({ length: 401 }, (_, i) => (i % 2 ? A('ok') : U('hi'))));
  ok('413, and the model is never asked', t.status === 413 && !t.sent, String(t.status));
}

console.log(`\nrequest-bounds: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
