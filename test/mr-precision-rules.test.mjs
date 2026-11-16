// METACOGNITIVE REGULATION — PRECISION RULES, PRECEDENCE AND LINES (policy mr-2026.11.1).
//
// What is held down, on real transcripts with ACS's real move (chooseAssist)
// as the input MR regulates, and on decisions built by hand where the reading
// is not the point:
//   • the stuck rules: a refusal of help said with "I'm stuck" stands; a way
//     of helping they set earlier (their own try, "show me the steps") is not
//     run over by a worked example; a stuck episode gets one worked example,
//     and a turn that cannot have another gets the explicit move, never ACS's
//     question back;
//   • the kept lines: their own try or a quiz in force, and the scaffold
//     layer, keep the answer in the prompt as they do in the controls; a broad
//     question under the Answer Guard alone gets the open diagnose line;
//   • their length: "detailed", written instructions, a request for a full
//     piece, code or writing, and "show me the steps" still in force each take
//     MR's own ceiling back, never their "shorter"; repeated background lasts
//     the turn;
//   • their written instructions asking for a closing question take back a
//     "no question" only MR's precision readings set, never their stop;
//   • the lines: "I'm stuck" with nothing before it, a correction beside the
//     runtime's pushback reading;
//   • the experiment pin: registered against a literal version, and an older
//     rollback pin reaches its participants;
//   • the measures: reply.content the same in every arm; a measure that fails
//     costs the measure and nothing else;
//   • the pin: under mr-2026.10.1 none of it happens, and nothing new in the
//     input changes a thing.

import * as MR from './.tmp/mr-under-test.mjs';
import { readSignals } from './.tmp/signals.mjs';
import { chooseAssist } from './.tmp/assist.mjs';

const M = MR;
let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 500))));
const J = JSON.stringify;
const U = (content) => ({ role: 'user', content });
const A = (content) => ({ role: 'assistant', content });
const FULL = { arm: 'full', ifr: true, shadow: false, source: 'deployment' };
const PV = MR.MR_POLICY_VERSION;
const PV10 = 'mr-2026.10.1';
const PIN10 = { LOGOS_MR_POLICY: PV10 };

/** MR's input for the newest message of a transcript, with ACS's real move unless one is given. */
function input(messages, o = {}) {
  const last = messages[messages.length - 1].content;
  const signals = readSignals(last);
  const history = messages.slice(0, -1);
  const assist = o.assist ?? chooseAssist({ lastUserText: last, history, guard: !!o.guard, signals });
  return {
    conversationKey: o.key ?? 'conv_pr',
    messages,
    signals,
    acs: { assist, core: o.core ?? null, split: o.split ?? null },
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
      maxReply: o.maxReply ?? 700,
      shared: false,
      accuracy: { check: false, computed: false, math: !!o.math, theirs: o.theirs ?? [] },
      ...(o.material !== undefined ? { material: o.material } : {}),
      ...(o.attached !== undefined ? { attached: o.attached } : {}),
      ...(o.style !== undefined ? { style: o.style } : {}),
    },
    condition: o.condition ?? FULL,
    ...(o.carried ? { carried: o.carried } : {}),
    env: { LOGOS_MR: 'on', ...(o.env ?? {}) },
    now: () => 0,
  };
}
/** Every regulated turn of this suite, with the move ACS made, for the invariants at the end. */
const RUNS = [];
const run = (messages, o = {}) => {
  const i = input(messages, o);
  const r = MR.regulateTurn(i);
  RUNS.push({ messages, o, acs: i.acs.assist, r });
  return r;
};
const acsOf = (messages, o = {}) => {
  const last = messages[messages.length - 1].content;
  return chooseAssist({ lastUserText: last, history: messages.slice(0, -1), guard: !!o.guard, signals: readSignals(last) });
};
const nowCodes = (r) => r.state.observations.filter((o) => o.turn === r.state.turn).map((o) => o.code);
const freshTriggers = (r) => r.fresh.map((d) => d.trigger);
const STUCK_RULES = ['mr.explicit.stuck', 'ifr.explicit.stuck', 'mr.observed.repeated_stuck'];
const con = (r) => r.decision.constrainedBy ?? [];
/** The whole of what reaches the turn, for "nothing changed" comparisons (timing aside). */
const reached = (r) => J({ trace: r.trace.replace(/;ms=\d+/, ''), block: r.block, ceiling: r.ceiling, gate: r.gate, assist: r.assist, decision: r.decision });

const params = M.paramsFor(PV);
const ACS_OPEN = { mode: 'open', forced: false, questions: 1, scaffold: 'none', selfExplain: false, retrieval: false, reasons: [] };
const NO_SIGNALS = readSignals('');

/** A decision built by hand, for execute and renderControls. */
const dec = (controls, trigger = 'mr.explicit.stuck', o = {}) => ({
  policyVersion: PV,
  interventionId: o.id ?? 'k1k1k1k1k1k1k1k1k1k1',
  action: o.action ?? 'next_step',
  trigger,
  evidenceRefs: (o.evidence ?? ['explicit.stuck']).map((code) => ({ turn: 0, role: 'user', code })),
  target: ['acs', 'behavior'],
  controls,
  scope: { kind: 'turn' },
  expiration: { afterTurn: 0, onRevoke: ['explicit.revoke'] },
  confidence: 0.85,
  uncertainty: [],
  evaluationPlan: { primary: 'friction', expect: [], window: 1 },
  rollback: { revertTo: 'acs_default', when: ['outcome:revert'] },
  loop: 'fast',
  issuedAtTurn: 0,
});
/** execute() with a precision context (triggers passed) unless `pin10` says the policy has none. */
const exec = (controls, o = {}) =>
  M.execute({
    decision: dec(controls, o.trigger ?? (o.triggers ?? ['mr.explicit.stuck'])[0], o),
    acs: o.acs ?? ACS_OPEN,
    core: o.core ?? null,
    signals: NO_SIGNALS,
    said: new Set(o.said ?? []),
    guard: !!o.guard,
    math: false,
    length: o.length ?? null,
    maxReply: o.maxReply ?? 700,
    recentAsking: o.recentAsking ?? [],
    scaffold: !!o.scaffold,
    ...(o.pin10 ? {} : { triggers: o.triggers ?? ['mr.explicit.stuck'], evidence: o.evidence ?? ['explicit.stuck'] }),
    ...(o.style !== undefined ? { style: o.style } : {}),
    ...(o.fullPiece !== undefined ? { fullPiece: o.fullPiece } : {}),
  });

/** Observations built by hand, for decide(): the reader is not the point. */
const ob = (code, refs, turn = 1) =>
  code.startsWith('explicit.')
    ? { code, provenance: 'explicit', strength: 'strong', turn, refs: refs.map((c) => ({ turn, role: 'user', code: c })), confidence: 0.85 }
    : { code, provenance: 'observed', strength: 'moderate', turn, refs: refs.map((c) => ({ turn, role: 'user', code: c })), confidence: 0.8 };
const decideOn = (observations, o = {}) =>
  M.decide({
    turn: o.turn ?? 1,
    observations,
    active: o.active ?? [],
    params: o.params ?? params,
    policyVersion: PV,
    conversationKey: 'conv_pr',
    ifr: o.ifr ?? true,
    frozen: false,
    carryAcross: false,
    now: null,
    lastMrStrategyChange: o.lastMrStrategyChange ?? null,
    ...(o.recent ? { recent: o.recent } : {}),
  });

// ── fixtures ─────────────────────────────────────────────────────────
const APPROACH =
  'Substitution works by spotting a function and its derivative sitting together inside the integral. Here the inner function is x squared, and its derivative, 2x, sits right beside the exponential, so changing the variable turns the whole thing into the integral of e to a single variable, which you already know how to integrate.';
const SUBSTITUTION = [U('I want to learn substitution: integrate 2x e^(x^2) dx'), A(APPROACH), U("I set u = x^2 but now I'm stuck on the next step")];
const WINDOWS = 'On Windows, open Settings, then System, then Storage, and turn on Storage Sense. It clears temporary files and old downloads automatically, and you can run it now from the same page.';
const R6 = [U('How do I free up disk space?'), A(WINDOWS), U('No, I meant on my Mac')];
const SUGGEST1 =
  'Start by forgetting the network on the laptop and joining it again with the password, then turn off the power saving setting for the wireless adapter in Device Manager, because Windows often switches the adapter off to save battery and that drops the connection every few minutes.';
const R5 = [U("I'm stuck on the next step"), A(SUGGEST1), U('still stuck')];
const NET = 'Why is AI not solving problems?';
const LONG300 = Array.from({ length: 20 }, (_, k) => `Point ${k + 1} about a resume is that a recruiter skims each page quickly, so lead every bullet with a strong verb and a measurable result where you have one.`).join(' ');
const R10 = [U('How do I make my resume stand out?'), A(LONG300), U('ok but so what should I do?')];
const STEP1 = 'Next step: write du = 2x dx, so x dx is du over 2. Put that into the integral in place of x dx, and every x in it disappears, leaving a plain exponential in u that you can integrate on sight; you can tell it worked because no x is left anywhere in the integral.';
const STEP2 =
  'Here is a worked example of a similar one: for x cos(x^2) dx, set u = x^2, so du = 2x dx and x dx is du over 2. The integral becomes one half of the integral of cos u du, which is one half of sin u, plus a constant; putting x back gives one half of sin of x squared, plus a constant.';
const STEP3 = 'The same move again, slowly: the x outside the exponential is half of the derivative of the x squared inside it, which is exactly what lets the substitution swallow it, so after the swap only u is left, and the exponential of u integrates to itself.';

const OWN_TRY_A1 = [
  U("Solve 3x + 7 = 22 for x. Don't tell me the answer, I want to try it myself — hints only."),
  A('Good plan. Hint: what could you do to both sides to get the 3x term on its own?'),
  U("I'm stuck"),
  A('Think about undoing the +7. What operation undoes adding 7?'),
  U('still stuck'),
];
const STEPS_A3 = [
  U("I'm stuck on my homework: factor x^2 + 5x + 6. Show me the steps."),
  A('1. Find two numbers that multiply to 6 and add to 5: 2 and 3. 2. Write (x + 2)(x + 3). 3. Check by expanding: x^2 + 3x + 2x + 6 = x^2 + 5x + 6.'),
  U('still stuck'),
];

// ═════════════════════════════════════════════════════════════════════
console.log('\n=== S1: "I\'m stuck" with a refusal of help in the same message (F4) ===');
{
  // the reading (stuck.declines) built by hand: every stuck rule stands aside
  const shown = ['explicit.stuck', 'stuck.shown', 'stuck.own_work'];
  const unseen = ['explicit.stuck', 'stuck.unseen'];
  const fired = (out) => out.decisions.map((d) => d.trigger);
  ok('stuck with their work shown → a next step (near-miss: no refusal)', J(fired(decideOn([ob('explicit.stuck', shown)]))) === J(['mr.explicit.stuck']));
  ok('  …with a refusal of help → no stuck decision at all', fired(decideOn([ob('explicit.stuck', [...shown, 'stuck.declines'])])).length === 0, J(fired(decideOn([ob('explicit.stuck', [...shown, 'stuck.declines'])]))));
  ok('stuck with nothing visible → the locating question (near-miss: no refusal)', J(fired(decideOn([ob('explicit.stuck', unseen)]))) === J(['ifr.explicit.stuck']));
  ok('  …with a refusal of help → none', fired(decideOn([ob('explicit.stuck', [...unseen, 'stuck.declines'])])).length === 0);
  const again = [ob('explicit.stuck', [...shown, 'stuck.again']), ob('observed.repeated_stuck', ['explicit.stuck', 'stuck.before'])];
  ok('stuck again → one worked example (near-miss: no refusal)', fired(decideOn(again)).includes('mr.observed.repeated_stuck'), J(fired(decideOn(again))));
  const againDeclines = [ob('explicit.stuck', [...shown, 'stuck.again', 'stuck.declines']), ob('observed.repeated_stuck', ['explicit.stuck', 'stuck.before'])];
  ok('  …"still stuck, but don\'t tell me anything yet" → no worked example, no next step', fired(decideOn(againDeclines)).length === 0, J(fired(decideOn(againDeclines))));
  ok('  …and under IFR off the same', fired(decideOn(againDeclines, { ifr: false })).length === 0);

  // on the reader as it stands: the seven phrasings of the finding, first message and with their work on the table
  const LINES = [
    "I'm stuck. No hints, just let me think for a minute.",
    "I'm stuck but no hints please, I want to get there myself.",
    "I'm stuck, but don't give me the next step, I'll figure it out.",
    "I'm stuck on this one but I'd like to keep trying on my own, no hints please.",
    "I'm stuck, just let me vent for a second, I don't need help.",
    "I'm stuck but I don't want help yet.",
    "I'm stuck. Don't tell me anything yet.",
  ];
  for (const line of LINES) {
    const r = run([U(line)], { material: false });
    ok(`first message "${line}" → no stuck rule, no next step, no locating question`, !freshTriggers(r).some((t) => STUCK_RULES.includes(t)) && !['next_step', 'diagnose', 'worked_example'].includes(r.decision.controls.strategy), `${r.trace} ${J(nowCodes(r))}`);
    const w = run([...SUBSTITUTION.slice(0, 2), U(`I set u = x^2. ${line}`)]);
    ok(`  with their work on the table → no next step either`, !freshTriggers(w).some((t) => STUCK_RULES.includes(t)) && w.decision.controls.strategy !== 'next_step', `${w.trace} ${J(nowCodes(w))}`);
    const p = run([U(line)], { env: PIN10, material: false });
    ok(`  under mr-2026.10.1: nothing`, p.decision.action === 'none' || !/stuck/.test(p.decision.trigger), p.trace);
  }
  // near-misses on the reader: stuck said plainly still gets its move
  const s = run(SUBSTITUTION);
  ok('near-miss: "I set u = x^2 but now I\'m stuck on the next step" → the next step', s.decision.trigger === 'mr.explicit.stuck' && s.decision.controls.strategy === 'next_step', s.trace);
  const f = run([U("I'm stuck")], { material: false });
  ok('near-miss: "I\'m stuck" → the stuck move (a question about where, or a statement)', f.decision.trigger === 'ifr.explicit.stuck' && f.decision.controls.strategy === 'diagnose', f.trace);
}

console.log('\n=== S2: a way of helping they set earlier is not run over by a worked example (F28) ===');
{
  const r = run(OWN_TRY_A1);
  ok('their own try, then "I\'m stuck", then "still stuck" → no worked example', !freshTriggers(r).includes('mr.observed.repeated_stuck') && r.decision.controls.strategy !== 'worked_example', `${r.trace} ${J(freshTriggers(r))}`);
  ok('  …the own-try line stays, and no "one fully worked example"', r.block.includes('THEY WANT TO TRY IT FIRST. Do not give the answer away') && !r.block.includes('one fully worked example'), r.block);
  ok('  …and the answer stays kept (noRevealAnswers, guided)', r.decision.controls.noRevealAnswers === true && r.decision.controls.strategy === 'guided', J(r.decision.controls));
  const t1 = run(OWN_TRY_A1.slice(0, 3));
  ok('  the "I\'m stuck" between: no stuck rule over their own try', !freshTriggers(t1).some((t) => STUCK_RULES.includes(t)) && t1.block.includes('THEY WANT TO TRY IT FIRST'), `${t1.trace} ${t1.block}`);
  const p = run(OWN_TRY_A1, { env: PIN10 });
  ok('  under mr-2026.10.1: the own-try line, and no worked example', p.block.includes('THEY WANT TO TRY IT FIRST') && !p.block.includes('one fully worked example'), p.block);
  const s = run(STEPS_A3);
  ok('"show me the steps" in force, then "still stuck" → no worked example; the steps line stands', !freshTriggers(s).includes('mr.observed.repeated_stuck') && s.decision.controls.strategy === 'direct' && s.block.includes('THEY ASKED FOR IT DIRECTLY'), `${s.trace} ${s.block}`);
  const n = run(R5);
  ok('near-miss: nothing they set, "still stuck" → one worked example', n.decision.trigger === 'mr.observed.repeated_stuck' && n.decision.controls.strategy === 'worked_example' && n.block.includes('one fully worked example'), `${n.trace} ${n.block}`);
  // by hand: repeated_stuck stands aside for every way of helping they set
  for (const id of ['mr.explicit.own_try', 'ifr.explicit.show_steps', 'ifr.explicit.direct_answer', 'mr.explicit.quiz', 'mr.explicit.edit_only']) {
    const held = { decision: { ...dec({ strategy: 'guided' }, id, { id: 'held' + id.length }), issuedAtTurn: 0, expiration: { afterTurn: 6, onRevoke: [] } }, status: 'active' };
    const out = decideOn([ob('explicit.stuck', ['explicit.stuck', 'stuck.shown', 'stuck.own_work', 'stuck.again']), ob('observed.repeated_stuck', ['explicit.stuck', 'stuck.before'])], { active: [held] });
    ok(`  ${id} in force → no stuck decision`, !out.decisions.some((d) => STUCK_RULES.includes(d.trigger)), J(out.decisions.map((d) => d.trigger)));
  }
}

console.log('\n=== S3: one worked example a stuck episode, and never ACS\'s question back (F30) ===');
{
  // nothing of the work visible: "I'm stuck", then "I'm still stuck" four times
  const replies = [
    'One pointer: write down what the problem gives you and what it asks. What are you working on?',
    'Here is a worked example of a similar problem, step by step: ... Try the same steps on yours.',
    'Let us go one step at a time: what is the first line of your working?',
    'Here is another worked example...',
  ];
  let msgs = [];
  const seen = [];
  for (let t = 0; t < 5; t++) {
    msgs = [...msgs, U(t === 0 ? "I'm stuck" : "I'm still stuck")];
    const r = run(msgs, { material: false });
    seen.push({ t, trace: r.trace, fresh: freshTriggers(r), strategy: r.decision.controls.strategy, q: r.assist.questions, acsQ: acsOf(msgs).questions });
    if (t < 4) msgs = [...msgs, A(replies[t])];
  }
  const examples = seen.filter((x) => x.fresh.includes('mr.observed.repeated_stuck'));
  // (changed by the final independent check, G4: with nothing of the work in the conversation a worked example would be
  // one of a problem nobody has seen, so every turn gets the locating move instead — it was "exactly one worked example")
  ok('unseen, stuck five times → no worked example of a problem nobody has seen', examples.length === 0, J(seen.map((x) => x.fresh)));
  ok('  …each turn the locating move (ifr.explicit.stuck)', seen.every((x) => x.fresh.includes('ifr.explicit.stuck')), J(seen.map((x) => x.fresh)));
  ok('  …and every turn a stuck move of MR\'s, never nothing (ACS\'s question back)', seen.every((x) => x.fresh.some((t) => STUCK_RULES.includes(t))), J(seen.map((x) => `${x.t}:${x.fresh}`)));
  ok('  …never more questions than ACS allowed', seen.every((x) => x.q <= x.acsQ), J(seen.map((x) => `${x.q}/${x.acsQ}`)));

  // their work on the table (each reply between explains), practice under way
  const t0 = 'Integrate x e^(x^2) dx. This is my homework, I want to understand it.';
  const stuckNow = "I set u = x^2 but now I'm stuck on the next step";
  const still = "I'm still stuck on the next step";
  const seq = [[t0, APPROACH], [stuckNow, STEP1], [still, STEP2], [still, STEP3], [still, null]];
  let m2 = [];
  const got = [];
  for (const [said, reply] of seq) {
    m2 = [...m2, U(said)];
    const r = run(m2);
    got.push({ fresh: freshTriggers(r), s: r.decision.controls.strategy, q: r.assist.questions, block: r.block });
    if (reply) m2 = [...m2, A(reply)];
  }
  ok('shown: the first "I\'m stuck" → the next step', got[1].fresh.includes('mr.explicit.stuck') && got[1].s === 'next_step', J(got[1]));
  ok('  "still stuck" → one worked example', got[2].fresh.includes('mr.observed.repeated_stuck') && got[2].s === 'worked_example', J(got[2]));
  ok('  "still stuck" again (no second worked example this episode) → the next step, not nothing', got[3].fresh.includes('mr.explicit.stuck') && got[3].s === 'next_step' && !got[3].fresh.includes('mr.observed.repeated_stuck'), J(got[3]));
  ok('  …and again', got[4].fresh.includes('mr.explicit.stuck') && got[4].s === 'next_step', J(got[4]));
  ok('  …each with no question back', got.slice(1).every((x) => x.q === 0), J(got.map((x) => x.q)));

  // by hand: the dwell rule takes the worked example's strategy → the explicit move is given
  const both = [ob('explicit.stuck', ['explicit.stuck', 'stuck.shown', 'stuck.own_work', 'stuck.again'], 3), ob('observed.repeated_stuck', ['explicit.stuck', 'stuck.before'], 3)];
  const dwell = decideOn(both, { turn: 3, lastMrStrategyChange: 2 });
  ok('a turn the dwell rule holds → the next step (explicit), the worked example noted as held', J(dwell.decisions.map((d) => d.trigger)) === J(['mr.explicit.stuck']) && dwell.notes.includes('dwell:mr.observed.repeated_stuck'), J({ d: dwell.decisions.map((d) => d.trigger), n: dwell.notes }));
  const recent = decideOn(both, { turn: 3, recent: new Set(['mr.observed.repeated_stuck']) });
  ok('a worked example among the last turns\' decisions → the next step', J(recent.decisions.map((d) => d.trigger)) === J(['mr.explicit.stuck']), J(recent.decisions.map((d) => d.trigger)));
  const fresh = decideOn(both, { turn: 3, recent: new Set(['mr.explicit.stuck', 'ifr.explicit.stuck']) });
  ok('near-miss: only stuck moves before (no worked example yet) → the worked example; the next step stands aside (atomic)', J(fresh.decisions.map((d) => d.trigger)) === J(['mr.observed.repeated_stuck']) && fresh.notes.includes('partial:mr.explicit.stuck'), J({ d: fresh.decisions.map((d) => d.trigger), n: fresh.notes }));
  const unseenBoth = [ob('explicit.stuck', ['explicit.stuck', 'stuck.unseen', 'stuck.again'], 3), ob('observed.repeated_stuck', ['explicit.stuck', 'stuck.before'], 3)];
  const u = decideOn(unseenBoth, { turn: 3, recent: new Set(['mr.observed.repeated_stuck']) });
  ok('unseen, worked example given lately → the locating question', J(u.decisions.map((d) => d.trigger)) === J(['ifr.explicit.stuck']), J(u.decisions.map((d) => d.trigger)));
  // RECENT_TURNS bounds the episode: the fold's own window
  ok('the episode is bounded (RECENT_TURNS is a small positive number)', Number.isInteger(M.RECENT_TURNS) && M.RECENT_TURNS >= 2 && M.RECENT_TURNS <= 6, String(M.RECENT_TURNS));
  // under the pin the stuck rules never fire at all
  const p = decideOn(both, { turn: 3, params: M.paramsFor(PV10) });
  ok('under mr-2026.10.1: no stuck decision by hand either', p.decisions.length === 0, J(p.decisions.map((d) => d.trigger)));
}

console.log('\n=== K1: kept lines — their own try, a quiz, the scaffold layer (F28, F29, N9) ===');
{
  const B2 = [
    U("I need a stronger thesis for my essay on carbon taxes. Don't write it for me, I want to try it myself — hints only."),
    A('Sure. What is the main argument your essay makes?'),
    U('I already told you, it is about carbon taxes.'),
  ];
  const b = run(B2);
  ok('own try in force + "I already told you" → the hint line, never "give your best answer now"', b.block.includes('THE QUESTIONS HAVE NOT BEEN HELPING. Stop asking; give them the next step or a hint') && !b.block.includes('Give your best answer now'), `${b.trace} ${b.block}`);
  ok('  …the controls stay (fewer questions, the window), the answer kept', b.decision.controls.questionWindow && b.decision.controls.noRevealAnswers === true, J(b.decision.controls));
  const D2 = [U("Solve 3x + 5 = 20. Don't tell me the answer, I want to try it myself — hints only."), A('Sure. What could you subtract from both sides first?'), U('No, I meant 3x - 5 = 20.')];
  const d = run(D2);
  ok('own try in force + a correction → the kept correction line, never "Lead with what they asked for"', d.block.includes('Work from the question as they now put it') && !d.block.includes('Lead with what they asked for'), `${d.trace} ${d.block}`);
  const E1 = [
    U("Solve 3x + 5 = 20. Don't tell me the answer, I want to try it myself — hints only."),
    A('Good. What operation would undo the +5 on the left side?'),
    U('subtract'),
    A('Right idea. What operation would undo the +5 on the left side of the equation?'),
    U('I said subtract 5'),
  ];
  const e = run(E1);
  ok('own try in force + the same question again → the hint line', !e.block.includes('Give your best answer now') && (!e.decision.controls.questionWindow || e.block.includes('the answer itself stays theirs')), `${e.trace} ${e.block}`);
  for (const [name, msgs] of [['B2', B2], ['D2', D2], ['E1', E1]]) {
    const p = run(msgs, { env: PIN10 });
    ok(`  ${name} under mr-2026.10.1: only the own-try line`, p.block.includes('THEY WANT TO TRY IT FIRST') && !p.block.includes('QUESTIONS HAVE NOT BEEN HELPING') && !p.block.includes('CORRECTED'), p.block);
  }

  // by hand: what survived compose decides the line
  const WE = { strategy: 'worked_example', scaffolding: 'more', questionBudget: { max: 0, enforcement: 'tail' } };
  const kept = exec({ ...WE, noRevealAnswers: true }, { triggers: ['mr.observed.repeated_stuck', 'mr.explicit.quiz'], action: 'worked_example' });
  ok('a worked example with the answer kept (a quiz, their own try) → of an ANALOGOUS problem', kept.block.includes('ANALOGOUS problem') && !kept.block.includes('then offer, without requiring it'), kept.block);
  const open = exec(WE, { triggers: ['mr.observed.repeated_stuck'], action: 'worked_example' });
  ok('  near-miss: nothing kept → the plain worked example', open.block.includes('one fully worked example, step by step in plain words; then offer') && !open.block.includes('ANALOGOUS'), open.block);
  const pin = exec({ ...WE, noRevealAnswers: true }, { pin10: true, action: 'worked_example' });
  ok('  under a policy without precision: the line as it always was', pin.block.includes('one fully worked example, step by step in plain words; then offer') && !pin.block.includes('ANALOGOUS'), pin.block);
  const QW = { questionBudget: { max: 0, enforcement: 'tail' }, questionWindow: { max: 1, turns: 3 }, answerFirst: true };
  const qwKept = exec({ ...QW, strategy: 'guided', noRevealAnswers: true }, { triggers: ['mr.explicit.own_try', 'ifr.observed.redundant_question'], action: 'fewer_questions' });
  ok('fewer questions with their own try in force → the hint line', qwKept.block.includes('the answer itself stays theirs') && !qwKept.block.includes('Give your best answer now'), qwKept.block);
  const qwPin = exec({ ...QW, strategy: 'guided', noRevealAnswers: true }, { pin10: true, action: 'fewer_questions' });
  ok('  under a policy without precision: "give your best answer now", as it always was', qwPin.block.includes('Give your best answer now'), qwPin.block);

  // the scaffold layer: what the trace records is what the prompt carries
  const ns = exec({ strategy: 'next_step', questionBudget: { max: 0, enforcement: 'tail' } }, { scaffold: true });
  ok('the scaffold layer + a next step → the kept next step, and the trace says so', ns.block.includes('the answer itself stays theirs') && (ns.decision.constrainedBy ?? []).includes('app_policy:scaffold:strategy.keeps_answer'), `${J(ns.decision.constrainedBy)} ${ns.block}`);
  const dg = exec({ strategy: 'diagnose', questionBudget: { max: 1, enforcement: 'tail' } }, { scaffold: true, triggers: ['ifr.observed.open_request'], evidence: ['request.open', 'request.missing_referent'], action: 'diagnose' });
  ok('  …a missing referent under the scaffold layer: the missing line (nothing of an answer in it)', dg.block.includes('WHAT THEY POINT AT IS NOT IN THE CONVERSATION'), dg.block);
  const we = exec(WE, { scaffold: true, triggers: ['mr.observed.repeated_stuck'], action: 'worked_example' });
  ok('  …a worked example under the scaffold layer → ANALOGOUS, matching strategy.analogous in the trace', we.block.includes('ANALOGOUS problem') && (we.decision.constrainedBy ?? []).includes('app_policy:scaffold:strategy.analogous'), `${J(we.decision.constrainedBy)} ${we.block}`);
  const nsOpen = exec({ strategy: 'next_step', questionBudget: { max: 0, enforcement: 'tail' } });
  ok('  near-miss: no scaffold → the plain next step', nsOpen.block.includes('Give the one concrete next step') && !nsOpen.block.includes('the answer itself stays theirs'), nsOpen.block);
  const sc = run(SUBSTITUTION, { split: { reasoning: 'scaffold' } });
  ok('on a transcript: graded work in scaffold + "I\'m stuck" → the kept next step', sc.block.includes('the answer itself stays theirs') && con(sc).includes('app_policy:scaffold:strategy.keeps_answer'), `${sc.trace} ${sc.block}`);
}

console.log('\n=== K2: a broad question under the Answer Guard alone (N8) ===');
{
  const g = run([U(NET)], { guard: true });
  ok('the networking question under the guard → the open diagnose line, with its opt-out', g.decision.controls.strategy === 'diagnose' && g.block.includes('Lead with the one point that holds whichever way they mean it') && g.block.includes('If that point already gives them what they need, ask nothing.') && !g.block.includes('gives nothing of their answer away'), `${g.trace} ${g.block}`);
  const k = exec({ strategy: 'diagnose', questionBudget: { max: 1, enforcement: 'tail' } }, { core: { mode: 'HUMAN_PRACTICES', withhold: { what: 'the answer' } }, triggers: ['ifr.observed.open_request'], evidence: ['request.open', 'request.broad_subject', 'request.vague_outcome'], action: 'diagnose' });
  ok('  a withhold keeps the kept line, which now keeps its opt-out too', k.block.includes('gives nothing of their answer away') && k.block.includes('If that point already gives them what they need, ask nothing.'), k.block);
  const s = exec({ strategy: 'diagnose', questionBudget: { max: 1, enforcement: 'tail' } }, { guard: true, triggers: ['ifr.explicit.stuck'], evidence: ['explicit.stuck', 'stuck.unseen'], action: 'diagnose' });
  ok('  near-miss: "I\'m stuck" under the guard (a problem of theirs) → the kept stuck line', s.block.includes('one general pointer that gives nothing of their answer away'), s.block);
  const p = run([U(NET)], { guard: true, env: PIN10 });
  ok('  under mr-2026.10.1: nothing', p.decision.action === 'none' && p.block === '', p.trace);
}

console.log('\n=== L1: MR\'s own ceiling never stands against their length (F33, F5, N4, N1) ===');
{
  const c1 = run([U('How do I make my resume stand out? Give me the steps.'), A(LONG300), U('ok but so what should I do?')]);
  ok('"show me the steps" still in force + a re-ask → no ceiling, no SHORT line', c1.ceiling === null && !c1.block.includes('SHORT:') && con(c1).includes('user_instruction:verbosity'), `${c1.trace} ${c1.block}`);
  const c0 = run(R10);
  ok('  near-miss: the re-ask alone → MR\'s ceiling and the honest SHORT line', c0.ceiling === 360 && c0.block.includes('SHORT: a few sentences. The point first'), `${c0.trace} ${c0.block}`);
  // by hand: every held instruction of the kind, and their own "shorter" never taken
  const V = { answerFirst: true, verbosity: { ceilingTokens: 360 } };
  for (const held of ['ifr.explicit.show_steps', 'ifr.explicit.direct_answer']) {
    const x = exec({ ...V, strategy: 'direct' }, { triggers: [held, 'ifr.observed.late_answer'], action: 'direct' });
    ok(`  ${held} in force → the ceiling taken (user_instruction:verbosity)`, x.ceiling === null && (x.decision.constrainedBy ?? []).includes('user_instruction:verbosity'), J(x.decision.constrainedBy));
  }
  const theirs = exec({ ...V, strategy: 'direct' }, { triggers: ['ifr.explicit.show_steps', 'ifr.explicit.shorter'], action: 'direct' });
  ok('  …but their own "shorter" in force stays', theirs.ceiling === 360 && theirs.block.includes('They asked for less'), J({ c: theirs.ceiling, b: theirs.block }));
  const pinned = exec({ ...V, strategy: 'direct' }, { pin10: true, action: 'direct' });
  ok('  under a policy without precision the ceiling stands', pinned.ceiling === 360, J(pinned.decision.constrainedBy));

  // repeated background: the turn only, and a full piece asked for takes it back
  const S1 = 'Vaccines train the immune system by showing it a harmless piece or copy of a germ before the real infection ever arrives.';
  const S2 = 'The body responds by making antibodies and memory cells that recognise that specific germ the next time it appears.';
  const S3 = 'If the real germ shows up later, those memory cells react within hours instead of days, so the illness is milder or never starts.';
  const S4 = 'Boosters remind the immune system, topping up memory cells whose numbers slowly fall over the following months and years.';
  const base = [U('How do vaccines work?'), A([S1, S2, S3, S4].join(' ')), U('Can you put that in bullet points?'), A('- ' + S1 + '\n- ' + S2 + '\n- ' + S3 + '\n- ' + S4)];
  // (the bullet points were asked for: the same material in another form is not background said again — A.11, F5)
  const ack = run([...base, U('Perfect.')], { material: false });
  ok('the bullet points they asked for, then "Perfect." → no repeated background', ack.decision.trigger !== 'ifr.observed.repeated_background' && ack.decision.action === 'none', ack.trace);
  // background said again on a new question: read, for the turn only, and not carried onto the next request
  const again = [U('How do vaccines work?'), A([S1, S2, S3].join(' ')), U('What about flu shots?'), A([S1, S2, 'Flu shots change every year because the virus changes.'].join(' ')), U('how long does it last?')];
  const said = run(again, { material: false });
  ok('repeated background lasts the turn it is read on', said.decision.trigger === 'ifr.observed.repeated_background' && J(said.decision.scope) === J({ kind: 'turn' }) && said.decision.expiration.afterTurn === said.state.turn, J({ t: said.trace, s: said.decision.scope, e: said.decision.expiration }));
  const next = run([...again, A('About a year for the flu shot. ' + S4), U('Can you expand the section on immune memory for my exam notes?')], { material: false });
  ok('  …and is not carried onto the next request', !/repeated_background/.test(next.trace) && next.ceiling === null, next.trace);
  const guide = run([...base, U('Perfect. Now turn those bullet points into a full study guide on vaccines and immune memory for my exam.')], { material: false });
  ok('a full study guide asked for → no ceiling of MR\'s, no SHORT line', guide.ceiling === null && !guide.block.includes('SHORT:'), `${guide.trace} ${guide.block}`);
  ok('  …and where MR had read repeated background, the trace says their request took the ceiling', guide.decision.trigger !== 'ifr.observed.repeated_background' || con(guide).includes('user_instruction:verbosity'), guide.trace);
  const guideAgain = run([...again.slice(0, -1), U('Now turn that into a full study guide on vaccines and immune memory for my exam.')], { material: false });
  ok('  background said again, then "turn that into a full study guide" → read, and the rule stands aside for their rewrite: no ceiling, no SHORT line', guideAgain.state.observations.some((o) => o.turn === guideAgain.state.turn && o.code === 'observed.repeated_background') && guideAgain.decision.trigger !== 'ifr.observed.repeated_background' && guideAgain.ceiling === null && !guideAgain.block.includes('SHORT:'), `${guideAgain.trace} ${guideAgain.block}`);
  const B1 = 'Database queries slow down when the table has no index on the columns you filter by, so the engine has to read every row to find the matches.';
  const B2b = 'As the table grows, that full scan grows with it, which is why a query that was instant last year now takes seconds.';
  const pg = [U('Why are my Postgres queries getting slow?'), A(`${B1} ${B2b} Most of the rest is tuning.`), U('What about my orders table?'), A(`${B1} ${B2b} For orders, the usual filter is customer_id plus a date range.`)];
  const code = run([...pg, U('Write the Python script that adds the index and benchmarks the query before and after.')], { work: 'creation' });
  // (the database transcript is read: "my orders table" names a table, it does not ask for one — integration review)
  ok('a script asked for, after background said twice → read, and no ceiling of MR\'s (the code keeps its room: user_instruction:verbosity)', code.decision.trigger === 'ifr.observed.repeated_background' && con(code).includes('user_instruction:verbosity') && code.ceiling === null && !code.block.includes('SHORT:'), `${code.trace} ${code.block}`);
  const code2 = run([...pg, U('ok, how do I do that in Python with psycopg?')], { work: 'creation' });
  ok('  the runtime reads it as making something → no ceiling either', code2.decision.trigger === 'ifr.observed.repeated_background' && con(code2).includes('user_instruction:verbosity') && code2.ceiling === null, code2.trace);
  // (residual N4: code asked for in a language is a request for code whatever the runtime's reading — this assertion
  // said MR's ceiling stands on it before the fix; the near-miss is now the same question with no code asked for)
  const talk = run([...pg, U('ok, how do I do that in Python with psycopg?')]);
  ok('  the same question read as conversation → still no ceiling of MR\'s (code asked for in a language: user_instruction:verbosity)', talk.decision.trigger === 'ifr.observed.repeated_background' && con(talk).includes('user_instruction:verbosity') && talk.ceiling === null, talk.trace);
  const talk2 = run([...pg, U('ok, so how do I do that?')]);
  ok('  near-miss: "ok, so how do I do that?" (no code asked for), read as conversation → MR\'s ceiling stands', talk2.decision.trigger === 'ifr.observed.repeated_background' && talk2.ceiling === 360, talk2.trace);
  const shortFirst = run([U('Keep your answers short from now on.'), A('Will do.'), ...base.slice(0, 1), A([S1, S2].join(' ')), U('Now write me a full study guide on vaccines for my exam.')]);
  ok('  their own "short from now on" is never taken by a full piece asked for', shortFirst.ceiling === 360 && shortFirst.block.includes('They asked for less'), `${shortFirst.trace} ${shortFirst.block}`);
  for (const msgs of [[...base, U('Perfect. Now turn those bullet points into a full study guide on vaccines and immune memory for my exam.')], [...pg, U('Write the Python script that adds the index and benchmarks the query before and after.')]]) {
    const p = run(msgs, { env: PIN10, work: 'creation' });
    ok('  under mr-2026.10.1: no ceiling of the precision rules, as before', p.ceiling === null && !/repeated_background|late_answer|open_request/.test(p.trace), p.trace);
  }

  // what reads as a full piece, and what does not
  const YES = [
    'Perfect. Now turn those bullet points into a full study guide on vaccines and immune memory for my exam.',
    'Can you expand the section on immune memory for my exam notes?',
    'Write the Python script that adds the index and benchmarks the query before and after.',
    'Give me a complete, detailed explanation of photosynthesis.',
    'I need an in-depth report on the causes of the war.',
    'Step-by-step instructions please',
    'Draft the email to my landlord about the leak',
    'Write me an essay on the French Revolution',
    'Can you go into more detail on the second point?',
    'Turn this into a study guide',
    'Can you write a function that parses the dates?',
    'Elaborate on the third reason.',
  ];
  const NO = [
    "I don't need a full report, just the gist.",
    'Expand (x + 1)^2',
    'Expand the brackets in 3(x + 2)',
    'Is it a full moon tonight?',
    'I am a complete beginner at chess',
    'Make sure the letter is short',
    'Can you check my essay?',
    'What is a study?',
    'How long is a marathon?',
    'no need to expand on that',
    'ok',
    "Why is AI not solving problems?",
  ];
  for (const t of YES) ok(`full piece: "${t}"`, M.fullPieceAsked(t) === true);
  for (const t of NO) ok(`not a full piece: "${t}"`, M.fullPieceAsked(t) === false);
  ok('a full piece read only on their own words (a quoted request is somebody else\'s)', M.fullPieceAsked('My teacher said "write a full report" but what does that mean?') === false);
}

console.log('\n=== L2: their "detailed" setting — the lines drop the length they prescribe (F34) ===');
{
  const su = run([U("I'm stuck on this recursion problem")], { length: 'detailed', material: false });
  ok('stuck, nothing visible, "detailed" → the stuck line without "In a sentence or two"', su.decision.controls.strategy === 'diagnose' && su.block.includes('THEY ARE STUCK AND THE WORK IS NOT IN THE CONVERSATION') && !su.block.includes('In a sentence or two'), su.block);
  const sn = run([U("I'm stuck on this recursion problem")], { material: false });
  ok('  near-miss: no setting → the line keeps it', !sn.block.includes('STUCK AND THE WORK') || sn.block.includes('In a sentence or two') || sn.block.includes('Nothing yet says what they are working on'), sn.block);
  const la = run(R10, { length: 'detailed' });
  ok('a re-ask after a long reply, "detailed" → no "and only what they need", no ceiling', la.block.includes('THEY ASKED AGAIN FOR THE POINT') && !la.block.includes('only what they need') && la.ceiling === null, `${la.trace} ${la.block}`);
  const ln = run(R10);
  ok('  near-miss: no setting → the line keeps it', ln.block.includes('and only what they need'), ln.block);
  const ns = run(SUBSTITUTION, { length: 'detailed' });
  ok('stuck with their work, "detailed" → still one step (the move, not a length)', ns.block.includes('Then stop: one step, not a walk through the rest'), ns.block);
  const mi = exec({ strategy: 'diagnose', questionBudget: { max: 1, enforcement: 'tail' } }, { length: 'detailed', triggers: ['ifr.observed.open_request'], evidence: ['request.open', 'request.missing_referent'], action: 'diagnose' });
  ok('a missing referent, "detailed" → the missing line without "In a sentence or two"', mi.block.includes('WHAT THEY POINT AT IS NOT IN THE CONVERSATION. Say how you would go about it') && !mi.block.includes('In a sentence or two'), mi.block);
  for (const [name, msgs] of [['stuck', [U("I'm stuck on this recursion problem")]], ['re-ask', R10], ['stuck with work', SUBSTITUTION]]) {
    const p = run(msgs, { length: 'detailed', env: PIN10, material: false });
    ok(`  ${name} under mr-2026.10.1: nothing`, p.decision.action === 'none' && p.block === '', p.trace);
  }
}

console.log('\n=== W1: their written instructions (N1) ===');
{
  const Q = { questions: true };
  const acs = acsOf(SUBSTITUTION);
  const w = run(SUBSTITUTION, { style: Q });
  ok('stuck with work + instructions asking for a closing question → ACS\'s question kept', acs.questions === 1 && w.assist.questions === acs.questions && con(w).includes('user_instruction:questionBudget.style'), `${w.trace} acs=${acs.questions} q=${w.assist.questions}`);
  ok('  …the next step stands, its line without "no question back", and no check-in filter', w.decision.controls.strategy === 'next_step' && w.block.includes('Then stop: one step, not a walk through the rest.') && !w.block.includes('no question back') && !w.gate.dropCheckIns, `${w.block} ${J(w.gate)}`);
  const n = run(SUBSTITUTION);
  ok('  near-miss: no instructions → no question', n.assist.questions === 0 && n.block.includes('and no question back'), n.trace);
  const c = run(R6, { style: Q });
  ok('a correction + the same instructions → ACS\'s question kept', c.assist.questions === acsOf(R6).questions && con(c).includes('user_instruction:questionBudget.style'), `${c.trace} q=${c.assist.questions}`);
  const stop = run([U('stop asking me questions'), A('Understood.'), ...SUBSTITUTION], { style: Q });
  ok('their stop in force → no question, whatever the instructions (hard, untouched)', stop.assist.questions === 0 && stop.gate.hardNoQuestions === true && !con(stop).includes('user_instruction:questionBudget.style'), stop.trace);
  // by hand: another rule's "no question" keeps it
  const mixed = exec({ strategy: 'next_step', questionBudget: { max: 0, enforcement: 'tail' }, questionWindow: { max: 1, turns: 3 }, answerFirst: true }, { style: Q, triggers: ['mr.explicit.stuck', 'ifr.observed.unproductive_questions'] });
  ok('  questions that were not helping (not a precision reading) beside it → no question', mixed.assist.questions === 0 && !(mixed.decision.constrainedBy ?? []).includes('user_instruction:questionBudget.style'), J(mixed.decision.constrainedBy));
  const red = exec({ questionBudget: { max: 0, enforcement: 'tail' }, questionWindow: { max: 1, turns: 3 }, answerFirst: true }, { style: Q, triggers: ['ifr.observed.redundant_question'], action: 'fewer_questions', recentAsking: [true] });
  ok('  a question asked for something already said → both its limits go back, to ACS\'s budget only', red.assist.questions === 1 && (red.decision.constrainedBy ?? []).includes('user_instruction:questionWindow.style'), J(red.decision.constrainedBy));
  const acs0 = exec({ strategy: 'next_step', questionBudget: { max: 0, enforcement: 'tail' } }, { style: Q, acs: { ...ACS_OPEN, questions: 0 } });
  ok('  never above ACS: ACS asking nothing stays at nothing', acs0.assist.questions === 0, J(acs0.assist));
  const pinQ = exec({ strategy: 'next_step', questionBudget: { max: 0, enforcement: 'tail' } }, { style: Q, pin10: true });
  ok('  under a policy without precision the instructions are not read', pinQ.assist.questions === 0, J(pinQ.decision.constrainedBy));

  const L = { length: true };
  const net = run([U(NET)], { style: L });
  ok('the networking question + "thorough, detailed answers" → no ceiling of MR\'s (max tokens as MR off)', net.ceiling === null && con(net).includes('user_instruction:verbosity') && !net.block.includes('SHORT:'), `${net.trace} ${net.block}`);
  ok('  …the diagnose stays (within ACS), its line without a length', net.decision.controls.strategy === 'diagnose' && !net.block.includes('two or three plain sentences'), net.block);
  const net0 = run([U(NET)]);
  ok('  near-miss: no instructions → MR\'s ceiling', net0.ceiling === 360, net0.trace);
  const shorter = exec({ verbosity: { ceilingTokens: 360 } }, { style: L, triggers: ['ifr.explicit.shorter'], action: 'shorter' });
  ok('  their own "shorter" stays against written instructions too', shorter.ceiling === 360, J(shorter.decision.constrainedBy));

  // under the pin, the new input fields change nothing at all
  for (const [name, msgs] of [['stuck with work', SUBSTITUTION], ['correction', R6], ['networking', [U(NET)]]]) {
    const plain = run(msgs, { env: PIN10 });
    const styled = run(msgs, { env: PIN10, style: { questions: true, length: true }, attached: true });
    ok(`  ${name} under mr-2026.10.1: written instructions and an attachment marker change nothing`, reached(plain) === reached(styled), `${plain.trace} | ${styled.trace}`);
  }
}

console.log('\n=== T1: "I\'m stuck" with nothing before it (N6) ===');
{
  const D = { strategy: 'diagnose', questionBudget: { max: 1, enforcement: 'tail' } };
  const ask = exec(D, { triggers: ['ifr.explicit.stuck'], evidence: ['explicit.stuck', 'stuck.unseen', 'stuck.first'], action: 'diagnose' });
  ok('nothing before it, a question to spend → ask what they are working on; no generic pointer', ask.block.includes('ask what it is, or ask them to paste the step') && !ask.block.includes('most blocks of this kind') && !ask.block.includes('pointer'), ask.block);
  const state = exec(D, { triggers: ['ifr.explicit.stuck'], evidence: ['explicit.stuck', 'stuck.unseen', 'stuck.first'], action: 'diagnose', acs: { ...ACS_OPEN, questions: 0 } });
  ok('  no question to spend → say plainly what would let you help; never a guessed first move', state.block.includes('say plainly what would let you help') && state.block.includes('as a statement, not a question') && !state.block.includes('likeliest first move') && state.assist.questions === 0, state.block);
  const guarded = exec(D, { guard: true, triggers: ['ifr.explicit.stuck'], evidence: ['explicit.stuck', 'stuck.unseen', 'stuck.first'], action: 'diagnose' });
  ok('  under the guard the same (nothing of an answer is in it)', guarded.block.includes('ask what it is, or ask them to paste the step'), guarded.block);
  const later = exec(D, { triggers: ['ifr.explicit.stuck'], evidence: ['explicit.stuck', 'stuck.unseen'], action: 'diagnose' });
  ok('  near-miss: something before it → the pointer line as it was', later.block.includes('one pointer that helps with most blocks of this kind'), later.block);
  const r = run([U("I'm stuck")], { material: false });
  ok('on the reader: "I\'m stuck" as a first message → no generic pointer', r.decision.controls.strategy === 'diagnose' && !r.block.includes('most blocks of this kind') && !r.block.includes('likeliest first move'), `${r.trace} ${J(r.decision.evidenceRefs.map((e) => e.code))} ${r.block}`);
  const r0 = run([U("I don't know where to start")], { material: false });
  ok('  "I don\'t know where to start" first → no guessed first move', !r0.block.includes('likeliest first move'), `${r0.trace} ${r0.block}`);
}

console.log('\n=== C1: a correction beside the runtime\'s pushback reading (N7) ===');
{
  const r = run(R6);
  ok('the correction line opens by naming the turn a clarification', r.block.includes('This is a clarification, not a disagreement: THEY CORRECTED YOUR READING OF THE QUESTION. Lead with what they asked for'), r.block);
  const g = run(R6, { guard: true });
  ok('  …and so does its kept form', g.block.includes('This is a clarification, not a disagreement: THEY CORRECTED YOUR READING OF THE QUESTION. Work from the question'), g.block);
  const p = run(R6, { env: PIN10 });
  ok('  under mr-2026.10.1: nothing', p.decision.action === 'none' && p.block === '', p.trace);
}

console.log('\n=== E1: the experiment pin (F35) ===');
{
  const pilot = M.EXPERIMENTS['mr-pilot-2027s'];
  ok('mr-pilot-2027s is registered against the literal mr-2026.10.1', pilot.policyVersion === 'mr-2026.10.1');
  const enrol = (spec, env) => {
    const registry = { [spec.id]: { ...spec, active: true } };
    let uid = null;
    for (let i = 0; i < 400 && !uid; i++) {
      const a = M.armFor(registry[spec.id], 'user_' + i);
      if (a.arm === 'full' && a.ifr) uid = 'user_' + i;
    }
    const settings = { ...M.DEFAULT_MR_SETTINGS, research: { studyId: spec.id, consentedAt: 1 } };
    return M.resolveCondition({ mode: 'on', env: { LOGOS_MR: 'on', LOGOS_MR_EXPERIMENT: spec.id, ...env }, userId: uid, shared: false, settings, settingsOk: true, experiments: registry });
  };
  const shipped = enrol(pilot, PIN10);
  const sr = run([U(NET)], { condition: shipped, env: { LOGOS_MR_EXPERIMENT: pilot.id, ...PIN10 } });
  ok('an active copy as shipped, with the rollback pin → pv=mr-2026.10.1, a=none', shipped.source === 'experiment' && /;pv=mr-2026\.10\.1;/.test(sr.trace) && /;a=none;/.test(sr.trace), sr.trace);
  const newer = { ...pilot, id: 'mr-test-newer', salt: 'mr-test-newer.v1', policyVersion: PV };
  const cn = enrol(newer, PIN10);
  const nr = run([U(NET)], { condition: cn, env: { LOGOS_MR_EXPERIMENT: newer.id, ...PIN10 } });
  ok('an experiment registered against the newer policy + an older rollback pin → the pin wins', cn.policyVersion === PV && /;pv=mr-2026\.10\.1;/.test(nr.trace) && /;a=none;/.test(nr.trace), nr.trace);
  ok('  …and says so in the trace and the state', nr.trace.includes(';pin_over_experiment;') && nr.state.uncertainty.includes('pin_over_experiment') && nr.decision.policyVersion === PV10, `${nr.trace} ${J(nr.state.uncertainty)}`);
  const nn = run([U(NET)], { condition: enrol(newer, {}), env: { LOGOS_MR_EXPERIMENT: newer.id } });
  ok('  near-miss: no pin → the experiment\'s own policy (the diagnose)', /;pv=mr-2026\.11\.1;/.test(nn.trace) && /;a=diagnose;/.test(nn.trace) && !nn.trace.includes('pin_over_experiment'), nn.trace);
  const same = run([U(NET)], { condition: enrol(newer, { LOGOS_MR_POLICY: PV }), env: { LOGOS_MR_EXPERIMENT: newer.id, LOGOS_MR_POLICY: PV } });
  ok('  a pin naming the same version → no note', /;pv=mr-2026\.11\.1;/.test(same.trace) && !same.trace.includes('pin_over_experiment'), same.trace);
  const older = { ...pilot, id: 'mr-test-older', salt: 'mr-test-older.v1', policyVersion: PV10 };
  const up = run([U(NET)], { condition: enrol(older, { LOGOS_MR_POLICY: PV }), env: { LOGOS_MR_EXPERIMENT: older.id, LOGOS_MR_POLICY: PV } });
  ok('  a pin NEWER than the registered version never overrides it', /;pv=mr-2026\.10\.1;/.test(up.trace) && !up.trace.includes('pin_over_experiment'), up.trace);
  const bad = run([U(NET)], { condition: enrol(newer, { LOGOS_MR_POLICY: 'mr-2020.1.1' }), env: { LOGOS_MR_EXPERIMENT: newer.id, LOGOS_MR_POLICY: 'mr-2020.1.1' } });
  ok('  a pin naming no version that exists never overrides it (and is a finding)', /;pv=mr-2026\.11\.1;/.test(bad.trace) && !bad.trace.includes('pin_over_experiment') && bad.integrity.some((f) => f.detail === 'pin_unknown_version'), bad.trace);
  ok('policyOlder compares the numbers', M.policyOlder('mr-2026.10.1', 'mr-2026.11.1') && M.policyOlder('mr-2026.9.3', 'mr-2026.10.1') && M.policyOlder('mr-2025.12.9', 'mr-2026.1.1') && !M.policyOlder('mr-2026.11.1', 'mr-2026.10.1') && !M.policyOlder('mr-2026.11.1', 'mr-2026.11.1'));
  ok('  …and a version not of that form is never older', !M.policyOlder('mr-legacy', 'mr-2026.11.1') && !M.policyOlder('mr-2026.10.1', 'latest') && !M.policyOlder('', 'mr-2026.11.1'));
  ok('the note is a code the integrity monitor accepts', M.checkDecision({ ...dec({}, 'none', { action: 'none' }), uncertainty: ['pin_over_experiment'] }, { knownPolicies: Object.keys(M.STRATEGIES), ruleControls: M.RULE_CONTROLS, turn: 0 }).filter((f) => f.severity === 'block').length === 0);
}

console.log('\n=== M1: reply.content is the same in every arm (F36) ===');
{
  const msgs = [U('Give me 5 interview questions for a junior nurse role.')];
  const reply = 'Here are five:\n\n1. Why did you choose nursing?\n2. How do you handle a difficult patient?\n3. What would you do if a doctor gave an unclear order?\n4. How do you prioritise when three call lights go on at once?\n5. Where do you want to be in five years?';
  const plainMsgs = [U('How do I make my resume stand out?')];
  const plainReply = 'Lead each bullet with a strong verb and a result. What role are you applying for?';
  for (const pin of [{}, PIN10]) {
    const tag = pin.LOGOS_MR_POLICY ? ' [mr-2026.10.1]' : '';
    const got = [];
    const gotPlain = [];
    for (const arm of ['full', 'baseline', 'prompt_reflection', 'state_only']) {
      for (const shadow of [false, true]) {
        const condition = { arm, ifr: arm === 'full', shadow, source: 'deployment' };
        const r = run(msgs, { condition, env: pin });
        got.push({ arm, shadow, turn: r.contentTurn, m: M.measureReply(r, reply).content });
        const p = run(plainMsgs, { condition, env: pin });
        gotPlain.push(M.measureReply(p, plainReply).content);
      }
    }
    ok(`questions asked for as content → content in all four arms, shadow or not${tag}`, got.every((x) => x.turn === true && x.m === true), J(got));
    ok(`  near-miss: an ordinary question → not content, in every arm${tag}`, gotPlain.every((x) => x === false), J(gotPlain));
  }
  const said = new Set();
  ok('contentTurnOf is pure: the same turns give the same answer', M.contentTurnOf(M.turnsOf(msgs), said) === true && M.contentTurnOf(M.turnsOf(msgs), said) === true && M.contentTurnOf(M.turnsOf(plainMsgs), said) === false);
  ok('  …and a quiz asked for is not content (the questions are put to them)', M.contentTurnOf(M.turnsOf([U('Quiz me with 5 questions on the French Revolution.')]), new Set(['explicit.quiz'])) === false);
}

console.log('\n=== M2: a measure that fails costs the measure and nothing else (F50) ===');
{
  const msgs = [U('How do I free up disk space?'), A(WINDOWS), U('thanks, that worked')];
  const okRun = run(msgs);
  ok('the reaction is measured on an ordinary turn', !!okRun.state.react, J(okRun.state.react));
  const faulted = run(msgs, { env: { MR_TEST_FAULT: 'measure' } });
  ok('MR_TEST_FAULT=measure: the turn is still regulated, without the reaction', !faulted.state.react && faulted.trace.startsWith('mr1;'), faulted.trace);
  const strip = (r) => J({ ...JSON.parse(reached(r)), react: undefined });
  ok('  …and everything that reaches the turn is what it was', strip(okRun) === strip(faulted), `${okRun.trace} | ${faulted.trace}`);
  const prod = run(msgs, { env: { MR_TEST_FAULT: 'measure', NODE_ENV: 'production' } });
  ok('  never honoured in production', !!prod.state.react, J(prod.state.react));
  let threw = false;
  try {
    M.measureReply(okRun, 'Glad it worked.', { env: { MR_TEST_FAULT: 'measure' } });
  } catch {
    threw = true;
  }
  ok('measureReply throws under the fault (the route\'s guard is what keeps its line and row)', threw);
  let prodThrew = false;
  try {
    M.measureReply(okRun, 'Glad it worked.', { env: { MR_TEST_FAULT: 'measure', NODE_ENV: 'production' } });
  } catch {
    prodThrew = true;
  }
  ok('  …never in production', !prodThrew);
  ok('  …and with no fault the measure is taken', !!M.measureReply(okRun, 'Glad it worked.', { env: {} }));
  const pinned = run(msgs, { env: { MR_TEST_FAULT: 'measure', ...PIN10 } });
  ok('  under mr-2026.10.1 the same: regulated, the reaction left out', !pinned.state.react && /;pv=mr-2026\.10\.1;/.test(pinned.trace), pinned.trace);
}

console.log('\n=== X1: the attachment marker and the material flag reach the fold without changing the pin ===');
{
  for (const msgs of [[U('How do I fix this?')], [U("I'm stuck")], SUBSTITUTION]) {
    let threw = false;
    for (const attached of [true, false, undefined]) {
      try {
        run(msgs, { attached, material: false });
      } catch {
        threw = true;
      }
    }
    ok(`"${msgs[msgs.length - 1].content.slice(0, 40)}": an attachment marker (true, false, absent) never throws`, !threw);
    const a = run(msgs, { env: PIN10, material: false, attached: true });
    const b = run(msgs, { env: PIN10, material: false });
    ok('  …and under mr-2026.10.1 changes nothing', reached(a) === reached(b), `${a.trace} | ${b.trace}`);
  }
}

console.log('\n=== I1: invariants over every turn of this suite ===');
{
  const wider = RUNS.filter(({ acs, r }) => r.assist.questions > acs.questions && !r.assist.reasons.includes('mr:user_instruction:quiz'));
  ok('never more questions than ACS allowed (outside a quiz they asked for)', wider.length === 0, J(wider.slice(0, 3).map((x) => x.r.trace)));
  const over = RUNS.filter(({ o, r }) => r.ceiling !== null && r.ceiling > (o.maxReply ?? 700));
  ok('never a ceiling above the route\'s', over.length === 0, J(over.slice(0, 3).map((x) => x.r.trace)));
  const unhard = RUNS.filter(({ r }) => r.state.interventions.some((x) => x.status === 'active' && x.decision.trigger === 'ifr.explicit.stop_questions') && r.condition.arm === 'full' && !r.condition.shadow && !r.gate.hardNoQuestions && r.assist.questions > 0);
  ok('their stop in force is never lifted', unhard.length === 0, J(unhard.slice(0, 3).map((x) => x.r.trace)));
  const codesOk = RUNS.every(({ r }) => (r.decision.constrainedBy ?? []).every((c) => /^[A-Za-z0-9_][\w.:/=+<>#,@|-]{0,63}$/.test(c)) && r.state.uncertainty.every((c) => /^[A-Za-z0-9_][\w.:/=+<>#,@|-]{0,63}$/.test(c)));
  ok('every constrainedBy and state note is a code', codesOk);
  const leak = RUNS.filter(({ r }) => /[A-Z][a-z]+ [a-z]+ [a-z]+/.test(r.trace));
  ok('no trace carries words', leak.length === 0, J(leak.slice(0, 2).map((x) => x.r.trace)));
  const pinned = RUNS.filter(({ o }) => o.env?.LOGOS_MR_POLICY === PV10);
  const precise = pinned.filter(({ r }) => /mr\.explicit\.stuck|ifr\.explicit\.stuck|repeated_stuck|ifr\.explicit\.corrected|open_request|late_answer|repeated_background|redundant_question|fix_failed|knows_that/.test(r.trace));
  ok('under mr-2026.10.1 no precision rule ever decides (in this suite)', pinned.length > 10 && precise.length === 0, J(precise.slice(0, 3).map((x) => x.r.trace)));
}

console.log(`\nmr precision rules: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
