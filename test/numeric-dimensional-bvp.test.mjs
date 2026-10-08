// Dimensions and boundary-value problems: units read into base dimensions,
// Buckingham's Π groups from the exact null space of the dimension matrix, and
// two-point problems solved by shooting — every solution, held to closed forms
// and to Bratu's equation on either side of its fold.
import { parseUnit, buckinghamPi, dimsText } from './.tmp/dimensional.mjs';
import { shoot } from './.tmp/bvp.mjs';
import { buildProposal } from './.tmp/propose.mjs';
import { inspectModel } from './.tmp/inspect.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const same = (a, b) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 1e-12);
// a group or its inverse — which quantity sits on top depends on which repeat, and both are Π groups
const hasGroup = (groups, want) =>
  groups.some((g) => [1, -1].some((sgn) => Object.keys(want).length === Object.keys(g.exponents).length && Object.entries(want).every(([n, e]) => g.exponents[n] === sgn * e)));

console.log('=== units into dimensions [M L T Θ I N J] ===');
{
  ok('N is M L T⁻²', same(parseUnit('N').dims, [1, 1, -2, 0, 0, 0, 0]));
  ok('W/m²K is M T⁻³ Θ⁻¹ — everything after the slash is below it', same(parseUnit('W/m²K').dims, [1, 0, -3, -1, 0, 0, 0]));
  ok('W/mK is W/(m·K), not watts per millikelvin', same(parseUnit('W/mK').dims, [1, 1, -3, -1, 0, 0, 0]) && parseUnit('W/mK').si === 1);
  ok('J/kgK is L² T⁻² Θ⁻¹', same(parseUnit('J/kgK').dims, [0, 2, -2, -1, 0, 0, 0]));
  ok('Pa·s, a viscosity, is M L⁻¹ T⁻¹', same(parseUnit('Pa·s').dims, [1, -1, -1, 0, 0, 0, 0]));
  ok('superscripts, carets and bare digits all read: m²/s, m^2/s, m2/s', ['m²/s', 'm^2/s', 'm2/s'].every((u) => same(parseUnit(u).dims, [0, 2, -1, 0, 0, 0, 0])));
  ok('s⁻¹ and 1/s are the same', same(parseUnit('s⁻¹').dims, parseUnit('1/s').dims));
  ok('prefixes scale: kPa is 1000 Pa, mm is 1/1000 m, kWh is 3.6 MJ', parseUnit('kPa').si === 1000 && parseUnit('mm').si === 0.001 && parseUnit('kWh').si === 3.6e6);
  ok('V is M L² T⁻³ I⁻¹', same(parseUnit('V').dims, [1, 2, -3, 0, -1, 0, 0]));
  ok('dimensionless is read as such', same(parseUnit('dimensionless').dims, [0, 0, 0, 0, 0, 0, 0]) && same(parseUnit('rad').dims, [0, 0, 0, 0, 0, 0, 0]));
  ok('a unit it does not know is unreadable — never guessed', parseUnit('furlongs') === null && parseUnit('m//s') === null);
  ok('dimensions written plainly', dimsText(parseUnit('N').dims) === 'M L T⁻²');
}

console.log('=== Buckingham Π: the groups with no dimension ===');
{
  const pend = buckinghamPi([{ name: 'T', unit: 's' }, { name: 'L', unit: 'm' }, { name: 'g', unit: 'm/s²' }, { name: 'm', unit: 'kg' }]);
  ok('a pendulum: one group, T²g/L — and the mass in none of it', pend.groups.length === 1 && pend.groups[0].text === 'T²·g / L' && !('m' in pend.groups[0].exponents), JSON.stringify(pend.groups));
  const drag = buckinghamPi([{ name: 'rho', unit: 'kg/m³' }, { name: 'v', unit: 'm/s' }, { name: 'd', unit: 'm' }, { name: 'mu', unit: 'Pa·s' }, { name: 'F', unit: 'N' }]);
  ok('drag on a sphere: five quantities, three dimensions, two groups', drag.rank === 3 && drag.groups.length === 2);
  ok('… with ρ, v, d repeating: the Reynolds number and the drag coefficient', drag.groups.some((g) => g.text === 'mu / (rho·v·d)') && drag.groups.some((g) => g.text === 'F / (rho·v²·d²)'), drag.groups.map((g) => g.text).join(' ; '));
  const dims = (g, qs) => {
    const tot = [0, 0, 0, 0, 0, 0, 0];
    for (const [n, e] of Object.entries(g.exponents)) parseUnit(qs.find((q) => q.name === n).unit).dims.forEach((v, i) => (tot[i] += v * e));
    return tot;
  };
  const qs = [{ name: 'h', unit: 'W/m²K' }, { name: 'L', unit: 'm' }, { name: 'k', unit: 'W/mK' }, { name: 'rho', unit: 'kg/m³' }, { name: 'c', unit: 'J/kgK' }, { name: 'v', unit: 'm/s' }];
  const heat = buckinghamPi(qs);
  ok('convection: every group really has no dimension', heat.groups.length === qs.length - heat.rank && heat.groups.every((g) => dims(g, qs).every((v) => Math.abs(v) < 1e-12)), heat.groups.map((g) => g.text).join(' ; '));
  ok('… the Nusselt number hL/k among them (or its inverse)', hasGroup(heat.groups, { h: 1, L: 1, k: -1 }), heat.groups.map((g) => g.text).join(' ; '));
  ok('the Fourier number αt/L² (or its inverse)', hasGroup(buckinghamPi([{ name: 'alpha', unit: 'm²/s' }, { name: 't', unit: 's' }, { name: 'L', unit: 'm' }]).groups, { alpha: 1, t: 1, L: -2 }));
  ok('with t and L repeating, the non-repeating α on top: αt/L² exactly', buckinghamPi([{ name: 't', unit: 's' }, { name: 'L', unit: 'm' }, { name: 'alpha', unit: 'm²/s' }]).groups[0].text === 't·alpha / L²');
  const odd = buckinghamPi([{ name: 'a', unit: 'm' }, { name: 'b', unit: 'furlongs' }]);
  ok('an unreadable unit is set aside and named', odd.unread.length === 1 && odd.unread[0].name === 'b');
}

console.log('=== in the Inspector ===');
{
  const b = buildProposal({
    id: 'pend', title: 'Pendulum',
    params: [{ id: 'L', label: 'length', value: 1, min: 0.1, max: 2, units: 'm' }, { id: 'g', label: 'gravity', value: 9.81, min: 1, max: 20, units: 'm/s²' }, { id: 'T0', label: 'period', value: 2, min: 1, max: 3, units: 's' }],
    objects: [{ id: 'p', kind: 'curve', label: 'period', definition: '2*pi*sqrt(L/g)', over: { L: [0.1, 2] } }],
  });
  const st = inspectModel(b.model).sections.find((s) => s.id === 'state');
  ok('the Inspector lists the model’s dimensionless group, gT²/L', st.facts.some((f) => f.label === 'Dimensionless groups' && /^g·T0² \/ L — Buckingham’s Π: 3 quantities spanning 2 dimensions make 1 group/.test(f.value)), st.facts.map((f) => f.label + ': ' + f.value).join(' | '));
}

console.log('=== boundary-value problems by shooting ===');
{
  const s = shoot({ f: (x, y) => -y, a: 0, b: Math.PI / 2, left: { y: 0 }, right: { y: 1 } });
  ok('y″ = −y, y(0) = 0, y(π/2) = 1: one solution, sin x, to 10⁻⁹', s.solutions.length === 1 && Math.abs(s.solutions[0].start - 1) < 1e-9 && Math.max(...s.solutions[0].x.map((x, i) => Math.abs(s.solutions[0].y[i] - Math.sin(x)))) < 1e-9);
  const c = shoot({ f: (x) => 6 * x, a: 0, b: 1, left: { y: 0 }, right: { y: 1 } });
  ok('y″ = 6x through (0, 0) and (1, 1): x³', c.solutions.length === 1 && Math.abs(c.solutions[0].y[50] - 0.125) < 1e-9);
  const n = shoot({ f: () => 0, a: 0, b: 1, left: { y: 1 }, right: { yp: 2 } });
  ok('a slope given at the far end: y = 1 + 2x', n.solutions.length === 1 && Math.abs(n.solutions[0].y.at(-1) - 3) < 1e-9);
  const lp = shoot({ f: () => 0, a: 0, b: 1, left: { yp: 2 }, right: { y: 5 } });
  ok('a slope given at the start: the height is what is shot for, y(0) = 3', lp.solutions.length === 1 && Math.abs(lp.solutions[0].start - 3) < 1e-9);
  const bratu = (lam) => shoot({ f: (x, y) => -lam * Math.exp(y), a: 0, b: 1, left: { y: 0 }, right: { y: 0 } }, { scan: [0, 20], samples: 200 });
  const b1 = bratu(1);
  ok('Bratu at λ = 1: two solutions, y′(0) = 0.549353 and 10.8469', b1.solutions.length === 2 && Math.abs(b1.solutions[0].start - 0.549353) < 1e-5 && Math.abs(b1.solutions[1].start - 10.8469) < 1e-3, b1.says);
  ok('… their heights at the middle, 0.140539 and 4.0915', Math.abs(b1.solutions[0].y[50] - 0.140539) < 1e-5 && Math.abs(b1.solutions[1].y[50] - 4.0915) < 1e-3);
  ok('… close together just below the fold (λ = 3.5)', bratu(3.5).solutions.length === 2);
  const b36 = bratu(3.6);
  ok('… and past the fold, λ = 3.6 > 3.5138: none, said so', b36.solutions.length === 0 && /no solution/.test(b36.says));
  ok('the solutions satisfy their far end', b1.solutions.every((x) => x.residual < 1e-9));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
