// test/browser/ux-v0/engine2-bench.mjs — the Generative Design Engine 2.0 benchmarks, measured from the documents and
// drawn in Chromium with their real faces. Nothing is scored by eye; what needs an eye is left to the contact sheets.
//
//   A  one poster brief generated twenty times (only the seed changes): structural similarity, principles, checks
//   B  ten designs each in Bauhaus, Swiss, Brutalism, Art Nouveau and Y2K: within-style similarity, checks
//   C  logo concepts for one fictional brand: categories, methods, geometry, lettering, structural likeness, quality
//   D  logo technical checks: SVG, PNG at 16–512 px, transparency, one-colour, spelling, editable paths, reopening
//   E  a brand identity from the approved logo: marks, palette, type, social, poster, website hero, product mockup
//
//   UXV0_OUT=/somewhere node test/browser/ux-v0/engine2-bench.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium, S, underTest } from './env.mjs';

const V = await underTest();
const OUT = `${S}engine2-bench/`;
mkdirSync(OUT, { recursive: true });
const {
  gfxCompose: C,
  gfxDoc: D,
  gfxRender: R,
  gfxCheck: CK,
  gfxStyleApply: AP,
  genEvaluate: EV,
  genValidate: VAL,
  logoBrief: LB,
  logoCompose: LC,
  logoEvaluate: LE,
  logoBuild: BD,
  logoSession: SS,
  logoRebuild: RB,
  logoIdentity: ID,
  logoContexts: CX,
  logoRecord: RC,
  logoGlyphs: G,
  logoRaster: RA,
  boardPipeline: BP,
  boardPlan: BPL,
  boardSystem: BS,
  boardMockup: BM,
  gfxExport: EX,
} = V;
const report = {};
const t0 = Date.now();

const wbrief = V.normalizeBrief({
  pageType: 'website',
  objective: 'A creative technology exhibition',
  personality: ['curious'],
  visualDirection: 'neutral',
  palette: [],
  typography: { display: '', body: '' },
  decisions: { colour: 'delegated', typography: 'delegated' },
});
const BASE = C.graphicDirectionOf(V.proposeDirections({ brief: wbrief, salt: 'engine2-bench', count: 3 })[0]);
const POSTER = 'Create a promotional poster for a creative technology exhibition. Include the title, date, location, and tagline.';
const CONTENT = { headline: 'Signal & Form', subhead: 'Where code becomes craft', meta: ['12–28 March 2027', 'Lisbon Design Centre'] };
const posterBrief = () => {
  const b = C.readGraphicBrief(POSTER, { formats: ['a4'] });
  b.content = { ...CONTENT };
  return b;
};
const pairwise = (sigs) => {
  const out = [];
  for (let a = 0; a < sigs.length; a++) for (let b = a + 1; b < sigs.length; b++) out.push(EV.similarity(sigs[a], sigs[b]));
  return { mean: +(out.reduce((s, v) => s + v, 0) / Math.max(1, out.length)).toFixed(3), max: +Math.max(0, ...out).toFixed(3), tooSimilar: out.filter((v) => v >= EV.TOO_SIMILAR).length, pairs: out.length };
};
const generateOne = (dir, seed) => {
  const made = C.composeGraphic(posterBrief(), { ...dir, generative: { seed } }, { seed: 7 });
  const r = CK.refineDoc(made.doc);
  const b = r.doc.artboards[0];
  return {
    doc: r.doc,
    concept: made.plans[0].generative?.concept ?? null,
    plan: made.plans[0],
    sig: EV.signatureOfBoard(b),
    high: r.remaining.filter((f) => f.severity === 'high').length,
    medium: r.remaining.filter((f) => f.severity === 'medium').length,
    quality: VAL.validateDesign(r.doc, b.id, { content: CONTENT, images: [] }),
  };
};
const summarise = (list) => ({
  designs: list.length,
  similarity: pairwise(list.map((d) => d.sig)),
  principles: [...new Set(list.map((d) => d.concept?.org))],
  typeStrategies: [...new Set(list.map((d) => d.concept?.type))],
  motifs: [...new Set(list.map((d) => d.concept?.motif ?? '—'))],
  allChecksPass: list.filter((d) => d.quality.pass).length,
  highFindings: list.reduce((s, d) => s + d.high, 0),
  mediumFindings: list.reduce((s, d) => s + d.medium, 0),
  fallbacks: list.filter((d) => d.plan.fallback).length,
  failedChecks: list.flatMap((d, i) => d.quality.checks.filter((c) => !c.pass).map((c) => `#${i + 1} ${c.key}: ${c.notes[0]}`)),
});

// ── A: one brief, twenty generations ──
const A = [];
for (let i = 0; i < 20; i++) A.push(generateOne(BASE, `A${i}`));
report.A = summarise(A);

// ── B: ten designs in each of five styles ──
const STYLES = [
  ['bauhaus', 'Bauhaus'],
  ['swiss-international', 'Swiss'],
  ['neo-brutalism', 'Brutalism'],
  ['art-nouveau', 'Art Nouveau'],
  ['y2k', 'Y2K'],
];
const B = {};
report.B = {};
for (const [id, label] of STYLES) {
  const dir = AP.styledDirection(BASE, { primary: id, strength: 0, seedKey: 'engine2-bench' });
  B[label] = [];
  for (let i = 0; i < 10; i++) B[label].push(generateOne(dir, `B${id}${i}`));
  report.B[label] = summarise(B[label]);
}
const across = Object.values(B).flatMap((l) => l.map((d) => d.sig));
report.B.acrossStyles = pairwise(across);

// ── C: logo concepts for one fictional brand ──
const BRAND = 'Design a logo for “Tidewell”, a water-quality monitoring service for coastal towns. Calm, trustworthy, precise. Values: clarity, care, community. Used on an app icon, signage and vans.';
const lb = LB.readLogoBrief(BRAND);
const tc = Date.now();
const concepts = LC.explore(lb, { count: 12, seed: 1 });
const exploreMs = Date.now() - tc;
const evals = concepts.map((c) => LE.evaluateLogo(c, lb, concepts));
const likes = [];
for (let a = 0; a < concepts.length; a++) for (let b = a + 1; b < concepts.length; b++) if (concepts[a].sig?.length && concepts[b].sig?.length) likes.push(RA.likeness(concepts[a].sig, concepts[b].sig));
report.C = {
  brand: lb.name,
  read: { personality: lb.personality, values: lb.values, associations: lb.associations, uses: lb.uses },
  concepts: concepts.length,
  exploreMs,
  categories: [...new Set(concepts.map((c) => c.category))],
  methods: [...new Set(concepts.map((c) => c.method ?? 'wordmark only'))],
  geometry: [...new Set(concepts.map((c) => (c.method ? V.logoSymbols.METHODS[c.method].geometry : 'lettering')))],
  lettering: {
    constructed: concepts.filter((c) => c.wordmark.kind === 'constructed').length,
    typeset: concepts.filter((c) => c.wordmark.kind === 'typeset').length,
    faces: [...new Set(concepts.map((c) => c.wordmark.font).filter(Boolean))],
    modifications: [...new Set(concepts.map((c) => c.wordmark.modification?.kind).filter(Boolean))],
  },
  lockups: [...new Set(concepts.map((c) => c.lockup))],
  negativeSpace: concepts.filter((c) => c.mark?.parts.some((p) => p.cuts?.length)).length,
  structuralLikeness: { mean: +(likes.reduce((s, v) => s + v, 0) / Math.max(1, likes.length)).toFixed(3), max: +Math.max(0, ...likes).toFixed(3), sameStructure: likes.filter((v) => v >= V.logoConcepts.SAME_MARK).length, pairs: likes.length },
  recolourCountsAsNew: false,
  quality: evals.map((e, i) => ({ concept: concepts[i].title, category: concepts[i].category, score: e.score, met: e.criteria.filter((x) => x.pass).length, weak: e.criteria.filter((x) => !x.pass).map((x) => x.key) })),
  disclaimer: evals[0].disclaimer,
};

// ── D: technical checks on one concept, made the logo of a document ──
const gb = C.readGraphicBrief(BRAND);
let doc = C.composeGraphic(gb, BASE, { seed: 3 }).doc;
const lbId = doc.artboards.find((b) => b.logo).id;
const pick = doc.artboards[0].logo.concepts.find((c) => c.method && c.wordmark.kind === 'constructed') ?? doc.artboards[0].logo.concepts[0];
doc = SS.putConcept(doc, lbId, pick.id).doc;
doc = SS.approve(doc, lbId).doc;
const built = SS.buildIdentity(doc, lbId);
doc = built.doc;
const approved = RB.conceptFrom(
  doc.artboards.find((b) => b.id === lbId).logo.concepts.find((c) => c.status === 'approved'),
  lb,
);
const variants = doc.artboards.filter((b) => / — (Primary|Horizontal|Vertical|Symbol only|Wordmark only|Black|Reversed|Small, simplified|App icon|Favicon)/.test(b.name));
const svgs = Object.fromEntries(variants.map((b) => [b.name, EX.svgFile(doc, b)]));
const colours = (svg) => [...new Set([...svg.matchAll(/(?:fill|stroke)="(#[0-9a-fA-F]{6})"/g)].map((m) => m[1].toLowerCase()))];
const leaves = (n) => (n.type === 'group' ? n.children.flatMap(leaves) : [n]);
const logoBoard = doc.artboards.find((b) => b.id === lbId);
const native = EX.nativeFile(doc);
const reopened = EX.openNativeFile(native);
const reRec = reopened?.doc.artboards.find((b) => b.logo)?.logo;
const reConcept = reRec
  ? RB.conceptFrom(
      reRec.concepts.find((c) => c.status === 'approved'),
      reRec.brief,
    )
  : null;
const l = approved.wordmark.kind === 'constructed' ? G.letter(approved.wordmark.text, approved.wordmark.style, 100, approved.wordmark.modification) : null;
report.D = {
  concept: approved.title,
  variants: variants.map((b) => `${b.name.split(' — ')[1]} ${b.width}×${b.height}${b.background === null ? ' transparent' : ''}`),
  svgClean: Object.values(svgs).every((s) => /^(<\?xml[^>]*>\s*)?<svg/.test(s) && !/NaN|undefined|Infinity/.test(s)),
  oneColourVersion: colours(svgs[Object.keys(svgs).find((k) => k.includes('Black'))]),
  transparentVersions: variants.filter((b) => b.background === null).length,
  spelling: l ? { constructed: true, spelled: l.spelled, exact: G.spelledExactly(l) } : { constructed: false, text: approved.wordmark.text },
  editable: {
    bezierPaths: leaves(logoBoard.children[0]).filter((n) => n.type === 'shape' && n.shape === 'bezier').length,
    liveText: leaves(logoBoard.children[0]).filter((n) => n.type === 'text').length,
    pictures: leaves(logoBoard.children[0]).filter((n) => n.type === 'image').length,
    liveBooleans: JSON.stringify(logoBoard).split('"boolean":"subtract"').length - 1,
    masks: JSON.stringify(logoBoard).split('"maskInvert":true').length - 1,
  },
  reopened: {
    nativeRoundTrip: !!reopened,
    artboards: reopened?.doc.artboards.length,
    recordKept: !!reRec,
    conceptsKept: reRec?.concepts.length,
    sameMark: !!reConcept && JSON.stringify(reConcept.mark.parts.map((p) => p.path)) === JSON.stringify(approved.mark?.parts.map((p) => p.path)),
  },
  sizes: LE.evaluateLogo(approved, lb, concepts).sizes,
};

// ── E: the identity, and a board composed in it ──
const ident = ID.identityFor(approved, lb);
const sys = BS.normalizeSystem(JSON.parse(JSON.stringify(built.system)));
const bbrief = {
  purpose: 'The Tidewell identity in use',
  name: 'Tidewell',
  content: { headline: 'Clear water, every day', subhead: 'Water quality, measured where you swim', brand: 'Tidewell', cta: 'See today’s reading' },
  mood: lb.personality,
  materials: [
    { kind: 'social', count: 1 },
    { kind: 'poster', count: 1 },
    { kind: 'card', count: 1 },
    { kind: 'presentation', count: 1 },
    { kind: 'mockup', count: 1, template: 'box' },
  ],
  images: [],
  annotate: false,
};
const board = BP.startBoard(bbrief, sys, { request: bbrief.purpose });
const mats = board.materials.filter((m) => m.type === 'graphic').map((m, i) => ({ m, made: BPL.composeMaterial(m, sys, { sibling: i, order: i }) }));
const linkedIn = (d) =>
  d.artboards.flatMap((b) =>
    b.children.flatMap(function f(n) {
      return n.link ? [n] : n.type === 'group' ? n.children.flatMap(f) : [];
    }),
  );
report.E = {
  identity: {
    primary: ident.primary,
    secondary: ident.secondary,
    palette: ident.palette.map((p) => `${p.role} ${p.hex} ${p.contrast.toFixed(1)}:1`),
    type: ident.type,
    motif: ident.motif.name,
    pattern: ident.pattern.gen,
    icon: ident.icon,
    imagery: ident.imagery,
    guidelines: ident.guidelines,
  },
  sheetAndVariants: built.doc.artboards.length - 1,
  materials: mats.map(({ m, made }) => ({ name: m.name, kind: m.brief.kind, archetype: made.plan.archetype, linkedLogos: linkedIn(made.doc).length, high: made.left.length })),
  websitePreview: 'a presentation-format hero composed in the identity (a static preview; the live website concept is made by the Boards workspace in the browser)',
};

writeFileSync(`${OUT}report.json`, JSON.stringify({ ...report, ms: Date.now() - t0 }, null, 2));
console.log(
  JSON.stringify(
    {
      A: { sim: report.A.similarity, principles: report.A.principles.length, types: report.A.typeStrategies.length, pass: report.A.allChecksPass, high: report.A.highFindings },
      B: Object.fromEntries(STYLES.map(([, l]) => [l, { sim: report.B[l].similarity.mean, tooSimilar: report.B[l].similarity.tooSimilar, pass: report.B[l].allChecksPass, high: report.B[l].highFindings }])),
      C: { n: report.C.concepts, cats: report.C.categories.length, methods: report.C.methods.length, like: report.C.structuralLikeness, ms: report.C.exploreMs },
      D: { svg: report.D.svgClean, mono: report.D.oneColourVersion, reopened: report.D.reopened, spelling: report.D.spelling },
      E: report.E.materials,
    },
    null,
    1,
  ),
);

// ── contact sheets, drawn in Chromium ──
const faces = new Set(['Inter']);
const addFaces = (d) =>
  d.artboards.forEach((b) =>
    b.children.forEach(function f(n) {
      if (n.type === 'text') faces.add(n.font);
      if (n.type === 'group') n.children.forEach(f);
    }),
  );
[...A, ...Object.values(B).flat()].forEach((d) => addFaces(d.doc));
concepts.forEach((c) => addFaces(BD.logoDoc(c)));
addFaces(doc);
mats.forEach(({ made }) => addFaces(made.doc));
const css = V.graphicFontStylesheet([...faces]);
const browser = await chromium.launch();
const draw = (d, b, w, prefix) => {
  const k = w / b.width;
  return R.renderArtboard(d, b, { idPrefix: prefix }).replace(/width="[^"]+" height="[^"]+"/, `width="${Math.round(b.width * k)}" height="${Math.round(b.height * k)}"`);
};
let uid = 0;
const sheet = async (items, file, title, width = 1700) => {
  const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 2 });
  await page.setContent(
    `<html><head>${css ? `<link rel="stylesheet" href="${css}">` : ''}<style>body{margin:12px;background:#e8e5de;font:10px Inter,system-ui;color:#222}h1{font:600 15px Inter,system-ui;margin:2px 4px 10px}figure{display:inline-block;vertical-align:top;margin:5px}figcaption{margin-top:4px;line-height:1.35;max-width:320px}.art svg{display:block;box-shadow:0 1px 3px rgba(0,0,0,.18)}.chk{background-image:linear-gradient(45deg,#ccc 25%,transparent 25%),linear-gradient(-45deg,#ccc 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#ccc 75%),linear-gradient(-45deg,transparent 75%,#ccc 75%);background-size:12px 12px;background-position:0 0,0 6px,6px -6px,-6px 0}</style></head><body><h1>${title}</h1>${items.join('')}</body></html>`,
    { waitUntil: 'load' },
  );
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}${file}`, fullPage: true });
  await page.close();
};
const fig = (svg, cap, cls = '') => `<figure><div class="art ${cls}">${svg}</div><figcaption>${cap}</figcaption></figure>`;
await sheet(
  A.map((d, i) => fig(draw(d.doc, d.doc.artboards[0], 150, `a${i}-`), `#${i + 1} ${d.concept?.org}/${d.concept?.type}`)),
  'A-one-brief-20.png',
  `A — one poster brief, 20 generations (only the seed changes) · mean structural similarity ${report.A.similarity.mean}`,
);
for (const [, label] of STYLES)
  await sheet(
    B[label].map((d, i) => fig(draw(d.doc, d.doc.artboards[0], 150, `b${uid++}-`), `#${i + 1} ${d.concept?.org}/${d.concept?.type}`)),
    `B-${label.replace(/\W/g, '')}.png`,
    `B — ${label}, 10 designs · mean similarity ${report.B[label].similarity.mean}`,
  );
await sheet(
  concepts.map((c, i) => {
    const d = BD.logoDoc(c, { width: 640, height: 400 });
    return fig(draw(d, d.artboards[0], 320, `c${i}-`), `<b>${c.title}</b> · ${c.category} · ${evals[i].score}<br>${c.coreIdea}`);
  }),
  'C-logo-concepts.png',
  `C — ${concepts.length} logo concepts for “${lb.name}” · mean structural likeness ${report.C.structuralLikeness.mean}`,
);
const sizeItems = concepts.slice(0, 6).flatMap((c, j) =>
  [16, 24, 32, 64, 128]
    .map((px) => {
      const d = CX.sizeDoc(c, px);
      return fig(R.renderArtboard(d, d.artboards[0], { idPrefix: `s${j}${px}-` }), `${px}px`, 'chk');
    })
    .concat([`<br>`]),
);
await sheet(sizeItems, 'C-sizes.png', 'C — six concepts at 16, 24, 32, 64 and 128 px (the small version at 24 px and below), on a transparent checker', 1100);
const schemeItems = ['full', 'black', 'white', 'grayscale', 'single', 'reversed'].map((s) => {
  const d = CX.schemeDoc(approved, s);
  return fig(draw(d, d.artboards[0], 260, `sc${s}-`), s);
});
const ctxItems = CX.contextDocs(approved).map((x, i) => fig(draw(x.doc, x.doc.artboards[0], 300, `cx${i}-`), x.context));
await sheet([...schemeItems, '<br>', ...ctxItems], 'C-colour-and-contexts.png', `C — “${approved.title}”: colour tests and contexts`);
await sheet(
  variants.map((b, i) => fig(draw(doc, b, Math.min(320, b.width), `v${i}-`), `${b.name.split(' — ')[1]} · ${b.width}×${b.height}${b.background === null ? ' · transparent' : ''}`, b.background === null ? 'chk' : '')),
  'D-variants.png',
  'D — the responsive variants, each an exportable artboard (transparent ones on a checker)',
);
// PNG exports drawn in the browser at each size: transparency and ink measured from the pixels
const page = await browser.newPage();
const pngChecks = await page.evaluate(
  async ({ svg, sizes }) => {
    const out = [];
    for (const px of sizes) {
      const img = new Image();
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      img.src = url;
      await new Promise((ok, no) => ((img.onload = ok), (img.onerror = () => no(new Error('the SVG did not load as an image')))));
      const c = document.createElement('canvas');
      c.width = px;
      c.height = px;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0, px, px);
      const d = g.getImageData(0, 0, px, px).data;
      let ink = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 128) ink++;
      out.push({ px, cornerAlpha: d[3], inkShare: +(ink / (px * px)).toFixed(3), png: c.toDataURL('image/png').length });
    }
    return out;
  },
  { svg: svgs[Object.keys(svgs).find((k) => k.includes('Symbol only'))].replace(/<style>@import[^<]*<\/style>/, ''), sizes: [16, 24, 32, 64, 128, 512] },
);
await page.close();
report.D.png = pngChecks;
const idBoard = doc.artboards.find((b) => b.name.includes('identity sheet'));
const eItems = [
  fig(draw(doc, idBoard, 800, 'id-'), 'Identity sheet: marks, palette, type, pattern, motif, icon style, rules'),
  ...mats.map(({ m, made }, i) => fig(draw(made.doc, made.doc.artboards[0], 300, `e${i}-`), `${m.name} (${m.brief.kind}) · ${linkedIn(made.doc).length} linked logo${linkedIn(made.doc).length === 1 ? '' : 's'}`)),
];
const poster = mats.find(({ m }) => m.brief.kind === 'poster');
if (poster) {
  const pb = poster.made.doc.artboards[0];
  const mock = BM.mockupSvg('box', { svg: R.renderArtboard(poster.made.doc, pb, { idPrefix: 'mk-' }), w: pb.width, h: pb.height, ground: pb.background }, sys, 'mk');
  eItems.push(fig(mock.svg.replace(/width="[^"]+" height="[^"]+"/, `width="360" height="${Math.round((360 * mock.h) / mock.w)}"`), 'Product mockup (packaging) in the identity'));
}
await sheet(eItems, 'E-identity.png', `E — the ${lb.name} identity: built from the approved logo, materials composed independently in its system`);
await browser.close();
writeFileSync(`${OUT}report.json`, JSON.stringify({ ...report, ms: Date.now() - t0 }, null, 2));
console.log('PNG', JSON.stringify(pngChecks), 'sheets in', OUT, 'ms', Date.now() - t0);
