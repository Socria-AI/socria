// THE WRITING, SAVED — through the real conversations route (app/api/conversations).
//
// What has to hold:
//   • the document of the Draft Space and the Writing Space is saved with its
//     line of thinking and comes back exactly — every block, mark, citation,
//     card, pile, version and dismissal;
//   • the title and the HTML older code reads are kept beside it;
//   • what arrives is bounded and checked, never reworded: the person's own
//     spacing survives, control characters do not, a broken document is not
//     saved as if it were one;
//   • a draft from before — { title, html } with no document — is still kept
//     as it was, for the browser to read into a document when it opens.

import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve as res } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, '.tmp', 'e2e-write-store');
const FAKE_DB = join(here, 'helpers', 'fake-supabase.mjs');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  entryPoints: { conversations: join(root, 'app/api/conversations/route.ts'), parse: join(root, 'lib/write/parse.ts') },
  bundle: true, format: 'esm', platform: 'node', outdir: OUT, outExtension: { '.js': '.mjs' },
  tsconfig: join(root, 'tsconfig.json'),
  plugins: [{
    name: 'swap',
    setup(b) {
      b.onResolve({ filter: /(^|\/)supabase$/ }, (a) => {
        const p = a.path.startsWith('@/') ? join(root, a.path.slice(2)) : res(a.resolveDir, a.path);
        if (p === join(root, 'lib', 'supabase')) return { path: pathToFileURL(FAKE_DB).href, external: true };
        return undefined;
      });
      b.onResolve({ filter: /^@clerk\/nextjs\/server$/ }, () => ({ path: pathToFileURL(join(here, 'helpers', 'fake-clerk.mjs')).href, external: true }));
      b.onResolve({ filter: /^openai$/ }, () => ({ path: pathToFileURL(join(here, 'helpers', 'fake-openai.mjs')).href, external: true }));
      b.onResolve({ filter: /^server-only$/ }, () => ({ path: join(here, 'helpers', 'server-only-shim.mjs') }));
      b.onResolve({ filter: /^next\/(server|headers)$/ }, (a) => ({ path: `${a.path}.js`, external: true }));
    },
  }],
  external: ['next', 'next/*', 'undici', '@supabase/*', 'stripe', 'resend', 'unpdf'],
  logLevel: 'error',
});
console.error = () => {};
console.warn = () => {};
process.env.RATE_LIMIT_DISABLED = '1';
const C = await import(pathToFileURL(join(OUT, 'conversations.mjs')).href);
const PZ = await import(pathToFileURL(join(OUT, 'parse.mjs')).href);
const { db } = await import(pathToFileURL(FAKE_DB).href);
const { NextRequest } = await import('next/server.js');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 400))));
const J = JSON.stringify;
// the same structure, whatever order its keys were written in
const K = (v) => JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x));
const call = async (handler, method, body) => {
  const r = await handler(new NextRequest('http://localhost/api/conversations', { method, headers: { 'content-type': 'application/json' }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }));
  return { status: r.status, json: await r.json().catch(() => null) };
};
const row = (id) => db.rows('conversations').find((r) => r.id === id);
const msgs = [{ role: 'user', content: 'Why do rents rise?' }, { role: 'assistant', content: 'Start with supply.' }];

const DOC = {
  v: 2,
  title: 'Why rents rise',
  blocks: [
    { id: 'b1', t: 'h1', text: 'Causes' },
    { id: 'b2', t: 'p', text: 'Rents rise  when supply lags.\nA second line.', marks: [{ s: 0, e: 5, t: 'b' }], cites: [{ id: 'c1', doc: 'D1', block: 'p2.4', label: 'Housing report, p. 2', quote: 'Vacancy fell to 2%.' }], from: ['k1'] },
    { id: 'b3', t: 'ol', lvl: 2, text: 'permits fell' },
  ],
  cards: [{ id: 'k1', kind: 'claim', text: 'Supply lags demand', group: 'g1', links: [{ k: 'node', id: 'n1', label: 'Rents rise because supply lags demand' }], at: 5 }],
  groups: [{ id: 'g1', title: 'Why' }],
  dismissed: ['spelling:abc'],
  versions: [{ id: 'v1', at: 3, why: 'manual', name: 'First go', title: 'Why rents rise', blocks: [{ id: 'b1', t: 'p', text: 'An early version.' }] }],
  face: 'both',
  updatedAt: 9,
};

console.log('=== the document, saved and read back exactly ===');
{
  db.reset();
  globalThis.__uid = 'u1';
  const stored = PZ.storedFrom(DOC);
  const r = await call(C.PUT, 'PUT', { conversation: { id: 'w1', title: 'Why rents rise', messages: msgs, kind: 'logos', draft: stored, updatedAt: 1000 } });
  ok('saved', r.status === 200, J(r));
  const d = row('w1').draft;
  ok('the document is in the row', d?.doc?.v === 2 && d.doc.blocks.length === 3 && d.doc.cards.length === 1, J(d));
  ok('every word, mark, citation and origin, as written — spacing and line breaks too', J(d.doc.blocks[1]) === J(DOC.blocks[1]), J(d.doc.blocks[1]));
  ok('the card, its pile, its link; the version; the dismissal; the face', J(d.doc.cards) === J(DOC.cards) && J(d.doc.groups) === J(DOC.groups) && d.doc.versions[0].name === 'First go' && J(d.doc.dismissed) === J(['spelling:abc']) && d.doc.face === 'both');
  ok('the title and the HTML older code reads, beside it', d.title === 'Why rents rise' && d.html.startsWith('<h1>Causes</h1><p><strong>Rents</strong> rise  when supply lags.<br>A second line.<sup>'), d.html);
  const g = await call(C.GET, 'GET');
  const back = (g.json?.conversations ?? []).find((c) => c.id === 'w1');
  ok('and read back by the app, the same', back && J(back.draft.doc) === J(d.doc), J(back?.draft).slice(0, 200));
  ok('the app reads it into the same document', K(PZ.normalizeDraft(back.draft).doc.blocks) === K(DOC.blocks), K(PZ.normalizeDraft(back.draft).doc.blocks));
}

console.log('\n=== what arrives is checked, never reworded ===');
{
  db.reset();
  globalThis.__uid = 'u1';
  const bad = { ...DOC, title: 'Ti\u0007tle', blocks: [{ id: 'x', t: 'p', text: '  my  own\u0000 spacing  ' }, { id: 'x', t: 'h7', text: 'dup' }], cards: [{ id: 'k', kind: 'bogus', text: 'c', group: 'nowhere' }] };
  await call(C.PUT, 'PUT', { conversation: { id: 'w2', title: 'T', messages: msgs, kind: 'logos', draft: { title: 'T', html: '<p>x</p>', doc: bad }, updatedAt: 1 } });
  const d = row('w2').draft.doc;
  ok('their spacing kept; the control characters gone', d.blocks[0].text === '  my  own spacing  ' && d.title === 'Title', J(d.blocks[0]));
  ok('a repeated id renewed, an unknown type a paragraph', d.blocks[1].id !== 'x' && d.blocks[1].t === 'p');
  ok('a card in no real pile is loose, an unknown kind an idea', d.cards[0].group === null && d.cards[0].kind === 'idea');
  await call(C.PUT, 'PUT', { conversation: { id: 'w3', title: 'T', messages: msgs, kind: 'logos', draft: { title: 'T', html: '<p>x</p>', doc: { v: 9, blocks: 'nope' } }, updatedAt: 1 } });
  ok('a document that is not one is not saved as one — the rest of the draft is', row('w3').draft && row('w3').draft.doc === undefined && row('w3').draft.html === '<p>x</p>');
  await call(C.PUT, 'PUT', { conversation: { id: 'w4', title: 'T', messages: msgs, kind: 'logos', draft: 'not a draft', updatedAt: 1 } });
  ok('a draft that is not one is nothing', row('w4').draft === null);
}

console.log('\n=== a draft from before the document ===');
{
  db.reset();
  globalThis.__uid = 'u1';
  await call(C.PUT, 'PUT', { conversation: { id: 'old', title: 'Old', messages: msgs, kind: 'logos', draft: { title: 'My old essay', html: '<h2>Big idea</h2><div>First <b>line</b></div>' }, updatedAt: 1 } });
  const d = row('old').draft;
  ok('kept as it was', d.title === 'My old essay' && d.html === '<h2>Big idea</h2><div>First <b>line</b></div>' && d.doc === undefined, J(d));
  const g = await call(C.GET, 'GET');
  const back = (g.json?.conversations ?? []).find((c) => c.id === 'old');
  const doc = PZ.normalizeDraft(back.draft).doc;
  ok('and opened as a document, every word and its emphasis kept', J(doc.blocks.map((b) => [b.t, b.text, b.marks ?? null])) === J([['h2', 'Big idea', null], ['p', 'First line', [{ s: 6, e: 10, t: 'b' }]]]), J(doc.blocks));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
