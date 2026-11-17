// test/browser/ux-v0/benchmark.mjs — does art direction make SocriaUX's designs better and more different?
//
// For every brief in benchmark-briefs.mjs it draws the same copy two ways:
//   before  the pipeline as it was (the renderer at git HEAD~ or BASELINE_REF:
//           one stylesheet, the brief's palette and type, a style flag), with
//           the variants that renderer had;
//   after   the three art directions the engine proposes, each planned,
//           rendered, measured in a real browser at 1280 and 390 px, checked by
//           the evaluator, and revised in at most two bounded rounds.
// It saves screenshots and a contact sheet, and reports per brief and overall:
//   quality          (evaluator: overflow, contrast, targets, images, hierarchy)
//   distinctiveness  (evaluator: the generic page's habits, listed)
//   diversity        how different the designs for different briefs look —
//                    pixel distance between screenshots, and look distance
//   fidelity         locked decisions kept; the brief's palette and type kept in the faithful option
//   latency          engine, render, measure and revise, in milliseconds
//   cost             the model calls a real run adds, priced from prompt sizes
//
// Real photographs come from Openverse (its own image proxy, licensed, cached);
// offline it falls back to the small stand-ins in fx/. Fonts are the real
// Google Fonts when the network allows.
//
//   node test/browser/ux-v0/benchmark.mjs            (needs test/.tmp: npm test or buildAll)
//   BENCH=socria,lumen node test/browser/ux-v0/benchmark.mjs
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { build } from 'esbuild';
import { chromium, FX, ROOT, S, underTest } from './env.mjs';
import { BRIEFS } from './benchmark-briefs.mjs';

const V = await underTest();
const OUT = join(S, 'benchmark');
// outside test/.tmp, which every test build wipes
const CACHE = join(S, 'bench-images');
mkdirSync(OUT, { recursive: true });
mkdirSync(CACHE, { recursive: true });
const only = process.env.BENCH ? new Set(process.env.BENCH.split(',')) : null;
const briefs = BRIEFS.filter((b) => !only || only.has(b.id));
const log = (...a) => console.log(...a);

// ── the renderer as it was ───────────────────────────────────────────
async function baseline() {
  const ref = process.env.BASELINE_REF || 'e5e927a';
  const dir = join(S, 'bench-baseline');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  try {
    execSync(`git archive ${ref} lib/ux-v0 lib/ux | tar -x -C ${JSON.stringify(dir)}`, { cwd: ROOT, stdio: 'pipe' });
  } catch {
    log('  (no baseline: git archive failed)');
    return null;
  }
  writeFileSync(join(dir, 'entry.ts'), "export * from './lib/ux-v0/render'; export * from './lib/ux-v0/spec'; export { normalizeBrief } from './lib/ux-v0/types';\n");
  await build({ entryPoints: [join(dir, 'entry.ts')], bundle: true, format: 'esm', platform: 'node', outfile: join(dir, 'old.mjs'), logLevel: 'error' });
  return import(join(dir, 'old.mjs'));
}
const OLD = await baseline();
const OLD_VARIANT = { 'hero/statement': 'centered', 'hero/poster': 'centered', 'features/index': 'numbered', 'features/columns': 'grid', 'quote/pull': 'large', 'stats/giant': 'row', 'cta/statement': 'band', 'text/lead': 'narrow' };

// ── photographs ──────────────────────────────────────────────────────
const FALLBACK = ['cafe-bar', 'pour', 'window', 'people', 'marble', 'ceramic', 'dusk', 'beans', 'grid'];
async function photos(b) {
  const out = [];
  for (const [qi, q] of b.queries.entries()) {
    const key = q.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    const meta = join(CACHE, `${key}.json`);
    let hit = existsSync(meta) ? JSON.parse(readFileSync(meta, 'utf8')) : null;
    // Openverse times out now and then: three tries, the last with a shorter query
    for (let attempt = 0; !hit && attempt < 3; attempt++) {
      try {
        if (attempt) await new Promise((r) => setTimeout(r, 1500 * attempt));
        const words = attempt === 2 ? q.split(' ').slice(0, 2).join(' ') : q;
        const res = await fetch(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(words)}&page_size=8&license_type=commercial,modification${attempt < 2 ? '&aspect_ratio=wide' : ''}`, { signal: AbortSignal.timeout(20000) });
        if (!res.ok) continue;
        const j = await res.json();
        for (const r of j.results ?? []) {
          const img = await fetch(`https://api.openverse.org/v1/images/${r.id}/thumb/?full_size=true`, { signal: AbortSignal.timeout(20000) }).catch(() => null);
          if (!img) continue;
          if (!img.ok) continue;
          const buf = Buffer.from(await img.arrayBuffer());
          if (buf.length < 40000) continue;
          writeFileSync(join(CACHE, `${key}.jpg`), buf);
          hit = { title: r.title, creator: r.creator, license: r.license, url: r.foreign_landing_url, width: r.width, height: r.height };
          writeFileSync(meta, JSON.stringify(hit));
          break;
        }
      } catch {}
    }
    const file = hit ? join(CACHE, `${key}.jpg`) : join(FX, `${FALLBACK[(qi + b.id.length) % FALLBACK.length]}.jpg`);
    out.push({
      provider: 'openverse', providerId: key, id: `openverse:${key}`, url: `https://images.bench.test/${encodeURIComponent(file)}`, thumb: '', width: hit?.width ?? 1600, height: hit?.height ?? 1067,
      title: hit?.title ?? q, creator: hit ? hit.creator || 'an unnamed photographer' : 'Stand-in', creatorUrl: '', sourceUrl: hit?.url ?? '', license: hit?.license ?? 'CC0', licenseUrl: '', attribution: '', category: 'imagery', query: q, state: 'kept',
    });
  }
  return out;
}
const withImages = (sections, refs) => sections.map((s) => ({ ...s, images: (s.images ?? []).map((x) => refs[Number(x.split(':')[1])]?.id).filter(Boolean) }));

// ── a browser ────────────────────────────────────────────────────────
const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1,images.bench.test' } : undefined;
const browser = await chromium.launch(proxy ? { proxy } : {});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.route('https://images.bench.test/**', (r) => {
  const file = decodeURIComponent(r.request().url().split('/').pop());
  return existsSync(file) ? r.fulfill({ contentType: 'image/jpeg', body: readFileSync(file) }) : r.fulfill({ status: 404, body: '' });
});
const page = await ctx.newPage();

async function draw(html, width, file) {
  await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
  await page.setContent(html, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.addScriptTag({ content: V.AUDIT_SOURCE });
  const t = performance.now();
  const audit = V.normalizeAudit(await page.evaluate(() => window.__uxv0Audit()));
  const ms = performance.now() - t;
  if (file) await page.screenshot({ path: file, fullPage: true });
  return { audit, ms };
}

async function measure(spec, refs, html, tag) {
  const d = await draw(html, 1280, tag ? join(OUT, `${tag}-desktop.png`) : null);
  const p = await draw(html, 390, tag ? join(OUT, `${tag}-phone.png`) : null);
  return { desktop: d.audit, phone: p.audit, ms: d.ms + p.ms };
}

/** How different two screenshots look: structure (luminance) and colour, 0 = the same. */
async function pixelDistance(a, b) {
  const one = readFileSync(a).toString('base64');
  const two = readFileSync(b).toString('base64');
  return page.evaluate(async ([x, y]) => {
    const load = (s) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = 'data:image/png;base64,' + s; });
    const [A, B] = await Promise.all([load(x), load(y)]);
    const W = 64, H = 48;
    const px = (img) => { const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.drawImage(img, 0, 0, img.width, Math.min(img.height, img.width * 0.75), 0, 0, W, H); return g.getImageData(0, 0, W, H).data; };
    const p = px(A), q = px(B);
    let lum = 0;
    const hist = (d) => { const h = new Array(36).fill(0); for (let i = 0; i < d.length; i += 4) { const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); const l = (mx + mn) / 2; const sat = mx === mn ? 0 : (mx - mn); let hue = 0; if (sat > 0.08) { hue = mx === r ? ((g - b) / (mx - mn)) % 6 : mx === g ? (b - r) / (mx - mn) + 2 : (r - g) / (mx - mn) + 4; hue = Math.floor(((hue * 60 + 360) % 360) / 40); } else hue = 9 + Math.min(2, Math.floor(l * 3)); h[Math.min(35, hue * 3 + Math.min(2, Math.floor(l * 3)))]++; } const n = d.length / 4; return h.map((v) => v / n); };
    for (let i = 0; i < p.length; i += 4) lum += Math.abs((p[i] * 0.3 + p[i + 1] * 0.59 + p[i + 2] * 0.11) - (q[i] * 0.3 + q[i + 1] * 0.59 + q[i + 2] * 0.11)) / 255;
    lum /= p.length / 4;
    const hp = hist(p), hq = hist(q);
    const col = hp.reduce((t, v, i) => t + Math.abs(v - hq[i]), 0) / 2;
    return Math.round(((lum + col) / 2) * 1000) / 1000;
  }, [one, two]);
}

// ── cost: what the model calls of a real run would add ───────────────
const toks = (s) => Math.ceil(String(s).length / 4);
function costs(brief, dirs, spec) {
  const model = V.socriauxModel ? V.socriauxModel() : 'gpt-6-luna';
  const ask = { brief, notes: '', avoid: '' };
  const direct = { input: toks(V.directSystem() + V.directUser(ask, dirs)), output: 1500 };
  const genBefore = { input: toks(V.generateSystem(brief) + JSON.stringify(brief)), output: toks(JSON.stringify(spec.sections)) + 200 };
  const genAfter = { input: toks(V.generateSystem(brief, dirs[0]) + JSON.stringify(brief)), output: genBefore.output };
  const price = (u) => V.costOf(model, { input: u.input, cached: 0, output: u.output });
  return { model, before: price(genBefore), after: price(genAfter) + price(direct), direct, genBefore, genAfter };
}

// ── run ──────────────────────────────────────────────────────────────
const rows = [];
const firsts = [];
const olds = [];
const oldLooks = [];
for (const b of briefs) {
  log(`\n▸ ${b.name}`);
  const refs = await photos(b);
  const moodboard = { refs, queries: [], palettes: [], type: [] };
  const kept = new Set(refs.map((r) => r.id));
  const brief = V.normalizeBrief(b.brief, kept);
  const sections = withImages(b.sections, refs);
  const row = { id: b.id, name: b.name, before: null, after: [], latency: {}, fidelity: {} };

  // before
  if (OLD) {
    const oldBrief = OLD.normalizeBrief(b.brief, kept);
    const pal = Object.fromEntries(oldBrief.palette.map((p) => [p.role, p.hex]));
    const style = V.languageOf(V.fitScores(brief)[0].id)?.style ?? 'editorial';
    // the old renderer had no emphasis: its copy carried no *marks*
    const unmark = (v) => (typeof v === 'string' ? v.replace(/\*([^*]+)\*/g, '$1') : Array.isArray(v) ? v.map(unmark) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, unmark(x)])) : v);
    const oldSections = sections.map((s) => ({ ...s, content: unmark(s.content), variant: OLD_VARIANT[`${s.kind}/${s.variant}`] ?? s.variant }));
    const oldSpec = OLD.normalizeSpec({ title: b.name, pageType: 'website', platform: 'web', tokens: { colors: { background: pal.background, surface: pal.surface, text: pal.text, muted: pal.muted, accent: pal.accent, accentText: pal['accent-text'], line: pal.line }, fonts: oldBrief.typography, scale: 'comfortable', radius: 'soft', style, imageTreatment: 'natural' }, sections: oldSections }, moodboard);
    const html = OLD.renderDesign(oldSpec, refs).html;
    const m = await measure(oldSpec, refs, html, `${b.id}-0-before`);
    const asNew = V.normalizeSpec({ ...oldSpec, look: undefined }, moodboard);
    oldLooks.push({ tokens: asNew.tokens, look: asNew.look });
    const ev = V.evaluateDesign(asNew, m);
    row.before = { quality: ev.quality, distinctiveness: ev.distinctiveness, findings: ev.findings.length, open: ev.findings.filter((f) => f.severity !== 'low').map((f) => f.message), signals: ev.signals.map((x) => x.reason) };
    olds.push(join(OUT, `${b.id}-0-before-desktop.png`));
    log(`  before        quality ${ev.quality}  distinct ${ev.distinctiveness}  (${ev.signals.map((x) => x.reason.split(':')[0].split('.')[0]).slice(0, 4).join('; ')})${row.before.open.length ? `  open: ${row.before.open.slice(0, 3).join(' | ')}` : ''}`);
  }

  // after: three directions
  let t = performance.now();
  let base = null;
  if (b.locks) base = { ...V.proposeDirections({ brief, count: 1 })[0], locks: b.locks };
  const dirs = V.proposeDirections({ brief, notes: b.notes ?? '', avoid: b.avoid ?? '', base });
  row.latency.engine = Math.round(performance.now() - t);
  row.fidelity.locksKept = !b.locks || dirs.every((d) => b.locks.every((g) => (g === 'palette' ? JSON.stringify(d.tokens.colors) === JSON.stringify(base.tokens.colors) : g === 'type' ? JSON.stringify(d.tokens.fonts) === JSON.stringify(base.tokens.fonts) : true)));
  const pal = Object.fromEntries(brief.palette.map((p) => [p.role, p.hex]));
  row.fidelity.faithfulKeepsBrief = dirs[0].tokens.colors.accent === pal.accent && dirs[0].tokens.fonts.display === brief.typography.display;
  for (const [i, d] of dirs.entries()) {
    t = performance.now();
    let spec = V.planLayout(V.normalizeSpec({ title: b.name, pageType: 'website', platform: 'web', tokens: d.tokens, look: d.look, sections }, moodboard));
    let html = V.renderDesign(spec, refs).html;
    const renderMs = performance.now() - t;
    const tag = `${b.id}-${i + 1}-${d.language}`;
    let m = await measure(spec, refs, html, null);
    let ev = V.evaluateDesign(spec, m, d.locks);
    const first = { quality: ev.quality, findings: ev.findings.length };
    const applied = [];
    // the bounded revision loop the workspace runs
    for (let round = 0; round < V.MAX_REVISION_ROUNDS; round++) {
      const fixes = V.fixesFor(ev);
      if (!fixes.length) break;
      for (const f of fixes) {
        const r = V.applyPatch(spec, f.patch, moodboard);
        if (r.ok) (spec = r.spec), applied.push(f.patch.summary);
      }
      html = V.renderDesign(spec, refs).html;
      m = await measure(spec, refs, html, null);
      ev = V.evaluateDesign(spec, m, d.locks);
    }
    m = await measure(spec, refs, html, tag);
    ev = V.evaluateDesign(spec, m, d.locks);
    const out = { language: d.language, name: d.name, fonts: `${d.tokens.fonts.display} / ${d.tokens.fonts.body}`, quality: ev.quality, firstQuality: first.quality, distinctiveness: ev.distinctiveness, fixes: applied, open: ev.findings.filter((f) => f.severity !== 'low').map((f) => f.message), renderMs: Math.round(renderMs), measureMs: Math.round(m.ms) };
    row.after.push(out);
    if (i === 0) firsts.push({ file: join(OUT, `${tag}-desktop.png`), dir: d });
    log(`  ${String(i + 1)}. ${d.language.padEnd(13)} quality ${String(first.quality).padStart(3)} → ${String(ev.quality).padStart(3)}  distinct ${ev.distinctiveness}  ${d.tokens.fonts.display}/${d.tokens.fonts.body}${applied.length ? `  fixed: ${applied.join('; ')}` : ''}${out.open.length ? `  open: ${out.open.slice(0, 2).join(' | ')}` : ''}`);
  }
  // diversity within the brief: how different the three options look
  const own = [];
  for (let i = 0; i < dirs.length; i++) for (let j = i + 1; j < dirs.length; j++) own.push(V.directionDistance(dirs[i], dirs[j]));
  row.optionDistance = Math.round((own.reduce((a, x) => a + x, 0) / own.length) * 1000) / 1000;
  const shots = dirs.map((d, i) => join(OUT, `${b.id}-${i + 1}-${d.language}-desktop.png`));
  const px = [];
  for (let i = 0; i < shots.length; i++) for (let j = i + 1; j < shots.length; j++) px.push(await pixelDistance(shots[i], shots[j]));
  row.optionPixels = Math.round((px.reduce((a, x) => a + x, 0) / Math.max(1, px.length)) * 1000) / 1000;
  row.cost = costs(brief, dirs, { sections });
  rows.push(row);
}

// diversity across briefs: what SocriaUX makes for different people should not look alike
async function meanPairs(files) {
  const d = [];
  for (let i = 0; i < files.length; i++) for (let j = i + 1; j < files.length; j++) d.push(await pixelDistance(files[i], files[j]));
  return d.length ? Math.round((d.reduce((a, x) => a + x, 0) / d.length) * 1000) / 1000 : 0;
}
const acrossAfter = await meanPairs(firsts.map((f) => f.file));
const acrossBefore = OLD ? await meanPairs(olds) : 0;
const lookPairs = [];
for (let i = 0; i < firsts.length; i++) for (let j = i + 1; j < firsts.length; j++) lookPairs.push(V.directionDistance(firsts[i].dir, firsts[j].dir));
const lookAcross = Math.round((lookPairs.reduce((a, x) => a + x, 0) / Math.max(1, lookPairs.length)) * 1000) / 1000;
// the same distance for the old pipeline: one stylesheet, so only the classic look's style flag, colours and faces differed
const oldDirs = oldLooks.map((x) => ({ tokens: x.tokens, look: x.look }));
const oldPairs = [];
for (let i = 0; i < oldDirs.length; i++) for (let j = i + 1; j < oldDirs.length; j++) oldPairs.push(V.directionDistance(oldDirs[i], oldDirs[j]));
const lookBefore = oldPairs.length ? Math.round((oldPairs.reduce((a, x) => a + x, 0) / oldPairs.length) * 1000) / 1000 : 0;

const mean = (xs) => (xs.length ? Math.round((xs.reduce((a, x) => a + x, 0) / xs.length) * 10) / 10 : 0);
const exact = (xs) => (xs.length ? Math.round((xs.reduce((a, x) => a + x, 0) / xs.length) * 1e6) / 1e6 : 0);
const summary = {
  briefs: rows.length,
  before: OLD ? { quality: mean(rows.map((r) => r.before.quality)), distinctiveness: mean(rows.map((r) => r.before.distinctiveness)), pixelDiversity: acrossBefore } : null,
  after: {
    quality: mean(rows.flatMap((r) => r.after.map((a) => a.quality))),
    qualityBeforeFixes: mean(rows.flatMap((r) => r.after.map((a) => a.firstQuality))),
    distinctiveness: mean(rows.flatMap((r) => r.after.map((a) => a.distinctiveness))),
    pixelDiversity: acrossAfter,
    lookDiversityAcrossBriefs: lookAcross,
    lookDiversityAcrossBriefsBefore: lookBefore,
    pixelDistanceWithinBrief: exact(rows.map((r) => r.optionPixels ?? 0)),
    optionDistanceWithinBrief: mean(rows.map((r) => r.optionDistance)),
  },
  fidelity: { locksKept: rows.every((r) => r.fidelity.locksKept), faithfulKeepsBrief: rows.filter((r) => r.fidelity.faithfulKeepsBrief).length + '/' + rows.length },
  latencyMs: { engine: mean(rows.map((r) => r.latency.engine)), render: mean(rows.flatMap((r) => r.after.map((a) => a.renderMs))), measure: mean(rows.flatMap((r) => r.after.map((a) => a.measureMs))) },
  costUsd: { model: rows[0]?.cost.model, before: exact(rows.map((r) => r.cost.before)), after: exact(rows.map((r) => r.cost.after)), directTokens: exact(rows.map((r) => r.cost.direct.input + r.cost.direct.output)), generateInputBefore: exact(rows.map((r) => r.cost.genBefore.input)), generateInputAfter: exact(rows.map((r) => r.cost.genAfter.input)) },
};
writeFileSync(join(OUT, 'results.json'), JSON.stringify({ summary, rows }, null, 2));

// a contact sheet: before, then the three directions, for every brief
const img = (f) => (existsSync(f) ? `<img src="data:image/png;base64,${readFileSync(f).toString('base64')}">` : '<div class="none">—</div>');
const sheet = `<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:32px;background:#e9e7e1;font:14px/1.4 system-ui,sans-serif;color:#20201b}h1{font:400 28px Georgia,serif;margin:0 0 6px}p.s{margin:0 0 24px;color:#555}.row{display:grid;grid-template-columns:150px repeat(4,1fr);gap:14px;margin-bottom:22px;align-items:start}.row h2{font-size:14px;margin:6px 0 0}.cell{background:#fff;border-radius:6px;overflow:hidden;box-shadow:0 1px 0 rgba(0,0,0,.08)}.cell img{display:block;width:100%;height:560px;object-fit:cover;object-position:top}.cap{padding:8px 10px;font-size:12px;color:#444}.cap b{color:#111}.none{height:560px}</style>
<h1>SocriaUX art direction — before and after</h1><p class="s">${rows.length} briefs. Before: the previous renderer with the brief’s palette and type. After: the three directions the engine proposed, each checked at 1280 and 390 px and revised in at most two rounds. Quality ${summary.before?.quality ?? '–'} → ${summary.after.quality}; distinctiveness ${summary.before?.distinctiveness ?? '–'} → ${summary.after.distinctiveness}; how different briefs look from each other ${summary.before?.pixelDiversity ?? '–'} → ${summary.after.pixelDiversity}.</p>
${rows
  .map(
    (r) => `<div class="row"><h2>${r.name}</h2><div class="cell">${img(join(OUT, `${r.id}-0-before-desktop.png`))}<div class="cap"><b>Before</b> · quality ${r.before?.quality ?? '–'} · distinct ${r.before?.distinctiveness ?? '–'}</div></div>${r.after
      .map((a, i) => `<div class="cell">${img(join(OUT, `${r.id}-${i + 1}-${a.language}-desktop.png`))}<div class="cap"><b>${i + 1}. ${a.language}</b> · ${a.fonts} · quality ${a.quality} · distinct ${a.distinctiveness}</div></div>`)
      .join('')}</div>`
  )
  .join('')}`;
writeFileSync(join(OUT, 'contact-sheet.html'), sheet);
await page.setViewportSize({ width: 1800, height: 900 });
await page.setContent(sheet, { waitUntil: 'load' });
await page.screenshot({ path: join(OUT, 'contact-sheet.png'), fullPage: true });
await browser.close();

log('\n=== summary ===');
log(JSON.stringify(summary, null, 2));
log(`\nScreenshots, results.json and contact-sheet.png in ${OUT}`);
