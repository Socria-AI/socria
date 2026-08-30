import { taylorCoeffs } from './.tmp/logos-math.mjs';
let pass = 0, fail = 0;
const near = (name, got, want, tol = 1e-9) => {
  const ok = got !== null && got.length === want.length && got.every((v, i) => Math.abs(v - want[i]) < tol);
  ok ? pass++ : (fail++, console.log(`FAIL ${name}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`));
};
const isNull = (name, got) => (got === null ? pass++ : (fail++, console.log(`FAIL ${name}: expected null, got`, got)));
const T = (raw, a, order, scope = {}) => taylorCoeffs(raw, 'x', scope, a, order);

// classics about 0
near('exp(x)', T('exp(x)', 0, 5), [1, 1, 1/2, 1/6, 1/24, 1/120]);
near('sin(x)', T('sin(x)', 0, 5), [0, 1, 0, -1/6, 0, 1/120]);
near('cos(x)', T('cos(x)', 0, 4), [1, 0, -1/2, 0, 1/24]);
near('1/(1-x)', T('1/(1-x)', 0, 4), [1, 1, 1, 1, 1]);
near('ln(1+x)', T('ln(1+x)', 0, 5), [0, 1, -1/2, 1/3, -1/4, 1/5]);
near('tan(x)', T('tan(x)', 0, 5), [0, 1, 0, 1/3, 0, 2/15]);
near('atan(x)', T('atan(x)', 0, 5), [0, 1, 0, -1/3, 0, 1/5]);
near('sqrt(1+x)', T('sqrt(1+x)', 0, 3), [1, 1/2, -1/8, 1/16]);
near('sinh(x)', T('sinh(x)', 0, 5), [0, 1, 0, 1/6, 0, 1/120]);
near('cosh(x)', T('cosh(x)', 0, 4), [1, 0, 1/2, 0, 1/24]);
near('tanh(x)', T('tanh(x)', 0, 5), [0, 1, 0, -1/3, 0, 2/15]);
near('(1+x)^3', T('(1+x)^3', 0, 4), [1, 3, 3, 1, 0]);
near('x^2 poly exact', T('3x^2 - 2x + 5', 0, 3), [5, -2, 3, 0]);

// non-zero centre: sin about pi/2 = cos-shifted
near('sin @ pi/2', T('sin(x)', Math.PI/2, 4), [1, 0, -1/2, 0, 1/24]);
// exp about 1
const e = Math.E;
near('exp @ 1', T('exp(x)', 1, 3), [e, e, e/2, e/6]);
// 1/x about 2: sum (-1)^k (x-2)^k / 2^{k+1}
near('1/x @ 2', T('1/x', 2, 4), [1/2, -1/4, 1/8, -1/16, 1/32]);
// ln(x) about 1
near('ln @ 1', T('ln(x)', 1, 4), [0, 1, -1/2, 1/3, -1/4]);

// composition + parameters
near('exp(a*x) scope', T('exp(a*x)', 0, 3, {a: 2}), [1, 2, 2, 4/3]);
near('sin(x^2)', T('sin(x^2)', 0, 6), [0, 0, 1, 0, 0, 0, -1/6]);
near('x^x @ 1', T('x^x', 1, 2), [1, 1, 1]); // known: 1 + (x-1) + (x-1)^2 + ...
near('e^-x^2', T('exp(-x^2)', 0, 4), [1, 0, -1, 0, 1/2]);

// refusals — the honest nulls
isNull('abs', T('abs(x)', 0, 3));
isNull('floor', T('floor(x)', 0, 3));
isNull('pole at centre 1/x @ 0', T('1/x', 0, 3));
isNull('ln at 0', T('ln(x)', 0, 3));
isNull('sqrt of negative centre', T('sqrt(x)', -1, 3));
isNull('mod', T('x % 2', 0, 3));
isNull('unbound name', T('q*x', 0, 3));
isNull('x^x at 0', T('x^x', 0, 2)); // ln(0) — refused, not faked

// negative integer power without positivity: 1/(x-3)^2 about 0 -> (x-3)^-2
near('(x-3)^-2 @ 0', T('(x-3)^(-2)', 0, 2), [1/9, 2/27, 3/81], 1e-9);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
