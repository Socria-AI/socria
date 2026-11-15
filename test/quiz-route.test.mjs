// QUIZZES THROUGH THE REAL ROUTES (app/api/logos/quiz, app/api/logos/quiz/grade, app/api/logos/chat).
//
// Only Clerk, the database (fake-supabase) and the model (fake-openai-logos: a scripted JSON answer) are
// replaced. Held down:
//   • a quiz is made from the student's own passages: questions that fail their checks never arrive; what
//     arrives holds no answer in the clear — no right option, no number, no explanation — only sealed keys;
//   • the professor's style comes from the course pack the browser sends, with its basis said: past exams make it
//     "observed", slides alone never do;
//   • a quiz confined to named material that is not here is refused rather than made from general knowledge;
//   • grading: practice gives a cue (not the answer) on a first miss and the answer after the second; marks gives
//     right or not; an exam is not graded until the end, and the end grades and explains everything; a key opens
//     only for the student it was made for; every grade is signed;
//   • the chat route tells the reply every question of a quiz as it was answered, so "why did I miss question 2?"
//     is answered from question 2 — and a request the quiz took does not set MR's quiz contract in the chat.

import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve as res } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { systemOf } from './helpers/prompt.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, '.tmp', 'quiz-route');
const FAKE_DB = join(here, 'helpers', 'fake-supabase.mjs');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const swap = {
  name: 'swap',
  setup(b) {
    b.onResolve({ filter: /(^|\/)supabase$/ }, (a) => {
      const p = a.path.startsWith('@/') ? join(root, a.path.slice(2)) : res(a.resolveDir, a.path);
      if (p === join(root, 'lib', 'supabase')) return { path: pathToFileURL(FAKE_DB).href, external: true };
      return undefined;
    });
    b.onResolve({ filter: /^@clerk\/nextjs\/server$/ }, () => ({ path: pathToFileURL(join(here, 'helpers', 'fake-clerk.mjs')).href, external: true }));
    b.onResolve({ filter: /^openai$/ }, () => ({ path: pathToFileURL(join(here, 'helpers', 'fake-openai-logos.mjs')).href, external: true }));
    b.onResolve({ filter: /^server-only$/ }, () => ({ path: join(here, 'helpers', 'server-only-shim.mjs') }));
    b.onResolve({ filter: /^next\/(server|headers)$/ }, (a) => ({ path: `${a.path}.js`, external: true }));
  },
};
for (const [name, entry] of [
  ['make', 'app/api/logos/quiz/route.ts'],
  ['grade', 'app/api/logos/quiz/grade/route.ts'],
  ['chat', 'app/api/logos/chat/route.ts'],
])
  await build({ entryPoints: [join(root, entry)], bundle: true, format: 'esm', platform: 'node', outfile: join(OUT, `${name}.mjs`), tsconfig: join(root, 'tsconfig.json'), plugins: [swap], external: ['next', 'next/*', 'undici', '@supabase/*', 'stripe', 'resend'], logLevel: 'error' });
await build({ entryPoints: [join(root, 'lib/teaching/teaching.ts')], bundle: true, format: 'esm', platform: 'node', outfile: join(OUT, 'teaching.mjs'), tsconfig: join(root, 'tsconfig.json'), logLevel: 'error' });
await build({ entryPoints: { o: join(root, 'lib/objects/index.ts') }, bundle: true, format: 'esm', platform: 'node', outdir: OUT, outExtension: { '.js': '.mjs' }, tsconfig: join(root, 'tsconfig.json'), logLevel: 'error' });

const quiet = (orig) => (...a) => {
  const first = typeof a[0] === 'string' ? a[0] : '';
  if (/^\[(socria|logos|core4|tokens|search|epistemic|mr|explain|course|quiz)/.test(first) || first.startsWith('logos') || first.startsWith('conversations')) return;
  orig(...a);
};
console.info = quiet(console.info.bind(console));
console.warn = quiet(console.warn.bind(console));
console.error = quiet(console.error.bind(console));

process.env.OPENAI_API_KEY = 'test';
process.env.RATE_LIMIT_DISABLED = '1';
process.env.QUIZ_SECRET = 'route-test-secret';
globalThis.__uid = 'user_quiz';
await import(pathToFileURL(FAKE_DB).href);
const make = await import(pathToFileURL(join(OUT, 'make.mjs')).href);
const grade = await import(pathToFileURL(join(OUT, 'grade.mjs')).href);
const chat = await import(pathToFileURL(join(OUT, 'chat.mjs')).href);
const T = await import(pathToFileURL(join(OUT, 'teaching.mjs')).href);
const O = await import(pathToFileURL(join(OUT, 'o.mjs')).href);
const F = await import(pathToFileURL(join(here, 'fixtures', 'course-materials.mjs')).href);
const { NextRequest } = await import('next/server.js');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 500))));
const J = JSON.stringify;
const post = async (route, url, body, uid) => {
  const saved = globalThis.__uid;
  if (uid !== undefined) globalThis.__uid = uid;
  try {
    const r = await route.POST(new NextRequest(`http://localhost${url}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: J(body) }));
    return { status: r.status, json: await r.json().catch(() => null), headers: r.headers };
  } finally {
    globalThis.__uid = saved;
  }
};

const DOC = {
  v: 1,
  id: '0a1b2c3d4e5f6789',
  name: 'Lecture 6 - Monopoly.pdf',
  format: 'pdf',
  pageCount: 3,
  pages: [{ n: 1 }, { n: 2 }, { n: 3 }],
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
const SCRIPT = {
  title: 'Monopoly pricing',
  questions: [
    { concept: 'monopoly profit maximisation', topic: 'Monopoly pricing', type: 'single', difficulty: 2, demand: 'recall', stem: 'At which output does a monopolist maximise profit?', options: [{ text: 'Where marginal revenue equals marginal cost', correct: true }, { text: 'Where price equals marginal cost', trap: { tag: 'p-equals-mc', note: 'That is the rule for a perfectly competitive firm; it may mean the two rules are being mixed up.' } }, { text: 'Where average total cost is lowest', trap: { tag: 'min-atc', note: 'May mean efficient scale is being confused with profit maximisation.' } }, { text: 'Where demand is unit elastic', trap: { tag: 'revenue-max', note: 'That maximises revenue, not profit.' } }], explanation: 'Profit is largest where the last unit adds as much to revenue as to cost: MR = MC.', cue: 'Think about the last unit produced: what must it add to revenue and to cost?', sources: ['1:p1.2'] },
    { concept: 'monopoly price from demand', topic: 'Monopoly pricing', type: 'numeric', difficulty: 2, demand: 'application', stem: 'Demand is $P = 100 - 2Q$ and marginal cost is constant at 20. What price does a profit-maximising monopolist charge?', answer: { value: 60, unit: '$', tolerance: { abs: 0.5 }, calc: '100 - 2*20' }, wrong_values: [{ value: 20, tag: 'p-equals-mc', note: 'Price equal to marginal cost is the competitive outcome.' }], explanation: 'MR = 100 - 4Q equals 20 at Q = 20, and demand gives P = 60.', cue: 'Find the quantity first, from MR = MC, then read the price off demand.', sources: ['1:p2.1'] },
    { concept: 'deadweight loss', topic: 'Monopoly welfare', type: 'truefalse', difficulty: 1, demand: 'recall', stem: 'A monopolist produces less output than a perfectly competitive industry with the same costs.', answer: { value: true }, explanation: 'It restricts output below the competitive level, which creates a deadweight loss.', sources: ['1:p3.1'] },
    { concept: 'q', topic: 'Monopoly pricing', type: 'numeric', stem: 'With demand P = 100 - 2Q and MC = 20, what quantity maximises profit?', answer: { value: 30, unit: 'units', calc: '(100 - 20) / 4' }, explanation: 'MR = MC gives Q = 20 in this example.', sources: ['1:p2.1'] },
  ],
};

// ── making a quiz ──
console.log('\n=== a quiz made from their own passages ===');
let made;
{
  globalThis.__logosScript = [SCRIPT];
  globalThis.__logosCalls = [];
  const r = await post(make, '/api/logos/quiz', { sessionId: 'conv_q1', request: 'Quiz me on monopoly pricing for my micro exam', docs: [DOC], ledger: [{ topic: 'monopoly profit maximisation', seen: 3, right: 0, wrong: 2, last: Date.now() - 86_400_000, box: 0, q: { ev: [[Date.now() - 86_400_000, 0, 2, 1, 0, 0]], st: 'missed' } }] });
  made = r.json;
  ok('made: three questions held up; the one with the wrong arithmetic never arrives', r.status === 200 && made.questions.length === 3 && made.rejected.arithmetic === 1, J(r.json).slice(0, 300));
  const text = J(made.questions);
  ok('  nothing in what arrives gives an answer away: no right flag, no value, no explanation, no trap', !/"correct"|"value"|"why"|explanation|p-equals-mc|MR = MC/.test(text) && made.questions.every((q) => q.sealed.startsWith('k1.')));
  ok('  every question cites the student\'s own passage, with its page and words', made.questions.every((q) => q.sources[0]?.doc === '0a1b2c3d4e5f6789' && q.sources[0].page && q.sources[0].quote));
  ok('  what it is made from is said: their file, grounded', made.basis.sources[0].title === 'Lecture 6 - Monopoly.pdf' && made.basis.grounding === 'grounded');
  ok('  what they asked for first, then what they missed before', made.basis.targets[0]?.why === 'asked' && made.basis.targets[0].concept === 'monopoly pricing' && made.basis.targets[1]?.concept === 'monopoly profit maximisation' && made.basis.targets[1].why === 'missed', J(made.basis.targets));
  const sent = globalThis.__logosCalls[0];
  ok('  the model was shown the passages with their keys, and told never to predict the exam', sent.messages[1].content.includes('[1:p2.1]') && /Never say or suggest that a question will be on an exam/.test(sent.messages[0].content));
  ok('  the default count and mode: 8, guided practice', made.asked === 8 && made.mode === 'practice');
}
{
  // the professor's style, from the course pack the browser sends
  const now = Date.now();
  let profile = T.newProfile({ course: 'My course' }, now);
  for (const d of [F.syllabus(), F.slides(), F.midterm1(), F.midterm2(), F.quiz()]) profile = T.addMaterial(profile, T.digestMaterial(d, { now, allowed: true }), now);
  globalThis.__logosScript = [SCRIPT];
  globalThis.__logosCalls = [];
  const r = await post(make, '/api/logos/quiz', { sessionId: 'conv_q2', request: 'quiz me', docs: [DOC], course: T.packOf(profile, 'linked'), courseName: 'My course' });
  ok('past exams in the course pack: the style is "observed", and said to be no forecast', r.status === 200 && r.json.basis.style.basis === 'observed' && /not a prediction/.test(r.json.basis.style.said), J(r.json?.basis?.style));
  ok('  the model was told how the course asks, tagged with its basis', /How this course asks \(observed/.test(globalThis.__logosCalls[0].messages[1].content));
  let slidesOnly = T.newProfile({ course: 'My course' }, now);
  slidesOnly = T.addMaterial(slidesOnly, T.digestMaterial(F.slides(), { now, allowed: true }), now);
  globalThis.__logosScript = [SCRIPT];
  const s2 = await post(make, '/api/logos/quiz', { sessionId: 'conv_q3', request: 'quiz me', docs: [DOC], course: T.packOf(slidesOnly, 'linked'), courseName: 'My course' });
  ok('slides alone: never "observed"', s2.status === 200 && s2.json.basis.style.basis !== 'observed', J(s2.json?.basis?.style));
}
{
  globalThis.__logosScript = [SCRIPT];
  globalThis.__logosCalls = [];
  const r = await post(make, '/api/logos/quiz', { sessionId: 'conv_q4', request: 'Quiz me only from the Lecture 9 slides', docs: [], missing: ['lecture 9 slides'] });
  ok('named material that is not here: refused, said, and no model asked', r.status === 409 && r.json.error === 'missing-sources' && globalThis.__logosCalls.length === 0);
  globalThis.__logosScript = [{ title: 't', questions: [SCRIPT.questions[3]] }];
  const bad = await post(make, '/api/logos/quiz', { sessionId: 'conv_q5', request: 'quiz me', docs: [DOC] });
  ok('when too few questions hold up, it says so rather than padding', bad.status === 422 && bad.json.error === 'too-few');
  const nobody = await post(make, '/api/logos/quiz', { request: 'quiz me', docs: [DOC] }, null);
  ok('no account and no access key: refused', nobody.status === 401);
}

// ── grading ──
console.log('\n=== graded by the server, by the quiz\'s mode ===');
const q = (i) => made.questions[i];
const g = (body, uid) => post(grade, '/api/logos/quiz/grade', { sessionId: 'conv_q1', quiz: made.quiz, ...body }, uid);
{
  const single = q(0);
  const rightId = 'abcd'.split('').find((id) => single.options.find((o) => o.id === id)?.text.startsWith('Where marginal revenue'));
  const wrongId = 'abcd'.split('').find((id) => single.options.find((o) => o.id === id)?.text.startsWith('Where price equals'));
  const first = await g({ action: 'grade', items: [{ qid: single.id, sealed: single.sealed, answer: wrongId, attempt: 0 }] });
  const g1 = first.json.results[single.id].graded;
  ok('practice, a first miss: not right, a cue to reason with, what it may show — and not the answer', g1.grade === 'wrong' && g1.cue && !g1.correct && !g1.why && g1.mistake.evidence === 'plausible', J(g1));
  const second = await g({ action: 'grade', items: [{ qid: single.id, sealed: single.sealed, answer: wrongId, attempt: 1 }] });
  ok('  a second miss: now the answer and why', second.json.results[single.id].graded.correct === 'Where marginal revenue equals marginal cost' && !!second.json.results[single.id].graded.why);
  const right = await g({ action: 'grade', items: [{ qid: single.id, sealed: single.sealed, answer: rightId, attempt: 0 }] });
  ok('  right: the answer and why, and a signature', right.json.results[single.id].graded.grade === 'right' && right.json.results[single.id].graded.sig.length === 32);
  const num = q(1);
  const n1 = await g({ action: 'grade', items: [{ qid: num.id, sealed: num.sealed, answer: '$60.00', attempt: 0 }] });
  ok('  a number in another ordinary form is right', n1.json.results[num.id].graded.grade === 'right');
  const theirs = await g({ action: 'grade', items: [{ qid: num.id, sealed: num.sealed, answer: '60', attempt: 0 }] }, 'someone_else');
  ok('a key opens only for the student it was made for', theirs.status === 403);
  const swapped = await g({ action: 'grade', items: [{ qid: single.id, sealed: num.sealed, answer: '60', attempt: 0 }] });
  ok('  a key moved to another question does not open', swapped.status === 403);
  const reveal = await g({ action: 'reveal', items: [{ qid: num.id, sealed: num.sealed }] });
  ok('practice: the answer, when they choose to see it', reveal.json.results[num.id].shown.correct === '$60');
}
{
  // an exam simulation and marks as you go: the same questions, sealed with their mode
  globalThis.__logosScript = [SCRIPT];
  const exam = (await post(make, '/api/logos/quiz', { sessionId: 'conv_q1', request: 'Exam simulation on monopoly, 3 questions', docs: [DOC] })).json;
  ok('an exam simulation is made as one', exam.mode === 'exam');
  const e = (body) => post(grade, '/api/logos/quiz/grade', { sessionId: 'conv_q1', quiz: exam.quiz, ...body });
  const early = await e({ action: 'grade', items: [{ qid: exam.questions[0].id, sealed: exam.questions[0].sealed, answer: 'a', attempt: 0 }] });
  ok('  an exam answer is not graded one by one', early.status === 409);
  const peek = await e({ action: 'reveal', items: [{ qid: exam.questions[0].id, sealed: exam.questions[0].sealed }] });
  ok('  nor its answer revealed before the end', peek.status === 409);
  const end = await e({ action: 'finish', items: exam.questions.map((x, i) => ({ qid: x.id, sealed: x.sealed, answer: i === 2 ? '' : x.type === 'numeric' ? '20' : x.options[0].id, attempt: 0 })) });
  const res = end.json.results;
  ok('  the end grades and explains every answer, and shows the answer to one left blank', Object.keys(res).length === 3 && res[exam.questions[0].id].graded.why && res[exam.questions[2].id].shown && !res[exam.questions[2].id].graded, J(res).slice(0, 300));
  globalThis.__logosScript = [SCRIPT];
  const marks = (await post(make, '/api/logos/quiz', { sessionId: 'conv_q1', request: '3 questions, no explanations until the end', docs: [DOC] })).json;
  const m = await post(grade, '/api/logos/quiz/grade', { sessionId: 'conv_q1', quiz: marks.quiz, action: 'grade', items: [{ qid: marks.questions[0].id, sealed: marks.questions[0].sealed, answer: 'a', attempt: 0 }] });
  const mg = m.json.results[marks.questions[0].id].graded;
  ok('marks as you go: right or not, nothing more until the end', marks.mode === 'marks' && !!mg.grade && !mg.correct && !mg.why && !mg.cue, J(mg));
}

// ── the chat knows the quiz ──
console.log('\n=== the conversation answers from the quiz itself ===');
{
  // a quiz taken in the conversation: question 2 missed, then finished
  let space = O.create({ objs: [] }, 'quiz', { quiz: made.quiz, title: made.title, mode: 'practice', count: 3, difficulty: null, pool: made.questions, asked: [], records: {}, phase: 'taking', basis: made.basis, links: {}, priority: {}, made: 1, looked: [], children: [] }, { origin: 'socria' }).space;
  const id = space.objs[0].id;
  const act = (op, args) => {
    const r = O.apply(space, id, op, args, { by: 'person', at: 1 });
    if (r.ok) space = r.space;
    return r.ok;
  };
  for (let i = 0; i < 3; i++) {
    act('next', {});
    const cur = O.currentOf(space.objs[0]).asked[i];
    const qq = made.questions.find((x) => x.id === cur);
    const answer = qq.type === 'numeric' ? '20' : qq.type === 'truefalse' ? 'true' : qq.options.find((o) => o.text.startsWith('Where marginal revenue')).id;
    act('answer', { q: cur, a: answer, t: 10 + i });
    const r = await g({ action: 'finish', items: [{ qid: cur, sealed: qq.sealed, answer, attempt: 0 }] });
    act('grade', { q: cur, n: 0, g: J(r.json.results[cur].graded) });
    if (r.json.results[cur].graded.grade !== 'right') act('reveal', { q: cur, correct: r.json.results[cur].graded.correct, why: r.json.results[cur].graded.why });
  }
  act('finish', { t: 100 });
  const s = O.currentOf(space.objs[0]);
  const missedN = s.asked.findIndex((qid) => made.questions.find((x) => x.id === qid).type === 'numeric') + 1;
  globalThis.__logosCalls = [];
  globalThis.__logosPrompts = [];
  globalThis.__logosReply = 'Here is why.';
  globalThis.__logosScript = [];
  const messages = [
    { role: 'user', content: 'Quiz me on monopoly pricing', via: 'quiz' },
    { role: 'assistant', content: "Here's a 3-question quiz on monopoly pricing, from Lecture 6 - Monopoly.pdf." },
    { role: 'user', content: `Why did I miss question ${missedN}?` },
  ];
  const r = await chat.POST(new NextRequest('http://localhost/api/logos/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: J({ surface: 'logos5', sessionId: 'conv_q1', messages, objects: space }) }));
  await r.text();
  await new Promise((done) => setTimeout(done, 40));
  const system = systemOf(globalThis.__logosCalls.find((c) => c.stream));
  ok('the reply is told the quiz: every question, the answer given, the grade, the right answer and why', system.includes(`QUIZ "${made.title}"`) && system.includes(`Q${missedN} [Monopoly pricing; numeric`) && system.includes('Their answer: $20') && system.includes('Right answer: $60') && system.includes('Why: MR = 100 - 4Q'), system.slice(system.indexOf('QUIZ'), system.indexOf('QUIZ') + 900));
  ok('  and what a wrong answer may show is said as a possibility', system.includes('What the answer may show (plausible): Price equal to marginal cost is the competitive outcome.'));
  ok('  told to answer from the question as listed, never to reconstruct one', /never reconstruct or invent a question/.test(system));
  ok('  and never a sealed key', !system.includes('k1.'));
  // MR: a request the quiz took is not a quiz contract in the chat
  const mrOf = async (via) => {
    globalThis.__logosCalls = [];
    const msgs = [{ ...messages[0], ...(via ? { via } : { via: undefined }) }, messages[1], messages[2]];
    const rr = await chat.POST(new NextRequest('http://localhost/api/logos/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: J({ surface: 'logos5', sessionId: 'conv_q1', messages: msgs }) }));
    await rr.text();
    await new Promise((done) => setTimeout(done, 40));
    return { mr: rr.headers.get('x-socria-mr') ?? '', system: systemOf(globalThis.__logosCalls.find((c) => c.stream)) };
  };
  const taken = await mrOf('quiz');
  const typed = await mrOf(null);
  ok('a request the quiz took does not hold answers back in the chat afterwards (MR\'s quiz contract only for a quiz asked in words)', !/quiz/i.test(taken.mr) && /quiz/i.test(typed.mr), `taken=${taken.mr} typed=${typed.mr}`);
}

console.log(`\nquiz-route: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
