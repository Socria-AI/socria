// The rail: filing sessions into tabs, and letting people name them.
//
// Two complaints, one file. The first is that the rail was a single list and
// stayed one however long it got — twelve rows in, "which of these has the map
// I drew" is a question the ordering cannot answer, and squinting at
// thumbnails is not an answer. The second is that titles were auto-suggested
// and never settable: the store has carried `autoTitledAs` since Core 3
// precisely so a name a person chose is not overwritten, and there was no way
// to choose one.
//
// The interesting decisions here are the ones about when NOT to act:
//
//  - the tabs hide themselves rather than offering an empty Maps tab;
//  - an emptied rename box keeps the old name rather than inventing one;
//  - the split is by whether a session HAS a map, not by which surface made
//    it, so two rows that look identical are never filed apart.

import {
  SESSION_TABS,
  MAX_TITLE_LEN,
  cleanTitle,
  filterByTab,
  hasMap,
  matchesTab,
  shouldShowTabs,
  shouldShowSearch,
  tabCounts,
  SESSION_GROUPS,
  groupOf,
  groupRail,
  matchesQuery,
  searchRail,
} from './.tmp/session-rail.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

// A rail the way both surfaces build it: Logos sessions carry a node count,
// Core conversations are handed `nodes: 0`.
const map = (n) => ({ id: 'lg' + n, kind: 'logos', nodes: n });
const chat = (n) => ({ id: 'c' + n, kind: 'chat', nodes: 0 });

console.log('=== a session is a map if it has one node ===');
{
  ok('one node is a map', hasMap({ nodes: 1 }) === true);
  ok('many nodes is a map', hasMap({ nodes: 14 }) === true);
  ok('zero is not', hasMap({ nodes: 0 }) === false);
  // A Logos session that has been opened but not yet mapped, and a Core row
  // that never will be, both arrive without the field or with zero.
  ok('absent is not', hasMap({}) === false);
  ok('undefined is not', hasMap({ nodes: undefined }) === false);
}

console.log('\n=== filed by whether there is a map, not by surface ===');
{
  // The whole point: a Logos session that never grew a map belongs with the
  // chats, because that is what it is. Filing by `kind` would put it under
  // Maps and make the tab lie.
  const unmappedLogos = { id: 'lg9', kind: 'logos', nodes: 0 };
  ok('an unmapped Logos session is a chat', matchesTab(unmappedLogos, 'chats') === true);
  ok('...and is not a map', matchesTab(unmappedLogos, 'maps') === false);

  const mappedChat = { id: 'c9', kind: 'chat', nodes: 5 };
  ok('a mapped Core conversation is a map', matchesTab(mappedChat, 'maps') === true);
  ok('...and is not a chat', matchesTab(mappedChat, 'chats') === false);

  ok('All takes everything', [unmappedLogos, mappedChat].every((i) => matchesTab(i, 'all')));
}

console.log('\n=== the two tabs partition the list ===');
{
  const items = [map(3), chat(), map(1), chat(), chat(), map(9)];
  const maps = filterByTab(items, 'maps');
  const chats = filterByTab(items, 'chats');

  ok('maps has three', maps.length === 3, String(maps.length));
  ok('chats has three', chats.length === 3, String(chats.length));
  ok('together they are the whole list', maps.length + chats.length === items.length);
  ok('and nothing is in both', !maps.some((m) => chats.includes(m)));
  ok('All is the list itself', filterByTab(items, 'all').length === items.length);

  // Order is the rail's, by when each was last touched. Filtering must not
  // resort — the row somebody is reaching for should not move.
  ok('order survives filtering',
    filterByTab(items, 'all').map((i) => i.id).join() === items.map((i) => i.id).join());
  ok('and within a tab too', maps.map((i) => i.id).join() === 'lg3,lg1,lg9', maps.map((i) => i.id).join());

  const c = tabCounts(items);
  ok('the counts match the lists', c.all === 6 && c.maps === 3 && c.chats === 3, JSON.stringify(c));
  ok('an empty rail counts to zero',
    JSON.stringify(tabCounts([])) === JSON.stringify({ all: 0, maps: 0, chats: 0 }));
}

console.log('\n=== the switcher only appears when it divides something ===');
{
  // Short lists do not need dividing; a tab bar over three rows is furniture.
  ok('three rows: no tabs', shouldShowTabs([map(2), chat(), map(1)]) === false);

  // And a switcher whose every option but one leads to "nothing here" teaches
  // people not to press it — so both sides must be non-empty however long the
  // list is. This is the case that made the rule: somebody with a page of Core
  // conversations and no maps at all.
  ok('twelve chats and no maps: no tabs',
    shouldShowTabs(Array.from({ length: 12 }, chat)) === false);
  ok('twelve maps and no chats: no tabs',
    shouldShowTabs(Array.from({ length: 12 }, () => map(4))) === false);

  ok('six rows split both ways: tabs',
    shouldShowTabs([map(2), chat(), chat(), map(1), chat(), chat()]) === true);
  // One of each is enough on the thin side once the list is long — that lone
  // map is exactly the row a person cannot find by scrolling.
  ok('one map among many chats still divides',
    shouldShowTabs([map(3), chat(), chat(), chat(), chat(), chat(), chat()]) === true);
  ok('five rows is still too few', shouldShowTabs([map(2), chat(), chat(), chat(), chat()]) === false);
  ok('an empty rail has nothing to divide', shouldShowTabs([]) === false);

  // The three tabs are fixed and All comes first, because it is what the rail
  // was before this existed and what it returns to when a tab empties.
  ok('three tabs, All first', SESSION_TABS.length === 3 && SESSION_TABS[0].id === 'all');
  ok('every tab has a label', SESSION_TABS.every((t) => t.label.length > 0));
}

console.log('\n=== a typed name, cleaned but not corrected ===');
{
  ok('an ordinary name is kept', cleanTitle('Tangent lines') === 'Tangent lines');
  ok('surrounding space goes', cleanTitle('  Berlin vs Athens  ') === 'Berlin vs Athens');
  // A pasted title arrives with the newlines of wherever it came from, and a
  // row is one line high.
  ok('a pasted newline collapses', cleanTitle('Two job\noffers') === 'Two job offers');
  ok('a tab collapses', cleanTitle('a\t\tb') === 'a b');
  ok('a run of spaces collapses', cleanTitle('a     b') === 'a b');

  // Nothing else is touched: case, punctuation and emoji are the person's.
  for (const t of ['lowercase thing', 'ALL CAPS', '¿Qué?', '微積分', '🌱 seeds', 'a/b:c']) {
    ok(`"${t}" is left alone`, cleanTitle(t) === t, String(cleanTitle(t)));
  }
}

console.log('\n=== an emptied box means "never mind" ===');
{
  // Null, not "Untitled". Somebody who cleared the field changed their mind,
  // and inventing a name they then have to undo is worse than doing nothing.
  for (const junk of ['', '   ', '\n', '\t\t', null, undefined, 42, {}, [], true]) {
    ok(`${JSON.stringify(junk) ?? String(junk)} yields nothing`, cleanTitle(junk) === null);
  }
}

console.log('\n=== and a name stays a name ===');
{
  const long = 'x'.repeat(MAX_TITLE_LEN + 40);
  const got = cleanTitle(long);
  ok('a wall of text is cut', got.length === MAX_TITLE_LEN, String(got.length));
  ok('exactly at the limit is untouched',
    cleanTitle('y'.repeat(MAX_TITLE_LEN)).length === MAX_TITLE_LEN);
  // Cutting mid-space would leave a name with a trailing gap, which reads as a
  // rendering bug rather than as a limit.
  const sentence = ('word '.repeat(40)).trim();
  ok('no trailing space after the cut', !/\s$/.test(cleanTitle(sentence)));
  ok('and the server bound is not smaller', MAX_TITLE_LEN <= 200);
}

// ── the headings, and the search above them ─────────────────────────
//
// Recency ordering says which row is newest; it does not say whether the
// newest is from this morning or from March. These three headings answer that
// without making anybody read a date, and the two filters above them are the
// ones the list actually needs: type a word, or ask for the ones with maps.

{
  // A fixed "now" so the boundaries are assertions and not a lottery: noon on
  // a Wednesday, which puts the week boundary in the middle of the previous
  // week rather than on a Sunday, where an off-by-one would hide.
  const now = new Date('2026-03-11T12:00:00Z').getTime();
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  const DAY = 86400000;

  ok('this morning is Today', groupOf(startOfToday + 60_000, now) === 'Today');
  ok('a moment ago is Today', groupOf(now - 1000, now) === 'Today');

  // The calendar day, not the last 24 hours. 11pm last night is yesterday to
  // the person who was there, however few hours ago that was.
  ok('one minute before midnight is not Today',
     groupOf(startOfToday - 60_000, now) === 'This week');
  ok('five days back is still This week',
     groupOf(startOfToday - 5 * DAY, now) === 'This week');
  ok('six days back is the last day of This week',
     groupOf(startOfToday - 6 * DAY, now) === 'This week');
  ok('seven days back has fallen off the end',
     groupOf(startOfToday - 7 * DAY, now) === 'Earlier');
  ok('last year is Earlier', groupOf(startOfToday - 400 * DAY, now) === 'Earlier');

  // Clock skew between a device and the server is ordinary. Filing somebody's
  // newest session under Earlier because their laptop runs fast is worse than
  // calling a future timestamp today.
  ok('a future stamp files under Today', groupOf(now + 90_000, now) === 'Today');

  // A row with no usable timestamp still has to land somewhere, and the
  // bottom of the list is the honest place for it.
  ok('a missing stamp is Earlier', groupOf(NaN, now) === 'Earlier');
  ok('undefined is Earlier', groupOf(undefined, now) === 'Earlier');
}

{
  const now = new Date('2026-03-11T12:00:00Z').getTime();
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  const DAY = 86400000;
  const rows = [
    { id: 'a', title: 'The Berlin offer', nodes: 5, updatedAt: now - 1000 },
    { id: 'b', title: 'Whether to rewrite the essay', nodes: 0, updatedAt: now - 3000 },
    { id: 'c', title: 'Bounded rationality', nodes: 3, updatedAt: startOfToday - 2 * DAY },
    { id: 'd', title: 'Berlin, again', nodes: 0, updatedAt: startOfToday - 90 * DAY },
  ];

  const groups = groupRail(rows, now);
  ok('only the groups that have rows', groups.length === 3);
  ok('and they come in reading order',
     groups.map((g) => g.group).join('|') === 'Today|This week|Earlier',
     groups.map((g) => g.group).join('|'));
  ok('Today holds both of its rows', groups[0].items.length === 2);
  ok('in the order they arrived',
     groups[0].items.map((r) => r.id).join('') === 'ab');

  // An empty group is a heading with nothing under it — a promise the list
  // did not keep.
  const onlyOld = groupRail([rows[3]], now);
  ok('no empty headings', onlyOld.length === 1 && onlyOld[0].group === 'Earlier');
  ok('nothing at all groups to nothing', groupRail([], now).length === 0);

  // Every group in the constant is one groupOf can actually return, or a
  // heading would be unreachable.
  ok('the headings and the classifier agree',
     SESSION_GROUPS.every((g) =>
       [now, startOfToday - 2 * DAY, startOfToday - 90 * DAY]
         .some((t) => groupOf(t, now) === g)));
}

{
  const rows = [
    { id: 'a', title: 'The Berlin offer', nodes: 5 },
    { id: 'b', title: 'Whether to rewrite the essay', nodes: 0 },
    { id: 'c', title: 'Berlin, again', nodes: 3 },
    { id: 'd', title: '', nodes: 0 },
  ];

  // Nothing typed is not a filter. The caller should not have to special-case
  // the empty box.
  ok('an empty query keeps everything', searchRail(rows, '').length === 4);
  ok('and so does whitespace', searchRail(rows, '   ').length === 4);

  ok('case does not matter', searchRail(rows, 'berlin').map((r) => r.id).join('') === 'ac');
  ok('nor does surrounding space', searchRail(rows, '  Berlin ').length === 2);
  ok('a miss is a miss', searchRail(rows, 'zzzz').length === 0);
  ok('a row with no title never matches', matchesQuery(rows[3], 'a') === false);
  ok('but it survives an empty query', matchesQuery(rows[3], '') === true);

  // The two filters are conjunctive, which is what lets one count — "2 of 4" —
  // mean the same thing however many of them are on.
  ok('maps only, on its own', searchRail(rows, '', true).map((r) => r.id).join('') === 'ac');
  ok('maps only, with a query', searchRail(rows, 'essay', true).length === 0);
  ok('both together', searchRail(rows, 'berlin', true).map((r) => r.id).join('') === 'ac');

  // hasMap is the shared rule: the chip and the Maps tab must not disagree
  // about what counts as a map.
  ok('the chip and the tab agree',
     searchRail(rows, '', true).length === filterByTab(rows, 'maps').length);
}

{
  const rows = (n, maps = 0) =>
    Array.from({ length: n }, (_, i) => ({ id: String(i), nodes: i < maps ? 3 : 0 }));

  // A search box over four rows is furniture: you can see all four.
  ok('four rows need no search', shouldShowSearch(rows(4)) === false);
  ok('nor does an empty rail', shouldShowSearch([]) === false);
  ok('twelve rows do', shouldShowSearch(rows(12)) === true);

  // The one place it deliberately differs from the tab bar. Tabs need both
  // kinds present or one of them is always empty; typing a word is useful in
  // a list of twelve chats with no map between them.
  ok('search does not need both kinds', shouldShowSearch(rows(12, 0)) === true);
  ok('where the tabs would have hidden themselves', shouldShowTabs(rows(12, 0)) === false);

  // And they agree at the threshold, because it is the same threshold.
  ok('same boundary as the tabs',
     shouldShowSearch(rows(6, 3)) === shouldShowTabs(rows(6, 3)));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
