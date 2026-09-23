// Phase 0: the questioning / withholding failures, reproduced against the
// router as it stood on dev at b8a8004 BEFORE the Core 4 rebuild.
//
// Each case states the behaviour Core 4 must have. They were written and run
// first against the old router and failed there (the output is recorded in
// docs/CORE-4-EVALS.md, "Reproduced before the fix"); they now run against
// the Core 4 decision path and must pass. The states are what the reader
// would report for a real moment; the assertions are about what Socria may
// and may not do with it.

import { EMPTY_STATE } from './.tmp/state.mjs';
import { route, renderMove } from './.tmp/router.mjs';
import { checkStructure } from './.tmp/guard.mjs';
import { buildSystemPrompt, EMPTY_MEMORY } from './.tmp/socria-prompt.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));
const S = (over = {}) => ({ ...EMPTY_STATE, ...over });
const H = (questionStreak) => ({ questionStreak });

/** Does the move keep something back from the person? */
const withholds = (m) => !!m.withholds;
/** May the reply to this move end by asking the person something? */
const mayAsk = (m) => m.endsOpen || (typeof m.maxQuestions === 'number' && m.maxQuestions > 0);

console.log('=== a wrong attempt is not, by itself, a reason to withhold the correction ===');
for (const taskKind of ['debug', 'decide', 'create', 'explore']) {
  const m = route(S({ taskKind, attempt: 'wrong', latest: 'attempt' }), H(0));
  ok(`${taskKind}: a wrong attempt gets the correction`, !withholds(m), `${m.intervention} withholds "${m.withholds}"`);
}
{
  // The same wrong attempt from somebody who has SAID they are practising is
  // the one case where holding the answer back is the point. (This used to
  // be `|| true` — an assertion that could not fail. Council D16.)
  const said = { value: 'yes', source: 'explicit', confidence: 1, evidence: 'I want to work it out myself' };
  const m = route(S({ taskKind: 'learn', work: 'verification', attempt: 'wrong', latest: 'attempt', learningGoal: said }), H(0));
  ok('a learner who SAID they are practising keeps the redo: VERIFY, corrected answer withheld as practice_goal',
     m.intervention === 'VERIFY' && m.allocation?.withhold?.reason === 'practice_goal', `${m.intervention} ${JSON.stringify(m.allocation?.withhold)}`);
  const guessed = { value: 'yes', source: 'inferred', confidence: 0.95, evidence: 'looks like homework' };
  const g = route(S({ taskKind: 'learn', work: 'verification', attempt: 'wrong', latest: 'attempt', learningGoal: guessed }), H(0));
  ok('the same attempt with only a GUESSED learning goal gets the correction', !withholds(g) && g.intervention === 'CORRECT', g.intervention);
}

console.log('\n=== test-lint: no assertion that cannot fail ===');
{
  const { readdirSync, readFileSync } = await import('node:fs');
  const { dirname, join } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const dir = dirname(fileURLToPath(import.meta.url));
  const TAUTOLOGY = new RegExp(['\\|\\|', '\\s*true\\s*\\)|&&', '\\s*false\\s*\\)'].join(''));
  const offenders = readdirSync(dir).filter((f) => f.endsWith('.test.mjs')).filter((f) => TAUTOLOGY.test(readFileSync(join(dir, f), 'utf8').replace(/\/\/.*$/gm, '')));
  ok('no test file ORs an assertion with true', offenders.length === 0, offenders.join(', '));
}

console.log('\n=== debugging is not, by itself, a reason to withhold the fix ===');
{
  const m = route(S({ taskKind: 'debug', attempt: 'none', latest: 'request', currentFocus: 'TypeError in the build' }), H(0));
  ok('a debugging request with no attempt gets help that can include the fix', !withholds(m), `${m.intervention} withholds "${m.withholds}"`);
  const m2 = route(S({ taskKind: 'debug', attempt: 'partial', latest: 'attempt' }), H(0));
  ok('a debugger part-way through is not denied the fix', !withholds(m2), `${m2.intervention} withholds "${m2.withholds}"`);
}

console.log('\n=== the question budget binds every move, not only the one labelled ASK ===');
for (const streak of [2, 3, 5]) {
  const moves = [
    route(S({ taskKind: 'debug', attempt: 'none', latest: 'answer' }), H(streak)),
    route(S({ taskKind: 'learn', demonstratedUnderstanding: 'partial', latest: 'answer' }), H(streak)),
    route(S({ taskKind: 'decide', positions: ['stay'], latest: 'answer' }), H(streak)),
    route(S({ taskKind: 'learn', demonstratedUnderstanding: 'solid', latest: 'answer' }), H(streak)),
  ];
  for (const m of moves) {
    ok(`after ${streak} questions in a row, ${m.intervention} may not end in another question`, !mayAsk(m), `${m.intervention} endsOpen=${m.endsOpen}`);
  }
}
{
  // The guard is the last line: a HINT that is nothing but questions, after
  // the budget is spent, must not reach the person unchanged.
  const hint = route(S({ taskKind: 'learn', demonstratedUnderstanding: 'partial', latest: 'answer' }), H(4));
  const draft = 'Have you checked whether the variables are independent? What happens to the variance if they are not?';
  const g = checkStructure(hint, draft);
  ok('an all-question "hint" after four questions in a row is stopped', !!g && g.verdict !== 'approve', JSON.stringify(g));
}

console.log('\n=== an empty reading must not default to interrogation ===');
{
  const m = route(EMPTY_STATE, H(0));
  ok('a failed state read does not route to ASK', m.intervention !== 'ASK', m.intervention);
}

console.log('\n=== TEACH is allowed to teach ===');
{
  const teach = route(S({ taskKind: 'learn', demonstratedUnderstanding: 'none', confusions: ['what a derivative of a composition is', 'where the inner function goes'] }), H(0));
  const draft = "The chain rule says the derivative of f(g(x)) = f'(g(x)) · g'(x). Now try it on your problem.";
  const g = checkStructure(teach, draft);
  ok('a TEACH that states the rule and hands the application back is not rejected', !g || g.verdict === 'approve' || g.verdict === 'ALLOW', JSON.stringify(g));
}

console.log('\n=== one memory: Core 4 does not receive the older memory layers ===');
{
  const memory = { ...EMPTY_MEMORY, goals: ['You want to start a company'] };
  const journey = {
    understanding: { narrative: ['You keep weighing security against freedom'], openThreads: [{ topic: 'the offer', status: 'undecided', lastTouched: 1 }], timeline: [], nextQuestions: [], entries: [] },
    conversationStart: true,
  };
  const { prompt } = buildSystemPrompt('core-4', 'balanced', memory, null, journey);
  ok('no Thread Memory block', !prompt.includes('=== Thread Memory ==='));
  ok('no Thinking Journey block', !/Thinking Journey/.test(prompt));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
