// test/browser/ux-v0/production-bench.mjs — the Advanced Creative Production Engine, verified on six very different
// projects. No model is called and nothing is spent: each design is SocriaUX's own (the engine's Creative DNA, its
// three directions and the first direction's study), taken further with the production tools a designer uses on the
// canvas — every one a real patch (lib/ux-v0/spec.ts applyPatch) — then drawn by SocriaUX's renderer in a real
// browser, with its runtimes, and measured there at 1440, 834 and 390 px.
//
//   luxury fashion editorial · experimental architecture studio · high-end creative agency ·
//   motion-rich digital artist portfolio · immersive 3D product experience · scientific research interface
//
// For each project:
//   1  the engine: the DNA, three directions and how far apart they are, the first one's study (the basic page)
//   2  production: pictures made for the parts that ask for one (procedural, with provenance and a reason), the
//      components the work needs (a 3D object and its configurator, a filtered gallery, a pinned story, a chart with
//      a key and a filterable table), the motion, and a decision for phones or tablets — each a patch, each checked
//      to touch only what it names (in the spec, and in the drawn page)
//   3  the page at three widths: screenshots; the in-page audit at each; the evaluation (quality, distinctiveness,
//      fidelity) with the canvas's own bounded repair (at most two rounds); the originality audit
//   4  it works: the interactive self-test, the 3D self-test (pixels read back), the motion self-test (the story
//      plays through its steps), nothing moving under reduced motion, no script errors
//   5  performance: markup weight, time to load, frames while the page scrolls
//   6  the baseline: the same brief through the basic path (the study, motion still, no production tools), measured
//      the same way; the differences are reported as numbers, not as a verdict
//   7  cost and time: no model call (US$0); the time each step takes in code
//
// Pictures: the made pictures are SocriaUX's own procedural drawings, standing in where a project's photographs are
// not yet given; no third-party image is fetched. Fonts are not fetched either (the browser's network is closed), so
// the screenshots show fallback faces. Writes production-bench.json, production-bench.md, prod-*.png and
// prod-contact-sheet.png to UXV0_OUT. Needs test/.tmp (node test/run.mjs, or the build helper, makes it).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { chromium, S, underTest } from './env.mjs';

const V = await underTest();
const J = JSON.stringify;
let pass = 0;
let fail = 0;
const checks = [];
const ok = (n, c, x = '') => {
  checks.push({ n, ok: !!c, x: c ? '' : String(x).slice(0, 600) });
  c ? (pass++, console.log('  ok  ', n)) : (fail++, console.log('  FAIL', n, String(x).slice(0, 600)));
};
const timed = (f) => {
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
const WIDTHS = [
  ['desktop', 1440, 900],
  ['tablet', 834, 1112],
  ['phone', 390, 844],
];

// ── the six projects: a brief each, and the production steps a designer takes on its canvas ──
// A step is [what it is, (spec, x) => patch or patches]; x.art(kind, ratio, reason, seed) makes a picture in the
// direction's colours, puts it on the moodboard with its reason, and returns its id.
// a sequence of points, placed right after the opening, so it is the one the page pins as its story
const openingOf = (s) => s.sections.find((x) => !['nav', 'app-nav', 'app-header'].includes(x.kind));
const story = (s, title, items) => ({ op: 'add', after: openingOf(s).id, section: { kind: 'features', variant: 'list', content: { title, items: items.map(([t, text]) => ({ title: t, text })) }, images: [] }, summary: 'A sequence told as a pinned story' });
const gallery = (x, title, tags, kinds, variant, ratio, after = 'hero') => ({
  op: 'add',
  after,
  section: { kind: 'gallery', variant, content: { title, tags, caption: '' }, images: tags.map((t, i) => x.art(kinds[i % kinds.length], ratio, `The gallery shows a project (${t}); its photograph is not in yet`, 31 + i * 7)) },
  summary: 'A gallery to filter and open',
});
// an opening drawn as a hero has a place for a picture; one composed in type (a compose section) has none, and no
// picture is made to fill it: the step is said to be not applicable (null)
const heroOf = (s) => s.sections.find((x) => x.kind === 'hero');
const opening = (s, x, kind, ratio, variant) =>
  heroOf(s)
    ? [
        { op: 'images', sectionId: 'hero', images: [x.art(kind, ratio, 'The opening asks for a picture; the project’s own is not in yet', 7)], summary: 'A picture made for the opening' },
        { op: 'variant', sectionId: 'hero', variant, summary: `The opening as ${variant}` },
      ]
    : null;
/** On phones: the picture before the words where the opening has one beside them; else its headline smaller. */
const phoneOpening = (s) => (heroOf(s) && V.stacksPicture(heroOf(s)) ? at('hero', 'mobile', { media: 'first' }) : at(openingOf(s).id, 'mobile', { type: 's' }));
const motion = (feel) => ({ op: 'look', look: { motion: V.motionFor(feel) }, summary: `Motion: ${feel}` });
const at = (sectionId, breakpoint, rule) => ({ op: 'responsive', sectionId, breakpoint, rule, summary: `${sectionId} on ${breakpoint}: ${J(rule)}` });
// the sections a step added, found by what they say (a study may already have a section of the same kind)
const tagged = (s) => s.sections.find((x) => x.kind === 'gallery' && (x.content.tags ?? []).length)?.id;
const titled = (s, kind, title) => s.sections.find((x) => x.kind === kind && x.content.title === title)?.id;

const PROJECTS = [
  {
    id: 'fashion', name: 'Maison Arlet', label: 'Luxury fashion editorial',
    brief: { objective: 'Present the autumn–winter collection of tailored coats as an editorial, and invite clients to private fittings at the Paris atelier.', audience: 'Existing clients and new collectors of the house', personality: ['quiet', 'assured', 'exacting', 'sensual'], visualDirection: 'An editorial of the collection: large serif headlines, generous negative space, pictures given the whole width, slow reveals.', palette: pal('#f4f0e8', '#1b1916', '#6b655c', '#5a2a21', '#fbf8f2', '#e2dccf'), typography: { display: 'Cormorant Garamond', body: 'Inter', rationale: '' }, layoutDirection: 'Few sections, each given room; the collection as a sequence of looks.', userGoals: ['See the collection', 'Ask for a private fitting'], functionalRequirements: ['See the collection'], pageType: 'website', platform: 'web' },
    steps: [
      ['the opening: a picture made for it, set across the whole width', (s, x) => opening(s, x, 'grain', '16:9', 'full-bleed')],
      ['the collection: four looks, filtered by coats and knitwear, each opening large', (s, x) => gallery(x, 'Autumn–winter', ['Coats', 'Knitwear', 'Coats', 'Knitwear'], ['field'], 'strip', '3:4')],
      ['motion: measured (pictures through a mask, lines drawing themselves)', () => motion('measured')],
      ['on phones: the opening’s headline set smaller', () => at('hero', 'mobile', { type: 's' })],
    ],
    needs: ['gallery', 'filter'],
  },
  {
    id: 'architecture', name: 'Atelier Brut', label: 'Experimental architecture studio',
    brief: { objective: 'Show the studio’s experimental built work and competition entries, and win commissions for cultural buildings.', audience: 'Municipalities, cultural institutions and juries', personality: ['rigorous', 'material', 'experimental'], visualDirection: 'Architectural and experimental: a strict grid broken on purpose, topographic line work, raw concrete greys with one oxide red.', palette: pal('#efede8', '#151515', '#5a5a5a', '#9c3a1d', '#ffffff', '#d6d3cc'), typography: { display: 'Archivo', body: 'Inter', rationale: '' }, layoutDirection: 'A project index to filter by type; each project with its year and place.', userGoals: ['Browse projects by type', 'Contact the studio'], functionalRequirements: ['Browse projects by type'], pageType: 'website', platform: 'web' },
    steps: [
      ['the opening: topographic line work made for it, beside the words', (s, x) => opening(s, x, 'contour', '4:3', 'split')],
      ['the index: six projects, filtered by housing, cultural and landscape', (s, x) => gallery(x, 'Projects', ['Housing', 'Cultural', 'Landscape', 'Housing', 'Cultural', 'Landscape'], ['contour', 'lattice'], 'grid', '1:1')],
      ['motion: lively (the opening scrubbed by the scroll, magnetic buttons)', () => motion('lively')],
      ['on tablets: the index tighter; on phones: the opening set for the phone', (s) => [at(tagged(s), 'tablet', { pad: 's' }), phoneOpening(s)]],
    ],
    needs: ['gallery', 'filter'],
  },
  {
    id: 'agency', name: 'Northbound', label: 'High-end creative agency',
    brief: { objective: 'Win brand and digital commissions from ambitious cultural and consumer brands by showing how the agency thinks and what it has made.', audience: 'Marketing directors and founders', personality: ['confident', 'precise', 'warm'], visualDirection: 'High-end and art-directed: bold display type, a cinematic opening, a story of how the work is made told as you scroll.', palette: pal('#111111', '#f3f1ec', '#a19f99', '#ff5a1f', '#1b1b1b', '#2b2b2b', '#111111'), typography: { display: 'Space Grotesk', body: 'Inter', rationale: '' }, layoutDirection: 'The way of working as a sequence, then selected work.', userGoals: ['Understand how the agency works', 'See selected work', 'Start a project'], functionalRequirements: ['See selected work'], pageType: 'website', platform: 'web' },
    steps: [
      ['the opening: an abstract field made for it, beside the words', (s, x) => opening(s, x, 'field', '4:3', 'split')],
      ['how we work: four steps, told as a pinned story', (s) => story(s, 'How we work', [['Listen', 'Weeks with your people before a single sketch.'], ['Frame', 'One idea, written down, that every decision answers to.'], ['Make', 'Brand, product and space made side by side.'], ['Launch', 'We stay through launch, and measure what changed.']])],
      ['selected work: six projects, filtered by brand, digital and spatial', (s, x) => gallery(x, 'Selected work', ['Brand', 'Digital', 'Spatial', 'Brand', 'Digital', 'Spatial'], ['field', 'lattice'], 'grid', '1:1', titled(s, 'features', 'How we work') ?? 'hero')],
      ['motion: kinetic (story, scrub, pictures scaling in, tilt, magnetic buttons)', () => motion('kinetic')],
      ['on phones: the opening set for the phone', (s) => phoneOpening(s)],
    ],
    needs: ['gallery', 'filter', 'story'],
  },
  {
    id: 'artist', name: 'Mira Okafor', label: 'Motion-rich digital artist portfolio',
    brief: { objective: 'A portfolio that is itself a piece of motion, showing generative work, installations and films, and gets the artist commissioned.', audience: 'Curators, galleries and creative directors', personality: ['daring', 'playful', 'kinetic'], visualDirection: 'Motion-rich and immersive: orbits and generative line work, oversized type, scroll-driven reveals, pictures that answer the pointer.', palette: pal('#0b0b10', '#f2f2ee', '#9a9aa6', '#c6ff3d', '#15151c', '#26262f', '#0b0b10'), typography: { display: 'Unbounded', body: 'Inter', rationale: '' }, layoutDirection: 'Work first; the process as a scroll story.', userGoals: ['See the work', 'Understand the process', 'Commission a piece'], functionalRequirements: ['See the work'], pageType: 'website', platform: 'web' },
    steps: [
      ['the opening: orbits made for it, across the whole width', (s, x) => opening(s, x, 'orbit', '16:9', 'full-bleed')],
      ['the work: six pieces, filtered by generative, installation and film', (s, x) => gallery(x, 'Work', ['Generative', 'Installation', 'Film', 'Generative', 'Installation', 'Film'], ['orbit', 'lattice', 'contour'], 'grid', '1:1')],
      ['the process: four steps, told as a pinned story', (s) => story(s, 'Process', [['Seed', 'A rule, a number, a sound.'], ['Grow', 'The system runs until it surprises me.'], ['Prune', 'Most of it goes; what stays is chosen.'], ['Show', 'Light, room and time decide the rest.']])],
      ['motion: kinetic (scrub, story, tilt toward the pointer, lines drawing)', () => motion('kinetic')],
      ['on phones: the process’s headings smaller', (s) => at(titled(s, 'features', 'Process'), 'mobile', { type: 's' })],
    ],
    needs: ['gallery', 'filter', 'story'],
  },
  {
    id: 'product3d', name: 'Aurel One', label: 'Immersive 3D product experience',
    brief: { objective: 'Launch a one-piece aluminium speaker with an immersive 3D product page, and let people configure its finish and reserve one.', audience: 'Design-minded listeners and audiophiles', personality: ['precise', 'tactile', 'bold'], visualDirection: 'Immersive: the object in 3D, turned by hand, lit like a studio shot; a configurator that recolours it.', palette: pal('#f1efeb', '#141414', '#5f5f5f', '#2f5d62', '#ffffff', '#dddad3'), typography: { display: 'Archivo', body: 'Inter', rationale: '' }, layoutDirection: 'The object first, then its finishes and the reservation.', userGoals: ['Turn the speaker in 3D', 'Choose a finish', 'Reserve one'], functionalRequirements: ['Turn the speaker in 3D', 'Choose a finish'], pageType: 'website', platform: 'web' },
    steps: [
      ['the object in 3D: a monolith in satin, turned by hand, the scroll and the keys', (s) => (s.sections.some((x) => x.kind === 'scene') ? { op: 'content', sectionId: s.sections.find((x) => x.kind === 'scene').id, content: { title: 'One block of sound', text: 'Turned from a single block of aluminium.', model: 'monolith', material: 'satin', color: '#2f5d62', caption: 'Drag it, or use the arrow keys, to turn it.' }, summary: 'The object named' } : { op: 'add', after: 'hero', section: { kind: 'scene', variant: 'stage', content: { title: 'One block of sound', text: 'Turned from a single block of aluminium.', model: 'monolith', material: 'satin', color: '#2f5d62', caption: 'Drag it, or use the arrow keys, to turn it.' }, images: [] }, summary: 'The object in 3D' })],
      ['its configurator: three finishes that recolour the object, a stand, the total', (s) => {
        const content = { title: 'Make it yours', groups: [{ name: 'Finish', options: [{ label: 'Graphite', price: '', swatch: '#2b2b2b' }, { label: 'Sand', price: '+£60', swatch: '#c8b89a' }, { label: 'Oxide', price: '+£90', swatch: '#8a3b24' }] }, { name: 'Stand', options: [{ label: 'None', price: '' }, { label: 'Walnut stand', price: '+£180' }] }], base: '£1,290', action: 'Reserve yours', note: 'Reservations open in March; nothing is charged today.' };
        const cfg = s.sections.find((x) => x.kind === 'configurator');
        return cfg ? { op: 'content', sectionId: cfg.id, content, summary: 'The configurator’s finishes' } : { op: 'add', after: s.sections.find((x) => x.kind === 'scene')?.id ?? 'hero', section: { kind: 'configurator', variant: 'split', content, images: [] }, summary: 'A configurator' };
      }],
      ['motion: lively', () => motion('lively')],
      ['on phones: the object before the words', (s) => at(s.sections.find((x) => x.kind === 'scene').id, 'mobile', { media: 'first' })],
    ],
    needs: ['scene', 'configurator'],
  },
  {
    id: 'research', name: 'Glacier Mass Balance', label: 'Scientific research interface',
    brief: { objective: 'A research interface to explore glacier mass balance across field stations: compare glaciers over a decade and inspect each station’s readings.', audience: 'Glaciologists and research students', personality: ['precise', 'calm', 'rigorous'], visualDirection: 'Scientific and legible: a rigorous grid, data first, colour only to tell series apart.', palette: pal('#ffffff', '#0f172a', '#475569', '#0e7490', '#f8fafc', '#e2e8f0'), typography: { display: 'IBM Plex Sans', body: 'IBM Plex Sans', rationale: '' }, layoutDirection: 'Key figures, then the decade compared, then the station log.', userGoals: ['Compare glaciers over a decade', 'Inspect station readings', 'Filter the log'], functionalRequirements: ['Compare glaciers over a decade', 'Inspect station readings'], pageType: 'app-screen', platform: 'web' },
    steps: [
      ['the decade compared: two glaciers on one chart, each series shown or hidden', (s) => {
        const content = { title: 'Annual mass balance (m w.e.)', labels: ['2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024'], series: [{ name: 'Rhône', values: [-0.8, -1.1, -0.9, -1.4, -1.0, -1.2, -0.7, -2.1, -1.6, -1.3] }, { name: 'Aletsch', values: [-0.6, -0.9, -0.7, -1.1, -0.8, -1.0, -0.5, -1.8, -1.3, -1.0] }], note: 'Metres of water equivalent, measured each September.' };
        const ch = s.sections.find((x) => x.kind === 'chart');
        return ch ? [{ op: 'content', sectionId: ch.id, content, summary: 'The decade’s readings' }, { op: 'variant', sectionId: ch.id, variant: 'line', summary: 'As lines' }] : { op: 'add', after: null, section: { kind: 'chart', variant: 'line', content, images: [] }, summary: 'The decade compared' };
      }],
      ['the station log: eight readings, filtered as you type', (s) => {
        const content = { title: 'Station log', columns: ['Station', 'Glacier', 'Elevation', 'Balance'], rows: [['ST-01', 'Rhône', '2,310 m', '−1.3'], ['ST-02', 'Rhône', '2,640 m', '−0.9'], ['ST-03', 'Rhône', '2,950 m', '−0.4'], ['AL-01', 'Aletsch', '2,200 m', '−1.6'], ['AL-02', 'Aletsch', '2,700 m', '−1.0'], ['AL-03', 'Aletsch', '3,100 m', '−0.3'], ['AL-04', 'Aletsch', '3,350 m', '+0.1'], ['ST-04', 'Rhône', '3,200 m', '−0.1']].map((cells) => ({ cells, status: '' })) };
        const tb = s.sections.find((x) => x.kind === 'table');
        return tb ? { op: 'content', sectionId: tb.id, content, summary: 'The station log' } : { op: 'add', after: null, section: { kind: 'table', variant: 'default', content, images: [] }, summary: 'The station log' };
      }],
      ['motion: measured (the chart’s lines drawing themselves)', () => motion('measured')],
      ['on phones: the chart’s heading smaller', (s) => at(s.sections.find((x) => x.kind === 'chart').id, 'mobile', { type: 's' })],
    ],
    needs: ['chart', 'table'],
  },
];

// ── the browser ──
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const reducedCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
for (const c of [ctx, reducedCtx]) await c.route('**/*', (r) => (/^(data|about):/.test(r.request().url()) ? r.continue() : r.abort()));
const errors = [];
// every page in a fresh tab: setContent keeps the window, and SocriaUX's runtimes (rightly) run once per window
let page = null;
const fresh = async () => {
  if (page) await page.close();
  page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text()) && errors.push(m.text().slice(0, 200)));
  return page;
};
const load = async (html, w, h) => {
  await fresh();
  await page.setViewportSize({ width: w, height: h });
  const t0 = Date.now();
  await page.setContent(html, { waitUntil: 'load' });
  return Date.now() - t0;
};

/** One width: the page drawn, its load timed, the in-page audit run (with the interactive and 3D self-tests). */
const measureAt = async (html, w, h) => {
  const loadMs = await load(html, w, h);
  await page.waitForTimeout(300);
  await page.addScriptTag({ content: V.AUDIT_SOURCE });
  const audit = V.normalizeAudit(await page.evaluate(() => window.__uxv0Audit()));
  return { audit, loadMs };
};
// as the canvas does: the layout is measured on the page at rest (an arrival still on its way, or one waiting below
// the fold to be scrolled to, is where its animation starts, not where the page lays it out); the runtimes, the
// motion, the screenshots and the frames are taken from the page as it plays
const measureAll = async (spec, refs, ctxEval) => {
  const html = V.renderDesign(spec, refs, { motion: 'play', runtime: true }).html;
  const rest = V.renderDesign(spec, refs, { runtime: true }).html;
  const out = {};
  for (const [vp, w, h] of WIDTHS) out[vp] = await measureAt(rest, w, h);
  const ev = V.evaluateDesign(spec, { desktop: out.desktop.audit, tablet: out.tablet.audit, phone: out.phone.audit }, ctxEval.locks ?? [], ctxEval);
  return { html, rest, out, ev };
};
const sectionsHtml = (html) => {
  const doc = new JSDOM(html).window.document;
  return Object.fromEntries([...doc.querySelectorAll('[data-ux-section].sx, div.sx[data-ux-section]')].map((el) => [el.getAttribute('data-ux-section'), el.outerHTML]));
};
const counts = async () => page.evaluate(() => ({ ...(window.__uxBehaviors ? { bookings: window.__uxBehaviors.bookings, forms: window.__uxBehaviors.forms, galleries: window.__uxBehaviors.galleries, filters: window.__uxBehaviors.filters, charts: window.__uxBehaviors.charts, tables: window.__uxBehaviors.tables, configurators: window.__uxBehaviors.configurators } : {}), scenes: window.__uxScene ? window.__uxScene.report.webgl : 0, story: window.__uxMotion ? window.__uxMotion.report.steps : 0, reveal: window.__uxMotion ? window.__uxMotion.report.reveal : 0 }));
const fpsWhileScrolling = async () =>
  page.evaluate(async () => {
    window.scrollTo(0, 0);
    let frames = 0;
    let run = true;
    const tick = () => {
      frames++;
      if (run) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    const H = Math.max(0, document.documentElement.scrollHeight - innerHeight);
    const t0 = performance.now();
    await new Promise((res) => {
      const step = () => {
        const t = performance.now() - t0;
        window.scrollTo(0, Math.min(H, (t / 1500) * H));
        if (t < 1500) requestAnimationFrame(step);
        else res();
      };
      requestAnimationFrame(step);
    });
    run = false;
    return Math.round(frames / 1.5);
  });
const shot = async (file, scrollTo = null) => {
  await page.evaluate((id) => {
    if (id) document.querySelector(`[data-ux-section="${id}"]`)?.scrollIntoView({ block: 'start' });
    else window.scrollTo(0, 0);
  }, scrollTo);
  await page.waitForTimeout(scrollTo ? 900 : 350);
  await page.screenshot({ path: S + file });
};
const findingsSummary = (ev) => ({ high: ev.findings.filter((f) => f.severity === 'high').length, medium: ev.findings.filter((f) => f.severity === 'medium').length, low: ev.findings.filter((f) => f.severity === 'low').length, messages: ev.findings.filter((f) => f.severity !== 'low').map((f) => `${f.viewport}: ${f.message}`).slice(0, 8) });

const report = { at: new Date().toISOString(), model_calls: 0, cost_usd: 0, widths: WIDTHS.map(([v, w]) => `${v} ${w}px`), projects: {} };

for (const P of PROJECTS) {
  console.log(`\n=== ${P.label}: ${P.name} ===`);
  const r = { name: P.name, label: P.label, steps: [], times: {} };
  report.projects[P.id] = r;
  errors.length = 0;
  const brief = V.normalizeBrief(P.brief, new Set());
  const intent = V.intentOf(brief);

  // 1 · the engine
  const [dna, tDna] = timed(() => V.deriveDNA({ brief, board: null, kind: intent.kind }));
  const [dirs, tDirs] = timed(() => V.proposeDirections({ brief, dna, salt: `bench-${P.id}` }));
  const cmp = V.compareDirections(dirs);
  const d0 = dirs[0];
  const [study, tStudy] = timed(() => V.studySpec(d0, brief, P.name, []));
  r.times = { dna: tDna, directions: tDirs, study: tStudy };
  r.directions = dirs.map((d) => ({ name: d.name, language: d.language, display: d.tokens.fonts.display, motion: d.look.motion?.feel ?? 'still' }));
  r.distinct = { rows: cmp.rows.length, distinctRows: cmp.distinctRows, nearIdentical: cmp.nearIdentical.length };
  ok(`${P.id}: three directions, none a recolouring of another (${cmp.distinctRows}/${cmp.rows.length} aspects differ in all three)`, dirs.length === 3 && cmp.nearIdentical.length === 0, J(r.distinct));
  ok(`${P.id}: the first direction's study is a page`, !!study && study.sections.length >= 1, J(study?.sections?.map((s) => s.kind)));
  const locks = d0.locks ?? [];

  // 6 (first, on the same page) · the baseline: the study, motion still, no production tools
  const baseline = { ...study, look: { ...(study.look ?? V.lookFromTokens(study.tokens)), motion: { ...V.STILL_MOTION } } };
  const bm = await measureAll(baseline, [], { direction: d0, brief, board: null, locks });
  await load(bm.html, 1440, 900);
  await page.waitForTimeout(300);
  const baseCounts = await counts();
  await shot(`prod-${P.id}-baseline-desktop.png`);
  const baseOrig = V.auditOriginality({ spec: baseline, brief, dna, audit: bm.out.desktop.audit });
  r.baseline = { quality: bm.ev.quality, distinctiveness: bm.ev.distinctiveness, fidelity: bm.ev.fidelity, originality: baseOrig.overall, findings: findingsSummary(bm.ev), counts: baseCounts, htmlKB: Math.round(bm.html.length / 100) / 10, loadMs: bm.out.desktop.loadMs, sections: baseline.sections.map((s) => s.kind) };

  // 2 · production: the tools a designer uses, each a patch, each checked to touch only what it names
  let spec = study;
  const refs = [];
  const x = {
    art: (kind, ratio, reason, seed = 1) => {
      const ref = V.normalizeRef(V.procRef(V.normalizeProc({ kind, seed, ratio, palette: V.paletteOf(spec.tokens, (spec.look ?? {}).accent2 ?? '') }), reason));
      if (!refs.some((q) => q.id === ref.id)) refs.push(ref);
      return ref.id;
    },
  };
  const board = () => V.normalizeMoodboard({ refs });
  for (const [label, make] of P.steps) {
    const before = spec;
    const made = make(spec, x);
    if (made == null) {
      console.log('  --   ', `${P.id}: ${label} — not applicable: the opening is composed in type, with no place for a picture; none was made to fill it`);
      r.steps.push({ label, ok: true, skipped: 'the opening is composed in type, with no place for a picture; none was made to fill it' });
      continue;
    }
    const patches = Array.isArray(made) ? made : [made];
    let res = { ok: true, spec };
    const [, t] = timed(() => {
      for (const pt of patches) {
        if (!res.ok) break;
        res = V.applyPatch(res.spec, pt, board());
      }
    });
    if (!res.ok) {
      ok(`${P.id}: ${label}`, false, res.error);
      r.steps.push({ label, ok: false, error: res.error });
      continue;
    }
    spec = res.spec;
    // precision: in the spec, what was not named is exactly as it was; in the drawn page too (for a change in place)
    const named = new Set(patches.map((pt) => pt.sectionId).filter(Boolean));
    const adds = patches.filter((pt) => pt.op === 'add').length;
    const kept = before.sections.filter((s) => !named.has(s.id));
    const keptSame = kept.every((s) => J(spec.sections.find((y) => y.id === s.id)) === J(s));
    const countOk = spec.sections.length === before.sections.length + adds;
    let drawnSame = true;
    if (!adds && patches.every((pt) => pt.sectionId)) {
      const a = sectionsHtml(V.renderDesign(before, refs).html);
      const b = sectionsHtml(V.renderDesign(spec, refs).html);
      drawnSame = kept.every((s) => a[s.id] === b[s.id]);
    }
    const precise = keptSame && countOk && drawnSame;
    ok(`${P.id}: ${label} — applied, touching only what it names`, precise, J({ keptSame, countOk, drawnSame }));
    r.steps.push({ label, ok: true, precise, ms: t, patches: patches.map((pt) => pt.op) });
  }
  r.refs = refs.map((q) => ({ id: q.id, kind: q.proc.kind, ratio: q.proc.ratio, license: q.license, reason: q.reason }));
  ok(`${P.id}: every made picture carries its provenance and its reason`, refs.every((q) => q.provider === 'socriaux' && /no third-party rights/.test(q.license) && q.reason), J(r.refs));

  // 3 · the page at three widths, with the canvas's bounded repair
  let m = await measureAll(spec, refs, { direction: d0, brief, board: board(), locks });
  const first = findingsSummary(m.ev);
  const repaired = [];
  for (let round = 0; round < V.MAX_REVISION_ROUNDS; round++) {
    const fixes = V.fixesFor(m.ev);
    if (!fixes.length) break;
    for (const f of fixes) {
      const res = V.applyPatch(spec, f.patch, board());
      if (res.ok) (spec = res.spec), repaired.push(f.patch.summary);
    }
    m = await measureAll(spec, refs, { direction: d0, brief, board: board(), locks });
  }
  r.qa = { before: first, repaired, after: findingsSummary(m.ev) };
  // the design as it stands, kept beside its screenshots: anyone can draw it again (renderDesign) and check it
  writeFileSync(S + `prod-${P.id}.spec.json`, J({ spec, refs }, null, 1));
  const orig = V.auditOriginality({ spec, brief, dna, audit: m.out.desktop.audit });
  r.final = { quality: m.ev.quality, distinctiveness: m.ev.distinctiveness, fidelity: m.ev.fidelity, originality: orig.overall, scores: orig.scores, sections: spec.sections.map((s) => s.kind), htmlKB: Math.round(m.html.length / 100) / 10, loadMs: Object.fromEntries(WIDTHS.map(([vp]) => [vp, m.out[vp].loadMs])), weight: m.out.desktop.audit.weight };
  const overflow = m.ev.findings.filter((f) => f.kind === 'overflow');
  ok(`${P.id}: nothing runs past the edge at 1440, 834 or 390 px`, !overflow.length, J(overflow.map((f) => f.message)));
  const highs = m.ev.findings.filter((f) => f.severity === 'high');
  ok(`${P.id}: no must-fix finding left after the bounded repair`, !highs.length, J(highs.map((f) => `${f.viewport}: ${f.message}`)));

  // 4 · it works, in the browser, as drawn
  for (const [vp, w, h] of WIDTHS) {
    await load(m.html, w, h);
    await page.waitForTimeout(500);
    await shot(`prod-${P.id}-${vp}.png`);
  }
  await load(m.html, 1440, 900);
  await page.waitForTimeout(500);
  const finalCounts = await counts();
  const inter = m.out.desktop.audit.interactive ?? [];
  const scenes = m.out.desktop.audit.scenes ?? [];
  const motionTest = await page.evaluate(() => (window.__uxMotion ? window.__uxMotion.selfTest() : null));
  const feature = spec.sections.find((s) => ['scene', 'gallery', 'chart'].includes(s.kind) && s.id !== 'hero') ?? spec.sections.find((s) => s.kind === 'features');
  await shot(`prod-${P.id}-feature.png`, feature?.id ?? null);
  const fps = await fpsWhileScrolling();
  r.works = { counts: finalCounts, interactive: inter, scenes, story: motionTest?.story ?? [], motion: motionTest?.report ?? null, fps };
  ok(`${P.id}: every interactive part works when tried (${inter.map((i) => i.kind).join(', ') || 'none'})`, inter.every((i) => !i.problems.length), J(inter));
  for (const need of P.needs) {
    const have = need === 'gallery' ? finalCounts.galleries > 0 : need === 'filter' ? finalCounts.filters > 0 : need === 'story' ? finalCounts.story >= 3 : need === 'scene' ? scenes.length > 0 : need === 'configurator' ? finalCounts.configurators > 0 : need === 'chart' ? finalCounts.charts > 0 : need === 'table' ? finalCounts.tables > 0 : false;
    ok(`${P.id}: the ${need} the work needs is on the page and wired`, have, J(finalCounts));
  }
  if (scenes.length) ok(`${P.id}: the 3D object was really drawn (its centre pixel read back)`, scenes.every((s) => s.webgl && s.drawn), J(scenes));
  if (finalCounts.story) {
    const st = motionTest?.story?.[0];
    ok(`${P.id}: the pinned story plays through every step in order`, !!st && st.seen.join() === Array.from({ length: st.steps }, (_, i) => i).join() && st.pinned, J(motionTest?.story));
  }
  if (P.needs.includes('configurator') && scenes.length) {
    // the configurator recolours the object: choose another finish and read the object's centre again
    const before = await page.evaluate(() => window.__uxScene.selfTest()[0].pixel);
    await page.evaluate(() => {
      const r0 = document.querySelectorAll('[data-ux-config] input[type=radio]')[2];
      r0.checked = true;
      r0.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(250);
    const after = await page.evaluate(() => window.__uxScene.selfTest()[0].pixel);
    const total = await page.evaluate(() => document.querySelector('[data-ux-config-total]').textContent);
    r.works.recolour = { before, after, total };
    ok(`${P.id}: choosing a finish recolours the object and changes the total`, J(before) !== J(after) && /1,380/.test(total), J(r.works.recolour));
  }
  // reduced motion: nothing moves on its own
  const rp = await reducedCtx.newPage();
  await rp.setContent(m.html, { waitUntil: 'load' });
  await rp.waitForTimeout(700);
  const still = await rp.evaluate(() => ({ ready: document.body.classList.contains('mo-ready'), reduced: window.__uxMotion ? window.__uxMotion.report.reduced : null, sceneFrames: window.__uxScene ? window.__uxScene.report.frames : 0 }));
  await rp.waitForTimeout(500);
  const still2 = await rp.evaluate(() => (window.__uxScene ? window.__uxScene.report.frames : 0));
  await rp.close();
  r.works.reduced = { ...still, sceneFramesLater: still2 };
  ok(`${P.id}: under reduced motion nothing moves on its own`, !still.ready && still.reduced === true && still2 === still.sceneFrames, J(r.works.reduced));
  r.errors = [...errors];
  ok(`${P.id}: no script error on the page`, !errors.length, J(errors));

  // 5 · performance
  ok(`${P.id}: the page weighs under 600 KB and loads in under 3 s`, m.html.length < 600_000 && Math.max(...Object.values(r.final.loadMs)) < 3000, J({ kb: r.final.htmlKB, load: r.final.loadMs }));
  ok(`${P.id}: it scrolls without stalling (${fps} frames a second)`, fps >= 15, String(fps));
  console.log(`  quality ${r.baseline.quality} → ${r.final.quality} · distinct ${r.baseline.distinctiveness} → ${r.final.distinctiveness} · originality ${r.baseline.originality} → ${r.final.originality} · ${r.final.htmlKB} KB · ${fps} fps`);
}

// ── the contact sheet: the basic page, then the production page at three widths and its signature part ──
const img = (f, cls = '') => (existsSync(S + f) ? `<img class="${cls}" src="data:image/png;base64,${readFileSync(S + f).toString('base64')}">` : '<div class="none">—</div>');
const rows = PROJECTS.map((P) => {
  const r = report.projects[P.id];
  return `<div class="row"><div class="h"><h2>${P.label}</h2><p>${P.name}</p><p class="m">quality ${r.baseline.quality} → <b>${r.final.quality}</b><br>distinct ${r.baseline.distinctiveness} → <b>${r.final.distinctiveness}</b><br>originality ${r.baseline.originality} → <b>${r.final.originality}</b><br>${r.final.htmlKB} KB · ${r.works.fps} fps</p></div><div class="cell">${img(`prod-${P.id}-baseline-desktop.png`)}<div class="cap">Basic path (study, still)</div></div><div class="cell">${img(`prod-${P.id}-desktop.png`)}<div class="cap">Production · 1440</div></div><div class="cell">${img(`prod-${P.id}-feature.png`)}<div class="cap">Signature part · 1440</div></div><div class="cell">${img(`prod-${P.id}-tablet.png`, 'tab')}<div class="cap">834</div></div><div class="cell">${img(`prod-${P.id}-phone.png`, 'ph')}<div class="cap">390</div></div></div>`;
}).join('');
const sheet = `<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:28px;background:#ebe8e1;font:13px/1.4 system-ui,sans-serif;color:#1d1d1a}h1{font:400 26px Georgia,serif;margin:0 0 4px}p.s{margin:0 0 22px;color:#555}.row{display:grid;grid-template-columns:170px 1.6fr 1.6fr 1.6fr .9fr .55fr;gap:12px;margin-bottom:20px;align-items:start}.h h2{font-size:14px;margin:4px 0 2px}.h p{margin:0 0 8px;color:#555}.h .m{color:#222}.cell{background:#fff;border-radius:6px;overflow:hidden;box-shadow:0 1px 0 rgba(0,0,0,.08)}.cell img{display:block;width:100%;height:300px;object-fit:cover;object-position:top}.cell img.tab{height:300px}.cell img.ph{height:300px}.cap{padding:6px 9px;font-size:11.5px;color:#444}.none{height:300px}</style><h1>SocriaUX — production engine, six projects</h1><p class="s">No model call. Each page: the engine's first direction and its study, taken further with the canvas's production tools (made pictures, interactive parts, 3D, motion, width rules), checked at 1440, 834 and 390 px and repaired in at most two rounds. Fonts not fetched (fallback faces); pictures are SocriaUX's own made drawings.</p>${rows}`;
writeFileSync(S + 'prod-contact-sheet.html', sheet);
await load(sheet, 2000, 900);
await page.screenshot({ path: S + 'prod-contact-sheet.png', fullPage: true });
await browser.close();

// ── the report ──
report.checks = { pass, fail, list: checks };
writeFileSync(S + 'production-bench.json', J(report, null, 2));
const md = [
  '# SocriaUX production engine — six-project benchmark',
  '',
  `Run ${report.at}. Model calls: 0. Spend: US$0. Checks: ${pass} passed, ${fail} failed.`,
  '',
  '| Project | Quality (basic → production) | Distinctiveness | Fidelity | Originality | Interactive parts working | KB | Load ms (1440/834/390) | fps |',
  '|---|---|---|---|---|---|---|---|---|',
  ...PROJECTS.map((P) => {
    const r = report.projects[P.id];
    const inter = r.works.interactive.length + (r.works.scenes.length ? r.works.scenes.length : 0) + (r.works.story.length ? 1 : 0);
    return `| ${P.label} | ${r.baseline.quality} → ${r.final.quality} | ${r.baseline.distinctiveness} → ${r.final.distinctiveness} | ${r.baseline.fidelity} → ${r.final.fidelity} | ${r.baseline.originality} → ${r.final.originality} | ${inter} | ${r.final.htmlKB} | ${r.final.loadMs.desktop}/${r.final.loadMs.tablet}/${r.final.loadMs.phone} | ${r.works.fps} |`;
  }),
  '',
  'Basic = the engine’s study of the first direction, motion still, no production tools; production = the same study taken further with the canvas tools, each step a patch. The numbers are SocriaUX’s own measures (lib/ux-v0/evaluate.ts, lib/ux-v0/originality.ts) of pages drawn in Chromium; they are not a comparison with any other product.',
  '',
  ...PROJECTS.flatMap((P) => {
    const r = report.projects[P.id];
    return [
      `## ${P.label} — ${P.name}`,
      '',
      `Directions: ${r.directions.map((d) => `${d.name} (${d.language}, ${d.display}, ${d.motion})`).join(' · ')}; ${r.distinct.distinctRows}/${r.distinct.rows} aspects differ in all three; ${r.distinct.nearIdentical} near-identical pairs.`,
      `Engine time: DNA ${r.times.dna} ms, directions ${r.times.directions} ms, study ${r.times.study} ms.`,
      '',
      ...r.steps.map((s) => `- ${s.skipped ? '–' : s.ok ? (s.precise ? '✓' : '△') : '✗'} ${s.label}${s.ms != null ? ` (${s.ms} ms)` : ''}${s.error ? ` — ${s.error}` : ''}${s.skipped ? ` — not applicable: ${s.skipped}` : ''}`),
      '',
      `QA: before repair ${r.qa.before.high} must-fix, ${r.qa.before.medium} should-fix, ${r.qa.before.low} notes; repaired: ${r.qa.repaired.length ? r.qa.repaired.join('; ') : 'nothing needed'}; after ${r.qa.after.high}/${r.qa.after.medium}/${r.qa.after.low}.`,
      r.qa.after.messages.length ? `Left: ${r.qa.after.messages.join(' · ')}` : '',
      `Works: ${J(r.works.counts)}; story ${r.works.story.map((s) => `${s.seen.join('→')}${s.pinned ? ' pinned' : ''}`).join(' ') || '—'}; scenes ${r.works.scenes.map((s) => (s.drawn ? 'drawn' : 'not drawn')).join(', ') || '—'}; reduced motion ${r.works.reduced.ready ? 'MOVES' : 'still'}.`,
      `Sections: basic ${r.baseline.sections.join(', ')} → production ${r.final.sections.join(', ')}.`,
      '',
    ];
  }),
].join('\n');
writeFileSync(S + 'production-bench.md', md);
console.log(`\n${pass} passed, ${fail} failed · ${S}production-bench.md`);
process.exit(fail ? 1 : 0);
