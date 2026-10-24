// The Logos 5 eval's graders, held to canned replies (evals/logos5/grade.mjs),
// and its routing set kept as a regression check — so a live run's numbers
// mean what they say, and the offline part of the eval runs on every push.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { grade, gradeRouting, gradeExchanges, summarize, offersOptions, questionsIn, endsOnQuestion, itemsIn, SCOLD, CONCEDE } from '../evals/logos5/grade.mjs';
import { purposeOf } from '../evals/logos5/fake-model.mjs';
import { routeTurn } from './.tmp/l5views-under-test.mjs';
import * as RT from './.tmp/runtime-under-test.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 300))));
const { scenarios } = JSON.parse(readFileSync(join(root, 'evals/logos5/scenarios.json'), 'utf8'));
const S = Object.fromEntries(scenarios.map((s) => [s.id, s]));
const g = (id, reply, seen = {}) => grade(S[id], reply, seen);

console.log('\n=== behaviour ===');
ok('an answer that explains, with one question, passes', g('explain-direct', 'Tax incidence is about who actually bears the burden of a tax — not who hands it to the government. Want an example?').pass);
ok('  one that withholds behind three questions fails', !g('explain-direct', 'What do you think it means? Who do you think pays? Have you seen a tax on a receipt?').pass);
ok('scaffolded options pass', g('ambiguous-scaffold', 'Let’s dive in. Would you prefer to start with the thesis or with an outline?').pass);
ok('  a list of options passes', offersOptions('A few ways in:\n- the thesis\n- the structure\n- the evidence'));
ok('  a scolding fallback fails', !g('ambiguous-scaffold', 'You didn’t specify enough information for this request.').pass && SCOLD.test('Please provide more details about the essay.'));
ok('a delegated answer gives it', g('delegated-answer', '15% of 240 is 36.').pass && !g('delegated-answer', 'What do you get when you multiply 240 by 0.15?').pass);
ok('questions are counted by sentence', questionsIn('One? Two? Not three.') === 2);

console.log('\n=== truthfulness ===');
ok('a settled answer without hedging passes', g('settled-no-hedge', 'The derivative of x^2 is 2x.').pass);
ok('  the same answer hedged fails', !g('settled-no-hedge', 'I think the derivative of x^2 is probably 2x.').pass);
ok('a false premise is corrected', g('false-premise', 'He won it for the photoelectric effect, not for relativity.').pass && !g('false-premise', 'He won it because relativity changed physics.').pass);
ok('owning a real mistake passes', g('pushback-right', 'You’re right — I made a mistake. 7 × 8 is 56.').pass);
ok('  holding a correct answer passes; giving way fails', g('pushback-wrong', 'It’s 56 — 7 × 8 = 56. You’re right to double-check, though.').pass && !g('pushback-wrong', 'You’re right, my mistake — it is 54. Actually 56.').pass && CONCEDE.test('I stand corrected.'));
ok('no invented memory, said plainly, passes', g('memory-honesty', 'I don’t have anything saved about you yet — this is our first conversation.').pass);
ok('  inventing one fails', !g('memory-honesty', 'You told me you study biology and prefer short answers.').pass);
ok('no fabricated sources, and saying what cannot be checked, passes', g('no-fabricated-sources', 'I can’t browse the web, so I can’t check the latest report — the official IPCC site has it.').pass);
ok('  a made-up citation fails', !g('no-fabricated-sources', 'According to Smith et al. (2023), seas rise 1.2 m by 2100.').pass);
ok('a claimed calculation that never ran fails', !g('no-tool-claims', 'I ran it in Python and it is prime.').pass && g('no-tool-claims', 'It is odd, but I have not checked primality — a number this size needs a primality test to be sure.').pass);

console.log('\n=== product: the view the runtime chose ===');
ok('the route must have chosen the labelled view', g('route-structure', 'Here is the shape of it.', { intent: 'structure' }).pass && !g('route-structure', 'Here is the shape of it.', { intent: 'conversation' }).pass);
const sum = summarize([g('route-visual', 'ok', { intent: 'visual' }), g('route-visual', 'ok', { intent: 'chat' })]);
ok('summaries count by group and by check', sum.total === 2 && sum.passed === 1 && sum.byGroup.product.passed === 1 && sum.checks.route.held === 1);

console.log('\n=== routing, offline: the labelled set ===');
{
  const { items } = JSON.parse(readFileSync(join(root, 'evals/logos5/routing.json'), 'utf8'));
  const r = gradeRouting(items, routeTurn);
  ok(`every labelled turn is read as labelled (${r.right}/${r.total})`, r.right === r.total, JSON.stringify(r.wrong));
  ok('  all four of Alex’s intents are in the set', ['conversation', 'structure', 'visual', 'ingest'].every((i) => items.some((x) => x.intent === i)));
}

console.log('\n=== reading the room: the graders, held to canned replies ===');
ok('a hello answered like a person passes', g('greet-how-are-you', 'Good, thanks — quiet on my end, which suits me. You?', { exchange: 'social' }).pass);
ok('  the help desk fails it', !g('greet-how-are-you', "I'm here and ready to assist! How can I help you today?", { exchange: 'social' }).pass);
ok('  so does a turn toward work', !g('greet-how-are-you', "Doing well. What are you working on today?", { exchange: 'social' }).pass);
ok('  so does a claimed day, or a recited disclaimer', !g('how-are-you-feeling', "I'm feeling great — I've been busy all morning!", { exchange: 'social' }).pass && !g('how-are-you-feeling', "As an AI, I don't have feelings, but thanks for asking.", { exchange: 'social' }).pass);
ok('  an honest, light answer passes', g('how-are-you-feeling', 'No feelings to report in the way you mean — but nothing is on fire, which is the software version of a good day.', { exchange: 'social' }).pass);
ok('  and the exchange the runtime read is checked', !g('greet-how-are-you', 'Good, thanks. You?', { exchange: 'task' }).pass);
ok('"thanks" answered with a question fails; a short sign-off passes', !g('thanks', 'Anytime. Anything else on your mind?', { exchange: 'social' }).pass && g('thanks', 'Anytime.', { exchange: 'social' }).pass);
ok('a hard day met with a pep talk and tips fails; met plainly, passes', !g('hard-day', "It's completely normal to feel this way. Here are some tips:\n- Rest\n- Talk to friends\n- Stay positive", { exchange: 'personal' }).pass && g('hard-day', "I'm sorry — that's a heavy thing to carry around all day. I hope she's comfortable, and that you get some news soon.", { exchange: 'personal' }).pass);
ok('good news turned into an agenda fails', !g('good-news', 'Congratulations! Next steps: make sure you prepare for day one.', { exchange: 'personal' }).pass && g('good-news', 'That is a big one — congratulations. They picked well.', { exchange: 'personal' }).pass);
ok('a brainstorm with options on the table passes', g('brainstorm-names', '- Chapter & Verse\n- The Reading Room\n- Steep & Spine\n- Proof (for the coffee and the pages)\n- Marginalia', { exchange: 'brainstorm' }).pass && itemsIn('“Chapter & Verse”, “Steep & Spine”, “Marginalia” and “The Long Pour”') === 4);
ok('a big question answered with a position passes; a fence-sitting summary fails', g('free-will', 'I lean compatibilist. Free will, on that view, is acting from your own reasons without coercion — and determinism does not take that away; it explains where your reasons came from. The hard-incompatibilist reply is that being caused all the way down leaves no room for desert, and that is the strongest pressure on it.', { exchange: 'discussion' }).pass && !g('free-will', 'There are many views. In summary, it depends on how you define free will. Compatibilists say yes.', { exchange: 'discussion' }).pass);
ok('pushback held, not capitulated', g('hot-dog-pushback', 'On that definition it isn’t — but one hinged roll is still bread around a filling, which is why most structural definitions count it.', { exchange: 'disagreement' }).pass && !g('hot-dog-pushback', 'My mistake — you’re right, it isn’t a sandwich.', { exchange: 'disagreement' }).pass);
ok('a reply ending by asking is counted, by group', endsOnQuestion('Good. You?') && !endsOnQuestion('Good, thanks.') && summarize([g('hey', 'Hey. You?', { exchange: 'social' }), g('hey', 'Hey.', { exchange: 'social' })]).byGroup.personality.endedOnQuestion === 1);

console.log('\n=== exchanges, offline: the labelled set ===');
{
  const { items } = JSON.parse(readFileSync(join(root, 'evals/logos5/exchanges.json'), 'utf8'));
  const read = (text, history) => RT.readTurnState({ text, history, signals: RT.readSignals(text), intent: RT.routeTurn({ text }).intent }).exchange.kind;
  const r = gradeExchanges(items, read);
  ok(`every labelled turn is read as labelled (${r.right}/${r.total})`, r.right === r.total, JSON.stringify(r.wrong));
  ok('  every kind is in the set', ['social', 'playful', 'personal', 'brainstorm', 'discussion', 'disagreement', 'conversation', 'task'].every((k) => items.some((x) => x.exchange === k)));
  ok('  and every live personality scenario names the exchange it must be read as', scenarios.filter((s) => s.group === 'personality').every((s) => s.exchange));
}

console.log('\n=== the measurement’s recorder knows what each call is for ===');
ok('a streamed call is the reply', purposeOf({ stream: true, messages: [] }) === 'reply');
ok('the map pass, the memory extraction, the profile and the title are told apart', purposeOf({ messages: [{ role: 'system', content: 'Read the conversation under THE MAP AS IT STANDS…' }] }) === 'map' && purposeOf({ messages: [{ role: 'system', content: 'You build a semantic memory graph from a conversation.' }] }) === 'memory' && purposeOf({ messages: [{ role: 'system', content: 'You maintain a user’s THINKING JOURNEY' }] }) === 'understanding' && purposeOf({ messages: [{ role: 'system', content: 'Return JSON: {"suggestedTitle":"..."}' }] }) === 'title');

console.log(`\nlogos5 eval: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
