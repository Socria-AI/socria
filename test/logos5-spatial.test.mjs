// LOGOS 5 — THE UNIVERSAL SPATIAL MAP: HUBS, AMBIENT DOTS, AND THREE WAYS TO GROUP THEM.
//
// lib/logos5/subjects.ts reads what a conversation is about; lib/logos5/
// spatial.ts lays the map out (the PRD "Clearer Structures and UI": past
// sessions as nodes, major ones as hubs and quick questions as ambient dots,
// grouped by today, by week and by subject). Held down here:
//   • nobody has to file anything: a course in a study, a course code, the
//     field the map named, the picture it drew or the words it uses place a
//     conversation; what nothing places is "everything else", never a guess
//     dressed up as a subject; a Project is the person's own word and wins;
//     a conversation about a Project's subject is shown there, marked, never
//     filed without them; a lone quick question is not a subject yet;
//   • a hub is a major session, a dot a quick one; a Core chat is a dot;
//   • By subject keeps its places: a new conversation joins the end of its
//     cluster and moves nothing; a pin holds only in its cluster; a moved
//     cluster carries its own; nothing lands on anything put by hand;
//   • By week is newest first, this week and last week by name; months take
//     over after eight weeks;
//   • Today's learning: today's in the middle, the earlier ones they build on
//     round them (an idea in common first), each named — and nothing else
//     drawn; with nothing today yet, the last day worked on;
//   • a name the map gives that is a field already here is that field, and a
//     vague one is no subject at all;
//   • the same conversations draw the same map, and no two stars sit on
//     each other's words.

import { build } from 'esbuild';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, '.tmp', 'logos5-spatial');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const entry = join(OUT, 'entry.ts');
writeFileSync(entry, ['universe', 'arrange', 'subjects', 'spatial'].map((m) => `export * from ${JSON.stringify(join(root, `lib/logos5/${m}.ts`))};`).join('\n'));
await build({ entryPoints: { sky: entry }, bundle: true, format: 'esm', platform: 'node', outdir: OUT, outExtension: { '.js': '.mjs' }, tsconfig: join(root, 'tsconfig.json'), logLevel: 'error', alias: { '@': root } });
const S = await import(pathToFileURL(join(OUT, 'sky.mjs')).href);

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 400))));
const J = JSON.stringify;

const NOW = new Date(2026, 9, 21, 15, 0).getTime(); // a Wednesday afternoon, local time
const H = 3_600_000, DAY = 86_400_000;
const about = (o = {}) => ({ title: '', course: '', domain: '', topic: '', viz: '', asked: '', ideas: [], stands: '', ...o });
const conv = (id, title, o = {}) => {
  const turns = o.turns ?? 3;
  const first = o.first ?? (o.last ?? DAY) + DAY;
  return {
    id,
    title,
    updatedAt: NOW - (o.last ?? DAY),
    projectId: o.project ?? null,
    messages: Array.from({ length: turns }).flatMap((_, i) => [
      { role: 'user', content: i ? 'and then?' : title, at: NOW - first + i * 1000 },
      { role: 'assistant', content: 'It comes down to one thing.', at: NOW - first + i * 1000 + 500 },
    ]),
    map: { context: o.context, nodes: (o.ideas ?? []).map((label, i) => ({ id: `${id}-${i}`, label })), edges: (o.ideas ?? []).slice(1).map((_, i) => ({ from: `${id}-0`, to: `${id}-${i + 1}` })), ...(o.domain ? { ask: { domain: o.domain } } : {}), ...(o.viz ? { viz: { kind: o.viz } } : {}), ...(o.course ? { objects: { objs: [{ kind: 'study', at: 0, states: [{ course: o.course, topics: [] }] }] } } : {}) },
  };
};
const chat = (id, title, last, project = null) => ({ id, title, updatedAt: NOW - last, projectId: project, kind: 'core' });

console.log('\n=== what a conversation is about ===');
{
  ok('a course code, however it is written: ACCT 2301, acct-2301, Econ 1301', S.courseIn('Exam 2 for ACCT 2301')?.name === 'ACCT 2301' && S.courseIn('notes from acct-2301')?.key === 'c:acct2301' && S.courseIn('Econ 1301 midterm')?.name === 'ECON 1301' && S.courseIn('ACCT 2301').field === 'accounting');
  ok('  an unknown department only in capitals, and never a year', S.courseIn('Notes for ARCH 1101')?.name === 'ARCH 1101' && S.courseIn('budget for FY 2026') === null && S.courseIn('arch 1101') === null && S.courseIn('ISO 9001 audit') === null && S.courseIn('my RTX 4090') === null);
  ok('a study’s course: its code, or else its name; an exam is when, not what', S.courseOfStudy('ACCT 2301 · Exam 2')?.key === 'c:acct2301' && S.courseOfStudy('Intro to Psychology · Midterm')?.name === 'Intro to Psychology' && S.courseOfStudy('Intro to Psychology · Midterm')?.field === 'psychology' && S.courseOfStudy('Midterm 2') === null && S.courseOfStudy('') === null);
  ok('  a study sorted under a plain field is that field', S.courseOfStudy('Biology · Final')?.key === 'f:biology');
  ok('the field the map named, as a field the map knows — or as itself, when it is a plain name', S.fieldOfDomain('Microeconomics')?.key === 'f:economics' && S.fieldOfDomain('personal finance')?.key === 'f:money' && S.fieldOfDomain('Music theory')?.key === 'f:arts' && S.fieldOfDomain('Urban planning')?.name === 'Urban Planning' && S.fieldOfDomain('a very long and rambling description of a domain') === null && S.fieldOfDomain('') === null);
  ok('a name the map gives that is a field here already is that field — not a subject of its own', S.fieldOfDomain('Astrophysics')?.key === 'f:physics' && S.fieldOfDomain('Astronomy')?.key === 'f:physics' && S.fieldOfDomain('Econometrics')?.key === 'f:statistics' && S.fieldOfDomain('Artificial intelligence')?.key === 'f:computing' && S.fieldOfDomain('User experience design')?.key === 'f:computing' && S.fieldOfDomain('Journalism')?.key === 'f:writing' && S.fieldOfDomain('Daily routine')?.key === 'f:life');
  ok('  and a vague one is no subject at all: the words decide', ['General', 'Personal decision', 'Personal decision-making', 'Decision making', 'Education', 'Other'].every((d) => S.fieldOfDomain(d) === null));
  const of = (o) => S.subjectOf(about(o));
  ok('  a vague name, and words that say: the words', of({ domain: 'Personal decision-making', title: 'Two job offers', asked: 'Which offer should I take — the salary or the team?' })?.key === 'f:careers' && of({ domain: 'General', title: 'Hello' }) === null);
  ok('the surest reading first: a study’s course over everything', of({ course: 'ACCT 2301 · Exam 2', domain: 'Economics', title: 'Supply' })?.key === 'c:acct2301');
  ok('  then a course code in its name or first question', of({ title: 'HIST 1301 essay plan', domain: 'Writing' })?.key === 'c:hist1301' && of({ asked: 'Can you explain chapter 3 of BIOL 1406?' })?.key === 'c:biol1406');
  ok('  then the field the map named, then the picture it drew', of({ domain: 'Accounting', viz: 'derivative' })?.key === 'f:accounting' && of({ viz: 'supply-demand' })?.key === 'f:economics' && of({ viz: 'distribution' })?.key === 'f:statistics');
  ok('  then its words, weighed: a name counts more than where it stands', of({ title: 'Why accrual basis matters' })?.key === 'f:accounting' && of({ title: 'Two job offers' })?.key === 'f:careers' && of({ title: 'Rent or buy a flat' })?.key === 'f:money' && of({ title: 'Cell division: mitosis vs meiosis' })?.key === 'f:biology');
  ok('  one word in passing is not enough; nothing clear is nothing', of({ stands: 'The salary is fine.' }) === null && of({ title: 'Thoughts on Tuesday' }) === null && of({}) === null);
  ok('  words that only look like a subject do not count: a taxonomy is not tax, a TV series not maths', of({ title: 'A taxonomy of birds' })?.key !== 'f:money' && of({ title: 'Best TV series to binge' })?.key !== 'f:mathematics');
  ok('two subjects are the same: the same key, or a course and the field it is in — never two courses by field alone', S.sameSubject({ key: 'c:acct2301', kind: 'course', field: 'accounting' }, { key: 'f:accounting', kind: 'field' }) && !S.sameSubject({ key: 'c:acct2301', kind: 'course', field: 'accounting' }, { key: 'c:acct2302', kind: 'course', field: 'accounting' }) && !S.sameSubject(null, { key: 'f:x', kind: 'field' }));
  ok('a Project’s subject: a course or field in its name, else what most of it is about', S.subjectOfProject('ACCT 2301', [])?.key === 'c:acct2301' && S.subjectOfProject('Job hunt', [])?.key === 'f:careers' && S.subjectOfProject('Spring stuff', [{ key: 'f:biology', name: 'Biology', kind: 'field' }, { key: 'f:biology', name: 'Biology', kind: 'field' }, null])?.key === 'f:biology' && S.subjectOfProject('Spring stuff', [{ key: 'f:biology', name: 'Biology', kind: 'field' }, null, null]) === null);
}

const projects = [
  { id: 'acct', name: 'ACCT 2301', color: 'clay', createdAt: 1 },
  { id: 'jobs', name: 'Job hunt', color: 'plum', createdAt: 2 },
  { id: 'side', name: 'Side ideas', createdAt: 3 },
  { id: 'old', name: 'Old', createdAt: 0, archived: true },
];
const convs = [
  conv('exam', 'Exam 2: adjusting entries', { project: 'acct', last: 1 * H, first: 2 * DAY, turns: 6, ideas: ['Adjusting entries', 'Accrual basis'] }),
  conv('accrual', 'Why accrual basis matters', { project: 'acct', last: 6 * DAY, first: 9 * DAY, ideas: ['Accrual basis', 'Cash basis'] }),
  conv('practice', 'Practice: prepaid rent', { project: 'acct', last: 1 * DAY, first: 3 * DAY, ideas: ['Prepaid rent', 'Accrual basis'] }),
  chat('debits', 'Debits vs credits, quickly', 3 * DAY),
  conv('offers', 'Two job offers', { project: 'jobs', last: 2 * DAY, first: 6 * DAY, turns: 5, ideas: ['Two job offers', 'Monthly runway'] }),
  chat('salary', 'Salary band research', 9 * DAY, 'jobs'),
  conv('rent', 'Rent or buy a flat', { last: 4 * DAY, first: 5 * DAY, turns: 4, ideas: ['Rent or buy', 'Monthly runway'] }),
  conv('budget', 'Monthly budget for next semester', { last: 10 * DAY, first: 11 * DAY, ideas: ['Monthly runway', 'Groceries'] }),
  chat('tax', 'Tax questions for freelancers', 5 * DAY),
  conv('supply', 'Why prices rise', { last: 2 * H, first: 3 * H, turns: 4, domain: 'Microeconomics', ideas: ['Supply and demand', 'Price elasticity'] }),
  conv('elastic', 'Price elasticity of demand', { last: 3 * DAY, first: 4 * DAY, viz: 'supply-demand', ideas: ['Price elasticity'] }),
  conv('cells', 'Cell division: mitosis vs meiosis', { last: 20 * DAY, first: 21 * DAY, turns: 5 }),
  conv('rust', 'Learn Rust or Go next', { last: 8 * DAY, first: 9 * DAY, turns: 2 }),
  conv('trip', 'Weekend trip ideas', { last: 70 * DAY, first: 71 * DAY, turns: 1 }),
  conv('blank', 'Thoughts on Tuesday', { last: 30 * DAY, first: 31 * DAY, turns: 1 }),
];
const tiles = S.tilesOf(convs);
const T = new Map(tiles.map((t) => [t.id, t]));
const A0 = S.emptyArrangement();
const homes = S.homesOf(tiles, projects, A0);
const home = (id) => homes.of.get(id);

console.log('\n=== hubs and dots ===');
{
  ok('a major session is a hub: a study, something made, three turns or more, a map that grew', S.isHub(T.get('exam')) && S.isHub(T.get('offers')) && S.isHub({ kind: 'logos', turns: 1, count: 0, made: 1, look: 'thinking' }) && S.isHub({ kind: 'logos', turns: 1, count: 0, made: 0, look: 'study' }) && S.isHub({ kind: 'logos', turns: 1, count: 6, made: 0, look: 'thinking' }));
  ok('a quick question stays a dot; a Core chat — known only by its name — is always one', !S.isHub(T.get('rust')) && !S.isHub(T.get('trip')) && !S.isHub(T.get('tax')) && !S.isHub({ kind: 'core', turns: 9, count: 9, made: 2, look: 'chat' }));
  ok('a hub is drawn by how much it holds, or how recent it is, or all alike; a dot is small', S.radiusOf(T.get('exam'), true, 'ideas', NOW) > S.radiusOf(T.get('practice'), true, 'ideas', NOW) && S.radiusOf(T.get('exam'), true, 'same', NOW) === 10 && S.radiusOf(T.get('rust'), false, 'ideas', NOW) < 5 && S.radiusOf(T.get('tax'), false, 'ideas', NOW) < S.radiusOf(T.get('rust'), false, 'ideas', NOW));
  ok('  within bounds', tiles.every((t) => { const r = S.radiusOf(t, true, 'ideas', NOW); return r >= 7 && r <= 14; }));
}

console.log('\n=== where each lives, by subject ===');
{
  ok('filed in a Project: there, whatever it is about', home('exam').key === 'p:acct' && home('offers').key === 'p:jobs' && home('salary').key === 'p:jobs');
  ok('about a Project’s subject but not filed: shown there, marked as suggested', home('debits').key === 'p:acct' && homes.suggested.has('debits') && !homes.suggested.has('exam'), J(home('debits')));
  ok('otherwise the subject it was read as: a field', home('rent').key === 'f:money' && home('budget').key === 'f:money' && home('tax').key === 'f:money' && home('supply').key === 'f:economics' && home('elastic').key === 'f:economics', J([home('rent'), home('supply')].map((h) => h.key)));
  ok('a single hub is a subject; a single quick question waits in everything else', home('cells').key === 'f:biology' && home('rust').key === 'other' && home('trip').key === 'other');
  ok('what nothing places is everything else', home('blank').key === 'other' && home('blank').name === 'Everything else');
  ok('every Project is a home, an empty one too; an archived one only while something is in it', homes.list.some((h) => h.key === 'p:side') && !homes.list.some((h) => h.key === 'p:old'));
  ok('Projects first, in the order made; then courses and fields, the fullest first; everything else last', J(homes.list.map((h) => h.key)) === J(['p:acct', 'p:jobs', 'p:side', 'f:money', 'f:economics', 'f:biology', 'other']), J(homes.list.map((h) => h.key)));
  ok('  in the person’s order where they gave one', S.homesOf(tiles, projects, { ...A0, groupOrder: ['f:economics', 'p:side'] }).list.slice(0, 3).map((h) => h.key).join() === 'f:economics,p:side,p:acct');
  const given = S.homesOf(tiles, projects, { ...A0, subjectOf: { rent: 'f:economics', supply: 'other', exam: 'f:money', rust: 'c:cosc1336' } });
  ok('a subject given by hand wins over what was read — but not over the Project it is filed in', given.of.get('rent').key === 'f:economics' && given.of.get('supply').key === 'other' && given.of.get('exam').key === 'p:acct');
  ok('  even one nothing else is in: named from its key', given.of.get('rust').key === 'c:cosc1336' && given.of.get('rust').name === 'COSC 1336');
  ok('every home with a colour that does not change; everything else none', homes.list.filter((h) => h.kind !== 'other').every((h) => typeof h.color === 'string') && J(S.homesOf(tiles, projects, A0).list.map((h) => h.color)) === J(homes.list.map((h) => h.color)) && homes.list.find((h) => h.key === 'other').color === null);
  ok('a Project’s own colour, or one of the six by its id', homes.list.find((h) => h.key === 'p:acct').color === 'clay' && S.PROJECT_COLOR_KEYS.includes(homes.list.find((h) => h.key === 'p:side').color));
  const course = S.homesOf(S.tilesOf([conv('c1', 'Notes for ECON 1301', { turns: 4 }), conv('c2', 'Inflation and interest rates', { turns: 4, ideas: ['Inflation', 'Monetary policy'] })]), [], A0);
  ok('a field joins the one course in it', course.of.get('c1').key === 'c:econ1301' && course.of.get('c2').key === 'c:econ1301', J([...course.of.values()].map((h) => h.key)));
  ok('with no Projects at all, everything still has a place', S.homesOf(tiles, undefined, A0).of.size === tiles.length && S.homesOf(tiles, undefined, A0).of.get('exam').key === 'f:accounting');
}

const ideas = S.sharedIdeas(tiles);
const lay = (lens, arr = A0, o = {}) => S.skyLayout({ lens, tiles: o.tiles ?? tiles, homes: o.homes ?? homes, ideas: o.ideas ?? ideas, arr, now: NOW, narrow: !!o.narrow });
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const named = (L) => L.nodes.filter((n) => !n.folded && n.named).map((n) => ({ id: n.id, ...S.nodeBox(n) }));

console.log('\n=== By subject ===');
{
  const L = lay('subject');
  const C = new Map(L.clusters.map((c) => [c.key, c]));
  ok('a cluster for every home, in its order — an empty Project too', J(L.clusters.map((c) => c.key)) === J(homes.list.map((h) => h.key)), J(L.clusters.map((c) => c.key)));
  ok('every conversation once, in its home’s cluster', L.nodes.length === tiles.length && L.nodes.every((n) => n.g === home(n.id).key));
  ok('a cluster says what it is and how many: Project, Subject, Mixed', C.get('p:acct').kicker === 'Project · 4' && C.get('f:money').kicker === 'Subject · 3' && C.get('other').kicker.startsWith('Mixed') && C.get('p:side').empty);
  ok('a suggested one is marked as such', L.byId.get('debits').suggested && C.get('p:acct').suggested.includes('debits'));
  ok('no two stars sit on each other’s words', named(L).every((a, i, all) => all.every((b, j) => j <= i || !overlap(a, b))), J(named(L).filter((a, i, all) => all.some((b, j) => j > i && overlap(a, b))).map((a) => a.id)));
  ok('no two clusters overlap', L.clusters.every((a, i) => L.clusters.every((b, j) => j <= i || !overlap(a, b))));
  ok('a cluster holds what is in it', L.nodes.every((n) => { const c = C.get(n.g); const b = S.nodeBox(n); return b.x >= c.x - 1 && b.y >= c.y - 1 && b.x + b.w <= c.x + c.w + 1 && b.y + b.h <= c.y + c.h + 1; }));
  const hubsIn = (g) => L.nodes.some((n) => n.g === g && n.hub);
  ok('hubs are named; beside hubs a dot waits to be pointed at; in a cluster of a few dots alone, each is named', L.nodes.every((n) => (n.hub ? n.named : n.named === !hubsIn(n.g))), J(L.nodes.filter((n) => !n.hub).map((n) => [n.id, n.g, n.named])));
  const many = S.tilesOf(Array.from({ length: 14 }, (_, i) => conv(`q${i}`, `Quick question ${i}`, { turns: 1, last: (i + 1) * H })));
  const M = S.skyLayout({ lens: 'subject', tiles: many, homes: S.homesOf(many, [], A0), ideas: [], arr: A0, now: NOW });
  ok('  but a field of many dots stays ambient', M.nodes.every((n) => !n.named));
  ok('a cluster’s hubs are joined in the order they were begun', J(L.chains.filter(([a]) => home(a).key === 'p:acct')) === J([['accrual', 'practice'], ['practice', 'exam']]), J(L.chains));
  ok('the same conversations and arrangement draw the same map', J(lay('subject')) === J(L));
  const more = S.tilesOf([...convs, conv('exam3', 'Exam 3: inventory and adjusting entries', { project: 'acct', last: 0.5 * H, first: 0.6 * H, turns: 4 })]);
  const L2 = lay('subject', A0, { tiles: more, homes: S.homesOf(more, projects, A0) });
  const moved = L.nodes.filter((n) => { const u = L2.byId.get(n.id); return u.x !== n.x || u.y !== n.y; }).map((n) => n.id);
  ok('a new conversation joins the end of its cluster; nothing already there moves', ['exam', 'accrual', 'practice', 'debits'].every((id) => !moved.includes(id)) && L2.byId.get('exam3').g === 'p:acct', J(moved));
  const acct = C.get('p:acct');
  const pinned = S.pinTile(A0, 'exam', 'p:acct', 700, 260);
  const P = lay('subject', pinned);
  ok('a pin is where the person put it, relative to its cluster', P.byId.get('exam').x === acct.origin.x + 700 && P.byId.get('exam').y === acct.origin.y + 260 && P.byId.get('exam').pinned);
  ok('  and its cluster grows to hold it', (() => { const c = P.clusters.find((x) => x.key === 'p:acct'); return c.x + c.w >= acct.origin.x + 700; })());
  ok('  only while it is in that cluster', !lay('subject', S.pinTile(A0, 'exam', 'f:money', 10, 10)).byId.get('exam').pinned);
  const onCell = S.pinTile(A0, 'practice', 'p:acct', S.hubCell(0, 2).x, S.hubCell(0, 2).y);
  const Q = lay('subject', onCell);
  ok('nothing lands on anything put by hand', named(Q).filter((b) => home(b.id).key === 'p:acct').every((a, i, all) => all.every((b, j) => j <= i || !overlap(a, b))));
  const moved2 = lay('subject', S.moveFrame(A0, 'p:acct', 300, 90));
  ok('a cluster moved by hand carries everything in it', L.nodes.filter((n) => n.g === 'p:acct').every((n) => { const u = moved2.byId.get(n.id); return u.x === n.x + 300 && u.y === n.y + 90; }));
  const folded = lay('subject', S.setFrame(A0, 'p:acct', { collapsed: true }));
  ok('a folded cluster holds its conversations out of sight', folded.nodes.filter((n) => n.g === 'p:acct').every((n) => n.folded) && folded.clusters.find((c) => c.key === 'p:acct').h < acct.h);
  ok('  and its name still says how many', folded.clusters.find((c) => c.key === 'p:acct').count === 4);
  const snapped = S.snapToCell(acct, S.hubCell(1, 2).x + 9, S.hubCell(1, 2).y - 7, true);
  ok('put down near a place, it snaps to that place', J(snapped) === J(S.hubCell(1, 2)));
  ok('the cluster a point is in — only one that takes conversations', S.clusterAt(L.clusters, acct.x + 10, acct.y + 10)?.key === 'p:acct' && S.clusterAt(L.clusters, -9999, -9999) === null);
  const N = lay('subject', A0, { narrow: true });
  const across = (c) => Math.max(0, ...Object.values(N.nodes.filter((n) => n.g === c.key && n.hub).reduce((m, n) => ((m[Math.round((n.y - c.origin.y) / S.HUB.h)] = (m[Math.round((n.y - c.origin.y) / S.HUB.h)] ?? 0) + 1), m), {})));
  ok('on a phone: two hubs across at most, one cluster under another', N.clusters.every((c, i) => i === 0 || c.y > N.clusters[i - 1].y) && N.clusters.every((c) => across(c) <= 2));
  const byName = lay('subject', { ...A0, sort: 'name' });
  ok('ordered as asked: by name — Exam, Practice, then Why on the next row', byName.byId.get('exam').x < byName.byId.get('practice').x && byName.byId.get('accrual').y > byName.byId.get('exam').y + S.HUB.h / 2);
}

console.log('\n=== By week ===');
{
  const L = lay('week');
  ok('newest first: this week, last week, then weeks back by their dates', L.clusters[0].name === 'This week' && L.clusters[1].name === 'Last week' && L.clusters.every((c, i) => i === 0 || c.key < L.clusters[i - 1].key || c.key.startsWith('m:')), J(L.clusters.map((c) => `${c.key} ${c.name}`)));
  ok('a week by its dates; months take over after eight weeks', S.periodOf(NOW, NOW).kicker === 'Oct 19 – 25' && S.periodOf(NOW - 14 * DAY, NOW).name === 'Oct 5 – 11' && S.periodOf(NOW - 14 * DAY, NOW).kicker === '2 weeks ago' && S.periodOf(NOW - 70 * DAY, NOW).kind === 'month' && S.periodOf(NOW - 70 * DAY, NOW).name === 'August');
  ok('  across a month’s end, both months; across a year, the year', S.weekRange(new Date(2026, 8, 28).getTime()) === 'Sep 28 – Oct 4' && S.periodOf(new Date(2025, 4, 3).getTime(), NOW).name === 'May 2025');
  ok('each conversation once, in the week it was last worked in', L.nodes.length === tiles.length && L.byId.get('exam').g === L.clusters[0].key && L.byId.get('trip').g.startsWith('m:'));
  ok('time keeps its own: a week cannot be moved, and nothing in it is pinned', L.clusters.every((c) => !c.movable) && !lay('week', S.pinTile(A0, 'exam', L.clusters[0].key, 900, 900)).byId.get('exam').pinned);
  ok('no two stars sit on each other’s words', named(L).every((a, i, all) => all.every((b, j) => j <= i || !overlap(a, b))));
}

console.log('\n=== Today’s learning ===');
{
  const plan = S.todayOf(tiles, homes, ideas, NOW);
  ok('today: what was worked on today, the latest first', plan.when === 'today' && J(plan.today.map((t) => t.id)) === J(['exam', 'supply']), J(plan.today.map((t) => t.id)));
  ok('round it, the earlier ones it builds on — an idea in common first', plan.ring.length > 0 && plan.ring[0].why.startsWith('shares') && plan.ring.some((r) => r.tile.id === 'accrual' && r.via === 'exam') && plan.ring.some((r) => r.tile.id === 'elastic' && r.via === 'supply'), J(plan.ring.map((r) => [r.tile.id, r.via, r.why])));
  ok('  then the same subject', plan.ring.some((r) => r.why.startsWith('also')));
  ok('  at most ten', S.todayOf(S.tilesOf(Array.from({ length: 30 }, (_, i) => conv(`x${i}`, `Accrual basis, part ${i}`, { last: (i + 2) * DAY, ideas: ['Accrual basis'] })).concat([conv('t0', 'Accrual basis today', { last: H, ideas: ['Accrual basis'] })])), S.homesOf([], [], A0), S.sharedIdeas(S.tilesOf(Array.from({ length: 30 }, (_, i) => conv(`x${i}`, `Accrual basis, part ${i}`, { last: (i + 2) * DAY, ideas: ['Accrual basis'] })).concat([conv('t0', 'Accrual basis today', { last: H, ideas: ['Accrual basis'] })]))), NOW).ring.length === S.RING_MAX);
  ok('everything else, beyond: every conversation once', plan.today.length + plan.ring.length + plan.rest.length === tiles.length);
  const before = S.todayOf(tiles, homes, ideas, NOW + 2 * DAY);
  ok('nothing yet today: the last day something was worked on', before.when === 'last' && J(before.today.map((t) => t.id)) === J(['exam', 'supply']));
  ok('nothing at all: nothing', S.todayOf([], homes, [], NOW).when === 'none');
  const L = lay('today');
  const mid = L.clusters.find((c) => c.key === 't:today');
  ok('today’s in the middle, all named as stars', L.nodes.filter((n) => n.g === 't:today').every((n) => n.focus && n.named && n.hub) && mid.x < 0 && mid.x + mid.w > 0);
  ok('the ring round it: each joined to the one of today’s it leads to, named, its words on the outer side', L.nodes.filter((n) => n.g === 't:ring').every((n) => n.via && n.named && (n.side === 'left' ? n.x < mid.x + mid.w / 2 : true)));
  ok('nothing else is drawn: no field of everything else, no subjects round it — a day is a day', plan.rest.length > 0 && L.nodes.every((n) => n.g === 't:today' || n.g === 't:ring') && L.nodes.length === plan.today.length + plan.ring.length && L.sectors.length === 0 && !L.clusters.some((c) => c.key === 't:rest'));
  ok('the view is fitted to today and its ring, all of it', J(L.focus) === J(L.bounds) && L.nodes.every((n) => n.x >= L.bounds.x && n.x <= L.bounds.x + L.bounds.w));
  ok('no named star on another’s words', named(L).every((a, i, all) => all.every((b, j) => j <= i || !overlap(a, b))), J(named(L).filter((a, i, all) => all.some((b, j) => j > i && overlap(a, b))).map((a) => a.id)));
  const N = lay('today', A0, { narrow: true });
  ok('on a phone, read top to bottom: today, then what it builds on — every one of those named', J(N.clusters.map((c) => c.key)) === J(['t:today', 't:ring']) && N.clusters.every((c, i) => i === 0 || c.y > N.clusters[i - 1].y) && N.nodes.filter((n) => n.g === 't:ring').every((n) => n.named));
}

console.log('\n=== what they share, named between them ===');
{
  // (Today draws none: its ring already says why each is there)
  for (const lens of ['subject', 'week']) {
    const L = lay(lens);
    const placed = S.placeSkyIdeas(ideas, L);
    const solid = [...L.nodes.filter((n) => !n.folded).map((n) => S.nodeBox(n)), ...L.clusters.filter((c) => !c.open).map((c) => c.head)];
    ok(`${lens}: each idea written where it sits on no star, no name and no other idea`, placed.length === ideas.length && placed.every((p, i) => !solid.some((s) => overlap(s, p)) && placed.every((q, j) => j <= i || !overlap(p, q))), `${placed.length}/${ideas.length}`);
  }
  ok('a theme runs across subjects: monthly runway, from a Project to Money', ideas.some((i) => i.theme && i.members.includes('offers') && i.members.includes('rent')));
}

console.log(`\nlogos5-spatial: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
