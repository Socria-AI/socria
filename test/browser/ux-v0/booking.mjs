// A booking screen that works, in a real browser: each of the five compositions (strip, calendar, list,
// split, immersive), by mouse, by keyboard, inside the sandboxed frame's CSP, and on a phone.
//
// It checks what a person does, not markup: confirming with nothing chosen says so and books nothing;
// choosing a time enables the action and names the choice; confirming shows it is working, then the
// confirmation (which names the time and says no booking was made) with focus moved to it; "change the
// time" goes back; full times cannot be chosen; the audit's self-test finds nothing wrong; nothing
// scrolls sideways at 390 px; no console errors. Screenshots go to UXV0_OUT for a person to look at.
//
// Needs test/.tmp (node test/run.mjs builds it). No app server and no network: images come from fx/.
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { chromium, S, FX, underTest } from './env.mjs';

const V = await underTest();
let pass = 0;
let fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok  ', n)) : (fail++, console.log('  FAIL', n, x)));

const brief0 = V.normalizeBrief({ pageType: 'website', platform: 'web', objective: 'Let members book a time for their yoga class', audience: 'Members of a small yoga studio', personality: ['warm', 'earthy', 'calm'], visualDirection: 'Warm, earthy, muted terracotta and cream', palette: [{ hex: '#f4ede4', role: 'background' }, { hex: '#2b211b', role: 'text' }, { hex: '#b4552d', role: 'accent' }, { hex: '#ffffff', role: 'accent-text' }], typography: { display: 'Fraunces', body: 'Inter', rationale: '' }, userGoals: [], functionalRequirements: [], openQuestions: [], references: ['openverse:window'] }, null);
const intent = V.settleIntent('Booking screen for a yoga studio.');
const brief = { ...brief0, intent, pageType: V.pageTypeFor(intent, brief0.pageType) };
const dirs = V.proposeDirections({ brief });
const board = V.normalizeMoodboard({ refs: [{ provider: 'openverse', providerId: 'window', id: 'openverse:window', url: 'https://images.example.test/window.jpg', thumb: 'https://images.example.test/window.jpg', width: 1600, height: 1067, title: 'window', creator: 'A', sourceUrl: 'https://example.org/w', license: 'CC BY 2.0', licenseUrl: '', attribution: 'w', category: 'imagery', state: 'kept', asContent: true }] });

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.route('**/*', (r) => {
  const u = r.request().url();
  if (u.startsWith('https://images.example.test/')) return r.fulfill({ contentType: 'image/jpeg', body: readFileSync(FX + u.split('/').pop()) });
  if (u.startsWith('data:') || u.startsWith('about:')) return r.continue();
  return r.abort(); // fonts and anything else: offline, as a test should be
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));

console.log('a booking that works, in each composition');
for (const variant of ['strip', 'calendar', 'list', 'split', 'immersive']) {
  const dir = { ...dirs[0], compose: { booking: variant } };
  const spec0 = V.studySpec(dir, brief, 'Yoga studio', board.refs);
  const spec = { ...spec0, sections: spec0.sections.map((s) => (s.kind === 'booking' ? { ...s, variant, images: variant === 'immersive' ? ['openverse:window'] : [] } : s)) };
  const html = V.renderDesign(spec, board.refs, { runtime: true }).html;
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.setContent(html, { waitUntil: 'load' });
  ok(`${variant}: drawn as this composition`, (await page.locator(`.bk-${variant}`).count()) === 1);
  ok(`${variant}: the action starts not ready`, (await page.getAttribute('[data-ux-confirm]', 'aria-disabled')) === 'true');
  // a person can still press it (aria-disabled, not disabled): it must say why nothing happened
  await page.click('[data-ux-confirm]', { force: true });
  ok(`${variant}: confirming with no time says so, and books nothing`, (await page.isVisible('[data-ux-error]')) && !(await page.isVisible('[data-ux-done]')));
  const slot = page.locator('.bk-times:not([hidden]) .bk-slot:not(.is-full)').first();
  const time = (await slot.locator('.bk-time').textContent()).trim();
  await slot.click();
  ok(`${variant}: choosing a time (a click on it) enables the action and names the choice`, (await page.getAttribute('[data-ux-confirm]', 'aria-disabled')) === 'false' && (await page.textContent('[data-ux-bind="choice"]')).includes(time) && !(await page.isVisible('[data-ux-error]')));
  await page.mouse.move(2, 2);
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${S}booking-${variant}-chosen.png` });
  await page.click('[data-ux-confirm]');
  ok(`${variant}: confirming shows that it is working`, (await page.getAttribute('[data-ux-confirm]', 'aria-busy')) === 'true');
  await page.waitForSelector('[data-ux-done]:not([hidden])', { timeout: 3000 });
  const done = (await page.textContent('[data-ux-done]')).replace(/\s+/g, ' ');
  ok(`${variant}: the confirmation names the time, says no booking was made, and has focus`, done.includes(time) && /no booking was made/i.test(done) && (await page.evaluate(() => document.activeElement?.hasAttribute('data-ux-done'))) && !(await page.isVisible('[data-ux-booking-form]')));
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${S}booking-${variant}-done.png` });
  await page.click('[data-ux-change]');
  ok(`${variant}: "change the time" goes back to the choice`, (await page.isVisible('[data-ux-booking-form]')) && !(await page.isVisible('[data-ux-done]')));
  ok(`${variant}: full times cannot be chosen`, await page.evaluate(() => [...document.querySelectorAll('.bk-slot.is-full input')].every((i) => i.disabled)));
  const self = await page.evaluate(() => window.__uxBehaviors.selfTest());
  ok(`${variant}: the audit's self-test finds it working`, self.length === 1 && !self[0].problems.length, JSON.stringify(self));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.setContent(html, { waitUntil: 'load' });
  ok(`${variant}: nothing scrolls sideways on a phone`, (await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0);
  const small = await page.evaluate(() => [...document.querySelectorAll('.bk-slot:not(.is-full), .bk-day:not(.is-closed), [data-ux-confirm]')].filter((e) => e.offsetParent).map((e) => e.getBoundingClientRect()).filter((r) => r.height < 44).length);
  ok(`${variant}: every day, time and the action are at least 44 px tall on a phone`, small === 0, `${small} smaller`);
  await page.screenshot({ path: `${S}booking-${variant}-phone.png`, fullPage: true });
}

console.log('by keyboard alone');
{
  await page.setViewportSize({ width: 1280, height: 900 });
  const dir = { ...dirs[0], compose: { booking: 'strip' } };
  await page.setContent(V.renderDesign(V.studySpec(dir, brief, 'Yoga studio', []), [], { runtime: true }).html, { waitUntil: 'load' });
  const before = await page.evaluate(() => document.querySelector('input[name$="-day"]:checked').value);
  await page.focus('input[name$="-day"]:checked');
  await page.keyboard.press('ArrowRight');
  const after = await page.evaluate(() => document.querySelector('input[name$="-day"]:checked').value);
  ok('arrow keys move between days, and the day shows its times', after !== before && (await page.isVisible(`.bk-times[data-day="${after}"]`)));
  await page.keyboard.press('Tab');
  await page.keyboard.press('Space');
  ok('Tab then Space chooses a time', await page.evaluate(() => !!document.querySelector('input[name$="-time"]:checked')));
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-ux-done]:not([hidden])', { timeout: 3000 }).catch(() => null);
  ok('Tab then Enter confirms', await page.isVisible('[data-ux-done]'));
}

console.log('inside the sandboxed frame, as on the canvas');
{
  const dir = { ...dirs[0], compose: { booking: 'calendar' } };
  const parse = (h) => new JSDOM(h).window.document;
  const sealed = V.buildSandboxDoc(V.renderDesign(V.studySpec(dir, brief, 'Yoga studio', []), []).html, { parse, runScripts: false, nonce: 'n0nce123', inspector: V.BEHAVIOR_SOURCE }).doc;
  ok('the frame document allows only scripts with its nonce', /script-src 'nonce-n0nce123'/.test(sealed) && !/unsafe-inline/.test(sealed.match(/script-src[^;"]*/)?.[0] ?? ''));
  await page.setContent(sealed, { waitUntil: 'load' });
  ok('the runtime runs there, by nonce, and binds the booking', await page.evaluate(() => !!window.__uxBehaviors && window.__uxBehaviors.bookings === 1));
  const self = await page.evaluate(() => window.__uxBehaviors.selfTest());
  ok('…and the booking works there', self.length === 1 && !self[0].problems.length, JSON.stringify(self));
}

ok('no console errors', !errors.length, errors.join(' | '));
await b.close();
console.log(`\nbooking: ${pass} passed, ${fail} failed (screenshots in ${S})`);
process.exit(fail ? 1 : 0);
