// ANY ARTIFACT, FROM A FEW PRIMITIVES — "the user should be able to choose what
// artifact on prompt, any artifact … the user can make their own artifact and
// save the template, it's completely generative, so make a few primitives but
// make sure it works too".
//
//   primitives  text, list, table, number, value, chart, progress, choice,
//               field, timer, group — what a draft may hold, and what it may not
//   formulas    read by the kind alone: arithmetic, comparisons, a dozen
//               functions, a table's column, a list's ticks — never code
//   computed    calc cells, totals, values and progress, worked out live
//   operations  every change is a step: set, tick, items, cells, rows — and
//               what the person wrote, Socria may not change
//   words       "set servings to 6", "tick milk", "add bread to the list"
//   asked for   "Make a custom artifact: …", "make me a habit tracker", a
//               saved template — never "I want to make a tracker" (theirs)
//   drafted     the proposal pass is told the primitives, and their template
//   templates   saved on this device, read back through the kind, made again
//   drawn       the figure draws every primitive, and works it
//
// lib/objects/display-custom.ts, lib/logos5/templates.ts, lib/logos5/make.ts,
// components/display/CustomFigure.tsx, components/logos5/MakeGallery.tsx.

import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import * as C from './.tmp/custom-under-test.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 400))));
const J = JSON.stringify;
const html = (el) => renderToStaticMarkup(el);
const S = (raw) => C.sanitizeCustom(raw);

// every primitive, once
const KITCHEN = {
  title: 'Week planner',
  about: 'Everything at once.',
  blocks: [
    { id: 'intro', type: 'text', text: 'Plan the week.\nThen do it.', size: 'body' },
    { id: 'pack', type: 'list', label: 'Packing', check: true, items: [{ text: 'Charger' }, { text: 'Water', done: true }, 'Snacks'] },
    {
      id: 'log', type: 'table', label: 'Workouts',
      columns: [{ id: 'day', label: 'Day' }, { id: 'mins', label: 'Minutes', kind: 'number', total: true }, { id: 'done', label: 'Done', kind: 'check' }, { id: 'kcal', label: 'Calories', kind: 'calc', expr: 'mins * rate', total: true }],
      rows: [{ cells: { day: 'Mon', mins: 30, done: true } }, ['Tue', 45, false], { day: 'Wed', mins: '20' }],
    },
    { id: 'rate', type: 'number', label: 'Calories a minute', value: 8, min: 1, max: 20, step: 1 },
    { id: 'total', type: 'value', label: 'This week', expr: 'sum(log.kcal)', unit: 'kcal', decimals: 0 },
    { id: 'bars', type: 'chart', label: 'Minutes', chart: 'bar', table: 'log', x: 'day', y: 'mins' },
    { id: 'pie', type: 'chart', label: 'Split', chart: 'pie', points: [{ label: 'Run', value: 3 }, { label: 'Swim', value: 1 }] },
    { id: 'packed', type: 'progress', label: 'Packed', of: 'pack' },
    { id: 'goal', type: 'progress', label: 'Goal', expr: 'log.rows', max: 5 },
    { id: 'mood', type: 'choice', label: 'How did it go?', options: ['Great', 'Fine', 'Hard'], picked: [1] },
    { id: 'quiz', type: 'choice', label: 'Which burns more?', options: ['Walking', 'Running'], answer: [1] },
    { id: 'notes', type: 'field', label: 'Notes', multiline: true, placeholder: 'How did the week feel?' },
    { id: 'rest', type: 'timer', label: 'Rest', seconds: 90 },
    { id: 'side', type: 'group', label: 'Side by side', columns: 2, blocks: [{ id: 'a', type: 'number', label: 'Sleep', value: 7, unit: 'h' }, { id: 'b', type: 'value', label: 'Short of 8', expr: '8 - a', unit: 'h' }] },
  ],
};

console.log('=== the primitives: what a draft may hold ===');
{
  ok('eleven kinds of block, no more', J(C.BLOCK_TYPES) === J(['text', 'list', 'table', 'number', 'value', 'chart', 'progress', 'choice', 'field', 'timer', 'group']));
  const s = S(KITCHEN);
  ok('every one of them is kept from a draft that uses them all', !!s && J(C.allBlocks(s).map((b) => b.type)) === J(['text', 'list', 'table', 'number', 'value', 'chart', 'chart', 'progress', 'progress', 'choice', 'choice', 'field', 'timer', 'group', 'number', 'value']), J(s && C.allBlocks(s).map((b) => b.type)));
  ok('  a paragraph keeps its lines', s.blocks[0].text === 'Plan the week.\nThen do it.');
  ok('  a list item may be written plainly; only a checklist keeps ticks', J(s.blocks[1].items.map((i) => [i.text, !!i.done])) === J([['Charger', false], ['Water', true], ['Snacks', false]]));
  const t = s.blocks[2];
  ok('  a table row may be cells by id, a list in column order, or the cells themselves', J(t.rows.map((r) => r.cells)) === J([{ day: 'Mon', mins: 30, done: true }, { day: 'Tue', mins: 45 }, { day: 'Wed', mins: 20 }]), J(t.rows));
  ok('  a calc column keeps its formula and stores no cells of its own', t.columns[3].kind === 'calc' && t.columns[3].expr === 'mins * rate' && t.rows.every((r) => !('kcal' in r.cells)));
  ok('the example in the catalogue is kept whole', J(C.allBlocks(S(C.CUSTOM_EXAMPLE)).map((b) => b.id)) === J(['servings', 'ing', 'steps', 'cooked']));
  ok('the kind is registered, with its figure\'s view and a handle of its own', C.kindOf('custom')?.label === 'Custom artifact' && C.displayMeta('custom')?.handle === 'B' && C.displayKinds().some((m) => m.kind === 'custom' && !m.internal));

  const junk = S({ title: 'x', blocks: [{ type: 'script', text: 'alert(1)' }, { type: 'number' }, { type: 'value', label: 'Bad', expr: 'process.exit()' }, { type: 'choice', label: 'One', options: ['only'] }, { type: 'text', text: '  ' }, { type: 'text', text: 'kept' }] });
  ok('what is not a primitive, or is one missing what it needs, is dropped: an unknown type, a number with no label, a formula that does not read, a choice of one', !!junk && J(junk.blocks.map((b) => b.type)) === J(['text']) && junk.blocks[0].text === 'kept', J(junk));
  ok('a draft with nothing that can be held is not an artifact', S({ title: 'x', blocks: [{ type: 'nope' }] }) === null && S({ title: 'x' }) === null && S(null) === null && S('blocks') === null);
  const ids = S({ title: 'x', blocks: [{ type: 'text', text: 'one' }, { id: 'b1', type: 'number', label: 'N', value: 1 }, { id: 'b1', type: 'number', label: 'M', value: 2 }, { id: '9bad', type: 'text', text: 'two' }, { id: 'v', type: 'value', label: 'V', expr: 'b1 * 2' }] });
  const byLabel = Object.fromEntries(C.allBlocks(ids).map((b) => [b.label ?? b.text, b.id]));
  ok('an id is kept where a formula can name it; a repeat or a bad one is given a fresh one that takes nobody else\'s', byLabel.N === 'b1' && byLabel.M !== 'b1' && byLabel.one !== 'b1' && byLabel.two !== 'b1' && new Set(Object.values(byLabel)).size === 5, J(byLabel));
  ok('  so a formula still names the block it was written for', C.computeCustom(ids).values.v === 2);
  const many = S({ title: 'x', blocks: Array.from({ length: 60 }, (_, i) => ({ type: 'text', text: `t${i}` })) });
  ok('forty blocks at most', many.blocks.length === 40);
  const nested = S({ title: 'x', blocks: [{ type: 'group', blocks: [{ type: 'group', blocks: [{ type: 'text', text: 'deep' }] }, { type: 'text', text: 'one level' }] }] });
  ok('a group holds blocks, never another group', nested.blocks[0].blocks.length === 1 && nested.blocks[0].blocks[0].text === 'one level');
  const n = S({ title: 'x', blocks: [{ type: 'number', label: 'N', value: 99, min: 10, max: 1 }] }).blocks[0];
  ok('a number is held to its range (and a range written backwards is turned round)', n.min === 1 && n.max === 10 && n.value === 10, J(n));
  ok('  a slider needs both ends: with one missing it is a stepper', S({ title: 'x', blocks: [{ type: 'number', label: 'N', value: 1, min: 0, control: 'slider' }] }).blocks[0].control === 'stepper');
  const ctrl = S({ title: 'x', blocks: [{ type: 'text', text: 'a\u0000b\u0007c' }] });
  ok('control characters never reach the page', ctrl.blocks[0].text === 'a b c', J(ctrl.blocks[0].text));
}

console.log('\n=== formulas: read by the kind, never run as code ===');
{
  const v = (f, scope = () => null) => C.evalFormula(C.parseFormula(f), scope);
  ok('arithmetic in the usual order', v('1 + 2 * 3') === 7 && v('(1 + 2) * 3') === 9 && v('10 % 4') === 2 && v('-2 + 5') === 3);
  ok('powers from the right', v('2 ^ 3 ^ 2') === 512);
  ok('comparisons and if', v('if(3 > 2, 10, 20)') === 10 && v('if(2 >= 3, 10, 20)') === 20 && v('2 == 2') === 1 && v('2 != 2') === 0);
  ok('functions: round, floor, ceil, abs, sqrt, pow, clamp, min, max, sum, avg, count', v('round(10 / 3, 2)') === 3.33 && v('floor(2.7)') === 2 && v('ceil(2.1)') === 3 && v('abs(-4)') === 4 && v('sqrt(16)') === 4 && v('pow(2, 10)') === 1024 && v('clamp(15, 0, 10)') === 10 && v('min(4, 2, 8)') === 2 && v('max(4, 2, 8)') === 8 && v('sum(1, 2, 3)') === 6 && v('avg(2, 4)') === 3 && v('count(5, 6, 7)') === 3);
  ok('× ÷ − as people write them', v('6 × 7') === 42 && v('9 ÷ 3') === 3 && v('5 − 2') === 3);
  ok('nothing that is not a formula reads: code, properties, indexing, strings, assignment', ['alert(1)', 'a[0]', 'constructor.name', '"x"', 'x = 1', 'eval("1")', 'this', 'process.exit()', 'fetch(1)', '1;2'].every((f) => C.parseFormula(f) === null || v(f) === null));
  ok('no value is ever made up: dividing by zero, a square root of less than zero, a name that is not there', v('1 / 0') === null && v('sqrt(-1)') === null && v('nothing + 1') === null);
  ok('a formula too long to be one does not read', C.parseFormula('1 +'.repeat(80) + ' 1') === null);
  const scope = (name) => ({ 'log.kcal': [240, 360], 'pack.done': 1, 'pack.total': 3 })[name] ?? null;
  ok('a table\'s column is a list of numbers for sum and avg; a list\'s ticks are counted', v('sum(log.kcal)', scope) === 600 && v('avg(log.kcal)', scope) === 300 && Math.abs(v('pack.done / pack.total', scope) - 1 / 3) < 1e-9);
  ok('…and a column is never added like a number', v('log.kcal + 1', scope) === null);
  ok('the names a formula reads can be listed', J(C.namesIn(C.parseFormula('per * servings + sum(t.c)'))) === J(['per', 'servings', 't.c']));
}

console.log('\n=== what is worked out, live ===');
{
  const s = S(KITCHEN);
  const c = C.computeCustom(s);
  ok('calc cells from the row and the artifact\'s numbers', J(Object.values(c.cells.log).map((r) => r.kcal)) === J([240, 360, 160]), J(c.cells));
  ok('totals of number and calc columns', c.totals.log.mins === 95 && c.totals.log.kcal === 760, J(c.totals));
  ok('a value from a column, a value inside a group', c.values.total === 760 && c.values.b === 1);
  ok('progress from a checklist\'s ticks, and from a formula over its maximum', Math.abs(c.progress.packed - 1 / 3) < 1e-9 && Math.abs(c.progress.goal - 3 / 5) < 1e-9, J(c.progress));
  ok('a chart is drawn from its table\'s columns', J(C.chartData(s, s.blocks[5], c)) === J([{ label: 'Mon', value: 30 }, { label: 'Tue', value: 45 }, { label: 'Wed', value: 20 }]));
  const habits = S({ title: 'x', blocks: [{ id: 'w', type: 'table', columns: [{ id: 'h', label: 'Habit' }, { id: 'mon', label: 'Mon', kind: 'check' }, { id: 'tue', label: 'Tue', kind: 'check' }, { id: 'days', label: 'Days', kind: 'calc', expr: 'mon + tue', total: true }], rows: [{ cells: { h: 'Run', mon: true } }, { cells: { h: 'Read' } }] }] });
  const hc = C.computeCustom(habits);
  ok('a tick is a 1 and an empty tick a 0 in a formula — so a row of ticks adds up (an empty number is still no number)', J(Object.values(hc.cells.w).map((r) => r.days)) === J([1, 0]) && hc.totals.w.days === 1, J(hc));
  const loop = S({ title: 'x', blocks: [{ id: 'a', type: 'value', label: 'A', expr: 'b + 1' }, { id: 'b', type: 'value', label: 'B', expr: 'a + 1' }] });
  ok('values that lean on each other in a circle are no value — and do not hang', C.computeCustom(loop).values.a === null && C.computeCustom(loop).values.b === null);
  ok('a computed number as a person reads it', C.sayValue(1234.5, 2, 'kcal') === '1,234.5 kcal' && C.sayValue(12, 0, '%') === '12%' && C.sayValue(null) === '—');
}

console.log('\n=== every change is a step ===');
{
  const made = C.create(C.EMPTY_SPACE, 'custom', S(C.CUSTOM_EXAMPLE), { origin: 'socria', name: 'B1' });
  ok('made into an object of thought', !!made && made.obj.kind === 'custom');
  const id = made.obj.id;
  const step = (space, op, args, by = 'person') => C.apply(space, id, op, args, { by });
  let r = step(made.space, 'set', { id: 'servings', value: 6, by: 'person' });
  ok('set a number: the calc column and its total follow', r.ok && C.computeCustom(C.currentOf(r.obj)).totals.ing.amount === 612);
  ok('  held to its range', step(made.space, 'set', { id: 'servings', value: 99, by: 'person' }).obj && C.currentOf(step(made.space, 'set', { id: 'servings', value: 99, by: 'person' }).obj).blocks[0].value === 24);
  r = step(r.space, 'tick', { id: 'steps', item: 'i1', by: 'person' });
  ok('tick an item: progress follows', r.ok && Math.abs(C.computeCustom(C.currentOf(r.obj)).progress.cooked - 1 / 3) < 1e-9);
  r = step(r.space, 'addItem', { id: 'steps', text: 'Serve warm', by: 'person' });
  ok('add an item', r.ok && C.currentOf(r.obj).blocks[2].items.at(-1).text === 'Serve warm');
  r = step(r.space, 'cell', { id: 'ing', row: 'r1', col: 'per', value: 35, by: 'person' });
  ok('change a cell', r.ok && C.computeCustom(C.currentOf(r.obj)).cells.ing.r1.amount === 210);
  ok('  a calc cell is worked out, not typed', !step(r.space, 'cell', { id: 'ing', row: 'r1', col: 'amount', value: 5, by: 'person' }).ok);
  ok('  a number column takes numbers', !step(r.space, 'cell', { id: 'ing', row: 'r1', col: 'per', value: 'lots', by: 'person' }).ok);
  r = step(r.space, 'addRow', { id: 'ing', by: 'person' });
  ok('add a row', r.ok && C.currentOf(r.obj).blocks[1].rows.length === 4);
  const lastRow = C.currentOf(r.obj).blocks[1].rows.at(-1).id;
  r = step(r.space, 'removeRow', { id: 'ing', row: lastRow });
  ok('remove it', r.ok && C.currentOf(r.obj).blocks[1].rows.length === 3);
  const socria = step(r.space, 'set', { id: 'servings', value: 2 }, 'socria');
  ok('what the person set is theirs: Socria may not change it', !socria.ok && /yours/.test(socria.why));
  ok('…nor an item they ticked', !step(r.space, 'editItem', { id: 'steps', item: 'i1', text: 'Mix', by: 'socria' }, 'socria').ok);
  ok('…nor a row they changed', !step(r.space, 'cell', { id: 'ing', row: 'r1', col: 'item', value: 'Oats', by: 'socria' }, 'socria').ok);
  ok('what Socria wrote, Socria may change', step(made.space, 'editItem', { id: 'steps', item: 'i2', text: 'Add the milk', by: 'socria' }, 'socria').ok);
  ok('who did something is recorded, never claimed', !step(made.space, 'set', { id: 'servings', value: 3, by: 'person' }, 'socria').ok);
  ok('a step on something that is not there says so', !step(made.space, 'tick', { id: 'nope', item: 'i1' }).ok && !step(made.space, 'set', { id: 'steps', value: 1 }).ok);
  const field = S({ title: 'x', blocks: [{ id: 'f', type: 'field', label: 'Notes' }, { id: 'q', type: 'choice', label: 'Pick', options: ['A', 'B', 'C'], multi: true }] });
  const fm = C.create(C.EMPTY_SPACE, 'custom', field, { origin: 'socria', name: 'B2' });
  const w = C.apply(fm.space, fm.obj.id, 'set', { id: 'f', value: 'Line one\nLine two', by: 'person' }, { by: 'person' });
  ok('write in a field, its lines kept', w.ok && C.currentOf(w.obj).blocks[0].value === 'Line one\nLine two');
  const q = C.apply(w.space, fm.obj.id, 'set', { id: 'q', value: '0,2,9', by: 'person' }, { by: 'person' });
  ok('pick options (one that is not there is ignored)', q.ok && J(C.currentOf(q.obj).blocks[1].picked) === J([0, 2]));
}

console.log('\n=== in words ===');
{
  const s = S(C.CUSTOM_EXAMPLE);
  ok('"set servings to 6"', J(C.readCustomOp('set servings to 6', s)) === J({ op: 'set', args: { id: 'servings', value: 6, label: 'Servings to 6', by: 'person' } }));
  ok('"tick whisk the dry ingredients"', C.readCustomOp('tick whisk the dry ingredients', s)?.op === 'tick');
  ok('"add serve warm to the steps list"', J(C.readCustomOp('add serve warm to the steps list', s)) === J({ op: 'addItem', args: { id: 'steps', text: 'serve warm', by: 'person' } }));
  ok('a question about it is left to the conversation', C.readCustomOp('what should I set servings to?', s) === null && C.readCustomOp('how long do they cook?', s) === null);
  ok('"untick" an item that is not ticked does nothing', C.readCustomOp('untick whisk the dry ingredients', s) === null);
}

console.log('\n=== what the conversation is told ===');
{
  const s = S(KITCHEN);
  const facts = C.kindOf('custom').facts(s, { guarded: false }).join('\n');
  ok('what it is, and every value worked out, read as the artifact shows it', /A custom artifact, “Week planner” — Everything at once\./.test(facts) && /This week = 760 kcal \(worked out from sum\(log\.kcal\)\)/.test(facts) && /Packing \(1 of 3 done\)/.test(facts) && /total Calories: 760/.test(facts), facts);
  ok('a choice\'s answer is said when nobody is learning', /the answer: Running/.test(facts));
  ok('…and withheld when they are', !/the answer/.test(C.kindOf('custom').facts(s, { guarded: true }).join('\n')));
  ok('its tell: use its numbers, never your own arithmetic', /never your own arithmetic/.test(C.displayMeta('custom').tell(false)) && /never say which option is right/.test(C.displayMeta('custom').tell(true)));
  ok('the whole text, rows and all, for a model that cannot see it', /Mon/.test(C.kindOf('custom').text(s)) && /Calories: 240/.test(C.kindOf('custom').text(s)));
}

console.log('\n=== asked for: any artifact, in so many words ===');
{
  const R = (t) => C.readDisplayRequest(t);
  for (const t of ['Make a custom artifact: a habit tracker for exercise', 'make me a habit tracker for reading', 'Can you build me a grade calculator?', 'make a pomodoro timer', 'Make a custom artifact from my template “Habit tracker”: piano']) {
    ok(`"${t}" — a custom artifact, opened in Artifacts`, R(t)?.kind === 'custom' && C.routeTurn({ text: t }).intent === 'visual', J([R(t), C.routeTurn({ text: t })]));
  }
  ok('named, it is read by name — not by what it is for', R('Make a custom artifact: a habit tracker')?.intent !== true);
  for (const t of ['I want to make a tracker for my startup', 'how do I make a calculator in Excel?', 'my timer broke']) ok(`"${t}" — not a request for one`, R(t)?.kind !== 'custom', J(R(t)));
  ok('the other kinds still answer to their own names', R('make me a checklist for moving')?.kind === 'plan' && R('Make a chart: rent 1200, food 400')?.kind === 'data' && R('make a venn diagram of cats and dogs')?.kind === 'venn');
}

console.log('\n=== drafted: told the primitives, and their template ===');
{
  const req = C.readDisplayRequest('Make a custom artifact: a habit tracker');
  const prompt = C.buildDisplayPrompt({ request: req, today: '2026-10-26', guarded: false });
  ok('the pass is offered the custom kind alone, with every primitive and the example', /- "custom" —/.test(prompt) && !/- "plan" —/.test(prompt) && ['"type": "list"', '"type": "table"', '"type": "value"', '"type": "timer"', '"type": "group"', 'Formulas:'].every((w) => prompt.includes(w)) && prompt.includes('Pancakes for a crowd'));
  ok('  and told to build what was described, nothing made up', /never made up/.test(prompt));
  const tpl = C.buildDisplayPrompt({ request: req, today: '2026-10-26', guarded: false, template: { name: 'Habit tracker', blocks: S(C.CUSTOM_EXAMPLE).blocks } });
  ok('with their template: its name, its blocks, and to keep its shape', /THEIR TEMPLATE, “Habit tracker”/.test(tpl) && /Keep its blocks — the same kinds, in the same order, with the same labels, units and formulas/.test(tpl) && tpl.includes('"per * servings"'));
  const read = C.readDisplayProposal({ display: { kind: 'custom', state: C.CUSTOM_EXAMPLE }, gaps: [] }, { request: req, said: 'a habit tracker' });
  ok('a draft is read through the kind', read.ok && read.kind === 'custom' && read.state.blocks.length === 4);
  const empty = C.readDisplayProposal({ display: { kind: 'custom', state: { title: 'x', blocks: [] } } }, { request: req, said: '' });
  ok('…and one it cannot hold adds nothing, and says so', !empty.ok && /not a custom artifact the workspace can hold/.test(empty.says));
  const wrong = C.readDisplayProposal({ display: { kind: 'plan', state: { title: 'x', items: [] } } }, { request: req, said: '' });
  ok('a custom artifact asked for and something else returned is not quietly accepted', !wrong.ok);
}

console.log('\n=== Make: "Your own", and their templates ===');
{
  const own = C.makeChoice('custom');
  ok('"Your own" is on the list: describe anything', !!own && own.label === 'Your own' && own.template?.kind === 'custom' && /describe it/i.test(own.about));
  const asked = C.askFor(own, 'a habit tracker for exercise, reading and sleep', true);
  ok('  said in words, read as a custom artifact, opened in Artifacts', asked === 'Make a custom artifact: a habit tracker for exercise, reading and sleep' && C.readDisplayRequest(asked)?.kind === 'custom' && C.routeTurn({ text: asked }).intent === 'visual');
  ok('  nothing typed: made from the conversation', C.askFor(own, '', true) === 'Make a custom artifact from this conversation' && C.readDisplayRequest(C.askFor(own, '', true))?.kind === 'custom');
  const mem = new Map();
  const st = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) };
  let heard = 0;
  const off = C.onTemplates(() => heard++);
  const saved = C.saveTemplate(st, S(C.CUSTOM_EXAMPLE), Date.UTC(2026, 9, 26));
  ok('an artifact saved as a template, under its name', !!saved && saved.saved.name === 'Pancakes for a crowd' && C.readTemplates(st).length === 1 && heard === 1);
  const again = C.saveTemplate(st, { ...S(C.CUSTOM_EXAMPLE), blocks: S(C.CUSTOM_EXAMPLE).blocks.slice(0, 2) }, Date.UTC(2026, 9, 27));
  ok('  saved again under the same name, it replaces the older', C.readTemplates(st).length === 1 && C.readTemplates(st)[0].blocks.length === 2 && again.saved.id === saved.saved.id);
  C.saveTemplate(st, { title: 'Habit tracker', blocks: [{ type: 'list', label: 'Habits', check: true, items: ['Read'] }] }, Date.UTC(2026, 9, 28));
  ok('  the newest first', J(C.readTemplates(st).map((t) => t.name)) === J(['Habit tracker', 'Pancakes for a crowd']));
  const t = C.readTemplates(st)[0];
  const choice = C.templateChoice(t);
  ok('a template is a choice, by its id', C.makeChoice(`tpl:${t.id}`, [choice])?.label === 'Habit tracker' && C.templateOf(`tpl:${t.id}`, C.readTemplates(st))?.name === 'Habit tracker');
  const words = C.askFor(choice, 'piano practice', true);
  ok('  said in words with its name, read as a custom artifact', words === 'Make a custom artifact from my template “Habit tracker”: piano practice' && C.readDisplayRequest(words)?.kind === 'custom' && C.routeTurn({ text: words }).intent === 'visual');
  ok('  and its blocks travel with the message', J(C.templatePayload(t)) === J({ name: 'Habit tracker', blocks: t.blocks }));
  C.removeTemplate(st, t.id);
  ok('removed', J(C.readTemplates(st).map((x) => x.name)) === J(['Pancakes for a crowd']) && heard === 4);
  off();
  mem.set('socria.logos5.templates.v1', '{not json');
  ok('a broken store is no templates, not an error', J(C.readTemplates(st)) === '[]');
  mem.set('socria.logos5.templates.v1', J([{ id: 'tx', name: 'Fake', blocks: [{ type: 'exec', code: 'rm -rf' }] }, { id: 'bad id', name: 'X', blocks: [{ type: 'text', text: 'y' }] }, { id: 'tok', name: 'Kept', blocks: [{ type: 'text', text: 'fine' }] }]));
  ok('a stored template is read back through the kind: one that would not make an artifact is not kept', J(C.readTemplates(st).map((x) => x.name)) === J(['Kept']));
  ok('templates that would make nothing are never saved', C.saveTemplate(st, { title: 'Nothing', blocks: [] }, 1) === null);
  for (let i = 0; i < 30; i++) C.saveTemplate(st, { title: `T${i}`, blocks: [{ type: 'text', text: 'x' }] }, 1000 + i);
  ok(`at most ${C.MAX_TEMPLATES} kept, the newest`, C.readTemplates(st).length === C.MAX_TEMPLATES && C.readTemplates(st)[0].name === 'T29');
}

console.log('\n=== drawn: every primitive, and working ===');
{
  const s = S(KITCHEN);
  const made = C.create(C.EMPTY_SPACE, 'custom', s, { origin: 'socria', name: 'B1' });
  const live = html(h(C.ObjectFigure, { obj: made.obj, at: made.obj.at, mode: 'live', onOp: () => ({ ok: true }) }));
  ok('a text, a checklist (ticks and a count), a way to add', live.includes('Plan the week.') && (live.match(/type="checkbox"/g) ?? []).length >= 3 && /1 of 3/.test(live) && /Add an item/.test(live));
  ok('a table: its headers with units, calc cells worked out, totals under it, a way to add a row', live.includes('Calories') && /is-calc">240</.test(live) && /<tfoot>/.test(live) && live.includes('760') && /\+ Row/.test(live));
  ok('a number on its slider, a value worked out', /type="range"/.test(live) && /This week/.test(live) && live.includes('760 kcal'));
  ok('a bar chart and a pie, each with its words for someone who cannot see it', /role="img" aria-label="Minutes: Mon: 30, Tue: 45, Wed: 20"/.test(live) && /aria-label="Split: Run: 3, Swim: 1"/.test(live) && /dsp-cu-legend/.test(live));
  ok('progress bars, read out', (live.match(/role="progressbar"/g) ?? []).length === 2 && /aria-valuenow="33"/.test(live) && /aria-valuenow="60"/.test(live));
  ok('choices, one picked', /role="radio" aria-checked="true"[^>]*>Fine</.test(live) && /role="radiogroup"/.test(live));
  ok('a field to write in, a timer to start, a group side by side', /<textarea[^>]*placeholder="How did the week feel\?"/.test(live) && /role="timer"/.test(live) && live.includes('1:30') && />Start</.test(live) && /dsp-cu-grid is-2/.test(live));
  ok('"Save as template" in its tools', /aria-label="Save as template"/.test(live));
  const card = html(h(C.ObjectFigure, { obj: made.obj, at: made.obj.at, mode: 'card' }));
  ok('drawn small, it is a picture: nothing to type into, nothing to save', !/<input[^>]*type="range"/.test(card) || /disabled/.test(card));
  const g = html(h(C.MakeGallery, { onPick: () => {} }));
  ok('Make shows "Your own" drawn as one — the example, by its own figure', /data-make="custom"/.test(g) && /data-make="custom"[\s\S]*?class="mkg-figure"[\s\S]*?Pancakes for a crowd/.test(g));
  const mine = [{ id: 'tabc', name: 'Habit tracker', about: 'My week', blocks: S({ title: 'x', blocks: [{ type: 'list', label: 'Habits', check: true, items: ['Read', 'Run'] }] }).blocks, savedAt: 1 }];
  const g2 = html(h(C.MakeGallery, { onPick: () => {}, own: mine }));
  ok('their templates under Yours, each drawn as it was saved, each removable', /class="mkg-sec"[^>]*>Yours/.test(g2) && /data-make="tpl:tabc"/.test(g2) && /data-make="tpl:tabc"[\s\S]*?Habits/.test(g2) && /aria-label="Remove the template “Habit tracker”"/.test(g2));
  ok('none saved, no Yours', !/class="mkg-sec"/.test(g));
}

console.log(`\ncustom-artifacts: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
