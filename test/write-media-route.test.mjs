// THE PICTURES IN SOMEONE'S WRITING (app/api/write/media, lib/write/media-store.ts), end to end.
//
// Only Clerk (fake-clerk) and Storage (fake-storage: a bucket in memory that
// keeps a real bucket's rules) are replaced. What is held down:
//   • signed out, nothing is kept or served — pictures stay in the browser;
//   • what is kept is decided by the bytes, not by what a request says they
//     are: a PNG, JPEG, GIF or WebP with a sensible size from its own header,
//     at most 4 MB — even when the request never says how long it is;
//   • a picture is kept in its owner's folder (a digest, never the account
//     id), at the id the browser chose; the same picture sent twice is kept,
//     not refused;
//   • it is served as the picture it is, never as anything a browser would
//     run; to its owner, and to anyone the writing was shared with (who has
//     its id and its owner's folder) — to nobody without the id;
//   • the bucket is private, with a picture's ceiling and picture types only;
//   • an account's pictures are listed for its export and removed with it,
//     and nobody else's are touched;
//   • a conversation deleted takes the pictures its writing held — not one
//     that another of their drafts (or its versions) still holds, and none at
//     all when that cannot be checked.

import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { png } from './helpers/png.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, '.tmp', 'e2e-media');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const FAKE_STORAGE = pathToFileURL(join(here, 'helpers', 'fake-supabase-storage.mjs')).href;
await build({
  entryPoints: {
    upload: join(root, 'app/api/write/media/route.ts'),
    serve: join(root, 'app/api/write/media/[id]/route.ts'),
    store: join(root, 'lib/write/media-store.ts'),
    conversation: join(root, 'app/api/conversations/[id]/route.ts'),
    paths: join(root, 'lib/upload-paths.ts'),
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  outdir: OUT,
  outExtension: { '.js': '.mjs' },
  tsconfig: join(root, 'tsconfig.json'),
  plugins: [
    {
      name: 'swap',
      setup(b) {
        b.onResolve({ filter: /(^|\/)supabase$/ }, (a) => {
          const p = a.path.startsWith('@/') ? join(root, a.path.slice(2)) : join(a.resolveDir, a.path);
          if (p === join(root, 'lib', 'supabase')) return { path: FAKE_STORAGE, external: true };
          return undefined;
        });
        b.onResolve({ filter: /^@clerk\/nextjs\/server$/ }, () => ({ path: pathToFileURL(join(here, 'helpers', 'fake-clerk.mjs')).href, external: true }));
        b.onResolve({ filter: /^server-only$/ }, () => ({ path: join(here, 'helpers', 'server-only-shim.mjs') }));
        b.onResolve({ filter: /^next\/(server|headers)$/ }, (a) => ({ path: `${a.path}.js`, external: true }));
      },
    },
  ],
  external: ['next', 'next/*', '@supabase/*'],
  logLevel: 'error',
});
console.error = () => {};
process.env.RATE_LIMIT_DISABLED = '1';
const upload = await import(pathToFileURL(join(OUT, 'upload.mjs')).href);
const serve = await import(pathToFileURL(join(OUT, 'serve.mjs')).href);
const store = await import(pathToFileURL(join(OUT, 'store.mjs')).href);
const { ownerPrefix } = await import(pathToFileURL(join(OUT, 'paths.mjs')).href);
const conversation = await import(pathToFileURL(join(OUT, 'conversation.mjs')).href);
const { db } = await import(pathToFileURL(join(here, 'helpers', 'fake-supabase.mjs')).href);
const { NextRequest } = await import('next/server.js');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 500))));
const J = (v) => JSON.stringify(v);
const as = (uid) => (globalThis.__uid = uid);
const id = (k) => k.toString(16).padStart(2, '0').repeat(16);
const files = () => globalThis.__storage?.buckets.get(store.MEDIA_BUCKET)?.files ?? new Map();

async function put(bytes, mediaId, headers = {}) {
  const r = await upload.POST(new NextRequest('http://localhost/api/write/media', { method: 'POST', headers: { 'content-type': 'application/octet-stream', ...(mediaId ? { 'x-media-id': mediaId } : {}), ...headers }, body: bytes }));
  return { status: r.status, json: await r.json().catch(() => null) };
}
async function get(mediaId, by) {
  const url = `http://localhost/api/write/media/${mediaId}${by ? `?by=${by}` : ''}`;
  const r = await serve.GET(new NextRequest(url), { params: { id: mediaId } });
  const isJson = (r.headers.get('content-type') ?? '').includes('json');
  return { status: r.status, headers: r.headers, bytes: isJson ? null : new Uint8Array(await r.arrayBuffer()), json: isJson ? await r.json() : null };
}

const pic = png(40, 30);
const ANN = 'user_ann', BEN = 'user_ben';

console.log('=== signed out: nothing kept, nothing served ===');
{
  as(null);
  ok('whose folder: refused', (await upload.GET(new NextRequest('http://localhost/api/write/media'))).status === 401);
  const out = await put(pic, id(1));
  ok('a picture sent: refused, and nothing reached storage', out.status === 401 && !(globalThis.__storage?.calls ?? []).some((c) => c[0] === 'upload'));
  ok('a picture asked for: refused', (await get(id(1))).status === 401);
}

console.log('\n=== what is kept is decided by the bytes ===');
{
  as(ANN);
  const mine = await (await upload.GET(new NextRequest('http://localhost/api/write/media'))).json();
  ok('signed in: their folder is a digest of the account, never its id', mine.by === ownerPrefix(ANN) && /^[a-f0-9]{24}$/.test(mine.by) && !mine.by.includes('ann'));
  ok('no id, or one that is not 128 bits of hex: refused', (await put(pic)).status === 400 && (await put(pic, '../../etc/passwd')).status === 400 && (await put(pic, 'ABCDEF')).status === 400);
  ok('nothing sent: refused', (await put(new Uint8Array(0), id(2))).status === 400);
  const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect width="9" height="9"/></svg>');
  const asSvg = await put(svg, id(3), { 'content-type': 'image/png' });
  ok('an SVG that says it is a PNG: refused, with a sentence', asSvg.status === 415 && /PNG, JPEG, GIF or WebP/.test(asSvg.json?.error ?? ''));
  const huge = new Uint8Array(pic);
  new DataView(huge.buffer).setUint32(16, 30_000);
  ok('a PNG whose header claims 30,000 pixels across: refused', (await put(huge, id(4))).status === 415);
  const big = new Uint8Array(4 * 1024 * 1024 + 1);
  big.set(pic.subarray(0, 33));
  ok('over 4 MB, as its length says: refused', (await put(big, id(5), { 'content-length': String(big.length) })).status === 413);
  // a body that never ends, sent without a length: the route must stop reading it
  let pulled = 0;
  const endless = new ReadableStream({
    pull(c) {
      c.enqueue(pulled++ ? new Uint8Array(1024 * 1024) : pic.subarray(0, 33));
    },
  });
  const sneaky = await Promise.race([
    upload.POST(new NextRequest('http://localhost/api/write/media', { method: 'POST', headers: { 'x-media-id': id(6) }, body: endless, duplex: 'half' })),
    new Promise((r) => setTimeout(() => r({ status: 'still reading' }), 10_000)),
  ]);
  ok('a body that never ends, sent without saying how long: refused once past 4 MB, not read to its end', sneaky.status === 413 && pulled <= 8, `${sneaky.status} after ${pulled} chunks`);
  ok('  and none of those reached storage', ![...files().keys()].length);
}

console.log('\n=== kept, at its id, in its owner’s folder ===');
const by = ownerPrefix(ANN);
{
  as(ANN);
  const out = await put(pic, id(7));
  ok('a PNG: kept, with its size read from its header', out.status === 200 && out.json?.ok === true && out.json.id === id(7) && out.json.by === by && out.json.w === 40 && out.json.h === 30, J(out));
  const f = files().get(`${by}/${id(7)}`);
  ok('  at <owner>/<id>, as a PNG, byte for byte', !!f && f.type === 'image/png' && f.bytes.length === pic.length && f.bytes.every((x, k) => x === pic[k]));
  const b = globalThis.__storage.buckets.get(store.MEDIA_BUCKET).opts;
  ok('the bucket: private, a picture’s ceiling, picture types only', b.public === false && b.fileSizeLimit === 4 * 1024 * 1024 && J([...b.allowedMimeTypes].sort()) === J(['image/gif', 'image/jpeg', 'image/png', 'image/webp']));
  const again = await put(pic, id(7));
  ok('the same picture sent twice (a retry): kept, not refused', again.status === 200 && again.json?.ok === true);
  const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x10, 0x00, 0x08, 0x00, 0x80, 0, 0, 0, 0, 0, 0xff, 0xff, 0xff, 0x21, 0xf9, 4, 0, 0, 0, 0, 0, 0x2c, 0, 0, 0, 0, 0x10, 0, 8, 0, 0, 2, 2, 0x44, 1, 0, 0x3b]);
  const g = await put(gif, id(8), { 'content-type': 'image/png' });
  ok('a GIF labelled a PNG: kept as the GIF it is', g.status === 200 && files().get(`${by}/${id(8)}`)?.type === 'image/gif');
}

console.log('\n=== served as the picture it is ===');
{
  as(ANN);
  const r = await get(id(7));
  ok('to its owner: the bytes, exactly', r.status === 200 && r.bytes.length === pic.length && r.bytes.every((x, k) => x === pic[k]));
  ok('  as a PNG, never sniffed into anything else, nothing in it able to run', r.headers.get('content-type') === 'image/png' && r.headers.get('x-content-type-options') === 'nosniff' && /sandbox/.test(r.headers.get('content-security-policy') ?? '') && /default-src 'none'/.test(r.headers.get('content-security-policy') ?? ''));
  ok('  kept by the browser, privately, for good (an id never names other bytes)', /private/.test(r.headers.get('cache-control') ?? '') && /immutable/.test(r.headers.get('cache-control') ?? ''));
  as(BEN);
  ok('to someone the writing was shared with — its id and its owner’s folder', (await get(id(7), by)).status === 200);
  ok('  without the owner’s folder, it is looked for in their own: not there', (await get(id(7))).status === 404);
  ok('  an id nobody gave them: not there', (await get(id(9), by)).status === 404);
  ok('  an id that is not one, or a folder that is not one', (await get('nope')).status === 400 && (await get(id(7), '../x')).status === 404);
  files().set(`${by}/${id(10)}`, { bytes: new TextEncoder().encode('<html><script>alert(1)</script></html>'), type: 'text/html', at: null });
  ok('something in storage that is not a picture is never served', (await get(id(10), by)).status === 404);
  files().delete(`${by}/${id(10)}`);
}

console.log('\n=== in the export, and gone with the account ===');
{
  as(BEN);
  ok('another person’s picture kept', (await put(png(4, 4), id(11))).status === 200);
  const listed = await store.listMedia(ANN);
  ok('the export lists every picture of theirs, its type and size, with a link that works for an hour', listed.length === 2 && listed.every((p) => /^[a-f0-9]{32}$/.test(p.id) && p.bytes > 0 && /expires=3600/.test(p.download ?? '')) && listed.find((p) => p.id === id(7))?.type === 'image/png', J(listed));
  ok('  and nobody else’s', !listed.some((p) => p.id === id(11)));
  const removed = await store.purgeMedia(ANN);
  ok('deleting the account removes their folder', removed === 2 && !(await store.listMedia(ANN)).length);
  ok('  and leaves everyone else’s', files().has(`${ownerPrefix(BEN)}/${id(11)}`));
  as(ANN);
  ok('  what was theirs is no longer served', (await get(id(7))).status === 404);
}

console.log('\n=== a conversation deleted takes its pictures — not one other writing still holds ===');
{
  as(ANN);
  db.reset();
  const draftOf = (now, then = []) => ({
    title: 'Essay',
    html: '',
    doc: { v: 2, title: 'Essay', blocks: now.map((m, k) => ({ id: `i${k}`, t: 'img', text: '', src: `m:${m}` })), versions: then.length ? [{ id: 'v1', at: 1, blocks: then.map((m, k) => ({ id: `w${k}`, t: 'img', text: '', src: `m:${m}` })) }] : [] },
  });
  for (const k of [20, 21, 22, 23]) ok(`picture ${k} kept`, (await put(pic, id(k))).status === 200);
  db.rows('conversations').push(
    { id: 'c1', user_id: ANN, title: 'One', messages: [], draft: draftOf([id(20), id(21)], [id(22)]) },
    { id: 'c2', user_id: ANN, title: 'Two', messages: [], draft: draftOf([id(21)]) },
    { id: 'c3', user_id: ANN, title: 'Three', messages: [], draft: draftOf([], [id(22)]) },
    { id: 'c4', user_id: ANN, title: 'Four', messages: [], draft: draftOf([id(23)]) }
  );
  const del = (cid) => conversation.DELETE(new NextRequest(`http://localhost/api/conversations/${cid}`, { method: 'DELETE' }), { params: { id: cid } });
  const r = await del('c1');
  ok('the conversation deleted', r.status === 200 && !db.rows('conversations').some((c) => c.id === 'c1'));
  ok('  the picture only its writing held is gone from storage', !files().has(`${by}/${id(20)}`));
  ok('  one another of their drafts holds is kept for it', files().has(`${by}/${id(21)}`));
  ok('  one a version of another draft holds is kept for it', files().has(`${by}/${id(22)}`));
  ok('  and a picture it never held is untouched', files().has(`${by}/${id(23)}`));
  db.missing.conversations = new Set(['draft']);
  const blind = await del('c4');
  ok('a database without the draft column: the conversation goes, its pictures stay — nothing can say which are free', blind.status === 200 && files().has(`${by}/${id(23)}`));
  ok('  and none is released while the drafts cannot be searched', (await store.releaseDraftMedia(ANN, draftOf([id(23)]))) === 0 && files().has(`${by}/${id(23)}`));
  db.missing = {};
  ok('  once they can be, it is', (await store.releaseDraftMedia(ANN, draftOf([id(23)]))) === 1 && !files().has(`${by}/${id(23)}`));
  db.rows('conversations').push({ id: 'c5', user_id: ANN, title: 'Plain', messages: [], draft: null });
  const asked = globalThis.__storage.calls.length;
  const plain = await del('c5');
  ok('a conversation with no writing: deleted, and storage not even asked', plain.status === 200 && globalThis.__storage.calls.length === asked);
  as(BEN);
  db.rows('conversations').push({ id: 'b1', user_id: BEN, title: 'Ben', messages: [], draft: draftOf([id(21)]) });
  await del('b1');
  ok('someone else deleting a draft that names their picture removes nothing of theirs', files().has(`${by}/${id(21)}`));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
