// test/browser/ux-v0/legacy-qa.mjs — graphics and boards made with the earlier editor, opened in the real app.
//
// A graphic and a board are composed by the earlier engine (the modules under test, test/.tmp) exactly as that editor
// stored them, put in this browser's store, and opened: each must open in the design workspace, drawn as it was
// (compared with the earlier renderer's own SVG, drawn in the same page with the same faces), with the old record
// kept on the project, its words selectable and editable by hand, and the collection showing it. No model is called:
// every model route is refused.
//
//   node test/browser/ux-v0/legacy-qa.mjs        (UXV0_BASE: the running app; UXV0_FORWARD=1 behind a proxy)
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium, BASE, S, underTest, putProjectInBrowser } from './env.mjs';

const OUT = `${S}legacy-qa/`;
mkdirSync(OUT, { recursive: true });
let pass = 0;
let fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok  ', n)) : (fail++, console.log('  FAIL', n, String(typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 400))));

const V = await underTest();
const C = V.gfxCompose;
const words = 'A poster for “Harbour Lights”, a winter night market on the quay, 12–14 December, Fridays from 5pm';
const brief = C.readGraphicBrief(words, { kind: 'poster' });
const dir = V.genLanguage.languageDirection(brief.content.headline, ['warm', 'festive'], 'legacy-1');
const made = C.composeGraphic(brief, dir, { seed: 4 });
const doc = made.doc;
const now = Date.now();
const graphic = { ...V.makeProject('create', 'Harbour Lights', now), medium: 'graphic', intent: words, graphic: { brief, options: [], direction: dir, doc, versions: [] } };
// a board as the earlier pipeline made one: a system proposed, materials planned and composed, mockups among them
const PL = V.boardPipeline;
const bbrief = V.boardPlan.readBoardRequest('A campaign for “Harbour Lights”, a winter night market on the quay: two posters, an Instagram post and a poster mockup.');
const sys = PL.proposeSystems(bbrief, 'legacy-board')[0];
let bstate = PL.startBoard(bbrief, sys, { request: bbrief.purpose });
await PL.generate(bstate, { website: async () => 'x' }, (op) => {
  const r = V.boardModel.applyBoardOp(bstate, op);
  if (r.ok) bstate = r.board;
});
bstate = PL.applyAll(bstate, PL.finishOps(bstate));
const bgraphics = bstate.materials.filter((m) => m.type === 'graphic' && m.doc);
const bmockups = bstate.materials.filter((m) => m.type === 'mockup').length;
const board = { ...V.makeProject('create', 'Harbour campaign', now + 1), medium: 'board', board: bstate };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const modelCalls = [];
await page.route(/\/api\/ux-v0\/(design|generate|refine|critique|studio-questions|graphic-design|graphic-edit)/, (route) => {
  modelCalls.push(route.request().url());
  return route.fulfill({ status: 503, json: { error: 'no model in this check' } });
});
const idb = (id) =>
  page.evaluate(
    (id) =>
      new Promise((res) => {
        const r = indexedDB.open('socria-ux-v0');
        r.onsuccess = () => {
          const g = r.result.transaction('projects', 'readonly').objectStore('projects').get(id);
          g.onsuccess = () => res(g.result ?? null);
          g.onerror = () => res(null);
        };
        r.onerror = () => res(null);
      }),
    id,
  );

await page.goto(`${BASE}/ux-v0`, { waitUntil: 'networkidle' });
await putProjectInBrowser(page, graphic);
await putProjectInBrowser(page, board);

console.log('=== an old graphic opens in the design workspace ===');
await page.goto(`${BASE}/ux-v0?p=${encodeURIComponent(graphic.id)}`, { waitUntil: 'networkidle' });
await page.waitForSelector('.dx-board iframe', { timeout: 30000 });
await page.waitForTimeout(1500);
const g1 = await idb(graphic.id);
ok('carried over once: a design project, one artboard per old artboard, the old record kept untouched', g1?.medium === 'design' && g1.design.doc.artboards.length === doc.artboards.length && g1.legacy?.medium === 'graphic' && g1.legacy.data.doc.id === doc.id && !g1.graphic, JSON.stringify({ medium: g1?.medium, n: g1?.design?.doc?.artboards?.length, legacy: g1?.legacy?.medium }));
const said = await page.locator('.dx-chat').innerText().catch(() => '');
ok('the first turn says what happened', /earlier editor/.test(said), said.slice(0, 200));
await page.screenshot({ path: `${OUT}01-graphic-open.png` });

// drawn as it was: the new artboard's frame beside the earlier renderer's SVG, both at the same size, the same faces
const ab = doc.artboards[0];
const oldSvg = V.gfxRender.renderArtboard(doc, ab, { idPrefix: 'old-' });
const frameShot = await page.locator('.dx-board iframe').first().screenshot();
writeFileSync(`${OUT}02-new.png`, frameShot);
const cmp = await browser.newPage({ viewport: { width: 1200, height: 1200 } });
const box = await page.locator('.dx-board iframe').first().boundingBox();
await cmp.setContent(`<!doctype html><html><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(doc.tokens.fonts.display)}&family=${encodeURIComponent(doc.tokens.fonts.body)}&display=block"></head><body style="margin:0">${oldSvg.replace(/^<svg([^>]*?) width="[^"]+" height="[^"]+"/, `<svg$1 width="${Math.round(box.width)}" height="${Math.round(box.height)}" preserveAspectRatio="none"`)}</body></html>`, { waitUntil: 'networkidle' }).catch(() => undefined);
await cmp.waitForTimeout(1200);
writeFileSync(`${OUT}03-old.png`, await cmp.locator('svg').first().screenshot());
const diff = await cmp.evaluate(
  async ([a, b]) => {
    const load = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = src; });
    const [x, y] = await Promise.all([load(a), load(b)]);
    const w = Math.min(x.width, y.width), h = Math.min(x.height, y.height);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.drawImage(x, 0, 0, w, h); const da = g.getImageData(0, 0, w, h).data;
    g.clearRect(0, 0, w, h); g.drawImage(y, 0, 0, w, h); const db = g.getImageData(0, 0, w, h).data;
    let off = 0;
    for (let i = 0; i < da.length; i += 4) if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) > 60) off++;
    return off / (w * h);
  },
  [`data:image/png;base64,${frameShot.toString('base64')}`, `data:image/png;base64,${(await cmp.locator('svg').first().screenshot()).toString('base64')}`],
);
ok('drawn as it was: under 3% of pixels differ from the earlier renderer’s own SVG', diff < 0.03, `${(diff * 100).toFixed(2)}% differ`);
await cmp.close();

// its words are elements like any other: selected and changed by hand
const frame = page.frameLocator('.dx-board iframe').first();
const head = frame.locator('text').filter({ hasText: /Harbour/ }).first();
await head.click({ force: true }).catch(() => undefined);
await page.waitForTimeout(500);
const inspector = await page.locator('.dx-inspect').innerText().catch(() => '');
ok('a word of the old drawing selects as an element, and the inspector opens on it', /Harbour/.test(inspector) || (await page.locator('.dx-inspect textarea, .dx-inspect input').count()) > 0, inspector.slice(0, 200));
await page.screenshot({ path: `${OUT}04-selected.png` });

console.log('\n=== an old board opens as a campaign ===');
await page.goto(`${BASE}/ux-v0?p=${encodeURIComponent(board.id)}`, { waitUntil: 'networkidle' });
await page.waitForSelector('.dx-board iframe', { timeout: 30000 });
await page.waitForTimeout(1500);
const b1 = await idb(board.id);
const wantN = bgraphics.reduce((n, m) => n + m.doc.artboards.length, 0);
ok('its graphic materials are its artboards, grouped by material; any mockup named, not redrawn', b1?.medium === 'design' && b1.design.kind === 'campaign' && wantN > 1 && b1.design.doc.artboards.length === wantN && new Set(b1.design.doc.artboards.map((a) => a.group)).size === bgraphics.length && (!bmockups || /mockup/.test(b1.design.turns[0]?.text ?? '')) && b1.legacy?.medium === 'board', JSON.stringify({ n: b1?.design?.doc?.artboards?.length, wantN, mockups: bmockups, said: b1?.design?.turns?.[0]?.text }));
await page.screenshot({ path: `${OUT}05-board-open.png` });

console.log('\n=== the collection ===');
await page.goto(`${BASE}/ux-v0?work=1`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
const plates = await page.locator('.mu-plate iframe.mu-plate-frame').count();
ok('both show their first artboard in the collection', plates >= 2, `${plates} framed plates`);
await page.screenshot({ path: `${OUT}06-collection.png`, fullPage: true });

ok('no model was called', modelCalls.length === 0, modelCalls.join(', '));
ok('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
console.log(`\nlegacy-qa: ${pass} passed, ${fail} failed (screenshots in ${OUT})`);
process.exit(fail ? 1 : 0);
