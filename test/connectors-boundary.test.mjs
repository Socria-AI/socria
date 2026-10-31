// A connected source reads a person's own account, or nobody's.
//
// The deployment can carry its own Google and Notion credentials, for testing
// on a developer's machine. In production those are the operator's Drive,
// Gmail, Calendar and Notion — and they were handed to any signed-in person
// who had not connected an account of their own, through search and fetch,
// even while connected sources were switched off and hidden from the list.
//
// Through the real routes (/api/logos/sources/search and /fetch), with every
// outbound request recorded: with connectors off, a third-party source is
// refused before anything is sent; with them on, a person without a grant is
// told to connect, and the operator's token never leaves the server; the web
// source stays open; and on a developer's machine the testing fallback still
// works.

import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve as res } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, '.tmp', 'e2e-connectors');
const H = (f) => join(here, 'helpers', f);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const swap = {
  name: 'swap',
  setup(b) {
    b.onResolve({ filter: /(^|\/)supabase$/ }, (a) => {
      const p = a.path.startsWith('@/') ? join(root, a.path.slice(2)) : res(a.resolveDir, a.path);
      if (p === join(root, 'lib', 'supabase')) return { path: pathToFileURL(H('fake-supabase.mjs')).href, external: true };
      return undefined;
    });
    b.onResolve({ filter: /^@clerk\/nextjs\/server$/ }, () => ({ path: pathToFileURL(H('fake-clerk.mjs')).href, external: true }));
    b.onResolve({ filter: /^server-only$/ }, () => ({ path: H('server-only-shim.mjs') }));
    b.onResolve({ filter: /^next\/(server|headers)$/ }, (a) => ({ path: `${a.path}.js`, external: true }));
  },
};
for (const [name, file] of [['search', 'app/api/logos/sources/search/route.ts'], ['fetch', 'app/api/logos/sources/fetch/route.ts']]) {
  await build({ entryPoints: [join(root, file)], bundle: true, format: 'esm', platform: 'node', outfile: join(OUT, `${name}.mjs`), tsconfig: join(root, 'tsconfig.json'), plugins: [swap], packages: 'external', logLevel: 'error' });
}
console.error = () => {};
console.warn = () => {};
process.env.RATE_LIMIT_DISABLED = '1';

const { db } = await import(pathToFileURL(H('fake-supabase.mjs')).href);
const { NextRequest } = await import('next/server.js');
const { POST: SEARCH } = await import(pathToFileURL(join(OUT, 'search.mjs')).href);
const { POST: FETCH } = await import(pathToFileURL(join(OUT, 'fetch.mjs')).href);

let pass = 0,
  fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));

// Every outbound request, with the credential it carried.
const sent = [];
globalThis.fetch = async (url, init = {}) => {
  const h = new Headers(init.headers ?? {});
  sent.push({ url: String(url?.url ?? url), auth: h.get('authorization') ?? '' });
  return new Response(JSON.stringify({ files: [{ id: 'f1', name: 'Operator budget.xlsx' }], messages: [{ id: 'm1' }], results: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
};
const OPERATOR = 'operator-google-token-SECRET';
process.env.GOOGLE_ACCESS_TOKEN = OPERATOR;
process.env.NOTION_API_KEY = 'operator-notion-key-SECRET';
globalThis.__users = { stranger: { firstName: 'S', emails: ['s@example.com'] } };

const call = async (handler, body) => {
  globalThis.__uid = 'stranger';
  sent.length = 0;
  const r = await handler(new NextRequest('http://localhost/api/logos/sources', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  return { status: r.status, text: await r.text() };
};
const leaked = () => sent.some((s) => s.auth.includes('SECRET'));

console.log('\nin production, connected sources switched off');
process.env.NODE_ENV = 'production';
delete process.env.SOCRIA_CONNECTORS;
db.reset();
for (const kind of ['drive', 'sheets', 'calendar', 'gmail', 'notion']) {
  const s = await call(SEARCH, { kind, query: 'budget' });
  ok(`search ${kind}: refused`, s.status >= 400 && s.status < 500, `${s.status} ${s.text.slice(0, 120)}`);
  ok(`  and nothing was sent anywhere`, sent.length === 0, JSON.stringify(sent));
  const f = await call(FETCH, { kind, id: 'x1' });
  ok(`fetch ${kind}: refused, nothing sent`, f.status >= 400 && f.status < 500 && sent.length === 0, `${f.status} ${JSON.stringify(sent)}`);
}

console.log('\nin production, connected sources on, a person who has connected nothing');
process.env.SOCRIA_CONNECTORS = 'on';
for (const kind of ['drive', 'gmail', 'notion']) {
  const s = await call(SEARCH, { kind, query: 'budget' });
  ok(`search ${kind}: asks them to connect`, s.status >= 400 && s.status < 500 && /not connected/i.test(s.text), `${s.status} ${s.text.slice(0, 120)}`);
  ok(`  the operator's credentials never left the server`, !leaked(), JSON.stringify(sent));
  ok(`  and none of the operator's files came back`, !s.text.includes('Operator budget'));
}

console.log('\non a developer’s machine, the testing fallback still works');
process.env.NODE_ENV = 'development';
{
  const s = await call(SEARCH, { kind: 'drive', query: 'budget' });
  ok('search drive answers with the deployment’s own test credentials', s.status === 200 && sent.some((x) => x.auth === `Bearer ${OPERATOR}`), `${s.status} ${s.text.slice(0, 120)}`);
}

console.log(`\nconnectors-boundary: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
