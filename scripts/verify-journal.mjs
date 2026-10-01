// scripts/verify-journal.mjs
//
// THE HOMEPAGE, RENDERED, BECAUSE THE LAST TWO UI REGRESSIONS WERE LAYOUT ONES.
//
// Nothing in test/ mounts a component, so a section that renders blank, a
// stylesheet rule that never matched, or a composer that throws on its first
// keystroke are all invisible to the suite. This opens the real route in
// Chromium, checks that each ported piece is actually on the page and actually
// styled, exercises the Door the way a person would, and screenshots it at
// desktop and phone width.
//
// Usage: node scripts/verify-journal.mjs [--url u] [--shots dir]

import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const URL = arg('url', 'http://localhost:3000/');
const SHOTS = arg('shots', '/tmp/journal-shots');
mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

// Properties of running this in a sandboxed container, not of the page: the
// publishable key here is a placeholder, so clerk-js never loads.
const IGNORE = [
  'did not match. Server:', 'ERR_TUNNEL_CONNECTION_FAILED', 'clerk', 'Clerk',
  'Failed to load resource',
];
const noise = [];
const note = (s) => { if (!IGNORE.some((i) => s.includes(i))) noise.push(s); };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on('console', (m) => m.type() === 'error' && note(m.text()));
page.on('pageerror', (e) => note(`pageerror: ${e.message}`));

await page.goto(URL, { waitUntil: 'networkidle' });

// ── the pieces are on the page ──────────────────────────────────────
for (const [what, sel] of [
  ['the door', '.jr-root .door'],
  ['its composer', '.jr-root .door-ask textarea'],
  ['its promise', '.jr-root .door-note'],
  ['the ask slip', '.jr-root .ask-slip'],
  ['what it is', '.jr-root #about'],
  ['where it differs', '.jr-root #differs'],
  ['the contrast pair', '.jr-root .pair-holder'],
  ['the stage', '.jr-root .stage-sec'],
  ['the close', '.jr-root .close'],
]) ok(`${what} is on the page`, (await page.$$(sel)).length > 0, sel);

// THE COVER IS GONE, and that is the point of the door — two full-height
// openings back to back would be the page introducing itself twice.
ok('the old cover is gone', (await page.$$('.jr-root .cover')).length === 0);

// ── and they are STYLED, which is the half a DOM check misses ───────
const styled = await page.evaluate(() => {
  const r = (sel, prop) => {
    const el = document.querySelector(sel);
    return el ? getComputedStyle(el)[prop] : null;
  };
  const door = document.querySelector('.jr-root .door');
  return {
    doorHeight: door ? Math.round(door.getBoundingClientRect().height) : 0,
    composerFont: r('.jr-root .door-ask textarea', 'fontSize'),
    composerFamily: r('.jr-root .door-ask textarea', 'fontFamily'),
    slipFixed: r('.jr-root .ask-slip', 'position'),
    slipOpacity: r('.jr-root .ask-slip', 'opacity'),
    pairCols: r('.jr-root .pair-holder > div', 'gridTemplateColumns'),
    differsBorder: r('.jr-root .differs', 'borderBottomWidth'),
  };
});
ok('the door takes the viewport', styled.doorHeight > 600, `${styled.doorHeight}px`);
// The composer IS the cover, so it is set at cover scale in the display face.
ok('the composer is display scale', parseFloat(styled.composerFont) > 40, styled.composerFont);
ok('  in the serif, not a fallback', /instrument|serif/i.test(styled.composerFamily || ''), styled.composerFamily);
ok('the slip is fixed', styled.slipFixed === 'fixed', styled.slipFixed);
ok('  and invisible before any scroll', styled.slipOpacity === '0', styled.slipOpacity);
ok('the contrast pair is a grid', /px|fr/.test(styled.pairCols || ''), styled.pairCols);
ok('the differs section carries its rule', parseFloat(styled.differsBorder) > 0, styled.differsBorder);

await page.screenshot({ path: `${SHOTS}/01-door.png` });

// ── the ghost types itself ──────────────────────────────────────────
await page.waitForTimeout(2200);
const ghost = await page.$eval('.jr-root .door-ghost', (e) => e.textContent?.trim() ?? '').catch(() => '');
ok('the questions type themselves', ghost.length > 2, JSON.stringify(ghost));

// ── and typing takes it over ────────────────────────────────────────
await page.click('.jr-root .door-ask textarea');
// Past 58 characters, which is where the stylesheet steps the type down — a
// shorter question must NOT shrink, so the length has to clear the threshold
// for this to be testing anything.
await page.type('.jr-root .door-ask textarea', 'Should I take the job in Berlin, or stay where I am and finish what I started here?');
const after = await page.evaluate(() => {
  const t = document.querySelector('.jr-root .door-ask textarea');
  return {
    len: t.dataset.len,
    height: Math.round(t.getBoundingClientRect().height),
    ghost: !!document.querySelector('.jr-root .door-ghost'),
    size: parseFloat(getComputedStyle(t).fontSize),
  };
});
ok('the ghost gives way to your own typing', after.ghost === false);
ok('the box reports its length', !!after.len, after.len);
ok('  and the type steps down for a longer question', after.size < parseFloat(styled.composerFont), `${styled.composerFont} → ${after.size}px`);
ok('  and the box grew rather than scrolling', after.height > 40, `${after.height}px`);
await page.screenshot({ path: `${SHOTS}/02-door-typed.png` });

// ── the Door's one way past it ──────────────────────────────────────
// "Or watch it work first" is the escape for somebody not ready to type, and
// it was a link to nothing: the anchor it names lives on the design's own
// <span id="stage"> and I ported the link without it. A dead anchor does not
// throw — the page simply does not move.
{
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await page.click('.jr-root .door-alt a');
  await page.waitForTimeout(900);
  const got = await page.evaluate(() => {
    const e = document.querySelector('.jr-root .stage-sec');
    const r = e?.getBoundingClientRect();
    return { y: Math.round(window.scrollY), inView: !!r && r.top < innerHeight && r.bottom > 0 };
  });
  ok('"watch it work first" goes somewhere', got.y > 200, `${got.y}px`);
  ok('  and that somewhere is the stage', got.inView, JSON.stringify(got));
}

// ── the slip appears once the door is behind you ────────────────────
await page.evaluate(() => window.scrollTo(0, 1400));
await page.waitForTimeout(500);
const slip = await page.$eval('.jr-root .ask-slip', (e) => ({
  on: e.classList.contains('on'),
  op: getComputedStyle(e).opacity,
  hidden: e.getAttribute('aria-hidden'),
  tab: e.getAttribute('tabindex'),
}));
ok('the slip arrives after the door', slip.on && slip.op === '1', JSON.stringify(slip));
ok('  and is reachable once it is visible', slip.hidden === null && slip.tab === '0', JSON.stringify(slip));

// ── the sections read ───────────────────────────────────────────────
const copy = await page.evaluate(() => ({
  about: document.querySelector('.jr-root #about')?.textContent ?? '',
  differs: document.querySelector('.jr-root #differs')?.textContent ?? '',
  close: document.querySelector('.jr-root .close h2')?.textContent ?? '',
}));
ok('the definition is the one the design wrote', /never hands you the conclusion/.test(copy.about));
ok('the pair asks both questions', /How good an answer/.test(copy.differs) && /How much clearer/.test(copy.differs));
ok('and it names the alternatives rather than scoring them', /Claude, ChatGPT and Gemini/.test(copy.differs) && !/✓|✗/.test(copy.differs));
ok('the displaced headline closes the issue', /AI gets stronger/.test(copy.close), copy.close);
  // The two ways on, in the design's own words.
  const ways = await page.$$eval('.jr-root .close .row a', (as) => as.map((a) => `${a.textContent.trim()}|${a.getAttribute('href')}`));
  // The arrow is inside the anchor's own text, so this matches the words and
  // the destination rather than assuming they are adjacent.
  ok('the close offers the free tier by name',
    ways.some((w) => /Try Socria — free/.test(w) && w.endsWith('|/chat')), ways.join(' · '));
  ok('  and reading on about Logos', ways.some((w) => /about Logos\|\/logos/.test(w)), ways.join(' · '));

// The two new sections, in the frame, revealed.
await page.evaluate(() => document.querySelector('.jr-root #differs')?.scrollIntoView());
await page.waitForTimeout(900);
await page.screenshot({ path: `${SHOTS}/03-differs.png` });
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(900);
await page.screenshot({ path: `${SHOTS}/05-close.png` });

// ── phone width, where a clamp() goes wrong ─────────────────────────
await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate(() => window.scrollTo(0, 0));
// The reveal driver works off scroll, so a resize alone leaves everything at
// opacity 0 — a blank screenshot that proves nothing. Nudge it and let it run.
await page.evaluate(() => window.scrollBy(0, 2));
await page.waitForTimeout(900);
const phone = await page.evaluate(() => ({
  overflow: Math.round(document.documentElement.scrollWidth - document.documentElement.clientWidth),
  composer: Math.round(document.querySelector('.jr-root .door-ask textarea').getBoundingClientRect().width),
}));
ok('nothing overflows at phone width', phone.overflow <= 1, `${phone.overflow}px`);
ok('the composer still fills its measure', phone.composer > 250, `${phone.composer}px`);
await page.screenshot({ path: `${SHOTS}/04-phone.png` });

ok('no console errors anywhere in that', noise.length === 0, noise.slice(0, 3).join(' | '));

await browser.close();
console.log(`\n${pass} passed, ${fail} failed · shots in ${SHOTS}`);
process.exit(fail ? 1 : 0);
