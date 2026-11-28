// test/browser/ux-v0/design-qa.mjs — the design workspace (components/ux-v0/design) in a real browser.
//
// The workspace is bundled on its own (design-harness/entry.tsx) and served to Chromium from a made-up origin; the
// design route is answered here, by script (DESIGN_ANSWERS below) or, with DESIGN_EXCHANGE=<dir>, from files a model
// wrote for the exact requests the workspace sent (the benchmark's way). Then it is driven as a person would: the
// first design streams in on opening, an element is clicked and changed in the inspector, words are retyped on the
// canvas, undo and redo move between versions, a change is asked in words with a selection, variations are made,
// pictures are exported. Every result is read from the page or from the files it downloaded, and screenshots are kept.
//
//   node test/browser/ux-v0/design-qa.mjs            (UXV0_OUT sets where screenshots go)
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { chromium, S, ROOT } from './env.mjs';

const OUT = `${S}design-qa/`;
mkdirSync(OUT, { recursive: true });
const BUNDLE = `${OUT}bundle/`;
await build({ entryPoints: [join(ROOT, 'test/browser/ux-v0/design-harness/entry.tsx')], bundle: true, format: 'esm', platform: 'browser', outdir: BUNDLE, jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, loader: { '.png': 'dataurl' }, logLevel: 'error' });

let pass = 0;
let fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok  ', n)) : (fail++, console.log('  FAIL', n, String(typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 400))));

const POSTER = `<say>A building cut open in section: six rooms for six evenings, one of them lit, under a large serif title.</say>
<artboard id="new-1" name="Rooms for Living — A3" format="a3">
<style>
:root{--ground:#efe9dc;--ink:#1c1a17;--accent:#c4512c;--ochre:#e0a944}
.sx-root{background:var(--ground);color:var(--ink);font-family:'Instrument Sans',sans-serif}
.brand{position:absolute;left:64px;top:56px;font-size:15px;letter-spacing:.22em;text-transform:uppercase;font-weight:600}
.rule{position:absolute;left:560px;right:64px;top:66px;height:1px;background:var(--ink);opacity:.5}
.headline{position:absolute;left:58px;top:110px;width:980px;margin:0;font-family:'Instrument Serif',serif;font-weight:400;font-size:168px;line-height:.92;letter-spacing:-.02em}
.headline em{font-style:normal;color:var(--accent)}
.section{position:absolute;left:64px;top:610px;width:995px;height:650px}
.sub{position:absolute;left:64px;top:1330px;width:520px;font-size:38px;line-height:1.12;margin:0}
.meta{position:absolute;left:640px;top:1334px;width:420px;font-size:20px;line-height:1.45;margin:0}
.cta{position:absolute;left:640px;top:1440px;font-size:24px;font-weight:700;color:var(--accent)}
</style>
<div class="brand">Northlight</div>
<div class="rule"></div>
<h1 class="headline">Rooms for<br><em>Living</em></h1>
<svg class="section" viewBox="0 0 995 650" xmlns="http://www.w3.org/2000/svg">
<rect x="2" y="2" width="991" height="646" fill="none" stroke="#1c1a17" stroke-width="4"/>
<rect x="300" y="2" width="400" height="300" fill="#c4512c"/>
<line x1="500" y1="2" x2="500" y2="110" stroke="#1c1a17" stroke-width="3"/>
<circle cx="500" cy="124" r="16" fill="#e0a944"/>
<rect x="2" y="302" width="420" height="346" fill="#1c1a17"/>
<rect x="760" y="302" width="233" height="346" fill="#e0a944"/>
<line x1="2" y1="302" x2="993" y2="302" stroke="#1c1a17" stroke-width="4"/>
<path d="M440 640 L700 380 M480 640 l0 -40 l40 0 l0 -40 l40 0 l0 -40 l40 0 l0 -40 l40 0" fill="none" stroke="#1c1a17" stroke-width="3"/>
</svg>
<p class="sub">Six evenings on the future of housing</p>
<p class="meta">Thursdays, 2 October – 6 November<br>Northlight Studio, 14 Dock Street</p>
<div class="cta">Reserve a seat →</div>
</artboard>`;

const LOOK_OK = '<say>The title, the lit room and the details read in order; nothing is cut or crowded.</say><ok/>';

/** The scripted designer: an answer chosen by what was asked (the request body). */
function scripted(body) {
  if (body.mode === 'look') return LOOK_OK;
  const w = String(body.words);
  const a = body.doc.artboards[0];
  if (!a) return POSTER;
  if (/headline slightly smaller/i.test(w)) {
    const m = /font-size:(\d+)px;line-height:\.92/.exec(a.html);
    return `<say>The title is a step smaller, so the drawing gets more air.</say><edit artboard="${a.id}"><find>font-size:${m?.[1] ?? 168}px;line-height:.92</find><replace>font-size:${Math.round((m ? Number(m[1]) : 168) * 0.88)}px;line-height:.92</replace></edit>`;
  }
  if (/three distinctly different directions/i.test(w)) {
    const v = (n, bg, ink, layout) => `<artboard id="v${n}" name="Direction ${n}" format="a3" group="dirs" beside="${a.id}"><style>.sx-root{background:${bg};color:${ink}}h1{position:absolute;${layout};margin:0;font:400 150px/0.9 'Instrument Serif',serif}</style><h1>Rooms for Living</h1><p style="position:absolute;left:64px;bottom:80px;font:24px 'Instrument Sans',sans-serif;margin:0">Six evenings on the future of housing · Thursdays, 2 October – 6 November · Northlight Studio, 14 Dock Street · Reserve a seat · Northlight</p></artboard>`;
    return `<say>Three other ways in: the title as the building, the title at the foot, the plan from above.</say>${v(1, '#1c1a17', '#efe9dc', 'left:64px;top:64px;width:900px')}${v(2, '#c4512c', '#1c1a17', 'left:64px;bottom:200px;width:980px')}${v(3, '#efe9dc', '#1c1a17', 'right:64px;top:300px;width:700px;text-align:right')}`;
  }
  if (/^Adapt /.test(w)) return `<say>Recomposed for each shape.</say><artboard id="f1" name="Story" format="story" group="fmt" beside="${a.id}"><style>h1{position:absolute;left:64px;top:200px;font:400 150px/.9 'Instrument Serif',serif;margin:0}</style><h1>Rooms for Living</h1></artboard><artboard id="f2" name="LinkedIn" format="linkedin" group="fmt"><h1 style="margin:64px;font:400 120px/.9 'Instrument Serif',serif">Rooms for Living</h1></artboard>`;
  if (/use my picture/i.test(w)) {
    const img = (body.assets ?? [])[0];
    return `<say>Your picture, set behind the title.</say><edit artboard="${a.id}"><find><h1 </find><replace><img src="asset:${img?.id}" alt="" style="position:absolute;left:0;top:0;width:100%;height:540px;object-fit:cover"><h1 </replace></edit>`;
  }
  if (/act on this note/i.test(w)) return `<say>Done.</say><ok/>`;
  if (/missing artboard edit/i.test(w)) return `<say>Changed.</say><edit artboard="${a.id}"><find>this text is not there</find><replace>x</replace></edit>`;
  return '<say>I need to know one thing first.</say><question>Should it lean warm or cool?<option>Warm</option><option>Cool</option></question>';
}

// ── a model's answers, from files (DESIGN_EXCHANGE) ──
const EX = process.env.DESIGN_EXCHANGE ? process.env.DESIGN_EXCHANGE.replace(/\/?$/, '/') : null;
const pending = [];
function fromExchange(body) {
  const key = `${body.mode}-${createHash('sha256').update(JSON.stringify({ w: body.words, d: body.doc, m: body.made ?? '', a: body.artboards ?? [] })).digest('hex').slice(0, 12)}`;
  const ans = `${EX}ans-${key}.txt`;
  if (existsSync(ans)) return readFileSync(ans, 'utf8');
  writeFileSync(`${EX}req-${key}.json`, JSON.stringify(body));
  pending.push(key);
  return null;
}

const requests = [];
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text()) && errors.push(`console: ${m.text().slice(0, 200)}`));
const ORIGIN = 'http://harness.test';
const html = (cfg) => `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/entry.css"><script>window.__HARNESS__=${JSON.stringify(cfg)}</script></head><body><div id="root"></div><script type="module" src="/entry.js"></script></body></html>`;
let cfg = {};
await ctx.route(`${ORIGIN}/**`, async (route) => {
  const u = new URL(route.request().url());
  if (u.pathname === '/') return route.fulfill({ status: 200, contentType: 'text/html', body: html(cfg) });
  if (u.pathname === '/entry.js') return route.fulfill({ status: 200, contentType: 'text/javascript', body: readFileSync(`${BUNDLE}entry.js`) });
  if (u.pathname === '/entry.css') return route.fulfill({ status: 200, contentType: 'text/css', body: existsSync(`${BUNDLE}entry.css`) ? readFileSync(`${BUNDLE}entry.css`) : '' });
  if (u.pathname === '/api/ux-v0/design') {
    const body = JSON.parse(route.request().postData() ?? '{}');
    requests.push(body);
    const text = EX ? fromExchange(body) : scripted(body);
    if (text == null) return route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: `${JSON.stringify({ type: 'result', status: 503, body: { error: 'waiting for an answer' } })}\n` });
    // streamed as the route streams it: accepted, the text in pieces, the result
    const lines = [{ type: 'accepted', op: 'x' }, ...text.match(/[\s\S]{1,180}/g).map((d) => ({ type: 'text', delta: d })), { type: 'result', status: 200, body: { text, model: 'scripted', usage: { input: 0, output: 0, cost: 0 } } }];
    return route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: lines.map((l) => JSON.stringify(l)).join('\n') + '\n' });
  }
  if (u.pathname === '/socria-mark.png') return route.fulfill({ status: 200, contentType: 'image/png', body: readFileSync(join(ROOT, 'public/socria-mark.png')) });
  if (u.pathname.startsWith('/api/')) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  return route.fulfill({ status: 404, body: '' });
});

const frame = (i = 0) => page.frameLocator('.dx-board iframe').nth(i);
const stateOf = () => page.evaluate(() => new Promise((res) => { const r = indexedDB.open('socria-ux-v0', 1); r.onsuccess = () => { const g = r.result.transaction('projects', 'readonly').objectStore('projects').get(window.__PROJECT_ID__); g.onsuccess = () => res(g.result?.design ?? null); g.onerror = () => res(null); }; r.onerror = () => res(null); }));
const settle = (ms = 600) => page.waitForTimeout(ms);

console.log('\n=== the first design, on opening ===');
cfg = { brief: 'A poster for a lecture series on the future of housing at an architecture studio. Headline: Rooms for Living. Six evenings on the future of housing. Thursdays, 2 October – 6 November. Northlight Studio, 14 Dock Street. Reserve a seat. Northlight.', kind: 'poster', format: 'a3' };
await page.goto(`${ORIGIN}/`);
await page.waitForSelector('.dx-board iframe', { timeout: 20000 }).catch(async (e) => {
  await page.screenshot({ path: `${OUT}0-failed-open.png` });
  console.log('errors:', errors, '\nrequests:', requests.map((r) => r.mode));
  throw e;
});
await page.waitForFunction(() => !document.querySelector('.dx-phase'), null, { timeout: 30000 });
await settle(1500);
ok('the first request is made on opening, from the brief', requests[0]?.mode === 'write' && /first design from the brief/i.test(requests[0].words) && /Rooms for Living/.test(requests[0].memory.brief));
ok('a new artboard is looked at once, with its picture', requests[1]?.mode === 'look' && requests[1].pictures?.length === 1 && /^data:image\/jpeg;base64,/.test(requests[1].pictures[0]));
ok('the artboard is on the canvas, drawn from its HTML', (await frame().locator('h1.headline').textContent())?.includes('Rooms for'));
ok('its faces load from the library', await frame().locator('h1.headline').evaluate((el) => getComputedStyle(el).fontFamily.includes('Instrument Serif')));
let st = await stateOf();
ok('the design is kept: one version, by the designer', st?.versions?.length === 1 && st.versions[0].by === 'model' && st.doc.artboards.length === 1);
ok('every element has its id', /data-sx="e1"/.test(st?.doc.artboards[0].html ?? '') && !/<script/i.test(st?.doc.artboards[0].html ?? ''));
ok('the designer’s sentence is in the conversation', (await page.locator('.dx-turn.is-designer p').last().textContent())?.includes('building cut open'));
await page.screenshot({ path: `${OUT}1-first-design.png` });

console.log('\n=== by hand: select, inspect, change ===');
await frame().locator('h1.headline').click();
await settle(500);
ok('a click selects the element and the inspector shows it', (await page.locator('.dx-tag').textContent()) === 'h1');
const sizeIn = page.locator('.dx-field:has(> span:text-is("Size")) input');
ok('the inspector reads its real size', (await sizeIn.inputValue()) === '168');
await sizeIn.fill('120');
await sizeIn.press('Enter');
await settle(900);
ok('a size set in the inspector is drawn', (await frame().locator('h1.headline').evaluate((el) => getComputedStyle(el).fontSize)) === '120px');
st = await stateOf();
ok('…and is a version by the person, written as inline style', st.versions.length === 2 && st.versions[1].by === 'person' && /font-size: 120px/.test(st.doc.artboards[0].html));
await page.locator('.dx-head button:text-is("Undo")').click();
await settle(900);
ok('undo goes back', (await frame().locator('h1.headline').evaluate((el) => getComputedStyle(el).fontSize)) === '168px');
await page.locator('.dx-head button:text-is("Redo")').click();
await settle(900);
ok('redo comes forward', (await frame().locator('h1.headline').evaluate((el) => getComputedStyle(el).fontSize)) === '120px');
await page.locator('.dx-head button:text-is("Undo")').click();
await settle(900);

console.log('\n=== words retyped on the canvas ===');
await frame().locator('p.sub').dblclick();
await settle(200);
await page.keyboard.press('ControlOrMeta+a');
await page.keyboard.type('Six evenings on how we will live');
await page.keyboard.press('Enter');
await settle(900);
ok('double-click, type, enter: the words change', (await frame().locator('p.sub').textContent()) === 'Six evenings on how we will live');
st = await stateOf();
ok('…kept in the design', /Six evenings on how we will live/.test(st.doc.artboards[0].html));

console.log('\n=== dragging ===');
const box = await frame().locator('.cta').boundingBox();
await frame().locator('.cta').click();
await settle(300);
await page.mouse.move(box.x + 10, box.y + 5);
await page.mouse.down();
await page.mouse.move(box.x + 60, box.y + 25, { steps: 6 });
await page.mouse.up();
await settle(900);
st = await stateOf();
ok('a drag moves the element (translate, in artboard units)', /translate: \d+(\.\d+)?px \d+(\.\d+)?px/.test(st.doc.artboards[0].html), st.doc.artboards[0].html.match(/class="cta"[^>]*/)?.[0]);

console.log('\n=== a change in words, with a selection ===');
await frame().locator('h1.headline').click();
await settle(300);
ok('the selection is shown above the composer', (await page.locator('.dx-chip').textContent())?.includes('Rooms for'));
await page.locator('.dx-input').fill('Make the headline slightly smaller.');
await page.locator('.dx-input').press('Enter');
await page.waitForFunction(() => !document.querySelector('.dx-phase'), null, { timeout: 30000 });
await settle(900);
const last = requests.at(-1);
ok('the request carries the selection and the HTML with ids', last.selection?.element && /data-sx=/.test(last.doc.artboards[0].html));
ok('an edit is not looked at (one call)', last.mode === 'write');
ok('the edit is carried out', (await frame().locator('h1.headline').evaluate((el) => getComputedStyle(el).fontSize)) === '148px');
st = await stateOf();
ok('the turn says what was done', /a step smaller/.test(st.turns.at(-1).text) && st.turns.at(-1).touched?.length === 1);

console.log('\n=== what could not be done is said ===');
await page.locator('.dx-input').fill('missing artboard edit');
await page.locator('.dx-input').press('Enter');
await page.waitForFunction(() => !document.querySelector('.dx-phase'), null, { timeout: 30000 });
await settle(600);
st = await stateOf();
ok('a failed edit is listed, and “nothing changed” said', st.turns.at(-1).failed?.length === 1 && /Nothing on the design changed/.test(st.turns.at(-1).text));

console.log('\n=== a question, answered with a choice ===');
await page.locator('.dx-input').fill('make it better somehow');
await page.locator('.dx-input').press('Enter');
await page.waitForFunction(() => !document.querySelector('.dx-phase'), null, { timeout: 30000 });
await settle(400);
ok('a question shows its choices', (await page.locator('.dx-options button').count()) === 2);

console.log('\n=== variations ===');
await page.locator('.dx-label-name').first().click();
await settle(300);
await page.locator('.dx-quick button:text-is("Three directions")').click();
await page.waitForFunction(() => !document.querySelector('.dx-phase'), null, { timeout: 60000 });
await settle(1500);
st = await stateOf();
const g = st.doc.artboards.slice(1);
ok('three new artboards, one group, side by side beside the first', g.length === 3 && new Set(g.map((x) => x.group)).size === 1 && g.every((x) => x.y === st.doc.artboards[0].y) && g[0].x > st.doc.artboards[0].x && g[1].x > g[0].x);
ok('each was looked at (one look for the three)', requests.at(-1).mode === 'look' && requests.at(-1).artboards.length === 3, { modes: requests.map((r) => r.mode), err: await page.locator('.dx-error').textContent().catch(() => null), last: st.turns.at(-1) });
await page.locator('.dx-head button:text-is("Fit")').click();
await settle(800);
await page.screenshot({ path: `${OUT}2-variations.png` });

console.log('\n=== export ===');
await page.locator('.dx-label-name').first().click();
await settle(300);
await page.screenshot({ path: `${OUT}2b-before-export.png` });
const [png] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.locator('.dx-inspect button:text-is("PNG")').click()]).catch(async (e) => {
  console.log('export failed; error shown:', await page.locator('.dx-error').textContent().catch(() => null), 'page errors:', errors);
  await page.screenshot({ path: `${OUT}2c-export-failed.png` });
  throw e;
});
const pngPath = `${OUT}export.png`;
await png.saveAs(pngPath);
const pngBytes = readFileSync(pngPath);
const pw = pngBytes.readUInt32BE(16);
const ph = pngBytes.readUInt32BE(20);
ok('PNG export: drawn at print resolution (A3 at 300 dpi)', pw === Math.round(1123 * 300 / 96) && ph === Math.round(1587 * 300 / 96), `${pw}×${ph}`);
await page.locator('.dx-head button:text-is("Export")').click();
const [pdf] = await Promise.all([page.waitForEvent('download'), page.locator('.dx-menu button:has-text("Export PDF")').click()]);
const pdfPath = `${OUT}export.pdf`;
await pdf.saveAs(pdfPath);
const pdfText = readFileSync(pdfPath).toString('latin1');
ok('PDF export: one page per artboard, at its size in points', (pdfText.match(/\/Type \/Page\b/g) ?? []).length === 4 && /MediaBox \[0 0 842\.25 1190\.25\]/.test(pdfText), (pdfText.match(/MediaBox[^\]]*\]/) ?? [])[0]);
const [htmlFile] = await Promise.all([page.waitForEvent('download'), page.locator('.dx-inspect button:text-is("HTML")').click()]);
const htmlText = readFileSync(await htmlFile.path(), 'utf8');
ok('HTML export: a standalone page with its faces linked and no ids', /fonts\.googleapis\.com/.test(htmlText) && !/data-sx/.test(htmlText) && /Rooms for/.test(htmlText));

console.log('\n=== pictures of their own ===');
await page.locator('.dx-label-name').first().click();
await settle(300);
await page.locator('.dx-compose input[type=file]').setInputFiles(join(ROOT, 'test/browser/ux-v0/fx/dusk.jpg'));
await page.waitForFunction(() => /Added a picture/.test(document.querySelector('.dx-input')?.value ?? ''), null, { timeout: 15000 });
await settle(900);
st = await stateOf();
ok('an added picture is kept with the design, as an upload', st.assets.length === 1 && /^upload:/.test(st.assets[0].src));
await page.locator('.dx-input').fill('use my picture behind the title');
await page.locator('.dx-input').press('Enter');
await page.waitForFunction(() => !document.querySelector('.dx-phase'), null, { timeout: 30000 });
await settle(1200);
ok('the designer is told of it (asset id, size) and the request carries no picture data', requests.at(-1).assets?.[0]?.id === st.assets[0].id && !/data:image/.test(JSON.stringify(requests.at(-1).assets)));
ok('the artboard draws it, from this browser, as data', await frame().locator('img').first().evaluate((el) => el.src.startsWith('data:image/') && el.naturalWidth > 0));

console.log('\n=== notes on an element ===');
await frame().locator('p.sub').click();
await settle(400);
await page.locator('.dx-note-in').fill('Too close to the drawing');
await page.locator('.dx-note-in').press('Enter');
await settle(500);
st = await stateOf();
ok('a note is kept on the element it was left on', st.comments.length === 1 && /^e\d+$/.test(st.comments[0].element) && !st.comments[0].resolved);
ok('the artboard says it has a note', (await page.locator('.dx-label-note').first().textContent())?.includes('1 note'));
await page.locator('.dx-label-name').first().click();
await settle(400);
await page.locator('.dx-notes button:text-is("Ask the designer")').click();
await page.waitForFunction(() => !document.querySelector('.dx-phase'), null, { timeout: 30000 });
ok('the designer can be asked to act on it, and is told the open notes', /Act on this note/.test(requests.at(-1).words) && requests.at(-1).comments?.length === 1);
await page.locator('.dx-notes button:text-is("Resolve")').click();
await settle(900);
st = await stateOf();
ok('a note can be resolved', st.comments[0].resolved === true);

console.log('\n=== other formats ===');
await page.locator('.dx-label-name').first().click();
await settle(300);
await page.locator('.dx-quick button:text-is("Other formats")').click();
await page.locator('.dx-check:has-text("Story or reel (vertical)") input').check();
await page.locator('.dx-check:has-text("LinkedIn post") input').check();
await page.locator('.dx-modal button.dx-primary').click();
await page.waitForFunction(() => !document.querySelector('.dx-phase'), null, { timeout: 60000 });
await settle(1200);
st = await stateOf();
const fmts = st.doc.artboards.filter((a) => a.group && st.doc.artboards.filter((b) => b.group === a.group).length === 2);
ok('the formats asked for are made, each at its own size, in one group', /format="story"/.test(requests.findLast((r) => r.mode === 'write').words) && fmts.some((a) => a.format === 'story' && a.width === 1080 && a.height === 1920) && fmts.some((a) => a.format === 'linkedin'));

console.log('\n=== presenting ===');
await page.locator('.dx-head button:text-is("Present")').click();
await settle(800);
ok('present shows one artboard full screen', (await page.locator('.dx-present-board iframe').count()) === 1);
await page.screenshot({ path: `${OUT}3-present.png` });
await page.keyboard.press('ArrowRight');
await settle(300);
ok('arrow keys move between artboards', /2 \/ \d/.test(await page.locator('.dx-present-bar span').textContent()));
await page.keyboard.press('Escape');

// the export picture, kept to look at
writeFileSync(`${OUT}requests.json`, JSON.stringify(requests.map((r) => ({ mode: r.mode, words: r.words, artboards: r.doc.artboards.length })), null, 1));
ok('no errors on the page', errors.length === 0, errors);
await b.close();
console.log(`\n${pass} passed, ${fail} failed — screenshots in ${OUT}`);
if (pending.length) console.log(`${pending.length} request(s) waiting for an answer in ${EX}`);
process.exit(fail ? 1 : 0);
