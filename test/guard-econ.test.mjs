// THE ANSWER GUARD BEYOND MATHEMATICS, AND AXES THAT SAY WHAT THEY MEASURE.
//
// Two reliability faults found inspecting Logos 3 for 3.5 (P0):
//
//   · The prediction a market diagram asks for ("what happens to the price
//     when the tax rises?") never showed. The guard was mathematics-only, so
//     a student studying economics with a supply-and-demand diagram on screen
//     was handed the caption — the answer — instead of the question.
//   · No graph drew what its axes measure. A market without "Quantity" and
//     "Price" on it, a frontier without its two goods, cannot be read.
//
// Held here: the guard watches learning mathematics as before, economics
// study with a market, frontier or AD–AS on screen, and any line holding a
// practice display — and nothing else (learning ABOUT history is not a
// problem with an answer to withhold). And every economics frame names its
// axes: by the scene's own words where it gives them, else by the diagram's
// conventions, a side left unnamed taking its own diagram's default rather
// than another's.

import { guardWatches, resolveGuard } from './.tmp/logos-guidance.mjs';
import { sanitizeViz, compileScene, resolveView, buildFrame, defaults, AXIS_DEFAULTS } from './.tmp/logos-viz.mjs';
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

console.log('=== who the guard watches ===');
{
  ok('learning mathematics, as always', guardWatches({ context: 'math', intent: 'learning' }));
  ok('  not mathematics done for its own sake', !guardWatches({ context: 'math', intent: 'utility' }));
  ok('studying economics with a market on screen', guardWatches({ context: 'learning', viz: { kind: 'supply-demand' } }));
  ok('  a frontier', guardWatches({ context: 'learning', viz: { kind: 'ppc' } }));
  ok('  AD–AS', guardWatches({ context: 'learning', viz: { kind: 'ad-as' } }));
  ok('learning about something, with nothing to answer, is not watched', !guardWatches({ context: 'learning' }) && !guardWatches({ context: 'learning', viz: { kind: 'diagram' } }));
  ok('deciding with a market on screen is not watched', !guardWatches({ context: 'deciding', viz: { kind: 'supply-demand' } }));
  ok('a practice display is watched wherever it is', guardWatches({ context: 'planning' }, true));
  ok('nothing at all is not watched', !guardWatches({}));
  ok('the signal from the client is still read strictly', resolveGuard('guard') === 'guard' && resolveGuard('reveal') === 'reveal' && resolveGuard('on') === '');
  const app = readFileSync('components/LogosApp.tsx', 'utf8');
  ok('the workspace reads the guard from this one rule, practice displays included', /guardWatches\(map, \(map\.objects\?\.objs \?\? \[\]\)\.some\(\(o\) => !!displayMeta\(o\.kind\)\?\.practice\)\)/.test(app));
}

const frame = (raw, guarded = false) => {
  const sc = sanitizeViz(raw);
  const fn = compileScene(sc);
  return buildFrame(sc, fn, defaults(sc), resolveView(sc, fn), guarded);
};

console.log('\n=== the axes say what they measure ===');
{
  const market = frame({ kind: 'supply-demand', demand: { intercept: 100, slope: -1 }, supply: { intercept: 20, slope: 1 } });
  ok('a market: quantity across, price up', market.axes?.x === 'Quantity' && market.axes?.y === 'Price', JSON.stringify(market.axes));
  const ppc = frame({ kind: 'ppc', frontier: { xMax: 100, yMax: 80, bowed: true }, axes: { x: 'Guns', y: 'Butter' } });
  ok('a frontier: its two goods, as the scene named them', ppc.axes?.x === 'Guns' && ppc.axes?.y === 'Butter');
  const half = frame({ kind: 'supply-demand', demand: { intercept: 100, slope: -1 }, supply: { intercept: 20, slope: 1 }, axes: { x: 'Coffee (cups/day)' } });
  ok('a side the scene left unnamed takes its own diagram’s convention', half.axes?.x === 'Coffee (cups/day)' && half.axes?.y === 'Price', JSON.stringify(half.axes));
  const adas = frame({ kind: 'ad-as', ad: { intercept: 140, slope: -1 }, sras: { intercept: 20, slope: 1 }, potential: 60 });
  ok('AD–AS: real output across, the price level up', adas.axes?.x === 'Real output' && adas.axes?.y === 'Price level');
  const fn = frame({ kind: 'function', expr: 'x^2' });
  ok('a plain function plot is not given names it was not asked for', fn.axes === undefined);
  const named = frame({ kind: 'function', expr: 'x^2', axes: { x: 'time (s)', y: 'height (m)' } });
  ok('  but takes the ones it is given', named.axes?.x === 'time (s)' && named.axes?.y === 'height (m)');
  ok('the conventions are declared once, per diagram', AXIS_DEFAULTS['supply-demand'].x === 'Quantity' && AXIS_DEFAULTS.ppc.x === 'good X');
  const viz = readFileSync('components/MathViz.tsx', 'utf8');
  ok('the graph draws them', /frame\.axes && \(/.test(viz) && /lg-viz-axis-names/.test(viz));
}

console.log('\n=== the prediction shows while the guard is up ===');
{
  const raw = {
    kind: 'supply-demand',
    demand: { intercept: 100, slope: -1 },
    supply: { intercept: 20, slope: 1 },
    tax: 12,
    says: { caption: 'The tax raises the price buyers pay to 66.', ask: 'Before you move the slider: who do you think bears more of this tax?' },
  };
  const g = frame(raw, true);
  ok('guarded, the frame carries a prediction to make — a question, not the computed price', typeof g.ask === 'string' && /\?$/.test(g.ask) && !/66/.test(g.ask), JSON.stringify(g.ask));
  const open = frame(raw, false);
  ok('  unguarded, the caption says what was computed', typeof open.caption === 'string' && open.caption.length > 0);
  const viz = readFileSync('components/MathViz.tsx', 'utf8');
  ok('  and the caption line shows the question instead of the answer', /guarded && frame\.ask \? frame\.ask : frame\.caption/.test(viz));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
