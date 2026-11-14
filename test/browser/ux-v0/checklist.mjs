// The checklist items the two workflows do not reach: refusals, SVG and JPG, zoom keys, stepping through the page,
// the home list, answer and brief editing, versions, drops, storage full, a failed call.
import { chromium, S, FX, ROOT, BASE, underTest } from './env.mjs';
import { readFileSync } from 'node:fs';
const out = (m) => console.log(m);
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|clerk|Failed to load resource/i.test(m.text())) errs.push('console ' + m.text().slice(0, 160)); });

// fonts and images, served locally as a licensed library and Google Fonts would
await ctx.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: "@font-face{font-family:'Instrument Serif';font-style:normal;font-weight:400;src:url(https://fonts.gstatic.test/is.woff2) format('woff2')}@font-face{font-family:'Instrument Serif';font-style:italic;font-weight:400;src:url(https://fonts.gstatic.test/isi.woff2) format('woff2')}@font-face{font-family:'Inter';font-style:normal;font-weight:100 900;src:url(https://fonts.gstatic.test/inter.woff2) format('woff2')}" }));
await ctx.route('https://fonts.gstatic.test/**', (r) => {
  const f = r.request().url().endsWith('isi.woff2') ? 'InstrumentSerif-400-italic.woff2' : r.request().url().endsWith('is.woff2') ? 'InstrumentSerif-400.woff2' : 'Inter-100-900.woff2';
  return r.fulfill({ contentType: 'font/woff2', body: readFileSync(ROOT + 'app/fonts/' + f), headers: { 'access-control-allow-origin': '*' } });
});
await ctx.route('https://images.example.test/**', (r) => r.fulfill({ contentType: 'image/jpeg', body: readFileSync(FX + r.request().url().split('/').pop()) }));

const IMG = (name, category, title, w = 1600, h = 1067) => ({ provider: 'openverse', providerId: name, id: `openverse:${name}`, url: `https://images.example.test/${name}.jpg`, thumb: `https://images.example.test/${name}.jpg`, width: w, height: h, title, creator: 'A. Photographer', creatorUrl: 'https://example.org/a', sourceUrl: `https://example.org/${name}`, license: 'CC BY 2.0', licenseUrl: 'https://creativecommons.org/licenses/by/2.0/', attribution: `“${title}” by A. Photographer, CC BY 2.0`, category, state: 'proposed' });
const LIB = {
  imagery: [IMG('cafe-bar', 'imagery', 'Espresso bar at first light'), IMG('pour', 'imagery', 'Pour-over, close', 1000, 1400), IMG('window', 'imagery', 'Window seat'), IMG('people', 'imagery', 'Regulars at the long table'), IMG('dusk', 'imagery', 'Dusk at the window')],
  texture: [IMG('marble', 'texture', 'Marble counter'), IMG('ceramic', 'texture', 'Handmade ceramic', 1400, 1400), IMG('beans', 'texture', 'Roasted beans')],
  composition: [IMG('grid', 'composition', 'Editorial spread, asymmetric grid', 1600, 1000)],
};
const calls = { discover: [], images: [], brief: [], generate: [], refine: [], critique: [] };
await ctx.route('**/api/ux-v0/**', async (r) => {
  const url = r.request().url();
  const body = JSON.parse(r.request().postData() || '{}');
  const usage = { model: 'gpt-6-luna', input: 1800, cached: 0, output: 420, cost: 0.0004 };
  if (url.endsWith('/discover')) {
    calls.discover.push(body);
    if (calls.discover.length === 1) return r.fulfill({ json: { understanding: { summary: 'A website for an independent coffee house.', known: { objective: 'Bring people in on weekday mornings' }, gaps: ['audience', 'visual'] }, questions: [{ id: 'q_a', topic: 'audience', question: 'Who walks in at 7.30 on a Tuesday, and what are they hoping to find?', why: 'The first visitor you design for decides what the page leads with.', options: ['Commuters who want to be fast', 'People who stay and work', 'Neighbours who come for the ritual'], multi: false, answer: '', skipped: false, askedAt: Date.now() }], queries: [{ category: 'imagery', query: 'espresso bar morning light' }, { category: 'texture', query: 'marble counter close' }, { category: 'composition', query: 'editorial magazine layout' }], palettes: [{ id: 'pal_1', name: 'Roast and paper', colors: [{ hex: '#f4efe6', role: 'background' }, { hex: '#221c17', role: 'text' }, { hex: '#6b6157', role: 'muted' }, { hex: '#5b3a24', role: 'accent' }, { hex: '#fbf8f2', role: 'accent-text' }], state: 'proposed' }], type: [{ id: 'type_1', display: 'Instrument Serif', body: 'Inter', note: 'quiet editorial confidence', state: 'proposed' }], ready: false, note: 'An independent coffee house that wants weekday mornings.', usage } });
    return r.fulfill({ json: { understanding: { summary: 'A coffee house for neighbours who come for the ritual; warm, unhurried, editorial.', known: { audience: 'Neighbours who come for the ritual', objective: 'Bring people in on weekday mornings', visual: 'Warm, morning light, paper and roast' }, gaps: [] }, questions: [], queries: [], palettes: [], type: [], ready: true, note: 'Enough to write the brief: neighbours, mornings, the ritual.', usage } });
  }
  if (url.endsWith('/images')) {
    calls.images.push(body);
    return r.fulfill({ json: { results: body.queries.map((q) => ({ ...q, refs: LIB[q.category].filter((x) => !body.seen.includes(x.id)).slice(0, body.per).map((x) => ({ ...x, query: q.query })), provider: 'openverse', error: '' })) } });
  }
  if (url.endsWith('/brief')) {
    calls.brief.push(body);
    const kept = body.moodboard.refs.filter((x) => x.state === 'kept').map((x) => x.id);
    return r.fulfill({ json: { queries: body.action === 'refine' ? [{ category: 'imagery', query: 'candlelit cafe evening' }] : [], brief: { objective: 'Bring neighbours in on weekday mornings by showing the ritual: the first light, the pour, the long table.', audience: 'Neighbours within a ten-minute walk who come for the ritual, not the speed; often on a phone on the way in.', userGoals: ['See what is on this morning', 'Know when it opens', 'Book the long table for a group'], personality: ['unhurried', 'warm', 'exact'], visualDirection: 'Editorial and warm: big serif headlines, morning photography with warmth, paper tones, generous whitespace, no rounded corners.', palette: [{ name: 'Paper', hex: '#f4efe6', role: 'background' }, { name: 'Cream', hex: '#fbf8f2', role: 'surface' }, { name: 'Roast', hex: '#221c17', role: 'text' }, { name: 'Ash', hex: '#6b6157', role: 'muted' }, { name: 'Walnut', hex: '#5b3a24', role: 'accent' }, { name: 'Milk', hex: '#fbf8f2', role: 'accent-text' }, { name: 'Line', hex: '#e2d8c9', role: 'line' }], typography: { display: 'Instrument Serif', body: 'Inter', rationale: 'A condensed editorial serif for the voice; Inter for menus and times that must read at a glance.' }, layoutDirection: 'A full-bleed morning image, then the story, the menu as a printed card, a gallery, and one booking form.', functionalRequirements: ['This morning’s menu with prices', 'Opening hours', 'Book the long table'], references: kept, openQuestions: ['Real prices and hours'], pageType: 'website', platform: 'web' }, usage } });
  }
  if (url.endsWith('/generate')) {
    calls.generate.push(body);
    return r.fulfill({ json: { placeholders: ['[Opening hours]', '[£ price]'], usage, spec: {
      version: body.version, pageType: 'website', platform: 'web', title: 'Halcyon — coffee for slow mornings', reason: 'Generated from the approved brief', createdAt: Date.now(), notes: [],
      tokens: { colors: { background: '#f4efe6', surface: '#fbf8f2', text: '#221c17', muted: '#6b6157', accent: '#5b3a24', accentText: '#fbf8f2', line: '#e2d8c9' }, fonts: { display: 'Instrument Serif', body: 'Inter' }, scale: 'spacious', radius: 'none', style: 'editorial', imageTreatment: 'warm' },
      sections: [
        { id: 'nav', kind: 'nav', variant: 'inline', content: { brand: 'Halcyon', links: ['This morning', 'The room', 'Visit'], cta: 'Book the long table' }, images: [] },
        { id: 'hero', kind: 'hero', variant: 'full-bleed', content: { eyebrow: 'Open from [Opening hours]', title: 'Coffee for slow mornings', subtitle: 'Single-origin beans roasted on Tuesdays, poured for the neighbourhood every day.', primary: 'See this morning’s menu', secondary: 'Book the long table' }, images: ['openverse:cafe-bar'] },
        { id: 'story', kind: 'text', variant: 'two-column', content: { eyebrow: 'The ritual', title: 'Nothing here is in a hurry, least of all the coffee.', paragraphs: ['We open the doors as the light comes over the rooftops. The first pour is for whoever is waiting — usually the same six people, and whoever they bring.', 'Beans are roasted on Tuesdays in the room behind the counter, in batches small enough to taste the difference.'] }, images: [] },
        { id: 'menu', kind: 'list', variant: 'menu', content: { eyebrow: 'This morning', title: 'The menu', groups: [{ title: 'Coffee', items: [{ name: 'Filter of the day', meta: 'Ethiopia, washed', price: '[£ price]' }, { name: 'Cortado', price: '[£ price]' }, { name: 'Flat white', price: '[£ price]' }] }, { title: 'From the oven', items: [{ name: 'Cardamom bun', meta: 'from 7.30', price: '[£ price]' }, { name: 'Sourdough, butter, jam', price: '[£ price]' }] }] }, images: [] },
        { id: 'room', kind: 'split', variant: 'image-left', content: { eyebrow: 'The room', title: 'A long table, and room to stay', text: 'Twelve seats around one table, a window bench for two, and nobody watching the clock.', bullets: ['Book the table for up to twelve', 'Quiet until ten', 'Dogs welcome'], cta: 'Book the long table' }, images: ['openverse:pour'] },
        { id: 'gallery', kind: 'gallery', variant: 'mosaic', content: { title: 'Mornings at Halcyon' }, images: ['openverse:window', 'openverse:marble', 'openverse:ceramic', 'openverse:people'] },
        { id: 'quote', kind: 'quote', variant: 'large', content: { quote: 'The only place on the street where the morning slows down.', author: '[Customer name]', role: 'a regular' }, images: [] },
        { id: 'book', kind: 'form', variant: 'split', content: { title: 'Book the long table', intro: 'For groups of four to twelve, weekday mornings.', fields: [{ label: 'Your name', type: 'text', required: true }, { label: 'Email', type: 'email', required: true }, { label: 'How many of you?', type: 'select', options: ['4–6', '7–9', '10–12'] }, { label: 'Which morning?', type: 'date' }], submit: 'Request the table', note: 'We reply the same day.' }, images: [] },
        { id: 'footer', kind: 'footer', variant: 'columns', content: { brand: 'Halcyon', tagline: 'Coffee for slow mornings.', columns: [{ title: 'Visit', links: ['[Address]', '[Opening hours]'] }, { title: 'Follow', links: ['Instagram', 'Newsletter'] }], legal: '© Halcyon Coffee House' }, images: [] },
      ],
    } } });
  }
  if (url.endsWith('/refine')) {
    calls.refine.push(body);
    return r.fulfill({ json: { understood: 'Rewrite the hero headline around the first light.', challenge: '', question: '', regenerate: '', applies: true, error: '', usage, patch: { op: 'content', sectionId: 'hero', content: { title: 'The first pour is at first light' }, summary: 'Hero headline: first light' } } });
  }
  if (url.endsWith('/critique')) {
    calls.critique.push(body);
    return r.fulfill({ json: { reasoning: { read: 'A large serif headline over a warm, darkened photograph; it reads clearly and sets the tone the brief asks for.', verdict: 'works', questions: ['Does “first light” still fit the neighbours who arrive at nine?'], principles: [{ name: 'Visual hierarchy', applies: 'The headline is the largest, highest-contrast element over the image, so it is read first.' }], issues: [], alternatives: [], basis: 'Rests on 2 measured facts.' }, artifactSummary: null, usage } });
  }
  return r.fallback();
});

await ctx.addInitScript(() => {
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (value, key) {
    if (window.__quota && value && value.data instanceof Blob) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    return key === undefined ? put.call(this, value) : put.call(this, value, key);
  };
});
// a critique that fails once, on request
let failCritique = false;
await page.route('**/api/ux-v0/critique', (r) => (failCritique ? r.fulfill({ status: 502, json: { error: 'The model did not answer. Your comment is kept; try again.' } }) : r.fallback()));

// ── Workflow C: the checklist items A and B do not reach ────────────
const results = [];
const check = (name, pass, detail = '') => { results.push([pass ? 'PASS' : 'FAIL', name, detail]); out(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };
const part = async (name, fn) => { try { await fn(); } catch (e) { check(name, false, 'threw: ' + String(e.message || e).split('\n')[0].slice(0, 200)); } };
const critiques = calls.critique;
const HOME = BASE + '/ux-v0';
const drag = async (fx0, fy0, fx1, fy1) => {
  const im = await page.locator('img.v0-image').boundingBox();
  await page.mouse.move(im.x + im.width * fx0, im.y + im.height * fy0);
  await page.mouse.down();
  await page.mouse.move(im.x + im.width * fx1, im.y + im.height * fy1, { steps: 6 });
  await page.mouse.up();
  await page.waitForSelector('.v0-sel.is-region', { timeout: 5000 });
};
const comment = async (text) => {
  const before = critiques.length;
  await page.locator('.v0-compose textarea').fill(text);
  await page.locator('.v0-compose .l5-btn.is-primary').click();
  await page.waitForFunction((n) => window.__n === undefined && true, before);
  for (let i = 0; i < 40 && critiques.length === before; i++) await page.waitForTimeout(200);
  return critiques.at(-1);
};

// 1 — the home refuses what it cannot import, before any project exists (2.1)
await part('home refusals', async () => {
  await page.goto(HOME, { waitUntil: 'networkidle' });
  const tries = [
    ['notes.txt', 'text/plain', Buffer.from('hello'), /imports HTML, PNG, JPG and SVG/],
    ['empty.png', 'image/png', Buffer.alloc(0), /empty/],
    ['fake.png', 'image/png', Buffer.from('not a png at all'), /not a PNG/],
    ['fake.jpg', 'image/jpeg', Buffer.from('<html>hi</html>'), /not a JPEG/],
    ['nosvg.svg', 'image/svg+xml', Buffer.from('<html><body>no</body></html>'), /no <svg> element/],
    ['big.html', 'text/html', Buffer.from('<!doctype html><p>' + 'x'.repeat(2_100_000) + '</p>'), /limit for HTML is/],
    ['binary.html', 'text/html', Buffer.from([0x3c, 0x68, 0x00, 0x01, 0x02]), /not text/],
  ];
  for (const [name, mimeType, buffer, want] of tries) {
    await page.locator('input[type=file]').setInputFiles({ name, mimeType, buffer });
    await page.waitForSelector('.v0-error-line', { timeout: 5000 });
    const msg = await page.locator('.v0-error-line').innerText();
    check(`refuses ${name}`, want.test(msg) && !/is 2 MB; the limit/.test(msg), msg);
  }
  check('no project is left behind by a refused file', (await page.locator('.v0-list-row').count()) === 0);
});

// 2 — SVG: drawn as an image from a blob URL, its script never runs; an area is rasterised for the crop (2.5, 3.5)
await part('svg import', async () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500"><script>document.title='svg ran';try{parent.document.title='svg ran'}catch(e){}</script><rect width="800" height="500" fill="#f4efe6"/><rect x="60" y="60" width="300" height="80" fill="#5b3a24"/><text x="80" y="112" font-size="32" fill="#ffffff" font-family="sans-serif">Book now</text></svg>`;
  await page.locator('input[type=file]').setInputFiles({ name: 'poster.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg) });
  await page.waitForSelector('img.v0-image', { timeout: 15000 });
  await page.waitForTimeout(600);
  const src = await page.locator('img.v0-image').getAttribute('src');
  check('SVG is drawn as an <img> from a blob URL', /^blob:/.test(src || ''), (src || '').slice(0, 40));
  check('the SVG’s script did not run', (await page.title()) !== 'svg ran' && (await page.locator('svg script').count()) === 0, await page.title());
  check('an SVG starts in Area mode (no elements to pick)', (await page.locator('[role=radio][aria-checked=true]', { hasText: 'Area' }).count()) === 1);
  await drag(0.05, 0.08, 0.5, 0.32);
  const c = await comment('Is this button strong enough?');
  check('an SVG area is rasterised into a crop for the model', c && c.kind === 'svg' && /^data:image\/(png|jpeg|webp);base64,/.test(c.selection?.crop?.dataUrl || ''), c ? `kind=${c.kind} crop=${(c.selection?.crop?.dataUrl || '').length}B` : 'no request');
});

// 3 — JPG: drawn, area-selected, cropped (2.5, 3.3, 3.5); zoom keys (1.6)
await part('jpg import and zoom keys', async () => {
  await page.goto(HOME, { waitUntil: 'networkidle' });
  await page.locator('input[type=file]').setInputFiles(FX + 'cafe-bar.jpg');
  await page.waitForSelector('img.v0-image', { timeout: 15000 });
  await page.waitForTimeout(600);
  const nat = await page.locator('img.v0-image').evaluate((i) => [i.naturalWidth, i.naturalHeight, i.width, i.height]);
  check('a JPG is drawn at its own aspect ratio', Math.abs(nat[0] / nat[1] - nat[2] / nat[3]) < 0.01, nat.join('×'));
  await drag(0.1, 0.1, 0.6, 0.5);
  check('the area is labelled with its size', /Area \d+ × \d+/.test(await page.locator('.v0-sel-label').innerText()), await page.locator('.v0-sel-label').innerText());
  const c = await comment('What is this photograph doing for the page?');
  check('a JPG area goes to the model as a crop', c && c.kind === 'jpg' && /^data:image\//.test(c.selection?.crop?.dataUrl || ''), c ? `kind=${c.kind}` : 'no request');
  const z = async () => parseInt(await page.locator('.v0-zoom-v').innerText(), 10);
  await page.locator('.v0-stage, .v0-canvas').first().click({ position: { x: 5, y: 5 } }).catch(() => {});
  await page.keyboard.press('Escape');
  const z0 = await z();
  await page.keyboard.press('Control+=');
  await page.waitForTimeout(250);
  const z1 = await z();
  await page.keyboard.press('Control+-');
  await page.keyboard.press('Control+-');
  await page.waitForTimeout(250);
  const z2 = await z();
  await page.keyboard.press('Control+0');
  await page.waitForTimeout(250);
  const z3 = await z();
  await page.locator('.v0-zoom button[aria-label="Zoom in"]').click();
  await page.waitForTimeout(200);
  const zIn = await z();
  await page.locator('.v0-zoom-v').click();
  await page.waitForTimeout(250);
  const zFit = await z();
  check('zoom keys: ⌘/Ctrl + = zooms in, − out, 0 fits (the same as the Fit button)', z1 > z0 && z2 < z1 && z3 === zFit, `${z0}% → ${z1}% → ${z2}% → ${z3}% · Fit button ${zFit}%`);
  check('the zoom buttons work too', zIn > z3);
});

// 4 — HTML: step up to the parent, clear with Esc, tablet viewport (3.1, 2.4)
await part('html parent, clear, tablet', async () => {
  await page.goto(HOME, { waitUntil: 'networkidle' });
  await page.locator('input[type=file]').setInputFiles(FX + 'existing-design.html');
  await page.waitForSelector('iframe.v0-frame', { timeout: 20000 });
  await page.waitForTimeout(1500);
  const missingLine = await page.waitForFunction(() => document.querySelector('.v0-notice')?.textContent?.includes('could not load'), null, { timeout: 6000 }).then(() => true).catch(() => false);
  check('a page whose linked files are missing says so in one quiet line', missingLine, (await page.locator('.v0-notice').innerText().catch(() => '')).slice(0, 120));
  await page.frameLocator('iframe.v0-frame').locator('a.btn').first().click();
  await page.waitForSelector('.v0-sel', { timeout: 5000 });
  const l1 = await page.locator('.v0-sel-label').innerText();
  const sr = async () => (await page.locator('.v0-sr').textContent()).trim();
  check('a selection is announced to a screen reader', (await sr()) === `Selected: ${l1}`, await sr());
  await page.getByRole('tab', { name: 'Selection' }).click();
  await page.getByRole('button', { name: 'Select its parent' }).click();
  await page.waitForTimeout(500);
  const l2 = await page.locator('.v0-sel-label').innerText();
  check('“Select its parent” steps up from the element', l1 !== l2, `${l1} → ${l2}`);
  await page.getByRole('button', { name: 'First inside it' }).click();
  await page.waitForTimeout(400);
  const l3 = await page.locator('.v0-sel-label').innerText();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.waitForTimeout(400);
  const l4 = await page.locator('.v0-sel-label').innerText();
  await page.getByRole('button', { name: 'Previous', exact: true }).click();
  await page.waitForTimeout(400);
  const l5 = await page.locator('.v0-sel-label').innerText();
  check('“First inside it”, “Next” and “Previous” walk the page', l3 !== l2 && l4 !== l3 && l5 === l3, `${l3} → ${l4} → ${l5}`);
  check('…each step announced', (await sr()) === `Selected: ${l5}`, await sr());
  await page.getByRole('button', { name: 'Previous', exact: true }).click();
  await page.waitForTimeout(400);
  check('a step that goes nowhere says why, aloud', /^No previous element/.test(await sr()) && (await page.locator('.v0-sel-label').innerText()) === l5, await sr());
  const focusable = await page.getByRole('button', { name: 'Select its parent' }).evaluate((b) => (b.focus(), document.activeElement === b));
  check('the steps are buttons the keyboard reaches', focusable);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check('Esc clears the selection', (await page.locator('.v0-sel').count()) === 0);
  await page.getByRole('radio', { name: 'Tablet' }).click();
  await page.waitForTimeout(1200);
  const w = await page.locator('iframe.v0-frame').evaluate((f) => Math.round(f.getBoundingClientRect().width / (parseFloat(getComputedStyle(f.closest('.v0-world') || f.parentElement).transform.split(',')[0].replace('matrix(', '')) || 1)));
  const iw = await page.frameLocator('iframe.v0-frame').locator('html').evaluate(() => window.innerWidth);
  check('Tablet draws the page at 834 px', iw === 834, `frame inner width ${iw}`);
});

// 5 — the workspace at 1024 and 390 px: nothing scrolls sideways (6.8)
await part('workspace widths', async () => {
  for (const w of [1440, 1024, 390]) {
    await page.setViewportSize({ width: w, height: w === 390 ? 844 : 900 });
    await page.waitForTimeout(500);
    const o = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    check(`no horizontal overflow at ${w}px`, o[0] <= o[1], `${o[0]} ≤ ${o[1]}`);
    if (w === 390) await page.screenshot({ path: S + 'v0-20-workspace-390.png' });
    if (w === 1024) await page.screenshot({ path: S + 'v0-21-workspace-1024.png' });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
});

// 6 — the home lists, opens and deletes (1.4)
await part('home list', async () => {
  await page.goto(HOME, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const n0 = await page.locator('.v0-list-row').count();
  check('the home lists the designs in this browser', n0 === 3, `${n0} listed`);
  let dialogs = 0;
  page.on('dialog', (d) => (dialogs++, d.dismiss()));
  await page.locator('.v0-list-row').first().getByRole('button', { name: 'Delete' }).click();
  await page.waitForSelector('.v0-confirm', { timeout: 3000 });
  const focused = await page.evaluate(() => document.activeElement?.textContent?.trim());
  check('Delete asks in its row, with “Keep it” focused', focused === 'Keep it' && dialogs === 0, `focused: ${focused}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  check('Esc keeps it', (await page.locator('.v0-confirm').count()) === 0 && (await page.locator('.v0-list-row').count()) === n0);
  await page.locator('.v0-list-row').first().getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'Delete it' }).click();
  await page.waitForTimeout(600);
  const n1 = await page.locator('.v0-list-row').count();
  check('Delete (after confirming) removes one', n1 === n0 - 1, `${n0} → ${n1}`);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  check('…and it stays deleted after a reload', (await page.locator('.v0-list-row').count()) === n1);
  await page.locator('.v0-list-open').first().click();
  await page.waitForTimeout(800);
  check('a listed design opens in the workspace', /\?p=uxv0_/.test(page.url()) && (await page.locator('.v0-work').count()) === 1, page.url());
});

// 7 — Create: edit an answer, another direction, edit the brief directly, refine it in words, an earlier version (5.3, 5.6, 5.8, 5.13)
await part('create details', async () => {
  await page.goto(HOME, { waitUntil: 'networkidle' });
  calls.discover.length = 0; calls.brief.length = 0; calls.images.length = 0;
  await page.locator('.v0-intent-line textarea').fill('A website for my independent coffee house');
  await page.getByRole('button', { name: 'Begin' }).click();
  await page.waitForSelector('.v0-tile img', { timeout: 15000 });
  await page.waitForTimeout(600);
  const nd = calls.discover.length;
  await page.locator('.v0-group-head', { hasText: 'Imagery' }).getByRole('button', { name: 'Another direction' }).click();
  for (let i = 0; i < 25 && calls.discover.length === nd; i++) await page.waitForTimeout(200);
  check('“Another direction” asks for contrasting queries for that aspect', calls.discover.at(-1)?.action === 'direction' && calls.discover.at(-1)?.aspect === 'imagery', JSON.stringify({ action: calls.discover.at(-1)?.action, aspect: calls.discover.at(-1)?.aspect }));
  for (let i = 0; i < 6; i++) { const k = page.locator('.v0-tile .l5-link', { hasText: /^Keep$/ }).first(); if (await k.count()) await k.click(); }
  await page.getByRole('button', { name: 'Neighbours who come for the ritual' }).click();
  await page.waitForSelector('text=Enough to write the brief', { timeout: 10000 });
  await page.getByRole('tab', { name: 'Questions' }).click().catch(() => {});
  const na = calls.discover.length;
  await page.locator('.v0-answers .l5-link', { hasText: 'Edit' }).first().click();
  await page.locator('.v0-editline textarea').fill('Neighbours, and the people who stay to work');
  await page.locator('.v0-editline').getByRole('button', { name: 'Save' }).click();
  for (let i = 0; i < 25 && calls.discover.length === na; i++) await page.waitForTimeout(200);
  const edited = calls.discover.at(-1)?.questions?.find((q) => q.id === 'q_a')?.answer;
  check('editing an earlier answer re-runs understanding with the new answer', calls.discover.length > na && edited === 'Neighbours, and the people who stay to work', edited);
  await page.getByRole('button', { name: /Write the brief/ }).first().click();
  await page.waitForSelector('.v0-brief', { timeout: 10000 });
  const nb = calls.brief.length;
  const aud = page.locator('.v0-brief-field', { hasText: 'Audience' }).locator('textarea');
  await aud.fill('Neighbours within a ten-minute walk, and remote workers after nine.');
  await page.waitForTimeout(700);
  check('a direct edit to the brief needs no model call', calls.brief.length === nb && (await aud.inputValue()).includes('remote workers'), `${nb} → ${calls.brief.length} calls`);
  await page.locator('.v0-compose textarea').fill('Make the personality warmer and less formal');
  await page.locator('.v0-compose .l5-btn.is-primary').click();
  for (let i = 0; i < 25 && calls.brief.length === nb; i++) await page.waitForTimeout(200);
  const rb = calls.brief.at(-1);
  const moved = await page.waitForFunction(() => document.querySelector('.v0-notice')?.textContent?.includes('visual direction moved'), null, { timeout: 8000 }).then(() => true).catch(() => false);
  check('a refinement that moves the visual direction puts new images on the board', moved && calls.images.at(-1)?.queries?.[0]?.query === 'candlelit cafe evening', (await page.locator('.v0-notice').innerText().catch(() => '')).replace(/\n/g, ' ').slice(0, 140));
  await page.locator('.v0-notice').getByRole('button', { name: 'See the moodboard' }).click();
  await page.waitForTimeout(500);
  check('…and the new image is there to keep or remove', (await page.locator('.v0-tile img[alt="Dusk at the window"]').count()) === 1);
  await page.getByRole('button', { name: /^Brief$/ }).first().click().catch(() => {});
  await page.waitForTimeout(400);
  check('“Refine” in words sends the brief, with the direct edit, for a patch', rb?.action === 'refine' && /warmer/.test(rb?.instruction || '') && /remote workers/.test(JSON.stringify(rb?.brief || rb?.current || {})), JSON.stringify({ action: rb?.action, instruction: rb?.instruction }));
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: 'Approve and generate' }).click();
  await page.waitForSelector('iframe.v0-frame', { timeout: 15000 });
  await page.waitForTimeout(2500);
  const fr = () => page.frames().find((f) => f.url() === 'about:srcdoc');
  await page.frameLocator('iframe.v0-frame').locator('h1').click();
  await page.waitForSelector('.v0-sel', { timeout: 5000 });
  await page.locator('.v0-compose textarea').fill('Make the headline about first light');
  await page.locator('.v0-compose .l5-btn.is-primary').click();
  await page.waitForFunction(() => document.querySelector('.v0-notice')?.textContent?.includes('Changed'), null, { timeout: 10000 });
  await page.waitForTimeout(1500);
  check('the change applied', (await fr().locator('h1').innerText()).includes('first light'));
  await page.getByRole('tab', { name: 'Versions' }).click();
  await page.locator('.v0-version').last().click();
  await page.waitForTimeout(1500);
  const h1 = await fr().locator('h1').innerText();
  check('an earlier version can be viewed from Versions', /slow mornings/.test(h1), h1.replace(/\n/g, ' '));
  check('…and it is marked as the one shown', (await page.locator('.v0-version').last().getAttribute('aria-current')) === 'true');
});

// 8 — a file dropped on the home's Critique way opens (2.1)
await part('home drop', async () => {
  await page.goto(HOME, { waitUntil: 'networkidle' });
  const dt = await page.evaluateHandle(() => { const d = new DataTransfer(); d.items.add(new File(['<!doctype html><title>Dropped</title><main><h1>Dropped page</h1><a href="#" class="btn">Go</a></main>'], 'dropped.html', { type: 'text/html' })); return d; });
  await page.dispatchEvent('.v0-way-drop', 'dragover', { dataTransfer: dt });
  check('a file held over Critique marks it', await page.locator('.v0-way-drop.is-over').count() === 1);
  await page.dispatchEvent('.v0-way-drop', 'drop', { dataTransfer: dt });
  await page.waitForSelector('iframe.v0-frame', { timeout: 15000 });
  await page.waitForTimeout(800);
  check('a dropped file opens in the workspace', (await page.frameLocator('iframe.v0-frame').locator('h1').innerText()) === 'Dropped page');
  await page.goto(HOME, { waitUntil: 'networkidle' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  const o = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  check('the home has no horizontal overflow at 390px', o[0] <= o[1], `${o[0]} ≤ ${o[1]}`);
  await page.screenshot({ path: S + 'v0-22-home-390.png' });
  await page.setViewportSize({ width: 1440, height: 900 });
});

// 9 — a file that passes its checks but cannot be read explains why; the import view takes a drop (2.6, 2.1)
await part('unreadable image, then a drop', async () => {
  await page.goto(HOME, { waitUntil: 'networkidle' });
  const broken = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('this is not the rest of a PNG')]);
  await page.locator('input[type=file]').setInputFiles({ name: 'cut-off.png', mimeType: 'image/png', buffer: broken });
  await page.waitForSelector('.v0-import', { timeout: 10000 });
  const err = await page.waitForFunction(() => document.querySelector('.v0-notice')?.textContent?.includes('could not be read'), null, { timeout: 6000 }).then(() => true).catch(() => false);
  check('an image that cannot be read says so, and nothing is drawn', err && (await page.locator('img.v0-image').count()) === 0, (await page.locator('.v0-notice').innerText().catch(() => '')).slice(0, 100));
  const png = (await import('node:fs')).readFileSync(FX + 'existing-design.png').toString('base64');
  const dt = await page.evaluateHandle((b64) => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); const d = new DataTransfer(); d.items.add(new File([u], 'existing-design.png', { type: 'image/png' })); return d; }, png);
  await page.dispatchEvent('.v0-import', 'drop', { dataTransfer: dt });
  await page.waitForSelector('img.v0-image', { timeout: 10000 });
  check('the import view takes a dropped file', (await page.locator('img.v0-image').count()) === 1);
});

// 10 — when the browser's storage is full, the design still opens and the person is told (1.3)
await part('storage full', async () => {
  await page.goto(HOME, { waitUntil: 'networkidle' });
  await page.evaluate(() => { window.__quota = true; });
  await page.locator('input[type=file]').setInputFiles(FX + 'marble.jpg');
  await page.waitForSelector('img.v0-image', { timeout: 15000 });
  const said = await page.waitForFunction(() => document.querySelector('.v0-notice')?.textContent?.includes('storage is full'), null, { timeout: 6000 }).then(() => true).catch(() => false);
  check('storage full: the design opens anyway, and the person is told it will not be kept', said, (await page.locator('.v0-notice').innerText().catch(() => '')).slice(0, 120));
  await page.evaluate(() => { window.__quota = false; });
});

// 11 — a model failure keeps the comment and offers to try again (6.6)
await part('model failure', async () => {
  await page.goto(HOME, { waitUntil: 'networkidle' });
  await page.locator('input[type=file]').setInputFiles(FX + 'existing-design.html');
  await page.waitForSelector('iframe.v0-frame', { timeout: 20000 });
  await page.waitForTimeout(1500);
  await page.frameLocator('iframe.v0-frame').locator('a.btn').first().click();
  await page.waitForSelector('.v0-sel', { timeout: 5000 });
  failCritique = true;
  await page.locator('.v0-compose textarea').fill('Is this the strongest call to action?');
  await page.locator('.v0-compose .l5-btn.is-primary').click();
  const shown = await page.waitForFunction(() => /did not answer/.test(document.querySelector('.v0-card')?.textContent || ''), null, { timeout: 8000 }).then(() => true).catch(() => false);
  const card = await page.locator('.v0-card').first().innerText().catch(() => '');
  check('a failed call keeps the comment on its card, with the reason', shown && card.includes('Is this the strongest call to action?'), card.replace(/\n/g, ' | ').slice(0, 160));
  failCritique = false;
  await page.locator('.v0-card').getByRole('button', { name: 'Try again' }).click();
  const back = await page.waitForSelector('.v0-card .v0-read', { timeout: 8000 }).then(() => true).catch(() => false);
  check('“Try again” sends the same comment and the reasoning arrives', back && critiques.at(-1)?.comment === 'Is this the strongest call to action?', critiques.at(-1)?.comment);
});

out('\nSUMMARY ' + results.filter((r) => r[0] === 'PASS').length + ' passed, ' + results.filter((r) => r[0] === 'FAIL').length + ' failed');
out('ERRORS ' + JSON.stringify(errs.filter((e) => !/Content Security Policy|styles\.css|api\/health/.test(e))));
await b.close();
