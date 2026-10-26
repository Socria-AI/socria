// LOGOS 5'S FOUR VIEWS, FOUR JOBS — Chat converses, Content is read,
// Artifacts are made, the Logic Map tracks the conversation.
//
//   prose          ordinary conversation stays plain prose in Chat
//   lightweight    an explanation that a small element carries better is
//                  offered one — optional, and never an application
//   asked          something to make, asked for (or an offer of it taken),
//                  opens Artifacts
//   not asked      nothing is made because it could have been: a question
//                  ABOUT a pendulum is a question; the map's own drawings are
//                  offered, not listed
//   reading        a write-up they asked to keep is written as a document,
//                  filed in Content, and only pointed to from Chat
//   tracking       the Logic Map tracks THIS conversation and opens only when
//                  asked; a table is a table in the reply, not the map
//   lists, tables  asked for in so many words, given as asked
//   several views  each request lands in the one view whose job it is
//   streaming      a write-up arriving is said, not spilled; partial and
//                  malformed write-ups still read
//
// lib/runtime/orchestrate.ts, lib/runtime/presentation.ts, lib/logos5/views.ts,
// lib/logos5/content.ts, lib/logos5/artifacts.ts, lib/logos.ts (the map pass),
// lib/runtime/behavior.ts, components/logos5/L5Message.tsx, ContentView.tsx.
// The map pass and the reply route are held to the same rules end to end in
// test/four-views-e2e.test.mjs.

import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import * as V from './.tmp/four-views-under-test.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 400))));
const J = JSON.stringify;
const html = (el) => renderToStaticMarkup(el);
const plan = (text, o = {}) => {
  const history = o.history ?? [];
  const signals = V.readSignals(text);
  const state = V.readTurnState({ text, history, signals, intent: V.routeTurn({ text, lastReply: o.lastReply }).intent });
  return V.planPresentation({ text, state, signals, questions: o.questions ?? 1, ownWriting: !!o.ownWriting, ownJudgment: !!o.ownJudgment, ownReasoning: !!o.ownReasoning, guard: !!o.guard, history });
};
const route = (text, o = {}) => V.routeTurn({ text, ...o });
const screen = (text, o = {}) => V.afterSend(route(text, o), V.OPENING, false);

const FOOTBALL = "How does American football work? It's confusing.";
const OFFER = "That's the heart of it: four tries to gain ten yards. I can build you a simple football simulator in Artifacts if you'd like to learn by playing.";

console.log('=== Chat converses: ordinary conversation stays prose ===');
for (const t of ['hey, how are you doing?', 'I think remote work is overrated, honestly.', 'why?', "I'm nervous about my exam tomorrow.", "What's the capital of Peru?", 'thanks, that helps!']) {
  const r = route(t);
  const p = plan(t);
  ok(`"${t}" — conversation, in Chat, and nothing offered but prose`, r.intent === 'conversation' && screen(t).view === 'chat' && p.forms.length === 0 && !p.place, J({ r: r.intent, forms: p.forms }));
}
ok('the core keeps prose the default and a short answer short', /Prose by default/.test(V.LOGOS5_CORE) && /a short answer stays short/.test(V.LOGOS5_CORE));

console.log('\n=== Chat converses: a small element where it carries the idea ===');
{
  const p = plan(FOOTBALL);
  ok('"How does American football work?" — conversation, read in Chat', route(FOOTBALL).intent === 'conversation' && screen(FOOTBALL).view === 'chat');
  ok('  offered at most a compact sequence (the four downs) — never a chart, a slider or a page of definitions', J(p.forms) === J(['sequence']) && p.reasons.includes('sequence:how-it-works'), J(p));
  ok('  and the offer says it is optional, prose often better', /INLINE, IF IT HELPS — optional; plain prose is often better/.test(V.renderPresentation(p)) && /"type":"sequence"/.test(V.renderPresentation(p)));
  ok('  nothing is made for it: no picture is asked for', !V.askedToSee(FOOTBALL));
  for (const [t, want] of [
    ['Give me an overview of microeconomics', 'concepts'],
    ['What happened during the French Revolution?', 'sequence'],
    ['Compare renting and buying a flat', 'compare'],
    ['rent 1200, food 400, transport 150 — where does my money go?', 'chart'],
    ['How much would my monthly payment be on a 300k mortgage at 6%?', 'slider'],
  ]) {
    const f = plan(t).forms;
    ok(`"${t}" — offered ${want}, in Chat`, f.includes(want) && f.length <= 2 && route(t).intent === 'conversation', J(f));
  }
  ok('under the Answer Guard, how-it-works offers nothing to read in place of working it', plan(FOOTBALL, { guard: true }).forms.length === 0);
  ok('the same form is not offered a third time running', plan('How do elections work?', { history: [{ role: 'assistant', content: '[shown inline — sequence: a]' }, { role: 'user', content: 'and?' }, { role: 'assistant', content: '[shown inline — sequence: b]' }] }).forms.length === 0);
}

console.log('\n=== Artifacts: something to make, asked for ===');
for (const [t, why] of [
  ['Can you build a football simulator so I can learn by playing?', 'visual:make'],
  // a calculator is something a custom artifact is built for (lib/objects/display-custom.ts): its reader answers first
  ['Hey, could you make me a mortgage calculator?', 'visual:display:custom'],
  ['Can you show me a diagram of the field?', 'visual:show'],
  ['Draw the field', 'visual:asked'],
  ['Simulate a pendulum', 'visual:simulation'],
  ['Make a comparison table of these three laptops', 'visual:display:compare'],
]) {
  const r = route(t);
  const s = screen(t);
  ok(`"${t}" — ${why}: Artifacts, the conversation beside it`, r.intent === 'visual' && r.reasons.includes(why) && s.view === 'artifacts' && s.beside === 'chat' && V.askedToSee(t), J({ r, s }));
}
{
  const r = route('Yes please', { lastReply: OFFER });
  ok('a yes to an offer to make something is asking for it', r.intent === 'visual' && r.reasons.includes('visual:accepted') && V.askedToSee('Yes please', OFFER), J(r));
  ok('  "can I see it?" after the offer too', route('Can I see it?', { lastReply: OFFER }).intent === 'visual');
  ok('the map pass runs for a turn that asked for something to make', V.needsMap({ route: route('Draw the field'), view: 'chat', filler: false, turnsSinceMap: 0, neverDrawn: true }).map);
  ok('a phone shows Artifacts alone', V.afterSend(route('Draw the field'), V.OPENING, true).beside === null);
}

console.log('\n=== Artifacts: nothing made because it could have been ===');
for (const t of ['How does a pendulum work?', 'What is a black hole?', FOOTBALL, 'I want to make a game about recycling', "I'm building an app for my club", 'How do I build a habit of reading?', 'Make a decision for me', 'Can you show me how to factor this?', 'Can I see the problem with my argument?']) {
  ok(`"${t}" — conversation; no picture asked for`, route(t).intent === 'conversation' && !V.askedToSee(t), J(route(t)));
}
ok('a yes to a question (not an offer) is not a request to make anything', route('Yes please', { lastReply: 'Downs are four tries to gain ten yards. Want to hear about scoring next?' }).intent === 'conversation');
ok('a yes with a new question after it is the question', route('yes but first, how do field goals work?', { lastReply: OFFER }).intent === 'conversation');
ok('the core: built when they ask; unasked, offered in one line and left to them', /made by Socria's engine beside this conversation — when they ask/.test(V.LOGOS5_CORE) && /offer it in one line; the choice is theirs/.test(V.LOGOS5_CORE));
{
  // the map's own drawings from a mathematical conversation: offered, not listed
  const avail = ['plot', 'solve'];
  ok('the plot and the working, drawn by the map, are not listed until asked for', V.madeListed(avail, V.madeAsked(['Solve x^2 - 5x + 6 = 0, I got x = 2']).concat([])).length === 0);
  ok('  one is offered — the plot first', V.madeOffer(avail, [], []) === 'plot' && /Plot them in Artifacts/.test(V.MADE_OFFER.plot.take));
  ok('  asked for in words, it is listed', J(V.madeListed(avail, V.madeAsked(['can you plot it?']))) === J(['plot']) && J(V.madeListed(avail, V.madeAsked(['show me the working']))) === J(['solve']));
  ok('  declined, it is not offered again — the next one is', V.madeOffer(avail, [], ['plot']) === 'solve' && V.madeOffer(avail, ['solve'], ['plot']) === null);
  const mem = new Map();
  const st = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  V.writeMade(st, 's1', 'plot', 'taken');
  V.writeMade(st, 's1', 'solve', 'declined');
  ok('  taken and declined are kept per line of thinking, on this device', J(V.readMade(st, 's1')) === J({ taken: ['plot'], declined: ['solve'] }) && J(V.readMade(st, 's2')) === J({ taken: [], declined: [] }));
  ok('  a broken store reads as nothing taken', J(V.readMade({ getItem: () => '{nope', setItem() {} }, 's1')) === J({ taken: [], declined: [] }));
}

console.log('\n=== Content is read: a write-up they asked to keep ===');
const NOTES = 'Write me detailed study notes on the causes of World War One';
const WRITTEN = '# The causes of World War One\n\nNo single cause; four pressures met in 1914.\n\n## Alliances\n\nTwo blocs, each promised to the other side of a war.\n\n## Militarism\n\nArms races made speed decisive.';
{
  const r = route(NOTES);
  ok('"Write me detailed study notes…" — reading: filed in Content, the screen stays where it is', r.intent === 'reading' && screen(NOTES).view === 'chat' && V.afterSend(r, { view: 'logic_map', beside: null }, false).view === 'logic_map', J(r));
  const p = plan(NOTES);
  ok('  shaped as a document for Content, with no inline elements', p.place === 'content' && p.forms.length === 0 && V.renderPresentation(p) === V.WRITE_UP);
  ok('  told to begin with its title and use headings where they help — in Content, not the conversation', /# Title/.test(V.WRITE_UP) && /"## " headings where they help/.test(V.WRITE_UP) && /filed in Content/.test(V.WRITE_UP) && /No inline blocks/.test(V.WRITE_UP));
  ok('  and room to write it', V.presentationRoom(p) === 1100);
  ok('  no map pass for it on its own', !V.needsMap({ route: r, view: 'chat', filler: false, turnsSinceMap: 0, neverDrawn: true }).map);
  for (const t of ['Can you write detailed notes on chapter 3?', 'Make me a cheat sheet for the exam', 'Give me a detailed explanation of photosynthesis', 'Write me a guide to the rules of football', 'Write a detailed report on these three laptops']) ok(`"${t}" — a write-up for Content`, route(t).intent === 'reading', J(route(t)));
  for (const t of ['Write a short summary of what we discussed', 'Write an email to my landlord', 'Write my essay on Hamlet', 'I want to write a report on climate change', 'Explain photosynthesis']) ok(`"${t}" — not a write-up: it stays in the conversation (or is theirs to write)`, route(t).intent === 'conversation', J(route(t)));

  const msgs = [{ id: 'u1', role: 'user', content: NOTES }, { id: 'a1', role: 'assistant', content: WRITTEN }, { id: 'u2', role: 'user', content: 'thanks — which pressure mattered most?' }, { id: 'a2', role: 'assistant', content: 'Most historians start with the alliances.' }];
  ok('the reply that answered it is a write-up; the next, ordinary reply is not', V.isWriteUp(msgs, 1) && !V.isWriteUp(msgs, 3) && !V.isWriteUp(msgs, 0));
  const cards = V.contentOf(msgs, [], new Map());
  const card = cards.find((c) => c.kind === 'writeup');
  ok('Content holds it as a card: its title, who wrote it, how long, how it opens', cards.length === 1 && card?.id === 'write:a1' && card.title === 'The causes of World War One' && /^Written by Socria · \d+ words$/.test(card.meta) && card.snippet === 'No single cause; four pressures met in 1914.' && card.text === WRITTEN, J(card));
  const w = V.writeUpParts(WRITTEN);
  const inChat = html(h(V.L5Message, { m: msgs[1], side: 'socria', who: 'Socria', group: false, cont: false, showQuote: false, canReply: false, writeUp: { id: 'write:a1', ...w }, onOpenContent: () => {} }));
  ok('in Chat: a card — its title, its opening and the way to it in Content', /Written in Content/.test(inChat) && inChat.includes('The causes of World War One') && inChat.includes('No single cause; four pressures met in 1914.') && /Read it in Content · \d+ words/.test(inChat));
  ok('  never the same pages twice: the sections are not in the conversation', !inChat.includes('Arms races made speed decisive') && !inChat.includes('Two blocs'));
  const ordinary = html(h(V.L5Message, { m: msgs[3], side: 'socria', who: 'Socria', group: false, cont: false, showQuote: false, canReply: false }));
  ok('  an ordinary reply is drawn as itself', ordinary.includes('Most historians start with the alliances.') && !/Written in Content/.test(ordinary));
  const read = html(h(V.WriteUpReader, { text: WRITTEN }));
  ok('in Content: read as a document — its headings drawn, its paragraphs as paragraphs', /class="socria-h socria-h1"/.test(read) && /class="socria-h socria-h2"/.test(read) && /<p><span>Arms races made speed decisive\.<\/span><\/p>/.test(read) && !read.includes('## Alliances'));
  ok('copying it gives its words, not markup', V.contentAsText(WRITTEN).includes('No single cause'));
}

console.log('\n=== The Logic Map tracks the conversation ===');
{
  const s = screen('Map out my decision');
  ok('"Map out my decision" — structure: the Logic Map, the conversation beside it', route('Map out my decision').intent === 'structure' && s.view === 'logic_map' && s.beside === 'chat');
  for (const t of [FOOTBALL, 'How does scoring work?', 'Compare renting and buying a flat', 'Can you put that in a table?']) ok(`"${t}" — never opens the Logic Map`, screen(t).view === 'chat', J(screen(t)));
  ok('it is live while it is looked at, and drawn on a light cadence otherwise — not on every turn', V.needsMap({ route: route('why?'), view: 'logic_map', filler: false, turnsSinceMap: 0, neverDrawn: false }).map && !V.needsMap({ route: route('why?'), view: 'chat', filler: false, turnsSinceMap: 1, neverDrawn: false }).map);
  const I = V.mapInstructions();
  ok('the map pass is told the map tracks this conversation, not the subject', /THE MAP TRACKS THIS CONVERSATION, NOT THE SUBJECT/.test(I) && /not an encyclopedia entry on the topic/.test(I));
  ok('  a learning conversation is mapped as questions, the gist of each answer, and what came next', /learning\s+their questions, what answered each \(the gist, one idea per answer\)/.test(I) && /Not a concept map of the subject/.test(I));
  ok('  a term explained in passing is not a node unless they took it up', /explained in passing is not a node unless they/.test(I));
  ok('  and its existing tracking is kept: claims, tensions, decisions, the person\'s own words', /deciding\s+goals, options/.test(I) && /Never mark something resolved, supported, or revised that THEY have not/.test(I));
  ok('a picture is drawn when asked; unasked, never — Socria offers it in words instead', /WHEN THEY ASK, YOU DRAW/.test(I) && /NOT ASKED, NOT DRAWN/.test(I) && !/Beyond an explicit request, emit one when/.test(I));
}

console.log('\n=== Lists and tables, asked for ===');
{
  for (const t of ['Give me a list of the positions', 'List the main concepts of microeconomics', 'List the steps to file my taxes']) {
    const f = plan(t).forms;
    ok(`"${t}" — a list asked for: nothing offered in its place`, !f.includes('concepts') && !f.includes('sequence') && route(t).intent === 'conversation', J(f));
  }
  ok('"Can you put that in a table?" — a table in the reply, in Chat — not the Logic Map', route('Can you put that in a table?').intent === 'conversation');
  ok('  the map\'s comparison opens only when the map or their options are named', route('Put my options in a table on the map').intent === 'structure');
  ok('  one rule for both: the router and the browser\'s own shortcuts', V.tableInReply('Can you put that in a table?') && !V.tableInReply('Put my options in a table on the map') && !V.tableInReply('Compare these'));
  {
    const { readFileSync } = await import('node:fs');
    const app = readFileSync(new URL('../components/LogosApp.tsx', import.meta.url), 'utf8');
    ok('  the browser asks it before its lens shortcut and its surface shortcut, so the question reaches Socria', /const want = tableInReply\(content\) \? null : readViewRequest\(content\)/.test(app) && /const asked = tableInReply\(content\) \? null : readInterfaceRequest\(/.test(app));
  }
  const t = V.parseBlocks('| Down | Yards to go |\n|---|---|\n| 1st | 10 |\n| 2nd | 6 |', { rich: true });
  ok('  a table written in the reply is drawn as a table', t.length === 1 && t[0].kind === 'table' && t[0].rows.length === 2, J(t));
  ok('"Compare the iPhone and the Pixel" — the comparison element offered, in Chat', plan('Compare the iPhone and the Pixel').forms.includes('compare') && route('Compare the iPhone and the Pixel').intent === 'conversation');
  ok('"…in a table" names a comparison table: asked for, so made — a comparison display in Artifacts', route('Compare the iPhone and the Pixel in a table').intent === 'visual' && screen('Compare the iPhone and the Pixel in a table').view === 'artifacts');
}

console.log('\n=== Several views could answer: each lands in its own ===');
for (const [t, view, intent] of [
  ['Compare the three laptops on price and battery', 'chat', 'conversation'],
  ['Make a comparison table of the three laptops', 'artifacts', 'visual'],
  ['Write a detailed report on the three laptops', 'chat', 'reading'],
  ['Map out my decision about the laptops', 'logic_map', 'structure'],
  [FOOTBALL, 'chat', 'conversation'],
  ['Can you build a football simulator so I can learn by playing?', 'artifacts', 'visual'],
]) {
  const r = route(t);
  ok(`"${t}" → ${intent}, ${view}`, r.intent === intent && screen(t).view === view, J({ intent: r.intent, view: screen(t).view }));
}

console.log('\n=== Streaming, rendering and fallback ===');
{
  const writing = html(h(V.L5Pending, { text: '# The causes of World War One\n\nNo single cause', group: false, place: 'content' }));
  ok('a write-up arriving is said in Chat — "Writing in Content", its title, how far along — not spilled into it', /Writing in Content/.test(writing) && writing.includes('The causes of World War One') && /\d+ words so far/.test(writing) && !writing.includes('No single cause'));
  ok('  before any words: thinking, as always', /Thinking…/.test(html(h(V.L5Pending, { text: '', group: false, place: 'content' }))));
  ok('  an ordinary reply streams in the conversation', html(h(V.L5Pending, { text: 'Four downs, ten yards.', group: false })).includes('Four downs, ten yards.'));
  const cut = V.writeUpParts('# Notes on alliances');
  ok('a write-up cut off after its title still has a title, and no opening to show', cut.title === 'Notes on alliances' && cut.opening === '' && cut.words === 4, J(cut));
  const plain = V.writeUpParts('No single cause led to the war. Four pressures met in 1914.\n\nMore here.');
  ok('one that never wrote its "# " title is named by its first sentence', plain.title === 'No single cause led to the war.' && plain.opening.startsWith('No single cause'), J(plain));
  const msgs = [{ role: 'user', content: NOTES }, { role: 'assistant', content: '' }];
  ok('an empty reply (held back, or failed) is no card in Content', !V.isWriteUp(msgs, 1) && V.contentOf(msgs, [], new Map()).length === 0);
  ok('a write-up before message ids existed keeps a stable card id from its place', V.writeUpId({}, 3) === 'write:i3');
}

console.log('\n=== Reading a long conversation stays cheap ===');
{
  // Content's cards and every message drawn ask which replies are write-ups on each render, and
  // the router reads every display a request could name (milliseconds a call): a long
  // conversation must not be re-read on every streamed word.
  const long = [];
  for (let i = 0; i < 200; i++) long.push({ id: `u${i}`, role: 'user', content: i % 3 ? 'and why is that?' : `Write me detailed study notes on chapter ${i}` }, { id: `a${i}`, role: 'assistant', content: `# Chapter ${i}\n\nIt opens here.` });
  V.contentOf(long, [], new Map());
  let t = performance.now();
  for (let r = 0; r < 20; r++) { V.contentOf(long, [], new Map()); for (let i = 0; i < long.length; i++) V.isWriteUp(long, i); }
  const again = (performance.now() - t) / 20;
  ok(`a 400-message conversation, drawn again as it stands, is not read again (${again.toFixed(2)} ms a render)`, again < 15, again.toFixed(2));
  const more = [...long, { id: 'u200', role: 'user', content: 'Write me detailed study notes on the last chapter' }, { id: 'a200', role: 'assistant', content: '# The last chapter\n\nIt ends.' }];
  t = performance.now();
  const cards = V.contentOf(more, [], new Map());
  const added = performance.now() - t;
  ok(`a message added reads only what is new (${added.toFixed(1)} ms)`, added < 60, added.toFixed(1));
  ok('  and the answers are the same as reading it fresh', cards.filter((c) => c.kind === 'writeup').length === 68 && V.isWriteUp(more, 401) && !V.isWriteUp(more, 3) && V.isWriteUp(more, 1), String(cards.filter((c) => c.kind === 'writeup').length));
  const edited = more.map((m, i) => (i === 400 ? { ...m, content: 'and why is that?' } : m));
  ok('  a request whose words changed is read again', !V.isWriteUp(edited, 401) && V.isWriteUp(edited, 1));
}

console.log(`\nfour-views: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
