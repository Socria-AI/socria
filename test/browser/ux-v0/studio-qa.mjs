// test/browser/ux-v0/studio-qa.mjs — SocriaUX in the built app, driven as a person would: one conversation from the
// first sentence to the finished work.
//
//   the home        one composer and nothing else to read past (no kinds of work to pick, no palettes, styles or
//                   templates, no collection); words read live; pasted screenshots and attached files; a question
//                   instead of a guess; the design system offered only when there is one; everything made in its own
//                   view (?work=1), with a quiet way back to what was in progress
//   research        real references looked for on Openverse as the conversation opens — once against the live library
//                   (what happened is said, found or not, and matches what was kept), then against a recorded library
//                   for the rest: like, "not this", what each is liked for, search again, more like this, credits and
//                   sources, colours read from the pictures liked
//   questioning     the conversation on the left, the question on the right with what is taking shape under it;
//                   colour and type proposed from the references liked and the words, never from a stock list; skip,
//                   back, "you decide", "surprise me", reopening from the decisions, changes in words
//   the work        each engine's workspace with the conversation docked on the left, the one place to type: the work
//                   alone in front (the panels out by hand), a change previewed and applied in words, the steps of the
//                   old forms gone; graphic, logo, website, board, critique, design system, a work in a design system
//   and             a reload, a phone, no model route called, no page errors, no host but Openverse reached
// Every outcome is read back from the browser's own store (IndexedDB) as well as from the page.
//
//   UXV0_FORWARD=1 UXV0_BASE=http://127.0.0.1:3100 node test/browser/ux-v0/studio-qa.mjs
//   (needs test/.tmp/dsi-under-test.mjs to seed a design system: `node test/run.mjs design-system-intelligence`;
//    the live research check goes out through HTTPS_PROXY when one is set)
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { chromium, S, BASE, FX, ROOT } from './env.mjs';

const D = await import(pathToFileURL(`${ROOT}test/.tmp/dsi-under-test.mjs`).href);

let pass = 0;
let fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok  ', n)) : (fail++, console.log('  FAIL', n, String(x).slice(0, 600))));
const errors = [];
const modelCalls = [];
const outside = new Set();
const openverse = [];
// the one outside library the research uses is reached the way this machine reaches anything: through its proxy
const b = await chromium.launch(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {});
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
// console errors that are the test environment's, not the studio's: sign-in cannot load with placeholder keys and no
// network, and an imported page's own stylesheet is refused by the sealed frame's policy (as it should be)
page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|favicon|fonts\.g|Clerk|Content Security Policy|ERR_TUNNEL|ERR_PROXY/.test(m.text()) && errors.push(`console: ${m.text().slice(0, 300)}`));
page.on('request', (r) => {
  const u = new URL(r.url());
  if (/\/api\/ux-v0\/(generate|refine|brief|discover|direct|critique|images|art)/.test(r.url())) modelCalls.push(r.url());
  if (u.origin !== new URL(BASE).origin && /^https?:$/.test(u.protocol)) outside.add(u.host);
  if (u.host === 'api.openverse.org' && u.pathname === '/v1/images/') openverse.push(u.searchParams.get('q'));
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
const COMPOSER = 'textarea[aria-label="What do you want to make?"]';
const goHome = async () => {
  await page.goto(BASE + '/ux-v0', { waitUntil: 'networkidle' });
  await page.waitForSelector('.sd-home');
};
const say = async (words) => {
  await page.fill(COMPOSER, words);
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
const researched = () => until(async () => ((await project())?.studio?.research ? project() : null), 45000);
const refCards = () => page.locator('.sd-refs-grid .sd-ref:not(.is-wait)');
/** The conversation beside a workspace: docked on wide screens, one click away (and over the side) on narrower ones. */
const railOut = async () => {
  await page.waitForSelector('.sd-rail, .sd-rail-tab', { timeout: 10000 });
  if (!(await page.locator('.sd-rail').count())) await page.locator('.sd-rail-tab').click();
  await page.waitForSelector('.sd-rail', { timeout: 5000 });
};
const railSay = async (words) => {
  await page.fill('#sd-rail-in', words);
  await page.keyboard.press('Enter');
};
const leftOf = () => page.evaluate(() => Math.round(document.querySelector('.v0')?.getBoundingClientRect().left ?? -1));
const openDecisions = async () => {
  if (!(await page.locator('.sd-side.is-open').count())) await page.getByRole('button', { name: /^Decisions$/ }).click();
  await page.waitForTimeout(450);
};

// ── a recorded library, for the checks that need the same answer every time: Openverse's own shape, its pictures
// served from this repository's fixtures (with the CORS header the real thumbnails carry, so colours can be read) ──
const TITLES = [
  ['Swiss style poster, Zurich 1961', ['poster', 'swiss', 'typography']],
  ['Bauhaus exhibition poster', ['bauhaus', 'poster', 'print']],
  ['Letterpress type specimen', ['letterpress', 'typography', 'type']],
  ['Risograph gig poster', ['risograph', 'poster', 'print']],
  ['Modernist book cover', ['modernist', 'cover', 'book']],
  ['Hand-painted shop sign', ['sign', 'lettering', 'signage']],
  ['Concert poster, 1968', ['poster', 'concert', 'psychedelic']],
  ['Typographic grid study', ['grid', 'typography', 'layout']],
  ['Neon café sign at night', ['neon', 'sign', 'night']],
  ['Woodcut festival print', ['woodcut', 'print', 'festival']],
  ['Art deco cinema facade', ['art', 'deco', 'architecture']],
  ['Botanical label, 1890', ['label', 'vintage', 'illustration']],
  ['Brutalist magazine spread', ['magazine', 'editorial', 'layout']],
  ['Coffee roastery packaging', ['packaging', 'label', 'coffee']],
  ['Studio identity board', ['branding', 'identity', 'design']],
  ['Yoga studio interior', ['interior', 'wood', 'calm']],
];
const PICS = ['beans.jpg', 'cafe-bar.jpg', 'ceramic.jpg', 'dusk.jpg', 'grid.jpg', 'marble.jpg', 'people.jpg', 'pour.jpg', 'window.jpg'];
const slug = (q) => q.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
const hash = (q) => [...q].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const recorded = (q) => {
  const at = hash(q) % TITLES.length;
  return {
    result_count: 8,
    results: Array.from({ length: 8 }, (_, i) => {
      const [title, tags] = TITLES[(at + i) % TITLES.length];
      const id = `fx-${slug(q)}-${i}`;
      return { id, title, creator: ['A. Maker', 'B. Printer', 'C. Hand', 'D. Press'][i % 4], creator_url: '', url: `https://example.org/${id}.jpg`, thumbnail: `https://api.openverse.org/v1/images/${id}/thumb/`, width: [1200, 800, 1000, 900][i % 4], height: [800, 1200, 1000, 1200][i % 4], foreign_landing_url: `https://www.flickr.com/photos/fixture/${id}`, license: i % 3 === 0 ? 'cc0' : 'by', license_version: '2.0', license_url: 'https://creativecommons.org/licenses/by/2.0/', source: i % 2 ? 'wikimedia' : 'flickr', tags: tags.map((name) => ({ name })) };
    }),
  };
};
const useRecordedLibrary = async () => {
  await ctx.route(/^https:\/\/api\.openverse\.org\/v1\/images\/\?/, (route) => route.fulfill({ status: 200, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }, body: JSON.stringify(recorded(new URL(route.request().url()).searchParams.get('q') ?? '')) }));
  await ctx.route(/^https:\/\/api\.openverse\.org\/v1\/images\/[^/]+\/thumb\/$/, (route) => route.fulfill({ status: 200, headers: { 'content-type': 'image/jpeg', 'access-control-allow-origin': '*' }, body: readFileSync(FX + PICS[hash(route.request().url()) % PICS.length]) }));
};

console.log('=== the home: one composer, nothing else to read past ===');
await goHome();
ok('the question is asked in the voice face', /What do you want to make\?/.test(await page.locator('.sd-hello').innerText()));
ok('one composer, its field named for what it asks, with Begin', (await page.locator(COMPOSER).count()) === 1 && (await page.getByRole('button', { name: 'Begin' }).count()) === 1);
ok('exactly one file input on the home (the composer’s)', (await page.locator('input[type=file]').count()) === 1);
ok('no kinds of work to pick from, no examples, no collection', (await page.locator('[role="radio"]').count()) === 0 && (await page.locator('.sd-modes, .sd-modecard, .sd-example, .mu-collection, .sd-recent').count()) === 0);
ok('no palettes, styles or templates anywhere on it', !/palette|template|choose a style/i.test(await page.locator('main').innerText()), await page.locator('main').innerText());
ok('no design system offered while there is none', (await page.locator('.sd-sys-btn').count()) === 0);
const nav = (await page.locator('.sd-mast-nav').innerText()).replace(/\s+/g, ' ');
ok('the masthead: your work, design systems, the account', /Your work/.test(nav) && /Design systems/.test(nav) && /Sign in|Account/.test(nav), nav);
await say('A logo for “Halden”, a small coffee roastery');
await page.waitForTimeout(300);
ok('the words are read live: a logo', /Reads as logo/.test(await page.locator('.sd-reading').innerText()), await page.locator('.sd-reading').innerText());
await say('A poster for “Field Lines”');
await page.waitForTimeout(300);
ok('…and re-read as they change: a graphic', /Reads as graphic/.test(await page.locator('.sd-reading').innerText()), await page.locator('.sd-reading').innerText());
// a screenshot pasted from the clipboard is brought in; words pasted stay words
await page.locator(COMPOSER).evaluate(async (el) => {
  const blob = await (await fetch('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4nGP8z8DwnwEIGBkYGBgYAAAqHAMBsVkL9wAAAABJRU5ErkJggg==')).blob();
  const dt = new DataTransfer();
  dt.items.add(new File([blob], 'image.png', { type: 'image/png' }));
  el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
});
await page.waitForTimeout(300);
ok('a screenshot pasted is brought in, shown small, named', (await page.locator('.sd-attached .sd-att img').count()) === 1 && /Pasted/.test(await page.locator('.sd-attached').innerText()), await page.locator('.sd-attached').innerText().catch(() => ''));
ok('…and the words are still the words', (await page.inputValue(COMPOSER)) === 'A poster for “Field Lines”');
await page.locator('.sd-attached').getByRole('button', { name: /Remove/ }).click();
ok('…and can be taken out again', (await page.locator('.sd-attached').count()) === 0);
await say('something for my bakery');
await page.getByRole('button', { name: 'Begin' }).click();
await page.waitForSelector('.sd-clarify', { timeout: 5000 });
const clar = await page.locator('.sd-clarify .sd-card').allInnerTexts();
ok('words that settle nothing are asked about (what kind of work), not guessed', clar.length === 6, clar.join(' / '));
ok('…and no project is made before it is known', ((await idb('socria-ux-v0', 'projects')) ?? []).length === 0);
await shot('home');

// a design system, seeded as a published record (the import itself is dsi-qa's), is then offered
const tokens = readFileSync(`${FX}dsi/halden.tokens.json`, 'utf8');
const imported = D.importJson([{ name: 'halden.tokens.json', text: tokens }], { now: Date.now() });
let rec = D.newRecord(imported.content, { now: Date.now() });
rec = D.publish(rec, { confirm: true, now: Date.now() }).record;
await idbPut('socria-ux-v0-systems', 'systems', rec);
await goHome();
ok('with a design system kept here, it is offered in the composer', (await page.locator('.sd-composer .sd-sys-btn').count()) === 1);
await page.locator('.sd-sys-btn').click();
ok('…listing the published system, and none', (await page.locator('.sd-pop-item').filter({ hasText: rec.name }).count()) === 1 && (await page.locator('.sd-pop-item').filter({ hasText: 'No design system' }).count()) === 1);
await page.locator('.sd-pop-item').filter({ hasText: 'No design system' }).click();

console.log('=== research, live: real references from Openverse, and what happened said as it happened ===');
await say('A poster for “Field Lines”, a creative coding night, bold and playful');
await begin();
ok('the conversation opens at its own address', !!pid() && (await page.locator('.sd-conv').count()) === 1);
const panes = await page.evaluate(() => {
  const r = (s) => document.querySelector(s)?.getBoundingClientRect();
  const t = r('.sd-talk');
  const st = r('.sd-stagepane');
  return t && st ? { talkRight: Math.round(t.right), stageLeft: Math.round(st.left), talkW: Math.round(t.width), stageW: Math.round(st.width) } : null;
});
ok('the conversation on the left, the question on the right', !!panes && panes.talkRight <= panes.stageLeft + 1 && panes.stageW > panes.talkW, JSON.stringify(panes));
ok('the first question asked is the references found for the words (form, words and feel were said)', (await stageId()) === 'g.refs' && (await page.locator('.sd-stage .sd-refs').count()) === 1, await stageId());
let p = await researched();
ok('the research ran as the conversation opened, and is kept on the project', !!p?.studio?.research && p.studio.research.searches.length >= 2, JSON.stringify(p?.studio?.research ?? null).slice(0, 300));
ok('…the library really was asked (requests to Openverse)', openverse.length >= 2, openverse.join(' | '));
const liveRefs = p?.studio?.references ?? [];
const note = (p?.studio?.transcript ?? []).find((m) => m.kind === 'note' && /Openverse/.test(m.text))?.text ?? '';
if (liveRefs.length) {
  ok(`live: ${liveRefs.length} references found, and said so with the number that was kept`, new RegExp(`found ${liveRefs.length}\\b`).test(note) && /never copied/.test(note), note);
  await until(async () => (await refCards().count()) >= 1, 8000);
  const srcs = await page.locator('.sd-refs-grid .sd-ref-img img').evaluateAll((xs) => xs.map((x) => x.getAttribute('src')));
  ok('…each one the library’s own picture', srcs.length >= 1 && srcs.every((s) => /^https:\/\/api\.openverse\.org\//.test(s ?? '')), srcs.slice(0, 3).join(' '));
  const links = await page.locator('.sd-refs-grid .sd-ref-c a').evaluateAll((xs) => xs.map((x) => ({ href: x.getAttribute('href'), target: x.getAttribute('target'), rel: x.getAttribute('rel') })));
  ok('…credited, with the page it came from opening apart', links.length >= 1 && links.every((l) => /^https:\/\//.test(l.href ?? '') && l.target === '_blank' && /noopener/.test(l.rel ?? '')), JSON.stringify(links.slice(0, 2)));
} else {
  const errs = (p?.studio?.research?.searches ?? []).filter((s) => s.error);
  ok('live: nothing was found or the library could not answer — and that is what is said, nothing put in its place', (/tried to look|found nothing/.test(note)) && (await refCards().count()) === 0 && (errs.length > 0 || /found nothing/.test(note)), `${note} | ${JSON.stringify(errs)}`);
}
ok('the status line says what was searched for, as it happened', /Openverse/.test(await page.locator('.sd-refs-status').innerText()), await page.locator('.sd-refs-status').innerText());
ok('references are inspiration: the page says they are never copied', /never copies a reference into your work/.test(await page.locator('.sd-refs-note').innerText()));
await shot('research-live');

await useRecordedLibrary();
console.log('=== the references: like, not this, what each is liked for, search again ===');
await goHome();
await say('A poster for “Signal Garden”, an electronic music night, bold and experimental');
await begin();
p = await researched();
const gq = openverse.slice(-((p?.studio?.research?.searches ?? []).length || 1));
ok('the brief is searched for in two to four short searches: its subject and kind, its feel, typography', gq.length >= 2 && gq.some((q) => /electronic music/.test(q ?? '')) && gq.every((q) => (q ?? '').split(' ').length <= 4), gq.join(' | '));
await until(async () => (await refCards().count()) >= 8, 10000);
const firstTitle = await page.locator('.sd-refs-grid .sd-ref-t').first().innerText();
ok('what came back is shown as it came back: titles, creators, licences, where it was found', (await refCards().count()) >= 8 && TITLES.some(([t]) => t === firstTitle) && /CC0|CC BY 2\.0/.test(await page.locator('.sd-refs-grid .sd-ref-c').first().innerText()) && /Flickr|Wikimedia Commons/.test(await page.locator('.sd-refs-grid').innerText()), firstTitle);
ok('the conversation says where it looked, for what, and how many it found', /I looked for references on Openverse — “electronic music poster”/.test(await page.locator('.sd-talk').innerText()), (await page.locator('.sd-talk').innerText()).slice(0, 600));
ok('nothing is liked for the person: Continue waits for a choice', await page.locator('.sd-stage').getByRole('button', { name: 'Continue' }).isDisabled());
await shot('references');
const like = (i) => refCards().nth(i).locator('.sd-ref-acts').getByRole('button', { name: /^Like$/ }).click();
await like(0);
await like(1);
ok('liked: two, each marked', (await page.locator('.sd-refs-grid .sd-ref.is-liked').count()) === 2 && (await page.locator('.sd-refs-grid .sd-ref-img[aria-pressed="true"]').count()) === 2);
ok('…what each is liked for can be said (colour, type, composition, mood, imagery)', (await page.locator('.sd-ref.is-liked .sd-ref-take').first().innerText()).replace(/\s+/g, ' ').includes('Colour Type Composition Mood Imagery'));
await page.locator('.sd-ref.is-liked').first().locator('.sd-ref-take').getByRole('button', { name: 'Colour' }).click();
const thirdId = await refCards().nth(2).getAttribute('data-ref');
const onWall = (id) => page.locator(`.sd-refs-grid .sd-ref[data-ref="${id}"]`);
await onWall(thirdId).getByRole('button', { name: /^Not this/ }).click();
await page.waitForTimeout(300);
ok('“not this” takes it off the wall', (await onWall(thirdId).count()) === 0);
await page.getByRole('button', { name: /Show the 1 turned down/ }).click();
ok('…it can be seen again among those turned down, and brought back', (await page.locator('.sd-refs-turned li').count()) === 1);
await page.locator('.sd-refs-turned').getByRole('button', { name: 'Bring back' }).click();
await page.waitForTimeout(250);
ok('…back on the wall', (await onWall(thirdId).count()) === 1);
await onWall(thirdId).getByRole('button', { name: /^Not this/ }).click();
p = await until(async () => {
  const x = await project();
  const liked = (x?.studio?.references ?? []).filter((r) => r.state === 'liked');
  return liked.length === 2 && liked.every((r) => r.swatches?.length >= 3) ? x : null;
}, 10000);
ok('the colours of the references liked are read from their pictures', !!p, JSON.stringify(((await project())?.studio?.references ?? []).filter((r) => r.state === 'liked').map((r) => r.swatches)));
// (saves are gathered for a moment: read again until the latest is kept)
p = await until(async () => {
  const x = await project();
  const refs = x?.studio?.references ?? [];
  return refs.some((r) => r.state === 'liked' && r.take?.includes('colour')) && refs.some((r) => r.state === 'rejected' && r.id === thirdId) ? x : null;
}, 6000);
ok('…what each is liked for is kept with it, and what was turned down', !!p, JSON.stringify(((await project())?.studio?.references ?? []).map((r) => [r.id.slice(-12), r.state, r.take ?? []])));
ok('what is taking shape gathers under the question: the references, the colour they give', /2 references/.test(await page.locator('.sd-vision').innerText()) && (await page.locator('.sd-vision-refs img').count()) === 2 && (await page.locator('.sd-vision-sw span').count()) >= 3 && /from your references/.test(await page.locator('.sd-vision').innerText()), await page.locator('.sd-vision').innerText());
const before = await refCards().count();
await page.fill('#sd-refs-q', 'art deco poster');
await page.locator('.sd-refs-search').getByRole('button', { name: 'Search' }).click();
await until(async () => (await refCards().count()) > before, 10000);
ok('searched again for other words: more found, added to the wall', (await refCards().count()) > before && openverse.includes('art deco poster'), `${before} → ${await refCards().count()}`);
ok('…the search said in the conversation, in the person’s words', /Search for “art deco poster”/.test(await page.locator('.sd-talk').innerText()));
const nBefore = openverse.length;
await page.locator('.sd-ref.is-liked').first().getByRole('button', { name: 'More like this' }).click();
await until(async () => openverse.length > nBefore, 8000);
ok('“more like this” searches for what that reference is', openverse.length > nBefore, openverse.slice(-2).join(' | '));
await page.waitForTimeout(500);
await shot('references-liked');
await cont();
ok('the answer names what was liked', /2 liked: “/.test(await page.locator('.sd-talk').innerText()));
ok('with the accessible questions done, SocriaUX says it has enough, guided by the references', /enough to begin/i.test(await page.locator('.sd-stage.is-enough').innerText()) && /guided by the 2 references you liked/.test(await page.locator('.sd-stage.is-enough .sd-why').innerText()), await page.locator('.sd-stage.is-enough .sd-why').innerText());
await page.getByRole('button', { name: /Keep refining/ }).click();
await page.waitForTimeout(300);
ok('colour, proposed from the references liked and from the words, never a stock palette', (await stageId()) === 'g.palette' && /From the references you liked/.test(await page.locator('.sd-stage .sd-pal').first().innerText()) && (await page.locator('.sd-stage .sd-pal').filter({ hasText: /From “/ }).count()) >= 1 && (await page.locator('.sd-stage .sd-pal').filter({ hasText: /your words/ }).count()) >= 1, (await page.locator('.sd-stage').innerText()).slice(0, 400));
await page.locator('.sd-stage .sd-pal').first().click();
await page.waitForTimeout(400);
ok('type next, generated: faces the references carry and voices found for the words, each set in itself', (await stageId()) === 'g.type' && (await page.locator('.sd-stage .sd-type').count()) >= 3 && (await page.locator('.sd-stage .sd-type').filter({ hasText: /From your references|From your words/ }).count()) >= 3, (await page.locator('.sd-stage').innerText()).slice(0, 400));
ok('…and what is taking shape shows the colour chosen', /Colour/.test(await page.locator('.sd-vision').innerText()) && !/from your references/.test(await page.locator('.sd-vision').innerText()));
await page.locator('.sd-stage .sd-type').first().click();
await page.waitForTimeout(400);
ok('a single choice moves on at once: composition', (await stageId()) === 'g.composition', await stageId());
await page.locator('.sd-stage').getByRole('button', { name: /Back/ }).click();
await page.waitForTimeout(350);
ok('Back takes the last answer back: type again', (await stageId()) === 'g.type', await stageId());
await page.locator('.sd-stage .sd-type').nth(1).click();
await page.waitForTimeout(300);
await page.locator('.sd-stage').getByRole('button', { name: 'Skip' }).click();
await page.waitForTimeout(300);
p = await project();
ok('Skip leaves a question unanswered and moves on', p.studio.answers['g.composition']?.skipped === true && (await stageId()) !== 'g.composition');
await openDecisions();
const decisions = await page.locator('.sd-ctx-row').allInnerTexts();
ok('the decisions keep where each came from', decisions.some((t) => /Form/.test(t) && /From your words/.test(t)) && decisions.some((t) => /References/.test(t) && /Yours/.test(t)), decisions.join(' | ').slice(0, 500));
ok('…and credit the references that guide the work, each with its source', (await page.locator('.sd-side .sd-ctx-refs li').count()) === 2 && /via Openverse/.test(await page.locator('.sd-side .sd-ctx-refs').innerText()) && (await page.locator('.sd-side .sd-ctx-refs a[target="_blank"]').count()) === 2);
await page.getByRole('button', { name: 'Change: References' }).click();
await page.waitForTimeout(400);
ok('any decision can be opened again: the references, still liked', (await stageId()) === 'g.refs' && (await page.locator('.sd-refs-grid .sd-ref.is-liked').count()) === 2);
await cont();
await page.fill('#sd-reply', 'make it calm and refined');
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
p = await project();
ok('a decision can be changed in words, and the change is said', ['calm', 'refined'].every((m) => p.studio.answers['g.personality']?.values.includes(m)) && /Changed the feel/.test(p.studio.transcript.at(-1).text), JSON.stringify(p.studio.answers['g.personality']));
const said = await page.locator('.sd-transcript .sd-msg').count();
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.sd-conv');
ok('a reload lands in the same conversation, everything said kept, nothing searched twice', (await page.locator('.sd-transcript .sd-msg').count()) === said && (await project()).studio.research.searches.length === p.studio.research.searches.length);
const accent = (p.studio.answers['g.palette']?.values?.[0] ?? '').split('|')[2];
const gid = pid();
await page.getByRole('button', { name: /Start creating|Start with this/ }).first().click();
await page.waitForSelector('.gx', { timeout: 20000 });
p = await until(async () => {
  const x = await idb('socria-ux-v0', 'projects', gid);
  return x?.graphic?.options?.length ? x : null;
}, 15000);
ok('Start: the same project becomes the graphic, three directions composed at once', p?.medium === 'graphic' && p.studio.status === 'started' && p.graphic.options.length >= 3 && p.graphic.brief.content.headline === 'Signal Garden', JSON.stringify({ medium: p?.medium, n: p?.graphic?.options?.length }));
ok('…in the colours proposed from the references', !!accent && p.graphic.options.slice(0, 3).every((d) => d.tokens.colors.accent === accent), `${accent} vs ${p.graphic.options.map((d) => d.tokens.colors.accent).join(',')}`);
ok('…and nothing of the references placed in the work (inspiration, not assets)', !(p.graphic.assets ?? []).some((a) => /openverse|example\.org/.test(a.src ?? '')) && !JSON.stringify(p.graphic.options).includes('api.openverse.org'));
await page.waitForSelector('.sd-rail', { timeout: 8000 });
ok('the conversation is docked on the left, the work moved aside for it', (await page.locator('.sd-rail').count()) === 1 && (await leftOf()) === 360, String(await leftOf()));
ok('…everything said in it', (await page.locator('.sd-rail .sd-msg').count()) >= 8);
ok('the brief of a form is not offered: it was said in the conversation', !(await page.locator('.v0-steps').innerText()).includes('Brief'), await page.locator('.v0-steps').innerText());
await railSay('the second one');
await page.waitForSelector('.gx-ws', { timeout: 20000 });
await page.waitForTimeout(500);
ok('words in the conversation choose a direction: the design opens', (await page.locator('.gx-stage').count()) === 1);
ok('…the work alone in front: the panels put away, no second place to type', !(await page.locator('.gx-left').isVisible()) && !(await page.locator('.gx-right').isVisible()) && (await page.locator('#gx-ask-in').count()) === 0 && (await page.getByRole('button', { name: 'Edit by hand' }).count()) === 1);
await shot('graphic-focus');
await railSay('make the headline bigger');
await page.waitForSelector('.gx-pending', { timeout: 8000 });
ok('a change asked in the conversation is previewed on the work, and said back', (await page.locator('.gx-pending').count()) === 1 && /Previewing/.test(await page.locator('.sd-rail .sd-transcript').innerText()));
const rev0 = (await idb('socria-ux-v0', 'projects', gid))?.graphic?.doc?.revision ?? 0;
await railSay('apply');
await until(async () => !(await page.locator('.gx-pending').count()), 6000);
p = await until(async () => {
  const x = await idb('socria-ux-v0', 'projects', gid);
  return (x?.graphic?.doc?.revision ?? 0) > rev0 ? x : null;
}, 6000);
ok('…and applied by saying so', !(await page.locator('.gx-pending').count()) && !!p && /Applied/.test(await page.locator('.sd-rail .sd-transcript').innerText()), (await page.locator('.sd-rail .sd-transcript').innerText()).slice(-200));
await page.getByRole('button', { name: 'Edit by hand' }).click();
await page.waitForTimeout(300);
ok('“Edit by hand” brings the layers and panels out', await page.locator('.gx-left').isVisible());
await page.locator('.sd-rail').getByRole('tab', { name: 'Decisions' }).click();
ok('the decisions beside the work credit the references, with their sources', (await page.locator('.sd-rail .sd-ctx-refs li').count()) === 2 && (await page.locator('.sd-rail .sd-ctx-refs a').count()) === 2);
await page.locator('.sd-rail').getByRole('tab', { name: 'Talk' }).click();
await page.locator('.sd-rail').getByRole('button', { name: 'Put the conversation away' }).click();
await page.waitForTimeout(300);
ok('put away, the work has the whole width and its own place to type comes back', (await leftOf()) === 0 && (await page.locator('#gx-ask-in').count()) === 1);
await shot('graphic-by-hand');
await page.evaluate(() => localStorage.removeItem('socriaux.studio.rail'));

console.log('=== a logo: the questions follow the answers ===');
await goHome();
await say('A logo for “Halden”, a small coffee roastery');
await begin();
p = await project();
ok('a logo, read from the words; its name not asked', p?.studio?.mode === 'logo' && p.studio.answers['l.name']?.fields?.name === 'Halden' && (await stageId()) !== 'l.name', JSON.stringify(p?.studio?.answers?.['l.name'] ?? null));
if ((await stageId()) === 'l.about') {
  await page.locator('.sd-stage .sd-chip').first().click();
  await cont();
}
ok('personality, then the form', (await stageId()) === 'l.personality', await stageId());
await chip('Warm').click();
await chip('Crafted').click();
await cont();
ok('the form, each drawn for the name by the logo engine', (await stageId()) === 'l.form');
await until(async () => (await page.locator('.sd-stage .sd-shot-svg svg').count()) >= 4, 25000);
ok('…logo concepts constructed for “Halden”', (await page.locator('.sd-stage .sd-shot-svg svg').count()) >= 4);
await card('Typographic').click();
await page.waitForTimeout(400);
ok('once the form is known, references are shown for it', (await stageId()) === 'l.refs' && (await refCards().count()) >= 1, await stageId());
await refCards().first().locator('.sd-ref-acts').getByRole('button', { name: /^Like$/ }).click();
await cont();
await page.getByRole('button', { name: /Keep refining/ }).click();
await page.waitForTimeout(300);
let topics = await pathTopics();
ok('a typographic logo is asked about its lettering, not a symbol', topics.includes('Lettering') && !topics.includes('Idea'), topics.join(','));
await openDecisions();
await page.getByRole('button', { name: 'Change: Form' }).click();
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

console.log('=== a website: purpose, people, what it must do, references, a look drawn as working pages ===');
await goHome();
await say('A website for “Halden Yoga”, a yoga studio with bookings');
await begin();
p = await project();
ok('a website is read from the words, its purpose too', p?.studio?.mode === 'website' && p.studio.answers['w.purpose']?.values[0] === 'bookings', JSON.stringify(p?.studio?.answers ?? {}).slice(0, 300));
ok('the first question is who it is for', (await stageId()) === 'w.audience', await stageId());
await page.locator('.sd-stage .sd-chip').first().click();
await cont();
ok('then what it must do', (await stageId()) === 'w.functions');
await page.locator('.sd-stage .sd-chip').filter({ hasText: /Booking|Book/ }).first().click();
await page.locator('.sd-stage .sd-chip').filter({ hasText: /Contact/ }).first().click().catch(() => {});
await cont();
ok('then references for the site, before its look', (await stageId()) === 'w.refs', await stageId());
await until(async () => (await refCards().count()) >= 1, 15000);
await refCards().first().locator('.sd-ref-acts').getByRole('button', { name: /^Like$/ }).click();
await until(async () => ((await project())?.studio?.references ?? []).some((r) => r.state === 'liked' && r.swatches?.length), 8000);
await cont();
ok('then the look: three working pages', (await stageId()) === 'w.aesthetic', await stageId());
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
const wid = pid();
await page.getByRole('button', { name: /Start creating|Start with this/ }).first().click();
await page.waitForSelector('.v0-work', { timeout: 20000 });
p = await until(async () => {
  const x = await idb('socria-ux-v0', 'projects', wid);
  return x?.specs?.length ? x : null;
}, 15000);
const kinds = (p?.specs?.[p.specIndex]?.sections ?? []).map((s) => s.kind);
ok('Start: a designed, working page, in the same project, with a working booking', !!p && p.studio.status === 'started' && kinds.includes('nav') && kinds.includes('booking'), kinds.join(','));
await page.waitForSelector('.sd-rail', { timeout: 8000 });
ok('…the conversation docked beside it, the one place to type (no second composer, no steps of the old forms)', (await page.locator('.sd-rail').count()) === 1 && (await page.locator('.v0-compose').count()) === 0 && (await page.locator('.v0-steps').count()) === 0);
await page.waitForTimeout(600);
await shot('website-workspace');
await page.locator('.sd-rail').getByRole('button', { name: 'Put the conversation away' }).click();
await page.waitForTimeout(300);
ok('…put away, the page’s own composer comes back', (await page.locator('.v0-compose').count()) === 1);
await page.evaluate(() => localStorage.removeItem('socriaux.studio.rail'));

console.log('=== a board: materials counted, an identity shared ===');
await goHome();
await say('A launch campaign for “Night Market”: two posters, three Instagram posts and a website');
await begin();
p = await project();
ok('a board, its materials counted from the words', p?.studio?.mode === 'board' && p.studio.answers['b.materials']?.numbers?.poster === 2, JSON.stringify(p?.studio?.answers?.['b.materials'] ?? null));
let sawRefs = false;
for (let i = 0; i < 8 && (await stageId()); i++) {
  const id = await stageId();
  if (id === 'b.refs') sawRefs = true;
  if (id === 'b.identity') await card('Let SocriaUX propose').click();
  else if (id === 'b.objective') await page.locator('.sd-stage .sd-card').first().click();
  else await page.locator('.sd-stage').getByRole('button', { name: /You decide|Skip/ }).first().click();
  await page.waitForTimeout(350);
}
ok('a board is shown references too, and no preset look is offered', sawRefs && !(await pathTopics()).some((t) => /Look|Direction|Style/.test(t)), (await pathTopics()).join(','));
await page.getByRole('button', { name: /Keep refining/ }).click().catch(() => {});
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
await page.waitForSelector('.sd-rail', { timeout: 8000 });
ok('…with the conversation docked beside it, and no brief form offered', (await page.locator('.sd-rail').count()) === 1 && !(await page.locator('.v0-steps').innerText()).includes('Brief'));
await page.evaluate(() => localStorage.removeItem('socriaux.studio.rail'));

console.log('=== a critique: the design is the request ===');
await goHome();
await page.locator('input[type=file]').setInputFiles(FX + 'existing-design.html');
await say('Critique this page — the hierarchy of the hero');
ok('a page attached with “critique” reads as a critique', /Reads as critique/.test(await page.locator('.sd-reading').innerText()), await page.locator('.sd-reading').innerText());
await page.getByRole('button', { name: 'Begin' }).click();
await page.waitForSelector('iframe.v0-frame', { timeout: 15000 });
p = await project();
ok('a design brought to critique is the whole request: it opens at once, the words kept with it', p?.mode === 'critique' && p.studio?.status === 'started' && /hierarchy of the hero/.test(p.studio.prompt ?? ''), JSON.stringify({ mode: p?.mode, st: p?.studio?.status, prompt: p?.studio?.prompt }));
ok('…its conversation one click away (a critique’s cards are its own conversation)', (await page.locator('.sd-rail-tab').count()) === 1);
await page.locator('.sd-rail-tab').click();
ok('…and brought out, it holds the words', /hierarchy of the hero/.test(await page.locator('.sd-rail').innerText()));
await page.locator('.sd-rail').getByRole('button', { name: 'Put the conversation away' }).click();
await page.evaluate(() => localStorage.removeItem('socriaux.studio.rail'));
await goHome();
await page.locator('input[type=file]').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
await say('Critique this');
await page.getByRole('button', { name: 'Begin' }).click();
await page.waitForSelector('.sd-error', { timeout: 6000 });
ok('a file that cannot be critiqued is refused on the home, said why, and let go', /imports HTML, PNG, JPG and SVG/.test(await page.locator('.sd-error').innerText()) && (await page.locator('.sd-attached').count()) === 0, await page.locator('.sd-error').innerText());
await say('Critique my landing page');
await begin();
ok('asked in words alone, a critique asks for the design first', (await project())?.studio?.mode === 'critique' && (await stageId()) === 'c.file', await stageId());
await page.locator('.sd-stage input[type=file]').setInputFiles(FX + 'existing-design.html');
await page.waitForTimeout(600);
ok('the file given, there is enough to begin (what to look at first is offered, not asked)', /enough to begin/i.test(await page.locator('.sd-stage.is-enough').innerText().catch(() => '')), await stageId());
await page.getByRole('button', { name: 'Begin the critique' }).click();
await page.waitForSelector('iframe.v0-frame', { timeout: 15000 });
ok('…then the critique opens on it', (await project())?.mode === 'critique');

console.log('=== a design system: what is attached settles the source ===');
await goHome();
await page.locator('input[type=file]').setInputFiles({ name: 'halden.tokens.json', mimeType: 'application/json', buffer: Buffer.from(tokens) });
await say('Bring in our design tokens');
await begin();
p = await project();
ok('a tokens file settles the source and the files', p?.studio?.mode === 'system' && p.studio.answers['s.source']?.values[0] === 'json' && (p.studio.answers['s.input']?.values.length ?? 0) === 1, JSON.stringify(p?.studio?.answers ?? {}).slice(0, 300));
await page.getByRole('button', { name: 'Bring it in' }).click();
await page.waitForSelector('.ds, .ds-wizard, [class*="ds-"]', { timeout: 15000 });
await page.waitForTimeout(800);
ok('“Bring it in” opens the import with the file already given', /halden\.tokens\.json|Categories|Analys|Preview/i.test(await page.locator('body').innerText()));
ok('…and the conversation, having handed over, is not left as a project', !((await idb('socria-ux-v0', 'projects')) ?? []).some((x) => x.studio?.mode === 'system'));

console.log('=== a work made in a design system ===');
await goHome();
await page.locator('.sd-sys-btn').click();
await page.locator('.sd-pop-item').filter({ hasText: rec.name }).click();
await say('An Instagram post “Open Studio”, Saturday 12 April');
await begin();
p = await project();
ok('the system chosen on the home is the conversation’s', p?.studio?.systemId === rec.id);
ok('…and its own colours and type are not asked about', !(await pathTopics()).includes('Colour') && !(await pathTopics()).includes('Type'), (await pathTopics()).join(','));
const sid = pid();
await page.getByRole('button', { name: /Surprise me|Start creating|Start with this/ }).first().click();
await page.waitForSelector('.gx', { timeout: 20000 });
p = await until(async () => {
  const x = await idb('socria-ux-v0', 'projects', sid);
  return x?.graphic?.options?.length ? x : null;
}, 15000);
ok('the work is linked to the system when it begins', p?.systemLink?.id === rec.id, JSON.stringify(p?.systemLink ?? null));
await page.evaluate(() => localStorage.removeItem('socriaux.studio.rail'));

console.log('=== another kind of work, said midway: searched for afresh, what was liked kept ===');
await goHome();
await say('A wordmark for “Otterly”, a children’s bookshop');
await begin();
await until(async () => ((await project())?.studio?.research ? true : null), 20000);
for (let i = 0; i < 6 && (await stageId()) !== 'l.refs' && (await stageId()); i++) {
  const id = await stageId();
  if (id === 'l.form') await card('Typographic').click();
  else await page.locator('.sd-stage').getByRole('button', { name: /You decide|Skip/ }).first().click();
  await page.waitForTimeout(350);
}
await until(async () => (await refCards().count()) >= 1, 10000);
await refCards().first().locator('.sd-ref-acts').getByRole('button', { name: /^Like$/ }).click();
const likedId = await until(async () => ((await project())?.studio?.references ?? []).find((r) => r.state === 'liked')?.id ?? null, 6000);
const asked0 = openverse.length;
await page.locator('.sd-mode-btn').click();
await page.locator('.sd-pop-item').filter({ hasText: 'Graphic' }).click();
p = await until(async () => {
  const x = await project();
  return x?.studio?.mode === 'graphic' && x.studio.research ? x : null;
}, 20000);
ok('switched to a graphic: searched for again, for posters this time', !!p && openverse.length > asked0 && openverse.slice(asked0).some((q) => /poster/.test(q ?? '')), openverse.slice(asked0).join(' | '));
ok('…what was liked stays liked; what was only found for the other kind goes', !!p && p.studio.references.some((r) => r.id === likedId && r.state === 'liked') && !p.studio.references.some((r) => r.state === 'proposed' && /logo/.test(r.query)), JSON.stringify(p?.studio?.references?.map((r) => [r.state, r.query]) ?? []).slice(0, 300));

console.log('=== your work, in its own view ===');
await goHome();
const cont0 = await page.locator('.sd-continue-item').allInnerTexts();
ok('the home offers only a quiet way back: what is still in conversation first', cont0.length >= 1 && cont0.length <= 3 && /Otterly/.test(cont0[0]) && /in conversation/.test(cont0[0]), cont0.join(' | '));
await page.getByRole('button', { name: 'Your work' }).click();
await page.waitForSelector('.sd-work', { timeout: 8000 });
ok('“Your work” has its own address and view', new URL(page.url()).searchParams.get('work') === '1' && (await page.locator('.mu-collection').count()) === 1);
const rows = page.locator('.v0-list-row');
ok('everything made is listed', (await rows.count()) >= 7, String(await rows.count()));
ok('a conversation is listed as one', (await page.locator('.mu-exhibit').filter({ hasText: 'Otterly' }).innerText()).includes('in conversation'));
await page.fill('.mu-search input', 'Otterly');
await page.waitForTimeout(300);
ok('it can be searched', (await rows.count()) === 1);
await rows.first().getByRole('button', { name: 'Delete' }).click();
ok('a delete is asked in place, “Keep it” focused', (await page.evaluate(() => document.activeElement?.textContent?.trim())) === 'Keep it');
await page.getByRole('button', { name: 'Delete it' }).click();
await page.waitForTimeout(500);
ok('…and done', !((await idb('socria-ux-v0', 'projects')) ?? []).some((x) => x.name === 'Otterly'));
await page.reload({ waitUntil: 'networkidle' });
ok('a reload stays in the view', (await page.locator('.sd-work').count()) === 1);
await page.getByRole('button', { name: /Make something new/ }).click();
await page.waitForSelector('.sd-home.is-minimal', { timeout: 8000 });
ok('“Make something new” is the home again', !new URL(page.url()).searchParams.get('work'));
await page.goBack();
await page.waitForSelector('.sd-work', { timeout: 8000 });
ok('…and the browser’s back button returns to the work', (await page.locator('.sd-work').count()) === 1);

console.log('=== narrower: the conversation over the work, one click away ===');
await page.setViewportSize({ width: 1200, height: 860 });
await page.goto(BASE + '/ux-v0?p=' + gid, { waitUntil: 'networkidle' });
await page.waitForSelector('.gx', { timeout: 15000 });
await page.waitForTimeout(400);
ok('below the docking width the conversation waits one click away, not over the work', (await page.locator('.sd-rail-tab').count()) === 1 && (await page.locator('.sd-rail').count()) === 0);
await railOut();
ok('…and opens over the left side, the work left where it is', (await leftOf()) === 0);
await page.locator('.sd-rail').getByRole('button', { name: 'Put the conversation away' }).click();
await page.evaluate(() => localStorage.removeItem('socriaux.studio.rail'));

console.log('=== a phone ===');
await page.setViewportSize({ width: 390, height: 844 });
await goHome();
const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
ok('the home fits a phone, no sideways scroll', wide <= 1, String(wide));
await shot('phone-home');
await say('A story for “Night Swim”, a summer pool party');
await begin();
await page.waitForTimeout(600);
const wideConv = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
ok('the conversation fits a phone, the question brought into view', wideConv <= 1 && (await page.locator('.sd-stage').count()) === 1 && (await page.locator('.sd-stage').isVisible()), String(wideConv));
await until(async () => (await refCards().count()) >= 1, 10000);
await shot('phone-conversation');
await page.getByRole('button', { name: /^Decisions$/ }).click();
await page.waitForTimeout(500);
ok('the decisions open as a sheet', await page.locator('.sd-side.is-open').isVisible());
await shot('phone-decisions');
await page.locator('.sd-side-close').click();
await page.setViewportSize({ width: 1440, height: 900 });

console.log('=== honesty ===');
ok('no model route was called anywhere', modelCalls.length === 0, modelCalls.join(', '));
ok('no page errors', errors.length === 0, errors.join(' | '));
// (the sign-in provider's placeholder host and web fonts are the test environment's, refused by its network)
const hosts = [...outside].filter((h) => !/^fonts\.(googleapis|gstatic)\.com$/.test(h) && !/clerk/.test(h));
ok('no host but Openverse was reached (the references’ library)', hosts.every((h) => h === 'api.openverse.org'), hosts.join(', '));

await b.close();
console.log(`\nstudio-qa: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
