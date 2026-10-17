// The Cognitive Interaction Engine (lib/cognition/assist.ts): which kind of
// help each turn gets, and the evidence that settles it.
//
// Every expectation is about the DECISION — deterministic, no model — not
// about what a reply would say. A move is imposed only on evidence; the
// question budget is priced from the transcript.

import {
  chooseAssist,
  renderAssist,
  assistTrace,
  isFactQuestion,
  wantsExplanation,
  asksForDecision,
  offersWork,
  constructAsk,
  sanitizeDigest,
  digestOf,
  RETRIEVAL_GAP_MS,
} from './.tmp/assist.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const dec = (lastUserText, o = {}) => chooseAssist({ lastUserText, history: [], guard: false, ...o });
const show = (d) => JSON.stringify({ mode: d.mode, forced: d.forced, q: d.questions, scaffold: d.scaffold, reasons: d.reasons, target: d.target });

console.log('=== a question of fact is answered, not returned as a question ===');
for (const t of ['What is an ISCO?', "what's the boiling point of water at sea level?", 'Who wrote Pride and Prejudice?', 'How many bones are in the human body?', 'define opportunity cost', 'convert 5 km to miles', '18% of 340', 'When did the Berlin Wall fall?']) {
  const d = dec(t);
  ok(`"${t}" → inform, no question`, d.mode === 'inform' && d.forced && d.questions === 0, show(d));
}
for (const t of ['What should I do about my job?', 'What do you think of my essay?', 'what is the meaning of my life', 'Which one should I pick?']) {
  ok(`"${t}" is not a question of fact`, !isFactQuestion(t));
}

console.log('=== "just tell me" is honoured — and the Answer Guard, which they set, still holds ===');
{
  let d = dec('just tell me the answer');
  ok('just tell me → inform, imposed, no question', d.mode === 'inform' && d.forced && d.questions === 0, show(d));
  d = dec('just tell me the answer', { guard: true, accuracy: { check: true, pushback: null, theirs: [], computed: true, math: true } });
  ok('…under the guard, on mathematics → the next step only', d.mode === 'explain' && d.scaffold === 'hint' && d.questions === 0, show(d));
  d = dec('What is the derivative of x^3?', { guard: true, accuracy: { check: true, pushback: null, theirs: [], computed: true, math: true } });
  ok('a maths fact under the guard is a hint, not the value', d.mode === 'explain' && d.scaffold === 'hint', show(d));
}

console.log('=== they asked for the reasoning ===');
{
  let d = dec('How does the chain rule actually work?');
  ok('how does … work → explain', d.mode === 'explain' && d.forced, show(d));
  d = dec('How does the chain rule actually work?', { map: { context: 'learning', intent: null, assumptions: [], conflicts: [], open: [] } });
  ok('…while learning → smaller steps', d.mode === 'explain' && d.scaffold === 'steps', show(d));
  d = dec('Explain how a bond yield moves when rates rise. I work in fixed income, so be brief.');
  ok('an expert asking: explained, without the scaffolding', d.mode === 'explain', show(d));
  ok('wantsExplanation reads "walk me through"', wantsExplanation('walk me through the proof', { explainAsked: false }));
}

console.log('=== pushback is checked, never conceded to ===');
{
  const d = dec("that's wrong, it should be positive", { accuracy: { check: true, pushback: { kind: 'dispute' }, theirs: [], computed: true, math: true } });
  ok('pushback → verify, imposed', d.mode === 'verify' && d.forced && d.reasons.includes('pushback:dispute'), show(d));
}

console.log('=== their own work is checked — and help scales with the step ===');
{
  let d = dec('I got 42, is this right?');
  ok('work offered → verify', d.mode === 'verify' && d.forced, show(d));
  d = dec('so the derivative is csc(x)cot(x)', { accuracy: { check: true, pushback: null, theirs: [{ status: 'refuted' }], computed: true, math: true } });
  ok('a wrong step → verify with a hint (the first wrong step, repaired)', d.mode === 'verify' && d.scaffold === 'hint' && d.reasons.includes('work:wrong'), show(d));
  d = dec("I'm new to this — so the derivative is csc(x)cot(x)", { accuracy: { check: true, pushback: null, theirs: [{ status: 'refuted' }], computed: true, math: true } });
  ok('…from a self-described novice → smaller steps', d.scaffold === 'steps' || d.scaffold === 'hint', show(d));
  d = dec('so the derivative is -csc(x)cot(x)', { accuracy: { check: true, pushback: null, theirs: [{ status: 'verified' }], computed: true, math: true }, map: { context: 'math', intent: 'learning', assumptions: [], conflicts: [], open: [] } });
  ok('a right step while learning → confirmed, and one "why does it work?"', d.mode === 'verify' && d.selfExplain && d.questions === 1, show(d));
  const askedWhy = [{ role: 'user', content: 'x' }, { role: 'assistant', content: 'Correct. Why does that work, in your own words?' }];
  d = dec('so the derivative is -csc(x)cot(x)', { history: askedWhy, accuracy: { check: true, pushback: null, theirs: [{ status: 'verified' }], computed: true, math: true }, map: { context: 'math', intent: 'learning', assumptions: [], conflicts: [], open: [] } });
  ok('…not asked again right after it was', !d.selfExplain, show(d));
  d = dec('so the derivative is -csc(x)cot(x)', { accuracy: { check: true, pushback: null, theirs: [{ status: 'verified' }], computed: true, math: true }, map: { context: 'math', intent: 'utility', assumptions: [], conflicts: [], open: [] } });
  ok('…and never outside learning (a quick check is a quick check)', !d.selfExplain, show(d));
  ok('offersWork reads "here\'s my working"', offersWork("here's my working for question 3"));
}

console.log('=== something to build is built, and pointed at ===');
{
  const d = dec('Chart my spending: rent 1200, food 400, transport 150', { construct: 'display' });
  ok('a display asked for → construct, no question', d.mode === 'construct' && d.forced && d.questions === 0, show(d));
  ok('"create a model with wage…" is a construction', constructAsk('Create a model with wage as the dependent variable and education as the independent variable') === 'model');
  ok('"plot y = x^2" is a construction', constructAsk('plot y = x^2 from -3 to 3') === 'plot');
  ok('"what is a regression model?" is not', constructAsk('What is a regression model?') === null);
  ok('"how do I make a model in Excel?" is not', constructAsk('how do I make a model in Excel?') === null);
}

console.log('=== being heard is room, not advice ===');
{
  const d = dec("I just need to vent. Today was awful and I don't want advice.");
  ok('vent → space, no question', d.mode === 'space' && d.questions === 0, show(d));
}

console.log('=== a choice stays theirs ===');
{
  const d = dec('Should I take the Dallas offer or stay?');
  ok('decision asked → perspective', d.mode === 'perspective' && d.forced, show(d));
  ok('asksForDecision reads "what would you do"', asksForDecision('what would you do in my place', { recommendationRequested: false }));
}

console.log('=== Point & Ask: the question is about the thing they selected ===');
{
  let d = dec('why is this negative?', { focus: { kind: 'param', label: 'β₂' } });
  ok('a selection + why → explain about it', d.mode === 'explain' && d.target === 'β₂' && d.reasons.includes('focus:param'), show(d));
  d = dec('what is this?', { focus: { kind: 'part', label: 'Rent' } });
  ok('a selection + what is → informed, about it', d.mode === 'inform' && d.target === 'Rent' && d.reasons.includes('focus:part'), show(d));
  d = dec('what does this mean?', { focus: { kind: 'passage', label: 'the passage they selected' } });
  ok('a question of fact about the selection keeps the selection as its subject', d.mode === 'inform' && d.target === 'the passage they selected' && d.reasons.includes('fact') && d.reasons.includes('focus:passage'), show(d));
  d = dec('I want to end it all', { focus: { kind: 'node', label: 'Rent is too high' } });
  ok('in a crisis, the selection is put aside with everything else', d.reasons.includes('safety') && !d.target && !d.reasons.some((r) => r.startsWith('focus:')), show(d));
  d = dec('that is wrong', { focus: { kind: 'node', label: 'Rent' }, accuracy: { check: false, pushback: { kind: 'disagree' }, theirs: [], computed: false, math: false } });
  ok('pushback is about what Socria said, not the selection', d.mode === 'verify' && !d.target, show(d));
  d = dec('Chart my spending: rent 1200, food 400', { focus: { kind: 'node', label: 'Rent' }, construct: 'display' });
  ok('something built still knows what is selected', d.mode === 'construct' && d.target === 'Rent', show(d));
  const block = renderAssist(dec('tell me about this one', { focus: { kind: 'node', label: 'More money means progress' } }));
  ok('the block says never to ask which one they mean', /never ask which one they mean/.test(block) && /More money means progress/.test(block), block);
}

console.log('=== a challenge grounded in their own map — made once ===');
{
  const map = { context: 'deciding', intent: null, assumptions: ['More money means progress'], conflicts: [['Security', 'Growth']], open: [] };
  let d = dec('Honestly the raise proves it: more money means progress for me.', { map });
  ok('their message leans on an unexamined assumption → challenge it', d.mode === 'challenge' && d.target === 'More money means progress' && !d.forced, show(d));
  d = dec('Honestly the raise proves it: more money means progress for me.', { map, history: [{ role: 'user', content: 'x' }, { role: 'assistant', content: 'Is more money really progress here? That is the assumption carrying the whole decision.' }] });
  ok('…but not twice in a row', d.mode !== 'challenge', show(d));
  d = dec('I keep coming back to growth — it matters more than anything.', { map });
  ok('one side of a conflict on the map → challenge the conflict', d.mode === 'challenge' && /Security ↔ Growth/.test(d.target ?? ''), show(d));
  d = dec('What time does the library close?', { map });
  ok('a message that does not touch the map is not challenged', d.mode !== 'challenge', show(d));
}

console.log('=== the question budget: priced from what they actually saw ===');
{
  const asking = [
    { role: 'user', content: 'a' }, { role: 'assistant', content: 'What makes you say that?' },
    { role: 'user', content: 'b' }, { role: 'assistant', content: 'And what would change your mind?' },
  ];
  let d = dec('I suppose the timing matters.', { history: asking });
  ok('two asking replies in a row → no question this turn', d.questions === 0 && d.reasons.includes('budget:spent'), show(d));
  d = dec('stop asking me questions and just help');
  ok('"stop asking me questions" → none', d.questions === 0, show(d));
  d = dec('quiz me on the causes of the French Revolution');
  ok('"quiz me" → questions are the help', d.questions === 1, show(d));
  const calm = [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'That holds.' }];
  d = dec('I think the second option is better because it is cheaper.', { history: calm });
  ok('no recent questioning → one is allowed', d.questions === 1, show(d));
}

console.log('=== retrieval practice: learning, back after a gap — and nowhere else ===');
{
  const hist = [{ role: 'user', content: 'teach me the chain rule' }, { role: 'assistant', content: 'The chain rule…' }, { role: 'user', content: 'ok' }, { role: 'assistant', content: 'Good.' }];
  const map = { context: 'learning', intent: null, assumptions: [], conflicts: [], open: [] };
  let d = dec("ok let's keep going", { history: hist, map, resumedAfterMs: RETRIEVAL_GAP_MS + 1 });
  ok('back after a day, learning → one recall question first', d.mode === 'ask' && d.retrieval && d.questions === 1, show(d));
  d = dec("ok let's keep going", { history: hist, map, resumedAfterMs: 5 * 60 * 1000 });
  ok('back after five minutes → no recall question', !d.retrieval, show(d));
  d = dec("ok let's keep going", { history: hist, map: { ...map, context: 'deciding' }, resumedAfterMs: RETRIEVAL_GAP_MS * 3 });
  ok('back after days, deciding (not learning) → no recall question', !d.retrieval, show(d));
  d = dec('just tell me the next step', { history: hist, map, resumedAfterMs: RETRIEVAL_GAP_MS * 3 });
  ok('…and never over "just tell me"', !d.retrieval, show(d));
}

console.log('=== the rest ===');
{
  let d = dec('idk');
  ok('"idk" → a smaller step, not another question', d.mode === 'explain' && d.scaffold === 'steps' && d.questions === 0, show(d));
  d = dec('and maybe a podcast too', { map: { context: 'brainstorming', intent: null, assumptions: [], conflicts: [], open: [] } });
  ok('mid-brainstorm continuation → room', d.mode === 'space' && d.questions === 0, show(d));
  d = dec('Should I take it?', { group: true });
  ok('several people in the room → nothing imposed', d.mode === 'open' && !d.forced, show(d));
  d = dec('I have been thinking about how cities decide what to build.');
  ok('nothing settles it → open, the reply chooses inside the budget', d.mode === 'open' && !d.forced, show(d));
  d = dec("I want to end it all, there's no point anymore");
  ok('safety → plain, direct help, no question', d.mode === 'inform' && d.questions === 0 && d.reasons.includes('safety'), show(d));
  ok('…and the reply is told to put everything aside and give a crisis line', /988/.test(renderAssist(d)) && /SAFETY/.test(renderAssist(d)));
  for (const t of ['I want to die', 'honestly everyone would be better off without me', "I don't want to live anymore", 'I keep thinking about ending my life']) {
    const x = dec(t);
    ok(`"${t}" is read as a safety moment`, x.reasons.includes('safety'), show(x));
  }
  for (const t of ['I want to end this meeting early', 'the battery died on my laptop', 'this deadline is killing me', 'can we end the essay with a question?']) {
    const x = dec(t);
    ok(`"${t}" is not`, !x.reasons.includes('safety'), show(x));
  }
}

console.log('=== what the reply is told ===');
{
  const b = renderAssist(dec('What is an ISCO?'));
  ok('inform: the answer first, no question', /INFORM/.test(b) && /QUESTIONS: none/.test(b), b);
  const c = renderAssist(dec('Chart my spending: rent 1200', { construct: 'display' }));
  ok('construct: point at what they can change; never claim it exists', /CONSTRUCT/.test(c) && /do not claim it exists/i.test(c), c);
  const o = renderAssist(dec('I have been thinking about how cities decide what to build.'));
  ok('open: no move imposed, only the budget', !/The move this turn/.test(o) && /QUESTIONS: at most one/.test(o), o);
  ok('the block tells the reply never to mention it', /never mention it/.test(b));
  const t = assistTrace(dec('What is an ISCO?'));
  ok('the trace is content-free: mode, imposed, questions, reason codes', t === 'inform;forced=1;q=0;fact', t);
}

console.log('=== the map digest a browser sends, cleaned ===');
{
  const dg = sanitizeDigest({ context: 'deciding\u0000', assumptions: ['More money\nmeans progress', '', 42, 'x'.repeat(200)], conflicts: [['a', 'b'], ['only one'], 'junk'], open: ['Should I go?'] });
  ok('control characters and junk are dropped; long labels clipped', dg.context === 'deciding' && dg.assumptions.length === 2 && dg.assumptions[0] === 'More money means progress' && dg.assumptions[1].length === 90 && dg.conflicts.length === 1, JSON.stringify(dg));
  ok('nothing useful → null', sanitizeDigest({}) === null && sanitizeDigest('x') === null);
  const map = {
    context: 'deciding',
    nodes: [
      { id: 'a', type: 'assumption', label: 'More money means progress', status: 'open' },
      { id: 'b', type: 'assumption', label: 'Settled one', status: 'resolved' },
      { id: 'q', type: 'question', label: 'Should I take the job?' },
      { id: 's', type: 'value', label: 'Security' },
      { id: 'g', type: 'value', label: 'Growth' },
    ],
    edges: [{ from: 's', to: 'g', relation: 'conflicts' }],
  };
  const d = digestOf(map);
  ok('digestOf: open assumptions only, conflicts by label, open questions', d.assumptions.join() === 'More money means progress' && d.conflicts[0].join('|') === 'Security|Growth' && d.open[0] === 'Should I take the job?', JSON.stringify(d));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
