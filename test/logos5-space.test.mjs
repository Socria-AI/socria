// LOGOS 5.5 — REVISION III · EVERYTHING IN ONE SPACE.
//
//   ideas     the lines' direction and words; the space left to right (what
//             frames the question first, each idea after what it rests on);
//             the open idea a turn makes; the turn an idea came from; what
//             sits around one idea; the trail of turns; "Answering"; the links
//             beyond the map's own (a file read from, a thing made); where each
//             turn's words sit in Words; what the row brings forward
//   L5Space   the row of kinds (not tabs), each kind its own card, turn tags,
//             the open idea holding the reply, the chatbox at the foot, the
//             way to the conversation as a page; a phone's one column
//   wiring    LogosApp: the space is the line of thinking's view; the page a
//             press away and back; the header's tabs only on the page

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import * as S from './.tmp/space-under-test.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 300))));
const J = JSON.stringify;
const quiet = (f) => { const e = console.error; console.error = () => {}; try { return f(); } finally { console.error = e; } };
const html = (el) => quiet(() => renderToStaticMarkup(el));

// a small line of thinking: can I afford to move out?
const nodes = [
  { id: 'q', type: 'question', label: 'Can I afford to move out?' },
  { id: 'pay', type: 'given', label: 'Take-home £2,180' },
  { id: 'rent', type: 'evidence', label: 'Rent £1,050 plus bills' },
  { id: 'save', type: 'goal', label: 'Save £300 a month' },
  { id: 'share', type: 'consequence', label: 'Rent and bills take 57% of pay' },
  { id: 'flat', type: 'idea', label: 'A flatshare at £750' },
];
const edges = [
  { from: 'rent', to: 'share', relation: 'supports' },
  { from: 'save', to: 'share', relation: 'supports' },
  { from: 'share', to: 'flat', relation: 'leads_to' },
  { from: 'flat', to: 'save', relation: 'conflicts' },
];
const turns = [
  { askedId: 'u1', replyId: 'a1', asked: 'Can I afford to move out?', said: 'Let’s see.', asks: 'What do you take home?' },
  { askedId: 'u2', replyId: 'a2', asked: 'Here’s my payslip', said: 'You take home £2,180.' },
  { askedId: 'u3', replyId: 'a3', asked: 'I want to save £300', said: 'That leaves £240.', asks: 'Would a flatshare still feel like moving out?' },
];
const fromMsg = new Map([
  ['u1', ['q']],
  ['a2', ['pay', 'rent']],
  ['u3', ['save']],
  ['a3', ['share', 'flat', 'save']],
]);

console.log('\n=== ideas: which way a line runs, and what it says ===');
ok('supports, leads to, causes run as written; depends, part of, is a run the other way', J(S.flowOf({ from: 'a', to: 'b', relation: 'supports' })) === J(['a', 'b']) && J(S.flowOf({ from: 'a', to: 'b', relation: 'depends' })) === J(['b', 'a']) && J(S.flowOf({ from: 'a', to: 'b', relation: 'part_of' })) === J(['b', 'a']));
ok('  a conflict or a loose relation has no direction (drawn, not ranked)', S.flowOf({ from: 'a', to: 'b', relation: 'conflicts' }) === null && S.flowOf({ from: 'a', to: 'b', relation: 'relates' }) === null && S.flowOf({ from: 'a', to: 'a', relation: 'supports' }) === null);
ok('  a line says so, but, because; its own words first; a reversed relation reads in ours', S.edgeWord({ relation: 'leads_to' }) === 'so' && S.edgeWord({ relation: 'conflicts' }) === 'but' && S.edgeWord({ relation: 'justifies' }) === 'because' && S.edgeWord({ relation: 'causes', label: 'evaporates' }) === 'evaporates' && S.edgeWord({ relation: 'depends', label: 'is needed by' }) === 'needed for');
ok('  long words are cut', S.edgeWord({ relation: 'supports', label: 'a very long link phrase that goes on and on' }).length <= 28);

console.log('\n=== ideas: the space, left to right ===');
const L = S.ideaLayout(nodes, edges);
ok('the question and the givens frame the space', J(L.frame) === J(['q', 'pay']), J(L.frame));
ok('  each idea after what it rests on: rent and saving, then 57%, then the flatshare', J(L.columns) === J([['rent', 'save'], ['share'], ['flat']]), J(L.columns));
ok('  a loop is cut where it closes; every idea is placed once', (() => {
  const l = S.ideaLayout([{ id: 'a', type: 'idea', label: 'a' }, { id: 'b', type: 'idea', label: 'b' }], [{ from: 'a', to: 'b', relation: 'leads_to' }, { from: 'b', to: 'a', relation: 'leads_to' }]);
  return l.columns.flat().sort().join() === 'a,b';
})());
ok('  a question something leads to is not framing', S.ideaLayout([{ id: 'x', type: 'idea', label: 'x' }, { id: 'q2', type: 'question', label: 'q2' }], [{ from: 'x', to: 'q2', relation: 'leads_to' }]).frame.length === 0);
ok('  within a column, each idea beside what it comes from', (() => {
  const ns = ['a', 'b', 'c', 'd'].map((id) => ({ id, type: 'idea', label: id }));
  const l = S.ideaLayout(ns, [{ from: 'a', to: 'd', relation: 'leads_to' }, { from: 'b', to: 'c', relation: 'leads_to' }]);
  return J(l.columns) === J([['a', 'b'], ['d', 'c']]);
})());

console.log('\n=== ideas: the open idea ===');
ok('the newest turn opens the idea it put there first, the newest of them, not one an earlier turn had', S.openIdeaOf({ nodes, turns, fromMsg, at: 2 }) === 'flat');
ok('  not the question or a given when it put anything else there', S.openIdeaOf({ nodes, turns, fromMsg, at: 1 }) === 'rent');
ok('  a turn that put only the question there opens the question', S.openIdeaOf({ nodes, turns, fromMsg, at: 0 }) === 'q');
ok('  none while it is still being answered, nor for a turn that put nothing on the map', S.openIdeaOf({ nodes, turns: [...turns.slice(0, 2), { ...turns[2], pending: true }], fromMsg, at: 2 }) === null && S.openIdeaOf({ nodes, turns: [{ askedId: 'x' }], fromMsg, at: 0 }) === null && S.openIdeaOf({ nodes, turns, fromMsg, at: null }) === null);
ok('the turn an idea came from: the first that put it there', S.firstTurnOf('save', turns, fromMsg) === 2 && S.firstTurnOf('pay', turns, fromMsg) === 1 && S.firstTurnOf('nope', turns, fromMsg) === null);
ok('around one idea: what it rests on, what follows, what stands against it', J(S.aroundOf('share', nodes, edges)) === J({ before: ['rent', 'save'], after: ['flat'], against: [] }) && J(S.aroundOf('flat', nodes, edges).against) === J(['save']));

console.log('\n=== ideas: the trail, and the chatbox ===');
const rows = S.trailRows(turns, fromMsg, nodes);
ok('each turn: what was asked, Socria’s question (or first words), the ideas it put there first', rows.length === 3 && rows[2].said === 'Would a flatshare still feel like moving out?' && rows[1].said === 'You take home £2,180.' && J(rows[2].made.map((m) => m.id)) === J(['save', 'share', 'flat']));
ok('  an idea is made once, by the first turn that put it there', !rows[2].made.some((m) => m.id === 'pay'));
ok('"Answering" the open idea when Socria’s newest reply asked something', S.answeringOf({ newest: true, asks: true, pending: false, about: false, label: 'A flatshare' }) === 'A flatshare');
ok('  not for an older turn, a reply still arriving, no question, or something else asked about', [S.answeringOf({ newest: false, asks: true, pending: false, about: false, label: 'x' }), S.answeringOf({ newest: true, asks: true, pending: true, about: false, label: 'x' }), S.answeringOf({ newest: true, asks: false, pending: false, about: false, label: 'x' }), S.answeringOf({ newest: true, asks: true, pending: false, about: true, label: 'x' })].every((v) => v === null));
ok('  with no idea open, it names the question itself', S.answeringOf({ newest: true, asks: true, pending: false, about: false, label: null }) === 'Socria’s question');

console.log('\n=== ideas: links beyond the map, and where the words sit ===');
const brought = [{ key: 'payslip', turn: 1 }, { key: 'loose', turn: null }];
const made = [{ key: 'budget', turn: 2 }, { key: 'chart', turn: 1 }];
const links = S.spaceLinks({ nodes, edges, brought, made, turns, fromMsg, openId: 'flat', openTurn: 2 });
ok('a file is read from: to the first idea its turn put there', links.some((l) => l.from === 'c:payslip' && l.to === 'n:pay' && l.word === 'read from' && l.kind === 'read'));
ok('  a file with no turn is linked to nothing', !links.some((l) => l.from === 'c:loose'));
ok('something made comes from the open idea for the open turn, else from the first idea its turn put there', links.some((l) => l.from === 'n:flat' && l.to === 'm:budget' && l.word === 'made') && links.some((l) => l.from === 'n:pay' && l.to === 'm:chart'));
ok('the map’s lines: named where they touch the open idea; a conflict dashed and named', links.some((l) => l.from === 'n:share' && l.to === 'n:flat' && l.word === 'so') && links.some((l) => l.from === 'n:rent' && l.to === 'n:share' && l.word === '') && links.some((l) => l.dashed && l.word === 'but'));
ok('  a loose relation draws no line', !S.spaceLinks({ nodes, edges: [{ from: 'q', to: 'pay', relation: 'relates' }], brought: [], made: [], turns, fromMsg, openId: null, openTurn: null }).length);
ok('  with nothing on the map yet, what the newest turn made hangs from the open card', S.spaceLinks({ nodes: [], edges: [], brought: [], made: [{ key: 'm1', turn: 0 }], turns: [{ askedId: 'u' }], fromMsg: new Map(), openId: null, openTurn: 0 }).some((l) => l.from === 'open' && l.to === 'm:m1'));
const targets = S.wordTargets({ nodes, brought, made, turns, fromMsg, openId: 'flat', openTurn: 2 });
ok('Words: each turn beside the first thing it made; the open turn on the open card', J(targets) === J(['n:q', 'n:pay', 'n:flat']), J(targets));
ok('  a turn that left nothing has no place', J(S.wordTargets({ nodes, brought: [], made: [], turns: [...turns, { askedId: 'u9' }], fromMsg, openId: 'flat', openTurn: 2 })[3]) === 'null');
ok('the row: everything forward on Everything, nothing on Words, the open idea with Ideas', S.forwardIn('all', 'made') && !S.forwardIn('words', 'idea') && S.forwardIn('ideas', 'open') && S.forwardIn('made', 'made') && !S.forwardIn('made', 'idea') && S.forwardIn('brought', 'brought'));
ok('  its kinds, in order', J(S.SPACE_KINDS) === J(['all', 'ideas', 'brought', 'made', 'words']));

console.log('\n=== L5Space: the space drawn ===');
const sIdeas = nodes.map((n) => ({ ...n, kind: S.ideaKind(n), turn: S.firstTurnOf(n.id, turns, fromMsg) }));
const cTurns = turns.map((t, i) => ({ ...t, key: `t${i}`, index: i }));
const props = (over = {}) => ({
  ideas: sIdeas,
  edges,
  brought: [{ key: 'payslip', kicker: 'You brought · file', title: 'Payslip, October.pdf', turn: 1 }],
  made: [{ key: 'budget', kicker: 'Made · Table', title: 'Your month, if you move', turn: 2, onOpen: () => {} }],
  turns: cTurns,
  fromMsg,
  openId: 'flat',
  openTurn: 2,
  openBody: h('p', { className: 'reply' }, 'That leaves £240.'),
  lit: new Set(['save', 'share', 'flat']),
  picked: null,
  composer: h('div', { className: 'the-chatbox' }),
  answering: 'A flatshare at £750',
  onIdea: () => {},
  onPage: () => {},
  ...over,
});
const wide = html(h(S.L5Space, props()));
ok('the row brings a kind forward: Everything, Ideas, Files, Artifacts, Words (the names the views use) — buttons, not tabs', /class="ls-kinds"/.test(wide) && ['Everything', 'Ideas', 'Files', 'Artifacts', 'Words'].every((k) => wide.includes(`>${k}`)) && !/role="tab"/.test(wide) && /aria-pressed="true"/.test(wide));
ok('  with counts: 6 ideas, 1 file, 1 artifact, 3 turns', /Ideas<span class="ls-c">6<\/span>/.test(wide) && /Files<span class="ls-c">1<\/span>/.test(wide) && /Artifacts<span class="ls-c">1<\/span>/.test(wide) && /Words<span class="ls-c">3 turns<\/span>/.test(wide));
ok('each kind its own card: ideas, a file with its folded corner, something made, the open idea', /class="ls-idea/.test(wide) && /class="ls-file"/.test(wide) && /class="ls-made"/.test(wide) && /class="ls-open"/.test(wide));
ok('  Revision V: cards say what they are by glyph and colour, not by kind words or turn tags', !/<span class="ls-tn">turn ii<\/span>/.test(wide) && /class="ls-t"><span class="ls-k-g"/.test(wide) && /class="ls-t ls-tt">Payslip, October\.pdf/.test(wide));
ok('  the open idea is the idea and what was made for it; Socria’s reply is its own bubble under it', /<h2 class="ls-stmt">[\s\S]*?A flatshare at £750<\/h2>/.test(wide) && /class="ls-bub has-tail[^"]*"[^>]*aria-label="Socria’s reply"/.test(wide) && /class="ls-bub-who"[\s\S]*?Socria/.test(wide) && /class="ls-bub[^"]*"[\s\S]*?class="reply"/.test(wide) && !/<b>You<\/b>/.test(wide));
ok('  the bubble is signed by name, not the mark: Socria in italic moss serif', /class="ls-bub-who"><span class="ls-bub-name">Socria<\/span>/.test(wide) && !/class="ls-bub-who"><img/.test(wide) && /\.ls-bub-name\s*\{[^}]*font-style:\s*italic[^}]*color:\s*var\(--ls-moss/.test(readFileSync(new URL('../components/logos5/space.css', import.meta.url), 'utf8')));
ok('  lit ideas from the open turn', /ls-idea is-idea is-lit/.test(wide));
ok('  the question framed first, in its own column', /class="ls-col is-frame"[\s\S]*Your question/.test(wide));
ok('the chatbox at the foot, with no "Answering" line over it', /class="ls-chat"/.test(wide) && /class="the-chatbox"/.test(wide) && !/ls-answering/.test(wide) && !/Answer below/.test(wide));
ok('  what the open turn made is drawn large in the open idea; the bubble then keeps to words', (() => { const x = html(h(S.L5Space, props({ openHero: { node: h('div', { className: 'hero-thing' }) } }))); return /class="ls-hero"[\s\S]*?class="hero-thing"/.test(x) && /class="ls-bub has-tail has-hero[^"]*"/.test(x); })());
ok('  no hint text in the row; no words on the lines', !/ls-arr/.test(wide) && !/class="ls-lw/.test(wide));
ok('the conversation as a page, a press away', /Read as a conversation/.test(wide));
ok('a reply with no idea yet is Socria’s bubble alone', (() => { const x = html(h(S.L5Space, props({ openId: null }))); return /class="ls-bub(?: has-earlier)?"/.test(x) && !/class="ls-open"/.test(x); })());
const phone = html(h(S.L5Space, props({ narrow: true })));
ok('a phone: one column — the open idea, what was made from it, what it comes from, then all the ideas', /ls is-phone/.test(phone) && /Made from it/.test(phone) && /It comes from/.test(phone) && /See all 6 ideas/.test(phone) && !/ls-cols/.test(phone));
ok('  the chatbox at its foot; the row still there', /class="ls-chat"/.test(phone) && /class="ls-kinds"/.test(phone));

console.log('\n=== wiring: LogosApp ===');
const app = read('components/LogosApp.tsx');
ok('the space is the line of thinking’s view; the page a press away', /const spaceOn = oneView && spaceView;/.test(app) && /if \(spaceOn\) \{[\s\S]*<L5Space/.test(app) && /onPage=\{\(\) => setSpaceView\(false\)\}/.test(app));
ok('  from the page, the way back to the space; the header’s tabs only on the page', /const switchEl = activeId && !spaceOn \?/.test(app) && /setSpaceView\(true\)/.test(app) && /The space/.test(app));
ok('  the open idea: the newest turn’s, or one pressed (and then asked about)', /openIdeaOf\(\{ nodes: map\.nodes, turns, fromMsg: byMsg, at: last \}\)/.test(app) && /setSpaceOpen\(id\);[\s\S]{0,80}setFocus\(\{ kind: 'node', id \}\)/.test(app));
ok('  a message sent opens the space on its turn; a new line of thinking starts fresh', /if \(lastRole === 'user'\) setSpaceOpen\(null\);/.test(app) && /setPageFocus\('chat'\);\s*setSpaceOpen\(null\);/.test(app));
ok('  files open beside it; what was made opens as it always did', /onOpen: \(\) => openContent\(c\.id\)/.test(app) && /\.filter\(\(c\) => c\.tone !== 'content'\)/.test(app));
const css = read('components/logos5/space.css');
ok('  in Words a stepped-back card fades but its turn’s words stay sharp', /\.ls-it\.is-back > :not\(\.ls-word\) \{ opacity: 0\.22; \}/.test(css));
ok('the stylesheet: the row, the folded corner, the boxed chatbox, a phone’s column', /\.ls-kd\.is-on/.test(css) && /\.ls-file::after/.test(css) && /\.ls-chat \.l5-dock \.lg-composer\.is-ruled \.lg-composer-box/.test(css) && /\.ls-feed/.test(css));


console.log('\n=== Revision IV: colour by what a thing is ===');
ok('a question, an assumption, an unknown, a misconception: mustard', ['question', 'assumption', 'unknown', 'misconception'].every((t) => S.ideaTone({ type: t }) === 'question'));
ok('  a tension, a counterpoint, an error: rust; a given or a constraint: ink; anything else is yours (moss)', S.ideaTone({ type: 'tension' }) === 'against' && S.ideaTone({ type: 'counterpoint' }) === 'against' && S.ideaTone({ type: 'given' }) === 'given' && S.ideaTone({ type: 'constraint' }) === 'given' && S.ideaTone({ type: 'claim' }) === 'yours' && S.ideaTone({ type: 'step' }) === 'yours');
ok('  a role counts as well as a type', S.ideaTone({ type: 'idea', role: 'constraint' }) === 'given');

console.log('\n=== Revision IV: the space drawn in colour ===');
const v4 = html(h(S.L5Space, props({ openId: 'save', openTurn: 2 })));
ok('the row is the legend: each kind button says its kind', ['all', 'ideas', 'brought', 'made', 'words'].every((k) => v4.includes(`data-kind="${k}"`)));
ok('  every idea has a tone and its node glyph in its head', /data-tone="question"/.test(v4) && /data-tone="given"/.test(v4) && /data-tone="yours"/.test(v4) && /class="ls-k-g"[^>]*><svg class="lg-node-glyph"/.test(v4));
ok('  the open idea’s statement carries its glyph; nothing circled', /<h2 class="ls-stmt"><span class="ls-k-g"[\s\S]*?Save £300 a month<\/h2>/.test(v4) && !/pathLength="1"[^>]*><\/path><\/svg><\/span><\/h2>/.test(v4));
ok('arriving: the space opens settling, each card numbered in reading order, the lines after the last card', /class="ls is-all is-arriving"/.test(v4) && /--ls-base:/.test(v4) && /--i:0/.test(v4) && /--i:1/.test(v4));
ok('  the phone keeps its column (no arrival)', !/is-arriving/.test(html(h(S.L5Space, props({ narrow: true })))));
const css4 = read('components/logos5/space-colour.css');
ok('the stylesheet: tones, slate files, vermilion made, the gold question panel, lines by kind, the arrival, reduced motion', /\[data-tone='question'\]/.test(css4) && /\.ls-file \{[^}]*--ls-tint-slate/.test(css4) && /\.ls-made \.ls-k \{ color: var\(--ls-verm-ink\)/.test(css4) && /\.ls-open \.socria-asks \{/.test(css4) && /\.ls-ln\.is-read path/.test(css4) && /@keyframes ls-draw/.test(css4) && /prefers-reduced-motion/.test(css4));
ok('  loaded after space.css', /import '\.\/space\.css';[\s\S]{0,160}import '\.\/space-colour\.css';/.test(read('components/logos5/L5Space.tsx')));

console.log('\n=== Revision IV: linked to what exists ===');
const app4 = read('components/LogosApp.tsx');
ok('Revision V: no "Answering" chip; Socria’s question lives in its bubble', !/answering=\{/.test(app4) && /openHero=\{heroCard \?/.test(app4));
ok('  pressing the question while answering it puts the cursor in the chatbox', /onAnswer=\{\(\) => focusComposer\(\)\}/.test(app4) && /closest\?\.\('\.socria-asks'\)/.test(read('components/logos5/L5Space.tsx')));
ok('Memory’s gold count is what its Review holds: changes proposed, read again when Memory closes', /fetch\('\/api\/mind\/changes\?scope=logos'/.test(app4) && /c\?\.review === 'proposed'/.test(app4) && /\}, \[cloud, l5Mind\]\);/.test(app4) && /<MindButton onOpen=\{\(\) => setL5Mind\(true\)\} waiting=\{memWaiting\} \/>/.test(app4));
ok('Listen reads the open reply aloud with the browser’s own voice', /msgEl\(messages\[ot\.replyAt\], ot\.replyAt, undefined, \{ listen: true \}\)/.test(app4) && /function ListenButton/.test(read('components/logos5/L5Message.tsx')) && /SpeechSynthesisUtterance/.test(read('components/logos5/L5Message.tsx')));
const r2 = read('components/logos5/revision2.css');
// Socria One is the word in its own blue, themed (--lg-one: slate on Paper, light on the dark grounds — the raw slate
// was unreadable there), drawn once (tips.css) for both headers
ok('the wordmark top left in Instrument Serif; Socria One the word in its slate, no pill', /\.l5v-home-w \{ font-family: var\(--l5-serif/.test(r2) && /\.l5-onebtn \{[^}]*padding: 0;\s*border: 0;[^}]*background: none;[^}]*color: var\(--lg-one\);/.test(read('components/logos5/tips.css')) && !/#26485a/.test(r2));

console.log('\n=== Revision VI: every one of Socria’s replies ===');
ok('the thread counts Socria’s replies, one still arriving included, a question with no reply not', S.threadReplies(cTurns) === 3 && S.threadReplies([...cTurns, { asked: 'and?', said: '', pending: true }]) === 4 && S.threadReplies([...cTurns, { asked: 'and?', said: '' }]) === 3);
ok('  a reply says what it said, and the question it ends on stands on its own', J(S.threadWords({ said: 'That leaves £240. Would a flatshare still feel like moving out?', asks: 'Would a flatshare still feel like moving out?' })) === J({ said: 'That leaves £240.', asks: 'Would a flatshare still feel like moving out?' }) && J(S.threadWords({ said: 'Let’s see.' })) === J({ said: 'Let’s see.', asks: '' }));
ok('  a reply that is only its question does not say it twice', S.threadWords({ said: 'What do you take…', asks: 'What do you take home each month?' }).said === '');
ok('the bubble counts the replies before it, a button that opens the thread', /class="ls-bub has-tail has-earlier"/.test(wide) && /<button type="button" class="ls-earlier" aria-expanded="false"><span class="ls-earlier-n">2<\/span>earlier replies<\/button>/.test(wide));
ok('  with one reply there is nothing earlier: no count, no stack', (() => { const x = html(h(S.L5Space, props({ turns: cTurns.slice(0, 1), openTurn: 0, openId: 'q' }))); return !/ls-earlier/.test(x) && !/has-earlier/.test(x); })());
ok('  closed until pressed: the space alone at first', !/class="ls-thread"/.test(wide));
const sp6 = read('components/logos5/L5Space.tsx');
ok('the thread: your words, then each reply signed Socria with what it lit and what it made; the newest marked', /className="ls-thread" aria-label="Socria’s replies"/.test(sp6) && /className="ls-mine"/.test(sp6) && /ls-tb\$\{r\.index === openTurn \? ' is-now' : ''\}/.test(sp6) && /ls-tchip is-lit/.test(sp6) && /ls-tchip is-made/.test(sp6));
ok('  a reply hovered or focused lights what it made on the canvas', /onMouseEnter=\{\(\) => setHoverTurn\(r\.index\)\}/.test(sp6) && /onFocus=\{\(\) => setHoverTurn\(r\.index\)\}/.test(sp6) && /glow\.has\(k\) \? ' is-glow' : ''/.test(sp6));
ok('  opens at the newest reply; Esc puts it away; a phone has it as a sheet with Done', /el\.scrollTop = el\.scrollHeight/.test(sp6) && /e\.key === 'Escape'\) setThreadOn\(false\)/.test(sp6) && /narrow \? 'Done' : 'Back to the space ×'/.test(sp6));
const css6 = read('components/logos5/space.css');
ok('  the space and the chatbox keep to its left; on a phone it is pulled up over the space', /\.ls\.has-thread:not\(\.is-phone\) \.ls-canvas \{ margin-right: 440px; \}/.test(css6) && /\.ls\.is-phone \.ls-thread \{[^}]*border-radius: 18px 18px 0 0/.test(css6) && /\.ls-it\.is-glow > \*/.test(css6));

console.log('\n=== consistency pass: made things seen whole, enlarged, found ===');
{
  const x = html(h(S.L5Space, props({ made: [{ key: 'budget', kicker: 'Made · Table', title: 'Your month, if you move', turn: 2, preview: h('table', { className: 'the-table' }), onOpen: () => {} }] })));
  ok('a made thing on the canvas is drawn to fit its card, and pressing it enlarges it (not straight beside)', /class="ls-made has-prev"[^>]*role="button"[^>]*aria-label="Made · Table: Your month, if you move\. Enlarge it"/.test(x) && /class="ls-prev is-fit"/.test(x) && /class="ls-enl"[^>]*>[\s\S]*?Enlarge/.test(x), x.slice(x.indexOf('ls-made'), x.indexOf('ls-made') + 400));
  const plain = html(h(S.L5Space, props({ made: [{ key: 'plain', kicker: 'Made · Model', title: 'Saddle', turn: 2, onOpen: () => {} }] })));
  ok('  with nothing to show, it opens beside the space as before', /class="ls-made"[^>]*aria-label="Made · Model: Saddle\. Open it"/.test(plain));
  const src = read('components/logos5/L5Space.tsx');
  ok('  enlarged: over the space, its title, the way to work with it beside, and Close; Esc and the backdrop close it', /className="ls-lb" role="dialog" aria-modal="true"/.test(src) && /Work with it beside the space/.test(src) && /aria-label="Close" onClick=\{\(\) => setEnlarged\(null\)\}/.test(src) && /e\.target === e\.currentTarget && setEnlarged\(null\)/.test(src) && /if \(e\.key === 'Escape'\) \{\s*e\.stopPropagation\(\);\s*setEnlarged\(null\);/.test(src));
  ok('  Made and Brought in the row scroll the canvas to what they bring forward', /kind === 'made' \? '\.ls-col\.is-made' : '\.ls-col\.is-frame'/.test(src));
  const css = read('components/logos5/space.css');
  ok('  fitted by laying it out at a reading width and scaling it down; a tall one fades', /\.ls-prev\.is-fit > \.ls-inert \{[^}]*width: 440px;[^}]*zoom: 0\.55;[^}]*mask-image/.test(css));
  ok('  one focus ring for every control in the space and on the map', /:is\(\.ls-chip, \.ls-tchip, \.ls-hero, \.ls-earlier, \.ls-kd, \.ls-tb, \.l5mm-btn, \.l5h-btn, \.l5h-link, \.l5-unibtn\):focus-visible \{ outline: 2px solid var\(--c-moss\); outline-offset: 2px; \}/.test(css));
}
{
  const app = read('components/LogosApp.tsx');
  ok('in the one space a view or an artifact asked for opens beside it (no more buttons changing a screen nobody sees)', /if \(oneViewRef\.current\) setBoardBeside\(t === 'chat' \? null : besideOnBoard\(t\)\);/.test(app) && (app.match(/if \(oneViewRef\.current\) setBoardBeside\('artifacts'\);/g) ?? []).length === 2 && /oneViewRef\.current = oneView;/.test(app));
  ok('  "put X beside" and "close" in words act on what is beside the space', /is open beside the space now\./.test(app) && /Closed what was open beside the space\./.test(app) && /if \(!boardBesideRef\.current\) return \{ said: 'Nothing is open beside the space\.' \};/.test(app));
  ok('  a message jumped to opens its idea in the space; a search hit opens the line on its idea', /if \(idea\) setSpaceOpen\(idea\);/.test(app) && /if \(oneViewRef\.current && spaceView\) return setSpaceOpen\(node\);/.test(app));
  ok('  AR Mode is offered (in Account\u2019s experiments) only where a map is on screen', /activeId && !l5Home && !l5Mind \? \[oneOnly\(\{ label: 'AR Mode'/.test(app));
  {
    // the More menu, trimmed: no novelties; the experiments live in the account sheet
    const menu = app.slice(app.indexOf('const l5Menu: L5MenuItem[] = ['), app.indexOf('const experiments:'));
    const sheet = read('components/account/AccountSheet.tsx');
    ok('  More no longer offers saving the map as an image, Synthesize, hiding the bars, AR Mode, big-screen mode or turning hands on', !/Save the map as an image|label: 'Synthesize'|Hide the bars|label: 'AR Mode'|'Big-screen mode'|label: 'Use your hands'/.test(menu) && /label: 'Write'/.test(menu) && /label: 'Live guidance'/.test(menu) && /label: 'What Socria does'/.test(menu));
    ok('  but a way out of a running experiment stays in More', /cabin \? \[\{ label: 'Leave big-screen mode'/.test(menu) && /handsWanted \? \[\{ label: 'Stop using your hands'/.test(menu));
    ok('  Account has an Experiments section with them, each closing the sheet and starting', /experiments=\{experiments\}/.test(app) && /<span className="lbl">Experiments<\/span>/.test(sheet) && /\['acct-labs', 'Experiments'\]/.test(sheet) && /onClose\(\);\s*x\.onSelect\(\);/.test(sheet));
    ok('  Quick capture is off unless a deployment turns it on', /capture: on\(env\.capture\)/.test(read('lib/logos4/flags.ts')));
  }
  ok('  the account sheet opens Memory in the app, not the old page', /onMemory=\{cloud \? \(\) => setL5Mind\(true\) : undefined\}/.test(app) && /onMemory \? \(/.test(read('components/account/AccountSheet.tsx')));
  ok('  the Universal Map’s header says More and the shortcut, as a line’s does', /<L5Menu label="More" items=\{menu\} word button="More" \/>/.test(read('components/logos5/L5Chrome.tsx')) && /className="l5-kbd l5-unibtn-k"/.test(app));
  const ctl = read('components/logos5/l5-controls.css');
  ok('the paper is light again: its grain barely there (.055, was .18), and drawn once on the Universal Map', /0 0 0 \.055 0'\/%3E/.test(ctl) && /\.l5h-main \{ background-image: none; \}/.test(read('components/logos5/revision2.css')));
}

console.log('\n=== zooming the space (lib/logos5/spaceZoom.ts) ===');
{
  ok('a third to half as large again; a step of 1.2, through 100% exactly', S.SPACE_ZOOM.min === 0.35 && S.SPACE_ZOOM.max === 1.6 && S.zoomStep(1, -1) === 0.83 && S.zoomStep(0.83, 1) === 1 && S.zoomStep(1.2, -1) === 1 && S.zoomStep(1, 1) === 1.2);
  ok('  never past either end', S.zoomStep(0.35, -1) === 0.35 && S.zoomStep(1.6, 1) === 1.6 && S.clampZoom(9) === 1.6 && S.clampZoom(0) === 0.35 && S.clampZoom(NaN) === 1);
  ok('a pinch outward is smaller, inward larger, smoothly', S.zoomByWheel(1, 40) < 1 && S.zoomByWheel(1, -40) > 1 && Math.abs(S.zoomByWheel(1, 4) - 0.96) < 0.011);
  ok('Fit: the whole space above the chatbox, never larger than 100%', S.fitZoom({ w: 2000, h: 600 }, { w: 1000, h: 900 }, 200) === 0.5 && S.fitZoom({ w: 800, h: 300 }, { w: 1400, h: 900 }, 200) === 1 && S.fitZoom({ w: 1000, h: 1352 }, { w: 1400, h: 900 }, 200) === 0.5);
  ok('  and to the smallest when even that is not enough', S.fitZoom({ w: 9000, h: 600 }, { w: 1000, h: 900 }, 200) === 0.35);
  const at = S.anchorScroll({ left: 100, top: 50 }, { x: 400, y: 300 }, 1, 2);
  ok('the point zoomed about stays where it is', at.left === 600 && at.top === 400 && S.anchorScroll({ left: 0, top: 0 }, { x: 10, y: 10 }, 1, 0.5).left === 0);
  ok('  the readout', S.zoomLabel(0.83) === '83%' && S.zoomLabel(1) === '100%');
  ok('the keys sit in the row: −, the readout (back to 100%), +, Fit — on a wide screen only', /class="ls-zoom-keys" role="group" aria-label="Zoom the space"/.test(wide) && /aria-label="Zoom out"/.test(wide) && /aria-label="Zoom in"/.test(wide) && /class="is-pct"[^>]*>100%</.test(wide) && /class="is-fit"[^>]*>Fit</.test(wide) && !/ls-zoom-keys/.test(html(h(S.L5Space, props({ narrow: true })))));
  const src = read('components/logos5/L5Space.tsx');
  ok('  the cards and their lines scale as one, the scroll area sized to the zoomed space', /className="ls-zoom" style=\{zoomBox\}/.test(src) && /return \{ width: w \* zoom, height: Math\.max\(natural\.h \* zoom, hh\) \}/.test(src) && /transform: `scale\(\$\{zoom\}\)`/.test(src));
  ok('  the lines measured in the space\'s own units, so they stay on their cards at any zoom', /\(r\.left - cr\.left\) \/ z/.test(src) && /h: r\.height \/ z/.test(src));
  ok('  a pinch zooms about the pointer; pinched on out past the smallest, up to the Universal Map', /zoomByWheel\(k, e\.deltaY\), r \? \{ x: e\.clientX - r\.left, y: e\.clientY - r\.top \}/.test(src) && /e\.deltaY > 0 && k <= SPACE_ZOOM\.min/.test(src) && /pinchOut\(e, acc, Date\.now\(\)\) === 'move'\) zoomOutRef\.current\(\)/.test(src));
  ok('  what the chatbox covers can be scrolled clear at any zoom', /padding-bottom: calc\(\(var\(--ls-foot, 134px\) \+ 56px\) \/ var\(--ls-k, 1\)\)/.test(read('components/logos5/space.css')));
}

console.log('\n=== moving about the space, as on the Universal Map (lib/logos5/spaceMove.ts) ===');
{
  const M = S;
  ok('a stored arrangement is read with care: finite offsets only, nothing at 0,0, never thrown into the distance', J(M.readMoved('{"n:a":{"x":40.4,"y":-12},"n:b":{"x":0,"y":0},"n:c":{"x":"9","y":1},"n:d":{"x":1e9,"y":2}}')) === J({ 'n:a': { x: 40, y: -12 }, 'n:d': { x: 20000, y: 2 } }) && J(M.readMoved('not json')) === '{}' && J(M.readMoved('[1,2]')) === '{}' && J(M.readMoved(null)) === '{}');
  ok('  stored per conversation; nothing stored once every card is back', M.movedStoreKey('abc') === 'socria.l5.space-moved.v1:abc' && M.writeMoved({}) === null && M.writeMoved({ 'n:a': { x: 0, y: 0 } }) === null && M.writeMoved({ 'n:a': { x: 3, y: 4 } }) === '{"n:a":{"x":3,"y":4}}');
  const m1 = M.moveBy({}, ['n:a', 'm:x'], 30, -10);
  ok('cards moved together; moved back to where they were laid out, they leave the arrangement', J(m1) === J({ 'n:a': { x: 30, y: -10 }, 'm:x': { x: 30, y: -10 } }) && J(M.moveBy(m1, ['n:a'], -30, 10)) === J({ 'm:x': { x: 30, y: -10 } }) && M.moveBy(m1, [], 5, 5) === m1);
  ok('  a card is drawn where it was put, plus the drag carrying it', J(M.shiftOf(m1, 'n:a', { keys: ['n:a'], dx: 5, dy: 5 })) === J({ x: 35, y: -5 }) && J(M.shiftOf(m1, 'n:z', null)) === J({ x: 0, y: 0 }));
  ok('a drag never takes a card past the space\'s top or left edge (nothing can scroll there)', J(M.clampDrag(-500, -500, [{ l: 100, t: 60 }, { l: 300, t: 20 }])) === J({ dx: -92, dy: -12 }) && J(M.clampDrag(40, 50, [{ l: 100, t: 60 }])) === J({ dx: 40, dy: 50 }));
  const cards = [
    { key: 'a', l: 0, t: 0, r: 100, b: 50 },
    { key: 'b', l: 200, t: 0, r: 300, b: 50 },
    { key: 'c', l: 0, t: 200, r: 100, b: 250 },
  ];
  ok('Shift-drag: the rectangle chooses the cards it touches; a click is not a rectangle', J(M.cardsIn({ x0: 50, y0: 20, x1: 220, y1: 30 }, cards)) === J(['a', 'b']) && J(M.cardsIn({ x0: 5, y0: 5, x1: 6, y1: 6 }, cards)) === '[]');
  ok('arrows go to the nearest card that way, straight ahead before off to the side', M.nextCard('right', 'a', cards) === 'b' && M.nextCard('down', 'a', cards) === 'c' && M.nextCard('left', 'a', cards) === null);
  const plain = { shiftKey: false, altKey: false };
  ok('  on a card an arrow goes to a card; Shift and an arrow move the view; Alt and an arrow move the card', J(M.arrowIntent('ArrowRight', plain, true)) === J({ kind: 'card', way: 'right' }) && J(M.arrowIntent('ArrowUp', { shiftKey: true, altKey: false }, true)) === J({ kind: 'pan', dx: 0, dy: -60 }) && J(M.arrowIntent('ArrowLeft', { shiftKey: false, altKey: true }, true)) === J({ kind: 'nudge', dx: -16, dy: 0 }) && J(M.arrowIntent('ArrowDown', { shiftKey: true, altKey: true }, true)) === J({ kind: 'nudge', dx: 0, dy: 64 }));
  ok('  with no card focused, arrows move the view; other keys are not arrows', J(M.arrowIntent('ArrowDown', plain, false)) === J({ kind: 'pan', dx: 0, dy: 60 }) && M.arrowIntent('a', plain, true) === null);
  const src = read('components/logos5/L5Space.tsx');
  const css = read('components/logos5/space.css');
  const wide = html(h(S.L5Space, props()));
  ok('the canvas takes the Universal Map\'s gestures: press, drag, let go, a pinch, the keys', /onPointerDown=\{onCanvasDown\}/.test(src) && /onPointerMove=\{onCanvasMove\}/.test(src) && /onPointerCancel=\{\(e\) => onCanvasUp\(e, true\)\}/.test(src) && /onKeyDown=\{onCanvasKey\}/.test(src) && /class="ls-canvas l5-dots" tabindex="0" role="region" aria-label="The space\. Drag the empty space to move around it, drag a card to move it/.test(wide));
  ok('  the empty space dragged moves the view; a finger that did not wait moves it too', /sc\.scrollLeft = g\.left - dx;/.test(src) && /if \(g\.kind === 'card' && !g\.held\) g\.kind = 'pan';/.test(src) && /SPACE_MOVE\.holdMs/.test(src));
  ok('  a card dragged is put there and kept for the conversation; a chosen card carries the others', /keepMoved\(moveBy\(moved, c\.keys, c\.dx, c\.dy\)\)/.test(src) && /localStorage\.setItem\(movedStoreKey\(spaceId\), v\)/.test(src) && /g\.keys = chosen\.has\(g\.key\) \? \[\.\.\.chosen\] : \[g\.key\]/.test(src));
  ok('  a card let go after a drag is not also opened', /swallowNext\(\);/.test(src) && /el\.addEventListener\('click', on, true\)/.test(src));
  ok('  the lines follow a moved card: it is drawn shifted (translate, so the arrival still plays) and they are measured from it', /st\.translate = `\$\{o\.x\}px \$\{o\.y\}px`/.test(src) && /querySelector<HTMLElement>\(`\[data-k="\$\{CSS\.escape\(k\)\}"\]`\)/.test(src));
  ok('  Socria\'s reply stays words a mouse can select; a finger on it moves the space', /if \(inReply && type !== 'touch'\) return null;/.test(src) && /\.ls:not\(\.is-phone\) \.ls-canvas \{ cursor: grab; touch-action: none; \}/.test(css) && /\.ls:not\(\.is-phone\) \.ls-bub \{ cursor: auto; \}/.test(css));
  ok('  + and − zoom, 0 fits, Escape lets go of what was chosen', /e\.key === '0'\) \(e\.preventDefault\(\), fitSpace\(\)\)/.test(src) && /e\.key === 'Escape' && chosen\.size/.test(src));
  ok('"Put back" appears once a card has been moved, and puts every card back', !/ls-putback/.test(wide) && /Put back/.test(src) && /keepMoved\(\{\}\);/.test(src));
  ok('a phone\'s column is not moved about', /if \(narrow\) return st;/.test(src) && /const placed_ = \(k: string\) => \(narrow \? ''/.test(src));
  ok('LogosApp keeps the arrangement under the conversation', /spaceId=\{activeId\}/.test(read('components/LogosApp.tsx')));
  ok('room to move: the space sits in room of its own on every side, the view starts on the space, and keeps its place', /\.ls-slack \{ position: relative; box-sizing: content-box; width: max-content; padding: 38vh 45vw; \}/.test(css) && /className="ls-slack" ref=\{slackRef\}/.test(src) && /sc\.scrollLeft = now\.x;/.test(src) && /sc\.scrollLeft \+= now\.x - was\.x;/.test(src));
  ok('  zooming, Fit, the row and the open idea all count the room: the view never rests in it by itself', J(S.anchorScroll({ left: 700, top: 400 }, { x: 100, y: 100 }, 1, 2, { x: 600, y: 300 })) === J({ left: 900, top: 600 }) && /pendingScroll\.current = \{ left: room\.x, top: room\.y \}/.test(src) && /slackOf\(\)\.x \+ col\.offsetLeft \* zoomRef\.current - 40/.test(src) && /Math\.max\(edge, left - 40\)/.test(src));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
