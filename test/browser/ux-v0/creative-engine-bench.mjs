// test/browser/ux-v0/creative-engine-bench.mjs — the creative engine benchmark (tests A–K of the engine overhaul).
//
// Real artifacts, really rendered: each design is composed with the faces' real widths (measured in Chromium, the way
// the product measures them in the browser) and drawn in Chromium to a PNG. Each edit is carried out on a real
// document and recorded by what it did to it: which objects changed, which did not, what was said.
//
//   ENGINE=rules     the engine as it was before the overhaul: words read by the lexicon reader, designs composed in
//                    code (no model anywhere). This is the BEFORE.
//   ENGINE=director  the creative director (a model) reads, plans, writes the program and the edits; the engine
//                    validates, compiles, checks and renders. This is the AFTER. It makes real, paid calls to the
//                    provider: it runs only with ANTHROPIC_API_KEY set (or the proxy's credential for
//                    api.anthropic.com) and BENCH_LIVE=1, and says so when it cannot.
//
//   UXV0_OUT=/somewhere ENGINE=rules node test/browser/ux-v0/creative-engine-bench.mjs
//   ONLY=A,E         run some tests only
//
// Writes <out>/creative-engine-bench/<engine>/: one PNG per artifact, contact sheets, and report.json.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, S, ROOT, underTest } from './env.mjs';
import { buildOnly } from '../../helpers/build.mjs';

// the bundles this benchmark reads, built from the working tree (so it measures the code as it is now)
if (process.env.BENCH_BUILD !== 'off') await buildOnly(process.env.BENCH_BUILD === 'creative' ? ['creative-under-test'] : ['ux-v0-under-test', 'creative-under-test']);

const ENGINE = process.env.ENGINE === 'director' ? 'director' : 'rules';
const ONLY = (process.env.ONLY ?? '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
const want = (id) => !ONLY.length || ONLY.includes(id);
const OUT = `${S}creative-engine-bench/${ENGINE}/`;
mkdirSync(OUT, { recursive: true });

const V = await underTest();
const CR = await import(pathToFileURL(join(ROOT, 'test/.tmp/creative-under-test.mjs')).href);
const { gfxCompose: C, gfxDoc: D, gfxRender: R, gfxCheck: CK, gfxEdit: ED, gfxText: TX, genEvaluate: EV, genEngine: GE, gfxStylePropose: SP } = V;
const J = JSON.stringify;

// ── real widths: measured in Chromium, cached, the composition run again until nothing was guessed ──
const browser = await chromium.launch();
const mpage = await browser.newPage();
await mpage.setContent('<html><head></head><body></body></html>');
const widths = new Map();
const misses = new Set();
const loadedFaces = new Set();
const measure = (text, font, weight, size, italic) => {
  const key = J([font, weight, italic ? 1 : 0, text]);
  const w = widths.get(key);
  if (w === undefined) {
    misses.add(key);
    return TX.approxMeasure(text, font, weight, size, italic);
  }
  return w * size;
};
async function fill(keys) {
  const items = keys.map((k) => JSON.parse(k));
  const fams = [...new Set(items.map((i) => i[0]))].filter((f) => !loadedFaces.has(f));
  if (fams.length) {
    const css = V.graphicFontStylesheet(fams);
    if (css)
      await mpage.evaluate(
        (href) =>
          new Promise((res) => {
            const l = document.createElement('link');
            l.rel = 'stylesheet';
            l.href = href;
            l.onload = () => res(true);
            l.onerror = () => res(false);
            document.head.appendChild(l);
          }),
        css,
      );
    fams.forEach((f) => loadedFaces.add(f));
  }
  const out = await mpage.evaluate(async (items) => {
    const faces = [...new Set(items.map(([font, weight, italic]) => `${italic ? 'italic ' : ''}${weight} 100px "${font}"`))];
    await Promise.all(faces.map((f) => document.fonts.load(f).catch(() => null)));
    const ctx = document.createElement('canvas').getContext('2d');
    return items.map(([font, weight, italic, text]) => {
      ctx.font = `${italic ? 'italic ' : ''}${weight} 100px "${font}", system-ui, sans-serif`;
      return ctx.measureText(text).width / 100;
    });
  }, items);
  keys.forEach((k, i) => widths.set(k, out[i]));
}
/**
 * Run a composition until every width it asked for was a real one (bounded). Object ids are random in the product;
 * here they are drawn from a seeded sequence restarted for each pass, so the same answers make the same document on
 * every run of the benchmark (a request answered in one run is recognised in the next).
 */
let seedLabel = 'bench';
let seedCount = 0;
const seeded = (label) => {
  let h = 2166136261;
  for (const ch of label) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return () => {
    h = (Math.imul(h ^ (h >>> 15), 2246822507) + 0x9e3779b9) >>> 0;
    let t = h;
    t = Math.imul(t ^ (t >>> 13), 3266489909) >>> 0;
    return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
  };
};
const flowStart = (label) => {
  seedLabel = label;
  seedCount = 0;
};
async function settle(fn) {
  let out;
  const n = seedCount++;
  const realRandom = Math.random;
  const realNow = Date.now;
  for (let i = 0; i < 8; i++) {
    misses.clear();
    Math.random = seeded(`${seedLabel}|${n}`);
    Date.now = () => 1700000000000 + n;
    try {
      out = fn(measure);
    } finally {
      Math.random = realRandom;
      Date.now = realNow;
    }
    if (!misses.size) break;
    await fill([...misses]);
  }
  return out;
}

// ── drawing ──
const facesOf = (doc) => {
  const faces = new Set();
  doc.artboards.forEach((b) =>
    b.children.forEach(function f(n) {
      if (n.type === 'text') faces.add(n.font);
      if (n.type === 'group') n.children.forEach(f);
    }),
  );
  return [...faces];
};
let uid = 0;
async function draw(doc, boardId, file, width = 900) {
  const b = doc.artboards.find((x) => x.id === boardId) ?? doc.artboards[0];
  const css = V.graphicFontStylesheet(facesOf(doc));
  const k = width / b.width;
  // drawn as the product draws it: lines broken on the faces' real widths (the same measure the composition used)
  const prefix = `d${uid++}-`;
  const keep = [seedLabel, seedCount];
  const svg0 = await settle((m) => R.renderArtboard(doc, b, { idPrefix: prefix, measure: m }));
  [seedLabel, seedCount] = keep;
  const svg = svg0.replace(/width="[^"]+" height="[^"]+"/, `width="${Math.round(b.width * k)}" height="${Math.round(b.height * k)}"`);
  const page = await browser.newPage({ viewport: { width: Math.round(b.width * k), height: Math.round(b.height * k) }, deviceScaleFactor: 1 });
  await page.setContent(`<html><head>${css ? `<link rel="stylesheet" href="${css}">` : ''}<style>html,body{margin:0;background:#fff}svg{display:block}</style></head><body>${svg}</body></html>`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${OUT}${file}` });
  await page.close();
  return { file, svg, css };
}
/** The artboard as a picture (a PNG data URL, 760 px wide): what the director is shown. */
async function picture(doc, boardId) {
  const b = doc.artboards.find((x) => x.id === boardId) ?? doc.artboards[0];
  const css = V.graphicFontStylesheet(facesOf(doc));
  const k = 760 / b.width;
  const w = Math.round(b.width * k);
  const h = Math.round(b.height * k);
  const prefix = `p${uid++}-`;
  const keep = [seedLabel, seedCount];
  const svg = (await settle((m) => R.renderArtboard(doc, b, { idPrefix: prefix, measure: m }))).replace(/width="[^"]+" height="[^"]+"/, `width="${w}" height="${h}"`);
  // (drawing a picture is not a step of the flow: the flow's own sequence of ids carries on where it was)
  [seedLabel, seedCount] = keep;
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.setContent(`<html><head>${css ? `<link rel="stylesheet" href="${css}">` : ''}<style>html,body{margin:0;background:#fff}svg{display:block}</style></head><body>${svg}</body></html>`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
  const buf = await page.screenshot({ type: 'jpeg', quality: 80 });
  await page.close();
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
}
const sheets = [];
async function sheet(items, file, title) {
  const css = [...new Set(items.map((i) => i.css).filter(Boolean))];
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 }, deviceScaleFactor: 1 });
  await page.setContent(
    `<html><head>${css.map((c) => `<link rel="stylesheet" href="${c}">`).join('')}<style>body{margin:14px;background:#e9e6df;font:12px/1.4 system-ui;color:#222}h1{font:600 16px system-ui;margin:2px 4px 12px}figure{display:inline-block;vertical-align:top;margin:6px;max-width:${items[0]?.w ?? 330}px}figcaption{margin-top:5px}.art svg{display:block;box-shadow:0 1px 3px rgba(0,0,0,.2)}b{font-weight:600}</style></head><body><h1>${title}</h1>${items.map((i) => `<figure><div class="art">${i.svg.replace(/width="[^"]+" height="[^"]+"/, (m) => { const [w, h] = m.match(/\d+/g).map(Number); const kk = (i.w ?? 330) / w; return `width="${Math.round(w * kk)}" height="${Math.round(h * kk)}"`; })}</div><figcaption>${i.cap}</figcaption></figure>`).join('')}</body></html>`,
    { waitUntil: 'load' },
  );
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}${file}`, fullPage: true });
  await page.close();
  sheets.push(file);
}

// ── what an edit did to the document, object by object ──
const flat = (board) => {
  const out = new Map();
  (function walk(list, ox, oy) {
    for (const n of list) {
      const { children, ...rest } = n;
      out.set(n.id, { node: rest, role: n.role ?? 'none', name: n.name ?? n.type, type: n.type });
      if (n.type === 'group') walk(n.children, ox + n.x, oy + n.y);
    }
  })(board.children, 0, 0);
  return out;
};
function diffBoards(a, b) {
  const A = flat(a);
  const B = flat(b);
  const label = (x) => `${x.role === 'none' ? x.type : x.role}${x.name && x.name.toLowerCase() !== x.role ? ` “${x.name}”` : ''}`;
  const changed = [];
  const removed = [];
  const added = [];
  for (const [id, x] of A) {
    const y = B.get(id);
    if (!y) removed.push(label(x));
    else if (J(x.node) !== J(y.node)) {
      const keys = [...new Set([...Object.keys(x.node), ...Object.keys(y.node)])].filter((k) => J(x.node[k]) !== J(y.node[k]));
      changed.push({ what: label(x), role: x.role, keys });
    }
  }
  for (const [id, y] of B) if (!A.has(id)) added.push(label(y));
  return { changed, removed, added, background: a.background !== b.background ? `${a.background} → ${b.background}` : null, same: A.size - changed.length - removed.length };
}
const textOf = (board, role) => {
  let found = null;
  (function walk(list) {
    for (const n of list) {
      if (n.type === 'text' && n.role === role && !n.decorative && !found) found = n;
      if (n.type === 'group') walk(n.children);
    }
  })(board.children);
  return found;
};

// ── the briefs ──
const brief = (purpose, kind, format, content, mood = []) => {
  const b = C.readGraphicBrief(purpose, { formats: [format] });
  return { ...b, kind, formats: [format], content, mood: mood.length ? mood : b.mood, images: [] };
};
const BASE = brief(
  'A poster for a lecture series on the future of housing, at an architecture studio.',
  'poster',
  'a3',
  { headline: 'Rooms for Living', subhead: 'Six evenings on the future of housing', meta: ['Thursdays, 2 October – 6 November', 'Northlight Studio, 14 Dock Street'], cta: 'Reserve a seat', brand: 'Northlight' },
);
const H_BRIEF = brief('Create an experimental editorial poster for an independent architecture publication.', 'poster', 'a3', { headline: 'Plinth', subhead: 'Issue 07 — The Unbuilt', meta: ['Out 14 March', 'Independent writing on architecture'], brand: 'Plinth Journal' });
const I_BRIEFS = [
  ['fashion', brief('A campaign poster for a luxury fashion label’s autumn collection.', 'poster', 'a3', { headline: 'Maison Aurel', subhead: 'Autumn–Winter collection', meta: ['Paris · Milan · Tokyo'], brand: 'Maison Aurel' })],
  ['tech', brief('A poster for a technology conference about open infrastructure.', 'poster', 'a3', { headline: 'Open Systems 2027', subhead: 'Two days on the infrastructure of the open web', meta: ['9–10 June 2027', 'Kraftwerk, Berlin'], cta: 'Get tickets', brand: 'Open Systems' })],
  ['architecture', brief('A poster for an architecture studio’s open house.', 'poster', 'a3', { headline: 'Open House', subhead: 'An evening in the studio: models, drawings, work in progress', meta: ['Friday 18 September, from 18:00', 'Atelier Brandt, Rotterdam'], brand: 'Atelier Brandt' })],
  ['music', brief('A poster for an independent music event: three bands in a small venue.', 'poster', 'a3', { headline: 'Low Tide', subhead: 'Salt Marsh · Hollow Kids · The Verandas', meta: ['Sat 12 April, doors 20:00', 'The Boiler Room, Leith'], cta: 'Tickets on the door', brand: 'Low Tide' })],
  ['art', brief('A poster for a contemporary art exhibition about light and memory.', 'poster', 'a3', { headline: 'Afterimage', subhead: 'Light, memory and the photographic trace', meta: ['3 May – 27 July', 'Kunsthalle Nord'], brand: 'Kunsthalle Nord' })],
];

// ── the engine as it was: directions proposed in code, the design composed in code ──
const seedOf = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 9973;
function proposeFor(b, projectId) {
  const accent = C.accentFor(b, projectId);
  const db = V.normalizeBrief({ pageType: 'website', objective: b.purpose || b.content.headline, personality: b.mood, visualDirection: [b.purpose, b.mood.join(', ')].filter(Boolean).join('. '), palette: [{ name: 'Accent', hex: accent.hex, role: 'accent' }], typography: { display: '', body: '' }, decisions: { colour: 'delegated', typography: 'delegated' } });
  const dirs = V.proposeDirections({ brief: db, salt: projectId, round: 0, seen: [], count: 3 }).map((d) => C.graphicDirectionOf(d));
  const options = SP.styledOptions(b, dirs, { salt: `${projectId}|0`, seedKey: projectId, seen: [] }).options;
  const generated = CR.languageDirection(b.purpose || b.content.headline, b.mood, `${projectId}|0`);
  const mixed = [...options.slice(0, Math.max(1, options.length - 1)), generated];
  const leads = GE.interpretations({ count: mixed.length, salt: `${projectId}|0`, hasImage: false, hasData: false });
  return mixed.map((d, i) => ({ ...d, generative: { seed: leads[i].seed, emphasis: leads[i].emphasis, ...(leads[i].unexpected ? { constraints: { unexpected: true } } : {}) } }));
}
async function composeByRules(b, projectId) {
  const t0 = Date.now();
  const dir = proposeFor(b, projectId)[0];
  const made = await settle((m) => {
    const c = C.composeGraphic(b, dir, { measure: m, seed: seedOf(projectId), name: b.content.headline });
    return { ...c, refined: CK.refineDoc(c.doc, m) };
  });
  return { doc: made.refined.doc, dir, ms: Date.now() - t0, model: null, usage: null, said: made.plans.flatMap((p) => p.said).slice(0, 6), findings: made.refined.remaining.filter((f) => f.severity !== 'low').map((f) => f.message ?? f.kind) };
}

/** An edit as the editor carried it out before the overhaul: the reader's plan (the model unreachable), or the precise reader. */
async function editByRules(doc, words, dir, kind) {
  const board = doc.artboards[0];
  const t0 = Date.now();
  const read = CR.readCreative(words, { doc, board: board.id, concepts: [], asked: null });
  const creative = !!read && read.plan.changes.some((c) => c.decision !== 'object');
  if (!creative) {
    const e = ED.readGraphicEdit(words, D.boardView(doc, board.id), { artboard: board.id, selection: [], dir, measure, kind });
    if (e && (e.ops.length || e.next)) {
      const next = e.next ? D.fromBoardView(doc, e.next, board.id) : ((r) => (r.ok ? D.fromBoardView(doc, r.doc, board.id) : null))(D.applyOps(D.boardView(doc, board.id), e.ops));
      if (next) return { path: 'precise reader', doc: next, said: e.label, ms: Date.now() - t0, question: e.question ?? null, plan: null };
    }
    if (e?.question) return { path: 'question (precise reader)', doc, said: e.question, ms: Date.now() - t0, question: e.question, plan: null };
  }
  if (!read?.plan) return { path: 'question (nothing read)', doc, said: `I want to get “${words}” right — which is closest to what you mean? A theme / More refined / Bolder and more alive / A completely new idea`, ms: Date.now() - t0, question: 'canned', plan: null };
  if (!read.plan.changes.length && read.plan.question) return { path: 'question (reader)', doc, said: read.plan.question.text, ms: Date.now() - t0, question: read.plan.question.text, plan: read.plan };
  const r = await settle((m) => CR.executePlan(doc, read.plan, { board: board.id, dir, kind, measure: m, concepts: [], said: words, now: 1700000000000 }));
  if (!r || r.doc === doc || !r.done.length) return { path: 'reader plan, nothing changed', doc, said: r?.notes.join(' ') || 'This design already is what those words ask for.', ms: Date.now() - t0, question: null, plan: read.plan };
  return { path: `reader plan (${read.certain ? 'certain' : 'uncertain'})`, doc: r.doc, said: r.done.join('; '), ms: Date.now() - t0, question: null, plan: read.plan, notes: r.notes };
}

// ── the engine after the overhaul (filled in by the director's modules; see the head of this file) ──
let director = null;
if (ENGINE === 'director') {
  director = await import('./creative-engine-director.mjs').then((m) => m.makeDirector({ V, settle, measure, picture, out: OUT })).catch((e) => ({ blocked: String(e?.message ?? e) }));
  if (director.blocked) console.log(`director: BLOCKED — ${director.blocked}`);
}
const compose = (b, projectId) => (flowStart(`compose|${projectId}`), ENGINE === 'director' && !director.blocked ? director.compose(b, projectId) : composeByRules(b, projectId));
const edit = (doc, words, dir, kind, memory) => (flowStart(`edit|${words}|${(memory?.recent ?? []).length}`), ENGINE === 'director' && !director.blocked ? director.edit(doc, words, dir, kind, memory) : editByRules(doc, words, dir, kind));
/** A step that may be waiting for an answer (BENCH_LIVE=agents): null then, and the test is marked pending. */
const waiting = [];
async function attempt(id, fn) {
  try {
    return await fn();
  } catch (e) {
    if (e?.name !== 'Pending') throw e;
    waiting.push(id);
    console.log(`${id}: waiting for an answer (${e.key})`);
    return null;
  }
}

// ── the tests ──
const report = { engine: ENGINE, at: new Date().toISOString(), blocked: director?.blocked ?? null, tests: {} };
const usage = [];
const note = (u) => u && usage.push(u);

const base = (await attempt('base', () => compose(BASE, 'bench-base'))) ?? { pending: true, doc: null };
if (base.pending) console.log('base: pending — the edit tests wait for it');
note(base.usage);
const baseBoard = () => base.doc.artboards[0];
const baseShot = base.pending ? null : await draw(base.doc, baseBoard().id, 'base.png');
if (!base.pending) {
report.base = { headline: BASE.content.headline, ms: base.ms, model: base.model, usage: base.usage, said: base.said, direction: base.direction ?? null, review: base.review ?? null, problems: base.problems ?? [], objects: baseBoard().children.length, palette: (baseBoard().tokens ?? base.doc.tokens).colors, fonts: (baseBoard().tokens ?? base.doc.tokens).fonts, findings: base.findings };
console.log(`base: ${baseBoard().children.length} objects in ${base.ms} ms${base.model ? ` (${base.model})` : ''}`);
}

const EDITS = [
  ['A', 'Make this cloud themed.', 'a coherent transformation of the relevant elements (not cloud icons on a blue gradient); words and logo intact'],
  ['B', 'Make this feel more sophisticated and atmospheric.', 'decisions across composition, hierarchy, type, imagery and space'],
  ['C', 'Make this look like a premium architecture studio.', 'a subject-specific solution, not a generic layout'],
  ['D', 'Keep the logo and typography. Redesign everything else.', 'logo and type untouched; the rest transformed'],
  ['E', 'Make the headline slightly smaller.', 'only the headline changes'],
  ['F', 'Make the design feel more cinematic. Adjust the imagery, lighting, background, and typography.', 'a coordinated change across related elements'],
  ['G', 'Make it better.', 'improvements found from the artifact and its brief; a question only if necessary'],
];
const editItems = base.pending ? [] : [{ svg: baseShot.svg, css: baseShot.css, cap: '<b>Base</b> — the design every edit starts from' }];
for (const [id, words, expect] of EDITS) {
  if (!want(id) || base.pending) continue;
  const r = await attempt(id, () => edit(base.doc, words, base.dir, BASE.kind, { brief: BASE.purpose }));
  if (!r) continue;
  note(r.usage);
  const after = r.doc.artboards.find((b) => b.id === baseBoard().id) ?? r.doc.artboards[0];
  const d = diffBoards(baseBoard(), after);
  const shot = await draw(r.doc, after.id, `${id}.png`);
  const h0 = textOf(baseBoard(), 'headline');
  const h1 = textOf(after, 'headline');
  const l0 = textOf(baseBoard(), 'logo');
  const l1 = textOf(after, 'logo');
  const wordsKept = [...flat(baseBoard()).values()].filter((x) => x.type === 'text' && !x.node.decorative).every((x) => [...flat(after).values()].some((y) => y.type === 'text' && y.node.text === x.node.text));
  report.tests[id] = {
    instruction: words,
    expect,
    slop: slopOf(r.doc),
    path: r.path,
    said: r.said,
    question: r.question,
    plan: r.plan ? { intent: r.plan.intent, keep: r.plan.keep, changes: r.plan.changes } : null,
    understanding: r.understanding ?? null,
    edits: r.edits ?? null,
    failedOperations: r.failed ?? [],
    kept: r.kept ?? [],
    notes: r.notes ?? [],
    review: r.review ?? null,
    ms: r.ms,
    model: r.model ?? null,
    usage: r.usage ?? null,
    changed: d.changed.map((c) => `${c.what}: ${c.keys.join(', ')}`),
    added: d.added,
    removed: d.removed,
    background: d.background,
    untouched: d.same,
    nothingChanged: r.doc === base.doc || (!d.changed.length && !d.added.length && !d.removed.length && !d.background),
    wordsKept,
    headline: h0 && h1 ? { size: [Math.round(h0.size * 10) / 10, Math.round(h1.size * 10) / 10], font: [h0.font, h1.font], box: [[h0.x, h0.y, h0.w, h0.h].map(Math.round), [h1.x, h1.y, h1.w, h1.h].map(Math.round)] } : null,
    logoSame: l0 && l1 ? J({ ...l0 }) === J({ ...l1 }) : null,
    typeSame: [...flat(baseBoard()).values()].filter((x) => x.type === 'text' && !x.node.decorative).every((x) => { const y = [...flat(after).values()].find((z) => z.type === 'text' && z.node.text === x.node.text); return y && y.node.font === x.node.font && y.node.weight === x.node.weight && (y.node.case ?? 'none') === (x.node.case ?? 'none'); }),
  };
  editItems.push({ svg: shot.svg, css: shot.css, cap: `<b>${id}</b> “${words}”<br>${r.path}${r.question ? ' — asked a question' : ''}<br>${(r.said ?? '').slice(0, 220)}` });
  console.log(`${id}: ${r.path} — changed ${d.changed.length}, added ${d.added.length}, removed ${d.removed.length}, untouched ${d.same}${r.question ? ' [question]' : ''}`);
}
if (editItems.length > 1) await sheet(editItems, 'sheet-edits.png', `Edits A–G on one design — engine: ${ENGINE}`);

const h = want('H') ? await attempt('H', () => compose(H_BRIEF, 'bench-h')) : null;
if (h) {
  note(h.usage);
  const shot = await draw(h.doc, h.doc.artboards[0].id, 'H.png');
  report.tests.H = { instruction: H_BRIEF.purpose, ms: h.ms, model: h.model, usage: h.usage, said: h.said, direction: h.direction ?? null, review: h.review ?? null, problems: h.problems ?? [], instructions: h.instructions ?? null, objects: h.doc.artboards[0].children.length, palette: (h.doc.artboards[0].tokens ?? h.doc.tokens).colors, fonts: (h.doc.artboards[0].tokens ?? h.doc.tokens).fonts, findings: h.findings, slop: slopOf(h.doc) };
  await sheet([{ svg: shot.svg, css: shot.css, w: 520, cap: `<b>H</b> ${H_BRIEF.purpose}<br>${(h.said ?? []).join(' ').slice(0, 400)}` }], 'sheet-H.png', `Original generation — engine: ${ENGINE}`);
  console.log(`H: ${h.doc.artboards[0].children.length} objects in ${h.ms} ms`);
}

if (want('I')) {
  const made = [];
  for (const [name, b] of I_BRIEFS) {
    const r = await attempt(`I/${name}`, () => compose(b, `bench-i-${name}`));
    if (!r) continue;
    note(r.usage);
    const shot = await draw(r.doc, r.doc.artboards[0].id, `I-${name}.png`);
    made.push({ name, b, r, shot, sig: EV.signatureOfBoard(r.doc.artboards[0]) });
    console.log(`I/${name}: ${r.doc.artboards[0].children.length} objects in ${r.ms} ms`);
  }
  if (made.length === I_BRIEFS.length) {
  const pairs = [];
  for (let a = 0; a < made.length; a++) for (let c = a + 1; c < made.length; c++) pairs.push({ a: made[a].name, b: made[c].name, similarity: +EV.similarity(made[a].sig, made[c].sig).toFixed(3) });
  report.tests.I = {
    designs: made.map((m) => ({ name: m.name, ms: m.r.ms, model: m.r.model, usage: m.r.usage, palette: (m.r.doc.artboards[0].tokens ?? m.r.doc.tokens).colors, fonts: (m.r.doc.artboards[0].tokens ?? m.r.doc.tokens).fonts, objects: m.r.doc.artboards[0].children.length, direction: m.r.direction ?? null, review: m.r.review ?? null, problems: m.r.problems ?? [], said: m.r.said, findings: m.r.findings, slop: slopOf(m.r.doc) })),
    structuralSimilarity: { pairs, mean: +(pairs.reduce((s, p) => s + p.similarity, 0) / pairs.length).toFixed(3), max: Math.max(...pairs.map((p) => p.similarity)), tooSimilar: pairs.filter((p) => p.similarity >= EV.TOO_SIMILAR).length },
    distinctDisplayFaces: new Set(made.map((m) => (m.r.doc.artboards[0].tokens ?? m.r.doc.tokens).fonts.display)).size,
    distinctGrounds: new Set(made.map((m) => (m.r.doc.artboards[0].tokens ?? m.r.doc.tokens).colors.background)).size,
  };
  await sheet(made.map((m) => ({ svg: m.shot.svg, css: m.shot.css, w: 270, cap: `<b>${m.name}</b> — ${m.b.purpose}<br>${(m.r.said?.[0] ?? '').slice(0, 220)}` })), 'sheet-I.png', `Five subjects, one engine — engine: ${ENGINE}`);
  }
}

if (want('J') && !base.pending) {
  // multi-turn: change the palette, change the type, change the composition; then ask for the first palette back
  const turns = ['Make the colours warm and earthy.', 'Make the typography more expressive.', 'Move the focal point toward the right.', 'Go back to the original colours.'];
  let doc = base.doc;
  const steps = [];
  const items = [{ svg: baseShot.svg, css: baseShot.css, w: 250, cap: '<b>Start</b>' }];
  const recent = [];
  let stopped = false;
  for (const [i, words] of turns.entries()) {
    const r = await attempt(`J${i + 1}`, () => edit(doc, words, base.dir, BASE.kind, { brief: BASE.purpose, recent: [...recent] }));
    if (!r) {
      stopped = true;
      break;
    }
    note(r.usage);
    const before = doc.artboards[0];
    const after = r.doc.artboards[0];
    const d = diffBoards(before, after);
    steps.push({ words, path: r.path, said: r.said, question: r.question, changed: d.changed.length, added: d.added.length, removed: d.removed.length, palette: (after.tokens ?? r.doc.tokens).colors, fonts: (after.tokens ?? r.doc.tokens).fonts, ms: r.ms, usage: r.usage ?? null });
    recent.push({ said: words, did: r.said ?? '' });
    doc = r.doc;
    const shot = await draw(doc, after.id, `J-${i + 1}.png`);
    items.push({ svg: shot.svg, css: shot.css, w: 250, cap: `<b>${i + 1}.</b> “${words}”<br>${r.path}<br>${(r.said ?? '').slice(0, 160)}` });
    console.log(`J${i + 1}: ${r.path} — changed ${d.changed.length}`);
  }
  if (!stopped) {
  const p0 = (baseBoard().tokens ?? base.doc.tokens).colors;
  const p4 = (doc.artboards[0].tokens ?? doc.tokens).colors;
  const f2 = steps[1].fonts;
  const f4 = (doc.artboards[0].tokens ?? doc.tokens).fonts;
  report.tests.J = { steps, paletteRestored: J(p0) === J(p4), typeKeptAfterRestore: J(f2) === J(f4), paletteChangedAtStep1: J(steps[0].palette) !== J(p0) };
  await sheet(items, 'sheet-J.png', `Multi-turn continuity — engine: ${ENGINE}`);
  }
}

// ── K: habits looked for in every generated design ──
function slopOf(doc) {
  const b = doc.artboards[0];
  const all = [...flat(b).values()].map((x) => x.node);
  const shapes = all.filter((n) => n.type === 'shape');
  const texts = all.filter((n) => n.type === 'text' && !n.decorative);
  const area = b.width * b.height;
  const isGrad = (p) => p && typeof p === 'object' && (p.type === 'linear' || p.type === 'radial');
  const hue = (hex) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const mx = Math.max(r, g, bl);
    const mn = Math.min(r, g, bl);
    if (mx - mn < 0.08) return null;
    const h = mx === r ? ((g - bl) / (mx - mn)) % 6 : mx === g ? (bl - r) / (mx - mn) + 2 : (r - g) / (mx - mn) + 4;
    return (h * 60 + 360) % 360;
  };
  const gradGrounds = shapes.filter((n) => isGrad(n.fill) && n.w * n.h > area * 0.5);
  const purpleBlue = gradGrounds.filter((n) => n.fill.stops.every((s) => ((h) => h !== null && h >= 200 && h <= 300)(hue(s.color.slice(0, 7)))));
  const roundedCards = shapes.filter((n) => n.shape === 'rect' && (n.radius ?? 0) > Math.min(n.w, n.h) * 0.08 && n.w * n.h > area * 0.02 && n.w * n.h < area * 0.4);
  const smallFloating = shapes.filter((n) => n.role !== 'background' && n.w * n.h < area * 0.02 && n.shape !== 'line');
  const glows = all.filter((n) => (n.effects ?? []).some((e) => /glow|blur|shadow/.test(e.kind))).length;
  const centred = texts.length ? texts.filter((t) => t.align === 'center').length / texts.length : 0;
  const faces = new Set(texts.map((t) => t.font));
  // (the product's own habit detector says the rest: the stock poster structure among them)
  const own = CR.dirEvaluate.habitsOf(b);
  return { gradientGround: gradGrounds.length > 0, purpleBlueGradient: purpleBlue.length > 0, roundedCards: roundedCards.length, smallFloatingShapes: smallFloating.length, glowsShadowsBlurs: glows, centredTextShare: +centred.toFixed(2), faces: faces.size, objects: all.length, stockStructure: own.stockStructure, said: own.said };
}
// every design this run made, and every design it changed: the habits each one shows
if (want('K') && !base.pending) {
  const rows = { base: slopOf(base.doc) };
  if (report.tests.H?.slop) rows.H = report.tests.H.slop;
  for (const d of report.tests.I?.designs ?? []) rows[`I/${d.name}`] = d.slop;
  for (const [id] of EDITS) if (report.tests[id]?.slop) rows[`after ${id}`] = report.tests[id].slop;
  const all = Object.values(rows);
  report.tests.K = { designs: rows, totals: { designs: all.length, gradientGrounds: all.filter((x) => x.gradientGround).length, purpleBlueGradients: all.filter((x) => x.purpleBlueGradient).length, withRoundedCards: all.filter((x) => x.roundedCards > 0).length, withGlowsShadowsBlurs: all.filter((x) => x.glowsShadowsBlurs > 0).length, mostlyCentred: all.filter((x) => x.centredTextShare > 0.6).length, stockStructure: all.filter((x) => x.stockStructure).length } };
}

report.waiting = waiting;
if (director?.pending?.length) {
  writeFileSync(`${OUT}pending.json`, JSON.stringify(director.pending, null, 2));
  console.log(`\n${director.pending.length} request(s) waiting for an answer: ${OUT}pending.json`);
}
report.mode = director?.mode ?? null;
report.calls = director?.calls ?? null;
report.usage = usage.length ? { calls: usage.reduce((s, u) => s + (u.calls ?? 1), 0), estimated: usage.some((u) => u.estimated), input: usage.reduce((s, u) => s + (u.input ?? 0), 0), output: usage.reduce((s, u) => s + (u.output ?? 0), 0), cached: usage.reduce((s, u) => s + (u.cached ?? 0), 0), cost: usage.some((u) => u.cost == null) ? null : +usage.reduce((s, u) => s + (u.cost ?? 0), 0).toFixed(4) } : null;
report.sheets = sheets;
report.ms = Date.now() - new Date(report.at).getTime();
writeFileSync(`${OUT}report.json`, JSON.stringify(report, null, 2));
await browser.close();
console.log(`\nwritten: ${OUT}report.json  (${sheets.join(', ')})`);
