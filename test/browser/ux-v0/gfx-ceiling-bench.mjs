// test/browser/ux-v0/gfx-ceiling-bench.mjs — the Graphics creative-ceiling benchmark: thirty briefs (its section 16),
// composed as the app composes them, measured for diversity (compositions, styles, shapes, patterns, effects, type
// treatments, colour relationships, hierarchies, repeated signatures), checked (words exact, findings left), drawn in
// Chromium two ways — as the canvas draws it (inline SVG) and as the export draws it (the SVG as an image into a canvas,
// as lib/ux-v0/graphics/raster.ts does) — and the two compared pixel by pixel. Then the same thirty with the previous
// commit's composer (UXV0_BEFORE_BUNDLE: its built test bundle), measured the same way, side by side.
//
// What needs a human eye (quality, originality) is not scored: every design is kept as a picture, on contact sheets.
// No model is called.
//
//   UXV0_BEFORE_BUNDLE=/path/to/old/test/.tmp/ux-v0-under-test.mjs node test/browser/ux-v0/gfx-ceiling-bench.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { chromium, S, underTest } from './env.mjs';
import { CEILING_BRIEFS, composeAll } from './gfx-ceiling-briefs.mjs';

const V = await underTest();
const OUT = `${S}gfx-ceiling/`;
mkdirSync(OUT, { recursive: true });
const J = JSON.stringify;
const before = process.env.UXV0_BEFORE_BUNDLE ? await import(pathToFileURL(process.env.UXV0_BEFORE_BUNDLE).href) : null;

const walkAll = (VV, doc) => doc.artboards.flatMap((ab) => VV.gfxDoc.walk(ab).map((l) => l.node));
const lum = (hex) => {
  const c = (hex ?? '#ffffff').slice(1, 7);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** What a design is made of, read from its document (the same reading for both versions). */
function measure(VV, row) {
  const doc = row.made.doc;
  const ab = doc.artboards[0];
  const ns = walkAll(VV, { artboards: [ab] });
  const texts = ns.filter((n) => n.type === 'text');
  const head = texts.find((t) => t.role === 'headline') ?? texts.sort((a, b) => b.size - a.size)[0];
  const typeTreat = [
    head?.path ? `path:${head.path.kind}` : null,
    head?.warp ? `warp:${head.warp.kind}` : null,
    head?.repeat ? 'echo' : null,
    head?.runs?.length ? 'mixed' : null,
    head?.fill === null ? 'outline' : head?.fill ? 'gradient' : null,
    head?.vertical ? 'vertical' : null,
    (head?.tracking ?? 0) > 150 ? 'spaced' : null,
    head?.rotation ? 'turned' : null,
    head?.effects?.length ? `fx:${head.effects.map((e) => e.kind).join('+')}` : null,
  ].filter(Boolean);
  const shapes = ns.filter((n) => n.type === 'shape');
  const prims = [...new Set(shapes.map((n) => (n.shape === 'prim' ? n.prim?.kind : n.shape === 'recipe' ? `recipe:${n.recipe?.kind}` : n.shape)))];
  const families = [...new Set(shapes.map((n) => (n.shape === 'prim' ? VV.gfxGeometry?.PRIMITIVE_BY_KIND?.get(n.prim?.kind)?.category ?? 'prim' : n.shape === 'recipe' ? 'recipe' : ['rect', 'line'].includes(n.shape) ? 'basic' : 'basic')))];
  const patterns = [...new Set(ns.filter((n) => n.type === 'pattern').map((n) => n.gen))];
  const effects = [...new Set(ns.flatMap((n) => (n.effects ?? []).map((e) => e.kind)))];
  const blends = [...new Set(ns.map((n) => n.blend).filter(Boolean))];
  const masks = ns.filter((n) => n.type === 'group' && (n.mask || n.boolean)).length;
  const groundL = lum(ab.background ?? '#ffffff');
  const colourRel = `${groundL < 0.18 ? 'dark' : groundL > 0.6 ? 'light' : 'mid'}-${row.made.plans[0]?.colour ?? 'ground'}`;
  const hierarchy = texts
    .slice()
    .sort((a, b) => b.size - a.size)
    .map((t) => t.role ?? 'text')
    .filter((r, i, all) => all.indexOf(r) === i)
    .slice(0, 4)
    .join('>');
  const imgs = ns.filter((n) => n.type === 'image');
  const imageTreat = imgs.length ? [...new Set(imgs.flatMap((n) => [...(n.effects ?? []).map((e) => e.kind), ...(n.adjust ? ['adjust'] : []), ...(n.filter ? ['filter'] : [])]))].join('+') || 'as-is' : 'none';
  const plan = row.made.plans[0];
  return {
    n: row.spec.n,
    name: row.spec.name,
    archetype: plan?.archetype,
    style: plan?.vocabulary?.style ?? '(none)',
    layout: plan?.strategy?.layout ?? '(none)',
    typeTreat: typeTreat.join(',') || 'plain',
    prims,
    families,
    patterns,
    effects,
    blends,
    masks,
    colourRel,
    hierarchy,
    imageTreat,
    nodes: ns.length,
    signature: [plan?.archetype, colourRel, families.sort().join('+'), patterns.join('+'), typeTreat.join(',')].join(' | '),
    ms: Math.round(row.ms * 10) / 10,
    wordsExact: [row.brief.content.headline, row.brief.content.subhead, row.brief.content.cta, row.brief.content.brand, ...(row.brief.content.meta ?? [])].filter(Boolean).every((w) => walkAll(VV, doc).some((n) => n.type === 'text' && (n.text === w || n.text.includes(w) || n.text.replace(/\s*→$/, '') === w))),
    high: VV.gfxCheck.checkDoc(doc).filter((f) => f.severity === 'high').length,
  };
}
function summary(ms) {
  const distinct = (k) => new Set(ms.map((m) => m[k])).size;
  const union = (k) => new Set(ms.flatMap((m) => m[k]));
  const count = (k) => ms.reduce((acc, m) => ((acc[m[k]] = (acc[m[k]] ?? 0) + 1), acc), {});
  const maxShare = (k) => Math.max(...Object.values(count(k)));
  const sig = count('signature');
  const prims = ms.flatMap((m) => m.prims);
  const primFreq = prims.reduce((acc, p) => ((acc[p] = (acc[p] ?? 0) + 1), acc), {});
  return {
    designs: ms.length,
    compositions: distinct('archetype'),
    mostCommonComposition: maxShare('archetype'),
    layoutSystems: distinct('layout'),
    styles: distinct('style'),
    typeTreatments: distinct('typeTreat'),
    hierarchies: distinct('hierarchy'),
    colourRelationships: distinct('colourRel'),
    imageTreatments: distinct('imageTreat'),
    shapeKinds: union('prims').size,
    shapeFamilies: union('families').size,
    mostRepeatedShape: Object.entries(primFreq).sort((a, b) => b[1] - a[1])[0],
    patternGenerators: union('patterns').size,
    effectKinds: union('effects').size,
    blendModes: union('blends').size,
    designsWithMasksOrBooleans: ms.filter((m) => m.masks > 0).length,
    repeatedSignatures: Object.values(sig).filter((v) => v > 1).reduce((a, b) => a + b, 0),
    distinctSignatures: Object.keys(sig).length,
    wordsExact: ms.filter((m) => m.wordsExact).length,
    highFindings: ms.reduce((a, m) => a + m.high, 0),
    composeMsMedian: ms.map((m) => m.ms).sort((a, b) => a - b)[Math.floor(ms.length / 2)],
  };
}

console.log('=== SocriaUX Graphics: the creative-ceiling benchmark, thirty briefs ===');
const after = composeAll(V, 'bench');
const mAfter = after.map((r) => measure(V, r));
const sAfter = summary(mAfter);
let mBefore = null;
let sBefore = null;
let beforeRows = null;
if (before) {
  beforeRows = composeAll(before, 'bench');
  mBefore = beforeRows.map((r) => measure(before, r));
  sBefore = summary(mBefore);
}

// ── drawn two ways: the canvas (inline SVG) and the export (the SVG as an image, into a canvas) ──
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.setContent('<html><body style="margin:0;background:#fff"></body></html>');
const fidelity = [];
const pngs = {};
for (const row of after) {
  const ab = row.made.doc.artboards[0];
  const svg = V.gfxRender.renderArtboard(row.made.doc, ab, { idPrefix: `b${row.spec.n}-` });
  const k = Math.min(600 / ab.width, 600 / ab.height);
  const w = Math.round(ab.width * k);
  const h = Math.round(ab.height * k);
  const sized = svg.replace(/width="[^"]+" height="[^"]+"/, `width="${w}" height="${h}"`);
  const res = await page.evaluate(
    async ({ svg, w, h }) => {
      // the export's way: as raster.ts rasterize() draws it
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      const img = new Image();
      await new Promise((r, j) => {
        img.onload = r;
        img.onerror = () => j(new Error('the SVG did not load as an image'));
        img.src = url;
      });
      const c1 = document.createElement('canvas');
      c1.width = w;
      c1.height = h;
      const x1 = c1.getContext('2d');
      x1.fillStyle = '#fff';
      x1.fillRect(0, 0, w, h);
      x1.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      return { exportPng: c1.toDataURL('image/png'), data: Array.from(x1.getImageData(0, 0, w, h).data) };
    },
    { svg: sized, w, h },
  );
  // the canvas's way: the same SVG in the page
  await page.setContent(`<html><body style="margin:0;background:#fff">${sized}</body></html>`);
  await page.waitForTimeout(60);
  const shot = await page.screenshot({ clip: { x: 0, y: 0, width: w, height: h } });
  const inline = await page.evaluate(
    async ({ b64, w, h }) => {
      const img = new Image();
      await new Promise((r) => {
        img.onload = r;
        img.src = `data:image/png;base64,${b64}`;
      });
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const x = c.getContext('2d');
      x.drawImage(img, 0, 0);
      return Array.from(x.getImageData(0, 0, w, h).data);
    },
    { b64: shot.toString('base64'), w, h },
  );
  let diff = 0;
  let off = 0;
  for (let i = 0; i < inline.length; i += 4) {
    const d = Math.abs(inline[i] - res.data[i]) + Math.abs(inline[i + 1] - res.data[i + 1]) + Math.abs(inline[i + 2] - res.data[i + 2]);
    diff += d;
    if (d > 60) off++;
  }
  const px = inline.length / 4;
  fidelity.push({ n: row.spec.n, meanDiff: Math.round((diff / px / 3) * 100) / 100, offShare: Math.round((off / px) * 10000) / 100 });
  pngs[row.spec.n] = res.exportPng;
  writeFileSync(`${OUT}after-${String(row.spec.n).padStart(2, '0')}.png`, Buffer.from(res.exportPng.split(',')[1], 'base64'));
  await page.setContent('<html><body style="margin:0;background:#fff"></body></html>');
}

// before, drawn the same way (export path), for the side-by-side sheet
const pngsBefore = {};
if (before)
  for (const row of beforeRows) {
    const ab = row.made.doc.artboards[0];
    const svg = before.gfxRender.renderArtboard(row.made.doc, ab, { idPrefix: `o${row.spec.n}-` });
    const k = Math.min(600 / ab.width, 600 / ab.height);
    const sized = svg.replace(/width="[^"]+" height="[^"]+"/, `width="${Math.round(ab.width * k)}" height="${Math.round(ab.height * k)}"`);
    pngsBefore[row.spec.n] = await page.evaluate(async ({ svg }) => {
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      const img = new Image();
      await new Promise((r) => {
        img.onload = r;
        img.src = url;
      });
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const x = c.getContext('2d');
      x.fillStyle = '#fff';
      x.fillRect(0, 0, c.width, c.height);
      x.drawImage(img, 0, 0);
      return c.toDataURL('image/png');
    }, { svg: sized });
  }

// ── contact sheets ──
const cell = (src, caption) => `<figure style="display:inline-block;width:250px;margin:5px;vertical-align:top;font:11px system-ui"><div style="width:250px;height:250px;display:flex;align-items:center;justify-content:center;background:#fff"><img src="${src}" style="max-width:250px;max-height:250px"></div><figcaption>${caption}</figcaption></figure>`;
await page.setViewportSize({ width: 1560, height: 900 });
await page.setContent(`<html><body style="margin:8px;background:#e6e4de">${after.map((r) => cell(pngs[r.spec.n], `${r.spec.n}. ${r.spec.name} — ${mAfter.find((m) => m.n === r.spec.n).archetype} / ${mAfter.find((m) => m.n === r.spec.n).style}`)).join('')}</body></html>`);
await page.screenshot({ path: `${OUT}contact-sheet-after.png`, fullPage: true });
if (before) {
  const pairs = after.map((r) => `<div style="display:inline-block;margin:6px;padding:6px;background:#fff;vertical-align:top"><div style="font:600 11px system-ui;margin-bottom:4px">${r.spec.n}. ${r.spec.name}</div>${cell(pngsBefore[r.spec.n], 'before (4c269cf)')}${cell(pngs[r.spec.n], 'after')}</div>`).join('');
  await page.setViewportSize({ width: 1640, height: 900 });
  await page.setContent(`<html><body style="margin:8px;background:#e6e4de">${pairs}</body></html>`);
  await page.screenshot({ path: `${OUT}before-after.png`, fullPage: true });
}
await browser.close();

// ── the record ──
const fid = { median: fidelity.map((f) => f.meanDiff).sort((a, b) => a - b)[Math.floor(fidelity.length / 2)], worst: fidelity.slice().sort((a, b) => b.meanDiff - a.meanDiff)[0], allUnder: fidelity.filter((f) => f.offShare < 2).length };
const report = { briefs: CEILING_BRIEFS.length, after: { summary: sAfter, designs: mAfter }, before: before ? { summary: sBefore, designs: mBefore } : null, fidelity: { ...fid, perDesign: fidelity }, errors };
writeFileSync(`${OUT}report.json`, J(report, null, 2));
const row = (label, k) => `${label.padEnd(34)} ${String(sBefore ? sBefore[k] ?? '' : '').padStart(8)} ${String(sAfter[k]).padStart(8)}`;
console.log(`${''.padEnd(34)} ${'before'.padStart(8)} ${'after'.padStart(8)}`);
for (const [label, k] of [['distinct compositions', 'compositions'], ['most designs sharing one', 'mostCommonComposition'], ['layout systems', 'layoutSystems'], ['styles read', 'styles'], ['type treatments', 'typeTreatments'], ['text hierarchies', 'hierarchies'], ['colour relationships', 'colourRelationships'], ['picture treatments', 'imageTreatments'], ['shape kinds used', 'shapeKinds'], ['shape families used', 'shapeFamilies'], ['pattern generators used', 'patternGenerators'], ['effect kinds used', 'effectKinds'], ['blend modes used', 'blendModes'], ['designs with masks or booleans', 'designsWithMasksOrBooleans'], ['distinct signatures (of 30)', 'distinctSignatures'], ['designs sharing a signature', 'repeatedSignatures'], ['words exact (of 30)', 'wordsExact'], ['high findings left', 'highFindings'], ['median compose ms', 'composeMsMedian']]) console.log(row(label, k));
console.log(`most repeated shape: before ${J(sBefore?.mostRepeatedShape)}, after ${J(sAfter.mostRepeatedShape)}`);
console.log(`export fidelity (canvas vs export path, mean channel difference 0–255): median ${fid.median}, worst #${fid.worst.n} ${fid.worst.meanDiff} (${fid.worst.offShare}% of pixels off by more than 60), ${fid.allUnder}/30 with under 2% of pixels off`);
console.log(`page errors: ${errors.length}; files in ${OUT}`);
