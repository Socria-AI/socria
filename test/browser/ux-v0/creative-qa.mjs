// test/browser/ux-v0/creative-qa.mjs — creative changes in words and concepts to work with, in the built app.
//
//   broad words      “make it cloud themed” read and carried out at once (no model needed for words read plainly),
//                    previewed, applied: clouds, a sky, the words and the logo exactly as they were
//   the model        words the browser cannot read plainly go to the model's route (scripted here: what it is sent is
//                    recorded, what it answers is a plan) — the design as a compact reading, no pictures
//   one question     “change the overall aesthetic” answered with one question and its answers as buttons; a tap acts
//   no model         the route refused (signed out): the browser reads the words itself and carries on, says nothing
//                    about models, and leaves the model alone afterwards
//   never stuck      words nothing can be made of get a question whose answers work — never “without a model”
//   decisions        the Concept tab: each decision in words with where it came from; a move on one alone; one put
//                    back alone, the rest kept
//   concepts         one kept, the design moved on, compared side by side, gone back to (what was there kept first)
//   and              no page errors; screenshots of each state, for a person to look at
//
//   UXV0_FORWARD=1 UXV0_BASE=http://127.0.0.1:3100 node test/browser/ux-v0/creative-qa.mjs   (against `next start`)
import { writeFileSync } from 'node:fs';
import { chromium, S, BASE, underTest, handBrief } from './env.mjs';

const V = await underTest();
const D = V.gfxDoc;
const J = JSON.stringify;
let pass = 0;
let fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok  ', n)) : (fail++, console.log('  FAIL', n, String(x).slice(0, 600))));
const errors = [];
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
// against a server started with placeholder Clerk keys of a development instance, Clerk's middleware redirects a page
// without a dev-browser cookie to its handshake on the placeholder's host; a placeholder cookie keeps the visit a
// plain signed-out one (nothing is signed in, nothing is sent anywhere)
await ctx.addCookies([{ name: '__clerk_db_jwt', value: 'qa-placeholder', url: BASE }]);
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));

// the model's route, scripted: what it is sent, and what it answers (a refusal when nothing is scripted)
const sent = [];
const script = [];
await ctx.route('**/api/ux-v0/graphic-edit', async (route) => {
  sent.push(JSON.parse(route.request().postData() || '{}'));
  const next = script.shift() ?? { status: 503, json: { error: 'The AI provider is busy right now. Nothing changed; try again in about 10 seconds.', retryAfter: 10 } };
  return route.fulfill({ status: next.status, json: next.json });
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
const docWhere = async (pred, ms = 8000) => {
  const start = Date.now();
  let d = null;
  while (Date.now() - start < ms) {
    d = (await projectOf(pid()))?.graphic?.doc ?? null;
    if (d && pred(d)) return d;
    await page.waitForTimeout(250);
  }
  return d;
};
const words = (d) => D.walk(d.artboards[0]).filter((l) => l.node.type === 'text' && !l.node.decorative).map((l) => l.node.text).sort().join('|');
const rec = (d) => d?.artboards[0]?.creative ?? null;
const noteText = async () => (await page.locator('.gx-note').allInnerTexts()).join(' ');
const pageText = async () => page.locator('body').innerText();
const shot = (name) => page.screenshot({ path: `${S}creative-${name}.png` });
const canvasShot = (name) => page.locator('.gx-stage').screenshot({ path: `${S}creative-${name}-canvas.png` });
const tab = (name) => page.locator('.gx-tab', { hasText: name }).click();
const say = async (w) => {
  await page.fill('#gx-ask-in', w);
  await page.locator('.gx-ask button[type=submit]').click();
};
const preview = async () => {
  await page.waitForSelector('.gx-pending', { timeout: 15000 });
  await page.waitForTimeout(300);
};
const apply = async () => {
  await page.locator('.gx-pending').getByRole('button', { name: /^Apply/ }).click();
  await page.waitForTimeout(400);
};

console.log('=== creative changes in words, and concepts to work with ===');
await page.goto(BASE + '/ux-v0', { waitUntil: 'networkidle' });
await handBrief(page, 'graphic', 'A poster for “Open Air”, a summer music festival, “Music in the park, all weekend”, 12–14 July 2027, bold');
await page.fill('#gx-brand', 'Parklife Society');
// the design is composed at once from the brief (no direction to choose first)
await page.getByRole('button', { name: /^Make it$/ }).click();
await page.waitForSelector('.gx-canvas .gx-board svg', { timeout: 30000 });
await page.waitForTimeout(1200);
let doc = await docWhere((d) => d.artboards.length >= 1);
const words0 = words(doc);
const logo0 = J(D.walk(doc.artboards[0]).filter((l) => l.node.role === 'logo').map((l) => [l.node.text, l.node.font]));
await canvasShot('00-start');

// ── broad words, read plainly ──
await say('I want to make it cloud themed');
await preview();
const cloudNote = await noteText();
await canvasShot('01-cloud-preview');
ok('“I want to make it cloud themed” is previewed at once, said in words (clouds, a sky)', /cloud/i.test(cloudNote) && (await page.locator('.gx-pending').count()) === 1, cloudNote);
ok('  read plainly in the browser: the model was not needed', sent.length === 0, sent.length);
await apply();
doc = await docWhere((d) => rec(d)?.forms?.kind === 'cloud');
await canvasShot('01-cloud');
ok('  applied: clouds drawn as editable shapes, the sky graded, the record kept with the artboard', rec(doc)?.forms?.kind === 'cloud' && rec(doc).forms.ids.length > 0 && D.walk(doc.artboards[0]).some((l) => rec(doc).forms.ids.includes(l.node.id) && l.node.type === 'shape'), J(rec(doc)?.forms));
ok('  the words exactly as they were, the logo kept', words(doc) === words0 && J(D.walk(doc.artboards[0]).filter((l) => l.node.role === 'logo').map((l) => [l.node.text, l.node.font])) === logo0, J({ w: words(doc), w0: words0 }));

// ── precise edits stay precise; a creative change over a preview replaces it, never applies it ──
const cloudId = rec(doc).forms.ids[0];
await page.locator(`.gx-board [data-gfx-id="${cloudId}"]`).first().click({ force: true });
await page.waitForTimeout(300);
await say('#c2410c');
await preview();
const preciseLabel = await page.locator('.gx-pending').innerText();
ok('a colour said with a shape selected is the precise edit of that shape (no model, no creative reading)', /c2410c/i.test(preciseLabel) && sent.length === 0, preciseLabel);
await page.locator('.gx-pending').getByRole('button', { name: /^Discard/ }).click();
await page.waitForTimeout(300);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
const coloursBefore = J((await docWhere(() => true)).tokens.colors);
await say('make the colours warmer');
await preview();
ok('while a preview waits, the ask box stays: the next change can be said at once', (await page.locator('#gx-ask-in').count()) === 1);
await say('no, make the colours cooler');
await preview();
const cooler = await noteText();
ok('“no, …” turns the preview down and makes the new change instead (nothing applied yet)', /cooler/i.test(cooler) && J((await docWhere(() => true)).tokens.colors) === coloursBefore, cooler);
await say('Keep the typography but change the background');
await preview();
const chained = await noteText();
const taken = J((await docWhere((d) => J(d.tokens.colors) !== coloursBefore)).tokens.colors);
ok('a new change over a preview builds on it: the cooler colours taken, the new ground previewed on top (“keep…” is never read as “apply”)', /ground/i.test(chained) && taken !== coloursBefore && (await page.locator('.gx-pending').count()) === 1, J({ chained }));
await page.locator('.gx-pending').getByRole('button', { name: /^Discard/ }).click();
await page.waitForTimeout(300);
await page.locator('.gx-toolbar').getByRole('button', { name: /^Undo/ }).click();
const undone = await docWhere((d) => J(d.tokens.colors) === coloursBefore);
ok('  and undo takes the taken one back, step by step', J(undone.tokens.colors) === coloursBefore, J(undone.tokens.colors));
await page.waitForTimeout(300);

// ── the model, when the words need it (scripted answer) ──
script.push({ status: 200, json: { plan: { intent: 'theme', summary: 'You get a rain-washed afternoon: soft drops over a cool sky, quieter and more editorial.', keep: ['words'], changes: [{ decision: 'theme', theme: 'rain', forms: null, abstraction: 55, mode: null }, { decision: 'mood', qualities: ['calm', 'editorial'] }], question: null, by: 'model' } } });
await say('Make it feel like a rainy afternoon in Paris, a little wistful');
await preview();
ok('words the browser cannot read plainly go to the model once', sent.length === 1 && /rainy afternoon in Paris/.test(sent[0].words), J(sent.map((s) => s.words)));
ok('  it is sent the design as a compact reading — its words, palette, decisions — and no pictures', sent[0].reading?.objects?.some((o) => o.words === 'Open Air') && sent[0].reading.decisions?.length === 7 && !/data:image/.test(J(sent[0])), J(sent[0]).slice(0, 300));
await canvasShot('02-rain-preview');
await apply();
doc = await docWhere((d) => rec(d)?.theme === 'rain');
ok('  the model’s plan, carried out by the engine: the rain theme, calm and editorial', rec(doc)?.theme === 'rain' && (rec(doc).qualities ?? []).includes('calm') && words(doc) === words0, J({ theme: rec(doc)?.theme, q: rec(doc)?.qualities }));
await canvasShot('02-rain');

// ── one question, when the words could mean different things ──
script.push({ status: 200, json: { plan: { intent: 'style', summary: 'A new direction for the aesthetic.', keep: [], changes: [], question: { text: 'Which way should it go?', options: [{ label: 'Quieter and more refined', words: 'make it more sophisticated' }, { label: 'Bolder and more expressive', words: 'make it more expressive and alive' }, { label: 'Darker and more dramatic', words: 'make it more dramatic' }] }, by: 'model' } } });
await say('Change the overall aesthetic');
await page.waitForSelector('.gx-note-opts button', { timeout: 15000 });
const opts = await page.locator('.gx-note-opts button').allInnerTexts();
await shot('03-question');
ok('“change the overall aesthetic”: one question, its answers as buttons, nothing changed yet', opts.length === 3 && (await page.locator('.gx-pending').count()) === 0 && /Which way/.test(await noteText()), J(opts));
const asked = sent.length;
await page.locator('.gx-note-opts button', { hasText: 'Quieter and more refined' }).click();
await preview();
ok('  a tap on an answer acts on it (read plainly, no second call)', sent.length === asked && /muted|restrained|refined/.test(await noteText()), await noteText());
await apply();
doc = await docWhere((d) => (rec(d)?.qualities ?? []).includes('sophisticated'));
await canvasShot('03-sophisticated');
ok('  applied: more sophisticated', (rec(doc)?.qualities ?? []).includes('sophisticated'), J(rec(doc)?.qualities));

// ── the model cannot be reached: the browser carries on ──
script.push({ status: 401, json: { error: 'Sign in to use SocriaUX’s reasoning. Your work stays in this browser either way.', signIn: true } });
const beforeCompound = sent.length;
await say('Keep the composition, make the typography more editorial, replace the clouds with abstract organic forms, and make the overall aesthetic more sophisticated.');
await preview();
const compoundNote = await noteText();
ok('the compound instruction: the model was tried once, refused, and the browser read it itself', sent.length === beforeCompound + 1 && /editorial/i.test(compoundNote), J({ calls: sent.length - beforeCompound, compoundNote }));
ok('  the person hears what will change — nothing about models or signing in', !/model|sign in/i.test(compoundNote), compoundNote);
await canvasShot('04-compound-preview');
await apply();
doc = await docWhere((d) => rec(d)?.forms?.kind === 'organic');
ok('  applied: organic forms, abstract; the words as they were', rec(doc)?.forms?.kind === 'organic' && rec(doc).forms.abstraction >= 70 && words(doc) === words0, J(rec(doc)?.forms));
await canvasShot('04-compound');
const quiet = sent.length;
await say('Give it more energy, like a city at night but softer');
await preview().catch(() => {});
ok('  afterwards the model is left alone for a while (no call per change while it cannot answer)', sent.length === quiet, sent.length - quiet);
if (await page.locator('.gx-pending').count()) await page.locator('.gx-pending').getByRole('button', { name: /^Discard/ }).click();

// ── never stuck, never “without a model” ──
await say('flibber the wotsit');
await page.waitForSelector('.gx-note-opts button', { timeout: 15000 });
const stuck = await noteText();
ok('words nothing can be made of: a question with answers that work, never an internal limitation', (await page.locator('.gx-note-opts button').count()) === 4 && !/without a model/i.test(await pageText()), stuck);

// ── decisions, each movable on its own ──
await tab('Concept');
await page.waitForSelector('.gx-decision', { timeout: 10000 });
await shot('05-decisions');
const rows = await page.locator('.gx-decision').count();
const yours = await page.locator('.gx-src.is-you').count();
ok('the Concept tab: each of the seven decisions in words, with where it came from', rows === 7 && yours >= 3, J({ rows, yours }));
const colours0 = J(doc.tokens.colors);
await page.locator('.gx-decision').filter({ has: page.locator('.gx-decision-h b', { hasText: /^Colour$/ }) }).locator('.gx-move', { hasText: 'Warmer' }).click();
await preview();
await apply();
doc = await docWhere((d) => J(d.tokens.colors) !== colours0);
const fontsWarm = J(doc.tokens.fonts);
ok('a move on the colour alone: warmer, the type untouched', J(doc.tokens.colors) !== colours0, J(doc.tokens.colors));
await page.locator('.gx-decision').filter({ has: page.locator('.gx-decision-h b', { hasText: /^Colour$/ }) }).locator('.gx-move', { hasText: 'Put back' }).click();
await preview();
await apply();
doc = await docWhere((d) => J(d.tokens.colors) === colours0);
ok('  the colour put back alone: exactly as before, the type still as it was', J(doc.tokens.colors) === colours0 && J(doc.tokens.fonts) === fontsWarm, J({ c: doc.tokens.colors, f: doc.tokens.fonts }));

// ── concepts: kept, moved on, compared, gone back to ──
await page.getByRole('button', { name: 'Keep this concept' }).click();
doc = await docWhere((d) => (d.concepts ?? []).length === 1);
ok('a concept kept, with its decisions', doc.concepts?.length === 1 && doc.concepts[0].board.creative?.forms?.kind === 'organic', J(doc.concepts?.map((c) => c.name)));
await say('Make it more dramatic');
await preview();
await apply();
doc = await docWhere((d) => (rec(d)?.qualities ?? []).includes('dramatic'));
await page.waitForTimeout(800);
await canvasShot('06-dramatic');
const checks = await page.locator('.gx-right').innerText();
ok('the heavier type for drama is fitted to its real face: no word broken mid-word, nothing overflowing, nothing left to fix', /Checks\s*nothing to fix/i.test(checks) && !/breaks mid-word|wider than its box|do not fit/i.test(checks), checks.slice(0, 300));
await page.getByRole('button', { name: 'Compare' }).click();
await page.waitForSelector('.gx-cmp-card', { timeout: 10000 });
await page.waitForTimeout(500);
const cards = await page.locator('.gx-cmp-card').count();
await shot('07-compare');
ok('concepts side by side: this one now and the one kept, each drawn with what it decided', cards >= 2 && (await page.locator('.gx-cmp-card .gx-cmp-art svg').count()) >= 2, cards);
await page.locator('.gx-cmp-card.is-kept').first().getByRole('button', { name: 'Go back to it' }).click();
doc = await docWhere((d) => (d.concepts ?? []).length === 2 && !(rec(d)?.qualities ?? []).includes('dramatic'));
await canvasShot('08-back');
ok('gone back to it: the kept concept on the artboard, what was there kept first', doc.concepts?.length === 2 && !(rec(doc)?.qualities ?? []).includes('dramatic') && rec(doc)?.forms?.kind === 'organic' && words(doc) === words0, J({ n: doc.concepts?.length, q: rec(doc)?.qualities }));

ok('no page errors', errors.length === 0, errors.join(' | '));
writeFileSync(`${S}creative-qa-results.json`, J({ pass, fail, sent: sent.map((s) => s.words) }, null, 1));
await b.close();
console.log(`\n${pass} passed, ${fail} failed — screenshots in ${S}`);
process.exit(fail ? 1 : 0);
