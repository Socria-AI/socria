// THE EXPERIENCES AND THE REMAINING DISPLAYS, DRAWN — what reaches the page, as the server renders it.
//
// Held down here: every figure draws its example without failing; what is
// Socria's is labelled in words; a weighted score says it is not a verdict; a hidden label is not
// in the markup at all until it is got right or shown; a market's answer is
// not on the page before the reveal; a read-only figure offers no controls;
// and the gallery shows every kind with ways to ask for it.

import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import { ObjectFigure } from './.tmp/ObjectFigure.mjs';
import { Gallery } from './.tmp/Gallery.mjs';
import { crossroadsFromWords, sanitizeCrossroads, CROSSROADS_META } from './.tmp/display-crossroads.mjs';
import { untangleFromWords } from './.tmp/display-untangle.mjs';
import { groundFromWords, sanitizeGround } from './.tmp/display-commonground.mjs';
import { timeMachineFromWords } from './.tmp/display-timemachine.mjs';
import { exerciseFrom, sanitizeExercise } from './.tmp/display-exercise.mjs';
import { sanitizeMarket, MARKET_OPS } from './.tmp/display-market.mjs';
import { sanitizeArgument } from './.tmp/display-argument.mjs';
import { sanitizeDiagram } from './.tmp/display-diagram.mjs';
import { blankBalanceSheet } from './.tmp/display-worksheet.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

const objOf = (kind, state, extra = {}) => ({ id: 'X1', kind, name: 'X1', origin: 'person', states: [state], steps: [], at: 0, ...extra });
const draw = (kind, state, props = {}) => renderToStaticMarkup(h(ObjectFigure, { obj: objOf(kind, state), at: 0, mode: 'live', onOp: () => ({ ok: true }), onSeek: () => {}, ...props }));
const readOnly = (kind, state, props = {}) => renderToStaticMarkup(h(ObjectFigure, { obj: objOf(kind, state), at: 0, mode: 'live', ...props }));
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

// ── crossroads ───────────────────────────────────────────────────────
{
  const cr = crossroadsFromWords('Should I take the job in Austin or stay in Dallas? I care about salary and being near family.');
  const html = draw('crossroads', cr);
  ok('crossroads draws both options', html.includes('Take the job in Austin') && html.includes('Stay in Dallas'));
  ok('only the person decides — said where the decision is made', text(html).includes('Only you decide'));
  ok('Socria can be asked what is missing, never for an answer', text(html).includes('What am I missing?') && !/recommend/i.test(text(html)));
  const rated = sanitizeCrossroads({ ...cr, view: 'compare', ratings: [{ alt: cr.alternatives[0].id, pri: cr.priorities[0].id, value: 8 }] });
  ok('a weighted score says it is not a verdict', text(draw('crossroads', rated)).includes('not a verdict'));
  const socria = sanitizeCrossroads({ ...cr, questions: [{ id: 'q1', text: 'Is the offer negotiable?', by: 'socria' }] });
  ok('Socria’s question is labelled as Socria’s', text(draw('crossroads', socria)).includes('suggested by Socria'));
  ok('read-only: no decision form, no adding', !readOnly('crossroads', cr).includes('Record my decision') && !readOnly('crossroads', cr).includes('Add an option'));
  ok('the catalogue example draws', draw('crossroads', sanitizeCrossroads(CROSSROADS_META.example)).includes('Austin or Dallas'));
}

// ── untangle ─────────────────────────────────────────────────────────
{
  const dump = 'I need to finish the essay, my car is making a noise, not sure if I should drop chem, rent is due Friday';
  const u = untangleFromWords(dump);
  const html = draw('untangle', u);
  ok('untangle draws a chip per thought', (html.match(/class="xp-chipt /g) ?? []).length === 4, String((html.match(/class="xp-chipt /g) ?? []).length));
  ok('a reading is marked as Socria’s (the question mark on the kind)', html.includes('Task?'));
  const src = draw('untangle', { ...u, view: 'source' });
  ok('what they wrote is shown exactly', src.includes(dump.replace(/'/g, '&#x27;')));
}

// ── common ground ────────────────────────────────────────────────────
{
  const g = groundFromWords('Help us find common ground on how to split the chores');
  ok('without an identity, it asks to be opened beside the conversation', text(draw('commonground', g)).includes('Open it beside the conversation to take part'));
  ok('with one, the person can join in their own name', text(draw('commonground', g, { me: { id: 'u1', name: 'Sam' } })).includes('Join as Sam'));
  const joined = sanitizeGround({ ...g, view: 'ground', participants: [{ id: 'u1', name: 'Sam' }, { id: 'u2', name: 'Ana' }], items: [{ id: 'i1', kind: 'goal', text: 'A clean kitchen', by: 'socria', agreed: [], disputed: [], resolved: [] }] });
  const html = draw('commonground', joined, { me: { id: 'u1', name: 'Sam' } });
  ok('a suggestion of Socria’s is agreed by no one', text(html).includes('agreed by no one yet') && text(html).includes('suggested by Socria'));
  ok('it says nothing private is brought in', text(html).includes('Nothing from anyone’s memories'));
}

// ── time machine ─────────────────────────────────────────────────────
{
  const tm = timeMachineFromWords('How has my thinking changed?');
  ok('without the workspace it says where to open it', text(draw('timemachine', tm)).includes('Open it beside the conversation'));
  const space = { objs: [{ id: 'C1', kind: 'crossroads', name: 'C1', origin: 'person', states: [crossroadsFromWords('Should I take the job in Austin or stay in Dallas?'), crossroadsFromWords('Should I take the job in Austin or stay in Dallas?')], steps: [{ op: 'view', args: { view: 'center' }, said: 'shown as decision', by: 'person', at: 1_700_000_000_000 }], at: 1 }] };
  const html = draw('timemachine', tm, { space });
  ok('with it, the recorded change is on the timeline', text(html).includes('shown as decision'));
  ok('and it says the map’s record has not begun', text(html).includes('not recorded yet'));
}

// ── the argument map ─────────────────────────────────────────────────
{
  const a = sanitizeArgument({
    title: 'Four-day week',
    view: 'map',
    items: [
      { id: 'a1', role: 'thesis', text: 'Schools should move to a four-day week', by: 'person' },
      { id: 'a2', role: 'claim', text: 'Teachers would burn out less', parent: 'a1', by: 'person' },
      { id: 'a3', role: 'counter', text: 'Parents lose a day of childcare', parent: 'a1', by: 'socria' },
    ],
  });
  const html = draw('argument', a);
  ok('the argument map draws every item', html.includes('Teachers would burn out less') && html.includes('Parents lose a day of childcare'));
  ok('a claim with no evidence is flagged in words', text(html).includes('no evidence yet'));
  ok('an unanswered counterargument is flagged', text(html).includes('not answered yet'));
  ok('Socria’s item is marked suggested', text(html).includes('Counterargument · suggested'));
}

// ── the diagram ──────────────────────────────────────────────────────
{
  const dg = sanitizeDiagram({
    title: 'Launch or wait',
    view: 'decision',
    nodes: [
      { id: 'n1', label: 'Launch now?', kind: 'decision', by: 'person' },
      { id: 'n2', label: 'Launch', kind: 'chance', by: 'person' },
      { id: 'n3', label: 'Wait', kind: 'outcome', value: 10, by: 'person' },
      { id: 'n4', label: 'It works', kind: 'outcome', value: 30, by: 'person' },
      { id: 'n5', label: 'It flops', kind: 'outcome', value: -10, by: 'person' },
    ],
    edges: [
      { from: 'n1', to: 'n2', by: 'person' },
      { from: 'n1', to: 'n3', by: 'person' },
      { from: 'n2', to: 'n4', prob: 0.6, by: 'person' },
      { from: 'n2', to: 'n5', prob: 0.4, by: 'person' },
    ],
  });
  const html = draw('diagram', dg);
  ok('a decision tree rolls back from the person’s numbers', text(html).includes('worth 14')); // 0.6·30 + 0.4·(−10)
  ok('the best option is said as theirs to choose', text(html).includes('what you choose is yours'));
  ok('a concept view draws too', draw('diagram', { ...dg, view: 'concept' }).includes('Launch now?'));
  ok('an outline view lists from the root', text(draw('diagram', { ...dg, view: 'outline' })).includes('Launch now?'));
}

// ── the market ───────────────────────────────────────────────────────
{
  const m = sanitizeMarket({ title: 'Coffee', view: 'graph', demand: { intercept: 100, slope: -2, by: 'person' }, supply: { intercept: 20, slope: 2, by: 'person' }, revealed: false, log: [] });
  const html = draw('market', m);
  ok('the market draws its curves on axes with titles', html.includes('dsp-mk-demand') && html.includes('dsp-mk-supply') && text(html).includes('Quantity') && text(html).includes('Price'));
  const posed = sanitizeMarket({ ...m, pending: { scenario: 0, text: 'a tax of 10 per unit on sellers', change: { tax: 10, on: 'sellers' } } });
  const before = text(draw('market', posed));
  ok('posed: the question is asked and reveal offered', before.includes('What happens to the price') && before.includes('Reveal'));
  // before: Q 20 at 60; with a tax of 10 on sellers buyers would pay 65 for 17.5 — neither may show yet
  ok('posed: the answer is not on the page before the reveal', !before.includes('→') && !/\b65\b/.test(before) && !/17\.5/.test(before), before.slice(0, 300));
  const shown = text(draw('market', MARKET_OPS.reveal.apply(posed, {})));
  ok('revealed: the mechanism is explained', /tax/i.test(shown) && shown.includes('65'));
  ok('posed: the taxed curve is not drawn yet', !draw('market', posed).includes('dsp-mk-wedge'));
}

// ── the worksheet ────────────────────────────────────────────────────
{
  const w = blankBalanceSheet('Year end');
  const html = draw('worksheet', w);
  ok('a blank worksheet draws its headings with no amounts filled in', text(html).includes('Total assets') && !/value="\d/.test(html));
  ok('totals are said to be sums, and rightness to come from a check', text(html).includes('Whether it is right is said when you ask for a check'));
}

// ── the exercise: hidden labels are not in the markup ────────────────
{
  const ex = exerciseFrom({
    sourceKind: 'diagram',
    sourceTitle: 'The heart',
    verified: false,
    title: 'Label: the heart',
    mode: 'label',
    hide: 'all',
    parts: [
      { id: 'p1', label: 'Aorta', cue: 'carries blood from the left ventricle to the body' },
      { id: 'p2', label: 'Left ventricle', cue: 'pumps blood into the aorta' },
    ],
    structure: { nodes: [{ id: 'p1', x: 0.2, y: 0.2 }, { id: 'p2', x: 0.8, y: 0.8 }], edges: [{ from: 'p1', to: 'p2' }] },
  });
  const html = draw('exercise', ex);
  ok('no hidden label is in the markup — not in text, a title or an attribute', !/aorta/i.test(html) && !/left ventricle/i.test(html), html.match(/.{40}(aorta|ventricle).{40}/i)?.[0]);
  ok('a Socria-drawn source says it is not an authority', text(html).includes('not an authority'));
  const recall = draw('exercise', { ...ex, view: 'recall' });
  ok('in recall, cues have the hidden labels masked', !/aorta/i.test(recall) && !/left ventricle/i.test(recall) && recall.includes('carries blood from the'));
  const idOf = (label) => ex.parts.find((x) => x.answer === label).id;
  const got = sanitizeExercise({ ...ex, answers: { [idOf('Aorta')]: 'aorta' } });
  const after = draw('exercise', got);
  ok('a label got right appears', /Aorta/.test(after));
  ok('…and the other stays hidden', !/left ventricle/i.test(after));
  const seen = sanitizeExercise({ ...ex, revealed: [idOf('Left ventricle')] });
  ok('a label the person chose to see appears', /Left ventricle/.test(draw('exercise', seen)));
}

// ── the gallery ──────────────────────────────────────────────────────
{
  const html = renderToStaticMarkup(h(Gallery, { onPrompt: () => {} }));
  ok('the gallery lists experiences and displays apart', text(html).includes('Think it through') && text(html).includes('Displays to work in'));
  ok('the gallery no longer offers a rehearsal', !/Rehearsal/.test(text(html)));
  for (const name of ['Decision', 'Untangle', 'Common ground session', 'Time machine', 'Plan', 'Venn diagram', 'Argument map'])
    ok(`the gallery shows ${name}`, text(html).includes(name), name);
  ok('each kind offers words to ask for it', (html.match(/class="gal-prompt"/g) ?? []).length >= 20);
  ok('previews are not reachable by keyboard', html.includes('inert=""') && html.includes('aria-hidden="true"'));
}

console.log(`experience figures: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
