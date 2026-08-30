import { compileFunction, compileExpr, freeNames, samplePlot, plottable } from './.tmp/logos-math.mjs';
let pass = 0, fail = 0;
const eq = (name, got, want, tol = 1e-9) => {
  const ok = (typeof want === 'number' && typeof got === 'number')
    ? (Number.isNaN(want) ? Number.isNaN(got) : Math.abs(got - want) < tol)
    : JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : (fail++, console.log(`FAIL ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`));
};
const f = (src) => compileFunction(src);

// --- behaviour that must be unchanged by the refactor ---
eq('x^2 at 3', f('x^2').eval(3), 9);
eq('y = x^2 - 3 strips lhs', f('y = x^2 - 3').eval(4), 13);
eq('f(x) = 2x implicit mult', f('f(x) = 2x').eval(5), 10);
eq('3x^2', f('3x^2').eval(2), 12);
eq('2(x+1)', f('2(x+1)').eval(3), 8);
eq('unary minus', f('-x^2').eval(3), -9);
eq('right-assoc pow', f('2^x').eval(3), 8);
eq('sin', f('sin(x)').eval(Math.PI / 2), 1);
eq('ln', f('ln(x)').eval(Math.E), 1);
eq('pi const', f('x*pi').eval(2), 2 * Math.PI);
eq('other var letter', f('t^3').eval(2), 8);
eq('varName detected', f('t^3').varName, 't');
eq('sqrt', f('sqrt(x)').eval(9), 3);
eq('x sin(x)', f('x sin(x)').eval(Math.PI / 2), Math.PI / 2);
eq('two free vars rejected', f('a*x'), null);
eq('constant rejected', f('42'), null);
eq('unknown name rejected', f('foo(x)'), null);
eq('mismatched paren rejected', f('(x+1'), null);
eq('equation rejected', f('x^2 = 4'), null);
eq('nonsense rejected', f('###'), null);
eq('all-NaN rejected', f('sqrt(-x^2-1)'), null);
eq('samplePlot works', samplePlot(f('x^2')).samples.length, 241);
eq('plottable via tex', !!plottable({ tex: 'x^2', label: 'parabola' }), true);

// --- the new general form ---
const g = compileExpr('a*x^2 + b', ['a', 'b', 'x']);
eq('multi vars found', g.vars.sort(), ['a', 'b', 'x']);
eq('multi eval', g.eval({ a: 2, b: 1, x: 3 }), 19);
eq('missing name -> NaN', g.eval({ a: 2, x: 3 }), NaN);
eq('name outside set rejected', compileExpr('a*x + c', ['a', 'x']), null);
eq('constant expr allowed here', compileExpr('2+2', ['x']).eval({}), 4);
eq('freeNames', freeNames('a*x^2 + b*sin(x)').sort(), ['a', 'b', 'x']);
eq('freeNames strips lhs', freeNames('f(x) = a*x').sort(), ['a', 'x']);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
