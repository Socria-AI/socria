// LOGOS 5 — WHERE EACH CONVERSATION LIVES, AND WHAT TODAY IS.
//
// lib/logos5/subjects.ts reads what a conversation is about; lib/logos5/
// spatial.ts says what the Universal Map is drawn from (the PRD "Clearer
// Structures and UI": past sessions as nodes, major ones as hubs and quick
// questions as ambient dots, grouped by subject; bubbles.ts draws them).
// Held down here:
//   • nobody has to file anything: a course in a study, a course code, the
//     field the map named, the picture it drew or the words it uses place a
//     conversation; what nothing places is "everything else", never a guess
//     dressed up as a subject; a Project is the person's own word and wins;
//     a conversation about a Project's subject is shown there, marked, never
//     filed without them; a lone quick question is not a subject yet;
//   • a hub is a major session, a dot a quick one; a Core chat is a dot;
//   • Today: what was worked on today, and the earlier ones it builds on — a
//     conversation the person linked to one of today's first, then an idea in
//     common, then the same subject — at most ten; with nothing today yet, the
//     last day worked on;
//   • a name the map gives that is a field already here is that field, and a
//     vague one is no subject at all;
//   • an idea that keeps coming back runs across subjects.

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
  ok('how much one holds, 0 to 1: a study with much in it more than a few turns', S.depthOf(T.get('exam')) > S.depthOf(T.get('practice')) && tiles.every((t) => S.depthOf(t) >= 0 && S.depthOf(t) <= 1));
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
  const linked = S.todayOf(tiles, homes, ideas, NOW, [{ a: 'cells', b: 'exam' }]);
  ok('what the person linked to one of today’s comes first of all, whatever its subject', linked.ring[0].tile.id === 'cells' && linked.ring[0].via === 'exam' && linked.ring[0].why === 'you linked these', J(linked.ring.slice(0, 2).map((r) => [r.tile.id, r.why])));
  ok('  a link between two not of today brings neither', !S.todayOf(tiles, homes, ideas, NOW, [{ a: 'cells', b: 'trip' }]).ring.some((r) => r.tile.id === 'cells' || r.tile.id === 'trip'));
}

console.log('\n=== what they share ===');
{
  ok('a theme runs across subjects: monthly runway, from a Project to Money', ideas.some((i) => i.theme && i.members.includes('offers') && i.members.includes('rent')));
}

console.log(`\nlogos5-spatial: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
