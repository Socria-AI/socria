// Workflow A (Create), end to end, with the model and the image libraries scripted:
// intent → question → moodboard (keep, remove, replace) → answer → brief → art direction (three, asked again, one
// changed and taken) → generate → checks → change → undo → critique → versions.
import { chromium, S, FX, ROOT, BASE, underTest } from './env.mjs';
import { readFileSync } from 'node:fs';
const V = await underTest();
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
// Openverse is asked from the browser; these checks script every image, so it answers with nothing here
// (moodboard-live.mjs asks the real one)
await ctx.route('https://api.openverse.org/**', (r) => r.fulfill({ json: { result_count: 0, page_count: 0, page_size: 20, page: 1, results: [] } }));
await ctx.route('https://images.example.test/**', (r) => r.fulfill({ contentType: 'image/jpeg', body: readFileSync(FX + r.request().url().split('/').pop()) }));

const IMG = (name, category, title, w = 1600, h = 1067) => ({ provider: 'openverse', providerId: name, id: `openverse:${name}`, url: `https://images.example.test/${name}.jpg`, thumb: `https://images.example.test/${name}.jpg`, width: w, height: h, title, creator: 'A. Photographer', creatorUrl: 'https://example.org/a', sourceUrl: `https://example.org/${name}`, license: 'CC BY 2.0', licenseUrl: 'https://creativecommons.org/licenses/by/2.0/', attribution: `“${title}” by A. Photographer, CC BY 2.0`, category, state: 'proposed' });
const LIB = {
  imagery: [IMG('cafe-bar', 'imagery', 'Espresso bar at first light'), IMG('pour', 'imagery', 'Pour-over, close', 1000, 1400), IMG('window', 'imagery', 'Window seat'), IMG('people', 'imagery', 'Regulars at the long table')],
  texture: [IMG('marble', 'texture', 'Marble counter'), IMG('ceramic', 'texture', 'Handmade ceramic', 1400, 1400), IMG('beans', 'texture', 'Roasted beans')],
  composition: [IMG('grid', 'composition', 'Editorial spread, asymmetric grid', 1600, 1000)],
};
const calls = { discover: [], images: [], brief: [], direct: [], generate: [], refine: [], critique: [] };
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
  if (url.endsWith('/direct')) {
    calls.direct.push(body);
    // as the route does: the engine's three, with the (scripted) model's words laid over them
    const ask = { ...body, brief: V.normalizeBrief(body.brief), base: body.base ? V.normalizeDirection(body.base) : null };
    const names = ['Printed morning', 'Long table', 'First light'];
    const written = { directions: names.map((name, i) => ({ candidate: i + 1, name, concept: `${name}: a direction written for Halcyon’s mornings.` })) };
    return r.fulfill({ json: { usage, options: V.parseDirections(written, ask, V.proposeDirections(ask)) } });
  }
  if (url.endsWith('/generate')) {
    calls.generate.push(body);
    // the server applies the approved direction's tokens and look, whatever the model wrote
    const art = body.artDirection;
    return r.fulfill({ json: { placeholders: ['[Opening hours]', '[£ price]'], usage, artDirection: art, spec: {
      ...(art ? { look: art.look } : {}),
      version: body.version, pageType: 'website', platform: 'web', title: 'Halcyon — coffee for slow mornings', reason: 'Generated from the approved brief', createdAt: Date.now(), notes: [],
      tokens: art ? art.tokens : { colors: { background: '#f4efe6', surface: '#fbf8f2', text: '#221c17', muted: '#6b6157', accent: '#5b3a24', accentText: '#fbf8f2', line: '#e2d8c9' }, fonts: { display: 'Instrument Serif', body: 'Inter' }, scale: 'spacious', radius: 'none', style: 'editorial', imageTreatment: 'warm' },
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

await page.goto(BASE + '/ux-v0', { waitUntil: 'networkidle' });
await page.locator('.v0-intent-line textarea').fill('A website for my independent coffee house');
await page.getByRole('button', { name: 'Begin' }).click();
await page.waitForSelector('.v0-question .v0-q-text', { timeout: 15000 });
await page.waitForSelector('.v0-tile img', { timeout: 15000 });
await page.waitForTimeout(1200);
out('discover #1 intent: ' + calls.discover[0].intent + ' · images asked: ' + calls.images[0].queries.map((q) => q.category).join(','));
await page.screenshot({ path: S + 'v0-10-discovery.png' });
// steer the board
const keeps = page.locator('.v0-tile .sb-link', { hasText: /^Keep$/ });
const n = await keeps.count();
for (let i = 0; i < Math.min(6, n); i++) await page.locator('.v0-tile .sb-link', { hasText: /^Keep$/ }).first().click();
await page.locator('.v0-tile .sb-link', { hasText: /^Remove$/ }).last().click();
await page.locator('.v0-palette .sb-link', { hasText: /^Keep$/ }).first().click();
await page.locator('.v0-type .sb-link', { hasText: /^Keep$/ }).first().click();
// replace one: a new image from the same query, never one already seen
const before = await page.locator('.v0-tile').count();
await page.locator('.v0-tile .sb-link', { hasText: /^Replace$/ }).first().click();
await page.waitForTimeout(800);
out('replace asked with seen=' + calls.images.at(-1).seen.length + ' per=' + calls.images.at(-1).per + ' tiles before/after: ' + before + '/' + (await page.locator('.v0-tile').count()));
// answer
await page.getByRole('button', { name: 'Neighbours who come for the ritual' }).click();
await page.waitForSelector('text=Enough to write the brief', { timeout: 10000 });
out('discover #2 sent the answer: ' + calls.discover[1].questions.find((q) => q.answer)?.answer);
await page.screenshot({ path: S + 'v0-11-ready.png' });
await page.getByRole('button', { name: /Write the brief/ }).first().click();
await page.waitForSelector('.v0-brief', { timeout: 10000 });
out('brief asked with kept refs: ' + calls.brief[0].moodboard.refs.filter((x) => x.state === 'kept').length);
await page.waitForTimeout(600);
await page.screenshot({ path: S + 'v0-12-brief.png' });
// art direction: three directions, drawn as specimens; one taken, one part of it changed (and so kept)
await page.getByRole('button', { name: 'Approve and set the Creative DNA' }).click();
// the Creative DNA step (optional): SocriaUX's reading, one click on to the directions
await page.waitForSelector('.dna-studio', { timeout: 10000 });
out('creative DNA: ' + (await page.locator('.dna-summary-words').innerText()));
await page.getByRole('button', { name: 'Explore directions' }).click();
await page.waitForSelector('.v0-dir', { timeout: 10000 });
await page.waitForTimeout(1500);
const dirs = await page.$$eval('.v0-dir', (els) => els.map((e) => [e.querySelector('.v0-dir-text > .sb-label')?.textContent, e.querySelector('.v0-cell-title')?.textContent]));
out('directions: ' + JSON.stringify(dirs));
out('direct asked with the brief: ' + (calls.direct[0]?.brief?.objective ?? '').slice(0, 40));
await page.screenshot({ path: S + 'v0-12b-direction.png', fullPage: false });
// the designer writes their own direction and asks again: three new languages
await page.locator('.v0-direct-own textarea').fill('more like a printed museum guide');
await page.getByRole('button', { name: 'Show three for this' }).click();
await page.waitForTimeout(1200);
const again = await page.$$eval('.v0-dir-text > .sb-label', (els) => els.map((e) => e.textContent));
out('asked again: ' + JSON.stringify(again) + ' round=' + calls.direct.at(-1)?.round + ' notes=' + calls.direct.at(-1)?.notes);
// change the second one's buttons, which keeps its surfaces, then use it
const second = page.locator('.v0-dir').nth(1);
await second.getByText('Change any part of it').click();
await second.getByRole('combobox', { name: 'Buttons' }).selectOption('underline');
out('second now keeps: ' + (await second.locator('.v0-dir-locks').innerText().catch(() => '—')));
const t0 = Date.now();
await second.getByRole('button', { name: 'Use this direction' }).click();
await page.waitForSelector('iframe.v0-frame', { timeout: 30000 });
// the model is scripted and answers at once: this is the time the checks at desktop and phone widths take
out('generated, checked and shown in ' + (Date.now() - t0) + ' ms');
const sent = calls.generate.at(-1).artDirection;
out('generate followed the direction: ' + (sent ? `${sent.language} · buttons ${sent.look.buttons} · locks ${sent.locks.join(',')}` : 'none'));
await page.waitForTimeout(3000);
await page.screenshot({ path: S + 'v0-13-design.png' });
const fr = () => page.frames().find((f) => f.url() === 'about:srcdoc');
out('h1: ' + (await fr().locator('h1').innerText()));
// the whole page, as rendered, for a closer look
const html = await fr().content();
(await import('node:fs')).writeFileSync(S + 'gen.html', html);
out('frame images: ' + JSON.stringify(await fr().evaluate(async () => { for (const i of document.images) { i.loading = 'eager'; i.scrollIntoView(); await new Promise((r) => setTimeout(r, 150)); } await new Promise((r) => setTimeout(r, 1200)); window.scrollTo(0, 0); return [...document.images].map((i) => [i.src.split('/').pop(), i.complete, i.naturalWidth, Math.round(i.getBoundingClientRect().height)]); })));
const p2 = await ctx.newPage();
await p2.setViewportSize({ width: 1440, height: 900 });
await p2.setContent(html.replace(/loading="lazy"/g, "").replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, ''), { waitUntil: 'networkidle' });
await p2.waitForTimeout(1500);
await p2.screenshot({ path: S + 'v0-14-page-full.png', fullPage: true });
await p2.setViewportSize({ width: 390, height: 844 });
await p2.waitForTimeout(500);
await p2.screenshot({ path: S + 'v0-15-page-mobile.png', fullPage: true });
await p2.close();
// change: select the headline, say what to change
const firstBody = (await fr().evaluate(() => document.body.innerHTML)).replace(/loading="eager"/g, 'loading="lazy"').replace(/ style=""/g, '');
await page.frameLocator('iframe.v0-frame').locator('h1').click();
await page.waitForSelector('.v0-sel', { timeout: 5000 });
out('selected: ' + (await page.locator('.v0-sel-label').innerText()));
await page.locator('.v0-compose textarea').fill('Make the headline about first light');
await page.locator('.v0-compose .sb-btn.is-primary').click();
await page.waitForFunction(() => document.querySelector('.v0-notice')?.textContent?.includes('Changed'), null, { timeout: 10000 });
await page.waitForTimeout(1500);
out('refine sent selection ux: ' + JSON.stringify(calls.refine[0].selection?.element?.ux) + ' · h1 now: ' + (await fr().locator('h1').innerText()));
await page.screenshot({ path: S + 'v0-16-changed.png' });
await page.getByRole('button', { name: 'Undo' }).first().click();
await page.waitForTimeout(1500);
out('after undo h1: ' + (await fr().locator('h1').innerText()));
const undoneBody = (await fr().evaluate(() => document.body.innerHTML)).replace(/loading="eager"/g, 'loading="lazy"').replace(/ style=""/g, '');
out('undo restores the page exactly: ' + (undoneBody === firstBody) + (undoneBody === firstBody ? '' : ` (${firstBody.length} vs ${undoneBody.length}; first difference at ${[...firstBody].findIndex((c, i) => c !== undoneBody[i])}: …${firstBody.slice([...firstBody].findIndex((c, i) => c !== undoneBody[i]) - 60, [...firstBody].findIndex((c, i) => c !== undoneBody[i]) + 60)}… vs …${undoneBody.slice([...firstBody].findIndex((c, i) => c !== undoneBody[i]) - 60, [...firstBody].findIndex((c, i) => c !== undoneBody[i]) + 60)}…)`));
// ask about it
await page.getByRole('button', { name: 'Redo' }).click();
await page.waitForTimeout(1200);
await page.frameLocator('iframe.v0-frame').locator('h1').click();
await page.getByRole('radio', { name: 'Ask' }).click();
await page.locator('.v0-compose textarea').fill('Does this headline do its job?');
await page.locator('.v0-compose .sb-btn.is-primary').click();
await page.waitForSelector('.v0-card .v0-read', { timeout: 8000 });
out('critique on generated: kind=' + calls.critique[0].kind + ' section digest=' + (calls.critique[0].section || '').slice(0, 60));
// the checks: drawn offscreen at desktop and phone, measured, findings in the rail
await page.getByRole('tab', { name: /Check/ }).click();
await page.waitForFunction(() => !document.querySelector('.v0-rail-tabs')?.textContent?.includes('Checking'), null, { timeout: 30000 });
out('checks: ' + (await page.locator('.v0-scores').innerText().catch(() => 'none')).replace(/\s+/g, ' ') + ' · ' + (await page.locator('.v0-rail-body [role=status]').first().innerText().catch(() => '')));
await page.screenshot({ path: S + 'v0-16b-checks.png' });
await page.getByRole('tab', { name: 'Versions' }).click();
out('versions: ' + (await page.locator('.v0-version').allInnerTexts()).join(' | '));
out('tabs: ' + JSON.stringify(await page.$$eval('.v0-rail-tabs .sb-seg-item', (els) => els.map((e) => [e.textContent, e.getAttribute('aria-selected'), getComputedStyle(e).boxShadow]))));
await page.getByRole('tab', { name: /Cards/ }).click();
await page.screenshot({ path: S + 'v0-17-card.png' });
await page.getByRole('radio', { name: 'Mobile' }).click();
await page.waitForTimeout(1500);
await page.screenshot({ path: S + 'v0-18-mobile.png' });
out('header cost: ' + (await page.locator('.v0-cost').innerText()));
out('ERRORS ' + JSON.stringify(errs));
await b.close();
