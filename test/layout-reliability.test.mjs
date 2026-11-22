// LAYOUT RELIABILITY (Logos 6, November 2026; docs/LAYOUT.md) — what keeps the app's parts from running over one
// another, at every size:
//   • the Mind Map's cards laid out by the height each is drawn at, so a long label never reaches the card below, and
//     its lines labelled between the cards, never under one;
//   • the map held inside its frame above the chat box on a short screen, and fitted again once its cards are measured;
//   • the chat box's own ground over the board, so the objective and the notes over the box are never read across a card;
//   • the objective's panel opening from its line, as tall as the room above it — never pinned to a guessed height;
//   • a phone's composer foot and Enter hint wrapping rather than overlapping, and the conversation's tabs scrolling
//     from their start rather than spilling off both sides;
//   • panels sized by a phone's visible height.
// The rendered side of this — every state at eight sizes, read by a DOM audit and seen in screenshots — is described in
// docs/LAYOUT.md.

import { readFileSync } from 'node:fs';
import * as M from './.tmp/mindmap-under-test.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 500))));
const J = JSON.stringify;
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// rectangles of the cards as drawn, and whether any two meet
const rects = (places, heightOf) => [...places].map(([id, p]) => ({ id, x: p.x, y: p.y, w: M.CARD_W, h: heightOf(id) }));
const meet = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const overlaps = (rs) => {
  const out = [];
  for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) if (meet(rs[i], rs[j])) out.push([rs[i].id, rs[j].id]);
  return out;
};
const inside = (r, x, y) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h;

const MAP = M.sanitizeMap({
  nodes: [
    { id: 'c1', type: 'claim', label: 'Students outsource the first attempt at a problem to AI, and so never build the habit of struggling productively' },
    { id: 'q1', type: 'question', label: 'Why does dependency happen?' },
    { id: 'e1', type: 'evidence', label: 'Survey: 60% copy answers' },
    { id: 'c2', type: 'concept', label: 'Cognitive offloading' },
    { id: 'a1', type: 'assumption', label: 'Students would think harder without the tool available' },
    { id: 'g1', type: 'goal', label: 'Design an assignment that rewards the attempt, not only the answer' },
    { id: 'd1', type: 'decision', label: 'Pilot an "attempt first" rule in one seminar group' },
    { id: 's1', type: 'source', label: 'Kirschner and De Bruyckere, 2017' },
    { id: 'c3', type: 'concept', label: 'Desirable difficulty' },
    { id: 'w1', type: 'idea', label: 'Explain-it-back before the reveal' },
  ],
  edges: [
    { from: 'e1', to: 'c1', relation: 'supports' },
    { from: 'c2', to: 'c1', relation: 'causes' },
    { from: 'a1', to: 'c1', relation: 'depends_on' },
    { from: 'g1', to: 'd1', relation: 'leads_to' },
    { from: 's1', to: 'c3', relation: 'supports' },
    { from: 'c3', to: 'g1', relation: 'supports' },
    { from: 'w1', to: 'g1', relation: 'part_of', kind: 'structure' },
    { from: 'q1', to: 'c1', relation: 'relates' },
  ],
});
// as the canvas measures them: a five-line claim, a four-line goal, a three-line assumption and decision
const DRAWN = { c1: 150, g1: 118, a1: 96, d1: 96 };
const drawn = (id) => DRAWN[id] ?? M.CARD_H;

console.log('\n=== the Mind Map: every card laid out at the height it is drawn ===');
{
  for (const [name, layout] of [['Ideas', M.ideasPlaces], ['Logic', M.logicPlaces]]) {
    const placed = layout(MAP, drawn);
    ok(`${name}: no two cards meet, laid out by their drawn heights`, overlaps(rects(placed, drawn)).length === 0, J(overlaps(rects(placed, drawn))));
    ok(`${name}: with nothing measured yet, the layout is the one it always was`, J([...layout(MAP, () => M.CARD_H)]) === J([...layout(MAP)]));
  }
  ok('Ideas: …where laid out by one assumed height (as it was), the tall cards ran over the cards beneath them', overlaps(rects(M.ideasPlaces(MAP), drawn)).length > 0);
  // Logic: a claim with a subtitle and marks, over what supports it, straight below
  const CHAIN = M.sanitizeMap({ nodes: [{ id: 'top', type: 'claim', label: 'A long claim' }, { id: 'under', type: 'evidence', label: 'What bears it out' }], edges: [{ from: 'under', to: 'top', relation: 'supports' }] });
  const tallTop = (id) => (id === 'top' ? 200 : M.CARD_H);
  ok('Logic: …where laid out by one assumed height (as it was), a tall card ran over the one beneath it', overlaps(rects(M.logicPlaces(CHAIN), tallTop)).length === 1);
  ok('Logic: laid out by drawn heights, the layer below starts the gap below the tall card', overlaps(rects(M.logicPlaces(CHAIN, tallTop), tallTop)).length === 0 && M.logicPlaces(CHAIN, tallTop).get('under').y === 200 + 78);
  // a row (Ideas) or a layer (Logic) is stepped by its tallest card, plus the gap
  const ip = M.ideasPlaces(MAP, drawn);
  const rowsY = [...new Set([...ip.values()].map((p) => p.y))].sort((a, b) => a - b);
  const tallestOfRow = (y) => Math.max(...[...ip].filter(([, p]) => p.y === y).map(([id]) => drawn(id)));
  ok('Ideas: each row starts the same gap below the tallest card of the row above', rowsY.slice(1).every((y, i) => y - rowsY[i] === tallestOfRow(rowsY[i]) + 60), J(rowsY));
  const lp = M.logicPlaces(MAP, drawn);
  ok('Logic: what is supported still sits above what supports it', lp.get('c1').y < lp.get('e1').y && lp.get('g1').y < lp.get('c3').y && lp.get('c3').y < lp.get('s1').y);
  // a card the person put somewhere stays there whatever the heights
  const placed = M.applyMapEdits(MAP, [{ op: 'place', id: 'c1', mode: 'ideas', x: 30, y: 40 }]).map;
  const ipm = M.ideasPlaces(placed, drawn);
  ok('a card put by hand stays where it was put; the rest go below the bottom of it, as drawn', ipm.get('c1').x === 30 && ipm.get('c1').y === 40 && [...ipm].filter(([id]) => id !== 'c1').every(([, p]) => p.y >= 40 + drawn('c1')));
  // a label is clamped, so no card grows without end
  const css = read('components/logos6/thinking-canvas.css');
  ok('a card\'s title is held to four lines, broken anywhere a long word needs, and its subtitle to one', /\.tc-card-t \{[^}]*-webkit-line-clamp: 4;[^}]*\}/.test(css) && /\.tc-card-t \{[^}]*overflow-wrap: anywhere;/.test(css) && /\.tc-card-s \{[^}]*text-overflow: ellipsis;[^}]*white-space: nowrap;/.test(css));
  const tc = read('components/logos6/ThinkingCanvas.tsx');
  ok('the canvas measures its cards before paint, when the map or the way of working changes, and once the faces load', /useLayoutEffect\(\(\) => measureRef\.current\(\), \[map, mode\]\)/.test(tc) && /document\.fonts\?\.ready\?\.then\(\(\) => live && measureRef\.current\(\)\)/.test(tc));
  ok('…lays out by what it measured', /logicPlaces\(map, heightOf\) : ideasPlaces\(map, heightOf\)/.test(tc));
  ok('…and fits the map again once the cards are measured, and when its frame changes size, only while the view is still the fit\'s own', /fitted\.current = fit\(\) \?\? null;\n      views\.current\[mode\] = undefined;\n    \}\n  \}, \[mode, map\.nodes\.length\]\);/.test(tc) && /useEffect\(\(\) => refitRef\.current\(\), \[heights\]\);/.test(tc) && /const watch = new ResizeObserver\(\(\) => refitRef\.current\(\)\);/.test(tc));
  ok('…the "still the fit\'s own" test made in the view\'s own update, which sees the latest view (the view last drawn could be older than the fit, and nothing was refitted)', /setView\(\(cur\) => \{\n      const f = fitted\.current;\n      if \(!f \|\| Math\.abs\(cur\.k - f\.k\) > 1e-6/.test(tc));
}

console.log('\n=== a line between two cards: drawn to the edge, said between them ===');
{
  // a tall card over a short one, close together: the middle of their centres lies inside the tall card
  const A = { x: 0, y: 0, w: M.CARD_W, h: 150 }, B = { x: 0, y: 170, w: M.CARD_W, h: 64 };
  const e = M.edgeEnds(A, B);
  ok('the middle of the centres would have been under the tall card', inside(A, A.x + A.w / 2, (A.y + A.h / 2 + B.y + B.h / 2) / 2));
  ok('the label is written between the cards, under neither', !inside(A, e.lx, e.ly) && !inside(B, e.lx, e.ly) && e.ly > 150 && e.ly < 170, J(e));
  ok('the line runs from the centre of the one to just short of the edge of the other (the arrow on the edge)', e.x1 === 90 && e.y1 === 75 && e.y2 < B.y && e.y2 >= B.y - 5, J(e));
  // across: a wide gap, cards of different heights, on a slant
  const C = { x: 0, y: 0, w: M.CARD_W, h: 118 }, D = { x: 320, y: 210, w: M.CARD_W, h: 64 };
  const f = M.edgeEnds(C, D);
  ok('on a slant, the label sits on the line, between the cards', !inside(C, f.lx, f.ly) && !inside(D, f.lx, f.ly) && Math.abs((f.ly - 59) * (410 - 90) - (f.lx - 90) * (242 - 59)) < 1e-6, J(f));
  // cards that overlap have nothing between them to write on
  const E = { x: 0, y: 0, w: M.CARD_W, h: 64 }, F = { x: 60, y: 30, w: M.CARD_W, h: 64 };
  const g = M.edgeEnds(E, F);
  ok('cards that overlap: the label at the middle of the centres, as before', g.lx === (90 + 150) / 2 && g.ly === (32 + 62) / 2, J(g));
  const tc = read('components/logos6/ThinkingCanvas.tsx');
  ok('the canvas draws every line and its label from it', /const lineOf = \(e: \{ from: string; to: string \}\) => edgeEnds\(boxOf\(e\.from\), boxOf\(e\.to\)\);/.test(tc) && /<line x1=\{g\.x1\} y1=\{g\.y1\} x2=\{g\.x2\} y2=\{g\.y2\}/.test(tc) && /style=\{\{ left: g\.lx, top: g\.ly \}\}/.test(tc));
}

console.log('\n=== the map inside its frame, the chat box over the board ===');
{
  const space = read('components/logos5/space.css');
  ok('the map stops where the chat box begins, by the box\'s measured height', /\.ls-mind \{[^}]*padding-bottom: calc\(var\(--ls-foot, 94px\) \+ 24px\);/.test(space));
  ok('…and its body gives way inside that frame on a short screen, rather than run on under the box', /\.logos-root \.ls-mind \.tc \.tc-body \{ min-height: 0; \}/.test(space));
  const rule = space.match(/\.logos-root \.ls:not\(\.is-phone\) \.ls-chat::before \{([^}]*)\}/)?.[1] ?? '';
  ok('the chat box has a ground of its own over the board, the box\'s own size, under what is over it', /content: ''/.test(rule) && /position: absolute/.test(rule) && /inset: 0 0 -18px/.test(rule) && /z-index: -1/.test(rule) && /background: var\(--c-paper\)/.test(rule), rule);
  ok('…soft at its edges, and never in the way of a press', /box-shadow: 0 0 22px 14px var\(--c-paper\)/.test(rule) && /pointer-events: none/.test(rule));
  ok('…which the box can hold: it is a stacking context of its own (it is moved into place by a transform)', /\.logos-root \.ls-chat \{ position: absolute;[^}]*transform: translateX\(-50%\);/.test(space));
  ok('a phone\'s box is a bar with its own ground', /\.ls\.is-phone \.ls-chat \{[^}]*background: var\(--c-paper\);/.test(space));
}

console.log('\n=== the map\'s own popovers stay on the screen ===');
{
  const css = read('components/logos6/thinking-canvas.css');
  ok('a narrow canvas: the list of the chat\'s work opens across the canvas under its tools, not right-aligned to a button mid-row', /\.tc\.is-narrow \.tc-tools \{ position: relative; \}/.test(css) && /\.tc\.is-narrow \.tc-tray \{ position: static; \}/.test(css) && /\.tc\.is-narrow \.tc-tray-list \{ left: 14px; right: 14px; width: auto; \}/.test(css));
  ok('…and the space\'s rule outranks the canvas\'s own floor for a phone (160px), whichever sheet comes last', /\.logos-root \.tc\.is-narrow \.tc-body \{ min-height: 160px; \}/.test(css));
}

console.log('\n=== a made thing\'s preview beside the conversation ===');
{
  const page = read('components/logos5/page.css'), space = read('components/logos5/space.css');
  ok('drawn whole and small, fading at its foot, as the board draws one — not cut at full size to the cell\'s height', /\.lp-cell:is\(\.is-artifact, \.is-practice\) \.lp-cell-p > \.lp-inert \{ width: 440px; max-height: 382px; overflow: hidden; zoom: 0\.55;[^}]*mask-image: linear-gradient\(#000 78%, transparent\);/.test(page) && /\.ls-prev\.is-fit > \.ls-inert \{ width: 440px; max-height: 382px; overflow: hidden; zoom: 0\.55;/.test(space));
}

console.log('\n=== the objective\'s panel opens from its line ===');
{
  const css = read('components/logos6/objective.css');
  const tsx = read('components/logos6/ObjectiveLine.tsx');
  ok('above the line, as tall as the room over it, never taller than 520px', /\.l6o-panel \{ position: absolute; right: 0; bottom: calc\(100% \+ 8px\);[^}]*max-height: min\(520px, var\(--l6o-room, 60vh\)\);/.test(css));
  ok('a phone: the line\'s width, still opening from the line — not pinned 140px up the screen over a taller box', /\.l6o\.is-narrow \.l6o-panel \{ left: 0; right: 0; width: auto; \}/.test(css) && !/bottom: 140px/.test(css) && !/\.l6o-panel \{[^}]*position: fixed/.test(css));
  ok('the room is measured from the line to the top of its view when the panel opens, and when the window changes', /el\.closest\('\.ls, \.lp'\)\?\.getBoundingClientRect\(\)\.top/.test(tsx) && /window\.addEventListener\('resize', measure\)/.test(tsx) && /'--l6o-room': `\$\{room\}px`/.test(tsx));
}

console.log('\n=== a phone: the composer\'s foot, the Enter hint, the conversation\'s tabs ===');
{
  const r2 = read('components/logos5/revision2.css');
  ok('the start of the foot wraps, so the length dial is never squeezed under "Add as idea"', /\.lg-composer\.is-ruled \.l5-ctools-start \{ display: inline-flex; flex-wrap: wrap;/.test(r2));
  ok('…in the plain composer too', /\.l5-compose-foot > span \{ display: inline-flex; flex-wrap: wrap;/.test(read('components/logos5/l5-controls.css')));
  ok('"Add as idea" is spaced by the row\'s gap, not a margin that indented it on a line of its own', !/\.l6-addidea \{[^}]*margin-left/.test(read('components/logos6/logos6.css')));
  ok('the Enter hint\'s words start beside the ↵ and wrap there', /\.l5-intent-t \{ flex: 1 1 0; min-width: min\(12em, 100%\); \}/.test(read('components/logos6/omnibox.css')));
  ok('the conversation\'s tabs scroll from their start on a phone; centred, "← The space" went past the left edge, out of reach', /\.l5v-top\.is-narrow \.l5v-top-c \{ justify-content: flex-start; overflow-x: auto;/.test(r2));
}

console.log('\n=== the conversation\'s bar gives the switch the middle when its place is too tight ===');
{
  const views = read('components/logos5/L5Views.tsx');
  ok('the width the bar needs is measured for one place and one name, and a new name is measured afresh', /const needFor = `\$\{want\}\|\$\{title \?\? ''\}`;/.test(views) && /const needPx = need\.for === needFor \? need\.px : 0;/.test(views) && /setNeed\(\{ px: w \+ Math\.max\(0, over\) \+ Math\.max\(0, short\) \+ 8, for: needFor \}\)/.test(views));
  ok('…never cleared by an effect of its own, which ran after the measuring and wiped it (the tabs overran "Search" at 1100px)', !/useEffect\(\(\) => setNeed\(0\)/.test(views));
  ok('…and measured again as the name and the tabs grow with their data, and once the faces load — not only when the window resizes', /for \(const part of el\.querySelectorAll<HTMLElement>\('\.l5v-where, \.l5v-top-sw'\)\) watch\.observe\(part\);/.test(views) && /document\.fonts\?\.ready\?\.then\(\(\) => live && check\(\)\)/.test(views));
}

console.log('\n=== panels sized by what a phone shows ===');
{
  const files = ['components/logos5/universe.css', 'components/logos5/live-guide.css', 'components/logos5/redesign.css', 'components/write/write.css', 'components/display/kept.css', 'components/display/display.css', 'app/globals.css'];
  for (const f of files) {
    const css = read(f);
    // every "calc(100vh - …)" a height or max-height is given is followed by the same in the visible (dvh) or steady
    // small (svh) viewport, which a phone's browser bar does not overrun
    const vh = [...css.matchAll(/(max-height|height): ([^;]*calc\(100vh - [^;]*);/g)];
    const bare = vh.filter((m) => !css.slice(m.index, m.index + m[0].length + 160).match(new RegExp(`${m[1]}: [^;]*calc\\(100[ds]vh - `)));
    ok(`${f}: each height by the viewport also by the visible viewport`, vh.length > 0 && bare.length === 0, J(bare.map((m) => m[0])));
  }
}

console.log(`\nlayout reliability: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
