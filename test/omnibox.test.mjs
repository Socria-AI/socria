// ONE INPUT (Logos 6, November 2026; docs/OMNIBOX.md).
//
// What is held down:
//   • a THOUGHT is captured as theirs, with no reply — only from words that plainly offer a view, never a question, a
//     request, an answer to Socria's question, files, or something said about the conversation itself;
//   • a NOTE goes on the selected card;
//   • a CONNECTION is found among their own cards and proposed — or they are asked which, when more than one fits;
//   • an ORGANISATION is proposed from the lines already on the map, and applying it moves cards without copying any;
//   • a MILESTONE is theirs to add and tick;
//   • everything else goes the way it always went — this is no second router.

import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import * as X from './.tmp/omnibox-under-test.mjs';

let pass = 0,
  fail = 0;
const ok = (name, cond, extra = '') => (cond ? (pass++, console.log('  ok   ' + name)) : (fail++, console.log('  FAIL ' + name + (extra ? '  ' + String(extra).slice(0, 400) : ''))));
const J = JSON.stringify;
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const nodes = [
  { id: 'a1', label: 'Students outsource thinking to AI', type: 'claim', hand: true },
  { id: 'q1', label: 'Why does dependency happen?', type: 'question' },
  { id: 'e1', label: 'Survey: 60% copy answers', type: 'evidence', origin: 'source' },
  { id: 'a2', label: 'AI makes students too dependent on answers', type: 'claim', hand: true },
];
const ctx = (o = {}) => ({ asked: false, selected: null, nodes, ...o });

console.log('\n=== a thought, captured as theirs ===');
{
  const t = X.readOmnibox('I think AI makes students too dependent on answers.', ctx({ nodes: [] }));
  ok('“I think AI makes students too dependent on answers.” → their claim, in their words, no reply', t.kind === 'thought' && t.label === 'AI makes students too dependent on answers' && t.type === 'claim', J(t));
  ok('“Idea: grade the process, not the answer” → an idea', X.readOmnibox('Idea: grade the process, not the answer', ctx()).kind === 'thought');
  ok('“Maybe dependency is a habit, not a choice.” → an idea', X.readOmnibox('Maybe dependency is a habit, not a choice.', ctx()).type === 'idea');
  ok('“I assume most students use it daily.” → an assumption', X.readOmnibox('I assume most students use it daily.', ctx()).type === 'assumption');
  const answered = [
    ['Why does AI dependency happen?', 'a question'],
    ['I think AI makes students dependent, right?', 'a question in its tail'],
    ['I think AI makes students dependent — can you explain why?', 'a request'],
    ['Explain derivatives to me', 'an instruction'],
    ['I think I get it now', 'said about the conversation'],
    ['I think you’re right about the chain rule', 'said to Socria'],
    ['Maybe we should start with chapter 3', 'something to do together'],
    ['AI makes students too dependent on answers.', 'a bare statement, with no opener'],
    ['I think it has to do with opportunity cost. I want to explore how scarcity, trade-offs and cost connect. Where do I start?', 'a paragraph with a question'],
  ];
  for (const [t, why] of answered) ok(`answered as always: ${why} — “${t}”`, X.readOmnibox(t, ctx()).kind === 'chat', J(X.readOmnibox(t, ctx())));
  ok('an answer to Socria’s question is answered, not filed', X.readOmnibox('I think it is because of habit formation', ctx({ asked: true })).kind === 'chat');
  ok('…as is anything while a quiz or a guess waits, or with files attached', X.readOmnibox('I think it is because of habit formation', ctx({ awaiting: true })).kind === 'chat' && X.readOmnibox('I think this paper is wrong about habit', ctx({ attaching: true })).kind === 'chat');
  ok('Socria asked them something when its reply ends on a question (or its thread note says so)', X.replyAsked('Good. What does that number mean geometrically?') && !X.replyAsked('The derivative is the slope.') && X.replyAsked('Fine.', 'q'));
}

console.log('\n=== a note on the selected card ===');
{
  const n = X.readOmnibox('Note: the professor stressed this twice', ctx({ selected: { id: 'a2', label: 'AI makes students too dependent on answers' } }));
  ok('“Note: …” with a card selected → a note on that card', n.kind === 'note' && n.target.id === 'a2' && n.text === 'the professor stressed this twice', J(n));
  const loose = X.readOmnibox('Note: the professor stressed this twice', ctx());
  ok('…with nothing selected it is kept as a thought of theirs instead', loose.kind === 'thought' && loose.label === 'The professor stressed this twice', J(loose));
}

console.log('\n=== a connection, proposed ===');
{
  const c = X.readOmnibox('Connect this to my earlier argument', ctx({ selected: { id: 'a2', label: '' } }));
  ok('“Connect this to my earlier argument”: this = the selected card; their earlier argument found', c.kind === 'connect' && c.from?.id === 'a2' && c.to?.id === 'a1' && c.relation === 'relates', J(c));
  const c2 = X.readOmnibox('Connect this to my earlier argument', ctx());
  ok('…with nothing selected, “this” is their newest card', c2.kind === 'connect' && c2.from?.id === 'a2' && c2.to?.id === 'a1', J(c2));
  const c3 = X.readOmnibox('Link the survey to students outsourcing thinking as support', ctx());
  ok('named in words, and the kind of line said: support', c3.kind === 'connect' && c3.from?.id === 'e1' && c3.to?.id === 'a1' && c3.relation === 'supports', J(c3));
  const many = [...nodes, { id: 'a3', label: 'Teachers redesign homework', type: 'claim', hand: true }];
  const c4 = X.readOmnibox('Connect this to my earlier argument', ctx({ nodes: many, selected: { id: 'a3', label: '' } }));
  ok('more than one fits: no line yet — they are asked which, the newest first', c4.kind === 'connect' && c4.to === null && c4.candidates.length >= 2 && c4.candidates[0].id === 'a2', J(c4));
  ok('…and their answer picks one: “the second”, “2”, or its words', X.pickCandidate('the second', c4.candidates)?.id === c4.candidates[1].id && X.pickCandidate('2', c4.candidates)?.id === c4.candidates[1].id && X.pickCandidate('outsource thinking', c4.candidates)?.id === 'a1');
  ok('“contradicts” → a line of tension', X.readOmnibox('Connect this to the survey as something that contradicts it', ctx()).relation === 'conflicts');
  ok('nothing to connect with fewer than two cards', X.readOmnibox('Connect this to my earlier argument', ctx({ nodes: nodes.slice(0, 1) })).kind === 'chat');
}

console.log('\n=== an organisation, proposed from the graph ===');
{
  ok('“Organize these ideas into a hierarchy” → proposed', X.readOmnibox('Organize these ideas into a hierarchy', ctx()).kind === 'organize');
  ok('“Put these in a tree” → proposed', X.readOmnibox('Put these in a tree', ctx()).kind === 'organize');
  ok('not an essay, nor a question about structure', X.readOmnibox('Organize my essay into paragraphs', ctx()).kind === 'chat' && X.readOmnibox('What is a hierarchy?', ctx()).kind === 'chat');
  const map = X.sanitizeMap({
    nodes: [
      { id: 'm', type: 'concept', label: 'Microeconomics' },
      { id: 'p', type: 'concept', label: 'Production possibility frontier' },
      { id: 'o', type: 'concept', label: 'Opportunity cost' },
    ],
    edges: [
      { from: 'p', to: 'm', relation: 'part_of' },
      { from: 'o', to: 'p', relation: 'supports' },
    ],
  });
  const moves = X.structureProposal(map);
  ok('the structure the lines imply, as moves: each card under the one its line points to', J(moves.map((m) => `${m.label} → ${m.parentLabel}`)) === J(['Production possibility frontier → Microeconomics', 'Opportunity cost → Production possibility frontier']), J(moves));
  const applied = X.applyMapEdits(map, moves.map((m) => ({ op: 'parent', id: m.id, parent: m.parent }))).map;
  ok('applied: their structure now — the same cards, none copied, none removed, every line of meaning kept', applied.nodes.length === 3 && applied.edges.filter((e) => e.kind === 'structure').length === 2 && applied.edges.filter((e) => !e.kind).length === 2 && X.structureProposal(applied).length === 0, J(applied.edges));
}

console.log('\n=== a milestone, theirs ===');
{
  ok('“Milestone: finish chapter 5” → added', J(X.readOmnibox('Milestone: finish chapter 5', ctx())) === J({ kind: 'milestone', text: 'finish chapter 5', done: false }));
  ok('“Mark milestone finish chapter 5 as done” → ticked', J(X.readMilestone('Mark milestone finish chapter 5 as done')) === J({ text: 'finish chapter 5', done: true }));
  ok('…not a word about milestones in general', X.readMilestone('What milestones should I set?') === null);
}

console.log('\n=== everything else goes the way it always went ===');
{
  for (const t of ['Quiz me on monopoly pricing.', 'Show me how derivatives work.', 'Highlight the demand curve.', 'Make the chart blue', 'Summarise the attached paper']) ok(`to Socria’s own routing: “${t}”`, X.readOmnibox(t, ctx()).kind === 'chat');
  ok('the hint says what Enter will do, and nothing for an ordinary message', /no reply/.test(X.omniHint({ kind: 'thought', label: 'x', type: 'claim' })) && /for you to confirm/.test(X.omniHint({ kind: 'connect', from: { label: 'A' }, to: { label: 'B' }, candidates: [], relation: 'relates' })) && X.omniHint({ kind: 'chat' }) === null);
}

console.log('\n=== the chat’s work on the canvas: one thing, never a copy ===');
{
  const quiz = { id: 'qz', kind: 'quiz', name: 'Q', at: 0, states: [{ title: 'Monopoly pricing', asked: ['a', 'b'], phase: 'review', pool: [{ id: 'a', topic: 'MR = MC' }, { id: 'b', topic: 'Deadweight loss' }], records: { a: { attempts: [{ graded: { grade: 'right' } }] }, b: { attempts: [{ graded: { grade: 'wrong' } }] } } }] };
  const chart = { id: 'ch', kind: 'kept', name: 'k', at: 0, states: [{ title: 'Demand and supply' }] };
  const doc = { id: 'dd', kind: 'document', name: 'd', at: 0, states: [{ doc: 'doc1' }] };
  const s = { messages: [{ role: 'user', attachments: [{ name: 'lecture-4.pdf', kind: 'doc', doc: 'doc1' }, { name: 'whiteboard.jpg', kind: 'image' }] }, { role: 'user', attachments: [{ name: 'lecture-4.pdf', kind: 'doc', doc: 'doc1' }] }], map: { nodes: [{ id: 'n1', label: 'Monopoly pricing', obj: 'qz' }], objects: { objs: [quiz, chart, doc] } } };
  const w = X.workItemsOf(s);
  ok('its quizzes with their standing, its artifacts, its sources — each document once', J(w.map((x) => `${x.kind}:${x.title}`)) === J(['quiz:Monopoly pricing', 'artifact:Demand and supply', 'source:lecture-4.pdf', 'source:whiteboard.jpg']), J(w));
  ok('…stable keys, the object each is, and the card that already stands for one', w[0].key === 'o:qz' && w[0].sub === '1/2 · missed Deadweight loss' && w[0].placed === 'n1' && w[2].key === 'f:doc1' && w[2].obj === 'dd' && !w[1].placed);
  const card = X.cardFor(w[2], 'dd', [120, 80]);
  ok('placed, a source is a card that stands for it: kept by the map pass, marked as brought', card.obj === 'dd' && card.hand === true && card.origin === 'source' && card.type === 'source' && J(card.mind.pos.i) === J([120, 80]));
  const placed = X.applyMapEdits(X.sanitizeMap({ nodes: [], edges: [] }), [{ op: 'add', node: card }]).map;
  ok('…and the map holds the reference, not a copy of the document', placed.nodes[0].obj === 'dd' && placed.nodes[0].origin === 'source' && !('text' in placed.nodes[0]));
  const kept = X.keepPlaced(placed, { nodes: [{ id: placed.nodes[0].id, type: 'source', label: placed.nodes[0].label }], edges: [] });
  ok('a map pass that drew the card again keeps what it stands for', kept.nodes[0].obj === 'dd' && kept.nodes[0].origin === 'source');
  ok('a card says what it stands for: “Quiz · 1/2 …”', X.workLabelFor('qz', w)?.said.startsWith('Quiz · 1/2') && X.workLabelFor('nope', w) === null);
  const canvas = read('components/logos6/ThinkingCanvas.tsx');
  ok('the canvas lists the work, opens it in focus, places it, and shows the card for what is placed', /This chat’s work/.test(canvas) && /p\.onOpenWork!\(w\)/.test(canvas) && /Place on canvas/.test(canvas) && /Show card/.test(canvas) && /Open \{p\.work\.kind === 'quiz' \? 'the quiz'/.test(canvas));
  const app = read('components/LogosApp.tsx');
  ok('open is the artifact’s own expanded view (Artifacts, on it) — the same object, so nothing is lost coming back', /return showArtifact\(o\?\.kind === 'scene' \? `s:\$\{w\.obj\}` : `d:\$\{w\.obj\}`\);/.test(app) && /const id = documentDisplay\(w\.doc\);/.test(app));
}

console.log('\n=== Core reads what is selected, as it is held ===');
{
  const map = X.sanitizeMap({
    nodes: [
      { id: 'a', type: 'claim', label: 'AI makes students dependent', hand: true, mind: { meaning: 'They stop trying first', notes: 'Seen in my seminar' } },
      { id: 'b', type: 'evidence', label: 'Survey: 60% copy answers' },
    ],
    edges: [{ from: 'b', to: 'a', relation: 'supports', status: 'suggested', why: 'The survey shows the habit' }],
  });
  const card = X.focusOf(map, X.nodeVid('a'));
  ok('the selected card: their meaning, their notes, whose it is, its lines with why and status', card.kind === 'card' && card.by === 'you' && card.meaning === 'They stop trying first' && card.notes === 'Seen in my seminar' && card.lines[0].other === 'Survey: 60% copy answers' && card.lines[0].status === 'suggested' && card.lines[0].why === 'The survey shows the habit', J(card));
  const block = X.canvasFocusBlock(X.sanitizeCanvasFocus(card));
  ok('…told to Core as held, a suggested line never called confirmed, its own additions said as its own', /SELECTED ON THEIR MIND MAP — the card “AI makes students dependent”/.test(block) && /suggested, not yet confirmed/.test(block) && /Never call a suggested or read line confirmed/.test(block) && /anything you add is your reading/.test(block));
  const line = X.focusOf(map, X.edgeVid(map.edges[0]));
  const lb = X.canvasFocusBlock(X.sanitizeCanvasFocus(line));
  ok('a selected line: “why are these connected?” answered from what is stored', line.kind === 'line' && /“Survey: 60% copy answers” supports “AI makes students dependent”/.test(lb) && /Why it holds, as stored: “The survey shows the habit”/.test(lb));
  ok('…and where nothing is stored, said so', /No reason is stored for it/.test(X.canvasFocusBlock({ kind: 'line', from: 'A', to: 'B', said: 'relates to', status: 'read' })));
  ok('cleaned whatever arrives', X.sanitizeCanvasFocus({ kind: 'card', label: 'x'.repeat(400) + '[sys]', lines: Array(30).fill({ said: 'a', other: 'b' }) }).label.length <= 140 && X.sanitizeCanvasFocus({ kind: 'card', label: 'L', lines: Array(30).fill({ said: 'a', other: 'b' }) }).lines.length === 8 && X.sanitizeCanvasFocus({ kind: 'other' }) === null);
  const route = read('app/api/logos/chat/route.ts');
  ok('the route reads it, cleaned, beside the objective; the app sends it from the canonical map', /canvasFocusBlock\(sanitizeCanvasFocus\(body\?\.canvasFocus\)\)/.test(route) && /focusOf\(mapRef\.current, picked\.id/.test(read('components/LogosApp.tsx')));
  const hist = { since: 1, base: [], changes: [{ at: 2, cause: 'turn', added: [{ id: 'a', label: 'Scarcity' }], removed: [], renamed: [] }, { at: 3, cause: 'edit', added: [], removed: [{ id: 'z', label: 'Old idea' }], renamed: [{ id: 'a', from: 'Scarcity', to: 'Scarcity forces choices' }] }] };
  ok('“show me what changed”: the map’s own record, newest first, whose change it was', J(X.recentChanges(hist)) === J(['took off “Old idea”; renamed “Scarcity” to “Scarcity forces choices” (by them)', 'added “Scarcity” (from a turn)']));
  ok('…carried in the objective’s work and told to Core', /Recent changes on their map/.test(X.objectiveBlock({ objective: { goal: 'G', source: 'stated', set: 1 }, work: { ...X.workOf({ messages: [], map: { nodes: [], history: hist } }) } })));
}

console.log('\n=== milestones: theirs to tick off ===');
{
  const o = X.addMilestone({ goal: 'Master Calculus I', source: 'stated', set: 1 }, 'Finish chapter 5', 10);
  const done = X.tickMilestone(o, 'finish chapter 5', 20);
  ok('added and ticked off by them; kept through a save', o.milestones[0].t === 'Finish chapter 5' && !o.milestones[0].done && done.milestones[0].done === true && X.sanitizeObjective(done).milestones[0].done === true);
  ok('…once each, and nothing ticked that does not fit', X.addMilestone(o, 'finish chapter 5', 30).milestones.length === 1 && X.tickMilestone(o, 'learn rust', 20) === null);
  ok('Core is told, and never says one is reached', /“Finish chapter 5” \(done\)/.test(X.objectiveBlock({ objective: done, work: X.workOf({ messages: [] }) })) && /Only they tick one off — never say one is reached/.test(X.objectiveBlock({ objective: done, work: X.workOf({ messages: [] }) })));
}

console.log('\n=== in the app ===');
{
  const app = read('components/LogosApp.tsx');
  ok('the Omnibox runs after the workspace’s own commands, before anything goes to a model; “Ask Socria instead” sends it as it is', /const done = localCommand\(content\);[\s\S]{0,600}const own = omniOff \|\| via === 'voice' \? null : omniCommand\(content\);/.test(app));
  ok('a thought: their card on the map and their turn in the conversation, marked — and no request', /postTurn\(\{ id: newMsgId\(\), at: Date\.now\(\), role: 'user', content: said0, via: 'thought' \}, true\)/.test(app) && /return \{ said: '', thought: true \};/.test(app));
  ok('…with a way to ask Socria about it, and to see it on the canvas', /Ask Socria about it/.test(app) && /See it on the Mind Map/.test(app));
  ok('a connection: a suggested line opened for them to confirm; or the cards to choose from', /status: 'suggested', why: 'You asked to connect these/.test(app) && /Connect “\{omniPick\.from\.label\}” to which\?/.test(app));
  ok('an organisation: proposed on the canvas in Structure, applied only on their word', /setProposal\(\{ moves \}\);\s*showOnCanvas\(\{ mode: 'structure' \}\);/.test(app) && /op: 'parent' as const, id: m\.id, parent: m\.parent/.test(app));
  ok('the box says what Enter will do while it is typed', /intent=\{omniPreview\}/.test(app) && /On Enter/.test(read('components/LogosComposer.tsx')));
  ok('a thought is stored marked, and read by Core as one — not a question left unanswered', /m\.via === 'thought'/.test(read('app/api/conversations/route.ts')) && /A thought of theirs, kept on their map; no reply was asked for/.test(read('app/api/logos/chat/route.ts')));
}

console.log('\n=== simple by default: one note, one quiet line, the rest a step away ===');
{
  const quiet = (f) => { const e = console.error; console.error = () => {}; try { return f(); } finally { console.error = e; } };
  const app = read('components/LogosApp.tsx');
  ok('one note over the box at a time: a choice first, then an offer about the message sent, then the kept thought', /const showPick = !!omniPick && omniPick\.sid === activeId;/.test(app) && /const showDrift = !!drift && !showPick;/.test(app) && /const showKept = !!thoughtKept && thoughtKept\.sid === activeId && !showPick && !drift;/.test(app) && /\{showKept && thoughtKept && \(/.test(app) && /\{showPick && omniPick && \(/.test(app) && /\{showDrift && drift && \(/.test(app));
  ok('…the kept note has one action, the Mind Map a link in its words, and goes when they write again', /className="l6-kept-map"/.test(app) && (app.match(/className="lg-drift-stay"/g) || []).length >= 1 && !/>\s*See it on the Mind Map\s*</.test(app) && /if \(input\.trim\(\)\) setThoughtKept\(\(k\) => \(k \? null : k\)\);/.test(app));
  const composer = read('components/LogosComposer.tsx');
  ok('what Enter will do: a quiet line, no shouted label; "On Enter" said to a screen reader', /<span className="l5-intent-k" aria-hidden="true">↵<\/span>/.test(composer) && /<span className="l5-intent-sr">On Enter: <\/span>/.test(composer));
  const MAP = X.sanitizeMap({ nodes: [{ id: 'a', type: 'claim', label: 'Alpha' }, { id: 'b', type: 'claim', label: 'Beta' }], edges: [{ from: 'a', to: 'b', relation: 'supports' }] });
  const BIG = X.sanitizeMap({ nodes: ['A', 'B', 'C', 'D', 'E'].map((l) => ({ id: l.toLowerCase(), type: 'idea', label: l })), edges: [] });
  const draw = (map, props) => quiet(() => renderToStaticMarkup(h(X.ThinkingCanvas, { map, onEdits: () => {}, mapKey: 'c1', ...props })));
  const small = draw(MAP, { initialMode: 'ideas' }), big = draw(BIG, { initialMode: 'ideas' });
  ok('the canvas does not describe its own mode on screen (the tab says it on hover)', !/class="tc-said"/.test(small) && /title="Brainstorm: put ideas anywhere/.test(small));
  ok('…the help shows while the map is small, and after that only to a screen reader', /<span class="tc-hint">Drag a card to move it/.test(small) && !/<span class="tc-hint">Drag a card/.test(big) && /<span class="tc-sr">Drag a card to move it/.test(big));
  const logic = draw(MAP, { initialMode: 'logic' });
  ok('Logic brings lines forward with one choice, not a row of chips', /<select aria-label="Bring forward">/.test(logic) && />All lines</.test(logic) && />Tensions</.test(logic) && />Support</.test(logic) && />Assumptions</.test(logic) && />Suggested</.test(logic) && !/tc-chip/.test(logic));
  const st = draw(MAP, { initialMode: 'structure' });
  ok('Copy the outline and the other drawings under More; the keys of Structure kept for screen readers', /<details class="tc-more"><summary[^>]*>More<\/summary>/.test(st) && /Copy the outline/.test(st) && /<span class="tc-sr">Tab moves a card inside the one above/.test(st));
  const canvas = read('components/logos6/ThinkingCanvas.tsx');
  const at = (t) => canvas.indexOf(t);
  ok('a card opened leads with what it is, what it means and what it connects to; the rest under More details', at('label="Title"') < at('label="Meaning"') && at('label="Meaning"') < at('<h4 className="tc-sec">Connected to</h4>') && at('<h4 className="tc-sec">Connected to</h4>') < at('label="Notes"') && at('label="Notes"') < at('<details className="tc-moredet">') && ['label="Subtitle"', '<span className="tc-field-k">Kind</span>', 'label="Group"', '<span className="tc-field-k">Sits inside</span>', 'label="Tags"', 'label="Assumptions"', 'label="Sources"', 'label="Your fields"', 'aria-label="Tone"'].every((t) => at(t) > at('<details className="tc-moredet">')));
  ok('…and what is filled in under it is named on the way in', /More details\{filled\.length \? <span className="tc-moredet-n"> · \{filled\.join\(', '\)\}<\/span> : null\}/.test(canvas));
  const tcCss = read('components/logos6/thinking-canvas.css');
  ok('the chat’s work sits in the tools row, a button and the list under it — never floating where the chat box lives', /\.logos-root \.tc-tray \{ position: relative; \}/.test(tcCss) && /\.tc-tray-list \{ position: absolute; right: 0; top: calc\(100% \+ 4px\);/.test(tcCss) && canvas.indexOf('className={`tc-tray${trayOpen') > canvas.indexOf('<div className="tc-tools">') && canvas.indexOf('className={`tc-tray${trayOpen') < canvas.indexOf('className="tc-body"'));
  ok('…and on a phone the add field folds behind “+ Add”, and the card sheet takes the room it needs', /const addOpen = !narrow \|\| adding \|\| !!draft;/.test(canvas) && /className="tc-add-open"/.test(canvas) && /\.tc-inspect\.is-sheet \{[^}]*max-height: min\(100%, max\(72%, 320px\)\);/.test(tcCss) && /\.tc\.is-narrow \.tc-body \{ min-height: 160px; \}/.test(tcCss));
  const spaceCss = read('components/logos5/space.css'), r2 = read('components/logos5/revision2.css');
  ok('the Mind Map stops where the chat box begins (its measured height), on a phone and beside the space', /\.ls-mind \{[^}]*padding-bottom: calc\(var\(--ls-foot, 94px\) \+ 24px\);/.test(spaceCss) && /\.ls-mind\.is-phone \{ padding-bottom: calc\(var\(--ls-foot, 128px\) \+ 8px\); \}/.test(spaceCss) && /root\.style\.setProperty\('--ls-foot'/.test(read('components/logos5/L5Space.tsx')));
  ok('the box’s foot wraps on a phone: the guide’s ways out never sit on “+ Add…”', /\.l5-ctools\.l5-compose-foot \{\s*display: flex;\s*flex-wrap: wrap;/.test(r2) && /\.l5-compose-foot \{ display: flex; flex-wrap: wrap;/.test(read('components/logos5/l5-controls.css')));
  ok('the page view’s bar at laptop widths: the end keeps its room (never spilling over the switch), the bar tightens, the name keeps some', /\.l5v-top\.is-sw-top:not\(\.is-narrow\) \{ grid-template-columns: minmax\(0, 1fr\) auto minmax\(max-content, 1fr\); \}/.test(r2) && /@media \(max-width: 1279px\) \{[^}]*\.l5-switch \{ gap: 18px; \}[\s\S]*?\.l5v-home-w \{ display: none; \}[\s\S]*?\.l5v-search \.l5-kbd \{ display: none; \}/.test(r2));
  ok('a tip on the box’s + menu sits above the whole box, never over its notes', (read('lib/logos5/tips.ts').match(/anchor: '\.l5-menuhost',\n\s*\/\/[^\n]*\n\s*avoid: '\.l5-dock',/g) || []).length === 2);
}

console.log(`\nomnibox: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
