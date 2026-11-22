// test/browser/ux-v0/ui-qa.mjs — SocriaUX's own interface, through a booking project, at five widths.
//
// Drives the real app (model and image libraries scripted in the browser, as workflow-a-create.mjs does; the
// scripted model answers with the code's own results so the screens are what the routes would return):
// a booking screen asked for → a question → the one layout question, answered by its sketch → the Living Brief,
// opening with "What it is", its layout decisions said with where they came from and one changed → three
// directions, each composing the booking differently and all keeping what the designer decided → generation →
// the canvas, with the section editor (a setting and a layout changed, the section locked) and the cost panel. At 1440, 1280, 1024, 768 and 390 px it checks that nothing scrolls
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
let turns = 0;
// what reached the model routes, for the checks that none did (an edit done in code) or only one did (a double-click)
const hits = { generate: 0, refine: 0 };
// an operation record as the route sends it (lib/ux-v0/stage-server.ts): numbers and labels only
const record = (stage, model, tier, totalMs) => V.normalizeRecord({ op: `op_${stage}_${Date.now().toString(36)}`, stage, operation: stage, provider: 'openai', model, api: tier === 'premium' ? 'responses' : 'chat', tier, effort: tier === 'premium' ? 'medium' : 'default', input: 3300, cached: 2000, output: 1400, reasoning: tier === 'premium' ? 1000 : 0, cost: tier === 'premium' ? 0.0213 : 0.0007, startedAt: Date.now(), queuedMs: 140, ttftMs: Math.round(totalMs * 0.8), modelMs: totalMs - 160, totalMs, retries: 0, outcome: 'ok', cancelled: false });
// as the discover route does: the model's turn, then SocriaUX's own layout question (lib/ux-v0/discovery.ts)
const turn = (body, result) => ({ ...V.withLayoutQuestion({ queries: [], palettes: [], type: [], note: '', ...result }, { intent: body.intent, questions: V.normalizeDiscovery({ questions: body.questions }).questions, understanding: result.understanding, moodboard: V.normalizeMoodboard(body.moodboard), remark: body.remark ?? '' }), usage: usage('discover', 'economy') });
await ctx.route('**/api/ux-v0/**', async (r) => {
  const url = r.request().url();
  const body = JSON.parse(r.request().postData() || '{}');
  if (url.endsWith('/discover')) {
    turns++;
    if (!body.questions?.some((q) => q.answer)) return r.fulfill({ json: turn(body, { understanding: { summary: 'A booking screen for a small yoga studio.', known: { objective: 'Let members book a time for a class' }, gaps: ['audience'] }, questions: [{ id: 'q_a', topic: 'audience', question: 'Who books here, and on what?', why: 'It decides how much the screen explains.', options: ['Regular members, on their phones', 'New students, on a laptop'], answer: '', delegated: false }], queries: [{ category: 'imagery', query: 'yoga studio morning light' }, { category: 'texture', query: 'linen clay' }, { category: 'composition', query: 'calm grid' }], ready: false }) });
    return r.fulfill({ json: turn(body, { understanding: { summary: 'A booking screen for regular members of a small yoga studio, mostly on phones.', known: { objective: 'Let members book a time for a class', audience: 'Regular members, on their phones' }, gaps: [] }, questions: [], ready: true, note: 'Enough to write the brief.' }) });
  }
  if (url.endsWith('/images')) return r.fulfill({ json: { results: body.queries.map((q) => ({ ...q, refs: (LIB[q.category] ?? []).filter((x) => !body.seen.includes(x.id)).slice(0, body.per).map((x) => ({ ...x, query: q.query })), provider: 'openverse', error: '' })) } });
  if (url.endsWith('/brief')) {
    const kept = (body.moodboard?.refs ?? []).filter((x) => x.state === 'kept').map((x) => x.id);
    const parsed = V.normalizeBrief({ pageType: 'website', platform: 'web', objective: 'Let regular members book a time for their yoga class in a few taps, and know it is booked.', audience: 'Regular members of a small yoga studio, mostly on their phones between other things', userGoals: ['Choose a day and a time', 'See how many places are left', 'Confirm and get on with the day'], functionalRequirements: ['Full classes cannot be chosen'], personality: ['warm', 'calm', 'unhurried'], visualDirection: 'Warm, earthy, muted terracotta and cream; quiet type; nothing loud', palette: [{ hex: '#f4ede4', role: 'background' }, { hex: '#2b211b', role: 'text' }, { hex: '#b4552d', role: 'accent' }, { hex: '#ffffff', role: 'accent-text' }], typography: { display: 'Fraunces', body: 'Inter', rationale: 'A soft serif over a plain sans.' }, references: kept, openQuestions: [] }, new Set(kept));
    const intent = V.settleIntent(V.designerWords(body.intent, body.questions ?? []), { current: body.current?.intent ?? null });
    const qs = V.normalizeDiscovery({ questions: body.questions }).questions;
    const layout = V.settleLayout(V.designerWords(body.intent, qs, body.instruction ?? ''), qs, V.normalizeBrief(body.current)?.layout, intent, body.instruction ?? '');
    // as the route does: a design system the designer attached stays attached through a rewrite
    const drafted = { ...parsed, intent, pageType: V.pageTypeFor(intent, parsed.pageType), ...(layout ? { layout } : {}) };
    const system = V.normalizeBrief(body.current)?.system;
    briefSent = system ? V.briefWithSystem(drafted, system) : drafted;
    return r.fulfill({ json: { usage: usage(body.action === 'refine' ? 'refine-brief' : 'brief', 'economy'), brief: briefSent, queries: [] } });
  }
  if (url.endsWith('/direct')) {
    const ask = { ...body, brief: V.normalizeBrief(body.brief), base: body.base ? V.normalizeDirection(body.base) : null };
    return r.fulfill({ json: { usage: usage('art-direction', 'premium'), options: V.proposeDirections(ask) } });
  }
  if (url.endsWith('/generate')) {
    hits.generate++;
    // a generation takes a moment, so the working strip (and a second press) can be seen
    await new Promise((res) => setTimeout(res, 1500));
    // what the route makes of the answer that caused the original failure: a landing page about the studio
    const brief = V.normalizeBrief(body.brief) ?? briefSent;
    const board = V.normalizeMoodboard(body.moodboard);
    const art = body.artDirection ? V.normalizeDirection(body.artDirection) : V.autoDirection(brief);
    const bad = { title: 'Lotus Yoga', sections: [{ id: 'nav', kind: 'nav', content: { brand: 'Lotus', links: ['About'], cta: 'Begin' } }, { id: 'hero', kind: 'hero', content: { title: 'Find your flow', primary: 'Begin', secondary: 'Read more' } }, { id: 'why', kind: 'features', content: { title: 'Why us', items: [{ title: 'Calm', text: 'x' }, { title: 'Warm', text: 'y' }] } }, { id: 'foot', kind: 'footer', content: { brand: 'Lotus' } }] };
    const spec = V.parseGenerate(bad, brief, board, body.version ?? 1, `Generated in the “${art.name}” direction`, art);
    return r.fulfill({ json: { usage: usage('generate', 'premium'), artDirection: art, spec, placeholders: V.placeholdersIn(spec), telemetry: record('generate', 'gpt-6.1-sol', 'premium', 31300) } });
  }
  if (url.endsWith('/refine')) {
    // a change only the model can read: slow enough to be cancelled
    hits.refine++;
    await new Promise((res) => setTimeout(res, 6000));
    return r.fulfill({ json: { understood: 'A more editorial layout.', challenge: '', question: '', regenerate: '', patch: { op: 'none', summary: '' }, applies: false, error: '', usage: usage('refine', 'premium'), telemetry: record('refine', 'gpt-6.1-sol', 'premium', 6000) } }).catch(() => {});
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
    if (/canvas/.test(name)) {
      // the design is in view: a stage tall enough to work on, the page fitted across it
      await page.waitForTimeout(400);
      const vis = await page.evaluate(() => {
        const st = document.querySelector('.v0-stage');
        const fr = document.querySelector('iframe.v0-frame');
        if (!st || !fr) return null;
        const s = st.getBoundingClientRect();
        const f = fr.getBoundingClientRect();
        return { stageH: Math.round(s.height), stageW: Math.round(s.width), inW: Math.round(Math.max(0, Math.min(s.right, f.right) - Math.max(s.left, f.left))), frameW: Math.round(f.width) };
      });
      ok(`${name} at ${w} px: the stage is tall enough, and the design fits across it`, vis && vis.stageH >= 280 && vis.inW >= Math.min(vis.frameW, vis.stageW) - 2, JSON.stringify(vis));
    }
    await page.screenshot({ path: `${S}ui-${name}-${w}.png` });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(300);
};

await page.goto(BASE + '/ux-v0', { waitUntil: 'networkidle' });
await page.locator('.v0-intent-line textarea').fill(WORDS);
await page.getByRole('button', { name: 'Begin' }).click();
// the studio's conversation comes first; the model-led website workspace is its own way in from it
await page.waitForSelector('.sd-conv', { timeout: 15000 });
if (!(await page.getByRole('button', { name: 'Plan it in the workspace' }).isVisible())) await page.getByRole('button', { name: /Decisions/ }).click();
await page.getByRole('button', { name: 'Plan it in the workspace' }).click();
await page.waitForSelector('.v0-question', { timeout: 20000 });
await page.waitForTimeout(1200);
await shootAll('1-questions');
for (let i = 0; i < 3; i++) await page.locator('.v0-tile .sb-link', { hasText: /^Keep$/ }).first().click().catch(() => {});
await page.getByRole('button', { name: 'Regular members, on their phones' }).click();
// the one layout question: what someone sees first, each answer a sketch in the designer's words, and "You decide"
await page.waitForSelector('.st-sketches', { timeout: 10000 });
await page.waitForTimeout(600);
const plates = await page.locator('.st-sketch').allInnerTexts();
ok('the layout question is answered with sketches: three answers in the designer\'s words, and "You decide"', plates.length === 4 && /The times to choose from/.test(plates[0]) && /The yoga class itself/.test(plates[1]) && /You decide/.test(plates[3]) && (await page.locator('.st-sketch svg.ls').count()) === 4, JSON.stringify(plates));
ok('…each sketch carries the designer\'s own words', /yoga class/i.test(await page.locator('.st-sketch').nth(1).locator('svg').innerHTML()));
await shootAll('1b-layout-question');
const turnsBefore = turns;
await page.locator('.st-sketch-pick', { hasText: 'The yoga class itself' }).click();
await page.waitForSelector('text=Enough to write the brief', { timeout: 10000 });
ok('answering it after the questions were done costs no further turn', turns === turnsBefore, `${turns - turnsBefore} more`);
await page.getByRole('button', { name: /Write the brief/ }).first().click();
await page.waitForSelector('#bp-intent', { timeout: 15000 });
await page.waitForTimeout(800);
const what = await page.locator('#bp-intent').innerText();
ok('the brief opens with what is being made: a booking screen, its task and what it must let people do', /What it is/i.test(what) && (await page.locator('#bp-intent select').inputValue()) === 'booking' && /book/i.test(what), what.slice(0, 200));
await page.locator('#bp-intent').scrollIntoViewIfNeeded();
await shootAll('2-brief');
// how it is laid out: the decisions, sketched, each said with where it came from, and one changed
const lay = page.locator('#bp-layout');
await lay.scrollIntoViewIfNeeded();
const said = await lay.locator('.st-layout-said').innerText();
ok('the brief says what comes first and where it came from (the answer), and what is left open', /What comes first: the yoga class itself, from your answer/.test(said) && /left open/.test(said), said);
ok('…with its sketch, named for what it shows', /yoga class itself first/.test((await lay.locator('svg.ls').getAttribute('aria-label')) ?? ''));
await lay.getByLabel('Alignment').selectOption('center');
await page.waitForTimeout(400);
ok('alignment set in the brief: said as the designer\'s own', /Alignment: centred, as you set it/.test(await lay.locator('.st-layout-said').innerText()));
await lay.getByLabel('Alignment').selectOption('');
await page.waitForTimeout(300);
ok('"SocriaUX decides" leaves it open again', !/Alignment: centred/.test(await lay.locator('.st-layout-said').innerText()));
await page.screenshot({ path: `${S}ui-2b-brief-layout-1440.png` });
// the designer's own design system, from its files (read in the browser), built within from here on
const sys = page.locator('#bp-system');
await sys.scrollIntoViewIfNeeded();
ok('the brief offers to build within the designer’s own design system (files, or a GitHub repository)', /design system/i.test(await sys.innerText()) && (await sys.locator('input[type="file"]').count()) === 1 && (await sys.getByRole('button', { name: 'Read from GitHub' }).count()) === 1);
const TOKENS = ':root { --color-primary: #0f766e; --color-background: #f8fafc; --color-surface: #ffffff; --color-text: #0f172a; --color-muted: #475569; --color-border: #cbd5e1; --font-heading: "Söhne Breit", sans-serif; --font-body: Inter, sans-serif; --radius-md: 6px; }';
await sys.locator('input[type="file"]').setInputFiles([{ name: 'tokens.css', mimeType: 'text/css', buffer: Buffer.from(TOKENS) }, { name: 'README.md', mimeType: 'text/markdown', buffer: Buffer.from('# Tidewater\n\n## Rules\n- Never use more than one accent per screen\n') }]);
await page.waitForSelector('#bp-system.is-on', { timeout: 8000 });
const sysText = await page.locator('#bp-system').innerText();
ok('…attached: its name, its colours by role, its faces (one drawn with the closest SocriaUX can serve, and said), its rules', /Tidewater/.test(sysText) && /#0f766e/i.test(sysText) && /Söhne Breit/.test(sysText) && /1 rule/.test(sysText), sysText.slice(0, 400));
await page.locator('#bp-system').screenshot({ path: `${S}ui-2c-design-system-1440.png` });
await page.getByRole('button', { name: 'Approve and set the Creative DNA' }).click();
// THE CREATIVE DNA: SocriaUX's reading of the brief, each dimension in a word with where it came from, a lock each,
// a study drawn from it; set one, lock another; then on to the directions (one click for whoever delegates)
await page.waitForSelector('.dna-studio', { timeout: 15000 });
await page.waitForTimeout(1800);
const dnaDims = await page.locator('.dna-dim').count();
ok('the Creative DNA step: every dimension in a word, with where it came from and a lock of its own', dnaDims >= 6 && (await page.locator('.dna-lock').count()) === dnaDims && (await page.locator('.dna-src').count()) === dnaDims && (await page.locator('.dna-dim-word').allInnerTexts()).every((t) => t.trim().length > 2), dnaDims);
ok('…a study drawn from it by the renderer the design will use', (await page.locator('.dna-specimen iframe').count()) === 1 && ((await page.locator('.dna-specimen iframe').getAttribute('srcdoc')) ?? '').length > 2000);
await shootAll('2d-dna');
const compDim = page.locator('.dna-dim', { has: page.locator('label', { hasText: /^Composition$/ }) });
const compWordBefore = await compDim.locator('.dna-dim-word').innerText();
const studyBefore = (await page.locator('.dna-specimen iframe').getAttribute('srcdoc')) ?? '';
await compDim.locator('input[type="range"]').focus();
await page.keyboard.press('End');
await page.waitForTimeout(900);
ok('a dimension set by keyboard: its word changes and it is said to be the designer’s', (await compDim.locator('.dna-dim-word').innerText()) !== compWordBefore && /Set by you/.test(await compDim.locator('.dna-src').innerText()), await compDim.innerText());
ok('…and the study redraws from it', ((await page.locator('.dna-specimen iframe').getAttribute('srcdoc')) ?? '') !== studyBefore);
const motionDim = page.locator('.dna-dim', { has: page.locator('label', { hasText: /^Motion$/ }) });
await motionDim.locator('.dna-lock').click();
await page.waitForTimeout(300);
ok('a lock: pressed, and said', (await motionDim.locator('.dna-lock').getAttribute('aria-pressed')) === 'true' && /1 locked/.test(await page.locator('.dna-summary').innerText()));
await page.screenshot({ path: `${S}ui-2e-dna-set-1440.png` });
await page.getByRole('button', { name: 'Explore directions' }).click();
await page.waitForSelector('.v0-dir', { timeout: 15000 });
await page.waitForTimeout(2500);
ok('the directions say the DNA they are drawn from, and what each explores', (await page.locator('.ad-dna-strip').count()) === 1 && (await page.locator('.ad-dna').count()) === 3 && /your Creative DNA as it is/i.test(await page.locator('.ad-dna').first().innerText()));
await page.locator('.ad-compare > summary').click();
await page.waitForTimeout(300);
const cmpRows = await page.locator('.ad-compare-t tbody tr').count();
ok('…and how they differ, side by side: six aspects, each said for each direction', cmpRows === 6 && (await page.locator('.ad-compare-t tbody tr').first().locator('td').count()) === 3, cmpRows);
await page.locator('.ad-compare').screenshot({ path: `${S}ui-3a-compare-1440.png` });
await page.locator('.ad-compare > summary').click();
const studies = page.frameLocator('.v0-dir iframe');
ok('three directions, each with its study', (await page.locator('.v0-dir').count()) === 3);
const splits = [];
for (let i = 0; i < 3; i++) splits.push(await page.frameLocator('.v0-dir iframe').nth(i).locator('.bk-split').count());
ok('…all three keep what the designer decided: the class first (its card beside the times)', splits.every((n) => n === 1), JSON.stringify(splits));
// each direction's plan, critiqued before it was shown
const plans = await page.locator('.ad-plan').allInnerTexts();
ok('each direction states its plan: one bold move, the detail only its subject has, its colours named', plans.length === 3 && plans.every((t) => /bold move/i.test(t) && /only this/i.test(t) && /colours/i.test(t)), JSON.stringify(plans.map((t) => t.slice(0, 200))));
const chips = await page.locator('.ad-plan').evaluateAll((els) => els.map((el) => [...el.querySelectorAll('.ad-plan-chip')].map((c) => getComputedStyle(c).backgroundColor)));
ok('…built within the design system: its accent and its ground among every direction’s named colours', chips.length === 3 && chips.every((xs) => xs.includes('rgb(15, 118, 110)') && xs.includes('rgb(248, 250, 252)')), JSON.stringify(chips));
await page.locator('.ad-plan').first().screenshot({ path: `${S}ui-3b-plan-1440.png` });
await shootAll('3-direction');
// combining two: keep the first, take the second's type and motion — a direction of its own, beside the others
await page.locator('.ad-combine > summary').click();
const combine = page.locator('.ad-combine');
await combine.locator('label', { hasText: /^Type$/ }).click();
await combine.locator('label', { hasText: /^Motion$/ }).click();
await combine.getByRole('button', { name: 'Combine them' }).click();
await page.waitForTimeout(800);
const dirNames = await page.locator('.v0-dir').evaluateAll((els) => els.map((e) => e.innerText.split('\n').slice(0, 3).join(' ')));
ok('combining two directions makes a fourth beside them, named for both, its type and motion the second’s', (await page.locator('.v0-dir').count()) === 4 && dirNames.some((t) => / × /.test(t)) && /Combined by hand — the type and motion of/i.test(await page.locator('.v0-dir').nth(1).locator('.ad-dna-text').innerText()), JSON.stringify(dirNames).slice(0, 400));
await page.locator('.ad-combine').screenshot({ path: `${S}ui-3d-combine-1440.png` }).catch(() => {});
await page.locator('.v0-dir').first().getByRole('button', { name: 'Use this direction' }).dblclick();
await page.waitForSelector('.v0-workstrip', { timeout: 4000 }).catch(() => {});
const strip = (await page.locator('.v0-workstrip').count()) ? await page.locator('.v0-workstrip').innerText() : '';
ok('the working strip appears at once: what is happening, how long so far, and a way to cancel it', /Designing in the “/.test(strip) && /\d+ s/.test(strip) && (await page.locator('.v0-workstrip').getByRole('button', { name: 'Cancel' }).count()) === 1, strip);
await page.locator('.v0-workstrip').screenshot({ path: `${S}ui-3c-working-1440.png` }).catch(() => {});
await page.waitForSelector('iframe.v0-frame', { timeout: 40000 });
ok('"Use this direction" pressed twice: one generation asked for', hits.generate === 1, hits.generate);
await page.waitForTimeout(3500);
const fr = () => page.frames().find((f) => f.url() === 'about:srcdoc' && f.parentFrame() === page.mainFrame());
const frame = page.frameLocator('iframe.v0-frame');
ok('the generated design is the booking itself: no "Begin", no "Read more"', (await frame.locator('[data-ux-booking]').count()) === 1 && !(await frame.locator('text=/^(Begin|Read more)$/').count()));
const confirmColours = await frame.locator('[data-ux-confirm]').evaluate((e) => { const c = getComputedStyle(e); return `${c.backgroundColor} ${c.borderColor} ${c.color}`; });
ok('…drawn in the design system’s own accent', /rgb\(15, 118, 110\)/.test(confirmColours), confirmColours);
await shootAll('4-canvas');
// the canvas's Checks: the design's own DNA against the project's, and the Originality Audit (no model asked)
await page.getByRole('tab', { name: /^Checks/ }).click();
await page.waitForSelector('.orig', { timeout: 8000 }).catch(() => {});
await page.waitForTimeout(600);
const origText = (await page.locator('.orig').count()) ? await page.locator('.orig').innerText() : '';
ok('Checks shows the Originality Audit: four scores, what was found (or that nothing generic was), read in code', (await page.locator('.orig-score').count()) === 4 && /Its own/.test(origText) && /no model asked/.test(origText), origText.slice(0, 300));
ok('…and the design’s Creative DNA against the project’s, with how faithfully it keeps it', (await page.locator('.dna-canvas .dna-glyph').count()) === 1 && /keeps your DNA at \d+ of 100/.test(await page.locator('.dna-canvas').innerText()));
await page.locator('.v0-rail').screenshot({ path: `${S}ui-4b-checks-1440.png` }).catch(() => {});
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
// a setting of how the booking is set: only those its layout draws, applied at once
const settings = await page.locator('.v0-edit .v0-edit-l').allInnerTexts();
ok('the editor offers the booking\'s own settings (side, times, your choice, proportion…)', ['Side', 'Times', 'Your choice'].every((x) => settings.some((t) => t.startsWith(x))) && settings.some((t) => t.startsWith('Proportion')), JSON.stringify(settings));
const timesRow = page.locator('.v0-edit [role="group"][aria-label="Times"]');
const timesNow = await timesRow.locator('[aria-pressed="true"]').innerText();
const timesNext = timesNow === 'Rows' ? 'Pills' : 'Rows';
await timesRow.getByRole('button', { name: timesNext }).click();
await page.waitForTimeout(1200);
ok(`a setting applies at once (times as ${timesNext.toLowerCase()}), with Undo`, (await frame.locator(`.sx-booking.sh-times-${timesNext.toLowerCase()}`).count()) === 1 && (await page.getByRole('button', { name: 'Undo' }).count()) > 0);
const range = page.locator('.v0-edit input[type="range"]').first();
const ratioBefore = await frame.locator('.sx-booking').getAttribute('style');
await range.focus();
await page.keyboard.press('ArrowRight');
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(1200);
ok('a proportion moved by keyboard applies when let go', (await frame.locator('.sx-booking').getAttribute('style')) !== ratioBefore, ratioBefore);
await page.screenshot({ path: `${S}ui-5b-settings-1440.png` });
const variantBefore = await page.locator('.v0-edit select').inputValue();
const options = await page.locator('.v0-edit select option').evaluateAll((os) => os.map((o) => o.value));
const nextVariant = options.find((v) => v !== variantBefore && v !== 'immersive');
await page.locator('.v0-edit select').selectOption(nextVariant);
await page.waitForTimeout(1500);
ok(`a layout change applies at once (${variantBefore} → ${nextVariant}), with Undo`, (await frame.locator(`.bk-${nextVariant}`).count()) === 1 && (await page.getByRole('button', { name: 'Undo' }).count()) > 0);
// at other widths: a decision for phones, applied as a version, the desktop as it was
const bp = page.locator('.v0-edit-bp');
ok('the editor has the part’s rules at other widths', (await bp.count()) === 1 && /At other widths/.test(await bp.innerText()));
await bp.getByRole('radio', { name: 'Phone' }).click();
await bp.locator('[role="group"][aria-label="Words"]').getByRole('button', { name: 'Centred' }).click();
await page.waitForTimeout(1200);
ok('a rule for phones applies as a version, said beside the controls; the desktop untouched', /On phones: centred/.test(await page.locator('.v0-edit-bp').innerText()) && (await frame.locator('.sx-booking.rs-m-center').count()) === 1 && (await frame.locator('.sx-booking').evaluate((e) => getComputedStyle(e).textAlign)) !== 'center' && (await page.getByRole('button', { name: 'Undo' }).count()) > 0, await page.locator('.v0-edit-bp').innerText());
await page.locator('.v0-edit-bp').screenshot({ path: `${S}ui-5c-widths-1440.png` }).catch(() => {});
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
await page.locator('.v0-diag > summary').click();
await page.waitForTimeout(300);
const diag = await page.locator('.v0-diag').innerText();
ok('the diagnostics list each call as the server recorded it and the browser measured it: model, tokens (cached, reasoning), times, how it ended', /generate/.test(diag) && /gpt-6\.1-sol/.test(diag) && /\(2,000\)/.test(diag) && /\(1,000\)/.test(diag) && /31\.\d/.test(diag) && /ok/.test(diag), diag.slice(0, 400));
await page.locator('.v0-cost-panel').screenshot({ path: `${S}ui-7b-diagnostics-1440.png` }).catch(() => {});
await page.locator('.v0-cost > summary').click();
// an everyday edit: done in code, no model asked — here asked about first, since black is not in the design system
await page.keyboard.press('Escape');
const composer = page.locator('.v0-composer textarea, .v0-compose textarea').first();
await composer.fill('Change the button color to black');
const refineBefore = hits.refine;
const quickT0 = Date.now();
await composer.press('Enter');
await page.waitForSelector('.v0-notice', { timeout: 4000 }).catch(() => {});
const quickNotice = await page.locator('.v0-notice').innerText().catch(() => '');
ok('"change the button colour to black": read in code, no model asked, and asked about first (black is not in the design system)', hits.refine === refineBefore && /not in your design system \(Tidewater\)/.test(quickNotice) && (await page.getByRole('button', { name: 'Apply anyway' }).count()) === 1, quickNotice);
await page.getByRole('button', { name: 'Apply anyway' }).click();
await page.waitForTimeout(900);
const black = await frame.locator('[data-ux-confirm]').evaluate((e) => getComputedStyle(e).backgroundColor);
ok(`…applied at once (${Date.now() - quickT0} ms from Enter, the question included), the action now black, with Undo`, black === 'rgb(0, 0, 0)' && (await page.getByRole('button', { name: 'Undo' }).count()) > 0, black);
await page.screenshot({ path: `${S}ui-8-quick-edit-1440.png` });
// the Type panel: headlines in capitals, a real look patch — asked about first when the type is kept or locked
await page.locator('details.v0-adjust > summary', { hasText: /^Type$/ }).click();
const typePanel = page.locator('.tp');
const typeLabels = await typePanel.locator('.mp-l').allInnerTexts();
ok('the Type panel offers the faces, the case, the tracking and the scale', (await typePanel.count()) === 1 && ['Headlines', 'Text', 'Case', 'Tracking', 'Scale'].every((l) => typeLabels.includes(l)) && (await typePanel.locator('select').count()) >= 2, JSON.stringify(typeLabels));
await typePanel.locator('[role="group"][aria-label="Case"]').getByRole('button', { name: 'Capitals' }).click();
await page.waitForTimeout(500);
if (await page.getByRole('button', { name: 'Apply anyway' }).count()) await page.getByRole('button', { name: 'Apply anyway' }).click();
await page.waitForTimeout(1200);
const caps = await frame.locator('.h-section, .h-hero').first().evaluate((e) => getComputedStyle(e).textTransform);
ok('headlines set in capitals from the Type panel, with Undo', caps === 'uppercase' && (await page.getByRole('button', { name: 'Undo' }).count()) > 0, caps);
await page.locator('.tp').screenshot({ path: `${S}ui-8b-type-1440.png` }).catch(() => {});
await page.locator('details.v0-adjust > summary', { hasText: /^Type$/ }).click();
// a change only the model can read, cancelled: the model is stopped and the canvas is exactly as it was
const versionBefore = await page.locator('.v0-version, [data-version]').first().innerText().catch(() => '');
const htmlBefore = await frame.locator('body').innerHTML();
await composer.fill('Rework the whole layout so it reads as an editorial report');
await composer.press('Enter');
await page.waitForSelector('.v0-workstrip', { timeout: 4000 });
ok('a change that needs the model shows the working strip', /Working out the change/.test(await page.locator('.v0-workstrip').innerText()));
await page.locator('.v0-workstrip').getByRole('button', { name: 'Cancel' }).click();
await page.waitForTimeout(500);
const cancelNotice = await page.locator('.v0-notice').innerText().catch(() => '');
ok('cancelled: said plainly, the strip gone, and the design exactly as it was', /Cancelled\. Nothing changed\./.test(cancelNotice) && (await page.locator('.v0-workstrip').count()) === 0 && (await frame.locator('body').innerHTML()) === htmlBefore && (await page.locator('.v0-version, [data-version]').first().innerText().catch(() => '')) === versionBefore, cancelNotice);
await page.screenshot({ path: `${S}ui-9-cancelled-1440.png` });
ok('no errors in the page', !errs.length, errs.join(' | '));
await b.close();
console.log(`\nui qa: ${pass} passed, ${fail} failed (screenshots in ${S})`);
process.exit(fail ? 1 : 0);
