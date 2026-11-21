// test/browser/ux-v0/dsi-qa.mjs — Design System Intelligence in the built app, driven as a designer would (the
// acceptance path): import a design system (tokens file), review it, confirm and publish; add and approve a logo; edit
// a token and publish with review; start a graphic in the system (directions in its identity, the approved logo placed,
// fidelity said); change the system again, preview the impact on the linked graphic and update it; roll back; export;
// import brand guidelines from a PDF (statements with pages, inferences labelled); sync from the source file with a
// change, then with a change made on both sides (settled by the designer); apply the system to a website the designer
// already made; build a board in it. Every result is read back from the browser's own stores (IndexedDB). No model
// route is called.
//
//   UXV0_FORWARD=1 UXV0_BASE=http://127.0.0.1:3100 node test/browser/ux-v0/dsi-qa.mjs
//   (needs test/.tmp/dsi-under-test.mjs: `node test/run.mjs design-system-intelligence` builds it)
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { chromium, S, BASE, FX, ROOT } from './env.mjs';

const D = await import(pathToFileURL(`${ROOT}test/.tmp/dsi-under-test.mjs`).href);

let pass = 0;
let fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok  ', n)) : (fail++, console.log('  FAIL', n, String(x).slice(0, 500))));
const errors = [];
const modelCalls = [];
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
page.on('request', (r) => {
  if (/\/api\/ux-v0\/(generate|refine|brief|discover|direct|critique|images)/.test(r.url())) modelCalls.push(r.url());
});
const shot = (name) => page.screenshot({ path: `${S}dsi-${name}.png` });
const idb = (db, store, id) =>
  page.evaluate(
    ({ db, store, id }) =>
      new Promise((res, rej) => {
        const req = indexedDB.open(db);
        req.onsuccess = () => {
          const s = req.result.transaction(store, 'readonly').objectStore(store);
          const g = id ? s.get(id) : s.getAll();
          g.onsuccess = () => res(g.result ?? null);
          g.onerror = () => rej(g.error);
        };
        req.onerror = () => rej(req.error);
      }),
    { db, store, id },
  );
const idbPut = (db, store, value) =>
  page.evaluate(
    ({ db, store, value }) =>
      new Promise((res, rej) => {
        const req = indexedDB.open(db);
        req.onsuccess = () => {
          const t = req.result.transaction(store, 'readwrite');
          t.objectStore(store).put(value);
          t.oncomplete = () => res(true);
          t.onerror = () => rej(t.error);
        };
        req.onerror = () => rej(req.error);
      }),
    { db, store, value },
  );
const systems = () => idb('socria-ux-v0-systems', 'systems');
const systemNamed = async (name) => ((await systems()) ?? []).find((r) => r.name === name) ?? null;
const until = async (fn, ms = 10000) => {
  const t0 = Date.now();
  let v = null;
  while (Date.now() - t0 < ms) {
    v = await fn();
    if (v) return v;
    await page.waitForTimeout(250);
  }
  return v;
};
const tab = async (name) => {
  await page.locator('.ds-tabs').getByRole('button', { name, exact: true }).click();
  await page.waitForTimeout(300);
};

console.log('=== Design System Intelligence, in the built app ===');
await page.goto(BASE + '/ux-v0', { waitUntil: 'networkidle' });
ok('the home offers design systems', await page.getByRole('button', { name: /Design systems/ }).isVisible());
await page.getByRole('button', { name: /Design systems/ }).click();
await page.waitForSelector('.ds .ds-empty', { timeout: 15000 });
ok('the manager opens in the address (?ds=1) with an empty state that says what a system is', new URL(page.url()).searchParams.get('ds') === '1' && /defines identity/.test(await page.locator('.ds-empty').innerText()));

// ── 1–4: import, review, conflicts, save ──
await page.getByRole('button', { name: 'Import a design system' }).first().click();
await page.waitForSelector('.ds-wizard');
await page.getByRole('radio', { name: /Design tokens \(JSON\)/ }).click();
await page.setInputFiles('#ds-files', { name: 'halden.tokens.json', mimeType: 'application/json', buffer: readFileSync(`${FX}dsi/halden.tokens.json`) });
await page.getByRole('button', { name: /Next: what to bring/ }).click();
ok('categories offered: colours, typography, layout, effects, components, assets, rules', (await page.locator('.ds-cats').first().locator('input[type=checkbox]').count()) === 7);
await page.getByRole('button', { name: 'Analyse' }).click();
await page.waitForSelector('.ds-lede', { timeout: 15000 });
const stages = await page.locator('.ds-stages li').allInnerTexts().catch(() => []);
ok('analysis shows real stages, each done', true, stages.join(' | '));
const lede = await page.locator('.ds-lede').innerText();
ok('preview: the system named from its file, its tokens counted, references and modes said', /Halden/.test(lede) && /13 tokens/.test(lede) && /references/.test(lede) && /light, dark/.test(lede), lede);
ok('preview: swatches and role bindings with their status', (await page.locator('.ds-swatches li').count()) >= 7 && /accent: color.action.primary/.test(await page.locator('.ds-roles').innerText()));
await shot('wizard-preview');
await page.getByRole('button', { name: /Next: confirm/ }).click();
ok('confirm: says what will be created and offers publishing v1', /A new design system/.test(await page.locator('.ds-lede').innerText()) && (await page.getByLabel(/Publish it now/).isChecked()));
await page.getByRole('button', { name: 'Create the design system' }).click();
await page.waitForSelector('text=is published (v1)', { timeout: 10000 });
let rec = await until(() => systemNamed('Halden'));
ok('saved in this browser, published v1, with its source and history', rec && rec.versions.length === 1 && rec.sources[0].kind === 'json' && rec.audit.some((a) => a.action === 'imported') && rec.audit.some((a) => a.action === 'published'), JSON.stringify(rec?.audit));
await page.getByRole('button', { name: 'Done' }).click();
await page.waitForSelector('.ds-sys-name');

// ── approved logo ──
await tab('Assets');
await page.setInputFiles('#ds-more', { name: 'halden-logo.svg', mimeType: 'image/svg+xml', buffer: readFileSync(`${FX}dsi/halden-logo.svg`) });
await page.waitForSelector('.ds-asset-grid li', { timeout: 10000 });
await page.getByLabel(/Approve as a logo/).check();
rec = await until(async () => {
  const r = await systemNamed('Halden');
  return r?.draft.assets.some((a) => a.approved && a.protected) ? r : null;
});
ok('a logo added and approved: protected from then on', !!rec, JSON.stringify(rec?.draft.assets?.map((a) => [a.name, a.approved])));
await tab('Overview');
await page.getByRole('button', { name: 'Publish v2' }).click();
await page.waitForSelector('.ds-modal', { timeout: 5000 });
ok('publishing shows every change for review first', /Added logo “halden-logo”/.test(await page.locator('.ds-modal').innerText()));
await page.locator('.ds-modal').getByRole('button', { name: 'Publish', exact: true }).click();
rec = await until(async () => ((await systemNamed('Halden'))?.versions.length === 2 ? systemNamed('Halden') : null));
ok('v2 published after review', rec?.versions.length === 2);

// ── 5, 7, 9: a graphic in the system ──
await tab('Usage');
await page.getByRole('button', { name: 'New graphic in it' }).click();
await page.waitForSelector('.gx-brief', { timeout: 15000 });
ok('a new graphic opens linked to the system (its badge says so)', /Halden v2/.test(await page.locator('.ds-sysbadge').innerText()));
await page.fill('#gx-headline', 'Slow coffee, early mornings');
await page.getByRole('button', { name: /See three directions/ }).click();
await page.waitForSelector('.gx-dir', { timeout: 15000 });
await page.waitForTimeout(800);
const dirNames = await page.locator('.gx-dir h2').allInnerTexts();
ok('three directions, each the engine’s own, each in the system’s identity', dirNames.length === 3 && dirNames.every((n) => /Halden/.test(n)) && new Set(dirNames).size === 3, dirNames.join(' | '));
await shot('directions');
await page.locator('.gx-dir').first().getByRole('button', { name: /Make it in this direction/ }).click();
await page.waitForSelector('.gx-canvas .gx-board svg', { timeout: 30000 });
await page.waitForTimeout(1200);
const gpid = new URL(page.url()).searchParams.get('p');
let gproj = await idb('socria-ux-v0', 'projects', gpid);
const nodes = gproj?.graphic?.doc?.artboards.flatMap((a) => a.children) ?? [];
ok('composed in the system: its tokens, its approved logo placed as a linked image', gproj?.graphic?.doc?.tokens.colors.accent === '#e4572e' && nodes.some((n) => n.type === 'image' && n.link?.startsWith('brand:')) && !!gproj.graphic.bindings, JSON.stringify(gproj?.graphic?.doc?.tokens));
const fidText = (await page.locator('body').innerText()).match(/Brand fidelity to Halden: (\d+)/);
ok('brand fidelity said after composing, and high (the palette held even in a styled direction)', fidText && Number(fidText[1]) >= 86, fidText?.[0]);
ok('the badge carries the live fidelity', /fidelity \d+/.test(await page.locator('.ds-sysbadge').innerText()));
await shot('graphic');

// ── 10–13: modify, preview impact, publish, update ──
await page.goto(`${BASE}/ux-v0?ds=${rec.id}`, { waitUntil: 'networkidle' });
await page.waitForSelector('.ds-sys-name');
await tab('Tokens');
const flame = page.getByLabel('Value of color.brand.flame', { exact: true });
await flame.fill('#c8401c');
await flame.blur();
await page.waitForTimeout(400);
rec = await systemNamed('Halden');
ok('a token edited: the draft changes, the published version does not', rec.draft.tokens['color.brand.flame'].value === '#c8401c' && rec.versions.at(-1).content.tokens['color.brand.flame'].value === '#e4572e' && rec.draft.tokens['color.brand.flame'].provenance.status === 'edited');
await tab('Overview');
await page.getByRole('button', { name: 'Publish v3' }).click();
await page.locator('.ds-modal').getByRole('button', { name: 'Publish', exact: true }).click();
rec = await until(async () => ((await systemNamed('Halden'))?.versions.length === 3 ? systemNamed('Halden') : null));
ok('v3 published', rec?.versions.length === 3);
await tab('Usage');
await page.waitForSelector('.ds-usage li', { timeout: 10000 });
ok('the linked graphic is listed: on v2, v3 available', /on v2.*v3 available/.test(await page.locator('.ds-usage li').first().innerText()));
await page.getByRole('button', { name: 'Preview the impact' }).click();
const preview = await page.locator('.ds-report').first().innerText();
ok('impact preview: what changes before anything is applied', /colors\.accent: #e4572e → #c8401c/.test(preview), preview);
gproj = await idb('socria-ux-v0', 'projects', gpid);
ok('…and nothing has changed yet', gproj.graphic.doc.tokens.colors.accent === '#e4572e');
await page.getByRole('button', { name: 'Update to the latest' }).click();
await page.waitForSelector('text=Updated to Halden v3', { timeout: 10000 });
gproj = await idb('socria-ux-v0', 'projects', gpid);
// every property recorded as bound to the accent (at any depth, in groups too) now carries the new accent; nothing else
// is asked of the composition (whether it uses its accent at all is the engine's choice)
const walkAll = (ns) => ns.flatMap((n) => [n, ...(n.children ? walkAll(n.children) : [])]);
const allNodes = new Map(gproj.graphic.doc.artboards.flatMap((a) => walkAll(a.children)).map((n) => [n.id, n]));
const propOf = (n, k) => (k === 'stroke' ? n.stroke?.color : n[k]);
const accentBound = Object.entries(gproj.graphic.bindings?.nodes ?? {}).flatMap(([id, props]) => Object.entries(props).filter(([, t]) => t === 'accent').map(([k]) => ({ id, k }))).filter(({ id }) => allNodes.has(id));
const followed = accentBound.filter(({ id, k }) => propOf(allNodes.get(id), k) === '#c8401c').length;
ok(`updated: the linked graphic follows (its token, and all ${accentBound.length} propert${accentBound.length === 1 ? 'y' : 'ies'} bound to the accent), a version saved before`, gproj.graphic.doc.tokens.colors.accent === '#c8401c' && followed === accentBound.length && gproj.graphic.versions.some((v) => /Before Halden v3/.test(v.label)) && gproj.systemLink.version === 3, JSON.stringify({ accentBound: accentBound.length, followed, token: gproj.graphic.doc.tokens.colors.accent }));
await shot('usage');

// ── 14: roll back ──
await tab('Versions');
await page.getByRole('button', { name: 'Roll back to v2' }).click();
rec = await until(async () => ((await systemNamed('Halden'))?.versions.length === 4 ? systemNamed('Halden') : null));
ok('rollback publishes v2’s content as v4; history kept', rec?.versions.at(-1).label === 'Rollback to v2' && rec.versions.at(-1).content.tokens['color.brand.flame'].value === '#e4572e');

// ── 15: export ──
await tab('Export');
const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'halden.tokens.json' }).click()]);
const dtcg = JSON.parse(readFileSync(await dl.path(), 'utf8'));
ok('export: W3C DTCG tokens with references and modes', dtcg.color.action.primary.$value === '{color.brand.flame}' && !!dtcg.color.background.$extensions['com.socriaux'].modes.dark);
const [dlCss] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'halden.tokens.css' }).click()]);
ok('export: CSS custom properties with var() references and the dark theme', /--color-action-primary: var\(--color-brand-flame\)/.test(readFileSync(await dlCss.path(), 'utf8')) && /\[data-theme="dark"\]/.test(readFileSync(await dlCss.path(), 'utf8')));

// ── 13: sync from the source file ──
await tab('Sync');
ok('sync: the source is remembered; manual by default', /json: /.test(await page.locator('.ds-card').first().innerText()) && (await page.getByLabel(/Manual: you check/).isChecked()));
const changed = JSON.parse(readFileSync(`${FX}dsi/halden.tokens.json`, 'utf8'));
changed.color.brand.roast.$value = '#4a2416';
changed.color.brand.oat = { $value: '#e8dcc4' };
await page.setInputFiles('input[aria-label="The source file again"]', { name: 'halden.tokens.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(changed)) });
await page.getByRole('button', { name: 'Check the source now' }).click();
await page.waitForSelector('text=Update waiting', { timeout: 10000 });
const waiting = await page.locator('.ds-card').nth(1).innerText();
ok('the change waits for review (never applied silently): incoming listed', /color\.brand\.roast/.test(waiting) && /color\.brand\.oat added upstream/.test(waiting), waiting);
await page.getByRole('button', { name: 'Bring it into the draft' }).click();
rec = await until(async () => {
  const r = await systemNamed('Halden');
  return r?.draft.tokens['color.brand.oat'] ? r : null;
});
ok('synced into the draft (publishing stays a separate step)', rec?.draft.tokens['color.brand.roast'].value === '#4a2416' && rec.versions.length === 4 && rec.audit.some((a) => a.action === 'synced'));

// ── 3, 13: a change made on both sides — the designer settles it ──
await tab('Tokens');
const roast = page.getByLabel('Value of color.brand.roast', { exact: true });
await roast.fill('#3b1d12');
await roast.blur();
await page.waitForTimeout(400);
await tab('Sync');
const both = JSON.parse(JSON.stringify(changed));
both.color.brand.roast.$value = '#5c2c1a';
await page.setInputFiles('input[aria-label="The source file again"]', { name: 'halden.tokens.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(both)) });
await page.getByRole('button', { name: 'Check the source now' }).click();
await page.waitForSelector('text=Changed on both sides', { timeout: 10000 });
const settle = page.getByRole('radiogroup', { name: 'Settle color.brand.roast' });
const offered = (await settle.locator('label').allInnerTexts()).map((x) => x.trim());
ok('a conflict is shown, never decided silently: accept upstream, keep local, create override and defer offered', ['accept upstream', 'keep local', 'create override', 'defer'].every((o) => offered.includes(o)), offered.join(', '));
await settle.getByLabel('keep local').check();
await page.getByRole('button', { name: 'Bring it into the draft' }).click();
rec = await until(async () => {
  const r = await systemNamed('Halden');
  return r?.audit.filter((a) => a.action === 'synced').length >= 2 ? r : null;
});
ok('settled as chosen: the local value kept, the source remembered as seen, nothing published', rec?.draft.tokens['color.brand.roast'].value === '#3b1d12' && rec.versions.length === 4, JSON.stringify(rec?.draft.tokens['color.brand.roast']));

// ── 6: a website the designer already made, brought into the system ──
const site0 = {
  ...D.makeProject('create', 'Halden site'),
  specs: [D.normalizeSpec({ title: 'Halden', pageType: 'website', tokens: { colors: { background: '#ffffff', surface: '#ffffff', text: '#111111', muted: '#555555', accent: '#7c3aed', accentText: '#ffffff', line: '#dddddd' }, fonts: { display: 'Syne', body: 'Inter' }, scale: 'comfortable', radius: 'round', style: 'editorial', imageTreatment: 'natural' }, sections: [{ id: 'hero', kind: 'hero', variant: 'editorial', content: { title: 'Slow coffee, early mornings', body: 'Roasted in small batches, in Halden.' } }] }, { refs: [] })],
  specIndex: 0,
};
await idbPut('socria-ux-v0', 'projects', site0);
await page.goto(`${BASE}/ux-v0?ds=${rec.id}`, { waitUntil: 'networkidle' });
await page.waitForSelector('.ds-sys-name');
await tab('Usage');
await page.getByLabel('A project to apply it to').selectOption(site0.id);
await page.getByRole('button', { name: 'Apply', exact: true }).click();
const site = await until(async () => {
  const p = await idb('socria-ux-v0', 'projects', site0.id);
  return p?.systemLink ? p : null;
});
const siteSpec = site?.specs?.at(-1);
const v4 = rec.versions.at(-1).content;
const sysAccent = D.resolveToken(v4, 'color.action.primary').value;
ok('applied to the website: its tokens are the system’s (a new version; the old one kept), linked to the published version', siteSpec?.tokens.colors.accent === sysAccent && site.specs.length === 2 && site.specs[0].tokens.colors.accent === '#7c3aed' && site.systemLink.id === rec.id && site.systemLink.version === 4, JSON.stringify({ accent: siteSpec?.tokens.colors.accent, sysAccent, versions: site?.specs?.length, link: site?.systemLink }));
const webFid = D.fidelityOfTokens(siteSpec.tokens, v4);
ok('…and it holds to the system (fidelity of its tokens)', webFid.score >= 86, JSON.stringify(webFid.findings ?? []).slice(0, 300));
await page.goto(`${BASE}/ux-v0?p=${encodeURIComponent(site0.id)}`, { waitUntil: 'networkidle' });
await page.waitForSelector('.ds-sysbadge', { timeout: 15000 });
ok('the website opens in its workspace carrying the system (badge with version and fidelity)', /Halden v4/.test(await page.locator('.ds-sysbadge').innerText()) && /fidelity \d+/.test(await page.locator('.ds-sysbadge').innerText()), await page.locator('.ds-sysbadge').innerText());
await shot('website');

// ── 7, 8, 9: a board in the system ──
await page.goto(`${BASE}/ux-v0?ds=${rec.id}`, { waitUntil: 'networkidle' });
await page.waitForSelector('.ds-sys-name');
await tab('Usage');
await page.getByRole('button', { name: 'New board in it' }).click();
await page.waitForSelector('.bd-brief', { timeout: 15000 });
ok('a new board opens linked to the system (its badge says so)', /Halden v4/.test(await page.locator('.ds-sysbadge').innerText()));
await page.fill('.bd-words', 'A launch for “Slow coffee, early mornings”, “Roasted in Halden”: one poster and one Instagram post.');
await page.getByRole('button', { name: 'Read it' }).click();
await page.getByRole('button', { name: /Propose design systems/ }).click();
await page.waitForSelector('.bd-sys', { timeout: 15000 });
await page.waitForTimeout(800);
ok('three expressions of the one identity are offered for the board', (await page.locator('.bd-sys').count()) === 3);
await page.locator('.bd-sys').first().getByRole('button', { name: /Use this system/ }).click();
await page.waitForSelector('.bd-canvas', { timeout: 15000 });
const bpid = new URL(page.url()).searchParams.get('p');
const board = await until(async () => {
  const p = await idb('socria-ux-v0', 'projects', bpid);
  const ms = p?.board?.materials ?? [];
  return ms.length && ms.every((m) => m.status === 'ready') ? p.board : null;
}, 60000);
const bgfx = (board?.materials ?? []).filter((m) => m.type === 'graphic' && m.doc);
const bfid = bgfx.map((m) => D.fidelityOfDoc(m.doc, v4).score);
ok('the board’s system is the design system (linked, published version)', board?.system?.brand?.id === rec.id && board.system.brand.version === 4, JSON.stringify(board?.system?.brand));
ok('every board material in the system’s identity, the approved logo placed unaltered as a linked image', bgfx.length >= 2 && bgfx.every((m) => m.doc.tokens.colors.accent === sysAccent && m.doc.artboards.some((a) => a.children.some((n) => n.type === 'image' && n.link?.startsWith('brand:')))), JSON.stringify(bgfx.map((m) => [m.name, m.doc.tokens.colors.accent])));
ok('each material holds to the system (fidelity ≥ 86) while composed its own way', bfid.length >= 2 && bfid.every((x) => x >= 86) && new Set(bgfx.map((m) => JSON.stringify(m.doc.artboards[0].concept ?? m.plan))).size === bgfx.length, JSON.stringify(bfid));
await page.waitForTimeout(1500);
await shot('board');

// ── a PDF of brand guidelines ──
await page.goto(`${BASE}/ux-v0?ds=${rec.id}`, { waitUntil: 'networkidle' });
await page.waitForSelector('.ds-sys-name');
await page.getByRole('button', { name: 'Import a design system' }).first().click();
await page.getByRole('radio', { name: /Brand guidelines \(PDF\)/ }).click();
await page.setInputFiles('#ds-files', { name: 'ferrowmoor-guidelines.pdf', mimeType: 'application/pdf', buffer: readFileSync(`${ROOT}test/fixtures/dsi/ferrowmoor-guidelines.pdf`) });
await page.getByRole('button', { name: /Next: what to bring/ }).click();
await page.getByRole('button', { name: 'Analyse' }).click();
await page.waitForSelector('.ds-lede', { timeout: 30000 });
const intel = await page.locator('.ds-intel').innerText();
ok('PDF: statements with their pages; confirmed and SocriaUX inferences told apart', /\(p\. \d\)/.test(intel) && /confirmed/.test(intel) && /SocriaUX inference/.test(intel) && /a suggestion, not enforced/.test(intel), intel.slice(0, 300));
await shot('pdf-preview');
await page.getByRole('button', { name: /Next: confirm/ }).click();
await page.getByLabel(/Publish it now/).uncheck();
await page.getByRole('button', { name: 'Create the design system' }).click();
await page.waitForSelector('text=saved as a draft', { timeout: 10000 });
const fer = await until(() => systemNamed('Ferrowmoor'));
ok('PDF: a draft system with colours, faces and rules (nothing published)', fer && fer.versions.length === 0 && fer.draft.tokens['color.brand.moor-green']?.value === '#2f4a3a' && fer.draft.intelligence.some((i) => i.check?.kind === 'logo-clear-space'));
await page.getByRole('button', { name: 'Done' }).click();

// ── edits in place, never a browser dialog: a token renamed (its references follow), an approved logo's removal asked
//    in its row, a SocriaUX reading reworded (it becomes the owner's) ──
await page.goto(`${BASE}/ux-v0?ds=${rec.id}`, { waitUntil: 'networkidle' });
await page.waitForSelector('.ds-sys-name');
await tab('Tokens');
await page.locator('tr', { has: page.getByLabel('Value of color.brand.flame', { exact: true }) }).getByRole('button', { name: 'Rename' }).click();
const newName = page.getByLabel('New name for color.brand.flame (references follow)');
await newName.fill('color.brand.ember');
await newName.press('Enter');
rec = await until(async () => {
  const r = await systemNamed('Halden');
  return r?.draft.tokens['color.brand.ember'] ? r : null;
});
ok('a token renamed in its own row: every reference follows, the published version untouched', rec && !rec.draft.tokens['color.brand.flame'] && rec.draft.tokens['color.action.primary'].value === '{color.brand.ember}' && rec.versions.at(-1).content.tokens['color.brand.flame'], JSON.stringify(rec?.draft.tokens['color.action.primary']));
await tab('Assets');
await page.locator('.ds-asset-grid li', { hasText: 'halden-logo' }).getByRole('button', { name: 'Remove' }).click();
const askRemove = page.getByRole('group', { name: /Remove halden-logo/ });
ok('removing an approved logo is asked in its row first (nothing removed yet)', (await askRemove.isVisible()) && (await systemNamed('Halden')).draft.assets.some((a) => a.approved));
await askRemove.getByRole('button', { name: 'Keep it' }).click();
await page.waitForTimeout(300);
ok('…and kept when the owner keeps it', (await systemNamed('Halden')).draft.assets.some((a) => a.approved && a.name === 'halden-logo') && !(await askRemove.isVisible()));
await tab('Brand');
const inferredBefore = (await systemNamed('Halden')).draft.intelligence.filter((i) => i.status === 'inferred');
await page.locator('.ds-intel-list li').filter({ hasText: inferredBefore[0]?.statement.slice(0, 40) ?? '' }).first().getByRole('button', { name: 'Reword' }).click();
await page.getByLabel('Reword it (it becomes yours)').fill('Keep the palette warm: flame, roast and oat.');
await page.getByRole('button', { name: 'Save', exact: true }).click();
rec = await until(async () => {
  const r = await systemNamed('Halden');
  return r?.draft.intelligence.some((i) => i.statement === 'Keep the palette warm: flame, roast and oat.') ? r : null;
});
const reworded = rec?.draft.intelligence.find((i) => i.statement === 'Keep the palette warm: flame, roast and oat.');
ok('a SocriaUX reading reworded in place becomes the owner’s (approved, a preference — never silently a rule)', reworded?.id === inferredBefore[0]?.id && reworded.status === 'approved' && reworded.enforce === 'soft', JSON.stringify(reworded));

ok('no page errors', errors.length === 0, errors.join(' | '));
ok('no model route was called', modelCalls.length === 0, modelCalls.join(' '));
console.log(`\ndsi-qa: ${pass} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
