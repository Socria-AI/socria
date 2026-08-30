// Export real Socria UI as static artboard fragments.
//
// For each demo: wait for it to settle, then serialize the product surface's
// subtree together with ONLY the CSS rules that actually match it. Rule
// matching runs against the LIVE document, so descendant selectors that
// depend on ancestors (.docs-root .logos-root .lg-node) resolve exactly.
//
// next/font self-hosts its faces at /_next/... which the artifact CSP blocks,
// so @font-face rules are dropped and the four families are re-linked from
// Google Fonts (the one host the canvas admits) in the artboard's helmet.

import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import { writeFileSync, mkdirSync } from 'node:fs';
const { chromium } = pw;

const OUT = '/home/user/socria/.trailer/frag';
mkdirSync(OUT, { recursive: true });

const TARGETS = [
  { id: 'split',    url: '/docs/logos',            sel: '.ui-frame:has(.lg-demo-split) .logos-root', settle: 5200 },
  { id: 'lenses',   url: '/docs/thinking-map',      sel: '.ui-lenses .logos-root', settle: 4200,
    prep: async (p) => { const b = await p.$$('.ui-lenstabs .lg-lens'); if (b[1]) await b[1].click(); } },
  { id: 'moves',    url: '/docs/thinking-map',      sel: '.ui-frame:has(.ui-movedemo) .logos-root', settle: 1500,
    prep: async (p) => { const b = await p.$('.lg-act-challenge'); if (b) await b.click(); } },
  { id: 'board',    url: '/docs/mathematics',       sel: '.ui-frame:has(.ui-boarddemo) .logos-root', settle: 8000 },
  { id: 'calculus', url: '/docs/mathematics',       sel: '.ui-lenses .logos-root', settle: 2200 },
  { id: 'guard',    url: '/docs/mathematics',       sel: '.ui-frame:has(.ui-guarddemo) .logos-root', settle: 1200 },
  { id: 'dials',    url: '/docs/depth-personality', sel: '.ui-frame:has(.ui-personademo) .logos-root', settle: 1600 },
  { id: 'depth',    url: '/docs/depth-personality', sel: '.ui-frame:has(.ui-ctrldemo) .logos-root', settle: 1600,
    prep: async (p) => { const o = await p.$$('.ui-depthmenu .lg-depth-opt'); if (o[2]) await o[2].click(); } },
];

const browser = await chromium.connectOverCDP('http://127.0.0.1:9226');
const ctx = await browser.newContext({ viewport: { width: 1420, height: 1100 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('  PAGEERROR:', e.message.slice(0, 120)));

for (const t of TARGETS) {
  await page.goto('http://127.0.0.1:3141' + t.url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(2200);
  // The docs article column is ~718px; a trailer frame wants room. Widen the
  // wiki shell before capture — the demos are responsive, so they reflow into
  // it exactly as they would on a wide screen.
  await page.addStyleTag({ content: `
    .docs-root .d-body { max-width: none !important; grid-template-columns: minmax(0, 1fr) !important; }
    .docs-root .d-nav { display: none !important; }
    .docs-root .d-article { max-width: none !important; }
    .docs-root .d-main { padding-left: 0 !important; }
  ` });
  await page.waitForTimeout(600);
  const host = await page.$(t.sel);
  if (!host) { console.log(`MISS ${t.id} (${t.sel})`); continue; }
  await host.scrollIntoViewIfNeeded();
  if (t.prep) { await t.prep(page); }
  await page.waitForTimeout(t.settle);

  const out = await page.evaluate((sel) => {
    const root = document.querySelector(sel);
    const hits = (s) => {
      let els; try { els = document.querySelectorAll(s); } catch { return false; }
      for (const el of els) if (el === root || root.contains(el) || el.contains(root)) return true;
      return false;
    };
    const keep = [];
    const walk = (rule, wrap) => {
      // CSSStyleRule
      if (rule.selectorText) {
        const parts = rule.selectorText.split(',').map((s) => s.trim()).filter(hits);
        if (parts.length) keep.push(wrap ? `${wrap}{${parts.join(',')}{${rule.style.cssText}}}`
                                         : `${parts.join(',')}{${rule.style.cssText}}`);
        return;
      }
      // @media / @supports — recurse, preserving the condition
      if (rule.cssRules && rule.conditionText !== undefined) {
        const inner = [];
        for (const r of rule.cssRules) {
          if (!r.selectorText) continue;
          const parts = r.selectorText.split(',').map((s) => s.trim()).filter(hits);
          if (parts.length) inner.push(`${parts.join(',')}{${r.style.cssText}}`);
        }
        if (inner.length) keep.push(`@${rule.type === 12 ? 'supports' : 'media'} ${rule.conditionText}{${inner.join('')}}`);
        return;
      }
      // @keyframes — animations referenced by kept rules; cheap, keep all
      if (rule.name && rule.cssRules) keep.push(rule.cssText);
    };
    for (const sheet of document.styleSheets) {
      let rules; try { rules = sheet.cssRules; } catch { continue; }
      for (const r of rules) walk(r);
    }
    // the :root custom properties everything resolves through
    const rootVars = [];
    for (const sheet of document.styleSheets) {
      let rules; try { rules = sheet.cssRules; } catch { continue; }
      for (const r of rules) {
        if (r.selectorText && /(^|,)\s*:root\s*(,|$)/.test(r.selectorText)) rootVars.push(r.style.cssText);
      }
    }
    const box = root.getBoundingClientRect();
    return {
      html: root.outerHTML,
      css: keep.join('\n'),
      vars: rootVars.join(';'),
      w: Math.round(box.width),
      h: Math.round(box.height),
      chain: (() => { const c = []; let n = root.parentElement;
        while (n && n !== document.body) { c.unshift(n.className || ''); n = n.parentElement; } return c; })(),
    };
  }, t.sel);

  writeFileSync(`${OUT}/${t.id}.json`, JSON.stringify(out));
  console.log(`${t.id.padEnd(9)} ${String(out.w).padStart(4)}x${String(out.h).padEnd(4)}  html ${(out.html.length/1024).toFixed(0)}K  css ${(out.css.length/1024).toFixed(0)}K`);
}
await ctx.close(); await browser.close();
console.log('exported');
