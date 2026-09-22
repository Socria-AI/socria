// Questions are earned, not automatic.
//
// Core 4 had an interrogation habit, and it lived in the Intervention Router:
// ASK was the fallback of exploring and the default of four other kinds of
// work, and the router took no history, so a question after a question after
// a question cost nothing. The person answers; Socria acknowledges; Socria
// asks again — and the answer, which usually held exactly what was needed,
// is never used.
//
// These are the behavioural acceptance tests for the fix. Each builds the
// state the Cognitive State reader would report for a real moment in a real
// conversation, and asserts what the router, the move block and the Answer
// Guard do with it. What they cannot prove is that the reader REPORTS that
// state — that is a model's judgement, tested end to end through the real
// chat route in core4-questions-e2e.test.mjs with the state scripted, and in
// the end only by conversation.

import { EMPTY_STATE, renderState, sanitizeState } from './.tmp/state.mjs';
import {
  route, renderMove, questionThreshold, questionStreak, asksQuestion, NO_HISTORY,
} from './.tmp/router.mjs';
import { checkStructure, withoutClosingQuestion } from './.tmp/guard.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));

const S = (over = {}) => ({ ...EMPTY_STATE, ...over });
const H = (questionStreak) => ({ questionStreak });
const ACTIVE = new Set(['OBSERVE', 'CONNECT', 'REFINE', 'CLARIFY', 'SYNTHESIZE', 'CHALLENGE', 'HINT', 'TEACH', 'EXPLAIN', 'DIRECT', 'RETRIEVE']);

// ── the conversation in the brief ───────────────────────────────────

const turn1 = S({
  taskKind: 'decide',
  currentGoal: 'choosing where to study',
  latest: 'information',
  positions: ['McCombs has a strong startup scene compared to other colleges'],
});
const turn2 = S({
  taskKind: 'decide',
  currentGoal: 'choosing where to study',
  latest: 'answer',
  resolved: true,
  newRelation: 'McCombs startup ecosystem → matters because of → their long-term goal of being an entrepreneur',
  positions: ['McCombs has a strong startup scene', 'wants to be an entrepreneur long term'],
});
const turn3 = S({
  taskKind: 'decide',
  latest: 'information',
  newRelation: 'trouble finding startup funding and investors at UTA → is evidence for → why the McCombs ecosystem matters',
  positions: ['McCombs has a strong startup scene', 'wants to be an entrepreneur long term', 'UTA has been hard for finding funding'],
});

console.log('=== 1. a short answer is used, not followed by another question ===');
{
  // "want to be an entrepreneur longterm" — four words, and exactly what was
  // asked for. Socria asked one question to get here; it had just done so.
  const m = route(turn2, H(1));
  ok('the answer is not met with another question', m.intervention !== 'ASK', m.intervention);
  ok('it is USED: the connection they made is made explicit', m.intervention === 'CONNECT', m.intervention);
  ok('the objective carries the connection itself', /entrepreneur/.test(m.objective) && /McCombs/.test(m.objective), m.objective);
  ok('and forbids asking them to elaborate', /Do not ask them to elaborate/.test(m.objective));
  ok('the reply may not end in a question', m.endsOpen === false);

  // Even a one-word answer that connects nothing new is used before
  // anything else is asked for.
  const yes = route(S({ taskKind: 'explore', latest: 'answer', resolved: true, positions: ['yes, that one'] }), H(1));
  ok('a one-word answer is worked with, not questioned', yes.intervention !== 'ASK' && ACTIVE.has(yes.intervention), yes.intervention);

  // And the next turn: new information, a sharper comparison. No question
  // has been asked since, so the pressure has reset — and there is still
  // nothing to ask, because there is something to say.
  const m3 = route(turn3, H(0));
  ok('the UTA detail is used as evidence, not questioned', m3.intervention === 'CONNECT' && /funding/.test(m3.objective), `${m3.intervention}: ${m3.objective}`);
}

console.log('\n=== 2. question pressure rises with every question in a row ===');
{
  ok('the threshold strictly rises', [0, 1, 2, 3, 4, 5].every((n) => questionThreshold(n + 1) > questionThreshold(n)));
  ok('and never stops rising — no count at which asking is free', questionThreshold(50) > questionThreshold(49));

  // A discovery question: defensible once, not twice.
  const open = S({ taskKind: 'explore' });
  ok('first: a question may open the topic', route(open, H(0)).intervention === 'ASK');
  ok('ASK → ASK: the same weak reason no longer suffices', route(open, H(1)).intervention !== 'ASK', route(open, H(1)).intervention);
  const decide = S({ taskKind: 'decide' });
  ok('deciding with nothing on the table: asked once', route(decide, H(0)).intervention === 'ASK');
  ok('...then not again on the same grounds', route(decide, H(1)).intervention !== 'ASK', route(decide, H(1)).intervention);

  // The reader MISSES the answer (no latest/resolved/newRelation) — the old
  // failure mode exactly. Pressure alone still breaks the loop.
  const blind = S({ taskKind: 'decide', currentGoal: 'choosing a college' });
  ok('even if the state reader misses that they answered, the loop breaks',
     route(blind, H(1)).intervention !== 'ASK', route(blind, H(1)).intervention);

  // Monotone, across the whole grid: more recent questions never make a
  // question MORE likely.
  const kinds = ['learn', 'decide', 'create', 'debug', 'explore'];
  const grid = [];
  for (const taskKind of kinds)
    for (const demonstratedUnderstanding of ['none', 'partial'])
      for (const practice of ['none', 'retrieval'])
        for (const blockingUnknown of ['', 'the exact error text'])
          for (const positions of [[], ['a view']])
            grid.push(S({ taskKind, demonstratedUnderstanding, practice, blockingUnknown, positions }));
  let violations = 0;
  for (const st of grid) {
    let wasAsk = true;
    for (let n = 0; n < 6; n++) {
      const asks = route(st, H(n)).intervention === 'ASK';
      if (asks && !wasAsk) violations++;
      wasAsk = asks;
    }
  }
  ok(`monotone over ${grid.length} states × 6 streaks: once declined, never re-allowed by more questions`, violations === 0, String(violations));
  const asksAt = (n) => grid.filter((st) => route(st, H(n)).intervention === 'ASK').length;
  ok(`fewer questions are allowed at each step (${[0, 1, 2, 3].map(asksAt).join(' → ')})`,
     asksAt(0) > asksAt(1) && asksAt(1) > asksAt(2) && asksAt(2) >= asksAt(3));
}

console.log('\n=== 3. a necessary question still gets asked ===');
{
  // Debugging with nothing to go on: Socria cannot usefully proceed without
  // the error, and what they tried is theirs to report.
  const blocked = S({ taskKind: 'debug', blockingUnknown: 'the exact error message the build prints' });
  const a0 = route(blocked, H(0)), a1 = route(blocked, H(1));
  ok('asked', a0.intervention === 'ASK');
  ok('and asked AGAIN right after a question, because it is necessary', a1.intervention === 'ASK', `${a1.intervention} — ${a1.because}`);
  ok('asking for exactly the unknown, nothing broader', /exact error message/.test(a1.objective), a1.objective);
  ok('the reason names the pressure it cleared', /against 2\.5 after 1 question/.test(a1.because), a1.because);

  // A third in a row needs more than necessity alone: necessity AND the
  // answer being valuable work.
  const both = S({ taskKind: 'learn', demonstratedUnderstanding: 'partial', practice: 'retrieval', blockingUnknown: 'which course this is for' });
  ok('ASK → ASK → ASK still possible when the case is strong enough', route(both, H(2)).intervention === 'ASK', route(both, H(2)).because);

  // Not passive. When a question is declined, what replaces it is a move
  // that does something — never silence, never a bare acknowledgement.
  for (const [name, st] of [['exploring', S({ taskKind: 'explore' })], ['debugging', S({ taskKind: 'debug' })],
                            ['learning', S({ taskKind: 'learn', demonstratedUnderstanding: 'partial' })],
                            ['creating', S({ taskKind: 'create' })], ['deciding', S({ taskKind: 'decide' })]]) {
    const m = route(st, H(3));
    ok(`${name}, under heavy pressure: an active move (${m.intervention}), not passivity`, ACTIVE.has(m.intervention) && m.objective.length > 20);
  }
}

console.log('\n=== 4. an observation is a complete reply ===');
{
  const m = route(S({ taskKind: 'explore', latest: 'information', positions: ['I only feel productive in the mornings'] }), H(0));
  ok('new material in exploration is worked with', ['REFINE', 'OBSERVE', 'CONNECT'].includes(m.intervention), m.intervention);
  ok('the move ends without handing back a question', m.endsOpen === false);
  ok('the model is told to stop when the move is made', /End when the move is made/.test(renderMove(m)) && /One sentence can be the whole reply/.test(renderMove(m)));
  ok('and a short, question-free move is read before it is sent', m.guard === true);

  // The reflexive tail, removed before anyone sees it.
  const draft = 'Then it isn’t a general advantage of McCombs — it’s about being around people who build companies. How do you see that fitting your goals?';
  const v = checkStructure(route(turn2, H(1)), draft);
  ok('a closing question is taken off', v?.verdict === 'revise' && !/\?/.test(v.revised), JSON.stringify(v));
  ok('and nothing else is', v?.revised === 'Then it isn’t a general advantage of McCombs — it’s about being around people who build companies.');
  ok('a reply that is only a question is rewritten, not sent empty',
     checkStructure(route(turn2, H(1)), 'What do you think the key factors are?')?.verdict === 'regenerate');
  ok('a one-sentence observation passes untouched',
     checkStructure(route(turn3, H(0)), 'That’s a stronger comparison: a specific ceiling you have actually hit, not a general impression.') === null);
  ok('a question in quotation is not mistaken for asking', withoutClosingQuestion('She asked “why?” and meant it.') === 'She asked “why?” and meant it.');
}

console.log('\n=== 5. when producing it IS the learning, the question stays ===');
{
  const retrieval = S({ taskKind: 'learn', demonstratedUnderstanding: 'partial', practice: 'retrieval', currentFocus: 'the product rule' });
  const r0 = route(retrieval, H(0)), r1 = route(retrieval, H(1));
  ok('retrieval practice asks', r0.intervention === 'ASK');
  ok('and still asks right after a question — the question is the practice', r1.intervention === 'ASK', r1.because);
  ok('a question that makes them recall it', /recall it themselves/.test(r1.objective), r1.objective);
  ok('withholding the answer', /the answer/.test(r1.withholds ?? ''));
  const pred = route(S({ taskKind: 'learn', demonstratedUnderstanding: 'partial', practice: 'prediction' }), H(0));
  ok('prediction asks them to predict', pred.intervention === 'ASK' && /predict/.test(pred.objective));
  const self = route(S({ taskKind: 'learn', demonstratedUnderstanding: 'partial', practice: 'self-explanation' }), H(1));
  ok('self-explanation asks them to explain it', self.intervention === 'ASK' && /own words/.test(self.objective));
  // After enough questions, the ladder's next rung — not silence, not a
  // lecture, and not a fourth question.
  const worn = route(retrieval, H(2));
  ok('after a run of practice questions, a hint — Core 4\'s own ladder', worn.intervention === 'HINT', worn.intervention);
  // They answered the practice question, correctly. Not the next question —
  // confirmation, said plainly.
  const right = route({ ...retrieval, attempt: 'right', latest: 'answer', resolved: true }, H(1));
  ok('a correct answer is confirmed, not met with the next question', right.intervention === 'OBSERVE' && /right/.test(right.objective), right.intervention);
  ok('a well-formed practice question passes the guard', checkStructure(r1, 'Without looking it up — what does the product rule say?') === null);
  ok('two questions at once do not', checkStructure(r1, 'What does the product rule say? And when would you use it?')?.verdict === 'regenerate');
}

console.log('\n=== 6. a plain request for information gets information ===');
{
  for (const n of [0, 1, 3]) {
    const m = route(S({ taskKind: 'lookup', latest: 'request' }), H(n));
    ok(`a lookup after ${n} question(s): RETRIEVE, no question back`, m.intervention === 'RETRIEVE' && /no question back/.test(m.objective) && !m.endsOpen);
  }
  const asked = route(S({ taskKind: 'explore', latest: 'question' }), H(0));
  ok('a question put to Socria while exploring is answered, not returned', asked.intervention === 'EXPLAIN', asked.intervention);
  ok('urgent debugging is directed, not questioned', route(S({ taskKind: 'debug', urgency: 'high' }), H(0)).intervention === 'DIRECT');
}

console.log('\n=== 7. a relationship they have just established is used ===');
{
  // The answer does not add a new THING; it adds a relationship between two
  // things already on the table — and in the Mind Graph, an edge between
  // existing nodes. The move must use that edge, not ask for it again.
  const m = route(turn2, H(0));
  ok('even with no question pressure at all, the relationship is used', m.intervention === 'CONNECT', m.intervention);
  ok('the move names both ends of it', /startup ecosystem/.test(m.objective) && /long-term goal/.test(m.objective));
  ok('the model is told it is no longer a general point', /not a general point any more/.test(m.objective));
  ok('and the state the model reads says so plainly', /They just connected: McCombs startup ecosystem/.test(renderState(turn2)));
  // But an answer does not forbid a NECESSARY next question: they answered
  // "what is the error?", and which version it is still blocks everything.
  const stillBlocked = route(S({ taskKind: 'debug', latest: 'answer', resolved: true,
    blockingUnknown: 'which version of the library they are on' }), H(1));
  ok('an answer does not block a different, necessary question', stillBlocked.intervention === 'ASK' && /version/.test(stillBlocked.objective),
     `${stillBlocked.intervention}: ${stillBlocked.because}`);
  ok('while an answer with nothing blocking is used', route({ ...turn2, blockingUnknown: '' }, H(1)).intervention === 'CONNECT');

  // Only a tension outranks using it — contradiction has to be named first.
  const torn = route({ ...turn2, tensions: ['wants a startup scene but also wants to stay near family in Arlington'] }, H(0));
  ok('a contradiction is named before anything else', torn.intervention === 'CHALLENGE', torn.intervention);
}

console.log('\n=== the transcript, as pressure ===');
{
  const conv = [
    { role: 'user', content: 'McCombs has a strong startup scene compared to other colleges.' },
    { role: 'assistant', content: 'A vibrant startup scene can offer great networking. How do you see that contributing to your goals?' },
    { role: 'user', content: 'want to be an entrepreneur longterm' },
  ];
  ok('one question in a row', questionStreak(conv) === 1);
  ok('two', questionStreak([...conv, { role: 'assistant', content: 'What factors matter most?' }, { role: 'user', content: 'funding' }]) === 2);
  ok('broken by a reply that did not ask', questionStreak([...conv, { role: 'assistant', content: 'That changes it.' }, { role: 'user', content: 'yeah' }]) === 0);
  ok('a question inside code is not a question to them', !asksQuestion('Try `x ? a : b` here.'));
  ok('nor one inside a quotation', !asksQuestion('You wrote “is it worth it?” — it is.'));
  ok('a mid-reply question still counts', asksQuestion('Is that the real issue? I think it is the funding.'));
  ok('an unreadable state defaults to not having answered', sanitizeState({}).resolved === false && sanitizeState({ resolved: 'yes' }).resolved === false);
  ok('and to no blocking unknown', sanitizeState({ blockingUnknown: 42 }).blockingUnknown === '');
  ok('NO_HISTORY is a streak of zero', NO_HISTORY.questionStreak === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
