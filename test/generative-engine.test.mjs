// SocriaUX Graphics — the Generative Creative Engine. A design is no longer chosen from stored layouts: the brief is
// read creatively, a language becomes principles, a concept is conceived (a lead, a material, a motif, spatial
// principles with their own numbers, operations, a type strategy, a use of colour, a focus), built as a validated
// Design Program and compiled into native, editable objects. Checked here by what it does: that it reads, that it
// conceives differently each time, that its programs are held to the registries, that its documents are editable and
// readable, that one brief in one style gives many structures, that styles act as principles, that words direct it
// reversibly, that Boards give each material its own concept, that the old templates remain an optional starting
// point. No model, no network.

import * as V from './.tmp/ux-v0-under-test.mjs';

let pass = 0;
let fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, String(x).slice(0, 700))));
const J = JSON.stringify;
const {
  gfxCompose: C,
  gfxDoc: D,
  gfxCheck: K,
  gfxEdit: E,
  gfxStyleApply: AP,
  gfxFormats: F,
  genReading: RD,
  genPrinciples: PR,
  genConcept: CO,
  genProgram: PG,
  genEvaluate: EV,
  genEngine: EN,
  genRecord: RC,
  genValidate: VL,
  genEdits: ED,
  genMemory: MM,
  boardPipeline: BP,
  boardPlan: BPL,
  boardSystem: BS,
} = V;

const WORDS = 'Create a promotional poster for a creative technology exhibition. Include the title, date, location, and tagline.';
const CONTENT = { headline: 'Signal & Form', subhead: 'Where code becomes craft', meta: ['12–28 March 2027', 'Lisbon Design Centre'] };
const briefOf = (extra = {}) => {
  const b = C.readGraphicBrief(WORDS, { formats: ['a4'], ...extra });
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
const BASE = C.graphicDirectionOf(V.proposeDirections({ brief: wbrief, salt: 'generative-test', count: 3 })[0]);
const styled = (primary) => AP.styledDirection(BASE, { primary, strength: 0, seedKey: 'gen-test' });
const gen = (dir, seed, extra = {}, brief = briefOf()) => C.composeGraphic(brief, { ...dir, generative: { seed, ...extra } }, { seed: 7 });
const board = (made) => made.doc.artboards[0];
const sigOf = (made) => EV.signatureOfBoard(board(made));
const nodes = (ab) => D.walk(ab).map((l) => l.node);
const a4 = F.formatOf('a4');

// ── 1. the creative reading ──
{
  const r = RD.readCreative(briefOf(), a4);
  ok(
    '1. the reading: to promote, about technology and art, in print, portrait',
    r.purpose === 'promote' && r.subject.domains.some((d) => d.id === 'technology') && r.subject.domains.some((d) => d.id === 'art') && r.medium === 'print' && r.aspect === 'portrait',
    J({ p: r.purpose, d: r.subject.domains, m: r.medium, a: r.aspect }),
  );
  ok(
    '…the hierarchy and what the words offer: a short title, three facts, the numbers, the ampersand, the initial',
    r.hierarchy.length === 'short' && r.hierarchy.facts === 3 && ['monumental', 'numeral', 'ampersand', 'initial'].every((k) => r.opportunities.some((o) => o.kind === k)),
    J(r.opportunities.map((o) => o.kind)),
  );
  const long = RD.readCreative({ ...briefOf(), content: { headline: 'An evening of conversations about the future of public libraries in small towns' } }, a4);
  const sale = RD.readCreative(C.readGraphicBrief('A sale poster: 40% off all winter coats this weekend', { formats: ['instagram-square'] }), F.formatOf('instagram-square'));
  const music = RD.readCreative(C.readGraphicBrief('A poster for a summer jazz festival by the sea', { formats: ['a4'] }), a4);
  ok(
    '…it responds to the content: a long title wants a measure, a sale is selling (in a feed), a festival is music and water',
    long.opportunities.some((o) => o.kind === 'long-title') && sale.purpose === 'sell' && sale.medium === 'social' && music.subject.domains.some((d) => d.id === 'music') && music.subject.domains.some((d) => d.id === 'water'),
    J([long.hierarchy.length, sale.purpose, music.subject.domains.map((d) => d.id)]),
  );
  ok('…and said in sentences for the designer', r.said.length >= 3 && r.said.every((s) => typeof s === 'string' && s.length > 10));
}

// ── 2. styles as principles; no style, a direction from the brief ──
{
  const x = (dir) => C.planFor(briefOf(), dir, a4);
  const run = (dir) => {
    const made = gen(dir, 'p');
    return made.plans[0].generative.concept;
  };
  const bau = run(styled('bauhaus'));
  const deco = run(styled('art-deco'));
  const none = run(BASE);
  ok(
    '2. a style is read as principles (its name kept), no style as a direction drawn from the brief',
    bau.language.source === 'style' && /Bauhaus/.test(bau.language.name) && none.language.source === 'brief' && !/contemporary|minimal/i.test(none.language.name),
    J([bau.language, none.language]),
  );
  ok('…and a style never selects a construction: the archetype is the engine’s, with or without a style', x(styled('bauhaus')).archetype === 'generative' && x(styled('art-deco')).archetype === 'generative' && x(BASE).archetype === 'generative');
  const read = RD.readCreative(briefOf(), a4);
  const ctx = (dir) => ({
    style: dir.style ? AP.runFor(dir.style, { hasImage: false, tokens: { background: dir.tokens.colors.background, text: dir.tokens.colors.text, accent: dir.tokens.colors.accent }, fonts: dir.tokens.fonts }) : null,
    dir,
    brief: briefOf(),
  });
  const pb = PR.principlesFor(ctx(styled('bauhaus')), read);
  const pd = PR.principlesFor(ctx(styled('art-deco')), read);
  ok(
    '…the weights follow the language: a symmetric Art Deco leans to a centre and a frame more than an asymmetric Bauhaus does',
    pd.bias.org.centre > pb.bias.org.centre && pd.bias.org.frame >= pb.bias.org.frame,
    J({ bauhaus: pb.bias.org, deco: pd.bias.org }),
  );
  ok('…and every principle stays possible (a floor), so a language leans without being a template', Object.values(pb.bias.org).every((w) => w >= 0.12) && Object.values(pd.bias.org).every((w) => w >= 0.12));
  void deco;
}

// ── 3. concepts: conceived, not looked up ──
{
  const read = RD.readCreative(briefOf(), a4);
  const p = PR.principlesFor({ style: null, dir: BASE, brief: briefOf() }, read);
  const cs = Array.from({ length: 16 }, (_, i) => CO.conceive(read, p, { seed: 1000 + i * 37 }));
  const set = (k) => new Set(cs.map((c) => c[k]));
  ok(
    '3. sixteen seeds, sixteen concepts: at least six spatial principles, five type strategies, six motifs, three leads',
    set('org').size >= 6 && set('type').size >= 5 && set('motif').size >= 6 && set('emphasis').size >= 3,
    J({ org: [...set('org')], type: [...set('type')], motif: [...set('motif')], lead: [...set('emphasis')] }),
  );
  ok(
    '…each with its central idea, art direction, seven strategies and its reasons, said',
    cs.every((c) => c.idea.length > 40 && c.artDirection && Object.values(c.strategies).every((v) => v.length > 3) && c.rationale.length >= 2),
  );
  ok(
    '…its numbers its own (angles, ratios, centres are continuous, not presets)',
    new Set(cs.filter((c) => c.org === 'axis').map((c) => c.orgParams.angle)).size === cs.filter((c) => c.org === 'axis').length && new Set(cs.map((c) => `${c.focal.x},${c.focal.y}`)).size >= 12,
  );
  const again = CO.conceive(read, p, { seed: 1000 });
  ok('…deterministic: the same seed, the same concept', J(again) === J(cs[0]));
  const k = CO.conceive(read, p, { seed: 5, constraints: { org: 'orbit', type: 'path', focal: { x: 0.8, y: 0.2 } } });
  const diag = CO.conceive(read, p, { seed: 6, constraints: { diagonal: true } });
  const asym = CO.conceive(read, p, { seed: 7, constraints: { asymmetric: true } });
  ok(
    '…constraints are honoured: a principle, a type strategy, a focus, a diagonal flow, an asymmetry',
    k.org === 'orbit' && k.type === 'path' && k.focal.x === 0.8 && diag.org === 'axis' && Math.abs(diag.orgParams.angle) >= 22 && asym.symmetry <= 12,
    J([k.org, k.type, k.focal, diag.org, diag.orgParams, asym.symmetry]),
  );
  const avoid = CO.keyOf(cs[0]);
  const away = Array.from({ length: 10 }, (_, i) => CO.conceive(read, p, { seed: 300 + i, avoid: [avoid] }));
  ok('…and memory pushes away: avoiding one concept, most new ones differ in principle', away.filter((c) => c.org !== avoid.org).length >= 7, J(away.map((c) => c.org)));
}

// ── 4. the Design Program: structured instructions, held to the registries ──
{
  const frame = { w: 1000, h: 1400 };
  const good = {
    schema: 1,
    frame,
    ground: 'ground',
    elements: [
      { op: 'rect', box: { x: 0, y: 0, w: 1000, h: 1400 }, fill: 'ground', role: 'background' },
      { op: 'path', d: 'M100 100 L400 120 C500 300 600 300 700 100 Z', fill: { linear: { angle: 90, stops: ['accent', 'accent2'] } } },
      { op: 'prim', kind: 'triangle', box: { x: 600, y: 600, w: 200, h: 200 }, fill: 'accent' },
      { op: 'text', content: 'headline', box: { x: 80, y: 900, w: 840, h: 300 }, color: 'auto' },
      { op: 'details', box: { x: 80, y: 1220, w: 600, h: 120 }, align: 'left' },
    ],
  };
  const n = PG.normalizeProgram(good, { images: 0 });
  ok('4. a valid program passes whole', n.program && n.program.elements.length === 5 && n.problems.length === 0, J(n.problems));
  const bad = PG.normalizeProgram(
    {
      schema: 1,
      frame,
      ground: 'ground',
      elements: [
        { op: 'script', code: 'alert(1)' },
        { op: 'text', content: 'Buy now!!!', box: { x: 0, y: 0, w: 10, h: 10 } },
        { op: 'text', content: 'headline', box: { x: 0, y: 0, w: 10, h: 10 }, decorative: true },
        { op: 'path', d: 'm10 10 l20 20', fill: 'ink' },
        { op: 'path', d: 'M0 0 L10 10 <script>', fill: 'ink' },
        { op: 'prim', kind: 'teleporter', box: { x: 0, y: 0, w: 10, h: 10 }, fill: 'ink' },
        { op: 'pattern', gen: 'nonsense', box: { x: 0, y: 0, w: 10, h: 10 }, inks: ['accent'] },
        { op: 'image', asset: 3, box: { x: 0, y: 0, w: 10, h: 10 } },
        { op: 'group', box: { x: 0, y: 0, w: 10, h: 10 }, children: [{ op: 'text', content: 'subhead', box: { x: 0, y: 0, w: 10, h: 10 } }] },
        { op: 'rect', box: { x: 0, y: 0, w: 10, h: 10 }, fill: 'javascript:alert(1)' },
      ],
    },
    { images: 1 },
  );
  ok(
    '…an invalid one is refused piece by piece and said: unknown instructions, free words, decorative words, relative or unsafe paths, unknown shapes and patterns, pictures not given, words in groups, unsafe colours',
    bad.program && bad.program.elements.length === 0 && bad.problems.length >= 10 && bad.problems.some((p) => /never its own words/.test(p)) && bad.problems.some((p) => /no headline/.test(p)),
    J(bad.problems),
  );
  const many = {
    schema: 1,
    frame,
    ground: 'ground',
    elements: [...Array.from({ length: 300 }, (_, i) => ({ op: 'rect', box: { x: i, y: 0, w: 5, h: 5 }, fill: 'accent' })), { op: 'text', content: 'headline', box: { x: 80, y: 900, w: 840, h: 300 } }],
  };
  const nm = PG.normalizeProgram(many, { images: 0 });
  ok(
    '…bounded (240 drawn instructions), and the bound never drops the brief’s words',
    nm.program.elements.filter((e) => e.op === 'rect').length === PG.MAX_ELEMENTS && nm.program.elements.some((e) => e.op === 'text' && e.content === 'headline'),
    J(nm.problems),
  );
  const clamp = PG.normalizeProgram({ schema: 1, frame, ground: 'ground', elements: [{ op: 'text', content: 'headline', box: { x: -1e9, y: 0, w: 1e12, h: 50 }, size: 1e9, rotation: 9999 }] }, { images: 0 });
  const t = clamp.program.elements[0];
  ok('…numbers are held to sane bounds', t.box.x >= -1400 && t.box.w <= 4200 && t.size <= 1400 && t.rotation <= 360, J(t));
}

// ── 5. the default engine, end to end: native, editable, recorded ──
{
  const made = gen(styled('bauhaus'), 'end-to-end');
  const ab = board(made);
  ok(
    '5. a poster is generated by default: the generative archetype, a concept recorded on the artboard',
    made.plans[0].archetype === 'generative' && ab.concept && ab.concept.idea && ab.concept.signature && RC.normalizeConceptRecord(ab.concept),
    J(ab.concept && { org: ab.concept.org, type: ab.concept.type }),
  );
  const ns = nodes(ab);
  ok(
    '…its objects native and editable: the words as text, shapes as shapes and paths, no picture it was not given',
    ns.filter((n) => n.type === 'text' && !n.decorative).some((t) => t.role === 'headline' && t.text === 'Signal & Form') && ns.some((n) => n.type === 'shape') && !ns.some((n) => n.type === 'image'),
    J(ns.map((n) => n.type)),
  );
  ok(
    '…every path in the document’s own 0–100 convention',
    ns.filter((n) => n.type === 'shape' && n.shape === 'path').every((n) => (n.path.match(/-?\d+(\.\d+)?/g) ?? []).map(Number).every((v) => v >= -0.5 && v <= 100.5)),
  );
  const again = D.normalizeDoc(JSON.parse(J(made.doc)));
  ok('…stable through the document’s normaliser (the concept record kept)', again && J(again.artboards[0].concept) === J(ab.concept) && D.walk(again.artboards[0]).length === ns.length);
  const same = gen(styled('bauhaus'), 'end-to-end');
  ok('…deterministic: the same request, the same design', J(EV.signatureOfBoard(board(same))) === J(EV.signatureOfBoard(ab)));
  const q = VL.validateDesign(made.doc, ab.id, briefOf());
  ok('…and judged on ten counts (brief, content, coherence, style, readability, hierarchy, diversity, technical, editability, export): it passes', q.checks.length === 10 && q.pass, J(q.checks.filter((c) => !c.pass)));
}

// ── 6. one brief, one style: many structures (the failure the audit found) ──
{
  for (const style of ['bauhaus', 'art-deco', 'neo-brutalism']) {
    const memory = [];
    const sigs = [];
    for (let i = 0; i < 8; i++) {
      const made = gen(styled(style), `div-${i}`, { avoidSignatures: memory.slice(-6) });
      memory.push(board(made).concept.signature);
      sigs.push(sigOf(made));
    }
    let max = 0;
    let sum = 0;
    let n = 0;
    for (let a = 0; a < sigs.length; a++) for (let b = a + 1; b < sigs.length; b++) ((max = Math.max(max, EV.similarity(sigs[a], sigs[b]))), (sum += EV.similarity(sigs[a], sigs[b])), n++);
    const tmpl = Array.from({ length: 4 }, (_, i) => EV.signatureOfBoard(C.composeGraphic(briefOf(), { ...styled(style), engine: 'templates' }, { seed: 7 + i * 13 }).doc.artboards[0]));
    const tSim = EV.similarity(tmpl[0], tmpl[1]);
    ok(`6. ${style}: eight generations of one brief are eight structures (no pair as alike as the threshold; mean well below the templates’)`, max < EV.TOO_SIMILAR && sum / n < 0.7 && tSim >= 0.85, J({ max, mean: sum / n, templates: tSim }));
  }
}

// ── 7. the designer's picture, always ──
{
  const asset = { id: 'pwin', kind: 'image', src: 'data:image/png;base64,iVBORw0KGgo=', width: 800, height: 600, name: 'window', source: 'upload' };
  const used = Array.from({ length: 8 }, (_, i) => {
    const made = C.composeGraphic(briefOf({ images: ['pwin'] }), { ...BASE, generative: { seed: `pic-${i}` } }, { seed: 7, assets: [asset] });
    return { led: board(made).concept.emphasis, has: nodes(board(made)).some((n) => n.type === 'image' && n.asset === 'pwin') };
  });
  ok('7. with a picture, every concept uses it, whatever it is led by', used.every((u) => u.has) && new Set(used.map((u) => u.led)).size >= 2, J(used));
}

// ── 8. directing it in words: reversible, scoped, the words and locks kept ──
{
  const dir = styled('bauhaus');
  const made = gen(dir, 'edit-base');
  const ab = board(made);
  const head = nodes(ab).find((n) => n.role === 'headline');
  const lockedDoc = D.applyOps(made.doc, [{ op: 'update', id: nodes(ab).find((n) => n.role === 'meta').id, set: { locked: true } }]).doc;
  const words = (d) => [...D.wordsOf(d).values()].join('|');
  const large = [
    'Keep the style but completely rethink the composition.',
    'Make something visually unexpected.',
    'Use a completely different creative direction.',
    'Keep the typography and change everything else.',
    "Don't use a conventional poster layout.",
    'Use an original abstract motif.',
    "Create something that doesn't look like a typical AI-generated graphic.",
    'Completely rethink the layout but keep the style.',
    'Make the composition feel more dynamic.',
    'Try an asymmetrical structure.',
    'Use a diagonal reading flow.',
    'Keep the text but reorganize everything.',
    'Make this less template-like.',
    'Try something nobody would expect from a standard startup poster.',
  ];
  const res = large.map((p) => {
    const e = E.readGraphicEdit(p, lockedDoc, { artboard: ab.id, selection: [], dir, kind: 'poster' });
    const nb = e?.next?.artboards.find((b) => b.id === ab.id);
    return {
      p,
      ok: !!nb,
      sim: nb ? EV.similarity(EV.signatureOfBoard(ab), EV.signatureOfBoard(nb)) : 1,
      words: nb ? ['Signal & Form', 'Where code becomes craft', '12–28 March 2027', 'Lisbon Design Centre'].every((w) => words(e.next).includes(w)) : false,
      locked: nb ? nodes(nb).some((n) => n.locked && n.role === 'meta') : false,
      style: e?.next?.style?.primary,
    };
  });
  ok(
    '8. every creative direction in words is understood and gives a new structure (none as alike as the threshold)',
    res.every((r) => r.ok && r.sim < EV.TOO_SIMILAR),
    J(res.filter((r) => !r.ok || r.sim >= EV.TOO_SIMILAR)),
  );
  ok(
    '…the brief’s words exact, the locked object kept, the style kept',
    res.every((r) => r.words && r.locked && r.style === 'bauhaus'),
    J(res.filter((r) => !r.words || !r.locked || r.style !== 'bauhaus').map((r) => r.p)),
  );
  const keep = E.readGraphicEdit('Keep the typography and change everything else.', made.doc, { artboard: ab.id, selection: [], dir, kind: 'poster' });
  ok('…“keep the typography”: the type strategy and faces kept, the rest reconceived', keep.next.artboards[0].concept.type === ab.concept.type && nodes(keep.next.artboards[0]).find((n) => n.role === 'headline').font === head.font);
  const focus = E.readGraphicEdit('Move the visual focus to the bottom-right.', made.doc, { artboard: ab.id, selection: [], dir, kind: 'poster' });
  const fb = EV.signatureOfBoard(focus.next.artboards[0]);
  const fa = EV.signatureOfBoard(ab);
  ok(
    '…a small change keeps the concept and moves what was asked: the weight nearer the bottom-right',
    Math.hypot(fb.balance[0] - 0.74, fb.balance[1] - 0.76) <= Math.hypot(fa.balance[0] - 0.74, fa.balance[1] - 0.76) + 0.02,
    J([fa.balance, fb.balance]),
  );
  const room = E.readGraphicEdit('Use more negative space.', made.doc, { artboard: ab.id, selection: [], dir, kind: 'poster' });
  ok('…“more negative space”: emptier than before', EV.signatureOfBoard(room.next.artboards[0]).empty > fa.empty, J([fa.empty, EV.signatureOfBoard(room.next.artboards[0]).empty]));
  const central = E.readGraphicEdit('Make the headline the central element.', made.doc, { artboard: ab.id, selection: [], dir, kind: 'poster' });
  const cs = EV.signatureOfBoard(central.next.artboards[0]);
  ok('…“the headline the central element”: the title at the middle of the frame', Math.hypot(cs.head[0] - 0.5, cs.head[1] - 0.5) < 0.16, J(cs.head));
  const five = E.readGraphicEdit('Show me five different compositions', made.doc, { artboard: ab.id, selection: [], dir, kind: 'poster' });
  ok(
    '…“show me five different compositions”: five alternatives beside the design, the original untouched',
    five.next.artboards.length === 6 && J(five.next.artboards[0].children) === J(ab.children) && new Set(five.next.artboards.slice(1).map((b) => b.concept?.signature)).size === 5,
  );
  ok('…reversible: an edit is a new document, the one it came from unchanged', J(made.doc.artboards[0].children) === J(ab.children) && res.length === large.length);
  ok('…words it does not understand are not guessed at', ED.readCreativeEdit('make it pop') === null && ED.readCreativeEdit('do the thing') === null);
}

// ── 9. memory: what was turned down is stayed away from ──
{
  const dir = styled('swiss-international');
  const made = gen(dir, 'memory');
  const ab = board(made);
  const e1 = E.readGraphicEdit('Keep the style but completely rethink the composition.', made.doc, { artboard: ab.id, selection: [], dir, kind: 'poster' });
  const rejected = e1.next.artboards[0];
  const remembered = MM.remember(made.doc, [rejected], 'rejected');
  ok(
    '9. a concept turned down is remembered (bounded, in the document)',
    remembered.compositionMemory?.some((m) => m.verdict === 'rejected' && m.sig === rejected.concept.signature && m.family === `generative:${rejected.concept.org}`),
  );
  const e2 = E.readGraphicEdit('Keep the style but completely rethink the composition.', remembered, { artboard: ab.id, selection: [], dir, kind: 'poster' });
  const s2 = EV.signatureOfBoard(e2.next.artboards[0]);
  ok('…and the next rethink stays away from it (and from the design it started from)', EV.similarity(s2, EV.signatureOfBoard(rejected)) < EV.TOO_SIMILAR && EV.similarity(s2, EV.signatureOfBoard(ab)) < EV.TOO_SIMILAR);
  ok(
    '…a choice applied is remembered as chosen',
    MM.remember(made.doc, MM.changedConcepts(made.doc, e1.next), 'selected').compositionMemory.some((m) => m.verdict === 'selected'),
  );
}

// ── 10. Boards: one identity, each material its own concept ──
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
  const sys = BP.proposeSystems(bb, 'generative-board')[0];
  const b = BP.startBoard(
    {
      ...bb,
      materials: [
        { kind: 'poster', count: 2 },
        { kind: 'social', count: 2 },
      ],
    },
    sys,
  );
  const graphics = b.materials.filter((m) => m.type === 'graphic');
  const avoid = [];
  const made = graphics.map((m) => {
    const r = BPL.composeMaterial(m, sys, { sibling: BPL.siblingIndex(b.materials, m), order: BPL.graphicIndex(b.materials, m), avoid: avoid.slice() });
    avoid.push(r.doc.artboards[0].concept?.signature ?? '');
    return r;
  });
  const keys = made.map((r) => r.doc.artboards[0].concept && `${r.doc.artboards[0].concept.org}/${r.doc.artboards[0].concept.type}/${r.doc.artboards[0].concept.colouring}`);
  ok(
    '10. a board’s four graphics: four concepts (structure and use of the palette), one identity (its tokens and language)',
    keys.every(Boolean) && new Set(keys).size === 4 && made.every((r) => J(r.doc.tokens) === J(sys.tokens) && r.doc.style?.primary === sys.style?.primary),
    J(keys),
  );
  const posters = made.filter((_, i) => graphics[i].brief.kind === 'poster');
  ok('…never one design resized: the two posters are different structures', EV.similarity(EV.signatureOfBoard(posters[0].doc.artboards[0]), EV.signatureOfBoard(posters[1].doc.artboards[0])) < EV.TOO_SIMILAR);
  const was = made[0].doc.artboards[0].concept;
  const replay = BPL.composeMaterial(graphics[0], sys, { replay: { ...was.request, keys: { org: was.org, type: was.type, colouring: was.colouring, focal: was.focal } } });
  ok(
    '…a change of tokens or language replays each material’s own composition (its principle and type kept)',
    replay.doc.artboards[0].concept.org === was.org && replay.doc.artboards[0].concept.type === was.type,
    J([was.org, was.type, replay.doc.artboards[0].concept.org, replay.doc.artboards[0].concept.type]),
  );
}

// ── 11. templates and families: optional starting points, still honoured ──
{
  const t = C.composeGraphic(briefOf(), { ...styled('bauhaus'), engine: 'templates' }, { seed: 7 });
  const fam = C.composeGraphic(briefOf(), styled('bauhaus'), { seed: 7, over: { composition: V.compSchema.normalizeCompositionPlan({ family: 'radial', seed: 3, params: {} }) } });
  const hand = C.composeGraphic(briefOf(), BASE, { seed: 7, over: { archetype: 'swiss' } });
  const picked = C.composeGraphic(briefOf(), AP.styledDirection(BASE, { primary: 'bauhaus', strength: 0, seedKey: 'gen-test', construction: 'bauhaus-asym' }), { seed: 7 });
  ok(
    '11. a template chosen as a starting point is built (the templates engine, a composition family, a hand-picked archetype, a construction picked in the explorer)',
    t.plans[0].archetype === 'bauhaus-asym' && fam.plans[0].archetype === 'composition' && hand.plans[0].archetype === 'swiss' && picked.plans[0].archetype === 'bauhaus-asym',
    J([t.plans[0].archetype, fam.plans[0].archetype, hand.plans[0].archetype, picked.plans[0].archetype]),
  );
  const card = C.composeGraphic({ ...C.readGraphicBrief('A business card for Ada Lovelace, engineer'), formats: ['business-card'] }, BASE);
  // Engine 2.0: a business card is generated too (no fixed card layout), and stays a card: its format, its words, its back
  ok('…and the kinds that used to have a fixed layout are generated too, keeping what the kind needs (a card is a card)', card.plans[0].archetype === 'generative' && card.doc.artboards.length === 2 && card.doc.artboards[0].format === 'business-card' && [...D.wordsOf(card.doc).values()].some((w) => /Ada Lovelace/.test(w)), J({ a: card.plans[0].archetype, n: card.doc.artboards.length, w: [...D.wordsOf(card.doc).values()] }));
}

// ── 12. interpretations: independent concepts for the directions step ──
{
  const leads = EN.interpretations({ count: 3, salt: 'project-1|0', hasImage: false });
  ok('12. three interpretations: three different leads, three seeds', new Set(leads.map((l) => l.emphasis)).size === 3 && new Set(leads.map((l) => l.seed)).size === 3, J(leads));
  const designs = leads.map((l) => C.composeGraphic(briefOf(), { ...styled('risograph'), generative: { seed: l.seed, emphasis: l.emphasis, ...(l.unexpected ? { constraints: { unexpected: true } } : {}) } }, { seed: 7 }));
  const s = designs.map((d) => EV.signatureOfBoard(d.doc.artboards[0]));
  ok(
    '…composed, three different concepts and structures',
    new Set(designs.map((d) => d.doc.artboards[0].concept.emphasis)).size >= 2 && EV.similarity(s[0], s[1]) < EV.TOO_SIMILAR && EV.similarity(s[1], s[2]) < EV.TOO_SIMILAR && EV.similarity(s[0], s[2]) < EV.TOO_SIMILAR,
  );
}

// ── 13. formats, readability and cost ──
{
  const bad = [];
  let ms = 0;
  let n = 0;
  for (const fmt of ['a4', 'instagram-square', 'story', 'landscape', 'banner-wide']) {
    for (const style of [null, 'bauhaus', 'art-nouveau', 'y2k']) {
      for (let i = 0; i < 3; i++) {
        const t0 = performance.now();
        const made = C.composeGraphic(briefOf({ formats: [fmt] }), { ...(style ? styled(style) : BASE), generative: { seed: `fmt-${fmt}-${i}` } }, { seed: 7 });
        ms += performance.now() - t0;
        n++;
        const high = K.checkDoc(made.doc).filter((f) => f.severity === 'high');
        if (high.length) bad.push(`${fmt} ${style} ${i}: ${high[0].message.slice(0, 80)}`);
      }
    }
  }
  ok('13. across five formats and four languages: no high finding of the checks, straight from the engine', !bad.length, J(bad.slice(0, 5)));
  ok('…bounded and fast: a few tens of milliseconds a design, without a model', ms / n < 80, ms / n);
}

console.log(`generative-engine: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
