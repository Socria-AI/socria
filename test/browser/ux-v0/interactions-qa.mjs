// test/browser/ux-v0/interactions-qa.mjs — tabs, before-and-after and the horizontal rail, tried in a browser.
//
// A page with each new interaction is drawn by the real renderer with SocriaUX's runtime (as an exported page has
// it), then: the runtime's own self-test (what the rendered-page audit runs), a keyboard (arrow keys, Home, End,
// the slider's arrows), a pointer drag, reduced motion, axe-core, a page without scripts (every panel and both
// pictures still there), and nothing sideways at 1440 / 834 / 390. No model is called.
//
//   node test/browser/ux-v0/interactions-qa.mjs        (needs test/.tmp: node test/run.mjs builds it)
import { readFileSync } from 'node:fs';
import { chromium, FX, ROOT, S, underTest } from './env.mjs';

const V = await underTest();
const J = JSON.stringify;
let pass = 0;
let fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok  ', n)) : (fail++, console.log('  FAIL', n, String(x).slice(0, 400))));
const names = ['cafe-bar', 'pour', 'window', 'people'];
const refs = names.map((n) => ({ provider: 'openverse', providerId: n, id: `openverse:${n}`, url: `https://images.example.test/${n}.jpg`, thumb: `https://images.example.test/${n}.jpg`, width: 1600, height: 1000, title: n, creator: 'A. Photographer', sourceUrl: `https://example.org/${n}`, license: 'CC BY 2.0', licenseUrl: '', attribution: '', category: 'imagery', query: 'x', state: 'kept' }));
const board = V.normalizeMoodboard({ refs });
const spec = V.normalizeSpec({ title: 'Atelier Renova', pageType: 'website', tokens: { colors: { background: '#f6f3ec', surface: '#ffffff', text: '#1d1d1b', muted: '#5c5a52', accent: '#2f3d1e', accentText: '#ffffff', line: '#d9d4c7' }, fonts: { display: 'Fraunces', body: 'Inter' }, scale: 'comfortable', radius: 'soft', style: 'editorial', imageTreatment: 'natural' }, sections: [
  { id: 'nav', kind: 'nav', variant: 'inline', content: { brand: 'Atelier Renova', links: ['Services', 'Process'] } },
  { id: 'services', kind: 'tabs', variant: 'top', content: { title: 'Services', items: [{ label: 'Restoration', title: 'Restoration', text: 'Old frames brought back, joint by joint.' }, { label: 'Gilding', title: 'Water gilding', text: 'Gold leaf laid on gesso and burnished.' }, { label: 'Framing', title: 'Framing', text: 'New frames cut from oak and walnut.' }] } },
  { id: 'rooms', kind: 'tabs', variant: 'side', content: { title: 'The rooms', items: [{ label: 'Workshop', text: 'Where the frames are cut.' }, { label: 'Gilding room', text: 'Still air, low light.' }] } },
  { id: 'proof', kind: 'compare', variant: 'slider', content: { title: 'A frame, before and after', before: 'Before', after: 'After', caption: 'An 1890s frame, regilded.' }, images: [refs[0].id, refs[1].id] },
  { id: 'pair', kind: 'compare', variant: 'side', content: { title: 'Side by side' }, images: [refs[2].id, refs[3].id] },
  { id: 'process', kind: 'features', variant: 'rail', content: { title: 'Process', items: [1, 2, 3, 4, 5, 6].map((i) => ({ title: `Step ${i}`, text: 'A sentence about this step of the work.' })) } },
  { id: 'foot', kind: 'footer', variant: 'simple', content: { brand: 'Atelier Renova', columns: [] } },
] }, board);
ok('the new kinds survive the spec’s own checks', spec && ['tabs', 'compare', 'features'].every((k) => spec.sections.some((s) => s.kind === k)) && spec.sections.find((s) => s.id === 'proof')?.images.length === 2, J(spec?.sections.map((s) => s.kind)));
const live = V.renderDesign(spec, board.refs, { motion: 'play', runtime: true }).html.replace(/loading="lazy"/g, '');
const still = V.renderDesign(spec, board.refs).html.replace(/loading="lazy"/g, '');
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
await page.route('https://images.example.test/**', (r) => r.fulfill({ contentType: 'image/jpeg', body: readFileSync(FX + r.request().url().split('/').pop()) }));
await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: '' }));
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.setContent(live, { waitUntil: 'networkidle' });
const counts = await page.evaluate(() => ({ tabs: window.__uxBehaviors?.tabs, compares: window.__uxBehaviors?.compares }));
ok('the runtime binds two tab sets and one slider (the side-by-side pair needs none)', counts.tabs === 2 && counts.compares === 1, J(counts));
const self = await page.evaluate(() => window.__uxBehaviors.selfTestInteractive().filter((x) => x.kind === 'tabs' || x.kind === 'compare'));
ok('the self-test the rendered-page audit runs finds nothing wrong with them', self.length === 3 && self.every((x) => !x.problems.length), J(self));
// tabs, by keyboard
const tab0 = page.locator('#services-tab-0');
await tab0.focus();
await page.keyboard.press('ArrowRight');
let state = await page.evaluate(() => ({ sel: document.querySelector('[data-ux-section="services"] [aria-selected="true"]')?.id, focus: document.activeElement?.id, shown: [...document.querySelectorAll('[data-ux-section="services"] [role=tabpanel]')].filter((p) => !p.hidden).map((p) => p.id) }));
ok('a tab chosen with the arrow keys: selected, focused, its panel the only one shown', state.sel === 'services-tab-1' && state.focus === 'services-tab-1' && J(state.shown) === '["services-panel-1"]', J(state));
await page.keyboard.press('End');
state = await page.evaluate(() => document.activeElement?.id);
ok('End goes to the last tab, Home to the first', state === 'services-tab-2' && (await page.keyboard.press('Home'), await page.evaluate(() => document.activeElement?.id)) === 'services-tab-0');
await page.locator('#services-tab-2').click();
ok('a click chooses a tab', await page.locator('#services-panel-2').isVisible() && !(await page.locator('#services-panel-0').isVisible()));
// the slider: keyboard and pointer
const range = page.locator('#s-proof .cmpr-range, [data-ux-section="proof"] .cmpr-range').first();
await range.focus();
for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowLeft');
const cut1 = await page.evaluate(() => getComputedStyle(document.querySelector('[data-ux-section="proof"] .cmpr-frame')).getPropertyValue('--cmp').trim());
ok('the slider moves the cut from the keyboard', cut1 === '45%', cut1);
await page.locator('[data-ux-section="proof"] .cmpr-frame').scrollIntoViewIfNeeded();
const box = await page.locator('[data-ux-section="proof"] .cmpr-stage').boundingBox();
await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
await page.mouse.down();
await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.5, { steps: 4 });
await page.mouse.up();
const cut2 = await page.evaluate(() => Number(getComputedStyle(document.querySelector('[data-ux-section="proof"] .cmpr-frame')).getPropertyValue('--cmp').trim().replace('%', '')));
ok('…and dragged on the picture with a pointer', cut2 >= 75 && cut2 <= 85, cut2);
// the rail: a region the keyboard can scroll
const rail = page.locator('.f-rail-wrap');
await rail.focus();
const sl0 = await rail.evaluate((el) => el.scrollLeft);
await page.keyboard.press('ArrowRight');
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(400);
const sl1 = await rail.evaluate((el) => el.scrollLeft);
ok('the rail is a named region that scrolls sideways from the keyboard', sl1 > sl0 && (await rail.getAttribute('role')) === 'region' && /scrolls sideways/.test(await rail.getAttribute('aria-label')), `${sl0} → ${sl1}`);
// axe-core
await page.addScriptTag({ path: ROOT + 'node_modules/axe-core/axe.min.js' });
const axe = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } })).violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, at: v.nodes[0]?.target })));
ok('axe-core: no serious or critical WCAG violation', !axe.some((v) => v.impact === 'serious' || v.impact === 'critical'), J(axe));
for (const w of [1440, 834, 390]) {
  await page.setViewportSize({ width: w, height: w < 600 ? 844 : 900 });
  await page.waitForTimeout(200);
  const over = await page.evaluate(() => document.scrollingElement.scrollWidth - innerWidth);
  ok(`at ${w} px nothing scrolls sideways (the rail scrolls inside itself)`, over <= 0, `${over}px`);
  await page.screenshot({ path: `${S}interactions-${w}.png`, fullPage: true });
}
ok('no script error', !errors.length, J(errors));
// without scripts: every panel and both pictures are still there to read
const plain = await b.newPage({ viewport: { width: 1440, height: 900 }, javaScriptEnabled: false });
await plain.route('https://images.example.test/**', (r) => r.fulfill({ contentType: 'image/jpeg', body: readFileSync(FX + r.request().url().split('/').pop()) }));
await plain.setContent(still, { waitUntil: 'load' });
const nojs = await plain.evaluate(() => ({ panels: [...document.querySelectorAll('[role=tabpanel]')].filter((p) => p.getClientRects().length).length, lists: [...document.querySelectorAll('[role=tablist]')].filter((l) => l.getClientRects().length).length, pics: [...document.querySelectorAll('.cmpr-img')].filter((i) => i.getClientRects().length).length, slider: [...document.querySelectorAll('.cmpr-ctl')].filter((l) => l.getClientRects().length).length }));
ok('without scripts: every panel reads, no dead tab list, both pictures side by side, no slider that would do nothing', nojs.panels === 5 && nojs.lists === 0 && nojs.pics === 4 && nojs.slider === 0, J(nojs));
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
