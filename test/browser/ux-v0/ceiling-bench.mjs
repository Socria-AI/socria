// test/browser/ux-v0/ceiling-bench.mjs — the creative ceiling, measured against the engine as it was one commit before.
//
// Seven ambitious briefs, each written the way a creative director writes (qualities, influences named together,
// tensions, restrictions), go through TWO engines: the one in this checkout, and the one at UXV0_BASE_COMMIT
// (default 4ecef26, the commit before this work), bundled from `git archive` beside it. No model is called and
// nothing is spent. Both engines are given the SAME brief and the SAME deliberately conventional "model answer" (a
// centred hero, a grid of feature cards, a gallery grid, a call-to-action band): what a model writes when it falls
// back on habit. What differs is everything SocriaUX does in code around the model — the direction it proposes
// from the words, what it tells the generator, and what it holds in the design whatever the model wrote.
//
//   experimental architecture · luxury fashion · creative agency · editorial experience ·
//   motion-intensive portfolio · interactive product experience · immersive 3D experience
//
// For each brief and each engine:
//   1  the creative reading (this engine only: the baseline has none) and the three directions it proposes
//   2  the design each engine makes of the conventional answer, repaired as its own canvas would (two rounds at most)
//   3  ONE instrument for both: how much of what the designer's words asked for can be found in the design
//      (readingFidelity below, the same checks on both), its structure (a composed opening, pieces overlapping,
//      display type, whole-screen frames), this checkout's evaluation and originality audit, overflow at 1440, 834
//      and 390 px, whether every interactive part works when tried, weight and frames while scrolling
//   4  refinement precision (this engine): five targeted changes, each checked to change only what it names
//   5  economics: the size of the generator's prompt in each engine (what the reading and the richer pieces add)
//
// The numbers are SocriaUX's own measures of pages drawn in Chromium, not a judgement of beauty and not a
// comparison with any other product. Pictures are SocriaUX's made drawings; fonts are not fetched (fallback faces).
// Writes ceiling-bench.json, ceiling-bench.md, ceil-*.png and ceil-contact-sheet.png to UXV0_OUT.
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, S, ROOT, underTest } from './env.mjs';

const V = await underTest();
const J = JSON.stringify;
const COMMIT = process.env.UXV0_BASE_COMMIT || '4ecef26';

/** The engine as it was at COMMIT, bundled the way the test helper bundles this one. */
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
const B = await baseline();

let pass = 0;
let fail = 0;
const checks = [];
const ok = (n, c, x = '') => {
  checks.push({ n, ok: !!c, x: c ? '' : String(x).slice(0, 500) });
  c ? (pass++, console.log('  ok  ', n)) : (fail++, console.log('  FAIL', n, String(x).slice(0, 500)));
};

const brief = (o) => ({ pageType: 'website', platform: 'web', palette: [], typography: { display: '', body: '' }, decisions: { colour: 'delegated', typography: 'delegated' }, ...o });
const PROJECTS = [
  { id: 'architecture', name: 'Atelier Brut', label: 'Experimental architecture', action: 'See the work', title: 'Buildings that carry weight without shouting', sub: 'Cultural buildings, cast on site.', tags: ['Housing', 'Cultural', 'Housing', 'Cultural'],
    brief: brief({ objective: 'A website for an experimental architecture studio that builds cultural buildings.', audience: 'Municipalities, cultural institutions and juries', personality: ['rigorous', 'material'], visualDirection: 'Monumental and restrained. Combine architectural minimalism with experimental editorial typography, but avoid the coldness usually associated with minimalist websites. No cards.', layoutDirection: 'Projects first, each with its place, year and area.', userGoals: ['Browse the projects', 'Write to the studio'], functionalRequirements: ['Browse the projects'] }) },
  { id: 'fashion', name: 'Maison Arlet', label: 'Luxury fashion', action: 'Ask for a fitting', title: 'Autumn, cut by hand', sub: 'Tailored coats from the Paris atelier.', tags: ['Coats', 'Knitwear', 'Coats', 'Knitwear'],
    brief: brief({ objective: 'Present the autumn collection of a couture house and invite clients to private fittings.', audience: 'Clients and collectors of the house', personality: ['assured', 'exacting'], visualDirection: 'Contemporary luxury, cinematic: each look given the whole screen with the words laid over it; slow, unhurried movement. Nothing corporate.', layoutDirection: 'The collection as a sequence of scenes.', userGoals: ['See the collection', 'Ask for a fitting'], functionalRequirements: ['See the collection'] }) },
  { id: 'agency', name: 'Northbound', label: 'Creative agency', action: 'Start a project', title: 'We make brands impossible to ignore', sub: 'Brand, product and space, made side by side.', tags: ['Brand', 'Digital', 'Brand', 'Digital'],
    brief: brief({ objective: 'Win commissions for a creative agency by showing how it thinks and what it has made.', audience: 'Founders and marketing directors', personality: ['confident', 'witty'], visualDirection: 'Expressive and kinetic, maximalist with a plan: layered collage and oversized type. No rounded corners, and not childish.', layoutDirection: 'How we work as a sequence, then the work.', userGoals: ['Understand how the agency works', 'See selected work'], functionalRequirements: ['See selected work'] }) },
  { id: 'editorial', name: 'The Long Field', label: 'Editorial experience', action: 'Read the issue', title: 'What the river remembers', sub: 'A long read on water, land and memory.', tags: ['Essay', 'Pictures', 'Essay', 'Pictures'],
    brief: brief({ objective: 'An editorial experience: one long essay with photographs, published as an issue of a magazine.', audience: 'Readers of long-form writing', personality: ['thoughtful', 'literary'], visualDirection: 'Editorial and museum-like: generous negative space, pictures shown as plates, calm. No icons.', layoutDirection: 'The essay leads; pictures between its parts.', userGoals: ['Read the essay', 'See the photographs'], functionalRequirements: ['Read the essay'] }),
    extra: [{ id: 'essay', kind: 'text', variant: 'narrow', content: { title: 'I. The upper reach', paragraphs: ['The river begins as a seep under a field of sedge, and for its first mile nobody would call it a river at all. It is a line of darker grass, a softness underfoot, a place the cattle avoid in March.', 'By the time it reaches the first village it has a name, and the name is older than the village.'] } }] },
  { id: 'portfolio', name: 'Mira Okafor', label: 'Motion-intensive portfolio', action: 'See the reel', title: 'Systems that surprise their maker', sub: 'Generative work, installations and films.', tags: ['Generative', 'Film', 'Generative', 'Film'],
    brief: brief({ objective: 'A portfolio for a digital artist that is itself a piece of motion.', audience: 'Curators and creative directors', personality: ['daring', 'playful'], visualDirection: 'Kinetic and experimental, off-grid: type that moves, pieces overlapping. Abstract. Not boring.', layoutDirection: 'The work first; the process as a story told on the scroll.', userGoals: ['See the work', 'Understand the process'], functionalRequirements: ['See the work'] }) },
  { id: 'product', name: 'Aurel One', label: 'Interactive product experience', action: 'Reserve yours', title: 'One block of sound', sub: 'A speaker turned from a single block of aluminium.', tags: ['Detail', 'In use', 'Detail', 'In use'],
    brief: brief({ objective: 'A product page for a machined aluminium speaker where people configure the finish and reserve one.', audience: 'Design-minded listeners', personality: ['precise', 'tactile'], visualDirection: 'Industrial and precise, like a parts catalogue: numbered components, data plates. No gradients, no rounded corners.', layoutDirection: 'The object, its finishes, then the facts.', userGoals: ['Choose a finish', 'Reserve one'], functionalRequirements: ['Choose a finish'] }),
    extra: [{ id: 'configurator', kind: 'configurator', variant: 'split', content: { title: 'Make it yours', groups: [{ name: 'Finish', options: [{ label: 'Graphite', price: '', swatch: '#2b2b2b' }, { label: 'Sand', price: '+£60', swatch: '#c8b89a' }] }, { name: 'Stand', options: [{ label: 'None', price: '' }, { label: 'Walnut', price: '+£180' }] }], base: '£1,290', action: 'Reserve yours', note: 'Nothing is charged today.' } }] },
  { id: 'immersive', name: 'Halo Orbital', label: 'Immersive 3D experience', action: 'Turn it', title: 'A satellite you can hold', sub: 'Turn the Halo relay in three dimensions.', tags: ['Bus', 'Array', 'Bus', 'Array'],
    brief: brief({ objective: 'An immersive 3D experience for a satellite maker: turn the object in three dimensions and read its specifications.', audience: 'Mission planners and investors', personality: ['precise', 'bold'], visualDirection: 'Futuristic and immersive: the object in 3D turned by hand, read-outs in mono, dark.', layoutDirection: 'The object first, full-screen; then the figures.', userGoals: ['Turn the satellite in 3D', 'Read the specifications'], functionalRequirements: ['Turn the satellite in 3D'] }),
    extra: [{ id: 'scene', kind: 'scene', variant: 'stage', content: { title: 'The Halo relay', text: 'Drag to turn it.', model: 'ring', material: 'metal', caption: 'Drag it, or use the arrow keys, to turn it.' } }] },
];

/** What a model writes by habit: the same answer for both engines. */
const conventional = (P, ids) => ({
  title: P.name,
  sections: [
    { id: 'nav', kind: 'nav', variant: 'inline', content: { brand: P.name, links: ['Work', 'About', 'Journal', 'Contact'], cta: P.action } },
    { id: 'hero', kind: 'hero', variant: 'centered', content: { eyebrow: P.label, title: P.title, subtitle: P.sub, primary: P.action, secondary: 'Learn more' }, images: [ids[0]] },
    { id: 'features', kind: 'features', variant: 'grid', content: { title: 'How it comes together', items: [{ title: 'Listen', text: 'Before anything is drawn.', icon: 'star' }, { title: 'Frame', text: 'One idea every decision answers to.', icon: 'compass' }, { title: 'Make', text: 'By hand, in the open.', icon: 'layers' }, { title: 'Hold', text: 'We stay until it stands.', icon: 'check' }] } },
    { id: 'gallery', kind: 'gallery', variant: 'grid', content: { title: 'Selected work', tags: P.tags }, images: ids.slice(1, 5) },
    ...(P.extra ?? []),
    { id: 'cta', kind: 'cta', variant: 'band', content: { title: 'Ready to begin?', text: 'Write to us.', primary: P.action } },
    { id: 'footer', kind: 'footer', variant: 'simple', content: { brand: P.name, columns: [] } },
  ],
});

/** How much of what the designer's words asked for is in the design: the same checks on either engine's spec. */
function readingFidelity(spec, reading) {
  const ex = reading.execution;
  const look = spec.look;
  // the opening: the page's first hero or composed part (a page that leads with its work has it second)
  const opening = spec.sections.find((s) => s.kind === 'hero' || s.kind === 'compose');
  const composed = spec.sections.filter((s) => s.kind === 'compose');
  const walk = (p, f) => (f(p) ? true : Array.isArray(p?.children) && p.children.some((c) => walk(c, f)));
  const list = [];
  const add = (what, pass) => list.push({ what, ok: !!pass });
  if (ex.arrange) add(`the opening composed (${ex.arrange})`, opening?.kind === 'compose' && (opening.content.root.t === 'layer' || opening.content.root.t === 'field'));
  if (ex.tall) add('a part given a whole screen', composed.some((s) => s.content.tall === 'screen') || (ex.arrange !== 'layered' && composed.length > 0));
  if (ex.display) add('a title at display size', composed.some((s) => walk(s.content.root, (p) => p.t === 'text' && !!p.size)));
  if (ex.forbid.containers.length) add(`no ${ex.forbid.containers.join(' or ')} surfaces`, !ex.forbid.containers.includes(look.containers));
  if (ex.forbid.radius.length) add('square corners', !ex.forbid.radius.includes(spec.tokens.radius));
  if (ex.forbid.heroes.length) add('no centred opening', !spec.sections.some((s) => s.kind === 'hero' && s.variant === 'centered'));
  if (ex.motifs.drop.length) add(`none of: ${ex.motifs.drop.join(', ')}`, !ex.motifs.drop.some((m) => look.motifs.includes(m)));
  if (ex.warmth) add(ex.warmth > 0 ? 'a warm ground' : 'a cool or dark ground', (() => { const [h, s, l] = V.hslOf(spec.tokens.colors.background); return ex.warmth > 0 ? s > 0.05 && h >= 15 && h <= 70 : (s > 0.05 && h >= 150 && h <= 290) || l < 0.2; })());
  if (ex.feel) add(`${ex.feel} motion`, look.motion.feel === ex.feel);
  if (ex.motion.duration) add('slow, long movement', look.motion.duration >= ex.motion.duration - 1);
  if (ex.tokens.scale) add(`${ex.tokens.scale} spacing`, spec.tokens.scale === ex.tokens.scale);
  if (ex.look.ratio) add('a steep type scale', look.ratio >= ex.look.ratio - 0.011);
  if (ex.look.rules) add(`${ex.look.rules} rules`, look.rules === ex.look.rules);
  if (ex.look.label) add(`${ex.look.label} labels`, look.label === ex.look.label);
  const kept = list.filter((x) => x.ok).length;
  return { score: list.length ? Math.round((kept / list.length) * 100) : 100, kept, of: list.length, missed: list.filter((x) => !x.ok).map((x) => x.what) };
}

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
  const t0 = Date.now();
  await page.setContent(html, { waitUntil: 'load' });
  return Date.now() - t0;
};
const auditsOf = async (E, spec, refs, source) => {
  const rest = E.renderDesign(spec, refs, { runtime: true }).html;
  const out = {};
  for (const [vp, w, h] of WIDTHS) {
    out[`${vp}Ms`] = await load(rest, w, h);
    await page.waitForTimeout(250);
    await page.addScriptTag({ content: source });
    out[vp] = await page.evaluate(() => window.__uxv0Audit());
  }
  return out;
};

/** One engine's design of the conventional answer, repaired as its own canvas would. */
async function make(E, P) {
  const b = E.normalizeBrief(P.brief, new Set());
  const dirs = E.proposeDirections({ brief: b, salt: `ceiling-${P.id}` });
  const dir = dirs[0];
  const pal = E.paletteOf(dir.tokens, dir.look.accent2 ?? '');
  const kinds = { architecture: 'contour', fashion: 'grain', agency: 'field', editorial: 'grain', portfolio: 'orbit', product: 'render', immersive: 'lattice' };
  const refs = [0, 1, 2, 3, 4].map((i) => E.normalizeRef({ ...E.procRef(E.normalizeProc({ kind: i === 0 ? kinds[P.id] : ['field', 'contour', 'lattice', 'orbit'][i - 1], seed: 5 + i * 9, ratio: i === 0 ? '16:9' : '1:1', palette: pal }), 'a stand-in until the project’s own picture is in'), asContent: true }));
  const board = E.normalizeMoodboard({ refs });
  const t0 = performance.now();
  let spec = E.parseGenerate(conventional(P, refs.map((r) => r.id)), b, board, 1, 'bench', dir);
  const codeMs = Math.round((performance.now() - t0) * 100) / 100;
  const repaired = [];
  for (let round = 0; round < (E.MAX_REVISION_ROUNDS ?? 2); round++) {
    const a = await auditsOf(E, spec, refs, E.AUDIT_SOURCE);
    const ev = E.evaluateDesign(spec, { desktop: E.normalizeAudit(a.desktop), tablet: E.normalizeAudit(a.tablet), phone: E.normalizeAudit(a.phone) }, dir.locks ?? [], { direction: dir, brief: b, board });
    const fixes = E.fixesFor(ev);
    if (!fixes.length) break;
    for (const f of fixes) {
      const r = E.applyPatch(spec, f.patch, board);
      if (r.ok) (spec = r.spec), repaired.push(f.patch.summary);
    }
  }
  const prompt = E.generateSystem(b, dir).length + E.generateUser({ brief: b, moodboard: board, direction: '', dna: null }).length;
  return { b, dirs, dir, refs, board, spec, repaired, codeMs, prompt };
}

/** The one instrument, applied to either engine's design (drawn by that engine's own renderer and runtimes). */
async function measure(E, made, reading, P, tag) {
  const { spec, refs, b, dir, board } = made;
  const a = await auditsOf(E, spec, refs, V.AUDIT_SOURCE);
  const au = { desktop: V.normalizeAudit(a.desktop), tablet: V.normalizeAudit(a.tablet), phone: V.normalizeAudit(a.phone) };
  // this checkout's evaluation, with the brief (so what the words refused counts) but no direction (each engine's own differs)
  const ev = V.evaluateDesign(spec, au, [], { brief: V.normalizeBrief(P.brief, new Set()), board: V.normalizeMoodboard({ refs }) });
  const orig = V.auditOriginality({ spec, brief: V.normalizeBrief(P.brief, new Set()), audit: au.desktop });
  const play = E.renderDesign(spec, refs, { motion: 'play', runtime: true }).html;
  const shots = {};
  for (const [vp, w, h] of tag === 'new' ? WIDTHS : WIDTHS.slice(0, 1)) {
    await load(play, w, h);
    await page.waitForTimeout(1300);
    shots[vp] = `ceil-${P.id}-${tag}-${vp}.png`;
    await page.screenshot({ path: S + shots[vp] });
  }
  await load(play, 1440, 900);
  await page.waitForTimeout(600);
  const works = await page.evaluate(() => ({ interactive: window.__uxBehaviors?.selfTestInteractive ? window.__uxBehaviors.selfTestInteractive() : [], menus: window.__uxBehaviors?.menus ?? 0, story: window.__uxMotion ? window.__uxMotion.selfTest().story : [], scenes: window.__uxScene ? window.__uxScene.selfTest() : [] }));
  const fps = await page.evaluate(async () => {
    let frames = 0;
    let run = true;
    const tick = () => (frames++, run && requestAnimationFrame(tick));
    requestAnimationFrame(tick);
    const H = Math.max(0, document.documentElement.scrollHeight - innerHeight);
    const t0 = performance.now();
    await new Promise((res) => { const step = () => { const t = performance.now() - t0; window.scrollTo(0, Math.min(H, (t / 1200) * H)); t < 1200 ? requestAnimationFrame(step) : res(); }; requestAnimationFrame(step); });
    run = false;
    return Math.round(frames / 1.2);
  });
  const opening = spec.sections.find((s) => s.kind === 'hero' || s.kind === 'compose');
  const composed = spec.sections.filter((s) => s.kind === 'compose');
  return {
    language: dir.language, name: dir.name, fonts: `${spec.tokens.fonts.display} / ${spec.tokens.fonts.body}`, motion: spec.look.motion.feel,
    opening: opening.kind === 'compose' ? `composed (${opening.content.root.t}${V.overlapsIn?.(opening.content.root) ? ', overlapping' : ''})` : `${opening.kind}/${opening.variant}`,
    composed: composed.length, overlap: composed.some((s) => V.overlapsIn(s.content.root)),
    sections: spec.sections.map((s) => `${s.kind}/${s.variant}`),
    reading: readingFidelity(spec, reading),
    quality: ev.quality, distinctiveness: ev.distinctiveness, originality: orig.overall,
    high: ev.findings.filter((f) => f.severity === 'high').map((f) => `${f.viewport}: ${f.message}`),
    overflow: ['desktop', 'tablet', 'phone'].filter((vp) => au[vp].overflowX > 2 || au[vp].overflow.length),
    collisions: (au.desktop.collisions ?? []).length,
    works, fps, kb: Math.round(play.length / 100) / 10, loadMs: a.desktopMs, promptChars: made.prompt, repaired: made.repaired, codeMs: made.codeMs, shots,
  };
}

const report = { at: new Date().toISOString(), baseline_commit: COMMIT, model_calls: 0, cost_usd: 0, projects: {} };
for (const P of PROJECTS) {
  console.log(`\n=== ${P.label}: ${P.name} ===`);
  errors.length = 0;
  const nb = V.normalizeBrief(P.brief, new Set());
  const reading = V.readCreative(V.creativeWords(nb), '');
  const mNew = await make(V, P);
  const mOld = await make(B, P);
  const n = await measure(V, mNew, reading, P, 'new');
  const o = await measure(B, mOld, reading, P, 'base');
  const cmpNew = V.compareDirections(mNew.dirs);
  const cmpOld = B.compareDirections(mOld.dirs);
  const r = { label: P.label, name: P.name, reading: { qualities: reading.qualities.map((q) => q.id), refusals: reading.refusals.map((q) => q.id), tensions: reading.tensions.map((t) => t.resolved), influences: reading.influences.map((i) => `${i.language}${i.aspect ? `:${i.aspect}` : ''}`), restrictions: reading.restrictions.map((x) => x.said), said: mNew.dir.reading?.said ?? [] }, directions: { new: mNew.dirs.map((d) => `${d.name} (${d.language}${d.arrange ? `, ${d.arrange}` : ''})`), base: mOld.dirs.map((d) => `${d.name} (${d.language})`), distinctNew: `${cmpNew.distinctRows}/${cmpNew.rows.length}`, distinctBase: `${cmpOld.distinctRows}/${cmpOld.rows.length}`, nearNew: cmpNew.nearIdentical.length }, new: n, base: o, precision: [] };
  report.projects[P.id] = r;

  ok(`${P.id}: the words are read (${r.reading.qualities.join(', ')}${r.reading.restrictions.length ? `; ${r.reading.restrictions.join(', ')}` : ''})`, reading.qualities.length >= 2, J(r.reading));
  ok(`${P.id}: more of what the words asked for is in the design than before (${o.reading.score}% → ${n.reading.score}%)`, n.reading.score > o.reading.score && n.reading.score >= 80, J({ base: o.reading, new: n.reading }));
  if (reading.execution.arrange) ok(`${P.id}: the conventional hero the model wrote was recomposed as the direction asks (${o.opening} → ${n.opening})`, n.opening.startsWith('composed') && !o.opening.startsWith('composed'), J([o.opening, n.opening]));
  ok(`${P.id}: three directions, no pair nearly the same (${r.directions.distinctNew} aspects differ in all three)`, mNew.dirs.length === 3 && cmpNew.nearIdentical.length === 0 && new Set(mNew.dirs.map((d) => d.language)).size === 3, J(r.directions));
  ok(`${P.id}: nothing past the edge at 1440, 834 or 390 px; no words colliding`, !n.overflow.length && !n.collisions, J({ overflow: n.overflow, collisions: n.collisions }));
  ok(`${P.id}: no must-fix finding after the bounded repair`, !n.high.length, J(n.high));
  ok(`${P.id}: every interactive part works when tried (${n.works.interactive.map((i) => i.kind).join(', ')})`, n.works.interactive.length > 0 && n.works.interactive.every((i) => !i.problems.length), J(n.works.interactive));
  ok(`${P.id}: the navigation's links are reachable on a phone through a working menu (before: hidden with no menu)`, n.works.menus === 1 && o.works.menus === 0);
  if (P.id === 'immersive') ok('immersive: the 3D object was really drawn (pixels read back)', n.works.scenes.length === 1 && n.works.scenes[0].drawn, J(n.works.scenes));
  ok(`${P.id}: no script error; under 600 KB; ${n.fps} frames a second while scrolling`, !errors.length && n.kb < 600 && n.fps >= 15, J({ errors, kb: n.kb, fps: n.fps }));

  // 4 · refinement precision: five targeted changes, each changing only what it names
  const spec = mNew.spec;
  const board = mNew.board;
  const same = (a, b2, skip) => a.sections.every((s, i) => skip === s.id || J(s) === J(b2.sections[i]));
  const sel = (id) => ({ element: { ux: { section: id, path: 'title' } } });
  const p1 = spec.look.motion.feel !== 'still' ? V.readQuickEdit('slow down the transitions', spec, null) : null;
  if (p1) { const x = V.applyPatch(spec, p1.patches[0], board); r.precision.push(['slow down the transitions', x.ok && same(spec, x.spec) && J(x.spec.tokens) === J(spec.tokens) && x.spec.look.motion.duration > spec.look.motion.duration && J({ ...x.spec.look, motion: 0 }) === J({ ...spec.look, motion: 0 })]); }
  const p2 = V.readQuickEdit('hide this on phones', spec, sel('gallery'));
  { const x = p2 ? V.applyPatch(spec, p2.patches[0], board) : { ok: false }; r.precision.push(['hide the gallery on phones (desktop unchanged)', x.ok && same(spec, x.spec, 'gallery') && J(x.spec.look) === J(spec.look) && x.spec.sections.find((s) => s.id === 'gallery').responsive.mobile.hide === true && V.renderDesign(x.spec, mNew.refs).html.includes('@media (max-width:759px){.sx.rs-m-hide{display:none!important}')]); }
  { const face = spec.tokens.fonts.display === 'Fraunces' ? 'Newsreader' : 'Fraunces'; const x = V.applyPatch(spec, { op: 'tokens', tokens: { fonts: { display: face } }, summary: 'x' }, board); r.precision.push(['change the typography, keep the composition', x.ok && same(spec, x.spec) && J(V.structureOf(x.spec)) === J(V.structureOf(spec)) && x.spec.tokens.fonts.display === face && J(x.spec.tokens.colors) === J(spec.tokens.colors)]); }
  { const withFocus = mNew.refs.map((q, i) => (i === 0 ? V.normalizeRef({ ...q, focus: { x: 80, y: 20 } }) : q)); const h1 = V.renderDesign(spec, withFocus).html; const h0 = V.renderDesign(spec, mNew.refs).html; r.precision.push(['move the picture’s subject (the design itself untouched)', h1.includes('object-position:80% 20%') && h1.replace(/ style="object-position:80% 20%"/g, '') === h0]); }
  { const lockedSpec = V.setLocked(spec, 'gallery', true); const again = V.parseGenerate({ ...conventional(P, mNew.refs.map((q) => q.id)), sections: conventional(P, mNew.refs.map((q) => q.id)).sections.map((s) => (s.id === 'gallery' ? { ...s, variant: 'mosaic', content: { title: 'Changed by the model' } } : s)) }, mNew.b, board, 2, 'again', mNew.dir); const held = V.holdLocked(again, lockedSpec).spec; r.precision.push(['a locked part survives a new generation', J(held.sections.find((s) => s.id === 'gallery')) === J(lockedSpec.sections.find((s) => s.id === 'gallery'))]); }
  ok(`${P.id}: targeted changes change only what they name (${r.precision.filter((x) => x[1]).length}/${r.precision.length})`, r.precision.every((x) => x[1]), J(r.precision.filter((x) => !x[1]).map((x) => x[0])));
  console.log(`  reading kept ${o.reading.score}% → ${n.reading.score}% · opening ${o.opening} → ${n.opening} · quality ${o.quality} → ${n.quality} · originality ${o.originality} → ${n.originality} · prompt ${o.promptChars} → ${n.promptChars} chars`);
}

// ── a simple brief stays simple: nothing is read into it, and nothing is recomposed ──
{
  const mk = (visualDirection) => V.normalizeBrief({ pageType: 'website', platform: 'web', objective: 'A website for a dentist in Leeds.', audience: 'Local families', personality: [], visualDirection, palette: [], typography: { display: '', body: '' }, userGoals: ['Find the opening hours', 'Call the practice'], functionalRequirements: [] }, new Set());
  const answer = conventional({ name: 'Leeds Dental', label: 'Dentist', title: 'Dentistry in Leeds', sub: 'Open six days.', action: 'Call us', tags: [] }, []);
  const plain = mk('Simple and clear.');
  const d = V.proposeDirections({ brief: plain, salt: 'ceiling-plain' })[0];
  const spec = V.parseGenerate(answer, plain, V.normalizeMoodboard({ refs: [] }), 1, 'bench', d);
  ok('a simple brief stays simple: nothing is read into it, no arrangement is imposed, the hero the model wrote is kept', V.readingIsEmpty(V.readCreative(V.creativeWords(plain), '')) && !d.arrange && !d.reading && spec.sections.some((s) => s.kind === 'hero') && !spec.sections.some((s) => s.kind === 'compose'), J([d.arrange, d.reading, spec.sections.map((s) => s.kind)]));
  const friendly = mk('Clean and friendly.');
  const df = V.proposeDirections({ brief: friendly, salt: 'ceiling-plain' })[0];
  const sf = V.parseGenerate(answer, friendly, V.normalizeMoodboard({ refs: [] }), 1, 'bench', df);
  ok('  “clean and friendly” is read as warmth only: still a simple page, its hero kept', J(V.readCreative(V.creativeWords(friendly), '').qualities.map((q) => q.id)) === J(['warm']) && !df.arrange && !df.frame && sf.sections.some((s) => s.kind === 'hero') && !sf.sections.some((s) => s.kind === 'compose'), J([df.reading, sf.sections.map((s) => s.kind)]));
  report.simple = { plain: { opening: spec.sections.find((s) => s.kind !== 'nav').kind, language: d.language }, friendly: { read: df.reading?.said ?? [], opening: sf.sections.find((s) => s.kind !== 'nav').kind } };
}

// ── the contact sheet ──
const img = (f) => (f && existsSync(S + f) ? `<img src="data:image/png;base64,${readFileSync(S + f).toString('base64')}">` : '<div class="none">—</div>');
const rows = PROJECTS.map((P) => {
  const r = report.projects[P.id];
  return `<div class="row"><div class="h"><h2>${P.label}</h2><p>${P.name}</p><p class="m">words kept ${r.base.reading.score}% → <b>${r.new.reading.score}%</b><br>${r.base.name} → <b>${r.new.name}</b><br>quality ${r.base.quality} → <b>${r.new.quality}</b><br>originality ${r.base.originality} → <b>${r.new.originality}</b></p></div><div class="cell">${img(r.base.shots.desktop)}<div class="cap">Before (${COMMIT}) · 1440</div></div><div class="cell">${img(r.new.shots.desktop)}<div class="cap">Now · 1440</div></div><div class="cell">${img(r.new.shots.tablet)}<div class="cap">Now · 834</div></div><div class="cell ph">${img(r.new.shots.phone)}<div class="cap">Now · 390</div></div></div>`;
}).join('');
const sheet = `<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:28px;background:#ebe8e1;font:13px/1.4 system-ui,sans-serif;color:#1d1d1a}h1{font:400 26px Georgia,serif;margin:0 0 4px}p.s{margin:0 0 22px;color:#555;max-width:150ch}.row{display:grid;grid-template-columns:190px 1.6fr 1.6fr .95fr .5fr;gap:12px;margin-bottom:20px;align-items:start}.h h2{font-size:14px;margin:4px 0 2px}.h p{margin:0 0 8px;color:#555}.h .m{color:#222}.cell{background:#fff;border-radius:6px;overflow:hidden;box-shadow:0 1px 0 rgba(0,0,0,.08)}.cell img{display:block;width:100%;height:330px;object-fit:cover;object-position:top}.cap{padding:6px 9px;font-size:11.5px;color:#444}.none{height:330px}</style><h1>SocriaUX — the creative ceiling, before and now</h1><p class="s">Seven ambitious briefs. Both engines were given the same brief and the same conventional “model answer” (a centred hero, feature cards, a gallery grid, a call-to-action band); no model was called. Before: the engine at ${COMMIT}. Now: this checkout, which reads the designer’s words into a direction and holds it in the design. Fonts not fetched (fallback faces); pictures are SocriaUX’s own made drawings.</p>${rows}`;
writeFileSync(S + 'ceil-contact-sheet.html', sheet);
await load(sheet, 2000, 900);
await page.screenshot({ path: S + 'ceil-contact-sheet.png', fullPage: true });
await browser.close();

report.checks = { pass, fail, list: checks };
writeFileSync(S + 'ceiling-bench.json', J(report, null, 2));
const avg = (f) => Math.round(PROJECTS.reduce((t, P) => t + f(report.projects[P.id]), 0) / PROJECTS.length);
const md = [
  '# SocriaUX — the creative ceiling, before and now',
  '',
  `Run ${report.at}. Baseline: commit ${COMMIT}. Model calls: 0. Spend: US$0. Checks: ${pass} passed, ${fail} failed.`,
  '',
  'Both engines were given the same brief and the same conventional “model answer”. “Words kept” is the share of what the designer’s words asked for that can be found in the design (the same checks on both).',
  '',
  '| Project | Words kept | Opening | Direction | Quality | Originality | Prompt (chars) |',
  '|---|---|---|---|---|---|---|',
  ...PROJECTS.map((P) => { const r = report.projects[P.id]; return `| ${P.label} | ${r.base.reading.score}% → ${r.new.reading.score}% | ${r.base.opening} → ${r.new.opening} | ${r.base.name} → ${r.new.name} | ${r.base.quality} → ${r.new.quality} | ${r.base.originality} → ${r.new.originality} | ${r.base.promptChars} → ${r.new.promptChars} |`; }),
  `| **Average** | ${avg((r) => r.base.reading.score)}% → ${avg((r) => r.new.reading.score)}% | | | ${avg((r) => r.base.quality)} → ${avg((r) => r.new.quality)} | ${avg((r) => r.base.originality)} → ${avg((r) => r.new.originality)} | ${avg((r) => r.base.promptChars)} → ${avg((r) => r.new.promptChars)} |`,
  '',
  ...PROJECTS.flatMap((P) => { const r = report.projects[P.id]; return [`## ${P.label} — ${P.name}`, '', `Read: ${r.reading.said.join(' · ') || '—'}`, `Directions now: ${r.directions.new.join(' · ')} (${r.directions.distinctNew} aspects differ in all three). Before: ${r.directions.base.join(' · ')} (${r.directions.distinctBase}).`, `Words still missing now: ${r.new.reading.missed.join('; ') || 'none'}. Before: ${r.base.reading.missed.join('; ') || 'none'}.`, `Sections now: ${r.new.sections.join(', ')}.`, `Repaired in code: ${r.new.repaired.join('; ') || 'nothing needed'}. Left as must-fix: ${r.new.high.join(' · ') || 'none'}.`, `Works: ${r.new.works.interactive.map((i) => `${i.kind}${i.problems.length ? ' ✗' : ' ✓'}`).join(', ')}; story ${r.new.works.story.map((s) => s.seen.join('→')).join(' ') || '—'}; ${r.new.kb} KB; ${r.new.fps} fps.`, `Precision: ${r.precision.map((x) => `${x[1] ? '✓' : '✗'} ${x[0]}`).join(' · ')}.`, '']; }),
].join('\n');
writeFileSync(S + 'ceiling-bench.md', md);
console.log(`\n${pass} passed, ${fail} failed · ${S}ceiling-bench.md`);
process.exit(fail ? 1 : 0);
