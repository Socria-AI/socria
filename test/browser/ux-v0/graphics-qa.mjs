// test/browser/ux-v0/graphics-qa.mjs — SocriaUX Graphics in the real app: the twenty-six end-to-end scenarios of the
// Graphics 1.0 brief (its part 20), driven through the interface as a designer would, each result read back from the
// project as the browser keeps it (IndexedDB) or from the file the browser downloaded.
//
// No model is called anywhere: composition, checks and changes in words all run in the browser, and the run fails if
// any model route of /api/ux-v0 is asked. Pictures are the repository's own fixtures; fonts come from Google Fonts.
//
//   UXV0_FORWARD=1 UXV0_BASE=http://127.0.0.1:3100 node test/browser/ux-v0/graphics-qa.mjs   (against `next start`)
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { chromium, S, BASE, ROOT, FX, underTest, handBrief } from './env.mjs';

const V = await underTest();
const { getDocumentProxy } = await import(createRequire(ROOT + 'package.json').resolve('unpdf'));
const JSZip = createRequire(ROOT + 'package.json')('jszip');
const J = JSON.stringify;
const D = V.gfxDoc;
let pass = 0;
let fail = 0;
const results = [];
const ok = (n, c, x = '') => {
  results.push({ n, ok: !!c });
  if (c) (pass++, console.log('  ok  ', n));
  else (fail++, console.log('  FAIL', n, String(x).slice(0, 500)));
};
const errors = [];
const modelCalls = [];
const uploadsSent = [];
const t0 = Date.now();

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
page.on('request', (r) => {
  if (/\/api\/ux-v0\/(generate|refine|brief|discover|direct|critique|design-system|assets|images)/.test(r.url())) modelCalls.push(r.url());
  if (r.method() !== 'GET' && /\/api\//.test(r.url()) && (r.postData() ?? '').length > 2000) uploadsSent.push(r.url());
});

// ── reading the browser's own copy ──
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
const artifactIds = () =>
  page.evaluate(
    () =>
      new Promise((res) => {
        const req = indexedDB.open('socria-ux-v0', 1);
        req.onsuccess = () => {
          const g = req.result.transaction('artifacts', 'readonly').objectStore('artifacts').getAllKeys();
          g.onsuccess = () => res(g.result);
          g.onerror = () => res([]);
        };
        req.onerror = () => res([]);
      }),
  );
/** The open project's document once `pred` holds (the save waits for a pause of up to 1.5 s). */
const docWhere = async (pred, ms = 7000) => {
  const start = Date.now();
  let d = null;
  while (Date.now() - start < ms) {
    d = (await projectOf(pid()))?.graphic?.doc ?? null;
    if (d && pred(d)) return d;
    await page.waitForTimeout(250);
  }
  return d;
};
const nodes = (d, i = 0) => (d ? D.walk(d.artboards[i]).map((l) => l.node) : []);
const role = (d, r, i = 0) => nodes(d, i).find((n) => n.role === r);
const named = (d, name, i = 0) => nodes(d, i).find((n) => n.name === name);
const shape = (n) => n && { x: Math.round(n.x * 10) / 10, y: Math.round(n.y * 10) / 10, w: Math.round(n.w * 10) / 10, h: Math.round(n.h * 10) / 10, r: n.rotation, text: n.text, size: n.size, color: n.color, font: n.font };
const noteText = async () => (await page.locator('.gx-note').allInnerTexts()).join(' ');

// ── the interface ──
const tab = (name) => page.locator('.gx-tab', { hasText: name }).click();
const layer = (name) => page.locator('.gx-layer').filter({ has: page.locator('.gx-layer-name', { hasText: new RegExp(`^${name}$`) }) }).first();
const num = (label) => page.locator('.gx-right label.gx-num').filter({ has: page.locator('span', { hasText: new RegExp(`^${label}$`) }) }).locator('input').first();
const setNum = async (label, v) => {
  const i = num(label);
  await i.fill(String(v));
  await i.press('Enter');
};
const exportItem = async (name) => {
  await page.locator('.gx-export > summary').click();
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.locator('.gx-export-menu button', { hasText: name }).first().click()]);
  await page.locator('.gx-export').evaluate((d) => d.removeAttribute('open'));
  return { name: dl.suggestedFilename(), bytes: readFileSync(await dl.path()) };
};
const pngSize = (buf) => ({ sig: buf.subarray(1, 4).toString() === 'PNG', w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) });
const ask = async (words) => {
  await page.fill('#gx-ask-in', words);
  await page.locator('.gx-ask button[type=submit]').click();
  await page.waitForTimeout(300);
};
const home = async () => {
  await page.locator('.v0-home').click();
  await page.waitForSelector('.sd-home', { timeout: 15000 });
  await page.waitForTimeout(400);
};
/** A new graphic from the home: the words typed, the kind chosen, the brief written by hand (the studio's own way in). */
const begin = async (words) => {
  // the brief written by hand in the workspace (its own form)
  await handBrief(page, 'graphic', words);
  await page.waitForTimeout(500);
};
/** From the brief to the editor: the design composed at once (no direction to choose first). */
const toEditor = async () => {
  await page.getByRole('button', { name: /^Make it$/ }).click();
  await page.waitForSelector('.gx-canvas .gx-board svg', { timeout: 30000 });
  await page.waitForTimeout(1200);
};
const shot = (name) => page.screenshot({ path: `${S}gfx-${name}.png` });

console.log('=== SocriaUX Graphics: the twenty-six scenarios, in the built app ===');
await page.goto(BASE + '/ux-v0', { waitUntil: 'networkidle' });

// ── a website whose direction a graphic will take (scenario 20), made as the app makes one ──
const wbrief = V.normalizeBrief({ pageType: 'website', platform: 'web', objective: 'A website for Salt & Ember, a twelve-table restaurant cooking over fire, where guests book a table and read the menu.', personality: ['warm', 'confident'], visualDirection: 'Warm and editorial, firelight and dark wood.', palette: [], typography: { display: '', body: '' }, decisions: { colour: 'delegated', typography: 'delegated' } }, new Set());
const wdirs = V.proposeDirections({ brief: wbrief, salt: 'graphics-qa-site' });
const site = V.normalizeProject({ ...V.makeProject('create', 'Salt & Ember website'), intent: 'A website for a restaurant', brief: { doc: wbrief, approved: true, version: 1 }, direction: V.normalizeDirectionState({ options: wdirs, chosen: wdirs[1], approved: true }) });
await page.evaluate(async (p) => {
  await new Promise((res, rej) => {
    const req = indexedDB.open('socria-ux-v0', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('artifacts')) db.createObjectStore('artifacts', { keyPath: 'id' });
    };
    req.onsuccess = () => {
      const t = req.result.transaction('projects', 'readwrite');
      t.objectStore('projects').put(p);
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
    };
    req.onerror = () => rej(req.error);
  });
}, JSON.parse(J(site)));
await page.reload({ waitUntil: 'networkidle' });

// ── 1. a new graphics project ──
await begin('A poster for “Letters in Motion”, an experimental typography exhibition, “Twelve type designers, one room”, 12–30 June 2027, bold');
let proj = await projectOf(pid());
ok('1. a new graphics project: begun from the home, kept in this browser as a graphic (not a website)', proj?.medium === 'graphic' && !!proj.graphic && /Letters in Motion/.test(proj.intent), J({ medium: proj?.medium, intent: proj?.intent }));
ok('…the brief is read from the words: the quoted headline and subtitle, the date, the kind, the mood', (await page.inputValue('#gx-headline')) === 'Letters in Motion' && (await page.inputValue('#gx-subhead')) === 'Twelve type designers, one room' && /12–30 June 2027/.test(await page.inputValue('#gx-meta')) && (await page.inputValue('#gx-kind')) === 'poster' && /bold/.test(await page.inputValue('#gx-mood')));
await shot('01-brief');

// a brief without a headline is refused: nothing is composed around invented words
await page.fill('#gx-headline', '');
await page.getByRole('button', { name: /^Make it$/ }).click();
ok('…a brief without a headline is refused and said (no words are invented)', /Write the headline first/.test(await page.locator('.gx-brief .v0-error-line').innerText().catch(() => '')));
await page.fill('#gx-headline', 'Letters in Motion');
await page.fill('#gx-brand', 'The Print Room');

// ── 2. an editable poster from the brief ──
await page.getByRole('button', { name: /^Make it$/ }).click();
await page.waitForSelector('.gx-canvas .gx-board svg', { timeout: 30000 });
await page.waitForTimeout(1500);
ok('2. the design is composed at once from the brief: no directions to choose first, no Directions step', (await page.locator('.gx-dir').count()) === 0 && (await page.locator('.v0-steps .sb-seg-item').filter({ hasText: 'Directions' }).count()) === 0);
await shot('02-composed');
let doc = await docWhere((d) => d.artboards.length >= 1);
const texts = nodes(doc).filter((n) => n.type === 'text');
const canvasTexts = await page.locator('.gx-board svg text').allTextContents();
ok('…an editable poster: real text objects with the exact words (never a picture of them), shapes as vectors, drawn as SVG text on the canvas', texts.some((t) => t.text === 'Letters in Motion' && t.role === 'headline') && texts.some((t) => t.text === 'Twelve type designers, one room') && canvasTexts.join(' ').replace(/\s+/g, ' ').toLowerCase().includes('letters') && !nodes(doc).some((n) => n.type === 'image'), J(texts.map((t) => [t.role, t.text])));
ok('…an A4 print artboard in points, with bleed and a safe area', doc.artboards[0].unit === 'pt' && Math.round(doc.artboards[0].width) === 595 && doc.artboards[0].bleed > 0 && doc.artboards[0].safe > 0, J(doc.artboards[0]).slice(0, 200));
ok('…composed and checked without a model, and said so', /without a model/.test(await noteText()) && modelCalls.length === 0, await noteText());
await shot('03-editor');

// ── the concept the design was generated from, and creative direction in one click ──
await tab('Concept');
await page.waitForSelector('.gx-concept-idea', { timeout: 10000 });
const conceptIdea = await page.locator('.gx-concept-idea').innerText();
await shot('03-concept');
ok('the Concept tab says the idea the design was generated from, its art direction and its strategies', conceptIdea.length > 40 && (await page.locator('.gx-concept-dl dt').count()) >= 5 && !!doc.artboards[0].concept?.idea, conceptIdea.slice(0, 160));
const beforeRethink = await docWhere(() => true);
await page.locator('.gx-concept-acts button', { hasText: 'Rethink the composition' }).click();
await page.waitForSelector('.gx-pending', { timeout: 15000 });
await shot('03-concept-rethink');
ok('…a creative direction in one click is shown first, as a preview to apply or discard', (await page.locator('.gx-pending').count()) === 1);
await page.locator('.gx-pending').getByRole('button', { name: /^Discard/ }).click();
const afterDiscard = await docWhere((d) => (d.compositionMemory ?? []).some((m) => m.verdict === 'rejected'));
ok('…discarded: the design exactly as it was, and that concept remembered as not wanted', J(afterDiscard.artboards[0].children.map((n) => n.id)) === J(beforeRethink.artboards[0].children.map((n) => n.id)) && afterDiscard.compositionMemory.some((m) => m.verdict === 'rejected'));
doc = afterDiscard;

// ── 9. upload and position a picture ──
const artifactsBefore = await artifactIds();
await tab('Add');
await page.locator('.gx-add input[type=file]').setInputFiles(FX + 'pour.jpg');
doc = await docWhere((d) => d.assets.length > 0 && nodes(d).some((n) => n.type === 'image'));
let img = nodes(doc).find((n) => n.type === 'image');
const blob = await page.locator('.gx-board svg image').first().getAttribute('href').catch(() => null);
ok('9. a picture uploaded: kept in this browser (not sent anywhere), added to the design and placed, drawn from its own file', !!img && doc.assets[0].src.startsWith('upload:') && (await artifactIds()).length === artifactsBefore.length + 1 && /^blob:/.test(blob ?? '') && uploadsSent.length === 0, J({ assets: doc.assets, blob, uploadsSent }));
const imgX = img.x;
await page.keyboard.down('Shift');
await page.keyboard.press('ArrowRight');
await page.keyboard.press('ArrowRight');
await page.keyboard.up('Shift');
await page.keyboard.press('ArrowDown');
doc = await docWhere((d) => Math.abs(nodes(d).find((n) => n.type === 'image').x - (imgX + 20)) < 0.05);
img = nodes(doc).find((n) => n.type === 'image');
ok('…and positioned: nudged with the arrows (Shift: ten units), exactly', Math.abs(img.x - (imgX + 20)) < 0.05, `${imgX} → ${img.x}`);
await setNum('X', 300);
doc = await docWhere((d) => Math.abs(nodes(d).find((n) => n.type === 'image').x - 300) < 0.05);
ok('…and placed exactly by its X field', Math.abs(nodes(doc).find((n) => n.type === 'image').x - 300) < 0.05);
// the picture is not what this poster is about: deleted, by key (shortcuts never act while a field is being typed in)
await page.evaluate(() => document.activeElement?.blur());
await page.keyboard.press('Delete');
doc = await docWhere((d) => !nodes(d).some((n) => n.type === 'image'));
ok('…and deleted with the Delete key (one step of the history)', !nodes(doc).some((n) => n.type === 'image'));

// ── 10. vector geometry ──
await tab('Add');
await page.locator('.gx-add button', { hasText: /^Star$/ }).click();
doc = await docWhere((d) => nodes(d).some((n) => n.type === 'shape' && n.shape === 'star'));
let star = nodes(doc).find((n) => n.shape === 'star');
await setNum('Points', 7);
await page.locator('.gx-right label.gx-colour').filter({ hasText: 'Fill' }).locator('input').fill('#c2410c');
await setNum('Stroke', 3);
doc = await docWhere((d) => {
  const s = nodes(d).find((n) => n.shape === 'star');
  return s && s.sides === 7 && s.fill === '#c2410c' && s.stroke?.width === 3;
});
star = nodes(doc).find((n) => n.shape === 'star');
const starPath = await page.locator(`.gx-board [data-gfx-id="${star.id}"] polygon, .gx-board [data-gfx-id="${star.id}"] path`).first().getAttribute('points').catch(() => null) ?? (await page.locator(`.gx-board [data-gfx-id="${star.id}"] path`).first().getAttribute('d').catch(() => null));
ok('10. vector geometry made and edited: a star, then seven points, its fill and its stroke, drawn as vector geometry', star.sides === 7 && star.fill === '#c2410c' && star.stroke?.width === 3 && !!starPath, J(star));
await setNum('W', 120);
doc = await docWhere((d) => Math.abs(nodes(d).find((n) => n.shape === 'star').w - 120) < 0.1);
const h120 = nodes(doc).find((n) => n.shape === 'star').h;
await page.locator('.gx-right .gx-ratio input').check();
await setNum('W', 180);
doc = await docWhere((d) => Math.abs(nodes(d).find((n) => n.shape === 'star').w - 180) < 0.1);
star = nodes(doc).find((n) => n.shape === 'star');
ok('…sized exactly, and its proportions kept when asked (W 120 → 180, H × 1.5)', Math.abs(star.w - 180) < 0.1 && Math.abs(star.h - h120 * 1.5) < 0.2, J({ h120, star: shape(star) }));
await page.evaluate(() => document.activeElement?.blur());
await page.keyboard.press('Delete');
await docWhere((d) => !nodes(d).some((n) => n.shape === 'star'));

// ── 11. typography, precisely ──
await tab('Layers');
await layer('Headline').click();
await setNum('Size', 96);
await setNum('Tracking', -20);
await page.locator('.gx-right label.gx-sel-field').filter({ hasText: 'Face' }).locator('select').selectOption('Fraunces');
await page.locator('.gx-right label.gx-sel-field').filter({ hasText: 'Weight' }).locator('select').selectOption('700');
doc = await docWhere((d) => {
  const h = role(d, 'headline');
  return h.size === 96 && h.tracking === -20 && h.font === 'Fraunces' && h.weight === 700;
});
let head = role(doc, 'headline');
ok('11. typography edited precisely: size 96, tracking −20, Fraunces at 700, each as one change', head.size === 96 && head.tracking === -20 && head.font === 'Fraunces' && head.weight === 700, J(shape(head)));
await layer('Subhead').click();
const words = page.locator('.gx-right .gx-text textarea').first();
await words.fill('Twelve type designers. One room.');
await words.blur();
doc = await docWhere((d) => role(d, 'subhead').text === 'Twelve type designers. One room.');
ok('…the words edited exactly as typed', role(doc, 'subhead').text === 'Twelve type designers. One room.');
const fontLoaded = await page.evaluate(() => document.fonts.check('700 40px "Fraunces"'));
ok('…the face really loaded in the page before it is measured (Google Fonts)', fontLoaded);

// ── 12. move and resize, with the pointer ──
const zoomOf = async () => (await page.locator('.gx-board').boundingBox()).width / doc.artboards[0].width;
let sub = role(doc, 'subhead');
let z = await zoomOf();
let sel = await page.locator('.gx-sel').first().boundingBox();
await page.keyboard.down('Alt');
await page.mouse.move(sel.x + sel.width / 2, sel.y + sel.height / 2);
await page.mouse.down();
await page.mouse.move(sel.x + sel.width / 2 + 60, sel.y + sel.height / 2 + 40, { steps: 10 });
await page.mouse.up();
await page.keyboard.up('Alt');
doc = await docWhere((d) => Math.abs(role(d, 'subhead').x - sub.x) > 1);
let moved = role(doc, 'subhead');
ok('12. moved with the pointer: by exactly the distance dragged at this zoom (snapping off with Alt)', Math.abs(moved.x - sub.x - 60 / z) < 0.6 && Math.abs(moved.y - sub.y - 40 / z) < 0.6, `${J(shape(sub))} → ${J(shape(moved))} at ${z}`);
sel = await page.locator('.gx-sel').first().boundingBox();
const se = await page.locator('.gx-h-se').boundingBox();
await page.mouse.move(se.x + se.width / 2, se.y + se.height / 2);
await page.mouse.down();
await page.mouse.move(se.x + se.width / 2 + 50, se.y + se.height / 2 + 24, { steps: 8 });
await page.mouse.up();
doc = await docWhere((d) => Math.abs(role(d, 'subhead').w - moved.w) > 1);
const resized = role(doc, 'subhead');
ok('…resized by its corner handle: wider and taller by the distance dragged, its corner held', Math.abs(resized.w - moved.w - 50 / z) < 0.6 && Math.abs(resized.h - moved.h - 24 / z) < 0.6 && Math.abs(resized.x - moved.x) < 0.05, `${J(shape(moved))} → ${J(shape(resized))}`);
const rot = await page.locator('.gx-h-rot').boundingBox();
await page.mouse.move(rot.x + 5, rot.y + 5);
await page.mouse.down();
await page.mouse.move(rot.x + 140, rot.y + 60, { steps: 8 });
await page.mouse.up();
doc = await docWhere((d) => role(d, 'subhead').rotation !== 0);
ok('…turned by its rotation handle', role(doc, 'subhead').rotation !== 0, J(shape(role(doc, 'subhead'))));
await setNum('Turn', 0);
await docWhere((d) => role(d, 'subhead').rotation === 0);
await page.evaluate(() => document.activeElement?.blur());
await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
doc = await docWhere((d) => role(d, 'subhead').rotation !== 0);
ok('…and every one of those a step the history takes back (⌘Z / Ctrl+Z)', role(doc, 'subhead').rotation !== 0);
await setNum('Turn', 0);
doc = await docWhere((d) => role(d, 'subhead').rotation === 0);
await shot('12-moved');

// ── 13. group and ungroup ──
const beforeGroup = await docWhere(() => true);
await layer('Subhead').click();
await layer('Meta').click({ modifiers: ['Shift'] });
await page.locator('.gx-right button', { hasText: /^Group$/ }).click();
// the group just made (a generated design may hold groups of its own: turned or cut material), waited for itself
const holdsWords = (n) => n.type === 'group' && n.children.some((c) => c.role === 'subhead');
doc = await docWhere((d) => d.artboards[0].children.some(holdsWords));
const grp = doc.artboards[0].children.find(holdsWords);
const onBoard = (d, r) => {
  const b = D.boxOnBoard(D.locate(d, role(d, r).id));
  return [Math.round(b.x * 10) / 10, Math.round(b.y * 10) / 10];
};
ok('13. grouped: the two objects in one group, their places on the artboard unchanged', grp && grp.children.length === 2 && grp.children.some((n) => n.role === 'subhead') && grp.children.some((n) => n.role === 'meta') && J(onBoard(doc, 'subhead')) === J(onBoard(beforeGroup, 'subhead')) && J(onBoard(doc, 'meta')) === J(onBoard(beforeGroup, 'meta')), J({ roles: grp?.children.map((n) => n.role), now: onBoard(doc, 'subhead'), was: onBoard(beforeGroup, 'subhead') }));
await page.locator('.gx-right button', { hasText: /^Ungroup$/ }).click().catch(async () => {
  await layer(grp.name ?? 'Group').click();
  await page.locator('.gx-right button', { hasText: /^Ungroup$/ }).click();
});
doc = await docWhere((d) => !d.artboards[0].children.some(holdsWords));
ok('…and ungrouped: both back on the artboard where they were', !doc.artboards[0].children.some(holdsWords) && !!role(doc, 'subhead') && !!role(doc, 'meta') && Math.abs(role(doc, 'subhead').x - resized.x) < 0.05, J(shape(role(doc, 'subhead'))));

// ── 14. lock an object, change what is around it ──
await tab('Layers');
await layer('Headline').getByRole('button', { name: /^Lock Headline$/ }).click();
doc = await docWhere((d) => role(d, 'headline').locked === true);
head = role(doc, 'headline');
await layer('Headline').click();
await page.evaluate(() => document.activeElement?.blur());
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(400);
const lockNote = await noteText();
await layer('Subhead').click();
const subX = role(doc, 'subhead').x;
await page.keyboard.press('ArrowLeft');
doc = await docWhere((d) => Math.abs(role(d, 'subhead').x - (subX - 1)) < 0.05);
ok('14. a locked object is not moved (the refusal said), while the one beside it moves', role(doc, 'headline').x === head.x && /locked/i.test(lockNote) && Math.abs(role(doc, 'subhead').x - (subX - 1)) < 0.05, lockNote);
await page.keyboard.press('Escape');
await ask('make the headline bigger');
const lockedAsk = await noteText();
const stillHead = role(await docWhere(() => true), 'headline');
ok('…and a change in words that would alter it is refused with a way forward, not applied in part', /locked/i.test(lockedAsk) && stillHead.size === head.size && !(await page.locator('.gx-pending').count()), lockedAsk);
await layer('Headline').getByRole('button', { name: /^Unlock Headline$/ }).click();
doc = await docWhere((d) => !role(d, 'headline').locked);

// ── 15. a targeted change in words, previewed, applied ──
const before15 = await docWhere(() => true);
await page.keyboard.press('Escape');
await ask('move the subtitle beneath the main headline');
const pendingText = await page.locator('.gx-pending').innerText().catch(() => '');
await shot('15-preview');
const unchangedWhilePreview = J(await docWhere(() => true)) === J(before15);
await page.locator('.gx-pending button', { hasText: 'Apply' }).click();
doc = await docWhere((d) => role(d, 'subhead').y !== role(before15, 'subhead').y);
const h15 = role(doc, 'headline');
const s15 = role(doc, 'subhead');
const others = (d) => nodes(d).filter((n) => n.role !== 'subhead').map((n) => J(shape(n)));
ok('15. a targeted change in words: previewed first (the design untouched until applied), then only the subtitle moved, beneath the headline', /subtitle moved beneath the headline/.test(pendingText) && unchangedWhilePreview && s15.y >= h15.y + h15.h - 0.5 && J(others(doc)) === J(others(before15)), J({ pendingText, h: shape(h15), s: shape(s15) }));
const versions15 = (await projectOf(pid())).graphic.versions;
ok('…kept as a named version (auditable)', versions15.at(-1).label.includes('subtitle moved beneath the headline'), versions15.at(-1).label);

// ── 16. undo and redo the change in words ──
await page.locator('.gx-toolbar button', { hasText: /^Undo$/ }).click();
const undone = await docWhere((d) => role(d, 'subhead').y === role(before15, 'subhead').y);
await page.locator('.gx-toolbar button', { hasText: /^Redo$/ }).click();
const redone = await docWhere((d) => role(d, 'subhead').y === s15.y);
ok('16. the change in words undone (exactly as before) and redone (exactly as after)', J(nodes(undone).map(shape)) === J(nodes(before15).map(shape)) && J(nodes(redone).map(shape)) === J(nodes(doc).map(shape)));

// ── 17. save and reopen ──
const savedDoc = await docWhere(() => true);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.gx-canvas .gx-board svg', { timeout: 30000 });
await page.waitForTimeout(800);
const reopened = (await projectOf(pid())).graphic.doc;
ok('17. saved without asking and reopened after a reload: the same design, exactly', J(reopened) === J(savedDoc));
await home();
await page.getByText('Letters in Motion').first().click();
await page.waitForSelector('.gx-canvas .gx-board svg', { timeout: 30000 });
await page.waitForTimeout(800);
ok('…and from the home’s collection, where it is labelled as a graphic', J((await projectOf(pid())).graphic.doc) === J(savedDoc));
const native = await exportItem('Save the design file');
writeFileSync(`${S}gfx-letters.socriaux.json`, native.bytes);
const back = V.gfxExport.openNativeFile(native.bytes.toString('utf8'));
ok('…and as a design file of its own (socriaux.graphic/1) that opens to the same artboards and objects', back && J(back.doc.artboards) === J(savedDoc.artboards) && /\.socriaux\.json$/.test(native.name), native.name);

// ── 18. duplicate an artboard ──
await tab('Artboards');
await page.locator('.gx-boards button[aria-label^="Duplicate"]').first().click();
doc = await docWhere((d) => d.artboards.length === 2);
ok('18. an artboard duplicated: a second artboard with the same words and objects, under new ids, shown', doc.artboards.length === 2 && J(nodes(doc, 1).map((n) => [n.role, n.text])) === J(nodes(doc, 0).map((n) => [n.role, n.text])) && nodes(doc, 1).every((n) => !nodes(doc, 0).some((m) => m.id === n.id)) && (await page.locator('.gx-boardpick select').inputValue()) === doc.artboards[1].id);

// ── 19. adapt to a new format ──
await page.locator('select[aria-label="Format to adapt to"]').selectOption('story');
await page.getByRole('button', { name: 'Adapt to this format' }).click();
doc = await docWhere((d) => d.artboards.length === 3);
const story = doc.artboards[2];
const storyHead = nodes(doc, 2).find((n) => n.role === 'headline');
const a4Head = role(doc, 'headline');
ok('19. adapted to a story: 1080 × 1920 px, laid out again (not stretched), every word kept exactly, the type style kept', story.width === 1080 && story.height === 1920 && storyHead?.text === a4Head.text && storyHead.font === a4Head.font && nodes(doc, 2).some((n) => n.role === 'subhead' && n.text === role(doc, 'subhead').text) && Math.abs(storyHead.w / story.width - a4Head.w / doc.artboards[0].width) < 0.5, J({ w: story.width, h: story.height, head: shape(storyHead) }));
await shot('19-story');

// ── 21–23. export: PNG, SVG, PDF ──
await page.locator('.gx-boardpick select').selectOption(doc.artboards[0].id);
await page.waitForTimeout(400);
const png = await exportItem(/^PNG at 300 dpi$/);
const ps = pngSize(png.bytes);
const want = V.gfxFormats.exportPixels(doc.artboards[0]);
writeFileSync(`${S}gfx-letters.png`, png.bytes);
ok(`21. PNG exported through the browser: a real PNG at print resolution (${want.w} × ${want.h} px for A4 at 300 dpi)`, ps.sig && ps.w === want.w && ps.h === want.h && /\.png$/.test(png.name), J({ ps, want, name: png.name }));
const clear = await exportItem('PNG, transparent ground');
ok('…and with a transparent ground', pngSize(clear.bytes).sig && clear.bytes.length > 1000);
const svg = await exportItem('SVG (text kept as text)');
const svgText = svg.bytes.toString('utf8');
writeFileSync(`${S}gfx-letters.svg`, svgText);
// the headline's words as shown (a style may set them in capitals), each kept as text (lines and runs are spans of their own)
const headNode = nodes(doc).find((n) => n.type === 'text' && n.role === 'headline');
const shownHead = headNode ? V.gfxText.shownText(headNode) : 'Letters';
// spans within one line of text join without a space (a headline set letter by letter is still its words)
const svgWords = svgText.replace(/<\/?tspan[^>]*>/g, '').replace(/<[^>]+>/g, ' ');
ok('22. SVG exported: text kept as text with the exact words, its faces linked, no script, sized in points', /<text/.test(svgText) && shownHead.split(/\s+/).every((w) => svgWords.includes(w)) && /fonts\.googleapis\.com/.test(svgText) && !/<script/i.test(svgText) && /width="[\d.]+pt"/.test(svgText), J({ shownHead, start: svgText.slice(0, 160) }));
const pdf = await exportItem(/^PDF$/);
writeFileSync(`${S}gfx-letters.pdf`, pdf.bytes);
const pd = await getDocumentProxy(new Uint8Array(pdf.bytes));
const p1 = await pd.getPage(1);
const p3 = await pd.getPage(3);
ok('23. PDF exported: one page per artboard (3), each at its exact size (A4 595.3 × 841.9 pt; the story 810 × 1440 pt)', pd.numPages === 3 && Math.abs(p1.view[2] - 595.28) < 0.5 && Math.abs(p1.view[3] - 841.89) < 0.5 && Math.abs(p3.view[2] - 810) < 0.5, J({ pages: pd.numPages, p1: p1.view, p3: p3.view }));
const bleedPdf = await exportItem('PDF with bleed');
const bleedText = bleedPdf.bytes.toString('latin1');
const pb = await getDocumentProxy(new Uint8Array(bleedPdf.bytes));
const pb1 = await pb.getPage(1);
ok('…and with bleed: the page grown by the bleed on every side, with its trim and bleed boxes', /\/TrimBox/.test(bleedText) && /\/BleedBox/.test(bleedText) && Math.abs(pb1.view[2] - (595.28 + doc.artboards[0].bleed * 2)) < 0.6, J(pb1.view));

// ── 25. safe recovery from an invalid operation ──
const beforeBad = await docWhere(() => true);
writeFileSync(`${S}gfx-broken.socriaux.json`, '{"format":"socriaux.graphic/1","doc":{"artboards":"nope"');
await page.locator('.gx-toolbar input[type=file][accept*="json"]').setInputFiles(`${S}gfx-broken.socriaux.json`);
await page.waitForTimeout(600);
const brokenNote = await noteText();
const afterBroken = await docWhere(() => true);
const bad = V.gfxDoc.applyOps(beforeBad, [
  { op: 'move', id: role(beforeBad, 'headline').id, dx: 10, dy: 0 },
  { op: 'add', artboard: beforeBad.artboards[0].id, node: { type: 'image', asset: 'nope', x: 0, y: 0, w: 10, h: 10 } },
]);
const hostile = J({
  format: 'socriaux.graphic/1',
  doc: {
    ...beforeBad,
    assets: [{ id: 'evil', kind: 'image', src: 'javascript:window.__pwned=1', width: 10, height: 10, name: 'Evil', source: 'upload' }],
    artboards: [{ ...beforeBad.artboards[0], children: [...beforeBad.artboards[0].children, { id: 'xss', type: 'text', role: 'body', text: '<script>window.__pwned=2</script><img src=x onerror="window.__pwned=3">', x: 40, y: 40, w: 400, h: 80, size: 16, font: 'Inter', weight: 400, color: '#111111', rotation: 0, opacity: 1 }, { id: 'evilimg', type: 'image', asset: 'evil', x: 0, y: 0, w: 50, h: 50, rotation: 0, opacity: 1, fit: 'cover' }] }],
  },
});
writeFileSync(`${S}gfx-hostile.socriaux.json`, hostile);
await page.locator('.gx-toolbar input[type=file][accept*="json"]').setInputFiles(`${S}gfx-hostile.socriaux.json`);
await page.waitForTimeout(1200);
const hostileNote = await noteText();
const hostileDoc = await docWhere((d) => nodes(d).some((n) => n.id === 'xss'));
const pwned = await page.evaluate(() => window.__pwned ?? null);
const injected = await page.evaluate(() => ({ script: !!document.querySelector('.gx-board script'), onerror: !!document.querySelector('.gx-board [onerror]'), img: !!document.querySelector('.gx-board img') }));
ok('25. invalid and hostile input recovered from safely: a broken file refused (design unchanged); an operation list with one bad step refused whole; a file with a script address and markup in its words opened with the picture left out and the words shown as words, nothing run', /not a SocriaUX graphic/.test(brokenNote) && J(afterBroken) === J(beforeBad) && bad.ok === false && !hostileDoc.assets.some((a) => a.id === 'evil') && !nodes(hostileDoc).some((n) => n.id === 'evilimg') && nodes(hostileDoc).find((n) => n.id === 'xss')?.text.startsWith('<script>') && pwned === null && !injected.script && !injected.onerror && !injected.img && /left out/.test(hostileNote), J({ brokenNote, bad, pwned, injected, hostileNote }));
await page.locator('.gx-toolbar button', { hasText: /^Undo$/ }).click();
doc = await docWhere((d) => !nodes(d).some((n) => n.id === 'xss'));
ok('…and the opened file is one step the history takes back', !nodes(doc).some((n) => n.id === 'xss') && doc.artboards.length === 3);
const lettersId = pid();
const lettersUpload = (await projectOf(lettersId)).graphic.versions.flatMap((v) => v.doc.assets).concat(doc.assets).find((a) => a.src.startsWith('upload:'))?.src.slice(7);

// ── 3. a social media graphic ──
await home();
await begin('An Instagram post announcing “Open Studio Night”, “Come and see what we make”, 14 March 2027, friendly');
await toEditor();
doc = await docWhere((d) => d.artboards.length >= 1);
ok('3. a social media graphic: an Instagram post, 1080 × 1080 px, its words exactly', doc.artboards[0].width === 1080 && doc.artboards[0].height === 1080 && doc.artboards[0].unit === 'px' && role(doc, 'headline')?.text === 'Open Studio Night', J({ w: doc.artboards[0].width, head: role(doc, 'headline')?.text }));
ok('…its own pictures, none borrowed from another project', doc.assets.length === 0);
await shot('03-social');

// ── 4. a luxury advertisement ──
await home();
await begin('A luxury fashion advertisement for “Maison Orée”, “The Autumn Collection”, luxurious, elegant');
await toEditor();
doc = await docWhere((d) => d.artboards.length >= 1);
ok('4. a luxury advertisement: a portrait ad (1080 × 1350 px) with the exact words, restrained', doc.artboards[0].width === 1080 && doc.artboards[0].height === 1350 && role(doc, 'headline')?.text === 'Maison Orée' && nodes(doc).some((n) => n.text === 'The Autumn Collection'), J(nodes(doc).map((n) => [n.role, n.text])));
await shot('04-luxury');

// ── 5. a minimalist editorial cover ──
await home();
await begin('A minimalist editorial magazine cover for “The Quiet Issue”, minimal');
await page.fill('#gx-brand', 'Interval');
await toEditor();
doc = await docWhere((d) => d.artboards.length >= 1);
ok('5. a minimalist editorial cover: the magazine format, its masthead and its headline, exactly', doc.artboards[0].format === 'magazine' && nodes(doc).some((n) => n.role === 'logo' && n.text === 'Interval') && role(doc, 'headline')?.text === 'The Quiet Issue', J(nodes(doc).map((n) => [n.role, n.text])));
await shot('05-cover');

// ── 6 and 24. a carousel; a multi-artboard export ──
await home();
await begin('An Instagram carousel “Five habits of calm teams” “Write it down” “Meet less” “Decide once” “Protect focus” “Say no kindly”, calm');
ok('…a carousel’s points are read from the quotes, one per slide', (await page.inputValue('#gx-items')).split('\n').length === 5 && (await page.inputValue('#gx-kind')) === 'carousel');
await toEditor();
doc = await docWhere((d) => d.artboards.length >= 6);
const slideWords = doc.artboards.flatMap((ab) => D.walk(ab).map((l) => l.node.text).filter(Boolean));
ok('6. a carousel: a cover, a slide for each point, an ending; each slide 1080 × 1080, every point exactly once', doc.artboards.length >= 6 && doc.artboards.every((ab) => ab.width === 1080 && ab.height === 1080) && ['Write it down', 'Meet less', 'Decide once', 'Protect focus', 'Say no kindly'].every((p) => slideWords.filter((w) => w === p).length === 1), J(doc.artboards.map((ab) => ab.name)));
await shot('06-carousel');
const zip = await exportItem('PNG files (.zip)');
const z1 = await JSZip.loadAsync(zip.bytes);
const files = Object.keys(z1.files).filter((f) => f.endsWith('.png'));
const firstPng = pngSize(await z1.files[files[0]].async('nodebuffer'));
const cpdf = await exportItem(/^PDF$/);
const cpd = await getDocumentProxy(new Uint8Array(cpdf.bytes));
ok(`24. a multi-artboard export: every slide as a PNG in one .zip (${files.length}), and one PDF page per slide`, files.length === doc.artboards.length && firstPng.sig && firstPng.w === 1080 && cpd.numPages === doc.artboards.length, J({ files: files.length, pages: cpd.numPages, boards: doc.artboards.length }));
const carouselId = pid();

// ── 7. a brand identity graphic (Engine 2.0: built from a generated, approved logo, never a typed wordmark) ──
await home();
await begin('A brand identity board for “Kepler Lab”, a science studio, geometric');
await page.fill('#gx-brand', 'Kepler Lab');
await page.getByRole('button', { name: /^Make the logo$/ }).click();
// the concepts are constructed and the first opens in the editor, the others in its Logo tab
await page.waitForSelector('.gx-logo', { timeout: 30000 });
await page.getByRole('button', { name: 'Approve this logo' }).click();
await page.waitForTimeout(800);
await page.getByRole('button', { name: 'Build the identity' }).click();
doc = await docWhere((d) => d.artboards.length >= 12, 15000);
ok('7. a brand identity graphic: a generated logo approved, then its identity sheet (palette, typography, pattern, icons, rules) and its variants, each its own artboard', doc.artboards.length >= 12 && doc.artboards.some((ab) => /identity sheet/.test(ab.name)) && doc.artboards.some((ab) => /Favicon/.test(ab.name)) && doc.artboards.find((ab) => ab.logo)?.logo.brief.name === 'Kepler Lab', J(doc.artboards.map((ab) => ab.name)));
await shot('07-identity');

// ── 8. a structured infographic ──
await home();
await begin('A statistical infographic “Where our donations went”');
await page.selectOption('#gx-kind', 'infographic');
await page.fill('#gx-data', 'Programmes: 72%\nFundraising: 18%\nRunning costs: 10%');
await page.fill('#gx-source', 'Annual report 2026');
await page.fill('#gx-items', 'Seven in ten pounds go straight to programmes.');
await toEditor();
doc = await docWhere((d) => nodes(d).some((n) => n.type === 'chart'));
const chart = nodes(doc).find((n) => n.type === 'chart');
ok('8. a structured infographic: a chart drawn from exactly the numbers given (72, 18, 10 %), its source said, its takeaway in words', chart && J(chart.data.map((d) => d.value)) === '[72,18,10]' && chart.unit === '%' && (chart.source === 'Annual report 2026' || nodes(doc).some((n) => /Annual report 2026/.test(n.text ?? ''))) && nodes(doc).some((n) => n.text === 'Seven in ten pounds go straight to programmes.'), J(chart));
await layer(chart.name ?? 'Chart').click().catch(() => undefined);
await shot('08-infographic');

// ── 20. a graphic in a website's creative direction ──
await home();
await begin('A poster for the opening night of “Salt & Ember”, “Twelve tables, one fire”, 2 May 2027');
await page.selectOption('#gx-site', { label: `Salt & Ember website · ${wdirs[1].name}` });
await page.waitForTimeout(300);
await page.getByRole('button', { name: /Compose it in that direction/ }).click();
await page.waitForSelector('.gx-canvas .gx-board svg', { timeout: 30000 });
doc = await docWhere((d) => d.artboards.length >= 1);
const wt = wdirs[1].tokens;
proj = await projectOf(pid());
ok('20. a graphic made in a website’s approved direction: its typefaces and colours carried over, the source named', doc.tokens.fonts.display === wt.fonts.display && doc.tokens.fonts.body === wt.fonts.body && doc.tokens.colors.accent === wt.colors.accent && proj.graphic.source?.projectId === site.id && proj.graphic.direction?.name === wdirs[1].name, J({ fonts: doc.tokens.fonts, want: wt.fonts, source: proj.graphic.source }));
await tab('Brand');
ok('…said in the Brand panel', /Salt & Ember website/.test(await page.locator('.gx-left-body').innerText()));
await shot('20-from-website');

// ── 26. user isolation and asset access ──
await home();
const api = await page.evaluate(async () => {
  const get = await fetch('/api/ux-v0/projects');
  const one = await fetch('/api/ux-v0/projects?id=anything');
  const put = await fetch('/api/ux-v0/projects', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project: { id: 'x' } }) });
  const del = await fetch('/api/ux-v0/projects?id=anything', { method: 'DELETE' });
  return [get.status, one.status, put.status, del.status];
});
const carousel = await projectOf(carouselId);
ok('26. isolation: the account copy of projects refuses anyone not signed in (list, read, write, delete: 401); another project carries none of this one’s pictures', J(api) === '[401,401,401,401]' && !carousel.graphic.doc.assets.some((a) => a.src === `upload:${lettersUpload}`), J(api));
// everything made is in its own view (the home is one composer)
await page.goto(BASE + '/ux-v0?work=1', { waitUntil: 'networkidle' });
await page.waitForSelector('.sd-work', { timeout: 15000 });
const card = page.locator('.mu-exhibit').filter({ hasText: 'Letters in Motion' }).first();
await card.scrollIntoViewIfNeeded();
await page.waitForTimeout(1500);
const cardText = await card.innerText().catch(() => '');
ok('…your work labels a graphic as one (its kind and direction), with its own thumbnail drawn by the same renderer', /Poster ·/.test(cardText) && (await card.locator('.mu-plate-svg svg').count()) === 1 && (await card.locator('.mu-plate-svg svg text').count()) > 0, cardText);
const artBefore = await artifactIds();
await card.getByRole('button', { name: 'Delete' }).click();
await page.getByRole('button', { name: 'Delete it' }).click();
await page.waitForTimeout(800);
const artAfter = await artifactIds();
ok('…deleting a graphic lets go of the pictures uploaded for it, and only those', !!lettersUpload && artBefore.includes(lettersUpload) && !artAfter.includes(lettersUpload) && artAfter.length === artBefore.length - 1, J({ lettersUpload, before: artBefore.length, after: artAfter.length }));

// ── the whole run ──
ok('no model route was called in the whole run (composition, checks and changes in words are code)', modelCalls.length === 0, J(modelCalls));
ok('no error in the page', errors.length === 0, J(errors));
console.log(`\n${pass} passed, ${fail} failed (${Math.round((Date.now() - t0) / 1000)} s); screenshots and exports in ${S}`);
writeFileSync(`${S}gfx-qa-results.json`, J({ pass, fail, results, ms: Date.now() - t0 }, null, 1));
await b.close();
process.exit(fail ? 1 : 0);
