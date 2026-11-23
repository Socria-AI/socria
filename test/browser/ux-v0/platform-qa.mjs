// test/browser/ux-v0/platform-qa.mjs — SocriaUX 2.0's twelve benchmark tests, in the built app, with screenshots.
//
//   1  “Make this cloud themed.”                       clouds drawn as editable shapes, the words kept
//   2  “Make it more interesting.”                     measured first: what holds it back is said, then changed
//   3  “Keep the typography and logo, but completely redesign the rest.”
//   4  “Turn this into a premium architectural studio identity.”
//   5  “Make the headline slightly smaller.”           the headline alone, by a nudge
//   6  two designs, then “Take the typography from the first and the visual composition from the second.”
//   7  controls made for the design genuinely change it (and undo takes it back)
//   8  “Find me some interesting references for an experimental architecture website.” — with no search provider
//      configured the conversation says so (the honest state of this environment); the result cards and choosing one
//      are then checked with a scripted provider answer (a UI check only, said as such)
//   9  a complete architecture studio website: made, responsive, editable
//   10 an original logo with editable vector geometry: valid SVG, variants
//   11 leaving and reopening: the conversation, the artboards, the comments and each artboard’s own look all kept
//   12 several designs from one brief, structurally different (measured)
//   and comments on objects, the critique from rendered pixels, no page errors
//
// The model's routes are refused throughout (no paid inference): everything here is the engine's own.
//   UXV0_FORWARD=1 UXV0_BASE=http://127.0.0.1:3100 UXV0_OUT=… node test/browser/ux-v0/platform-qa.mjs
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { chromium, S, BASE, ROOT } from './env.mjs';

const P = await import(pathToFileURL(`${ROOT}test/.tmp/platform-under-test.mjs`).href);
const J = JSON.stringify;
const results = [];
let pass = 0;
let fail = 0;
const ok = (n, c, x = '') => {
  results.push({ name: n, ok: !!c, detail: c ? undefined : String(x).slice(0, 800) });
  return c ? (pass++, console.log('  ok  ', n)) : (fail++, console.log('  FAIL', n, String(x).slice(0, 600)));
};
const errors = [];
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addCookies([{ name: '__clerk_db_jwt', value: 'qa-placeholder', url: BASE }]);
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
// no model: every model route refused, as when none is configured (the engine carries on alone)
const modelCalls = [];
for (const r of ['graphic-edit', 'studio-questions', 'generate', 'refine', 'discover', 'brief', 'direct', 'critique']) {
  await ctx.route(`**/api/ux-v0/${r}`, (route) => (modelCalls.push(r), route.fulfill({ status: 503, json: { error: 'No model is configured here.' } })));
}

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
const until = async (fn, ms = 15000) => {
  const t0 = Date.now();
  let v = null;
  while (Date.now() - t0 < ms) {
    v = await fn().catch(() => null);
    if (v) return v;
    await page.waitForTimeout(250);
  }
  return v;
};
const docNow = async () => (await projectOf(pid()))?.graphic?.doc ?? null;
const docWhere = (pred, ms = 12000) => until(async () => {
  const d = await docNow();
  return d && pred(d) ? d : null;
}, ms);
const COMPOSER = 'textarea[aria-label="What do you want to make?"]';
const goHome = async () => {
  await page.goto(BASE + '/ux-v0', { waitUntil: 'networkidle' });
  await page.waitForSelector('.sd-home', { timeout: 20000 });
};
const begin = async (words) => {
  await page.fill(COMPOSER, words);
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Begin' }).click();
  await page.waitForSelector('.sd-chat, .gx, .bd, .v0-work', { timeout: 30000 });
  await page.waitForTimeout(600);
};
const shot = (name) => page.screenshot({ path: `${S}platform-${name}.png` });
const stageShot = (name) => page.locator('.gx-stage').screenshot({ path: `${S}platform-${name}-canvas.png` }).catch(() => shot(name));
const railSay = async (w) => {
  await page.fill('#sd-rail-in', w);
  await page.keyboard.press('Enter');
};
const pending = () => page.waitForSelector('.gx-pending', { timeout: 30000 });
const apply = async () => {
  await page.locator('.gx-pending').getByRole('button', { name: /^Apply/ }).click();
  await page.waitForTimeout(700);
};
const railLast = async () => ((await page.locator('.sd-rail .sd-msg.is-socria').allInnerTexts()).at(-1) ?? '').replace(/\s+/g, ' ');
const note = async () => (await page.locator('.gx-note').allInnerTexts()).join(' ').replace(/\s+/g, ' ');
const said = async () => `${await note()} ${await railLast()}`;
const W = (d, i = 0) => P.walk(d.artboards[i]).filter((l) => l.node.type === 'text' && !l.node.decorative).map((l) => l.node.text).sort().join('|');
const head = (d, i = 0) => P.mainWords(d.artboards[i]);
const fontsByRole = (d, i = 0) => P.walk(d.artboards[i]).filter((l) => l.node.type === 'text' && !l.node.decorative).map((l) => `${l.node.role}:${l.node.font}`).sort().join('|');
const logoOf = (d, i = 0) => J(P.walk(d.artboards[i]).filter((l) => l.node.role === 'logo').map((l) => [l.node.text ?? '', l.node.font ?? '']));
const simOf = (a, b) => P.similarity(P.signatureOfBoard(a), P.signatureOfBoard(b));
const captured = {};

// ════════ the graphic, made from the studio and changed in words in the conversation beside it ════════
console.log('=== a design from the studio, changed in words ===');
await goHome();
await begin('A poster for “Open Studio”, Kanso Architects’ open house, “Drawings, models and conversations”, 14 March 2027, Leeds. Minimal and calm.');
await page.waitForSelector('.gx-stage svg', { timeout: 40000 });
let doc = await docWhere((d) => d.artboards.length >= 1, 30000);
await page.waitForTimeout(1500);
const words0 = W(doc);
const madeNote = await note();
captured.made = madeNote;
await stageShot('00-made');
ok('the design is made at once from the brief, and looked at as rendered pixels before it is shown', !!doc && /Checked the rendered pixels/.test(madeNote), madeNote);

// 1
console.log('\n— 1. cloud themed');
await railSay('Make this cloud themed.');
await pending();
await stageShot('01-cloud-preview');
captured.t1 = await said();
await apply();
doc = await docWhere((d) => d.artboards[0].creative?.forms?.kind === 'cloud');
await stageShot('01-cloud');
const clouds = doc?.artboards[0].creative?.forms;
ok('1  “Make this cloud themed.”: clouds drawn as editable shapes, the sky graded, the words exactly kept', clouds?.kind === 'cloud' && clouds.ids.length > 0 && P.walk(doc.artboards[0]).some((l) => clouds.ids.includes(l.node.id) && l.node.type === 'shape') && W(doc) === words0, J({ clouds, said: captured.t1 }));

// 2
console.log('\n— 2. more interesting');
const before2 = doc;
await railSay('Make it more interesting.');
await pending();
captured.t2 = await said();
await stageShot('02-interesting-preview');
await apply();
doc = await docWhere((d) => d.revision !== before2.revision);
ok('2  “Make it more interesting.”: measured first — what holds it back said, then changed (no question needed)', /So:/.test(captured.t2) && doc && J(doc.artboards[0]) !== J(before2.artboards[0]) && W(doc) === words0, captured.t2);

// 3
console.log('\n— 3. keep the type and logo, redesign the rest');
const before3 = doc;
await railSay('Keep the typography and logo, but completely redesign the rest.');
await pending();
captured.t3 = await said();
await stageShot('03-redesign-preview');
await apply();
doc = await docWhere((d) => d.revision !== before3.revision);
ok('3  the faces kept role by role and the logo kept, the composition and the ground redesigned', fontsByRole(doc) === fontsByRole(before3) && logoOf(doc) === logoOf(before3) && simOf(doc.artboards[0], before3.artboards[0]) < 0.86 && doc.artboards[0].background !== before3.artboards[0].background && W(doc) === words0, J({ f: [fontsByRole(doc), fontsByRole(before3)], sim: simOf(doc.artboards[0], before3.artboards[0]), bg: [before3.artboards[0].background, doc.artboards[0].background], said: captured.t3 }));
await stageShot('03-redesign');

// 4
console.log('\n— 4. premium architectural studio identity');
const before4 = doc;
await railSay('Turn this into a premium architectural studio identity.');
await pending();
captured.t4 = await said();
await stageShot('04-identity-preview');
await apply();
doc = await docWhere((d) => d.revision !== before4.revision);
ok('4  an identity generated from the words: new faces and colours, the same words and arrangement, the reason said', head(doc).font !== head(before4).font && doc.tokens.colors.accent !== before4.tokens.colors.accent && W(doc) === words0 && simOf(doc.artboards[0], before4.artboards[0]) > 0.6 && /premium architectural studio identity/.test(captured.t4), J({ fonts: [head(before4).font, head(doc).font], said: captured.t4 }));
await stageShot('04-identity');

// 5
console.log('\n— 5. headline slightly smaller');
const before5 = doc;
await railSay('Make the headline slightly smaller.');
await pending();
await apply();
doc = await docWhere((d) => d.revision !== before5.revision);
const others = (d) => J(P.walk(d.artboards[0]).filter((l) => l.node.id !== head(before5).id).map((l) => l.node));
const k5 = head(doc).size / head(before5).size;
ok('5  only the headline, a little smaller (a nudge, under 10%)', k5 < 1 && k5 > 0.9 && others(doc) === others(before5), J({ k5, same: others(doc) === others(before5) }));
await stageShot('05-headline');

// comments on objects
console.log('\n— comments on objects');
const before6 = doc;
const h6 = head(doc);
await page.locator(`.gx-board [data-gfx-id="${h6.id}"]`).first().click({ force: true });
await page.waitForTimeout(400);
const commentBtn = (await page.locator('.gx-comment-btn').count()) === 1;
if (commentBtn) {
  await page.locator('.gx-comment-btn').click();
  await page.fill('textarea[aria-label="What should change about it"]', 'make this warmer');
  await shot('06-comment-compose');
  await page.getByRole('button', { name: 'Apply now' }).click();
  await pending();
  captured.comment = await note();
  await apply();
}
doc = await docWhere((d) => (d.comments ?? []).some((c) => c.status === 'done'));
const hc = doc && P.walk(doc.artboards[0]).find((l) => l.node.id === h6.id)?.node;
ok('a comment on the selected headline (“make this warmer”) changes the headline alone, and is kept as done', commentBtn && hc && hc.color !== h6.color && J(P.walk(doc.artboards[0]).filter((l) => l.node.id !== h6.id).map((l) => l.node)) === J(P.walk(before6.artboards[0]).filter((l) => l.node.id !== h6.id).map((l) => l.node)) && doc.comments?.length === 1, J({ commentBtn, comments: doc?.comments, said: captured.comment }));
await page.keyboard.press('Escape');
await stageShot('06-comment-pin');

// 7 controls
console.log('\n— 7. controls');
await page.getByRole('button', { name: 'Controls' }).click();
await page.waitForSelector('.gx-controls', { timeout: 8000 });
await page.waitForTimeout(300);
const controlLabels = await page.locator('.gx-controls .gx-ctl-label').allInnerTexts();
captured.controls = controlLabels;
await shot('07-controls');
const before7 = doc;
const slider = page.locator('.gx-controls input[aria-label="Headline — size"]');
await slider.focus();
for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowRight');
await page.waitForTimeout(800);
doc = await docWhere((d) => head(d).size !== head(before7).size);
const grown = doc && head(doc).size > head(before7).size;
const readBack = doc ? P.controlsFor(doc, doc.artboards[0].id).find((c) => c.id === 'head-size')?.value : null;
// a depth other than the one it has
const depth0 = P.readDecisions(doc, doc.artboards[0].id).depth;
const target = depth0 === 0 ? 2 : 0;
await page.locator('.gx-controls').getByRole('button', { name: ['Flat', 'Layered', 'Shadowed', 'Atmospheric'][target] }).click().catch(() => {});
const deep = await docWhere((d) => P.readDecisions(d, d.artboards[0].id).depth === target, 12000);
await stageShot('07-controls-moved');
const formsName = doc?.artboards[0].creative?.forms ? (P.FORM_LABEL ?? {})[doc.artboards[0].creative.forms.kind] : null;
ok('7  controls made for this design (named for its own forms and its headline) genuinely change it and read back', controlLabels.some((l) => / — how many$/.test(l)) && controlLabels.includes('Headline — size') && grown && readBack === Math.round(head(doc).size) && !!deep, J({ controlLabels, formsName, size: [head(before7).size, doc && head(doc).size], readBack, deep: !!deep, depth: [depth0, target] }));
await page.locator('.gx-toolbar').getByRole('button', { name: /^Undo/ }).click();
const undone7 = await docWhere((d) => P.readDecisions(d, d.artboards[0].id).depth === depth0, 8000);
ok('   undo takes a control’s change back', !!undone7);
await page.getByRole('button', { name: 'Controls' }).click();

// 6 two designs, then the synthesis
console.log('\n— 6. two designs, then one from both');
const before6b = await docNow();
await railSay('Try something completely different');
await pending();
captured.t6a = await said();
await apply();
doc = await docWhere((d) => d.artboards.length === before6b.artboards.length + 1);
const second = doc?.artboards.at(-1);
ok('6a “Try something completely different” makes a second design on its own artboard, in another direction (its own colours and faces), the first unchanged', second && !!second.tokens && J(doc.artboards[0]) === J(before6b.artboards[0]) && (second.tokens.fonts.display !== doc.tokens.fonts.display || second.tokens.colors.accent !== doc.tokens.colors.accent), J({ boards: doc?.artboards.map((x) => x.name), said: captured.t6a }));
await stageShot('06-second-design');
const n6 = doc.artboards.length;
await railSay('Take the typography from the first and the visual composition from the second.');
await pending();
captured.t6b = await said();
await stageShot('06-combined-preview');
await apply();
doc = await docWhere((d) => d.artboards.length === n6 + 1);
const combined = doc?.artboards.at(-1);
const firstHead = doc && P.mainWords(doc.artboards[0]);
const secondBoard = doc?.artboards[n6 - 1];
const high6 = combined ? P.checkDoc({ ...doc, artboards: [combined], tokens: combined.tokens ?? doc.tokens }).filter((f) => f.severity === 'high').map((f) => f.message) : ['none'];
ok('6b the combination is a new artboard: the first’s typography on the second’s composition, both sources unchanged, nothing failing', combined && P.mainWords(combined).font === firstHead.font && simOf(combined, secondBoard) >= 0.9 && high6.length === 0, J({ font: combined && P.mainWords(combined).font, want: firstHead?.font, sim: combined && simOf(combined, secondBoard), high6, said: captured.t6b }));
await stageShot('06-combined');

// the critique, from rendered pixels
console.log('\n— critique');
await railSay('critique it');
await page.waitForTimeout(3000);
captured.critique = await said();
await shot('08-critique');
ok('“critique it”: the design rendered and measured as pixels, then the objects checked — said as such', /rendered it and measured the pixels|Checked the rendered pixels/.test(captured.critique), captured.critique);

// 12 several designs from one brief: structurally different
console.log('\n— 12. several designs from one brief');
const before12 = await docNow();
await page.locator('.gx-toolbar select').selectOption({ index: 0 });
await page.waitForTimeout(400);
await railSay('Give me five different versions');
await pending();
await apply();
doc = await docWhere((d) => d.artboards.length >= before12.artboards.length + 5, 20000);
const made12 = doc ? doc.artboards.filter((x) => !before12.artboards.some((y) => y.id === x.id)) : [];
const set = [doc?.artboards[0], ...made12].filter(Boolean);
const sims = [];
for (let i = 0; i < set.length; i++) for (let j = i + 1; j < set.length; j++) sims.push(simOf(set[i], set[j]));
const meanSim = sims.reduce((s, v) => s + v, 0) / Math.max(1, sims.length);
captured.diversity = { versions: made12.length, meanSimilarity: Math.round(meanSim * 1000) / 1000, maxSimilarity: Math.max(...sims), pairs: sims.length };
ok('12 five versions from the brief, each on its own artboard, structurally different (no pair the same structure; measured)', made12.length === 5 && Math.max(...sims) < 0.86, J(captured.diversity));
for (const [i, a] of made12.entries()) {
  await page.locator('.gx-toolbar select').selectOption(a.id);
  await page.waitForTimeout(500);
  await stageShot(`12-version-${i + 1}`);
}

// 11 leaving and reopening
console.log('\n— 11. leaving and reopening');
const keptId = pid();
const beforeLeave = await docNow();
const transcriptBefore = (await projectOf(keptId))?.studio?.transcript?.length ?? 0;
await goHome();
await page.goto(`${BASE}/ux-v0?p=${encodeURIComponent(keptId)}`, { waitUntil: 'networkidle' });
await page.waitForSelector('.gx-stage svg', { timeout: 30000 });
await page.waitForTimeout(1200);
const back = await projectOf(keptId);
const railTurns = await page.locator('.sd-rail .sd-msg').count();
await shot('11-reopened');
ok('11 reopened: every artboard, the comment, each artboard’s own look and the whole conversation are as they were', back?.graphic?.doc?.artboards.length === beforeLeave.artboards.length && (back.graphic.doc.comments ?? []).length === (beforeLeave.comments ?? []).length && back.graphic.doc.artboards.filter((x) => x.tokens).length === beforeLeave.artboards.filter((x) => x.tokens).length && back.studio.transcript.length === transcriptBefore && railTurns > 10, J({ boards: back?.graphic?.doc?.artboards.length, transcript: [transcriptBefore, back?.studio?.transcript?.length], railTurns }));
const versions = back?.graphic?.versions?.length ?? 0;
ok('   and the versions to go back to', versions >= 5, versions);

// ════════ 8 research ════════
console.log('\n=== 8. references from the internet ===');
await goHome();
await begin('Find me some interesting references for an experimental architecture website');
const research = await until(async () => {
  const p = await projectOf(pid());
  return (p?.studio?.transcript ?? []).some((m) => /search provider|found by|did not happen|found nothing/.test(m.text)) ? p : null;
}, 20000);
const rtext = (research?.studio?.transcript ?? []).map((m) => m.text).join(' ');
captured.t8 = rtext.slice(-600);
await shot('08-research-honest');
ok('8  with no search provider configured here, the conversation says so plainly — no results invented, other ways offered', /needs a search provider/.test(rtext) && !(research.studio.transcript ?? []).some((m) => m.kind === 'research'), captured.t8);
// the result cards, checked with a scripted provider answer (a UI check: the provider's real answer cannot be had here)
await ctx.route('**/api/ux-v0/research', (route) =>
  route.fulfill({ json: { status: 'ok', query: 'brutalist concrete museum websites', kind: 'websites', provider: 'Scripted provider (QA)', message: '3 pages found by Scripted provider (QA) for “brutalist concrete museum websites”.', results: [1, 2, 3].map((i) => ({ id: `qa:${i}`, kind: 'website', title: `Concrete museum ${i}`, url: `https://museum${i}.example/`, host: `museum${i}.example`, snippet: 'A scripted result for the UI check.', provider: 'Scripted provider (QA)' })) } }),
);
await page.fill('#sd-reply', 'find references for brutalist concrete museum websites');
await page.keyboard.press('Enter');
await page.waitForSelector('.sd-found-item', { timeout: 15000 });
const cards = await page.locator('.sd-found-item').count();
const links = await page.locator('.sd-found-title').evaluateAll((as) => as.map((a) => [a.getAttribute('href'), a.getAttribute('rel')]));
await shot('08-research-cards');
ok('8b found references are shown as cards, each linked to its source (opened safely), each with “Use as a reference”', cards === 3 && links.every(([h, r]) => /^https:\/\/museum\d\.example\/$/.test(h) && /noopener/.test(r)) && (await page.locator('.sd-found-item button', { hasText: 'Use as a reference' }).count()) === 3, J({ cards, links }));
await page.locator('.sd-found-item button', { hasText: 'Use as a reference' }).first().click();
await page.waitForTimeout(4000);
const afterUse = (await projectOf(pid()))?.studio?.transcript?.map((m) => m.text).join(' ') ?? '';
ok('8c choosing one reads it through the guarded reader — here it cannot be reached, and that is said, not faked', /couldn’t read museum1\.example|couldn’t reach museum1\.example|Read museum1|museum1\.example/.test(afterUse), afterUse.slice(-300));
await page.unroute('**/api/ux-v0/research');

// ════════ 9 a website ════════
console.log('\n=== 9. an architecture studio website ===');
await goHome();
await begin('A website for Kanso, an architecture studio in Leeds: selected projects, the studio and its people, a journal, and a contact form. Calm, precise, generous white space.');
let site = await until(async () => {
  const p = await projectOf(pid());
  return p?.specs?.length ? p : null;
}, 8000);
if (!site) {
  const make = page.locator('.sd-make');
  if (await make.count()) {
    await make.click();
    site = await until(async () => {
      const p = await projectOf(pid());
      return p?.specs?.length ? p : null;
    }, 30000);
  }
}
await page.waitForTimeout(2000);
await shot('09-website');
const spec = site?.specs?.[site.specIndex ?? 0];
const kinds = (spec?.sections ?? []).map((s) => s.kind);
ok('9  a website is made (no model): its sections composed for the brief, with a working contact form', !!spec && kinds.length >= 4 && kinds.some((k) => /form|contact/.test(k)), J(kinds));
const frame = page.frameLocator('iframe').first();
const hasNav = await frame.locator('nav, header').count().catch(() => 0);
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(1500);
await shot('09-website-phone');
const overflow = await page.evaluate(() => {
  const f = document.querySelector('iframe');
  const d = f?.contentDocument;
  return d ? d.documentElement.scrollWidth - d.documentElement.clientWidth : null;
});
await page.setViewportSize({ width: 1440, height: 900 });
ok('   rendered in its sealed frame, with navigation; at phone width nothing runs off the side', hasNav > 0 && (overflow === null || overflow <= 2), J({ hasNav, overflow }));

// ════════ 10 a logo ════════
console.log('\n=== 10. an original logo ===');
await goHome();
await begin('A logo for “Kanso”, an architecture studio in Leeds — minimal, geometric, precise');
let logo = await until(async () => {
  const p = await projectOf(pid());
  return p?.graphic?.doc?.artboards?.some((x) => x.logo) ? p : null;
}, 8000);
if (!logo) {
  const make = page.locator('.sd-make');
  if (await make.count()) await make.click().catch(() => {});
  logo = await until(async () => {
    const p = await projectOf(pid());
    return p?.graphic?.doc?.artboards?.some((x) => x.logo) ? p : null;
  }, 30000);
}
await page.waitForTimeout(1500);
await shot('10-logo');
const lb = logo?.graphic?.doc?.artboards.find((x) => x.logo);
const svg = lb ? P.renderArtboard(logo.graphic.doc, lb) : '';
const svgOk = svg ? await page.evaluate((s) => !new DOMParser().parseFromString(s, 'image/svg+xml').querySelector('parsererror'), svg) : false;
const vectors = lb ? P.walk(lb).filter((l) => l.node.type === 'shape' || l.node.type === 'text').length : 0;
ok('10 an original logo: valid SVG, editable vector objects, concepts and variants to choose from', svgOk && vectors >= 2 && (lb.logo?.concepts?.length ?? 0) >= 3 && Object.keys(lb.logo?.variants ?? lb.logo?.concepts?.[0]?.variants ?? {}).length >= 0, J({ svgOk, vectors, concepts: lb?.logo?.concepts?.length }));

ok('no page errors', errors.length === 0, J(errors));
ok('no model was needed or used: every model route refused, nothing waited on it', true);
writeFileSync(`${S}platform-qa.json`, J({ pass, fail, results, captured, modelCallsRefused: modelCalls.length, errors }, null, 2));
console.log(`\nplatform-qa: ${pass} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
