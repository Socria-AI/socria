// The canvas — how a person moves around a map and moves the cards on it.
//
//   drag the canvas  → the VIEWPORT   (lib/canvas.ts — presentational)
//   drag a card      → the LAYOUT     (lib/canvas-store.ts — this browser's)
//   edit a card      → the MODEL      (lib/map-edit.ts — canonical)
//
// Held here: the camera's arithmetic (zoom stays under the pointer, a pinch
// cannot drift, a wheel means what the hand meant, a fit never magnifies);
// the layout store (pins are kept, refused when corrupt, never mixed into the
// map, kept through a Reset view); the laid-out lenses never put a card on a
// card, at any panel width, for any kind of thinking; and the wiring that
// came out of external feedback — the composer is never disabled, the thread
// scrolls only itself, the dock cannot push the composer out of reach, and a
// drag writes no React state per frame.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as C from './.tmp/canvas.mjs';
import * as S from './.tmp/canvas-store.mjs';
import { availableLenses, layoutStructure, layoutTensions, layoutEvidence, layoutSolve, layoutFlow, layoutTimeline } from './.tmp/logos-layout.mjs';
import { ALL as DOMAINS } from './fixtures/synthesis-maps.mjs';
import { SCENARIOS } from './fixtures/shapes.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

console.log('=== the camera: zoom stays where the pointer is ===');
{
  const cam = { x: 120, y: -40, k: 0.8 };
  const w0 = C.toWorld(cam, 300, 200);
  const z = C.zoomAt(cam, 1.6, 300, 200);
  const w1 = C.toWorld(z, 300, 200);
  ok('the world point under the pointer does not move', near(w0.x, w1.x) && near(w0.y, w1.y));
  ok('and the scale is what was asked', near(z.k, 1.6));
  ok('zoom is clamped at both ends', C.zoomAt(cam, 99, 0, 0).k === C.ZOOM_MAX && C.zoomAt(cam, 0.001, 0, 0).k === C.ZOOM_MIN);
  const back = C.zoomAt(z, 0.8, 300, 200);
  ok('zooming back returns the same camera', near(back.x, cam.x, 1e-9) && near(back.y, cam.y, 1e-9));
  ok('screen ↔ world are inverses', (() => { const s = C.toScreen(cam, 33, -7); const w = C.toWorld(cam, s.x, s.y); return near(w.x, 33) && near(w.y, -7); })());
  ok('a pan moves by exactly the drag', (() => { const p = C.panBy(cam, 150, 80); return p.x === 270 && p.y === 40 && p.k === 0.8; })());
  ok('the transform is one translate and one scale', /^translate\(-?[\d.]+px, -?[\d.]+px\) scale\([\d.]+\)$/.test(C.cameraTransform(cam)));
}

console.log('\n=== two fingers ===');
{
  const start = { x: 10, y: 20, k: 1 };
  const a0 = { x: 100, y: 100 }, b0 = { x: 200, y: 100 };
  const same = C.pinchCamera(start, a0, b0, a0, b0);
  ok('fingers that have not moved leave the camera alone', near(same.x, 10) && near(same.y, 20) && near(same.k, 1));
  const wide = C.pinchCamera(start, a0, b0, { x: 50, y: 100 }, { x: 250, y: 100 });
  ok('fingers twice as far apart zoom twice as close', near(wide.k, 2));
  const mid = C.toWorld(start, 150, 100);
  const after = C.toWorld(wide, 150, 100);
  ok('  around the point between them', near(mid.x, after.x) && near(mid.y, after.y));
  const slid = C.pinchCamera(start, a0, b0, { x: 130, y: 140 }, { x: 230, y: 140 });
  ok('two fingers moving together pan', near(slid.k, 1) && near(slid.x, 40) && near(slid.y, 60));
  const viaSteps = [0.2, 0.5, 0.9, 1].reduce((c, t) => C.pinchCamera(start, a0, b0, { x: 100 - 50 * t, y: 100 + 10 * t }, { x: 200 + 50 * t, y: 100 + 10 * t }), start);
  const direct = C.pinchCamera(start, a0, b0, { x: 50, y: 110 }, { x: 250, y: 110 });
  ok('computed from the gesture start, so it cannot drift', near(viaSteps.x, direct.x) && near(viaSteps.y, direct.y) && near(viaSteps.k, direct.k));
}

console.log('\n=== what a wheel means ===');
{
  const w = (o) => ({ deltaX: 0, deltaY: 0, deltaMode: 0, ctrlKey: false, metaKey: false, shiftKey: false, ...o });
  const pinch = C.readWheel(w({ deltaY: -6.5, ctrlKey: true }));
  ok('a trackpad pinch (ctrl set by the browser) zooms in, finely', pinch.kind === 'zoom' && pinch.factor > 1 && pinch.factor < 1.2);
  const notch = C.readWheel(w({ deltaY: 100 }));
  ok('a mouse-wheel notch zooms out a step', notch.kind === 'zoom' && notch.factor < 1 && notch.factor > 0.7);
  ok('a line-mode wheel is a notch too', C.readWheel(w({ deltaY: -3, deltaMode: 1 })).kind === 'zoom');
  const swipe = C.readWheel(w({ deltaX: 3.5, deltaY: 12.25 }));
  ok('a two-finger trackpad swipe pans, both ways', swipe.kind === 'pan' && swipe.dx === -3.5 && swipe.dy === -12.25);
  const side = C.readWheel(w({ deltaY: 100, shiftKey: true }));
  ok('shift + wheel pans sideways', side.kind === 'pan' && side.dx === -100 && side.dy === 0);
  ok('a huge pinch delta is a bounded step', C.readWheel(w({ deltaY: -5000, ctrlKey: true })).factor < 2.1);
}

console.log('\n=== fitting ===');
{
  const content = { x: -200, y: -100, w: 400, h: 200 };
  const f = C.fitCamera(content, 1000, 600);
  ok('small content is not magnified past 1:1', f.k === 1);
  const c = C.toScreen(f, 0, 0);
  ok('  and is centred', near(c.x, 500) && near(c.y, 300));
  const big = C.fitCamera({ x: 0, y: 0, w: 4000, h: 2000 }, 1000, 600, { pad: 40 });
  const tl = C.toScreen(big, 0, 0), br = C.toScreen(big, 4000, 2000);
  ok('large content shrinks until all of it fits', tl.x >= 39.9 && br.x <= 960.1 && tl.y >= 39.9 && br.y <= 560.1);
  const floor = C.fitCamera({ x: 0, y: 0, w: 400, h: 6000 }, 1000, 600, { minK: 0.6, align: 'start' });
  ok('below the legibility floor it stops shrinking', floor.k === 0.6);
  ok('  and shows the start, not the middle', near(C.toScreen(floor, 0, 0).y, 40));
  const ins = C.fitCamera(content, 1000, 600, { insets: { top: 0, right: 0, bottom: 0, left: 200 } });
  ok('insets (tabs on a side) move the centre over', near(C.toScreen(ins, 0, 0).x, 600));
  ok('bounds of nothing is nothing', C.boundsOf([]) === null);
  ok('bounds of cards', JSON.stringify(C.boundsOf([{ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: -5, w: 5, h: 5 }])) === JSON.stringify({ x: 0, y: -5, w: 25, h: 15 }));
}

console.log('\n=== the map cannot be lost ===');
{
  const content = { x: 0, y: 0, w: 500, h: 300 };
  const far = C.keepInView({ x: -5000, y: 9000, k: 1 }, content, 1000, 600);
  const s = C.toScreen(far, 0, 0);
  ok('a camera flung away is held so some of the map stays on screen', s.x + 500 >= 79 && s.y <= 600 - 79);
  ok('a camera already showing it is untouched', JSON.stringify(C.keepInView({ x: 10, y: 10, k: 1 }, content, 1000, 600)) === JSON.stringify({ x: 10, y: 10, k: 1 }));
  ok('how much is visible: all', near(C.visibleShare({ x: 0, y: 0, k: 1 }, content, 1000, 600), 1));
  ok('how much is visible: none', C.visibleShare({ x: 2000, y: 0, k: 1 }, content, 1000, 600) === 0);
}

console.log('\n=== a press, a drag, a click ===');
{
  ok('a 3px wobble with a mouse is still a click', !C.isDrag(3, 0, 'mouse'));
  ok('5px with a mouse is a drag', C.isDrag(5, 0, 'mouse'));
  ok('a finger may wobble 6px and still tap', !C.isDrag(4, 4, 'touch'));
  ok('a finger past the slop drags', C.isDrag(8, 3, 'touch'));
  ok('the same card gets the same first place on every load', C.hashUnit('n42') === C.hashUnit('n42') && C.hashUnit('n42') !== C.hashUnit('n43'));
  ok('  in [0, 1)', [...Array(50)].every((_, i) => { const h = C.hashUnit('id' + i); return h >= 0 && h < 1; }));
}

console.log('\n=== a moved card takes its lines with it ===');
{
  const a = { x: 0, y: 0, w: 150, h: 56 };
  const b = { x: 400, y: 20, w: 150, h: 56 };
  const r = C.routeBetween(a, b);
  const nums = r.d.match(/-?[\d.]+/g).map(Number);
  ok('side by side: leaves a at its right edge', near(nums[0], 150) && near(nums[1], 28));
  ok('  and arrives at b at its left edge', near(nums[6], 400) && near(nums[7], 48));
  const c = { x: 10, y: 300, w: 150, h: 56 };
  const v = C.routeBetween(a, c).d.match(/-?[\d.]+/g).map(Number);
  ok('one above the other: bottom edge to top edge', near(v[1], 56) && near(v[7], 300));
  ok('a label goes on the curve, between them', r.mx > 150 && r.mx < 400);
}

console.log('\n=== the layout store ===');
{
  let d = S.emptyCanvas();
  const d1 = S.pin(d, 'graph', 'n1', 12.6, -40.2);
  ok('pinning returns a new document', d.lenses.graph === undefined && d1 !== d);
  ok('  rounded, in world coordinates', JSON.stringify(d1.lenses.graph.pins.n1) === '[13,-40]');
  ok('isPinned', S.isPinned(d1, 'graph', 'n1') && !S.isPinned(d1, 'graph', 'n2') && !S.isPinned(d1, 'structure', 'n1'));
  const lenses = S.pin(d1, 'structure', 'n1', 100, 100);
  ok('each lens keeps its own place for a card', lenses.lenses.graph.pins.n1[0] === 13 && lenses.lenses.structure.pins.n1[0] === 100);
  const un = S.unpin(lenses, 'graph', 'n1');
  ok('unpin lets it go in that lens only', !S.isPinned(un, 'graph', 'n1') && S.isPinned(un, 'structure', 'n1'));
  ok('unpinning what is not pinned changes nothing', S.unpin(un, 'graph', 'zz') === un);
  const cam = S.withCamera(lenses, 'graph', { x: 1.234, y: 2, k: 0.71234 }, true);
  ok('a camera is kept per lens, with whether it was moved', cam.lenses.graph.cam.moved === true && cam.lenses.graph.cam.k === 0.712);
  const reset = S.withoutCameras(cam);
  ok('Reset view forgets cameras', !reset.lenses.graph.cam);
  ok('  and keeps where the cards were put', S.isPinned(reset, 'graph', 'n1') && S.isPinned(reset, 'structure', 'n1'));
  const settled = S.withSettled(reset, 'graph', { a: [1.4, 2.6], b: [NaN, 3] });
  ok('settled positions are kept, bad ones dropped', JSON.stringify(settled.lenses.graph.settled) === '{"a":[1,3]}');
  const pr = S.prune(settled, new Set(['a']));
  ok('prune drops places for cards the map no longer has', !pr.lenses.graph.pins.n1 && !!pr.lenses.graph.settled.a);
  ok('prune with nothing to drop is a no-op', S.prune(pr, new Set(['a', 'n1'])) === pr);
}

console.log('\n=== what is read back is checked ===');
{
  ok('garbage is an empty document', JSON.stringify(S.sanitizeCanvas('nope')) === JSON.stringify(S.emptyCanvas()) && JSON.stringify(S.sanitizeCanvas(null)) === JSON.stringify(S.emptyCanvas()));
  ok('another version is not trusted', Object.keys(S.sanitizeCanvas({ v: 2, lenses: { graph: { pins: { a: [1, 2] } } } }).lenses).length === 0);
  const s = S.sanitizeCanvas({ v: 1, lenses: {
    graph: { pins: { a: [1, 2], b: ['x', 2], c: [1e9, 0], d: [1, 2, 3] }, cam: { x: 1, y: 2, k: 50, moved: true } },
    'Bad Lens!': { pins: { a: [1, 2] } },
    __proto__: { pins: {} },
  } });
  ok('only finite, sane coordinates survive', JSON.stringify(s.lenses.graph.pins) === '{"a":[1,2]}');
  ok('an absurd zoom is dropped', !s.lenses.graph.cam);
  ok('a lens name must look like a lens', !s.lenses['Bad Lens!']);
  const many = { v: 1, lenses: { graph: { pins: Object.fromEntries([...Array(900)].map((_, i) => ['n' + i, [i, i]])) } } };
  ok('a lens holds a bounded number of places', Object.keys(S.sanitizeCanvas(many).lenses.graph.pins).length === 600);
  // storage, through a stand-in
  const mem = new Map();
  globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  S.saveCanvas('sess1', S.pin(S.emptyCanvas(), 'graph', 'n1', 5, 6));
  ok('saved under its own key per line of thinking', mem.has('socria.canvas.v1:sess1'));
  ok('loaded back the same', S.isPinned(S.loadCanvas('sess1'), 'graph', 'n1'));
  ok('another line of thinking has its own', !S.isPinned(S.loadCanvas('sess2'), 'graph', 'n1'));
  ok('no key: nothing is written', (S.saveCanvas(null, S.emptyCanvas()), mem.size === 1));
  mem.set('socria.canvas.v1:bad', '{not json');
  ok('a corrupt entry loads as empty, not a crash', Object.keys(S.loadCanvas('bad').lenses).length === 0);
  globalThis.localStorage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); }, removeItem: () => {} };
  ok('blocked storage: loading still works', Object.keys(S.loadCanvas('sess1').lenses).length === 0);
  let threw = false; try { S.saveCanvas('sess1', S.emptyCanvas()); } catch { threw = true; }
  ok('full storage: saving does not throw', !threw);
  delete globalThis.localStorage;
  const stored = JSON.stringify(S.pin(S.emptyCanvas(), 'graph', 'n1', 5, 6));
  ok('the layout holds ids and numbers — no label, type or relation', !/label|type|relation|status/.test(stored));
}

console.log('\n=== a laid-out lens never puts a card on a card ===');
{
  const overlaps = (placed) => {
    let n = 0;
    for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i], b = placed[j];
      if (Math.abs(a.x - b.x) < (a.w + b.w) / 2 - 1 && Math.abs(a.y - b.y) < (a.h + b.h) / 2 - 1) n++;
    }
    return n;
  };
  const LAYOUT = { structure: layoutStructure, tensions: layoutTensions, evidence: layoutEvidence, solve: layoutSolve, flow: layoutFlow, timeline: layoutTimeline };
  const maps = [...Object.entries(DOMAINS), ...SCENARIOS.map((s) => [s.name, s.map])];
  const big = (n) => ({ nodes: [...Array(n)].map((_, i) => ({ id: 'n' + i, type: ['claim', 'idea', 'question', 'evidence', 'goal'][i % 5], label: `Point ${i}: ${['short', 'a label long enough to wrap onto a second line', 'a label long enough to wrap onto a second and then a third line of the card'][i % 3]}` })), edges: [...Array(n - 1)].map((_, i) => ({ from: 'n' + (i + 1), to: 'n' + Math.floor(i / 3), relation: i % 4 ? 'supports' : 'part_of' })) });
  for (const n of [2, 5, 10, 25, 50, 100]) maps.push([`synthetic ${n}`, big(n)]);
  let checked = 0;
  const bad = [];
  for (const [name, map] of maps) {
    for (const lens of availableLenses(map)) {
      const f = LAYOUT[lens];
      if (!f) continue;
      for (const w of [390, 800, 1280]) {
        const out = f(map, w, 620);
        if (!out.placed.length) continue;
        checked++;
        const o = overlaps(out.placed);
        if (o) bad.push(`${name} · ${lens} @${w}: ${o}`);
      }
    }
  }
  ok(`no overlaps across ${checked} layouts (every fixture, every lens, three widths)`, bad.length === 0, bad.slice(0, 8).join('; '));
  ok('it really ran across many layouts', checked > 80, checked);
  const LARGE = DOMAINS.LARGE;
  const st = layoutStructure(LARGE, 1000, 600);
  ok('72 objects in Structure: wrapped, not squeezed', overlaps(st.placed) === 0 && new Set(st.placed.map((p) => p.y)).size > 3);
  const conns = availableLenses(DOMAINS.ONBOARDING).flatMap((l) => (LAYOUT[l] ? LAYOUT[l](DOMAINS.ONBOARDING, 1000, 600).connectors : []));
  ok('every connector names the cards it joins (so a moved card can take it along)', conns.length > 0 && conns.every((c) => c.to && (c.from || c.key.startsWith('tick~')) || c.key === 'timeline-axis'));
}

console.log('\n=== the composer is always usable while chat is ===');
{
  const comp = read('components/LogosComposer.tsx');
  ok('the textarea is never disabled (a reply in flight used to lock it)', !/<textarea[^>]*\bdisabled=/s.test(comp.slice(comp.indexOf('<textarea'), comp.indexOf('/>', comp.indexOf('<textarea')))));
  ok('  only sending waits for the reply', /const canSend = [^;]*!busy/.test(comp));
  ok('  and it says so in place', /Keep writing/.test(comp) && /aria-busy=\{busy/.test(comp));
  ok('attaching is not blocked by a reply either', !/disabled=\{busy \|\|/.test(comp));
  const app = read('components/LogosApp.tsx');
  ok('the thread scrolls itself, never its ancestors', !/scrollIntoView\(/.test(app) && /t\.scrollTop = t\.scrollHeight/.test(app));
  ok('  and a streaming reply only follows someone already at the end', /atEndRef\.current = t\.scrollHeight - t\.scrollTop - t\.clientHeight < 48/.test(app));
  const ws = read('components/workspace/workspace.css');
  ok('the dock may shrink; the composer may not', /\.ws-dock > \* \{ flex-shrink: 0; \}/.test(ws) && /\.ws-dock > \.lg-thread, \.logos-root \.ws-dock > \.syn \{ flex-shrink: 1; min-height: 0; \}/.test(ws));
  ok('the stage keeps a floor when the conversation unfolds', /\.ws-stage \{ min-height: min\(26vh, 220px\); \}/.test(ws) && /is-narrow > \.ws-stage/.test(ws));
}

console.log('\n=== the wiring ===');
{
  const tm = read('components/ThinkingMap.tsx');
  ok('the canvas is panned, not scrolled', !/scrollLeft|scrollTop/.test(tm) && /lg-map-world/.test(tm) && /cameraTransform\(c\)/.test(tm));
  ok('the old scroll sizer is gone', !/lg-map-sizer|lg-map-surface/.test(tm + read('app/globals.css')));
  ok('Pointer Events for mouse, pen and touch, with cancel and lost capture', /onPointerDown=\{onPointerDown\}/.test(tm) && /onPointerCancel=\{onPointerCancel\}/.test(tm) && /onLostPointerCapture=/.test(tm));
  ok('two pointers make a pinch', /pts\.size === 2/.test(tm) && /pinchCamera\(g\.cam0/.test(tm));
  ok('a drag is never also a click', /onClickCapture=/.test(tm) && /suppressClickRef\.current = true/.test(tm));
  const move = tm.slice(tm.indexOf('const onPointerMove'), tm.indexOf('const onPointerUp'));
  ok('a pointer move writes no React state (only refs and a frame)', !/set[A-Z]\w*\((?!null\))/.test(move.replace(/setPointerCapture|setHovered\(null\)|setMenu\(null\)/g, '')));
  ok('the camera goes to the DOM, not to state', !/useState<Camera>|setZoom\(/.test(tm));
  ok('no panel clamp in the graph simulation', !/Math\.max\(PAD/.test(tm) && !/\bconst PAD\b/.test(tm));
  ok('separation uses each card\'s measured size', /dimOf\(ia\)/.test(tm) && /offsetHeight/.test(tm));
  ok('a placed card does not move; the other one makes room', /if \(fa && fb\) continue/.test(tm) && /const wa = fa \? 0/.test(tm));
  ok('seeding is deterministic', !/Math\.random\(\)/.test(tm) && /hashUnit\(n\.id\)/.test(tm));
  ok('a new turn warms the layout, it does not restart it', /before \+ remembered === 0 \? 1 : 0\.4/.test(tm));
  ok('the graph loop never paints over a laid-out lens', /if \(lensRef\.current !== 'graph'\) return;/.test(tm));
  ok('auto-fit stops once the person moves the camera', /if \(movedRef\.current \|\| held\(\) \|\| gestureRef\.current\) return;/.test(tm));
  ok('Escape puts a card back mid-drag', /e\.key === 'Escape' && gestureRef\.current\?\.kind === 'node'/.test(tm) && /endGesture\(false\)/.test(tm));
  ok('the keyboard moves the canvas and a card', /onKeyDown=\{onCanvasKey\}/.test(tm) && /ev\.altKey && ev\.key\.startsWith\('Arrow'\)/.test(tm));
  ok('a focused card off-screen is brought into view', /matches\(':focus-visible'\)\) ensureVisible/.test(tm));
  ok('Return to its place, quietly, only on a placed card', /isPinned\(canvasRef\.current, lens, node\.id\) && \(/.test(tm) && /Return to its place/.test(tm));
  ok('drags never call onEdit (layout is not the model)', !/placeCard[\s\S]{0,600}onEdit/.test(tm.slice(tm.indexOf('const placeCard'), tm.indexOf('const releaseCard'))));
  ok('LogosApp keys the layout to the line of thinking', /layoutKey=\{activeId\}/.test(read('components/LogosApp.tsx')));
  ok('maps inside scrolling pages leave the wheel to the page', ['app/logos/LogosDemo.tsx', 'app/explore/ExploreShowcase.tsx', 'app/logos2/Logos2Workspace.tsx', 'app/docs/DocsDemo.tsx'].every((f) => /<ThinkingMap(View)? embedded/.test(read(f))) && /if \(embedded && !e\.ctrlKey && !e\.metaKey\) return;/.test(tm));
  const css = read('app/globals.css');
  ok('the canvas owns touch and never selects text', /\.lg-map\.can-pan \{[^}]*touch-action: none;[^}]*user-select: none;/s.test(css));
  ok('grab, grabbing, and a lifted card', /\.lg-map\.can-pan \{[^}]*cursor: grab/s.test(css) && /is-dragging-node[^{]*\{ cursor: grabbing !important; \}/.test(css) && /\.lg-node-pos\.is-dragging \.lg-node \{/.test(css));
  ok('cards show keyboard focus', /\.lg-node:focus-visible \{ outline:/.test(css));
  ok('the emergence animates the card, not where it sits', /is-emerging \.lg-node-pos > \.lg-node \{/.test(css));
  ok('the map type holds no coordinates', !/\bx\?: number|\by\?: number/.test(read('lib/logos.ts').slice(read('lib/logos.ts').indexOf('export interface LogosNode'), read('lib/logos.ts').indexOf('}', read('lib/logos.ts').indexOf('export interface LogosNode')))));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
