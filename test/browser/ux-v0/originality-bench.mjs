// test/browser/ux-v0/originality-bench.mjs — visual originality and compositional diversity, measured.
//
// Six projects with substantially different identities, plus a plain one that must stay plain, go through this
// checkout's engine and the engine of an earlier commit (UXV0_BASE_COMMIT, default 3df371a: the commit before this
// work), bundled from `git archive` beside it. No model is called and nothing is spent. Both engines get the SAME
// brief and the SAME deliberately conventional "model answer" (a centred hero, a grid of feature cards, a row of
// figures, a quote, a gallery, a story beside a picture, a call to action): what a model writes when it falls back
// on habit. What differs is what SocriaUX does in code: the direction, its shape system and compositional strategy,
// and what it holds in the design whatever the model wrote.
//
//   architecture studio · fashion house · science lab · experimental artist · music festival · ceramics shop
//
// For each project and engine: the design, repaired as the canvas would (two rounds at most), drawn in Chromium at
// 1440, 834 and 390 px, and measured with ONE instrument:
//
//   structure      each composed part's arrangement signature, the page's sequence; pairwise similarity across the
//                  six projects (are they variations of one template?)
//   shapes         the shapes the page draws (masks, planes, fragments, edges, wraps): their constructions and
//                  signatures; repeated within a page; shared across projects; decorative circles
//   type           display sizes, vertical/rotated/outline type, the type role the strategy chose
//   pictures       how many are integrated (cut to a shape, fragmented, overlapped by words) rather than boxed
//   patterns       the originality audit's unjustified patterns (cards, three equal columns, pills, circles…)
//   mobile         nothing past the edge, no words colliding, no ornament left standing, reading order kept
//   fidelity       the strategy held: the parts it composes composed, its navigation, its picture treatment
//
// The numbers are SocriaUX's own measures of pages drawn in a browser, not a judgement of beauty and not a
// comparison with any other product. Pictures are SocriaUX's made drawings; fonts are not fetched (fallback faces).
// Writes originality-bench.json/.md, orig-*.png and orig-contact-sheet.png to UXV0_OUT.
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, S, ROOT, underTest } from './env.mjs';

const V = await underTest();
const J = JSON.stringify;
const COMMIT = process.env.UXV0_BASE_COMMIT || '3df371a';

async function baseline() {
  if (process.env.UXV0_BASELINE) return import(pathToFileURL(process.env.UXV0_BASELINE).href);
  const dir = join(S, `base-${COMMIT}`);
  const out = join(dir, 'ux-v0-baseline.mjs');
  if (!existsSync(out)) {
    mkdirSync(dir, { recursive: true });
    execSync(`git -C "${ROOT}" archive ${COMMIT} lib test/helpers tsconfig.json package.json | tar -x -C "${dir}"`, { stdio: 'pipe' });
    if (!existsSync(join(dir, 'node_modules'))) execSync(`ln -s "${join(ROOT, 'node_modules')}" "${join(dir, 'node_modules')}"`);
    const { build } = createRequire(join(ROOT, 'package.json'))('esbuild');
    await build({ entryPoints: [join(dir, 'test/helpers/ux-v0-under-test.ts')], bundle: true, format: 'esm', platform: 'node', outfile: out, tsconfig: join(dir, 'tsconfig.json'), jsx: 'automatic', loader: { '.css': 'empty' }, alias: { 'server-only': join(dir, 'test/helpers/server-only-shim.mjs') }, external: ['undici', 'openai', 'unpdf', 'react', 'react/jsx-runtime', 'react-dom'], logLevel: 'error' });
  }
  return import(pathToFileURL(out).href);
}
const B = process.env.UXV0_NO_BASELINE ? null : await baseline();

let pass = 0;
let fail = 0;
const checks = [];
const ok = (n, c, x = '') => {
  checks.push({ n, ok: !!c, x: c ? '' : String(x).slice(0, 500) });
  c ? (pass++, console.log('  ok  ', n)) : (fail++, console.log('  FAIL', n, String(x).slice(0, 500)));
};

const brief = (o) => ({ pageType: 'website', platform: 'web', palette: [], typography: { display: '', body: '' }, decisions: { colour: 'delegated', typography: 'delegated' }, ...o });
const PROJECTS = [
  { id: 'architecture', name: 'Atelier Brut', label: 'Architecture studio', action: 'See the work', title: 'Concrete, held in tension', sub: 'Cultural buildings, cast on site.', art: 'contour',
    brief: brief({ objective: 'A website for an architecture studio that builds cultural buildings in concrete.', audience: 'Municipalities and cultural institutions', personality: ['rigorous', 'material'], visualDirection: 'Architectural and structural: monumental and restrained, a strict grid, plan views and stacked blocks. No rounded corners, no cards.' }) },
  { id: 'fashion', name: 'Maison Arlet', label: 'Fashion house', action: 'Ask for a fitting', title: 'Autumn, cut by hand', sub: 'Tailored coats from the Paris atelier.', art: 'grain',
    brief: brief({ objective: 'Present the autumn collection of a couture house and invite clients to private fittings.', audience: 'Clients of the house', personality: ['sensual', 'assured'], visualDirection: 'Fluid silhouettes and draped silk, layered and cinematic, contemporary luxury with dramatic scale.' }) },
  { id: 'science', name: 'Kepler Lab', label: 'Science lab', action: 'Read the papers', title: 'Measuring the quiet sky', sub: 'An astronomy research group.', art: 'orbit',
    brief: brief({ objective: 'A website for an astronomy research lab that publishes data and recruits students.', audience: 'Researchers and students', personality: ['precise', 'curious'], visualDirection: 'Scientific and precise: orbit diagrams, concentric rings and measured data, calm and geometric.' }) },
  { id: 'artist', name: 'Ines Varga', label: 'Experimental artist', action: 'See the archive', title: 'Things broken on purpose', sub: 'Collage, print and installation.', art: 'field',
    brief: brief({ objective: 'A portfolio for an experimental artist working in collage and installation.', audience: 'Curators and collectors', personality: ['raw', 'daring'], visualDirection: 'Experimental and fragmented: collage, torn and cut-up, abstract and off-grid, layered with depth.' }) },
  { id: 'festival', name: 'Loud Orbit', label: 'Music festival', action: 'Get tickets', title: 'Three days of sound', sub: 'A festival in the harbour, in August.', art: 'lattice',
    brief: brief({ objective: 'Sell tickets for a three-day electronic music festival.', audience: 'Festival-goers', personality: ['playful', 'loud'], visualDirection: 'Kinetic and maximal: radial sound waves, ripples and spirals, bold type that moves, playful and expressive.' }) },
  { id: 'ceramics', name: 'Kiln & Hand', label: 'Ceramics shop', action: 'Visit the shop', title: 'Pots for slow mornings', sub: 'Stoneware thrown and fired in Devon.', art: 'render',
    brief: brief({ objective: 'Sell handmade stoneware and invite people to the studio.', audience: 'People who care about how things are made', personality: ['warm', 'calm'], visualDirection: 'Organic and warm: soft forms like pebbles, handmade, calm. Nothing fragmented.' }) },
];

/** What a model writes by habit: the same answer for both engines. */
const conventional = (P, ids) => ({
  title: P.name,
  sections: [
    { id: 'nav', kind: 'nav', variant: 'inline', content: { brand: P.name, links: ['Work', 'Studio', 'Journal', 'Contact'], cta: P.action } },
    { id: 'hero', kind: 'hero', variant: 'centered', content: { eyebrow: P.label, title: P.title, subtitle: P.sub, primary: P.action, secondary: 'Learn more' }, images: [ids[0]] },
    { id: 'features', kind: 'features', variant: 'grid', content: { title: 'How the work is made', items: [{ title: 'Listen', text: 'Before anything is drawn, we listen to the place and the people.', icon: 'star' }, { title: 'Frame', text: 'One idea that every decision answers to.', icon: 'compass' }, { title: 'Make', text: 'By hand, with the people who will use it.', icon: 'heart' }] } },
    { id: 'stats', kind: 'stats', variant: 'row', content: { title: 'In numbers', items: [{ value: '14', label: 'years of work' }, { value: '62', label: 'projects finished' }, { value: '9', label: 'people in the studio' }] } },
    { id: 'quote', kind: 'quote', variant: 'large', content: { quote: 'They listened longer than anyone we have worked with, and it shows in everything they made.', author: 'Ana Ruiz', role: 'Director, Casa Verde' } },
    { id: 'gallery', kind: 'gallery', variant: 'grid', content: { title: 'Selected work' }, images: ids.slice(1, 5) },
    { id: 'story', kind: 'split', variant: 'image-right', content: { eyebrow: 'The studio', title: 'Made where it is used', text: 'Every piece begins with a visit: we walk the site, measure the light, and listen to the people who will live with what we make. Then we draw by hand, build models, and only then decide. Nothing leaves the studio until it has been used for a week by someone who was not in the room when it was made.', cta: 'Visit us' }, images: [ids[5]] },
    { id: 'cta', kind: 'cta', variant: 'band', content: { title: 'Begin a project', text: 'Write to us; we answer every letter.', primary: P.action } },
    { id: 'footer', kind: 'footer', variant: 'simple', content: { brand: P.name, columns: [] } },
  ],
});

const WIDTHS = [['desktop', 1440, 900], ['tablet', 834, 1112], ['phone', 390, 844]];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.route('**/*', (r) => (/^(data|about):/.test(r.request().url()) ? r.continue() : r.abort()));
const errors = [];
let page = null;
const load = async (html, w, h) => {
  if (page) await page.close();
  page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(html, { waitUntil: 'load' });
};
const auditsOf = async (E, spec, refs) => {
  const html = E.renderDesign(spec, refs, { runtime: true }).html;
  const out = {};
  for (const [vp, w, h] of WIDTHS) {
    await load(html, w, h);
    await page.waitForTimeout(250);
    await page.addScriptTag({ content: V.AUDIT_SOURCE });
    out[vp] = V.normalizeAudit(await page.evaluate(() => window.__uxv0Audit()));
  }
  return out;
};

/** One engine's design of the conventional answer, repaired as its own canvas would. */
async function make(E, P) {
  const b = E.normalizeBrief(P.brief, new Set());
  const dirs = E.proposeDirections({ brief: b, salt: `orig-${P.id}` });
  const dir = dirs[0];
  const pal = E.paletteOf(dir.tokens, dir.look.accent2 ?? '');
  const refs = [0, 1, 2, 3, 4, 5].map((i) => E.normalizeRef({ ...E.procRef(E.normalizeProc({ kind: i === 0 ? P.art : ['field', 'contour', 'lattice', 'orbit', 'grain'][i - 1], seed: 7 + i * 11, ratio: i === 0 ? '16:9' : i === 5 ? '4:3' : '1:1', palette: pal }), 'a stand-in until the project’s own pictures'), state: 'kept', asContent: true }));
  const board = E.normalizeMoodboard({ refs });
  let spec = E.parseGenerate(conventional(P, refs.map((r) => r.id)), b, board, 1, 'bench', dir);
  for (let round = 0; round < 2; round++) {
    const au = await auditsOf(E, spec, refs);
    const ev = E.evaluateDesign(spec, au, dir.locks ?? [], { direction: dir, brief: b, board });
    const fixes = E.fixesFor(ev);
    if (!fixes.length) break;
    for (const f of fixes) {
      const r = E.applyPatch(spec, f.patch, board);
      if (r.ok) spec = r.spec;
    }
  }
  return { b, dirs, dir, refs, board, spec, prompt: E.generateSystem(b, dir).length };
}

/** Every shape a page draws: composed planes, masks, fragments and wraps, the pictures its frame cuts, its edges. */
function shapesOf(spec) {
  const out = [];
  for (const s of spec.sections) if (s.kind === 'compose') out.push(...V.shapesIn(s.content.root));
  const form = spec.look.form;
  if (form && spec.look.frame === 'shaped') {
    const framed = spec.sections.filter((s) => s.kind !== 'compose').reduce((n, s) => n + s.images.length, 0);
    for (let k = 0; k < framed; k++) out.push(V.figureFor(form, 'mask', k));
  }
  if (form && spec.look.edges === 'shaped') out.push(V.figureFor(form, 'edge', 0));
  // a drawn band or ribbon is the composition's own line, not part of the vocabulary
  return out.filter((x) => x.kind !== 'custom');
}

/** The one instrument, applied to either engine's design. */
async function measure(E, made, P, tag) {
  const { spec, refs } = made;
  const au = await auditsOf(E, spec, refs);
  const nb = V.normalizeBrief(P.brief, new Set());
  const orig = V.auditOriginality({ spec, brief: nb, audit: au.desktop });
  const play = E.renderDesign(spec, refs, { motion: 'play', runtime: true }).html;
  // the whole page at rest (as the canvas draws it): a full-page picture of a playing page would show everything below
  // the first screen before it arrives
  const rest = E.renderDesign(spec, refs, { runtime: true }).html;
  const shots = {};
  for (const [vp, w, h] of WIDTHS) {
    await load(rest, w, h);
    await page.evaluate(() => document.querySelectorAll('img[loading="lazy"]').forEach((i) => (i.loading = 'eager')));
    await page.waitForTimeout(700);
    shots[vp] = `orig-${P.id}-${tag}-${vp}.png`;
    await page.screenshot({ path: S + shots[vp], fullPage: true });
  }
  // what the rendered page shows: pictures integrated, type treatments, shapes drawn, circles
  await load(play, 1440, 900);
  await page.waitForTimeout(300);
  const dom = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll('main img, section img, .sx img')].filter((i) => i.getBoundingClientRect().width > 40);
    const integrated = imgs.filter((i) => { const cs = getComputedStyle(i); return (cs.clipPath && cs.clipPath !== 'none') || i.closest('.cp-frag,.cp-float,.cp-layer') || i.closest('.cp-cell')?.parentElement?.querySelector('.cp-lines,.cp-plate'); }).length;
    const q = (sel) => document.querySelectorAll(sel).length;
    const circles = [...document.querySelectorAll('circle, ellipse')].filter((c) => !c.closest('img')).length;
    return { images: imgs.length, integrated, vertical: q('.cp-vert'), rotated: q('.cp-rot'), outline: q('.cp-stroke'), display: q('.cp-sz-xl,.cp-sz-giant'), shapes: q('.cp-shape'), edges: q('.sx-edge'), wraps: q('.cp-flow'), frags: q('.cp-frag'), circles, nav: document.querySelector('.sx-nav')?.className ?? '', anchors: [...document.querySelectorAll('.sx-nav .nav-links a')].filter((a) => a.getAttribute('href') !== '#' && document.querySelector(a.getAttribute('href'))).length, links: q('.sx-nav .nav-links a') };
  });
  const works = await page.evaluate(() => ({ interactive: window.__uxBehaviors?.selfTestInteractive ? window.__uxBehaviors.selfTestInteractive() : [], menus: window.__uxBehaviors?.menus ?? 0 }));
  const composed = spec.sections.filter((s) => s.kind === 'compose');
  const shapes = shapesOf(spec);
  const sigs = shapes.map((x) => V.figureSignature(x));
  // the same mark drawn twice (one seed, one recipe) is repetition; related figures of one family are not
  const keys = shapes.map((x) => V.shapeKey(x));
  const unjustified = orig.findings.filter((f) => !f.justified).map((f) => f.pattern);
  return {
    language: made.dir.language, name: made.dir.name, fonts: `${spec.tokens.fonts.display} / ${spec.tokens.fonts.body}`,
    strategy: made.dir.strategy ? { axis: made.dir.strategy.axis, type: made.dir.strategy.type.role, images: made.dir.strategy.images, nav: made.dir.strategy.nav, recompose: made.dir.strategy.recompose, said: made.dir.strategy.said } : null,
    form: spec.look.form ? V.describeForm(spec.look.form) : null,
    formSaid: made.dir.formSaid ?? [],
    sequence: spec.sections.map((s) => (s.kind === 'compose' ? `compose:${s.content.root.t}` : `${s.kind}/${s.variant}`)),
    composed: composed.length,
    composeSigs: composed.map((s) => V.composeSignature(s.content.root)),
    shapes: sigs, shapeKinds: [...new Set(shapes.map((x) => x.kind))], shapeIdeas: new Set(sigs).size, shapeRepeats: keys.length - new Set(keys).size,
    frame: spec.look.frame, edges: spec.look.edges ?? 'straight',
    dom, works,
    patterns: unjustified, distinctiveness: orig.scores.distinctiveness, originality: orig.overall,
    overflow: WIDTHS.map(([vp]) => vp).filter((vp) => au[vp].overflowX > 2 || au[vp].overflow.length),
    collisions: WIDTHS.reduce((n, [vp]) => n + (au[vp].collisions ?? []).length, 0),
    contrast: au.desktop.contrast.length + au.phone.contrast.length,
    kb: Math.round(play.length / 100) / 10,
    prompt: made.prompt,
    shots,
    spec,
  };
}

/** How alike two pages are in structure, 0–1: their sequences and their composed arrangements. */
function structureLike(a, b) {
  const seq = V.sequenceLike(a.sequence, b.sequence);
  const both = [...a.composeSigs, ...b.composeSigs];
  const shared = a.composeSigs.filter((x) => b.composeSigs.includes(x)).length;
  const comp = both.length ? (2 * shared) / both.length : 1;
  return Math.round((0.6 * seq + 0.4 * comp) * 100) / 100;
}

const report = { at: new Date().toISOString(), baseline_commit: COMMIT, model_calls: 0, cost_usd: 0, projects: {} };
for (const P of PROJECTS) {
  console.log(`\n=== ${P.label}: ${P.name} ===`);
  errors.length = 0;
  const mNew = await make(V, P);
  const n = await measure(V, mNew, P, 'new');
  const o = B ? await measure(B, await make(B, P), P, 'base') : null;
  report.projects[P.id] = { label: P.label, name: P.name, new: n, base: o, errors: [...errors] };
  console.log(`  ${n.name} (${n.language}) · ${n.form}`);
  console.log(`  strategy: ${n.strategy?.axis} · type ${n.strategy?.type} · pictures ${n.strategy?.images} · nav ${n.strategy?.nav} · composes ${n.strategy?.recompose}`);
  console.log(`  sequence: ${n.sequence.join(' ')}`);
  console.log(`  shapes: ${n.shapeKinds.join(', ')} (${n.shapes.length}, ${n.shapeRepeats} repeated) · pictures integrated ${n.dom.integrated}/${n.dom.images} · patterns ${n.patterns.join(', ') || 'none'}${o ? ` (before: ${o.patterns.join(', ') || 'none'})` : ''}`);
  ok(`${P.id}: the strategy is held — ${n.composed} parts composed from their own content (it asked ${n.strategy?.recompose}${n.strategy?.recompose >= 2 ? ' and the opening' : ''})`, n.composed >= Math.min(n.strategy?.recompose ?? 0, 4), J(n.sequence));
  ok(`${P.id}: shapes are the direction's (${n.shapeKinds.join(', ')}): ${n.shapes.length} drawn, a family of ${n.shapeIdeas}, none the same mark twice`, n.shapeRepeats === 0, J(n.shapes));
  ok(`${P.id}: nothing past the edge at 1440, 834 or 390 px; no words colliding`, !n.overflow.length && !n.collisions, J({ overflow: n.overflow, collisions: n.collisions }));
  ok(`${P.id}: every interactive part works when tried; the navigation's links reach the parts they name (${n.dom.anchors}/${n.dom.links})`, n.works.interactive.every((i) => !i.problems.length) && n.dom.anchors >= Math.min(2, n.dom.links), J({ interactive: n.works.interactive, anchors: n.dom.anchors }));
  ok(`${P.id}: no script error; no text below its contrast (${n.contrast})`, !errors.length && n.contrast === 0, J({ errors, contrast: n.contrast }));
  if (o) ok(`${P.id}: fewer unjustified generated patterns than before (${o.patterns.length} → ${n.patterns.length})`, n.patterns.length <= o.patterns.length, J({ before: o.patterns, now: n.patterns }));
}

// ── across the six: no universal template ──
const ids = PROJECTS.map((P) => P.id);
const pairs = [];
for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) pairs.push([ids[i], ids[j]]);
const simNew = pairs.map(([a, b]) => structureLike(report.projects[a].new, report.projects[b].new));
const simOld = B ? pairs.map(([a, b]) => structureLike(report.projects[a].base, report.projects[b].base)) : [];
const mean = (xs) => Math.round((xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length)) * 100) / 100;
const axes = new Set(ids.map((id) => report.projects[id].new.strategy?.axis));
const kinds = new Set(ids.map((id) => report.projects[id].new.shapeKinds.join('+')));
const sharedShapes = (() => { const all = ids.map((id) => new Set(report.projects[id].new.shapes)); let n = 0; for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) for (const x of all[i]) if (all[j].has(x)) n++; return n; })();
report.across = { structureNew: mean(simNew), structureOld: B ? mean(simOld) : null, maxNew: Math.max(...simNew), axes: [...axes], shapeVocabularies: [...kinds], sharedShapeSignatures: sharedShapes };
// the shapes one project draws, beside another's: how many of its ideas another project also draws
const ideas = ids.map((id) => new Set(report.projects[id].new.shapes));
const overlaps = pairs.map(([a, b]) => { const A = ideas[ids.indexOf(a)]; const Bs = ideas[ids.indexOf(b)]; const inter = [...A].filter((x) => Bs.has(x)).length; return A.size + Bs.size ? inter / Math.min(A.size || 1, Bs.size || 1) : 0; });
report.across.shapeOverlap = mean(overlaps);
console.log(`\n=== across the six ===\n  structural similarity, mean of pairs: ${B ? `${report.across.structureOld} → ` : ''}${report.across.structureNew} (most alike pair ${report.across.maxNew}); spatial logics ${[...axes].join(', ')}; vocabularies ${[...kinds].join(' | ')}`);
ok(`the six are not variations of one template: mean pairwise structural similarity ${report.across.structureNew}${B ? ` (before ${report.across.structureOld})` : ''}`, report.across.structureNew < 0.55 && (!B || report.across.structureNew < report.across.structureOld), J(simNew));
ok(`at least four spatial logics across the six (${[...axes].join(', ')})`, axes.size >= 4);
ok(`each identity draws its own shape vocabulary (${kinds.size} different among 6; ideas shared between two projects, mean ${report.across.shapeOverlap})`, kinds.size >= 5 && report.across.shapeOverlap <= 0.34, J({ kinds: [...kinds], overlaps }));

// ── a simple brief stays simple ──
{
  const plain = V.normalizeBrief({ pageType: 'website', platform: 'web', objective: 'A website for a dentist in Leeds.', audience: 'Local families', personality: [], visualDirection: 'Simple and clear.', palette: [], typography: { display: '', body: '' }, userGoals: ['Find the opening hours', 'Call the practice'] }, new Set());
  const d = V.proposeDirections({ brief: plain, salt: 'orig-plain' })[0];
  const answer = conventional({ name: 'Leeds Dental', label: 'Dentist', title: 'Dentistry in Leeds', sub: 'Open six days.', action: 'Call us' }, []);
  const spec = V.parseGenerate(answer, plain, V.normalizeMoodboard({ refs: [] }), 1, 'bench', d);
  report.simple = { strategy: d.strategy?.said, sequence: spec.sections.map((s) => `${s.kind}/${s.variant}`) };
  ok('a simple brief stays simple: nothing recomposed, pictures not cut, no shaped edges, the navigation a bar', d.strategy?.recompose === 0 && !spec.sections.some((s) => s.kind === 'compose') && spec.look.frame !== 'shaped' && spec.look.edges !== 'shaped' && spec.sections.find((s) => s.kind === 'nav')?.variant === 'inline', J(report.simple));
}

// ── the contact sheet ──
const img = (f) => (f && existsSync(S + f) ? `<img src="data:image/png;base64,${readFileSync(S + f).toString('base64')}">` : '<div class="none">—</div>');
const rows = PROJECTS.map((P) => {
  const r = report.projects[P.id];
  const n = r.new;
  return `<div class="row"><div class="h"><h2>${P.label}</h2><p>${P.name}</p><p class="m"><b>${n.name}</b><br>${n.form ?? ''}<br>${n.strategy?.axis} · type ${n.strategy?.type} · pictures ${n.strategy?.images} · nav ${n.strategy?.nav}<br>shapes: ${n.shapeKinds.join(', ') || '—'}<br>patterns ${r.base ? `${r.base.patterns.length} → ` : ''}<b>${n.patterns.length}</b></p></div>${r.base ? `<figure>${img(r.base.shots.desktop)}<figcaption>Before (${COMMIT}) · 1440</figcaption></figure>` : ''}<figure>${img(n.shots.desktop)}<figcaption>Now · 1440</figcaption></figure><figure class="ph">${img(n.shots.phone)}<figcaption>Now · 390</figcaption></figure></div>`;
}).join('');
const sheet = `<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:28px;background:#ebe8e1;font:13px/1.4 system-ui,sans-serif;color:#1d1d1a}h1{font:400 26px Georgia,serif;margin:0 0 4px}p.s{margin:0 0 22px;color:#555;max-width:150ch}.row{display:grid;grid-template-columns:220px ${B ? '1fr ' : ''}1fr 230px;gap:14px;margin-bottom:22px;align-items:start}.h h2{font-size:15px;margin:0}.h p{margin:2px 0;color:#555}.m{font-size:12px}figure{margin:0;background:#fff;padding:6px;max-height:1500px;overflow:hidden}figure img{width:100%;display:block}figcaption{font-size:11px;color:#666;padding-top:4px}</style><h1>SocriaUX — visual originality, before and now</h1><p class="s">Six identities. Both engines were given the same brief and the same conventional “model answer” (a centred hero, feature cards, a row of figures, a quote, a gallery, a story, a call to action); no model was called. Now: the direction’s shape system and compositional strategy, held in code. Pictures are SocriaUX’s own drawings; fonts not fetched.</p>${rows}`;
writeFileSync(S + 'orig-contact-sheet.html', sheet);
await load(sheet, 2000, 900);
await page.screenshot({ path: S + 'orig-contact-sheet.png', fullPage: true });
await browser.close();

for (const id of ids) {
  delete report.projects[id].new.spec;
  if (report.projects[id].base) delete report.projects[id].base.spec;
}
report.checks = { pass, fail, list: checks };
writeFileSync(S + 'originality-bench.json', J(report, null, 2));
const md = [
  '# SocriaUX — visual originality and compositional diversity',
  '',
  `Run ${report.at}. Baseline: commit ${COMMIT}. Model calls: 0. Spend: US$0. Checks: ${pass} passed, ${fail} failed.`,
  '',
  `Mean pairwise structural similarity across the six: ${report.across.structureOld ?? '—'} → ${report.across.structureNew} (1 = the same page). Spatial logics: ${report.across.axes.join(', ')}. Shape vocabularies: ${report.across.shapeVocabularies.join(' | ')}.`,
  '',
  '| Project | Direction | Strategy | Shapes | Pictures integrated | Unjustified patterns (before → now) | Prompt (chars) |',
  '|---|---|---|---|---|---|---|',
  ...PROJECTS.map((P) => { const r = report.projects[P.id]; const n = r.new; return `| ${P.label} | ${n.name} | ${n.strategy?.axis}, ${n.strategy?.type} type, ${n.strategy?.images} pictures, ${n.strategy?.nav} nav | ${n.shapeKinds.join(', ') || '—'} | ${n.dom.integrated}/${n.dom.images} | ${r.base ? `${r.base.patterns.join(', ') || 'none'} → ` : ''}${n.patterns.join(', ') || 'none'} | ${r.base ? `${r.base.prompt} → ` : ''}${n.prompt} |`; }),
  '',
  ...PROJECTS.flatMap((P) => { const n = report.projects[P.id].new; return [`## ${P.label} — ${P.name}`, '', `Shapes: ${n.form}`, ...n.formSaid.map((x) => `- ${x}`), '', 'Strategy:', ...(n.strategy?.said ?? []).map((x) => `- ${x}`), '', `Sequence: ${n.sequence.join(' → ')}`, '']; }),
  `Simple brief: ${J(report.simple)}`,
].join('\n');
writeFileSync(S + 'originality-bench.md', md);
console.log(`\n${pass} passed, ${fail} failed · ${S}originality-bench.md`);
process.exit(fail ? 1 : 0);
