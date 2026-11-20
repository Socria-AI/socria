// test/browser/ux-v0/style-bench.mjs — the Style Intelligence benchmark (the mandate's section 16): one brief, "a
// promotional poster for a creative technology exhibition, with the event name, date, location and a short tagline",
// composed as the app composes it in every one of the 75 styles; measured (its construction, where its words, shapes
// and pictures sit, its faces, shapes, palette, fidelity to its language, the checks' findings, its words exact);
// compared for the failure conditions the mandate names (most outputs sharing a layout, differences mostly of colour,
// near-identical typography, geometry that does not follow the style, decorative effects, everything looking like
// SaaS); the ten required pairs side by side; and every design drawn in Chromium with its real faces, on contact
// sheets by category. Scores are measured from the documents, never invented; what needs an eye is left to the
// sheets. No model is called.
//
//   UXV0_OUT=/somewhere node test/browser/ux-v0/style-bench.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium, S, underTest } from './env.mjs';
import { pic } from './gfx-ceiling-briefs.mjs';

const V = await underTest();
const OUT = `${S}style-bench/`;
mkdirSync(OUT, { recursive: true });
const J = JSON.stringify;
const { gfxCompose: C, gfxDoc: D, gfxRender: R, gfxCheck: CK, gfxStyles: REG, gfxStyleApply: AP, gfxStyleEvaluate: EV, gfxStyleSchema: SS } = V;

const WORDS = 'Create a promotional poster for a creative technology exhibition. Include the event name, date, location, and a short tagline.';
const CONTENT = { headline: 'Signal & Form', subhead: 'Where code becomes craft', meta: ['12–28 March 2027', 'Lisbon Design Centre'] };
const briefFor = (extra = {}) => {
  const b = C.readGraphicBrief(WORDS, extra);
  b.content = { ...b.content, ...CONTENT };
  delete b.content.brand;
  delete b.content.cta;
  return b;
};
const wbrief = V.normalizeBrief({
  pageType: 'website',
  objective: 'A creative technology exhibition',
  personality: ['curious'],
  visualDirection: 'neutral',
  palette: [],
  typography: { display: '', body: '' },
  decisions: { colour: 'delegated', typography: 'delegated' },
});
const BASE = C.graphicDirectionOf(V.proposeDirections({ brief: wbrief, salt: 'style-bench', count: 3 })[0]);
const nodesOf = (doc) => D.walk(doc.artboards[0]).map((l) => l.node);
const STYLES = REG.builtInStyles();

const PAIRS = [
  ['swiss-international', 'bauhaus'],
  ['art-nouveau', 'art-deco'],
  ['digital-brutalism', 'neo-brutalism'],
  ['y2k', 'cyberpunk'],
  ['risograph', 'screen-print'],
  ['punk-zine', 'grunge'],
  ['contemporary-minimalism', 'editorial-luxury'],
  ['memphis', 'psychedelic'],
  ['constructivism', 'de-stijl'],
  ['japanese-modernist', 'contemporary-swiss'],
];

/** One design composed in a style, refined as the app refines it, measured. */
function made(style, opts = {}) {
  const brief = briefFor(opts.extra ?? {});
  const dir = AP.styledDirection(BASE, { primary: style.id, strength: 0, seedKey: 'bench' });
  const t0 = performance.now();
  const c = C.composeGraphic(brief, dir, { seed: 7, assets: opts.assets ?? [] });
  const doc = V.gfxCheck.refineDoc(c.doc).doc;
  const ms = performance.now() - t0;
  const plan = c.plans[0];
  const sig = EV.signatureOf(doc, plan.archetype);
  const fid = EV.evaluateStyle(doc, { words: [CONTENT.headline, CONTENT.subhead, ...CONTENT.meta] });
  const texts = nodesOf(doc).filter((n) => n.type === 'text');
  const head = texts.find((t) => t.role === 'headline');
  const shapes = nodesOf(doc).filter((n) => n.type === 'shape');
  const rounded = shapes.filter((n) => (n.shape === 'rect' && (n.radius ?? 0) > 8) || (n.shape === 'prim' && ['rounded-rect', 'capsule', 'superellipse'].includes(n.prim?.kind))).length;
  const findings = CK.checkDoc(doc);
  return {
    id: style.id,
    name: style.name,
    category: style.category,
    construction: plan.archetype,
    variant: plan.style?.variant ?? '',
    sig,
    display: head?.font ?? '',
    body: texts.find((t) => t.role === 'subhead')?.font ?? '',
    headCase: head?.case ?? 'none',
    headTreat:
      [
        head?.warp?.kind,
        head?.path?.kind,
        head?.repeat ? 'echo' : null,
        head?.runs?.length ? 'mixed' : null,
        head?.vertical ? 'vertical' : null,
        head?.rotation ? 'turned' : null,
        head?.fill ? 'gradient' : null,
        ...(head?.effects ?? []).map((e) => e.kind),
      ]
        .filter(Boolean)
        .join('+') || 'plain',
    fidelity: fid ? { overall: fid.overall, ...Object.fromEntries(Object.entries(fid.dims).map(([k, v]) => [k, v.score])) } : null,
    high: findings.filter((f) => f.severity === 'high').length,
    medium: findings.filter((f) => f.severity === 'medium').length,
    wordsExact: [CONTENT.headline, CONTENT.subhead, ...CONTENT.meta].every((w) => texts.some((t) => t.text === w || t.text.includes(w))),
    nodes: nodesOf(doc).length,
    saasLike: ['Inter', 'Manrope', 'Public Sans', 'Instrument Sans', 'DM Sans', 'Work Sans', 'Hanken Grotesk', 'Schibsted Grotesk'].includes(head?.font ?? '') && sig.gradient && rounded > 0,
    ms: Math.round(ms * 10) / 10,
    doc,
  };
}

console.log('=== SocriaUX Style Intelligence benchmark: one brief, 75 styles ===');
const rows = STYLES.map((s) => made(s));
const rep = EV.repetition(rows.map((r) => r.sig));
const by = (k) => rows.reduce((m, r) => ((m[r[k]] = (m[r[k]] ?? 0) + 1), m), {});
const constructions = by('construction');
const largestShare = Math.max(...Object.values(constructions));
const pairsSim = [];
for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) pairsSim.push(EV.layoutSimilarity(rows[i].sig, rows[j].sig));
const sharedLayoutShare = pairsSim.filter((x) => x >= 0.82).length / pairsSim.length;
const displayFaces = new Set(rows.map((r) => r.display));
const geometryLow = rows.filter((r) => (r.fidelity?.geometry ?? 0) < 45);
const textureLow = rows.filter((r) => (r.fidelity?.texture ?? 0) < 50);
const saas = rows.filter((r) => r.saasLike);
const failures = {
  'most outputs share a layout': {
    measured: `${Math.round(sharedLayoutShare * 1000) / 10}% of the ${pairsSim.length} pairs have near-identical layouts (≥ 0.82 of their occupancy maps agree); the most common construction is used by ${largestShare} of 75`,
    failed: sharedLayoutShare > 0.1 || largestShare > 8,
  },
  'differences are mostly colour': { measured: `${rep.colourOnly.length} pairs differ only in colour (the same layout, faces and shapes)`, failed: rep.colourOnly.length > 0 },
  'typography is near-identical': { measured: `${displayFaces.size} different headline faces across 75 designs; ${new Set(rows.map((r) => r.headTreat)).size} different headline treatments`, failed: displayFaces.size < 40 },
  'geometry does not reflect the style': {
    measured: `${geometryLow.length} designs whose shapes are mostly not their style’s own motifs (geometry fidelity under 45)`,
    failed: geometryLow.length > 10,
    which: geometryLow.map((r) => `${r.id} ${r.fidelity?.geometry}`),
  },
  'effects are merely decorative': {
    measured: `${textureLow.length} designs whose surface effects do not match their style’s texture (texture fidelity under 50)`,
    failed: textureLow.length > 10,
    which: textureLow.map((r) => `${r.id} ${r.fidelity?.texture}`),
  },
  'everything looks like SaaS': { measured: `${saas.length} designs with the SaaS signature (a neutral grotesk headline, a gradient and rounded rectangles together)`, failed: saas.length > 5, which: saas.map((r) => r.id) },
};
const pairRows = PAIRS.map(([a, b]) => {
  const A = rows.find((r) => r.id === a);
  const B = rows.find((r) => r.id === b);
  const sim = EV.layoutSimilarity(A.sig, B.sig);
  const shareShapes = A.sig.shapes.filter((s) => B.sig.shapes.includes(s)).length / Math.max(1, new Set([...A.sig.shapes, ...B.sig.shapes]).size);
  return {
    pair: `${A.name} vs ${B.name}`,
    constructions: `${A.construction} / ${B.construction}`,
    layoutSimilarity: Math.round(sim * 100) / 100,
    faces: `${A.display} / ${B.display}`,
    shapeOverlap: Math.round(shareShapes * 100) / 100,
    structurallyDifferent: A.construction !== B.construction && sim < 0.75 && A.display !== B.display,
  };
});

// ── a few in other formats and with a picture: the constructions hold beyond one poster ──
const landscape = ['bauhaus', 'art-deco', 'risograph', 'japanese-modernist', 'pop-art', 'cyberpunk', 'letterpress', 'memphis'].map((id) => made(REG.styleById(id), { extra: { formats: ['landscape'] } }));
const photo = pic('window.jpg', 800, 600);
const withPicture = ['swiss-international', 'art-nouveau', 'editorial-luxury', 'risograph', 'analog-film-editorial', 'glitch', 'polish-poster-school', 'japanese-woodblock'].map((id) => {
  const r = made(REG.styleById(id), { assets: [photo], extra: { images: [photo.id] } });
  return { ...r, pictureKept: nodesOf(r.doc).some((n) => n.type === 'image' || (n.type === 'group' && n.children.some((c) => c.type === 'image'))) };
});

// ── drawn in Chromium with the real faces ──
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1520, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const facesOf = (list) => [...new Set(list.flatMap((r) => nodesOf(r.doc).flatMap((n) => (n.type === 'text' ? [n.font, ...(n.runs ?? []).map((x) => x.font).filter(Boolean)] : []))))];
const cell = (r, w = 340, caption = '') => {
  const ab = r.doc.artboards[0];
  const k = w / ab.width;
  const svg = R.renderArtboard(r.doc, ab, { idPrefix: `${r.id}-${w}-${Math.random().toString(36).slice(2, 6)}-`, href: (id, src) => (id === photo.id ? photo.src : src) }).replace(
    /width="[^"]+" height="[^"]+"/,
    `width="${Math.round(ab.width * k)}" height="${Math.round(ab.height * k)}"`,
  );
  return `<figure style="display:inline-block;width:${w}px;margin:6px;vertical-align:top;font:11px system-ui">${svg}<figcaption><b>${r.name}</b> — ${r.construction}${r.variant ? ` / ${r.variant}` : ''} · ${r.display}${r.fidelity ? ` · fidelity ${r.fidelity.overall}` : ''}${r.high ? ` · <span style="color:#c00">${r.high} high</span>` : ''}${caption}</figcaption></figure>`;
};
const sheet = async (file, list, w = 340, title = '', caption = () => '') => {
  const css = V.graphicFontStylesheet(facesOf(list));
  await page.setContent(
    `<html><head>${css ? `<link rel="stylesheet" href="${css}">` : ''}</head><body style="margin:8px;background:#d9d6cf">${title ? `<h2 style="font:600 16px system-ui;margin:4px 6px 8px">${title}</h2>` : ''}${list.map((r) => cell(r, w, caption(r))).join('')}</body></html>`,
    { waitUntil: 'load' },
  );
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  const loaded = await page.evaluate(() => {
    const got = new Set();
    document.fonts.forEach((f) => f.status === 'loaded' && got.add(f.family.replace(/["']/g, '')));
    return [...got];
  });
  await page.screenshot({ path: `${OUT}${file}`, fullPage: true });
  return loaded;
};
const loadedAll = new Set();
for (const cat of ['historical', 'contemporary', 'digital', 'print', 'cultural']) {
  const list = rows.filter((r) => r.category === cat);
  for (const f of await sheet(`sheet-${cat}.png`, list, 340, `${cat[0].toUpperCase()}${cat.slice(1)} (${list.length})`)) loadedAll.add(f);
}
await page.setViewportSize({ width: 1560, height: 900 });
const pairCells = PAIRS.map(([a, b]) => [rows.find((r) => r.id === a), rows.find((r) => r.id === b)]);
{
  const css = V.graphicFontStylesheet(facesOf(pairCells.flat()));
  const html = pairCells
    .map(
      ([A, B], i) =>
        `<div style="display:inline-block;margin:6px;padding:8px;background:#fff;vertical-align:top"><div style="font:600 12px system-ui;margin-bottom:4px">${pairRows[i].pair} · layout similarity ${pairRows[i].layoutSimilarity}</div>${cell(A, 240)}${cell(B, 240)}</div>`,
    )
    .join('');
  await page.setContent(`<html><head>${css ? `<link rel="stylesheet" href="${css}">` : ''}</head><body style="margin:8px;background:#d9d6cf">${html}</body></html>`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}pairs.png`, fullPage: true });
}
await sheet('landscape.png', landscape, 460, 'The same brief, landscape (1200 × 630)');
await sheet('with-picture.png', withPicture, 300, 'The same brief with a photograph: placed and cut as each style places pictures', (r) => (r.pictureKept ? ' · picture placed' : ' · <span style="color:#c00">picture dropped</span>'));
await browser.close();

const requested = facesOf(rows);
const notLoaded = requested.filter((f) => !loadedAll.has(f));
const summary = {
  styles: rows.length,
  constructions: Object.keys(constructions).length,
  mostCommonConstruction: Object.entries(constructions).sort((a, b) => b[1] - a[1])[0],
  headlineFaces: displayFaces.size,
  headlineTreatments: new Set(rows.map((r) => r.headTreat)).size,
  meanLayoutSimilarity: rep.meanSimilarity,
  nearIdenticalLayoutPairs: rep.sameLayout.length,
  colourOnlyPairs: rep.colourOnly.length,
  grounds: rep.distinct.grounds,
  shapeSets: rep.distinct.shapes,
  wordsExact: rows.filter((r) => r.wordsExact).length,
  highFindings: rows.reduce((a, r) => a + r.high, 0),
  mediumFindings: rows.reduce((a, r) => a + r.medium, 0),
  fidelityMedian: rows.map((r) => r.fidelity?.overall ?? 0).sort((a, b) => a - b)[37],
  fidelityLowest: rows
    .slice()
    .sort((a, b) => (a.fidelity?.overall ?? 0) - (b.fidelity?.overall ?? 0))
    .slice(0, 5)
    .map((r) => `${r.id} ${r.fidelity?.overall}`),
  composeMsMedian: rows.map((r) => r.ms).sort((a, b) => a - b)[37],
  composeMsMax: Math.max(...rows.map((r) => r.ms)),
  facesRequested: requested.length,
  facesNotLoaded: notLoaded,
  landscapeHigh: landscape.reduce((a, r) => a + r.high, 0),
  withPictureKept: withPicture.filter((r) => r.pictureKept).length,
  withPictureHigh: withPicture.reduce((a, r) => a + r.high, 0),
  pageErrors: errors.length,
};
writeFileSync(
  `${OUT}report.json`,
  J(
    {
      summary,
      failures,
      pairs: pairRows,
      designs: rows.map(({ doc, sig, ...r }) => ({ ...r, map: sig.map, shapes: sig.shapes, faces: sig.faces })),
      landscape: landscape.map(({ doc, sig, ...r }) => r),
      withPicture: withPicture.map(({ doc, sig, ...r }) => r),
    },
    null,
    2,
  ),
);
console.log(J(summary, null, 2));
console.log('\nFailure conditions (the mandate’s section 16):');
for (const [k, v] of Object.entries(failures)) console.log(`  ${v.failed ? 'FAILED' : 'passed'}  ${k}: ${v.measured}${v.failed && v.which ? ` [${v.which.slice(0, 8).join(', ')}]` : ''}`);
console.log('\nRequired pairs:');
for (const p of pairRows) console.log(`  ${p.structurallyDifferent ? 'different' : 'TOO CLOSE'}  ${p.pair}: ${p.constructions}, layout similarity ${p.layoutSimilarity}, faces ${p.faces}, shape overlap ${p.shapeOverlap}`);
console.log(`\nfiles in ${OUT}`);
