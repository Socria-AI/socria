// test/browser/ux-v0/studio-qa.mjs — SocriaUX in the built app, driven as a person would: a conversation with a
// creative director, from the first sentence to the finished work.
//
//   the home        one composer; words read live; a question instead of a guess when the words settle nothing
//   how much        a detailed brief made at once (no conversation page, three directions waiting); a vague one asked
//                   one meaningful question at a time, answered in the person's own words or at a tap
//   choices         an optional question skipped, "make it now" with a gap left marked, a logo's name never skipped;
//                   a website's three looks chosen, combined, refused for others; a graphic's directions combined
//   references      websites the person points to read through the server's guarded reader (recorded here), shown with
//                   the page drawn inert, what was read, and what to take; one that cannot be read said so; set aside
//   and             a reload mid-conversation, a phone's width, no model route called, no image library and no outside
//                   host reached, no page errors
// Every outcome is read back from the browser's own store (IndexedDB) as well as from the page.
//
//   UXV0_FORWARD=1 UXV0_BASE=http://127.0.0.1:3100 node test/browser/ux-v0/studio-qa.mjs
import { chromium, S, BASE } from './env.mjs';

let pass = 0;
let fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok  ', n)) : (fail++, console.log('  FAIL', n, String(x).slice(0, 600))));
const errors = [];
const modelCalls = [];
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
const COMPOSER = 'textarea[aria-label="What do you want to make?"]';
const goHome = async () => {
  await page.goto(BASE + '/ux-v0', { waitUntil: 'networkidle' });
  await page.waitForSelector('.sd-home');
};
const begin = async (words) => {
  await page.fill(COMPOSER, words);
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Begin' }).click();
  await page.waitForSelector('.sd-chat, .gx, .bd, .v0-work', { timeout: 20000 });
  await page.waitForTimeout(400);
};
const reply = async (words) => {
  await page.fill('#sd-reply', words);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
};
const said = () => page.locator('.sd-msg.is-socria .sd-said').allInnerTexts();
const lastSaid = async () => (await said()).at(-1) ?? '';
const suggestions = () => page.locator('.sd-suggestion').allInnerTexts();
const questionsAsked = async () => ((await project())?.studio?.transcript ?? []).filter((m) => m.from === 'socria' && m.kind === 'question').length;

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
await page.waitForSelector('.gx-dir', { timeout: 25000 });
let p = await project();
ok('no conversation page: the graphics workspace, three directions waiting', (await page.locator('.sd-chat').count()) === 0 && (await page.locator('.gx-dir').count()) === 3, await page.url());
ok('…nothing was asked; what was understood is said once, as making', p?.studio && p.studio.transcript.filter((m) => m.from === 'socria' && m.kind === 'question').length === 0 && p.studio.transcript.some((m) => m.stage === 'making') && p.studio.status === 'started', JSON.stringify(p?.studio?.transcript?.map((m) => [m.kind, m.text.slice(0, 60)])));
ok('…the words exactly as written, and the form, from the sentence', p.graphic?.brief?.content?.headline === 'Field Lines' && p.graphic.brief.kind === 'poster', JSON.stringify(p.graphic?.brief?.content));
ok('the directions can be chosen, combined, refused for others, or left to SocriaUX', (await page.locator('.gx-dir-pick').count()) === 3 && (await page.getByRole('button', { name: 'Something different' }).count()) === 1 && (await page.getByRole('button', { name: 'You choose' }).count()) === 1 && (await page.getByRole('button', { name: 'Back to the brief' }).count()) === 0);
const names = (await page.locator('.gx-dir h2').allInnerTexts()).map((t) => t.trim());
await page.locator('.gx-dir-pick input').nth(0).check();
await page.locator('.gx-dir-pick input').nth(2).check();
await page.waitForTimeout(200);
await shot('02-directions-combine');
const combineBtn = page.locator('.gx-go .sb-btn').filter({ hasText: /’s colours, .*’s type and structure/ }).first();
ok('two ticked: offered both ways round, in words', (await page.locator('.gx-go .sb-btn').filter({ hasText: /’s colours/ }).count()) === 2, await page.locator('.gx-go').innerText());
await combineBtn.click();
p = await until(async () => {
  const x = await project();
  return x?.graphic?.doc ? x : null;
}, 20000);
ok('combined: composed in one direction made of two (the first’s colours, the third’s type and structure)', p?.graphic?.direction?.name?.includes('×') && p.graphic.direction.name.startsWith(names[0].replace(/From .*$/, '').trim()), p?.graphic?.direction?.name);
await page.waitForTimeout(600);
await shot('03-combined-composed');

console.log('\n=== a vague request: one meaningful question at a time ===');
await goHome();
await begin('something for my bakery');
ok('a conversation, opened on the one thing it cannot know: what it is', (await page.locator('.sd-chat').count()) === 1 && /What are you after/.test(await lastSaid()), await lastSaid());
const sug = await suggestions();
ok('…with at most three ways to answer at a tap, and room to write', sug.length > 0 && sug.length <= 3 && (await page.locator('#sd-reply').count()) === 1, JSON.stringify(sug));
ok('“Make it now” waits until it knows what it is making', await page.locator('.sd-make').isDisabled());
await page.locator('.sd-suggestion').filter({ hasText: 'A poster' }).first().click();
await page.waitForTimeout(500);
ok('a poster, then: the next question is the one a poster needs, its words', /What should the poster say/.test(await lastSaid()), await lastSaid());
await shot('04-vague-words-question');
await reply('Grand Opening — Saturday 4 May, 9am, 12 Mill Lane');
await page.waitForSelector('.gx-dir', { timeout: 25000 });
p = await project();
ok('answered in the person’s own words: the work is made with them (two questions in all)', p.graphic?.brief?.content?.headline === 'Grand Opening' && (p.studio.transcript.filter((m) => m.from === 'socria' && m.kind === 'question').length === 2), JSON.stringify({ c: p.graphic?.brief?.content, q: p.studio?.transcript?.filter((m) => m.kind === 'question').length }));

console.log('\n=== an optional question: skippable, asked once; a reload keeps the conversation ===');
await goHome();
await begin('A poster for “Open Day”');
ok('a thin brief: how it should feel, with suggestions for this work, and “Skip this”', /How should it feel/.test(await lastSaid()) && (await suggestions()).length === 3 && (await page.getByRole('button', { name: 'Skip this' }).count()) === 1, await lastSaid());
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.sd-chat');
ok('a reload: the conversation is where it was, the question still open', /How should it feel/.test(await lastSaid()) && (await page.getByRole('button', { name: 'Skip this' }).count()) === 1);
await page.getByRole('button', { name: 'Skip this' }).click();
await page.waitForSelector('.gx-dir', { timeout: 25000 });
p = await project();
ok('skipped: “I’ll decide that”, and the directions are made', p.studio.answers['g.personality']?.skipped === true && p.studio.transcript.some((m) => /I’ll decide that/.test(m.text)), JSON.stringify(p.studio.answers['g.personality']));

console.log('\n=== “make it now”: gaps marked, never the name of a logo ===');
await goHome();
await begin('A logo for a coffee roastery');
ok('a logo without its name: the name is asked, and “Make it now” cannot do without it', /What is the name/.test(await lastSaid()) && (await page.locator('.sd-make').isDisabled()), await lastSaid());
await reply('It’s called Halden');
ok('the name read from a sentence and said back; then the one optional question this thin brief earns: how it should feel', /“Halden”\. How should it feel/.test(await lastSaid()) && (await page.getByRole('button', { name: 'Skip this' }).count()) === 1, await lastSaid());
await reply('warm and crafted');
await page.waitForSelector('.gx, .gx-logo, .lx', { timeout: 25000 });
p = await until(async () => {
  const x = await project();
  return x?.studio?.status === 'started' ? x : null;
}, 15000);
ok('answered in a few words: the name set exactly, the feel kept, the concepts made', p?.studio?.answers['l.name']?.fields?.name === 'Halden' && p.studio.answers['l.personality']?.values?.includes('warm') && p.studio.status === 'started', JSON.stringify({ n: p?.studio?.answers['l.name'], f: p?.studio?.answers['l.personality'] }));
await goHome();
await begin('a website for my pottery classes');
ok('a website without its name: what it is called is asked', /What is it called/.test(await lastSaid()), await lastSaid());
await page.locator('.sd-make').click();
await page.waitForSelector('.v0-work, iframe.v0-frame, .v0', { timeout: 30000 });
p = await until(async () => {
  const x = await project();
  return x?.studio?.status === 'started' ? x : null;
}, 20000);
ok('“make it now”: the page is made with its name left as a marked gap, the look chosen by SocriaUX', p && /^\[.+\]$/.test(p.studio.answers['w.words']?.fields?.brand ?? '') && !p.studio.answers['w.aesthetic'], JSON.stringify(p?.studio?.answers['w.words']));

console.log('\n=== a website: looks to choose from, combine, refuse — and websites to learn from ===');
await goHome();
await begin('A website for “Stillwater Yoga” with bookings, calm and warm');
await page.waitForSelector('.sd-look', { timeout: 20000 });
ok('nothing asked: three looks offered, each a working page with the person’s words', (await page.locator('.sd-look').count()) === 3 && (await questionsAsked()) === 0 && /three directions/i.test(await lastSaid()), await lastSaid());
await until(async () => (await page.locator('.sd-look iframe.sd-shot-frame').count()) === 3, 20000);
ok('…drawn as pages (three sealed frames)', (await page.locator('.sd-look iframe.sd-shot-frame').count()) === 3);
ok('…and “Make it now” is not offered beside them (choosing is: one, two combined, others, or “You choose”)', (await page.locator('.sd-make').count()) === 0 && (await page.getByRole('button', { name: 'You choose' }).count()) === 1 && (await page.getByRole('button', { name: 'Something different' }).count()) === 1);
await shot('05-website-looks');
const looks0 = (await page.locator('.sd-look-t').allInnerTexts()).join('|');
await page.getByRole('button', { name: 'Something different' }).click();
await page.waitForTimeout(900);
const looks1 = (await page.locator('.sd-look-t').allInnerTexts()).join('|');
ok('“Something different”: three others, kept apart from those seen', looks1 && looks1 !== looks0 && (await project()).studio.round === 1, `${looks0} → ${looks1}`);
// a site to learn from, and one that cannot be read
await reply('something like larkfield.studio, or like nowhere.design');
await page.waitForSelector('.sd-refcard', { timeout: 10000 });
await page.waitForTimeout(500);
p = await project();
ok('sites named in a sentence (“like larkfield.studio”) were asked of the server’s reader, nothing fetched from the browser', read.some((u) => /larkfield\.studio/.test(u)) && read.some((u) => /nowhere\.design/.test(u)) && ![...outside].some((h) => /larkfield|nowhere/.test(h)), JSON.stringify({ read, outside: [...outside] }));
const rc = page.locator('.sd-refcard').first();
ok('what was read is shown: the page drawn inert, its address, its colours, a designer’s notes', (await rc.locator('iframe[sandbox=""]').count()) === 1 && /larkfield\.studio/.test(await rc.innerText()) && (await rc.locator('.sd-refcard-sw span').count()) === 4 && /serif headings/.test(await rc.innerText()), await rc.innerText());
ok('…kept with the conversation, liked until said otherwise', p.studio.references?.length === 1 && p.studio.references[0].state === 'liked' && p.studio.references[0].kind === 'site');
ok('the site that could not be read is said plainly, with what to do instead', (await said()).some((t) => /I couldn’t read nowhere\.design: the site did not answer/.test(t) && /screenshot/.test(t)), JSON.stringify((await said()).slice(-3)));
await rc.locator('.sd-chip').filter({ hasText: 'Colours' }).click();
await page.waitForTimeout(400);
p = await project();
ok('what to take from it, at a tap: its colours only', JSON.stringify(p.studio.references[0].take) === '["colour"]', JSON.stringify(p.studio.references[0]));
await shot('06-reference-card');
ok('the looks still on offer after the reading, drawn again with it', (await page.locator('.sd-look .sd-look-pick input').count()) === 3);
await rc.getByRole('button', { name: 'Not this one' }).click();
await page.waitForTimeout(400);
ok('set aside: it speaks for nothing, and can be taken back', (await project()).studio.references[0].state === 'rejected' && (await page.getByRole('button', { name: 'Use it after all' }).count()) === 1);
await page.getByRole('button', { name: 'Use it after all' }).click();
await page.waitForTimeout(300);
// two looks combined
await page.locator('.sd-look-pick input').nth(0).check();
await page.locator('.sd-look-pick input').nth(2).check();
await page.waitForTimeout(200);
ok('two ticked: both combinations offered, in words', (await page.locator('.sd-looks-bar .sd-pill').filter({ hasText: /’s colours/ }).count()) === 2);
await page.locator('.sd-looks-bar .sd-pill').filter({ hasText: /’s colours/ }).first().click();
p = await until(async () => {
  const x = await project();
  return x?.studio?.status === 'started' ? x : null;
}, 30000);
ok('combined and made: the first’s colours with the third’s type and structure, a working website', p?.studio?.answers['w.aesthetic']?.values?.[0] === 'mix-0-2' && p.mode === 'create' && p.specs?.length > 0, JSON.stringify(p?.studio?.answers['w.aesthetic']));
await page.waitForTimeout(800);
await shot('07-website-made');

console.log('\n=== a phone ===');
await page.setViewportSize({ width: 390, height: 844 });
await goHome();
await begin('A poster for “Spring Fair”');
await page.waitForSelector('.sd-chat');
const fit = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
ok('the conversation fits a phone, no sideways scrolling', fit[0] <= fit[1], JSON.stringify(fit));
const comp = await page.locator('.sd-chat-composer').boundingBox();
ok('…the reply at the foot, within the screen', comp && comp.y + comp.height <= 844 + 1 && comp.x >= 0, JSON.stringify(comp));
await shot('08-phone');

console.log('\n=== and ===');
ok('no model route was called', modelCalls.length === 0, modelCalls.join(' '));
// the app's own sign-in script (placeholder keys here) and the typefaces the engines set are the only hosts expected
const hosts = [...outside].filter((h) => !/^fonts\.(googleapis|gstatic)\.com$/.test(h) && !/clerk/.test(h));
ok('no image library and no other outside host reached from the browser (the sites read were read by the server)', !hosts.length && ![...outside].some((h) => /openverse|unsplash|pexels|flickr|wikimedia|larkfield|nowhere/.test(h)), [...outside].join(' '));
ok('no page errors', errors.length === 0, errors.join(' | '));

await b.close();
console.log(`\nstudio-qa: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
