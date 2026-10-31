// BIG-SCREEN MODE — Logos on a car's centre screen, parked, or any large touchscreen.
//
//   when        on in a car's own browser (Tesla's user agent says
//               "Tesla/<version>"), or when asked — ?bigscreen=1, the ⋯ menu —
//               and the choice is kept in this browser either way
//   the dock    the Universal Map and the line of thinking's four views, Write
//               and Memory, each a place a thumb can't miss with a word on it;
//               the way back to the usual layout; nothing about the car
//   the app     beside the dock; a line of thinking with a map opens on its
//               Logic Map, its cards fitted larger; every control a finger's
//               size; never on a phone
//
// lib/logos5/cabin.ts, components/logos5/CabinDock.tsx, components/logos5/cabin.css,
// components/LogosApp.tsx, components/ThinkingMap.tsx.

import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as C from './.tmp/cabin-under-test.mjs';

const read = (f) => readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', f), 'utf8');
let pass = 0,
  fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 400))));
const J = JSON.stringify;
const html = (el) => renderToStaticMarkup(el);
const none = () => {};

console.log('=== when it is on ===');
const TESLA = 'Mozilla/5.0 (X11; GNU/Linux) AppleWebKit/537.36 (KHTML, like Gecko) Chromium/108.0.5359.215 Chrome/108.0.5359.215 Safari/537.36 Tesla/2023.44.30-4bf4b0d3a4';
const OLD_TESLA = 'Mozilla/5.0 (X11; Linux) AppleWebKit/534.34 (KHTML, like Gecko) QtCarBrowser Safari/534.34';
ok('a Tesla’s browser is a car’s browser — and its older one', C.isCarBrowser(TESLA) && C.isCarBrowser(OLD_TESLA));
ok(
  'a laptop, a phone, a tablet are not',
  [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36',
    '',
    null,
    undefined,
  ].every((ua) => !C.isCarBrowser(ua))
);
ok('  nor a page that only mentions the word', !C.isCarBrowser('Mozilla/5.0 TeslaFanApp'));
const Q = [
  ['?bigscreen=1', 'on'],
  ['?bigscreen=on', 'on'],
  ['?s=abc&bigscreen=true', 'on'],
  ['?bigscreen', 'on'],
  ['?bigscreen=0', 'off'],
  ['?x=1&bigscreen=off', 'off'],
  ['?bigscreen=false', 'off'],
  ['?bigscreen=maybe', null],
  ['?s=abc', null],
  ['', null],
];
for (const [q, want] of Q) ok(`the address "${q}" says ${want ?? 'nothing'}`, C.choiceFromQuery(q) === want, C.choiceFromQuery(q));
ok(
  'what the address asks for wins, then what was chosen before, then the browser',
  C.cabinOn({ ua: TESLA, query: 'off', stored: 'on' }) === false &&
    C.cabinOn({ ua: '', query: 'on', stored: 'off' }) === true &&
    C.cabinOn({ ua: TESLA, query: null, stored: 'off' }) === false &&
    C.cabinOn({ ua: '', query: null, stored: 'on' }) === true &&
    C.cabinOn({ ua: TESLA }) === true &&
    C.cabinOn({ ua: 'Chrome' }) === false
);
{
  const mem = new Map();
  const store = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  ok('nothing chosen yet: nothing read', C.readCabinChoice(store) === null);
  C.writeCabinChoice(store, 'on');
  ok('the choice is kept, and read back', C.readCabinChoice(store) === 'on' && mem.get(C.CABIN_KEY) === 'on');
  C.writeCabinChoice(store, 'off');
  ok('  and changed', C.readCabinChoice(store) === 'off');
  mem.set(C.CABIN_KEY, 'sideways');
  ok('  anything else stored is no choice', C.readCabinChoice(store) === null);
  const broken = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
  };
  ok('a browser that will not store anything: no choice, and nothing thrown', C.readCabinChoice(broken) === null && (C.writeCabinChoice(broken, 'on'), true) && C.readCabinChoice(null) === null);
}
ok('the map is fitted larger, and never below pressable', C.CABIN_FIT_MAX >= 1.4 && C.CABIN_MIN_K >= 0.7 && C.CABIN_MIN_K < C.CABIN_FIT_MAX);

console.log('\n=== the dock ===');
ok(
  'its places, in order: Map, then the four views',
  J(C.CABIN_PLACES.map((p) => p.label)) === J(['Map', 'Thinking', 'Chat', 'Artifacts', 'Content']) && J(C.CABIN_PLACES.map((p) => p.id)) === J(['map', 'logic_map', 'chat', 'artifacts', 'content'])
);
const dock = html(h(C.CabinDock, { at: 'logic_map', hasLine: true, onMap: none, onView: none, onWrite: none, onMemory: none, onLeave: none }));
ok('a landmark, named', /<nav class="cab-dock" aria-label="Socria">/.test(dock));
ok(
  'every place a button with a word under its drawing',
  ['Map', 'Thinking', 'Chat', 'Artifacts', 'Content', 'Write', 'Memory'].every((w) =>
    new RegExp(`<button type="button" class="cab-place[^"]*"[^>]*><svg viewBox="0 0 32 32" aria-hidden="true">[\\s\\S]*?</svg><span>${w}</span></button>`).test(dock)
  ),
  dock.slice(0, 600)
);
ok(
  'the one you are in is said so, and held',
  (dock.match(/aria-current="page"/g) ?? []).length === 1 && /class="cab-place is-on" aria-current="page"[^>]*><svg[\s\S]*?<span>Thinking<\/span>/.test(dock)
);
ok('the way back to the usual layout', /<button type="button" class="cab-leave">Usual layout<\/button>/.test(dock));
const home = html(h(C.CabinDock, { at: 'map', hasLine: false, onMap: none, onView: none, onLeave: none }));
ok(
  'with no line of thinking open, its four views wait',
  (home.match(/disabled=""/g) ?? []).length === 4 && /class="cab-place is-on" aria-current="page"[^>]*><svg[\s\S]*?<span>Map<\/span>/.test(home)
);
ok('  Write and Memory only where they can be had', !/<span>Write<\/span>/.test(home) && !/<span>Memory<\/span>/.test(home));
ok('nothing in it reads or controls the car', !/climate|charge|charging|unlock|vehicle|seat|drive mode|battery/i.test(read('components/logos5/CabinDock.tsx').replace(/\/\/.*$/gm, '')));
const dockSrc = read('components/logos5/CabinDock.tsx');
ok(
  'the first time, it says once that it is for when the car is parked',
  /PARKED_NOTE_KEY/.test(dockSrc) && /Made for a car’s screen while it is parked/.test(dockSrc) && /role="status"/.test(dockSrc) && /Got it/.test(dockSrc)
);

console.log('\n=== the app beside it ===');
const app = read('components/LogosApp.tsx');
ok(
  'on in a car’s browser or when asked: read once, the address kept',
  /const query = choiceFromQuery\(window\.location\.search\);\s*if \(query\) writeCabinChoice\(browserStorage\(\), query\);\s*setCabin\(cabinOn\(\{ ua: navigator\.userAgent, query, stored: readCabinChoice\(browserStorage\(\)\) \}\)\);/.test(
    app
  )
);
ok(
  'never on a phone: the dock and the layout only where there is room',
  /className=\{`logos-root\$\{cabin && !narrow \? ' is-cabin' : ''\}`\}/.test(app) && /\{cabin && !narrow && \(\s*<CabinDock/.test(app)
);
ok('a line of thinking with a map opens on its Logic Map', /\?\? \(cabin && map\.nodes\.length > 0 \? \{ view: 'logic_map', beside: null \} : OPENING\)/.test(app));
ok(
  'the dock goes to the Universal Map, the views, Write and Memory',
  /onMap=\{goHome\}/.test(app) &&
    /setScreen\(\(s\) => choose\(v, s\)\)/.test(app) &&
    /onWrite=\{openWriting\}/.test(app) &&
    /onMemory=\{cloud \? \(\) => setL5Mind\(true\) : undefined\}/.test(app) &&
    /onLeave=\{\(\) => setCabinMode\(false\)\}/.test(app)
);
ok('the ⋯ menu turns it on and off', /label: cabin \? 'Leave big-screen mode' : 'Big-screen mode'/.test(app));
ok('the map’s cards fitted larger there, and only there', /\{\.\.\.\(cabin && !narrow \? \{ fitMax: CABIN_FIT_MAX, fitMinK: CABIN_MIN_K \} : \{\}\)\}/.test(app));
const tm = read('components/ThinkingMap.tsx');
ok('  everywhere else the map fits as it always has', /fitMax = FIT_MAX,/.test(tm) && /minK: fitMinK \?\? \(graph \? 0\.45 : 0\.6\)/.test(tm) && (tm.match(/maxK: fitMax/g) ?? []).length === 2);

console.log('\n=== sized for a finger, by the brand book ===');
const css = read('components/logos5/cabin.css');
ok('the app moves right by the dock’s width; the dock is 112px', /\.logos-root\.is-cabin \{\s*left: 112px;/.test(css) && /\.cab-dock \{[\s\S]*?width: 112px;/.test(css));
ok('places 92px wide, 84px tall at least; the one you are in in moss', /\.cab-place \{[\s\S]*?width: 92px;\s*min-height: 84px;/.test(css) && /\.cab-place\.is-on \{[\s\S]*?color: #354620;/.test(css));
ok(
  'the bar 80px, its controls 56px; tabs 62px; the box’s buttons 56px',
  /\.l5v-top \{\s*height: 80px;/.test(css) && /\.l5v-home,[\s\S]*?height: 56px;/.test(css) && /\.l5v-tab \{\s*min-height: 62px;/.test(css) && /\.lg-send,[\s\S]*?width: 56px;\s*height: 56px;/.test(css)
);
ok(
  'no gradient, a focus you can see, still for reduced motion',
  !/gradient/.test(css) && /\.cab-place:focus-visible[\s\S]*?outline: 3px solid #354620/.test(css) && /prefers-reduced-motion: reduce/.test(css)
);

console.log(`\nbigscreen: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
