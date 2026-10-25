// READING THE ROOM — lib/cognition/register.ts and everything it feeds.
//
// What is held down:
//   • the exchange is read from their words: small talk, joking, something
//     personal, a brainstorm, a discussion, pushback, plain conversation, or a
//     task — and anything with work in it is a task;
//   • the readers that took a hello for work no longer do: "how are you" is not
//     a request to explain, "I got the internship" is not work to check, "how
//     are you doing today?" is not a lookup;
//   • the turn's block gives work its allocation and talk its own line, and
//     keeps what is theirs whatever the register;
//   • the move engine imposes no task's move on talk, and no recall quiz or
//     challenge on a hello or something personal;
//   • the stream gate keeps the help desk's lines from closing a reply, and
//     never sends an empty one;
//   • the core says who Socria is and what it is, and bans the stock lines.

import * as R from './.tmp/runtime-under-test.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 300))));
const J = JSON.stringify;
const U = (content) => ({ role: 'user', content });
const A = (content) => ({ role: 'assistant', content });
/** The whole state reader, as the route runs it: the work, then the exchange. */
const st = (text, history = [], o = {}) => R.readTurnState({ text, history, signals: R.readSignals(text), intent: R.routeTurn({ text }).intent, ...o });
const kind = (text, history = []) => st(text, history).exchange.kind;
const answered = [U('is a hot dog a sandwich?'), A('By most structural definitions, yes.')];

console.log('\n=== the exchange, read from their words ===');
for (const [t, k, h] of [
  ['hi, how are you?', 'social'],
  ['how are you feeling?', 'social'],
  ['how are you doing today?', 'social'],
  ['hey', 'social'],
  ["what's up?", 'social'],
  ['good morning :)', 'social'],
  ['thanks!', 'social', answered],
  ['ok cool, thanks', 'social', answered],
  ['no thanks, that is all', 'social', answered],
  ['bye, talk tomorrow', 'social', answered],
  ["i'm good, you?", 'social', answered],
  ["hey, I'm back!", 'social'],
  ['do you ever get bored?', 'social'],
  ["what's your favorite book?", 'social'],
  ['tell me a joke about economists', 'playful'],
  ['lol you sound like my thesis advisor', 'playful'],
  ['I got the internship!!', 'personal'],
  ["I'm kind of down today, my grandmother is in the hospital", 'personal'],
  ['ugh, long week. finally friday', 'personal'],
  ['I think I should quit the team but I feel guilty', 'personal'],
  ["let's brainstorm names for a coffee shop that's also a bookstore", 'brainstorm'],
  ['give me some ideas for a birthday gift for my dad', 'brainstorm'],
  ['what if we made it a subscription?', 'brainstorm'],
  ['do you think free will is compatible with determinism?', 'discussion'],
  ['are you conscious?', 'discussion'],
  ['I think social media is ruining attention spans', 'discussion'],
  ["no way, that's absurd. a sandwich needs two separate slices", 'disagreement', answered],
  ['are you sure?', 'disagreement', answered],
  ['but what about a taco?', 'disagreement', answered],
  ['I have been thinking about how cities decide what to build.', 'conversation'],
  ['why does my python list comprehension return a generator instead of a list?', 'task'],
  ['hi, can you help me tighten the intro of my essay?', 'task'],
  ['good morning! what is the capital of Peru?', 'task'],
  ["I'm so stressed, can you check my proof?", 'task'],
  ['what do you think of my plan to study abroad', 'discussion'],
  ['what do you think of my essay draft?', 'task'],
  ['do you think I should take the job in Berlin or stay?', 'task'],
  ['I think I should take the job in Berlin or stay here, help', 'task'],
  ['Is this right? I got x = 4', 'task'],
  ['plot y = sin(x)', 'task'],
])
  ok(`"${t}" → ${k}`, kind(t, h ?? []) === k, J(st(t, h ?? []).exchange));

console.log('\n=== conservative where it matters ===');
{
  ok('a hello with a question in it is the question', !R.smallTalk('hi, can you help me?') && !R.smallTalk('hey, what is the derivative of x^2?') && !R.smallTalk('what is up with my code'));
  ok('every clause has to be social, and the message short', R.smallTalk('hey there socria, how is your day going?') && R.smallTalk('haha thanks') && !R.smallTalk('thanks — now can you explain the second step?'));
  ok('"no" with nothing before it is not pushback: Socria has to have said something', kind("no way, that's absurd") !== 'disagreement' && kind("no way, that's absurd", answered) === 'disagreement');
  ok('"no thanks" is not pushback', kind('no thanks', answered) === 'social');
  const asked = [U('help me plan my week'), A('Happy to sketch it. Is this for school?')];
  ok('a bare "no" to a question Socria asked is an answer, not pushback', kind('no', asked) === 'conversation' && kind('nope', asked) === 'conversation');
  ok('"yes", "ok", "got it" once the conversation is under way carry it on — not small talk', kind('yes', asked) === 'conversation' && kind('ok', answered) === 'conversation' && kind('got it', answered) === 'conversation');
  ok('  the first "ok" of a conversation, with nothing before it, is still small talk', kind('ok') === 'social');
  ok('  and "thanks" is small talk wherever it comes', kind('thanks!', asked) === 'social');
  ok('"that\'s not what I meant" is a correction to re-read, not an argument', kind("that's not what I meant", answered) !== 'disagreement');
  ok('a feeling counts only when they said it: "I finished the report, can you check it?" carries none', st('I finished the report, can you check it?').exchange.saidFeeling === null);
  ok('  "I passed my driving test!" does', st('I passed my driving test!').exchange.saidFeeling === 'up');
  ok('a smile is friendliness, not a joke; a wink is', !st('good morning :)').exchange.joking && st('nice try ;)').exchange.joking);
  ok('asking about Socria is a question, not a remark about it', R.asksAboutSocria('how are you?') && R.asksAboutSocria('do you have feelings?') && !R.asksAboutSocria('you sound like my advisor') && !R.asksAboutSocria('do you have a recipe for bread?'));
  const keys = Object.keys(st('I feel awful today').exchange);
  ok('nothing in it labels the person — what they said this turn, and how they wrote it', !keys.some((k) => /personality|ability|mood|iq|emotion|label/i.test(k)), J(keys));
  const t0 = Date.now();
  for (let i = 0; i < 300; i++) R.smallTalk('hey hey hey hey hey hey hey hey hey hey hey hey you x');
  ok('cheap on the worst case: 300 adversarial reads in well under a second', Date.now() - t0 < 500, `${Date.now() - t0}ms`);
}

console.log('\n=== a greeting in front is not where the request begins ===');
{
  ok('the greeting comes off', R.withoutGreeting('good morning! what is the capital of Peru?') === 'what is the capital of Peru?' && R.withoutGreeting('hi, can you help me?') === 'can you help me?');
  ok('  and the lead-in', R.withoutGreeting('hey socria, quick question: what is 15% of 80?') === 'what is 15% of 80?');
  ok('  and nothing else', R.withoutGreeting('what is the capital of Peru?') === 'what is the capital of Peru?' && R.withoutGreeting('no, the second one.') === 'no, the second one.' && R.withoutGreeting('hi') === 'hi');
  ok('so a greeted fact is still a fact', st('good morning! what is the capital of Peru?').work === 'information');
  ok('a message that only asks about Socria has no work in it', R.onlyAboutSocria("how are you? what's your favorite book?") && !R.onlyAboutSocria("how are you? what's the capital of Peru?") && st("what's your favorite book?").work === 'conversation');
}

console.log('\n=== how they wrote it ===');
{
  ok('a few casual words are read as such', R.mannerOf('lol ok').casual && R.mannerOf('lol ok').words === 2);
  ok('  a careful sentence is not casual', !R.mannerOf('I have been thinking about how cities decide what to build.').casual);
}

console.log('\n=== the readers that took a hello for work ===');
{
  ok('"how are you feeling?" is not a request to explain', !R.wantsExplanation('how are you feeling?', R.readSignals('how are you feeling?')));
  ok('  "how does photosynthesis work?" still is', R.wantsExplanation('how does photosynthesis work?', R.readSignals('how does photosynthesis work?')));
  ok('"I got the internship!!" is not work offered for checking', !R.offersWork('I got the internship!!') && !R.offersWork('i got stuck on question 3'));
  ok('  "I got x = 4", "I got 12.5" and "I got the same answer" are', R.offersWork('I got x = 4') && R.offersWork('I got 12.5') && R.offersWork('I got the same answer as the book') && R.offersWork('check my working'));
  ok('the work kind of small talk is conversation', st('how are you doing today?').work === 'conversation' && st("what's up?").work === 'conversation');
  ok('"how are you doing today?" is not a lookup', R.webIntent('how are you doing today?', R.readSignals('how are you doing today?')).want === false);
  const need = R.assessNeed({ text: 'how are you doing today?', signals: R.readSignals('how are you doing today?'), docs: 0, math: false });
  ok('  and claims nothing current: no "nothing current was checked" block for a greeting', !need.kinds.includes('current') && !need.web.want, J(need));
  ok('  while "what is the weather today?" still wants a current answer', R.assessNeed({ text: 'what is the weather today?', signals: R.readSignals('what is the weather today?'), docs: 0, math: false }).kinds.includes('current'));
}

console.log('\n=== the move engine imposes nothing on talk ===');
{
  const dec = (text, o = {}) => R.chooseAssist({ lastUserText: text, history: o.history ?? [], guard: false, accuracy: null, focus: null, construct: null, map: o.map ?? null, resumedAfterMs: o.resumedAfterMs ?? null, group: false, signals: R.readSignals(text), exchange: o.exchange });
  ok("small talk: open, nothing forced — \"what's up?\" is not a fact to INFORM", dec("what's up?", { exchange: 'social' }).mode === 'open' && !dec("what's up?", { exchange: 'social' }).forced);
  const learning = { context: 'learning', intent: null, assumptions: [], conflicts: [], open: [] };
  const hist = [U('Teach me the chain rule.'), A('It differentiates a function inside a function.'), U('ok'), A('That is the whole idea.')];
  ok('a hello after a day away on something they were learning is not a recall quiz', !dec("hey, I'm back!", { exchange: 'social', map: learning, history: hist, resumedAfterMs: 2 * 86400000 }).retrieval);
  ok('  "ok, let\'s keep going" after the same day still is', dec("ok let's keep going", { exchange: 'conversation', map: learning, history: hist, resumedAfterMs: 2 * 86400000 }).retrieval);
  const map = { context: 'deciding', intent: null, assumptions: ['the defense will go badly'], conflicts: [], open: [] };
  ok('something personal is not an opening to challenge an assumption', dec("I'm dreading it, I'm sure the defense will go badly", { exchange: 'personal', map }).mode !== 'challenge');
  ok('  the same words in a discussion can be', dec('I am sure the defense will go badly', { exchange: 'conversation', map }).mode === 'challenge');
  ok('with a question allowed, the move says nothing about questions', !/QUESTIONS/.test(R.renderAssist(dec('I have been thinking about cities.'))));
}

console.log('\n=== the turn\'s block: work gets its allocation, talk gets its line ===');
{
  const block = (text, history = []) => {
    const state = st(text, history);
    const s = R.readSignals(text);
    const a = R.allocate({ state, signals: s, assist: { lastUserText: text, history, guard: false, accuracy: null, focus: null, construct: null, map: null, resumedAfterMs: null, group: false } });
    return R.renderAllocation(a, state);
  };
  const hi = block('hi, how are you?');
  ok('small talk: one line about the exchange — no "You do", no domain line', /Small talk, not a task/.test(hi) && !/You do:|useful answer first|arithmetic/.test(hi), hi);
  ok('  honesty about itself, when asked', /They asked about you/.test(hi));
  ok('  and a length cue from their own message', /short and casual/.test(hi));
  ok('a hard day: the person first, no tips', /Something hard/.test(block('my dog died this morning')), block('my dog died this morning'));
  ok('good news: glad with them, no next steps', /Good news/.test(block('I got the job!!')));
  ok('a joke asked for: a joke', /They want a joke/.test(block('tell me a joke')));
  const story = block('help me brainstorm a plot twist for my novel');
  ok('a brainstorm keeps Human-First: what they are writing stays theirs', /Brainstorming/.test(story) && /Theirs: the substance/.test(story), story);
  const decide = block('I feel sick about it — should I take the job in Berlin or stay?');
  ok('a decision inside something personal is still theirs', /Theirs: the decision/.test(decide), decide);
  const code = block('why does my python list comprehension return a generator instead of a list?');
  ok('a task keeps all of it: domain, who does what, the move', /senior engineer/.test(code) && /You do:/.test(code) && /EXPLAIN/.test(code), code);
  ok('  and no length cue — the work decides its length', !/so is the answer/.test(code));
  const deep = block('do you think free will is compatible with determinism?');
  ok('a short deep question is not told to answer in a line', /engage as a thinker/.test(deep) && !/so is the answer/.test(deep), deep);
  ok('plain conversation with nothing to say says nothing', block("I've been thinking about how cities grow.") === '', block("I've been thinking about how cities grow."));
}

console.log('\n=== the gate: the help desk does not close a reply ===');
{
  for (const s of ['How can I help you today?', 'Is there anything else I can help with?', 'What would you like to work on today?', "I'm here and ready to assist.", "I'd be happy to help.", 'What are you working on?', "I'm all ears."])
    ok(`"${s}" is an offer, not a question for them`, R.interrogatives(s).offers.length === 1, J(R.interrogatives(s)));
  ok('  a real question is still a question', R.interrogatives('How about you?').explicit.length === 1 && R.interrogatives('What made you pick that one?').explicit.length === 1);
  const run = (chunks, q, opts = { neverEmpty: true }) => {
    let sent = '';
    const g = new R.SentenceGate((s) => { sent += s; }, opts);
    for (const c of chunks) g.push(c);
    g.finish(q);
    return sent.trim();
  };
  ok('trailing help-desk lines are dropped, even with a question allowed', run(['Doing well — quiet day. ', "I'm here and ready to assist. ", 'How can I help you today?'], 1) === 'Doing well — quiet day.');
  ok('on Logos, a reply that was nothing but offers goes out as written rather than empty', run(['How can I help you today?'], 1) === 'How can I help you today?');
  ok('  but never a question over the budget — a limit they set holds even then', run(['What do you think? '], 0) === '' && run(["I'm here and ready to assist. ", 'What do you think?'], 0) === "I'm here and ready to assist.");
  ok('  and Core 4 keeps its own rule: a draft that is only a question it may not ask sends nothing', run(['Scroll up — what is the first line in red?'], 0, {}) === '' && run(['How can I help you today?'], 1, {}) === '');
}

console.log('\n=== the core: who Socria is, and what it is ===');
{
  const core = R.logos5System({ math: false, picture: false, build: false, guard: false });
  ok('a character, not a help desk', /WHO YOU ARE/.test(core) && /not a help desk, not a tutor running a lesson/.test(core));
  ok('the old framing is gone: not "a thinking partner for whatever someone is working on", not "make the next step obvious"', !/thinking partner for whatever someone is working on/.test(core) && !/make the next step obvious/.test(core));
  ok('it reads the room, kind by kind', /READ THE ROOM/.test(core) && /Small talk/.test(core) && /Joking around/.test(core) && /Something personal/.test(core) && /Brainstorming/.test(core) && /Ideas and big questions/.test(core));
  ok('the stock lines are named, and banned', /"I'm here to help"/.test(core) && /"How can I help you today\?"/.test(core) && /"I hope this helps"/.test(core));
  ok('no reflexive closing question', /most replies end on a statement/i.test(core) && /not as a habit|never as a habit/.test(core));
  ok('no template', /Don't fall into a template/.test(core));
  ok('what it is: no feelings claimed, no disclaimer recited', /ABOUT YOU/.test(core) && /Don't claim them/.test(core) && /don't recite a disclaimer/.test(core));
  ok('knowing their work is no reason to bring it up', /no reason to bring it up/.test(core));
  ok('Human-First, honesty and who-does-what are all still there', /WHO DOES WHAT/.test(core) && /the call is theirs/.test(core) && /NEVER INVENT A SOURCE/.test(core) && /Never agree because they insist/.test(core));
  ok('the persona says which version it is', R.PERSONA_VERSION === 'logos5-v3');
}

console.log(`\nruntime register: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
