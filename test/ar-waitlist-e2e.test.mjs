// AR MODE'S EARLY ACCESS, end to end: who is a tester (app/api/ar/access),
// the waitlist everybody else may join (app/api/ar/waitlist), and its export
// (app/api/waitlist/export?list=ar) — the routes as written, with only Clerk
// (fake-clerk) and Storage (fake-storage: a bucket in memory that keeps a real
// bucket's rules, including refusing to overwrite) replaced. What is held:
//
//   • default deny: a stranger, a visitor, an unverified address are never
//     testers; a listed id, a verified listed address, a dashboard admin and
//     the owner's grant are; `*` opens it only off production;
//   • the waitlist keeps an address once — the same address again, in another
//     case, or two requests at once, is still one entry — in a private
//     bucket, apart from the relaunch's list;
//   • something that is not an address is refused and nothing is kept; a
//     storage outage says so (503) rather than claiming success;
//   • the access check tells a signed-in person whether they are already on it;
//   • the export of the AR list is the dashboard's to open, and a 404 to
//     everybody else.

import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, '.tmp', 'e2e-ar-waitlist');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const FAKE_STORAGE = pathToFileURL(join(here, 'helpers', 'fake-supabase-storage.mjs')).href;
await build({
  entryPoints: {
    access: join(root, 'app/api/ar/access/route.ts'),
    join: join(root, 'app/api/ar/waitlist/route.ts'),
    relaunch: join(root, 'app/api/waitlist/route.ts'),
    exportList: join(root, 'app/api/waitlist/export/route.ts'),
    store: join(root, 'lib/waitlist.ts'),
  },
  bundle: true,
  splitting: true,
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
        b.onResolve({ filter: /^next\/headers$/ }, () => ({ path: pathToFileURL(join(here, 'helpers', 'next-headers-shim.mjs')).href, external: true }));
        b.onResolve({ filter: /^next\/server$/ }, (a) => ({ path: `${a.path}.js`, external: true }));
      },
    },
  ],
  external: ['next', 'next/*', '@supabase/*'],
  logLevel: 'error',
});
console.error = () => {};
process.env.RATE_LIMIT_DISABLED = '1';
for (const k of ['SOCRIA_AR_TESTERS', 'SOCRIA_DASHBOARD_ADMINS', 'SOCRIA_ONE_GRANT_HASHES', 'NEXT_PUBLIC_VERCEL_ENV']) delete process.env[k];
process.env.VERCEL_ENV = 'production';

const access = await import(pathToFileURL(join(OUT, 'access.mjs')).href);
const joinRoute = await import(pathToFileURL(join(OUT, 'join.mjs')).href);
const relaunch = await import(pathToFileURL(join(OUT, 'relaunch.mjs')).href);
const exportList = await import(pathToFileURL(join(OUT, 'exportList.mjs')).href);
const store = await import(pathToFileURL(join(OUT, 'store.mjs')).href);
const { NextRequest } = await import('next/server.js');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 500))));
const J = (v) => JSON.stringify(v);
const as = (uid) => (globalThis.__uid = uid);
const sha = (s) => createHash('sha256').update(s.trim().toLowerCase()).digest('hex');

globalThis.__users = {
  user_stranger: { firstName: 'Sam', emails: ['stranger@example.com'] },
  user_tess: { firstName: 'Tess', emails: ['tess@example.com'] },
  user_vera: { firstName: 'Vera', emails: ['vera@example.com'] },
  user_una: { firstName: 'Una', emails: ['una@example.com'], unverified: ['una@example.com'] },
  user_ada: { firstName: 'Ada', emails: ['ada@example.com'] },
  user_gus: { firstName: 'Gus', emails: ['gus-friend@example.com'] },
};

async function ask(uid) {
  as(uid);
  const req = new NextRequest('http://localhost/api/ar/access');
  globalThis.__req = req;
  const r = await access.GET(req);
  return { status: r.status, json: await r.json().catch(() => null), cache: r.headers.get('cache-control') };
}
async function joinAr(body, uid = null, raw = false) {
  as(uid);
  const req = new NextRequest('http://localhost/api/ar/waitlist', { method: 'POST', headers: { 'content-type': 'application/json' }, body: raw ? body : J(body) });
  globalThis.__req = req;
  const r = await joinRoute.POST(req);
  return { status: r.status, json: await r.json().catch(() => null) };
}
async function exported(uid, query = '') {
  as(uid);
  const req = new NextRequest(`http://localhost/api/waitlist/export${query}`);
  globalThis.__req = req;
  const r = await exportList.GET(req);
  return { status: r.status, text: await r.text(), file: r.headers.get('content-disposition') ?? '' };
}
const bucket = () => globalThis.__storage?.buckets.get(store.WAITLIST_BUCKET);
const keys = (folder) => [...(bucket()?.files.keys() ?? [])].filter((p) => p.startsWith(`${folder}/`));

console.log('\n=== who is a tester ===');
{
  const out = await ask(null);
  ok('a visitor is not, and is told so plainly', out.status === 200 && J(out.json) === J({ tester: false, signedIn: false, email: null, waitlisted: false }), J(out));
  ok('  the answer is never cached', /no-store/.test(out.cache ?? ''));
  const s = await ask('user_stranger');
  ok('a signed-in stranger is not — and their own address is offered for the waitlist', s.json?.tester === false && s.json.signedIn === true && s.json.email === 'stranger@example.com' && s.json.waitlisted === false, J(s.json));

  process.env.SOCRIA_AR_TESTERS = 'user_tess, VERA@example.com, una@example.com';
  ok('a listed account id is', (await ask('user_tess')).json?.tester === true);
  ok('a listed address, verified, in any case, is', (await ask('user_vera')).json?.tester === true);
  ok('  an address that was never verified is not', (await ask('user_una')).json?.tester === false);
  ok('  and a stranger still is not', (await ask('user_stranger')).json?.tester === false);
  delete process.env.SOCRIA_AR_TESTERS;
  ok('take a name off the list and they are not, at once', (await ask('user_tess')).json?.tester === false);

  process.env.SOCRIA_DASHBOARD_ADMINS = 'user_ada';
  ok('whoever may see the developer dashboard is', (await ask('user_ada')).json?.tester === true);
  delete process.env.SOCRIA_DASHBOARD_ADMINS;

  ok('without the owner’s grant, an account is not', (await ask('user_gus')).json?.tester === false);
  process.env.SOCRIA_ONE_GRANT_HASHES = sha('gus-friend@example.com');
  ok('  with it — a hash of a verified address, no address written anywhere — it is', (await ask('user_gus')).json?.tester === true);
  delete process.env.SOCRIA_ONE_GRANT_HASHES;

  process.env.SOCRIA_AR_TESTERS = '*';
  ok('`*` means nothing on production', (await ask('user_stranger')).json?.tester === false && (await ask(null)).json?.tester === false);
  process.env.VERCEL_ENV = 'preview';
  ok('  and opens it to everybody on a preview, visitors too', (await ask('user_stranger')).json?.tester === true && (await ask(null)).json?.tester === true);
  process.env.VERCEL_ENV = 'production';
  delete process.env.SOCRIA_AR_TESTERS;
}

console.log('\n=== the waitlist ===');
{
  const a = await joinAr({ email: 'Ada.L+ar@Example.com' });
  ok('an address goes on it, no account needed', a.status === 200 && J(a.json) === J({ ok: true }), J(a));
  ok('  kept in the AR list, by the address itself', J(keys('ar')) === J([`ar/${store.nameFor('ada.l+ar@example.com')}`]), J(keys('ar')));
  ok('  in a private bucket', globalThis.__storage.calls.some(([op, name, opts]) => op === 'createBucket' && name === store.WAITLIST_BUCKET && opts?.public === false));
  const again = await joinAr({ email: 'ada.l+ar@example.com' });
  ok('the same address again is "already", not a second entry', again.status === 200 && J(again.json) === J({ ok: true, already: true }) && keys('ar').length === 1, J(again));
  const shout = await joinAr({ email: '  ADA.L+AR@EXAMPLE.COM ' });
  ok('  in another case, with spaces, it is still the same one', shout.json?.already === true && keys('ar').length === 1);
  const [r1, r2] = await Promise.all([joinAr({ email: 'race@example.com' }), joinAr({ email: 'race@example.com' })]);
  ok('two requests at once for a new address keep it once', [r1.json?.already, r2.json?.already].filter(Boolean).length === 1 && keys('ar').length === 2, J([r1, r2]));
  for (const [what, body, raw] of [['not an address', { email: 'not an email' }], ['no address', {}], ['a number', { email: 42 }], ['not JSON at all', '{nope', true]]) {
    const r = await joinAr(body, null, raw);
    ok(`${what} is refused with a reason, and nothing is kept`, r.status === 400 && r.json?.ok === false && /email address/.test(r.json?.error ?? '') && keys('ar').length === 2, J(r));
  }
  ok('the relaunch’s list is a different list: nothing of AR’s is in it', keys('entries').length === 0);

  const s = await joinAr({ email: 'stranger@example.com' }, 'user_stranger');
  ok('a signed-in person joins the same way', s.json?.ok === true && !s.json.already);
  const told = await ask('user_stranger');
  ok('  and AR Mode then knows they are on it', told.json?.tester === false && told.json.waitlisted === true, J(told.json));
  ok('someone not on it is told they are not', (await ask('user_vera')).json?.waitlisted === false);
  // the relaunch's list does not count for AR Mode's
  await relaunch.POST(new NextRequest('http://localhost/api/waitlist', { method: 'POST', headers: { 'content-type': 'application/json' }, body: J({ email: 'vera@example.com' }) }));
  ok('being on the relaunch’s list is not being on AR Mode’s', keys('entries').length === 1 && (await ask('user_vera')).json?.waitlisted === false);

  // an outage: the bucket is gone from under the routes
  const kept = bucket();
  globalThis.__storage.buckets.delete(store.WAITLIST_BUCKET);
  const down = await joinAr({ email: 'later@example.com' });
  ok('when the list cannot be kept, it says so — never a false "you’re on the list"', down.status === 503 && down.json?.ok === false && /could not be reached/.test(down.json?.error ?? ''), J(down));
  const stillAsks = await ask('user_stranger');
  ok('  and the access check still answers', stillAsks.status === 200 && stillAsks.json?.tester === false);
  globalThis.__storage.buckets.set(store.WAITLIST_BUCKET, kept);
  ok('  back up, it keeps addresses again', (await joinAr({ email: 'later@example.com' })).json?.ok === true && keys('ar').length === 4);
  ok('joining never makes anybody a tester', (await ask('user_stranger')).json?.tester === false);
}

console.log('\n=== the export ===');
{
  ok('a stranger is shown nothing at all', (await exported('user_stranger', '?list=ar')).status === 404 && (await exported(null, '?list=ar')).status === 404);
  process.env.SOCRIA_DASHBOARD_ADMINS = 'user_ada';
  const ar = await exported('user_ada', '?list=ar');
  const lines = ar.text.trim().split('\n').map((l) => l.split('\t')[0]);
  ok('the dashboard’s admin gets AR Mode’s list, as ar-waitlist.txt', ar.status === 200 && /attachment; filename="ar-waitlist\.txt"/.test(ar.file), ar.file);
  ok('  every address once, oldest first', J(lines) === J(['ada.l+ar@example.com', 'race@example.com', 'stranger@example.com', 'later@example.com']), J(lines));
  ok('  each with when it joined', ar.text.trim().split('\n').every((l) => /\t\d{4}-\d{2}-\d{2}T/.test(l)));
  const rel = await exported('user_ada');
  ok('the relaunch’s list is still waitlist.txt, and only its own', rel.status === 200 && /filename="waitlist\.txt"/.test(rel.file) && rel.text.trim().split('\t')[0] === 'vera@example.com', `${rel.file} ${rel.text}`);
  ok('  an unknown list name is the relaunch’s, not an error', /filename="waitlist\.txt"/.test((await exported('user_ada', '?list=nope')).file));
  delete process.env.SOCRIA_DASHBOARD_ADMINS;
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
