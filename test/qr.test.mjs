// The QR code for the authenticator app.
//
// The encoding itself is qrcode-generator's, and is not what this tests.
// What this tests is the layer around it, where a mistake is silent and
// expensive: a QR that scans cleanly and enrols the WRONG secret means
// somebody sets up two-factor, believes it, and cannot sign in afterwards.
//
// Two ways that could happen, and one assertion for each:
//
//   The run-merging is wrong. qrGrid emits one SVG path with horizontal runs
//   collapsed instead of a rect per module. An off-by-one at the start or end
//   of a run shifts modules and corrupts the payload — so the path is parsed
//   back into a grid and compared, module by module, against the library's
//   own isDark(). Every cell, every code, both directions.
//
//   The text was not encodable. The default byte encoder is Latin-1, so a
//   character above U+00FF would be truncated into a different string. That
//   must produce NO code rather than a wrong one.

import qrcode from 'qrcode-generator';
import { qrGrid, qrEncodable } from './.tmp/qr.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

/** Read the emitted path back into a set of "row,col" dark modules. */
function cellsFromPath(path) {
  const cells = new Set();
  const re = /M(\d+) (\d+)h(\d+)v1h-(\d+)z/g;
  let m;
  let consumed = 0;
  while ((m = re.exec(path))) {
    const [full, x, y, w, back] = m;
    consumed += full.length;
    if (w !== back) throw new Error(`run ${full} does not close on itself`);
    for (let i = 0; i < +w; i++) cells.add(`${+y},${+x + i}`);
  }
  // Nothing in the path may be unaccounted for: a stray command would draw
  // modules this check never sees.
  if (consumed !== path.length) throw new Error('path has commands beyond the runs');
  return cells;
}

const SAMPLES = [
  'otpauth://totp/Socria:ella@mavs.uta.edu?secret=JBSWY3DPEHPK3PXP&issuer=Socria&algorithm=SHA1&digits=6&period=30',
  'otpauth://totp/Socria:a@b.co?secret=NB2W45DFOIZA&issuer=Socria',
  'otpauth://totp/Socria:' + 'x'.repeat(120) + '@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Socria',
  'A', '0123456789', 'https://socria.app',
];

console.log('=== the path says exactly what the encoder said ===');
for (const text of SAMPLES) {
  const grid = qrGrid(text);
  ok(`encodes ${text.slice(0, 28)}…`, !!grid);
  if (!grid) continue;

  const ref = qrcode(0, 'M');
  ref.addData(text);
  ref.make();
  ok(`module count matches (${grid.count})`, grid.count === ref.getModuleCount());

  let cells;
  try { cells = cellsFromPath(grid.path); } catch (e) { ok('path parses', false, e.message); continue; }

  let wrong = 0;
  for (let row = 0; row < grid.count; row++) {
    for (let col = 0; col < grid.count; col++) {
      if (ref.isDark(row, col) !== cells.has(`${row},${col}`)) wrong++;
    }
  }
  ok(`every one of ${grid.count ** 2} modules matches`, wrong === 0, `${wrong} wrong`);

  // Nothing may be drawn outside the grid.
  let outside = 0;
  for (const c of cells) {
    const [r, k] = c.split(',').map(Number);
    if (r < 0 || k < 0 || r >= grid.count || k >= grid.count) outside++;
  }
  ok('nothing drawn outside the grid', outside === 0, `${outside} outside`);
}

console.log('\n=== the three finder patterns are where they belong ===');
{
  // A cheap structural check that the grid is a real QR and not, say,
  // transposed: the 7x7 finder squares sit at three corners, never the fourth.
  const grid = qrGrid(SAMPLES[0]);
  const cells = cellsFromPath(grid.path);
  const n = grid.count;
  const solid = (r0, c0) => {
    // outer ring dark, inner ring light, 3x3 core dark
    for (let i = 0; i < 7; i++) {
      if (!cells.has(`${r0},${c0 + i}`) || !cells.has(`${r0 + 6},${c0 + i}`)) return false;
      if (!cells.has(`${r0 + i},${c0}`) || !cells.has(`${r0 + i},${c0 + 6}`)) return false;
    }
    for (let r = 2; r < 5; r++) for (let c = 2; c < 5; c++) {
      if (!cells.has(`${r0 + r},${c0 + c}`)) return false;
    }
    return true;
  };
  ok('top-left finder', solid(0, 0));
  ok('top-right finder', solid(0, n - 7));
  ok('bottom-left finder', solid(n - 7, 0));
  ok('no finder bottom-right', !solid(n - 7, n - 7));
}

console.log('\n=== what cannot be encoded faithfully is not encoded ===');
{
  ok('ascii is fine', qrEncodable('otpauth://totp/a?secret=X') === true);
  ok('latin-1 is fine', qrEncodable('café') === true);
  ok('U+00FF is the boundary and is fine', qrEncodable('ÿ') === true);
  ok('U+0100 is past it', qrEncodable('Ā') === false);
  ok('a name in Greek is past it', qrEncodable('otpauth://totp/Σωκράτης') === false);
  ok('an emoji is past it', qrEncodable('otpauth://totp/a\u{1F600}') === false);

  ok('and such a string produces no grid at all', qrGrid('otpauth://totp/Σ') === null);
  ok('rather than a grid of something else', qrGrid('\u{1F600}') === null);

  ok('empty is nothing', qrGrid('') === null);
  for (const junk of [null, undefined]) {
    ok(`${junk} is nothing`, qrGrid(junk) === null);
  }
}

console.log('\n=== too long to encode fails softly ===');
{
  // Past the largest version. It must return null, not throw — the panel
  // renders the typed-in secret beside this and stays usable.
  let threw = false;
  let out;
  try { out = qrGrid('x'.repeat(20000)); } catch { threw = true; }
  ok('does not throw', threw === false);
  ok('returns null', out === null);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
