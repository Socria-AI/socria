// test/browser/ux-v0/studio-qa.mjs — SocriaUX in the built app, driven as a person would: a conversation with a
// creative director, from the first sentence to the finished work.
//
//   the home        one composer; words read live; a question instead of a guess when the words settle nothing
//   how much        a detailed brief made at once (no conversation page, the design composed — no directions to choose);
//                   a vague one asked what it cannot be made without, then a few creative questions drawn for it
//   visual answers  moods drawn by the engine, palettes to see (and a colour of your own), lettering set in real faces
//                   from the font library (loaded before they are shown); tapped, answered in words, skipped, "show me
//                   others", "surprise me"; a reload keeps the question and its options
//   the model       the questions route scripted: the model's question takes the reader's place, "ready" makes the work;
//                   signed out (the real answer here), the reader's question stands and nothing waits
//   choices         "make it now" with a gap left marked, a logo's name never skipped, a website made at once
//   references      websites the person points to read through the server's guarded reader (recorded here), shown with
//                   the page drawn inert, what was read, and what to take; one that cannot be read said so; set aside
//   and             a phone's width, no generation route called, no image library and no outside host reached, no
//                   page errors
// Every outcome is read back from the browser's own store (IndexedDB) as well as from the page.
//
//   UXV0_FORWARD=1 UXV0_BASE=http://127.0.0.1:3100 node test/browser/ux-v0/studio-qa.mjs
import { chromium, S, BASE } from './env.mjs';

let pass = 0;
let fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok  ', n)) : (fail++, console.log('  FAIL', n, String(x).slice(0, 600))));
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
  if (/\/api\/ux-v0\/(generate|refine|brief|discover|direct|critique|images|art)/.test(r.url())) modelCalls.push(r.url());
  if (u.origin !== new URL(BASE).origin && /^https?:$/.test(u.protocol)) outside.add(u.host);
});

// the server's reader, recorded: what /api/ux-v0/reference answers for a site it can read, and for one it cannot
const LARKFIELD = {
  read: { url: 'https://larkfield.studio/', host: 'larkfield.studio', title: 'Larkfield Bakery', description: 'Sourdough, baked at dawn.', colours: ['#f6f1e7', '#2b2118', '#b4532a', '#e7dccb'], ground: '#f6f1e7', ink: '#2b2118', accent: '#b4532a', fonts: ['Fraunces', 'Inter'], notes: ['a light ground', 'a warm accent', 'serif headings'] },
  preview: '<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'"><style>body{margin:0;background:#f6f1e7;color:#2b2118;font:20px Georgia,serif}h1{font-size:96px;margin:120px 80px 0}p{margin:24px 80px;font:22px sans-serif;color:#b4532a}</style></head><body><h1>Larkfield Bakery</h1><p>Sourdough, baked at dawn.</p></body></html>',
};
await ctx.route('**/api/ux-v0/reference', async (route) => {
  const { url } = JSON.parse(route.request().postData() || '{}');
  read.push(url);
  if (/larkfield/.test(url)) return route.fulfill({ json: LARKFIELD });
  return route.fulfill({ status: 422, json: { error: 'The site did not answer.' } });
});

// the questions route, scripted: signed out by default (as it really is here, with placeholder keys); a model's
// question, or "ready", where a scenario asks for one
let model = { mode: 'signed-out', answers: [] };
const MODEL_VIBES = {
  ready: false,
  question: {
    id: 'q-model',
    kind: 'vibe',
    decides: 'vibe',
    text: 'Which morning should the post feel like?',
    by: 'model',
    vibes: [
      { id: 'vibe-0', name: 'First light', note: 'pale flour tones, a soft crust-brown accent, a humanist serif', qualities: ['warm', 'calm'], character: 'humanist', palette: { ground: '#f6efe3', ink: '#2a1f16', accent: '#a65a2a', support: ['#e2c9a6'] }, form: 'organic' },
      { id: 'vibe-1', name: 'Sugar rush', note: 'bright icing colours, rounded type, playful forms', qualities: ['playful', 'colourful'], character: 'friendly', palette: { ground: '#fff4f6', ink: '#2b1a24', accent: '#e0457b', support: ['#ffd166'] }, form: 'organic' },
      { id: 'vibe-2', name: 'Old oven', note: 'faded print colours and a retro face, with grain', qualities: ['retro', 'warm'], character: 'retro', palette: { ground: '#efe4cf', ink: '#2c2218', accent: '#b4532a', support: ['#6b8f71'] }, form: 'orb' },
    ],
  },
};
await ctx.route('**/api/ux-v0/studio-questions', async (route) => {
  const body = JSON.parse(route.request().postData() || '{}');
  questionCalls.push(body.context ?? null);
  if (model.mode === 'signed-out') return route.fulfill({ status: 401, json: { error: 'Sign in to use SocriaUX’s reasoning.', signIn: true } });
  const next = model.answers.shift() ?? { ready: true, question: null };
  return route.fulfill({ json: next });
});

// the designer's route, scripted (no model here): a first design that sets the brief's quoted words, and an "ok" to a
// look — streamed as the route streams it
const designCalls = [];
await ctx.route('**/api/ux-v0/design', async (route) => {
  const body = JSON.parse(route.request().postData() || '{}');
  designCalls.push(body);
  const words = (String(body.memory?.brief ?? '').match(/[“"]([^”"]+)[”"]/) ?? [])[1] ?? 'Untitled';
  const text = body.mode === 'look' ? '<say>It reads.</say><ok/>' : `<say>A first design.</say><artboard id="new-1" name="${body.kind === 'logo' ? 'Logo sheet' : 'Poster'}" format="${body.format}"><style>.sx-root{background:#f2efe8}h1{position:absolute;left:80px;top:120px;margin:0;font:700 140px/0.9 'Instrument Serif',serif;color:#15181b}</style><h1>${words}</h1></artboard>`;
  const lines = [{ type: 'accepted', op: 'x' }, { type: 'text', delta: text }, { type: 'result', status: 200, body: { text, model: 'scripted', usage: { input: 0, output: 0, cost: 0 } } }];
  return route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: lines.map((l) => JSON.stringify(l)).join('\n') + '\n' });
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
  await page.waitForTimeout(500);
};
const reply = async (words) => {
  await page.fill('#sd-reply', words);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(600);
};
const said = () => page.locator('.sd-msg.is-socria .sd-said').allInnerTexts();
const lastSaid = async () => (await said()).at(-1) ?? '';
const suggestions = () => page.locator('.sd-suggestion').allInnerTexts();
const questionsAsked = async () => ((await project())?.studio?.transcript ?? []).filter((m) => m.from === 'socria' && m.kind === 'question').length;
// the design workspace (signed out here, as the app really is with placeholder keys: it opens with the brief and asks
// to sign in before anything is sent to the designer)
const designed = () => page.waitForSelector('.dx', { timeout: 30000 });

console.log('=== the home ===');
await goHome();
ok('one composer, with Begin', (await page.locator(COMPOSER).count()) === 1 && (await page.getByRole('button', { name: 'Begin' }).count()) === 1);
ok('no image library named anywhere: websites you point to are read instead', !/openverse|image librar/i.test(await page.locator('body').innerText()) && /Websites you point to/.test(await page.locator('.sd-foot').innerText()));
await page.fill(COMPOSER, 'something for my bakery');
await page.waitForTimeout(700);
ok('words that settle nothing: “I’ll ask what it is”, never a guess or a menu of kinds', /I’ll ask what it is/.test(await page.locator('.sd-reading').innerText()) && !(await page.locator('.sd-clarify, .sd-card').count()), await page.locator('.sd-reading').innerText());
await shot('01-home');

console.log('\n=== a detailed brief is made at once ===');
await begin('A bold, experimental poster for “Field Lines”, “Code that draws”, 12–30 June 2027, Lisbon, in the style of a Swiss poster');
await designed();
let p = await until(async () => {
  const x = await project();
  return x?.medium === 'design' ? x : null;
}, 30000);
ok('no conversation page and no directions to choose: the design workspace, ready to design (signed out: asks to sign in, sends nothing)', (await page.locator('.sd-chat').count()) === 0 && (await page.locator('.dx').count()) === 1 && p?.medium === 'design' && designCalls.length === 0 && /Sign in/.test(await page.locator('.dx-chat textarea').getAttribute('placeholder')), await page.url());
ok('…nothing was asked; what was understood is said once, as making', p?.studio && p.studio.transcript.filter((m) => m.from === 'socria' && m.kind === 'question').length === 0 && p.studio.transcript.some((m) => m.stage === 'making') && p.studio.status === 'started', JSON.stringify(p?.studio?.transcript?.map((m) => [m.kind, m.text.slice(0, 60)])));
ok('…the words exactly as written, and the form, from the sentence: the brief the designer will be given', /Field Lines/.test(p.design.memory.brief) && p.design.kind === 'poster' && !!p.design.format, JSON.stringify(p.design.memory));
await page.waitForTimeout(800);
await shot('02-detailed-made');

console.log('\n=== a vague request: what it is, its words, then a few questions drawn for it ===');
await goHome();
await begin('something for my bakery');
ok('a conversation, opened on the one thing it cannot know: what it is', (await page.locator('.sd-chat').count()) === 1 && /What are you after/.test(await lastSaid()), await lastSaid());
const sug = await suggestions();
ok('…with at most three ways to answer at a tap, and room to write', sug.length > 0 && sug.length <= 3 && (await page.locator('#sd-reply').count()) === 1, JSON.stringify(sug));
ok('“Make it now” waits until it knows what it is making', await page.locator('.sd-make').isDisabled());
await page.locator('.sd-suggestion').filter({ hasText: 'A poster' }).first().click();
await page.waitForTimeout(500);
ok('a poster, then: the next question is the one a poster needs, its words', /What should the poster say/.test(await lastSaid()), await lastSaid());
await reply('Grand Opening — Saturday 4 May, 9am, 12 Mill Lane');
await page.waitForSelector('.sd-dq-card.is-vibe', { timeout: 15000 });
await page.waitForTimeout(600);
const tiles = page.locator('.sd-dq-card.is-vibe');
ok('then how it should feel: moods drawn by the engine for it, each a small composition in the poster’s own words', (await tiles.count()) >= 3 && (await page.locator('.sd-dq-vibe svg').count()) >= 3 && (await page.locator('.sd-dq-vibe svg').first().innerHTML()).includes('Grand Opening'), await lastSaid());
ok('…with “Show me others”, “Surprise me” and “Skip” beside them', (await page.locator('.sd-dq-acts .sd-chip').allInnerTexts()).join('|') === 'Show me others|Surprise me|Skip', (await page.locator('.sd-dq-acts .sd-chip').allInnerTexts()).join('|'));
await shot('03-vibe-question');
const moodNames0 = (await page.locator('.sd-dq-card.is-vibe .sd-dq-name').allInnerTexts()).join('|');
await page.locator('.sd-dq-acts .sd-chip').filter({ hasText: 'Show me others' }).click();
await page.waitForTimeout(800);
const moodNames1 = (await page.locator('.sd-dq-card.is-vibe .sd-dq-name').allInnerTexts()).join('|');
ok('“Show me others”: other moods for the same question', moodNames1 && moodNames1 !== moodNames0 && /some others/i.test(await lastSaid()), `${moodNames0} → ${moodNames1}`);
const chosenMood = (await page.locator('.sd-dq-card.is-vibe .sd-dq-name').first().innerText()).trim();
await page.locator('.sd-dq-card.is-vibe').first().click();
await designed();
p = await started();
ok('a mood tapped: recorded as the person’s, and the poster is made in it (one creative question, asked once — “show me others” asked it again with other moods)', p?.studio?.answers['g.vibe']?.fields?.name === chosenMood && p.medium === 'design' && /Grand Opening/.test(p.design.memory.brief) && p.design.memory.brief.includes(chosenMood) && JSON.stringify(p.studio.discovery?.asked) === '["vibe"]', JSON.stringify({ v: p?.studio?.answers['g.vibe'], asked: p?.studio?.discovery?.asked }));
await until(async () => (await project())?.medium === 'design', 20000);
await page.waitForTimeout(800);
await shot('04-made-in-the-mood');

console.log('\n=== skipping, a colour of your own, a reload keeps the question ===');
await goHome();
await begin('A poster for “Open Day”');
await page.waitForSelector('.sd-dq-card.is-vibe', { timeout: 15000 });
ok('a thin brief: how it should feel, as moods to choose from', (await page.locator('.sd-dq-card.is-vibe').count()) >= 3 && /How should the poster feel/.test(await lastSaid()), await lastSaid());
const before = (await page.locator('.sd-dq-card.is-vibe .sd-dq-name').allInnerTexts()).join('|');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.sd-dq-card.is-vibe', { timeout: 15000 });
ok('a reload: the conversation is where it was, the same moods offered', (await page.locator('.sd-dq-card.is-vibe .sd-dq-name').allInnerTexts()).join('|') === before, before);
await page.locator('.sd-dq-acts .sd-chip').filter({ hasText: 'Skip' }).click();
await page.waitForSelector('.sd-dq-card .sd-dq-pal', { timeout: 15000 });
await page.waitForTimeout(500);
ok('skipped: “I’ll decide that”, then its colours — palettes to see, each with its ink on its ground', /I’ll decide that/.test(await lastSaid()) && (await page.locator('.sd-dq-pal').count()) >= 3 && (await page.locator('.sd-dq-pal-aa').count()) >= 3, await lastSaid());
ok('…and a colour of your own a tap away', (await page.locator('.sd-dq-own input[type="color"]').count()) === 1);
await shot('05-colour-question');
await reply('#c2410c');
await designed();
p = await started();
ok('a hex code in the person’s own words: the accent, and the poster is made', p?.studio?.answers['g.palette']?.fields?.accent === '#c2410c' && p.studio.answers['g.vibe']?.skipped === true, JSON.stringify(p?.studio?.answers['g.palette']));

console.log('\n=== a logo: its name, then its lettering in real faces ===');
await goHome();
await begin('A logo for a coffee roastery');
ok('a logo without its name: the name is asked, and “Make it now” cannot do without it', /What is the name/.test(await lastSaid()) && (await page.locator('.sd-make').isDisabled()), await lastSaid());
await reply('It’s called Halden');
await page.waitForSelector('.sd-dq-card.is-face', { timeout: 15000 });
await page.waitForSelector('.sd-dq-list.is-faces.is-ready', { timeout: 15000 }).catch(() => null);
await page.waitForTimeout(800);
const specFaces = await page.locator('.sd-dq-spec').evaluateAll((els) => els.map((e) => getComputedStyle(e).fontFamily));
const loaded = await page.evaluate((fams) => fams.map((f) => document.fonts.check(`40px ${f.split(',')[0]}`)), specFaces);
ok('the name read from a sentence; then how its lettering should speak — “Halden” set in pairings of real faces, loaded before they are shown', /“Halden”/.test((await said()).join(' ')) && (await page.locator('.sd-dq-card.is-face').count()) >= 3 && (await page.locator('.sd-dq-spec').first().textContent()) === 'Halden' && loaded.filter(Boolean).length >= 2, JSON.stringify({ specFaces, loaded }));
await shot('06-type-question');
const faceName = (await page.locator('.sd-dq-card.is-face .sd-dq-name').first().innerText()).trim();
await page.locator('.sd-dq-card.is-face').first().click();
await page.waitForSelector('.sd-dq-pal', { timeout: 15000 });
ok('a pairing tapped and said back; then its colours', (await said()).some((t) => t.toLowerCase().includes(faceName.toLowerCase())) && (await page.locator('.sd-dq-pal').count()) >= 3, await lastSaid());
await page.locator('.sd-dq-acts .sd-chip').filter({ hasText: 'Surprise me' }).click();
await page.waitForSelector('.dx', { timeout: 30000 });
p = await started();
ok('“surprise me”: the logo is begun on a logo sheet in the design workspace, the name and the lettering chosen carried in its brief', p?.studio?.answers['l.name']?.fields?.name === 'Halden' && !!p.studio.answers['l.type']?.fields?.display && p.medium === 'design' && p.design.kind === 'logo' && p.design.format === 'logo-sheet' && /Halden/.test(p.design.memory.brief) && (await page.locator('.dx').count()) === 1, JSON.stringify({ n: p?.studio?.answers['l.name'], t: p?.studio?.answers['l.type'], d: p?.design && { kind: p.design.kind, format: p.design.format } }));
await page.waitForTimeout(800);
await shot('07-logo-made');

console.log('\n=== the model writes the question when it can be reached ===');
model = { mode: 'scripted', answers: [MODEL_VIBES, { ready: true, question: null }] };
await goHome();
await begin('An Instagram post for “Crumb & Co”, our bakery’s opening');
await page.waitForSelector('.sd-dq-card.is-vibe', { timeout: 15000 });
await until(async () => (await page.locator('.sd-dq-card.is-vibe .sd-dq-name').allInnerTexts()).includes('First light'), 10000);
ok('the model’s question takes the reader’s place: its own words and moods, drawn by the engine', /Which morning should the post feel like/.test(await lastSaid()) && (await page.locator('.sd-dq-card.is-vibe .sd-dq-name').allInnerTexts()).join('|') === 'First light|Sugar rush|Old oven', await lastSaid());
ok('…asked with the conversation as it stands (the brief, what is known, the budget), never more', questionCalls.at(-1)?.brief?.includes('Crumb & Co') && questionCalls.at(-1)?.open?.[0] === 'vibe' && questionCalls.at(-1)?.visualLeft === 2, JSON.stringify(questionCalls.at(-1)));
await shot('08-model-question');
await page.locator('.sd-dq-card.is-vibe').filter({ hasText: 'Old oven' }).click();
await designed();
p = await started();
ok('a model mood tapped, then the model says the brief is enough: the post is made at once', p?.studio?.answers['g.vibe']?.fields?.name === 'Old oven' && p.studio.discovery?.done === true && p.studio.transcript.some((m) => m.stage === 'making'), JSON.stringify({ v: p?.studio?.answers['g.vibe'], d: p?.studio?.discovery }));
model = { mode: 'signed-out', answers: [] };

console.log('\n=== “make it now”: gaps marked; a website made at once ===');
await goHome();
await begin('a website for my pottery classes');
ok('a website without its name: what it is called is asked', /What is it called/.test(await lastSaid()), await lastSaid());
await page.locator('.sd-make').click();
p = await started();
ok('“make it now”: the page is made with its name left as a marked gap', p && /^\[.+\]$/.test(p.studio.answers['w.words']?.fields?.brand ?? '') && p.specs?.length > 0, JSON.stringify(p?.studio?.answers['w.words']));
await goHome();
await begin('A website for “Stillwater Yoga” with bookings, calm and warm');
p = await started();
ok('a website with its name, purpose and feel: made at once, no looks to choose from', p?.mode === 'create' && p.specs?.length > 0 && (await page.locator('.sd-look').count()) === 0 && p.studio.transcript.filter((m) => m.from === 'socria' && m.kind === 'question').length === 0, JSON.stringify(p?.studio?.transcript?.map((m) => m.text.slice(0, 60))));
await page.waitForTimeout(1200);
await shot('09-website-made');

console.log('\n=== websites to learn from, while a question waits ===');
await goHome();
await begin('A website for “Mira Studio”');
await page.waitForSelector('.sd-suggestion', { timeout: 15000 });
ok('a website whose purpose is not said: what people should do on it, with a few suggested answers', /What should people be able to do on it/.test(await lastSaid()) && (await suggestions()).length >= 2, await lastSaid());
await reply('something like larkfield.studio, or like nowhere.design');
await page.waitForSelector('.sd-refcard', { timeout: 10000 });
await page.waitForTimeout(500);
p = await project();
ok('sites named in a sentence (“like larkfield.studio”) were asked of the server’s reader, nothing fetched from the browser', read.some((u) => /larkfield\.studio/.test(u)) && read.some((u) => /nowhere\.design/.test(u)) && ![...outside].some((h) => /larkfield|nowhere/.test(h)), JSON.stringify({ read, outside: [...outside] }));
const rc = page.locator('.sd-refcard').first();
ok('what was read is shown: the page drawn inert, its address, its colours, a designer’s notes', (await rc.locator('iframe[sandbox=""]').count()) === 1 && /larkfield\.studio/.test(await rc.innerText()) && (await rc.locator('.sd-refcard-sw span').count()) === 4 && /serif headings/.test(await rc.innerText()), await rc.innerText());
ok('…kept with the conversation, liked until said otherwise; the question still waits', p.studio.references?.length === 1 && p.studio.references[0].state === 'liked' && p.studio.pending === 'discover' && p.studio.discovery?.current?.decides === 'purpose');
ok('the site that could not be read is said plainly, with what to do instead', (await said()).some((t) => /I couldn’t read nowhere\.design: the site did not answer/.test(t) && /screenshot/.test(t)), JSON.stringify((await said()).slice(-3)));
await rc.locator('.sd-chip').filter({ hasText: 'Colours' }).click();
await page.waitForTimeout(400);
p = await project();
ok('what to take from it, at a tap: its colours only', JSON.stringify(p.studio.references[0].take) === '["colour"]', JSON.stringify(p.studio.references[0]));
await shot('10-reference-card');
await rc.getByRole('button', { name: 'Not this one' }).click();
await page.waitForTimeout(400);
ok('set aside: it speaks for nothing, and can be taken back', (await project()).studio.references[0].state === 'rejected' && (await page.getByRole('button', { name: 'Use it after all' }).count()) === 1);
await page.getByRole('button', { name: 'Use it after all' }).click();
await page.waitForTimeout(300);
await page.locator('.sd-suggestion').first().click();
await page.waitForTimeout(700);
p = await project();
ok('a suggested answer tapped: read as the person’s words, then the next question worth asking', !!p.studio.answers['w.purpose'] && p.studio.pending === 'discover' && p.studio.discovery?.current?.decides !== 'purpose', JSON.stringify({ p: p.studio.answers['w.purpose'], q: p.studio.discovery?.current?.decides }));
await page.locator('.sd-make').click();
p = await started();
ok('“make it now”: a working website, its colours from the site taken for them', p?.mode === 'create' && p.specs?.length > 0, JSON.stringify(p?.studio?.answers));

console.log('\n=== a phone ===');
await page.setViewportSize({ width: 390, height: 844 });
await goHome();
await begin('A poster for “Spring Fair”');
await page.waitForSelector('.sd-dq-card.is-vibe', { timeout: 15000 });
await page.waitForTimeout(500);
const fit = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
ok('the conversation and its moods fit a phone, no sideways scrolling', fit[0] <= fit[1], JSON.stringify(fit));
const comp = await page.locator('.sd-chat-composer').boundingBox();
ok('…the reply at the foot, within the screen', comp && comp.y + comp.height <= 844 + 1 && comp.x >= 0, JSON.stringify(comp));
await shot('11-phone');

console.log('\n=== and ===');
ok('no generation route was called (the questions route was asked, refused while signed out, and the reader’s questions stood)', modelCalls.length === 0 && questionCalls.length >= 3, modelCalls.join(' '));
// the app's own sign-in script (placeholder keys here) and the typefaces the engines set are the only hosts expected
const hosts = [...outside].filter((h) => !/^fonts\.(googleapis|gstatic)\.com$/.test(h) && !/clerk/.test(h));
ok('no image library and no other outside host reached from the browser (the sites read were read by the server)', !hosts.length && ![...outside].some((h) => /openverse|unsplash|pexels|flickr|wikimedia|larkfield|nowhere/.test(h)), [...outside].join(' '));
ok('no page errors', errors.length === 0, errors.join(' | '));

await b.close();
console.log(`\nstudio-qa: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
