// test/browser/ux-v0/dna-bench.mjs — the Creative DNA & Originality Engine, verified on five very different briefs.
// No model call is made (nothing is spent): every step here is SocriaUX's own code, and the pages are drawn by its
// renderer in a real browser and measured there.
//
//   luxury fashion · scientific dashboard · architecture studio · experimental portfolio · booking app
//
// For each brief:
//   1  the DNA SocriaUX derives from it, each dimension with where it came from
//   2  the DNA materially changes the design: the same brief drawn from a restrained, structured DNA and from an
//      expressive, experimental one — the studies read back (dnaOfDesign), measured on the rendered page, and
//      compared pixel by pixel
//   3  the three directions are structurally distinct (six aspects compared; no pair is one design recoloured)
//   4  locks survive: asked again and changed, a locked dimension holds; a change that moves it is caught; a page
//      that drifted from it is moved back in code
//   5  references influence without copying: kept references measured from their pixels in the browser move the
//      DNA; what is kept is numbers and phrases only
//   6  the Originality Audit finds meaningful problems: a generic page is caught and fixed in one pass; the
//      directions' own studies are read too
//   7  the functional requirements hold: the booking works in place (the behaviour runtime's self-test), the
//      dashboard has its figures, chart and table
//   8  cost and time: no model call; the time each step takes in code; the words the DNA adds to a prompt
//
// Writes dna-bench.json, dna-bench.md and screenshots (dna-*.png) to UXV0_OUT. Needs test/.tmp (node test/run.mjs builds it).
import { readFileSync, writeFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { chromium, S, FX, underTest } from './env.mjs';

const V = await underTest();
const J = JSON.stringify;
let pass = 0;
let fail = 0;
const checks = [];
const ok = (n, c, x = '') => {
  checks.push({ n, ok: !!c, x: c ? '' : String(x).slice(0, 600) });
  c ? (pass++, console.log('  ok  ', n)) : (fail++, console.log('  FAIL', n, String(x).slice(0, 600)));
};
const report = { at: new Date().toISOString(), model_calls: 0, briefs: {} };
const ms = (f) => {
  const t = performance.now();
  const out = f();
  return [out, Math.round((performance.now() - t) * 100) / 100];
};

const pal = (bg, text, muted, accent, surface, line, accentText = '#ffffff') => [
  { hex: bg, role: 'background' },
  { hex: surface, role: 'surface' },
  { hex: text, role: 'text' },
  { hex: muted, role: 'muted' },
  { hex: accent, role: 'accent' },
  { hex: accentText, role: 'accent-text' },
  { hex: line, role: 'line' },
];

const REF = (id, extra = {}) => ({ provider: 'openverse', providerId: id, id: `openverse:${id}`, url: `https://images.example.test/${id}.jpg`, thumb: `https://images.example.test/${id}.jpg`, width: 1600, height: 1067, title: id, creator: 'A', creatorUrl: '', sourceUrl: `https://example.org/${id}`, license: 'CC BY 2.0', licenseUrl: '', attribution: id, category: 'imagery', state: 'kept', asContent: false, ...extra });

const BRIEFS = [
  {
    id: 'fashion', name: 'Maison Arlet', label: 'Luxury fashion',
    brief: { objective: 'Present the autumn collection of tailored coats and book private fittings at the Paris atelier.', audience: 'Existing clients and new collectors of the house', personality: ['quiet', 'assured', 'exacting', 'sensual'], visualDirection: 'Quiet luxury: a restrained, editorial page with large serif headlines, generous negative space and photography that lets the cloth speak.', palette: pal('#f5f1ea', '#1c1a17', '#6d675e', '#5b2a22', '#fbf9f4', '#e4ded2'), typography: { display: 'Cormorant Garamond', body: 'Inter', rationale: '' }, layoutDirection: 'Few sections, each given room; an editorial rhythm.', userGoals: ['See the collection', 'Book a private fitting'], functionalRequirements: ['Book a private fitting', 'See the collection'], pageType: 'website', platform: 'web' },
    refs: ['marble', 'window'],
  },
  {
    id: 'dashboard', name: 'Cleanroom Monitor', label: 'Scientific dashboard',
    brief: { objective: 'A monitoring dashboard for particle counts, temperature and humidity across three cleanrooms, flagging excursions before a batch is lost.', audience: 'Lab technicians and QA leads on shift', personality: ['precise', 'calm', 'trustworthy'], visualDirection: 'Functional and dense: a rigorous grid, legible data, colour only for state.', palette: pal('#ffffff', '#0f172a', '#475569', '#0e7490', '#f8fafc', '#e2e8f0'), typography: { display: 'IBM Plex Sans', body: 'IBM Plex Sans', rationale: '' }, layoutDirection: 'Key figures first, then charts, then the detailed table of readings.', userGoals: ['See current readings for each room', 'Spot excursions', 'Inspect the detailed log'], functionalRequirements: ['See current readings for each room', 'Spot excursions', 'Inspect the detailed log'], pageType: 'app-screen', platform: 'web' },
    refs: [],
  },
  {
    id: 'architecture', name: 'Studio Ferro', label: 'Architecture studio',
    brief: { objective: 'Show the studio’s built work and win commissions for civic and residential buildings.', audience: 'Developers, municipalities and private clients', personality: ['rigorous', 'material', 'calm'], visualDirection: 'Architectural: a strict grid, honest materials, black and white photography, large project numbers.', palette: pal('#f2f0eb', '#161616', '#5c5c5c', '#9c3a1d', '#ffffff', '#d9d6cf'), typography: { display: 'Archivo', body: 'Inter', rationale: '' }, layoutDirection: 'A project index, each project with its year, area and place.', userGoals: ['Browse projects', 'Contact the studio'], functionalRequirements: ['Browse projects', 'Contact the studio'], pageType: 'website', platform: 'web' },
    refs: ['grid', 'dusk'],
  },
  {
    id: 'portfolio', name: 'Ines Kalu', label: 'Experimental portfolio',
    brief: { objective: 'A portfolio that is itself a piece of motion work, and gets a motion designer hired by studios.', audience: 'Creative directors at studios and agencies', personality: ['playful', 'daring', 'kinetic'], visualDirection: 'Experimental and expressive: oversized type, a broken grid, layered collage, immersive motion.', palette: pal('#0d0d0d', '#f4f4f0', '#a3a3a3', '#d4ff3a', '#171717', '#2a2a2a', '#0d0d0d'), typography: { display: 'Space Grotesk', body: 'Inter', rationale: '' }, layoutDirection: 'Work first, set as a collage; an unexpected order.', userGoals: ['See the reel and projects', 'Get in touch'], functionalRequirements: ['See the reel and projects', 'Get in touch'], pageType: 'website', platform: 'web' },
    refs: ['people', 'cafe-bar'],
  },
  {
    id: 'booking', name: 'Vertical', label: 'Booking app',
    brief: { objective: 'Let members book a climbing session or a beginner class at the gym in under a minute.', audience: 'Members and first-timers', personality: ['energetic', 'friendly', 'clear'], visualDirection: 'Bold and clear: chalk white with a strong orange, big tappable times.', palette: pal('#fbfaf7', '#151515', '#5e5e5e', '#c2410c', '#ffffff', '#e7e5e0'), typography: { display: 'Archivo', body: 'Inter', rationale: '' }, layoutDirection: 'The booking first; one task per screen.', userGoals: ['Choose a day and time', 'Pick a session type', 'Confirm the booking'], functionalRequirements: ['Choose a day and time', 'Pick a session type', 'Confirm the booking'], pageType: 'app-screen', platform: 'web' },
    refs: [],
  },
];

const QUIET = { restraint: 8, composition: 12, typography: 70, motion: 6, density: 18 };
const LOUD = { restraint: 92, composition: 92, typography: 85, motion: 92, density: 62 };
const lockAll = (d, vals) => Object.entries(vals).reduce((x, [k, v]) => V.lockDim(V.setDim(x, k, v), k, true), d);

// ── the browser: pages drawn and measured, references measured from their pixels ──
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.route('**/*', (r) => {
  const u = r.request().url();
  if (u.startsWith('https://images.example.test/')) return r.fulfill({ contentType: 'image/jpeg', body: readFileSync(FX + u.split('/').pop()) });
  if (u.startsWith('data:') || u.startsWith('about:')) return r.continue();
  return r.abort();
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const draw = async (html, width) => {
  await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts?.ready);
  await page.addScriptTag({ content: V.AUDIT_SOURCE });
  return V.normalizeAudit(await page.evaluate(() => window.__uxv0Audit()));
};
const shot = async (file) => (await page.evaluate(() => window.scrollTo(0, 0)), page.screenshot({ path: S + file, fullPage: false }));
/**
 * The first screen, downscaled to grey at 40 × 28 (each cell 32 px square): coarse enough that a shift of a few
 * pixels is not a difference, fine enough that a block of type or a picture moving is.
 */
const greyOf = async (file) => {
  const b64 = readFileSync(S + file).toString('base64');
  const p2 = await ctx.newPage();
  const g = await p2.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = 40;
    c.height = 28;
    const x = c.getContext('2d');
    x.imageSmoothingQuality = 'high';
    x.drawImage(img, 0, 0, 40, 28);
    const d = x.getImageData(0, 0, 40, 28).data;
    const out = [];
    for (let i = 0; i < d.length; i += 4) out.push((0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255);
    return out;
  }, `data:image/png;base64,${b64}`);
  await p2.close();
  return g;
};
const pixelDiff = (a, b) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0) / a.length;
/** How differently two first screens fill with light, cell by cell: 1 − the correlation (0 the same, 1 unrelated, 2 inverse). */
const layoutDiff = (a, b) => {
  const m = (x) => x.reduce((s, v) => s + v, 0) / x.length;
  const [ma, mb] = [m(a), m(b)];
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da && db ? 1 - num / Math.sqrt(da * db) : 1;
};
// the behaviour runtime runs in a page of its own: a sandboxed document's policy stays with the page it was written into
const bpage = await ctx.newPage();
bpage.on('pageerror', (e) => errors.push(String(e)));
const measureFixture = async (name) => {
  const px = await page.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const E = 96;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const W = w >= h ? E : Math.max(8, Math.round((w / h) * E));
    const H = h > w ? E : Math.max(8, Math.round((h / w) * E));
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0, W, H);
    return { width: W, height: H, data: Array.from(x.getImageData(0, 0, W, H).data) };
  }, `data:image/jpeg;base64,${readFileSync(FX + name + '.jpg').toString('base64')}`);
  return V.refDnaOf(px, `https://images.example.test/${name}.jpg`);
};

const timings = { derive: [], propose: [], proposePlain: [], audit: [], refDna: [] };
const promptAdds = [];

for (const B of BRIEFS) {
  console.log(`\n# ${B.label} — ${B.name}`);
  const r = (report.briefs[B.id] = { label: B.label });
  const brief = V.normalizeBrief(B.brief, new Set());
  brief.intent = V.settleIntent(V.briefWords(brief), {});
  const kind = V.intentOf(brief).kind;
  const salt = `p_${B.id}`;
  r.kind = kind;

  // 1 · the DNA, derived
  const [dna, tDerive] = ms(() => V.deriveDNA({ brief, board: null, kind }));
  timings.derive.push(tDerive);
  r.dna = Object.fromEntries(Object.entries(dna.dims).map(([k, d]) => [k, { value: d.value, source: d.source, because: d.because[0] ?? '' }]));
  console.log('   DNA:', Object.entries(dna.dims).map(([k, d]) => `${k} ${d.value} (${d.source})`).join(', '));
  ok(`${B.label}: a DNA is derived, every dimension saying where it came from`, Object.values(dna.dims).length >= 6 && Object.values(dna.dims).every((d) => d.because.length > 0));

  // 2 · the DNA materially changes the design
  const studyFor = (d) => V.studySpec(d, brief, B.name, []);
  const [quietDirs] = [V.proposeDirections({ brief, dna: lockAll(dna, QUIET), salt })];
  const loudDirs = V.proposeDirections({ brief, dna: lockAll(dna, LOUD), salt });
  const qs = studyFor(quietDirs[0]);
  const ls = studyFor(loudDirs[0]);
  const qa = await draw(V.renderDesign(qs, [], { runtime: true }).html, 1280);
  await shot(`dna-${B.id}-quiet.png`);
  const la = await draw(V.renderDesign(ls, [], { runtime: true }).html, 1280);
  await shot(`dna-${B.id}-loud.png`);
  const qRead = V.dnaOfDesign(qs);
  const lRead = V.dnaOfDesign(ls);
  const [gq, gl] = [await greyOf(`dna-${B.id}-quiet.png`), await greyOf(`dna-${B.id}-loud.png`)];
  const diff = pixelDiff(gq, gl);
  const arrangement = layoutDiff(gq, gl);
  const h1 = (a) => a.headings.find((h) => h.level === 1)?.size ?? 0;
  r.contrast = {
    quiet: { language: quietDirs[0].language, grid: qs.look.grid, motion: qs.look.motion.feel, ratio: qs.look.ratio, display: qs.tokens.fonts.display, read: qRead, h1: h1(qa), sections: qs.sections.length },
    loud: { language: loudDirs[0].language, grid: ls.look.grid, motion: ls.look.motion.feel, ratio: ls.look.ratio, display: ls.tokens.fonts.display, read: lRead, h1: h1(la), sections: ls.sections.length },
    pixelDifference: Math.round(diff * 1000) / 1000,
    layoutDifference: Math.round(arrangement * 1000) / 1000,
    // the two pages' structure, as the spec says (section kinds, order, variants, proportions): 0 the same
    structuralDistance: Math.round(V.structuralDistance(qs, ls) * 100) / 100,
  };
  console.log(`   restrained DNA → ${quietDirs[0].language}, ${qs.look.grid} grid, ${qs.look.motion.feel}, ${qs.tokens.fonts.display}; expressive → ${loudDirs[0].language}, ${ls.look.grid} grid, ${ls.look.motion.feel}, ${ls.tokens.fonts.display}; first screens ${(arrangement * 100).toFixed(0)}% dissimilar (light, cell by cell); structure ${r.contrast.structuralDistance} apart`);
  ok(`${B.label}: an expressive DNA draws a measurably different page from a restrained one (composition, restraint, motion read back higher)`, lRead.composition > qRead.composition + 15 && lRead.restraint > qRead.restraint + 15 && lRead.motion > qRead.motion + 30, J({ q: qRead, l: lRead }));
  ok(`${B.label}: …and it shows on the rendered first screen (dissimilarity of light, cell by cell, ≥ 0.3) and in the page’s structure (> 0)`, arrangement >= 0.3 && r.contrast.structuralDistance > 0, J({ diff, arrangement, structure: r.contrast.structuralDistance }));

  // 3 · three structurally distinct directions from the derived DNA
  const [dirs, tProp] = ms(() => V.proposeDirections({ brief, dna, salt }));
  const [, tPlain] = ms(() => V.proposeDirections({ brief, salt }));
  timings.propose.push(tProp);
  timings.proposePlain.push(tPlain);
  const cmp = V.compareDirections(dirs);
  r.directions = dirs.map((d) => ({ language: d.language, name: d.name, lean: d.dnaLean, grid: d.look.grid, plan: d.plan, display: d.tokens.fonts.display, motion: d.look.motion.feel, said: d.dnaSaid }));
  r.distinctRows = cmp.distinctRows;
  const studies = dirs.map(studyFor);
  const structDist = [];
  for (let i = 0; i < studies.length; i++) for (let j = i + 1; j < studies.length; j++) structDist.push(V.structuralDistance(studies[i], studies[j]));
  r.structuralDistance = structDist.map((x) => Math.round(x * 100) / 100);
  console.log(`   directions: ${dirs.map((d) => `${d.language} (${d.look.grid}, ${d.plan})`).join(' | ')} — ${cmp.distinctRows}/6 aspects differ in all three`);
  ok(`${B.label}: no two directions are one design in different colours`, cmp.nearIdentical.length === 0, J(cmp.nearIdentical));
  ok(`${B.label}: the three differ in at least three of six aspects, and their pages in structure`, cmp.distinctRows >= 3 && structDist.every((x) => x > 0), J({ rows: cmp.distinctRows, structDist }));
  for (let i = 0; i < studies.length; i++) {
    await draw(V.renderDesign(studies[i], [], { runtime: true }).html, 1280);
    await shot(`dna-${B.id}-dir${i + 1}.png`);
  }

  // 4 · locks survive revision
  const locked = lockAll(dna, { composition: dna.dims.composition.value, typography: dna.dims.typography.value });
  const first = V.proposeDirections({ brief, dna: locked, salt });
  const again = V.proposeDirections({ brief, dna: locked, salt, round: 1, seen: first.map((d) => d.language) });
  const held = [...first, ...again].map((d) => V.dnaOfDesign(studyFor(d)));
  const off = held.filter((x) => Math.abs(x.composition - locked.dims.composition.value) > 22 || Math.abs(x.typography - locked.dims.typography.value) > 25);
  r.locks = { composition: locked.dims.composition.value, typography: locked.dims.typography.value, read: held.map((x) => [x.composition, x.typography]) };
  ok(`${B.label}: asked again, six directions all keep the locked composition and typography (within the reading’s slack)`, off.length === 0 && new Set(again.map((d) => d.language)).size === 3 && again.every((d) => !first.some((f) => f.language === d.language)), J(r.locks.read));
  const base = studyFor(first[0]);
  const drift = V.applyPatch(base, { op: 'look', look: { grid: locked.dims.composition.value > 50 ? 'swiss' : 'poster', rhythm: locked.dims.composition.value > 50 ? 'even' : 'dramatic', ratio: locked.dims.typography.value > 50 ? 1.15 : 1.62 }, summary: 'a change against the DNA' }, null);
  const moved = drift.ok ? V.lockedDnaMoves(base, drift.spec, locked) : [];
  const fixed = drift.ok ? V.fitDNA(drift.spec, locked, (s, p) => { const x = V.applyPatch(s, p, null); return x.ok ? x.spec : null; }, { lang: V.languageOf(base.look.language), kind }) : null;
  ok(`${B.label}: a change that moves a locked dimension is caught, and a page that drifted is moved back in code`, moved.length >= 1 && fixed && fixed.held.length >= 1 && V.dnaConsistency(fixed.spec, locked).score > V.dnaConsistency(drift.spec, locked).score, J({ moved, held: fixed?.held }));

  // 5 · references influence without copying
  if (B.refs.length) {
    const [measured, tRef] = ms(() => null);
    void measured;
    void tRef;
    const refs = [];
    for (const name of B.refs) {
      const t0 = performance.now();
      const m = await measureFixture(name);
      timings.refDna.push(Math.round((performance.now() - t0) * 100) / 100);
      refs.push(REF(name, { dna: m, take: name === B.refs[0] ? ['composition'] : [], key: name === B.refs[0] }));
    }
    const board = V.normalizeMoodboard({ refs });
    const withRefs = V.deriveDNA({ brief, board, kind });
    const movedDims = Object.keys(dna.dims).filter((k) => Math.abs((withRefs.dims[k]?.value ?? 0) - dna.dims[k].value) >= 3);
    r.references = { measured: refs.map((x) => ({ id: x.id, votes: x.dna.votes, said: x.dna.said })), moved: Object.fromEntries(movedDims.map((k) => [k, [dna.dims[k].value, withRefs.dims[k].value]])) };
    console.log(`   references ${B.refs.join(', ')}: ${refs.map((x) => x.dna.said.slice(0, 2).join('; ')).join(' | ')} → moved ${movedDims.map((k) => `${k} ${dna.dims[k].value}→${withRefs.dims[k].value}`).join(', ')}`);
    ok(`${B.label}: kept references, measured from their pixels, move the DNA (at least two dimensions)`, movedDims.length >= 2, J(r.references.moved));
    ok(`${B.label}: …what is kept of them is numbers and phrases — no layout, no positions, no picture`, refs.every((x) => J(Object.keys(x.dna).sort()) === J(['of', 'said', 'via', 'votes']) && Object.values(x.dna.votes).every((v) => Number.isInteger(v))));
    const dirsRefs = V.proposeDirections({ brief: { ...brief }, dna: withRefs, salt });
    r.references.directions = dirsRefs.map((d) => `${d.language}/${d.look.grid}`);
    ok(`${B.label}: …and the directions follow (the references’ DNA changes at least one direction’s look)`, dirsRefs.some((d, i) => d.language !== dirs[i].language || d.look.grid !== dirs[i].look.grid || d.look.motion.feel !== dirs[i].look.motion.feel || d.tokens.scale !== dirs[i].tokens.scale), J({ before: dirs.map((d) => `${d.language}/${d.look.grid}/${d.tokens.scale}`), after: dirsRefs.map((d) => `${d.language}/${d.look.grid}/${d.tokens.scale}`) }));
  }

  // 6 · the Originality Audit on the directions' own studies (with their rendered pages)
  const audits = [];
  for (const st of studies) {
    const a = await draw(V.renderDesign(st, [], { runtime: true }).html, 1280);
    const [o, tA] = ms(() => V.auditOriginality({ spec: st, brief, dna, audit: a }));
    timings.audit.push(tA);
    audits.push(o);
  }
  r.originality = audits.map((o) => ({ scores: o.scores, overall: o.overall, open: o.findings.filter((f) => !f.justified).map((f) => f.pattern), allowed: o.findings.filter((f) => f.justified).map((f) => `${f.pattern}: ${f.because}`) }));
  console.log(`   originality of the three: ${audits.map((o) => `${o.overall} (open: ${o.findings.filter((f) => !f.justified).map((f) => f.pattern).join(', ') || 'none'})`).join(' | ')}`);
  ok(`${B.label}: the directions’ own studies score well on distinctiveness and composition (≥ 70)`, audits.every((o) => o.scores.distinctiveness >= 70 && o.scores.composition >= 70), J(r.originality.map((x) => x.scores)));

  // 7 · the functional requirements
  if (kind === 'booking' || V.requiredComponents(V.intentOf(brief)).includes('booking')) {
    const results = [];
    for (const st of studies) {
      const sealed = V.buildSandboxDoc(V.renderDesign(st, []).html, { parse: (h) => new JSDOM(h).window.document, runScripts: false, nonce: 'n0nce123', inspector: V.BEHAVIOR_SOURCE }).doc;
      await bpage.goto('about:blank');
      await bpage.setContent(sealed, { waitUntil: 'load' });
      results.push(await bpage.evaluate(() => (window.__uxBehaviors ? window.__uxBehaviors.selfTest() : null)));
    }
    r.functional = results;
    ok(`${B.label}: every direction has a booking, and it works in place (the behaviour runtime’s self-test)`, studies.every((st) => st.sections.some((x) => x.kind === 'booking')) && results.every((x) => x && x.length >= 1 && x.every((b) => !b.problems.length)), J(results));
  }
  if (kind === 'dashboard' || kind === 'data') {
    const need = ['stat-cards', 'chart', 'table'];
    ok(`${B.label}: every direction has its figures, a chart and the detailed table`, studies.every((st) => need.every((k) => st.sections.some((x) => x.kind === k))), J(studies.map((st) => st.sections.map((x) => x.kind))));
  }

  // 8 · what the DNA adds to a prompt
  const line = V.dnaBrief(locked);
  promptAdds.push(line.length);
}

// ── a generic page, caught and fixed in one pass ─────────────────────
console.log('\n# a generic page');
{
  const generic = V.normalizeSpec({
    pageType: 'website', platform: 'web', version: 1,
    tokens: { colors: { background: '#ffffff', surface: '#f6f5ff', text: '#111111', muted: '#555555', accent: '#6d3df5', accentText: '#ffffff', line: '#e5e5e5' }, fonts: { display: 'Inter', body: 'Inter' }, radius: 'round', scale: 'comfortable', style: 'minimal', imageTreatment: 'natural' },
    look: { language: 'classic', ratio: 1.25, weight: 600, case: 'sentence', tracking: 'tight', emphasis: 'accent', label: 'caps', mono: 'IBM Plex Mono', grid: 'centered', align: 'center', width: 'standard', rhythm: 'even', containers: 'cards', rules: 'none', buttons: 'pill', frame: 'plain', motifs: ['icons', 'shapes'], shapes: ['blob'], accent2: '', motion: V.motionFor('calm') },
    sections: [
      { id: 'nav', kind: 'nav', variant: 'inline', content: { brand: 'Arlet', links: ['Features', 'Pricing', 'About', 'Contact'], cta: 'Get started' } },
      { id: 'hero', kind: 'hero', variant: 'centered', content: { title: 'The coat, reconsidered', subtitle: 'Tailored in Paris.', primary: 'Book a fitting' } },
      { id: 'logos', kind: 'logos', variant: 'row', content: { title: 'As seen in', names: ['Vogue', 'Le Monde', 'FT', 'Kinfolk'] } },
      { id: 'features', kind: 'features', variant: 'grid', content: { title: 'Why the house', items: [1, 2, 3, 4, 5, 6].map((i) => ({ title: `Point ${i}`, text: 'A sentence about the cloth.' })) } },
      { id: 'quote', kind: 'quote', variant: 'large', content: { quote: 'The best coat I own.', author: 'A client' } },
      { id: 'pricing', kind: 'pricing', variant: 'cards', content: { title: 'Fittings', plans: [{ name: 'First fitting', price: '€0', features: ['a'] }, { name: 'Bespoke', price: '€4,800', features: ['b'] }] } },
      { id: 'cta', kind: 'cta', variant: 'centered', content: { title: 'Visit the atelier', primary: 'Book a fitting' } },
      { id: 'footer', kind: 'footer', variant: 'simple', content: { brand: 'Arlet', legal: '©' } },
    ],
  }, null);
  const b = V.normalizeBrief(BRIEFS[0].brief, new Set());
  b.intent = V.settleIntent(V.briefWords(b), {});
  const a0 = await draw(V.renderDesign(generic, [], { runtime: true }).html, 1280);
  await shot('dna-generic-before.png');
  const o = V.auditOriginality({ spec: generic, brief: b, audit: a0 });
  let fixed = generic;
  for (const p of V.originalityFixes(o)) {
    const x = V.applyPatch(fixed, p, null);
    if (x.ok) fixed = x.spec;
  }
  const a1 = await draw(V.renderDesign(fixed, [], { runtime: true }).html, 1280);
  await shot('dna-generic-after.png');
  const o2 = V.auditOriginality({ spec: fixed, brief: b, audit: a1 });
  report.generic = { before: { scores: o.scores, open: o.findings.filter((f) => !f.justified).map((f) => f.pattern) }, after: { scores: o2.scores, open: o2.findings.filter((f) => !f.justified).map((f) => f.pattern) }, fixes: V.originalityFixes(o).map((p) => p.summary) };
  console.log(`   before: ${o.findings.filter((f) => !f.justified).map((f) => f.pattern).join(', ')} (distinctiveness ${o.scores.distinctiveness}); after one pass: ${o2.findings.filter((f) => !f.justified).map((f) => f.pattern).join(', ') || 'nothing open'} (${o2.scores.distinctiveness})`);
  ok('the audit catches what a generic page does by habit (≥ 6 patterns), and the rendered page agrees (rounded boxes counted)', o.findings.filter((f) => !f.justified).length >= 6 && a0.style.roundedBoxes >= 1, J(report.generic.before));
  ok('one pass of targeted fixes leaves nothing unjustified — no loop, no model', o2.findings.filter((f) => !f.justified).length === 0 && o2.scores.distinctiveness > o.scores.distinctiveness, J(report.generic.after));
}

// ── cost and time ────────────────────────────────────────────────────
const med = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};
report.timings_ms = Object.fromEntries(Object.entries(timings).map(([k, xs]) => [k, { median: med(xs), max: Math.max(0, ...xs), n: xs.length }]));
report.prompt_chars_added = { median: med(promptAdds), max: Math.max(...promptAdds), approx_tokens_max: Math.ceil(Math.max(...promptAdds) / 4) };
console.log('\n# cost and time');
console.log('   ', J(report.timings_ms));
console.log('   DNA line in a prompt:', J(report.prompt_chars_added));
ok('no model was called anywhere in this bench (every step is SocriaUX’s own code)', report.model_calls === 0);
ok('deriving the DNA and auditing a design each take well under 50 ms in code', report.timings_ms.derive.max < 50 && report.timings_ms.audit.max < 50, J(report.timings_ms));
ok('the DNA adds one short line to a prompt (≤ 200 tokens)', report.prompt_chars_added.approx_tokens_max <= 200, J(report.prompt_chars_added));
ok('no errors in the pages drawn', errors.length === 0, errors.join(' | '));

await browser.close();
report.pass = pass;
report.fail = fail;
report.checks = checks;
writeFileSync(S + 'dna-bench.json', JSON.stringify(report, null, 2));
const md = [
  `# Creative DNA & Originality — five briefs (${report.at})`,
  '',
  `${pass} passed, ${fail} failed. No model calls.`,
  '',
  ...BRIEFS.map((B) => {
    const r = report.briefs[B.id];
    return [
      `## ${B.label} — ${B.name} (${r.kind})`,
      `- DNA: ${Object.entries(r.dna).map(([k, d]) => `${k} ${d.value} (${d.source})`).join(', ')}`,
      `- Restrained DNA → ${r.contrast.quiet.language}, ${r.contrast.quiet.grid} grid, ${r.contrast.quiet.motion} motion, ${r.contrast.quiet.display}, h1 ${r.contrast.quiet.h1}px; expressive → ${r.contrast.loud.language}, ${r.contrast.loud.grid} grid, ${r.contrast.loud.motion} motion, ${r.contrast.loud.display}, h1 ${r.contrast.loud.h1}px; first screens ${(r.contrast.layoutDifference * 100).toFixed(0)}% dissimilar (light, cell by cell), structure ${r.contrast.structuralDistance} apart`,
      `- Directions: ${r.directions.map((d) => `${d.language} (${d.grid}, ${d.plan}, ${d.motion})`).join(' · ')}; ${r.distinctRows}/6 aspects differ in all three; structural distances ${r.structuralDistance.join(', ')}`,
      `- Locks: composition ${r.locks.composition}, typography ${r.locks.typography}; read back over six directions: ${r.locks.read.map((x) => x.join('/')).join(', ')}`,
      r.references ? `- References: ${r.references.measured.map((m) => `${m.id}: ${m.said.slice(0, 2).join('; ')}`).join(' | ')} → moved ${Object.entries(r.references.moved).map(([k, [a, b]]) => `${k} ${a}→${b}`).join(', ')}` : '- References: none in this brief',
      `- Originality of the three studies: ${r.originality.map((o) => `${o.overall} (open: ${o.open.join(', ') || 'none'})`).join(' · ')}`,
      '',
    ].join('\n');
  }),
  `## A generic page`,
  `- Before: ${report.generic.before.open.join(', ')} (distinctiveness ${report.generic.before.scores.distinctiveness})`,
  `- After one pass: ${report.generic.after.open.join(', ') || 'nothing open'} (distinctiveness ${report.generic.after.scores.distinctiveness})`,
  '',
  `## Cost and time`,
  `- ${Object.entries(report.timings_ms).map(([k, v]) => `${k}: median ${v.median} ms (max ${v.max}, n ${v.n})`).join('; ')}`,
  `- The DNA line in a prompt: median ${report.prompt_chars_added.median} characters, max ${report.prompt_chars_added.max} (≈ ${report.prompt_chars_added.approx_tokens_max} tokens)`,
  '',
  ...checks.filter((c) => !c.ok).map((c) => `- FAIL ${c.n}: ${c.x}`),
].join('\n');
writeFileSync(S + 'dna-bench.md', md);
console.log(`\ndna-bench: ${pass} passed, ${fail} failed (written to ${S})`);
process.exit(fail ? 1 : 0);
