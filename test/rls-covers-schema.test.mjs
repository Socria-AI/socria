// Every table gets Row Level Security, and nobody has to remember to add it.
//
// supabase/rls.sql is deny-by-default: RLS on, no policies, grants revoked.
// It is the second wall behind the app's own `.eq('user_id', userId)` — the
// one that matters if the anon key ever reaches a browser. Logos 2 means it
// now does BY DESIGN (NEXT_PUBLIC_SUPABASE_ANON_KEY, for a shared room), so
// a table missing from this file is reachable by anyone who reads a script
// tag.
//
// lifecycle_emails was missing for exactly that reason — it was added to
// schema.sql and nobody thought about rls.sql. This test is the reason that
// cannot happen twice: add a table, and the suite tells you what you forgot.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const schema = readFileSync(join(root, 'supabase/schema.sql'), 'utf8');
const rls = readFileSync(join(root, 'supabase/rls.sql'), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));

/** Every table schema.sql creates. */
const tables = [...schema.matchAll(/create table if not exists (\w+)/g)].map((m) => m[1]);

console.log('=== every table is walled ===');
ok('schema.sql declares tables at all', tables.length > 0, `${tables.length}`);

const has = (verb, t) =>
  new RegExp(`alter\\s+table\\s+${t}\\s+${verb}\\s+row\\s+level\\s+security`, 'i').test(rls);

for (const t of tables) {
  ok(`${t} — RLS enabled`, has('enable', t));
  // `force` closes the table-owner path that `enable` alone leaves open.
  ok(`${t} — RLS forced`, has('force', t));
  ok(
    `${t} — grants revoked from anon, authenticated`,
    new RegExp(`revoke\\s+all\\s+on\\s+${t}\\s+from\\s+anon,\\s*authenticated`, 'i').test(rls)
  );
}

// The posture itself: a policy would hand access back to anon/authenticated,
// and there is no Supabase Auth JWT here to write one against — identity is
// Clerk's and lives only in the Next.js process.
console.log('\n=== the posture holds ===');
ok(
  'no policy grants access back',
  !/create\s+policy/i.test(rls),
  'a CREATE POLICY appeared — read the header before adding one'
);
ok('nothing disables RLS', !/disable\s+row\s+level\s+security/i.test(rls));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
