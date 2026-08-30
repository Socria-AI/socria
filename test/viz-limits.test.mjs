import { sanitizeViz, compileScene, resolveView, buildFrame, defaults } from './.tmp/logos-viz.mjs';
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
ok('left limit is 11', val(B,'limL')==='11', val(B,'limL'));
ok('right limit is 11', val(B,'limR')==='11', val(B,'limR'));
ok('two-sided is 11', val(B,'L')==='11', val(B,'L'));
ok('one-sided tex is a lim', tex(B,'limL').startsWith('\\lim') && tex(B,'limL').includes('^{-}'), tex(B,'limL'));
// the readings converge on 11 as delta shrinks — the 7 -> 11 <- 15 story
const seq = [2,1,0.5,0.1,0.01].map(d=>{const r=F('2x + 5',3,{d}); return [d, val(r,'fl'), val(r,'fr')];});
console.log('  delta sweep (d, f(3-d), f(3+d)):', JSON.stringify(seq));
ok('readings close in on 11', Number(seq[4][1])>10.9 && Number(seq[4][2])<11.1);
ok('limit readout is CONSTANT as delta moves', seq.every(([d])=>val(F('2x + 5',3,{d}),'L')==='11'));

console.log('\n=== generic across the discontinuity classes ===');
const cases = [
  ['continuous  x^2 @ 2',        'x^2', 2, {}, {L:'4', lL:'4', lR:'4'}],
  ['removable   (x^2-1)/(x-1)@1','(x^2-1)/(x-1)', 1, {}, {L:'2', lL:'2', lR:'2'}],
  ['jump        abs(x)/x @ 0',   'abs(x)/x', 0, {}, {L:'does not exist', lL:'-1', lR:'1'}],
  ['infinite    1/x^2 @ 0',      '1/x^2', 0, {}, {L:'+∞', lL:'+∞', lR:'+∞'}],
  ['signed inf  1/x @ 0',        '1/x', 0, {}, {L:'does not exist', lL:'−∞', lR:'+∞'}],
  ['oscillating sin(1/x) @ 0',   'sin(1/x)', 0, {}, {L:'does not exist', lL:'does not exist', lR:'does not exist'}],
  ['trig        sin(x)/x @ 0',   'sin(x)/x', 0, {}, {L:'1', lL:'1', lR:'1'}],
  ['non-integer 2x + 5 @ 3.5',   '2x + 5', 3.5, {}, {L:'12', lL:'12', lR:'12'}],
  ['linear neg  -3x + 1 @ -2',   '-3x + 1', -2, {}, {L:'7', lL:'7', lR:'7'}],
  ['sqrt        sqrt(x) @ 4',    'sqrt(x)', 4, {}, {L:'2', lL:'2', lR:'2'}],
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
ok('guard: left limit withheld', val(G,'limL')===null);
ok('guard: right limit withheld', val(G,'limR')===null);
ok('guard: two-sided withheld', val(G,'L')===null);
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
