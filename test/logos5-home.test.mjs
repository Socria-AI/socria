// LOGOS 5 — THE UNIVERSAL MAP: EVERY CONVERSATION, WHERE THE PERSON PUT IT.
//
// lib/logos5/universe.ts lays home out; lib/logos5/arrange.ts keeps how the
// person arranged it. Held down here:
//   • a conversation's tile says only what the conversation says — where it
//     stands is its synthesis or reply, a question is open only when Socria
//     asked it last, nothing is made up for a conversation with no map;
//   • Projects are frames in the order they were made (an empty one too),
//     then the rest, then Core chats; hidden ones, chats when asked and
//     filtered groups are left out; every order the person can ask for;
//   • positions mean something and stay put: a new conversation joins the
//     end of its frame and moves nothing already there; a pin is relative to
//     its frame and only while it is in it; a moved frame carries its own;
//     nothing lands on anything put by hand;
//   • ideas shared by conversations are found by their meaningful words and
//     named in the conversations' own words; three or more is a theme;
//   • arrows go to the nearest conversation that way; search reads names,
//     ideas and where it stands; the timeline puts each where it was last
//     worked in;
//   • an arrangement from anywhere is bounded and never breaks the map, and
//     every change to it is exact.

import { build } from 'esbuild';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, '.tmp', 'logos5-home');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const entry = join(OUT, 'entry.ts');
writeFileSync(entry, [`export * from ${JSON.stringify(join(root, 'lib/logos5/universe.ts'))};`, `export * from ${JSON.stringify(join(root, 'lib/logos5/arrange.ts'))};`].join('\n'));
await build({ entryPoints: { home: entry }, bundle: true, format: 'esm', platform: 'node', outdir: OUT, outExtension: { '.js': '.mjs' }, tsconfig: join(root, 'tsconfig.json'), logLevel: 'error', alias: { '@': root } });
const H = await import(pathToFileURL(join(OUT, 'home.mjs')).href);

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 400))));
const J = JSON.stringify;

const NOW = new Date(2026, 9, 21, 15, 0).getTime(); // a Wednesday afternoon, local time
const DAY = 86_400_000;
const msg = (role, content, daysAgo, extra = {}) => ({ role, content, at: NOW - daysAgo * DAY, ...extra });
const conv = (id, title, o = {}) => ({
  id,
  title,
  updatedAt: NOW - (o.last ?? 1) * DAY,
  projectId: o.project ?? null,
  messages: o.messages ?? [msg('user', title, o.first ?? 5), msg('assistant', `It comes down to one thing. ${o.ask ?? ''}`.trim(), o.last ?? 1)],
  map: o.map ?? { nodes: (o.ideas ?? []).map((label, i) => ({ id: `${id}-${i}`, label })), edges: (o.ideas ?? []).slice(1).map((_, i) => ({ from: `${id}-0`, to: `${id}-${i + 1}` })) },
  ...(o.kind ? { kind: o.kind } : {}),
});
const study = { kind: 'study', at: 0, states: [{ topics: [{ id: 't1', title: 'Accrual basis' }, { id: 't2', title: 'Adjusting entries', after: ['t1'] }] }] };

console.log('\n=== a conversation, as a tile ===');
{
  const tiles = H.tilesOf([
    conv('a', 'Two job offers', { last: 1, ideas: ['Two job offers', 'Better team', 'Higher salary', 'Monthly runway'], ask: 'Which would you leave for?', map: { context: 'deciding', nodes: [{ id: 'h', label: 'Two job offers' }, { id: 'b', label: 'Better team' }, { id: 'c', label: 'Higher salary' }, { id: 'd', label: 'Monthly runway' }], edges: [{ from: 'h', to: 'b' }, { from: 'h', to: 'c' }, { from: 'h', to: 'd' }, { from: 'b', to: 'd' }, { from: 'x', to: 'h' }] } }),
    conv('s', 'Exam 2', { last: 3, map: { context: 'learning', nodes: [{ id: 'n', label: 'Exam stress' }], edges: [], objects: { objs: [study, { kind: 'chart', at: 0, states: [{}] }] } } }),
    conv('e', 'New line of thinking', { messages: [], map: { nodes: [], edges: [] } }),
    conv('y', 'A synthesised one', { last: 1.2, messages: [msg('user', 'A synthesised one', 3), msg('assistant', 'A reply.', 2), msg('assistant', '', 1, { synthesis: { title: 'Where it stands', lede: 'The team matters more than the money. That is the decision.' } })] }),
    conv('q', 'Just asked', { last: 0.5, messages: [msg('user', '**What** should I [A1.2] do about rent?', 0.5)], map: { nodes: [], edges: [] } }),
    { id: 'k', title: 'Salary negotiation tips', updatedAt: NOW - 2 * DAY, kind: 'core' },
  ]);
  const T = new Map(tiles.map((t) => [t.id, t]));
  ok('a line of thinking with nothing in it is not on the map; a Core chat is', !T.has('e') && T.get('k')?.kind === 'core' && T.get('k').look === 'chat');
  ok('newest first, at most a hundred and fifty', J(tiles.map((t) => t.id)) === J(['q', 'a', 'y', 'k', 's']) && H.tilesOf(Array.from({ length: 170 }, (_, i) => conv(`c${i}`, `C ${i}`, { last: i }))).length === 150, J(tiles.map((t) => t.id)));
  ok('its kind: a study is a study; otherwise what the map says it is', T.get('s').look === 'study' && T.get('a').look === 'deciding' && T.get('y').look === 'thinking' && T.get('a').lookSaid === 'Deciding');
  ok('what was made in it is counted apart from its kind', T.get('s').made === 1 && T.get('a').made === 0);
  ok('its graph: a study’s topics, then its map’s ideas; an edge to a card not there is dropped', T.get('s').ideas[0].from === 'topic' && T.get('s').edges.some((e) => e.from === 'topic:t1') && T.get('a').edges.length === 4);
  ok('the most connected idea sits at the middle of its graph', (() => { const hub = T.get('a').ideas.find((n) => n.id === 'h'); return hub.x === 0 && hub.y === 0; })());
  ok('its key ideas are the most connected, never its own name again', J(T.get('a').key) === J(['Better team', 'Monthly runway', 'Higher salary']), J(T.get('a').key));
  ok('where it stands: the first thing the latest reply says that is not a question', T.get('a').stands === 'It comes down to one thing.');
  ok('a synthesis, when there is one, says where it stands', T.get('y').stands === 'The team matters more than the money.');
  ok('with no reply yet, what was asked — as read, quoted', T.get('q').stands === '“What should I do about rent?”', T.get('q').stands);
  ok('a question is open only when Socria asked it last', T.get('a').open === 'Which would you leave for?' && T.get('q').open === null && T.get('y').open === null);
  ok('when it was begun: its first message', T.get('a').started === NOW - 5 * DAY);
  ok('a Core chat holds no graph and says nothing it does not know', T.get('k').ideas.length === 0 && T.get('k').stands === '' && T.get('k').open === null);
  ok('the conversation to pick up: the line of thinking last worked in', H.resumeOf(tiles)?.id === 'q');
}

console.log('\n=== groups: Projects, then the rest ===');
const projects = [
  { id: 'P2', name: 'Thesis', color: 'slate', createdAt: 20 },
  { id: 'P1', name: 'ACCT 2301', color: 'clay', createdAt: 10 },
  { id: 'P3', name: 'Empty', createdAt: 30 },
  { id: 'P4', name: 'Old', createdAt: 5, archived: true },
  { id: 'P5', name: 'Archived but used', createdAt: 6, archived: true },
];
const many = [
  conv('a1', 'Accruals', { project: 'P1', first: 30, last: 2 }),
  conv('a2', 'Exam 2', { project: 'P1', first: 10, last: 0.1 }),
  conv('a3', 'Practice', { project: 'P1', first: 20, last: 5 }),
  conv('t1', 'Outline', { project: 'P2', first: 40, last: 3 }),
  conv('l1', 'Rent or buy', { first: 9, last: 4 }),
  conv('l2', 'Weekend trip', { first: 50, last: 40 }),
  conv('l3', 'Gone missing', { project: 'P-unknown', first: 3, last: 3 }),
  conv('x1', 'Kept in an archived Project', { project: 'P5', first: 60, last: 60 }),
  { id: 'k1', title: 'Tax questions', updatedAt: NOW - 6 * DAY, kind: 'core' },
  { id: 'k2', title: 'Salary research', updatedAt: NOW - 1 * DAY, kind: 'core', projectId: 'P2' },
];
const tiles = H.tilesOf(many);
const A0 = H.emptyArrangement();
{
  const g = H.groupsOf(tiles, projects, A0);
  ok('every Project in the order it was made, an empty one too; an archived one only while something is in it', J(g.map((x) => x.key)) === J(['p:P5', 'p:P1', 'p:P2', 'p:P3', 'loose', 'chats']), J(g.map((x) => x.key)));
  ok('the rest: lines of thinking in no Project, then Core chats in none', g.find((x) => x.key === 'loose').name === 'In no Project' && J(g.find((x) => x.key === 'loose').tiles.map((t) => t.id).sort()) === J(['l1', 'l2', 'l3']) && J(g.find((x) => x.key === 'chats').tiles.map((t) => t.id)) === J(['k1']));
  ok('a Core chat filed in a Project lives in its frame', g.find((x) => x.key === 'p:P2').tiles.some((t) => t.id === 'k2'));
  ok('with no Projects, the rest are simply lines of thinking', H.groupsOf(tiles, undefined, A0).find((x) => x.key === 'loose').name === 'Lines of thinking');
  ok('in a frame, the order they were begun: nothing moves as they are worked in', J(g.find((x) => x.key === 'p:P1').tiles.map((t) => t.id)) === J(['a1', 'a3', 'a2']));
  const by = (sort) => H.groupsOf(tiles, projects, { ...A0, sort }).find((x) => x.key === 'p:P1').tiles.map((t) => t.id).join();
  ok('or by last active, name or size', by('recent') === 'a2,a1,a3' && by('name') === 'a1,a2,a3' && by('size') === 'a1,a3,a2');
  const own = H.groupsOf([...tiles, ...H.tilesOf([conv('a9', 'Begun since', { project: 'P1', first: 0.5, last: 0.5 })])], projects, { ...A0, sort: 'manual', order: { 'p:P1': ['a2', 'a1', 'a3'] } }).find((x) => x.key === 'p:P1');
  ok('or the person’s own order — anything begun since joins at the end', J(own.tiles.map((t) => t.id)) === J(['a2', 'a1', 'a3', 'a9']));
  ok('hidden ones are left out', !H.groupsOf(tiles, projects, { ...A0, hidden: ['a2'] }).flatMap((x) => x.tiles).some((t) => t.id === 'a2'));
  const noChats = H.groupsOf(tiles, projects, { ...A0, display: { ...A0.display, chats: false } });
  ok('Core chats, when asked, are left out — in a Project too', !noChats.some((x) => x.key === 'chats') && !noChats.flatMap((x) => x.tiles).some((t) => t.kind === 'core'));
  ok('only the groups chosen are shown', J(H.groupsOf(tiles, projects, { ...A0, projects: ['p:P1', 'loose'] }).map((x) => x.key)) === J(['p:P1', 'loose']));
  ok('the groups in the person’s order; the rest after, in their own', J(H.groupsOf(tiles, projects, { ...A0, groupOrder: ['loose', 'p:P2'] }).map((x) => x.key)) === J(['loose', 'p:P2', 'p:P5', 'p:P1', 'p:P3', 'chats']));
}

console.log('\n=== the map: frames and tiles, placed ===');
{
  const g = H.groupsOf(tiles, projects, A0);
  const L = H.mapLayout(g, A0);
  const F = new Map(L.frames.map((f) => [f.key, f]));
  const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  ok('every frame and every tile has its place, and no two overlap', L.frames.every((a, i) => L.frames.every((b, j) => j <= i || !overlap(a, b))) && L.tiles.every((a, i) => L.tiles.every((b, j) => j <= i || !overlap(a, b))));
  ok('a frame holds what is in it', L.tiles.every((t) => { const f = F.get(t.g); return t.x >= f.x && t.y >= f.y && t.x + t.w <= f.x + f.w && t.y + t.h <= f.y + f.h; }));
  ok('a frame is as wide as suits what is in it: one, two, or three across', H.colsFor(1) === 1 && H.colsFor(3) === 2 && H.colsFor(9) === 3 && H.colsFor(9, 5) === 5 && H.colsFor(9, undefined, true) === 2);
  ok('an empty Project is a frame to drop into', F.get('p:P3').empty === true);
  ok('the same conversations and arrangement draw the same map', J(H.mapLayout(g, A0)) === J(L));
  // a new conversation begun in one Project: everything already placed in the others stays put
  const more = H.tilesOf([...many, conv('t2', 'Chapter two', { project: 'P2', first: 0.2, last: 0.2 })]);
  const L2 = H.mapLayout(H.groupsOf(more, projects, A0), A0);
  const moved = L.tiles.filter((t) => { const u = L2.byId.get(t.id); return u.x !== t.x || u.y !== t.y; }).map((t) => t.id);
  ok('a new conversation joins the end of its frame; nothing already in that frame moves', ['t1', 'k2'].every((id) => !moved.includes(id)) && L2.byId.get('t2').y >= L2.byId.get('t1').y, J(moved));
  // pins
  const f1 = F.get('p:P1');
  const pinned = H.pinTile(A0, 'a2', 'p:P1', 600, 300);
  const L3 = H.mapLayout(g, pinned);
  ok('a pin is where the person put it, relative to its frame', L3.byId.get('a2').x === f1.origin.x + 600 && L3.byId.get('a2').y === f1.origin.y + 300 && L3.byId.get('a2').pinned);
  ok('the frame grows to hold it', (() => { const f = L3.frames.find((x) => x.key === 'p:P1'); return f.x + f.w >= f1.origin.x + 600 + H.TILE_W; })());
  const stale = H.pinTile(A0, 'a2', 'p:P2', 600, 300);
  ok('a pin holds only while it is in that frame', !H.mapLayout(g, stale).byId.get('a2').pinned);
  const onSlot = H.pinTile(A0, 'a3', 'p:P1', H.PAD, H.HEAD);
  const L4 = H.mapLayout(g, onSlot);
  ok('nothing lands on anything put by hand: the rest take the next free places', L4.tiles.filter((t) => t.g === 'p:P1').every((a, i, all) => all.every((b, j) => j <= i || !overlap(a, b))));
  const framed = H.moveFrame(A0, 'p:P1', 400, 120);
  const L5 = H.mapLayout(g, framed);
  ok('a frame moved by hand carries everything in it', L5.tiles.filter((t) => t.g === 'p:P1').every((t) => { const b = L.byId.get(t.id); return t.x === b.x + 400 && t.y === b.y + 120; }));
  const folded = H.mapLayout(g, H.setFrame(A0, 'p:P1', { collapsed: true }));
  ok('a folded frame holds its conversations out of sight', folded.tiles.filter((t) => t.g === 'p:P1').every((t) => t.folded) && folded.frames.find((f) => f.key === 'p:P1').h < f1.h);
  ok('a frame given a width holds that many across', H.mapLayout(g, H.setFrame(A0, 'p:P1', { cols: 1 })).frames.find((f) => f.key === 'p:P1').cols === 1);
  const s = H.snapToSlot(H.PAD + 250, H.HEAD + 150, { w: H.TILE_W, h: H.TILE_H });
  ok('a place on the grid is a place a conversation can be', J(s) === J(H.slotAt(3, 2, { w: H.TILE_W, h: H.TILE_H })), J(s));
  ok('the frame a point is in', H.frameAt(L.frames, f1.x + 10, f1.y + 10)?.key === 'p:P1' && H.frameAt(L.frames, -9999, -9999) === null);
  ok('on a phone, two across at most and one frame under another', (() => { const N = H.mapLayout(g, A0, { narrow: true }); return N.frames.every((f) => f.cols <= 2) && N.frames.every((f, i) => i === 0 || f.y > N.frames[i - 1].y); })());
}

console.log('\n=== what conversations share ===');
{
  const set = H.tilesOf([
    conv('a', 'Two job offers', { ideas: ['Two job offers', 'Monthly runway', 'Better team culture'] }),
    conv('b', 'Rent or buy', { ideas: ['Rent or buy', 'Monthly runway after a down payment'] }),
    conv('c', 'Startup idea', { ideas: ['Startup idea', 'The monthly runway'] }),
    conv('d', 'Team culture', { ideas: ['Team culture'] }),
    conv('e', 'Exam stress', { ideas: ['Exam stress', 'Stress'] }),
    { id: 'k', title: 'Monthly runway spreadsheet', updatedAt: NOW, kind: 'core' },
    { id: 'k2', title: 'Monthly runway questions', updatedAt: NOW, kind: 'core' },
  ]);
  const ideas = H.sharedIdeas(set);
  const runway = ideas.find((i) => i.key === 'monthly runway');
  ok('an idea in three or more conversations is a theme', runway?.theme === true && runway.members.length >= 3, J(ideas));
  ok('it is named in the conversations’ own words, the shortest', runway?.says === 'Monthly runway', runway?.says);
  ok('two ideas sharing their meaningful words are one shared idea', ideas.some((i) => i.members.includes('a') && i.members.includes('d')), J(ideas));
  ok('a Core chat is matched by its name, but two chats are never joined by their names alone', runway.members.includes('k') && !ideas.some((i) => i.members.length === 2 && i.members.every((m) => m.startsWith('k'))));
  ok('one short common word is not a shared idea', !ideas.some((i) => i.members.includes('e')));
  ok('most shared first', ideas[0].members.length >= ideas[ideas.length - 1].members.length);
  ok('the words are matched as words: plurals and case fold', H.shared('Better team culture', 'Team culture') === 'team culture' && H.shared('Monthly runways', 'monthly runway') === 'monthly runway');
  const g = H.groupsOf(set, undefined, H.emptyArrangement());
  const L = H.mapLayout(g, H.emptyArrangement());
  const placed = H.placeIdeas(ideas, L);
  const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  ok('each is written where it sits on no conversation, no frame’s name, and no other', placed.length === ideas.length && placed.every((p, i) => !L.tiles.some((t) => overlap(t, p)) && !L.frames.some((f) => overlap({ x: f.x, y: f.y, w: f.w, h: H.HEAD - 8 }, p)) && placed.every((q, j) => j <= i || !overlap(p, q))));
}

console.log('\n=== near and far, keys, search, time ===');
{
  ok('far off a name; nearer its kind and ideas; up close where it stands', H.detailAt(0.4) === 'far' && H.detailAt(0.8) === 'mid' && H.detailAt(1.4) === 'near');
  ok('fresh today, faded by two months', H.freshness(NOW, NOW) === 1 && H.freshness(NOW - 30 * DAY, NOW) === 0.5 && H.freshness(NOW - 90 * DAY, NOW) === 0);
  ok('size means what the person asked, within bounds', H.scaleOf({ count: 0, at: NOW }, 'same', NOW) === 1 && H.scaleOf({ count: 20, at: NOW }, 'ideas', NOW) === 1 && H.scaleOf({ count: 0, at: NOW }, 'ideas', NOW) === 0.84);
  const at = (id, x, y) => ({ id, x, y, w: 100, h: 60 });
  const grid = [at('a', 0, 0), at('b', 200, 0), at('c', 400, 10), at('d', 0, 200), at('e', 210, 190)];
  ok('arrows go to the nearest conversation that way, straight ahead before the side', H.nearestWay('right', grid[0], grid) === 'b' && H.nearestWay('down', grid[0], grid) === 'd' && H.nearestWay('right', grid[1], grid) === 'c' && H.nearestWay('left', grid[0], grid) === null && H.nearestWay('down', grid[1], grid) === 'e');
  const t = H.tilesOf([conv('a', 'Two job offers', { ideas: ['Two job offers', 'Better team'] })])[0];
  ok('search reads the name, then an idea, then where it stands', H.tileMatch(t, 'JOB')?.why === 'title' && H.tileMatch(t, 'team')?.why === 'idea' && H.tileMatch(t, 'team')?.said === 'Better team' && H.tileMatch(t, 'one thing')?.why === 'said' && H.tileMatch(t, 'kitchen') === null && H.tileMatch(t, '  ')?.why === 'title');
  ok('a moment is today, yesterday, this week, last week, this month, or before', H.bucketOf(NOW - 3600_000, NOW) === 'today' && H.bucketOf(NOW - DAY, NOW) === 'yesterday' && H.bucketOf(NOW - 2 * DAY, NOW) === 'week' && H.bucketOf(NOW - 6 * DAY, NOW) === 'lastweek' && H.bucketOf(NOW - 14 * DAY, NOW) === 'month' && H.bucketOf(NOW - 40 * DAY, NOW) === 'older');
  const tl = H.timelineOf(H.groupsOf(tiles, projects, A0), NOW);
  ok('the timeline: a lane for each group with something in it, only the times used, ending at today', tl.lanes.every((l) => l.key !== 'p:P3') && tl.buckets[tl.buckets.length - 1].key === 'today' && tl.buckets.every((b) => tl.lanes.some((l) => l.cells[b.key].length)));
  ok('each conversation once, in the time it was last worked in', tl.lanes.flatMap((l) => Object.values(l.cells).flat()).length === tiles.length && tl.lanes.find((l) => l.key === 'p:P1').cells.today.includes('a2'));
}

console.log('\n=== an arrangement, kept ===');
{
  const a = H.parseArrangement({
    at: 7,
    mode: 'columns',
    sort: 'nonsense',
    display: { chats: false, labels: 'titles', color: 'purple', snap: 'yes' },
    pins: { ok: { x: 10.4, y: -3, g: 'p:P1' }, far: { x: 1e12, y: 0, g: 'loose' }, bad: { x: 'x', y: 1, g: 'loose' }, 'bad id!': { x: 1, y: 1, g: 'loose' } },
    frames: { 'p:P1': { dx: 5, dy: 6, cols: 99, collapsed: true }, loose: { dx: 'no' } },
    order: { 'p:P1': ['b', 'a', 'a', 7] },
    starred: ['a', 'a', '<script>'],
    hidden: Array.from({ length: 700 }, (_, i) => `h${i}`),
    links: [{ id: 'l1', a: 'a', b: 'b', label: '  same   deadline  ' }, { id: 'l2', a: 'a', b: 'a' }],
    notes: [{ id: 'n1', x: 1, y: 2, text: 'Line one\n\n\n\nline two' }, { id: 'n2', x: 1, y: 2, text: '   ' }],
    views: [{ id: 'v1', name: 'Exam season', mode: 'timeline', projects: ['p:P1'], query: 'exam' }, { id: 'v2', name: '' }],
    projects: 'all',
    seen: { hint: true },
    extra: 'ignored',
  });
  ok('what is understood is kept; the rest is not there', a.at === 7 && a.mode === 'columns' && a.sort === 'started' && !('extra' in a));
  ok('the display: what was set, the rest as it starts', a.display.chats === false && a.display.labels === 'titles' && a.display.color === 'project' && a.display.snap === true);
  ok('pins: numbers bounded and whole, damaged ones dropped', J(a.pins.ok) === J({ x: 10, y: -3, g: 'p:P1' }) && a.pins.far.x === 60000 && !a.pins.bad && !a.pins['bad id!']);
  ok('frames: a width of one to six, folded only when it says so', J(a.frames['p:P1']) === J({ dx: 5, dy: 6, cols: 6, collapsed: true }) && J(a.frames.loose) === J({ dx: 0, dy: 0 }));
  ok('lists: names only, once each, bounded', J(a.order['p:P1']) === J(['b', 'a']) && J(a.starred) === J(['a']) && a.hidden.length === 600);
  ok('links: never to itself; words on one line', a.links.length === 1 && a.links[0].label === 'same deadline');
  ok('notes: a few lines, no empty ones; a note with no words is not kept', a.notes.length === 1 && a.notes[0].text === 'Line one\nline two');
  ok('views: named ones only, their settings read the same way', a.views.length === 1 && a.views[0].mode === 'timeline' && J(a.views[0].projects) === J(['p:P1']) && a.views[0].query === 'exam');
  ok('anything at all reads as an arrangement', J(H.parseArrangement(null)) === J(H.emptyArrangement()) && J(H.parseArrangement('{"x":1}')) === J(H.emptyArrangement()) && J(H.parseArrangement([1, 2])) === J(H.emptyArrangement()) && a.projects === null && a.seen.hint === true);
  ok('of two copies, the newer wins', H.newerOf({ at: 5 }, { at: 9 }).at === 9 && H.newerOf({ at: 9 }, { at: 5 }).at === 9 && H.newerOf(null, { at: 1 }).at === 1);
  ok('a parsed arrangement parses to itself', J(H.parseArrangement(JSON.parse(J(a)))) === J(a));
}

console.log('\n=== changes ===');
{
  const E = H.emptyArrangement();
  ok('changes are new arrangements; the old one is untouched', H.pinTile(E, 'a', 'loose', 1, 2) !== E && J(E.pins) === '{}');
  ok('a time is the caller’s', H.stamp(E, 123).at === 123);
  ok('put back in order', !('a' in H.unpinTiles(H.pinTile(E, 'a', 'loose', 1, 2), ['a']).pins) && H.unpinTiles(E, ['x']) === E);
  ok('a frame moved twice is moved by both', J(H.moveFrame(H.moveFrame(E, 'loose', 10, 5), 'loose', -4, 5).frames.loose) === J({ dx: 6, dy: 10 }));
  ok('a frame’s width is one to six, and can be let go of', H.setFrame(E, 'g', { cols: 9 }).frames.g.cols === 6 && !('cols' in H.setFrame(H.setFrame(E, 'g', { cols: 3 }), 'g', { cols: null }).frames.g));
  ok('folded, and unfolded', H.setFrame(E, 'g', { collapsed: true }).frames.g.collapsed === true && !('collapsed' in H.setFrame(H.setFrame(E, 'g', { collapsed: true }), 'g', { collapsed: false }).frames.g));
  const o = H.setOrder(E, { a: ['2', '1'] }, { a: ['1', '2'], b: ['x', 'y'] });
  ok('an order set by hand: that group’s, and what the others were showing, so nothing else jumps', o.sort === 'manual' && J(o.order.a) === J(['2', '1']) && J(o.order.b) === J(['x', 'y']));
  ok('placed in an order: taken out and put where asked', J(H.placeInOrder(['a', 'b', 'c'], 'a', 2)) === J(['b', 'c', 'a']) && J(H.placeInOrder(['a', 'b'], 'z', 0)) === J(['z', 'a', 'b']) && J(H.placeInOrder(['a'], 'b', 99)) === J(['a', 'b']));
  ok('a group moved among the groups', J(H.moveGroup(E, ['p', 'q', 'r'], 'r', 0).groupOrder) === J(['r', 'p', 'q']));
  ok('starred and hidden: added once, taken out', J(H.setIn(H.setIn(E, 'starred', ['a', 'b'], true), 'starred', ['a', 'c'], true).starred) === J(['a', 'b', 'c']) && J(H.setIn(H.setIn(E, 'hidden', ['a', 'b'], true), 'hidden', ['a'], false).hidden) === J(['b']));
  const L1 = H.addLink(E, { id: 'l1', a: 'x', b: 'y', label: '' });
  ok('a link drawn again between the same two is named again, not drawn twice', H.addLink(L1, { id: 'l2', a: 'y', b: 'x', label: 'both deadlines' }).links.length === 1 && H.addLink(L1, { id: 'l2', a: 'y', b: 'x', label: 'both deadlines' }).links[0].label === 'both deadlines' && H.addLink(E, { id: 'l', a: 'x', b: 'x', label: '' }) === E);
  ok('a link taken away', H.removeLink(L1, 'l1').links.length === 0);
  const N = H.addNote(E, { id: 'n', x: 1.6, y: 2.2, text: ' hello ' });
  ok('a note written, moved, changed — and gone when its words are', N.notes[0].text === 'hello' && N.notes[0].x === 2 && H.moveNote(N, 'n', 50, 60).notes[0].x === 50 && H.editNote(N, 'n', 'bye').notes[0].text === 'bye' && H.editNote(N, 'n', '   ').notes.length === 0);
  const V = H.saveView({ ...E, mode: 'timeline', projects: ['p:P1'] }, 'v1', 'Exam season', 'exam');
  ok('a view kept under a name, with how it looks and what it searched', V.views[0].mode === 'timeline' && J(V.views[0].projects) === J(['p:P1']) && V.views[0].query === 'exam');
  ok('the same name again replaces it', H.saveView(V, 'v2', 'exam SEASON', '').views.length === 1);
  const back = H.applyView({ ...V, mode: 'map', projects: null }, 'v1');
  ok('a view put back', back.mode === 'timeline' && J(back.projects) === J(['p:P1']) && H.applyView(V, 'nope') === V);
  ok('and forgotten', H.removeView(V, 'v1').views.length === 0);
  const pinned = H.pinTile(H.pinTile(E, 'a', 'g1', 1, 1), 'b', 'g2', 1, 1);
  ok('tidy: one frame, or all', J(Object.keys(H.tidy(pinned, 'g1').pins)) === J(['b']) && J(H.tidy(pinned).pins) === '{}');
  const lived = { ...H.setIn(pinned, 'starred', ['a'], true), frames: { g1: { dx: 1, dy: 1 } }, order: { g1: ['a'] }, sort: 'manual', groupOrder: ['g1'], notes: N.notes };
  const reset = H.resetLayout(lived);
  ok('reset puts every place and order back — stars, notes, links and views stay', J(reset.pins) === '{}' && J(reset.frames) === '{}' && J(reset.order) === '{}' && reset.groupOrder.length === 0 && reset.sort === 'started' && J(reset.starred) === J(['a']) && reset.notes.length === 1);
  ok('the hint, said once', H.markSeen(E, 'hint').seen.hint === true && H.markSeen(H.markSeen(E, 'hint'), 'hint').seen.hint === true);
  ok('display and the rest are read the same way when set', H.setDisplay(E, { labels: 'nope' }).display.labels === 'ideas' && H.setMode(E, 'timeline').mode === 'timeline' && H.setMode(E, 'nope').mode === 'map' && H.setSort(E, 'name').sort === 'name' && H.setProjects(E, null).projects === null);
}

console.log('\n=== this browser’s copy ===');
{
  const store = new Map();
  const S = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  ok('nothing kept yet reads as a new arrangement', J(H.readHome(S)) === J(H.emptyArrangement()));
  const a = H.stamp(H.setIn(H.emptyArrangement(), 'starred', ['x'], true), 5);
  H.writeHome(S, a);
  ok('written, and read back the same', J(H.readHome(S)) === J(a) && store.has(H.HOME_KEY));
  store.set(H.HOME_KEY, '{not json');
  ok('a damaged copy reads as a new arrangement', J(H.readHome(S)) === J(H.emptyArrangement()));
  const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); } };
  ok('a store that refuses does not break anything', J(H.readHome(broken)) === J(H.emptyArrangement()) && (H.writeHome(broken, a), true) && J(H.readHome(null)) === J(H.emptyArrangement()));
}

console.log(`\nlogos5-home: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
