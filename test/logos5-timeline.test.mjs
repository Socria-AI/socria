// LOGOS 5 — THE UNIVERSAL MAP IN ORDER (lib/logos5/timeline.ts): This month and All time.
//
// Held down here:
//   • the oldest is furthest left and the newest furthest right, and each
//     stays where it began — opening one again does not move it;
//   • a subject's conversations begun within a week of each other are one
//     thread; after a longer gap a new thread begins, with no line across,
//     and it remembers the last one before it (↩);
//   • a quick question on its own sits on the floor; a long one about nothing
//     in particular stands alone;
//   • lanes are worked out over the whole history, in order, so a new
//     conversation at the end moves nothing that came before it;
//   • a long quiet stretch is folded down to a mark, and says which dates;
//   • words under a star, over it when another is too close, or only on its
//     card — never two on top of each other — and the one worked on last is
//     named first;
//   • This month begins on the first; the days are named; now is last;
//   • the same conversations draw the same line, every time.

import { build } from 'esbuild';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, '.tmp', 'logos5-timeline');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const entry = join(OUT, 'entry.ts');
writeFileSync(entry, [
  `export * from ${JSON.stringify(join(root, 'lib/logos5/timeline.ts'))};`,
  `export { tilesOf } from ${JSON.stringify(join(root, 'lib/logos5/universe.ts'))};`,
  `export { homesOf } from ${JSON.stringify(join(root, 'lib/logos5/spatial.ts'))};`,
  `export { emptyArrangement } from ${JSON.stringify(join(root, 'lib/logos5/arrange.ts'))};`,
].join('\n'));
await build({ entryPoints: { tl: entry }, bundle: true, format: 'esm', platform: 'node', outdir: OUT, outExtension: { '.js': '.mjs' }, tsconfig: join(root, 'tsconfig.json'), logLevel: 'error', alias: { '@': root } });
const T = await import(pathToFileURL(join(OUT, 'tl.mjs')).href);

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 400))));
const J = JSON.stringify;

const NOW = new Date(2026, 9, 21, 15, 0).getTime(); // Wednesday Oct 21, mid-afternoon, local time
const DAY = 86_400_000;
// a conversation: begun `first` days ago, last worked on `last` days ago; long ones are hubs
const conv = (id, title, first, o = {}) => {
  const turns = o.turns ?? (o.quick ? 1 : 3);
  const at = NOW - first * DAY;
  const messages = Array.from({ length: turns }).flatMap((_, i) => [
    { role: 'user', content: i ? 'And then?' : title, at: at + i * 60_000 },
    { role: 'assistant', content: 'It comes down to one thing.', at: at + i * 60_000 + 30_000 },
  ]);
  return { id, title, updatedAt: NOW - (o.last ?? first) * DAY, projectId: o.p ?? null, messages, map: { nodes: [], edges: [] } };
};
const projects = [
  { id: 'acct', name: 'ACCT 2301', color: 'clay', createdAt: 1 },
  { id: 'jobs', name: 'Job hunt', color: 'plum', createdAt: 2 },
  { id: 'thesis', name: 'Thesis', color: 'slate', createdAt: 3 },
];
const CONVS = [
  conv('debits', 'Debits vs credits, quickly', 21, { p: 'acct', quick: true }),
  conv('accrual', 'Why accrual basis matters', 9, { p: 'acct' }),
  conv('prepaid', 'Practice: prepaid rent', 3, { p: 'acct' }),
  conv('exam', 'Exam 2: adjusting entries', 2, { p: 'acct', last: 0.04 }),
  conv('offers', 'Two job offers', 6, { p: 'jobs' }),
  conv('negotiate', 'Negotiating the offer', 4, { p: 'jobs' }),
  conv('kitchens', 'Startup idea: shared kitchens', 28, { p: 'thesis' }),
  conv('round1', 'Interview notes, round 1', 23, { p: 'thesis' }),
  conv('outline', 'Thesis outline', 1, { p: 'thesis' }),
  conv('rust', 'Learn Rust or Go next', 8, { quick: true }),
  conv('email', 'Write the launch email', 1.2, { quick: true }),
  conv('trip', 'A few loose thoughts', 70, {}),
];
const layoutOf = (convs = CONVS, o = {}) => {
  const tiles = T.tilesOf(convs);
  const homes = T.homesOf(tiles, projects, T.emptyArrangement());
  return T.timeLayout({ tiles, homes, now: o.now ?? NOW, from: o.from ?? null, narrow: !!o.narrow });
};

console.log('\n=== in order, each where it began ===');
{
  const L = layoutOf();
  const x = (id) => L.byId.get(id).x;
  ok('every conversation is on the line', L.beads.length === CONVS.length && CONVS.every((c) => L.byId.has(c.id)));
  ok('the oldest furthest left, the newest furthest right', x('trip') < x('kitchens') && x('kitchens') < x('round1') && x('round1') < x('debits') && x('debits') < x('accrual') && x('outline') > x('exam'));
  ok('worked on an hour ago, begun two days ago: it is two days back, not at the end', x('exam') < x('outline') && x('exam') < L.nowX);
  const later = layoutOf(CONVS.map((c) => (c.id === 'accrual' ? { ...c, updatedAt: NOW } : c)));
  ok('opening one again moves nothing', later.byId.get('accrual').x === x('accrual') && J(later.beads.map((b) => [b.id, b.x, b.y])) === J(L.beads.map((b) => [b.id, b.x, b.y])));
  ok('now is after every one of them, and this week began before now', L.beads.every((b) => b.x <= L.nowX) && L.weekX < L.nowX);
  ok('the same conversations draw the same line', J(layoutOf()) === J(L));
}

console.log('\n=== joined, and kept apart ===');
{
  const L = layoutOf();
  const th = (id) => L.threads.find((t) => t.ids.includes(id));
  ok('within a week of the one before, about the same thing: one thread', J(th('exam')?.ids) === J(['accrual', 'prepaid', 'exam']) && J(th('negotiate')?.ids) === J(['offers', 'negotiate']));
  ok('  named for its subject, in its colour', th('exam').name === 'ACCT 2301' && th('exam').color === 'clay');
  ok('after a longer gap, a new thread — nothing drawn across it', th('round1') !== th('outline') && J(th('round1').ids) === J(['kitchens', 'round1']) && J(th('outline').ids) === J(['outline']));
  ok('  and it remembers the last one before it', th('outline').back?.id === 'round1' && th('exam').back?.id === 'debits' && th('round1').back === null);
  ok('a quick question on its own sits on the floor', L.byId.get('rust').lane === -1 && L.byId.get('email').lane === -1 && L.byId.get('debits').lane === -1 && L.floorY > Math.max(...L.beads.filter((b) => b.lane >= 0).map((b) => b.y)));
  ok('a long one about nothing in particular stands alone', th('trip')?.ids.length === 1 && th('trip').name === '' && L.byId.get('trip').lane >= 0);
  ok('a thread is on one lane; its stars in time, never on top of each other', L.threads.every((t) => t.ids.every((id) => L.byId.get(id).lane === t.lane) && t.ids.every((id, i) => i === 0 || L.byId.get(id).x > L.byId.get(t.ids[i - 1]).x + 8)));
  const lanesTouch = L.threads.some((a) => L.threads.some((b) => a !== b && a.lane === b.lane && a.x0 <= b.x1 + 60 && b.x0 <= a.x1 + 60));
  ok('two threads share a lane only when they are well apart', !lanesTouch);
}

console.log('\n=== nothing already drawn moves ===');
{
  const L = layoutOf();
  const more = layoutOf([...CONVS, conv('fresh', 'Monthly runway', 0.1, { p: 'jobs' }), conv('q2', 'Quick one', 0.05, { quick: true })], { now: NOW + 3600_000 });
  const before = CONVS.filter((c) => L.byId.get(c.id).x <= L.byId.get('negotiate').x);
  ok('a new conversation at the end: every place on the line stays, and every lane begun before the thread it joins', CONVS.every((c) => more.byId.get(c.id).x === L.byId.get(c.id).x) && before.length >= 8 && before.every((c) => more.byId.get(c.id).lane === L.byId.get(c.id).lane));
  ok('  it joins its subject when it follows on', more.threads.find((t) => t.ids.includes('fresh'))?.ids.join() === 'offers,negotiate,fresh');
}

console.log('\n=== quiet stretches, days, This month ===');
{
  const L = layoutOf();
  ok('a long quiet stretch is folded down to a mark', L.gaps.length === 1 && L.gaps[0].w === T.TIME_WIDE.gap && L.byId.get('kitchens').x - L.byId.get('trip').x < 30 * T.TIME_WIDE.day, J(L.gaps));
  ok('  and says which dates', /^Aug \d+ – Sep \d+$/.test(L.gaps[0].label), L.gaps[0].label);
  const today = L.days.find((d) => d.today);
  ok('days are named: today, Mondays and the first of the month marked', today?.label === 'Today' && L.days.some((d) => d.mark === 'week' && /^Mon \d+$/.test(d.label)) && L.days.some((d) => d.mark === 'month' && d.label === 'Oct 1') && L.days.find((d) => d.label === 'Mon 19')?.short === 'M 19');
  ok('the days run in order, side by side', L.days.every((d, i) => i === 0 || d.x >= L.days[i - 1].x + L.days[i - 1].w - 0.5));
  const M = layoutOf(CONVS.filter((c) => c.messages[0].at >= T.monthStart(NOW)), { from: T.monthStart(NOW) });
  ok('This month begins on the first', new Date(M.start).getDate() === 1 && M.days[0].label === 'Oct 1' && M.beads.length === CONVS.filter((c) => c.messages[0].at >= T.monthStart(NOW)).length);
  const E = T.timeLayout({ tiles: [], homes: T.homesOf([], [], T.emptyArrangement()), now: NOW });
  ok('nothing yet: an empty line, today on it', E.beads.length === 0 && E.width > 0 && E.days.some((d) => d.today));
}

console.log('\n=== words, never on top of each other ===');
{
  // five of one subject a day apart: too close for every name underneath
  const crowd = ['a', 'b', 'c', 'd', 'e'].map((k, i) => conv(k, `Chapter ${i + 1} reading notes`, 6 - i * 0.6, { p: 'thesis' }));
  const L = layoutOf(crowd);
  const lab = L.beads.map((b) => b.label);
  ok('the first under its star; one too close goes over its star, or only on its card', lab[0] === 'below' && lab.includes('above') && lab.includes('none'), J(lab));
  const clash = (side) => {
    const xs = L.beads.filter((b) => b.label === side).map((b) => b.x).sort((a, b) => a - b);
    return xs.some((x, i) => i > 0 && x - xs[i - 1] < T.TIME_WIDE.label);
  };
  ok('no two names under the stars overlap, nor two over them', !clash('below') && !clash('above'));
  // two a day apart: the one worked on today is named under its star, whichever began first
  const pair = layoutOf([conv('older', 'Practice: prepaid rent', 3, { p: 'acct', last: 3 }), conv('today', 'Exam 2: adjusting entries', 2, { p: 'acct', last: 0.04 })]);
  ok('what was worked on last is named first', pair.byId.get('today').label === 'below' && pair.byId.get('older').label !== 'below', J(pair.beads.map((b) => [b.id, b.label])));
  const P = layoutOf(undefined, { narrow: true });
  ok('a phone draws it narrower', P.width < layoutOf().width && P.beads.length === CONVS.length);
}

console.log(`\nlogos5-timeline: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
