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
  ok('the primitives are listed', p.includes('curve|point|segment'));
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
  ok('and says a second pass does it', /second pass draws the picture/.test(LOGOS_CHAT_PROMPT));
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
  ok('it names the operators that work', /Use ASCII operators/.test(p));
  ok('and the ones that do not', /do not use max, min or a ternary/.test(p));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
