// NEW LOGOS — THE SPATIAL LAYER (docs/NEW-LOGOS.md, "Spatial canvas").
//
// What is held down:
//   • a conversation's messages become exchanges without changing the messages: pairing, order, stable keys;
//   • a layout is presentation only, and is cleaned: bad references, impossible numbers and runaway zoom never stay;
//   • objects without a place get one next to what they came from, or in reading order, never on top of another,
//     and placing never moves what already has a place;
//   • fitting shows everything; connections leave each object at its edge;
//   • an ask from an object satisfies the existing Point & Ask contracts: the focus brief the chat endpoint reads,
//     and the `about` it keeps on the message.

import * as X from './.tmp/new-logos-under-test.mjs';
const C = X.Canvas;

let pass = 0,
  fail = 0;
const ok = (name, cond, extra = '') => (cond ? (pass++, console.log('  ok   ' + name)) : (fail++, console.log('  FAIL ' + name + (extra ? '  ' + String(extra).slice(0, 300) : ''))));

console.log('=== exchanges: the same messages, as objects ===');
{
  const msgs = [
    { role: 'assistant', content: 'Welcome back.', id: 'm_greet0001' },
    { role: 'user', content: 'First question', id: 'm_aaaaaa01' },
    { role: 'assistant', content: 'Answer one', id: 'm_aaaaaa02' },
    { role: 'assistant', content: 'Answer one, continued', id: 'm_aaaaaa03' },
    { role: 'user', content: 'A thought kept', id: 'm_bbbbbb01', via: 'thought' },
    { role: 'user', content: 'Older turn without an id' },
    { role: 'assistant', content: 'Reply without an id' },
  ];
  const ex = C.exchangesOf(msgs);
  ok('replies before any turn are their own exchange', ex[0].ask === undefined && ex[0].replies[0].content === 'Welcome back.');
  ok('a turn collects the replies that follow it', ex[1].ask.content === 'First question' && ex[1].replies.length === 2);
  ok('a turn kept without a reply is an exchange with no reply', ex[2].ask.via === 'thought' && ex[2].replies.length === 0);
  ok('keys are message ids, or positions when there is none', ex[1].key === 'm_aaaaaa01' && ex[3].key === 'i5');
  ok('the order is the conversation’s', ex.map((e) => e.index).join() === '0,1,4,5');
  const later = C.exchangesOf([...msgs, { role: 'user', content: 'New', id: 'm_cccccc01' }]);
  ok('appending never changes an earlier exchange’s key', later.slice(0, 4).map((e) => e.key).join() === ex.map((e) => e.key).join());
  ok('the messages themselves are untouched', JSON.stringify(msgs[1]) === JSON.stringify({ role: 'user', content: 'First question', id: 'm_aaaaaa01' }));
}

console.log('\n=== layouts are presentation, and are cleaned ===');
{
  const l = C.sanitizeLayout({
    items: {
      'x:m_aaaaaa01': { x: 10.6, y: -4, open: true, from: 'n:abc' },
      'n:abc': { x: 1e12, y: 5 },
      'bad ref': { x: 0, y: 0 },
      'x:self': { x: 1, y: 1, from: 'x:self' },
      'n:nan': { x: NaN, y: 1 },
      'n:str': { x: '3', y: 1 },
      'n:junk': { x: 1, y: 2, open: 'yes', from: '<script>' },
    },
    view: { x: 3, y: 4, k: 99 },
  });
  ok('valid items kept, rounded', l.items['x:m_aaaaaa01'].x === 11 && l.items['x:m_aaaaaa01'].open === true && l.items['x:m_aaaaaa01'].from === 'n:abc');
  ok('coordinates clamped', l.items['n:abc'].x === C.CANVAS_LIMITS.coord);
  ok('bad references and impossible numbers dropped', !l.items['bad ref'] && !l.items['n:nan'] && !l.items['n:str']);
  ok('an object is never "asked from" itself', !('from' in l.items['x:self']));
  ok('only true opens, only valid origins', !('open' in l.items['n:junk']) && !('from' in l.items['n:junk']));
  ok('zoom clamped', l.view.k === C.CANVAS_LIMITS.maxZoom);
  const many = { items: Object.fromEntries(Array.from({ length: 4000 }, (_, i) => [`n:k${i}`, { x: i, y: i }])) };
  ok('at most the item limit is kept', Object.keys(C.sanitizeLayout(many).items).length === C.CANVAS_LIMITS.items);
  ok('anything else is an empty layout', JSON.stringify(C.sanitizeLayout('nope')) === '{"items":{}}');
  const a = C.withItem(C.EMPTY_LAYOUT, 'n:a', { x: 1, y: 2, open: true });
  const b = C.withItem(a, 'n:a', { open: false });
  ok('a patch changes only what it names; closing removes the flag', b.items['n:a'].x === 1 && !('open' in b.items['n:a']));
  ok('null removes an item', !C.withItem(b, 'n:a', null).items['n:a']);
  const theirs = { items: { 'n:a': { x: 5, y: 5 }, 'n:b': { x: 9, y: 9 } } };
  const mine = { items: { 'n:a': { x: 1, y: 1 } } };
  const m = C.mergeLayouts(theirs, mine, new Set(['n:a']));
  ok('a merge keeps theirs and puts my changes on top', m.items['n:a'].x === 1 && m.items['n:b'].x === 9);
}

console.log('\n=== placing what has no place ===');
{
  const start = { items: { 'x:a': { x: 0, y: 0 } } };
  const wanted = [{ ref: 'x:a' }, { ref: 'x:b', near: 'x:a' }, { ref: 'x:c' }, { ref: 'x:d' }, { ref: 'n:k', near: 'x:b' }, { ref: 'x:e' }];
  const placed = C.placeMissing(start, wanted);
  ok('what had a place keeps it', placed.items['x:a'].x === 0 && placed.items['x:a'].y === 0);
  ok('something asked from an object goes beside it, and says so', placed.items['x:b'].x > C.DEFAULT_SIZE.w && placed.items['x:b'].y === 0 && placed.items['x:b'].from === 'x:a');
  const boxes = Object.entries(placed.items).map(([r, it]) => ({ r, x: it.x, y: it.y, w: C.DEFAULT_SIZE.w, h: C.DEFAULT_SIZE.h }));
  const clash = boxes.some((p, i) => boxes.some((q, j) => i < j && p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h));
  ok('nothing is placed on top of anything else', !clash, JSON.stringify(placed.items));
  ok('every wanted object has a place', wanted.every((w) => placed.items[w.ref]));
  ok('placing is deterministic', JSON.stringify(C.placeMissing(start, wanted)) === JSON.stringify(placed));
  ok('placing twice changes nothing', JSON.stringify(C.placeMissing(placed, wanted)) === JSON.stringify(placed));
  const crowd = { items: Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`n:f${i}`, { x: (i % 6) * 340, y: Math.floor(i / 6) * 200 }])) };
  const more = C.placeMissing(crowd, [{ ref: 'x:new', near: 'n:f14' }]);
  const nb = { x: more.items['x:new'].x, y: more.items['x:new'].y, w: C.DEFAULT_SIZE.w, h: C.DEFAULT_SIZE.h };
  ok('in a crowd it still finds a free place', Object.entries(crowd.items).every(([, it]) => !(nb.x < it.x + C.DEFAULT_SIZE.w && it.x < nb.x + nb.w && nb.y < it.y + C.DEFAULT_SIZE.h && it.y < nb.y + nb.h)));
}

{
  const crowd = { items: { 'x:a': { x: 0, y: 0 }, 'x:b': { x: 400, y: 0 } } };
  const free = C.placeNear(crowd, { x: 900, y: 900 }, { w: 300, h: 200 });
  ok('something put down where nothing is stays exactly there', free.x === 900 && free.y === 900);
  const near = C.placeNear(crowd, { x: 20, y: 20 }, { w: 300, h: 200 });
  const hits = Object.values(crowd.items).some((it) => near.x < it.x + C.DEFAULT_SIZE.w && it.x < near.x + 300 && near.y < it.y + C.DEFAULT_SIZE.h && it.y < near.y + 200);
  ok('something put down on top of another slides to the nearest free place', !hits && Math.hypot(near.x - 20, near.y - 20) < 600, JSON.stringify(near));
}

console.log('\n=== the camera and the lines ===');
{
  const boxes = [{ x: -400, y: -100, w: 300, h: 120 }, { x: 900, y: 600, w: 300, h: 200 }];
  const v = C.fitView(boxes, 1200, 800, 40, 1);
  const onScreen = (b) => b.x * v.k + v.x >= 39 && (b.x + b.w) * v.k + v.x <= 1161 && b.y * v.k + v.y >= 39 && (b.y + b.h) * v.k + v.y <= 761;
  ok('fitting shows every object', boxes.every(onScreen), JSON.stringify(v));
  ok('fitting never zooms past the limit', C.fitView([{ x: 0, y: 0, w: 10, h: 10 }], 1200, 800, 40, 1).k === 1);
  const c = C.connector({ x: 0, y: 0, w: 100, h: 50 }, { x: 300, y: 0, w: 100, h: 50 });
  ok('a line leaves one object at its edge and meets the other at its edge', c.x1 === 100 && c.x2 === 300 && c.y1 === 25 && c.mx === 200);
  ok('an excerpt is one plain line', C.excerpt('## Heading **bold**\nmore') === 'Heading bold');
  ok('fact lines are short and plain', C.factLines('a\n\n**b**\n' + 'c'.repeat(400), 3, 50).join('|') === 'a|b|' + 'c'.repeat(49) + '…');
}

console.log('\n=== an ask from an object meets the existing Point & Ask contracts ===');
{
  const about = { label: 'Supply shocks under NGDP targeting', of: 'the objective “Write the essay”', lines: ['A knowledge node', 'Shocks split between prices and output'] };
  const m = X.askMessage('Is this right?', about, 1);
  const kept = X.cleanAboutRef(m.about);
  ok('the message keeps what it was about, in the existing shape', kept && kept.kind === 'part' && kept.label === about.label && kept.of === about.of);
  ok('later turns remember it in words', X.aboutLine(kept).includes('Supply shocks under NGDP targeting'));
  const brief = X.sanitizeFocus({ kind: 'part', label: about.label, of: about.of, lines: about.lines });
  ok('the focus brief is accepted by the chat endpoint’s own reader', brief && brief.kind === 'part' && brief.lines.length === 2);
  ok('…and tells the assistant what "this" is', X.focusBlock(brief).includes('Supply shocks under NGDP targeting'));
  const plain = X.askMessage('Just a question', undefined, 1);
  ok('an ask from the empty plane carries no "about"', !('about' in plain) && plain.role === 'user' && /^m_/.test(plain.id));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
