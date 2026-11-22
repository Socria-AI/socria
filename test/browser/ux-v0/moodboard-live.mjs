// The moodboard against the real Openverse (needs network to api.openverse.org). Only the model and the sign-in
// check are scripted; every image is a real search. The discovery turn proposes long queries of the kind that once
// found nothing, so this checks the two-word fallback, whole pages, More images, More like these, the board's own
// search and Replace — and that every image shown carries its credit and licence.
import { chromium, S, BASE } from './env.mjs';

const out = (m) => console.log(m);
const b = await chromium.launch(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } } : {});
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
const results = [];
const check = (name, pass, detail = '') => { results.push(pass); out(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };
const openverse = [];
page.on('request', (r) => { if (r.url().startsWith('https://api.openverse.org/v1/images/?')) openverse.push(decodeURIComponent(new URL(r.url()).searchParams.get('q') || '')); });

const usage = { model: 'gpt-6-luna', input: 1, cached: 0, output: 1, cost: 0 };
// the server, signed in and with no keyed library set: it answers with nothing, and the browser asks Openverse
await ctx.route('**/api/ux-v0/images', (r) => r.fulfill({ json: { libraries: [], results: JSON.parse(r.request().postData()).queries.map((q) => ({ ...q, next: q.page + 1, left: 0, refs: [], providers: [], error: '' })) } }));
await ctx.route('**/api/ux-v0/discover', (r) => r.fulfill({ json: {
  understanding: { summary: 'A website for an independent coffee house.', known: {}, gaps: ['audience'] },
  questions: [{ id: 'q1', topic: 'audience', question: 'Who walks in first on a weekday?', why: 'It decides what the page leads with.', options: ['Commuters', 'Neighbours'], multi: false, answer: '', skipped: false, askedAt: Date.now() }],
  queries: [{ category: 'imagery', query: 'morning light espresso bar marble counter' }, { category: 'texture', query: 'handmade ceramic cup texture close up' }, { category: 'composition', query: 'editorial magazine spread grid layout' }],
  palettes: [], type: [], ready: false, note: '', usage,
} }));

const settle = async () => { await page.waitForTimeout(300); await page.waitForFunction(() => !document.querySelector('.v0-board-head [role=status]'), null, { timeout: 45000 }); await page.waitForTimeout(600); };
await page.goto(BASE + '/ux-v0', { waitUntil: 'networkidle' });
await page.locator('.v0-intent-line textarea').fill('A website for my independent coffee house');
await page.getByRole('button', { name: 'Begin' }).click();
// the studio's conversation comes first; the model-led website workspace is its own way in from it
await page.waitForSelector('.sd-conv', { timeout: 15000 });
if (!(await page.getByRole('button', { name: 'Plan it in the workspace' }).isVisible())) await page.getByRole('button', { name: /Decisions/ }).click();
await page.getByRole('button', { name: 'Plan it in the workspace' }).click();
await page.waitForSelector('.v0-tile img', { timeout: 60000 });
await settle();
const tiles = () => page.locator('.v0-tile').count();
const group = (name) => page.locator(`.v0-board-group[aria-label="${name}"] .v0-tile`).count();
const loaded = () => page.evaluate(() => [...document.querySelectorAll('.v0-tile img')].filter((i) => i.complete && i.naturalWidth > 0).length);
const n0 = await tiles();
check('long model queries still fill the board from the real library', (await group('Imagery')) >= 4 && (await group('Texture')) >= 4 && (await group('Composition')) >= 4, `imagery ${await group('Imagery')}, texture ${await group('Texture')}, composition ${await group('Composition')}`);
check('…as real images, loaded', (await loaded()) >= Math.min(n0, 12), `${await loaded()} of ${n0} loaded`);
check('…found by their two-word forms when the long query found nothing', openverse.some((q) => q.split(' ').length === 2), [...new Set(openverse)].join(' | '));
const imageryTitles = await page.locator('.v0-board-group[aria-label="Imagery"] .v0-tile img').evaluateAll((l) => l.map((i) => i.alt));
check('the imagery is about the subject (espresso, coffee, café, bar)', imageryTitles.filter((t) => /espresso|coffee|caf|bar|barista|latte|cappuccino/i.test(t)).length >= 3, imageryTitles.slice(0, 6).join(' | '));
const credits = await page.locator('.v0-tile .v0-credit').allInnerTexts();
check('every image carries its credit and licence', credits.length === n0 && credits.every((t) => /CC|Public domain|licence|Unsplash|Pexels/i.test(t) && t.length > 8), credits.slice(0, 2).join(' / '));
await page.screenshot({ path: S + 'moodboard-live-1.png' });

await page.getByRole('button', { name: 'More images' }).click();
await settle();
const n1 = await tiles();
check('“More images” brings more', n1 >= n0 + 6, `${n0} → ${n1}`);

const tex0 = await group('Texture');
await page.locator('.v0-board-group[aria-label="Texture"]').getByRole('button', { name: 'More like these' }).click();
await settle();
check('“More like these” brings more of that kind', (await group('Texture')) >= tex0 + 4, `${tex0} → ${await group('Texture')}`);

const before = await tiles();
await page.locator('#v0-board-q').fill('linen texture');
await page.locator('.v0-board-search select').selectOption('texture');
await page.locator('.v0-board-search').getByRole('button', { name: 'Search' }).click();
await settle();
check('the board’s own search finds what the designer asks for', (await tiles()) >= before + 6 && openverse.includes('linen texture'), `${before} → ${await tiles()}`);

const first = page.locator('.v0-tile').first();
const src0 = await first.locator('img').getAttribute('src');
await first.getByRole('button', { name: 'Replace' }).click();
await settle();
const srcs = await page.locator('.v0-tile img').evaluateAll((l) => l.map((i) => i.getAttribute('src')));
check('“Replace” brings a different image, never the one removed', !srcs.includes(src0) && srcs.length === (await tiles()), `${srcs.length} shown`);
check('no image is shown twice', new Set(srcs).size === srcs.length);
await page.screenshot({ path: S + 'moodboard-live-2.png', fullPage: true });

out(`\nOpenverse searches made: ${openverse.length}`);
out('SUMMARY ' + results.filter(Boolean).length + ' passed, ' + results.filter((x) => !x).length + ' failed');
out('ERRORS ' + JSON.stringify(errs.filter((e) => !/Clerk/.test(e))));
await b.close();
