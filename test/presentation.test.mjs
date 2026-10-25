// INTELLIGENT PRESENTATION — the shape of a Logos 5 reply follows the shape of
// the thought, not the model's habit of lists.
//
// What is held down, by the categories it was asked for:
//    1. a general explanation is prose; a subject with several parts may be
//       offered an overview to explore (concepts), never forced one;
//    2. casual talk is offered nothing;
//    3. a list asked for in so many words is a list: nothing is offered in its
//       place, and the core prompt says to give one;
//    4. several related concepts: an overview to explore, with what each
//       connects to, taken further in the conversation or seen as a map;
//    5. a comparison: the comparison, not an overview;
//    6. mathematics: a slider for a quantity that moves; no steps laid out for
//       work that is theirs;
//    7. complex reasoning: the reasoning folded under its conclusion, and an
//       overview's "See how they connect" opens the Logic Map (rule D);
//    8. where UI would be unnecessary — a fact, a quick question, history told
//       as a story, writing they are making, a brainstorm, the Answer Guard —
//       nothing;
//    9. a malformed or unsupported element is nothing, or its sound part;
//   10. it streams whole or not at all, and reads as words everywhere a
//       picture cannot go.
//
// lib/runtime/presentation.ts (planPresentation), lib/inline-ui.ts (concepts,
// sequence), lib/runtime/behavior.ts (LOGOS5_CORE), components/inline/InlineUI.tsx.

import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import * as I from './.tmp/inline-under-test.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 400))));
const J = JSON.stringify;
const html = (el) => renderToStaticMarkup(el);
const fence = (o) => '```ui\n' + (typeof o === 'string' ? o : JSON.stringify(o)) + '\n```';
const ctx = (o = {}) => ({ theirs: '', sources: '', questions: 1, shown: { n: 0 }, ...o });
const plan = (text, o = {}) => {
  const history = o.history ?? [];
  const signals = I.readSignals(text);
  const state = I.readTurnState({ text, history, signals, intent: I.routeTurn({ text }).intent });
  return I.planPresentation({ text, state, signals, questions: o.questions ?? 1, ownWriting: !!o.ownWriting, ownJudgment: !!o.ownJudgment, ownReasoning: !!o.ownReasoning, guard: !!o.guard, history });
};
const forms = (t, o) => plan(t, o).forms;

const MICRO = {
  type: 'concepts',
  title: 'Microeconomics',
  items: [
    { name: 'Supply and demand', gist: 'How a price settles where sellers and buyers meet.', detail: 'Demand falls as price rises; supply rises with it.', links: ['Market structure', 'Elasticity'] },
    { name: 'Consumer behaviour', gist: 'How people choose with a limited budget.', links: ['Supply and demand'] },
    { name: 'Costs of production', gist: 'What one more unit costs a firm.' },
    { name: 'Market structure', gist: 'How many firms compete, and how much say each has.' },
    { name: 'Elasticity', gist: 'How strongly people react when the price moves.' },
  ],
};
const STEPS = { type: 'sequence', kind: 'steps', title: 'A budget', items: [{ label: 'Add up what comes in' }, { label: 'List the fixed costs', detail: 'Rent, phone, subscriptions.' }, { label: 'Set a weekly limit' }] };
const TIMELINE = { type: 'sequence', kind: 'timeline', items: [{ label: 'Estates-General', when: '1789' }, { label: 'Bastille', when: 'July 1789' }, { label: 'Republic', when: '1792' }] };

console.log('\n=== 1. a general explanation: prose, an overview offered only for a subject with parts ===');
for (const t of ['Give me an overview of microeconomics', 'What is microeconomics?', 'explain statistics', 'tell me about organic chemistry', 'What are the main branches of philosophy?'])
  ok(`a subject with parts is offered an overview to explore: "${t}"`, forms(t).includes('concepts'), J(plan(t)));
for (const t of ['Why did the Roman Republic fall?', 'Can you explain what tax incidence is?', 'what is inflation', 'how does a vaccine train the immune system?'])
  ok(`one idea, explained: prose, nothing offered: "${t}"`, !forms(t).includes('concepts'), J(plan(t)));

console.log('\n=== 2. casual talk: nothing ===');
for (const t of ['hi', 'hey, how is it going?', 'lol that is brilliant', 'thanks, that helped', 'I had the worst day at work'])
  ok(`"${t}": plain text`, forms(t).length === 0, J(plan(t)));

console.log('\n=== 3. a list asked for is a list ===');
for (const t of ['List the main concepts of microeconomics', 'give me a bulleted list of the key ideas in psychology', 'what are the steps to apply for a passport? just list them', 'enumerate the branches of philosophy'])
  ok(`nothing offered in place of the list: "${t}"`, !forms(t).some((k) => k === 'concepts' || k === 'sequence'), J(plan(t)));
ok('the core says a list is for what is one, or when they ask for one', /A list only when the content is one \(steps in order, things to gather\) or they ask for one/.test(I.LOGOS5_CORE));
ok('…prose is the default, and an explanation is never a list of bolded terms and definitions', /Prose by default/.test(I.LOGOS5_CORE) && /never bolded terms with definitions/.test(I.LOGOS5_CORE) && /A reply takes the shape of the thought/.test(I.LOGOS5_CORE));
ok('…no headings, no "Key points" or "In summary"', /Never # headings/.test(I.LOGOS5_CORE) && /No "Key points" or "In summary"/.test(I.LOGOS5_CORE));
ok('…and a short answer stays short', /a short answer stays short/.test(I.LOGOS5_CORE));
ok('…and the offer marker is never in the cached core (it travels only on a turn that is offered something)', !I.LOGOS5_CORE.includes('INLINE, IF IT HELPS'));
ok('the persona says it changed', I.PERSONA_VERSION === 'logos5-v3');

console.log('\n=== 4. several related concepts: an overview to explore ===');
for (const t of ['Explain the key concepts in statistics', 'teach me the basics of organic chemistry', 'What does macroeconomics cover?', 'give me an introduction to machine learning'])
  ok(`"${t}"`, forms(t).includes('concepts'), J(plan(t)));
const said = I.renderPresentation({ forms: ['concepts'], reasons: [] });
ok('its grammar: 3–7 parts, links to the others, the prose a short introduction that does not list them again', said.includes('"type":"concepts"') && said.includes('3–7 parts') && said.includes('Do not also list them'), said);
ok(`…short: ${said.length} characters`, said.length < 700, said.length);
ok('room for an overview in the reply ceiling, so it is never cut off and dropped: 700; steps 450', I.presentationRoom({ forms: ['concepts'] }) === 700 && I.presentationRoom({ forms: ['sequence'] }) === 450 && I.presentationRoom({ forms: ['chart'] }) === 350);
const both = I.renderPresentation({ forms: ['concepts', 'sequence'], reasons: [] });
ok(`…with a sequence beside it: ${both.length} characters`, both.length < 1000, both.length);

console.log('\n=== 5. a comparison: the comparison ===');
ok('"compare Python and JavaScript for a beginner": a comparison, not an overview', forms('compare Python and JavaScript for a beginner').includes('compare') && !forms('compare Python and JavaScript for a beginner').includes('concepts'));
ok('"what is the difference between mitosis and meiosis": not an overview', !forms('what is the difference between mitosis and meiosis').includes('concepts'));

console.log('\n=== 6. mathematics ===');
ok('a quantity that moves with what they can vary: a slider', forms('what would a 300k mortgage at 6% over 30 years cost me each month?').includes('slider'));
ok('"what is calculus?": a field with parts, so an overview may help', forms('what is calculus?').includes('concepts'));
ok('"solve 2x + 3 = 7": nothing laid out', forms('solve 2x + 3 = 7').length === 0, J(plan('solve 2x + 3 = 7')));
ok('steps to solve, when working it out is not theirs: steps', forms('what are the steps to solve a quadratic equation?').includes('sequence'));
ok('…when it is theirs (they are learning it): no steps', !forms('what are the steps to solve a quadratic equation?', { ownReasoning: true }).includes('sequence'));

console.log('\n=== 7. complex reasoning ===');
ok('a call Socria may weigh in on: the reasoning folded under its conclusion', forms('Should I refinance my mortgage at 5.5% if I plan to move in 3 years?').includes('reasoning'));
const mapAsk = `Map out how these connect: ${MICRO.items.map((x) => x.name).join(', ')}.`;
const routed = I.routeTurn({ text: mapAsk });
ok('"See how they connect" asks for the Logic Map in words: rule D, the map beside the conversation', routed.intent === 'structure' && routed.reveal?.view === 'logic_map', J(routed));
for (const t of ['What happened during the French Revolution?', 'what were the key events of the Cold War?', 'how did the internet evolve over time?'])
  ok(`events whose order is the point, in the conversation: a timeline may help: "${t}"`, plan(t).reasons.includes('sequence:timeline'), J(plan(t)));
ok('"give me a timeline of the French Revolution" is something to make: Artifacts answers it, nothing inline', I.routeTurn({ text: 'give me a timeline of the French Revolution' }).intent === 'visual' && forms('give me a timeline of the French Revolution').length === 0);
ok('how a process runs, step by step: steps', forms('how does a bill become law?').includes('sequence') && plan('how does a bill become law?').reasons.includes('sequence:steps'));

console.log('\n=== 8. where UI would be unnecessary ===');
for (const t of ["what's the capital of France?", 'how many ounces are in a pound?', 'tell me about the history of jazz in New Orleans', 'is it worth reading Dune?'])
  ok(`"${t}": nothing`, forms(t).length === 0, J(plan(t)));
ok('writing they are making ("write an overview of microeconomics for my essay"): no overview element', !forms('write an overview of microeconomics for my essay intro').includes('concepts'), J(plan('write an overview of microeconomics for my essay intro')));
ok('a brainstorm: nothing to explore, ideas in prose', !forms('brainstorm some ideas for a microeconomics project').includes('concepts'));
ok('under the Answer Guard: no overview to read instead of working, no steps, no timeline (the gate drops all three)', forms('Give me an overview of microeconomics', { guard: true }).length === 0 && !forms('how does a bill become law?', { guard: true }).includes('sequence') && !forms('What happened during the French Revolution?', { guard: true }).includes('sequence'));
ok('not the same overview a third time running', (() => {
  const shown = { role: 'assistant', content: `Here.\n\n${fence(MICRO)}` };
  const p = plan('give me an overview of macroeconomics', { history: [{ role: 'user', content: 'a' }, shown, { role: 'user', content: 'b' }, shown] });
  return !p.forms.includes('concepts') && p.reasons.includes('repeat-held');
})());

console.log('\n=== 9. malformed or unsupported: nothing, or its sound part ===');
const P = (o) => I.parseInlineSpec(J(o));
ok('an overview of two parts is a sentence, not an overview', P({ ...MICRO, items: MICRO.items.slice(0, 2) }) === null);
ok('a part with no name or no line is left out, and the same name twice is once', P({ ...MICRO, items: [...MICRO.items, { name: '', gist: 'x' }, { name: 'Elasticity', gist: 'again' }, { name: 'Taxes' }] })?.items.length === 5);
const linked = P({ ...MICRO, items: [{ ...MICRO.items[0], links: ['Elasticity', 'Nowhere', 'Supply and demand', 'elasticity'] }, ...MICRO.items.slice(1)] });
ok('a connection is to another part, named as it is named here: unknown and self links dropped, case kept to the part', J(linked.items[0].links) === J(['Elasticity']), J(linked.items[0].links));
ok('a part connected to nothing carries no links at all', !('links' in P({ ...MICRO, items: [{ ...MICRO.items[0], links: ['Nowhere'] }, ...MICRO.items.slice(1)] }).items[0]));
ok('more than seven parts: the first seven', P({ ...MICRO, items: Array.from({ length: 10 }, (_, i) => ({ name: `Part ${i}`, gist: 'a line' })) }).items.length === 7);
ok('long words are capped, never refused', P({ ...MICRO, items: MICRO.items.map((x) => ({ ...x, detail: 'word '.repeat(400) })) }).items.every((x) => x.detail.length <= 600));
ok('a timeline missing a date is steps, in the order given', P({ ...TIMELINE, items: [...TIMELINE.items, { label: 'Terror' }] })?.kind === 'steps' && !P({ ...TIMELINE, items: [...TIMELINE.items, { label: 'Terror' }] }).items.some((x) => 'when' in x));
ok('steps never carry dates', !P({ ...STEPS, items: STEPS.items.map((x) => ({ ...x, when: '1999' })) }).items.some((x) => 'when' in x));
ok('fewer than three in order is a sentence', P({ ...STEPS, items: STEPS.items.slice(0, 2) }) === null);
ok('an unknown kind of element is nothing', P({ type: 'mindmap', items: MICRO.items }) === null && P({ type: 'html', html: '<b>x</b>' }) === null);
ok('broken JSON through the gate is nothing at all', I.gateInlineBlock('```ui\n{"type":"concepts","items":[{"name":\n```', ctx()) === '');
const evil = html(h(I.RichText, { rich: true, text: fence({ ...MICRO, title: '<img src=x onerror=alert(1)>', items: [{ name: '<script>alert(1)</script>', gist: 'x' }, ...MICRO.items.slice(1)] }) }));
ok('words in an overview are words: nothing in one is markup', !evil.includes('<img src=x') && !evil.includes('<script>') && evil.includes('&lt;script&gt;'));
ok('under the guard the gate drops an overview and steps', I.gateInlineBlock(fence(MICRO), ctx({ guard: true })) === '' && I.gateInlineBlock(fence(STEPS), ctx({ guard: true })) === '');
ok('steps that are theirs to find are dropped; a timeline is not steps', I.gateInlineBlock(fence(STEPS), ctx({ ownReasoning: true })) === '' && I.gateInlineBlock(fence(TIMELINE), ctx({ ownReasoning: true })).includes('"timeline"'));
ok('LOGOS_INLINE=off (the route gates with nothing left to show): dropped', I.gateInlineBlock(fence(MICRO), ctx({ shown: { n: Infinity } })) === '');

console.log('\n=== 10. streaming, and the words it stands for ===');
const reply = `Microeconomics is choices made one market at a time.\n\n${fence(MICRO)}\n\nThe first two do most of the work.`;
for (const size of [1, 3, 7, 50]) {
  const out = [];
  const g = new I.SentenceGate((s) => out.push(s), { block: (chunk, open) => I.gateInlineBlock(chunk, ctx(), open), neverEmpty: true });
  for (let i = 0; i < reply.length; i += size) g.push(reply.slice(i, i + size));
  g.finish(0);
  const got = out.join('');
  ok(`streamed ${size} at a time: the words, then the overview whole and canonical`, got.startsWith('Microeconomics is choices') && got.includes(`\n${I.fenceOf(P(MICRO))}\n`) && /most of the work\.$/.test(got.trim()), J(got).slice(0, 300));
}
const cut = [];
const g3 = new I.SentenceGate((s) => cut.push(s), { block: (chunk, open) => I.gateInlineBlock(chunk, ctx(), open) });
g3.push('Four ideas carry it.\n\n```ui\n{"type":"concepts","items":[{"name":"Supply');
g3.finish(0);
ok('a reply that ends inside an overview keeps its words and drops the overview', cut.join('').trim() === 'Four ideas carry it.', J(cut.join('')));
const writing = html(h(I.StreamingRichText, { rich: true, text: 'Four ideas carry it.\n\n```ui\n{"type":"concepts","items":[{"name":"Sup' }));
ok('while it arrives: a quiet placeholder, never half a JSON', writing.includes('ln-pending') && !writing.includes('&quot;') && !writing.includes('```'));
const words = I.contentAsText(reply);
ok('copied, it is words: every part, its line and what it connects to', words.includes('Supply and demand: How a price settles') && words.includes('(connects to Market structure, Elasticity)') && !words.includes('```'), words);
const back = I.contentForHistory(reply);
ok('read back by the model: a short line, not the JSON', back.includes('[shown inline — concepts:') && !back.includes('"type"'), back);
ok('a timeline as words keeps its dates; steps their numbers', I.inlinePlainText(P(TIMELINE)).includes('July 1789: Bastille') && I.inlinePlainText(P(STEPS)).includes('2. List the fixed costs — Rent, phone, subscriptions.'));
const old = html(h(I.RichText, { text: reply }));
ok('a surface that does not draw elements shows the words, never JSON', old.includes('Supply and demand') && !old.includes('&quot;type&quot;') && !old.includes('```'));

console.log('\n=== drawn: an overview to explore ===');
{
  const a = html(h(I.RichText, { rich: true, text: fence(MICRO) }));
  ok('each part a card: its name and its line, pressable, saying whether it is open', (a.match(/class="ln-card(?: [^"]*)?"/g) ?? []).length === 5 && a.includes('aria-expanded="false"') && a.includes('How people choose with a limited budget.'));
  ok('…nothing open yet: no detail shown, an invitation to open one', a.includes('Open one to read more') && !a.includes('Demand falls as price rises'));
  ok('…no actions where nothing can be sent', !a.includes('Go deeper') && !a.includes('See how they connect'));
  const open = html(h(I.RichText, { rich: true, text: fence(MICRO), inline: { state: { 0: { picked: 0 } }, live: true, onChoose: () => {} } }));
  ok('opened: its fuller explanation, and the parts it connects to — either way — a press away', open.includes('Demand falls as price rises') && open.includes('Connects to') && open.includes('>Elasticity</button>') && open.includes('>Consumer behaviour</button>'), open.slice(0, 600));
  ok('…the connected parts lit on the cards', (open.match(/ln-card is-linked/g) ?? []).length === 3);
  ok('…and, on the latest reply, "Go deeper" and "See how they connect"', open.includes('Go deeper') && open.includes('See how they connect') && open.includes('1 of 5'));
  const pressed = [];
  ok('state kept with the message: the part opened', J(I.sanitizeInlineStateOne({ picked: 3 })) === J({ picked: 3 }) && I.sanitizeInlineStateOne({ picked: 40 }) === null);
  void pressed;
}

console.log('\n=== drawn: steps and a timeline ===');
{
  const s = html(h(I.RichText, { rich: true, text: fence(STEPS) }));
  ok('steps numbered, each with a box to tick it off, named for a screen reader', s.includes('ln-seq is-steps') && s.includes('aria-label="Done: step 1"') && s.includes('>1</span>') && s.includes('Tick each off as you go'));
  ok('…a step with more to say opens in place', s.includes('aria-expanded="false"') && !s.includes('Rent, phone, subscriptions.'));
  const done = html(h(I.RichText, { rich: true, text: fence(STEPS), inline: { state: { 0: { done: [0, 2], picked: 1 } } } }));
  ok('ticked and opened, kept: "2 of 3 done", the detail shown', done.includes('2 of 3 done') && done.includes('Rent, phone, subscriptions.') && (done.match(/is-done/g) ?? []).length === 2);
  ok('ticks cleaned: whole steps, once each, in order', J(I.sanitizeInlineStateOne({ done: [2, 0, 2, 9, -1, 'x'] })) === J({ done: [0, 2] }));
  const t = html(h(I.RichText, { rich: true, text: fence(TIMELINE) }));
  ok('a timeline: every event against its date, no boxes to tick', t.includes('ln-seq is-timeline') && t.includes('July 1789') && !t.includes('type="checkbox"'));
}

console.log(`\npresentation: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
