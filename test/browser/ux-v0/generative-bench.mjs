// test/browser/ux-v0/generative-bench.mjs — the Generative Creative Engine benchmark. One brief, "a promotional poster
// for a creative technology exhibition, with the title, date, location and tagline", generated again and again in ten
// conditions (nine styles and no style at all). Between generations nothing is supplied but a new seed: no template,
// no layout, no composition family, no emphasis; the engine remembers what it made and conceives each design itself.
// Measured from the documents: structural similarity within each style (the signature of where the words sit and how
// large, where the figures weigh, how much is empty, how symmetric), the spatial principles, type strategies and motifs
// the engine chose, where the headline landed, the quality checks (brief, content, coherence, style, readability,
// hierarchy, diversity, technical, editability, export). Compared with the template pipeline it replaces (the same
// seeds through `engine: 'templates'`). Every design drawn in Chromium with its real faces on contact sheets. Nothing
// is scored by eye; what needs an eye is left to the sheets. No model is called.
//
//   UXV0_OUT=/somewhere node test/browser/ux-v0/generative-bench.mjs [designs per condition, default 8]
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium, S, underTest } from './env.mjs';
import { pic } from './gfx-ceiling-briefs.mjs';

const V = await underTest();
const OUT = `${S}generative-bench/`;
mkdirSync(OUT, { recursive: true });
const N = Math.max(2, Number(process.argv[2] || 8));
const { gfxCompose: C, gfxDoc: D, gfxRender: R, gfxCheck: CK, gfxStyleApply: AP, genEvaluate: EV } = V;
const VAL = V.genValidate;

const WORDS = 'Create a promotional poster for a creative technology exhibition. Include the title, date, location, and tagline.';
const CONTENT = { headline: 'Signal & Form', subhead: 'Where code becomes craft', meta: ['12–28 March 2027', 'Lisbon Design Centre'] };
const CONDITIONS = [
  ['contemporary-minimalism', 'Minimalist editorial'],
  ['bauhaus', 'Bauhaus'],
  ['neo-brutalism', 'Brutalist'],
  ['art-nouveau', 'Art Nouveau'],
  ['y2k', 'Y2K'],
  ['psychedelic', 'Psychedelic'],
  ['swiss-international', 'Swiss'],
  ['risograph', 'Risograph'],
  ['editorial-luxury', 'Luxury editorial'],
  [null, 'No specified style'],
];
const wbrief = V.normalizeBrief({
  pageType: 'website',
  objective: 'A creative technology exhibition',
  personality: ['curious'],
  visualDirection: 'neutral',
  palette: [],
  typography: { display: '', body: '' },
  decisions: { colour: 'delegated', typography: 'delegated' },
});
const BASE = C.graphicDirectionOf(V.proposeDirections({ brief: wbrief, salt: 'generative-bench', count: 3 })[0]);
const briefFor = (extra = {}) => {
  const b = C.readGraphicBrief(WORDS, extra);
  b.content = { ...b.content, ...CONTENT };
  delete b.content.brand;
  delete b.content.cta;
  return b;
};
const cell = (sig) => `${Math.min(2, Math.floor(sig.head[0] * 3))},${Math.min(2, Math.floor(sig.head[1] * 3))}`;
const pairwise = (sigs) => {
  const out = [];
  for (let a = 0; a < sigs.length; a++) for (let b = a + 1; b < sigs.length; b++) out.push(EV.similarity(sigs[a], sigs[b]));
  return { mean: out.length ? out.reduce((s, v) => s + v, 0) / out.length : 0, max: out.length ? Math.max(...out) : 0, min: out.length ? Math.min(...out) : 0, tooSimilar: out.filter((v) => v >= EV.TOO_SIMILAR).length, pairs: out.length };
};
const r3 = (v) => Math.round(v * 1000) / 1000;

const conditions = [];
const designs = [];
const faces = new Set();
const t0 = Date.now();
for (const [style, label] of CONDITIONS) {
  const dir0 = style ? AP.styledDirection(BASE, { primary: style, strength: 0, seedKey: 'generative-bench' }) : BASE;
  const memory = [];
  const sigs = [];
  const templ = [];
  for (let i = 0; i < N; i++) {
    const b = briefFor({ formats: ['a4'] });
    // the only thing that changes between generations: a seed (and what the engine remembers having made)
    const made = C.composeGraphic(b, { ...dir0, generative: { seed: `generation-${i}`, avoidSignatures: memory.slice(-6) } }, { seed: 7 });
    const ref = CK.refineDoc(made.doc);
    const ab = ref.doc.artboards[0];
    const sig = EV.signatureOfBoard(ab);
    const q = VAL.validateDesign(ref.doc, ab.id, b, { siblings: sigs.slice() });
    memory.push(ab.concept?.signature ?? '');
    sigs.push(sig);
    for (const l of D.walk(ab)) if (l.node.type === 'text') faces.add(l.node.font);
    const shapes = [
      ...new Set(
        D.walk(ab)
          .filter((l) => l.node.type === 'shape')
          .map((l) => (l.node.shape === 'prim' ? l.node.prim.kind : l.node.shape)),
      ),
    ];
    const head = D.walk(ab).find((l) => l.node.role === 'headline')?.node;
    designs.push({
      condition: label,
      style,
      i,
      doc: ref.doc,
      concept: ab.concept,
      sig,
      quality: q,
      shapes,
      head: head ? { size: r3(head.size / Math.min(ab.width, ab.height)), rotation: head.rotation || 0, path: !!head.path } : null,
      high: ref.remaining.filter((f) => f.severity === 'high').length,
    });
    // the same seed through the template pipeline it replaces
    const tm = C.composeGraphic(b, { ...dir0, engine: 'templates' }, { seed: 7 + i * 13 });
    templ.push({ sig: EV.signatureOfBoard(tm.doc.artboards[0]), arch: tm.plans[0].archetype });
  }
  const mine = designs.filter((d) => d.condition === label);
  const pw = pairwise(sigs);
  const tp = pairwise(templ.map((t) => t.sig));
  conditions.push({
    label,
    style,
    designs: mine.length,
    similarity: { mean: r3(pw.mean), max: r3(pw.max), min: r3(pw.min), pairsTooSimilar: pw.tooSimilar, pairs: pw.pairs },
    templatesSimilarity: { mean: r3(tp.mean), max: r3(tp.max), constructions: [...new Set(templ.map((t) => t.arch))] },
    principles: [...new Set(mine.map((d) => d.concept?.org))],
    secondPrinciples: [...new Set(mine.map((d) => d.concept?.org2).filter(Boolean))],
    typeStrategies: [...new Set(mine.map((d) => d.concept?.type))],
    motifs: [...new Set(mine.map((d) => d.concept?.motif).filter(Boolean))],
    leads: [...new Set(mine.map((d) => d.concept?.emphasis))],
    colourings: [...new Set(mine.map((d) => d.concept?.colouring))],
    headlineCells: [...new Set(mine.map((d) => cell(d.sig)))].length,
    headlineTurnedOrOnPath: mine.filter((d) => d.head && (d.head.rotation || d.head.path)).length,
    headlineSizeRange: [r3(Math.min(...mine.map((d) => d.head?.size ?? 0))), r3(Math.max(...mine.map((d) => d.head?.size ?? 0)))],
    shapeKinds: [...new Set(mine.flatMap((d) => d.shapes))].length,
    quality: Object.fromEntries(VAL.QUALITY_CHECKS.map((k) => [k, r3(mine.reduce((s, d) => s + d.quality.checks.find((c) => c.key === k).score, 0) / mine.length)])),
    allChecksPass: mine.filter((d) => d.quality.pass).length,
    highFindings: mine.reduce((s, d) => s + d.high, 0),
  });
}

// with a photograph: the same brief and a picture, no style, the engine free to lead with it or not
const photos = ['window.jpg', 'ceramic.jpg', 'dusk.jpg'].map((f) => pic(f, 800, 600));
const withPhoto = [];
{
  const memory = [];
  for (let i = 0; i < Math.min(N, 6); i++) {
    const b = briefFor({ formats: ['a4'], images: [photos[i % 3].id] });
    const made = C.composeGraphic(b, { ...BASE, generative: { seed: `photo-${i}`, avoidSignatures: memory.slice(-6) } }, { seed: 7, assets: photos });
    const ref = CK.refineDoc(made.doc);
    const ab = ref.doc.artboards[0];
    memory.push(ab.concept?.signature ?? '');
    const q = VAL.validateDesign(ref.doc, ab.id, b, {});
    withPhoto.push({ condition: 'No style, with a photograph', i, doc: ref.doc, concept: ab.concept, quality: q, high: ref.remaining.filter((f) => f.severity === 'high').length, picture: D.walk(ab).some((l) => l.node.type === 'image') });
  }
}

const ms = Date.now() - t0;
const all = pairwise(designs.map((d) => d.sig));
const report = {
  brief: WORDS,
  content: CONTENT,
  perCondition: N,
  designs: designs.length,
  generatedInMs: ms,
  msPerDesign: Math.round(ms / (designs.length * 2 + withPhoto.length)),
  threshold: EV.TOO_SIMILAR,
  overall: {
    similarityMean: r3(all.mean),
    similarityMax: r3(all.max),
    pairsTooSimilar: all.tooSimilar,
    pairs: all.pairs,
    allChecksPass: designs.filter((d) => d.quality.pass).length,
    highFindings: designs.reduce((s, d) => s + d.high, 0),
    principles: [...new Set(designs.map((d) => d.concept?.org))].length,
    typeStrategies: [...new Set(designs.map((d) => d.concept?.type))].length,
    motifs: [...new Set(designs.map((d) => d.concept?.motif).filter(Boolean))].length,
  },
  conditions,
  withPhoto: withPhoto.map((d) => ({ i: d.i, lead: d.concept?.emphasis, principle: d.concept?.org, type: d.concept?.type, pictureUsed: d.picture, checksPass: d.quality.pass, high: d.high })),
  ideas: designs.map((d) => ({ condition: d.condition, i: d.i, idea: d.concept?.idea, structure: `${d.concept?.org}${d.concept?.org2 ? '+' + d.concept.org2 : ''} / ${d.concept?.type} / ${d.concept?.motif ?? '-'} / ${d.concept?.emphasis}` })),
  failures: designs.filter((d) => !d.quality.pass).map((d) => ({ condition: d.condition, i: d.i, failed: d.quality.checks.filter((c) => !c.pass).map((c) => `${c.key}: ${c.notes[0]}`) })),
};
writeFileSync(`${OUT}report.json`, JSON.stringify(report, null, 2));

// contact sheets: one per condition, and one of every design together
const css = V.graphicFontStylesheet([...faces, 'Inter']);
const browser = await chromium.launch();
const sheet = async (list, file, w, title, cols = 8) => {
  const items = list.map((d) => {
    const ab = d.doc.artboards[0];
    const k = w / ab.width;
    const svg = R.renderArtboard(d.doc, ab, { idPrefix: `${(d.style ?? 'x').replace(/\W/g, '')}${d.i}${Math.random().toString(36).slice(2, 6)}-`, href: (id, src) => photos.find((p) => p.id === id)?.src ?? src }).replace(
      /width="[^"]+" height="[^"]+"/,
      `width="${Math.round(ab.width * k)}" height="${Math.round(ab.height * k)}"`,
    );
    const c = d.concept;
    return `<figure><div class="art">${svg}</div><figcaption><b>${d.condition} · ${d.i + 1}</b><br>${c ? `${c.org}${c.org2 ? ' + ' + c.org2 : ''} · ${c.type} · ${c.motif ?? '—'} · ${c.emphasis}` : 'template'}${d.quality && !d.quality.pass ? ' <i>(a check failed)</i>' : ''}</figcaption></figure>`;
  });
  const page = await browser.newPage({ viewport: { width: cols * (w + 16) + 24, height: 900 }, deviceScaleFactor: 2 });
  await page.setContent(
    `<html><head>${css ? `<link rel="stylesheet" href="${css}">` : ''}<style>body{margin:12px;background:#e8e5de;font:10px Inter,system-ui;color:#222}h1{font:600 15px Inter,system-ui;margin:2px 4px 10px}figure{display:inline-block;vertical-align:top;margin:4px;width:${w}px}figcaption{margin-top:4px;line-height:1.35}.art svg{display:block;box-shadow:0 1px 3px rgba(0,0,0,.18)}</style></head><body><h1>${title}</h1>${items.join('')}</body></html>`,
    { waitUntil: 'load' },
  );
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}${file}`, fullPage: true });
  await page.close();
};
for (const [style, label] of CONDITIONS)
  await sheet(
    designs.filter((d) => d.condition === label),
    `sheet-${(style ?? 'no-style').replace(/[^a-z0-9-]/g, '')}.png`,
    200,
    `${label} — the same brief, ${N} generations, only the seed changed`,
    Math.min(N, 8),
  );
await sheet(withPhoto, 'sheet-with-photo.png', 200, 'No style, with a photograph — the same brief, only the seed changed', 6);
await sheet(designs, 'sheet-all.png', 120, `All ${designs.length} designs — one brief, ten conditions`, 16);
// the template pipeline it replaces, for comparison (the same brief and seeds, two conditions)
const old = [];
for (const [style, label] of CONDITIONS.slice(1, 3)) {
  const dir0 = AP.styledDirection(BASE, { primary: style, strength: 0, seedKey: 'generative-bench' });
  for (let i = 0; i < Math.min(N, 6); i++)
    old.push({ condition: `${label} (templates)`, style, i, doc: CK.refineDoc(C.composeGraphic(briefFor({ formats: ['a4'] }), { ...dir0, engine: 'templates' }, { seed: 7 + i * 13 }).doc).doc, concept: null, quality: null });
}
await sheet(old, 'sheet-templates-before.png', 160, 'Before: the template pipeline, the same brief and seeds', 6);
await browser.close();

console.log(`generative benchmark: ${designs.length} designs in ${CONDITIONS.length} conditions (+${withPhoto.length} with a photograph), ${ms} ms`);
console.log(
  `overall: mean similarity ${report.overall.similarityMean}, max ${report.overall.similarityMax}, ${report.overall.pairsTooSimilar}/${report.overall.pairs} pairs over ${EV.TOO_SIMILAR}; all checks pass ${report.overall.allChecksPass}/${designs.length}; high findings ${report.overall.highFindings}`,
);
for (const c of conditions)
  console.log(
    `  ${c.label.padEnd(22)} sim ${c.similarity.mean.toFixed(2)} (max ${c.similarity.max.toFixed(2)}, ${c.similarity.pairsTooSimilar} too similar) vs templates ${c.templatesSimilarity.mean.toFixed(2)} [${c.templatesSimilarity.constructions.join(',')}] · principles ${c.principles.length} · type ${c.typeStrategies.length} · motifs ${c.motifs.length} · headline cells ${c.headlineCells} · pass ${c.allChecksPass}/${c.designs} · high ${c.highFindings}`,
  );
console.log(`with a photograph: picture used ${withPhoto.filter((d) => d.picture).length}/${withPhoto.length}; leads ${[...new Set(withPhoto.map((d) => d.concept?.emphasis))].join(', ')}`);
console.log(`written to ${OUT}`);
