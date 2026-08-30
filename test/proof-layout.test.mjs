import { layoutStructure } from './.tmp/logos-layout.mjs';
let pass=0, fail=0;
const ok=(n,c,x='')=>c?pass++:(fail++,console.log('FAIL',n,x));
// definitions -> assumption -> step -> theorem. The theorem must end up ON TOP.
const map = {
  context: 'math',
  nodes: [
    { id:'def', type:'definition', label:'n is even iff n = 2k', status:'open' },
    { id:'asm', type:'assumption', label:'Assume n is even', status:'open' },
    { id:'step', type:'step', label:'n^2 = 2(2k^2)', status:'open' },
    { id:'goal', type:'goal', label:'n even implies n^2 even', status:'open' },
  ],
  edges: [
    { from:'def', to:'asm', relation:'justifies', strength:'normal' },
    { from:'asm', to:'step', relation:'implies', strength:'normal' },
    { from:'step', to:'goal', relation:'implies', strength:'normal' },
  ],
};
const L = layoutStructure(map, 900, 600);
const y = {}; for (const p of L.placed) y[p.id] = p.y;
console.log('  vertical positions (smaller y = higher on screen):');
for (const id of ['goal','step','asm','def']) console.log(`    ${id.padEnd(5)} y=${y[id]}`);
ok('theorem above the step it follows from', y.goal < y.step, `goal=${y.goal} step=${y.step}`);
ok('step above the assumption', y.step < y.asm, `step=${y.step} asm=${y.asm}`);
ok('assumption above its definition', y.asm < y.def, `asm=${y.asm} def=${y.def}`);
ok('the goal is the topmost node', Math.min(...Object.values(y)) === y.goal);
ok('the definition is the bottom of the tree', Math.max(...Object.values(y)) === y.def);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
