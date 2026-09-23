// Council D15: every column Core 4 stores is accounted for in the data
// inventory in docs/CORE-4-ARCHITECTURE.md — what it holds, why, how long,
// who reads it, and what the person can do about it. Adding a column
// without documenting it fails here.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const schema = readFileSync(join(root, 'supabase/schema.sql'), 'utf8');
const doc = readFileSync(join(root, 'docs/CORE-4-ARCHITECTURE.md'), 'utf8');
const inventory = doc.slice(doc.indexOf('### Data inventory'), doc.indexOf('## 5.'));

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));

ok('the inventory section exists', inventory.length > 200);
for (const table of ['core4_state', 'reasoning_entries', 'reasoning_links', 'core4_turns', 'capability_evidence']) {
  const m = schema.match(new RegExp(`create table if not exists ${table} \\(([\\s\\S]*?)\\n\\);`));
  ok(`${table} is in the schema`, !!m);
  if (!m) continue;
  const cols = m[1].split('\n').map((l) => l.trim()).filter((l) => /^[a-z_]+ /.test(l) && !l.startsWith('primary')).map((l) => l.split(' ')[0]);
  const row = inventory.split('\n').find((l) => l.startsWith(`| \`${table}\``)) ?? '';
  ok(`${table} has an inventory row`, !!row);
  for (const c of cols) ok(`${table}.${c} is documented`, row.includes(`\`${c}\``), row.slice(0, 80));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
