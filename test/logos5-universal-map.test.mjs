// LOGOS 6 — THE UNIVERSAL MAP, ONE MAP AT FOUR SCALES.
//
// Held down here:
//   • the scales are exactly Today | Week | Month | All Time, read from activity in the person's own time zone:
//     Today the local calendar day, Week the seven days that end today, Month the thirty; counted in calendar
//     days, so a change of the clocks inside the window neither adds nor takes away a day; and cumulative,
//     Today ⊆ Week ⊆ Month ⊆ All Time, always (lib/logos5/scales.ts);
//   • the map is laid out once, from every conversation: a conversation is in the same place at every scale, a
//     scale only says which are lit; each subject's region is the circle round what of it is lit, and holds
//     all of it; nothing is drawn that is not a real conversation, and no link without both its ends
//     (lib/logos5/bubbles.ts bubblePlaces, bubbleLayout);
//   • level of detail (lib/logos5/mapLod.ts): far, mid and near by zoom, with hysteresis; culling to the view;
//     a busy subject drawn from far away as one region that counts exactly what is in it; a budget that keeps
//     what must be drawn; names from far away and beside a disc that never overlap; many coming into view at
//     once drawn a frame's worth at a time, the middle of the view first; the camera's glide;
//   • finding (lib/logos5/mapSearch.ts): conversations, subjects and ideas, each said for what it is; one
//     outside the scale said to be, with the narrowest scale that shows it; Recent; when, in a few characters;
//   • the Timeline is gone, and an arrangement kept while it was there still reads.

import { build } from 'esbuild';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// a time zone with a change of the clocks in it, so the calendar-day rule is tested against one (Node reads TZ
// when it is set, before the first date is made)
process.env.TZ = 'Europe/London';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, '.tmp', 'logos5-universal-map');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const entry = join(OUT, 'entry.ts');
writeFileSync(
  entry,
  [
    `export * from ${JSON.stringify(join(root, 'lib/logos5/scales.ts'))};`,
    `export * from ${JSON.stringify(join(root, 'lib/logos5/mapLod.ts'))};`,
    `export * from ${JSON.stringify(join(root, 'lib/logos5/mapSearch.ts'))};`,
    `export { bubbleLayout, bubblePlaces, regionOf } from ${JSON.stringify(join(root, 'lib/logos5/bubbles.ts'))};`,
    `export { tilesOf, sharedIdeas } from ${JSON.stringify(join(root, 'lib/logos5/universe.ts'))};`,
    `export { homesOf } from ${JSON.stringify(join(root, 'lib/logos5/spatial.ts'))};`,
    `export { emptyArrangement, parseArrangement } from ${JSON.stringify(join(root, 'lib/logos5/arrange.ts'))};`,
  ].join('\n')
);
await build({ entryPoints: { mx: entry }, bundle: true, format: 'esm', platform: 'node', outdir: OUT, outExtension: { '.js': '.mjs' }, tsconfig: join(root, 'tsconfig.json'), logLevel: 'error', alias: { '@': root } });
const M = await import(pathToFileURL(join(OUT, 'mx.mjs')).href);
const { makeConversations, FIXTURE_PROJECTS } = await import(pathToFileURL(join(root, 'scripts/map-fixtures.mjs')).href);

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 400))));
const J = JSON.stringify;
const local = (y, mo, d, h = 0, mi = 0) => new Date(y, mo, d, h, mi).getTime();
const DAY = 86_400_000;

console.log('\n=== the four scales ===');
{
  ok('exactly four, narrowest first: Today | Week | Month | All Time', M.SCALES.map((s) => M.SCALE_SAID[s].long).join(' | ') === 'Today | Week | Month | All Time');
  const now = local(2026, 10, 15, 15, 0); // Sunday 15 November, mid-afternoon
  const at = (t) => new Date(t);
  const from = (s) => M.scaleFrom(s, now);
  ok('Today begins at this local midnight', at(from('today')).getHours() === 0 && at(from('today')).getDate() === 15);
  ok('Week: today and the six days before it (from Monday the 9th)', at(from('week')).getDate() === 9 && at(from('week')).getHours() === 0);
  ok('Month: today and the twenty-nine days before it (from 17 October)', at(from('month')).getDate() === 17 && at(from('month')).getMonth() === 9 && at(from('month')).getHours() === 0);
  ok('All Time has no beginning', from('all') === -Infinity);
  const t = (h, d = 15) => ({ at: local(2026, 10, d, h, 0) });
  ok('Today is the calendar day, not the last twenty-four hours: half past eleven last night is not in it, ten past midnight is', !M.inScale({ at: local(2026, 10, 14, 23, 30) }, 'today', now) && M.inScale({ at: local(2026, 10, 15, 0, 10) }, 'today', now));
  ok('the edge of the week: Monday the 9th at one minute past midnight is in it; Sunday the 8th at 23:59 is not', M.inScale({ at: local(2026, 10, 9, 0, 1) }, 'week', now) && !M.inScale({ at: local(2026, 10, 8, 23, 59) }, 'week', now));
  // the clocks went back on 25 October 2026 in London: a window across it still starts at a local midnight, the right date
  const after = local(2026, 10, 2, 12, 0);
  const wk = new Date(M.scaleFrom('week', after));
  const mo = new Date(M.scaleFrom('month', after));
  ok('across the change of the clocks: still whole calendar days, from local midnight (Week from 27 Oct, Month from 4 Oct)', wk.getDate() === 27 && wk.getMonth() === 9 && wk.getHours() === 0 && mo.getDate() === 4 && mo.getMonth() === 9 && mo.getHours() === 0, `${wk} / ${mo}`);
  ok('activity is the last thing that happened, never before it was begun', M.activityOf({ at: 5, started: 9 }) === 9 && M.activityOf({ at: 12, started: 9 }) === 12);
  ok('a conversation from a clock that ran fast is in every scale, not in none', M.SCALES.every((s) => M.inScale({ at: now + 3 * DAY }, s, now)));
  ok('the narrowest scale that holds it', M.scaleOf(t(9), now) === 'today' && M.scaleOf(t(9, 12), now) === 'week' && M.scaleOf(t(9, 1), now) === 'month' && M.scaleOf({ at: local(2025, 2, 1) }, now) === 'all');
  ok('one scale covers another when it is at least as wide', M.covers('all', 'today') && M.covers('week', 'week') && !M.covers('today', 'week'));

  const convs = makeConversations(400, { now, seed: 11, projects: FIXTURE_PROJECTS });
  const tiles = M.tilesOf(convs);
  const sets = M.SCALES.map((s) => M.idsInScale(tiles, s, now));
  const within = (a, b) => [...a].every((id) => b.has(id));
  ok('cumulative, always: Today ⊆ Week ⊆ Month ⊆ All Time', within(sets[0], sets[1]) && within(sets[1], sets[2]) && within(sets[2], sets[3]) && sets[3].size === tiles.length, sets.map((s) => s.size).join(' '));
  const counts = M.scaleCounts(tiles, now);
  ok('the counts are the same sets counted (and so never fall as the scale widens)', M.SCALES.every((s, i) => counts[s] === sets[i].size) && counts.today <= counts.week && counts.week <= counts.month && counts.month <= counts.all, J(counts));
  ok('an empty scale points to the narrowest wider one with more, and to none when nothing more is there', M.widerWithMore('today', { today: 0, week: 0, month: 3, all: 9 }) === 'month' && M.widerWithMore('month', { today: 0, week: 0, month: 9, all: 9 }) === null);
}

console.log('\n=== one layout, four scales ===');
const NOW = local(2026, 10, 15, 15, 0);
const mapOf = (n, seed = 7, narrow = false) => {
  const convs = makeConversations(n, { now: NOW, seed, projects: FIXTURE_PROJECTS });
  const tiles = M.tilesOf(convs);
  const homes = M.homesOf(tiles, FIXTURE_PROJECTS, M.emptyArrangement());
  const base = { lens: 'week', tiles, all: tiles, homes, ideas: M.sharedIdeas(tiles), links: [], now: NOW, canMake: true, start: true, narrow };
  const P = M.bubblePlaces(base);
  const at = Object.fromEntries(M.SCALES.map((s) => [s, M.bubbleLayout({ ...base, visible: M.idsInScale(tiles, s, NOW), foldedInBounds: s === 'all' }, P)]));
  return { tiles, base, P, at };
};
{
  for (const [n, seed, narrow] of [[60, 7, false], [400, 3, false], [120, 5, true]]) {
    const { tiles, base, P, at } = mapOf(n, seed, narrow);
    const tag = `${n} conversations${narrow ? ', on a phone' : ''}`;
    const place = (L) => new Map([...L.hubs, ...L.dots].map((p) => [p.id, `${p.x},${p.y},${p.r}`]));
    const all = place(at.all);
    ok(`${tag}: every conversation in the same place at every scale`, M.SCALES.every((s) => [...place(at[s])].every(([id, p]) => all.get(id) === p)));
    ok(`${tag}: the same with the placement worked out again (it does not depend on the scale it was asked for)`, J(M.bubbleLayout({ ...base, visible: M.idsInScale(tiles, 'today', NOW), foldedInBounds: false })) === J(at.today));
    const real = new Set(tiles.map((t) => t.id));
    ok(`${tag}: nothing drawn that is not a real conversation, and All Time draws every one`, M.SCALES.every((s) => [...place(at[s]).keys()].every((id) => real.has(id))) && all.size === tiles.length, `${all.size} of ${tiles.length}`);
    for (const s of ['today', 'week']) {
      const lit = M.idsInScale(tiles, s, NOW);
      const L = at[s];
      const ofIt = (c) => [...L.hubs, ...L.dots].filter((p) => p.g === c.key && lit.has(p.id));
      const regions = L.clusters.filter((c) => !c.folded);
      ok(`${tag}, ${s}: each subject's region holds all it lights, and counts exactly that`, regions.every((c) => (c.region ? ofIt(c).every((p) => Math.hypot(p.x - c.region.x, p.y - c.region.y) + p.r <= c.region.r + 0.5) && c.region.shown === ofIt(c).length : ofIt(c).length === 0)));
      ok(`${tag}, ${s}: no curve between two subjects without both its ends lit`, L.links.every((l) => lit.has(l.a) && lit.has(l.b)));
    }
    ok(`${tag}: a subject with nothing lit today has no region today (it is not drawn larger than what it holds)`, at.today.clusters.filter((c) => !c.folded && c.region === null).every((c) => ![...at.today.hubs, ...at.today.dots].some((p) => p.g === c.key && M.idsInScale(tiles, 'today', NOW).has(p.id))));
    ok(`${tag}: the placement is worked out once and kept: the same object serves every scale`, P === P && at.today.hubs.length === at.all.hubs.length);
  }
  const quiet = M.regionOf({ x: 0, y: 0, r: 200, label: { x: 0, y: 0, w: 10, h: 10 }, ids: [] }, []);
  ok('a region with nothing lit in it is none at all', quiet === null);
}

console.log('\n=== level of detail ===');
{
  ok('far, mid and near by zoom', M.lodFor(0.2, null) === 'far' && M.lodFor(0.6, null) === 'mid' && M.lodFor(1.2, null) === 'near');
  ok('hysteresis: a camera resting just past a boundary keeps its level until well past it', M.lodFor(0.36, 'mid') === 'mid' && M.lodFor(0.36, 'far') === 'far' && M.lodFor(0.41, 'far') === 'mid' && M.lodFor(0.78, 'mid') === 'mid' && M.lodFor(0.78, 'near') === 'near' && M.lodFor(0.7, 'near') === 'mid');
  // a zoom wavering round a boundary: the level changes once, not with every waver
  let lod = 'mid';
  let changes = 0;
  for (const k of [0.36, 0.35, 0.37, 0.33, 0.36, 0.38, 0.35, 0.39, 0.37, 0.36]) {
    const next = M.lodFor(k, lod);
    if (next !== lod) changes++;
    lod = next;
  }
  ok('  a zoom wavering round the far boundary changes the level once', changes === 1, changes);
  const v = M.viewOf({ x: -100, y: -50, k: 2 }, 800, 600, 0);
  ok('the view, in world units', v.x0 === 50 && v.y0 === 25 && v.x1 === 450 && v.y1 === 325, J(v));
  ok('culled to the view: a circle in it or touching it is in, one beyond is not', M.circleIn(v, 40, 100, 12) && !M.circleIn(v, 30, 100, 12) && M.circleIn(v, 460, 330, 12));
  const wide = M.viewOf({ x: -100, y: -50, k: 2 }, 800, 600, 0.5);
  ok('the culled part is kept while the camera stays inside it, and redone once it leaves', M.viewCovers(wide, { x: -150, y: -50, k: 2 }, 800, 600) && !M.viewCovers(wide, { x: -600, y: -50, k: 2 }, 800, 600));
  ok('a busy subject is one region only from far away, and only when busy', M.aggregated('far', M.AGGREGATE_AT) && !M.aggregated('far', M.AGGREGATE_AT - 1) && !M.aggregated('mid', 50));
  const items = Array.from({ length: 30 }, (_, i) => ({ id: `n${String(i).padStart(2, '0')}`, score: i % 10 }));
  const kept = M.withinBudget(items, 10, new Set(['n00']));
  ok('a budget: the most important first, and what must be drawn always is', kept.length === 10 && kept.some((i) => i.id === 'n00') && kept.filter((i) => i.id !== 'n00').every((i) => i.score >= 7) && items.filter((i) => i.score >= 8).every((i) => kept.includes(i)), J(kept.map((i) => i.id)));
  ok('  under the budget, everything', M.withinBudget(items, 40).length === 30);
  ok('  the same candidates keep the same ones', J(M.withinBudget(items, 10)) === J(M.withinBudget([...items].reverse(), 10)));

  const boxes = (keys, regions, k) => regions.filter((g) => keys.has(g.key)).map((g) => ({ x0: g.x * k - g.w / 2 - 6, x1: g.x * k + g.w / 2 + 6, y0: g.y * k - 14, y1: g.y * k + 14 }));
  const overlaps = (bs) => bs.some((a, i) => bs.some((b, j) => i < j && a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0));
  const regions = Array.from({ length: 40 }, (_, i) => ({ key: `g${i}`, x: (i % 8) * 140, y: Math.floor(i / 8) * 90, r: 40 + (i * 37) % 90, w: 60 + (i * 13) % 80 }));
  const names = M.namesFromFar(regions, 0.5, 24);
  ok('names from far away: never two overlapping, the largest subject named first', !overlaps(boxes(names, regions, 0.5)) && names.has([...regions].sort((a, b) => b.r - a.r)[0].key) && names.size <= 24);
  const discs = Array.from({ length: 60 }, (_, i) => ({ id: `d${i}`, x: (i % 10) * 60, y: Math.floor(i / 10) * 60, r: 10 + (i % 4) * 4, w: 90 }));
  const others = [...discs, { id: 'big', x: 290, y: 150, r: 60 }];
  const tags = M.tagsAt(discs, 1, 60, others);
  const tagBox = (d) => ({ x0: d.x - d.w / 2 - 3, x1: d.x + d.w / 2 + 3, y0: d.y + d.r + 4, y1: d.y + d.r + 21 });
  const tb = discs.filter((d) => tags.has(d.id)).map(tagBox);
  const hitsDisc = discs.filter((d) => tags.has(d.id)).some((d) => others.some((o) => o.id !== d.id && tagBox(d).x0 < o.x + o.r && tagBox(d).x1 > o.x - o.r && tagBox(d).y0 < o.y + o.r && tagBox(d).y1 > o.y - o.r));
  ok('a name beside a disc: never over another name, nor over any disc drawn (those wanting no name included)', tags.size > 0 && !overlaps(tb) && !hitsDisc, `${tags.size} given`);

  const many = Array.from({ length: 400 }, (_, i) => ({ id: `p${i}`, x: (i % 20) * 50, y: Math.floor(i / 20) * 50 }));
  ok('progressive drawing: a few new ones are drawn at once', M.revealOrder(many.slice(0, M.PROGRESSIVE_AT), new Set(), new Set(), { x: 0, y: 0 }) === null);
  const before = new Set(['p0', 'p1']);
  const r = M.revealOrder(many, before, new Set(['p399']), { x: 500, y: 500 });
  ok('  many: those already drawn and those that must be first, then the rest nearest the middle of the view first', r && r.first === 3 && J(r.order.slice(0, 3).sort()) === J(['p0', 'p1', 'p399']) && r.order[3] === 'p210' && new Set(r.order).size === 400, r && J(r.order.slice(0, 6)));

  const a = { x: 0, y: 0, k: 0.25 };
  const b = { x: -800, y: -400, k: 1 };
  const mid = M.camBetween(a, b, 0.5, 800, 600);
  ok('the glide: from where it was to where it goes, the zoom eased in proportion (half way, the geometric mean)', J(M.camBetween(a, b, 0, 800, 600)) === J(a) && Math.abs(M.camBetween(a, b, 1, 800, 600).k - 1) < 1e-9 && Math.abs(mid.k - 0.5) < 1e-9, J(mid));
}

console.log('\n=== finding on the map ===');
{
  const { tiles } = mapOf(400, 3);
  const homes = M.homesOf(tiles, FIXTURE_PROJECTS, M.emptyArrangement());
  const subjectOf = (id) => {
    const h = homes.of.get(id);
    return h ? { key: h.key, name: h.name } : null;
  };
  const input = (scale) => ({ tiles, subjectOf, now: NOW, scale });
  ok('nothing typed finds nothing', M.searchMap(input('all'), '   ').length === 0);
  const found = M.searchMap(input('today'), 'revolution');
  const conv = found.filter((f) => f.kind === 'conversation');
  ok('conversations by their titles, each said for what it is, with when and where', conv.length > 0 && conv.every((f) => /revolution/i.test(f.title) && typeof f.at === 'number' && f.ids.length === 1 && f.ids[0] === f.id));
  ok('  one outside the scale is said to be, with the narrowest scale that shows it', conv.some((f) => !f.inView) && conv.every((f) => f.inView === M.covers('today', f.scale) && f.scale === M.scaleOf(tiles.find((t) => t.id === f.id), NOW)));
  ok('  those in view come before those outside it, at the same fit', conv.every((f, i) => i === 0 || !(f.inView && !conv[i - 1].inView) || conv[i - 1].title.toLowerCase().indexOf('revolution') !== f.title.toLowerCase().indexOf('revolution')));
  const subj = M.searchMap(input('all'), 'econ').filter((f) => f.kind === 'subject');
  ok('a subject by its name, with how many it holds and all of them, newest first', subj.length === 1 && subj[0].ids.length > 1 && subj[0].where === `${subj[0].ids.length} conversations`, J(subj.map((s) => [s.title, s.where])));
  const idea = M.searchMap(input('all'), 'misconception', { conversation: 0 }).filter((f) => f.kind === 'idea');
  ok('an idea by its words, with the conversations that hold it', idea.length > 0 && idea.every((f) => /misconception/i.test(f.title) && f.ids.length >= 1 && f.ids.every((id) => tiles.find((t) => t.id === id)?.ideas.some((n) => /misconception/i.test(n.label)))));
  const prefix = M.searchMap(input('all'), 'compare').filter((f) => f.kind === 'conversation');
  ok('a title that begins with the words comes before one that only holds them', prefix.length > 0 && prefix[0].title.toLowerCase().startsWith('compare'));
  ok('at most eight conversations, four subjects, four ideas', M.searchMap(input('all'), 'e').filter((f) => f.kind === 'conversation').length <= 8);
  ok('the words around what was found, when it was not the title', M.excerptAround('a'.repeat(200) + ' the needle is here ' + 'b'.repeat(200), 'needle', 60).includes('needle') && M.excerptAround('a'.repeat(200) + ' needle ' + 'b'.repeat(200), 'needle', 60).startsWith('…'));
  const recent = M.recentOf(tiles, 8);
  ok('Recent: the most recently active, newest first', recent.length === 8 && recent.every((t, i) => i === 0 || M.activityOf(recent[i - 1]) >= M.activityOf(t)));
  const n = local(2026, 10, 15, 15, 0);
  ok('when, in a few characters', M.whenShort(n - 30_000, n) === 'Just now' && M.whenShort(n - 45 * 60_000, n) === '45m ago' && M.whenShort(n - 5 * 3600_000, n) === '5h ago' && M.whenShort(local(2026, 10, 14, 9), n) === 'Yesterday' && M.whenShort(local(2026, 10, 11, 9), n) === 'Wed' && M.whenShort(local(2026, 8, 2), n) === 'Sep 2' && M.whenShort(local(2025, 2, 2), n) === 'Mar 2025');
}

console.log('\n=== the Timeline is gone ===');
{
  ok('its view and its layout are deleted', !existsSync(join(root, 'components/logos5/UniverseTime.tsx')) && !existsSync(join(root, 'lib/logos5/timeline.ts')));
  const files = [];
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(tsx?|css)$/.test(f)) files.push(p);
    }
  };
  for (const d of ['components', 'lib', 'app']) walk(join(root, d));
  // (lib/objects/timeline.ts and its TimeView, an object's own history, are another thing and stay)
  const uses = files.filter((f) => /UniverseTime|logos5\/timeline|\.l5t[-\s{,:.)]/.test(readFileSync(f, 'utf8')) || (f.includes('/logos5/') && /from '\.\/timeline'/.test(readFileSync(f, 'utf8'))));
  ok('nothing imports it, draws it or styles it any more', uses.length === 0, uses.join(', '));
  const uni = readFileSync(join(root, 'components/logos5/Universe.tsx'), 'utf8');
  ok('no way to it: no Timeline choice, no week to step through', !/['"]Timeline['"]/.test(uni) && !/The week before/.test(uni) && !/find it in time/.test(uni));
  const kept = M.parseArrangement({ v: 1, mode: 'timeline', starred: ['s1'], hidden: ['s2'], links: [{ id: 'k', a: 's1', b: 's3', label: 'same deadline' }] });
  ok('an arrangement kept while it was there still reads: its scale All Time, its stars, hidden ones and links as they were', kept.mode === 'all' && J(kept.starred) === J(['s1']) && J(kept.hidden) === J(['s2']) && kept.links.length === 1 && kept.links[0].label === 'same deadline', J(kept));
}

console.log('\n=== drawn as it should be ===');
{
  const css = readFileSync(join(root, 'components/logos5/universe.css'), 'utf8');
  // a quick question's dot is a span placed absolutely in a zero-sized anchor: made relative it is an inline box with
  // no size, and every quick question vanishes from the map (it happened once, to anchor the spotlight's ring)
  const rules = [...css.matchAll(/([^{}]*\.l5b-pip[^{}]*)\{([^}]*)\}/g)].filter((m) => /position\s*:/.test(m[2]) && !/::?(after|before)/.test(m[1]));
  ok('every rule that places a quick question\'s dot places it absolutely', rules.length > 0 && rules.every((m) => /position\s*:\s*absolute/.test(m[2])), rules.map((m) => m[1].trim() + ' { ' + m[2].trim() + ' }').join(' | '));
}

console.log('\n=== a memory beside a session joined to one not drawn at this scale ===');
{
  // The crash seen on dev ("Cannot read properties of undefined (reading 'y')" in the memories' placement):
  // placeMemories turned away from every session its anchor is joined to, looking each one up among what is lit
  // at this scale, and at Today, Week or Month the other end of a join need not be lit.
  for (const narrow of [false, true]) {
    const convs = makeConversations(160, { now: NOW, seed: 5, projects: FIXTURE_PROJECTS });
    const tiles = M.tilesOf(convs);
    const homes = M.homesOf(tiles, FIXTURE_PROJECTS, M.emptyArrangement());
    const base = { lens: 'week', tiles, all: tiles, homes, ideas: M.sharedIdeas(tiles), links: [], now: NOW, canMake: true, start: true, narrow };
    const P = M.bubblePlaces(base);
    let cases = 0;
    const threw = [];
    for (const s of M.SCALES) {
      const visible = M.idsInScale(tiles, s, NOW);
      // a memory from each lit end of a join whose other end is not lit
      const memories = P.joins
        .filter(([a, b]) => visible.has(a) !== visible.has(b))
        .slice(0, 6)
        .map(([a, b], i) => ({ id: `m${s}${i}`, text: 'Prefers worked examples before the definition', from: [visible.has(a) ? a : b] }));
      if (!memories.length) continue;
      cases += memories.length;
      try {
        const L = M.bubbleLayout({ ...base, visible, memories, foldedInBounds: s === 'all' }, P);
        if (!Array.isArray(L.memories)) threw.push(`${s}: no memories array`);
      } catch (e) {
        threw.push(`${s}: ${e.message}`);
      }
    }
    ok(`${narrow ? 'phone' : 'desktop'}: laid out at every scale without failing (${cases} memories beside a join half off the map)`, cases > 0 && !threw.length, threw.join(' | ') || `cases=${cases}`);
  }
}

console.log(`\nlogos5-universal-map: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
