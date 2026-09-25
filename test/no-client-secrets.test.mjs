// A secret the server checks must never be a value the client holds.
//
// Two constants — an access key that substituted for a Clerk session on 14
// AI routes, and the Socria One code that granted the paid plan — lived in
// lib/socria-prompt.ts and lib/socria-one.ts, which client components import.
// Next.js compiled both into the public browser bundle. Neither was a secret;
// both were published, and the product treated them as secrets anyway.
//
// The values are gone and the checks moved to lib/access-codes-server.ts,
// which `import 'server-only'` keeps out of any client bundle. This test is
// the thing that notices if either fact stops being true.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === '.next' || e === '.git' || e === '.tmp') continue;
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|mjs)$/.test(e)) out.push(p);
  }
  return out;
}

const files = walk(root).filter((f) => {
  const r = relative(root, f);
  return !r.startsWith('test/') && !r.startsWith('ds-bundle/') && !r.startsWith('.design-sync/') && !r.startsWith('.ds-sync/');
});

console.log('=== the burned values are gone ===');
// Written split so this test file does not itself reintroduce the strings
// into a grep of the repo.
const BURNED = ['MAVERICKS26' + 'LONGHORNS27', 'SMA' + 'RT'];
for (const v of BURNED) {
  const hits = files.filter((f) => {
    const src = readFileSync(f, 'utf8');
    // The access key was a bare quoted literal; a prose mention in a comment
    // is not the thing that shipped.
    return src.includes(`'${v}'`) || src.includes(`"${v}"`);
  });
  ok(`no source file contains the literal`, hits.length === 0, hits.map((h) => relative(root, h)).join(', '));
}

console.log('\n=== the server-only modules stay server-only ===');
const SERVER_ONLY = ['lib/access-codes-server.ts', 'lib/route-guard.ts'];
for (const m of SERVER_ONLY) {
  const src = readFileSync(join(root, m), 'utf8');
  ok(`${m} declares server-only`, /^import 'server-only';/m.test(src));
}

// A client component importing one of these is a build error thanks to
// 'server-only' — but the error appears at build time, and a test that names
// the offending file is a faster way to find out.
const clientFiles = files.filter((f) => {
  const src = readFileSync(f, 'utf8');
  return /^['"]use client['"];/m.test(src);
});
console.log(`\n=== no client component imports a server-only module (${clientFiles.length} client files) ===`);
for (const m of SERVER_ONLY) {
  const spec = m.replace(/^lib\//, '@/lib/').replace(/\.ts$/, '');
  const offenders = clientFiles.filter((f) => readFileSync(f, 'utf8').includes(spec));
  ok(`nothing client-side imports ${spec}`, offenders.length === 0, offenders.map((o) => relative(root, o)).join(', '));
}

console.log('\n=== the bypass shape itself is gone ===');
// Comments stripped first: several of these files explain what the old
// bypass looked like, and a test that cannot tell prose from code would
// force the explanation out of the codebase to stay green.
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const all = files.map((f) => stripComments(readFileSync(f, 'utf8'))).join('\n');
ok('no isValidAccessKey remains', !/\bisValidAccessKey\s*\(/.test(all));
ok('no isValidOneKey remains', !/\bisValidOneKey\s*\(/.test(all));
ok('nothing reads an x-socria-key header', !/headers\.get\(\s*['"]x-socria-key['"]/.test(all));
ok('nothing reads an x-socria-one header', !/headers\.get\(\s*['"]x-socria-one['"]/.test(all));
ok('nothing reads an accessKey from a request body', !/body\?\.accessKey/.test(all));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
