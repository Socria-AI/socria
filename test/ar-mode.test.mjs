// AR MODE — the Logic Map, moved with your hands (Logos 5).
//
// The Logos 2 benches (app/logos2-test, app/mind-ar) proved the parts on a
// toy map; AR Mode is those parts on the person's own map, inside Logos 5:
//
//   lib/hand-gestures.ts          a hand → a pose → an intention (the benches', reused; held in hand-gestures.test)
//   lib/hand-tracking.ts          the camera and MediaPipe, loaded at runtime (the benches', reused)
//   lib/logos5/ar.ts              the geometry: the view, where cards start, one frame of hands, relationships said
//   lib/ar-access.ts              who may use it while it is early (default deny, decided on the server)
//   components/logos5/ARMode.tsx  the overlay: map in space, hands or mouse/touch, inspector, confirm, preview + waitlist
//   components/LogosApp.tsx       the way in (the Logic Map's view bar, the ⋯ menu) and where its edits go
//   components/ThinkingMap.tsx    reads a card AR Mode put down, so both views show one arrangement
//
// What must hold: a hand or a pointer lands on the card it is over however
// the map is turned; cards open where the Logic Map has them and a card put
// down is a pin there; nothing destructive happens without a confirm; the
// camera is never asked for except by a tester pressing Start; everybody else
// sees a preview and the waitlist.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import * as A from './.tmp/ar-under-test.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(root, f), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 400))));
const J = JSON.stringify;
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
const nearPt = (p, q, e = 1e-6) => near(p.x, q.x, e) && near(p.y, q.y, e);
const W = 1200, H = 800;

console.log('\n=== the view: a world point and its place on the screen ===');
{
  const views = [A.HOME_VIEW, { x: 40, y: -25, k: 1.7, r: 0.6 }, { x: -300, y: 120, k: 0.4, r: -2.9 }, { x: 0, y: 0, k: 2.5, r: Math.PI }];
  const pts = [{ x: 0, y: 0 }, { x: 186, y: -93 }, { x: -512, y: 377 }];
  ok(
    'toWorld undoes toScreen, however the map is panned, zoomed and turned',
    views.every((v) => pts.every((p) => nearPt(A.toWorld(A.toScreen(p, v, W, H), v, W, H), p))),
  );
  ok('the home view puts the world origin at the centre of the stage', nearPt(A.toScreen({ x: 0, y: 0 }, A.HOME_VIEW, W, H), { x: W / 2, y: H / 2 }));
  const v = { x: 30, y: 10, k: 1.1, r: 0.4 };
  const under = { x: 911, y: 233 };
  const z = A.zoomAbout(v, 1.6, under.x, under.y, W, H);
  ok('zooming keeps what is under the cursor under the cursor', nearPt(A.toScreen(A.toWorld(under, v, W, H), z, W, H), under), J(z));
  ok('  and the zoom is held between its limits', near(A.zoomAbout(v, 100, 0, 0, W, H).k, A.AR_ZOOM.max) && near(A.zoomAbout(v, 1e-6, 0, 0, W, H).k, A.AR_ZOOM.min));
  ok('  a nonsense factor changes nothing', A.zoomAbout(v, NaN, 0, 0, W, H) === v && A.zoomAbout(v, -2, 0, 0, W, H) === v && A.zoomAbout(v, 0, 0, 0, W, H) === v);
  const t = A.rotateAbout(v, 1.1, under.x, under.y, W, H);
  ok('turning keeps the point it turns about where it is', nearPt(A.toScreen(A.toWorld(under, v, W, H), t, W, H), under));
  ok('  and keeps the zoom', near(t.k, v.k) && near(t.r, v.r + 1.1));
  ok('angles stay in (−π, π]', [0, Math.PI, -Math.PI, 3 * Math.PI, -7, 7, 100].every((a) => { const n = A.normAngle(a); return n > -Math.PI - 1e-12 && n <= Math.PI + 1e-12 && near(Math.cos(n), Math.cos(a)) && near(Math.sin(n), Math.sin(a)); }));
  ok('panning is a plain shift', J(A.panBy(v, 5, -7)) === J({ ...v, x: 35, y: 3 }));
}

console.log('\n=== two hands hold the map ===');
{
  const v = { x: -20, y: 15, k: 0.9, r: 0.2 };
  const mid = { x: 640, y: 380 };
  const held = A.toWorld(mid, v, W, H);
  const zoomed = A.twoHandView(v, { scale: 1.5, roll: 0.3, mid, move: { x: 0, y: 0 } }, W, H);
  ok('pulled apart and turned, the point between the hands stays between them', nearPt(A.toScreen(held, zoomed, W, H), mid), J(zoomed));
  ok('  scaled by the hands, turned by the hands', near(zoomed.k, 0.9 * 1.5) && near(zoomed.r, 0.5));
  const carried = A.twoHandView(v, { scale: 1, roll: 0, mid: { x: 700, y: 410 }, move: { x: 60, y: 30 } }, W, H);
  ok('carried across, the map goes with both hands', nearPt(A.toScreen(A.toWorld({ x: 640, y: 380 }, v, W, H), carried, W, H), { x: 700, y: 410 }) && near(carried.k, v.k) && near(carried.r, v.r));
  const both = A.twoHandView(v, { scale: 2, roll: -0.4, mid: { x: 500, y: 300 }, move: { x: -40, y: 25 } }, W, H);
  ok('  zoom, turn and carry at once: what was between the hands is between them now', nearPt(A.toScreen(A.toWorld({ x: 540, y: 275 }, v, W, H), both, W, H), { x: 500, y: 300 }));
  ok('a broken reading changes neither zoom nor turn', (() => { const b = A.twoHandView(v, { scale: NaN, roll: Infinity, mid, move: { x: 0, y: 0 } }, W, H); return near(b.k, v.k) && near(b.r, v.r); })());
  ok('…and cannot zoom past the limit', near(A.twoHandView(v, { scale: 50, roll: 0, mid, move: { x: 0, y: 0 } }, W, H).k, A.AR_ZOOM.max));
}

console.log('\n=== fitting the map to the stage ===');
{
  const pts = [{ x: -400, y: -120 }, { x: 900, y: 300 }, { x: 100, y: 700 }];
  const v = A.fitView(pts, W, H, 72);
  const inside = pts.every((p) => { const s = A.toScreen(p, v, W, H); return s.x >= 72 && s.x <= W - 72 && s.y >= 72 && s.y <= H - 72; });
  ok('every card is on the stage, inside the margin', inside, J(v));
  ok('  upright, and never bigger than life', v.r === 0 && v.k <= 1);
  ok('  centred on the cards', nearPt(A.toScreen({ x: 250, y: 290 }, v, W, H), { x: W / 2, y: H / 2 }));
  ok('a small map is shown at full size, not blown up', A.fitView([{ x: 0, y: 0 }, { x: 50, y: 20 }], W, H).k === 1);
  // a phone: the bar across the top and the waitlist across the bottom cover the stage — no card is fitted under them
  const PW = 390, PH = 780, inset = { top: 120, bottom: 330 };
  const vp = A.fitView(pts, PW, PH, 24, inset);
  const under = pts.filter((p) => { const s = A.toScreen(p, vp, PW, PH); return s.y < inset.top + 24 - 1e-6 || s.y > PH - inset.bottom - 24 + 1e-6 || s.x < 24 - 1e-6 || s.x > PW - 24 + 1e-6; });
  ok('with a bar on top and a panel along the bottom, every card is fitted into what is left uncovered', under.length === 0, J({ vp, under }));
  ok('no cards, or no stage, is the home view', J(A.fitView([], W, H)) === J(A.HOME_VIEW) && J(A.fitView(pts, 0, 0)) === J(A.HOME_VIEW));
}

console.log('\n=== where the cards start: where the Logic Map has them ===');
{
  const nodes = [{ id: 'p' }, { id: 's' }, { id: 'n' }, { id: 'lone1' }, { id: 'lone2' }];
  const edges = [{ from: 'n', to: 's' }];
  let doc = A.emptyCanvas();
  doc = A.withSettled(doc, 'graph', { p: [10, 10], s: [300, -40] });
  doc = A.pin(doc, 'graph', 'p', -220, 145);
  const { pos, pinned, remembered } = A.seedPositions(nodes, edges, doc);
  ok('a card the person put down is where they put it (the pin wins over where the graph settled)', nearPt(pos.p, { x: -220, y: 145 }));
  ok('  and only pinned cards are pinned', pinned.has('p') && pinned.size === 1);
  ok('  what was pinned or settled is remembered — an arrangement to keep, not to tidy', J([...remembered].sort()) === J(['p', 's']));
  ok('a card the graph settled is where it settled', nearPt(pos.s, { x: 300, y: -40 }));
  const d = Math.hypot(pos.n.x - pos.s.x, pos.n.y - pos.s.y);
  ok('a new card with a placed neighbour lands beside it, at the Logic Map’s spacing', near(d, A.SEED_SPACING * 0.85, 1e-6), d);
  ok('new cards with no neighbour are spread out, not piled on one spot', Math.hypot(pos.lone1.x - pos.lone2.x, pos.lone1.y - pos.lone2.y) > 50);
  const again = A.seedPositions(nodes, edges, doc);
  ok('the same map starts the same way every time', J(again.pos) === J(pos));
  const none = A.seedPositions(nodes, edges, null);
  ok('with nothing kept, every card still gets a place', nodes.every((n) => Number.isFinite(none.pos[n.id]?.x) && Number.isFinite(none.pos[n.id]?.y)) && none.pinned.size === 0);
  // the same order of preference as the Logic Map's graph lens — so both open on one arrangement
  const tm = read('components/ThinkingMap.tsx');
  ok(
    'the order is the Logic Map’s own: pins, then settled, then beside a neighbour at 0.85 of its spring, then the same sunflower spiral',
    /const pinned = lay\.pins\[n\.id\]/.test(tm) && /lay\.settled\?\.\[n\.id\]/.test(tm) && /SPRING_LEN \* 0\.85/.test(tm) && /96 \* Math\.sqrt\(i \+ 0\.5\)/.test(tm) && /i \* 2\.399963/.test(tm),
  );
  ok('  and its spring is the spacing AR Mode seeds at', new RegExp(`SPRING_LEN = ${A.SEED_SPACING}\\b`).test(tm));
}

console.log('\n=== cards with no place yet are spread; placed ones are never moved ===');
{
  const overlap = (p, q) => Math.abs(p.x - q.x) < A.CARD_BOX.w && Math.abs(p.y - q.y) < A.CARD_BOX.h;
  const pos = { a: { x: 0, y: 0 }, b: { x: 12, y: 6 }, c: { x: 24, y: -4 }, d: { x: 0, y: 0 }, fixed: { x: 40, y: 10 } };
  const out = A.separate(pos, new Set(['a', 'b', 'c', 'd']));
  const ids = Object.keys(pos);
  const pairs = ids.flatMap((x, i) => ids.slice(i + 1).map((y) => [x, y]));
  ok('afterwards no two cards overlap', pairs.every(([x, y]) => !overlap(out[x], out[y])), J(out));
  ok('  a card that was placed (by the person, or by the Logic Map settling) has not moved', nearPt(out.fixed, pos.fixed));
  ok('  two cards on exactly one spot are parted too', !overlap(out.a, out.d));
  const again = A.separate(pos, new Set(['a', 'b', 'c', 'd']));
  ok('  the same map spreads the same way every time', ids.every((id) => nearPt(again[id], out[id])));
  ok('  and the input is left as it was', pos.a.x === 0 && pos.b.x === 12);
  const apart = { a: { x: 0, y: 0 }, b: { x: 400, y: 0 }, c: { x: 0, y: 300 } };
  const kept = A.separate(apart, new Set(['a', 'b', 'c']));
  ok('cards already apart stay exactly where they are', Object.keys(apart).every((id) => nearPt(kept[id], apart[id])));
  const none = A.separate(pos, new Set());
  ok('with nothing new to place, nothing moves — even cards the Logic Map left touching', ids.every((id) => nearPt(none[id], pos[id])));
  // a whole map, seeded the Logic Map's way with nothing kept, opens legible
  const big = Array.from({ length: 40 }, (_, i) => ({ id: `n${i}` }));
  const links = big.slice(1).map((n, i) => ({ from: n.id, to: `n${Math.floor(i / 3)}` }));
  const seeded = A.seedPositions(big, links, null);
  const spread = A.separate(seeded.pos, new Set(big.map((n) => n.id)));
  const bp = big.flatMap((x, i) => big.slice(i + 1).map((y) => [x.id, y.id]));
  ok('a forty-card map with no arrangement opens with no card on another', bp.every(([x, y]) => !overlap(spread[x], spread[y])), bp.filter(([x, y]) => overlap(spread[x], spread[y])).length);
}

console.log('\n=== one frame of hands ===');
{
  const v = { x: 0, y: 0, k: 1, r: 0 };
  const world = { a: { x: 0, y: 0 }, b: { x: 300, y: 0 } };
  const cards = (view) => Object.entries(world).map(([id, p]) => ({ id, ...A.toScreen(p, view, W, H), world: p }));
  const aS = A.toScreen(world.a, v, W, H);
  // a pinch just off the card's centre picks it up without it jumping to the fingertips
  const grip = { x: aS.x + 12, y: aS.y - 8 };
  const s1 = A.arStep(v, null, { one: { aim: grip, grabbing: true }, both: null, tap: null }, cards(v), W, H);
  ok('a pinch over a card picks it up', s1.hold?.kind === 'node' && s1.hold.id === 'a', J(s1.hold));
  ok('  where it was caught: the card does not jump', s1.moved && nearPt(s1.moved.at, world.a));
  const s2 = A.arStep(v, s1.hold, { one: { aim: { x: grip.x + 50, y: grip.y + 20 }, grabbing: true }, both: null, tap: null }, cards(v), W, H);
  ok('  and follows the pinch', s2.moved && nearPt(s2.moved.at, { x: 50, y: 20 }) && s2.hold?.id === 'a');
  const turned = { x: 0, y: 0, k: 2, r: Math.PI / 2 };
  const t1 = A.arStep(turned, { kind: 'node', id: 'a', offset: { x: 0, y: 0 } }, { one: { aim: { x: W / 2, y: H / 2 + 40 }, grabbing: true }, both: null, tap: null }, cards(turned), W, H);
  ok('  on a map that is zoomed and turned, it moves the way the hand moves on the screen', t1.moved && nearPt(A.toScreen(t1.moved.at, turned, W, H), { x: W / 2, y: H / 2 + 40 }), J(t1.moved));
  const s3 = A.arStep(v, s2.hold, { one: { aim: grip, grabbing: false }, both: null, tap: null }, cards(v), W, H);
  ok('opening the fingers puts it down', s3.dropped === 'a' && s3.hold === null && !s3.moved);
  const lost = A.arStep(v, s2.hold, { one: null, both: null, tap: null }, cards(v), W, H);
  ok('  so does the hand leaving the frame', lost.dropped === 'a' && lost.hold === null);
  const p1 = A.arStep(v, null, { one: { aim: { x: 100, y: 700 }, grabbing: true }, both: null, tap: null }, cards(v), W, H);
  ok('a pinch on empty space holds the map, not a card', p1.hold?.kind === 'pan' && !p1.moved);
  const p2 = A.arStep(p1.view, p1.hold, { one: { aim: { x: 130, y: 690 }, grabbing: true }, both: null, tap: null }, cards(p1.view), W, H);
  ok('  and moving it pans the whole map', near(p2.view.x, 30) && near(p2.view.y, -10) && !p2.moved);
  const b1 = A.arStep(v, s1.hold, { one: { aim: grip, grabbing: true }, both: { scale: 1.3, roll: 0.2, mid: { x: 600, y: 400 }, move: { x: 0, y: 0 } } }, cards(v), W, H);
  ok('both hands pinching hold the map: whatever one hand carried is put down first', b1.dropped === 'a' && b1.hold === null && !b1.moved);
  ok('  and the map is scaled and turned', near(b1.view.k, 1.3) && near(b1.view.r, 0.2));
  const tapA = A.arStep(v, null, { one: { aim: aS, grabbing: false }, both: null, tap: aS }, cards(v), W, H);
  ok('a quick pinch selects the card it was over', tapA.select?.id === 'a');
  const tapNone = A.arStep(v, null, { one: { aim: { x: 5, y: 5 }, grabbing: false }, both: null, tap: { x: 5, y: 5 } }, cards(v), W, H);
  ok('  over empty space it clears the selection', tapNone.select && tapNone.select.id === null);
  const idle = A.arStep(v, null, { one: null, both: null, tap: null }, cards(v), W, H);
  ok('no hands, nothing happens', idle.view === v && idle.hold === null && !idle.moved && !idle.dropped && !idle.select);
  const far = A.arStep(v, null, { one: { aim: { x: aS.x + 90, y: aS.y }, grabbing: true }, both: null, tap: null }, cards(v), W, H);
  ok('a card is caught within a hand’s reach of it, not from across the map', far.hold?.kind === 'pan');
}

console.log('\n=== the camera’s picture, laid on the stage ===');
{
  const vid = { w: 1280, h: 720 };
  ok('the middle of the picture is the middle of the stage', nearPt(A.videoToStage({ x: 0.5, y: 0.5 }, vid, { w: W, h: H }, false), { x: W / 2, y: H / 2 }));
  const l = A.videoToStage({ x: 0.2, y: 0.5 }, vid, { w: W, h: H }, false);
  const m = A.videoToStage({ x: 0.2, y: 0.5 }, vid, { w: W, h: H }, true);
  ok('mirrored for a front camera: left in the picture is right on the screen', near(l.x + m.x, W));
  // a 16:9 picture covering a 3:2 stage is cut at the sides, as object-fit: cover is
  const edge = A.videoToStage({ x: 0, y: 0 }, vid, { w: W, h: H }, false);
  ok('  drawn as object-fit: cover is — the top edge on the top, the sides cut', near(edge.y, 0) && edge.x < 0);
}

console.log('\n=== a card’s connections, read from the card ===');
{
  const nodes = [
    { id: 'g', label: 'Take the role?', type: 'decision' },
    { id: 'b', label: 'Unchallenged for a year', type: 'belief' },
    { id: 'c', label: 'Smaller team', type: 'tension' },
    { id: 'q', label: 'What decides?', type: 'question' },
  ];
  const edges = [
    { from: 'b', to: 'g', relation: 'supports' },
    { from: 'q', to: 'g', relation: 'applies_to' },
    { from: 'c', to: 'g', relation: 'conflicts' },
    { from: 'g', to: 'ghost', relation: 'leads_to' },
  ];
  const r = A.relationsOf(nodes, edges, 'g');
  ok('what pulls against it first, then what holds it up, then the rest', J(r.map((x) => x.other.id)) === J(['c', 'b', 'q']), J(r));
  ok('  each said from this card’s side', r[1].phrase === 'is supported by' && r[1].direction === 'in' && r[2].phrase === 'is shaped by');
  ok('  from the other end, the other way round', A.relationsOf(nodes, edges, 'b')[0].phrase === 'supports' && A.relationsOf(nodes, edges, 'b')[0].direction === 'out');
  ok('  a link to a card that is not there is left out', !r.some((x) => x.other.id === 'ghost'));
  ok('every relation the Logic Map draws has words, both ways round', A.RELATIONS.every((k) => Array.isArray(A.RELATION_WORDS[k]) && A.RELATION_WORDS[k].length === 2 && A.RELATION_WORDS[k].every((w) => typeof w === 'string' && w.length > 1)) && Object.keys(A.RELATION_WORDS).length === A.RELATIONS.length);
  ok('the sample map is whole: every link joins two of its cards', A.AR_SAMPLE.edges.every((e) => A.AR_SAMPLE.nodes.some((n) => n.id === e.from) && A.AR_SAMPLE.nodes.some((n) => n.id === e.to)));
  ok('the help says every move, including that nothing goes without a thumbs up', A.AR_HELP.length >= 6 && A.AR_HELP.some((x) => /thumbs up/i.test(x.does)) && A.AR_HELP.some((x) => /both hands/i.test(x.gesture)));
}

console.log('\n=== who may use it while it is early ===');
{
  const v = (id, emails) => ({ id, emails: emails.map(([address, verified]) => ({ address, verified })) });
  const tess = v('user_tess', [['tess@example.com', true]]);
  const vera = v('user_vera', [['other@example.com', true], ['Vera@Example.com', true]]);
  const una = v('user_una', [['una@example.com', false]]);
  const off = { production: true };
  ok('nobody, by default', !A.mayUseAr(tess, off) && !A.mayUseAr(null, off) && !A.mayUseAr(tess, { production: false }));
  ok('a listed account id', A.mayUseAr(tess, { ...off, testers: 'user_tess' }));
  ok('a listed address — on a verified address, in any case', A.mayUseAr(vera, { ...off, testers: 'someone@x.com, vera@example.com' }));
  ok('  but never on an address that was not verified', !A.mayUseAr(una, { ...off, testers: 'una@example.com' }));
  ok('whoever may see the developer dashboard', A.mayUseAr(tess, { ...off, admins: 'tess@example.com' }) && A.mayUseAr(tess, { ...off, admins: 'user_tess' }));
  let asked = null;
  ok('the owner’s permanent grant, asked of the account’s addresses', A.mayUseAr(vera, { ...off, granted: (e) => ((asked = e), true) }) && asked?.length === 2);
  ok('  and not without it', !A.mayUseAr(vera, { ...off, granted: () => false }));
  ok('`*` opens it to everyone — off production', A.mayUseAr(null, { production: false, testers: '*' }) && A.mayUseAr(una, { production: false, testers: 'user_x, *' }) && A.openToAll({ production: false, testers: ' * ' }));
  ok('  and means nothing on production', !A.mayUseAr(null, { production: true, testers: '*' }) && !A.mayUseAr(una, { production: true, testers: '*' }) && !A.openToAll({ production: true, testers: '*' }));
  ok('a visitor with no account is never a tester by a list', !A.mayUseAr(null, { ...off, testers: 'user_tess, tess@example.com', admins: 'user_tess', granted: () => true }));
  ok('the waitlist address is the first verified one, lowercased', A.waitlistAddress(vera) === 'other@example.com' && A.waitlistAddress(una) === null && A.waitlistAddress(null) === null);
}

console.log('\n=== the overlay, rendered ===');
{
  // A camera that reports being asked, so rendering can be shown to ask for nothing.
  let asked = 0;
  Object.defineProperty(globalThis, 'navigator', { value: { mediaDevices: { getUserMedia: async () => { asked++; throw new Error('no'); } } }, configurable: true, writable: true });
  const map = { nodes: [{ id: 'n1', type: 'claim', label: 'Rent is cheaper' }, { id: 'n2', type: 'evidence', label: 'Listings, May' }], edges: [{ from: 'n2', to: 'n1', relation: 'supports' }] };
  const render = (access, extra = {}) => renderToStaticMarkup(h(A.ARMode, { map, layoutKey: 'c1', access, onClose: () => {}, ...extra }));
  const tester = render({ tester: true, signedIn: true, email: 't@example.com', waitlisted: false });
  ok('a tester gets AR Mode itself: Start hand tracking, the view controls, Done', tester.includes('>Start hand tracking<') && tester.includes('aria-label="Zoom in"') && tester.includes('aria-label="Leave AR Mode"') && tester.includes('>Early access<'), tester.slice(0, 300));
  ok('  told plainly the camera turns on only when they start it, and the video stays on the device', /camera turns on — only then/.test(tester) && /video stays on this device/.test(tester));
  ok('  and no waitlist', !tester.includes('Join the waitlist'));
  ok('  it is a dialog over the page, labelled', /role="dialog"/.test(tester) && /aria-modal="true"/.test(tester) && /aria-label="AR Mode"/.test(tester));
  const preview = render({ tester: false, signedIn: true, email: 'p@example.com', waitlisted: false });
  ok('anybody else gets the preview and the waitlist — never a Start button', preview.includes('>Join the waitlist<') && preview.includes('>Preview<') && !preview.includes('Start hand tracking') && /aria-label="AR Mode preview"/.test(preview));
  ok('  the waitlist field is labelled, takes an email, and is filled with their own verified address', /<label[^>]*for="arm-wait-email"/.test(preview) && /id="arm-wait-email"[^>]*type="email"/.test(preview.replace(/\n/g, '')) || /type="email"[^>]*id="arm-wait-email"/.test(preview));
  ok('  and says the video never leaves the device', /video never leaves your device/.test(preview));
  const waiting = render(null);
  ok('while access is being asked: neither a camera button nor the waitlist', waiting.includes('Checking access…') && !waiting.includes('Start hand tracking') && !waiting.includes('Join the waitlist'));
  const empty = renderToStaticMarkup(h(A.ARMode, { map: { nodes: [], edges: [] }, layoutKey: 'c1', access: { tester: false, signedIn: false, email: null, waitlisted: false }, onClose: () => {} }));
  ok('a map with nothing on it yet is shown as a sample, and says so', /The map behind this is a sample/.test(empty));
  ok('rendering asks the camera for nothing', asked === 0);
}

console.log('\n=== the camera: only when a tester asks, released when they stop ===');
{
  const src = read('components/logos5/ARMode.tsx');
  const start = src.slice(src.indexOf('const startHands = useCallback'), src.indexOf('// ── pointer, touch and wheel'));
  ok('the camera is opened in one place — Start hand tracking', (src.match(/openCamera\(/g) ?? []).length === 1 && start.includes('openCamera()'));
  ok('  which is a tester’s only', /const startHands = useCallback\(async \(\) => \{\s*if \(!tester\) return;/.test(src) && /\{tester &&[\s\S]{0,200}Start hand tracking/.test(src));
  ok('  pressed by them, never on open', /onClick=\{\(\) => void startHands\(\)\}/.test(src) && (src.match(/startHands\(\)/g) ?? []).length === 1);
  ok('  checked first: a page without https, a browser without a camera or WebAssembly is told so, and keeps the mouse', /isSecureContext/.test(src) && /WebAssembly/.test(src) && /You can still move the map with a mouse/.test(src));
  ok('stopping, or leaving AR Mode, releases the camera and the model', /const stopHands = useCallback\(\(\) => \{[\s\S]{0,400}getTracks\(\)\.forEach\(\(t\) => t\.stop\(\)\)[\s\S]{0,200}markerRef\.current\?\.close\(\)/.test(src) && /useEffect\(\(\) => stopHands, \[stopHands\]\)/.test(src));
  ok('  even when the camera or the model arrives after the person already said stop', /sessionRef\.current \+= 1/.test(start + src) && /if \(stale\(\)\) \{\s*stream\.getTracks\(\)\.forEach\(\(t\) => t\.stop\(\)\);\s*return;/.test(start) && /if \(stale\(\)\) \{\s*marker\.close\(\);\s*return;/.test(start));
  ok('the hand loop always runs its newest self, so a gesture acts on the map as it is now', /requestAnimationFrame\(\(\) => loopRef\.current\(\)\)/.test(src) && /loopRef\.current = loop;/.test(src));
  ok('frames are read and dropped in the browser: nothing records, nothing uploads', !/MediaRecorder|toDataURL|toBlob|fetch\([^)]*(frame|video)/i.test(src));
  // the camera, small, in a corner, so a person sees their own movements being followed — and can hide it
  ok(
    'once the camera is on, a small view of it shows the hands being followed, drawn over the picture',
    /\(camera === 'on' \|\| camera === 'loading'\) &&\s*\(camView \? \(\s*<figure className="arm-cam"/.test(src) &&
      /<video ref=\{pipRef\} className="arm-cam-v" playsInline muted autoPlay/.test(src) &&
      /<canvas ref=\{handCanvasRef\} className="arm-cam-c"/.test(src) &&
      /drawHands\(ctx, hc\.width, hc\.height, res\.landmarks/.test(src),
  );
  ok('  saying what it reads, in words', /POSE_WORD\[track\.pose\]/.test(src) && /pinch: 'pinch'/.test(src) && /thumb: 'thumbs up'/.test(src) && /'No hand in view'/.test(src));
  ok(
    '  Hide folds it to a Show camera chip, and the choice is kept in this browser',
    /aria-label="Hide the camera view"/.test(src) && /onClick=\{\(\) => setCamView\(false\)\}/.test(src) && /className="arm-cam-show" onClick=\{\(\) => setCamView\(true\)\}/.test(src) &&
      /CAM_VIEW_KEY = 'socria\.ar\.camview\.v1'/.test(src) && /localStorage\.setItem\(CAM_VIEW_KEY, on \? '1' : '0'\)/.test(src),
  );
  ok('  it is the same stream, released with the rest when the camera stops', /if \(pipRef\.current\) pipRef\.current\.srcObject = null;/.test(src) && /v\.srcObject = stream;\s*void v\.play\(\)/.test(src));
  const camCss = read('components/logos5/ar-mode.css');
  ok(
    '  the picture and the drawing share one crop and are both a mirror, so the drawn hand sits on the hand',
    /\.logos-root \.arm-cam-v,\s*\.logos-root \.arm-cam-c \{[^}]*object-fit: cover;[^}]*transform: scaleX\(-1\);/.test(camCss),
  );
  ok('  the full-size picture behind the map is its own toggle, called the room', /\{showVideo \? 'Hide room' : 'Show room'\}/.test(src));
  const ht = read('lib/hand-tracking.ts');
  ok('the hand model is the benches’ — MediaPipe from a CDN at runtime, nothing added to the bundle', /cdn\.jsdelivr\.net\/npm\/@mediapipe\/tasks-vision@/.test(ht) && /webpackIgnore: true/.test(ht) && !/"@mediapipe\//.test(read('package.json')));
}

console.log('\n=== nothing destructive without a confirm ===');
{
  const src = read('components/logos5/ARMode.tsx');
  ok('a gesture only ARMS an action; it happens on a thumbs up or Confirm', /if \(out\.justArmed\)[\s\S]{0,120}arm\(out\.justArmed, overCard\.id\)/.test(src) && /if \(out\.fired\) confirm\(\)/.test(src) && />\s*Confirm\s*</.test(src));
  ok('  taking a card off the map is the map’s own edit', /onEdit\?\.\(\{ op: 'remove', id: a\.id \}\)/.test(src));
  ok('  research and challenge are the map’s own actions, shown in the Logic Map', /onAction\?\.\(a\.action, n\)/.test(src));
  ok('  and the inspector’s buttons arm the same way', /onClick=\{\(\) => arm\('challenge', sel\.id\)\}/.test(src) && /onClick=\{\(\) => arm\('delete', sel\.id\)\}/.test(src));
  ok('nobody acts on a sample, a preview, or a room they may only read', /if \(!n \|\| !tester \|\| sample \|\| readOnly\) return;/.test(src) && /\{tester && !sample && !readOnly && \(/.test(src));
  ok('Esc steps back: an armed action, then the selection, then AR Mode', /if \(armedRef\.current\) cancel\(\);\s*else if \(selected\) \{\s*setSelected\(null\);\s*refocus\(\);\s*\} else onClose\(\);/.test(src));
  // Found in the browser: after Confirm the bar (and the focused button) is gone, focus falls to the page, and a
  // handler on the dialog heard nothing — Esc did not close it. And on the canvas Esc ALSO meant "back to chat".
  ok(
    '  heard on the window, first, for as long as it is open — so Esc works with the focus anywhere, and a key it uses never reaches the page under it',
    /window\.addEventListener\('keydown', h, true\)/.test(src) && /const own = \(\) => \{\s*e\.preventDefault\(\);\s*e\.stopPropagation\(\);/.test(src) && !/onKeyDown=\{onKey\}/.test(src),
  );
  ok('  typing in the waitlist field stays the field’s; the page’s own ⌘K waits until AR Mode is closed', /root\.contains\(t\)/.test(src) && /\(INPUT\|TEXTAREA\|SELECT\)/.test(src) && /if \(e\.metaKey \|\| e\.ctrlKey \|\| e\.altKey\)/.test(src));
}

console.log('\n=== one arrangement, two views ===');
{
  const src = read('components/logos5/ARMode.tsx');
  ok('a card put down is a pin in the Logic Map’s graph lens, and the map is told', /saveCanvas\(layoutKey, pin\(loadCanvas\(layoutKey\), 'graph', id, p\.x, p\.y\)\)/.test(src) && /announceCanvas\(layoutKey\)/.test(src));
  ok('  but only a card that moved — a pinch that put it back where it was is a select', /Math\.hypot\(now\.x - from\.at\.x, now\.y - from\.at\.y\) > 3\) keepPlace/.test(src) && /if \(d\.moved < 5\) setSelected/.test(src));
  ok('  never for the sample or the preview', /const keeps = tester && !sample && !!layoutKey;/.test(src) && /if \(!keeps\) return;/.test(src));
  ok('the arrangement is READ for everybody (the preview shows a person their own map as they left it), written only by a tester', /const doc = !sample && layoutKey \? loadCanvas\(layoutKey\) : null;/.test(src));
  ok('  and only cards with no place yet are spread', /posRef\.current = separate\(next, fresh\);/.test(src) && /if \(!had && !remembered\.has\(n\.id\)\) fresh\.add\(n\.id\);/.test(src));
  const tm = read('components/ThinkingMap.tsx');
  ok('the Logic Map reads it again when AR Mode says so — its own line of thinking only', /window\.addEventListener\(CANVAS_CHANGED, on\)/.test(tm) && /if \(!key \|\| key !== keyRef\.current\) return;/.test(tm) && /canvasRef\.current = loadCanvas\(key\);\s*setPinsVer/.test(tm));
  // the store itself: written by AR Mode, read by the Logic Map
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const heard = [];
  globalThis.window = { dispatchEvent: (e) => (heard.push(e), true), addEventListener() {}, removeEventListener() {}, localStorage: globalThis.localStorage };
  globalThis.CustomEvent ??= class extends Event { constructor(t, o) { super(t); this.detail = o?.detail; } };
  A.saveCanvas('c1', A.pin(A.loadCanvas('c1'), 'graph', 'n1', 42, -17));
  A.announceCanvas('c1');
  const back = A.lensOf(A.loadCanvas('c1'), 'graph').pins.n1;
  ok('  kept where the Logic Map looks for it', J(back) === J([42, -17]), J(back));
  ok('  and announced for that line of thinking', heard.length === 1 && heard[0].type === A.CANVAS_CHANGED && heard[0].detail?.key === 'c1');
  ok('  so the Logic Map opens on the same place AR Mode left it', nearPt(A.seedPositions([{ id: 'n1' }], [], A.loadCanvas('c1')).pos.n1, { x: 42, y: -17 }));
}

console.log('\n=== the way in ===');
{
  const app = read('components/LogosApp.tsx');
  ok('the Logic Map’s view bar has AR Mode, marked early', /\{studyTab === 'logic_map' && \([\s\S]{0,300}className="l5v-btn l5v-ar" onClick=\{openAr\}[\s\S]{0,200}AR Mode <span className="l5v-ar-k">Early<\/span>/.test(app));
  ok('  and the ⋯ menu, on any line of thinking', /\.\.\.\(activeId \? \[\{ label: 'AR Mode', hint: [^}]*onSelect: openAr \}\] : \[\]\)/.test(app));
  ok('who may use it is asked when it is opened — never on load', (app.match(/fetch\('\/api\/ar\/access'/g) ?? []).length === 1 && /function openAr\(\) \{\s*setArOpen\(true\);[\s\S]{0,300}fetch\('\/api\/ar\/access'/.test(app));
  ok('  a failed ask is not kept, and signing in or out asks again', /arKnownRef\.current = known;/.test(app) && /arKnownRef\.current = false;\s*setArAccess\(null\);\s*\}, \[isSignedIn\]\)/.test(app));
  ok('it is the map of the line of thinking that is open, and leaves when another opens', /<ARMode\s+map=\{map\}\s+layoutKey=\{activeId\}/.test(app) && /useEffect\(\(\) => setArOpen\(false\), \[activeId\]\)/.test(app));
  ok('its edits go through the map’s own edit, its actions through the map’s own, shown in the Logic Map', /onEdit=\{\(edit\) => editMap\(\[edit\]\)\}/.test(app) && /openFull\('logic_map'\);\s*signalFirstMap\('action-taken'\);\s*void runAction\(mode, node\);/.test(app));
  ok('a room someone may only read stays read-only in AR Mode too', /readOnly=\{togetherReadOnly\}/.test(app));
  // 14 kB on every load of /chat for something few open: it is fetched when opened instead, like the 3D canvas
  ok(
    'its code is fetched when it is opened, never with the page — and its tag on the view bar is styled with the bar',
    /const ARMode = dynamic\(\(\) => import\('@\/components\/logos5\/ARMode'\)\.then\(\(m\) => m\.ARMode\), \{\s*ssr: false,/.test(app) &&
      !/import \{ ARMode \} from '@\/components\/logos5\/ARMode'/.test(app) &&
      /\.l5v-ar-k \{/.test(read('components/logos5/l5v.css')) && /\.l5-arwait \{/.test(read('components/logos5/l5v.css')),
  );
  const css = read('components/logos5/ar-mode.css');
  ok('its look is Logos 5’s: scoped under .logos-root, cards are the Logic Map’s own node styles', /\.logos-root \.arm\b/.test(css) && /lg-node lg-node-\$\{n\.type\}/.test(read('components/logos5/ARMode.tsx')));
  // Found in the browser: the Logic Map's lgNodeIn animates transform and holds its last frame, and an
  // animation outranks an inline style — every card sat in the stage's corner while the links were drawn right.
  ok(
    'the cards go where their own transform puts them: the Logic Map’s entrance animation is replaced by one that only fades',
    /\.logos-root \.arm-card\.lg-node \{[^}]*animation: armCardIn [^;]*;/.test(css) && /@keyframes armCardIn \{\s*from \{\s*opacity: 0;\s*\}\s*to \{\s*opacity: 1;\s*\}\s*\}/.test(css),
  );
  ok('  touch never scrolls the page from under a pinch; a phone gets its own layout; reduced motion is honoured', /touch-action: none/.test(css) && /@media \(max-width: \d+px\)/.test(css) && /prefers-reduced-motion/.test(read('components/logos5/ARMode.tsx') + css));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
