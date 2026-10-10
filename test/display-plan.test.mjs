// A PLAN — Logos 3.5's everyday timeline, board, checklist and storyboard.
//
// Workflow 1 of the release: generate and edit an everyday planning timeline.
// What is held down here: the state is canonical and survives a save; every
// edit is an operation, computed and undoable; dates are real calendar days;
// a loop of things waiting on each other cannot be stored; clashes are
// computed, never claimed; words become operations only when they plainly
// name something in THIS plan; and what the person wrote is theirs — Socria
// can add and suggest, never overwrite.

import { apply, create, currentOf, kindOf, sanitizeSpace, seek, EMPTY_SPACE } from './.tmp/index.mjs';
import { sanitizePlan, readPlanOp, clashes, progress, span, timelineBars, PLAN_LIMITS } from './.tmp/display-plan.mjs';
import { readDay, readShift, isoDay, addDays, dayDiff, cleanText, findByLabel, stableKey } from './.tmp/display-base.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

const TODAY = '2026-10-10'; // a Saturday

// "Help me organise my semester" — what the display pass might propose
const semester = {
  title: 'Fall semester',
  items: [
    { id: 'i1', text: 'Research for the history essay', date: '2026-10-12', end: '2026-10-23', lane: 'History', by: 'socria' },
    { id: 'i2', text: 'History essay draft', date: '2026-10-26', lane: 'History', by: 'socria' },
    { id: 'i3', text: 'Calculus midterm', date: '2026-10-20', lane: 'Calculus', status: 'todo', by: 'person' },
    { id: 'i4', text: 'Problem set 5', date: '2026-10-16', lane: 'Calculus', status: 'doing', by: 'socria' },
    { text: 'Book the study room', by: 'socria' },
  ],
  links: [{ from: 'i1', to: 'i2', by: 'socria' }],
};

console.log('=== the state is canonical and checked ===');
{
  const s = sanitizePlan(semester);
  ok('a plan is read', !!s && s.items.length === 5);
  ok('  the item without an id gets the next free one', s.items[4].id === 'i5');
  ok('  it opens on its timeline, since it has dates', s.view === 'timeline');
  ok('  the same state read twice is the same state', stableKey(sanitizePlan(s)) === stableKey(s));
  ok('  and survives being saved and reopened', stableKey(sanitizePlan(JSON.parse(JSON.stringify(s)))) === stableKey(s));
  const bad = sanitizePlan({
    title: 'x'.repeat(300),
    items: [
      { id: 'a', text: 'Feb 30 is not a day', date: '2026-02-30', by: 'person' },
      { id: 'b', text: 'Ends before it starts', date: '2026-05-10', end: '2026-05-01' },
      { id: 'a', text: 'A duplicate id' },
      { text: '' },
      { text: '\u0000control\u0007 chars\n\nand   spaces' },
    ],
    links: [{ from: 'a', to: 'nowhere' }, { from: 'a', to: 'a' }, { from: 'a', to: 'b' }, { from: 'b', to: 'a' }],
  });
  ok('an impossible date is dropped, not guessed', !('date' in bad.items[0]));
  ok('an end before the start is dropped', bad.items[1].date === '2026-05-10' && !('end' in bad.items[1]));
  ok('a duplicate id is renumbered', new Set(bad.items.map((i) => i.id)).size === bad.items.length);
  ok('an empty item is not an item', bad.items.length === 4);
  ok('control characters and runs of space are cleaned', bad.items[3].text === 'control chars and spaces');
  ok('a title is capped', bad.title.length <= 80);
  ok('a link to nothing, and a self-link, are dropped', bad.links.every((l) => l.from !== l.to && bad.items.some((i) => i.id === l.to)));
  ok('a loop of things waiting on each other cannot be stored', bad.links.length === 1 && bad.links[0].from === 'a');
  const many = sanitizePlan({ items: Array.from({ length: 80 }, (_, i) => ({ text: `Item ${i}` })) });
  ok(`at most ${PLAN_LIMITS.items} items`, many.items.length === PLAN_LIMITS.items);
  ok('a plan with no items yet is a plan', sanitizePlan({ title: 'Empty', items: [] })?.items.length === 0);
  ok('junk is not a plan', sanitizePlan(null) === null && sanitizePlan('plan') === null && sanitizePlan({}) === null);
}

console.log('\n=== what is computed ===');
{
  const s = sanitizePlan(semester);
  ok('nothing clashes in a sound plan', clashes(s).length === 0);
  const late = sanitizePlan({ ...semester, items: semester.items.map((i) => (i.id === 'i2' ? { ...i, date: '2026-10-20' } : i)) });
  const c = clashes(late);
  ok('a draft dated inside its own research is a clash', c.length === 1 && c[0].item === 'i2' && c[0].waitsOn === 'i1' && c[0].by === 3, JSON.stringify(c));
  ok('progress counts what has a status', progress(s).total === 2 && progress(s).done === 0);
  ok('the span is first to last day', span(s).start === '2026-10-12' && span(s).end === '2026-10-26' && span(s).days === 14);
  const tb = timelineBars(s);
  ok('every dated item has a bar', tb.bars.length === 4);
  ok('lanes come from the items', tb.lanes.includes('History') && tb.lanes.includes('Calculus'));
  const overlap = tb.bars.some((a) => tb.bars.some((b) => a !== b && a.lane === b.lane && a.row === b.row && a.x0 < b.x1 - 1e-9 && b.x0 < a.x1 - 1e-9));
  ok('no two bars in a lane overlap', !overlap);
  ok('bars sit inside the span', tb.bars.every((b) => b.x0 >= 0 && b.x1 <= 1.0001));
}

console.log('\n=== every edit is an operation, computed and undoable ===');
{
  const c = create(EMPTY_SPACE, 'plan', semester, { name: 'P1', origin: 'socria' });
  ok('the plan is an object of thought', !!c && c.obj.kind === 'plan' && kindOf('plan')?.label === 'Plan');
  let space = c.space;
  const id = c.obj.id;
  const step = (op, args, by = 'person') => {
    const r = apply(space, id, op, args, { by, at: 1 });
    if (r.ok) space = r.space;
    return r;
  };
  ok('the person moves the draft a week later', step('shift', { id: 'i2', days: 7 }).ok && currentOf(space.objs[0]).items.find((i) => i.id === 'i2').date === '2026-11-02');
  const clash = step('date', { id: 'i2', date: '2026-10-20' });
  ok('moving it inside its research is computed as a clash', clash.ok && /falls 3 days before/.test(clash.step.note ?? ''), clash.step?.note);
  ok('a duration is kept when only the start moves', step('date', { id: 'i1', date: '2026-10-05' }).ok && currentOf(space.objs[0]).items.find((i) => i.id === 'i1').end === '2026-10-16');
  ok('an end before a start is refused', !step('date', { id: 'i1', date: '2026-10-05', end: '2026-10-01' }).ok);
  ok('a day that does not exist is refused', !step('date', { id: 'i3', date: '2026-13-01' }).ok);
  ok('a status is set', step('status', { id: 'i3', status: 'done' }).ok && progress(currentOf(space.objs[0])).done === 1);
  ok('an item is added with a day', step('add', { text: 'Lab report', date: '2026-11-03', by: 'person' }).ok && currentOf(space.objs[0]).items.some((i) => i.text === 'Lab report' && i.by === 'person'));
  ok('a loop is refused', !step('link', { from: 'i2', to: 'i1', by: 'person' }).ok);
  ok('a reorder is an operation', step('move', { id: 'i5', to: 0 }).ok && currentOf(space.objs[0]).items[0].id === 'i5');
  ok('shown as a board', step('view', { view: 'board' }).ok && currentOf(space.objs[0]).view === 'board');
  ok('renamed', step('title', { title: 'My fall' }).ok && currentOf(space.objs[0]).title === 'My fall');
  const before = space.objs[0].at;
  space = seek(space, id, before - 3);
  ok('undo steps back without losing anything', currentOf(space.objs[0]).view === 'timeline' && space.objs[0].states.length === before + 1);
  space = seek(space, id, before);
  ok('…and redo steps forward', currentOf(space.objs[0]).title === 'My fall');
  const back = sanitizeSpace(JSON.parse(JSON.stringify(space)));
  ok('the whole history survives a save: every step re-computed', back.objs[0].steps.length === space.objs[0].steps.length && stableKey(currentOf(back.objs[0])) === stableKey(currentOf(space.objs[0])));
}

console.log('\n=== what the person wrote is theirs ===');
{
  const c = create(EMPTY_SPACE, 'plan', semester, { name: 'P1', origin: 'socria' });
  let space = c.space;
  const id = c.obj.id;
  const as = (by, op, args) => apply(space, id, op, args, { by, at: 2 });
  ok('Socria cannot move the person’s midterm', !as('socria', 'shift', { id: 'i3', days: 7 }).ok);
  ok('  nor reword it', !as('socria', 'text', { id: 'i3', text: 'Calc exam' }).ok);
  ok('  nor remove it', !as('socria', 'remove', { id: 'i3' }).ok);
  ok('  nor mark it done', !as('socria', 'status', { id: 'i3', status: 'done' }).ok);
  ok('  and says why', /yours/.test(as('socria', 'remove', { id: 'i3' }).why));
  ok('it can change what it wrote itself', as('socria', 'shift', { id: 'i4', days: 1 }).ok);
  ok('it can add', as('socria', 'add', { text: 'Office hours', by: 'socria' }).ok);
  ok('nobody can claim to be someone else', !as('socria', 'add', { text: 'Forged', by: 'person' }).ok && !as('person', 'add', { text: 'Forged', by: 'socria' }).ok);
  ok('Socria cannot push everything when some of it is yours', !as('socria', 'shift', { id: '*', days: 7 }).ok);
  ok('…but the person can', as('person', 'shift', { id: '*', days: 7 }).ok);
  // a forged history is cut on load: a "socria" step that edits the person's item never replays
  const forged = JSON.parse(JSON.stringify(space));
  const s0 = currentOf(forged.objs[0]);
  const s1 = { ...s0, items: s0.items.map((i) => (i.id === 'i3' ? { ...i, text: 'Forged' } : i)) };
  forged.objs[0].states = [s0, s1];
  forged.objs[0].steps = [{ op: 'text', args: { id: 'i3', text: 'Forged' }, said: 'x', by: 'socria', at: 3 }];
  forged.objs[0].at = 1;
  const read = sanitizeSpace(forged);
  ok('a stored step in which Socria rewrote the person’s words is cut on load', read.objs[0].states.length === 1 && currentOf(read.objs[0]).items.find((i) => i.id === 'i3').text === 'Calculus midterm');
}

console.log('\n=== words become operations only when they plainly are one ===');
{
  const s = sanitizePlan(semester);
  const r = (t) => readPlanOp(t, s, TODAY);
  ok('"move the essay draft to next week" → a week later', JSON.stringify(r('move the essay draft to next week')) === JSON.stringify({ op: 'shift', args: { id: 'i2', days: 7 } }), JSON.stringify(r('move the essay draft to next week')));
  ok('"push the midterm back two days"', JSON.stringify(r('push the midterm back two days')) === JSON.stringify({ op: 'shift', args: { id: 'i3', days: 2 } }), JSON.stringify(r('push the midterm back two days')));
  ok('"move problem set 5 to Oct 20"', JSON.stringify(r('move problem set 5 to Oct 20')) === JSON.stringify({ op: 'date', args: { id: 'i4', date: '2026-10-20' } }), JSON.stringify(r('move problem set 5 to Oct 20')));
  ok('"mark the midterm done"', JSON.stringify(r('mark the midterm done')) === JSON.stringify({ op: 'status', args: { id: 'i3', status: 'done' } }));
  ok('"I finished problem set 5"', r('I finished problem set 5')?.args.status === 'done');
  ok('"remove book the study room"', JSON.stringify(r('remove book the study room')) === JSON.stringify({ op: 'remove', args: { id: 'i5' } }));
  ok('"rename the midterm to Calc midterm"', r('rename the calculus midterm to Calc midterm')?.args.text === 'Calc midterm');
  ok('"the essay draft depends on the research"', JSON.stringify(r('History essay draft depends on research for the history essay')) === JSON.stringify({ op: 'link', args: { from: 'i1', to: 'i2', by: 'person' } }));
  ok('"add a deadline: lab report on Nov 3"', JSON.stringify(r('add a deadline: lab report on Nov 3')) === JSON.stringify({ op: 'add', args: { text: 'lab report', date: '2026-11-03', by: 'person' } }), JSON.stringify(r('add a deadline: lab report on Nov 3')));
  ok('"add call the landlord on Friday"', r('add call the landlord on Friday')?.args.date === '2026-10-16');
  ok('"show it as a board"', JSON.stringify(r('show it as a board')) === JSON.stringify({ op: 'view', args: { view: 'board' } }));
  ok('"push everything back a week"', JSON.stringify(r('push everything back a week')) === JSON.stringify({ op: 'shift', args: { id: '*', days: 7 } }));
  // and what must be left to the conversation
  for (const t of ['add more detail to your last answer', 'what should I do first?', 'I think the essay is harder than the midterm', 'move on to something else', 'how do I study for calculus']) {
    ok(`left to the conversation: "${t}"`, r(t) === null, JSON.stringify(r(t)));
  }
}

console.log('\n=== calendar days ===');
{
  ok('a real day', isoDay('2024-02-29') === '2024-02-29' && isoDay('2026-02-29') === null && isoDay('2026-1-5') === null);
  ok('days add across months and years', addDays('2026-12-30', 3) === '2027-01-02' && dayDiff('2026-12-30', '2027-01-02') === 3);
  ok('"Jan 15" said in October is next January', readDay('due Jan 15', TODAY) === '2027-01-15');
  ok('"Dec 9" is this December', readDay('by Dec 9', TODAY) === '2026-12-09');
  ok('"20 October 2026"', readDay('on 20 October 2026', TODAY) === '2026-10-20');
  ok('"10/20" month first', readDay('10/20', TODAY) === '2026-10-20');
  ok('"25/12" can only be day first', readDay('25/12', TODAY) === '2026-12-25');
  ok('"tomorrow", "in 3 days", "next week"', readDay('tomorrow', TODAY) === '2026-10-11' && readDay('in 3 days', TODAY) === '2026-10-13' && readDay('next week', TODAY) === '2026-10-17');
  ok('"Friday" is the coming Friday', readDay('on Friday', TODAY) === '2026-10-16' && readDay('next friday', TODAY) === '2026-10-16');
  ok('"Saturday" said on a Saturday is a week on', readDay('Saturday', TODAY) === '2026-10-17');
  ok('no day in the words → null', readDay('soon-ish', TODAY) === null && readDay('may I ask', TODAY) === null);
  ok('shifts: later and earlier', readShift('push it back two weeks') === 14 && readShift('bring it forward 3 days') === -3 && readShift('a week earlier') === -7);
}

console.log('\n=== the shared helpers ===');
{
  ok('text is capped at a word', cleanText('one two three four five', 12) === 'one two');
  ok('the longest label wins', findByLabel([{ t: 'essay' }, { t: 'essay draft' }], (x) => x.t, 'move the essay draft')?.t === 'essay draft');
  ok('an ambiguous name finds nothing', findByLabel([{ t: 'history reading' }, { t: 'history essay' }], (x) => x.t, 'move history') === null);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
