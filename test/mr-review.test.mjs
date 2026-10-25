// METACOGNITIVE REGULATION — THE ADVERSARIAL REVIEW, HELD DOWN.
//
// Every confirmed finding of the review of the first MR build that lives in
// the pure modules (the control loop, precedence, the deliberative loop, the
// reply filters, the arms) has a case here, written from the reviewer's own
// reproduction, so the defect cannot come back unnoticed. The route-level
// findings are in mr-route; the store and settings ones in mr-store, mr-api
// and mr-settings-ui.

import * as MR from './.tmp/mr-under-test.mjs';
import { readSignals } from './.tmp/signals.mjs';
import { chooseAssist } from './.tmp/assist.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 400))));
const U = (content) => ({ role: 'user', content });
const A = (content) => ({ role: 'assistant', content });
const FULL = { arm: 'full', ifr: true, shadow: false, source: 'deployment' };
const J = JSON.stringify;

function input(messages, o = {}) {
  const last = messages[messages.length - 1].content;
  const signals = readSignals(last);
  const history = messages.slice(0, -1);
  const assist = o.assist ?? chooseAssist({ lastUserText: last, history, guard: !!o.guard, signals });
  return {
    conversationKey: o.key ?? 'conv_r',
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
    ...(o.resetTurn !== undefined ? { resetTurn: o.resetTurn } : {}),
    env: { LOGOS_MR: 'on', ...(o.env ?? {}) },
    now: () => 0,
  };
}
const run = (messages, o) => MR.regulateTurn(input(messages, o));
const rec = (r, trigger) => r.state.interventions.filter((i) => i.decision.trigger === trigger).pop();
const codes = (r) => r.state.observations.filter((o) => o.turn === r.state.turn).map((o) => o.code);
const LONG = 'Vaccines show the immune system a harmless piece of a germ, so it can learn to recognise it. '.repeat(6);
const STOP = [U('I am deciding whether to move cities for a job.'), A('What draws you there? What would you miss?'), U('stop asking me questions, just give me your take'), A('My take: move if the job is firm.')];

console.log('\n=== F1 / MR-R5: deliberation narrows what is in force, never replaces it ===');
{
  const msgs = [U('stop asking me questions. Explain how vaccines train the immune system.'), A(LONG), U('make it shorter, but go into more detail on memory cells')];
  const fast = run(msgs);
  ok('the fold names the conflict', fast.needsDeliberation === 'conflicting_instructions', fast.needsDeliberation);
  const d = await MR.deliberate(fast, input(msgs), { used: 0, modelAllowed: false });
  const r = d.regulation;
  ok('deterministic "none": their "stop asking" still holds, hard', r.gate.hardNoQuestions && r.assist.questions === 0, r.trace);
  ok('  the claim filter stays armed', r.gate.dropUnsupportedClaims === true);
  ok('  and the stop record is still active', rec(r, 'ifr.explicit.stop_questions')?.status === 'active');
  let asked = 0;
  const create = async () => (asked++, { choices: [{ message: { content: '{"action":"shorter"}' } }] });
  const m = (await MR.deliberate(fast, input(msgs), { used: 0, modelAllowed: true, create, model: 'stub' })).regulation;
  ok('a model pick of "shorter" is composed with the stop: q0 hard AND the ceiling', asked === 1 && m.gate.hardNoQuestions && m.ceiling !== null && /q0h/.test(m.trace) && /v\d+/.test(m.trace), m.trace);
  ok('  and counted as a model deliberation (the budget counts calls)', m.timing.modelDeliberated === true);
}

console.log('\n=== F2: ending the quiz ends it ===');
{
  const quiz = [U('quiz me on world capitals'), A('Great. What is the capital of Peru?'), U('Lima'), A('Right! What is the capital of Kenya?')];
  for (const end of ["That's enough for today, thanks. Unrelated: I spend $95 a week on groceries, what is that per month?", "let's stop there. Now can you help me write an email to my landlord?", "I'm done for now. Separate question: how do I boil an egg?", "ok let's switch. Here's my cover letter, just fix the grammar: I has went to the store."]) {
    const r = run([...quiz, U(end)]);
    ok(`"${end.slice(0, 36)}…" ends the quiz`, rec(r, 'mr.explicit.quiz')?.status !== 'active' && r.decision.controls.strategy !== 'preserve_challenge' && !r.decision.controls.noRevealAnswers && !/QUIZZED/.test(r.block), `${r.trace} ${rec(r, 'mr.explicit.quiz')?.endReason}`);
    ok('  and no question is widened back in', !r.assist.reasons.includes('mr:user_instruction:quiz'));
  }
  const still = run([...quiz, U('Nairobi')]);
  ok('an answer inside the quiz keeps it a quiz', still.decision.controls.strategy === 'preserve_challenge', still.trace);
}

console.log('\n=== F3: a complaint about content does not revoke their instruction ===');
{
  const r = run([U('stop asking me questions. What is a good laptop for under 800 dollars?'), A('The Acer Swift Go is a good pick.'), U("that doesn't answer it, I need one for video editing")]);
  ok('"stop asking" survives "that doesn\'t answer it"', rec(r, 'ifr.explicit.stop_questions')?.status === 'active' && r.gate.hardNoQuestions, `${rec(r, 'ifr.explicit.stop_questions')?.endReason} ${r.trace}`);
  const s = run([U('Explain photosynthesis. Keep your answers short from now on.'), A('Plants turn light into sugar.'), U("that's not helpful, I meant the light reactions specifically")]);
  ok('"keep your answers short" survives "not helpful"', rec(s, 'ifr.explicit.shorter')?.status === 'active', rec(s, 'ifr.explicit.shorter')?.endReason);
  const q = run([U('quiz me on photosynthesis'), A('What gas do plants take in?'), U("not helpful, that's too easy")]);
  ok('a quiz survives "not helpful, that\'s too easy"', rec(q, 'mr.explicit.quiz')?.status === 'active', rec(q, 'mr.explicit.quiz')?.endReason);
}

console.log('\n=== F4: precedence reads what IFR confirmed, not raw signals ===');
{
  for (const t of ["ok. don't quiz me, just explain the tradeoffs", 'the exam will test me on this so be thorough']) {
    const r = run([...STOP, U(t)]);
    ok(`"${t}" keeps the hard stop`, r.gate.hardNoQuestions && !(r.decision.constrainedBy ?? []).includes('user_instruction:questionBudget'), r.trace);
  }
  const content = run([...STOP, U('write 5 interview questions for my new boss')]);
  ok('questions as CONTENT: the stop stays at the tail, the hard cut is lifted', !content.gate.hardNoQuestions && content.decision.controls.questionBudget?.max === 0 && (content.decision.constrainedBy ?? []).includes('user_instruction:questionBudget.hard'), content.trace);
  const steps = run([U('How do I solve 2x + 3 = 11?'), A('What would you do first?'), U('just show me the steps and let me know')]);
  ok('"let me know" is not a claim on the work: the steps are still given first', /Give it now and first/.test(steps.block) && !(steps.decision.constrainedBy ?? []).includes('user_instruction:strategy'), steps.trace);
}

console.log('\n=== F5 / MR-R4 / honesty F1: the newest clause wins ===');
{
  for (const t of ['quiz me on it — actually no, just tell me the answer to the derivative of x^3', 'Quiz me on derivatives. Actually, never mind, just give me the answer to d/dx x^3.', 'Can you quiz me? Actually never mind, just tell me what the capital of Slovenia is.']) {
    const r = run([U('Help me study.'), A('Happy to.'), U(t)]);
    ok(`"${t.slice(0, 40)}…": not a quiz`, r.decision.action !== 'preserve_challenge' && !codes(r).includes('explicit.quiz') && !r.decision.controls.noRevealAnswers && !/QUIZZED/.test(r.block), `${J(codes(r))} ${r.trace}`);
    ok('  and the answer is what they asked for', codes(r).includes('explicit.direct_answer') && !r.assist.reasons.includes('mr:user_instruction:quiz'));
    const next = run([U('Help me study.'), A('Happy to.'), U(t), A('It is 3x^2.'), U('what about the derivative of sin x?')]);
    ok('  and nothing carries into the next turn', next.decision.action !== 'preserve_challenge', next.trace);
  }
  const harder = run([U('Help me study French.'), A('Happy to.'), U('quiz me on verbs — actually, make them harder')]);
  ok('"quiz me — actually, make them harder" is still a quiz', harder.decision.action === 'preserve_challenge', harder.trace);
  const reverse = run([U('Help me study.'), A('Happy to.'), U('just tell me the answer — actually no, quiz me instead')]);
  ok('"just tell me — actually, quiz me" is a quiz', reverse.decision.action === 'preserve_challenge', reverse.trace);
}

console.log('\n=== F6: an open-ended instruction outlives the fold window ===');
{
  const msgs = [U('stop asking me questions. Help me plan a garden.'), A('Start with what grows in your zone.')];
  for (let i = 0; i < 30; i++) msgs.push(U(`What about plant number ${i + 1}?`), A(`Plant ${i + 1} likes sun.`));
  msgs.push(U('And the last one?'));
  const r = run(msgs);
  ok(`"stop asking" said ${msgs.filter((m) => m.role === 'user').length - 1} turns ago still holds, hard`, r.gate.hardNoQuestions, r.trace);
  const back = [...msgs.slice(0, 20), U('you can ask me questions again'), A('Sure.'), ...msgs.slice(20)];
  ok('  and taking it back, also outside the window, ends it', !run(back).gate.hardNoQuestions);
}

console.log('\n=== F7 / F16: every arm folds the same rules; the IFR factor only changes what is enforced ===');
{
  const msgs = [U('Help me plan my week.'), A('What matters most? What is fixed?'), U('stop asking me questions')];
  const full = run(msgs);
  for (const arm of ['baseline', 'prompt_reflection', 'state_only']) {
    const r = run(msgs, { condition: { ...FULL, arm } });
    ok(`${arm}: the would-be decision is computed and recorded, nothing enforced`, r.decision.action === full.decision.action && r.state.interventions.length === full.state.interventions.length && !r.gate.hardNoQuestions, `${r.decision.action} vs ${full.decision.action}`);
  }
  const off = run(msgs, { condition: { ...FULL, ifr: false } });
  const stop = rec(off, 'ifr.explicit.stop_questions');
  ok('IFR off: the IFR decision is folded, marked not enforced, and not in force', stop?.status === 'active' && stop.decision.uncertainty.includes(MR.NOT_ENFORCED) && off.decision.action === 'none' && !off.gate.hardNoQuestions, off.trace);
  const carried = [{ key: 'questions:0', value: 'fewer_questions', provenance: 'explicit', turn: 0, refs: [], confidence: 0.95, expiresAfterTurn: null }];
  const c = run([U('Help me with my essay.')], { condition: { ...FULL, ifr: false }, carried });
  ok('IFR off: a carried "no questions" is not enforced either (F16)', !c.gate.hardNoQuestions && c.decision.action === 'none', c.trace);
  const yours = run(msgs, { condition: { ...FULL, arm: 'baseline', source: 'user_off' } });
  ok('their own "off": nothing of theirs is folded at all', yours.state.interventions.length === 0 && yours.decision.action === 'none' && yours.needsDeliberation === null);
}

console.log('\n=== F8 / MR-R3: the Answer Guard keeps their problem theirs ===');
{
  const msgs = [U('Find the derivative of x^2 sin x'), A('Use the product rule: differentiate each factor in turn and add the two pieces. The first piece is the derivative of x squared times sin x; the second is x squared times the derivative of sin x. Put together they give the whole derivative.'), U("I still don't get it"), A('Think of it as two parts changing at once. Each part changes while the other holds still, and the two changes add up to the whole change. That is all the product rule says, written with a symbol for each part and a symbol for how fast each part is changing.'), U("that doesn't make sense to me")];
  const r = run(msgs, { guard: true, math: true });
  ok('the worked example is of an ANALOGOUS problem', r.decision.controls.strategy === 'worked_example' && /ANALOGOUS/.test(r.block), r.block);
  ok('  and the narrowing is recorded as the guard\'s', (r.decision.constrainedBy ?? []).includes('app_policy:guard:strategy.analogous'), J(r.decision.constrainedBy));
  const verify = run(msgs, { guard: true, math: true, assist: { ...chooseAssist({ lastUserText: msgs[4].content, history: msgs.slice(0, 4), guard: true, signals: readSignals(msgs[4].content) }), mode: 'verify' } });
  ok('  ACS\'s check of their attempt stays the move under the guard', verify.assist.mode === 'verify', verify.assist.mode);
}

console.log('\n=== F9 / F10: a cancelled quiz leaves no standing wish for questions ===');
{
  const msgs = [U('quiz me on multiplication'), A('What is 7 × 8?'), U('no, forget the quiz, just tell me the answer'), A('7 × 8 = 56.'), U('7 × 9 = 64'), A('Not quite.'), U('6 × 9 = 56'), A('Close, but no.'), U('8 × 9 = 71')];
  const r = run(msgs, { math: true, theirs: [{ status: 'refuted' }] });
  ok('no goal_drift against a quiz they cancelled', !r.state.integrity.some((f) => f.code === 'goal_drift'), J(r.state.integrity.map((f) => `${f.turn}:${f.code}:${f.detail}`)));
  ok('  no "practice" goal is in force', !r.state.goals.some((g) => g.key === 'goal' && g.value === 'practice'), J(r.state.goals));
  ok('  and the deliberation menu offers no quiz (F10)', !MR.allowedActions(r, input(msgs, { math: true })).includes('preserve_challenge'));
}

console.log('\n=== F11: deliberation does not act during a freeze ===');
{
  const msgs = [U('Explain inflation.'), A(LONG), U('shorter, but explain more')];
  const fast = run(msgs);
  const frozen = { ...fast, state: { ...fast.state, frozenUntilTurn: fast.state.turn } };
  let asked = 0;
  const d = await MR.deliberate(frozen, input(msgs), { used: 0, modelAllowed: true, create: async () => (asked++, { choices: [{ message: { content: '{"action":"simplify"}' } }] }), model: 'stub' });
  ok('frozen: unchanged, and no model call', d.regulation === frozen && asked === 0);
}

console.log('\n=== F12: an outcome rollback is a correction, not an MR flip ===');
{
  const dec = (id, strategy, at, afterTurn, trigger) => ({ policyVersion: MR.MR_POLICY_VERSION, interventionId: id, action: strategy === 'preserve_challenge' ? 'preserve_challenge' : 'worked_example', trigger, evidenceRefs: [{ turn: at, role: 'user', code: 'x' }], target: ['acs'], controls: { strategy }, scope: afterTurn === null ? { kind: 'conversation' } : { kind: 'turn' }, expiration: { afterTurn, onRevoke: ['explicit.revoke'] }, confidence: 1, uncertainty: [], evaluationPlan: { primary: 'friction', expect: [], window: 1 }, rollback: { revertTo: 'acs_default', when: ['outcome:revert'] }, loop: 'fast', issuedAtTurn: at });
  const interventions = [
    { decision: dec('q1', 'preserve_challenge', 1, null, 'mr.explicit.quiz'), status: 'active' },
    { decision: dec('w3', 'worked_example', 3, 3, 'mr.observed.failed_attempts'), status: 'rolled_back', endedAtTurn: 4, endReason: 'outcome:revert' },
  ];
  const f = MR.checkHistory({ interventions, strategyChanges: [[1, 'preserve_challenge'], [3, 'worked_example'], [4, 'preserve_challenge']], turn: 4, params: MR.paramsFor(MR.MR_POLICY_VERSION) });
  ok('quiz → worked example → quiz back after an outcome rollback: no oscillation', !f.some((x) => x.code === 'oscillation'), J(f));
}

console.log('\n=== F13: an old quiz does not edit a grammar fix as a quiz ===');
{
  const r = run([U('quiz me on French verbs'), A('What is the past participle of aller?'), U('allé'), A('Right! And of venir?'), U('venu. Now just fix the grammar in this: I has went to the store.')]);
  ok('no no-reveal line, no question bumped back in', !r.decision.controls.noRevealAnswers && !/Do not reveal/.test(r.block) && !(r.decision.controls.strategy === 'edit_as_asked' && r.decision.controls.questionBudget?.max === 1), r.trace);
}

console.log('\n=== F14: the next item of a series is not the same request ===');
{
  for (const [a, b] of [['Tell me about the history of the Roman empire', 'Tell me about the history of the Ottoman empire'], ['What are the main causes of the French revolution?', 'What are the main causes of the American revolution?'], ['Write a short poem about the ocean at night', 'Write a short poem about the forest at night']]) {
    const r = run([U(a), A('Here you go.'), U(b)]);
    ok(`"${b.slice(0, 40)}…" is not a repeat`, !codes(r).includes('observed.repeated_request') && r.decision.trigger !== 'ifr.observed.repeated_request', J(codes(r)));
  }
  const again = run([U('Tell me about the history of the Roman empire'), A('Rome was big.'), U('I asked: tell me about the history of the Roman empire, again')]);
  ok('"I asked: … again" still is', codes(again).includes('observed.repeated_request'), J(codes(again)));
}

console.log('\n=== F15: quiz answers are not unproductive answers ===');
{
  const r = run([U('quiz me on capitals'), A('What is the capital of Peru?'), U('Lima'), A('Right! What is the capital of Kenya?'), U('Nairobi')]);
  ok('no unproductive_questions, no spurious decision, no goal_drift', !codes(r).includes('observed.unproductive_questions') && !rec(r, 'ifr.observed.unproductive_questions') && !r.state.integrity.some((f) => f.code === 'goal_drift'), `${J(codes(r))} ${J(r.state.integrity)}`);
}

console.log('\n=== honesty F2: one verified attempt never supports "you\'ve improved" ===');
{
  ok('"You\'ve mastered derivatives!" is always an unsupported claim', MR.unsupportedClaim("You've mastered derivatives!") && MR.unsupportedClaim("You've really improved."));
}

console.log('\n=== honesty F4: the deliberation budget counts model calls, and fails closed ===');
{
  const msgs = [U('Explain inflation.'), A(LONG), U('shorter, but explain more')];
  const fast = run(msgs);
  let asked = 0;
  const create = async () => (asked++, { choices: [{ message: { content: '{"action":"none"}' } }] });
  const p = MR.paramsFor(MR.MR_POLICY_VERSION);
  const under = await MR.deliberate(fast, input(msgs), { used: p.deliberationsPerConversation - 1, modelAllowed: true, create, model: 'stub' });
  ok('under budget: one call, recorded as a model deliberation even when it chose "none"', asked === 1 && under.regulation.timing.modelDeliberated === true);
  const at = await MR.deliberate(fast, input(msgs), { used: p.deliberationsPerConversation, modelAllowed: true, create, model: 'stub' });
  ok('at budget: no call, a cost_budget finding', asked === 1 && at.findings.some((f) => f.code === 'cost_budget'), J(at.findings));
  const unknown = await MR.deliberate(fast, input(msgs), { used: Infinity, modelAllowed: true, create, model: 'stub' });
  ok('an unreadable count is over budget', asked === 1 && unknown.findings.some((f) => f.code === 'cost_budget'));
  ok('parseChoice: only a menu item', MR.parseChoice('{"action":"direct"}', ['none', 'direct']) === 'direct' && MR.parseChoice('{"action":"give_answer"}', ['none']) === null && MR.parseChoice('nonsense', ['none']) === null);
  ok('deterministicChoice: revert for repeated reverts, simplify for a failed example, none otherwise', MR.deterministicChoice('repeated_revert', ['none', 'revert']) === 'revert' && MR.deterministicChoice('worked_example_not_landing', ['none', 'simplify']) === 'simplify' && MR.deterministicChoice('conflicting_instructions', ['none', 'revert']) === 'none');
}

console.log('\n=== honesty F5 / MR-R11: a safety turn is left exactly as ACS made it ===');
{
  const r = run([...STOP, U("just tell me the answer. honestly I can't do this anymore, I want to kill myself")]);
  ok('nothing enforced, nothing recorded as applied, no reply filter', !r.enforced && !r.gate.hardNoQuestions && !r.gate.dropUnsupportedClaims && Object.keys(r.decision.controls).length === 0 && /enf=0/.test(r.trace), r.trace);
  ok('  and what precedence took out is recorded', (r.decision.constrainedBy ?? []).some((c) => c.startsWith('safety:')), J(r.decision.constrainedBy));
  const standing = run([U('Help me plan.'), A('What is fixed?'), U("from now on just give me the answer. honestly I can't do this anymore, I want to kill myself")], { carried: [] });
  const rows = MR.rowsForTurn(standing, { userId: 'u', conversationKey: 'conv_r', now: 1, arm: 'full' });
  const made = rows.find((x) => x.kind === 'decision');
  const exposure = rows.find((x) => x.kind === 'exposure');
  ok('  a "from now on" said on a safety turn is recorded as said (its controls), the exposure as not enforced', made && made.record.controls?.strategy === 'direct' && (made.record.constrainedBy ?? []).length > 0 && exposure?.record.enforced === false, J({ made: made?.record.controls, by: made?.record.constrainedBy, enforced: exposure?.record.enforced }));
}

console.log('\n=== honesty F6: a mid-reply check-in counts when questions were taken away ===');
{
  const r = run([U('How do I solve 2x + 3 = 11?'), A('What would you do first?'), U('just show me the steps')]);
  const f = MR.afterReply(r, 'Step 1: subtract 3, 2x = 8. Does that make sense? Step 2: divide by 2, x = 4. That is the whole of it.', { questions: 0, claims: 0 });
  ok('"Does that make sense?" mid-reply is a control violation', f.some((x) => x.code === 'control_violation' && /^questions:/.test(x.detail)), J(f));
  const g = MR.afterReply(r, 'Step 1: subtract 3, 2x = 8. Step 2: divide by 2, x = 4. Want me to check it with you?', { questions: 0, claims: 0 });
  ok('  a closing offer is not', !g.some((x) => x.code === 'control_violation'), J(g));
}

console.log('\n=== honesty F6, enforced: with questions taken away, a mid-reply check-in is dropped too ===');
{
  const r = run([U('How do I solve 2x + 3 = 11?'), A('What would you do first?'), U('just show me the steps')]);
  ok('the gate is armed for check-ins (and says so)', r.gate.dropCheckIns === true && !r.gate.hardNoQuestions && /;g=kc;/.test(r.trace), r.trace);
  const g = MR.replyGate(r);
  const cut = ['Step 1: subtract 3, 2x = 8. ', 'Does that make sense? ', 'Step 2: divide by 2, x = 4. ', 'Why does dividing work here? ', 'Because both sides stay equal.'].map(g.drop);
  ok('the check-in goes; an explicit question stays under the tail rule (it is rhetorical here)', J(cut) === J([false, true, false, false, false]), J(cut));
  const plain = run([U('Can you explain the chain rule?')]);
  ok('nothing taken away: check-ins are left alone', !plain.gate.dropCheckIns);
}

console.log('\n=== MR-PRIV-1: a scope they held to this conversation is never carried ===');
{
  const asking = [U('Help me plan my week.'), A('What is fixed? What can move?')];
  const scope = (t) => run([...asking, U(t)], { carried: [] }).decision.scope.kind;
  ok('"for the rest of this conversation, stop asking me questions" → conversation', scope('for the rest of this conversation, stop asking me questions') === 'conversation');
  ok('"for the rest of this chat, keep your replies shorter" → conversation', scope('for the rest of this chat, keep your replies shorter') === 'conversation');
  ok('"from now on in this chat, just give me the answer" → conversation', scope('from now on in this chat, just give me the answer') === 'conversation');
  ok('"from now on, stop asking me questions" (carry on) → standing', scope('from now on, stop asking me questions') === 'standing');
  ok('  and without consent to carry → conversation', run([...asking, U('from now on, stop asking me questions')]).decision.scope.kind === 'conversation');
}

console.log('\n=== MR-PRIV-4: a reset ends what MR did on its own; their words stay theirs ===');
{
  const msgs = [U('Help me with this bug.'), A('What did you try? What did you expect?'), U('idk'), A('Which line fails? Have you logged it?'), U('not sure'), A('Here is a guess: the loop runs one time too many.'), U('stop asking me questions'), A('Okay.'), U('what else could it be?')];
  const before = run(msgs);
  ok('(before the reset: both MR\'s and their adjustment in force)', !!rec(before, 'ifr.explicit.stop_questions'));
  const after = run(msgs, { resetTurn: 4 });
  const mine = after.state.interventions.filter((x) => !x.decision.trigger.includes('.explicit.') && x.decision.issuedAtTurn < 4);
  ok('MR\'s own adjustments made before the reset are ended', mine.every((x) => x.status !== 'active'), J(mine.map((x) => `${x.decision.trigger}:${x.status}:${x.endReason}`)));
  ok('  their "stop asking" said after it holds', after.gate.hardNoQuestions);
  ok('  and the boundary is on the state for the ledger', after.state.resetTurn === 4);
  // lib/mr/ledger.ts keeps its own copies of these two codes (it stays free of the fold): they are a contract
  ok('  the reset ends them with the code the ledger reads (revoke:reset)', mine.length > 0 && mine.every((x) => x.status !== 'revoked' || x.endReason === 'revoke:reset'), J(mine.map((x) => x.endReason)));
  ok('  and "not enforced" is the code the ledger reads (not_enforced)', MR.NOT_ENFORCED === 'not_enforced');
}

console.log('\n=== MR-R2 / MR-R8: the reply filters leave drafts and quotations alone ===');
{
  const draft = run([U('Write a short note to my student Maya telling her she has improved at fractions.')]);
  ok('a draft for somebody else: the claim filter is not armed', draft.gate.dropUnsupportedClaims === false, draft.trace);
  const plain = run([U('Can you explain the chain rule?')]);
  ok('an ordinary turn: armed, and the trace says so', plain.gate.dropUnsupportedClaims === true && /;g=c;/.test(plain.trace), plain.trace);
  const g = MR.replyGate({ gate: { hardNoQuestions: true, dropUnsupportedClaims: true } });
  const cut = ['> Hi Sam. ', 'Have you had a chance to review the proposal? ', 'I would like to send it Friday.\n\n', 'You could text: "Hi Sam. ', 'Are you free on Friday?" ', 'That is direct. ', 'Want me to draft another?'].map(g.drop);
  ok('a question on a > line or inside a quotation passes; one to them is dropped', J(cut) === J([false, false, false, false, false, false, true]), J(cut));
  ok('  and the dropped offer is kept aside for the empty-reply fallback', g.offers.length === 1 && g.dropped.questions === 1);
  const h = MR.replyGate({ gate: { hardNoQuestions: false, dropUnsupportedClaims: true } });
  ok('a claim in Socria\'s own words is dropped; inside a quoted draft it is not', h.drop("You've really improved at this! ") === true && h.drop('She could write: "Maya, you have really improved. ') === false && h.drop('Keep going." ') === false && h.dropped.claims === 1);
  const stray = MR.replyGate({ gate: { hardNoQuestions: true, dropUnsupportedClaims: false } });
  stray.drop('He is 5\'10" tall.\n\n');
  ok('a stray inch mark does not shield the next paragraph', stray.drop('What do you think? ') === true);
}

console.log('\n=== round 2: what verifying the fixes found ===');
{
  const quiz = [U('quiz me on world capitals'), A('What is the capital of Peru?'), U('Lima'), A('Correct! What is the capital of Kenya?'), U('Nairobi'), A('Right. Next: what is the capital of Australia?')];
  for (const t of ["ok, let's move on to the next question", "let's switch to harder questions", "I'm done with this practice set, give me another", "skip, let's move on", "Canberra. Let's switch to African capitals now"]) {
    const r = run([...quiz, U(t)]);
    ok(`inside a quiz, "${t}" keeps the quiz`, rec(r, 'mr.explicit.quiz')?.status === 'active' && r.decision.controls.strategy === 'preserve_challenge' && !rec(r, 'ifr.observed.unproductive_questions'), `${r.trace} ${rec(r, 'mr.explicit.quiz')?.endReason}`);
  }
  const learner = run([U("I'm learning calculus for my exam next week. How does the chain rule work?"), A('Good question to dig into. What do you think happens when one function is inside another?'), U("I don't know"), A('Think of the outer function first. What is the derivative of the outer function, do you think?'), U('no idea, honestly'), A('Try the inner one then. Can you guess what we multiply by?'), U("I don't know, I already said I don't know")]);
  ok('a stated learning goal does not switch off "the questions are not helping"', !!rec(learner, 'ifr.observed.unproductive_questions'), learner.trace);

  const bike = [U('how do I fix my bike chain? it keeps slipping'), A('What kind of bike is it? Does it have gears?'), U('idk'), A('Is it slipping when you pedal hard, or all the time?'), U('not sure'), A('Shift to a middle gear and check the chain tension.'), U('keep it short, but go into more detail on the gears')];
  const fast = run(bike);
  const kept = (await MR.deliberate(fast, input(bike), { used: 0, modelAllowed: false })).regulation;
  ok('a deliberated "none" leaves MR\'s own adjustments in force (it is "leave the help as it is")', fast.needsDeliberation === 'conflicting_instructions' && rec(kept, 'ifr.observed.unproductive_questions')?.status === 'active' && /qw1\/3/.test(kept.trace), `${fast.needsDeliberation} ${rec(kept, 'ifr.observed.unproductive_questions')?.status} ${kept.trace}`);

  const edit = run([U('quiz me on French verbs'), A('Conjugate "aller" in the first person singular.'), U('je vais'), A('Correct. Now "être", third person plural?'), U("Here's my cover letter, just fix the grammar: I has went to the store."), A('I went to the store.'), U('ils sont')]);
  // an edit asked for in a quiz holds its few turns (a follow-up edit is an edit); the quiz's no-reveal never edits the essay
  ok('an edit inside a quiz is edited as asked, without the quiz\'s no-reveal line', edit.decision.controls.strategy === 'edit_as_asked' && !edit.decision.controls.noRevealAnswers && !/QUIZZED/.test(edit.block), edit.trace);
  const followUp = run([U('quiz me on French verbs'), A('Conjugate "aller" in the first person singular.'), U('je vais'), A('Correct. Now "être", third person plural?'), U("Here's my cover letter, just fix the grammar: I has went to the store."), A('I went to the store.'), U('Thanks. And this paragraph too: My manager say I am reliable and I learns fast.')]);
  ok('  and the next paragraph they send is edited too, not quizzed', followUp.decision.controls.strategy === 'edit_as_asked' && !/QUIZZED/.test(followUp.block), followUp.trace);

  const history = [U('Help me study derivatives.'), A('Happy to.')];
  for (const t of ['quiz me, no, just tell me the answer', 'quiz me. ok no, just give me the answer', 'quiz me on it. Hmm no, just tell me the answer.', 'quiz me on it - nah, just tell me the answer to the derivative of x^3', 'quiz me on x^3 derivative, nah just tell me the answer', 'quiz me on it, or rather just tell me the answer', 'Quiz me on derivatives. Changed my mind: just give me the answer to d/dx x^3.', 'I was going to ask you to quiz me but just tell me the answer instead', 'Quiz me. Scratch that, what is the derivative of x^3?', 'quiz me on it — on second thought, just explain how to differentiate x^3', 'quiz me on it. never mind, what is the derivative of x^3?']) {
    const r = run([...history, U(t)]);
    ok(`"${t.slice(0, 44)}…": the quiz was taken back`, r.decision.action !== 'preserve_challenge' && !codes(r).includes('explicit.quiz'), `${J(codes(r))} ${r.trace}`);
  }
  for (const t of ['Quiz me on the Spanish verbs I actually got wrong yesterday, and just tell me the answer if I miss one.', 'quiz me on derivatives and if I actually get stuck just give me the answer', "can you quiz me? I'd actually like to see if I remember it, just tell me the answer after each one", 'Quiz me on the dates. If I forget it, just tell me the answer.', 'Test me on the vocab, and wait, no peeking, just tell me if I got each one right']) {
    const r = run([...history, U(t)]);
    ok(`"${t.slice(0, 44)}…": still a quiz (the answer is part of how it runs)`, r.decision.action === 'preserve_challenge', `${J(codes(r))} ${r.trace}`);
  }

  const habit = run([U('What is the integral of x^2?'), A('What do you think the power rule says?'), U('Just give me the answer, I always end up confused in this chat'), A('x^3/3 + C.'), U('Thanks. Now explain what a limit is.'), A('A limit is the value a function approaches.'), U('ok and what about continuity'), A('Continuity means no breaks.'), U('cool. how do I study for the exam')]);
  ok('a complaint ("I always end up confused in this chat") makes nothing standing: the direct answer expired', habit.decision.action === 'none', habit.trace);

  const asking = [U('Help me plan my week.'), A('What is fixed? What can move?')];
  const scope = (t) => run([...asking, U(t)], { carried: [] }).decision.scope.kind;
  for (const t of ['in this chat, stop asking me questions from now on', 'from now on, for the remainder of this chat, stop asking me questions', 'from now on, stop asking me questions. just for this conversation though', 'from now on keep your replies shorter, but only here']) {
    ok(`"${t}" stays in this conversation`, scope(t) === 'conversation', scope(t));
  }

  const stop = [U('My bread keeps coming out flat.'), A('How long do you proof it? What flour do you use?'), U('stop asking me questions'), A('Flat loaves usually mean a weak starter.')];
  for (const t of ['How can I tell if my sourdough starter is ready?', 'how do I tell if a number is prime?', 'what should I tell my doctor about the side effects?', 'write a SQL query that returns the latest post per user', 'write a regex that validates the response code', 'write a python function that reads a text file and counts the words']) {
    const r = run([...stop, U(t)]);
    ok(`"${t.slice(0, 44)}…" is not a draft for somebody else: the stop holds, hard, and claims are still filtered`, r.gate.hardNoQuestions && r.gate.dropUnsupportedClaims, r.trace);
  }
  for (const [t, prev] of [['Write a short note to my student Maya telling her she has improved at fractions.', null], ['draft an email to my landlord about the leak', null], ['make it warmer', 'Write a thank-you note to my teacher.']]) {
    const msgs = prev ? [...stop, U(prev), A('Dear Ms. Lee, thank you.'), U(t)] : [...stop, U(t)];
    const r = run(msgs);
    ok(`"${t}" is a draft for somebody else: its questions and "you" are the draft's`, !r.gate.hardNoQuestions && !r.gate.dropUnsupportedClaims && !r.gate.dropCheckIns, r.trace);
  }
  const answers = run([U('Here are my homework problems: 1) 3x=12 2) x+5=9'), A('Which one do you want to start with? What have you tried?'), U('stop asking me questions, just give me the answers to these questions')]);
  ok('"give me the answers to these questions" is not questions as content: the stop is hard', answers.gate.hardNoQuestions, answers.trace);

  const laptop = run([U('I need a laptop for college, budget around $1200.'), A('What will you mostly use it for? Do you prefer Mac or Windows?'), U('just tell me which laptop to buy')]);
  const g = MR.replyGate(laptop);
  const kept2 = ['Get the MacBook Air M3. ', "If you want, I'd go for the 16GB model, since 8GB will feel slow in two years. ", 'I can also see the case for a ThinkPad if you need Windows. ', '**Should I buy AppleCare?** Only if you are prone to drops. ', 'Want me to compare prices? ', 'It fits your budget.'].map(g.drop);
  ok('the check-in filter takes the check-in, never advice or a question that heads its answer', laptop.gate.dropCheckIns && J(kept2) === J([false, false, false, false, true, false]), J(kept2));
  const content = run([U('I am hiring a designer.'), A('What level are they?'), U('stop asking me questions'), A('Understood.'), U('write 5 interview questions for my candidate')]);
  ok('questions as content: no check-in filter either', !content.gate.dropCheckIns && !content.gate.hardNoQuestions, content.trace);
  ok('  and no control_violation for the questions they asked for', !MR.afterReply(content, '1. What tools do you use daily?\n2. Is there anything you would like to ask us?', { questions: 0, claims: 0 }).some((f) => f.code === 'control_violation'));

  const hard = MR.replyGate({ gate: { hardNoQuestions: true, dropUnsupportedClaims: true } });
  const inch = ['The board is 12" wide. ', 'Does that fit your shelf? ', 'It is oak. ', "At 5'10\" a healthy range is about 129 to 174 lb. ", 'Do you want me to work out your BMI? ', 'In JSON you wrap strings in `"`. ', 'Do you want an example? ', 'You have really improved at woodworking.'].map(hard.drop);
  ok('an inch mark or a quote in code opens no quotation: the questions after it are still taken out', J(inch) === J([false, true, false, false, true, false, true, true]), J(inch));
  const bq = MR.replyGate({ gate: { hardNoQuestions: true, dropUnsupportedClaims: false } });
  const lines = ['Here is a draft:\n\n', '> Hi Ms. Park,\n> The kitchen sink has been leaking since Monday.\n> Thanks,\n> Sam\nDo you want me to make it more formal? ', 'I kept it short.'].map(bq.filter);
  // the line break before the line taken out stays, so "I kept it short." is not glued onto the quoted "> Sam" (round 3)
  ok('in a chunk with a blockquote, only Socria\'s own question line goes: every quoted line stays', lines[1] === '> Hi Ms. Park,\n> The kitchen sink has been leaking since Monday.\n> Thanks,\n> Sam\n' && lines[0] === 'Here is a draft:\n\n' && lines[2] === 'I kept it short.', J(lines));
  const single = MR.replyGate({ gate: { hardNoQuestions: true, dropUnsupportedClaims: false } });
  const sq = ["You could text: 'Hi Sam. ", "Are you free on Friday?' ", 'That is direct. ', "Don't you think so? "].map(single.drop);
  ok('a single-quoted question is the draft\'s; an apostrophe opens nothing', J(sq) === J([false, false, false, true]), J(sq));
  const bold = MR.replyGate({ gate: { hardNoQuestions: true, dropUnsupportedClaims: false } });
  const b = ['Measure the wall first. ', '**Want me to make you a cut list?** I can do it in a minute. ', '**Should I buy AppleCare?** Only if you are prone to drops. ', 'Then sand the edges.'].map(bold.drop);
  ok('a bold question put to them is still a question; one Socria answers itself is not', J(b) === J([false, true, false, false]), J(b));
  const self = MR.replyGate({ gate: { hardNoQuestions: false, dropCheckIns: true, dropUnsupportedClaims: false } });
  const sf = ['Get the MacBook Air M3. ', 'Should I go for 16GB? ', 'Yes, 8GB will feel slow in two years. ', 'Does that make sense?'].map(self.drop);
  ok('the check-in filter leaves a question Socria asks itself and answers', J(sf) === J([false, false, false, true]), J(sf));

  const guardPush = run([U('Solve 2x + 3 = 11'), A('What would you do first?'), U('just tell me the answer')], { guard: true, math: false });
  ok('under the Answer Guard, a non-maths "just tell me the answer" is not told to hand it over', !/THEY ASKED FOR IT DIRECTLY/.test(guardPush.block) && (guardPush.decision.constrainedBy ?? []).includes('app_policy:guard:strategy'), `${guardPush.trace} ${guardPush.block}`);
  ok('  and the deliberation menu offers no "direct" under it', !MR.allowedActions(guardPush, input([U('Solve 2x + 3 = 11'), A('What would you do first?'), U('just tell me the answer')], { guard: true })).includes('direct'));

  const thanks = run([U('Solve 2x + 3 = 11'), A('What would you do first?'), U('2x = 14 so x = 7'), A('Not quite.'), U('2x = 13 so x = 6.5'), A('Here is a similar one: 3y + 2 = 8, so 3y = 6, so y = 2. Now try yours.'), U('thanks, that makes sense')], { math: true });
  ok('"thanks, that makes sense" after a worked example is not another failed attempt', thanks.needsDeliberation !== 'worked_example_not_landing' && !codes(thanks).includes('observed.failed_attempts'), `${thanks.needsDeliberation} ${J(codes(thanks))}`);

  const prose = run([U('quiz me on multiplication'), A('What is 7 × 8?'), U('7 × 8 = 54'), A('Not quite.'), U('7 × 8 = 58'), A('Think of 7 × 8 as 7 × 4 doubled: 28 doubled is 56.\nIn the same way, 6 × 9 is 6 × 10 minus 6.\nNow you try: what is 6 × 9?'), U('6 × 9 = 52')], { math: true, theirs: [{ status: 'refuted' }] });
  ok('a worked example in plain words with its working in it is delivered, not rolled back', !prose.state.integrity.some((f) => f.code === 'task_regression' || f.code === 'oscillation'), J(prose.state.integrity.map((f) => `${f.turn}:${f.code}:${f.detail}`)));

  const off = run([U('I am deciding whether to move cities.'), A('What draws you there? What would you miss?'), U('stop asking me questions, just give me your take')], { condition: { ...FULL, ifr: false } });
  const offRows = MR.rowsForTurn(off, { userId: 'u', conversationKey: 'conv_r', now: 1, arm: 'full' });
  ok('IFR off: its would-be decisions get decision rows marked not_enforced, so nothing is "unlisted"', offRows.filter((x) => x.kind === 'decision').every((x) => x.record.uncertainty.includes('not_enforced')) && offRows.some((x) => x.kind === 'decision') && MR.unlistedInForce(offRows) === 0, J(offRows.map((x) => x.kind)));
  const longOld = [U('Here is my whole draft: ' + 'The quarterly numbers moved in several directions at once. '.repeat(60) + ' Please stop asking me questions about it.'), A('Understood.')];
  for (let i = 0; i < 8; i++) longOld.push(U(`And section ${i + 1}?`), A(`Section ${i + 1} is fine.`));
  longOld.push(U('what about the summary'));
  ok('an older long message is still read at its end: "stop asking" after a paste holds', run(longOld).gate.hardNoQuestions, run(longOld).trace);
  ok('the deliberation count reads the running total an exposure row carries', MR.modelDeliberationsIn([{ kind: 'exposure', record: { modelDeliberations: 2 } }, { kind: 'exposure', record: {} }]) === 2);
}

console.log('\n=== round 3: what verifying the second round found ===');
{
  const study = [U('I need some help studying.'), A('Happy to help.')];
  const same = run([...study, U('quiz me on capitals or just tell me the capital of Slovenia')]);
  ok('a quiz and the answer in one breath: MR enforces neither, and leaves the move to ACS', same.decision.action === 'none' && same.needsDeliberation === 'conflicting_instructions' && !/QUIZZED|DIRECTLY/.test(same.block), `${same.trace} ${same.needsDeliberation}`);
  for (const t of ['Quiz me on European capitals — you pick the country.', 'Quiz me on any chapter, you decide.', 'Quiz me on French verbs, then just tell me how I did.', 'Quiz me on the capitals. Just give me the questions one at a time.', 'Quiz me on the dates. Afterwards, just tell me which ones I missed.', 'Quiz me on this chapter. Show me the answer key at the end.', 'quiz me on derivatives, show me the steps afterwards', 'Give me a practice problem, then walk me through the steps.']) {
    const r = run([...study, U(t)]);
    ok(`"${t.slice(0, 46)}…": the quiz, run the way they said`, r.decision.action === 'preserve_challenge', `${J(codes(r))} ${r.trace}`);
  }
  {
    // "let me try it first" keeps the answer theirs (round 4: not a quiz), and "then show me the steps" is how it runs
    const r = run([...study, U('Let me try it first, then show me the steps.')]);
    ok('"Let me try it first, then show me the steps.": theirs to try, the steps not given now', r.decision.trigger === 'mr.explicit.own_try' && r.decision.controls.noRevealAnswers === true && !codes(r).includes('explicit.show_steps'), `${J(codes(r))} ${r.trace}`);
  }
  const integral = [U('What is the integral of x^2?'), A('What do you think the power rule says?')];
  for (const t of ['just give me the answer, you quiz me every time', 'Just tell me the answer. Every time I ask in this chat you quiz me.', 'just give me the answer, every time you quiz me I panic']) {
    const r = run([...integral, U(t)]);
    ok(`"${t.slice(0, 46)}…" is a complaint, not a quiz request: the answer is what they asked for`, r.decision.action === 'direct' && !codes(r).includes('explicit.quiz'), `${J(codes(r))} ${r.trace}`);
  }
  ok('"can you quiz me?" is still a request', run([...study, U('can you quiz me on capitals?')]).decision.action === 'preserve_challenge');
  const when = run([...study, U('Quiz me on limits. Actually no, just tell me what happens when x approaches 0.')]);
  ok('a retraction whose question has a "when" in it is still a retraction', when.decision.action !== 'preserve_challenge' && codes(when).includes('explicit.direct_answer'), `${J(codes(when))} ${when.trace}`);

  const quiz = [U('quiz me on world capitals'), A('What is the capital of Peru?'), U('Lima'), A('Correct! What is the capital of Kenya?')];
  for (const t of ["Let's stop the quiz. I have a different question: how do I cite a website in APA?", 'No more quiz please. One more thing, can you help me with my cover letter?', "Ok, I'm done with the quiz. Next question: what's a good way to start my essay?", "I'm done with this quiz. Can you help me write my essay intro?", "Let's move on to my essay now. How should I open it?", "ok let's switch to my chemistry homework, what is a mole?"]) {
    const r = run([...quiz, U(t)]);
    ok(`"${t.slice(0, 46)}…" ends the quiz`, rec(r, 'mr.explicit.quiz')?.status !== 'active' && r.decision.controls.strategy !== 'preserve_challenge', r.trace);
  }
  const subtopic = run([...quiz, U("Nairobi. Let's change the topic to African capitals now")]);
  ok('"let\'s change the topic to African capitals" inside a capitals quiz keeps it', subtopic.decision.action === 'preserve_challenge', subtopic.trace);
  for (const t of ["that's enough for today", "let's talk about something else", 'stop the quiz please', 'just tell me the answer']) {
    const r = run([U('quiz me on world capitals'), A('What is the capital of Peru?'), U('Lima'), A('Correct! What is the capital of Kenya?'), U('Nairobi'), A('Right. Next: what is the capital of Australia?'), U(t)]);
    ok(`ending the quiz with "${t}" does not count its answers as unproductive`, !rec(r, 'ifr.observed.unproductive_questions') && !/HAVE NOT BEEN HELPING/.test(r.block), r.trace);
  }

  const week = [U('Help me plan my week.'), A('What is fixed?')];
  for (const t of ['every time you ask me a question I get confused, just tell me', 'Just give me the answer, from now on I want to focus on my essay', "just tell me the answer — going forward I'll do the practice myself"]) {
    const r = run([...week, U(t)], { carried: [] });
    ok(`"${t.slice(0, 46)}…": a plan or a complaint, not a standing instruction`, r.decision.scope.kind !== 'standing' && !codes(r).includes('explicit.standing'), `${r.decision.scope.kind} ${J(codes(r))}`);
  }
  for (const t of ['From now on, stop asking me questions — not just here, in every chat.', "Going forward, always give me the answer first. I'm tired of the back-and-forth in the chat.", 'From now on, stop asking me questions. I already told you this in the session yesterday.']) {
    ok(`"${t.slice(0, 46)}…" is standing (carried, with consent)`, run([...week, U(t)], { carried: [] }).decision.scope.kind === 'standing');
  }

  for (const t of ['Write an email validation function for my React app', 'write a text parser for my Python script', 'Write a message queue consumer for my Django service', 'write a post request handler for my Express server', 'Write a card component for my Next.js site', 'write a reply bot for Discord', 'write a text summarizer for my team', 'write a letter frequency counter for my class assignment']) {
    ok(`"${t}" is code, not a draft for somebody`, !MR.writingForOthers(t));
  }
  for (const t of ['write my boss an email saying I am sick', 'Write an email to HR about my leave', 'Write a short note to my student Maya telling her she has improved at fractions.', 'draft an email to my landlord about the leak']) {
    ok(`"${t}" is a draft for somebody`, MR.writingForOthers(t));
  }
  const draftReq = 'Write a message to my landlord about the leak under the sink';
  for (const t of ['more importantly, how do I document the damage for my deposit?', 'say the landlord ignores it, what are my rights?', 'change of plan: how do I file a complaint with the city?', 'add to that: is mold dangerous to my kids?']) {
    ok(`"${t.slice(0, 40)}…" after a draft is a question, not a revision`, !MR.writingForOthers(t, [draftReq]));
  }
  ok('"shorter please" after "make it warmer" after the draft is still the draft', MR.writingForOthers('shorter please', ['make it warmer', draftReq]));
  ok('"perfect, but sign it from both of us" revises it', MR.writingForOthers('perfect, but sign it from both of us', [draftReq]));

  for (const t of ['Can you write the questions for my customer survey?', 'give me questions for my book club', 'write discussion questions for chapter 3', 'write 5 interview questions for my new boss']) {
    ok(`"${t}" asks for questions as content`, MR.questionsAsContent(t));
  }
  for (const t of ['I already made flashcards. stop asking me questions and just explain mitosis', 'ok stop asking me interview questions now, just give me feedback on my answers', 'stop asking me questions, just give me the answers to these questions']) {
    ok(`"${t.slice(0, 46)}…" does not`, !MR.questionsAsContent(t));
  }

  const steps = [U('Solve 2x + 3 = 11'), A('What would you do first?'), U('2x = 14 so x = 7'), A('Not quite.'), U('2x = 13 so x = 6.5'), A('Here is a similar one: 3y + 2 = 8, so 3y = 6, so y = 2. Now try yours.')];
  for (const t of ['thanks, that makes sense, I get why step 2 works now', 'ok I see it now, 2 steps', 'got it, thanks! I have 3 more of these to do tonight']) {
    const r = run([...steps, U(t)], { math: true });
    ok(`"${t.slice(0, 40)}…" holds no attempt: no failed-attempts worked example`, !codes(r).includes('observed.failed_attempts') && r.needsDeliberation !== 'worked_example_not_landing', `${J(codes(r))} ${r.needsDeliberation}`);
  }

  const contentStop = run([U('stop asking me questions. write 5 interview questions I can ask my new boss'), A('1. What does success look like in this role?\n2. How does the team work together?\n3. What are the biggest challenges?\n4. How is performance reviewed?\n5. What do you enjoy about working here?'), U('thanks, now help me plan my first week')]);
  ok('a stop said in the same message as a request for questions: the questions they asked for are not a failure', !contentStop.state.integrity.some((f) => f.code === 'task_regression' || f.code === 'control_violation'), J(contentStop.state.integrity));
}

console.log('\n=== round 3: instructions count only addressed to Socria (lib/mr/ifr.ts addressed) ===');
{
  const sig = (r) => r.state.observations.filter((x) => x.turn === r.state.turn).map((x) => x.code);
  const STUDY = [U('I am studying for my biology final.'), A('Great. Which topics feel weakest?')];
  const STOPH = [U('I want to learn basic Japanese for a trip.'), A('Nice. When do you leave? How much time do you have?'), U('stop asking me questions'), A('Understood. Start with greetings.')];
  const KNEE = [U('I had knee surgery last week.'), A('How is the swelling? Can you bend it?'), U('stop asking me questions'), A('Understood. Rest and ice it.')];
  const QUIZH = [U('quiz me on world capitals'), A('What is the capital of Peru?'), U('Lima'), A('Correct! What is the capital of Kenya?')];
  const CARRIED = [{ key: 'questions:0', value: 'fewer_questions', provenance: 'explicit', turn: 0, refs: [], confidence: 0.9, expiresAfterTurn: null }];
  const each = (label, list, pre, test, o) => {
    const bad = list.filter((t) => !test(run([...pre, U(t)], o)));
    ok(label, !bad.length, J(bad.map((t) => `${t} → ${run([...pre, U(t)], o).trace.split(';').filter((x) => /^(a|c|t)=/.test(x)).join(';')} ${J(sig(run([...pre, U(t)], o)))}`)));
  };
  each('a "stop asking" that is negated, asked about or somebody else\'s is not theirs', ["Don't stop asking me questions, they help me think.", 'I never said to stop asking questions, you can ask me.', 'Why did you stop asking me questions? I liked them.', 'Please do not stop asking questions, quiz me on chapter 3.', 'My teacher told me to stop asking questions in class. Can you quiz me on chapter 3?', "Don't ask me why, but I love the Tudors. Quiz me on them!"], STUDY, (r) => !sig(r).includes('explicit.stop_questions'));
  each('  and their own still is', ['stop asking me questions', 'Ugh, can you stop asking me so many questions?', 'No more questions, just answer.', "Please don't ask me any more questions.", 'stop asking me questions and quiz me tomorrow'], STUDY, (r) => sig(r).includes('explicit.stop_questions'));
  each('asking for the answer is never a quiz ("not just a hint", "I can\'t figure it out on my own")', ['Give me the answer, not just a hint.', "Give me the answer — don't just give me a hint.", "Just tell me the answer, I don't need you to point me in the right direction.", 'Just give me the answer instead of a nudge.', "Just tell me, I can't figure it out on my own.", "Just tell me the answer, I don't want to figure it out myself.", 'Please just give me the solution, I have no time to work it out on my own.', 'Tell me the answer, I do not want a small hint.'], [U('What is the derivative of x^2 sin x?'), A('Think about the product rule. What are the two factors?')], (r) => !sig(r).includes('explicit.quiz') && !/preserve_challenge/.test(r.trace));
  each('  while "let me try it first" and "hints only" still keep it theirs (own_try)', ['Let me try it first.', "Don't tell me the answer, just a hint.", 'hints only please'], [U('What is the derivative of x^2 sin x?'), A('Think about the product rule.')], (r) => sig(r).includes('explicit.own_try') && r.decision.controls.noRevealAnswers === true);
  each('a refusal of being quizzed in the last clause is a refusal', ['Just give me the answer — I did not ask you to quiz me.', 'Give me the answer please, I never asked you to test me.', 'Just tell me what it is, there is no reason to quiz me on this.', 'Tell me the answer instead of trying to quiz me.', 'Just tell me the answer, do you have to quiz me every time?', 'Just tell me the answer. Why does it always have to quiz me?'], STUDY, (r) => !sig(r).includes('explicit.quiz') && !/preserve_challenge/.test(r.trace));
  each('somebody else\'s quiz, "exercises" and "a problem list" neither quiz them nor lift their stop', ['My sister likes to quiz me before trips, any tips for learning basic Japanese?', 'I asked my roommate to quiz me on Japanese phrases last night and I blanked. How do I memorize them?', 'Is there a website that can quiz me on hiragana?', 'Should I have someone test me on the phrases before I go?', 'My dad loves to drill me on geography, he would like Japan.', 'Flashcard apps that quiz me never work for me. What else can I do?', 'Can my parents test me on the phrases, or is an app better?', "I'm not asking you to quiz me. What is the best area to stay in Tokyo?", 'Write me a short quiz about Japanese etiquette that I can give my kids.', 'Give me some exercises to strengthen my knee.', 'Give me 3 exercises I can do at my desk.', 'Can I get some exercises to do at home?', 'Send me a few exercises that will not hurt.', 'Give me a problem list to bring to my physio.'], STOPH, (r) => !sig(r).includes('explicit.quiz') && !sig(r).includes('explicit.revoke') && /q0h/.test(r.trace));
  each('a quiz put off till later is not a quiz now, and does not end a carried stop', ['Quiz me next week. For now, what is a good markup for bread?', 'You can quiz me tomorrow. Tonight I just need to know: what is a good markup for bread?', 'Maybe test me some other time. What is a typical bakery margin?', 'Drill me on it when I am back from holiday. What is the formula for markup?', 'Test me on the numbers later, not now. What is a good markup?'], [U('I want to open a second shop.'), A('Good idea. Here is a plan.')], (r) => !sig(r).includes('explicit.quiz') && !sig(r).includes('explicit.revoke') && /q0h/.test(r.trace), { carried: CARRIED });
  each('  nor does one after an answer asked for now', ['Just tell me the answer now. Tomorrow you can quiz me.', 'Just give me the dates. I will ask you to quiz me later.', 'Just give me the answer, I will have my friend quiz me later.', 'Just tell me the answer; maybe next time you can quiz me.'], STUDY, (r) => !sig(r).includes('explicit.quiz'));
  each('"get back to normal after surgery", "go back to asking my surgeon" end nothing', ['How long does it take to get back to normal after knee surgery?', 'I just want my sleep to go back to normal.', 'When can I go back to how things were before the surgery?', 'How do I switch back to the old style in my fitness app?', 'Should I go back to asking my surgeon about the swelling?', "I'll go back to asking my physio instead.", 'Is it okay to ask questions again at my follow-up appointment?', 'Go back to asking me questions? No, keep it as it is. What exercises help?'], KNEE, (r) => !sig(r).includes('explicit.revoke') && /q0h/.test(r.trace));
  each('  while their own revocation still ends the stop', ['you can ask me questions again', 'ok, go back to normal', 'Can you go back to how you were?'], KNEE, (r) => sig(r).includes('explicit.revoke'));
  each('refusing a short answer is no ceiling', ['No short answers please, I want detail.', 'I want the long version, not the short version.', 'Not the short answer, the real one please.', 'Skip the short version, give me everything.', 'Please, no brief answers. Explain the whole thing.', 'Give me a thorough answer instead of a short answer.', 'Rather than a short reply, write it out fully.'], [U('Tell me about the French Revolution.'), A('It began in 1789.')], (r) => !sig(r).includes('explicit.shorter') && !/v360/.test(r.trace));
  each('  asking for one still is', ['short answers please', 'Give me the short version.', 'make it shorter'], [U('Tell me about the French Revolution.'), A('It began in 1789.')], (r) => sig(r).includes('explicit.shorter'));
  each('a quiz that says how it runs is a quiz (or, unclear, nothing) — never "give it now"', ['Quiz me. For the ones I get wrong, just give me the answer.', 'Quiz me on capitals, just tell me right or wrong.', "Quiz me on the elements. Just give me the symbol and I'll name it.", "Quiz me on French. Just give me the English word and I'll translate it.", "Quiz me on dates — just tell me the event and I'll say the year.", 'Drill me on multiplication. Just give me random ones.', 'quiz me on capitals, just give me 10', 'Quiz me on the planets, and just show me the correct answer if it is wrong.', 'Quiz me on anatomy. Just tell me the right answer after.', 'Quiz me on verbs, and just give me feedback.', 'Quiz me on the presidents, just tell me the number and I will name them.', "Quiz me — just show me a flag and I'll guess the country.", 'Test me on the vocab, and wait, no peeking, just tell me if I got each one right'], [], (r) => !/a=direct/.test(r.trace));
  const quizRun = run([U('Quiz me. For the ones I get wrong, just give me the answer.'), A('What is the capital of Peru?'), U('Lima'), A('Correct! What is the capital of Kenya?'), U('Nairobi'), A('Right! Next: the capital of Japan?'), U('Tokyo')]);
  ok('  and its answers ("Lima", "Nairobi", "Tokyo") are not questions that did not help', !sig(quizRun).includes('observed.unproductive_questions'), quizRun.trace);
  each('a retraction is one, whatever words follow it ("which one", "question", "then", "each")', ['Quiz me on it — no wait, just answer my question: what is a derivative?', 'Quiz me on these. Actually just tell me which one is right.', 'quiz me on the causes... hmm, no, just tell me then.', 'Quiz me on it — no, just give me the answer to question 3.', 'Can you quiz me? No, actually, just give me the answers to each question.', 'quiz me. ok no, just give me the answer', 'Quiz me on derivatives. Changed my mind: just give me the answer.'], STUDY, (r) => !/preserve_challenge|noreveal/.test(r.trace));
  each('inside a running quiz, how it runs is not the end of it', ['Nairobi, just give me the next one', 'Nairobi. Just give me another.', 'Just give me the next question.', "Is it Nairobi? Just tell me if I'm right.", 'Nairobi. You pick the next country.', 'Nairobi — just give me a score at the end.'], QUIZH, (r) => /preserve_challenge/.test(r.trace));
  const onward = run([...QUIZH, U('Nairobi, just give me the next one'), A('Correct! What is the capital of Japan?'), U('Tokyo')]);
  ok('  and the quiz goes on: "Tokyo" is an answer, not an unproductive reply', /preserve_challenge/.test(onward.trace) && !sig(onward).includes('observed.unproductive_questions'), onward.trace);
  ok('  while "just tell me the answer" ends it', !/preserve_challenge/.test(run([...QUIZH, U('just tell me the answer')]).trace));
  each('the quiz ends when they end it, in the words people use', ["I don't want to do the quiz anymore.", "I'm done with quizzes for now, can you help me write my cover letter?", "ok that's it for the quiz", "Thanks, that's all for the quiz. Now, how do I cite a website in APA?", "Let's pause the quiz, I need help with something else.", 'Quiz over. How do I cite a website?', 'Can we take a break from the quiz?', "Let's call it a day.", 'Nairobi. Can we do something else now? I need help with an email to my boss.', 'Thanks for the quiz! Now can you just explain how photosynthesis works?', "I'm done with this quiz, can you give me another explanation of mitosis?"], QUIZH, (r) => !/preserve_challenge/.test(r.trace));
  each('"zero questions", "fewer questions", "I want to ask you some questions" are not questions asked for as content', ['I need zero questions from you, just the plan.', 'I want fewer questions and more answers.', 'I really want no more questions, just tell me what to pack.', 'Give me less questions and more examples.', 'I want to ask you some questions about the JR pass.', 'I need to ask a few questions about hotels in Kyoto.', 'I need help with these questions from my visa form: what is a sponsor?'], STOPH, (r) => /g=h/.test(r.trace) && !/questionBudget\.hard/.test(r.trace));
  each('  while questions asked for as content, in other words, are', ['what questions should I ask at the end of my job interview', 'give me some icebreakers for my team meeting', 'what can I ask my landlord about the leak', 'what should I ask my doctor about the new medication', 'give me a riddle for my kid', 'help me with the survey questions', 'put together a FAQ page for the bakery'], STOPH, (r) => !/g=h/.test(r.trace));
  const SINK = [U('My kitchen sink is leaking.'), A('Where is it leaking? Is it the pipe?'), U('stop asking me questions'), A('Understood.'), U('Write a message to my landlord about the leak under the sink'), A('Hi Sam, the kitchen sink is leaking under the cabinet. Could you send someone this week? Thanks, Alex')];
  each('"cut the small talk", "change the topic", "make it a priority list" do not revise the draft', ['Cut the small talk and tell me how to fix the leak myself.', 'Change the topic please. Tell me about renters insurance.', "Drop the email idea, I'll call her instead. Tell me how to start the call.", 'make it a priority list of what to do before she replies', 'Remove the cabinet doors first or not. Just tell me.'], SINK, (r) => /g=h/.test(r.trace) && !/questionBudget\.hard/.test(r.trace));
  ok('  while "make it warmer" still does', /questionBudget\.hard/.test(run([...SINK, U('make it warmer')]).trace));
  each('a text classifier is code, and "Python developers" is not a name', ['Help me write a text classifier for my students', 'What should I say to Python developers at the meetup?'], STOPH, (r) => /g=h/.test(r.trace));
  each('a card for their son, a note for their daughter: the writing is theirs, the claim filter stays off', ['Write a card for my son saying how much he has improved at piano this year.', 'Write a short note for my daughter, she has really improved at reading.', 'Write a message for my players telling them how much they have improved this season.'], [], (r) => r.gate.dropUnsupportedClaims === false);
  each('standing words in another clause make nothing standing', ['Just give me the answer. From now on, the deadlines are stricter at my school.', 'Stop asking me questions. Going forward, the exam is all essays.', 'You never give me a straight answer, every time I ask you dodge. Just tell me.', 'Stop asking me questions, you always make me feel dumb and never give me a straight answer.', 'Just tell me the answer. I never ask for help usually, I always try it myself.', 'Just tell me. My mom said always ask for help, but you never give answers.', 'Just give me the answer — always give credit to the source in my essay, right?', 'Just give me the answer. I always forget, never show me the long way.'], [U('Help me with my homework.'), A('Sure, what is it?')], (r) => !sig(r).includes('explicit.standing'), { carried: [] });
  each('  while the instruction in the same clause is', ['From now on, stop asking me questions.', 'Stop asking me questions from now on.', 'From now on I want short answers.', 'Please always give me the answer first.'], [U('Help me with my homework.'), A('Sure, what is it?')], (r) => sig(r).includes('explicit.standing'), { carried: [] });
  const ESSAY = [U('Here is my essay: The industrial revolution changed everything. It made factories. People moved to cities.'), A('Thanks — what would you like me to do with it?')];
  each('a rewrite asked for is never "edit only"', ['Rewrite it completely, but keep my voice.', 'Rewrite the whole thing to sound more confident, keep my tone though.', 'Rewrite the intro and leave the rest alone.', 'Last time you fixed only the typos; this time rewrite it fully.'], ESSAY, (r) => !sig(r).includes('explicit.edit_only'));
  each('  "just fix the grammar" still is', ['just fix the grammar', "don't rewrite it, only fix the typos", 'keep my voice please'], ESSAY, (r) => sig(r).includes('explicit.edit_only'));
}

console.log('\n=== round 3: the guard keeps the answer theirs; a draft keeps its question ===');
{
  const loop = [U('Solve 3x + 5 = 20.'), A('What would you do first to get x on its own?'), U('idk'), A('Which operation undoes the +5?'), U('no idea')];
  const guarded = run(loop, { guard: true, math: true });
  ok('under the Answer Guard, questions that did not help are cut as hints — never "give your best answer now"', /qw1\/3/.test(guarded.trace) && !/Give your best answer now/.test(guarded.block) && /the answer itself stays theirs/.test(guarded.block), `${guarded.trace} ${guarded.block}`);
  const open = run(loop, { math: true });
  ok('  without the guard the line is what it was', /Give your best answer now/.test(open.block), open.block);
  const boss = [U('My boss keeps moving our one-on-ones.'), A('How often does it happen? Has he said why?'), U('stop asking me questions'), A('Understood.'), U('write an email to my boss asking for a fixed time each week')];
  const draft = run(boss);
  const acsQ = input(boss).acs.assist.questions;
  ok('a draft under a "stop asking" keeps ACS\'s question budget, so the email\'s own closing question is not cut', draft.contentTurn && draft.assist.questions === acsQ && !draft.gate.hardNoQuestions, `${draft.trace} q=${draft.assist.questions} acs=${acsQ}`);
}

/** The route's block hook (app/api/logos/chat/route.ts): what MR held goes out before the block, which starts its own line. */
const fenced = (pre, c) => pre + (pre && !pre.endsWith('\n') && c.startsWith('```') ? '\n\n' : '') + c;

console.log('\n=== round 3: the reply filters leave the text whole (every chunk size) ===');
{
  const { SentenceGate } = await import('./.tmp/stream-gate.mjs');
  const HARD = { hardNoQuestions: true, dropUnsupportedClaims: true };
  const CLAIMS = { hardNoQuestions: false, dropUnsupportedClaims: true };
  const CHECKIN = { hardNoQuestions: false, dropUnsupportedClaims: true, dropCheckIns: true };
  const through = (reply, ctl, q, step) => {
    const g = MR.replyGate({ gate: ctl });
    let out = '';
    const gate = new SentenceGate((t) => (out += t), {
      // as the route: the pieces MR gives back (none for a chunk taken out, a held number apart from its item)
      rewriteAll: g.filterAll,
      keep: g.exempt,
      see: g.see,
      neverEmpty: true,
      block: (c) => fenced(g.sawBlock(c), c),
    });
    for (let i = 0; i < reply.length; i += step) gate.push(reply.slice(i, i + step));
    gate.finish(q);
    out += g.settle();
    return out;
  };
  const cases = [
    ['table cells that end in "?" stay, and no rows are glued', '| Feature | Pixel 9 | iPhone 16 |\n|---|---|---|\n| Price | $799 | $829 |\n| Waterproof? | Yes | Yes |\n| Expandable storage? | No | No |\n\nBoth are solid.', HARD, 0, (o) => o.includes('| Waterproof? | Yes | Yes |\n| Expandable storage? | No | No |')],
    ['a quoted closing question survives the tail cap', 'Try this: “Hi, sorry to bother you. Could you turn the music down after 10pm?”', HARD, 0, 'Try this: “Hi, sorry to bother you. Could you turn the music down after 10pm?”'],
    ['a heading keeps its line when the claim after it goes', '**Your progress**\nYou have really improved at the chain rule. The next step is implicit differentiation.', CLAIMS, 1, '**Your progress**\nThe next step is implicit differentiation.'],
    ['Socria\'s words are not pulled into the quoted draft', 'Here it is:\n> Thanks,\n> Sam\nDo you want me to make it more formal? I kept it short so it gets read.', HARD, 0, 'Here it is:\n> Thanks,\n> Sam\nI kept it short so it gets read.'],
    ['a question taken out leaves its paragraph break before the heading', 'Measure the wall first. Do you have a stud finder?\n\n## Step 2: mark the studs\n\nUse a pencil.', HARD, 0, 'Measure the wall first. \n\n## Step 2: mark the studs\n\nUse a pencil.'],
    ['  and before a table, which still renders', 'Here is the comparison. Which one fits your budget?\n\n| Wood | Cost |\n|---|---|\n| Oak | $$ |', HARD, 0, 'Here is the comparison. \n\n| Wood | Cost |\n|---|---|\n| Oak | $$ |'],
    ['a numbered item taken out takes its number', '1. Measure the wall.\n2. Do you have a stud finder?\n3. Mark the studs.\n4. Drill the holes.', HARD, 0, '1. Measure the wall.\n3. Mark the studs.\n4. Drill the holes.'],
    ['  a claim as the first item too', 'Summary:\n1. You have really improved at fractions.\n2. Your decimals need work.\n3. Practise daily.', CLAIMS, 1, 'Summary:\n2. Your decimals need work.\n3. Practise daily.'],
    ['  and a check-in item', 'My pick:\n1. Get the MacBook Air M3.\n2. Want me to compare it with the Dell?\n3. Buy it with the student discount.', CHECKIN, 1, 'My pick:\n1. Get the MacBook Air M3.\n3. Buy it with the student discount.'],
    ['a list of questions introduced as such stays ("Ask these:")', 'Ask these:\n\n1. How long will it take?\n2. What are the side effects?\n3. Can I drink alcohol?', HARD, 0, 'Ask these:\n\n1. How long will it take?\n2. What are the side effects?\n3. Can I drink alcohol?'],
    ['  and a labelled one ("Ask: …?")', 'Ask: When will the leak be fixed?', HARD, 0, 'Ask: When will the leak be fixed?'],
    ['  but Socria\'s own listed questions still go', 'Before I can help:\n- What is your budget?\n- Which OS do you use?\nThen I can pick.', HARD, 0, (o) => !/\?/.test(o)],
    ['a plural possessive closes no quotation', "You could text: 'The kids' bikes are ready. Are you free to pick them up on Friday?' That is clear and friendly.", HARD, 0, "You could text: 'The kids' bikes are ready. Are you free to pick them up on Friday?' That is clear and friendly."],
    ['a nested “…” closes nothing outside it', 'You could text: "I got tickets for “Dune”. Want to come on Friday?" That is casual.', HARD, 0, 'You could text: "I got tickets for “Dune”. Want to come on Friday?" That is casual.'],
    ['a quote opened right after a comma is a quote', 'Something like,"Hi. Are you free on Friday?" works.', HARD, 0, 'Something like,"Hi. Are you free on Friday?" works.'],
    ['a question the next sentence answers stays with it', 'Get the MacBook Air M3. Should you pay for AppleCare? Only if you tend to drop things. The base model is enough.', HARD, 0, 'Get the MacBook Air M3. Should you pay for AppleCare? Only if you tend to drop things. The base model is enough.'],
    ['  and a condition put as a question', 'Bake at 230C for 35 minutes. Want a crispier crust? Leave it in for 5 more minutes with the lid off.', HARD, 0, 'Bake at 230C for 35 minutes. Want a crispier crust? Leave it in for 5 more minutes with the lid off.'],
    ['  but a question put to them still goes', 'Measure the wall first. Do you have a stud finder? Mark the studs with a pencil.', HARD, 0, 'Measure the wall first. Mark the studs with a pencil.'],
    ['code in an unclosed fence is code', 'Here is a check:\n\n```python\n# does this print True?\nprint(2 + 2 == 4)\n', HARD, 0, 'Here is a check:\n\n```python\n# does this print True?\nprint(2 + 2 == 4)\n'],
    ['  and in a closed fence that streams in pieces', 'Code:\n\n```python\n# is this right?\nprint(1)\n```\n\nDone. Want more?', HARD, 0, 'Code:\n\n```python\n# is this right?\nprint(1)\n```\n\nDone. '],
    ["a leading apostrophe ('90s, 'cause) opens no quotation", "Shelves like this peaked in the '90s. Do you have room for it? It is oak.", HARD, 0, "Shelves like this peaked in the '90s. It is oak."],
    ['a reply with nothing to take out is untouched', 'The answer is 42. It follows from the definition.\n\nThat is all.', HARD, 0, 'The answer is 42. It follows from the definition.\n\nThat is all.'],
  ];
  for (const [label, reply, ctl, q, want] of cases) {
    const bad = [1, 2, 3, 5, 7, 13, 1e6].map((step) => [step, through(reply, ctl, q, step)]).filter(([, o]) => (typeof want === 'string' ? o !== want : !want(o)));
    ok(label, !bad.length, J(bad));
  }
  const idle = MR.replyGate({ gate: { hardNoQuestions: false, dropUnsupportedClaims: false } });
  ok('with nothing armed the filter hands every chunk back as it came (shadow is the route without MR)', ['2. ', 'Do you have a stud finder?\n', '3. ', 'Mark it.'].every((x) => idle.filter(x) === x));
}

console.log('\n=== going off the record deletes nothing: no reading of their words is a reason to delete (round 6) ===');
{
  // rounds 3-5 each found everyday sentences ("When I talk to reporters, it's off the record", a quoted reply)
  // that a reader took as their word to delete; MR now stops recording from that turn and deletes nothing.
  // "Forget what Socria worked out" and deleting the conversation delete (test/mr-api, test/mr-route).
  ok('there is no reader whose verdict deletes a conversation\'s rows', typeof MR.offRecordSaid === 'undefined');
  const long = 'Background on the bakery. '.repeat(207) + 'This whole conversation is off the record.';
  // one text for the message (round 4): its first 4,000 characters and every passage past them that mentions the record
  ok('a long message is read past its first 4,000 characters where it mentions the record', long.length > 5000 && MR.recordPieces(long).length === 1 && /off the record/.test(MR.recordPieces(long)[0]), MR.recordPieces(long).length);
}


console.log('\n=== round 4: words that END something are read where they are said; the filters at every piece size ===');
{
  const codes4 = (r) => r.state.observations.filter((x) => x.turn === r.state.turn).map((x) => x.code.replace('explicit.', 'x.').replace('observed.', 'o.'));
  const short4 = (r) => r.trace.split(';').filter((x) => /^(a|t|c|con|g)=/.test(x) || x === 'carried').join(';');
  const group = (label, list, pre, test, o) => {
    const fails = list.filter((t) => { const r = run([...pre, U(t)], o); return !test(r, codes4(r)); });
    ok(label, !fails.length, J(fails.map((t) => { const r = run([...pre, U(t)], o); return `${t} → ${short4(r)} ${codes4(r).join(',')}`; })));
  };
  const { SentenceGate } = await import('./.tmp/stream-gate.mjs');
  const through = (reply, ctl, q, step, held = false) => {
    const g = MR.replyGate({ gate: ctl });
    let out = '';
    const gate = new SentenceGate((t) => (out += t), {
      rewriteAll: g.filterAll,
      keep: g.exempt, see: g.see, neverEmpty: true,
      block: (c) => fenced(g.sawBlock(c), c),
    });
    if (held) gate.push(reply); else for (let i = 0; i < reply.length; i += step) gate.push(reply.slice(i, i + step));
    gate.finish(q);
    out += g.settle();
    return { out, dq: g.dropped.questions, dc: g.dropped.claims };
  };
  const gcase = (label, reply, ctl, want, q = 0) => {
    const fails = [];
    for (const [step, held] of [[1, false], [2, false], [3, false], [5, false], [7, false], [16, false], [1e6, true]]) {
      const r = through(reply, ctl, q, step, held);
      if (!(typeof want === 'string' ? r.out === want : want(r.out, r))) fails.push(`${step}:${JSON.stringify(r.out)}`);
    }
    ok(label, !fails.length, fails.slice(0, 3).join(' | '));
  };
  const codes = codes4;
  const QUIZH = [U('quiz me on world capitals'), A('What is the capital of Peru?'), U('Lima'), A('Correct! What is the capital of Kenya?')];
  const STOPH = [U('I am planning a trip to Japan.'), A('When are you going? What do you enjoy?'), U('stop asking me questions'), A('Understood. Here is a simple plan.')];
  const noQuiz = (r) => !/preserve_challenge|noreveal/.test(r.trace);
  group('#1 the answer asked for inside a quiz ends it', ['just tell me', 'Can you just tell me?', "I don't know, just tell me", 'Just tell me the capital of Kenya.', 'Just tell me what the capital of Kenya is.', "Just tell me the answer, I'll get the next one.", "Just tell me the answer. When I see it I'll remember it.", 'Just give me a list of all the African capitals.', 'Just write me a cheat sheet of the capitals.', 'Just tell me about the history of Nairobi.', 'Just give me some tips for memorising capitals.', 'I give up, what is it?', 'Please reveal the answer', "What's the correct answer?"], QUIZH, noQuiz);
  group('#1 control: how it runs keeps it', ['Nairobi, just give me the next one', "Is it Nairobi? Just tell me if I'm right.", 'Nairobi. You pick the next country.', 'Nairobi — just give me a score at the end.'], QUIZH, (r) => !noQuiz(r));
  group('#2 quiz endings', ["Don't quiz me anymore.", "Don't ever quiz me again.", 'Stop testing me.', 'Quit testing me', 'No more testing', 'Stop with the quiz.', 'Stop the questions.', "I don't want to be quizzed anymore.", "I don't want any more questions.", "Let's stop now.", "ok let's stop", 'Can we stop?', "I'm done now.", "Let's end it here.", 'End quiz', "Let's wrap this up.", "That's it for the quiz, I'll do another one next week.", 'Stop the quiz. We can do another one tomorrow.', 'No more quiz today, maybe another one next week.', "Let's end the quiz here, I'll ask for another one later.", "Thanks for the quiz! I'll come back for another one."], QUIZH, noQuiz);
  const lifted = (r) => !/q0h/.test(r.trace);
  group('#3 revocations', ['I think you can ask me questions again.', 'I guess you can ask me questions again.', 'I suppose you may ask questions again.', 'I realise now you can ask me questions again.', 'We can go back to asking questions.', "It's OK if you ask me questions again.", 'Turns out I do want you to ask me questions again.', 'Ok I guess you can quiz me again.', 'Honestly I think you should go back to asking me questions.', "Why don't you ask me some questions?", "I'd actually like you to ask me questions.", 'Feel free to ask questions.', 'You can ask questions now.', 'I changed my mind, you can ask questions', 'Questions are fine.', 'Ask me a question.', "You're allowed to ask questions again."], STOPH, lifted);
  group('#3 control: not revocations', ['Is it okay to ask questions again at my follow-up appointment?', 'Go back to asking me questions? No, keep it as it is. What exercises help?', 'How long does it take to get back to normal after jet lag?', 'I think you can ask the hotel staff questions about it.'], STOPH, (r) => /q0h/.test(r.trace));
  group('#4 a quiz asked for now (time words date the test)', ['Quiz me on hiragana before my test tomorrow.', 'Quiz me on the phrases now because I fly out tomorrow.', 'Can you test me on the phrases for my trip next week?', 'Quiz me on the greetings since I leave next week.', 'Please quiz me on the menu words for dinner tonight.', 'Ok, quiz me on the phrases I need for tomorrow.', 'Quiz me now rather than later.', 'You can ask me questions again because I leave tomorrow.', 'You can ask me questions again since the trip is next week.'], STOPH, lifted);
  group('#4 control: a quiz put off', ['Quiz me next week. For now, what is a good phrase for thank you?', 'You can quiz me tomorrow. Tonight I just need to know how to say hello.'], STOPH, (r) => /q0h/.test(r.trace));
  group('#4 a stop with an end still ends the quiz now', ['Stop quizzing me until tomorrow.', 'Stop asking me questions until later, I need a break.', 'Stop quizzing me for today because I have work tomorrow.'], QUIZH, noQuiz);
  group('#5 stop X, just quiz me: the quiz', ['Stop asking me what I want, just quiz me.', 'Stop asking me which continent, just quiz me on anything.', 'Enough with the questions about what I know — just test me.', 'No more questions about my level, quiz me on Asia.', "Don't ask me any more questions about it, just quiz me.", 'Stop asking me if I am ready. Quiz me!'], [U('I want to get better at world capitals.'), A('Great! Which continents do you want to focus on? How many do you already know?')], (r, c) => !/q0h/.test(r.trace) && c.includes('x.quiz'));
  group('#5 one at a time is not a stop', ['Can you stop asking me so many questions at once? Ask one at a time.'], [U('I want to get better at world capitals.'), A('Which continents? How many do you know?')], (r) => !/q0h/.test(r.trace));
  group('#6 a hint keeps a stop', ['Just give me a hint, no questions please.', 'Hints only, and no questions.', 'Give me a hint.', 'Just a nudge please.', 'No spoilers! Let me solve it myself.'], [U('Solve 3x + 5 = 20.'), A('What would you do first? What undoes the +5?'), U('stop asking me questions'), A('Understood.')], (r, c) => /q0h/.test(r.trace) && !c.includes('x.revoke') && !c.includes('x.quiz'));
  group('#6 a conflict keeps a stop', ['Can you quiz me on capitals, or just tell me the capital of Peru?'], STOPH, (r) => /q0h/.test(r.trace));
  group('#7 a stop restated is not questions as content', ['Make sure not to ask questions. Give me a packing list.', 'Make sure you never ask questions.', 'Give me facts not questions.', 'Give me tips not questions.', 'Write the itinerary without asking questions.', 'Give me the itinerary without the questions.', 'Give me the list without follow-up questions.', 'Just give me the plan without questions.', 'Make a packing list and quit asking questions.'], STOPH, (r) => /g=h/.test(r.trace));
  const SHORTH = [U('Tell me about the French Revolution.'), A('It began in 1789.'), U('make it shorter'), A('It began in 1789 and ended the monarchy.')];
  const noCeiling = (r) => !/v\d+/.test(r.trace);
  group('#8 more detail takes back shorter', ['Can you give me more details?', 'I need more details.', 'More details please', 'That is too brief.', 'Too short.', 'longer please', 'Be more detailed.', 'Give me a detailed explanation.', 'Describe it in detail.', 'Tell me about the Terror in detail.', 'Go into details on the Terror.', 'Explain it fully.', 'Give me the long version.', 'Normal length is fine.', "You don't have to keep it short anymore."], SHORTH, noCeiling);
  group('#8 a long length asked for', ['Write me a 1000-word essay on the causes of the Revolution.', 'Write 800 words on Robespierre.'], SHORTH, noCeiling);
  group('#9 somebody else\'s "shorter" is no ceiling', ['My boss wants shorter replies to customers. How do I write one?', 'Our editor says I need to get to the point faster in my articles.', 'Customers complain my emails are a wall of text. How do I fix that?', 'The client asked for briefer responses from our support team.'], [U('I need help at work.'), A('Sure, what is going on?')], noCeiling);
  group('#9 control: their own still is', ['keep your answers short', "that's a wall of text", 'get to the point'], [U('I need help at work.'), A('Sure, here is a long explanation of everything that might be going on.')], (r) => !noCeiling(r));
  group('#10 a teacher\'s "show the steps" is not standing', ['From now on our teacher wants us to show the steps on homework. Here is question 1: 2x + 3 = 7.', 'Going forward, the rubric asks students to show the steps. What is question 2 about?', 'From now on the test will ask us to show the steps, which is annoying.'], [U('Help me with my homework.'), A('Sure, what is it?')], (r, c) => !c.includes('x.standing') && !c.includes('x.show_steps'), { carried: [] });
  group('#11 a quiz taken back, whatever follows the no', ['Quiz me on mitosis. Actually, no, just explain it.', 'Can you quiz me on mitosis? Hmm, no. Just list the phases for me.', 'Quiz me on it, or rather, just explain the phases.', 'Test me on mitosis. I take that back, just explain it.', 'Quiz me on it. No — explain prophase instead.', 'quiz me. no. explain it.', "Don't tell me the answer. Hmm, actually, do tell me."], [U('I am studying for my biology final.'), A('Great. Which topics feel weakest?')], noQuiz);
  const ESSAYH = [U('Here is my essay: The industrial revolution changed everything. It made factories. People moved to cities.'), A('Thanks — what would you like me to do with it?'), U('just fix the grammar'), A('The Industrial Revolution changed everything.')];
  group('#12 a rewrite ends edit-only', ['Now rewrite it completely.', 'Can you rewrite it?', 'Please rewrite it in your own words.', 'Feel free to change my wording.', 'Improve the whole essay.', 'Make any changes you think are needed.', 'Turn it into a persuasive essay.'], ESSAYH, (r) => !/edit_as_asked/.test(r.trace));
  group('#12 one message: keep my voice and add', ['Keep my style and add a conclusion.', 'Keep my voice and extend it to 500 words.', 'Keep my tone but add two more paragraphs about child labour.', 'Leave the rest alone and write a new conclusion for it.'], [U('Here is my essay: The industrial revolution changed everything.'), A('Thanks — what would you like me to do with it?')], (r) => !/edit_as_asked/.test(r.trace));
  group('#13 try it first is about that problem', ['Great. What is the capital of Australia?', 'What year did WW2 end?'], [U('What is the derivative of x^2 sin x? Let me try it first.'), A('Sure. Which rule applies?'), U('the product rule, so 2x sin x + x^2 cos x'), A('Exactly right — well done.')], noQuiz);
  group('#13 control: still theirs while working', ['is it 2x sin x + x^2 cos x?'], [U('What is the derivative of x^2 sin x? Let me try it first.'), A('Sure. Which rule applies?')], (r) => /noreveal/.test(r.trace));

  // gate, wired as the route
  const HARD = { hardNoQuestions: true, dropUnsupportedClaims: true };
    const CLAIMS = { hardNoQuestions: false, dropUnsupportedClaims: true };
  gcase('#15 a bare number answer', '42.', CLAIMS, '42.', 1);
  gcase('#15 a number at the end', 'Each spider has 8 legs, and 3 × 8 is:\n\n24.', CLAIMS, 'Each spider has 8 legs, and 3 × 8 is:\n\n24.', 1);
  gcase('#16 own intro + list goes', 'Before I pick one, a few questions for you:\n\n1. What is your budget?\n2. Do you game?\n3. Mac or Windows?', HARD, (o) => !/\?/.test(o));
  gcase('#16 "Let me ask a few things first:"', 'Let me ask a few things first:\n- What is your budget?\n- Do you need it for gaming?\n\nThen I can pick.', HARD, (o) => !/\?/.test(o));
  gcase('#16 "Quick questions:"', 'Quick questions:\n- What is your budget?\n- Windows or Mac?', HARD, (o) => !/\?/.test(o));
  gcase('#17 "Sound good? Then…" goes', 'Do two topics a day and review on Sunday. Sound good? Then I will lay it out by day.', HARD, (o) => !/\?/.test(o));
  gcase('#17 "Got it? Then add the tens." goes', 'Add the ones first: 7 + 8 is 15, so write 5 and carry the one. Got it? Then add the tens.', HARD, (o) => !/\?/.test(o));
  gcase('#17 "Would you like…? If so, I can…" goes', 'Pack layers, comfortable shoes and a rain jacket. Would you like a day-by-day list? If so, I can write one.', HARD, (o) => !/\?/.test(o));
  gcase('#17 "Want the full packing list? I can send it." goes', 'Pack layers, comfortable shoes and a rain jacket. Want the full packing list? I can send it.', HARD, (o) => !/\?/.test(o));
  gcase('#17 "Need more examples? Just say so." goes', 'Time is a thief. Her voice was music. Need more examples? Just say so.', HARD, (o) => !/\?/.test(o));
  gcase('#17 control: AppleCare stays', 'Get the MacBook Air M3. Should you pay for AppleCare? Only if you tend to drop things.', HARD, 'Get the MacBook Air M3. Should you pay for AppleCare? Only if you tend to drop things.');
  gcase('#18 bold question goes', 'The MacBook Air is the safe pick.\n\n**What is your budget?**', HARD, (o) => !/\?/.test(o));
  gcase('#18 italic question goes', 'The MacBook Air is the safe pick. *What is your budget?*', HARD, (o) => !/\?/.test(o));
  gcase("#19 'Settings' closes", 'Open ‘Settings’ and tap ‘Notifications’. Do you want me to walk you through Focus modes too? They can silence apps on a schedule.', HARD, (o) => !/\?/.test(o));
  gcase("#19 'spices' closes", "Label the jars 'spices' and 'herbs' so you can find them. Do you want me to make labels? They help.", HARD, (o) => !/\?/.test(o));
  gcase("#19 'cos", "I'd buy it 'cos it lasts. Do you have room for it? It is oak.", HARD, (o) => !/\?/.test(o));
  gcase('#19 ‘90s', 'Shelves like this peaked in the ‘90s. Do you have room for it? It is oak.', HARD, (o) => !/\?/.test(o));
  gcase('#20 For example: own question goes', 'Think about the side first. For example: what happens to the area if you double the side?', HARD, (o) => !/\?/.test(o));
  gcase('#20 Try: own question goes', 'It is usually an unset variable. Try: is the variable assigned before the call?', HARD, (o) => !/\?/.test(o));
  gcase('#20 Q: own question goes', 'The MacBook Air is a good default.\n\nQ: Do you already own a monitor?', HARD, (o) => !/\?/.test(o));
  gcase('#21 intro mid-line keeps the list', 'Bring your scan results. Questions to ask your doctor:\n\n1. How long will recovery take?\n2. Do I need physiotherapy?\n3. When can I run again?', HARD, 'Bring your scan results. Questions to ask your doctor:\n\n1. How long will recovery take?\n2. Do I need physiotherapy?\n3. When can I run again?');
  gcase('#21 "At the end, ask:"', 'Research the team first. At the end, ask: What does success look like in the first 90 days? It shows you are thinking ahead.', HARD, 'Research the team first. At the end, ask: What does success look like in the first 90 days? It shows you are thinking ahead.');
  gcase('#22 AppleCare after a paragraph break', 'Get the MacBook Air M3.\n\nShould you pay for AppleCare? Only if you tend to drop things.', HARD, 'Get the MacBook Air M3.\n\nShould you pay for AppleCare? Only if you tend to drop things.');
  gcase('#22 crispy crust after a break', 'Bake at 230C for 35 minutes.\n\nWant a crispier crust? Leave it in for 5 more minutes with the lid off.', HARD, 'Bake at 230C for 35 minutes.\n\nWant a crispier crust? Leave it in for 5 more minutes with the lid off.');
  gcase('#23 own offer after a quoted line goes', '> Hi Sam, are you free on Friday? \n\nWant me to make it warmer? It reads fine as it is.', HARD, (o) => !/warmer/.test(o) && /> Hi Sam, are you free on Friday\?/.test(o));
  gcase('#23 numbered item after a spaced break', '1. Measure the wall. \n\n2. Do you have a stud finder?\n3. Drill the holes.', HARD, (o) => !/2\./.test(o) && /3\. Drill/.test(o));
  gcase('#23 Ask these after a spaced break', 'Bring your scan results. \n\nAsk these:\n\n1. How long will recovery take?\n2. Do I need physiotherapy?', HARD, (o) => /How long will recovery take\?/.test(o) && /physiotherapy\?/.test(o));
  // the same text as MR unset (the core puts a fence on its own line: round-5 review #26)
  gcase('#24 number before a fenced item', '1. Install Node.\n2. ```sh\nnpx create-next-app@latest\n```\n3. Run the dev server.', CLAIMS, '1. Install Node.\n2. \n\n```sh\nnpx create-next-app@latest\n```\n3. Run the dev server.', 1);
  gcase('#26 removed question before a fence', 'Use print. Want it in Python 2 too?\n```python\nprint(1)\n```\nThat prints 1.', HARD, (o) => o.includes('```python\nprint(1)\n```') && !/Python 2/.test(o));
  // claims in writing they asked for (#25)
  for (const [msg, reply] of [["Make this feedback for my student sound warmer: 'You have improved at fractions.'", 'You have really improved at fractions, and it shows in your work.'], ["Translate into English: 'Tu as vraiment progressé.'", 'You have really improved.'], ['Proofread this comment for my student: You have really improved at fractions, well done.', 'You have really improved at fractions. Well done!']]) {
  
    const r = run([U(msg)]);
    const ok_ = r.gate.dropUnsupportedClaims === false;
    ok(`#25 the claim filter is off for writing they asked for: "${msg.slice(0, 40)}…"`, ok_, r.trace);
  }
  // off the record (#30): the turn is unrecorded over recordPieces (nothing is deleted on any wording, round 6)
  {
    const notes = 'Bakery notes: we open at seven and the rye sells out early. '.repeat(70);
    const a = notes.slice(0, 4314) + ' This whole conversation is off the record. ' + notes.slice(0, 300) + ' Please remember this ratio for the rye: one part starter to two parts flour.';
    const b = notes.slice(0, 3995) + 'off the record, all of this. ' + notes.slice(0, 900);
    for (const [lbl, msg] of [['(a) later remember-this', a], ['(b) across the cut', b]]) {
    
      const pol = (await import('./.tmp/logos-turn.mjs').catch(() => null))?.logosPersistPolicy;
      const p = pol ? pol(MR.recordPieces(msg)) : 'n/a';
      ok(`#30 ${lbl}: the message is off the record over recordPieces`, p === 'none', p);
    }
  }


  // ── ROUND 5 (scratchpad side/verify5-open.txt): each finding, from the reviewer's own reproduction ──
  const unsetOut = (reply, q, step, held) => {
    let out = '';
    const gate = new SentenceGate((t) => (out += t), { neverEmpty: true });
    if (held) gate.push(reply); else for (let i = 0; i < reply.length; i += step) gate.push(reply.slice(i, i + step));
    gate.finish(q);
    return out;
  };
  /** With nothing in force but the claim filter, the text is exactly MR unset's, at every piece size. */
  const gsame = (label, reply, q = 1) => {
    const fails = [];
    for (const [step, held] of [[1, false], [2, false], [3, false], [5, false], [7, false], [16, false], [1e6, true]]) {
      const r = through(reply, CLAIMS, q, step, held);
      const want = unsetOut(reply, q, step, held);
      if (r.out !== want) fails.push(`${step}:${JSON.stringify(r.out)} ≠ ${JSON.stringify(want)}`);
    }
    ok(label, !fails.length, fails.slice(0, 2).join(' | '));
  };
  const inQuiz = (r) => !noQuiz(r);
  group('R5#1 an answer inside a quiz keeps the quiz', ['What about Nairobi?', 'How about Nairobi?', 'What, Nairobi?', 'Which... Nairobi?', 'Where? Oh, Nairobi.', 'What is Nairobi?', "Tell me I'm right, Nairobi!", 'Give me a second… Nairobi?', 'Give me a sec. Nairobi?'], QUIZH, inQuiz);
  group('R5#1 a hint asked for inside a quiz keeps the quiz', ['Give me the first letter.', 'Tell me the first letter', 'Give me a clue please', 'Can you give me a multiple choice?', 'Give me a hint.'], QUIZH, inQuiz);
  group('R5#1 answers in other quizzes', ['Who is Shakespeare?'], [U("Let's play Jeopardy. Quiz me on literature."), A('This playwright wrote Hamlet.')], inQuiz);
  group('  (derivatives)', ['What, cos x?', 'How about cos x?', 'Give me a sec... cos x?'], [U('Quiz me on derivatives.'), A('What is the derivative of sin x?')], inQuiz);
  group('R5#2 "that\'s enough…" with another asked for keeps the quiz', ["That's enough easy ones. Give me a harder one.", "That's enough hints, give me another one.", "Nairobi. That's enough Africa, give me another one.", "Ok that's enough for Africa. Another one please, from Asia.", "Nairobi. I'm done for now with Africa, give me another one."], QUIZH, inQuiz);
  group('  …and an answer that says "enough"', ["Yes, that's enough.", "Yes — that's enough O2, 1.5 mol is needed."], [U('Quiz me on stoichiometry.'), A('2 mol of H2 react with 1.5 mol of O2. Is there enough O2 to react with all the H2?')], inQuiz);
  const STOP5 = [U('I am planning a trip to Japan.'), A('When are you going? What do you enjoy?'), U('stop asking me questions'), A('Understood. Here is a simple plan.')];
  group('R5#3 advice, reported words and their own plans do not take a stop back', ['In an interview, you should ask questions.', 'If you have doubts, you can ask questions.', 'At the end of the talk, you can ask questions.', 'When you meet the landlord, you should ask questions.', 'During the tour, feel free to ask questions!', 'In class, questions are welcome.', 'For the exam, questions are fine.', 'I need to get back to asking questions in class.', "I'd like to get back to asking questions in lectures.", 'I want to get back to normal.', 'After the surgery, I want to go back to normal.', 'My doctor said: you can ask me questions anytime.', 'The guide told us: feel free to ask questions.', 'My friend told me that at the end of an interview, you should ask questions. Is that true in Japan too?'], STOP5, (r) => /q0h/.test(r.trace));
  group('R5#4 practising a skill, problems with X, a quiz night: no quiz', ['I want to practise piano more. How many hours a day is good?', 'I need to practice my Spanish. Which podcast is good?', 'I need to practice parallel parking. What is the trick?', 'I want to practice coding interviews. Which platform is best, LeetCode or HackerRank?', 'I want to practise mindfulness. Where do I start?', "Let's practise social distancing, lol. Anyway, what's the weather in Tokyo?", 'Give me problems that beginners face with React.', 'Give me 3 problems with nuclear energy.', 'Give me a few questions people usually ask at weddings.', 'Can we do a quiz night at work? How do I organise one?', 'Can we do a practice run of my presentation? Here it is: ...'], [U('Hi'), A('Hi!')], noQuiz);
  group('  …and none of them beats a stop', ['I want to practise my Japanese before the trip. Which app is best?', 'I need to practice my interview answers. What are common ones?'], STOP5, (r) => /q0h/.test(r.trace));
  group('  (said in the same message)', ['Stop asking me questions. I want to practise my Spanish, which app is best?'], [U('Hi'), A('Hi!')], (r) => /q0h/.test(r.trace));
  const ownTry = (r) => /noreveal/.test(r.trace);
  group('R5#5 doing it themselves while asking how: not "let me try it first"', ["I'd like to do it myself. How do I change a car tyre?", 'I want to do it myself rather than hire a plumber. How do I fix a leaking tap?', 'I want to figure it out on my own, but where do I find the tax forms?', 'Let me do this first: book the flights. Then what is next on the checklist?', 'Let me work it out first and get back to you. What categories should I include?'], [U('Hi'), A('Hi!')], (r) => !ownTry(r));
  group('  (after a fix was suggested)', ['Ok, let me try it first. If it does not work, what is plan B?'], [U('My wifi keeps dropping.'), A('Try restarting the router and updating its firmware.')], (r) => !ownTry(r));
  const OWN5 = [U('What is the derivative of x^2 sin x? Let me try it first.'), A('Sure. Which rule applies?'), U('Is it 2x sin x + x^2 cos x?'), A('Yes, well done! That is the product rule at work.')];
  group('R5#6 a request about something else ends "let me try it first"', ['Tell me about the French Revolution.', 'Explain how vaccines work.', 'Write me a haiku about autumn.', 'Summarise the plot of Hamlet.', 'List the planets in order.', 'Now a different one: what is the integral of 1/x?', 'How do I solve 3x + 5 = 11?'], OWN5, (r) => !ownTry(r));
  group('R5#7 a quiz and a narrow "no questions about my level": the quiz', ['Quiz me on Asian capitals, and please stop asking me questions about my level.', 'Quiz me on Asian capitals. Stop asking me questions about my level.', 'Test me on African capitals, but stop asking me questions about which continent.', 'Quiz me on the periodic table — no more questions about how I study.'], [U('I want to learn capitals.'), A('Great! What level are you? Which continent?')], (r) => inQuiz(r) && !/q0h/.test(r.trace));
  const SHORT5 = [U('Tell me about the French Revolution.'), A('It began in 1789.'), U('make it shorter'), A('It began in 1789 and ended the monarchy.')];
  group('R5#8 refusing length, or the length of something else, keeps "shorter"', ['I said no long version.', "Don't give me the long version.", 'Never give me the long version.', "Please don't give me the full explanation, just the date.", 'Skip all the details, just the year.', 'Spare me all the details. Who won?', 'No need for all the details. When did it end?', 'Forget the detailed answer, just name one cause.', 'Can you skip the long version? One line.', 'More detail? No thanks.', "My friend wants the full version, but I don't.", 'Is the long version of the film worth watching?', 'Which lasted longer, the Terror or the Directory?', 'Elaborate costumes were common then, right?', 'I read a detailed account of the Terror yesterday. Who was Danton?', 'I need to write a 1000-word essay on this. Give me a thesis statement.', 'My essay has to be 2000 words. What\'s a good thesis?', 'I have a 10-page paper due. What\'s one good source?'], SHORT5, (r) => /v\d+/.test(r.trace));
  group('R5#9 somebody else\'s words after a colon start nothing', ['She said: no more questions. Was that rude?', 'My manager said: stop asking questions and just do it. How do I respond?', "My dad's reply was: no more questions. How do I get him to talk?", 'The interviewer said: no more questions, thank you. Did I do badly?', 'Her text just says: stop asking me questions. What should I reply?', 'Rule one of the game: no more questions after the bell. Is that fair?', "Sign on the door: Don't ask me any questions. Is that a joke?", 'His note says: keep your answers short. Should I?', "My teacher's advice: get to the point. How do I make my essay more concise?", 'Feedback from my boss: get to the point. How do I write better emails?'], [U('Hi'), A('Hi!')], (r) => !/q0h/.test(r.trace) && !/v\d+/.test(r.trace));
  group('R5#10 "too long" about a film, their own goals: no ceiling', ['I watched Oppenheimer last night. It was way too long. Who played Kitty?', 'We had a 3-hour meeting today. That was way too long. How do I run shorter meetings?', 'My landlord sent me such a wall of text. How do I reply?', 'I need to get to the point faster in my presentations. Any techniques?', 'I want to get to the point in my essays. How?', 'I need to explain briefly in my report why sales dropped. What are common reasons?', "Get to the point is my manager's favourite phrase. Is that rude?"], [U('Hi'), A('Hi! How can I help?')], (r) => !/v\d+/.test(r.trace));
  const EDIT5 = [U('Here is my essay: The industrial revolution changed everything. It made factories.'), A('Thanks — what would you like me to do with it?'), U('just fix the grammar'), A('Fixed: The Industrial Revolution changed everything.')];
  group('R5#11 asking about the explanation, or more of the same edits, keeps edit-only', ["Can you expand on why 'changed everything' needed no comma?", "Could you rephrase what you said about capital letters? I didn't get it.", 'Can you rephrase that explanation?', "Can you improve your explanation? Why is it 'created' and not 'made'?", 'Could you rework your explanation more simply?', 'Can you redo the same fixes on this paragraph: The workers was tired.', 'Please extend the list of fixes to the next paragraph: Childs worked in mines.', 'Redo it with British spelling please.', 'I want to improve my grammar so just correct this: He go to factory.', 'Turn it into... no wait, just fix the grammar: The mills was loud.'], EDIT5, (r) => /edit_as_asked/.test(r.trace));
  const SPAN5 = [U('Quiz me on Spanish vocabulary.'), A('What is "dog" in Spanish?'), U('perro'), A('Correct! What is "cat"?')];
  group('R5#13 the next item asked for in other words keeps the quiz', ['Just give me one.', 'Just give me a word.', 'Just give me a sentence to translate.', 'Just give me one practice problem.', 'Give me a word to translate.', 'Give me a sentence instead.'], SPAN5, (r) => inQuiz(r) && !/a=direct/.test(r.trace));
  const DIRECT5 = [{ key: 'strategy:direct', value: 'direct', provenance: 'explicit', turn: 0, refs: [], confidence: 0.9, expiresAfterTurn: null }];
  group('R5#14 a learning goal does not end a carried "just give me the answer"', ["I'm learning Spanish. What's the word for apple?", "I'm trying to learn Excel. How do I sum a column?", "I want to understand how taxes work. What's a marginal rate?", "I'm studying for my driving test. What does a yellow line mean?", 'I want to learn to cook. How long do I boil an egg?', "Help me understand mortgages: what's APR?"], [], (r) => /;carried;/.test(r.trace) && /s:direct/.test(r.trace), { carried: DIRECT5 });
  group('R5#15 "let me try it first, or just tell me": acts on nothing, ends nothing', ['Let me try it first, or just tell me, whatever.'], QUIZH, inQuiz);
  const STOPQ5 = [U('Help me design a logo for my bakery.'), A('What colours do you like?'), U('Stop asking me questions.'), A('Use a warm brown wordmark.')];
  group('R5#28 asking to be questioned (an interview, a theory test, 20 questions) takes the stop back', ['Interview me for a nursing job — ask me the questions one at a time.', 'Help me practise for my driving theory test by asking me questions.', "Let's play 20 questions. You guess what I am thinking of.", 'Be my Socratic tutor on this proof — question me.', 'Do a mock interview with me for a nursing job.'], STOPQ5, (r) => !/g=h/.test(r.trace));
  // the reply filters
  gsame('R5#16 a bare number line before a break is kept (nothing in force)', 'Mars has two moons, Phobos and Deimos. Count:\n\n2.\n\nWant to know how they got their names?');
  gsame('  …"24." before an offer', 'Each spider has 8 legs, and 3 × 8 is:\n\n24.\n\nWant another one?');
  gsame('  …"7." before a question', '7.\n\nDo you want them listed?', 0);
  gsame('  …"7." before an offer', '7.\n\nWant me to list them?', 0);
  gsame('  …"156." after "The answer is:"', 'Multiply 12 by 13.\n\nThe answer is:\n\n156.\n\nWant me to show the long multiplication?', 0);
  gsame('  …a restated question before the answer', 'What is 12 × 13?\n\n156.', 0);
  gcase('R5#17 a bold question Socria answers itself stays', '**Do you need a visa?** Yes, if you stay longer than 90 days.\n\n**Can you work on a student visa?** Only with a work permit, up to 28 hours a week.', HARD, '**Do you need a visa?** Yes, if you stay longer than 90 days.\n\n**Can you work on a student visa?** Only with a work permit, up to 28 hours a week.');
  gcase('  a bold question put to them goes, and the advice after it stays', '**What is your budget?** Under $1,000, get the MacBook Air. Over that, the 14-inch Pro.', HARD, 'Under $1,000, get the MacBook Air. Over that, the 14-inch Pro.');
  gcase('  in a numbered list', '1. **Do you overpronate?** Get a stability shoe.\n2. **Do you run on trails?** Get lugs.\n3. **Is it for races?** A light shoe is fine.', HARD, '1. Get a stability shoe.\n2. Get lugs.\n3. A light shoe is fine.');
  gcase('  after a paragraph', 'Hang it on the studs.\n\n**Do you have a stud finder?** Mark the studs first, then drill the holes.', HARD, 'Hang it on the studs.\n\nMark the studs first, then drill the holes.');
  gcase('  before the working', '**Do you see the first step?** Subtract 3 from both sides, so 2x = 4, then divide by 2: x = 2.', HARD, 'Subtract 3 from both sides, so 2x = 4, then divide by 2: x = 2.');
  gcase('  a question in brackets goes, the sentence around it stays', 'Pick the Air (do you edit video?) unless you need ports.', HARD, 'Pick the Air unless you need ports.');
  gcase('R5#18 an improvement claim in bold goes, the exercise stays', "Yes, 3/4 is 6/8. **You've really improved at fractions.** Now try 3/4 + 1/8 on your own.", CLAIMS, 'Yes, 3/4 is 6/8. Now try 3/4 + 1/8 on your own.', 1);
  gcase('  …before an emoji', "Yes! You've really improved at fractions 🎉 Now try 3/4 + 1/8.", CLAIMS, 'Yes! Now try 3/4 + 1/8.', 1);
  gcase('  …in brackets', "Yes, 3/4 is 6/8 (you've really improved at this), and the next one is 3/4 + 1/8.", CLAIMS, 'Yes, 3/4 is 6/8, and the next one is 3/4 + 1/8.', 1);
  gcase('  …before the answer', "**You've really improved at fractions.** 3/4 + 1/8 = 7/8.", CLAIMS, '3/4 + 1/8 = 7/8.', 1);
  gcase('  …in brackets inside the answer', "It is 7/8 (you've really improved at these), because 3/4 = 6/8.", CLAIMS, 'It is 7/8, because 3/4 = 6/8.', 1);
  for (const intro of ['A few questions for your situation:', 'Some questions for the decision:', 'Questions for the move:', 'Questions to ask yourself:', 'Questions worth asking yourself:', 'Things worth asking yourself first:', 'Here are some questions for your consideration:'])
    gcase(`R5#19 Socria's own questions after "${intro}" go`, `Moving can pay off.\n\n${intro}\n\n1. Do you have a job lined up there?\n2. How much is rent compared to now?\n3. Would your partner move too?`, HARD, (o) => !/\?/.test(o));
  for (const intro of ['Consider asking:', 'Make sure you ask:', 'You might want to ask:', 'Here are some questions for you to ask the landlord:', 'Be sure to ask:', 'Worth asking the landlord:', 'Questions worth raising with the landlord:', 'Things to clarify with the landlord:'])
    gcase(`R5#20 questions to ask somebody else after "${intro}" stay`, `Read the lease twice.\n\n${intro}\n\n1. How long is the lease?\n2. Are pets allowed?\n3. Who handles repairs?\n\nTake photos of any damage.`, HARD, (o) => /How long is the lease\?/.test(o) && /Are pets allowed\?/.test(o) && /Who handles repairs\?/.test(o) && /Take photos/.test(o));
  gcase('  a label that ends its line keeps the question on the next', 'Research the team first.\n\nAt the end, you could ask:\n\nWhat does success look like in the first 90 days?\n\nIt shows you are thinking ahead.', HARD, 'Research the team first.\n\nAt the end, you could ask:\n\nWhat does success look like in the first 90 days?\n\nIt shows you are thinking ahead.');
  gcase('  (on the very next line)', 'At the end, ask:\nWhat does success look like in the first 90 days?\nIt shows you are thinking ahead.', HARD, 'At the end, ask:\nWhat does success look like in the first 90 days?\nIt shows you are thinking ahead.');
  gcase("R5#21 a quoted phrase ending in s closes: Socria's own question after it goes", "Say 'thanks for having us' when you leave. Do you want me to add more phrases?", HARD, (o) => !/\?/.test(o) && /thanks for having us/.test(o));
  gcase('  (curly)', 'Say ‘thanks for having us’ on the way out. Would you like a few more lines for the host?', HARD, (o) => !/\?/.test(o));
  gcase('  (mid-reply)', "Say 'thanks to the hosts' when you leave. Do you want me to add more phrases? They help.", HARD, "Say 'thanks to the hosts' when you leave. They help.");
  gcase('  (my apologies)', "Tell them 'my apologies' and move on. Do you want a longer script? It is easy.", HARD, "Tell them 'my apologies' and move on. It is easy.");
  for (const reply of ['Keep it friendly and specific.\n\nOpen with **"Would you mind turning it down after 10?"** and thank them.', 'Keep it friendly and specific. Try *"Would you mind turning it down after 10?"* and thank them.', 'Open with **"Are you free on Friday?"** and keep it short.', 'Try _"Are you free on Friday?"_ as the opener.', 'Use either "Are you in?"/"Are you free on Friday?" as the opener.'])
    gcase(`R5#22 a quotation in emphasis or after a slash is theirs to say: "${reply.slice(0, 30)}…"`, reply, HARD, reply);
  gcase('R5#23 "Got it?" is a check-in, not a condition', 'Add the ones first: 7 + 8 is 15, so write 5 and carry the one. Got it? Now add the tens: 1 + 2 + 3 is 6, so the answer is 65.', HARD, (o) => !/\?/.test(o) && /answer is 65/.test(o));
  gcase('  "Got any questions?"', 'Do two topics a day and review on Sunday. Got any questions? The schedule is below.\n\n- Monday: algebra\n- Tuesday: biology', HARD, (o) => !/\?/.test(o) && /Tuesday: biology/.test(o));
  gcase('  "Got that?"', 'Got that? Next, add the tens.', HARD, 'Next, add the tens.');
  gcase('R5#24 an FAQ answered on the next line stays whole', '**Do you need a visa?**\nYes, if you stay longer than 90 days.\n\n**Can you work on a student visa?**\nOnly with a work permit, up to 28 hours a week.', HARD, '**Do you need a visa?**\nYes, if you stay longer than 90 days.\n\n**Can you work on a student visa?**\nOnly with a work permit, up to 28 hours a week.');
  gcase('  (a heading)', '### Do you need a visa?\n\nYes, if you stay longer than 90 days.', HARD, '### Do you need a visa?\n\nYes, if you stay longer than 90 days.');
  gcase('  (plain, on its own line)', 'Do you need a visa?\nYes, if you stay longer than 90 days.', HARD, 'Do you need a visa?\nYes, if you stay longer than 90 days.');
  for (const reply of ['Book an aisle seat and walk every hour. Is it safe to fly while pregnant? It is, until about 36 weeks for most airlines.', 'Does the brand matter? Not much — fit matters more.', 'Is it worth upgrading? Only for the camera.', 'Is it safe to eat raw cookie dough? No, and I can explain the flour risk.', 'Can you work on a student visa? Only with a work permit, up to 28 hours a week.'])
    gcase(`  an answer the list did not know: "${reply.slice(0, 32)}…"`, reply, HARD, reply);
  gsame('R5#25 a nested list after trailing spaces keeps its indentation', '1. Install Node. \n    1. Download the installer. \n    2. Run it. \n2. Create the app.');
  gsame('  a number after a hard break', 'Mars has two moons, Phobos and Deimos.  \n2.');
  gsame('  a number, then a paragraph', 'Read the lease.  \n2. \n\nTake photos of any damage.');
  gsame('  a hard break before an item', 'Roses are red.  \n1. Violets are blue.');
  gsame('R5#26 a number before a fence: the fence starts its own line', '1. Install Node.\n2. ```sh\nnpx create-next-app@latest\n```\n3. Run the dev server.');
  gsame('R5#29 a numbered list of questions keeps every item (nothing in force)', 'Good questions to ask:\n\n1. How long will recovery take?\n2. Will I need physiotherapy?\n3. When can I run again?');
  gsame('  (no intro)', '1. What does success look like in 90 days?\n2. How is the team structured?');


  // ── ROUND 6 REVIEW (scratchpad side/verify6.json): each finding, from the reviewer's own reproduction ──
  const STOP6 = [U('I am deciding whether to move cities.'), A('What draws you there?'), U('stop asking me questions, just give me your take'), A('My take: move if the job is firm.')];
  const gstop = (label, ask, reply, want) => {
    const fails = [];
    for (const [step, held] of [[1, false], [3, false], [7, false], [16, false], [1e6, true]]) {
      const r = through(reply, HARD, 0, step, held);
      if (!(typeof want === 'string' ? r.out === want : want(r.out, r))) fails.push(`${step}:${JSON.stringify(r.out)}`);
    }
    ok(label, !fails.length, fails.slice(0, 2).join(' | '));
  };
  void STOP6;
  // gate 1: what follows a question is content unless it is only an offer
  gstop('R6g1 "Then I\'d get the Air" after a question stays', '', "Both are good laptops. Do you mostly browse and write? Then I'd get the MacBook Air, it is lighter and cheaper.", "Both are good laptops. Then I'd get the MacBook Air, it is lighter and cheaper.");
  gstop('  "Either way, I\'d book…" stays', '', 'Trains in Japan are fast and on time. Are you flying or taking the train between cities? Either way, I\'d book at least two weeks ahead.', "Trains in Japan are fast and on time. Either way, I'd book at least two weeks ahead.");
  gstop('  "If not, I\'d call an electrician" stays', '', "Check the fuse box first. Did the breaker trip? If not, I'd call an electrician before touching the wiring.", "Check the fuse box first. If not, I'd call an electrician before touching the wiring.");
  gstop('  "I\'ll walk you through it: …" stays', '', "Curious how a heat pump works? I'll walk you through it: it moves heat from the outside air into your home using a refrigerant loop.", "I'll walk you through it: it moves heat from the outside air into your home using a refrigerant loop.");
  gstop('  "Let me break it down: …" stays', '', 'Which plan is right for a family of four? Let me break it down: Individual covers one person, Family covers up to six accounts for $20 a month.', 'Let me break it down: Individual covers one person, Family covers up to six accounts for $20 a month.');
  gstop('  an offer and nothing else still goes with its question', '', 'Pack layers. Want the full packing list? I can send it.', (o) => !/\?/.test(o) && !/send it/.test(o) && /Pack layers/.test(o));
  // gate 2: a claim that is one clause of a sentence goes alone (nothing in force)
  gcase('R6g2 a claim between dashes', "Yes, 3/4 is 6/8 — you've really improved at this — and the next one is 3/4 + 1/8.", CLAIMS, 'Yes, 3/4 is 6/8 and the next one is 3/4 + 1/8.', 1);
  gcase('  a claim before ", so here is…"', "Yes. You've really improved, so here is a harder one: 3/4 + 5/6.", CLAIMS, 'Yes. Here is a harder one: 3/4 + 5/6.', 1);
  gcase('  a bracketed claim on a line with a quotation', 'It is "effect" here (you\'ve really improved at these), because you need the noun.', CLAIMS, 'It is "effect" here, because you need the noun.', 1);
  gcase('  a claim at the end of a numbered answer', "1. 3/4 + 1/8 = 7/8 — correct, you've clearly improved here.\n2. 5/6 - 1/3 = 1/2 — correct too.", CLAIMS, '1. 3/4 + 1/8 = 7/8 — correct.\n2. 5/6 - 1/3 = 1/2 — correct too.', 1);
  gcase('  a claim in emphasis mid-sentence', "The answer is 7/8, **you've really improved**, and the next one to try is 3/4 + 5/6.", CLAIMS, 'The answer is 7/8, and the next one to try is 3/4 + 5/6.', 1);
  // gate 4: self-answers both ways
  for (const reply of ['Install the update tonight. Have you backed up your files? Always do that before a major update.', 'Rotate the tyres every 10,000 km. How old is your car? Usually the first service is at one year.', "Open Settings first. Which phone do you have? It's different on Android.", 'Bring photo ID. Do you have a passport? You can also use a driving licence.'])
    gstop(`R6g4 a question put to them, then a remark, loses the question: "${reply.slice(0, 30)}…"`, '', reply, (o) => !/\?/.test(o));
  gstop('  a fact question answered "No, …" stays', '', 'Tokyo is easy for visitors. Do you need to know Japanese? No, signs are in English almost everywhere.', 'Tokyo is easy for visitors. Do you need to know Japanese? No, signs are in English almost everywhere.');
  gstop('  …"Yes, …" too', '', 'The M3 Air replaces the M1. Will you feel the difference? Yes, it is about twice as fast.', 'The M3 Air replaces the M1. Will you feel the difference? Yes, it is about twice as fast.');
  // gate 5: lists of questions
  gstop('R6g5 Socria\'s own listed questions go with their numbers', '', 'The MacBook Air is the safe default.\n\nBefore I pick one, a few questions for you:\n\n1. What is your budget?\n2. Do you game?\n3. Mac or Windows?\n\nWith those, I can name one model.', (o) => !/\?/.test(o) && !/\n\s*\d\.\s*\n/.test(o) && !/\d\.\s*$/.test(o.trim()) && /With those/.test(o));
  gstop('  question items, then advice items', '', '1. Do you have a stud finder?\n2. Do you have a level?\n3. Mark the studs.\n4. Drill the pilot holes.', (o) => !/\?/.test(o) && !/^\s*2\.\s*$/m.test(o) && /3\. Mark the studs\./.test(o));
  gstop('  an item opened by a plain question keeps its number', '', '1. Do you overpronate? Get a stability shoe.\n2. Do you run on trails? Get lugs.\n3. Do you race? A light shoe is fine.', '1. Get a stability shoe.\n2. Get lugs.\n3. A light shoe is fine.');
  gstop('  (bullets)', '', 'It depends on how you run:\n\n- Do you overpronate? Get a stability shoe.\n- Do you run on trails? Get lugs.\n\nTry them on in the afternoon.', 'It depends on how you run:\n\n- Get a stability shoe.\n- Get lugs.\n\nTry them on in the afternoon.');
  // gate 6: lists to ask somebody else, and a text to send
  for (const intro of ['### Questions to ask your doctor', '**Questions to ask your surgeon**', 'Questions for your doctor:', "Here's what to ask:", 'Questions the interviewer may ask:'])
    gstop(`R6g6 a list after "${intro}" stays`, '', `Bring your scan results.\n\n${intro}\n\n1. How long will recovery take?\n2. Will I need physiotherapy?\n3. When can I run again?\n\nWrite down the answers.`, (o) => /How long will recovery take\?/.test(o) && /physiotherapy\?/.test(o) && /run again\?/.test(o));
  gstop('  a text to send stays', '', "Keep it light.\n\nHere's a text you can send:\n\nHey Sam, are you free on Friday?\n\nThen give him a few days.", "Keep it light.\n\nHere's a text you can send:\n\nHey Sam, are you free on Friday?\n\nThen give him a few days.");
  // gate 7: the same text at every piece size
  gstop('R6g7 an indented labelled line stays at every piece size', '', '1. Call the landlord first.\n   Ask: When will the leak be fixed?\n2. Take photos of the damage.', '1. Call the landlord first.\n   Ask: When will the leak be fixed?\n2. Take photos of the damage.');
  gstop('  a question before a hard break goes with its line, at every piece size', '', 'The Air is the safe pick.  \nWhat is your budget?  \nUnder $1,000 it is the best value.', 'The Air is the safe pick.  \nUnder $1,000 it is the best value.');
  // gate 8: Q:/A:
  gstop('R6g8 a Q:/A: FAQ stays whole', '', 'Q: Do I need a visa?\nA: Yes, if you stay longer than 90 days.\n\nQ: Can I work on a student visa?\nA: Only with a work permit, up to 28 hours a week.', 'Q: Do I need a visa?\nA: Yes, if you stay longer than 90 days.\n\nQ: Can I work on a student visa?\nA: Only with a work permit, up to 28 hours a week.');
  // gate 9: asides
  gstop('R6g9 a question aside between dashes goes alone', '', 'Pick the Air — do you really need ports? — unless you edit video.', 'Pick the Air unless you edit video.');
  gstop('  …and in a bracket the gate cuts', '', 'Book the train early (why? prices double in June) and pick a window seat.', 'Book the train early (prices double in June) and pick a window seat.');
  gstop('  …and before "— or"', '', 'For a family of four, get the Family plan — need more than six accounts? — or two Duo plans.', 'For a family of four, get the Family plan or two Duo plans.');
  // gate 10 and identity 1: nothing in force, a list number before a closing question: as without MR
  gsame('R6g10 a closing listed question at budget 0', 'On 9 November 1989.\n\nWhat led to it:\n\n1. Mass protests in East Germany.\n2. Hungary opening its border.\n3. Want the full timeline?', 0);
  gsame('R6i1 "7. Do you want them listed?" at budget 0', '7. Do you want them listed?', 0);
  gsame('  "7. Want me to list them?"', '7. Want me to list them?', 0);
  gsame('  "8.  \\nDo you want to know why?"', '8.  \nDo you want to know why?', 0);
  gsame('  "…\\n\\n8. Do you want to know why?"', 'Eight legs in total:\n\n8. Do you want to know why?', 0);
  gsame('  "156. Want me to show the long multiplication?"', '12 × 13 is:\n\n156. Want me to show the long multiplication?', 0);
  // readers
  const STOP6R = [U('I am planning a trip to Japan.'), A('When are you going? What do you enjoy?'), U('stop asking me questions'), A('Understood. Here is a simple plan.')];
  group('R6r2 a complaint about being asked does not take a stop back', ['Can you stop annoying me by asking me questions?', 'Please stop wasting my time by asking me questions.', 'Would you quit interrupting me by asking me questions?', "Please don't slow me down by asking me questions.", 'Can you help me without bugging me by asking me questions?', 'Please help me, not by asking me questions but by giving me a plan.', 'Can you tell my mom she embarrassed me by asking me questions at dinner?'], STOP6R, (r) => /q0h/.test(r.trace));
  group('  while asking for it does', ['Help me practise for my driving theory test by asking me questions.', 'Can you help me revise by quizzing me on the dates?'], STOP6R, (r) => !/q0h/.test(r.trace));
  group('R6r3 a quiz and "stop asking me questions about it": the quiz', ['Quiz me on Spanish verbs and stop asking me questions about it, just start.', 'Stop asking me questions about it and just quiz me on Spanish verbs.'], [U('I want to learn some Spanish.'), A('Great! What level are you? Which tenses do you know?')], (r) => inQuiz(r) && !/q0h/.test(r.trace));
  group('R6r4 how-to questions with a number are not the exercise', ["I'd like to do it myself. How do I change a car tyre on a 2015 Honda Civic?", 'I want to do it myself rather than pay a mechanic. How do I replace the 12V battery?', 'Let me try it first. If it does not work in 10 minutes, what is plan B?', "I'd like to do it myself. How do I translate my website into Spanish?", 'Let me try it first. What is the speed limit on UK motorways?', 'Let me try it first, but what time does the 7:45 bus leave?', 'I would like to do it myself. Where can I buy 3/4 inch plywood?'], [U('Hi'), A('Hi! How can I help?')], (r) => !/noreveal/.test(r.trace));
  group('  while the exercise beside it still is', ['What is the derivative of x^2 sin x? Let me try it first.', 'Solve 2x + 3 = 11. Let me try it first.'], [U('Hi'), A('Hi! How can I help?')], (r) => /noreveal/.test(r.trace));
  const QUIZOFFER = [U('quiz me on world capitals'), A('What is the capital of Peru?'), U('Lima'), A('Correct! Want another one?')];
  group('R6r5 declining "Want another one?" ends the quiz', ["No, that's enough.", "No, that's enough, thanks.", "Nah, that's enough.", 'No thanks.', "I'm good, thanks.", 'Not right now.', 'Maybe later.', "Nope, I'm all set.", 'No more, thanks.', "That's all for me, thanks!", "No, let's leave it there.", 'No, that will do.'], QUIZOFFER, noQuiz);
  group('  …and "that\'s enough capitals for today"', ["That's enough capitals for one day.", "That's enough geography for today, thanks."], QUIZH, noQuiz);
  group('  …while "No, give me a harder one" goes on', ['No, give me a harder one.', "That's enough easy ones. Give me a harder one."], QUIZOFFER, inQuiz);
  const EDIT6 = [U('Here is my essay: The industrial revolution changed everything. It made factories.'), A('Thanks — what would you like me to do with it?'), U('just fix the grammar'), A('Fixed.')];
  group('R6r6 restating edit-only as what not to do keeps it', ["Just fix the typos, don't rewrite or rephrase it.", "Just fix the grammar. Don't rewrite it or add a conclusion.", "Please don't rephrase anything or change my tone.", "Only the spelling please. Don't reword it or change my style.", 'Just fix the commas and do not add examples or rewrite it.', "Don't change my wording or rework the intro, just the grammar.", 'Correct the grammar only, and never rewrite it or improve it.'], EDIT6, (r) => /edit_as_asked/.test(r.trace));
  group('R6r7 somebody else\'s words after a comma, or named, start nothing', ['My mom always says, stop asking me questions. How do I get her to open up?', 'He texted, no more questions please. What does he mean?', 'The sign on his door, stop asking me questions, is that a joke?', 'Her favourite line: get to the point. Is she being rude?', "My manager's mantra: get to the point. How do I adapt?", 'Our slogan: keep it short. Is that good branding?', 'My study buddy keeps saying, quiz me on the dates. What dates matter for WW1?', 'Quiz me is what my little brother says every night. How do I make flashcards for him?'], [U('I am planning a trip to Japan.'), A('Here is a simple plan.')], (r) => !/q0h/.test(r.trace) && !/v\d+/.test(r.trace) && noQuiz(r));
  group('R6r8 a hint or a short question about the problem keeps "let me try it first"', ['Can you give me a hint?', 'How do I start?', 'The product rule?'], [U('What is the derivative of x^2 sin x? Let me try it first.'), A('Sure. Which rule applies when two functions are multiplied?')], (r) => /noreveal/.test(r.trace));
  group('R6r9 "keep my voice" beside a revision is not edit-only', ['Improve the flow but keep my tone: The cat sat on the mat. It was happy.', 'Make it more persuasive, but keep my voice: We should recycle more.', 'Make the intro stronger, keep my tone: Climate change is bad.', 'Translate it into Spanish but keep my tone: Thanks for coming, it meant a lot.'], [U('Hi'), A('Hi! How can I help?')], (r) => !/edit_as_asked/.test(r.trace));
  group('R6r10 a new problem as an imperative ends "let me try it first"', ['Now find the integral of e^x.', 'Solve 2x + 1 = 7.', 'Calculate 15% of 80.', 'Differentiate cos(3x).', 'Simplify (x^2 - 1)/(x - 1).', 'Now a new problem: what is 7 * 8?'], OWN5, (r) => !ownTry(r));
  group('R6r11 "give me the answer, not just a hint" is a request for the answer', ['Give me the answer, not just a hint.', "Tell me the answer, don't just point me in the right direction."], [U('What is the derivative of x^3 sin x?'), A('Which rule do you think applies here?')], (r) => /s:direct/.test(r.trace));
  group('R6i2 "shorter… no, longer" is longer', ['Make it shorter. Actually, no — make it longer and more detailed.', 'Shorter please. Actually no, longer.', 'Make it shorter, no wait, make it longer and more detailed.'], [U('Explain black holes'), A('Long text. '.repeat(30))], (r) => !/v\d+/.test(r.trace));
  group('R6i3 "Yes, that\'s enough." after a question not about enough ends the quiz', ["Yes, that's enough.", "Yes, that's enough, thanks."], [U('quiz me on world capitals'), A('What is the capital of Peru?'), U('Lima'), A('Right! What is the capital of Chile?')], noQuiz);
  group('R6g3 their own words that are a question, asked for, are not cut (content)', ['How do I ask where the bathroom is in Spanish?', 'Fix the grammar in this: where you going tomorrow? i has went to the store.', 'Correct my email to my boss: can we meet monday? i has a question about the rota.'], STOP6, (r) => !/g=h/.test(r.trace));

}

console.log(`\nmr review: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
