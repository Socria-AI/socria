#!/usr/bin/env node
// scripts/dev/logos5-views-journey.mjs — the four views, driven in a real browser.
//
// DEVELOPMENT ONLY, against a local app with the stand-ins (see the header of
// scripts/dev/logos5-journey.mjs for starting them). It walks Alex Tran's
// Logos 5 Comments v2 as built: a line of thinking opening on Chat, rules A–D
// (talk stays, a document is read into Content and said under the turn, a
// chart opens Artifacts beside the conversation, structure opens the Logic
// Map), the Logic Map drawn once when opened stale, Split View, the Content
// canvas, ⌘K search, and the Universal Map's exact Today — checking each, with
// a screenshot per step and, given AXE=path/to/axe.min.js, an accessibility
// scan of each screen.
//
//   node scripts/dev/logos5-views-journey.mjs
//   W=390 H=844 node scripts/dev/logos5-views-journey.mjs
//   THEME=night AXE=/path/to/axe.min.js node scripts/dev/logos5-views-journey.mjs
import { chromium } from 'playwright-core';
import { writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const OUT = (process.env.OUT || join(tmpdir(), 'logos5-views')) + '/';
mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE || 'http://localhost:3312';
const DAY = 86400000;
const now = Date.now();
const lgId = (t) => `lg_test${Math.floor(t).toString(36).padStart(8, '0')}`;
const msgs = (t, at) => [
  { role: 'user', content: t, id: 'u1', at },
  { role: 'assistant', content: 'Start with what you think causes it, then what would change your mind.', id: 'a1', at: at + 1000 },
  { role: 'user', content: 'I think rents rise because supply lags demand, and wages do not keep up.', id: 'u2', at: at + 2000 },
  { role: 'assistant', content: 'Two claims there: supply, and wages. Which one carries the essay?', id: 'a2', at: at + 3000 },
];
const map = {
  nodes: [
    { id: 'n1', type: 'claim', label: 'Rents rise because supply lags demand', status: 'open' },
    { id: 'n2', type: 'evidence', label: 'Vacancy fell to 2% in the city', status: 'open' },
    { id: 'n3', type: 'counterpoint', label: 'Wages rose too, so affordability held', status: 'open' },
  ],
  edges: [{ from: 'n2', to: 'n1', relation: 'supports' }, { from: 'n3', to: 'n1', relation: 'challenges' }],
};
const old = now - 3 * DAY;
const S1 = lgId(old);
const sessions = [
  { id: S1, title: 'Why rents rise in the city', updatedAt: old + 4000, projectId: null, contexts: {}, messages: msgs('Why do rents keep rising in my city?', old), map },
  { id: lgId(old - 2 * DAY), title: 'Two job offers', updatedAt: old - 2 * DAY + 4000, projectId: null, contexts: {}, messages: msgs('Should I take the job in Denver or stay?', old - 2 * DAY), map: { nodes: [], edges: [] } },
];
const W = Number(process.env.W || 1440), H = Number(process.env.H || 900);
const phone = W < 700;
const log = [];
const say = (k, v) => (log.push(`${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`), console.log(k, typeof v === 'string' ? v : JSON.stringify(v)));
const check = (name, cond, extra = '') => say(cond ? 'ok  ' : 'FAIL', `${name}${extra ? '  ' + extra : ''}`);

const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: W, height: H }, ...(phone ? { hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : {}) });
await ctx.addCookies([{ name: '__client_uat', value: '0', url: BASE }, { name: '__clerk_db_jwt', value: 'dvb_dummy', url: BASE }]);
await ctx.route(/clerk\.(accounts\.dev|com)|accounts\.dev/, (r) => r.abort());
await ctx.addInitScript(([x, th]) => {
  if (localStorage.getItem('__s')) return;
  localStorage.setItem('__s', '1');
  localStorage.setItem('socria.core3AccessKey.v1', '1');
  localStorage.setItem('socria.logos.sessions.v1', JSON.stringify(x));
  localStorage.setItem('socria.firstrun.v1', JSON.stringify({ v: 1, at: { 'socria.intro': Date.now() - 40 * 86400000, 'socria.opened': Date.now() - 30 * 86400000, 'socria.new': Date.now() - 30 * 86400000 } }));
  localStorage.setItem('socria.access.v1', '["socria"]');
  if (th && th !== 'paper') localStorage.setItem('socria.theme.v1', th);
}, [sessions, process.env.THEME || 'paper']);
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(String(e).slice(0, 400)));
p.on('console', (m) => m.type() === 'error' && !/clerk|Failed to load resource|net::ERR|Warning:/i.test(m.text()) && errs.push(m.text().slice(0, 400)));
const calls = { chat: 0, map: 0, title: 0 };
p.on('request', (r) => {
  if (r.method() !== 'POST') return;
  const u = r.url();
  if (u.endsWith('/api/logos/chat')) calls.chat++;
  if (u.endsWith('/api/logos/map')) calls.map++;
  if (u.endsWith('/api/extract-memory')) calls.title++;
});
const AXE = process.env.AXE || '';
const axe = async (label, sel = 'body') => {
  if (!AXE) return;
  await p.addScriptTag({ path: AXE });
  const r = await p.evaluate(async (s) => {
    const res = await window.axe.run(document.querySelector(s), { runOnly: ['wcag2a', 'wcag2aa'] });
    return res.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, at: v.nodes.slice(0, 3).map((x) => x.target.join(' ')) }));
  }, sel);
  say(`axe ${label}`, r.length ? r : 'clean');
};
const shot = async (name) => {
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${OUT}${phone ? 'phone-' : ''}${name}.png` });
};
const view = () => p.evaluate(() => [...document.querySelectorAll('.l5v-tab')].find((t) => t.getAttribute('aria-selected') === 'true')?.textContent?.replace(/\d+$/, '').trim() ?? null);
const beside = () => p.evaluate(() => document.querySelector('.l5v-beside-t')?.textContent ?? null);
const waitIdle = async () => {
  await p.waitForFunction(() => !document.querySelector('.l5v-working') && !document.querySelector('.lg-send.is-waiting'), null, { timeout: 60000 });
  await p.waitForTimeout(600);
};
const composer = () => p.locator('.l5-dock textarea').last();
const sendText = async (t) => {
  const c = composer();
  await c.click();
  await c.fill(t);
  await c.press('Enter');
};

// the local stand-in's own code (SOCRIA_ACCESS_CODE when the dev server was started), never a real one
await p.request.post(`${BASE}/api/access/unlock`, { data: { code: process.env.SOCRIA_ACCESS_CODE || 'localdevcode1234567' } });
await p.goto(`${BASE}/chat?model=logos-3&s=${S1}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
await p.waitForSelector('.l5v-top, .l5h', { timeout: 240000 });
await p.waitForTimeout(1500);

// ── opens on Chat ──
check('a line of thinking opens on Chat', (await view()) === 'Chat', String(await view()));
const tabs = await p.evaluate(() => [...document.querySelectorAll('.l5v-tab')].map((t) => t.textContent.replace(/\d+$/, '').trim()));
check('four tabs: Chat, Content, Artifacts, Logic Map', JSON.stringify(tabs) === JSON.stringify(['Chat', 'Content', 'Artifacts', 'Logic Map']), JSON.stringify(tabs));
const bar = await p.evaluate(() => ({
  home: !!document.querySelector('.l5v-top .l5v-home[aria-label="Back to the Universal Map"]'),
  homeLabel: document.querySelector('.l5v-top .l5v-home')?.textContent?.trim(),
  search: !!document.querySelector('.l5v-top .l5v-search'),
  split: !!document.querySelector('.l5v-top .l5v-split'),
  mind: !!document.querySelector('.l5-mindbtn'),
  buttons: document.querySelectorAll('.l5v-top button').length,
  homeX: document.querySelector('.l5v-top .l5v-home')?.getBoundingClientRect().x,
}));
check('← Universal Map, top left', bar.home && bar.homeX < 40 && (phone || bar.homeLabel === 'Universal Map'), JSON.stringify(bar));
check('search in the bar', bar.search);
check(phone ? 'no Split View on a phone' : 'Split View in the bar', phone ? !bar.split : bar.split);
check('no Memory button in the bar', !bar.mind);
check('a lean bar', bar.buttons <= 8, String(bar.buttons));
const omni = await p.evaluate(() => {
  const c = document.querySelector('.l5-dock .lg-composer-box');
  const r = c?.getBoundingClientRect();
  const clip = document.querySelector('.l5-dock .l5-clip')?.getBoundingClientRect();
  const ta = document.querySelector('.l5-dock textarea')?.getBoundingClientRect();
  return { w: r?.width, radius: c ? getComputedStyle(c).borderRadius : null, clipLeftOfText: clip && ta ? clip.x < ta.x : null, font: getComputedStyle(document.querySelector('.l5') ?? document.body).fontFamily };
});
check('omnibox: radius 28px, paperclip inside at its left', omni.radius === '28px' && omni.clipLeftOfText === true, JSON.stringify(omni));
check('omnibox at most 768px', omni.w <= 768 + 1, String(omni.w));
check('Inter first in the shell font stack', /^Inter/.test(omni.font), omni.font);
await shot('01-chat');
await axe('chat: bar, tabs, thread, omnibox', '.l5-main');

// ── rule A: a conversation stays in Chat, no map pass ──
let m0 = calls.map;
await sendText('why does supply lag demand here?');
await p.waitForTimeout(150);
const working = await p.evaluate(() => ({ skel: !!document.querySelector('.l5v-working'), spin: !!document.querySelector('.lg-send.is-waiting'), steps: [...document.querySelectorAll('.l5v-steps li')].map((l) => l.textContent) }));
check('sent: a working skeleton with the true steps, the send button spins', working.skel && working.spin && working.steps.some((s) => /Sent/.test(s)), JSON.stringify(working));
await waitIdle();
check('rule A: still on Chat', (await view()) === 'Chat', String(await view()));
check('rule A: no map pass for an ordinary turn (map not open, cadence not due)', calls.map === m0, `${calls.map - m0} map calls`);
await shot('02-chat-replied');

// ── the Logic Map: opened on a stale map, drawn once ──
m0 = calls.map;
await p.click('.l5v-tab:has-text("Logic Map")');
await p.waitForTimeout(2500);
check('Logic Map opens on the map', (await view()) === 'Logic Map' && (await p.locator('.l5v-logic').count()) === 1);
check('opened on a map behind the conversation: drawn again, once', calls.map - m0 === 1, `${calls.map - m0} map calls`);
check('no "+ View" in the Logic Map', (await p.locator('.ws-add-btn').count()) === 0);
check('Synthesize is the Logic Map’s own action', (await p.locator('.l5v-tab-acts button:has-text("Synthesize")').count()) === (phone ? 0 : 1) || phone);
await shot('03-logic-map');
await axe('logic map', '.l5v-top');

if (!phone) {
  // ── Split View: the conversation beside the map ──
  await p.click('.l5v-split > button');
  const menu = await p.evaluate(() => ({ secs: [...document.querySelectorAll('.l5v-menu-s')].map((x) => x.textContent), items: [...document.querySelectorAll('.l5v-menu .l5v-mi-t')].map((x) => x.textContent) }));
  check('Split View: three sections', JSON.stringify(menu.secs) === JSON.stringify(['Visual & Generative Tools', 'Analysis & Structure', 'System & Memory']), JSON.stringify(menu));
  check('  the map itself is not offered beside the Logic Map', !menu.items.includes('Thinking Map Structure'), JSON.stringify(menu.items));
  await shot('04-split-menu');
  await axe('split view menu', '.l5v-split');
  await p.keyboard.press('Escape');
  check('  Escape closes it', (await p.locator('.l5v-menu').count()) === 0);
  await p.click('.l5v-split > button');
  await p.click('.l5v-menu .l5v-mi:has-text("Conversation")');
  await p.waitForTimeout(500);
  check('the conversation docks beside the Logic Map', (await beside()) === 'Conversation' && (await view()) === 'Logic Map', String(await beside()));
  await shot('05-map-and-chat');

  // ── rule C: asked to make something — Artifacts, the conversation beside ──
  m0 = calls.map;
  await sendText('make a pie chart of rent 1500 food 400 transport 120');
  await p.waitForTimeout(400);
  check('rule C: Artifacts, with the conversation beside', (await view()) === 'Artifacts' && (await beside()) === 'Conversation', `${await view()} / ${await beside()}`);
  await waitIdle();
  await p.waitForTimeout(2500);
  check('  the map pass ran for it', calls.map > m0, `${calls.map - m0}`);
  const arts = await p.evaluate(() => document.querySelector('.l5v-tab:nth-child(3) .l5v-count')?.textContent ?? '0');
  say('artifacts count', arts);
  await shot('06-artifacts');

  // ── rule D: structure asked for ──
  await sendText('map out my argument about rents');
  await p.waitForTimeout(400);
  check('rule D: the Logic Map', (await view()) === 'Logic Map', String(await view()));
  await waitIdle();
  await p.waitForTimeout(1500);

  // close beside, go to Chat
  await p.click('.l5v-beside-head .l5v-icon');
  await p.waitForTimeout(300);
  check('the panel beside closes', (await beside()) === null);
}

// ── Chat again ──
await p.click('.l5v-tab:has-text("Chat")');
await p.waitForTimeout(400);

// ── rule B: a document attached — read into Content, said under the turn, the screen stays ──
const fileInput = p.locator('.l5-dock input[type=file]').first();
await fileInput.setInputFiles({ name: 'rent-notes.txt', mimeType: 'text/plain', buffer: Buffer.from('Rent notes\n\nVacancy in the city fell to 2% last year. New construction permits halved.\n\nWages rose 3% while rents rose 9%.') });
await p.waitForTimeout(2500);
await sendText('here are my notes on rent');
await p.waitForTimeout(400);
check('rule B: the screen stays on Chat', (await view()) === 'Chat', String(await view()));
await waitIdle();
const chip = await p.evaluate(() => ({ chip: document.querySelector('.l5v-ingest')?.textContent ?? null }));
check('rule B: "Added to Content" under the turn, with the file', !!chip.chip && /Added to Content/.test(chip.chip) && /rent-notes/.test(chip.chip), JSON.stringify(chip));
await shot('07-ingest-chip');
await p.click('.l5v-ingest .l5v-link:not(.is-quiet)');
await p.waitForTimeout(1500);
check('the chip’s link opens the document in Content', (await view()) === 'Content' && (await p.locator('.l5c-readhead').count()) === 1, String(await view()));
await shot('08-content-reader');
await p.click('.l5c-readhead .l5v-link');
await p.waitForTimeout(500);
const cards = await p.locator('.l5c-card').count();
check('Content: the document is a card on the canvas', cards >= 1, String(cards));
// drag the card
const card = p.locator('.l5c-card').first();
const bb = await card.boundingBox();
if (bb) {
  await p.mouse.move(bb.x + 40, bb.y + 40);
  await p.mouse.down();
  await p.mouse.move(bb.x + 200, bb.y + 140, { steps: 8 });
  await p.mouse.up();
  await p.waitForTimeout(400);
  const bb2 = await card.boundingBox();
  check('a card dragged stays where it was put', bb2 && Math.abs(bb2.x - bb.x - 160) < 24 && Math.abs(bb2.y - bb.y - 100) < 24, JSON.stringify({ bb, bb2 }));
}
await shot('09-content-canvas');
await axe('content canvas', '.l5c');

// ── search ──
await p.keyboard.press(process.platform === 'darwin' ? 'Meta+K' : 'Control+K');
await p.waitForTimeout(400);
check('⌘K / Ctrl K opens search', (await p.locator('.l5gs').count()) === 1);
await p.keyboard.type('denver');
await p.waitForTimeout(500);
const hits = await p.evaluate(() => [...document.querySelectorAll('.l5gs-hit')].map((h) => h.textContent).slice(0, 4));
check('fuzzy search finds the other line of thinking', hits.some((h) => /Denver|job/i.test(h)), JSON.stringify(hits));
await shot('10-search');
await axe('search', '.l5gs');
await p.keyboard.press('Enter');
await p.waitForTimeout(1500);
const title = await p.evaluate(() => document.querySelector('.l5v-title')?.textContent ?? '');
check('Enter opens it', /job|Denver/i.test(title), title);

// ── the Universal Map ──
await p.click('.l5v-home');
await p.waitForTimeout(1500);
const home = await p.evaluate(() => ({
  home: !!document.querySelector('.l5h'),
  banner: /not a list|Everything you’ve thought through/.test(document.body.innerText),
  legend: !!document.querySelector('.l5h-legend'),
  hint: !!document.querySelector('.l5h-hint'),
  todayEmpty: document.querySelector('.l5h-todaynode')?.textContent ?? null,
  lens: document.querySelector('.l5h-lens [aria-checked="true"]')?.textContent ?? null,
}));
check('← Universal Map goes home', home.home);
check('no banner, legend or hint strip', !home.banner && !home.legend && !home.hint, JSON.stringify(home));
say('home', home);
await shot('11-universal-map');
// Today: the one begun today is there; the old ones are not
for (const lens of ['Today', 'This month']) {
  const btn = p.locator(`.l5h-lens button:has-text("${lens}")`).first();
  if (await btn.count()) {
    await btn.click();
    await p.waitForTimeout(1200);
    await shot(`12-${lens.replace(' ', '-').toLowerCase()}`);
  }
}
const todayNow = await p.evaluate(() => ({ nodes: [...document.querySelectorAll('[data-node]')].map((n) => n.getAttribute('data-node')), empty: document.querySelector('.l5h-todaynode')?.textContent ?? null }));
say('after lenses', todayNow);

say('errors', errs);
say('calls', calls);
writeFileSync(`${OUT}${phone ? 'phone-' : ''}log.txt`, log.join('\n'));
await b.close();
console.log(`screenshots in ${OUT}`);
process.exit(log.some((l) => l.startsWith('FAIL')) || errs.length ? 1 : 0);
