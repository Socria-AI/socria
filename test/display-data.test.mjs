// A CHART OF THE PERSON'S NUMBERS — Logos 3.5's data display.
//
// What is held down here: the table is canonical and survives a save; a
// missing value stays empty and nothing is guessed; which views can draw is
// computed from the columns, with a reason for each that cannot; a bar's axis
// always includes zero and a NEGATIVE value hangs BELOW the baseline (a
// regression we must never ship); pie shares add up to 1 and a pie refuses
// negatives; histogram bins are hand-checked, edges included; statistics skip
// empty cells and say how many; CSV import reads commas, currency and dates;
// every edit is an operation, computed and undoable; the person's rows are
// theirs; example numbers stay labelled as examples; and words become
// operations only when they plainly name something in THIS table.

import { apply, create, currentOf, kindOf, sanitizeSpace, seek, EMPTY_SPACE } from './.tmp/index.mjs';
import {
  sanitizeData,
  readDataOp,
  availability,
  viewUnavailable,
  bindingsFor,
  linearScale,
  scaleAt,
  dateTicks,
  dayNumber,
  barLayout,
  pieLayout,
  histogramBins,
  histogramOf,
  histogramLayout,
  heatScale,
  heatPosition,
  heatColour,
  heatmapLayout,
  xyLayout,
  summarize,
  columnStats,
  dataFromCSV,
  csvOverflow,
  readNumber,
  fmtNum,
  displayOrder,
  sturges,
  niceCeil,
  DATA_LIMITS,
} from './.tmp/display-data.mjs';
import { stableKey } from './.tmp/display-base.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const near = (a, b, tol = 1e-9) => Math.abs(a - b) < tol;
const J = (v) => JSON.stringify(v);

const TODAY = '2026-10-10'; // a Saturday

// "Chart my rent and bills" — the person's own numbers
const bills = {
  title: 'Rent and bills',
  basis: 'given',
  view: 'table',
  columns: [
    { id: 'c1', name: 'Month', type: 'text', by: 'person' },
    { id: 'c2', name: 'Rent', type: 'number', unit: '$', by: 'person' },
    { id: 'c3', name: 'Utilities', type: 'number', unit: '$', by: 'person' },
  ],
  rows: [
    { cells: ['January', 1200, 310], by: 'person' },
    { cells: ['February', 1200, 280], by: 'person' },
    { cells: ['March', 1150, null], by: 'person' },
  ],
};

// what the display pass might propose to show a chart: example numbers, Socria's
const sample = {
  title: 'Monthly change',
  basis: 'illustrative',
  columns: [
    { id: 'c1', name: 'Month', type: 'text' },
    { id: 'c2', name: 'Change', type: 'number' },
  ],
  rows: [['Jan', 5], ['Feb', -3], ['Mar', 2]],
};

console.log('=== the state is canonical and checked ===');
{
  const s = sanitizeData(bills);
  ok('a table is read', !!s && s.columns.length === 3 && s.rows.length === 3);
  ok('  the same state read twice is the same state', stableKey(sanitizeData(s)) === stableKey(s));
  ok('  and survives being saved and reopened', stableKey(sanitizeData(JSON.parse(JSON.stringify(s)))) === stableKey(s));
  ok('  a missing value stays empty, not 0', s.rows[2].cells[2] === null);
  ok('  the person’s rows and columns are marked theirs', s.rows.every((r) => r.by === 'person') && s.columns.every((c) => c.by === 'person'));
  const bad = sanitizeData({
    title: 'x'.repeat(300),
    columns: [
      { id: 'a', name: 'When', type: 'date' },
      { id: 'a', name: 'n'.repeat(90), type: 'number', unit: 'dollars per month' },
      { name: '', type: 'weird' },
      null,
      { id: 'z', name: 'Kept after a hole', type: 'number' },
    ],
    rows: [
      ['2026-02-30', 'abc', 'x'.repeat(200), 'ignored', 7],
      ['2026-02-28', Infinity, 'ok', 'ignored', '1,250'],
      ['2026-03-01', NaN, '', 'ignored', '$15'],
      'not a row',
    ],
    x: 'nowhere',
    y: ['a', 'a', 'nowhere'],
    bins: 99,
    sort: { col: 'nowhere', dir: 'up' },
  });
  ok('an impossible date is empty, not guessed', bad.rows[0].cells[0] === null && bad.rows[1].cells[0] === '2026-02-28');
  ok('a number cell holds a finite number or nothing', bad.rows[0].cells[1] === null && bad.rows[1].cells[1] === null && bad.rows[2].cells[1] === null);
  ok('a duplicate column id is renumbered', new Set(bad.columns.map((c) => c.id)).size === bad.columns.length);
  ok('a column with no name gets a placeholder, and a strange type is text', bad.columns[2].name === 'Column 3' && bad.columns[2].type === 'text');
  ok('names and units are capped', bad.columns[1].name.length <= DATA_LIMITS.name && bad.columns[1].unit.length <= DATA_LIMITS.unit);
  ok('a text cell is capped, and an empty one is empty', bad.rows[0].cells[2].length <= DATA_LIMITS.text && bad.rows[2].cells[2] === null);
  ok('a hole in the columns does not shift the cells after it', bad.columns[3].name === 'Kept after a hole' && bad.rows[0].cells[3] === 7 && bad.rows[1].cells[3] === 1250 && bad.rows[2].cells[3] === 15);
  ok('a row that is not a row is not kept', bad.rows.length === 3);
  ok('bindings to nothing, an impossible bin count and a broken sort are dropped', bad.x === undefined && J(bad.y) === J(['a']) && bad.bins === undefined && bad.sort === undefined);
  ok('a title is capped', bad.title.length <= DATA_LIMITS.title);
  const many = sanitizeData({ columns: Array.from({ length: 20 }, (_, i) => ({ name: `C${i}`, type: 'number' })), rows: Array.from({ length: 300 }, (_, i) => [i]) });
  ok(`at most ${DATA_LIMITS.columns} columns and ${DATA_LIMITS.rows} rows`, many.columns.length === DATA_LIMITS.columns && many.rows.length === DATA_LIMITS.rows);
  ok('a row written by column name is read', sanitizeData({ columns: [{ name: 'Month' }, { name: 'Rent', type: 'number' }], rows: [{ Month: 'Jan', Rent: '1,200' }] }).rows[0].cells[1] === 1200);
  ok('unsaid, numbers are examples — never assumed to be the person’s', sanitizeData({ columns: [{ name: 'A' }] }).basis === 'illustrative');
  ok('a table opens as bars when it has labels and numbers', sanitizeData({ ...bills, view: undefined }).view === 'bar');
  ok('  and as a line when it is a time series', sanitizeData({ columns: [{ name: 'Day', type: 'date' }, { name: 'Steps', type: 'number' }], rows: [['2026-10-01', 5000], ['2026-10-02', 7000]] }).view === 'line');
  ok('a table with no rows yet is a table', sanitizeData({ columns: [{ name: 'A' }], rows: [] })?.rows.length === 0);
  ok('junk is not a table', sanitizeData(null) === null && sanitizeData('data') === null && sanitizeData({}) === null && sanitizeData({ columns: [] }) === null);
}

console.log('\n=== numbers as people write them ===');
{
  ok('plain, grouped, currency, signs, percent, brackets', readNumber('1200') === 1200 && readNumber('1,200') === 1200 && readNumber('$1,200.50') === 1200.5 && readNumber('-3') === -3 && readNumber('−3') === -3 && readNumber('12%') === 12 && readNumber('(45)') === -45 && readNumber('-$5') === -5);
  ok('not numbers: badly grouped, words, blanks, a double negative', readNumber('1,2,3') === null && readNumber('twelve') === null && readNumber('') === null && readNumber('(-5)') === null && readNumber(NaN) === null);
  ok('stored without float noise', readNumber(0.1 + 0.2) === 0.3);
  ok('said without float noise or a locale', fmtNum(1234567.891) === '1,234,567.89' && fmtNum(-0.5) === '-0.5' && fmtNum(2) === '2' && fmtNum(1e-12) === '0');
}

console.log('\n=== which views can draw, and why the others cannot ===');
{
  const s = sanitizeData(bills);
  const av = availability(s);
  ok('a table always draws', av.table === null);
  ok('bars and a pie: labels and numbers', av.bar === null && av.pie === null);
  ok('a scatter: two number columns', av.scatter === null);
  ok('a histogram: a number column with two values or more', av.histogram === null);
  ok('a heatmap needs two label columns, and says so', /two columns of labels/.test(av.heatmap ?? ''));
  const words = sanitizeData({ columns: [{ name: 'Name' }, { name: 'Note' }], rows: [['a', 'b']] });
  ok('words alone draw no bars, no line, no scatter, no histogram — each with a reason', /column of numbers/.test(viewUnavailable(words, 'bar')) && /numbers or dates/.test(viewUnavailable(words, 'line')) && /two columns of numbers/.test(viewUnavailable(words, 'scatter')) && /column of numbers/.test(viewUnavailable(words, 'histogram')));
  const neg = sanitizeData(sample);
  ok('a pie refuses a negative value, and says where it is', /negative.*Change.*-3.*row 2/.test(viewUnavailable(neg, 'pie')), viewUnavailable(neg, 'pie'));
  ok('  while bars draw it', viewUnavailable(neg, 'bar') === null);
  ok('a pie of nothing but zeros has nothing to share out', /add up to 0/.test(viewUnavailable(sanitizeData({ columns: [{ name: 'L' }, { name: 'V', type: 'number' }], rows: [['a', 0], ['b', 0]] }), 'pie')));
  const one = sanitizeData({ columns: [{ name: 'V', type: 'number' }], rows: [[3], [null]] });
  ok('one value is not a distribution', /at least two values.*has one/.test(viewUnavailable(one, 'histogram')));
  const time = sanitizeData({ columns: [{ name: 'Day', type: 'date' }, { name: 'Steps', type: 'number' }], rows: [['2026-10-01', 5000]] });
  ok('a line: an x column of dates (or numbers) and numbers', viewUnavailable(time, 'line') === null && bindingsFor(time, 'line').x.name === 'Day');
  const grid = sanitizeData({ columns: [{ name: 'Day', type: 'category' }, { name: 'Slot', type: 'category' }, { name: 'Visits', type: 'number' }], rows: [['Mon', 'am', 3]] });
  ok('a heatmap: two label columns and a number column', viewUnavailable(grid, 'heatmap') === null);
  ok('the view declared unavailable says the same reason', kindOf('data').views.find((v) => v.id === 'pie').unavailable(neg) === viewUnavailable(neg, 'pie'));
  ok('bindings that suit a view are used; ones that do not fall back to its defaults', bindingsFor({ ...s, y: ['c3'] }, 'bar').y[0].id === 'c3' && bindingsFor({ ...s, x: 'c2' }, 'bar').x.id === 'c1');
}

console.log('\n=== the axes ===');
{
  const bars = linearScale([1150, 1200, 310], { zero: true });
  ok('a bar axis always includes zero', bars.lo === 0 && bars.ticks[0] === 0 && bars.ticks.includes(0));
  ok('  and covers every value with round ticks', bars.hi >= 1200 && bars.ticks.every((t, i) => i === 0 || near(t - bars.ticks[i - 1], bars.step)));
  const neg = linearScale([5, -3, 2], { zero: true });
  ok('…negative values too: ticks −4 … 6 through 0', J(neg.ticks) === J([-4, -2, 0, 2, 4, 6]), J(neg.ticks));
  const lineAxis = linearScale([1150, 1200]);
  ok('a line axis is not forced to zero', lineAxis.lo > 0 && lineAxis.lo <= 1150 && lineAxis.hi >= 1200, J(lineAxis));
  ok('all-negative bars still reach zero', linearScale([-5, -2], { zero: true }).hi === 0);
  ok('counts tick in whole numbers', linearScale([0, 1, 2], { zero: true, integer: true }).ticks.every(Number.isInteger));
  ok('a single value still makes an axis', linearScale([7]).lo < 7 && linearScale([7]).hi > 7 && linearScale([0], { zero: true }).hi === 1);
  ok('where a value sits on an axis', scaleAt({ lo: -4, hi: 6 }, 0) === 0.4);
  const year = dateTicks('2026-01-01', '2026-12-31');
  ok('a year of dates ticks by quarter, labelled without a locale', J(year.map((t) => t.label)) === J(['Jan 2026', 'Apr 2026', 'Jul 2026', 'Oct 2026']), J(year));
  const week = dateTicks('2026-10-01', '2026-10-05');
  ok('a few days tick by day', J(week.map((t) => t.day)) === J(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05']) && week[0].label === '1 Oct');
  const month = dateTicks('2026-10-01', '2026-10-31');
  ok('a month ticks by week, on Mondays', month.every((t) => new Date(`${t.day}T00:00:00Z`).getUTCDay() === 1) && month.length >= 4, J(month));
  const decades = dateTicks('1990-06-01', '2026-06-01');
  ok('decades tick by years on 1 January', decades.every((t) => t.day.endsWith('-01-01')) && decades.length >= 3 && decades.length <= 6, J(decades));
  ok('a calendar day is a day number', dayNumber('1970-01-02') === 1 && dayNumber('2026-10-10') - dayNumber('2026-10-03') === 7);
}

console.log('\n=== bars: a negative value hangs BELOW the baseline ===');
{
  const s = sanitizeData(sample);
  const b = barLayout(s);
  ok('a bar per value', b.bars.length === 3 && b.groups.map((g) => g.label).join() === 'Jan,Feb,Mar');
  ok('the baseline is where zero is', near(b.baseline, scaleAt(b.scale, 0)) && b.scale.ticks.includes(0));
  const [jan, feb, mar] = b.bars;
  ok('a positive bar runs up from the baseline', near(jan.y0, b.baseline) && jan.y1 > b.baseline && near(jan.y1, scaleAt(b.scale, 5)));
  ok('A NEGATIVE BAR RUNS DOWN FROM THE BASELINE', near(feb.y1, b.baseline) && feb.y0 < b.baseline && near(feb.y0, scaleAt(b.scale, -3)), J(feb));
  ok('  its length is its value, on the same scale as the others', near((feb.y1 - feb.y0) / (jan.y1 - jan.y0), 3 / 5));
  ok('every bar is inside the plot', b.bars.every((r) => r.y0 >= 0 && r.y1 <= 1 && r.y0 <= r.y1 && r.x0 >= 0 && r.x1 <= 1));
  ok('a bar’s order follows the sort', barLayout({ ...s, sort: { col: 'c2', dir: 'asc' } }).groups.map((g) => g.label).join() === 'Feb,Mar,Jan');
  const two = barLayout(sanitizeData(bills));
  ok('two series draw side by side, never overlapping', two.series.length === 2 && two.bars.every((p) => two.bars.every((q) => p === q || p.x1 <= q.x0 + 1e-9 || q.x1 <= p.x0 + 1e-9)));
  ok('an empty cell is no bar, and is counted', two.missing === 1 && two.bars.length === 5);
  ok('all-negative bars hang from a baseline at the top', (() => {
    const l = barLayout(sanitizeData({ columns: [{ name: 'L' }, { name: 'V', type: 'number' }], rows: [['a', -5], ['b', -2]] }));
    return near(l.baseline, 1) && l.bars.every((r) => near(r.y1, 1) && r.y0 < 1);
  })());
  ok('a table that cannot draw bars has no bars', barLayout(sanitizeData({ columns: [{ name: 'A' }], rows: [['x']] })) === null);
}

console.log('\n=== a pie: shares of the whole ===');
{
  const s = sanitizeData(bills);
  const p = pieLayout({ ...s, rows: [...s.rows, { cells: ['April', null, 300], by: 'person' }] });
  ok('one slice per value, an empty cell skipped and counted', p.slices.length === 3 && p.missing === 1 && p.total === 3550);
  ok('the shares add up to 1', near(p.slices.reduce((t, x) => t + x.share, 0), 1, 1e-12));
  ok('the slices go round once, end to end', p.slices[0].a0 === 0 && p.slices[p.slices.length - 1].a1 === 1 && p.slices.every((x, i) => i === 0 || near(x.a0, p.slices[i - 1].a1)));
  ok('a share is its value over the whole', near(p.slices[2].share, 1150 / 3550, 1e-9));
  ok('a pie of a column with a negative value is not drawn', pieLayout(sanitizeData(sample)) === null);
}

console.log('\n=== histogram bins, worked by hand ===');
{
  // n = 10 → Sturges ⌈log₂10⌉+1 = 5 bins; range 9 → width 1.8 → round up to 2; edges 0…10.
  const h = histogramBins([1, 2, 2, 3, 4, 5, 6, 7, 8, 10]);
  ok('Sturges: 10 values → 5 bins', sturges(10) === 5 && sturges(2) === 2 && sturges(100) === 8);
  ok('round edges 0, 2, … 10', J(h.edges) === J([0, 2, 4, 6, 8, 10]) && h.width === 2 && h.nice, J(h));
  // [0,2): 1 · [2,4): 2,2,3 · [4,6): 4,5 · [6,8): 6,7 · [8,10]: 8,10
  ok('a value on an inner edge goes to the bin on its right; the maximum into the last', J(h.counts) === J([1, 3, 2, 2, 2]), J(h.counts));
  ok('every value is counted once', h.counts.reduce((a, b) => a + b, 0) === 10 && h.n === 10);
  // negatives and fractions: n = 6 → 4 bins; range 3 → width 0.75 → 1; edges −2…2
  const nf = histogramBins([-1.5, -0.5, 0, 0.25, 0.5, 1.5]);
  ok('negatives: edges −2, −1, 0, 1, 2', J(nf.edges) === J([-2, -1, 0, 1, 2]), J(nf.edges));
  ok('  zero, on an inner edge, goes right', J(nf.counts) === J([1, 1, 3, 1]), J(nf.counts));
  // fractions whose edges are float traps: 0.2, 0.4, 0.6 must be exactly those
  const fr = histogramBins([0.1, 0.2, 0.3, 0.35, 0.6]);
  ok('fractions: edges 0, 0.2, 0.4, 0.6 with no float noise', J(fr.edges) === J([0, 0.2, 0.4, 0.6]), J(fr.edges));
  ok('  0.2 on an edge goes right; 0.6, the maximum, into the last bin', J(fr.counts) === J([1, 3, 1]), J(fr.counts));
  const asked = histogramBins([3, 17, 25, 48, 51, 66, 72, 89, 97], 10);
  ok('a requested count is honoured with round edges where they fit (0…100 by 10)', asked.edges.length === 11 && asked.edges[0] === 0 && asked.edges[10] === 100 && asked.nice, J(asked.edges));
  // 1…7 in 4 bins: width 6/4 → 2, edges 0…8 — four round bins fit
  const four = histogramBins([1, 2, 3, 4, 5, 6, 7], 4);
  ok('1…7 in 4 bins: round edges 0, 2, 4, 6, 8', J(four.edges) === J([0, 2, 4, 6, 8]) && J(four.counts) === J([1, 2, 2, 2]) && four.nice, J(four));
  // 1…7 in 3 bins: width 2 from 0 would need 4 bins, so the range 1…7 is split evenly: 1, 3, 5, 7
  const exact = histogramBins([1, 2, 3, 4, 5, 6, 7], 3);
  ok('…and split evenly when round ones cannot give the count asked for', J(exact.edges) === J([1, 3, 5, 7]) && !exact.nice && exact.width === 2, J(exact));
  ok('  still counting every value: 3 and 5 go right, 7 into the last', J(exact.counts) === J([2, 2, 3]), J(exact.counts));
  const same = histogramBins([5, 5, 5]);
  ok('values all alike make one bin that holds them', same.counts.length === 1 && same.counts[0] === 3 && same.edges[0] <= 5 && same.edges[1] > 5);
  ok('round widths: 1, 2 or 5 × 10ⁿ', niceCeil(1.8) === 2 && niceCeil(0.75) === 1 && niceCeil(0.125) === 0.2 && niceCeil(30) === 50 && niceCeil(7) === 10);
  const s = sanitizeData({ title: 'Marks', columns: [{ name: 'Mark', type: 'number' }], rows: [[1], [2], [2], [3], [4], [5], [6], [7], [8], [10], [null]] });
  const ho = histogramOf(s);
  ok('a table’s histogram counts its column, the empty cell skipped and counted', J(ho.counts) === J([1, 3, 2, 2, 2]) && ho.missing === 1);
  ok('its bin count follows `bins`', histogramOf({ ...s, bins: 5 }).counts.length === 5 && histogramOf({ ...s, bins: 3 }).counts.length === 3);
  const hl = histogramLayout(s);
  ok('bars for drawing: edge to edge, heights on a whole-number axis from zero', hl.bars.length === 5 && hl.bars[0].x0 === 0 && hl.bars[4].x1 === 1 && hl.yScale.lo === 0 && hl.yScale.ticks.every(Number.isInteger) && near(hl.bars[1].y1, 3 / hl.yScale.hi));
}

console.log('\n=== heatmap colours ===');
{
  const div = heatScale([-4, 0, 2, 8]);
  ok('values either side of zero diverge, with zero in the middle', div.kind === 'diverging' && heatPosition(div, 0) === 0.5);
  ok('  the two sides share one magnitude', heatPosition(div, 8) === 1 && heatPosition(div, -4) === 0.25);
  ok('  zero is pale; below is amber, above is blue', heatColour(div, 0) === '#f4f4f5' && heatColour(div, 8) === '#1d4ed8' && heatColour(div, -8) === '#b45309');
  const seq = heatScale([2, 4, 6]);
  ok('one-signed values run light to dark', seq.kind === 'sequential' && heatPosition(seq, 2) === 0 && heatPosition(seq, 6) === 1 && heatColour(seq, 2) === '#eef2ff' && heatColour(seq, 6) === '#1e3a8a');
  const g = heatmapLayout(sanitizeData({
    columns: [{ name: 'Day', type: 'category' }, { name: 'Slot', type: 'category' }, { name: 'Visits', type: 'number' }],
    rows: [['Mon', 'am', 3], ['Mon', 'pm', 5], ['Tue', 'am', 2], ['Tue', 'am', 4], ['Tue', 'pm', null]],
  }));
  ok('a cell for each pair of labels', J(g.xs) === J(['Mon', 'Tue']) && J(g.ys) === J(['am', 'pm']) && g.cells.length === 3);
  ok('two rows in one cell are summed, and said to be', g.cells.find((c) => c.x === 1 && c.y === 0).value === 6 && g.cells.find((c) => c.x === 1 && c.y === 0).count === 2 && g.summed === 1);
  ok('a row with an empty value is skipped and counted', g.missing === 1);
}

console.log('\n=== points: line, area, scatter ===');
{
  const s = sanitizeData({ columns: [{ name: 'Day', type: 'date' }, { name: 'Steps', type: 'number' }], rows: [['2026-10-03', 7000], ['2026-10-01', 5000], ['2026-10-02', null], ['2026-10-04', 6000]] });
  const l = xyLayout(s, 'line');
  ok('a line runs in date order', J(l.series[0].points.map((p) => p.xv)) === J(['2026-10-01', '2026-10-03', '2026-10-04']));
  ok('  and breaks where a value is missing instead of bridging it', l.series[0].points[1].gap === true && l.series[0].points[2].gap === false && l.missing === 1);
  ok('  on a date axis with day ticks', l.xDates.ticks.length === 4 && l.xDates.ticks[0].at === 0 && l.xDates.ticks[3].at === 1);
  ok('an area’s axis includes zero; a line’s need not', xyLayout(s, 'area').yScale.lo === 0 && l.yScale.lo > 0);
  const sc = xyLayout(sanitizeData(bills), 'scatter');
  ok('a scatter is one point per row with both numbers', sc.series[0].points.length === 2 && sc.x.name === 'Rent' && sc.series[0].name === 'Utilities');
}

console.log('\n=== statistics skip empty cells, and say how many ===');
{
  const st = summarize([1, null, 3, null, 5]);
  ok('n, missing, min, max, mean, median, total', st.n === 3 && st.missing === 2 && st.min === 1 && st.max === 5 && st.mean === 3 && st.median === 3 && st.total === 9, J(st));
  ok('an even count’s median is the middle pair’s mean', summarize([4, 1, 3, 2]).median === 2.5);
  ok('a column of nothing has no statistics — not zeros', summarize([null, null]).mean === null && summarize([null, null]).missing === 2);
  ok('a text column has no statistics', columnStats(sanitizeData(bills), 'c1') === null);
  const s = sanitizeData(bills);
  const f = kindOf('data').facts(s, { guarded: false });
  ok('the facts give them, and say what was skipped', f.some((x) => /Utilities \(\$\): 2 values, 1 empty cell skipped; min 280, max 310, mean 295, median 295, total 590/.test(x)), J(f));
  const g = kindOf('data').facts(s, { guarded: true });
  ok('while learning, the figures are withheld but the counts are not', g.some((x) => /Utilities \(\$\): 2 values, 1 empty cell skipped\.$/.test(x)) && !g.some((x) => /mean 295/.test(x)) && g.some((x) => /withheld/.test(x)));
}

console.log('\n=== from a CSV ===');
{
  const csv = 'Month,Rent,Paid on,Area,Note\nJan,"$1,200",2026-01-03,North,on time\nFeb,"$1,250",2026-02-02,South,late\nMar,NA,2026-03-01,North,\nApr,"$1,300",n/a,North,"partly, in cash"\n';
  const s = dataFromCSV(csv, 'Rent paid');
  ok('a table from CSV', !!s && s.title === 'Rent paid' && s.rows.length === 4 && s.columns.length === 5);
  ok('numbers with commas and currency are numbers, the unit read from them', s.columns[1].type === 'number' && s.columns[1].unit === '$' && s.rows[0].cells[1] === 1200 && s.rows[3].cells[1] === 1300);
  ok('ISO days are dates', s.columns[2].type === 'date' && s.rows[1].cells[2] === '2026-02-02');
  ok('“NA” and “n/a” are empty cells, not zero', s.rows[2].cells[1] === null && s.rows[3].cells[2] === null);
  ok('a few repeated labels are a category; free words are text', s.columns[3].type === 'category' && s.columns[0].type === 'text' && s.columns[4].type === 'text');
  ok('a quoted comma stays inside its field', s.rows[3].cells[4] === 'partly, in cash');
  ok('what came from their material is said to: basis source, rows theirs', s.basis === 'source' && s.rows.every((r) => r.by === 'person'));
  const mixed = dataFromCSV('Score\n12\n15\nabsent\n', 'Scores');
  ok('one value that is not a number makes the column text — nothing is dropped or coerced', mixed.columns[0].type === 'text' && mixed.rows[2].cells[0] === 'absent');
  ok('percentages carry their unit', dataFromCSV('Share\n12%\n30%\n', 'S').columns[0].unit === '%');
  ok('a ragged row is padded with empty cells', dataFromCSV('A,B\n1\n', 'R').rows[0].cells[1] === null);
  const big = ['X', ...Array.from({ length: 250 }, (_, i) => String(i))].join('\n');
  ok('past 200 rows the rest is left out — and csvOverflow says how much', dataFromCSV(big, 'Big').rows.length === 200 && J(csvOverflow(big)) === J({ rows: 250, columns: 1, keptRows: 200, keptColumns: 1 }));
  ok('nothing is not a table', dataFromCSV('', 'Empty') === null);
}

console.log('\n=== every edit is an operation, computed and undoable ===');
{
  const c = create(EMPTY_SPACE, 'data', bills, { name: 'T1', origin: 'person' });
  ok('the chart is an object of thought', !!c && c.obj.kind === 'data' && kindOf('data')?.label === 'Chart');
  let space = c.space;
  const id = c.obj.id;
  const cur = () => currentOf(space.objs[0]);
  const step = (op, args, by = 'person') => {
    const r = apply(space, id, op, args, { by, at: 1 });
    if (r.ok) space = r.space;
    return r;
  };
  const set = step('cell', { row: 2, col: 'c3', value: '295', by: 'person' });
  ok('a cell is set', set.ok && cur().rows[2].cells[2] === 295);
  ok('  the step says what changed', /March · Utilities: empty → 295/.test(set.step.note ?? ''), set.step?.note);
  ok('  an empty value empties the cell', step('cell', { row: 2, col: 'c3', value: '' }).ok && cur().rows[2].cells[2] === null);
  ok('  a word in a number column is refused, with the reason', /not a number/.test(step('cell', { row: 0, col: 'c2', value: 'lots' }).why));
  ok('  a row or column that is not there is refused', !step('cell', { row: 9, col: 'c2', value: 1 }).ok && !step('cell', { row: 0, col: 'c9', value: 1 }).ok);
  ok('a row is added', step('addRow', { values: 'April|1,250|300', by: 'person' }).ok && J(cur().rows[3].cells) === J(['April', 1250, 300]) && cur().rows[3].by === 'person');
  ok('  one value per column, or it is refused', /3 columns/.test(step('addRow', { values: 'May|1300', by: 'person' }).why));
  ok('  a value that does not fit its column is refused', /not a number/.test(step('addRow', { values: 'May|soon|1', by: 'person' }).why));
  ok('a column is added, empty in every row', step('addColumn', { name: 'Due', type: 'date', by: 'person' }).ok && cur().columns[3].id === 'c4' && cur().rows.every((r) => r.cells[3] === null));
  ok('  a name already used is refused', !step('addColumn', { name: 'rent', type: 'number', by: 'person' }).ok);
  ok('a column is renamed', step('renameColumn', { col: 'c3', name: 'Bills' }).ok && cur().columns[2].name === 'Bills');
  ok('the axes are chosen', step('bind', { x: 'c1', y: 'c3' }).ok && cur().x === 'c1' && J(cur().y) === J(['c3']));
  ok('  a column that cannot be the y of a bar chart is refused while bars are shown', step('view', { view: 'bar' }).ok && /does not hold numbers/.test(step('bind', { y: 'c1' }).why));
  ok('  a column drawn against itself is refused', !step('bind', { x: 'c2', y: 'c2' }).ok);
  ok('a column is removed, and a binding to it goes with it', step('removeColumn', { col: 'c3' }).ok && cur().columns.length === 3 && cur().y === undefined && cur().rows[0].cells.length === 3);
  ok('  the last column cannot be removed', (() => {
    const one = create(EMPTY_SPACE, 'data', { columns: [{ name: 'Only' }] }, { name: 'T9', origin: 'person' });
    return !apply(one.space, one.obj.id, 'removeColumn', { col: 'c1' }, { by: 'person', at: 1 }).ok;
  })());
  ok('a row is removed', step('removeRow', { row: 3 }).ok && cur().rows.length === 3);
  ok('the bins are set, and cleared back to Sturges', step('bins', { n: 6 }).ok && cur().bins === 6 && step('bins', { n: '' }).ok && cur().bins === undefined);
  ok('  more than 40 bins is refused', !step('bins', { n: 41 }).ok);
  ok('sorted by a column — the stored order stays', step('sort', { col: 'c2', dir: 'desc' }).ok && J(displayOrder(cur())) === J([0, 1, 2]) && cur().rows[2].cells[0] === 'March');
  ok('  ascending puts March first', step('sort', { col: 'c2', dir: 'asc' }).ok && displayOrder(cur())[0] === 2);
  ok('  and unsorted again', step('sort', { col: '' }).ok && cur().sort === undefined);
  ok('a view that cannot draw is refused with its reason', /two columns of labels/.test(step('view', { view: 'heatmap' }).why));
  ok('shown as a histogram', step('view', { view: 'histogram' }).ok && cur().view === 'histogram');
  ok('renamed', step('title', { title: 'Our flat' }).ok && cur().title === 'Our flat');
  ok('the person can mark the numbers as examples', step('basis', { basis: 'illustrative' }).ok && cur().basis === 'illustrative' && step('basis', { basis: 'given' }).ok);
  ok('every state an operation leaves is canonical', space.objs[0].states.every((st) => stableKey(sanitizeData(JSON.parse(JSON.stringify(st)))) === stableKey(st)));
  const at = space.objs[0].at;
  space = seek(space, id, at - 3);
  ok('undo steps back without losing anything', cur().title === 'Rent and bills' && space.objs[0].states.length === at + 1);
  space = seek(space, id, at);
  ok('…and redo steps forward', cur().title === 'Our flat');
  const back = sanitizeSpace(JSON.parse(JSON.stringify(space)));
  ok('the whole history survives a save: every step re-computed', back.objs[0].steps.length === space.objs[0].steps.length && stableKey(currentOf(back.objs[0])) === stableKey(cur()));
  ok('  and says the same of each step', back.objs[0].steps.every((st, i) => st.said === space.objs[0].steps[i].said));
}

console.log('\n=== what the person entered is theirs ===');
{
  const mixed = { ...bills, basis: 'source', rows: [...bills.rows, { cells: ['Example', 999, 99], by: 'socria' }] };
  const c = create(EMPTY_SPACE, 'data', mixed, { name: 'T1', origin: 'person' });
  let space = c.space;
  const id = c.obj.id;
  const as = (by, op, args) => apply(space, id, op, args, { by, at: 2 });
  ok('Socria cannot change a cell in the person’s row', !as('socria', 'cell', { row: 0, col: 'c2', value: 1300 }).ok);
  ok('  and says why', /yours/.test(as('socria', 'cell', { row: 0, col: 'c2', value: 1300 }).why));
  ok('  nor remove the person’s row', !as('socria', 'removeRow', { row: 0 }).ok);
  ok('  nor rename or remove the person’s column', !as('socria', 'renameColumn', { col: 'c2', name: 'Cost' }).ok && !as('socria', 'removeColumn', { col: 'c3' }).ok);
  ok('it can change its own row', as('socria', 'cell', { row: 3, col: 'c2', value: 1000 }).ok);
  ok('it can add a row, which is its own', (() => {
    const r = as('socria', 'addRow', { values: 'June|1,300|250', by: 'socria' });
    return r.ok && currentOf(r.obj).rows[4].by === 'socria';
  })());
  ok('nobody can claim to be someone else', !as('socria', 'addRow', { values: 'Forged|1|1', by: 'person' }).ok && !as('person', 'addRow', { values: 'Forged|1|1', by: 'socria' }).ok);
  const theirs = as('person', 'cell', { row: 3, col: 'c2', value: 1010, by: 'person' });
  ok('when the person corrects Socria’s row, it becomes theirs', theirs.ok && currentOf(theirs.obj).rows[3].by === 'person');
  space = theirs.space;
  ok('  and Socria cannot change it back', !as('socria', 'cell', { row: 3, col: 'c2', value: 999 }).ok);
  ok('Socria cannot remove a column of its own that holds the person’s values', (() => {
    const s2 = create(EMPTY_SPACE, 'data', { ...bills, columns: bills.columns.map((col) => (col.id === 'c3' ? { ...col, by: 'socria' } : col)) }, { name: 'T2', origin: 'person' });
    return /values you entered/.test(apply(s2.space, s2.obj.id, 'removeColumn', { col: 'c3' }, { by: 'socria', at: 1 }).why);
  })());
  ok('only the person can say the numbers are their own', /Only you/.test(as('socria', 'basis', { basis: 'given' }).why) && as('person', 'basis', { basis: 'given' }).ok);
  ok('  and once they have, Socria does not relabel them', (() => {
    const g = create(EMPTY_SPACE, 'data', bills, { name: 'T3', origin: 'person' });
    return /does not relabel/.test(apply(g.space, g.obj.id, 'basis', { basis: 'illustrative' }, { by: 'socria', at: 1 }).why);
  })());
  // a forged history is cut on load: a "socria" step that rewrites the person's cell never replays
  const forged = JSON.parse(JSON.stringify(space));
  const s0 = currentOf(forged.objs[0]);
  const s1 = { ...s0, rows: s0.rows.map((r, i) => (i === 0 ? { ...r, cells: ['January', 9999, 310] } : r)) };
  forged.objs[0].states = [s0, s1];
  forged.objs[0].steps = [{ op: 'cell', args: { row: 0, col: 'c2', value: 9999 }, said: 'x', by: 'socria', at: 3 }];
  forged.objs[0].at = 1;
  const read = sanitizeSpace(forged);
  ok('a stored step in which Socria rewrote the person’s number is cut on load', read.objs[0].states.length === 1 && currentOf(read.objs[0]).rows[0].cells[1] === 1200);
}

console.log('\n=== example numbers stay labelled as examples ===');
{
  const c = create(EMPTY_SPACE, 'data', sample, { name: 'T1', origin: 'socria' });
  let space = c.space;
  const id = c.obj.id;
  const k = kindOf('data');
  for (const [op, args] of [['cell', { row: 0, col: 'c2', value: 6 }], ['addRow', { values: 'Apr|4', by: 'socria' }], ['view', { view: 'bar' }], ['sort', { col: 'c2', dir: 'desc' }]]) {
    const r = apply(space, id, op, args, { by: 'socria', at: 1 });
    if (r.ok) space = r.space;
  }
  const s = currentOf(space.objs[0]);
  ok('editing example numbers does not make them real', s.basis === 'illustrative' && space.objs[0].steps.length === 4);
  ok('  nor does saving and reopening', currentOf(sanitizeSpace(JSON.parse(JSON.stringify(space))).objs[0]).basis === 'illustrative');
  ok('the facts say ILLUSTRATIVE, every time', k.facts(s, { guarded: false }).some((f) => /ILLUSTRATIVE numbers — examples, not real data/.test(f)) && k.facts(s, { guarded: true }).some((f) => /ILLUSTRATIVE/.test(f)));
  ok('so do the text and the shape', /ILLUSTRATIVE/.test(k.text(s)) && /illustrative/.test(k.shape(s)));
  ok('the person’s own are said to be theirs', k.facts(sanitizeData(bills), { guarded: false }).some((f) => /the person’s own numbers/.test(f)));
}

console.log('\n=== what the conversation is told ===');
{
  const k = kindOf('data');
  const s = sanitizeData({ ...bills, view: 'bar' });
  const f = k.facts(s, { guarded: false });
  ok('what is drawn, in words', f.some((x) => /Drawn: bars of Rent and Utilities for each Month, measured from zero/.test(x)), J(f));
  ok('whose rows they are', f.some((x) => /3 rows are the person’s own/.test(x)));
  ok('a view that cannot draw says why', k.facts({ ...sanitizeData(sample), view: 'pie' }, { guarded: false }).some((x) => /pie chart cannot draw: A pie cannot show a negative value/.test(x)));
  const t = k.text(s);
  ok('the text is the table: columns with types and units, rows with empty cells marked', /Columns: Month \(text\) \| Rent \(number, \$\) \| Utilities \(number, \$\)/.test(t) && /3\. March \| 1150 \| — · theirs/.test(t), t);
  const huge = sanitizeData({ columns: Array.from({ length: 12 }, (_, i) => ({ name: `Column number ${i}`, type: 'text' })), rows: Array.from({ length: 200 }, () => Array.from({ length: 12 }, () => 'x'.repeat(60))) });
  ok('a large table’s text is capped, and says how much is left out', k.text(huge).length <= 2400 && /more rows/.test(k.text(huge)));
  ok('sizes: card, trail, and a live figure that fits', J(k.size(s, 'card')) === J({ w: 260, h: 150 }) && J(k.size(s, 'trail')) === J({ w: 200, h: 110 }) && k.size(huge, 'live').w <= 720 && k.size({ ...huge, view: 'table' }, 'live').h <= 640);
  ok('its shape in a line', k.shape(s) === 'bar chart · 3 rows × 3 columns');
  ok('a column and a row are parts, with their facts', k.parts(s).length === 6 && /Rent: a number column in \$/.test(k.partFacts(s, 'c2')[0]) && /Month: March; Rent: 1,150; Utilities: empty/.test(k.partFacts(s, 'r2')[0]));
  ok('a column’s part facts are counts, never the answer', !k.partFacts(s, 'c2').some((x) => /mean|total|median/.test(x)));
}

console.log('\n=== words become operations only when they plainly are one ===');
{
  const s = sanitizeData(bills); // shown as a table
  const r = (t, st = s) => readDataOp(t, st, TODAY);
  ok('"make it a bar chart"', J(r('make it a bar chart')) === J({ op: 'view', args: { view: 'bar' } }), J(r('make it a bar chart')));
  ok('"pie chart"', J(r('pie chart')) === J({ op: 'view', args: { view: 'pie' } }));
  ok('"line chart"', J(r('line chart')) === J({ op: 'view', args: { view: 'line' } }));
  ok('"histogram"', J(r('histogram')) === J({ op: 'view', args: { view: 'histogram' } }));
  ok('"scatter plot"', J(r('scatter plot')) === J({ op: 'view', args: { view: 'scatter' } }));
  ok('"show the table" (from a chart)', J(r('show the table', { ...s, view: 'bar' })) === J({ op: 'view', args: { view: 'table' } }));
  ok('"turn the table into a bar chart" reads the view asked for, not the one named first', r('turn the table into a bar chart')?.args.view === 'bar');
  ok('the view already shown is not asked for again', r('show the table') === null);
  ok('"set March rent to 1200"', J(r('set March rent to 1200')) === J({ op: 'cell', args: { row: 2, col: 'c2', value: 1200, by: 'person' } }), J(r('set March rent to 1200')));
  ok('"change the utilities for January to $320"', J(r('change the utilities for January to $320')) === J({ op: 'cell', args: { row: 0, col: 'c3', value: 320, by: 'person' } }), J(r('change the utilities for January to $320')));
  ok('"add a row: April, 1250, 300"', J(r('add a row: April, 1250, 300')) === J({ op: 'addRow', args: { values: 'April|1250|300', by: 'person' } }));
  ok('  a grouped number is not split at its comma', r('add a row: April, 1,250, 300')?.args.values === 'April|1,250|300');
  ok('"use 10 bins"', J(r('use 10 bins')) === J({ op: 'bins', args: { n: 10 } }));
  const spend = sanitizeData({ columns: [{ name: 'Item' }, { name: 'Amount', type: 'number' }, { name: 'Paid', type: 'date' }], rows: [['Lunch', 12, '2026-10-01'], ['Books', 40, '2026-10-02']] });
  ok('"sort by amount"', J(r('sort by amount', spend)) === J({ op: 'sort', args: { col: 'c2', dir: 'asc' } }));
  ok('"sort by amount descending"', J(r('sort by amount descending', spend)) === J({ op: 'sort', args: { col: 'c2', dir: 'desc' } }));
  ok('"sort by amount, largest first"', r('sort by amount, largest first', spend)?.args.dir === 'desc' && r('sort by amount low to high', spend)?.args.dir === 'asc');
  ok('a day in words is read against today, so the operation carries the day itself', r('add a row: Coffee, 4.50, next Friday', spend)?.args.values === 'Coffee|4.50|2026-10-16');
  ok('  and a date cell set in words likewise', J(r('set books paid to Oct 15', spend)) === J({ op: 'cell', args: { row: 1, col: 'c3', value: '2026-10-15', by: 'person' } }), J(r('set books paid to Oct 15', spend)));
  ok('with one number column, "set March to 1150" needs no column name', r('set March to 1150', sanitizeData({ columns: [{ name: 'Month' }, { name: 'Rent', type: 'number' }], rows: [['March', 1]] }))?.args.col === 'c2');
  ok('  with two, it is not guessed', r('set March to 1150') === null);
  ok('two rows with the same name: no guess', r('set March rent to 1', sanitizeData({ ...bills, rows: [...bills.rows, { cells: ['March', 1, 1], by: 'person' }] })) === null);
  ok('a value that does not fit is left to the conversation', r('set March rent to be paid on the 5th') === null);
  ok('a row that does not have every value is not added', r('add a row: April, 1250') === null);
  // what must be left to the conversation
  for (const t of [
    'what is the average rent?',
    'I think rent is too high this year',
    'set a reminder for March',
    'add more detail to your last answer',
    'can you sort out my thoughts?',
    'show me how to compute the median',
    'the pie was delicious',
    'histograms confuse me',
    'make it better',
    'change the subject to March madness',
    'show me the table of contents',
    'I paid 1200 in March',
    'is a bar chart the right choice here?',
    'put the kettle on',
  ]) {
    ok(`left to the conversation: "${t}"`, r(t) === null, J(r(t)));
  }
  ok('the kind reads words the same way, against today', J(kindOf('data').readOp('set March rent to 1200', s)) === J(r('set March rent to 1200')));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
