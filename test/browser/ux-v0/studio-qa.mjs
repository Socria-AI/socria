// test/browser/ux-v0/studio-qa.mjs — the SocriaUX studio in the built app, driven as a person would: the chat-first
// home (the composer, the six kinds of work and Any, the live reading of the words, a question instead of a guess,
// examples, the design system selector, files and links), the conversation for each kind of work (every kind of
// control: cards drawn by the engines, chips, a ranking, colours, type in its own faces, sliders, fields, counts and
// files; skip, back, "you decide", "surprise me", "something else", reopening a decision from the side and from the
// path, changing a decision in words), persistence through a reload, the start into each engine's workspace with the
// conversation kept beside it (and words sent from it), recents and history, a phone, and no model route called.
// Every outcome is read back from the browser's own store (IndexedDB) as well as from the page.
//
//   UXV0_FORWARD=1 UXV0_BASE=http://127.0.0.1:3100 node test/browser/ux-v0/studio-qa.mjs
//   (needs test/.tmp/dsi-under-test.mjs to seed a design system: `node test/run.mjs design-system-intelligence`)
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { chromium, S, BASE, FX, ROOT } from './env.mjs';

const D = await import(pathToFileURL(`${ROOT}test/.tmp/dsi-under-test.mjs`).href);

let pass = 0;
let fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok  ', n)) : (fail++, console.log('  FAIL', n, String(x).slice(0, 600))));
const errors = [];
const modelCalls = [];
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
// console errors that are the test environment's, not the studio's: sign-in cannot load with placeholder keys and no
// network, and an imported page's own stylesheet is refused by the sealed frame's policy (as it should be)
page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|favicon|fonts\.g|Clerk|Content Security Policy/.test(m.text()) && errors.push(`console: ${m.text().slice(0, 300)}`));
page.on('request', (r) => {
  if (/\/api\/ux-v0\/(generate|refine|brief|discover|direct|critique|images|art)/.test(r.url())) modelCalls.push(r.url());
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
const idbPut = (db, store, value) =>
  page.evaluate(
    ({ db, store, value }) =>
      new Promise((res, rej) => {
        const req = indexedDB.open(db);
        req.onsuccess = () => {
          const t = req.result.transaction(store, 'readwrite');
          t.objectStore(store).put(value);
          t.oncomplete = () => res(true);
          t.onerror = () => rej(t.error);
        };
        req.onerror = () => rej(req.error);
      }),
    { db, store, value },
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
const stageId = () => page.locator('.sd-stage').first().getAttribute('data-stage').catch(() => null);
const goHome = async () => {
  await page.goto(BASE + '/ux-v0', { waitUntil: 'networkidle' });
  await page.waitForSelector('.sd-home');
};
const say = async (words) => {
  await page.fill('textarea[aria-label="What do you want to make?"]', words);
  await page.waitForTimeout(250);
};
const begin = async () => {
  await page.getByRole('button', { name: 'Begin' }).click();
  await page.waitForSelector('.sd-conv, .gx, .bd, .v0-work, .sd-clarify', { timeout: 15000 });
  await page.waitForTimeout(300);
};
const cont = async () => {
  await page.locator('.sd-stage').getByRole('button', { name: 'Continue' }).click();
  await page.waitForTimeout(350);
};
const card = (label) => page.locator('.sd-stage .sd-card, .sd-stage .sd-pal, .sd-stage .sd-type').filter({ hasText: label }).first();
const chip = (label) => page.locator('.sd-stage .sd-chip').filter({ hasText: new RegExp(`^${label}$`) }).first();
const pathTopics = async () => (await page.locator('.sd-path .sd-step-t').allInnerTexts()).map((t) => t.trim());
/** The conversation beside a workspace: docked on wide screens, one click away (and over the side) on narrower ones. */
const railOut = async () => {
  await page.waitForSelector('.sd-rail, .sd-rail-tab', { timeout: 10000 });
  if (!(await page.locator('.sd-rail').count())) await page.locator('.sd-rail-tab').click();
  await page.waitForSelector('.sd-rail', { timeout: 5000 });
};

// ── a design system to choose: seeded as a published record (the import itself is dsi-qa's) ──
await goHome();
const tokens = readFileSync(`${FX}dsi/halden.tokens.json`, 'utf8');
const imported = D.importJson([{ name: 'halden.tokens.json', text: tokens }], { now: Date.now() });
let rec = D.newRecord(imported.content, { now: Date.now() });
rec = D.publish(rec, { confirm: true, now: Date.now() }).record;
await idbPut('socria-ux-v0-systems', 'systems', rec);

console.log('=== the home: one question, six kinds of work ===');
await goHome();
ok('the question is asked in the voice face', /What do you want to make\?/.test(await page.locator('.sd-hello').innerText()));
ok('one composer, its field named for what it asks, with Begin', (await page.locator('textarea[aria-label="What do you want to make?"]').count()) === 1 && (await page.getByRole('button', { name: 'Begin' }).count()) === 1);
const radios = await page.locator('.sd-modes [role="radio"]').allInnerTexts();
ok('Any and the six kinds of work are offered', radios.map((t) => t.trim()).join('|') === 'Any|Graphic|Website|Logo|Design system|Board|Critique', radios.join('|'));
ok('exactly one file input on the home (the composer’s)', (await page.locator('input[type=file]').count()) === 1);
await page.getByRole('radio', { name: 'Logo', exact: true }).click();
ok('choosing a kind says what it is and how it goes', /mark, a wordmark/i.test(await page.locator('.sd-modecard').innerText()), await page.locator('.sd-modecard').innerText());
await page.locator('.sd-modecard .sd-example').first().click();
ok('an example fills the composer', /Halden/.test(await page.inputValue('textarea[aria-label="What do you want to make?"]')));
await page.getByRole('radio', { name: 'Any', exact: true }).click();
await say('A logo for “Halden”, a small coffee roastery');
await page.waitForTimeout(300);
ok('the words are read live: a logo', /Reads as logo/.test(await page.locator('.sd-reading').innerText()), await page.locator('.sd-reading').innerText());
await say('A poster for “Field Lines”');
await page.waitForTimeout(300);
ok('…and re-read as they change: a graphic', /Reads as graphic/.test(await page.locator('.sd-reading').innerText()), await page.locator('.sd-reading').innerText());
// the design system selector
await page.locator('.sd-sys-btn').click();
ok('the design system selector lists the published system', (await page.locator('.sd-pop-item').filter({ hasText: rec.name }).count()) === 1, await page.locator('.sd-pop').innerText());
await page.locator('.sd-pop-item').filter({ hasText: 'No design system' }).click();
ok('…and “None” can be chosen', /None/.test(await page.locator('.sd-sys-btn').innerText()));
// a sentence that settles nothing: asked, not guessed
await say('something for my bakery');
await page.getByRole('button', { name: 'Begin' }).click();
await page.waitForSelector('.sd-clarify', { timeout: 5000 });
const clar = await page.locator('.sd-clarify .sd-card').allInnerTexts();
ok('words that settle nothing are asked about, with the six kinds', clar.length === 6, clar.join(' / '));
ok('…and no project is made before the kind is known', ((await idb('socria-ux-v0', 'projects')) ?? []).length === 0);
await shot('home');

console.log('=== a graphic: words, look, colour, type, composition, balance ===');
await say('A poster for “Field Lines”, a creative coding night, bold and playful');
await begin();
ok('the conversation opens at its own address', !!pid() && (await page.locator('.sd-conv').count()) === 1);
let p = await until(project);
ok('the conversation is kept on a project from the first word', p?.studio?.mode === 'graphic' && p.studio.status === 'discovering' && p.studio.modeBy === 'recognised', JSON.stringify(p?.studio ?? null).slice(0, 300));
const firstMsgs = await page.locator('.sd-transcript .sd-msg').allInnerTexts();
ok('the opening words are the person’s, Socria says what it heard', /Field Lines/.test(firstMsgs[0] ?? '') && firstMsgs.some((t) => /reads as a graphic/i.test(t)), firstMsgs.join(' | ').slice(0, 400));
ok('what the words already settle is said, not asked', firstMsgs.some((t) => /From your words/.test(t) && /Poster/.test(t) && /Field Lines/.test(t)), firstMsgs.join(' | ').slice(0, 500));
ok('the first question is the look (form, words and feel came from the words)', (await stageId()) === 'g.style', await stageId());
await until(async () => (await page.locator('.sd-stage .sd-shot-svg svg').count()) >= 4, 20000);
const firstShot = await page.locator('.sd-stage .sd-shot-svg').first().innerHTML();
ok('the style cards are the person’s words composed by the engine', (await page.locator('.sd-stage .sd-shot-svg svg').count()) >= 4 && /field/i.test(firstShot) && /lines/i.test(firstShot), firstShot.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 200));
await shot('graphic-look');
const looks = page.locator('.sd-stage .sd-card');
await looks.nth(0).click();
await looks.nth(1).click();
await looks.nth(2).click();
ok('two styles at most: a third takes the place of the first', (await page.locator('.sd-stage .sd-card[aria-pressed="true"]').count()) === 2);
await cont();
ok('with the accessible questions done, SocriaUX says it has enough', /enough to begin/i.test(await page.locator('.sd-stage.is-enough').innerText()), await page.locator('.sd-column').innerText());
ok('…and says what starting will do', /compose “Field Lines” three ways/.test(await page.locator('.sd-stage.is-enough .sd-why').innerText()), await page.locator('.sd-stage.is-enough .sd-why').innerText());
await page.getByRole('button', { name: /Keep refining/ }).click();
await page.waitForTimeout(300);
ok('“Keep refining” opens the deeper questions: colour', (await stageId()) === 'g.palette', await stageId());
ok('palettes are real swatches', (await page.locator('.sd-stage .sd-pal-strip span').count()) >= 12);
await page.getByRole('button', { name: 'Choose your own colours' }).click();
await page.fill('input[aria-label="Accent as a hex value"]', '#c2410c');
await cont();
p = await project();
ok('your own colours are kept exactly', p.studio.answers['g.palette']?.fields?.accent === '#c2410c', JSON.stringify(p.studio.answers['g.palette']));
ok('type pairings are set in their own faces', (await stageId()) === 'g.type' && (await page.locator('.sd-stage .sd-type-aa').count()) >= 3);
const face = await page.locator('.sd-stage .sd-type-aa').first().evaluate((el) => getComputedStyle(el).fontFamily);
ok('…each card naming its face', face.length > 0 && !/Instrument Serif/.test(face), face);
await page.locator('.sd-stage .sd-type').first().click();
await page.waitForTimeout(350);
ok('a single choice moves on at once: composition', (await stageId()) === 'g.composition', await stageId());
await until(async () => (await page.locator('.sd-stage .sd-shot-svg svg').count()) >= 4, 25000);
ok('compositions are the person’s design organised by the generative engine', (await page.locator('.sd-stage .sd-shot-svg svg').count()) >= 4);
await shot('graphic-composition');
await page.locator('.sd-stage').getByRole('button', { name: /Back/ }).click();
await page.waitForTimeout(350);
ok('Back takes the last answer back: type again', (await stageId()) === 'g.type', await stageId());
await page.locator('.sd-stage .sd-type').nth(1).click();
await page.waitForTimeout(300);
await page.locator('.sd-stage').getByRole('button', { name: 'Skip' }).click();
await page.waitForTimeout(300);
p = await project();
ok('Skip leaves a question unanswered and moves on', p.studio.answers['g.composition']?.skipped === true && (await stageId()) !== 'g.composition');
await page.getByRole('button', { name: /Keep refining/ }).click().catch(() => {});
await page.waitForTimeout(300);
ok('the finest questions follow: balance (sliders)', (await stageId()) === 'g.feel', await stageId());
const slider = page.locator('.sd-stage input[type=range]').first();
await slider.focus();
for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight');
await cont();
p = await project();
ok('only the slider moved is said', Object.keys(p.studio.answers['g.feel']?.numbers ?? {}).length === 1, JSON.stringify(p.studio.answers['g.feel']));
ok('what to avoid: chips', (await stageId()) === 'g.avoid' && (await page.locator('.sd-stage .sd-chip').count()) >= 4);
await page.getByRole('button', { name: /Something else\?/ }).click();
await page.locator('.sd-own-words textarea').fill('no gradients please');
await cont();
p = await project();
ok('“Something else” keeps the person’s own words', p.studio.answers['g.avoid']?.text === 'no gradients please', JSON.stringify(p.studio.answers['g.avoid']));
ok('pictures: an upload question', (await stageId()) === 'g.references' && (await page.locator('.sd-stage .sd-drop').count()) === 1);
await page.locator('.sd-stage input[type=file]').setInputFiles(FX + 'cafe-bar.jpg');
await until(async () => (await page.locator('.sd-stage .sd-file').count()) === 1);
ok('a picture added is listed with its colours', (await page.locator('.sd-stage .sd-file-sw span').count()) >= 3);
await cont();
ok('with a picture of their own, how to treat it is asked', (await stageId()) === 'g.treatment', await stageId());
await until(async () => (await page.locator('.sd-stage .sd-shot-svg svg image').count()) >= 5, 20000);
ok('…each treatment shown on the person’s own picture, with the engine’s effects', (await page.locator('.sd-stage .sd-shot-svg svg image').count()) >= 5 && (await page.locator('.sd-stage .sd-shot-svg svg filter').count()) >= 4);
await shot('graphic-treatment');
await card('Two colours').click();
await page.waitForTimeout(350);
// reopen from the side
const decisions = await page.locator('.sd-ctx-row').allInnerTexts();
ok('the side keeps every decision with where it came from', decisions.some((t) => /Form/.test(t) && /From your words/.test(t)) && decisions.some((t) => /Look/.test(t) && /Yours/.test(t)), decisions.join(' | ').slice(0, 500));
await page.locator('.sd-ctx-row').filter({ hasText: 'Look' }).getByRole('button', { name: /Change/ }).click();
await page.waitForTimeout(400);
ok('any decision can be opened again, with what was chosen still chosen', (await stageId()) === 'g.style' && (await page.locator('.sd-stage .sd-card[aria-pressed="true"]').count()) === 2);
await cont();
// change it in words
await page.fill('#sd-reply', 'make it calm and refined');
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
p = await project();
ok('a decision can be changed in words, and the change is said', ['calm', 'refined'].every((m) => p.studio.answers['g.personality']?.values.includes(m)) && /Changed the feel/.test(p.studio.transcript.at(-1).text), JSON.stringify(p.studio.answers['g.personality']));
// a reload keeps it all
const before = await page.locator('.sd-transcript .sd-msg').count();
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.sd-conv');
ok('a reload lands in the same conversation, everything said kept', (await page.locator('.sd-transcript .sd-msg').count()) === before && /enough to begin/i.test(await page.locator('.sd-column').innerText()));
await shot('graphic-enough');
const gid = pid();
await page.getByRole('button', { name: 'Start creating' }).click();
await page.waitForSelector('.gx', { timeout: 20000 });
p = await until(async () => {
  const x = await idb('socria-ux-v0', 'projects', gid);
  return x?.graphic?.options?.length ? x : null;
}, 15000);
ok('Start: the same project becomes the graphic, its directions proposed at once', p?.medium === 'graphic' && p.studio.status === 'started' && p.graphic.options.length >= 3 && p.graphic.brief.content.headline === 'Field Lines', JSON.stringify({ medium: p?.medium, n: p?.graphic?.options?.length }));
ok('…in the colours chosen', p.graphic.options.slice(0, 3).every((d) => d.tokens.colors.accent === '#c2410c'), p.graphic.options.map((d) => d.tokens.colors.accent).join(','));
ok('…with the picture given as an asset of the work', (p.graphic.assets ?? []).some((a) => a.src.startsWith('upload:')) && p.graphic.brief.images.length === 1);
ok('at this width the conversation waits one click away, not over the work', (await page.locator('.sd-rail-tab').count()) === 1 && (await page.locator('.sd-rail').count()) === 0);
await railOut();
ok('the conversation is beside the workspace, everything said in it', (await page.locator('.sd-rail').count()) === 1 && (await page.locator('.sd-rail .sd-msg').count()) >= 10);
await page.fill('#sd-rail-in', 'the second one');
await page.keyboard.press('Enter');
await page.waitForSelector('.gx-ask', { timeout: 20000 });
ok('words in the rail choose a direction: the design opens in the editor', (await page.locator('.gx-ask').count()) === 1);
p = await until(async () => {
  const x = await idb('socria-ux-v0', 'projects', gid);
  return x?.graphic?.doc ? x : null;
}, 8000);
const ownPics = [];
const walkNodes = (xs) => xs.forEach((n) => (n.type === 'image' && (p.graphic.doc.assets.find((a) => a.id === n.asset)?.source === 'upload') ? ownPics.push(n) : n.children && walkNodes(n.children)));
p.graphic.doc.artboards.forEach((b) => walkNodes(b.children));
ok('the picture is placed in the design, treated as chosen (a duotone in the chosen colours)', ownPics.length >= 1 && ownPics.every((n) => n.effects?.some((e) => e.kind === 'duotone' && e.color2 === '#c2410c')), JSON.stringify(ownPics.map((n) => n.effects)));
await page.fill('#sd-rail-in', 'make the headline bigger');
await page.keyboard.press('Enter');
await until(async () => /Previewing|could not read/.test(await page.locator('.sd-rail .sd-transcript').innerText()), 8000);
ok('a change asked in the rail is read by the editor, and its answer kept in the conversation', /Previewing/.test(await page.locator('.sd-rail .sd-transcript').innerText()), (await page.locator('.sd-rail .sd-transcript').innerText()).slice(-300));
await shot('graphic-rail');
p = await until(async () => {
  const x = await idb('socria-ux-v0', 'projects', gid);
  return x?.studio?.transcript?.some((m) => m.from === 'person' && m.text === 'make the headline bigger') ? x : null;
}, 6000);
ok('…and the transcript is kept on the project, the answer with it', !!p && p.studio.transcript.some((m) => m.from === 'socria' && /Previewing/.test(m.text)));

console.log('=== a logo: the questions follow the answers ===');
await goHome();
await page.getByRole('radio', { name: 'Logo', exact: true }).click();
await say('A logo for “Halden”, a small coffee roastery');
await begin();
ok('a chosen kind is the person’s', (await project())?.studio?.modeBy === 'person');
p = await project();
ok('the name came from the words: it is not asked', p.studio.answers['l.name']?.fields?.name === 'Halden' && (await stageId()) !== 'l.name', JSON.stringify(p.studio.answers['l.name']));
// the subject is asked only when the words did not say it ("coffee" does)
if ((await stageId()) === 'l.about') {
  ok('…the subject asked, with the likely one first', (await page.locator('.sd-stage .sd-chip.is-likely').count()) >= 1);
  await page.locator('.sd-stage .sd-chip').first().click();
  await cont();
} else ok('…nor the subject, which the words also said', p.studio.answers['l.about']?.source === 'words', JSON.stringify(p.studio.answers['l.about']));
ok('personality next', (await stageId()) === 'l.personality', await stageId());
await chip('Warm').click();
await chip('Crafted').click();
await cont();
ok('then the form, each drawn for the name by the logo engine', (await stageId()) === 'l.form');
await until(async () => (await page.locator('.sd-stage .sd-shot-svg svg').count()) >= 4, 25000);
ok('…logo concepts constructed for “Halden”', (await page.locator('.sd-stage .sd-shot-svg svg').count()) >= 4);
await shot('logo-forms');
await card('Typographic').click();
await page.waitForTimeout(350);
await page.getByRole('button', { name: /Keep refining/ }).click();
await page.waitForTimeout(300);
let topics = await pathTopics();
ok('a typographic logo is asked about its lettering, not a symbol', topics.includes('Lettering') && !topics.includes('Idea'), topics.join(','));
await page.locator('.sd-ctx-row').filter({ hasText: 'Form' }).getByRole('button', { name: /Change/ }).click();
await page.waitForTimeout(300);
await card('Abstract mark').click();
await page.waitForTimeout(350);
topics = await pathTopics();
ok('an abstract mark is asked what it should call to mind, not its lettering', topics.includes('Idea') && !topics.includes('Lettering'), topics.join(','));
const lid = pid();
await page.getByRole('button', { name: /Surprise me/ }).first().click();
await page.waitForSelector('.gx', { timeout: 20000 });
p = await until(async () => {
  const x = await idb('socria-ux-v0', 'projects', lid);
  return x?.graphic?.doc?.artboards?.some((ab) => ab.logo) ? x : null;
}, 15000);
ok('“Surprise me” leaves the rest to SocriaUX and begins: logo concepts constructed', !!p && p.graphic.brief.kind === 'logo' && p.graphic.brief.content.headline === 'Halden', JSON.stringify(p?.graphic?.brief ?? null).slice(0, 200));
ok('…the choices left to it said as such', Object.values(p.studio.answers).some((a) => a.delegated));

console.log('=== a website: purpose, people, what it must do, a look drawn as working pages ===');
await goHome();
await say('A website for “Halden Yoga”, a yoga studio with bookings');
await begin();
p = await project();
ok('a website is read from the words, its purpose too', p?.studio?.mode === 'website' && p.studio.answers['w.purpose']?.values[0] === 'bookings', JSON.stringify(p?.studio?.answers ?? {}).slice(0, 300));
ok('the first question is who it is for', (await stageId()) === 'w.audience', await stageId());
await page.locator('.sd-stage .sd-chip').first().click();
await cont();
ok('then what it must do', (await stageId()) === 'w.functions');
const fnChips = await page.locator('.sd-stage .sd-chip').allInnerTexts();
await page.locator('.sd-stage .sd-chip').filter({ hasText: /Booking|Book/ }).first().click();
await page.locator('.sd-stage .sd-chip').filter({ hasText: /Contact/ }).first().click().catch(() => {});
await cont();
ok('then the look: three working pages, each in its own system', (await stageId()) === 'w.aesthetic', `${await stageId()} | ${fnChips.join(',')}`);
await until(async () => (await page.locator('.sd-stage iframe.sd-shot-frame').count()) >= 3, 25000);
ok('…drawn as pages in sealed frames', (await page.locator('.sd-stage iframe.sd-shot-frame').count()) >= 3 && (await page.locator('.sd-stage iframe.sd-shot-frame').first().getAttribute('sandbox')) === '');
await shot('website-look');
await page.locator('.sd-stage .sd-card').nth(1).click();
await page.waitForTimeout(350);
await page.getByRole('button', { name: /Keep refining/ }).click();
await page.waitForTimeout(300);
ok('priorities are put in order (a ranking)', (await stageId()) === 'w.priorities' && (await page.locator('.sd-rank-row').count()) >= 3);
const firstRank = await page.locator('.sd-rank-row .sd-card-label').nth(1).innerText();
await page.locator('.sd-rank-row').nth(1).getByRole('button', { name: /up/ }).click();
ok('a ranking moves', (await page.locator('.sd-rank-row .sd-card-label').first().innerText()) === firstRank);
await cont();
p = await project();
ok('…and is kept in its order', p.studio.answers['w.priorities']?.values[0] && p.studio.answers['w.priorities'].values.length >= 3);
const wid = pid();
await page.getByRole('button', { name: 'Start creating' }).click();
await page.waitForSelector('.v0-work', { timeout: 20000 });
p = await until(async () => {
  const x = await idb('socria-ux-v0', 'projects', wid);
  return x?.specs?.length ? x : null;
}, 15000);
const kinds = (p?.specs?.[p.specIndex]?.sections ?? []).map((s) => s.kind);
ok('Start: a designed, working page, in the same project', !!p && p.studio.status === 'started' && kinds.includes('nav') && kinds.includes('footer'), kinds.join(','));
ok('…with what it must do as working parts (a booking)', kinds.includes('booking'), kinds.join(','));
await railOut();
ok('…and its conversation beside it', (await page.locator('.sd-rail').count()) === 1);
await page.waitForTimeout(700);
await shot('website-workspace');

console.log('=== a board: materials counted, an identity shared ===');
await goHome();
await say('A launch campaign for “Night Market”: two posters, three Instagram posts and a website');
await begin();
p = await project();
ok('a board, its materials counted from the words', p?.studio?.mode === 'board' && p.studio.answers['b.materials']?.numbers?.poster === 2, JSON.stringify(p?.studio?.answers?.['b.materials'] ?? null));
for (let i = 0; i < 6 && (await stageId()) && (await stageId()) !== 'b.direction'; i++) {
  const id = await stageId();
  if (id === 'b.identity') await card('Let SocriaUX propose').click();
  else if (id === 'b.objective') await page.locator('.sd-stage .sd-card').first().click();
  else await page.locator('.sd-stage').getByRole('button', { name: /You decide|Skip/ }).first().click();
  await page.waitForTimeout(350);
}
ok('the look of the whole campaign', (await stageId()) === 'b.direction');
await page.locator('.sd-stage .sd-card').first().click();
await cont();
await page.getByRole('button', { name: /Keep refining/ }).click();
await page.waitForTimeout(300);
for (let i = 0; i < 4 && (await stageId()) !== 'b.website' && (await stageId()); i++) {
  await page.locator('.sd-stage').getByRole('button', { name: /You decide|Skip/ }).first().click();
  await page.waitForTimeout(300);
}
ok('a board with a website is asked what the website must do', (await stageId()) === 'b.website', await stageId());
const bid = pid();
await page.getByRole('button', { name: /Start with this|Start creating/ }).first().click();
await page.waitForSelector('.bd', { timeout: 20000 });
p = await until(async () => {
  const x = await idb('socria-ux-v0', 'projects', bid);
  return x?.board?.options?.length ? x : null;
}, 15000);
ok('Start: the board’s systems proposed at once, its brief from the conversation', !!p && p.medium === 'board' && p.board.brief.content.headline === 'Night Market' && p.board.options.length >= 1, JSON.stringify(p?.board?.brief ?? null).slice(0, 200));
await railOut();
ok('…with the conversation beside it', (await page.locator('.sd-rail').count()) === 1);

console.log('=== a critique: the design is the request ===');
await goHome();
// the rail was brought out above, and that choice is kept; a fresh choice here
await page.evaluate(() => localStorage.removeItem('socriaux.studio.rail'));
await page.getByRole('radio', { name: 'Critique', exact: true }).click();
ok('Critique turns the composer into a door for a design', (await page.locator('.v0-way-drop').count()) === 1 && (await page.locator('input[type=file]').count()) === 1);
await page.locator('textarea[aria-label="What do you want to make?"]').fill('the hierarchy of the hero');
await page.locator('input[type=file]').setInputFiles(FX + 'existing-design.html');
await page.waitForSelector('iframe.v0-frame', { timeout: 15000 });
p = await project();
ok('a design brought to critique opens at once, the words kept with it', p?.mode === 'critique' && p.studio?.status === 'started' && p.studio.prompt === 'the hierarchy of the hero');
ok('…its conversation one click away (a critique’s cards are its own conversation)', (await page.locator('.sd-rail-tab').count()) === 1);
await page.locator('.sd-rail-tab').click();
ok('…and brought out, it holds the words', /the hierarchy of the hero/.test(await page.locator('.sd-rail').innerText()));
await page.locator('.sd-rail').getByRole('button', { name: 'Put the conversation away' }).click();
await goHome();
await say('Critique my landing page');
await begin();
ok('asked in words, a critique asks for the design first', (await project())?.studio?.mode === 'critique' && (await stageId()) === 'c.file', await stageId());
await page.locator('.sd-stage input[type=file]').setInputFiles(FX + 'existing-design.html');
await page.waitForTimeout(600);
ok('the file given, the focus next', (await stageId()) === 'c.focus', await stageId());
await page.locator('.sd-stage .sd-chip').first().click();
await cont();
await page.getByRole('button', { name: 'Begin the critique' }).click();
await page.waitForSelector('iframe.v0-frame', { timeout: 15000 });
ok('…then the critique opens on it', (await project())?.mode === 'critique');

console.log('=== a design system: what is attached settles the source ===');
await goHome();
await page.getByRole('radio', { name: 'Design system', exact: true }).click();
await page.locator('input[type=file]').setInputFiles({ name: 'halden.tokens.json', mimeType: 'application/json', buffer: Buffer.from(tokens) });
await page.locator('textarea[aria-label="What do you want to make?"]').fill('Bring in our tokens');
await begin();
p = await project();
ok('a tokens file settles the source and the files', p?.studio?.answers['s.source']?.values[0] === 'json' && (p.studio.answers['s.input']?.values.length ?? 0) === 1, JSON.stringify(p?.studio?.answers ?? {}).slice(0, 300));
await page.getByRole('button', { name: 'Bring it in' }).click();
await page.waitForSelector('.ds, .ds-wizard, [class*="ds-"]', { timeout: 15000 });
await page.waitForTimeout(800);
ok('“Bring it in” opens the import with the file already given', /halden\.tokens\.json|Categories|Analys|Preview/i.test(await page.locator('body').innerText()));
ok('…and the conversation, having handed over, is not left as a project', !((await idb('socria-ux-v0', 'projects')) ?? []).some((x) => x.studio?.mode === 'system'));

console.log('=== a work made in a design system ===');
await goHome();
await page.locator('.sd-sys-btn').click();
await page.locator('.sd-pop-item').filter({ hasText: rec.name }).click();
await page.getByRole('radio', { name: 'Graphic', exact: true }).click();
await say('An Instagram post “Open Studio”, Saturday 12 April');
await begin();
p = await project();
ok('the system chosen on the home is the conversation’s', p?.studio?.systemId === rec.id);
ok('…and its own colours and type are not asked about', !(await pathTopics()).includes('Colour') && !(await pathTopics()).includes('Type'), (await pathTopics()).join(','));
await page.locator('.sd-stage').getByRole('button', { name: /You decide|Skip/ }).first().click().catch(() => {});
await page.waitForTimeout(300);
const sid = pid();
await page.getByRole('button', { name: /Surprise me|Start creating|Start with this/ }).first().click();
await page.waitForSelector('.gx', { timeout: 20000 });
p = await until(async () => {
  const x = await idb('socria-ux-v0', 'projects', sid);
  return x?.graphic?.options?.length ? x : null;
}, 15000);
ok('the work is linked to the system when it begins', p?.systemLink?.id === rec.id, JSON.stringify(p?.systemLink ?? null));

console.log('=== write the brief yourself ===');
await goHome();
await page.getByRole('radio', { name: 'Graphic', exact: true }).click();
await say('A poster for “Letters in Motion”, a type exhibition');
await begin();
await page.getByRole('button', { name: 'Write the brief yourself' }).click();
await page.waitForSelector('.gx', { timeout: 15000 });
await page.waitForSelector('#gx-headline', { timeout: 10000 });
ok('“Write the brief yourself” opens the workspace’s own brief, with the words', (await page.locator('#gx-headline').inputValue()) === 'Letters in Motion', await page.locator('#gx-headline').inputValue());

console.log('=== recents and history ===');
await goHome();
await page.getByRole('radio', { name: 'Logo', exact: true }).click();
await say('A wordmark for “Otterly”, a children’s bookshop');
await begin();
await goHome();
const recent = await page.locator('.sd-recent-item').allInnerTexts();
ok('works still in conversation are first to pick up', /In conversation/.test(recent[0] ?? '') && /Otterly/.test(recent[0] ?? ''), recent.join(' | ').slice(0, 300));
const rows = page.locator('.v0-list-row');
ok('everything made is listed', (await rows.count()) >= 8, String(await rows.count()));
ok('a conversation is listed as one', (await page.locator('.mu-exhibit').filter({ hasText: 'Otterly' }).innerText()).includes('in conversation'));
await page.fill('.mu-search input', 'Otterly');
await page.waitForTimeout(300);
ok('the history can be searched', (await rows.count()) === 1);
await rows.first().getByRole('button', { name: 'Delete' }).click();
ok('a delete is asked in place, “Keep it” focused', (await page.evaluate(() => document.activeElement?.textContent?.trim())) === 'Keep it');
await page.getByRole('button', { name: 'Delete it' }).click();
await page.waitForTimeout(500);
ok('…and done', !((await idb('socria-ux-v0', 'projects')) ?? []).some((x) => x.name === 'Otterly'));
await page.fill('.mu-search input', '');
await page.locator('.sd-recent-open').first().click();
await page.waitForTimeout(800);
ok('a recent work opens where it was', !!pid());

console.log('=== a wide screen: the conversation docked ===');
await page.setViewportSize({ width: 1680, height: 1000 });
await page.evaluate(() => localStorage.removeItem('socriaux.studio.rail'));
await page.goto(BASE + '/ux-v0?p=' + gid, { waitUntil: 'networkidle' });
await page.waitForSelector('.gx', { timeout: 15000 });
await page.waitForTimeout(500);
const docked = await page.evaluate(() => ({ rail: !!document.querySelector('.sd-rail'), right: Math.round(window.innerWidth - (document.querySelector('.v0')?.getBoundingClientRect().right ?? 0)) }));
ok('on a wide screen the conversation is docked and the workspace moves aside for it', docked.rail && docked.right === 360, JSON.stringify(docked));
await shot('wide-docked');
await page.locator('.sd-rail').getByRole('button', { name: 'Put the conversation away' }).click();
await page.waitForTimeout(300);
const away = await page.evaluate(() => Math.round(window.innerWidth - (document.querySelector('.v0')?.getBoundingClientRect().right ?? 0)));
ok('…put away, the workspace has the whole width again (and the choice is kept)', away === 0 && (await page.evaluate(() => localStorage.getItem('socriaux.studio.rail'))) === 'closed', String(away));
await page.evaluate(() => localStorage.removeItem('socriaux.studio.rail'));
await page.setViewportSize({ width: 1440, height: 900 });

console.log('=== a phone ===');
await page.setViewportSize({ width: 390, height: 844 });
await goHome();
const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
ok('the home fits a phone, no sideways scroll', wide <= 1, String(wide));
await shot('phone-home');
await page.getByRole('radio', { name: 'Graphic', exact: true }).click();
await say('A story for “Night Swim”, a summer pool party');
await begin();
const wideConv = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
ok('the conversation fits a phone', wideConv <= 1 && (await page.locator('.sd-stage').count()) === 1, String(wideConv));
await page.getByRole('button', { name: /Decisions/ }).click();
await page.waitForTimeout(500);
ok('the decisions open as a sheet', await page.locator('.sd-side.is-open').isVisible());
await shot('phone-decisions');
await page.locator('.sd-side-close').click();
await page.waitForTimeout(450);
await shot('phone-conversation');
await page.setViewportSize({ width: 1440, height: 900 });

console.log('=== honesty ===');
ok('no model route was called anywhere in the studio', modelCalls.length === 0, modelCalls.join(', '));
ok('no page errors', errors.length === 0, errors.join(' | '));

await b.close();
console.log(`\nstudio-qa: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
