// test/browser/ux-v0/logo-qa.mjs — logos in the built app, driven as a designer would: a logo brief typed on the home,
// concepts constructed (no directions, no templates), compared, explored further, one developed in the editor, its Logo
// tab (quality, sizes, colour tests, contexts), a command and a change in words, approval, the identity built as
// artboards, the project reloaded with everything kept, and a board made from the identity. Each result is read back
// from the project as the browser keeps it (IndexedDB). No model route is called.
//
//   UXV0_FORWARD=1 UXV0_BASE=http://127.0.0.1:3100 node test/browser/ux-v0/logo-qa.mjs
import { chromium, S, BASE } from './env.mjs';

let pass = 0;
let fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok  ', n)) : (fail++, console.log('  FAIL', n, String(x).slice(0, 400))));
const errors = [];
const modelCalls = [];
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
page.on('request', (r) => {
  if (/\/api\/ux-v0\/(generate|refine|brief|discover|direct|critique|design-system|assets|images)/.test(r.url())) modelCalls.push(r.url());
});
const pid = () => new URL(page.url()).searchParams.get('p');
const projectOf = (id) =>
  page.evaluate(
    (id) =>
      new Promise((res, rej) => {
        const req = indexedDB.open('socria-ux-v0', 1);
        req.onsuccess = () => {
          const g = req.result.transaction('projects', 'readonly').objectStore('projects').get(id);
          g.onsuccess = () => res(g.result ?? null);
          g.onerror = () => rej(g.error);
        };
        req.onerror = () => rej(req.error);
      }),
    id,
  );
const docWhere = async (pred, ms = 9000) => {
  const start = Date.now();
  let d = null;
  while (Date.now() - start < ms) {
    d = (await projectOf(pid()))?.graphic?.doc ?? null;
    if (d && pred(d)) return d;
    await page.waitForTimeout(300);
  }
  return d;
};
const logoRec = (d) => d?.artboards.find((x) => x.logo)?.logo ?? null;
const shot = (name) => page.screenshot({ path: `${S}logo-${name}.png` });

console.log('=== SocriaUX logos, in the built app ===');
await page.goto(BASE + '/ux-v0', { waitUntil: 'networkidle' });
await page.fill(
  'textarea[aria-label="What do you want to make?"]',
  'Design a logo for “Tidewell”, a water-quality monitoring service for coastal towns. Calm, trustworthy, precise. Values: clarity, care, community. Used on an app icon, signage and vans.',
);
await page.getByRole('radio', { name: 'Logo', exact: true }).click();
await page.getByRole('button', { name: 'Begin' }).click();
await page.getByRole('button', { name: 'Write the brief yourself' }).click();
await page.waitForSelector('.gx-brief', { timeout: 15000 });
await page.waitForTimeout(500);
ok('a logo brief is read as a logo (the kind chosen from the words)', (await page.locator('#gx-kind').inputValue()) === 'logo', await page.locator('#gx-kind').inputValue());
ok('…named exactly as written', (await page.locator('#gx-headline').inputValue()) === 'Tidewell', await page.locator('#gx-headline').inputValue());
await page.getByRole('button', { name: /See logo concepts|See three directions/ }).click();
await page.waitForSelector('.gx-logo-card', { timeout: 30000 });
await page.waitForTimeout(1500);
const cards0 = await page.locator('.gx-logo-card').count();
ok('concepts are constructed and shown (no directions step, no templates)', cards0 >= 8 && (await page.locator('.gx-dir').count()) === 0, cards0);
ok('each concept carries its idea and its argument', (await page.locator('.gx-logo-card .gx-logo-idea').count()) === cards0 && (await page.locator('.gx-logo-card details.gx-why').count()) === cards0);
await page.waitForFunction(() => [...document.querySelectorAll('.gx-logo-score')].every((e) => /Quality/.test(e.textContent ?? '')), null, { timeout: 30000 }).catch(() => undefined);
ok('every concept is measured (quality out of 100, criteria met of 12)', (await page.locator('.gx-logo-score', { hasText: /Quality \d+ \/ 100/ }).count()) === cards0);
await shot('concepts');
// compare two, then explore further
await page.locator('.gx-logo-card').nth(0).locator('input[type=checkbox]').check();
await page.locator('.gx-logo-card').nth(1).locator('input[type=checkbox]').check();
await page.waitForTimeout(500);
ok('two concepts compared side by side, criterion by criterion', (await page.locator('.gx-logo-compare table tbody tr').count()) === 12);
await page.getByRole('button', { name: 'Give me five completely different concepts' }).click();
await page.waitForFunction((n) => document.querySelectorAll('.gx-logo-card').length >= n + 5, cards0, { timeout: 30000 }).catch(() => undefined);
const cards1 = await page.locator('.gx-logo-card').count();
ok('“five completely different concepts” adds five, keeping every earlier one', cards1 === cards0 + 5, `${cards0} → ${cards1}`);
const recA = logoRec(await docWhere((d) => (logoRec(d)?.concepts.length ?? 0) >= cards0 + 5));
ok('…kept in the project’s logo record', recA && recA.concepts.length === cards0 + 5, recA?.concepts.length);
// set one aside, then develop another
await page.locator('.gx-logo-card').nth(2).getByRole('button', { name: 'Set aside' }).click();
await page.waitForTimeout(800);
const recB = logoRec(await docWhere((d) => logoRec(d)?.concepts.some((c) => c.status === 'rejected')));
ok('a concept set aside is kept, marked as such', recB && recB.concepts.some((c) => c.status === 'rejected') && recB.concepts.length === cards1);
await page.locator('.gx-logo-card').nth(3).getByRole('button', { name: 'Develop this concept' }).click();
await page.waitForSelector('.gx-logo', { timeout: 30000 });
await page.waitForTimeout(1500);
ok('developing a concept opens the editor on its Logo tab', (await page.locator('.gx-tab.is-on', { hasText: 'Logo' }).count()) === 1);
await page.waitForSelector('.gx-logo-criteria li', { timeout: 30000 }).catch(() => undefined);
ok('the Logo tab shows the twelve quality criteria, and says it is not a trademark search', (await page.locator('.gx-logo-criteria li').count()) === 12 && /not a trademark search/i.test(await page.locator('.gx-logo-disclaimer').innerText()));
ok('…the symbol at 16, 24, 32, 64, 128 and 512 px', (await page.locator('.gx-logo-sizes li').count()) === 6);
ok('…six colour tests and seven contexts', (await page.locator('.gx-logo-tiles').nth(0).locator('li').count()) === 6 && (await page.locator('.gx-logo-tiles').nth(1).locator('li').count()) === 7);
ok('…the canvas draws the logo as editable objects (paths, live text)', (await page.locator('.gx-canvas .gx-board svg path').count()) + (await page.locator('.gx-canvas .gx-board svg text').count()) >= 2);
await shot('editor');
// a command: a new wordmark under the same symbol
const before = logoRec(await docWhere(() => true));
await page.getByRole('button', { name: 'Keep the symbol but redesign the wordmark' }).click();
await page.waitForTimeout(1500);
const afterW = logoRec(await docWhere((d) => (logoRec(d)?.concepts.length ?? 0) > before.concepts.length));
const newOne = afterW?.concepts.find((c) => c.id === afterW.selected);
const oldOne = before.concepts.find((c) => c.id === before.selected);
ok(
  '“keep the symbol, redesign the wordmark” makes a new concept with the same symbol',
  newOne && oldOne && newOne.method === oldOne.method && newOne.seed === oldOne.seed && JSON.stringify(newOne.ops) === JSON.stringify(oldOne.ops) && JSON.stringify(newOne.wordmark) !== JSON.stringify(oldOne.wordmark),
  JSON.stringify([newOne?.wordmark?.kind, oldOne?.wordmark?.kind]),
);
ok(
  '…the previous one kept beside it',
  afterW.concepts.some((c) => c.id === oldOne.id),
);
// a change in words through the ask bar
await page.fill('#gx-ask-in', 'Make the mark more recognizable at small sizes');
await page.locator('.gx-ask button[type=submit]').click();
await page.waitForTimeout(2500);
const afterS = logoRec(await docWhere((d) => (logoRec(d)?.concepts.length ?? 0) > afterW.concepts.length));
ok(
  'a logo change asked in words is made (and said)',
  afterS && afterS.concepts.length === afterW.concepts.length + 1 && /small|Small/.test((await page.locator('.gx-note').allInnerTexts()).join(' ')),
  (await page.locator('.gx-note').allInnerTexts()).join(' '),
);
// undo takes it back
await page.keyboard.press('Control+z');
await page.waitForTimeout(1200);
const afterU = logoRec(await docWhere((d) => logoRec(d)?.selected === afterW.selected));
ok('undo takes the change back', afterU && afterU.selected === afterW.selected);
// approve, build the identity
await page.getByRole('button', { name: 'Approve this logo' }).click();
await page.waitForTimeout(1000);
const boards0 = (await docWhere(() => true)).artboards.length;
await page.getByRole('button', { name: 'Build the identity' }).click();
const withId = await docWhere((d) => d.artboards.length >= boards0 + 11, 15000);
ok(
  'the identity is built from the approved logo: an identity sheet and ten variant artboards',
  withId.artboards.length === boards0 + 11 && withId.artboards.some((x) => /identity sheet/.test(x.name)) && withId.artboards.some((x) => /Favicon/.test(x.name)),
  withId.artboards.map((x) => x.name).join(' | '),
);
await shot('identity');
// reload: everything kept
await page.waitForTimeout(2000);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.gx-canvas .gx-board svg', { timeout: 30000 });
await page.waitForTimeout(1500);
const reloaded = await docWhere(() => true);
ok('after a reload the project keeps its logo record, its approval and its identity artboards', logoRec(reloaded)?.approved && logoRec(reloaded).concepts.length >= afterW.concepts.length && reloaded.artboards.length === boards0 + 11);
// a board from the identity
await page
  .locator('.gx-tab', { hasText: 'Artboards' })
  .click()
  .catch(() => undefined);
await page.waitForTimeout(300);
const logoBoardName = reloaded.artboards.find((x) => x.logo)?.name;
if (logoBoardName)
  await page
    .locator('.gx-left-body')
    .getByText(logoBoardName, { exact: true })
    .first()
    .click()
    .catch(() => undefined);
await page.locator('.gx-tab', { hasText: 'Logo' }).click();
await page.waitForTimeout(800);
await page.getByRole('button', { name: 'Make a board from it' }).click();
await page.waitForSelector('.bd-ws, .bd-canvas, [class*="board"]', { timeout: 30000 }).catch(() => undefined);
await page.waitForTimeout(2500);
const boardP = await projectOf(pid());
ok(
  'a board is made from the identity, its system carrying the generated mark and its materials planned',
  boardP?.medium === 'board' && boardP.board?.system?.logo?.mark?.concept && boardP.board.materials.length >= 5,
  JSON.stringify({ medium: boardP?.medium, mark: !!boardP?.board?.system?.logo?.mark, n: boardP?.board?.materials.length }),
);
await shot('board');
ok('no model route was called', modelCalls.length === 0, modelCalls.join(' '));
ok('no page errors', errors.length === 0, errors.join(' | '));
await b.close();
console.log(`logo-qa: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
