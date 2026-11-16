// QUIZZES — source-grounded, adaptive, graded by the server, reviewed, remembered (lib/quiz, lib/objects/display-quiz.ts).
//
// Held down here:
//   • grading is exact for every type: options, all-that-apply (partial), numbers in any ordinary form within a
//     tolerance (and equivalent forms right), expressions by value, short answers by accepted words and terms;
//     a wrong answer is read carefully — a sign, a decimal place, a percentage form "confirmed"; a wrong option's
//     trap "plausible"; anything else "insufficient";
//   • a generated question is checked before it is asked: one right option, no duplicates, no "all of the
//     above", no giveaway, one unit, its arithmetic and its figure right, its sources real, no exam prediction,
//     no copied past wording, no repeat; the right answer's position is spread evenly;
//   • keys are sealed for one student, quiz and question, and a grade is signed;
//   • the next question adapts: a retest of a miss comes back two questions later, once; never three on one
//     topic; harder after rights; an exam simulation keeps its planned order;
//   • the quiz display keeps the record: only the student answers, a graded answer is never re-graded, the
//     history replays to the same states, the review and what the chat is told come from the records alone;
//   • what quizzes add to the learning ledger moves a mistake through missed → review → retested → retained, and
//     never claims mastery from one quiz;
//   • requests are read for count, mode, difficulty, formats, topics and named sources.

import { build } from 'esbuild';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.env.QUIZ_SECRET = 'test-secret-for-quiz-sealing';
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, '.tmp', 'quiz');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const entry = join(OUT, 'entry.ts');
const lib = (p) => JSON.stringify(join(root, p));
writeFileSync(
  entry,
  [
    `export * from ${lib('lib/quiz/grade.ts')};`,
    `export * from ${lib('lib/quiz/validate.ts')};`,
    `export * from ${lib('lib/quiz/scope.ts')};`,
    `export * from ${lib('lib/quiz/adapt.ts')};`,
    `export * from ${lib('lib/quiz/review.ts')};`,
    `export * from ${lib('lib/quiz/style.ts')};`,
    `export * from ${lib('lib/quiz/mastery.ts')};`,
    `export * from ${lib('lib/quiz/seal.ts')};`,
    `export { candidatesFrom, shapeQuiz, jsonIn, quizPrompt, rng, sourcesFrom, formatNumber, salvageQuiz, normaliseItem, partsOf, mergeParts, citeOf, PART_SIZE } from ${lib('lib/quiz/generate.ts')};`,
    `export * as OBJ from ${lib('lib/objects/index.ts')};`,
    `export { create, apply, sanitizeSpace, currentOf } from ${lib('lib/objects/core.ts')};`,
    `export { sanitizeQuiz, currentQuestion, questionDone, mayAdvance } from ${lib('lib/objects/display-quiz.ts')};`,
    `export { sanitizeLedger, noteTopic } from ${lib('lib/runtime/explain.ts')};`,
  ].join('\n')
);
await build({ entryPoints: { qx: entry }, bundle: true, format: 'esm', platform: 'node', outdir: OUT, outExtension: { '.js': '.mjs' }, tsconfig: join(root, 'tsconfig.json'), logLevel: 'error', alias: { '@': root } });
const M = await import(pathToFileURL(join(OUT, 'qx.mjs')).href);

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 500))));
const J = JSON.stringify;

// ── grading ──
console.log('\n=== grading, exactly ===');
{
  const k = (o) => ({ quiz: 'z1', qid: 'q1', answerText: '', why: 'Because.', ...o });
  const single = k({ type: 'single', correct: ['c'], traps: { a: { tag: 'p-equals-mc', note: 'This is the competitive rule; it may mean the two rules are mixed up.' } } });
  ok('single: the right option is right', M.gradeAnswer(single, 'c').grade === 'right');
  const trap = M.gradeAnswer(single, 'a');
  ok('  a wrong option with a trap: wrong, and what it may show is only plausible', trap.grade === 'wrong' && trap.mistake.tag === 'p-equals-mc' && trap.mistake.evidence === 'plausible');
  ok('  a wrong option without one: insufficient evidence, never a diagnosis', M.gradeAnswer(single, 'b').mistake.evidence === 'insufficient');
  const multi = k({ type: 'multi', correct: ['a', 'c'] });
  ok('multi: all the right ones and nothing else; some and no wrong is partial; any wrong is wrong', M.gradeAnswer(multi, 'c,a').grade === 'right' && M.gradeAnswer(multi, 'a').grade === 'partial' && M.gradeAnswer(multi, 'a,b,c').grade === 'wrong');
  const num = k({ type: 'numeric', value: 1200, tolerance: { abs: 0.5 }, unit: '$', wrongValues: [{ value: 600, tag: 'halved', note: 'Half the right amount: may mean marginal revenue was used for price.' }] });
  ok('numeric: "1,200", "$1200", "1200.00", "1.2e3" are all right', ['1,200', '$1200', '1200.00', '1.2e3', ' 1200 '].every((a) => M.gradeAnswer(num, a).grade === 'right'), ['1,200', '$1200', '1200.00', '1.2e3'].map((a) => M.gradeAnswer(num, a).grade).join());
  ok('  the right size with the wrong sign: confirmed', M.gradeAnswer(num, '-1200').mistake?.tag === 'sign' && M.gradeAnswer(num, '-1200').mistake.evidence === 'confirmed');
  ok('  a decimal place out: confirmed', M.gradeAnswer(num, '120').mistake?.tag === 'decimal-place');
  ok('  a known wrong method\'s value: plausible', M.gradeAnswer(num, '600').mistake?.tag === 'halved' && M.gradeAnswer(num, '600').mistake.evidence === 'plausible');
  ok('  not a number: said so', M.gradeAnswer(num, 'about twelve hundred').mistake?.tag === 'not-a-number');
  const frac = k({ type: 'numeric', value: 0.75, tolerance: { abs: 0.001 } });
  ok('  equivalent forms are right: 3/4, 0.75, .75', ['3/4', '0.75', '.75'].every((a) => M.gradeAnswer(frac, a).grade === 'right'));
  const root2 = k({ type: 'numeric', value: Math.SQRT2, tolerance: { rel: 0.001 } });
  ok('  and an exact form: sqrt(2)', M.gradeAnswer(root2, 'sqrt(2)').grade === 'right' && M.gradeAnswer(root2, '1.414').grade === 'right');
  const pct = k({ type: 'numeric', value: 25, tolerance: { abs: 0.01 }, unit: '%' });
  ok('  25% asked: "25" and "25%" right; "0.25" close with the reason confirmed', M.gradeAnswer(pct, '25').grade === 'right' && M.gradeAnswer(pct, '25%').grade === 'right' && M.gradeAnswer(pct, '0.25').grade === 'close' && M.gradeAnswer(pct, '0.25').mistake.tag === 'percent-form');
  const rounding = k({ type: 'numeric', value: 3.14159, tolerance: { abs: 0.005 } });
  ok('  rounded too far: wrong, with the reason', M.gradeAnswer(rounding, '3.1').grade === 'wrong' && M.gradeAnswer(rounding, '3.1').mistake.tag === 'rounding' && M.gradeAnswer(rounding, '3.14').grade === 'right');
  const expr = k({ type: 'expression', expr: '2*x', vars: ['x'] });
  ok('expression: equivalent forms are right (2x, x*2, x+x); a different one is not', ['2x', 'x*2', 'x+x', '2 * x'].every((a) => M.gradeAnswer(expr, a).grade === 'right') && M.gradeAnswer(expr, 'x^2').grade === 'wrong');
  ok('  the opposite sign: confirmed', M.gradeAnswer(expr, '-2x').mistake?.tag === 'sign');
  const short = k({ type: 'short', accept: ['marginal revenue equals marginal cost', 'MR = MC'], terms: ['marginal revenue', 'marginal cost'], model: 'Where marginal revenue equals marginal cost.' });
  ok('short: an accepted answer, case and articles aside, is right', M.gradeAnswer(short, 'The marginal revenue equals marginal cost').grade === 'right');
  ok('  one slip away is close', M.gradeAnswer(short, 'marginal revenue equals marginal cots').grade === 'close');
  ok('  all the key terms is right; some is unsure (they check it); none is wrong', M.gradeAnswer(short, 'where marginal cost meets marginal revenue').grade === 'right' && M.gradeAnswer(short, 'where marginal cost is lowest').grade === 'unsure' && M.gradeAnswer(short, 'price').grade === 'wrong');
  ok('a slip of form counts in the score; partial and unsure do not, unless they marked it right', M.countsRight('close') && !M.countsRight('partial') && !M.countsRight('unsure') && M.countsRight('unsure', 'right'));
}

// ── the request ──
console.log('\n=== reading the request ===');
{
  ok('quiz requests are recognised in their ordinary forms', ['Quiz me for my microeconomics exam.', 'test me on chapter 3', 'Give me a 10 question practice quiz', 'Can we do a mock exam?', 'make me a quiz on monopoly', 'quiz on cost curves'].every(M.asksForQuiz));
  ok('  and not questions about quizzes', !M.asksForQuiz('How do quizzes work?') && !M.asksForQuiz('What is on the quiz on Friday?') && !M.asksForQuiz('I have a quiz tomorrow'));
  const a = M.readScope('10 questions, one at a time, no explanations until the end.');
  ok('"10 questions … no explanations until the end": 10, marks as they go', a.count === 10 && a.mode === 'marks' && a.modeAsked, J(a));
  const b = M.readScope('Exam simulation on chapters 3-5, hard, multiple choice only');
  ok('"exam simulation … hard, multiple choice only": exam, harder, single', b.mode === 'exam' && b.difficulty === 'harder' && J(b.formats) === J(['single']), J(b));
  const c = M.readScope('Quiz me from the Lecture 7 slides only, on monopoly and price discrimination, not oligopoly');
  ok('named material is a strict source; topics and exclusions are read', c.strictSources && c.sourcesNamed.some((s) => s.includes('lecture 7')) && c.topics.includes('monopoly') && c.topics.includes('price discrimination') && c.exclude.includes('oligopoly'), J(c));
  ok('"for my microeconomics exam" is what it is for', M.readScope('Quiz me for my microeconomics exam').forAssessment === 'microeconomics exam');
  ok('defaults: 8 in practice, 10 in an exam; at most 25', M.defaultCount({ mode: 'practice', count: null }) === 8 && M.defaultCount({ mode: 'exam', count: null }) === 10 && M.readScope('give me 60 questions').count === 25);
}

// ── validation and shaping ──
console.log('\n=== every question checked before it is asked ===');
const DOC = {
  v: 1,
  id: '0a1b2c3d4e5f6789',
  name: 'Lecture 6 - Monopoly.pdf',
  format: 'pdf',
  pageCount: 3,
  pages: [],
  blocks: [
    { id: 'p1.1', page: 1, kind: 'heading', text: 'Monopoly: profit maximisation', method: 'text' },
    { id: 'p1.2', page: 1, kind: 'paragraph', text: 'A monopolist maximises profit by producing the quantity where marginal revenue equals marginal cost, then charging the highest price the demand curve allows for that quantity.', method: 'text' },
    { id: 'p2.1', page: 2, kind: 'paragraph', text: 'With demand P = 100 - 2Q, marginal revenue is MR = 100 - 4Q. If marginal cost is constant at 20, the monopolist produces Q = 20 and charges P = 60.', method: 'text' },
    { id: 'p3.1', page: 3, kind: 'paragraph', text: 'A perfectly competitive firm produces where price equals marginal cost. The monopolist restricts output below the competitive level, creating a deadweight loss.', method: 'text' },
  ],
  tables: [],
  figures: [],
  checks: [],
};
const MODEL_OUT = {
  title: 'Monopoly pricing',
  questions: [
    { concept: 'monopoly profit maximisation', topic: 'Monopoly pricing', type: 'single', difficulty: 2, demand: 'recall', stem: 'At which output does a monopolist maximise profit?', options: [{ text: 'Where marginal revenue equals marginal cost', correct: true }, { text: 'Where price equals marginal cost', trap: { tag: 'p-equals-mc', note: 'That is the rule for a perfectly competitive firm; it may mean the two rules are being mixed up.' } }, { text: 'Where average total cost is lowest', trap: { tag: 'min-atc', note: 'May mean efficient scale is being confused with profit maximisation.' } }, { text: 'Where demand is unit elastic', trap: { tag: 'revenue-max', note: 'That maximises revenue, not profit.' } }], explanation: 'Profit is largest where the last unit adds as much to revenue as to cost: MR = MC. Price then comes from the demand curve.', cue: 'Think about the last unit produced: what must it add to revenue and to cost?', sources: ['1:p1.2'] },
    { concept: 'monopoly price from demand', topic: 'Monopoly pricing', type: 'numeric', difficulty: 2, demand: 'application', stem: 'Demand is $P = 100 - 2Q$ and marginal cost is constant at 20. What price does a profit-maximising monopolist charge?', answer: { value: 60, unit: '$', tolerance: { abs: 0.5 }, calc: '100 - 2*20' }, wrong_values: [{ value: 20, tag: 'p-equals-mc', note: 'Price equal to marginal cost is the competitive outcome.' }], explanation: 'MR = 100 - 4Q equals 20 at Q = 20, and the demand curve gives P = 100 - 40 = 60.', cue: 'Find the quantity first, from MR = MC, then read the price off demand.', sources: ['1:p2.1'] },
    { concept: 'deadweight loss', topic: 'Monopoly welfare', type: 'truefalse', difficulty: 1, demand: 'recall', stem: 'A monopolist produces less output than a perfectly competitive industry with the same costs.', answer: { value: true }, explanation: 'It restricts output below the competitive level, which creates a deadweight loss.', sources: ['1:p3.1'] },
    { concept: 'monopoly profit maximisation', topic: 'Monopoly pricing', type: 'single', difficulty: 3, demand: 'transfer', stem: 'A firm facing a downward-sloping demand curve finds that at its current output marginal revenue is 12 and marginal cost is 18. What should it do to raise profit?', options: [{ text: 'Reduce output', correct: true }, { text: 'Increase output', trap: { tag: 'mr-mc-direction', note: 'May mean the direction of the MR = MC adjustment is reversed.' } }, { text: 'Keep output and raise price only', trap: { tag: 'price-only', note: 'May mean price is treated as independent of quantity.' } }, { text: 'Keep output the same', trap: { tag: 'no-change', note: 'May mean an MR below MC is read as optimal.' } }], explanation: 'The last unit adds 12 to revenue but 18 to cost, so producing less raises profit until MR = MC.', sources: ['1:p1.2'], variant_of: 0 },
    // fails: two right options
    { concept: 'x', topic: 'Bad', type: 'single', stem: 'Which of these is a monopoly characteristic in this market?', options: [{ text: 'One seller', correct: true }, { text: 'A single firm', correct: true }, { text: 'Many sellers' }], explanation: 'A monopoly has exactly one seller of the good.', sources: ['1:p1.1'] },
    // fails: wrong arithmetic
    { concept: 'q', topic: 'Monopoly pricing', type: 'numeric', stem: 'With demand P = 100 - 2Q and MC = 20, what quantity maximises profit?', answer: { value: 30, unit: 'units', calc: '(100 - 20) / 4' }, explanation: 'MR = MC gives Q = 20.', sources: ['1:p2.1'] },
    // fails: predicts the exam
    { concept: 'y', topic: 'Monopoly welfare', type: 'truefalse', stem: 'Deadweight loss arises because output is restricted under monopoly in this model.', answer: { value: true }, explanation: 'This will definitely be on the exam, so remember it.', sources: ['1:p3.1'] },
    // fails: cites a passage that does not exist
    { concept: 'z', topic: 'Monopoly pricing', type: 'truefalse', stem: 'A monopolist always charges the highest possible price for every unit sold.', answer: { value: false }, explanation: 'It charges what demand allows at its chosen quantity.', sources: ['1:p9.9'] },
    // fails: all of the above
    { concept: 'w', topic: 'Monopoly pricing', type: 'single', stem: 'Which statements about monopoly are correct in the standard model?', options: [{ text: 'It is a price maker' }, { text: 'It faces market demand' }, { text: 'All of the above', correct: true }], explanation: 'Both statements hold for a monopolist in the model.', sources: ['1:p1.2'] },
  ],
};
{
  const raw = M.jsonIn('Here is the quiz:\n```json\n' + J(MODEL_OUT) + '\n```');
  const { title, candidates } = M.candidatesFrom(raw);
  ok('the model\'s JSON is read, fenced or not, field by field', title === 'Monopoly pricing' && candidates.length === 9);
  const shaped = M.shapeQuiz('zq1', title, candidates, [DOC], { count: 8, strictSources: false, avoidHashes: [], avoidStems: [] });
  ok('  four questions survive; each failure is dropped and counted by its reason', shaped.questions.length === 4 && shaped.rejected['answer-key'] === 1 && shaped.rejected.arithmetic === 1 && shaped.rejected['predicts-exam'] === 1 && shaped.rejected.ungrounded === 1 && shaped.rejected.options === 1, J(shaped.rejected));
  ok('  three planned, one variant held back for a retest (pointing at its original)', shaped.main === 3 && shaped.questions[3].variantOf === 'q1');
  ok('  option ids are positional; the key holds the right one; the public question holds no answer', shaped.questions.every((q) => !q.options || q.options.every((o, i) => o.id === 'abcdef'[i] || q.type === 'truefalse')) && shaped.keys[0].correct.length === 1 && !J(shaped.questions).includes('"correct"') && !J(shaped.questions).includes('p-equals-mc'));
  ok('  the right answer reads as the student should see it', shaped.keys[1].answerText === '$60' && shaped.keys[2].answerText === 'True');
  ok('  sources are the file\'s own words, with its page', shaped.questions[1].sources[0].page === 2 && shaped.questions[1].sources[0].quote.startsWith('With demand P = 100 - 2Q') && shaped.questions[1].sources[0].title === 'Lecture 6 - Monopoly.pdf');
  ok('  grounded: every question cites the material', shaped.grounding === 'grounded');
  // the right answer's position is spread across a long quiz
  const WORDS = ['airline', 'bakery', 'cinema', 'dairy', 'electric', 'ferry', 'garage', 'hotel', 'island', 'jeweller', 'kiosk', 'library', 'museum', 'newspaper', 'orchard', 'pharmacy', 'quarry', 'railway', 'stadium', 'tailor', 'utility', 'vineyard', 'workshop', 'zoo'];
  // stems that share no words, so none is a near-duplicate of another
  const many = WORDS.map((w, i) => ({ ...MODEL_OUT.questions[0], stem: `${w} ${WORDS[(i + 5) % 24]}${i} ${WORDS[(i + 11) % 24]}${i} ${WORDS[(i + 17) % 24]}${i}?`, variant_of: undefined }));
  const spread = M.shapeQuiz('zq2', 't', M.candidatesFrom({ questions: many }).candidates, [DOC], { count: 24, strictSources: false, avoidHashes: [], avoidStems: [] });
  const pos = [0, 0, 0, 0];
  spread.keys.forEach((k) => pos['abcd'.indexOf(k.correct[0])]++);
  ok('  the right answer is spread evenly across positions (position says nothing)', spread.keys.length === 24 && pos.every((n) => n === 6), J(pos));
  // a strict quiz drops a question that cites nothing
  const general = M.candidatesFrom({ questions: [{ ...MODEL_OUT.questions[2], sources: [] }] }).candidates;
  ok('a quiz confined to named material drops a question that cites none', M.shapeQuiz('zq3', 't', general, [DOC], { count: 4, strictSources: true, avoidHashes: [], avoidStems: [] }).questions.length === 0);
  ok('a question already asked in an earlier quiz is not asked again', M.shapeQuiz('zq4', 't', M.candidatesFrom({ questions: [MODEL_OUT.questions[0]] }).candidates, [DOC], { count: 4, strictSources: false, avoidHashes: [], avoidStems: ['At which output does the monopolist maximise its profit?'] }).questions.length === 0);
  // giveaways and units
  const give = M.candidatesFrom({ questions: [{ topic: 't', concept: 'c', type: 'single', stem: 'The rule marginal revenue equals marginal cost is what a monopolist uses: which rule is it?', options: [{ text: 'marginal revenue equals marginal cost', correct: true }, { text: 'price equals marginal cost' }, { text: 'price equals average cost' }], explanation: 'It is MR = MC.', sources: ['1:p1.2'] }] }).candidates[0];
  ok('a stem that contains the right option is a giveaway', M.checkCandidate(give, { knownBlocks: new Set(['1:p1.2']), strictSources: false, avoid: [], asked: [] }) === 'giveaway');
  const units = M.candidatesFrom({ questions: [{ topic: 't', concept: 'c', type: 'single', stem: 'What is the monopoly price in the example from the lecture?', options: [{ text: '$60', correct: true }, { text: '20 units' }, { text: '$40' }], explanation: 'Demand at Q = 20 gives P = 60.', sources: ['1:p2.1'] }] }).candidates[0];
  ok('numerical options in mixed units are refused', M.checkCandidate(units, { knownBlocks: new Set(['1:p2.1']), strictSources: false, avoid: [], asked: [] }) === 'units');
  // figures: the answer must match where the curves meet
  const fig = { kind: 'curves', x: { label: 'Quantity', min: 0, max: 50 }, y: { label: 'Price', min: 0, max: 100 }, curves: [{ id: 'D', label: 'Demand', expr: '100 - 2*x' }, { id: 'S', label: 'Supply', expr: '20 + 2*x' }] };
  const meet = M.meetOf(fig, 'D', 'S');
  ok('a figure\'s curves meet where the algebra says (Q = 20, P = 60)', Math.abs(meet.x - 20) < 1e-6 && Math.abs(meet.y - 60) < 1e-6);
  const figQ = (value) => M.candidatesFrom({ questions: [{ topic: 'Markets', concept: 'equilibrium', type: 'numeric', stem: 'Using the graph, what is the equilibrium quantity in this market?', answer: { value, unit: 'units', tolerance: { abs: 0.5 } }, figure: fig, from_figure: { meet: ['D', 'S'], axis: 'x' }, explanation: 'Demand meets supply at Q = 20.', sources: [] }] }).candidates[0];
  ok('  a figure answer that matches is kept; one that does not is refused', M.checkCandidate(figQ(20), { knownBlocks: new Set(), strictSources: false, avoid: [], asked: [] }) === null && M.checkCandidate(figQ(25), { knownBlocks: new Set(), strictSources: false, avoid: [], asked: [] }) === 'figure');
}

// ── sealing ──
console.log('\n=== keys sealed for one student; grades signed ===');
{
  const key = { quiz: 'zq9', qid: 'q2', type: 'numeric', value: 60, tolerance: { abs: 0.5 }, unit: '$', answerText: '$60', why: 'MR = MC at Q = 20.' };
  const sealed = M.sealKey(key, 'user_a');
  const bytes = Buffer.from(sealed.slice(3), 'base64url').toString('latin1');
  ok('a sealed key holds no answer in the clear (none of the key\'s words in its bytes)', sealed.startsWith('k1.') && !bytes.includes('"value"') && !bytes.includes('MR = MC') && !bytes.includes('$60'));
  ok('  it opens for its owner, quiz and question', J(M.openKey(sealed, 'user_a', 'zq9', 'q2')) === J(key));
  ok('  and for nobody else, nor for another question or quiz', M.openKey(sealed, 'user_b', 'zq9', 'q2') === null && M.openKey(sealed, 'user_a', 'zq9', 'q3') === null && M.openKey(sealed, 'user_a', 'zq8', 'q2') === null);
  ok('  a tampered key does not open', M.openKey(sealed.slice(0, -4) + 'AAAA', 'user_a', 'zq9', 'q2') === null);
  const sig = M.signGrade('user_a', 'zq9', 'q2', 0, '60', 'right');
  ok('a grade is signed; changing any part breaks it', M.verifyGrade(sig, 'user_a', 'zq9', 'q2', 0, '60', 'right') && !M.verifyGrade(sig, 'user_a', 'zq9', 'q2', 0, '60', 'wrong') && !M.verifyGrade(sig, 'user_a', 'zq9', 'q2', 0, '61', 'right') && !M.verifyGrade(sig, 'user_b', 'zq9', 'q2', 0, '60', 'right'));
}

// ── adaptation ──
console.log('\n=== the next question adapts ===');
const Q = (id, topic, concept, difficulty = 2, extra = {}) => ({ id, type: 'single', stem: `${id}?`, options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }, { id: 'c', text: 'C' }], topic, concept, difficulty, demand: 'application', sources: [], sealed: '', ...extra });
const G = (grade) => ({ grade, sig: 'x'.repeat(32), at: 1 });
const answered = (grade) => ({ attempts: [{ answer: 'a', helped: false, graded: G(grade), at: 1 }], revealed: false });
{
  const pool = [Q('q1', 'Monopoly', 'mr=mc'), Q('q2', 'Costs', 'mc'), Q('q3', 'Welfare', 'dwl'), Q('q4', 'Costs', 'atc'), Q('q5', 'Monopoly', 'mr=mc', 2, { variantOf: 'q1' })];
  const base = { pool, count: 4, mode: 'practice', difficulty: null, priority: {} };
  ok('the first question is the first planned', M.nextQuestion({ ...base, asked: [], records: {} }).id === 'q1');
  const afterMiss = { ...base, asked: ['q1'], records: { q1: answered('wrong') } };
  ok('after a miss, the variant does not come straight back', M.nextQuestion(afterMiss).id !== 'q5');
  const twoLater = { ...base, asked: ['q1', 'q2', 'q3'], records: { q1: answered('wrong'), q2: answered('right'), q3: answered('right') } };
  ok('  two questions later, it does (a retest of the concept, with a different question)', M.nextQuestion(twoLater).id === 'q5');
  const retested = { ...base, count: 6, pool: [...pool, Q('q6', 'Monopoly', 'mr=mc', 2, { variantOf: 'q1' })], asked: ['q1', 'q2', 'q3', 'q5', 'q4'], records: { q1: answered('wrong'), q2: answered('right'), q3: answered('right'), q5: answered('wrong'), q4: answered('right') } };
  ok('  once per concept: a weak idea cannot take over the quiz', M.nextQuestion(retested)?.id !== 'q6');
  const exam = { ...base, mode: 'exam', asked: ['q1', 'q2', 'q3'], records: { q1: answered('wrong'), q2: answered('right'), q3: answered('right') } };
  ok('an exam simulation keeps its planned order and never retests', M.nextQuestion(exam).id === 'q4');
  const topicPool = [Q('t1', 'A', 'a1'), Q('t2', 'A', 'a2'), Q('t3', 'A', 'a3'), Q('t4', 'B', 'b1')];
  const run = { pool: topicPool, count: 4, mode: 'practice', difficulty: null, priority: {}, asked: ['t1', 't2'], records: { t1: answered('right'), t2: answered('right') } };
  ok('never three in a row on one topic', M.nextQuestion(run).id === 't4');
  const diffPool = [Q('d1', 'X', 'x1', 2), Q('d2', 'X', 'x2', 1), Q('d3', 'X', 'x3', 3), Q('d4', 'Y', 'y1', 2)];
  const rights = { pool: diffPool, count: 4, mode: 'practice', difficulty: null, priority: {}, asked: ['d1', 'd4'], records: { d1: answered('right'), d4: answered('right') } };
  const wrongs = { ...rights, records: { d1: answered('wrong'), d4: answered('wrong') } };
  ok('harder after rights, easier after misses, on the same topic', M.nextQuestion(rights).id === 'd3' && M.nextQuestion(wrongs).id === 'd2', `${M.nextQuestion(rights).id} ${M.nextQuestion(wrongs).id}`);
  const pr = { pool: [Q('p1', 'A', 'a'), Q('p2', 'B', 'b')], count: 2, mode: 'practice', difficulty: null, priority: { b: 3 }, asked: [], records: {} };
  ok('what matters most (a past miss, what they asked for) comes first', M.nextQuestion(pr).id === 'p2');
  ok('no next question once the count is reached', M.nextQuestion({ ...base, count: 1, asked: ['q1'], records: { q1: answered('right') } }) === null);
}

// ── the display ──
console.log('\n=== the quiz display keeps the record ===');
let SPACE, QID;
{
  const pool = [Q('q1', 'Monopoly pricing', 'mr=mc'), Q('q2', 'Costs', 'mc', 2, { type: 'numeric', options: undefined, unit: '$' }), Q('q3', 'Welfare', 'dwl'), Q('q4', 'Monopoly pricing', 'mr=mc', 2, { variantOf: 'q1' })];
  const state = { quiz: 'zqd1', title: 'Monopoly pricing', mode: 'practice', count: 3, difficulty: null, pool: pool.map((q) => ({ ...q, sealed: 'k1.' + 'A'.repeat(40) })), asked: [], records: {}, phase: 'taking', basis: { course: 'ECO 304K', instructor: 'Smith', sources: [{ doc: '0a1b2c3d4e5f6789', title: 'Lecture 6 - Monopoly.pdf', kind: 'slides' }], grounding: 'grounded', missing: [], style: { basis: 'inferred', said: 'From your slides.' }, targets: [{ concept: 'mr=mc', why: 'missed' }] }, links: {}, priority: { 'mr=mc': 2 }, made: 1000, looked: [], children: [] };
  const made = M.create({ objs: [] }, 'quiz', state, { origin: 'socria' });
  ok('a quiz is made as a display in the map', !!made && made.obj.kind === 'quiz');
  SPACE = made.space;
  QID = made.obj.id;
  const act = (op, args, by = 'person') => {
    const r = M.apply(SPACE, QID, op, args, { by, at: 2000 });
    if (r.ok) SPACE = r.space;
    return r;
  };
  ok('Socria cannot take the quiz: no next, no answer, no grade', !act('next', {}, 'socria').ok && !act('answer', { q: 'q1', a: 'a', t: 1 }, 'socria').ok);
  ok('the first question is asked', act('next', {}).ok && M.currentQuestion(M.currentOf(SPACE.objs[0])).id === 'q1');
  ok('  the next one waits for this one', !act('next', {}).ok);
  ok('  an answer that is not one of the options is refused', !act('answer', { q: 'q1', a: 'z', t: 3000 }).ok);
  ok('  an answer is recorded, waiting for its grade', act('answer', { q: 'q1', a: 'b', t: 3000 }).ok && M.currentOf(SPACE.objs[0]).records.q1.attempts[0].graded === null);
  ok('  no second answer while the first is being checked', !act('answer', { q: 'q1', a: 'a', t: 3001 }).ok);
  const wrong = { grade: 'wrong', cue: 'Think about the last unit.', mistake: { tag: 'p-equals-mc', note: 'May mean the competitive rule is being used.', evidence: 'plausible' }, sig: 'S'.repeat(32), at: 3100 };
  ok('  the server\'s grade is recorded once', act('grade', { q: 'q1', n: 0, g: J(wrong) }).ok && !act('grade', { q: 'q1', n: 0, g: J({ ...wrong, grade: 'right' }) }).ok);
  ok('  a grade that cannot be read is refused', !act('grade', { q: 'q1', n: 1, g: '{bad' }).ok);
  ok('practice: after a miss, a second try (counted as helped)', act('answer', { q: 'q1', a: 'a', t: 3200 }).ok && M.currentOf(SPACE.objs[0]).records.q1.attempts[1].helped === true);
  const right = { grade: 'right', correct: 'Where marginal revenue equals marginal cost', why: 'MR = MC maximises profit.', sig: 'R'.repeat(32), at: 3300 };
  ok('  graded right, with the answer and why kept with the question', act('grade', { q: 'q1', n: 1, g: J(right) }).ok && M.currentOf(SPACE.objs[0]).records.q1.shown.correct.startsWith('Where marginal'));
  ok('  the history is never rewritten: both attempts are there', M.currentOf(SPACE.objs[0]).records.q1.attempts.length === 2);
  act('next', {});
  const s2 = M.currentOf(SPACE.objs[0]);
  ok('the next question is chosen by what the answers show', s2.asked.length === 2 && s2.asked[1] !== 'q4');
  act('answer', { q: s2.asked[1], a: s2.asked[1] === 'q2' ? '60' : 'a', t: 4000 });
  act('grade', { q: s2.asked[1], n: 0, g: J({ grade: 'right', correct: 'x', why: 'y', sig: 'T'.repeat(32), at: 4100 }) });
  act('next', {});
  const s3 = M.currentOf(SPACE.objs[0]);
  act('answer', { q: s3.asked[2], a: s3.asked[2] === 'q2' ? '60' : 'c', t: 5000 });
  act('grade', { q: s3.asked[2], n: 0, g: J({ grade: 'wrong', correct: 'A', why: 'Because A.', mistake: { tag: 'unclear', note: 'One answer is not enough to say.', evidence: 'insufficient' }, sig: 'U'.repeat(32), at: 5100 }) });
  ok('after the last question there is no next', !act('next', {}).ok);
  ok('finishing turns it into its review', act('finish', { t: 6000 }).ok && M.currentOf(SPACE.objs[0]).phase === 'review' && M.currentOf(SPACE.objs[0]).view === 'review');
  ok('  nothing is answered after that', !act('answer', { q: s3.asked[2], a: 'a', t: 6100 }).ok);
  // the history replays to the same states (what is saved and reloaded)
  const replayed = M.sanitizeSpace(JSON.parse(J(SPACE)));
  ok('the saved history replays to exactly the same quiz', J(M.currentOf(replayed.objs[0])) === J(M.currentOf(SPACE.objs[0])));
  const R = M.reviewOf({ id: 'zqd1', title: 'Monopoly pricing', ...M.currentOf(SPACE.objs[0]) });
  const third = R.missed.find((it) => it.outcome === 'wrong');
  ok('the review: the score counts only answers right at the first try (1 of 3), one more right on a second try, one missed', R.right === 1 && R.helped === 1 && R.wrong === 1 && R.missed.length === 2 && third.correct === 'A' && third.why === 'Because A.' && third.yours, J({ right: R.right, helped: R.helped, wrong: R.wrong }));
  ok('  a question right only at the second try is reviewed with the misses, showing the first answer given', R.items[0].outcome === 'helped' && !R.items[0].firstTry && R.items[0].helped && R.items[0].yours !== R.items[0].then);
  ok('  the completion note is one or two lines, with the score (and what a second try made)', /^You scored 1\/3 \(2 with a second try\)\. The misses were on /.test(R.note), R.note);
  const facts = M.OBJ.objectsBlock(SPACE, { guarded: false });
  // a question missed and then revealed: the review still has its right answer and why (kept with the question)
  {
    const st = M.currentOf(SPACE.objs[0]);
    const revealedRec = { attempts: [{ answer: 'a', helped: false, graded: { grade: 'wrong', cue: 'c', sig: 'V'.repeat(32), at: 1 }, at: 1 }], revealed: true, shown: { correct: 'The right one', why: 'Because it is.' } };
    const r2 = M.reviewOf({ id: 'x', title: 't', ...st, records: { ...st.records, [st.asked[2]]: revealedRec } });
    const it = r2.items[2];
    ok('a question revealed after a miss: the review shows the right answer and why kept with it', it.outcome === 'wrong' && it.correct === 'The right one' && it.why === 'Because it is.');
  }
  ok('the conversation is told every question, the answer given, the grade and the right answer', facts.includes('Q1 [Monopoly pricing') && facts.includes('Their first answer:') && facts.includes('right only on the second try') && facts.includes('Their answer:') && facts.includes('Right answer: Where marginal revenue equals marginal cost') && facts.includes('Score 1/3'), facts.slice(facts.indexOf('QUIZ'), facts.indexOf('QUIZ') + 600));
  ok('  and never a key: nothing sealed reaches it', !facts.includes('k1.'));
}
{
  // an exam holds every result to the end
  const pool = [Q('q1', 'A', 'a'), Q('q2', 'B', 'b')];
  let sp = M.create({ objs: [] }, 'quiz', { quiz: 'zqe', title: 'Exam', mode: 'exam', count: 2, difficulty: null, pool, asked: [], records: {}, phase: 'taking', basis: {}, links: {}, priority: {}, made: 1, looked: [], children: [] }, { origin: 'socria' }).space;
  const id = sp.objs[0].id;
  const act = (op, args) => {
    const r = M.apply(sp, id, op, args, { by: 'person', at: 1 });
    if (r.ok) sp = r.space;
    return r;
  };
  act('next', {});
  act('answer', { q: 'q1', a: 'b', t: 10 });
  ok('exam simulation: one answer, final; the next question without waiting for a grade', !act('answer', { q: 'q1', a: 'a', t: 11 }).ok && act('next', {}).ok);
  const facts = M.OBJ.objectsBlock(sp, { guarded: true });
  ok('  the conversation is told the answer was given and its grade is held to the end', facts.includes('held until the end'));
}

// ── mastery ──
console.log('\n=== what quizzes add to the learning ledger ===');
{
  const D = 86_400_000;
  const t0 = Date.UTC(2026, 10, 1);
  const ev = (right, at, o = {}) => ({ concept: 'monopoly profit maximisation', right, firstTry: right, difficulty: 2, demand: 'application', helped: false, retest: false, at, ...o });
  let L = M.noteQuizAnswer([], ev(false, t0, { tag: 'p-equals-mc' }));
  ok('a miss: counted as a wrong check, the box back to the start, the mistake "missed", its tag kept', L[0].wrong === 1 && L[0].box === 0 && L[0].q.st === 'missed' && L[0].q.tags[0] === 'p-equals-mc');
  L = M.noteQuizReview(L, 'monopoly profit maximisation');
  ok('  opened in the review: under review', L[0].q.st === 'review');
  L = M.noteQuizAnswer(L, ev(true, t0 + 2 * 3600_000, { retest: true }));
  ok('  right later on a different question: retested', L[0].q.st === 'retested' && L[0].right === 1 && L[0].box === 1);
  L = M.noteQuizAnswer(L, ev(true, t0 + 2 * D));
  ok('  right again a day or more later: retained', L[0].q.st === 'retained');
  const est = M.masteryOf(L[0], t0 + 2 * D);
  ok('  three answers is still not "secure": mastery is not claimed from so little', est.level !== 'secure', J(est));
  L = M.noteQuizAnswer(L, ev(false, t0 + 3 * D));
  ok('  a later miss sends it back to missed — and nothing is weak for good', L[0].q.st === 'missed');
  const one = M.noteQuizAnswer([], ev(true, t0));
  ok('one right answer is "not enough to say yet"', M.masteryOf(one[0], t0).level === 'too-little');
  let strong = [];
  for (let i = 0; i < 8; i++) strong = M.noteQuizAnswer(strong, ev(true, t0 + i * 2 * D, { demand: i % 2 ? 'transfer' : 'recall', difficulty: 3 }));
  ok('many right answers of more than one kind, across days: secure', M.masteryOf(strong[0], t0 + 16 * D).level === 'secure', J(M.masteryOf(strong[0], t0 + 16 * D)));
  ok('the ledger keeps the quiz evidence when read back (and the existing fields as they were)', J(M.sanitizeLedger(JSON.parse(J(L)), t0 + 4 * D)[0].q) === J(L[0].q) && M.sanitizeLedger(JSON.parse(J(L)), t0 + 4 * D)[0].wrong === L[0].wrong);
  ok('an ordinary check later keeps what quizzes added', !!M.noteTopic(L, 'monopoly profit maximisation', { right: 1 }, t0 + 5 * D)[0].q);
  const targets = M.quizTargets(L, t0 + 4 * D, { asked: ['price discrimination'], course: [{ t: 'deadweight loss', w: 3, a: 2 }] });
  ok('what a quiz aims at: asked first, then what was missed, then what the course stresses', J(targets.map((t) => t.why)) === J(['asked', 'missed', 'unseen']), J(targets));
}

// ── the professor's style ──
console.log('\n=== how this professor asks, and on what basis ===');
{
  ok('no course: unknown, said plainly', M.styleOf(null).basis === 'unknown');
  const observed = M.styleOf({ id: 'c', label: 'ECO 304K · Smith', why: 'linked', codes: [{ code: 'format.mcq', c: 'high', b: 'observed', s: 0.7 }, { code: 'format.free', c: 'high', b: 'observed', s: 0.3 }, { code: 'graphs.frequent', c: 'moderate', b: 'observed' }, { code: 'trap.contrast', c: 'moderate', b: 'observed' }], terms: ['marginal revenue', 'deadweight loss'], abbr: [], concepts: [], avoid: [] });
  ok('past questions: observed, with its shares, and never a prediction', observed.basis === 'observed' && observed.guidance.some((g) => g.includes('about 70% multiple choice')) && /not a prediction/.test(observed.said));
  const inferred = M.styleOf({ id: 'c', label: 'ECO 304K', why: 'linked', codes: [{ code: 'graphs.some', c: 'moderate', b: 'inferred' }, { code: 'stated.format.mcq', c: 'low', b: 'stated' }], terms: [], abbr: [], concepts: [], avoid: [] });
  ok('slides alone: inferred, and said to be a guess', inferred.basis === 'inferred' && /reasonable guess, not observed/.test(inferred.said));
  const types = M.planTypes(10, observed, { formats: null }, false);
  ok('the course\'s own mix plans the formats (7 of 10 multiple choice)', types.filter((t) => t === 'single').length === 7, J(types));
  ok('a format asked for is honoured', M.planTypes(5, observed, { formats: ['truefalse'] }, false).every((t) => t === 'truefalse'));
}

console.log('\n=== a quiz is made every time: what a model actually writes is read ===');
{
  // the other ordinary ways of writing the same question
  const messy = {
    quiz: {
      title: 'Cells',
      questions: [
        { type: 'multiple_choice', question: 'Which organelle makes most of the ATP in a cell?', options: ['Ribosome', 'Mitochondrion', 'Golgi body', 'Lysosome'], correct: 'B', why: 'Aerobic respiration happens in the mitochondria.' },
        { type: 'MCQ', stem: 'Which molecule carries amino acids to the ribosome?', options: [{ label: 'mRNA' }, { label: 'tRNA' }, { label: 'DNA' }, { label: 'rRNA' }], answer: 'tRNA', explanation: 'Transfer RNA brings each amino acid to the ribosome.' },
        { type: 'true_false', question: 'Plant cells have a cell wall.', options: [{ text: 'True', correct: true }, { text: 'False' }], rationale: 'Plant cells have a cellulose wall outside the membrane.' },
        { type: 'Numerical', question: 'A cell divides every 20 minutes. How many cells are there after one hour, starting from one?', answer: '8', explanation: 'Three divisions double it three times: 2 x 2 x 2 = 8.' },
        { type: 'short answer', question: 'What is the name of the process by which plants make glucose from light?', answer: 'photosynthesis', explanation: 'Photosynthesis turns light energy into chemical energy in glucose.' },
        { question: 'Which of these is found in both plant and animal cells?', options: ['Chloroplast', 'Cell wall', 'Nucleus', 'Large central vacuole'], correct_answer: 'Nucleus', explanation: 'Both have a nucleus; the others are plant features.' },
        { type: 'select_all', question: 'Which of these are made of protein?', options: [{ text: 'Enzymes', is_correct: true }, { text: 'Antibodies', isCorrect: true }, { text: 'Cellulose' }, { text: 'Starch' }], explanation: 'Enzymes and antibodies are proteins; cellulose and starch are carbohydrates.' },
        // a bare number naming the right option is a guess (from 0 or from 1?) — never taken as a key
        { type: 'single', question: 'Which gas do plants take in for photosynthesis?', options: ['Oxygen', 'Carbon dioxide', 'Nitrogen', 'Hydrogen'], correct: 1, explanation: 'Plants take in carbon dioxide and give out oxygen.' },
      ],
    },
  };
  const { title, candidates } = M.candidatesFrom(messy);
  ok('the title from a nested quiz object', title === 'Cells', title);
  const byStem = (w) => candidates.find((c) => c.q.stem.includes(w));
  const mito = byStem('ATP');
  ok('"multiple_choice", options as strings, the right one named by its letter', mito?.q.type === 'single' && mito.q.options.length === 4 && J(mito.key.correct) === J(['o1']) && /mitochondria/.test(mito.key.why), J(mito?.key));
  const trna = byStem('amino acids');
  ok('"MCQ", options with "label", the right one named by its words', trna?.q.type === 'single' && J(trna.key.correct) === J(['o1']), J(trna?.key));
  const wall = byStem('cell wall.');
  ok('"true_false" with the answer in its options', wall?.q.type === 'truefalse' && J(wall.key.correct) === J(['true']) && /cellulose/.test(wall.key.why), J(wall?.key));
  const div = byStem('20 minutes');
  ok('"Numerical" with the answer a bare string number', div?.q.type === 'numeric' && div.key.value === 8, J(div?.key));
  const ps = byStem('glucose from light');
  ok('"short answer" with the answer a phrase: accepted, and the model answer', ps?.q.type === 'short' && J(ps.key.accept) === J(['photosynthesis']) && ps.key.model === 'photosynthesis', J(ps?.key));
  const nuc = byStem('both plant and animal');
  ok('no type at all: read from its shape (options, one right)', nuc?.q.type === 'single' && J(nuc.key.correct) === J(['o2']), J(nuc?.key));
  const prot = byStem('made of protein');
  ok('"select_all" with "is_correct" and "isCorrect"', prot?.q.type === 'multi' && J(prot.key.correct) === J(['o0', 'o1']), J(prot?.key));
  const co2 = byStem('photosynthesis?');
  ok('a bare number naming the right option is not taken as a key (it would be a guess)', co2 && (co2.key.correct ?? []).length === 0, J(co2?.key));
  const shaped = M.shapeQuiz('zmess', title, candidates, [], { count: 8, strictSources: false, avoidHashes: [], avoidStems: [] });
  ok('seven of the eight make a quiz; the guessed key is refused for its answer key', shaped.main === 7 && shaped.rejected['answer-key'] === 1, `${shaped.main} ${J(shaped.rejected)}`);

  // cut off at the token limit: every question that arrived whole is kept
  const whole = J({ title: 'Cut off', questions: [messy.quiz.questions[0], messy.quiz.questions[1]] });
  const cut = whole.slice(0, -2) + ', {"type": "single", "question": "Which org';
  const salvaged = M.salvageQuiz(cut);
  ok('a reply cut off mid-question: the whole questions before it are read', salvaged?.questions.length === 2 && salvaged.title === 'Cut off', J(salvaged));
  ok('  braces inside a question\'s words do not mislead it', M.salvageQuiz('{"questions":[{"question":"In {x | x > 2}, is 3 in it?","type":"truefalse","answer":true,"why":"Three is greater than two."},{"question":"cut')?.questions.length === 1);
  ok('  nothing to read: null', M.salvageQuiz('{"title": "x", "note"') === null && M.salvageQuiz('') === null);

  // citations as a model may write them
  ok('citations read in their other forms', M.citeOf('[1:p3.12]') === '1:p3.12' && M.citeOf('1 : P3.12') === '1:p3.12' && M.citeOf('doc 2, p10.4') === '2:p10.4' && M.citeOf('p3.12') === 'p3.12' && M.citeOf('page 3') === '');

  // written in parts at the same time
  const p8 = M.partsOf(['single', 'single', 'single', 'single', 'single', 'numeric', 'short', 'truefalse'], 'practice');
  ok('eight questions: two parts of four, the variants shared between them', p8.length === 2 && p8.every((p) => p.plan.length === 4) && p8.reduce((a, p) => a + p.variants, 0) === 4, J(p8));
  const p10 = M.partsOf(Array(10).fill('single'), 'exam');
  ok('ten in an exam simulation: three parts, no variants', p10.length === 3 && p10.reduce((a, p) => a + p.plan.length, 0) === 10 && p10.every((p) => p.variants === 0), J(p10));
  ok('twenty-five: at most five calls at once', M.partsOf(Array(25).fill('single'), 'practice').length === 5);
  const merged = M.mergeParts([
    { title: 'A', candidates: [{ q: { stem: 'one' }, cites: [] }, { q: { stem: 'one again' }, cites: [], variantOfIndex: 0 }] },
    { title: 'B', candidates: [{ q: { stem: 'two' }, cites: [] }, { q: { stem: 'two again' }, cites: [], variantOfIndex: 0 }] },
  ]);
  ok('parts merged: each variant still points at its own original', merged.title === 'A' && merged.candidates[3].variantOfIndex === 2 && merged.candidates[1].variantOfIndex === 0, J(merged.candidates.map((c) => c.variantOfIndex)));
}

console.log('\n=== asked for in the ordinary ways ===');
{
  const yes = ['quiz me on photosynthesis', 'quizz me on the cold war', 'I want to be quizzed on chapter 3', 'test my knowledge of supply and demand', 'ask me some questions about mitosis', 'can I have a quiz on cells', "let's do a quiz", 'make me a 10 question quiz', 'another quiz please', 'pop quiz!', 'give me some practice questions on derivatives', 'can I get tested on this', "I'd like a quick quiz on enzymes"];
  const no = ['what is on the quiz on friday?', 'how do quizzes work?', 'the quiz yesterday was hard, explain question 3', 'I have a test tomorrow on enzymes', 'why did I miss question 4?', 'help me study for my quiz', 'my teacher gave us a 10 question quiz', 'what is a unit test in programming'];
  const missed = yes.filter((s) => !M.asksForQuiz(s));
  const wrong = no.filter((s) => M.asksForQuiz(s));
  ok(`every ordinary way of asking is read as asking (${yes.length})`, !missed.length, missed.join(' | '));
  ok(`and a question about a quiz is not (${no.length})`, !wrong.length, wrong.join(' | '));
  ok('"quiz me on this", "what we covered": the conversation, not a topic named', M.readScope('quiz me on this').topics.length === 0 && M.readScope('Quiz me on what this conversation has covered').topics.length === 0 && J(M.readScope('quiz me on the cold war').topics) === J(['cold war']));
}

console.log(`\nquiz: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
