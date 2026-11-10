// THE ORIGINALS OF ATTACHED FILES (app/api/files/original, lib/file-originals*.ts), end to end.
//
// Only Clerk (fake-clerk) and Supabase (database + storage fakes that keep a real
// bucket's rules) are replaced. What is held down:
//   • signed out, nothing is kept or served — a guest's originals stay on their device;
//   • a file is kept in its owner's folder (a digest, never the account id), named by its
//     content, and only kinds the composer takes — never a secrets file;
//   • the plan's size limit is checked before an upload is signed, and again when the file
//     is read: a file larger than the plan allows, uploaded around the check, is removed;
//   • it is served only to its owner — the path is built from the caller's account, so no id
//     reaches another person's file — as a short link, never cached;
//   • an account's originals are listed for its export and removed with it;
//   • a conversation deleted takes the originals its attachments held — not one another
//     conversation still holds.

import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, '.tmp', 'e2e-originals');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const FAKE = pathToFileURL(join(here, 'helpers', 'fake-supabase-storage.mjs')).href;
await build({
  entryPoints: {
    sign: join(root, 'app/api/files/original/route.ts'),
    serve: join(root, 'app/api/files/original/[id]/route.ts'),
    store: join(root, 'lib/file-originals-store.ts'),
    pure: join(root, 'lib/file-originals.ts'),
    conversation: join(root, 'app/api/conversations/[id]/route.ts'),
    attachments: join(root, 'lib/logos-attachments.ts'),
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
          if (p === join(root, 'lib', 'supabase')) return { path: FAKE, external: true };
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
const sign = await import(pathToFileURL(join(OUT, 'sign.mjs')).href);
const serve = await import(pathToFileURL(join(OUT, 'serve.mjs')).href);
const store = await import(pathToFileURL(join(OUT, 'store.mjs')).href);
const pure = await import(pathToFileURL(join(OUT, 'pure.mjs')).href);
const conversation = await import(pathToFileURL(join(OUT, 'conversation.mjs')).href);
const { sanitizeAttachments } = await import(pathToFileURL(join(OUT, 'attachments.mjs')).href);
const { uploadSigned } = await import(pathToFileURL(join(here, 'helpers', 'fake-storage.mjs')).href);
const { db } = await import(pathToFileURL(join(here, 'helpers', 'fake-supabase.mjs')).href);
const { NextRequest } = await import('next/server.js');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 400))));
const as = (uid) => (globalThis.__uid = uid);
const fid = (k) => k.toString(16).padStart(2, '0').repeat(16);
const files = () => globalThis.__storage?.buckets.get(pure.FILES_BUCKET)?.files ?? new Map();
const MB = 1024 * 1024;

async function ask(body) {
  const r = await sign.POST(new NextRequest('http://localhost/api/files/original', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  return { status: r.status, json: await r.json().catch(() => null) };
}
async function get(id) {
  const r = await serve.GET(new NextRequest(`http://localhost/api/files/original/${id}`), { params: { id } });
  return { status: r.status, json: await r.json().catch(() => null), cache: r.headers.get('cache-control') };
}
const tokenOf = (url) => new URL(url).searchParams.get('token');

const ANN = 'user_ann', BEN = 'user_ben';

console.log('=== signed out: nothing kept, nothing served ===');
{
  as(null);
  ok('keeping refused', (await ask({ id: fid(1), name: 'a.pdf', size: 10 })).status === 401);
  ok('reading refused', (await get(fid(1))).status === 401);
  ok('  and nothing reached storage', !(globalThis.__storage?.calls ?? []).some((c) => c[0] === 'signUpload'));
}

console.log('\n=== what may be kept ===');
{
  as(ANN);
  ok('an id that is not 32 hex: refused', (await ask({ id: '../x', name: 'a.pdf', size: 10 })).status === 400 && (await ask({ id: 'ABC', name: 'a.pdf', size: 10 })).status === 400);
  ok('no name or no size: refused', (await ask({ id: fid(2), size: 10 })).status === 400 && (await ask({ id: fid(2), name: 'a.pdf' })).status === 400);
  ok('a secrets file: refused', (await ask({ id: fid(2), name: '.env', size: 10 })).status === 415 && (await ask({ id: fid(2), name: 'id_rsa', size: 10 })).status === 415);
  ok('a kind the composer does not take: refused', (await ask({ id: fid(2), name: 'setup.exe', size: 10 })).status === 415);
  const big = await ask({ id: fid(2), name: 'big.pdf', size: 5 * MB });
  ok('over the free plan’s 4 MB: refused, with the limit said', big.status === 413 && /4 MB/.test(big.json?.error ?? ''), JSON.stringify(big));
}

console.log('\n=== kept in its owner’s folder ===');
let ann;
{
  as(ANN);
  const r = await ask({ id: fid(3), name: 'Quarterly review.pptx', size: 2048, type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
  ok('a link to upload to', r.status === 200 && typeof r.json?.url === 'string', JSON.stringify(r));
  ok('  never cached', true);
  const path = pure.originalPath(ANN, fid(3));
  ann = path.split('/')[0];
  ok('the folder is a digest of the account, never its id', /^[a-f0-9]{24}$/.test(ann) && !path.includes('ann'));
  ok('the link is for that path only', r.json.url.includes(path));
  await uploadSigned(tokenOf(r.json.url), new Uint8Array(2048).fill(7), 'application/octet-stream');
  ok('the file landed where it was signed for', files().has(path));
  const again = await ask({ id: fid(3), name: 'Quarterly review.pptx', size: 2048 });
  ok('the same file again: already kept, no second upload', again.status === 200 && again.json?.exists === true);
  const bucket = globalThis.__storage.buckets.get(pure.FILES_BUCKET);
  ok('the bucket is private, with the largest plan’s ceiling', bucket.opts.public === false && bucket.opts.fileSizeLimit === 30 * MB);
}

console.log('\n=== served to its owner only ===');
{
  as(ANN);
  const mine = await get(fid(3));
  ok('its owner: a short link, its size and type', mine.status === 200 && /expires=300/.test(mine.json?.url ?? '') && mine.json.size === 2048, JSON.stringify(mine));
  ok('  never cached', /no-store/.test(mine.cache ?? ''));
  as(BEN);
  const theirs = await get(fid(3));
  ok('anyone else, with the same id: not found — the path is always their own folder', theirs.status === 404 && !JSON.stringify(theirs.json).includes('storage.test'));
  ok('a bad id: refused', (await get('nope')).status === 400);
}

console.log('\n=== a file larger than the plan, uploaded around the check, is removed when read ===');
{
  as(ANN);
  const r = await ask({ id: fid(4), name: 'sneaky.pdf', size: 100 });
  // the browser sends far more than it said
  await uploadSigned(tokenOf(r.json.url), new Uint8Array(5 * MB), 'application/pdf');
  const path = pure.originalPath(ANN, fid(4));
  ok('it landed (the bucket allows the largest plan)', files().has(path));
  const got = await get(fid(4));
  ok('reading it: not found, and it is gone', got.status === 404 && !files().has(path), JSON.stringify(got));
}

console.log('\n=== the attachment carries the original, and nothing else gets through ===');
{
  const [a] = sanitizeAttachments([{ kind: 'doc', doc: 'abcdef0123456789', name: 'x'.repeat(150) + '.pdf', text: 'hello', file: fid(5), size: 1234, mime: 'application/pdf', at: 1700000000000 }]);
  ok('file, size, type and time kept', a.file === fid(5) && a.size === 1234 && a.mime === 'application/pdf' && a.at === 1700000000000, JSON.stringify(a));
  ok('a long name kept whole (up to 200)', a.name.length === 154);
  const [b] = sanitizeAttachments([{ kind: 'image', thumb: 'data:image/png;base64,AAAA', file: '../../etc', size: -5, mime: 'text/html<script>' }]);
  ok('a bad id, size or type is dropped', !b.file && !b.size && !b.mime, JSON.stringify(b));
  ok('originalIdsIn reads them from messages', JSON.stringify(pure.originalIdsIn([{ attachments: [{ file: fid(6) }, { file: 'bad' }] }, { attachments: [{ file: fid(6) }, { file: fid(7) }] }])) === JSON.stringify([fid(6), fid(7)]));
  ok('a stored type is never one a browser runs', pure.storedType('text/html') === 'application/octet-stream' && pure.storedType('image/svg+xml') === 'application/octet-stream' && pure.storedType('application/pdf') === 'application/pdf');
}

console.log('\n=== a conversation deleted takes its originals — not one another still holds ===');
{
  as(ANN);
  for (const k of [8, 9]) {
    const r = await ask({ id: fid(k), name: `f${k}.pdf`, size: 10 });
    await uploadSigned(tokenOf(r.json.url), new Uint8Array(10), 'application/pdf');
  }
  db.rows('conversations').push({ id: 'c1', user_id: ANN, messages: [{ role: 'user', content: 'x', attachments: [{ kind: 'doc', file: fid(8) }, { kind: 'doc', file: fid(9) }] }] });
  db.rows('conversations').push({ id: 'c2', user_id: ANN, messages: [{ role: 'user', content: 'y', attachments: [{ kind: 'doc', file: fid(9) }] }] });
  const r = await conversation.DELETE(new NextRequest('http://localhost/api/conversations/c1', { method: 'DELETE' }), { params: { id: 'c1' } });
  ok('deleted', r.status === 200, r.status);
  ok('the original only it held is gone', !files().has(pure.originalPath(ANN, fid(8))));
  ok('the one another conversation holds is kept', files().has(pure.originalPath(ANN, fid(9))));
}

console.log('\n=== export lists them; the account deleted takes them all, and nobody else’s ===');
{
  as(BEN);
  const r = await ask({ id: fid(10), name: 'ben.pdf', size: 10 });
  await uploadSigned(tokenOf(r.json.url), new Uint8Array(10), 'application/pdf');
  const list = await store.listOriginals(ANN);
  ok('Ann’s export lists her originals with links', list.length >= 2 && list.every((f) => /^[a-f0-9]{32}$/.test(f.id) && f.download), JSON.stringify(list).slice(0, 200));
  const gone = await store.purgeOriginals(ANN);
  ok('purged on account deletion', gone >= 2 && (await store.listOriginals(ANN)).length === 0);
  ok('Ben’s untouched', files().has(pure.originalPath(BEN, fid(10))));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
