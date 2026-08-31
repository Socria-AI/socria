import { sanitizeViz, compileScene, resolveView, buildFrame, defaults, precisionFor } from './.tmp/logos-viz.mjs';
let pass=0, fail=0;
const ok=(n,c,x='')=>c?pass++:(fail++,console.log('FAIL',n,x));
const F=(expr,a,vals,g=false,view)=>{
  const s=sanitizeViz({kind:'limit',expr,a,view:view??{xMin:a-4,xMax:a+4}});
  if(!s) return null;
  const fn=compileScene(s); const v=resolveView(s,fn);
  return {s, f:buildFrame(s,fn,{...defaults(s),...vals},v,g)};
};
const R=(r,id)=>r.f.readouts.find(x=>x.id===id);
const tex=(r,id)=>R(r,id)?.tex;
const val=(r,id)=>R(r,id)?.value;

console.log('=== the reported bug: lim x->3 (2x+5), delta = 2 ===');
const B = F('2x + 5', 3, {d:2});
console.log('  delta      =', val(B,'d'));
console.log('  f(3 - d)   =', val(B,'fl'), '  tex:', tex(B,'fl'));
console.log('  f(3 + d)   =', val(B,'fr'), '  tex:', tex(B,'fr'));
console.log('  lim left   =', val(B,'limL'), '  tex:', tex(B,'limL'));
console.log('  lim right  =', val(B,'limR'));
console.log('  lim        =', val(B,'L'), '  tex:', tex(B,'L'));
ok('sample left is 7 (not the limit)', val(B,'fl')==='7', val(B,'fl'));
ok('sample right is 15', val(B,'fr')==='15', val(B,'fr'));
ok('sample tex says f(3 - delta)', tex(B,'fl').includes('\\delta') && !tex(B,'fl').includes('^{-}'), tex(B,'fl'));
ok('NO f(3^-) notation anywhere', !JSON.stringify(B.f.readouts).includes('3^{-}\\right)') && !tex(B,'fl').includes('3^{-}'));
ok('two-sided is 11', val(B,'L')==='11', val(B,'L'));
// Both sides arrive at 11, so printing "11", "11" above a two-sided "11" is
// three lines making one point. They come back the moment they disagree —
// see the jump case below, where they are the entire story.
ok('one-sided limits are hidden when they agree', R(B,'limL')===undefined && R(B,'limR')===undefined);
ok('and delta is left to its slider', R(B,'d')===undefined);
// The notation itself is still checked, on a case where it is shown.
const JT = F('abs(x)/x', 0, {});
ok('one-sided tex is a lim', tex(JT,'limL').startsWith('\\lim') && tex(JT,'limL').includes('^{-}'), tex(JT,'limL'));
ok('right-hand tex carries ^{+}', tex(JT,'limR').includes('^{+}'), tex(JT,'limR'));
// the readings converge on 11 as delta shrinks — the 7 -> 11 <- 15 story
const seq = [2,1,0.5,0.1,0.01].map(d=>{const r=F('2x + 5',3,{d}); return [d, val(r,'fl'), val(r,'fr')];});
console.log('  delta sweep (d, f(3-d), f(3+d)):', JSON.stringify(seq));
ok('readings close in on 11', Number(seq[4][1])>10.9 && Number(seq[4][2])<11.1);
ok('limit readout is CONSTANT as delta moves', seq.every(([d])=>val(F('2x + 5',3,{d}),'L')==='11'));

console.log('\n=== generic across the discontinuity classes ===');
// lL/lR of `undefined` means the one-sided rows are deliberately not drawn:
// both sides reach the same finite value, so they would restate L. Anything
// else — a jump, an infinity, an oscillation — and they are what explains L,
// so they appear.
const cases = [
  ['continuous  x^2 @ 2',        'x^2', 2, {}, {L:'4', lL:undefined, lR:undefined}],
  ['removable   (x^2-1)/(x-1)@1','(x^2-1)/(x-1)', 1, {}, {L:'2', lL:undefined, lR:undefined}],
  ['jump        abs(x)/x @ 0',   'abs(x)/x', 0, {}, {L:'does not exist', lL:'-1', lR:'1'}],
  ['infinite    1/x^2 @ 0',      '1/x^2', 0, {}, {L:'+∞', lL:'+∞', lR:'+∞'}],
  ['signed inf  1/x @ 0',        '1/x', 0, {}, {L:'does not exist', lL:'−∞', lR:'+∞'}],
  ['oscillating sin(1/x) @ 0',   'sin(1/x)', 0, {}, {L:'does not exist', lL:'does not exist', lR:'does not exist'}],
  ['trig        sin(x)/x @ 0',   'sin(x)/x', 0, {}, {L:'1', lL:undefined, lR:undefined}],
  ['non-integer 2x + 5 @ 3.5',   '2x + 5', 3.5, {}, {L:'12', lL:undefined, lR:undefined}],
  ['linear neg  -3x + 1 @ -2',   '-3x + 1', -2, {}, {L:'7', lL:undefined, lR:undefined}],
  ['sqrt        sqrt(x) @ 4',    'sqrt(x)', 4, {}, {L:'2', lL:undefined, lR:undefined}],
];
for (const [name, expr, a, vals, want] of cases) {
  const r = F(expr, a, vals);
  if (!r) { ok(name+' builds', false, 'REJECTED'); continue; }
  const got = {L: val(r,'L'), lL: val(r,'limL'), lR: val(r,'limR')};
  const good = got.L===want.L && got.lL===want.lL && got.lR===want.lR;
  console.log(`  ${name.padEnd(30)} L=${String(got.L).padEnd(15)} L-=${String(got.lL).padEnd(15)} L+=${got.lR}`);
  ok(name, good, JSON.stringify(got)+' want '+JSON.stringify(want));
}

console.log('\n=== objects: the picture matches the arithmetic ===');
const J = F('abs(x)/x', 0, {});
ok('jump draws two open circles', J.f.objects.filter(o=>o.o==='point'&&o.hollow).length===2);
ok('jump draws no single L rule', !J.f.objects.some(o=>o.id==='Lrule'));
const Rm = F('(x^2-1)/(x-1)', 1, {});
ok('removable draws the hole at L', Rm.f.objects.some(o=>o.id==='hole'&&Math.abs(o.y-2)<1e-6));
ok('removable draws the L rule', Rm.f.objects.some(o=>o.id==='Lrule'));
const C = F('x^2', 2, {});
ok('continuous: f(a) point drawn', C.f.objects.some(o=>o.id==='fa'));

console.log('\n=== guard ===');
const G = F('2x + 5', 3, {d:2}, true);
ok('guard: sample readings SHOWN', val(G,'fl')==='7' && val(G,'fr')==='15');
ok('guard: two-sided withheld', val(G,'L')===null);
// 2x+5 is continuous, so the one-sided rows are not drawn at all here — a
// stronger result than withholding them. Where they ARE drawn, the guard
// must still hold them:
const GJ = F('abs(x)/x', 0, {}, true);
ok('guard: left limit withheld where shown', val(GJ,'limL')===null, String(val(GJ,'limL')));
ok('guard: right limit withheld where shown', val(GJ,'limR')===null, String(val(GJ,'limR')));
ok('guard: samples still shown on a jump', val(GJ,'fl')!==null && val(GJ,'fr')!==null);
// The curve itself passes through (3, 11) — 2x+5 cannot be drawn otherwise,
// and a faithful drawing is the long-standing plot-lens precedent. What must
// not carry the answer is anything that STATES it: a readout value, an object
// label, the caption, the ask.
const stated = JSON.stringify([
  G.f.readouts.map(r=>r.value), G.f.objects.map(o=>o.label).filter(Boolean), G.f.caption, G.f.ask,
]);
ok('guard: 11 never STATED', !stated.includes('11'), stated);
ok('guard: f(a) marker carries no label', !G.f.objects.some(o=>o.id==='fa' && o.label));
ok('guard: no L rule', !G.f.objects.some(o=>o.id==='Lrule'));
ok('guard: no jump circles', !F('abs(x)/x',0,{},true).f.objects.some(o=>o.id==='jl'||o.id==='jr'));
ok('help present on every readout', B.f.readouts.every(r=>typeof r.help==='string'&&r.help.length>20));
// Help may name the POINT being approached (it is in the question), never a
// limit or a derived value.
const lim = ['11'];
ok('help never states a limit', !B.f.readouts.some(r=>lim.some(L=>(r.help||'').includes(L))));

console.log('\n=== the readout row says only what it has to ===');
{
  const ids = (scene, vals) => buildFrame(scene, compileScene(scene), vals, resolveView(scene, compileScene(scene)), false)
    .readouts.map((r) => r.id);

  // A removable hole: both sides arrive at 4, so the one-sided limits would
  // be two more lines saying what the third already says.
  const hole = sanitizeViz({ kind: 'limit', expr: '(x^2-9)/(x-3)', varName: 'x', at: 3 });
  const agree = ids(hole, defaults(hole));
  ok('delta is not duplicated out of the slider', !agree.includes('d'), agree.join());
  ok('both samples are shown', agree.includes('fl') && agree.includes('fr'), agree.join());
  ok('the limit is shown', agree.includes('L'), agree.join());
  ok('one-sided limits are hidden when they agree', !agree.includes('limL') && !agree.includes('limR'), agree.join());
  ok('three readouts, not six', agree.length === 3, agree.join());

  // A jump: now the two sides ARE the story, so they come back.
  const jump = sanitizeViz({ kind: 'limit', expr: 'abs(x)/x', varName: 'x', at: 0 });
  const differ = ids(jump, defaults(jump));
  ok('one-sided limits return when they disagree',
     differ.includes('limL') && differ.includes('limR'), differ.join());
  ok('and the two-sided limit still says it does not exist', differ.includes('L'), differ.join());
}

console.log('\n=== a slider prints a number that actually moves ===');
{
  ok('a thousandths step needs 4 decimals', precisionFor(0.0006) === 4, String(precisionFor(0.0006)));
  ok('a tenths step needs 1', precisionFor(0.1) === 1, String(precisionFor(0.1)));
  ok('a halves step needs 1', precisionFor(0.5) === 1, String(precisionFor(0.5)));
  ok('a whole step needs none', precisionFor(1) === 0, String(precisionFor(1)));
  ok('a step larger than 1 needs none', precisionFor(5) === 0, String(precisionFor(5)));
  ok('capped so it cannot print noise', precisionFor(1e-30) === 6, String(precisionFor(1e-30)));
  ok('a raised cap is honoured', precisionFor(1e-30, 8) === 8, String(precisionFor(1e-30, 8)));
  ok('nonsense falls back', precisionFor(0) === 3 && precisionFor(NaN) === 3 && precisionFor(-1) === 3);

  // The property that matters: one step must change the printed number.
  for (const step of [0.0006, 0.001, 0.01, 0.1, 0.25, 0.5]) {
    const p = precisionFor(step);
    const a = (0).toFixed(p), b = step.toFixed(p);
    ok(`step ${step} is visible at ${p} dp`, a !== b, `${a} vs ${b}`);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
