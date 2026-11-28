// test/browser/ux-v0/studio-qa.mjs — the spatial creative brief in the built app, driven as a person would: an idea,
// the brief that forms around it, the person shaping it in place, and the work made from it.
//
//   the home        one composer; words read live
//   no chat         no message bubbles, no transcript: the idea at the top (editable), what is understood beside it,
//                   the considerations open now placed in the working area, one short line from SocriaUX
//   the model       the questions route scripted with plans (lib/ux-v0/studio/discover-model.ts): what it is sent (the
//                   idea, every consideration with its status and answer, notes, the latest change, the brief); what it
//                   returns lands in place — kept, retired, added — without rebuilding the page
//   tests 1–9       a vague poster (the most relevant opening consideration); a detailed brief (nothing to answer,
//                   Generate at once); colour (real swatches, a colour of their own, a pick whose colours are changed in
//                   place); lettering (real faces, loaded and fitted); a dreamy cloud poster (atmospheres for it); an
//                   unusual answer in words; playful changed to sophisticated (superseded preference gone, the rest
//                   kept); Generate before answering anything; a logo, a website and a campaign each shaped differently
//   in place        the idea edited, a line of what is understood rewritten (theirs from then on), a pick taken back, a
//                   settled consideration changed again, SocriaUX's reading kept or turned down, a note taken back
//   signed out      the reader's own brief (what it is, a logo's name, what it is for) — and Generate always works
//   and             a reload keeps the brief; a phone's width with Generate docked; no generation route called, no
//                   outside host reached, no page errors
// Every outcome is read back from the browser's own store (IndexedDB) as well as from the page.
//
//   UXV0_FORWARD=1 UXV0_BASE=http://127.0.0.1:3100 node test/browser/ux-v0/studio-qa.mjs
import { chromium, S, BASE } from './env.mjs';

let pass = 0;
let fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok  ', n)) : (fail++, console.log('  FAIL', n, String(x).slice(0, 700))));
const errors = [];
const modelCalls = [];
const questionCalls = [];
const outside = new Set();
const read = [];
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|favicon|Clerk|Content Security Policy|ERR_TUNNEL|ERR_PROXY/.test(m.text()) && errors.push(`console: ${m.text().slice(0, 300)}`));
page.on('request', (r) => {
  const u = new URL(r.url());
  if (/\/api\/ux-v0\/(generate|refine|brief|discover|direct|critique|images|art)\b/.test(r.url())) modelCalls.push(r.url());
  if (u.origin !== new URL(BASE).origin && /^https?:$/.test(u.protocol)) outside.add(u.host);
});

// the server's reader, recorded
const LARKFIELD = {
  read: { url: 'https://larkfield.studio/', host: 'larkfield.studio', title: 'Larkfield Bakery', description: 'Sourdough, baked at dawn.', colours: ['#f6f1e7', '#2b2118', '#b4532a', '#e7dccb'], ground: '#f6f1e7', ink: '#2b2118', accent: '#b4532a', fonts: ['Fraunces', 'Inter'], notes: ['a light ground', 'a warm accent', 'serif headings'] },
  preview: '<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'"><style>body{margin:0;background:#f6f1e7;color:#2b2118;font:20px Georgia,serif}h1{font-size:96px;margin:120px 80px 0}</style></head><body><h1>Larkfield Bakery</h1></body></html>',
};
await ctx.route('**/api/ux-v0/reference', async (route) => {
  const { url } = JSON.parse(route.request().postData() || '{}');
  read.push(url);
  if (/larkfield/.test(url)) return route.fulfill({ json: LARKFIELD });
  return route.fulfill({ status: 422, json: { error: 'The site did not answer.' } });
});

// the questions route, scripted with plans: signed out by default (as it really is here); where a scenario asks, the
// model's plans in turn, in the shape the route sends them
let model = { mode: 'signed-out', plans: [], delay: 0 };
await ctx.route('**/api/ux-v0/studio-questions', async (route) => {
  const body = JSON.parse(route.request().postData() || '{}');
  questionCalls.push(body.context ?? null);
  if (model.mode === 'signed-out') return route.fulfill({ status: 401, json: { error: 'Sign in to use SocriaUX’s reasoning.', signIn: true } });
  const next = model.plans.shift();
  if (model.delay) await new Promise((r) => setTimeout(r, model.delay));
  if (!next) return route.fulfill({ status: 503, json: { error: 'No scripted plan.' } });
  // as the real route does: what they picked comes back in the brief unless the plan let it go (brief.clear)
  const had = body.context?.brief?.chosen ?? {};
  const let_ = new Set(next.brief?.clear ?? []);
  next.brief = { ...next.brief, chosen: { ...Object.fromEntries(Object.entries(had).filter(([k]) => !let_.has(k))), ...(next.brief?.chosen ?? {}) } };
  delete next.brief.clear;
  return route.fulfill({ json: { plan: next } });
});
const brief = (over = {}) => ({ kind: '', purpose: '', audience: '', content: '', feel: '', explicit: [], implied: [], tentative: [], avoid: [], references: [], open: [], chosen: {}, ...over });
const mod = (id, topic, question, o = {}) => ({ id, topic, question, kind: o.kind ?? (o.aid ? o.aid.kind : o.options ? 'choice' : 'text'), lead: !!o.lead, options: o.options ?? [], placeholder: o.placeholder ?? '', aid: o.aid ?? null, status: 'open', answer: null });
const plan = (o = {}) => ({ note: o.note ?? '', ready: !!o.ready, modules: o.modules ?? [], answers: o.answers ?? [], retire: o.retire ?? [], brief: brief(o.brief), mode: o.mode ?? null, by: 'model' });

// the designer's route (signed out it is never reached)
const designCalls = [];
await ctx.route('**/api/ux-v0/design', async (route) => {
  designCalls.push(JSON.parse(route.request().postData() || '{}'));
  return route.fulfill({ status: 401, json: { error: 'Sign in', signIn: true } });
});

const shot = (name) => page.screenshot({ path: `${S}studio-${name}.png` });
const idb = (db, store, id) =>
  page.evaluate(
    ({ db, store, id }) =>
      new Promise((res, rej) => {
        const req = indexedDB.open(db);
        req.onsuccess = () => {
          if (!req.result.objectStoreNames.contains(store)) return res(id ? null : []);
          const s = req.result.transaction(store, 'readonly').objectStore(store);
          const g = id ? s.get(id) : s.getAll();
          g.onsuccess = () => res(g.result ?? null);
          g.onerror = () => rej(g.error);
        };
        req.onerror = () => rej(req.error);
      }),
    { db, store, id },
  );
const until = async (fn, ms = 12000) => {
  const t0 = Date.now();
  let v = null;
  while (Date.now() - t0 < ms) {
    v = await fn();
    if (v) return v;
    await page.waitForTimeout(150);
  }
  return v;
};
const pid = () => new URL(page.url()).searchParams.get('p');
const project = async () => (pid() ? idb('socria-ux-v0', 'projects', pid()) : null);
const studio = async () => (await project())?.studio ?? null;
const COMPOSER = 'textarea[aria-label="What do you want to make?"]';
const goHome = async () => {
  await page.goto(BASE + '/ux-v0', { waitUntil: 'networkidle' });
  await page.waitForSelector('.sd-home');
};
const begin = async (words) => {
  await page.fill(COMPOSER, words);
  await page.waitForTimeout(250);
  await page.getByRole('button', { name: 'Begin' }).click();
  await page.waitForSelector('.sbx, .dx, .v0-work', { timeout: 20000 });
};
/** The brief has taken the model's (or the reader's) latest plan. */
const settled = (calls) => until(async () => (questionCalls.length >= calls && !(await page.locator('.sbx-line.is-thinking').count()) && (await studio())?.space?.stale === false ? true : null), 15000);
const lastCall = () => questionCalls.at(-1);
/** A change the person makes, then the plan it asks for: waits for that request, not for what was stored before it. */
const then = async (fn) => {
  const n = questionCalls.length;
  await fn();
  await settled(n + 1);
};
const designed = () => page.waitForSelector('.dx', { timeout: 30000 });
const designBrief = async () => (await until(async () => ((await project())?.medium === 'design' ? project() : null), 20000))?.design?.memory?.brief ?? '';
const noChat = async () => (await page.locator('.sd-bubble, .sd-msg, .sd-transcript, .sd-chat').count()) === 0;
const answerIn = async (id, words) => {
  await page.fill(`#sbx-a-${id}`, words);
  await page.press(`#sbx-a-${id}`, 'Enter');
};

console.log('=== the home ===');
await goHome();
ok('one composer, with Begin', (await page.locator(COMPOSER).count()) === 1 && (await page.getByRole('button', { name: 'Begin' }).count()) === 1);
await shot('01-home');

console.log('\n=== test 1: a vague poster — a spatial brief, not a conversation ===');
const MOODS = {
  kind: 'moods',
  sample: 'Subsonic',
  options: [
    { name: 'Strobe chaos', note: 'Layered, jittering type over black, one acid colour cutting through.', colours: ['#0b0b0d', '#f1efe9', '#c6ff3d', '#6b5cff'], display: 'Unbounded' },
    { name: 'Gallery at 3am', note: 'A strict grid, small precise type, the chaos held in one torn image.', colours: ['#efece6', '#141414', '#e8432e', '#9a968e'], display: 'Instrument Serif' },
    { name: 'Xerox rave', note: 'Photocopied grain, blunt condensed capitals, a hit of fluoro.', colours: ['#f0e9dc', '#111111', '#ff3d7f', '#2d2d2d'], display: 'Anton' },
  ],
};
model = {
  mode: 'scripted',
  delay: 700,
  plans: [
    plan({ modules: [mod('purpose', 'What it is for', 'What’s the poster for?', { lead: true, placeholder: 'A club night we’re throwing in March' })], brief: { kind: 'poster' } }),
    plan({ note: 'An underground night — how it feels is most of it.', modules: [mod('atmosphere', 'Atmosphere', 'Should it carry the noise of the night, or the people who go?', { lead: true, aid: MOODS })], brief: { kind: 'poster', purpose: 'An underground electronic music event', tentative: ['Night-time, warehouse culture'] } }),
    plan({ note: 'Strobe chaos — controlled, though.', ready: true, brief: { kind: 'poster', purpose: 'An underground electronic music event', feel: 'chaotic but sophisticated', tentative: ['Night-time, warehouse culture'] } }),
  ],
};
await goHome();
await begin('Make me a poster.');
ok('while the brief is first read, SocriaUX says it is reading it (no typing bubbles)', (await page.locator('.sbx-line.is-thinking').count()) === 1 && (await noChat()));
await settled(1);
ok('the idea at the top, as written and editable; the most relevant opening consideration placed in the brief', (await page.locator('.sbx-prompt').inputValue()) === 'Make me a poster.' && (await page.locator('.sbx-q.is-lead .sbx-question').innerText()) === 'What’s the poster for?' && (await page.locator('#sbx-a-purpose').getAttribute('placeholder')) === 'A club night we’re throwing in March', await page.locator('.sbx-q').allInnerTexts());
ok('no chat anywhere: no bubbles, no transcript, no message list', await noChat());
ok('Generate is there from the first moment', (await page.locator('.sbx-go').isVisible()) && !(await page.locator('.sbx-go').isDisabled()));
ok('the model was sent the brief as it stands: the idea, no considerations yet, “opened the brief”', lastCall()?.prompt === 'Make me a poster.' && lastCall()?.modules?.length === 0 && /opened the brief/.test(lastCall()?.change ?? '') && lastCall()?.mode === 'graphic', JSON.stringify(lastCall()));
await shot('02-vague-opening');
await answerIn('purpose', 'An underground electronic music event.');
await page.waitForTimeout(150);
ok('answered where it stands: settled at once in what is understood, before the model replies', /An underground electronic music event/.test(await page.locator('.sbx-settled').innerText()) && (await page.locator('.sbx-q.is-lead').count()) === 0, await page.locator('.sbx-known').innerText());
await settled(2);
await page.waitForSelector('.sd-dq-grid.is-moods.is-ready', { timeout: 15000 }).catch(() => null);
await page.waitForTimeout(400);
ok('the model told what changed and what holds now (the answer, its status)', /answered “What it is for”/.test(lastCall()?.change ?? '') && lastCall()?.modules?.[0]?.status === 'answered' && lastCall()?.modules?.[0]?.answer === 'An underground electronic music event.', JSON.stringify(lastCall()?.modules));
ok('then the next most valuable consideration, with atmospheres to look at for this night — and SocriaUX’s line on what it took', (await page.locator('.sbx-q.is-lead .sbx-question').innerText()).startsWith('Should it carry the noise') && (await page.locator('.sbx-q.is-lead .sd-dq-card').count()) === 3 && /how it feels is most of it/.test(await page.locator('.sbx-line').innerText()), await page.locator('.sbx-line').innerText());
ok('SocriaUX’s reading shown as its reading, not as theirs', /Night-time, warehouse culture/.test(await page.locator('.sbx-guess').innerText()));
await shot('03-vague-atmosphere');
const callsBefore = questionCalls.length;
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.sbx-q.is-lead .sd-dq-card', { timeout: 15000 });
await page.waitForTimeout(500);
ok('a reload: the brief exactly where it was — the same consideration, the same atmospheres — and the model not asked again', (await page.locator('.sbx-q.is-lead .sd-dq-name').allInnerTexts()).join('|') === 'Strobe chaos|Gallery at 3am|Xerox rave' && questionCalls.length === callsBefore, `${questionCalls.length} vs ${callsBefore}`);
await page.locator('.sbx-q.is-lead .sd-dq-card').first().click();
await page.waitForTimeout(150);
ok('an atmosphere picked: shown at once among the decisions, in its own colours and face', /Strobe chaos/.test(await page.locator('.sbx-picks').innerText()) && (await page.locator('.sbx-pick-mood').count()) === 1);
await settled(3);
ok('…and the model told it was just picked (so it is kept, whatever it returns)', JSON.stringify(lastCall()?.justPicked) === '["mood"]' && lastCall()?.brief?.chosen?.mood?.name === 'Strobe chaos', JSON.stringify(lastCall()?.justPicked));
ok('nothing left open: the brief says so, and offers to make it', /Nothing is waiting on you/.test(await page.locator('.sbx-open').innerText()) && (await page.locator('.sbx-go-big').count()) === 1);
await shot('04-vague-ready');
await page.locator('.sbx-go').click();
await designed();
const db1 = await designBrief();
ok('Generate: the design workspace at once — the brief in their words, what they settled, the pick as taste', /In their words: “Make me a poster\.”/.test(db1) && /What it is for \(“What’s the poster for\?”\): An underground electronic music event/.test(db1) && /Mood they picked \(Strobe chaos\)/.test(db1) && /left to SocriaUX’s judgement/.test(db1), db1);

console.log('\n=== test 2: a detailed brief — generate at once ===');
model = { mode: 'scripted', delay: 0, plans: [plan({ note: 'Brutalist, black and cream, oversized condensed type — enough to make it.', ready: true, brief: { kind: 'poster', purpose: 'An architecture exhibition', feel: 'brutalist, editorial', explicit: ['black and cream', 'oversized condensed typography'] } })] };
await goHome();
await begin('Create a black-and-cream brutalist poster with oversized condensed typography for an architecture exhibition.');
await settled(questionCalls.length);
const facts2 = await page.locator('.sbx-facts textarea').evaluateAll((els) => els.map((e) => e.value).join(' | '));
ok('nothing to answer: no considerations, what was understood laid out (their asks as theirs), Generate offered', (await page.locator('.sbx-q').count()) === 0 && /Nothing is waiting on you/.test(await page.locator('.sbx-open').innerText()) && /brutalist, editorial/.test(facts2) && /black and cream/.test(await page.locator('.sbx-asked').innerText()), facts2 + ' // ' + (await page.locator('.sbx-main').innerText()));
await shot('05-detailed');
await page.locator('.sbx-go-big').click();
await designed();
ok('…made from it at once', /brutalist/.test(await designBrief()));

console.log('\n=== test 3: colour — swatches, a colour of their own, colours changed in place ===');
const PALETTES = {
  kind: 'palettes',
  options: [
    { name: 'Fresh greenhouse', note: 'Leaf green on warm paper, a sunny yellow', colours: ['#f4f1e4', '#1f3a2b', '#3f8f4f', '#e9b949'] },
    { name: 'Potting shed', note: 'Terracotta and sage on kraft', colours: ['#efe3d0', '#3b2a20', '#b5542f', '#7a8c5a'] },
    { name: 'Blossom morning', note: 'Petal pink with a fresh green', colours: ['#fbeef0', '#3a1f2b', '#d6477a', '#8fb98a'] },
  ],
};
model = { mode: 'scripted', delay: 0, plans: [plan({ modules: [mod('colour', 'Colour', 'Which of these feels most like your nursery?', { lead: true, aid: PALETTES })], brief: { kind: 'poster', purpose: 'The spring plant sale at the nursery' } }), plan({ note: 'Potting shed, then — warm and earthy.', ready: true, brief: { kind: 'poster', purpose: 'The spring plant sale at the nursery' } }), plan({ note: 'A brighter green it is.', ready: true, brief: { kind: 'poster', purpose: 'The spring plant sale at the nursery' } })] };
await goHome();
await begin('A poster for the spring plant sale at our nursery. Honestly I have no idea what colours to use.');
await settled(questionCalls.length);
await page.waitForSelector('.sd-dq-pal', { timeout: 15000 });
const contrasts = await page.locator('.sd-dq-pal').evaluateAll((els) =>
  els.map((e) => {
    const rgb = (s) => s.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
    const lum = ([r, g, b2]) => [r, g, b2].map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
    const cs = getComputedStyle(e);
    const [x, y] = [lum(rgb(cs.backgroundColor)), lum(rgb(cs.color))];
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }),
);
ok('palettes as real swatches, each with its ink readable on its ground, and a colour of their own beside them', contrasts.length === 3 && contrasts.every((x) => x >= 4.5) && (await page.locator('.sd-aid-own input[type="color"]').count()) === 1, JSON.stringify(contrasts));
await page.locator('.sd-aid-own input[type="color"]').evaluate((el) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '#3fa34d');
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(200);
ok('…a colour of their own goes into the answer, to say more around it', (await page.locator('#sbx-a-colour').inputValue()) === '#3fa34d', await page.locator('#sbx-a-colour').inputValue());
await shot('06-colour');
await then(() => page.locator('.sd-dq-card').filter({ hasText: 'Potting shed' }).click());
ok('a palette picked: its colours among the decisions, each one changeable', (await page.locator('.sbx-sw').count()) === 4 && /Potting shed/.test(await page.locator('.sbx-picks').innerText()));
const before3 = questionCalls.length;
await page.locator('.sbx-sw input[type="color"]').nth(2).evaluate((el) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '#3fa34d');
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
});
await settled(before3 + 1);
let s3 = await studio();
ok('…its accent changed in place: the brief holds their colours, marked as theirs, and the model is told', s3.brief.chosen.palette.colours[2] === '#3fa34d' && s3.brief.chosen.palette.edited === true && /changed a colour of their palette to #3fa34d/.test(lastCall()?.change ?? ''), JSON.stringify(s3.brief.chosen.palette));
await shot('07-colour-edited');

console.log('\n=== test 4: lettering — real faces, compared in place ===');
const TYPE = {
  kind: 'type',
  sample: 'Kerning Club',
  options: [
    { name: 'Loud and inky', note: 'Heavy, blunt letters that fill the page', display: 'Dela Gothic One', body: 'Space Grotesk' },
    { name: 'Fashion drama', note: 'Razor-thin contrast, very poised', display: 'Bodoni Moda', body: 'Instrument Sans' },
    { name: 'Gallery quirk', note: 'Wide and odd, with a typewriter beside it', display: 'Syne', body: 'DM Mono' },
  ],
};
model = { mode: 'scripted', delay: 0, plans: [plan({ modules: [mod('lettering', 'Lettering', 'Which of these sounds most like Kerning Club?', { lead: true, aid: TYPE })], brief: { kind: 'type-led poster', content: 'Kerning Club' } })] };
await goHome();
await begin('A type-led poster for a typography conference called “Kerning Club”. I want the lettering to be really expressive, but I don’t know fonts at all.');
await settled(questionCalls.length);
await page.waitForSelector('.sd-dq-list.is-faces.is-ready', { timeout: 15000 }).catch(() => null);
await page.waitForTimeout(500);
const specFaces = await page.locator('.sd-dq-spec').evaluateAll((els) => els.map((e) => getComputedStyle(e).fontFamily.split(',')[0].replace(/"/g, '').trim()));
const specLoaded = await page.evaluate((fs) => fs.map((f) => document.fonts.check(`40px "${f}"`)), specFaces);
const specFit = await page.locator('.sd-dq-spec').evaluateAll((els) => els.map((e) => e.scrollWidth <= e.clientWidth + 1 && e.clientWidth > 0));
ok('“Kerning Club” set in each pairing’s real face from the library — loaded, and fitted to its space', specFaces.join('|') === 'Dela Gothic One|Bodoni Moda|Syne' && specLoaded.every(Boolean) && specFit.every(Boolean), JSON.stringify({ specFaces, specLoaded, specFit }));
await shot('08-type');

console.log('\n=== test 5: a dreamy cloud poster — atmospheres for it, not presets ===');
const CLOUDS = {
  kind: 'moods',
  sample: 'Cumulus',
  options: [
    { name: 'Ethereal', note: 'Soft white on pale sky, airy lettering, lots of space.', colours: ['#eef3f8', '#24324a', '#9bb7d4', '#f6e7d8'], display: 'Cormorant Garamond' },
    { name: 'Storm light', note: 'Bruised greys, a thin seam of gold, heavy and dramatic.', colours: ['#2a2d34', '#f2efe6', '#d4a548', '#5b6270'], display: 'Bodoni Moda' },
    { name: 'Vapour', note: 'Abstract, futuristic: gradients of cold blue, precise sans.', colours: ['#0e1a2b', '#e8f1ff', '#6fb3ff', '#3b4d66'], display: 'Unbounded' },
  ],
};
model = { mode: 'scripted', delay: 0, plans: [plan({ modules: [mod('cloud', 'Atmosphere', 'Which kind of cloud is it?', { lead: true, aid: CLOUDS })], brief: { kind: 'poster', feel: 'dreamy' } })] };
await goHome();
await begin('I want a dreamy cloud-themed poster.');
await settled(questionCalls.length);
await page.waitForSelector('.sd-dq-grid.is-moods.is-ready', { timeout: 15000 }).catch(() => null);
ok('three readings of a cloud for this poster, each in its own colours and face', (await page.locator('.sbx-q.is-lead .sd-dq-name').allInnerTexts()).join('|') === 'Ethereal|Storm light|Vapour' && (await page.locator('.sd-aid-mood-w').first().textContent()) === 'Cumulus');
await shot('09-clouds');

console.log('\n=== tests 6 and 7: an unusual answer in words; playful changed to sophisticated ===');
model = {
  mode: 'scripted',
  delay: 0,
  plans: [
    plan({ modules: [mod('feeling', 'The feeling', 'What should a child feel walking past it?', { lead: true, placeholder: 'Like they found a secret door' })], brief: { kind: 'poster', purpose: 'A children’s book fair', feel: 'playful', explicit: ['playful'], tentative: ['Bright primary colours'] } }),
    plan({ note: 'Old library adventure, then — wonder over noise.', ready: true, brief: { kind: 'poster', purpose: 'A children’s book fair', feel: 'like the moment in an old library when a book falls open on a map', explicit: ['playful'], tentative: ['Bright primary colours', 'Antique map textures'] } }),
    plan({ note: 'Sophisticated and editorial — the playfulness goes.', ready: true, answers: [{ id: 'feeling', text: 'Wonder, but grown-up: sophisticated and editorial' }], brief: { kind: 'poster', purpose: 'A children’s book fair', feel: 'sophisticated and editorial', explicit: ['sophisticated and editorial'], avoid: ['playful'], tentative: ['Antique map textures'] } }),
  ],
};
await goHome();
await begin('A playful poster for a children’s book fair');
await settled(questionCalls.length);
const unusual = 'Like the moment in an old library when a book falls open on a map you weren’t looking for';
await then(() => answerIn('feeling', unusual));
const facts6 = await page.locator('.sbx-facts textarea').evaluateAll((els) => els.map((e) => e.value).join(' | '));
ok('test 6 — an unusual answer in their words: sent as they wrote it, and the brief takes its meaning', lastCall()?.modules?.find((m) => m.id === 'feeling')?.answer === unusual && /book falls open on a map/.test(facts6), facts6);
await then(async () => {
  await page.fill('#sbx-say', 'Actually, make it sophisticated and editorial instead.');
  await page.press('#sbx-say', 'Enter');
});
s3 = await studio();
const known7 = await page.locator('.sbx-known').innerText();
ok('test 7 — the change of mind as a note: the model sees it as the latest change', /added a note: Actually, make it sophisticated and editorial instead/.test(lastCall()?.change ?? '') && lastCall()?.notes?.at(-1) === 'Actually, make it sophisticated and editorial instead.', JSON.stringify(lastCall()?.notes));
ok('…the superseded preference gone (playful kept out), the answer it overrode rewritten, the rest kept', s3.brief.feel === 'sophisticated and editorial' && s3.brief.avoid.includes('playful') && s3.space.modules.find((m) => m.id === 'feeling').answer.text === 'Wonder, but grown-up: sophisticated and editorial' && s3.brief.purpose === 'A children’s book fair' && /Keep out/.test(known7) && /Your notes/.test(known7), JSON.stringify({ feel: s3.brief.feel, avoid: s3.brief.avoid }));
await shot('10-changed-mind');

console.log('\n=== in place: a guess, the idea, a line of the brief, a note, a settled answer ===');
let n = questionCalls.length;
const after7 = { kind: 'poster', purpose: 'A children’s book fair', feel: 'sophisticated and editorial', avoid: ['playful', 'Antique map textures'] };
model = { mode: 'scripted', delay: 0, plans: [0, 1, 2, 3, 4, 5].map(() => plan({ ready: true, brief: after7 })) };
await page.getByRole('button', { name: 'Not this: Antique map textures' }).click();
await page.waitForTimeout(100);
const shownAtOnce = !/Antique map textures/.test((await page.locator('.sbx-guess').innerText().catch(() => '')) || '') && /Antique map textures/.test(await page.locator('.sbx-avoid').innerText());
s3 = await until(async () => { const x = await studio(); return x && !x.brief.tentative.includes('Antique map textures') ? x : null; }, 4000);
ok('SocriaUX’s reading turned down: gone from its reading at once (on the page, then kept), kept out', shownAtOnce && !s3.brief.tentative.includes('Antique map textures') && s3.brief.avoid.includes('Antique map textures'), JSON.stringify(s3.brief));
await settled(n + 1);
ok('…and the model told', /turned down SocriaUX’s reading: Antique map textures/.test(lastCall()?.change ?? ''), lastCall()?.change);
n = questionCalls.length;
await page.locator('.sbx-prompt').fill('An editorial poster for the city children’s book fair, 12 May');
await page.locator('.sbx-prompt').blur();
await settled(n + 1);
ok('the idea edited in place: kept, and the model told', (await studio()).prompt === 'An editorial poster for the city children’s book fair, 12 May' && lastCall()?.prompt === 'An editorial poster for the city children’s book fair, 12 May' && /edited their idea/.test(lastCall()?.change ?? ''), lastCall()?.change);
n = questionCalls.length;
const purpose = page.locator('.sbx-fact').filter({ hasText: 'What it is for' }).locator('.sbx-edit');
await purpose.fill('The city children’s book fair, for families');
await purpose.press('Enter');
await settled(n + 1);
s3 = await studio();
ok('a line of what is understood rewritten in place: theirs from then on (marked, and kept over the model’s reading)', s3.brief.purpose === 'The city children’s book fair, for families' && s3.space.own.includes('purpose') && /yours/.test(await page.locator('.sbx-fact').filter({ hasText: 'What it is for' }).innerText()) && lastCall()?.own?.includes('purpose'), JSON.stringify({ purpose: s3.brief.purpose, own: s3.space.own }));
n = questionCalls.length;
await page.getByRole('button', { name: /^Take back: Actually/ }).click();
await settled(n + 1);
ok('a note taken back', (await studio()).space.notes.length === 0 && /took back their note/.test(lastCall()?.change ?? ''));
await page.getByRole('button', { name: 'Change “The feeling”' }).click();
await page.waitForTimeout(200);
const reopened = await until(async () => ((await studio())?.space?.modules?.find((m) => m.id === 'feeling')?.status === 'open' ? true : null), 4000);
ok('a settled consideration changed again: open where it was, its answer cleared', (await page.locator('.sbx-q[data-module="feeling"]').count()) === 1 && !!reopened, String(await page.locator('.sbx-q[data-module="feeling"]').count()));
await shot('11-in-place');

console.log('\n=== test 8: Generate before answering anything ===');
model = { mode: 'scripted', delay: 1500, plans: [plan({ modules: [mod('purpose', 'What it is for', 'What’s the poster for?', { lead: true })], brief: { kind: 'poster' } })] };
await goHome();
await begin('A poster');
await page.locator('.sbx-go').click();
await designed();
ok('Generate while SocriaUX is still reading the idea: never blocked — the workspace opens with stand-in words', /stand-in words/.test(await designBrief()) && (await page.locator('.dx').count()) === 1);

console.log('\n=== test 9: a logo, a website and a campaign — each brief shaped by its work ===');
model = {
  mode: 'scripted',
  delay: 0,
  plans: [
    plan({ modules: [mod('statement', 'Character', 'Should the name make a statement, or let the fragrance speak?', { lead: true, options: ['Make a statement', 'Quiet and assured', 'Somewhere strange'] }), mod('name', 'The name', 'What’s it called?', { placeholder: 'Velour' })], brief: { kind: 'logo', purpose: 'A small fragrance house' } }),
    plan({ modules: [mod('do', 'What people do there', 'What should people be able to do on it?', { lead: true, options: ['Book a class', 'Buy pieces', 'Visit the studio'] })], brief: { kind: 'website', purpose: 'A pottery studio' } }),
    plan({ modules: [mod('pieces', 'The pieces', 'Which pieces does the launch need?', { lead: true, placeholder: 'A few posters and some Instagram posts' }), mod('voice', 'Voice', 'How cheeky can it be?', { options: ['Very', 'A wink', 'Not at all'] })], brief: { kind: 'launch campaign', purpose: 'Pasture oat milk launch' } }),
  ],
};
const shapes = {};
for (const [id, words] of [
  ['logo', 'A logo for a small fragrance house'],
  ['website', 'A website for my pottery studio'],
  ['campaign', 'A launch campaign for our oat milk brand'],
]) {
  await goHome();
  await begin(words);
  await settled(questionCalls.length);
  shapes[id] = { kind: await page.locator('.sbx-main').getAttribute('data-kind'), shape: await page.locator('.sbx-main').getAttribute('data-shape'), qs: await page.locator('.sbx-question').allInnerTexts(), open: await page.locator('.sbx-q').count() };
  await shot(`12-${id}`);
}
ok('a logo: its character raised first as readings to choose, its name beside it', shapes.logo.kind === 'logo' && shapes.logo.shape === 'choice' && shapes.logo.open === 2 && /make a statement/.test(shapes.logo.qs[0]), JSON.stringify(shapes.logo));
ok('a website: what people do there, alone', shapes.website.kind === 'website' && shapes.website.open === 1 && /able to do on it/.test(shapes.website.qs[0]), JSON.stringify(shapes.website));
ok('a campaign: its pieces in words, its voice beside — three different briefs, not one form', shapes.campaign.kind === 'board' && shapes.campaign.shape === 'words' && shapes.campaign.open === 2 && JSON.stringify(shapes.logo.qs) !== JSON.stringify(shapes.campaign.qs), JSON.stringify(shapes.campaign));

console.log('\n=== signed out: the reader’s brief, and Generate always works ===');
model = { mode: 'signed-out', plans: [], delay: 0 };
await goHome();
await begin('something for my bakery');
await settled(questionCalls.length);
ok('what it is, when nothing says: readings to choose', (await page.locator('.sbx-q.is-lead .sbx-question').innerText()) === 'What are you making?' && (await page.locator('.sbx-option').allInnerTexts()).join('|') === 'A poster or a post|A logo|A website|A campaign', await page.locator('.sbx-q').allInnerTexts());
await then(() => page.locator('.sbx-option').filter({ hasText: 'A logo' }).click());
ok('a logo, then: its name (the brief becomes a logo’s)', (await page.locator('.sbx-q.is-lead .sbx-question').innerText()) === 'What’s it called?' && (await studio()).mode === 'logo', await page.locator('.sbx-q').allInnerTexts());
await then(() => answerIn('name', 'Halden'));
await page.locator('.sbx-go-big, .sbx-go').first().click();
await designed();
const p9 = await project();
ok('made: a logo sheet, its name in the brief', p9.design?.kind === 'logo' && p9.design.format === 'logo-sheet' && /Halden/.test(p9.design.memory.brief), JSON.stringify(p9.design?.memory?.brief).slice(0, 300));
await goHome();
await begin('A website for my pottery studio');
await settled(questionCalls.length);
ok('a website whose subject is said, signed out: nothing to answer', (await page.locator('.sbx-q').count()) === 0, await page.locator('.sbx-main').innerText());
await page.locator('.sbx-go').click();
const pw = await until(async () => ((await project())?.studio?.status === 'started' ? project() : null), 30000);
ok('…and Generate makes the website', pw?.mode === 'create' && pw.specs?.length > 0);

console.log('\n=== references read into the brief ===');
model = { mode: 'scripted', delay: 0, plans: [plan({ modules: [mod('do', 'What people do there', 'What should people be able to do on it?', { lead: true })], brief: { kind: 'website', content: 'Mira Studio' } }), plan({ ready: true, brief: { kind: 'website', content: 'Mira Studio', references: ['larkfield.studio'] } })] };
await goHome();
await begin('A website for “Mira Studio”');
await settled(questionCalls.length);
await then(async () => {
  await page.fill('#sbx-say', 'something like larkfield.studio, or like nowhere.design');
  await page.press('#sbx-say', 'Enter');
});
await page.waitForSelector('.sd-refcard', { timeout: 10000 });
ok('sites named in a note: read by the server’s reader (nothing fetched from the browser), shown among the references, the one that failed said plainly', read.some((u) => /larkfield/.test(u)) && read.some((u) => /nowhere/.test(u)) && ![...outside].some((h) => /larkfield|nowhere/.test(h)) && (await page.locator('.sbx-refs .sd-refcard').count()) === 1 && /Couldn’t read nowhere\.design/.test(await page.locator('.sbx-refs').innerText()), await page.locator('.sbx-refs').innerText());
ok('…and handed to the model as read', /larkfield\.studio.*#f6f1e7/.test(lastCall()?.sites?.[0] ?? ''), JSON.stringify(lastCall()?.sites));
await shot('13-references');

console.log('\n=== a phone ===');
await page.setViewportSize({ width: 390, height: 844 });
model = { mode: 'scripted', delay: 0, plans: [plan({ modules: [mod('colour', 'Colour', 'Which of these feels most like your nursery?', { lead: true, aid: PALETTES })], brief: { kind: 'poster', purpose: 'A spring fair' } })] };
await goHome();
await begin('A poster for the spring fair at our nursery, no idea about colours');
await settled(questionCalls.length);
await page.waitForSelector('.sd-dq-pal', { timeout: 15000 });
await page.waitForTimeout(400);
const fit = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
ok('the brief fits a phone, no sideways scrolling', fit[0] <= fit[1], JSON.stringify(fit));
const dock = await page.locator('.sbx-dock').boundingBox();
ok('…Generate docked at the foot, always in reach', !!dock && dock.y + dock.height <= 844 + 1 && (await page.locator('.sbx-dock button').isVisible()), JSON.stringify(dock));
await shot('14-phone');

console.log('\n=== and ===');
ok('no generation route called, and the designer never reached (signed out)', modelCalls.length === 0 && designCalls.length === 0, modelCalls.join(' '));
const hosts = [...outside].filter((h) => !/^fonts\.(googleapis|gstatic)\.com$/.test(h) && !/clerk/.test(h));
ok('no outside host reached from the browser beyond its fonts and sign-in', !hosts.length, [...outside].join(' '));
ok('no page errors', errors.length === 0, errors.join(' | '));

await b.close();
console.log(`\nstudio-qa: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
