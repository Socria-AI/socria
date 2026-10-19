#!/usr/bin/env node
// scripts/dev/logos5-journey.mjs — drive Logos 5 in a real browser, by hand.
//
// DEVELOPMENT ONLY. Runs against a local app with the stand-ins, so there is
// no account, no key and no spend:
//
//   node scripts/dev/fake-postgrest.mjs &
//   FAKE_STREAM_MS=450 node scripts/dev/fake-openai.mjs 3999 &
//   SUPABASE_URL=http://localhost:54321 SUPABASE_SERVICE_ROLE_KEY=dev \
//   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_ZXhhbXBsZS5jbGVyay5hY2NvdW50cy5kZXYk \
//   CLERK_SECRET_KEY=sk_test_dummydummydummydummy OPENAI_API_KEY=sk-local \
//   OPENAI_BASE_URL=http://127.0.0.1:3999/v1 SOCRIA_ACCESS_CODE=localdevcode1234567 \
//   RATE_LIMIT_DISABLED=1 npx next dev -p 3312
//
//   W=1440 H=900 STEPS=talk,talk2,chart,stage,card,fx,retry,edit,stop node scripts/dev/logos5-journey.mjs
//   W=390 H=844 STEPS=talk,chart,stage,back node scripts/dev/logos5-journey.mjs
//
// Each step leaves a screenshot in OUT (default: the system temp folder) and
// prints what it found; page errors are listed at the end. Chromium is found
// at CHROMIUM (default /opt/pw-browsers/chromium) through playwright-core.

import { chromium } from 'playwright-core';
import { tmpdir } from 'node:os';
const SP = process.env.OUT || tmpdir();
const BASE = process.env.BASE || 'http://localhost:3312';
const width = Number(process.env.W || 1440), height = Number(process.env.H || 900);
const PFX = process.env.PFX || 'l5';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: width < 700, hasTouch: width < 700, permissions: ['microphone'] });
await ctx.addCookies([{ name: '__client_uat', value: '0', url: BASE }, { name: '__clerk_db_jwt', value: 'dvb_dummy', url: BASE }]);
await ctx.route(/clerk\.(accounts\.dev|com)|accounts\.dev/, (r) => r.abort());
await ctx.addInitScript(() => { try { localStorage.setItem('socria.core3AccessKey.v1', '1'); } catch {} });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
page.on('console', (m) => m.type() === 'error' && !/clerk|Failed to load resource|net::ERR|Warning:/i.test(m.text()) && errors.push('console: ' + m.text().slice(0, 300)));
await page.request.post(`${BASE}/api/access/unlock`, { data: { code: 'localdevcode1234567' } });
await page.goto(`${BASE}/chat?model=logos-3`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.lg-composer textarea', { timeout: 90000 }).catch(() => console.log('no composer'));
await page.waitForTimeout(1200);
for (let i = 0; i < 3; i++) { const sk = page.getByRole('button', { name: /^skip/i }); if (await sk.count()) { await sk.first().click().catch(() => {}); await page.waitForTimeout(1000); } }
await page.addStyleTag({ content: '.env-badge{display:none!important}' });
const shot = (n) => page.screenshot({ path: `${SP}/${PFX}-${n}-${width}.png` });
const say = async (text, wait = 7000) => {
  await page.locator('.l5-dock .lg-composer textarea').fill(text);
  await page.locator('.l5-dock .lg-send').click();
  await page.waitForTimeout(wait);
};
const log = (...a) => console.log(...a);
log('screenshots in', SP);
await shot('0-hello');
for (const s of (process.env.STEPS || '').split(',').filter(Boolean)) {
  try {
    if (s === 'talk') await say('I have two job offers and I keep going back and forth. One pays more, the other has a better team.', Number(process.env.TALK_WAIT || 7000));
    if (s === 'talk2') await say('Honestly the team matters more. I learn fastest around people who are better than me.');
    if (s === 'chart') await say('Chart my spending as a pie: rent $1,200, food $400, transport $150', 9000);
    if (s === 'stage') { await page.locator('.l5-stagebtn').click(); await page.waitForTimeout(1500); }
    if (s === 'unstage') { await page.locator('.l5-stagebtn').click(); await page.waitForTimeout(800); }
    if (s === 'card') {
      const card = page.locator('.l5-stage .lg-node').first();
      log('cards', await page.locator('.l5-stage .lg-node').count());
      await card.click(); await page.waitForTimeout(900);
      log('linkbar', await page.locator('.l5-linkbar').innerText().catch(() => 'none'));
      log('linked msgs', await page.locator('.l5-msg.is-linked').count());
      await page.keyboard.press('Escape');
    }
    if (s === 'fx') {
      const chip = page.locator('.l5-fx-chip').first();
      log('fx chips', await page.locator('.l5-fx-chip').allInnerTexts());
      if (await chip.count()) { await chip.click(); await page.waitForTimeout(1200); log('lit cards', await page.locator('.lg-node.is-linked').count()); }
    }
    if (s === 'retry') {
      const n0 = await page.locator('.l5-msg').count();
      await page.locator('.l5-msg.is-latest .l5-act', { hasText: 'Retry' }).click().catch(async () => page.locator('.l5-msg.is-latest [aria-label="Ask again"]').click());
      await page.waitForTimeout(7000);
      log('msgs before/after retry', n0, await page.locator('.l5-msg').count());
    }
    if (s === 'edit') {
      const mine = page.locator('.l5-u.is-mine').last();
      await mine.hover();
      await mine.locator('[aria-label="Edit your message"]').click();
      await page.waitForTimeout(400);
      await shot('edit-open');
      await mine.locator('textarea').fill('Actually, the team is what I care about most.');
      await mine.locator('.l5-btn.is-primary').click();
      await page.waitForTimeout(7000);
      log('last user msg', await page.locator('.l5-u.is-mine .l5-said').last().innerText());
    }
    if (s === 'stop') {
      await page.locator('.l5-dock .lg-composer textarea').fill('Tell me a long story about choices and teams.');
      await page.locator('.l5-dock .lg-send').click();
      await page.waitForTimeout(2200);
      await shot('streaming');
      const stop = page.locator('.lg-send.is-stop');
      log('stop shown', await stop.count());
      if (await stop.count()) await stop.click();
      await page.waitForTimeout(1500);
      log('composer after stop', JSON.stringify(await page.locator('.l5-dock .lg-composer textarea').inputValue()));
      log('last reply after stop', JSON.stringify((await page.locator('.l5-a .l5-prose').last().innerText().catch(() => '')).slice(0, 120)));
    }
    if (s === 'ask') {
      const card = page.locator('.l5-stage .lg-node').first();
      await card.click({ force: true }); await page.waitForTimeout(700);
      const askBtn = page.getByRole('menuitem', { name: /ask socria/i }).first();
      log('ask item', await askBtn.count());
      if (await askBtn.count()) { await askBtn.click(); await page.waitForTimeout(700); }
      log('about chip', await page.locator('.l5-dock .lg-about-chip').innerText().catch(() => 'none'));
      log('placeholder', await page.locator('.l5-dock textarea').getAttribute('placeholder'));
    }
    if (s === 'back') { await page.locator('.l5-stage-back').click(); await page.waitForTimeout(600); }
    if (s === 'rail') { await page.locator('.l5-railbtn').click(); await page.waitForTimeout(700); }
    if (s === 'doc') {
      // DOC=path/to/file.pdf — attached, asked about, and opened beside the conversation
      await page.locator('.l5-dock input[type="file"]').setInputFiles(process.env.DOC);
      await page.waitForTimeout(6000);
      log('attachment', await page.locator('.l5-dock .lg-att').allInnerTexts());
      await say('What does this report say about costs?', Number(process.env.TALK_WAIT || 9000));
      log('stage open', await page.locator('.l5-stage').count(), 'doc panel', await page.locator('.l5-stage .doc-key, .l5-stage [data-block]').count());
      log('fx', await page.locator('.l5-fx-chip').allInnerTexts());
    }
    if (s === 'menu') { await page.locator('.l5-head [aria-label="More"]').click(); await page.waitForTimeout(400); }
    if (s === 'scrollup') { await page.locator('.l5-thread').evaluate((t) => (t.scrollTop = 0)); await page.waitForTimeout(500); }
    await shot(s);
  } catch (e) {
    log('step failed', s, String(e).slice(0, 400));
    await shot('fail-' + s);
  }
}
const overflow = await page.evaluate(() => ({ w: document.documentElement.clientWidth, sw: document.documentElement.scrollWidth }));
log('overflow', JSON.stringify(overflow));
log('errors', JSON.stringify(errors.slice(0, 8)));
await browser.close();
