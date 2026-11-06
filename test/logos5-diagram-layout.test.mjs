// LOGOS 5.5 — ANYTHING AT ALL, DRAWN: THE DIAGRAM LENSES (lib/logos5/diagramLayout.ts)
//
//   timeOrder   years, BCE, circa, ISO and written dates, decades, centuries,
//               ranges, deep time, numbered stages; null for anything else
//   cycle       the water cycle on a ring: four arcs, the closing one too,
//               each labelled at its middle; details on their stage; what
//               else it touches outside the ring; a hub at the centre
//   tree        a taxonomy top down: levels even, children centred under
//               their parent, siblings apart; two roots; a node with two
//               parents; a loop inside the tree; what is not in it, loose
//   parts       a plant cell: regions, a region inside a region, every part
//               inside its own; a group name as a region; never deeper than two
//   concept     photosynthesis: the hub at the centre, every link labelled,
//               arrowed one way, never closer than 20px; the unlinked beneath
//   timeline    the French Revolution in order and in proportion; BCE before
//               CE; uneven dates evenly spaced; undated events where their
//               sequence puts them; null when fewer than two dates read
//   always      on a batch of seeded random maps and odd inputs: every node
//               once, every edge once, unique keys, no overlaps, no NaN, the
//               same picture every time

import * as D from './.tmp/diagram-layout-under-test.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 400))));
const J = JSON.stringify;
const near = (a, b, tol = 0.6) => Math.abs(a - b) <= tol;

// ── helpers ──────────────────────────────────────────────────────────
const N = (id, label, extra = {}) => ({ id, type: 'concept', label, ...extra });
const E = (from, to, relation, extra = {}) => ({ from, to, relation, ...extra });
const ek = (e) => `${e.from}~${e.to}~${e.relation}`;
const at = (L) => new Map(L.placed.map((p) => [p.id, p]));
const con = (L, key) => L.connectors.find((c) => c.key === key);
const overlapping = (a, b, gap = 0) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 + gap - 1e-6 && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + gap - 1e-6;
const inside = (p, x, y) => Math.abs(x - p.x) < p.w / 2 - 1e-6 && Math.abs(y - p.y) < p.h / 2 - 1e-6;
const numsOf = (path) => (String(path).match(/NaN|Infinity|-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/g) || []).map(Number);
const startOf = (path) => numsOf(path).slice(0, 2);
const endOf = (path) => numsOf(path).slice(-2);
const fin = (v) => typeof v === 'number' && Number.isFinite(v);

function firstOverlap(L, gap = 0) {
  for (let i = 0; i < L.placed.length; i++)
    for (let j = i + 1; j < L.placed.length; j++) if (overlapping(L.placed[i], L.placed[j], gap)) return [L.placed[i].id, L.placed[j].id];
  return null;
}

function hasNaN(L) {
  for (const p of L.placed) if (![p.x, p.y, p.w, p.h].every(fin)) return `card ${p.id}`;
  for (const c of L.connectors) {
    if (/NaN|Infinity|undefined/.test(c.path) || !numsOf(c.path).every(fin)) return `path ${c.key}: ${c.path}`;
    if ((c.lx !== undefined && !fin(c.lx)) || (c.ly !== undefined && !fin(c.ly))) return `label ${c.key}`;
  }
  for (const g of L.groups || []) if (![g.x, g.y, g.w, g.h].every(fin)) return `group ${g.key}`;
  return null;
}

/** the edges a lens must draw: both ends on the map, not a loop on one card, once each */
function drawable(map) {
  const ids = new Set();
  for (const n of map.nodes || []) if (n && typeof n.id === 'string' && n.id) ids.add(n.id);
  const seen = new Set();
  const out = [];
  for (const e of map.edges || []) {
    if (!e || e.from === e.to || !ids.has(e.from) || !ids.has(e.to) || seen.has(ek(e))) continue;
    seen.add(ek(e));
    out.push(e);
  }
  return out;
}

/**
 * The promises every lens keeps. `gap`: the least clear space between cards.
 * `contained`: a part_of shown by a region (the parts lens) need not be a line.
 */
function problemsOf(map, L, { gap = 0 } = {}) {
  const out = [];
  if (!L || typeof L.caption !== 'string' || !L.caption) out.push('no caption');
  if (L.empty) {
    if (L.placed.length || L.connectors.length) out.push('empty but drew something');
    return out;
  }
  const ids = L.placed.map((p) => p.id);
  if (new Set(ids).size !== ids.length) out.push('a card twice');
  const nodeIds = [];
  for (const n of map.nodes || []) if (n && typeof n.id === 'string' && n.id && !nodeIds.includes(n.id)) nodeIds.push(n.id);
  const attached = new Set(L.placed.flatMap((p) => (p.attached || []).map((d) => d.id)));
  for (const id of nodeIds) {
    const a = ids.includes(id);
    const b = attached.has(id);
    if (a === b) out.push(`node ${id}: ${a ? 'both a card and a detail' : 'nowhere'}`);
  }
  for (const id of ids) if (!nodeIds.includes(id)) out.push(`a card for no node: ${id}`);
  const keys = L.connectors.map((c) => c.key);
  if (new Set(keys).size !== keys.length) out.push('a connector key twice');
  const placedIds = new Set(ids);
  const group = new Map((L.groups || []).map((g) => [g.key, g]));
  const pos = at(L);
  for (const e of drawable(map)) {
    if (!placedIds.has(e.from) || !placedIds.has(e.to)) continue;
    const n = L.connectors.filter((c) => c.key === ek(e)).length;
    if (e.relation === 'part_of' && n === 0) {
      const g = group.get(`whole~${e.to}`);
      const p = pos.get(e.from);
      if (g && p && p.x - p.w / 2 >= g.x && p.x + p.w / 2 <= g.x + g.w && p.y - p.h / 2 >= g.y && p.y + p.h / 2 <= g.y + g.h) continue;
    }
    if (n !== 1) out.push(`edge ${ek(e)} drawn ${n} times`);
  }
  for (const c of L.connectors) {
    if (c.from !== undefined && !placedIds.has(c.from)) out.push(`connector ${c.key} from no card`);
    if (c.to !== undefined && !placedIds.has(c.to)) out.push(`connector ${c.key} to no card`);
    if (c.label !== undefined && (c.lx === undefined || c.ly === undefined)) out.push(`label without a place: ${c.key}`);
  }
  const o = firstOverlap(L, gap);
  if (o) out.push(`cards overlap: ${o.join(' & ')}`);
  const nan = hasNaN(L);
  if (nan) out.push(`NaN: ${nan}`);
  for (const p of L.placed) if (p.bare !== true) out.push(`card ${p.id} not bare`);
  // CARD_W or a little wider; the small card that names a region from its corner may be narrower
  for (const p of L.placed) if ((p.w < (group.has(`whole~${p.id}`) ? 90 : 150)) || p.w > 200) out.push(`card ${p.id} ${p.w} wide`);
  return out;
}

// ═════════════════════════════════════════════════════════════════════
console.log('\n=== timeOrder: a sortable number for a time label ===');
const T = D.timeOrder;
ok('years: "1789", "1789 CE", "AD 79", "79 AD"', T('1789') === 1789 && T('1789 CE') === 1789 && T('AD 79') === 79 && T('79 AD') === 79 && T('1066 A.D.') === 1066);
ok('BCE counts back: "c. 3000 BCE", "44 BC", "500 B.C."', T('c. 3000 BCE') === -3000 && T('44 BC') === -44 && T('500 B.C.') === -500 && T('753 B.C.E.') === -753);
ok('circa and the like: "c. 1500", "ca. 1500", "circa 1500", "around 1500", "~1500", "in 1500"', ['c. 1500', 'ca. 1500', 'circa 1500', 'around 1500', '~1500', 'in 1500', 'c1500', 'approx. 1500'].every((s) => T(s) === 1500), J(['c. 1500', 'c1500', 'approx. 1500'].map(T)));
ok('ISO dates: "1815-06-18", and the same day written "18 June 1815", "June 18, 1815", "18th of June 1815"', near(T('1815-06-18'), 1815.4624, 0.001) && T('18 June 1815') === T('1815-06-18') && T('June 18, 1815') === T('1815-06-18') && T('18th of June 1815') === T('1815-06-18'));
ok('months: "June 1940" is in 1940, after "May 1940", before "July 1940"', Math.floor(T('June 1940')) === 1940 && T('May 1940') < T('June 1940') && T('June 1940') < T('July 1940') && T('Jun 1940') === T('June 1940'));
ok('decades and centuries: "1960s", "19th century", "5th century BCE", "the 1800s", "twenty-first century"', T('1960s') === 1960 && T('19th century') === 1800 && T('5th century BCE') === -500 && T('the 1800s') === 1800 && T('twenty-first century') === 2000);
ok('early, mid, late place a point inside the span', T('early 1960s') < T('mid-1960s') && T('mid-1960s') < T('late 1960s') && T('late 1960s') < 1970 && T('early 19th century') > 1800 && T('late 19th century') < 1900);
ok('ranges are their start: "1914–1918", "1914-18", "1939 to 1945", "between 1914 and 1918"', T('1914–1918') === 1914 && T('1914-18') === 1914 && T('1939 to 1945') === 1939 && T('between 1914 and 1918') === 1914);
ok('  a range borrows what its start leaves out: "1200–1100 BCE", "June–August 1940", "18–20 June 1815"', T('1200–1100 BCE') === -1200 && T('June–August 1940') === T('June 1940') && T('18–20 June 1815') === T('18 June 1815'));
ok('numbered stages: "Day 3", "Stage 2", "Step 4", "Phase 1" — small, in order', T('Day 3') === 3 && T('Stage 2') === 2 && T('Step 4') === 4 && T('Phase 1') === 1 && T('Day 1') < T('Day 3') && T('Day 3') < T('Day 10'));
ok('  numerals and words: "Stage IV", "Phase two", "Act iii"', T('Stage IV') === 4 && T('Phase two') === 2 && T('Act iii') === 3);
ok('  a week is counted as the day it starts on, so "Week 2" falls after "Day 3"', T('Week 2') > T('Day 3') && T('Week 1') === T('Day 1'));
ok('deep time counts back from a fixed present', T('66 million years ago') < T('10,000 years ago') && T('10,000 years ago') < T('c. 3000 BCE') && T('4.6 billion years ago') < T('66 million years ago'));
ok('BCE sorts before CE, and in order', [T('c. 3000 BCE'), T('44 BC'), T('AD 79'), T('1066'), T('1789')].every((v, i, a) => i === 0 || a[i - 1] < v));
ok('not a time: null', ['', 'soon', 'the beginning', 'later that year', 'banana 12', 'days', '12345', 'Chapter', 'spring', 'early on'].every((s) => T(s) === null), J(['', 'soon', 'days', '12345', 'spring'].map(T)));
ok('a time label is never thrown on: non-strings are null', D.timeOrder(undefined) === null && D.timeOrder(42) === null && D.timeOrder(null) === null);
ok('timeKey says what kind of label it is, so kinds never share an axis', D.timeKey('1789').kind === 'calendar' && D.timeKey('Day 3').kind === 'ordinal' && D.timeKey('June 18').kind === 'month' && D.timeKey('9:30').kind === 'clock' && D.timeKey('3pm').order === 15);

// ═════════════════════════════════════════════════════════════════════
console.log('\n=== the cycle: the water cycle on a ring ===');
const WATER = {
  nodes: [
    N('evap', 'Evaporation', { type: 'process', role: 'stage' }),
    N('cond', 'Condensation', { type: 'process', role: 'stage' }),
    N('prec', 'Precipitation', { type: 'process', role: 'stage' }),
    N('coll', 'Collection', { type: 'process', role: 'stage' }),
  ],
  edges: [
    E('evap', 'cond', 'becomes', { label: 'rises and cools' }),
    E('cond', 'prec', 'becomes', { label: 'falls' }),
    E('prec', 'coll', 'leads_to', { label: 'runs off' }),
    E('coll', 'evap', 'leads_to', { when: 'the sun heats it' }),
  ],
};
{
  const L = D.layoutCycle(WATER, 900, 600);
  const p = at(L);
  ok('four stages, round, words only', L.placed.length === 4 && L.placed.every((q) => q.shape === 'stage' && q.bare === true), J(L.placed.map((q) => [q.id, q.shape])));
  const cx = L.placed.reduce((s, q) => s + q.x, 0) / 4;
  const cy = L.placed.reduce((s, q) => s + q.y, 0) / 4;
  const R = Math.hypot(p.get('evap').x - cx, p.get('evap').y - cy);
  ok('on one circle', L.placed.every((q) => near(Math.hypot(q.x - cx, q.y - cy), R, 1)), J(L.placed.map((q) => Math.hypot(q.x - cx, q.y - cy))));
  const ang = (id) => (Math.atan2(p.get(id).y - cy, p.get(id).x - cx) * 180) / Math.PI;
  ok('the first stage at the top, the rest clockwise in loop order', near(ang('evap'), -90, 1) && near(ang('cond'), 0, 1) && near(ang('prec'), 90, 1) && near(Math.abs(ang('coll')), 180, 1), J(['evap', 'cond', 'prec', 'coll'].map(ang)));
  ok('four arcs, every one arrowed, the closing one back to the first among them', L.connectors.length === 4 && L.connectors.every((c) => c.arrow === true) && !!con(L, 'coll~evap~leads_to'), J(L.connectors.map((c) => c.key)));
  ok('  each joins its stage to the next', J(L.connectors.map((c) => [c.from, c.to])) === J([['evap', 'cond'], ['cond', 'prec'], ['prec', 'coll'], ['coll', 'evap']]));
  ok('  drawn as arcs of the ring', L.connectors.every((c) => / A /.test(c.path) && near(numsOf(c.path.split(' A ')[1])[0], R, 1)), L.connectors[0].path);
  ok('  starting and ending outside the cards, so the arrowheads show', L.connectors.every((c) => !L.placed.some((q) => inside(q, ...startOf(c.path)) || inside(q, ...endOf(c.path)))));
  const arcLabel = (c) => {
    const a = (Math.atan2(c.ly - cy, c.lx - cx) * 180) / Math.PI;
    return near(Math.hypot(c.lx - cx, c.ly - cy), R, 1.5) && a;
  };
  ok('the link phrase at the middle of its arc, the condition where there is no phrase', con(L, 'evap~cond~becomes').label === 'rises and cools' && con(L, 'coll~evap~leads_to').label === 'the sun heats it' && L.connectors.every((c) => arcLabel(c) !== false));
  ok('  the label between the two stages it joins', (() => {
    const a = arcLabel(con(L, 'evap~cond~becomes'));
    const b = arcLabel(con(L, 'cond~prec~becomes'));
    return a > -90 && a < 0 && b > 0 && b < 90;
  })());
  ok('no two stages near each other; nothing else wrong', problemsOf(WATER, L, { gap: 20 }).length === 0, problemsOf(WATER, L, { gap: 20 }).join('; '));
  ok('the caption says what a cycle is', L.caption === 'Each stage leads to the next, and round again.' && !L.empty);
}
{
  const map = {
    nodes: [...WATER.nodes, N('sun', 'The Sun', { type: 'entity' }), N('rain', 'Mostly over the sea', { role: 'note' }), N('lone', 'Groundwater')],
    edges: [...WATER.edges, E('sun', 'evap', 'causes', { label: 'drives' }), E('rain', 'prec', 'applies_to')],
  };
  const L = D.layoutCycle(map, 900, 600);
  const p = at(L);
  const ring = ['evap', 'cond', 'prec', 'coll'].map((id) => p.get(id));
  const cx = ring.reduce((s, q) => s + q.x, 0) / 4;
  const cy = ring.reduce((s, q) => s + q.y, 0) / 4;
  const R = Math.hypot(ring[0].x - cx, ring[0].y - cy);
  ok('a detail rides on its stage, not beside it', !p.has('rain') && J(p.get('prec').attached?.map((d) => d.id)) === J(['rain']) && p.get('prec').h > p.get('cond').h);
  ok('what feeds the loop sits outside the ring, near the stage it joins', Math.hypot(p.get('sun').x - cx, p.get('sun').y - cy) > R + 40 && Math.hypot(p.get('sun').x - p.get('evap').x, p.get('sun').y - p.get('evap').y) < Math.hypot(p.get('sun').x - p.get('prec').x, p.get('sun').y - p.get('prec').y));
  ok('  joined by its own line, arrowed, with its words', con(L, 'sun~evap~causes')?.arrow === true && con(L, 'sun~evap~causes').label === 'drives');
  ok('  not round: only the stages are', p.get('sun').shape === undefined);
  ok('what touches nothing sits beneath, loose', p.get('lone').loose === true && p.get('lone').y > Math.max(...ring.map((q) => q.y)));
  ok('every promise kept', problemsOf(map, L, { gap: 20 }).length === 0, problemsOf(map, L, { gap: 20 }).join('; '));
}
{
  const map = { nodes: [...WATER.nodes, N('h2o', 'Water')], edges: [...WATER.edges, ...['evap', 'cond', 'prec', 'coll'].map((id) => E('h2o', id, 'relates'))] };
  const L = D.layoutCycle(map, 900, 600);
  const p = at(L);
  const ring = ['evap', 'cond', 'prec', 'coll'].map((id) => p.get(id));
  const cx = ring.reduce((s, q) => s + q.x, 0) / 4;
  const cy = ring.reduce((s, q) => s + q.y, 0) / 4;
  ok('what every stage turns about takes the centre', near(p.get('h2o').x, cx, 1) && near(p.get('h2o').y, cy, 1) && problemsOf(map, L, { gap: 20 }).length === 0, J([p.get('h2o').x, p.get('h2o').y, cx, cy]));
}
{
  const map = { nodes: [N('a', 'Egg'), N('b', 'Larva'), N('c', 'Pupa'), N('d', 'Adult', { role: 'start' })], edges: [E('a', 'b', 'becomes'), E('b', 'c', 'becomes'), E('c', 'd', 'becomes'), E('d', 'a', 'leads_to', { label: 'lays' }), E('a', 'c', 'precedes')] };
  const L = D.layoutCycle(map, 900, 600);
  const p = at(L);
  ok('a stage marked as the start goes at the top', p.get('d').y === Math.min(...L.placed.map((q) => q.y)));
  const entered = { nodes: [N('x', 'Planting'), N('a', 'Seed'), N('b', 'Seedling'), N('c', 'Flower'), N('d', 'Fruit')], edges: [E('b', 'c', 'becomes'), E('c', 'd', 'becomes'), E('d', 'a', 'becomes'), E('a', 'b', 'becomes'), E('x', 'b', 'leads_to')] };
  const Le = D.layoutCycle(entered, 900, 600);
  const pe = at(Le);
  ok('  else the stage the loop is entered at from outside it', pe.get('b').y === Math.min(...['a', 'b', 'c', 'd'].map((id) => pe.get(id).y)) && pe.get('c').x > pe.get('b').x);
  ok('a link across the ring bows in towards the centre', / Q /.test(con(L, 'a~c~precedes')?.path ?? '') && problemsOf(map, L).length === 0, con(L, 'a~c~precedes')?.path);
}
{
  const chain = { nodes: [N('a', 'A'), N('b', 'B'), N('c', 'C')], edges: [E('a', 'b', 'leads_to'), E('b', 'c', 'leads_to')] };
  const two = { nodes: [N('a', 'A'), N('b', 'B')], edges: [E('a', 'b', 'becomes'), E('b', 'a', 'becomes')] };
  const L1 = D.layoutCycle(chain, 900, 600);
  ok('no loop: nothing drawn, and a sentence saying why', L1.placed.length === 0 && L1.connectors.length === 0 && /cycle/i.test(L1.empty ?? ''));
  ok('  a loop of two is not a cycle', !!D.layoutCycle(two, 900, 600).empty && !!D.layoutCycle({ nodes: [], edges: [] }, 900, 600).empty);
}
{
  const n = 12;
  const map = { nodes: Array.from({ length: n }, (_, i) => N(`s${i}`, ['Germination', 'Seedling growth and the first true leaves', 'Vegetative stage', 'Budding', 'Flowering', 'Pollination by insects or wind', 'Fertilisation', 'Fruit formation', 'Seed dispersal', 'Dormancy', 'Imbibition', 'Radicle emerges'][i])), edges: Array.from({ length: n }, (_, i) => E(`s${i}`, `s${(i + 1) % n}`, 'leads_to', { label: i % 2 ? 'then' : 'which leads on to' })) };
  const L = D.layoutCycle(map, 600, 600);
  ok('a long cycle with long words: the ring grows until nothing touches', L.placed.length === n && L.connectors.length === n && problemsOf(map, L, { gap: 24 }).length === 0, problemsOf(map, L, { gap: 24 }).join('; '));
}

// ═════════════════════════════════════════════════════════════════════
console.log('\n=== the tree: a taxonomy, top down ===');
const TAXA = {
  nodes: [
    N('animals', 'Animals', { type: 'category' }),
    N('vert', 'Vertebrates', { type: 'category' }),
    N('invert', 'Invertebrates', { type: 'category' }),
    N('mammals', 'Mammals'),
    N('birds', 'Birds'),
    N('fish', 'Fish'),
    N('insects', 'Insects'),
    N('molluscs', 'Molluscs'),
    N('dog', 'Dog'),
    N('cat', 'Cat'),
    N('fur', 'Warm-blooded, with fur', { role: 'note' }),
    N('plants', 'Plants'),
  ],
  edges: [
    E('vert', 'animals', 'is_a', { label: 'with a backbone' }),
    E('invert', 'animals', 'is_a'),
    E('mammals', 'vert', 'is_a'),
    E('birds', 'vert', 'is_a'),
    E('fish', 'vert', 'is_a'),
    E('insects', 'invert', 'is_a'),
    E('molluscs', 'invert', 'is_a'),
    E('dog', 'mammals', 'is_a'),
    E('cat', 'mammals', 'is_a'),
    E('fur', 'mammals', 'applies_to'),
  ],
};
{
  const L = D.layoutTree(TAXA, 900, 600);
  const p = at(L);
  const y = (id) => p.get(id).y;
  ok('each level below the one above', y('animals') < y('vert') && y('vert') < y('mammals') && y('mammals') < y('dog'));
  ok('  a level is one row', y('vert') === y('invert') && ['birds', 'fish', 'insects', 'molluscs'].every((id) => y(id) === y('mammals')) && y('dog') === y('cat'));
  ok('  and the levels are evenly spaced', near(y('vert') - y('animals'), y('mammals') - y('vert'), 0.2) && near(y('mammals') - y('vert'), y('dog') - y('mammals'), 0.2));
  const kids = { animals: ['vert', 'invert'], vert: ['mammals', 'birds', 'fish'], invert: ['insects', 'molluscs'], mammals: ['dog', 'cat'] };
  ok('every parent centred over its children', Object.entries(kids).every(([par, cs]) => near(p.get(par).x, (p.get(cs[0]).x + p.get(cs[cs.length - 1]).x) / 2, 0.2)), J(Object.entries(kids).map(([par, cs]) => [par, p.get(par).x, (p.get(cs[0]).x + p.get(cs[cs.length - 1]).x) / 2])));
  ok('  children in the order the map gives them', p.get('mammals').x < p.get('birds').x && p.get('birds').x < p.get('fish').x && p.get('fish').x < p.get('insects').x);
  const rows = new Map();
  for (const q of L.placed) if (!q.loose) rows.set(q.y, [...(rows.get(q.y) ?? []), q]);
  const tightest = Math.min(...[...rows.values()].flatMap((row) => row.sort((a, b) => a.x - b.x).slice(1).map((q, i) => q.x - q.w / 2 - (row[i].x + row[i].w / 2))));
  ok('never closer than 24px across a level', tightest >= 24, tightest);
  const lines = L.connectors.filter((c) => c.relation === 'is_a');
  ok('a line for every parent and child, none arrowed', lines.length === 9 && lines.every((c) => !c.arrow), J(lines.map((c) => c.key)));
  ok('  from the parent\'s foot to the child\'s head', lines.every((c) => {
    const [sx, sy] = startOf(c.path);
    const [ex, ey] = endOf(c.path);
    const par = p.get(c.from);
    const kid = p.get(c.to);
    return near(sx, par.x) && near(sy, par.y + par.h / 2) && near(ex, kid.x) && near(ey, kid.y - kid.h / 2);
  }), lines[0].path);
  ok('  keyed as the edge is, so lighting a card lights its lines', !!con(L, 'dog~mammals~is_a') && con(L, 'dog~mammals~is_a').from === 'mammals' && con(L, 'dog~mammals~is_a').to === 'dog');
  const lab = con(L, 'vert~animals~is_a');
  ok('a link phrase sits on the child\'s line, above it', lab.label === 'with a backbone' && near(lab.lx, p.get('vert').x) && lab.ly < p.get('vert').y - p.get('vert').h / 2 && lab.ly > p.get('animals').y + p.get('animals').h / 2);
  ok('a detail rides on what it applies to', !p.has('fur') && p.get('mammals').attached?.[0]?.id === 'fur');
  ok('what is not in the tree sits beneath it, loose', p.get('plants').loose === true && y('plants') > y('dog') && L.placed.filter((q) => q.loose).length === 1);
  ok('every promise kept', problemsOf(TAXA, L, { gap: 20 }).length === 0, problemsOf(TAXA, L).join('; '));
}
{
  const map = { nodes: [N('a', 'Fruit'), N('b', 'Apple'), N('c', 'Pear'), N('d', 'Vegetable'), N('e', 'Carrot'), N('f', 'Leek')], edges: [E('b', 'a', 'is_a'), E('c', 'a', 'is_a'), E('e', 'd', 'is_a'), E('f', 'd', 'is_a')] };
  const L = D.layoutTree(map, 900, 600);
  const p = at(L);
  ok('two roots side by side, their trees apart', p.get('a').y === p.get('d').y && p.get('a').x < p.get('d').x && problemsOf(map, L, { gap: 24 }).length === 0);
}
{
  const map = { nodes: [N('a', 'Organism'), N('b', 'Plant'), N('c', 'Fungus'), N('d', 'Lichen')], edges: [E('b', 'a', 'is_a'), E('c', 'a', 'is_a'), E('d', 'c', 'part_of'), E('d', 'b', 'part_of')] };
  const L = D.layoutTree(map, 900, 600);
  const p = at(L);
  ok('a node with two parents sits under the first', p.get('d').y > p.get('c').y && near(p.get('d').x, p.get('c').x));
  ok('  the second parent is a link across the tree', / C /.test(con(L, 'd~b~part_of')?.path ?? '') && problemsOf(map, L).length === 0);
}
{
  const map = { nodes: [N('a', 'A'), N('b', 'B'), N('c', 'C'), N('d', 'D')], edges: [E('a', 'b', 'part_of'), E('b', 'c', 'part_of'), E('c', 'a', 'part_of'), E('d', 'c', 'is_a')] };
  const L = D.layoutTree(map, 900, 600);
  ok('a loop inside a tree: every card drawn, the closing link across it', L.placed.length === 4 && problemsOf(map, L).length === 0, problemsOf(map, L).join('; '));
}
{
  ok('nothing sits under anything: nothing drawn, and why', /tree/i.test(D.layoutTree({ nodes: [N('a', 'A'), N('b', 'B')], edges: [E('a', 'b', 'relates')] }, 900, 600).empty ?? ''));
  const wide = { nodes: [N('r', 'Everything'), ...Array.from({ length: 20 }, (_, i) => N(`k${i}`, `Kind number ${i} of a very long name indeed`))], edges: Array.from({ length: 20 }, (_, i) => E(`k${i}`, 'r', 'is_a')) };
  const L = D.layoutTree(wide, 600, 600);
  ok('a wide tree is let grow wide, never crowded', problemsOf(wide, L, { gap: 24 }).length === 0 && Math.max(...L.placed.map((q) => q.x)) - Math.min(...L.placed.map((q) => q.x)) > 600);
}

// ═════════════════════════════════════════════════════════════════════
console.log('\n=== the parts: a plant cell ===');
const CELL = {
  nodes: [
    N('cell', 'Plant cell', { type: 'entity', role: 'whole' }),
    N('nucleus', 'Nucleus', { type: 'component' }),
    N('chloro', 'Chloroplast', { type: 'component' }),
    N('mito', 'Mitochondrion', { type: 'component' }),
    N('vac', 'Vacuole', { type: 'component' }),
    N('wall', 'Cell wall', { type: 'component' }),
    N('thyl', 'Thylakoid', { type: 'component' }),
    N('stroma', 'Stroma', { type: 'component' }),
    N('sun', 'Sunlight', { type: 'entity' }),
    N('dna', 'Holds the DNA', { role: 'note' }),
  ],
  edges: [
    ...['nucleus', 'chloro', 'mito', 'vac', 'wall'].map((id) => E(id, 'cell', 'part_of')),
    E('thyl', 'chloro', 'part_of'),
    E('stroma', 'chloro', 'part_of'),
    E('sun', 'chloro', 'flows_to', { label: 'absorbed by' }),
    E('chloro', 'mito', 'flows_to', { label: 'sugar' }),
    E('dna', 'nucleus', 'applies_to'),
  ],
};
const within = (p, g, pad = 12) => p.x - p.w / 2 >= g.x + pad - 1e-6 && p.x + p.w / 2 <= g.x + g.w - pad + 1e-6 && p.y - p.h / 2 >= g.y + pad - 1e-6 && p.y + p.h / 2 <= g.y + g.h - pad + 1e-6;
const boxIn = (a, b, pad = 12) => a.x >= b.x + pad - 1e-6 && a.y >= b.y + pad - 1e-6 && a.x + a.w <= b.x + b.w - pad + 1e-6 && a.y + a.h <= b.y + b.h - pad + 1e-6;
const apart = (a, b) => a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
{
  const L = D.layoutParts(CELL, 900, 600);
  const p = at(L);
  const g = new Map((L.groups ?? []).map((x) => [x.key, x]));
  ok('the cell is a region, the chloroplast a region inside it', g.get('whole~cell')?.depth === 0 && g.get('whole~chloro')?.depth === 1 && boxIn(g.get('whole~chloro'), g.get('whole~cell')), J(L.groups));
  ok('  named after the nodes they are', g.get('whole~cell').label === 'Plant cell' && g.get('whole~chloro').label === 'Chloroplast');
  ok('every part inside its own region, at least 12px in', ['nucleus', 'mito', 'vac', 'wall', 'chloro'].every((id) => within(p.get(id), g.get('whole~cell'))) && ['thyl', 'stroma'].every((id) => within(p.get(id), g.get('whole~chloro'))));
  ok('  and not inside a region it is not part of', !within(p.get('nucleus'), g.get('whole~chloro'), 0) && !within(p.get('sun'), g.get('whole~cell'), 0));
  const corner = (id, key) => p.get(id).x - p.get(id).w / 2 - g.get(key).x <= 20 && p.get(id).y - p.get(id).h / 2 - g.get(key).y <= 20;
  ok('a whole\'s own card names its region from the top-left corner, once', corner('cell', 'whole~cell') && corner('chloro', 'whole~chloro') && L.placed.filter((q) => q.id === 'chloro').length === 1);
  ok('  the parts sit below it', ['nucleus', 'mito', 'vac', 'wall'].every((id) => p.get(id).y - p.get(id).h / 2 > p.get('cell').y + p.get('cell').h / 2) && ['thyl', 'stroma'].every((id) => p.get(id).y > p.get('chloro').y));
  ok('a part drawn inside its whole needs no line; the flows are lines, arrowed, in words', !L.connectors.some((c) => c.relation === 'part_of') && con(L, 'sun~chloro~flows_to')?.arrow === true && con(L, 'sun~chloro~flows_to').label === 'absorbed by' && con(L, 'chloro~mito~flows_to')?.label === 'sugar');
  ok('what is part of nothing sits outside every region; joined to something, it is not loose', !(L.groups ?? []).some((x) => within(p.get('sun'), x, 0)) && !p.get('sun').loose);
  ok('a detail rides on its part', !p.has('dna') && p.get('nucleus').attached?.[0]?.id === 'dna');
  ok('regions never overlap one another, except one inside another', (L.groups ?? []).every((a, i) => (L.groups ?? []).every((b, j) => i >= j || apart(a, b) || boxIn(a, b) || boxIn(b, a))));
  ok('every promise kept', problemsOf(CELL, L, { gap: 8 }).length === 0, problemsOf(CELL, L, { gap: 8 }).join('; '));
}
{
  const map = {
    nodes: [N('a', 'Grana', { group: 'Light reactions' }), N('b', 'Thylakoid membrane', { group: 'Light reactions' }), N('c', 'Rubisco', { group: 'Calvin cycle' }), N('d', 'Stroma fluid', { group: 'Calvin cycle' }), N('e', 'ATP')],
    edges: [E('a', 'c', 'flows_to', { label: 'ATP and NADPH' }), E('e', 'c', 'relates')],
  };
  const L = D.layoutParts(map, 900, 600);
  const g = new Map((L.groups ?? []).map((x) => [x.key, x]));
  const p = at(L);
  ok('a group name two nodes share is a region, named', g.get('group~light reactions')?.label === 'Light reactions' && g.get('group~calvin cycle')?.label === 'Calvin cycle' && within(p.get('a'), g.get('group~light reactions')) && within(p.get('d'), g.get('group~calvin cycle')));
  ok('  every promise kept', problemsOf(map, L, { gap: 8 }).length === 0, problemsOf(map, L).join('; '));
}
{
  const map = {
    nodes: [N('body', 'Human body'), N('heart', 'Heart'), N('ventricle', 'Left ventricle'), N('valve', 'Mitral valve'), N('cusp', 'Anterior cusp'), N('lung', 'Lungs')],
    edges: [E('heart', 'body', 'part_of'), E('lung', 'body', 'part_of'), E('ventricle', 'heart', 'part_of'), E('valve', 'ventricle', 'part_of'), E('cusp', 'valve', 'part_of')],
  };
  const L = D.layoutParts(map, 900, 600);
  const p = at(L);
  ok('never more than two levels of region', (L.groups ?? []).every((x) => x.depth === 0 || x.depth === 1) && L.groups.length === 2, J(L.groups?.map((x) => [x.key, x.depth])));
  ok('  deeper wholes are cards beside their parts, joined to them', !!con(L, 'cusp~valve~part_of') && !!con(L, 'valve~ventricle~part_of') && within(p.get('cusp'), L.groups.find((x) => x.key === 'whole~heart')));
  ok('  every promise kept', problemsOf(map, L, { gap: 8 }).length === 0, problemsOf(map, L).join('; '));
}
{
  // each whole is in a group that sits inside the other whole: a ring of regions, cut where it closes
  const map = {
    nodes: [N('w', 'Whole W', { group: 'Gee' }), N('a', 'Part A', { group: 'Gee' }), N('a2', 'Part A2', { group: 'Gee' }), N('p', 'Whole P', { group: 'Gprime' }), N('b', 'Part B', { group: 'Gprime' }), N('b2', 'Part B2', { group: 'Gprime' })],
    edges: [E('a', 'p', 'part_of'), E('a2', 'p', 'part_of'), E('b', 'w', 'part_of'), E('b2', 'w', 'part_of')],
  };
  const L = D.layoutParts(map, 900, 600);
  const gs = L.groups ?? [];
  ok('groups at odds with the parts: every card drawn once, no region three deep, none overlapping', problemsOf(map, L, { gap: 8 }).length === 0 && gs.every((x) => x.depth === 0 || x.depth === 1) && gs.every((a, i) => gs.every((b, j) => i >= j || apart(a, b) || boxIn(a, b) || boxIn(b, a))), problemsOf(map, L).join('; ') + J(gs.map((x) => [x.key, x.depth])));
}
{
  const map = { nodes: [N('a', 'A'), N('b', 'B'), N('c', 'C')], edges: [E('a', 'b', 'part_of'), E('b', 'a', 'part_of'), E('c', 'c', 'part_of')] };
  const L = D.layoutParts(map, 900, 600);
  ok('a loop of wholes: one inside the other, the closing link drawn', L.groups?.length === 1 && !!con(L, 'b~a~part_of') && problemsOf(map, L).length === 0, problemsOf(map, L).join('; '));
  ok('nothing made of parts: nothing drawn, and why', /parts/i.test(D.layoutParts({ nodes: [N('a', 'A'), N('b', 'B')], edges: [E('a', 'b', 'causes')] }, 900, 600).empty ?? ''));
}

// ═════════════════════════════════════════════════════════════════════
console.log('\n=== the concept map: photosynthesis ===');
const PHOTO = {
  nodes: [
    N('photo', 'Photosynthesis', { type: 'process' }),
    N('light', 'Light energy'),
    N('chl', 'Chlorophyll'),
    N('co2', 'Carbon dioxide'),
    N('water', 'Water'),
    N('glucose', 'Glucose'),
    N('oxygen', 'Oxygen'),
    N('leaf', 'Leaves'),
    N('resp', 'Respiration'),
  ],
  edges: [
    E('photo', 'light', 'depends', { label: 'needs' }),
    E('chl', 'light', 'relates', { label: 'absorbs' }),
    E('photo', 'co2', 'depends', { label: 'takes in' }),
    E('photo', 'water', 'depends', { label: 'uses' }),
    E('photo', 'glucose', 'causes', { label: 'produces' }),
    E('photo', 'oxygen', 'causes', { label: 'releases' }),
    E('photo', 'leaf', 'part_of'),
    E('chl', 'leaf', 'relates'),
  ],
};
{
  const L = D.layoutConcept(PHOTO, 900, 600);
  const p = at(L);
  const hub = p.get('photo');
  const ns = ['light', 'co2', 'water', 'glucose', 'oxygen', 'leaf'].map((id) => p.get(id));
  ok('the most connected idea at the centre, its links all round it', ns.some((q) => q.y < hub.y) && ns.some((q) => q.y > hub.y) && ns.some((q) => q.x < hub.x) && ns.some((q) => q.x > hub.x));
  ok('  and nearer the middle than anything else', (() => {
    const linked = L.placed.filter((q) => !q.loose);
    const mx = linked.reduce((s, q) => s + q.x, 0) / linked.length;
    const my = linked.reduce((s, q) => s + q.y, 0) / linked.length;
    const d = (q) => Math.hypot(q.x - mx, q.y - my);
    return linked.every((q) => q === hub || d(q) > d(hub));
  })());
  ok('every link drawn, in its own words', PHOTO.edges.every((e) => !!con(L, ek(e))) && con(L, 'photo~glucose~causes').label === 'produces' && con(L, 'chl~light~relates').label === 'absorbs');
  ok('  a typed link with no words says its relation; "relates" says nothing', con(L, 'photo~leaf~part_of').label === 'sits inside' && con(L, 'chl~leaf~relates').label === undefined);
  ok('  arrowed one way, except a link that reads both ways', con(L, 'photo~glucose~causes').arrow === true && con(L, 'photo~leaf~part_of').arrow === true && !con(L, 'chl~light~relates').arrow && !con(L, 'chl~leaf~relates').arrow);
  ok('  each label on its line, between its ends', L.connectors.filter((c) => c.label).every((c) => {
    const [sx, sy] = startOf(c.path);
    const [ex, ey] = endOf(c.path);
    return c.lx >= Math.min(sx, ex) - 1 && c.lx <= Math.max(sx, ex) + 1 && c.ly >= Math.min(sy, ey) - 1 && c.ly <= Math.max(sy, ey) + 1;
  }));
  ok('  lines start and end at the cards\' edges, not inside them', L.connectors.every((c) => !L.placed.some((q) => inside(q, ...startOf(c.path)) || inside(q, ...endOf(c.path)))));
  ok('an idea linked to nothing sits beneath, loose', p.get('resp').loose === true && p.get('resp').y > Math.max(...L.placed.filter((q) => !q.loose).map((q) => q.y)));
  ok('never closer than 20px; every promise kept', problemsOf(PHOTO, L, { gap: 20 }).length === 0, problemsOf(PHOTO, L, { gap: 20 }).join('; '));
  ok('the caption says what a concept map is', L.caption === 'How the ideas connect, in words.');
}
{
  const map = { nodes: [N('fox', 'Fox'), N('rabbit', 'Rabbit'), N('grass', 'Grass'), N('a', 'Acid rain'), N('b', 'Lakes')], edges: [E('fox', 'rabbit', 'causes', { label: 'eats' }), E('rabbit', 'fox', 'inhibits', { label: 'is eaten by' }), E('rabbit', 'grass', 'causes', { label: 'eats' }), E('a', 'b', 'causes', { label: 'acidifies' })] };
  const L = D.layoutConcept(map, 900, 600);
  const p = at(L);
  const there = con(L, 'fox~rabbit~causes');
  const back = con(L, 'rabbit~fox~inhibits');
  ok('two links between the same two ideas bow apart', / Q /.test(there.path) && / Q /.test(back.path) && there.path !== back.path && (there.lx !== back.lx || there.ly !== back.ly));
  ok('a second cluster is laid out beside the first, not in a row of the loose', !p.get('a').loose && !p.get('b').loose && Math.min(p.get('a').x, p.get('b').x) > Math.max(p.get('fox').x, p.get('rabbit').x, p.get('grass').x));
  ok('  every promise kept', problemsOf(map, L, { gap: 20 }).length === 0, problemsOf(map, L, { gap: 20 }).join('; '));
  ok('one idea: one card; none: nothing, and why', D.layoutConcept({ nodes: [N('a', 'Alone')], edges: [] }, 900, 600).placed.length === 1 && /concept/i.test(D.layoutConcept({ nodes: [], edges: [] }, 900, 600).empty ?? ''));
}

// ═════════════════════════════════════════════════════════════════════
console.log('\n=== the dated timeline: when it happened ===');
const FRANCE = {
  nodes: [
    N('coup', 'Napoleon seizes power', { type: 'event', at: '1799' }),
    N('bastille', 'Storming of the Bastille', { type: 'event', at: '1789' }),
    N('waterloo', 'Battle of Waterloo', { type: 'event', at: '1815' }),
    N('republic', 'Republic declared', { type: 'event', at: '1792' }),
    N('emperor', 'Napoleon crowned', { type: 'event', at: '1804' }),
  ],
  edges: [E('bastille', 'republic', 'precedes'), E('republic', 'coup', 'leads_to', { label: 'a decade of war' }), E('bastille', 'waterloo', 'relates')],
};
const axisOf = (L) => numsOf(con(L, 'timeline-axis').path)[1];
{
  const L = D.layoutDatedTimeline(FRANCE, 900, 600);
  const p = at(L);
  const order = ['bastille', 'republic', 'coup', 'emperor', 'waterloo'];
  const years = [1789, 1792, 1799, 1804, 1815];
  const xs = order.map((id) => p.get(id).x);
  ok('in time order, left to right, whatever order the map gave', xs.every((x, i) => i === 0 || xs[i - 1] < x), J(xs));
  ok('  in proportion to the time between them', order.every((_, i) => near((xs[i] - xs[0]) / (xs[4] - xs[0]), (years[i] - 1789) / 26, 0.02)), J(xs.map((x) => (x - xs[0]) / (xs[4] - xs[0]))));
  const ay = axisOf(L);
  ok('alternately above and below the axis', order.every((id, i) => (i % 2 === 0 ? p.get(id).y < ay : p.get(id).y > ay)));
  ok('each a dot on the axis, in words only', L.placed.every((q) => q.shape === 'event' && q.bare));
  ok('the axis, arrowed into the future', con(L, 'timeline-axis').arrow === true && numsOf(con(L, 'timeline-axis').path)[0] < Math.min(...xs) && numsOf(con(L, 'timeline-axis').path)[2] > Math.max(...xs));
  const ticks = order.map((id) => con(L, `tick~${id}`));
  ok('a tick from each dot to its card, its own alone, carrying the date as written', ticks.every((c, i) => c && c.from === undefined && c.to === order[i] && c.label === String(years[i]) && near(c.lx, xs[i]) && near(startOf(c.path)[1], ay)));
  ok('  the date on the far side of the axis from its card', order.every((id, i) => (p.get(id).y < ay ? ticks[i].ly > ay : ticks[i].ly <= ay)));
  ok('a sequence between neighbours runs along the axis; anything else is a curve', numsOf(con(L, 'bastille~republic~precedes').path).filter((_, i) => i % 2 === 1).every((v) => near(v, ay)) && / C /.test(con(L, 'bastille~waterloo~relates').path) && con(L, 'republic~coup~leads_to').label === 'a decade of war');
  ok('every promise kept', problemsOf(FRANCE, L, { gap: 8 }).length === 0, problemsOf(FRANCE, L, { gap: 8 }).join('; '));
  ok('the caption says when', L.caption === 'What happened, and when.');
}
{
  const map = { nodes: [N('h', 'Battle of Hastings', { at: '1066' }), N('s', 'Writing in Sumer', { at: 'c. 3000 BCE' }), N('v', 'Vesuvius erupts', { at: 'AD 79' }), N('c', 'Caesar assassinated', { at: '44 BC' })], edges: [] };
  const L = D.layoutDatedTimeline(map, 900, 600);
  const p = at(L);
  ok('BCE before CE', p.get('s').x < p.get('c').x && p.get('c').x < p.get('v').x && p.get('v').x < p.get('h').x && problemsOf(map, L).length === 0);
}
{
  const map = { nodes: [...FRANCE.nodes, N('sumer', 'Writing in Sumer', { at: 'c. 3000 BCE' })], edges: [] };
  const L = D.layoutDatedTimeline(map, 900, 600);
  const xs = [...L.placed].sort((a, b) => a.x - b.x).map((q) => q.x);
  const steps = xs.slice(1).map((x, i) => x - xs[i]);
  ok('dates too uneven to draw in proportion are evenly spaced', steps.every((s) => near(s, steps[0], 0.2)) && L.placed.find((q) => q.x === xs[0]).id === 'sumer' && problemsOf(map, L).length === 0, J(steps));
}
{
  const map = { nodes: [N('a', 'Seed planted', { at: 'Day 1' }), N('b', 'First shoot', { at: 'Day 4' }), N('c', 'First leaves', { at: 'Day 10' })], edges: [] };
  const L = D.layoutDatedTimeline(map, 900, 600);
  const p = at(L);
  ok('numbered days are a timeline too, in proportion', near((p.get('b').x - p.get('a').x) / (p.get('c').x - p.get('a').x), 3 / 9, 0.02));
}
{
  const map = {
    nodes: [...FRANCE.nodes, N('terror', 'The Terror', { type: 'event' }), N('later', 'Restoration'), N('note', 'Paris, 14 July', { role: 'note' })],
    edges: [E('republic', 'terror', 'precedes'), E('terror', 'coup', 'precedes'), E('note', 'bastille', 'applies_to')],
  };
  const L = D.layoutDatedTimeline(map, 900, 600);
  const p = at(L);
  ok('an undated event sits where its sequence puts it', p.get('terror').x > p.get('republic').x && p.get('terror').x < p.get('coup').x && p.get('terror').shape === 'event');
  ok('  undated and joined to no date: after the dated ones', p.get('later').x > p.get('waterloo').x);
  ok('  an undated event has a tick but no date on it', con(L, 'tick~terror') && con(L, 'tick~terror').label === undefined);
  ok('a detail rides on its event', !p.has('note') && p.get('bastille').attached?.[0]?.id === 'note');
  ok('every promise kept', problemsOf(map, L, { gap: 8 }).length === 0, problemsOf(map, L, { gap: 8 }).join('; '));
}
{
  ok('fewer than two dates: null, and the old timeline draws it', D.layoutDatedTimeline({ nodes: [N('a', 'A', { at: '1789' }), N('b', 'B')], edges: [E('a', 'b', 'precedes')] }, 900, 600) === null && D.layoutDatedTimeline({ nodes: [], edges: [] }, 900, 600) === null);
  ok('  nor do two kinds of date share an axis', D.layoutDatedTimeline({ nodes: [N('a', 'A', { at: '1789' }), N('b', 'B', { at: 'Day 3' })], edges: [] }, 900, 600) === null);
  const same = D.layoutDatedTimeline({ nodes: [N('a', 'A', { at: '1789' }), N('b', 'B', { at: '1789' })], edges: [] }, 900, 600);
  ok('  two events on one date are still drawn, apart', !!same && same.placed.length === 2 && problemsOf({ nodes: [N('a', 'A', { at: '1789' }), N('b', 'B', { at: '1789' })], edges: [] }, same).length === 0);
}

// ═════════════════════════════════════════════════════════════════════
console.log('\n=== the shape of a card ===');
ok('a stage is round, an event a dot, a start or an end a pill, a fork a diamond', D.diagramShapeFor({}, 'cycle') === 'stage' && D.diagramShapeFor({}, 'timeline') === 'event' && D.diagramShapeFor({ role: 'start' }, 'flow') === 'pill' && D.diagramShapeFor({ role: 'end' }, 'tree') === 'pill' && D.diagramShapeFor({ role: 'branch' }, 'flow') === 'diamond' && D.diagramShapeFor({ role: 'step' }, 'flow') === undefined);
ok('a card is CARD_W wide, wider for long words, never past 200', D.diagramCardW('Water') === 150 && D.diagramCardW('The movement of water through a plant and out of its leaves') > 150 && D.diagramCardW('x'.repeat(100)) === 200 && D.bareCardH('Water', 150) === 36);

// ═════════════════════════════════════════════════════════════════════
console.log('\n=== always: random maps and odd inputs ===');
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const RELS = ['supports', 'conflicts', 'depends', 'relates', 'leads_to', 'revises', 'precedes', 'part_of', 'transforms_to', 'implies', 'justifies', 'equivalent_to', 'applies_to', 'causes', 'inhibits', 'is_a', 'flows_to', 'becomes'];
const ROLES = [undefined, undefined, undefined, 'stage', 'step', 'state', 'event', 'start', 'end', 'branch', 'constraint', 'note', 'risk', 'category', 'whole', 'part', 'concept'];
const WORDS = 'water cell energy light carbon oxygen root leaf stem sun cloud river sea rain heat salt iron war peace treaty king crown law court vote tax trade photosynthesis mitochondrion'.split(' ');
const ATS = ['1789', '1792', 'c. 3000 BCE', '44 BC', 'AD 79', 'June 1940', '18 June 1815', '1960s', '19th century', 'Day 3', 'Stage 2', 'soon', '1914–1918', '2001-09-11', '5th century BCE'];
const GROUPS = ['Chloroplast', 'Nucleus', 'Light reactions', 'Executive branch'];
function randomMap(r, n) {
  const pick = (a) => a[Math.floor(r() * a.length)];
  const nodes = Array.from({ length: n }, (_, i) => {
    const words = Array.from({ length: 1 + Math.floor(r() * (r() < 0.15 ? 14 : 4)) }, () => pick(WORDS)).join(' ');
    const node = { id: `n${i}`, type: pick(['concept', 'entity', 'process', 'event', 'component', 'question']), label: words.charAt(0).toUpperCase() + words.slice(1) };
    const role = pick(ROLES);
    if (role) node.role = role;
    if (r() < 0.35) node.at = pick(ATS);
    if (r() < 0.3) node.group = pick(GROUPS);
    return node;
  });
  const edges = [];
  const id = () => (r() < 0.04 ? 'missing' : `n${Math.floor(r() * n)}`);
  const m = Math.floor(r() * n * 1.6);
  for (let k = 0; k < m; k++) {
    const e = { from: id(), to: id(), relation: pick(RELS) };
    if (r() < 0.4) e.label = pick(WORDS) + (r() < 0.3 ? ' and ' + pick(WORDS) + ' ' + pick(WORDS) : '');
    if (r() < 0.1) e.when = 'when ' + pick(WORDS);
    if (r() < 0.2) e.strength = pick(['weak', 'normal', 'strong']);
    edges.push(e);
    if (r() < 0.05) edges.push({ ...e });
  }
  // shapes worth exercising: a loop, a hierarchy
  if (n >= 3 && r() < 0.4) {
    const len = Math.min(n, 3 + Math.floor(r() * 5));
    const ring = Array.from({ length: len }, (_, i) => `n${(i * 2 + Math.floor(r() * 3)) % n}`).filter((v, i, a) => a.indexOf(v) === i);
    ring.forEach((v, i) => edges.push({ from: v, to: ring[(i + 1) % ring.length], relation: pick(['leads_to', 'becomes', 'precedes', 'causes']) }));
  }
  if (n >= 3 && r() < 0.4) for (let i = 1; i < n; i++) if (r() < 0.6) edges.push({ from: `n${i}`, to: `n${Math.floor(r() * i)}`, relation: pick(['part_of', 'is_a']) });
  return { nodes, edges };
}
const LENSES = [
  ['cycle', D.layoutCycle, 20],
  ['tree', D.layoutTree, 20],
  ['parts', D.layoutParts, 8],
  ['concept', D.layoutConcept, 20],
  ['timeline', D.layoutDatedTimeline, 8],
];
{
  const counts = Object.fromEntries(LENSES.map(([name]) => [name, { drawn: 0, empty: 0, bad: [] }]));
  let slow = 0;
  for (let seed = 1; seed <= 160; seed++) {
    const r = rng(seed);
    const n = seed <= 25 ? seed - 1 : Math.floor(r() * 25);
    const map = randomMap(r, n);
    for (const [name, lay, gap] of LENSES) {
      const t0 = Date.now();
      let L;
      try {
        L = lay(map, seed % 3 ? 900 : 380, 600);
      } catch (err) {
        counts[name].bad.push(`seed ${seed}: threw ${err && err.message}`);
        continue;
      }
      if (Date.now() - t0 > 250) slow++;
      if (L === null) {
        counts[name].empty++;
        continue;
      }
      if (L.empty) counts[name].empty++;
      else counts[name].drawn++;
      const probs = problemsOf(map, L, { gap });
      if (probs.length) counts[name].bad.push(`seed ${seed} (${n} nodes): ${probs.slice(0, 3).join('; ')}`);
      if (name === 'parts' && L.groups) {
        const gs = L.groups;
        if (!gs.every((a, i) => gs.every((b, j) => i >= j || apart(a, b) || boxIn(a, b) || boxIn(b, a)))) counts[name].bad.push(`seed ${seed}: regions overlap`);
        if (gs.some((x) => x.depth !== 0 && x.depth !== 1)) counts[name].bad.push(`seed ${seed}: a region three deep`);
        for (const q of L.placed) for (const x of gs) if (within(q, x, 0) && !within(q, x, 12)) counts[name].bad.push(`seed ${seed}: ${q.id} less than 12px inside ${x.key}`);
        for (const q of L.placed) for (const x of gs) if (!within(q, x, 0) && !apart({ x: q.x - q.w / 2, y: q.y - q.h / 2, w: q.w, h: q.h }, x)) counts[name].bad.push(`seed ${seed}: ${q.id} across the edge of ${x.key}`);
      }
      const again = lay(JSON.parse(J(map)), seed % 3 ? 900 : 380, 600);
      if (J(again) !== J(L)) counts[name].bad.push(`seed ${seed}: not the same picture twice`);
    }
  }
  for (const [name, c] of Object.entries(counts)) ok(`${name}: 160 random maps (${c.drawn} drawn, ${c.empty} with nothing to draw) — every promise kept`, c.bad.length === 0, c.bad.slice(0, 4).join(' | '));
  ok('  each in well under a quarter of a second', slow === 0, slow);
  ok('  the random maps exercise every lens', Object.values(counts).every((c) => c.drawn >= 10), J(Object.fromEntries(Object.entries(counts).map(([k, c]) => [k, c.drawn]))));
}
{
  const odd = {
    nodes: [N('a', 'A'), N('a', 'A again'), N('b', 'B'), N('c', 'C'), null, { id: '', label: 'no id' }, N('d', 'D', { at: '1800' }), N('e', 'E', { at: '1900' })],
    edges: [E('a', 'a', 'leads_to'), E('a', 'zz', 'part_of'), E('a', 'b', 'part_of'), E('a', 'b', 'part_of'), E('b', 'c', 'leads_to'), E('c', 'a', 'leads_to'), E('a', 'b', 'leads_to'), null, E('c', 'b', 'is_a'), E('d', 'e', 'precedes')],
  };
  for (const [name, lay, gap] of LENSES) {
    const L = lay(odd, 900, 600);
    ok(`odd input (a repeated id, a loop on one card, an edge to nowhere, a repeated edge, nulls): ${name}`, L !== null && problemsOf(odd, L, { gap }).length === 0, L && problemsOf(odd, L, { gap }).join('; '));
  }
  ok('  the first of a repeated id is the one drawn', at(D.layoutConcept(odd, 900, 600)).get('a').node.label === 'A');
  ok('  no frame at all: drawn in a frame of its own', problemsOf(WATER, D.layoutCycle(WATER, NaN, undefined)).length === 0 && problemsOf(TAXA, D.layoutTree(TAXA, 0, 0)).length === 0 && hasNaN(D.layoutConcept(PHOTO, -5, Infinity)) === null);
  ok('  no map at all: nothing, never a throw', !!D.layoutCycle(null, 900, 600).empty && !!D.layoutTree({}, 900, 600).empty && !!D.layoutParts({ nodes: 'x' }, 900, 600).empty && !!D.layoutConcept(undefined, 900, 600).empty && D.layoutDatedTimeline(null, 900, 600) === null);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
