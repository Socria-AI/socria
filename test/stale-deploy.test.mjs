// A TAB LEFT OPEN ACROSS A DEPLOY (lib/stale-deploy.ts, app/error.tsx, app/global-error.tsx).
//
// Held down here:
//   • the failures of an open page meeting a newer deploy are recognised — webpack's chunk loader, native dynamic
//     import, a module the loaded chunks do not hold — and an ordinary error is not;
//   • the page is loaded fresh once; a second failure within the minute is shown, never a reload loop; without
//     session storage there is no reload at all (no guard, no loop);
//   • both error pages take that path, and still never show the error's own message (test/error-boundary.test.mjs);
//   • the quiz-ready note says "an 8-question quiz".

import { build } from 'esbuild';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, '.tmp', 'stale-deploy');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const entry = join(OUT, 'entry.ts');
writeFileSync(
  entry,
  [
    `export * from ${JSON.stringify(join(root, 'lib/stale-deploy.ts'))};`,
    `export { readyNote } from ${JSON.stringify(join(root, 'lib/quiz/context.ts'))};`,
  ].join('\n')
);
await build({ entryPoints: { sd: entry }, bundle: true, format: 'esm', platform: 'node', outdir: OUT, outExtension: { '.js': '.mjs' }, tsconfig: join(root, 'tsconfig.json'), logLevel: 'error' });
const M = await import(pathToFileURL(join(OUT, 'sd.mjs')).href);

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 300))));

console.log('\n=== what a stale page looks like ===');
{
  const err = (name, message) => Object.assign(new Error(message), { name });
  const stale = [
    err('ChunkLoadError', 'Loading chunk 4213 failed.\n(error: https://socria.app/_next/static/chunks/4213-abc.js)'),
    err('Error', 'Loading CSS chunk app-chat failed'),
    err('TypeError', 'Failed to fetch dynamically imported module: https://socria.app/_next/static/chunks/x.js'),
    err('TypeError', 'error loading dynamically imported module'),
    err('TypeError', 'Importing a module script failed.'),
    err('TypeError', "Cannot read properties of undefined (reading 'call')"),
    err('TypeError', "undefined is not an object (evaluating 'e[r].call')"),
  ];
  for (const e of stale) ok(`stale: ${e.name}: ${e.message.split('\n')[0].slice(0, 60)}`, M.isStaleDeployError(e));
  const real = [
    err('TypeError', "Cannot read properties of undefined (reading 'map')"),
    err('Error', 'Rendered more hooks than during the previous render.'),
    err('ReferenceError', 'quiz is not defined'),
    err('Error', 'Minified React error #418'),
  ];
  for (const e of real) ok(`a real fault is not taken for one: ${e.message.slice(0, 60)}`, !M.isStaleDeployError(e));
  ok('nothing, a string or a number is not one', !M.isStaleDeployError(null) && !M.isStaleDeployError('ChunkLoadError') && !M.isStaleDeployError(3));
}

console.log('\n=== loaded fresh once, never a loop ===');
{
  const fakeWin = (storage) => {
    const w = { reloads: 0, location: { reload: () => (w.reloads += 1) }, sessionStorage: storage };
    return w;
  };
  const mem = () => {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
  };
  const s = mem();
  const w = fakeWin(s);
  const t0 = 1_800_000_000_000;
  ok('the first stale failure reloads', M.reloadForUpdate(t0, w) === true && w.reloads === 1);
  ok('a second within the minute does not: the page says what broke', M.reloadForUpdate(t0 + 20_000, w) === false && w.reloads === 1);
  ok('after the minute, a new deploy can be picked up again', M.reloadForUpdate(t0 + M.RELOAD_GUARD_MS + 1, w) === true && w.reloads === 2);
  const blocked = fakeWin({ getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } });
  ok('no session storage: no reload, since nothing could stop a loop', M.reloadForUpdate(t0, blocked) === false && blocked.reloads === 0);
}

console.log('\n=== the error pages take that path ===');
{
  for (const f of ['app/error.tsx', 'app/global-error.tsx']) {
    const src = readFileSync(join(root, f), 'utf8');
    ok(`${f}: a stale page reloads once and says Socria was updated`, /isStaleDeployError\(error\) && !reloadForUpdate\(\)/.test(src) && /Socria was just updated/.test(src));
    ok(`${f}: the error's own message is still never shown`, !/error\.message/.test(src));
  }
}

console.log('\n=== the quiz-ready note ===');
{
  const base = { title: 'Monopoly pricing', mode: 'practice', sources: ['Lecture 6'], grounding: 'grounded', style: 'unknown', course: '', missing: [] };
  ok('"an 8-question quiz"', M.readyNote({ ...base, count: 8 }).startsWith("Here's an 8-question quiz"), M.readyNote({ ...base, count: 8 }));
  ok('"an 11-question quiz"', M.readyNote({ ...base, count: 11 }).startsWith("Here's an 11-question quiz"));
  ok('"a 10-question quiz"', M.readyNote({ ...base, count: 10 }).startsWith("Here's a 10-question quiz"));
  ok('"An 8-question practice on what you missed"', M.readyNote({ ...base, count: 8, reason: 'weak-spots' }).startsWith('An 8-question practice'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
