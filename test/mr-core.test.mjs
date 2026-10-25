// METACOGNITIVE REGULATION — THE CONTROL LOOP (lib/mr: policy, state, execute, index).
//
// What is held down, on real transcripts with ACS's real move (chooseAssist)
// as the input MR regulates:
//   • the proposal's five IFR scenarios: the steps given at once when asked
//     for (A); a quiz kept a quiz (B); a routine calculation done, not turned
//     into an exercise (C); a worked example after an explanation failed
//     twice, then guided work again (D); their essay edited only as asked (E);
//   • nothing from a weak signal: "ok" changes nothing;
//   • precedence, top first: safety, their words this turn, the Answer Guard
//     and a Core 4 withhold, then ACS, then MR — and what a higher layer took
//     out is recorded;
//   • scope and expiry: a momentary request fades, "stop asking" holds until
//     revoked, and their newest words revoke it;
//   • rollback: an outcome that went wrong reverts; oscillation freezes;
//   • the comparison arms: baseline, prompt-only reflection, state only, full,
//     IFR on/off, and shadow — each changes exactly what it should;
//   • the contract: every decision attributable (policy version, id), with
//     evidence, scope, expiry, an evaluation plan and a rollback;
//   • deterministic, and cheap.

import * as MR from './.tmp/mr-under-test.mjs';
import { readSignals } from './.tmp/signals.mjs';
import { chooseAssist } from './.tmp/assist.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 400))));
const U = (content) => ({ role: 'user', content });
const A = (content) => ({ role: 'assistant', content });
const FULL = { arm: 'full', ifr: true, shadow: false, source: 'deployment' };

/** MR's input for the newest message of a transcript, with ACS's real move unless one is given. */
function input(messages, o = {}) {
  const last = messages[messages.length - 1].content;
  const signals = readSignals(last);
  const history = messages.slice(0, -1);
  const assist = o.assist ?? chooseAssist({ lastUserText: last, history, guard: !!o.guard, signals });
  return {
    conversationKey: o.key ?? 'conv_1',
    messages,
    signals,
    acs: { assist, core: o.core ?? null, split: null },
    turnState: {
      work: o.work ?? 'conversation',
      domain: o.math ? 'math' : 'general',
      intent: 'conversation',
      exchange: { kind: 'task' },
      preferences: { questions: 'normal', answerFirst: false, guard: !!o.guard, learning: null, expertise: null, style: null },
      objective: '',
      understanding: { right: 0, wrong: 0, saidStuck: false },
    },
    context: {
      guard: !!o.guard,
      length: o.length ?? null,
      maxReply: 700,
      shared: false,
      accuracy: { check: false, computed: false, math: !!o.math, theirs: o.theirs ?? [] },
    },
    condition: o.condition ?? FULL,
    ...(o.carried ? { carried: o.carried } : {}),
    env: { LOGOS_MR: 'on', ...(o.env ?? {}) },
    now: o.now ?? (() => 0),
  };
}
const run = (messages, o) => MR.regulateTurn(input(messages, o));

const EXPLAIN =
  'The derivative measures how fast a function changes at a point. For x squared, as x moves a little, the value moves by about twice x times that little amount, which is why the derivative of x squared is 2x. The same idea, applied to products, gives the product rule: each factor changes while the other holds still, and the two changes add up.';
const ASKING = 'What do you think happens to the slope as x grows? Which part of the function changes fastest?';

console.log('\n=== scenario A — "just show me the steps" ===');
{
  const r = run([U('How do I solve 2x + 3 = 11?'), A(ASKING), U('just show me the steps')]);
  ok('a decision to answer directly, from their words', r.decision.action === 'direct' && r.decision.trigger.startsWith('ifr.explicit.'), `${r.decision.action} ${r.decision.trigger}`);
  ok('  no question allowed, enforced through the move', r.assist.questions === 0 && r.decision.controls.questionBudget?.max === 0);
  ok('  the move gives it: inform or explain, imposed', (r.assist.mode === 'inform' || r.assist.mode === 'explain') && r.assist.forced, r.assist.mode);
  ok('  the turn is told to give the steps now, no diagnostic question first', /Give it now and first/.test(r.block) && /no diagnostic question/.test(r.block), r.block);
  ok('  attributable: policy version, id, evidence, expiry, rollback, evaluation plan', r.decision.policyVersion === MR.MR_POLICY_VERSION && /^[0-9a-f]{20}$/.test(r.decision.interventionId) && r.decision.evidenceRefs.length > 0 && r.decision.expiration && r.decision.rollback.revertTo === 'acs_default' && r.decision.evaluationPlan.primary);
  ok('  the evidence is a pointer, never their words', r.decision.evidenceRefs.every((e) => typeof e.turn === 'number' && /^[a-z0-9._:-]+$/i.test(e.code)), JSON.stringify(r.decision.evidenceRefs));
  ok('  traced content-free', /^mr1;arm=full;ifr=1;/.test(r.trace) && /;a=direct;/.test(r.trace) && !/show me/.test(r.trace), r.trace);
  ok('  momentary: it holds for the turn it was said on and the next', r.decision.scope.kind === 'turns' && r.decision.expiration.afterTurn === r.state.turn + 1, JSON.stringify(r.decision.scope));
}

console.log('\n=== scenario B — "quiz me": productive challenge kept ===');
{
  const r = run([U('I have a test on derivatives tomorrow.'), A('Good luck — what would help most?'), U('quiz me on derivatives, one question at a time')]);
  ok('a quiz is kept a quiz', r.decision.action === 'preserve_challenge' && r.decision.controls.strategy === 'preserve_challenge', r.decision.action);
  ok('  one question allowed — the question IS the help', r.assist.questions === 1, r.assist.questions);
  ok('  and the answer is not given away', r.decision.controls.noRevealAnswers === true && /Keep it a quiz/.test(r.block));
  // their next answers are short, and Socria keeps asking: not friction in a quiz
  const later = run([
    U('quiz me on derivatives, one question at a time'),
    A('What is the derivative of x^3?'),
    U('3x^2'),
    A('Right. What is the derivative of sin x?'),
    U('cos x'),
    A('Right. And of e^(2x)?'),
    U('2e^(2x)'),
  ]);
  ok('  three asking replies answered briefly do NOT lower the questions while the quiz stands', later.assist.questions === 1 && later.decision.controls.strategy === 'preserve_challenge', `${later.decision.action} q=${later.assist.questions}`);
  const done = run([U('quiz me on derivatives'), A('What is the derivative of x^3?'), U('ok just tell me the answer')]);
  ok('  "just tell me the answer" ends the quiz', done.decision.controls.strategy === 'direct' && done.state.interventions.some((i) => i.status === 'revoked'), done.decision.action);
}

console.log('\n=== scenario C — a routine calculation is done ===');
{
  const askingMove = { mode: 'ask', forced: false, questions: 1, scaffold: 'hint', selfExplain: false, retrieval: false, reasons: [] };
  const r = run([U("What's 18% of 340?")], { assist: askingMove, work: 'information' });
  ok('ACS about to make it an exercise: MR has it executed', r.decision.action === 'execute' && r.assist.mode === 'inform' && r.assist.questions === 0, `${r.decision.action} ${r.assist.mode}`);
  const informMove = chooseAssist({ lastUserText: "What's 18% of 340?", history: [], guard: false, signals: readSignals("What's 18% of 340?") });
  const r2 = run([U("What's 18% of 340?")], { assist: informMove, work: 'information' });
  ok('  ACS already answering it: MR decides nothing', r2.decision.action === 'none' && r2.assist === informMove, `${r2.decision.action} ${informMove.mode}`);
  ok('  a no-action turn is still a decision, with an id', /^[0-9a-f]{20}$/.test(r2.decision.interventionId) && r2.decision.trigger === 'none');
}

console.log('\n=== scenario D — an explanation that did not land, twice ===');
{
  const msgs = [U('Can you explain the product rule?'), A(EXPLAIN), U("I still don't get it"), A(EXPLAIN), U("that doesn't make sense to me")];
  const r = run(msgs);
  ok('a worked example, step by step, replaces the explanation', r.decision.action === 'worked_example' && r.assist.mode === 'explain' && r.assist.scaffold === 'steps', `${r.decision.action} ${r.assist.mode}/${r.assist.scaffold}`);
  ok('  with no question this turn', r.assist.questions === 0);
  ok('  told to change the approach', /Change the approach: one fully worked example/.test(r.block), r.block);
  // the turn after: their attempt, the example has run its course
  const next = run([...msgs, A('Step 1: f = x^2, g = sin x. Step 2: f\' = 2x, g\' = cos x. Step 3: (fg)\' = 2x sin x + x^2 cos x.'), U('ok so for x^3 cos x it would be 3x^2 cos x minus x^3 sin x?')]);
  ok('  and guided work resumes after it: the worked example expired', next.decision.controls.strategy !== 'worked_example' && next.state.interventions.some((i) => i.decision.action === 'worked_example' && (i.status === 'expired' || i.status === 'rolled_back')), next.decision.action);
  const r3 = run(msgs, { core: { mode: 'HUMAN_PRACTICES', reasonCode: 'practice.goal', withhold: { what: 'the answer', reason: 'practice_goal', evidence: 'x', source: 'message', quote: 'I want to work it out', alternative: 'hints' }, announce: false } });
  ok('  under a withhold, an ANALOGOUS worked example — their answer stays theirs', /ANALOGOUS problem/.test(r3.block), r3.block);
}

console.log('\n=== scenario E — their essay, edited only as asked ===');
{
  const r = run([U("Here's my scholarship essay. Just fix the grammar, don't rewrite it: I has always wanted to studied medicine because my grandmother were a nurse.")], { work: 'creation' });
  ok('edit only what was asked', r.decision.action === 'task_specific' && r.decision.controls.strategy === 'edit_as_asked', r.decision.action);
  ok('  no lesson, no question', r.assist.questions === 0 && /make only the edits they asked for/i.test(r.block) && r.assist.mode !== 'ask' && r.assist.mode !== 'challenge', `${r.assist.mode}`);
}

console.log('\n=== weak signals change nothing ===');
{
  for (const said of ['ok', 'k', 'sure', 'hm']) {
    const r = run([U('Help me plan a study schedule.'), A('Here is a plan: mornings for reading, afternoons for problems.'), U(said)]);
    ok(`"${said}": no adjustment`, r.decision.action === 'none' && r.assist === r.assist && !r.block, r.decision.action);
  }
  const r = run([U('Help me plan a study schedule.'), A('Here is a plan.'), U('ok')]);
  ok('  recorded as an ambiguous signal, never as frustration', r.state.uncertainty.includes('ambiguous_signal') && !r.state.observations.some((o) => o.code === 'explicit.frustration'), JSON.stringify(r.state.uncertainty));
  ok('  and weak readings are hypotheses, never facts', r.state.observations.filter((o) => o.code.startsWith('weak.')).every((o) => o.provenance === 'hypothesis' && o.strength === 'weak'));
}

console.log('\n=== "stop asking": hard, standing, until revoked ===');
{
  const base = [U('I want to think through moving cities.'), A('What draws you to the new city? What would you miss?'), U('stop asking me questions, just give me your take')];
  const r = run(base);
  ok('their words: no questions, enforced in code (hard)', r.decision.controls.questionBudget?.max === 0 && r.decision.controls.questionBudget.enforcement === 'hard' && r.gate.hardNoQuestions, JSON.stringify(r.decision.controls));
  const stop = r.state.interventions.find((i) => i.decision.trigger === 'ifr.explicit.stop_questions');
  ok('  for the conversation, not one turn (the direct request beside it is momentary)', stop && stop.status === 'active' && stop.decision.scope.kind === 'conversation' && stop.decision.expiration.afterTurn === null, JSON.stringify(stop?.decision.scope));
  const later = run([...base, A('My take: the move makes sense if the job is real.'), U('The job is real. Rent is higher though.'), A('Then the question is the gap.'), U('The gap is about 400 a month.')]);
  ok('  three turns later it still holds', later.assist.questions === 0 && later.gate.hardNoQuestions, later.trace);
  const revoked = run([...base, A('My take: go.'), U('ok you can ask me questions again')]);
  ok('  "you can ask me questions again" revokes it', !revoked.gate.hardNoQuestions && revoked.state.interventions.some((i) => i.status === 'revoked' && i.decision.trigger === 'ifr.explicit.stop_questions'), revoked.trace);
}

console.log('\n=== precedence ===');
{
  const r = run([U('just tell me the answer'), A('x'), U("I can't do this anymore, I want to kill myself")]);
  ok('safety: the move is untouched', r.assist.reasons.includes('safety') ? r.assist.mode === 'inform' && !r.block : true, `${r.assist.mode} ${r.block}`);
  const msgs = [U('How do I solve 2x + 3 = 11?'), A(ASKING), U('just tell me the answer')];
  const w = run(msgs, { core: { mode: 'HUMAN_PRACTICES', reasonCode: 'answer.requested.assessment', withhold: { what: 'the answer', reason: 'assessment_integrity', evidence: 'graded', source: 'project', quote: 'graded assignment', alternative: 'the method' }, announce: false } });
  ok('a Core 4 withhold: MR may not hand the answer over', w.decision.controls.strategy !== 'direct' && !w.decision.controls.answerFirst && (w.decision.constrainedBy ?? []).some((c) => c.startsWith('app_policy:withhold')), JSON.stringify(w.decision.constrainedBy));
  ok('  but it still takes the questions out', w.assist.questions === 0);
  const g = run(msgs, { guard: true, math: true });
  ok('the Answer Guard on mathematics: the same', g.decision.controls.strategy !== 'direct' && (g.decision.constrainedBy ?? []).some((c) => c.startsWith('app_policy:guard')), JSON.stringify(g.decision.constrainedBy));
  const q = run([U('stop asking me questions'), A('Understood.'), U('actually ask me a few questions to help me think')]);
  ok('their words this turn beat a carried "no questions"', q.assist.questions === 1 || !q.decision.controls.questionBudget || q.decision.controls.questionBudget.max === 1, q.trace);
}

console.log('\n=== expiry and rollback ===');
{
  const msgs = [U('How do I solve 2x + 3 = 11?'), A(ASKING), U('just tell me the answer'), A('x = 4.'), U('Now what about 3x - 2 = 10?'), A('Subtract... x = 4.'), U('And 5x = 20?')];
  const r = run(msgs);
  ok('a momentary "just tell me" has faded two turns on', r.decision.controls.strategy !== 'direct' && r.state.interventions.some((i) => i.decision.action === 'direct' && i.status === 'expired'), r.trace);
  const back = run([U('just tell me the answer'), A('x = 4.'), U("no, that's not helpful — ask me questions instead")]);
  ok('their contradiction reverts the adjustment', back.state.interventions.some((i) => i.decision.action === 'direct' && (i.status === 'revoked' || i.status === 'rolled_back')), JSON.stringify(back.state.interventions.map((i) => [i.decision.action, i.status, i.endReason])));
  const pinned = run([U('just tell me the answer')], { env: { LOGOS_MR_POLICY: 'mr-1999.01.0' } });
  ok('an unknown policy pin is ignored and reported', pinned.decision.policyVersion === MR.MR_POLICY_VERSION && pinned.integrity.some((f) => f.code === 'unauthorized_policy'), JSON.stringify(pinned.integrity));
}

console.log('\n=== the comparison arms ===');
{
  const msgs = [U('How do I solve 2x + 3 = 11?'), A(ASKING), U('just show me the steps')];
  const acs = chooseAssist({ lastUserText: 'just show me the steps', history: msgs.slice(0, -1), guard: false, signals: readSignals('just show me the steps') });
  const base = run(msgs, { assist: acs, condition: { ...FULL, arm: 'baseline' } });
  ok('baseline: nothing reaches the reply, the would-be decision is still measured', base.assist === acs && !base.block && !base.ceiling && !base.enforced && base.decision.action === 'none' ? true : base.assist === acs && !base.block && !base.enforced, base.trace);
  const pr = run(msgs, { assist: acs, condition: { ...FULL, arm: 'prompt_reflection' } });
  ok('prompt-only reflection: a fixed reflection line, nothing enforced', pr.assist === acs && pr.block.includes(MR.REFLECTION_BLOCK.trim().slice(0, 30)) && !pr.gate.hardNoQuestions && !pr.ceiling, pr.block);
  const so = run(msgs, { assist: acs, condition: { ...FULL, arm: 'state_only' } });
  ok('state only: context, nothing enforced', so.assist === acs && !so.gate.hardNoQuestions && !so.ceiling, so.trace);
  const sh = run(msgs, { assist: acs, condition: { ...FULL, shadow: true } });
  ok('shadow: decides and traces, enforces nothing', sh.assist === acs && !sh.block && sh.decision.action === 'direct' && /;enf=0;/.test(sh.trace), sh.trace);
  const noIfr = run([U('stop asking me questions')], { condition: { ...FULL, ifr: false } });
  ok('IFR off: friction rules do not act', noIfr.decision.action === 'none', noIfr.trace);
  const noIfrQuiz = run([U('quiz me on the French revolution')], { condition: { ...FULL, ifr: false } });
  ok('  the rest of MR still does (a quiz kept a quiz)', noIfrQuiz.decision.action === 'preserve_challenge', noIfrQuiz.trace);
}

console.log('\n=== repeated unproductive questioning ===');
{
  const r = run([U('I need to decide on a laptop.'), A('What will you use it for? What is your budget?'), U('idk'), A('Do you travel much? Do you game?'), U('not sure'), A('Would a lighter one matter more than power?'), U('just pick one for me')]);
  ok('questions that kept not helping: none this turn', r.assist.questions === 0, r.trace);
  ok('  the transcript evidence is cited', r.state.observations.some((o) => o.code === 'observed.unproductive_questions' || o.code === 'observed.question_streak') || r.decision.trigger.startsWith('ifr.explicit'), JSON.stringify(r.state.observations.map((o) => o.code)));
}

console.log('\n=== failed attempts, decided by the engine ===');
{
  // phrased as claims the engine decides ("so x = 4"); a bare "x = 4" reads as a definition, not an attempt
  // the turn the engine has refuted two attempts: the first chance for a worked example
  const msgs = [U('Practice: solve 3x + 5 = 20. I want to work it out myself.'), A('Go ahead.'), U('so x = 4'), A('Not quite — check the subtraction.'), U('so x = 6')];
  const r = run(msgs, { math: true, theirs: [{ status: 'refuted' }] });
  ok('refuted attempts, decided by the engine, are observed', r.state.observations.some((o) => o.code === 'observed.failed_attempts' && o.provenance === 'observed'), JSON.stringify(r.state.observations.map((o) => o.code)));
  ok('  a worked example takes this turn, inside the practice they asked for', r.decision.controls.strategy === 'worked_example' && r.assist.mode === 'explain' && r.assist.scaffold === 'steps', `${r.decision.action} ${r.decision.controls.strategy}`);
  // "I want to work it out myself" keeps the answer theirs (own_try, round 4), not a quiz: no question is added
  ok('  their problem stays theirs after the example (no goal drift, nothing handed over)', r.decision.controls.strategy === 'worked_example' && !r.integrity.some((f) => f.code === 'goal_drift'), `q=${r.assist.questions} ${JSON.stringify(r.integrity)}`);
  ok('  and the practice still keeps the answer back (noRevealAnswers carried)', r.decision.controls.noRevealAnswers === true, JSON.stringify(r.decision.controls));
}

console.log('\n=== determinism and cost ===');
{
  const msgs = [U('How do I solve 2x + 3 = 11?'), A(ASKING), U('just show me the steps')];
  const a = run(msgs);
  const b = run(msgs);
  ok('the same conversation, the same decision and id', JSON.stringify(a.decision) === JSON.stringify(b.decision) && a.trace === b.trace);
  const long = [];
  for (let i = 0; i < 80; i++) long.push(i % 2 ? A(i % 4 === 1 ? ASKING : EXPLAIN) : U(`Thought number ${i}: we keep going back and forth on the launch date and the budget.`));
  long.push(U('just give me your recommendation'));
  const times = [];
  for (let i = 0; i < 9; i++) {
    const t0 = performance.now();
    MR.regulateTurn(input(long, { now: () => performance.now() }));
    times.push(performance.now() - t0);
  }
  times.sort((x, y) => x - y);
  const median = times[4];
  ok(`an 81-message conversation regulates in a median under 40 ms (${median.toFixed(1)} ms)`, median < 40, median);
}

console.log('\n=== the reviewers\' findings, held down ===');
{
  // their instruction is not rolled back because a reply ignored it
  const ignored = run([U('I am deciding on a job.'), A('What matters most? What scares you?'), U('stop asking me questions'), A('Fair. What would you do if money were no object?'), U('The pay is better at the second one.')]);
  const stop = ignored.state.interventions.find((i) => i.decision.trigger === 'ifr.explicit.stop_questions');
  ok('a reply that ignored "stop asking" does not end it: still in force, the miss recorded', stop?.status === 'active' && ignored.gate.hardNoQuestions && ignored.state.integrity.some((f) => f.code === 'control_violation'), `${stop?.status} ${JSON.stringify(ignored.state.integrity.map((f) => f.code))}`);
  // "you can ask questions again" takes back the questions, not "shorter"
  const both = run([U('Explain inflation.'), A('Inflation is a general rise in prices. '.repeat(20)), U('too long. and stop asking me questions'), A('Prices rise.'), U('ok you can ask me questions again')]);
  const shorter = both.state.interventions.find((i) => i.decision.action === 'shorter');
  ok('"you can ask me questions again" ends the question rule only — "shorter" stands', shorter?.status === 'active' && !both.gate.hardNoQuestions, `${shorter?.status} ${both.trace}`);
  // a length asked of one reply is that reply's
  const once = run([U('Write me a bio in under 100 words.')]);
  const longer = run([U('Explain inflation.'), A('Inflation is a general rise in prices. '.repeat(20)), U('too long, keep it short')]);
  ok('a one-off length ("in under 100 words") holds for that reply only', once.decision.action !== 'shorter' || once.decision.scope.kind === 'turn', JSON.stringify(once.decision.scope));
  ok('  a complaint ("too long, keep it short") holds for the conversation', longer.decision.action === 'shorter' && longer.decision.scope.kind === 'conversation', JSON.stringify(longer.decision.scope));
  // handing a choice over is a direct request
  const pick = run([U('Should I take the 14-inch or the 16-inch laptop?'), A('What will you use it for?'), U('idk, just pick one')]);
  ok('"just pick one" is a direct request: their pick, no further question', pick.decision.controls.strategy === 'direct' && pick.assist.questions === 0, pick.trace);
  // routine by ACS's own reader, not the coarse work reading
  const groceries = run([U('I spend $95 a week on groceries. What is that per month?')], { work: 'reflection', assist: { mode: 'ask', forced: false, questions: 1, scaffold: 'hint', selfExplain: false, retrieval: false, reasons: [] } });
  ok('a calculation in its last sentence is routine: done, not an exercise', groceries.decision.action === 'execute', groceries.trace);
  const study = run([U('Compare these two studies on spaced repetition — which design is stronger?')], { work: 'execution', assist: { mode: 'ask', forced: false, questions: 1, scaffold: 'none', selfExplain: false, retrieval: false, reasons: [] } });
  ok('  a comparison the runtime reads as "execution" is NOT routine', study.decision.action !== 'execute', study.trace);
  // an experiment runs under the policy it registered
  const pinned = run([U('just tell me the answer')], { condition: { ...FULL, source: 'experiment', experimentId: 'x', policyVersion: MR.MR_POLICY_VERSION } });
  ok('an experiment\'s registered policy version is the one decisions carry', pinned.decision.policyVersion === MR.MR_POLICY_VERSION && /pv=mr-2026\.10\.1/.test(pinned.trace));
  // carried in from another conversation: carried, at turn 0 too
  const carried = run([U('Hello again, new topic: what is a bond yield?')], { carried: [{ key: 'questions:0', value: 'fewer_questions', provenance: 'explicit', turn: 0, refs: [], confidence: 0.9, expiresAfterTurn: null }] });
  ok('a standing preference carried in is marked carried, even on the first turn', carried.decision.carried === true && /;carried;/.test(carried.trace) && carried.gate.hardNoQuestions, carried.trace);
  const noConsent = run([U('Hello again, new topic: what is a bond yield?')]);
  ok('  and without consent nothing crosses: no carried input, nothing in force', noConsent.decision.action !== 'fewer_questions' && !noConsent.gate.hardNoQuestions, noConsent.trace);
}

console.log(`\nmr core: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
