// DISPLAYS THAT ARE MADE, NOT DRAFTED — and what a drafted one must pass.
//
// Workflows 4, 5 and 7 of Logos 3.5, and the honesty under workflow 2 and 6.
// What is held down: a labeling exercise is made from a diagram already in
// the workspace (its answers are that diagram's labels, so nothing is
// invented to grade against) and graded deterministically; with no diagram
// it is made from the map's own ideas, and with neither it is not made at
// all — a quiz about a topic is never written; a worksheet is an accounting
// template against the library's standard transactions, chosen from the
// person's words, and a fractions worksheet or a diary's "journal entry" is
// not one; a table whose numbers are called the person's must hold only
// numbers they wrote or attached, or it is labelled as examples; a market's
// curves not in their words are said to be examples, and practice starts
// unanswered.

import {
  readDisplayRequest,
  makeFromRequest,
  exerciseFromDiagram,
  exerciseFromMap,
  worksheetFromWords,
  sealDraft,
  numbersIn,
  readDisplayProposal,
  makeDisplay,
  apply,
  create,
  currentOf,
  kindOf,
  EMPTY_SPACE,
} from './.tmp/index.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

const heart = {
  title: 'The heart',
  view: 'concept',
  nodes: [
    { id: 'ra', label: 'Right atrium', note: 'receives blood from the body' },
    { id: 'rv', label: 'Right ventricle' },
    { id: 'la', label: 'Left atrium' },
    { id: 'lv', label: 'Left ventricle', note: 'pumps blood to the body' },
    { id: 'ao', label: 'Aorta' },
  ],
  edges: [
    { from: 'ra', to: 'rv' },
    { from: 'la', to: 'lv' },
    { from: 'lv', to: 'ao' },
  ],
};

console.log('=== a labeling exercise over a diagram that is here ===');
{
  let space = create(EMPTY_SPACE, 'diagram', heart, { origin: 'socria' }).space;
  const diagram = space.objs[0];
  const raw = exerciseFromDiagram(diagram);
  const ex = kindOf('exercise').sanitize(raw);
  ok('every node is a part, its label the answer', ex.parts.length === 5 && ex.parts.map((p) => p.answer).sort().join('|') === 'Aorta|Left atrium|Left ventricle|Right atrium|Right ventricle');
  ok('  a note is its cue', ex.parts.some((p) => p.answer === 'Left ventricle' && p.cue === 'pumps blood to the body'));
  ok('  every label hidden, in a picture to label', ex.hidden.length === 5 && ex.mode === 'label' && ex.structure?.nodes.length === 5);
  ok('  placed where the diagram draws each, inside the frame', ex.structure.nodes.every((n) => n.x >= 0 && n.x <= 1 && n.y >= 0 && n.y <= 1));
  ok('a diagram Socria drew is said to be unverified', ex.source.verified === false && /not checked against a reference/.test(ex.source.note ?? ''));
  const mine = create(EMPTY_SPACE, 'diagram', heart, { origin: 'person' }).space.objs[0];
  ok('  the person’s own is not', kindOf('exercise').sanitize(exerciseFromDiagram(mine)).source.verified === true);

  // and it is graded — workflow 5
  space = create(space, 'exercise', ex, { origin: 'socria' }).space;
  const exId = space.objs[1].id;
  const partFor = (label) => currentOf(space.objs[1]).parts.find((p) => p.answer === label).id;
  const answer = (label, text) => {
    const r = apply(space, exId, 'answer', { part: partFor(label), text, by: 'person' }, { by: 'person' });
    if (r.ok) space = r.space;
    return r;
  };
  ok('the person answers', answer('Aorta', 'aorta').ok);
  ok('  a right answer is graded right, whatever its case', currentOf(space.objs[1]).graded[partFor('Aorta')] === 'right');
  answer('Right atrium', 'rigth atrium');
  ok('  a slip of spelling is close, not wrong', currentOf(space.objs[1]).graded[partFor('Right atrium')] === 'close');
  answer('Left atrium', 'left ventricle');
  ok('  a different part is wrong', currentOf(space.objs[1]).graded[partFor('Left atrium')] === 'wrong');
  const socria = apply(space, exId, 'answer', { part: partFor('Right ventricle'), text: 'right ventricle', by: 'socria' }, { by: 'socria' });
  ok('Socria cannot answer for them', !socria.ok && /Only you answer/.test(socria.why));
  const forged = apply(space, exId, 'answer', { part: partFor('Right ventricle'), text: 'x', by: 'person' }, { by: 'socria' });
  ok('  nor answer while claiming to be them', !forged.ok);
  const facts = kindOf('exercise').facts(currentOf(space.objs[1]), { guarded: true }).join(' ');
  ok('guarded, the facts never say a hidden label', !/Right ventricle|Left ventricle/.test(facts), facts);
}

console.log('\n=== made over what is here, or not at all ===');
{
  const map = {
    nodes: [
      { id: 'a', label: 'Photosynthesis', type: 'concept' },
      { id: 'b', label: 'Chlorophyll absorbs light', type: 'claim' },
      { id: 'c', label: 'Glucose is produced', type: 'claim' },
      { id: 'q', label: 'Why are leaves green?', type: 'question' },
    ],
    edges: [{ from: 'b', to: 'a', relation: 'part_of' }, { from: 'a', to: 'c', relation: 'leads_to' }],
  };
  const quiz = readDisplayRequest('quiz me on this');
  ok('"quiz me on this" asks for practice over what is here', quiz?.kind === 'exercise');
  const withDiagram = create(EMPTY_SPACE, 'diagram', heart, { origin: 'socria' }).space;
  const made = makeFromRequest(quiz, { said: 'quiz me on this', map, space: withDiagram });
  ok('  with a diagram here, it is made over the diagram', made.kind === 'exercise' && kindOf('exercise').sanitize(made.state).source.kind === 'diagram');
  const fromMap = makeFromRequest(readDisplayRequest('quiz me on my map'), { said: 'quiz me on my map', map, space: withDiagram });
  ok('  "on my map" makes it over the map, even with a diagram here', kindOf('exercise').sanitize(fromMap.state).source.kind === 'map');
  const recall = kindOf('exercise').sanitize(exerciseFromMap(map, 'Photosynthesis'));
  ok('  over the map: its ideas, recalled from how each bears on another', recall.mode === 'recall' && recall.parts.length === 3 && recall.parts.some((p) => /leads to/.test(p.cue ?? '')));
  ok('  a question is not something to recall', !recall.parts.some((p) => p.answer.includes('green')));
  const nothing = makeFromRequest(readDisplayRequest('make a quiz about the French revolution'), { said: 'make a quiz about the French revolution', map: { nodes: [], edges: [] }, space: EMPTY_SPACE });
  ok('with nothing here, no quiz is written about a topic — it says why', 'why' in nothing && /made from something already here/.test(nothing.why));
  const drafted = readDisplayProposal({ display: { kind: 'exercise', state: { parts: [{ id: 'p1', label: 'Robespierre' }] } } }, { request: null, said: '' });
  ok('  and a drafted exercise is refused: an exercise is made, not drafted', !drafted.ok && /made from what is already here/.test(drafted.says));
}

console.log('\n=== a worksheet from what was asked ===');
{
  ok('"give me a balance sheet worksheet" asks for one', readDisplayRequest('give me a balance sheet worksheet')?.kind === 'worksheet');
  ok('"make a journal entry exercise for buying equipment with cash"', readDisplayRequest('make a journal entry exercise for buying equipment with cash')?.kind === 'worksheet');
  ok('a fractions worksheet is not an accounting one', readDisplayRequest('make a worksheet on fractions for my class')?.kind !== 'worksheet');
  ok('a diary’s journal entry is not one either', readDisplayRequest('I need to write a journal entry about my day') === null);
  const bs = kindOf('worksheet').sanitize(worksheetFromWords('give me a balance sheet worksheet').state);
  ok('a balance sheet, blank: the person enters every amount', bs.template === 'balance-sheet' && bs.sections.every((s) => s.lines.every((l) => l.amount === null)));
  const inc = kindOf('worksheet').sanitize(worksheetFromWords('practice an income statement').state);
  ok('an income statement when they say so', inc.template === 'income-statement');
  const je = worksheetFromWords('make a journal entry exercise for buying equipment with cash');
  const jes = kindOf('worksheet').sanitize(je.state);
  ok('a journal entry records the library transaction their words come closest to', jes.template === 'journal-entry' && jes.scenario?.key === 'buy-equipment-cash' && !je.says, JSON.stringify(jes.scenario));
  const rent = kindOf('worksheet').sanitize(worksheetFromWords('journal entry practice: paying the rent').state);
  ok('  paying rent', rent.scenario?.key === 'pay-rent');
  const odd = worksheetFromWords('journal entry practice for a cryptocurrency swap');
  ok('  one the library does not hold is said not to be there — nothing made up to grade against', /checks the standard transactions in its library/.test(odd.says ?? ''));
  const made = makeFromRequest(readDisplayRequest('give me a balance sheet worksheet'), { said: 'give me a balance sheet worksheet', map: null, space: EMPTY_SPACE });
  ok('made without a model', made.kind === 'worksheet' && !!kindOf('worksheet').sanitize(made.state));
}

console.log('\n=== a drafted table’s numbers are theirs, or labelled examples ===');
{
  ok('numbers are read the way cells are', [...numbersIn('Rent was $1,200 in Jan, food 400, saved 12% and lost (45)')].sort((a, b) => a - b).join() === '-45,12,45,400,1200');
  const said = 'Make a bar chart of my spending: rent 1,200, food 400, transport 150';
  const table = (basis, food) => kindOf('data').sanitize({
    title: 'Spending', view: 'bar', basis,
    columns: [{ id: 'k', name: 'Category', type: 'text' }, { id: 'v', name: 'Amount', type: 'number', unit: '$' }],
    rows: [['Rent', 1200], ['Food', food], ['Transport', 150]], x: 'k', y: ['v'],
  });
  const theirs = sealDraft('data', table('given', 400), said);
  ok('numbers they wrote stay theirs', theirs.state.basis === 'given' && theirs.gaps.length === 0);
  const invented = sealDraft('data', table('given', 425), said);
  ok('a number they did not write turns the table into examples, and says so', invented.state.basis === 'illustrative' && /not in what you wrote or attached/.test(invented.gaps[0] ?? ''), JSON.stringify(invented));
  const examples = sealDraft('data', table('illustrative', 400), said);
  ok('examples are named as examples', /example numbers/.test(examples.gaps[0] ?? ''));
  const r = readDisplayProposal({ display: { kind: 'data', state: table('source', 999) } }, { request: readDisplayRequest(said), said });
  ok('through the proposal pass too: the seal runs on every drafted table', r.ok && r.state.basis === 'illustrative' && r.state.view === 'bar');
  ok('"make a bar chart of my spending" asks for a chart, as bars', readDisplayRequest(said)?.kind === 'data' && readDisplayRequest(said)?.view === 'bar');
  ok('"graph y = x^2" is the plotting surface’s, not a table', readDisplayRequest('graph y = x^2 from -3 to 3') === null && readDisplayRequest('make a graph of y = sin x') === null);
}

console.log('\n=== a drafted market is practice that starts fresh ===');
{
  const m = kindOf('market').sanitize({ title: 'Coffee', demand: { intercept: 10, slope: -0.5 }, supply: { intercept: 2, slope: 0.5 } });
  const given = sealDraft('market', m, 'Practice with demand P = 10 - 0.5Q and supply P = 2 + 0.5Q');
  ok('curves they gave are used as theirs', given.gaps.length === 0 && given.state.revealed === false && given.state.log.length === 0);
  const example = sealDraft('market', m, 'make me a supply and demand exercise');
  ok('curves they did not give are said to be examples', /example numbers/.test(example.gaps[0] ?? ''));
  ok('"make me a supply and demand exercise" asks for a market', readDisplayRequest('make me a supply and demand exercise')?.kind === 'market');
  ok('"draw supply and demand" stays the plotting surface’s', readDisplayRequest('draw supply and demand with a $2 tax') === null);
  const made = makeDisplay(EMPTY_SPACE, 'market', example.state, 'socria');
  ok('it becomes an object, named M1', made.ok && made.obj.name === 'M1');
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
