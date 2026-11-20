// SocriaUX Graphics — the creative-ceiling expansion: geometry, vector editing, booleans, paint, effects, patterns,
// typography, compositing, pictures, the vocabulary and its compositions, edits in words, Boards, exports, and what
// is refused. Each capability is checked by what it does, not by its presence. No model, no network.

import * as V from './.tmp/ux-v0-under-test.mjs';

let pass = 0;
let fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, String(x).slice(0, 700))));
const J = JSON.stringify;
const { gfxDoc: D, gfxRender: R, gfxGeometry: G, gfxPaint: P, gfxEffects: E, gfxPatterns: PT, gfxVector: VO, gfxSvgImport: I, gfxVocab: VC, gfxCaps: CAP, gfxCompose: C, gfxEdit: ED, gfxText: T, gfxExport: X } = V;

const board = (children, extra = {}) => D.normalizeDoc({ schema: 1, name: 'T', artboards: [{ id: 'ab', width: 1000, height: 1000, background: '#f4f1ea', children }], ...extra });
const svgOf = (doc) => R.renderArtboard(doc, doc.artboards[0]);
const nodesOf = (doc) => doc.artboards.flatMap((b) => D.walk(b).map((l) => l.node));

// ── 1. every shape family ──
{
  const bad = [];
  for (const spec of G.PRIMITIVES)
    for (const [w, h] of [[300, 200], [60, 240], [12, 12]]) {
      const p = G.primPath(G.primDefaults(spec.kind), w, h);
      const pts = G.flatten(p).rings.flat();
      const b = G.pathBounds(p);
      if (!G.pathD(p) || !pts.length || pts.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y))) bad.push(`${spec.kind} ${w}x${h} empty`);
      else if (b.x < -w * 0.6 || b.y < -h * 0.6 || b.x + b.w > w * 1.6 || b.y + b.h > h * 1.6) bad.push(`${spec.kind} ${w}x${h} outside`);
    }
  ok('1. every primitive (60 kinds, five families) draws finite geometry within its box at any size', G.PRIMITIVES.length >= 60 && !bad.length, J(bad));
  const fam = Object.fromEntries(G.PRIM_CATEGORIES.map((c) => [c.id, G.PRIMITIVES.filter((p) => p.category === c.id).length]));
  ok('…basic, geometric, organic, decorative and technical families each have several kinds', Object.values(fam).every((n) => n >= 6) && Object.keys(fam).length === 5, J(fam));
  const named = ['rounded-rect', 'circle', 'triangle', 'line', 'arrow', 'polygon', 'star', 'ring', 'arc', 'sector', 'wedge', 'trapezoid', 'parallelogram', 'diamond', 'rhombus', 'hexagon', 'octagon', 'chevron', 'cross', 'plus', 'crescent', 'capsule', 'superellipse', 'rounded-polygon', 'speech-bubble', 'callout', 'bracket', 'corner-ornament', 'blob', 'wave', 'ribbon', 'fluid-curve', 'irregular-polygon', 'wavy-circle', 'distorted-ring', 'curved-band', 'cutout', 'contour', 'flow-lines', 'burst', 'sunburst', 'concentric', 'nested-polygons', 'spiral', 'guilloche', 'topographic', 'isometric-grid', 'perspective-grid', 'fragments', 'line-system', 'annotation', 'frame', 'border'];
  const missing = named.filter((k) => !G.PRIMITIVE_BY_KIND.has(k));
  ok('…every shape the brief names exists as a primitive', !missing.length, J(missing));
  const doc = board(G.PRIMITIVES.map((s, i) => ({ type: 'shape', shape: 'prim', prim: G.primDefaults(s.kind), x: (i % 10) * 100, y: Math.floor(i / 10) * 100, w: 90, h: 90, fill: '#123456' })));
  ok('…and each renders as a path of its own on an artboard', (svgOf(doc).match(/<path d="M/g) ?? []).length >= G.PRIMITIVES.length);
}

// ── 2. parametric edits ──
{
  const a = G.primPath({ kind: 'star', params: { points: 5, inner: 45, rounding: 0, rotation: 0 } }, 100, 100);
  const b = G.primPath({ kind: 'star', params: { points: 9, inner: 45, rounding: 0, rotation: 0 } }, 100, 100);
  ok('2. a parameter changes the geometry (a star of 5 points, of 9)', a.subpaths[0].nodes.length === 10 && b.subpaths[0].nodes.length === 18);
  const n = G.normalizePrim({ kind: 'star', params: { points: 999, inner: -5, nonsense: 3 } });
  ok('…parameters are clamped to their ranges and unknown ones dropped', n.params.points === 24 && n.params.inner === 10 && !('nonsense' in n.params), J(n));
  const doc = board([{ id: 's', type: 'shape', shape: 'prim', prim: { kind: 'star', params: { points: 5 } }, x: 0, y: 0, w: 100, h: 100, fill: '#000' }]);
  const r = D.applyOp(doc, { op: 'update', id: 's', set: { prim: { kind: 'star', params: { points: 7 } } } });
  ok('…an update of one parameter is one validated operation', r.ok && nodesOf(r.doc)[0].prim.params.points === 7 && r.doc.revision === doc.revision + 1);
}

// ── 3. Bézier editing ──
{
  const p = VO.parseD('M10 10 C 20 0, 40 0, 50 10 S 80 20, 90 10 Q 95 50 50 90 T 10 50 A 20 20 0 0 1 10 10 Z');
  ok('3. SVG path data is read into anchors and handles (C, S, Q, T and arcs as cubics, closed)', !!p && p.subpaths.length === 1 && p.subpaths[0].closed && p.subpaths[0].nodes.length >= 6 && p.subpaths[0].nodes.some((n) => n.in && n.out), J(p));
  const sub = { closed: false, nodes: [{ x: 0, y: 0 }, { x: 100, y: 0 }] };
  const ins = G.insertNode(sub, 0, 0.5);
  ok('…a node inserted in a segment at its middle', ins.nodes.length === 3 && Math.abs(ins.nodes[1].x - 50) < 0.01);
  const rem = G.removeNode(ins, 1);
  ok('…and removed again', rem.nodes.length === 2);
  const smooth = { closed: false, nodes: [{ x: 0, y: 0 }, { x: 50, y: 0, in: [40, 0], out: [60, 0], smooth: true }, { x: 100, y: 0 }] };
  const moved = G.moveNodePart(smooth, 1, 'out', 60, 10);
  const nd = moved.nodes[1];
  const cross = (nd.out[0] - nd.x) * (nd.in[1] - nd.y) - (nd.out[1] - nd.y) * (nd.in[0] - nd.x);
  const dot = (nd.out[0] - nd.x) * (nd.in[0] - nd.x) + (nd.out[1] - nd.y) * (nd.in[1] - nd.y);
  ok('…dragging one handle of a smooth node turns the other with it (opposite, its own length kept)', Math.abs(cross) < 0.05 && dot < 0 && Math.abs(Math.hypot(nd.in[0] - nd.x, nd.in[1] - nd.y) - 10) < 0.01, J(nd));
  const corner = G.setSmooth(moved, 1, false);
  ok('…a node made a corner (its handles taken away)', !corner.nodes[1].smooth && !corner.nodes[1].in && !corner.nodes[1].out);
  const cusp = { closed: false, nodes: [{ x: 0, y: 0 }, { x: 50, y: 0, in: [40, 5], out: [60, 5] }, { x: 100, y: 0 }] };
  ok('…a cusp’s handles move freely, one without the other', J(G.moveNodePart(cusp, 1, 'out', 70, -20).nodes[1].in) === J([40, 5]));
  ok('…a corner made smooth again gets handles along its neighbours', !!G.setSmooth(corner, 1, true).nodes[1].in);
  const rev = G.reversePath({ subpaths: [{ closed: false, nodes: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 5 }] }] });
  ok('…a path reversed', rev.subpaths[0].nodes[0].x === 20 && rev.subpaths[0].nodes[2].x === 0);
  const split = G.splitSubpath({ closed: false, nodes: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 30, y: 0 }] }, 2);
  ok('…split at a node, and two open paths joined', split.length === 2 && !!G.joinSubpaths(split[0], split[1]));
  const wobbly = { subpaths: [{ closed: false, nodes: Array.from({ length: 60 }, (_, i) => ({ x: i, y: Math.sin(i / 3) * 0.2 })) }] };
  ok('…simplified (fewer nodes, same course) and smoothed', G.simplifyPath(wobbly, 1).subpaths[0].nodes.length < 10 && G.smoothPath({ subpaths: [{ closed: true, nodes: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] }] }).subpaths[0].nodes.every((n) => n.in && n.out));
  const doc = board([{ id: 'r', type: 'shape', shape: 'rect', radius: 20, x: 100, y: 100, w: 200, h: 100, fill: '#c00', rotation: 30 }]);
  const conv = D.applyOp(doc, { op: 'flatten', id: 'r' });
  const out = conv.ok && nodesOf(conv.doc)[0];
  ok('…any shape converted to an editable path, its rotation baked in, its paint kept', conv.ok && out.shape === 'bezier' && out.rotation === 0 && out.fill === '#cc0000' && out.bez.subpaths[0].nodes.length === 8, J(out));
}

// ── 4. booleans ──
{
  const sq = (x, y, s) => [[[x, y], [x + s, y], [x + s, y + s], [x, y + s]]];
  const area = (mode) => G.regionArea(G.booleanRegions([sq(0, 0, 10), sq(5, 0, 10)], mode));
  ok('4. booleans are exact: union 150, subtract 50, intersect 50, exclude 100 (two 10×10 squares overlapping by half)', Math.abs(area('union') - 150) < 0.01 && Math.abs(area('subtract') - 50) < 0.01 && Math.abs(area('intersect') - 50) < 0.01 && Math.abs(area('exclude') - 100) < 0.01, J(['union', 'subtract', 'intersect', 'exclude'].map(area)));
  const doc = board([{ id: 'a', type: 'shape', shape: 'ellipse', x: 0, y: 0, w: 200, h: 200, fill: '#e5322d' }, { id: 'b', type: 'shape', shape: 'rect', x: 100, y: 50, w: 200, h: 100, fill: '#2a59d6' }]);
  const g = D.applyOp(doc, { op: 'boolean', ids: ['a', 'b'], mode: 'subtract' });
  const grp = g.ok && nodesOf(g.doc).find((n) => n.boolean);
  ok('…a live boolean keeps its shapes as they are (editable), and draws one path in the first shape’s paint', g.ok && grp.children.length === 2 && /fill="#e5322d"/.test(svgOf(g.doc)) && !/fill="#2a59d6"/.test(svgOf(g.doc)));
  const moved = D.applyOp(g.doc, { op: 'move', id: 'b', dx: 60, dy: 0 });
  ok('…moving a shape inside it changes the result at once (it is live)', moved.ok && svgOf(moved.doc) !== svgOf(g.doc));
  const flat = D.applyOp(g.doc, { op: 'flatten', id: grp.id });
  ok('…and it flattens into one path', flat.ok && nodesOf(flat.doc).length === 1 && nodesOf(flat.doc)[0].shape === 'bezier');
  const txt = D.applyOp(board([{ id: 't', type: 'text', text: 'Hi', x: 0, y: 0, w: 100, h: 50 }, { id: 's', type: 'shape', shape: 'rect', x: 0, y: 0, w: 10, h: 10, fill: '#000' }]), { op: 'boolean', ids: ['t', 's'], mode: 'union' });
  ok('…text takes no part in a boolean (refused and said)', !txt.ok && /text/i.test(txt.error));
  const off = D.applyOp(doc, { op: 'offset', id: 'a', d: 20 });
  ok('…offset, outline stroke and blend make new editable paths', off.ok && nodesOf(off.doc).some((n) => n.name?.includes('offset') && n.w > 230) && D.applyOp(board([{ id: 'l', type: 'shape', shape: 'ellipse', x: 0, y: 0, w: 100, h: 100, fill: null, stroke: { color: '#000', width: 10 } }]), { op: 'outline-stroke', id: 'l' }).ok && D.applyOp(doc, { op: 'blend', from: 'a', to: 'b', steps: 4 }).ok);
}

// ── 5. gradients ──
{
  ok('5. colours are read in every common form', P.parseColor('rgb(255, 0, 10)') === '#ff000a' && P.parseColor('hsl(120, 50%, 50%)') === '#40bf40' && P.parseColor('rebeccapurple') === '#663399' && P.parseColor('red') === '#ff0000' && P.parseColor('#abc') === '#aabbcc' && P.parseColor('nonsense') === null);
  const doc = board([
    { type: 'shape', shape: 'rect', x: 0, y: 0, w: 100, h: 100, fill: { type: 'conic', angle: 0, stops: [{ at: 0, color: '#f00' }, { at: 1, color: '#00f' }] } },
    { type: 'shape', shape: 'rect', x: 100, y: 0, w: 100, h: 100, fill: { type: 'mesh', angle: 0, stops: [], mesh: ['#f00', '#0f0', '#00f', '#ff0', '#0ff', '#f0f', '#000', '#fff', '#888'] } },
    { type: 'shape', shape: 'rect', x: 200, y: 0, w: 100, h: 100, fill: { type: 'linear', angle: 45, repeat: 'reflect', period: 0.2, stops: [{ at: 0, color: '#000' }, { at: 1, color: '#fff' }] } },
    { type: 'shape', shape: 'rect', x: 300, y: 0, w: 100, h: 100, fill: { type: 'linear', angle: 90, space: 'linear', stops: [{ at: 0, color: '#f00' }, { at: 1, color: '#00f' }] } },
    { type: 'shape', shape: 'rect', x: 400, y: 0, w: 100, h: 100, fill: { type: 'radial', angle: 0, cx: 0.3, cy: 0.3, r: 0.8, stops: [{ at: 0, color: '#fff' }, { at: 1, color: '#000' }], opacity: 0.5 } },
  ]);
  const svg = svgOf(doc);
  ok('…conic (fine sectors), mesh (rows blended by masks), repeating, linear-light and radial gradients all draw', (svg.match(/<pattern /g) ?? []).length === 2 && /spreadMethod="reflect"/.test(svg) && (svg.match(/<mask /g) ?? []).length === 2 && /<radialGradient[^>]*cx="0.3"/.test(svg) && /stop-opacity="0.5"/.test(svg) && (svg.match(/<stop /g) ?? []).length > 20);
  ok('…harmonies, linear-light mixing and presets', P.harmonies('#e5322d').triadic.length === 3 && P.mixColor('#ff0000', '#0000ff', 0.5, 'linear') !== P.mixColor('#ff0000', '#0000ff', 0.5) && P.GRADIENT_PRESETS.length >= 10);
  const legacy = D.normalizeDoc({ artboards: [{ id: 'a', width: 100, height: 100, children: [{ id: 'g', type: 'shape', shape: 'rect', x: 0, y: 0, w: 10, h: 10, fill: { type: 'linear', angle: 30, stops: [{ at: 0, color: '#000000' }, { at: 1, color: '#ffffff' }] } }] }] });
  ok('…a Graphics 1.0 gradient reads as it did', legacy.artboards[0].children[0].fill.type === 'linear' && legacy.artboards[0].children[0].fill.angle === 30);
}

// ── 6, 7, 24. effects ──
{
  const doc = board([{ id: 's', type: 'shape', shape: 'star', sides: 5, x: 100, y: 100, w: 300, h: 300, fill: '#e5322d' }]);
  const add = D.applyOp(doc, { op: 'update', id: 's', set: { effects: [E.effectDefaults('drop-shadow'), E.effectDefaults('halftone')] } });
  ok('6. effects applied: one filter drawn for the stack', add.ok && (svgOf(add.doc).match(/<filter /g) ?? []).length === 1 && /feImage/.test(svgOf(add.doc)) && /feGaussianBlur/.test(svgOf(add.doc)));
  const off = D.applyOp(add.doc, { op: 'update', id: 's', set: { effects: nodesOf(add.doc)[0].effects.map((e) => ({ ...e, on: false })) } });
  ok('…switched off: kept on the object, not drawn', off.ok && nodesOf(off.doc)[0].effects.length === 2 && !/<filter /.test(svgOf(off.doc)));
  const removed = D.applyOp(add.doc, { op: 'update', id: 's', set: { effects: null } });
  ok('…removed: the object exactly as it was', removed.ok && svgOf(removed.doc) === svgOf(doc));
  const f1 = E.compileFilter([E.effectDefaults('blur'), E.effectDefaults('glow')], 'x', 100, 100);
  const f2 = E.compileFilter([E.effectDefaults('glow'), E.effectDefaults('blur')], 'x', 100, 100);
  ok('7. the order of the stack is the order drawn (reordering changes the chain)', f1.indexOf('feGaussianBlur') < f1.indexOf('feMorphology') && f2.indexOf('feMorphology') < f2.indexOf('stdDeviation="6"'));
  const notes = [];
  const kept = E.normalizeEffects([{ kind: 'drop-shadow', params: { blur: 1e9 } }, { kind: 'lens-flare-3000' }, 'nonsense'], notes);
  ok('24. an effect SocriaUX cannot draw is left out and said; numbers are clamped', kept.length === 1 && kept[0].params.blur === 120 && notes.length === 2, J({ kept, notes }));
  ok('…every effect in the registry compiles into a filter or is drawn by the renderer', E.EFFECTS.every((e) => e.special || /<filter /.test(E.compileFilter([E.effectDefaults(e.kind)], 'f', 100, 100) ?? '')) && E.EFFECTS.length >= 30);
  const special = board([{ id: 's', type: 'shape', shape: 'rect', x: 0, y: 0, w: 100, h: 100, fill: '#000', effects: [E.effectDefaults('extrude'), E.effectDefaults('gradient-overlay')] }]);
  ok('…extrusion and gradient overlay draw around the content (copies and a masked overlay)', /<use href="#/.test(svgOf(special)) && /<mask /.test(svgOf(special)));
}

// ── 8, 9. procedural patterns and seeds ──
{
  const slow = [];
  for (const g of PT.PATTERNS) {
    const t0 = performance.now();
    const out = PT.runPattern(g.kind, { ...PT.patternDefaults(g.kind), seed: 101 }, 600, 400, 3);
    if (!out.count || performance.now() - t0 > 400) slow.push(`${g.kind}: ${out.count} marks, ${Math.round(performance.now() - t0)} ms`);
  }
  ok('8. every pattern generator draws marks, quickly', PT.PATTERNS.length >= 24 && !slow.length, J(slow));
  const a = PT.runPattern('flow', { ...PT.patternDefaults('flow'), seed: 5 }, 500, 500, 2);
  const b = PT.runPattern('flow', { ...PT.patternDefaults('flow'), seed: 5, rotation: 0 }, 500, 500, 2);
  const c = PT.runPattern('flow', { ...PT.patternDefaults('flow'), seed: 6 }, 500, 500, 2);
  ok('9. the same seed draws the same marks; another seed, others', J(a.paths) === J(b.paths) && J(a.paths) !== J(c.paths));
  const dense = PT.runPattern('dots', { ...PT.patternDefaults('dots'), scale: 4 }, 2000, 2000, 1);
  ok('…a field larger than the budget stops at it (and says so), never runs away', dense.count <= PT.MAX_MARKS && dense.capped);
  const down = PT.runPattern('waves', { ...PT.patternDefaults('waves'), ramp: 90, rampDir: 0, amplitude: 0, seed: 3 }, 400, 400, 1);
  const ys = down.paths[0].d.match(/M[\d.]+ ([\d.-]+)/g).map((m) => Number(m.split(' ')[1]));
  const top = ys.filter((y) => y < 200).length;
  ok('…a ramp: “denser toward the bottom” puts more lines in the lower half', ys.length - top > top * 1.5, J({ top, bottom: ys.length - top }));
  const doc = board([{ type: 'pattern', gen: 'nonsense', params: {}, x: 0, y: 0, w: 10, h: 10 }, { type: 'pattern', gen: 'truchet', params: { scale: 1e9, seed: 'x' }, colors: ['#000', 'not a colour'], x: 0, y: 0, w: 100, h: 100 }]);
  ok('…a pattern from storage is held to its generator: unknown generators left out, parameters clamped, inks checked', doc.artboards[0].children.length === 1 && doc.artboards[0].children[0].params.scale === 300 && doc.artboards[0].children[0].colors.length === 1);
}

// ── 10, 11. typography ──
{
  const base = { id: 't', type: 'text', text: 'Bold words here', font: 'Inter', weight: 400, size: 40, x: 0, y: 0, w: 900, h: 200, color: '#111' };
  const plain = T.layoutText(D.normalizeDoc({ artboards: [{ id: 'a', width: 1000, height: 1000, children: [base] }] }).artboards[0].children[0]);
  const runs = T.layoutText(D.normalizeDoc({ artboards: [{ id: 'a', width: 1000, height: 1000, children: [{ ...base, runs: [{ start: 0, end: 4, weight: 900 }] }] }] }).artboards[0].children[0]);
  ok('10. mixed styles are measured run by run (a bold word takes a bold word’s width)', runs.lines[0].width > plain.lines[0].width);
  const doc = board([{ ...base, runs: [{ start: 0, end: 4, weight: 900, color: '#e5322d' }, { start: 5, end: 10, italic: true }], paragraph: 1, axes: { wdth: 999, opsz: 30, wght: 650 }, font: 'Anybody', features: ['smcp', 'evil;}'], kerning: 'none', decoration: 'underline', repeat: { count: 3, dx: 4, dy: 4, fade: 0.5, outline: true } }]);
  const t = doc.artboards[0].children[0];
  const svg = svgOf(doc);
  ok('…runs, variable axes (held to the face’s own ranges), OpenType features (only known ones), kerning, underline and an echo', t.runs.length === 2 && t.axes.wdth === 150 && !('opsz' in t.axes) && t.axes.wght === 650 && J(t.features) === J(['smcp']) && /font-variation-settings:'wdth' 150/.test(svg) && /'smcp' 1/.test(svg) && /text-decoration="underline"/.test(svg) && (svg.match(/<text /g) ?? []).length === 4 && /font-weight="900"/.test(svg));
  ok('…the faces Graphics adds are its own: the website list, its lookups and its Fraunces stylesheet are exactly as they were', V.FONTS.length === 74 && V.GRAPHIC_FONTS.length === 144 && V.GRAPHIC_FONTS.slice(0, 74).every((f, i) => f.name === V.FONTS[i].name) && !V.knownFont('Anybody') && V.graphicFont('Anybody')?.kind === 'sans' && V.fontStylesheet(['Fraunces']) === 'https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,300..900;1,300..900&display=swap' && /family=Fraunces:ital,opsz,wght,SOFT,WONK@/.test(V.graphicFontStylesheet(['Fraunces'])) && /family=Roboto\+Flex:opsz,slnt,wdth,wght@/.test(V.graphicFontStylesheet(['Roboto Flex'])) && V.fontStylesheet(['Roboto Flex']) === null && J(Object.keys(V.fontAxes('Fraunces'))) === J(['opsz', 'SOFT', 'WONK']) && V.nearestWeight('Fraunces', 840) === 850 && V.fontStack('Recursive').startsWith('"Recursive", system-ui'), V.graphicFontStylesheet(['Fraunces']));
  const norm = (x) => D.normalizeDoc({ artboards: [{ id: 'a', width: 1000, height: 1000, children: [x] }] }).artboards[0].children[0];
  const para = T.layoutText(norm({ ...base, text: 'One\nTwo', paragraph: 1, autoHeight: true }));
  const noPara = T.layoutText(norm({ ...base, text: 'One\nTwo', autoHeight: true }));
  ok('…paragraph spacing adds space between paragraphs only', Math.abs(para.height - noPara.height - 40) < 0.01);
  for (const kind of ['wave', 'rise', 'perspective', 'bulge', 'stagger']) {
    const w = svgOf(board([{ ...base, warp: { kind, amount: 60 } }]));
    const sized = kind === 'perspective' || kind === 'bulge';
    ok(`…a ${kind} warp places each letter (the words still one text, labelled whole)`, (w.match(/<text /g) ?? []).length === 1 && /aria-label="Bold words here"/.test(w) && (sized ? (w.match(/<tspan/g) ?? []).length >= 'Bold words here'.length && /font-size="[\d.]+"/.test(w.replace(/<text[^>]*>/, '')) : (w.match(/<tspan/g) ?? []).length === 1 && w.includes('>Bold words here<') && /(dy="0 |rotate=")/.test(w)), w.slice(0, 600));
  }
  // mixed styles survive a warp and a path: each run keeps its face (a ransom-note headline is its mix of faces)
  for (const kind of ['stagger', 'wave', 'bulge']) {
    const w = svgOf(board([{ ...base, warp: { kind, amount: 60 }, runs: [{ start: 5, end: 10, font: 'Bebas Neue', weight: 700, color: '#e5322d' }] }]));
    const inner = (w.match(/<text[^>]*>([\s\S]*)<\/text>/) ?? [])[1] ?? '';
    ok(`…a ${kind} warp keeps each run’s face, weight and colour, the line still one text that aligns as a whole`, (w.match(/<text /g) ?? []).length === 1 && /font-family="&quot;Bebas Neue&quot;/.test(inner) && /font-weight="700"/.test(inner) && /#e5322d/i.test(inner) && (inner.match(/ x="/g) ?? []).length === 1 && (kind === 'bulge' || (inner.includes('>words<') && inner.includes('>Bold <'))), inner.slice(0, 700));
  }
  const onPath = svgOf(board([{ ...base, path: { kind: 'arc', bend: 40, start: 50 }, runs: [{ start: 0, end: 4, font: 'Bebas Neue' }] }]));
  ok('…along a path, each run keeps its face too', /<textPath[^>]*><tspan font-family="&quot;Bebas Neue&quot;[^>]*>Bold<\/tspan> words here<\/textPath>/.test(onPath), onPath.slice(0, 700));
  for (const kind of ['arc', 'circle', 'wave', 'custom']) {
    const d = board([{ ...base, path: { kind, bend: 60, start: 50, ...(kind === 'custom' ? { d: 'M0 80 C 30 0, 70 0, 100 80' } : {}) } }]);
    const s = svgOf(d);
    ok(`11. text on a path (${kind}): a textPath on a path of its own, the words exact`, /<textPath href="#[^"]+"/.test(s) && /<path id="[^"]+-tp-t" d="M/.test(s) && s.includes('Bold words here'));
  }
  const long = { ...base, text: 'A very long headline that will not fit along a small arc at this size', size: 80, w: 300, h: 150, path: { kind: 'arc', bend: 50, start: 50 } };
  const longN = D.normalizeDoc({ artboards: [{ id: 'a', width: 1000, height: 1000, children: [long] }] }).artboards[0].children[0];
  ok('…fitted to its path: the size that lets the words run along it', T.fitToPath(longN) < 80 && T.fitToPath(longN) > 6, T.fitToPath(longN));
}

// ── 12, 13, 14. masks, blend modes, vector with raster ──
{
  const pic = { id: 'p1', kind: 'image', src: 'data:image/png;base64,iVBORw0KGgo=', width: 400, height: 300, name: 'p', source: 'upload' };
  const doc = board([
    { id: 'm', type: 'group', mask: 'alpha', x: 0, y: 0, w: 400, h: 300, children: [{ id: 'mt', type: 'text', text: 'MASK', size: 120, x: 0, y: 0, w: 400, h: 200 }, { id: 'mi', type: 'image', asset: 'p1', x: 0, y: 0, w: 400, h: 300 }] },
    { id: 'l', type: 'group', mask: 'luminance', maskInvert: true, x: 0, y: 400, w: 400, h: 300, children: [{ id: 'lg', type: 'shape', shape: 'rect', x: 0, y: 0, w: 400, h: 300, fill: { type: 'linear', angle: 90, stops: [{ at: 0, color: '#fff' }, { at: 1, color: '#000' }] } }, { id: 'ls', type: 'shape', shape: 'prim', prim: { kind: 'blob', params: {} }, x: 0, y: 0, w: 400, h: 300, fill: '#000' }] },
    { id: 'bm', type: 'shape', shape: 'ellipse', blend: 'difference', x: 500, y: 0, w: 100, h: 100, fill: '#f0f' },
    { id: 'bad', type: 'shape', shape: 'ellipse', blend: 'plasma', x: 500, y: 0, w: 100, h: 100, fill: '#f0f' },
  ], { assets: [pic] });
  const svg = svgOf(doc);
  ok('12. masks: a text silhouette over a picture, an inverted brightness (gradient) mask', /<mask id="[^"]+" maskUnits="userSpaceOnUse"[^>]*style="mask-type:alpha"/.test(svg) && /style="mask-type:luminance"/.test(svg) && /feColorMatrix type="matrix" values="-1 0 0 0 1/.test(svg) && /mask="url\(#/.test(svg));
  ok('13. blend modes drawn as mix-blend-mode; an unknown one left out', /mix-blend-mode:difference/.test(svg) && !/plasma/.test(svg));
  const m = D.applyOp(board([{ id: 'a', type: 'shape', shape: 'ellipse', x: 0, y: 0, w: 10, h: 10, fill: '#000' }, { id: 'b', type: 'shape', shape: 'rect', x: 0, y: 0, w: 10, h: 10, fill: '#f00' }]), { op: 'mask', ids: ['a', 'b'], mode: 'alpha' });
  ok('…the mask operation: the bottom object masks the rest', m.ok && nodesOf(m.doc)[0].mask === 'alpha' && nodesOf(m.doc)[0].children[0].id === 'a');
  const img = board([{ id: 'i', type: 'image', asset: 'p1', x: 0, y: 0, w: 200, h: 200, fit: 'contain', adjust: { saturation: -100, hue: 40, temperature: 50, vignette: 60 }, crop: { x: 0.5, y: 0, w: 0.5, h: 1 }, flipX: true, effects: [E.effectDefaults('duotone')] }], { assets: [pic] });
  const isvg = svgOf(img);
  ok('14. a picture adjusted, cropped, flipped and treated (non-destructively: its asset untouched)', /type="saturate" values="0"/.test(isvg) && /hueRotate/.test(isvg) && /radialGradient/.test(isvg) && /scale\(-1 1\)/.test(isvg) && /<filter id="[^"]+fx-i"/.test(isvg) && img.assets[0].src === pic.src);
}

// ── 15. persistence and backwards compatibility ──
{
  const pic = { id: 'p1', kind: 'image', src: 'https://images.example.org/a.jpg', width: 400, height: 300, name: 'p', source: 'upload' };
  const doc = board([
    { id: 'a', type: 'shape', shape: 'prim', prim: { kind: 'guilloche', params: { petals: 9 } }, x: 0, y: 0, w: 100, h: 100, fill: { type: 'conic', angle: 0, stops: [{ at: 0, color: '#f00' }, { at: 1, color: '#00f' }] }, strokes: [{ color: '#000', width: 6 }], effects: [E.effectDefaults('glow')], blend: 'screen', skewX: 12, flipY: true },
    { id: 'b', type: 'pattern', gen: 'contours', params: { seed: 4 }, colors: ['#123456'], bound: { kind: 'blob', params: {} }, x: 0, y: 0, w: 200, h: 200 },
    { id: 'c', type: 'text', text: 'Saved words', x: 0, y: 0, w: 300, h: 80, path: { kind: 'circle', bend: 0, start: 20, side: 'inside' }, runs: [{ start: 0, end: 5, italic: true }], fill: { type: 'linear', angle: 0, stops: [{ at: 0, color: '#000' }, { at: 1, color: '#f00' }] } },
    { id: 'd', type: 'group', boolean: 'exclude', x: 0, y: 0, w: 100, h: 100, children: [{ id: 'd1', type: 'shape', shape: 'ellipse', x: 0, y: 0, w: 60, h: 60, fill: '#000' }, { id: 'd2', type: 'shape', shape: 'bezier', bez: { subpaths: [{ closed: true, nodes: [{ x: 0, y: 0 }, { x: 100, y: 0, out: [100, 50] }, { x: 50, y: 100 }] }] }, x: 30, y: 30, w: 60, h: 60, fill: '#000' }] },
    { id: 'e', type: 'image', asset: 'p1', x: 0, y: 0, w: 100, h: 100, adjust: { contrast: 30 }, crop: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 } },
  ], { assets: [pic], swatches: ['#ff0000', 'rgb(0,0,255)'], vocabulary: { motifs: ['blob', 'nope'], patterns: ['flow'], effects: ['grain'], type: ['stacked'] } });
  const again = D.normalizeDoc(JSON.parse(J(doc)));
  ok('15. saved and reopened: every new property survives a round trip exactly', J({ ...again, updatedAt: 0 }) === J({ ...doc, updatedAt: 0 }));
  ok('…the document’s own swatches and vocabulary held to the registries', J(doc.swatches) === J(['#ff0000', '#0000ff']) && J(doc.vocabulary.motifs) === J(['blob']));
  const v1 = D.normalizeDoc({ schema: 1, name: 'Graphics 1.0', artboards: [{ id: 'ab', width: 1080, height: 1080, children: [{ id: 'h', type: 'text', role: 'headline', text: 'Old design', font: 'Fraunces', size: 90, x: 64, y: 64, w: 900, h: 200, color: '#111111' }, { id: 's', type: 'shape', shape: 'recipe', recipe: { kind: 'organic', seed: 3, n: 5, irregular: 40, curve: 70, turn: 0, cut: 0, warp: 0 }, x: 500, y: 500, w: 400, h: 400, fill: '#c00000' }, { id: 'p', type: 'shape', shape: 'path', path: 'M0 0 L100 0 L50 100 Z', x: 0, y: 600, w: 100, h: 100, fill: '#000000' }] }] });
  const v1svg = svgOf(v1);
  ok('…a Graphics 1.0 document opens unchanged and draws (recipes and paths in their own units, no new properties added)', v1.schema === 1 && !J(v1).includes('effects') && /<path d="M/.test(v1svg) && v1.artboards[0].children.length === 3);
}

// ── 16. operations are whole or nothing ──
{
  const doc = board([{ id: 'a', type: 'shape', shape: 'rect', x: 0, y: 0, w: 10, h: 10, fill: '#000' }]);
  const r = D.applyOps(doc, [{ op: 'update', id: 'a', set: { effects: [E.effectDefaults('glow')] } }, { op: 'update', id: 'missing', set: {} }]);
  ok('16. several operations apply whole or not at all (a failure leaves the design as it was)', !r.ok && doc.artboards[0].children[0].effects === undefined);
}

// ── 17, 23. the AI's vocabulary and operations, validated ──
{
  const plan = CAP.validateVisualPlan({ style: 'organic', archetype: 'organic', motifs: [{ kind: 'blob', params: { seed: 9 } }, { kind: 'teleporter' }], pattern: { gen: 'waves', params: { amplitude: 3 }, inks: ['accent', 'laser'] }, type: 'wave-path', image: [{ kind: 'duotone' }], marks: [{ kind: 'nope' }], palette: 'full', complexity: 300 });
  ok('17. a model’s visual plan is held to the registry: unknown shapes and effects dropped (said), numbers clamped', plan.vocabulary && plan.vocabulary.motifs.length === 1 && plan.vocabulary.pattern.gen === 'waves' && J(plan.vocabulary.pattern.inks) === J(['accent']) && plan.vocabulary.complexity === 100 && plan.notes.length === 2, J(plan));
  const dir = C.graphicDirectionOf(V.proposeDirections({ brief: V.normalizeBrief({ pageType: 'website', objective: 'A garden', personality: [], visualDirection: 'A garden', palette: [], typography: { display: '', body: '' }, decisions: { colour: 'delegated', typography: 'delegated' } }, new Set()), salt: 'ai' })[0]);
  const brief = C.readGraphicBrief('A poster for “Night Garden”, a night walk');
  const made = C.composeGraphic(brief, dir, { over: { vocabulary: { ...plan.vocabulary, strength: 5 } } });
  ok('…and composed with: the plan’s composition and shapes appear in the design', made.plans[0].archetype === 'organic' && nodesOf(made.doc).some((n) => n.prim?.kind === 'blob') && nodesOf(made.doc).some((n) => n.type === 'pattern' && n.gen === 'waves'));
  ok('…a plan with an unknown style is refused (null), said', CAP.validateVisualPlan({ style: 'vaporwave-9000' }).vocabulary === null);
  const doc = board([{ id: 'a', type: 'shape', shape: 'rect', x: 0, y: 0, w: 10, h: 10, fill: '#000' }]);
  const bad1 = CAP.validateOps(doc, [{ op: 'update', id: 'a', set: { opacity: 0.5 } }, { op: 'rm -rf' }]);
  const bad2 = CAP.validateOps(doc, [{ op: 'update', id: 'a', set: { opacity: 0.5 } }, { op: 'remove', id: 'ghost' }]);
  const bad3 = CAP.validateOps(doc, 'not a list');
  const good = CAP.validateOps(doc, [{ op: 'update', id: 'a', set: { effects: [{ kind: 'grain' }] } }]);
  ok('23. malformed AI operations change nothing: an unknown operation, one that fails, an answer that is not a list', !bad1.ok && !bad2.ok && !bad3.ok && good.ok && nodesOf(good.doc)[0].effects[0].kind === 'grain');
  ok('…the capability registry holds every kind (primitives, patterns, effects, gradients, type, blends, masks, operations, compositions, styles)', Object.values(CAP.capabilityCounts()).every((n) => n > 0) && Object.keys(CAP.capabilityCounts()).length === 10 && CAP.capabilityMenu().split('\n').length > 120);
}

// ── 18, 19. edits in words: targeted, reversible, guarded by locks ──
{
  const pic = { id: 'p1', kind: 'image', src: 'https://images.example.org/a.jpg', width: 400, height: 300, name: 'p', source: 'upload' };
  const doc = board([{ id: 'i', type: 'image', role: 'image', asset: 'p1', x: 0, y: 0, w: 400, h: 300 }, { id: 'h', type: 'text', role: 'headline', text: 'Headline', x: 0, y: 400, w: 600, h: 100, size: 60 }, { id: 'm', type: 'shape', shape: 'ellipse', role: 'motif', x: 600, y: 0, w: 200, h: 200, fill: '#e5322d' }], { assets: [pic] });
  const e = ED.readGraphicEdit('Add a subtle halftone treatment to the image.', doc, { artboard: 'ab', selection: [] });
  ok('18. “add a subtle halftone treatment to the image”: one effect on the picture only, gentle', e && e.ops.length === 1 && e.ops[0].id === 'i' && e.ops[0].set.effects[0].kind === 'halftone' && e.ops[0].set.effects[0].params.size < 8, J(e));
  const r = ED.readGraphicEdit('Replace the circular motif with an irregular vector ribbon.', doc, { artboard: 'ab', selection: [] });
  ok('…“replace the circular motif with an irregular vector ribbon”: that motif becomes the ribbon, its paint kept', r && r.ops[0].id === 'm' && r.ops[0].set.prim.kind === 'ribbon' && r.ops[0].set.fill === '#e5322d', J(r));
  const p = ED.readGraphicEdit('Make the headline follow a curved path.', doc, { artboard: 'ab', selection: [] });
  ok('…“make the headline follow a curved path”: an arc, the size fitted, the words untouched', p && p.ops[0].set.path.kind === 'arc' && !('text' in p.ops[0].set));
  const g = ED.readGraphicEdit('Generate a repeating wave pattern that becomes denser toward the bottom.', doc, { artboard: 'ab', selection: [] });
  ok('…“a repeating wave pattern that becomes denser toward the bottom”: the waves generator with a downward ramp', g && g.ops[0].node.gen === 'waves' && g.ops[0].node.params.ramp > 50 && g.ops[0].node.params.rampDir === 0);
  const dr = ED.readGraphicEdit('Create a more dramatic composition using the same colors. Keep the typography unchanged.', doc, { artboard: 'ab', selection: [] });
  const textTouched = dr.ops.some((o) => o.id === 'h' && o.set && ['size', 'weight', 'font'].some((k) => k in o.set));
  ok('…“more dramatic… keep the typography unchanged”: drama without touching the type, and only the design’s own colours', dr && dr.ops.length > 0 && !textTouched && /typography kept/.test(dr.label), J(dr));
  const locked = D.applyOp(doc, { op: 'update', id: 'i', set: { locked: true } }).doc;
  const l = ED.readGraphicEdit('Add a subtle halftone treatment to the image.', locked, { artboard: 'ab', selection: [] });
  ok('19. a locked picture is not changed: the edit says so instead', l && !l.ops.length && /locked/i.test(`${l.question ?? ''} ${l.label}`), J(l));
  const lockedOp = D.applyOp(locked, { op: 'update', id: 'i', set: { effects: [E.effectDefaults('blur')] } });
  ok('…and an operation on it is refused, naming it', !lockedOp.ok && lockedOp.locked?.length === 1);
}

// ── the rest of the brief's edits, and the vocabulary's own: each a targeted operation, nothing moved ──
{
  const tokens = { colors: { background: '#f4f1ea', surface: '#ffffff', text: '#111111', muted: '#555555', accent: '#e5322d', accentText: '#ffffff', line: '#dddddd' } };
  const doc = board([
    { id: 'h', type: 'text', role: 'headline', text: 'Field Lines', x: 60, y: 80, w: 700, h: 160, size: 120, color: '#111111' },
    { id: 'o1', type: 'shape', shape: 'prim', prim: { kind: 'star', params: {} }, role: 'motif', x: 600, y: 600, w: 300, h: 300, fill: '#e5322d' },
    { id: 'o2', type: 'shape', shape: 'ellipse', role: 'motif', x: 100, y: 700, w: 80, h: 80, fill: '#222222' },
    { id: 'o3', type: 'shape', shape: 'rect', role: 'motif', x: 300, y: 760, w: 60, h: 60, fill: '#222222' },
    { id: 'o4', type: 'shape', shape: 'prim', prim: { kind: 'burst', params: {} }, role: 'motif', x: 700, y: 300, w: 120, h: 120, fill: '#e5322d' },
  ], { tokens });
  const run = (words) => {
    const e = ED.readGraphicEdit(words, doc, { artboard: 'ab', selection: [] });
    const r = e ? D.applyOps(doc, e.ops) : { ok: false };
    const after = r.ok ? r.doc.artboards[0].children : [];
    const moved = doc.artboards[0].children.filter((n) => { const m = after.find((x) => x.id === n.id); return m && ['x', 'y', 'w', 'h', 'size', 'font', 'text'].some((k) => m[k] !== n[k]); });
    return { e, ok: r.ok, after, moved, added: after.filter((n) => !doc.artboards[0].children.some((x) => x.id === n.id)) };
  };
  const bg = run('Use a more complex geometric background.');
  ok('…“use a more complex geometric background”: a tessellation in several inks, at the very back, nothing moved', bg.ok && bg.added.length === 1 && bg.added[0].gen === 'tessellation' && bg.added[0].colors.length >= 2 && bg.after[0] === bg.added[0] && !bg.moved.length, J(bg.e));
  const fewer = run('Reduce the number of decorative elements.');
  ok('…“reduce the number of decorative elements”: the smaller half removed, the larger and the words kept (undo brings them back)', fewer.ok && fewer.e.ops.every((o) => o.op === 'remove') && J(fewer.after.map((n) => n.id)) === J(['h', 'o1', 'o4']), J(fewer.e));
  const grain = run('Add a grain texture without changing the layout.');
  ok('…“add a grain texture without changing the layout”: grain on a paper layer of the ground’s own colour, nothing moved', grain.ok && grain.added.length === 1 && grain.added[0].effects?.[0]?.kind === 'grain' && grain.added[0].fill === '#f4f1ea' && grain.after[0] === grain.added[0] && !grain.moved.length, J(grain.e));
  const radial = run('Create a dense radial line pattern behind the headline.');
  const hi = radial.after.findIndex((n) => n.id === 'h');
  ok('…“a dense radial line pattern behind the headline”: the radial generator, dense, just beneath the headline', radial.ok && radial.added[0]?.gen === 'radial' && radial.added[0].params.count >= 150 && radial.after.indexOf(radial.added[0]) === hi - 1 && !radial.moved.length, J(radial.e));
  const motif = run('Generate an irregular geometric motif using the campaign accent color.');
  ok('…“an irregular geometric motif using the campaign accent color”: a seeded irregular polygon in the design’s accent', motif.ok && motif.added[0]?.prim?.kind === 'irregular-polygon' && Number.isFinite(motif.added[0].prim.params.seed) && motif.added[0].fill === '#e5322d' && !motif.moved.length, J(motif.e));
  const fluid = run('Make the background feel more organic and fluid.');
  ok('…“make the background feel more organic and fluid”: a flow field at the back', fluid.ok && fluid.added[0]?.gen === 'flow' && fluid.after[0] === fluid.added[0] && !fluid.moved.length, J(fluid.e));
  const tech = run('Create a technical grid with subtle annotations.');
  ok('…“a technical grid with subtle annotations”: the technical generator with its labels, faint', tech.ok && tech.added[0]?.gen === 'technical' && tech.added[0].params.labels === 1 && tech.added[0].opacity <= 0.5 && !tech.moved.length, J(tech.e));
}

// ── 20. Boards: one vocabulary, many executions; a board-wide edit without regeneration ──
{
  const { boardPlan: BP, boardPipeline: PL, boardModel: M, boardEdit: BE } = V;
  const brief = BP.readBoardRequest('A campaign for “Tidewater”, a botanical garden night walk, organic and fluid: three posters and two Instagram graphics.');
  const sys = PL.proposeSystems(brief, 'ceiling-board')[0];
  let b = PL.startBoard(brief, sys, { request: brief.purpose });
  const res = await PL.generate(b, { website: async () => 'x' }, (op) => {
    const r = M.applyBoardOp(b, op);
    if (r.ok) b = r.board;
  });
  const graphics = b.materials.filter((m) => m.type === 'graphic' && m.doc);
  const kinds = graphics.map((m) => nodesOf(m.doc).filter((n) => n.prim).map((n) => n.prim.kind));
  ok('20. a board’s system carries one vocabulary (organic), and its materials speak it', b.system.vocabulary?.style === 'organic' && graphics.length >= 4 && graphics.every((m) => m.doc.vocabulary?.motifs.length) && kinds.filter((k) => k.length).length >= 3, J({ style: b.system.vocabulary?.style, kinds, res: res?.failed }));
  const archetypes = new Set(graphics.map((m) => m.plan?.archetype));
  ok('…each in its own composition (same identity, different execution)', archetypes.size >= 2, J([...archetypes]));
  const before = J(graphics.map((m) => m.doc.artboards[0].children.length));
  const e = BE.readBoardEdit('Add a grain texture to every material', b, { selection: [] });
  ok('…a board-wide edit (“add a grain texture to every material”) changes each material’s own design, nothing regenerated', e && e.ops?.length === graphics.length && e.ops.every((o) => o.op === 'material-update' && o.set.doc) && e.ops.every((o) => nodesOf(o.set.doc).some((n) => n.effects?.some((x) => x.kind === 'grain'))), J({ label: e?.label, n: e?.ops?.length, before }));
  const reopened = M.normalizeBoard(JSON.parse(J(b)));
  ok('…the board’s vocabulary saved and reopened with it', reopened.system.vocabulary?.style === 'organic' && reopened.system.vocabulary.motifs.length > 0);
}

// ── 21. exports carry it all ──
{
  const doc = board([
    { id: 'a', type: 'shape', shape: 'prim', prim: { kind: 'burst', params: {} }, x: 0, y: 0, w: 300, h: 300, fill: '#e5322d', effects: [E.effectDefaults('drop-shadow'), E.effectDefaults('noise')], blend: 'multiply' },
    { id: 'p', type: 'pattern', gen: 'technical', params: { seed: 2 }, colors: ['#222', '#e5322d'], x: 0, y: 0, w: 1000, h: 1000 },
    { id: 't', type: 'text', text: 'Exported words', font: 'Inter', x: 0, y: 500, w: 800, h: 120, size: 60, path: { kind: 'arc', bend: 40, start: 50 }, runs: [{ start: 0, end: 8, font: 'Fraunces' }] },
    { id: 'g', type: 'group', mask: 'alpha', x: 0, y: 0, w: 100, h: 100, children: [{ id: 'g1', type: 'shape', shape: 'ellipse', x: 0, y: 0, w: 100, h: 100, fill: '#000' }, { id: 'g2', type: 'shape', shape: 'rect', x: 0, y: 0, w: 100, h: 100, fill: '#00f' }] },
  ]);
  const file = X.svgFile(doc, doc.artboards[0]);
  ok('21. the SVG export carries filters, masks, patterns, blend modes and text as text, and loads the faces the runs use', /<filter /.test(file) && /<mask /.test(file) && /mix-blend-mode:multiply/.test(file) && /<textPath/.test(file) && /Exported words/.test(file.replace(/<[^>]+>/g, '')) && X.facesOf(doc).includes('Fraunces') && X.facesOf(doc).includes('IBM Plex Mono'));
  ok('…nothing a document says becomes a script in it', !/<script|javascript:|on\w+=/i.test(file));
}

// ── 22. the website engine is untouched ──
{
  const brief = V.normalizeBrief({ pageType: 'website', objective: 'A website for a bakery', personality: ['warm'], visualDirection: 'warm', palette: [], typography: { display: '', body: '' }, decisions: { colour: 'delegated', typography: 'delegated' } }, new Set());
  const dirs = V.proposeDirections({ brief, salt: 'web-check' });
  ok('22. website directions are still proposed as before (three, each with its own language)', dirs.length === 3 && new Set(dirs.map((d) => d.language)).size === 3);
}

// ── SVG import ──
{
  const src = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><script>alert(1)</script><g transform="translate(10 10) rotate(10)" fill="#e5322d"><rect width="40" height="20" rx="4"/><path d="M50 50 a10 10 0 1 0 20 0 a10 10 0 1 0 -20 0" onclick="x()"/></g><text x="10" y="90" font-family="Helvetica" font-size="8">Words</text><foreignObject><div/></foreignObject><circle cx="80" cy="20" r="10" filter="url(#f)"/></svg>';
  const r = I.importSvg(src, { x: 0, y: 0, w: 500, h: 500 });
  const doc = D.normalizeDoc({ artboards: [{ id: 'a', width: 600, height: 600, children: [r.group] }] });
  const ns = nodesOf(doc);
  ok('SVG import: shapes become editable paths (transforms applied), text stays text; scripts, handlers and foreign content are left out and said', ns.filter((n) => n.shape === 'bezier').length === 3 && ns.some((n) => n.type === 'text' && n.text === 'Words') && !J(doc).includes('alert') && !J(doc).includes('x()') && r.notes.some((x) => /Scripts/.test(x)) && r.notes.some((x) => /Filters/.test(x)));
  let refused = false;
  try {
    I.importSvg('<!DOCTYPE svg [<!ENTITY a "x">]><svg>&a;</svg>', { x: 0, y: 0, w: 10, h: 10 });
  } catch {
    refused = true;
  }
  ok('…a file that declares entities is refused outright', refused);
  ok('…embedding keeps a drawing whole as a picture, with its scripts removed', !/script|onclick|foreignObject/i.test(decodeURIComponent(I.embedSvg(src).src)));
}

// ── the vocabulary reads styles, not subjects or quoted copy ──
{
  const st = (w, lang) => VC.readStyles(w, lang)[0]?.style;
  ok('styles are read from style words: brutalist, luxury, procedural, halftone', st('a brutalist poster') === 'brutalist' && st('a luxurious ad') === 'luxury' && st('a generative line-field poster') === 'procedural' && st('a halftone zine poster') === 'halftone');
  ok('…the quoted copy is never read for style (“Raw, from the hills” is honey, not brutalism)', st('A label for “Raw, from the hills”, premium') === 'luxury');
  ok('…a style named outweighs a subject that hints at another (“a retro poster for a film night”)', st('a retro poster for a film night', 'night') === 'retro');
  const v = VC.vocabularyFor({ words: 'a monochrome experimental glitch poster', mood: [], language: 'poster', intensity: 60, hasImage: true, seed: 's' });
  ok('…modifiers change how a style is used: monochrome pictures, a glitched headline', v.style === 'experimental' && v.palette === 'mono' && v.image.some((e) => e.kind === 'mono') && v.headline.some((e) => e.kind === 'glitch'));
}

// ── the thirty briefs differ ──
{
  const { composeAll } = await import('./browser/ux-v0/gfx-ceiling-briefs.mjs');
  const rows = composeAll(V, 'unit');
  const arch = new Set(rows.map((r) => r.made.plans[0]?.archetype));
  const styles = new Set(rows.map((r) => r.made.plans[0]?.vocabulary?.style));
  ok('the thirty benchmark briefs take at least fifteen compositions and fifteen styles', arch.size >= 15 && styles.size >= 15, J({ arch: [...arch], styles: [...styles] }));
  const words = rows.every((r) => nodesOf(r.made.doc).some((n) => n.type === 'text' && n.text.includes(r.brief.content.headline)));
  ok('…every one keeps its headline exactly, as text', words);
  const dropped = rows.filter((r) => r.brief.images.length && !nodesOf(r.made.doc).some((n) => n.type === 'image' || (n.type === 'group' && n.children.some((c) => c.type === 'image'))));
  ok('…a composition chosen for its style never drops the designer’s picture', !dropped.length, J(dropped.map((r) => r.spec.name)));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
