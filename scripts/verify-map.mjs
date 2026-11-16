// scripts/verify-map.mjs — THE UNIVERSAL MAP IN A REAL BROWSER: screenshots and measurements.
//
// Bundles scripts/map-gallery.tsx (the real UniverseView, synthetic conversations from scripts/map-fixtures.mjs)
// and opens it in Chromium.
//   node scripts/verify-map.mjs --out <dir> [--shots] [--perf] [--n 60,400,1500]
// --shots: every temporal scale, desktop and phone, light and dark.
// --flow: the ways through the map, checked in order: find (/), a result outside the scale (the map widens, the
//         camera glides, it is pointed out, its preview opens), back to where you were, zooming in to every word and
//         out to the subjects, pressing a subject seen from far away, and the same with reduced motion; with
//         screenshots of each step and a JSON report (<out>/flow.json).
// --perf: for each size, the first draw, frame times while panning and zooming (requestAnimationFrame gaps), the
//         time a scale switch takes to settle, and the JS heap; printed as JSON and written to <out>/perf.json.
// Needs Chromium (PW_CHROMIUM, default /opt/pw-browsers/chromium).

import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i < 0 ? d : process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true;
};
const OUT = resolve(arg('out', join(root, 'test', '.tmp', 'map-qa')));
const SHOTS = !!arg('shots', false);
const PERF = !!arg('perf', false);
const FLOW = !!arg('flow', false);
const SIZES = String(arg('n', '60,400,1500')).split(',').map(Number);
const EXE = process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium';
mkdirSync(OUT, { recursive: true });

await build({
  entryPoints: [join(here, 'map-gallery.tsx')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  outfile: join(OUT, 'map.js'),
  tsconfig: join(root, 'tsconfig.json'),
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  banner: { js: 'var process = { env: { NODE_ENV: "production" } };' },
  loader: { '.css': 'css', '.woff2': 'file', '.woff': 'file', '.ttf': 'file', '.svg': 'file', '.png': 'file' },
  logLevel: 'error',
  minify: true,
});
writeFileSync(
  join(OUT, 'index.html'),
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="map.css"><style>body{margin:0}</style></head><body><div id="root"></div><script src="map.js"></script></body></html>`
);
const url = (p) => `${pathToFileURL(join(OUT, 'index.html')).href}?${new URLSearchParams(p)}`;

const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--enable-precise-memory-info'] });
const errors = [];

async function page(vp, params, dpr = 1) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: dpr, reducedMotion: params.reduced ? 'reduce' : 'no-preference' });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`${JSON.stringify(params)}: ${e.message}`));
  p.on('console', (m) => m.type() === 'error' && errors.push(`${JSON.stringify(params)}: console ${m.text()}`));
  const t0 = Date.now();
  await p.goto(url(params));
  await p.waitForSelector('.l5h', { timeout: 15000 });
  await p.waitForTimeout(params.wait ?? 1600);
  return { p, ctx, loadMs: Date.now() - t0 };
}

if (SHOTS) {
  const desk = { width: 1440, height: 900 };
  const phone = { width: 390, height: 844 };
  for (const theme of ['light', 'dark'])
    for (const scale of ['today', 'week', 'month', 'all']) {
      for (const [name, vp, narrow] of [['desk', desk, '0'], ['phone', phone, '1']]) {
        const { p, ctx } = await page(vp, { n: SIZES[0], scale, theme, narrow }, 2);
        await p.screenshot({ path: join(OUT, `${theme}-${scale}-${name}.png`) });
        await ctx.close();
      }
    }
  console.log(`screenshots in ${OUT}`);
}

if (PERF) {
  const results = [];
  for (const n of SIZES) {
    const { p, ctx, loadMs } = await page({ width: 1440, height: 900 }, { n, scale: 'all', theme: 'light', wait: 2500 });
    const r = await p.evaluate(async () => {
      const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
      // the map itself (it listens for the wheel; an element around it would not move the camera)
      const map = document.querySelector('[data-lod]');
      const box = map.getBoundingClientRect();
      const cx = box.left + box.width / 2;
      const cy = box.top + box.height / 2;
      const world = () => getComputedStyle(document.querySelector('.l5h-world')).transform;
      const frames = async (fn, ms) => {
        const from = world();
        const gaps = [];
        let last = performance.now();
        let on = true;
        let prev = from;
        let moves = 0;
        const tick = (t) => {
          gaps.push(t - last);
          last = t;
          const now = world();
          if (now !== prev) (moves++, (prev = now));
          if (on) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        await fn();
        await sleep(ms);
        on = false;
        gaps.sort((a, b) => a - b);
        const pct = (q) => gaps[Math.min(gaps.length - 1, Math.floor(q * gaps.length))] ?? 0;
        // moves: frames on which the camera changed (a measurement of a map that never moved measures nothing)
        return { frames: gaps.length, p50: +pct(0.5).toFixed(1), p95: +pct(0.95).toFixed(1), max: +(gaps[gaps.length - 1] ?? 0).toFixed(1), over50: gaps.filter((g) => g > 50).length, moves };
      };
      const wheel = (dy, ctrl) => map.dispatchEvent(new WheelEvent('wheel', { deltaY: dy, clientX: cx, clientY: cy, ctrlKey: ctrl, bubbles: true, cancelable: true }));
      const zoom = await frames(async () => {
        for (let i = 0; i < 40; i++) {
          wheel(i < 20 ? -12 : 12, true);
          await sleep(16);
        }
      }, 300);
      const pan = await frames(async () => {
        for (let i = 0; i < 60; i++) {
          wheel(i < 30 ? 14 : -14, false);
          await sleep(16);
        }
      }, 300);
      const nodes = document.querySelectorAll('[data-node]').length;
      const dom = document.getElementsByTagName('*').length;
      const heap = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null;
      // a scale switch: from All to Today and back, timed to the next quiet frame
      const lens = [...document.querySelectorAll('.l5h-lens [role="radio"]')];
      const switchTo = async (i) => {
        const t0 = performance.now();
        lens[i]?.click();
        await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
        return +(performance.now() - t0).toFixed(1);
      };
      const toToday = lens.length ? await switchTo(0) : null;
      await sleep(900);
      const toAll = lens.length ? await switchTo(3) : null;
      await sleep(900);
      // closer in, where each conversation is drawn: zoomed with + (the map has the keyboard) until the level is
      // reached, then panned across; what is drawn, and the frames, at that level
      const root = document.querySelector('[data-lod]');
      root.focus();
      // towards the busiest subject (its field the largest), so the pan crosses the densest part of the map
      const field = [...document.querySelectorAll('.l5b-field')].map((f) => f.getBoundingClientRect()).sort((a, b) => b.width - a.width)[0];
      const fx = field ? field.left + field.width / 2 : cx;
      const fy = field ? field.top + field.height / 2 : cy;
      const atLevel = async (want) => {
        for (let i = 0; i < 80 && root.getAttribute('data-lod') !== want; i++) {
          map.dispatchEvent(new WheelEvent('wheel', { deltaY: -14, clientX: fx, clientY: fy, ctrlKey: true, bubbles: true, cancelable: true }));
          await sleep(40);
        }
        await sleep(400);
        const k = +getComputedStyle(root).getPropertyValue('--k');
        const panned = await frames(async () => {
          for (let i = 0; i < 60; i++) {
            wheel(i < 30 ? 22 : -22, false);
            await sleep(16);
          }
        }, 300);
        return { lod: root.getAttribute('data-lod'), k: +k.toFixed(3), nodes: document.querySelectorAll('[data-node]').length, dom: document.getElementsByTagName('*').length, pan: panned };
      };
      const mid = await atLevel('mid');
      const near = await atLevel('near');
      const heapAfter = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null;
      return { zoom, pan, nodes, dom, heap, toToday, toAll, mid, near, heapAfter };
    });
    results.push({ n, loadMs, ...r });
    await ctx.close();
  }
  writeFileSync(join(OUT, 'perf.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 1));
}

if (FLOW) {
  const report = {};
  const shot = (p, name) => p.screenshot({ path: join(OUT, `flow-${name}.png`) });
  const state = (p) =>
    p.evaluate(() => {
      const root = document.querySelector('[data-lod]');
      return {
        lens: document.querySelector('.l5h-lens [aria-checked="true"]')?.textContent?.trim() ?? null,
        lod: root?.getAttribute('data-lod') ?? null,
        k: root ? +(+getComputedStyle(root).getPropertyValue('--k')).toFixed(3) : null,
        world: getComputedStyle(document.querySelector('.l5h-world')).transform,
        spot: document.querySelectorAll('.is-spot').length,
        preview: !!document.querySelector('.l5h-pv'),
        back: !!document.querySelector('.l5f-back'),
        agg: document.querySelectorAll('.l5b-agg').length,
        nodes: document.querySelectorAll('[data-node]').length,
        // every quick question's dot drawn with a size (a dot with none is on the map and invisible)
        dots: document.querySelectorAll('.l5b-dot .l5b-pip').length,
        dotsUnsized: [...document.querySelectorAll('.l5b-dot .l5b-pip')].filter((x) => !x.getBoundingClientRect().width).length,
      };
    });
  // samples of the camera over a span: how many distinct frames it passed through (a glide, or a jump)
  const camOver = (p, ms, every = 40) =>
    p.evaluate(
      async ([ms, every]) => {
        const seen = [];
        const t0 = performance.now();
        while (performance.now() - t0 < ms) {
          seen.push(getComputedStyle(document.querySelector('.l5h-world')).transform);
          await new Promise((r) => setTimeout(r, every));
        }
        return { distinct: new Set(seen).size, first: seen[0], last: seen[seen.length - 1] };
      },
      [ms, every]
    );

  for (const reduced of [false, true]) {
    const tag = reduced ? 'reduced' : 'motion';
    const r = (report[tag] = {});
    const { p, ctx } = await page({ width: 1440, height: 900 }, { n: 120, scale: 'today', theme: 'light', wait: 2400, reduced }, 1);
    r.start = await state(p);
    await p.keyboard.press('/');
    await p.waitForSelector('.l5f', { timeout: 3000 });
    r.recentRows = await p.$$eval('.l5f-row', (rows) => rows.length);
    await p.waitForTimeout(400);
    if (!reduced) await shot(p, '1-recent');
    // a word that finds a conversation outside Today
    let pick = null;
    for (const q of ['roman', 'revolution', 'entropy', 'recursion', 'inflation', 'bayes', 'stoicism', 'typography']) {
      await p.fill('.l5f-field input', q);
      await p.waitForTimeout(120);
      const rows = await p.$$eval('.l5f-row', (rows) => rows.map((el, i) => ({ i, kind: [...el.classList].find((c) => c.startsWith('is-') && c !== 'is-active' && c !== 'is-out'), out: el.classList.contains('is-out'), title: el.querySelector('.l5f-title')?.textContent, badge: el.querySelector('.l5f-out')?.textContent ?? null })));
      const hit = rows.find((x) => x.kind === 'is-conversation' && x.out);
      if (hit) {
        pick = { q, ...hit, kinds: [...new Set(rows.map((x) => x.kind))], rows: rows.length };
        break;
      }
    }
    r.pick = pick;
    if (!reduced) await shot(p, '2-results');
    if (pick) {
      const before = await state(p);
      for (let i = 0; i < pick.i; i++) await p.keyboard.press('ArrowDown');
      await p.keyboard.press('Enter');
      r.glide = await camOver(p, reduced ? 500 : 1500);
      await p.waitForTimeout(400);
      r.arrived = await state(p);
      r.spotTitle = await p.evaluate(() => document.querySelector('.is-spot [data-node], .is-spot')?.textContent?.slice(0, 80) ?? null);
      if (!reduced) await shot(p, '3-arrived');
      // back to where you were: the camera it left
      await p.keyboard.press('Escape');
      await p.waitForTimeout(150);
      if (await p.$('.l5f-back')) await p.click('.l5f-back');
      await p.waitForTimeout(reduced ? 300 : 1500);
      const after = await state(p);
      r.back = { before: before.world, after: after.world, same: before.world === after.world, k: [before.k, after.k], pill: after.back };
    }
    if (!reduced) {
      // zoom: in until every word, out until the subjects
      await p.keyboard.press('0');
      await p.waitForTimeout(1200);
      // in towards the largest conversation, under the pointer, then out again: where each level began, both ways
      const disc = await p.evaluate(() => {
        const all = [...document.querySelectorAll('.l5b-hub .l5b-disc')].map((d) => d.getBoundingClientRect()).sort((a, b) => b.width - a.width);
        const b = all[0];
        return b ? { x: b.left + b.width / 2, y: b.top + b.height / 2 } : null;
      });
      const map = await p.$('.l5h-map, .l5h-main');
      const box = await map.boundingBox();
      await p.mouse.move(disc?.x ?? box.x + box.width / 2, disc?.y ?? box.y + box.height / 2);
      const changes = [];
      let was = (await state(p)).lod;
      const wheelZoom = async (dy, n) => {
        for (let i = 0; i < n; i++) {
          await p.keyboard.down('Control');
          await p.mouse.wheel(0, dy);
          await p.keyboard.up('Control');
          await p.waitForTimeout(60);
          const st = await state(p);
          if (st.lod !== was) changes.push({ from: was, to: st.lod, k: st.k, way: dy < 0 ? 'in' : 'out' }), (was = st.lod);
        }
      };
      await wheelZoom(-40, 30);
      await p.waitForTimeout(400);
      r.zoomIn = { end: await state(p) };
      await shot(p, '4-near');
      await wheelZoom(40, 40);
      r.levelChanges = changes;
      // the widest scale, seen from far away
      await p.click('.l5h-lens [role="radio"]:last-child');
      await p.waitForTimeout(1600);
      for (let i = 0; i < 40; i++) {
        await p.keyboard.down('Control');
        await p.mouse.wheel(0, 80);
        await p.keyboard.up('Control');
        await p.waitForTimeout(30);
      }
      await p.waitForTimeout(500);
      r.far = await state(p);
      await shot(p, '5-far');
      const go = await p.$('.l5b-agg-go');
      if (go) {
        await go.click();
        await p.waitForTimeout(1500);
        r.aggPressed = await state(p);
        await shot(p, '6-agg-pressed');
      }
      // hysteresis: a camera resting just past a boundary keeps its level
      r.keys = {};
      await p.keyboard.press('0');
      await p.waitForTimeout(1200);
      r.keys.fit = await state(p);
      await p.keyboard.press('+');
      await p.waitForTimeout(500);
      r.keys.plus = (await state(p)).k;
      await p.keyboard.press('-');
      await p.waitForTimeout(500);
      r.keys.minus = (await state(p)).k;
    }
    await ctx.close();
  }
  // the panel on a phone, and in the dark
  for (const [name, vp, params] of [
    ['phone', { width: 390, height: 844 }, { n: 120, scale: 'week', theme: 'light', narrow: '1' }],
    ['dark', { width: 1440, height: 900 }, { n: 120, scale: 'week', theme: 'dark' }],
  ]) {
    const { p, ctx } = await page(vp, params, 2);
    await p.click('.l5f-trigger');
    await p.waitForSelector('.l5f');
    await p.fill('.l5f-field input', 'revolution');
    await p.waitForTimeout(200);
    const fit = await p.evaluate(() => {
      const b = document.querySelector('.l5f').getBoundingClientRect();
      return { left: Math.round(b.left), right: Math.round(b.right), width: innerWidth, scrollX: document.documentElement.scrollWidth > innerWidth };
    });
    report[`panel-${name}`] = fit;
    await shot(p, `7-panel-${name}`);
    await ctx.close();
  }
  writeFileSync(join(OUT, 'flow.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 1));
}

await browser.close();
if (errors.length) {
  console.log('PAGE ERRORS:\n' + errors.slice(0, 20).join('\n'));
  process.exitCode = 1;
}
