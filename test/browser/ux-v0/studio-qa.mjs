// test/browser/ux-v0/studio-qa.mjs — SocriaUX in the built app, driven as a person would: a conversation with a
// creative director, from the first sentence to the work being made.
//
//   the home        one composer; words read live; "I'll ask what it is" when the words settle nothing
//   the model       the questions route scripted (lib/ux-v0/studio/discover-model.ts decisions): one question at a
//                   time in its own words, with what it read (the whole conversation, the questions so far, the aids
//                   shown, what was just picked); "make" makes the work at once — no approval, no directions to choose
//   aids            moods, palettes and lettering only when the model shows them: real colours (ink readable on its
//                   ground), real faces from the font library (loaded before they are shown); picked, or answered in
//                   the person's own words; a pick reaches the designer's brief as taste
//   freedom         "Skip" under every question (the model settles that point and moves on), "Surprise me" and
//                   "You decide." make the work at once (no model call); a colour of their own from the colour picker,
//                   written into the reply; a suggested reply tapped; the kind of work changed by what was said; a
//                   reload keeps the waiting question and its aid
//   signed out      the real answer here: the reader decides (what it is, a logo's name, what a poster is for), at
//                   most two questions, never a headline asked for; a detailed request is made at once
//   references      websites the person names, read through the server's guarded reader (recorded here) before
//                   SocriaUX answers, and handed to the model as what was read
//   and             a phone's width, no generation route called, no outside host reached, no page errors
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
const events = [];
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

// the server's reader, recorded: what /api/ux-v0/reference answers for a site it can read, and for one it cannot
const LARKFIELD = {
  read: { url: 'https://larkfield.studio/', host: 'larkfield.studio', title: 'Larkfield Bakery', description: 'Sourdough, baked at dawn.', colours: ['#f6f1e7', '#2b2118', '#b4532a', '#e7dccb'], ground: '#f6f1e7', ink: '#2b2118', accent: '#b4532a', fonts: ['Fraunces', 'Inter'], notes: ['a light ground', 'a warm accent', 'serif headings'] },
  preview: '<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'"><style>body{margin:0;background:#f6f1e7;color:#2b2118;font:20px Georgia,serif}h1{font-size:96px;margin:120px 80px 0}</style></head><body><h1>Larkfield Bakery</h1></body></html>',
};
await ctx.route('**/api/ux-v0/reference', async (route) => {
  const { url } = JSON.parse(route.request().postData() || '{}');
  read.push(url);
  events.push(`read:${url}`);
  if (/larkfield/.test(url)) return route.fulfill({ json: LARKFIELD });
  return route.fulfill({ status: 422, json: { error: 'The site did not answer.' } });
});

// the questions route, scripted: signed out by default (as it really is here, with placeholder keys); where a scenario
// asks, the model's decisions in turn, exactly in the shape the route sends them
let model = { mode: 'signed-out', answers: [], delay: 0 };
await ctx.route('**/api/ux-v0/studio-questions', async (route) => {
  const body = JSON.parse(route.request().postData() || '{}');
  questionCalls.push(body.context ?? null);
  events.push('question');
  if (model.mode === 'signed-out') return route.fulfill({ status: 401, json: { error: 'Sign in to use SocriaUX’s reasoning.', signIn: true } });
  const next = model.answers.shift();
  if (model.delay) await new Promise((r) => setTimeout(r, model.delay));
  if (!next) return route.fulfill({ status: 503, json: { error: 'No scripted answer.' } });
  return route.fulfill({ json: { decision: next } });
});
const brief = (over = {}) => ({ kind: '', purpose: '', audience: '', content: '', feel: '', explicit: [], implied: [], tentative: [], avoid: [], references: [], open: [], chosen: {}, ...over });
const ask = (text, o = {}) => ({ action: 'ask', say: o.say ?? '', ask: { text, aid: o.aid ?? null, suggestions: o.suggestions ?? [] }, brief: brief(o.brief), mode: o.mode ?? null, by: 'model' });
const make = (say, o = {}) => ({ action: 'make', say, ask: null, brief: brief(o.brief), mode: o.mode ?? null, by: 'model' });

// the designer's route, scripted (no model here; signed out it is never reached)
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
    await page.waitForTimeout(200);
  }
  return v;
};
const pid = () => new URL(page.url()).searchParams.get('p');
const project = async () => (pid() ? idb('socria-ux-v0', 'projects', pid()) : null);
const started = () =>
  until(async () => {
    const x = await project();
    return x?.studio?.status === 'started' ? x : null;
  }, 30000);
const COMPOSER = 'textarea[aria-label="What do you want to make?"]';
const goHome = async () => {
  await page.goto(BASE + '/ux-v0', { waitUntil: 'networkidle' });
  await page.waitForSelector('.sd-home');
};
const begin = async (words) => {
  await page.fill(COMPOSER, words);
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Begin' }).click();
  await page.waitForSelector('.sd-chat, .dx, .v0-work', { timeout: 20000 });
  await page.waitForTimeout(400);
};
const reply = async (words) => {
  await page.fill('#sd-reply', words);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
};
const said = () => page.locator('.sd-msg.is-socria .sd-said').allInnerTexts();
const lastSaid = async () => (await said()).filter((t) => t.trim()).at(-1) ?? '';
const asked = async () => ((await project())?.studio?.transcript ?? []).filter((m) => m.from === 'socria' && m.kind === 'question');
const waitAsked = (n) => until(async () => ((await asked()).length >= n && !(await page.locator('.sd-typing').count()) ? true : null), 15000);
const designed = () => page.waitForSelector('.dx', { timeout: 30000 });
const designBrief = async () => (await until(async () => ((await project())?.medium === 'design' ? project() : null), 20000))?.design?.memory?.brief ?? '';

console.log('=== the home ===');
await goHome();
ok('one composer, with Begin', (await page.locator(COMPOSER).count()) === 1 && (await page.getByRole('button', { name: 'Begin' }).count()) === 1);
ok('no image library named anywhere', !/openverse|image librar/i.test(await page.locator('body').innerText()));
await page.fill(COMPOSER, 'something for my bakery');
await page.waitForTimeout(700);
ok('words that settle nothing: “I’ll ask what it is”, never a guess or a menu of kinds', /I’ll ask what it is/.test(await page.locator('.sd-reading').innerText()), await page.locator('.sd-reading').innerText());
await shot('01-home');

console.log('\n=== signed out: a detailed request is made at once ===');
await begin('A bold, experimental poster for “Field Lines”, “Code that draws”, 12–30 June 2027, Lisbon, in the style of a Swiss poster');
await designed();
let p = await started();
ok('the design workspace, with nothing asked and no directions to choose (signed out: it asks to sign in, sends nothing)', p?.medium === 'design' && (await asked()).length === 0 && designCalls.length === 0 && /Sign in/.test((await page.locator('.dx-chat textarea').getAttribute('placeholder')) ?? ''), JSON.stringify(p?.studio?.transcript?.map((m) => [m.kind, m.text.slice(0, 60)])));
ok('…the model was asked first and refused (signed out), and the reader decided', questionCalls.length === 1 && p.studio.transcript.some((m) => m.stage === 'making'));
ok('…the brief the designer reads: their words exactly, the form from the sentence', /“A bold, experimental poster for “Field Lines”/.test(p.design.memory.brief) && /Field Lines/.test(p.design.memory.brief) && p.design.kind === 'poster', p.design.memory.brief.slice(0, 400));
await shot('02-detailed-made');

console.log('\n=== the model: a vague poster, one question at a time ===');
const MOODS = {
  kind: 'moods',
  sample: 'Subsonic',
  options: [
    { name: 'Strobe chaos', note: 'Layered, jittering type over black, one acid colour cutting through.', colours: ['#0b0b0d', '#f1efe9', '#c6ff3d', '#6b5cff'], display: 'Unbounded' },
    { name: 'Gallery at 3am', note: 'Strict grid, small precise type, the chaos held in one torn image.', colours: ['#efece6', '#141414', '#e8432e', '#9a968e'], display: 'Instrument Serif' },
    { name: 'Xerox rave', note: 'Photocopied grain, blunt condensed capitals, a hit of fluoro.', colours: ['#f0e9dc', '#111111', '#ff3d7f', '#2d2d2d'], display: 'Anton' },
  ],
};
model = {
  mode: 'scripted',
  delay: 1200,
  answers: [
    ask('What’s the poster for?', { brief: { kind: 'poster' } }),
    ask('Should it feel closer to the noise of the night, or to the people who go?', { say: 'An underground night, then.', aid: MOODS, brief: { kind: 'poster', purpose: 'An underground electronic music event' } }),
    make('Strobe chaos it is — making it now.', { brief: { kind: 'poster', purpose: 'An underground electronic music event', feel: 'chaotic but sophisticated' } }),
  ],
};
await goHome();
await begin('Make me a poster.');
ok('while the model thinks, SocriaUX is shown thinking', (await page.locator('.sd-typing').count()) === 1);
await waitAsked(1);
ok('the model’s own question, alone — no aid, no tap-replies, no form', (await lastSaid()) === 'What’s the poster for?' && (await page.locator('.sd-aid, .sd-suggestion').count()) === 0, await lastSaid());
ok('…asked with the conversation as it stands: the person’s words, nothing asked yet', questionCalls.at(-1)?.conversation?.[0]?.text === 'Make me a poster.' && questionCalls.at(-1)?.asked === 0 && questionCalls.at(-1)?.mode === 'graphic', JSON.stringify(questionCalls.at(-1)));
ok('under the question, never required: “Skip” and “Surprise me” (the composer’s “Make it now” steps aside while they show)', (await page.locator('.sd-qacts .sd-chip').allInnerTexts()).join('|') === 'Skip|Surprise me' && (await page.locator('.sd-make').count()) === 0, (await page.locator('.sd-qacts .sd-chip').allInnerTexts()).join('|'));
await reply('An underground electronic music event.');
await waitAsked(2);
await page.waitForSelector('.sd-dq-grid.is-moods.is-ready', { timeout: 15000 }).catch(() => null);
await page.waitForTimeout(500);
const moodFaces = await page.locator('.sd-aid-mood-w').evaluateAll((els) => els.map((e) => getComputedStyle(e).fontFamily.split(',')[0].replace(/"/g, '').trim()));
const moodLoaded = await page.evaluate((fs) => fs.map((f) => document.fonts.check(`40px "${f}"`)), moodFaces);
ok('the reply carried forward, then the next question with moods to look at: each in its own colours and face, set in the work’s word', /^An underground night, then\. Should it feel closer/.test(await lastSaid()) && (await page.locator('.sd-aid .sd-dq-card').count()) === 3 && (await page.locator('.sd-aid-mood-w').first().textContent()) === 'Subsonic' && moodLoaded.filter(Boolean).length >= 2, JSON.stringify({ s: await lastSaid(), moodFaces, moodLoaded }));
const moodFit = await page.locator('.sd-aid-mood-w').evaluateAll((els) => els.map((e) => [e.scrollWidth, e.clientWidth]));
ok('…each sample fits its card in its own face — made smaller, never broken inside a word', moodFit.every(([sw, cw]) => cw > 0 && sw <= cw + 1), JSON.stringify(moodFit));
ok('…the person can pick, or just write: the reply says so, and asks nothing to be filled in', /Pick one, or just write/.test(await page.locator('.sd-aid-hint').innerText()) && /Pick one, combine them/.test((await page.locator('#sd-reply').getAttribute('placeholder')) ?? ''));
ok('…the model read the whole conversation, with one question asked so far', questionCalls.at(-1)?.conversation?.map((m) => m.who).join() === 'person,socria,person' && questionCalls.at(-1)?.asked === 1 && questionCalls.at(-1)?.brief?.kind === 'poster', JSON.stringify(questionCalls.at(-1)));
await shot('03-moods');
const callsBefore = questionCalls.length;
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.sd-aid .sd-dq-card', { timeout: 15000 });
await page.waitForTimeout(600);
ok('a reload: the question waits where it was, with the same moods, and the model is not asked again', (await page.locator('.sd-aid .sd-dq-name').allInnerTexts()).join('|') === 'Strobe chaos|Gallery at 3am|Xerox rave' && questionCalls.length === callsBefore, `${questionCalls.length} vs ${callsBefore}`);
model.answers = [make('Strobe chaos it is — making it now.', { brief: { kind: 'poster', purpose: 'An underground electronic music event', feel: 'chaotic but sophisticated' } })];
await page.locator('.sd-aid .sd-dq-card').first().click();
await designed();
p = await started();
const c3 = questionCalls.at(-1);
ok('a mood picked: said as the person’s reply, and the model told it was just picked (and not to show moods again)', /^This one: Strobe chaos/.test(p.studio.transcript.filter((m) => m.from === 'person').at(-1)?.text ?? '') && JSON.stringify(c3?.justPicked) === '["mood"]' && c3?.shown?.includes('moods') && c3?.brief?.chosen?.mood?.name === 'Strobe chaos', JSON.stringify(c3));
const db1 = await designBrief();
ok('the model says make: the design workspace at once, no approval — the brief in their words, the conversation, and the pick as taste (kept even though the model’s brief left it out)', p.medium === 'design' && /In their words: “Make me a poster\.”/.test(db1) && /An underground electronic music event/.test(db1) && /Mood they picked \(Strobe chaos\)/.test(db1) && /stand-in words/.test(db1), db1);
await shot('04-made-from-mood');

console.log('\n=== palettes, answered in words ===');
const PALETTES = {
  kind: 'palettes',
  sample: null,
  options: [
    { name: 'Fresh greenhouse', note: 'Leaf green on warm paper, a sunny yellow', colours: ['#f4f1e4', '#1f3a2b', '#3f8f4f', '#e9b949'] },
    { name: 'Potting shed', note: 'Terracotta and sage on kraft', colours: ['#efe3d0', '#3b2a20', '#b5542f', '#7a8c5a'] },
    { name: 'Blossom morning', note: 'Petal pink with a fresh green', colours: ['#fbeef0', '#3a1f2b', '#d6477a', '#8fb98a'] },
  ],
};
model = {
  mode: 'scripted',
  delay: 0,
  answers: [
    ask('Which of these feels closest to your nursery?', { aid: PALETTES, brief: { kind: 'poster', purpose: 'Spring plant sale at the nursery' } }),
    make('Potting shed with a brighter green — making it now.', { brief: { kind: 'poster', purpose: 'Spring plant sale at the nursery', explicit: ['Potting shed colours, with a brighter green accent: #3fa34d'] } }),
  ],
};
await goHome();
await begin('A poster for the spring plant sale at our nursery. Honestly I have no idea what colours to use.');
await waitAsked(1);
await page.waitForSelector('.sd-dq-pal', { timeout: 15000 });
const contrasts = await page.locator('.sd-dq-pal').evaluateAll((els) =>
  els.map((e) => {
    const rgb = (s) => s.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
    const lum = ([r, g, b]) => [r, g, b].map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
    const cs = getComputedStyle(e);
    const [a, b2] = [lum(rgb(cs.backgroundColor)), lum(rgb(cs.color))];
    return (Math.max(a, b2) + 0.05) / (Math.min(a, b2) + 0.05);
  }),
);
ok('palettes to look at: each its real colours, its hex codes, and “Aa” in its ink on its ground — readable (4.5:1 or better)', contrasts.length === 3 && contrasts.every((x) => x >= 4.5) && (await page.locator('.sd-dq-hex').first().innerText()).includes('#f4f1e4'), JSON.stringify(contrasts));
ok('…and the reply invites mixing or naming colours (hex codes are fine)', /hex codes are fine/.test(await page.locator('.sd-aid-hint').innerText()) && /name your own colours/.test((await page.locator('#sd-reply').getAttribute('placeholder')) ?? ''));
ok('…and a colour of their own, from the system’s colour picker', (await page.locator('.sd-aid-own input[type="color"]').count()) === 1);
await page.locator('.sd-aid-own input[type="color"]').evaluate((el) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '#3fa34d');
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(200);
ok('…picked: written into the reply (not sent), to say more around it', (await page.locator('#sd-reply').inputValue()) === '#3fa34d' && (await asked()).length === 1, await page.locator('#sd-reply').inputValue());
await shot('05-palettes');
await page.locator('#sd-reply').focus();
await page.keyboard.press('Home');
await page.keyboard.type('The second one, but with a brighter green accent like ');
await page.keyboard.press('Enter');
await page.waitForTimeout(500);
await designed();
const c4 = questionCalls.at(-1);
ok('answered in words instead of a pick: the model reads their words as said, and nothing counts as picked', c4?.conversation?.at(-1)?.text === 'The second one, but with a brighter green accent like #3fa34d' && JSON.stringify(c4?.justPicked) === '[]', JSON.stringify(c4));
const db2 = await designBrief();
ok('…made at once; the brief carries their colour words exactly', /#3fa34d/.test(db2) && !/Colours they picked/.test(db2), db2);

console.log('\n=== lettering in real faces; a suggested reply; “You decide.” ===');
const TYPE = {
  kind: 'type',
  sample: 'Kerning Club',
  options: [
    { name: 'Loud and inky', note: 'Heavy, blunt letters that fill the page', display: 'Dela Gothic One', body: 'Space Grotesk' },
    { name: 'Fashion drama', note: 'Razor-thin contrast, very poised', display: 'Bodoni Moda', body: 'Instrument Sans' },
    { name: 'Gallery quirk', note: 'Wide and odd, with a typewriter beside it', display: 'Syne', body: 'DM Mono' },
  ],
};
model = {
  mode: 'scripted',
  delay: 0,
  answers: [
    ask('Which of these sounds most like Kerning Club?', { say: 'Expressive lettering, and the font choosing is on me.', aid: TYPE, brief: { kind: 'type-led poster', content: 'Kerning Club' } }),
    ask('Should the letters behave, or break the rules a little?', { say: 'Loud and inky.', suggestions: ['Break the rules', 'Keep it tidy'], brief: { kind: 'type-led poster', content: 'Kerning Club' } }),
  ],
};
await goHome();
await begin('A type-led poster for a typography conference called “Kerning Club”. I want the lettering to be really expressive, but I don’t know fonts at all.');
await waitAsked(1);
await page.waitForSelector('.sd-dq-list.is-faces.is-ready', { timeout: 15000 }).catch(() => null);
await page.waitForTimeout(600);
const specFaces = await page.locator('.sd-dq-spec').evaluateAll((els) => els.map((e) => getComputedStyle(e).fontFamily.split(',')[0].replace(/"/g, '').trim()));
const specLoaded = await page.evaluate((fs) => fs.map((f) => document.fonts.check(`40px "${f}"`)), specFaces);
ok('lettering to look at: “Kerning Club” set in each pairing’s real face from the library, loaded before it is shown', (await page.locator('.sd-dq-card.is-face').count()) === 3 && (await page.locator('.sd-dq-spec').first().textContent()) === 'Kerning Club' && specFaces.join('|') === 'Dela Gothic One|Bodoni Moda|Syne' && specLoaded.every(Boolean), JSON.stringify({ specFaces, specLoaded }));
const specFit = await page.locator('.sd-dq-spec').evaluateAll((els) => els.map((e) => [e.scrollWidth, e.clientWidth]));
ok('…each specimen fits its card', specFit.every(([sw, cw]) => cw > 0 && sw <= cw + 1), JSON.stringify(specFit));
await shot('06-type');
await page.locator('.sd-dq-card.is-face').first().click();
await waitAsked(2);
await page.waitForSelector('.sd-suggestion', { timeout: 10000 });
ok('a pick, then a question with short replies to tap (the aid gone, the pick kept)', (await page.locator('.sd-suggestion').allInnerTexts()).join('|') === 'Break the rules|Keep it tidy' && (await page.locator('.sd-aid').count()) === 0 && (await project()).studio.brief?.chosen?.type?.name === 'Loud and inky', JSON.stringify((await project()).studio.brief?.chosen));
const callsAtDecide = questionCalls.length;
await reply('You decide.');
await designed();
const db3 = await designBrief();
ok('“You decide.”: made at once — no model call — with the lettering they picked in the brief', questionCalls.length === callsAtDecide && /Lettering they picked \(Loud and inky\): Dela Gothic One for display, Space Grotesk for text/.test(db3) && /Kerning Club/.test(db3) && /left to SocriaUX’s judgement/.test(db3), db3);

console.log('\n=== a question skipped ===');
model = {
  mode: 'scripted',
  delay: 0,
  answers: [
    ask('Should it feel like a studio you wander into, or an event you plan for?', { aid: MOODS, brief: { kind: 'poster', purpose: 'Open studio weekend' } }),
    make('I’ll settle the feel myself — making it now.', { brief: { kind: 'poster', purpose: 'Open studio weekend' } }),
  ],
};
await goHome();
await begin('A poster for our open studio weekend');
await waitAsked(1);
await page.locator('.sd-qacts .sd-chip').filter({ hasText: 'Skip' }).click();
await designed();
p = await started();
ok('“Skip”: said as the person’s reply, the model told so (it settles that point and moves on), nothing picked', p.studio.transcript.filter((m) => m.from === 'person').at(-1)?.text === 'Skip' && questionCalls.at(-1)?.conversation?.at(-1)?.text === 'Skip' && !p.studio.brief?.chosen?.mood, JSON.stringify(questionCalls.at(-1)?.conversation?.slice(-2)));
const db6 = await designBrief();
ok('…and made: the skipped question left to SocriaUX, “Skip” never read as what it is about', /Open studio weekend/.test(db6) && !/What it is for: Skip/.test(db6), db6);

console.log('\n=== the work turns out to be another kind ===');
model = {
  mode: 'scripted',
  delay: 0,
  answers: [
    ask('Is it the one poster, or a few pieces that go together?', { brief: { kind: 'poster', content: 'Pasture' } }),
    make('A small campaign, then — posters and posts, one idea across them.', { mode: 'board', brief: { kind: 'launch campaign', content: 'Pasture', explicit: ['A few posters and Instagram posts'] } }),
  ],
};
await goHome();
await begin('A poster for Pasture, our new oat milk');
await waitAsked(1);
await reply('Actually a few posters and some Instagram posts');
await designed();
p = await started();
ok('said in a reply, decided by the model: a campaign, made as one (the conversation’s kind follows)', p?.studio?.mode === 'board' && p.design?.kind === 'campaign', JSON.stringify({ mode: p?.studio?.mode, kind: p?.design?.kind }));

console.log('\n=== websites to learn from, read before SocriaUX answers ===');
model = {
  mode: 'scripted',
  delay: 0,
  answers: [
    ask('What should people be able to do on it?', { suggestions: ['Book a session', 'See the work', 'Get in touch'], brief: { kind: 'website', content: 'Mira Studio' } }),
    ask('Larkfield’s warmth, then. Is booking the main thing people come for?', { brief: { kind: 'website', content: 'Mira Studio', references: ['larkfield.studio'] } }),
  ],
};
await goHome();
await begin('A website for “Mira Studio”');
await waitAsked(1);
ok('a website: the model’s question, with tap-replies that answer it', /What should people be able to do on it/.test(await lastSaid()) && (await page.locator('.sd-suggestion').count()) === 3, await lastSaid());
events.length = 0;
await reply('something like larkfield.studio, or like nowhere.design');
await waitAsked(2);
await page.waitForSelector('.sd-refcard', { timeout: 10000 });
const order = events.join(' ');
ok('both sites asked of the server’s reader, nothing fetched from the browser, and both before the model was asked', /read:.*larkfield.*read:.*nowhere.*question/.test(order) && ![...outside].some((h) => /larkfield|nowhere/.test(h)), order);
ok('…the model was handed what was read', /larkfield\.studio.*#f6f1e7.*Fraunces/.test(questionCalls.at(-1)?.sites?.[0] ?? ''), JSON.stringify(questionCalls.at(-1)?.sites));
ok('…what was read shown in the conversation; the one that could not be read said plainly', (await page.locator('.sd-refcard iframe[sandbox=""]').count()) === 1 && (await said()).some((t) => /I couldn’t read nowhere\.design/.test(t)), JSON.stringify((await said()).slice(-3)));
await shot('07-references');

console.log('\n=== signed out: the reader asks what it must, and makes ===');
model = { mode: 'signed-out', answers: [], delay: 0 };
await goHome();
await begin('something for my bakery');
await waitAsked(1);
ok('what it is, when nothing says: one question, with kinds to tap', /What are you making/.test(await lastSaid()) && (await page.locator('.sd-suggestion').allInnerTexts()).includes('A logo'), await lastSaid());
await page.locator('.sd-suggestion').filter({ hasText: 'A logo' }).click();
await waitAsked(2);
ok('a logo, then: its name (the model is not asked again while it cannot answer)', /What’s it called/.test(await lastSaid()) && questionCalls.filter(Boolean).length >= 1, await lastSaid());
await reply('It’s called Halden');
await designed();
p = await started();
const db4 = await designBrief();
ok('two questions at most: the logo begun on a logo sheet, its name in the brief', p.design?.kind === 'logo' && p.design.format === 'logo-sheet' && /Halden/.test(db4) && (await asked()).length === 2, db4);
await goHome();
await begin('Make me a poster.');
await waitAsked(1);
ok('a vague poster, signed out: what it is for (never its headline)', /What’s the poster for\?/.test(await lastSaid()) && !/headline|say\b/i.test(await lastSaid()), await lastSaid());
const callsAtSurprise = questionCalls.length;
await page.locator('.sd-qacts .sd-chip').filter({ hasText: 'Surprise me' }).click();
await designed();
const db5 = await designBrief();
ok('“Surprise me”: made at once with no model call, what was not said left to SocriaUX and the words written as stand-ins', questionCalls.length === callsAtSurprise && /left to SocriaUX’s judgement/.test(db5) && /stand-in words/.test(db5), db5);
await goHome();
await begin('A website for my pottery studio');
p = await started();
ok('a website with what it is about, signed out: made at once', p?.mode === 'create' && p.specs?.length > 0 && (await asked()).length === 0, JSON.stringify(p?.studio?.transcript?.map((m) => m.text.slice(0, 60))));
await page.waitForTimeout(800);
await shot('08-website-made');
// its checks say which look it is in, and that it changes in words — never a set of directions to choose from
await page.locator('button, [role="tab"]').filter({ hasText: /^(Checks|Checking…)$/ }).first().click().catch(() => null);
await page.waitForTimeout(1500);
const rail = (await page.locator('.v0-rail-body').innerText().catch(() => '')) ?? '';
ok('the website’s look is changed in words: no “Choose a different direction”, no directions to explore', /The direction it follows/.test(rail) && /say so in your own words/.test(rail) && !/Choose a different direction|Explore directions/.test(await page.locator('body').innerText()), rail.slice(0, 400));

console.log('\n=== a phone ===');
await page.setViewportSize({ width: 390, height: 844 });
model = { mode: 'scripted', delay: 0, answers: [ask('Which of these feels closest to your nursery?', { aid: PALETTES, brief: { kind: 'poster' } })] };
await goHome();
await begin('A poster for the spring fair at our nursery, no idea about colours');
await waitAsked(1);
await page.waitForSelector('.sd-dq-pal', { timeout: 15000 });
await page.waitForTimeout(400);
const fit = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
ok('the conversation and its palettes fit a phone, no sideways scrolling', fit[0] <= fit[1], JSON.stringify(fit));
const comp = await page.locator('.sd-chat-composer').boundingBox();
ok('…the reply at the foot, within the screen', comp && comp.y + comp.height <= 844 + 1 && comp.x >= 0, JSON.stringify(comp));
await shot('09-phone');

console.log('\n=== and ===');
ok('no generation route was called, and the designer was never reached (signed out)', modelCalls.length === 0 && designCalls.length === 0, modelCalls.join(' '));
const hosts = [...outside].filter((h) => !/^fonts\.(googleapis|gstatic)\.com$/.test(h) && !/clerk/.test(h));
ok('no outside host reached from the browser beyond its fonts and sign-in (the sites read were read by the server)', !hosts.length, [...outside].join(' '));
ok('no page errors', errors.length === 0, errors.join(' | '));

await b.close();
console.log(`\nstudio-qa: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
