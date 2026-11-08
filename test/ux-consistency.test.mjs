// ONE SOCRIA — THE UI STANDARD, HELD (docs/LOGOS-5-SYSTEM.md §8.13).
//
// The consistency pass measured what most of the product already did and
// brought the rest to it. These read the sources so the drift cannot come back
// quietly:
//
//   one green     #354620 is every UI accent; #5e7633 survives only as a tone
//   fonts         the families are variables (next/font registers hashed names)
//   tokens        the surfaces a sheet is drawn on exist outside .l5, per theme;
//                 one red (tension) at the root; Tailwind's channels have their
//                 own names; the quietest ink is readable
//   focus         one ring, and a floor for anything that drew none
//   controls      the one filled control is ink; menus and dialogs as specified
//   dialogs       the page dimmed, never blurred; a 16px panel
//   type          weights 400 / 500 / 600 only
//   names         Conversation, Files, Artifacts, Logic Map

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 400))));

/** every stylesheet under app/ and components/ */
function sheets() {
  const out = [];
  const walk = (dir) => {
    for (const f of readdirSync(join(root, dir))) {
      const p = join(dir, f);
      const s = statSync(join(root, p));
      if (s.isDirectory()) { if (f !== 'node_modules' && !f.startsWith('.')) walk(p); }
      else if (f.endsWith('.css')) out.push(p);
    }
  };
  walk('app');
  walk('components');
  return out;
}
const noComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const css = Object.fromEntries(sheets().map((p) => [p, noComments(read(p))]));

const globals = read('app/globals.css');
const themes = read('app/themes.css');
const controls = read('components/logos5/l5-controls.css');
const tw = read('tailwind.config.ts');

console.log('\n=== one green ===');
{
  const rootBlock = globals.slice(globals.indexOf(':root {'), globals.indexOf('\n}', globals.indexOf(':root {')));
  ok('the root green is #354620, and moss-700 is the same green', /--moss: #354620;/.test(rootBlock) && /--moss-700: #354620;/.test(rootBlock) && /--moss-600: #354620;/.test(rootBlock));
  ok('  the older #5e7633 is kept under its own name, as a tone', /--moss-tone: #5e7633;/.test(rootBlock));
  const strays = [];
  for (const [p, body] of Object.entries(css)) {
    body.split('\n').forEach((line, i) => {
      if (/#5e7633|94,\s*118,\s*51/i.test(line) && !/moss-tone|--ls-moss\b|--ls-moss:/.test(line)) strays.push(`${p}:${i + 1}`);
    });
  }
  ok('  no stylesheet draws a UI accent in #5e7633 (only the tone tokens may hold it)', strays.length === 0, strays.join(', '));
  ok('Tailwind\'s moss is the same green', !/94 118 51|71 90 40/.test(tw) && /--rgb-moss-600, 53 70 32/.test(tw));
  ok('the sign-in screens (Clerk) are drawn in the same green', /colorPrimary: '#354620'/.test(read('app/layout.tsx')));
}

console.log('\n=== fonts ===');
{
  ok('the serif and the sans are variables at the root, so every sheet reaches the loaded fonts', /--l5-serif: var\(--serif\);/.test(globals) && /--lg-sans: var\(--sans\);/.test(globals) && /--l5-sans: var\(--sans\);/.test(globals));
  const literal = [];
  for (const [p, body] of Object.entries(css)) {
    if (p.startsWith('components/campaign/')) continue;
    for (const m of body.matchAll(/font-family:\s*(['"]?)(Instrument Serif|Inter)\b/g)) literal.push(`${p}: ${m[0]}`);
  }
  ok('  no stylesheet names Instrument Serif or Inter literally first (next/font registers hashed names, so a literal never matches)', literal.length === 0, literal.join(' | '));
}

console.log('\n=== tokens ===');
{
  const tokens = globals.slice(globals.indexOf('.logos-root,\n.lg-tokens {'), globals.indexOf('\n}', globals.indexOf('.logos-root,\n.lg-tokens {')));
  for (const t of ['--lg-panel-solid', '--l5-surface', '--l5-surface-rgb', '--l5-raise', '--l5-hair', '--l5-shadow', '--l5-shadow-up', '--lg-dim', '--lg-r-dialog', '--lg-r-card', '--lg-r-inner']) {
    ok(`${t} is declared with the Logos tokens, outside .l5, where the sheets mount`, new RegExp(`${t}:`).test(tokens));
  }
  ok('  the dialog dim is the page dimmed, not a tint', /--lg-dim: rgba\(var\(--shadow-rgb, 32, 32, 27\), 0\.32\);/.test(tokens));
  for (const theme of ['dark', 'one', 'night']) {
    const start = themes.indexOf(`html[data-theme="${theme}"] :is(.logos-root, .lg-tokens) {`);
    const block = themes.slice(start, themes.indexOf('\n}', start));
    ok(`  ${theme}: the surfaces are restated for the theme`, start > -1 && /--lg-panel-solid:/.test(block) && /--l5-surface:/.test(block) && /--l5-shadow-up:/.test(block));
    ok(`  ${theme}: the one red follows the theme outside the Logos tokens too`, new RegExp(`html\\[data-theme="${theme}"\\] \\{ --tension: #`).test(themes));
  }
  ok('the one red is a root token (the account pages read it)', /--tension: #9C5B3C;/.test(globals) && /--tension-rgb: 156, 91, 60;/.test(globals));
  ok('Tailwind\'s colour channels have their own names, so they never collide with the controls\' --c-ink / --c-paper', !/--c-(paper|ink|surface|border|moss-\d+):/.test(themes) && /--rgb-paper/.test(themes) && /rgb\(var\(--rgb-ink/.test(tw));
  ok('the quietest Logos ink is readable (0.55, the controls\' floor), in every theme', /--lg-ink-40: rgba\(var\(--lg-ink-rgb, 35, 36, 31\), 0\.55\);/.test(globals) && (themes.match(/--lg-ink-40: rgba\([^)]*0\.55\)/g) || []).length === 3);
}

console.log('\n=== focus ===');
{
  ok('one keyboard ring everywhere: a floor at the lowest weight for anything that drew none', /:where\(body\) :focus-visible \{ outline: 2px solid var\(--lg-primary, var\(--moss, #354620\)\); outline-offset: 2px; \}/.test(globals));
  ok('  the standard ring itself is 2px moss, 2px off', /:focus-visible \{ outline: 2px solid var\(--c-moss\); outline-offset: 2px; \}/.test(controls));
  ok('  a Logic Map card takes the same ring (it was the accent blue)', /\.lg-node:focus-visible \{ outline: 2px solid var\(--lg-primary\); outline-offset: 2px; \}/.test(globals));
}

console.log('\n=== controls ===');
{
  ok('the one filled control is ink, moss under the pointer', /\.l5-btn\.is-primary \{[^}]*background: var\(--c-ink\);/.test(controls) && /\.l5-btn\.is-primary:hover:not\(:disabled\) \{ background: var\(--c-moss\);/.test(controls));
  for (const [name, re] of [
    ['the account panels\' way on', /\.acct-btn\.is-go \{[^}]*background: var\(--ink\);/],
    ['the student check\'s way on', /\.edu-go \{[^}]*background: var\(--ink\);/],
    ['the style sheet\'s Save', /\.lg-style-save \{[^}]*background: var\(--lg-ink\);/],
    ['Connections\' Connect', /\.lgc-btn \{[^}]*background: var\(--lg-ink\);/],
  ]) ok(`  ${name} is the ink pill too`, re.test(globals));
  ok('the close everywhere is a bare glyph: the panels\' × lost its circle and wash', /\.lg-x-close \{[^}]*width: 32px; height: 32px;[^}]*border-radius: 0;[^}]*background: none;/.test(globals));
  ok('  and the hand-drawn × (stroke 2.2) in Connections, Explore and Context is the shared glyph', ['components/ConnectionsModal.tsx', 'components/ExplorePanel.tsx', 'components/ContextPanel.tsx', 'components/JourneyDebugModal.tsx'].every((p) => /<CloseGlyph \/>/.test(read(p)) && !/strokeWidth="2\.2"/.test(read(p))));
  ok('a zoom is the same keys everywhere: the Logic Map\'s tray is gone', /\.logos-root \.lg-zoom \{[^}]*border: 0; border-radius: 0; background: none; box-shadow: none;/.test(globals));
  ok('the map\'s lens tabs underline the chosen one (no filled pill)', /\.mp-tabs button\[aria-selected="true"\] \{ background: none; color: var\(--lg-ink\); box-shadow: inset 0 -2px 0 var\(--lg-primary\); \}/.test(globals));
}

console.log('\n=== dialogs ===');
{
  for (const [name, re] of [
    ['Connections', /\.lgc-veil \{[^}]*background: var\(--lg-dim\);/],
    ['the style sheet', /\.lg-style-back \{[^}]*background: var\(--lg-dim\); \}/],
    ['the journey', /\.core3-modal-backdrop \{[^}]*background: var\(--lg-dim, rgba\(var\(--shadow-rgb, 32, 32, 27\), 0\.32\)\);/],
  ]) ok(`${name} dims the page and does not blur it`, re.test(globals));
  const blurred = ['.lgc-veil', '.lg-style-back', '.core3-modal-backdrop'].filter((sel) => {
    const i = globals.indexOf(sel + ' {');
    return i > -1 && /backdrop-filter/.test(globals.slice(i, globals.indexOf('}', i)));
  });
  ok('  none of the three carries a backdrop blur', blurred.length === 0, blurred.join(', '));
  ok('  their panels take the dialog radius', /\.lgc \{[^}]*border-radius: var\(--lg-r-dialog\);/.test(globals) && /\.lg-style-sheet \{[^}]*border-radius: var\(--lg-r-dialog\);/.test(globals) && /\.core3-modal-card \{[^}]*border-radius: var\(--lg-r-dialog, 16px\);/.test(globals));
  ok('  and their titles are in the serif', /\.lgc-title \{[^}]*font-family: var\(--l5-serif, var\(--serif\)\);[^}]*font-weight: 400;/.test(globals) && /\.lg-style-title \{[^}]*font-family: var\(--l5-serif, var\(--serif\)\);/.test(globals));
}

console.log('\n=== type ===');
{
  const odd = [];
  for (const [p, body] of Object.entries(css)) {
    if (p.startsWith('components/campaign/') || /display\/easy\.css$|easy-capture\.css$/.test(p)) continue;
    body.split('\n').forEach((line, i) => { if (/font-weight:\s*(650|550)\b/.test(line)) odd.push(`${p}:${i + 1}`); });
  }
  ok('weights are 400 / 500 / 600: no 650 or 550 anywhere', odd.length === 0, odd.join(', '));
}

console.log('\n=== names ===');
{
  ok('the workspace calls the map the Logic Map', !/Thinking Map/.test(read('lib/workspace/surfaces.ts')) && !/Thinking Map/.test(read('lib/workspace/focus.ts')) && /Logic Map/.test(read('lib/workspace/surfaces.ts')));
  // What a person reads says Conversation, Files, Artifacts and Logic Map. Comments may keep history; these may not:
  // archived pages describe what was (the "Earlier Socria" docs, Logos 2), the policies change only with legal review,
  // the newsletter's past issues are dated, and two matchers recognise old placeholder titles still in people's data.
  const exempt = [
    /^app\/docs\/content\/(logos|logos-2|logos-3|logos-3-5|logos-3-dynamics|logos-3-engineering|history)\.tsx$/,
    /^app\/\(legal\)\//,
    /^app\/logos2\//,
    /^lib\/newsletter-issues\.ts$/,
  ];
  const OLD = /Thinking Map|Split View|Split view|Draft Space|Writing Space|thought session/;
  const files = [];
  const walk = (dir) => {
    for (const f of readdirSync(join(root, dir))) {
      const p = join(dir, f);
      if (statSync(join(root, p)).isDirectory()) { if (f !== 'node_modules' && !f.startsWith('.')) walk(p); }
      else if (/\.(ts|tsx)$/.test(f)) files.push(p.split('\\').join('/'));
    }
  };
  ['app', 'components', 'lib'].forEach(walk);
  const said = [];
  for (const p of files) {
    if (exempt.some((re) => re.test(p))) continue;
    const src = read(p).replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ''));
    src.split('\n').forEach((line, i) => {
      const code = line.replace(/(^|[^:'"`\\])\/\/.*$/, '$1');
      if (!OLD.test(code)) return;
      if (/a Thinking Map, a transcript/i.test(code)) return; // the Logos 2 page's own summary (seo, og cards)
      if (/new \([^)]*thought session/.test(code)) return; // recognising an old placeholder title
      said.push(`${p}:${i + 1}`);
    });
  }
  ok('  no Split View, Thinking Map, Draft Space or thought session in anything a person reads', said.length === 0, said.join(', '));
}

console.log('\n=== dead weight ===');
{
  ok('the retired surfaces\' rules are gone from the global sheet (old landing, Core 3 modal, insight cards, the old gate, the old 404)', !/\.hero-head\b|\.core3-modal-hero|\.insight-card\b|\.lg-gate-card|\.nf-main\b|\.tl-stage\b/.test(globals));
  ok('  and the component nothing rendered is gone', (() => { try { read('components/TryInSocria.tsx'); return false; } catch { return true; } })());
}

console.log(`\nux consistency: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
