// The newsletter — the box on sign-up, the row it writes, the switch, the
// links that stop it, and the route that sends it.
//
// What this guards, in order of how badly it would go wrong:
//   - an issue reaching someone who did not ask for it, or who said stop;
//   - an issue reaching a university address added for student access;
//   - anyone getting the same issue twice;
//   - an issue going out without its unsubscribe link or postal address;
//   - the newsletter's switch and the notes' switch leaking into each other;
//   - a rehearsal that sends, or claims, anything at all;
//   - words reaching subscribers that were not committed as an issue.

import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve as res } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  NEWSLETTER_KIND,
  NEWSLETTER_LIST,
  decideNewsletter,
  findIssue,
  isIssueId,
  issueKind,
  issueProblems,
  newsletterCopy,
  newsletterUnsubscribeUrl,
  unsubscribeScope,
} from './.tmp/newsletter.mjs';
import { NEWSLETTER_ISSUES } from './.tmp/newsletter-issues.mjs';
import { newsletterEmailsOn, newsletterPostalAddress, sendEmail } from './.tmp/email.mjs';
import { unsubscribeToken, verifyUnsubscribeToken } from './.tmp/lifecycle.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

const GOOD = {
  id: 'good-one',
  subject: 'A subject',
  paragraphs: ['One.', 'Two.'],
  link: { label: 'Open Socria', path: '/chat' },
};
const BASE = 'https://socria.app';
const POSTAL = 'Socria, 1 Test Way, Austin, TX 78701';

console.log('=== issue ids ===');
{
  for (const id of ['a', 'x1', '2026-10-documents', 'a'.repeat(40)]) ok(`valid: ${id.slice(0, 20)}`, isIssueId(id));
  for (const id of ['', '-a', 'a-', 'A', 'a_b', 'a b', 'a'.repeat(41), 'a/b', null, 7]) ok(`invalid: ${JSON.stringify(id)}`, !isIssueId(id));
  ok('the ledger kind', issueKind('x') === 'newsletter:x');
  ok('the subscription kind', NEWSLETTER_KIND === 'newsletter');
}

console.log('\n=== what is wrong with an issue ===');
{
  ok('a good issue has no problems', issueProblems(GOOD).length === 0);
  const bad = (patch) => issueProblems({ ...GOOD, ...patch });
  ok('bad id', bad({ id: 'Bad Id' }).length === 1);
  ok('empty subject', bad({ subject: '  ' }).length === 1);
  ok('long subject', bad({ subject: 'x'.repeat(121) }).length === 1);
  ok('no paragraphs', bad({ paragraphs: [] }).length === 1);
  ok('an empty paragraph', bad({ paragraphs: ['One.', ' '] }).length === 1);
  ok('markup in a paragraph', bad({ paragraphs: ['<b>Bold</b>'] }).length === 1);
  ok('a "<" in prose is not markup', bad({ paragraphs: ['If a < b, then b > a.'] }).length === 0);
  ok('link off the site (https)', bad({ link: { label: 'Out', path: 'https://evil.example' } }).length === 1);
  ok('link off the site (//)', bad({ link: { label: 'Out', path: '//evil.example' } }).length === 1);
  ok('link with a space', bad({ link: { label: 'Out', path: '/a b' } }).length === 1);
  ok('link without a label', bad({ link: { label: ' ', path: '/chat' } }).length === 1);
  ok('no link is fine', bad({ link: undefined }).length === 0);
}

console.log('\n=== the committed issues ===');
{
  ok('a list', Array.isArray(NEWSLETTER_ISSUES));
  const ids = NEWSLETTER_ISSUES.map((i) => i.id);
  ok('ids are unique', new Set(ids).size === ids.length);
  for (const i of NEWSLETTER_ISSUES) {
    const p = issueProblems(i);
    ok(`issue ${i.id} has no problems`, p.length === 0, p.join('; '));
    ok(`issue ${i.id} renders`, !!newsletterCopy(i, { base: BASE, unsubscribeUrl: `${BASE}/u`, postalAddress: POSTAL }));
    // The Core models and the Core chat were archived (docs/ARCHIVE.md): an
    // issue describes only what a subscriber can use today.
    const words = [i.subject, i.preheader ?? '', ...i.paragraphs, i.link?.label ?? ''].join(' ');
    ok(`issue ${i.id} never says Core`, !/\bCore\b/.test(words), words.match(/.{0,60}\bCore\b.{0,60}/)?.[0]);
  }
  ok('findIssue by id', findIssue(NEWSLETTER_ISSUES, ids[0]) === NEWSLETTER_ISSUES[0]);
  ok('findIssue: unknown', findIssue(NEWSLETTER_ISSUES, 'no-such-issue') === null);
  ok('findIssue: not an id', findIssue(NEWSLETTER_ISSUES, '../x') === null && findIssue(NEWSLETTER_ISSUES, undefined) === null);
}

console.log('\n=== the unsubscribe link ===');
{
  const t = unsubscribeToken('user_x', 'secret');
  const url = new URL(newsletterUnsubscribeUrl(`${BASE}/`, 'user_x', t));
  ok('to the unsubscribe route', url.origin === BASE && url.pathname === '/api/email/unsubscribe');
  ok('carries the id', url.searchParams.get('u') === 'user_x');
  ok('carries a token that verifies', verifyUnsubscribeToken('user_x', url.searchParams.get('t'), 'secret'));
  ok('scoped to the newsletter', url.searchParams.get('l') === NEWSLETTER_LIST);
  ok('scope: newsletter', unsubscribeScope('newsletter') === 'newsletter');
  for (const v of [undefined, null, '', 'all', 'NEWSLETTER', 'notes']) ok(`scope: ${JSON.stringify(v)} → all`, unsubscribeScope(v) === 'all');
}

console.log('\n=== the decision ===');
{
  const d = (o) => decideNewsletter({ issue: GOOD, subscribed: true, alreadySent: false, address: 'a@example.com', ...o });
  ok('ready → send to the address', d({}).send === true && d({}).to === 'a@example.com');
  ok('a draft never sends', d({ issue: { ...GOOD, draft: true } }).reason === 'draft');
  ok('not subscribed', d({ subscribed: false }).reason === 'not-subscribed');
  ok('already sent', d({ alreadySent: true }).reason === 'already-sent');
  ok('no address (student-only, or gone)', d({ address: null }).reason === 'no-address');
  ok('a draft outranks everything', d({ issue: { ...GOOD, draft: true }, subscribed: false }).reason === 'draft');
}

console.log('\n=== the copy ===');
{
  const ctx = { base: `${BASE}/`, unsubscribeUrl: `${BASE}/api/email/unsubscribe?u=U&t=T&l=newsletter`, postalAddress: POSTAL };
  ok('no postal address → nothing to send', newsletterCopy(GOOD, { ...ctx, postalAddress: '  ' }) === null);
  ok('an issue with problems → nothing to send', newsletterCopy({ ...GOOD, link: { label: 'x', path: '//e' } }, ctx) === null);
  const issue = { ...GOOD, subject: '  Spaced  ', preheader: 'Before you open it', paragraphs: ['Tom & Jerry’s "quotes".', 'Two.'] };
  const c = newsletterCopy(issue, ctx);
  ok('subject trimmed', c.subject === 'Spaced');
  ok('text: every paragraph', c.text.includes('Tom & Jerry’s "quotes".') && c.text.includes('Two.'));
  ok('text: the link, on the site', c.text.includes('Open Socria: https://socria.app/chat'));
  ok('text: why it came', c.text.includes('because you are subscribed to the Socria newsletter'));
  ok('text: unsubscribe', c.text.includes(ctx.unsubscribeUrl));
  ok('text: postal address', c.text.includes(POSTAL));
  ok('html: escaped', c.html.includes('Tom &amp; Jerry’s &quot;quotes&quot;.') && !c.html.includes('Tom & Jerry'));
  ok('html: unsubscribe link', c.html.includes(`href="${ctx.unsubscribeUrl.replace(/&/g, '&amp;')}"`));
  ok('html: postal address', c.html.includes(POSTAL));
  ok('html: preheader, hidden', /display:none[^>]*>Before you open it</.test(c.html));
  const plain = newsletterCopy({ ...GOOD, link: undefined }, ctx);
  ok('no preheader, no hidden block', !plain.html.includes('display:none'));
  ok('no link, no link line', !plain.text.includes('Open Socria'));
}

console.log('\n=== two switches, never one ===');
{
  const saved = { ...process.env };
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return { ok: true, json: async () => ({ id: 'x' }) }; };
  for (const k of ['LIFECYCLE_EMAILS', 'NEWSLETTER_EMAILS', 'NEWSLETTER_POSTAL_ADDRESS']) delete process.env[k];
  process.env.EMAIL_SECRET = 's';
  process.env.RESEND_API_KEY = 're_x';
  const msg = { to: 'a@example.com', subject: 's', text: 't' };

  ok('newsletter switch: unset is off', newsletterEmailsOn() === false);
  process.env.LIFECYCLE_EMAILS = 'on';
  let r = await sendEmail({ ...msg, stream: 'newsletter' });
  ok('notes on does not send a newsletter', r.ok === false && r.reason === 'off' && calls === 0);
  r = await sendEmail(msg);
  ok('...and a note still goes', r.ok === true && calls === 1);

  delete process.env.LIFECYCLE_EMAILS;
  process.env.NEWSLETTER_EMAILS = 'on';
  ok('newsletter switch: on', newsletterEmailsOn() === true);
  r = await sendEmail(msg);
  ok('newsletter on does not send a note', r.ok === false && r.reason === 'off' && calls === 1);
  r = await sendEmail({ ...msg, stream: 'newsletter' });
  ok('...and an issue goes', r.ok === true && calls === 2);
  process.env.NEWSLETTER_EMAILS = 'On ';
  ok('"On " counts, as for the notes', newsletterEmailsOn() === true);
  process.env.NEWSLETTER_EMAILS = 'true';
  ok('"true" does not', newsletterEmailsOn() === false);

  ok('postal: unset → null', newsletterPostalAddress() === null);
  process.env.NEWSLETTER_POSTAL_ADDRESS = '   ';
  ok('postal: blank → null', newsletterPostalAddress() === null);
  process.env.NEWSLETTER_POSTAL_ADDRESS = `  ${POSTAL}  `;
  ok('postal: trimmed', newsletterPostalAddress() === POSTAL);

  globalThis.fetch = realFetch;
  for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
  Object.assign(process.env, saved);
}

// ── the routes, end to end, against the in-memory database and Clerk ──

const OUT = join(here, '.tmp', 'e2e-newsletter');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const FAKE_DB = join(here, 'helpers', 'fake-supabase.mjs');
const swap = { name: 'swap', setup(b) {
  b.onResolve({ filter: /(^|\/)supabase$/ }, (a) => {
    const p = a.path.startsWith('@/') ? join(root, a.path.slice(2)) : res(a.resolveDir, a.path);
    if (p === join(root, 'lib', 'supabase')) return { path: pathToFileURL(FAKE_DB).href, external: true };
    return undefined;
  });
  b.onResolve({ filter: /(^|\/)newsletter-issues$/ }, () => ({ path: pathToFileURL(join(here, 'helpers', 'fake-newsletter-issues.mjs')).href, external: true }));
  b.onResolve({ filter: /^@clerk\/nextjs\/server$/ }, () => ({ path: pathToFileURL(join(here, 'helpers', 'fake-clerk.mjs')).href, external: true }));
  b.onResolve({ filter: /^server-only$/ }, () => ({ path: join(here, 'helpers', 'server-only-shim.mjs') }));
  b.onResolve({ filter: /^next\/(server|headers)$/ }, (a) => ({ path: `${a.path}.js`, external: true }));
} };
await build({
  entryPoints: {
    preferences: join(root, 'app/api/email/preferences/route.ts'),
    unsubscribe: join(root, 'app/api/email/unsubscribe/route.ts'),
    newsletter: join(root, 'app/api/email/newsletter/route.ts'),
  },
  bundle: true, format: 'esm', platform: 'node', outdir: OUT, outExtension: { '.js': '.mjs' },
  tsconfig: join(root, 'tsconfig.json'), plugins: [swap],
  external: ['next', 'next/*', 'undici', '@supabase/*', 'stripe', 'resend', '@upstash/*'], logLevel: 'error',
});
const quiet = (orig) => (...a) => { if (typeof a[0] === 'string' && /^(lifecycle store|email|email recipients)/.test(a[0])) return; orig(...a); };
console.warn = quiet(console.warn.bind(console));

Object.assign(process.env, {
  RATE_LIMIT_DISABLED: '1',
  CRON_SECRET: 'cron-test-secret',
  EMAIL_SECRET: 'email-test-secret',
  RESEND_API_KEY: 're_test',
  NEXT_PUBLIC_SITE_URL: BASE,
  NEWSLETTER_POSTAL_ADDRESS: POSTAL,
});
delete process.env.NEWSLETTER_EMAILS;
delete process.env.LIFECYCLE_EMAILS;
delete process.env.SOCRIA_EDU_DOMAINS;

const { db } = await import(pathToFileURL(FAKE_DB).href);
const prefs = await import(pathToFileURL(join(OUT, 'preferences.mjs')).href);
const unsub = await import(pathToFileURL(join(OUT, 'unsubscribe.mjs')).href);
const letter = await import(pathToFileURL(join(OUT, 'newsletter.mjs')).href);
const { NextRequest } = await import('next/server.js');

// The provider: every send recorded, and a refusal for whichever address a
// test names.
const sent = [];
let refuse = new Set();
globalThis.fetch = async (url, init) => {
  const body = JSON.parse(init.body);
  if (refuse.has(body.to[0])) return { ok: false, status: 500, json: async () => ({}) };
  sent.push({ url: String(url), ...body });
  return { ok: true, json: async () => ({ id: `em_${sent.length}` }) };
};

const rows = (kind) => db.rows('lifecycle_emails').filter((r) => !kind || r.kind === kind);
const has = (uid, kind) => rows(kind).some((r) => r.user_id === uid);
const as = (uid) => { globalThis.__uid = uid; };
const json = async (r) => ({ status: r.status, body: await r.json() });
const put = (body) => prefs.PUT(new NextRequest(`${BASE}/api/email/preferences`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
const getPrefs = () => prefs.GET(new NextRequest(`${BASE}/api/email/preferences`));
const tok = (u) => unsubscribeToken(u, process.env.EMAIL_SECRET);
const q = (o) => new URLSearchParams(o).toString();

console.log('\n=== the sign-up box and the switch (preferences) ===');
{
  db.reset();
  as(null);
  ok('signed out: GET 401', (await getPrefs()).status === 401);
  ok('signed out: PUT 401', (await put({ newsletter: true })).status === 401);

  as('user_a');
  let r = await json(await getPrefs());
  ok('a new account: notes on, newsletter off', r.status === 200 && r.body.lifecycle === true && r.body.newsletter === false);

  // What the sign-up form does once the new session is active.
  r = await json(await put({ newsletter: true }));
  ok('subscribe → 200', r.status === 200 && r.body.newsletter === true && !('lifecycle' in r.body));
  const row = rows('newsletter').find((x) => x.user_id === 'user_a');
  ok('one row, with when', !!row && typeof row.created_at === 'number' && row.sent_at === null);
  ok('only the subscription was written', rows().length === 1);
  r = await json(await put({ newsletter: true }));
  ok('subscribing twice is one row', r.status === 200 && rows('newsletter').length === 1);
  r = await json(await getPrefs());
  ok('GET says subscribed', r.body.newsletter === true && r.body.lifecycle === true);

  for (const bad of [{}, { newsletter: 'yes' }, { lifecycle: true, newsletter: 1 }, { lifecycle: null }, null]) {
    ok(`400 for ${JSON.stringify(bad)}`, (await put(bad)).status === 400);
  }
  ok('nothing changed by the refusals', rows().length === 1);

  r = await json(await put({ lifecycle: false }));
  ok('notes off leaves the newsletter alone', r.status === 200 && has('user_a', 'unsubscribed') && has('user_a', 'newsletter'));
  r = await json(await put({ lifecycle: true, newsletter: false }));
  ok('both at once', r.status === 200 && !has('user_a', 'unsubscribed') && !has('user_a', 'newsletter'));
  r = await json(await getPrefs());
  ok('GET agrees', r.body.newsletter === false && r.body.lifecycle === true);

  db.absent.add('lifecycle_emails');
  r = await json(await getPrefs());
  ok('store missing: both read off', r.status === 200 && r.body.newsletter === false && r.body.lifecycle === false);
  ok('store missing: subscribing says it failed', (await put({ newsletter: true })).status === 500);
  db.absent.delete('lifecycle_emails');
}

console.log('\n=== the links that stop it (unsubscribe) ===');
{
  db.reset();
  as(null);
  const sub = async (u) => { as(u); await put({ newsletter: true }); as(null); };
  await sub('user_b');

  const nlQuery = q({ u: 'user_b', t: tok('user_b'), l: 'newsletter' });
  let r = await unsub.GET(new NextRequest(`${BASE}/api/email/unsubscribe?${nlQuery}`));
  let html = await r.text();
  ok('newsletter link: asks first', r.status === 200 && html.includes('Unsubscribe from the newsletter?'));
  ok('...carrying its scope into the form', html.includes('name="l" value="newsletter"'));
  ok('...and a GET changes nothing', has('user_b', 'newsletter'));

  r = await unsub.POST(new NextRequest(`${BASE}/api/email/unsubscribe?${nlQuery}`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click' }));
  html = await r.text();
  ok('one-click: done', r.status === 200 && html.includes('You will not get the Socria newsletter again'));
  ok('...the newsletter stopped', !has('user_b', 'newsletter'));
  ok('...and the notes did not', !has('user_b', 'unsubscribed'));

  await sub('user_b');
  r = await unsub.POST(new NextRequest(`${BASE}/api/email/unsubscribe`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: nlQuery }));
  ok('the page\'s own button (form body) stops it too', r.status === 200 && !has('user_b', 'newsletter') && !has('user_b', 'unsubscribed'));

  await sub('user_b');
  const allQuery = q({ u: 'user_b', t: tok('user_b') });
  r = await unsub.GET(new NextRequest(`${BASE}/api/email/unsubscribe?${allQuery}`));
  html = await r.text();
  ok('a note\'s link: says it stops everything', html.includes('Stop these emails?') && html.includes('the newsletter, if you get it') && !html.includes('name="l"'));
  r = await unsub.POST(new NextRequest(`${BASE}/api/email/unsubscribe?${allQuery}`, { method: 'POST' }));
  html = await r.text();
  ok('...and does', r.status === 200 && has('user_b', 'unsubscribed') && !has('user_b', 'newsletter') && html.includes('no notes, and no newsletter'));

  await sub('user_c');
  const forged = q({ u: 'user_c', t: tok('user_b'), l: 'newsletter' });
  r = await unsub.POST(new NextRequest(`${BASE}/api/email/unsubscribe?${forged}`, { method: 'POST' }));
  ok('another person\'s token: 400', r.status === 400);
  ok('...and nothing changed', has('user_c', 'newsletter'));
  r = await unsub.POST(new NextRequest(`${BASE}/api/email/unsubscribe?${q({ u: 'user_c', t: 'nope', l: 'newsletter' })}`, { method: 'POST' }));
  ok('a bad token: 400, nothing changed', r.status === 400 && has('user_c', 'newsletter'));

  as('user_c');
  r = await unsub.POST(new NextRequest(`${BASE}/api/email/unsubscribe?l=newsletter`, { method: 'POST' }));
  ok('signed in, no token: stops their own', r.status === 200 && !has('user_c', 'newsletter'));
  as(null);

  db.absent.add('lifecycle_emails');
  r = await unsub.POST(new NextRequest(`${BASE}/api/email/unsubscribe?${q({ u: 'user_c', t: tok('user_c'), l: 'newsletter' })}`, { method: 'POST' }));
  ok('store missing: says it did not save', r.status === 500 && (await r.text()).includes('That did not save'));
  db.absent.delete('lifecycle_emails');
}

console.log('\n=== sending an issue ===');
{
  db.reset();
  sent.length = 0;
  as(null);
  globalThis.__users = {
    user_1: { emails: ['one@example.com'] },
    user_2: { emails: ['two@mavs.uta.edu'] },                      // student address only
    user_3: { emails: ['three@mavs.uta.edu', 'three@example.com'] }, // student address is primary
    user_4: { emails: ['four@example.com'] },                      // never subscribed
    // user_5 is subscribed and no longer in Clerk
  };
  for (const u of ['user_1', 'user_2', 'user_3', 'user_5']) {
    db.rows('lifecycle_emails').push({ user_id: u, kind: 'newsletter', created_at: 1, due_at: null, sent_at: null });
  }
  const call = async (body, bearer = process.env.CRON_SECRET) => {
    const headers = { 'content-type': 'application/json' };
    if (bearer) headers.authorization = `Bearer ${bearer}`;
    return json(await letter.POST(new NextRequest(`${BASE}/api/email/newsletter`, { method: 'POST', headers, body: JSON.stringify(body) })));
  };

  const cron = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;
  ok('no CRON_SECRET: 503', (await call({ issue: 'ready-issue' }, 'x')).status === 503);
  process.env.CRON_SECRET = cron;
  ok('no bearer: 401', (await call({ issue: 'ready-issue' }, null)).status === 401);
  ok('wrong bearer: 401', (await call({ issue: 'ready-issue' }, 'cron-test-secreT')).status === 401);
  ok('unknown issue: 404', (await call({ issue: 'no-such' })).status === 404);
  ok('not an issue id: 404', (await call({ issue: '../../etc' })).status === 404);
  ok('words in the body are not an issue: 404', (await call({ issue: { subject: 'hi', paragraphs: ['x'] } })).status === 404);
  ok('`only` must be a list of ids', (await call({ issue: 'ready-issue', only: 'user_1' })).status === 400);

  let r = await call({ issue: 'ready-issue' });
  ok('a rehearsal by default', r.status === 200 && r.body.mode === 'rehearsal');
  ok('...counts the list', r.body.subscribers === 4 && r.body.pending === 4 && r.body.alreadyHave === 0 && r.body.done === true);
  ok('...would send to two', r.body.counts['would-send'] === 2, JSON.stringify(r.body.counts));
  ok('...and not to the student-only or the gone', r.body.counts['no-address'] === 2);
  ok('...names what a send still needs', r.body.missing.includes('NEWSLETTER_EMAILS=on') && r.body.missing.length === 1);
  ok('...shows the words', r.body.preview?.subject === 'What is new' && r.body.preview.text.includes(POSTAL) && r.body.preview.text.includes('l=newsletter'));
  ok('...and sends and claims nothing', sent.length === 0 && rows('newsletter:ready-issue').length === 0);

  r = await call({ issue: 'draft-issue' });
  ok('a draft can be rehearsed', r.status === 200 && r.body.counts['would-send'] === 2 && r.body.missing.includes('the issue is marked draft'));

  r = await call({ issue: 'ready-issue', send: true });
  ok('switch off: 409, naming it', r.status === 409 && r.body.missing.includes('NEWSLETTER_EMAILS=on'));
  ok('...nothing sent or claimed', sent.length === 0 && rows('newsletter:ready-issue').length === 0);

  process.env.NEWSLETTER_EMAILS = 'on';
  r = await call({ issue: 'draft-issue', send: true });
  ok('a draft never sends: 409', r.status === 409 && r.body.missing.includes('the issue is marked draft'));
  r = await call({ issue: 'bad-issue', send: true });
  ok('a broken issue never sends: 409', r.status === 409 && r.body.missing.some((m) => m.includes('link')));
  delete process.env.NEWSLETTER_POSTAL_ADDRESS;
  r = await call({ issue: 'ready-issue', send: true });
  ok('no postal address: 409', r.status === 409 && r.body.missing.includes('NEWSLETTER_POSTAL_ADDRESS'));
  process.env.NEWSLETTER_POSTAL_ADDRESS = POSTAL;
  ok('...still nothing sent', sent.length === 0 && rows('newsletter:ready-issue').length === 0);

  r = await call({ issue: 'ready-issue', send: true, only: ['user_1', 'user_4'] });
  ok('to yourself first: one sent', r.status === 200 && r.body.mode === 'send' && r.body.counts.sent === 1 && sent.length === 1, JSON.stringify(r.body));
  ok('...not to someone who never subscribed, even when named', !sent.some((m) => m.to[0] === 'four@example.com'));
  const m = sent[0];
  ok('...to their address', m.to[0] === 'one@example.com' && m.url === 'https://api.resend.com/emails');
  ok('...with the issue\'s subject', m.subject === 'What is new');
  const lu = m.headers['List-Unsubscribe'];
  ok('...a one-click unsubscribe for the newsletter alone', lu.includes('l=newsletter') && lu.includes('u=user_1') && m.headers['List-Unsubscribe-Post'] === 'List-Unsubscribe=One-Click');
  const link = new URL(lu.slice(1, -1));
  ok('...whose token is theirs', verifyUnsubscribeToken('user_1', link.searchParams.get('t'), process.env.EMAIL_SECRET));
  ok('...and the postal address', m.text.includes(POSTAL) && m.html.includes(POSTAL));
  const claim = rows('newsletter:ready-issue').find((x) => x.user_id === 'user_1');
  ok('...claimed and marked sent', !!claim && typeof claim.sent_at === 'number');

  r = await call({ issue: 'ready-issue', send: true });
  ok('everyone: one more sent', r.status === 200 && r.body.counts.sent === 1 && r.body.alreadyHave === 1 && r.body.done === true, JSON.stringify(r.body));
  ok('...to the address that is not the student one', sent[1]?.to[0] === 'three@example.com');
  ok('...never to a university address', !sent.some((x) => x.to[0].endsWith('mavs.uta.edu')));
  ok('...student-only and gone are skipped, not claimed', r.body.counts['no-address'] === 2 && !has('user_2', 'newsletter:ready-issue') && !has('user_5', 'newsletter:ready-issue'));
  const said = JSON.stringify(r.body);
  ok('...and the answer names nobody', !said.includes('@') && !said.includes('user_'));

  r = await call({ issue: 'ready-issue', send: true });
  ok('again: nobody gets it twice', r.status === 200 && !r.body.counts.sent && sent.length === 2 && r.body.alreadyHave === 2);

  // A refusal from the provider gives the claim back, so the next call can.
  globalThis.__users.user_6 = { emails: ['six@example.com'] };
  db.rows('lifecycle_emails').push({ user_id: 'user_6', kind: 'newsletter', created_at: 2, due_at: null, sent_at: null });
  refuse = new Set(['six@example.com']);
  r = await call({ issue: 'ready-issue', send: true });
  ok('provider refused: counted', r.body.counts.failed === 1 && !has('user_6', 'newsletter:ready-issue'));
  refuse = new Set();
  r = await call({ issue: 'ready-issue', send: true });
  ok('...and sent on the next call', r.body.counts.sent === 1 && sent.at(-1).to[0] === 'six@example.com' && has('user_6', 'newsletter:ready-issue'));

  // Batches.
  for (const n of [7, 8, 9]) {
    globalThis.__users[`user_${n}`] = { emails: [`u${n}@example.com`] };
    db.rows('lifecycle_emails').push({ user_id: `user_${n}`, kind: 'newsletter', created_at: 3, due_at: null, sent_at: null });
  }
  r = await call({ issue: 'ready-issue', send: true, limit: 2 });
  ok('a batch of two', r.body.counts.sent === 2 && r.body.done === false, JSON.stringify(r.body));
  r = await call({ issue: 'ready-issue', send: true, limit: 2 });
  ok('...then the rest, and done', r.body.counts.sent === 1 && r.body.done === true);
  ok('...each person once', new Set(sent.map((x) => x.to[0])).size === sent.length);

  // Notes off is not newsletter off: two switches.
  db.rows('lifecycle_emails').push({ user_id: 'user_1', kind: 'unsubscribed', created_at: 4, due_at: null, sent_at: null });
  r = await call({ issue: 'second-issue', send: true, only: ['user_1'] });
  ok('the notes switched off does not stop an issue they asked for', r.body.counts.sent === 1 && sent.at(-1).to[0] === 'one@example.com');

  // Unsubscribed through an issue's link: gone from the next one.
  await unsub.POST(new NextRequest(`${BASE}/api/email/unsubscribe?${q({ u: 'user_3', t: tok('user_3'), l: 'newsletter' })}`, { method: 'POST' }));
  r = await call({ issue: 'second-issue' });
  ok('an unsubscribe takes them off the list', r.body.subscribers === 7 && !has('user_3', 'newsletter'), String(r.body.subscribers));

  db.absent.add('lifecycle_emails');
  const before = sent.length;
  r = await call({ issue: 'second-issue', send: true });
  ok('ledger unreadable: 503, nobody mailed', r.status === 503 && sent.length === before);
  db.absent.delete('lifecycle_emails');

  // More subscribers than one page of the ledger.
  for (let i = 0; i < 1005; i++) db.rows('lifecycle_emails').push({ user_id: `bulk_${String(i).padStart(4, '0')}`, kind: 'newsletter', created_at: 5, due_at: null, sent_at: null });
  r = await call({ issue: 'second-issue' });
  ok('the whole list is read, page after page', r.status === 200 && r.body.subscribers === 1012, String(r.body.subscribers));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
