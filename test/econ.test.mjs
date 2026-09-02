// The economics behind the economics diagrams.
//
// Every number here is one a student could be asked for on an exam, so the
// assertions are worked by hand rather than snapshotted: if the code and the
// test are both wrong in the same way, a snapshot agrees with itself and a
// worked value does not.

import {
  priceAt, quantityAt, equilibrium, shift, marketAt, binds, welfare,
  frontierAt, opportunityCost, standing, outputGap,
} from './.tmp/logos-econ.mjs';
import {
  sanitizeViz, compileScene, resolveView, buildFrame, defaults,
} from './.tmp/logos-viz.mjs';
import { availableLenses, leadLens } from './.tmp/logos-layout.mjs';
import { buildMapPrompt, sanitizeMap } from './.tmp/logos.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const near = (n, got, want, tol = 1e-9) =>
  ok(n, Math.abs(got - want) < tol, `got ${got}, want ${want}`);

// The market used throughout: D: P = 100 − Q, S: P = 20 + Q.
// 100 − Q = 20 + Q  →  Q* = 40, P* = 60.
const D = { intercept: 100, slope: -1 };
const S = { intercept: 20, slope: 1 };

console.log('=== a market clears where the curves cross ===');
{
  const eq = equilibrium(D, S);
  near('Q* is 40', eq.q, 40);
  near('P* is 60', eq.p, 60);
  near('and P* is on demand', priceAt(D, eq.q), 60);
  near('and on supply too', priceAt(S, eq.q), 60);
  near('quantityAt inverts priceAt', quantityAt(D, 60), 40);
}

console.log('\n=== curves that cannot describe a market have no crossing ===');
{
  ok('parallel lines never cross', equilibrium(D, { intercept: 5, slope: -1 }) === null);
  // Supply above demand everywhere: they meet at a negative quantity, which
  // is not an equilibrium, it is arithmetic off the edge of the model.
  ok('a crossing at negative Q is refused',
     equilibrium({ intercept: 10, slope: -1 }, { intercept: 50, slope: 1 }) === null);
  ok('a crossing at negative P is refused',
     equilibrium({ intercept: 20, slope: -4 }, { intercept: -30, slope: 1 }) === null);
}

console.log('\n=== a shift moves the whole curve, not its slope ===');
{
  const D2 = shift(D, 20);
  near('intercept rises', D2.intercept, 120);
  near('slope is untouched', D2.slope, -1);
  // 120 − Q = 20 + Q → Q = 50, P = 70. Demand up: BOTH rise.
  const eq = equilibrium(D2, S);
  near('demand up raises Q*', eq.q, 50);
  near('demand up raises P*', eq.p, 70);
  // Supply up: 100 − Q = 0 + Q → Q = 50, P = 50. Q rises, P falls.
  const eq2 = equilibrium(D, shift(S, -20));
  near('supply up raises Q*', eq2.q, 50);
  near('supply up lowers P*', eq2.p, 50);
}

console.log('\n=== a price control, and which side decides ===');
{
  // Ceiling at 45. Qd = 55, Qs = 25. Shortage of 30; only 25 trades.
  const m = marketAt(D, S, 45);
  near('buyers want 55', m.qd, 55);
  near('sellers offer 25', m.qs, 25);
  near('shortage is 30', m.imbalance, 30);
  near('only the short side trades', m.traded, 25);

  // Floor at 80. Qd = 20, Qs = 60. Surplus of 40; only 20 trades.
  const f = marketAt(D, S, 80);
  near('buyers want 20', f.qd, 20);
  near('sellers offer 60', f.qs, 60);
  near('surplus shows as negative imbalance', f.imbalance, -40);
  near('again the short side trades', f.traded, 20);

  console.log('\n=== …and whether it binds at all ===');
  ok('a ceiling below the market price binds', binds('ceiling', 45, 60) === true);
  ok('a ceiling above it does nothing', binds('ceiling', 80, 60) === false);
  ok('a floor above the market price binds', binds('floor', 80, 60) === true);
  ok('a floor below it does nothing', binds('floor', 45, 60) === false);
}

console.log('\n=== surplus, and what a control destroys ===');
{
  // Free market: CS = ½(100−60)(40) = 800. PS = ½(60−20)(40) = 800.
  const free = welfare(D, S, 40, 60);
  near('consumer surplus is 800', free.consumer, 800);
  near('producer surplus is 800', free.producer, 800);
  near('total is 1600', free.total, 1600);
  near('nothing is lost when nothing interferes', free.deadweight, 0, 1e-9);

  // Ceiling at 45, 25 units trade.
  // CS = average height over [0,25] × 25 = ((100−45)+(75−45))/2 × 25 = 1062.5
  // PS = ((45−20)+(45−45))/2 × 25 = 312.5
  // DWL = 1600 − 1375 = 225
  const cap = welfare(D, S, 25, 45);
  near('CS under the ceiling', cap.consumer, 1062.5);
  near('PS under the ceiling', cap.producer, 312.5);
  near('deadweight loss is 225', cap.deadweight, 225);
  ok('a binding control destroys surplus', cap.total < free.total);
  ok('and consumers can still lose overall only if enough trade is lost',
     cap.consumer > free.consumer); // here they gain: price fell more than quantity cost them
}

console.log('\n=== the production frontier ===');
{
  const bowed = { xMax: 100, yMax: 80, bowed: true };
  const flat = { xMax: 100, yMax: 80, bowed: false };

  near('all resources to y', frontierAt(bowed, 0), 80);
  near('all resources to x', frontierAt(bowed, 100), 0, 1e-9);
  near('a straight frontier is linear', frontierAt(flat, 50), 40);
  // Bowed: y = 80·√(1 − 0.25) = 80 × 0.8660… = 69.28…
  near('a bowed frontier bulges outward', frontierAt(bowed, 50), 80 * Math.sqrt(0.75), 1e-9);
  ok('bowed lies above straight everywhere between', frontierAt(bowed, 50) > frontierAt(flat, 50));
  ok('outside the frontier is not a number', Number.isNaN(frontierAt(bowed, 120)));
  ok('negative production is not a number', Number.isNaN(frontierAt(bowed, -1)));

  console.log('\n=== …and what the next unit costs ===');
  near('constant cost is the ratio of the intercepts', opportunityCost(flat, 0), 0.8);
  near('and it is the same everywhere', opportunityCost(flat, 90), 0.8);
  near('the first unit of x is nearly free when bowed', opportunityCost(bowed, 0), 0, 1e-9);
  ok('cost rises as you specialise',
     opportunityCost(bowed, 80) > opportunityCost(bowed, 40));
  ok('and again', opportunityCost(bowed, 40) > opportunityCost(bowed, 10));
  ok('the last unit costs everything', opportunityCost(bowed, 100) === Infinity);

  console.log('\n=== …and where a point stands ===');
  ok('on the curve is efficient', standing(bowed, 50, frontierAt(bowed, 50)) === 'efficient');
  ok('inside is attainable but wasteful', standing(bowed, 50, 20) === 'inefficient');
  ok('outside cannot be reached', standing(bowed, 50, 78) === 'unattainable');
  ok('beyond the x-intercept cannot be reached', standing(bowed, 130, 0) === 'unattainable');
}

console.log('\n=== the output gap ===');
{
  ok('below potential is recessionary', outputGap(55, 60).kind === 'recessionary');
  ok('above potential is inflationary', outputGap(70, 60).kind === 'inflationary');
  ok('on potential is neither', outputGap(60, 60).kind === 'at potential');
  near('the gap is a difference', outputGap(55, 60).gap, -5);
  // The tolerance is proportional: the same absolute gap means different
  // things to a large economy and a small one.
  ok('a tiny gap in a large economy reads as at potential',
     outputGap(10000.5, 10000).kind === 'at potential');
  ok('the same gap in a small one does not',
     outputGap(10.5, 10).kind === 'inflationary');
}

// ── the scenes themselves ──────────────────────────────────────────
//
// Above this line is the economics; below it is whether the diagram carries
// it faithfully. Both matter and they fail differently: the arithmetic can be
// right while the picture shows a different experiment.

const frame = (raw, over = {}) => {
  const sc = sanitizeViz(raw);
  if (!sc) return null;
  const fn = compileScene(sc);
  const v = resolveView(sc, fn);
  return { sc, f: buildFrame(sc, fn, { ...defaults(sc), ...over }, v, false) };
};
const val = (r, id) => r.f.readouts.find((x) => x.id === id)?.value;
const has = (r, id) => r.f.objects.some((o) => o.id === id);

console.log('\n=== a market scene draws the market ===');
{
  const r = frame({ kind: 'supply-demand', demand: { intercept: 100, slope: -1 }, supply: { intercept: 20, slope: 1 } });
  ok('the scene survives sanitising', !!r);
  ok('P* is the equilibrium price', val(r, 'pe') === '60', String(val(r, 'pe')));
  ok('Q* is the equilibrium quantity', val(r, 'qe') === '40', String(val(r, 'qe')));
  ok('both curves are drawn', has(r, 'D') && has(r, 'S'));
  ok('and the crossing is marked', has(r, 'eq'));
  ok('the window is the first quadrant', r.f && frame({ kind: 'supply-demand' }) !== null);
  const v = resolveView(r.sc, null);
  ok('no negative quantity on screen', v.xMin === 0, String(v.xMin));
  ok('no negative price on screen', v.yMin === 0, String(v.yMin));
}

console.log('\n=== signs are imposed, not trusted ===');
{
  // A model that hands over an upward-sloping demand curve has made a
  // mistake with an obvious repair. Refusing the scene would leave the
  // reader with nothing.
  const r = frame({ kind: 'supply-demand', demand: { intercept: 100, slope: 2 }, supply: { intercept: 20, slope: -1 } });
  ok('demand is forced to slope down', r.sc.demand.slope < 0, String(r.sc.demand.slope));
  ok('supply is forced to slope up', r.sc.supply.slope > 0, String(r.sc.supply.slope));
  ok('the magnitude is kept', Math.abs(r.sc.demand.slope) === 2);
}

console.log('\n=== the shift sliders mean what they say ===');
{
  const base = { kind: 'supply-demand', demand: { intercept: 100, slope: -1 }, supply: { intercept: 20, slope: 1 } };
  const up = frame(base, { dsh: 20 });
  ok('demand up raises price', Number(val(up, 'pe')) > 60);
  ok('demand up raises quantity', Number(val(up, 'qe')) > 40);

  // The one that was backwards: positive ΔS must mean MORE supply, which
  // lowers the price and raises the quantity.
  const sup = frame(base, { ssh: 20 });
  ok('supply up LOWERS price', Number(val(sup, 'pe')) < 60, String(val(sup, 'pe')));
  ok('supply up raises quantity', Number(val(sup, 'qe')) > 40, String(val(sup, 'qe')));
  ok('and the words follow the curve that moved',
     /supply has increased/i.test(sup.f.narration), sup.f.narration);

  const dn = frame(base, { ssh: -20 });
  ok('supply down raises price', Number(val(dn, 'pe')) > 60);
  ok('and the words say so', /supply has fallen/i.test(dn.f.narration), dn.f.narration);
}

console.log('\n=== a price ceiling gets its own handle ===');
{
  const r = frame({
    kind: 'supply-demand', demand: { intercept: 100, slope: -1 },
    supply: { intercept: 20, slope: 1 }, control: { kind: 'ceiling', at: 45 }, surplus: true,
  });
  // The bug this catches: the control was read AFTER the sliders were built,
  // so the caption invited the reader to move a price that had no control.
  ok('a control adds its slider', r.sc.params.some((p) => p.id === 'pc'), r.sc.params.map(p=>p.id).join());
  ok('the shortage is reported', val(r, 'gap') === '30', String(val(r, 'gap')));
  ok('and named a shortage', r.f.readouts.find(x=>x.id==='gap')?.tex.includes('shortage'));
  ok('surplus is shaded', has(r, 'cs') && has(r, 'ps'));
  ok('and the loss with it', has(r, 'dwl'));
  ok('deadweight loss is reported', val(r, 'dwl') === '225', String(val(r, 'dwl')));

  // A non-binding ceiling changes nothing at all.
  const loose = frame({
    kind: 'supply-demand', demand: { intercept: 100, slope: -1 },
    supply: { intercept: 20, slope: 1 }, control: { kind: 'ceiling', at: 90 },
  });
  ok('a ceiling above the market price does nothing', val(loose, 'pe') === '60');
  ok('and reports no gap', loose.f.readouts.every((x) => x.id !== 'gap'));
}

console.log('\n=== the frontier scene ===');
{
  const r = frame({ kind: 'ppc', frontier: { xMax: 100, yMax: 80, bowed: true }, axes: { x: 'Guns', y: 'Butter' } });
  ok('the frontier is drawn', has(r, 'ppc'));
  ok('a point inside is shown', has(r, 'ineff'));
  ok('and one outside', has(r, 'unatt'));
  ok('the axes are named', r.f.readouts.some((x) => x.tex.includes('Guns')));
  ok('the slider spans the frontier', r.sc.params.find((p) => p.id === 'q')?.max === 100);
  // At q = 0 all resources are on the other good and the first unit is free.
  ok('opportunity cost starts at zero', val(r, 'oc') === '0', String(val(r, 'oc')));
  const mid = frame({ kind: 'ppc', frontier: { xMax: 100, yMax: 80, bowed: true } }, { q: 80 });
  ok('and rises as you specialise', Number(val(mid, 'oc')) > 1, String(val(mid, 'oc')));

  const flat = frame({ kind: 'ppc', frontier: { xMax: 100, yMax: 80, bowed: false } }, { q: 50 });
  ok('a straight frontier has constant cost', val(flat, 'oc') === '0.8', String(val(flat, 'oc')));
  ok('bowed is the default', frame({ kind: 'ppc' }).sc.frontier.bowed === true);
}

console.log('\n=== the macro scene ===');
{
  const base = { kind: 'ad-as', ad: { intercept: 140, slope: -1 }, sras: { intercept: 20, slope: 1 }, potential: 60 };
  const r = frame(base);
  ok('LRAS is drawn', has(r, 'lras'));
  ok('at potential there is no gap', /at potential/.test(String(val(r, 'gap'))), String(val(r, 'gap')));
  ok('and the words agree', /at potential/i.test(r.f.narration), r.f.narration);

  const boom = frame(base, { adsh: 30 });
  ok('AD up is inflationary', /inflationary/.test(String(val(boom, 'gap'))), String(val(boom, 'gap')));
  ok('output rises with it', Number(String(val(boom, 'y'))) > 60);
  const bust = frame(base, { adsh: -30 });
  ok('AD down is recessionary', /recessionary/.test(String(val(bust, 'gap'))), String(val(bust, 'gap')));
  ok('and the price level falls', Number(String(val(bust, 'pl'))) < 80);
}

console.log('\n=== the guard reaches economics too ===');
{
  const sc = sanitizeViz({ kind: 'supply-demand', demand: { intercept: 100, slope: -1 }, supply: { intercept: 20, slope: 1 } });
  const g = buildFrame(sc, compileScene(sc), defaults(sc), resolveView(sc, null), true);
  const pe = g.readouts.find((x) => x.id === 'pe');
  ok('the equilibrium price is withheld', pe && pe.value === null);
  ok('but the curves are still drawn', g.objects.some((o) => o.id === 'D'));
  ok('and there is a question to answer', typeof g.ask === 'string' && g.ask.length > 10);
}

// ── the diagram has to be the thing you see ────────────────────────
//
// Building a scene and then opening on something else is the same as not
// building it. This decides BOTH what a map opens on and, for a free reader
// who gets one lens, which lens is theirs — so getting it wrong either
// buries the answer or unlocks a view nobody was shown.

console.log('\n=== an economics map opens on the diagram ===');
{
  const scene = sanitizeViz({
    kind: 'supply-demand',
    demand: { intercept: 100, slope: -1 },
    supply: { intercept: 20, slope: 1 },
  });
  // An economics conversation: the extractor calls this "learning", not
  // "math", so there is no solution chain anywhere in it.
  const map = {
    context: 'learning',
    nodes: [
      { id: 'a', type: 'goal', label: 'why did the price rise' },
      { id: 'b', type: 'idea', label: 'demand shifted' },
    ],
    edges: [],
    viz: scene,
  };
  const lenses = availableLenses(map);
  ok('the plot lens is offered without math context', lenses.includes('plot'), lenses.join());
  ok('and it is what the map opens on', leadLens(lenses, true) === 'plot', String(leadLens(lenses, true)));
  ok('which is also the lens a free reader gets',
     leadLens(lenses, true) === 'plot');

  // Without a scene the concept graph still leads, as it always did.
  const plain = { ...map, viz: undefined };
  const pl = availableLenses(plain);
  ok('no scene, no plot lens', !pl.includes('plot'), pl.join());
  ok('and the graph leads', leadLens(pl, false) === 'graph', String(leadLens(pl, false)));
}

console.log('\n=== a solution chain still leads where there is one ===');
{
  // Worked algebra is read step by step; the animation beside it is a second
  // look at the same work, not a replacement for it.
  const mathMap = {
    context: 'math',
    nodes: [
      { id: 'g', type: 'given', label: '2x + 5 = 11' },
      { id: 's', type: 'step', label: '2x = 6' },
    ],
    edges: [{ from: 'g', to: 's', relation: 'transforms_to' }],
    viz: sanitizeViz({ kind: 'derivative', expr: 'x^2', varName: 'x', a: 1 }),
  };
  const lenses = availableLenses(mathMap);
  ok('solve is available', lenses.includes('solve'), lenses.join());
  ok('and solve leads even with a scene', leadLens(lenses, true) === 'solve');
}

console.log('\n=== degenerate cases ===');
{
  ok('no lenses, no lead', leadLens([], true) === null);
  ok('a scene but no plot lens falls back', leadLens(['graph'], true) === 'graph');
  ok('the lead is always one of the lenses offered',
     ['graph', 'plot', 'solve'].includes(leadLens(['graph', 'plot'], true)));
}

console.log('\n=== a scene survives the map sanitiser ===');
{
  // The bug this catches reached a real conversation: the map sanitiser kept
  // `viz` only when context was "math", so every economics scene the model
  // produced was discarded on the server — after the prompt had asked for it
  // and the lens was ready to draw it. The lens showed Graph and Structure
  // and nothing else, with no error anywhere.
  const econRaw = {
    context: 'learning',
    nodes: [{ id: 'a', type: 'concept', label: 'PPC is bowed' }],
    edges: [],
    viz: { kind: 'ppc', frontier: { xMax: 100, yMax: 80, bowed: true } },
  };
  const m = sanitizeMap(econRaw);
  ok('an economics scene survives a learning conversation', !!m.viz, JSON.stringify(m.viz));
  ok('and it is the right kind', m.viz?.kind === 'ppc', String(m.viz?.kind));
  ok('so the plot lens appears', availableLenses(m).includes('plot'), availableLenses(m).join());

  const sd = sanitizeMap({ ...econRaw, context: 'analysing',
    viz: { kind: 'supply-demand', demand: { intercept: 100, slope: -1 }, supply: { intercept: 20, slope: 1 } } });
  ok('supply-demand survives too', sd.viz?.kind === 'supply-demand', String(sd.viz?.kind));

  // The gate still holds for the mathematics kinds: a derivative scene in a
  // conversation about a house move is not something anyone asked for.
  const stray = sanitizeMap({
    context: 'deciding',
    nodes: [{ id: 'a', type: 'goal', label: 'should we move' }],
    edges: [],
    viz: { kind: 'derivative', expr: 'x^2', varName: 'x', a: 1 },
  });
  ok('a maths scene outside maths is still dropped', !stray.viz, JSON.stringify(stray.viz));

  // …and is kept where it belongs.
  const mathMap = sanitizeMap({
    context: 'math',
    nodes: [{ id: 'a', type: 'given', label: 'f(x) = x^2' }],
    edges: [],
    viz: { kind: 'derivative', expr: 'x^2', varName: 'x', a: 1 },
  });
  ok('a maths scene in maths is kept', mathMap.viz?.kind === 'derivative', String(mathMap.viz?.kind));
}

console.log('\n=== growth in one good pivots the frontier ===');
{
  const at = (r, x) => {
    // frontier height at x, read off the drawn curve
    const c = r.f.objects.find((o) => o.id === 'ppc');
    let best = null;
    for (const pt of c.pts) if (!best || Math.abs(pt.x - x) < Math.abs(best.x - x)) best = pt;
    return best;
  };
  const spec = { kind: 'ppc', frontier: { xMax: 100, yMax: 80, bowed: true }, axes: { x: 'Guns', y: 'Butter' } };

  const both = frame({ ...spec, frontier: { ...spec.frontier, grows: 'both' } }, { g: 1.25 });
  const gunsOnly = frame({ ...spec, frontier: { ...spec.frontier, grows: 'x' } }, { g: 1.25 });
  const rest = frame(spec, { g: 1 });

  const reach = (r) => Math.max(...r.f.objects.find((o) => o.id === 'ppc').pts.map((p) => p.x));
  const top = (r) => Math.max(...r.f.objects.find((o) => o.id === 'ppc').pts.map((p) => p.y));

  ok('uniform growth moves both ends out', reach(both) > reach(rest) && top(both) > top(rest),
     `${reach(both)}/${top(both)} vs ${reach(rest)}/${top(rest)}`);
  ok('growth in guns moves the guns end out', reach(gunsOnly) > reach(rest), String(reach(gunsOnly)));
  ok('and leaves the butter end exactly where it was',
     Math.abs(top(gunsOnly) - top(rest)) < 1e-6, `${top(gunsOnly)} vs ${top(rest)}`);
  ok('which is a pivot, not a slide', reach(gunsOnly) > reach(rest) && top(gunsOnly) <= top(rest) + 1e-6);

  ok('grows defaults to both', frame(spec).sc.frontier.grows === 'both');
  ok('a nonsense value falls back to both',
     frame({ ...spec, frontier: { ...spec.frontier, grows: 'sideways' } }).sc.frontier.grows === 'both');

  // The window must not reserve headroom on an axis growth cannot move.
  const v = resolveView(frame({ ...spec, frontier: { ...spec.frontier, grows: 'x' } }).sc, null);
  ok('no wasted headroom above a pivot in x', v.yMax < 80 * 1.25, String(v.yMax));
  ok('but room for the pivot itself', v.xMax > 100 * 1.2, String(v.xMax));

  // The one that matters pedagogically: opportunity cost changes everywhere.
  const before = frame(spec, { g: 1, q: 50 });
  const after = frame({ ...spec, frontier: { ...spec.frontier, grows: 'x' } }, { g: 1.25, q: 50 });
  ok('and every opportunity cost along it changes',
     val(before, 'oc') !== val(after, 'oc'), `${val(before,'oc')} vs ${val(after,'oc')}`);
}

console.log('\n=== the extractor can see the picture it maintains ===');
{
  // The bug: buildMapPrompt showed the model the nodes and edges but never
  // the scene, so it was asked to keep a picture in step with the
  // conversation while unable to see the picture. Its only honest moves were
  // to invent a new scene from scratch — which reproduced the default and
  // looked like nothing had happened — or to omit the field, which the client
  // reads as "no opinion" and carries the old scene forward. Either way the
  // graph never moved, however plainly someone asked it to.
  const withScene = sanitizeMap({
    context: 'learning',
    nodes: [{ id: 'a', type: 'concept', label: 'PPC is bowed' }],
    edges: [],
    viz: {
      kind: 'ppc',
      frontier: { xMax: 100, yMax: 80, bowed: true },
      axes: { x: 'Guns', y: 'Butter' },
    },
  });
  const p = buildMapPrompt(withScene);
  ok('the scene is in the prompt', p.includes('"kind":"ppc"'), 'kind missing');
  ok('with its frontier', p.includes('"xMax":100'), 'frontier missing');
  ok('and the axis names it was given', p.includes('"Guns"'), 'axes missing');
  ok('and where each handle currently sits', /"id":"q".*"value":0/.test(p), 'param values missing');
  ok('told to edit rather than replace', /EDIT IT rather than replacing/.test(p));
  ok('told that a value moves the picture', /Change a parameter's "value"/.test(p));

  // Slider help is UI copy written for the reader. Showing it is a third of
  // the scene by length and invites the model to rewrite prose nobody asked
  // it to touch.
  ok('slider help text is not sent', !/How much of the first good/.test(p), 'help leaked');

  // The reader's own curves persist on their own; listing them invites the
  // model to rewrite them.
  const withOverlays = sanitizeMap({
    context: 'math',
    nodes: [{ id: 'a', type: 'given', label: 'f' }],
    edges: [],
    viz: { kind: 'function', expr: 'x^2', varName: 'x',
           overlays: [{ id: 'u1', expr: 'sin(x)', visible: true, source: 'user' }] },
  });
  // Scoped to the scene block. The prompt's own RULES section cites
  // "sin(x)/x" as an example of plain notation, so searching the WHOLE
  // prompt for an expression finds the documentation rather than a leak —
  // the first version of this assertion did exactly that and failed on
  // correct code.
  const sceneBlock = (m) => {
    const t = buildMapPrompt(m);
    const i = t.indexOf('The picture currently on screen');
    if (i < 0) return '';
    const j = t.indexOf('{', i);
    return t.slice(j, t.indexOf('\n', j));
  };
  ok("the reader's overlays are not sent", !sceneBlock(withOverlays).includes('overlays'),
     sceneBlock(withOverlays).slice(0, 140));

  // A map with no scene must not gain an empty instruction block.
  const noScene = sanitizeMap({
    context: 'deciding',
    nodes: [{ id: 'a', type: 'goal', label: 'should we move' }],
    edges: [],
  });
  ok('no scene, no block', !buildMapPrompt(noScene).includes('picture currently on screen'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
