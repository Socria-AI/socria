// test/model-draws.test.mjs
//
// THE SCREENSHOT. A log-wage specification in education, a female indicator
// and their interaction, delivered by the extractor with no coefficient
// values and no `kinds`, drew an empty frame with "FEMALE — needs a range"
// under it and "2 objects could not be drawn" beneath that. This suite is the
// contract that it never does again: nothing arriving from a language model
// is dropped in silence, every gap becomes a stated placeholder, and the
// relationship DRAWS.

import { sanitizeModel, setParam } from './.tmp/schema.mjs';
import { unpack } from './.tmp/unpack.mjs';
import { buildSpec } from './.tmp/spec.mjs';
import { buildProposal } from './.tmp/propose.mjs';
import { symbolTable, freeInputs, withoutDomain } from './.tmp/symbols.mjs';
import { inputsOf, inputsAwaiting } from './.tmp/derive.mjs';
import { controlFor, isNotationFor, notationKey, placeholdersFor, labelForSlot, slotsOf } from './.tmp/binding.mjs';
import { impliedKind, inputDomain, domainSays } from './.tmp/kinds.mjs';
import { wageInteraction } from './.tmp/library.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const mesh = (spec) => spec.primitives.filter((p) => p.p === 'mesh').flatMap((p) => p.rows.flat().filter(Boolean));

console.log('=== i. exactly what the extractor sent, drawn ===');
{
  // No params, no kinds, no coefficients. The live failure.
  const raw = {
    id: 'wage', title: 'Log Wage on Education and Gender Interaction', params: [],
    objects: [{ id: 'w', kind: 'specification', label: 'log wage',
      estimation: { y: 'lwage', x: ['educ', 'female', 'educ_x_female'],
        terms: { educ_x_female: { op: 'interact', with: ['educ', 'female'] } }, over: { educ: [8, 20] } } }],
  };
  const built = buildProposal(raw, { at: 1 });
  ok('it builds', built.ok, JSON.stringify(built));
  const m = unpack(built.model);
  ok('four placeholder controls were written', m.params.filter((p) => p.assumed === 'value').length === 4,
    JSON.stringify(m.params.map((p) => [p.id, p.value, p.assumed])));
  ok('  labelled β₀…β₃', ['β₀', 'β₁', 'β₂', 'β₃'].every((l) => m.params.some((p) => p.label === l)));
  ok('nothing waits on a range', inputsAwaiting(m).length === 0, JSON.stringify(inputsAwaiting(m)));
  ok('female is 0 or 1, by name', inputsOf(m).some((q) => q.id === 'female' && q.min === 0 && q.max === 1 && q.from === 'name'));
  ok('educ is over what they said', inputsOf(m).some((q) => q.id === 'educ' && q.min === 8 && q.max === 20 && q.from === 'specification'));
  const spec = buildSpec(m);
  ok('THE FRAME IS NOT EMPTY', spec.primitives.length > 0, String(spec.primitives.length));
  ok('  nothing refused', spec.notes.every((n) => !n.problem), JSON.stringify(spec.notes.filter((n) => n.problem)));
  const pts = mesh(spec);
  ok('  a surface over educ and female', pts.length > 100);
  // lwage = 0 + 1·educ + 1·female + 1·educ·female at the placeholders
  const worst = pts.reduce((w, p) => Math.max(w, Math.abs(p.z - (p.x + p.y + p.x * p.y))), 0);
  ok('  evaluated exactly at the placeholder values', worst < 1e-9, String(worst));
  const note = spec.notes.find((n) => n.of === 'w')?.note ?? '';
  ok('the carrier names the placeholders', /β₀, β₁, β₂, β₃ are placeholders/.test(note), note);
  ok('  and the reading of female', /female is read as an indicator \(0 or 1\) from its name/.test(note), note);
  ok('the reply names them too', /β₀, β₁, β₂, β₃ have no value yet/.test(built.report.says), built.report.says);
  ok('the response is attributed as placeholders, and still model-derived',
    m.objects.find((o) => o.id === 'w__response')?.fidelity === 'model-derived' &&
    /PLACEHOLDER/.test(m.objects.find((o) => o.id === 'w__response')?.provenance?.detail ?? ''));

  // Set one, and it is theirs; the rest stay placeholders.
  const set = unpack(setParam(built.model, 'w__b1', 0.08));
  ok('moving β₁ clears its placeholder mark', set.params.find((p) => p.id === 'w__b1')?.assumed === undefined);
  ok('  the others keep theirs', set.params.filter((p) => p.assumed === 'value').length === 3);
  ok('  and the basis says so', /some still placeholders/.test(String(set.objects.find((o) => o.id === 'w__response')?.meta?.basis)));
  const spec2 = buildSpec(set);
  const worst2 = mesh(spec2).reduce((w, p) => Math.max(w, Math.abs(p.z - (0.08 * p.x + p.y + p.x * p.y))), 0);
  ok('  and the surface moved with it', worst2 < 1e-9, String(worst2));
}

console.log('\n=== ii. the library fixture is this case ===');
{
  const m = unpack(sanitizeModel(wageInteraction()));
  ok('wage-interaction draws', buildSpec(m).primitives.length > 0);
  ok('  with four placeholders', m.params.filter((p) => p.assumed === 'value').length === 4);
  ok('  and female read by name', freeInputs(symbolTable(m)).some((q) => q.display === 'female' && q.domainFrom === 'name'));
}

console.log('\n=== iii. nothing from outside is dropped in silence ===');
{
  // A control with a value and no range used to vanish.
  const m = sanitizeModel({ id: 'a', title: 't', params: [{ id: 'b1', label: 'β₁', value: 0.08 }], objects: [] });
  const p = m.params[0];
  ok('a control with a value and no range is kept', !!p && p.value === 0.08, JSON.stringify(m.params));
  ok('  with a range around it, said as assumed', p?.assumed === 'range' && p.min < 0.08 && p.max > 0.08, JSON.stringify(p));
  ok('  wide enough to double it', p?.max >= 0.16 && p?.min <= -0.08);
  // A control with a range and no value stands in the middle, as a placeholder.
  const q = sanitizeModel({ id: 'a', title: 't', params: [{ id: 'k', label: 'k', min: 0, max: 10 }], objects: [] }).params[0];
  ok('a control with a range and no value is a placeholder mid-range', q?.value === 5 && q?.assumed === 'value', JSON.stringify(q));
  // A control with no usable id is dropped — and recorded.
  const d = sanitizeModel({ id: 'a', title: 't', params: [{ id: '9x', label: 'bad', value: 1, min: 0, max: 2 }], objects: [] });
  ok('a control with no usable id is dropped AND recorded', d.params.length === 0 && (d.dropped ?? []).some((x) => /no usable id/.test(x)), JSON.stringify(d.dropped));
  // Numeric coefficients become controls, bound.
  const n = sanitizeModel({ id: 'n', title: 't', params: [],
    objects: [{ id: 'sp', kind: 'specification', label: 'l', estimation: { y: 'y', x: ['x'], coefficients: { intercept: 2, x: 0.5 } } }] });
  ok('numeric coefficients become controls', n.params.length === 2 && n.params.every((p) => p.assumed === 'range'), JSON.stringify(n.params));
  ok('  bound through the declaration', n.objects[0].estimation.coefficients.x === 'sp__b1' && n.objects[0].estimation.coefficients.intercept === 'sp__b0',
    JSON.stringify(n.objects[0].estimation.coefficients));
  ok('  and no placeholder was added for them', !n.params.some((p) => p.assumed === 'value'));
  const u = unpack(n);
  ok('  so the line draws at their numbers', (() => {
    const pts = buildSpec(u).primitives.filter((p) => p.p === 'polyline').flatMap((p) => p.at);
    return pts.length > 2 && pts.every((p) => Math.abs(p.y - (2 + 0.5 * p.x)) < 1e-9);
  })(), JSON.stringify(buildSpec(u).primitives.map((p) => p.p)));
  // A coefficient naming no regressor is dropped and recorded.
  const z = sanitizeModel({ id: 'z', title: 't', params: [],
    objects: [{ id: 'sp', kind: 'specification', label: 'l', estimation: { y: 'y', x: ['x'], coefficients: { nope: 3 } } }] });
  ok('a coefficient for no regressor is recorded', (z.dropped ?? []).some((x) => /names no regressor/.test(x)), JSON.stringify(z.dropped));
}

console.log('\n=== iv. the notation, exactly ===');
{
  ok('β₁ → b1', notationKey('β₁') === 'b1');
  ok('Beta_1 → b1', notationKey('Beta_1') === 'b1');
  ok('b 1 → b1', notationKey('b 1') === 'b1');
  ok('b1x stays b1x', notationKey('b1x') === 'b1x');
  ok('beta alone matches no slot', !isNotationFor('beta', 0) && !isNotationFor('beta', 1));
  ok('b12 is slot 12, not slot 1', isNotationFor('b12', 12) && !isNotationFor('b12', 1));
  const params = [{ id: 'c1', label: 'β₁', value: 1, min: 0, max: 2 }, { id: 'coef', label: 'x', value: 1, min: 0, max: 2 }];
  const decl = { x: ['x', 'z'] };
  ok('a control labelled β₁ binds slot 1 by notation', controlFor(params, decl, 'sp', 1)?.how === 'notation');
  ok('  and nothing binds slot 2', controlFor(params, decl, 'sp', 2) === undefined);
  ok('  the declaration outranks the notation', controlFor(params, { ...decl, coefficients: { x: 'coef' } }, 'sp', 1)?.id === 'coef');
  ok('slots: intercept 0 then regressors', JSON.stringify(slotsOf(decl).map((s) => s.slot)) === '[0,1,2]');
  ok('  none without an intercept', JSON.stringify(slotsOf({ ...decl, intercept: false }).map((s) => s.slot)) === '[0,1]');
  ok('labels subscript', labelForSlot(12) === 'β₁₂');
  ok('placeholdersFor skips a fitted specification',
    placeholdersFor({ params: [], objects: [{ id: 'f', estimation: { y: 'y', x: ['x'], data: 's' } }] }).length === 0);
}

console.log('\n=== v. what a name says, and what it does not ===');
{
  for (const n of ['female', 'married', 'union', 'is_poor', 'has_kids', 'south_dummy', 'treated', 'd_post']) {
    ok(`${n} is an indicator`, impliedKind(n) === 'binary');
  }
  for (const n of ['female_share', 'educ', 'income', 'females', 'unionrate', 'dist']) {
    ok(`${n} is not`, impliedKind(n) === null);
  }
  const d = inputDomain({ params: [] }, {}, 'female');
  ok('inputDomain reads the name', d.from === 'name' && d.domain[1] === 1);
  ok('  a declared continuous kind wins', inputDomain({ params: [] }, { kinds: { female: 'continuous' } }, 'female').from === 'assumed');
  ok('  a declared binary kind is `type`', inputDomain({ params: [] }, { kinds: { x: 'binary' } }, 'x').from === 'type');
  ok('  a stated range wins over the name', inputDomain({ params: [] }, { over: { female: [0, 5] } }, 'female').from === 'specification');
  ok('  a control of the name wins', inputDomain({ params: [{ id: 'educ', min: 1, max: 9, value: 2, label: 'e' }] }, {}, 'educ').from === 'control');
  ok('  data wins over the default', inputDomain({ params: [] }, {}, 'q', undefined, { columns: { q: [3, 7] } }).domain[1] === 7);
  ok('  and the default is 0 to 10', JSON.stringify(inputDomain({ params: [] }, {}, 'q').domain) === '[0,10]');
  ok('the engine says what it read', /read as an indicator/.test(domainSays('female', d)));
  ok('  and what it assumed', /no stated range/.test(domainSays('q', inputDomain({ params: [] }, {}, 'q'))));
  ok('  and nothing when it was told', domainSays('x', { domain: [0, 1], from: 'type' }) === null);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
