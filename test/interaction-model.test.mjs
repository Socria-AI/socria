// A FULLY SPECIFIED MODEL MUST DRAW.
//
// Reported, with a screenshot. Somebody typed:
//
//   log(wage) = β0 + β1·educ + β2·female + β3·(educ × female),
//   β0=1, β1=0.08, β2=−0.2, β3=0.01. Education 8–20.
//
// Every coefficient given, the education range given, the interaction written
// out — and the frame was empty, with "FEMALE — needs a range" under it and a
// reply asking what they were aiming to explore.
//
// THREE SEPARATE FAULTS, and this suite is one section each:
//
//   i.   `{op: 'interact', of: 'educ', with: ['female']}` was refused, because
//        the sanitiser only accepted both operands in `with`. The term vanished
//        SILENTLY, so the interaction column became a free input nobody could
//        give a range to.
//   ii.  the person's own controls were called β₀…β₃ and the response surface
//        referenced w__b0…w__b3 — two names for one quantity — so nothing could
//        be evaluated and the picture said it needed values for the very
//        coefficients in the sliders underneath it. THE ENGINE WILL NOT GUESS
//        THAT BINDING, and should not: `test/model-binding.test.mjs` settles
//        that a binding is DECLARED and never fuzzily matched, because a
//        control called `b1` may be something else entirely and a wrong model
//        that looks right is worse than an honest gap. So the specification
//        must SAY which control each coefficient is, and this section checks
//        that saying so works — the extractor is told to say it in
//        lib/logos.ts.
//   iii. a binary needs no range, which the engine already knew, but only when
//        told the kind.

import { sanitizeModel } from './.tmp/schema.mjs';
import { unpack } from './.tmp/unpack.mjs';
import { buildSpec } from './.tmp/spec.mjs';
import { inputsOf, inputsAwaiting } from './.tmp/derive.mjs';
import { symbolTable } from './.tmp/symbols.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

/** Exactly what was reported, as a model. */
const SAID = (est = {}) =>
  sanitizeModel({
    id: 'wage',
    title: 'Log wage on education and gender interaction',
    params: [
      { id: 'b0', label: 'β₀', value: 1, min: -2, max: 4, step: 0.01 },
      { id: 'b1', label: 'β₁', value: 0.08, min: -0.2, max: 0.3, step: 0.001 },
      { id: 'b2', label: 'β₂', value: -0.2, min: -1, max: 1, step: 0.01 },
      { id: 'b3', label: 'β₃', value: 0.01, min: -0.1, max: 0.1, step: 0.001 },
    ],
    objects: [{
      id: 'w', kind: 'specification', label: 'log wage',
      estimation: {
        y: 'lwage', x: ['educ', 'female', 'educ_x_female'],
        terms: { educ_x_female: { op: 'interact', of: 'educ', with: ['female'] } },
        over: { educ: [8, 20] }, kinds: { female: 'binary' },
        ...est,
      },
    }],
  });

console.log('=== i. an interaction, however it is spelt ===');
{
  const t = (e) => sanitizeModel({ id: 'm', title: 't', params: [], objects: [{ id: 'w', kind: 'specification', label: 'l',
    estimation: { y: 'y', x: ['a', 'b', 'ab'], terms: { ab: e } } }] }).objects[0].estimation?.terms?.ab;

  ok('both operands in `with` — the canonical form', !!t({ op: 'interact', with: ['a', 'b'] }));
  // The spelling that was reported, and was silently refused.
  const natural = t({ op: 'interact', of: 'a', with: ['b'] });
  ok('`of` plus `with` — how anybody writes it', !!natural, JSON.stringify(natural));
  ok('  and both spellings end up as ONE shape', JSON.stringify(natural?.with) === JSON.stringify(['a', 'b']), JSON.stringify(natural));
  ok('  with nothing left in `of` to disagree with it', natural?.of === undefined, JSON.stringify(natural));
  ok('one operand is still not an interaction', !t({ op: 'interact', of: 'a' }));
  ok('  nor is none', !t({ op: 'interact' }));

  // NOT IN SILENCE. This is the half that let the rest of it hide.
  const bad = sanitizeModel({ id: 'm', title: 't', params: [], objects: [{ id: 'w', kind: 'specification', label: 'l',
    estimation: { y: 'y', x: ['a', 'ab'], terms: { ab: { op: 'interact', of: 'a' } } } }] });
  ok('a term that is refused is recorded', (bad.dropped ?? []).some((d) => /ab/.test(d)), JSON.stringify(bad.dropped));
  ok('  and says what it was', (bad.dropped ?? []).some((d) => /interact/.test(d)), JSON.stringify(bad.dropped));
}

console.log('\n=== ii. the coefficients they gave are the coefficients it uses ===');
{
  // Declared, which is the only way: `coefficients` maps each regressor — and
  // `intercept` — to the control that holds its value.
  const m = unpack(SAID({
    coefficients: { intercept: 'b0', educ: 'b1', female: 'b2', educ_x_female: 'b3' },
  }));
  const r = m.objects.find((o) => o.id === 'w__response');
  ok('the response surface exists', !!r);
  // The whole bug in one assertion: the expression must name the controls.
  for (const b of ['b0', 'b1', 'b2', 'b3']) {
    ok(`  it reads ${b} — the control, not a second name for it`,
      new RegExp(`\\b${b}\\b`).test(r?.defs?.z ?? ''), r?.defs?.z);
  }
  ok('  and names no w__b* anywhere', !/w__b\d/.test(r?.defs?.z ?? ''), r?.defs?.z);

  // AND WITHOUT THE DECLARATION, THE NOTATION BINDS. b0, b1, b2, b3 are not
  // names that resemble coefficients; they ARE the coefficients' names, the
  // way every text and every slider writes them. The prompt had promised this
  // for weeks while the engine refused it — see lib/model/binding.ts. What is
  // still never done is matching by resemblance: model-binding.test.mjs §3.
  const undeclared = unpack(SAID());
  const u = undeclared.objects.find((o) => o.id === 'w__response');
  for (const b of ['b0', 'b1', 'b2', 'b3']) {
    ok(`  without the declaration, ${b} binds by notation`, new RegExp(`\\b${b}\\b`).test(u?.defs?.z ?? ''), u?.defs?.z);
  }
  ok('  and nothing is left unbound', !/w__b\d/.test(u?.defs?.z ?? ''), u?.defs?.z);
  ok('  so nothing is reported missing', !buildSpec(undeclared).notes.some((n) => n.problem),
    JSON.stringify(buildSpec(undeclared).notes.filter((n) => n.problem)));
}

console.log('\n=== iii. and then the picture actually draws ===');
{
  const m = unpack(SAID({
    coefficients: { intercept: 'b0', educ: 'b1', female: 'b2', educ_x_female: 'b3' },
  }));
  ok('nothing is waiting for a range', inputsAwaiting(m).length === 0,
    inputsAwaiting(m).map((q) => q.id).join(' '));
  ok('education is a free input over what they said', 
    inputsOf(m).some((q) => q.id === 'educ' && q.min === 8 && q.max === 20),
    JSON.stringify(inputsOf(m).map((q) => [q.id, q.min, q.max])));
  ok('the binary has its own extent, from its kind',
    inputsOf(m).some((q) => q.id === 'female' && q.min === 0 && q.max === 1));
  ok('  and the engine says that is where it came from',
    [...symbolTable(m).by.values()].some((q) => /female/i.test(q.display) && q.domainFrom === 'type'),
    JSON.stringify([...symbolTable(m).by.values()].map((q) => [q.display, q.domainFrom])));

  const spec = buildSpec(m);
  ok('THE FRAME IS NOT EMPTY', spec.primitives.length > 0, `${spec.primitives.length} primitives`);
  ok('  and nothing refused', spec.notes.every((n) => !n.problem), JSON.stringify(spec.notes.filter((n) => n.problem)));
  ok('  it is a surface over the two of them', spec.dimensionality === 3);
  // Estimation IS still blocked — there is no data — and saying so is right.
  // What it must not do is say it in a register that reads as "the picture
  // failed", which is what "Still waiting on it needs observations" did over a
  // surface that had just drawn.
  const carrier = spec.notes.find((n) => n.of === 'w');
  ok('  it says the surface drew', /drawn as/.test(carrier?.note ?? ''), carrier?.note);
  ok('  and names fitting as the separate question it is',
    /Fitting it is a separate question/.test(carrier?.note ?? ''), carrier?.note);
  ok('  rather than reading as a picture still pending',
    !/Still waiting/.test(carrier?.note ?? ''), carrier?.note);
}

console.log('\n=== and without the declaration, the binary is read from its name — and said ===');
{
  // THE RULE CHANGED. This used to assert the opposite: "the engine does not
  // guess from the name, and must not start". In the product the `kinds`
  // declaration comes from a language model, it forgot, and the person saw an
  // empty frame with "FEMALE — needs a range" under it. `female` is an
  // indicator by every convention in the subject; reading it as one is not a
  // guess, it is literacy — and the reading is SAID on the slider and the
  // picture, and a declared kind overrides it. See lib/model/kinds.ts.
  const m = unpack(SAID({
    kinds: undefined,
    coefficients: { intercept: 'b0', educ: 'b1', female: 'b2', educ_x_female: 'b3' },
  }));
  ok('without the kind, nothing waits on a range', inputsAwaiting(m).length === 0,
    inputsAwaiting(m).map((q) => q.label ?? q.id).join(' '));
  ok('  female is 0 or 1, by its name',
    inputsOf(m).some((q) => q.id === 'female' && q.min === 0 && q.max === 1 && q.from === 'name'),
    JSON.stringify(inputsOf(m)));
  ok('  and the picture says that is a reading, not a declaration',
    /female is read as an indicator \(0 or 1\) from its name/.test(buildSpec(m).notes.find((n) => n.of === 'w')?.note ?? ''),
    buildSpec(m).notes.find((n) => n.of === 'w')?.note);
  ok('  THE FRAME IS NOT EMPTY', buildSpec(m).primitives.length > 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
