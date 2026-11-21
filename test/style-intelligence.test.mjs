// SocriaUX — Style Intelligence 1.0: the library, the schema, interpretation, blending, style-aware composition,
// references, edits in words, Boards, custom styles, evaluation, and what is refused. The twenty tests the mandate
// requires (its section 20) come first, numbered; integration tests follow. No model, no network.

import * as V from './.tmp/ux-v0-under-test.mjs';

let pass = 0;
let fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, String(x).slice(0, 900))));
const J = JSON.stringify;
const {
  gfxDoc: D,
  gfxCompose: C,
  gfxRender: R,
  gfxExport: X,
  gfxCheck: CK,
  gfxEdit: ED,
  gfxStyleSchema: SS,
  gfxStyles: REG,
  gfxStyleInterpret: INT,
  gfxStyleBlend: BL,
  gfxStyleApply: AP,
  gfxStyleEdit: SE,
  gfxStyleReference: RF,
  gfxStyleCustom: CU,
  gfxStyleEvaluate: EV,
  gfxStylePropose: PR,
  gfxState: ST,
  boardSystem: BS,
  boardPipeline: BP,
  boardPlan: BPL,
  boardStyle: BST,
  boardEdit: BE,
  boardModel: BM,
} = V;

const STYLES = REG.builtInStyles();
const WORDS = 'Create a promotional poster for a creative technology exhibition. Include the event name, date, location, and a short tagline.';
const briefOf = (extra = {}) => {
  const b = C.readGraphicBrief(WORDS, extra);
  b.content = { ...b.content, headline: 'Signal & Form', subhead: 'Where code becomes craft', meta: ['12–28 March 2027', 'Lisbon Design Centre'] };
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
const BASE = C.graphicDirectionOf(V.proposeDirections({ brief: wbrief, salt: 'style-test', count: 3 })[0]);
const styled = (primary, extra = {}) => AP.styledDirection(BASE, { primary, strength: 0, seedKey: 'test', ...extra });
const compose = (dir, brief = briefOf(), seed = 7) => C.composeGraphic(brief, dir, { seed, assets: [] });
const nodesOf = (doc) => doc.artboards.flatMap((b) => D.walk(b).map((l) => l.node));
const strip = (v) => JSON.parse(JSON.stringify(v, (k, x) => (k === 'id' || k === 'updatedAt' ? undefined : x)));

// ── 1. profiles load ──
{
  const counts = Object.fromEntries(['historical', 'contemporary', 'digital', 'print', 'cultural'].map((c) => [c, STYLES.filter((s) => s.category === c).length]));
  const notes = REG.builtInNotes();
  ok(
    '1. all 75 profiles load: 20 historical, 15 contemporary, 15 digital, 15 print, 10 cultural, with no repair notes',
    STYLES.length === 75 && J(counts) === J({ historical: 20, contemporary: 15, digital: 15, print: 15, cultural: 10 }) && Object.values(notes).every((n) => !n.length),
    J({ counts, notes }),
  );
  const named = [
    'bauhaus',
    'swiss-international',
    'art-nouveau',
    'art-deco',
    'constructivism',
    'de-stijl',
    'futurism',
    'dada',
    'surrealism',
    'arts-and-crafts',
    'victorian',
    'jugendstil',
    'mid-century-modern',
    'pop-art',
    'op-art',
    'psychedelic',
    'postmodernism',
    'memphis',
    'new-wave-typography',
    'early-modernist-editorial',
    'contemporary-minimalism',
    'contemporary-maximalism',
    'neo-brutalism',
    'editorial-luxury',
    'corporate-modernism',
    'experimental-editorial',
    'contemporary-swiss',
    'typographic-minimalism',
    'geometric-abstraction',
    'organic-modernism',
    'contemporary-collage',
    'experimental-typography',
    'monochromatic-editorial',
    'high-contrast-commercial',
    'premium-product-advertising',
    'y2k',
    'cyberpunk',
    'vaporwave',
    'synthwave',
    'retro-futurism',
    'solarpunk',
    'frutiger-aero',
    'webcore',
    'glitch',
    'digital-brutalism',
    'chrome-futurism',
    'early-internet-nostalgia',
    'techno-industrial',
    'holographic-digital',
    'futuristic-technical',
    'risograph',
    'screen-print',
    'letterpress',
    'punk-zine',
    'grunge',
    'photocopy-collage',
    'newspaper-editorial',
    'vintage-advertising',
    'retro-comic',
    'halftone-pop',
    'analog-film-editorial',
    'cut-paper-collage',
    'handcrafted-poster',
    'experimental-printmaking',
    'underground-music-flyer',
    'japanese-modernist',
    'japanese-woodblock',
    'scandinavian-editorial',
    'italian-futurist-typography',
    'polish-poster-school',
    'dutch-modernist',
    'latin-american-constructivist',
    'indian-modernist',
    'south-asian-cinema',
    'chinese-contemporary',
  ];
  ok(
    '…every style the mandate names is in the library',
    named.every((id) => REG.styleById(id)),
    J(named.filter((id) => !REG.styleById(id))),
  );
  ok('…adding a style needs no change to the core: the registry is built from the library files alone', Object.keys(REG.STYLE_SOURCES).length === 5 && Object.values(REG.STYLE_SOURCES).reduce((a, l) => a + l.length, 0) === 75);
}

// ── 2. IDs are unique ──
{
  const ids = STYLES.map((s) => s.id);
  ok('2. every style id is unique', new Set(ids).size === ids.length, J(ids.filter((id, i) => ids.indexOf(id) !== i)));
  ok(
    '…and every related id points at a style that exists',
    STYLES.every((s) => s.related.every((r) => REG.styleById(r))),
    J(STYLES.flatMap((s) => s.related.filter((r) => !REG.styleById(r)).map((r) => `${s.id}→${r}`))),
  );
}

// ── 3. DNA validates ──
{
  const drift = STYLES.filter((s) => J(SS.normalizeStyleDNA(s)) !== J(s)).map((s) => s.id);
  ok('3. every profile is a valid Style DNA: normalizing it again changes nothing', !drift.length, J(drift));
  const sections = ['typography', 'geometry', 'composition', 'colour', 'texture', 'imagery', 'ornament', 'constraints', 'generation'];
  ok(
    '…each has every section of the schema, versioned',
    STYLES.every((s) => s.schema === SS.STYLE_SCHEMA && sections.every((k) => s[k] && typeof s[k] === 'object')),
  );
  ok(
    '…every construction it names is one the composer can build, every face one Graphics loads',
    STYLES.every((s) => s.composition.constructions.every((c) => SS.CONSTRUCTIONS[c]) && [...s.typography.display.faces, ...s.typography.body.faces].every((f) => V.graphicFont(f))),
  );
  const notes = [];
  const bad = SS.normalizeStyleDNA(
    { name: 'Bad', typography: { display: { faces: ['Comic Sans MS', 'Limelight'], weight: 9000 }, body: { faces: ['Bangers'] } }, composition: { constructions: ['no-such-layout'], density: 400 }, geometry: { motifs: ['dragon', 'circle'] } },
    notes,
  );
  ok(
    '…a profile from outside is held to what exists: unknown faces, motifs and constructions dropped and said, numbers clamped, a display-only face kept out of the text',
    bad &&
      bad.typography.display.faces.includes('Limelight') &&
      !bad.typography.display.faces.includes('Comic Sans MS') &&
      !bad.typography.body.faces.includes('Bangers') &&
      bad.composition.density <= 100 &&
      bad.composition.constructions.every((c) => SS.CONSTRUCTIONS[c]) &&
      !bad.geometry.motifs.includes('dragon') &&
      notes.length >= 3,
    J({ notes, faces: bad?.typography }),
  );
  ok('…a profile with no name is refused', SS.normalizeStyleDNA({ composition: {} }) === null);
}

// ── 4. search works ──
{
  const top = (q, n = 3) => REG.searchStyles(q, { limit: n }).map((h) => h.style.id);
  const cases = [
    ['elegant 1920s', 'art-deco'],
    ['chaotic experimental typography', 'experimental-typography'],
    ['old internet aesthetic', 'early-internet-nostalgia'],
    ['minimal Japanese editorial', 'japanese-modernist'],
    ['1970s psychedelic concert poster', 'psychedelic'],
    ['handcrafted risograph', 'risograph'],
    ['chrome-heavy Y2K', 'y2k'],
  ];
  const misses = cases.filter(([q, id]) => !top(q).includes(id)).map(([q, id]) => `${q} → ${top(q).join(',')} (want ${id})`);
  ok('4. plain-words search finds the style meant (the mandate’s own queries among them)', !misses.length, J(misses));
  const music = top('vintage music poster', 5);
  ok(
    '…“vintage music poster” finds print and music languages, not a digital one first',
    music.length && ['psychedelic', 'underground-music-flyer', 'letterpress', 'screen-print', 'vintage-advertising', 'victorian', 'punk-zine', 'retro-comic', 'risograph'].includes(music[0]),
    J(music),
  );
  ok(
    '…the category filter holds',
    REG.searchStyles('poster', { category: 'cultural', limit: 20 }).every((h) => h.style.category === 'cultural'),
  );
  const t0 = performance.now();
  for (let i = 0; i < 50; i++) REG.searchStyles('warm vintage letterpress poster for a jazz night');
  ok('…and it is fast (50 searches over the library well under a second)', performance.now() - t0 < 1000, performance.now() - t0);
}

// ── 5. selection persists ──
{
  const sel = { primary: 'art-deco', secondary: 'risograph', strength: 55, dims: { typography: 'swiss-international' }, ornament: 70, locked: true, seedKey: 'p1' };
  const doc = compose(styled('art-deco', sel)).doc;
  const round = D.normalizeDoc(JSON.parse(J(doc)));
  ok(
    '5. the selection is kept with the design: through storage it comes back whole (primary, influence, strength, borrowed dimension, slider, lock)',
    round.style && round.style.primary === 'art-deco' && round.style.secondary === 'risograph' && round.style.strength === 55 && round.style.dims.typography === 'swiss-international' && round.style.ornament === 70 && round.style.locked === true,
    J(round.style),
  );
  const dir = ST.normalizeGraphicDirection(JSON.parse(J(styled('art-deco', sel))));
  ok('…and with the direction a project keeps (with the style’s type settings)', dir.style?.primary === 'art-deco' && typeof dir.look.trackingValue === 'number' && typeof dir.look.lineHeight === 'number', J({ style: dir.style, look: dir.look }));
  const r = D.applyOps(round, [{ op: 'style', set: { primary: 'bauhaus', strength: 0 } }]);
  ok('…a style op changes it as one step', r.ok && r.doc.style.primary === 'bauhaus');
  const cleared = D.applyOps(round, [{ op: 'style', set: null }]);
  ok('…and clearing it leaves a design that speaks none', cleared.ok && !cleared.doc.style);
}

// ── 6. the primary style shapes the composition ──
{
  const pairs = [
    ['swiss-international', 'art-nouveau'],
    ['bauhaus', 'art-deco'],
    ['risograph', 'japanese-modernist'],
  ];
  const diffs = pairs.map(([a, b]) => {
    const A = compose(styled(a));
    const B = compose(styled(b));
    const sa = EV.signatureOf(A.doc, A.plans[0].archetype);
    const sb = EV.signatureOf(B.doc, B.plans[0].archetype);
    return { a, b, ca: A.plans[0].archetype, cb: B.plans[0].archetype, sim: EV.layoutSimilarity(sa, sb), shapesA: sa.shapes.join(), shapesB: sb.shapes.join() };
  });
  ok(
    '6. the primary style shapes the design as principles: different styles, different layouts and shapes (no fixed construction)',
    diffs.every((d) => d.sim < 0.8 && d.shapesA !== d.shapesB),
    J(diffs),
  );
  // the stored constructions are still there, as an optional starting point: the templates engine builds them
  const tdiffs = pairs.map(([a, b]) => ({ a, b, ca: compose({ ...styled(a), engine: 'templates' }).plans[0].archetype, cb: compose({ ...styled(b), engine: 'templates' }).plans[0].archetype }));
  ok(
    '…and with the templates engine as a starting point, each is built in the style’s own construction',
    tdiffs.every((d) => d.ca !== d.cb && REG.styleById(d.a).composition.constructions.includes(d.ca) && REG.styleById(d.b).composition.constructions.includes(d.cb)),
    J(tdiffs),
  );
}

// ── 7. a secondary style influences the right dimensions ──
{
  const P = REG.styleById('bauhaus');
  const S = REG.styleById('risograph');
  const e = BL.effectiveDNA({ primary: 'bauhaus', secondary: 'risograph', strength: 55 }).dna;
  ok(
    '7. at 55% the influence brings its surface (misregistration, grain) and a second accent',
    e.texture.misregistration >= Math.round(S.texture.misregistration * 0.5) && e.colour.accent2 === S.colour.accent,
    J({ tex: e.texture, a2: e.colour.accent2 }),
  );
  ok(
    '…while the composition and the faces stay the dominant style’s (one language leads)',
    J(e.composition.constructions) === J(P.composition.constructions) && J(e.typography.display.faces) === J(P.typography.display.faces),
    J({ c: e.composition.constructions, f: e.typography.display.faces }),
  );
  const asked = BL.effectiveDNA({ primary: 'swiss-international', dims: { typography: 'art-deco' }, strength: 0 }).dna;
  ok('…a dimension asked for by name is taken whole (“Swiss with Art Deco typography”)', J(asked.typography) === J(REG.styleById('art-deco').typography) && J(asked.composition) === J(REG.styleById('swiss-international').composition));
  const swiss = BL.effectiveDNA({ primary: 'swiss-international', secondary: 'risograph', strength: 55 });
  ok('…and a dominant style that refuses texture (Swiss) keeps its clean surface, and says why', Object.values(swiss.dna.texture).every((v) => v === 0) && swiss.says.some((x) => /left out/.test(x)), J(swiss.says));
  const blocked = BL.effectiveDNA({ primary: 'contemporary-minimalism', secondary: 'grunge', strength: 90 });
  ok(
    '…and what the dominant style refuses is left out, and said',
    blocked.says.some((s) => /left out|kept light/.test(s)),
    J(blocked.says),
  );
}

// ── 8. strength changes the output ──
{
  const lo = BL.effectiveDNA({ primary: 'bauhaus', secondary: 'risograph', strength: 20 }).dna;
  const hi = BL.effectiveDNA({ primary: 'bauhaus', secondary: 'risograph', strength: 85 }).dna;
  ok(
    '8. a stronger influence carries more of it (texture, colour, picture treatment)',
    hi.texture.misregistration > lo.texture.misregistration && hi.colour.accent2 !== lo.colour.accent2 && J(hi.imagery.treatments) !== J(lo.imagery.treatments),
    J({ lo: [lo.texture.misregistration, lo.colour.accent2], hi: [hi.texture.misregistration, hi.colour.accent2] }),
  );
  const dl = compose(styled('bauhaus', { secondary: 'risograph', strength: 20 })).doc;
  const dh = compose(styled('bauhaus', { secondary: 'risograph', strength: 85 })).doc;
  ok('…and the composed designs differ', J(strip(dl.artboards)) !== J(strip(dh.artboards)));
}

// ── 9. only supported operations are generated ──
{
  const prims = new Set(V.gfxGeometry.PRIMITIVES.map((p) => p.kind));
  const pats = new Set(V.gfxPatterns.PATTERNS.map((p) => p.kind));
  const fxs = new Set(V.gfxEffects.EFFECTS.map((e) => e.kind));
  const bad = [];
  for (const s of STYLES) {
    const { doc } = compose(styled(s.id));
    const rep = { notes: [] };
    const again = D.normalizeDoc(JSON.parse(J(doc)), rep);
    for (const n of nodesOf(doc)) {
      if (n.type === 'shape' && n.shape === 'prim' && !prims.has(n.prim?.kind)) bad.push(`${s.id}: prim ${n.prim?.kind}`);
      if (n.type === 'pattern' && !pats.has(n.gen)) bad.push(`${s.id}: pattern ${n.gen}`);
      for (const e of n.effects ?? []) if (!fxs.has(e.kind)) bad.push(`${s.id}: effect ${e.kind}`);
    }
    if (!again || J(strip(again.artboards)) !== J(strip(doc.artboards))) bad.push(`${s.id}: not stable through normalizeDoc ${rep.notes.slice(0, 2).join(' ')}`);
  }
  ok('9. every one of the 75 styles composes only what the document model supports (stable through validation)', !bad.length, J(bad.slice(0, 8)));
  const doc = compose(styled('swiss-international')).doc;
  const y2k = compose(styled('y2k')).doc;
  const plan = SE.readStyleEdit('Remove the modern gradient treatment.', y2k, { current: { primary: 'y2k', strength: 0 } });
  const tried = D.applyOps(y2k, plan.ops);
  ok('…an edit in words makes only operations the document accepts', plan.ops.length > 0 && tried.ok, J(plan.ops.slice(0, 2)));
  ok('…and a document can say which style it is in, as data', D.applyOps(doc, [{ op: 'style', set: { primary: 'memphis', strength: 0 } }]).ok);
}

// ── 10. unsupported operations fail safely ──
{
  const doc = compose(styled('swiss-international')).doc;
  const r = D.applyOps(doc, [{ op: 'style', set: { primary: 'no-such-style', strength: 50 } }]);
  ok('10. a style SocriaUX does not have is refused, said, and the design is untouched', !r.ok && /not a style/i.test(r.error) && J(D.normalizeDoc(doc)) === J(D.normalizeDoc(doc)), r.error);
  ok(
    '…a selection from a model or a file is held to what exists (null when its style is unknown)',
    BL.normalizeSelection({ primary: 'nope' }) === null &&
      BL.normalizeSelection('<script>') === null &&
      BL.normalizeSelection({ primary: 'bauhaus', strength: 900, secondary: 'nope', dims: { typography: 'art-deco', soul: 'bauhaus' } }).strength === 100,
  );
  const vr = INT.validateStyleRequest({ primary: 'art-deco', secondary: 'fake', strength: 'loud', dims: { colour: 'fake' } });
  ok('…a model’s request is validated before it is used: unknown parts dropped and said', vr.request?.primary === 'art-deco' && !vr.request?.secondary && vr.notes.length >= 1, J(vr));
  const sneaky = SS.normalizeStyleDNA({ name: 'X<script>alert(1)</script>', description: 'javascript:alert(1) <img src=x onerror=alert(1)>', words: ['<b>'] });
  ok('…descriptions and names are data: markup characters removed, never executed', sneaky && !/[<>]/.test(sneaky.name + sneaky.description + sneaky.words.join('')), J(sneaky && [sneaky.name, sneaky.description]));
  const e = ED.readGraphicEdit('make this look like a dragon', doc, { artboard: doc.artboards[0].id, selection: [], dir: styled('swiss-international') });
  ok('…words that name no style change nothing about the style', !e || !e.next);
}

// ── 11. reference analysis yields valid data ──
{
  const px = (w, h, f) => {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const [r, g, b] = f(x, y);
        const i = (y * w + x) * 4;
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = 255;
      }
    return { width: w, height: h, data };
  };
  const grid = px(96, 96, (x, y) => (Math.hypot(x - 47.5, y - 47.5) < 30 ? [20, 20, 20] : [240, 240, 236]));
  const warm = px(96, 120, (x, y) => (y < 60 ? [242, 228, 200] : [214 + ((x * 7 + y * 13) % 17), 90 + ((x * 3) % 11), 60]));
  const a = RF.readReference(grid, { name: 'Disc' });
  const b = RF.readReference(warm, { name: 'Warm' });
  const valid = (r) => r.dna && r.dna.category === 'custom' && J(SS.normalizeStyleDNA(r.dna)) === J(r.dna) && r.palette.length >= 2 && r.nearest.length === 5 && r.nearest.every((n) => REG.styleById(n.id));
  ok('11. a reference picture is read into a valid profile, a palette and the nearest styles', valid(a) && valid(b), J({ a: a.nearest, b: b.nearest, pal: [a.palette, b.palette] }));
  ok(
    '…what it measures is what is there (the centred disc is symmetric and high-contrast; the warm picture is warm)',
    a.dna.composition.symmetry >= 60 && a.dna.colour.contrast >= 60 && b.measures.warmth > 0,
    J({ sym: a.dna.composition.symmetry, c: a.dna.colour.contrast, warm: b.measures.warmth }),
  );
  ok('…and it says what pixels cannot show, and that nothing was copied', a.notes.some((n) => /Typography/.test(n)) && a.notes.some((n) => /Nothing was copied/.test(n)));
  const sel = RF.selectionFromReferences(
    [
      { dna: a.dna, dims: ['typography'] },
      { dna: b.dna, dims: ['colour'] },
    ],
    { primary: 'swiss-international', strength: 0 },
    'dims',
  );
  ok('…“typography from A, colours from B”: each reference lends one dimension', sel.dims.typography === a.dna.id && sel.dims.colour === b.dna.id && sel.customs.length === 2 && BL.normalizeSelection(sel)?.dims?.colour === b.dna.id, J(sel.dims));
  const nl = RF.selectionFromReferences([{ dna: b.dna }], { primary: 'art-deco', strength: 0 }, 'not-layout');
  ok('…“its visual language, not its layout”: the composition stays where it was', nl.primary === b.dna.id && nl.dims.composition === 'art-deco');
}

// ── 12. manual edits are preserved ──
{
  const made = compose(styled('swiss-international')).doc;
  const ab = made.artboards[0];
  const head = D.walk(ab).find((l) => l.node.role === 'headline').node;
  const edited = D.applyOps(made, [{ op: 'update', id: head.id, set: { text: 'Signal & Form 2027' } }]).doc;
  const r = SE.restyleArtboard(edited, ab.id, { primary: 'art-deco', strength: 0 }, { dir: styled('swiss-international') });
  const texts = nodesOf(r.doc)
    .filter((n) => n.type === 'text')
    .map((n) => n.text);
  ok('12. a change of style keeps the words as the designer left them (an edited headline stays edited)', texts.some((t) => t === 'Signal & Form 2027') && texts.some((t) => t.includes('Where code becomes craft')), J(texts));
  const locked = D.applyOps(made, [{ op: 'locks', colors: true }]).doc;
  const kc = SE.restyleArtboard(locked, ab.id, { primary: 'vaporwave', strength: 0 }, { dir: styled('swiss-international') });
  ok('…locked colours stay the designer’s colours through a change of style', J(kc.doc.tokens.colors) === J(locked.tokens.colors), J([kc.doc.tokens.colors, locked.tokens.colors]));
}

// ── 13. locked objects are unchanged ──
{
  const made = compose(styled('bauhaus')).doc;
  const ab = made.artboards[0];
  const head = D.walk(ab).find((l) => l.node.role === 'headline').node;
  const lockedDoc = D.applyOps(made, [{ op: 'update', id: head.id, set: { locked: true } }]).doc;
  const before = D.walk(lockedDoc.artboards[0]).find((l) => l.node.id === head.id).node;
  const r = SE.restyleArtboard(lockedDoc, ab.id, { primary: 'risograph', strength: 0 }, { dir: styled('bauhaus') });
  const after = D.walk(r.doc.artboards[0]).find((l) => l.node.id === head.id)?.node;
  ok(
    '13. a locked object comes through a change of style exactly as it was (same object, same box, same face)',
    after && J(after) === J(before) && r.kept === 1,
    J({ before: before && [before.x, before.y, before.font], after: after && [after.x, after.y, after.font] }),
  );
  const y = compose(styled('y2k')).doc;
  const g = nodesOf(y).find((n) => n.fill && typeof n.fill === 'object');
  const ly = D.applyOps(y, [{ op: 'update', id: g.id, set: { locked: true } }]).doc;
  ok('…and flat colour leaves a locked gradient alone', SE.flatOps(ly).every((o) => o.id !== g.id) && SE.flatOps(ly).length > 0);
}

// ── 14. transformations are reversible ──
{
  const made = compose(styled('swiss-international')).doc;
  const snapshot = J(made);
  const r = SE.restyleArtboard(made, made.artboards[0].id, { primary: 'memphis', strength: 0 }, { dir: styled('swiss-international') });
  ok('14. a change of style never alters the design it starts from (the original is there to go back to)', J(made) === snapshot && r.doc !== made && r.doc.style.primary === 'memphis');
  const back = SE.restyleArtboard(r.doc, made.artboards[0].id, { primary: 'swiss-international', strength: 0, seedKey: 'test' }, { dir: styled('swiss-international') });
  const sa = EV.signatureOf(made, 'x');
  const sb = EV.signatureOf(back.doc, 'x');
  ok('…and going back to the first style builds the same design again (deterministic)', EV.layoutSimilarity(sa, sb) >= 0.95 && J(sa.faces) === J(sb.faces), J({ sim: EV.layoutSimilarity(sa, sb), fa: sa.faces, fb: sb.faces }));
}

// ── 15. custom styles reopen ──
{
  const mine = CU.customFromWords('warm risograph with Swiss typography', 'Warm riso', []);
  const ctrl = CU.customFromControls({ base: 'art-deco', accent: '#2266aa', display: 'Poiret One', density: 30 }, 'Blue deco', [mine]);
  const lib = { version: 1, styles: [mine, ctrl], folders: { [mine.id]: 'Posters' } };
  const file = CU.exportLibrary(lib);
  const back = CU.importLibrary(CU.emptyLibrary(), file);
  ok(
    '15. custom styles are made in the same schema, saved, and reopen exactly (with their folder)',
    mine && mine.category === 'custom' && back.added === 2 && J(back.library.styles) === J(lib.styles) && back.library.folders[mine.id] === 'Posters',
    J(back.notes),
  );
  ok(
    '…made from words they keep what was asked (risograph surface, Swiss faces)',
    mine.texture.misregistration > 0 && J(mine.typography.display.faces) === J(REG.styleById('swiss-international').typography.display.faces),
    J(mine.typography.display.faces),
  );
  const d = compose(AP.styledDirection(BASE, { primary: ctrl.id, strength: 0, customs: [ctrl] }, { customs: [ctrl] })).doc;
  const reopened = D.normalizeDoc(JSON.parse(J(d)));
  ok('…a design in a custom style carries it, so it reopens whole anywhere', reopened.style?.primary === ctrl.id && reopened.style.customs?.[0]?.id === ctrl.id && REG.styleById(ctrl.id, reopened.style.customs)?.name === 'Blue deco');
  const dupe = CU.duplicateStyle(ctrl, [mine, ctrl]);
  const renamed = CU.renameStyle(ctrl, 'Navy deco');
  ok('…duplicated (a new id) and renamed (the same id: designs that use it still find it)', dupe.id !== ctrl.id && renamed.id === ctrl.id && renamed.name === 'Navy deco');
  const clash = CU.normalizeLibrary({ styles: [{ ...mine, id: 'bauhaus' }] });
  ok('…a custom style never shadows a built-in one', clash.styles[0].id !== 'bauhaus');
  const brand = CU.customFromBrand({ name: 'Acme', colours: ['#0b1f3a', '#f4efe6', '#e4572e'], display: 'Fraunces' });
  ok('…from brand guidelines: the colours adopted exactly', brand.colour.ground === '#0b1f3a' && brand.colour.brand === 'adopt' && brand.typography.display.faces[0] === 'Fraunces');
}

// ── 16. board materials share coherent DNA ──
{
  const bb = {
    purpose: 'A launch campaign for a creative technology exhibition',
    name: 'Signal & Form',
    content: { headline: 'Signal & Form', subhead: 'Where code becomes craft', meta: ['12–28 March 2027', 'Lisbon'] },
    mood: ['curious'],
    materials: [],
    images: [],
    annotate: false,
  };
  const systems = BP.proposeSystems(bb, 'board-test');
  ok('16. a board’s proposed systems each speak a design language, all different', systems.length === 3 && systems.every((s) => s.style) && new Set(systems.map((s) => s.style.primary)).size === 3, J(systems.map((s) => s.style?.primary)));
  const sys = systems[0];
  const board = BP.startBoard(
    {
      ...bb,
      materials: [
        { kind: 'poster', count: 1 },
        { kind: 'social', count: 1 },
        { kind: 'social', format: 'story', count: 1 },
        { kind: 'banner', count: 1 },
      ],
    },
    sys,
  );
  const graphics = board.materials.filter((m) => m.type === 'graphic');
  const made = graphics.map((m) => BPL.composeMaterial(m, sys, { sibling: BPL.siblingIndex(board.materials, m) }));
  ok(
    '…every material speaks the one language, with the system’s palette and faces',
    made.every((x) => x.doc.style?.primary === sys.style.primary && J(x.doc.tokens) === J(sys.tokens)),
    J(made.map((x) => [x.doc.style?.primary, x.plan.archetype])),
  );
  const constructions = made.map((x) => x.plan.archetype);
  ok('…each interpreting it in its own way, not one layout resized', new Set(constructions).size >= 2, J(constructions));
  // two posters and two posts in a language with two constructions: counted across the board, not per kind, no two alike
  const sys2 = BS.systemInStyle(sys, AP.styledDirection(BS.directionOfSystem(sys), { primary: 'indian-modernist', strength: 0, seedKey: 'x' }));
  const board2 = BP.startBoard(
    {
      ...bb,
      materials: [
        { kind: 'poster', count: 2 },
        { kind: 'social', count: 2 },
      ],
    },
    sys2,
  );
  const made2 = board2.materials.filter((m) => m.type === 'graphic').map((m) => BPL.composeMaterial(m, sys2, { sibling: BPL.siblingIndex(board2.materials, m), order: BPL.graphicIndex(board2.materials, m) }));
  // four materials, four concepts: each its own structure and use of the palette (by concept, never one layout resized)
  const builds = made2.map((x) => ((c) => (c ? `${c.org}/${c.type}|${c.colouring}` : `${x.plan.archetype}|${x.plan.colour}`))(x.doc.artboards[0].concept));
  ok('…counted across the board: two posters and two posts are four different builds', made2.length === 4 && new Set(builds).size === 4, J(builds));
}

// ── 17. local overrides stay intact ──
{
  const bb = {
    purpose: 'A campaign for a jazz night',
    name: 'Night Shift',
    content: { headline: 'Night Shift', subhead: 'Live jazz until late', meta: ['Fridays', 'The Vault'] },
    mood: ['warm'],
    materials: [
      { kind: 'poster', count: 1 },
      { kind: 'social', count: 1 },
    ],
    images: [],
    annotate: false,
  };
  const sys = BS.systemInStyle(BP.proposeSystems(bb, 'ov-test')[0], AP.styledDirection(BS.directionOfSystem(BP.proposeSystems(bb, 'ov-test')[0]), { primary: 'swiss-international', strength: 0, seedKey: 'x' }));
  let board = BP.startBoard(bb, sys);
  for (const m of board.materials.filter((x) => x.type === 'graphic')) {
    const made = BPL.composeMaterial(m, sys, { sibling: BPL.siblingIndex(board.materials, m) });
    board = BP.applyAll(board, [{ op: 'material-update', id: m.id, set: { doc: made.doc, bindings: made.bindings, plan: made.plan, composed: made.doc.revision, status: 'ready' } }]);
  }
  const [first, second] = board.materials.filter((x) => x.type === 'graphic');
  const head = D.walk(first.doc.artboards[0]).find((l) => l.node.role === 'headline').node;
  const edited = D.applyOps(first.doc, [{ op: 'update', id: head.id, set: { color: '#ff00aa' } }]).doc;
  board = BP.applyAll(board, [{ op: 'material-update', id: first.id, set: { doc: edited } }]);
  const plan = BST.planRestyle(board, { primary: 'art-deco', strength: 0 }, {});
  const after = BP.applyAll(board, plan.ops);
  const firstAfter = after.materials.find((m) => m.id === first.id);
  const secondAfter = after.materials.find((m) => m.id === second.id);
  const headAfter = D.walk(firstAfter.doc.artboards[0]).find((l) => l.node.id === head.id)?.node;
  ok('17. a board-wide change of style keeps a material’s local change: it is not rebuilt, its override stays', plan.kept.some((k) => k.id === first.id) && headAfter?.color === '#ff00aa', J({ kept: plan.kept, color: headAfter?.color }));
  ok('…while untouched materials are rebuilt in the new language', plan.regenerated.some((r) => r.id === second.id) && secondAfter.doc.style?.primary === 'art-deco' && after.system.style.primary === 'art-deco', J(plan.regenerated));
  ok('…and the board says what it did, as one step', /speaks Art Deco/.test(plan.summary) && plan.ops.some((o) => o.op === 'system'), plan.summary);
}

// ── 18. existing projects remain compatible ──
{
  const old = {
    schema: 1,
    name: 'Old poster',
    artboards: [{ id: 'a', width: 1080, height: 1350, background: '#ffffff', children: [{ id: 't', type: 'text', role: 'headline', text: 'Hello', x: 10, y: 10, w: 400, h: 100, font: 'Inter', size: 60, weight: 700, color: '#111111' }] }],
    tokens: { colors: { background: '#ffffff', surface: '#ffffff', text: '#111111', muted: '#666666', accent: '#cc3300', accentText: '#ffffff', line: '#dddddd' }, fonts: { display: 'Inter', body: 'Inter' } },
  };
  const n = D.normalizeDoc(old);
  ok('18. a design made before styles opens as it was, speaking no style', n && !n.style && n.artboards[0].children[0].text === 'Hello');
  const unstyled = compose(BASE);
  ok('…and a direction with no style composes as Graphics always has (no style construction, no style recorded)', !unstyled.doc.style && !SS.isStyleConstruction(unstyled.plans[0].archetype), unstyled.plans[0].archetype);
  const st = ST.normalizeGraphicState({
    brief: null,
    options: [{ name: 'Old', language: 'gallery', tokens: { colors: {}, fonts: { display: 'Inter', body: 'Inter' } }, look: { case: 'upper', tracking: 'wide', weight: 600 } }],
    direction: null,
    doc: null,
    versions: [],
  });
  ok('…an old project’s state is read as it was', st.options[0].name === 'Old' && !st.options[0].style && st.options[0].look.case === 'upper');
  const oldSys = BS.normalizeSystem({ name: 'Camp', tokens: { colors: {}, fonts: { display: 'Inter', body: 'Inter' } } });
  ok('…and so is a board system without a language', oldSys && !oldSys.style && BS.directionOfSystem(oldSys).style === undefined);
}

// ── 19. exports preserve appearance ──
{
  const doc = compose(styled('art-deco')).doc;
  const ab = doc.artboards[0];
  const svg = X.svgFile(doc, ab, {});
  const faces = [
    ...new Set(
      nodesOf(doc)
        .filter((n) => n.type === 'text')
        .map((n) => n.font),
    ),
  ];
  const textOfSvg = (svg.match(/<text[\s\S]*?<\/text>/g) ?? []).join(' ').replace(/<[^>]+>/g, ' ');
  ok(
    '19. the SVG export carries every face the style set (linked) and every word as text',
    faces.every((f) => svg.includes(`family=${f.replace(/ /g, '+')}`)) && ['signal', '&amp;', 'form', 'where code becomes craft'].every((w) => textOfSvg.toLowerCase().includes(w)),
    J(faces),
  );
  const file = X.nativeFile(doc);
  const opened = X.openNativeFile(file);
  ok(
    '…the design file reopens with its style, drawn exactly as before',
    opened && opened.doc.style?.primary === 'art-deco' && R.renderArtboard(opened.doc, opened.doc.artboards[0], { idPrefix: 'x-' }) === R.renderArtboard(doc, ab, { idPrefix: 'x-' }),
  );
  ok('…and drawing is deterministic (the same design, the same SVG)', R.renderArtboard(doc, ab, { idPrefix: 'y-' }) === R.renderArtboard(doc, ab, { idPrefix: 'y-' }));
}

// ── 20. websites are intact ──
{
  ok(
    '20. the website faces are exactly as they were (74, the same order), Graphics’ own faces kept apart',
    V.FONTS.length === 74 && V.GRAPHIC_FONTS.slice(0, 74).every((f, i) => f.name === V.FONTS[i].name) && !V.knownFont('Limelight') && !!V.graphicFont('Limelight'),
  );
  const dirs = V.proposeDirections({ brief: wbrief, salt: 'web-intact', count: 3 });
  ok(
    '…website directions carry no style (styles are a Graphics and Boards decision)',
    dirs.every((d) => !('style' in d)),
  );
}

// ── integration ──
{
  // a brief that names its style is built in it, first
  const b = C.readGraphicBrief('An art deco poster for a jazz night “Midnight Sessions”', {});
  b.content = { ...b.content, headline: 'Midnight Sessions', meta: ['Fridays', 'The Vault'] };
  const opts = PR.styledOptions(
    b,
    V.proposeDirections({ brief: wbrief, salt: 'int', count: 3 }).map((d) => C.graphicDirectionOf(d)),
    { salt: 'int', seedKey: 'int' },
  );
  const first = compose(opts.options[0], b);
  ok(
    'integration: a brief that names a style is offered it first, composed in it from a concept of its own',
    opts.options[0].style?.primary === 'art-deco' && first.doc.style?.primary === 'art-deco' && !!first.plans[0].generative && new Set(opts.options.map((o) => o.style?.primary)).size === 3,
    J({ why: opts.why, archetype: first.plans[0].archetype }),
  );
  const open = PR.styledOptions(briefOf(), [BASE, BASE, BASE], { salt: 'open', seedKey: 'open' });
  ok(
    '…a brief that names none is offered three different languages, none of them the modern default by reflex',
    new Set(open.options.map((o) => o.style?.primary)).size === 3 && open.options.every((o) => o.style && !['contemporary-minimalism', 'corporate-modernism'].includes(o.style.primary)),
    J(open.why),
  );

  // the ten edits the mandate names, each read into a change of language
  const doc = compose(styled('art-deco')).doc;
  const cur = { primary: 'art-deco', secondary: 'neo-brutalism', strength: 50 };
  const phrases = [
    'Make this more Art Deco.',
    'Reduce the brutalist influence.',
    'Introduce risograph texture.',
    'Make the typography more experimental.',
    'Preserve the composition but change the style.',
    'Keep the colors but use Bauhaus geometry.',
    'Make this feel less like a tech startup.',
    'Give it a vintage print aesthetic.',
    'Remove the modern gradient treatment.',
    'Make the layout more asymmetrical.',
  ];
  const read = phrases.map((p) => ({ p, e: SE.readStyleEdit(p, doc, { current: cur }) }));
  ok(
    'integration: every one of the ten style edits the mandate names is read into a targeted change',
    read.every((r) => r.e && (r.e.ops.length || r.e.selection)),
    J(read.filter((r) => !r.e).map((r) => r.p)),
  );
  const sel = (p) => read.find((r) => r.p === p).e.selection;
  ok(
    '…each as asked: Art Deco raised, brutalism lowered, risograph texture borrowed, Bauhaus geometry with the colours kept, flat colour, an asymmetric composition borrowed',
    sel('Reduce the brutalist influence.').strength < 50 &&
      sel('Introduce risograph texture.').dims.texture === 'risograph' &&
      sel('Keep the colors but use Bauhaus geometry.').primary === 'bauhaus' &&
      read.find((r) => r.p.startsWith('Keep the colors')).e.keepColours &&
      sel('Remove the modern gradient treatment.').flat &&
      !!sel('Make the layout more asymmetrical.').dims.composition &&
      sel('Preserve the composition but change the style.').dims.composition === 'art-deco',
    J(read.map((r) => [r.p, r.e?.selection])),
  );
  const e = ED.readGraphicEdit('Make this more Art Deco.', compose(styled('swiss-international')).doc, { artboard: compose(styled('swiss-international')).doc.artboards[0].id, selection: [], dir: styled('swiss-international') });
  ok(
    '…and in the editor a change of language comes back as a whole new design to preview, the words kept',
    e?.next && e.next.style?.secondary === 'art-deco' && nodesOf(e.next).some((n) => n.type === 'text' && n.text === 'Signal & Form'),
    J(e && { label: e.label, style: e.next?.style }),
  );
  const locked = D.applyOps(compose(styled('swiss-international', { locked: true })).doc, []).doc;
  const le = ED.readGraphicEdit('Make this more Art Deco.', locked, { artboard: locked.artboards[0].id, selection: [], dir: styled('swiss-international') });
  ok('…while a locked style is held, and the person is asked', le && !le.next && /locked/i.test(le.question ?? ''), J(le));

  // boards in words
  const bb = { purpose: 'A campaign', name: 'Camp', content: { headline: 'Camp', meta: ['May'] }, mood: [], materials: [{ kind: 'poster', count: 1 }], images: [], annotate: false };
  const board = BP.startBoard(bb, BP.proposeSystems(bb, 'w')[0]);
  const be = BE.readBoardEdit('make the whole campaign more Art Deco', board, { selection: [] });
  ok('integration: a board edit in words changes the campaign’s language', be?.action?.kind === 'restyle' && (be.action.selection.secondary === 'art-deco' || be.action.selection.primary === 'art-deco'), J(be));

  // fidelity: deterministic, per dimension, honest
  const f = EV.evaluateStyle(compose(styled('swiss-international')).doc, { words: ['Signal & Form', 'Where code becomes craft'] });
  ok(
    'integration: fidelity is measured per dimension from the document, with checkpoints for a person (never a model’s opinion)',
    f &&
      ['typography', 'colour', 'composition', 'geometry', 'texture', 'imagery', 'ornament', 'coherence', 'brief', 'readability', 'editability'].every((k) => typeof f.dims[k].score === 'number' && f.dims[k].notes.length) &&
      f.checkpoints.length >= 2 &&
      f.dims.brief.score === 100,
    J(f),
  );
  const off = EV.evaluateStyle({ ...compose(styled('swiss-international')).doc, style: { primary: 'art-nouveau', strength: 0 } }, {});
  ok('…and a design scored against a language it does not speak scores lower on typography', off.dims.typography.score < f.dims.typography.score, J([off.dims.typography, f.dims.typography]));
  // with no words to check, the brief is said to be unchecked and left out of the overall (never a free 100)
  const bare = EV.evaluateStyle(compose(styled('swiss-international')).doc, {});
  const W = { typography: 1.2, colour: 1, composition: 1.2, geometry: 0.8, texture: 0.6, imagery: 0.4, ornament: 0.5, coherence: 1, readability: 1.2, editability: 0.5 };
  const without = Math.round(Object.entries(W).reduce((s, [k, w]) => s + bare.dims[k].score * w, 0) / Object.values(W).reduce((a, b) => a + b, 0));
  ok('…with no words to check, the brief is unchecked and not counted in the overall', bare.dims.brief.unchecked === true && !f.dims.brief.unchecked && bare.overall === without, J({ overall: bare.overall, without, brief: bare.dims.brief }));
}

// ── every construction, every palette turn, every common format: the words always read ──
{
  const t0 = performance.now();
  let n = 0;
  const left = [];
  for (const s of STYLES)
    for (const fmt of ['a4', 'instagram-square', 'instagram-story'])
      for (let i = 0; i < s.composition.constructions.length * 3; i++) {
        const c = C.composeGraphic(briefOf({ formats: [fmt] }), styled(s.id), { seed: 7, over: { styleIndex: i } });
        const hi = CK.refineDoc(c.doc).remaining.filter((f) => f.severity === 'high');
        n++;
        if (hi.length) left.push(`${s.id} ${c.plans[0].archetype} ${c.plans[0].colour} ${fmt}: ${hi[0].message.slice(0, 70)}`);
      }
  ok(`every style, in each of its constructions, each palette turn and each common format, reads after the bounded repair (${n} designs, ${Math.round(performance.now() - t0)} ms)`, n > 1000 && left.length === 0, J(left.slice(0, 6)));
}

// ── a brief that names its technique is answered in any language ──
{
  const gen = (() => {
    const b = C.readGraphicBrief('A poster for “Field Lines”, a creative coding meetup, “Code that draws”, generative, procedural', {});
    b.content = { ...b.content, headline: 'Field Lines', subhead: 'Code that draws' };
    return b;
  })();
  const own = compose(styled('swiss-international'), gen);
  const lent = compose(styled('bauhaus'), gen);
  const patternOf = (c) => nodesOf(c.doc).find((n) => n.type === 'pattern');
  ok(
    'a brief that asks for generative work gets a procedural pattern in any language: the style’s own where it has one (Swiss: its grid)',
    own.plans[0].patternAsked === true && patternOf(own)?.gen === 'grid',
    J({ asked: own.plans[0].patternAsked, gen: patternOf(own)?.gen }),
  );
  ok(
    '…else the one the words ask for, in the language’s colours (Bauhaus has none of its own)',
    lent.plans[0].patternAsked === true && !!patternOf(lent) && lent.plans[0].said.some((s) => /pattern is part of the design/.test(s)),
    J({ gen: patternOf(lent)?.gen, said: lent.plans[0].said.slice(-2) }),
  );
  const plain = compose(styled('bauhaus'));
  // no technique named: none is asked for; a pattern can still be part of a concept's own material, and is then said
  ok('…and a brief that names no technique gets none added by request (any pattern is the concept’s own, said)', !plain.plans[0].patternAsked && (!patternOf(plain) || /pattern|halftone|dots|field/i.test((plain.plans[0].generative?.trace ?? []).join(' ') + (plain.plans[0].generative?.concept.idea ?? ''))), J({ asked: plain.plans[0].patternAsked, trace: plain.plans[0].generative?.trace }));
}

// ── the same brief in all 75: genuinely different interpretations, bounded and fast ──
{
  const t0 = performance.now();
  const rows = STYLES.map((s) => {
    const c = compose(styled(s.id));
    return { id: s.id, plan: c.plans[0], sig: EV.signatureOf(c.doc, c.plans[0].archetype), doc: c.doc };
  });
  const ms = (performance.now() - t0) / rows.length;
  const rep = EV.repetition(rows.map((r) => r.sig));
  // each a concept of its own: counted by structure (principle, type strategy, motif), never by a stored construction
  const constructions = new Set(rows.map((r) => ((c) => (c ? `${c.org}/${c.type}/${c.motif ?? '-'}` : r.plan.archetype))(r.doc.artboards[0].concept)));
  const faces = new Set(rows.flatMap((r) => r.sig.faces));
  ok(
    'all 75: at least 40 different structures, at least 50 faces, and no two designs differing only in colour',
    constructions.size >= 40 && faces.size >= 50 && rep.colourOnly.length === 0,
    J({ structures: constructions.size, faces: faces.size, colourOnly: rep.colourOnly }),
  );
  ok('…their layouts are mostly unlike each other (mean similarity of the occupancy maps under 0.5)', rep.meanSimilarity < 0.5, rep.meanSimilarity);
  const words = rows.filter((r) => !nodesOf(r.doc).some((n) => n.type === 'text' && n.text === 'Signal & Form') || !nodesOf(r.doc).some((n) => n.type === 'text' && n.text.includes('Lisbon Design Centre')));
  ok('…every one keeps the brief’s words exactly', !words.length, J(words.map((r) => r.id)));
  const high = rows.map((r) => ({ id: r.id, h: CK.checkDoc(r.doc).filter((f) => f.severity === 'high').length })).filter((r) => r.h);
  ok('…none leaves a high finding of the checks (readability first)', !high.length, J(high));
  ok('…composed in a few milliseconds each, without a model', ms < 40, ms);
}

console.log(`style-intelligence: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
