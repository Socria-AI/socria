import { sanitizeViz, compileScene, resolveView, buildFrame, defaults, sweptParam, sweepValue } from './.tmp/logos-viz.mjs';

// Deterministic PRNG so a failure is reproducible.
let seed = 0x5eed;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
const pick = (a) => a[Math.floor(rnd() * a.length)];

const KINDS = ['function','limit','derivative','riemann','taylor','sequence','vectors','matrix','distribution','ode','diagram','supply-demand','ppc','ad-as', 'wat', 42, null, {}, 'FUNCTION'];
const EXPRS = ['x^2','sin(x)','1/x','a*x+b','x % 2','abs(x)','','(((','x^x','y - x','ln(x)','q*z*w','constructor(x)','__proto__','x'.repeat(5000),'2+2','sqrt(-1-x^2)', 'x^(1/2)', 'exp(x^2)^2', 42, null, ['x'], {e:'x'}];
const NUMS = [0,1,-1,0.5,3,NaN,Infinity,-Infinity,1e9,-1e9,1e-9,'3','x',null,[],{},true,-100,100,1e4+1];
const rnum = () => pick(NUMS);
const rparam = () => rnd() < 0.15 ? pick(['bad', 42, null]) : ({
  id: pick(['a','b','c','d','h','n','m','k','t','y','y0','x','pi','__proto__','constructor','toString','ab1','q',7,null,'']),
  min: rnum(), max: rnum(), step: rnum(), value: rnum(),
  integer: pick([true,false,'yes',1]), sweep: pick(['up','down','sideways',1,null]), toward: pick(['0','\\infty',42,null,'x'.repeat(400)]),
});
const rmatrix = () => pick([
  [[rnum(),rnum()],[rnum(),rnum()]], [[1,2],[3]], [[1,2,3],[4,5,6],[7,8,9]], 'matrix', [[{},[]],[null,'a']], [], null, [[0,0],[0,0]], [[1e6,0],[0,1]],
]);
const rvectors = () => pick([
  [{x:rnum(),y:rnum(),label:pick(['u',42,'x'.repeat(300),null])}],
  Array.from({length: Math.floor(rnd()*250)}, () => ({x:rnum(),y:rnum()})),
  [{x:0,y:0}], 'vecs', [null, {x:1}], [], [{x:1,y:2},{y:3,x:-1}],
]);

// The open kind is the one place a model authors DRAWING instructions rather
// than parameters to a builder, so it is the one that most needs proving
// against nonsense: a bad coordinate must become a missing part, never a
// broken picture or a NaN in the SVG.
const COORD = () => pick([
  0, 1, -1, 3.5, 1e7, -1e7, NaN, Infinity, 'a', 'k', 'z', 'a*2', 'x', '1/0',
  '(((', '', 'x'.repeat(500), 'constructor', '__proto__', null, undefined, [], {}, true, '2+2',
]);
const rpart = () => pick([
  { o: 'curve', expr: pick(EXPRS), from: COORD(), to: COORD(), tone: pick(['accent','nope',42,null]), label: pick(['c', 'x'.repeat(200), 42]) },
  { o: 'point', x: COORD(), y: COORD(), hollow: pick([true,'yes',1]), label: pick(['p',null,42]) },
  { o: 'segment', x1: COORD(), y1: COORD(), x2: COORD(), y2: COORD(), width: pick([1,0,-5,99,'wide',null]) },
  { o: 'line', x: COORD(), y: COORD(), slope: COORD() },
  { o: 'vector', x1: COORD(), y1: COORD(), x2: COORD(), y2: COORD() },
  { o: 'region', pts: pick([[{x:COORD(),y:COORD()},{x:COORD(),y:COORD()},{x:COORD(),y:COORD()}], [], 'pts', null, Array.from({length:300},()=>({x:COORD(),y:COORD()}))]) },
  { o: 'rects', bars: pick([[{x0:COORD(),x1:COORD(),y:COORD()}], [], null, 'bars']) },
  { o: 'sequence', pts: pick([[{x:COORD(),y:COORD()}], [], null]), stems: pick([true,1,'y']) },
  { o: 'vrule', at: COORD() }, { o: 'hrule', at: COORD() },
  { o: 'label', x: COORD(), y: COORD(), text: pick(['t', '', 'x'.repeat(900), 42, null]), anchor: pick(['start','end','middle','over',null]), dy: pick([0,-6,900,'up',null]) },
  { o: 'nonsense' }, { o: 42 }, {}, null, 'part', 7, [],
]);

const scene = () => ({
  kind: pick(KINDS),
  parts: pick([
    [rpart()], [rpart(), rpart(), rpart()], Array.from({length: 80}, rpart),
    [], null, 'parts', 42, [null, undefined, {}],
  ]),
  quantities: pick([
    [{ tex: 'k', expr: pick(EXPRS), help: pick(['h', 'x'.repeat(900), 42]) }],
    [{ tex: 42, expr: null }], [], null, 'q', Array.from({length: 20}, () => ({ tex: 'a', expr: 'a' })),
  ]),
  says: pick([
    { caption: pick(['c', 'x'.repeat(900), 42]), narration: pick(['n', null]), ask: pick(['a?', 42]) },
    {}, null, 'says', 42,
  ]),
  axes: pick([{ x: 'A', y: 'B' }, { x: 42 }, {}, null, 'axes']),
  expr: pick(EXPRS),
  varName: pick(['x','t','n','y','xx','1','',42,null,'__proto__']),
  view: pick([{xMin:rnum(),xMax:rnum(),yMin:rnum(),yMax:rnum()}, {xMin:rnum(),xMax:rnum()}, {}, null, 'view', []]),
  params: pick([[rparam()],[rparam(),rparam(),rparam()],Array.from({length:12},rparam),'params',null,[],[rparam(),rparam(),rparam(),rparam(),rparam(),rparam()]]),
  a: rnum(), b: rnum(),
  rule: pick(['left','right','midpoint','trapezoid',3,null]),
  matrix: rmatrix(), vectors: rvectors(),
  dist: pick(['normal','binomial','poisson','exponential','cauchy','NORMAL',1,null,{}]),
  partial: pick([true,false,'yes',0]), ghost: pick([true,false,1]),
  title: pick(['t','x'.repeat(5000),42,null,{}]),
  __proto__: pick([{},null]), toString: pick([undefined, 'boom']),
});

let n=0, nonNull=0, throws=0, nanFrames=0, badTitle=0;
const N = 4000;
for (let i=0;i<N;i++) {
  const raw = pick([scene(), null, undefined, 42, 'scene', [], (()=>{const s=scene(); delete s.expr; return s;})(), (()=>{const s=scene(); delete s.view; return s;})()]);
  n++;
  let s;
  try { s = sanitizeViz(raw); } catch(e) { throws++; console.log('SANITIZE THREW at', i, e.message, JSON.stringify(raw).slice(0,200)); break; }
  if (!s) continue;
  nonNull++;
  try {
    if (typeof s.title === 'string' && s.title.length > 80) { badTitle++; console.log('LONG TITLE', s.title.length); }
    const fn = compileScene(s);
    const view = resolveView(s, fn);
    const d = defaults(s);
    const frames = [buildFrame(s, fn, d, view, false), buildFrame(s, fn, d, view, true)];
    // sweep endpoints too
    const sw = sweptParam(s);
    if (sw) {
      for (const t of [0, 0.5, 1]) {
        frames.push(buildFrame(s, fn, {...d, [sw.id]: sweepValue(sw, t)}, view, rnd()<0.5));
      }
    }
    for (const f of frames) {
      // NaN y inside sampled pts is the pen-lift mechanism (asymptotes) and
      // the renderer skips those points — only NaN that would reach an SVG
      // attribute directly is a defect.
      for (const o of f.objects) {
        const bad = (v) => typeof v === 'number' ? !Number.isFinite(v) : v === null;
        let hit = false;
        if (o.o === 'point' || o.o === 'label') hit = bad(o.x) || bad(o.y);
        else if (o.o === 'segment' || o.o === 'vector') hit = [o.x1,o.y1,o.x2,o.y2].some(bad);
        else if (o.o === 'line') hit = bad(o.x) || bad(o.y) || bad(o.slope);
        else if (o.o === 'vrule' || o.o === 'hrule') hit = bad(o.at);
        else if (o.o === 'rects') hit = o.bars.some(b => bad(b.x0) || bad(b.x1) || bad(b.y));
        else if (o.o === 'mesh') hit = o.lines.some(l => l.some(p => bad(p.x))); // x must be finite; y NaN lifts pen? mesh y NaN would draw — flag both
        if (o.o === 'mesh') hit = hit || o.lines.some(l => l.some(p => bad(p.x) || bad(p.y)));
        if (hit) { nanFrames++; console.log('NaN COORD at', i, s.kind, o.o, JSON.stringify(o).slice(0,160)); break; }
      }
      if (nanFrames > 4) break;
    }
  } catch(e) { throws++; console.log('CHAIN THREW at', i, s.kind, e.message); if (throws>4) break; }
}
console.log(`\n${n} inputs | ${nonNull} accepted | throws: ${throws} | NaN frames: ${nanFrames} | long titles: ${badTitle}`);
process.exit(throws || nanFrames || badTitle ? 1 : 0);
