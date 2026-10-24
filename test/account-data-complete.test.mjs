// "Delete everything" has to mean everything, and an export that quietly
// omits a table is a worse failure than a deletion that does — nobody can
// tell from the outside what is missing.
//
// logos_usage sat in supabase/schema.sql for several releases while being
// absent from BOTH the delete list and the export. It was missed because
// adding a table and adding it to these two routes are three separate acts,
// and only the first one breaks anything if you skip it. This test makes
// skipping the other two break something.

import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const schema = read('supabase/schema.sql');
const del = read('app/api/account/delete/route.ts');
const exp = read('app/api/account/export/route.ts');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));

const tables = [...schema.matchAll(/create table if not exists (\w+)/g)].map((m) => m[1]);

// Tables keyed by owner AND member rather than by one user_id: sharing.
// They are not in OWNED_TABLES (a flat `.eq('user_id')` would miss the
// shares someone owns); they are reached by purgeSharing instead.
const SHARED = new Set(['shares', 'share_members', 'share_comments', 'share_activity', 'share_presence']);

// Tables that hold nothing about any one person: no user id, no row that is
// anyone's. product_events is one integer per (environment, day, event,
// kind) — the developer dashboard's anonymous counts — so there is nothing in
// it to delete with an account or to hand back in an export. The exemption is
// pinned to the exact columns: a table listed here that grows a user_id, or
// any column at all, stops being exempt and fails below until someone decides
// again whether it is still nobody's.
const ANONYMOUS = { product_events: ['env', 'day', 'event', 'kind', 'n'] };

// Socria events. `events` and `event_sheet_sync` describe events, not people
// (pinned to their columns, like ANONYMOUS). `event_registrations` holds
// people who need no account, keyed by email: deleted with an account through
// its VERIFIED addresses (lib/events/privacy.ts) and exported the same way.
const EVENT_TABLES = {
  events: ['id', 'title', 'summary', 'description', 'location', 'starts_at', 'ends_at', 'timezone', 'date_confirmed', 'tentative_note', 'status', 'capacity', 'expectations', 'created_at', 'updated_at'],
  event_sheet_sync: ['event_id', 'lease_until', 'dirty', 'last_ok_at', 'last_rows', 'last_error', 'last_error_at'],
};
const columnsOf = (t) => {
  const m = schema.match(new RegExp(`create table if not exists ${t} \\(([\\s\\S]*?)\\n\\);`));
  if (!m) return null;
  return m[1]
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('--') && !/^(primary key|constraint|unique|check|foreign key)\b/i.test(l))
    .map((l) => l.split(/\s+/)[0]);
};

// The actual contents of the OWNED_TABLES literal, not just "the file
// mentions this word". An earlier version of this test matched anywhere in
// the source, so a table named only in a comment would have passed while
// nothing deleted it.
const ownedTables = (() => {
  const m = del.match(/const OWNED_TABLES = \[([\s\S]*?)\] as const;/);
  if (!m) return [];
  return [...m[1].matchAll(/'([a-z0-9_]+)'/g)].map((x) => x[1]);
})();

// And the loop must actually iterate it and issue a scoped delete.
console.log('=== the delete loop is real ===');
ok('OWNED_TABLES is parsed', ownedTables.length > 0, 'could not find the literal');
ok('the loop iterates it', /for \(const table of OWNED_TABLES\)/.test(del));
ok('and deletes scoped to the user', /\.from\(table\)\s*\.delete\(\)\s*\.eq\('user_id', userId\)/.test(del));

console.log('=== the export reports its own failures ===');
ok('every read records an error', (exp.match(/error: \w+Err/g) || []).length >= 9,
   `${(exp.match(/error: \w+Err/g) || []).length} of 9 reads checked`);
ok('and an incomplete export says so', /out\.incomplete\b/.test(exp));

console.log('=== a live-table error is NOT mistaken for a missing table ===');
{
  // Forgiving the wrong error is silent data loss: the loop steps over the
  // table, the route reports ok and lists it as deleted, and rows keyed to
  // somebody who asked to be forgotten survive with no way left to reach
  // them. The check used to match a bare "does not exist" — which Postgres
  // also says about columns, functions and types.
  const fn = del.match(/function tableMissing[\s\S]*?\n\}/);
  ok('tableMissing exists', !!fn);
  const body = fn ? fn[0] : '';
  ok('it matches the exact undefined-table code', /42p01/.test(body));
  ok('and PostgREST\'s schema-cache code', /pgrst205/.test(body));
  ok('it requires the relation phrasing, not a bare "does not exist"',
     /relation .*does not exist/.test(body) && !/includes\('does not exist'\)/.test(body),
     'a missing COLUMN on a live table would otherwise be forgiven');
}

console.log('=== the grant cookie does not outlive the account ===');
ok('deletion clears the unlock cookie', /ACCESS_COOKIE/.test(del) && /maxAge: 0/.test(del));


console.log('=== every table is deleted with the account ===');
ok('the schema declares tables', tables.length > 0, `${tables.length}`);
for (const t of tables) {
  if (SHARED.has(t)) {
    ok(`${t} — reached by the sharing purge`, /await purgeSharing\(userId\)/.test(del));
  } else if (EVENT_TABLES[t]) {
    ok(`${t} — about events, not people: exactly its columns`, JSON.stringify(columnsOf(t)) === JSON.stringify(EVENT_TABLES[t]), JSON.stringify(columnsOf(t)));
  } else if (t === 'event_registrations') {
    ok(`${t} — deleted with the account, by its verified addresses`, /await purgeRegistrationsForEmails\(verified\)/.test(del) && /verification\?\.status === 'verified'/.test(del));
  } else if (ANONYMOUS[t]) {
    const cols = columnsOf(t);
    ok(`${t} — nobody's: exactly its anonymous columns`, JSON.stringify(cols) === JSON.stringify(ANONYMOUS[t]), JSON.stringify(cols));
    ok(`${t} — …and no column added to it later`, !new RegExp(`alter table (if exists )?${t}\\b[^;]*add column`, 'i').test(schema));
  } else {
    // Not merely "the name appears somewhere": it must appear inside the
    // OWNED_TABLES literal, which is the list the delete loop iterates. A
    // regex over the whole file would pass on a mention in a comment.
    ok(`${t} — in OWNED_TABLES`, ownedTables.includes(t), `owned: ${ownedTables.join(', ')}`);
  }
}

console.log('\n=== every table is in the export ===');
for (const t of tables) {
  if (ANONYMOUS[t] || EVENT_TABLES[t]) continue; // nobody's, checked above
  if (t === 'event_registrations') {
    ok(`${t} — exported, by verified address`, /exportRegistrationsForEmails\(verified\)/.test(exp));
    continue;
  }
  ok(`${t} — exported`, new RegExp(`from\\('${t}'\\)`).test(exp), 'no .from() for it');
}

console.log('\n=== every storage bucket ===');
{
  // Private storage is not in schema.sql, so nothing above can see it. Every
  // bucket a person's files are kept in is named here with what reaches it; a
  // new bucket fails until someone decides how it is deleted and exported.
  // Uploads only pass through (each is deleted as it is read), so there is
  // nothing to export; a writing's pictures are kept, so they are listed.
  const KNOWN = {
    UPLOAD_BUCKET: { purge: /await purgeUploads\(userId\)/ },
    MEDIA_BUCKET: { purge: /await purgeMedia\(userId\)/, exported: /out\.writingPictures = await listMedia\(userId\)/ },
  };
  const found = [];
  const walk = (dir) => {
    for (const e of readdirSync(join(root, dir), { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name)) for (const m of read(p).matchAll(/export const (\w+_BUCKET) = '([^']+)'/g)) found.push(m[1]);
    }
  };
  walk('lib');
  ok('the buckets are found', found.length >= 2, found.join(', '));
  for (const b of found) {
    const k = KNOWN[b];
    ok(`${b} — known, with a decision about it`, !!k);
    if (!k) continue;
    ok(`${b} — emptied with the account`, k.purge.test(del));
    if (k.exported) ok(`${b} — in the export`, k.exported.test(exp));
  }
}

console.log('\n=== the deletion still fails closed ===');
ok(
  'a failed table stops the deletion',
  /return NextResponse\.json\([\s\S]{0,400}status: 500/.test(del),
  'no 500 path — a partial delete would report success'
);
ok('billing is cancelled before anything is deleted', del.indexOf('subscriptions.cancel') < del.indexOf('for (const table of OWNED_TABLES)'));
ok('the Clerk identity is deleted too', /clerkClient\.users\.deleteUser/.test(del));

// A control that deletes ONE thing is easier to lose than a route: it lives
// in a chip somebody redesigns. The chat sidebar chip that opened the Thinking
// Journey is gone — it pointed at a store Core 4 does not read — and it
// carried the only per-entry forget. This pins where it went, so the next
// person to move that link has to move the control with it.
console.log('\n=== forgetting ONE thing is still reachable ===');
{
  const memoryPage = read('app/memory/page.tsx');
  const record = read('components/mind/JourneyRecord.tsx');
  const chat = read('app/chat/page.tsx');
  ok('the chat sidebar points at /memory', /href="\/memory"/.test(chat));
  ok('  and no longer mounts the journey modal itself', !/JourneyDebugModal/.test(chat));
  ok('/memory renders the journey', /<JourneyRecord \/>/.test(memoryPage));
  ok('  with the per-entry route wired', /api\/profile\/forget/.test(record));
  ok('  and forget-everything wired to the account route', /api\/account\/memory/.test(record) && /method: 'DELETE'/.test(record));
  // A forget that reached the server and not this browser comes back on the
  // next sync as a proposal the tombstone then has to refuse.
  ok('  and the browser copy is cleared with it', /removeItem\(JOURNEY_KEY\)/.test(record));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
