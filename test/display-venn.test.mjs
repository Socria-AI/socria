// A VENN DIAGRAM — Logos 3.5's overlaps and differences.
//
// What is held down here: the state is canonical and survives a save; every
// region — each combination of the sets, "in none" among them — is computed
// with its members and its count, empty regions too; the circles fit the box,
// every combination of them is a real region of the picture, and each
// region's label point lies inside exactly the right circles (measured again
// here, independently); every edit is an operation, computed and undoable,
// and removing a set takes only that membership from its elements; words
// become operations only when they plainly name an element or set of THIS
// diagram; and what the person placed is theirs — Socria can add and suggest,
// never move it.

import { apply, create, currentOf, describeObject, kindOf, readOperation, sanitizeSpace, seek, EMPTY_SPACE } from './.tmp/index.mjs';
import {
  sanitizeVenn,
  readVennOp,
  vennRegions,
  regionOrder,
  regionWords,
  setCounts,
  maskOf,
  vennCircles,
  maskAt,
  regionAnchors,
  nameAnchors,
  vennLayout,
  VENN_LIMITS,
  VENN_META,
  VENN_RADIUS,
} from './.tmp/display-venn.mjs';
import { stableKey } from './.tmp/display-base.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const J = JSON.stringify;

const TODAY = '2026-10-10';

// "Sort my drinks into morning and evening" — the person's own Morning set and orange juice
const drinks = () => ({
  title: 'Drinks',
  sets: [
    { id: 'm', name: 'Morning', by: 'person' },
    { id: 'e', name: 'Evening', by: 'socria' },
  ],
  elements: [
    { id: 'c', label: 'coffee', sets: ['e', 'm'], by: 'socria' }, // out of order: held in the sets' order
    { id: 'j', label: 'orange juice', sets: ['Morning'], by: 'person' }, // a set by its name
    { id: 'w', label: 'wine', sets: 'e', by: 'socria' }, // a comma-separated list
    { id: 'h', label: 'water', sets: [], by: 'socria' }, // in neither
  ],
});

// "Which skills does each role need?" — one element in every region of three sets
const skills = () => ({
  title: 'What each role needs',
  sets: [{ id: 'd', name: 'Designer' }, { id: 'p', name: 'Developer' }, { id: 'n', name: 'Manager' }],
  elements: [
    { label: 'Figma', sets: ['d'] },
    { label: 'Git', sets: ['p'] },
    { label: 'Budgets', sets: ['n'] },
    { label: 'Prototyping', sets: ['d', 'p'] },
    { label: 'Roadmaps', sets: ['d', 'n'] },
    { label: 'Code review', sets: ['p', 'n'] },
    { label: 'Communication', sets: ['d', 'p', 'n'] },
    { label: 'Accounting', sets: [] },
  ],
});

console.log('=== the state is canonical and checked ===');
{
  const s = sanitizeVenn(drinks());
  ok('a Venn diagram is read', !!s && s.sets.length === 2 && s.elements.length === 4);
  ok('  its ids are kept', J(s.sets.map((x) => x.id)) === J(['m', 'e']) && J(s.elements.map((e) => e.id)) === J(['c', 'j', 'w', 'h']));
  ok('  an element’s sets are held in the sets’ order', J(s.elements[0].sets) === J(['m', 'e']));
  ok('  a set may be named instead of given by id, in a list or with commas', J(s.elements[1].sets) === J(['m']) && J(s.elements[2].sets) === J(['e']));
  ok('  an element may be in none of the sets', J(s.elements[3].sets) === J([]));
  ok('  it opens as the diagram', s.view === 'venn' && s.title === 'Drinks');
  ok('  who wrote what is kept', s.sets[0].by === 'person' && s.elements[1].by === 'person' && s.elements[0].by === 'socria');
  ok('  the same state read twice is the same state', stableKey(sanitizeVenn(s)) === stableKey(s));
  ok('  and survives being saved and reopened', stableKey(sanitizeVenn(JSON.parse(J(s)))) === stableKey(s));

  const bad = sanitizeVenn({
    title: 'y'.repeat(300),
    sets: [{ name: 'Cats' }, { name: 'cats' }, { name: 'Dogs, mostly' }, { name: '' }, { name: 'Birds' }, { name: 'Fish' }],
    elements: [
      { label: 'Fur', sets: ['s1', 's2', 's1', 'Hamsters'] },
      { label: 'fur', sets: ['s1'] },
      { label: '', sets: ['s1'] },
      { label: '\u0000Four\u0007   legs\n', sets: 'Cats, Dogs mostly' },
      { label: 'Feathers', sets: 'Birds', by: 'someone' },
      'junk',
    ],
  });
  ok('a set name used twice (whatever its case) is one set', bad.sets.filter((x) => x.name.toLowerCase() === 'cats').length === 1);
  ok('a set name holds no comma (sets are listed with commas)', bad.sets[1].name === 'Dogs mostly');
  ok(`at most ${VENN_LIMITS.sets} sets`, bad.sets.length === 3 && J(bad.sets.map((x) => x.name)) === J(['Cats', 'Dogs mostly', 'Birds']));
  ok('a reference to a set that is not there is dropped; a set twice is once', J(bad.elements[0].sets) === J(['s1', 's2']));
  ok('a label used twice is one element, and an empty one none', bad.elements.length === 3);
  ok('control characters and runs of space are cleaned', bad.elements[1].label === 'Four legs' && J(bad.elements[1].sets) === J(['s1', 's2']));
  ok('an unknown author is Socria, never the person', bad.elements[2].by === 'socria');
  ok('a title is capped, and a missing one is “Venn diagram”', bad.title.length <= VENN_LIMITS.title && sanitizeVenn({ sets: [{ name: 'A1' }, { name: 'B1' }] }).title === 'Venn diagram');
  ok('the messy state is canonical too', stableKey(sanitizeVenn(JSON.parse(J(bad)))) === stableKey(bad));
  const many = sanitizeVenn({
    sets: [{ name: 'Odd' }, { name: 'Even' }],
    elements: Array.from({ length: 70 }, (_, i) => ({ label: `Number ${i} ${'z'.repeat(80)}`, sets: [i % 2 ? 's1' : 's2'] })),
  });
  ok(`at most ${VENN_LIMITS.elements} elements, each label capped`, many.elements.length === VENN_LIMITS.elements && many.elements.every((e) => e.label.length <= VENN_LIMITS.label));
  ok('fewer than two sets is not a Venn diagram', sanitizeVenn({ sets: [{ name: 'Alone' }], elements: [] }) === null);
  ok('junk is not a Venn diagram', sanitizeVenn(null) === null && sanitizeVenn('venn') === null && sanitizeVenn({}) === null && sanitizeVenn([]) === null);
  ok('a diagram with no elements yet is a diagram', sanitizeVenn({ sets: [{ name: 'A1' }, { name: 'B1' }] })?.elements.length === 0);
}

console.log('\n=== every region, with what is in it ===');
{
  const s = sanitizeVenn(drinks());
  const regs = vennRegions(s);
  ok('two sets make four regions: each alone, both, and neither', J(regs.map((r) => r.mask)) === J([1, 2, 3, 0]) && J(regOrderNames(s, regs)) === J(['only in Morning', 'only in Evening', 'in both Morning and Evening', 'in neither']));
  ok('  each with its members and its count', J(regs.map((r) => [r.members, r.count])) === J([[['j'], 1], [['w'], 1], [['c'], 1], [['h'], 1]]));
  ok('  and the sets it is inside', J(regs.map((r) => r.sets)) === J([['m'], ['e'], ['m', 'e'], []]));
  ok('  every element is in exactly one region', regs.reduce((n, r) => n + r.count, 0) === s.elements.length);
  ok('an element’s region as bits over the sets', maskOf(s, s.elements[0]) === 3 && maskOf(s, s.elements[3]) === 0);
  ok('each set’s count, and how many are only in it', J(setCounts(s)) === J([{ set: 'm', count: 2, only: 1 }, { set: 'e', count: 2, only: 1 }]));
  const t = sanitizeVenn(skills());
  const tr = vennRegions(t);
  ok('three sets make eight regions: each alone, each pair, all three, none', tr.length === 8 && J(tr.map((r) => r.mask)) === J([1, 2, 4, 3, 5, 6, 7, 0]) && J(regionOrder(3)) === J([1, 2, 4, 3, 5, 6, 7, 0]));
  ok('  said plainly', J(tr.map((r) => r.label)) === J(['only in Designer', 'only in Developer', 'only in Manager', 'in Designer and Developer, not Manager', 'in Designer and Manager, not Developer', 'in Developer and Manager, not Designer', 'in all three', 'in none of them']));
  ok('  each holding what was put there', J(tr.map((r) => r.members.map((id) => t.elements.find((e) => e.id === id).label))) === J([['Figma'], ['Git'], ['Budgets'], ['Prototyping'], ['Roadmaps'], ['Code review'], ['Communication'], ['Accounting']]));
  const empty = sanitizeVenn({ sets: [{ name: 'Red' }, { name: 'Round' }], elements: [{ label: 'Apple', sets: ['s1', 's2'] }] });
  ok('empty regions are regions too, counted 0', J(vennRegions(empty).map((r) => r.count)) === J([0, 0, 1, 0]));
  ok('a region in words, for any mask', regionWords(t, 0) === 'in none of them' && regionWords(t, 7) === 'in all three' && regionWords(s, 3) === 'in both Morning and Evening');
}

function regOrderNames(s, regs) {
  return regs.map((r) => regionWords(s, r.mask));
}

console.log('\n=== the geometry, measured ===');
{
  const dist = (x, y, c) => Math.hypot(x - c.cx, y - c.cy);
  for (const n of [2, 3]) {
    const cs = vennCircles(n);
    ok(`${n} equal circles, radius ${VENN_RADIUS}`, cs.length === n && cs.every((c) => c.r === VENN_RADIUS));
    ok('  each inside the unit box', cs.every((c) => c.cx - c.r >= 0 && c.cx + c.r <= 1 && c.cy - c.r >= 0 && c.cy + c.r <= 1));
    const pairs = cs.flatMap((a, i) => cs.slice(i + 1).map((b) => [a, b]));
    ok('  every two overlap, and neither holds the other', pairs.every(([a, b]) => {
      const d = Math.hypot(a.cx - b.cx, a.cy - b.cy);
      return d < a.r + b.r && d > Math.abs(a.r - b.r);
    }));
    // an independent scan: every combination of circles is a region of the picture
    const seen = new Set();
    for (let i = 0; i <= 200; i++) {
      for (let j = 0; j <= 200; j++) {
        const x = i / 200;
        const y = j / 200;
        seen.add(cs.reduce((m, c, k) => (dist(x, y, c) < c.r ? m | (1 << k) : m), 0));
      }
    }
    ok(`  scanning the box finds all ${1 << n} combinations as regions`, seen.size === 1 << n);
    const anchors = regionAnchors(n);
    ok(`  a label point for each of the ${1 << n} regions`, anchors.length === 1 << n && new Set(anchors.map((a) => a.mask)).size === 1 << n);
    for (const a of anchors) {
      const inside = cs.map((c) => dist(a.x, a.y, c) < c.r);
      const want = cs.map((_, i) => !!(a.mask & (1 << i)));
      const room = Math.min(...cs.map((c) => Math.abs(dist(a.x, a.y, c) - c.r)), a.x, 1 - a.x, a.y, 1 - a.y);
      ok(`  region ${a.mask}: its label point lies inside exactly the right circles, with room around it`, J(inside) === J(want) && room >= 0.05 && Math.abs(room - a.clearance) < 1e-6, J({ a, inside, want, room }));
      ok(`  region ${a.mask}: and the diagram’s own test agrees`, maskAt(cs, a.x, a.y) === a.mask);
    }
    const names = nameAnchors(n);
    ok('  each set’s name sits outside every circle, inside the box', names.length === n && names.every((p) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1 && cs.every((c) => dist(p.x, p.y, c) > c.r)));
    ok('  and nearest its own circle', names.every((p, i) => cs.every((c, k) => k === i || dist(p.x, p.y, cs[i]) < dist(p.x, p.y, c))));
  }
  ok('the anchors are the same every time they are asked for', J(regionAnchors(3)) === J(regionAnchors(3)));
  ok('…and a caller cannot spoil them', (() => {
    const a = regionAnchors(2);
    a[0].x = 99;
    return regionAnchors(2)[0].x !== 99;
  })());
  const s = sanitizeVenn(drinks());
  const lay = vennLayout(s);
  ok('the layout: a circle per set, with its name and where the name goes', J(lay.circles.map((c) => [c.set, c.name])) === J([['m', 'Morning'], ['e', 'Evening']]) && lay.circles.every((c, i) => J(c.label) === J(nameAnchors(2)[i])));
  ok('  and every region at its label point, with its members', lay.regions.length === 4 && lay.regions.every((r) => maskAt(vennCircles(2), r.x, r.y) === r.mask) && J(lay.regions.find((r) => r.mask === 3).members) === J(['c']));
}

console.log('\n=== every edit is an operation, computed and undoable ===');
{
  const k = kindOf('venn');
  const fresh = (raw = drinks()) => create(EMPTY_SPACE, 'venn', raw, { name: 'V1', origin: 'socria' });
  const run = (op, args, by = 'person', raw) => {
    const c = fresh(raw);
    return apply(c.space, c.obj.id, op, args, { by, at: 1 });
  };
  const st = (r) => (r.ok ? currentOf(r.obj) : null);
  const canonical = (r) => r.ok && stableKey(k.sanitize(JSON.parse(J(st(r))))) === stableKey(st(r));
  const el = (r, id) => st(r).elements.find((e) => e.id === id);

  ok('the Venn diagram is an object of thought', fresh().obj.kind === 'venn' && k.label === 'Venn diagram');
  // sets
  let r = run('addSet', { name: 'Weekend', by: 'person' });
  ok('a third set is added, with a fresh id', r.ok && J(st(r).sets[2]) === J({ id: 's1', name: 'Weekend', by: 'person' }) && canonical(r));
  ok('  and every region of three sets is there at once', vennRegions(st(r)).length === 8);
  ok('  but not a fourth', /3 sets at most/.test(run('addSet', { name: 'Night', by: 'person' }, 'person', skills()).why ?? ''));
  ok('  nor a name already used', /already a set called/.test(run('addSet', { name: 'evening', by: 'person' }).why ?? ''));
  ok('  nor no name', !run('addSet', { name: ' ', by: 'person' }).ok);
  ok('  a comma in its name is taken out', st(run('addSet', { name: 'Late, late night', by: 'person' })).sets[2].name === 'Late late night');
  r = run('renameSet', { id: 'e', name: 'Night', by: 'person' });
  ok('a set is renamed', r.ok && st(r).sets[1].name === 'Night' && canonical(r));
  ok('  and, renamed by the person, is theirs', st(r).sets[1].by === 'person');
  ok('  not to a name another set has', !run('renameSet', { id: 'e', name: 'MORNING' }).ok);
  ok('  nor to the name it has', /already called that/.test(run('renameSet', { id: 'e', name: 'Evening' }).why ?? ''));
  const weekend = drinks();
  weekend.sets.push({ id: 'k', name: 'Weekend', by: 'socria' });
  weekend.elements[0].sets = ['m', 'e', 'k'];
  weekend.elements.push({ id: 'b', label: 'mimosa', sets: ['k'], by: 'socria' });
  r = run('removeSet', { id: 'k' }, 'person', weekend);
  ok('a set is removed, and its elements stay — losing only that membership', r.ok && J(el(r, 'c').sets) === J(['m', 'e']) && J(el(r, 'b').sets) === J([]) && st(r).elements.length === 5 && canonical(r));
  ok('  and the step says where they went', r.step.note === '2 elements were in Weekend; 1 is now in none of the sets.', r.step.note);
  ok('  but never below two sets', /at least 2 sets/.test(run('removeSet', { id: 'e' }).why ?? ''));
  // elements
  r = run('addElement', { label: 'tea', sets: 'Morning, Evening', by: 'person' });
  ok('an element is added by the names of its sets', r.ok && J(st(r).elements[4]) === J({ id: 'e1', label: 'tea', sets: ['m', 'e'], by: 'person' }) && canonical(r));
  ok('  and the step says where it is, and how many share it', r.step.note === '‘tea’ is in both Morning and Evening — 2 there now.' && r.step.said === 'added “tea” in Morning and Evening', `${r.step.note} | ${r.step.said}`);
  ok('  or by their ids', J(el(run('addElement', { label: 'tea', sets: 'e', by: 'person' }), 'e1').sets) === J(['e']));
  r = run('addElement', { label: 'milk', sets: '', by: 'person' });
  ok('  or in none of them', r.ok && J(el(r, 'e1').sets) === J([]) && r.step.said === 'added “milk” in none of the sets');
  ok('  a set that is not there is refused, by its name', /no set called ‘Lunch’/.test(run('addElement', { label: 'soup', sets: 'Morning, Lunch', by: 'person' }).why ?? ''));
  ok('  as is a label already there', /‘coffee’ is already in it/.test(run('addElement', { label: 'Coffee', sets: 'Morning', by: 'person' }).why ?? ''));
  const full = { ...drinks(), elements: Array.from({ length: 40 }, (_, i) => ({ label: `Drink ${i}`, sets: ['m'] })) };
  ok(`  and a ${VENN_LIMITS.elements + 1}st element`, /40 elements at most/.test(run('addElement', { label: 'One more', sets: 'Morning', by: 'person' }, 'person', full).why ?? ''));
  r = run('setsOf', { id: 'w', sets: 'Morning, Evening' });
  ok('an element is moved', r.ok && J(el(r, 'w').sets) === J(['m', 'e']) && canonical(r) && r.step.said === 'placed in Morning and Evening');
  ok('  and the step says where it is now', r.step.note === '‘wine’ is in both Morning and Evening — 2 there now.', r.step.note);
  r = run('setsOf', { id: 'c', sets: '' });
  ok('  into none of the sets', r.ok && J(el(r, 'c').sets) === J([]));
  ok('  where it is already is refused, and why', /‘coffee’ is already in both Morning and Evening/.test(run('setsOf', { id: 'c', sets: 'Evening, Morning' }).why ?? ''));
  ok('  as is a set that is not there', !run('setsOf', { id: 'c', sets: 'Lunch' }).ok);
  ok('  and a move must say where to — nothing is assumed', /Say which sets it goes in/.test(run('setsOf', { id: 'c' }).why ?? ''));
  r = run('renameElement', { id: 'c', label: 'espresso', by: 'person' });
  ok('an element is renamed', r.ok && el(r, 'c').label === 'espresso' && canonical(r));
  ok('  not to a label another has', !run('renameElement', { id: 'c', label: 'Wine' }).ok);
  r = run('removeElement', { id: 'h' });
  ok('an element is removed', r.ok && st(r).elements.length === 3 && !st(r).elements.some((e) => e.id === 'h') && canonical(r));
  ok('  only one that is there', !run('removeElement', { id: 'zz' }).ok);
  ok('shown as a table, and back', st(run('view', { view: 'table' })).view === 'table' && !run('view', { view: 'pie' }).ok);
  ok('renamed', st(run('title', { title: 'What I drink' })).title === 'What I drink');

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
  ok('a session: add a set', step('addSet', { name: 'Weekend', by: 'person' }).ok);
  ok('  put things in it', step('addElement', { label: 'mimosa', sets: 'Weekend', by: 'person' }).ok && step('setsOf', { id: 'c', sets: 'Morning, Evening, Weekend', by: 'person' }).ok);
  ok('  move one out of everything', step('setsOf', { id: 'w', sets: '', by: 'person' }).ok);
  ok('  rename a set', step('renameSet', { id: 'e', name: 'Night', by: 'person' }).ok);
  ok('  and show the table', step('view', { view: 'table' }).ok);
  const now = space.objs[0].at;
  ok('every step is kept', now === 6 && space.objs[0].steps.length === 6);
  space = seek(space, id, 2);
  ok('undo steps back without losing anything: coffee in two sets again', J(currentOf(space.objs[0]).elements.find((e) => e.id === 'c').sets) === J(['m', 'e']) && space.objs[0].states.length === 7);
  space = seek(space, id, now);
  ok('…and redo steps forward', currentOf(space.objs[0]).view === 'table' && vennRegions(currentOf(space.objs[0])).find((r) => r.mask === 7).count === 1);
  const back = sanitizeSpace(JSON.parse(J(space)));
  ok('the whole history survives a save: every step re-computed', back.objs[0].steps.length === 6 && stableKey(currentOf(back.objs[0])) === stableKey(currentOf(space.objs[0])));
  ok('  and what each step showed is said again on load', J(back.objs[0].steps.map((x) => x.note)) === J(space.objs[0].steps.map((x) => x.note)) && back.objs[0].steps.some((x) => x.note === '‘coffee’ is in all three — the only one there.'), J(back.objs[0].steps.map((x) => x.note)));
}

console.log('\n=== what the person placed is theirs ===');
{
  const c = create(EMPTY_SPACE, 'venn', drinks(), { name: 'V1', origin: 'socria' });
  const id = c.obj.id;
  const as = (by, op, args, space = c.space) => apply(space, id, op, args, { by, at: 2 });
  // the person's own: the Morning set and orange juice
  ok('Socria cannot move the person’s element', !as('socria', 'setsOf', { id: 'j', sets: 'Evening' }).ok);
  ok('  nor rename it, nor remove it', !as('socria', 'renameElement', { id: 'j', label: 'OJ' }).ok && !as('socria', 'removeElement', { id: 'j' }).ok);
  ok('  and says why', /yours/.test(as('socria', 'removeElement', { id: 'j' }).why ?? ''));
  ok('Socria cannot rename the person’s set', !as('socria', 'renameSet', { id: 'm', name: 'AM' }).ok);
  ok('it can move and rename what it wrote', as('socria', 'setsOf', { id: 'w', sets: 'Morning, Evening' }).ok && as('socria', 'renameElement', { id: 'h', label: 'still water' }).ok && as('socria', 'renameSet', { id: 'e', name: 'Night' }).ok);
  ok('it can add', as('socria', 'addElement', { label: 'tea', sets: 'Morning', by: 'socria' }).ok && as('socria', 'addSet', { name: 'Weekend', by: 'socria' }).ok);
  ok('nobody can claim to be someone else', !as('socria', 'addElement', { label: 'tea', sets: 'Morning', by: 'person' }).ok && !as('person', 'addElement', { label: 'tea', sets: 'Morning', by: 'socria' }).ok && !as('socria', 'setsOf', { id: 'w', sets: 'Morning', by: 'person' }).ok);
  const moved = as('person', 'setsOf', { id: 'w', sets: 'Morning', by: 'person' });
  ok('an element the person moves is theirs from then on', moved.ok && currentOf(moved.obj).elements.find((e) => e.id === 'w').by === 'person');
  ok('  so Socria cannot move it back', !as('socria', 'setsOf', { id: 'w', sets: 'Evening' }, moved.space).ok);
  const weekend = drinks();
  weekend.sets.push({ id: 'k', name: 'Weekend', by: 'socria' });
  weekend.elements.push({ id: 'b', label: 'mimosa', sets: ['k'], by: 'person' });
  const cw = create(EMPTY_SPACE, 'venn', weekend, { name: 'V2', origin: 'socria' });
  ok('Socria cannot remove even its own set while the person’s elements are in it', /Your elements are in it/.test(apply(cw.space, cw.obj.id, 'removeSet', { id: 'k' }, { by: 'socria', at: 3 }).why ?? ''));
  ok('  the person can', apply(cw.space, cw.obj.id, 'removeSet', { id: 'k' }, { by: 'person', at: 3 }).ok);
  ok('  and Socria can remove one that holds only its own', apply(cw.space, cw.obj.id, 'removeSet', { id: 'e' }, { by: 'socria', at: 3 }).ok);
  // a forged history is cut on load
  const forged = JSON.parse(J(c.space));
  const s0 = currentOf(forged.objs[0]);
  forged.objs[0].states = [s0, { ...s0, elements: s0.elements.map((e) => (e.id === 'j' ? { ...e, sets: ['e'] } : e)) }];
  forged.objs[0].steps = [{ op: 'setsOf', args: { id: 'j', sets: 'Evening' }, said: 'x', by: 'socria', at: 3 }];
  forged.objs[0].at = 1;
  const read = sanitizeSpace(forged);
  ok('a stored step in which Socria moved the person’s element is cut on load', read.objs[0].states.length === 1 && J(currentOf(read.objs[0]).elements.find((e) => e.id === 'j').sets) === J(['m']));
  forged.objs[0].steps[0].by = 'person';
  ok('  while the same step, taken by the person, replays', sanitizeSpace(forged).objs[0].states.length === 2);
}

console.log('\n=== words become operations only when they plainly are one ===');
{
  // coffee only in the morning, to start
  const s = sanitizeVenn({ ...drinks(), elements: drinks().elements.map((e) => (e.id === 'c' ? { ...e, sets: ['m'] } : e)) });
  const r = (t, st = s) => readVennOp(t, st, TODAY);
  const is = (t, want, st) => ok(`"${t}"`, J(r(t, st)) === J(want), J(r(t, st)));
  const place = (id, sets) => ({ op: 'setsOf', args: { id, sets, by: 'person' } });
  const add = (label, sets) => ({ op: 'addElement', args: { label, sets, by: 'person' } });
  is('put coffee in Morning and Evening', place('c', 'Morning, Evening'));
  is('put tea in Morning and Evening', add('tea', 'Morning, Evening'));
  is('add tea to Morning only', add('tea', 'Morning'));
  is('move coffee to both', place('c', 'Morning, Evening'));
  is('coffee is in neither', place('c', ''));
  is('remove coffee', { op: 'removeElement', args: { id: 'c' } });
  is('rename Morning to Mornings', { op: 'renameSet', args: { id: 'm', name: 'Mornings', by: 'person' } });
  is('rename coffee to espresso', { op: 'renameElement', args: { id: 'c', label: 'espresso', by: 'person' } });
  is('add wine to Morning', place('w', 'Morning, Evening'));
  is('wine is also in Morning', place('w', 'Morning, Evening'));
  is('put wine in Morning', place('w', 'Morning'));
  is('take wine out of Evening', place('w', ''));
  is('move coffee from Morning to Evening', place('c', 'Evening'));
  is('orange juice is not in Morning', place('j', ''));
  is("coffee isn't in any of them", place('c', ''));
  is('the coffee goes in both', place('c', 'Morning, Evening'));
  // saying where it IS adds; where it GOES puts it exactly there; "only" is always exact
  is('coffee is in Evening', place('c', 'Morning, Evening'));
  is('coffee belongs in Evening', place('c', 'Evening'));
  is('coffee is only in Evening', place('c', 'Evening'));
  is('remove Morning from the diagram', { op: 'removeSet', args: { id: 'm' } });
  is('put iced coffee in Evening', add('iced coffee', 'Evening'));
  is("put 'fish and chips' in Evening", add('fish and chips', 'Evening'));
  is('can you put tea in Evening?', add('tea', 'Evening'));
  is('remove coffee from the diagram', { op: 'removeElement', args: { id: 'c' } });
  is('drop wine into Morning', place('w', 'Morning'));
  is('add a set: Weekend', { op: 'addSet', args: { name: 'Weekend', by: 'person' } });
  is('add a third circle called Weekend', { op: 'addSet', args: { name: 'Weekend', by: 'person' } });
  is('show it as a table', { op: 'view', args: { view: 'table' } });
  is('back to the diagram', { op: 'view', args: { view: 'venn' } });
  const three = sanitizeVenn(skills());
  is('delete the Manager set', { op: 'removeSet', args: { id: 'n' } }, three);
  is('move Git to all three', place('e2', 'Designer, Developer, Manager'), three);
  is('put Figma in Designer and Manager', place('e1', 'Designer, Manager'), three);
  ok('"both" with three sets says no two in particular', r('move Git to both', three) === null);
  ok('a list of new things is not one thing', r('put tea and milk in Morning') === null);
  ok('nor is a pronoun', r('put it in Morning') === null);
  ok('moving what is not there makes nothing', r('move tea to Evening') === null);
  // in a workspace, the words find the diagram
  const sp = create(EMPTY_SPACE, 'venn', s, { name: 'V1', origin: 'socria' }).space;
  const found = readOperation(sp, 'move coffee to both');
  ok('in a workspace, the words find the diagram and its element', J(found) === J({ id: 'V1', ...place('c', 'Morning, Evening') }), J(found));
  const done = apply(sp, found.id, found.op, found.args, { by: 'person', at: 1 });
  ok('  and the step they ask for is computed, as the person’s', done.ok && currentOf(done.obj).elements.find((e) => e.id === 'c').by === 'person' && vennRegions(currentOf(done.obj)).find((x) => x.mask === 3).count === 1);
  // what must be left to the conversation
  for (const t of [
    'I like coffee in the morning',
    "what's in Morning?",
    'put that aside',
    'add more detail',
    'remove the doubt',
    'coffee is great',
    'move on to the next topic',
    'should I put coffee in Morning?',
    'show me how this works',
    'put coffee in the morning routine',
    'the problem is in Morning',
    'is coffee in both?',
    'which drinks are in neither?',
    'I put sugar in my coffee',
    'add some colour to the circles',
  ]) {
    ok(`left to the conversation: "${t}"`, r(t) === null, J(r(t)));
  }
}

console.log('\n=== what the conversation is told ===');
{
  const k = kindOf('venn');
  const s = sanitizeVenn(drinks());
  const facts = k.facts(s, { guarded: false });
  ok('the facts say what it is', facts[0] === 'Drinks: a Venn diagram of 2 sets (Morning and Evening) holding 4 elements, shown as the diagram.', facts[0]);
  ok('  what each set holds', facts.includes('Morning holds 2 (1 only there); Evening holds 2 (1 only there).'));
  ok('  what they share, and what is in neither', facts.includes('In both Morning and Evening: 1 — coffee.') && facts.includes('In neither: 1 — water.'));
  ok('  and what is the person’s own', facts.some((x) => /2 of its sets and elements are the person’s own/.test(x)));
  const sparse = sanitizeVenn({ sets: [{ name: 'Red' }, { name: 'Round' }], elements: [{ label: 'Apple', sets: ['s1', 's2'] }] });
  ok('  an empty region is said to be empty', k.facts(sparse, { guarded: false }).includes('Empty: only in Red; only in Round.'));
  const text = k.text(s);
  ok('the text lists every region with its members, and marks what is theirs', /Sets: Morning · theirs; Evening/.test(text) && /Only in Morning \(1\): orange juice · theirs/.test(text) && /In both Morning and Evening \(1\): coffee/.test(text) && /In neither \(1\): water/.test(text));
  const big = sanitizeVenn({ sets: [{ name: 'Alpha' }, { name: 'Beta' }, { name: 'Gamma' }], elements: Array.from({ length: 40 }, (_, i) => ({ label: `A long element label number ${i} that fills the line`, sets: [`s${(i % 3) + 1}`] })) });
  ok('the text is capped', big.elements.length === 40 && k.text(big).length <= 2400);
  for (const v of ['venn', 'table']) {
    const z = k.size({ ...big, view: v }, 'live');
    ok(`a live ${v} at the most it holds fits in 720 × 640`, z.w > 0 && z.h > 0 && z.w <= 720 && z.h <= 640);
  }
  ok('a card is 260 × 150 and a step in a trail 200 × 110', J(k.size(s, 'card')) === J({ w: 260, h: 150 }) && J(k.size(s, 'trail')) === J({ w: 200, h: 110 }));
  ok('its shape in a line', k.shape(s) === 'Venn diagram · 2 sets, 4 elements' && k.shape({ ...s, view: 'table' }) === 'table · 2 sets, 4 elements');
  ok('its parts are its sets and its elements', J(k.parts(s).map((p) => p.id)) === J(['m', 'e', 'c', 'j', 'w', 'h']));
  ok('  each with what is computed about it', J(k.partFacts(s, 'm')) === J(['Morning', '2 in it, 1 only there', 'yours']) && J(k.partFacts(s, 'c')) === J(['coffee', 'in both Morning and Evening', 'from Socria']));
  ok('both views can always be drawn', k.views.every((v) => !v.unavailable || v.unavailable(s) === null) && k.views.find((v) => v.primary).id === 'venn');
  ok('it is a display: a Venn diagram, named V1, V2 …', VENN_META.kind === 'venn' && VENN_META.noun === 'Venn diagram' && VENN_META.handle === 'V' && VENN_META.about.length > 0);
  const described = describeObject(create(EMPTY_SPACE, 'venn', drinks(), { name: 'V1', origin: 'socria' }).obj, { guarded: false }).join('\n');
  ok('the reply model is told the diagram as it is', /Venn diagram V1 — Venn diagram · 2 sets, 4 elements/.test(described) && /VENN DIAGRAM “Drinks”/.test(described) && /In both Morning and Evening: 1 — coffee\./.test(described));
}

console.log('\n=== under fuzz: 400 random proposals, 300 random sessions ===');
{
  let seed = 20261011;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
  const setNames = ['Morning', 'morning', 'Evening', 'Weekend', 'Night, late', '', ' ', 'S'.repeat(70), null, 3];
  const labels = ['coffee', 'Coffee', 'tea', 'wine', 'water', '', 'mimosa', 'L'.repeat(90), null, 'orange juice'];
  const refs = ['m', 'e', 's1', 's2', 'Morning', 'Evening', 'Lunch', '', null, 'bad id!'];
  const gen = () => ({
    title: pick(['Drinks', '', null]),
    view: pick(['venn', 'table', 'pie', undefined]),
    sets: Array.from({ length: Math.floor(rnd() * 6) }, () => ({ id: pick(refs), name: pick(setNames), by: pick(['person', 'socria', undefined]) })),
    elements: Array.from({ length: Math.floor(rnd() * 50) }, () => ({ id: pick(['c', 'e1', 'j', '', null]), label: pick(labels), sets: pick([[], [pick(refs)], [pick(refs), pick(refs)], pick(refs), `${pick(refs)}, ${pick(refs)}`, 7]), by: pick(['person', 'socria']) })),
  });
  let read = 0;
  let stable = true;
  for (let i = 0; i < 400 && stable; i++) {
    const s = sanitizeVenn(gen());
    if (!s) continue;
    read++;
    stable = stableKey(sanitizeVenn(s)) === stableKey(s) && stableKey(sanitizeVenn(JSON.parse(J(s)))) === stableKey(s) && vennRegions(s).reduce((n, r) => n + r.count, 0) === s.elements.length;
    if (!stable) console.log('not canonical:', J(s));
  }
  ok(`every random proposal that reads (${read} of 400) is canonical, and its regions hold every element once`, stable && read > 50);

  const opArgs = () =>
    pick([
      ['addSet', { name: pick(setNames), by: pick(['person', 'socria']) }],
      ['renameSet', { id: pick(['m', 'e', 's1']), name: pick(setNames), by: pick(['person', undefined]) }],
      ['removeSet', { id: pick(['m', 'e', 's1']) }],
      ['addElement', { label: pick(labels), sets: pick(['', 'Morning', 'Morning, Evening', 'e', 'Lunch', 'Weekend']), by: pick(['person', 'socria']) }],
      ['setsOf', { id: pick(['c', 'j', 'w', 'h', 'e1']), sets: pick(['', 'Morning', 'Evening, Morning', 'm, e', 'Weekend', 'Lunch']), by: pick(['person', 'socria', undefined]) }],
      ['renameElement', { id: pick(['c', 'j', 'w', 'e1']), label: pick(labels), by: pick(['person', undefined]) }],
      ['removeElement', { id: pick(['c', 'j', 'w', 'h', 'e1']) }],
      ['view', { view: pick(['venn', 'table', 'pie']) }],
      ['title', { title: pick(['T', '']) }],
    ]);
  const theirs = (st) => [...st.sets.filter((x) => x.by === 'person').map((x) => [`s:${x.id}`, stableKey(x)]), ...st.elements.filter((x) => x.by === 'person').map((x) => [`e:${x.id}`, stableKey(x)])];
  let taken = 0;
  let replayed = true;
  let kept = true;
  for (let i = 0; i < 300 && replayed && kept; i++) {
    let space = create(EMPTY_SPACE, 'venn', drinks(), { name: 'V1', origin: 'socria' }).space;
    for (let j = 0; j < 20; j++) {
      const [op, raw] = opArgs();
      const args = Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== undefined));
      const by = pick(['person', 'socria']);
      const before = currentOf(space.objs[0]);
      const x = apply(space, 'V1', op, args, { by, at: j });
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
      const k = kindOf('venn');
      const c = create(EMPTY_SPACE, 'venn', drinks(), { name: 'V1', origin: 'socria' });
      let space = c.space;
      const steps = [
        ['addSet', { name: 'Weekend', by: 'person' }],
        ['addElement', { label: 'mimosa', sets: 'Weekend, Morning', by: 'person' }],
        ['setsOf', { id: 'w', sets: '', by: 'person' }],
        ['removeSet', { id: 'e' }],
        ['view', { view: 'table' }],
      ];
      for (const [op, args] of steps) {
        const x = apply(space, c.obj.id, op, args, { by: 'person', at: 1 });
        if (!x.ok) throw new Error(`${op}: ${x.why}`);
        space = x.space;
      }
      const cur = currentOf(space.objs[0]);
      outs.push(J([k.facts(cur, { guarded: false }), k.text(cur), k.shape(cur), vennRegions(cur), vennLayout(cur), setCounts(cur), readVennOp('move coffee to both', cur, TODAY), sanitizeSpace(JSON.parse(J(space))).objs[0].steps.map((x) => [x.said, x.note])]));
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
  ok('sanitize, every operation, its record, the facts, the text and the layout read no clock, no chance and no locale', !err, err?.message);
  ok('  and give the same answer every time', outs.length === 2 && outs[0] === outs[1]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
