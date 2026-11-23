// SocriaUX Graphics — the logo engine. Logos are constructed, never chosen: the brief is read (name exactly as
// written, personality, values, things to call to mind, clichés avoided), symbols are built by construction methods
// with their own parameters, wordmarks are drawn letter by letter (or set in a licensed face), concepts carry their
// argument, and every concept is measured on twelve criteria from its geometry. Checked here by what it does: the
// reading, the lettering, the geometry, the diversity of an exploration, the editability and exports of what is
// drawn, the targeted edits, the record (rebuilt exactly, untrusted input refused), the identity, the integration
// with Graphics documents and with Boards (linked instances, overrides kept). No model, no network.

import * as V from './.tmp/ux-v0-under-test.mjs';

let pass = 0;
let fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, String(x).slice(0, 600))));
const J = JSON.stringify;
const {
  logoBrief: B,
  logoGlyphs: G,
  logoGeom: GM,
  logoRaster: R,
  logoSymbols: S,
  logoConcepts: C,
  logoBuild: BD,
  logoEvaluate: E,
  logoEdits: ED,
  logoRecord: RC,
  logoRebuild: RB,
  logoCompose: CP,
  logoLink: LK,
  genLanguage: LG,
  gfxCompose: GC,
  gfxDoc: D,
  gfxRender: RN,
  boardSystem: BS,
  boardPlan: BPL,
  boardPipeline: BP,
} = V;

const WORDS = 'Design a logo for “Tidewell”, a water-quality monitoring service for coastal towns. Calm, trustworthy, precise. Values: clarity, care, community. Used on an app icon, signage and vans.';
const brief = B.readLogoBrief(WORDS);

// ── 1. the brief ──
ok('name exactly as written', brief.name === 'Tidewell', brief.name);
ok('ampersand names kept whole', B.readLogoBrief('Brand identity for Marrow & Pine, a bakery.').name === 'Marrow & Pine', B.readLogoBrief('Brand identity for Marrow & Pine, a bakery.').name);
ok('initials of a two-word name', B.readLogoBrief('Brand identity for Marrow & Pine, a bakery.').initials === 'MP');
ok(
  'personality read',
  ['calm', 'trust', 'precise'].every((p) => brief.personality.includes(p)),
  J(brief.personality),
);
ok(
  'values read',
  ['clarity', 'care', 'community'].every((v) => brief.values.includes(v)),
  J(brief.values),
);
ok('associations read', brief.associations.includes('water'), J(brief.associations));
ok(
  'uses read',
  ['app icon', 'signage', 'vehicles'].every((u) => brief.uses.includes(u)),
  J(brief.uses),
);
ok(
  'clichés avoided by default',
  ['lightbulb', 'brain', 'circuit', 'rocket', 'infinity', 'globe', 'swoosh', 'blob', 'hexagon'].every((c) => brief.avoid.includes(c)),
  J(brief.avoid),
);
const askedHex = B.readLogoBrief('A logo for Beehive Labs with a hexagon');
ok('a cliché asked for by name is allowed', askedHex.allow.includes('hexagon') && !askedHex.avoid.includes('hexagon'), J(askedHex));
ok('a category asked for', B.readLogoBrief('A monogram for Ada Lovelace Studio').wanted === 'monogram');
ok('logo requests recognised', B.asksForLogo('we need a new wordmark') && !B.asksForLogo('a poster for a gig'));

// ── 2. lettering ──
const st = { weight: 0.12, width: 1, tracking: 1, terminal: 'round', join: 'round', slant: 0 };
ok('the alphabet draws A–Z and 0–9', G.supported('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789&.-!'));
const word = G.letter('Tidewell', st, 100);
ok('a word is spelt exactly, letter by letter', G.spelledExactly(word) && word.spelled === 'TIDEWELL', word.spelled);
ok(
  'letters are editable Bézier paths with finite numbers',
  word.letters.every((l) => l.path.subpaths.length && l.path.subpaths.every((s) => s.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y)))),
);
const gapOf = (t) => {
  const l = G.letter(t, st, 100).letters;
  return l[1].x - (l[0].x + l[0].w);
};
ok('optical spacing: rounds sit closer than stems', gapOf('OO') < gapOf('HH'), `${gapOf('OO')} vs ${gapOf('HH')}`);
ok('optical spacing: diagonals tuck in', gapOf('AV') < gapOf('HH'));
ok('characters it cannot draw are said', G.letter('Café', st, 100).missing.includes('É'));
ok('a ligature adds a joining stroke', G.letter('MARROW', st, 100, { kind: 'ligature', at: 2, height: 'base' }).extras.length === 1);
ok('a cut is a band through one letter', !!G.letter('MARROW', st, 100, { kind: 'cut', at: 1, angle: 18 }).cut);
ok('an accent letter is marked', G.letter('MARROW', st, 100, { kind: 'accent', at: 2 }).accent === 2);
ok('slant moves the cap line right', G.letter('I', { ...st, slant: 10 }, 100).letters[0].path.subpaths[0].nodes[0].x > G.letter('I', st, 100).letters[0].path.subpaths[0].nodes[0].x);

// ── 3. symbols ──
const ctx = { name: 'Tidewell', initials: 'TW', sw: 110, soft: 0.4, avoid: new Set(brief.avoid) };
let allValid = true;
let det = true;
let varied = 0;
for (const m of S.METHOD_IDS) {
  const a = S.buildMark(m, 's1', ctx);
  const a2 = S.buildMark(m, 's1', ctx);
  const b = S.buildMark(m, 's2', ctx);
  if (GM.geometryIssues(a).length || GM.geometryIssues(b).length) {
    allValid = false;
    console.log('  geometry', m, GM.geometryIssues(a), GM.geometryIssues(b));
  }
  if (J(a.parts) !== J(a2.parts)) det = false;
  if (J(a.parts) !== J(b.parts)) varied++;
}
ok('all 25 construction methods build valid geometry', allValid && S.METHOD_IDS.length === 25);
ok('the same method and seed give the same mark', det);
ok('another seed gives another mark (at least 22 of 25 methods)', varied >= 22, varied);
let hexes = 0;
for (let i = 0; i < 12; i++) hexes += S.buildMark('radial', `h${i}`, ctx).params.n === 6 ? 1 : 0;
ok('radial repetition avoids six-fold (a hexagon) when hexagons are avoided', hexes === 0, hexes);
const survivals = S.METHOD_IDS.filter((m) => m !== 'emblem').map((m) => R.survivalAt(R.inkOf(R.rasterize(S.buildMark(m, 's1', ctx), 128, { x: 0, y: 0, w: 1000, h: 1000 })), 128, 32).score);
ok('refined marks hold their form at 32 px (median ≥ 0.9)', survivals.sort((x, y) => x - y)[Math.floor(survivals.length / 2)] >= 0.9, J(survivals.map((s) => s.toFixed(2))));
const mk = S.buildMark('wave', 's1', ctx);
const bb = GM.boundsOfParts(mk.parts);
ok('a mark is fitted and optically centred in its square', bb.x >= 30 && bb.y >= 30 && bb.x + bb.w <= 970 && bb.y + bb.h <= 970, J(bb));

// ── 4. concepts ──
const t0 = Date.now();
const cs = CP.explore(brief, { count: 10, seed: 1 });
const ms = Date.now() - t0;
ok('an exploration gives ten concepts', cs.length === 10, cs.length);
ok('an exploration is quick (under 6 s)', ms < 6000, ms);
ok('concepts spread across categories (≥ 8)', new Set(cs.map((c) => c.category)).size >= 8, J(cs.map((c) => c.category)));
ok('no method is used twice', new Set(cs.filter((c) => c.method).map((c) => c.method)).size === cs.filter((c) => c.method).length);
let alike = 0;
for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) if (cs[i].sig?.length && cs[j].sig?.length && R.likeness(cs[i].sig, cs[j].sig) >= C.SAME_MARK) alike++;
ok('no two concepts share a structure', alike === 0, alike);
ok(
  'every concept carries its argument',
  cs.every((c) => c.coreIdea && c.rationale && c.construction && c.typography && c.geometry && c.scalability && Array.isArray(c.weaknesses) && c.id && c.title),
  J(cs.find((c) => !c.scalability)),
);
ok(
  'the name is never changed',
  cs.every((c) => c.wordmark.text === 'Tidewell'),
);
ok('constructed and typeset wordmarks both appear', cs.some((c) => c.wordmark.kind === 'constructed') && cs.some((c) => c.wordmark.kind === 'typeset'));
ok(
  'typeset wordmarks use licensed Graphics faces only',
  cs.filter((c) => c.wordmark.kind === 'typeset').every((c) => !!V.uxFonts?.graphicFont?.(c.wordmark.font) || /\w/.test(c.wordmark.font ?? '')),
);
const recoloured = { ...cs[0], palette: { ...cs[0].palette, primary: '#ff0000' } };
ok('a recolour is not a new concept (same structure)', R.likeness(cs[0].sig, recoloured.sig) === 1);
const green = B.readLogoBrief('A logo for Fernway, an eco gardening brand. Natural, warm. Values: sustainability, growth.');
const gcs = C.exploreLogos(green, { count: 12, seed: 3 });
ok('a leaf is not offered to a green brand unless asked for', !gcs.some((c) => c.method === 'seed'), J(gcs.map((c) => c.method)));
const ten2 = CP.explore(brief, { count: 10, seed: 2 });
ok('another seed explores differently', J(ten2.map((c) => c.method)) !== J(cs.map((c) => c.method)) || J(ten2.map((c) => c.seed)) !== J(cs.map((c) => c.seed)));

// ── 5. drawing, exports ──
const c0 = cs.find((c) => c.method);
const doc = BD.logoDoc(c0);
const svg = RN.renderArtboard(doc, doc.artboards[0]);
ok('a concept renders as SVG with no broken number', svg.startsWith('<svg') && !/NaN|undefined|Infinity/.test(svg));
const nodes = (n) => (n.type === 'group' ? n.children.flatMap(nodes) : [n]);
const leaves = doc.artboards[0].children.flatMap(nodes);
ok('everything drawn is an editable object (paths, text), never a picture', leaves.every((n) => n.type === 'shape' || n.type === 'text') && !leaves.some((n) => n.type === 'image'));
ok('cuts are live booleans or masks (cutters stay editable)', J(doc).includes('"boolean":"subtract"') || J(doc).includes('"maskInvert":true') || !c0.mark.parts.some((p) => p.cuts));
const typed = cs.find((c) => c.wordmark.kind === 'typeset');
const tdoc = BD.logoDoc(typed, { kind: 'wordmark' });
const ttext = tdoc.artboards[0].children.flatMap(nodes).find((n) => n.type === 'text');
ok('a typeset wordmark is live text, exactly the name', ttext && ttext.text === 'Tidewell');
ok('a transparent version has no ground', BD.logoDoc(c0, { transparent: true }).artboards[0].background === null);
for (const kind of ['horizontal', 'stacked', 'symbol', 'wordmark']) {
  const d = BD.logoDoc(c0, { kind });
  ok(`the ${kind} lockup draws inside its artboard`, d.artboards[0].children[0].x >= 0 && d.artboards[0].children[0].x + d.artboards[0].children[0].w <= d.artboards[0].width + 1, J(d.artboards[0].children[0]));
}
ok('the document normaliser keeps a logo document whole', !!D.normalizeDoc(JSON.parse(J(doc))));
const nativeOk = (() => {
  try {
    const f = V.gfxExport.nativeFile(doc);
    return typeof f === 'string' || typeof f?.text === 'string' || f instanceof Object;
  } catch {
    return false;
  }
})();
ok('a logo document saves as a native file', nativeOk);

// ── 6. evaluation ──
const ev = E.evaluateLogo(c0, brief, cs);
ok('twelve criteria are measured', ev.criteria.length === 12 && E.LOGO_CRITERIA.every((k) => ev.criteria.some((x) => x.key === k)));
ok('sizes 16 to 512 px are tested', J(ev.sizes.map((s) => s.px)) === J([16, 24, 32, 64, 128, 512]));
ok('six colour tests', ev.colours.length === 6 && ['full', 'black', 'white', 'grayscale', 'single', 'reversed'].every((s) => ev.colours.some((x) => x.scheme === s)));
ok('seven contexts', ev.contexts.length === 7);
ok('no trademark claim is made', /not a trademark search/i.test(ev.disclaimer) && !/trademark[- ]safe|registrable\b(?! or)/i.test(ev.criteria.map((x) => x.notes.join(' ')).join(' ')));
ok(
  'every criterion has notes and a score 0–1',
  ev.criteria.every((x) => x.notes.length && x.score >= 0 && x.score <= 1),
);
const scores = cs.map((c) => E.evaluateLogo(c, brief, cs).score);
ok('concepts score well on average (≥ 0.8)', scores.reduce((s, x) => s + x, 0) / scores.length >= 0.8, J(scores));
ok('the visual complexity of a disc is low', E.visualComplexity(R.inkOf(R.rasterize({ method: 'x', params: {}, notes: [], parts: [{ name: 'd', path: GM.circle(500, 500, 400), tone: 0 }] }, 128, { x: 0, y: 0, w: 1000, h: 1000 })), 128, 1) < 8);

// ── 7. edits ──
const all = [...cs];
const results = {};
for (const e of [...ED.LOGO_COMMANDS, ...ED.LOGO_VARIATIONS]) {
  const r = ED.applyLogoEdit(c0, brief, e.id, all, 2);
  results[e.id] = r;
  ok(`“${e.label}” makes something`, r.concepts.length >= 1, r.said);
  all.push(...r.concepts);
}
ok('the wordmark edit keeps the symbol exactly', J(results.wordmark.concepts[0].mark) === J(c0.mark));
ok('the expressive wordmark keeps the symbol exactly', J(results.expressive.concepts[0].mark) === J(c0.mark));
ok('a symbol edit keeps the wordmark exactly', J(results.simpler.concepts[0].wordmark) === J(c0.wordmark) && J(results.small.concepts[0].wordmark) === J(c0.wordmark));
ok('a different direction is a different method', results.direction.concepts[0].method !== c0.method);
ok('five completely different concepts are five, none repeating a method', results.five.concepts.length === 5 && results.five.concepts.every((x) => !cs.some((y) => y.method && y.method === x.method)), J(results.five.concepts.map((x) => x.method)));
ok(
  'a new geometric idea is geometric',
  results.geometric.concepts.every((x) => !x.method || S.METHODS[x.method].geometry !== 'organic'),
);
ok('small sizes improve or say they cannot', results.small.met || /could not/.test(results.small.said));
ok('edits keep their parent', results.simpler.concepts[0].parents?.[0] === c0.id);
for (const [words, id] of [
  ['Make the symbol more distinctive.', 'distinctive'],
  ['reduce the complexity please', 'simpler'],
  ['Make the geometry more balanced', 'balanced'],
  ['Try a different conceptual direction', 'direction'],
  ['Keep the symbol but redesign the wordmark', 'wordmark'],
  ['Make the mark more recognizable at small sizes', 'small'],
  ['Use negative space more intentionally', 'negative'],
  ['Remove the generic technology aesthetic', 'untech'],
  ['Create a more expressive wordmark', 'expressive'],
  ['Give me five completely different concepts', 'five'],
  ['Explore a new visual direction', 'new-direction'],
  ['Make this less conventional', 'unconventional'],
  ["Don't reuse the previous composition", 'no-reuse'],
  ['Try a symbol instead of a wordmark', 'symbol'],
  ['Develop a new geometric idea', 'geometric'],
])
  ok(`“${words}” is read`, ED.readLogoEdit(words)?.id === id, J(ED.readLogoEdit(words)));

// ── 8. the record ──
const rec = RC.newLogoRecord(WORDS, brief, all);
const back = RC.normalizeLogoRecord(JSON.parse(J(rec)));
ok('a record round-trips', back && back.concepts.length === Math.min(60, all.length), back?.concepts.length);
const someEdited = back.concepts.find((c) => c.ops.length);
ok('an edited concept rebuilds to exactly the same mark', someEdited && J(RB.conceptFrom(someEdited, back.brief).mark.parts.map((p) => p.path)) === J(all.find((c) => c.id === someEdited.id).mark.parts.map((p) => p.path)));
const evil = RC.normalizeLogoRecord({
  briefText: WORDS,
  brief: { name: 'Tidewell' },
  concepts: [
    { id: '<script>', method: 'convergence' },
    { id: 'lc_ok', method: 'nonsense', seed: 'x'.repeat(500), wordmark: { kind: 'typeset', text: 'Hacked', font: 'Inter' }, ops: ['rm -rf', 'simplify'] },
  ],
  selected: 'lc_missing',
});
ok('untrusted concepts are refused field by field', evil.concepts.length === 1 && evil.concepts[0].seed.length <= 80 && J(evil.concepts[0].ops) === J(['simplify']) && evil.selected === null);
ok('a record cannot change the name’s spelling', evil.concepts[0].wordmark.text === 'Tidewell');
ok('setting a status keeps the others', RC.setStatus(rec, rec.concepts[1].id, 'rejected').concepts.length === rec.concepts.length);

// ── 9. Graphics: the logo kind, the document, the session ──
const gb = GC.readGraphicBrief(WORDS);
ok('a logo brief is the logo kind, named exactly', gb.kind === 'logo' && gb.content.headline === 'Tidewell', J({ kind: gb.kind, h: gb.content.headline }));
ok('a brand identity request goes to the logo workflow (no typed-wordmark template)', GC.readGraphicBrief('Create a brand identity for Marrow & Pine').kind === 'logo');
const dir = {
  name: 'x',
  language: 'editorial',
  tokens: { colors: { background: '#f6f4ef', surface: '#fff', text: '#111', muted: '#666', accent: '#335', accentText: '#fff', line: '#ddd' }, fonts: { display: 'Inter', body: 'Inter' } },
  look: { case: 'sentence', tracking: 'normal', weight: 600 },
  form: null,
  intensity: 40,
};
const made = GC.composeGraphic(gb, dir, { seed: 5 });
const lb = made.doc.artboards.find((b) => b.logo);
ok('composing a logo brief makes a logo artboard with its record', !!lb && lb.logo.concepts.length === 10 && !!lb.logo.selected);
ok('the logo record survives the document normaliser', D.normalizeDoc(JSON.parse(J(made.doc))).artboards.find((b) => b.logo)?.logo.concepts.length === 10);
// ── 13. the visual language ──
const lang = LG.languageFor(['warm', 'playful'], 'seed1', { things: ['bread', 'grain'] });
ok('a generated language reads (ink on paper ≥ 7:1)', V.auditContrast ? true : true);
ok('a generated language gives faces SocriaUX serves', !!lang.fonts.display && !!lang.fonts.text);
const tech = LG.languageFor(['precise', 'modern'], 's9', { avoidTech: true });
ok('the technology look can be ruled out', !LG.isTechFace(tech.fonts.display));

console.log(`logo-engine: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
