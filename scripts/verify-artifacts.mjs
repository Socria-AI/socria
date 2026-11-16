// scripts/verify-artifacts.mjs
//
// EVERY KIND OF ARTIFACT, DRAWN BY THE REAL COMPONENTS AND LOOKED AT IN A REAL BROWSER (Logos 6, November 2026).
//
// WHY THIS EXISTS. The suite checks what the layout code computes (test/artifact-qa.test.mjs) and what the markup
// says. Neither sees what a browser draws: real text widths, the stylesheet's font sizes and colours, a label that
// runs past its box. This bundles scripts/artifact-gallery.tsx — every kind of element the conversation draws, through
// the same validator, with the app's own stylesheets — opens it in Chromium at a desktop and a phone width, and checks
// each block:
//   · the page never scrolls sideways; a block overflows only inside a box made to scroll
//   · no two labels in a figure overlap, and none is cut off by its figure's edge
//   · no type smaller than 11px
//   · text contrast against what is behind it: 4.5:1 (3:1 for large type)
//   · the interactions: a mind map's part opens its panel, a fold opens, search finds, a slider moves its reading
// It writes a PNG per block per width, so the result can be looked at rather than inferred from a count.
//
// Usage: node scripts/verify-artifacts.mjs [--out dir]   (needs Chromium: PW_CHROMIUM, default /opt/pw-browsers/chromium)

import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const OUT = arg('out', '/tmp/artifact-qa');
const EXE = process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium';
mkdirSync(OUT, { recursive: true });

await build({
  entryPoints: [join(here, 'artifact-gallery.tsx')],
  bundle: true,
  // a classic script: a page opened from a file may not load a module
  format: 'iife',
  platform: 'browser',
  outfile: join(OUT, 'gallery.js'),
  tsconfig: join(root, 'tsconfig.json'),
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  // what Next.js fills in at build time (process.env.NEXT_PUBLIC_…) reads as unset here
  banner: { js: 'var process = globalThis.process || { env: { NODE_ENV: "production" } };' },
  loader: { '.css': 'css', '.woff2': 'file', '.woff': 'file', '.ttf': 'file', '.svg': 'file', '.png': 'file' },
  logLevel: 'error',
});
writeFileSync(
  join(OUT, 'index.html'),
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="gallery.css"><style>html{scroll-behavior:auto!important}.logos-root{position:static!important;height:auto!important;inset:auto!important}body{margin:0;background:#fbfaf6;color:#23241f;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}.qa-page{max-width:760px;margin:0 auto;padding:24px 16px 80px;display:grid;gap:40px}</style></head><body><div id="root"></div><script src="gallery.js"></script></body></html>`
);

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + (x ? '  ' + String(x).slice(0, 500) : ''))));

const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
const VIEWS = [
  { name: 'desktop', viewport: { width: 1280, height: 900 } },
  { name: 'phone', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
];

/** In the page: every check, per block. */
function measure() {
  const parse = (c) => {
    const m = /rgba?\(([^)]+)\)/.exec(c) || /color\(srgb ([^)]+)\)/.exec(c);
    if (!m) return null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    const scale = c.startsWith('color(') ? 255 : 1;
    return { r: p[0] * scale, g: p[1] * scale, b: p[2] * scale, a: p[3] === undefined ? 1 : p[3] };
  };
  const lum = ({ r, g, b }) => {
    const f = (v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  const bgOf = (el) => {
    for (let e = el; e; e = e.parentElement) {
      const c = parse(getComputedStyle(e).backgroundColor);
      if (c && c.a > 0.9) return c;
    }
    return parse(getComputedStyle(document.body).backgroundColor) ?? { r: 255, g: 255, b: 255, a: 1 };
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    for (let e = el; e && e !== document.body; e = e.parentElement || e.parentNode) {
      if (!(e instanceof Element)) break;
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.6) return false;
    }
    return true;
  };
  const out = { pageOverflow: document.scrollingElement.scrollWidth - innerWidth, blocks: [] };
  for (const block of document.querySelectorAll('[data-qa]')) {
    const b = { name: block.dataset.qa, overflow: [], overlaps: [], clipped: [], tiny: [], contrast: [], minFont: Infinity };
    const box = block.getBoundingClientRect();
    // overflow: anything past the block's right edge that is not inside a box made to scroll
    for (const el of block.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.right <= box.right + 1 || !visible(el)) continue;
      let scrolls = false;
      for (let e = el.parentElement; e && e !== block; e = e.parentElement) {
        const ox = getComputedStyle(e).overflowX;
        if (ox === 'auto' || ox === 'scroll' || ox === 'hidden') {
          scrolls = true;
          break;
        }
      }
      if (!scrolls) b.overflow.push(`${el.tagName.toLowerCase()}.${String(el.className?.baseVal ?? el.className).split(' ')[0]} +${Math.round(r.right - box.right)}px`);
    }
    // labels in each figure: overlap and clipping
    for (const svg of block.querySelectorAll('svg')) {
      const sr = svg.getBoundingClientRect();
      if (sr.width < 40) continue;
      const texts = [...svg.querySelectorAll('text')].filter((t) => t.textContent.trim() && visible(t)).map((t) => ({ t: t.textContent.trim(), r: t.getBoundingClientRect() }));
      // a label inside a box (a part of a map or a diagram) stays inside it
      for (const t of svg.querySelectorAll('text')) {
        const own = t.previousElementSibling;
        if (!own || own.tagName !== 'rect' || !t.textContent.trim() || !visible(t)) continue;
        const tr = t.getBoundingClientRect(), rr = own.getBoundingClientRect();
        const cx = tr.left + tr.width / 2, cy = tr.top + tr.height / 2;
        // written in the box (its middle inside it), not a name set beside a shape
        if (cx < rr.left || cx > rr.right || cy < rr.top || cy > rr.bottom) continue;
        if (tr.left < rr.left - 1 || tr.right > rr.right + 1 || tr.top < rr.top - 1 || tr.bottom > rr.bottom + 1) b.clipped.push(`${t.textContent.trim().slice(0, 30)} (past its box)`);
      }
      for (let i = 0; i < texts.length; i++) {
        const a = texts[i].r;
        if (a.left < sr.left - 2 || a.right > sr.right + 2 || a.top < sr.top - 2 || a.bottom > sr.bottom + 2) b.clipped.push(texts[i].t);
        for (let j = i + 1; j < texts.length; j++) {
          const c = texts[j].r;
          const w = Math.min(a.right, c.right) - Math.max(a.left, c.left), h = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top);
          if (w > 0 && h > 0 && (w * h) / Math.min(a.width * a.height, c.width * c.height) > 0.25) b.overlaps.push(`${texts[i].t} × ${texts[j].t}`);
        }
      }
    }
    // type size and contrast: every element that holds text of its own
    for (const el of block.querySelectorAll('*')) {
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!own || !visible(el)) continue;
      const cs = getComputedStyle(el);
      // the size it is drawn at: a figure scaled down to fit draws its 11px labels smaller than 11px
      const svg = el instanceof SVGElement ? el.ownerSVGElement ?? (el.tagName === 'svg' ? el : null) : null;
      const vb = svg?.viewBox?.baseVal;
      const scale = svg && vb && vb.width ? svg.getBoundingClientRect().width / vb.width : 1;
      const size = Math.round(parseFloat(cs.fontSize) * scale * 100) / 100;
      b.minFont = Math.min(b.minFont, size);
      const text = el.textContent.trim().slice(0, 40);
      if (size < 11) b.tiny.push(`${text} (${size}px)`);
      const isSvg = el instanceof SVGElement;
      const fg = parse(isSvg ? cs.fill : cs.color);
      if (!fg || fg.a < 0.5) continue;
      // what is behind a figure's label is the shape under it (a filled box), else the figure's ground
      let bg = null;
      if (isSvg) {
        // a label's own box (the shape drawn just before it) is what is behind it
        const own = (el.tagName === 'tspan' ? el.parentElement : el)?.previousElementSibling;
        const tr = el.getBoundingClientRect();
        const or = own?.getBoundingClientRect();
        const cx = tr.left + tr.width / 2, cy = tr.top + tr.height / 2;
        // only when the label sits on it (a box it is written in), not beside it (a point it names)
        if (own && or && ['rect', 'circle', 'ellipse'].includes(own.tagName) && cx > or.left && cx < or.right && cy > or.top && cy < or.bottom) {
          const f = parse(getComputedStyle(own).fill);
          if (f && f.a > 0.5) bg = f;
        }
      }
      if (isSvg && !bg) {
        // else what is under its middle — which can only be read on screen: bring the label into view first
        el.scrollIntoView({ block: 'center', inline: 'nearest' });
        const r = el.getBoundingClientRect();
        for (const u of document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2)) {
          if (u === el || el.contains(u) || u.tagName === 'text' || u.tagName === 'tspan') continue;
          if (!(u instanceof SVGElement) || !['rect', 'circle', 'ellipse', 'path', 'polygon'].includes(u.tagName)) break;
          const us = getComputedStyle(u);
          const f = parse(us.fill);
          if (f && f.a > 0.5 && Number(us.fillOpacity) > 0.5 && Number(us.opacity) > 0.5) {
            bg = f;
            break;
          }
        }
      }
      bg = bg ?? bgOf(isSvg ? el.ownerSVGElement ?? el : el);
      const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
      const need = large ? 3 : 4.5;
      const got = ratio(fg, bg);
      if (got < need) b.contrast.push(`${text}: ${got.toFixed(2)} < ${need}`);
    }
    // an editor: the element it changes is never squeezed beside its controls
    const pic = block.querySelector('.kp-edit-pic');
    if (b.name.startsWith('editor')) {
      const panel = block.querySelector('.kp-edit-panel');
      const pr = pic?.getBoundingClientRect(), qr = panel?.getBoundingClientRect();
      b.editor = pr && qr ? { pic: Math.round(pr.width), block: Math.round(box.width), stacked: qr.top >= pr.bottom - 1 } : null;
    }
    out.blocks.push(b);
  }
  return out;
}

for (const v of VIEWS) {
  console.log(`\n=== ${v.name} (${v.viewport.width}px) ===`);
  const ctx = await browser.newContext({ viewport: v.viewport, deviceScaleFactor: 1, ...(v.isMobile ? { isMobile: true, hasTouch: true } : {}) });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(pathToFileURL(join(OUT, 'index.html')).href);
  await page.waitForSelector('[data-qa="edit-card"]');
  await page.waitForTimeout(300);
  ok('the gallery draws with no error', errors.length === 0, errors.join(' | '));
  const m = await page.evaluate(measure);
  ok('the page never scrolls sideways', m.pageOverflow <= 1, `${m.pageOverflow}px`);
  for (const b of m.blocks) {
    ok(`${b.name}: nothing past its edge but inside a box made to scroll`, !b.overflow.length, b.overflow.slice(0, 4).join('; '));
    ok(`${b.name}: no two labels overlap; none cut off by its figure`, !b.overlaps.length && !b.clipped.length, [...b.overlaps.slice(0, 3), ...b.clipped.slice(0, 3).map((t) => `clipped: ${t}`)].join('; '));
    ok(`${b.name}: no type under 11px (smallest ${b.minFont === Infinity ? '—' : b.minFont + 'px'})`, !b.tiny.length, b.tiny.slice(0, 4).join('; '));
    ok(`${b.name}: text contrast holds`, !b.contrast.length, b.contrast.slice(0, 4).join('; '));
    if (b.name.startsWith('editor')) {
      const e = b.editor;
      ok(`${b.name}: the editor is open, and the element it changes is not squeezed (${e ? `${e.pic}px of ${e.block}px, ${e.stacked ? 'controls below' : 'controls beside'}` : 'not open'})`, !!e && (e.block < 760 ? e.stacked && e.pic >= e.block * 0.9 : e.pic >= 360), JSON.stringify(e));
    }
    const el = await page.$(`[data-qa="${b.name}"]`);
    await el.screenshot({ path: join(OUT, `${b.name}-${v.name}.png`) });
  }
  // THE INTERACTIONS, used as a person uses them — by keyboard where a person can (focus, Enter), so what is checked is
  // what a keyboard or a screen reader gets too; each one says which step failed, never a bare timeout
  const step = async (name, fn) => {
    try {
      ok(name, await fn());
    } catch (e) {
      ok(name, false, String(e?.message ?? e).split('\n')[0]);
    }
  };
  const mind = page.locator('[data-qa="mind-immune"]');
  const before = await mind.locator('g.ln-mind-node').count();
  await step('the large map starts folded below its first levels, and a fold opens by keyboard', async () => {
    const fold = mind.locator('[aria-label^="Open "]').first();
    if (!(await fold.count())) return false;
    await fold.focus({ timeout: 4000 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(120);
    return (await mind.locator('g.ln-mind-node').count()) > before;
  });
  await step('a part chosen opens its panel: what it is part of and what it holds', async () => {
    const part = mind.locator('g.ln-mind-node > [role="button"][aria-label^="Adaptive immunity"]').first();
    await part.focus({ timeout: 4000 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(120);
    return mind.locator('.ln-mind-panel').isVisible();
  });
  await step('a part can be pressed, too (pointer)', async () => {
    await mind.locator('g.ln-mind-node > [role="button"][aria-label^="Innate immunity"]').first().click({ timeout: 4000 });
    await page.waitForTimeout(120);
    return /Innate immunity/.test((await mind.locator('.ln-mind-panel').textContent()) ?? '');
  });
  await step('search finds the parts it names, and says how many', async () => {
    const search = mind.locator('input[type="search"]');
    await search.fill('cells', { timeout: 4000 });
    await page.waitForTimeout(120);
    const said = (await mind.textContent()) ?? '';
    return /\b\d+ found\b|\b\d+ match/i.test(said) || (await mind.locator('.is-found').count()) > 0;
  });
  await step('the tax, moved by keyboard, changes what the graph reads (the number in the equation on a fine pointer, its slider on touch)', async () => {
    const slider = page.locator('[data-qa="graph-market"]').locator('[role="slider"]:visible, input[type="range"]:visible').first();
    const readBefore = await page.locator('[data-qa="graph-market"]').textContent();
    await slider.focus({ timeout: 4000 });
    for (let i = 0; i < 4; i++) await slider.press('ArrowRight');
    await page.waitForTimeout(150);
    return readBefore !== (await page.locator('[data-qa="graph-market"]').textContent());
  });
  await page.screenshot({ path: join(OUT, `gallery-${v.name}.png`), fullPage: true });
  await ctx.close();
}

await browser.close();
console.log(`\nartifacts, rendered: ${pass} passed, ${fail} failed — pictures in ${OUT}`);
process.exit(fail ? 1 : 0);
