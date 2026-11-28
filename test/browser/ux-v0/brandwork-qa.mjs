// test/browser/ux-v0/brandwork-qa.mjs — brand guidelines and the typography workspace, in a real browser.
//
// Socria's brand is made as a person would make it from what is in this repository (its root stylesheet imported,
// its two faces named, its logo approved, published), and its guidelines are written from that version. They are
// opened and looked at: the pages that should be there, the real logo drawn from its file, each colour one of the
// system's, the faces really loaded. A second version is published and the guidelines are brought up to date by
// hand — an approved page staying as it was. Then typography: what really draws each face on an artboard (the
// library, the company's own font file, or a fallback, said as such), and the same artboard in other faces, made by
// code with no model asked.
//
//   node test/browser/ux-v0/brandwork-qa.mjs            (UXV0_OUT sets where screenshots go; run `node test/run.mjs design-system` first)
import { build } from 'esbuild';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, S, ROOT } from './env.mjs';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const parse = (html) => new JSDOM(html).window.document;
const D = await import(pathToFileURL(join(ROOT, 'test/.tmp/dsi-under-test.mjs')).href);
const OUT = `${S}brandwork-qa/`;
mkdirSync(OUT, { recursive: true });
const BUNDLE = `${OUT}bundle/`;
await build({ entryPoints: [join(ROOT, 'test/browser/ux-v0/design-harness/entry.tsx')], bundle: true, format: 'esm', platform: 'browser', outdir: BUNDLE, jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, loader: { '.png': 'dataurl' }, logLevel: 'error' });

let pass = 0;
let fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok  ', n)) : (fail++, console.log('  FAIL', n, String(typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 600))));

// ── Socria's brand, from its own files ──
const imported = D.importCss([{ name: 'globals.css', text: readFileSync(join(ROOT, 'app/globals.css'), 'utf8') }], { ref: 'app/globals.css', now: 1 });
const content = D.analyzeBrand(imported.content);
const like = Object.values(content.tokens)[0];
for (const [path, value] of [['font.family.display', 'Instrument Serif'], ['font.family.body', 'Inter']]) content.tokens[path] = { path, type: 'fontFamily', value, provenance: { ...like.provenance, status: 'confirmed' } };
content.roles.display = { path: 'font.family.display', status: 'confirmed', confidence: 1, why: 'named by the owner' };
content.roles.body = { path: 'font.family.body', status: 'confirmed', confidence: 1, why: 'named by the owner' };
content.roles.background = { path: 'paper', status: 'confirmed', confidence: 1, why: 'named by the owner' };
content.roles.accent = { path: 'moss', status: 'confirmed', confidence: 1, why: 'named by the owner' };
const logo = (await D.importAsset({ name: 'socria-logo.png', bytes: new Uint8Array(readFileSync(join(ROOT, 'public/socria-logo.png'))) }, { approved: true })).asset;
content.assets.push(logo);
content.identity = { name: 'Socria', description: 'Socria exists to build artificial intelligence for one purpose: human enhancement.' };
let withRule = D.addRule(content, 'Never pure white: the ground is paper.', 'colour', 'hard').content;
withRule = D.addRule(withRule, 'Sentence case; headlines end with a full stop.', 'typography', 'soft').content;
let rec = D.newRecord(withRule, { now: 2 });
rec = D.publish(rec, { confirm: true, now: 3 }).record;
const made = D.guidelinesDoc(rec, { parse, now: 4 });
console.log('\n=== guidelines, written from Socria v1 ===');
ok('Socria’s stylesheet, faces, logo and two rules are published as v1, and guidelines are written from it', rec.published === 1 && made.ok && made.of.version === 1, made.ok ? '' : made.error);
const ids = made.doc.artboards.map((a) => a.id);
ok('six pages: cover, colour, typography, logo, rules, sources', ids.join() === 'gl-cover,gl-colour,gl-type,gl-logo,gl-rules,gl-sources', ids);

const base = D.makeProject('create', 'Socria — brand guidelines', 5);
const v1 = { at: 5, said: 'Written from Socria v1', by: 'model', doc: made.doc };
const project = { ...base, medium: 'design', design: { v: 1, doc: made.doc, versions: [v1], at: 0, turns: [], memory: { brief: 'Brand guidelines for Socria.', decisions: [], rejected: [] }, comments: [], assets: made.assets, kind: 'brand guidelines', format: 'presentation' }, guidelinesOf: made.of, systemLink: { id: rec.id, name: rec.name, pin: 1, version: 1, overrides: {}, applied: {}, at: 5 } };

const requests = [];
let answer = () => '<say>Noted.</say><ok/>';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1500, height: 950 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text()) && errors.push(`console: ${m.text().slice(0, 200)}`));
const ORIGIN = 'http://localhost:4997';
let cfg = { project };
const html = () => `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/entry.css"><script>window.__HARNESS__=${JSON.stringify(cfg).replace(/</g, '\\u003c')}</script></head><body><div id="root"></div><script type="module" src="/entry.js"></script></body></html>`;
await ctx.route(`${ORIGIN}/**`, async (route) => {
  const u = new URL(route.request().url());
  if (u.pathname === '/') return route.fulfill({ status: 200, contentType: 'text/html', body: html() });
  if (u.pathname === '/blank') return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>blank</title>' });
  if (u.pathname === '/entry.js') return route.fulfill({ status: 200, contentType: 'text/javascript', body: readFileSync(`${BUNDLE}entry.js`) });
  if (u.pathname === '/entry.css') return route.fulfill({ status: 200, contentType: 'text/css', body: existsSync(`${BUNDLE}entry.css`) ? readFileSync(`${BUNDLE}entry.css`) : '' });
  if (u.pathname === '/api/ux-v0/design') {
    const body = JSON.parse(route.request().postData() ?? '{}');
    requests.push(body);
    const text = answer(body);
    const lines = [{ type: 'accepted', op: 'x' }, ...text.match(/[\s\S]{1,400}/g).map((d) => ({ type: 'text', delta: d })), { type: 'result', status: 200, body: { text, model: 'scripted', usage: { input: 0, output: 0, cost: 0 } } }];
    return route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: lines.map((l) => JSON.stringify(l)).join('\n') + '\n' });
  }
  if (u.pathname === '/socria-mark.png') return route.fulfill({ status: 200, contentType: 'image/png', body: readFileSync(join(ROOT, 'public/socria-mark.png')) });
  if (u.pathname.startsWith('/api/')) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  return route.fulfill({ status: 404, body: '' });
});
const settle = (ms = 600) => page.waitForTimeout(ms);
const put = (db, store, value) => page.evaluate(({ db, store, value }) => new Promise((res, rej) => { const q = indexedDB.open(db, 1); q.onupgradeneeded = () => q.result.createObjectStore(store, { keyPath: 'id' }); q.onsuccess = () => { const t = q.result.transaction(store, 'readwrite'); t.objectStore(store).put(value); t.oncomplete = () => res(true); t.onerror = () => rej(t.error); }; q.onerror = () => rej(q.error); }), { db, store, value: JSON.parse(JSON.stringify(value)) });
const stateOf = () => page.evaluate(() => new Promise((res) => { const r = indexedDB.open('socria-ux-v0', 1); r.onsuccess = () => { const g = r.result.transaction('projects', 'readonly').objectStore('projects').get(window.__PROJECT_ID__); g.onsuccess = () => res(g.result ?? null); }; }));
const board = (name) => page.locator(`.dx-board:has(.dx-label-name:text-is("${name}"))`);

await page.goto(`${ORIGIN}/blank`);
await put('socria-ux-v0-systems', 'systems', rec);
await page.goto(`${ORIGIN}/`);
await page.waitForSelector('.dx-board iframe', { timeout: 20000 });
await settle(2500);
ok('the six pages are on the canvas, and no model was asked for any of them', (await page.locator('.dx-board').count()) === 6 && requests.length === 0);
const logoImg = board('Logo').frameLocator('iframe').locator('.gl-ground img').first();
const logoBox = await logoImg.evaluate((el) => { const g = el.parentElement.getBoundingClientRect(); const r = el.getBoundingClientRect(); return { nw: el.naturalWidth, w: r.width, h: r.height, inside: r.top >= g.top && r.bottom <= g.bottom && r.left >= g.left && r.right <= g.right }; });
ok('the logo page shows the real logo from its own file, whole, at its own proportions, inside its panel', logoBox.nw === 1080 && logoBox.inside && Math.abs(logoBox.w - logoBox.h) < 1 && logoBox.h > 200, logoBox);
ok('…once, on the ground it was approved for — and says the system holds no version for dark grounds', (await board('Logo').frameLocator('iframe').locator('.gl-ground img').count()) === 1 && /holds no version for dark grounds/.test((await board('Logo').frameLocator('iframe').locator('body').textContent()) ?? ''));
ok('see-through colours are shown as they land on the ground, with their strength — not as copies of one swatch', /#1F1F1F at 60%/.test((await board('Colour').frameLocator('iframe').locator('body').textContent()) ?? '') && new Set((await board('Colour').frameLocator('iframe').locator('.gl-sw:not(.is-big) .gl-chip').evaluateAll((els) => els.slice(1, 5).map((e) => getComputedStyle(e).backgroundColor)))).size === 4);
ok('nothing on the colour page runs into its footer', await board('Colour').frameLocator('iframe').locator('.gl').evaluate((el) => { const foot = document.querySelector('.gl-foot').getBoundingClientRect().top; return [...el.querySelectorAll('.gl-sw, .gl-small')].every((x) => x.getBoundingClientRect().bottom <= foot); }));
const chips = await board('Colour').frameLocator('iframe').locator('.gl-chip').evaluateAll((els) => els.map((e) => getComputedStyle(e).backgroundColor));
const sys = new Set([...D.resolveAll(D.publishedContent(rec)).values()].filter((r) => r.ok && r.type === 'color').map((r) => D.hexOf(r.value)));
const hex = (rgb) => `#${rgb.match(/\d+/g).slice(0, 3).map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`;
// (a see-through colour is drawn as it lands on the ground: its caption carries the system's own value)
const named = (await board('Colour').frameLocator('iframe').locator('.gl-cap').allTextContents()).join(' ');
const written = [...named.matchAll(/#[0-9A-F]{6}/g)].map((m) => m[0].toLowerCase());
ok('every colour named on the colour page is one of Socria’s own (paper #f5f3eb and moss #354620 among them)', chips.length > 8 && written.length >= 16 && written.every((h) => sys.has(h)) && chips.map(hex).includes('#f5f3eb') && chips.map(hex).includes('#354620'), written.filter((h) => !sys.has(h)));
ok('the typography page is drawn in Instrument Serif itself, and says so', await board('Typography').frameLocator('iframe').locator('.gl-aa').first().evaluate(async (el) => { await document.fonts.ready; return getComputedStyle(el).fontFamily.includes('Instrument Serif') && document.fonts.check('132px "Instrument Serif"'); }) && /Drawn here in Instrument Serif itself\./.test((await board('Typography').frameLocator('iframe').locator('body').textContent()) ?? ''));
const rulesText = (await board('Rules').frameLocator('iframe').locator('body').textContent()) ?? '';
ok('the rules page keeps the requirement apart from the principle', /Requirements\s*Never pure white: the ground is paper\./.test(rulesText) && /Principles\s*Sentence case; headlines end with a full stop\./.test(rulesText), rulesText.slice(0, 300));
ok('every page says which version it is', (await board('Cover').frameLocator('iframe').locator('.gl-foot').textContent())?.includes('Version 1 · published'));
await page.screenshot({ path: `${OUT}1-guidelines.png` });
for (const n of ['Colour', 'Logo', 'Typography']) await board(n).locator('iframe').screenshot({ path: `${OUT}page-${n.toLowerCase()}.png` }).catch(() => {});
ok('nothing says they are out of date', (await page.locator('.dx-version').count()) === 0);

console.log('\n=== a new version of the brand: brought in by hand, an approved page left alone ===');
await board('Cover').locator('.dx-label-name').click();
await settle(400);
await page.locator('.dx-inspect button:text-is("Approve")').click();
await settle(700);
let next = D.updateDraft(rec, D.setToken(rec.draft, 'moss', { value: '#2f5d3a' }).content, 'a greener moss');
next = D.publish(next, { confirm: true, now: 10 }).record;
await put('socria-ux-v0-systems', 'systems', next);
const kept = await stateOf();
cfg = { project: kept };
await page.goto(`${ORIGIN}/`);
await page.waitForSelector('.dx-board iframe', { timeout: 20000 });
await settle(2000);
ok('reopened, the project keeps what it was written from, and says a newer version is published', kept.guidelinesOf?.version === 1 && /Written from Socria v1; v2 is published\./.test((await page.locator('.dx-version').textContent()) ?? ''), await page.locator('.dx-version').textContent().catch(() => 'no banner'));
ok('nothing has changed by itself', (await board('Colour').frameLocator('iframe').locator('.gl-chip').evaluateAll((els) => els.map((e) => getComputedStyle(e).backgroundColor))).map(hex).includes('#354620'));
await page.locator('.dx-version button:text-is("Bring them up to date")').click();
await settle(1500);
const after = await stateOf();
const colourNow = (await board('Colour').frameLocator('iframe').locator('.gl-chip').evaluateAll((els) => els.map((e) => getComputedStyle(e).backgroundColor))).map(hex);
ok('brought up to date: the colour page now holds the new moss, as a new version of the project', colourNow.includes('#2f5d3a') && colourNow.indexOf('#2f5d3a') < 6 && after.design.versions.length === kept.design.versions.length + 1 && /Brought up to date with Socria v2/.test(after.design.versions.at(-1).said), [colourNow.slice(0, 6), after.design.versions.at(-1).said]);
ok('the approved cover is exactly as it was approved, and the person is told', after.design.doc.artboards.find((a) => a.id === 'gl-cover').html === kept.design.doc.artboards.find((a) => a.id === 'gl-cover').html && /Left as approved: Cover/.test((await page.locator('.dx-toast').textContent().catch(() => '')) ?? ''));
ok('…and because it would change under the new styles, the project stays on v1 until it is reopened', after.guidelinesOf.version === 1 && after.design.doc.tokens === kept.design.doc.tokens);

console.log('\n=== typefaces: what draws each, and the same artboard in others ===');
{
  // the company has a font of its own: a real font file from this repository
  const font = (await D.importAsset({ name: 'Kalam-400.woff2', bytes: new Uint8Array(readFileSync(join(ROOT, 'app/fonts/Kalam-400.woff2'))) }, {})).asset;
  const co = { v: 1, id: 'co_qa_brandwork', name: 'Northlight', facts: [], products: [], library: [{ asset: font, what: 'font', description: '', tags: [], product: null, rights: '', people: false, retired: false }], systemId: null, missing: [], owner: null, createdAt: 1, updatedAt: 1 };
  await put('socria-ux-v0-company', 'companies', co);
  const family = 'Kalam';
  answer = (body) => (body.mode === 'look' ? '<say>Seen.</say><ok/>' : body.doc.artboards.length ? '<say>Noted.</say><ok/>' : `<say>Three voices.</say><artboard id="new-1" name="Notice" format="instagram-square"><style>.sx-root{background:#f5f3eb;color:#1f1f1f}.h{position:absolute;left:80px;top:120px;margin:0;font:400 150px/1 'Instrument Serif',serif}.b{position:absolute;left:80px;top:520px;width:800px;margin:0;font:400 40px/1.3 'Söhne',sans-serif}.n{position:absolute;left:80px;bottom:100px;margin:0;font:400 54px/1.2 '${family}',cursive}</style><h1 class="h">Rooms for Living</h1><p class="b">Six evenings on the future of housing.</p><p class="n">Reserve a seat</p></artboard>`);
  cfg = { brief: 'A square notice.', kind: 'social post', format: 'instagram-square', companyId: co.id };
  const n0 = requests.length;
  await page.goto(`${ORIGIN}/`);
  await page.waitForSelector('.dx-board iframe', { timeout: 20000 });
  await page.waitForFunction(() => !document.querySelector('.dx-phase'), null, { timeout: 30000 });
  await settle(1800);
  const w = requests.slice(n0).find((r) => r.mode === 'write');
  ok('the designer is told the company’s own typeface is available here, by name', w?.company?.about.some((x) => new RegExp(`Its own typefaces, available here by name[^\\n]*${family}`).test(x)), w?.company?.about);
  const lk = requests.slice(n0).find((r) => r.mode === 'look');
  const facts = Object.values(lk?.measured ?? {}).flat();
  ok('the look is told the face that cannot be drawn is a fallback — and not the company’s own font', facts.some((x) => /not in the font library, so drawn in a fallback face: Söhne/.test(x)) && !facts.some((x) => new RegExp(family).test(x) && /fallback/.test(x)), facts);
  await page.locator('.dx-label-name').first().click();
  await page.waitForSelector('.dx-typefaces li');
  const st = await page.locator('.dx-typefaces li').evaluateAll((els) => els.map((e) => [e.getAttribute('data-face'), e.getAttribute('data-by')]));
  ok('the inspector lists each face with what really draws it: the library, the company’s own file, a fallback', st.some((x) => x[0] === 'Instrument Serif' && x[1] === 'library') && st.some((x) => x[0] === family && x[1] === 'own') && st.some((x) => x[0] === 'Söhne' && x[1] === 'fallback'), st);
  ok('the fallback is said to be a different typeface; the own font’s licence is said as the file states it (or that it states none)', /a fallback, which is a different typeface/.test((await page.locator('.dx-typefaces li[data-by="fallback"]').textContent()) ?? '') && /(Its licence, as the file states it|states no licence)/.test((await page.locator('.dx-typefaces li[data-by="own"]').textContent()) ?? ''));
  const drawn = await page.frameLocator('.dx-board iframe').first().locator('.n').evaluate(async (el, fam) => { await document.fonts.ready; const mine = [...document.styleSheets].flatMap((s) => { try { return [...s.cssRules]; } catch { return []; } }).filter((r) => r.constructor.name === 'CSSFontFaceRule' && /^url\("?data:font/.test(r.style.getPropertyValue('src'))); return { check: document.fonts.check(`54px "${fam}"`), rules: mine.length, family: mine[0]?.style.getPropertyValue('font-family'), faces: [...document.fonts].filter((f) => f.family.replace(/["']/g, '') === fam).map((f) => [f.status, f.weight]), used: getComputedStyle(el).fontFamily }; }, family);
  // (the library also has a Kalam: the company's own file is declared after it and is the one the browser loads)
  ok('the company’s own font file is in the frame as a face of its own, and is the one loaded to draw its line', drawn.rules === 1 && drawn.family === 'Kalam' && drawn.faces.filter((f) => f[0] === 'loaded').length === 1 && drawn.faces.find((f) => f[0] === 'loaded')[1] === '400' && /^Kalam/.test(drawn.used), drawn);
  await page.screenshot({ path: `${OUT}2-typefaces.png` });
  const n1 = requests.length;
  await page.locator('.dx-typefaces li[data-face="Instrument Serif"] button').click();
  await page.waitForSelector('.dx-faces');
  ok('no face is chosen beforehand: the choice is the person’s', (await page.locator('.dx-faces input:checked').count()) === 0 && (await page.locator('.dx-modal button.dx-primary').isDisabled()));
  await page.locator('.dx-modal input[type=search]').fill('Fraunces');
  await page.locator('.dx-faces label:has(span:text-is("Fraunces")) input').check();
  await page.locator('.dx-modal input[type=search]').fill('Anton');
  await page.locator('.dx-faces label:has(span:text-is("Anton")) input').check();
  await page.locator('.dx-modal button.dx-primary').click();
  await settle(2500);
  const p = await stateOf();
  ok('two copies are made beside it, named for their faces, with no model asked', p.design.doc.artboards.length === 3 && p.design.doc.artboards[1].name === 'Notice — Fraunces' && p.design.doc.artboards[2].name === 'Notice — Anton' && requests.length === n1 && p.design.versions.at(-1).by === 'person', p.design.doc.artboards.map((a) => a.name));
  const heads = [];
  for (const i of [0, 1, 2]) heads.push(await page.frameLocator('.dx-board iframe').nth(i).locator('.h').evaluate(async (el) => { await document.fonts.ready; const f = getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, '').trim(); return [f, document.fonts.check(`150px "${f}"`), getComputedStyle(el).fontSize, el.textContent]; }));
  ok('each headline is really set in its face — loaded, not a fallback — at the same size, with the same words', heads[0][0] === 'Instrument Serif' && heads[1][0] === 'Fraunces' && heads[2][0] === 'Anton' && heads.every((h) => h[1] === true && h[2] === '150px' && h[3] === 'Rooms for Living'), heads);
  const others = await page.frameLocator('.dx-board iframe').nth(2).locator('.b, .n').evaluateAll((els) => els.map((e) => getComputedStyle(e).fontFamily.split(',')[0].replace(/["']/g, '').trim()));
  ok('nothing else on the copies changed: the other two faces are as they were', others[0] === 'Söhne' && others[1] === family, others);
  await page.locator('.dx-head button:text-is("Fit")').click();
  await settle(700);
  await page.screenshot({ path: `${OUT}3-compared.png` });
}

ok('no errors on the page', errors.length === 0, errors);
console.log(`\nbrandwork-qa: ${pass} passed, ${fail} failed · screenshots in ${OUT}`);
await b.close();
process.exit(fail ? 1 : 0);
