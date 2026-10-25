// METACOGNITIVE REGULATION — THE PERSON'S CONTROLS (app/api/mr), AND EVERY
// ROUTE THAT MUST REACH THE LEDGER.
//
// What is held down, through the real route handlers:
//   • GET shows whether MR runs here, their settings, and what MR adjusted —
//     codes and times only — scoped to one conversation on request; a read
//     that failed is said (incomplete), and unreadable settings are null,
//     never the defaults;
//   • PUT sets only enabled and carryAcross, as booleans; research cannot be
//     set here; a database that cannot keep the setting is a 503, not a
//     silent success;
//   • DELETE forgets one conversation's rows or all of them (and stamps the
//     reset); never another person's;
//   • signed out is 401 everywhere;
//   • "forget what Socria worked out" (app/api/account/memory) removes MR's
//     ledger and KEEPS their MR choices; deleting a conversation removes its
//     ledger rows; the account export carries the ledger. None of these three
//     was enforced by any suite before;
//   • the review's privacy findings, through the routes: PUT answers with its
//     write's stamp; GET counts what holds but is not listed; a reset that
//     deleted but could not stamp answers so; every forget marks their
//     settings BEFORE it deletes, so a turn still in flight writes nothing
//     back; a revocation outlives the conversation it was said in; nothing
//     past 180 days is shown or exported, and the daily cron purges it.
//
// Only the database (fake-supabase) and Clerk (fake-clerk: globalThis.__uid
// is the signed-in user) are replaced.

import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve as res } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as MR from './.tmp/mr-under-test.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, '.tmp', 'e2e-mr-api');
const FAKE_DB = join(here, 'helpers', 'fake-supabase.mjs');

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
// The conversation route also releases the pictures its writing held, so it
// gets the database fake with storage beside it (the same in-memory tables).
const FAKE_DB_STORAGE = join(here, 'helpers', 'fake-supabase-storage.mjs');
const swapTo = (fake) => ({
  name: 'swap',
  setup(b) {
    b.onResolve({ filter: /(^|\/)supabase$/ }, (a) => {
      const p = a.path.startsWith('@/') ? join(root, a.path.slice(2)) : res(a.resolveDir, a.path);
      if (p === join(root, 'lib', 'supabase')) return { path: pathToFileURL(fake).href, external: true };
      return undefined;
    });
    b.onResolve({ filter: /^@clerk\/nextjs\/server$/ }, () => ({ path: pathToFileURL(join(here, 'helpers', 'fake-clerk.mjs')).href, external: true }));
    b.onResolve({ filter: /^openai$/ }, () => ({ path: pathToFileURL(join(here, 'helpers', 'fake-openai.mjs')).href, external: true }));
    b.onResolve({ filter: /^server-only$/ }, () => ({ path: join(here, 'helpers', 'server-only-shim.mjs') }));
    b.onResolve({ filter: /^next\/(server|headers)$/ }, (a) => ({ path: `${a.path}.js`, external: true }));
  },
});
for (const [entry, out, fake] of [
  ['app/api/mr/route.ts', 'mr.mjs', FAKE_DB],
  ['app/api/account/memory/route.ts', 'memory.mjs', FAKE_DB],
  ['app/api/conversations/[id]/route.ts', 'conv.mjs', FAKE_DB_STORAGE],
  ['app/api/account/export/route.ts', 'export.mjs', FAKE_DB],
  // the store itself, for a turn's late write (the same fake database)
  ['lib/mr/store.ts', 'store.mjs', FAKE_DB],
]) {
  await build({
    entryPoints: [join(root, entry)], bundle: true, format: 'esm', platform: 'node',
    outfile: join(OUT, out), tsconfig: join(root, 'tsconfig.json'), plugins: [swapTo(fake)],
    external: ['next', 'next/*', 'undici', '@supabase/*', 'stripe', 'resend'], logLevel: 'error',
  });
}

const quiet = (orig) => (...a) => {
  const first = typeof a[0] === 'string' ? a[0] : '';
  if (first.startsWith('[socria') || /^(DELETE|GET|PUT) /.test(first) || first.startsWith('memory clear')) return;
  orig(...a);
};
console.error = quiet(console.error.bind(console));
console.warn = quiet(console.warn.bind(console));

process.env.RATE_LIMIT_DISABLED = '1';
delete process.env.LOGOS_MR;

const mrRoute = await import(pathToFileURL(join(OUT, 'mr.mjs')).href);
const memoryRoute = await import(pathToFileURL(join(OUT, 'memory.mjs')).href);
const convRoute = await import(pathToFileURL(join(OUT, 'conv.mjs')).href);
const exportRoute = await import(pathToFileURL(join(OUT, 'export.mjs')).href);
const store = await import(pathToFileURL(join(OUT, 'store.mjs')).href);
const { db, supabaseAdmin: fakeAdmin } = await import(pathToFileURL(FAKE_DB).href);
const { NextRequest } = await import('next/server.js');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 300))));

const NOW = Date.now();
const PV = MR.MR_POLICY_VERSION;
const FULL = { arm: 'full', ifr: true, shadow: false, source: 'deployment' };

const call = async (method, query = '', body, uid = 'user_a') => {
  globalThis.__uid = uid;
  const init = { method, ...(body !== undefined ? { headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) };
  const r = await mrRoute[method](new NextRequest(`http://localhost/api/mr${query}`, init));
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: r.status, json, text, cache: r.headers.get('cache-control') };
};

/** Every string VALUE in a response, apart from an error sentence meant for the person. */
const values = (v, out = []) => {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => values(x, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (k !== 'error') values(x, out);
  return out;
};
const codesOnly = (v) => values(v).every((s) => s.length <= 80 && !/\s/.test(s));

const decision = (o = {}) => ({
  policyVersion: PV, interventionId: o.id ?? 'a1b2c3d4e5f6a7b8c9d0', action: o.action ?? 'fewer_questions', trigger: o.trigger ?? 'ifr.explicit.stop_questions',
  evidenceRefs: [{ turn: o.turn ?? 2, role: 'user', code: 'explicit.stop_questions' }], target: ['acs'], controls: { questionBudget: { max: 0, enforcement: 'hard' } },
  scope: { kind: o.scope ?? 'conversation' }, expiration: { afterTurn: null, onRevoke: ['explicit.revoke'] }, confidence: 0.9, uncertainty: [],
  evaluationPlan: { primary: 'friction', expect: ['questions=0'], window: 2 }, rollback: { revertTo: 'acs_default', when: [] }, loop: 'fast', issuedAtTurn: o.turn ?? 2,
});
const result = (o = {}) => {
  const turn = o.turn ?? 2;
  const d = o.decision ?? decision({ turn, id: o.id });
  return {
    condition: o.condition ?? FULL,
    state: { version: 1, policyVersion: PV, conversationKey: o.key ?? 'conv_a', turn, goals: [], preferences: [], strategy: { current: 'default', since: 0, source: 'default', changes: [] }, observations: [], uncertainty: [], interventions: o.interventions ?? [{ decision: d, status: 'active' }], outcomes: [], frozenUntilTurn: null, integrity: [] },
    decision: d, assist: { mode: 'inform', questions: 0 }, block: 'Adjusted: they asked you to stop asking questions.', ceiling: null,
    gate: { hardNoQuestions: true, dropUnsupportedClaims: true }, trace: 'mr1', integrity: [], timing: { ms: 4, deliberated: false },
  };
};
const seed = (uid, key, turn, o = {}) => {
  for (const r of MR.rowsForTurn(result({ key, turn, ...o }), { userId: uid, conversationKey: key, now: o.now ?? NOW - 60_000 + turn, arm: (o.condition ?? FULL).arm })) db.rows('mr_ledger').push(r);
};

console.log('\n=== signed out ===');
for (const m of ['GET', 'PUT', 'DELETE']) {
  const r = await call(m, '', m === 'PUT' ? { enabled: false } : undefined, null);
  ok(`${m}: 401`, r.status === 401, r.status);
}

console.log('\n=== GET: what MR runs, their settings, what it adjusted ===');
{
  db.reset();
  let r = await call('GET');
  ok('nothing recorded: MR not active on this deployment, the default settings, no adjustments', r.status === 200 && r.json.active === false && r.json.settings.enabled === true && r.json.settings.carryAcross === false && r.json.adjustments.length === 0 && !r.json.incomplete, r.text);
  ok('  not cached', r.cache === 'no-store');
  process.env.LOGOS_MR = 'shadow';
  ok('  LOGOS_MR=shadow: not active — shadow changes no reply, so there is nothing to offer a switch for', (await call('GET')).json.active === false);
  process.env.LOGOS_MR = 'on';
  ok('  LOGOS_MR=on: active', (await call('GET')).json.active === true);
  delete process.env.LOGOS_MR;

  seed('user_a', 'conv_a', 2);
  seed('user_a', 'conv_b', 5, { id: 'b1b2c3d4e5f6a7b8c9d0', decision: decision({ id: 'b1b2c3d4e5f6a7b8c9d0', turn: 5, action: 'shorter', trigger: 'ifr.explicit.shorter', scope: 'standing' }), condition: { ...FULL, shadow: true } });
  seed('user_b', 'conv_a', 2, { id: 'c1b2c3d4e5f6a7b8c9d0' });
  r = await call('GET');
  const adj = r.json.adjustments;
  ok('two adjustments, theirs only', adj.length === 2, JSON.stringify(adj));
  ok('  newest first', adj[0].action === 'shorter' && adj[1].action === 'fewer_questions');
  ok('  each: turn, when, what, which rule, in force, standing or not, applied or not', adj[1].turn === 2 && typeof adj[1].at === 'number' && adj[1].trigger === 'ifr.explicit.stop_questions' && adj[1].status === 'active' && adj[1].conversation === true && adj[1].standing === false && adj[1].applied === true, JSON.stringify(adj[1]));
  ok('  a shadow decision is shown as not applied; a standing one as standing', adj[0].applied === false && adj[0].standing === true);
  ok('  the response is codes, numbers and booleans — no words', codesOnly(r.json) && !/stop asking|Adjusted/.test(r.text), r.text.slice(0, 300));
  const one = await call('GET', '?conversation=conv_b');
  ok('?conversation= scopes it to one conversation', one.status === 200 && one.json.adjustments.length === 1 && one.json.adjustments[0].action === 'shorter');
  ok('  a malformed conversation id is a 400', (await call('GET', '?conversation=not%20an%20id!')).status === 400);

  // a later turn of conv_a where the adjustment is no longer active
  seed('user_a', 'conv_a', 3, { decision: MR.noneDecision(PV, 'conv_a', 3), interventions: [{ decision: decision(), status: 'revoked', endedAtTurn: 3 }] });
  r = await call('GET', '?conversation=conv_a');
  ok('revoked at a later turn: ended', r.json.adjustments.length === 1 && r.json.adjustments[0].status === 'ended', JSON.stringify(r.json.adjustments));

  // their reset hides what came before it
  db.rows('user_profiles').push({ user_id: 'user_a', updated_at: 1, mr: { version: 1, enabled: true, carryAcross: false, research: null, resetAt: NOW } });
  r = await call('GET');
  ok('nothing from before their last reset is shown', r.json.adjustments.length === 0 && r.json.settings.resetAt === NOW, JSON.stringify(r.json));
  // a row stamped the very millisecond of the reset is before it, as the carry and the research export read it
  seed('user_a', 'conv_c', 4, { now: NOW, id: 'd1b2c3d4e5f6a7b8c9d0', decision: decision({ id: 'd1b2c3d4e5f6a7b8c9d0', turn: 4 }) });
  seed('user_a', 'conv_c', 5, { now: NOW + 1, id: 'e1b2c3d4e5f6a7b8c9d0', decision: decision({ id: 'e1b2c3d4e5f6a7b8c9d0', turn: 5 }) });
  r = await call('GET');
  ok('  the same millisecond as the reset is not shown; the next one is', r.json.adjustments.length === 1 && r.json.adjustments[0].turn === 5, JSON.stringify(r.json.adjustments));

  db.reset();
  db.absent.add('user_profiles');
  seed('user_a', 'conv_a', 2);
  r = await call('GET');
  ok('settings unreadable: null (never the defaults), and said', r.status === 200 && r.json.settings === null && r.json.incomplete?.includes('settings') && r.json.adjustments.length === 1, r.text);
  db.reset();
  db.absent.add('mr_ledger');
  r = await call('GET');
  ok('the ledger unreadable: no adjustments, and said', r.status === 200 && r.json.adjustments.length === 0 && r.json.incomplete?.includes('adjustments') && r.json.settings !== null, r.text);
  db.reset();
  db.missing.user_profiles = new Set(['mr']);
  r = await call('GET');
  ok('the settings column not there yet: defaults, and settingsUnsupported says a change would not be kept', r.json.settings?.enabled === true && r.json.settingsUnsupported === true);
  db.reset();
}

console.log('\n=== PUT: only enabled and carryAcross, only booleans ===');
{
  db.reset();
  db.rows('user_profiles').push({ user_id: 'user_a', profile: 'their own profile', updated_at: 1 });
  let r = await call('PUT', '', { enabled: false });
  ok('MR off for them: saved and returned', r.status === 200 && r.json.ok && r.json.settings.enabled === false && db.tables.user_profiles[0].mr.enabled === false, r.text);
  r = await call('PUT', '', { carryAcross: true });
  ok('  carry-across consent: merged (still off)', r.status === 200 && db.tables.user_profiles[0].mr.carryAcross === true && db.tables.user_profiles[0].mr.enabled === false);
  ok('  the rest of their profile untouched', db.tables.user_profiles[0].profile === 'their own profile');
  ok('  GET reads it back', (await call('GET')).json.settings.enabled === false);
  const before = JSON.stringify(db.tables.user_profiles);
  const bad = [
    ['research', { research: { studyId: 'mr-study-1', consentedAt: 1 } }],
    ['research beside a valid field', { enabled: true, research: { studyId: 'mr-study-1', consentedAt: 1 } }],
    ['a string for a boolean', { enabled: 'false' }],
    ['a number for a boolean', { carryAcross: 1 }],
    ['a key nobody can set', { resetAt: 5 }],
    ['an unknown key', { enabled: true, mood: 'fine' }],
    ['nothing', {}],
    ['an array', [true]],
    ['not JSON', 'enabled=false'],
  ];
  for (const [why, body] of bad) {
    const x = await call('PUT', '', body);
    ok(`  ${why}: 400`, x.status === 400, `${x.status} ${x.text}`);
  }
  ok('  and none of them wrote anything', JSON.stringify(db.tables.user_profiles) === before);
  ok('  research is refused with its reason', /consent/.test((await call('PUT', '', { research: null })).json.error));
  db.reset();
  db.missing.user_profiles = new Set(['mr']);
  r = await call('PUT', '', { enabled: false });
  ok('a database that cannot keep it: 503, and which setting was not kept', r.status === 503 && JSON.stringify(r.json.unsaved) === '["enabled"]', r.text);
  db.reset();
  db.absent.add('user_profiles');
  ok('  a failed read: 500, not a guess written over it', (await call('PUT', '', { enabled: false })).status === 500);
  db.reset();
}

console.log('\n=== DELETE: one conversation, or everything ===');
{
  db.reset();
  seed('user_a', 'conv_a', 2);
  seed('user_a', 'conv_b', 2);
  seed('user_b', 'conv_a', 2);
  let r = await call('DELETE', '?conversation=conv_a');
  ok('one conversation: its rows go', r.status === 200 && !db.tables.mr_ledger.some((x) => x.user_id === 'user_a' && x.conversation_id === 'conv_a'));
  ok('  their other conversation and the other person\'s rows stay', db.tables.mr_ledger.some((x) => x.user_id === 'user_a' && x.conversation_id === 'conv_b') && db.tables.mr_ledger.some((x) => x.user_id === 'user_b' && x.conversation_id === 'conv_a'));
  ok('  a malformed id is a 400', (await call('DELETE', '?conversation=..%2Fall')).status === 400);
  const t0 = Date.now();
  r = await call('DELETE');
  ok('everything: none of their rows left, the other person\'s untouched', r.status === 200 && !db.tables.mr_ledger.some((x) => x.user_id === 'user_a') && db.tables.mr_ledger.some((x) => x.user_id === 'user_b'));
  const stamp = db.tables.user_profiles?.find((x) => x.user_id === 'user_a')?.mr?.resetAt;
  ok('  and the reset is stamped, so a turn still in flight is never read back', typeof stamp === 'number' && stamp >= t0, String(stamp));
  db.reset();
  db.absent.add('mr_ledger');
  ok('a ledger that was never created: nothing to delete, ok', (await call('DELETE')).status === 200);
  db.reset();
}

console.log('\n=== forget what Socria worked out: the ledger goes, their MR settings stay ===');
{
  db.reset();
  seed('user_a', 'conv_a', 2);
  seed('user_b', 'conv_a', 2);
  const settings = { version: 1, enabled: false, carryAcross: true, research: null, resetAt: null };
  db.rows('user_profiles').push({ user_id: 'user_a', profile: 'x', understanding: {}, updated_at: 1, mr: settings });
  globalThis.__uid = 'user_a';
  const r = await memoryRoute.DELETE(new NextRequest('http://localhost/api/account/memory', { method: 'DELETE' }));
  ok('forget-all succeeds', r.status === 200, await r.clone().text());
  ok('  MR\'s ledger rows are gone', !db.tables.mr_ledger.some((x) => x.user_id === 'user_a'));
  ok('  another person\'s are not', db.tables.mr_ledger.some((x) => x.user_id === 'user_b'));
  const kept = db.tables.user_profiles[0].mr;
  ok('  their MR choices are kept (theirs, not something worked out about them)', kept.enabled === false && kept.carryAcross === true && kept.research === null, JSON.stringify(kept));
  ok('  and their reset is stamped (MR\'s own adjustments end; a turn in flight writes nothing back)', typeof kept.resetAt === 'number' && kept.resetAt > 0, JSON.stringify(kept));
  db.reset();
  db.absent.add('mr_ledger');
  const r2 = await memoryRoute.DELETE(new NextRequest('http://localhost/api/account/memory', { method: 'DELETE' }));
  ok('  a ledger never created does not fail forget-all', r2.status === 200);
  db.reset();
}

console.log('\n=== deleting a conversation removes its ledger rows ===');
{
  db.reset();
  db.rows('conversations').push({ id: 'conv_a', user_id: 'user_a', title: 't' }, { id: 'conv_b', user_id: 'user_a', title: 't' });
  seed('user_a', 'conv_a', 2);
  seed('user_a', 'conv_b', 2);
  seed('user_b', 'conv_a', 2);
  globalThis.__uid = 'user_a';
  const r = await convRoute.DELETE(new NextRequest('http://localhost/api/conversations/conv_a', { method: 'DELETE' }), { params: { id: 'conv_a' } });
  ok('the conversation is deleted', r.status === 200, await r.clone().text());
  ok('  and every MR row of it', !db.tables.mr_ledger.some((x) => x.user_id === 'user_a' && x.conversation_id === 'conv_a'));
  ok('  not their other conversation\'s, nor the other person\'s', db.tables.mr_ledger.some((x) => x.conversation_id === 'conv_b') && db.tables.mr_ledger.some((x) => x.user_id === 'user_b'));
  db.reset();
  db.absent.add('mr_ledger');
  db.rows('conversations').push({ id: 'conv_c', user_id: 'user_a' });
  const r2 = await convRoute.DELETE(new NextRequest('http://localhost/api/conversations/conv_c', { method: 'DELETE' }), { params: { id: 'conv_c' } });
  ok('  a ledger never created does not fail the delete', r2.status === 200);

  // the MR cascade fails: said (500) — and the pictures only its writing held are still released,
  // because the row is already gone and a retry would find no draft to release them by
  db.reset();
  const mediaId = 'ab'.repeat(16);
  const path = `${createHash('sha256').update('socria-upload:user_a').digest('hex').slice(0, 24)}/${mediaId}`;
  globalThis.__storage = { buckets: new Map([['socria-write-media', { opts: {}, files: new Map([[path, { bytes: new Uint8Array([1]), type: 'image/png', at: new Date(0).toISOString() }]]) }]]), calls: [] };
  db.rows('conversations').push({ id: 'conv_pic', user_id: 'user_a', title: 't', draft: { title: 'Essay', html: '', doc: { v: 2, title: 'Essay', blocks: [{ id: 'i0', t: 'img', text: '', src: `m:${mediaId}` }], versions: [] } } });
  seed('user_a', 'conv_pic', 2);
  db.missing.mr_ledger = new Set(['conversation_id']);
  const r3 = await convRoute.DELETE(new NextRequest('http://localhost/api/conversations/conv_pic', { method: 'DELETE' }), { params: { id: 'conv_pic' } });
  ok('an MR cascade that fails is a 500, not a silent success', r3.status === 500, r3.status);
  ok('  and the picture its writing held is released all the same', !globalThis.__storage.buckets.get('socria-write-media').files.has(path), JSON.stringify(globalThis.__storage.calls));
  delete globalThis.__storage;
  db.reset();
}

console.log('\n=== the export carries the ledger ===');
{
  db.reset();
  seed('user_a', 'conv_a', 2);
  seed('user_b', 'conv_a', 2);
  globalThis.__uid = 'user_a';
  globalThis.__users = { user_a: { emails: [] } };
  const r = await exportRoute.GET(new NextRequest('http://localhost/api/account/export'));
  const out = JSON.parse(await r.text());
  ok('their ledger rows are in it, and only theirs', Array.isArray(out.mrLedger) && out.mrLedger.length === db.tables.mr_ledger.filter((x) => x.user_id === 'user_a').length && out.mrLedger.length > 0, JSON.stringify(out.mrLedger?.length));
  ok('  with a note on what they are', typeof out.mrNote === 'string' && /codes/.test(out.mrNote));
  ok('  a readable ledger is not reported incomplete', !(out.incomplete ?? []).includes('mrLedger'), JSON.stringify(out.incomplete));
  db.reset();
  db.absent.add('mr_ledger');
  const r2 = await exportRoute.GET(new NextRequest('http://localhost/api/account/export'));
  const out2 = JSON.parse(await r2.text());
  ok('  a ledger never created: an empty section, not a failed export', Array.isArray(out2.mrLedger) && out2.mrLedger.length === 0 && !(out2.incomplete ?? []).includes('mrLedger'));
  db.reset();
  db.tables.mr_ledger = [];
  // a live table that fails: the export must say so
  db.missing.mr_ledger = new Set(['record']);
  const r3 = await exportRoute.GET(new NextRequest('http://localhost/api/account/export'));
  const out3 = JSON.parse(await r3.text());
  ok('  a ledger that exists but cannot be read: the export says it is incomplete', (out3.incomplete ?? []).includes('mrLedger'), JSON.stringify(out3.incomplete));
  db.reset();
}


// ── the review's privacy findings, through the routes ────────────────
const J = JSON.stringify;
const STOP = 'ifr.explicit.stop_questions';
const QP = Object.getPrototypeOf(fakeAdmin().from('mr_ledger'));
/** Every database call, in order, as [table, op, whether it wrote their MR settings]. */
const trace = () => {
  const seen = [];
  const then = QP.then;
  QP.then = function (res, rej) {
    seen.push([this.table, this.op, !!(this.payload && !Array.isArray(this.payload) && 'mr' in this.payload) || (Array.isArray(this.payload) && this.payload.some((p) => p && 'mr' in p))]);
    return then.call(this, res, rej);
  };
  return { seen, stop: () => (QP.then = then) };
};
/** A turn that began a minute ago and writes its rows only now — waitUntil, after the stream. */
const lateTurn = (key, turn = 2, o = {}) => MR.rowsForTurn(result({ key, turn, ...o }), { userId: 'user_a', conversationKey: key, now: Date.now() - 60_000, arm: 'full' });
const profile = () => db.tables.user_profiles?.find((x) => x.user_id === 'user_a');
/** user_profiles writes fail (a timeout, a lock) while everything else works */
const failingProfileWrites = () => {
  const update = QP.update, insert = QP.insert;
  const broken = function () { this.run = () => ({ data: null, error: { code: '57014' }, count: null }); return this; };
  QP.update = function (p, o) { const q = update.call(this, p, o); return this.table === 'user_profiles' ? broken.call(q) : q; };
  QP.insert = function (r) { const q = insert.call(this, r); return this.table === 'user_profiles' ? broken.call(q) : q; };
  return () => { QP.update = update; QP.insert = insert; };
};

console.log('\n=== PUT answers with the stamp its write left, so the sheet can order two answers (MR-PRIV-5) ===');
{
  db.reset();
  const a = await call('PUT', '', { enabled: false });
  const b = await call('PUT', '', { enabled: true });
  ok('each answer carries the stamp of its own write', typeof a.json.stamp === 'number' && typeof b.json.stamp === 'number', a.text);
  ok('  a later write, a later stamp', b.json.stamp > a.json.stamp, `${a.json.stamp} ${b.json.stamp}`);
  ok('  the stamp is what the account holds', profile().updated_at === b.json.stamp);
  const g = await call('GET');
  ok('  and GET says the same stamp beside the settings it read', g.json.stamp === b.json.stamp && g.json.settings.enabled === true, g.text);
  db.reset();
}

console.log('\n=== GET: what still holds and is not listed, and a "from now on" taken back elsewhere (MR-PRIV-4, MR-PRIV-8) ===');
{
  db.reset();
  const before = Date.now() - 120_000;
  const resetAt = Date.now() - 90_000;
  db.rows('user_profiles').push({ user_id: 'user_a', updated_at: 5, mr: { version: 1, enabled: true, carryAcross: true, research: null, resetAt } });
  // asked before the reset (its decision row is before it); still in force on a turn since
  seed('user_a', 'conv_a', 1, { now: before });
  seed('user_a', 'conv_a', 4, { now: resetAt + 1000, decision: { ...decision(), carried: true }, interventions: [{ decision: decision(), status: 'active' }] });
  let r = await call('GET');
  ok('what they asked for before their reset, still holding where they asked: not listed, but counted', r.json.adjustments.length === 0 && r.json.unlisted === 1, r.text);
  // a standing one, taken back in another conversation since (only their settings still say so)
  const sd = decision({ id: 'f1f2f3f4f5f6f7f8f9f0', turn: 2, scope: 'standing' });
  seed('user_a', 'conv_s', 2, { now: resetAt + 2000, decision: sd, interventions: [{ decision: sd, status: 'active' }] });
  r = await call('GET', '?conversation=conv_s');
  ok('(a standing one, nothing taken back: in every conversation)', r.json.adjustments[0]?.scope === 'standing', r.text);
  profile().mr.revokedStanding = [{ trigger: STOP, at: resetAt + 3000 }]; // seeded above, so present
  r = await call('GET', '?conversation=conv_s');
  ok('  taken back since (their settings keep that): still on where it was said, shown reaching that conversation only', r.json.adjustments[0]?.status === 'active' && r.json.adjustments[0]?.scope === 'conversation', r.text);
  ok('  and the markers the server keeps are not in the settings GET shows', !('revokedStanding' in r.json.settings) && !('forgotten' in r.json.settings));
  db.reset();
}

console.log('\n=== DELETE everything: rows gone but the reset not saved is its own answer (MR-PRIV-9) ===');
{
  db.reset();
  db.rows('user_profiles').push({ user_id: 'user_a', updated_at: 5, mr: { version: 1, enabled: true, carryAcross: false, research: null, resetAt: null } });
  seed('user_a', 'conv_a', 2);
  const restore = failingProfileWrites();
  const tf = trace();
  const r = await call('DELETE');
  tf.stop();
  restore();
  ok('the rows are deleted', !db.tables.mr_ledger.some((x) => x.user_id === 'user_a'));
  ok('  and the answer says exactly that: deleted, not stamped — never the plain failure', r.status === 500 && r.json.ok === false && r.json.deleted === true && r.json.stamped === false, r.text);
  ok('  the stamp was tried again, after the delete too, before it said so', tf.seen.filter(([tb, op, mr]) => tb === 'user_profiles' && op === 'update' && mr).length === 4 && tf.seen.findLastIndex(([tb, op, mr]) => tb === 'user_profiles' && op === 'update' && mr) > tf.seen.findIndex(([tb, op]) => tb === 'mr_ledger' && op === 'delete'), J(tf.seen));
  db.reset();
  seed('user_a', 'conv_a', 2);
  const t = trace();
  const done = await call('DELETE');
  t.stop();
  const stampAt = t.seen.findIndex(([tb, , mr]) => tb === 'user_profiles' && mr);
  const deleteAt = t.seen.findIndex(([tb, op]) => tb === 'mr_ledger' && op === 'delete');
  ok('a reset that works: ok, the reset stamped BEFORE the rows are deleted', done.status === 200 && done.json.ok === true && stampAt >= 0 && stampAt < deleteAt, J(t.seen));
}

console.log('\n=== a turn already in flight writes nothing back (MR-PRIV-11) ===');
{
  // DELETE /api/mr?conversation=
  db.reset();
  seed('user_a', 'conv_a', 2);
  const late = lateTurn('conv_a', 3);
  let t = trace();
  await call('DELETE', '?conversation=conv_a');
  t.stop();
  let markAt = t.seen.findIndex(([tb, , mr]) => tb === 'user_profiles' && mr);
  let delAt = t.seen.findIndex(([tb, op]) => tb === 'mr_ledger' && op === 'delete');
  ok('one conversation forgotten: marked in their settings before its rows go', markAt >= 0 && markAt < delAt && (profile()?.mr?.forgotten ?? []).length === 1, J(t.seen));
  await store.writeRows('user_a', late, Date.now());
  ok('  a turn of it still in flight, writing after the delete, writes nothing', !db.tables.mr_ledger.some((x) => x.conversation_id === 'conv_a'));

  // "forget what Socria worked out"
  db.reset();
  const settings = { version: 1, enabled: false, carryAcross: true, research: null, resetAt: null };
  db.rows('user_profiles').push({ user_id: 'user_a', profile: 'x', understanding: {}, updated_at: 1, mr: settings });
  seed('user_a', 'conv_a', 2);
  globalThis.__uid = 'user_a';
  t = trace();
  const t0 = Date.now();
  const r = await memoryRoute.DELETE(new NextRequest('http://localhost/api/account/memory', { method: 'DELETE' }));
  t.stop();
  markAt = t.seen.findIndex(([tb, , mr]) => tb === 'user_profiles' && mr);
  delAt = t.seen.findIndex(([tb, op]) => tb === 'mr_ledger' && op === 'delete');
  ok('forget what Socria worked out: the reset stamped before MR\'s rows are deleted', r.status === 200 && markAt >= 0 && markAt < delAt && profile()?.mr?.resetAt >= t0, J(t.seen));
  await store.writeRows('user_a', lateTurn('conv_a', 3, { decision: decision({ scope: 'standing', turn: 3 }) }), Date.now());
  ok('  a turn still in flight writes nothing back — not its rows, not a "from now on" to carry', !(db.tables.mr_ledger ?? []).some((x) => x.user_id === 'user_a'));
  const carried = await store.loadForTurn('user_a', 'conv_new', { timeoutMs: 1000, carryAcross: true, resetAt: profile()?.mr?.resetAt ?? null });
  ok('  so nothing is carried into the next conversation', carried.ok && carried.standing.length === 0);
  db.reset();
  db.rows('user_profiles').push({ user_id: 'user_a', profile: 'x', understanding: {}, updated_at: 1, mr: settings });
  seed('user_a', 'conv_a', 2);
  const restore = failingProfileWrites();
  const bad = await memoryRoute.DELETE(new NextRequest('http://localhost/api/account/memory', { method: 'DELETE' }));
  restore();
  const badJson = JSON.parse(await bad.text());
  ok('  a reset that cannot be saved is reported (a turn in flight could put rows back), the rows still gone', bad.status === 500 && badJson.failed?.includes('user_profiles.mr') && !db.tables.mr_ledger.some((x) => x.user_id === 'user_a'), J(badJson));

  // deleting the conversation
  db.reset();
  db.rows('conversations').push({ id: 'conv_a', user_id: 'user_a', title: 't' });
  // a "from now on" (conv_s) taken back in conv_a — and the settings write that kept it there lost
  const sd = decision({ id: 'abcdefabcdefabcdefab', turn: 1, scope: 'standing' });
  seed('user_a', 'conv_s', 1, { decision: sd, interventions: [{ decision: sd, status: 'active' }], now: Date.now() - 300_000 });
  seed('user_a', 'conv_a', 1, { now: Date.now() - 200_000, decision: MR.noneDecision(PV, 'conv_a', 1), interventions: [{ decision: { ...sd, interventionId: 'a0a0a0a0a0a0a0a0a0a0', loop: 'longitudinal' }, status: 'revoked', endedAtTurn: 1, endReason: 'revoke:explicit.revoke' }] });
  globalThis.__uid = 'user_a';
  t = trace();
  const dc = await convRoute.DELETE(new NextRequest('http://localhost/api/conversations/conv_a', { method: 'DELETE' }), { params: { id: 'conv_a' } });
  t.stop();
  markAt = t.seen.findIndex(([tb, , mr]) => tb === 'user_profiles' && mr);
  delAt = t.seen.findIndex(([tb, op]) => tb === 'mr_ledger' && op === 'delete');
  ok('deleting a conversation: it is marked forgotten before its MR rows go', dc.status === 200 && markAt >= 0 && markAt < delAt && (profile()?.mr?.forgotten ?? []).length === 1, J(t.seen));
  ok('  the mark is a hash, never the conversation id', !!profile()?.mr && !J(profile().mr).includes('conv_a'));
  await store.writeRows('user_a', lateTurn('conv_a', 2), Date.now());
  ok('  a turn of it still streaming writes nothing back after the delete', !db.tables.mr_ledger.some((x) => x.conversation_id === 'conv_a'));
  ok('  and what their words took back in it is kept in their settings', J(profile()?.mr?.revokedStanding?.map((x) => x.trigger)) === J([STOP]), J(profile()?.mr));
  const c = await store.loadForTurn('user_a', 'conv_new', { timeoutMs: 1000, carryAcross: true });
  ok('  so the "from now on" they took back there does not come back now the conversation is gone', c.ok && c.standingOk && c.standing.length === 0, J(c.standing.map((x) => x.record.interventionId)));
  db.reset();
}

console.log('\n=== nothing past the 180 days is read or exported, and the daily cron purges it (MR-PRIV-12) ===');
{
  db.reset();
  seed('user_a', 'conv_old', 2, { now: Date.now() - 200 * 86_400_000, id: 'e0e0e0e0e0e0e0e0e0e0', decision: decision({ id: 'e0e0e0e0e0e0e0e0e0e0' }) });
  seed('user_a', 'conv_a', 2);
  const g = await call('GET');
  ok('GET: an expired adjustment is not shown', g.json.adjustments.length === 1 && g.json.adjustments[0].turn === 2 && !g.text.includes('e0e0e0e0'), g.text);
  globalThis.__uid = 'user_a';
  globalThis.__users = { user_a: { emails: [] } };
  const out = JSON.parse(await (await exportRoute.GET(new NextRequest('http://localhost/api/account/export'))).text());
  ok('  the export holds only rows inside the window', out.mrLedger.length > 0 && out.mrLedger.every((x) => x.conversation_id === 'conv_a'), J(out.mrLedger.map((x) => x.conversation_id)));
  ok('  and its note says what happens to them', /kept 180 days and then deleted/.test(out.mrNote), out.mrNote);
  const cron = readFileSync(join(root, 'app/api/cron/lifecycle/route.ts'), 'utf8');
  const housekeeping = cron.slice(cron.indexOf("if (req.nextUrl.searchParams.get('dry') !== '1') {"), cron.indexOf('if (!lifecycleEmailsOn() && !dry)'));
  ok('the daily cron purges expired MR rows, not on a dry run, and before the email switch can end the run', /await purgeExpiredMr\(\);/.test(housekeeping) && /import \{ purgeExpired as purgeExpiredMr \} from '@\/lib\/mr\/store';/.test(cron), housekeeping.slice(0, 200));
  db.reset();
}

console.log(`\nmr api: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
