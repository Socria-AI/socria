// THE QUIZ EVALUATION — reproducible, deterministic, on an invented course's material (test/fixtures/quiz-material.mjs).
//
// What it measures, each against a baseline that can actually be computed (no model is called, so nothing here
// depends on one; numbers are what the code does on this set, printed as a table):
//
//   question checks       of candidates each carrying one known flaw, how many are refused for that flaw; of fit
//                         ones, how many are kept. Baseline: no checks (every candidate asked).
//   grading               of labelled answers (equivalent numbers, units, percentages, rounding, expressions,
//                         choices, short answers), how many get the grade they should
//   adaptation            simulated students who know some concepts and not others: share of questions spent on
//                         what they do not know, whether a miss is retested, whether any concept takes over.
//                         Baseline: the planned order (no adaptation).
//   mistake resolution    scripted answer histories → the state each mistake should reach
//   completion            a quiz taken with the grading connection failing: no answer lost, every one graded at the end
//   conversation context  for every question of a finished quiz, what the conversation is told holds its exact words,
//                         the answer given and the right answer
//   style alignment       the formats planned against the shares a course's past questions show
//   learning measures     what an experiment would read (lib/quiz/measures.ts), on a scripted history

import { build } from 'esbuild';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.env.QUIZ_SECRET = 'eval-secret';
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, '.tmp', 'quiz-eval');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const lib = (p) => JSON.stringify(join(root, p));
writeFileSync(
  join(OUT, 'entry.ts'),
  [
    `export * from ${lib('lib/quiz/grade.ts')};`,
    `export * from ${lib('lib/quiz/validate.ts')};`,
    `export * from ${lib('lib/quiz/adapt.ts')};`,
    `export * from ${lib('lib/quiz/review.ts')};`,
    `export * from ${lib('lib/quiz/style.ts')};`,
    `export * from ${lib('lib/quiz/mastery.ts')};`,
    `export * from ${lib('lib/quiz/measures.ts')};`,
    `export * from ${lib('lib/quiz/seal.ts')};`,
    `export { candidatesFrom, shapeQuiz } from ${lib('lib/quiz/generate.ts')};`,
    `export * as OBJ from ${lib('lib/objects/index.ts')};`,
    `export { create, apply, sanitizeSpace, currentOf } from ${lib('lib/objects/core.ts')};`,
  ].join('\n')
);
await build({ entryPoints: { ev: join(OUT, 'entry.ts') }, bundle: true, format: 'esm', platform: 'node', outdir: OUT, outExtension: { '.js': '.mjs' }, tsconfig: join(root, 'tsconfig.json'), logLevel: 'error', alias: { '@': root } });
const M = await import(pathToFileURL(join(OUT, 'ev.mjs')).href);
const F = await import(pathToFileURL(join(here, 'fixtures', 'quiz-material.mjs')).href);

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 500))));
const J = JSON.stringify;
const table = [];
const row = (measure, value, baseline = '—') => table.push({ measure, value, baseline });
const pct = (a, b) => (b ? `${Math.round((a / b) * 1000) / 10}%` : 'n/a');

// ── question checks ──
console.log('\n=== question checks ===');
{
  const known = new Set();
  F.DOCS.forEach((d, f) => d.blocks.forEach((b) => known.add(`${f + 1}:${b.id}`)));
  const { candidates } = M.candidatesFrom({ questions: F.CANDIDATES.map((c) => c.q) });
  const asked = [];
  let caught = 0, flawed = 0, kept = 0, fit = 0, rightReason = 0;
  const misses = [];
  candidates.forEach((c, i) => {
    const want = F.CANDIDATES[i].want;
    const got = M.checkCandidate(c, { knownBlocks: known, strictSources: false, avoid: [], asked });
    if (!got) asked.push(c.q.stem);
    if (want) {
      flawed++;
      if (got) caught++;
      if (got === want) rightReason++;
      else misses.push(`${F.CANDIDATES[i].q.concept}: want ${want}, got ${got}`);
    } else {
      fit++;
      if (!got) kept++;
      else misses.push(`${F.CANDIDATES[i].q.concept}: fit but refused (${got})`);
    }
  });
  row('Flawed candidates refused', `${caught}/${flawed} (${pct(caught, flawed)})`, `0/${flawed} (no checks)`);
  row('  …for the flaw they carry', `${rightReason}/${flawed} (${pct(rightReason, flawed)})`);
  row('Fit candidates kept', `${kept}/${fit} (${pct(kept, fit)})`, `${fit}/${fit}`);
  ok('every flawed candidate is refused, for the flaw it carries', caught === flawed && rightReason === flawed, misses.join(' | '));
  ok('every fit candidate is kept', kept === fit, misses.join(' | '));
}

// ── grading ──
console.log('\n=== grading ===');
{
  let right = 0;
  const wrong = [];
  for (const a of F.ANSWERS) {
    const got = M.gradeAnswer({ quiz: 'e', qid: 'q1', answerText: '', why: 'x', ...a.key }, a.a).grade;
    if (got === a.want) right++;
    else wrong.push(`${a.key.type} "${a.a}": want ${a.want}, got ${got}`);
  }
  row('Labelled answers graded as they should be', `${right}/${F.ANSWERS.length} (${pct(right, F.ANSWERS.length)})`);
  ok('every labelled answer gets the grade it should', right === F.ANSWERS.length, wrong.join(' | '));
}

// ── adaptation ──
console.log('\n=== adaptation, against the planned order ===');
{
  // a pool of 10 planned questions over 5 concepts (2 each, easy and hard), and a variant for each concept
  const concepts = ['a', 'b', 'c', 'd', 'e'];
  const pool = [];
  let n = 0;
  for (const c of concepts) for (const d of [1, 3]) pool.push({ id: `q${++n}`, type: 'single', stem: `${c}${d}?`, options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }, { id: 'c', text: 'C' }], topic: `T${c}`, concept: c, difficulty: d, demand: 'application', sources: [], sealed: '' });
  for (const c of concepts) pool.push({ id: `q${++n}`, type: 'single', stem: `${c} again?`, options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }, { id: 'c', text: 'C' }], topic: `T${c}`, concept: c, difficulty: 2, demand: 'transfer', sources: [], sealed: '', variantOf: pool.find((q) => q.concept === c).id });
  const students = [
    { name: 'knows a, b, c; not d, e', knows: new Set(['a', 'b', 'c']) },
    { name: 'knows only a', knows: new Set(['a']) },
    { name: 'knows all but c', knows: new Set(['a', 'b', 'd', 'e']) },
  ];
  const run = (mode, student, priority = {}) => {
    const asked = [];
    const records = {};
    for (;;) {
      const q = M.nextQuestion({ pool, asked, records, count: 8, mode, difficulty: null, priority });
      if (!q) break;
      asked.push(q.id);
      const right = student.knows.has(q.concept);
      records[q.id] = { attempts: [{ answer: 'a', helped: false, graded: { grade: right ? 'right' : 'wrong', sig: 'x'.repeat(32), at: asked.length }, at: asked.length }], revealed: false };
    }
    const qs = asked.map((id) => pool.find((q) => q.id === id));
    const weak = qs.filter((q) => !student.knows.has(q.concept)).length;
    const perConcept = Math.max(...concepts.map((c) => qs.filter((q) => q.concept === c).length));
    const missedConcepts = [...new Set(qs.filter((q) => !student.knows.has(q.concept)).map((q) => q.concept))];
    const retested = missedConcepts.filter((c) => qs.filter((q) => q.concept === c).length >= 2).length;
    const covered = new Set(qs.map((q) => q.concept)).size;
    // a quiz of n questions that covers every concept has n − covered left for retests: the room it had
    const room = Math.min(missedConcepts.length, qs.length - covered);
    return { weak, n: qs.length, perConcept, retested, missed: missedConcepts.length, covered, room };
  };
  let adaptiveWeak = 0, plannedWeak = 0, total = 0, maxPer = 0, retestShare = [], roomShare = [], coverage = [];
  for (const s of students) {
    const a = run('practice', s);
    const p = run('exam', s); // the planned order: no adapting, no retests
    adaptiveWeak += a.weak;
    plannedWeak += p.weak;
    total += a.n;
    maxPer = Math.max(maxPer, a.perConcept);
    retestShare.push(a.missed ? a.retested / a.missed : 1);
    roomShare.push(a.room ? Math.min(1, a.retested / a.room) : 1);
    coverage.push(a.covered);
  }
  row('Questions on what the student does not know (adaptive)', pct(adaptiveWeak, total), pct(plannedWeak, total) + ' (planned order)');
  row('Missed concepts retested within the quiz', pct(retestShare.reduce((x, y) => x + y, 0), retestShare.length), '0% (planned order)');
  row('  …of those the quiz had room to retest (after covering every concept)', pct(roomShare.reduce((x, y) => x + y, 0), roomShare.length), '0% (planned order)');
  row('Most questions on any one concept', String(maxPer), '2 (planned order)');
  row('Concepts covered (of 5), worst student', String(Math.min(...coverage)), '4 (planned order, 8 questions)');
  ok('adaptive practice spends more of the quiz on what the student does not know than the planned order', adaptiveWeak > plannedWeak, `${adaptiveWeak} vs ${plannedWeak} of ${total}`);
  ok('every missed concept the quiz has room for is retested with a different question', roomShare.every((x) => x === 1), J({ retestShare, roomShare }));
  ok('no concept takes over the quiz (at most 3 questions on one), and coverage holds (at least 4 of 5)', maxPer <= 3 && Math.min(...coverage) >= 4, `max ${maxPer}, coverage ${J(coverage)}`);
}

// ── mistake resolution ──
console.log('\n=== mistake resolution ===');
{
  const D = 86_400_000, t = Date.UTC(2026, 9, 1);
  const ev = (right, at, o = {}) => ({ concept: 'consumer surplus', right, firstTry: right, difficulty: 2, demand: 'application', helped: false, retest: false, at, ...o });
  const scripts = [
    { steps: [['answer', false, 0]], want: 'missed' },
    { steps: [['answer', false, 0], ['review'], ['answer', true, 2]], want: 'retested' },
    { steps: [['answer', false, 0], ['answer', true, 1], ['answer', true, 1 + 2 * D]], want: 'retained' },
    { steps: [['answer', false, 0], ['answer', true, 1], ['answer', true, 1 + 2 * D], ['answer', false, 3 * D]], want: 'missed' },
    { steps: [['answer', true, 0], ['answer', true, 2 * D]], want: undefined },
    { steps: [['answer', false, 0], ['answer', true, 1], ['answer', true, 3600_000]], want: 'retested' },
  ];
  let right = 0;
  const wrong = [];
  for (const s of scripts) {
    let L = [];
    for (const st of s.steps) L = st[0] === 'review' ? M.noteQuizReview(L, 'consumer surplus') : M.noteQuizAnswer(L, ev(st[1], t + st[2]));
    const got = L[0]?.q?.st;
    if (got === s.want) right++;
    else wrong.push(`${J(s.steps)}: want ${s.want}, got ${got}`);
  }
  row('Scripted histories reaching the right mistake state', `${right}/${scripts.length}`);
  ok('every scripted history reaches the state it should (and a right answer within a day is a retest, not retention)', right === scripts.length, wrong.join(' | '));
}

// ── completion reliability ──
console.log('\n=== completion with a failing connection ===');
{
  const { title, candidates } = M.candidatesFrom({ title: 'Monopoly', questions: F.CANDIDATES.filter((c) => !c.want).map((c) => c.q) });
  const shaped = M.shapeQuiz('zeval1', title, candidates, F.DOCS, { count: 6, strictSources: false, avoidHashes: [], avoidStems: [] });
  const sealed = shaped.questions.map((q, i) => ({ ...q, sealed: M.sealKey({ ...shaped.keys[i], mode: 'practice' }, 'u1') }));
  let space = M.create({ objs: [] }, 'quiz', { quiz: 'zeval1', title, mode: 'practice', count: 6, difficulty: null, pool: sealed, asked: [], records: {}, phase: 'taking', basis: { grounding: shaped.grounding }, links: {}, priority: {}, made: 1, looked: [], children: [] }, { origin: 'socria' }).space;
  const id = space.objs[0].id;
  const act = (op, args) => {
    const r = M.apply(space, id, op, args, { by: 'person', at: 1 });
    if (r.ok) space = r.space;
    return r.ok;
  };
  // the server, in process: grades as the route does
  const server = (q, answer, attempt, final) => {
    const key = M.openKey(q.sealed, 'u1', 'zeval1', q.id);
    const v = M.verdictFor(key, answer, attempt, { final });
    return v ? { ...v, sig: M.signGrade('u1', 'zeval1', q.id, attempt, answer, v.grade), at: 5 } : null;
  };
  const answerFor = (q) => (q.type === 'numeric' ? '60' : q.type === 'expression' ? '3x^2' : q.type === 'short' ? 'cos(x)' : q.type === 'truefalse' ? 'true' : q.options[0].id);
  let offline = 0, saved = 0;
  for (let i = 0; i < 6; i++) {
    if (!act('next', {})) break;
    const s = M.currentOf(space.objs[0]);
    const qid = s.asked[s.asked.length - 1];
    const q = sealed.find((x) => x.id === qid);
    act('answer', { q: qid, a: answerFor(q), t: 10 + i });
    // every other grading request is lost: the answer must wait, saved
    if (i % 2 === 0) {
      offline++;
      if (M.currentOf(space.objs[0]).records[qid].attempts[0].answer) saved++;
      // the student cannot go on with an unchecked answer in practice — "Check again" grades it
      const g = server(q, answerFor(q), 0, false);
      act('grade', { q: qid, n: 0, g: J(g) });
    } else {
      act('grade', { q: qid, n: 0, g: J(server(q, answerFor(q), 0, false)) });
    }
    const rec = M.currentOf(space.objs[0]).records[qid];
    if (!M.OBJ.kindOf('quiz') || (rec.attempts[0].graded && rec.attempts[0].graded.grade !== 'right' && rec.attempts[0].graded.grade !== 'close' && rec.attempts[0].graded.grade !== 'unsure')) {
      act('reveal', { q: qid, correct: 'x', why: 'y' });
    }
  }
  act('finish', { t: 100 });
  const replay = M.sanitizeSpace(JSON.parse(J(space)));
  const s = M.currentOf(replay.objs[0]);
  const graded = s.asked.filter((qid) => s.records[qid].attempts.every((a) => a.graded)).length;
  row('Answers kept through a lost grading request', `${saved}/${offline}`);
  row('Answers graded by the end, after a save and reload', `${graded}/${s.asked.length}`);
  ok('no answer is lost when grading fails, and every answer is graded by the end — through a save and reload', saved === offline && graded === s.asked.length && s.phase === 'review', `${saved}/${offline} ${graded}/${s.asked.length}`);

  // ── conversation context ──
  const facts = M.OBJ.objectsBlock(replay, { guarded: false });
  const R = M.reviewOf({ id: 'zeval1', title, ...s });
  let exact = 0;
  for (const it of R.items) if (facts.includes(`Q${it.n} [`) && facts.includes(it.q.stem.replace(/\s+/g, ' ').slice(0, 120)) && (!it.yours || facts.includes(`Their answer: ${it.yours}`))) exact++;
  row('Questions the conversation can quote exactly (words, answer given)', `${exact}/${R.items.length}`, 'none recorded (a quiz in the chat was prose)');
  ok('for every question, the conversation is told its exact words and the answer given', exact === R.items.length, `${exact}/${R.items.length}`);
}

// ── style alignment ──
console.log('\n=== style alignment ===');
{
  const packs = [
    { s: { mcq: 0.7, free: 0.3, tf: 0 } },
    { s: { mcq: 0.4, free: 0.4, tf: 0.2 } },
    { s: { mcq: 1, free: 0, tf: 0 } },
  ];
  let worst = 0;
  for (const p of packs) {
    const style = M.styleOf({ id: 'c', label: 'C', why: 'linked', codes: [{ code: 'format.mcq', c: 'high', b: 'observed', s: p.s.mcq }, { code: 'format.free', c: 'high', b: 'observed', s: p.s.free }, ...(p.s.tf ? [{ code: 'format.tf', c: 'high', b: 'observed', s: p.s.tf }] : [])], terms: [], abbr: [], concepts: [], avoid: [] });
    const types = M.planTypes(10, style, { formats: null }, false);
    const share = { mcq: types.filter((t) => t === 'single').length / 10, free: types.filter((t) => t === 'short' || t === 'numeric').length / 10, tf: types.filter((t) => t === 'truefalse').length / 10 };
    worst = Math.max(worst, Math.abs(share.mcq - p.s.mcq), Math.abs(share.free - p.s.free), Math.abs(share.tf - p.s.tf));
  }
  row('Largest gap between planned formats and observed shares (10 questions)', `${Math.round(worst * 100)} points`, 'not adapted (fixed mix)');
  ok('the formats planned follow the course\'s observed shares to within one question in ten', worst <= 0.1, worst);
}

// ── learning measures ──
console.log('\n=== learning measures ===');
{
  const D = 86_400_000;
  const m = M.measuresOf([{ ev: [[1, 0, 2, 1, 0, 0], [3600_001, 1, 2, 1, 0, 1], [2 * D, 1, 2, 2, 0, 0]] }, { ev: [[1, 1, 1, 0, 0, 0], [3 * D, 0, 2, 1, 0, 0]] }]);
  ok('what an experiment reads: improvement on unseen questions, retention after a delay, time to resolve a miss', J(m.unseen) === J({ n: 3, right: 2 }) && J(m.retention) === J({ n: 2, right: 1 }) && J(m.resolutionHours) === J([1]), J(m));
}

console.log('\n=== results ===');
console.table(table);
console.log(`\nquiz-eval: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
