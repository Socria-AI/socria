// test/browser/ux-v0/craft-bench.mjs — the four methods, measured, with SocriaUX's own code and a real browser.
// No model call is made (nothing is spent).
//
//   1  THE LOOKS GENERATED PAGES SHARE: every language, with palettes that invite each look (cream and terracotta,
//      black and acid green, black and vermilion, white and purple…), serif and sans pairs, many subjects and
//      projects: how many directions show one nobody asked for (the designer's own palette counts as asked);
//      how many the engine moved off one; and rendered pages read by the audit (gradients, emoji, accent rails,
//      centred text).
//   2  EACH DIRECTION'S PLAN: how many state a whole plan, how many found a detail only their subject has, whether
//      every signature is one the design can draw, and whether the drawn study makes exactly one loud move.
//   3  A DESIGN SYSTEM: one system (CSS custom properties and guidelines) attached to several briefs: do all the
//      directions keep its colours, faces and corners; do their studies pass the check against it; do they read.
//   4  LAYOUT PIECES: how many site directions open with a composed section, how many different openings that
//      gives across projects, and whether every composed opening draws cleanly at 1280 and 390 px.
//
// Writes craft-bench.json and craft-bench.md to UXV0_OUT. Needs test/.tmp (node test/run.mjs builds it).
import { readFileSync, writeFileSync } from 'node:fs';
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
const report = { at: new Date().toISOString(), model_calls: 0 };

const REF = (id) => ({ provider: 'openverse', providerId: id, id: `openverse:${id}`, url: `https://images.example.test/${id}.jpg`, thumb: `https://images.example.test/${id}.jpg`, width: 1600, height: 1067, title: id, creator: 'A', creatorUrl: '', sourceUrl: `https://example.org/${id}`, license: 'CC BY 2.0', licenseUrl: '', attribution: id, category: 'imagery', state: 'kept', asContent: true });
const board = V.normalizeMoodboard({ refs: [REF('window'), REF('grid'), REF('people'), REF('dusk')] });
const KEPT = new Set(board.refs.map((r) => r.id));
const mk = (objective, extra = {}) => {
  const b = V.normalizeBrief({ pageType: 'website', platform: 'web', objective, audience: 'people', personality: ['warm', 'clear'], visualDirection: 'considered', palette: [], typography: { display: 'Archivo', body: 'Inter' }, userGoals: ['See it', 'Get in touch'], ...extra }, KEPT);
  b.intent = V.settleIntent(V.briefWords(b), {});
  return b;
};
const SUBJECTS = ['A website for a neighbourhood bakery', 'A website for a jazz bar', 'A website for a small hotel', 'A literary magazine story', 'A website for a skincare brand', 'A website for an architecture studio', 'A motion design portfolio', 'A website for a ceramics studio', 'Booking screen for a yoga class', 'A dashboard for lab sensor readings'];

// ── 1 · the looks generated pages share ──────────────────────────────
console.log('\n1 · the looks generated pages share');
{
  const PALS = { 'cream and terracotta': ['#f4ede4', '#2b211b', '#b4552d'], 'black and acid green': ['#0b0b0b', '#f2f2f2', '#a6ff00'], 'black and vermilion': ['#111111', '#f5f5f5', '#ff4a1c'], 'white and purple': ['#ffffff', '#111111', '#6d3df5'], 'stone and navy': ['#f7f7f5', '#14213d', '#1f4ea3'], 'no palette': null };
  let n = 0;
  let unasked = 0;
  let moved = 0;
  const langs = new Set();
  const examples = [];
  for (const [pn, pal] of Object.entries(PALS))
    for (const disp of ['Fraunces', 'Space Grotesk'])
      for (const w of SUBJECTS)
        for (const salt of ['p_1', 'p_2']) {
          const b = mk(w, { palette: pal ? [{ hex: pal[0], role: 'background' }, { hex: pal[1], role: 'text' }, { hex: pal[2], role: 'accent' }] : [], typography: { display: disp, body: 'Inter' }, references: salt === 'p_2' ? ['openverse:window'] : [] });
          for (const d of V.proposeDirections({ brief: b, salt })) {
            n++;
            langs.add(d.language);
            const own = d.rationale.some((r) => /Keeps the palette and type pair you approved/.test(r));
            const hits = V.unaskedTells({ colors: d.tokens.colors, fonts: d.tokens.fonts, radius: d.tokens.radius, look: d.look }, w, { ownColours: own });
            if (hits.length) (unasked++, examples.length < 4 && examples.push(`${pn}/${disp}/${d.language}: ${hits.map((h) => h.tell)}`));
            if (d.rationale.some((r) => /a look generated pages share/.test(r))) moved++;
          }
        }
  console.log(`   ${n} directions in ${langs.size} languages: ${unasked} show a look nobody asked for; the engine moved ${moved} off one`);
  ok(`${n} directions: none shows a generated look nobody asked for`, unasked === 0, examples.join(' | '));
  ok('the engine did move directions off them (the check is doing work, not idle)', moved > 0, moved);
  report.looks = { directions: n, languages: langs.size, unasked, movedOff: moved };
}

// ── 2 · each direction's plan ────────────────────────────────────────
console.log('\n2 · each direction’s plan');
const studies = [];
{
  let n = 0;
  let whole = 0;
  let detailed = 0;
  let drawable = 0;
  const sigs = new Map();
  for (const w of SUBJECTS)
    for (let i = 0; i < 6; i++) {
      const b = mk(w, { references: i % 2 ? ['openverse:window', 'openverse:grid'] : [] });
      for (const d of V.proposeDirections({ brief: b, salt: `p_plan_${i}` })) {
        n++;
        const p = d.designPlan;
        if (p && p.colours.length >= 4 && p.colours.length <= 6 && p.type.display && p.layout) whole++;
        if (p?.detail.terms.length) detailed++;
        if (p && V.drawableSignatures(d, V.planContext(b)).includes(p.signature)) drawable++;
        sigs.set(p?.signature, (sigs.get(p?.signature) ?? 0) + 1);
        if (i < 2) studies.push({ w, d, b, spec: V.studySpec(d, b, 'Name', board.refs) });
      }
    }
  const oneMove = studies.filter((s) => { const m = V.loudMoves(s.spec); return m.length <= 1 && m.every((x) => x === s.d.designPlan.signature); }).length;
  const shown = studies.filter((s) => V.loudMoves(s.spec).includes(s.d.designPlan.signature));
  const unshown = studies.filter((s) => !V.loudMoves(s.spec).includes(s.d.designPlan.signature)).slice(0, 4).map((s) => `${s.w.slice(0, 24)}/${s.d.plan}/${s.d.designPlan.signature}`);
  console.log(`   ${n} directions: ${whole} state a whole plan, ${detailed} found a detail only their subject has, ${drawable} have a move they can draw; ${oneMove} of ${studies.length} studies make one loud move at most, and only theirs; ${shown.length} show their move`);
  ok('every direction states a whole plan', whole === n, `${whole}/${n}`);
  ok('every signature is a move the design can draw', drawable === n, `${drawable}/${n}`);
  ok('every drawn study makes at most one loud move, its own', oneMove === studies.length, `${oneMove}/${studies.length}`);
  ok('…and every one shows it: the move the plan names is there to see in the study the designer chooses from', shown.length === studies.length, `${shown.length}/${studies.length} ${unshown.join(' | ')}`);
  report.plans = { directions: n, whole, withSubjectDetail: detailed, drawable, studies: studies.length, oneLoudMoveOrFewer: oneMove, showTheirMove: shown.length, signatures: Object.fromEntries(sigs) };
}

// ── 3 · a design system ──────────────────────────────────────────────
console.log('\n3 · building within a design system');
const DS_CSS = `:root { --color-primary: #0f766e; --color-background: #f8fafc; --color-surface: #ffffff; --color-text: #0f172a; --color-muted: #475569; --color-border: #cbd5e1; --font-heading: "Söhne Breit", sans-serif; --font-body: "Söhne", sans-serif; --radius-sm: 4px; --radius-md: 6px; --font-size-sm: 14px; --font-size-md: 16px; --font-size-lg: 20px; --font-size-xl: 25px; --font-size-2xl: 31px; --space-2: 8px; --space-4: 16px; --space-6: 24px; }`;
const DS_MD = `# Tidewater Design System\n\n## Rules\n- Use the primary colour for one action per screen\n- Never set body text below 16px\n\n## Button\nSolid primary, 44px tall.`;
const ds = V.parseDesignSystem([{ path: 'tokens.css', text: DS_CSS }, { path: 'README.md', text: DS_MD }], { kind: 'file', ref: 'tokens.css, README.md', files: [] }).system;
const dsStudies = [];
{
  let n = 0;
  let kept = 0;
  let conforming = 0;
  for (const w of SUBJECTS.slice(0, 8)) {
    const b = V.briefWithSystem(mk(w, { references: ['openverse:window'] }), ds);
    for (const d of V.proposeDirections({ brief: b, salt: 'p_ds' })) {
      n++;
      if (d.tokens.colors.accent === ds.roles.accent && d.tokens.colors.background === ds.roles.background && d.tokens.fonts.display === V.faceOf(ds, 'display').standIn && d.tokens.radius === V.systemCorners(ds)) kept++;
      const st = V.studySpec(d, b, 'Tidewater', board.refs);
      if (!V.conformance(st, ds).length) conforming++;
      if (dsStudies.length < 12) dsStudies.push({ w, d, spec: st });
    }
  }
  console.log(`   ${ds.name}: its faces drawn with ${ds.fonts.map((f) => `${f.family} → ${f.standIn}`).join(', ')}; ${kept} of ${n} directions keep its colours, faces and corners; ${conforming} of ${n} studies pass the check against it`);
  ok('every direction keeps the system’s colours, faces and corners', kept === n, `${kept}/${n}`);
  ok('every study passes the check against the system', conforming === n, `${conforming}/${n}`);
  report.designSystem = { name: ds.name, faces: ds.fonts, directions: n, keptSystem: kept, conforming, notes: ds.notes };
}

// ── 4 · layout pieces ────────────────────────────────────────────────
console.log('\n4 · layout pieces');
const composedStudies = [];
{
  const SITES = ['A website for a neighbourhood bakery', 'A website for an architecture studio', 'A website for a ceramics studio', 'A website for a small hotel', 'A website for a jazz bar', 'A website for a bookshop', 'A website for a cycling club', 'A website for a botanical garden', 'A website for a family law firm', 'A website for a climbing gym'];
  let n = 0;
  let composed = 0;
  const openings = new Set();
  const composedOpenings = new Set();
  SITES.forEach((w, si) => {
    for (let i = 0; i < 12; i++) {
      const b = mk(w, { references: i % 2 ? ['openverse:window'] : [] });
      for (const d of V.proposeDirections({ brief: b, salt: `p_cp_${si}_${i}` })) {
        n++;
        const st = V.studySpec(d, b, 'Name', board.refs);
        const first = V.structureOf(st)[0] ?? '';
        openings.add(first);
        if (d.plan === 'composed') {
          composed++;
          composedOpenings.add(first);
          if (composedStudies.length < 24) composedStudies.push({ w, d, spec: st });
        }
      }
    }
  });
  console.log(`   ${n} site directions: ${composed} open with a section composed from pieces; ${openings.size} different openings in all, ${composedOpenings.size} of them composed`);
  ok('directions do open with composed sections', composed > 0, composed);
  ok('composed openings are many arrangements, not one (≥ 10)', composedOpenings.size >= 10, composedOpenings.size);
  report.pieces = { siteDirections: n, composed, distinctOpenings: openings.size, distinctComposedOpenings: composedOpenings.size };
}

// ── drawn in a browser ───────────────────────────────────────────────
console.log('\n· drawn in a browser: plan studies, design-system studies, composed openings');
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
const audit = async (html, width) => {
  await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.addScriptTag({ content: V.AUDIT_SOURCE });
  return V.normalizeAudit(await page.evaluate(() => window.__uxv0Audit()));
};
{
  const all = [...studies.slice(0, 30).map((s) => ({ ...s, set: 'plan' })), ...dsStudies.map((s) => ({ ...s, set: 'system' })), ...composedStudies.map((s) => ({ ...s, set: 'pieces' }))];
  let sideways = 0;
  let lowContrast = 0;
  let tellsSeen = 0;
  let noH1 = 0;
  const problems = [];
  for (const s of all) {
    const html = V.renderDesign(s.spec, board.refs, { runtime: true }).html;
    const desk = await audit(html, 1280);
    const phone = await audit(html, 390);
    if (desk.overflowX > 0 || phone.overflowX > 0) (sideways++, problems.push(`${s.set} ${s.w}/${s.d.language}: sideways ${phone.overflowX}px`));
    const low = [...desk.contrast, ...phone.contrast].filter((c) => c.ratio < c.need);
    if (low.length) (lowContrast++, problems.push(`${s.set} ${s.w}/${s.d.language}: ${low[0].text} ${low[0].ratio}:1`));
    const seen = V.designTells(s.spec, desk, { brief: s.set === 'system' ? V.briefWithSystem(mk(s.w), ds) : null, direction: s.d }).filter((h) => ['purple-blue-gradient', 'emoji-markers', 'accent-rail-cards', 'all-centred'].includes(h.tell));
    if (seen.length) (tellsSeen++, problems.push(`${s.set} ${s.w}/${s.d.language}: ${seen.map((h) => h.tell)}`));
    if (s.set === 'pieces' && !desk.headings.some((h) => h.level === 1)) (noH1++, problems.push(`pieces ${s.w}: no h1`));
  }
  console.log(`   ${all.length} studies at 1280 and 390 px: ${sideways} scroll sideways, ${lowContrast} have text below contrast, ${tellsSeen} show a generated look on the page, ${noH1} composed openings lack an h1`);
  ok(`every one of the ${all.length} studies: nothing scrolls sideways`, sideways === 0, problems.filter((p) => /sideways/.test(p)).slice(0, 3).join(' | '));
  ok('every one: each text reads on its ground', lowContrast === 0, problems.filter((p) => /:1$/.test(p)).slice(0, 3).join(' | '));
  ok('no rendered page shows a gradient, emoji markers, accent rails or everything centred', tellsSeen === 0, problems.filter((p) => /gradient|emoji|rail|centred/.test(p)).slice(0, 3).join(' | '));
  ok('every composed opening is the page’s h1', noH1 === 0, problems.filter((p) => /h1/.test(p)).join(' | '));
  ok('no page errors', !errors.length, errors.slice(0, 3).join(' | '));
  report.browser = { studies: all.length, sideways, lowContrast, renderedTells: tellsSeen, composedWithoutH1: noH1, problems: problems.slice(0, 20) };
  // to look at: one composed opening at both widths, and one study built within the system
  const shot = async (spec, name) => {
    for (const w of [1280, 390]) {
      await page.setViewportSize({ width: w, height: w < 600 ? 844 : 900 });
      await page.setContent(V.renderDesign(spec, board.refs, { runtime: true }).html, { waitUntil: 'load' });
      await page.screenshot({ path: `${S}craft-${name}-${w}.png` });
    }
  };
  if (composedStudies[0]) await shot(composedStudies.find((s) => s.spec.sections.some((x) => x.kind === 'compose' && x.images.length))?.spec ?? composedStudies[0].spec, 'composed');
  if (dsStudies[0]) await shot(dsStudies[0].spec, 'design-system');
}
await browser.close();

report.checks = checks;
report.pass = pass;
report.fail = fail;
writeFileSync(`${S}craft-bench.json`, J(report, null, 2));
const md = [
  '# The four methods, measured',
  '',
  `${report.at} · no model calls · ${pass} passed, ${fail} failed`,
  '',
  `- Looks generated pages share: ${report.looks.directions} directions in ${report.looks.languages} languages; ${report.looks.unasked} show one nobody asked for; the engine moved ${report.looks.movedOff} off one.`,
  `- Plans: ${report.plans.whole} of ${report.plans.directions} state a whole plan; ${report.plans.withSubjectDetail} found a detail only their subject has; ${report.plans.drawable} have a move they can draw; ${report.plans.oneLoudMoveOrFewer} of ${report.plans.studies} studies make one loud move at most.`,
  `- Design system (${report.designSystem.name}): ${report.designSystem.keptSystem} of ${report.designSystem.directions} directions keep it; ${report.designSystem.conforming} studies pass the check against it.`,
  `- Layout pieces: ${report.pieces.composed} of ${report.pieces.siteDirections} site directions open with a composed section; ${report.pieces.distinctComposedOpenings} different composed openings (${report.pieces.distinctOpenings} openings in all).`,
  `- In a browser: ${report.browser.studies} studies at 1280 and 390 px; ${report.browser.sideways} scroll sideways, ${report.browser.lowContrast} with text below contrast, ${report.browser.renderedTells} showing a generated look, ${report.browser.composedWithoutH1} composed openings without an h1.`,
  '',
  ...checks.map((c) => `- ${c.ok ? 'ok' : '**FAIL**'} ${c.n}${c.x ? ` — ${c.x}` : ''}`),
].join('\n');
writeFileSync(`${S}craft-bench.md`, md + '\n');
console.log(`\ncraft bench: ${pass} passed, ${fail} failed (report in ${S}craft-bench.md)`);
process.exit(fail ? 1 : 0);
