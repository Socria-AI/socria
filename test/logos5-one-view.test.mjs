// LOGOS 5.5 — VIII · ONE VIEW. ONE BOARD. THE CHATBOX IS THE CHAT.
//
//   oneView   when the board is the view; what a tab brings forward; what may
//             open beside the board (never the conversation); the turn the
//             sheet reads and how ↑ ↓ step; the ideas a turn lit; the pinned
//             card's ideas (question first, lit next, all on the Logic Map
//             tab); the board's zoom, fitted beside
//   canvas    each turn knows where its question and reply are
//   L5Board   no bar (no filters, no Back to chat); one pinned Logic Map card;
//             the turn being read is not on the board; cards wired to turns;
//             zoom a tray in the corner; the sheet: Turn i of n, ↑ ↓, Fold
//   wiring    LogosApp: the board as the view on a wide screen, tabs move the
//             camera, Split View in the header opens beside the board, the
//             guard on the chatbox's first line, the phone keeps its canvas

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import * as O from './.tmp/one-view-under-test.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 300))));
const J = JSON.stringify;
// React warns that layout effects do nothing on the server; the markup is what is checked
const quiet = (f) => { const e = console.error; console.error = () => {}; try { return f(); } finally { console.error = e; } };
const html = (el) => quiet(() => renderToStaticMarkup(el));

console.log('\n=== oneView: when the board is the view ===');
ok('a wide screen, a line of thinking with something in it', O.oneViewOn({ narrow: false, line: true, turns: 2, busy: false }));
ok('  the first message on its way counts', O.oneViewOn({ narrow: false, line: true, turns: 0, busy: true }));
ok('  not on a phone, not on an empty line, not off a line', !O.oneViewOn({ narrow: true, line: true, turns: 3, busy: false }) && !O.oneViewOn({ narrow: false, line: true, turns: 0, busy: false }) && !O.oneViewOn({ narrow: false, line: false, turns: 3, busy: false }));

console.log('\n=== oneView: the tabs move the camera ===');
ok('Chat: everything forward', ['turns', 'content', 'artifacts', 'map'].every((p) => O.forward('chat', p)));
ok('Files: what was brought forward, the rest back', O.forward('content', 'content') && !O.forward('content', 'turns') && !O.forward('content', 'map') && !O.forward('content', 'artifacts'));
ok('Artifacts: what was made forward', O.forward('artifacts', 'artifacts') && !O.forward('artifacts', 'content') && !O.forward('artifacts', 'turns'));
ok('Logic Map: the ideas forward', O.forward('logic_map', 'map') && !O.forward('logic_map', 'turns'));
ok('a card\'s part, by its tone', O.partOfTone('content') === 'content' && O.partOfTone('artifact') === 'artifacts' && O.partOfTone('practice') === 'artifacts' && O.partOfTone('map') === 'map');

console.log('\n=== oneView: Split View — one thing beside the board, never the conversation ===');
ok('Files, Artifacts, the Logic Map may open beside', O.besideOnBoard('content') === 'content' && O.besideOnBoard('artifacts') === 'artifacts' && O.besideOnBoard('logic_map') === 'logic_map');
ok('  the conversation never: it is the chatbox', O.besideOnBoard('chat') === null && O.besideOnBoard(null) === null && O.besideOnBoard(undefined) === null);
ok('chosen: it opens; chosen again: it goes; another: it takes the place', O.toggleBeside(null, 'logic_map') === 'logic_map' && O.toggleBeside('logic_map', 'logic_map') === null && O.toggleBeside('logic_map', 'artifacts') === 'artifacts' && O.toggleBeside('content', 'chat') === null);

console.log('\n=== oneView: the sheet reads a turn ===');
ok('the newest, unless another was pressed', O.sheetTurn(3, null) === 2 && O.sheetTurn(3, 0) === 0 && O.sheetTurn(3, 7) === 2 && O.sheetTurn(3, -1) === 2 && O.sheetTurn(0, null) === null);
ok('"Turn 3 of 3"', O.turnOfLabel(2, 3) === 'Turn 3 of 3' && O.turnOfLabel(0, 1) === 'Turn 1 of 1');
ok('↑ is the turn before, ↓ the turn after, nothing past either end', O.stepTurn(1, 3, 'up') === 0 && O.stepTurn(1, 3, 'down') === 2 && O.stepTurn(0, 3, 'up') === null && O.stepTurn(2, 3, 'down') === null);
ok('under the reply, the way to what its turn made', O.madeLink('Live graph') === 'Live graph, beside this turn' && O.madeLink('') === null && O.madeLink(undefined) === null);

console.log('\n=== oneView: the Logic Map card, pinned, reads the turn being read ===');
const from = new Map([['u1', ['q']], ['a1', ['s1']], ['u3', ['s3', 'c1']], ['a3', ['s3']]]);
ok('the ideas a turn lit: its question\'s and its reply\'s, once each', J([...O.litBy({ askedId: 'u3', replyId: 'a3' }, from)].sort()) === J(['c1', 's3']) && O.litBy({ askedId: 'u9' }, from).size === 0 && O.litBy(null, from).size === 0 && O.litBy({ askedId: 'u1' }, null).size === 0);
const NODES = [
  { id: 's1', type: 'step', label: 'Identify the interval' },
  { id: 'c1', type: 'concept', label: 'Riemann sum' },
  { id: 'q', type: 'question', label: 'Interval doesn’t start at 0' },
  { id: 's2', type: 'step', label: 'Divide the interval' },
  { id: 's3', type: 'step', label: 'Find change in x' },
  { id: 's4', type: 'step', label: 'Heights from the left' },
  { id: 's5', type: 'step', label: 'Add the areas' },
];
const card = O.mapCardIdeas(NODES, new Set(['s3', 'c1']), false);
ok('the question first, then what the turn lit, then the rest — five, and how many more', J(card.shown.map((n) => n.id)) === J(['q', 'c1', 's3', 's1', 's2']) && card.more === 2);
ok('  on the Logic Map tab, all of them', O.mapCardIdeas(NODES, new Set(), true).shown.length === 7 && O.mapCardIdeas(NODES, new Set(), true).more === 0);
ok('  "Pinned · turn 3 lit", "Pinned" when it lit nothing', O.pinnedLabel(2, 2) === 'Pinned · turn 3 lit' && O.pinnedLabel(2, 0) === 'Pinned' && O.pinnedLabel(null, 3) === 'Pinned');

console.log('\n=== oneView: zoom ===');
ok('whole at first, fitted beside, within its bounds', O.BOARD_ZOOM.start === 1 && O.BOARD_ZOOM.beside < 1 && O.clampBoardZoom(5) === O.BOARD_ZOOM.max && O.clampBoardZoom(0.01) === O.BOARD_ZOOM.min);
ok('  fit: never closer than whole, smaller when the room is', O.fitZoom(1200, 2400) === 1 && O.fitZoom(1200, 600) === 0.5 && O.fitZoom(1000, 800) === 0.8 && O.fitZoom(0, 800) === 1);

console.log('\n=== canvas: each turn knows where its words are ===');
const MSGS = [
  { id: 'u1', role: 'user', content: 'i need you to teach me rectangles' },
  { id: 'a1', role: 'assistant', content: 'Rectangles are a good place to start.' },
  { role: 'user', content: 'and how do i do it' },
];
const turns = O.canvasTurns(MSGS, { pending: true });
ok('question and reply placed', turns[0].askedAt === 0 && turns[0].replyAt === 1 && turns[1].askedAt === 2 && turns[1].replyAt === undefined);
ok('  a question not yet saved (no id) is still a turn, and the one being answered', turns.length === 2 && turns[1].pending === true);

console.log('\n=== L5Board: one board ===');
const T = O.canvasTurns([...MSGS.slice(0, 2), { id: 'u2', role: 'user', content: 'riemann sums' }, { id: 'a2', role: 'assistant', content: 'A Riemann sum is that guess done several times.' }, { id: 'u3', role: 'user', content: 'and how do i do it' }, { id: 'a3', role: 'assistant', content: 'The next step is how wide each piece is.' }]);
const cards = [
  { key: 'c:f', lane: 'made', tone: 'content', kicker: 'File · Brought', title: 'Week 6 · Riemann sums.pdf', turn: 0, preview: null, note: '4 pages · read', onOpen: () => {} },
  { key: 'e:g', lane: 'made', tone: 'artifact', kicker: 'Artifact · Live graph', title: 'Rectangles under x²', turn: 2, preview: h('svg', { className: 'GRAPH' }), note: '4 rectangles · heights from the left', onOpen: () => {} },
];
const ideas = NODES.map((n) => ({ ...n, kind: n.type[0].toUpperCase() + n.type.slice(1) }));
const board = (o = {}) => html(h(O.L5Board, { turns: T, reading: 2, cards, map: { ideas, lit: new Set(['s3']), at: 2, picked: 's3', onIdea: () => {}, onOpen: () => {} }, camera: 'chat', dock: h('div', { className: 'DOCK' }, 'THE CHATBOX'), besideOpen: false, onRead: () => {}, ...o }));
const b = board();
ok('no bar: no filters, no zoom group, no Back to chat', !/Everything|Back to chat|lcv-bar|lcv-seg/.test(b));
ok('one Logic Map card, pinned, its count and the turn it reads', (b.match(/class="lob-map /g) || []).length === 1 && b.includes('Logic Map · 7 ideas') && b.includes('Pinned · turn 3 lit'));
ok('  the question first and whole-width; the lit one marked; the one asked about pressed', /lob-idea is-q/.test(b) && /lob-idea is-lit is-picked" aria-pressed="true"/.test(b) && b.includes('+ 2 more ideas'));
ok('the turn being read is not on the board: it is open above the chatbox', (b.match(/class="lob-turn/g) || []).length === 2 && !b.includes('data-turn="2"') && b.includes('data-turn="0"'));
ok('  a turn: your words in your bubble, then Socria, Turn n, the gist', /<span class="lob-you">i need you to teach me rectangles<\/span>/.test(b) && /Socria<\/span><span class="lob-n">Turn 1<\/span>/.test(b));
ok('what was brought and made on the right, each wired to its turn', /lob-card is-content" data-part="content" data-card-turn="0"/.test(b) && /lob-card is-artifact" data-part="artifacts" data-card-turn="2"/.test(b) && b.includes('class="lob-wires"'));
ok('  a drawing is shown, not used: inert', /lob-inert" aria-hidden="true"><svg class="GRAPH"/.test(b));
ok('zoom is a tray in the corner: −, the percentage, +, fit', /class="lob-tray" role="group" aria-label="Zoom"/.test(b) && b.includes('100%') && b.includes('aria-label="Fit the board to the screen"'));
ok('the dock — the sheet and the chatbox — at the foot of the spine', /class="lob-dock"><div class="DOCK">THE CHATBOX<\/div>/.test(b));
const folded = board({ reading: null });
ok('folded: every turn is on the board', (folded.match(/class="lob-turn/g) || []).length === 3);
const onMap = board({ camera: 'logic_map' });
ok('the Logic Map tab: all the ideas, everything else steps back', !onMap.includes('more ideas') && (onMap.match(/class="lob-idea[ "]/g) || []).length === 7 && /lob-turn is-back/.test(onMap) && /lob-card is-content is-back/.test(onMap) && !/lob-map l5-holder is-back/.test(onMap));
const onFiles = board({ camera: 'content' });
ok('the Files tab: what was brought forward', !/lob-card is-content is-back/.test(onFiles) && /lob-card is-artifact is-back/.test(onFiles) && /lob-map l5-holder is-back/.test(onFiles));
ok('no ideas yet: no map card', !board({ map: null }).includes('class="lob-map '));

console.log('\n=== ReplySheet: the chatbox is the chat ===');
const sheet = html(h(O.ReplySheet, { label: 'Turn 3 of 3', onUp: () => {}, onDown: null, onFold: () => {}, follow: false, foot: h('button', { className: 'lob-made' }, 'Live graph, beside this turn') }, h('p', null, 'THE REPLY')));
ok('Socria, Turn 3 of 3, ↑ ↓ and Fold', sheet.includes('Socria') && sheet.includes('Turn 3 of 3') && sheet.includes('aria-label="The turn before"') && /aria-label="The turn after"[^>]*disabled|disabled=""[^>]*aria-label="The turn after"/.test(sheet) && sheet.includes('Fold'));
ok('  the turn in full, and the way to what it made', sheet.includes('<p>THE REPLY</p>') && sheet.includes('Live graph, beside this turn'));

console.log('\n=== wired into LogosApp ===');
const app = read('components/LogosApp.tsx');
ok('the board is the view on a wide screen; the phone keeps its canvas', /const oneView = oneViewOn\(\{ narrow,/.test(app) && /const primaryEl = oneView \? boardEl : viewEl\(studyTab\);/.test(app) && /const canvasEl = zoomed && !oneView/.test(app));
ok('  the turn read is the one pressed, else the newest; a send opens the newest', /const sheetAt = oneView && sheetOpen \? sheetTurn\(boardTurns\.length, reading\) : null;/.test(app) && /if \(lastRole !== 'user'\) return;\s*setReading\(null\);\s*setSheetOpen\(true\);/.test(app));
ok('  the sheet draws a turn as the conversation does (one message renderer for both)', /const msgEl = \(m: Msg, i: number\) =>/.test(app) && /\{messages\.map\(msgEl\)\}/.test(app) && /msgEl\(messages\[t\.askedAt\], t\.askedAt\)/.test(app) && /msgEl\(messages\[t\.replyAt\], t\.replyAt\)/.test(app));
ok('  the pinned card lights what the turn being read put on the map', /litBy\(litAt !== null \? turns\[litAt\] : null, links\?\.fromMsg\)/.test(app));
ok('the tabs move the camera; elsewhere they open the view', /onChange=\{\(v\) => \(oneView \? moveCamera\(v as Viewport\) : openFull\(v as Viewport\)\)\}/.test(app) && /camera=\{studyTab\}/.test(app));
ok('Split View in the header opens one thing beside the board; never the conversation', /split=\{oneView \? <SplitView menu=\{splitChoices\} besideOn=\{!!besideEl\} onPick=\{pickSplit\} board \/> : undefined\}/.test(app) && /return setBoardBeside\(\(b\) => toggleBeside\(b, c\.beside\)\);/.test(app) && /view: oneView \? 'chat' : studyTab,/.test(app));
ok('  nothing floats over the board: no view actions, no floating composer', /actions=\{oneView \? null : viewActsEl\}/.test(app) && /omni=\{oneView \|\| convoOpen \|\| zoomed \? null : l5Dock\}/.test(app));
ok('the guard is the chatbox\'s first line, not a bar', /guide=\{guarded && l5 \? \{ onHint: \(\) => void send\('Can I have another hint\?'\), onReveal: reveal, busy \} : null\}/.test(app) && /\{guarded && !l5 && \(/.test(app));
const composer = read('components/LogosComposer.tsx');
ok('  "Guiding, not solving" at its start, Another hint and Show solution at its end, beside "Asking about"', /Guiding, not solving/.test(composer) && /l5-guide-acts/.test(composer) && /Another hint/.test(composer) && /Show solution/.test(composer) && /\(about \|\| guide\) &&/.test(composer));
const css = read('components/logos5/board.css');
const sizes = [...css.matchAll(/font-size:\s*([\d.]+)px/g)].map((m) => Number(m[1]));
const radii = [...css.matchAll(/border-radius:\s*([\d.]+)px/g)].map((m) => Number(m[1]));
ok('the board\'s sheet keeps the six steps and four radii; no blur', sizes.every((n) => [32, 18, 15.5, 13.5, 12.5, 10.5].includes(n)) && radii.every((n) => [999, 16, 10, 6].includes(n)) && !/backdrop-filter|blur\(/.test(css), J({ sizes, radii }));

console.log(`\none view: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
