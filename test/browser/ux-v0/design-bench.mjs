// test/browser/ux-v0/design-bench.mjs — the rebuilt designer, benchmarked on real requests, drawn and kept as pictures.
//
// The workspace runs in Chromium (design-harness), deterministic (a seeded Math.random, a clock that only moves on),
// so the same answers replay the same designs. Its requests to /api/ux-v0/design are read into the exact call the
// route makes (lib/ux-v0/design/request.ts readDesignRequest) and written to an exchange folder: the instructions
// once (system.md), each message (req-<key>.md) and its pictures (pic-<key>-<n>.jpg). A model answers by writing
// ans-<key>.txt — the raw answer, in the designer's tags. A request not yet answered stops its scenario; run again
// when the answers are there. Latency and cost are not measured this way (the answers are not the API's).
//
//   UXV0_OUT=<dir> node test/browser/ux-v0/design-bench.mjs [scenario-filter]
//   DESIGN_EXTRA=<file.json> adds first designs from other briefs ([{ id, brief, kind, format }])
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, S, ROOT } from './env.mjs';
import { buildHarness, serveHarness } from './design-harness/build.mjs';
import { buildOnly } from '../../helpers/build.mjs';

const OUT = `${S}design-bench/`;
const EX = `${OUT}exchange/`;
const BUNDLE = `${OUT}bundle/`;
mkdirSync(EX, { recursive: true });
await buildOnly(['design-under-test']);
await buildHarness(ROOT, BUNDLE);
const T = await import(pathToFileURL(join(ROOT, 'test/.tmp/design-under-test.mjs')).href);
writeFileSync(`${EX}system.md`, T.prompts.designSystem());
const only = process.argv[2] ?? '';

const BASE_BRIEF = 'A poster for a lecture series on the future of housing, at an architecture studio. Headline: Rooms for Living. Supporting line: Six evenings on the future of housing. Details: Thursdays, 2 October – 6 November; Northlight Studio, 14 Dock Street. Call to action: Reserve a seat. Brand: Northlight.';
const SCENARIOS = [
  { id: 'base', brief: BASE_BRIEF, kind: 'poster', format: 'a3' },
  { id: 'A', from: 'base', steps: ['Make this cloud themed.'] },
  { id: 'B', from: 'base', steps: ['Make this feel more sophisticated and atmospheric.'] },
  { id: 'C', from: 'base', steps: ['Make this look like a premium architecture studio.'] },
  { id: 'D', from: 'base', steps: ['Keep the logo and typography. Redesign everything else.'] },
  { id: 'E', from: 'base', steps: ['Make the headline slightly smaller.'] },
  { id: 'F', from: 'base', steps: ['Make the design feel more cinematic. Adjust the imagery, lighting, background, and typography.'] },
  { id: 'G', from: 'base', steps: ['Make it better.'] },
  { id: 'H', brief: 'Create an experimental editorial poster for an independent architecture publication. Title: Plinth. Issue 07 — The Unbuilt. Out 14 March. Independent writing on architecture. Brand: Plinth Journal.', kind: 'poster', format: 'a3' },
  { id: 'I-fashion', brief: 'A campaign poster for a luxury fashion label’s autumn collection. Maison Aurel. Autumn–Winter Collection. Paris · Milan · Tokyo.', kind: 'poster', format: 'instagram-portrait' },
  { id: 'I-tech', brief: 'A poster for a technology conference about open infrastructure. Open Systems 2027. Two days on the infrastructure of the open web. 9–10 June 2027, Kraftwerk, Berlin. Get tickets.', kind: 'poster', format: 'instagram-portrait' },
  { id: 'I-architecture', brief: 'A poster for an architecture studio’s open house. Open House. An evening in the studio: models, drawings, work in progress. Friday 18 September, from 18:00. Atelier Brandt, Rotterdam.', kind: 'poster', format: 'instagram-portrait' },
  { id: 'I-music', brief: 'A poster for an independent music event: three bands in a small venue. Low Tide. Salt Marsh · Hollow Kids · The Verandas. Sat 12 April, doors 20:00, The Boiler Room, Leith. Tickets on the door.', kind: 'poster', format: 'instagram-portrait' },
  { id: 'I-art', brief: 'A poster for a contemporary art exhibition about light and memory. Afterimage. Light, memory and the photographic trace. 3 May – 27 July. Kunsthalle Nord.', kind: 'poster', format: 'instagram-portrait' },
  { id: 'J', from: 'base', steps: ['Make the colours warm and earthy.', 'Make the typography more expressive.', 'Move the focal point toward the right.', 'Go back to the original colours.'] },
  { id: 'logo', brief: 'A logo for Harbour & Co, a seafood restaurant in an old fishing town: honest, salty, a little old-fashioned, never twee.', kind: 'logo', format: 'logo-sheet' },
  { id: 'formats', from: 'base', steps: ['Adapt “Rooms for Living — A3” to Story (vertical) (format="story"), LinkedIn post (format="linkedin"), Landscape post (1.91:1) (format="landscape"): one new artboard each, in one group beside it, each recomposed for its own shape — the same idea, words, palette and type, not just resized.'] },
  { id: 'web', brief: 'A landing page for Fieldwork, a small studio that designs and builds furniture from reclaimed timber. Sections: what they make, how they work, three recent pieces, a commission enquiry, the workshop address (Unit 4, Mill Lane, Hebden Bridge).', kind: 'website', format: 'web-page' },
  // DESIGN_EXTRA=<file.json>: more first designs, [{ id, brief, kind, format }] — e.g. a bare request beside the brief
  // creative discovery wrote for it (test/browser/ux-v0/discover-bench.mjs brief-*.txt), to compare what each makes
  ...(process.env.DESIGN_EXTRA ? JSON.parse(readFileSync(process.env.DESIGN_EXTRA, 'utf8')) : []),
].filter((s) => !only || s.id === only || s.id.startsWith(only));

// ── the exchange ──
const keyOf = (b) => `${b.mode}-${createHash('sha256').update(JSON.stringify({ w: b.words, d: b.doc, m: b.made ?? '', a: b.artboards ?? [], brief: b.memory?.brief ?? '', k: b.kind, f: b.format })).digest('hex').slice(0, 12)}`;
const pending = [];
const answered = [];
function design(body) {
  const key = keyOf(body);
  const ans = `${EX}ans-${key}.txt`;
  if (existsSync(ans)) {
    answered.push(key);
    return readFileSync(ans, 'utf8');
  }
  const r = T.request.readDesignRequest(body, (v) => (typeof v === 'string' && /^data:image\//.test(v) ? v : null));
  if (r.ok) {
    writeFileSync(`${EX}req-${key}.md`, r.user);
    r.images.forEach((src, i) => writeFileSync(`${EX}pic-${key}-${i}.jpg`, Buffer.from(src.split(',')[1], 'base64')));
    pending.push({ key, mode: r.mode, tier: r.tier, pictures: r.images.length });
  }
  return null;
}

const b = await chromium.launch();
const ORIGIN = 'http://harness.test';
const report = { at: new Date().toISOString(), scenarios: {} };
const states = {};
if (existsSync(`${OUT}base-project.json`)) states.base = JSON.parse(readFileSync(`${OUT}base-project.json`, 'utf8'));
// any first design kept from an earlier run, so a scenario can go on from it (from: '<id>')
for (const f of readdirSync(OUT)) {
  const m = f.match(/^project-(.+)\.json$/);
  if (m) states[m[1]] = JSON.parse(readFileSync(`${OUT}${f}`, 'utf8'));
}

async function run(sc) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  let cfg = {};
  const reqs = [];
  await serveHarness(ctx, { root: ROOT, bundle: BUNDLE, origin: ORIGIN, cfg: () => cfg, design: (body) => (reqs.push(body), design(body)) });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
  if (sc.from) {
    if (!states[sc.from]) return { skipped: `needs ${sc.from}` };
    cfg = { project: states[sc.from] };
  } else cfg = { brief: sc.brief, kind: sc.kind, format: sc.format, name: sc.id };
  const projectState = () => page.evaluate(() => new Promise((res) => { const r = indexedDB.open('socria-ux-v0', 1); r.onsuccess = () => { const g = r.result.transaction('projects', 'readonly').objectStore('projects').get(window.__PROJECT_ID__); g.onsuccess = () => res(g.result ?? null); g.onerror = () => res(null); }; r.onerror = () => res(null); }));
  const idle = () => page.waitForFunction(() => !document.querySelector('.dx-phase'), null, { timeout: 120000 });
  const waiting = async () => (await page.locator('.dx-error').textContent().catch(() => '')) === 'Waiting for an answer.';
  await page.goto(`${ORIGIN}/`);
  await page.waitForSelector('.dx', { timeout: 20000 });
  await page.waitForTimeout(800);
  await idle();
  const out = { steps: [], errors };
  if (!sc.from) {
    if (await waiting()) return (await ctx.close(), { pending: true, ...out });
  }
  const pictures = async (label) => {
    await page.waitForTimeout(500);
    const p = await projectState();
    const st = p?.design;
    if (!st) return [];
    const files = [];
    for (const a of st.doc.artboards) {
      const url = await page.evaluate(([a, t, as]) => window.__picture(a, t, as, 1400), [a, st.doc.tokens, st.assets]);
      const f = `${OUT}${sc.id}${label ? `-${label}` : ''}-${a.id}.png`;
      writeFileSync(f, Buffer.from(url.split(',')[1], 'base64'));
      files.push({ file: f, name: a.name, w: a.width, h: a.height });
    }
    return files;
  };
  if (!sc.from) out.steps.push({ words: '(first design from the brief)', pictures: await pictures('') });
  for (const [i, w] of (sc.steps ?? []).entries()) {
    await page.locator('.dx-input').fill(w);
    await page.locator('.dx-input').press('Enter');
    await page.waitForTimeout(300);
    await idle();
    if (await waiting()) return (await ctx.close(), { pending: true, ...out });
    out.steps.push({ words: w, pictures: await pictures(sc.steps.length > 1 ? `${i + 1}` : '') });
  }
  const p = await projectState();
  const st = p.design;
  if (sc.id === 'base') {
    writeFileSync(`${OUT}base-project.json`, JSON.stringify(p));
    states.base = p;
  } else if (!sc.from) {
    writeFileSync(`${OUT}project-${sc.id}.json`, JSON.stringify(p));
    states[sc.id] = p;
  }
  const before = sc.from ? states[sc.from].design : null;
  out.turns = st.turns.slice(before ? before.turns.length : 0).map((t) => ({ role: t.role, text: t.text, failed: t.failed ?? [], touched: t.touched ?? [] }));
  out.calls = reqs.map((r) => ({ mode: r.mode, tier: r.mode === 'look' ? 'look' : T.request.requestTier(r.words, r.doc.artboards.length > 0).tier }));
  out.artboards = st.doc.artboards.map((a) => ({ id: a.id, name: a.name, format: a.format, bytes: a.html.length, group: a.group ?? null }));
  out.versions = st.versions.length - (before ? before.versions.length : 0);
  if (before) {
    // what changed, element by element, on the artboard that was there before
    const a0 = before.doc.artboards[0];
    const a1 = st.doc.artboards.find((x) => x.id === a0.id);
    const els = (h) => new Map([...(h ?? '').matchAll(/<([a-z0-9]+)\b[^>]*data-sx="(e\d+)"[^>]*>/gi)].map((m) => [m[2], m[0]]));
    const e0 = els(a0.html);
    const e1 = els(a1?.html);
    out.elements = { before: e0.size, after: e1.size, kept: [...e0.keys()].filter((k) => e1.has(k)).length, unchanged: [...e0].filter(([k, v]) => e1.get(k) === v).length, removed: [...e0.keys()].filter((k) => !e1.has(k)).length, added: [...e1.keys()].filter((k) => !e0.has(k)).length, styleChanged: a0.html.match(/<style[\s\S]*?<\/style>/)?.[0] !== a1?.html.match(/<style[\s\S]*?<\/style>/)?.[0], tokensChanged: before.doc.tokens !== st.doc.tokens };
  }
  await ctx.close();
  return out;
}

for (const sc of SCENARIOS) {
  const r = await run(sc);
  report.scenarios[sc.id] = r;
  console.log(`${sc.id}: ${r.pending ? 'waiting for an answer' : r.skipped ? r.skipped : `${r.calls?.length} calls (${r.calls?.map((c) => c.tier).join(', ')}), ${r.artboards?.length} artboards, ${r.versions} versions${r.elements ? `, elements kept ${r.elements.kept}/${r.elements.before} (unchanged ${r.elements.unchanged}), added ${r.elements.added}, removed ${r.elements.removed}` : ''}${r.turns?.some((t) => t.failed.length) ? `, failed: ${r.turns.flatMap((t) => t.failed).join(' | ')}` : ''}`}`);
}
await b.close();
writeFileSync(`${OUT}report.json`, JSON.stringify(report, null, 1));
writeFileSync(`${OUT}pending.json`, JSON.stringify(pending, null, 1));
console.log(`\n${answered.length} answered, ${pending.length} waiting: ${EX}`);
for (const p of pending) console.log(`  ${p.key} (${p.mode}, ${p.tier}, ${p.pictures} picture${p.pictures === 1 ? '' : 's'})`);
