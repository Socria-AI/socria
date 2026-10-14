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

// A function is executable by PUBLIC unless rls.sql takes that away. Where
// rls.sql does lock a function to the service role, it has to name one
// schema.sql defines, argument types and all: a revoke written against an
// old signature fails the migration, or — once both overloads exist in a
// database, because `create or replace` with new argument types makes a
// second function rather than replacing the first — locks the old one and
// leaves the new one open.
console.log('\n=== a function grant names a function that exists ===');
{
  const defined = new Map(
    [...schema.matchAll(/create\s+or\s+replace\s+function\s+(\w+)\s*\(([^)]*)\)/gi)].map((m) => [
      m[1],
      m[2].split(',').map((p) => p.trim().split(/\s+/)[1]?.toLowerCase()).filter(Boolean).join(', '),
    ])
  );
  const named = [...rls.matchAll(/(?:revoke|grant)\s+execute\s+on\s+function\s+(\w+)\s*\(([^)]*)\)/gi)].map((m) => [
    m[1],
    m[2].split(',').map((t) => t.trim().toLowerCase()).filter(Boolean).join(', '),
  ]);
  ok('rls.sql locks at least one function', named.length > 0);
  for (const [fn, sig] of named) {
    ok(`${fn}(${sig}) — the signature schema.sql defines`, defined.get(fn) === sig, `schema.sql: ${defined.has(fn) ? `${fn}(${defined.get(fn)})` : 'no such function'}`);
  }
  for (const fn of new Set(named.map(([f]) => f))) {
    ok(`${fn} — taken from public, anon and authenticated`, new RegExp(`revoke\\s+execute\\s+on\\s+function\\s+${fn}\\s*\\([^)]*\\)\\s+from\\s+public,\\s*anon,\\s*authenticated`, 'i').test(rls));
    ok(`${fn} — given to the service role`, new RegExp(`grant\\s+execute\\s+on\\s+function\\s+${fn}\\s*\\([^)]*\\)\\s+to\\s+service_role`, 'i').test(rls));
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
