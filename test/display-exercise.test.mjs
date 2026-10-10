// AN EXERCISE — Logos 3.5's labeling and retrieval practice.
//
// Workflow 5 of the release: create and grade a diagram-labeling exercise, and
// "hide the labels so I can test myself". What is held down here: an exercise
// built from a schematic Socria drew says it is unverified and vouches for
// nothing beyond its source; which labels are hidden is chosen
// deterministically, never by chance; answers are graded on the spot — right,
// close (a typo), wrong — and the feedback never contains the label unless the
// person revealed it; hints climb from the first letter to the letter count to
// the context, and never reveal; another round hides again what was missed;
// only the person answers; nothing the conversation is told — facts, text,
// parts, the history — contains a hidden label, and results describe this
// round, never mastery; and words become operations only when they plainly are
// one.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { apply, create, currentOf, kindOf, sanitizeSpace, seek, EMPTY_SPACE } from './.tmp/index.mjs';
import {
  sanitizeExercise,
  exerciseFrom,
  gradeAnswer,
  normaliseAnswer,
  damerauLevenshtein,
  feedbackFor,
  exerciseHint,
  chooseHidden,
  naturalCompare,
  tally,
  tallyLine,
  hiddenNumber,
  withoutHidden,
  readExerciseOp,
  UNVERIFIED_NOTE,
  EXERCISE_LIMITS,
} from './.tmp/display-exercise.mjs';
import { stableKey } from './.tmp/display-base.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const TODAY = '2026-10-10';
const K = kindOf('exercise');

// "Make me a labeling exercise on the heart" — a schematic Socria drew, so not verified
const heart = [
  { id: 'n1', label: 'Aorta', cue: 'The largest artery: it carries oxygen-rich blood from the left ventricle to the body.' },
  { id: 'n2', label: 'Superior vena cava', cue: 'Brings blood from the upper body back to the right atrium.' },
  { id: 'n3', label: 'Inferior vena cava', cue: 'Brings blood from the lower body back to the heart.' },
  { id: 'n4', label: 'Right atrium', cue: 'The chamber that receives blood returning from the body.' },
  { id: 'n5', label: 'Right ventricle', cue: 'Pumps blood to the lungs.' },
  { id: 'n6', label: 'Left atrium', cue: 'Receives oxygen-rich blood from the lungs.' },
  { id: 'n7', label: 'Left ventricle', cue: 'The thickest-walled chamber; it pumps blood into the aorta.' },
  { id: 'n8', label: 'Pulmonary artery', accept: ['Pulmonary trunk'], cue: 'Carries blood from the right ventricle to the lungs.' },
  { id: 'n9', label: 'Septum' },
  { id: 'n10', label: 'Mitral valve', accept: ['Bicuspid valve'], cue: 'Between the left atrium and the left ventricle.' },
];
const structure = {
  nodes: heart.map((p, i) => ({ id: p.id, x: 40 + (i % 4) * 120, y: 40 + Math.floor(i / 4) * 140 })),
  edges: [['n2', 'n4'], ['n3', 'n4'], ['n4', 'n5'], ['n5', 'n8'], ['n6', 'n7'], ['n7', 'n1'], ['n9', 'n5'], ['n9', 'n7'], ['n10', 'n6'], ['n10', 'n7']].map(([from, to]) => ({ from, to })),
};
const spec = (extra = {}) => ({ sourceKind: 'diagram', sourceTitle: 'The heart', verified: false, parts: [...heart].reverse(), structure, ...extra });

const flat = (t) => ` ${String(t).normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `;
/** every hidden label (and alternative) that appears in what the conversation is told about a state */
function leaks(st, extra = '') {
  const said = flat([...K.facts(st, { guarded: false }), ...K.facts(st, { guarded: true }), K.text(st), K.shape(st), ...K.parts(st).map((p) => p.label), ...st.parts.flatMap((p) => K.partFacts(st, p.id)), extra].join('\n'));
  return st.parts.filter((p) => st.hidden.includes(p.id)).flatMap((p) => [p.answer, ...(p.accept ?? [])]).filter((a) => said.includes(flat(a)));
}
const contains = (text, label) => flat(text).includes(flat(label));

function session(state) {
  const c = create(EMPTY_SPACE, 'exercise', state, { name: 'X1', origin: 'socria' });
  const x = { space: c.space, id: c.obj.id };
  x.step = (op, args, by = 'person') => {
    const r = apply(x.space, x.id, op, args, { by, at: 1 });
    if (r.ok) x.space = r.space;
    return r;
  };
  x.cur = () => currentOf(x.space.objs.find((o) => o.id === x.id));
  x.n = (k) => x.cur().hidden[k - 1];
  return x;
}

console.log('=== grading is deterministic ===');
{
  ok('case, punctuation, a leading article and a trailing plural s are set aside', normaliseAnswer('The Aortas.') === 'aorta' && normaliseAnswer('  Left   Atrium! ') === 'left atrium' && normaliseAnswer('Pulmonary veins') === 'pulmonary vein');
  ok('…accents too, and a double s is not a plural', normaliseAnswer('Ventrículo') === 'ventriculo' && normaliseAnswer('Glass') === 'glass');
  ok('edit distance counts a swap of neighbours as one', damerauLevenshtein('aorta', 'aotra') === 1 && damerauLevenshtein('ca', 'ac') === 1);
  ok('…and the rest as the textbook does', damerauLevenshtein('kitten', 'sitting') === 3 && damerauLevenshtein('', 'abc') === 3 && damerauLevenshtein('abc', 'abc') === 0);
  const aorta = heart[0].label;
  const g = (text, part) => gradeAnswer(text, part);
  ok('right: the label', g('aorta', { answer: aorta }) === 'right' && g('The aorta.', { answer: aorta }) === 'right' && g('AORTA', { answer: aorta }) === 'right' && g('aortas', { answer: aorta }) === 'right');
  ok('right: an accepted alternative', g('pulmonary trunk', { answer: 'Pulmonary artery', accept: ['Pulmonary trunk'] }) === 'right' && g('Bicuspid valve', { answer: 'Mitral valve', accept: ['Bicuspid valve'] }) === 'right');
  ok('close: a swapped pair in a short label', g('aotra', { answer: aorta }) === 'close' && g('arota', { answer: aorta }) === 'close');
  ok('close: one slip in six letters or fewer', g('Septim', { answer: 'Septum' }) === 'close' && g('Sptim', { answer: 'Septum' }) === 'wrong');
  ok('close: two slips in a longer label', g('superior vena cave', { answer: 'Superior vena cava' }) === 'close' && g('superior venna cave', { answer: 'Superior vena cava' }) === 'close' && g('suprior venna cave', { answer: 'Superior vena cava' }) === 'wrong');
  ok('close: a typo in an alternative', g('pulmonary trnuk', { answer: 'Pulmonary artery', accept: ['Pulmonary trunk'] }) === 'close');
  ok('wrong: a different label', g('left atrium', { answer: 'Left ventricle' }) === 'wrong' && g('right atrium', { answer: 'Left atrium' }) === 'wrong' && g('artery', { answer: aorta }) === 'wrong');
  ok('wrong: nothing written', g('', { answer: aorta }) === 'wrong' && g('   ', { answer: aorta }) === 'wrong' && g(null, { answer: aorta }) === 'wrong');
  ok('a different number is never a spelling slip', g('C4', { answer: 'C3' }) === 'wrong' && g('T2 vertebra', { answer: 'T1 vertebra' }) === 'wrong');
  ok('a label under three letters has no near miss', g('AB', { answer: 'AV' }) === 'wrong');
  for (const grade of ['right', 'close', 'wrong', undefined]) ok(`feedback for ${grade} never contains the label`, !contains(feedbackFor(grade, { answer: aorta }), aorta), feedbackFor(grade, { answer: aorta }));
  ok('a close answer is told to check the spelling', /check the spelling/.test(feedbackFor('close')));
  ok('once revealed, the feedback gives the label', contains(feedbackFor('wrong', { revealed: true, answer: aorta }), aorta));
}

console.log('\n=== deterministic hiding ===');
{
  ok('natural id order: n2 before n10', ['n10', 'n2', 'n1'].sort(naturalCompare).join() === 'n1,n2,n10');
  ok('all, or none', chooseHidden(['a', 'b', 'c'], 'all').join() === 'a,b,c' && chooseHidden(['a', 'b', 'c']).join() === 'a,b,c' && chooseHidden(['a', 'b', 'c'], 0).length === 0);
  ok('a count is spread evenly through the order', chooseHidden(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], 4).join() === 'b,d,f,h' && chooseHidden(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], 2).join() === 'c,g');
  ok('more than there are is all of them; nonsense is all of them', chooseHidden(['a', 'b'], 9).join() === 'a,b' && chooseHidden(['a', 'b'], NaN).join() === 'a,b');
  const a = exerciseFrom(spec({ hide: 4 }));
  const b = exerciseFrom({ ...spec({ hide: 4 }), parts: [heart[5], heart[2], heart[9], heart[0], heart[7], heart[3], heart[1], heart[8], heart[6], heart[4]] });
  ok('which labels are hidden depends on the parts, not the order they came in', stableKey(a) === stableKey(b));
  ok('…and is the same every time', stableKey(exerciseFrom(spec({ hide: 4 }))) === stableKey(a));
  ok('four of ten, evenly spaced in id order: superior vena cava, right atrium, left ventricle, septum', JSON.stringify(a.hidden.map((id) => a.parts.find((p) => p.id === id).answer)) === JSON.stringify(['Superior vena cava', 'Right atrium', 'Left ventricle', 'Septum']), JSON.stringify(a.hidden));
  const src = ['lib/objects/display-exercise.ts'].map((p) => readFileSync(join(root, p), 'utf8')).join('\n');
  ok('nothing in the kind reads the clock, rolls dice or formats by locale', !/Math\.random|Date\.now|new Date|toLocale|localeCompare|Intl\./.test(src));
}

console.log('\n=== the state is canonical and checked ===');
{
  const raw = {
    title: 'x'.repeat(200),
    source: { kind: 'diagram', title: 'Heart', verified: false, note: 'Simplified: valves omitted.' },
    parts: [
      { id: 'aorta', label: 'Aorta', accept: ['aorta', 'The aorta', 'Arch of aorta', 'a', 'b', 'c', 'd'], cue: 'z '.repeat(200) },
      { id: 'lv', answer: 'Left ventricle' },
      { id: 'lv', answer: 'Duplicate id' },
      { label: '' },
      { label: '—' },
      { id: 'bad id!', label: 'Right atrium' },
      ...Array.from({ length: 50 }, (_, i) => ({ id: `p${i}`, label: `Part ${i}` })),
    ],
    structure: {
      nodes: [{ id: 'aorta', x: 10.123, y: -5 }, { id: 'lv', x: 'a', y: 1e9 }, { id: 'wall', x: 3 }, { id: 'aorta' }],
      edges: [{ from: 'aorta', to: 'lv' }, { from: 'aorta', to: 'nowhere' }, { from: 'lv', to: 'lv' }, { from: 'aorta', to: 'lv' }, { from: 'wall', to: 'aorta' }],
    },
    hidden: ['aorta', 'lv', 'nope', 'p3'],
    revealed: ['lv', 'p4'],
    answers: { aorta: 'the aorta', lv: 'left atrium', p4: 'x', p3: 'Part 3', nope: 'y' },
    graded: { aorta: 'wrong', lv: 'right' },
    hints: { aorta: 7, lv: 0, p3: 2 },
    rounds: -4,
    mode: 'label',
    view: 'results',
  };
  const s = sanitizeExercise(raw);
  ok('an exercise is read', !!s && s.parts.length === EXERCISE_LIMITS.parts, String(s?.parts.length));
  ok('  the same state read twice is the same state', stableKey(sanitizeExercise(s)) === stableKey(s));
  ok('  and survives being saved and reopened', stableKey(sanitizeExercise(JSON.parse(JSON.stringify(s)))) === stableKey(s));
  ok('parts get positional ids, so no id can carry a label', s.parts.every((p, i) => p.id === `x${i + 1}`) && !JSON.stringify(s).includes('"aorta"'));
  ok('a part with nothing to recall is not a part', !s.parts.some((p) => !p.answer || p.answer === '—'));
  ok(`at most ${EXERCISE_LIMITS.accept} alternatives, none the label itself`, JSON.stringify(s.parts[0].accept) === JSON.stringify(['Arch of aorta', 'a', 'b', 'c']), JSON.stringify(s.parts[0].accept));
  ok(`a cue is capped at ${EXERCISE_LIMITS.cue} characters, a title at 80`, s.parts[0].cue.length <= EXERCISE_LIMITS.cue && s.title.length <= 80);
  ok('references follow the parts to their new ids: hidden', JSON.stringify(s.hidden) === JSON.stringify(['x1', 'x2', 'x8']), JSON.stringify(s.hidden));
  ok('only a hidden label can be revealed', JSON.stringify(s.revealed) === JSON.stringify(['x2']));
  ok('only a hidden label has an answer', JSON.stringify(s.answers) === JSON.stringify({ x1: 'the aorta', x2: 'left atrium', x8: 'Part 3' }), JSON.stringify(s.answers));
  ok('grades are computed from the answers, never taken on trust', JSON.stringify(s.graded) === JSON.stringify({ x1: 'right', x2: 'wrong', x8: 'right' }), JSON.stringify(s.graded));
  ok('hints are 1 to 3', JSON.stringify(s.hints) === JSON.stringify({ x1: 3, x8: 2 }), JSON.stringify(s.hints));
  ok('a round is at least the first', s.rounds === 1);
  ok('the picture keeps its points, renamed; an edge to nowhere is dropped', JSON.stringify(s.structure) === JSON.stringify({ nodes: [{ id: 'x1', x: 10.12, y: -5 }, { id: 'x2' }, { id: 'n1', x: 3 }], edges: [{ from: 'x1', to: 'x2' }, { from: 'n1', to: 'x1' }] }), JSON.stringify(s.structure));
  ok('a source Socria drew says so first, whatever else its note says', s.source.verified === false && s.source.note === `${UNVERIFIED_NOTE} Simplified: valves omitted.`);
  ok('…even with no note given', sanitizeExercise({ parts: [{ label: 'A1' }], source: { verified: false } }).source.note === UNVERIFIED_NOTE);
  ok('…and a source that is verified says nothing of the kind', !('note' in sanitizeExercise({ parts: [{ label: 'A1' }], source: { verified: true } }).source));
  ok('a source is unverified unless it plainly says otherwise', sanitizeExercise({ parts: [{ label: 'A1' }], source: { verified: 'yes' } }).source.verified === false);
  const flatRaw = sanitizeExercise({ parts: [{ label: 'Aorta' }], view: 'label', mode: 'label' });
  ok('without a picture, an exercise is recall from a list', flatRaw.mode === 'recall' && flatRaw.view === 'recall' && flatRaw.structure === null);
  ok('an exercise hides everything unless it says otherwise', JSON.stringify(flatRaw.hidden) === JSON.stringify(['x1']));
  ok('junk is not an exercise', sanitizeExercise(null) === null && sanitizeExercise({}) === null && sanitizeExercise({ parts: [] }) === null && sanitizeExercise({ parts: [{ label: '' }] }) === null);
  ok('nothing to build from, nothing built', exerciseFrom({ ...spec(), parts: [] }) === null && exerciseFrom(null) === null);
}

// ── workflow 5 ──────────────────────────────────────────────────────

console.log('\n=== workflow 5: an exercise from a schematic Socria drew ===');
const x = session(exerciseFrom(spec({ hide: 'all' })));
{
  const s = x.cur();
  ok('the exercise is an object of thought', K?.label === 'Exercise' && x.space.objs[0].kind === 'exercise');
  ok('built from the diagram’s parts, in id order, every label hidden', s.parts.length === 10 && s.parts[9].answer === 'Mitral valve' && s.hidden.length === 10 && s.mode === 'label' && s.view === 'label');
  ok('its note says it is Socria’s schematic, unverified', s.source.note === UNVERIFIED_NOTE && s.source.verified === false);
  const facts = K.facts(s, { guarded: false }).join(' ');
  ok('the facts say so too', /drawn by Socria and is not verified/.test(facts) && /graded against that drawing only/.test(facts), facts);
  ok('and nothing claims accuracy beyond the source', !/\b(?:is|are) (?:accurate|correct|verified)\b|anatomically (?:accurate|correct)|medically/i.test(facts + K.text(s)));
  ok('the count starts at nothing right, ten to go', tallyLine(s) === 'This round: 0 of 10 right, 10 to go.', tallyLine(s));
  ok('no hidden label in anything said about it', leaks(s).length === 0, JSON.stringify(leaks(s)));
  ok('…and the check would catch one: a label, or an alternative, said anywhere', JSON.stringify(leaks(s, 'they wrote the Aorta and the pulmonary trunk')) === JSON.stringify(['Aorta', 'Pulmonary trunk']), JSON.stringify(leaks(s, 'the Aorta')));

  const answer = (k, text) => x.step('answer', { part: x.n(k), text, by: 'person' });
  let r = answer(1, 'aorta');
  ok('label 1, “aorta”: right', r.ok && x.cur().graded.x1 === 'right' && /^Label 1: right\./.test(r.step.note), r.why ?? r.step.note);
  ok('  the step does not repeat the label', !contains(r.step.note + r.step.said, 'aorta'), r.step.note);
  r = answer(4, 'right atruim');
  ok('label 4, “right atruim”: close — check the spelling', r.ok && x.cur().graded.x4 === 'close' && /close — check the spelling/.test(r.step.note), r.step?.note);
  r = answer(7, 'left atrium');
  ok('label 7, “left atrium”: wrong', r.ok && x.cur().graded.x7 === 'wrong' && /not right yet/.test(r.step.note));
  r = answer(8, 'pulmonary trunk');
  ok('label 8, “pulmonary trunk”: right, as an accepted alternative', r.ok && x.cur().graded.x8 === 'right');
  r = answer(2, 'pulmonary vein');
  ok('label 2, “pulmonary vein”: wrong', r.ok && x.cur().graded.x2 === 'wrong');
  ok('the count is this round’s', tallyLine(x.cur()) === 'This round: 2 of 10 right, 1 close, 2 wrong, 5 to go.', tallyLine(x.cur()));
  ok('…and the facts say it, never more', K.facts(x.cur(), { guarded: false }).includes('This round: 2 of 10 right, 1 close, 2 wrong, 5 to go.') && !/master|expert|perfect|know (?:it|this|them) (?:well|now)/i.test(K.facts(x.cur(), { guarded: false }).join(' ')));
  ok('no hidden label in anything said about it, though the person wrote some of them', leaks(x.cur()).length === 0, JSON.stringify(leaks(x.cur())));

  // hints climb, and never reveal
  const mitral = x.n(10);
  const hints = [];
  for (let L = 1; L <= 3; L++) {
    const h = x.step('hint', { part: mitral });
    hints.push(h.ok ? exerciseHint(x.cur(), mitral, L) : `REFUSED ${h.why}`);
    ok(`hint ${L} for label 10 is a step, visible in the history`, h.ok && x.cur().hints[mitral] === L && h.step.note.startsWith(`Label 10, hint ${L}: `), h.why);
  }
  ok('hint 1: the first letter', hints[0] === 'It begins with “M”.', hints[0]);
  ok('hint 2: the first letter and the letter count', hints[1] === 'It begins with “M”: two words, of 6 and 5 letters.', hints[1]);
  ok('hint 3: the context — with every label still to recall kept out of it', hints[2] === 'Context: Between the … and the ….', hints[2]);
  ok('no hint contains the label or its alternative', hints.every((h) => !contains(h, 'Mitral valve') && !contains(h, 'Bicuspid valve')));
  const more = x.step('hint', { part: mitral });
  ok('there is no fourth hint: revealing is the person’s choice', !more.ok && /reveal it/.test(more.why));
  const aortaCue = exerciseHint(x.cur(), x.n(1), 3);
  ok('a hint for a label already right is not given', !x.step('hint', { part: x.n(1) }).ok);
  ok('…its cue would keep out the labels still to recall', /the … to the body/.test(aortaCue) && !contains(aortaCue, 'left ventricle'), aortaCue);
  ok('a cue that names its own label has it taken out', exerciseHint(sanitizeExercise({ parts: [{ label: 'Aorta', cue: 'The aorta is the largest artery.' }] }), 'x1', 3) === 'Context: The … is the largest artery.');
  for (let L = 1; L <= 3; L++) x.step('hint', { part: x.n(9) });
  ok('a part with no cue, beside labels still to recall: no more context, and it says so', /no more context/.test(exerciseHint(x.cur(), x.n(9), 3)));
  ok('hints are counted for the round', K.facts(x.cur(), { guarded: false }).some((f) => f === '6 hints asked for this round.'));

  // reveal
  r = x.step('reveal', { part: x.n(7) });
  ok('label 7 is revealed at the person’s asking', r.ok && x.cur().revealed.includes('x7') && r.step.note === 'Label 7 revealed.');
  ok('  the feedback now gives it', contains(feedbackFor(x.cur().graded.x7, { revealed: true, answer: x.cur().parts[6].answer }), 'left ventricle'));
  ok('  the conversation still is not told it', leaks(x.cur(), r.step.note).length === 0, JSON.stringify(leaks(x.cur())));
  ok('  and the context for label 10 now names what the person has seen', exerciseHint(x.cur(), mitral, 3) === 'Context: Between the … and the left ventricle.', exerciseHint(x.cur(), mitral, 3));
  ok('a revealed label cannot be answered this round', !answer(7, 'left ventricle').ok);
  ok('the count says what was revealed', tallyLine(x.cur()) === 'This round: 2 of 10 right, 1 close, 1 wrong, 1 revealed, 5 to go.', tallyLine(x.cur()));

  // another round
  r = x.step('again', {});
  const s2 = x.cur();
  ok('another round: the wrong and the revealed are hidden again, their answers cleared', r.ok && !('x2' in s2.answers) && !('x7' in s2.answers) && !s2.revealed.length && s2.hidden.length === 10);
  ok('  what was right or close is kept', s2.answers.x1 === 'aorta' && s2.answers.x8 === 'pulmonary trunk' && s2.answers.x4 === 'right atruim');
  ok('  it is round 2', s2.rounds === 2 && /^Round 2: 7 labels to recall again\.$/.test(r.step.note), r.step.note);
  ok('  and the count is this round’s', tallyLine(s2) === 'This round: 2 of 10 right, 1 close, 7 to go.', tallyLine(s2));
  ok('the corrected answer is graded right now', answer(7, 'Left Ventricle').ok && x.cur().graded.x7 === 'right');
  ok('a close answer can be put right', answer(4, 'right atrium').ok && x.cur().graded.x4 === 'right');
  // across the whole history: nothing said contains a hidden label
  const o = x.space.objs[0];
  const told = o.states.map((st, i) => leaks(st, (o.steps[i - 1]?.note ?? '') + (o.steps[i - 1]?.said ?? '')));
  ok('no state in the history, nor any step’s note, tells the conversation a hidden label', told.every((l) => l.length === 0), JSON.stringify(told));
}

console.log('\n=== only the person answers ===');
{
  const t = session(exerciseFrom(spec({ hide: 4 })));
  const s = t.cur();
  const first = s.hidden[0];
  const socria = t.step('answer', { part: first, text: 'superior vena cava', by: 'socria' }, 'socria');
  ok('Socria cannot answer for the person — and says so', !socria.ok && /Only you answer/.test(socria.why));
  ok('  nor claim to be them', !t.step('answer', { part: first, text: 'superior vena cava', by: 'person' }, 'socria').ok);
  ok('  and the person cannot answer as Socria', !t.step('answer', { part: first, text: 'x', by: 'socria' }).ok);
  ok('an answer says who gave it', !t.step('answer', { part: first, text: 'x' }).ok);
  ok('Socria does not ask for hints, reveal, start a round or clear answers', !t.step('hint', { part: first }, 'socria').ok && !t.step('reveal', { part: first }, 'socria').ok && !t.step('reset', {}, 'socria').ok && !t.step('again', {}, 'socria').ok);
  ok('a label that is showing has nothing to answer', !t.step('answer', { part: s.parts.find((p) => !s.hidden.includes(p.id)).id, text: 'aorta', by: 'person' }).ok);
  ok('Socria may hide the labels — it changes no answer', t.step('hideAll', {}, 'socria').ok && t.cur().hidden.length === 10);
  ok('the person answers', t.step('answer', { part: first, text: 'superior vena cava', by: 'person' }).ok);
  // a forged history is cut on load: a "socria" answer never replays
  const forged = JSON.parse(JSON.stringify(t.space));
  const s0 = currentOf(forged.objs[0]);
  const s1 = { ...s0, answers: { ...s0.answers, x9: 'Septum' }, graded: { ...s0.graded, x9: 'right' } };
  forged.objs[0].states = [s0, s1];
  forged.objs[0].steps = [{ op: 'answer', args: { part: 'x9', text: 'Septum', by: 'socria' }, said: 'x', by: 'socria', at: 3 }];
  forged.objs[0].at = 1;
  const read = sanitizeSpace(forged);
  ok('a stored step in which Socria answered is cut on load', read.objs[0].states.length === 1 && !('x9' in currentOf(read.objs[0]).answers));
  const theirs = JSON.parse(JSON.stringify(forged));
  theirs.objs[0].steps[0] = { ...theirs.objs[0].steps[0], by: 'person', args: { part: 'x9', text: 'Septum', by: 'person' } };
  ok('…and the same answer, given by the person, replays', sanitizeSpace(theirs).objs[0].states.length === 2);
  const lie = JSON.parse(JSON.stringify(theirs));
  lie.objs[0].states[1].graded.x9 = 'wrong';
  ok('…while a stored grade that is not what the answer earns is not believed', currentOf(sanitizeSpace(lie).objs[0]).graded.x9 === 'right');
}

console.log('\n=== every operation is computed, kept and undoable ===');
{
  const e = session(exerciseFrom(spec({ hide: 4 })));
  const h = e.cur().hidden; // superior vena cava, right atrium, left ventricle, septum
  ok('the septum’s context: the visible label beside it, never the hidden one', exerciseHint(e.cur(), h[3], 3) === 'It sits next to “Right ventricle”.', exerciseHint(e.cur(), h[3], 3));
  const run = [
    ['answer', { part: h[0], text: 'Superior vena cava', by: 'person' }],
    ['answer', { part: h[1], text: 'left atrium', by: 'person' }],
    ['hint', { part: h[2] }],
    ['reveal', { part: h[2] }],
    ['view', { view: 'results' }],
    ['again', {}],
    ['hideAll', {}],
    ['title', { title: 'Heart drill' }],
    ['view', { view: 'recall' }],
    ['reset', {}],
  ];
  for (const [op, args] of run) {
    const r = e.step(op, args);
    ok(`${op} is an operation, computed`, r.ok && typeof r.step.said === 'string' && r.step.said.length > 0, r.why);
  }
  ok('every operation the kind has was used', Object.keys(K.ops).every((op) => run.some(([o]) => o === op)), Object.keys(K.ops).join(','));
  const s = e.cur();
  ok('starting over clears the answers and the round, and keeps every label hidden', !Object.keys(s.answers).length && s.rounds === 1 && s.hidden.length === 10 && s.title === 'Heart drill' && s.view === 'label');
  const obj = e.space.objs[0];
  const back = sanitizeSpace(JSON.parse(JSON.stringify(e.space)));
  ok('the whole history survives a save: every step re-computed', back.objs[0].steps.length === obj.steps.length && back.objs[0].states.every((st, i) => stableKey(st) === stableKey(obj.states[i])));
  e.space = seek(e.space, e.id, 5);
  ok('undo steps back without losing anything', e.cur().view === 'results' && Object.keys(e.cur().answers).length === 2 && e.space.objs[0].states.length === run.length + 1);
  e.space = seek(e.space, e.id, run.length);
  ok('…and redo steps forward', e.cur().title === 'Heart drill' && !Object.keys(e.cur().answers).length);
  ok('nothing to start over from is refused, not recorded', !e.step('reset', {}).ok);
  ok('every label already hidden is refused, not recorded', !e.step('hideAll', {}).ok);
  ok('another round before anything is missed is refused, and says why', /Answer the rest first/.test(e.step('again', {}).why ?? ''));
}

console.log('\n=== nothing said gives a hidden label away ===');
{
  const named = session(exerciseFrom(spec({ hide: 'all', sourceTitle: 'Aorta and the heart', title: 'Find the aorta' })));
  ok('not even a title that names a hidden label', leaks(named.cur()).length === 0 && /… and the heart/.test(K.facts(named.cur(), { guarded: false })[0]), K.facts(named.cur(), { guarded: false })[0]);
  ok('the parts go by number while hidden', K.parts(named.cur()).every((p, i) => p.label === `Label ${i + 1}`));
  ok('a hidden part’s facts are its number and how it stands', JSON.stringify(K.partFacts(named.cur(), 'x1')) === JSON.stringify(['hidden label 1', 'not answered yet']));
  ok('guarded, the conversation is told not to give them away', /never say, spell or describe a hidden label/.test(K.facts(named.cur(), { guarded: true }).join(' ')));
  const shown = session(exerciseFrom(spec({ hide: 4 })));
  ok('labels that are showing are named, and only those', /Showing: Aorta; Inferior vena cava; Right ventricle; Left atrium; Pulmonary artery; Mitral valve/.test(K.text(shown.cur())) && leaks(shown.cur()).length === 0, K.text(shown.cur()));
  ok('withoutHidden takes out every form of a hidden label', withoutHidden(shown.cur(), 'The Septum, two septums, the superior vena cava.') === 'The …, two …, the ….');
  ok('hiddenNumber counts among the hidden', hiddenNumber(shown.cur(), 'x7') === 3 && hiddenNumber(shown.cur(), 'x1') === 0);
  ok('the tally is a plain count', JSON.stringify(tally(shown.cur())) === JSON.stringify({ hidden: 4, right: 0, close: 0, wrong: 0, revealed: 0, toGo: 4 }));
}

console.log('\n=== words become operations only when they plainly are one ===');
{
  const s = exerciseFrom(spec({ hide: 'all' }));
  const r = (t) => readExerciseOp(t, s, TODAY);
  const is = (t, want) => ok(`"${t}"`, JSON.stringify(r(t)) === JSON.stringify(want), JSON.stringify(r(t)));
  is('check', { op: 'view', args: { view: 'results' } });
  is('Check my answers', { op: 'view', args: { view: 'results' } });
  is('how did I do?', { op: 'view', args: { view: 'results' } });
  is('hint for 3', { op: 'hint', args: { part: 'x3' } });
  is('can I have a hint for number 3?', { op: 'hint', args: { part: 'x3' } });
  is('give me a hint', { op: 'hint', args: { part: 'x1' } });
  is('reveal 3', { op: 'reveal', args: { part: 'x3' } });
  is('show me the answer to number 5', { op: 'reveal', args: { part: 'x5' } });
  is('again', { op: 'again', args: {} });
  is('Another round!', { op: 'again', args: {} });
  is('3 is aorta', { op: 'answer', args: { part: 'x3', text: 'aorta', by: 'person' } });
  is('number 3: aorta', { op: 'answer', args: { part: 'x3', text: 'aorta', by: 'person' } });
  is('#2 superior vena cava', { op: 'answer', args: { part: 'x2', text: 'superior vena cava', by: 'person' } });
  is('4. right atrium', { op: 'answer', args: { part: 'x4', text: 'right atrium', by: 'person' } });
  is('10 = “Mitral valve”', { op: 'answer', args: { part: 'x10', text: 'Mitral valve', by: 'person' } });
  is('hide all the labels', { op: 'hideAll', args: {} });
  is('start over', { op: 'reset', args: {} });
  is('show the list', { op: 'view', args: { view: 'recall' } });
  for (const t of [
    'what is the aorta?',
    '3 is a prime number',
    'number 3 is my favourite',
    'check out this diagram',
    'I’ll try again later',
    'reveal your sources',
    'reset my password',
    'hide and seek',
    'hint: I am confused about the heart',
    '1 is wrong',
    '2 is right',
    '3 is aorta?',
    '11 is aorta',
    'the heart has 4 chambers',
    '3 is aorta and 4 is vena cava',
    '2 is bigger than 1',
    'number 7',
    'give me the answer',
    'is 3 the aorta',
  ]) {
    ok(`left to the conversation: "${t}"`, r(t) === null, JSON.stringify(r(t)));
  }
  const done = sanitizeExercise({ ...s, answers: Object.fromEntries(s.parts.map((p) => [p.id, p.answer])) });
  ok('no hint is offered when every label is right', readExerciseOp('give me a hint', done, TODAY) === null);
  ok('the kind reads words the same way', JSON.stringify(K.readOp('3 is aorta', s)) === JSON.stringify(r('3 is aorta')));
}

console.log('\n=== the registry entry ===');
{
  const s = exerciseFrom(spec({ hide: 4 }));
  const list = sanitizeExercise({ parts: Array.from({ length: 40 }, (_, i) => ({ label: `Part ${i}` })) });
  ok('a card and a step in a trail have fixed sizes', JSON.stringify(K.size(s, 'card')) === JSON.stringify({ w: 260, h: 150 }) && JSON.stringify(K.size(s, 'trail')) === JSON.stringify({ w: 200, h: 110 }));
  ok('live, it fits within 720 × 640 — labeling or recall', K.size(s, 'live').w <= 720 && K.size(s, 'live').h <= 640 && K.size(list, 'live').h <= 640);
  ok('its shape is said in a line', K.shape(s) === 'exercise · 4 of 10 labels hidden · round 1', K.shape(s));
  ok('labeling needs a picture, and says so when there is none', K.views.find((v) => v.id === 'label').unavailable(list) !== null && K.views.find((v) => v.id === 'label').unavailable(s) === null);
  ok('results wait for an answer', K.views.find((v) => v.id === 'results').unavailable(s) !== null);
  ok('the results view cannot be opened before anything is answered', !session(s).step('view', { view: 'results' }).ok);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
