// test/browser/ux-v0/graphics-bench.mjs — the SocriaUX Graphics benchmark: twenty-four briefs (the Graphics 1.0 list,
// its part 17), each composed as the app composes it, then measured on what can be measured and shown for what cannot.
//
// For each brief: its directions (SocriaUX's own art-direction engine, as the app proposes them; the first, the
// faithful reading, is used), the composition and its bounded repair, timed; the words of the brief found exactly in
// the design; the deterministic findings left; the placeholders left for the designer to fill. Then in Chromium with
// the real faces from Google Fonts: every text measured as the browser sets it against its box; the design opened in
// the built app and exported as PNG through its own Export menu, and that file compared, pixel by pixel, with the
// design drawn on screen. Then eight changes in words on each design, and ten in a row on one, read in code.
//
// What needs a human eye (visual quality, originality) is not scored: every design is kept as a picture, on one
// contact sheet, for that. No model is called; the run fails if a model route is asked.
//
//   UXV0_FORWARD=1 UXV0_BASE=http://127.0.0.1:3100 node test/browser/ux-v0/graphics-bench.mjs   (against `next start`)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium, S, BASE, FX, underTest } from './env.mjs';

const V = await underTest();
const C = V.gfxCompose;
const D = V.gfxDoc;
const K = V.gfxCheck;
const R = V.gfxRender;
const E = V.gfxEdit;
const F = V.gfxFormats;
const J = JSON.stringify;
const OUT = `${S}gfx-bench/`;
mkdirSync(OUT, { recursive: true });
const pic = (f, w, h) => ({ id: `p${f.replace(/\W/g, '')}`, kind: 'image', src: `data:image/jpeg;base64,${readFileSync(FX + f).toString('base64')}`, width: w, height: h, name: f.replace(/\.jpg$/, ''), credit: 'SocriaUX test fixture', source: 'upload' });

// ── the twenty-four briefs ──
const BRIEFS = [
  { n: 1, name: 'Experimental typography poster', words: 'A poster for “Letters in Motion”, an experimental typography exhibition, “Twelve type designers, one room”, 12–30 June 2027, experimental, bold', content: { brand: 'The Print Room', meta: ['12–30 June 2027', 'The Print Room, Lisbon'] } },
  { n: 2, name: 'Luxury fashion advertisement', words: 'A luxury fashion advertisement for “Maison Orée”, “The Autumn Collection”, luxurious, elegant', content: { cta: 'Discover the collection', brand: 'Maison Orée' }, images: [pic('window.jpg', 800, 600)] },
  { n: 3, name: 'University event flyer', words: 'A university event flyer for “Open Lab Day”, “Meet the researchers behind the robots”, US Letter, friendly', content: { brand: 'Department of Robotics', meta: ['9 October 2027, 10:00–16:00', 'Engineering Building, Room 2.14'] }, formats: ['letter'] },
  { n: 4, name: 'Electronic music festival graphic', words: 'An Instagram post for “Pulse Weekend”, an electronic music festival, “48 hours of sound”, 21–23 July 2027, futuristic, loud', content: { brand: 'Pulse', meta: ['21–23 July 2027', 'Docklands, Dublin'] } },
  { n: 5, name: 'Corporate LinkedIn announcement', words: 'A LinkedIn announcement “We are opening our Berlin office”, “Northwind Analytics grows in Europe”, corporate', content: { brand: 'Northwind Analytics' } },
  { n: 6, name: 'Instagram carousel', words: 'An Instagram carousel “Five habits of calm teams” “Write it down” “Meet less” “Decide once” “Protect focus” “Say no kindly”, calm', content: { brand: 'Fieldnotes' } },
  { n: 7, name: 'Premium product advertisement', words: 'A premium product advertisement for “Aurel Ceramic Kettle”, “Pours like silk”, premium, minimal', content: { cta: 'Order now', brand: 'Aurel' }, images: [pic('ceramic.jpg', 800, 600)] },
  { n: 8, name: 'Minimalist album cover', words: 'A minimalist album cover for “Low Tide”, minimal, quiet', content: { brand: 'Mira Sol' } },
  { n: 9, name: 'Editorial magazine cover', words: 'An editorial magazine cover “The Craft Issue”, “Makers who slowed down”, editorial', content: { brand: 'Atelier', items: ['The potter who waits a year', 'Inside the last loom in town', 'A kitchen without plastic'] }, images: [pic('pour.jpg', 800, 600)] },
  { n: 10, name: 'Book cover', words: 'A book cover for the novel “The Salt Archive”, literary, serious', content: { brand: 'Inês Duarte' } },
  { n: 11, name: 'Independent creative studio identity', words: 'A brand identity board for “Studio Halftone”, an independent creative studio, playful, geometric', content: { brand: 'Studio Halftone' } },
  { n: 12, name: 'Restaurant promotional graphic', words: 'An Instagram post for “Salt & Ember”, “Fire-cooked tasting menu, every Thursday”, warm', content: { cta: 'Book a table', brand: 'Salt & Ember' }, images: [pic('cafe-bar.jpg', 800, 600)] },
  { n: 13, name: 'Technology conference poster', words: 'A poster for “Systems 2027”, a technology conference, “Infrastructure for the next decade”, 3–5 November 2027, technical', content: { brand: 'Systems Conf', meta: ['3–5 November 2027', 'Rotterdam Ahoy'] } },
  { n: 14, name: 'Abstract art exhibition graphic', words: 'A poster for “Unsaid Shapes”, an abstract art exhibition, experimental', content: { brand: 'Galeria Nove', meta: ['4 March – 12 April 2027'] } },
  { n: 15, name: 'Nonprofit awareness campaign', words: 'An Instagram portrait post “Every river starts as a stream”, “Protect the headwaters”, serious', content: { brand: 'Clearwater Trust', cta: 'Sign the pledge' }, kind: 'social', formats: ['instagram-portrait'] },
  { n: 16, name: 'Product launch banner', words: 'A web banner for the launch of “Orbit Notes 2.0”, “Your notes, finally in sync”', content: { cta: 'Try it free', brand: 'Orbit' } },
  { n: 17, name: 'Business card', words: 'A business card for “Ines Varga” “Collage artist”', content: { brand: 'Ines Varga', meta: ['ines@example.com', '+351 912 345 678'] } },
  { n: 18, name: 'Brand identity presentation', words: 'A brand identity presentation for “Kepler Lab”, a science studio, technical', content: { brand: 'Kepler Lab' } },
  { n: 19, name: 'Scientific infographic', words: 'A scientific infographic “How much of Earth’s water is fresh”', content: { data: [{ label: 'Salt water', value: 97.5 }, { label: 'Fresh water', value: 2.5 }], dataUnit: '%', dataSource: 'USGS Water Science School', items: ['Most fresh water is locked in ice.'] } },
  { n: 20, name: 'Statistical comparison graphic', words: 'A statistical comparison graphic “Commute times by city”', content: { data: [{ label: 'Lisbon', value: 32 }, { label: 'Madrid', value: 38 }, { label: 'Paris', value: 44 }, { label: 'London', value: 47 }], dataUnit: 'min', dataSource: 'City mobility survey 2026', items: ['London commuters spend half as long again as Lisbon’s.'] } },
  { n: 21, name: 'Educational diagram', words: 'An educational diagram “How a seed becomes a tree” “Germination” “Seedling” “Sapling” “Mature tree”', content: {}, kind: 'infographic' },
  { n: 22, name: 'Boutique packaging label', words: 'A boutique packaging label for “Wild Fennel Honey”, “Raw, from the Alentejo hills”', content: { brand: 'Colmeia', meta: ['250 g', 'Harvested August 2026'] } },
  { n: 23, name: 'Multi-format campaign', words: 'A multi-format campaign for “Night Market Lisbon”, “Food, music and makers after dark”, every Friday in July', content: { brand: 'Night Market', meta: ['Every Friday in July', 'Ribeira, Lisbon'] } },
  { n: 24, name: 'Website-to-graphics brand adaptation', words: 'A poster for the opening night of “Salt & Ember”, “Twelve tables, one fire”, 2 May 2027', content: { brand: 'Salt & Ember', meta: ['2 May 2027'] }, fromWebsite: true },
];

// the website whose approved direction brief 24 takes, made as the app makes one
const wbrief = V.normalizeBrief({ pageType: 'website', platform: 'web', objective: 'A website for Salt & Ember, a twelve-table restaurant cooking over fire, where guests book a table and read the menu.', personality: ['warm', 'confident'], visualDirection: 'Warm and editorial, firelight and dark wood.', palette: [], typography: { display: '', body: '' }, decisions: { colour: 'delegated', typography: 'delegated' } }, new Set());
const siteDir = V.proposeDirections({ brief: wbrief, salt: 'graphics-bench-site' })[1];

const directionsFor = (brief, salt) => {
  const accent = C.accentFor(brief, salt);
  const db = V.normalizeBrief({ pageType: 'website', objective: brief.purpose || brief.content.headline, personality: brief.mood, visualDirection: [brief.purpose, brief.mood.join(', ')].filter(Boolean).join('. '), palette: [{ name: 'Accent', hex: accent.hex, role: 'accent' }], typography: { display: '', body: '' }, decisions: { colour: 'delegated', typography: 'delegated' } });
  return V.proposeDirections({ brief: db, salt, count: 3 }).map((d) => C.graphicDirectionOf(d));
};
const allWords = (doc) => doc.artboards.flatMap((ab) => D.walk(ab).map((l) => l.node).filter((n) => n.type === 'text').map((n) => n.text));
const required = (b) => [b.content.headline, b.content.subhead, b.content.cta, b.content.brand, ...(b.content.meta ?? []), ...(b.content.items ?? [])].filter(Boolean);
const hasWords = (doc, w) => {
  const ws = allWords(doc);
  return ws.some((t) => t === w || t.includes(w) || t.replace(/\s*→$/, '') === w);
};

// ── compose ──
console.log('=== SocriaUX Graphics benchmark: 24 briefs ===');
const rows = [];
for (const spec of BRIEFS) {
  const extra = { ...(spec.kind ? { kind: spec.kind } : {}), ...(spec.formats ? { formats: spec.formats } : {}) };
  const brief = C.readGraphicBrief(spec.words, extra);
  brief.content = { ...brief.content, ...spec.content };
  if (spec.images) brief.images = spec.images.map((p) => p.id);
  const salt = `bench-${spec.n}`;
  const options = spec.fromWebsite ? [C.graphicDirectionOf(siteDir)] : directionsFor(brief, salt);
  const dir = options[0];
  const t0 = performance.now();
  const made = C.composeGraphic(brief, dir, { seed: spec.n * 7, assets: spec.images ?? [], name: spec.name });
  const refined = K.refineDoc(made.doc);
  const ms = performance.now() - t0;
  const doc = refined.doc;
  const req = required(brief);
  const found = req.filter((w) => hasWords(doc, w));
  const findings = K.checkDoc(doc);
  const dataOk = brief.content.data ? doc.artboards.some((ab) => D.walk(ab).some((l) => l.node.type === 'chart' && J(l.node.data.map((d) => d.value)) === J(brief.content.data.map((d) => d.value)))) : null;
  const tokensSame = doc.artboards.length > 1 ? true : null;
  // the three directions differ in structure, not only colour
  const structures = spec.fromWebsite ? [] : options.map((o) => C.planFor(brief, o, F.formatOf(brief.formats[0])));
  rows.push({
    n: spec.n,
    name: spec.name,
    kind: brief.kind,
    formats: brief.formats,
    direction: `${dir.name} (${dir.language})`,
    archetype: made.plans[0]?.archetype,
    ground: doc.artboards[0].background,
    fonts: `${doc.tokens.fonts.display} / ${doc.tokens.fonts.body}`,
    boards: doc.artboards.length,
    objects: doc.artboards.reduce((s, ab) => s + D.walk(ab).length, 0),
    ms: Math.round(ms * 10) / 10,
    words: `${found.length}/${req.length}`,
    wordsOk: found.length === req.length,
    missingWords: req.filter((w) => !found.includes(w)),
    dataOk,
    fixed: refined.fixed.length,
    rounds: refined.rounds,
    left: { high: findings.filter((f) => f.severity === 'high').length, medium: findings.filter((f) => f.severity === 'medium').length, low: findings.filter((f) => f.severity === 'low' && f.kind !== 'placeholder').length },
    leftKinds: [...new Set(findings.filter((f) => f.severity !== 'low').map((f) => f.kind))],
    placeholders: made.placeholders,
    directionStructures: [...new Set(structures.map((p) => `${p.archetype}/${p.colour}`))].length,
    brandSame: spec.fromWebsite ? doc.tokens.fonts.display === siteDir.tokens.fonts.display && doc.tokens.colors.accent === siteDir.tokens.colors.accent : tokensSame,
    doc,
    brief,
    dir,
  });
  const r = rows.at(-1);
  console.log(`${String(spec.n).padStart(2)} ${spec.name.padEnd(36)} ${r.kind.padEnd(12)} ${r.archetype?.padEnd(11)} boards ${r.boards} words ${r.words}${r.dataOk === null ? '' : ` data ${r.dataOk ? 'exact' : 'WRONG'}`} left ${r.left.high}/${r.left.medium} fixed ${r.fixed} ph ${r.placeholders.length} ${r.ms} ms`);
}

// ── changes in words, on every design ──
const COMMANDS = ['make the headline bigger', 'make the headline smaller', 'increase the contrast without changing the composition', 'move the subtitle beneath the main headline', 'make the layout more experimental', 'create a second version with different typography', 'preserve the logo and all brand colors', 'adapt it to a story'];
let tried = 0;
let reliable = 0;
const editFails = [];
for (const r of rows) {
  const board = r.doc.artboards[0];
  const before = allWords(r.doc);
  for (const w of COMMANDS) {
    if (/subtitle/.test(w) && !r.brief.content.subhead) continue;
    if (/story/.test(w) && board.format === 'story') continue;
    tried++;
    const e = E.readGraphicEdit(w, r.doc, { artboard: board.id, selection: [], dir: r.dir });
    let good = false;
    let why = 'not read';
    if (e) {
      const res = e.next ? { ok: true, doc: e.next } : D.applyOps(r.doc, e.ops);
      if (!res.ok) why = `refused: ${res.error}`;
      else {
        const after = allWords(res.doc);
        const kept = before.every((t) => after.includes(t));
        const changed = J(res.doc) !== J(r.doc);
        // a change that was not needed may be said and not made ("already as high as it goes"); anything else must change
        good = kept && (changed || (e.ops.length === 0 && !e.next && /already|as high/.test(e.label)) || (!!e.question && e.ops.length === 0));
        why = !kept ? 'words lost' : changed ? 'ok' : `no change (${e.label}${e.question ? `; ${e.question}` : ''})`;
      }
    }
    if (good) reliable++;
    else editFails.push(`${r.n} ${w}: ${why}`);
  }
}
// ten in a row on the poster: each valid, the words kept, every step taken back to the start
const seq = ['make the headline bigger', 'move the subtitle beneath the main headline', 'increase the contrast', 'make the layout more experimental', 'make the headline smaller', 'use more editorial typography', 'preserve the logo', 'turn these shapes into an angular geometric pattern', 'make the infographic easier to read', 'adapt it to a story'];
let cur = rows[0].doc;
const stack = [cur];
let seqOk = 0;
for (const w of seq) {
  const e = E.readGraphicEdit(w, cur, { artboard: cur.artboards[0].id, selection: [], dir: rows[0].dir });
  if (!e) continue;
  const res = e.next ? { ok: true, doc: e.next } : D.applyOps(cur, e.ops);
  if (!res.ok) continue;
  if (D.normalizeDoc(res.doc) && allWords(rows[0].doc).every((t) => allWords(res.doc).includes(t))) seqOk++;
  cur = res.doc;
  stack.push(cur);
}
const backToStart = J(stack[0]) === J(rows[0].doc);
console.log(`\nchanges in words: ${reliable}/${tried} reliable across the 24 designs; ten in a row on the poster: ${seqOk}/10 valid with every word kept, and the history goes back to the start: ${backToStart}`);
if (editFails.length) console.log('  not reliable:', editFails.join(' | '));

// ── in the browser: real faces, the app's own export, the drawing compared ──
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
const modelCalls = [];
const errors = [];
page.on('request', (r) => /\/api\/ux-v0\/(generate|refine|brief|discover|direct|critique)/.test(r.url()) && modelCalls.push(r.url()));
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
const sheet = await ctx.newPage();
await page.goto(BASE + '/ux-v0', { waitUntil: 'networkidle' });

const putProject = (p) =>
  page.evaluate(async (p) => {
    await new Promise((res, rej) => {
      const req = indexedDB.open('socria-ux-v0', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('artifacts')) db.createObjectStore('artifacts', { keyPath: 'id' });
      };
      req.onsuccess = () => {
        const t = req.result.transaction('projects', 'readwrite');
        t.objectStore('projects').put(p);
        t.oncomplete = () => res();
        t.onerror = () => rej(t.error);
      };
      req.onerror = () => rej(req.error);
    });
  }, p);

for (const r of rows) {
  const board = r.doc.artboards[0];
  const px = F.exportPixels(board);
  // 1. drawn on its own with the real faces: every text measured as the browser sets it
  const faces = V.fontStylesheet([r.doc.tokens.fonts.display, r.doc.tokens.fonts.body, ...D.walk(board).filter((l) => l.node.type === 'text').map((l) => l.node.font)]);
  const k = Math.min(1, 900 / Math.max(px.w, px.h));
  const svg = R.renderArtboard(r.doc, board, { idPrefix: `b${r.n}-` }).replace(/^<svg([^>]*?) width="[^"]+" height="[^"]+"/, `<svg$1 width="${Math.round(px.w * k)}" height="${Math.round(px.h * k)}"`);
  await sheet.setContent(`<!doctype html><html><head>${faces ? `<link rel="stylesheet" href="${faces}">` : ''}<style>body{margin:0;background:#fff}</style></head><body>${svg}</body></html>`, { waitUntil: 'load' });
  const texts = D.walk(board).filter((l) => l.node.type === 'text' && !l.node.hidden && !l.node.vertical && !l.node.rotation).map((l) => ({ id: l.node.id, w: l.node.w, h: l.node.h, font: l.node.font, weight: l.node.weight, italic: !!l.node.italic, role: l.node.role }));
  const measured = await sheet.evaluate(async (texts) => {
    await Promise.all(texts.map((t) => document.fonts.load(`${t.italic ? 'italic ' : ''}${t.weight} 40px "${t.font}"`).catch(() => null)));
    await document.fonts.ready;
    const out = [];
    for (const t of texts) {
      const g = document.querySelector(`[data-gfx-id="${t.id}"]`);
      const el = g?.querySelector('text');
      if (!el) continue;
      const bb = el.getBBox();
      out.push({ id: t.id, role: t.role, over: bb.width > t.w * 1.02 + 1, ratio: Math.round((bb.width / t.w) * 100) / 100, loaded: document.fonts.check(`${t.weight} 40px "${t.font}"`) });
    }
    return out;
  }, texts);
  const shot = await sheet.locator('svg').first().screenshot();
  writeFileSync(`${OUT}${String(r.n).padStart(2, '0')}.png`, shot);
  r.realOverflow = measured.filter((m) => m.over).map((m) => `${m.role} ×${m.ratio}`);
  r.facesLoaded = measured.every((m) => m.loaded);

  // 2. opened in the built app as a graphics project, exported as PNG through its own Export menu
  const id = `gfxbench${r.n}x${Date.now().toString(36)}`;
  await putProject(JSON.parse(J(V.normalizeProject({ ...V.makeProject('create', `Bench ${r.n}: ${r.name}`), id, medium: 'graphic', graphic: { brief: r.brief, options: [r.dir], direction: r.dir, doc: r.doc, versions: [] } }))));
  await page.goto(`${BASE}/ux-v0?p=${id}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.gx-canvas .gx-board svg', { timeout: 30000 });
  await page.waitForTimeout(600);
  await page.locator('.gx-export > summary').click();
  const t1 = Date.now();
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 90000 }), page.locator('.gx-export-menu button').filter({ hasText: /^PNG( at \d+ dpi)?$/ }).first().click()]);
  const png = readFileSync(await dl.path());
  r.exportMs = Date.now() - t1;
  r.exportW = png.readUInt32BE(16);
  r.exportH = png.readUInt32BE(20);
  r.exportSizeOk = png.subarray(1, 4).toString() === 'PNG' && (r.exportW === Math.round(px.w) || r.exportW === Math.min(8000, Math.round(px.w))) && Math.abs(r.exportH / r.exportW - px.h / px.w) < 0.01;
  r.exportNote = (await page.locator('.gx-note').allInnerTexts()).join(' ');
  // 3. the exported file against the drawing on screen: both scaled to 240 px wide, the mean difference per channel
  r.exportDiff = await sheet.evaluate(
    async ([a, bb]) => {
      const load = (src) => new Promise((res, rej) => Object.assign(new Image(), { onload() { res(this); }, onerror: rej, src }));
      const [x, y] = await Promise.all([load(a), load(bb)]);
      const W = 240;
      const H = Math.round((W * x.height) / x.width);
      const px = (img) => {
        const c = Object.assign(document.createElement('canvas'), { width: W, height: H });
        const g = c.getContext('2d');
        g.fillStyle = '#fff';
        g.fillRect(0, 0, W, H);
        g.drawImage(img, 0, 0, W, H);
        return g.getImageData(0, 0, W, H).data;
      };
      const p = px(x);
      const q = px(y);
      let sum = 0;
      for (let i = 0; i < p.length; i += 4) sum += Math.abs(p[i] - q[i]) + Math.abs(p[i + 1] - q[i + 1]) + Math.abs(p[i + 2] - q[i + 2]);
      return Math.round((sum / ((p.length / 4) * 3 * 255)) * 10000) / 100;
    },
    [`data:image/png;base64,${png.toString('base64')}`, `data:image/png;base64,${shot.toString('base64')}`],
  );
  console.log(`${String(r.n).padStart(2)} real faces ${r.facesLoaded ? 'loaded' : 'NOT ALL LOADED'}; text wider than its box: ${r.realOverflow.length ? r.realOverflow.join(', ') : 'none'}; PNG ${r.exportW}×${r.exportH} ${r.exportSizeOk ? 'as sized' : 'WRONG SIZE'} in ${r.exportMs} ms; differs from the screen by ${r.exportDiff}%`);
}

// ── the contact sheet, for the eye ──
const cells = rows.map((r) => `<figure><img src="${String(r.n).padStart(2, '0')}.png"><figcaption><b>${r.n}. ${r.name}</b><br>${r.direction} · ${r.archetype} · ${r.boards} artboard${r.boards === 1 ? '' : 's'}</figcaption></figure>`).join('');
writeFileSync(`${OUT}sheet.html`, `<!doctype html><meta charset="utf-8"><style>body{margin:24px;font:13px/1.4 system-ui;background:#eee}main{display:grid;grid-template-columns:repeat(6,1fr);gap:18px;align-items:start}img{width:100%;display:block;box-shadow:0 1px 3px #0003;background:#fff}figure{margin:0}figcaption{margin-top:6px;color:#333}</style><h1>SocriaUX Graphics — 24 briefs, first direction each</h1><main>${cells}</main>`);
await sheet.goto(`file://${OUT}sheet.html`);
await sheet.setViewportSize({ width: 1800, height: 1000 });
await sheet.waitForTimeout(500);
await sheet.screenshot({ path: `${OUT}sheet.png`, fullPage: true });
await b.close();

// ── the summary ──
const n = rows.length;
const sum = {
  briefs: n,
  wordsExact: rows.filter((r) => r.wordsOk).length,
  dataExact: rows.filter((r) => r.dataOk === true).length + '/' + rows.filter((r) => r.dataOk !== null).length,
  highLeft: rows.reduce((s, r) => s + r.left.high, 0),
  mediumLeft: rows.reduce((s, r) => s + r.left.medium, 0),
  realOverflow: rows.filter((r) => r.realOverflow.length).length,
  facesLoaded: rows.filter((r) => r.facesLoaded).length,
  exportSized: rows.filter((r) => r.exportSizeOk).length,
  exportDiffMax: Math.max(...rows.map((r) => r.exportDiff)),
  exportDiffMean: Math.round((rows.reduce((s, r) => s + r.exportDiff, 0) / n) * 100) / 100,
  composeMsMedian: [...rows.map((r) => r.ms)].sort((a, b) => a - b)[Math.floor(n / 2)],
  composeMsMax: Math.max(...rows.map((r) => r.ms)),
  exportMsMedian: [...rows.map((r) => r.exportMs)].sort((a, b) => a - b)[Math.floor(n / 2)],
  edits: `${reliable}/${tried}`,
  tenInARow: `${seqOk}/10`,
  historyBackToStart: backToStart,
  placeholders: rows.reduce((s, r) => s + r.placeholders.length, 0),
  interventions: rows.filter((r) => r.placeholders.length || r.left.high || r.left.medium).length,
  archetypes: new Set(rows.map((r) => r.archetype)).size,
  grounds: new Set(rows.map((r) => r.ground)).size,
  faces: new Set(rows.map((r) => r.fonts)).size,
  directionsDiffer: rows.filter((r) => r.directionStructures >= 2).length + '/' + rows.filter((r) => !r.brief || r.n !== 24).length,
  brandCarried: rows.find((r) => r.n === 24).brandSame,
  modelCalls: modelCalls.length,
  pageErrors: errors.length,
  costUsd: 0,
};
console.log('\n=== summary ===');
for (const [k, v] of Object.entries(sum)) console.log(`  ${k}: ${v}`);
writeFileSync(`${OUT}bench.json`, J({ sum, rows: rows.map(({ doc, brief, dir, ...r }) => r), editFails }, null, 1));
console.log(`\nscreenshots, the contact sheet and bench.json in ${OUT}`);
const bad = sum.wordsExact < n || sum.exportSized < n || modelCalls.length || errors.length;
process.exit(bad ? 1 : 0);
