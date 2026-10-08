// The tour onboarding starts, and the four ways one ruins a morning.
//
// Running twice. Running for somebody already taught. Running against a
// control that is not on screen. Refusing to stop. None of them is a
// drawing bug, which is why none of this file is about drawing.

import { TOUR_STEPS, TOUR_KEY, ROMAN, shouldRunTour, nextStep, inkRect, CORE_TOUR, LOGOS_TOUR, LOGOS3_TOUR, LOGOS_TOUR_KEY, placeNote } from './.tmp/tour.mjs';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

const READY = { done: false, signedIn: true, justOnboarded: true, blocked: false };

console.log('=== when it runs, and the many times it does not ===');
{
  // ONBOARDING STARTS IT: it sends their first thought, and once the answer
  // is on screen the tour names the few controls they will use.
  ok('straight after onboarding', shouldRunTour(READY));
  ok('signed out too — it skips what is not on screen', shouldRunTour({ ...READY, signedIn: false }));
  ok('never twice', !shouldRunTour({ ...READY, done: true }));
  ok('not over a sheet', !shouldRunTour({ ...READY, blocked: true }));
  ok('not on its own, on an ordinary visit', !shouldRunTour({ ...READY, justOnboarded: false }));
}

console.log('=== the steps — stupidly simple ===');
{
  ok('Core: three notes', CORE_TOUR.length === 3, String(CORE_TOUR.length));
  ok('Logos: four notes', LOGOS_TOUR.length === 4, String(LOGOS_TOUR.length));
  ok('Logos 3: four notes too', LOGOS3_TOUR.length === 4, String(LOGOS3_TOUR.length));
  ok('  the map, the one box, + View, and Core 4', LOGOS3_TOUR.map((s) => s.anchor).join() === 'map,composer,views,model');
  ok('"Take the tour again" on the chat replays the Core one', TOUR_STEPS === CORE_TOUR);
  ok('two keys, so taking one does not spend the other', TOUR_KEY !== LOGOS_TOUR_KEY);
  for (const [name, steps] of [['core', CORE_TOUR], ['logos', LOGOS_TOUR], ['logos3', LOGOS3_TOUR]]) {
    ok(`${name}: anchors are unique`, new Set(steps.map((s) => s.anchor)).size === steps.length);
    ok(`${name}: enough numerals for them`, ROMAN.length >= steps.length);
    for (const s of steps) {
      // ANCHORED BY data-tour, never by a style class: this product's chat is
      // Tailwind utilities, so a class-based anchor is one restyle from
      // pointing at nothing, and a tour ringing the wrong control is worse
      // than no tour.
      ok(`${name}/${s.anchor}: the anchor is an attribute value`, /^[a-z]+$/.test(s.anchor), s.anchor);
      ok(`${name}/${s.anchor}: it is not a CSS selector`, !/[.#\s\[]/.test(s.anchor), s.anchor);
      ok(`${name}/${s.anchor}: has a place`, ['right', 'left', 'above', 'below'].includes(s.place), s.place);
      ok(`${name}/${s.anchor}: one emphasis`, (s.body.match(/<em>/g) || []).length === 1, s.body);
      ok(`${name}/${s.anchor}: it closes`, (s.body.match(/<\/em>/g) || []).length === 1, s.body);
      // Simple means short: a title of a few words, a note of one line.
      ok(`${name}/${s.anchor}: the title is a few words`, s.title.split(/\s+/).length <= 5, s.title);
      ok(`${name}/${s.anchor}: the note is one short line`, s.body.replace(/<\/?em>/g, '').length <= 60, s.body);
      ok(`${name}/${s.anchor}: nothing is interpolated`, !s.body.includes('${'));
    }
  }
  ok('the keys are versioned', /v\d+$/.test(TOUR_KEY) && /v\d+$/.test(LOGOS_TOUR_KEY), TOUR_KEY);
}

console.log('=== every anchor exists where its tour runs ===');
{
  const chat = read('app/chat/page.tsx') + read('components/ModelPicker.tsx');
  for (const s of CORE_TOUR) ok(`core: data-tour="${s.anchor}" is rendered`, chat.includes(`data-tour="${s.anchor}"`), s.anchor);
  const logos = read('components/LogosApp.tsx') + read('components/ThinkingMap.tsx') + read('components/LogosComposer.tsx') + read('components/ModelPicker.tsx');
  for (const s of LOGOS_TOUR) {
    const lit = logos.includes(`data-tour="${s.anchor}"`) || logos.includes(`'${s.anchor}'`);
    ok(`logos: data-tour ${s.anchor} is rendered`, lit, s.anchor);
  }
  const logos3 = logos + read('components/workspace/Workspace.tsx');
  for (const s of LOGOS3_TOUR) {
    const lit = logos3.includes(`data-tour="${s.anchor}"`) || logos3.includes(`'${s.anchor}'`);
    ok(`logos 3: data-tour ${s.anchor} is rendered`, lit, s.anchor);
  }
  ok('"+ View" is the views anchor', /className="ws-add-btn" data-tour="views"/.test(read('components/workspace/Workspace.tsx')));
  // The map's own anchor only on the real map, not the small one in a card.
  ok('the map anchor is not on an embedded map', /data-tour=\{embedded \? undefined : 'map'\}/.test(read('components/ThinkingMap.tsx')));
}

console.log('=== onboarding starts it, after the first answer ===');
{
  const chat = read('app/chat/page.tsx');
  ok('the chat waits for an answer before the tour', /messages\.some\(\(m\) => m\.role === 'assistant'\)/.test(chat) && /setTourOpen\(true\)/.test(chat));
  ok('  and asks the rule, with the screen state', /shouldRunTour\(\{[\s\S]{0,200}blocked: anythingOpen/.test(chat));
  ok('  and reads whether it was already taken', /localStorage\.getItem\(TOUR_KEY\)/.test(chat));
  const app = read('components/LogosApp.tsx');
  ok('Logos mounts its own tour — Logos 3 its own notes', /<Tour open=\{tourOpen\} steps=\{workspaceOn \? LOGOS3_TOUR : LOGOS_TOUR\} onDone=\{endTour\} \/>/.test(app));
  ok('  after the answer', /const hasReply = messages\.some\(\(m\) => m\.role === 'assistant'\)/.test(app));
  ok('  never over the guide, a sheet, or the first map rising', /const screenBusy = guideOpen \|\| styleOpen \|\| emerging/.test(app));
  ok('  and gives the map a moment, never forever', /mapDrawn \? 900 : 6000/.test(app));
  ok('  taking it writes its own key', /localStorage\.setItem\(LOGOS_TOUR_KEY, '1'\)/.test(app));
  ok('  and it can be taken again from the account sheet', /onRetakeTour=\{\(\) => setTourOpen\(true\)\}/.test(app));
}

console.log('=== the note sits beside the control, never on it ===');
{
  const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const inside = (n, v) => n.x >= 15.5 && n.y >= 15.5 && n.x + n.w <= v.w - 15.5 && n.y + n.h <= v.h - 15.5;
  const NOTE = { w: 288, h: 212 };
  const DESK = { w: 1360, h: 860 };
  // THE BUG: the composer at the bottom of the chat, the note placed a fixed
  // 150px above it — and the note is 212px tall, so it sat on the composer.
  const composer = { x: 503, y: 735, w: 634, h: 72 };
  const a = placeNote(composer, 'above', NOTE, DESK);
  ok('above the composer, clear of it', !hit({ ...a, ...NOTE }, composer) && a.side === 'above', JSON.stringify(a));
  // The model chip in the bottom-right corner: there is no room below, so above.
  const chip = { x: 1042, y: 805, w: 96, h: 44 };
  const c = placeNote(chip, 'above', NOTE, DESK);
  ok('the model chip is not hidden under its own note', !hit({ ...c, ...NOTE }, chip) && inside({ ...c, ...NOTE }, DESK), JSON.stringify(c));
  // Asked for below, and below does not fit: the opposite side.
  const low = placeNote(composer, 'below', NOTE, DESK);
  ok('no room below → above', low.side === 'above' && !hit({ ...low, ...NOTE }, composer), JSON.stringify(low));
  // The rail on the left, asked for right.
  const rail = { x: 0, y: 260, w: 280, h: 400 };
  const r = placeNote(rail, 'right', NOTE, DESK);
  ok('right of the rail', r.side === 'right' && r.x >= 280 && inside({ ...r, ...NOTE }, DESK), JSON.stringify(r));
  // The map fills the right half, asked for left.
  const map = { x: 690, y: 64, w: 670, h: 796 };
  const m = placeNote(map, 'left', NOTE, DESK);
  ok('left of the map', m.side === 'left' && m.x + NOTE.w <= 690 && inside({ ...m, ...NOTE }, DESK), JSON.stringify(m));
  // A control that fills the window: nothing fits, so the note is clamped
  // into the window rather than thrown off it.
  const all = { x: 0, y: 0, w: 1360, h: 860 };
  const f = placeNote(all, 'left', NOTE, DESK);
  ok('nothing fits → still on screen', inside({ ...f, ...NOTE }, DESK), JSON.stringify(f));
  // A phone.
  const PHONE = { w: 390, h: 844 };
  const pc = placeNote({ x: 12, y: 760, w: 366, h: 64 }, 'above', { w: 288, h: 230 }, PHONE);
  ok('on a phone, above the composer and on screen', pc.side === 'above' && inside({ ...pc, w: 288, h: 230 }, PHONE), JSON.stringify(pc));
  // The component must not lift it a second time: .tour-above translates the
  // note up by its own height, which on top of placeNote put it 200px adrift.
  const tour = read('components/Tour.tsx');
  ok('the note is not lifted twice', !/className=[^>]*tour-above/.test(tour) && /placeNote\(/.test(tour));
  ok('  and it is placed with its measured height', /noteRef\.current\?\.offsetHeight/.test(tour));
  for (const v of [placeNote(composer, 'above', { w: NaN, h: 200 }, DESK), placeNote(composer, 'left', NOTE, { w: 0, h: 0 })]) {
    ok('degenerate sizes give numbers, not a throw', typeof v.x === 'number' && typeof v.y === 'number');
  }
}

console.log('=== it ends ===');
{
  ok('0 → 1', nextStep(0) === 1);
  ok('1 → 2', nextStep(1) === 2);
  ok('the last one ends it', nextStep(TOUR_STEPS.length - 1) === null);
  ok('a tour of any length ends at its own end', nextStep(3, LOGOS_TOUR.length) === null && nextStep(2, LOGOS_TOUR.length) === 3);
  ok('past the end stays ended', nextStep(99) === null);
  // Walking it the whole way must terminate.
  let i = 0, guard = 0;
  while (i !== null && guard++ < 50) i = nextStep(i);
  ok('a full walk terminates', i === null && guard <= TOUR_STEPS.length + 1, String(guard));
}

console.log('=== the ring is drawn, not printed — and it holds still ===');
{
  const a = inkRect(10, 20, 100, 40);
  ok('it is a path', a.startsWith('M') && a.endsWith('Z'), a.slice(0, 20));
  ok('every number is finite', !/NaN|Infinity/.test(a), a.slice(0, 80));
  // THE POINT. A wobble from Math.random re-rolls on every scroll frame and
  // the ring shimmers; two renders of one step must be identical.
  ok('the same box gives the same ring', inkRect(10, 20, 100, 40) === a);
  ok('a different box gives a different ring', inkRect(11, 20, 100, 40) !== a);
  // And it is a wobble, not a deformation.
  const plain = `M17,20 L103,20`;
  ok('the wobble is small', Math.abs(parseFloat(a.split(',')[1]) - 20) < 1.2, a.slice(0, 24));
  for (const box of [[0,0,0,0], [-5,-5,10,10], [0,0,1e6,1e6]]) {
    ok(`degenerate box ${JSON.stringify(box)} does not throw`, !/NaN/.test(inkRect(...box)));
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
