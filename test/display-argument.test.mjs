// AN ARGUMENT MAP — Logos 3.5 release workflow 3: generate an argument map
// with user-authored evidence.
//
// What is held down here: Socria proposes a structure (a thesis, claims, a
// counterargument); the PERSON adds the evidence, with the source they give;
// which claims have no evidence beneath them and which counterarguments are
// unanswered is computed before and after, never asserted; Socria may add
// claims, counterarguments, questions and evidence of its own — its evidence
// always its own suggestion, to be checked and sourced — but never rewords,
// moves or removes what the person wrote, never gives a source, and never
// states the thesis, answers a counterargument or draws the conclusion; a
// stored history in which Socria rewrote the person's evidence is cut on
// load; every edit is undoable; the state is canonical (one thesis, a tree,
// parents its roles allow); and words become operations only when they
// plainly name something in THIS argument.

import { apply, create, currentOf, kindOf, sanitizeSpace, seek, EMPTY_SPACE } from './.tmp/index.mjs';
import {
  sanitizeArgument, readArgumentOp, unsupportedClaims, unansweredCounters, openQuestions, suggestedEvidence, theirEvidence,
  unsourcedEvidence, restsOnSuggestion, unattached, outline, audit, argumentLayout, ARGUMENT_LIMITS, PARENT_ROLES,
} from './.tmp/display-argument.mjs';
import { stableKey } from './.tmp/display-base.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const same = (a, b) => stableKey(a) === stableKey(b);
const J = (v) => JSON.stringify(v);

// what the display pass might propose for "help me argue for rooftop solar subsidies"
const proposal = {
  title: 'Should the city subsidise rooftop solar?',
  items: [
    { id: 'a1', role: 'thesis', text: 'The city should subsidise rooftop solar', by: 'socria' },
    { id: 'a2', role: 'claim', text: 'Solar lowers household energy bills over a decade', parent: 'a1', by: 'socria' },
    { id: 'a3', role: 'claim', text: 'Local installers create skilled jobs', parent: 'a1', by: 'socria' },
    { id: 'a4', role: 'counter', text: 'Subsidies mostly help households that already own homes', parent: 'a1', by: 'socria' },
  ],
};

const SIZE = { w: 160, h: 56, gapX: 24, gapY: 40 };
function overlap(boxes) {
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (Math.abs(a.x - b.x) < (a.w + b.w) / 2 - 1e-6 && Math.abs(a.y - b.y) < (a.h + b.h) / 2 - 1e-6) return [a.id, b.id];
    }
  }
  return null;
}

console.log('=== release workflow 3: an argument map with the person’s own evidence ===');
{
  const c = create(EMPTY_SPACE, 'argument', proposal, { name: 'A1', origin: 'socria' });
  ok('Socria’s proposed structure is an object of thought', !!c && c.obj.kind === 'argument' && kindOf('argument')?.label === 'Argument' && c.obj.origin === 'socria');
  let space = c.space;
  const id = c.obj.id;
  const cur = () => currentOf(space.objs[0]);
  const item = (iid) => cur().items.find((i) => i.id === iid);
  const as = (by, op, args) => {
    const r = apply(space, id, op, args, { by, at: space.objs[0].steps.length + 1 });
    if (r.ok) space = r.space;
    return r;
  };
  const s0 = cur();
  ok('before: neither claim has evidence beneath it', J(unsupportedClaims(s0)) === J(['a2', 'a3']));
  ok('  the counterargument is unanswered', J(unansweredCounters(s0)) === J(['a4']));
  ok('  and there is no evidence of anyone’s yet', theirEvidence(s0).length === 0 && suggestedEvidence(s0).length === 0);
  const facts0 = kindOf('argument').facts(s0, { guarded: false });
  ok('  the facts say so, computed', facts0.includes('2 of 2 claims have no evidence beneath them: ‘Solar lowers household energy bills over a decade’; ‘Local installers create skilled jobs’.') && facts0.some((f) => /1 of 1 counterargument is not answered/.test(f)), J(facts0));

  // the person adds evidence, in their own words, with the source they give
  const said = 'add evidence for energy bills: Households in the 2023 pilot saved 18% a year (source: City Energy Office report, 2024)';
  const read = readArgumentOp(said, s0);
  ok('the person’s words are read as their evidence, with its source', J(read) === J({ op: 'add', args: { role: 'evidence', text: 'Households in the 2023 pilot saved 18% a year', parent: 'a2', source: 'City Energy Office report, 2024', by: 'person' } }), J(read));
  const added = as('person', read.op, read.args);
  ok('  applied as theirs', added.ok && item('a5')?.by === 'person' && item('a5').parent === 'a2' && item('a5').source === 'City Energy Office report, 2024');
  ok('  and the step says what it changed', added.step.note === '‘Solar lowers household energy bills over a decade’ now has evidence beneath it.', added.step.note);
  ok('after: only the jobs claim is unsupported', J(unsupportedClaims(cur())) === J(['a3']));
  ok('  the evidence is theirs and sourced', J(theirEvidence(cur())) === J(['a5']) && unsourcedEvidence(cur()).length === 0);

  // Socria suggests evidence — marked as its own, to be checked
  const suggestion = as('socria', 'add', { role: 'evidence', parent: 'a3', text: 'Installer jobs pay above the median wage', by: 'socria' });
  ok('Socria may suggest evidence of its own', suggestion.ok && item('a6').by === 'socria');
  ok('  it is listed as its suggestion, unsourced', J(suggestedEvidence(cur())) === J(['a6']) && J(unsourcedEvidence(cur())) === J(['a6']));
  ok('  the jobs claim now rests only on that suggestion — and the facts say so', J(restsOnSuggestion(cur())) === J(['a3']) && kindOf('argument').facts(cur(), { guarded: false }).some((f) => /rests only on evidence Socria suggested/.test(f)));
  ok('  and the text marks it unchecked', /Evidence: Installer jobs pay above the median wage · Socria’s suggestion, unchecked/.test(kindOf('argument').text(cur())));
  ok('Socria cannot give a source — a citation is one the person gives', !as('socria', 'add', { role: 'evidence', parent: 'a3', text: 'Wages rose 4%', source: 'BLS 2025', by: 'socria' }).ok && !as('socria', 'source', { id: 'a6', source: 'BLS 2025' }).ok);
  ok('Socria cannot reword the person’s evidence', !as('socria', 'text', { id: 'a5', text: 'Households saved 30% a year' }).ok);
  ok('  nor remove it', !as('socria', 'remove', { id: 'a5' }).ok);
  ok('  nor move it', !as('socria', 'parent', { id: 'a5', parent: 'a1' }).ok);
  ok('  nor change its source', !as('socria', 'source', { id: 'a5', source: 'Somewhere else' }).ok);
  ok('  and says why', /yours/.test(as('socria', 'text', { id: 'a5', text: 'x' }).why));
  ok('Socria cannot remove its own claim with the person’s evidence beneath it', /Your items sit beneath it/.test(as('socria', 'remove', { id: 'a2' }).why ?? ''));
  ok('Socria does not answer a counterargument, nor draw the conclusion', /yours to do/.test(as('socria', 'add', { role: 'rebuttal', parent: 'a4', text: 'Renters benefit too', by: 'socria' }).why) && /yours to draw/.test(as('socria', 'add', { role: 'conclusion', text: 'So subsidise it', by: 'socria' }).why));
  const counter = as('socria', 'add', { role: 'counter', parent: 'a5', text: 'An 18% saving may not last once tariffs change', by: 'socria' });
  ok('Socria may add a counterargument of its own — even against the person’s evidence', counter.ok && item('a7').parent === 'a5' && counter.step.note === '‘An 18% saving may not last once tariffs change’ is not answered yet.', counter.step.note);
  ok('  and a question', as('socria', 'add', { role: 'question', parent: 'a3', text: 'How many installers are local?', by: 'socria' }).ok && J(openQuestions(cur())) === J(['a8']));

  // the person answers the original counterargument
  const rebut = readArgumentOp('rebut the counterargument about households: Renters qualify through the landlord programme', cur());
  ok('"rebut the counterargument about households: …" names the one about households', rebut?.args.parent === 'a4' && rebut.args.role === 'rebuttal', J(rebut));
  const answered = as('person', rebut.op, rebut.args);
  ok('  answered, and the step says so', answered.ok && answered.step.note === '‘Subsidies mostly help households that already own homes’ is answered now.', answered.step.note);
  ok('after: only Socria’s new counterargument is unanswered', J(unansweredCounters(cur())) === J(['a7']));
  ok('the person may give Socria’s suggestion a source once they have checked it', as('person', 'source', { id: 'a6', source: 'State wage survey, 2025' }).ok && item('a6').by === 'socria' && restsOnSuggestion(cur()).length === 0);
  ok('  it stays Socria’s suggestion: who wrote it is never blurred', J(suggestedEvidence(cur())) === J(['a6']));
  ok('the person may reword what Socria proposed', as('person', 'text', { id: 'a3', text: 'Local installers create skilled, well-paid jobs' }).ok && item('a3').by === 'socria');

  // undo with seek
  const end = space.objs[0].at;
  space = seek(space, id, 0);
  ok('stepping back to Socria’s proposal: both claims unsupported again, nothing lost', J(unsupportedClaims(cur())) === J(['a2', 'a3']) && space.objs[0].states.length === end + 1);
  space = seek(space, id, 1);
  ok('  one step on: the person’s evidence is back', item('a5')?.by === 'person');
  space = seek(space, id, end);
  ok('  and to the end again', J(unansweredCounters(cur())) === J(['a7']));
  const back = sanitizeSpace(JSON.parse(JSON.stringify(space)));
  ok('the whole history survives a save: every step re-computed', back.objs[0].steps.length === space.objs[0].steps.length && same(currentOf(back.objs[0]), cur()));

  // a forged history: Socria "rewrote" the person's evidence
  const forged = JSON.parse(JSON.stringify(space));
  const f0 = currentOf(forged.objs[0]);
  const f1 = { ...f0, items: f0.items.map((i) => (i.id === 'a5' ? { ...i, text: 'Households saved 50% a year' } : i)) };
  forged.objs[0].states = [f0, f1];
  forged.objs[0].steps = [{ op: 'text', args: { id: 'a5', text: 'Households saved 50% a year' }, said: 'x', by: 'socria', at: 99 }];
  forged.objs[0].at = 1;
  const cut = sanitizeSpace(forged);
  ok('a stored step in which Socria rewrote the person’s evidence is cut on load', cut.objs[0].states.length === 1 && currentOf(cut.objs[0]).items.find((i) => i.id === 'a5').text === 'Households in the 2023 pilot saved 18% a year');
  const sourced = JSON.parse(JSON.stringify(space));
  const g0 = currentOf(sourced.objs[0]);
  const g1 = { ...g0, items: [...g0.items, { id: 'a10', role: 'evidence', text: 'Invented figure', parent: 'a3', source: 'Made up', by: 'socria' }] };
  sourced.objs[0].states = [g0, g1];
  sourced.objs[0].steps = [{ op: 'add', args: { role: 'evidence', text: 'Invented figure', parent: 'a3', source: 'Made up', by: 'socria' }, said: 'x', by: 'socria', at: 99 }];
  sourced.objs[0].at = 1;
  ok('  so is one in which Socria gave evidence a source', sanitizeSpace(sourced).objs[0].states.length === 1);
  const claimed = JSON.parse(JSON.stringify(space));
  const h0 = currentOf(claimed.objs[0]);
  claimed.objs[0].states = [h0, { ...h0, items: [...h0.items, { id: 'a10', role: 'claim', text: 'Claimed as theirs', parent: 'a1', by: 'person' }] }];
  claimed.objs[0].steps = [{ op: 'add', args: { role: 'claim', text: 'Claimed as theirs', by: 'person' }, said: 'x', by: 'socria', at: 99 }];
  claimed.objs[0].at = 1;
  ok('  and one in which Socria’s claim was recorded as the person’s', sanitizeSpace(claimed).objs[0].states.length === 1);
}

console.log('\n=== the state is canonical and checked ===');
{
  const s = sanitizeArgument(proposal);
  ok('an argument is read', !!s && s.items.length === 4 && s.view === 'map' && s.title === 'Should the city subsidise rooftop solar?');
  ok('  the same state read twice is the same state', same(sanitizeArgument(s), s));
  ok('  and survives being saved and reopened', same(sanitizeArgument(JSON.parse(JSON.stringify(s))), s));
  const messy = sanitizeArgument({
    title: 'x'.repeat(200),
    view: 'outline',
    items: [
      { id: 'c1', role: 'claim', text: 'A claim before its thesis', parent: 'e1', by: 'person' },
      { id: 't1', role: 'thesis', text: 'The first thesis', parent: 'c1', by: 'person' },
      { id: 't2', role: 'thesis', text: 'A second thesis' },
      { id: 'e1', role: 'evidence', text: 'Evidence for nothing', parent: 'missing' },
      { id: 'r1', role: 'rebuttal', text: 'A rebuttal under a claim', parent: 'c1' },
      { id: 'k1', role: 'counter', text: 'A counter under a rebuttal', parent: 'r1' },
      { id: 'q1', role: 'question', text: 'A question under evidence', parent: 'e1', status: 'resolved' },
      { id: 'q2', role: 'question', text: 'An open question', status: 'whatever' },
      { id: 'z1', role: 'conclusion', text: 'So it follows', parent: 'q2' },
      { id: 'c1', role: 'claim', text: 'A duplicate id', by: 'person', status: 'resolved' },
      { id: 'c3', role: 'Counterargument', text: 'Spelled out' },
      { id: 'c4', role: 'opinion', text: 'Not a role' },
      { id: 'c5', role: 'claim', text: '' },
      { id: 'c6', role: 'evidence', text: '\u0000control\u0007 chars\n\nand   spaces', source: 's'.repeat(300), parent: 'c1' },
      { id: 'c7', role: 'claim', text: 'w '.repeat(200) },
    ],
  });
  const by = (iid) => messy.items.find((i) => i.id === iid);
  ok('one thesis: a second is not kept', messy.items.filter((i) => i.role === 'thesis').length === 1 && !by('t2'));
  ok('  the thesis sits under nothing', !('parent' in by('t1')));
  ok('a claim sits under the thesis, whatever it said', by('c1').parent === 't1');
  ok('evidence for nothing that exists is attached to nothing', !('parent' in by('e1')) && unattached(messy).includes('e1'));
  ok('a rebuttal under anything but a counterargument is attached to nothing', !('parent' in by('r1')));
  ok('a counterargument under a rebuttal goes against the thesis', by('k1').parent === 't1');
  ok('a question may sit under anything, and keeps its status', by('q1').parent === 'e1' && by('q1').status === 'resolved');
  ok('  a question is open unless resolved', by('q2').status === 'open');
  ok('a conclusion follows from the thesis', by('z1').parent === 't1');
  ok('a duplicate id is renumbered, and status is a question’s alone', new Set(messy.items.map((i) => i.id)).size === messy.items.length && messy.items.some((i) => i.text === 'A duplicate id' && !('status' in i) && i.id !== 'c1'));
  ok('"Counterargument" is read as a counterargument; an unknown role is not guessed', by('c3').role === 'counter' && !by('c4'));
  ok('an empty item is not an item', !by('c5'));
  ok(`text is cleaned and capped at ${ARGUMENT_LIMITS.text}, a source at ${ARGUMENT_LIMITS.source}`, by('c6').text === 'control chars and spaces' && by('c6').source.length <= 160 && by('c7').text.length <= 240);
  ok('the title is capped and the view kept', messy.title.length <= 80 && messy.view === 'outline');
  ok('  the messy state is canonical too', same(sanitizeArgument(messy), messy));
  // loops
  const loop = sanitizeArgument({ items: [
    { id: 't', role: 'thesis', text: 'Thesis' },
    { id: 'e', role: 'evidence', text: 'Evidence', parent: 'k' },
    { id: 'k', role: 'counter', text: 'Counter', parent: 'e' },
    { id: 'q1', role: 'question', text: 'Q one', parent: 'q2' },
    { id: 'q2', role: 'question', text: 'Q two', parent: 'q1' },
  ] });
  ok('evidence and a counterargument under each other: the earlier lets go', !('parent' in loop.items[1]) && loop.items[2].parent === 'e');
  ok('two questions under each other: the earlier lets go', !('parent' in loop.items[3]) && loop.items[4].parent === 'q1');
  ok('  and a loop cut once stays cut', same(sanitizeArgument(loop), loop));
  const flip = sanitizeArgument({ items: [
    { id: 't', role: 'thesis', text: 'Thesis' },
    { id: 'k', role: 'counter', text: 'Counter', parent: 'e' },
    { id: 'e', role: 'evidence', text: 'Evidence', parent: 'k' },
  ] });
  ok('  a counterargument that lets go goes against the thesis', flip.items[1].parent === 't' && flip.items[2].parent === 'k');
  const noThesis = sanitizeArgument({ items: [{ role: 'claim', text: 'Orphan claim' }, { role: 'counter', text: 'Orphan counter' }] });
  ok('without a thesis, claims and counterarguments are attached to nothing', noThesis.items.every((i) => !('parent' in i)) && unattached(noThesis).length === 2);
  const many = sanitizeArgument({ items: Array.from({ length: 60 }, (_, i) => ({ role: 'question', text: `Question ${i}` })) });
  ok(`at most ${ARGUMENT_LIMITS.items} items`, many.items.length === 40);
  ok('an argument with no items yet is an argument', sanitizeArgument({ title: 'Empty', items: [] })?.items.length === 0);
  ok('junk is not an argument', sanitizeArgument(null) === null && sanitizeArgument('argument') === null && sanitizeArgument({}) === null && sanitizeArgument({ items: 'x' }) === null);
  ok('the rules of what sits under what', J(PARENT_ROLES.claim) === J(['thesis']) && J(PARENT_ROLES.rebuttal) === J(['counter']) && PARENT_ROLES.question.length === 7 && PARENT_ROLES.thesis.length === 0);
}

console.log('\n=== what is computed ===');
{
  const s = sanitizeArgument({
    title: 'Four-day week',
    items: [
      { id: 'z', role: 'conclusion', text: 'Trial it for a year', parent: 't', by: 'person' },
      { id: 'q', role: 'question', text: 'Who covers weekend shifts?', parent: 't', by: 'person' },
      { id: 'k1', role: 'counter', text: 'Customers expect five-day service', parent: 't', by: 'socria' },
      { id: 't', role: 'thesis', text: 'Our team should move to a four-day week', by: 'person' },
      { id: 'c2', role: 'claim', text: 'It cuts burnout', parent: 't', by: 'person' },
      { id: 'c1', role: 'claim', text: 'Output holds steady', parent: 't', by: 'person' },
      { id: 'e1', role: 'evidence', text: 'The 2022 UK pilot kept revenue flat', parent: 'c1', source: 'Autonomy, 2023', by: 'person' },
      { id: 'k2', role: 'counter', text: 'Pilots self-select keen firms', parent: 'e1', by: 'socria' },
      { id: 'r2', role: 'rebuttal', text: 'The Iceland trials were public-sector wide', parent: 'k2', by: 'person' },
      { id: 'e2', role: 'evidence', text: 'Sick days fell in the pilot', parent: 'c2', by: 'socria' },
      { id: 'x', role: 'evidence', text: 'A stray statistic', by: 'person' },
      { id: 'q2', role: 'question', text: 'Resolved already?', parent: 'c2', status: 'resolved', by: 'person' },
    ],
  });
  const order = outline(s).map((l) => `${l.id}:${l.depth}`);
  ok('the outline: thesis, then claims with what is beneath them, counterarguments, questions, the conclusion last, then the unattached', J(order) === J(['t:0', 'c2:1', 'e2:2', 'q2:2', 'c1:1', 'e1:2', 'k2:3', 'r2:4', 'k1:1', 'q:1', 'z:1', 'x:0']), J(order));
  ok('no claim is unsupported', unsupportedClaims(s).length === 0);
  ok('the counterargument to the thesis is unanswered; the one to the evidence is answered', J(unansweredCounters(s)) === J(['k1']));
  ok('one question is open', J(openQuestions(s)) === J(['q']));
  ok('Socria’s evidence and the person’s are told apart', J(suggestedEvidence(s)) === J(['e2']) && J(theirEvidence(s)) === J(['e1', 'x']));
  ok('evidence without a source', J(unsourcedEvidence(s)) === J(['e2', 'x']));
  ok('what rests only on Socria’s suggestion', J(restsOnSuggestion(s)) === J(['c2']));
  ok('what is attached to nothing', J(unattached(s)) === J(['x']));
  ok('all of it at once', J(audit(s)) === J({ unsupported: [], suggestionOnly: ['c2'], unanswered: ['k1'], open: ['q'], suggested: ['e2'], theirs: ['e1', 'x'], unsourced: ['e2', 'x'], unattached: ['x'] }));
  const lay = argumentLayout(s, SIZE);
  ok('the map: every item has one box', lay.boxes.length === s.items.length && s.items.every((i) => lay.boxes.filter((b) => b.id === i.id).length === 1));
  ok('  no two boxes overlap', !overlap(lay.boxes), J(overlap(lay.boxes)));
  ok('  the thesis on top, each item a row beneath what it bears on', lay.boxes.find((b) => b.id === 't').y < lay.boxes.find((b) => b.id === 'c1').y && lay.boxes.find((b) => b.id === 'c1').y < lay.boxes.find((b) => b.id === 'e1').y);
  ok('  each link says how it bears', J(lay.links.find((l) => l.to === 'k2')) === J({ from: 'e1', to: 'k2', relation: 'opposes' }) && lay.links.find((l) => l.to === 'r2').relation === 'answers' && lay.links.find((l) => l.to === 'q').relation === 'asks' && lay.links.find((l) => l.to === 'z').relation === 'concludes' && lay.links.find((l) => l.to === 'c1').relation === 'supports');
  ok('  deterministic', same(argumentLayout(s, SIZE), lay) && same(argumentLayout(sanitizeArgument(JSON.parse(JSON.stringify(s))), SIZE), lay));
  const big = sanitizeArgument({ items: [{ id: 't', role: 'thesis', text: 'T' }, ...Array.from({ length: 39 }, (_, i) => ({ id: `i${i}`, role: ['claim', 'evidence', 'counter', 'question'][i % 4], text: `Item ${i}`, parent: i < 4 ? 't' : `i${Math.floor(i / 4) - 1}` }))] });
  const bigLay = argumentLayout(big, SIZE);
  ok('  a full map of 40 items, no overlap', bigLay.boxes.length === 40 && !overlap(bigLay.boxes));
}

console.log('\n=== every edit is an operation, checked ===');
{
  const c = create(EMPTY_SPACE, 'argument', proposal, { name: 'A1', origin: 'socria' });
  let space = c.space;
  const id = c.obj.id;
  const cur = () => currentOf(space.objs[0]);
  const item = (iid) => cur().items.find((i) => i.id === iid);
  const step = (op, args, by = 'person') => {
    const r = apply(space, id, op, args, { by, at: 1 });
    if (r.ok) space = r.space;
    return r;
  };
  ok('a second thesis is refused', /already has a thesis/.test(step('add', { role: 'thesis', text: 'Another', by: 'person' }).why));
  ok('a role that is not one is refused', !step('add', { role: 'opinion', text: 'x', by: 'person' }).ok);
  ok('a question may go under the thesis', step('add', { role: 'question', text: 'Q?', parent: 'a1', by: 'person' }).ok && cur().items.find((i) => i.id === 'a5').role === 'question');
  ok('  evidence under a question is refused, with the rule', /Evidence goes under a claim/.test(step('add', { role: 'evidence', text: 'E', parent: 'a5', by: 'person' }).why));
  ok('a rebuttal must say which counterargument it answers', /Say which counterargument/.test(step('add', { role: 'rebuttal', text: 'R', by: 'person' }).why));
  ok('text too long is refused, not cut', /240 characters/.test(step('add', { role: 'claim', text: 'w '.repeat(130), by: 'person' }).why));
  ok('who wrote it must be said', /Say who wrote it/.test(step('add', { role: 'claim', text: 'Anonymous' }).why));
  ok('a claim added with no parent sits under the thesis', step('add', { role: 'claim', text: 'Panels raise property values', by: 'person' }).ok && item('a6').parent === 'a1');
  ok('reworded', step('text', { id: 'a6', text: 'Panels raise resale values' }).ok && item('a6').text === 'Panels raise resale values');
  ok('  the same words again are refused', !step('text', { id: 'a6', text: 'Panels raise resale values' }).ok);
  ok('evidence is moved under another claim', step('add', { role: 'evidence', text: 'Zillow found a 4% premium', parent: 'a6', by: 'person' }).ok && step('parent', { id: 'a7', parent: 'a2' }).ok && item('a7').parent === 'a2');
  ok('  not under itself', /beneath itself/.test(step('parent', { id: 'a2', parent: 'a2' }).why));
  ok('  nor beneath what is beneath it', step('add', { role: 'counter', text: 'K', parent: 'a7', by: 'person' }).ok && /beneath itself/.test(step('parent', { id: 'a7', parent: 'a8' }).why));
  ok('  a claim moves only under the thesis', /A claim sits under the thesis/.test(step('parent', { id: 'a6', parent: 'a7' }).why));
  ok('  the thesis moves nowhere', !step('parent', { id: 'a1', parent: 'a2' }).ok);
  ok('a source given, and cleared', step('source', { id: 'a7', source: 'Zillow, 2019' }).ok && item('a7').source === 'Zillow, 2019' && step('source', { id: 'a7', source: '' }).ok && !('source' in item('a7')));
  ok('  a source too long is refused', !step('source', { id: 'a7', source: 's'.repeat(200) }).ok);
  ok('a question resolved, and not twice', step('status', { id: 'a5', status: 'resolved' }).ok && item('a5').status === 'resolved' && !step('status', { id: 'a5', status: 'resolved' }).ok);
  ok('  only a question has a status', !step('status', { id: 'a2', status: 'resolved' }).ok);
  ok('shown as an outline', step('view', { view: 'outline' }).ok && cur().view === 'outline');
  ok('renamed', step('title', { title: 'Solar subsidies' }).ok && cur().title === 'Solar subsidies');
  // removing: what was beneath moves to the removed item's parent, or the thesis, or nothing
  const kids = cur().items.filter((i) => i.parent === 'a2').map((i) => i.id);
  ok('removing a claim moves its evidence up to the thesis', kids.includes('a7') && step('remove', { id: 'a2' }).ok && !item('a2') && item('a7').parent === 'a1');
  ok('removing a counterargument leaves its rebuttal attached to nothing', step('add', { role: 'rebuttal', text: 'Renters qualify too', parent: 'a4', by: 'person' }).ok && step('remove', { id: 'a4' }).ok && !('parent' in item('a9')) && unattached(cur()).includes('a9'));
  ok('removing the thesis leaves the claims attached to nothing', step('remove', { id: 'a1' }).ok && cur().items.filter((i) => i.role === 'claim').every((i) => !('parent' in i)));
  ok('  and a thesis can be stated again', step('add', { role: 'thesis', text: 'Cities should fund rooftop solar', by: 'person' }).ok && cur().items.filter((i) => i.role === 'claim').every((i) => i.parent === 'a10'));
  const back = sanitizeSpace(JSON.parse(JSON.stringify(space)));
  ok('the whole history survives a save', back.objs[0].steps.length === space.objs[0].steps.length && same(currentOf(back.objs[0]), cur()));
}

console.log('\n=== words become operations only when they plainly are one ===');
{
  const s = sanitizeArgument(proposal);
  const r = (t, st = s) => readArgumentOp(t, st);
  const is = (t, want, st = s) => ok(`"${t}"`, J(r(t, st)) === J(want), J(r(t, st)));
  is('my thesis is: The city should fund rooftop solar for renters too', { op: 'text', args: { id: 'a1', text: 'The city should fund rooftop solar for renters too' } });
  is('my thesis is that homework should be optional', { op: 'add', args: { role: 'thesis', text: 'homework should be optional', by: 'person' } }, sanitizeArgument({ items: [] }));
  is('Thesis: Homework should be optional.', { op: 'add', args: { role: 'thesis', text: 'Homework should be optional', by: 'person' } }, sanitizeArgument({ items: [] }));
  is('add a claim: Solar panels raise property values', { op: 'add', args: { role: 'claim', text: 'Solar panels raise property values', by: 'person' } });
  is('add a conclusion: The city should start with a pilot', { op: 'add', args: { role: 'conclusion', text: 'The city should start with a pilot', by: 'person' } });
  is('add evidence: 60% of residents support it', { op: 'add', args: { role: 'evidence', text: '60% of residents support it', parent: 'a1', by: 'person' } });
  is('add evidence for local installers: 40 firms are based in the county (source: Chamber of Commerce)', { op: 'add', args: { role: 'evidence', text: '40 firms are based in the county', parent: 'a3', source: 'Chamber of Commerce', by: 'person' } });
  is('add a counterargument: Panels need rare materials', { op: 'add', args: { role: 'counter', text: 'Panels need rare materials', parent: 'a1', by: 'person' } });
  is('add a counterargument to the jobs claim: Most installers come from out of town', { op: 'add', args: { role: 'counter', text: 'Most installers come from out of town', parent: 'a3', by: 'person' } });
  is('rebut the counterargument: Renters qualify through landlords', { op: 'add', args: { role: 'rebuttal', text: 'Renters qualify through landlords', parent: 'a4', by: 'person' } });
  is('add a rebuttal: Renters qualify through landlords', { op: 'add', args: { role: 'rebuttal', text: 'Renters qualify through landlords', parent: 'a4', by: 'person' } });
  is('add a question: Who pays for maintenance?', { op: 'add', args: { role: 'question', text: 'Who pays for maintenance?', parent: 'a1', by: 'person' } });
  is('add a question about energy bills: Do the savings last past ten years?', { op: 'add', args: { role: 'question', text: 'Do the savings last past ten years?', parent: 'a2', by: 'person' } });
  const withQ = sanitizeArgument({ ...proposal, items: [...proposal.items, { id: 'q1', role: 'question', text: 'Who pays for maintenance?', parent: 'a1', by: 'person' }] });
  is('mark the question about maintenance resolved', { op: 'status', args: { id: 'q1', status: 'resolved' } }, withQ);
  is('mark it as answered', { op: 'status', args: { id: 'q1', status: 'resolved' } }, withQ);
  is('remove local installers create skilled jobs', { op: 'remove', args: { id: 'a3' } });
  is('remove the counterargument', { op: 'remove', args: { id: 'a4' } });
  is('the source for the pilot evidence is City report 2024', { op: 'source', args: { id: 'a5', source: 'City report 2024' } }, sanitizeArgument({ ...proposal, items: [...proposal.items, { id: 'a5', role: 'evidence', text: 'The pilot saved 18%', parent: 'a2', by: 'person' }] }));
  is('reword the jobs claim to: Installers create local, skilled jobs', { op: 'text', args: { id: 'a3', text: 'Installers create local, skilled jobs' } });
  is('show as outline', { op: 'view', args: { view: 'outline' } });
  is('show it as an outline', { op: 'view', args: { view: 'outline' } });
  is('as a map', { op: 'view', args: { view: 'map' } }, { ...s, view: 'outline' });
  // and what must be left to the conversation
  const two = sanitizeArgument({ ...proposal, items: [...proposal.items, { id: 'a5', role: 'counter', text: 'Panels need rare materials', parent: 'a1', by: 'person' }] });
  for (const [t, st] of [
    ['my thesis is due on Friday', s],
    ['my thesis is about climate policy', s],
    ['the thesis is too long', s],
    ['add more evidence to your answer', s],
    ['what is a good counterargument?', s],
    ['remove the last sentence', s],
    ['remove any doubt about the energy bills claim', s],
    ['mark my words', s],
    ['I need to rebut his point somehow', s],
    ['show me on a map where Athens is', s],
    ['can you add a question at the end of your reply', s],
    ['add a question', s],
    ['add evidence for my point: I read it somewhere', s],
    ['rebut: that is wrong', two],
    ['as a map', s],
    ['explain the counterargument as a diagram', s],
    ['Solar is cheaper than coal', s],
  ]) {
    ok(`left to the conversation: "${t}"`, r(t, st) === null, J(r(t, st)));
  }
  ok('the same thesis again is no change', r('my thesis is: The city should subsidise rooftop solar') === null);
  ok('readOp is the argument’s words', J(kindOf('argument').readOp('add a claim: X helps', s)) === J({ op: 'add', args: { role: 'claim', text: 'X helps', by: 'person' } }));
}

console.log('\n=== the kind ===');
{
  const k = kindOf('argument');
  const s = sanitizeArgument({ ...proposal, items: [...proposal.items, { id: 'a5', role: 'evidence', text: 'Households in the pilot saved 18% a year', parent: 'a2', source: 'City Energy Office, 2024', by: 'person' }] });
  ok('a card, a trail step and a live figure', J(k.size(s, 'card')) === J({ w: 260, h: 150 }) && J(k.size(s, 'trail')) === J({ w: 200, h: 110 }) && k.size(s, 'live').w <= 720 && k.size(s, 'live').h <= 640);
  ok('  a full map stays within the live bounds', k.size(sanitizeArgument({ items: Array.from({ length: 40 }, (_, i) => ({ role: 'question', text: `Q${i}` })) }), 'live').h <= 640);
  ok('its shape in a line', k.shape(s) === 'argument map · 5 items' && k.shape({ ...s, view: 'outline' }) === 'argument outline · 5 items');
  ok('its parts are its items', k.parts(s).length === 5 && k.parts(s)[0].label === 'The city should subsidise rooftop solar');
  const pf = k.partFacts(s, 'a5');
  ok('an item’s facts: what it bears on, its source, who wrote it', pf[0] === 'Evidence: Households in the pilot saved 18% a year' && pf.includes('supports ‘Solar lowers household energy bills over a decade’') && pf.includes('source: City Energy Office, 2024') && pf.includes('yours'), J(pf));
  ok('  a claim with nothing beneath it says so', k.partFacts(s, 'a3').includes('no evidence beneath it'));
  const text = k.text(s);
  ok('the text is the outline, marking what is theirs', text.split('\n')[1] === 'Thesis: The city should subsidise rooftop solar' && /^    Evidence: Households in the pilot saved 18% a year \[source: City Energy Office, 2024\] · theirs$/m.test(text), text);
  ok('  and is capped', k.text(sanitizeArgument({ items: Array.from({ length: 40 }, (_, i) => ({ role: 'question', text: `A long open question number ${i} `.repeat(6) })) })).length <= 2400);
  const facts = k.facts(s, { guarded: false });
  ok('the facts are computed', facts.includes('Should the city subsidise rooftop solar?: an argument map of 5 items, shown as a map.') && facts.includes('1 of 2 claims has no evidence beneath it: ‘Local installers create skilled jobs’.') && facts.some((f) => /1 item is the person’s own/.test(f)), J(facts));
  ok('  without a thesis, it says so', k.facts(sanitizeArgument({ items: [{ role: 'claim', text: 'Loose' }] }), { guarded: false }).includes('There is no thesis yet.'));
  ok('the map and the outline say what they show', k.views.length === 2 && k.views.every((v) => v.shows && v.interactions.length) && k.views.find((v) => v.primary).id === 'map');
  ok('  and an empty argument says why it cannot be drawn', /nothing to map yet/.test(k.views[0].unavailable(sanitizeArgument({ items: [] }))) && k.views[0].unavailable(s) === null);
  const c = create(EMPTY_SPACE, 'argument', { title: 'Empty', items: [] }, { name: 'A1', origin: 'person' });
  ok('  so showing it as an outline is refused, saying why', /nothing to outline yet/.test(apply(c.space, c.obj.id, 'view', { view: 'outline' }, { by: 'person' }).why));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
