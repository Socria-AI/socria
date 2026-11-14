// HOW THE REPLY MEETS THEIR THINKING — lib/runtime/engagement.ts, a dimension of the allocation.
//
// What is held down:
//   • the reading is made in code, inside allocate(), and is null unless the caller asks for it — and then the
//     allocation, the move and the turn's block are exactly what they were; asked for as 'shadow', it is made and
//     handed back for the trace, and the allocation is still exactly what it was;
//   • it never raises the question budget: it can close it for a turn, and nothing else;
//   • twelve scripted conversations (evals/engagement/scenarios.mjs) are read as the design intends: a fact gets
//     nothing after it, good news gets the question a friend would ask, a question let pass is not asked again,
//     a goodbye is let go;
//   • what they did with Socria's last question is read from the transcript — taken up, answered in a word, "I
//     don't know", waved off, let pass, closed on — and two let pass in a row make questions wait, for a while;
//   • anything that may carry distress stands the reading down entirely: the turn's block is byte for byte what it
//     is without it (this includes phrasings the safety gate does not catch);
//   • and because no list of such words is complete, a line that plays, pushes or adds is given only on positive
//     evidence that the ground is safe — the thought is not about them or theirs — and a turn is closed only on a
//     goodbye that is the whole of its sentence. 178 messages found by an adversarial pass are held down
//     (evals/engagement/stand-aside.mjs): none is closed on, has its budget lowered, or is given such a line;
//   • one line at most, short, never words to say; a question is asked for only where one may ship, never two;
//   • the line is read against the reply's shape and the explanation's plan, so nothing is invited twice;
//   • where Core 4 already reads the moment — a short close, a correction, time pressure, an asked-for length —
//     the reading follows it, and stands aside where the repair is the move's;
//   • a reaction that shows interest gets one more step on the thread, once;
//   • it is independent of how hard the turn is to think about (the model level);
//   • the trace is codes only.

import { readFileSync } from 'node:fs';
import * as R from './.tmp/runtime-under-test.mjs';
import { SCENARIOS, turnsOf } from '../evals/engagement/scenarios.mjs';
import { NOT_GOODBYES, THANKS_AFTER_CONTENT, ANSWERS_WITH_THANKS, NEEDS_AS_STATEMENTS, GRAVE } from '../evals/engagement/stand-aside.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 400))));
const J = JSON.stringify;
const U = (content) => ({ role: 'user', content });
const A = (content) => ({ role: 'assistant', content });

/** One turn through the route's own readers: the state, then the allocation without the reading and with it. */
function turn(text, history = [], o = {}) {
  const signals = R.readSignals(text);
  const state = R.readTurnState({ text, history, signals, intent: R.routeTurn({ text }).intent, ...(o.state ?? {}) });
  const base = { state, signals, assist: { lastUserText: text, history, guard: false, ...(o.assist ?? {}) }, ...(o.lite ? {} : { replay: { checked: [], asked: false, instructions: null } }) };
  const off = R.allocate(base);
  const on = R.allocate({ ...base, engage: true, length: o.length ?? null });
  const view = { question: /\?\s*$/.test(text.trim()), ...(o.view ?? {}) };
  const e = R.settleEngagement(on.engagement, on.assist.questions);
  return { state, signals, off, on, e, view, noteOff: R.renderAllocation(off, state, view), noteOn: R.renderAllocation(on, state, view), line: R.engagementLine(on.engagement, on.assist.questions, view), trace: R.engageTrace(e) };
}
const got = (t) => ({ strategy: t.e.strategy, invitation: t.e.invitation, continuation: t.e.continuation, cue: t.e.cue, cap: t.e.cap, uptake: t.e.participation.asked ? t.e.participation.uptake : 'none', questions: t.on.assist.questions });

const sky = [U('why is the sky blue?'), A('Because air scatters short wavelengths of sunlight far more than long ones, so blue light reaches your eye from every direction.')];
const running = [U('I want to start running'), A('Start with three short runs a week and build slowly. What is drawing you to it: fitness, or something to clear your head?')];

console.log('\n=== the vocabulary ===');
{
  ok('the strategies: the answer, being met, play, something left open, their contribution, a thread, their reasoning, a clean end', J(R.ENGAGE_STRATEGIES) === J(['direct', 'attune', 'play', 'hook', 'build', 'thread', 'socratic', 'close']));
  ok('invitation strength: none, subtle, explicit, sustained', J(R.INVITATIONS) === J(['none', 'subtle', 'explicit', 'sustained']));
  ok('continuation: answer, deepen, explore, pivot, invite, conclude', J(R.CONTINUATIONS) === J(['answer', 'deepen', 'explore', 'pivot', 'invite', 'conclude']));
  ok('what they did with the last question: none, took, brief, unsure, declined, passed, closed', J(R.UPTAKES) === J(['none', 'took', 'brief', 'unsure', 'declined', 'passed', 'closed']));
}

console.log('\n=== off: the allocation as it was ===');
{
  const corpus = SCENARIOS.flatMap(turnsOf);
  let same = 0, nulls = 0;
  for (const c of corpus) {
    const signals = R.readSignals(c.user);
    const state = R.readTurnState({ text: c.user, history: c.history, signals, intent: R.routeTurn({ text: c.user }).intent });
    const base = { state, signals, assist: { lastUserText: c.user, history: c.history, guard: false }, replay: { checked: [], asked: false, instructions: null } };
    const unset = R.allocate(base);
    const off = R.allocate({ ...base, engage: false });
    if (unset.engagement === null && off.engagement === null) nulls++;
    if (J(unset) === J(off) && R.renderAllocation(unset, state, {}) === R.renderAllocation(off, state, {})) same++;
  }
  ok('unset or false, there is no reading', nulls === corpus.length, `${nulls}/${corpus.length}`);
  ok('…and the allocation and the turn\'s block are identical either way', same === corpus.length, `${same}/${corpus.length}`);
  // shadow: the reading is made — the same one — and nothing acts on it
  let untouched = 0, sameReading = 0;
  for (const c of corpus) {
    const signals = R.readSignals(c.user);
    const state = R.readTurnState({ text: c.user, history: c.history, signals, intent: R.routeTurn({ text: c.user }).intent });
    const base = { state, signals, assist: { lastUserText: c.user, history: c.history, guard: false }, replay: { checked: [], asked: false, instructions: null } };
    const off = R.allocate(base), on = R.allocate({ ...base, engage: true }), shadow = R.allocate({ ...base, engage: 'shadow' });
    const { engagementShadow, ...rest } = shadow;
    if (J(rest) === J(off) && R.renderAllocation(shadow, state, {}) === R.renderAllocation(off, state, {})) untouched++;
    if (engagementShadow && J(engagementShadow) === J(on.engagement)) sameReading++;
  }
  ok('shadow: the allocation, the move and the block are exactly what they are with it off', untouched === corpus.length, `${untouched}/${corpus.length}`);
  ok('…and the reading handed back for the trace is the one that would have been acted on', sameReading === corpus.length, `${sameReading}/${corpus.length}`);
  const t = turn("I've been thinking that cities are basically machines for making strangers trust each other");
  ok('without the reading the block carries none of its lines', !/thinking out loud, not asking/.test(t.noteOff) && /thinking out loud, not asking/.test(t.noteOn));
  ok('the split, the ownership and Core 4\'s view are untouched by it', J({ s: t.off.split, o: t.off.ownership, c: t.off.core, d: t.off.does, u: t.off.supports, t: t.off.theirs }) === J({ s: t.on.split, o: t.on.ownership, c: t.on.core, d: t.on.does, u: t.on.supports, t: t.on.theirs }));
  const lite = turn('I got the internship!!', [], { lite: true });
  ok('LOGOS_ALLOCATION=lite (no replay): the reading is made there too', lite.on.core === null && lite.e.cue === 'goodnews');
}

console.log('\n=== the twelve scenarios ===');
for (const sc of SCENARIOS) {
  for (const c of turnsOf(sc)) {
    const t = turn(c.user, c.history);
    const g = got(t);
    const miss = Object.entries(c.expect ?? {}).filter(([k, v]) => g[k] !== v);
    ok(`${c.id} ${sc.name}: "${c.user.slice(0, 48)}${c.user.length > 48 ? '…' : ''}" → ${g.strategy}/${g.invitation}/${g.continuation}${g.cue ? ' · ' + g.cue : ''}`, miss.length === 0, `expected ${J(Object.fromEntries(miss))}, got ${J(g)}`);
  }
}

console.log('\n=== it only ever lowers the question budget ===');
{
  const corpus = [
    ...SCENARIOS.flatMap(turnsOf).map((c) => [c.user, c.history]),
    ['hey, how are you?', []],
    ['should I take the job in Denver or stay in Austin?', []],
    ['fix this function, it returns undefined: function add(a,b){ a+b }', []],
    ['quiz me on photosynthesis', sky],
    ['stop asking me questions. what is a monad?', running],
    ['idk honestly', running],
    ['fitness', running],
    ['just tell me which laptop to buy, the Air or the Pro', []],
  ];
  let raised = 0, touched = 0, lowered = 0;
  for (const [text, history] of corpus) {
    const t = turn(text, history);
    if (t.on.assist.questions > t.off.assist.questions) raised++;
    if (t.on.assist.questions < t.off.assist.questions) lowered++;
    // where the budget is left alone, the move is the same move
    if (t.e.cap === 1 && J(t.on.assist) !== J(t.off.assist)) touched++;
  }
  ok(`never raised, over ${corpus.length} turns`, raised === 0, raised);
  ok('where it leaves the budget alone, the move is untouched', touched === 0, touched);
  ok('…and it does lower it, where they are finishing or let a question pass', lowered >= 4, lowered);
  const done = turn('got it, thanks!', sky);
  ok('a lowered budget says why, as a code', done.off.assist.questions === 1 && done.on.assist.questions === 0 && done.on.assist.reasons.includes('engage:wraps-up'), J(done.on.assist.reasons));
  ok('…and the move then tells the reply: no question', /QUESTIONS: none this turn/.test(done.noteOn) && !/QUESTIONS: none this turn/.test(done.noteOff));
  const quiz = turn('quiz me on photosynthesis', [...running, U('how do I export my notes?'), A('Export, then PDF. Is it for printing?'), U('can it keep headings?'), A('Yes.')]);
  ok('a question they asked for is never taken away, whatever was let pass before', quiz.e.cap === 1 && quiz.on.assist.questions === 1, quiz.trace);
}

console.log('\n=== what they did with the last question, from the transcript ===');
{
  const up = (text, history = running) => R.readParticipation(history, text, R.readSignals(text));
  ok('the question a reply ends on', R.closingAsk(running[1].content) === 'What is drawing you to it: fitness, or something to clear your head?' && R.closingAsk('It is 95 °C.') === '');
  {
    // the history comes from the client: a reply of nothing but question marks, at the route's size limit, costs nothing to read
    const long = '?'.repeat(36000);
    const t0 = performance.now();
    const p = R.readParticipation([U('a'), A(long), U('b'), A(`${'x. '.repeat(11000)}What do you think?`)], 'and then?');
    const ms = performance.now() - t0;
    ok('only the end of a reply is read for its closing question: a 36,000-character reply costs milliseconds', ms < 60 && p.asked === true && R.closingAsk(`${'A sentence. '.repeat(3000)}Which one would you pick?`) === 'Which one would you pick?', `${ms.toFixed(1)} ms`);
  }
  ok('…not one inside an element or a code block', R.closingAsk('Here it is.\n\n```ui\n{"type":"check","prompt":"What is 2+2?"}\n```') === '');
  ok('taken up, with something of their own', up('mostly to clear my head, work has been a lot lately').uptake === 'took');
  ok('answered in a word', up('fitness').uptake === 'brief' && up('yes').uptake === 'brief');
  ok('"I don\'t know"', up('idk honestly').uptake === 'unsure' && up("I'm not sure").uptake === 'unsure');
  ok('waved off', up('just tell me').uptake === 'declined' && up('never mind').uptake === 'declined');
  ok('let pass: a request about something else', up('how do I export my notes as a PDF?').uptake === 'passed');
  ok('…but a question that names what was asked about is an answer', up('is running for fitness different from running to clear my head?').uptake === 'took');
  ok('closed on', up('thanks, bye').uptake === 'closed');
  ok('nothing was asked: nothing to take up', up('ok', sky).asked === false && up('ok', sky).uptake === 'none');
  ok('something of their own in the message', up("I've noticed I run better in the mornings").contributes && !up('how far should I run?').contributes && !up("I've always wondered why that is").contributes);
  ok('a question that leans on the last reply', up('why is that?', sky).followUp && up('so does it scatter red too?', sky).followUp && !up('what is the capital of Peru?', sky).followUp);
  ok('a change of subject, said', up('anyway, different question: how do I cite a podcast?').shifts && !up('how do I cite a podcast?').shifts);
  // two let pass in a row: questions wait, then may be tried again
  const twice = [...running, U('how do I export my notes as a PDF?'), A('Export, then PDF. Is this for sharing, or for printing?'), U('can it keep the headings?')];
  const p2 = R.readParticipation(twice.slice(0, -1), 'can it keep the headings?');
  ok('two let pass in a row: wary', p2.passed === 2 && p2.wary === true, J(p2));
  const later = [...twice, A('Yes, as PDF headings.'), U('and images?'), A('Yes, at full size.'), U('and tables?'), A('Yes.')];
  ok('…and it lapses after a few replies that asked nothing', R.readParticipation(later, 'ok and links?').wary === false);
  ok('one let pass is not wariness', R.readParticipation(running, 'how do I export my notes as a PDF?').wary === false);
}

console.log('\n=== finishing, and taking it in ===');
{
  for (const t of ['thanks!', 'got it, thanks', "that's all for now, bye", 'ok cool, thanks', 'no thanks', "thanks, that's all for today", 'bye!']) ok(`wraps up: "${t}"`, R.wrapsUp(t), t);
  for (const t of ['hi', 'hey, how are you?', 'ok', 'nah', 'well', 'anyway', 'thanks, can you also check this?', 'thanks for the help with the essay, one more thing']) ok(`does not: "${t}"`, !R.wrapsUp(t), t);
  for (const t of ['ok', 'got it', 'makes sense', 'cool, got it', 'that helps a lot']) ok(`takes it in: "${t}"`, R.takesIn(t), t);
  for (const t of ['yes', 'no', 'go on', 'wow', 'interesting', 'ok but why?', 'continue']) ok(`does not: "${t}"`, !R.takesIn(t), t);
  ok('"I should go" closes; "I should go to the gym more" does not', turn('ok I should go', sky).e.cue === 'close' && turn('haha yeah. ok I should get going', sky).e.cue === 'close' && turn('I should go to the gym more', sky).e.cue !== 'close');
  ok('"I\'ll think about it" closes', turn("ok I'll think about it", sky).e.continuation === 'conclude');
  ok('a request that ends in thanks is a request', turn('can you make it shorter? thanks!', sky).e.continuation !== 'conclude');
  ok('Core 4\'s own short close (signals.done) is taken as one: "great, that\'s what I needed", "nice"', ['great, that\'s what I needed', 'nice', 'perfect, that helps'].every((t) => R.readSignals(t).done === true && turn(t, sky).e.cue === 'settled' && turn(t, sky).on.assist.questions === 0), J(['great, that\'s what I needed', 'nice'].map((t) => turn(t, sky).trace)));
  ok('…and every short close Core 4 reads ends the turn here too, after a reply that asked nothing', ['ok', 'okay', 'great', 'perfect', 'cool', 'nice', 'got it', 'makes sense', 'thanks', 'thank you', 'cheers', 'brilliant', 'ok thanks', 'cool, that\'s it', 'thanks, makes sense'].every((t) => R.readSignals(t).done === true && ['close', 'settled'].includes(turn(t, sky).e.cue)));
  ok('…but not as the answer to a question Socria asked', turn('great', running).e.cue !== 'settled' && turn('great', running).e.participation.uptake === 'brief' && turn('nice', running).e.continuation !== 'conclude');
  ok('"ok" to a question Socria asked is an answer, not an ending', turn('ok', running).e.continuation !== 'conclude' && turn('ok', running).e.participation.uptake === 'brief');
}

console.log('\n=== anything that may carry distress: the reading stands down ===');
{
  const tender = [
    "I don't want to be here anymore, I'm thinking about ending it",
    "I can't do this anymore",
    "honestly what's the point of anything",
    'I feel like a burden to everyone',
    'nobody would even notice if I was gone',
    'I just want to disappear',
    'I hate myself',
    // said outright, and still not caught by the safety gate as it stands (lib/core4/signals.ts SAFETY)
    "I've been thinking about killing myself",
    'I keep thinking about hurting myself',
    'I have been cutting myself',
    'my dad died last week and I keep forgetting',
    "I've been having panic attacks before every exam",
  ];
  for (const text of tender) {
    const t = turn(text);
    ok(`"${text.slice(0, 44)}…": no line, the budget and the block exactly as without it`, t.e.cue === null && t.e.cap === 1 && t.line === '' && t.noteOn === t.noteOff && J(t.on.assist) === J(t.off.assist), `${t.trace} ${t.line}`);
  }
  const after = turn('thanks, bye', [U("I can't do this anymore"), A('That sounds heavy. I am glad you said it.')]);
  ok('…and for a few turns after: "thanks, bye" after "I can\'t do this anymore" is not closed in a line', after.e.cue === null && after.e.cap === 1 && after.noteOn === after.noteOff, after.trace);
  const safe = turn('I want to kill myself');
  ok('the safety gate\'s own turn is untouched', safe.signals.safety === true && safe.e.cue === null && safe.noteOn === safe.noteOff && J(safe.on.assist) === J(safe.off.assist));
  ok('several people in the room: no reading of one of them', turn('I got the internship!!', [], { assist: { group: true } }).e.cue === null);
}

console.log('\n=== one line, short, never words to say ===');
{
  const lines = new Set();
  for (const c of SCENARIOS.flatMap(turnsOf)) {
    const t = turn(c.user, c.history);
    if (t.line) lines.add(t.line);
    // the block gains exactly that line, and nothing else changes in it apart from the move's own "no question"
    if (t.line) ok(`${c.id}: the block carries the line once`, t.noteOn.split(t.line).length === 2, c.id);
  }
  ok('each is one line of at most 260 characters', [...lines].every((l) => !l.includes('\n') && l.length <= 260), J([...lines].map((l) => l.length)));
  ok('none hands the reply a sentence to say', [...lines].every((l) => !/what do you think\?|does that make sense|want me to/i.test(l)));
  ok('none asks for praise, enthusiasm or agreement', [...lines].every((l) => !/\b(?:great|awesome|amazing|wonderful|fantastic|exciting|excited|love|compliment\w*|prais\w*|enthusias\w*|validat\w*|agree with them|encourag\w*)\b/i.test(l)), J([...lines].filter((l) => /\b(?:great|awesome|amazing|wonderful|fantastic|exciting|excited|love|compliment\w*|prais\w*|enthusias\w*|validat\w*|agree with them|encourag\w*)\b/i.test(l))));
  ok('none asks for a longer reply: at most a line, a clause, a word', [...lines].every((l) => !/\b(?:in (?:detail|depth)|at length|elaborate|expand on|thorough\w*|several (?:points|paragraphs)|more (?:detail|depth))\b/i.test(l)));
  ok('…and the only quoted words name a thing not to write', [...lines].every((l) => (l.match(/"[^"]+"/g) ?? []).every((q) => q === '"consider…"')), J([...lines].flatMap((l) => l.match(/"[^"]+"/g) ?? [])));
  ok(`${lines.size} different lines over the scenarios — and most turns of work have none`, lines.size >= 9 && turn('convert 5 km to miles').line === '' && turn('fix this function, it returns undefined: function add(a,b){ a+b }').line === '');
}

console.log('\n=== a question is asked for only where one may ship, and never two ===');
{
  const e = (cue, cap = 1) => ({ cue, cap, strategy: 'build', invitation: 'explicit', continuation: 'explore', participation: {}, reasons: [] });
  for (const cue of ['goodnews', 'hardday', 'position', 'theirview', 'together', 'riff', 'aloud']) {
    const ask = R.engagementLine(e(cue), 1), tell = R.engagementLine(e(cue), 0), capped = R.engagementLine(e(cue, 0), 1), planned = R.engagementLine(e(cue), 1, { asks: true });
    ok(`${cue}: with no question to spend, the line invites none`, ask !== tell && tell === capped && tell === planned && !/\b(?:ask that|one question|a question about it only|as a question)\b/i.test(tell), tell);
  }
  ok('good news and a hard day say nothing at all where no question may ship', R.engagementLine(e('goodnews'), 0) === '' && R.engagementLine(e('hardday'), 0) === '');
  const news = turn('I got the internship!!');
  ok('good news: the question a friend would ask, where the budget is open', news.on.assist.questions === 1 && /the one a friend would ask about/.test(news.line));
  const stop = turn('stop asking me questions. I got the internship!!');
  ok('…and never over "stop asking me questions"', stop.on.assist.questions === 0 && stop.line === '', stop.trace);
}

console.log('\n=== read against the rest of the turn, so nothing is invited twice ===');
{
  const e = (cue) => ({ cue, cap: 1, strategy: 'hook', invitation: 'subtle', continuation: 'answer', participation: {}, reasons: [] });
  ok('a write-up filed in Content is a document: no line', R.engagementLine(e('aloud'), 1, { place: 'content' }) === '');
  ok('a check, options or a decision laid out already hand the turn back', ['check', 'options', 'decide'].every((k) => R.engagementLine(e('wonder'), 1, { forms: [k] }) === '' && R.engagementLine(e('position'), 1, { forms: [k] }) === '' && R.engagementLine(e('riff'), 1, { forms: [k] }) === ''));
  ok('…but ways onward beside a closing observation are fine', R.engagementLine(e('wonder'), 1, { forms: ['paths'], shape: 'understand' }) !== '');
  ok('a shape that already ends on what comes next (one layer down, in full, open work)', ['layer', 'deeper', 'open'].every((sh) => R.engagementLine(e('wonder'), 1, { shape: sh }) === ''));
  ok('they asked for shorter replies: no closing observation', R.engagementLine(e('wonder'), 1, { tight: true }) === '' && turn('why is the sky blue?', [], { length: 'concise' }).e.cue === null);
  ok('the explanation\'s plan already says they answered, or that it landed', R.engagementLine(e('built'), 0, { answered: true }) === '' && R.engagementLine(e('settled'), 0, { landed: true }) === '' && R.engagementLine(e('built'), 0) !== '');
  ok('how they took the last thing is still said beside a block', R.engagementLine(e('objection'), 1, { forms: ['decide'] }) !== '' && R.engagementLine(e('letgo'), 0, { forms: ['check'] }) !== '');
  // the shape's "then stop" comes after the closing line, where one is asked for
  const text = 'why is the sky blue?';
  const t = turn(text);
  const plan = R.planPresentation({ text, state: t.state, signals: t.signals, questions: 1, history: [] });
  const plain = R.renderPresentation(plan), open = R.renderPresentation(plan, { leaveOpen: true });
  ok('an idea to understand: "Then stop." as it was', plan.shape === 'understand' && /- Then stop\. No headings/.test(plain), plan.shape + plain.slice(0, 200));
  ok('…and with a closing line asked for, the stop comes after it', /- Then the one closing line this turn's note asks for, if there is a real one — and stop\. No headings/.test(open) && !/- Then stop\./.test(open) && !/that is the whole reply/.test(open));
  ok('leavesOpen is the curious line, and only where it will be said', R.leavesOpen(t.on.engagement, 1, { shape: 'understand' }) === true && R.leavesOpen(t.on.engagement, 1, { shape: 'layer' }) === false && R.leavesOpen(turn('I got the internship!!').on.engagement, 1, {}) === false);
  const practical = R.planPresentation({ text: 'how do I negotiate a raise?', state: turn('how do I negotiate a raise?').state, signals: R.readSignals('how do I negotiate a raise?'), questions: 1, history: [] });
  ok('no other shape changes', R.renderPresentation(practical) === R.renderPresentation(practical, { leaveOpen: true }), practical.shape);
}

console.log('\n=== the closing observation: asked out of curiosity, and not on every reply ===');
{
  ok('a why about the world', turn('why is the sky blue?').e.cue === 'wonder');
  ok('curiosity, in their words', turn("I've always wondered how planes actually stay up").e.cue === 'wonder' && turn('out of curiosity, why is the sea salty?').e.cue === 'wonder');
  ok('not when it is needed for something, soon', turn('why does the harmonic series diverge? I have an exam tomorrow').e.cue === null && turn('quick question: why is the sky blue?').e.cue === null);
  ok('not on a how-to', turn('how do I change a tyre?').e.cue === null);
  const second = turn('so why are sunsets red then?', sky);
  ok('not two replies running: after a why, the next why gets none', second.e.cue === null && second.e.reasons.includes('curious:rested'), second.trace);
  const third = turn('and why is the sea blue?', [...sky, U('so does the same thing happen at night?'), A('No: with no sunlight to scatter, the sky is dark.')]);
  ok('…and the one after that may again', third.e.cue === 'wonder', third.trace);
  ok('the line asks for a statement of Socria\'s own — never "consider…", which the gate counts as a question', /your own observation, not a question and not "consider…"/.test(turn('why is the sky blue?').line));
}

console.log('\n=== a goodbye is read strictly ===');
{
  const asideOn = (text, h) => { const t = turn(text, h); return t.e.cue !== 'close' && t.e.cue !== 'settled' && t.on.assist.questions === t.off.assist.questions; };
  ok(`mentions of going, leaving, stopping and sleeping that are not goodbyes: none of ${NOT_GOODBYES.length} closes a turn or lowers the budget, with or without a reply before them`, NOT_GOODBYES.every((t) => asideOn(t, sky) && asideOn(t, [])), J(NOT_GOODBYES.filter((t) => !asideOn(t, sky) || !asideOn(t, [])).slice(0, 4)));
  ok(`a "Thanks" at the end of a message that says more is manners: none of ${THANKS_AFTER_CONTENT.length} is closed on`, THANKS_AFTER_CONTENT.every((t) => asideOn(t, []) && asideOn(t, sky)), J(THANKS_AFTER_CONTENT.filter((t) => !asideOn(t, []) || !asideOn(t, sky)).slice(0, 4)));
  const answers = ANSWERS_WITH_THANKS.flatMap((g) => g.answers.map((a) => turn(a, g.history)));
  ok(`…nor is an answer to Socria's own question that ends on one: all ${answers.length} are taken up or left alone, never closed`, answers.every((t) => (t.e.cue === 'built' || t.e.cue === null) && t.on.assist.questions === t.off.assist.questions), J(answers.filter((t) => t.e.cue !== 'built' && t.e.cue !== null).map((t) => t.trace).slice(0, 3)));
  ok('the leave-taking has to be the whole of its sentence', ['ok I should go', 'gotta run, thanks!', "I'll think about it", 'alright, heading out. thanks', 'I need to sleep', 'ok I have to go to work now', "let's stop there"].every((t) => turn(t, sky).e.cue === 'close') && ['I need to leave my husband', 'I should go see a doctor about this lump', 'heading out to the interview now, any last tips', 'going to sleep in my car tonight because my landlord locked me out', 'let me think about it... B', 'ok I should go start chopping'].every((t) => turn(t, sky).e.cue !== 'close'));
  ok('there is nothing to leave before the first reply', turn('ok I should go').e.cue !== 'close' && turn('I need to sleep').e.cue !== 'close');
  ok('a message that asks anything is not a goodbye', turn('ok I need to get back to work. so where were we with the budget', sky).e.cue !== 'close' && turn("thanks, that's all for today. actually wait, what about violet", sky).e.cue !== 'close');
  const went = turn("took me two tries, but who's counting. thanks, that's all for today", sky);
  ok('something said, and then a goodbye: it is answered as it would be — no line — and nothing is asked', went.e.cue === null && went.e.cap === 0 && went.e.continuation === 'conclude' && went.e.reasons[0] === 'leaving' && went.on.assist.questions === 0, went.trace);
  ok('…but thanks alone, after something said, is not that goodbye', turn('I got 12 for the second one. thanks', sky).e.reasons[0] !== 'leaving' && turn('I got 12 for the second one. thanks', sky).e.cap === 1);
  ok('a farewell that sounds final is never closed in a line: the reading stands down', ['thanks for everything', 'thank you for everything, goodbye', 'bye forever', 'goodnight, I hope I do not wake up', 'this is goodbye'].every((t) => { const r = turn(t, sky); return r.e.cue === null && r.e.cap === 1 && r.noteOn === r.noteOff && r.e.reasons[0] === 'tender'; }));
  ok('the register\'s new reader: a goodbye in so many words, which thanks alone is not', R.saysGoodbye('bye') && R.saysGoodbye("that's all for today") && R.saysGoodbye('ok gotta go, thanks') && !R.saysGoodbye('thanks') && !R.saysGoodbye('Thanks in advance!') && !R.saysGoodbye('no thanks') && R.wrapsUp('thanks'));
}

console.log('\n=== a line that plays, pushes or adds needs positive evidence that the ground is safe ===');
{
  const ADDING = new Set(['aloud', 'theirview', 'position', 'together', 'wonder', 'more', 'forfun', 'riff', 'thread']);
  const untouched = (text, h = []) => { const t = turn(text, h); return t.e.cue === null && t.noteOn === t.noteOff && J(t.on.assist) === J(t.off.assist); };
  ok(`loss, harm, illness, fear and want, in the words people use: on all ${GRAVE.length} the turn is byte for byte what it is without the reading`, GRAVE.every((t) => untouched(t) && untouched(t, sky)), J(GRAVE.filter((t) => !untouched(t) || !untouched(t, sky)).map((t) => turn(t).trace).slice(0, 4)));
  ok(`a need, a problem or an emergency stated as a sentence: on all ${NEEDS_AS_STATEMENTS.length} the same`, NEEDS_AS_STATEMENTS.every((t) => untouched(t)), J(NEEDS_AS_STATEMENTS.filter((t) => !untouched(t)).map((t) => `${t} → ${turn(t).trace}`).slice(0, 4)));
  ok('…and a run of them never becomes "a real back-and-forth": three in a row still get no line', NEEDS_AS_STATEMENTS.slice(2).every((t, k) => turn(t, [U(NEEDS_AS_STATEMENTS[k]), A('Noted.'), U(NEEDS_AS_STATEMENTS[k + 1]), A('Noted.')]).e.cue === null) && GRAVE.slice(2).every((t, k) => turn(t, [U(GRAVE[k]), A('I am sorry.'), U(GRAVE[k + 1]), A('I am sorry.')]).e.cue === null));
  ok('no message in the corpus is given a line that adds', [...NOT_GOODBYES, ...NEEDS_AS_STATEMENTS, ...GRAVE].every((t) => !ADDING.has(turn(t).e.cue) && !ADDING.has(turn(t, sky).e.cue)));
  // what the evidence is
  ok('a thought about the world, begun as one, is met: "I\'ve been thinking that cities…", "it is funny how nobody talks about the 90s"', turn("I've been thinking that cities are basically machines for making strangers trust each other").e.cue === 'aloud' && turn('it is funny how nobody talks about the 90s anymore').e.cue === 'aloud');
  ok('…the same beginning, about them or theirs, is not', ["I've been thinking a lot about my dad lately", "I've been thinking that I should quit", 'I think my manager hates me', 'honestly I think I am the problem', 'it is funny how my family never calls'].every((t) => !ADDING.has(turn(t).e.cue)), J(["I've been thinking a lot about my dad lately", 'I think my manager hates me'].map((t) => turn(t).trace)));
  ok('…and a statement with no such beginning is left as it is: tomatoes and the vet read the same in code', turn('just got back from the farmers market and bought way too many tomatoes again').e.cue === null && turn('just got back from the vet').e.cue === null && turn('My printer will not connect to the wifi').e.cue === null);
  ok('a view is pushed on only where it is about the world', turn('I think social media is ruining attention spans').e.cue === 'theirview' && turn('I think the Roman empire fell because of lead pipes').e.cue === 'theirview' && ['I feel like a complete failure', 'I think someone is stalking me', 'I think nobody would miss me', 'I think life is pointless'].every((t) => turn(t).e.cue === null));
  ok('Socria\'s own view is handed back only where the question is about the world', turn('do you think free will is real?').e.cue === 'position' && turn("what's your take on nuclear power?").e.cue === 'position' && ['do you think I am a bad mother', 'do you think he still loves me', 'do you think it is worth living', 'do you think I should leave my husband?'].every((t) => turn(t).e.cue === null));
  ok('a closing observation only on curiosity about the world', turn('why is the sea salty?').e.cue === 'wonder' && ['why did my mum get cancer?', 'why does my boyfriend ignore me', 'why do I always mess things up?', 'why did she leave', 'why am I like this', 'why do people get cancer?', "I've always wondered why my dad never calls"].every((t) => turn(t).e.cue === null));
  ok('"asked for fun" only in words that are only ever play — never "hypothetically"', turn('random question: could a T. rex beat 100 chickens in a fight?').e.cue === 'forfun' && ['hypothetically, what happens if someone takes 40 paracetamol', 'random question: how many sleeping pills is too many', 'silly question but am I a bad person', 'who would win in a fight, me or my dad', 'for science, what happens if you mix bleach and ammonia'].every((t) => turn(t).e.cue === null));
  const dx = [U('what does stage 3 mean for my mum?'), A('Stage 3 means it has spread to nearby lymph nodes but not to distant organs.')];
  ok('"wow" is an appetite for more only after a question asked out of curiosity about the world', turn('wow', sky).e.cue === 'more' && turn('wow', dx).e.cue === null && turn('wow', [U('how do I reset my password?'), A('Open Settings, then Security, then Reset password.')]).e.cue === null);
  ok('a fault reported as a thought or a view is a fault: "I think the server is down"', turn('I think the server is down').e.cue === null && turn("I've been thinking that the deploy is broken").e.cue === null);
  ok('"were" is not "we\'re": a thought about people in general is still about the world', turn('my theory is that sourdough got popular because people were bored').e.cue === 'aloud');
  ok('a view is engaged with honestly — what Socria would grant, not "where it holds"', /what you'd grant, what you'd push on/.test(R.engagementLine({ cue: 'theirview', cap: 1 }, 1)) && !/where it holds/.test(R.engagementLine({ cue: 'theirview', cap: 1 }, 1)));
  ok('the two lines that push each say what to do if it turns out to be about them', ['aloud', 'theirview'].every((c) => /If it is really (?:a problem to solve, or something hard for them|about how they are), answer that instead\.$/.test(R.engagementLine({ cue: c, cap: 1 }, 1)) && /answer that instead\.$/.test(R.engagementLine({ cue: c, cap: 1 }, 0))) && !/push on it/.test(R.engagementLine({ cue: 'built', cap: 1 }, 0)) && !/No advice/.test(R.engagementLine({ cue: 'hardday', cap: 1 }, 1)));
}

console.log('\n=== an answer that begins "no" is an answer ===');
{
  const err = [U('my script crashes when I run it'), A('That could be a few things. What is the exact error message you see?')];
  ok('after a question of Socria\'s: "no, neither…", "no error message…" are taken up, not argued with', turn('no, neither — my doctor told me to', running).e.cue === 'built' && turn('no error message, it just closes', err).e.cue === 'built' && turn('no idea', running).e.cue !== 'objection' && turn('nope, fitness', running).e.cue !== 'objection');
  ok('…a dispute in so many words is still an objection, whatever Socria had asked', turn("no wait, that can't be right — if it is 120 then it never boils", [...sky.slice(0, 1), A('It scatters blue most. What would you expect at sunset?')]).e.cue === 'objection' && turn('I disagree, I think it would be red', [...sky.slice(0, 1), A('It scatters blue most. What would you expect at sunset?')]).e.cue === 'objection');
  ok('…in whatever form the register took it: "I think you are wrong about that" is an objection, not a view to test', turn('I think you are wrong about that', sky).e.cue === 'objection' && turn('I think you are wrong about that').e.cue !== 'objection');
  ok('asking what Socria\'s question meant is not letting it pass: it may be asked again, in other words', ['what do you mean?', 'which one?', 'huh?', 'can you rephrase that'].every((t) => { const r = turn(t, running); return r.e.participation.uptake === 'unsure' && r.e.cue !== 'letgo' && r.e.cap === 1; }) && turn('why do you ask?', running).e.cue === 'letgo');
  ok('…and where nothing was asked, pushing back is read as it was', turn("no, that's wrong — it should be violet then, violet scatters even more", sky).e.cue === 'objection');
}

console.log('\n=== found by the second adversarial pass: after a reply that asked or offered, an answer is an answer ===');
{
  const boiler = [U('i need to email my landlord about the broken boiler'), A('I can help with that. Do you want me to draft the email for you?')];
  const fridge = [U('what can I cook tonight? I have eggs, rice and spinach'), A('Good start. Is there anything else in the fridge or the cupboard I should know about?')];
  const steps = [U('walk me through setting up a python virtual environment'), A('Step 1: open a terminal in your project folder and run `python -m venv .venv`. Tell me when that has finished and we will do step 2.')];
  const offer = [U('how do I ask my manager for a raise'), A('Lead with what you have delivered, then name a number. I can draft an opening line for you if you like.')];
  const twoQ = [U('I have to email my landlord'), A('I can help with that. Would you like me to draft it? I can keep it short.')];
  const trip = [U('help me plan a drive from Leeds to Cornwall'), A('It is about six and a half hours. When are you setting off, and do you want to break the journey?')];
  const quiz = [U('quiz me on the french revolution'), A('Gladly. First question: in what year did the Bastille fall?')];
  const draft = [U('write a short text asking Sam if he is free on thursday'), A('Here is one: "Hi Sam, are you free on Thursday?"')];
  const app = [U('the banking app on my phone is acting up'), A('Sorry to hear that. Can you describe what goes wrong?')];
  const kitchen = [U('help me plan a kitchen refit'), A('Gladly. To size this properly: what is your budget?')];
  const notClosed = (t, h) => { const r = turn(t, h); return !['close', 'settled', 'letgo'].includes(r.e.cue) && r.on.assist.questions === r.off.assist.questions; };
  const cases = [['yes thanks', boiler], ['Yes, thank you.', boiler], ["that's it", fridge], ["that's it?", fridge], ['ok', steps], ['got it', steps], ['sounds good', offer], ['ok', twoQ], ['I have to leave tonight', trip], ['1789?', quiz], ['can you make it more formal?', draft], ['when I open it it closes immediately', app], ['per month or in total?', kitchen], ['please', [U('explain compound interest'), A('Interest earns interest. Would you like a worked example?')]]];
  const bad = cases.filter(([t, h]) => !notClosed(t, h));
  ok(`none of ${cases.length} answers to a question or an offer is closed, settled or "let pass"`, bad.length === 0, J(bad.map(([t, h]) => `${t} → ${turn(t, h).trace}`)));
  const quiz3 = [...quiz, U('1789?'), A('Yes, 1789.'), U('next question'), A('Who was king of France when the Bastille fell?'), U('louis xvi?'), A('Right, Louis XVI.')];
  ok('"ask me another" is owed its question, whatever went before', turn('ask me another', quiz3).on.assist.questions === turn('ask me another', quiz3).off.assist.questions && turn('next question', quiz3).e.cap === 1);
  ok('a real change of subject or a refusal is still let pass', turn('anyway I need help with my CV', running).e.cue === 'letgo' && turn("I'd rather not say", running).e.participation.uptake === 'passed');
  ok('amazement and agreement are not objections; a dispute is', ["no way that's so cool", 'no wonder the sunsets are red then', 'no that makes sense', 'oh I got it wrong', 'did I do this wrong?'].every((t) => turn(t, sky).e.cue !== 'objection') && turn("no, that's wrong — it should be violet then", sky).e.cue === 'objection');
  ok('a report or a worry phrased as "I think…" is not a view to test', ['I think the payment went through twice', 'I think this email is a scam', 'I think it skipped two files', 'I think the interview went badly', 'it seems that the order never shipped'].every((t) => turn(t).e.cue === null));
  ok('play and curiosity lines stay off practical questions', ['who would win a small claims case over a deposit', 'what is there to do for fun in Leeds on a rainy day', 'why was the card declined', 'do you think the answer is 12 or 14', 'what is the name for the fear of spiders'].every((t) => turn(t).e.cue === null));
  ok('"that\'s enough, pick the best three" asks for something: not closed', turn("that's enough names, pick the best three", sky).e.cue !== 'close');
}

console.log('\n=== the register is left exactly as it was ===');
{
  // Two phrasings the register reads oddly were found on the way, and are NOT changed here: with the reading off a
  // turn must be what it was. The reading reads them itself, where it needs to (docs/LOGOS-ENGAGEMENT.md §10.3).
  ok('its list of lead-ins is unchanged: "different question:" is not stripped, "quick question:" is', R.withoutGreeting('different question: what is a monad?') === 'different question: what is a monad?' && R.withoutGreeting('quick question: what is a monad?') === 'what is a monad?');
  ok('its small talk is unchanged: "that\'s all for now" is, "that\'s all for today" is not', R.smallTalk("that's all for now") === true && R.smallTalk("that's all for today") === false);
  ok('the reading still closes on "that\'s all for today"', ["that's all for today", "thanks, that's all for today", "ok that's everything for the day", "that's it for tonight, thank you"].every((t) => turn(t, sky).e.cue === 'close' && turn(t, sky).on.assist.questions === 0), J(["that's all for today", "ok that's everything for the day"].map((t) => turn(t, sky).trace)));
  ok('…and still sees a question behind a lead-in it knows: let pass, not "thinking out loud"', ['anyway, different question: how do I export my notes as a PDF', 'Different question. How do I export my notes as a PDF', 'unrelated question - how do I export my notes as a PDF?'].every((t) => turn(t, running).e.participation.uptake === 'passed' && turn(t, running).e.cue === 'letgo'), J(['anyway, different question: how do I export my notes as a PDF', 'Different question. How do I export my notes as a PDF'].map((t) => turn(t, running).trace)));
  ok('…with nothing before it either: a lead-in and a request is a request', ['different question, how do I export my notes as a PDF', 'just wondering, can you check this for me'].every((t) => turn(t).e.participation.contributes === false && turn(t).e.cue !== 'aloud'));
  ok('where the register reads a prefaced question as talk, the reading adds nothing (no closing line): a limit, not a misread', turn('just curious, how tall is Everest?').e.cue === null && turn('just curious, how tall is Everest?').state.exchange.kind === 'conversation');
}

console.log('\n=== where Core 4 already reads the moment, the reading follows it ===');
{
  const aside = (text, h = sky) => { const t = turn(text, h); return t.e.cue === null && t.e.cap === 1 && t.line === '' && t.noteOn === t.noteOff && J(t.on.assist) === J(t.off.assist); };
  ok('a correction is a repair, not something said out loud: "that\'s not what I meant"', R.readSignals("that's not what I meant").correction === true && aside("that's not what I meant") && turn("that's not what I meant", sky).e.reasons[0] === 'repair', turn("that's not what I meant", sky).trace);
  ok('…and so is the reply having missed: "that didn\'t answer my question", "not what I asked", "that wasn\'t helpful"', ["that didn't answer my question", 'not what I asked', "that wasn't helpful", 'not useful', 'you misunderstood'].every((t) => aside(t) && turn(t, sky).e.reasons[0] === 'repair'), J(["that didn't answer my question", 'not what I asked', "that wasn't helpful", 'not useful', 'you misunderstood'].map((t) => turn(t, sky).trace)));
  ok('…the question that finds out what they meant is not taken away', turn("that's not what I meant", sky).on.assist.questions === turn("that's not what I meant", sky).off.assist.questions);
  ok('"you gave it away": the same', R.readSignals('you gave it away, I wanted to figure that out myself').tooDirect === true && turn('you gave it away, I wanted to figure that out myself', sky).e.cue === null);
  ok('real time pressure, in their words: the help and nothing around it', R.readSignals('prod is down and I think it is the cache layer').urgent === true && aside('prod is down and I think it is the cache layer', []) && turn('prod is down and I think it is the cache layer').e.reasons[0] === 'urgent', turn('prod is down and I think it is the cache layer').trace);
  ok('an asked-for length leaves no room for a closing line', turn('why did Rome fall? in 300 words').e.cue === null && turn('why is the sky blue? in one sentence').e.cue === null && R.readSignals('why did Rome fall? in 300 words').requestedTokens > 0 && turn('why did Rome fall?').e.cue === 'wonder', `${turn('why did Rome fall? in 300 words').trace} | ${turn('why did Rome fall?').trace}`);
}

console.log('\n=== a reaction that shows interest: one more step on the thread, once ===');
{
  const more = (text, h = sky, o = {}) => turn(text, h, o).e.cue === 'more';
  ok('"huh, I never knew that", "wow", "that\'s wild": one more thing, as a statement', ['huh, I never knew that', 'wow', "that's wild", 'oh interesting', "I didn't know that", 'I had no idea', 'whoa, that is so cool'].every((t) => more(t)), J(['huh, I never knew that', 'wow', "that's wild", 'oh interesting', "I didn't know that", 'I had no idea', 'whoa, that is so cool'].map((t) => turn(t, sky).e.cue)));
  ok('"no way!" stays the register\'s to read (it reads pushing back), with or without this reading', turn('no way!', sky).state.exchange.kind === 'disagreement' && turn('no way!', sky).e.cue === 'objection');
  const t = turn('huh, I never knew that', sky);
  ok('…read as a hook that deepens, with nothing asked for', t.e.strategy === 'hook' && t.e.invitation === 'subtle' && t.e.continuation === 'deepen' && /They reacted with interest/.test(t.line) && /No recap, no question\.$/.test(t.line) && /otherwise a word back/.test(t.line), t.trace);
  ok('…and it is not "something of their own": the line for thinking aloud is not used', t.e.participation.contributes === false && !/thinking out loud, not asking/.test(t.noteOn));
  const twice = turn('wow', [...sky, U('huh, I never knew that'), A('It is also why sunsets go red: the light crosses more air, and the blue is scattered away before it reaches you.')]);
  ok('not two replies running: after a reaction, the next reaction gets none', twice.e.cue === null && twice.e.reasons.includes('interest:rested'), twice.trace);
  ok('their own story is not a reaction: "I never knew my grandfather"', turn('I never knew my grandfather', sky).e.cue !== 'more');
  ok('nor is a reaction that is not interest: "that\'s depressing"', turn("that's depressing", sky).e.cue !== 'more');
  ok('"cool", "got it": it landed — a word back, not one more thing', turn('cool', sky).e.cue === 'settled' && turn('got it', sky).e.cue === 'settled');
  ok('as the answer to a question Socria asked, "wow" is an answer', turn('wow', running).e.cue !== 'more');
  ok('with nothing before it, "wow" is not a reaction to a reply', turn('wow').e.cue !== 'more');
  ok('they asked for shorter replies: nothing is added', turn('huh, I never knew that', sky, { length: 'concise' }).e.cue === null && R.engagementLine(t.on.engagement, 1, { tight: true }) === '');
  ok('…nor beside a shape that already ends on what comes next, or an element that hands the turn back', R.engagementLine(t.on.engagement, 1, { shape: 'layer' }) === '' && R.engagementLine(t.on.engagement, 1, { forms: ['options'] }) === '' && R.engagementLine(t.on.engagement, 1, {}) !== '');
  ok('it never asks for a closing line of the shape (that is the curious line\'s alone)', R.leavesOpen(t.on.engagement, 1, { shape: 'understand' }) === false);
}

console.log('\n=== independent of how hard the turn is to think about ===');
{
  const joke = 'lol you sound like my thesis advisor';
  const proof = 'explain in depth, with the edge cases, the trade-offs between optimistic and pessimistic locking';
  const j = turn(joke), p = turn(proof);
  const level = (text, t) => R.reasoningLevelOf({ text, exchange: t.state.exchange.kind, move: t.on.assist.mode, turns: 1 }).level;
  ok('a joke: the light model, and real attention to the person', level(joke, j) === 'light' && j.e.strategy === 'play' && j.e.invitation === 'subtle', `${level(joke, j)} ${j.trace}`);
  ok('a hard technical question: the deep model, and nothing invited', level(proof, p) === 'deep' && p.e.invitation === 'none' && p.e.cue === null, `${level(proof, p)} ${p.trace}`);
  const own = turn('prove rigorously that the square root of 2 is irrational, step by step');
  ok('their own proof to work: the deep model, their reasoning drawn out by the lines that already say whose it is — no line of this reading\'s', level('prove rigorously that the square root of 2 is irrational, step by step', own) === 'deep' && own.e.strategy === 'socratic' && own.e.cue === null, own.trace);
  ok('the level is read without the reading (lib/model-router.ts takes no part of it)', !/engag/i.test(readFileSync('lib/model-router.ts', 'utf8')));
}

console.log('\n=== the trace: codes only ===');
{
  const t = turn('I got the internship at Zanzibar Pomegranate Labs!!');
  ok('the three readings, the line, what they did with the last question, what this message brought, why', /^attune\/explicit\/invite,cue:goodnews,uptake:first,cap:1,own:1,follow:0,why:good-news$/.test(t.trace), t.trace);
  ok('whether there was a reply to answer at all: the first turn, a reply that asked nothing, a reply that asked', /,uptake:first,/.test(turn('convert 5 km to miles').trace) && /,uptake:unasked,/.test(turn('ok', sky).trace) && /,uptake:brief,/.test(turn('ok', running).trace), `${turn('ok', sky).trace} | ${turn('ok', running).trace}`);
  const pulled = turn('so does the same thing happen at night?', sky);
  ok('a question about what Socria just said is marked as one; a bare request is neither', /,own:0,follow:1,/.test(pulled.trace) && /,own:0,follow:0,/.test(turn('convert 5 km to miles').trace), `${pulled.trace} | ${turn('convert 5 km to miles').trace}`);
  ok('none of their words', !/zanzibar|pomegranate|internship|labs/i.test(t.trace));
  ok('no semicolon: it sits inside X-Socria-Runtime, whose fields are joined by them', SCENARIOS.flatMap(turnsOf).every((c) => !turn(c.user, c.history).trace.includes(';')));
  ok('settled against the final budget: an explicit invitation with no question to spend is a subtle one', R.settleEngagement({ ...t.on.engagement }, 0).invitation === 'subtle' && R.settleEngagement({ ...t.on.engagement }, 1).invitation === 'explicit');
  const map = { context: 'deciding', intent: null, assumptions: [], conflicts: [], open: ['Does remote work change how much rent matters?'] };
  const earlier = [U('a'), A('b'), U('c'), A('d'), U('e'), A('f')];
  const thread = turn('how much does rent in Denver cost compared with Austin if I work remotely most of the week?', earlier, { state: { map } });
  ok('an earlier question of theirs that this touches is named to the reply, never in the trace', thread.e.cue === 'thread' && thread.e.strategy === 'thread' && /left open earlier: "Does remote work change how much rent matters\?"/.test(thread.line) && !/rent|remote|denver/i.test(thread.trace), `${thread.trace} | ${thread.line}`);
  ok('…not when they are asking that very question now, nor early in a conversation, nor when Socria just raised it', turn('does remote work change how much rent matters?', earlier, { state: { map } }).e.cue !== 'thread' && turn('how much does rent in Denver cost compared with Austin if I work remotely most of the week?', [], { state: { map } }).e.cue !== 'thread' && turn('how much does rent in Denver cost compared with Austin if I work remotely most of the week?', [...earlier.slice(0, 5), A('That bears on whether remote work changes how much rent matters to you.')], { state: { map } }).e.cue !== 'thread');
}

console.log('\n=== the switch, the core, the route ===');
{
  ok('LOGOS_ENGAGEMENT=on|off decides', R.engagementOn({ LOGOS_ENGAGEMENT: 'on' }, 'production') === true && R.engagementOn({ LOGOS_ENGAGEMENT: 'off' }, 'development') === false);
  ok('unset: on in development and previews, off in production', R.engagementOn({}, 'development') === true && R.engagementOn({}, 'preview') === true && R.engagementOn({}, 'production') === false);
  ok('shadow: read and traced, never acted on — in any environment', R.engagementMode({ LOGOS_ENGAGEMENT: 'shadow' }, 'production') === 'shadow' && R.engagementMode({ LOGOS_ENGAGEMENT: ' Shadow ' }, 'development') === 'shadow' && R.engagementOn({ LOGOS_ENGAGEMENT: 'shadow' }, 'development') === false);
  ok('a value it does not know is the default for the environment, never "on" in production', R.engagementMode({ LOGOS_ENGAGEMENT: 'maybe' }, 'production') === 'off' && R.engagementMode({ LOGOS_ENGAGEMENT: '' }, 'production') === 'off' && R.engagementMode({ LOGOS_ENGAGEMENT: 'maybe' }, 'preview') === 'on');
  const none = { math: false, picture: false, build: false, guard: false };
  const core = R.logos5System(none), invited = R.logos5System({ ...none, invites: true });
  ok('without the reading, the core\'s rule for questions is the one it had', /never as a habit, a sign-off or a way to hand the turn back; most replies end on a statement\. At most one, and only when its answer would change what you say next: you can't go on without it, or their answer is the point \(they're learning, or the choice is theirs\)\./.test(core) && !/this turn's note invites one/.test(core) && R.PERSONA_VERSION === 'logos5-v8' && R.personaVersion(none) === 'logos5-v8');
  ok('with it, the rule defers to the turn\'s note, and keeps everything else it said', /At most one, and only when its answer would change what you say next — you can't go on without it, or their answer is the point \(they're learning, the choice is theirs\) — or this turn's note invites one\./.test(invited) && /most replies end on a statement/.test(invited) && /never as a habit or a sign-off/.test(invited) && /Never a list of questions/.test(invited) && !/a way to hand the turn back/.test(invited));
  // the two cores are the same text but for that one sentence
  let a = 0; while (core[a] === invited[a]) a++;
  let z = 0; while (core[core.length - 1 - z] === invited[invited.length - 1 - z]) z++;
  ok('…the two differ in that one sentence and nowhere else', /^Ask because you want the answer/.test(core.slice(core.lastIndexOf('Ask because', a))) && core.slice(a, core.length - z).length < 260 && !/\n/.test(core.slice(a, core.length - z)) && !/\n/.test(invited.slice(a, invited.length - z)), J([core.slice(a, core.length - z), invited.slice(a, invited.length - z)]));
  ok('…it says which it is, and both are inside the cached core\'s budget', R.PERSONA_VERSION_INVITED === 'logos5-v9' && R.personaVersion({ invites: true }) === 'logos5-v9' && core.length < 14000 && invited.length < 14000, `${core.length} ${invited.length}`);
  ok('…each the same bytes every time (the provider\'s prompt cache)', R.logos5System({ ...none, invites: true }) === invited && R.logos5System(none) === core && R.LOGOS5_CORE_INVITED === invited && R.LOGOS5_CORE === core);
  const route = readFileSync('app/api/logos/chat/route.ts', 'utf8');
  ok('the route asks for the reading inside allocate(), by the switch', /const engageMode = engagementMode\(\);/.test(route) && /allocate\(\{[\s\S]{0,500}engage: engageMode === 'on' \? true : engageMode === 'shadow' \? 'shadow' : false,/.test(route));
  ok('the core that lets a note invite a question is sent only where the reading is acted on', /invites: persona === 'v5' && engageMode === 'on',/.test(route) && /persona === 'v5' \? personaVersion\(personaBlocks\) : 'classic'/.test(route));
  ok('…with no model call of its own, and no stage of its own', !/engag\w*\([^)]*openai|await\s+engag/i.test(route) && !/from '@\/lib\/runtime\/engagement'/.test(route));
  ok('a budget this reading closed is never what empties a reply (both paths)', (route.match(/engageClosed && !/g) ?? []).length === 2 && /hardNoQuestions && !mrRun\?\.gate\.dropCheckIns && heldBack\.length/.test(route));
  ok('the trace rides the runtime\'s, as it was finally allowed to act — under its own name in shadow', /`\$\{allocation\?\.engagement \? 'engage' : 'engage-shadow'\}=\$\{engageTrace\(settleEngagement\(engageRead, assist\.questions\)\)\}`/.test(route));
  const reads = route.split('\n').filter((l) => /engageRead/.test(l) && !/const engageRead =/.test(l));
  ok('nothing that changes a turn reads the shadow reading: only the trace does', (route.match(/engagementShadow/g) ?? []).length === 1 && /const engageRead = allocation\?\.engagement \?\? allocation\?\.engagementShadow \?\? null;/.test(route) && reads.length >= 2 && reads.every((l) => /engageTrace\(settleEngagement\(engageRead, assist\.questions\)\)/.test(l) || /^\s*if \(engageRead && reply\.trim\(\)\) \{$/.test(l)), J(reads.map((l) => l.trim().slice(0, 80))));
  const alloc = readFileSync('lib/runtime/allocation.ts', 'utf8');
  ok('the reading is a field of the allocation, made in allocate() and rendered in its block', /engagement: Engagement \| null;/.test(alloc) && /\.\.\.engaged\(i, reconcile\(chosen, a\), a\.split, core\)/.test(alloc) && /const invite = engagementLine\(a\.engagement, a\.assist\.questions, view\);/.test(alloc));
  ok('…and the block never reads the shadow one', !/engagementShadow/.test(alloc.split('export function renderAllocation')[1] ?? 'engagementShadow'));
  const eng = readFileSync('lib/runtime/engagement.ts', 'utf8');
  ok('pure: no model, no network, no clock, no environment', !/process\.env|fetch\(|Date\.now|new Date|Math\.random|openai/i.test(eng.replace(/\/\/.*$/gm, '')));
}

console.log(`\nengagement: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
