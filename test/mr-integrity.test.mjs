// The Metacognitive Integrity Monitor (lib/mr/integrity.ts): claims that the
// person improved, a decision's contract, oscillation, excessive
// intervention, goal drift, proxy gaming, budgets, privacy, regression.
import {
  IMPROVEMENT_CLAIM,
  unsupportedClaim,
  checkDecision,
  assertDecision,
  checkHistory,
  checkOutcomeUse,
  checkLatency,
  checkCost,
  checkPrivacy,
  checkTaskRegression,
} from './.tmp/mr-under-test.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 300))));
const codes = (fs) => fs.map((f) => f.code);
const details = (fs) => fs.map((f) => f.detail);
const CODE = /^[A-Za-z0-9_][\w.:/=+<>#,@|-]{0,63}$/;

// the numbers mr-2026.10.1 uses (copied, so this suite pins the monitor, not the config)
const P = {
  unproductiveStreak: 2, confusionRepeats: 2, failedAttempts: 2, momentaryTurns: 2, observedTurns: 3, workedExampleTurns: 1,
  minDwellTurns: 2, maxChanges: 3, oscillationWindow: 6, maxActiveShare: 0.75, excessiveWindow: 8, freezeTurns: 3,
  shorterCeiling: 360, verboseRatio: 12, verboseWords: 260, window: 24, latencyBudgetMs: 40, deliberationsPerConversation: 2,
};

// ── improvement claims ───────────────────────────────────────────────
console.log('improvement claims');
const CLAIMS = [
  "You've really improved.",
  "You're getting much better at this.",
  "You've mastered derivatives.",
  'Your understanding has grown.',
  'You clearly understand it now.',
  'You have improved a lot since yesterday.',
  "Wow, you've come a long way.",
  "Look how far you've come!",
  "You've learned so much in this session.",
  "You're improving!",
  "I can see you've really grown as a writer.",
  "You've got the hang of it.",
  "You're getting the hang of integration by parts.",
  'Your grasp of limits is much stronger now.',
  'Your understanding of derivatives has really improved.',
  'You now understand why the sign flips.',
  "You've made huge progress with integrals.",
  "You've gotten so much better at spotting these.",
  "You're becoming more confident with proofs.",
  'Your skills are improving quickly.',
  'You really understand this.',
  "You've become an expert at this.",
  'Your confidence has grown.',
  'You’ve really improved.', // curly apostrophe
  "You're learning fast.",
  "You've got it now.",
  'You have mastered the chain rule.',
  "Honestly, you've really improved, haven't you?", // a tag question is still a claim
  "Don't worry, you've really improved.", // a negation that is not a denial of the claim
  "You're a pro at this now.",
  'Your reasoning is clearer than before.',
  "This shows you've mastered the idea.",
  "You've leveled up.",
  "You've developed a solid understanding of recursion.",
  'You get it now.',
  'YOU HAVE REALLY IMPROVED.',
  "You've really improved your understanding of limits.",
  "You're strengthening your problem-solving skills.",
];
for (const s of CLAIMS) ok(`claim: ${s}`, unsupportedClaim(s, { verifiedIndependent: false }) && IMPROVEMENT_CLAIM.test(s));

const NOT_CLAIMS = [
  // praise of a specific step
  'That step is right.',
  'Good catch.',
  'Nice work on the chain rule step.',
  'Good job on that step.',
  "That's correct.",
  'You got the right answer.',
  "You've correctly applied the chain rule.",
  'You understood the question perfectly.',
  "You're right.",
  "You're getting closer.",
  "You're getting there.",
  'Your reasoning is sound.',
  // Socria about itself, or a third party
  "I've improved the draft.",
  "I'm getting better at explaining this.",
  'My understanding has grown.',
  'Students who practise improve.',
  'She has improved a lot.',
  'The model has improved.',
  'Socria has learned that.',
  'My teacher said "you\'ve really improved".',
  // the work, not the person
  'Your essay has improved.',
  "You've improved the intro a lot.",
  "You've improved it.",
  "You've made good progress on the essay.",
  "You're getting better results with this method.",
  // the future, a condition, a question, a purpose, a denial
  'You can improve this by cutting the second paragraph.',
  "You'll get better with practice.",
  'You will improve with practice.',
  "You'd improve faster with a timer.",
  "Once you've mastered this, try the next one.",
  "If you've mastered the chain rule, move on.",
  'Do you understand it now?',
  'Have you mastered it?',
  "Do you feel you've improved?",
  'Let me know if you understand it now.',
  'Make sure you understand it now.',
  'To check you really understand, try this one.',
  "Let's do one more so you really understand it.",
  "I wouldn't say you've mastered it yet.",
  "That's not to say you've learned everything.",
  "It doesn't mean you've mastered it.",
  "I don't think you've mastered it.",
  "You haven't improved the conclusion.",
  'You have not mastered it yet.',
  // presupposition and transition, not a claim
  "Now apply what you've learned.",
  'Now that you understand the chain rule, try this one.',
  'You understand the chain rule, now try this.',
  'Your understanding is the key here.',
  'You know, now we can move on.',
  'Then you get 2x now.',
  "You've learned the hard way.",
  // quoted or code
  '> You have really improved, she wrote.',
  '`// you have really improved`',
  '',
];
for (const s of NOT_CLAIMS) ok(`not a claim: ${JSON.stringify(s)}`, !unsupportedClaim(s, { verifiedIndependent: false }), String(s.match(IMPROVEMENT_CLAIM)?.[0]));

// Ordinary teaching sentences a growth verb runs into: what follows it is not them.
// (Each of these was dropped from the reply before the tail allow-list.)
const ORDINARY = [
  "You've grown tired of questions, so here is the answer.",
  "I know you're growing impatient, so here it is.",
  "You've grown accustomed to the notation.",
  "You've grown up with this notation, so it feels natural.",
  "You've improved both paragraphs.",
  "You've improved every transition.",
  "You've improved most of the wording.",
  "You've improved two of the three examples.",
  "You've got better options than brute force.",
  "You've got better odds with option B.",
  "You're getting better approximations with more terms.",
  "You're getting better accuracy now.",
  "You're getting stronger evidence from the second source.",
  "You're improving matters by labelling the axes.",
  "You've progressed to step 3.",
  'Your confidence interval has improved with the larger sample.',
  'Your confidence interval is clearer now.',
  'Your knowledge base has grown.',
  'Your technique section has improved.',
  'Your understanding of this means the essay has improved.',
  'Since you understand that x is now 5, substitute it.',
  'You understand why the value is now negative.',
  "You've built a skills matrix for the team.",
  "You've improved your technique section.",
  'You really get the best results by expanding first.',
  'You really get that sign wrong a lot.',
  "I don't know how much you've learned yet.",
  "Let's check how much you've learned with one problem.",
];
for (const s of ORDINARY) ok(`ordinary, not a claim: ${JSON.stringify(s)}`, !unsupportedClaim(s, { verifiedIndependent: false }), String(s.match(IMPROVEMENT_CLAIM)?.[0]));
// …while the claims those verbs make about them are still caught
const STILL = [
  "You've improved so much since last week.",
  "You've grown in confidence.",
  "You're growing as a thinker.",
  "You've progressed so much.",
  "You've gotten better at this.",
  "You're getting better and better.",
  "You've improved from last time.",
  "You've grown a lot this term.",
  'Your understanding of the chain rule has grown.',
  'You really get it.',
  "You clearly understand the setup now, so let's compute.",
  "You've developed a real feel for limits.",
  "You've improved, right?",
];
for (const s of STILL) ok(`still a claim: ${s}`, unsupportedClaim(s, { verifiedIndependent: false }));
// One verified attempt is one observation, and it may echo the answer just given: it supports "that's right", never "you've improved".
ok('a claim of improvement is dropped even after an engine-verified attempt', unsupportedClaim("You've really improved.", { verifiedIndependent: true }) && unsupportedClaim("You've mastered derivatives!"));
ok('  while praise of the attempt itself is left alone', !unsupportedClaim('Yes, that is right.') && !unsupportedClaim('That step is correct.'));
ok('IMPROVEMENT_CLAIM keeps no state between calls (no g flag)', !IMPROVEMENT_CLAIM.global && [1, 2, 3].every(() => IMPROVEMENT_CLAIM.test("You've mastered it.")));
ok('a claim inside a longer reply is found', unsupportedClaim("Here's the next one. You've really improved, so try it", { verifiedIndependent: false }));
{
  const t = Date.now();
  for (const s of ['your understanding is ' + 'so '.repeat(3000) + 'x', "you've " + 'really '.repeat(3000) + 'x', 'you you you '.repeat(3000)]) unsupportedClaim(s, { verifiedIndependent: false });
  ok('adversarial input stays fast (no catastrophic backtracking)', Date.now() - t < 500, Date.now() - t);
}
ok("improving the work is still not improving them", !unsupportedClaim("You've improved your essay a lot.", { verifiedIndependent: false }) && !unsupportedClaim("You're improving your draft.", { verifiedIndependent: false }));
ok('null or non-string input is no claim', !unsupportedClaim(null, { verifiedIndependent: false }) && !unsupportedClaim(undefined, { verifiedIndependent: false }));

// ── a decision's contract ────────────────────────────────────────────
console.log('checkDecision');
const RC = {
  'ifr.explicit.stop_questions': ['questionBudget'],
  'ifr.explicit.direct_answer': ['strategy', 'answerFirst', 'questionBudget'],
  'ifr.observed.unproductive_questions': ['questionBudget', 'questionWindow'],
  'mr.revert': [],
  none: [],
};
const CTX = { knownPolicies: ['mr-2026.10.1'], ruleControls: RC, turn: 4 };
const good = (over = {}) => ({
  policyVersion: 'mr-2026.10.1',
  interventionId: 'abc123',
  action: 'fewer_questions',
  trigger: 'ifr.explicit.stop_questions',
  evidenceRefs: [{ turn: 4, role: 'user', code: 'explicit.stop_questions' }],
  target: ['acs', 'behavior'],
  controls: { questionBudget: { max: 0, enforcement: 'hard' } },
  scope: { kind: 'conversation' },
  expiration: { afterTurn: null, onRevoke: ['explicit.revoke', 'explicit.wants_questions'] },
  confidence: 0.95,
  uncertainty: [],
  evaluationPlan: { primary: 'friction', expect: ['questions=0'], window: 2 },
  rollback: { revertTo: 'acs_default', when: ['outcome:revert'] },
  loop: 'fast',
  issuedAtTurn: 4,
  ...over,
});
const revert = {
  ...good(),
  action: 'revert',
  trigger: 'mr.revert',
  evidenceRefs: [{ turn: 4, role: 'user', code: 'revoke:explicit.revoke' }],
  controls: {},
  scope: { kind: 'turn' },
  expiration: { afterTurn: 4, onRevoke: [] },
  confidence: 1,
  evaluationPlan: { primary: 'friction', expect: ['default_behaviour'], window: 1 },
  rollback: { revertTo: 'acs_default', when: [] },
};
const none = { ...revert, action: 'none', trigger: 'none', evidenceRefs: [], evaluationPlan: { primary: 'friction', expect: [], window: 0 } };

ok('a well-formed decision passes', checkDecision(good(), CTX).length === 0, JSON.stringify(checkDecision(good(), CTX)));
ok('a revert passes with no rollback conditions (it is the rollback)', checkDecision(revert, CTX).length === 0, JSON.stringify(checkDecision(revert, CTX)));
ok("a 'none' decision passes without evidence or a plan", checkDecision(none, CTX).length === 0, JSON.stringify(checkDecision(none, CTX)));
const momentary = good({ trigger: 'ifr.explicit.direct_answer', action: 'direct', controls: { strategy: 'direct', answerFirst: true }, scope: { kind: 'turns', turns: 2 }, expiration: { afterTurn: 5, onRevoke: [] } });
ok('a momentary two-turn decision expiring after turn 5 passes', checkDecision(momentary, CTX).length === 0, JSON.stringify(checkDecision(momentary, CTX)));

const bad = (name, d, code, detail) => {
  const fs = checkDecision(d, CTX);
  const hit = fs.find((f) => f.code === code && (!detail || f.detail === detail));
  ok(`${name} → ${code}${detail ? ':' + detail : ''}`, !!hit && hit.severity === 'block' && hit.action === 'reject_decision', JSON.stringify(fs));
};
bad('no evidence', good({ evidenceRefs: [] }), 'contract_invalid', 'missing:evidenceRefs');
bad('evidence missing entirely', good({ evidenceRefs: undefined }), 'contract_invalid', 'missing:evidenceRefs');
bad('a quote as evidence', good({ evidenceRefs: [{ turn: 4, role: 'user', code: 'they said "stop asking me"' }] }), 'contract_invalid', 'evidence_not_code');
bad('evidence from a later turn', good({ evidenceRefs: [{ turn: 6, role: 'user', code: 'explicit.stop_questions' }] }), 'contract_invalid', 'evidence_after_decision');
bad('evidence with no role', good({ evidenceRefs: [{ turn: 4, code: 'explicit.stop_questions' }] }), 'contract_invalid', 'evidence_malformed');
bad('an uncertainty that is a sentence', good({ uncertainty: ['not sure they meant it'] }), 'contract_invalid', 'uncertainty_not_code');
bad('no expiration', good({ expiration: undefined }), 'contract_invalid', 'missing:expiration');
bad('expiration without onRevoke', good({ expiration: { afterTurn: null } }), 'contract_invalid', 'missing:expiration');
bad('a one-turn scope that lasts three', good({ scope: { kind: 'turn' }, expiration: { afterTurn: 7, onRevoke: [] } }), 'contract_invalid', 'expiration_scope_mismatch');
bad('a two-turn scope that lasts three', good({ scope: { kind: 'turns', turns: 2 }, expiration: { afterTurn: 6, onRevoke: [] } }), 'contract_invalid', 'expiration_scope_mismatch');
bad('a turns scope with no expiry', good({ scope: { kind: 'turns', turns: 2 }, expiration: { afterTurn: null, onRevoke: ['explicit.revoke'] } }), 'contract_invalid', 'expiration_scope_mismatch');
bad('a turns scope of zero turns', good({ scope: { kind: 'turns', turns: 0 }, expiration: { afterTurn: 4, onRevoke: [] } }), 'contract_invalid', 'scope_turns_invalid');
bad('until revoked, with nothing that revokes it', good({ expiration: { afterTurn: null, onRevoke: [] } }), 'contract_invalid', 'unending_without_revoke');
bad('no scope', good({ scope: undefined }), 'contract_invalid', 'missing:scope');
bad(
  'standing on MR’s reading alone',
  good({ trigger: 'ifr.observed.unproductive_questions', scope: { kind: 'standing' }, evidenceRefs: [{ turn: 4, role: 'assistant', code: 'observed.unproductive_questions' }], controls: { questionBudget: { max: 0, enforcement: 'tail' } } }),
  'contract_invalid',
  'standing_without_their_words'
);
ok('standing on their words passes', checkDecision(good({ scope: { kind: 'standing' } }), CTX).length === 0);
bad('no rollback', good({ rollback: undefined }), 'contract_invalid', 'missing:rollback');
bad('a rollback to somewhere else', good({ rollback: { revertTo: 'anything', when: ['x'] } }), 'contract_invalid', 'missing:rollback');
bad('a rollback that nothing triggers', good({ rollback: { revertTo: 'acs_default', when: [] } }), 'contract_invalid', 'rollback_without_conditions');
bad('no evaluation plan', good({ evaluationPlan: undefined }), 'contract_invalid', 'missing:evaluationPlan');
bad('a plan judged on a made-up dimension', good({ evaluationPlan: { primary: 'happiness', expect: [], window: 1 } }), 'contract_invalid', 'missing:evaluationPlan');
bad('a plan with no window', good({ evaluationPlan: { primary: 'friction', expect: [], window: 0 } }), 'contract_invalid', 'missing:evaluationPlan');
for (const c of [1.2, -0.1, NaN, Infinity, '0.9', undefined]) bad(`confidence ${String(c)}`, good({ confidence: c }), 'contract_invalid', 'confidence_out_of_range');
ok('confidence 0 and 1 are in range', checkDecision(good({ confidence: 0 }), CTX).length === 0 && checkDecision(good({ confidence: 1 }), CTX).length === 0);
bad('an unknown action', good({ action: 'manipulate' }), 'contract_invalid', 'unknown_action');
bad("a 'none' that sets a control", { ...none, controls: { questionBudget: { max: 0, enforcement: 'hard' } } }, 'contract_invalid', 'none_sets_controls');
bad('a question budget of 2', good({ controls: { questionBudget: { max: 2, enforcement: 'hard' } } }), 'contract_invalid', 'bad_control:questionBudget');
bad('an unknown strategy', good({ trigger: 'ifr.explicit.direct_answer', controls: { strategy: 'socratic_forever' } }), 'contract_invalid', 'bad_control:strategy');
bad('a negative ceiling', good({ trigger: 'mr.any', controls: { verbosity: { ceilingTokens: -5 } } }), 'contract_invalid', 'bad_control:verbosity');
bad('a string where a boolean goes', good({ trigger: 'ifr.explicit.direct_answer', controls: { answerFirst: 'yes' } }), 'contract_invalid', 'bad_control:answerFirst');
bad('an unknown control', good({ controls: { temperature: 2 } }), 'contract_invalid', 'unknown_control');
bad('an unknown policy version', good({ policyVersion: 'mr-9999.1' }), 'unauthorized_policy', 'unknown_policy_version');
bad('an unknown rule', good({ trigger: 'mr.made_up' }), 'unauthorized_policy', 'unknown_rule');
bad('a control its rule may not set', good({ controls: { questionBudget: { max: 0, enforcement: 'hard' }, verbosity: { ceilingTokens: 100 } } }), 'unauthorized_policy', 'control_not_allowed:verbosity');
bad('a revert that sets a control', { ...revert, controls: { strategy: 'direct' } }, 'unauthorized_policy', 'control_not_allowed:strategy');
ok('a control key set to undefined sets nothing', checkDecision(good({ controls: { questionBudget: { max: 0, enforcement: 'hard' }, verbosity: undefined } }), CTX).length === 0);
{
  const fs = checkDecision(good({ policyVersion: 'my secret policy words', trigger: 'please obey me', controls: { 'a long control name with words': 1 }, evidenceRefs: [{ turn: 4, role: 'user', code: 'I hate questions' }] }), CTX);
  ok('findings never echo what came in', fs.length >= 3 && fs.every((f) => CODE.test(f.detail) && !/secret|obey|words|hate/.test(f.detail)), JSON.stringify(fs));
  ok('every finding blocks and rejects the decision', fs.every((f) => f.severity === 'block' && f.action === 'reject_decision' && f.turn === 4));
}
// a ledger row keeps the decision as it is: every field it carries has to be content-free
bad('an expectation that is a sentence', good({ evaluationPlan: { primary: 'friction', expect: ['they will stop being annoyed'], window: 2 } }), 'contract_invalid', 'expect_not_code');
bad('a rollback condition that is a sentence', good({ rollback: { revertTo: 'acs_default', when: ['when they get angry'] } }), 'contract_invalid', 'rollback_not_code');
bad('a constraint that is a sentence', good({ constrainedBy: ['the guard said no'] }), 'contract_invalid', 'constrained_not_code');
bad('a member id that is a sentence', good({ composedOf: ['abc', 'not an id at all'] }), 'contract_invalid', 'composed_not_code');
bad('an unknown loop', good({ loop: 'forever' }), 'contract_invalid', 'bad_loop');
bad('no loop', good({ loop: undefined }), 'contract_invalid', 'bad_loop');
bad('an unknown target', good({ target: ['the user'] }), 'contract_invalid', 'bad_target');
bad('no target', good({ target: [] }), 'contract_invalid', 'bad_target');
bad('no intervention id', good({ interventionId: undefined }), 'contract_invalid', 'bad_intervention_id');
bad('an intervention id with words in it', good({ interventionId: 'stop asking me' }), 'contract_invalid', 'bad_intervention_id');
ok('constraints and members that are codes pass', checkDecision(good({ constrainedBy: ['app_policy:strategy'], composedOf: ['a1b2', 'c3d4'] }), CTX).length === 0);
ok('not a decision at all', codes(checkDecision(null, CTX)).includes('contract_invalid'));
ok('hasOwnProperty is not a rule', codes(checkDecision(good({ trigger: 'hasOwnProperty' }), CTX)).includes('unauthorized_policy'));

console.log('assertDecision');
{
  let threw = null;
  try {
    assertDecision(good({ evidenceRefs: [] }), CTX);
  } catch (e) {
    threw = e;
  }
  ok('strict (the suite runs with CORE4_STRICT=1): a bad decision throws', process.env.CORE4_STRICT === '1' ? !!threw : true, String(threw));
  ok('the error holds codes, not content', !threw || /contract_invalid:missing:evidenceRefs/.test(threw.message));
  let fine = true;
  try {
    assertDecision(good(), CTX);
  } catch {
    fine = false;
  }
  ok('a good decision does not throw', fine);
  const saved = { s: process.env.CORE4_STRICT, n: process.env.NODE_ENV };
  process.env.CORE4_STRICT = '0';
  process.env.NODE_ENV = 'production';
  let quiet = true;
  try {
    assertDecision(good({ evidenceRefs: [] }), CTX);
  } catch {
    quiet = false;
  }
  ok('not strict: no-op (production rejects, never throws)', quiet);
  process.env.NODE_ENV = 'test';
  let testThrows = false;
  try {
    assertDecision(good({ evidenceRefs: [] }), CTX);
  } catch {
    testThrows = true;
  }
  ok("NODE_ENV=test is strict on its own", testThrows);
  if (saved.s === undefined) delete process.env.CORE4_STRICT;
  else process.env.CORE4_STRICT = saved.s;
  if (saved.n === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = saved.n;
}

// ── the history ──────────────────────────────────────────────────────
console.log('oscillation');
const H = (over) => checkHistory({ interventions: [], strategyChanges: [], turn: 0, params: P, ...over });
const rec = (d, status = 'active', endedAtTurn, endReason) => ({ decision: d, status, ...(endedAtTurn !== undefined ? { endedAtTurn, endReason } : {}) });
const mrDecision = (issued, over = {}) =>
  good({
    trigger: 'ifr.observed.unproductive_questions',
    evidenceRefs: [{ turn: issued, role: 'assistant', code: 'observed.unproductive_questions' }],
    controls: { questionBudget: { max: 0, enforcement: 'tail' } },
    scope: { kind: 'conversation' },
    expiration: { afterTurn: null, onRevoke: ['explicit.revoke'] },
    issuedAtTurn: issued,
    ...over,
  });
const theirDecision = (issued, strategy) =>
  good({ trigger: 'ifr.explicit.direct_answer', action: 'direct', controls: { strategy }, evidenceRefs: [{ turn: issued, role: 'user', code: 'explicit.direct_answer' }], issuedAtTurn: issued });

ok('three changes in six turns is within bounds', H({ turn: 6, strategyChanges: [[2, 'direct'], [4, 'worked_example'], [6, 'guided']] }).length === 0);
{
  const fs = H({ turn: 6, strategyChanges: [[1, 'direct'], [3, 'worked_example'], [5, 'guided'], [6, 'execute']] });
  ok('four changes in six turns freezes', fs.length === 1 && fs[0].code === 'oscillation' && fs[0].action === 'freeze' && /changes:4>3/.test(fs[0].detail), JSON.stringify(fs));
}
ok('changes outside the window are not counted', H({ turn: 12, strategyChanges: [[0, 'direct'], [1, 'guided'], [3, 'execute'], [4, 'direct']] }).length === 0);
{
  const fs = H({ turn: 5, strategyChanges: [[3, 'direct'], [4, 'guided'], [5, 'direct']] });
  ok('an A→B→A flip inside the dwell freezes', fs.length === 1 && /flip:dwell=1<2/.test(fs[0].detail), JSON.stringify(fs));
}
ok('A→B→A after a full dwell is not a flip', H({ turn: 6, strategyChanges: [[3, 'direct'], [4, 'guided'], [6, 'direct']] }).length === 0);
ok('A→B→C is not a flip', H({ turn: 5, strategyChanges: [[3, 'direct'], [4, 'guided'], [5, 'execute']] }).length === 0);
{
  // their own words changed it four times: that is them, not MR oscillating
  const changes = [[1, 'direct'], [2, 'guided'], [3, 'direct'], [4, 'guided']];
  const interventions = changes.map(([t, s]) => rec(theirDecision(t, s)));
  ok('changes their words made are not oscillation', H({ turn: 4, strategyChanges: changes, interventions }).length === 0, JSON.stringify(H({ turn: 4, strategyChanges: changes, interventions })));
  ok('the same changes with no words behind them are', H({ turn: 4, strategyChanges: changes }).length === 1);
}
{
  // direct (their words) → worked example (MR, one turn) → back to direct when it expires: planned, not a flip
  const we = mrDecision(3, { action: 'worked_example', controls: { strategy: 'worked_example' }, scope: { kind: 'turn' }, expiration: { afterTurn: 3, onRevoke: [] } });
  const changes = [[2, 'direct'], [3, 'worked_example'], [4, 'direct']];
  const interventions = [rec(theirDecision(2, 'direct')), rec(we, 'expired', 4, 'expired')];
  ok('a return at a planned expiry is not a flip', H({ turn: 4, strategyChanges: changes, interventions }).length === 0, JSON.stringify(H({ turn: 4, strategyChanges: changes, interventions })));
  ok('the same return made by MR is', H({ turn: 4, strategyChanges: changes, interventions: [rec(theirDecision(2, 'direct'))] }).some((f) => /flip/.test(f.detail)));
  // a one-turn worked example given twice, each ending on schedule: two MR changes, not four
  const we2 = mrDecision(5, { action: 'worked_example', controls: { strategy: 'worked_example' }, scope: { kind: 'turn' }, expiration: { afterTurn: 5, onRevoke: [] } });
  const twice = [[3, 'worked_example'], [4, 'default'], [5, 'worked_example'], [6, 'default']];
  const both = [rec({ ...we, issuedAtTurn: 3 }, 'expired', 4, 'expired'), rec(we2, 'expired', 6, 'expired')];
  ok('planned expiries are not counted as changes', H({ turn: 6, strategyChanges: twice, interventions: both }).length === 0, JSON.stringify(H({ turn: 6, strategyChanges: twice, interventions: both })));
}
{
  // MR set each of these strategies itself; that their words ended something else at the same turns does not make them theirs
  const changes = [[1, 'direct'], [2, 'guided'], [3, 'execute'], [4, 'worked_example']];
  const interventions = changes.flatMap(([t, s]) => [
    rec(mrDecision(t, { controls: { strategy: s } })),
    rec(good({ issuedAtTurn: 0, evidenceRefs: [{ turn: 0, role: 'user', code: 'explicit.stop_questions' }] }), 'revoked', t, 'revoke:explicit.revoke'),
  ]);
  const fs = H({ turn: 4, strategyChanges: changes, interventions });
  ok('MR’s changes at turns where their words revoked something else still count', fs.some((f) => f.code === 'oscillation' && /changes:4>3/.test(f.detail)), JSON.stringify(fs));
}
{
  const changes = [[1, 'direct'], [2, 'guided'], [3, 'execute'], [4, 'default']];
  const rolled = [rec(mrDecision(3, { controls: { strategy: 'execute' } }), 'rolled_back', 4, 'integrity:oscillation')];
  ok("the monitor's own rollback does not renew a freeze", H({ turn: 4, strategyChanges: changes, interventions: rolled }).length === 0, JSON.stringify(H({ turn: 4, strategyChanges: changes, interventions: rolled })));
}
{
  const changes = [[5, 'direct'], [6, 'guided'], [7, 'execute']];
  ok('three changes, nothing proposed: fine', H({ turn: 8, strategyChanges: changes }).length === 0);
  const fs = H({ turn: 8, strategyChanges: changes, current: mrDecision(8, { controls: { strategy: 'worked_example' } }) });
  ok('a proposed fourth change counts before it happens', fs.length === 1 && fs[0].code === 'oscillation' && /changes:4>3/.test(fs[0].detail), JSON.stringify(fs));
  ok('a proposed decision that keeps the strategy does not', H({ turn: 8, strategyChanges: changes, current: mrDecision(8, { controls: { strategy: 'execute' } }) }).length === 0);
  ok('a proposed flip back counts as a flip', H({ turn: 8, strategyChanges: changes, current: mrDecision(8, { controls: { strategy: 'guided' } }) }).some((f) => /flip:dwell=1/.test(f.detail)));
}

console.log('excessive intervention');
{
  const always = [rec(mrDecision(0))];
  const fs = H({ turn: 7, interventions: always });
  ok('MR in force on 8 of the last 8 turns freezes', fs.length === 1 && fs[0].code === 'excessive_intervention' && fs[0].action === 'freeze' && fs[0].detail === 'active:8/8', JSON.stringify(fs));
  ok('not before eight turns exist', H({ turn: 6, interventions: always }).length === 0);
  ok('6 of 8 is not more than 0.75', H({ turn: 7, interventions: [rec(mrDecision(2))] }).length === 0);
  ok('7 of 8 is', H({ turn: 7, interventions: [rec(mrDecision(1))] }).some((f) => f.code === 'excessive_intervention'));
  ok('their own instruction in force every turn is not MR acting', H({ turn: 7, interventions: [rec(good({ issuedAtTurn: 0, evidenceRefs: [{ turn: 0, role: 'user', code: 'explicit.stop_questions' }] }))] }).length === 0);
  // as state.ts carries one: their rule, loop longitudinal, evidence 'carried:<key>'
  const carriedIn = good({ issuedAtTurn: 0, loop: 'longitudinal', carried: true, scope: { kind: 'standing' }, evidenceRefs: [{ turn: 0, role: 'user', code: 'carried:questions:0' }], uncertainty: ['carried_from_earlier_conversation'] });
  ok('a carried standing preference is not MR acting', H({ turn: 7, interventions: [rec(carriedIn)] }).length === 0, JSON.stringify(H({ turn: 7, interventions: [rec(carriedIn)] })));
  ok('… and passes its own contract', checkDecision(carriedIn, { ...CTX, turn: 0 }).length === 0, JSON.stringify(checkDecision(carriedIn, { ...CTX, turn: 0 })));
  ok('"longitudinal" alone does not make MR’s reading theirs', H({ turn: 7, interventions: [rec(mrDecision(0, { loop: 'longitudinal' }))] }).some((f) => f.code === 'excessive_intervention'));
  // MR's worked example after repeated confusion cites each "I don't get it" (lib/mr/ifr.ts): it is still MR's choice
  const confusedWE = mrDecision(0, {
    trigger: 'ifr.observed.repeated_confusion',
    action: 'worked_example',
    evidenceRefs: [{ turn: 0, role: 'assistant', code: 'reply.explained' }, { turn: 0, role: 'user', code: 'explicit.confused' }],
  });
  const RC2 = { ...RC, 'ifr.observed.repeated_confusion': ['strategy', 'questionBudget', 'scaffolding', 'simplify'] };
  ok('MR’s reading that cites their words is still MR acting (8 of 8 freezes)', H({ turn: 7, interventions: [rec(confusedWE)] }).some((f) => f.code === 'excessive_intervention' && f.detail === 'active:8/8'), JSON.stringify(H({ turn: 7, interventions: [rec(confusedWE)] })));
  ok('… and it may not be made standing on that evidence', checkDecision({ ...confusedWE, scope: { kind: 'standing' } }, { ...CTX, ruleControls: RC2, turn: 0 }).some((f) => f.detail === 'standing_without_their_words'));
  ok('reverts are not interventions', H({ turn: 7, interventions: [0, 1, 2, 3, 4, 5, 6, 7].map((t) => rec({ ...revert, issuedAtTurn: t, expiration: { afterTurn: t, onRevoke: [] } })) }).length === 0);
  ok('ended at turn 7 means active through 6: 7 of 8', H({ turn: 7, interventions: [rec(mrDecision(0), 'revoked', 7, 'revoke:explicit.revoke')] }).length === 1);
  ok('ended at turn 6: 6 of 8', H({ turn: 7, interventions: [rec(mrDecision(0), 'revoked', 6, 'revoke:explicit.revoke')] }).length === 0);
  ok('an expiry bounds it: afterTurn 5 → 6 of 8', H({ turn: 7, interventions: [rec(mrDecision(0, { scope: { kind: 'turns', turns: 6 }, expiration: { afterTurn: 5, onRevoke: [] } }))] }).length === 0);
  ok('overlapping decisions count turns, not decisions', H({ turn: 7, interventions: [rec(mrDecision(2)), rec(mrDecision(3)), rec(mrDecision(4))] }).length === 0);
  ok('the proposed decision fills this turn', H({ turn: 7, interventions: [rec(mrDecision(1, { expiration: { afterTurn: null, onRevoke: ['explicit.revoke'] } }), 'expired', 7, 'expired')], current: mrDecision(7) }).length === 1);
}

console.log('goal drift');
{
  const pref = (key, turn, over = {}) => ({ key, value: 'x', provenance: 'explicit', turn, refs: [], confidence: 1, expiresAfterTurn: null, ...over });
  const guided = mrDecision(5, { action: 'guided_discovery', controls: {} });
  const drift = (prefs, current, goals) => H({ turn: 5, preferences: prefs, goals, current });
  const fs = drift([pref('strategy:direct', 4, { expiresAfterTurn: 5 })], guided);
  ok('guided discovery while their "just tell me" is in force: revert, block', fs.length === 1 && fs[0].code === 'goal_drift' && fs[0].action === 'revert' && fs[0].severity === 'block', JSON.stringify(fs));
  ok('… and once it has expired, no drift', drift([pref('strategy:direct', 2, { expiresAfterTurn: 3 })], guided).length === 0);
  ok('… and an estimate is not their instruction', drift([pref('strategy:direct', 4, { provenance: 'estimate' })], guided).length === 0);
  ok('… nor a hypothesis', drift([pref('strategy:direct', 4, { provenance: 'hypothesis' })], guided).length === 0);
  ok('keeping a quiz while "show me the steps" is in force', drift([pref('explicit.show_steps', 4)], mrDecision(5, { action: 'preserve_challenge', controls: { strategy: 'preserve_challenge' } })).length === 1);
  ok('more scaffolding while "just tell me" is in force', drift([pref('strategy:direct', 4)], mrDecision(5, { action: 'more_scaffolding', controls: {} })).length === 1);
  ok('a newer "quiz me" makes the quiz theirs', drift([pref('strategy:direct', 2), pref('strategy:quiz', 4)], mrDecision(5, { action: 'preserve_challenge', controls: { strategy: 'preserve_challenge', questionBudget: { max: 1, enforcement: 'tail' } } })).length === 0);
  ok('a worked example under "just tell me" is not drift', drift([pref('strategy:direct', 4)], mrDecision(5, { action: 'worked_example', controls: { strategy: 'worked_example', scaffolding: 'more' } })).length === 0);
  const asks = mrDecision(5, { action: 'guided_discovery', controls: { questionBudget: { max: 1, enforcement: 'tail' } } });
  ok('raising questions while "stop asking" is in force', drift([pref('questions:0', 3)], asks).some((f) => /no_questions_pref/.test(f.detail)));
  ok('… read off the observation code too', drift([pref('explicit.stop_questions', 3)], asks).length === 1);
  ok('fewer questions under "stop asking" is not drift', drift([pref('questions:0', 3)], mrDecision(5)).length === 0);
  ok('taking questions away while "quiz me" is in force', drift([pref('strategy:quiz', 3)], mrDecision(5)).some((f) => /questions_pref:fewer_questions/.test(f.detail)));
  ok('… or while their practice goal is', drift([], mrDecision(5), [pref('goal', 3, { value: 'practice' })]).length === 1);
  ok('a later "stop asking" ends "quiz me"', drift([pref('strategy:quiz', 2), pref('questions:0', 4)], mrDecision(5)).length === 0);
  // their own newer words are them changing their mind: "quiz me", then "just fix the grammar" (no questions)
  const editOnly = good({ trigger: 'mr.explicit.edit_only', action: 'task_specific', controls: { strategy: 'edit_as_asked', questionBudget: { max: 0, enforcement: 'tail' } }, evidenceRefs: [{ turn: 5, role: 'user', code: 'explicit.edit_only' }], issuedAtTurn: 5 });
  ok('their own newer instruction under "quiz me" is not drift', drift([pref('strategy:quiz', 3)], editOnly).length === 0, JSON.stringify(drift([pref('strategy:quiz', 3)], editOnly)));
  ok('… the same controls from MR are', drift([pref('strategy:quiz', 3)], mrDecision(5, { action: 'task_specific', controls: { questionBudget: { max: 0, enforcement: 'tail' } } })).some((f) => f.code === 'goal_drift'));
  ok("a 'none' decision cannot drift", drift([pref('strategy:direct', 4)], none).length === 0);
  ok('a revert cannot drift', drift([pref('strategy:direct', 4)], revert).length === 0);
  ok('no current decision, no drift', drift([pref('strategy:direct', 4)], null).length === 0);
  ok('a preference stated after this turn is not in force yet', drift([pref('strategy:direct', 6)], guided).length === 0);
}

// ── proxy gaming ─────────────────────────────────────────────────────
console.log('outcome use');
const U = { value: 'unknown', provenance: 'none', refs: [] };
const outcome = (over = {}) => ({
  interventionId: 'abc',
  turn: 5,
  taskCompletion: U,
  satisfaction: U,
  friction: U,
  independentPerformance: U,
  retention: U,
  autonomy: U,
  regulation: 'inconclusive',
  ...over,
});
const thanks = outcome({ satisfaction: { value: 'positive', provenance: 'explicit', refs: [] } });
const lessFriction = outcome({ friction: { value: { questionsAsked: 0, repeatRequests: 0, complaints: 0, turnsToUseful: 1 }, provenance: 'observed', refs: [] } });
const verified = outcome({ independentPerformance: { value: 'verified_correct', provenance: 'observed', refs: [] } });
const delivered = outcome({ taskCompletion: { value: 'delivered', provenance: 'observed', refs: [] } });
{
  const fs = checkOutcomeUse([thanks], 'capability');
  ok('"they got better" from a thank-you is proxy gaming', fs.length === 1 && fs[0].code === 'proxy_gaming' && fs[0].severity === 'block' && fs[0].detail === 'capability_from:satisfaction' && fs[0].turn === 5, JSON.stringify(fs));
}
ok('… from less friction too', details(checkOutcomeUse([lessFriction], 'capability'))[0] === 'capability_from:friction');
ok('… from both', details(checkOutcomeUse([thanks, lessFriction], 'capability'))[0] === 'capability_from:satisfaction+friction');
ok('… from nothing at all', details(checkOutcomeUse([], 'capability'))[0] === 'capability_without_evidence');
ok('an engine-verified independent attempt supports it', checkOutcomeUse([thanks, verified], 'capability').length === 0);
ok('an independent result that is only an estimate does not', checkOutcomeUse([outcome({ independentPerformance: { value: 'verified_correct', provenance: 'estimate', refs: [] } })], 'capability').length === 1);
ok('"the help went better" from a thank-you alone is proxy gaming', details(checkOutcomeUse([thanks], 'interaction'))[0] === 'interaction_from:satisfaction');
ok('… with friction measured, it is not', checkOutcomeUse([thanks, lessFriction], 'interaction').length === 0);
ok('… with task completion measured, it is not', checkOutcomeUse([delivered], 'interaction').length === 0);
ok('… and with nothing measured it has no evidence', details(checkOutcomeUse([outcome()], 'interaction'))[0] === 'interaction_without_evidence');

// ── budgets, privacy, regression ─────────────────────────────────────
console.log('budgets');
ok('under the latency budget: nothing', checkLatency(39, P, 3).length === 0 && checkLatency(40, P, 3).length === 0);
{
  const fs = checkLatency(41.4, P, 3);
  ok('over it: a warning, never a block', fs.length === 1 && fs[0].code === 'latency_budget' && fs[0].severity === 'warn' && fs[0].action === 'none' && fs[0].detail === 'ms:41>40' && fs[0].turn === 3, JSON.stringify(fs));
}
ok('an unreadable time is no reading', checkLatency(NaN, P, 3).length === 0 && checkLatency(undefined, P, 3).length === 0);
ok('deliberations within budget: nothing', checkCost(0, P, 2).length === 0 && checkCost(2, P, 2).length === 0);
{
  const fs = checkCost(3, P, 2);
  ok('a third deliberation is over budget and blocked', fs.length === 1 && fs[0].code === 'cost_budget' && fs[0].severity === 'block' && fs[0].detail === 'deliberations:3>2', JSON.stringify(fs));
}
ok('an unknown count is over budget (fail closed)', checkCost(NaN, P, 2)[0]?.detail === 'deliberations:unknown>2');

console.log('privacy');
const W = { userId: 'user_1', shared: false, persistPolicy: 'full', incognito: false, storeOn: true, consent: { carryAcross: false }, crossConversation: false, turn: 2 };
const priv = (over) => checkPrivacy({ ...W, ...over });
ok('signed in, private, on the record, store on: may write', priv({}).length === 0);
for (const [name, over, detail] of [
  ['a guest', { userId: null }, 'no_user'],
  ['a shared conversation', { shared: true }, 'shared'],
  ['off the record', { persistPolicy: 'none' }, 'persist_none'],
  ['incognito', { incognito: true }, 'incognito'],
  ['incognito unreadable (fail closed)', { incognito: null }, 'incognito_unknown'],
  ['store off', { storeOn: false }, 'store_off'],
  ['across conversations without consent', { crossConversation: true }, 'carry_without_consent'],
  ['across conversations from a conversation kept to itself', { crossConversation: true, consent: { carryAcross: true }, persistPolicy: 'conversation_only' }, 'carry_conversation_only'],
]) {
  const fs = priv(over);
  ok(`${name} → block_write ${detail}`, fs.length === 1 && fs[0].code === 'privacy_boundary' && fs[0].action === 'block_write' && fs[0].severity === 'block' && fs[0].detail === detail && fs[0].turn === 2, JSON.stringify(fs));
}
ok('across conversations with consent: may', priv({ crossConversation: true, consent: { carryAcross: true } }).length === 0);
ok('conversation_only within the conversation: may', priv({ persistPolicy: 'conversation_only' }).length === 0);
ok('one finding per reason', priv({ userId: null, shared: true, incognito: null }).length === 3);
ok('an unknown persist policy fails closed', details(priv({ persistPolicy: 'whatever' })).includes('persist_none'));
ok('shared unknown fails closed', details(priv({ shared: undefined })).includes('shared'));

console.log('task regression');
{
  const fs = checkTaskRegression(outcome({ taskCompletion: { value: 'not_delivered', provenance: 'observed', refs: [] } }), 6);
  ok('not delivered → revert', fs.length === 1 && fs[0].code === 'task_regression' && fs[0].action === 'revert' && fs[0].turn === 6, JSON.stringify(fs));
}
for (const v of ['delivered', 'partial', 'unknown']) ok(`${v} → nothing`, checkTaskRegression(outcome({ taskCompletion: { value: v, provenance: 'observed', refs: [] } }), 6).length === 0);
ok('a malformed outcome → nothing', checkTaskRegression(null, 6).length === 0);

console.log(`\nmr-integrity: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
