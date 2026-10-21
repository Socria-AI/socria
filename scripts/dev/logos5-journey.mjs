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
//   W=1440 H=900 STEPS=talk,talk2,chart,stage,card,cardask,esc,convo,retry,edit,stop node scripts/dev/logos5-journey.mjs
//   W=390 H=844 STEPS=talk,chart,stage,convo,card node scripts/dev/logos5-journey.mjs
//   STUDY_FILES=ch5.pdf,review.pdf STEPS=intake,board,topic,practice,fill,check,more,why,universe,reload node scripts/dev/logos5-journey.mjs
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
await page.waitForSelector('.lg-composer textarea, .l5s-ask textarea, .l5h', { timeout: 90000 }).catch(() => console.log('no composer'));
await page.waitForTimeout(1200);
for (let i = 0; i < 3; i++) { const sk = page.getByRole('button', { name: /^skip/i }); if (await sk.count()) { await sk.first().click().catch(() => {}); await page.waitForTimeout(1000); } }
await page.addStyleTag({ content: '.env-badge{display:none!important}' });
const shot = (n) => page.screenshot({ path: `${SP}/${PFX}-${n}-${width}.png` });
const say = async (text, wait = 7000) => {
  // a new line of thinking opens on the intake; a question asked there is the conversation's first turn
  if (await page.locator('.l5s-ask textarea').count()) {
    await page.locator('.l5s-ask textarea').fill(text);
    await page.locator('.l5s-go').click();
  } else {
    await page.locator('.l5-dock .lg-composer textarea').fill(text);
    await page.locator('.l5-dock .lg-send').click();
  }
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
    // the views, by name (VIEW=Components|Artifacts|Logic Map): the switch in the header, or the tabs on a phone
    const view = async (name) => {
      await page.locator('.l5-switch-i', { hasText: name }).first().click();
      await page.waitForTimeout(1000);
    };
    if (s === 'stage') await view('Logic Map');
    if (s === 'view') await view(process.env.VIEW || 'Components');
    if (s === 'arts') { await view('Artifacts'); log('artifacts', await page.locator('.l5s-art-pill').allInnerTexts(), '|', await page.locator('.l5s-art-eyebrow').innerText().catch(() => 'none')); }
    // the conversation: folded away to the map's composer, or open beside it
    if (s === 'convo') {
      if (width < 700) await page.locator('.l5x-sheet-row .l5x-link').click();
      else await page.locator('.l5-unibtn.is-convo').click();
      await page.waitForTimeout(800);
      log('convo open', await page.locator('.l5x.has-convo').count() === 1, 'omni', await page.locator('.l5x-omni').count(), 'peek', await page.locator('.l5x-peek').count());
    }
    if (s === 'card') {
      const card = page.locator('.l5x-canvas .lg-node').first();
      log('cards', await page.locator('.l5x-canvas .lg-node').count());
      await card.click(); await page.waitForTimeout(900);
      log('ask', (await page.locator('.l5-ask').innerText().catch(() => 'none')).replace(/\s+/g, ' ').slice(0, 300));
      log('linked msgs', await page.locator('.l5-msg.is-linked').count());
    }
    if (s === 'cardask') {
      await page.locator('.l5-ask-in input').fill(process.env.ASK || 'Why does this one matter?');
      await page.locator('.l5-ask-go').click();
      await page.waitForTimeout(Number(process.env.TALK_WAIT || 8000));
      log('ask after', (await page.locator('.l5-ask').innerText().catch(() => 'closed')).replace(/\s+/g, ' ').slice(0, 300));
      log('last user', (await page.locator('.l5-u.is-mine .l5-said').last().innerText().catch(() => '')).slice(0, 140));
    }
    if (s === 'esc') { await page.keyboard.press('Escape'); await page.waitForTimeout(500); }
    if (s === 'mind') {
      await page.locator('.l5-mindbtn').first().click();
      await page.waitForTimeout(1500);
      log('mind', (await page.locator('.l5m').innerText().catch(() => 'none')).replace(/\s+/g, ' ').slice(0, 300));
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
      const card = page.locator('.l5x-canvas .lg-node').first();
      await card.click({ force: true }); await page.waitForTimeout(700);
      const askBtn = page.getByRole('menuitem', { name: /ask socria/i }).first();
      log('ask item', await askBtn.count());
      if (await askBtn.count()) { await askBtn.click(); await page.waitForTimeout(700); }
      log('about chip', await page.locator('.l5-dock .lg-about-chip').innerText().catch(() => 'none'));
      log('placeholder', await page.locator('.l5-dock textarea').getAttribute('placeholder'));
    }
    // ── the study path (STUDY_FILES=a.pdf,b.pdf) ──
    if (s === 'intake') {
      const files = (process.env.STUDY_FILES || '').split(',').filter(Boolean);
      await page.locator('.l5s-drop input[type="file"]').setInputFiles(files);
      await page.locator('.l5s-ask textarea').fill('help me get ready for exam 2 on thursday');
      await page.waitForFunction(() => document.querySelectorAll('.l5s-file.is-ready').length >= 1 && !document.querySelector('.l5s-file.is-reading'), null, { timeout: 60000 });
      log('files', await page.locator('.l5s-file').allInnerTexts());
      log('intent', await page.locator('.l5s-intent').innerText().catch(() => 'none'));
      await page.waitForTimeout(800);
      await shot('intake-in');
      await page.locator('.l5s-go').click();
      await page.waitForSelector('.l5s-card', { timeout: 60000 });
      await page.waitForTimeout(800);
    }
    if (s === 'board') {
      log('cards', await page.locator('.l5s-card').count(), 'links', await page.locator('.l5s-links path').count());
      log('start', await page.locator('.l5s-card.is-start .l5s-card-title').innerText().catch(() => 'none'));
      log('panel', await page.locator('.l5s-start-k').innerText().catch(() => 'none'));
      log('view', await page.locator('.l5-switch-i.is-on').innerText().catch(() => 'none'));
      await shot('board');
    }
    if (s === 'topic') {
      await page.locator('.l5s-card').nth(Number(process.env.TOPIC || 2)).click();
      await page.waitForTimeout(600);
      log('inspector', (await page.locator('.l5s-insp').innerText().catch(() => 'none')).slice(0, 400));
      log('dimmed', await page.locator('.l5s-card.is-dim').count());
      log('about chip', await page.locator('.l5-dock .lg-about-chip').innerText().catch(() => 'none'));
      await shot('topic');
    }
    if (s === 'practice') {
      await page.locator('.l5s-act.is-primary').click();
      await page.waitForSelector('.l5s-practice', { timeout: 30000 });
      await page.waitForTimeout(600);
      log('practice', await page.locator('.l5s-pr-t').innerText(), '|', await page.locator('.l5s-pr-count').innerText().catch(() => ''));
      log('events', await page.locator('.l5s-jev-t > span:first-child').allInnerTexts());
      await shot('practice');
    }
    if (s === 'fill') {
      const put = async (label, v) => page.getByLabel(label).first().fill(v);
      const ins = page.locator('.l5s-jtable input');
      const n = await ins.count();
      // first event right, second partly wrong
      const vals = ['Wages Expense', '1200', '', 'Wages Payable', '', '1,200', 'Rent Expense', '1000', '', 'Prepaid Rent', '1000', ''];
      for (let i = 0; i < Math.min(n, vals.length); i++) if (vals[i]) await ins.nth(i).fill(vals[i]);
      void put;
      if (await page.getByLabel('Liabilities').count()) {
        await page.getByLabel('Liabilities').fill('10,300');
        await page.getByLabel('Equity').fill('14,000');
      }
      await page.locator('.l5s-hintbtn').first().click();
      await page.waitForTimeout(500);
      log('hint', await page.locator('.l5s-hint').first().innerText().catch(() => 'none'));
      log('count', await page.locator('.l5s-pr-count').innerText().catch(() => ''));
      await shot('fill');
      await page.locator('.l5s-hintbtn').first().click();
    }
    if (s === 'check') {
      await page.locator('.l5s-go', { hasText: 'Check my answers' }).click();
      await page.waitForTimeout(800);
      log('result', await page.locator('.l5s-side-card.is-result').innerText().catch(() => 'none'));
      log('gaps', (await page.locator('.l5s-gaps').innerText().catch(() => 'none')).slice(0, 500));
      log('wrong rows', await page.locator('.l5s-jtable tr.is-no').count());
      await shot('checked');
    }
    if (s === 'more') {
      await page.locator('.l5s-btn', { hasText: 'Try 3 more' }).click();
      await page.waitForTimeout(3000);
      log('more', await page.locator('.l5s-pr-t').innerText().catch(() => ''), '|', await page.locator('.l5s-pr-count').innerText().catch(() => ''));
      await shot('more');
    }
    if (s === 'why') {
      await page.locator('.l5s-btn', { hasText: 'Why?' }).click();
      await page.waitForTimeout(9000);
      log('view', await page.locator('.l5-switch-i.is-on').innerText().catch(() => ''));
      log('map', await page.locator('.l5x-canvas .lg-map').count(), 'last user', (await page.locator('.l5-u.is-mine .l5-said').last().innerText().catch(() => '')).slice(0, 140));
      await shot('why');
    }
    if (s === 'tab1') { await page.locator('.l5-switch-i').first().click(); await page.waitForTimeout(700); }
    if (s === 'askwhy') {
      await page.locator('.l5s-act', { hasText: 'Ask why' }).click();
      await page.waitForTimeout(9000);
      log('view', await page.locator('.l5-switch-i.is-on').innerText().catch(() => ''), 'cards on map', await page.locator('.l5x-canvas .lg-node').count());
      log('asked', (await page.locator('.l5-u.is-mine .l5-said').last().innerText().catch(() => '')).slice(0, 160));
      log('reply', (await page.locator('.l5-a .l5-prose').last().innerText().catch(() => '')).slice(0, 160));
    }
    // home, the Universal Map: the mark brings it back; "Find or start…" finds, or begins a line of thinking
    const goHome = async () => {
      if (!(await page.locator('.l5h').count())) {
        await page.locator('.l5-brand').click();
        await page.waitForTimeout(900);
      }
    };
    const findBox = () => page.locator('.l5h-find input').first();
    const startWith = async (text) => {
      await goHome();
      await findBox().click();
      await findBox().fill(text);
      await page.waitForTimeout(250);
      await page.locator('.l5h-o.is-start').first().click();
    };
    if (s === 'new') {
      await goHome();
      await findBox().click();
      await page.locator('.l5h-o.is-start').first().click();
      await page.waitForTimeout(1000);
    }
    if (s === 'start') await (async () => { await startWith(process.env.START || 'Should I take the job in Austin?'); await page.waitForTimeout(Number(process.env.TALK_WAIT || 7000)); })();
    // SEED="a|b|c" — a line of thinking begun with each, from the find box
    if (s === 'seed') {
      for (const text of (process.env.SEED || 'Should I rent or buy a flat?|Plan a launch for the new app|Is my startup idea any good?|Rent or buy, again: the monthly runway|Should I learn Rust or Go next?').split('|')) {
        await startWith(text);
        await page.waitForTimeout(Number(process.env.TALK_WAIT || 6500));
      }
    }
    if (s === 'state') {
      log('state: title', await page.locator('.l5-title').innerText().catch(() => ''), '| intake', await page.locator('.l5s-drop').count(), '| home', await page.locator('.l5h').count(), '| rail', JSON.stringify((await page.locator('.lg-railhost').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300)));
    }
    const homeSays = async () =>
      JSON.stringify({
        eyebrow: await page.locator('.l5-eyebrow').first().innerText().catch(() => ''),
        frames: await page.locator('.l5h-frame').count(),
        tiles: await page.locator('.l5h-tile').count(),
        cards: await page.locator('.l5h-card').count(),
        ideas: await page.locator('.l5h-idea').allInnerTexts(),
        resume: await page.locator('.l5h-pick-t').innerText().catch(() => ''),
        starred: await page.locator('.l5h-starchip').count(),
        notes: await page.locator('.l5h-note').count(),
        rail: await page.locator('.l5:not(.rail-closed) > .lg-railhost').count(),
      });
    if (s === 'home') {
      await page.locator('.l5-brand').click();
      await page.waitForTimeout(1400);
      log('home', await homeSays());
    }
    if (s === 'find') {
      await findBox().fill(process.env.FIND || 'rent');
      await page.waitForTimeout(500);
      log('find', await page.locator('.l5h-find-n').innerText().catch(() => ''), 'options', JSON.stringify(await page.locator('.l5h-o').allInnerTexts()), 'dimmed', await page.locator('.l5h-tile.is-dim').count());
      await shot('find-in');
      await findBox().fill('');
      await page.keyboard.press('Escape');
    }
    if (s === 'list') {
      await page.locator('.l5-unibtn.is-list').click();
      await page.waitForTimeout(700);
      log('contents', (await page.locator('.l5c').innerText().catch(() => 'none')).replace(/\s+/g, ' ').slice(0, 300));
      await shot('list-in');
      await page.locator('.l5-unibtn.is-list').click();
      await page.waitForTimeout(500);
      log('contents closed', await page.locator('.l5c').count() === 0);
    }
    // the three ways to see it: MODE=Map|Columns|Timeline
    if (s === 'mode') {
      await page.locator('.l5h-seg.is-modes button', { hasText: process.env.MODE || 'Columns' }).click();
      await page.waitForTimeout(900);
      log('mode', process.env.MODE || 'Columns', await homeSays(), 'columns', await page.locator('.l5h-col').count(), 'lanes', await page.locator('.l5h-tl-lane').count());
    }
    if (s === 'press') {
      const tile = page.locator('.l5h-tile, .l5h-card').nth(Number(process.env.NTH || 0));
      // a large card opens when pressed; its ⋯ shows its card
      if (await tile.locator('.l5h-more').count()) await tile.locator('.l5h-more').click();
      else await tile.click();
      await page.waitForTimeout(700);
      log('card', (await page.locator('.l5h-pv').innerText().catch(() => 'none')).replace(/\s+/g, ' ').slice(0, 300));
    }
    if (s === 'star') { await page.locator('.l5h-pv .l5h-btn', { hasText: 'Star' }).click(); await page.waitForTimeout(500); log('starred chips', await page.locator('.l5h-starchip').allInnerTexts()); }
    if (s === 'hide') { await page.locator('.l5h-pv .l5h-btn', { hasText: 'Hide' }).click(); await page.waitForTimeout(500); log('after hide', await homeSays(), 'said', await page.locator('.l5h-said').innerText().catch(() => '')); }
    if (s === 'undo') { await page.locator('.l5h-tool[aria-label="Undo"]').click(); await page.waitForTimeout(500); log('after undo', await homeSays()); }
    if (s === 'viewmenu') {
      await page.locator('.l5h-viewbtn').click();
      await page.waitForTimeout(500);
      log('view menu', (await page.locator('.l5h-vm').innerText().catch(() => 'none')).replace(/\s+/g, ' ').slice(0, 400));
      await shot('view-in');
      await page.keyboard.press('Escape');
    }
    if (s === 'note') {
      const box = await page.locator('.l5h-map').boundingBox();
      await page.mouse.dblclick(box.x + box.width * 0.72, box.y + box.height * 0.82);
      await page.waitForTimeout(400);
      await page.keyboard.type(process.env.NOTE || 'decide by Friday');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(500);
      log('notes', await page.locator('.l5h-note').allInnerTexts());
    }
    // DRAG=from index; a tile carried 280px right and 60px down
    if (s === 'drag') {
      const t = page.locator('.l5h-tile').nth(Number(process.env.NTH || 0));
      const b = await t.boundingBox();
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.down();
      for (let i = 1; i <= 12; i++) await page.mouse.move(b.x + b.width / 2 + i * 24, b.y + b.height / 2 + i * 5);
      await page.mouse.up();
      await page.waitForTimeout(600);
      const after = await t.boundingBox();
      log('dragged', JSON.stringify({ from: [Math.round(b.x), Math.round(b.y)], to: [Math.round(after.x), Math.round(after.y)] }));
    }
    // Select, then drag across the first two conversations from inside their frame
    if (s === 'lasso') {
      await page.locator('.l5h-tool', { hasText: 'Select' }).click();
      const a = await page.locator('.l5h-tile').nth(0).boundingBox();
      const b = await page.locator('.l5h-tile').nth(1).boundingBox();
      await page.mouse.move(a.x - 8, a.y + 10);
      await page.mouse.down();
      for (let i = 1; i <= 10; i++) await page.mouse.move(a.x - 8 + ((b.x + b.width - 10 - (a.x - 8)) * i) / 10, a.y + 10 + ((b.y + b.height - 10 - (a.y + 10)) * i) / 10);
      await page.mouse.up();
      await page.waitForTimeout(500);
      log('chosen', (await page.locator('.l5h-bar-sel').innerText().catch(() => 'none')).replace(/\s+/g, ' '));
      await shot('lasso-in');
      await page.keyboard.press('Escape');
      await page.locator('.l5h-tool', { hasText: 'Select' }).click();
    }
    if (s === 'arrows') {
      await page.locator('.l5h-map').focus();
      for (const k of ['ArrowRight', 'ArrowRight', 'ArrowDown']) await page.keyboard.press(k);
      await page.waitForTimeout(300);
      log('chosen by keys', await page.locator('.l5h-tile.is-sel .l5h-tile-t').allInnerTexts());
    }
    if (s === 'openmap') {
      const first = page.locator('.l5h-tile, .l5h-card').first();
      await first.click();
      await page.waitForTimeout(500);
      await page.locator('.l5h-pv .l5h-go').click();
      await page.waitForTimeout(1500);
      log('opened', await page.locator('.l5-title').innerText().catch(() => ''), 'home gone', (await page.locator('.l5h').count()) === 0);
    }
    if (s === 'reload') {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.l5s-card, .l5-thread, .l5s-ask, .l5h', { timeout: 90000 });
      await page.waitForTimeout(1500);
      log('after reload: cards', await page.locator('.l5s-card').count(), 'view', await page.locator('.l5-switch-i.is-on').innerText().catch(() => 'none'));
      await shot('reload');
    }
    if (s === 'probe') {
      // PROBE=".sel1|.sel2" — what the browser computed for each, for chasing a layout fault
      for (const sel of (process.env.PROBE || '').split('|').filter(Boolean)) {
        log('probe', sel, JSON.stringify(await page.evaluate((q) => {
          const el = document.querySelector(q);
          if (!el) return null;
          const c = getComputedStyle(el), r = el.getBoundingClientRect();
          return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), display: c.display, opacity: c.opacity, visibility: c.visibility, color: c.color, bg: c.backgroundColor, maxHeight: c.maxHeight, height: c.height, overflow: c.overflow, position: c.position, clip: c.webkitLineClamp };
        }, sel)));
      }
    }
    if (s === 'rail') { await page.locator('.l5-railbtn').click(); await page.waitForTimeout(700); }
    if (s === 'doc') {
      // DOC=path/to/file.pdf — attached, asked about, and opened beside the conversation
      await page.locator('.l5-dock input[type="file"]').setInputFiles(process.env.DOC);
      await page.waitForTimeout(6000);
      log('attachment', await page.locator('.l5-dock .lg-att').allInnerTexts());
      await say('What does this report say about costs?', Number(process.env.TALK_WAIT || 9000));
      log('view', await page.locator('.l5-switch-i.is-on').innerText().catch(() => ''), 'doc panel', await page.locator('.l5x-canvas .doc-key, .l5x-canvas [data-block]').count());
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
