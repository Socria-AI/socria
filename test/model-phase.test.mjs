// The phase portrait, computed: a system's states against each other, with
// the field, the nullclines, the fixed points and other paths where the plane
// is the whole state — and a projection, said to be one, where it is not. And
// how a system behaves, for the Inspector: fixed points classified by their
// eigenvalues, and finite-time Lyapunov exponents. Every answer below has a
// closed form to check against.
import { readFileSync } from 'node:fs';
import { portraitOf, behaviourOf, zeroSet } from './.tmp/phase.mjs';
import { frameFor, viewById } from './.tmp/viewdata.mjs';
import { inspectObject } from './.tmp/inspect.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const P = (id, value) => ({ id, label: id, value, min: value / 10 - 1, max: value * 10 + 1 });
const sys = (id, states, rhs, params) => ({
  id, title: id, params: params.map(([k, v]) => P(k, v)),
  objects: [{ id: 'sys', kind: 'trajectory', label: id, system: { states: states.map(([name, init]) => ({ name, init })), rhs, dt: 0.01, steps: 3000 } }],
});
const damped = sys('damped', [['x', 1], ['v', 0]], { x: 'v', v: '-(k/m)*x - (c/m)*v' }, [['k', 20], ['m', 1], ['c', 0.6]]);
const vdp = sys('vanderpol', [['x', 0.5], ['y', 0]], { x: 'y', y: 'mu*(1 - x^2)*y - x' }, [['mu', 1]]);
const lv = sys('lotka', [['x', 4], ['y', 1]], { x: 'a*x - b*x*y', y: 'c*x*y - d*y' }, [['a', 1], ['b', 0.5], ['c', 0.2], ['d', 0.6]]);
const lorenz = sys('lorenz', [['x', 1], ['y', 1], ['z', 1]], { x: 's*(y - x)', y: 'x*(r - z) - y', z: 'x*y - q*z' }, [['s', 10], ['r', 28], ['q', 8 / 3]]);
const forced = sys('forced', [['x', 1], ['v', 0]], { x: 'v', v: '-x + sin(t)' }, []);

console.log('=== the view is declared, and now drawn ===');
{
  const v = viewById(damped, 'phase:sys');
  ok('a two-state system offers a phase portrait', v && v.family === 'phase' && !v.notDrawnYet);
  const f = frameFor(damped, 'phase:sys');
  ok('… and it is a frame of computed marks', f && f.primitives.length > 5 && f.fidelity === 'numerically-computed' && f.dimensionality === 2);
  ok('… with the states as its axes', f.axisNames[0] === 'x' && f.axisNames[1] === 'v', f.axisNames.join());
  ok('… and its account of itself', /whole state/.test(f.notes[0].note) && /Dormand–Prince/.test(f.notes[0].note));
}

console.log('=== a damped oscillator: one stable spiral at rest ===');
{
  const p = portraitOf(damped, damped.objects[0]);
  ok('the plane is the whole state', p.whole);
  ok('one fixed point, at the origin', p.fixed.length === 1 && near(p.fixed[0].x, 0, 1e-9) && near(p.fixed[0].y, 0, 1e-9));
  ok('a stable spiral', p.fixed[0].type === 'stable spiral' && p.fixed[0].stable === true);
  ok('eigenvalues −c/2m ± i√(k/m − (c/2m)²)', /^−0\.3 \+ 4\.46i, −0\.3 − 4\.46i$/.test(p.fixed[0].eig), p.fixed[0].eig);
  const kinds = new Set(p.primitives.map((q) => q.p + ':' + (q.layer ?? '')));
  ok('field, nullclines, other paths and the run', kinds.has('vectors:field') && kinds.has('polyline:nullclines') && kinds.has('polyline:flow') && kinds.has('polyline:'));
  const field = p.primitives.find((q) => q.p === 'vectors');
  const i = field.at.findIndex((a) => Math.abs(a.x) > 0.1);
  ok('each arrow is the right-hand side at its point (or that, clipped and said)', field.at.length > 200 && (near(field.dir[i].x, field.at[i].y, 1e-9) || field.clipped));
}

console.log('=== Van der Pol: the rest point repels ===');
{
  const p = portraitOf(vdp, vdp.objects[0]);
  ok('an unstable spiral at the origin, eigenvalues μ/2 ± i√(1 − μ²/4)', p.fixed.length === 1 && p.fixed[0].type === 'unstable spiral' && /^0\.5 \+ 0\.866i/.test(p.fixed[0].eig), p.fixed[0]?.eig);
  ok('the run circles out to the limit cycle: amplitude about 2', Math.max(...p.primitives.filter((q) => q.p === 'polyline' && !q.layer).flatMap((q) => q.at.map((a) => Math.abs(a.x)))) > 1.9);
}

console.log('=== Lotka–Volterra: a saddle and a centre ===');
{
  const p = portraitOf(lv, lv.objects[0]);
  const byType = Object.fromEntries(p.fixed.map((f) => [f.type, f]));
  ok('a saddle at the origin, eigenvalues a and −d', byType.saddle && near(byType.saddle.x, 0, 1e-9) && /^1, −0\.6$/.test(byType.saddle.eig));
  ok('a centre at (d/c, a/b) = (3, 2)', byType['centre (linearly)'] && near(byType['centre (linearly)'].x, 3, 1e-9) && near(byType['centre (linearly)'].y, 2, 1e-9));
  ok('… whose frequency is √(ad)', /0\.775i/.test(byType['centre (linearly)'].eig));
  ok('… and which the linearization alone cannot call stable', byType['centre (linearly)'].stable === null);
}

console.log('=== more states, or a clock: a projection, said ===');
{
  const p = portraitOf(lorenz, lorenz.objects[0]);
  ok('Lorenz in the x–y plane is a projection, with no field claimed', !p.whole && !p.primitives.some((q) => q.p === 'vectors') && /projection/.test(p.note));
  ok('… and the frame says it is partial', /projection onto x and y/.test(frameFor(lorenz, 'phase:sys').partial ?? ''));
  const q = portraitOf(forced, forced.objects[0]);
  ok('a forced system: no field, because the plane does not fix the direction', !q.whole && /depend on time/.test(q.note));
  const drive0 = sys('drive0', [['x', 1], ['v', 0]], { x: 'v', v: '-k*x - c*v + f0*sin(w*t)' }, [['k', 4], ['c', 0.5], ['f0', 0], ['w', 2]]);
  ok('a drive written with t but set to zero leaves the plane whole — decided by evaluating, not reading', portraitOf(drive0, drive0.objects[0]).whole === true);
  const drive1 = sys('drive1', [['x', 1], ['v', 0]], { x: 'v', v: '-k*x - c*v + f0*sin(w*t)' }, [['k', 4], ['c', 0.5], ['f0', 1], ['w', 2]]);
  ok('… and turned up, it is a clock again', portraitOf(drive1, drive1.objects[0]).whole === false);
  ok('one state is no plane', portraitOf(sys('one', [['x', 1]], { x: '-x' }, []), { id: 'sys', kind: 'trajectory', label: 'one', system: { states: [{ name: 'x', init: 1 }], rhs: { x: '-x' } } }) === null);
}

console.log('=== nullclines are where a rate is zero ===');
{
  const lines = zeroSet((x, y) => x * x + y * y - 1, { x: [-2, 2], y: [-2, 2] }, 80);
  const all = lines.flat();
  ok('a circle traced as a closed run', lines.length === 1 && all.every((p) => near(Math.hypot(p.x, p.y), 1, 0.01)));
  ok('two crossing lines are two runs through the saddle', zeroSet((x, y) => x * y, { x: [-1, 1.1], y: [-1, 1.1] }, 40).length >= 2);
}

console.log('=== how it behaves: Lorenz, against what is known ===');
{
  const b = behaviourOf(lorenz, lorenz.objects[0]);
  const rc = Math.sqrt((8 / 3) * 27);
  const cplus = b.fixed.find((f) => f.at[0] > 1);
  ok('three fixed points', b.fixed.length === 3);
  ok('C± at (±√(β(r−1)), ±√(β(r−1)), r−1)', cplus && near(cplus.at[0], rc, 1e-6) && near(cplus.at[2], 27, 1e-6));
  ok('… saddle-foci, eigenvalues −13.85 and 0.094 ± 10.19i', cplus.type === 'saddle-focus' && /0\.094 \+ 10\.2i/.test(cplus.eig) && /−13\.9/.test(cplus.eig), cplus.eig);
  ok('the origin is a saddle', b.fixed.some((f) => f.type === 'saddle' && f.at.every((v) => Math.abs(v) < 1e-9)));
  ok('the exponents sum to −(σ + 1 + β), the divergence', near(b.lyapunov.sum, -(10 + 1 + 8 / 3), 0.05), b.lyapunov.sum);
  ok('the largest is positive (0.906 over long times; a finite-time estimate here)', b.lyapunov.exponents[0] > 0.6 && b.lyapunov.exponents[0] < 1.1, b.lyapunov.exponents[0]);
  ok('Kaplan–Yorke dimension near 2.06', near(b.lyapunov.kaplanYorke, 2.06, 0.05), b.lyapunov.kaplanYorke);
  const d = behaviourOf(damped, damped.objects[0]);
  ok('a damped oscillator: no positive exponent', d.lyapunov.exponents[0] < 0);
  ok('a forced system has no fixed points in this sense, and says why', behaviourOf(forced, forced.objects[0]).fixed.length === 0 && /depend on time/.test(behaviourOf(forced, forced.objects[0]).how));
}

console.log('=== the Inspector says it, with its fidelity ===');
{
  const i = inspectObject(lorenz, 'sys');
  const sec = i.sections.find((s) => s.id === 'behaviour');
  ok('a "How it behaves" section', sec && /3 fixed points/.test(sec.summary));
  ok('… each fixed point with its eigenvalues', sec.facts.filter((f) => /eigenvalues/.test(f.value)).length === 3);
  ok('… exponents said to be a finite-time estimate', sec.facts.some((f) => f.label === 'Lyapunov exponents' && /finite-time estimate/.test(f.value) && /sensitive to where it begins/.test(f.value)));
  ok('… and how it was computed', sec.facts.some((f) => f.label === 'How' && /Benettin/.test(f.value)));
  ok('… all numerically computed', sec.facts.filter((f) => f.fidelity).every((f) => f.fidelity === 'numerically-computed'));
}

console.log('=== the source keeps its promises ===');
{
  const src = readFileSync(new URL('../lib/model/phase.ts', import.meta.url), 'utf8');
  ok('pure: no React, no clock', !/from 'react'|Date\.now|Math\.random/.test(src));
  ok('no domain named', !/pendulum|predator|lorenz|oscillat/i.test(src.replace(/\/\/.*$/gm, '')));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
