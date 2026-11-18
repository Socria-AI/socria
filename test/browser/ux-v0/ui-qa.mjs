// test/browser/ux-v0/ui-qa.mjs — SocriaUX's own interface, through a booking project, at five widths.
//
// Drives the real app (model and image libraries scripted in the browser, as workflow-a-create.mjs does; the
// scripted model answers with the code's own results so the screens are what the routes would return):
// a booking screen asked for → a question → the Living Brief, opening with "What it is" → three directions,
// each composing the booking differently → generation → the canvas, with the section editor (layout changed,
// section locked) and the cost panel. At 1440, 1280, 1024, 768 and 390 px it checks that nothing scrolls
// sideways and photographs each step for a person to look at. No model call is made.
//
//   UXV0_FORWARD=1 UXV0_BASE=http://127.0.0.1:3100 node test/browser/ux-v0/ui-qa.mjs   (against `next start`)
import { readFileSync } from 'node:fs';
import { chromium, S, FX, ROOT, BASE, underTest } from './env.mjs';

const V = await underTest();
let pass = 0;
let fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok  ', n)) : (fail++, console.log('  FAIL', n, String(x).slice(0, 300))));
const WIDTHS = [1440, 1280, 1024, 768, 390];

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error' && !/ERR_TUNNEL|clerk|Failed to load resource|ERR_NAME_NOT_RESOLVED/i.test(m.text())) errs.push('console ' + m.text().slice(0, 160));
});
// the app's own typefaces, served locally
await ctx.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: '' }));
await ctx.route('https://api.openverse.org/**', (r) => r.fulfill({ json: { result_count: 0, page_count: 0, page_size: 20, page: 1, results: [] } }));
await ctx.route('https://images.example.test/**', (r) => r.fulfill({ contentType: 'image/jpeg', body: readFileSync(FX + r.request().url().split('/').pop()) }));

const IMG = (name, category, title, w = 1600, h = 1067) => ({ provider: 'openverse', providerId: name, id: `openverse:${name}`, url: `https://images.example.test/${name}.jpg`, thumb: `https://images.example.test/${name}.jpg`, width: w, height: h, title, creator: 'A photographer', creatorUrl: '', sourceUrl: `https://example.org/${name}`, license: 'CC BY 2.0', licenseUrl: '', attribution: title, category, state: 'proposed' });
const LIB = { imagery: [IMG('window', 'imagery', 'Morning light in the studio'), IMG('people', 'imagery', 'A class at rest'), IMG('dusk', 'imagery', 'Evening, after class')], texture: [IMG('ceramic', 'texture', 'Clay and linen', 1400, 1400)], composition: [IMG('grid', 'composition', 'A calm grid')] };
const usage = (stage, tier) => ({ model: tier === 'premium' ? 'gpt-6.1-sol' : 'gpt-6-luna', input: 1800, cached: 0, output: 420, cost: tier === 'premium' ? 0.0078 : 0.0004, stage, tier, effort: tier === 'premium' ? 'medium' : 'default' });
const WORDS = 'Booking screen for my yoga studio: members choose a day and a time for an already-selected class, then confirm.';
let briefSent = null;
await ctx.route('**/api/ux-v0/**', async (r) => {
  const url = r.request().url();
  const body = JSON.parse(r.request().postData() || '{}');
  if (url.endsWith('/discover')) {
    if (!body.questions?.some((q) => q.answer)) return r.fulfill({ json: { usage: usage('discover', 'economy'), understanding: { summary: 'A booking screen for a small yoga studio.', known: { objective: 'Let members book a time for a class' }, gaps: ['audience'] }, questions: [{ id: 'q_a', topic: 'audience', question: 'Who books here, and on what?', why: 'It decides how much the screen explains.', options: ['Regular members, on their phones', 'New students, on a laptop'], answer: '', delegated: false }], moodboard: { queries: [{ category: 'imagery', query: 'yoga studio morning light' }, { category: 'texture', query: 'linen clay' }, { category: 'composition', query: 'calm grid' }] }, palettes: [], type: [], ready: false, note: '' } });
    return r.fulfill({ json: { usage: usage('discover', 'economy'), understanding: { summary: 'A booking screen for regular members of a small yoga studio, mostly on phones.', known: { objective: 'Let members book a time for a class', audience: 'Regular members, on their phones' }, gaps: [] }, questions: [], moodboard: { queries: [] }, palettes: [], type: [], ready: true, note: 'Enough to write the brief.' } });
  }
  if (url.endsWith('/images')) return r.fulfill({ json: { results: body.queries.map((q) => ({ ...q, refs: (LIB[q.category] ?? []).filter((x) => !body.seen.includes(x.id)).slice(0, body.per).map((x) => ({ ...x, query: q.query })), provider: 'openverse', error: '' })) } });
  if (url.endsWith('/brief')) {
    const kept = (body.moodboard?.refs ?? []).filter((x) => x.state === 'kept').map((x) => x.id);
    const parsed = V.normalizeBrief({ pageType: 'website', platform: 'web', objective: 'Let regular members book a time for their yoga class in a few taps, and know it is booked.', audience: 'Regular members of a small yoga studio, mostly on their phones between other things', userGoals: ['Choose a day and a time', 'See how many places are left', 'Confirm and get on with the day'], functionalRequirements: ['Full classes cannot be chosen'], personality: ['warm', 'calm', 'unhurried'], visualDirection: 'Warm, earthy, muted terracotta and cream; quiet type; nothing loud', palette: [{ hex: '#f4ede4', role: 'background' }, { hex: '#2b211b', role: 'text' }, { hex: '#b4552d', role: 'accent' }, { hex: '#ffffff', role: 'accent-text' }], typography: { display: 'Fraunces', body: 'Inter', rationale: 'A soft serif over a plain sans.' }, references: kept, openQuestions: [] }, new Set(kept));
    const intent = V.settleIntent(V.designerWords(body.intent, body.questions ?? []), { current: body.current?.intent ?? null });
    briefSent = { ...parsed, intent, pageType: V.pageTypeFor(intent, parsed.pageType) };
    return r.fulfill({ json: { usage: usage(body.action === 'refine' ? 'refine-brief' : 'brief', 'economy'), brief: briefSent, queries: [] } });
  }
  if (url.endsWith('/direct')) {
    const ask = { ...body, brief: V.normalizeBrief(body.brief), base: body.base ? V.normalizeDirection(body.base) : null };
    return r.fulfill({ json: { usage: usage('art-direction', 'premium'), options: V.proposeDirections(ask) } });
  }
  if (url.endsWith('/generate')) {
    // what the route makes of the answer that caused the original failure: a landing page about the studio
    const brief = V.normalizeBrief(body.brief) ?? briefSent;
    const board = V.normalizeMoodboard(body.moodboard);
    const art = body.artDirection ? V.normalizeDirection(body.artDirection) : V.autoDirection(brief);
    const bad = { title: 'Lotus Yoga', sections: [{ id: 'nav', kind: 'nav', content: { brand: 'Lotus', links: ['About'], cta: 'Begin' } }, { id: 'hero', kind: 'hero', content: { title: 'Find your flow', primary: 'Begin', secondary: 'Read more' } }, { id: 'why', kind: 'features', content: { title: 'Why us', items: [{ title: 'Calm', text: 'x' }, { title: 'Warm', text: 'y' }] } }, { id: 'foot', kind: 'footer', content: { brand: 'Lotus' } }] };
    const spec = V.parseGenerate(bad, brief, board, body.version ?? 1, `Generated in the “${art.name}” direction`, art);
    return r.fulfill({ json: { usage: usage('generate', 'premium'), artDirection: art, spec, placeholders: V.placeholdersIn(spec) } });
  }
  return r.fallback();
});

const overflowAt = async (w) => {
  await page.setViewportSize({ width: w, height: w < 600 ? 844 : 900 });
  await page.waitForTimeout(350);
  return page.evaluate(() => document.scrollingElement.scrollWidth - innerWidth);
};
const shootAll = async (name) => {
  for (const w of WIDTHS) {
    const over = await overflowAt(w);
    ok(`${name} at ${w} px: nothing scrolls sideways`, over <= 0, `${over}px`);
    await page.screenshot({ path: `${S}ui-${name}-${w}.png` });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(300);
};

await page.goto(BASE + '/ux-v0', { waitUntil: 'networkidle' });
await page.locator('.v0-intent-line textarea').fill(WORDS);
await page.getByRole('button', { name: 'Begin' }).click();
await page.waitForSelector('.v0-question', { timeout: 20000 });
await page.waitForTimeout(1200);
await shootAll('1-questions');
for (let i = 0; i < 3; i++) await page.locator('.v0-tile .sb-link', { hasText: /^Keep$/ }).first().click().catch(() => {});
await page.getByRole('button', { name: 'Regular members, on their phones' }).click();
await page.waitForSelector('text=Enough to write the brief', { timeout: 10000 });
await page.getByRole('button', { name: /Write the brief/ }).first().click();
await page.waitForSelector('#bp-intent', { timeout: 15000 });
await page.waitForTimeout(800);
const what = await page.locator('#bp-intent').innerText();
ok('the brief opens with what is being made: a booking screen, its task and what it must let people do', /What it is/i.test(what) && (await page.locator('#bp-intent select').inputValue()) === 'booking' && /book/i.test(what), what.slice(0, 200));
await page.locator('#bp-intent').scrollIntoViewIfNeeded();
await shootAll('2-brief');
await page.getByRole('button', { name: 'Approve and choose a direction' }).click();
await page.waitForSelector('.v0-dir', { timeout: 15000 });
await page.waitForTimeout(2500);
const studies = page.frameLocator('.v0-dir iframe');
ok('three directions, each with its study', (await page.locator('.v0-dir').count()) === 3);
await shootAll('3-direction');
await page.locator('.v0-dir').first().getByRole('button', { name: 'Use this direction' }).click();
await page.waitForSelector('iframe.v0-frame', { timeout: 40000 });
await page.waitForTimeout(3500);
const fr = () => page.frames().find((f) => f.url() === 'about:srcdoc' && f.parentFrame() === page.mainFrame());
const frame = page.frameLocator('iframe.v0-frame');
ok('the generated design is the booking itself: no "Begin", no "Read more"', (await frame.locator('[data-ux-booking]').count()) === 1 && !(await frame.locator('text=/^(Begin|Read more)$/').count()));
await shootAll('4-canvas');
// the booking works on the canvas: choose a time, confirm
await page.getByRole('radio', { name: 'None' }).click().catch(() => {});
await frame.locator('.bk-times:not([hidden]) .bk-slot:not(.is-full)').first().click().catch(() => {});
// select the booking's title, open the selection rail
await page.getByRole('radio', { name: 'Element' }).click().catch(() => {});
await frame.locator('.bk-title').click();
await page.waitForSelector('.v0-sel', { timeout: 8000 }).catch(() => {});
await page.getByRole('tab', { name: 'Selection' }).click();
await page.waitForSelector('.v0-edit', { timeout: 8000 });
ok('the selection rail offers this section to change directly', (await page.locator('.v0-edit').count()) === 1 && (await page.locator('.v0-edit textarea').inputValue()).length > 0);
await shootAll('5-editor');
const variantBefore = await page.locator('.v0-edit select').inputValue();
const options = await page.locator('.v0-edit select option').evaluateAll((os) => os.map((o) => o.value));
const nextVariant = options.find((v) => v !== variantBefore && v !== 'immersive');
await page.locator('.v0-edit select').selectOption(nextVariant);
await page.waitForTimeout(1500);
ok(`a layout change applies at once (${variantBefore} → ${nextVariant}), with Undo`, (await frame.locator(`.bk-${nextVariant}`).count()) === 1 && (await page.getByRole('button', { name: 'Undo' }).count()) > 0);
await page.locator('.v0-lock').click();
await page.waitForTimeout(800);
ok('locking the section: said, and its controls are off', (await page.locator('.v0-lock').getAttribute('aria-pressed')) === 'true' && (await page.locator('.v0-edit select').isDisabled()));
await page.screenshot({ path: `${S}ui-6-locked-1440.png` });
// the cost panel: by stage, measured, and per accepted design
await page.setViewportSize({ width: 1440, height: 900 });
await page.locator('.v0-cost > summary').click();
await page.waitForTimeout(400);
const cost = await page.locator('.v0-cost-panel').innerText();
ok('the cost panel shows each stage, premium calls and the per-design line', /Generation/.test(cost) && /Art direction/.test(cost) && /Questions/.test(cost) && /accepted design/.test(cost), cost);
await page.screenshot({ path: `${S}ui-7-cost-1440.png` });
ok('no errors in the page', !errs.length, errs.join(' | '));
await b.close();
console.log(`\nui qa: ${pass} passed, ${fail} failed (screenshots in ${S})`);
process.exit(fail ? 1 : 0);
