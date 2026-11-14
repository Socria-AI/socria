// The acceptance lines no other pass reaches: every kind of element, the highlight through zoom and pan, a card's area,
// viewport switches, forged messages, axe, big and tiny images, zoom about the pointer, retina crops, sign-in, an exact undo.
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
  imagery: [IMG('cafe-bar', 'imagery', 'Espresso bar at first light'), IMG('pour', 'imagery', 'Pour-over, close', 1000, 1400), IMG('window', 'imagery', 'Window seat'), IMG('people', 'imagery', 'Regulars at the long table')],
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
    return r.fulfill({ json: { brief: { objective: 'Bring neighbours in on weekday mornings by showing the ritual: the first light, the pour, the long table.', audience: 'Neighbours within a ten-minute walk who come for the ritual, not the speed; often on a phone on the way in.', userGoals: ['See what is on this morning', 'Know when it opens', 'Book the long table for a group'], personality: ['unhurried', 'warm', 'exact'], visualDirection: 'Editorial and warm: big serif headlines, morning photography with warmth, paper tones, generous whitespace, no rounded corners.', palette: [{ name: 'Paper', hex: '#f4efe6', role: 'background' }, { name: 'Cream', hex: '#fbf8f2', role: 'surface' }, { name: 'Roast', hex: '#221c17', role: 'text' }, { name: 'Ash', hex: '#6b6157', role: 'muted' }, { name: 'Walnut', hex: '#5b3a24', role: 'accent' }, { name: 'Milk', hex: '#fbf8f2', role: 'accent-text' }, { name: 'Line', hex: '#e2d8c9', role: 'line' }], typography: { display: 'Instrument Serif', body: 'Inter', rationale: 'A condensed editorial serif for the voice; Inter for menus and times that must read at a glance.' }, layoutDirection: 'A full-bleed morning image, then the story, the menu as a printed card, a gallery, and one booking form.', functionalRequirements: ['This morning’s menu with prices', 'Opening hours', 'Book the long table'], references: kept, openQuestions: ['Real prices and hours'], pageType: 'website', platform: 'web' }, usage } });
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

// ── Workflow D: the acceptance lines no other pass reaches ───────────
const results = [];
const check = (name, pass, detail = '') => { results.push([pass ? 'PASS' : 'FAIL', name, detail]); out(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };
const part = async (name, fn) => { try { await fn(); } catch (e) { check(name, false, 'threw: ' + String(e.message || e).split('\n')[0].slice(0, 220)); } };
const HOME = BASE + '/ux-v0';
const critiques = calls.critique;
const frameEl = () => page.frames().find((f) => f.url() === 'about:srcdoc');
const label = async () => (await page.locator('.v0-sel-label').innerText().catch(() => '')).trim();
const tagShown = async () => ((await page.locator('.v0-inspect').innerText().catch(() => '')).match(/Tag\s*\n?\s*(\w+)/) || [])[1] || '';
// an element's box inside the frame, in page pixels
const pageBox = async (sel) => {
  const ifr = await page.locator('iframe.v0-frame').boundingBox();
  const k = await page.locator('iframe.v0-frame').evaluate((f) => f.getBoundingClientRect().width / f.clientWidth);
  const r = await frameEl().locator(sel).first().evaluate((e) => e.getBoundingClientRect().toJSON());
  return { x: ifr.x + r.x * k, y: ifr.y + r.y * k, w: r.width * k, h: r.height * k };
};
const near = (a, b, d = 3) => Math.abs(a.x - b.x) <= d && Math.abs(a.y - b.y) <= d && Math.abs(a.w - b.w) <= d && Math.abs(a.h - b.h) <= d;
const selBox = async () => { const b = await page.locator('.v0-sel').first().boundingBox(); return b && { x: b.x, y: b.y, w: b.width, h: b.height }; };
const send = async (text) => {
  const n = critiques.length;
  await page.locator('.v0-compose textarea').fill(text);
  await page.locator('.v0-compose .l5-btn.is-primary').click();
  for (let i = 0; i < 40 && critiques.length === n; i++) await page.waitForTimeout(150);
  return critiques.at(-1);
};
const dropFile = async (selector, make, arg) => {
  const dt = await page.evaluateHandle(make, arg);
  await page.dispatchEvent(selector, 'drop', { dataTransfer: dt });
};

// A — an HTML page: every kind of element, the highlight through zoom and pan, a card's area, the viewport, forged messages, hover, axe
await part('html kinds', async () => {
  await page.goto(HOME, { waitUntil: 'networkidle' });
  await page.locator('input[type=file]').setInputFiles(FX + 'kinds.html');
  await page.waitForSelector('iframe.v0-frame', { timeout: 20000 });
  await page.waitForTimeout(1800);
  await page.getByRole('tab', { name: 'Selection' }).click();
  const f = page.frameLocator('iframe.v0-frame');
  const kinds = [['nav a', /^Link “Menu”/, 'a navigation link'], ['h1', /^Heading/, 'a heading'], ['.hero img', /^Image/, 'an image'], ['.card:nth-of-type(2)', /^Block “Pastries/, 'a card'], ['.card:nth-of-type(2) button', /^Button/, 'a button'], ['input', /^Field/, 'a form field'], ['form', /^Form/, 'a form'], ['.cards', /^Section/, 'a section']];
  for (const [sel, want, what] of kinds) {
    const b = await f.locator(sel).first().boundingBox();
    await page.mouse.click(b.x + Math.min(10, b.width / 2), b.y + Math.min(10, b.height / 2));
    await page.waitForTimeout(350);
    const l = await label();
    check(`${what} can be selected`, want.test(l), `clicked ${sel} → ${l}`);
  }
  // the highlight follows the element through zoom and pan
  await f.locator('.hero img').click({ position: { x: 8, y: 8 } });
  await page.waitForTimeout(300);
  check('the highlight sits on the element', near(await selBox(), await pageBox('.hero img')), JSON.stringify([await selBox(), await pageBox('.hero img')]));
  await page.keyboard.press('Control+=');
  await page.waitForTimeout(400);
  check('…and stays on it through zoom', near(await selBox(), await pageBox('.hero img')), JSON.stringify([await selBox(), await pageBox('.hero img')]));
  const st = await page.locator('.v0-stage, .v0-main').first().boundingBox();
  await page.mouse.move(st.x + st.width / 2, st.y + st.height / 2);
  await page.mouse.wheel(0, 240);
  await page.waitForTimeout(400);
  check('…and through panning', near(await selBox(), await pageBox('.hero img')), JSON.stringify([await selBox(), await pageBox('.hero img')]));
  await page.keyboard.press('Control+0');
  await page.waitForTimeout(400);
  // hover outline
  const h1 = await f.locator('h1').boundingBox();
  await page.mouse.move(h1.x + 20, h1.y + 10);
  await page.waitForTimeout(300);
  check('hovering an element outlines it', (await page.locator('.v0-hover').count()) === 1);
  // the viewport changes; the selected element stays selected
  await f.locator('h1').click();
  await page.waitForTimeout(300);
  const before = await label();
  await page.getByRole('radio', { name: 'Tablet' }).click();
  await page.waitForTimeout(1500);
  const iw = await f.locator('html').evaluate(() => window.innerWidth);
  check('switching the viewport keeps the selected element selected', (await label()) === before && iw === 834, `${before} → ${await label()} at ${iw}px`);
  check('…its highlight re-measured at the new width', near(await selBox(), await pageBox('h1')), JSON.stringify([await selBox(), await pageBox('h1')]));
  await page.getByRole('radio', { name: 'Desktop' }).click();
  await page.waitForTimeout(1500);
  // an area over a card brings its heading, text and button
  await page.getByRole('radio', { name: 'Area' }).click();
  const card = await pageBox('.card:nth-of-type(2)');
  await page.mouse.move(card.x + 3, card.y + 3);
  await page.mouse.down();
  await page.mouse.move(card.x + card.w - 3, card.y + card.h - 3, { steps: 8 });
  await page.mouse.up();
  await page.waitForSelector('.v0-sel.is-region', { timeout: 5000 });
  const c = await send('Does this card earn its button?');
  const tags = (c?.selection?.region?.elements || []).map((e) => e.tag);
  check('an area over a card returns its heading, text and button', ['h3', 'p', 'button'].every((t) => tags.includes(t)), JSON.stringify(tags));
  // a zero-size drag selects nothing
  await page.keyboard.press('Escape');
  const ib = await page.locator('iframe.v0-frame').boundingBox();
  await page.mouse.move(ib.x + 200, ib.y + 300);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(300);
  check('a click without a drag in Area selects nothing', (await page.locator('.v0-sel').count()) === 0);
  // a card's "Show on design" brings its selection back
  await page.getByRole('radio', { name: 'Element' }).click();
  await page.getByRole('tab', { name: /^Cards/ }).click();
  await page.locator('.v0-card').first().getByRole('button', { name: 'Show on design' }).click();
  await page.waitForTimeout(500);
  check('“Show on design” restores the card’s selection on the canvas', (await page.locator('.v0-sel.is-region').count()) === 1 && /Area/.test(await label()), await label());
  // forged messages: from the app’s own window, and malformed from the frame
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.postMessage({ __uxv0: 1, type: 'select', id: 'forged', element: { tag: 'h1', name: 'Forged', selector: 'h1', box: { x: 0, y: 0, w: 10, h: 10 } } }, '*'));
  await frameEl().evaluate(() => { parent.postMessage({ __uxv0: 1, type: 'select', element: 'garbage' }, '*'); parent.postMessage({ type: 'select', element: { tag: 'h1' } }, '*'); parent.postMessage('nonsense', '*'); });
  await page.waitForTimeout(500);
  check('forged and malformed messages are ignored', (await page.locator('.v0-sel').count()) === 0 && !errs.some((e) => /pageerror/.test(e) && !/Clerk/.test(e)), errs.filter((e) => !/Clerk/.test(e)).join(' | ').slice(0, 160));
  // the workspace shell, checked by axe
  await page.addScriptTag({ path: ROOT + 'node_modules/axe-core/axe.min.js' });
  const ax = await page.evaluate(async () => (await window.axe.run(document, { exclude: [['iframe'], ['.v0-env'], ['[data-env-badge]']], resultTypes: ['violations'] })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id} (${v.nodes.length}): ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' · ')}`));
  check('axe finds no serious or critical problems in the workspace shell', ax.length === 0, ax.join(' || ').slice(0, 600));
});

// B — images: a 4000 px screenshot, a tiny icon, zoom about the pointer, the same area at two zooms
await part('images', async () => {
  const makePng = async ([w, h]) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#5b3a24'); gr.addColorStop(1, '#f4efe6'); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.fillRect(w * 0.1, h * 0.1, w * 0.3, h * 0.2); const blob = await new Promise((r) => c.toBlob(r, 'image/png')); const d = new DataTransfer(); d.items.add(new File([blob], `shot-${w}.png`, { type: 'image/png' })); return d; };
  await page.goto(HOME, { waitUntil: 'networkidle' });
  await dropFile('.v0-way-drop', makePng, [4000, 2500]);
  await page.waitForSelector('img.v0-image', { timeout: 15000 });
  await page.waitForTimeout(700);
  const stage = await page.locator('.v0-stage').first().boundingBox();
  const im = await page.locator('img.v0-image').boundingBox();
  const zoom = parseInt(await page.locator('.v0-zoom-v').innerText(), 10);
  check('a 4000 px screenshot fits on the canvas', im.x >= stage.x - 1 && im.y >= stage.y - 1 && im.x + im.width <= stage.x + stage.width + 1 && im.y + im.height <= stage.y + stage.height + 1, `zoom ${zoom}% · image ${Math.round(im.width)}×${Math.round(im.height)} in stage ${Math.round(stage.width)}×${Math.round(stage.height)}`);
  // zoom about the pointer: the point under it stays under it
  const px = im.x + im.width * 0.3, py = im.y + im.height * 0.4;
  await page.mouse.move(px, py);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -300);
  await page.keyboard.up('Control');
  await page.waitForTimeout(400);
  const im2 = await page.locator('img.v0-image').boundingBox();
  const rel = [(px - im2.x) / im2.width, (py - im2.y) / im2.height];
  check('zoom stays anchored at the pointer', im2.width > im.width * 1.05 && Math.abs(rel[0] - 0.3) < 0.01 && Math.abs(rel[1] - 0.4) < 0.01, `${Math.round(im.width)} → ${Math.round(im2.width)} px; point at ${rel.map((v) => v.toFixed(3)).join(', ')}`);
  // the same image-relative area, at two zooms, is the same size in the image
  const dragRel = async (x0, y0, x1, y1) => { const b = await page.locator('img.v0-image').boundingBox(); await page.mouse.move(b.x + b.width * x0, b.y + b.height * y0); await page.mouse.down(); await page.mouse.move(b.x + b.width * x1, b.y + b.height * y1, { steps: 6 }); await page.mouse.up(); await page.waitForSelector('.v0-sel.is-region', { timeout: 5000 }); return label(); };
  await page.keyboard.press('Control+0');
  await page.waitForTimeout(400);
  const a1 = await dragRel(0.1, 0.1, 0.4, 0.3);
  await page.keyboard.press('Escape');
  await page.locator('.v0-zoom button[aria-label="Zoom in"]').click();
  await page.waitForTimeout(400);
  const a2 = await dragRel(0.1, 0.1, 0.4, 0.3);
  const dims = (s) => (s.match(/(\d+) × (\d+)/) || []).slice(1).map(Number);
  const [w1, h1] = dims(a1), [w2, h2] = dims(a2);
  check('an area is measured in the image’s own pixels, at any zoom', Math.abs(w1 - w2) <= 12 && Math.abs(h1 - h2) <= 12 && Math.abs(w1 - 1200) <= 24, `${a1} | ${a2}`);
  // a tiny icon is drawn at its size, centred, not blown up
  await page.goto(HOME, { waitUntil: 'networkidle' });
  await dropFile('.v0-way-drop', makePng, [16, 16]);
  await page.waitForSelector('img.v0-image', { timeout: 15000 });
  await page.waitForTimeout(700);
  const st2 = await page.locator('.v0-stage').first().boundingBox();
  const ic = await page.locator('img.v0-image').boundingBox();
  const z2 = parseInt(await page.locator('.v0-zoom-v').innerText(), 10);
  const cx = Math.abs(ic.x + ic.width / 2 - (st2.x + st2.width / 2)), cy = Math.abs(ic.y + ic.height / 2 - (st2.y + st2.height / 2));
  check('a tiny icon is shown at its own size and centred, not blown up', z2 === 100 && Math.round(ic.width) === 16 && cx < 30 && cy < 30, `zoom ${z2}% · ${Math.round(ic.width)}px · off-centre ${Math.round(cx)},${Math.round(cy)}`);
});

// C — retina: the crop of the same area is the same on a 2× screen
await part('retina crop', async () => {
  const cropOf = async (dpr) => {
    const c2 = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: dpr });
    const p2 = await c2.newPage();
    const seen = [];
    await p2.route('**/api/ux-v0/critique', (r) => { seen.push(JSON.parse(r.request().postData())); return r.fulfill({ json: { reasoning: { read: 'ok', verdict: 'works', questions: [], principles: [], issues: [], alternatives: [], basis: '' }, artifactSummary: 'x', usage: { model: 'gpt-6-luna', input: 1, cached: 0, output: 1, cost: 0 } } }); });
    await p2.goto(HOME, { waitUntil: 'networkidle' });
    await p2.locator('input[type=file]').setInputFiles(FX + 'existing-design.png');
    await p2.waitForSelector('img.v0-image', { timeout: 15000 });
    await p2.waitForTimeout(700);
    const im = await p2.locator('img.v0-image').boundingBox();
    await p2.mouse.move(im.x + im.width * 0.3, im.y + im.height * 0.02);
    await p2.mouse.down();
    await p2.mouse.move(im.x + im.width * 0.9, im.y + im.height * 0.1, { steps: 6 });
    await p2.mouse.up();
    await p2.waitForSelector('.v0-sel.is-region', { timeout: 5000 });
    await p2.locator('.v0-compose textarea').fill('Crop check');
    await p2.locator('.v0-compose .l5-btn.is-primary').click();
    for (let i = 0; i < 40 && !seen.length; i++) await p2.waitForTimeout(150);
    const crop = seen[0]?.selection?.crop;
    const size = crop ? await p2.evaluate((u) => new Promise((res) => { const i = new Image(); i.onload = () => res([i.naturalWidth, i.naturalHeight]); i.src = u; }), crop.dataUrl) : null;
    await c2.close();
    return { box: crop?.box, size };
  };
  const one = await cropOf(1), two = await cropOf(2);
  const same = one.box && two.box && Math.abs(one.box.x - two.box.x) <= 2 && Math.abs(one.box.w - two.box.w) <= 2 && one.size && two.size && Math.abs(one.size[0] - two.size[0]) <= 2 && Math.abs(one.size[1] - two.size[1]) <= 2;
  check('the crop matches the drawn rectangle on 1× and 2× screens alike', same, JSON.stringify({ one, two }));
});

// D — Create: signed out at the first model call, discovery at 390, a provider failure on the board, the brief through a reload, an area on the design, an exact undo
await part('create acceptance', async () => {
  await page.route('**/api/ux-v0/discover', (r) => r.fulfill({ status: 401, json: { error: 'Sign in to let SocriaUX ask its questions.', signIn: true } }));
  await page.goto(HOME, { waitUntil: 'networkidle' });
  await page.locator('.v0-intent-line textarea').fill('A website for a small bakery');
  await page.getByRole('button', { name: 'Begin' }).click();
  const asked = await page.waitForFunction(() => /Sign in/i.test(document.querySelector('.v0-notice, .v0-error-line, [role=alert]')?.textContent || ''), null, { timeout: 8000 }).then(() => true).catch(() => false);
  check('signed out, the first model call asks the person to sign in (and nothing breaks)', asked && /\?p=uxv0_/.test(page.url()), (await page.locator('.v0-notice, [role=alert]').first().innerText().catch(() => '')).slice(0, 100));
  await page.unroute('**/api/ux-v0/discover');
  // the real flow, at a phone's width first
  calls.discover.length = 0; calls.images.length = 0; calls.brief.length = 0; calls.generate.length = 0;
  await page.goto(HOME, { waitUntil: 'networkidle' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.v0-intent-line textarea').fill('A website for my independent coffee house');
  await page.getByRole('button', { name: 'Begin' }).click();
  await page.waitForSelector('.v0-question', { timeout: 15000 });
  await page.waitForTimeout(800);
  const o = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  check('discovery works at 390 px', o[0] <= o[1], `${o[0]} ≤ ${o[1]}`);
  const fit = await page.evaluate(() => {
    const r = (sel) => document.querySelector(sel)?.getBoundingClientRect();
    const inside = (b) => !!b && b.left >= -0.5 && b.right <= window.innerWidth + 0.5;
    const over = (a, b) => !!a && !!b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    return { send: inside(r('.v0-compose .l5-btn.is-primary')), guide: inside(r('.v0-guide')), field: inside(r('.v0-compose textarea')), steps: inside(r('.v0-steps')), clash: over(r('.v0-steps'), r('.v0-home')), tab: Math.round(r('.v0-steps .l5-tab')?.height ?? 0) };
  });
  check('…with nothing clipped or covered: the composer, its button, the steps and the mark', fit.send && fit.guide && fit.field && fit.steps && !fit.clash, JSON.stringify(fit));
  check('…and the steps are big enough to tap', fit.tab >= 44, `${fit.tab}px`);
  await page.screenshot({ path: S + 'v0-30-discovery-390.png' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(400);
  // a provider failure: the board says so and keeps what it has
  const tiles = await page.locator('.v0-tile').count();
  await page.route('**/api/ux-v0/images', (r) => r.fulfill({ json: { results: [{ category: 'imagery', query: 'x', page: 1, refs: [], provider: null, error: 'The image libraries could not be reached just now.' }] } }));
  await page.getByRole('button', { name: 'More images' }).click();
  await page.waitForTimeout(800);
  const line = await page.locator('.v0-board .v0-error-line').innerText().catch(() => '');
  check('a provider failure is said on the board, which keeps what it has', /could not be reached/.test(line) && (await page.locator('.v0-tile').count()) === tiles && tiles > 0, `${tiles} tiles · ${line}`);
  await page.unroute('**/api/ux-v0/images');
  for (let i = 0; i < 6; i++) { const k = page.locator('.v0-tile .l5-link', { hasText: /^Keep$/ }).first(); if (await k.count()) await k.click(); }
  await page.getByRole('button', { name: 'Neighbours who come for the ritual' }).click();
  await page.waitForSelector('text=Enough to write the brief', { timeout: 10000 });
  await page.getByRole('button', { name: /Write the brief/ }).first().click();
  await page.waitForSelector('.v0-brief', { timeout: 10000 });
  const aud = () => page.locator('.v0-brief-field', { hasText: 'Audience' }).locator('textarea');
  await aud().fill('Neighbours within a ten-minute walk, and remote workers after nine.');
  await page.waitForTimeout(1500);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.v0-brief', { timeout: 10000 });
  check('a direct edit to the brief survives a reload', (await aud().inputValue()).includes('remote workers'), await aud().inputValue());
  await page.getByRole('button', { name: 'Approve and generate' }).click();
  await page.waitForSelector('iframe.v0-frame', { timeout: 15000 });
  await page.waitForTimeout(2500);
  check('the approved brief is the one generation uses', /remote workers/.test(calls.generate.at(-1)?.brief?.audience || ''), calls.generate.at(-1)?.brief?.audience);
  // an area on a generated design
  await page.getByRole('radio', { name: 'Area' }).click();
  const ib = await page.locator('iframe.v0-frame').boundingBox();
  const sb = await page.locator('.v0-stage').first().boundingBox();
  const top = Math.max(ib.y, sb.y) + 60;
  await page.mouse.move(ib.x + ib.width * 0.2, top);
  await page.mouse.down();
  await page.mouse.move(ib.x + ib.width * 0.8, top + 220, { steps: 8 });
  await page.mouse.up();
  await page.waitForSelector('.v0-sel.is-region', { timeout: 5000 });
  check('area selection works on a generated design, as on an import', /Area \d+ × \d+ · \d+ element/.test(await label()), await label());
  await page.keyboard.press('Escape');
  await page.getByRole('radio', { name: 'Element' }).click();
  // an exact undo
  const bodyHtml = async () => frameEl().evaluate(() => document.body.innerHTML);
  const original = await bodyHtml();
  await page.frameLocator('iframe.v0-frame').locator('h1').click();
  await page.waitForSelector('.v0-sel', { timeout: 5000 });
  await page.locator('.v0-compose textarea').fill('Make the headline about first light');
  await page.locator('.v0-compose .l5-btn.is-primary').click();
  await page.waitForFunction(() => document.querySelector('.v0-notice')?.textContent?.includes('Changed'), null, { timeout: 10000 });
  await page.waitForTimeout(1500);
  const changed = await bodyHtml();
  await page.getByRole('button', { name: 'Undo', exact: true }).first().click();
  await page.waitForTimeout(1500);
  const undone = await bodyHtml();
  check('undo restores the exact earlier page', changed !== original && undone === original, `${original.length} → ${changed.length} → ${undone.length} chars`);
});

out('\nSUMMARY ' + results.filter((r) => r[0] === 'PASS').length + ' passed, ' + results.filter((r) => r[0] === 'FAIL').length + ' failed');
out('ERRORS ' + JSON.stringify(errs.filter((e) => !/Content Security Policy|styles\.css|api\/health|Clerk/.test(e))));
await b.close();
