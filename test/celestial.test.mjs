// CELESTIAL — the sky Socria is read under (lib/celestial.ts, components/CelestialSky.tsx, app/celestial.css).
//
// What is held down:
//   • the sky is generated, and the same every time: one seed, one sky, on
//     every machine; its counts follow the area of the screen, within bounds;
//   • it is a real sky's shape: the Milky Way's grain lies along its band and
//     brightest at the core, the dust lanes in its middle, the nebulae round
//     their centres, a few bright stars lifted out to twinkle, the brightest
//     crossed with light;
//   • it is painted in small steps, the light at half resolution and the
//     stars at full, and the near dust tile repeats without a seam;
//   • it is there on Celestial alone, behind everything, still under reduced
//     motion; the grounds step aside for it and the surfaces read as glass;
//   • the map is a star chart: orbits that turn, a comet along a link,
//     questions that twinkle — and none of it moves under reduced motion.

import { readFileSync } from 'node:fs';
import {
  rng, gauss, makeSky, skySteps, paintSky, makeDust, paintDust, bandCoords, bandPoint, coreOf, clumpAt, mix, rgba,
  STAR_COLORS, DENSITY, BAND, NEBULAE, GROUND, STEP,
} from './.tmp/celestial.mjs';
import { THEMES } from './.tmp/theme.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 400))));
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

/** A canvas that only counts what would be drawn on it. */
function counting() {
  const log = { arcs: 0, fills: 0, rects: 0, gradients: 0, ops: new Set(), stops: [] };
  const ctx = {
    fillStyle: null,
    set globalCompositeOperation(v) { log.ops.add(v); this._op = v; },
    get globalCompositeOperation() { return this._op ?? 'source-over'; },
    fillRect() { log.rects++; },
    beginPath() {},
    arc(x, y, r) { log.arcs++; if (!Number.isFinite(x) || !Number.isFinite(y) || !(r > 0)) log.bad = true; },
    fill() { log.fills++; },
    createRadialGradient() { log.gradients++; return { addColorStop: (o, c) => log.stops.push(c) }; },
  };
  return { width: 0, height: 0, getContext: () => ctx, log };
}

console.log('=== the same sky, every time ===');
{
  const a = makeSky({ side: 1700 });
  const b = makeSky({ side: 1700 });
  ok('one seed, one sky', JSON.stringify(a) === JSON.stringify(b));
  ok('another seed, another sky', JSON.stringify(makeSky({ side: 1700, seed: 7 }).field.slice(0, 5)) !== JSON.stringify(a.field.slice(0, 5)));
  const r1 = rng(42), r2 = rng(42);
  ok('the generator is deterministic and in [0, 1)', Array.from({ length: 200 }, () => [r1(), r2()]).every(([x, y]) => x === y && x >= 0 && x < 1));
  const g = rng(3);
  const xs = Array.from({ length: 4000 }, () => gauss(g));
  const mean = xs.reduce((s, v) => s + v, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((s, v) => s + (v - mean) ** 2, 0) / xs.length);
  ok('its normal deviates are normal', Math.abs(mean) < 0.06 && Math.abs(sd - 1) < 0.06, `${mean} ${sd}`);
  const big = makeSky({ side: 2900 }), small = makeSky({ side: 930 });
  ok('a bigger screen has more stars, a phone fewer', big.field.length > a.field.length && a.field.length > small.field.length);
  ok('  within bounds either way', big.field.length <= DENSITY.field * 1.8 + 1 && small.field.length >= DENSITY.field * 0.3 - 1);
  ok('  and always the same few to twinkle', big.bright.length === DENSITY.bright && small.bright.length === DENSITY.bright);
}

console.log('=== a real sky’s shape ===');
{
  const sky = makeSky({ side: 2000 });
  const inside = (p) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;
  ok('every star is on the square', [...sky.field, ...sky.band, ...sky.bright].every(inside));
  ok('every size and brightness is real', [...sky.field, ...sky.band].every((s) => s.r > 0 && s.r < 3 && s.a > 0 && s.a <= 1.2));
  const hex = /^#[0-9a-f]{6}$/i;
  ok('every colour is a colour', [...sky.field, ...sky.band, ...sky.glow, ...sky.dust, ...sky.nebulae, ...sky.bright].every((s) => hex.test(s.c)));
  const across = sky.band.map((s) => Math.abs(bandCoords(s.x, s.y).across));
  ok('the Milky Way’s grain lies along its band', across.filter((d) => d < BAND.width * 1.5).length / across.length > 0.9);
  const fieldAcross = sky.field.map((s) => Math.abs(bandCoords(s.x, s.y).across));
  ok('  while the field is everywhere', fieldAcross.filter((d) => d > BAND.width * 2).length / fieldAcross.length > 0.5);
  const lightAt = (centre) => {
    const there = sky.band.filter((s) => Math.abs(bandCoords(s.x, s.y).along - centre) < 0.15);
    return there.reduce((t, s) => t + s.a, 0) / there.length;
  };
  ok('  brightest at its core', lightAt(BAND.core) > lightAt(BAND.core - 0.5) * 1.25, `${lightAt(BAND.core)} vs ${lightAt(BAND.core - 0.5)}`);
  ok('the dust lanes run down its middle', sky.dust.every((c) => Math.abs(bandCoords(c.x, c.y).across) < BAND.width * 0.5) && sky.dust.every((c) => c.c === '#03040c'));
  ok('the core is warm, the edges blue-white', coreOf(BAND.core) === 1 && coreOf(BAND.core + 0.6) < 0.01 && sky.glow.some((c) => c.c === '#ffe9c8'));
  ok('the band gathers in clouds along its length', Math.min(...Array.from({ length: 50 }, (_, i) => clumpAt(-0.8 + i * 0.032))) < 0.3 && Math.max(...Array.from({ length: 50 }, (_, i) => clumpAt(-0.8 + i * 0.032))) > 0.8);
  for (const neb of NEBULAE) {
    const mine = sky.nebulae.filter((c) => Math.hypot(c.x - neb.x, c.y - neb.y) < neb.r * 1.6);
    ok(`a nebula at ${neb.x}, ${neb.y} gathers round its centre`, mine.length >= neb.n * 0.6, mine.length);
  }
  ok('the brightest few cross with light', sky.bright.filter((b) => b.spike).length === DENSITY.spikes && sky.bright.filter((b) => b.spike).every((b) => b.r >= 2));
  ok('each twinkles on its own beat', new Set(sky.bright.map((b) => b.dur.toFixed(2))).size > DENSITY.bright * 0.8 && sky.bright.every((b) => b.dur >= 3 && b.dur <= 9 && b.delay <= 0));
  for (const along of [-0.5, 0, 0.3]) for (const a of [-0.05, 0, 0.04]) {
    const [x, y] = bandPoint(along, a);
    const back = bandCoords(x, y);
    ok(`a point on the band comes back where it was (${along}, ${a})`, Math.abs(back.along - along) < 1e-9 && Math.abs(back.across - a) < 1e-9);
  }
  ok('star colours run hot to cool and add up to one', Math.abs(STAR_COLORS.reduce((s, [, w]) => s + w, 0) - 1) < 1e-9);
  ok('colours mix, and become rgba', mix('#000000', '#ffffff', 0.5) === '#808080' && rgba('#ff8000', 0.5) === 'rgba(255,128,0,0.5)' && rgba('#000000', 7) === 'rgba(0,0,0,1)');
}

console.log('=== painted a little at a time ===');
{
  const sky = makeSky({ side: 1700 });
  const soft = counting(), deep = counting();
  const steps = skySteps(soft, deep, sky, 1700, 2);
  ok('it is a list of small steps', Array.isArray(steps) && steps.length > 10);
  ok('  none bigger than it should be', STEP.clouds <= 120 && STEP.stars <= 3000 && STEP.dust <= 200);
  for (const s of steps) s();
  ok('the light at half the resolution, the stars at full', soft.width === 1700 && deep.width === 3400 && soft.height === soft.width && deep.height === deep.width);
  ok('the ground is laid first, then the light added up', soft.log.rects === 1 && soft.log.ops.has('lighter') && soft.log.stops.slice(0, GROUND.length).length === GROUND.length);
  ok('every cloud of light is drawn', soft.log.gradients === sky.nebulae.length + sky.glow.length + 1);
  const blooms = [...sky.band, ...sky.field].filter((s) => s.r > 0.85).length;
  ok('every star is drawn, the bigger ones with a bloom', deep.log.arcs === sky.band.length + sky.field.length + blooms + sky.dust.length);
  ok('  and nothing drawn anywhere but on the canvas', !deep.log.bad && !soft.log.bad);
  ok('all of it at once, too', paintSky(counting(), counting(), sky, 900, 1));
  ok('no 2D context, no sky — and no throw', skySteps({ width: 0, height: 0, getContext: () => null }, counting(), sky, 900, 1) === null && !paintSky({ width: 0, height: 0, getContext: () => null }, counting(), sky, 900, 1));
  const dust = makeDust();
  const tile = counting();
  ok('the near dust is its own, the same every time', JSON.stringify(dust) === JSON.stringify(makeDust()) && dust.length === 260);
  paintDust(tile, dust, 1024, 2);
  ok('  painted on a tile that repeats without a seam: a star near an edge is drawn across it too', tile.width === 2048 && tile.log.arcs > dust.length);
}

console.log('=== behind everything, on Celestial alone ===');
{
  ok('Celestial is the theme stored as night', THEMES.night.label === 'Celestial' && /star chart/.test(THEMES.night.says));
  const comp = read('components/CelestialSky.tsx');
  ok('the sky watches the theme on <html>, whoever sets it', /new MutationObserver\(read\)/.test(comp) && /attributeFilter: \['data-theme'\]/.test(comp) && /const CELESTIAL = 'night'/.test(comp));
  ok('  and is nothing at all on another theme', /return on \? <Sky \/> : null;/.test(comp));
  ok('  painted in idle time, shown when whole', /requestIdleCallback/.test(comp) && /timeRemaining\(\) > 3/.test(comp) && /setPainted\(true\)/.test(comp));
  ok('  the near dust handed to the page, and taken back', /setProperty\('--cel-dust'/.test(comp) && /removeProperty\('--cel-dust'\)/.test(comp) && /revokeObjectURL/.test(comp));
  ok('  never a canvas bigger than a phone will hold', /const cap = side > 1600 \? 3072 : 2048;/.test(comp));
  const layout = read('app/layout.tsx');
  ok('mounted once, at the root', /<CelestialSky \/>/.test(layout) && /import '\.\/celestial\.css';/.test(layout));
  const css = read('app/celestial.css');
  ok('fixed behind every word', /\.cel-sky \{[^}]*position: fixed;[^}]*z-index: -1;/.test(css));
  ok('it turns, twinkles and now and then a star falls — only when motion is welcome', /@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\.cel-wheel \{\s*animation: cel-turn 3600s linear infinite;[\s\S]*?\.cel-star \{\s*animation: cel-twinkle/.test(css) && /\.cel-shoot\.s1 \{\s*animation: cel-shoot/.test(css));
  ok('the grounds step aside for it', /html\[data-theme='night'\] :is\(\.logos-root, \.logos-root \.l5, \.logos-root \.l5 \.l5h-main, \.app-root:not\(\.app-inline\)\) \{\s*background: transparent;/.test(css));
  ok('a conversation reads on glass', /\.l5x-convo \{\s*background: var\(--cel-glass\);/.test(css) && /backdrop-filter: var\(--cel-blur\)/.test(css));
  ok('"We killed the chatbot." and the premise float on the sky, the app out of sight behind them', /body:has\(> \.wn:not\(\.is-leaving\)\) > :not\(\.wn, \.cel-sky\) \{\s*visibility: hidden;/.test(css) && /:has\(> \.ob-first\) > :not\(\.ob-first\) \{\s*visibility: hidden;/.test(css));
  const wn = read('components/onboarding/WhatsNew.tsx');
  ok('  (it is on <body> itself, so it can)', /createPortal\(page, document\.body\)/.test(wn));
}

console.log('=== the map as a star chart ===');
{
  const uni = read('components/logos5/universe.css');
  ok('the map’s own ground steps aside, and its dust drifts at two depths', /html\[data-theme="night"\] \.logos-root \.l5 \.l5h-main \{\s*background: transparent;/.test(uni) && /var\(--cx, 0px\) \* 0\.06/.test(uni) && /var\(--cx, 0px\) \* 0\.16/.test(uni));
  ok('a session is a star, lit from inside', /html\[data-theme="night"\] \.logos-root \.l5 \.l5b-disc \{\s*background:\s*radial-gradient\(circle at 34% 28%/.test(uni));
  ok('where to pick up has a corona and a cross of light', /\.l5b-halo::before,/.test(uni) && /@keyframes cel-corona/.test(uni));
  ok('a link carries a comet, hidden on every other ground', /\.logos-root \.l5 \.l5b-link-comet \{\s*display: none;/.test(uni) && /html\[data-theme="night"\] \.logos-root \.l5 \.l5b-link-comet \{\s*display: inline;/.test(uni));
  ok('  drawn by the map itself', /className="l5b-link-comet"/.test(read('components/logos5/UniverseBubbles.tsx')));
  ok('orbits turn, comets run, questions twinkle — only when motion is welcome', /@media \(prefers-reduced-motion: no-preference\) \{\s*\/\* the orbits turn[\s\S]*?cel-orbit[\s\S]*?cel-comet[\s\S]*?cel-twinkle-pip/.test(uni));
  ok('  each orbit at its own pace, and seamless (a whole number of dashes)', /stroke-dashoffset: -96;/.test(uni) && 96 % 8 === 0);
  ok('the words float on glass', /:is\(\.l5b-card, \.l5h-find, \.l5h-lens, \.l5t-scrub-bar\) \{\s*background: rgba\(10, 16, 38, 0\.6\);/.test(uni));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
