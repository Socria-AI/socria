// test/browser/ux-v0/authority-qa.mjs — the person's creative authority, in a real browser.
//
// The design workspace alone (design-harness), the design route answered here by script. Driven as a reviewer would:
// an element is locked and then cannot be dragged, retyped, deleted or changed by the designer; typefaces are kept;
// an artboard is approved, holds against every kind of change, and is reopened; the history keeps every version,
// branches instead of cutting, compares two versions and brings one artboard back; a review returns findings by kind
// (with contrast measured on the picture) that are applied one at a time or set aside. Everything is read from the
// page and from what the browser kept.
//
//   node test/browser/ux-v0/authority-qa.mjs            (UXV0_OUT sets where screenshots go)
import { build } from 'esbuild';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, S, ROOT } from './env.mjs';

const OUT = `${S}authority-qa/`;
mkdirSync(OUT, { recursive: true });
const BUNDLE = `${OUT}bundle/`;
await build({ entryPoints: [join(ROOT, 'test/browser/ux-v0/design-harness/entry.tsx')], bundle: true, format: 'esm', platform: 'browser', outdir: BUNDLE, jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, loader: { '.png': 'dataurl' }, logLevel: 'error' });

let pass = 0;
let fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok  ', n)) : (fail++, console.log('  FAIL', n, String(typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 500))));

const POSTER = `<say>A building cut open in section, under a large serif title.</say>
<artboard id="new-1" name="Rooms for Living" format="a3">
<style>
:root{--ground:#efe9dc;--ink:#1c1a17;--accent:#c4512c}
.sx-root{background:var(--ground);color:var(--ink);font-family:'Instrument Sans',sans-serif}
.brand{position:absolute;left:64px;top:56px;font-size:15px;letter-spacing:.22em;text-transform:uppercase;font-weight:600}
.headline{position:absolute;left:58px;top:110px;width:980px;margin:0;font-family:'Instrument Serif',serif;font-weight:400;font-size:168px;line-height:.92;letter-spacing:-.02em}
.headline em{font-style:normal;color:var(--accent)}
.block{position:absolute;left:64px;top:610px;width:995px;height:650px;background:var(--ink)}
.sub{position:absolute;left:64px;top:1330px;width:520px;font-size:38px;line-height:1.12;margin:0}
.meta{position:absolute;left:640px;top:1334px;width:420px;font-size:20px;line-height:1.45;margin:0;color:#c9c2b3}
.cta{position:absolute;left:640px;top:1440px;font-size:24px;font-weight:700;color:var(--accent)}
</style>
<div class="brand">Northlight</div>
<h1 class="headline">Rooms for<br><em>Living</em></h1>
<div class="block"></div>
<p class="sub">Six evenings on the future of housing</p>
<p class="meta">Thursdays, 2 October – 6 November<br>Northlight Studio, 14 Dock Street</p>
<div class="cta">Reserve a seat →</div>
</artboard>`;

const idOf = (html, cls) => (new RegExp(`<[a-z0-9]+[^>]*class="${cls}"[^>]*data-sx="(e\\d+)"`).exec(html) ?? new RegExp(`<[a-z0-9]+[^>]*data-sx="(e\\d+)"[^>]*class="${cls}"`).exec(html))?.[1] ?? null;

function scripted(body) {
  if (body.mode === 'look') return '<say>It reads in order.</say><ok/>';
  const a = body.doc.artboards[0];
  if (!a) return POSTER;
  if (body.mode === 'review') {
    const meta = idOf(a.html, 'meta');
    const head = idOf(a.html, 'headline');
    return `<say>Two things get in the way of reading it, and one is a matter of taste.</say>
<finding kind="accessibility" artboard="${a.id}" element="${meta}">The dates and address are set in a pale grey on the paper ground: they are the information people need and they are the hardest thing on the sheet to read.<fix>Darken the dates and address line to the ink colour so it reads against the paper; change nothing else.</fix></finding>
<finding kind="technical" artboard="${a.id}" element="${idOf(a.html, 'cta')}">“Reserve a seat” sits 14 px off the baseline of the line beside it, so the two columns look misaligned rather than deliberate.<fix>Align “Reserve a seat” to the baseline of the subhead beside it.</fix></finding>
<finding kind="opportunity" artboard="${a.id}" element="${head}">The title and the black block are the same visual weight, so neither leads. If the title should lead, the block could be cut down; if the block is the idea, it could take the sheet.<fix>Make the black block 30% shorter so the title leads.</fix></finding>`;
  }
  const w = String(body.words);
  if (/headline slightly smaller/i.test(w)) return `<say>The title is a step smaller.</say><edit artboard="${a.id}"><find>font-size:168px;line-height:.92</find><replace>font-size:148px;line-height:.92</replace></edit>`;
  if (/Darken the dates/i.test(w)) return `<say>The dates now read in the ink colour.</say><edit artboard="${a.id}"><find>margin:0;color:#c9c2b3}</find><replace>margin:0;color:var(--ink)}</replace></edit>`;
  if (/make the subhead red/i.test(w)) return `<say>The subhead is red.</say><edit artboard="${a.id}"><find>.sub{position:absolute;</find><replace>.sub{color:#c4512c;position:absolute;</replace></edit>`;
  if (/second poster/i.test(w)) return `<say>A second one, set in a different face.</say><artboard id="new-2" name="Second" format="a3"><style>.sx-root{background:#111;color:#eee}h1{margin:80px;font:400 150px/1 'Anton',sans-serif}</style><h1>Rooms for Living</h1></artboard>`;
  return '<say>Noted.</say><ok/>';
}

const requests = [];
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text()) && errors.push(`console: ${m.text().slice(0, 200)}`));
const ORIGIN = 'http://harness.test';
const cfg = { brief: 'A poster for a lecture series on the future of housing. Headline: Rooms for Living. Six evenings on the future of housing. Thursdays, 2 October – 6 November. Northlight Studio, 14 Dock Street. Reserve a seat. Northlight.', kind: 'poster', format: 'a3' };
const html = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/entry.css"><script>window.__HARNESS__=${JSON.stringify(cfg)}</script></head><body><div id="root"></div><script type="module" src="/entry.js"></script></body></html>`;
await ctx.route(`${ORIGIN}/**`, async (route) => {
  const u = new URL(route.request().url());
  if (u.pathname === '/') return route.fulfill({ status: 200, contentType: 'text/html', body: html });
  if (u.pathname === '/entry.js') return route.fulfill({ status: 200, contentType: 'text/javascript', body: readFileSync(`${BUNDLE}entry.js`) });
  if (u.pathname === '/entry.css') return route.fulfill({ status: 200, contentType: 'text/css', body: existsSync(`${BUNDLE}entry.css`) ? readFileSync(`${BUNDLE}entry.css`) : '' });
  if (u.pathname === '/api/ux-v0/design') {
    const body = JSON.parse(route.request().postData() ?? '{}');
    requests.push(body);
    const text = scripted(body);
    const lines = [{ type: 'accepted', op: 'x' }, ...text.match(/[\s\S]{1,180}/g).map((d) => ({ type: 'text', delta: d })), { type: 'result', status: 200, body: { text, model: 'scripted', usage: { input: 0, output: 0, cost: 0 } } }];
    return route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: lines.map((l) => JSON.stringify(l)).join('\n') + '\n' });
  }
  if (u.pathname === '/socria-mark.png') return route.fulfill({ status: 200, contentType: 'image/png', body: readFileSync(join(ROOT, 'public/socria-mark.png')) });
  if (u.pathname.startsWith('/api/')) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  return route.fulfill({ status: 404, body: '' });
});

const frame = (i = 0) => page.frameLocator('.dx-board iframe').nth(i);
const stateOf = () => page.evaluate(() => new Promise((res) => { const r = indexedDB.open('socria-ux-v0', 1); r.onsuccess = () => { const g = r.result.transaction('projects', 'readonly').objectStore('projects').get(window.__PROJECT_ID__); g.onsuccess = () => res(g.result?.design ?? null); g.onerror = () => res(null); }; r.onerror = () => res(null); }));
const settle = (ms = 700) => page.waitForTimeout(ms);
const idle = () => page.waitForFunction(() => !document.querySelector('.dx-phase'), null, { timeout: 30000 });
const say = async (words) => {
  await page.locator('.dx-input').fill(words);
  await page.locator('.dx-input').press('Enter');
  await settle(300);
  await idle();
  await settle(900);
};
const selectArtboard = async (i = 0) => {
  await page.locator('.dx-label-name').nth(i).click();
  await settle(300);
};
const shot = (n) => page.screenshot({ path: `${OUT}${n}.png` });

console.log('\n=== a design to work on ===');
await page.goto(`${ORIGIN}/`);
await page.waitForSelector('.dx-board iframe', { timeout: 20000 });
await idle();
await settle(1500);
let st = await stateOf();
ok('the first design is there, one version', st?.versions?.length === 1 && st.doc.artboards.length === 1, errors);
const HEAD = idOf(st.doc.artboards[0].html, 'headline');
const AB = st.doc.artboards[0].id;

console.log('\n=== an element, locked ===');
await frame().locator('h1.headline').click();
await settle(400);
await page.locator('.dx-inspect button:text-is("Lock")').click();
await settle(900);
st = await stateOf();
ok('locking an element records it on the artboard, in words, with no new version', st.doc.artboards[0].locks?.[0]?.id === HEAD && /Rooms for/.test(st.doc.artboards[0].locks[0].what) && st.versions.length === 1, st.doc.artboards[0].locks);
ok('the inspector says it is protected and holds its controls', (await page.locator('.dx-held').textContent())?.includes('Protected') && (await page.locator('.dx-fields').evaluate((el) => el.disabled)));
ok('the canvas marks the selection as locked', await frame().locator('.sx-sel.sx-locked').count() === 1);
const before = st.doc.artboards[0].html;
const hb = await frame().locator('h1.headline').boundingBox();
await page.mouse.move(hb.x + 30, hb.y + 30);
await page.mouse.down();
await page.mouse.move(hb.x + 120, hb.y + 90, { steps: 6 });
await page.mouse.up();
await settle(900);
st = await stateOf();
ok('it cannot be dragged', st.doc.artboards[0].html === before && st.versions.length === 1);
await frame().locator('h1.headline').dblclick();
await settle(300);
ok('it cannot be retyped', (await frame().locator('h1.headline[contenteditable]').count()) === 0);
await frame().locator('h1.headline').click();
await page.keyboard.press('Delete');
await settle(900);
st = await stateOf();
ok('it cannot be deleted: said, and nothing changes', st.doc.artboards[0].html === before && /protected/i.test((await page.locator('.dx-toast').textContent().catch(() => '')) ?? ''), await page.locator('.dx-toast').textContent().catch(() => 'no toast'));
await say('Make the headline slightly smaller.');
st = await stateOf();
ok('the designer cannot change it either: nothing changed, and the conversation says why', st.doc.artboards[0].html === before && st.versions.length === 1 && /locked/i.test((await page.locator('.dx-failed').last().textContent()) ?? ''), await page.locator('.dx-turn').last().textContent());
ok('…and the designer had been told what is locked', /Locked on [^\n]*\[data-sx="e\d+"\]/.test(JSON.stringify(requests.at(-1).doc.artboards[0].locks ?? '')) || requests.at(-1).doc.artboards[0].locks?.length === 1);
await shot('1-element-locked');
// something else on the artboard is still free
await say('Now make the subhead red.');
st = await stateOf();
ok('what is not locked still changes (a new version), the locked headline untouched', st.versions.length === 2 && /\.sub\{color:#c4512c/.test(st.doc.artboards[0].html) && st.doc.artboards[0].locks?.length === 1);
await selectArtboard();
ok('the artboard lists what is protected on it', (await page.locator('.dx-locks li').count()) === 1);
await page.locator('.dx-locks button:text-is("Unlock")').click();
await settle(900);
st = await stateOf();
ok('unlocked from the list', !st.doc.artboards[0].locks?.length);

console.log('\n=== typefaces kept across the project ===');
await page.locator('.dx-inspect button:text-is("Keep its typefaces")').click();
await settle(900);
st = await stateOf();
ok('the artboard’s typefaces are kept for the project', st.memory.pins?.faces?.includes('Instrument Serif') && st.memory.pins.faces.includes('Instrument Sans'), st.memory);
ok('…and shown, with a way to release them', (await page.locator('[data-kept="faces"]').textContent())?.includes('Instrument Serif'));
await page.locator('.dx-chip button').click().catch(() => {});
await say('Make a second poster.');
st = await stateOf();
const wrote = requests.filter((r) => r.mode === 'write').at(-1);
ok('the next request carries what is kept', wrote.memory.pins?.faces?.includes('Instrument Serif'));
const looked = requests.filter((r) => r.mode === 'look').at(-1);
ok('a new artboard set in another face is measured against it (told to the look)', Object.values(looked?.measured ?? {}).flat().some((x) => /Anton/.test(x) && /said to keep/.test(x)), looked?.measured);
ok('…and what is still outside it is said to the person', /Anton/.test((await page.locator('.dx-failed').last().textContent()) ?? ''));
await shot('2-kept-typefaces');

console.log('\n=== approved ===');
await selectArtboard(0);
await page.locator('.dx-inspect button:text-is("Approve")').click();
await settle(900);
st = await stateOf();
const approvedAt = st.at;
ok('approving marks it, locks it whole and keeps the version', st.doc.artboards[0].state === 'approved' && st.doc.artboards[0].locked === true && st.versions[st.at].kept === 'Approved: Rooms for Living', st.versions[st.at]);
ok('the canvas shows it as approved', (await page.locator('.dx-board').first().locator('.dx-state.is-approved').textContent()) === 'Approved');
const approvedHtml = st.doc.artboards[0].html;
await page.waitForSelector('.dx-toast', { state: 'detached', timeout: 10000 });
const sb = await frame().locator('p.sub').boundingBox();
await frame().locator('p.sub').click();
await settle(300);
await page.mouse.move(sb.x + 20, sb.y + 10);
await page.mouse.down();
await page.mouse.move(sb.x + 90, sb.y + 60, { steps: 5 });
await page.mouse.up();
await settle(700);
await frame().locator('p.sub').click();
await page.keyboard.press('Delete');
await settle(900);
st = await stateOf();
ok('nothing on an approved artboard can be dragged or deleted', st.doc.artboards[0].html === approvedHtml && /approved and locked/i.test((await page.locator('.dx-toast').textContent().catch(() => '')) ?? ''));
ok('its elements’ controls are held, and say it is approved', (await page.locator('.dx-fields').evaluate((el) => el.disabled)) && /approved/i.test((await page.locator('.dx-held').textContent()) ?? ''));
await say('Make the headline slightly smaller.');
st = await stateOf();
ok('the designer cannot change it: nothing changed, said', st.doc.artboards[0].html === approvedHtml && /locked \(approved\)/.test((await page.locator('.dx-failed').last().textContent()) ?? ''), await page.locator('.dx-turn').last().textContent());
ok('delete is not offered for it', await page.locator('.dx-board').first().locator('.dx-label-acts button:text-is("Delete")').isDisabled().catch(() => false));
await shot('3-approved');
await selectArtboard(0);
await page.locator('.dx-approved button:text-is("Reopen for changes")').click();
await settle(900);
st = await stateOf();
ok('reopened by the person: revision requested, unlocked, as a version of its own', st.doc.artboards[0].state === 'revision' && !st.doc.artboards[0].locked && /Reopened/.test(st.versions[st.at].said));
ok('the approved version is still in the history exactly as approved', st.versions[approvedAt].kept === 'Approved: Rooms for Living' && st.versions[approvedAt].doc.artboards[0].state === 'approved' && st.versions[approvedAt].doc.artboards[0].html === approvedHtml);
await page.locator('.dx-chip button').click().catch(() => {});
await frame().locator('h1.headline').click();
await say('Make the headline slightly smaller.');
st = await stateOf();
ok('…and now it can change', /font-size:148px/.test(st.doc.artboards[0].html));

console.log('\n=== the history: nothing is cut, versions are compared, one artboard is brought back ===');
const total = st.versions.length;
await page.locator('.dx-head button:has-text("History")').click();
await settle(400);
ok('every version is listed with its number', (await page.locator('.dx-ver').count()) === total && (await page.locator('.dx-ver.is-shown b').textContent()) === `v${st.at + 1}`);
ok('the approval is marked as kept', (await page.locator('.dx-ver-kept').first().textContent())?.includes('Approved: Rooms for Living'));
await shot('4-history');
await page.locator(`.dx-ver[data-version="${approvedAt + 1}"] button:text-is("Compare")`).click();
await page.waitForSelector('.dx-compare iframe', { timeout: 10000 });
await settle(1200);
ok('comparing draws both versions of the artboard', (await page.locator('.dx-compare-pair iframe').count()) === 2);
const sizes = await Promise.all([0, 1].map((i) => page.frameLocator('.dx-compare-pair iframe').nth(i).locator('h1.headline').evaluate((el) => getComputedStyle(el).fontSize)));
ok('…as each really is (the approved title at 168, the one shown at 148)', sizes[0] === '168px' && sizes[1] === '148px', sizes);
ok('…and says what differs', /changed|styles changed/.test((await page.locator('.dx-compare-list button.is-on small').textContent()) ?? ''));
await shot('5-compare');
await page.locator('.dx-compare button:has-text("Bring")').click();
await settle(1000);
st = await stateOf();
ok('one artboard is brought back from the approved version as a new version; the other artboard is untouched', st.versions.length === total + 1 && /Brought back/.test(st.versions[st.at].said) && /font-size:168px/.test(st.doc.artboards[0].html) && st.doc.artboards.length === 2, st.versions[st.at]?.said);
ok('…and what comes back from an approval is approved and locked again, as it was there', st.doc.artboards[0].state === 'approved' && st.doc.artboards[0].locked === true);
// going back and changing something branches
await page.locator('.dx-head button:has-text("History")').click();
await settle(300);
await page.locator('.dx-ver[data-version="2"] button:text-is("Open")').click();
await settle(900);
// (version 2 is before the approval: the artboard is free there)
await frame().locator('.cta').click();
await settle(300);
const opac = page.locator('.dx-field:has(> span:text-is("Opacity %")) input');
await opac.fill('50');
await opac.press('Enter');
await settle(1000);
st = await stateOf();
ok('a change made after going back branches: every later version is still there', st.versions.length === total + 2 && st.versions[st.at].from === 1, { n: st.versions.length, from: st.versions[st.at].from });
await page.locator('.dx-head button:has-text("History")').click();
await settle(300);
ok('the history shows the branch and what it was made from', (await page.locator('.dx-ver.is-aside').count()) >= 1 && (await page.locator('.dx-ver.is-shown .dx-ver-from').textContent())?.includes('made from v2'));
await shot('6-branch');
await page.locator(`.dx-ver[data-version="${total + 1}"] button:text-is("Open")`).click();
await settle(900);

console.log('\n=== a review: findings by kind, applied one at a time ===');
await selectArtboard(0);
await page.locator('.dx-approved button:text-is("Reopen for changes")').click();
await settle(700);
await page.locator('.dx-quick button:text-is("Review")').click();
await settle(300);
await idle();
await settle(900);
const rv = requests.filter((r) => r.mode === 'review').at(-1);
ok('a review is asked with the picture of the artboard', rv?.pictures?.length === 1 && rv.artboards?.[0] === AB);
ok('…and with the contrast of its words, measured on the picture', Object.values(rv?.measured ?? {}).flat().some((x) => /low contrast, measured/.test(x) && /Thursdays/.test(x)), rv?.measured);
st = await stateOf();
const versionsBeforeReview = st.versions.length;
ok('the findings are shown by kind', (await page.locator('.dx-finding').count()) === 3 && (await page.locator('.dx-finding-group.is-accessibility').count()) === 1 && (await page.locator('.dx-finding-group.is-technical').count()) === 1 && (await page.locator('.dx-finding-group.is-opportunity').count()) === 1);
ok('a review changes nothing', st.versions.length === versionsBeforeReview && st.turns.at(-1).findings?.length === 3);
await shot('7-review');
const htmlBefore = st.doc.artboards[0].html;
await page.locator('.dx-finding-group.is-opportunity button:text-is("Set aside")').click();
await settle(500);
await page.locator('.dx-finding-group.is-accessibility button:text-is("Apply")').click();
await settle(300);
await idle();
await settle(900);
st = await stateOf();
const applyReq = requests.filter((r) => r.mode === 'write').at(-1);
const META = idOf(st.doc.artboards[0].html, 'meta');
ok('applying a finding asks for that fix, about that element only', /Darken the dates/.test(applyReq.words) && applyReq.selection?.element === META, applyReq.selection);
const strip = (h) => h.replace('margin:0;color:var(--ink)}', 'margin:0;color:#c9c2b3}');
ok('…and only that changes on the design', strip(st.doc.artboards[0].html) === htmlBefore && st.doc.artboards[0].html !== htmlBefore);
const fs = st.turns.find((t) => t.findings)?.findings ?? [];
ok('each finding keeps what the person decided: one applied, one set aside, one still open', fs.find((f) => f.kind === 'accessibility')?.status === 'applied' && fs.find((f) => f.kind === 'opportunity')?.status === 'dismissed' && fs.find((f) => f.kind === 'technical')?.status === 'open', fs.map((f) => f.status));
await shot('8-finding-applied');
const n = requests.length;
await page.locator('.dx-chip button').click().catch(() => {});
await selectArtboard(0);
await say('What do you think of the typography?');
ok('asking for a judgement in words is a review, not a change', requests.slice(n).some((r) => r.mode === 'review') && !requests.slice(n).some((r) => r.mode === 'write'), requests.slice(n).map((r) => r.mode));
const rv2 = requests.filter((r) => r.mode === 'review').at(-1);
ok('…and the line that was darkened no longer measures as low contrast', !Object.values(rv2?.measured ?? {}).flat().some((x) => /Thursdays/.test(x)), rv2?.measured);

ok('no errors on the page', errors.length === 0, errors);
console.log(`\nauthority-qa: ${pass} passed, ${fail} failed · screenshots in ${OUT}`);
await b.close();
process.exit(fail ? 1 : 0);
