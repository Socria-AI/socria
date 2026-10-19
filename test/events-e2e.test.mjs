// SOCRIA EVENTS, END TO END — the real routes, from RSVP to check-in.
//
// Only the database (fake-supabase, which enforces the unique indexes),
// Clerk (fake-clerk) and the network (a fake Google: its OAuth endpoint and
// the Sheets API, holding the spreadsheet in memory; and Resend) are
// replaced. The routes, the store, the staff gate and the sheet sync are the
// code that ships.
//
// What is held down: an RSVP needs no account and returns the attendee's own
// confirmation once; a second RSVP with the same email is refused, not
// duplicated; nothing public lists attendees; attendees check themselves in
// at the venue by the name or email they RSVP'd with, while it is open;
// staff check people in from the door list, once; there are no walk-ins
// (someone without an RSVP RSVPs, then checks in); admins alone edit, export and delete; the sheet holds one
// row per registration, updated in place, and a deleted person leaves it;
// the database stays the source of truth when Google fails.

import { build } from 'esbuild';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve as res } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, '.tmp', 'e2e-events');
const FAKE_DB = join(here, 'helpers', 'fake-supabase.mjs');

const ROUTES = {
  rsvp: 'app/api/events/rsvp/route.ts',
  ticket: 'app/api/events/ticket/route.ts',
  checkin: 'app/api/events/checkin/route.ts',
  staff: 'app/api/events/staff/route.ts',
  admin: 'app/api/events/admin/route.ts',
  adminEvent: 'app/api/events/admin/[id]/route.ts',
  exportCsv: 'app/api/events/admin/[id]/export/route.ts',
  ics: 'app/api/events/[id]/ics/route.ts',
  cron: 'app/api/cron/events/route.ts',
  del: 'app/api/account/delete/route.ts',
};

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
    b.onResolve({ filter: /^@clerk\/nextjs\/server$/ }, () => ({ path: pathToFileURL(join(here, 'helpers', 'fake-clerk.mjs')).href, external: true }));
    b.onResolve({ filter: /^server-only$/ }, () => ({ path: join(here, 'helpers', 'server-only-shim.mjs') }));
    b.onResolve({ filter: /^next\/(server|headers)$/ }, (a) => ({ path: `${a.path}.js`, external: true }));
  },
};
await build({
  entryPoints: Object.fromEntries(Object.entries(ROUTES).map(([k, p]) => [k, join(root, p)])),
  bundle: true,
  format: 'esm',
  platform: 'node',
  outdir: OUT,
  outExtension: { '.js': '.mjs' },
  tsconfig: join(root, 'tsconfig.json'),
  plugins: [swap],
  external: ['next', 'next/*', 'undici', '@supabase/*', 'stripe', 'resend'],
  logLevel: 'error',
});

const quiet = (orig) => (...a) => {
  const first = typeof a[0] === 'string' ? a[0] : '';
  if (/^\[events\]|^email:|account delete/.test(first)) return;
  orig(...a);
};
console.error = quiet(console.error.bind(console));
console.warn = quiet(console.warn.bind(console));

process.env.RATE_LIMIT_DISABLED = '1';
process.env.SOCRIA_DASHBOARD_ADMINS = 'admin@socria.app';
process.env.SOCRIA_EVENT_STAFF = 'door@socria.app';
process.env.NEXT_PUBLIC_SITE_URL = 'https://socria.test';
process.env.CRON_SECRET = 'cron-secret';
process.env.CLERK_SECRET_KEY = 'sk_test';

const R = {};
for (const k of Object.keys(ROUTES)) R[k] = await import(pathToFileURL(join(OUT, `${k}.mjs`)).href);
const { db } = await import(pathToFileURL(FAKE_DB).href);
const { NextRequest } = await import('next/server.js');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));
const J = JSON.stringify;

// ── a fake Google and a fake Resend ─────────────────────────────────────
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const SHEET_ID = 'sheet_1234567890abcdefghij';
const google = { tabs: {}, assertions: [], down: false, mail: [] };
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input.url;
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  if (url.startsWith('https://api.resend.com')) {
    google.mail.push(JSON.parse(init.body));
    return json({ id: 'em_1' });
  }
  if (url === 'https://oauth2.googleapis.com/token') {
    const a = new URLSearchParams(init.body).get('assertion');
    google.assertions.push(a);
    const [h, c, sig] = a.split('.');
    const v = createVerify('RSA-SHA256');
    v.update(`${h}.${c}`);
    if (!v.verify(publicKey, Buffer.from(sig, 'base64url'))) return json({ error: 'invalid_grant' }, 400);
    return json({ access_token: 'ya29.test', expires_in: 3600 });
  }
  if (url.startsWith('https://sheets.googleapis.com/v4/spreadsheets/')) {
    if (google.down) return json({ error: { message: 'backend' } }, 503);
    if ((init.headers?.Authorization ?? '') !== 'Bearer ya29.test') return json({}, 401);
    const rest = decodeURIComponent(url.slice(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}`.length));
    if (rest.startsWith('?fields')) return json({ sheets: Object.keys(google.tabs).map((title) => ({ properties: { title } })) });
    if (rest === ':batchUpdate') {
      const t = JSON.parse(init.body).requests[0].addSheet.properties.title;
      google.tabs[t] = [];
      return json({});
    }
    const m = /^\/values\/'(.+)'!A(\d+):([A-Z])(\d*)(:clear)?/.exec(rest);
    if (m) {
      const [, tab, from, , , clear] = m;
      const grid = (google.tabs[tab] ??= []);
      if (clear) grid.length = Math.min(grid.length, Number(from) - 1);
      else JSON.parse(init.body).values.forEach((row, i) => (grid[Number(from) - 1 + i] = row));
      return json({});
    }
    return json({ error: 'unknown' }, 404);
  }
  return realFetch(input, init);
};

// ── requests ────────────────────────────────────────────────────────────
const req = (path, method, body, headers = {}) =>
  new NextRequest(`https://socria.test${path}`, { method, headers: { 'content-type': 'application/json', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const call = async (mod, path, method, body, params, headers) => {
  const r = await mod[method](req(path, method, body, headers), params ? { params } : undefined);
  const text = await r.text();
  let j = null;
  try { j = JSON.parse(text); } catch {}
  return { status: r.status, j, text, headers: r.headers };
};
const as = (who) => { globalThis.__uid = who; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Until no sheet sync is running (a sync after a change runs in the background, with retries). */
const settle = async () => {
  await sleep(20);
  for (let i = 0; i < 300; i++) {
    const busy = db.rows('event_sheet_sync').some((r) => r.lease_until && r.lease_until > 0);
    if (!busy) return;
    await sleep(20);
  }
};

const EVENT = {
  id: 'in-public-002', title: 'Socria: In Public 002', summary: 'An interactive event about building Socria in public.', description: 'About.',
  location: 'Maverick Hall, Room 1309, University of Texas at Arlington', starts_at: null, ends_at: null, timezone: 'America/Chicago', date_confirmed: false,
  tentative_note: 'Target: Wednesday, November 4, 2026 (tentative).', status: 'open', capacity: null, expectations: ['A candid look'], self_checkin: false, created_at: 1, updated_at: 1,
};
const rsvp = (o = {}) => ({ eventId: 'in-public-002', fullName: 'Maya Patel', email: 'Maya@Gmail.com', interest: 'ai', source: 'instagram', marketingConsent: false, utm: { source: 'instagram', campaign: 'in-public-002' }, website: '', elapsedMs: 9000, ...o });

db.reset();
db.rows('events').push({ ...EVENT });
globalThis.__users = {
  user_admin: { emails: ['admin@socria.app'] },
  user_door: { emails: ['door@socria.app'] },
  user_rando: { emails: ['rando@x.com'] },
  user_sneaky: { emails: ['admin@socria.app'], unverified: ['admin@socria.app'] },
};
as(null);

console.log('\n=== an RSVP: no account, one row, the confirmation once ===');
let token, regId;
{
  const r = await call(R.rsvp, '/api/events/rsvp', 'POST', rsvp());
  ok('a signed-out visitor can RSVP', r.status === 201, `${r.status} ${r.text}`);
  token = r.j?.token;
  ok('they get their confirmation: first name, code, event — and the secret, once', r.j?.ticket?.firstName === 'Maya' && /^[A-Z2-9]{6}$/.test(r.j.ticket.code) && /^[A-Za-z0-9_-]{43}$/.test(token) && r.j.ticket.event.id === 'in-public-002');
  ok('the answer never carries the planning note or a date that is not confirmed', !r.text.includes('Target') && r.j.ticket.event.when.confirmed === false);
  ok('the answer is not cacheable', r.headers.get('cache-control') === 'no-store');
  const rows = db.rows('event_registrations');
  regId = rows[0]?.id;
  ok('one row, registered, not attended', rows.length === 1 && rows[0].attendance === 'registered' && rows[0].checked_in_at === null);
  ok('the secret is stored only as a hash', rows[0].token_hash !== token && rows[0].token_hash.length === 64 && !J(rows).includes(token));
  ok('email as typed, and lowercased for matching', rows[0].email === 'Maya@Gmail.com' && rows[0].email_norm === 'maya@gmail.com');
  ok('no consent unless ticked, and no consent time', rows[0].marketing_consent === false && rows[0].consent_at === null);
  ok('the link’s tags are kept as tokens', rows[0].utm_source === 'instagram' && rows[0].utm_campaign === 'in-public-002');
  ok('no account is made', Object.keys(globalThis.__users).length === 4);

  const again = await call(R.rsvp, '/api/events/rsvp', 'POST', rsvp({ email: 'maya@gmail.com', fullName: 'M. Patel' }));
  ok('the same email again is refused, not duplicated', again.status === 409 && again.j.code === 'duplicate' && db.rows('event_registrations').length === 1);

  const consent = await call(R.rsvp, '/api/events/rsvp', 'POST', rsvp({ email: 'sam@mavs.uta.edu', fullName: 'Sam Lee', marketingConsent: true, interest: 'other', interestOther: 'Design', source: undefined }));
  const sam = db.rows('event_registrations').find((r) => r.email_norm === 'sam@mavs.uta.edu');
  ok('a .edu address works the same, and ticked consent is kept with its time', consent.status === 201 && sam.marketing_consent === true && typeof sam.consent_at === 'number' && sam.interest_other === 'Design');

  ok('a missing name is refused, on that field', (await call(R.rsvp, '/api/events/rsvp', 'POST', rsvp({ fullName: '', email: 'x@y.com' }))).j.field === 'fullName');
  ok('a bad email is refused, on that field', (await call(R.rsvp, '/api/events/rsvp', 'POST', rsvp({ email: 'nope' }))).j.field === 'email');
  const bot = await call(R.rsvp, '/api/events/rsvp', 'POST', rsvp({ email: 'bot@x.com', website: 'http://spam' }));
  ok('a bot (hidden field filled) gets nowhere', bot.status === 400 && !db.rows('event_registrations').some((r) => r.email_norm === 'bot@x.com'));
  ok('a form sent too fast gets nowhere', (await call(R.rsvp, '/api/events/rsvp', 'POST', rsvp({ email: 'fast@x.com', elapsedMs: 300 }))).status === 400);
  ok('an unknown event is a 404', (await call(R.rsvp, '/api/events/rsvp', 'POST', rsvp({ eventId: 'nope-event' }))).status === 404);
  ok('a cross-site form post is refused', (await call(R.rsvp, '/api/events/rsvp', 'POST', rsvp({ email: 'x2@y.com' }), undefined, { origin: 'https://evil.example' })).status === 403);
}

console.log('\n=== the attendee’s own link, and only theirs ===');
{
  const t = await call(R.ticket, '/api/events/ticket', 'POST', { token });
  ok('the secret opens their confirmation', t.status === 200 && t.j.ticket.firstName === 'Maya');
  ok('it does not show their email or anyone else', !t.text.includes('gmail') && !t.text.includes('Sam'));
  ok('a wrong secret opens nothing', (await call(R.ticket, '/api/events/ticket', 'POST', { token: 'x'.repeat(43) })).status === 404);
  ok('a malformed one neither', (await call(R.ticket, '/api/events/ticket', 'POST', { token: '../../etc' })).status === 404);
}

console.log('\n=== the door list: staff only ===');
{
  as(null);
  ok('signed out: no lookup', (await call(R.staff, '/api/events/staff', 'POST', { action: 'lookup', eventId: 'in-public-002', q: 'maya' })).status === 403);
  as('user_rando');
  ok('a signed-in non-staff account: no lookup', (await call(R.staff, '/api/events/staff', 'POST', { action: 'lookup', eventId: 'in-public-002', q: 'maya' })).status === 403);
  ok('…and no check-in', (await call(R.staff, '/api/events/staff', 'POST', { action: 'checkin', eventId: 'in-public-002', registrationId: regId })).status === 403);
  as('user_sneaky');
  ok('an admin address that is not verified is nobody', (await call(R.staff, '/api/events/staff', 'POST', { action: 'lookup', eventId: 'in-public-002', q: 'maya' })).status === 403);

  as('user_door');
  ok('there is no QR-scan lookup any more: check-in is by name or email at the venue', (await call(R.staff, '/api/events/staff', 'POST', { action: 'resolve', token })).status === 404);
  const look = await call(R.staff, '/api/events/staff', 'POST', { action: 'lookup', eventId: 'in-public-002', q: 'maya' });
  ok('lookup by name finds them, with counts', look.j.people.length === 1 && look.j.total === 2 && look.j.attended === 0);
  ok('the door never sees full emails or answers', !look.text.includes('Gmail.com') && !look.text.includes('instagram'));
  const code = db.rows('event_registrations').find((r) => r.id === regId).code;
  ok('lookup by code finds them (no phone needed)', (await call(R.staff, '/api/events/staff', 'POST', { action: 'lookup', eventId: 'in-public-002', q: code.toLowerCase() })).j.people[0]?.id === regId);

  const first = await call(R.staff, '/api/events/staff', 'POST', { action: 'checkin', eventId: 'in-public-002', registrationId: regId });
  const row = db.rows('event_registrations').find((r) => r.id === regId);
  ok('staff confirm: attended, with the time and who', first.j.checkedIn === true && row.attendance === 'attended' && typeof row.checked_in_at === 'number' && row.checked_in_by === 'user_door');
  const at = row.checked_in_at;
  await settle();
  const second = await call(R.staff, '/api/events/staff', 'POST', { action: 'checkin', eventId: 'in-public-002', registrationId: regId });
  ok('a second check-in is reported, not repeated — the first time stands', second.j.already === true && db.rows('event_registrations').find((r) => r.id === regId).checked_in_at === at);
  ok('a registration from another event is refused', (await call(R.staff, '/api/events/staff', 'POST', { action: 'checkin', eventId: 'other-event-x', registrationId: regId })).status === 404);

  const before = db.rows('event_registrations').length;
  ok('there are no walk-ins: staff can’t create registrations at the door', (await call(R.staff, '/api/events/staff', 'POST', { action: 'walkin', eventId: 'in-public-002', fullName: 'Walk In' })).status === 400 && db.rows('event_registrations').length === before);
  const undo = await call(R.staff, '/api/events/staff', 'POST', { action: 'undo', eventId: 'in-public-002', registrationId: regId });
  ok('a mistaken check-in can be undone', undo.status === 200 && db.rows('event_registrations').find((r) => r.id === regId).attendance === 'registered');
  await call(R.staff, '/api/events/staff', 'POST', { action: 'checkin', eventId: 'in-public-002', registrationId: regId });
  ok('door staff cannot export', (await R.exportCsv.GET(req('/api/events/admin/in-public-002/export', 'GET'), { params: { id: 'in-public-002' } })).status === 404);
  ok('door staff cannot edit the event', (await call(R.adminEvent, '/api/events/admin/in-public-002', 'PATCH', { title: 'x' }, { id: 'in-public-002' })).status === 403);
  ok('door staff cannot delete', (await call(R.adminEvent, '/api/events/admin/in-public-002', 'POST', { action: 'delete', registrationId: regId }, { id: 'in-public-002' })).status === 403);
}

console.log('\n=== admins: edit, export, delete ===');
{
  as('user_admin');
  const bad = await call(R.adminEvent, '/api/events/admin/in-public-002', 'PATCH', { date_confirmed: true }, { id: 'in-public-002' });
  ok('confirming a date without a start time is refused', bad.status === 400);
  ok('so the calendar file does not exist yet', (await R.ics.GET(req('/api/events/in-public-002/ics', 'GET'), { params: { id: 'in-public-002' } })).status === 404);
  const good = await call(R.adminEvent, '/api/events/admin/in-public-002', 'PATCH', { starts_at: Date.UTC(2026, 10, 5, 0), ends_at: Date.UTC(2026, 10, 5, 1, 30), date_confirmed: true }, { id: 'in-public-002' });
  ok('with a start, the date can be confirmed', good.status === 200 && good.j.event.date_confirmed === true);
  const ics = await R.ics.GET(req('/api/events/in-public-002/ics', 'GET'), { params: { id: 'in-public-002' } });
  const icsText = await ics.text();
  ok('then the calendar file exists, with public facts only', ics.status === 200 && icsText.includes('DTSTART:20261105T000000Z') && icsText.includes('Maverick Hall') && !icsText.includes('Maya'));
  const csv = await R.exportCsv.GET(req('/api/events/admin/in-public-002/export', 'GET'), { params: { id: 'in-public-002' } });
  const csvText = await csv.text();
  ok('admins export CSV with the sheet’s columns, uncached', csv.status === 200 && csvText.startsWith('Registration ID,Event,Full Name,Email') && csvText.includes('Maya Patel') && csv.headers.get('cache-control') === 'no-store');
  ok('the export never carries the secret’s hash', !csvText.includes(db.rows('event_registrations')[0].token_hash));
  const created = await call(R.admin, '/api/events/admin', 'POST', { id: 'in-public-003', title: 'Socria: In Public 003' });
  ok('a new event starts as a draft', created.status === 201 && created.j.event.status === 'draft');
  ok('…and a draft takes no RSVPs', (await call(R.rsvp, '/api/events/rsvp', 'POST', rsvp({ eventId: 'in-public-003', email: 'z@z.com' }))).status === 404);
  ok('a route word cannot be an event address', (await call(R.admin, '/api/events/admin', 'POST', { id: 'admin', title: 'x' })).status === 400);
}

console.log('\n=== the Google Sheet: one row per registration, updated in place ===');
{
  as('user_admin');
  const off = await call(R.adminEvent, '/api/events/admin/in-public-002', 'POST', { action: 'sync' }, { id: 'in-public-002' });
  ok('without credentials, sync says it is not connected — and claims nothing', off.j.status === 'unconfigured');
  process.env.EVENTS_SHEET_ID = SHEET_ID;
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON = Buffer.from(JSON.stringify({ client_email: 'events@socria.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) })).toString('base64');
  const s = await call(R.adminEvent, '/api/events/admin/in-public-002', 'POST', { action: 'sync' }, { id: 'in-public-002' });
  const grid = google.tabs['in-public-002'];
  ok('with credentials, the event gets its own tab', s.j.status === 'synced' && Array.isArray(grid), J(s.j));
  ok('the service account signs its own request (RS256), and the claim asks only for Sheets', (() => {
    const claim = JSON.parse(Buffer.from(google.assertions[0].split('.')[1], 'base64url').toString());
    return claim.iss === 'events@socria.iam.gserviceaccount.com' && claim.scope === 'https://www.googleapis.com/auth/spreadsheets' && claim.exp - claim.iat === 3600;
  })());
  ok('a header, then one row per registration', grid[0][0] === 'Registration ID' && grid.length === 1 + db.rows('event_registrations').filter((r) => r.event_id === 'in-public-002').length);
  const mayaRow = () => grid.findIndex((r) => r[2] === 'Maya Patel');
  const before = mayaRow();
  ok('Maya is attended in the sheet', grid[before][8] === 'Attended' && grid[before][9] !== '');
  as('user_door');
  await call(R.staff, '/api/events/staff', 'POST', { action: 'undo', eventId: 'in-public-002', registrationId: regId });
  await settle();
  ok('a change updates her existing row — no second row', grid.filter((r) => r[2] === 'Maya Patel').length === 1 && grid[mayaRow()][8] === 'Registered' && mayaRow() === before);
  await call(R.staff, '/api/events/staff', 'POST', { action: 'checkin', eventId: 'in-public-002', registrationId: regId });
  await settle();
  ok('…and back to attended, still one row', grid.filter((r) => r[2] === 'Maya Patel').length === 1 && grid[mayaRow()][8] === 'Attended');
  const rowsBefore = grid.length;
  google.down = true;
  await call(R.rsvp, '/api/events/rsvp', 'POST', rsvp({ email: 'late@x.com', fullName: 'Late Comer' }));
  await settle();
  const st = db.rows('event_sheet_sync').find((r) => r.event_id === 'in-public-002');
  ok('when Google is down, the RSVP still succeeds and the database has it', db.rows('event_registrations').some((r) => r.email_norm === 'late@x.com'));
  ok('…the failure is recorded and the change left pending', st.dirty === true && /503|write|read/i.test(st.last_error ?? ''), J(st));
  google.down = false;
  const cron = await call(R.cron, '/api/cron/events', 'GET', undefined, undefined, { authorization: 'Bearer cron-secret' });
  ok('the daily sweep catches the sheet up', cron.j?.synced >= 1 && grid.length === rowsBefore + 1 && db.rows('event_sheet_sync').find((r) => r.event_id === 'in-public-002').dirty === false, J(cron.j));
  ok('the sweep needs its secret', (await call(R.cron, '/api/cron/events', 'GET', undefined, undefined, { authorization: 'Bearer wrong' })).status === 401);
  ok('no formula reaches the sheet', (await call(R.rsvp, '/api/events/rsvp', 'POST', rsvp({ email: 'f@x.com', fullName: '=IMPORTXML("x")' }))).status === 201 && (await settle(), grid.some((r) => r[2] === `'=IMPORTXML("x")`)));
}

console.log('\n=== cancelling, and deleting an account, take people out of the sheet ===');
{
  as(null);
  const t = await call(R.rsvp, '/api/events/rsvp', 'POST', rsvp({ email: 'cancel@x.com', fullName: 'Will Cancel' }));
  await settle();
  const grid = google.tabs['in-public-002'];
  ok('registered, and in the sheet', grid.some((r) => r[2] === 'Will Cancel'));
  const c = await call(R.ticket, '/api/events/ticket', 'DELETE', { token: t.j.token });
  await settle();
  ok('cancelling deletes the registration outright', c.j?.deleted === true && !db.rows('event_registrations').some((r) => r.email_norm === 'cancel@x.com'));
  ok('…and its row leaves the sheet', !grid.some((r) => r[2] === 'Will Cancel'));
  ok('a checked-in attendee cannot cancel from the link', (await call(R.ticket, '/api/events/ticket', 'DELETE', { token })).status === 409);

  globalThis.__users.user_maya = { emails: ['maya@gmail.com'] };
  as('user_maya');
  const del = await call(R.del, '/api/account/delete', 'DELETE', { confirm: 'DELETE' });
  ok('deleting a Socria account removes RSVPs under its verified email', !db.rows('event_registrations').some((r) => r.email_norm === 'maya@gmail.com'), `${del.status} ${del.text.slice(0, 200)}`);
  await settle();
  ok('…from the sheet too', !google.tabs['in-public-002'].some((r) => r[2] === 'Maya Patel'));
}

console.log('\n=== check-in at the venue: how everyone comes in ===');
{
  as(null);
  const ck = (o = {}) => call(R.checkin, '/api/events/checkin', 'POST', { eventId: 'in-public-002', fullName: 'Rita Moreno', email: 'rita.m@gmail.com', interest: 'business', source: 'campus', website: '', elapsedMs: 9000, ...o });
  await call(R.rsvp, '/api/events/rsvp', 'POST', rsvp({ email: 'jordan.lee@gmail.com', fullName: 'Jordan Lee', interest: undefined, source: undefined }));
  await call(R.rsvp, '/api/events/rsvp', 'POST', rsvp({ email: 'priya@mavs.uta.edu', fullName: 'Priya Nair' }));
  await call(R.rsvp, '/api/events/rsvp', 'POST', rsvp({ email: 'alex.one@gmail.com', fullName: 'Alex Kim' }));
  await call(R.rsvp, '/api/events/rsvp', 'POST', rsvp({ email: 'alex.two@gmail.com', fullName: 'Alex Kim' }));
  const shut = await ck();
  ok('closed until an admin opens it, so the link can’t be used from home', shut.status === 403 && shut.j.code === 'not-open');
  as('user_door');
  ok('door staff cannot open it', (await call(R.adminEvent, '/api/events/admin/in-public-002', 'PATCH', { self_checkin: true }, { id: 'in-public-002' })).status === 403);
  as('user_admin');
  ok('an admin opens it', (await call(R.adminEvent, '/api/events/admin/in-public-002', 'PATCH', { self_checkin: true }, { id: 'in-public-002' })).j.event.self_checkin === true);
  as(null);
  const count = () => db.rows('event_registrations').length;
  let n0 = count();
  const j1 = await ck({ fullName: 'Jordan Lee', email: 'JORDAN.LEE@gmail.com', interest: 'ai', source: 'instagram' });
  const jordan = db.rows('event_registrations').find((r) => r.email_norm === 'jordan.lee@gmail.com');
  ok('the RSVP email finds their RSVP: checked in, not duplicated', j1.status === 200 && j1.j.firstName === 'Jordan' && count() === n0 && jordan.attendance === 'attended' && jordan.checked_in_by === 'self');
  ok('…and the questions they skipped at RSVP are filled in', jordan.interest === 'ai' && jordan.source === 'instagram');
  ok('a second check-in says they already are', (await ck({ fullName: 'Jordan Lee', email: 'jordan.lee@gmail.com' })).j.already === true && count() === n0);
  const p1 = await ck({ fullName: 'priya NAIR', email: 'priya.personal@gmail.com' });
  ok('a different email but their RSVP name: matched to that RSVP', p1.status === 200 && count() === n0 && db.rows('event_registrations').find((r) => r.email_norm === 'priya@mavs.uta.edu').attendance === 'attended');
  const a1 = await ck({ fullName: 'Alex Kim', email: 'alex.new@gmail.com' });
  ok('a shared name and a new email can’t pick an RSVP: they’re added instead, nobody else is checked in', a1.status === 200 && count() === n0 + 1 && db.rows('event_registrations').filter((r) => r.email_norm?.startsWith('alex.') && r.email_norm !== 'alex.new@gmail.com').every((r) => r.attendance === 'registered'));
  n0 = count();
  const w = await ck({ marketingConsent: true });
  const rita = db.rows('event_registrations').find((r) => r.email_norm === 'rita.m@gmail.com');
  ok('no RSVP at all: added and checked in on the spot — everyone walks in', w.status === 200 && w.j.firstName === 'Rita' && count() === n0 + 1 && rita.attendance === 'attended' && rita.checked_in_by === 'self');
  ok('…with the same answers the RSVP asks, consent included', rita.interest === 'business' && rita.source === 'campus' && rita.marketing_consent === true && typeof rita.consent_at === 'number');
  ok('any email works, UTA included', (await ck({ fullName: 'Uta Student', email: 'new.person@mavs.uta.edu' })).status === 200);
  ok('a name is required', (await ck({ fullName: '', email: 'n@x.com' })).j.field === 'fullName');
  ok('an email is required', (await ck({ email: 'nope' })).j.field === 'email');
  ok('a bot gets nowhere', (await ck({ email: 'b@x.com', website: 'spam' })).status === 400);
  ok('the answer names only the person', Object.keys(w.j).sort().join() === 'already,firstName');
  as('user_admin');
  await call(R.adminEvent, '/api/events/admin/in-public-002', 'PATCH', { self_checkin: false }, { id: 'in-public-002' });
  as(null);
  // the first way in: just the name or email the RSVP was made with
  as('user_admin');
  await call(R.adminEvent, '/api/events/admin/in-public-002', 'PATCH', { self_checkin: true }, { id: 'in-public-002' });
  as(null);
  await call(R.rsvp, '/api/events/rsvp', 'POST', rsvp({ email: 'sam.look@gmail.com', fullName: 'Sam Lookup' }));
  const find = (who, o = {}) => call(R.checkin, '/api/events/checkin', 'POST', { eventId: 'in-public-002', who, website: '', elapsedMs: 1500, ...o });
  const before = db.rows('event_registrations').length;
  const f1 = await find('  sam LOOKUP ');
  ok('lookup by the RSVP name checks them in, with nothing else asked', f1.status === 200 && f1.j.firstName === 'Sam' && db.rows('event_registrations').find((r) => r.email_norm === 'sam.look@gmail.com').attendance === 'attended');
  ok('…again says already', (await find('SAM.LOOK@gmail.com')).j.already === true);
  const f2 = await find('Nobody Here');
  ok('no RSVP under that name: not found — the page offers the full form — and nothing is created', f2.status === 404 && f2.j.code === 'not-found' && db.rows('event_registrations').length === before);
  ok('no RSVP with that email: the same', (await find('stranger@x.com')).status === 404);
  ok('a name two RSVPs share asks for the email, and checks no one in', (await find('Alex Kim')).status === 409 && db.rows('event_registrations').find((r) => r.email_norm === 'alex.one@gmail.com').attendance === 'registered');
  ok('a broken email is refused', (await find('a@b')).status === 400);
  ok('a bot gets nowhere', (await find('Sam Lookup', { website: 'x' })).status === 400);
  as('user_admin');
  await call(R.adminEvent, '/api/events/admin/in-public-002', 'PATCH', { self_checkin: false }, { id: 'in-public-002' });
  as(null);
  ok('closed again, it refuses again', (await ck({ email: 'late2@x.com', fullName: 'Late Two' })).status === 403 && (await find('Sam Lookup')).status === 403);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
