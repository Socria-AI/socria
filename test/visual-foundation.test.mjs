// THE DETERMINISTIC VISUALIZATION FOUNDATION — basic things, working every time.
//
// "Chart my monthly spending: rent 1200, food 400, transport 150" could fail
// to make anything: the words were not read as a request at all ("chart" as
// a verb was not one), the extractor was told to DRAW whenever someone says
// chart or plot (so it sketched bars on the maths Plot lens), and every chart
// that was recognised still waited on a second model call to copy the
// numbers into JSON. What is held down here, for each primitive:
//
//   recognition    the request is read from the person's own words — verb
//                  forms, a display named first, "compare X and Y in a
//                  table" — and questions, maths and conversation are not;
//   extraction     what the display holds is read from what they wrote,
//                  exactly: every number as written, every item in order,
//                  every day a real day — and nothing is made up when they
//                  gave nothing (an empty template, said to be empty);
//   computation    unions, notations, calendar weeks and comparisons are
//                  computed, and the kinds' own sanitizers keep every state;
//   editing        direct operations and chat edits change the state, are
//                  undone and redone, and Socria cannot overwrite the
//                  person's own rows;
//   persistence    every display survives a save and a reload unchanged.

import {
  readDisplayRequest,
  makeFromRequest,
  dataFromWords,
  emptyChart,
  readPairs,
  subjectOf,
  checklistFromWords,
  datedFromWords,
  flowFromWords,
  mindFromWords,
  vennFromWords,
  compareFromWords,
  prosConsFromWords,
  decisionTreeFromWords,
  numberLineFromWords,
  readNumberSet,
  unionOf,
  intervalNotation,
  inequalityOf,
  setBuilder,
  lineWindow,
  sealDraft,
  kindOf,
  create,
  apply,
  seek,
  sanitizeSpace,
  currentOf,
  EMPTY_SPACE,
} from './.tmp/index.mjs';
import { readPlotRequest, sameCurve } from './.tmp/plot-words.mjs';
import { calendarMonth, calendarWeek, calendarStart, addMonths } from './.tmp/display-plan.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const TODAY = '2026-10-11';

const made = (said, turns = [said], map = { nodes: [], edges: [] }) => {
  const req = readDisplayRequest(said);
  if (!req) return { req: null, r: null };
  const r = makeFromRequest(req, { said: turns.join('\n'), map, space: EMPTY_SPACE, latest: said, turns, today: TODAY });
  return { req, r };
};
const keeps = (r) => !!r && !('why' in r) && !('open' in r) && !!kindOf(r.kind)?.sanitize(r.state);
const rows = (s) => s.rows.map((r) => r.cells);

// ── P0: the chart that failed ───────────────────────────────────────

{
  const said = 'Chart my monthly spending: rent 1200, food 400, transport 150';
  const req = readDisplayRequest(said);
  ok('P0: "Chart my monthly spending…" is read as a request for a chart', req?.kind === 'data', JSON.stringify(req));
  const { r } = made(said);
  ok('P0: made without a model, from their words', r?.kind === 'data' && r.from === 'words' && r.origin === 'person', JSON.stringify(r));
  ok('P0: every number exactly as written, in order, labelled as written', eq(rows(r.state), [['Rent', 1200], ['Food', 400], ['Transport', 150]]), JSON.stringify(r?.state));
  ok('P0: the numbers are the person’s own (basis given), drawn as bars', r.state.basis === 'given' && r.state.view === 'bar');
  ok('P0: titled from what they said', r.state.title === 'Monthly spending');
  ok('P0: the kind keeps it — and it can draw', keeps(r) && kindOf('data').views.find((v) => v.id === 'bar') && !kindOf('data').sanitize(r.state).rows.some((x) => x.cells[1] === null));
  // the same words make the same chart every time
  const again = Array.from({ length: 20 }, () => made(said).r.state);
  ok('P0: consistent — twenty times, the identical chart', again.every((s) => eq(s, r.state)));
}

// ── recognition ─────────────────────────────────────────────────────

const KIND = [
  ['Chart my spending: rent 1200, food 400, transport 150.', 'data', undefined],
  ['Make a pie chart of these expenses.', 'data', 'pie'],
  ['Plot revenue over six months.', 'data', undefined],
  ['Plot my revenue: Jan 10, Feb 12, Mar 15', 'data', undefined],
  ['pie chart rent 1200 food 400', 'data', 'pie'],
  ['bar chart of rent 1200 food 400', 'data', 'bar'],
  ['Can you chart this for me? rent 1200, food 400', 'data', undefined],
  ['Visualize my spending: rent 1200, food 400', 'data', undefined],
  ['Graph my spending: rent 1200, food 400', 'data', undefined],
  ['Histogram of these scores: 70, 85, 90, 65, 88', 'data', 'histogram'],
  ['Make a table of my grades: math 90, english 85', 'data', undefined],
  ['Turn these notes into a checklist.', 'plan', 'checklist'],
  ['Make a checklist: buy milk, call mom, pay rent', 'plan', 'checklist'],
  ['Checklist: passport, tickets, charger', 'plan', 'checklist'],
  ['Make a calendar of these deadlines.', 'plan', 'calendar'],
  ['Create a timeline: kickoff Jan 5, design Feb 1, launch Mar 15', 'plan', 'timeline'],
  ['Make a kanban board for my tasks', 'plan', 'board'],
  ['Make a flowchart of this process.', 'diagram', 'flow'],
  ['Create a decision tree for whether to launch now or wait', 'diagram', 'decision'],
  ['Make a mind map of photosynthesis', 'diagram', 'mind'],
  ['Make a mind map of my project: design, budget, team, timeline', 'diagram', 'mind'],
  ['Make a concept map of the water cycle', 'diagram', 'concept'],
  ['Make an org chart for my team', 'diagram', 'hierarchy'],
  ['Make a pros and cons chart.', 'crossroads', 'compare'],
  ['Make a pros and cons list for moving to Denver', 'crossroads', 'compare'],
  ['Make a venn diagram of cats and dogs', 'venn', 'venn'],
  ['Compare iPhone and Pixel in a table', 'compare', 'matrix'],
  ['Compare iPhone and Pixel on price, camera and battery', 'compare', 'matrix'],
  ['Make a weighted scoring matrix for three laptops', 'compare', 'matrix'],
  ['Visualize the interval x > 3', 'numberline', 'line'],
  ['Make a number line for x > 3', 'numberline', 'line'],
  ['Graph |x - 1| < 3', 'numberline', 'line'],
  ['visualize x ≠ 2', 'numberline', 'line'],
];
for (const [said, kind, view] of KIND) {
  const r = readDisplayRequest(said);
  const got = r ? r.kind ?? r.kinds.join('|') : null;
  ok(`recognised: "${said}" → ${kind}${view ? `/${view}` : ''}`, (got === kind || (kind === 'data' && r?.kinds.includes('data'))) && (view === undefined || r.view === view), JSON.stringify(r));
}
const NOT = [
  'Graph y = x²',
  'Plot y = x^(2/3)',
  'graph f(x) = sin(x)',
  'Graph y > 2x + 1',
  'solve 2x + 1 > 7',
  'How do I make a pie chart in Excel?',
  'What does a bar chart of rent 1200 food 400 look like?',
  'Table 3 shows that revenue grew',
  'Compare capitalism and socialism',
  'I paid 1200 in rent last month',
  'Plot the trajectory of a ball',
  "Don't make a chart, just tell me: rent 1200, food 400",
  'turn this map into a mind map',
];
for (const said of NOT) ok(`not a display: "${said}"`, readDisplayRequest(said) === null, JSON.stringify(readDisplayRequest(said)));

// ── charts: extraction and numerical correctness ────────────────────

const chart = (said, o = {}) => dataFromWords(said, o)?.state ?? null;
{
  let s = chart('Make a pie chart of these expenses: rent $1,200, food $400, transport $150', { view: 'pie' });
  ok('chart: currency read, the unit kept, thousands grouped', eq(rows(s), [['Rent', 1200], ['Food', 400], ['Transport', 150]]) && s.columns[1].unit === '$' && s.view === 'pie');
  s = chart('Plot my revenue: Jan 10, Feb 12, Mar 15');
  ok('chart: month labels run in time — a line, the column named Month', s.view === 'line' && s.columns[0].name === 'Month' && eq(rows(s), [['Jan', 10], ['Feb', 12], ['Mar', 15]]));
  s = chart('chart rent 1200 food 400 transport 150');
  ok('chart: no commas, no colon — still every pair, and the label is not the title', eq(rows(s), [['Rent', 1200], ['Food', 400], ['Transport', 150]]) && s.title === 'Your numbers');
  s = chart('I spent 1200 on rent and 400 on food and 150 on transport, chart it');
  ok('chart: "1200 on rent" — the label after the number', eq(rows(s), [['Rent', 1200], ['Food', 400], ['Transport', 150]]));
  s = chart('Make a bar chart of profit: north -50, south 120, east 30', { view: 'bar' });
  ok('chart: a negative number kept negative', eq(rows(s), [['North', -50], ['South', 120], ['East', 30]]));
  ok('chart: a pie of it is refused with the reason (a negative value)', /negative/.test(String(kindOf('data').ops.view.check(s, { view: 'pie' }, { by: 'person' }))));
  s = chart('Chart my budget: rent 40%, food 25%, savings 35%');
  ok('chart: percentages read as numbers, the unit %', s.columns[1].unit === '%' && eq(rows(s).map((r) => r[1]), [40, 25, 35]));
  s = chart('Revenue was 1.2k in Jan, 1.5k in Feb');
  ok('chart: 1.2k is 1200', eq(rows(s), [['Jan', 1200], ['Feb', 1500]]));
  s = chart('Graph sales by year: 2019 100, 2020 150, 2021 175');
  ok('chart: a year labels a number', eq(rows(s), [['2019', 100], ['2020', 150], ['2021', 175]]) && s.columns[0].name === 'Year' && s.view === 'line');
  s = chart('Chart Q1 100, Q2 120, Q3 90, Q4 140');
  ok('chart: "Q1" is a label, never the number 1', eq(rows(s), [['Q1', 100], ['Q2', 120], ['Q3', 90], ['Q4', 140]]));
  s = chart('Chart my sleep: Mon 7 hours, Tue 6.5 hours, Wed 8 hours');
  ok('chart: a unit word read, decimals kept', s.columns[1].unit === 'hours' && eq(rows(s).map((r) => r[1]), [7, 6.5, 8]));
  s = chart('Chart: Jan: sales 10, costs 5; Feb: sales 12, costs 6; Mar: sales 15, costs 7');
  ok('chart: grouped numbers — one row a month, one column a series', eq(s.columns.map((c) => c.name), ['Month', 'Sales', 'Costs']) && eq(rows(s), [['Jan', 10, 5], ['Feb', 12, 6], ['Mar', 15, 7]]) && s.y.length === 2);
  s = chart('Make a chart from this:\nMonth,Sales,Costs\nJan,10,5\nFeb,12,6\nMar,15,7');
  ok('chart: a pasted CSV read as a table', eq(rows(s), [['Jan', 10, 5], ['Feb', 12, 6], ['Mar', 15, 7]]) && s.basis === 'given');
  s = chart('Chart this:\n| Month | Sales |\n|---|---|\n| Jan | 10 |\n| Feb | 12 |\n| Mar | 15 |');
  ok('chart: a pasted pipe table read as a table', eq(rows(s), [['Jan', 10], ['Feb', 12], ['Mar', 15]]));
  s = chart('Histogram of these scores: 70, 85, 90, 65, 88', { view: 'histogram' });
  ok('chart: bare numbers for a histogram — one column, every value', s.view === 'histogram' && eq(rows(s).map((r) => r[0]), [70, 85, 90, 65, 88]));
  s = chart('chart rent 1200 rent 1250');
  ok('chart: a label written twice is two rows, not a guess', eq(rows(s), [['Rent', 1200], ['Rent', 1250]]));
  s = chart('Make a pie chart of these expenses.', { view: 'pie', earlier: ['rent 1200, food 400, transport 150', 'Make a pie chart of these expenses.'] });
  ok('chart: "these expenses" — read from what they said before', eq(rows(s), [['Rent', 1200], ['Food', 400], ['Transport', 150]]) && s.view === 'pie');
  ok('chart: without pointing back, an earlier message is not taken', dataFromWords('Make a bar chart of my spending from last month', { earlier: ['rent 1200, food 400'] }) === null);
  ok('pairs: nothing labelled in plain prose', readPairs('I have no idea').pairs.length === 0);
  ok('subject: "Chart my monthly spending" → Monthly spending', subjectOf('Chart my monthly spending') === 'Monthly spending');
}

// missing data: never made up
{
  const { r } = made('Plot revenue over six months.');
  ok('missing: no numbers → an empty line chart, six rows, nothing in them', r?.kind === 'data' && r.state.view === 'line' && r.state.rows.length === 6 && r.state.rows.every((x) => x.cells.every((c) => c === null)), JSON.stringify(r));
  ok('missing: it says so, in a sentence', /nothing was made up/.test(r.says));
  ok('missing: the template is one the kind keeps', keeps(r));
  const e = emptyChart('Make me a bar chart of my grades');
  ok('missing: no period named → three empty rows, a bar chart', e.state.rows.length === 3 && e.state.view === 'bar' && e.empty);
  // numbers it cannot read plainly (prose without labels) are left to the drafted path — not made empty
  const prose = made('Make a bar chart of my spending from last month', ['Last month rent was 1,200, food 400 and transport 150.', 'Make a bar chart of my spending from last month']);
  ok('missing: numbers elsewhere in the conversation go to the drafted path, sealed there', prose.r === null);
}

// ── P1 makers ───────────────────────────────────────────────────────

{
  let { r } = made('Make a checklist: buy milk, call mom, pay rent');
  ok('checklist: every item, in order, as theirs', r?.kind === 'plan' && r.state.view === 'checklist' && eq(r.state.items.map((i) => i.text), ['Buy milk', 'Call mom', 'Pay rent']) && r.state.items.every((i) => i.by === 'person') && keeps(r));
  ({ r } = made('Turn these notes into a checklist.', ['Notes: book venue\n- send invites\n- order cake\n- buy decorations', 'Turn these notes into a checklist.']));
  ok('checklist: "these notes" — the bulleted list said just before', eq(r?.state.items.map((i) => i.text), ['Send invites', 'Order cake', 'Buy decorations']), JSON.stringify(r?.state));
  const fromMap = made('Turn this map into a checklist', ['Turn this map into a checklist'], { nodes: [{ id: 'a', label: 'Collect data' }, { id: 'b', label: 'Write it up' }], edges: [{ from: 'a', to: 'b', relation: 'precedes' }] });
  ok('checklist: "this map" — still made from the map', fromMap.r?.from === 'map' && fromMap.r.state.items.length === 2);
  ({ r } = made('Create a timeline: kickoff Jan 5, design Feb 1 - Feb 10, launch Mar 15'));
  ok('timeline: every day a real calendar day, after today', eq(r?.state.items.map((i) => [i.text, i.date, i.end ?? null]), [['Kickoff', '2027-01-05', null], ['Design', '2027-02-01', '2027-02-10'], ['Launch', '2027-03-15', null]]), JSON.stringify(r?.state.items));
  ({ r } = made('Make a calendar of these deadlines.', ['essay due Oct 20, quiz on Oct 22, project Nov 3', 'Make a calendar of these deadlines.']));
  ok('calendar: the deadlines said before, on their days, as a calendar', r?.state.view === 'calendar' && eq(r.state.items.map((i) => [i.text, i.date]), [['Essay', '2026-10-20'], ['Quiz', '2026-10-22'], ['Project', '2026-11-03']]), JSON.stringify(r?.state));
  ok('calendar: the kind keeps a calendar view', keeps(r) && kindOf('plan').sanitize(r.state).view === 'calendar');
  ({ r } = made('Make a flowchart: wake up -> shower -> breakfast -> leave'));
  ok('flowchart: the steps, chained in order, nothing between them', r?.state.view === 'flow' && r.state.nodes.length === 4 && eq(r.state.edges.map((e) => [e.from, e.to]), [['n1', 'n2'], ['n2', 'n3'], ['n3', 'n4']]) && keeps(r));
  ({ r } = made('Make a flowchart of signing up: first open the app, then enter an email, then confirm it'));
  ok('flowchart: "first …, then …" read as steps', eq(r?.state.nodes.map((n) => n.label), ['Open the app', 'Enter an email', 'Confirm it']));
  ok('flowchart: with no steps written, it is drafted — not invented here', made('Make a flowchart of this process.').r === null);
  ({ r } = made('Make a mind map of my project: design, budget, team, timeline'));
  ok('mind map: the subject at the centre, their branches round it', r?.state.view === 'mind' && r.state.nodes[0].label === 'Project' && r.state.nodes.length === 5 && r.state.edges.every((e) => e.from === 'n1') && keeps(r), JSON.stringify(r?.state));
  ({ r } = made('Make a venn diagram of cats and dogs'));
  ok('venn: two sets named as said, empty, and said to be empty', r?.state.sets.length === 2 && r.state.elements.length === 0 && /nothing is in them yet/.test(r.says) && keeps(r));
  ({ r } = made('Venn diagram: cats: fur, whiskers, purr; dogs: fur, bark, whiskers'));
  const shared = r?.state.elements.filter((e) => e.sets.length === 2).map((e) => e.label).sort();
  ok('venn: an element under both sets sits in both — the overlap computed', eq(shared, ['Fur', 'Whiskers']) && r.state.elements.length === 4);
  ({ r } = made('Compare iPhone and Pixel on price, camera and battery'));
  ok('compare: the options and criteria named, every weight even, no score given', eq(r?.state.options.map((o) => o.name.toLowerCase()), ['iphone', 'pixel']) && eq(r.state.criteria.map((c) => [c.name, c.weight]), [['Price', 5], ['Camera', 5], ['Battery', 5]]) && r.state.scores.length === 0 && keeps(r), JSON.stringify(r?.state));
  ok('compare: without criteria, it is drafted (and sealed)', made('Compare iPhone and Pixel in a table').r === null);
  ({ r } = made('Pros and cons of moving to Denver. Pros: cheaper rent, mountains; cons: far from family, cold winters'));
  const notes = r?.state.notes ?? [];
  ok('pros and cons: the option and not doing it, their pros and cons filed under it', r?.kind === 'crossroads' && r.state.alternatives.length === 2 && eq(notes.filter((n) => n.kind === 'pro').map((n) => n.text), ['Cheaper rent', 'Mountains']) && eq(notes.filter((n) => n.kind === 'con').map((n) => n.text), ['Far from family', 'Cold winters']));
  const kept = kindOf('crossroads').sanitize(r.state);
  ok('pros and cons: nothing decided, nothing weighed or rated', kept && !kept.decided && kept.ratings.length === 0);
  ({ r } = made('Create a decision tree for whether to launch now or wait'));
  ok('decision tree: the decision at the root, a branch per option, no chances or payoffs invented', r?.state.view === 'decision' && r.state.nodes.length === 3 && r.state.edges.every((e) => e.prob === undefined) && r.state.nodes.every((n) => n.value === undefined) && keeps(r));
}

// ── a drafted comparison is sealed: scores are the person's ─────────

{
  const draft = {
    title: 'Laptops', view: 'matrix',
    options: [{ id: 'a', name: 'Air' }, { id: 'b', name: 'XPS' }],
    criteria: [{ id: 'p', name: 'Price', weight: 9 }, { id: 'w', name: 'Weight', weight: 5 }],
    scores: [{ option: 'a', criterion: 'p', value: 7, note: '$999' }, { option: 'b', criterion: 'p', value: 6 }, { option: 'a', criterion: 'w', value: null, note: 'light' }],
  };
  const sealed = sealDraft('compare', kindOf('compare').sanitize(draft), 'Compare the Air and the XPS for me');
  const sc = sealed.state.scores;
  ok('seal: a score they never gave is emptied', !sc.some((x) => x.value !== null));
  ok('seal: a figure they never gave is dropped from the note; their words stay', !sc.some((x) => /999/.test(x.note ?? '')) && sc.some((x) => x.note === 'light'));
  ok('seal: a weight they never gave is reset to even', sealed.state.criteria.every((c) => c.weight === 5));
  ok('seal: and the person is told', sealed.gaps.length === 1);
  const theirs = sealDraft('compare', kindOf('compare').sanitize(draft), 'Compare the Air and the XPS. I give the Air a 7 on price; price matters 9.');
  ok('seal: a score and a weight they did give stay', theirs.state.scores.some((x) => x.value === 7) && theirs.state.criteria.find((c) => c.name === 'Price').weight === 9);
}

// ── the number line ────────────────────────────────────────────────

{
  const nl = (t) => {
    const s = numberLineFromWords(t);
    if (!s) return null;
    const u = unionOf(s);
    return [intervalNotation(u), inequalityOf(u, s.variable), setBuilder(u, s.variable)];
  };
  ok('number line: x > 3', eq(nl('Visualize the interval x > 3'), ['(3, ∞)', 'x > 3', '{ x | x > 3 }']));
  ok('number line: chained, closed then open', eq(nl('show -2 <= x < 5')?.[0], '[−2, 5)'));
  ok('number line: a union, and a single value', eq(nl('Show -2 <= x < 5 or x = 7 on a number line')?.[0], '[−2, 5) ∪ {7}'));
  ok('number line: "and" intersects', eq(nl('show x > 1 and x < 4')?.[0], '(1, 4)'));
  ok('number line: |x − 1| < 3', eq(nl('Graph |x - 1| < 3')?.[0], '(−2, 4)'));
  ok('number line: |x| ≥ 2 is two rays', eq(nl('show |x| >= 2')?.[0], '(−∞, −2] ∪ [2, ∞)'));
  ok('number line: x ≠ 2', eq(nl('visualize x ≠ 2')?.[0], '(−∞, 2) ∪ (2, ∞)'));
  ok('number line: interval notation in, with infinity', eq(nl('Visualize (-inf, 3] U [6, 8)')?.[0], '(−∞, 3] ∪ [6, 8)'));
  ok('number line: 3 < x reads as x > 3', eq(nl('show 3 < x')?.[1], 'x > 3'));
  ok('number line: fractions', eq(nl('show x < 1/2')?.[0], '(−∞, 0.5)'));
  ok('number line: overlapping pieces merge, touching closed ends join', intervalNotation(unionOf({ intervals: [{ lo: 0, hi: 3, loOpen: false, hiOpen: false }, { lo: 3, hi: 5, loOpen: true, hiOpen: true }, { lo: 4, hi: 9, loOpen: false, hiOpen: true }], points: [] })) === '[0, 9)');
  ok('number line: two open ends at one value do not join', intervalNotation(unionOf({ intervals: [{ lo: 0, hi: 3, loOpen: false, hiOpen: true }, { lo: 3, hi: 5, loOpen: true, hiOpen: false }], points: [] })) === '[0, 3) ∪ (3, 5]');
  ok('number line: a value at an open end closes it', intervalNotation(unionOf({ intervals: [{ lo: 0, hi: 3, loOpen: false, hiOpen: true }], points: [{ x: 3 }] })) === '[0, 3]');
  ok('number line: an empty intersection is empty', readNumberSet('x > 5 and x < 2')?.intervals.length === 0);
  ok('number line: a set with two variables is not read', readNumberSet('x > 1 or y < 2') === null);
  ok('number line: "y > 2x + 1" is not a number line', numberLineFromWords('Graph y > 2x + 1') === null);
  const w = lineWindow(numberLineFromWords('show -2 <= x < 5'));
  ok('number line: the window holds every end, with room', w.lo < -2 && w.hi > 5 && w.ticks.includes(0));
  // direct editing, undo and redo
  let sp = create(EMPTY_SPACE, 'numberline', numberLineFromWords('Visualize the interval x > 3'), { origin: 'person', name: 'N1' }).space;
  const id = sp.objs[0].id;
  const i1 = currentOf(sp.objs[0]).intervals[0].id;
  let a = apply(sp, id, 'open', { id: i1, side: 'lo', open: 'toggle' }, { by: 'person' });
  ok('number line: click an end — included now', a.ok && intervalNotation(unionOf(currentOf(a.obj))) === '[3, ∞)');
  sp = a.space;
  a = apply(sp, id, 'end', { id: i1, side: 'lo', value: 1.5 }, { by: 'person' });
  ok('number line: drag an end — it moves', a.ok && intervalNotation(unionOf(currentOf(a.obj))) === '[1.5, ∞)');
  sp = a.space;
  ok('number line: an infinite end cannot be included', !apply(sp, id, 'open', { id: i1, side: 'hi', open: 'toggle' }, { by: 'person' }).ok);
  const two = apply(sp, id, 'add', { text: 'x < -1', by: 'person' }, { by: 'person' });
  ok('number line: add a piece by writing it', two.ok && intervalNotation(unionOf(currentOf(two.obj))) === '(−∞, −1) ∪ [1.5, ∞)');
  ok('number line: a left end past the right end is refused', !apply(two.space, id, 'end', { id: currentOf(two.obj).intervals[0].id, side: 'hi', value: 0 }, { by: 'person' }).ok);
  const back = seek(two.space, id, 1);
  ok('number line: undo — back a step', intervalNotation(unionOf(currentOf(back.objs[0]))) === '[3, ∞)');
  const fwd = seek(back, id, 3);
  ok('number line: redo — forward again', intervalNotation(unionOf(currentOf(fwd.objs[0]))) === '(−∞, −1) ∪ [1.5, ∞)');
  const k = kindOf('numberline');
  ok('number line: "include 3" read from the chat', eq(k.readOp('exclude 1.5', currentOf(two.obj)), { op: 'open', args: { id: i1, side: 'lo', open: 'yes' } }));
  ok('number line: "add x = 7" read from the chat', k.readOp('add x = 7', currentOf(two.obj))?.op === 'add');
  ok('number line: its facts are what is computed', k.facts(currentOf(two.obj), { guarded: false }).some((f) => /\(−∞, −1\) ∪ \[1\.5, ∞\)/.test(f)));
  const empty = made('Make a number line').r;
  ok('number line: asked for with no set — opens empty, and says what to write', empty?.kind === 'numberline' && keeps(empty) && /Write the inequality/.test(empty.says));
}

// ── the calendar ───────────────────────────────────────────────────

{
  const plan = kindOf('plan').sanitize({ title: 'Deadlines', view: 'calendar', items: [{ id: 'a', text: 'Essay', date: '2026-10-20' }, { id: 'b', text: 'Trip', date: '2026-10-30', end: '2026-11-02' }, { id: 'c', text: 'No day' }], links: [] });
  const weeks = calendarMonth(plan, '2026-10');
  ok('calendar: October 2026 is five weeks, Sunday first, from Sep 27', weeks.length === 5 && weeks[0][0].day === '2026-09-27' && weeks[0][4].day === '2026-10-01' && weeks.every((w) => w.length === 7));
  ok('calendar: neighbours’ days fill the grid, marked outside the month', !weeks[0][0].inside && weeks[0][4].inside);
  const on = (day) => weeks.flat().find((c) => c.day === day)?.items ?? [];
  ok('calendar: an item on its day', eq(on('2026-10-20'), ['a']));
  ok('calendar: an item with an end on every day it covers', eq(on('2026-10-30'), ['b']) && eq(on('2026-10-31'), ['b']));
  ok('calendar: opens on the next dated item’s month', calendarStart(plan, '2026-10-11') === '2026-10' && calendarStart(plan, '2026-12-01') === '2026-10');
  ok('calendar: months step across a year', addMonths('2026-12', 1) === '2027-01' && addMonths('2026-01', -1) === '2025-12');
  ok('calendar: a week, Sunday to Saturday', eq(calendarWeek(plan, '2026-11-01').map((c) => c.day), ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07']));
  ok('calendar: "show it as a calendar" read from the chat', kindOf('plan').readOp('show it as a calendar', kindOf('plan').sanitize({ ...plan, view: 'list' }))?.args?.view === 'calendar');
  // moving an item to another day keeps its length (the drag is `shift`)
  let sp = create(EMPTY_SPACE, 'plan', plan, { origin: 'person', name: 'P1' }).space;
  const a = apply(sp, sp.objs[0].id, 'shift', { id: 'b', days: 2 }, { by: 'person' });
  ok('calendar: a dragged item keeps its length', a.ok && eq([currentOf(a.obj).items[1].date, currentOf(a.obj).items[1].end], ['2026-11-01', '2026-11-04']));
}

// ── editing a chart: direct, by chat, undo, and the person’s rows stay theirs ─

{
  const { r } = made('Chart my monthly spending: rent 1200, food 400, transport 150');
  let sp = create(EMPTY_SPACE, 'data', r.state, { origin: 'person', name: 'T1' }).space;
  const id = sp.objs[0].id;
  const k = kindOf('data');
  const said = k.readOp('set food to 450', currentOf(sp.objs[0]));
  ok('chat edit: "set food to 450" read as a cell', said?.op === 'cell' && said.args.value === 450, JSON.stringify(said));
  let a = apply(sp, id, said.op, said.args, { by: 'person' });
  ok('chat edit: applied — the bar follows', a.ok && rows(currentOf(a.obj))[1][1] === 450);
  sp = a.space;
  ok('human edits: Socria cannot overwrite the person’s row', !apply(sp, id, 'cell', { row: 1, col: 'c2', value: 999, by: 'socria' }, { by: 'socria' }).ok);
  a = apply(sp, id, 'view', { view: 'pie' }, { by: 'person' });
  ok('direct edit: shown as a pie, the numbers unchanged', a.ok && currentOf(a.obj).view === 'pie' && rows(currentOf(a.obj))[0][1] === 1200);
  sp = a.space;
  const undone = seek(sp, id, 1);
  ok('undo: back to bars, food still 450', currentOf(undone.objs[0]).view === 'bar' && rows(currentOf(undone.objs[0]))[1][1] === 450);
  ok('undo: back to the start — food 400 as written', rows(currentOf(seek(sp, id, 0).objs[0]))[1][1] === 400);
}

// ── persistence: every display survives a save and a reload unchanged ─

{
  const asks = [
    'Chart my monthly spending: rent 1200, food 400, transport 150',
    'Make a checklist: buy milk, call mom, pay rent',
    'Create a timeline: kickoff Jan 5, design Feb 1 - Feb 10, launch Mar 15',
    'Make a flowchart: wake up -> shower -> breakfast -> leave',
    'Make a mind map of my project: design, budget, team, timeline',
    'Venn diagram: cats: fur, whiskers, purr; dogs: fur, bark, whiskers',
    'Compare iPhone and Pixel on price, camera and battery',
    'Pros and cons of moving to Denver. Pros: cheaper rent; cons: far from family',
    'Create a decision tree for whether to launch now or wait',
    'Visualize the interval x > 3',
  ];
  let sp = EMPTY_SPACE;
  for (const said of asks) {
    const { r } = made(said);
    const c = create(sp, r.kind, r.state, { origin: 'person' });
    ok(`persist: made — ${said.slice(0, 40)}`, !!c);
    if (c) sp = c.space;
  }
  const back = sanitizeSpace(JSON.parse(JSON.stringify(sp)));
  ok('persist: a reload keeps every display, state for state', back && back.objs.length === asks.length && back.objs.every((o, i) => eq(o.states, sp.objs[i].states)));
}

// ── a function plot, read from the words ─────────────────────────────

{
  ok('plot: "Graph y = x²"', readPlotRequest('Graph y = x²')?.expr === 'x²');
  ok('plot: "Plot y = x^(2/3)"', readPlotRequest('Plot y = x^(2/3)')?.expr === 'x^(2/3)');
  ok('plot: a window given is kept', eq(readPlotRequest('plot y = x^(2/3) from -8 to 8')?.view, { xMin: -8, xMax: 8 }));
  ok('plot: two curves at once', eq(readPlotRequest('Graph sin(x) and cos(x)')?.more, ['cos(x)']));
  ok('plot: a parameter it does not know is not invented', readPlotRequest('Graph y = a x^2') === null);
  ok('plot: an inequality is not a curve', readPlotRequest('Graph x > 3') === null);
  ok('plot: a chart of spending is not a function', readPlotRequest('graph my spending: rent 1200') === null);
  ok('plot: the same curve written two ways is the same', sameCurve('x^2', 'x²') && sameCurve('x*x', 'x^2') && !sameCurve('x^(2/3)', 'x^2'));
}

console.log(`visual foundation: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
