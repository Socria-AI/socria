// Units, read from the model and never guessed.
//
// A figure that says "educ" against "lwage" is a picture of a shape; one that
// says "educ (years)" against "wage ($/hour)" is a picture of a quantity. The
// rule this suite holds is the only one that keeps that honest: a unit printed
// anywhere came from the model — a parameter's, an object's, a state's, an
// unknown's, a specification's column, the dictionary, the clock — and a name
// the model has not measured prints alone. Derived units follow the
// mathematics and nothing else.

import { cleanUnit, withUnit, perUnit, valueWithUnit, unitOf, niceTicks, tickLabel } from './.tmp/units.mjs';
import { sanitizeModel } from './.tmp/schema.mjs';
import { unpack } from './.tmp/unpack.mjs';
import { modelById } from './.tmp/library.mjs';
import { symbolTable } from './.tmp/symbols.mjs';
import { buildSpec } from './.tmp/spec.mjs';
import { inputsOf } from './.tmp/derive.mjs';
import { panelFor } from './.tmp/viewdata.mjs';
import { inspectObject } from './.tmp/inspect.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

console.log('=== the words ===');
{
  ok('a unit is kept as written', cleanUnit(' $/hour ') === '$/hour');
  for (const none of ['', '1', 'none', 'dimensionless', 'Dimensionless', '-', 'n/a']) ok(`"${none}" is no unit`, cleanUnit(none) === undefined);
  ok('a non-string is no unit', cleanUnit(3) === undefined && cleanUnit(null) === undefined);
  ok('a name with a unit', withUnit('educ', 'years') === 'educ (years)');
  ok('a name without one is the name', withUnit('lwage', undefined) === 'lwage' && withUnit('lwage', '1') === 'lwage');
  ok('a slope is y per x', perUnit('$/hour', 'years') === '$/hour per year');
  ok('  a dimensionless y over x is per x', perUnit(undefined, 'years') === 'per year');
  ok('  y over a dimensionless x is y', perUnit('m', undefined) === 'm');
  ok('  nothing over nothing is nothing', perUnit(undefined, undefined) === undefined);
  ok('  a symbolic unit is not singularised', perUnit('N', 'm/s') === 'N per m/s');
  ok('a value with its unit', valueWithUnit(1.24, 'N/m') === '1.24 N/m' && valueWithUnit(2, null) === '2');
}

console.log('=== round numbers on an axis ===');
{
  ok('0 to 20 in fives', JSON.stringify(niceTicks(0, 20, 4)) === '[0,5,10,15,20]', JSON.stringify(niceTicks(0, 20, 4)));
  ok('−3 to 3', JSON.stringify(niceTicks(-3, 3, 4)) === '[-3,-2,-1,0,1,2,3]' || JSON.stringify(niceTicks(-3, 3, 4)) === '[-2,0,2]', JSON.stringify(niceTicks(-3, 3, 4)));
  ok('a tiny range still gets round ticks', niceTicks(0.11, 0.37, 3).every((v) => Number.isFinite(v)) && niceTicks(0.11, 0.37, 3).length >= 2, JSON.stringify(niceTicks(0.11, 0.37, 3)));
  ok('reversed bounds are fine', JSON.stringify(niceTicks(20, 0, 4)) === '[0,5,10,15,20]');
  ok('a flat range is one tick', JSON.stringify(niceTicks(4, 4)) === '[4]');
  ok('no float noise on a label', tickLabel(0.30000000000000004) === '0.3' && tickLabel(-0) === '0');
  ok('big and small go exponential', tickLabel(2.5e7) === '2.5e7' && tickLabel(0.00012) === '1.2e-4');
}

console.log('=== every place the model can say a unit ===');
{
  const m = sanitizeModel({
    id: 'u', title: 'units', units: { price: '$', Quantity: 'units', log_y: 'dimensionless', nothing: '   ' },
    params: [{ id: 'k', label: 'stiffness', value: 2, min: 0, max: 5, units: 'N/m' }],
    time: { t: 0, min: 0, max: 10, units: 's' },
    objects: [
      { id: 'len', kind: 'scalar', label: 'length', value: 3, units: 'm', fidelity: 'conceptual', provenance: { origin: 'user' } },
      { id: 'sys', kind: 'system', label: 'a system', fidelity: 'conceptual', provenance: { origin: 'user' },
        system: { states: [{ name: 'v', init: 0, units: 'm/s' }], rhs: { v: '0 - k * v' }, dt: 0.1, steps: 10 } },
      { id: 'eq', kind: 'system', label: 'clearing', fidelity: 'conceptual', provenance: { origin: 'user' },
        equations: { unknowns: ['qd', 'pc'], relations: ['qd = 10 - pc', 'qd = 2 * pc'], units: { qd: 'tonnes', pc: '$' } } },
      { id: 'fit', kind: 'specification', label: 'wage on educ', fidelity: 'conceptual', provenance: { origin: 'user' },
        estimation: { y: 'wage', x: ['educ'], units: { wage: '$/hour', educ: 'years' }, over: { educ: [0, 20] } } },
    ],
  });
  ok('the dictionary survives the sanitiser', m.units?.price === '$' && m.units?.Quantity === 'units');
  ok('  and so does a specification’s', m.objects.find((o) => o.id === 'fit')?.estimation?.units?.wage === '$/hour');
  ok('a parameter’s own', unitOf(m, 'k') === 'N/m');
  ok('an object’s own, by id or label', unitOf(m, 'len') === 'm' && unitOf(m, 'length') === 'm');
  ok('a state’s', unitOf(m, 'v') === 'm/s');
  ok('an unknown’s', unitOf(m, 'qd') === 'tonnes' && unitOf(m, 'pc') === '$');
  ok('a column’s', unitOf(m, 'wage') === '$/hour' && unitOf(m, 'educ') === 'years');
  ok('the dictionary, case-insensitively', unitOf(m, 'price') === '$' && unitOf(m, 'quantity') === 'units');
  ok('the clock', unitOf(m, 't') === 's');
  ok('a dictionary entry that says dimensionless is no unit', unitOf(m, 'log_y') === undefined);
  ok('a name nobody measured is nothing', unitOf(m, 'mystery') === undefined && unitOf(m, '') === undefined);

  // Derived, through the engine.
  const full = unpack(m);
  const response = full.objects.find((o) => o.id === 'fit__response');
  ok('the implied response is in the outcome’s units', response?.units === '$/hour', response?.units);
  const slope = full.objects.find((o) => o.meta?.role === 'marginal' && o.meta?.wrt === 'educ');
  ok('the slope is the outcome’s per the input’s', slope?.units === '$/hour per year', slope?.units);
  const read = full.objects.find((o) => o.meta?.role === 'readout');
  ok('a readout is in the outcome’s units', read?.units === '$/hour', read?.units);
  const educ = inputsOf(full).find((i) => i.id === 'educ');
  ok('the free input carries its unit to the slider', educ?.units === 'years', JSON.stringify(educ));
  // The axes, on a model whose figure IS the specification (an equations
  // block in the same model would name the axes itself, and should).
  const alone = unpack(sanitizeModel({
    id: 'w', title: 'wage', params: [],
    objects: [{ id: 'fit', kind: 'specification', label: 'wage on educ', fidelity: 'conceptual', provenance: { origin: 'user' },
      estimation: { y: 'wage', x: ['educ'], units: { wage: '$/hour', educ: 'years' }, over: { educ: [0, 20] } } }],
  }));
  const spec = buildSpec(alone);
  ok('the axes are named in their units', spec.axisNames[0] === 'educ (years)' && spec.axisNames[1] === 'wage ($/hour)', JSON.stringify(spec.axisNames));
  ok('an equations figure still names its own axes, in theirs', JSON.stringify(buildSpec(full).axisNames.slice(0, 2)) === '["qd (tonnes)","pc ($)"]', JSON.stringify(buildSpec(full).axisNames));
  const about = inspectObject(full, 'fit__x0');
  const range = about?.sections.flatMap((s) => s.facts).find((f) => f.label === 'Range');
  ok('the inspector’s range is in units', /0 to 20 years/.test(range?.value ?? ''), range?.value);
}

console.log('=== the wage model, and the ones that are shapes ===');
{
  const wage = unpack(modelById('wage-interaction'));
  const t = symbolTable(wage);
  ok('educ is in years', [...t.by.values()].find((q) => q.machine === 'educ')?.units === 'years');
  ok('female, an indicator, has no unit', [...t.by.values()].find((q) => q.machine === 'female')?.units === undefined);
  const spec = buildSpec(wage);
  ok('the surface’s axes: educ (years), female, lwage', spec.axisNames[0] === 'educ (years)' && spec.axisNames[1] === 'female' && spec.axisNames[2] === 'lwage', JSON.stringify(spec.axisNames));
  ok('a log outcome prints alone — nothing is invented', !/lwage \(/.test(spec.axisNames[2]));
  const slope = wage.objects.find((o) => o.meta?.role === 'marginal' && o.meta?.wrt === 'educ');
  ok('∂lwage/∂educ is per year', slope?.units === 'per year', slope?.units);
  const resp = wage.objects.find((o) => o.id === 'w__response');
  const table = panelFor(wage, `table:${resp.id}`);
  ok('the values table heads carry units', table?.kind === 'table' && table.columns[0] === 'educ (years)' && table.columns[1] === 'female', JSON.stringify(table?.columns));

  const saddle = unpack(modelById('saddle'));
  const sp = buildSpec(saddle);
  ok('a dimensionless surface keeps its letters', JSON.stringify(sp.axisNames) === '["x","y","z"]', JSON.stringify(sp.axisNames));
  const torus = unpack(modelById('torus'));
  ok('a shape over a parameter keeps coordinate axes', JSON.stringify(buildSpec(torus).axisNames) === '["x","y","z"]', JSON.stringify(buildSpec(torus).axisNames));

  const osc = unpack(modelById('oscillator'));
  ok('the oscillator’s stiffness is in N/m', osc.params.find((p) => p.id === 'k')?.units === 'N/m');
  const panels = buildSpec(osc).panels ?? [];
  ok('its panels are named in units', panels.some((p) => p.x === 't (s)') && panels.some((p) => p.y === 'x (m)'), JSON.stringify(panels.map((p) => [p.x, p.y])));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
