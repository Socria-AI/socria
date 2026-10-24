// LOGOS 5 — THE FOUR VIEWS (Alex Tran, Logos 5 Comments v2).
//
//   views        chat | content | artifacts | logic_map, Split View beside
//                them, what a sent turn does to the screen (rules A–D), what
//                something made does (rule C), a surface asked for by name;
//                Today, exactly
//   title        a node names the topic, at most seven words, never the request
//   content      what was brought to a line of thinking, once each
//   contentBoard the Content canvas: placed, stacked, unstacked, kept per device

import * as V from './.tmp/l5views-under-test.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 300))));
const J = JSON.stringify;
const S = (view, beside = null) => ({ view, beside });
const same = (a, b) => a.view === b.view && a.beside === b.beside;
const after = (text, now, narrow = false, o = {}) => V.afterSend(V.routeTurn({ text, ...o }), now, narrow);

console.log('\n=== views: the four, and where a line of thinking opens ===');
ok('the four views, in Alex’s order', J(V.VIEW_ORDER) === J(['chat', 'content', 'artifacts', 'logic_map']));
ok('named Chat, Content, Artifacts, Logic Map — "Components" is gone', J(Object.values(V.VIEW_LABELS)) === J(['Chat', 'Content', 'Artifacts', 'Logic Map']));
ok('a line of thinking opens on Chat, nothing beside it', same(V.OPENING, S('chat')));
ok('Split View has the three sections Alex named', J(V.SPLIT_SECTIONS.map((s) => s.title)) === J(['Visual & Generative Tools', 'Analysis & Structure', 'System & Memory']));
ok('…holding every panel there is, once', J(V.SPLIT_SECTIONS.flatMap((s) => s.items).sort()) === J(['display', 'inspector', 'map', 'mind', 'model', 'params', 'plot', 'scene', 'trace']));
ok('every panel has a name in the drawer', V.SPLIT_SECTIONS.flatMap((s) => s.items).every((id) => typeof V.SPLIT_NAMES[id] === 'string' && V.SPLIT_NAMES[id].length > 3));

console.log('\n=== rule A: a conversation is read in Chat; the Logic Map never opens for it ===');
for (const t of ['what is tax incidence?', 'I think the plan works because rent is low', 'ok', 'why does that follow?']) {
  const r = after(t, S('chat'));
  ok(`"${t}" from Chat stays on Chat`, same(r, S('chat')), J(r));
}
ok('from Content, on a wide screen: Content stays, the conversation docks beside it', same(after('what is the main claim here?', S('content')), S('content', 'chat')));
ok('from the Logic Map: the map stays, the conversation beside', same(after('why is that one there?', S('logic_map')), S('logic_map', 'chat')));
ok('…on a phone: Chat is the view (one thing at a time)', same(after('why is that one there?', S('logic_map'), true), S('chat')));
ok('the conversation already beside stays beside', same(after('and then?', S('artifacts', 'chat')), S('artifacts', 'chat')));
ok('a tool docked beside Chat stays docked', same(after('and then?', S('chat', 'params')), S('chat', 'params')));
ok('never the Logic Map for talk, from anywhere', ['chat', 'content', 'artifacts'].every((v) => after('tell me about the history of Rome', S(v)).view !== 'logic_map'));

console.log('\n=== rule B: documents go to Content in the background; the screen does not jump ===');
{
  const r = V.routeTurn({ text: 'here are my notes', attachments: [{ kind: 'doc' }, { kind: 'doc' }] });
  ok('read as ingest', r.intent === 'ingest' && r.reveal === null, J(r));
  ok('from Chat: still Chat', same(V.afterSend(r, S('chat'), false), S('chat')));
  ok('from Artifacts: Artifacts stays, the conversation beside — its question is answered there', same(V.afterSend(r, S('artifacts'), false), S('artifacts', 'chat')));
  ok('never Content by itself: the ingest is said in the thread, a press away', V.afterSend(r, S('chat'), false).view !== 'content');
  const pic = V.routeTurn({ text: 'what is this?', attachments: [{ kind: 'image' }] });
  ok('a picture shown to ask about it is a conversation, not an ingest', pic.intent === 'conversation', J(pic));
}

console.log('\n=== rule C: something asked to be made — Artifacts, beside the conversation ===');
for (const t of ['plot y = x^2', 'make me flashcards for chapter 3', 'make a study plan for finals', 'simulate a falling ball']) {
  const r = after(t, S('chat'));
  ok(`"${t}" → Artifacts with Chat beside`, same(r, S('artifacts', 'chat')), J(r));
}
ok('…on a phone: Artifacts alone', same(after('plot y = x^2', S('chat'), true), S('artifacts')));
ok('made in the background (not asked): the screen stays', same(V.onMade(false, S('chat'), false), S('chat')));
ok('made because it was asked: Artifacts, the conversation beside', same(V.onMade(true, S('chat'), false), S('artifacts', 'chat')));
ok('…from the Logic Map with the conversation beside: still beside', same(V.onMade(true, S('logic_map', 'chat'), false), S('artifacts', 'chat')));
ok('…from Content with a tool beside: the tool stays', same(V.onMade(true, S('content', 'params'), false), S('artifacts', 'params')));
ok('…on a phone: Artifacts alone', same(V.onMade(true, S('chat'), true), S('artifacts')));

console.log('\n=== rule D: structure asked for — the Logic Map ===');
for (const t of ['map out my argument for moving to Berlin', 'audit my reasoning here', 'show me the structure', 'draw a decision tree for this']) {
  const r = after(t, S('chat'));
  ok(`"${t}" → the Logic Map`, r.view === 'logic_map', J(r));
}
ok('a command moves nothing', same(V.afterSend(V.routeTurn({ text: 'remove the rent node', command: true }), S('content', 'map'), false), S('content', 'map')));

console.log('\n=== choosing by hand, and Split View ===');
ok('a tab keeps what is beside it', same(V.choose('artifacts', S('content', 'params')), S('artifacts', 'params')));
ok('Chat chosen with the conversation beside: the conversation is the view', same(V.choose('chat', S('content', 'chat')), S('chat')));
ok('dock a panel beside the view', same(V.dock('model', S('content')), S('content', 'model')));
ok('dock it again: it goes', same(V.dock('model', S('content', 'model')), S('content')));
ok('the conversation beside Chat is Chat', same(V.dock('chat', S('chat')), S('chat')));
ok('one panel beside at a time: docking another replaces it', same(V.dock('trace', S('artifacts', 'model')), S('artifacts', 'trace')));
ok('a phone shows one thing: nothing beside', same(V.fit(S('artifacts', 'chat'), true), S('artifacts')));
ok('chatVisible from a view on a phone is Chat', same(V.chatVisible(S('content', 'params'), true), S('chat')));

console.log('\n=== a surface asked for by name (lib/workspace/interface-request.ts) ===');
{
  const R = (req, now = S('chat'), narrow = false) => V.screenForRequest(req, now, narrow);
  let r = R({ op: 'open', surfaces: ['display'] });
  ok('"open the display" → Artifacts, on a display', r.screen.view === 'artifacts' && r.artifact === 'display', J(r));
  r = R({ op: 'open', surfaces: ['map'], lens: 'plot' });
  ok('"math plotting" → Artifacts, on the plot', r.screen.view === 'artifacts' && r.artifact === 'plot', J(r));
  r = R({ op: 'pair', surfaces: ['map', 'model'] });
  ok('"the model beside the map" → the Logic Map, the model beside', same(r.screen, S('logic_map', 'model')), J(r));
  r = R({ op: 'open', surfaces: ['params'] }, S('artifacts'));
  ok('"show the parameters" → beside what is open', same(r.screen, S('artifacts', 'params')), J(r));
  r = R({ op: 'close', surfaces: ['params'] }, S('artifacts', 'params'));
  ok('"close the parameters" → taken from beside', same(r.screen, S('artifacts')), J(r));
  r = R({ op: 'close', surfaces: ['map'] }, S('logic_map'));
  ok('"close the map" on the Logic Map → Chat', same(r.screen, S('chat')), J(r));
  r = R({ op: 'pair', surfaces: ['map', 'model'] }, S('chat'), true);
  ok('…on a phone, the pair is the Logic Map alone', same(r.screen, S('logic_map')), J(r));
  r = R({ op: 'open', surfaces: ['map'] }, S('chat', 'map'));
  ok('the map is never beside the Logic Map', same(r.screen, S('logic_map')), J(r));
}

console.log('\n=== Split View’s width, per browser ===');
{
  const mem = new Map();
  const st = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) };
  ok('the default share when nothing is kept', V.readBesideShare(st) === V.DEFAULT_BESIDE);
  V.writeBesideShare(st, 0.5);
  ok('kept, and read back', V.readBesideShare(st) === 0.5);
  V.writeBesideShare(st, 0.95);
  ok('held to 0.28–0.6', V.readBesideShare(st) === 0.6);
  mem.set('socria.logos5.beside.v1', '"junk"');
  ok('junk reads as the default', V.readBesideShare(st) === V.DEFAULT_BESIDE);
  ok('a storage that throws is the default', V.readBesideShare({ getItem: () => { throw new Error('blocked'); } }) === V.DEFAULT_BESIDE);
}

console.log('\n=== Today, exactly: the local calendar day ===');
{
  const noon = new Date(2026, 9, 24, 12, 0, 0).getTime();
  const { start, end } = V.dayBounds(noon);
  ok('the day begins at 00:00:00.000, local', start === new Date(2026, 9, 24, 0, 0, 0, 0).getTime());
  ok('…and ends at 23:59:59.999, local', end === new Date(2026, 9, 24, 23, 59, 59, 999).getTime());
  const idAt = (t) => `lg_abc12${t.toString(36).padStart(8, '0')}`;
  const at = (h, m = 0, d = 24) => new Date(2026, 9, d, h, m).getTime();
  ok('a Logos id says when it was begun', V.startedAt({ id: idAt(at(9)), updatedAt: at(23) }) === at(9));
  ok('without one, the first turn does', V.startedAt({ id: 'c_core1', updatedAt: at(23), messages: [{ at: at(8, 30) }] }) === at(8, 30));
  ok('without either, the last change', V.startedAt({ id: 'c_core1', updatedAt: at(7) }) === at(7));
  const sessions = [
    { id: idAt(at(0, 0)), updatedAt: at(0, 5) },
    { id: idAt(at(23, 59)), updatedAt: at(23, 59) },
    { id: idAt(at(23, 59, 23)), updatedAt: at(10) }, // begun yesterday, worked on today
    { id: idAt(at(0, 0, 25)), updatedAt: at(0, 1, 25) }, // tomorrow
  ];
  const today = V.begunToday(sessions, noon).map((s) => s.id);
  ok('begun today, from midnight to the last minute, and nothing else', J(today) === J([sessions[0].id, sessions[1].id]), J(today));
  ok('…not one begun yesterday, however recently it was worked on', !today.includes(sessions[2].id));
  ok('the placeholder Alex wrote', V.TODAY_EMPTY === 'No sessions recorded today. Start a chat to begin a new map node.');
}

console.log('\n=== titles: the topic, never the request; at most seven words ===');
{
  const t = V.topicTitle('Help me study for this big bio test tomorrow night please');
  ok(`Alex's example names the subject, not the request: "${t}"`, /^Biology\b/.test(t) && !/help|tomorrow|please|night/i.test(t), t);
  for (const q of ['can you explain how the carnot cycle works?', 'I want to start a bakery in Austin, how do I price my bread', 'why is the sky blue', 'help me think through whether to take the job offer in Denver or stay']) {
    const x = V.topicTitle(q);
    ok(`"${q}" → "${x}" (≤ 7 words, not the request)`, x.split(' ').length <= 7 && x.length > 2 && !/^(can you|help me|i want)/i.test(x), x);
  }
  ok('clipTitle keeps seven words and drops a dangling "of"', V.clipTitle('The Causes of the French Revolution of 1789 and After') === 'The Causes of the French Revolution', V.clipTitle('The Causes of the French Revolution of 1789 and After'));
  ok('a node label: seven words and an ellipsis', V.nodeLabel('one two three four five six seven eight nine') === 'one two three four five six seven…', V.nodeLabel('one two three four five six seven eight nine'));
  ok('…a short title as it is', V.nodeLabel('Thermodynamics – Carnot Cycle') === 'Thermodynamics – Carnot Cycle');
  ok('a model title that echoes the request is refused', V.acceptTitle('Help me study for this big bio test', 'Help me study for this big bio test tomorrow night please') === null);
  ok('a model title held to seven words', V.acceptTitle('Anatomy – Nervous System Review For The Midterm Exam Next Week', 'x').split(' ').length <= 7);
  ok('a good model title is taken', V.acceptTitle('“Anatomy – Nervous System Review”.', 'help me study for my bio test') === 'Anatomy – Nervous System Review');
  ok('nothing, or not a string, is refused', V.acceptTitle('', 'x') === null && V.acceptTitle(42, 'x') === null);
}

console.log('\n=== content: what was brought, once each ===');
{
  const docs = new Map([['aaaaaaaaaaaaaaaa', { name: 'syllabus.pdf', format: 'pdf', pageCount: 12, blocks: [{ text: 'BIOL 1441', kind: 'title' }, { text: 'Cell biology, genetics and evolution.', kind: 'para' }] }]]);
  const messages = [
    { id: 'm1', role: 'user', content: 'here', attachments: [{ kind: 'doc', doc: 'aaaaaaaaaaaaaaaa', name: 'syllabus.pdf', format: 'pdf', pages: 12 }, { kind: 'note', text: 'Exam 2 covers chapters 4–7.\nBring a calculator.', words: 9 }] },
    { id: 'm2', role: 'assistant', content: 'ok' },
    { id: 'm3', role: 'user', content: 'again', attachments: [{ kind: 'doc', doc: 'aaaaaaaaaaaaaaaa', name: 'syllabus.pdf' }, { kind: 'image', name: 'board.jpg', reading: 'A Punnett square', thumb: 'data:image/png;base64,AAA' }] },
  ];
  const files = [{ doc: 'bbbbbbbbbbbbbbbb', name: 'lecture-4.pptx', pages: 30 }, { doc: 'aaaaaaaaaaaaaaaa', name: 'syllabus.pdf', pages: 12 }];
  const c = V.contentOf(messages, files, docs);
  ok('a document attached twice is one card', c.filter((x) => x.doc === 'aaaaaaaaaaaaaaaa').length === 1, J(c.map((x) => x.id)));
  ok('cards for the document, the note, the picture and the sorted file', J(c.map((x) => x.kind)) === J(['doc', 'note', 'image', 'doc']), J(c.map((x) => x.kind)));
  ok('the document says what it is: "PDF · 12 pages"', c[0].meta === 'PDF · 12 pages', c[0].meta);
  ok('…and opens with its first passage, not its title', c[0].snippet === 'Cell biology, genetics and evolution.', c[0].snippet);
  ok('a note is named by its first line, and counted', c[1].title === 'Exam 2 covers chapters 4–7.' && c[1].meta === 'Note · 9 words', J(c[1]));
  ok('a picture keeps what was read in it', c[2].caption === 'A Punnett square' && c[2].image?.startsWith('data:'), J(c[2]));
  ok('a sorted file not on this device still has its card', c[3].title === 'lecture-4.pptx' && c[3].meta === 'Slides · 30 slides', J(c[3]));
  ok('ids are stable and safe for the board', c.every((x) => /^[\w.:#-]{1,120}$/.test(x.id)), J(c.map((x) => x.id)));
  const b1 = V.broughtBy(messages[0], c);
  ok('"Added to Content" under the first turn: its document and its note', J(b1.map((x) => x.kind)) === J(['doc', 'note']), J(b1.map((x) => x.id)));
  ok('…under the second: the document again, not the picture shown to ask about it', J(V.broughtBy(messages[2], c).map((x) => x.kind)) === J(['doc']));
  ok('nothing under a turn that brought nothing', V.broughtBy(messages[1], c).length === 0);
  ok('formats named for people: Word, Slides, Sheet', V.docMeta('docx', 3) === 'Word · 3 pages' && V.docMeta('xlsx', 2) === 'Sheet · 2 sheets' && V.docMeta('pptx', 1) === 'Slides · 1 slide');
}

console.log('\n=== the Content canvas: placed, nested, kept ===');
{
  const ids = ['doc:a', 'doc:b', 'doc:c', 'note:m1:0'];
  let b = V.EMPTY_BOARD;
  let p = V.placeAll(b, ids, 1000);
  ok('unplaced cards flow left to right', p.length === 4 && p[0].x === 0 && p[1].x === V.CARD.w + V.CARD.gap && p[0].y === p[1].y, J(p));
  ok('…and wrap at the canvas width', V.placeAll(b, ids, 600).some((x) => x.y > 0));
  b = V.moveTo(b, 'doc:c', 413, 207);
  ok('a card put somewhere stays there, on the grid', b.pos['doc:c'].x === 416 && b.pos['doc:c'].y === 208, J(b.pos));
  ok('never off the canvas', V.moveTo(b, 'doc:a', -40, -9).pos['doc:a'].x === 0);
  b = V.stackOnto(b, 'doc:a', 'doc:c');
  p = V.placeAll(b, ids, 1000);
  ok('dropped onto another: a stack, drawn once, where the target stood', p.length === 3 && p.some((x) => x.id === 'doc:a' && x.stack?.items.length === 2 && x.x === 416), J(p));
  b = V.stackOnto(b, 'doc:b', 'doc:a');
  ok('onto a stack: it joins on top', V.stackOf(b, 'doc:c')?.items[0] === 'doc:b' && V.stackOf(b, 'doc:c')?.items.length === 3, J(b.stacks));
  b = V.unstack(b, 'doc:b');
  ok('taken out: beside the stack, and the stack is smaller', !V.stackOf(b, 'doc:b') && V.stackOf(b, 'doc:c')?.items.length === 2 && !!b.pos['doc:b'], J(b));
  b = V.unstack(b, 'doc:a');
  ok('a stack of one is no stack', b.stacks.length === 0, J(b.stacks));
  ok('a card cannot be stacked on itself', V.stackOnto(b, 'doc:a', 'doc:a') === b);
  const pruned = V.prune(V.stackOnto(b, 'doc:a', 'doc:c'), ['doc:a', 'doc:b']);
  ok('a document taken away takes its place and its stacking with it', !pruned.pos['doc:c'] && pruned.stacks.length === 0, J(pruned));
  ok('the keyboard moves a card a step', V.nudge(V.EMPTY_BOARD, 'doc:a', { x: 0, y: 0 }, 16, 0).pos['doc:a'].x === 16);
  const mem = new Map();
  const st = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) };
  V.writeBoard(st, 'lg_one', b);
  ok('kept per line of thinking, on this device, and read back', J(V.readBoard(st, 'lg_one')) === J(V.sanitizeBoard(b)));
  ok('another line of thinking has its own', J(V.readBoard(st, 'lg_two')) === J(V.EMPTY_BOARD));
  ok('junk in storage reads as an empty board', J(V.sanitizeBoard({ pos: { 'bad id!': { x: 1, y: 2 }, ok: { x: 'no' } }, stacks: [{ id: 'x', items: ['a'] }] })) === J(V.EMPTY_BOARD));
  ok('a storage that throws keeps the board for the visit only', (() => { V.writeBoard({ getItem: () => '{}', setItem: () => { throw new Error('full'); } }, 's', b); return true; })());
}

console.log(`\nlogos5 views: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
