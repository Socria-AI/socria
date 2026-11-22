// test/browser/ux-v0/explore-qa.mjs — exploring a part's composition in the real app: explore, compare, set aside,
// combine, nudge, use, hold and release.
//
// A website project (an experimental artist's portfolio, its direction approved, its design generated from a
// deliberately conventional answer and held to the direction's strategy) is written into the browser's own store,
// the way the app keeps projects, and opened from the home. No model is called: generation happened in code here,
// exactly as the generate route holds a model's answer (lib/ux-v0/design.ts parseGenerate).
//
//   UXV0_FORWARD=1 UXV0_BASE=http://127.0.0.1:3100 node test/browser/ux-v0/explore-qa.mjs   (against `next start`)
import { chromium, S, BASE, underTest } from './env.mjs';

const V = await underTest();
const J = JSON.stringify;
let pass = 0;
let fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok  ', n, process.env.UXV0_TRACE ? `[errors so far: ${errors.length}]` : '')) : (fail++, console.log('  FAIL', n, String(x).slice(0, 400))));
const errors = [];

// ── the project, made as the app makes one ──
const brief = V.normalizeBrief({ pageType: 'website', platform: 'web', objective: 'A portfolio for an experimental artist working in collage and installation.', audience: 'Curators and collectors', personality: ['raw', 'daring'], visualDirection: 'Experimental and fragmented: collage, torn and cut-up, abstract and off-grid, layered with depth.', palette: [], typography: { display: '', body: '' }, decisions: { colour: 'delegated', typography: 'delegated' } }, new Set());
const dirs = V.proposeDirections({ brief, salt: 'explore-qa' });
const dir = dirs[0];
const pal = V.paletteOf(dir.tokens, dir.look.accent2 ?? '');
const refs = [0, 1, 2, 3].map((i) => V.normalizeRef({ ...V.procRef(V.normalizeProc({ kind: ['field', 'contour', 'lattice', 'grain'][i], seed: 5 + i * 7, ratio: i ? '1:1' : '16:9', palette: pal }), 'a stand-in until the artist’s own pictures'), state: 'kept', asContent: true }));
const moodboard = V.normalizeMoodboard({ refs });
const answer = {
  title: 'Ines Varga',
  sections: [
    { id: 'nav', kind: 'nav', variant: 'inline', content: { brand: 'Ines Varga', links: ['Work', 'Method'], cta: 'See the archive' } },
    { id: 'hero', kind: 'hero', variant: 'centered', content: { title: 'Things broken on purpose', subtitle: 'Collage, print and installation.', primary: 'See the archive' }, images: [refs[0].id] },
    { id: 'method', kind: 'features', variant: 'grid', content: { title: 'Method', items: [{ title: 'Tear', text: 'Paper first, by hand.' }, { title: 'Set', text: 'Pieces placed, moved, placed again.' }, { title: 'Fix', text: 'Glued only when it holds.' }] } },
    { id: 'numbers', kind: 'stats', variant: 'row', content: { title: 'In numbers', items: [{ value: '14', label: 'years' }, { value: '62', label: 'works' }, { value: '9', label: 'shows' }] } },
    { id: 'work', kind: 'gallery', variant: 'grid', content: { title: 'Work' }, images: refs.slice(1).map((r) => r.id) },
    { id: 'foot', kind: 'footer', variant: 'simple', content: { brand: 'Ines Varga', columns: [] } },
  ],
};
const spec = V.parseGenerate(answer, brief, moodboard, 1, `Generated in the “${dir.name}” direction`, dir);
const composed = spec.sections.filter((s) => s.kind === 'compose' && s.id !== 'hero');
const project = V.normalizeProject({
  ...V.makeProject('create', 'Ines Varga — explore'),
  intent: 'A portfolio for an experimental artist',
  moodboard,
  brief: { doc: brief, approved: true, version: 1 },
  direction: { ...V.normalizeDirectionState({ options: dirs, chosen: dir, approved: true }) },
  specs: [spec],
  specIndex: 0,
});
ok('the project is made as the app makes one: a direction approved, a design held to its strategy', !!project && composed.length >= 1 && !!dir.strategy, J(spec.sections.map((s) => s.kind)));

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
if (process.env.UXV0_TRACE) await page.addInitScript(() => { const e = console.error; console.error = (...a) => { if (String(a[0]).includes('Maximum update')) e('STACK ' + new Error().stack); e(...a); }; });
if (process.env.UXV0_TRACE) page.on('console', (m) => /^STACK/.test(m.text()) && console.log('    ', m.text().slice(0, 3000)));
if (process.env.UXV0_TRACE) page.on('console', async (m) => { if (m.type() !== 'error' || !/Maximum update/.test(m.text())) return; const args = await Promise.all(m.args().map((x) => x.evaluate((v) => String(v)).catch(() => '?'))); console.log('    console:', args.map((x) => String(x).slice(0, 2500)).join(' || ')); });
await page.goto(BASE + '/ux-v0', { waitUntil: 'networkidle' });
// written into the browser's own store, as the app writes it
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
}, JSON.parse(J(project)));
await page.reload({ waitUntil: 'networkidle' });
await page.getByText('Ines Varga — explore').first().click();
await page.waitForSelector('iframe.v0-frame', { timeout: 30000 });
await page.waitForTimeout(2500);
const frame = page.frameLocator('iframe.v0-frame');
ok('the project opens on its design: composed parts drawn in the direction’s shapes', (await frame.locator('.sx-compose').count()) >= 1 && (await frame.locator('.cp-shape, img.cp-shaped').count()) >= 1);

// select a composed part's title, open the selection rail
const target = composed[0];
await page.getByRole('radio', { name: 'Element' }).click().catch(() => {});
await frame.locator(`[data-ux-section="${target.id}"] .cp-title`).first().click();
if (process.env.UXV0_TRACE) (await page.waitForTimeout(1500), console.log('    after selecting on the canvas:', errors.length));
await page.waitForSelector('.v0-sel', { timeout: 8000 }).catch(() => {});
await page.getByRole('tab', { name: 'Selection' }).click();
if (process.env.UXV0_TRACE) (await page.waitForTimeout(1500), console.log('    after opening the selection rail:', errors.length));
await page.waitForSelector('.v0-explore', { timeout: 8000 });
ok('the part’s editor offers other compositions, said as its own content rearranged by the strategy', /Its own content, rearranged by the direction’s strategy/.test(await page.locator('.v0-explore').innerText()));
await page.locator('.v0-explore').getByRole('button', { name: 'Explore compositions' }).click();
await page.waitForSelector('.v0-alt', { timeout: 8000 });
await page.waitForTimeout(800);
const altCount = await page.locator('.v0-alt').count();
const labels = await page.locator('.v0-alt-label').allInnerTexts();
ok(`three alternatives, each a different arrangement, each drawn by the real renderer (${labels.join(' | ')})`, altCount === 3 && new Set(labels).size === 3 && (await page.locator('.v0-alt iframe').count()) === 3, J(labels));
const docs = await page.locator('.v0-alt iframe').evaluateAll((fs) => fs.map((f) => f.getAttribute('srcdoc') ?? ''));
ok('…each a picture of this part with its own words', docs.every((d) => d.includes('Method') && d.includes('cp-field')));
await page.locator('.v0-explore').screenshot({ path: `${S}explore-1-alternatives-1440.png` }).catch(() => {});

// set one aside: gone, and kept as set aside for this project
await page.locator('.v0-alt').first().getByRole('button', { name: 'Not this' }).click();
await page.waitForTimeout(1200);
ok('“Not this” takes it away', (await page.locator('.v0-alt').count()) === 2);
const rejected = await page.evaluate(async (id) => {
  const db = await new Promise((res) => { const r = indexedDB.open('socria-ux-v0', 1); r.onsuccess = () => res(r.result); });
  return new Promise((res) => { const t = db.transaction('projects').objectStore('projects').get(id); t.onsuccess = () => res(t.result?.compositions?.rejected ?? []); });
}, project.id);
ok('…and the project remembers it, so it is not proposed again', rejected.length === 1, J(rejected));

// combine two
const boxes = page.locator('.v0-alt input[type="checkbox"]');
await boxes.nth(0).check();
await boxes.nth(1).check();
await page.getByRole('button', { name: /Combine the two/ }).click();
await page.waitForTimeout(800);
ok('two combined: a new alternative, the first’s arrangement with the second’s treatments', (await page.locator('.v0-alt').count()) === 3 && /where “/.test(await page.locator('.v0-alt').first().innerText()));

// nudge the next round
const before = J(await page.locator('.v0-alt-label').allInnerTexts());
await page.getByRole('button', { name: 'Calmer' }).click();
await page.waitForTimeout(900);
ok('a nudge (calmer) explores again, said as pressed', (await page.getByRole('button', { name: 'Calmer' }).getAttribute('aria-pressed')) === 'true' && J(await page.locator('.v0-alt-label').allInnerTexts()) !== before);

// use one: the canvas changes, as a version Undo takes back, and the composition is held
const sigBefore = await frame.locator(`section[data-ux-section="${target.id}"]`).innerHTML();
await page.locator('.v0-alt').first().getByRole('button', { name: 'Use this' }).click();
await page.waitForTimeout(1800);
const sigAfter = await frame.locator(`section[data-ux-section="${target.id}"]`).innerHTML();
ok('“Use this” recomposes the part on the canvas, with Undo', sigAfter !== sigBefore && (await page.getByRole('button', { name: 'Undo' }).count()) > 0);
await page.waitForSelector('.v0-explore', { timeout: 8000 }).catch(() => {});
ok('…and holds its composition: said, with a way to release it', /Approved and held/.test(await page.locator('.v0-explore').innerText()) && (await page.getByRole('button', { name: 'Release it' }).count()) === 1);
await page.screenshot({ path: `${S}explore-2-held-1440.png` });
await page.getByRole('button', { name: 'Release it' }).click();
await page.waitForTimeout(1200);
ok('releasing it: said, and it can be approved again', (await page.getByRole('button', { name: 'Approve this composition' }).count()) === 1);

// the navigation's links go somewhere on the canvas
const hrefs = await frame.locator('.sx-nav .nav-links a').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
ok('the navigation’s links go to the parts they name', hrefs.some((h) => h && h !== '#'), J(hrefs));

// nothing scrolls sideways with the explorer open, at any width
for (const w of [1440, 1024, 390]) {
  await page.setViewportSize({ width: w, height: w < 600 ? 844 : 900 });
  await page.waitForTimeout(400);
  const over = await page.evaluate(() => document.scrollingElement.scrollWidth - innerWidth);
  ok(`at ${w} px nothing scrolls sideways`, over <= 0, `${over}px`);
  await page.screenshot({ path: `${S}explore-3-${w}.png` });
}
ok('no script error in the app', !errors.length, J(errors));
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
