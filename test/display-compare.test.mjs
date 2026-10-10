// A COMPARISON — Logos 3.5's weighted decision matrix.
//
// Workflow 2 of the release: build and manipulate a comparison matrix. What is
// held down here: the state is canonical and survives a save; a total is the
// weighted average over the criteria an option is scored on, worked by hand;
// a missing score stays missing — never 0, never an average; ranges give
// bands, and overlapping bands are too close to call; an exact tie is a tie,
// decided in whole hundredths; a reweighting that turns the ranking is
// computed, and the weight at which it turns is the root of the equation,
// checked by hand; every edit is an operation, computed and undoable; words
// become operations only when they plainly name something in THIS
// comparison; and what the person judged is theirs — Socria can add and
// suggest, never overwrite.

import { apply, create, currentOf, describeObject, kindOf, readOperation, sanitizeSpace, seek, EMPTY_SPACE } from './.tmp/index.mjs';
import {
  sanitizeCompare,
  readCompareOp,
  totals,
  ranking,
  completeness,
  decisive,
  sensitivity,
  scoreOf,
  cellGrid,
  rankBars,
  flipStrip,
  COMPARE_LIMITS,
  COMPARE_META,
  DEFAULT_WEIGHT,
} from './.tmp/display-compare.mjs';
import { stableKey } from './.tmp/display-base.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const near = (a, b, e = 1e-6) => typeof a === 'number' && Math.abs(a - b) <= e;
const J = JSON.stringify;

const TODAY = '2026-10-10';

// "Help me choose between two job offers" — what the display pass might propose,
// with the person's own salary weight and their own score for Job A's salary
const jobs = () => ({
  title: 'Two job offers',
  options: [
    { id: 'a', name: 'Job A', note: 'Acme, downtown', by: 'socria' },
    { id: 'b', name: 'Job B', by: 'socria' },
  ],
  criteria: [
    { id: 'sal', name: 'Salary', weight: 8, by: 'person' },
    { id: 'com', name: 'Commute', weight: 4, by: 'socria' },
    { id: 'gro', name: 'Growth', weight: 5, by: 'socria' },
  ],
  scores: [
    // given out of order: the canonical order is option, then criterion
    { option: 'b', criterion: 'gro', value: 6, by: 'socria' },
    { option: 'a', criterion: 'sal', value: 9, note: '$95k base', by: 'person' },
    { option: 'b', criterion: 'com', value: 9, note: '15 min walk', by: 'socria' },
    { option: 'a', criterion: 'com', value: 3, by: 'socria' },
    { option: 'b', criterion: 'sal', value: 5, by: 'socria' },
    { option: 'a', criterion: 'gro', value: 7, by: 'socria' },
  ],
});

console.log('=== the state is canonical and checked ===');
{
  const s = sanitizeCompare(jobs());
  ok('a comparison is read', !!s && s.options.length === 2 && s.criteria.length === 3 && s.scores.length === 6);
  ok('  its ids are kept', J(s.options.map((o) => o.id)) === J(['a', 'b']) && J(s.criteria.map((c) => c.id)) === J(['sal', 'com', 'gro']));
  ok('  scores are held in one order — option, then criterion — whatever order they came in', J(s.scores.map((x) => `${x.option}.${x.criterion}`)) === J(['a.sal', 'a.com', 'a.gro', 'b.sal', 'b.com', 'b.gro']));
  ok('  it opens on the matrix', s.view === 'matrix');
  ok('  the same state read twice is the same state', stableKey(sanitizeCompare(s)) === stableKey(s));
  ok('  and survives being saved and reopened', stableKey(sanitizeCompare(JSON.parse(J(s)))) === stableKey(s));
  ok('  who wrote what is kept', s.criteria[0].by === 'person' && s.scores[0].by === 'person' && s.options[0].by === 'socria');
  ok('  an unknown author is Socria, never the person', sanitizeCompare({ options: [{ name: 'X1', by: 'someone' }, { name: 'Y1' }], criteria: [{ name: 'Z1' }] }).options.every((o) => o.by === 'socria'));

  // a proposal that names things instead of giving ids
  const named = sanitizeCompare({
    options: [{ name: 'Rent the flat' }, { id: 'o1', name: 'Buy the house' }],
    criteria: [{ name: 'Monthly cost', weight: 9 }, { name: 'Space' }],
    scores: [
      { option: 'Rent the flat', criterion: 'monthly cost', value: 6 },
      { option: 'o1', criterion: 'Space', value: 9 },
    ],
  });
  ok('a fresh id never takes one another entry already has', J(named.options.map((o) => o.id)) === J(['o2', 'o1']) && J(named.criteria.map((c) => c.id)) === J(['c1', 'c2']), J(named));
  ok('a score may point at its option and criterion by name', named.scores.length === 2 && named.scores[0].option === 'o2' && named.scores[0].criterion === 'c1' && named.scores[1].option === 'o1' && named.scores[1].criterion === 'c2');
  ok('a criterion nobody weighed counts in the middle', named.criteria[1].weight === DEFAULT_WEIGHT && DEFAULT_WEIGHT === 5);

  const bad = sanitizeCompare({
    title: 'x'.repeat(300),
    options: [{ name: 'Job A' }, { name: 'job a' }, { name: '' }, { name: '\u0000Job\u0007   B\n' }, 'junk', null],
    criteria: [
      { name: 'Pay', weight: 7.6 },
      { name: 'Hours', weight: 15 },
      { name: 'Team', weight: -3 },
      { name: 'Perks', weight: 'lots' },
    ],
    scores: [
      { option: 'o1', criterion: 'c1', value: 11 },
      { option: 'o1', criterion: 'c2', value: -1, note: '60 hours a week' },
      { option: 'o1', criterion: 'c3', value: 7.256, low: 9, high: 6 },
      { option: 'o1', criterion: 'c4', value: '7.5', low: 7.5, high: 9 },
      { option: 'o2', criterion: 'c1', value: 6, low: 4 },
      { option: 'o2', criterion: 'c1', value: 2 },
      { option: 'o2', criterion: 'c2' },
      { option: 'nobody', criterion: 'c1', value: 5 },
    ],
  });
  const sc = (o, c) => bad.scores.find((x) => x.option === o && x.criterion === c);
  ok('a name used twice (whatever its case) is one option', bad.options.length === 2 && bad.options[0].name === 'Job A');
  ok('control characters and runs of space are cleaned', bad.options[1].name === 'Job B');
  ok('a title is capped', bad.title.length <= COMPARE_LIMITS.title);
  ok('a weight is a whole number held within 0..10; missing or junk, the default', J(bad.criteria.map((c) => c.weight)) === J([8, 10, 0, 5]));
  ok('a score past 10 is no score — never clamped into one', !sc('o1', 'c1'));
  ok('a pair with only a note keeps the note, and no value', sc('o1', 'c2')?.value === null && sc('o1', 'c2').note === '60 hours a week');
  ok('scores are kept to two decimals', sc('o1', 'c3')?.value === 7.26);
  ok('a range that does not hold its score is dropped', !!sc('o1', 'c3') && !('low' in sc('o1', 'c3')) && !('high' in sc('o1', 'c3')));
  ok('a bound equal to the score says nothing, so it is not kept: one form', sc('o1', 'c4')?.value === 7.5 && !('low' in sc('o1', 'c4')) && sc('o1', 'c4').high === 9);
  ok('at most one score per pair — the first', sc('o2', 'c1')?.value === 6 && sc('o2', 'c1').low === 4 && bad.scores.filter((x) => x.option === 'o2' && x.criterion === 'c1').length === 1);
  ok('a pair with nothing known, and a score for no option, are not kept', bad.scores.length === 4);
  ok('the messy state is canonical too', stableKey(sanitizeCompare(JSON.parse(J(bad)))) === stableKey(bad));

  const big = sanitizeCompare({
    options: Array.from({ length: 12 }, (_, i) => ({ name: `Option ${i + 1} ${'y'.repeat(80)}` })),
    criteria: Array.from({ length: 15 }, (_, i) => ({ name: `Criterion ${i + 1}` })),
    scores: Array.from({ length: 400 }, (_, i) => ({ option: `o${(i % 12) + 1}`, criterion: `c${(i % 15) + 1}`, value: i % 11, note: 'n'.repeat(300) })),
  });
  ok(`at most ${COMPARE_LIMITS.options} options and ${COMPARE_LIMITS.criteria} criteria`, big.options.length === COMPARE_LIMITS.options && big.criteria.length === COMPARE_LIMITS.criteria);
  ok('names and notes are capped', big.options.every((o) => o.name.length <= COMPARE_LIMITS.name) && big.scores.every((x) => (x.note ?? '').length <= COMPARE_LIMITS.scoreNote));
  ok('scores for options and criteria not kept are dropped; one per pair at most', big.scores.length > 0 && big.scores.length <= COMPARE_LIMITS.scores && new Set(big.scores.map((x) => `${x.option}.${x.criterion}`)).size === big.scores.length);
  ok('fewer than two options is not a comparison', sanitizeCompare({ options: [{ name: 'Only one' }], criteria: [{ name: 'Cost' }] }) === null);
  ok('  nor is one with nothing to judge them on', sanitizeCompare({ options: [{ name: 'A1' }, { name: 'B1' }], criteria: [] }) === null);
  ok('junk is not a comparison', sanitizeCompare(null) === null && sanitizeCompare('compare') === null && sanitizeCompare({}) === null && sanitizeCompare([]) === null);
}

console.log('\n=== the totals, worked by hand ===');
{
  const s = sanitizeCompare(jobs());
  const t = totals(s);
  // Job A: (8·9 + 4·3 + 5·7) / (8 + 4 + 5) = 119 / 17 = 7
  // Job B: (8·5 + 4·9 + 5·6) / 17 = 106 / 17 ≈ 6.2353
  ok('Job A: (8·9 + 4·3 + 5·7) / 17 = 119/17 = 7', t[0].option === 'a' && t[0].total === 7, J(t[0]));
  ok('Job B: (8·5 + 4·9 + 5·6) / 17 = 106/17', near(t[1].total, 106 / 17), J(t[1]));
  ok('  no ranges, so each band is just its total', t.every((x) => x.low === x.total && x.high === x.total));
  ok('  every criterion scored', t.every((x) => x.scored === 3 && x.unscored === 0));
  const rk = ranking(s);
  ok('Job A ranks first, and leads', rk.entries[0].option === 'a' && rk.entries[0].place === 1 && rk.entries[1].place === 2 && rk.leader === 'a' && !rk.tooClose);
  ok('  their bands do not touch', rk.entries.every((e) => e.closeTo.length === 0));
  const done = completeness(s);
  ok('complete: 6 of 6', done.complete && done.scored === 6 && done.cells === 6 && done.missing.length === 0);
  const d = decisive(s);
  // weight × (best − worst): salary 8 × (9 − 5) = 32, commute 4 × (9 − 3) = 24, growth 5 × (7 − 6) = 5
  ok('salary separates them most: 8 × (9 − 5) = 32; then commute, 4 × (9 − 3) = 24; then growth, 5 × 1 = 5', J(d.map((x) => [x.criterion, x.spread])) === J([['sal', 32], ['com', 24], ['gro', 5]]), J(d));
  ok('  with who is best and who is worst on each', d[0].best === 'a' && d[0].worst === 'b' && d[0].range === 4 && d[1].best === 'b' && d[1].worst === 'a' && d[1].range === 6);
  const g = cellGrid(s);
  ok('the matrix: a row per criterion, a column per option', g.rows.length === 3 && g.rows.every((r) => r.length === 2) && J(g.options) === J(['a', 'b']) && J(g.criteria) === J(['sal', 'com', 'gro']));
  ok('  each cell shaded by its score out of 10', g.rows[0][0].shade === 0.9 && g.rows[1][0].shade === 0.3 && g.rows[1][1].shade === 0.9);
  ok('  with its note and who scored it', g.rows[0][0].note === '$95k base' && g.rows[0][0].by === 'person' && g.rows[1][1].note === '15 min walk' && g.rows[1][1].by === 'socria');
  const bars = rankBars(s);
  ok('the ranking as bars along 0..1', bars[0].option === 'a' && bars[0].x === 0.7 && near(bars[1].x, 106 / 170) && bars.every((b) => b.x0 <= b.x && b.x <= b.x1 && b.x0 >= 0 && b.x1 <= 1));
}

console.log('\n=== a missing score stays missing ===');
{
  const raw = jobs();
  raw.options.push({ id: 'f', name: 'Freelancing', by: 'person' });
  raw.scores.push({ option: 'f', criterion: 'sal', value: 4, by: 'person' }, { option: 'f', criterion: 'gro', value: 9, by: 'person' });
  const s = sanitizeCompare(raw);
  const f = totals(s).find((x) => x.option === 'f');
  // over the criteria it HAS: (8·4 + 5·9) / (8 + 5) = 77/13 — the commute counted neither as 0 nor as an average
  ok('an option is totalled over the criteria it is scored on: (8·4 + 5·9) / 13 = 77/13', near(f.total, 77 / 13), J(f));
  ok('  and says how many it is not scored on', f.scored === 2 && f.unscored === 1);
  ok('the empty pair stays empty', scoreOf(s, 'f', 'com') === null && cellGrid(s).rows[1][2].value === null && cellGrid(s).rows[1][2].shade === null);
  const done = completeness(s);
  ok('completeness: 8 of 9, and which pair is missing', done.scored === 8 && done.cells === 9 && !done.complete && J(done.missing) === J([{ option: 'f', criterion: 'com' }]));
  const facts = kindOf('compare').facts(s, { guarded: false });
  ok('the facts name what is not scored, and that it is never filled in', facts.some((x) => /not scored yet: Freelancing on Commute/.test(x) && /never filled in/.test(x)), J(facts));
  ok('  and that its total covers 2 of 3 criteria', facts.some((x) => /Freelancing 5\.92 over 2 of 3/.test(x)));
  ok('the text shows the gap as a gap', /Commute —/.test(kindOf('compare').text(s)));
  // known only by a note: no total — not 0
  const noted = sanitizeCompare({ ...raw, scores: [...raw.scores.filter((x) => x.option !== 'f'), { option: 'f', criterion: 'com', value: null, note: '$1,200/month', by: 'person' }] });
  const nr = ranking(noted);
  ok('an option known only by a note has no total, and comes last', nr.entries[2].option === 'f' && nr.entries[2].total === null && nr.entries[2].place === 3);
  ok('  nobody leads while an option has no total', nr.leader === null);
  ok('  its note is kept, with no value', scoreOf(noted, 'f', 'com').note === '$1,200/month' && scoreOf(noted, 'f', 'com').value === null);
  ok('  and the facts say it has no total yet', kindOf('compare').facts(noted, { guarded: false }).some((x) => /Freelancing has no total yet/.test(x)));
  const zero = sanitizeCompare({
    options: [{ name: 'P' }, { name: 'Q' }],
    criteria: [{ name: 'Looks', weight: 0 }, { name: 'Price', weight: 6 }],
    scores: [{ option: 'P', criterion: 'Looks', value: 9 }, { option: 'Q', criterion: 'Price', value: 4 }],
  });
  ok('a score on a criterion that weighs 0 counts for nothing: no total from it alone', totals(zero)[0].total === null && totals(zero)[1].total === 4);
}

console.log('\n=== uncertainty: bands, and what is too close to call ===');
{
  const raw = jobs();
  raw.scores = raw.scores.map((x) =>
    x.option === 'a' && x.criterion === 'sal' ? { ...x, low: 6, high: 10 } : x.option === 'b' && x.criterion === 'com' ? { ...x, low: 7, high: 10 } : x
  );
  const s = sanitizeCompare(raw);
  const [a, b] = totals(s);
  // Job A: low (8·6 + 12 + 35) / 17 = 95/17, high (8·10 + 12 + 35) / 17 = 127/17
  // Job B: low (40 + 4·7 + 30) / 17 = 98/17, high (40 + 4·10 + 30) / 17 = 110/17
  ok('a band from the ranges: Job A from 95/17 to 127/17, its total still 7', near(a.low, 95 / 17) && near(a.high, 127 / 17) && a.total === 7);
  ok('  Job B from 98/17 to 110/17', near(b.low, 98 / 17) && near(b.high, 110 / 17));
  const rk = ranking(s);
  ok('overlapping bands are too close to call: nobody leads', rk.tooClose && rk.leader === null && J(rk.entries[0].closeTo) === J(['b']) && J(rk.entries[1].closeTo) === J(['a']));
  ok('  though the totals keep their order', rk.entries[0].option === 'a');
  ok('  and the facts say so, with the ranges (95/17 ≈ 5.59, 127/17 ≈ 7.47)', kindOf('compare').facts(s, { guarded: false }).some((x) => /too close to call/.test(x) && /5\.59–7\.47/.test(x)));
  ok('  the bars carry the bands', near(rankBars(s)[0].x0, 9.5 / 17) && near(rankBars(s)[0].x1, 12.7 / 17));
  ok('without the ranges, Job A leads', ranking(sanitizeCompare(jobs())).leader === 'a');
  // an exact tie that floating point would miss
  const tie = sanitizeCompare({
    options: [{ name: 'Steady' }, { name: 'Swingy' }],
    criteria: [{ name: 'Now', weight: 6 }, { name: 'Later', weight: 4 }],
    scores: [
      { option: 'Steady', criterion: 'Now', value: 4.34 },
      { option: 'Steady', criterion: 'Later', value: 4.34 },
      { option: 'Swingy', criterion: 'Now', value: 5.9 },
      { option: 'Swingy', criterion: 'Later', value: 2 },
    ],
  });
  ok('(in floating point, 6·5.9 + 4·2 over 10 comes out a hair above 6·4.34 + 4·4.34 over 10 — both are 4.34)', (6 * 5.9 + 4 * 2) / 10 > (6 * 4.34 + 4 * 4.34) / 10);
  const tr = ranking(tie);
  ok('an exact tie is a tie, decided in whole hundredths: too close to call, in the options’ own order', tr.tooClose && tr.leader === null && tr.entries[0].name === 'Steady' && tr.entries[0].total === 4.34 && tr.entries[1].total === 4.34);
  ok('  and the facts say they are level', kindOf('compare').facts(tie, { guarded: false }).includes('Steady and Swingy are level.'));
}

console.log('\n=== sensitivity: the weight at which the order turns, by hand ===');
{
  const s = sanitizeCompare(jobs());
  const sen = sensitivity(s);
  const f = (c, sv = sen) => sv.flips.find((x) => x.criterion === c);
  ok('for the top two: Job A over Job B, by 13/17', sen.leader === 'a' && sen.runnerUp === 'b' && near(sen.gap, 13 / 17));
  // commute at weight w, the others held: Job A (72 + 35 + 3w)/(13 + w), Job B (40 + 30 + 9w)/(13 + w).
  // Level when 107 + 3w = 70 + 9w: w = 37/6 ≈ 6.17. It weighs 4, so it would have to rise.
  ok('commute: level at w = (70 − 107)/(3 − 9) = 37/6, above its weight of 4', near(f('com').at, 37 / 6) && f('com').dir === 'up' && f('com').weight === 4, J(f('com')));
  ok('  and the first whole weight at which Job B leads is 7', f('com').whole === 7);
  // salary: Job A (12 + 35 + 9w)/(9 + w), Job B (36 + 30 + 5w)/(9 + w) — level when 47 + 9w = 66 + 5w: w = 19/4
  ok('salary: level at w = (66 − 47)/(9 − 5) = 4.75, below its weight of 8; Job B leads at 4', f('sal').at === 4.75 && f('sal').dir === 'down' && f('sal').whole === 4, J(f('sal')));
  // growth: level when 84 + 7w = 76 + 6w: w = −8, outside 0..10
  ok('growth: level only at w = −8, so no weight from 0 to 10 turns it', f('gro').at === null && f('gro').dir === null && f('gro').whole === null);

  // the reweighting itself, computed: commute to 7
  const c = create(EMPTY_SPACE, 'compare', jobs(), { name: 'C1', origin: 'socria' });
  const r = apply(c.space, c.obj.id, 'weight', { criterion: 'com', weight: 7, by: 'person' }, { by: 'person', at: 1 });
  const rk = ranking(currentOf(r.obj));
  // Job B (40 + 63 + 30)/20 = 133/20 = 6.65, Job A (72 + 21 + 35)/20 = 128/20 = 6.4
  ok('reweighting commute to 7 turns the ranking: Job B 133/20 = 6.65 over Job A 128/20 = 6.4', r.ok && rk.entries[0].option === 'b' && rk.entries[0].total === 6.65 && rk.entries[1].total === 6.4, J(rk.entries));
  ok('  and the step says so, as a computed fact', r.step?.note === 'Job B now leads Job A: 6.65 to 6.4.', r.step?.note);
  const six = apply(c.space, c.obj.id, 'weight', { criterion: 'com', weight: 6, by: 'person' }, { by: 'person', at: 1 });
  // Job A (107 + 18)/19 = 125/19, Job B (70 + 54)/19 = 124/19
  ok('  at 6, Job A still leads: 125/19 to 124/19', ranking(currentOf(six.obj)).entries[0].option === 'a' && six.step?.note === 'Job A still leads Job B: 6.58 to 6.53.', six.step?.note);

  // when the two are not scored on the same criteria, the equation is a quadratic
  const q = sanitizeCompare({
    options: [{ id: 'x', name: 'Laptop X' }, { id: 'y', name: 'Laptop Y' }],
    criteria: [{ id: 'p', name: 'Price', weight: 5 }, { id: 'q', name: 'Quality', weight: 5 }, { id: 's', name: 'Support', weight: 5 }],
    scores: [
      { option: 'x', criterion: 'p', value: 8 },
      { option: 'x', criterion: 'q', value: 4 },
      { option: 'x', criterion: 's', value: 6 },
      { option: 'y', criterion: 'p', value: 3 },
      { option: 'y', criterion: 'q', value: 8 },
    ],
  });
  // X = 90/15 = 6 over three criteria; Y = 55/10 = 5.5 over two (no support score).
  // Quality at w: X (70 + 4w)/(10 + w), Y (15 + 8w)/(5 + w) — level when (70 + 4w)(5 + w) = (15 + 8w)(10 + w),
  // that is 4w² + 5w − 200 = 0, w = (−5 + √3225)/8 ≈ 6.47
  const qs = sensitivity(q);
  const T = (n, a, d, w) => (n + a * w) / (d + w);
  ok('with different coverage the order turns at a root of 4w² + 5w − 200 = 0: w = (−5 + √3225)/8', qs.leader === 'x' && near(f('q', qs).at, (-5 + Math.sqrt(3225)) / 8) && f('q', qs).dir === 'up', J(f('q', qs)));
  ok('  where the two totals are equal', near(T(70, 4, 10, f('q', qs).at), T(15, 8, 5, f('q', qs).at)));
  ok('  at 6 Laptop X leads (94/16 to 63/11); at 7 Laptop Y does (71/12 to 98/17)', T(70, 4, 10, 6) > T(15, 8, 5, 6) && T(70, 4, 10, 7) < T(15, 8, 5, 7) && f('q', qs).whole === 7);
  // every turning weight, checked against totals worked out here, independently
  const direct = (st, o, k, w) => {
    let n = 0, d = 0;
    for (const c of st.criteria) {
      const x = st.scores.find((y) => y.option === o && y.criterion === c.id);
      if (!x || x.value === null) continue;
      const wc = c.id === k ? w : c.weight;
      n += wc * x.value;
      d += wc;
    }
    return d ? n / d : null;
  };
  for (const [name, st] of [['the job offers', s], ['the laptops', q]]) {
    const sv = sensitivity(st);
    for (const fl of sv.flips.filter((x) => x.at !== null)) {
      ok(`  ${name}, ${fl.criterion}: at the turning weight the totals are equal, and at ${fl.whole} the runner-up leads`, near(direct(st, sv.leader, fl.criterion, fl.at), direct(st, sv.runnerUp, fl.criterion, fl.at)) && direct(st, sv.runnerUp, fl.criterion, fl.whole) > direct(st, sv.leader, fl.criterion, fl.whole));
    }
  }

  // level now: any move of a weight they differ on decides it
  const lv = sanitizeCompare({
    options: [{ id: 'u', name: 'Uptown' }, { id: 'd', name: 'Downtown' }],
    criteria: [{ id: 'n', name: 'Quiet', weight: 5 }, { id: 'v', name: 'View', weight: 5 }],
    scores: [
      { option: 'u', criterion: 'n', value: 4 },
      { option: 'u', criterion: 'v', value: 8 },
      { option: 'd', criterion: 'n', value: 8 },
      { option: 'd', criterion: 'v', value: 4 },
    ],
  });
  const ls = sensitivity(lv);
  // both (5·4 + 5·8)/10 = 6: more weight on quiet favours Downtown, less weight on view does too
  ok('level now: the order turns right at the present weight — quiet up, or view down, puts Downtown ahead', ls.gap === 0 && ls.leader === 'u' && J(ls.flips.map((x) => [x.criterion, x.at, x.dir, x.whole])) === J([['n', 5, 'up', 6], ['v', 5, 'down', 4]]), J(ls.flips));

  // the strips a renderer draws
  const strip = flipStrip(s);
  const row = (c) => strip.rows.find((x) => x.criterion === c);
  ok('each sensitivity strip runs 0..1 end to end, with no gaps', strip.rows.every((r) => r.segments[0].from === 0 && r.segments[r.segments.length - 1].to === 1 && r.segments.every((g, i) => i === 0 || g.from === r.segments[i - 1].to)));
  ok('  the leader leads where each weight is now', strip.rows.every((r) => r.segments.find((g) => g.from <= r.now && r.now <= g.to).lead === 'a'));
  ok('  commute: Job A up to 37/60 of the way, Job B after', row('com').now === 0.4 && near(row('com').flip, 37 / 60) && row('com').segments.length === 2 && row('com').segments[1].lead === 'b');
  ok('  salary: Job B below 0.475', row('sal').segments[0].lead === 'b' && row('sal').segments[0].to === 0.475);
  ok('  growth: Job A all the way', row('gro').segments.length === 1 && row('gro').flip === null);
  ok('fewer than two totals: no sensitivity', sensitivity(sanitizeCompare({ ...jobs(), scores: jobs().scores.filter((x) => x.option === 'a') })) === null);
}

console.log('\n=== every edit is an operation, computed and undoable ===');
{
  const k = kindOf('compare');
  const fresh = (raw = jobs()) => create(EMPTY_SPACE, 'compare', raw, { name: 'C1', origin: 'socria' });
  const run = (op, args, by = 'person', raw) => {
    const c = fresh(raw);
    return apply(c.space, c.obj.id, op, args, { by, at: 1 });
  };
  const st = (r) => (r.ok ? currentOf(r.obj) : null);
  const canonical = (r) => r.ok && stableKey(k.sanitize(JSON.parse(J(st(r))))) === stableKey(st(r));

  ok('the comparison is an object of thought', fresh().obj.kind === 'compare' && k.label === 'Comparison');
  // options
  let r = run('addOption', { name: 'Freelancing', note: 'my own hours', by: 'person' });
  ok('an option is added, with a fresh id, its note and its author', r.ok && J(st(r).options[2]) === J({ id: 'o1', name: 'Freelancing', note: 'my own hours', by: 'person' }) && canonical(r), J(st(r)?.options));
  ok('  a name already used is refused', /already an option called/.test(run('addOption', { name: 'job a', by: 'person' }).why ?? ''));
  ok('  so is no name', !run('addOption', { name: '   ', by: 'person' }).ok);
  const eight = { ...jobs(), options: Array.from({ length: 8 }, (_, i) => ({ id: `x${i}`, name: `Choice ${i}` })) };
  ok('  and a ninth option', /8 options at most/.test(run('addOption', { name: 'Ninth', by: 'person' }, 'person', eight).why ?? ''));
  r = run('renameOption', { id: 'b', name: 'Birch Labs', by: 'person' });
  ok('an option is renamed', r.ok && st(r).options[1].name === 'Birch Labs' && canonical(r));
  ok('  and, renamed by the person, is theirs', st(r).options[1].by === 'person');
  ok('  not to a name another option has', !run('renameOption', { id: 'b', name: 'JOB A' }).ok);
  ok('  nor to the name it has', /already called that/.test(run('renameOption', { id: 'b', name: 'Job B' }).why ?? ''));
  ok('  nor an option that is not there', !run('renameOption', { id: 'zz', name: 'Q1' }).ok);
  const three = jobs();
  three.options.push({ id: 'f', name: 'Freelancing', by: 'socria' });
  three.scores.push({ option: 'f', criterion: 'sal', value: 4, by: 'socria' });
  r = run('removeOption', { id: 'f' }, 'person', three);
  ok('an option is removed, and its scores with it', r.ok && st(r).options.length === 2 && !st(r).scores.some((x) => x.option === 'f') && canonical(r));
  ok('  but never below two options', /at least 2 options/.test(run('removeOption', { id: 'b' }).why ?? ''));

  // criteria
  r = run('addCriterion', { name: 'Team', weight: 7, by: 'person' });
  ok('a criterion is added with its weight', r.ok && J(st(r).criteria[3]) === J({ id: 'c1', name: 'Team', weight: 7, by: 'person' }) && canonical(r), J(st(r)?.criteria));
  ok('  without one it weighs 5', st(run('addCriterion', { name: 'Team', by: 'person' })).criteria[3].weight === 5);
  ok('  a weight is a whole number from 0 to 10', !run('addCriterion', { name: 'Team', weight: 11, by: 'person' }).ok && !run('addCriterion', { name: 'Team', weight: 2.5, by: 'person' }).ok);
  ok('  a name already used is refused', !run('addCriterion', { name: 'salary', by: 'person' }).ok);
  const ten = { ...jobs(), criteria: Array.from({ length: 10 }, (_, i) => ({ id: `k${i}`, name: `Factor ${i}` })) };
  ok('  and an eleventh criterion', /10 criteria at most/.test(run('addCriterion', { name: 'Eleventh', by: 'person' }, 'person', ten).why ?? ''));
  r = run('renameCriterion', { id: 'com', name: 'Travel time', by: 'person' });
  ok('a criterion is renamed', r.ok && st(r).criteria[1].name === 'Travel time' && canonical(r));
  r = run('removeCriterion', { id: 'gro' });
  ok('a criterion is removed, and its scores with it', r.ok && st(r).criteria.length === 2 && !st(r).scores.some((x) => x.criterion === 'gro') && canonical(r));
  ok('  but never the last one', /at least one criterion/.test(run('removeCriterion', { id: 'sal' }, 'person', { ...jobs(), criteria: [jobs().criteria[0]] }).why ?? ''));

  // weights
  r = run('weight', { criterion: 'gro', weight: 9, by: 'person' });
  ok('a weight is set', r.ok && st(r).criteria[2].weight === 9 && canonical(r));
  ok('  as a whole number from 0 to 10', !run('weight', { criterion: 'gro', weight: 11 }).ok && !run('weight', { criterion: 'gro', weight: 2.5 }).ok && !run('weight', { criterion: 'gro', weight: '' }).ok && !run('weight', { criterion: 'gro', weight: -1 }).ok);
  ok('  0 is a weight: the criterion stops counting', run('weight', { criterion: 'gro', weight: 0 }).ok);
  ok('  the weight it has already is refused, and why', /already weighs 5/.test(run('weight', { criterion: 'gro', weight: 5 }).why ?? ''));
  ok('  as is a criterion that is not there', !run('weight', { criterion: 'nope', weight: 3 }).ok);

  // scores
  r = run('score', { option: 'a', criterion: 'com', value: 5, by: 'socria' }, 'socria');
  ok('a score is set — and replaces the one there', r.ok && scoreOf(st(r), 'a', 'com').value === 5 && st(r).scores.length === 6 && canonical(r));
  ok('  and the step says what it did to the total: (72 + 20 + 35)/17 = 7.47', r.step.note === 'Job A’s total is now 7.47.', r.step.note);
  r = run('score', { option: 'b', criterion: 'gro', value: 6.5, low: 5, high: 9, by: 'socria' }, 'socria');
  ok('a score is set with a range', r.ok && J(scoreOf(st(r), 'b', 'gro')) === J({ option: 'b', criterion: 'gro', value: 6.5, low: 5, high: 9, by: 'socria' }) && r.step.said === 'scored 6.5 (5–9)');
  ok('  a range must hold its score', /low ≤ score ≤ high/.test(run('score', { option: 'b', criterion: 'gro', value: 6, low: 7, by: 'socria' }, 'socria').why ?? ''));
  ok('  and run within 0..10', !run('score', { option: 'b', criterion: 'gro', value: 6, high: 12, by: 'socria' }, 'socria').ok);
  ok('  a score is from 0 to 10', /from 0 to 10/.test(run('score', { option: 'b', criterion: 'gro', value: 11, by: 'socria' }, 'socria').why ?? '') && !run('score', { option: 'b', criterion: 'gro', value: 'good', by: 'socria' }, 'socria').ok);
  ok('  for an option and a criterion that are there', !run('score', { option: 'zz', criterion: 'gro', value: 5, by: 'socria' }, 'socria').ok && !run('score', { option: 'a', criterion: 'zz', value: 5, by: 'socria' }, 'socria').ok);
  r = run('score', { option: 'b', criterion: 'com', value: '', by: 'socria' }, 'socria');
  ok('clearing a score leaves the pair unscored — its note, a fact, stays', r.ok && scoreOf(st(r), 'b', 'com').value === null && scoreOf(st(r), 'b', 'com').note === '15 min walk' && r.step.said === 'score cleared');
  r = run('score', { option: 'a', criterion: 'gro', value: '', by: 'socria' }, 'socria');
  ok('  with no note the pair is simply gone', r.ok && scoreOf(st(r), 'a', 'gro') === null && completeness(st(r)).missing.length === 1);
  ok('  clearing nothing is refused', /no score there/.test(run('score', { option: 'a', criterion: 'gro', value: '' }, 'person', { ...jobs(), scores: [] }).why ?? ''));
  ok('  a range with no score is refused', !run('score', { option: 'a', criterion: 'gro', value: '', low: 3, by: 'socria' }, 'socria').ok);
  ok('  the same score again is refused', /exactly that score/.test(run('score', { option: 'a', criterion: 'gro', value: 7, by: 'socria' }, 'socria').why ?? ''));

  // notes
  r = run('note', { option: 'a', criterion: 'com', note: '45 min by train', by: 'socria' }, 'socria');
  ok('a note on a pair is kept beside its score', r.ok && scoreOf(st(r), 'a', 'com').note === '45 min by train' && scoreOf(st(r), 'a', 'com').value === 3);
  r = run('note', { option: 'b', criterion: 'sal', note: '$1,200/month', by: 'person' }, 'person', { ...jobs(), scores: [] });
  ok('a note on an unscored pair is a fact with no judgment yet', r.ok && J(scoreOf(st(r), 'b', 'sal')) === J({ option: 'b', criterion: 'sal', value: null, note: '$1,200/month', by: 'person' }));
  ok('  and leaves it unscored', completeness(st(r)).scored === 0);
  r = run('note', { option: 'a', note: 'Acme, remote on Fridays', by: 'socria' }, 'socria');
  ok('a note on the option itself', r.ok && st(r).options[0].note === 'Acme, remote on Fridays');
  r = run('note', { option: 'b', criterion: 'com', note: '', by: 'socria' }, 'socria');
  ok('a note is cleared', r.ok && !('note' in scoreOf(st(r), 'b', 'com')) && r.step.said === 'note cleared');
  ok('  clearing a note that is not there is refused', !run('note', { option: 'a', criterion: 'gro', note: '' }).ok);
  ok('  and a note step must say what the note is', /Say what the note is/.test(run('note', { option: 'a', criterion: 'com' }).why ?? ''));

  // its name and how it is shown
  ok('renamed', st(run('title', { title: 'Which job?' })).title === 'Which job?');
  ok('shown as the ranking', st(run('view', { view: 'ranking' })).view === 'ranking');
  const unscored = jobs();
  unscored.options.push({ id: 'f', name: 'Freelancing' });
  ok('  the ranking waits until every option has a score, and says which has none', /Freelancing has no score yet/.test(run('view', { view: 'ranking' }, 'person', unscored).why ?? ''));
  const thin = { ...jobs(), scores: jobs().scores.filter((x) => x.criterion === 'sal') };
  ok('  the sensitivity view waits until two options are scored on two criteria each', /at least two options scored on at least two criteria/.test(run('view', { view: 'sensitivity' }, 'person', thin).why ?? ''));
  ok('  and shows when they are', st(run('view', { view: 'sensitivity' })).view === 'sensitivity');
  ok('  there is no pie view', !run('view', { view: 'pie' }).ok);

  // a working session: every step computed, kept, undoable — and replayed on load
  const c = fresh();
  let space = c.space;
  const id = c.obj.id;
  let at = 10;
  const step = (op, args, by = 'person') => {
    const x = apply(space, id, op, args, { by, at: at++ });
    if (x.ok) space = x.space;
    return x;
  };
  ok('a session: add an option', step('addOption', { name: 'Freelancing', by: 'person' }).ok);
  ok('  score it, once with a range', step('score', { option: 'o1', criterion: 'sal', value: 4, by: 'person' }).ok && step('score', { option: 'o1', criterion: 'gro', value: 9, low: 7, high: 10, by: 'person' }).ok);
  ok('  add a criterion', step('addCriterion', { name: 'Team', weight: 6, by: 'person' }).ok);
  ok('  weigh commute more', step('weight', { criterion: 'com', weight: 7, by: 'person' }).ok);
  ok('  rank them', step('view', { view: 'ranking' }).ok && currentOf(space.objs[0]).view === 'ranking');
  ok('  and name it', step('title', { title: 'Which job?' }).ok);
  const now = space.objs[0].at;
  ok('every step is kept', now === 7 && space.objs[0].steps.length === 7);
  space = seek(space, id, now - 3);
  ok('undo steps back without losing anything: commute weighs 4 again', currentOf(space.objs[0]).criteria.find((x) => x.id === 'com').weight === 4 && space.objs[0].states.length === 8);
  space = seek(space, id, now);
  ok('…and redo steps forward', currentOf(space.objs[0]).title === 'Which job?');
  const back = sanitizeSpace(JSON.parse(J(space)));
  ok('the whole history survives a save: every step re-computed', back.objs[0].steps.length === 7 && stableKey(currentOf(back.objs[0])) === stableKey(currentOf(space.objs[0])));
  ok('  and what each step showed is said again on load', back.objs[0].steps.some((x) => x.note === 'Job B now leads Job A: 6.65 to 6.4.') && J(back.objs[0].steps.map((x) => x.note)) === J(space.objs[0].steps.map((x) => x.note)));
  // past the cap the oldest states go, and what is kept still replays
  let long = fresh().space;
  for (let i = 0; i < 15; i++) {
    const x = apply(long, id, 'weight', { criterion: 'gro', weight: i % 2 ? 3 : 8, by: 'person' }, { by: 'person', at: 100 + i });
    if (x.ok) long = x.space;
  }
  ok('a long history keeps its latest 12 states', long.objs[0].states.length === 12 && long.objs[0].trimmed === 4);
  const longBack = sanitizeSpace(JSON.parse(J(long)));
  ok('  and every one of them replays on load', longBack.objs[0].states.length === 12 && stableKey(currentOf(longBack.objs[0])) === stableKey(currentOf(long.objs[0])));
}

console.log('\n=== what the person judged is theirs ===');
{
  const c = create(EMPTY_SPACE, 'compare', jobs(), { name: 'C1', origin: 'socria' });
  const id = c.obj.id;
  const as = (by, op, args, space = c.space) => apply(space, id, op, args, { by, at: 2 });
  // the person's own: the salary criterion (and its weight) and Job A's salary score
  ok('Socria cannot re-score the person’s score', !as('socria', 'score', { option: 'a', criterion: 'sal', value: 6, by: 'socria' }).ok);
  ok('  nor clear it', !as('socria', 'score', { option: 'a', criterion: 'sal', value: '', by: 'socria' }).ok);
  ok('  nor change its note', !as('socria', 'note', { option: 'a', criterion: 'sal', note: 'pre-tax', by: 'socria' }).ok);
  ok('  and says why', /yours/.test(as('socria', 'score', { option: 'a', criterion: 'sal', value: 6, by: 'socria' }).why));
  ok('Socria cannot change the weight the person gave', /yours/.test(as('socria', 'weight', { criterion: 'sal', weight: 3 }).why ?? ''));
  ok('  nor rename or remove their criterion', !as('socria', 'renameCriterion', { id: 'sal', name: 'Pay' }).ok && !as('socria', 'removeCriterion', { id: 'sal' }).ok);
  ok('it can change what it wrote: its own scores and weights', as('socria', 'score', { option: 'b', criterion: 'sal', value: 6, by: 'socria' }).ok && as('socria', 'weight', { criterion: 'gro', weight: 6 }).ok);
  ok('it can add options and criteria', as('socria', 'addOption', { name: 'Stay put', by: 'socria' }).ok && as('socria', 'addCriterion', { name: 'Team', by: 'socria' }).ok);
  ok('nobody can claim to be someone else', !as('socria', 'score', { option: 'b', criterion: 'sal', value: 6, by: 'person' }).ok && !as('person', 'score', { option: 'b', criterion: 'sal', value: 6, by: 'socria' }).ok && !as('socria', 'weight', { criterion: 'gro', weight: 6, by: 'person' }).ok && !as('socria', 'addOption', { name: 'Forged', by: 'person' }).ok);
  // what the person changes becomes theirs
  const set = as('person', 'weight', { criterion: 'com', weight: 6, by: 'person' });
  ok('a weight the person sets on Socria’s criterion is theirs from then on', set.ok && currentOf(set.obj).criteria.find((x) => x.id === 'com').by === 'person');
  ok('  so Socria cannot set it back', !as('socria', 'weight', { criterion: 'com', weight: 4 }, set.space).ok);
  const rescored = as('person', 'score', { option: 'b', criterion: 'com', value: 8, by: 'person' });
  ok('a score the person gives over Socria’s is theirs — the note stays', rescored.ok && scoreOf(currentOf(rescored.obj), 'b', 'com').by === 'person' && scoreOf(currentOf(rescored.obj), 'b', 'com').note === '15 min walk');
  ok('  and Socria cannot touch it', !as('socria', 'score', { option: 'b', criterion: 'com', value: 9, by: 'socria' }, rescored.space).ok);
  const unsaid = as('person', 'score', { option: 'a', criterion: 'sal', value: 8 });
  ok('a step that does not say who judged it leaves the pair with its owner: the person’s stays theirs', unsaid.ok && scoreOf(currentOf(unsaid.obj), 'a', 'sal').by === 'person');
  // removing would take the person's judgments with it
  const three = jobs();
  three.options.push({ id: 'f', name: 'Freelancing', by: 'socria' });
  three.scores.push({ option: 'f', criterion: 'gro', value: 9, by: 'person' });
  const c3 = create(EMPTY_SPACE, 'compare', three, { name: 'C2', origin: 'socria' });
  ok('Socria cannot remove even its own option once the person has scored it', /your scores/.test(apply(c3.space, c3.obj.id, 'removeOption', { id: 'f' }, { by: 'socria', at: 3 }).why ?? ''));
  ok('  nor its own criterion', /your scores/.test(apply(c3.space, c3.obj.id, 'removeCriterion', { id: 'gro' }, { by: 'socria', at: 3 }).why ?? ''));
  ok('  the person can', apply(c3.space, c3.obj.id, 'removeOption', { id: 'f' }, { by: 'person', at: 3 }).ok);
  // a forged history is cut on load
  const forged = JSON.parse(J(c.space));
  const s0 = currentOf(forged.objs[0]);
  const s1 = { ...s0, scores: s0.scores.map((x) => (x.option === 'a' && x.criterion === 'sal' ? { ...x, value: 2, by: 'socria' } : x)) };
  forged.objs[0].states = [s0, s1];
  forged.objs[0].steps = [{ op: 'score', args: { option: 'a', criterion: 'sal', value: 2, by: 'socria' }, said: 'x', by: 'socria', at: 3 }];
  forged.objs[0].at = 1;
  const read = sanitizeSpace(forged);
  ok('a stored step in which Socria re-scored the person’s cell is cut on load', read.objs[0].states.length === 1 && scoreOf(currentOf(read.objs[0]), 'a', 'sal').value === 9 && scoreOf(currentOf(read.objs[0]), 'a', 'sal').by === 'person');
  const claimed = JSON.parse(J(c.space));
  const t0 = currentOf(claimed.objs[0]);
  claimed.objs[0].states = [t0, { ...t0, criteria: t0.criteria.map((x) => (x.id === 'com' ? { ...x, weight: 9, by: 'person' } : x)) }];
  claimed.objs[0].steps = [{ op: 'weight', args: { criterion: 'com', weight: 9, by: 'person' }, said: 'x', by: 'socria', at: 3 }];
  claimed.objs[0].at = 1;
  ok('  as is a stored step in which Socria claims to be the person', sanitizeSpace(claimed).objs[0].states.length === 1);
  claimed.objs[0].steps[0].by = 'person';
  ok('  while the same step, taken by the person, replays', sanitizeSpace(claimed).objs[0].states.length === 2);
}

console.log('\n=== words become operations only when they plainly are one ===');
{
  const s = sanitizeCompare(jobs());
  const r = (t, st = s) => readCompareOp(t, st, TODAY);
  const is = (t, want, st) => ok(`"${t}"`, J(r(t, st)) === J(want), J(r(t, st)));
  const w = (criterion, weight) => ({ op: 'weight', args: { criterion, weight, by: 'person' } });
  is('set the weight of salary to 6', w('sal', 6));
  is('make growth more important', w('gro', 7));
  is('make salary more important', w('sal', 10));
  is('salary matters less', w('sal', 6));
  is('what if commute mattered more', w('com', 6));
  is('what if commute mattered more?', w('com', 6));
  is('I care more about growth', w('gro', 7));
  is('make growth less important by 3', w('gro', 2));
  is("lower commute's weight", w('com', 2));
  is('raise the weight of growth to 9', w('gro', 9));
  is('salary matters most', w('sal', 10));
  is('score Job A 7 on salary', { op: 'score', args: { option: 'a', criterion: 'sal', value: 7, by: 'person' } });
  is('give Job B a 4 for commute', { op: 'score', args: { option: 'b', criterion: 'com', value: 4, by: 'person' } });
  is('give Job A a 7/10 on growth', { op: 'score', args: { option: 'a', criterion: 'gro', value: 7, by: 'person' } });
  is('rate Job B 8 on growth, somewhere between 6 and 9', { op: 'score', args: { option: 'b', criterion: 'gro', value: 8, low: 6, high: 9, by: 'person' } });
  is("clear Job B's score on commute", { op: 'score', args: { option: 'b', criterion: 'com', value: '', by: 'person' } });
  is('add an option: Freelancing', { op: 'addOption', args: { name: 'Freelancing', by: 'person' } });
  is('add Freelancing as an option', { op: 'addOption', args: { name: 'Freelancing', by: 'person' } });
  is('can you add an option: Freelancing?', { op: 'addOption', args: { name: 'Freelancing', by: 'person' } });
  is('add a criterion: team', { op: 'addCriterion', args: { name: 'team', by: 'person' } });
  is('add a criterion: growth', { op: 'addCriterion', args: { name: 'growth', by: 'person' } });
  ok('  (growth is already a criterion here, so taking that step is refused, and why)', /already a criterion called ‘growth’/.test(apply(create(EMPTY_SPACE, 'compare', jobs(), { name: 'C1', origin: 'socria' }).space, 'C1', 'addCriterion', { name: 'growth', by: 'person' }, { by: 'person', at: 1 }).why ?? ''));
  is('add a criterion: work-life balance, weight 8', { op: 'addCriterion', args: { name: 'work-life balance', weight: 8, by: 'person' } });
  is('remove commute', { op: 'removeCriterion', args: { id: 'com' } });
  is('drop Job B', { op: 'removeOption', args: { id: 'b' } });
  is('rename Job A to Acme', { op: 'renameOption', args: { id: 'a', name: 'Acme', by: 'person' } });
  is('rename commute to travel time', { op: 'renameCriterion', args: { id: 'com', name: 'travel time', by: 'person' } });
  is('note for Job A on growth: promotion after a year', { op: 'note', args: { option: 'a', criterion: 'gro', note: 'promotion after a year', by: 'person' } });
  is('show the ranking', { op: 'view', args: { view: 'ranking' } });
  is('show the sensitivity', { op: 'view', args: { view: 'sensitivity' } });
  is('sensitivity', { op: 'view', args: { view: 'sensitivity' } });
  is('show the matrix', { op: 'view', args: { view: 'matrix' } });
  is('matrix', { op: 'view', args: { view: 'matrix' } });
  is('back to the matrix', { op: 'view', args: { view: 'matrix' } });
  is('can you rank them?', { op: 'view', args: { view: 'ranking' } });
  // a name with a number in it is not a score
  const offers = sanitizeCompare({ options: [{ id: 'o2', name: 'Offer 2' }, { id: 'o3', name: 'Offer 3' }], criteria: [{ id: 'pay', name: 'Pay' }] });
  is('score Offer 2 6 on pay', { op: 'score', args: { option: 'o2', criterion: 'pay', value: 6, by: 'person' } }, offers);
  // at the ends of the scale
  const top = sanitizeCompare({ ...jobs(), criteria: jobs().criteria.map((c) => (c.id === 'sal' ? { ...c, weight: 10 } : c.id === 'com' ? { ...c, weight: 0 } : c)) });
  const ct = create(EMPTY_SPACE, 'compare', top, { name: 'C1', origin: 'person' });
  const more = r('make salary more important', top);
  ok('"more important" stops at 10', more.args.weight === 10);
  const tried = apply(ct.space, ct.obj.id, more.op, more.args, { by: 'person', at: 1 });
  ok('  and when it is there already, says so', !tried.ok && /already weighs 10, the most a weight can be/.test(tried.why));
  const less = r('commute matters less', top);
  ok('"matters less" stops at 0 — and says the criterion does not count', less.args.weight === 0 && /does not count at all/.test(apply(ct.space, ct.obj.id, less.op, less.args, { by: 'person', at: 1 }).why ?? ''));
  // in a workspace, the words find the comparison and its parts
  const sp = create(EMPTY_SPACE, 'compare', jobs(), { name: 'C1', origin: 'socria' }).space;
  const found = readOperation(sp, 'score Job B 7 on growth');
  ok('in a workspace, the words find the comparison and its parts', J(found) === J({ id: 'C1', op: 'score', args: { option: 'b', criterion: 'gro', value: 7, by: 'person' } }), J(found));
  ok('  and the step they ask for is computed, as the person’s', (() => { const x = apply(sp, found.id, found.op, found.args, { by: 'person', at: 1 }); return x.ok && scoreOf(currentOf(x.obj), 'b', 'gro').by === 'person'; })());
  // what must be left to the conversation
  for (const t of [
    'I think salary is important',
    'what should I pick?',
    'which job pays more?',
    'my commute would be 40 minutes at Job A',
    'add more detail to your last answer',
    'salary is more important than commute',
    'the matrix is confusing',
    "I'd rate this conversation 9 out of 10",
    'remove the noise from the data',
    'should salary matter more?',
    'Job A pays 7k more',
    'give me a minute',
    'what does the weight mean?',
    'I weigh 70 kg',
    'show me how you got that',
    'score it again',
    'Job A matters more',
    'how is the total computed?',
    'add a note to my calendar',
  ]) {
    ok(`left to the conversation: "${t}"`, r(t) === null, J(r(t)));
  }
}

console.log('\n=== what the conversation is told ===');
{
  const k = kindOf('compare');
  const s = sanitizeCompare(jobs());
  const facts = k.facts(s, { guarded: false });
  ok('the facts give the totals', facts.includes('Weighted totals out of 10: Job A 7; Job B 6.24.'), J(facts));
  ok('  who leads, and by how much', facts.includes('Job A leads Job B by 0.76.'));
  ok('  what separates them most', facts.includes('Salary separates them most: Job A 9 against Job B 5, at weight 8.'));
  ok('  and which weights would turn the order', facts.includes('If Commute weighed more than 6.17 (it weighs 4), Job B would lead — at 7 it does.') && facts.includes('If Salary weighed less than 4.75 (it weighs 8), Job B would lead — at 4 it does.') && facts.includes('No weight from 0 to 10 on Growth changes the order of Job A and Job B.'));
  ok('  and what is the person’s own', facts.some((x) => /person’s own; Socria does not change those/.test(x)));
  const guarded = k.facts(s, { guarded: true });
  ok('while the person works it out, the totals and what follows from them are withheld', !guarded.some((x) => /Weighted totals|leads|would lead|separates/.test(x)) && guarded.some((x) => /withheld/.test(x)));
  const text = k.text(s);
  ok('the text has every weight, score and note, and marks what is theirs', /Salary \(weight 8\) · theirs/.test(text) && /Salary 9 “\$95k base” · theirs/.test(text) && /Commute 9 “15 min walk”/.test(text) && /Acme, downtown/.test(text));
  ok('  and states no total: those are facts, held back when guarded', !/total/i.test(text));
  const huge = sanitizeCompare({
    options: Array.from({ length: 8 }, (_, i) => ({ name: `Option number ${i} with a long name here` })),
    criteria: Array.from({ length: 10 }, (_, i) => ({ name: `Criterion ${i} also long`, weight: i })),
    scores: Array.from({ length: 80 }, (_, i) => ({ option: `o${Math.floor(i / 10) + 1}`, criterion: `c${(i % 10) + 1}`, value: i % 11, low: 0, high: 10, note: 'a note that is fairly long too' })),
  });
  ok('the text is capped', huge.scores.length === 80 && k.text(huge).length <= 2400);
  for (const v of ['matrix', 'ranking', 'sensitivity']) {
    const z = k.size({ ...huge, view: v }, 'live');
    ok(`a live ${v} at the most it holds fits in 720 × 640`, z.w > 0 && z.h > 0 && z.w <= 720 && z.h <= 640);
  }
  ok('a card is 260 × 150 and a step in a trail 200 × 110', J(k.size(s, 'card')) === J({ w: 260, h: 150 }) && J(k.size(s, 'trail')) === J({ w: 200, h: 110 }));
  ok('its shape in a line', k.shape(s) === 'comparison · 2 options × 3 criteria' && k.shape({ ...s, view: 'ranking' }) === 'ranking · 2 options × 3 criteria');
  ok('its parts are its options and criteria', J(k.parts(s).map((p) => p.id)) === J(['a', 'b', 'sal', 'com', 'gro']));
  ok('  each with what is computed about it', J(k.partFacts(s, 'a')) === J(['Job A', 'Acme, downtown', 'total 7, first of 2', 'from Socria']) && k.partFacts(s, 'com').includes('the top two turn at weight 6.17') && k.partFacts(s, 'sal').includes('yours'), J(k.partFacts(s, 'com')));
  ok('it is a display: a comparison, named C1, C2 …', COMPARE_META.kind === 'compare' && COMPARE_META.noun === 'comparison' && COMPARE_META.handle === 'C' && COMPARE_META.about.length > 0);
  const described = describeObject(create(EMPTY_SPACE, 'compare', jobs(), { name: 'C1', origin: 'socria' }).obj, { guarded: false }).join('\n');
  ok('the reply model is told the comparison as it is', /Comparison C1 — comparison · 2 options × 3 criteria/.test(described) && /COMPARISON “Two job offers”/.test(described) && /Job A leads Job B by 0\.76/.test(described));
}

console.log('\n=== under fuzz: 400 random proposals, 300 random sessions ===');
{
  let seed = 20261010;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
  const names = ['Job A', 'job a', 'Job B', 'Freelance', 'Stay', '', '  ', 'X'.repeat(90), 'Salary', 'Commute', 'Growth', 'Team', 'Perks', null, 7];
  const ids = ['a', 'b', 'o1', 'o2', 'c1', 'sal', 'com', 'bad id!', '', null, 'x'.repeat(30)];
  const vals = [0, 1, 5, 7.5, 10, 10.5, -1, '7', '', null, 'n/a', 3.333, 9.999, NaN, Infinity];
  const gen = () => ({
    title: pick(['Choice', '', null, 'T'.repeat(200)]),
    view: pick(['matrix', 'ranking', 'sensitivity', 'pie', undefined]),
    options: Array.from({ length: Math.floor(rnd() * 11) }, () => ({ id: pick(ids), name: pick(names), note: pick(['', 'n', null, 'z'.repeat(300)]), by: pick(['person', 'socria', 'x', undefined]) })),
    criteria: Array.from({ length: Math.floor(rnd() * 13) }, () => ({ id: pick(ids), name: pick(names), weight: pick([...vals, undefined]), by: pick(['person', 'socria']) })),
    scores: Array.from({ length: Math.floor(rnd() * 40) }, () => ({ option: pick([...ids, ...names]), criterion: pick([...ids, ...names]), value: pick(vals), low: pick(vals), high: pick(vals), note: pick(['', '$1,200', null]), by: pick(['person', 'socria']) })),
  });
  let read = 0;
  let stable = true;
  for (let i = 0; i < 400 && stable; i++) {
    const s = sanitizeCompare(gen());
    if (!s) continue;
    read++;
    stable = stableKey(sanitizeCompare(s)) === stableKey(s) && stableKey(sanitizeCompare(JSON.parse(J(s)))) === stableKey(s);
    if (!stable) console.log('not canonical:', J(s));
  }
  ok(`every random proposal that reads (${read} of 400) is canonical: read again, or saved and reopened, it is the same`, stable && read > 50);

  // random sessions, the person and Socria taking turns
  const opArgs = () =>
    pick([
      ['addOption', { name: pick(names), by: pick(['person', 'socria']) }],
      ['renameOption', { id: pick(['a', 'b', 'o1']), name: pick(names), by: pick(['person', undefined]) }],
      ['removeOption', { id: pick(['a', 'b', 'o1']) }],
      ['addCriterion', { name: pick(names), weight: pick([3, 11, '', 2.5, undefined]), by: pick(['person', 'socria']) }],
      ['renameCriterion', { id: pick(['sal', 'com', 'c1']), name: pick(names) }],
      ['removeCriterion', { id: pick(['sal', 'com', 'gro', 'c1']) }],
      ['weight', { criterion: pick(['sal', 'com', 'gro', 'c1']), weight: pick([0, 3, 7, 10, 11, '']), by: pick(['person', 'socria', undefined]) }],
      ['score', { option: pick(['a', 'b', 'o1']), criterion: pick(['sal', 'com', 'gro', 'c1']), value: pick([0, 4, 6.5, 10, '', 12]), low: pick([undefined, 2, 9]), high: pick([undefined, 8, 10]), by: pick(['person', 'socria', undefined]) }],
      ['note', { option: pick(['a', 'b', 'o1']), criterion: pick(['sal', '', 'com']), note: pick(['', 'n', '$5']), by: pick(['person', 'socria']) }],
      ['view', { view: pick(['matrix', 'ranking', 'sensitivity', 'pie']) }],
      ['title', { title: pick(['T', '']) }],
    ]);
  const theirs = (st) => [
    ...st.options.filter((x) => x.by === 'person').map((x) => [`o:${x.id}`, stableKey(x)]),
    ...st.criteria.filter((x) => x.by === 'person').map((x) => [`c:${x.id}`, stableKey(x)]),
    ...st.scores.filter((x) => x.by === 'person').map((x) => [`s:${x.option}|${x.criterion}`, stableKey(x)]),
  ];
  let taken = 0;
  let replayed = true;
  let kept = true;
  for (let i = 0; i < 300 && replayed && kept; i++) {
    let space = create(EMPTY_SPACE, 'compare', jobs(), { name: 'C1', origin: 'socria' }).space;
    for (let j = 0; j < 20; j++) {
      const [op, raw] = opArgs();
      const args = Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== undefined));
      const by = pick(['person', 'socria']);
      const before = currentOf(space.objs[0]);
      const x = apply(space, 'C1', op, args, { by, at: j });
      if (!x.ok) continue;
      taken++;
      if (by === 'socria') {
        const after = new Map(theirs(currentOf(x.obj)));
        if (!theirs(before).every(([key, v]) => after.get(key) === v)) {
          kept = false;
          console.log('Socria changed the person’s:', op, J(args));
        }
      }
      space = x.space;
    }
    const back = sanitizeSpace(JSON.parse(J(space)));
    replayed = !!back && stableKey(currentOf(back.objs[0])) === stableKey(currentOf(space.objs[0])) && back.objs[0].steps.length === space.objs[0].steps.length;
    if (!replayed) console.log('replay differs:', J(space.objs[0].steps.map((s) => [s.op, s.args, s.by])));
  }
  ok(`300 random sessions (${taken} steps taken; the rest refused, each with a reason) all replay exactly from storage`, replayed && taken > 300);
  ok('  and in none of them did a step Socria took change anything the person owns', kept);
  console.log(`  (${read} of 400 random proposals read; ${taken} of 6000 random steps taken)`);
}

console.log('\n=== determinism: no clock, no chance, no locale ===');
{
  const real = { now: Date.now, random: Math.random, nloc: Number.prototype.toLocaleString, dloc: Date.prototype.toLocaleString, cmp: String.prototype.localeCompare };
  const trap = (what) => () => {
    throw new Error(`${what} was read`);
  };
  let err = null;
  const outs = [];
  Date.now = trap('the clock');
  Math.random = trap('chance');
  Number.prototype.toLocaleString = trap('a locale');
  Date.prototype.toLocaleString = trap('a locale');
  String.prototype.localeCompare = trap('a locale');
  try {
    for (let n = 0; n < 2; n++) {
      const k = kindOf('compare');
      const c = create(EMPTY_SPACE, 'compare', jobs(), { name: 'C1', origin: 'socria' });
      let space = c.space;
      const steps = [
        ['weight', { criterion: 'com', weight: 7, by: 'person' }],
        ['score', { option: 'a', criterion: 'gro', value: 6, low: 4, high: 8, by: 'person' }],
        ['addOption', { name: 'Freelancing', by: 'person' }],
        ['note', { option: 'o1', criterion: 'sal', note: '$80k', by: 'person' }],
        ['view', { view: 'sensitivity' }],
      ];
      for (const [op, args] of steps) {
        const x = apply(space, c.obj.id, op, args, { by: 'person', at: 1 });
        if (!x.ok) throw new Error(`${op}: ${x.why}`);
        space = x.space;
      }
      const cur = currentOf(space.objs[0]);
      outs.push(J([k.facts(cur, { guarded: false }), k.text(cur), k.shape(cur), sensitivity(cur), flipStrip(cur), rankBars(cur), cellGrid(cur), decisive(cur), readCompareOp('make salary more important', cur, TODAY), sanitizeSpace(JSON.parse(J(space))).objs[0].steps.map((x) => [x.said, x.note])]));
    }
  } catch (e) {
    err = e;
  } finally {
    Date.now = real.now;
    Math.random = real.random;
    Number.prototype.toLocaleString = real.nloc;
    Date.prototype.toLocaleString = real.dloc;
    String.prototype.localeCompare = real.cmp;
  }
  ok('sanitize, every operation, its record, the facts, the text and the layouts read no clock, no chance and no locale', !err, err?.message);
  ok('  and give the same answer every time', outs.length === 2 && outs[0] === outs[1]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
