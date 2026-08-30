import { sanitizeViz, compileScene, resolveView, buildFrame, defaults, overlayLegend, sceneDraws, overlayId } from './.tmp/logos-viz.mjs';
let pass=0, fail=0;
const ok=(n,c,x='')=>c?pass++:(fail++,console.log('FAIL',n,x));
const F=(raw,g=false)=>{const s=sanitizeViz(raw); if(!s) return null; const fn=compileScene(s); const v=resolveView(s,fn); return {s, f:buildFrame(s,fn,defaults(s),v,g), view:v};};
const curves=(r)=>r.f.objects.filter(o=>o.o==='curve').map(o=>o.id);

console.log('=== C: "Graph y = x²" — overlay-only scene ===');
const C = F({kind:'function', overlays:[{expr:'x^2', source:'user'}], view:{xMin:-5,xMax:5}});
ok('C builds with no expr of its own', !!C);
ok('C: one curve, and it is an overlay', curves(C).length===1 && curves(C)[0].startsWith('ov_'), JSON.stringify(curves(C)));
ok('C: scene has no own expr', !C.s.expr);
console.log('   curves:', curves(C), '| caption:', C.f.caption);

console.log('\n=== D: "Add y = 2x + 5" — both remain ===');
const D = F({kind:'function', overlays:[{expr:'x^2'},{expr:'2x + 5'}], view:{xMin:-5,xMax:5}});
ok('D: two curves', curves(D).length===2, JSON.stringify(curves(D)));
ok('D: distinct colours', new Set(D.f.objects.filter(o=>o.o==='curve').map(o=>o.tone)).size===2);

console.log('\n=== E: "Remove the quadratic" — only 2x+5 remains ===');
const E = F({kind:'function', overlays:[{expr:'2x + 5'}], view:{xMin:-5,xMax:5}});
ok('E: one curve', curves(E).length===1);
ok('E: it is the linear one', overlayLegend(E.s)[0].ov.expr==='2x + 5');

console.log('\n=== hide / show (toggle, not remove) ===');
const H = F({kind:'function', overlays:[{expr:'x^2',visible:false},{expr:'2x+5'}], view:{xMin:-5,xMax:5}});
ok('hidden curve not drawn', curves(H).length===1);
ok('hidden curve still in the list', (H.s.overlays||[]).length===2);
const H2 = F({kind:'function', overlays:[{expr:'x^2',visible:false},{expr:'2x+5'}], view:{xMin:-5,xMax:5}});
ok('colour slot held while hidden', overlayLegend(H2.s)[1].tone === overlayLegend(F({kind:'function',overlays:[{expr:'x^2'},{expr:'2x+5'}],view:{xMin:-5,xMax:5}}).s)[1].tone);

console.log('\n=== 7: coexistence with a teaching scene ===');
const Co = F({kind:'limit', expr:'2x + 5', a:3, view:{xMin:-1,xMax:7}, overlays:[{expr:'x^2', source:'user'}]});
ok('limit scene intact', Co.f.readouts.some(r=>r.id==='limL') && Co.f.objects.some(o=>o.id==='a'));
ok('limit curve + overlay both drawn', curves(Co).includes('f') && curves(Co).some(c=>c.startsWith('ov_')), JSON.stringify(curves(Co)));
ok('limit maths untouched', Co.f.readouts.find(r=>r.id==='L').value==='11');
const CoG = F({kind:'limit', expr:'2x + 5', a:3, view:{xMin:-1,xMax:7}, overlays:[{expr:'x^2'}]}, true);
ok('guard still holds with overlays', CoG.f.readouts.find(r=>r.id==='L').value===null);
ok('overlay still drawn under guard', curves(CoG).some(c=>c.startsWith('ov_')));

console.log('\n=== overlays on every kind ===');
for (const [k, extra] of [['derivative',{expr:'x^2',a:1}],['riemann',{expr:'x^2',a:0,b:2}],['taylor',{expr:'sin(x)',a:0}],['ode',{expr:'y',a:0}],['distribution',{dist:'normal'}],['matrix',{matrix:[[2,1],[1,2]]}]]) {
  const r = F({kind:k, view:{xMin:-3,xMax:3}, ...extra, overlays:[{expr:'x/2'}]});
  ok(`${k}: overlay drawn`, !!r && curves(r).some(c=>c.startsWith('ov_')), r?JSON.stringify(curves(r)):'null');
}

console.log('\n=== validation ===');
ok('bad overlay dropped', (F({kind:'function',overlays:[{expr:'x^2'},{expr:'((('}],view:{xMin:-3,xMax:3}}).s.overlays||[]).length===1);
ok('unbound name dropped', (F({kind:'function',overlays:[{expr:'q*x'}],view:{xMin:-3,xMax:3}})===null));
ok('overlay may use scene params', (F({kind:'function',expr:'x',params:[{id:'a',min:0,max:3,step:0.1,value:1}],overlays:[{expr:'a*x^2'}],view:{xMin:-3,xMax:3}}).s.overlays||[]).length===1);
ok('capped at 6', (F({kind:'function',overlays:Array.from({length:12},(_,i)=>({expr:`x+${i}`})),view:{xMin:-3,xMax:3}}).s.overlays||[]).length===6);
ok('duplicate ids deduped', (F({kind:'function',overlays:[{id:'a',expr:'x'},{id:'a',expr:'x^2'}],view:{xMin:-3,xMax:3}}).s.overlays||[]).length===1);
ok('empty array = cleared, and a bare function scene then dies', F({kind:'function',overlays:[],view:{xMin:-3,xMax:3}})===null);
ok('empty array on a lesson scene just clears overlays', (F({kind:'limit',expr:'x^2',a:1,overlays:[],view:{xMin:-3,xMax:3}}).s.overlays||[]).length===0);
ok('undefined overlays -> field absent', F({kind:'limit',expr:'x^2',a:1,view:{xMin:-3,xMax:3}}).s.overlays===undefined);
ok('sceneDraws false for empty function', !sceneDraws({kind:'function',expr:'',varName:'x',view:{xMin:-1,xMax:1},params:[]}));
ok('overlayId is stable + unique', overlayId('x^2', new Set())==='x2' && overlayId('x^2', new Set(['x2']))==='x22');

console.log('\n=== viewport takes overlays into account ===');
const V = F({kind:'function', overlays:[{expr:'x^3'}], view:{xMin:-3,xMax:3}});
ok('window fits x^3 on [-3,3]', V.view.yMax > 15 && V.view.yMin < -15, JSON.stringify(V.view));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
