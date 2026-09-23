// "Delete everything" has to mean everything, and an export that quietly
// omits a table is a worse failure than a deletion that does — nobody can
// tell from the outside what is missing.
//
// logos_usage sat in supabase/schema.sql for several releases while being
// absent from BOTH the delete list and the export. It was missed because
// adding a table and adding it to these two routes are three separate acts,
// and only the first one breaks anything if you skip it. This test makes
// skipping the other two break something.

import { readFileSync } from 'node:fs';
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

// The actual contents of the OWNED_TABLES literal, not just "the file
// mentions this word". An earlier version of this test matched anywhere in
// the source, so a table named only in a comment would have passed while
// nothing deleted it.
const ownedTables = (() => {
  const m = del.match(/const OWNED_TABLES = \[([\s\S]*?)\] as const;/);
  if (!m) return [];
  return [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
})();

// And the loop must actually iterate it and issue a scoped delete.
console.log('=== the delete loop is real ===');
ok('OWNED_TABLES is parsed', ownedTables.length > 0, 'could not find the literal');
ok('the loop iterates it', /for \(const table of OWNED_TABLES\)/.test(del));
ok('and deletes scoped to the user', /\.from\(table\)\s*\.delete\(\)\s*\.eq\('user_id', userId\)/.test(del));

console.log('=== the export reports its own failures ===');
ok('every read records an error', (exp.match(/error: \w+Err/g) || []).length >= 6,
   `${(exp.match(/error: \w+Err/g) || []).length} of 6 reads checked`);
ok('and an incomplete export says so', /out\.incomplete\b/.test(exp));

console.log('=== the grant cookie does not outlive the account ===');
ok('deletion clears the unlock cookie', /ACCESS_COOKIE/.test(del) && /maxAge: 0/.test(del));


console.log('=== every table is deleted with the account ===');
ok('the schema declares tables', tables.length > 0, `${tables.length}`);
for (const t of tables) {
  // Not merely "the name appears somewhere": it must appear inside the
  // OWNED_TABLES literal, which is the list the delete loop iterates. A
  // regex over the whole file would pass on a mention in a comment.
  ok(`${t} — in OWNED_TABLES`, ownedTables.includes(t), `owned: ${ownedTables.join(', ')}`);
}

console.log('\n=== every table is in the export ===');
for (const t of tables) {
  ok(`${t} — exported`, new RegExp(`from\\('${t}'\\)`).test(exp), 'no .from() for it');
}

console.log('\n=== the deletion still fails closed ===');
ok(
  'a failed table stops the deletion',
  /return NextResponse\.json\([\s\S]{0,400}status: 500/.test(del),
  'no 500 path — a partial delete would report success'
);
ok('billing is cancelled before anything is deleted', del.indexOf('subscriptions.cancel') < del.indexOf('for (const table of OWNED_TABLES)'));
ok('the Clerk identity is deleted too', /clerkClient\.users\.deleteUser/.test(del));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
