// The conversation box, moved (lib/logos5/box.ts, components/logos5/L5Line.tsx).
//
// "Let's make the omnibox / conversation box draggable — you can center it and
// hide the views." On a desktop the conversation is one box in two shapes:
// unfolded, the thread and its composer; folded, the composer alone over the
// views. Docked, it is where it has always been; dragged by its head (or the
// grip over a folded composer) it floats where it is left, per browser; it can
// be put in the middle; and the views behind it can be hidden, which leaves the
// conversation alone, centred and given room. Held here: where it goes, that it
// never leaves the screen, that one anchor serves both shapes, what a browser
// remembers, and the wiring.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BOX_KEY, BOX_MARGIN, DOCKED, anchorOf, keepInside, placeBox, readBox, writeBox } from './.tmp/box.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const J = JSON.stringify;
const room = { w: 1440, h: 840 };
const convo = { w: 440, h: 680 };
const omni = { w: 680, h: 136 };

console.log('=== where it goes ===');
{
  const mid = placeBox({ ...DOCKED, float: true, centered: true }, room, convo);
  ok('centred is the middle, whatever its size', mid.left === 500 && mid.top === 80, J(mid));
  const small = placeBox({ ...DOCKED, float: true, centered: true }, room, omni);
  ok('  and stays the middle when it changes shape', small.left === 380 && small.top === 352, J(small));
  ok('with the views hidden it is centred too', J(placeBox({ ...DOCKED, focus: true, ax: 0.1, ay: 0.2 }, room, convo)) === J(mid));
  const p = { ...DOCKED, float: true, ax: 0.25, ay: 0.9 };
  const at = placeBox(p, room, convo);
  ok('otherwise its bottom-centre is where it was left', at.left === 140 && at.top === 76, J(at));
  ok('  and the anchor a box there leaves is that same place', J(anchorOf(at.left, at.top, room, convo)) === J({ ax: 0.25, ay: 0.9 }));
  const folded = placeBox(p, room, omni);
  ok('one anchor for both shapes: folded, the composer sits where the conversation\'s composer was', folded.left + omni.w / 2 === at.left + convo.w / 2 && folded.top + omni.h === at.top + convo.h, J(folded));
}

console.log('\n=== never off the screen ===');
{
  const far = keepInside(5000, -300, room, convo);
  ok('dragged past an edge, it stops a margin inside it', far.left === room.w - convo.w - BOX_MARGIN && far.top === BOX_MARGIN, J(far));
  const corner = placeBox({ ...DOCKED, float: true, ax: 1, ay: 0 }, room, convo);
  ok('an anchor in a corner still keeps all of it on screen', corner.left === room.w - convo.w - BOX_MARGIN && corner.top === BOX_MARGIN, J(corner));
  const tiny = keepInside(40, 40, { w: 300, h: 200 }, convo);
  ok('a room smaller than the box puts it at the margin rather than off the edge', tiny.left === BOX_MARGIN && tiny.top === BOX_MARGIN, J(tiny));
  ok('positions are whole pixels', Number.isInteger(keepInside(100.4, 200.6, room, convo).left));
}

console.log('\n=== what a browser remembers ===');
{
  const mem = new Map();
  const store = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  ok('nothing remembered is docked, where it has always been', J(readBox(store)) === J(DOCKED));
  writeBox(store, { float: true, centered: false, focus: true, ax: 0.3, ay: 0.7 });
  ok('what was left is what comes back', J(readBox(store)) === J({ float: true, centered: false, focus: true, ax: 0.3, ay: 0.7 }));
  mem.set(BOX_KEY, JSON.stringify({ float: 'yes', ax: 9, ay: -3, focus: 1 }));
  ok('anything wrong in it is made safe', J(readBox(store)) === J({ float: false, centered: false, focus: false, ax: 1, ay: 0 }));
  mem.set(BOX_KEY, '{not json');
  ok('broken storage is docked', J(readBox(store)) === J(DOCKED));
  ok('a blocked store neither reads nor throws', J(readBox({ getItem: () => { throw new Error('denied'); } })) === J(DOCKED) && (writeBox({ setItem: () => { throw new Error('full'); } }, DOCKED), true));
}

console.log('\n=== the wiring ===');
{
  const line = read('components/logos5/L5Line.tsx');
  const app = read('components/LogosApp.tsx');
  ok('a desktop line of thinking is the view and the box', /<L5Line\s+convoOpen=\{convoOpen\}/.test(app) && /thread=\{l5Thread\}/.test(app) && /dock=\{l5Dock\}/.test(app));
  ok('  a phone keeps its sheet', /className=\{`l5x is-narrow/.test(app) && /l5x-sheet/.test(app));
  ok('the head of the conversation, and the grip over a folded composer, are its handles', /className="l5x-convo-head"\s+\{\.\.\.handle\}/.test(line) && /className="l5x-omni-bar"\s+\{\.\.\.handle\}/.test(line));
  ok('  a press on a button in them is a press, not a drag', /closest\('button, a, input, textarea, select/.test(line));
  ok('  and they take the arrow keys', /ArrowLeft: \[-step, 0\]/.test(line) && /tabIndex=\{0\}/.test(line));
  ok('its tools: the middle, the views hidden, floated or docked', /aria-label="Put it in the middle"/.test(line) && /'Show the views' : 'Hide the views'/.test(line) && /'Dock it beside the views' : 'Float it over the views'/.test(line));
  ok('hiding the views unfolds the conversation, and folding it brings them back', /if \(!convoOpen\) setConvo\(true\)/.test(line) && /if \(box\.focus\) setBox\(\{ \.\.\.box, focus: false \}\);\s*setConvo\(false\)/.test(line));
  ok('  Esc brings them back too', /e\.key === 'Escape'/.test(line));
  ok('the folded composer sits beside the views, so hiding them never hides it', line.indexOf('className="l5x-omni"') > line.indexOf('</section>'));
  const css = read('components/logos5/redesign.css');
  ok('floating, it is out of the flow and over the views', /\.l5x\.is-floating \.l5x-convo \{[^}]*position: absolute/.test(css) && /\.l5x\.is-floating \.l5x-canvas \{\s*--omni: 0px/.test(css));
  ok('  shown only once placed', /\.l5x\.is-floating\.is-placing :is\(\.l5x-convo, \.l5x-omni\) \{\s*visibility: hidden/.test(css));
  ok('with the views hidden, the views and their switch go', /\.l5x\.is-focus \.l5x-view \{\s*visibility: hidden/.test(css) && /\.l5:has\(\.l5x\.is-focus\) \.l5-head-mid \{\s*visibility: hidden/.test(css));
  ok('a reply over a folded composer still hides the legend, wherever the composer is', /\.l5x:has\(\.l5x-peek\) \.lg-legend/.test(css));
  const composer = read('components/LogosComposer.tsx');
  ok('the composer shows a scrollbar only once there is more than its cap to scroll', /el\.style\.overflowY = el\.scrollHeight > cap \? 'auto' : 'hidden';/.test(composer));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
