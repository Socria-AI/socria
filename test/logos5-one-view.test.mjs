// LOGOS 5.5 — VIII · ONE VIEW. ONE BOARD. THE CHATBOX IS THE CHAT.
//
//   oneView   when the board is the view; what a tab brings forward; what may
//             open beside the board (never the conversation); the turn the
//             sheet reads and how ↑ ↓ step; the ideas a turn lit; the pinned
//             card's ideas (question first, lit next, all on the Logic Map
//             tab); the board's zoom, fitted beside
//   canvas    each turn knows where its question and reply are
//   L5Board   Revision II, the one view set as a page: three columns — the
//             Logic Map (steps on a rail, lit and dashed ideas), the
//             conversation (turns in roman numerals, one open, the rest
//             folded; the ruled chatbox at its foot), brought and made (cells
//             marking their turn); the tabs dim what is outside their part
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
ok('  on a phone too (as panels side by side); not on an empty line, not off a line', O.oneViewOn({ narrow: true, line: true, turns: 3, busy: false }) && !O.oneViewOn({ narrow: false, line: true, turns: 0, busy: false }) && !O.oneViewOn({ narrow: true, line: false, turns: 3, busy: false }));
ok('  a phone: each tab brings its panel — Logic Map left, the conversation, then brought and made', O.panelOf('logic_map') === 0 && O.panelOf('chat') === 1 && O.panelOf('content') === 2 && O.panelOf('artifacts') === 2);
ok('  and a swipe to a panel chooses its tab, keeping Files or Artifacts on the third', O.cameraOfPanel(0, 'chat') === 'logic_map' && O.cameraOfPanel(1, 'logic_map') === 'chat' && O.cameraOfPanel(2, 'chat') === 'artifacts' && O.cameraOfPanel(2, 'content') === 'content');

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

console.log('\n=== Revision II: numerals, the turn being read, steps, ideas not come up yet ===');
ok('turns in lowercase roman: i, iv, ix, xii, xl, mcmxcix; nothing for none', O.roman(1) === 'i' && O.roman(4) === 'iv' && O.roman(9) === 'ix' && O.roman(12) === 'xii' && O.roman(40) === 'xl' && O.roman(1999) === 'mcmxcix' && O.roman(0) === '' && O.roman(-2) === '' && O.roman(2.5) === '');
ok('  past 3999, plain digits', O.roman(4000) === '4000');
ok('"Reading turn iii of iii"; nothing when there is nothing to read', O.readingLabel(2, 3) === 'Reading turn iii of iii' && O.readingLabel(0, 1) === 'Reading turn i of i' && O.readingLabel(null, 3) === '' && O.readingLabel(0, 0) === '');
const STEPS = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
const st = O.stepStates(STEPS, new Set(['b']));
ok('steps: before the one the turn lit are done, it is now, after it ahead', st.get('a') === 'done' && st.get('b') === 'now' && st.get('c') === 'ahead' && st.get('d') === 'ahead');
ok('  the last lit step is now; none lit — all done', O.stepStates(STEPS, new Set(['a', 'c'])).get('c') === 'now' && O.stepStates(STEPS, new Set(['a', 'c'])).get('b') === 'done' && [...O.stepStates(STEPS, new Set()).values()].every((v) => v === 'done'));
const TT = [{ askedId: 'u1', replyId: 'a1' }, { askedId: 'u2', replyId: 'a2' }, { askedId: 'u3', replyId: 'a3' }];
const FM = new Map([['u1', ['q']], ['u2', ['s1', 'q']], ['a2', ['s2']], ['u3', ['s3']]]);
ok('ideas not come up yet: put there first by a later turn', J([...O.aheadOf(TT, FM, 0)].sort()) === J(['s1', 's2', 's3']) && J([...O.aheadOf(TT, FM, 1)]) === J(['s3']) && O.aheadOf(TT, FM, 2).size === 0);
ok('  nothing read, or no record: none ahead', O.aheadOf(TT, FM, null).size === 0 && O.aheadOf(TT, null, 0).size === 0);
ok('a map idea\'s shelf: the question, a given, a step on the way, any other idea', O.shelfOf({ type: 'question' }) === 'question' && O.shelfOf({ type: 'given' }) === 'given' && O.shelfOf({ type: 'unknown' }) === 'given' && O.shelfOf({ type: 'step' }) === 'step' && O.shelfOf({ type: 'result' }) === 'step' && O.shelfOf({ type: 'process', role: 'step' }) === 'step' && O.shelfOf({ type: 'concept' }) === 'idea' && O.shelfOf({ type: 'claim', role: 'branch' }) === 'idea');
ok('the question a reply ends on — what a folded turn shows', O.closingAsk('Width times height. If you cut it into 4 strips, how wide is each one?') === 'If you cut it into 4 strips, how wide is each one?' && O.closingAsk('No question here.') === '' && O.closingAsk('— Is that the share you expected?') === 'Is that the share you expected?');

console.log('\n=== what an idea does to another, in a line ===');
const EDGES = [
  { from: 'cl', to: 'q', relation: 'relates' },
  { from: 'ct', to: 'cl', relation: 'conflicts' },
  { from: 'ev', to: 'cl2', relation: 'supports' },
  { from: 'a', to: 'v', relation: 'depends' },
  { from: 'a', to: 'x', relation: 'supports' },
];
const LBL = { q: 'Did the alliances make it inevitable?', cl: 'The alliances made the war inevitable', cl2: 'The war plans made mobilisation mean war', v: 'My partner is here', x: 'Something else', ct: 'Italy stayed out' };
const rl = (id) => O.relationLine(id, EDGES, (k) => LBL[k]);
ok('a conflict, said from either end', J(rl('ct')) === J({ said: 'conflicts with', to: 'The alliances made the war inevitable' }) && J(rl('cl')) === J({ said: 'conflicts with', to: 'Italy stayed out' }));
ok('  what it supports; what it rests on before what it supports', J(rl('ev')) === J({ said: 'supports', to: 'The war plans made mobilisation mean war' }) && rl('a').said === 'rests on');
ok('  nothing to say: null (relates is not said; nor an idea with no lines)', rl('q') === null && rl('v') === null && rl('nobody') === null);
ok('  a long name is cut at a word', O.relationLine('p', [{ from: 'p', to: 'z', relation: 'supports' }], () => 'one two three four five six seven eight nine ten eleven twelve', 20).to.endsWith('…'));

console.log('\n=== one space: a pinch out goes up a level ===');
const acc = { n: 0, at: 0 };
ok('a pinch outward gathers, then moves; a pinch inward or a plain wheel is not one', O.pinchOut({ ctrlKey: true, deltaY: 40 }, acc, 1000) === 'gathering' && O.pinchOut({ ctrlKey: true, deltaY: 50 }, acc, 1050) === 'move' && O.pinchOut({ ctrlKey: true, deltaY: -40 }, acc, 1100) === null && O.pinchOut({ ctrlKey: false, deltaY: 200 }, acc, 1150) === null);
const acc2 = { n: 0, at: 0 };
ok('  a pause starts it over', O.pinchOut({ ctrlKey: true, deltaY: 60 }, acc2, 1000) === 'gathering' && O.pinchOut({ ctrlKey: true, deltaY: 30 }, acc2, 1600) === 'gathering');
ok('  without a browser to draw it, no move is drawn (the change is simply made)', O.canMorph() === false && O.MORPH_NAME === 'l5-line');

console.log('\n=== L5Board: the one view set as a page ===');
const T = O.canvasTurns([...MSGS.slice(0, 2), { id: 'u2', role: 'user', content: 'riemann sums' }, { id: 'a2', role: 'assistant', content: 'A Riemann sum is that guess done several times. Which edge would you take the height from?' }, { id: 'u3', role: 'user', content: 'and how do i do it' }, { id: 'a3', role: 'assistant', content: 'The next step is how wide each piece is.' }]);
ok('canvas: a turn keeps the question its reply ends on', T[1].asks === 'Which edge would you take the height from?' && T[0].asks === undefined);
const cards = [
  { key: 'c:f', lane: 'made', tone: 'content', kicker: 'File · Brought', title: 'Week 6 · Riemann sums.pdf', turn: 0, preview: null, note: '4 pages · read', onOpen: () => {} },
  { key: 'e:g', lane: 'made', tone: 'artifact', kicker: 'Artifact · Live graph', title: 'Rectangles under x²', turn: 2, preview: h('svg', { className: 'GRAPH' }), note: '4 rectangles · heights from the left', onOpen: () => {} },
];
const ideas = NODES.map((n) => ({ ...n, kind: n.type[0].toUpperCase() + n.type.slice(1), ...(n.id === 'c1' ? { rel: { said: 'conflicts with', to: 'Interval doesn’t start at 0' } } : {}) }));
const MAP = { ideas, lit: new Set(['s3']), ahead: new Set(['s5']), at: 2, picked: 's3', onIdea: () => {}, onOpen: () => {} };
const board = (o = {}) => html(h(O.L5Board, { turns: T, reading: 2, cards, map: MAP, camera: 'chat', open: h('div', { className: 'OPEN' }, 'THE OPEN TURN'), composer: h('div', { className: 'DOCK' }, 'THE CHATBOX'), besideOpen: false, onRead: () => {}, ...o }));
const b = board();
ok('three columns, no bar: no filters, no zoom tray, no Back to chat, no floating sheet', /class="lp cam-chat"/.test(b) && /lp-col lp-map l5-dots/.test(b) && /lp-col lp-convo/.test(b) && /lp-col lp-made/.test(b) && !/Everything|Back to chat|lcv-bar|lob-tray|lob-sheet|aria-label="Zoom"/.test(b));
ok('the dot grid only behind the Logic Map', (b.match(/l5-dots/g) || []).length === 1);
ok('the Logic Map: its count — the lit ideas say which turn, no label needed', b.includes('Logic Map · 7 ideas') && !b.includes('Turn iii lit'));
ok('  an idea says what it does to another, in a line', b.includes('<span class="lp-node-rel">conflicts with <em>Interval doesn’t start at 0</em></span>'));
ok('  the one asked about says so in its label', /lp-node-k">Step<span class="lp-node-asking"> · asking about<\/span>/.test(b));
ok('  the question first; steps on a rail — done, now, ahead; the lit one marked; the asked-about one pressed', /lp-node is-question/.test(b) && /lp-steps/.test(b) && /lp-step is-done/.test(b) && /lp-step is-now/.test(b) && /lp-step is-ahead/.test(b) && /lp-node is-step is-lit is-picked" aria-pressed="true"/.test(b));
const one = board({ cards: [cards[1]] });
ok('one thing brought or made: the right column is a strip, its name on end, pressed to open', /class="lp cam-chat has-slim"/.test(one) && /lp-made is-slim/.test(one) && one.includes('Brought and made · 1') && /class="lp-strip"/.test(one) && !one.includes('lp-cell'));
ok('  nothing yet: a quiet strip; on the Files or Artifacts tab it opens whatever it holds', board({ cards: [] }).includes('lp-strip is-empty') && /lp-cell/.test(board({ cards: [cards[1]], camera: 'artifacts' })));
const phone = board({ narrow: true });
ok('a phone: the same page, marked for its panels; never a strip', /class="lp cam-chat is-phone"/.test(phone) && !board({ narrow: true, cards: [cards[1]] }).includes('lp-strip'));
ok('  an idea not come up yet is dashed; the caption says so', /lp-node is-step is-ahead/.test(b) && b.includes('Dashed ones haven’t come up yet.'));
ok('the conversation: its count and the turn being read', b.includes('The conversation · 3 turns') && b.includes('Reading turn iii of iii'));
ok('  earlier turns folded to two lines: numeral, "You · …", Socria\'s question', (b.match(/l5-turn is-folded/g) || []).length === 2 && /<span class="l5-turn-n" aria-hidden="true">i\.<\/span>/.test(b) && b.includes('You · i need you to teach me rectangles') && b.includes('Which edge would you take the height from?'));
ok('  the turn being read is open, with its numeral, and holds the turn as drawn', /l5-turn is-open" data-turn="2"/.test(b) && /iii\.<\/span><div class="l5-turn-body"><div class="OPEN">THE OPEN TURN<\/div>/.test(b));
ok('  the chatbox at the foot of the conversation', /class="lp-compose"><div class="DOCK">THE CHATBOX<\/div>/.test(b));
ok('brought and made: cells, each marking its turn; the turn being read\'s goes moss with a dot', b.includes('Brought and made · 2') && /l5-cell lp-cell is-content" data-part="content"/.test(b) && /l5-cell lp-cell is-artifact is-now" data-part="artifacts"/.test(b) && /lp-cell-n is-now"><span class="lp-dot"/.test(b) && b.includes('Turn i<') );
ok('  a drawing is shown, not used: inert; and it opens beside', /lp-inert" aria-hidden="true"><svg class="GRAPH"/.test(b) && b.includes('Open beside'));
const first = board({ reading: 0 });
ok('an earlier turn open: the others fold, and the reading says so', /l5-turn is-open" data-turn="0"/.test(first) && (first.match(/l5-turn is-folded/g) || []).length === 2 && first.includes('Reading turn i of iii'));
const onMap = board({ camera: 'logic_map' });
ok('the Logic Map tab: the map stays, everything else dims; all the ideas', /lp-col lp-map l5-dots"/.test(onMap) && /lp-col lp-convo is-dim/.test(onMap) && /is-content is-dim/.test(onMap) && /is-artifact is-now is-dim/.test(onMap) && !onMap.includes('more idea'));
const onFiles = board({ camera: 'content' });
ok('the Files tab: only what was brought stays', /lp-map l5-dots is-dim/.test(onFiles) && /lp-convo is-dim/.test(onFiles) && /is-content" data-part/.test(onFiles) && /is-artifact is-now is-dim/.test(onFiles));
const split = board({ besideOpen: true });
ok('Split view: the right column gives way to what is open beside', /class="lp cam-chat is-split"/.test(split) && !/lp-made/.test(split));
ok('no ideas yet: the column says where they will land', board({ map: null }).includes('Ideas you put into words land here'));

console.log('\n=== wired into LogosApp ===');
const app = read('components/LogosApp.tsx');
ok('the page is the view, on a wide screen and a phone; the zoomed-out canvas is not reached from it', /const oneView = oneViewOn\(\{ narrow,/.test(app) && /const primaryEl = oneView \? phoneBeside \?\? boardEl : viewEl\(studyTab\);/.test(app) && /const canvasEl = zoomed && !oneView/.test(app));
ok('  the turn read is the one pressed, else the newest; a send opens the newest and gives focus back to the conversation', /const sheetAt = oneView && sheetOpen \? sheetTurn\(boardTurns\.length, reading\) : null;/.test(app) && /if \(lastRole !== 'user'\) return;\s*setReading\(null\);\s*setSheetOpen\(true\);\s*setPageFocus\('chat'\);/.test(app));
ok('  the open turn is drawn as the conversation draws it (one message renderer), the way to what it made first in its actions', /const msgEl = \(m: Msg, i: number, go\?: ReactNode, opts\?: \{ listen\?: boolean \}\) =>/.test(app) && /\{messages\.map\(\(m, i\) => msgEl\(m, i\)\)\}/.test(app) && /msgEl\(messages\[t\.askedAt\], t\.askedAt\)/.test(app) && /msgEl\(messages\[t\.replyAt\], t\.replyAt, go\)/.test(app) && /Open the \{madeNoun\} beside this/.test(app));
ok('  the Logic Map column lights what the turn being read put there — the record and the cards its words name', /litBy\(litAt !== null \? turns\[litAt\] : null, byMsg\)/.test(app) && /aheadOf\(turns, byMsg, litAt\)/.test(app) && /links\?\.fromNode/.test(app));
ok('the tabs set focus, and only the tabs: what the screen picks never dims the conversation', /onChange=\{\(v\) => \(oneView \? moveCamera\(v as Viewport\) : openFull\(v as Viewport\)\)\}/.test(app) && /camera=\{pageFocus\}/.test(app) && /setPageFocus\(v\);/.test(app) && /value=\{oneView \? pageFocus :/.test(app));
ok('Split View in the header opens one thing beside the page (a wide screen); never the conversation', /split=\{oneView && !narrow \? <SplitView menu=\{splitChoices\} besideOn=\{!!besideEl\} onPick=\{pickSplit\} board \/> : undefined\}/.test(app) && /return setBoardBeside\(\(b\) => toggleBeside\(b, c\.beside\)\);/.test(app) && /view: oneView \? 'chat' : studyTab,/.test(app));
ok('  nothing floats over the page: no view actions, no floating composer; the chatbox is the page\'s', /actions=\{oneView \? null : viewActsEl\}/.test(app) && /omni=\{oneView \|\| convoOpen \|\| zoomed \? null : l5Dock\}/.test(app) && /composer=\{l5Dock\}/.test(app));
ok('the guard is the chatbox\'s first line, not a bar', /guide=\{guarded && l5 \? \{ onHint: \(\) => void send\('Can I have another hint\?'\), onReveal: reveal, busy \} : null\}/.test(app) && /\{guarded && !l5 && \(/.test(app));
ok('"Sessions /" in the header goes to your lines of thinking', /onRail=\{\(\) => upToMap\(\(\) => setL5List\(true\)\)\}/.test(app));
ok('one space: "Sessions /", the mark and a pinch out go up a level with the line\'s name travelling; a conversation on the map comes down into its page', /onHome=\{\(\) => upToMap\(\)\}/.test(app) && /onRail=\{\(\) => upToMap\(\(\) => setL5List\(true\)\)\}/.test(app) && /onZoomOut=\{\(\) => upToMap\(\)\}/.test(app) && /onOpen=\{\(id\) => downToPage\(id\)\}/.test(app) && /morph\(\s*'out'/.test(app) && /morph\('in'/.test(app));
ok('  on the map, pinching into a conversation until it fills the view opens it', /pinching into a conversation until it fills the view/.test(read('components/logos5/UniverseBubbles.tsx')) && /acts\.onOpen\(id\)/.test(read('components/logos5/UniverseBubbles.tsx')));
ok('Socria asked and nothing was said since: the box is where the answer goes, and opening it from the map lands there', /waitingAsk \? 'Your answer, in your words…'/.test(app) && /const waitingAsk = lastMsg\?\.role === 'assistant' && !busyHere \? closingAsk\(lastMsg\.content\) : ''/.test(app) && /closingAsk\(last\.content\)\) setTimeout\(\(\) => setComposerFocus/.test(app));
ok('  on the Universal Map, how many questions are waiting, and the way to the newest', /questions waiting for your answer/.test(read('components/logos5/Universe.tsx')) && /onClick=\{\(\) => open\(asked\[0\]\)\}/.test(read('components/logos5/Universe.tsx')));
ok('a phone: the page as panels that follow the tabs; what is opened from it takes the screen with the way back; no Split view', /narrow=\{narrow\}\s*onPanel=/.test(app) && /Back to the page/.test(app) && /split=\{oneView && !narrow \?/.test(app));
const composer = read('components/LogosComposer.tsx');
ok('the chatbox is a ruled line: the words and Send on it, "+ Add…" and the guide\'s ways out under it', /l5-crow l5-compose-line/.test(composer) && /Send <span className="l5-ar" aria-hidden="true">→<\/span>/.test(composer) && /l5-ctools l5-compose-foot/.test(composer) && /\+ Add a file, a photo or your voice/.test(composer) && /l5-guide-acts/.test(composer) && /Another hint/.test(composer) && /Show solution/.test(composer) && /\(about \|\| guide\) &&/.test(composer) && /Guiding, not solving/.test(composer));
const css = read('components/logos5/page.css') + read('components/logos5/revision2.css');
const radii = [...css.matchAll(/border-radius:\s*([\d.]+)(px|%)/g)].map((m) => m[1] + m[2]);
ok('the page and its chrome: square or round (999, 50%), map nodes 9, kbd 4 — no other radius; no blur, no drop shadow', radii.every((r) => ['0px', '999px', '50%', '9px', '4px'].includes(r)) && !/backdrop-filter:\s*blur|blur\(/.test(css) && !/box-shadow:\s*0 \d+px \d+px/.test(css), J(radii));
console.log(`\none view: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
