// SocriaUX Boards — many materials, one Master Design System, one canvas: the request read, the system proposed and
// held as data, the materials planned and composed in it (coordinated, each its own composition), generation with
// status and failure isolation, token bindings, propagation that keeps local overrides, notes made of checkable
// claims, arrangement, operations applied whole or refused whole, changes in words, mockups, the website concept,
// export and persistence. No model, no network.

import * as V from './.tmp/ux-v0-under-test.mjs';

let pass = 0;
let fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, String(x).slice(0, 700))));
const J = JSON.stringify;
const { boardModel: M, boardSystem: S, boardPlan: P, boardLayout: L, boardAnnotate: A, boardExport: X, boardMockup: MK, boardPipeline: PL, boardSync: SY, boardWebsite: W, gfxDoc: D, gfxRender: R } = V;

const REQUEST = 'Create a launch campaign for “Night Market Lisbon”, “Food, music and makers after dark”, every Friday in July: three posters, two Instagram graphics, a website mockup, and a product mockup. Annotate the important design decisions.';
const brief0 = () => {
  const b = P.readBoardRequest(REQUEST);
  b.content.brand = 'Night Market';
  b.content.cta = 'Find the market';
  return b;
};
const run = async (board, deps = {}, opts = {}) => {
  let cur = board;
  const seen = [];
  const res = await PL.generate(cur, { website: async () => 'uxv0_testsite', ...deps }, (op) => {
    seen.push(op);
    const r = M.applyBoardOp(cur, op);
    if (r.ok) cur = r.board;
  }, opts);
  return { board: cur, res, seen };
};
const made = async () => {
  const brief = brief0();
  const sys = PL.proposeSystems(brief, 'board-test')[0];
  const g = await run(PL.startBoard(brief, sys, { request: REQUEST }));
  return { brief, sys, board: PL.applyAll(g.board, PL.finishOps(g.board)), res: g.res, seen: g.seen };
};
const head = (doc) => D.walk(doc.artboards[0]).map((l) => l.node).find((n) => n.role === 'headline');
const lum = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)).reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);

// ── 1. the request read ──
{
  const b = brief0();
  ok('a multi-material request is read in the order it names the materials, with counts', J(b.materials.map((m) => [m.kind, m.count, m.template ?? ''])) === J([['poster', 3, ''], ['social', 2, ''], ['website', 1, ''], ['mockup', 1, 'box']]), J(b.materials));
  ok('the quoted words are the campaign’s own (headline, supporting line), never read as materials', b.content.headline === 'Night Market Lisbon' && b.content.subhead === 'Food, music and makers after dark', J(b.content));
  ok('a recurring day is a detail, kept exactly (never a [Date] placeholder)', (b.content.meta ?? []).includes('Every Friday in July'), J(b.content.meta));
  ok('“annotate the design decisions” asks for notes', b.annotate === true);
  const generic = P.readBoardRequest('Make eight materials for “Harbour Week”');
  ok('“eight materials” is read as a mix that adds up to eight', generic.materials.reduce((s, m) => s + m.count, 0) === 8 && generic.materials.length >= 3, J(generic.materials));
  const none = P.readBoardRequest('Something for “Quiet Rooms”');
  ok('a request naming no material gets two posters and two posts', J(none.materials.map((m) => [m.kind, m.count])) === J([['poster', 2], ['social', 2]]), J(none.materials));
  const quoted = P.readBoardRequest('Two posters for “Poster Day: a website about banners”');
  ok('words inside quotes never add materials', quoted.materials.length === 1 && quoted.materials[0].kind === 'poster' && quoted.materials[0].count === 2, J(quoted.materials));
}

// ── 2. the Master Design System ──
{
  const brief = brief0();
  const systems = PL.proposeSystems(brief, 'board-test');
  ok('three systems are proposed, in three different visual languages', systems.length === 3 && new Set(systems.map((s) => s.direction.language)).size === 3, J(systems.map((s) => s.direction.language)));
  const s = systems[0];
  ok('a system is structured data: palette, two faces and weights, case, composition, shape language, constraints', s.version === 1 && /^#[0-9a-f]{6}$/i.test(s.tokens.colors.accent) && s.tokens.fonts.display && s.tokens.fonts.body && s.weights.display >= 300 && ['upper', 'sentence'].includes(s.type.case) && Array.isArray(s.constraints) && s.constraints.length > 0 && 'composition' in s, J(Object.keys(s)));
  const back = S.normalizeSystem(JSON.parse(J(s)));
  ok('a system survives a round trip through storage', back && J(back.tokens) === J(s.tokens) && back.weights.display === s.weights.display);
  ok('garbage is not a system', S.normalizeSystem({ name: '<b>x</b>', tokens: {} }) === null);
}

// ── 3–4. a board planned, generated, coordinated, each material its own composition ──
const T = await made();
{
  const { board, sys, res, seen } = T;
  const names = board.materials.map((m) => m.name);
  ok('3. the board holds every material named (and a label for the packaging), each with a stable id', J(names) === J(['Poster 1', 'Poster 2', 'Poster 3', 'Instagram post 1', 'Instagram post 2', 'Product label', 'Website', 'Packaging mockup']) && new Set(board.materials.map((m) => m.id)).size === names.length, J(names));
  ok('every material made, none failed', res.ready === board.materials.length && res.failed === 0, J(res));
  const sts = (id) => seen.filter((o) => o.id === id && o.set.status).map((o) => o.set.status);
  const g1 = board.materials[0];
  ok('each material says where it is: generating → rendering → ready', J(sts(g1.id)) === J(['generating', 'rendering', 'ready']), J(sts(g1.id)));
  const graphics = board.materials.filter((m) => m.type === 'graphic');
  ok('one system: every graphic’s headline is in the system’s display face and its palette is the system’s', graphics.every((m) => head(m.doc)?.font === sys.tokens.fonts.display && m.doc.tokens.colors.accent === sys.tokens.colors.accent), J(graphics.map((m) => head(m.doc)?.font)));
  const posters = graphics.filter((m) => m.brief.kind === 'poster');
  const sig = (m) => `${m.plan.archetype}|${m.doc.artboards[0].background}`;
  ok('coherence without repetition: the three posters are three compositions (composition or ground differ)', new Set(posters.map(sig)).size === 3, J(posters.map(sig)));
  const grounds = new Set(graphics.filter((m) => ['poster', 'social'].includes(m.brief.kind)).map((m) => m.doc.artboards[0].background.toLowerCase()));
  ok('the one palette is used in more than one way across the campaign (paper, accent, ink)', grounds.size >= 2, J([...grounds]));
  ok('nothing on the board overlaps after it is arranged', L.collisions(board).length === 0, J(L.collisions(board).map(([a, b]) => [a.type, b.type])));
  ok('bindings recorded at composition: every graphic’s properties tied to the system’s tokens, no override yet', graphics.every((m) => Object.keys(m.bindings.nodes).length >= 3 && S.overridesOf(m.doc, m.bindings, sys).length === 0));
  const box = board.materials.find((m) => m.type === 'mockup');
  ok('14. the packaging mockup presents the label it was planned with (a reference, not a copy)', box.source && board.materials.find((m) => m.id === box.source.material)?.brief.kind === 'label');
  const site = board.materials.find((m) => m.type === 'website');
  ok('13. the website is linked by project id, never copied into the board', site.projectId === 'uxv0_testsite' && !('spec' in site) && !('specs' in site));
  ok('the system overview is on the board', board.nodes.some((n) => n.type === 'system'));
}

// ── bounded concurrency, failure isolation, retry only the failed one, cancellation ──
{
  const brief = brief0();
  const sys = PL.proposeSystems(brief, 'board-test')[0];
  const start = PL.startBoard(brief, sys);
  let inflight = 0;
  let most = 0;
  const failing = start.materials.find((m) => m.name === 'Poster 2').id;
  const compose = async (m, sibling, turn) => {
    inflight++;
    most = Math.max(most, inflight);
    await new Promise((r) => setTimeout(r, 5));
    inflight--;
    if (m.id === failing) throw new Error('the composer refused');
    return P.composeMaterial(m, sys, { sibling, turn });
  };
  const g = await run(start, { compose }, { concurrency: 2 });
  ok('at most the given number of materials are made at once', most === 2, most);
  const f = g.board.materials.find((m) => m.id === failing);
  ok('15. a failed material is said failed with its reason; the others are made', f.status === 'failed' && /refused/.test(f.error) && g.board.materials.filter((m) => m.id !== failing).every((m) => m.status === 'ready'), J(g.board.materials.map((m) => [m.name, m.status])));
  const before = new Map(g.board.materials.map((m) => [m.id, m]));
  const again = await run(g.board, {}, { only: [failing] });
  ok('…retried on its own: it is made, and every other material is the very same object as before', again.board.materials.find((m) => m.id === failing).status === 'ready' && again.board.materials.filter((m) => m.id !== failing).every((m) => before.get(m.id) === m));
  const sig = { aborted: false };
  const slow = async (m, sibling, turn) => {
    await new Promise((r) => setTimeout(r, 3));
    sig.aborted = true;
    return P.composeMaterial(m, sys, { sibling, turn });
  };
  const stopped = await run(start, { compose: slow }, { concurrency: 1, signal: sig });
  ok('stopping leaves what was not started planned (never claimed made)', stopped.board.materials.filter((m) => m.status === 'planned').length >= 4 && stopped.res.ready <= 3, J(stopped.res));
  const interrupted = M.applyBoardOps(start, [{ op: 'material-update', id: start.materials[0].id, set: { status: 'generating' } }]).board;
  const fixed = PL.applyAll(interrupted, PL.interruptedOps(interrupted));
  ok('interrupted generation: a material left “generating” by a closed page is said failed, to retry alone', fixed.materials[0].status === 'failed' && /Interrupted/.test(fixed.materials[0].error) && PL.interruptedOps(fixed).length === 0);
}

// ── 11–12. notes made of claims ──
{
  const { board } = T;
  const notes = board.nodes.filter((n) => n.type === 'note' && n.generated);
  ok('11. notes are written, one per material and for the system, each tied to what it explains by a connector', notes.length >= board.materials.length && notes.every((n) => board.connectors.some((c) => c.from === n.id && c.to === n.about)), notes.length);
  const p1 = board.materials.find((m) => m.name === 'Poster 1');
  const n1 = notes.find((n) => n.about === M.nodeOfMaterial(board, p1.id).id);
  ok('a note states what is true of its material: the face its headline is really set in', n1 && n1.text.includes(head(p1.doc).font) && n1.claims.some((c) => c.fact === 'headline-font' && c.value === head(p1.doc).font), n1?.text);
  ok('no rationale relative to other materials is invented (“the others”, “where the rest”)', notes.every((n) => !/\b(the others|the rest|unlike)\b/i.test(n.text)), notes.map((n) => n.text).join(' | '));
  const r = D.applyOps(p1.doc, [{ op: 'update', id: head(p1.doc).id, set: { font: 'Playfair Display' } }]);
  const changed = M.applyBoardOp(board, { op: 'material-update', id: p1.id, set: { doc: r.doc } }).board;
  const st = A.verifyNotes(changed);
  ok('a note whose material changed is found stale, with what changed (never left standing as true)', st.some((s) => s.note === n1.id && s.reasons.some((x) => /Playfair/.test(x))), J(st));
  const edited = M.applyBoardOp(changed, { op: 'node-update', id: n1.id, set: { text: 'My own reading of this poster.' } });
  const mine = edited.board.nodes.find((n) => n.id === n1.id);
  ok('12. a note the designer rewrites becomes theirs: no longer generated, no longer checked, kept by the next rewrite', edited.ok && !mine.generated && !mine.claims && PL.applyAll(edited.board, A.annotate(edited.board)).nodes.find((n) => n.id === n1.id)?.text === 'My own reading of this poster.');
  const refused = M.applyBoardOp(edited.board, { op: 'note-write', id: n1.id, text: 'overwrite', claims: [] });
  ok('…and the notes are never rewritten over it', !refused.ok, refused.error);
  const moved = M.applyBoardOp(board, { op: 'node-move', ids: [n1.id], dx: 400, dy: 0 }).board;
  const rewritten = PL.applyAll(moved, A.annotate(moved));
  ok('a generated note the designer moved stays where they put it when the notes are written again', rewritten.nodes.find((n) => n.id === n1.id)?.x === moved.nodes.find((n) => n.id === n1.id).x);
}

// ── 17–19. export ──
{
  const { board } = T;
  const material = (m, prefix) => (m.type === 'graphic' && m.doc ? { svg: R.renderArtboard(m.doc, m.doc.artboards[0], { idPrefix: prefix }), w: m.doc.artboards[0].width, h: m.doc.artboards[0].height } : null);
  const noteText = board.nodes.find((n) => n.type === 'note').text.slice(0, 24).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const withNotes = X.boardOverviewSvg(board, { materialSvg: material, refHref: () => '', annotations: true });
  const without = X.boardOverviewSvg(board, { materialSvg: material, refHref: () => '', annotations: false });
  ok('19. the board overview exports with its notes, or without them', withNotes.svg.includes(noteText) && !without.svg.includes(noteText) && withNotes.svg.startsWith('<svg'), noteText);
  ok('the overview is the presentation: every material drawn small in its place, with its name', board.materials.filter((m) => m.type === 'graphic').every((m) => without.svg.includes(m.name)));
  const [na, nb] = board.nodes.filter((n) => n.type === 'material');
  const linked = M.applyBoardOp(board, { op: 'connect', from: na.id, to: nb.id }).board;
  const arrows = (svg) => (svg.match(/marker-end="url\(#bd-arrow\)"/g) ?? []).length;
  ok('an arrow drawn between two materials stays when the notes are hidden (an arrow to a note goes with them)', arrows(X.boardOverviewSvg(linked, { materialSvg: material, refHref: () => '', annotations: false }).svg) === 1 && arrows(X.boardOverviewSvg(linked, { materialSvg: material, refHref: () => '', annotations: true }).svg) === linked.connectors.length);
  const files = board.materials.map((m) => ({ file: `${m.name}.png`, material: m.id, name: m.name, kind: m.type }));
  const man = X.manifestOf(board, files, 0);
  ok('18. a batch export’s manifest names every file by its material id, and the system the materials share', man.format === 'socriaux.board-export/1' && man.files.every((f) => board.materials.some((m) => m.id === f.material)) && man.system.fonts.display === board.system.tokens.fonts.display);
  const file = X.boardFile(board);
  const back = X.openBoardFile(file);
  ok('7. a board saved as a file reopens the same (materials, nodes, system, notes, connectors)', back && back.materials.length === board.materials.length && back.nodes.length === board.nodes.length && J(back.system.tokens) === J(board.system.tokens) && back.connectors.length === board.connectors.length);
  ok('…and the same board, operation for operation, after reopening', J(back.materials.map((m) => m.id)) === J(board.materials.map((m) => m.id)) && J(head(back.materials[0].doc)) === J(head(board.materials[0].doc)));
  ok('a file that is not a board is refused', X.openBoardFile('{"format":"socriaux.graphic/1"}') === null && X.openBoardFile('not json') === null);
}

// ── persistence, validation, ownership of what a board holds ──
{
  const { board } = T;
  const p = { ...V.makeProject('create', 'Night Market board'), medium: 'board', board };
  const saved = V.normalizeProject(JSON.parse(J(p)));
  ok('7. a board project saves and reopens through the project store’s normalization', saved.medium === 'board' && saved.board.materials.length === board.materials.length && saved.board.nodes.length === board.nodes.length);
  const sum = V.summarize(saved);
  ok('the home lists it as a board: its materials counted, its stage, its system', sum.board === board.materials.length && sum.stage === 'design' && sum.direction === board.system.direction.name, J(sum));
  const hostile = M.normalizeBoard({
    materials: [
      { id: 'm_a', type: 'graphic', name: '<img src=x onerror=alert(1)>', status: 'ready', role: 'hero', brief: board.materials[0].brief, doc: board.materials[0].doc, bindings: {} },
      { id: 'm_b', type: 'mockup', name: 'Mock', template: 'phone', source: { material: 'm_gone', artboard: 0 }, status: 'ready' },
      { id: 'm_c', type: 'mockup', name: 'Mock 2', template: 'phone', source: { material: 'm_d', artboard: 0 }, status: 'ready' },
      { id: 'm_d', type: 'website', name: 'Site', projectId: '../../etc', view: 'desktop', status: 'ready' },
      { id: 'm_e', type: 'spreadsheet', name: 'nope' },
    ],
    nodes: [
      { id: 'bn_1', type: 'material', material: 'm_a', x: 0, y: 0, w: 100, h: 140 },
      { id: 'bn_2', type: 'material', material: 'm_missing', x: 0, y: 0, w: 100, h: 140 },
      { id: 'bn_3', type: 'note', text: '<script>alert(1)</script>', x: 0, y: 400, w: 300, h: 90 },
      { id: 'bn_4', type: 'iframe', src: 'https://evil.example' },
    ],
    connectors: [{ id: 'c1', from: 'bn_3', to: 'bn_2' }],
  });
  ok('a board is held to its shape: unknown kinds dropped, nodes and connectors pointing at nothing dropped', hostile.materials.length <= 4 && !hostile.materials.some((m) => m.type === 'spreadsheet') && !hostile.nodes.some((n) => n.material === 'm_missing' || n.type === 'iframe') && hostile.connectors.length === 0, J({ m: hostile.materials.map((m) => m.type), n: hostile.nodes.map((n) => n.type), c: hostile.connectors }));
  ok('a mockup may only present a graphic on the same board (a missing or non-graphic source is none)', hostile.materials.filter((m) => m.type === 'mockup').every((m) => m.source === null));
  ok('a website reference must be a project id (a path is not one)', !hostile.materials.some((m) => m.type === 'website' && m.projectId.includes('/')), J(hostile.materials.filter((m) => m.type === 'website')));
  const ov = X.boardOverviewSvg(hostile, { materialSvg: () => null, refHref: () => '', annotations: true });
  ok('hostile words are drawn as words: nothing in them runs', !ov.svg.includes('<script>') && !ov.svg.includes('<img') && ov.svg.includes('&lt;script&gt;'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
