// The open kind: whatever the conversation is actually about.
//
// Every other viz kind is a named picture with a builder that knows its
// mathematics. This one knows none — the extractor authors the parts and the
// builder draws them — so the checking that would otherwise live in a builder
// has to live in the sanitizer, and this suite is where that is held.

import {
  sanitizeViz, buildFrame, resolveView, defaults, compileScene,
  VIZ_KINDS, ECON_KINDS, KIND_LABEL, sceneDraws, kindNeedsExpr,
} from './.tmp/logos-viz.mjs';
import { sanitizeMap, buildMapPrompt, LOGOS_CHAT_PROMPT } from './.tmp/logos.mjs';
import { availableLenses, leadLens } from './.tmp/logos-layout.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

const scene = (over = {}) => sanitizeViz({
  kind: 'diagram',
  axes: { x: 'mL of base', y: 'pH' },
  view: { xMin: 0, xMax: 50, yMin: 0, yMax: 14 },
  parts: [
    { o: 'curve', expr: '7 + 3*tanh((x - 25)/4)', tone: 'accent', label: 'titration' },
    { o: 'point', x: 25, y: 7, tone: 'primary', label: 'equivalence' },
    { o: 'hrule', at: 7, tone: 'ghost', dashed: true, label: 'neutral' },
  ],
  title: 'A titration curve',
  ...over,
});

const frameOf = (sc, vals) => {
  const view = resolveView(sc, compileScene(sc));
  return buildFrame(sc, compileScene(sc), { ...defaults(sc), ...(vals || {}) }, view, false);
};

console.log('=== the kind exists and behaves like the object kinds ===');
{
  ok('registered', VIZ_KINDS.includes('diagram'));
  ok('it is not an economics kind', !ECON_KINDS.has('diagram'));
  ok('it has a label', KIND_LABEL.diagram === 'Diagram');
  // Its curves each carry their own expression, so the SCENE has none — and
  // requiring scene.expr would reject every diagram there will ever be.
  ok('needs no scene expression', kindNeedsExpr('diagram') === false);
  const sc = scene();
  ok('a well-formed one survives', !!sc);
  ok('and it draws', sceneDraws(sc) === true);
  ok('the axis names are kept', sc.axes.x === 'mL of base' && sc.axes.y === 'pH');
}

console.log('\n=== a diagram is its parts ===');
{
  ok('no parts, no scene', sanitizeViz({ kind: 'diagram', parts: [] }) === null);
  ok('missing parts, no scene', sanitizeViz({ kind: 'diagram' }) === null);
  // Every part failing its own checks is the same thing as having none: an
  // empty frame with a title takes the panel and says nothing.
  ok('parts that all fail, no scene', sanitizeViz({
    kind: 'diagram',
    parts: [{ o: 'point', x: 'nope!!', y: 1 }, { o: 'nonsense' }, { o: 'region', pts: [{ x: 0, y: 0 }] }],
  }) === null);
  ok('one good part is enough', !!sanitizeViz({ kind: 'diagram', parts: [{ o: 'point', x: 1, y: 2 }] }));
}

console.log('\n=== every primitive round-trips and draws ===');
{
  const all = sanitizeViz({
    kind: 'diagram',
    view: { xMin: -10, xMax: 10, yMin: -10, yMax: 10 },
    parts: [
      { o: 'curve', expr: 'x^2' },
      { o: 'point', x: 1, y: 1 },
      { o: 'segment', x1: 0, y1: 0, x2: 2, y2: 2 },
      { o: 'line', x: 0, y: 0, slope: 1 },
      { o: 'vector', x1: 0, y1: 0, x2: 1, y2: 3 },
      { o: 'region', pts: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }] },
      { o: 'rects', bars: [{ x0: 0, x1: 1, y: 2 }] },
      { o: 'sequence', pts: [{ x: 1, y: 1 }, { x: 2, y: 4 }], stems: true },
      { o: 'vrule', at: 3 },
      { o: 'hrule', at: -3 },
      { o: 'label', x: 0, y: 5, text: 'here' },
    ],
  });
  ok('all eleven survive', all.parts.length === 11, JSON.stringify(all.parts.map((p) => p.o)));
  const f = frameOf(all);
  const kinds = new Set(f.objects.map((o) => o.o));
  for (const o of ['curve', 'point', 'segment', 'line', 'vector', 'region', 'rects', 'sequence', 'vrule', 'hrule', 'label']) {
    ok(`${o} reaches the frame`, kinds.has(o), [...kinds].join(','));
  }
  // Ids are assigned on the way out, so the model can neither collide them
  // nor leave one out.
  const ids = f.objects.map((o) => o.id);
  ok('every object has an id', ids.every(Boolean));
  ok('and no two are the same', new Set(ids).size === ids.length);
}

console.log('\n=== a coordinate may be an expression, which is what makes it live ===');
{
  const sc = sanitizeViz({
    kind: 'diagram',
    view: { xMin: 0, xMax: 10, yMin: 0, yMax: 40 },
    params: [{ id: 'k', min: 1, max: 5, step: 0.5, value: 2 }],
    parts: [
      { o: 'point', x: 'k', y: 'k*k' },
      { o: 'curve', expr: 'k*x' },
      { o: 'vrule', at: 'k' },
    ],
    quantities: [{ tex: 'k^2', expr: 'k*k', help: 'the square of the rate' }],
  });
  ok('the expression coordinates survive', sc.parts[0].x === 'k' && sc.parts[0].y === 'k*k');

  const at2 = frameOf(sc, { k: 2 });
  const p2 = at2.objects.find((o) => o.o === 'point');
  ok('point sits at (2, 4) when k = 2', p2.x === 2 && p2.y === 4, JSON.stringify(p2));
  const r2 = at2.objects.find((o) => o.o === 'vrule');
  ok('and the rule follows it', r2.at === 2);

  const at4 = frameOf(sc, { k: 4 });
  const p4 = at4.objects.find((o) => o.o === 'point');
  ok('moving the slider moves the point', p4.x === 4 && p4.y === 16, JSON.stringify(p4));

  // The curve leans on the slider too — the whole picture is one system.
  const c2 = at2.objects.find((o) => o.o === 'curve');
  const c4 = at4.objects.find((o) => o.o === 'curve');
  const yAt = (c, x) => { const q = c.pts.reduce((b, p) => Math.abs(p.x - x) < Math.abs(b.x - x) ? p : b); return q.y; };
  ok('the curve is steeper at k = 4', yAt(c4, 5) > yAt(c2, 5), `${yAt(c2, 5)} vs ${yAt(c4, 5)}`);

  ok('a quantity is computed live', at2.readouts.find((r) => r.tex === 'k^2').value === '4');
  ok('and recomputed when it moves', at4.readouts.find((r) => r.tex === 'k^2').value === '16');
}

console.log('\n=== a part that cannot be evaluated is dropped, not drawn wrong ===');
{
  const sc = sanitizeViz({
    kind: 'diagram',
    view: { xMin: 0, xMax: 10, yMin: 0, yMax: 10 },
    parts: [
      { o: 'point', x: 1, y: 1 },
      // `z` is not a slider on this scene, so it could only ever be NaN. That
      // is now caught while sanitizing rather than left to vanish at draw
      // time — see the reachability section below.
      { o: 'point', x: 'z', y: 'z' },
      // This one is reachable on paper and still not drawable: nothing is
      // free in it, so only evaluating tells you. It has to survive the
      // static check and be dropped by the builder.
      { o: 'segment', x1: 0, y1: 0, x2: '1/0', y2: 1 },
    ],
  });
  ok('the unreachable part is refused up front', sc.parts.length === 2, JSON.stringify(sc.parts));
  ok('and it is the z one that went', !JSON.stringify(sc.parts).includes('"z"'));
  const f = frameOf(sc);
  const pts = f.objects.filter((o) => o.o === 'point');
  ok('the real point is drawn', pts.length === 1 && pts[0].x === 1);
  ok('and the infinite segment is not', !f.objects.some((o) => o.o === 'segment'));
  ok('nothing non-finite reaches the frame', JSON.stringify(f.objects).includes('null') === false);
  for (const o of f.objects) {
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === 'number') ok(`${o.o}.${k} is finite`, Number.isFinite(v));
    }
  }
}

console.log('\n=== the window is the picture’s own, in the subject’s units ===');
{
  // A titration runs 0–50 mL and 0–14 pH. The default function window would
  // put every part of it off screen.
  const sc = sanitizeViz({
    kind: 'diagram',
    view: { xMin: 0, xMax: 50 },
    parts: [
      { o: 'point', x: 5, y: 2 },
      { o: 'point', x: 45, y: 12 },
    ],
  });
  const v = resolveView(sc, compileScene(sc));
  ok('the window contains the parts', v.xMin <= 5 && v.xMax >= 45 && v.yMin <= 2 && v.yMax >= 12, JSON.stringify(v));
  ok('and is not the -5..5 default', !(v.yMin === -5 && v.yMax === 5), JSON.stringify(v));
  ok('every side is finite', [v.xMin, v.xMax, v.yMin, v.yMax].every(Number.isFinite));
  ok('and it is not inverted', v.xMax > v.xMin && v.yMax > v.yMin);

  // An explicit window is honoured as written — the model asked for it.
  const fixed = sanitizeViz({
    kind: 'diagram', view: { xMin: 0, xMax: 100, yMin: -1, yMax: 1 },
    parts: [{ o: 'point', x: 1, y: 0 }],
  });
  const fv = resolveView(fixed, compileScene(fixed));
  ok('an explicit window is kept', fv.xMin === 0 && fv.xMax === 100 && fv.yMin === -1 && fv.yMax === 1);
}

console.log('\n=== the guard withholds numbers, never the picture ===');
{
  const sc = sanitizeViz({
    kind: 'diagram',
    view: { xMin: 0, xMax: 10, yMin: 0, yMax: 10 },
    params: [{ id: 'k', min: 1, max: 5, step: 1, value: 2 }],
    parts: [{ o: 'point', x: 'k', y: 'k' }],
    quantities: [{ tex: 'k', expr: 'k', help: 'the rate constant' }],
  });
  const view = resolveView(sc, compileScene(sc));
  const guarded = buildFrame(sc, compileScene(sc), defaults(sc), view, true);
  ok('the number is withheld', guarded.readouts[0].value === null);
  ok('but what it IS still shows', guarded.readouts[0].help === 'the rate constant');
  ok('and the picture is still drawn', guarded.objects.some((o) => o.o === 'point'));
}

console.log('\n=== authored words, and sane defaults when there are none ===');
{
  const said = scene({ says: { caption: 'Add base and watch the pH jump.', narration: 'Nearly all of the change happens in 2 mL.', ask: 'Where is the curve steepest, and why there?' } });
  const f = frameOf(said);
  ok('the caption is the model’s', f.caption === 'Add base and watch the pH jump.');
  ok('the narration too', f.narration === 'Nearly all of the change happens in 2 mL.');
  ok('and the question', f.ask === 'Where is the curve steepest, and why there?');

  const bare = frameOf(scene());
  ok('a caption is always present', typeof bare.caption === 'string' && bare.caption.length > 0);
}

console.log('\n=== junk from a model never becomes a picture ===');
{
  const junk = sanitizeViz({
    kind: 'diagram',
    view: { xMin: 0, xMax: 10 },
    parts: [
      { o: 'point', x: 1, y: 1 },
      { o: 'label', x: 0, y: 0 },                       // no text
      { o: 'curve' },                                    // no expr
      { o: 'curve', expr: 'x; drop table' },             // not an expression
      { o: 'region', pts: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }, // two points enclose nothing
      { o: 'label', x: 1, y: 1, text: 'ok', tone: 'chartreuse' }, // unknown tone
      null, 'nope', 42,
    ],
  });
  ok('only the two real parts survive', junk.parts.length === 2, JSON.stringify(junk.parts));
  ok('the unknown tone is dropped, not kept', junk.parts[1].tone === undefined);
  ok('and the scene still draws', frameOf(junk).objects.length >= 2);

  // Bounded: a runaway model must not hand the renderer ten thousand parts.
  const many = sanitizeViz({
    kind: 'diagram', view: { xMin: 0, xMax: 10 },
    parts: Array.from({ length: 500 }, (_, i) => ({ o: 'point', x: i % 10, y: 1 })),
  });
  ok('the part count is capped', many.parts.length <= 40, String(many.parts.length));
  const wide = sanitizeViz({
    kind: 'diagram', view: { xMin: 0, xMax: 10 },
    parts: [{ o: 'region', pts: Array.from({ length: 500 }, (_, i) => ({ x: i, y: i })) }],
  });
  ok('and so is one part’s point count', wide.parts[0].pts.length <= 64, String(wide.parts[0].pts.length));
  const texty = sanitizeViz({
    kind: 'diagram', view: { xMin: 0, xMax: 10 },
    parts: [{ o: 'label', x: 0, y: 0, text: 'z'.repeat(500) }],
  });
  ok('label text is capped', texty.parts[0].text.length <= 48);
}

console.log('\n=== a diagram survives a conversation that is not mathematics ===');
{
  // The whole point of the kind. Chemistry, biology and history are never
  // labelled math by the extractor, and gating the picture on the label
  // would discard exactly the scenes this exists to draw.
  const raw = {
    context: 'learning',
    nodes: [{ id: 'a', type: 'concept', label: 'Equivalence point' }],
    edges: [],
    viz: { kind: 'diagram', view: { xMin: 0, xMax: 50 }, parts: [{ o: 'point', x: 25, y: 7 }] },
  };
  const m = sanitizeMap(raw);
  ok('the scene survives a learning conversation', !!m.viz, 'viz was dropped');
  ok('and it is the diagram', m.viz.kind === 'diagram');

  for (const context of ['analysing', 'researching', 'planning', 'creating', 'deciding']) {
    const mm = sanitizeMap({ ...raw, context });
    ok(`survives ${context}`, !!mm.viz);
  }

  // A maths-only kind in a non-maths conversation is still correctly dropped.
  // A maths-only kind is still dropped outside maths — the gate widened for
  // kinds that carry their own subject, not for every kind.
  const fn = sanitizeMap({ ...raw, viz: { kind: 'function', expr: 'x^2', view: { xMin: -5, xMax: 5 } } });
  ok('but a function in a learning chat is still dropped', !fn.viz, JSON.stringify(fn.viz));
  const inMath = sanitizeMap({ ...raw, context: 'math', viz: { kind: 'function', expr: 'x^2', view: { xMin: -5, xMax: 5 } } });
  ok('and is kept once the work IS maths', !!inMath.viz);
}

console.log('\n=== a diagram is quantitative work, so it gets the diagram tabs ===');
{
  const m = sanitizeMap({
    context: 'learning',
    nodes: [{ id: 'a', type: 'concept', label: 'Equivalence point' }, { id: 'b', type: 'concept', label: 'Buffer region' }],
    edges: [],
    viz: { kind: 'diagram', view: { xMin: 0, xMax: 50 }, parts: [{ o: 'point', x: 25, y: 7 }] },
  });
  const lenses = availableLenses(m);
  ok('Plot is offered', lenses.includes('plot'), lenses.join(','));
  ok('and it leads', leadLens(lenses, !!m.viz) === 'plot');
  // A scene means the work is quantitative, so the concept views stand down.
  ok('no mind map beside a diagram', !lenses.includes('graph') && !lenses.includes('structure'), lenses.join(','));
}

console.log('\n=== the extractor is told the kind exists ===');
{
  const p = buildMapPrompt({ context: null, nodes: [], edges: [], viz: null });
  ok('the kind is in the schema', p.includes('|diagram'));
  ok('parts are described', p.includes('"parts"'));
  ok('so are quantities', p.includes('"quantities"'));
  for (const prim of ['curve', 'path', 'band', 'errorbar', 'callout', 'point', 'segment', 'line', 'vector', 'region', 'rects', 'sequence', 'vrule', 'hrule', 'label']) {
    ok(`${prim} is offered to the extractor`, new RegExp(`\\b${prim}\\b`).test(p), prim);
  }
  ok('and it is told what it is for', /titration|free-body|food web/.test(p));
  ok('and told not to force it', /should not be forced onto them|leave "viz" out/.test(p));
}

console.log('\n=== a curve finds its own variable ===');
{
  // The bug this pins, exactly as it shipped: asked for a predator-prey cycle
  // with a birth-rate slider, the model wrote the curves against t — because
  // the subject is time — while the scene's varName defaulted to x. Every
  // sample came back NaN and both curves silently did not appear, leaving a
  // titled picture with a working slider over blank space.
  const pp = sanitizeViz({
    kind: 'diagram',
    axes: { x: 'time', y: 'population' },
    view: { xMin: 0, xMax: 20, yMin: 0, yMax: 12 },
    params: [{ id: 'b', min: 0.5, max: 2, step: 0.1, value: 1.1 }],
    parts: [
      { o: 'curve', expr: '5 + 3*sin(b*t)', tone: 'accent', label: 'prey' },
      { o: 'curve', expr: '5 + 3*sin(b*t - 1.6)', tone: 'tension', label: 'predator' },
    ],
    title: 'Predator–Prey Cycle',
  });
  ok('the scene survives', !!pp);
  ok('both curves survive', pp.parts.length === 2);
  const f = frameOf(pp);
  const curves = f.objects.filter((o) => o.o === 'curve');
  ok('and BOTH are drawn', curves.length === 2, `${f.objects.length} objects: ${f.objects.map(o=>o.o).join(',')}`);
  ok('with real points on them', curves[0].pts.some((q) => Number.isFinite(q.y)));
  ok('and the caption is not the empty one', !/could not be drawn/.test(f.caption));

  // The slider still drives it, which is the whole reason to draw it.
  const slow = frameOf(pp, { b: 0.5 });
  const fast = frameOf(pp, { b: 2 });
  const sig = (fr) => JSON.stringify(fr.objects.filter((o) => o.o === 'curve')[0].pts.slice(0, 30).map((q) => Math.round(q.y * 100)));
  ok('the birth rate changes the cycle', sig(slow) !== sig(fast));

  // Any letter, not just t — the subject picks the letter.
  for (const v of ['t', 'v', 'q', 'p', 'z']) {
    const sc = sanitizeViz({
      kind: 'diagram', view: { xMin: 0, xMax: 10, yMin: 0, yMax: 10 },
      parts: [{ o: 'curve', expr: `2*${v}` }],
    });
    ok(`a curve in ${v} draws`, frameOf(sc).objects.some((o) => o.o === 'curve'), v);
  }

  // A declared varName still wins when the expression uses it.
  const declared = sanitizeViz({
    kind: 'diagram', varName: 't', view: { xMin: 0, xMax: 10, yMin: 0, yMax: 20 },
    parts: [{ o: 'curve', expr: '2*t' }],
  });
  ok('a declared variable is honoured', declared.varName === 't' && frameOf(declared).objects.length >= 1);
}

console.log('\n=== a part that could never draw is refused, not silently dropped ===');
{
  // A coordinate naming a letter that is not a slider can only ever be NaN.
  const sc = sanitizeViz({
    kind: 'diagram', view: { xMin: 0, xMax: 10, yMin: 0, yMax: 10 },
    params: [{ id: 'k', min: 0, max: 5, step: 1, value: 2 }],
    parts: [
      { o: 'point', x: 'k', y: 1 },       // k is a slider — fine
      { o: 'point', x: 'w', y: 1 },       // w is nothing — refused
      { o: 'segment', x1: 0, y1: 0, x2: 'q', y2: 1 },
    ],
  });
  ok('only the drawable part is kept', sc.parts.length === 1, JSON.stringify(sc.parts));
  ok('and it is the right one', sc.parts[0].x === 'k');

  // A curve gets exactly one unknown — its variable — and no more.
  const twoFree = sanitizeViz({
    kind: 'diagram', view: { xMin: 0, xMax: 10, yMin: 0, yMax: 10 },
    parts: [{ o: 'curve', expr: 'a*t' }],
  });
  ok('two unknowns in a curve is refused', twoFree === null, JSON.stringify(twoFree && twoFree.parts));

  const oneFree = sanitizeViz({
    kind: 'diagram', view: { xMin: 0, xMax: 10, yMin: 0, yMax: 10 },
    params: [{ id: 'a', min: 1, max: 3, step: 1, value: 2 }],
    parts: [{ o: 'curve', expr: 'a*t' }],
  });
  ok('but one is fine once the other is a slider', !!oneFree && oneFree.parts.length === 1);

  // Nothing drawable at all is no scene — not a title over blank space.
  ok('a scene of unreachable parts is refused', sanitizeViz({
    kind: 'diagram', view: { xMin: 0, xMax: 10 },
    parts: [{ o: 'point', x: 'w', y: 'z' }, { o: 'hrule', at: 'q' }],
  }) === null);
}

console.log('\n=== an empty frame says so rather than inviting a press ===');
{
  // Everything passes its static check and still produces nothing.
  const sc = sanitizeViz({
    kind: 'diagram', view: { xMin: 0, xMax: 10, yMin: 0, yMax: 10 },
    params: [{ id: 'k', min: 1, max: 5, step: 1, value: 2 }],
    parts: [{ o: 'point', x: 'k/0', y: 1 }],
  });
  if (sc) {
    const f = frameOf(sc);
    if (!f.objects.length) {
      ok('the caption is honest', /could not be drawn/.test(f.caption), f.caption);
      ok('and does not invite a control', !/Move a control/.test(f.caption));
    } else ok('drew something after all, which is also fine', true);
  } else ok('refused outright, which is also fine', true);
}

console.log('\n=== Socria never claims it cannot draw ===');
{
  ok('the chat prompt forbids it', /NEVER SAY YOU CANNOT DRAW/.test(LOGOS_CHAT_PROMPT));
  ok('and says a second pass does it', /A second pass draws it beside this conversation/.test(LOGOS_CHAT_PROMPT));
  ok('and forbids describing it instead', /do not list what the curves do|Do not describe the axes/.test(LOGOS_CHAT_PROMPT));
}

console.log('\n=== the example the prompt teaches must be one we accept ===');
{
  // A worked example is the strongest instruction a prompt has. If the one we
  // show the model does not survive our own sanitizer, we are training it to
  // produce something we then reject — and the failure is silent, which is
  // the worst combination available here.
  const p = buildMapPrompt({ context: null, nodes: [], edges: [], viz: null });
  const i = p.indexOf('{"kind": "diagram"');
  ok('the prompt carries a worked example', i > 0);
  let d = 0, end = -1;
  for (let k = i; k < p.length; k++) { if (p[k] === '{') d++; else if (p[k] === '}') { d--; if (!d) { end = k; break; } } }
  const src = p.slice(i, end + 1);
  let raw = null;
  try { raw = JSON.parse(src); } catch (e) { ok('the example is valid JSON', false, e.message); }
  if (raw) {
    ok('the example is valid JSON', true);
    const sc = sanitizeViz(raw);
    ok('and survives the sanitizer', !!sc);
    ok('with every part kept', sc && sc.parts.length === raw.parts.length, sc && `${sc.parts.length}/${raw.parts.length}`);
    ok('and its slider', sc && sc.params.some((q) => q.id === 'v'));
    ok('and its quantity', sc && (sc.quantities || []).length === 1);
    const f = frameOf(sc);
    ok('it draws', f.objects.length >= 4, String(f.objects.length));
    ok('the readout is right at the default', f.readouts[0] && f.readouts[0].value === '3.8003', f.readouts[0] && f.readouts[0].value);
    ok('and moves with the slider', frameOf(sc, { v: 40 }).readouts[0].value === '10.1997');
    ok('nothing non-finite is drawn', f.objects.every((o) => Object.values(o).every((v) => typeof v !== 'number' || Number.isFinite(v))));
  }

  // And the guidance must not have collapsed into the economics bullet: the
  // PPC and AD-AS rules belong to economics, and a model reading them under
  // the diagram heading would draw opportunity cost by hand.
  const dIdx = p.indexOf('ANY OTHER SUBJECT THAT WANTS A PICTURE');
  const ppcIdx = p.indexOf('Opportunity cost, trade-offs');
  ok('the economics rules come BEFORE the diagram bullet', ppcIdx > 0 && ppcIdx < dIdx, `${ppcIdx} vs ${dIdx}`);
  ok('the diagram bullet names its own subjects', /titration curve|free-body diagram/.test(p.slice(dIdx, dIdx + 700)));
  ok('and says it is not a fallback for maths', /NOT a fallback for mathematics/.test(p));
  ok('it names the operators that work', /Operators and functions: ASCII/.test(p));
  // max and min are no longer excluded — they are how piecewise shapes are
  // written now that the parser takes two arguments.
  ok('and offers the two-argument ones', /two-argument max, min/.test(p));
}

console.log('\n=== a path, for the shapes y = f(x) cannot express ===');
{
  // A closed loop is not a function of x, and a great many of the pictures
  // worth drawing are loops: a Carnot cycle, hysteresis, a phase portrait.
  // "Draw the PV cycle for a Carnot engine" was advertised and could not be
  // drawn at all.
  const circle = sanitizeViz({
    kind: 'diagram', view: { xMin: -2, xMax: 2 },
    parts: [{ o: 'path', x: 'cos(t)', y: 'sin(t)', from: 0, to: 6.2832, closed: true }],
  });
  ok('a circle survives', !!circle);
  const f = frameOf(circle);
  const c = f.objects.find((o) => o.o === 'curve');
  ok('and draws as one path', !!c && c.pts.length > 100, String(c && c.pts.length));
  const xs = c.pts.map((q) => q.x), ys = c.pts.map((q) => q.y);
  ok('spanning x in [-1, 1]', Math.abs(Math.min(...xs) + 1) < 0.01 && Math.abs(Math.max(...xs) - 1) < 0.01);
  ok('and y in [-1, 1]', Math.abs(Math.min(...ys) + 1) < 0.01 && Math.abs(Math.max(...ys) - 1) < 0.01);
  ok('it closes', Math.abs(c.pts[0].x - c.pts[c.pts.length - 1].x) < 1e-9);
  // The window has to see it too, or the fit and the frame disagree.
  const v = resolveView(circle, compileScene(circle));
  ok('the window contains it', v.xMin < -0.99 && v.xMax > 0.99 && v.yMin < -0.99 && v.yMax > 0.99, JSON.stringify(v));

  // A slider drives the shape, which is what makes it worth drawing.
  const ell = sanitizeViz({
    kind: 'diagram', view: { xMin: -3, xMax: 3 },
    params: [{ id: 'a', min: 0.2, max: 2, step: 0.1, value: 1 }],
    parts: [{ o: 'path', x: '2*cos(t)', y: 'a*sin(t)', from: 0, to: 6.2832, closed: true }],
  });
  const tall = frameOf(ell, { a: 2 }).objects.find((o) => o.o === 'curve');
  const flat = frameOf(ell, { a: 0.2 }).objects.find((o) => o.o === 'curve');
  ok('the slider changes the shape', Math.max(...tall.pts.map((q) => q.y)) > Math.max(...flat.pts.map((q) => q.y)) + 1);

  // The parameter: declared, or inferred, or t.
  const declared = sanitizeViz({ kind: 'diagram', view: { xMin: 0, xMax: 4 },
    parts: [{ o: 'path', x: '1 + u', y: '10/(1 + u)', param: 'u', from: 0, to: 2 }] });
  ok('a declared parameter works', frameOf(declared).objects.some((o) => o.o === 'curve'));
  const inferred = sanitizeViz({ kind: 'diagram', view: { xMin: -2, xMax: 2 },
    parts: [{ o: 'path', x: 'cos(w)', y: 'sin(w)', from: 0, to: 6.2832 }] });
  ok('an undeclared one is inferred', frameOf(inferred).objects.some((o) => o.o === 'curve'));
  // A path's parameter shadows a slider of the same name INSIDE the path —
  // within cos(t) the t is the thing being traced.
  const shadow = sanitizeViz({ kind: 'diagram', view: { xMin: -2, xMax: 2 },
    params: [{ id: 't', min: 0, max: 5, step: 1, value: 3 }],
    parts: [{ o: 'path', x: 'cos(t)', y: 'sin(t)', from: 0, to: 6.2832, param: 't' }] });
  const sc2 = frameOf(shadow).objects.find((o) => o.o === 'curve');
  ok('the parameter wins inside the path', !!sc2 && new Set(sc2.pts.map((q) => Math.round(q.x * 100))).size > 20);

  // Refused where it could not draw, rather than kept and silently absent.
  const bad = (part) => sanitizeViz({ kind: 'diagram', view: { xMin: -2, xMax: 2 }, parts: [part, { o: 'point', x: 0, y: 0 }] });
  ok('a path with no y is refused', !bad({ o: 'path', x: 'cos(t)' }).parts.some((q) => q.o === 'path'));
  ok('an unparseable coordinate is refused', !bad({ o: 'path', x: '(((', y: 'sin(t)' }).parts.some((q) => q.o === 'path'));
  ok('two different free letters are refused', !bad({ o: 'path', x: 'cos(t)', y: 'sin(q)' }).parts.some((q) => q.o === 'path'));
  ok('nothing non-finite is drawn', frameOf(circle).objects.every((o) =>
    o.o !== 'curve' || o.pts.every((q) => Number.isFinite(q.x) && Number.isFinite(q.y))));
}

console.log('\n=== piecewise shapes, via max and min ===');
{
  // A payoff floored at zero, a kinked budget line, a capacity limit — all of
  // them piecewise, and this grammar has no conditional.
  const sc = sanitizeViz({
    kind: 'diagram', axes: { x: 'units', y: 'payoff' }, view: { xMin: -5, xMax: 10, yMin: -2, yMax: 10 },
    parts: [
      { o: 'curve', expr: 'max(0, x)', tone: 'accent', label: 'payoff' },
      { o: 'curve', expr: 'min(2*x, 6)', tone: 'tension', label: 'capacity' },
    ],
  });
  ok('both survive', !!sc && sc.parts.length === 2);
  const f = frameOf(sc);
  const curves = f.objects.filter((o) => o.o === 'curve');
  ok('and both draw', curves.length === 2);
  const yAt = (c, x) => c.pts.reduce((b, q) => Math.abs(q.x - x) < Math.abs(b.x - x) ? q : b).y;
  ok('the floor holds below zero', Math.abs(yAt(curves[0], -3)) < 0.1, String(yAt(curves[0], -3)));
  ok('and rises above it', Math.abs(yAt(curves[0], 5) - 5) < 0.2, String(yAt(curves[0], 5)));
  ok('the cap holds', Math.abs(yAt(curves[1], 8) - 6) < 0.2, String(yAt(curves[1], 8)));
  ok('and rises below it', Math.abs(yAt(curves[1], 1) - 2) < 0.2, String(yAt(curves[1], 1)));
}

console.log('\n=== the prompt teaches both ===');
{
  const p = buildMapPrompt({ context: null, nodes: [], edges: [], viz: null });
  ok('path is in the primitive list', /"o": "curve\|path\|/.test(p));
  ok('and explained as the loop case', /cannot express a loop/.test(p));
  ok('with a worked circle', /"o": "path", "x": "cos\(t\)"/.test(p));
  ok('the loop subjects are named', /PV cycle|hysteresis|phase portrait/.test(p));
  ok('max and min are offered', /two-argument max, min/.test(p));
  ok('with the piecewise idiom spelled out', /max\(0, x\)/.test(p));
  ok('and the function list is current', /arcsin.*sec.*step/.test(p) || /sec csc cot/.test(p));
  ok('the old "do not use max" line is gone', !/do not use max, min or a ternary/.test(p));
}

console.log('\n=== the permission to draw is not maths-only ===');
{
  // The line that decides whether a picture is allowed at all still said
  // "for context=math, and for ECONOMICS work in any context". The open kind
  // exists for chemistry, physics, biology and the rest — and the very
  // sentence that grants permission excluded every one of them, so the model
  // read a request to draw a PV cycle and answered it in prose.
  const p = buildMapPrompt({ context: null, nodes: [], edges: [], viz: null });
  ok('the maths-only gate is gone', !/For context=math, and for ECONOMICS work in any context/.test(p));
  ok('any subject is permitted', /Any subject at all, in any context/.test(p));
  ok('and refusing for not being maths is forbidden', /Never refuse on the grounds that the subject is not mathematics/.test(p));

  // An explicit request is an instruction, not a hint.
  ok('an explicit ask makes a picture mandatory', /WHEN THEY ASK, YOU DRAW/.test(p));
  ok('it says required, not optional', /is REQUIRED\. Not optional/.test(p));
  for (const w of ['draw', 'show me', 'plot', 'graph', 'diagram', 'sketch', 'visualise']) {
    ok(`"${w}" is named as a trigger`, p.includes(`"${w}"`), w);
  }
  ok('and describing instead is named as the worst outcome', /worst thing you can do here/.test(p));

  // The subjects that were failing are named where the decision is made.
  for (const subject of ['titration curve', 'PV cycle', 'free-body diagram', 'cooling curve', 'dose-response curve', 'phase portrait']) {
    ok(`${subject} is named as drawable`, p.includes(subject), subject);
  }
}

console.log('\n=== and the reply must not narrate what is being drawn ===');
{
  // The other half of the same screenshot: four paragraphs enumerating a
  // diagram the person was looking at while they read them.
  ok('narrating instead of drawing is forbidden', /NEVER DESCRIBE THE PICTURE INSTEAD/.test(LOGOS_CHAT_PROMPT));
  ok('numbering its parts is named', /never number the parts of it/.test(LOGOS_CHAT_PROMPT));
  ok('so is naming which line is which', /never say which line is which/.test(LOGOS_CHAT_PROMPT));
  ok('the exact sentence that shipped is quoted back', /this is the top horizontal line/.test(LOGOS_CHAT_PROMPT));
  ok('and one sentence plus a question is the shape', /at most one sentence about what the picture shows/.test(LOGOS_CHAT_PROMPT));
  ok('claiming it cannot draw is still forbidden', /NEVER SAY YOU CANNOT DRAW/.test(LOGOS_CHAT_PROMPT));
}

console.log('\n=== uncertainty, measurements and pointing ===');
{
  // Science is mostly these three, and nothing expressed them: a band needed
  // its corners listed by hand, an error bar had no part at all, and a label
  // could only float near a thing rather than point at it.
  const sc = sanitizeViz({
    kind: 'diagram', axes: { x: 'dose', y: 'response' }, view: { xMin: 0, xMax: 10, yMin: 0, yMax: 20 },
    params: [{ id: 'w', min: 0.5, max: 4, step: 0.5, value: 1.5 }],
    parts: [
      { o: 'band', lower: '1.5*x - w', upper: '1.5*x + w', tone: 'muted', label: '95% CI' },
      { o: 'curve', expr: '1.5*x', tone: 'accent', label: 'fit' },
      { o: 'errorbar', x: 2, y: 3.4, dy: 0.9 },
      { o: 'errorbar', x: 8, y: 13.5, dy: 1.4, dx: 0.3 },
      { o: 'callout', x: 8.6, y: 4, toX: 8, toY: 13.5, text: 'above the band' },
    ],
  });
  ok('all five survive', !!sc && sc.parts.length === 5, sc && String(sc.parts.length));
  const f = frameOf(sc);
  ok('the band becomes a region', f.objects.some((o) => o.o === 'region'));
  ok('with a closed outline', f.objects.find((o) => o.o === 'region').pts.length > 20);
  ok('the fit is drawn', f.objects.some((o) => o.o === 'curve'));
  ok('each measurement is a point', f.objects.filter((o) => o.o === 'point').length === 2);
  // A bar and two caps for dy; the second also has dx, so three more.
  ok('with bars and caps around them', f.objects.filter((o) => o.o === 'segment').length >= 7,
    String(f.objects.filter((o) => o.o === 'segment').length));
  ok('the callout draws a leader line', f.objects.some((o) => o.o === 'segment'));
  ok('and its words', f.objects.some((o) => o.o === 'label' && o.text === 'above the band'));
  ok('nothing non-finite', f.objects.every((o) => Object.values(o).every((v) => typeof v !== 'number' || Number.isFinite(v))));

  // The band follows its slider, which is what makes it worth shading.
  const narrow = frameOf(sc, { w: 0.5 }).objects.find((o) => o.o === 'region');
  const wide = frameOf(sc, { w: 4 }).objects.find((o) => o.o === 'region');
  const height = (r) => Math.max(...r.pts.map((q) => q.y)) - Math.min(...r.pts.map((q) => q.y));
  ok('a wider interval is a taller band', height(wide) > height(narrow) + 3);

  // The window must contain the uncertainty, not just the points.
  const tall = sanitizeViz({ kind: 'diagram', view: { xMin: 0, xMax: 4 },
    parts: [{ o: 'errorbar', x: 2, y: 5, dy: 40 }] });
  const v = resolveView(tall, compileScene(tall));
  ok('the window contains the error bar', v.yMin < -30 && v.yMax > 40, JSON.stringify(v));

  // Refused rather than kept-and-blank.
  const bad = (part) => sanitizeViz({ kind: 'diagram', view: { xMin: 0, xMax: 5 }, parts: [part, { o: 'point', x: 1, y: 1 }] });
  ok('a band with one edge is refused', !bad({ o: 'band', lower: 'x' }).parts.some((q) => q.o === 'band'));
  ok('an unparseable edge is refused', !bad({ o: 'band', lower: '(((', upper: 'x' }).parts.some((q) => q.o === 'band'));
  ok('an error bar with no y is refused', !bad({ o: 'errorbar', x: 1 }).parts.some((q) => q.o === 'errorbar'));
  ok('a callout with no target is refused', !bad({ o: 'callout', x: 1, y: 1, text: 'hi' }).parts.some((q) => q.o === 'callout'));
  ok('a band naming two unknowns is refused',
    !bad({ o: 'band', lower: 'a*x', upper: 'b*x' }).parts.some((q) => q.o === 'band'));

  // And the extractor is told they exist.
  const p = buildMapPrompt({ context: null, nodes: [], edges: [], viz: null });
  ok('band is in the primitive list', /curve\|path\|data\|band\|errorbar\|callout/.test(p));
  ok('the band is explained', /shades between two curves/.test(p));
  ok('so is the error bar', /a measurement with its uncertainty/.test(p));
  ok('and why it matters', /a claim, not a measurement/.test(p));
  ok('the callout is explained', /a label that POINTS at something/.test(p));
}

console.log('\n=== readings, as they were taken ===');
{
  // Everything else here is an expression — a shape derived from a formula.
  // Real work starts from numbers, and there was no way to put a table of
  // them on a picture at all.
  const exact = sanitizeViz({
    kind: 'diagram', view: { xMin: 0, xMax: 6 },
    parts: [{ o: 'data', points: [{ x: 1, y: 3 }, { x: 2, y: 5 }, { x: 3, y: 7 }, { x: 4, y: 9 }], fit: true, label: 'runs' }],
  });
  ok('the readings survive', !!exact && exact.parts[0].points.length === 4);
  const f = frameOf(exact);
  ok('they are drawn as points', f.objects.some((o) => o.o === 'sequence'));
  ok('with the fitted line', f.objects.some((o) => o.o === 'line'));
  const r = Object.fromEntries(f.readouts.map((x) => [x.tex, x.value]));
  // y = 2x + 1 exactly.
  ok('the slope is the data’s', r['\\text{slope}'] === '2', JSON.stringify(r));
  ok('and R² is 1 for an exact line', r['R^2'] === '1');

  // A real scatter, and the fit must be computed rather than asserted.
  const noisy = sanitizeViz({ kind: 'diagram', view: { xMin: 0, xMax: 6 },
    parts: [{ o: 'data', points: [{ x: 1, y: 3.2 }, { x: 2, y: 4.6 }, { x: 3, y: 7.4 }, { x: 4, y: 8.7 }], fit: true }] });
  const nr = Object.fromEntries(frameOf(noisy).readouts.map((x) => [x.tex, x.value]));
  ok('a noisy slope is near but not exactly 2', Math.abs(Number(nr['\\text{slope}']) - 2) < 0.2 && nr['\\text{slope}'] !== '2');
  ok('and R² is below 1', Number(nr['R^2']) < 1 && Number(nr['R^2']) > 0.9);

  // Flat readings: a slope of zero is true, an R² of 1 is not. There is no
  // variation for the line to account for, so no number is the honest answer.
  const flat = sanitizeViz({ kind: 'diagram', view: { xMin: 0, xMax: 6 },
    parts: [{ o: 'data', points: [{ x: 1, y: 5 }, { x: 2, y: 5 }, { x: 3, y: 5 }, { x: 4, y: 5 }], fit: true }] });
  const fr = frameOf(flat).readouts.map((x) => x.tex);
  ok('a flat fit still reports its slope', fr.includes('\\text{slope}'));
  ok('and reports NO R² rather than a false 1', !fr.includes('R^2'), JSON.stringify(fr));

  // Joined in order, for a series over time.
  const series = sanitizeViz({ kind: 'diagram', view: { xMin: 0, xMax: 6 },
    parts: [{ o: 'data', points: [{ x: 1, y: 3 }, { x: 2, y: 8 }, { x: 3, y: 4 }], connect: true }] });
  ok('connect joins them', frameOf(series).objects.some((o) => o.o === 'curve'));
  ok('and the points are still there', frameOf(series).objects.some((o) => o.o === 'sequence'));

  // The window is the data's.
  const wide = sanitizeViz({ kind: 'diagram', view: { xMin: 0, xMax: 6 },
    parts: [{ o: 'data', points: [{ x: 100, y: 4000 }, { x: 200, y: 9000 }] }] });
  const v = resolveView(wide, compileScene(wide));
  ok('the window contains the readings', v.xMax >= 200 && v.yMax >= 9000, JSON.stringify(v));

  // Junk must not become a measurement nobody took.
  const junk = sanitizeViz({ kind: 'diagram', view: { xMin: 0, xMax: 5 },
    parts: [{ o: 'data', points: [{ x: 'a', y: 1 }, { x: null, y: null }, { x: undefined, y: 2 }, { x: true, y: 1 }, { x: '', y: 3 }] },
            { o: 'point', x: 1, y: 1 }] });
  ok('nothing coerces to a reading at the origin', !junk.parts.some((q) => q.o === 'data'), JSON.stringify(junk.parts));
  const strs = sanitizeViz({ kind: 'diagram', view: { xMin: 0, xMax: 5 },
    parts: [{ o: 'data', points: [{ x: '1', y: '2' }, { x: '3', y: '4' }] }] });
  ok('but numeric strings are read', strs.parts[0].points.length === 2);
  ok('an empty series is refused', sanitizeViz({ kind: 'diagram', view: { xMin: 0, xMax: 5 }, parts: [{ o: 'data', points: [] }] }) === null);
  const many = sanitizeViz({ kind: 'diagram', view: { xMin: 0, xMax: 5 },
    parts: [{ o: 'data', points: Array.from({ length: 5000 }, (_, i) => ({ x: i, y: i })) }] });
  ok('a runaway series is capped', many.parts[0].points.length <= 400, String(many.parts[0].points.length));

  // Under the guard the picture stands and the numbers do not.
  const g = buildFrame(exact, compileScene(exact), defaults(exact), resolveView(exact, compileScene(exact)), true);
  ok('guarded: the readings are still drawn', g.objects.some((o) => o.o === 'sequence'));
  ok('guarded: the slope is withheld', g.readouts.every((x) => x.value === null));

  // And the extractor is told not to fake it.
  const p = buildMapPrompt({ context: null, nodes: [], edges: [], viz: null });
  ok('data is offered', /\bdata\b/.test(p));
  ok('with the rule that their numbers go in as given', /put them on the picture exactly as given/.test(p));
  ok('and never approximated by a formula', /a quiet lie about what was measured/.test(p));
}

console.log('\n=== a band does not join two branches across a gap ===');
{
  // A curve breaks its pen where the value is not a number, which is how an
  // asymptote draws correctly. A polygon cannot break, so dropping the bad
  // samples and closing what is left joined the branch on one side of a pole
  // to the branch on the other — a filled stripe across territory the band
  // does not cover.
  const cont = sanitizeViz({ kind: 'diagram', view: { xMin: 0, xMax: 10 },
    parts: [{ o: 'band', lower: 'x - 1', upper: 'x + 1' }] });
  const contRegions = frameOf(cont).objects.filter((o) => o.o === 'region');
  ok('a continuous band is one region', contRegions.length === 1);

  const pole = sanitizeViz({ kind: 'diagram', view: { xMin: -5, xMax: 5 },
    parts: [{ o: 'band', lower: '1/x - 1', upper: '1/x + 1' }] });
  const regions = frameOf(pole).objects.filter((o) => o.o === 'region');
  ok('a band across a pole is two', regions.length === 2, String(regions.length));
  const spans = regions.map((r) => [Math.min(...r.pts.map((q) => q.x)), Math.max(...r.pts.map((q) => q.x))]);
  ok('one on each side of it', spans[0][1] < 0 && spans[1][0] > 0, JSON.stringify(spans));
  ok('and neither crosses it', spans.every(([a, b]) => a * b > 0));
  ok('every point is finite', regions.every((r) => r.pts.every((q) => Number.isFinite(q.x) && Number.isFinite(q.y))));
  ok('and each id is distinct', new Set(regions.map((r) => r.id)).size === regions.length);

  // A band that only exists on part of the window is one region, not padded.
  const half = sanitizeViz({ kind: 'diagram', view: { xMin: -5, xMax: 5 },
    parts: [{ o: 'band', lower: 'sqrt(x) - 1', upper: 'sqrt(x) + 1' }] });
  const hr = frameOf(half).objects.filter((o) => o.o === 'region');
  ok('a half-defined band is one region', hr.length === 1);
  ok('starting where it becomes real', Math.min(...hr[0].pts.map((q) => q.x)) >= -0.01, String(Math.min(...hr[0].pts.map((q) => q.x))));

  // Nothing finite anywhere is nothing drawn, not an empty polygon.
  const none = sanitizeViz({ kind: 'diagram', view: { xMin: -5, xMax: -1 },
    parts: [{ o: 'band', lower: 'sqrt(x)', upper: 'sqrt(x) + 1' }, { o: 'point', x: -3, y: 0 }] });
  ok('an entirely undefined band draws nothing', !frameOf(none).objects.some((o) => o.o === 'region'));
}

console.log('\n=== readings at scale ===');
{
  // The cap is 400, and the whole frame has to survive it.
  const big = sanitizeViz({ kind: 'diagram', view: { xMin: 0, xMax: 400 },
    parts: [{ o: 'data', points: Array.from({ length: 400 }, (_, i) => ({ x: i, y: Math.sin(i / 20) * 50 + i * 0.3 })), fit: true, connect: true }] });
  const t0 = process.hrtime.bigint();
  const f = frameOf(big);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  ok('a full series builds quickly', ms < 200, `${ms.toFixed(1)}ms`);
  const seq = f.objects.find((o) => o.o === 'sequence');
  ok('every reading is kept', seq.pts.length === 400);
  ok('and every one is finite', seq.pts.every((q) => Number.isFinite(q.x) && Number.isFinite(q.y)));
  ok('joined as well', f.objects.some((o) => o.o === 'curve'));
  ok('with a fit through them', f.objects.some((o) => o.o === 'line'));
  const v = resolveView(big, compileScene(big));
  ok('the window holds all of it', v.xMax >= 399 && [v.xMin, v.xMax, v.yMin, v.yMax].every(Number.isFinite));

  // And a path's sample count cannot be driven to something absurd.
  const path = sanitizeViz({ kind: 'diagram', view: { xMin: -2, xMax: 2 },
    parts: [{ o: 'path', x: 'cos(t)', y: 'sin(t)', from: 0, to: 6.2832, steps: 99999 }] });
  ok('path steps are clamped', path.parts[0].steps <= 720, String(path.parts[0].steps));
  const low = sanitizeViz({ kind: 'diagram', view: { xMin: -2, xMax: 2 },
    parts: [{ o: 'path', x: 'cos(t)', y: 'sin(t)', from: 0, to: 6.2832, steps: 1 }] });
  ok('and floored', low.parts[0].steps >= 24, String(low.parts[0].steps));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
