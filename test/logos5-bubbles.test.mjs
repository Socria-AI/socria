// LOGOS 5 — THE UNIVERSAL MAP, DRAWN AS SUBJECTS (lib/logos5/bubbles.ts): Today and This week.
//
// Held down here:
//   • each subject a circle, named "FIELD · NAME" round its edge; inside it
//     each real study session a disc — the more it holds, the larger — and
//     each quick question a dot on a spoke from the session nearest it in time;
//   • the session to pick up from wears the halo;
//   • nothing sits on anything: no two discs touch, no dot is on a disc, no
//     two named words cross, everything of a subject is inside its circle,
//     and no two circles overlap;
//   • Today draws the day and what it builds on — a session the person
//     linked to one of the day's first — and, folded, a few subjects worked
//     on lately but not today; pressed, a folded one opens;
//   • a link the person drew across two subjects is a curve, and the card
//     over it says "You linked these" in their words; without one, an idea
//     two subjects come back to; the card sits clear of everything drawn,
//     and the curve rises to it from each disc's edge;
//   • This week draws every one of the week's, a subject folded by the
//     person folded;
//   • on a phone the subjects are one under another;
//   • the same conversations draw the same map.

import { build } from 'esbuild';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, '.tmp', 'logos5-bubbles');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const entry = join(OUT, 'entry.ts');
writeFileSync(entry, [
  `export * from ${JSON.stringify(join(root, 'lib/logos5/bubbles.ts'))};`,
  `export { tilesOf, sharedIdeas } from ${JSON.stringify(join(root, 'lib/logos5/universe.ts'))};`,
  `export { homesOf } from ${JSON.stringify(join(root, 'lib/logos5/spatial.ts'))};`,
  `export { emptyArrangement } from ${JSON.stringify(join(root, 'lib/logos5/arrange.ts'))};`,
].join('\n'));
await build({ entryPoints: { bx: entry }, bundle: true, format: 'esm', platform: 'node', outdir: OUT, outExtension: { '.js': '.mjs' }, tsconfig: join(root, 'tsconfig.json'), logLevel: 'error', alias: { '@': root } });
const B = await import(pathToFileURL(join(OUT, 'bx.mjs')).href);

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 400))));
const J = JSON.stringify;

const NOW = new Date(2026, 9, 21, 15, 0).getTime(); // Wednesday Oct 21, mid-afternoon, local time
const DAY = 86_400_000;
/** a conversation begun `began` days ago; a study holds files and topics */
const conv = (id, title, began, o = {}) => {
  const turns = o.turns ?? (o.quick ? 1 : 3);
  const at = NOW - began * DAY;
  const messages = Array.from({ length: turns }).flatMap((_, i) => [
    { role: 'user', content: i ? 'And then?' : title, at: at + i * 600_000 },
    { role: 'assistant', content: 'Here is where it stands.', at: at + i * 600_000 + 60_000 },
  ]);
  const objs = o.study ? [{ kind: 'study', at: 0, states: [{ v: 1, course: o.study, files: Array.from({ length: o.files ?? 3 }, (_, k) => ({ doc: `d${k}`, name: 'f', pages: 1 })), topics: Array.from({ length: o.topics ?? 7 }, (_, k) => ({ id: `t${k}`, title: `Topic ${k}` })) }] }] : [];
  return { id, title, updatedAt: at + turns * 600_000, projectId: o.p ?? null, messages, map: { nodes: (o.ideas ?? []).map((label, i) => ({ id: `${id}-${i}`, label })), edges: [], objects: { objs }, ...(o.domain ? { ask: { domain: o.domain } } : {}) } };
};
const projects = [
  { id: 'acct', name: 'ACCT 2301', color: 'moss', createdAt: 1 },
  { id: 'econ', name: 'ECON 2302', color: 'slate', createdAt: 2 },
  { id: 'biol', name: 'BIOL 1306', color: 'ochre', createdAt: 3 },
];
const CONVS = [
  conv('exam', 'Exam 2 review', 0.1, { p: 'acct', study: 'ACCT 2301 · Exam 2', turns: 6 }),
  conv('adj', 'Adjusting entries', 1.1, { p: 'acct' }),
  conv('tacct', 'What’s a T-account?', 1.0, { p: 'acct', quick: true }),
  conv('rent', 'Is rent prepaid an asset?', 0.3, { p: 'acct', quick: true }),
  conv('tvm', 'Time value of money', 7.2, { p: 'econ', turns: 5 }),
  conv('pv', 'Present value formula', 7.0, { p: 'econ', quick: true }),
  conv('infl', 'Inflation vs. interest', 8.1, { p: 'econ', quick: true }),
  conv('cell', 'Cell membranes', 10, { p: 'biol', quick: true }),
  conv('mito', 'Mitosis vs meiosis', 11, { p: 'biol', turns: 4 }),
  conv('dna', 'DNA replication', 12, { p: 'biol', quick: true }),
  conv('old', 'A course long done', 60, { domain: 'History', turns: 4 }),
];
const LINK = { id: 'l1', a: 'exam', b: 'tvm', label: 'Accrual accounting and time value of money both ask when value counts' };
const layoutOf = (o = {}) => {
  const tiles = B.tilesOf(o.convs ?? CONVS);
  const homes = B.homesOf(tiles, projects, B.emptyArrangement());
  const scoped = o.week ? tiles.filter((t) => t.at >= NOW - 2.6 * DAY) : tiles;
  return B.bubbleLayout({ lens: o.week ? 'week' : 'today', tiles: scoped, homes, ideas: o.ideas ?? B.sharedIdeas(scoped), links: o.links ?? [LINK], now: NOW, narrow: !!o.narrow, folded: o.folded, opened: o.opened, resumeId: o.resume ?? 'exam', size: o.size, ideaLinks: o.ideaLinks, cardFor: o.cardFor });
};
const overlap = (a, b, air = 0) => a.x < b.x + b.w + air && b.x < a.x + a.w + air && a.y < b.y + b.h + air && b.y < a.y + a.h + air;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const nearBox = (c, r, b) => Math.hypot(c.x - Math.max(b.x, Math.min(c.x, b.x + b.w)), c.y - Math.max(b.y, Math.min(c.y, b.y + b.h))) < r;
const room = (h) => h.r + (h.halo ? B.HALO : 0);

console.log('\n=== each subject a circle, sessions and quick questions in it ===');
{
  const L = layoutOf();
  const C = new Map(L.clusters.map((c) => [c.key, c]));
  ok('a subject the day is about, and one linked to it: a circle each, named for its field and its course', !C.get('p:acct').folded && !C.get('p:econ').folded && C.get('p:acct').field === 'Accounting' && C.get('p:acct').name === 'ACCT 2301' && C.get('p:econ').field === 'Economics', J(L.clusters.map((c) => [c.key, c.field, c.name, c.folded])));
  ok('a real study session is a disc; a quick question a dot', J(L.hubs.map((h) => h.id).sort()) === J(['adj', 'exam', 'tvm']) && J(L.dots.map((d) => d.id).sort()) === J(['infl', 'pv', 'rent', 'tacct']));
  ok('  the more it holds, the larger: the study larger than a few turns', L.hubs.find((h) => h.id === 'exam').r > L.hubs.find((h) => h.id === 'adj').r);
  ok('  under its name, when — and, room enough, what it holds', L.hubs.find((h) => h.id === 'exam').sub === 'today · 3 files · 7 topics' && L.hubs.find((h) => h.id === 'adj').sub === 'yesterday' && L.hubs.find((h) => h.id === 'tvm').sub === 'last week');
  ok('the first of a subject in its colour, the others a shade lighter', L.hubs.find((h) => h.id === 'exam').shade === 0 && L.hubs.find((h) => h.id === 'adj').shade === 1);
  ok('where to pick up wears the halo, and only it', L.hubs.filter((h) => h.halo).map((h) => h.id).join() === 'exam');
  ok('a session follows on from the one beside it: joined to it', J(L.joins) === J([['exam', 'adj']]));
  ok('each quick question hangs from the session of its subject nearest it in time', J(L.spokes.map(([d, h]) => `${d}>${h}`).sort()) === J(['infl>tvm', 'pv>tvm', 'rent>exam', 'tacct>adj']));
  ok('  its words beside it, on the side away from its session', L.dots.every((d) => {
    const h = L.byId.get(d.hub);
    return d.side === 'right' ? d.label.x > d.x : d.side === 'left' ? d.label.x + d.label.w < d.x : d.side === 'above' ? d.label.y + d.label.h <= d.y : d.label.y >= d.y;
  }) && L.dots.every((d) => (d.side === 'right' ? d.x > L.byId.get(d.hub).x : true)));
}

console.log('\n=== nothing sits on anything ===');
for (const [name, o] of [['today', {}], ['today, on a phone', { narrow: true }], ['this week', { week: true }], ['a subject opened', { opened: new Set(['p:biol']) }]]) {
  const L = layoutOf(o);
  const open = L.clusters.filter((c) => !c.folded);
  const discs = L.hubs;
  ok(`${name}: no two discs touch`, discs.every((a, i) => discs.every((b, j) => j <= i || dist(a, b) >= room(a) + room(b) - 0.5)));
  ok(`${name}: no dot on a disc, nor on another dot`, L.dots.every((d) => discs.every((h) => dist(d, h) >= room(h) + d.r) && L.dots.every((e) => e === d || dist(d, e) >= d.r + e.r)));
  const words = L.dots.filter((d) => d.named).map((d) => d.label);
  ok(`${name}: no two named words cross, and none is on a disc`, words.every((a, i) => words.every((b, j) => j <= i || !overlap(a, b))) && words.every((w) => discs.every((h) => !nearBox(h, room(h), w))));
  ok(`${name}: everything of a subject is inside its circle`, open.every((c) => [...discs.filter((h) => h.g === c.key).map((h) => ({ x: h.x, y: h.y, r: room(h) })), ...L.dots.filter((d) => d.g === c.key)].every((n) => dist(n, c) + n.r <= c.r + 0.5)));
  ok(`${name}: no two circles overlap`, open.every((a, i) => open.every((b, j) => j <= i || dist(a, b) >= a.r + b.r - 0.5)));
}

console.log('\n=== Today: the day, what it builds on, and a few folded ===');
{
  const L = layoutOf();
  const folded = L.clusters.filter((c) => c.folded);
  ok('a subject worked on lately but not today is folded: its name and a few dots', folded.length === 1 && folded[0].key === 'p:biol' && folded[0].far && folded[0].pips.length === 3 && folded[0].count === 3 && folded[0].ids.length === 0, J(folded.map((c) => [c.key, c.pips.length, c.count])));
  ok('  its newest session the larger dot, in the middle, a little lower — as drawn', folded[0].pips[1].r > folded[0].pips[0].r && folded[0].pips[1].y > folded[0].pips[0].y);
  ok('  under the others; and one long done is not there at all', folded[0].label.y > Math.max(...L.clusters.filter((c) => !c.folded).map((c) => c.y + c.r)) && !L.clusters.some((c) => c.key === 'f:history') && !L.byId.has('old'));
  const O = layoutOf({ opened: new Set(['p:biol']) });
  const bio = O.clusters.find((c) => c.key === 'p:biol');
  ok('pressed, it opens: a circle with its sessions and questions in it', !bio.folded && O.byId.has('mito') && O.byId.has('cell') && O.byId.get('mito').hub);
  const without = layoutOf({ links: [] });
  ok('without the link, last week’s Economics is not what today builds on — folded with the rest', !without.byId.has('tvm') && without.clusters.find((c) => c.key === 'p:econ')?.folded === true, J(without.clusters.map((c) => [c.key, c.folded])));
  ok('it says which day it is about', L.today?.when === 'today');
  const later = layoutOf({ convs: CONVS.map((c) => ({ ...c, updatedAt: c.updatedAt - 2 * DAY, messages: c.messages.map((m) => ({ ...m, at: m.at - 2 * DAY })) })) });
  ok('nothing yet today: the last day worked on, haloed where to pick up', later.today?.when === 'last' && later.hubs.some((h) => h.halo));
}

console.log('\n=== what joins two subjects ===');
{
  const L = layoutOf();
  const own = L.links.find((l) => l.kind === 'own');
  ok('the person’s link across two subjects: a curve between their discs', own && own.a === 'exam' && own.b === 'tvm' && own.across && own.own === 'l1');
  ok('  from one disc’s edge to the other’s', Math.abs(dist(own.p0, L.byId.get('exam')) - L.byId.get('exam').r) < 1.5 && Math.abs(dist(own.p1, L.byId.get('tvm')) - L.byId.get('tvm').r) < 1.5);
  ok('the card over it: “You linked these”, in their words', L.card && L.card.link === own.key && L.card.title === 'You linked these' && L.card.says.map((s) => s.text).join('') === 'Accrual accounting and time value of money both ask when value counts.');
  ok('  and when they were opened', L.card.note === 'Last opened today and last week.');
  const solid = [...L.hubs.map((h) => ({ c: h, r: room(h) })), ...L.dots.map((d) => ({ c: d, r: d.r }))];
  ok('  clear of every disc, dot and word', solid.every(({ c, r }) => !nearBox(c, r, L.card)) && L.dots.filter((d) => d.named).every((d) => !overlap(d.label, L.card)) && L.clusters.every((c) => !overlap(c.label, L.card)));
  ok('  over both discs, the curve rising to its foot from each', L.card.y + L.card.h < Math.min(L.byId.get('exam').y - L.byId.get('exam').r, L.byId.get('tvm').y - L.byId.get('tvm').r) && own.c.y < L.card.y + L.card.h);
  // the two share an idea, and nothing the person drew joins them
  const sharing = CONVS.map((c) => (c.id === 'exam' ? conv('exam', 'Exam 2 review', 0.1, { p: 'acct', study: 'ACCT 2301 · Exam 2', turns: 6, ideas: ['Present value of money'] }) : c.id === 'tvm' ? conv('tvm', 'Time value of money', 7.2, { p: 'econ', turns: 5, ideas: ['Present value of money'] }) : c));
  const idea = layoutOf({ links: [], convs: sharing });
  const il = idea.links.find((l) => l.kind === 'idea');
  ok('without one, an idea two subjects both come back to', il && il.across && idea.card?.title === 'One idea, two subjects' && J(idea.card.says) === J([{ text: 'Accounting and Economics both come back to ' }, { text: 'Present value of money', em: true }, { text: '.' }]), J(idea.card));
  ok('  drawn only when ideas are asked for; the person’s own links always are', !layoutOf({ links: [], ideaLinks: false, convs: sharing }).links.some((l) => l.kind === 'idea') && layoutOf({ ideaLinks: false }).links.some((l) => l.kind === 'own'));
  const same = layoutOf({ links: [{ id: 'l2', a: 'exam', b: 'adj', label: '' }] });
  ok('a link within one subject is drawn; its card, when it is the only one, names both', same.links.some((l) => l.own === 'l2' && !l.across) && same.card?.says[0].text === '“Exam 2 review” and “Adjusting entries”.');
}

console.log('\n=== This week, a phone, the sizes, the words ===');
{
  const W = layoutOf({ week: true });
  const week = B.tilesOf(CONVS).filter((t) => t.at >= NOW - 2.6 * DAY).map((t) => t.id);
  ok('this week: every one of the week’s, once', week.every((id) => W.byId.has(id)) && W.byId.size === week.length && !W.clusters.some((c) => c.folded));
  const F = layoutOf({ week: true, folded: new Set(['p:acct']) });
  ok('  a subject the person folded: folded, saying how many', F.clusters.find((c) => c.key === 'p:acct').folded && F.clusters.find((c) => c.key === 'p:acct').count === 4 && !F.byId.has('exam'));
  const N = layoutOf({ narrow: true });
  const open = N.clusters.filter((c) => !c.folded);
  ok('on a phone: the subjects one under another, the day’s first', open.every((c, i) => i === 0 || c.y > open[i - 1].y) && open[0].key === 'p:acct');
  ok('  and narrower than on a wide screen', N.bounds.w < layoutOf().bounds.w);
  const S = layoutOf({ size: 'same' });
  ok('sized all alike when asked — the day’s and where to pick up still never small', S.hubs.filter((h) => !h.focus && !h.halo).every((h, i, all) => h.r === all[0].r) && S.hubs.find((h) => h.id === 'exam').r >= 66);
  ok('when, as the map says it', B.whenSaid(NOW - 1000, NOW) === 'today' && B.whenSaid(NOW - DAY, NOW) === 'yesterday' && B.whenSaid(NOW - 2 * DAY, NOW) === 'Mon' && B.whenSaid(NOW - 6 * DAY, NOW) === 'last week' && B.whenSaid(NOW - 20 * DAY, NOW) === 'Oct 1');
  ok('a subject’s words: its field and its course; a field alone; everything else', J(B.subjectWords({ kind: 'course', name: 'ACCT 2301', subject: { key: 'c:acct2301', name: 'ACCT 2301', kind: 'course', field: 'accounting' } })) === J({ field: 'Accounting', name: 'ACCT 2301' }) && J(B.subjectWords({ kind: 'field', name: 'Mathematics', subject: { key: 'f:mathematics', name: 'Mathematics', kind: 'field' } })) === J({ field: null, name: 'Mathematics' }) && B.subjectWords({ kind: 'other', name: 'x', subject: null }).name === 'Everything else');
  const P = B.packCircles([200, 120, 160, 90], { gap: 40 });
  ok('circles packed round the first, none on another', P[0].x === 0 && P[0].y === 0 && P.every((a, i) => P.every((b, j) => j <= i || dist(a, b) >= [200, 120, 160, 90][i] + [200, 120, 160, 90][j] + 40 - 0.6)));
  ok('the same conversations draw the same map', J(layoutOf()) === J(layoutOf()) && J(layoutOf({ narrow: true })) === J(layoutOf({ narrow: true })));
  ok('the person’s choice of card is the card shown', layoutOf({ links: [LINK, { id: 'l2', a: 'exam', b: 'adj', label: 'same chapter' }], cardFor: 'own:l2' }).card?.link === 'own:l2');
}

console.log(`\nlogos5-bubbles: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
