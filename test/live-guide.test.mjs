// SOCRIA LIVE AR GUIDANCE (lib/guide) — the pipeline's pure parts.
//
//   overlays    what a model returns is shaped, bounded and checked before anything is drawn
//   safety      emergencies and jobs not to guide are decided in code, from the words, first
//   tracking    an object's patch is followed as the camera moves; a lost one is said, not guessed
//   session     ask → guide → check → adapt, with pause, replay, dismiss, adjust; checks rationed
//   drawing     frame → screen through a cover fit; anchored when followed, a 2D note when not
//   cost        a small frame, a small prompt, a check that carries only the step

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as G from './.tmp/live-guide-under-test.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(root, f), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 500))));
const J = JSON.stringify;

const JAR = {
  task: 'Open the jar',
  objects: [
    { id: 'jar', label: 'Jar', box: { x: 0.3, y: 0.35, w: 0.3, h: 0.45 }, confidence: 0.9 },
    { id: 'lid', label: 'Lid', box: { x: 0.32, y: 0.25, w: 0.26, h: 0.1 }, confidence: 0.5 },
  ],
  steps: [
    { say: 'Hold the jar firmly with your other hand.', check: 'One hand round the jar', overlays: [{ kind: 'highlight', target: 'jar', text: 'hold here' }] },
    { say: 'Twist the lid anticlockwise.', check: 'The lid is loose', overlays: [{ kind: 'motion', target: 'lid', motion: 'twist-ccw' }, { kind: 'model', target: 'lid', model: 'jar', motion: 'twist-ccw' }] },
    { say: 'Lift the lid off.', overlays: [{ kind: 'arrow', target: 'jar', to: 'lid', text: 'lift' }, { kind: 'diagram', steps: ['Hold', 'Twist', 'Lift'] }] },
  ],
  confidence: 0.8,
  uncertain: 'The lid might be a pull-off cap.',
  safety: 'none',
};

console.log('\n=== overlays: what a model says is checked before it is drawn ===');
{
  const p = G.sanitizePlan(JAR);
  ok('a good plan comes through whole', p && p.steps.length === 3 && p.objects.length === 2 && p.steps[1].overlays.length === 2 && p.uncertain === JAR.uncertain, J(p));
  ok('  steps get their own ids; a step keeps what done looks like', J(p.steps.map((s) => s.id)) === J(['s1', 's2', 's3']) && p.steps[0].check === 'One hand round the jar');
  const bad = G.sanitizePlan({ ...JAR, objects: [{ id: 'jar', label: 'Jar', box: [300, 350, 300, 450] }], steps: [{ say: 'Twist <script>alert(1)</script>', overlays: [{ kind: 'motion', target: 'ghost', motion: 'twist-ccw' }, { kind: 'motion', target: 'jar', motion: 'teleport' }, { kind: 'laser', target: 'jar' }, { kind: 'label', target: 'jar' }] }] });
  ok('boxes in thousandths are read in their own scale', bad.objects[0].box.x === 0.3 && bad.objects[0].box.w === 0.3, J(bad.objects));
  ok('  markup is stripped from words', !/[<>]/.test(bad.steps[0].say));
  ok('  an overlay on an object that is not there, an unknown movement or kind, an empty label: all dropped', bad.steps[0].overlays.length === 0, J(bad.steps[0].overlays));
  ok('a box is kept inside the frame', J(G.sanitizeBox({ x: 0.9, y: -0.2, w: 0.5, h: 0.4 })) === J({ x: 0.9, y: 0, w: 0.1, h: 0.4 }) && G.sanitizeBox({ x: 0.2, y: 0.2, w: 0, h: 0.3 }) === null);
  const many = G.sanitizePlan({ ...JAR, objects: Array.from({ length: 12 }, (_, i) => ({ id: `o${i}`, label: `Thing ${i}`, box: { x: 0.01 * i, y: 0.1, w: 0.1, h: 0.1 } })), steps: Array.from({ length: 12 }, (_, i) => ({ say: `Step ${i}`, overlays: Array.from({ length: 6 }, () => ({ kind: 'highlight', target: 'o1' })) })) });
  ok('bounded: six objects, eight steps, four overlays a step', many.objects.length === 6 && many.steps.length === 8 && many.steps.every((s) => s.overlays.length <= 4));
  ok('nothing to guide with is nothing', G.sanitizePlan({ task: 'x', objects: [], steps: [] }) === null && G.sanitizePlan('nope') === null);
  const stop = G.sanitizePlan({ task: 'Rewire a socket', objects: [], steps: [{ say: 'Open the box' }], safety: 'stop', safetyNote: 'Mains wiring.', escalate: 'Call an electrician.' });
  ok('a stop has no steps, whatever the model wrote', stop.safety === 'stop' && stop.steps.length === 0 && stop.escalate === 'Call an electrician.');
  ok('a check must say done or not', G.sanitizeCheck({ saw: 'x' }) === null && G.sanitizeCheck({ done: false, saw: 'The lid is still on.', retry: 'Grip lower.' }).retry === 'Grip lower.' && !('retry' in G.sanitizeCheck({ done: true, retry: 'x' })));
  ok('JSON is found in a model’s text, fenced or not', J(G.parseJsonObject('```json\n{"a":1}\n```')) === '{"a":1}' && G.parseJsonObject('no json') === null);
  ok('the least sure object a step points at is the one asked about', G.leastSure(p, p.steps[1]).id === 'lid' && G.UNSURE === 0.55);
}

console.log('\n=== safety: decided in code, from the words, before any frame is read ===');
{
  for (const [q, level, kind] of [
    ['my dad is not breathing what do I do', 'emergency', 'breathing'],
    ['the pan is on fire', 'emergency', 'fire'],
    ['I can smell gas in the kitchen', 'emergency', 'gas'],
    ['she is choking', 'emergency', 'choking'],
    ['how do I rewire this plug socket', 'stop', 'mains electrics'],
    ['how do I change my brake pads', 'stop', 'safety-critical repair'],
    ['how do I use this mandoline safely', 'caution', 'sharp, hot or hazardous'],
    ['how do I open this jar', 'none', 'none'],
    ['how do I open this glass jar', 'none', 'none'],
  ]) {
    const h = G.hazardOf(q);
    ok(`  “${q}” → ${level}`, h.level === level && h.kind === kind, J(h));
  }
  const fire = G.safetyPlan('the pan is on fire');
  ok('an emergency: the call to make, the few safe first steps, no steps on the camera', fire.safety === 'stop' && fire.steps.length === 0 && /emergency number/.test(fire.escalate) && fire.first.length >= 2 && /water/.test(fire.safetyNote), J(fire));
  ok('  a job not to guide: who to call, and why — no first steps', (() => { const s = G.safetyPlan('how do I rewire this plug socket'); return s.safety === 'stop' && /electrician/.test(s.escalate) && !s.first; })());
  ok('  everything else goes on to be looked at', G.safetyPlan('how do I open this jar') === null);
  ok('the stricter of the words and the reading holds, never the looser', G.stricter('caution', 'none') === 'caution' && G.stricter('none', 'stop') === 'stop' && G.stricter('emergency', 'none') === 'stop' && G.stricter('none', undefined) === 'none');
}

console.log('\n=== tracking: following an object as the camera moves ===');
{
  // a textured square on a plain ground, then the same square moved 6 right and 4 down
  const W = 160, H = 120;
  const frame = (ox, oy, square = true) => {
    const px = new Uint8Array(W * H).fill(90);
    if (square) for (let y = 0; y < 30; y++) for (let x = 0; x < 30; x++) px[(40 + oy + y) * W + 50 + ox + x] = ((x * 7 + y * 13) % 60) + 140;
    return { w: W, h: H, px };
  };
  const a = frame(0, 0), b = frame(6, 4);
  const box = { x: 50 / W, y: 40 / H, w: 30 / W, h: 30 / H };
  const t = G.trackBox(a, b, box);
  ok('a moved object is found where it moved to', Math.abs(t.box.x * W - 56) <= 1 && Math.abs(t.box.y * H - 44) <= 1 && t.confidence > 0.8, J(t));
  const odd = G.trackBox(a, frame(-5, 3), box);
  ok('  an odd move too (left 5, down 3) — found by the fine pass', Math.abs(odd.box.x * W - 45) <= 1 && Math.abs(odd.box.y * H - 43) <= 1 && odd.confidence > 0.8, J(odd));
  const still = G.trackBox(a, a, box);
  ok('  standing still is still', still.dx === 0 && still.dy === 0 && still.confidence === 1);
  const gone = G.trackBox(a, frame(0, 0, false), box);
  ok('  an object that left the frame is not followed with confidence', gone.confidence < G.ANCHOR_OK, J(gone));
  const flat = { w: W, h: H, px: new Uint8Array(W * H).fill(120) };
  ok('  a blank wall cannot be followed, and does not pretend to be', G.trackBox(flat, flat, box).confidence <= 0.3);
  ok('the picture changing is measured', G.frameChange(a, a) === 0 && G.frameChange(a, b) > 0 && G.frameChange(a, { w: 1, h: 1, px: new Uint8Array(1) }) === 1);
  const anchors = G.stepAnchors([{ id: 'lid', box, confidence: 0.9, seenAt: 0 }], a, b, 100);
  ok('anchors move with their objects, and remember when they were last seen', anchors[0].seenAt === 100 && anchors[0].box.x > box.x);
  const lost = G.stepAnchors(anchors, b, frame(0, 0, false), 200);
  ok('  a poor match leaves the box where it was seen, marked unsure', lost[0].box.x === anchors[0].box.x && lost[0].confidence < G.ANCHOR_OK && lost[0].seenAt === 100);
  ok('  lost only after a moment unsure (a blink is not lost)', !G.isLost(lost[0], 100 + G.LOST_MS - 1) && G.isLost(lost[0], 100 + G.LOST_MS + 1));
  ok('frames are tracked small (160 across) and sent small (512 long side)', J(G.trackSize(1280, 720)) === J({ w: 160, h: 90 }) && J(G.sendSize(1280, 720)) === J({ w: 512, h: 288 }) && J(G.sendSize(320, 240)) === J({ w: 320, h: 240 }));
  ok('luminance from RGBA', J([...G.toGray([255, 255, 255, 255, 0, 0, 0, 255], 2, 1).px]) === J([255, 0]));
}
{
  // NO DRIFT. A jar whose lower part keeps changing (a turning mouth, a hand, a glint: here a bright band that moves
  // every frame) while the camera pans right 2 a frame and back. The band must not drag the box (each pixel's
  // difference is capped), and nothing can pile up (every frame is matched against the frame the reading placed it on).
  const W = 160, H = 120;
  const tex = (x, y) => ((Math.imul(x + 1, 73856093) ^ Math.imul(y + 1, 19349663)) >>> 0) % 60 + 140; // a label that does not repeat
  const scene = (ox, t) => {
    const px = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) px[y * W + x] = 60 + ((x * 3 + y * 5) % 23); // a faint table
    for (let y = 0; y < 36; y++) for (let x = 0; x < 30; x++) px[(40 + y) * W + 60 + ox + x] = tex(x, y);
    const band = 20 + ((t * 5) % 14);
    for (let y = band; y < band + 4; y++) for (let x = 0; x < 30; x++) px[(40 + y) * W + 60 + ox + x] = 250;
    return { w: W, h: H, px };
  };
  const box = { x: 60 / W, y: 40 / H, w: 30 / W, h: 36 / H };
  const pans = [...Array(10).fill(2), ...Array(10).fill(-2), ...Array(20).fill(0)];
  let ox = 0;
  let prev = scene(0, 0);
  let placed = [G.placeAnchor('jar', box, 0.9, prev, 0)];
  let worstPlaced = 0;
  pans.forEach((d, i) => {
    ox += d;
    const next = scene(ox, i + 1);
    placed = G.stepAnchors(placed, prev, next, i + 1);
    worstPlaced = Math.max(worstPlaced, Math.abs(placed[0].box.x * W - (60 + ox)), Math.abs(placed[0].box.y * H - 40));
    prev = next;
  });
  ok('an anchor follows a pan without walking off, however part of its patch flickers', worstPlaced <= 1 && placed[0].confidence >= G.ANCHOR_OK, J({ worstPlaced, end: placed[0].box, c: placed[0].confidence }));
  ok('  …matched all the way against the frame it was placed on', placed[0].ref && placed[0].ref.box === box);
  {
    // a slow pan, under a pixel a frame (each pixel a blend of its neighbours, as a camera sees it)
    const slow = (o) => {
      const px = new Uint8Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const u = x - 60 - o, v = y - 40;
        let val = 60 + ((x * 3 + y * 5) % 23);
        if (u >= 0 && u < 29 && v >= 0 && v < 36) { const i = Math.floor(u), f = u - i; val = tex(i, v) * (1 - f) + tex(i + 1, v) * f; }
        px[y * W + x] = Math.round(val);
      }
      return { w: W, h: H, px };
    };
    const sb = { x: 60 / W, y: 40 / H, w: 29 / W, h: 36 / H };
    let p0 = slow(0), a = [G.placeAnchor('jar', sb, 0.9, p0, 0)], o = 0;
    for (let i = 0; i < 24; i++) { o += 0.4; const n = slow(o); a = G.stepAnchors(a, p0, n, i); p0 = n; }
    ok('  a slow pan (0.4 a frame, 24 frames) is followed to within a pixel', Math.abs(a[0].box.x * W - (60 + o)) <= 1 && a[0].confidence >= G.ANCHOR_OK, J({ moved: o, box: a[0].box.x * W - 60, c: a[0].confidence }));
  }
  {
    // A HAND ON A PLAIN LID. The box sits inside a plain jar, so the only thing in it with any texture is the hand —
    // which then moves across. Matched frame to frame, the box follows the hand; moved with the camera (measured on
    // the whole middle of the picture, which the hand cannot outvote), it stays on the jar.
    const n = (x, y, k) => ((Math.imul(x + 7, 73856093) ^ Math.imul(y + 3, 19349663) ^ k) >>> 0);
    const scene = (cam, hand, size = 10) => {
      const px = new Uint8Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const u = x + cam;
        let val = 50 + (n(u, y, 1) % 50); // a busy table
        if (u >= 40 && u < 110 && y >= 25 && y < 95) val = 175; // a big plain jar
        if (u >= 62 + hand && u < 62 + size + hand && y >= 50 && y < 50 + size + 2) val = 35 + (n(u, y, 3) % 10); // the hand
        px[y * W + x] = val;
      }
      return { w: W, h: H, px };
    };
    const jb = { x: 60 / W, y: 40 / H, w: 30 / W, h: 36 / H };
    const run = (pan, size) => {
      let p0 = scene(0, 0, size), placed = [G.placeAnchor('lid', jb, 0.9, p0, 0)], chained = [{ id: 'lid', box: jb, confidence: 0.9, seenAt: 0 }];
      let worst = 0, chase = 0, cam = 0;
      for (let i = 1; i <= 24; i++) {
        if (pan) cam = i <= 12 ? -i * 2 : -24 + (i - 12) * 2;
        const nx = scene(cam, i, size);
        placed = G.stepAnchors(placed, p0, nx, i);
        chained = G.stepAnchors(chained, p0, nx, i);
        const tx = 60 - cam;
        if (placed[0].confidence >= G.ANCHOR_OK) worst = Math.max(worst, Math.abs(placed[0].box.x * W - tx), Math.abs(placed[0].box.y * H - 40));
        chase = Math.max(chase, Math.abs(chained[0].box.x * W - tx));
        p0 = nx;
      }
      return { worst, chase, spread: placed[0].ref.spread };
    };
    const still = run(false, 10);
    ok('a hand moving over a plain lid does not drag the lid’s box (camera still): within the few-pixel fine-tune', still.worst <= 3, J(still));
    ok('  (matched frame to frame, the same box follows the hand — why anchors move with the camera)', still.chase > 10, J(still));
    const pan = run(true, 10);
    ok('  …nor while the camera pans: the box goes with the camera, not the hand', pan.worst <= 3, J(pan));
    const big = run(false, 18);
    ok('  a big hand on a plain lid: the lid is not looked for on its own (its only texture is the hand), so not chased', !big.spread && big.worst <= 3, J(big));
    ok('  a labelled jar has texture across it, and may be followed when it is moved itself', G.textureSpread(scene(0, 0), { x: 0.05, y: 0.05, w: 0.2, h: 0.2 }) === true);
  }
  {
    // A PICTURE WITH NOTHING STILL BUT A PLAIN BACKGROUND (a screen, a flame, Chromium's test camera: a pie filling
    // and emptying on plain green). A search for the camera's move finds a "better" place somewhere in the window
    // every frame; the whole picture is still close to the frame the anchor was placed on, so the camera has not
    // moved, and the anchor must not jump.
    const pie = (turn) => {
      const px = new Uint8Array(W * H).fill(80);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const dx = x - 80, dy = y - 60;
        if (dx * dx + dy * dy > 26 * 26) continue;
        const ang = (Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI); // 0…1 round the disc
        if (ang < turn) px[y * W + x] = 174;
      }
      return { w: W, h: H, px };
    };
    const inside = { x: 64 / W, y: 46 / H, w: 30 / W, h: 28 / H };
    let p0 = pie(0.5), a = [G.placeAnchor('jar', inside, 0.8, p0, 0)], jumped = 0;
    for (let i = 1; i <= 30; i++) {
      const nx = pie((0.5 + i * 0.03) % 1);
      a = G.stepAnchors(a, p0, nx, i);
      jumped = Math.max(jumped, Math.abs(a[0].box.x * W - 64), Math.abs(a[0].box.y * H - 46));
      p0 = nx;
    }
    ok('a picture whose only detail keeps changing: the camera is not thought to move, and the anchor does not jump', jumped <= 3 && Math.abs(a[0].shift?.x ?? 0) < 1e-9 && Math.abs(a[0].shift?.y ?? 0) < 1e-9, J({ jumped, shift: a[0].shift }));
    ok('  the whole picture close to the frame placed on means the camera has not moved', J(G.cameraShift(pie(0.5), pie(0.53))) === J({ x: 0, y: 0, confidence: 1 }));
  }
  // the object itself changes past recognising (turned round): the overlay says so instead of following a guess
  const other = { w: W, h: H, px: new Uint8Array(W * H).map((_, k) => 60 + (((k % W) * 11 + Math.floor(k / W) * 3) % 90)) };
  const turned = G.stepAnchors(placed, prev, other, 99);
  ok('  an object changed past recognising is not followed with confidence', turned[0].confidence < G.ANCHOR_OK && turned[0].seenAt === placed[0].seenAt, J(turned[0].confidence));
  ok('  an anchor with no frame to be placed on is matched frame to frame, as before', !G.placeAnchor('x', box, 0.5, null, 0).ref && !G.placeAnchor('x', box, 0.5, { w: 1, h: 1, px: new Uint8Array(1) }, 0).ref);
}

console.log('\n=== the session: ask, guide, check, adapt ===');
{
  const plan = G.sanitizePlan(JAR);
  let s = G.guideReducer(G.IDLE, { type: 'ask', question: 'How do I open this jar?' });
  ok('asking is looking, and counts a look', s.phase === 'looking' && s.looks === 1);
  ok('  an ask answered from the words alone (an emergency) sends no frame and counts no look', G.guideReducer(G.IDLE, { type: 'ask', question: 'the pan is on fire', framed: false }).looks === 0);
  s = G.guideReducer(s, { type: 'planned', plan });
  ok('a plan starts at its first step', s.phase === 'guiding' && s.step === 0 && G.currentStep(s).said === 'Hold the jar firmly with your other hand.');
  s = G.guideReducer(s, { type: 'pause' });
  ok('pause holds; resume goes on', s.phase === 'paused' && G.guideReducer(s, { type: 'resume' }).phase === 'guiding');
  s = G.guideReducer(s, { type: 'resume' });
  const r0 = s.replay;
  s = G.guideReducer(s, { type: 'replay' });
  ok('replay restarts the step’s animations', s.replay === r0 + 1 && s.step === 0);
  s = G.guideReducer(s, { type: 'dismiss' });
  ok('dismiss hides the overlays; show brings them back', s.dismissed && !G.guideReducer(s, { type: 'show' }).dismissed);
  s = G.guideReducer(s, { type: 'show' });
  s = G.guideReducer(s, { type: 'check' });
  ok('a check is a look, rationed per step', s.phase === 'checking' && s.checks[0] === 1 && s.looks === 2);
  s = G.guideReducer(s, { type: 'checked', check: { done: true, saw: 'Your hand is round the jar.', confidence: 0.8 } });
  ok('done: on to the next step, with what was seen', s.step === 1 && s.phase === 'guiding' && s.saw === 'Your hand is round the jar.');
  s = G.guideReducer(s, { type: 'check' });
  s = G.guideReducer(s, { type: 'checked', check: { done: false, saw: 'The lid has not moved.', retry: 'Grip the lid with your whole palm and twist harder to the left.', confidence: 0.7 } });
  ok('not yet: the same step, said more clearly, with a gentler hint', s.step === 1 && G.currentStep(s).said.startsWith('Grip the lid') && G.currentStep(s).tries === 1 && G.missHint(1) === 'Not quite yet — try it this way.');
  s = G.guideReducer(s, { type: 'check' });
  s = G.guideReducer(s, { type: 'checked', check: { done: false, saw: 'Still on.', confidence: 0.6 } });
  ok('  a second miss: smaller moves, and the way on is always theirs', G.currentStep(s).tries === 2 && /press Next/.test(G.missHint(2)));
  ok('  a step’s checks run out rather than looping', (() => { let x = s; for (let i = 0; i < 6; i++) x = G.guideReducer(G.guideReducer(x, { type: 'check' }), { type: 'checked', check: { done: false, saw: 'no', confidence: 0.5 } }); return x.checks[1] === G.CHECKS_PER_STEP; })());
  const moved = G.guideReducer(s, { type: 'move', id: 'lid', box: { x: 0.5, y: 0.2, w: 0.2, h: 0.1 } });
  ok('moved by hand: the person’s box wins over any later reading', (() => { const c = G.guideReducer(G.guideReducer(moved, { type: 'check' }), { type: 'checked', check: { done: false, saw: 'x', confidence: 0.5, objects: [{ id: 'lid', label: 'Lid', box: { x: 0.1, y: 0.1, w: 0.1, h: 0.1 }, confidence: 0.9 }] } }); return c.moved.lid.x === 0.5 && c.plan.objects.find((o) => o.id === 'lid').box.x === 0.32; })());
  ok('  …while objects not moved by hand follow the new reading', (() => { const c = G.guideReducer(G.guideReducer(s, { type: 'check' }), { type: 'checked', check: { done: false, saw: 'x', confidence: 0.5, objects: [{ id: 'jar', label: 'Jar', box: { x: 0.1, y: 0.1, w: 0.3, h: 0.4 }, confidence: 0.9 }] } }); return c.plan.objects.find((o) => o.id === 'jar').box.x === 0.1; })());
  const danger = G.guideReducer(G.guideReducer(s, { type: 'check' }), { type: 'checked', check: { done: false, saw: 'The glass has cracked.', confidence: 0.8, safety: 'stop', safetyNote: 'Stop — broken glass.' } });
  ok('a check that sees danger stops the guidance', danger.phase === 'safety' && danger.plan.safety === 'stop');
  let end = G.guideReducer(s, { type: 'next' });
  end = G.guideReducer(end, { type: 'next' });
  ok('next past the last step is done; back goes back', end.phase === 'done' && G.guideReducer(G.guideReducer(s, { type: 'next' }), { type: 'back' }).step === 1);
  const stopped = G.guideReducer(G.guideReducer(G.IDLE, { type: 'ask', question: 'pan on fire' }), { type: 'planned', plan: G.safetyPlan('the pan is on fire') });
  ok('a safety plan is a safety card, not steps', stopped.phase === 'safety');
  ok('a failed look keeps the plan, or says why there is none', G.guideReducer(s, { type: 'failed', error: 'x' }).phase === 'guiding' && G.guideReducer(G.IDLE, { type: 'failed', error: 'x' }).phase === 'error');
}

console.log('\n=== checking by itself: only when it is worth a look ===');
{
  const base = { phase: 'guiding', autoChecks: 0, sinceLastLookMs: 10_000, moved: true, settledMs: 2000 };
  ok('they did something and stopped, long enough after the last look: check', G.shouldAutoCheck(base));
  ok('  not while still moving, not without moving, not too soon, not too often, not unless guiding', !G.shouldAutoCheck({ ...base, settledMs: 300 }) && !G.shouldAutoCheck({ ...base, moved: false }) && !G.shouldAutoCheck({ ...base, sinceLastLookMs: 3000 }) && !G.shouldAutoCheck({ ...base, autoChecks: G.AUTO_CHECKS_PER_STEP }) && !G.shouldAutoCheck({ ...base, phase: 'paused' }));
  ok('  movement and stillness thresholds are set apart', G.MOVED > G.STILL && G.MIN_CHECK_GAP_MS >= 5000);
}

console.log('\n=== drawing: frame to screen, anchored or a 2D note ===');
{
  const f = G.coverFit(1280, 720, 390, 844);
  ok('a cover fit fills the screen and crops the sides', Math.abs(f.scale - 844 / 720) < 1e-9 && f.ox < 0 && f.oy === 0);
  const p = G.toScreen({ x: 0.5, y: 0.5 }, f);
  ok('  the frame’s centre is the screen’s centre', Math.abs(p.x - 195) < 0.01 && Math.abs(p.y - 422) < 0.01);
  ok('  and back again, for an arrow dragged by hand', (() => { const b = G.toFrame(p, f); return Math.abs(b.x - 0.5) < 1e-9 && Math.abs(b.y - 0.5) < 1e-9; })());
  const m = G.coverFit(1280, 720, 1280, 720, true);
  ok('  a front camera is mirrored: left is right', Math.abs(G.toScreen({ x: 0.1, y: 0.5 }, m).x - 1152) < 0.01);
  ok('  the cropped edges are off screen', !G.onScreen({ x: 0, y: 0.4, w: 0.05, h: 0.1 }, f) && G.onScreen({ x: 0.45, y: 0.4, w: 0.1, h: 0.1 }, f));
  const plan = G.sanitizePlan(JAR);
  const step = plan.steps[1];
  const fit = G.coverFit(1280, 720, 1280, 720);
  const good = G.placeOverlays({ plan, step, anchors: [{ id: 'lid', box: plan.objects[1].box, confidence: 0.9, seenAt: 1000 }], moved: {}, fit, now: 1100, tracking: true });
  ok('followed and on screen: anchored on its object', good.every((x) => x.mode === 'anchored') && good[0].box.w > 0);
  ok('  a guess is drawn as one: dashed, "I think…"', good[0].unsure === true);
  const lost = G.placeOverlays({ plan, step, anchors: [{ id: 'lid', box: plan.objects[1].box, confidence: 0.2, seenAt: 0 }], moved: {}, fit, now: 5000, tracking: true });
  ok('lost: a 2D note at the edge saying where to point the camera — never drawn on a guess', lost.every((x) => x.mode === 'fallback') && lost[0].why === 'Point the camera at the lid');
  const hand = G.placeOverlays({ plan, step, anchors: [{ id: 'lid', box: plan.objects[1].box, confidence: 0.2, seenAt: 0 }], moved: { lid: { x: 0.4, y: 0.4, w: 0.1, h: 0.1 } }, fit, now: 5000, tracking: true });
  ok('  moved by hand: anchored where the person put it, and no longer a guess', hand[0].mode === 'anchored' && !hand[0].unsure && Math.abs(hand[0].box.x - 512) < 1);
  const noTrack = G.placeOverlays({ plan, step, anchors: [], moved: {}, fit, now: 5000, tracking: false });
  ok('  a browser that cannot read frames: drawn where the reading put things', noTrack.every((x) => x.mode === 'anchored'));
  const arrow = G.placeOverlays({ plan, step: plan.steps[2], anchors: plan.objects.map((o) => ({ id: o.id, box: o.box, confidence: 0.9, seenAt: 0 })), moved: {}, fit, now: 10, tracking: true });
  ok('an arrow runs between two objects; a diagram is a panel, not on the picture', arrow[0].to && arrow[1].mode === 'fallback' && arrow[1].overlay.kind === 'diagram');
}

console.log('\n=== cost and privacy ===');
{
  const words = (t) => t.split(/\s+/).filter(Boolean).length;
  ok('the plan prompt is short (≤ 420 words), the check prompt shorter (≤ 160)', words(G.GUIDE_PLAN_PROMPT) <= 420 && words(G.GUIDE_CHECK_PROMPT) <= 160, `${words(G.GUIDE_PLAN_PROMPT)} / ${words(G.GUIDE_CHECK_PROMPT)}`);
  const plan = G.sanitizePlan(JAR);
  const s = G.guideReducer(G.guideReducer(G.IDLE, { type: 'ask', question: 'jar' }), { type: 'planned', plan });
  const body = G.checkBody(s);
  ok('a check carries only the step, what done looks like and the objects’ names — not the plan again', J(Object.keys(body).sort()) === J(['done', 'objects', 'step', 'task']) && body.objects.length === 2 && J(body).length < 400, J(body));
  ok('  and the check’s words say just that', /Step: Hold the jar/.test(G.checkAsk(body)) && /Done looks like: One hand round the jar/.test(G.checkAsk(body)));
  const route = read('app/api/logos/guide/route.ts');
  ok('the route reads frames at low detail, caps their size, and answers safety before reading any', /detail: 'low'/.test(route) && /const MAX_FRAME = 400_000;/.test(route) && route.indexOf('safetyPlan(question)') < route.indexOf("const image ="));
  ok('  early access, decided on the server like AR Mode, before anything is read or spent', /if \(!arTester\(await arViewer\(\)\)\)/.test(route) && route.indexOf('arTester(') < route.indexOf('spend('));
  ok('  a plan is counted as one image read; a check is not', /if \(mode === 'plan'\) \{\s*const allowance = await spend\(userId, plan, 'images'/.test(route));
  ok('  the frame is never logged — errors are content-free', /console\.error\('logos guide error:', e instanceof Error \? e\.name : 'error'\)/.test(route) && !/console\.\w+\([^)]*image/.test(route));
  const ui = read('components/logos5/LiveGuide.tsx');
  ok('the camera starts only from a press, after saying what is sent and kept; stops on close', /Start the camera/.test(ui) && /Nothing is recorded or kept/.test(ui) && /if \(!open\) \{\s*inflight\.current\?\.abort\(\);\s*stopCamera\(\);/.test(ui));
  ok('  the back camera by default; one camera at a time (hands are stopped)', /useState<'environment' \| 'user'>\('environment'\)/.test(ui) && /if \(handSession\.active\) handSession\.stop\(\);/.test(ui));
  ok('  the mic only while held; an emergency answered before any frame is taken', /onPointerDown=\{\(\) => voice\.press\(\)\}/.test(ui) && /const frame = h\.level === 'emergency' \|\| h\.level === 'stop' \? null : grab\(\);/.test(ui));
  ok('  pause, replay, adjust, hide, done, next and back are all there', ['Replay', "'Resume' : 'Pause'", 'Adjust', "'Show' : 'Hide'", "'Looking…' : 'Done'", 'aria-label="Next step"', 'aria-label="Previous step"'].every((k) => ui.includes(k)));
  ok('the steps can be kept in the line of thinking, as Logos 5’s own sequence', (() => { const k = G.keepAsTurn('How do I open this jar?', plan); return /^Live guidance: How do I open this jar\?/.test(k.asked) && /```ui\n\{"type":"sequence","kind":"steps"/.test(k.answer) && /pull-off cap/.test(k.answer); })());
}

console.log(`\nlive-guide: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
