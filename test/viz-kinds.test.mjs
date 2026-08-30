import { sanitizeViz, compileScene, resolveView, buildFrame, defaults, sweptParam, eigen2x2, distSpec, rk4Trajectory, kindNeedsExpr } from './.tmp/logos-viz.mjs';
let pass=0, fail=0;
const ok=(n,c,x='')=>c?pass++:(fail++,console.log('FAIL',n,x));
const near=(n,got,want,tol=1e-4)=>ok(n, typeof got==='number' && Math.abs(got-want)<tol, `got ${got} want ${want}`);
const F = (raw, vals=null, guarded=false) => {
  const s = sanitizeViz(raw);
  if (!s) return null;
  const fn = compileScene(s);
  const view = resolveView(s, fn);
  return { s, view, f: buildFrame(s, fn, vals ?? defaults(s), view, guarded) };
};
const ro = (r,id) => r.f.readouts.find(x=>x.id===id);

// ── taylor ──
const T = F({kind:'taylor', expr:'sin(x)', a:0, view:{xMin:-7,xMax:7}}, {k:3});
ok('taylor builds', !!T);
ok('taylor two curves', T.f.objects.filter(o=>o.o==='curve').length===2);
// P3 of sin at x=2: 2 - 8/6 = 0.666..
const P = T.f.objects.find(o=>o.id==='P');
const at2 = P.pts.reduce((b,p)=>Math.abs(p.x-2)<Math.abs(b.x-2)?p:b);
// compare at the sampled x itself, not at exactly 2 — the grid has no node there
near('P3 matches x - x^3/6 at nearest sample', at2.y, at2.x - at2.x**3/6, 1e-9);
near('c3 of sin = -1/6', Number(ro(T,'ck').value), -1/6, 1e-4);
ok('taylor guard holds c_k', ro(F({kind:'taylor',expr:'sin(x)',a:0,view:{xMin:-7,xMax:7}},{k:3},true),'ck').value===null);
ok('taylor err always shown', ro(F({kind:'taylor',expr:'sin(x)',a:0,view:{xMin:-7,xMax:7}},{k:3},true),'err').value!==null);
ok('abs has no series -> rejected', sanitizeViz({kind:'taylor',expr:'abs(x)',a:0,view:{xMin:-4,xMax:4}})===null);
ok('1/x at 0 rejected', sanitizeViz({kind:'taylor',expr:'1/x',a:0,view:{xMin:-4,xMax:4}})===null);
ok('1/x at 2 accepted', !!sanitizeViz({kind:'taylor',expr:'1/x',a:2,view:{xMin:0.5,xMax:4}}));
ok('taylor k sweeps up', sweptParam(T.s).id==='k' && sweptParam(T.s).sweep==='up');

// ── sequence ──
const Q = F({kind:'sequence', expr:'1/n^2', partial:true}, {m:10});
ok('sequence forced varName n', Q.s.varName==='n');
near('a_10', Number(ro(Q,'am').value), 0.01, 1e-6);
const S10 = Array.from({length:10},(_,i)=>1/((i+1)**2)).reduce((a,b)=>a+b);
near('S_10', Number(ro(Q,'Sm').value), S10, 1e-4);
ok('series sum guarded', ro(F({kind:'sequence',expr:'1/n^2',partial:true},{m:10},true),'lim').value===null);
const est = ro(Q,'lim').value;
ok('pi^2/6 estimate close', est !== null && Math.abs(parseFloat(est.replace('≈','')) - Math.PI**2/6) < 0.01, est);
const H = F({kind:'sequence', expr:'1/n', partial:true}, {m:10});
ok('harmonic: not settling', ro(H,'lim').value==='not settling', ro(H,'lim').value);
const G = F({kind:'sequence', expr:'(-1)^n', partial:false}, {m:10});
ok('(-1)^n: no limit', ro(G,'lim').value==='no limit', ro(G,'lim').value);
const C = F({kind:'sequence', expr:'1/2^n', partial:false}, {m:8});
ok('geometric limit ≈ 0', ro(C,'lim').value==='≈ 0', ro(C,'lim').value);

// ── vectors ──
const V = F({kind:'vectors', vectors:[{x:2,y:1},{x:-1,y:2}]}, {s:2, t:-1});
ok('vectors builds without expr', !!V);
ok('kindNeedsExpr false', !kindNeedsExpr('vectors'));
ok('combo readout', ro(V,'combo').value === '(5, 0)', ro(V,'combo')?.value);
ok('5 base+combo vectors', V.f.objects.filter(o=>o.o==='vector').length===5);
ok('single vector: no sliders', F({kind:'vectors', vectors:[{x:1,y:1}]}).s.params.length===0);
ok('zero vector rejected', sanitizeViz({kind:'vectors', vectors:[{x:0,y:0}]})===null);

// ── matrix ──
const eig = eigen2x2([[2,1],[1,2]]);
near('eig l1', eig.values[0], 3); near('eig l2', eig.values[1], 1);
ok('eig v1 along (1,1)', Math.abs(Math.abs(eig.vectors[0].x)-Math.abs(eig.vectors[0].y))<1e-9);
ok('rotation -> complex', eigen2x2([[0,-1],[1,0]])===null);
const M = F({kind:'matrix', matrix:[[2,1],[1,2]]}, {t:1});
near('det readout', Number(ro(M,'det').value), 3);
ok('eig readout', ro(M,'eig').value.includes('3'), ro(M,'eig').value);
const Mg = F({kind:'matrix', matrix:[[2,1],[1,2]]}, {t:1}, true);
ok('guard: det withheld', ro(Mg,'det').value===null);
ok('guard: eig withheld', ro(Mg,'eig').value===null);
ok('guard: no eigenlines drawn', !Mg.f.objects.some(o=>o.id.startsWith('eig')));
ok('unguarded: eigenlines drawn', M.f.objects.filter(o=>o.id.startsWith('eig')).length===2);
// t=0 must be identity: e1 at (1,0)
const M0 = F({kind:'matrix', matrix:[[2,1],[1,2]]}, {t:0});
const e1 = M0.f.objects.find(o=>o.id==='e1');
ok('t=0 is identity', Math.abs(e1.x2-1)<1e-9 && Math.abs(e1.y2)<1e-9);
ok('zero matrix rejected', sanitizeViz({kind:'matrix', matrix:[[0,0],[0,0]]})===null);
ok('bad matrix rejected', sanitizeViz({kind:'matrix', matrix:[[1,2],[3]]})===null);
ok('t sweeps up', sweptParam(M.s).id==='t');

// ── distribution ──
const N = distSpec('normal', {u:0, s:1});
near('N(0,1) peak', N.pdf(0), 1/Math.sqrt(2*Math.PI));
near('N mean', N.mean, 0); near('N sd', N.sd, 1);
const B = distSpec('binomial', {n:10, p:0.5});
near('binom pmf(5)', B.pdf(5), 252/1024, 1e-9);
near('binom mean', B.mean, 5);
const Po = distSpec('poisson', {l:4});
near('poisson pmf(0)', Po.pdf(0), Math.exp(-4), 1e-12);
const D = F({kind:'distribution', dist:'normal', a:-1, b:1});
near('P(-1<=Z<=1)', Number(ro(D,'prob').value), 0.6827, 0.002);
const Dg = F({kind:'distribution', dist:'normal', a:-1, b:1}, null, true);
ok('guard: prob withheld', ro(Dg,'prob').value===null);
// the normal's mean IS the mu slider — no derived readout to withhold there;
// the binomial's mean np is a genuine computation and must guard.
ok('normal: no redundant mean readout', ro(Dg,'mu')===undefined);
ok('binomial: mean withheld under guard', ro(F({kind:'distribution', dist:'binomial', a:3, b:5}, null, true),'mu').value===null);
ok('region still drawn under guard', Dg.f.objects.some(o=>o.o==='region'));
const Db = F({kind:'distribution', dist:'binomial', a:3, b:5});
const acc = [3,4,5].map(k=>distSpec('binomial',{n:12,p:0.5}).pdf(k)).reduce((a,b)=>a+b);
near('discrete P(3<=X<=5) n=12', Number(ro(Db,'prob').value), acc, 1e-4);
ok('bad dist rejected', sanitizeViz({kind:'distribution', dist:'cauchy'})===null);
ok('normal view spans mu±4sig', Math.abs(D.view.xMin - (-4)) < 0.5);

// ── ode ──
// dy/dx = y, y(0)=1 -> e^x
const O = F({kind:'ode', expr:'y', a:0, view:{xMin:-2,xMax:2}}, {y0:1});
ok('ode builds', !!O);
const traj = O.f.objects.find(o=>o.id==='traj');
const at1 = traj.pts.reduce((b,p)=>Math.abs(p.x-1)<Math.abs(b.x-1)?p:b);
near('RK4: y(1)=e', at1.y, Math.E, 1e-3);
const atm1 = traj.pts.reduce((b,p)=>Math.abs(p.x+1)<Math.abs(b.x+1)?p:b);
near('RK4 backwards: y(-1)=1/e', atm1.y, 1/Math.E, 1e-3);
ok('field mesh present', O.f.objects.some(o=>o.o==='mesh'));
ok('y not a slider', !O.s.params.some(p=>p.id==='y'));
ok('y0 slider present', O.s.params.some(p=>p.id==='y0'));
// dy/dx = -k*y with param k
const Ok2 = F({kind:'ode', expr:'-k*y', a:0, view:{xMin:0,xMax:4}, params:[{id:'k',min:0.1,max:3,step:0.1,value:1}]}, {k:2, y0:3});
const oat1 = Ok2.f.objects.find(o=>o.id==='traj').pts.reduce((b,p)=>Math.abs(p.x-1)<Math.abs(b.x-1)?p:b);
near('decay y(1)=3e^-2', oat1.y, 3*Math.exp(-2), 1e-3);
ok('constant slope field ok (dy/dx=2)', !!F({kind:'ode', expr:'2', view:{xMin:-2,xMax:2}}));

// ── ghost ──
const Gh = F({kind:'function', expr:'a*x^2', ghost:true, params:[{id:'a',min:-3,max:3,step:0.1,value:1}]}, {a:2});
ok('ghost drawn when moved', Gh.f.objects.some(o=>o.id==='ghost'));
const Gh0 = F({kind:'function', expr:'a*x^2', ghost:true, params:[{id:'a',min:-3,max:3,step:0.1,value:1}]}, {a:1});
ok('no ghost at defaults', !Gh0.f.objects.some(o=>o.id==='ghost'));

// ── no NaN in any frame ──
for (const [nm, r] of [['taylor',T],['seq',Q],['vec',V],['mat',M],['dist',D],['ode',O]]) {
  ok(`${nm}: finite view`, [r.view.xMin,r.view.xMax,r.view.yMin,r.view.yMax].every(Number.isFinite));
  ok(`${nm}: view nondegenerate`, r.view.xMax>r.view.xMin && r.view.yMax>r.view.yMin);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
