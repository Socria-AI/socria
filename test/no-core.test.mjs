// NO SOCRIA CORE, ANYWHERE A PERSON READS.
//
// "remove references of socria core on dev, we removed core lol". The Core
// models and the Core chat were archived (docs/ARCHIVE.md); Logos 5 is the one
// surface. This holds every screen, page and piece of copy to that: the word
// "Core" appears in none of them outside a code comment.
//
// What is not held to it, on purpose:
//   · internal names — the engine Logos 5 runs on is lib/core4, old data says
//     surface: 'core', a component may be called Core4Record;
//   · the pages only the team opens — the architecture page behind the access
//     code (app/logos-5-internal) and the developer dashboard;
//   · the model registry and the prompts' own rules (lib/socria-prompt.ts),
//     the operations health check (lib/upstream-health.ts) and the analytics
//     labels for what people chose before the archive (lib/onboarding-intents.ts).

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 600))));

/** Every .ts/.tsx under a folder, but the folders named. */
function walk(dir, skip = []) {
  const out = [];
  for (const name of readdirSync(join(root, dir))) {
    const rel = join(dir, name);
    if (skip.some((s) => rel === s || rel.startsWith(s + '/'))) continue;
    const st = statSync(join(root, rel));
    if (st.isDirectory()) out.push(...walk(rel, skip));
    else if (/\.tsx?$/.test(name)) out.push(rel);
  }
  return out;
}

/** The source as a person could meet it: comments gone (block, JSX and line), imports gone. */
function readable(src) {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1')
    .replace(/^\s*import [^\n]*$/gm, '');
}

/** Where "Core" is said: the word on its own — not CORE_, not Core4Record, not 'core'. */
function mentions(file) {
  const lines = readable(readFileSync(join(root, file), 'utf8')).split('\n');
  return lines.map((l, i) => [i + 1, l]).filter(([, l]) => /\bCore\b/.test(l)).map(([n, l]) => `${file}:${n}: ${l.trim().slice(0, 140)}`);
}

const SCREENS = [
  ...walk('app', ['app/api', 'app/logos-5-internal', 'app/dev']),
  ...walk('components', ['components/dashboard']),
];
const COPY = [
  'lib/support-faq.ts', 'lib/socria-one.ts', 'lib/one-prompt.ts', 'lib/og-cards.ts', 'lib/seo.ts',
  'lib/newsletter-issues.ts', 'lib/lifecycle.ts', 'lib/conversation-style.ts', 'lib/tour.ts', 'lib/env.ts',
  'lib/project-home.ts', 'lib/mind/atlas.ts', 'lib/entitlements.ts',
].filter((f) => { try { return statSync(join(root, f)).isFile(); } catch { return false; } });

console.log('=== every screen and page ===');
const onScreens = SCREENS.flatMap(mentions);
ok(`no screen or page says "Core" (${SCREENS.length} files read)`, onScreens.length === 0, '\n' + onScreens.join('\n'));

console.log('\n=== every piece of copy ===');
const inCopy = COPY.flatMap(mentions);
ok(`no copy module says "Core" (${COPY.length} read)`, inCopy.length === 0, '\n' + inCopy.join('\n'));

console.log('\n=== the reader does its job ===');
ok('a comment is not a mention', readable('// Core 4 did this\nconst a = 1; /* Core */ {/* Core */}').match(/\bCore\b/) === null);
ok('a string is', /\bCore\b/.test(readable("const t = 'Open Core 4';")));
ok('JSX text is', /\bCore\b/.test(readable('<p>Talk to Core 4</p>')));
ok('a URL in a string is not taken for a comment', /\bCore\b/.test(readable("const u = 'https://x.dev'; const t = 'Core';")));
ok('an internal name is not a mention', !/\bCore\b/.test(readable('<Core4Record /> const x = LOGOS5_CORE;')));

console.log('\n=== old addresses still land ===');
const docsPage = readFileSync(join(root, 'app/docs/[slug]/page.tsx'), 'utf8');
ok('the Core docs pages send people to Logos 5', ['core-2', 'core-3', 'core-4'].every((s) => docsPage.includes(s)) && /\/docs\/logos-5/.test(docsPage));
const nextConfig = readFileSync(join(root, 'next.config.js'), 'utf8');
ok('so does the Core 4 model page', /\/core4model/.test(nextConfig) && /permanent:\s*true/.test(nextConfig));

console.log(`\nno-core: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
