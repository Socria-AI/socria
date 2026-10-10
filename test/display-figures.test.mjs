// THE EVERYDAY DISPLAYS, DRAWN — what a person sees of a plan in each view.
//
// The kinds are pure and tested on their own (display-plan.test.mjs). This
// suite renders their figures to markup, the way the server does on first
// paint, and holds down what the eye and the screen reader depend on: every
// view draws the SAME state; a clash is marked where it is; a live figure
// offers its controls and a read-only one offers none; every control has a
// name; the compact forms stay compact; and the axis ticks are real days.

import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import { PlanFigure } from './.tmp/PlanFigure.mjs';
import { planTicks, sanitizePlan } from './.tmp/display-plan.mjs';
import { dayDiff, isoDay } from './.tmp/display-base.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const count = (html, re) => (html.match(re) ?? []).length;

const semester = sanitizePlan({
  title: 'Fall semester',
  view: 'timeline',
  items: [
    { id: 'i1', text: 'Research for the history essay', date: '2026-10-12', end: '2026-10-23', lane: 'History', by: 'socria' },
    { id: 'i2', text: 'History essay draft', date: '2026-10-20', lane: 'History', by: 'socria' },
    { id: 'i3', text: 'Calculus midterm', date: '2026-10-20', lane: 'Calculus', status: 'todo', by: 'person' },
    { id: 'i4', text: 'Problem set 5', date: '2026-10-16', lane: 'Calculus', status: 'doing', by: 'socria' },
    { id: 'i5', text: 'Book the study room', status: 'done', by: 'person' },
  ],
  links: [{ from: 'i1', to: 'i2', by: 'socria' }],
});

const objOf = (state, extra = {}) => ({ id: 'P', kind: 'plan', name: 'P', origin: 'socria', states: [state], steps: [], at: 0, ...extra });
const ops = [];
const live = (state, more = {}) =>
  renderToStaticMarkup(
    h(PlanFigure, {
      obj: objOf(state),
      at: 0,
      mode: 'live',
      onOp: (op, args) => (ops.push({ op, args }), { ok: true }),
      onSeek: () => {},
      ...more,
    })
  );
const readOnly = (state) => renderToStaticMarkup(h(PlanFigure, { obj: objOf(state), at: 0, mode: 'live' }));
const as = (view) => ({ ...semester, view });

console.log('=== the timeline ===');
{
  const html = live(semester);
  ok('every dated item is a bar', count(html, /class="dsp-bar[ "]/g) === 4, String(count(html, /class="dsp-bar[ "]/g)));
  ok('  each with a label naming it in its row', count(html, /class="dsp-tl-label[ "]/g) === 4);
  ok('lanes head their rows', html.includes('dsp-tl-lane') && html.includes('>History<') && html.includes('>Calculus<'));
  ok('the draft dated inside its own research is marked as a clash', /class="dsp-bar[^"]*is-clash[^"]*"[^>]*aria-label="History essay draft/.test(html));
  ok('  and said in words, with the computed number of days', html.includes('is 3 days before') && html.includes('which it waits on'));
  ok('  and its arrow drawn in the clash style', html.includes('dsp-tl-link is-clash'));
  ok('what has no day is listed beneath, with a place to give it one', html.includes('No day yet') && html.includes('aria-label="Day for Book the study room"'));
  ok('the axis carries its ticks', count(html, /<span style="left:[\d.]+%">\d+ Oct<\/span>/g) >= 2);
  ok('a bar says itself to a screen reader, with its days', html.includes('aria-label="Research for the history essay: 12 Oct 2026 to 23 Oct 2026"'));
  ok('  and how to move it from the keyboard', html.includes('Arrow keys move it a day'));
  ok('a live bar can be dragged by its end to change how long it lasts', count(html, /class="dsp-bar-end"/g) === 4);
  ok('what Socria drafted is marked as such, what the person wrote is not', /dsp-bar[^"]*is-socria[^"]*"[^>]*aria-label="Research/.test(html) && !/dsp-bar[^"]*is-socria[^"]*"[^>]*aria-label="Calculus midterm/.test(html));
  const ro = readOnly(semester);
  ok('read-only: no handles, no adding, no date fields', !ro.includes('dsp-bar-end') && !ro.includes('dsp-add') && !ro.includes('type="date"'));
  ok('  but the plan is all there', count(ro, /class="dsp-bar[ "]/g) === 4);
  const none = live(sanitizePlan({ title: 'Ideas', view: 'timeline', items: [{ text: 'Ask about the grant' }] }));
  ok('a timeline with nothing dated says so instead of drawing an empty axis', none.includes('Nothing here has a day yet') && !none.includes('dsp-tl-axis'));
}

console.log('\n=== the board ===');
{
  const html = live(as('board'));
  ok('three columns', count(html, /<section class="dsp-col/g) === 3);
  ok('  each named with its count', html.includes('aria-label="To do, 3"') && html.includes('aria-label="Doing, 1"') && html.includes('aria-label="Done, 1"'));
  ok('what has no status waits in To do', /To do, 3/.test(html));
  ok('cards move by buttons as well as by dragging', html.includes('aria-label="Move Calculus midterm to Doing"') && html.includes('aria-label="Move Problem set 5 to To do"'));
  ok('  the first column has no left move, the last no right', !html.includes('Move Calculus midterm to Done') && !html.includes('Move Book the study room to Doing</'));
  ok('a live card can be dragged', count(html, /draggable="true"/g) === 5);
  ok('each column can take a new card', count(html, /aria-label="Add to /g) === 3);
  const ro = readOnly(as('board'));
  ok('read-only: no moves, no drags, no adding', !ro.includes('Move ') && !ro.includes('draggable="true"') && !ro.includes('Add to'));
}

console.log('\n=== the checklist ===');
{
  const html = live(as('checklist'));
  ok('every item has a box', count(html, /type="checkbox"/g) === 5);
  ok('  ticked only where done', count(html, /checked=""/g) === 1);
  ok('  and a label tied to its box', count(html, /<label for="/g) === 5);
  ok('progress is a real progressbar, counted from the plan', html.includes('role="progressbar"') && html.includes('aria-valuenow="1"') && html.includes('aria-valuemax="5"'));
  ok('the head says how much is done', html.includes('1 of 5 done'));
  ok('read-only boxes cannot be ticked', count(readOnly(as('checklist')), /disabled=""/g) >= 5);
}

console.log('\n=== the storyboard ===');
{
  const html = live(as('storyboard'));
  ok('one frame per item, numbered in order', count(html, /class="dsp-frame-n">\d+</g) === 5 && html.includes('class="dsp-frame-n">5<'));
  ok('frames reorder by buttons', html.includes('aria-label="Move History essay draft earlier"'));
  ok('  the first cannot move earlier, the last cannot move later', /disabled=""[^>]*aria-label="Move Research for the history essay earlier"/.test(html) && /disabled=""[^>]*aria-label="Move Book the study room later"/.test(html));
}

console.log('\n=== the list ===');
{
  const html = live(as('list'));
  ok('each item is editable where it stands', count(html, /class="dsp-edit /g) === 5);
  ok('  with its day and status beside it', html.includes('12 Oct 2026') && html.includes('>Doing<'));
  ok('items reorder by buttons', html.includes('aria-label="Move Calculus midterm up"'));
  const ro = readOnly(as('list'));
  ok('read-only: the words, not fields', !ro.includes('dsp-edit') && ro.includes('History essay draft'));
}

console.log('\n=== the same state, every view ===');
{
  for (const view of ['timeline', 'board', 'checklist', 'storyboard', 'list']) {
    const html = live(as(view));
    const missing = semester.items.filter((i) => !html.includes(i.text.replace(/&/g, '&amp;')));
    ok(`${view}: every item is there`, missing.length === 0, missing.map((i) => i.text).join(', '));
    ok(`${view}: the view is marked as the one on`, new RegExp(`role="tab" aria-selected="true" class="is-on"[^>]*>${view[0].toUpperCase()}`).test(html));
  }
  const undated = sanitizePlan({ title: 'Packing', view: 'list', items: [{ text: 'Passport' }, { text: 'Charger' }] });
  const html = live(undated);
  ok('a view the state cannot show is offered but disabled, with the reason', /disabled="" title="Nothing in it has a date yet[^"]*"[^>]*>Timeline</.test(html), html.match(/<button[^>]*>Timeline<\/button>/)?.[0]);
}

console.log('\n=== the frame every display shares ===');
{
  const html = live(semester);
  ok('the name is editable in place, and named', html.includes('aria-label="Name"') && html.includes('value="Fall semester"'));
  ok('undo and redo are there, and off with no history', /disabled=""[^>]*aria-label="Undo"/.test(html) && /disabled=""[^>]*aria-label="Redo"/.test(html));
  const stepped = renderToStaticMarkup(
    h(PlanFigure, {
      obj: objOf(semester, {
        states: [semester, { ...semester, title: 'Autumn' }],
        steps: [{ op: 'title', args: { title: 'Autumn' }, said: 'renamed “Autumn”', by: 'person', at: 1 }],
        at: 1,
      }),
      at: 1,
      mode: 'live',
      onOp: () => ({ ok: true }),
      onSeek: () => {},
    })
  );
  ok('with a step behind it, undo is on and redo is not', !/disabled=""[^>]*aria-label="Undo"/.test(stepped) && /disabled=""[^>]*aria-label="Redo"/.test(stepped));
  ok('  and the last step is said, with who chose it', stepped.includes('last: renamed “Autumn” (chosen by you)'));
  ok('where it came from is said', html.includes('Drafted by Socria from the conversation — yours to change'));
  ok('an empty plan invites the first item, in words and a field', live(sanitizePlan({ title: 'New', items: [] })).includes('Nothing in this plan yet') && live(sanitizePlan({ title: 'New', items: [] })).includes('aria-label="Add an item"'));
  const card = renderToStaticMarkup(h(PlanFigure, { obj: objOf(semester), at: 0, mode: 'card', onView: () => {} }));
  ok('a card is compact: name, shape, a line, a way to open it', card.includes('dsp-title') && card.includes('timeline · 5 items') && card.includes('>Open<') && !card.includes('dsp-bar'));
  const trail = renderToStaticMarkup(h(PlanFigure, { obj: objOf(semester), at: 0, mode: 'trail' }));
  ok('a state in a trail is compact too', trail.includes('is-trail') && !trail.includes('dsp-views'));
}

console.log('\n=== one item, in full ===');
{
  const html = live(semester, { sel: 'i2', onSelect: () => {} });
  ok('the selected item opens in an editor', html.includes('role="group" aria-label="Item: History essay draft"'));
  ok('  with its day, until, status and lane', html.includes('value="2026-10-20"') && html.includes('>Status<') && html.includes('>Lane<'));
  ok('  what it waits on, each removable', html.includes('aria-label="No longer waits on Research for the history essay"'));
  ok('  and who wrote it', html.includes('drafted by Socria'));
  ok('the person can remove it', html.includes('Remove from the plan'));
  const mine = live(semester, { sel: 'i3', onSelect: () => {} });
  ok('the person’s own item says it is theirs', mine.includes('>yours<'));
}

console.log('\n=== axis ticks are real days ===');
{
  const short = planTicks({ start: '2026-10-12', end: '2026-10-26', days: 14 });
  ok('a fortnight is ticked in days', short.length >= 2 && short.every((t) => isoDay(t.day)) && short[0].day === '2026-10-12');
  ok('  each tick sits where its day is', short.every((t) => Math.abs(t.x - dayDiff('2026-10-12', t.day) / 14) < 1e-9));
  const months = planTicks({ start: '2026-09-01', end: '2026-12-15', days: dayDiff('2026-09-01', '2026-12-15') });
  ok('a few months are ticked on Mondays', months.length >= 2 && months.every((t) => new Date(`${t.day}T00:00:00Z`).getUTCDay() === 1));
  const year = planTicks({ start: '2026-01-15', end: '2027-03-01', days: dayDiff('2026-01-15', '2027-03-01') });
  ok('a year is ticked on the first of months', year.length >= 2 && year.every((t) => t.day.endsWith('-01')));
  ok('  the year is said where it turns', year[0].label.endsWith('2026') && year.some((t) => t.day.startsWith('2027') && t.label.endsWith('2027')) && year.filter((t) => /\d{4}$/.test(t.label)).length === 2, JSON.stringify(year.map((t) => t.label)));
  ok('  never more than asked for, give or take one', year.length <= 9);
  ok('every tick sits inside the span', [...short, ...months, ...year].every((t) => t.x >= 0 && t.x <= 1));
  const one = planTicks({ start: '2026-10-12', end: '2026-10-12', days: 0 });
  ok('a single day is still ticked', one.length === 1 && one[0].x === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
