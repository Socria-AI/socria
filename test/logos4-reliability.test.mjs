// LOGOS 4 — EVERYDAY RELIABILITY: a chart of the person's own numbers.
//
// A chart drawn from what someone typed must hold every number they typed,
// under the label they gave it, in the form they asked for. These are the
// phrasings the audit and the phone testing found going wrong:
//   • "$1,200" — a thousands comma is not a list comma
//   • "as a pie" — the form named after the numbers' subject, with no chart verb
//   • "Can you make a pie chart? Rent $1,200 / food $400" — a question before
//     the numbers, and a list split by slashes: the first label used to be read
//     into the title and its number dropped
// The whole path is deterministic (no model call), so these hold exactly.

import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, '.tmp', 'logos4-reliability');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  entryPoints: { objects: join(root, 'lib/objects/index.ts') },
  bundle: true,
  format: 'esm',
  platform: 'node',
  outdir: OUT,
  outExtension: { '.js': '.mjs' },
  tsconfig: join(root, 'tsconfig.json'),
  logLevel: 'error',
});
const O = await import(pathToFileURL(join(OUT, 'objects.mjs')).href);

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));
const J = JSON.stringify;

function chart(said) {
  const req = O.readDisplayRequest(said);
  if (!req) return { req: null };
  const m = O.makeFromRequest(req, { said, latest: said, map: null, space: { objs: [] } });
  const s = m?.state;
  return { req, m, s, rows: s?.rows?.map((r) => r.cells) ?? [], unit: s?.columns?.find((c) => c.type === 'number')?.unit ?? '' };
}

const RENT = [['Rent', 1200], ['Food', 400], ['Transport', 150]];

console.log('\n=== every number, under its own label ===');
for (const said of [
  'Make a pie chart of my expenses: rent $1,200, food $400, transport $150',
  'pie chart: rent $1,200, food $400, transport $150',
  'Plot my expenses as a pie chart: rent $1,200, food $400, transport $150',
  'Can you make a pie chart? Rent $1,200 / food $400 / transport $150',
  'Can you make a pie chart? Rent $1,200, food $400 and transport $150.',
]) {
  const c = chart(said);
  ok(`“${said.slice(0, 58)}…” → rent 1,200 kept`, J(c.rows) === J(RENT), J(c.rows));
  ok('  drawn as the pie it asked for', c.s?.view === 'pie', c.s?.view);
  ok('  in dollars', c.unit === '$', c.unit);
  ok('  from their words, not a model', c.m?.from === 'words' && c.m?.origin === 'person');
}

console.log('\n=== the title is the subject, never a label ===');
{
  const c = chart('Can you make a pie chart? Rent $1,200 / food $400 / transport $150');
  ok('a question before the numbers is not read as a label', c.s?.title !== 'Rent', c.s?.title);
  const d = chart('Make a pie chart of my expenses: rent $1,200, food $400, transport $150');
  ok('“of my expenses” names it', d.s?.title === 'Expenses', d.s?.title);
}

console.log('\n=== the form, however it is named ===');
{
  const c = chart('Show my spending as a pie: rent 1200, food 400, fun 150');
  ok('“as a pie” with no chart verb is still a chart request', c.req?.kind === 'data' && c.req?.view === 'pie', J(c.req));
  ok('  and every number is kept', J(c.rows) === J([['Rent', 1200], ['Food', 400], ['Fun', 150]]), J(c.rows));
  const b = chart('Put my grades in a bar chart: math 92, history 85, biology 78');
  ok('“in a bar chart” is a bar chart', b.s?.view === 'bar' && b.rows.length === 3, J({ v: b.s?.view, rows: b.rows }));
  const none = O.readDisplayRequest('I sat on a pie crust at lunch, it cost $4');
  ok('“pie” in passing, with no form asked for, is not a chart request', !none || none.kind !== 'data', J(none));
}

console.log('\n=== thousands and decimals ===');
{
  const c = chart('graph: tuition $10,500.50, books $1,200, housing $8,000');
  ok('$10,500.50 and $8,000 read whole', J(c.rows) === J([['Tuition', 10500.5], ['Books', 1200], ['Housing', 8000]]), J(c.rows));
  const s = chart('bar chart of sales: Jan $12,500, Feb $13,200, Mar $9,800');
  ok('months stay months, in order', J(s.rows) === J([['Jan', 12500], ['Feb', 13200], ['Mar', 9800]]), J(s.rows));
  const f = chart('chart these ratios: a 1/2, b 3/4');
  ok('an unspaced slash is not a list break', !f.rows.some((r) => /^\//.test(String(r[0]))), J(f.rows));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
