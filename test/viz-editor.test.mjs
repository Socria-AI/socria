import { sanitizeViz, autoParams, freeNamesOf, sceneSignature, RESERVED_PARAM, KIND_LABEL } from './.tmp/logos-viz.mjs';
let pass=0, fail=0;
const ok=(n,c,x='')=>c?pass++:(fail++,console.log('FAIL',n,x));

// autoParams: every free letter becomes a slider, except the variable and the
// kind's own animated parameter.
const p1 = autoParams('a*x^2 + b', 'x', 'function');
ok('a and b become sliders', p1.map(p=>p.id).sort().join()==='a,b', JSON.stringify(p1.map(p=>p.id)));
ok('sane default range', p1[0].min===-5 && p1[0].max===5 && p1[0].value===1);
ok('varName excluded', !autoParams('x^2','x','function').length);
ok('h reserved on derivative', !autoParams('h*x','x','derivative').some(p=>p.id==='h'));
ok('n reserved on riemann', !autoParams('n*x','x','riemann').some(p=>p.id==='n'));
ok('d reserved on limit', !autoParams('d*x','x','limit').some(p=>p.id==='d'));
const kept = autoParams('a*x', 'x', 'function', [{id:'a',min:-20,max:20,step:1,value:7}]);
ok('existing slider kept', kept[0].max===20 && kept[0].value===7);
ok('functions not mistaken for letters', !autoParams('sin(x)+cos(x)','x','function').length);
ok('pi/e not sliders', !autoParams('pi*x + e','x','function').length);
ok('capped at 4', autoParams('a*x+b+c+d+f+g','x','function').length<=4);

// the editor validates through sanitizeViz itself
const build = (expr, kind='function', extra={}) => sanitizeViz({
  kind, expr, varName:'x', view:{xMin:-6,xMax:6},
  params: autoParams(expr,'x',kind), ...extra });
ok('valid expr builds', !!build('x^2'));
// "y = x^2" is accepted on purpose: normalizeExpr strips a leading "lhs =",
// which is how most people write a function down.
ok('y = x^2 accepted', !!build('y = x^2'));
ok('f(x) = form accepted', !!build('f(x) = 2x'));
ok('a real equation rejected', !build('x^2 = 4'));
ok('inequality rejected', !build('x^2 < 4'));
ok('unbalanced rejected', !build('(x+1'));
ok('unknown fn rejected', !build('wat(x)'));
ok('constant rejected', !build('7'));
ok('coefficients build', !!build('a*x^2+b'));
ok('riemann needs interval', !build('x^2','riemann',{a:3,b:1}));
ok('riemann ok', !!build('x^2','riemann',{a:0,b:2}));
ok('title never survives an edit', !('title' in (build('x^2') ?? {})));

// adopting a different variable letter
ok('single other letter is the variable', freeNamesOf('sin(t)').join()==='t');
const t = sanitizeViz({kind:'function',expr:'sin(t)',varName:'t',view:{xMin:-6,xMax:6},params:[]});
ok('t scene builds', !!t && t.varName==='t');

// signature: content, not identity
const a1 = {kind:'function',expr:'x^2',varName:'x',view:{xMin:-6,xMax:6},params:[]};
ok('same content same key', sceneSignature(sanitizeViz(a1))===sceneSignature(sanitizeViz({...a1})));
ok('different content different key', sceneSignature(sanitizeViz(a1))!==sceneSignature(sanitizeViz({...a1,expr:'x^3'})));
ok('null safe', sceneSignature(null)==='');
ok('labels cover every kind', Object.keys(KIND_LABEL).length===10);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
