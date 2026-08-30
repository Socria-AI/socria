// The whole test suite, in one command.
//
// Every suite is a plain Node script that prints its own tally and exits
// non-zero on failure. This builds the modules once, runs each suite in its
// own process, and reports the total — so one broken suite cannot take the
// others down with it, and CI gets a single exit code.
//
//   npm test              every suite
//   npm test -- viz       only suites whose name contains "viz"

import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { buildAll } from './helpers/build.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const filter = process.argv[2] ?? '';

console.log('building modules under test…');
await buildAll();

const suites = readdirSync(here)
  .filter((f) => f.endsWith('.test.mjs'))
  .filter((f) => !filter || f.includes(filter))
  .sort();

if (!suites.length) {
  console.error(`no suites match "${filter}"`);
  process.exit(1);
}

let failed = 0;
const lines = [];

for (const s of suites) {
  const r = spawnSync(process.execPath, [join(here, s)], { encoding: 'utf8' });
  const out = `${r.stdout}${r.stderr}`.trim();
  // Each suite's last line is its own tally.
  const tally = out.split('\n').filter(Boolean).pop() ?? '(no output)';
  const okRun = r.status === 0;
  if (!okRun) {
    failed++;
    lines.push(`FAIL  ${s.padEnd(26)} ${tally}`);
    // A failure is the one time the whole output is worth reading.
    console.log(`\n──────── ${s} ────────\n${out}\n`);
  } else {
    lines.push(`ok    ${s.padEnd(26)} ${tally}`);
  }
}

console.log('\n' + lines.join('\n'));
console.log(
  failed
    ? `\n${failed} of ${suites.length} suites failed`
    : `\nall ${suites.length} suites passed`
);
process.exit(failed ? 1 : 0);
