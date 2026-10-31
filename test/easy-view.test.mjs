// AN EASY VIEW — a photo of small print, made large, clear and simple.
//
//   reading     what the vision model returns is held to the kind: only what
//               it keeps is kept, in one canonical form, nothing invented —
//               and nothing to read is no easy view
//   drawn from  prices, times and steps are read from what was written, never
//               asked of a model: "$6.50", "6,50 €", "2 for $5", "1,200";
//               "8.15 pm", "20h45"; the next time from a moment in the day
//   said        what Socria says once it is made, what is read aloud, and the
//               text a model is given in place of the picture
//   the kind    made only from a photo: never offered, never read from words;
//               "made from your photo"; At a glance only with something to draw
//   the figure  big type from the start; A− / A+, high contrast, show only —
//               every control a button with a word on it; at a glance, prices
//               as bars from the lowest; what could not be read is said
//   the photo   Make's first card opens a sheet: take a photo (the camera, on a
//               phone) or choose one; the route reads it once, from the photo
//               allowance, behind the takeover gate
//   the app     the sheet in Logos 5, the turn, the artifact made from the photo
//   the sheet   48px controls, high contrast at AAA, a phone's layout by the
//               width it is given, no hover left behind by a finger
//
// lib/objects/display-easy.ts, lib/easy-view.ts, app/api/logos/easy/route.ts,
// components/display/EasyFigure.tsx, components/logos5/EasyCapture.tsx,
// lib/logos5/make.ts, components/LogosApp.tsx.

import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as E from './.tmp/easy-under-test.mjs';

const read = (f) => readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', f), 'utf8');
let pass = 0,
  fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 400))));
const J = JSON.stringify;
const html = (el) => renderToStaticMarkup(el).replace(/<!-- -->/g, '');

// a café menu, as the model reads one — with what the kind does not keep mixed in
const MENU = {
  title: '  Rosa’s   Kitchen ',
  kind: 'menu',
  summary: 'A restaurant menu with starters, mains and desserts.',
  sections: [
    {
      title: 'Starters',
      items: [
        { name: 'Tomato soup', detail: 'with warm sourdough', value: '$6.50', tags: ['Vegetarian'] },
        { name: 'Garlic prawns', detail: 'chilli, lemon, parsley', value: '$9.00', tags: ['spicy'], calories: 410 },
      ],
    },
    {
      title: 'Mains',
      items: [
        { name: 'Mushroom risotto', detail: 'parmesan, thyme', value: '$14.50', tags: ['vegetarian', 'gluten free'] },
        { name: 'Grilled salmon', detail: 'new potatoes, green beans', value: '$19.00' },
        { name: 'Steak frites', detail: 'peppercorn sauce', value: '$24.00' },
        { detail: 'a line with no name' },
      ],
    },
    { title: 'Drinks', items: [] },
    { title: 'Desserts', items: [{ name: 'Apple crumble', detail: 'custard or ice cream', value: '$7.00', tags: ['vegetarian'] }] },
  ],
  facts: [{ label: 'Open', value: 'Tue–Sun, 12 – 10 pm' }, { label: 'Phone', value: '(555) 014-2290' }, { label: 'open', value: 'Tue–Sun, 12 – 10 pm' }, { label: 'Fax' }],
  steps: [],
  times: [],
  warnings: ['Garlic prawns contain shellfish.', 'Please tell us about any allergies.', 'garlic prawns contain shellfish.'],
  unclear: ['The line under Desserts is too faint to read.'],
  html: '<script>alert(1)</script>',
};
const TIMETABLE = {
  title: 'Bus 12 — weekdays',
  kind: 'timetable',
  summary: 'Weekday departures from Main Street.',
  times: [
    { time: '08:15', label: 'Main St → Hospital' },
    { time: '9.40 am', label: 'Main St → Hospital' },
    { time: '12:05', label: 'Main St → Market' },
    { time: 'late', label: 'Night bus' },
    { label: 'no time' },
  ],
};
const LABEL = {
  title: 'Paracetamol 500 mg',
  kind: 'label',
  summary: 'Tablets for pain and fever.',
  steps: ['Take 1 or 2 tablets with water.', 'Wait at least 4 hours before taking more.', 'Do not take more than 8 tablets in 24 hours.'],
  warnings: ['Do not take with other products containing paracetamol.'],
};

const menu = E.sanitizeEasy(MENU);
const times = E.sanitizeEasy(TIMETABLE);
const label = E.sanitizeEasy(LABEL);

console.log('=== reading: only what the kind keeps ===');
ok(
  'nothing, or nothing to read, is no easy view',
  [null, undefined, 'a menu', 7, [], {}, { kind: 'menu' }, { kind: 'menu', sections: [{ title: 'Mains', items: [] }] }].every((x) => E.sanitizeEasy(x) === null)
);
ok(
  'a menu is kept: its title (spaces mended), its kind, what it is',
  menu?.title === 'Rosa’s Kitchen' && menu.kind === 'menu' && menu.summary.startsWith('A restaurant menu'),
  J(menu && { title: menu.title, kind: menu.kind })
);
ok('  its sections in order — an empty one is not kept', J(menu.sections.map((s) => s.title)) === J(['Starters', 'Mains', 'Desserts']));
ok(
  '  its items in order, numbered by where they are — a line with no name is not kept',
  J(menu.sections.flatMap((s) => s.items.map((i) => i.id))) === J(['i1', 'i2', 'i3', 'i4', 'i5', 'i6']) && J(menu.sections.map((s) => s.id)) === J(['s1', 's2', 's3'])
);
ok(
  '  each item as written: name, price, what is in it',
  J(menu.sections[0].items[0]) === J({ id: 'i1', name: 'Tomato soup', detail: 'with warm sourdough', value: '$6.50', tags: ['vegetarian'] }),
  J(menu.sections[0].items[0])
);
ok('  what the kind does not keep is not kept', !('calories' in menu.sections[0].items[1]) && !('html' in menu) && !J(menu).includes('script'));
ok(
  '  marks in lower case; a repeated fact or warning once',
  J(menu.facts.map((f) => f.label)) === J(['Open', 'Phone']) && menu.warnings.length === 2 && menu.sections[1].items[0].tags.join() === 'vegetarian,gluten free',
  J({ facts: menu.facts, warnings: menu.warnings })
);
ok('  what could not be read is kept, to be said', menu.unclear.length === 1 && /too faint/.test(menu.unclear[0]));
ok('reading it back is the same state', J(E.sanitizeEasy(menu)) === J(menu));
{
  const lake = E.sanitizeEasy({ kind: 'poster', summary: 'A photo of a lake.' });
  ok(
    'a kind it does not know is "other", and a title it did not have is the kind’s',
    lake.kind === 'other' && lake.title === 'The photo' && E.sanitizeEasy({ kind: 'receipt', facts: [{ label: 'Total', value: '$12.40' }] }).title === 'The receipt',
    J(lake)
  );
}
ok(
  'a list of plain lines is read as names',
  J(E.sanitizeEasy({ kind: 'list', sections: [{ title: '', items: ['Milk', ' Eggs ', ''] }] }).sections[0].items) ===
    J([
      { id: 'i1', name: 'Milk' },
      { id: 'i2', name: 'Eggs' },
    ])
);
{
  const many = {
    kind: 'menu',
    sections: Array.from({ length: 15 }, (_, s) => ({ title: `S${s}`, items: Array.from({ length: 45 }, (_, i) => ({ name: `Dish ${s}.${i}`, value: '$1', tags: ['a', 'b', 'c', 'd', 'e', 'f'] })) })),
    steps: Array.from({ length: 30 }, (_, i) => `Step ${i}`),
    warnings: Array.from({ length: 12 }, (_, i) => `W${i}`),
    unclear: Array.from({ length: 9 }, (_, i) => `U${i}`),
    facts: Array.from({ length: 20 }, (_, i) => ({ label: `L${i}`, value: 'v' })),
    times: Array.from({ length: 50 }, (_, i) => ({ time: `${10 + (i % 10)}:00`, label: `t${i}` })),
  };
  const m = E.sanitizeEasy(many);
  const L = E.EASY_LIMITS;
  const n = m.sections.reduce((a, s) => a + s.items.length, 0);
  ok(
    `at most ${L.items} items, ${L.perSection} to a section, ${L.tags} marks each`,
    n === L.items && m.sections.every((s) => s.items.length <= L.perSection) && m.sections[0].items.every((i) => i.tags.length === L.tags),
    J({ n, per: m.sections.map((s) => s.items.length) })
  );
  ok(
    `  and at most ${L.steps} steps, ${L.times} times, ${L.facts} facts, ${L.warnings} warnings, ${L.unclear} things unread`,
    m.steps.length === L.steps && m.times.length === L.times && m.facts.length === L.facts && m.warnings.length === L.warnings && m.unclear.length === L.unclear
  );
}
ok('a very long line is cut at a word, not in one', E.sanitizeEasy({ kind: 'menu', sections: [{ title: 'x', items: [{ name: 'word '.repeat(60) }] }] }).sections[0].items[0].name.length <= 120);
ok(
  'shown at a glance only when there is something to draw',
  E.sanitizeEasy({ ...MENU, view: 'glance' }).view === 'glance' && E.sanitizeEasy({ kind: 'letter', summary: 'A letter.', view: 'glance' }).view === 'read' && menu.view === 'read'
);

console.log('\n=== drawn from what was read, never asked of a model ===');
const PRICES = [
  ['$6.50', 6.5],
  ['£12', 12],
  ['€6,50', 6.5],
  ['6,50 €', 6.5],
  ['12.90 USD', 12.9],
  ['USD 15', 15],
  ['2 for $5', 5],
  ['1,200', 1200],
  ['$1,200.50', 1200.5],
  ['¥800', 800],
  ['12', 12],
  ['9.5', 9.5],
];
for (const [v, n] of PRICES) ok(`a price, as written: "${v}" is ${n}`, E.priceOf(v) === n, E.priceOf(v));
ok(
  'not a price: "market price", "ask", "2 tablets", "10-12", "$0", nothing',
  ['market price', 'Ask your server', '2 tablets', '10-12', '$0', '', undefined].every((v) => E.priceOf(v) === null),
  J(['market price', '2 tablets', '10-12', '$0'].map((v) => E.priceOf(v)))
);
const TIMES = [
  ['08:15', 495],
  ['8.15 pm', 1215],
  ['20h45', 1245],
  ['9 am', 540],
  ['9:40 a.m.', 580],
  ['12 am', 0],
  ['12 pm', 720],
  ['12:30 AM', 30],
  ['24:00', 0],
];
for (const [t, m] of TIMES) ok(`a time, as written: "${t}" is ${m} minutes into the day`, E.minutesOf(t) === m, E.minutesOf(t));
ok(
  'not a time: a bare number, 25:00, 13 pm, 7:75, "noon"',
  ['9', '25:00', '13 pm', '7:75', 'noon', ''].every((t) => E.minutesOf(t) === null),
  J(['9', '25:00', '13 pm', '7:75'].map((t) => E.minutesOf(t)))
);
{
  const g = E.glanceOf(menu);
  ok(
    'a menu is drawn as its prices — every one with a price, in its own order',
    g.kind === 'prices' && J(g.prices.map((p) => p.n)) === J([6.5, 9, 14.5, 19, 24, 7]) && g.prices[0].section === 'Starters',
    J(g.prices.map((p) => [p.name, p.n]))
  );
  const t = E.glanceOf(times);
  ok('a timetable is drawn as its times — one it cannot read stays, without a place on the line', t.kind === 'times' && J(t.times.map((x) => x.minutes)) === J([495, 580, 725, null]), J(t.times));
  ok('a label with steps is drawn as its steps', E.glanceOf(label).kind === 'steps' && E.glanceOf(label).steps.length === 3);
  ok('prices come first: a menu with times on it is still its prices', E.glanceOf({ ...menu, times: times.times }).kind === 'prices');
  ok(
    'one price, one time, one step: nothing to draw',
    E.glanceOf({ sections: [{ id: 's1', title: '', items: [{ id: 'i1', name: 'Tea', value: '$2' }] }], times: [{ time: '9:00', label: '' }], steps: ['Open'] }).kind === null
  );
}
{
  const t = E.glanceOf(times).times;
  ok('the next time: the first at or after now', E.nextTime(t, 8 * 60 + 30) === 1 && E.nextTime(t, 495) === 0 && E.nextTime(t, 0) === 0);
  ok('  none left today: none', E.nextTime(t, 23 * 60) === -1 && E.nextTime([], 600) === -1);
  ok('  in time order, whatever the order written', E.nextTime([{ minutes: 900 }, { minutes: 610 }, { minutes: null }], 600) === 1);
}
ok('what can be shown only: every mark, in the order first met, once', J(E.tagsOf(menu)) === J(['vegetarian', 'spicy', 'gluten free']));
ok(
  'what it holds, in a few words',
  E.easyShape(menu) === '6 items · menu' &&
    E.easyShape(times) === '4 times · timetable' &&
    E.easyShape(label) === '3 steps · label' &&
    E.easyShape(E.sanitizeEasy({ kind: 'other', summary: 'A lake.' })) === 'what it says · photo',
  J([E.easyShape(menu), E.easyShape(times), E.easyShape(label)])
);

console.log('\n=== said: in the conversation, aloud, and to a model ===');
{
  const said = E.easySaid(menu);
  ok('what Socria says: what it is, by its name, and how much is on it', said.startsWith('Here is the menu in large print — **Rosa’s Kitchen**, 6 items.'), said);
  ok('  the prices it runs between, as written', said.includes('Prices run from $6.50 to $24.00.'), said);
  ok('  how to make it easier still, by the names on the buttons', said.includes('**A+**') && said.includes('**High contrast**') && said.includes('**Read it to me**'));
  ok('  what could not be read, said once, with one full stop', said.endsWith('Some of it could not be read: The line under Desserts is too faint to read.') && !said.includes('..'), said);
  ok(
    '  no range from one price, or from prices all the same',
    !E.easySaid(
      E.sanitizeEasy({
        kind: 'menu',
        sections: [
          {
            title: '',
            items: [
              { name: 'Tea', value: '$2' },
              { name: 'Coffee', value: '$2' },
            ],
          },
        ],
      })
    ).includes('Prices run')
  );
  ok('  a label says it is a label, and what it holds', E.easySaid(label).startsWith('Here is the label in large print — **Paracetamol 500 mg**, 3 steps.'), E.easySaid(label));
  ok('  never more than a short paragraph', E.easySaid(E.sanitizeEasy({ ...MENU, title: 'x'.repeat(80), unclear: Array.from({ length: 6 }, (_, i) => `${'faint '.repeat(25)}${i}`) })).length <= 600);
}
{
  const lines = E.easySpoken(menu);
  ok(
    'read aloud: its name, what it is, the warnings first, then the facts',
    lines[0] === 'Rosa’s Kitchen' && lines[1].startsWith('A restaurant menu') && lines[2] === 'Note: Garlic prawns contain shellfish.' && lines.includes('Open: Tue–Sun, 12 – 10 pm.'),
    J(lines.slice(0, 5))
  );
  ok('  then every line, under its heading: name, price, what is in it, its marks', lines.includes('Starters') && lines.includes('Tomato soup, $6.50. with warm sourdough. vegetarian.'), J(lines));
  ok(
    '  a step by its number, a time with what it is for',
    E.easySpoken(label).includes('Step 2: Wait at least 4 hours before taking more.') && E.easySpoken(times).includes('08:15: Main St → Hospital.')
  );
  ok(
    '  a line on its own, as a press on it reads it',
    E.itemSpoken({ id: 'i9', name: 'Tea' }) === 'Tea.' && E.itemSpoken(menu.sections[1].items[0]) === 'Mushroom risotto, $14.50. parmesan, thyme. vegetarian, gluten free.'
  );
}
{
  const text = E.easyText(menu);
  ok(
    'to a model, as text: what it is, then every line as read',
    text.startsWith('EASY VIEW “Rosa’s Kitchen” — a photo of a menu, as read.') &&
      text.includes('- Tomato soup — $6.50 (with warm sourdough) [vegetarian]') &&
      text.includes('Warning: Garlic prawns contain shellfish.'),
    text
  );
  ok('  and what could not be read, so it is not guessed at', text.endsWith('Could not be read: The line under Desserts is too faint to read.'));
  ok('  cut to the length it is given, and says so', E.easyText(menu, 80).length === 80 && E.easyText(menu, 80).endsWith('…'));
}

console.log('\n=== the kind: made from a photo, and only from one ===');
{
  const k = E.kindOf('easy');
  const meta = E.displayMeta('easy');
  ok(
    'a display kind, "Easy view", read as it is or at a glance',
    k?.label === 'Easy view' && J(k.views.map((v) => v.id)) === J(['read', 'glance']) && k.views[0].label === 'Read it' && k.views[1].label === 'At a glance'
  );
  ok('  made by taking or choosing a photo: never offered, never drafted', meta?.internal === true && !E.offeredKinds().some((m) => m.kind === 'easy'));
  ok('  "made from your photo" — said above it in Artifacts', meta?.madeFrom === 'made from your photo' && meta.noun === 'easy view');
  ok(
    '  no words ask for one: it is made from a photo',
    ['make an easy view of this menu', 'show me this menu in large print', 'make the menu easy to read'].every((t) => E.readDisplayRequest(t)?.kind !== 'easy')
  );
  ok('  and a draft that claims to be one is refused', E.readDisplayProposal({ display: { kind: 'easy', state: MENU } }, { request: null }).ok === false);
  ok('  At a glance is not offered with nothing to draw — and says why', !!k.views[1].unavailable(E.sanitizeEasy({ kind: 'letter', summary: 'A letter.' })) && k.views[1].unavailable(menu) === null);
  ok(
    '  what a model is told: answer from its text, keep prices and times as written, say what could not be read',
    k.facts(menu).join(' ').includes('keep prices and times exactly as written') && /could not be read/.test(k.facts(menu).join(' '))
  );
  ok(
    '  "show it as bars" and "at a glance" switch it; nothing else does',
    J(k.readOp('show it at a glance', menu)) === J({ op: 'view', args: { view: 'glance' } }) &&
      k.readOp('show it as bars', menu)?.args.view === 'glance' &&
      k.readOp('what is vegetarian?', menu) === null
  );
  const made = E.makeDisplay(E.EMPTY_SPACE, 'easy', menu, 'source');
  ok(
    'kept in the workspace as material you attached, named Easy1',
    made.ok && made.obj.kind === 'easy' && made.obj.origin === 'source' && made.obj.name === 'Easy1',
    J(made.ok ? { name: made.obj.name, origin: made.obj.origin } : made)
  );
  ok('  nothing to read is not kept', E.makeDisplay(E.EMPTY_SPACE, 'easy', { kind: 'menu' }, 'source').ok === false);
  const g = E.apply(made.space, made.obj.id, 'view', { view: 'glance' }, { by: 'person', at: 1 });
  ok('  shown at a glance by the person, and back', g.ok && g.obj.states[g.obj.at].view === 'glance' && E.apply(g.space, made.obj.id, 'view', { view: 'read' }, { by: 'person', at: 2 }).ok);
  const letter = E.makeDisplay(E.EMPTY_SPACE, 'easy', E.sanitizeEasy({ kind: 'letter', summary: 'A letter from the bank.' }), 'source');
  ok('  a letter with nothing to draw is not shown at a glance', E.apply(letter.space, letter.obj.id, 'view', { view: 'glance' }, { by: 'person', at: 1 }).ok === false);
}

console.log('\n=== the figure: large, clear, simple ===');
const live = (state) => {
  const made = E.makeDisplay(E.EMPTY_SPACE, 'easy', state, 'source');
  return html(h(E.ObjectFigure, { obj: made.obj, at: made.obj.at, mode: 'live', onOp: () => ({ ok: true }) }));
};
{
  const m = live(menu);
  const ez = m.slice(m.indexOf('class="ez'));
  ok(
    'big type from the start: the second of four sizes',
    /<div class="ez" style="--ez:1.2" data-size="1">/.test(m) && J(E.EASY_SIZES) === J([1, 1.2, 1.45, 1.75]),
    m.match(/<div class="ez[^>]*>/)?.[0]
  );
  ok('a toolbar that says what it is for', /role="toolbar" aria-label="Make it easier to read"/.test(m));
  ok('  smaller and bigger words — buttons named, and with a word on each', /aria-label="Smaller words"/.test(m) && /aria-label="Bigger words"/.test(m) && />Smaller</.test(m) && />Bigger</.test(m));
  ok('  high contrast: a switch, said as one, off to begin with', /class="ez-btn" aria-pressed="false">[\s\S]*?High contrast/.test(m));
  ok('  "Read it to me" only once the browser says it has a voice — and no line pretends to read itself', !/Read it to me/.test(m) && !/is-press/.test(m));
  ok(
    'show only what the photo marks: one switch per mark, none pressed',
    /role="group" aria-label="Show only"/.test(m) &&
      J([...m.matchAll(/<button type="button" class="ez-chip" aria-pressed="false">([^<]+)</g)].map((x) => x[1])) === J(['vegetarian', 'spicy', 'gluten free'])
  );
  ok('its kind, its name in the serif, what it is', /<p class="ez-kind">menu<\/p><h3 class="ez-title">Rosa’s Kitchen<\/h3><p class="ez-summary">A restaurant menu/.test(m));
  ok(
    'the warnings first, as a note, word for word',
    /<div class="ez-warn" role="note">[\s\S]*?Please note[\s\S]*?<li>Garlic prawns contain shellfish\.<\/li><li>Please tell us about any allergies\.<\/li>/.test(m)
  );
  ok('the facts as terms and what they are', /<dl class="ez-facts">[\s\S]*?<dt>Open<\/dt><dd>Tue–Sun, 12 – 10 pm<\/dd>/.test(m));
  ok(
    'each section under its heading, a region named by it',
    J([...m.matchAll(/<section class="ez-sec" aria-label="([^"]+)"><h4 class="ez-sec-h">/g)].map((x) => x[1])) === J(['Starters', 'Mains', 'Desserts'])
  );
  ok(
    'each line: its name, its price, what is in it, its marks',
    /<span class="ez-name">Tomato soup<\/span><span class="ez-value">\$6\.50<\/span><\/span><span class="ez-detail">with warm sourdough<\/span><span class="ez-tags"><span class="ez-tag">vegetarian<\/span>/.test(
      m
    )
  );
  ok('what could not be read is said, under its own heading', /<p class="ez-unclear"><span>Could not be read<\/span> The line under Desserts is too faint to read\.<\/p>/.test(m));
  ok(
    '  and, at its foot, to check what matters against the original — a model read it',
    /<p class="ez-check">Read from your photo\. For anything that matters — a dose, a date, an allergy — check the original too\.<\/p>/.test(m)
  );
  ok(
    'above it: how much is on it, and the two ways to see it',
    /class="dsp-aside">6 items · menu</.test(m) && /role="tab" aria-selected="true"[^>]*>Read it</.test(m) && /role="tab" aria-selected="false"[^>]*>At a glance</.test(m)
  );
  ok('  and where it came from: the photo you attached', /from material you attached/i.test(m));
  ok('nothing in it is an emoji: every sign is drawn', !/\p{Extended_Pictographic}/u.test(ez.replace(/[−+×·—–→]/g, '')));
}
{
  const g = live({ ...menu, view: 'glance' });
  const names = [...g.matchAll(/<span class="ez-bar-name">([^<]+)</g)].map((x) => x[1]);
  const widths = [...g.matchAll(/<i style="width:(\d+)%"><\/i>/g)].map((x) => Number(x[1]));
  ok(
    'at a glance: the prices as bars, from the lowest',
    /Prices, from lowest to highest/.test(g) && J(names) === J(['Tomato soup', 'Apple crumble', 'Garlic prawns', 'Mushroom risotto', 'Grilled salmon', 'Steak frites']),
    J(names)
  );
  ok('  each bar as long as its price against the highest', J(widths) === J([27, 29, 38, 60, 79, 100]), J(widths));
  ok('  each with the section it is from, and its price as written', /<span class="ez-bar-name">Tomato soup<em>Starters<\/em><\/span><span class="ez-bar-value">\$6\.50<\/span>/.test(g));
  ok('  the lowest and the highest, said in words beneath', /Lowest: <b>Tomato soup<\/b>, \$6\.50 · Highest: <b>Steak frites<\/b>, \$24\.00/.test(g));
  ok('  the bars are a picture of what is said beside them', (g.match(/class="ez-bar-track" aria-hidden="true"/g) ?? []).length === 6);
  ok('  and here too, to check what matters against the original', /<p class="ez-check">Read from your photo\./.test(g));
}
{
  const t = live({ ...times, view: 'glance' });
  ok(
    'a timetable at a glance: its times in order, each with what it is for',
    /The times, in order — the next one marked/.test(t) && /<span class="ez-time">08:15<\/span><span class="ez-time-l">Main St → Hospital<\/span>/.test(t) && /aria-label="Times"/.test(t)
  );
  ok('  the next one is marked by this device’s clock, after the page is drawn — not by the server’s', !/is-next/.test(t) && !/ez-next/.test(t));
  const s = live({ ...label, view: 'glance' });
  ok(
    'a label at a glance: what to do, one step at a time, numbered',
    /What to do, one step at a time/.test(s) && /<ol class="ez-steps" aria-label="Steps">/.test(s) && (s.match(/class="ez-step-n" aria-hidden="true">\d</g) ?? []).length === 3
  );
  ok('  its warning is there when it is read', /Do not take with other products containing paracetamol\./.test(live(label)));
}
{
  const made = E.makeDisplay(E.EMPTY_SPACE, 'easy', menu, 'source');
  const card = html(h(E.ObjectFigure, { obj: made.obj, at: made.obj.at, mode: 'card' }));
  ok('drawn small, on the map: its name, and nothing to press', card.includes('Rosa’s Kitchen') && !card.includes('ez-bar') && !card.includes('ez-chip'));
}

console.log('\n=== the photo: Make, the sheet, the route ===');
{
  const c = E.makeChoice('easy');
  ok('Make offers it first: "Easy view", for small print', E.MAKE_CHOICES[0]?.id === 'easy' && c.label === 'Easy view' && /small print/.test(c.about));
  ok('  choosing it opens the photo — it is not asked for in words', c.opens === 'photo' && E.askFor(c, 'what is vegetarian', true) === null && E.askFor(c, '', true) === null);
  ok('  and it fills an easy view, read as it is', J(c.template) === J({ kind: 'easy', view: 'read' }));
  const g = html(h(E.MakeGallery, { onPick: () => {} }));
  ok('  its card shows one, drawn by its own figure over the example', /data-make="easy"[\s\S]*?class="mkg-figure"[\s\S]*?The Corner Café/.test(g));
}
{
  const sheet = (touch) => html(h(E.EasyCapture, { open: true, onClose: () => {}, touch, onPhoto: async () => null }));
  ok('closed, the sheet is nothing', html(h(E.EasyCapture, { open: false, onClose: () => {}, touch: true, onPhoto: async () => null })) === '');
  const phone = sheet(true);
  ok(
    'on a phone: a dialog, named by its headline',
    /role="dialog" aria-modal="true" aria-labelledby="ec-title"/.test(phone) && /<h2 id="ec-title" class="ec-title">Point your phone at the <em>small print<\/em>\.<\/h2>/.test(phone)
  );
  ok(
    '  "Take a photo" first — the camera, straight away — then "Choose a photo"',
    /class="ec-go is-main"[^>]*>[\s\S]*?Take a photo<\/button><button type="button" class="ec-go"[^>]*>[\s\S]*?Choose a photo/.test(phone)
  );
  ok(
    '  the camera is the back one; a photo chosen may be any the phone keeps (image/*: an iPhone hands its HEIC over as JPEG)',
    /accept="image\/\*" capture="environment"/.test(phone) && (phone.match(/accept="image\/\*"/g) ?? []).length === 2
  );
  ok('  what it is for, and how to take a good one', /A menu, a medicine label, a timetable, a letter\./.test(phone) && /class="ec-tip">Hold it steady/.test(phone));
  ok('  a close button with a name', /aria-label="Close"/.test(phone));
  const desk = sheet(false);
  ok(
    'on a computer: no camera button — "Choose a photo" is the one to press',
    !/Take a photo/.test(desk) && /class="ec-go is-main"[^>]*>[\s\S]*?Choose a photo/.test(desk) && /A photo of the <em>small print<\/em>\./.test(desk)
  );
  ok('the photo keeps more of the small print than a photo in the conversation', E.EASY_READ_EDGE === 2048 && E.EASY_READ_EDGE > E.READ_MAX_EDGE);
  const cap = read('components/logos5/EasyCapture.tsx');
  ok(
    '  and the sheet asks for that much — saying so while a HEIC is converted',
    /prepareImage\(file, undefined, EASY_READ_EDGE, \{ onConvert:/.test(cap) &&
      /const full = scaled\(pic\.src, pic\.w, pic\.h, readEdge\)/.test(read('lib/logos-upload.ts')) &&
      /Converting the HEIC photo…/.test(cap)
  );
  ok(
    '  while it is read, it says so in words — and a failure says what to try',
    /Reading the photo…/.test(cap) && /role="status" aria-live="polite"/.test(cap) && /role="alert"/.test(cap) && /Try another photo:/.test(cap)
  );
}
{
  const route = read('app/api/logos/easy/route.ts');
  ok(
    'the route: signed in, or let in by the takeover’s guard; rate limited',
    /if \(!userId && !mayUse\(req, userId\)\) return NextResponse\.json\(\{ error: 'Unauthorized' \}, \{ status: 401 \}\)/.test(route) && /enforceRateLimit\(req, userId, 'aux'\)/.test(route)
  );
  ok(
    '  a photo only — an image data URL, of a size a 2048px photo fits in',
    /data:image\\\/\(png\|jpeg\|webp\|gif\);base64,/.test(route) && /MAX_DATA_URL = 9_000_000/.test(route) && /status: 400/.test(route)
  );
  ok(
    '  a photo read is a photo counted, from the same allowance — and when it is used up, said',
    /spend\(userId, plan, 'images'/.test(route) && /boundaryNote\('images'\)/.test(route) && /status: 402/.test(route)
  );
  ok(
    '  read once, carefully: no randomness, one JSON object, the full picture',
    /temperature: 0/.test(route) && /response_format: \{ type: 'json_object' \}/.test(route) && /detail: 'high'/.test(route) && /role: 'system', content: EASY_PROMPT/.test(route)
  );
  ok('  held to the kind before anything is returned — nothing to read is said plainly', /const easy = sanitizeEasy\(raw\)/.test(route) && /error: EASY_UNREAD \}, \{ status: 422 \}/.test(route));
  ok('  logged as its own call', /tracked\(new OpenAI\([^)]*\), 'logos\/easy'\)/.test(route));
  const takeover = read('lib/takeover.ts');
  ok('behind the takeover gate, with the other routes that think', /'\/api\/logos\/read',\s*'\/api\/logos\/easy'/.test(takeover), takeover.match(/THINKING_API[\s\S]{0,400}/)?.[0]);
  ok(
    'what the model is asked: copy, never invent — and say what cannot be read',
    E.EASY_PROMPT.startsWith(E.EASY_PROMPT_HEAD) && /Copy, never invent/.test(E.EASY_PROMPT) && /"unclear"/.test(E.EASY_PROMPT) && /Never guess a price, a time or a dose/.test(E.EASY_PROMPT)
  );
  ok(
    '  the shape it answers in is the shape the kind keeps',
    ['"title"', '"kind"', '"summary"', '"sections"', '"items"', '"name"', '"detail"', '"value"', '"tags"', '"facts"', '"steps"', '"times"', '"warnings"', '"unclear"'].every((k) =>
      E.EASY_PROMPT.includes(k)
    ) && E.EASY_PROMPT.includes(E.EASY_KINDS.join(' | '))
  );
  ok(
    '  what was typed beside the photo goes with it, as their words',
    E.easyAsk('  what is   vegetarian? ') === 'Make an easy view of this photo. They said beside it: “what is vegetarian?”' &&
      E.easyAsk('') === 'Make an easy view of this photo.' &&
      E.easyAsk(null) === 'Make an easy view of this photo.' &&
      E.easyAsk('x'.repeat(500)).length < 400
  );
  ok('  the stand-in model on a laptop knows the request by its first words', read('scripts/dev/fake-openai.mjs').includes(`system.startsWith('${E.EASY_PROMPT_HEAD}')`));
}

console.log('\n=== the app: the sheet in Logos 5, the turn, the artifact ===');
{
  const app = read('components/LogosApp.tsx');
  const fn = app.slice(app.indexOf('async function makeEasy('), app.indexOf('// ── QUICK CAPTURE'));
  ok('choosing Easy view in Make opens the sheet, not the composer', /makeChoice\(id, ownChoices\)\?\.opens === 'photo'\) \{\s*setEasyOpen\(true\);\s*return;/.test(app));
  ok('  and the conversation is not opened over it', /if \(!makeChoice\(id, ownChoices\)\?\.opens\) setScreen/.test(app));
  ok(
    'the sheet is in Logos 5: the camera first on a phone, what was typed sent with the photo',
    /<EasyCapture open=\{easyOpen\} onClose=\{\(\) => setEasyOpen\(false\)\} touch=\{narrow\} said=\{input\} onPhoto=\{makeEasy\} \/>/.test(app)
  );
  ok('the photo is read by the route, with what was typed', /fetch\('\/api\/logos\/easy'/.test(fn) && /JSON\.stringify\(\{ image: photo\.full, said: typed, sessionId: sid \}\)/.test(fn));
  ok('  and held to the kind again on this side', /const easy = sanitizeEasy\(json\.easy\)/.test(fn));
  ok(
    'the person’s turn: the photo, kept as source material, with its reading — so nothing reads it twice',
    /origin: 'source'/.test(fn) && /reading: easyText\(easy, MAX_READING_CHARS\)/.test(fn) && /content: typed \|\| 'Make this easy to read\.'/.test(fn)
  );
  ok('Socria’s answer says what it is and how to make it easier', /content: easySaid\(easy\)/.test(fn));
  ok('the easy view is kept as material attached, and opened in Artifacts', /makeDisplay\(spaceOf\(m\), 'easy', easy, 'source'\)/.test(fn) && /showArtifact\(`d:\$\{made\.obj\.id\}`\)/.test(fn));
  ok('  a full workspace is said, and what it says is still in the conversation', /already holds as many things as it keeps/.test(fn));
  ok('  a line of thinking shared to look at is not added to', /if \(togetherReadOnly\) return/.test(fn));
  ok('  signed out, it says to sign in', /res\.status === 401\) return 'Sign in to make an easy view of a photo\.'/.test(fn));
  ok('in Artifacts it says what it was made from', /\.\.\.\(meta\?\.madeFrom \? \{ eyebrow: `Artifact · \$\{Noun\} · \$\{meta\.madeFrom\}` \} : \{\}\)/.test(app));
}

console.log('\n=== the sheet: for the eyes it is for ===');
{
  const css = read('components/display/easy.css');
  const lum = (hex) => {
    const c = hex
      .replace('#', '')
      .match(/../g)
      .map((x) => parseInt(x, 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  const hc = css.match(/\.ez\.is-hc \{([\s\S]*?)\}/)?.[1] ?? '';
  const v = (name) => hc.match(new RegExp(`--ez-${name}: (#[0-9a-f]{6});`))?.[1];
  const [ink, bg, moss, warn] = [v('ink'), v('bg'), v('moss'), v('warn')];
  ok('high contrast: the words on ink at 7:1 or more (AAA) — it is 14', !!ink && !!bg && ratio(ink, bg) >= 14, ink && bg && ratio(ink, bg).toFixed(2));
  ok('  the accent and the warnings at 7:1 too', ratio(moss, bg) >= 7 && ratio(warn, bg) >= 7, J([moss && ratio(moss, bg).toFixed(2), warn && ratio(warn, bg).toFixed(2)]));
  ok('the words start at 19px times the size chosen, and everything grows with them', /font-size: calc\(var\(--ez, 1\.2\) \* 19px\);/.test(css));
  ok('every control is 48px tall at least', /\.ez-btn \{[\s\S]*?min-height: 48px;/.test(css) && /\.ez-chip \{[\s\S]*?min-height: 48px;/.test(css));
  ok('  and on a phone the marks wrap, every one in sight — none hidden past the edge', !/\.ez-only \{[^}]*overflow-x: auto/.test(css) && /\.ez-only-l \{\s*flex-basis: 100%;/.test(css));
  ok('a measure for reading, in em: a name stays near its price on a wide screen', /\.ez-read,\s*\.ez-glance,\s*\.ez-check \{\s*max-width: 34em;/.test(css));
  ok(
    'a phone’s layout by the width it is given, not the screen',
    /@container \(max-width: 560px\)/.test(css) && /\.dsp\.is-live \{[^}]*container-type: inline-size/.test(read('components/display/display.css'))
  );
  const narrow = css.slice(css.indexOf('@container (max-width: 560px)'));
  ok(
    '  there, the four controls are two pairs of wide buttons — no word shrunk to fit',
    /\.ez-bar \{\s*display: grid;\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/.test(narrow) && !/font-size: 1[0-3]px/.test(narrow.slice(0, narrow.indexOf('@media')))
  );
  ok('a finger leaves no hover behind', /@media \(hover: hover\) \{[\s\S]*?\.ez \.is-press:hover/.test(css) && !/^\.is-press:hover/m.test(css));
  ok(
    'nothing moves for someone who asked it not to',
    /@media \(prefers-reduced-motion: reduce\)/.test(css) && /@media \(prefers-reduced-motion: reduce\)/.test(read('components/logos5/easy-capture.css'))
  );
  ok('the sheet’s two ways in are 64px tall, a thumb cannot miss them', /\.ec-go \{[\s\S]*?min-height: 64px;/.test(read('components/logos5/easy-capture.css')));
}

console.log(`\neasy-view: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
