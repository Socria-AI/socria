// test/browser/ux-v0/company-qa.mjs — the company page and what it gives a project, in a real browser.
//
// The company page and the design workspace, bundled on their own (design-harness), with Socria's real files from
// this repository (its logo, its Logos mark, a real product screenshot) and its own published sentences. Driven as a
// person would: a company is begun, what it is is said and read from its own writing (and confirmed), products are
// named, files are added to the library and approved, the library is searched in plain words. Then a project made
// for the company is opened: its requests carry the company and the protected logo, the logo is placed as itself and
// drawn from the library, and asking for something the company does not have is said, not invented.
//
//   node test/browser/ux-v0/company-qa.mjs            (UXV0_OUT sets where screenshots go)
import { build } from 'esbuild';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, S, ROOT } from './env.mjs';

const OUT = `${S}company-qa/`;
mkdirSync(OUT, { recursive: true });
const BUNDLE = `${OUT}bundle/`;
await build({ entryPoints: [join(ROOT, 'test/browser/ux-v0/design-harness/entry.tsx')], bundle: true, format: 'esm', platform: 'browser', outdir: BUNDLE, jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, loader: { '.png': 'dataurl' }, logLevel: 'error' });

let pass = 0;
let fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok  ', n)) : (fail++, console.log('  FAIL', n, String(typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 500))));

const requests = [];
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text()) && errors.push(`console: ${m.text().slice(0, 200)}`));
page.on('dialog', (d) => d.accept());
const ORIGIN = 'http://localhost:4999';
let cfg = { page: 'company' };
let answer = () => '<say>Noted.</say><ok/>';
const html = () => `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/entry.css"><script>window.__HARNESS__=${JSON.stringify(cfg)}</script></head><body><div id="root"></div><script type="module" src="/entry.js"></script></body></html>`;
await ctx.route(`${ORIGIN}/**`, async (route) => {
  const u = new URL(route.request().url());
  if (u.pathname === '/') return route.fulfill({ status: 200, contentType: 'text/html', body: html() });
  if (u.pathname === '/entry.js') return route.fulfill({ status: 200, contentType: 'text/javascript', body: readFileSync(`${BUNDLE}entry.js`) });
  if (u.pathname === '/entry.css') return route.fulfill({ status: 200, contentType: 'text/css', body: existsSync(`${BUNDLE}entry.css`) ? readFileSync(`${BUNDLE}entry.css`) : '' });
  if (u.pathname === '/api/ux-v0/design') {
    const body = JSON.parse(route.request().postData() ?? '{}');
    requests.push(body);
    const text = answer(body);
    const lines = [{ type: 'accepted', op: 'x' }, ...text.match(/[\s\S]{1,180}/g).map((d) => ({ type: 'text', delta: d })), { type: 'result', status: 200, body: { text, model: 'scripted', usage: { input: 0, output: 0, cost: 0 } } }];
    return route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: lines.map((l) => JSON.stringify(l)).join('\n') + '\n' });
  }
  if (u.pathname === '/socria-mark.png') return route.fulfill({ status: 200, contentType: 'image/png', body: readFileSync(join(ROOT, 'public/socria-mark.png')) });
  if (u.pathname.startsWith('/api/')) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  return route.fulfill({ status: 404, body: '' });
});
const settle = (ms = 500) => page.waitForTimeout(ms);
const companyOf = () => page.evaluate(() => new Promise((res) => { const r = indexedDB.open('socria-ux-v0-company', 1); r.onsuccess = () => { const g = r.result.transaction('companies', 'readonly').objectStore('companies').getAll(); g.onsuccess = () => res(g.result?.[0] ?? null); g.onerror = () => res(null); }; r.onerror = () => res(null); }));
const card = (label) => page.locator(`section[aria-label="${label}"]`);

console.log('\n=== a company, begun with its name ===');
await page.goto(`${ORIGIN}/`);
await page.waitForSelector('.co-empty', { timeout: 20000 });
await page.locator('.co-empty input').fill('Socria');
await page.locator('.co-empty button:text-is("Begin")').click();
await page.waitForSelector('section[aria-label="What the company is"]');
let co = await companyOf();
ok('the company is kept in this browser with its name and nothing else', co?.name === 'Socria' && co.facts.length === 0 && co.library.length === 0, co);
ok('new work in this browser is made for it', await page.evaluate(() => localStorage.getItem('socria-ux-v0-company-current')) === co.id);

console.log('\n=== what it is: said, and read from its own writing ===');
const mission = card('What the company is').locator('[data-kind="mission"]');
await mission.locator('.co-add input').fill('Socria exists to build artificial intelligence for one purpose: human enhancement.');
await mission.locator('.co-add button').click();
await settle();
co = await companyOf();
ok('what the person says is kept as stated and confirmed', co.facts[0]?.kind === 'mission' && co.facts[0].confirmed && co.facts[0].source === 'stated');
await page.locator('.co-read summary').click();
await page.locator('.co-read input[aria-label="Where this text is from"]').fill('components/site/Charter.tsx');
await page.locator('.co-read textarea').fill('The machines work for us. Not the other way around.\n\nWe believe good AI leaves the person using it more capable, never more dependent.\n\nSocria is built for people who want the thinking to stay theirs. We never hand over a conclusion without asking first.');
await page.locator('.co-read button:text-is("Read it")').click();
await settle();
co = await companyOf();
const found = co.facts.filter((f) => f.source === 'imported');
ok('sentences that say what the company is are found, quoted, with where they came from — and wait', found.length >= 2 && found.every((f) => !f.confirmed && f.from === 'components/site/Charter.tsx') && found.some((f) => /We believe good AI leaves the person/.test(f.text)), found);
ok('…shown as not confirmed, not used', (await page.locator('.co-facts li.is-waiting').count()) === found.length && /not confirmed, not used/.test((await page.locator('.co-facts li.is-waiting .co-meta').first().textContent()) ?? ''));
ok('what the designer is told does not include them yet', !/more capable, never more dependent/.test((await card('What the designer is told').textContent()) ?? ''));
await page.locator('.co-facts li.is-waiting:has-text("We believe good AI") button:text-is("Confirm")').click();
await settle();
ok('…and does once one is confirmed', /It believes: We believe good AI leaves the person using it more capable/.test((await card('What the designer is told').textContent()) ?? ''));

console.log('\n=== products ===');
const addProduct = async (name) => {
  await card('Products').locator('.co-add input').fill(name);
  await card('Products').locator('.co-add button').click();
  await settle(300);
};
await addProduct('Logos');
await addProduct('Stratus');
const logosWhat = card('Products').locator('li').first().locator('textarea');
await logosWhat.fill('A conversation that asks as well as answers, the Logic Map beside it.');
await logosWhat.blur();
await settle();
co = await companyOf();
ok('products are kept as named; one with what it is, one with nothing', co.products.length === 2 && /asks as well as answers/.test(co.products[0].what) && co.products[1].what === '');
const toldText = (await card('What the designer is told').textContent()) ?? '';
ok('the designer is told what Logos is, and that nothing is known of Stratus', /Logos — A conversation that asks/.test(toldText) && /what Stratus is \(nothing supplied: name it only, describe nothing\)/.test(toldText));

console.log('\n=== the library: Socria’s real files ===');
await card('Library').locator('input[type=file]').setInputFiles([join(ROOT, 'public/socria-logo.png'), join(ROOT, 'public/logos-mark.png'), join(ROOT, 'docs/first-run-shots/logos-found.png')]);
await page.waitForFunction(() => document.querySelectorAll('.co-library li').length === 3, null, { timeout: 15000 });
await settle(600);
co = await companyOf();
ok('three real files are in the library, read from their bytes, none approved', co.library.length === 3 && co.library.every((i) => !i.asset.approved && /^[0-9a-f]{64}$/.test(i.asset.hash)) && co.library.find((i) => /socria-logo/.test(i.asset.name))?.asset.width === 1080, co.library.map((i) => [i.asset.name, i.what, i.asset.width]));
ok('the logo is read as a logo, the mark as a mark', co.library.find((i) => /socria-logo/.test(i.asset.name))?.what === 'logo' && co.library.find((i) => /logos-mark/.test(i.asset.name))?.what === 'mark');
ok('their pictures are shown', await page.locator('.co-library li').first().locator('.co-thumb img').evaluate((el) => el.naturalWidth > 0));
ok('with no approved logo, the designer is told there is one, not approved', /an approved logo \(the library holds one, not yet approved/.test((await card('What the designer is told').textContent()) ?? ''));
const item = (name) => page.locator(`.co-library li[data-item="${name}"]`);
await item('socria-logo').locator('label:has-text("Approved") input').check();
await settle();
const shot = item('logos-found');
await shot.locator('select[aria-label="What it is"]').selectOption('screenshot');
await shot.locator('select[aria-label="Product"]').selectOption({ label: 'Logos' });
await shot.locator('input[aria-label="Description"]').fill('Logos in conversation with the Logic Map open');
await shot.locator('input[aria-label="Description"]').blur();
await shot.locator('label:has-text("Approved") input').check();
await settle();
co = await companyOf();
const logoItem = co.library.find((i) => /socria-logo/.test(i.asset.name));
ok('approving the logo protects it', logoItem.asset.approved && logoItem.asset.protected && (await item('socria-logo').locator('label:has-text("Approved")').textContent())?.includes('protected'));
ok('the screenshot is kept as a screenshot of Logos', co.library.find((i) => /logos-found/.test(i.asset.name))?.what === 'screenshot' && co.library.find((i) => /logos-found/.test(i.asset.name))?.product === co.products[0].id);
await page.screenshot({ path: `${OUT}1-library.png`, fullPage: true });
await card('Library').locator('.co-search').fill('screenshots of Logos');
await settle();
const hits = await page.locator('.co-library li').evaluateAll((els) => els.map((e) => e.getAttribute('data-item')));
ok('found in plain words: the screenshot of Logos, and not the logo files (“Logos” is the product here)', hits.length === 1 && hits[0] === 'logos-found', hits);
await card('Library').locator('.co-search').fill('photographs of the team');
await settle();
ok('what is not there is said to be not there', (await page.locator('.co-library li').count()) === 0 && /Nothing in the library matches[\s\S]*nothing will be made up/.test((await card('Library').locator('.co-msg').textContent()) ?? ''));
await card('Library').locator('.co-search').fill('');
await card('Not available').locator('.co-add input').fill('Photographs of the team, events or campus');
await card('Not available').locator('.co-add button').click();
await settle();
co = await companyOf();
ok('what is known to be missing is written down', co.missing[0] === 'Photographs of the team, events or campus');
ok('no errors on the company page', errors.length === 0, errors);

console.log('\n=== a project made for the company ===');
const LOGO_ID = `lib-${logoItem.asset.hash.slice(0, 12)}`;
answer = (body) => {
  if (body.mode === 'look') return '<say>It reads.</say><ok/>';
  if (!body.doc.artboards.length) return `<say>The logo, the line, and room around both.</say><artboard id="new-1" name="Think for yourself" format="instagram-square"><style>.sx-root{background:#f5f3eb;color:#1f1f1f;font-family:'Instrument Serif',serif}.logo{position:absolute;left:80px;top:80px;width:220px;height:220px}h1{position:absolute;left:80px;bottom:120px;margin:0;font-size:120px;font-weight:400;line-height:1}</style><img class="logo" src="asset:${LOGO_ID}" alt="Socria"><h1>Think for yourself.</h1></artboard>`;
  return '<say>There are no photographs of the team in the library, so I have left the composition as it is rather than invent one.</say><ok/>';
};
cfg = { brief: 'A square post for Socria: the logo and the line “Think for yourself.”', kind: 'social post', format: 'instagram-square', companyId: co.id };
await page.goto(`${ORIGIN}/`);
await page.waitForSelector('.dx-board iframe', { timeout: 20000 });
await page.waitForFunction(() => !document.querySelector('.dx-phase'), null, { timeout: 30000 });
await settle(1500);
const first = requests.find((r) => r.mode === 'write');
ok('the first request waits for the company and carries it', first?.company?.name === 'Socria' && first.company.about.some((x) => /Mission: Socria exists to build/.test(x)) && first.company.products.some((x) => /^Logos — /.test(x)), first?.company);
ok('…with what is missing, to be said rather than invented', first.company.missing.some((x) => /what Stratus is/.test(x)) && first.company.missing.some((x) => /Photographs of the team/.test(x)));
const told = first.assets.find((a) => a.id === LOGO_ID);
ok('…and the approved logo as a picture, with the rule that protects it', !!told && /APPROVED AND PROTECTED: place it exactly as it is/.test(told.note) && first.assets.some((a) => /logos-found/.test(a.name) && /a real screenshot: show it as it is/.test(a.note)), first.assets);
ok('the unapproved mark is not offered', !first.assets.some((a) => /logos-mark/.test(a.name)));
const img = page.frameLocator('.dx-board iframe').first().locator('img.logo');
ok('the logo placed by the designer is drawn from the library, as itself', await img.evaluate((el) => el.naturalWidth === 1080 && el.naturalHeight === 1080), await img.evaluate((el) => [el.naturalWidth, el.src.slice(0, 30)]));
const look = requests.find((r) => r.mode === 'look');
ok('the look is sent the picture with the logo in it', /^data:image\/jpeg;base64,/.test(look?.pictures?.[0] ?? '') && look.pictures[0].length > 8000);
ok('the workspace says whom the project is for', (await page.locator('.dx-badge').first().textContent())?.includes('For Socria'));
ok('nothing is reported as missing from this browser', (await page.locator('.dx-warn').count()) === 0);
await page.screenshot({ path: `${OUT}2-project-with-logo.png` });
await page.locator('.dx-input').fill('Add a photo of our team behind the headline.');
await page.locator('.dx-input').press('Enter');
await settle(400);
ok('asking for what the company does not have is said at once', /Not in Socria’s library: no photographs are in the library/.test((await page.locator('.dx-toast').textContent().catch(() => '')) ?? ''), await page.locator('.dx-toast').textContent().catch(() => 'no toast'));
await page.waitForFunction(() => !document.querySelector('.dx-phase'), null, { timeout: 30000 });
const asked = requests.filter((r) => r.mode === 'write').at(-1);
ok('…and told to the designer first among what is missing', /no photographs are in the library/.test(asked.company.missing[0]), asked.company.missing);
const kept = await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('socria-ux-v0', 1); r.onsuccess = () => { const g = r.result.transaction('projects', 'readonly').objectStore('projects').get(window.__PROJECT_ID__); g.onsuccess = () => res(g.result ?? null); }; }));
ok('the project keeps whom it is for; the company was not changed by it', kept?.companyId === co.id && JSON.stringify((await companyOf()).facts) === JSON.stringify(co.facts));
ok('no errors in the workspace', errors.length === 0, errors);

console.log(`\ncompany-qa: ${pass} passed, ${fail} failed · screenshots in ${OUT}`);
await b.close();
process.exit(fail ? 1 : 0);
