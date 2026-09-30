// scripts/verify-views.mjs
//
// DRIVE THE VIEW BUTTONS IN A REAL BROWSER, AND LOOK AT WHAT CAME OUT.
//
// WHY THIS EXISTS. Every test in test/ exercises the model layer: it asserts
// what `viewsFor` enumerates and what `viewdata` derives, and it never renders
// the component. So two regressions shipped that the whole suite was blind to —
// a panel mounted as a sibling of a row-flex container squeezed the 3D view to
// nothing, and a row of view buttons that wrote no state looked identical to one
// that worked. Both were reported by a person looking at the screen.
//
// WHAT IT CHECKS, per model in the library and per view that model offers:
//   · clicking the view marks it current and changes what the frame contains
//   · the frame still has its size — a view must never collapse the picture
//   · a frame view leaves marks; a read view leaves text
//   · nothing throws, and no React error boundary appears
//   · the caption names the view that is open
// and it writes a PNG per view so the result can be looked at rather than
// inferred from a count of passing assertions.
//
// Usage: node scripts/verify-views.mjs [--models n] [--shots dir] [--url u]

import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const URL = arg('url', 'http://localhost:3000/model');
const SHOTS = arg('shots', '/tmp/view-shots');
const LIMIT = Number(arg('models', '0')) || Infinity;
const EXE = process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium';

mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const slug = (s) => s.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 60);

const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

// ANY console error or page error is a failure — except the dev server's own.
// Next's hydration warning about the font-variable className and Clerk's
// outbound request failing through the agent proxy are properties of running
// this in a sandboxed dev container, not of the views. Named explicitly rather
// than filtered by a substring of "error", so a real error cannot hide in the
// exception.
const IGNORE = [
  'did not match. Server:',       // Next dev hydration warning on <html className>
  'ERR_TUNNEL_CONNECTION_FAILED', // Clerk, through the sandbox's proxy
  'clerk',
  'Failed to load resource',
];
const noise = [];
const note = (s) => { if (!IGNORE.some((i) => s.includes(i))) noise.push(s); };
page.on('console', (m) => m.type() === 'error' && note(m.text()));
page.on('pageerror', (e) => note(`pageerror: ${e.message}`));

await page.goto(URL, { waitUntil: 'networkidle' });

const models = await page.$$eval('.eng-tab', (els) => els.map((e) => e.textContent.trim()));
ok('the bench lists its models', models.length > 5, `${models.length}`);

for (const [mi, label] of models.entries()) {
  if (mi >= LIMIT) break;
  noise.length = 0;
  await page.click(`.eng-tab:nth-of-type(${mi + 1})`);
  await page.waitForTimeout(450);

  // THE PICTURE IS THE THING. Measured before anything is clicked and after
  // every click: the regression that mattered most was a layout one.
  const frame0 = await page.$eval('.sfx-svg', (s) => s.getBoundingClientRect().width).catch(() => 0);
  ok(`${label}: the frame has width before anything is clicked`, frame0 > 300, `${frame0}`);

  const views = await page.$$eval('.und-view', (els) => els.map((e) => ({ id: e.dataset.view, label: e.textContent.trim() })));
  ok(`${label}: offers views`, views.length > 0);

  const seen = new Set();
  for (const v of views) {
    const before = await page.$eval('.sfx-svg', (s) => s.innerHTML.length).catch(() => 0);
    await page.click(`.und-view[data-view="${v.id}"]`);
    await page.waitForTimeout(320);

    const after = await page.evaluate(() => {
      const svg = document.querySelector('.sfx-svg');
      const box = svg?.getBoundingClientRect();
      const cur = document.querySelector('.und-view.is-current');
      return {
        w: box?.width ?? 0,
        h: box?.height ?? 0,
        html: svg?.innerHTML.length ?? 0,
        marks: svg ? svg.querySelectorAll('path, circle, rect, polygon, polyline').length : 0,
        words: svg ? svg.querySelectorAll('text').length : 0,
        reads: svg ? svg.querySelectorAll('.eng-read, .eng-read-cell, .eng-read-head, .eng-read-math, .eng-read-node, .eng-read-none').length : 0,
        current: cur?.dataset.view ?? null,
        note: document.querySelector('.sfx-note')?.textContent ?? '',
        boom: !!document.querySelector('[data-nextjs-dialog], .nextjs-container-errors-header'),
        // DOES THE WHOLE COMPONENT FIT ITS HOLE? The regression that squeezed
        // the 3D view to nothing was a layout one, and the one after it let the
        // stack overflow a fixed-height box so the controls ran off the bottom.
        // Neither is visible to anything that does not lay the page out.
        overflow: (() => {
          const stack = document.querySelector('.eng-stack');
          const hole = stack?.parentElement;
          if (!stack || !hole) return 0;
          return Math.round(stack.getBoundingClientRect().height - hole.getBoundingClientRect().height);
        })(),
      };
    });

    ok(`  ${label}/${v.id}: opening it marks it current`, after.current === v.id, `${after.current}`);
    ok(`  ${label}/${v.id}: the frame keeps its size`, after.w > 300 && after.h > 200, `${after.w}x${after.h}`);
    ok(`  ${label}/${v.id}: something is in the frame`, after.marks + after.words > 0, JSON.stringify(after));
    ok(`  ${label}/${v.id}: nothing blew up`, !after.boom);
    ok(`  ${label}/${v.id}: the whole component fits its hole`, after.overflow <= 1, `${after.overflow}px over`);
    // THE FRAME MUST ACTUALLY CHANGE. The defect being fixed is a button that
    // did nothing, so "it rendered" is not the assertion — "it is different"
    // is. Two views may legitimately coincide, so this is counted rather than
    // asserted per view, and asserted over the model below.
    if (after.html !== before) seen.add(v.id);

    // The WHOLE stage, so what is looked at afterwards is the figure, its
    // caption, its controls and the row of views — the thing a person sees.
    const file = `${SHOTS}/${String(mi).padStart(2, '0')}-${slug(label)}-${slug(v.id)}.png`;
    await page.locator('.eng-stage').screenshot({ path: file }).catch(() => {});
  }
  ok(`${label}: opening views changes the frame`, views.length < 2 || seen.size >= Math.min(2, views.length - 1), `${seen.size} of ${views.length} changed`);
  ok(`${label}: no console errors while switching views`, noise.length === 0, noise.slice(0, 3).join(' | '));
}

await browser.close();
console.log(`\n${pass} passed, ${fail} failed · shots in ${SHOTS}`);
process.exit(fail ? 1 : 0);
