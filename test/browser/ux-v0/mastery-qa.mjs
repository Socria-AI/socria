// test/browser/ux-v0/mastery-qa.mjs — the website-mastery panels in the real app: Publish (readiness, site settings,
// link destinations, the website download), Checks (release gates, quality dimensions, decisions kept), Versions
// (what changed, restore, keep) and targeted edits read in code.
//
// A website project (a restaurant with a booking, a form and a gallery, its direction approved, its design generated
// from a conventional answer and held to the direction) is written into the browser's own store and opened from the
// home. No model is called: every change here is read in code, and the run fails if the refine route is asked.
//
//   UXV0_FORWARD=1 UXV0_BASE=http://127.0.0.1:3100 node test/browser/ux-v0/mastery-qa.mjs   (against `next start`)
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { chromium, S, BASE, ROOT, underTest } from './env.mjs';

const V = await underTest();
const JSZip = createRequire(ROOT + 'package.json')('jszip');
const J = JSON.stringify;
let pass = 0;
let fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok  ', n)) : (fail++, console.log('  FAIL', n, String(x).slice(0, 400))));
const errors = [];
const modelCalls = [];

// ── the project, made as the app makes one ──
const brief = V.normalizeBrief({ pageType: 'website', platform: 'web', objective: 'A website for Salt & Ember, a twelve-table restaurant cooking over fire, where guests book a table and read the menu.', audience: 'Diners in the city', personality: ['warm', 'confident'], visualDirection: 'Warm and editorial, firelight and dark wood.', palette: [], typography: { display: '', body: '' }, decisions: { colour: 'delegated', typography: 'delegated' } }, new Set());
const dirs = V.proposeDirections({ brief, salt: 'mastery-qa' });
const dir = dirs[0];
const pal = V.paletteOf(dir.tokens, dir.look.accent2 ?? '');
const refs = [0, 1, 2, 3].map((i) => V.normalizeRef({ ...V.procRef(V.normalizeProc({ kind: ['field', 'contour', 'grain', 'lattice'][i], seed: 4 + i * 9, ratio: i ? '4:3' : '16:9', palette: pal }), 'a stand-in picture'), state: 'kept', asContent: true }));
const moodboard = V.normalizeMoodboard({ refs });
const answer = {
  title: 'Salt & Ember',
  sections: [
    { id: 'nav', kind: 'nav', variant: 'inline', content: { brand: 'Salt & Ember', links: ['Menu', 'Book', 'Press'], cta: 'Book a table' } },
    { id: 'hero', kind: 'hero', variant: 'split', content: { title: 'Cooked over *fire*', subtitle: 'A small dining room in the old harbour, open Wednesday to Sunday.', primary: 'Book a table', secondary: 'See the menu' }, images: [refs[0].id] },
    { id: 'menu', kind: 'list', variant: 'menu', content: { title: 'The menu', groups: [{ title: 'From the fire', items: [{ name: 'Leeks, hazelnut, brown butter', price: '14' }, { name: 'Hake, mussels, sea herbs', price: '28' }] }] } },
    { id: 'room', kind: 'gallery', variant: 'grid', content: { title: 'The room' }, images: refs.slice(1, 3).map((r) => r.id) },
    { id: 'write', kind: 'form', variant: 'stacked', content: { title: 'Private dining', fields: [{ label: 'Your name', type: 'text', required: true }, { label: 'Email', type: 'email', required: true }], submit: 'Send the enquiry' } },
    { id: 'foot', kind: 'footer', variant: 'simple', content: { brand: 'Salt & Ember', columns: [{ title: 'Elsewhere', links: ['Instagram'] }] } },
  ],
};
const spec = V.parseGenerate(answer, brief, moodboard, 1, `Generated in the “${dir.name}” direction`, dir);
const project = V.normalizeProject({
  ...V.makeProject('create', 'Salt & Ember — mastery'),
  intent: 'A website for a restaurant',
  moodboard,
  brief: { doc: brief, approved: true, version: 1 },
  direction: { ...V.normalizeDirectionState({ options: dirs, chosen: dir, approved: true }) },
  specs: [spec],
  specIndex: 0,
});
ok('the project is made as the app makes one: a website (the restaurant takes bookings), its direction approved', !!project && spec.pageType === 'website' && spec.sections.some((s) => s.kind === 'form'), J(spec.sections.map((s) => s.kind)));

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
page.on('request', (r) => /\/api\/ux-v0\/(refine|generate)/.test(r.url()) && modelCalls.push(r.url()));
await page.goto(BASE + '/ux-v0', { waitUntil: 'networkidle' });
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
await page.getByText('Salt & Ember — mastery').first().click();
await page.waitForSelector('iframe.v0-frame', { timeout: 30000 });
await page.waitForTimeout(2500);
const frame = page.frameLocator('iframe.v0-frame');
ok('the design opens on the canvas: buttons go where their words say, the unlinked marked', (await frame.locator('a.btn[href="#s-menu"], a.btn[href^="#s-"]').count()) >= 1 && (await frame.locator('[data-ux-unlinked]').count()) >= 1);

// ── Publish ──
await page.getByRole('tab', { name: 'Publish' }).click();
await page.waitForSelector('.v0-publish', { timeout: 8000 });
const ready0 = await page.locator('.v0-pub-ready').innerText();
ok('Publish says what stands in the way: links going nowhere, the form not connected, no address', /nowhere yet/.test(ready0) && /does not send anywhere/.test(ready0) && /No address yet/.test(ready0), ready0);
await page.locator('#pub-form').fill('https://forms.example.test/f/salt');
await page.locator('#pub-form').blur();
await page.waitForTimeout(900);
ok('a form destination set: a version, and the readiness says where it sends', /sends to https:\/\/forms\.example\.test\/f\/salt/.test(await page.locator('.v0-pub-ready').innerText()) && (await page.getByRole('button', { name: 'Undo' }).count()) > 0);
await page.locator('#pub-url').fill('not a url');
await page.locator('#pub-url').blur();
await page.waitForTimeout(300);
ok('an address that is not https is refused, said beside the field', /https:\/\//.test(await page.locator('#pub-url-hint').innerText()) && (await page.locator('#pub-url').getAttribute('aria-invalid')) === 'true');
await page.locator('#pub-url').fill('https://saltandember.example.com');
await page.locator('#pub-url').blur();
await page.waitForTimeout(900);
const before = (await page.locator('.v0-pub-links li.is-todo').count());
const press = page.locator('.v0-pub-links li.is-todo').filter({ hasText: 'Press' }).locator('select');
await press.selectOption({ label: 'The top of the page' }).catch(async () => press.selectOption('#top'));
await page.waitForTimeout(900);
const after = await page.locator('.v0-pub-links li.is-todo').count();
ok('a destination chosen for a link that went nowhere: one fewer to do', after === before - 1, `${before} → ${after}`);
ok('…and on the canvas it goes there now (in the bar and in the phone menu)', (await frame.locator('a[href="#top"]').filter({ hasText: 'Press' }).count()) >= 1 && (await frame.locator('a[data-ux-unlinked]').filter({ hasText: 'Press' }).count()) === 0);
const [download] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.getByRole('button', { name: 'Download the website (.zip)' }).click()]);
const zip = await JSZip.loadAsync(readFileSync(await download.path()));
const names = Object.keys(zip.files);
const index = await zip.file(names.find((n) => n.endsWith('/index.html'))).async('string');
ok(`the website downloads as a folder that builds on its own (${download.suggestedFilename()})`, /\.zip$/.test(download.suggestedFilename()) && ['index.html', 'styles.css', 'js/behaviors.js', 'package.json', 'scripts/build.mjs', 'README.md'].every((f) => names.some((n) => n.endsWith(`/${f}`))), J(names.slice(0, 20)));
ok('…carrying the settings: the form sends where it was set, the canonical address, the chosen destination', /action="https:\/\/forms\.example\.test\/f\/salt"/.test(index) && /rel="canonical" href="https:\/\/saltandember\.example\.com"/.test(index) && /<a href="#top"[^>]*>Press</.test(index));
await page.screenshot({ path: `${S}mastery-1-publish-1440.png` });

// ── Checks ──
await page.getByRole('tab', { name: /Check/ }).click();
await page.waitForSelector('.v0-quality', { timeout: 20000 });
const q = await page.locator('.v0-quality').innerText();
ok('Checks opens on whether it can be released: three gates, each passing, waiting on the designer or failing', /Ready to release\?/i.test(q) && /Accessibility/.test(q) && /Security/.test(q) && /Critical function/.test(q), q);
const dims = await page.locator('.v0-dims').innerText();
ok('…then quality as weighted dimensions, each with what it stands on', /Visual quality\s*\(25%\)/.test(dims) && /Fidelity to the direction\s*\(20%\)/.test(dims) && /Editing precision/.test(dims), dims);
ok('…and the direction’s decisions, each said kept or not', /Decisions it keeps: \d+ of \d+/.test(await page.locator('.v0-decisions').innerText()));
await page.screenshot({ path: `${S}mastery-2-checks-1440.png` });

// ── targeted edits, in code ──
const say = async (words) => {
  const box = page.locator('textarea').last();
  await box.fill(words);
  await page.getByRole('button', { name: 'Change', exact: true }).click();
  await page.waitForTimeout(1400);
  return (await page.locator('.v0-notice').innerText().catch(() => '')).replace(/\s+/g, ' ');
};
await page.getByRole('radio', { name: 'Change' }).click().catch(() => {});
const n1 = await say('Make only the hero headline larger');
ok('“Make only the hero headline larger” is done in code, as a version', /bigger headline/i.test(n1), n1);
const n2 = await say('Make the mobile navigation more compact');
ok('“Make the mobile navigation more compact”: the phone rule of the navigation, nothing else', /compact navigation on phones/i.test(n2), n2);
const n3 = await say('Reduce the animation intensity without changing the layout');
ok('“Reduce the animation intensity without changing the layout”: calmer motion', /calm|motion/i.test(n3), n3);

// ── Versions ──
await page.getByRole('tab', { name: 'Versions' }).click();
await page.waitForSelector('.v0-versions', { timeout: 8000 });
const what = await page.locator('.v0-version-what').allInnerTexts();
ok('each version says what changed from the one before', what.some((w) => /site settings/.test(w)) && what.some((w) => /phone and tablet rules in the navigation|navigation/.test(w)), J(what));
const total0 = await page.locator('.v0-version').count();
await page.locator('.v0-version').last().click();
await page.waitForTimeout(600);
await page.getByRole('button', { name: 'Restore this version' }).click();
await page.waitForTimeout(1200);
const total1 = await page.locator('.v0-version').count();
const top = await page.locator('.v0-version').first().innerText();
ok('an earlier version restored as a new one: nothing in between is lost', total1 === total0 + 1 && /Restored version 1/.test(top), `${total0} → ${total1}: ${top}`);
await page.getByRole('button', { name: 'Keep this version' }).click();
await page.waitForTimeout(400);
ok('a version kept is said as kept', (await page.getByRole('button', { name: /Kept: let it go/ }).count()) === 1 && /kept/.test(await page.locator('.v0-version').first().innerText()));
await page.screenshot({ path: `${S}mastery-3-versions-1440.png` });

for (const w of [1440, 390]) {
  await page.setViewportSize({ width: w, height: w < 600 ? 844 : 900 });
  await page.waitForTimeout(300);
  const over = await page.evaluate(() => document.scrollingElement.scrollWidth - innerWidth);
  ok(`at ${w} px nothing scrolls sideways`, over <= 0, `${over}px`);
}
ok('no model was asked: every change was read in code', !modelCalls.length, J(modelCalls));
ok('no script error in the app', !errors.length, J(errors));
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
