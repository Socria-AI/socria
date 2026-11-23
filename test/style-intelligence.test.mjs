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
  gfxStyleSchema: SS,
  gfxStyles: REG,
  gfxStyleInterpret: INT,
  gfxStyleBlend: BL,
  gfxStyleApply: AP,
  gfxStylePropose: PR,
  gfxState: ST,
  boardSystem: BS,
  boardPipeline: BP,
  boardPlan: BPL,
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
  // a generated material counts by its concept's structure (principle and type strategy), a fixed one by its archetype
  const constructions = made.map((x) => (x.plan.archetype === 'generative' && x.doc.artboards[0].concept ? `${x.doc.artboards[0].concept.org}/${x.doc.artboards[0].concept.type}` : x.plan.archetype));
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

console.log(`style-intelligence: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
