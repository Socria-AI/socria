// Workflow B (Critique), end to end, with the model scripted: an HTML import in its sandbox (what it cannot reach),
// element and area selection, a card and its follow-up, a PNG crop with its one-time thumbnail, a reload.
import { chromium, S, FX, ROOT, BASE, underTest, beginWith } from './env.mjs';
const out = (m) => console.log(m);
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|clerk|Failed to load resource/i.test(m.text())) errs.push('console ' + m.text().slice(0, 200)); });
const critiques = [];
await ctx.route('**/api/ux-v0/critique', async (r) => {
  const body = JSON.parse(r.request().postData());
  critiques.push(body);
  const n = critiques.length;
  await r.fulfill({ json: {
    reasoning: n === 1 ? {
      read: 'This is the first of three equal buttons in the hero, set at 13px white on a light tan — it reads as one option among several rather than the action the page exists for.',
      verdict: 'problem',
      questions: ['If a commuter has eight seconds on this page, which of these three should they press — and how would they know?'],
      principles: [{ name: 'Visual hierarchy', applies: 'Three buttons share the same size, colour and weight, so none of them leads.' }, { name: 'Contrast (WCAG 1.4.3)', applies: 'White on this tan measures below the 4.5:1 that 13px text needs.' }],
      issues: [{ text: 'The label is hard to read at this size.', evidence: body.selection.measured.find((m) => m.id === 'contrast')?.value.slice(0, 6) || 'n/a' }],
      alternatives: [{ text: 'Make “Book a table” the only filled button and turn the others into text links.', tradeoff: 'Shop and the newsletter get less weight in the hero.' }],
      basis: 'Rests on measured facts.',
    } : { read: 'Being on brand and being legible are not in tension here: a deeper shade of the same tan keeps the palette and clears contrast.', verdict: 'mixed', questions: [], principles: [], issues: [], alternatives: [{ text: 'Use #8a6a3e for the button.', tradeoff: 'Slightly heavier.' }], basis: '' },
    artifactSummary: body.thumb ? 'A café landing page: an eight-item navigation, a beige hero with three equal buttons, three feature cards with very light grey body text.' : null,
    usage: { model: 'gpt-6-luna', input: 2100, cached: 0, output: 380, cost: 0.0004 },
  } });
});

await page.goto(BASE + '/ux-v0', { waitUntil: 'networkidle' });
await page.screenshot({ path: S + 'v0-01-home.png' });
// import HTML (Critique)
await page.locator('input[type=file]').setInputFiles(FX + 'existing-design.html');
await beginWith(page);
await page.waitForSelector('iframe.v0-frame', { timeout: 20000 });
await page.waitForTimeout(1800);
await page.screenshot({ path: S + 'v0-02-imported.png' });
const fr = page.frames().find((f) => f.url() === 'about:srcdoc');
out('frame found: ' + !!fr);
if (fr) {
  out('page script ran? title = ' + (await fr.evaluate(() => document.title)));
  out('parent reachable? ' + (await fr.evaluate(() => { try { return String(parent.document.title); } catch (e) { return 'blocked: ' + e.name; } })));
  out('storage reachable? ' + (await fr.evaluate(() => { try { localStorage.getItem('x'); return 'yes'; } catch (e) { return 'blocked: ' + e.name; } })));
  out('network? ' + (await fr.evaluate(async (base) => { try { await fetch(base + '/api/health'); return 'yes'; } catch (e) { return 'blocked'; } }, BASE)));
}
// element selection inside the sandbox
await page.frameLocator('iframe.v0-frame').locator('a.btn').first().click();
await page.waitForSelector('.v0-sel', { timeout: 5000 });
out('selection label: ' + (await page.locator('.v0-sel-label').innerText()));
await page.getByRole('tab', { name: 'Selection' }).click();
out('facts: ' + (await page.locator('.v0-facts li').allInnerTexts()).map((t) => t.replace(/\n/g, ' | ')).join(' || '));
await page.screenshot({ path: S + 'v0-03-selected.png' });
// comment → card
await page.locator('.v0-compose textarea').fill('Is this the strongest call to action on the page?');
await page.locator('.v0-compose .sb-btn.is-primary').click();
await page.waitForSelector('.v0-card .v0-read', { timeout: 8000 });
const c1 = critiques[0];
out('request: tag=' + c1.selection.element.tag + ' kind=' + c1.kind + ' facts=' + c1.selection.measured.length + ' outline=' + (c1.summary || '').split('\n')[0] + ' thumb=' + !!c1.thumb);
await page.screenshot({ path: S + 'v0-04-card.png' });
// follow-up on the same card
await page.locator('.v0-compose textarea').fill('But the tan is our brand colour.');
await page.locator('.v0-compose .sb-btn.is-primary').click();
await page.waitForFunction(() => document.querySelectorAll('.v0-card .v0-turn').length >= 2 && document.querySelectorAll('.v0-card .v0-read').length >= 2, null, { timeout: 8000 });
out('follow-up history sent: ' + critiques[1].history.length + ' turn(s); cards: ' + (await page.locator('.v0-card').count()));
// area selection
await page.getByRole('radio', { name: 'Area' }).click();
const ib = await page.locator('iframe.v0-frame').boundingBox();
await page.mouse.move(ib.x + ib.width * 0.04, ib.y + ib.height * 0.62);
await page.mouse.down();
await page.mouse.move(ib.x + ib.width * 0.7, ib.y + ib.height * 0.86, { steps: 8 });
await page.mouse.up();
await page.waitForSelector('.v0-sel.is-region', { timeout: 5000 });
out('region label: ' + (await page.locator('.v0-sel-label').innerText()));
await page.getByRole('tab', { name: 'Selection' }).click();
await page.screenshot({ path: S + 'v0-05-area.png' });
await page.getByRole('tab', { name: 'File' }).click();
out('file tab: ' + (await page.locator('.v0-rail-scroll').innerText()).replace(/\n+/g, ' | ').slice(0, 400));

// PNG critique
await page.goto(BASE + '/ux-v0', { waitUntil: 'networkidle' });
await page.locator('input[type=file]').setInputFiles(FX + 'existing-design.png');
await beginWith(page);
await page.waitForSelector('img.v0-image', { timeout: 15000 });
await page.waitForTimeout(800);
const im = await page.locator('img.v0-image').boundingBox();
await page.mouse.move(im.x + im.width * 0.3, im.y + 2);
await page.mouse.down();
await page.mouse.move(im.x + im.width * 0.99, im.y + im.height * 0.08, { steps: 6 });
await page.mouse.up();
await page.waitForSelector('.v0-sel.is-region', { timeout: 5000 });
await page.locator('.v0-compose textarea').fill('Why does this navigation feel cluttered?');
await page.locator('.v0-compose .sb-btn.is-primary').click();
await page.waitForSelector('.v0-card .v0-read', { timeout: 8000 });
const c3 = critiques.at(-1);
out('png request: crop=' + (c3.selection.crop?.dataUrl.length || 0) + ' bytes, thumb=' + (c3.thumb ? c3.thumb.length : 0) + ' bytes, kind=' + c3.kind);
await page.screenshot({ path: S + 'v0-06-png.png' });
// a second comment on the PNG: no thumbnail now (the reading was kept)
await page.locator('.v0-compose textarea').fill('And the hero buttons?');
await page.locator('.v0-compose .sb-btn.is-primary').click();
await page.waitForFunction(() => document.querySelectorAll('.v0-card .v0-turn').length >= 2, null, { timeout: 8000 });
out('second png request thumb: ' + (critiques.at(-1).thumb ? 'sent' : 'not sent') + ', summary: ' + (critiques.at(-1).summary || '').slice(0, 60));
// reload keeps everything that was saved (the header says when: a save waits at most 1.5 s)
await page.waitForFunction(() => !/Saving/.test(document.querySelector('.v0-save')?.textContent || ''), null, { timeout: 5000 }).catch(() => {});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('img.v0-image', { timeout: 15000 });
out('after reload: cards=' + (await page.locator('.v0-card').count()) + ' url=' + page.url());
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(600);
await page.screenshot({ path: S + 'v0-07-phone.png' });
out('overflow: ' + (await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)));
out('ERRORS ' + JSON.stringify(errs));
await b.close();
