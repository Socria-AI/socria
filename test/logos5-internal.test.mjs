// The internal architecture page (app/logos-5-internal): every section its
// contents promise is there, it has one heading, and it stays out of search —
// never indexed, disallowed in robots, absent from the sitemap, linked from
// no other page. And it is behind the new Socria's access code: without a
// pass nothing of it renders, and only that code earns one
// (lib/internal-pass.ts, app/api/logos-5-internal/route.ts).

import { build } from 'esbuild';
import { mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve as res } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, '.tmp', 'logos5-internal');
mkdirSync(OUT, { recursive: true });

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

const FAKE_CLERK = join(here, 'helpers', 'fake-clerk.mjs');
const SHIM = join(here, 'helpers', 'server-only-shim.mjs');
const swap = {
  name: 'swap',
  setup(b) {
    b.onResolve({ filter: /^@clerk\/nextjs\/server$/ }, () => ({ path: pathToFileURL(FAKE_CLERK).href, external: true }));
    b.onResolve({ filter: /^server-only$/ }, () => ({ path: SHIM }));
    b.onResolve({ filter: /^next\/server$/ }, (a) => ({ path: `${a.path}.js`, external: true }));
    // cookies() needs a live request: under test the request's cookies are
    // globalThis.__cookies. The code form's useRouter needs a mounted router.
    b.onResolve({ filter: /^next\/(headers|navigation)$/ }, (a) => ({ path: a.path, namespace: 'shim' }));
    b.onLoad({ filter: /.*/, namespace: 'shim' }, (a) => ({
      contents:
        a.path === 'next/headers'
          ? 'export function cookies() { const c = globalThis.__cookies ?? {}; return { get: (n) => (n in c ? { name: n, value: c[n] } : undefined) }; }'
          : 'export const useRouter = () => ({ refresh() {}, push() {}, replace() {} });',
      loader: 'js',
      resolveDir: root,
    }));
  },
};
await Promise.all(
  Object.entries({ architecture: 'app/logos-5-internal/Architecture.tsx', page: 'app/logos-5-internal/page.tsx', code: 'app/api/logos-5-internal/route.ts' }).map(([name, file]) =>
    build({
      entryPoints: [join(root, file)],
      bundle: true, format: 'esm', platform: 'node', outfile: join(OUT, `${name}.mjs`),
      tsconfig: join(root, 'tsconfig.json'), jsx: 'automatic', loader: { '.css': 'empty' },
      plugins: [swap],
      external: ['next', 'next/*', 'react', 'react/*', 'react-dom', 'react-dom/*', '@upstash/*'],
      logLevel: 'error',
    })
  )
);
for (const k of ['RATE_LIMIT_DISABLED', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'NEW_SOCRIA_ACCESS_CODE']) delete process.env[k];
process.env.CLERK_SECRET_KEY = 'sk_test_logos5_internal';
const { Architecture } = await import(pathToFileURL(join(OUT, 'architecture.mjs')).href);
const Page = await import(pathToFileURL(join(OUT, 'page.mjs')).href);
const codeRoute = await import(pathToFileURL(join(OUT, 'code.mjs')).href);
const { NextRequest } = await import('next/server.js');
const html = renderToStaticMarkup(h(Architecture));

const tocIds = [...html.matchAll(/<a href="#([a-z-]+)"/g)].map((m) => m[1]);
const sectionIds = [...html.matchAll(/<section[^>]* id="([a-z-]+)"/g)].map((m) => m[1]);
ok('the contents list sixteen sections', tocIds.length === 16, tocIds.length);
ok('  and every one of them is on the page, in order', JSON.stringify(tocIds) === JSON.stringify(sectionIds), JSON.stringify({ tocIds, sectionIds }));
ok('one h1', (html.match(/<h1[\s>]/g) ?? []).length === 1);
ok('every figure has a caption, and every diagram a name', (html.match(/<figure/g) ?? []).length === (html.match(/<figcaption/g) ?? []).length && (html.match(/<figure/g) ?? []).length >= 7);
ok('it says MR is on by default, as the code does', /on by default/.test(html) && /LOGOS_MR=off/.test(html));

ok('never indexed', Page.metadata?.robots?.index === false && Page.metadata?.robots?.follow === false, JSON.stringify(Page.metadata?.robots));
ok('read fresh on every request', Page.dynamic === 'force-dynamic' && Page.revalidate === 0);

// ── the access code ──
const PASS = 'socria_l5i_pass';
const visit = (cookies = {}) => {
  globalThis.__cookies = cookies;
  return renderToStaticMarkup(Page.default());
};
const isForm = (v) => v.includes('id="l5i-code"') && !v.includes('How Logos 5 works') && !v.includes('<section');
let host = 10;
const tryCode = (code, ip = `192.0.2.${host++}`) =>
  codeRoute.POST(new NextRequest('http://localhost/api/logos-5-internal', { method: 'POST', body: JSON.stringify({ code }), headers: { 'content-type': 'application/json', 'x-forwarded-for': ip } }));
const passOf = (r) => r.cookies.get(PASS);

ok('no pass: the code form, and nothing of the page', isForm(visit()));
// test values only: the real code is kept as a fingerprint, and never in this public repository
process.env.NEW_SOCRIA_ACCESS_CODE = 'l5i test code';
let r = await tryCode('not the code');
ok('a wrong code: a 400 and no pass', r.status === 400 && !passOf(r)?.value);
ok('an empty body: the same 400', (await codeRoute.POST(new NextRequest('http://localhost/api/logos-5-internal', { method: 'POST', body: 'nope', headers: { 'x-forwarded-for': '192.0.2.250' } }))).status === 400);
r = await tryCode('L5I TEST CODE');
const given = passOf(r);
ok('the new Socria code: a pass', r.status === 200 && !!given?.value);
ok('  httpOnly, kept to this page, lax', given?.httpOnly === true && given?.path === '/logos-5-internal' && given?.sameSite === 'lax', JSON.stringify(given));
ok('  typed any case, with or without spaces', (await tryCode('l5itestcode')).status === 200);
const page2 = visit({ [PASS]: given.value });
ok('with the pass: the page', !isForm(page2) && page2.includes('How Logos 5 works') && (page2.match(/<section/g) ?? []).length === 16);
const [kind, until, sig] = given.value.split('.');
ok('a pass with its end moved is refused', isForm(visit({ [PASS]: `${kind}.${Number(until) + 1}.${sig}` })));
ok('a made-up pass is refused', isForm(visit({ [PASS]: `l5i.${Date.now() + 1e9}.AAAA` })));
ok('a pass that has run out is refused', isForm(visit({ [PASS]: `l5i.${Date.now() - 1}.${sig}` })));
process.env.NEW_SOCRIA_ACCESS_CODE = 'another test code';
ok('a new code ends every pass already given', isForm(visit({ [PASS]: given.value })));
ok('  and the old code opens nothing', (await tryCode('l5i test code')).status === 400);
const secret = process.env.CLERK_SECRET_KEY;
delete process.env.CLERK_SECRET_KEY;
ok('no server secret: even the right code earns no pass', (await tryCode('another test code')).status === 400);
process.env.CLERK_SECRET_KEY = secret;
const codes = [];
for (let i = 0; i < 12; i++) codes.push((await tryCode('wrong', '198.51.100.7')).status);
ok('guessing from one address meets the rate limit', codes.includes(429), codes.join(','));
delete process.env.NEW_SOCRIA_ACCESS_CODE;
const robots = readFileSync(join(root, 'app', 'robots.ts'), 'utf8');
ok('disallowed in robots', robots.includes("'/logos-5-internal'"));
const sitemap = readFileSync(join(root, 'app', 'sitemap.ts'), 'utf8');
ok('not in the sitemap', !sitemap.includes('logos-5-internal'));

// linked from no other page or component
const walk = (d) => readdirSync(d).flatMap((f) => {
  const p = join(d, f);
  if (f === 'node_modules' || f.startsWith('.')) return [];
  return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|mjs)$/.test(f) ? [p] : [];
});
const linking = [...walk(join(root, 'app')), ...walk(join(root, 'components'))].filter((p) => !p.includes('logos-5-internal') && !p.endsWith('robots.ts') && readFileSync(p, 'utf8').includes('/logos-5-internal'));
ok('linked from nowhere', linking.length === 0, JSON.stringify(linking));

console.log(`logos5-internal: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
