// test/teaching.test.mjs — Teaching & Assessment Intelligence (lib/teaching): reading course materials,
// what they show, the evidence for it, how sure it can be, keeping a profile up to date, and using it.
// The materials are an invented course (test/fixtures/course-materials.mjs).

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as T from './.tmp/teaching.mjs';
import * as F from './fixtures/course-materials.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
let failed = 0;
let passed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) passed++;
  else failed++;
  console.log(`${cond ? '  ✓' : '  ✗'} ${name}${!cond && detail ? `\n      ${detail}` : ''}`);
};
const now = 1_790_000_000_000;
const norm = (s) => s.replace(/\s+/g, ' ').trim();

const docs = { syllabus: F.syllabus(), slides: F.slides(), mt1: F.midterm1(), mt2: F.midterm2(), quiz: F.quiz(), lee: F.otherSection() };
const dig = Object.fromEntries(Object.entries(docs).map(([k, d]) => [k, T.digestMaterial(d, { now, ...(k === 'mt1' || k === 'mt2' || k === 'quiz' ? { allowed: true } : {}) })]));

console.log('\n=== material ingestion ===');
ok('each material is recognised for what it is', dig.syllabus.material.kind === 'syllabus' && dig.slides.material.kind === 'slides' && dig.mt1.material.kind === 'exam' && dig.mt2.material.kind === 'exam' && dig.quiz.material.kind === 'quiz' && dig.lee.material.kind === 'exam', JSON.stringify(Object.fromEntries(Object.entries(dig).map(([k, d]) => [k, d.material.kind]))));
ok('the person can say otherwise, and that is kept as theirs', (() => {
  const g = T.digestMaterial(docs.slides, { now, kind: 'notes' });
  return g.material.kind === 'notes' && g.material.kindFrom === 'person' && dig.slides.material.kindFrom === 'read';
})());
ok('the course code is read whole, from the file and from a spaced-out file name', dig.syllabus.material.course === 'ECO 304K' && dig.mt1.material.course === 'ECO 304K' && T.courseCodeIn('ECO 304 K Syllabus') === 'ECO 304K' && T.courseCodeIn('Fall 2025 exam') === null);
ok('the instructor is read from a label, never across a line break', dig.syllabus.material.instructor === 'Jane Smith' && T.instructorIn('Instructor: Dr. Jane Smith\nFall 2026') === 'Jane Smith' && dig.lee.material.instructor === 'Daniel Lee');
ok('the term orders materials in time; "Quiz 3" alone does not', dig.mt1.material.term === 'Fall 2025' && dig.mt2.material.term === 'Spring 2026' && dig.mt1.material.order < dig.mt2.material.order && dig.quiz.material.order === undefined);
ok('a title beside the course code is kept', dig.syllabus.material.title === 'Introduction to Microeconomics', dig.syllabus.material.title);
ok('past exams are only used with the person’s word that they may be', dig.mt1.material.allowed === true && T.NEEDS_PERMISSION.has('exam') && T.NEEDS_PERMISSION.has('quiz') && !T.NEEDS_PERMISSION.has('slides'));
ok('an exam is cut into its questions', dig.mt1.units.length === 6 && dig.mt1.units.every((u) => u.kind === 'item') && dig.mt1.units.map((u) => u.label).join() === 'Q1,Q2,Q3,Q4,Q5,Q6');
ok('instructions at the top are not a question', !dig.mt1.units.some((u) => /Time allowed/.test(u.quote)));
ok('options are options, and parts are parts', (() => {
  const q1 = dig.mt1.units[0];
  const q4 = dig.mt1.units[3];
  return q1.codes.includes('format.mcq') && q4.codes.includes('format.free') && q4.codes.includes('parts.3') && !q4.codes.includes('format.mcq');
})(), JSON.stringify(dig.mt1.units.map((u) => u.codes)));
ok('options and parts written on the question’s own line are told apart (as Markdown and some PDFs hold an exam)', (() => {
  const inline = F.doc('Quiz inline.md', [[
    ['title', 'ECO 304K Quiz 4'],
    ['list', '1. Which of the following is NOT a determinant of supply? (1 point) a) input prices b) technology c) consumer income d) expectations'],
    ['list', '2. Suppose demand is Qd = 100 - P and supply is Qs = P - 20. (6 points) (a) Calculate the equilibrium price. (b) Draw the market and label the equilibrium.'],
  ]]);
  const g = T.digestMaterial(inline, { now, allowed: true });
  const [q1, q2] = g.units;
  return g.units.length === 2 && q1.codes.includes('format.mcq') && q1.codes.includes('trap.negation') && q2.codes.includes('format.free') && q2.codes.includes('parts') && q2.codes.includes('format.calc') && q2.codes.includes('graph') && T.lettered('Plan B) is fine').options === 0;
})(), JSON.stringify(T.digestMaterial(F.doc('x.md', [[['list', '1. Which of the following is NOT a determinant of supply? a) input prices b) technology c) consumer income d) expectations']]]), { now }).units.map((u) => u.codes)));
ok('the points a question is worth are read', dig.mt1.units[3].points === 10 && dig.mt1.units[0].points === 2);
ok('the thinking a question asks for comes from its own verbs, not from its options', (() => {
  const create = dig.mt2.units[1]; // "Which of the following is NOT true…" with an option "It creates a surplus"
  return !create.codes.includes('bloom.create') && dig.quiz.units[0].codes.includes('bloom.remember') && dig.mt1.units[3].codes.includes('bloom.apply');
})(), JSON.stringify(dig.mt2.units[1].codes));
ok('traps are read from the wording', dig.mt1.units[2].codes.includes('trap.negation') && dig.mt1.units[0].codes.includes('trap.contrast') && dig.mt1.units[5].codes.includes('trap.best') && dig.mt1.units[1].codes.includes('trap.allabove') && !dig.mt1.units[1].codes.includes('trap.absolute'));
ok('graphs and numbers are noticed', dig.mt2.units[3].codes.includes('graph') && dig.mt2.units[3].codes.includes('num') && dig.mt1.units[3].codes.includes('graph'));
ok('slides are cut one a slide, and each says how it opens', dig.slides.units.length === 8 && dig.slides.units[1].codes.includes('intro.example') && dig.slides.units[2].codes.includes('intro.definition') && dig.slides.units[6].codes.includes('intro.question'));
ok('“Lecture 5 notes” is notes, cut by its headings; a one-page deck is cut by headings too', (() => {
  const notes = F.doc('Lecture5_Elasticity_notes.md', [[['heading', 'Lecture 5: Elasticity', 1], ['heading', 'Example: coffee', 2], ['paragraph', 'Suppose the price of coffee rises from $2 to $3 and quantity falls from 100 to 80.'], ['heading', 'Price elasticity of demand', 2], ['paragraph', 'Price elasticity of demand (PED) is defined as the percentage change in quantity demanded divided by the percentage change in price.']]], 'md');
  const g = T.digestMaterial(notes, { now });
  const deck = T.digestMaterial(notes, { now, kind: 'slides' });
  return g.material.kind === 'notes' && g.units.length >= 2 && deck.units.length >= 2 && T.kindOf({ ...notes, name: 'Lecture 5.pptx', format: 'pptx' }) === 'slides';
})());
ok('a "Learning objectives:" line is not mistaken for a definition', !dig.slides.units[0].codes.includes('intro.definition'));
ok('abbreviations and defined terms are gathered', dig.slides.abbreviations.some(([a, p]) => a === 'PED' && p === 'price elasticity of demand') && dig.quiz.defined.includes('consumer surplus'));
ok('the syllabus’s own statements are kept, each with its passage', ['stated.format.mcq', 'stated.format.free', 'stated.graphs', 'stated.calculator', 'stated.cumulative'].every((c) => dig.syllabus.stated.some((s) => s.code === c)) && dig.syllabus.stated.every((s) => s.evidence.doc === docs.syllabus.id));
ok('copied wording can be checked without keeping the wording: each question keeps hashes of its five-word runs', dig.mt1.units.every((u) => Array.isArray(u.shingles) && u.shingles.length > 0 && u.shingles.every(Number.isInteger)));
ok('a digest is bounded', Object.values(dig).every((d) => d.units.length <= 60 && d.units.every((u) => u.terms.length <= 30 && (u.shingles?.length ?? 0) <= 80 && u.quote.length <= 160)));

console.log('\n=== what the materials show ===');
let p = T.newProfile({ course: 'My course' }, now);
for (const k of ['syllabus', 'slides', 'mt1', 'mt2', 'quiz']) p = T.addMaterial(p, dig[k], now + 1);
const obs = (id) => p.observations.find((o) => o.id === id);
ok('the profile takes the course’s name, title and instructor from the materials', p.course === 'ECO 304K' && p.title === 'Introduction to Microeconomics' && p.instructor === 'Jane Smith');
ok('formats are counted across every past question', obs('formats:mcq')?.said === '9 of 15 past questions are multiple choice' && obs('formats:free')?.said === '6 of 15 past questions are free response', JSON.stringify([obs('formats:mcq')?.said, obs('formats:free')?.said]));
ok('where the marks are, when the materials say', /Free-response questions carry 77% of the marks/.test(obs('formats:points-free')?.said ?? ''), obs('formats:points-free')?.said);
ok('graphs, numbers and traps are counted', obs('graphs:frequent')?.said === '8 of 15 questions use or ask for a graph or diagram' && !!obs('numeric:some') && !!obs('wording:negation') && !!obs('wording:allabove'));
ok('a change over time is seen, and said to be ordered by the terms the files name', !!obs('trend:format.free-more') && /2 of 6 → 4 of 6/.test(obs('trend:format.free-more').said) && /terms the files name/.test(obs('trend:format.free-more').caveat ?? ''));
ok('what keeps coming up leads with the course’s own phrases', /^What past questions keep coming back to: consumer surplus/.test(obs('topics:recurring')?.said ?? ''), obs('topics:recurring')?.said);
ok('the course’s vocabulary, with its abbreviations', obs('terms:vocabulary')?.terms?.[0] === 'consumer surplus' && /price elasticity of demand \(PED\)/.test(obs('terms:vocabulary')?.said ?? ''));
ok('teaching from slides alone says what slides cannot show', /Slides are compact by nature/.test(obs('depth:compact')?.caveat ?? ''));
ok('ideas taken together are found', /demand with price/.test(obs('links:pairs')?.said ?? ''));

console.log('\n=== observed, stated, inferred ===');
ok('counts are observed', ['formats:mcq', 'graphs:frequent', 'wording:negation', 'trend:format.free-more'].every((id) => obs(id)?.basis === 'observed'));
ok('patterns read from counts are inferred', ['difficulty:mixed', 'recall:understand', 'depth:compact'].every((id) => obs(id)?.basis === 'inferred'), JSON.stringify(p.observations.filter((o) => o.basis === 'inferred').map((o) => o.id)));
ok('what the syllabus says is stated, and checked against the exams', obs('formats:stated.format.mcq')?.basis === 'stated' && /Matches what your past exams show \(9 of 15/.test(obs('formats:stated.format.mcq')?.caveat ?? ''));
ok('a syllabus statement about teaching is never more than low confidence', p.observations.filter((o) => o.basis === 'stated' && T.SIDE_OF_DIMENSION[o.dimension] === 'teaching').every((o) => o.confidence === 'low'));
ok('a syllabus alone is never a teaching style', (() => {
  let s = T.newProfile({ course: 'X' }, now);
  s = T.addMaterial(s, dig.syllabus, now);
  return s.observations.length > 0 && s.observations.every((o) => o.basis === 'stated' && o.confidence !== 'high') && s.observations.every((o) => !!o.caveat) && !s.observations.some((o) => o.dimension === 'depth' || o.dimension === 'intro');
})());
ok('the syllabus says something the exams do not show: said so', (() => {
  let s = T.newProfile({ course: 'X' }, now);
  s = T.addMaterial(s, T.digestMaterial(docs.syllabus, { now }), now);
  s = T.addMaterial(s, T.digestMaterial(docs.quiz, { now, allowed: true }), now);
  const free = s.observations.find((o) => o.id === 'formats:stated.format.free');
  return /Not seen in the past exams/.test(free?.caveat ?? '');
})());

console.log('\n=== evidence ===');
const byId = Object.fromEntries(Object.values(docs).map((d) => [d.id, d]));
const allEvidence = [...p.observations.flatMap((o) => o.evidence.map((e) => [o.id, e])), ...p.concepts.flatMap((c) => c.evidence.map((e) => [c.term, e]))];
const badEv = allEvidence.filter(([, e]) => {
  const d = byId[e.doc];
  const b = d?.blocks.find((x) => x.id === e.block);
  if (!b || b.page !== e.page) return true;
  const quote = norm(e.quote).replace(/…$/, '');
  return !norm(b.text).includes(quote) && !norm(d.blocks.filter((x) => x.page === b.page).map((x) => x.text).join(' ')).includes(quote);
});
ok('every piece of evidence is a real passage in a real material, in its own words, on its page', allEvidence.length > 40 && badEv.length === 0, JSON.stringify(badEv.slice(0, 3)));
ok('evidence is spread across materials before it repeats one', (() => {
  const o = obs('formats:mcq');
  const first3 = new Set(o.evidence.slice(0, 3).map((e) => e.doc));
  return first3.size === 3;
})());
ok('every observation says how much supports it, out of how much could have', p.observations.every((o) => o.support.units >= 1 && o.support.of >= o.support.units - 0 && o.support.materials >= 1 && o.evidence.length >= 1 && o.evidence.length <= 6));
ok('an exam question’s evidence names the question', obs('wording:negation').evidence.every((e) => /^Q\d+$/.test(e.unit ?? '')));

console.log('\n=== confidence ===');
const c = (units, materials, basis = 'observed', consistency = 1, side = 'assessment') => T.calibrate({ units, of: units, materials, basis, consistency, side });
ok('more separate evidence, surer', c(2, 2).score < c(5, 2).score && c(5, 2).score < c(12, 2).score);
ok('more materials, surer', c(6, 1).score < c(6, 2).score && c(6, 2).score < c(6, 3).score);
ok('less consistent, less sure', c(8, 3, 'inferred', 0.5).score < c(8, 3, 'inferred', 0.9).score);
ok('one place is never more than low', c(1, 1).confidence === 'low' && c(1, 3).confidence === 'low');
ok('one material, or fewer than four places, is never high', c(30, 1).confidence !== 'high' && c(3, 3).confidence !== 'high');
ok('observed counts are surer than inferences, and inferences than what a syllabus says', c(8, 3).score > c(8, 3, 'inferred').score && c(8, 3, 'inferred').score > c(8, 3, 'stated').score);
ok('a stated claim is capped: low about teaching, moderate about assessment', c(20, 3, 'stated', 1, 'teaching').confidence === 'low' && c(20, 3, 'stated', 1, 'assessment').confidence === 'moderate');
ok('the same pattern grows surer as materials come in', (() => {
  let a = T.newProfile({ course: 'X' }, now);
  a = T.addMaterial(a, dig.mt1, now);
  const one = a.observations.find((o) => o.id === 'formats:mcq');
  a = T.addMaterial(a, dig.mt2, now);
  a = T.addMaterial(a, dig.quiz, now);
  const three = a.observations.find((o) => o.id === 'formats:mcq');
  return one && three && three.score > one.score && one.confidence !== 'high' && three.confidence === 'high';
})());

console.log('\n=== keeping a profile up to date ===');
ok('adding a material records it, and what it changed', p.history.some((h) => h.kind === 'added' && /Quiz 3/.test(h.said)) && p.history.some((h) => h.kind === 'stronger' || h.kind === 'new'));
ok('the same file added again replaces itself, never twice', (() => {
  const again = T.addMaterial(p, dig.quiz, now + 5);
  return again.digests.length === p.digests.length && again.history[0].said.startsWith('Read again');
})());
ok('removing a material works everything out again', (() => {
  const less = T.removeMaterial(p, docs.mt2.id, now + 6);
  return less.digests.length === 4 && !less.observations.some((o) => o.dimension === 'trend') && less.history[0].kind === 'removed';
})());
ok('a shift in a share is said with its numbers', (() => {
  const before = [{ id: 'graphs:frequent', dimension: 'graphs', code: 'graphs.frequent', said: 'x', basis: 'observed', confidence: 'moderate', score: 0.4, support: { units: 2, of: 10, materials: 1, kinds: [] }, evidence: [], share: 0.2 }];
  const after = [{ ...before[0], said: '9 of 20 questions use or ask for a graph or diagram', share: 0.45 }];
  const ch = T.changesBetween(before, after, now);
  return ch.length === 1 && ch[0].kind === 'shifted' && /20% → 45%/.test(ch[0].said);
})());
ok('the student has the last word: marked wrong, it is kept, marked and never used', (() => {
  const q = T.correct(p, 'graphs:frequent', 'wrong', now + 7, 'Our exams never have graphs');
  return q.corrections['graphs:frequent'].verdict === 'wrong' && q.observations.some((o) => o.id === 'graphs:frequent') && !T.inForce(q).some((o) => o.id === 'graphs:frequent') && q.history[0].kind === 'corrected';
})());
ok('a correction outlasts the profile being worked out again (a file removed and added back)', (() => {
  const q = T.correct(p, 'graphs:frequent', 'wrong', now + 7, 'Our exams never have graphs');
  const r = T.addMaterial(T.removeMaterial(q, docs.quiz.id, now + 8), dig.quiz, now + 9);
  return r.observations.some((o) => o.id === 'graphs:frequent') && r.corrections['graphs:frequent']?.verdict === 'wrong' && !T.inForce(r).some((o) => o.id === 'graphs:frequent');
})());
ok('…and a correction can be taken back', (() => {
  const q = T.restore(T.correct(p, 'graphs:frequent', 'wrong', now + 7), 'graphs:frequent', now + 8);
  return !q.corrections['graphs:frequent'] && T.inForce(q).some((o) => o.id === 'graphs:frequent') && q.history[0].kind === 'restored';
})());
ok('a profile survives being stored and read back, exactly', JSON.stringify(T.sanitizeProfile(JSON.parse(JSON.stringify(p)))) === JSON.stringify(p));
ok('anything malformed is dropped, never trusted', (() => {
  const bad = JSON.parse(JSON.stringify(p));
  bad.observations[0].evidence[0].doc = '../../etc';
  bad.observations[1].code = 'DROP TABLE';
  bad.digests[0].units[0].block = 'p1.1; drop';
  bad.corrections = { 'graphs:frequent': { verdict: 'maybe' } };
  const s = T.sanitizeProfile(bad);
  return s && s.observations[0].evidence.length === p.observations[0].evidence.length - 1 && s.observations.length === p.observations.length - 1 && s.digests[0].units.length === p.digests[0].units.length - 1 && !s.corrections['graphs:frequent'] && T.sanitizeProfile({ v: 2 }) === null && T.sanitizeProfiles('nope').length === 0;
})());

console.log('\n=== courses and instructors ===');
ok('one key per course and instructor', T.profileKey('ECO 304K', 'Jane Smith') === 'eco-304k~smith' && T.profileKey('ECO 304K') === 'eco-304k' && T.profileKey('ECO 304K', 'Daniel Lee') !== T.profileKey('ECO 304K', 'Jane Smith'));
ok('another instructor’s section is not this profile', T.matchProfile([p], dig.lee.material) === null);
ok('a file that names no instructor joins the course’s profile', T.matchProfile([p], { course: 'ECO 304K' })?.id === p.id && T.matchProfile([p], { course: 'MATH 408C' }) === null);
ok('…unless two instructors’ profiles of that course exist, when it is the person’s choice', (() => {
  let lee = T.newProfile({ course: 'ECO 304K', instructor: 'Daniel Lee' }, now);
  lee = T.addMaterial(lee, dig.lee, now);
  return T.matchProfile([p, lee], { course: 'ECO 304K' }) === null && T.matchProfile([p, lee], dig.lee.material)?.id === lee.id;
})());
ok('a past exam is not used until the person says they may use it', (() => {
  let lee = T.newProfile({ course: 'ECO 304K', instructor: 'Daniel Lee' }, now);
  lee = T.addMaterial(lee, dig.lee, now); // read without their word
  const before = lee.observations.length;
  lee = T.allowMaterial(lee, docs.lee.id, true, now + 1);
  return before === 0 && lee.observations.some((o) => o.id === 'formats:essay') && lee.history[0].said.startsWith('Now used') && T.usable(lee.digests[0]);
})());
ok('two instructors of one course read differently', (() => {
  let lee = T.newProfile({ course: 'ECO 304K', instructor: 'Daniel Lee' }, now);
  lee = T.addMaterial(lee, T.digestMaterial(docs.lee, { now, allowed: true }), now);
  const essay = lee.observations.find((o) => o.id === 'formats:essay');
  const recall = lee.observations.find((o) => o.dimension === 'recall');
  return essay && /3 of 3/.test(essay.said) && recall?.code === 'recall.apply' && !lee.observations.some((o) => o.id === 'formats:mcq');
})());
ok('a label for a profile', T.profileLabel(p) === 'ECO 304K · Smith');

console.log('\n=== which course a turn is in ===');
let lee = T.newProfile({ course: 'ECO 304K', instructor: 'Daniel Lee' }, now);
lee = T.addMaterial(lee, T.digestMaterial(docs.lee, { now, allowed: true }), now);
let math = T.newProfile({ course: 'MATH 408C' }, now);
const both = [p, lee];
ok('the person’s choice for the conversation comes first', T.courseFor(both, { linked: lee.id, text: 'consumer surplus and deadweight loss' })?.profile.id === lee.id && T.courseFor(both, { linked: lee.id })?.why === 'linked');
ok('courses turned off in a conversation stay off', T.courseFor(both, { linked: 'off', docs: [docs.mt1.id], text: 'ECO 304K consumer surplus' }) === null);
ok('else the course whose materials are in the conversation', T.courseFor(both, { docs: [docs.mt2.id] })?.profile.id === p.id && T.courseFor(both, { docs: [docs.mt2.id] })?.why === 'materials');
ok('else the course a message names — when only one profile has that name', T.courseFor([p, math], { text: 'help with my eco 304k problem set' })?.why === 'named' && T.courseFor(both, { text: 'help with my ECO 304K problem set' }) === null);
ok('else, when it is unmistakable, the course the message is about', T.courseFor([p, math], { text: 'why does a price ceiling create a deadweight loss and change consumer surplus?' })?.why === 'topic' && T.courseFor([p, math], { text: 'what should I cook tonight?' }) === null);
ok('two courses equally likely: neither is guessed', T.courseFor(both, { text: 'consumer surplus' }) === null);

console.log('\n=== what travels with a turn ===');
const pack = T.packOf(p, 'materials');
ok('the pack carries codes, terms, abbreviations and concepts — no passages', pack.codes.length > 5 && pack.terms.includes('consumer surplus') && pack.abbr.some(([a]) => a === 'PED') && pack.concepts.length > 3 && !JSON.stringify(pack).includes('Which of the following'));
ok('an observation the student marked wrong never travels', (() => {
  const q = T.correct(p, 'graphs:frequent', 'wrong', now);
  return !T.packOf(q, 'linked').codes.some((x) => x.code === 'graphs.frequent') && pack.codes.some((x) => x.code === 'graphs.frequent');
})());
ok('copied wording is measured by hashes of past questions only — never slides, never the words', pack.avoid.length > 0 && pack.avoid.length <= 600 && pack.avoid.every(Number.isInteger) && T.packOf((() => { let x = T.newProfile({ course: 'X' }, now); return T.addMaterial(x, dig.slides, now); })(), 'linked').avoid.length === 0);
ok('a pack read on the server is the pack sent', JSON.stringify(T.sanitizeCoursePack(JSON.parse(JSON.stringify(pack)))) === JSON.stringify(pack));
ok('a pack that does not hold together is nothing, and odd characters never reach the prompt', (() => {
  const bad = { ...pack, id: 'DROP TABLE;', label: 'x' };
  const odd = T.sanitizeCoursePack({ ...pack, label: 'ECO <script>alert(1)</script>', terms: ['ok term', '`rm -rf`', 'x'], codes: [{ code: 'BAD CODE', c: 'high', b: 'observed' }, ...pack.codes.slice(0, 2)] });
  return T.sanitizeCoursePack(bad) === null && T.sanitizeCoursePack('nope') === null && odd && !/[<>`]/.test(odd.label + odd.terms.join()) && odd.codes.length === 2 && !odd.terms.includes('x');
})());
ok('a pack is bounded', (() => {
  const big = T.sanitizeCoursePack({ ...pack, codes: Array.from({ length: 100 }, () => pack.codes[0]), avoid: Array.from({ length: 5000 }, (_, i) => i), terms: Array.from({ length: 50 }, (_, i) => `term number ${i}`) });
  return big.codes.length === T.PACK_LIMITS.codes && big.avoid.length === T.PACK_LIMITS.avoid && big.terms.length === T.PACK_LIMITS.terms;
})());

console.log('\n=== the student, against the course ===');
const DAY = 86_400_000;
const ledger = [
  { topic: 'consumer surplus', seen: 4, right: 1, wrong: 3, last: now - 2 * DAY, box: 0, failed: ['analogy'] },
  { topic: 'price elasticity of demand', seen: 5, right: 4, wrong: 0, last: now - 40 * DAY, box: 3 },
  { topic: 'equilibrium price', seen: 3, right: 3, wrong: 0, last: now - DAY / 2, box: 4 },
];
const L = T.learnerOf(pack, ledger, now);
ok('what they got wrong, among what the course stresses', L.weak.includes('consumer surplus'));
ok('what is due for review, by the ledger’s own clock', L.due.includes('consumer surplus') || L.due.some((t) => /elasticity/.test(t)));
ok('what they hold', L.strong.includes('equilibrium price'));
ok('what the course stresses and they have not met', L.unseen.includes('price ceiling') && !L.unseen.includes('consumer surplus'));
ok('the way in that left them lost, by concept', L.lostWith.some((l) => l.term === 'consumer surplus' && l.approaches.includes('analogy')));

console.log('\n=== explanations in the course’s way ===');
const examplesFirst = { ...pack, codes: [...pack.codes, { code: 'intro.example-first', c: 'moderate', b: 'inferred' }, { code: 'trap.contrast', c: 'moderate', b: 'observed' }] };
const lean = T.courseLean(examplesFirst, 'what is consumer surplus?');
ok('the planner is told how the course opens, that it draws, that it contrasts — and its terms', lean.opens === 'example' && lean.draws === true && lean.contrasts === true && lean.terms?.includes('consumer surplus'), JSON.stringify(lean));
ok('a low-confidence reading leans nothing', T.courseLean({ ...pack, codes: [{ code: 'intro.example-first', c: 'low', b: 'inferred' }] }).opens === undefined);
const learnG = T.renderCourseGuidance(examplesFirst, { text: 'What is consumer surplus and why does a price ceiling change it?', topic: 'consumer surplus', practice: false, learning: true, ledger, now });
ok('a learning turn: the course’s terms, its way of opening, what it keeps coming back to', /THIS COURSE — ECO 304K · Smith/.test(learnG) && /consumer surplus/.test(learnG) && /concrete example before the general idea/.test(learnG) && /keeps coming back to \(6 past questions\)/.test(learnG), learnG);
ok('…and where this student struggled with it, and the way in to avoid', /got consumer surplus wrong before/.test(learnG) && /lost after an analogy/.test(learnG), learnG);
ok('the block says what it is: how the course has taught and asked, never what it will ask', /never what it will ask/.test(learnG));
ok('small talk gets no course block', T.renderCourseGuidance(pack, { text: 'thanks!', practice: false, learning: false, ledger, now }) === '');

console.log('\n=== practice in the course’s style, aimed at the student ===');
const spec = T.practiceSpec(pack, L, []);
ok('formats as the course’s past questions run', Math.abs(spec.formats.mcq - 0.6) < 0.01 && Math.abs(spec.formats.free - 0.4) < 0.01 && spec.parts, JSON.stringify(spec.formats));
ok('the demands: graphs and numbers at their share; the traps the course uses', spec.graphs > 0.5 && spec.numbers > 0.2 && spec.traps.includes('trap.negation') && spec.traps.includes('trap.allabove'));
ok('aimed first at what they got wrong, then what is due, then what the course asks and they have not practised', spec.targets[0].term === 'consumer surplus' && /got it wrong before/.test(spec.targets[0].why) && spec.targets.length <= 3, JSON.stringify(spec.targets));
ok('what they asked to practise comes first of all', T.practiceSpec(pack, L, ['price ceiling']).targets[0].term === 'price ceiling');
ok('the way in that lost them is avoided in feedback', spec.avoid.some((a) => a.term === 'consumer surplus'));
const practiceG = T.renderCourseGuidance(pack, { text: 'Quiz me in the style of ECO 304K — one question at a time.', practice: true, learning: true, ledger, now });
ok('the practice block: formats, demands, traps, difficulty, targets', /about 3 in 5 multiple choice/.test(practiceG) && /graph or diagram \(53% of past questions\)/.test(practiceG) && /NOT or EXCEPT/.test(practiceG) && /Difficulty: the course's level is a mix/.test(practiceG) && /start one step easier/.test(practiceG) && /Aim first at: consumer surplus/.test(practiceG), practiceG);
ok('…never the course’s wording, never a claim about an exam', /never the wording of the course’s own questions/.test(practiceG) && /never say or suggest that a question will be on their exam/.test(practiceG));
ok('the block is short enough to sit in every practice turn', practiceG.length < 1800, String(practiceG.length));

console.log('\n=== never a prediction ===');
for (const said of ['This won’t be on your exam, so skip it.', 'This will definitely be on your exam.', 'It’s likely to come up on your midterm.', 'Your professor will ask this.', 'You’ll see this on the final exam.', 'Expect this on the final.', 'Here are some likely exam questions.', 'These are bound to appear in the final.'])
  ok(`dropped: “${said}”`, T.predictsExam(said));
for (const said of ['This has come up in past exams.', 'The course has asked about it in 6 past questions.', 'Exams in this course often include graphs.', 'What will be on the exam is up to your professor.', 'I cannot know what will be on your exam.', 'I can’t tell you whether this will be on your exam.', 'Socria never makes a claim about what your exam will ask.'])
  ok(`kept: “${said}”`, !T.predictsExam(said));

console.log('\n=== copied wording, measured ===');
ok('a reply that copies a past question is caught by its five-word runs', T.copiedWording('Which of the following is NOT a determinant of demand? a) consumer income b) the prices of related goods', pack.avoid, T.shinglesOf) >= 4);
ok('a new question with the same demand is not', T.copiedWording('A city caps rents below the market price. Sketch the market and shade what consumers lose.', pack.avoid, T.shinglesOf) === 0);

console.log('\n=== what the profile view says it changes ===');
const fx = T.effectsOf(p);
ok('it says what the turn does, from the same codes', fx.explain.some((l) => /consumer surplus/.test(l)) && fx.practice.some((l) => /multiple choice/.test(l)) && fx.practice.some((l) => /never copied wording/.test(l)));
ok('and never promises a prediction', ![...fx.explain, ...fx.practice].some((l) => T.predictsExam(l)));

console.log('\n=== wired where it belongs ===');
const route = read('app/api/logos/chat/route.ts');
ok('the route reads the pack behind the learning ledger’s gate, and can be switched off', /const coursePack: CoursePack \| null = comprehensionAllowed && persona === 'v5' && process\.env\.LOGOS_COURSES !== 'off' \? sanitizeCoursePack\(body\?\.course\) : null;/.test(route));
ok('the planner takes the course’s lean', /course: coursePack \? courseLean\(coursePack, String\(last\.content \?\? ''\)\) : null,/.test(route));
ok('the block goes after the explanation guidance, in this turn’s context only', route.indexOf('courseBlock +') > route.indexOf('renderTurnGuidance(explain, presentation') && route.indexOf('courseBlock +') < route.indexOf('evidenceBlock +'));
ok('the reply gate drops a prediction on both paths, and counts it', /drop: \(x\) => fabricatedToolClaim\(x, \{ searched, computed: accuracy\.context\.computed \}\) \|\| courseDrop\(x\)/.test(route) && /\.\.\.\(coursePack \? \{ drop: courseDrop \} : \{\}\)/.test(route));
ok('a quiz is a quiz to MR too: course practice runs under MR’s quiz contract', /QUIZ\.test\(lastText\)/.test(route) && /Quiz me in the style of/.test(read('components/LogosApp.tsx')));
const app = read('components/LogosApp.tsx');
ok('the app sends the pack only where the ledger goes — never into a conversation others read', /if \(shared \|\| !coursesRef\.current\.length\) return \{\};/.test(app) && /course: packOf\(hit\.profile, hit\.why\)/.test(app));
ok('the profile opens from the chatbox’s chip, from "+" and from More', /<CourseChip label=\{profileLabel\(courseHere\.profile\)\}/.test(app) && /label: 'Course profile'/.test(app) && /label: 'Your courses'/.test(app));
const ld = read('lib/local-data.ts');
const fnBody = (name) => {
  const at = ld.indexOf(`export function ${name}(`);
  const next = ld.indexOf('\nexport ', at + 1);
  return at < 0 ? '' : ld.slice(at, next < 0 ? undefined : next);
};
ok('"Clear memory", signing out and deleting the account all clear course profiles', /clearCourses\(\);/.test(fnBody('clearLocalMemory')) && /clearCourses\(\);/.test(fnBody('clearSocriaLocalData')));
const ex = read('lib/runtime/explain.ts');
ok('the planner leans its order of ways in, and opens with an example where the course does', /export function leanRotation/.test(ex) && /push\('worked', 'course-example-first'\)/.test(ex) && /course\?: CourseLean \| null;/.test(ex));

console.log(failed ? `\n${passed} passed, ${failed} failed` : `\n${passed} passed, 0 failed`);
process.exit(failed ? 1 : 0);
