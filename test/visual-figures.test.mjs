// THE NEW PRIMITIVES, DRAWN — what reaches the page, as the server renders it.
//
// Held down here: the number line draws its set — a filled dot where an end
// is included, an open one where it is not, an arrow where it runs on for
// ever — and writes the same set in notation, as an inequality and in
// set-builder form; the plan's calendar puts items on their days; a chart
// that cannot draw yet shows the table to fill in (and a read-only one does
// not); the chart made from "Chart my monthly spending…" draws three bars;
// and the gallery offers the number line.

import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import { ObjectFigure } from './.tmp/ObjectFigure.mjs';
import { Gallery } from './.tmp/Gallery.mjs';
import { numberLineFromWords } from './.tmp/display-numberline.mjs';
import { dataFromWords, emptyChart } from './.tmp/display-words.mjs';
import { sanitizePlan } from './.tmp/display-plan.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

const objOf = (kind, state) => ({ id: 'X1', kind, name: 'X1', origin: 'person', states: [state], steps: [], at: 0 });
const draw = (kind, state) => renderToStaticMarkup(h(ObjectFigure, { obj: objOf(kind, state), at: 0, mode: 'live', onOp: () => ({ ok: true }), onSeek: () => {} }));
const readOnly = (kind, state) => renderToStaticMarkup(h(ObjectFigure, { obj: objOf(kind, state), at: 0, mode: 'live' }));
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

// ── the number line ──────────────────────────────────────────────────
{
  const ray = draw('numberline', numberLineFromWords('Visualize the interval x > 3'));
  ok('x > 3: its notation, inequality and set-builder form are on the page', text(ray).includes('(3, ∞)') && text(ray).includes('x > 3') && text(ray).includes('{ x | x > 3 }'));
  ok('x > 3: an open end at 3, drawn open', /class="dsp-nl-end is-union is-open"/.test(ray));
  ok('x > 3: an arrow where it runs on for ever', /class="dsp-nl-arrow"/.test(ray));
  ok('x > 3: the end is a slider — draggable, and reachable by keyboard', /role="slider"/.test(ray) && /tabindex="0"/.test(ray));
  ok('x > 3: what is described to a screen reader is the set', /aria-label="Number line: x &gt; 3"/.test(ray));
  const two = draw('numberline', numberLineFromWords('Show -2 <= x < 5 or x = 7 on a number line'));
  ok('a union: each piece on its own row, their union on the line', (two.match(/class="dsp-nl-piece/g) ?? []).length === 1 && text(two).includes('[−2, 5) ∪ {7}'));
  ok('a union: a closed end drawn filled, an open one open', /class="dsp-nl-end"/.test(two) && /is-open/.test(two));
  ok('read-only: no ends to drag, nothing to add', !/role="slider"/.test(readOnly('numberline', numberLineFromWords('Visualize the interval x > 3'))) && !/Add to the set/.test(readOnly('numberline', numberLineFromWords('Visualize the interval x > 3'))));
  const notation = draw('numberline', { ...numberLineFromWords('Show -2 <= x < 5 or x = 7 on a number line'), view: 'notation' });
  ok('the notation view lists each piece with its inequality', text(notation).includes('−2 ≤ x < 5') && text(notation).includes('x = 7'));
}

// ── the calendar ─────────────────────────────────────────────────────
{
  const plan = sanitizePlan({ title: 'Deadlines', view: 'calendar', items: [{ id: 'a', text: 'Essay', date: '2026-10-20', by: 'person' }, { id: 'b', text: 'Trip', date: '2026-10-30', end: '2026-11-02', by: 'person' }, { id: 'c', text: 'Read chapter 4', by: 'person' }], links: [] });
  const html = draw('plan', plan);
  ok('calendar: a grid of days with the month named', /role="grid"/.test(html) && text(html).includes('October 2026'));
  ok('calendar: the essay on its day', /aria-label="[^"]*20[^"]*, 1 item"/.test(html) && text(html).includes('Essay'));
  ok('calendar: a multi-day item continues on the days it covers', text(html).includes('↳ Trip'));
  ok('calendar: an item with no day is listed to be given one', text(html).includes('No day yet') && text(html).includes('Read chapter 4'));
  ok('calendar: items can be dragged to another day', /draggable="true"/.test(html));
  ok('calendar: month and week', text(html).includes('Month') && text(html).includes('Week'));
}

// ── charts ───────────────────────────────────────────────────────────
{
  const made = dataFromWords('Chart my monthly spending: rent 1200, food 400, transport 150').state;
  const html = draw('data', made);
  ok('P0: three bars, labelled as written', (html.match(/class="dsp-data-bar /g) ?? []).length === 3 && text(html).includes('Rent') && text(html).includes('Transport'));
  ok('P0: the numbers are said to be theirs, not examples', !/example numbers/i.test(text(html)));
  const blank = emptyChart('Plot revenue over six months.').state;
  const filling = draw('data', blank);
  ok('an empty template: says why it cannot draw yet, and shows the table to fill in', text(filling).includes('No row has both') && /<table/.test(filling));
  ok('an empty template, read-only: no table of inputs offered', !/<input/.test(readOnly('data', blank).replace(/<input[^>]*type="checkbox"[^>]*>/g, '')));
}

// ── the gallery offers the number line ───────────────────────────────
{
  const html = renderToStaticMarkup(h(Gallery, { onPrompt: () => {} }));
  ok('the gallery has a number line, with a way to ask for one', /data-kind="numberline"/.test(html) && text(html).includes('Visualize the interval x > 3'));
}

console.log(`visual figures: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
