// The internal architecture page (app/logos-5-internal): every section its
// contents promise is there, it has one heading, and it stays out of search —
// never indexed, disallowed in robots, absent from the sitemap, linked from
// no other page.

import { build } from 'esbuild';
import { mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, '.tmp', 'logos5-internal');
mkdirSync(OUT, { recursive: true });

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

await build({
  entryPoints: [join(root, 'app', 'logos-5-internal', 'page.tsx')],
  bundle: true, format: 'esm', platform: 'node', outfile: join(OUT, 'page.mjs'),
  tsconfig: join(root, 'tsconfig.json'), jsx: 'automatic', loader: { '.css': 'empty' },
  external: ['react', 'react/jsx-runtime', 'react-dom'],
  logLevel: 'error',
});
const Page = await import(pathToFileURL(join(OUT, 'page.mjs')).href);
const html = renderToStaticMarkup(h(Page.default));

const tocIds = [...html.matchAll(/<a href="#([a-z-]+)"/g)].map((m) => m[1]);
const sectionIds = [...html.matchAll(/<section[^>]* id="([a-z-]+)"/g)].map((m) => m[1]);
ok('the contents list sixteen sections', tocIds.length === 16, tocIds.length);
ok('  and every one of them is on the page, in order', JSON.stringify(tocIds) === JSON.stringify(sectionIds), JSON.stringify({ tocIds, sectionIds }));
ok('one h1', (html.match(/<h1[\s>]/g) ?? []).length === 1);
ok('every figure has a caption, and every diagram a name', (html.match(/<figure/g) ?? []).length === (html.match(/<figcaption/g) ?? []).length && (html.match(/<figure/g) ?? []).length >= 7);
ok('it says MR is on by default, as the code does', /on by default/.test(html) && /LOGOS_MR=off/.test(html));

ok('never indexed', Page.metadata?.robots?.index === false && Page.metadata?.robots?.follow === false, JSON.stringify(Page.metadata?.robots));
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
