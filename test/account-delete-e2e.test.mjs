// Deleting an account, and exporting one, end to end through the real routes,
// where two people's words sit side by side: a room.
//
// Ann hosts a room Ben joined, and sat alone in another. When Ann asks to be
// forgotten, her words and her seats go, the room she hosted is closed with
// her name taken off it, the room nobody is left in goes with its words — and
// Ben's words stay his, because deleting one person must never delete
// another's. Each person's export holds their own words and not the other's.
// A purge that fails stops the deletion with the account still there; a
// database that never had the rooms migration holds nothing of theirs there,
// and is stepped over.

import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve as res } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, '.tmp', 'e2e-account-delete');
const FAKE_DB = join(here, 'helpers', 'fake-supabase.mjs');
const FAKE_CLERK = join(here, 'helpers', 'fake-clerk.mjs');
const FAKE_STRIPE = join(here, 'helpers', 'fake-stripe.mjs');

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const swap = {
  name: 'swap',
  setup(b) {
    b.onResolve({ filter: /(^|\/)supabase$/ }, (a) => {
      const p = a.path.startsWith('@/') ? join(root, a.path.slice(2)) : res(a.resolveDir, a.path);
      if (p === join(root, 'lib', 'supabase')) return { path: pathToFileURL(FAKE_DB).href, external: true };
      return undefined;
    });
    b.onResolve({ filter: /^@clerk\/nextjs\/server$/ }, () => ({ path: pathToFileURL(FAKE_CLERK).href, external: true }));
    b.onResolve({ filter: /^stripe$/ }, () => ({ path: pathToFileURL(FAKE_STRIPE).href, external: true }));
    b.onResolve({ filter: /^server-only$/ }, () => ({ path: join(here, 'helpers', 'server-only-shim.mjs') }));
    b.onResolve({ filter: /^next\/(server|headers)$/ }, (a) => ({ path: `${a.path}.js`, external: true }));
  },
};
for (const [name, file] of [['del', 'app/api/account/delete/route.ts'], ['exp', 'app/api/account/export/route.ts']]) {
  await build({
    entryPoints: [join(root, file)],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: join(OUT, `${name}.mjs`),
    tsconfig: join(root, 'tsconfig.json'),
    plugins: [swap],
    packages: 'external',
    logLevel: 'error',
  });
}
const quiet = (orig) => (...a) => {
  const first = typeof a[0] === 'string' ? a[0] : '';
  if (first.startsWith('account delete') || first.startsWith('[')) return;
  orig(...a);
};
console.error = quiet(console.error.bind(console));
console.warn = quiet(console.warn.bind(console));
process.env.RATE_LIMIT_DISABLED = '1';

const { db } = await import(pathToFileURL(FAKE_DB).href);
const { calls: clerkCalls } = await import(pathToFileURL(FAKE_CLERK).href);
const { NextRequest } = await import('next/server.js');
const { DELETE } = await import(pathToFileURL(join(OUT, 'del.mjs')).href);
const { GET: EXPORT } = await import(pathToFileURL(join(OUT, 'exp.mjs')).href);

let pass = 0,
  fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));

const users = () => ({ ann: { firstName: 'Ann', emails: ['ann@example.com'] }, ben: { firstName: 'Ben', emails: ['ben@example.com'] } });
const seed = () => {
  db.reset();
  globalThis.__users = users();
  clerkCalls.length = 0;
  const t = 1_700_000_000_000;
  db.rows('conversations').push(
    { id: 'c_ann', user_id: 'ann', title: 'Ann’s', messages: [], updated_at: t },
    { id: 'c_ben', user_id: 'ben', title: 'Ben’s', messages: [], updated_at: t }
  );
  db.rows('logos_rooms').push(
    { id: 'r_shared', code: 'ABCD', host_user_id: 'ann', seed_session: { note: 'Ann’s opening' }, created_at: t, closed_at: null },
    { id: 'r_alone', code: 'WXYZ', host_user_id: 'ann', seed_session: null, created_at: t, closed_at: null }
  );
  db.rows('logos_room_members').push(
    { room_id: 'r_shared', user_id: 'ann', seat: 'host', display_name: 'Ann', joined_at: t, joined_seq: 0, left_at: null },
    { room_id: 'r_shared', user_id: 'ben', seat: 'guest', display_name: 'Ben', joined_at: t + 1, joined_seq: 1, left_at: null },
    { room_id: 'r_alone', user_id: 'ann', seat: 'host', display_name: 'Ann', joined_at: t, joined_seq: 0, left_at: null }
  );
  db.rows('logos_room_events').push(
    { room_id: 'r_shared', id: 'e1', seq: 1, user_id: 'ann', kind: 'say', payload: { text: 'ANN-WORDS in the shared room' }, created_at: t + 2 },
    { room_id: 'r_shared', id: 'e2', seq: 2, user_id: 'ben', kind: 'say', payload: { text: 'BEN-WORDS in the shared room' }, created_at: t + 3 },
    { room_id: 'r_alone', id: 'e3', seq: 1, user_id: 'ann', kind: 'say', payload: { text: 'ANN-WORDS alone' }, created_at: t + 4 }
  );
};
const as = (uid) => (globalThis.__uid = uid);
const del = async () => {
  const r = await DELETE(new NextRequest('http://localhost/api/account/delete', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirm: 'DELETE' }) }));
  return { status: r.status, json: await r.json().catch(() => null) };
};
const exportFor = async (uid) => {
  as(uid);
  const r = await EXPORT(new NextRequest('http://localhost/api/account/export', { method: 'GET' }));
  const text = await r.text();
  return { status: r.status, text, json: JSON.parse(text) };
};
const rows = (t) => db.rows(t);

console.log('\neach export holds its owner’s words in a room, and only theirs');
{
  seed();
  const a = await exportFor('ann');
  ok('Ann’s export: 200', a.status === 200);
  ok('  her two seats', a.json.roomSeats?.length === 2, JSON.stringify(a.json.roomSeats));
  ok('  the two rooms they were in', a.json.rooms?.length === 2);
  ok('  with the opening words of the rooms she hosted', a.json.rooms?.some((r) => r.id === 'r_shared' && r.seed_session?.note === 'Ann’s opening'));
  ok('  her own words, both rooms', a.json.yourRoomEvents?.length === 2 && a.text.includes('ANN-WORDS in the shared room') && a.text.includes('ANN-WORDS alone'));
  ok('  and not Ben’s', !a.text.includes('BEN-WORDS'));
  ok('  and no room section is marked incomplete', !(a.json.incomplete ?? []).some((x) => /room/i.test(x)), JSON.stringify(a.json.incomplete));
  const b = await exportFor('ben');
  ok('Ben’s export: his one seat and his own words', b.json.roomSeats?.length === 1 && b.text.includes('BEN-WORDS') && !b.text.includes('ANN-WORDS'));
  ok('  and not the opening words of a room Ann hosted', !b.text.includes('Ann’s opening'));
}

console.log('\nAnn asks to be forgotten');
{
  seed();
  as('ann');
  const r = await del();
  ok('deleted: 200', r.status === 200, JSON.stringify(r.json));
  ok('  the rooms are named among what was deleted', ['logos_room_events', 'logos_room_members', 'logos_rooms'].every((t) => r.json?.deleted?.includes(t)), JSON.stringify(r.json?.deleted));
  ok('her words are gone from every room', !rows('logos_room_events').some((e) => e.user_id === 'ann'));
  ok('her seats are gone', !rows('logos_room_members').some((m) => m.user_id === 'ann'));
  const shared = rows('logos_rooms').find((x) => x.id === 'r_shared');
  ok('the room she hosted with Ben stays, closed, with her name taken off it', !!shared && shared.host_user_id === null && typeof shared.closed_at === 'number', JSON.stringify(shared));
  // The seed is the session she opened the room around — every word in it is hers.
  ok('  and her opening words go with her', shared?.seed_session === null, JSON.stringify(shared?.seed_session));
  ok('the room nobody is left in goes', !rows('logos_rooms').some((x) => x.id === 'r_alone'));
  ok('Ben’s words stay his', rows('logos_room_events').some((e) => e.user_id === 'ben' && e.payload?.text === 'BEN-WORDS in the shared room'));
  ok('  and so does his seat', rows('logos_room_members').some((m) => m.user_id === 'ben' && m.room_id === 'r_shared'));
  ok('  and his conversation', rows('conversations').some((c) => c.id === 'c_ben'));
  ok('her conversation is gone', !rows('conversations').some((c) => c.id === 'c_ann'));
  ok('and the sign-in account last', clerkCalls.some((c) => c[0] === 'deleteUser' && c[1] === 'ann') && !globalThis.__users.ann && !!globalThis.__users.ben);
}

console.log('\na room purge that fails stops the deletion, with the account still there');
{
  seed();
  // A live table that refuses the delete (not a missing migration).
  db.missing.logos_room_events = new Set(['user_id']);
  as('ann');
  const r = await del();
  ok('500, and it says where it stopped', r.status === 500 && r.json?.failedAt === 'rooms', `${r.status} ${JSON.stringify(r.json)}`);
  ok('  the sign-in account was not deleted', !clerkCalls.some((c) => c[0] === 'deleteUser') && !!globalThis.__users.ann);
}

console.log('\na database without the rooms migration holds nothing of theirs there');
{
  seed();
  for (const t of ['logos_rooms', 'logos_room_members', 'logos_room_events']) db.absent.add(t);
  as('ann');
  const r = await del();
  ok('the deletion finishes', r.status === 200, `${r.status} ${JSON.stringify(r.json)}`);
  ok('  and the account is gone', !globalThis.__users.ann);
}

console.log(`\naccount-delete-e2e: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
