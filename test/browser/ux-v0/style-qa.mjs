// test/browser/ux-v0/style-qa.mjs — Style Intelligence in the real app, by hand: directions proposed in three design
// languages; the Styles panel (influence, strength, sliders, lock); the Style Explorer (categories, plain-words search,
// cards that are real compositions, side-by-side comparison with the exact words, a preview applied and undone); style
// changes in words; a reference picture read into a style (nothing copied); the person's own styles (kept, renamed,
// exported, removed, imported, still there after a reload); and a board's design language changed as one previewed
// step. Each result is read back from the project as the browser keeps it (IndexedDB). No model is called; the run
// fails if any model route is asked.
//
//   UXV0_FORWARD=1 UXV0_BASE=http://127.0.0.1:3100 node test/browser/ux-v0/style-qa.mjs   (against `next start`)
import { readFileSync, mkdirSync } from 'node:fs';
import { chromium, S, BASE, FX, underTest } from './env.mjs';

const V = await underTest();
const D = V.gfxDoc;
const J = JSON.stringify;
const OUT = `${S}style-qa/`;
mkdirSync(OUT, { recursive: true });
let pass = 0;
let fail = 0;
const ok = (n, c, x = '') => {
  if (c) (pass++, console.log('  ok  ', n));
  else (fail++, console.log('  FAIL', n, String(x).slice(0, 600)));
};
const errors = [];
const modelCalls = [];
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1500, height: 960 }, acceptDownloads: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
page.on('request', (r) => /\/api\/ux-v0\/(generate|refine|brief|discover|direct|critique|design-system|assets|images)/.test(r.url()) && modelCalls.push(r.url()));
const shot = (name) => page.screenshot({ path: `${OUT}${name}.png` });

const pid = () => new URL(page.url()).searchParams.get('p');
const projectOf = (id) =>
  page.evaluate(
    (id) =>
      new Promise((res, rej) => {
        const req = indexedDB.open('socria-ux-v0', 1);
        req.onsuccess = () => {
          const g = req.result.transaction('projects', 'readonly').objectStore('projects').get(id);
          g.onsuccess = () => res(g.result ?? null);
          g.onerror = () => rej(g.error);
        };
        req.onerror = () => rej(req.error);
      }),
    id,
  );
const docWhere = async (pred, ms = 10000) => {
  const start = Date.now();
  let d = null;
  while (Date.now() - start < ms) {
    d = (await projectOf(pid()))?.graphic?.doc ?? null;
    if (d && pred(d)) return d;
    await page.waitForTimeout(250);
  }
  return d;
};
const nodes = (d) => (d ? d.artboards.flatMap((ab) => D.walk(ab).map((l) => l.node)) : []);
const texts = (d) =>
  nodes(d)
    .filter((n) => n.type === 'text')
    .map((n) => n.text);
const tab = (name) => page.locator('.gx-tab', { hasText: name }).click();
const ask = async (words) => {
  await page.fill('#gx-ask-in', words);
  await page.locator('.gx-ask').getByRole('button', { name: 'Preview' }).click();
  await page.waitForTimeout(500);
};
const applyPreview = async () => {
  await page.locator('.gx-pending').getByRole('button', { name: 'Apply' }).click();
  await page.waitForTimeout(700);
};
const library = () => page.evaluate(() => JSON.parse(localStorage.getItem('socriaux.styles.v1') || '{"styles":[]}'));

console.log('=== SocriaUX Style Intelligence, by hand, in the built app ===');
await page.goto(BASE + '/ux-v0', { waitUntil: 'networkidle' });
await page.fill('textarea[aria-label="What do you want to make?"]', 'A poster for “Signal & Form”, a creative technology exhibition, “Where code becomes craft”, 12–28 March 2027, Lisbon Design Centre');
await page.getByRole('radio', { name: 'Graphic', exact: true }).click();
await page.getByRole('button', { name: 'Begin' }).click();
await page.getByRole('button', { name: 'Write the brief yourself' }).click();
await page.waitForSelector('.gx-brief', { timeout: 15000 });
await page.getByRole('button', { name: /See three directions/ }).click();
await page.waitForSelector('.gx-dir', { timeout: 15000 });
await page.waitForTimeout(800);

// ── directions in design languages ──
const dirNames = await page
  .locator('.gx-dir h2, .gx-dir .gx-dir-name')
  .allInnerTexts()
  .catch(() => []);
const dirLangs = await page.locator('.gx-dir .gx-dir-lang').allInnerTexts();
let proj = await projectOf(pid());
const optStyles = (proj?.graphic?.options ?? []).map((o) => o.style?.primary);
// Engine 2.0: directions are not only style selection: two design languages chosen from the brief, and one language
// generated from the brief itself (no style profile, no house default)
const optOrigins = (proj?.graphic?.options ?? []).map((o) => o.origin ?? null);
ok('1. three directions: two design languages chosen from the brief, one language generated from the brief itself (no house default)', optStyles.length === 3 && optStyles.filter(Boolean).length === 2 && new Set(optStyles.filter(Boolean)).size === 2 && optOrigins.filter((x) => x === 'generated').length === 1, J({ optStyles, optOrigins }));
ok('…each card says its language: a style’s period and kind, or that it was generated from the brief', dirLangs.length === 3 && dirLangs.every((l) => /·/.test(l)) && dirLangs.some((l) => /Generated from the brief/i.test(l)), J(dirLangs));
await shot('01-directions');
await page
  .locator('.gx-dir')
  .first()
  .getByRole('button', { name: /Make it in this direction/ })
  .click();
await page.waitForSelector('.gx-canvas .gx-board svg', { timeout: 30000 });
await page.waitForTimeout(1200);
let d = await docWhere((x) => nodes(x).length > 0);
const first = d?.style?.primary;
ok('…the design is built in it, and keeps the brief’s words exactly', first === optStyles[0] && texts(d).includes('Signal & Form') && texts(d).some((t) => t.includes('Where code becomes craft')), J({ style: d?.style, texts: texts(d) }));

// ── the Styles panel ──
await tab('Styles');
await page.waitForTimeout(300);
const panel = page.locator('section[aria-label="Styles"]');
ok(
  '2. the Styles panel names the language and offers influence, strength, density, experimentation, ornament and a lock',
  (await panel.locator('.gx-panel-h').innerText()).length > 2 && (await panel.locator('select').count()) >= 2 && (await panel.locator('input[type="range"]').count()) >= 3 && (await panel.getByText(/Lock the style/).count()) === 1,
);
await panel.locator('label.gx-sel-field', { hasText: 'Influence' }).locator('select').selectOption('risograph');
await page.waitForTimeout(200);
await panel.locator('label.gx-num', { hasText: 'Blend strength' }).locator('input').fill('60');
await panel.getByRole('button', { name: /Preview these settings/ }).click();
await page.waitForSelector('.gx-pending', { timeout: 8000 });
ok('…a change of settings is shown on the canvas first', (await page.locator('.gx-preview-tag').count()) === 1);
await shot('02-panel-preview');
await applyPreview();
d = await docWhere((x) => x.style?.secondary === 'risograph');
ok('…and applied, the influence and its strength are the design’s', d?.style?.secondary === 'risograph' && d.style.strength === 60 && d.style.primary === first, J(d?.style));
await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
d = await docWhere((x) => !x.style?.secondary);
ok('…and undo takes it back', !d?.style?.secondary && d?.style?.primary === first, J(d?.style));
const fidPanel = panel.locator('.gx-fidelity');
await fidPanel.locator('summary').click();
await page.waitForTimeout(150);
const fidText = await fidPanel.innerText();
ok(
  '…and says how closely the design speaks its language, dimension by dimension, by rules, with what only a person can judge (no brief to check here, so none claimed)',
  /How closely it speaks it: \d+ of 100/.test(fidText) && (await fidPanel.locator('.gx-fid-list li').count()) === 10 && /For your eye/i.test(fidText) && !/The brief’s words/.test(fidText),
  fidText.slice(0, 400),
);
await shot('02b-fidelity');
await fidPanel.locator('summary').click();

// ── the Style Explorer ──
await panel.getByRole('button', { name: /Explore styles/ }).click();
await page.waitForSelector('.gx-explorer', { timeout: 8000 });
await page.waitForTimeout(1500);
const cards = page.locator('.gx-style-card');
ok(
  '3. the Explorer opens with cards that are real compositions of the design’s own words (not sample pictures)',
  (await cards.count()) === 12 && (await cards.first().locator('.gx-style-art svg text').count()) > 0 && /signal/i.test(await cards.first().locator('.gx-style-art svg').innerHTML()),
  await cards.count(),
);
const card0 = await cards.first().innerText();
ok('…each card says its name, period, what it is, what makes it and what it is for', /·/.test(card0) && /For/.test(card0) && card0.split('\n').length >= 5, card0);
await shot('03-explorer');
await page.fill('.gx-explorer-find input', 'elegant 1920s');
await page.waitForTimeout(900);
ok('…plain-words search finds the style meant (“elegant 1920s” → Art Deco)', /Art Deco/.test(await cards.first().locator('.gx-style-name').innerText()), await cards.first().locator('.gx-style-name').innerText());
await page.fill('.gx-explorer-find input', 'old internet aesthetic');
await page.waitForTimeout(900);
ok('…and “old internet aesthetic” the early internet', /Early Internet|Webcore/.test(await cards.first().locator('.gx-style-name').innerText()));
await page.fill('.gx-explorer-find input', '');
await page.locator('.gx-chip', { hasText: 'Cultural' }).click();
await page.waitForTimeout(900);
const culturalEras = await page.locator('.gx-style-era').allInnerTexts();
ok('…the categories filter it (Cultural: ten styles, each cultural)', (await cards.count()) === 10 && culturalEras.every((e) => /Cultural/.test(e)), J(culturalEras));
await page.locator('.gx-chip', { hasText: 'All' }).click();
// the whole library again (not the cultural ten still on screen) before any card is ticked
await page.waitForFunction(() => document.querySelectorAll('.gx-style-card').length === 12 && ![...document.querySelectorAll('.gx-style-era')].every((e) => /Cultural/.test(e.textContent ?? '')), null, { timeout: 10000 });
const picked = [];
for (let i = 0; i < 3; i++) {
  picked.push(await cards.nth(i).locator('.gx-style-name').innerText());
  await cards.nth(i).locator('.gx-check input').check();
}
await page.locator('.gx-explorer-h .sb-seg-item', { hasText: /Compare/ }).click();
await page.waitForFunction(() => document.querySelectorAll('.gx-compare-cell .gx-style-art svg').length === 3, null, { timeout: 15000 }).catch(() => {});
const cells = page.locator('.gx-compare-cell');
const cellSvgs = await cells.locator('.gx-style-art svg').evaluateAll((xs) => xs.map((x) => x.textContent));
ok(
  '4. up to four styles side by side, the same words exactly in each',
  (await cells.count()) === 3 && cellSvgs.length === 3 && cellSvgs.every((t) => /signal/i.test(t) && /craft/i.test(t)),
  J({ picked, shown: await cells.locator('.gx-style-name').allInnerTexts(), words: cellSvgs.map((t) => t.slice(0, 60)) }),
);
await shot('04-compare');
await page.locator('.gx-explorer-h .sb-seg-item', { hasText: /Browse/ }).click();
await page.fill('.gx-explorer-find input', 'art deco');
await page.waitForTimeout(900);
await cards
  .first()
  .getByRole('button', { name: /Preview on the design/ })
  .click();
await page.waitForSelector('.gx-pending', { timeout: 8000 });
ok('5. a style is previewed on the design (the Explorer closes, the canvas shows it), never applied unasked', (await page.locator('.gx-explorer').count()) === 0 && (await page.locator('.gx-preview-tag').count()) === 1);
await shot('05-deco-preview');
await applyPreview();
d = await docWhere((x) => x.style?.primary === 'art-deco');
ok('…applied: the design is rebuilt in Art Deco, its words kept exactly', d?.style?.primary === 'art-deco' && texts(d).includes('Signal & Form') && texts(d).some((t) => t.includes('12–28 March 2027')), J({ style: d?.style, t: texts(d) }));

// ── changes in words ──
await ask('Make the layout more asymmetrical.');
await page.waitForSelector('.gx-pending', { timeout: 8000 });
const label1 = await page.locator('.gx-pending').innerText();
await applyPreview();
d = await docWhere((x) => !!x.style?.dims?.composition);
ok('6. “Make the layout more asymmetrical” borrows an asymmetric composition, the rest of the language kept', !!d?.style?.dims?.composition && d.style.primary === 'art-deco', J({ label1, style: d?.style }));
await ask('Remove the modern gradient treatment.');
await page.waitForSelector('.gx-pending', { timeout: 8000 });
await applyPreview();
d = await docWhere((x) => x.style?.flat === true);
ok(
  '…“Remove the modern gradient treatment” makes the gradients flat and keeps the composition',
  d?.style?.flat === true && !nodes(d).some((n) => (n.type === 'shape' || n.type === 'text') && n.fill && typeof n.fill === 'object' && !n.locked),
  J(
    nodes(d)
      .filter((n) => n.fill && typeof n.fill === 'object')
      .map((n) => n.name),
  ),
);
await tab('Styles');
await page
  .locator('section[aria-label="Styles"]')
  .getByText(/Lock the style/)
  .click();
d = await docWhere((x) => x.style?.locked === true);
ok('7. the style can be locked', d?.style?.locked === true);
await ask('Make this more Memphis.');
const locked = await page
  .locator('.gx-note')
  .innerText()
  .catch(() => '');
ok('…and a locked style is held: the change is refused and the person told how to unlock it', /locked/i.test(locked) && (await page.locator('.gx-pending').count()) === 0, locked);
await page
  .locator('section[aria-label="Styles"]')
  .getByText(/Lock the style/)
  .click();
d = await docWhere((x) => !x.style?.locked);

// ── a reference picture ──
await page
  .locator('section[aria-label="Styles"]')
  .getByRole('button', { name: /Explore styles/ })
  .click();
await page.waitForSelector('.gx-explorer', { timeout: 8000 });
await page.locator('.gx-explorer-h .sb-seg-item', { hasText: /From a picture/ }).click();
await page
  .locator('.gx-explorer input[type="file"]')
  .first()
  .setInputFiles(FX + 'window.jpg');
await page.waitForSelector('.gx-ref', { timeout: 8000 });
const reading = await page.locator('.gx-ref').first().innerText();
ok(
  '8. a reference picture is read here into a style: its palette, composition, colour, surface, nearest styles, and what pixels cannot say',
  (await page.locator('.gx-ref .gx-swatch').count()) >= 2 && /composition/i.test(reading) && /nearest/i.test(reading) && /Typography/.test(reading),
  reading.slice(0, 400),
);
await shot('06-reference');
await page
  .locator('.gx-ref')
  .first()
  .getByRole('button', { name: /Use as the style/ })
  .click();
await page.waitForSelector('.gx-pending', { timeout: 8000 });
await applyPreview();
d = await docWhere((x) => (x.style?.customs ?? []).length > 0);
ok(
  '…used as the style, the content kept: the design carries the profile it was read into',
  d?.style?.customs?.[0]?.category === 'custom' && d.style.primary === d.style.customs[0].id && texts(d).includes('Signal & Form'),
  J(d?.style && { primary: d.style.primary, customs: d.style.customs?.map((c) => c.id) }),
);

// ── the person's own styles ──
await tab('Styles');
await page
  .locator('section[aria-label="Styles"]')
  .getByRole('button', { name: /Explore styles/ })
  .click();
await page.waitForSelector('.gx-explorer', { timeout: 8000 });
await page.locator('.gx-explorer-h .sb-seg-item', { hasText: /My styles/ }).click();
await page.getByRole('button', { name: /Keep the style in use/ }).click();
await page.waitForTimeout(400);
let lib = await library();
ok('9. the style in use is kept as one’s own, in the same schema', lib.styles.length === 1 && lib.styles[0].category === 'custom' && lib.styles[0].schema === 1, J(lib.styles.map((s) => s.name)));
await page.locator('.gx-mine-list li').first().getByRole('button', { name: 'Rename' }).click();
await page.locator('.gx-mine-list li input').fill('Window light');
await page.locator('.gx-mine-list li').getByRole('button', { name: 'Save' }).click();
await page.waitForTimeout(300);
lib = await library();
ok('…renamed in place (no dialog box)', lib.styles[0].name === 'Window light', lib.styles[0].name);
const fromWords = page.locator('.gx-explorer form.gx-mine-row', { hasText: 'From words' });
await fromWords.locator('input').fill('warm risograph with Swiss typography');
await fromWords.getByRole('button', { name: 'Make it' }).click();
await page.waitForTimeout(300);
lib = await library();
ok('…made from words', lib.styles.length === 2 && lib.styles[1].texture.misregistration > 0, J(lib.styles.map((s) => s.name)));
await page.locator('.gx-mine-hand summary').click();
const handForm = page.locator('.gx-explorer form[aria-label="A style by hand"]');
await handForm.locator('label', { hasText: 'Start from' }).locator('select').selectOption('art-deco');
await handForm
  .locator('label', { hasText: /^Accent/ })
  .locator('input[type="color"]')
  .fill('#2266aa');
await handForm.locator('label', { hasText: 'Headline face' }).locator('select').selectOption('Poiret One');
await handForm.locator('label.gx-num', { hasText: 'Density' }).locator('input').fill('30');
await shot('07a-by-hand');
await handForm.getByRole('button', { name: 'Make it' }).click();
await page.waitForTimeout(300);
lib = await library();
const byHand = lib.styles.find((s) => s.name === 'Art Deco by hand');
ok(
  '…made by hand: a starting style with its accent, headline face and density set by controls',
  !!byHand && byHand.category === 'custom' && byHand.colour.accent === '#2266aa' && byHand.typography.display.faces[0] === 'Poiret One' && byHand.composition.density === 30,
  J(byHand ? { name: byHand.name, accent: byHand.colour.accent, face: byHand.typography.display.faces[0], density: byHand.composition.density } : lib.styles.map((s) => s.name)),
);
const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.getByRole('button', { name: /Export my styles/ }).click()]);
const exported = JSON.parse(readFileSync(await dl.path(), 'utf8'));
ok('…exported as a file of data', exported.kind === 'socriaux-styles' && exported.styles.length === 3);
await shot('07-my-styles');
for (let i = 0; i < 3; i++) await page.locator('.gx-mine-list li').first().getByRole('button', { name: 'Remove' }).click();
await page.waitForTimeout(300);
ok('…removed', (await library()).styles.length === 0);
await page.locator('.gx-explorer input[type="file"][accept*="json"]').setInputFiles(await dl.path());
await page.waitForTimeout(500);
ok('…and imported again, whole', (await library()).styles.length === 3 && (await library()).styles[0].name === 'Window light');
await page.locator('.gx-explorer-h').getByRole('button', { name: 'Close' }).click();

// ── reopened ──
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.gx-canvas .gx-board svg', { timeout: 30000 });
await page.waitForTimeout(800);
d = await docWhere(() => true);
ok('10. after a reload the design still speaks its style, and one’s own styles are still there', (d?.style?.customs ?? []).length > 0 && (await library()).styles.length === 3, J(d?.style?.primary));

// ── a board's design language ──
await page.goto(BASE + '/ux-v0', { waitUntil: 'networkidle' });
await page.fill('textarea[aria-label="What do you want to make?"]', 'Create a campaign for “Signal & Form”, “Where code becomes craft”, 12–28 March 2027: two posters and two Instagram graphics.');
await page.getByRole('radio', { name: 'Board', exact: true }).click();
await page.getByRole('button', { name: 'Begin' }).click();
await page.getByRole('button', { name: 'Write the brief yourself' }).click();
await page.waitForSelector('.bd-brief', { timeout: 15000 });
await page.getByRole('button', { name: /Propose design systems/ }).click();
await page.waitForSelector('.bd-sys', { timeout: 15000 });
const boardReady = async (pred, ms = 20000) => {
  const start = Date.now();
  let bd = null;
  while (Date.now() - start < ms) {
    bd = (await projectOf(pid()))?.board ?? null;
    if (bd && pred(bd)) return bd;
    await page.waitForTimeout(300);
  }
  return bd;
};
// the project is saved a moment after the systems are shown
const sysStyles = ((await boardReady((x) => x.options.length >= 3))?.options ?? []).map((s) => s.style?.primary);
ok('11. a board’s three design systems each speak a different language', sysStyles.length === 3 && sysStyles.every(Boolean) && new Set(sysStyles).size === 3, J(sysStyles));
await page
  .locator('.bd-sys')
  .first()
  .getByRole('button', { name: /Use this system/ })
  .click();
await page.waitForSelector('.bd-canvas', { timeout: 15000 });
let bd = await boardReady((x) => x.materials.length && x.materials.every((m) => m.status === 'ready'));
const mats = bd.materials.filter((m) => m.type === 'graphic');
ok(
  '…every material speaks it, each built its own way',
  // each material its own concept (structure and use of the palette), the one language shared
  mats.every((m) => m.doc?.style?.primary === bd.system.style.primary) && new Set(mats.map((m) => ((c) => (c ? `${c.org}/${c.type}|${c.colouring}` : `${m.plan?.archetype}|${m.doc?.artboards[0].background}`))(m.doc?.artboards[0].concept))).size === mats.length,
  J(mats.map((m) => [m.doc?.style?.primary, m.doc?.artboards[0].concept?.org, m.doc?.artboards[0].concept?.type, m.doc?.artboards[0].concept?.colouring])),
);
// the panel's tab, not the header's step of the same name (which goes back to choosing a system)
await page.locator('.bd-left .gx-tab', { hasText: /^System$/ }).click();
await page.waitForTimeout(400);
const target = bd.system.style.primary === 'art-deco' ? 'bauhaus' : 'art-deco';
await page
  .locator('label.gx-field', { hasText: /^Style/ })
  .locator('select')
  .selectOption(target);
await page.getByRole('button', { name: /Preview the board in it/ }).click();
await page.waitForSelector('.bd-pending', { timeout: 10000 });
await page.waitForTimeout(600);
await shot('08-board-restyle-preview');
await page.locator('.bd-pending').getByRole('button', { name: 'Apply' }).click();
bd = await boardReady((x) => x.system?.style?.primary === target);
ok(
  '12. the board’s language changed as one previewed step: the system and every untouched material follow',
  bd?.system?.style?.primary === target && bd.materials.filter((m) => m.type === 'graphic').every((m) => m.doc?.style?.primary === target),
  J(bd?.materials.map((m) => m.doc?.style?.primary)),
);

ok('no page errors', errors.length === 0, J(errors));
ok('no model was asked (style intelligence runs in the browser)', modelCalls.length === 0, J(modelCalls));
await b.close();
console.log(`\nstyle-qa: ${pass} passed, ${fail} failed · screenshots in ${OUT}`);
process.exit(fail ? 1 : 0);
