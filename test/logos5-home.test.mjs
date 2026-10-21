// LOGOS 5 — THE UNIVERSAL MAP: EVERY CONVERSATION, READ; HOW THE PERSON ARRANGED IT.
//
// lib/logos5/universe.ts reads each conversation for the map; lib/logos5/
// arrange.ts keeps how the person arranged it (the layout itself — hubs and
// dots, by today, week and subject — is held in logos5-spatial.test.mjs).
// Held down here:
//   • a conversation says only what it says — where it stands is its synthesis
//     or reply, a question is open only when Socria asked it last, nothing is
//     made up for a conversation with no map; what it is about is read from
//     its study's course, the field its map named, the picture it drew, its
//     words;
//   • ideas shared by conversations are found by their meaningful words and
//     named in the conversations' own words; three or more is a theme;
//   • arrows go to the nearest conversation that way; search reads names,
//     ideas and where it stands;
//   • an arrangement from anywhere is bounded and never breaks the map — one
//     kept before the lenses reads as By subject or By week — and every change
//     to it is exact.

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
  ok('what it is about, as it says: its name, its first question, its ideas, where it stands', T.get('a').about.title === 'Two job offers' && T.get('a').about.asked === 'Two job offers' && T.get('a').about.ideas.includes('Monthly runway') && T.get('a').about.stands === 'It comes down to one thing.');
  const said = H.tilesOf([conv('z', 'Why prices rise', { map: { context: 'learning', nodes: [], edges: [], ask: { topic: 'prices', domain: 'Microeconomics' }, viz: { kind: 'supply-demand' }, objects: { objs: [{ kind: 'study', at: 0, states: [{ course: 'ECON 1301 · Midterm', topics: [] }] }] } } })])[0];
  ok('  and what the map read: the field it named, the picture it drew, the course its study was sorted under', said.about.domain === 'Microeconomics' && said.about.viz === 'supply-demand' && said.about.topic === 'prices' && said.about.course === 'ECON 1301 · Midterm', JSON.stringify(said.about));
  ok('  a Core chat is known by its name alone', T.get('k').about.course === '' && T.get('k').about.asked === '' && T.get('k').about.title === 'Salary negotiation tips');
  // the same conversation twice: held here with its words, and handed down by Core by its name
  const once = H.tilesOf([
    { id: 'm', title: 'Salary negotiation tips', updatedAt: NOW - 2 * DAY, kind: 'core' },
    conv('m', 'Salary negotiation tips', { last: 2, ideas: ['Salary negotiation tips', 'Anchor high'] }),
    { id: 'n', title: 'Only on Core', updatedAt: NOW - 3 * DAY, kind: 'core' },
  ]);
  ok('one tile per conversation: a Core chat held here is that conversation, its words and its map', once.length === 2 && once[0].id === 'm' && once[0].kind === 'logos' && once[0].count === 2 && once[0].stands === 'It comes down to one thing.' && once[1].kind === 'core', J(once.map((t) => [t.id, t.kind, t.count])));
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
}

console.log('\n=== near and far, keys, search ===');
{
  ok('far off a name; nearer its kind; up close where it stands', H.detailAt(0.4) === 'far' && H.detailAt(0.8) === 'mid' && H.detailAt(1.4) === 'near');
  ok('fresh today, faded by two months', H.freshness(NOW, NOW) === 1 && H.freshness(NOW - 30 * DAY, NOW) === 0.5 && H.freshness(NOW - 90 * DAY, NOW) === 0);
  const at = (id, x, y) => ({ id, x, y, w: 100, h: 60 });
  const grid = [at('a', 0, 0), at('b', 200, 0), at('c', 400, 10), at('d', 0, 200), at('e', 210, 190)];
  ok('arrows go to the nearest conversation that way, straight ahead before the side', H.nearestWay('right', grid[0], grid) === 'b' && H.nearestWay('down', grid[0], grid) === 'd' && H.nearestWay('right', grid[1], grid) === 'c' && H.nearestWay('left', grid[0], grid) === null && H.nearestWay('down', grid[1], grid) === 'e');
  const t = H.tilesOf([conv('a', 'Two job offers', { ideas: ['Two job offers', 'Better team'] })])[0];
  ok('search reads the name, then an idea, then where it stands', H.tileMatch(t, 'JOB')?.why === 'title' && H.tileMatch(t, 'team')?.why === 'idea' && H.tileMatch(t, 'team')?.said === 'Better team' && H.tileMatch(t, 'one thing')?.why === 'said' && H.tileMatch(t, 'kitchen') === null && H.tileMatch(t, '  ')?.why === 'title');
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
  ok('what is understood is kept; the rest is not there — and Columns, kept before the lenses, is By subject', a.at === 7 && a.mode === 'subject' && a.sort === 'started' && !('extra' in a));
  ok('the display: what was set, the rest as it starts', a.display.chats === false && a.display.labels === 'titles' && a.display.color === 'project' && a.display.snap === true);
  ok('pins: numbers bounded and whole, damaged ones dropped', J(a.pins.ok) === J({ x: 10, y: -3, g: 'p:P1' }) && a.pins.far.x === 60000 && !a.pins.bad && !a.pins['bad id!']);
  ok('frames: a width of one to six, folded only when it says so', J(a.frames['p:P1']) === J({ dx: 5, dy: 6, cols: 6, collapsed: true }) && J(a.frames.loose) === J({ dx: 0, dy: 0 }));
  ok('lists: names only, once each, bounded', J(a.order['p:P1']) === J(['b', 'a']) && J(a.starred) === J(['a']) && a.hidden.length === 600);
  ok('links: never to itself; words on one line', a.links.length === 1 && a.links[0].label === 'same deadline');
  ok('notes: a few lines, no empty ones; a note with no words is not kept', a.notes.length === 1 && a.notes[0].text === 'Line one\nline two');
  ok('views: named ones only, their settings read the same way — a timeline view is By week', a.views.length === 1 && a.views[0].mode === 'week' && J(a.views[0].projects) === J(['p:P1']) && a.views[0].query === 'exam');
  ok('a new map opens on today’s learning; an old map of Projects reads as By subject', H.emptyArrangement().mode === 'today' && H.parseArrangement({ mode: 'map' }).mode === 'subject' && H.parseArrangement({ mode: 'week' }).mode === 'week' && H.parseArrangement({ mode: 'nope' }).mode === 'today');
  const subj = H.parseArrangement({ subjectOf: { a: 'f:economics', b: 'other', 'bad id!': 'f:x', c: '<script>' } });
  ok('subjects given by hand: names only', J(subj.subjectOf) === J({ a: 'f:economics', b: 'other' }));
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
  const V = H.saveView({ ...E, mode: 'week', projects: ['p:P1'] }, 'v1', 'Exam season', 'exam');
  ok('a view kept under a name, with how it looks and what it searched', V.views[0].mode === 'week' && J(V.views[0].projects) === J(['p:P1']) && V.views[0].query === 'exam');
  ok('the same name again replaces it', H.saveView(V, 'v2', 'exam SEASON', '').views.length === 1);
  const back = H.applyView({ ...V, mode: 'subject', projects: null }, 'v1');
  ok('a view put back', back.mode === 'week' && J(back.projects) === J(['p:P1']) && H.applyView(V, 'nope') === V);
  ok('and forgotten', H.removeView(V, 'v1').views.length === 0);
  const pinned = H.pinTile(H.pinTile(E, 'a', 'g1', 1, 1), 'b', 'g2', 1, 1);
  ok('tidy: one frame, or all', J(Object.keys(H.tidy(pinned, 'g1').pins)) === J(['b']) && J(H.tidy(pinned).pins) === '{}');
  const lived = { ...H.setIn(pinned, 'starred', ['a'], true), frames: { g1: { dx: 1, dy: 1 } }, order: { g1: ['a'] }, sort: 'manual', groupOrder: ['g1'], notes: N.notes };
  const reset = H.resetLayout(lived);
  ok('reset puts every place and order back — stars, notes, links and views stay', J(reset.pins) === '{}' && J(reset.frames) === '{}' && J(reset.order) === '{}' && reset.groupOrder.length === 0 && reset.sort === 'started' && J(reset.starred) === J(['a']) && reset.notes.length === 1);
  ok('the hint, said once', H.markSeen(E, 'hint').seen.hint === true && H.markSeen(H.markSeen(E, 'hint'), 'hint').seen.hint === true);
  ok('display and the rest are read the same way when set', H.setDisplay(E, { labels: 'nope' }).display.labels === 'ideas' && H.setMode(E, 'week').mode === 'week' && H.setMode(E, 'nope').mode === 'today' && H.setSort(E, 'name').sort === 'name' && H.setProjects(E, null).projects === null);
  const given = H.setSubject(E, ['a', 'b'], 'f:economics');
  ok('a subject given by hand, to one or several — and let go of', given.subjectOf.a === 'f:economics' && given.subjectOf.b === 'f:economics' && !('a' in H.setSubject(given, ['a'], null).subjectOf) && H.setSubject(given, ['a'], null).subjectOf.b === 'f:economics' && !('x' in H.setSubject(E, ['x'], 'bad key!').subjectOf));
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
