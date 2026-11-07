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
ok('the row brings a kind forward: Everything, Ideas, Brought, Made, Words — buttons, not tabs', /class="ls-kinds"/.test(wide) && ['Everything', 'Ideas', 'Brought', 'Made', 'Words'].every((k) => wide.includes(`>${k}`)) && !/role="tab"/.test(wide) && /aria-pressed="true"/.test(wide));
ok('  with counts: 6 ideas, 1 brought, 1 made, 3 turns', /Ideas<span class="ls-c">6<\/span>/.test(wide) && /Brought<span class="ls-c">1<\/span>/.test(wide) && /Made<span class="ls-c">1<\/span>/.test(wide) && /Words<span class="ls-c">3 turns<\/span>/.test(wide));
ok('each kind its own card: ideas, a file with its folded corner, something made, the open idea', /class="ls-idea/.test(wide) && /class="ls-file"/.test(wide) && /class="ls-made"/.test(wide) && /class="ls-open"/.test(wide));
ok('  every card says the turn that made it', /<span class="ls-tn">turn ii<\/span>/.test(wide) && /turn iii · newest/.test(wide));
ok('  the open idea: its kind, what you said, the idea, then the reply inside it', /Idea · open/.test(wide) && /<b>You<\/b>“I want to save £300”/.test(wide) && /<h2 class="ls-stmt">A flatshare at £750<\/h2>/.test(wide) && /class="reply"/.test(wide));
ok('  lit ideas from the open turn', /ls-idea is-idea is-lit/.test(wide));
ok('  the question framed first, in its own column', /class="ls-col is-frame"[\s\S]*Your question/.test(wide));
ok('the chatbox at the foot, with what it is answering and a way to set that aside', /class="ls-chat"/.test(wide) && /Answering <b>A flatshare at £750<\/b>/.test(wide) && /class="the-chatbox"/.test(wide));
ok('the conversation as a page, a press away', /Read as a conversation/.test(wide));
ok('a reply with no idea yet is read on its own card', /aria-label="The newest reply"/.test(html(h(S.L5Space, props({ openId: null })))));
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
