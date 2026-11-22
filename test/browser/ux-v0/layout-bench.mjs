// test/browser/ux-v0/layout-bench.mjs — is each design really its own, and does it do what the designer decided?
//
// Measured with SocriaUX's own code and a real browser, and NO model call (nothing is spent):
//
//   1  one brief: the same project draws the same directions every time; another project draws other ones
//   2  twenty booking briefs, each its own project: how many distinct booking structures among their 60
//      directions (lib/ux-v0/structure.ts structureOf: the parts, the layout of each and how it is set), next
//      to the same directions measured as the engine drew them before (no settings, no project salt)
//   3  one brief in twenty projects: how many distinct structures
//   4  decisions honoured in every direction of every brief: what leads, the alignment, the arrangement, no pictures
//   5  the generated look, where nothing was decided: centred openings, rounded cards everywhere
//   6  every booking study drawn in a browser at 1280 and 390 px: nothing scrolls sideways, every text reads on
//      its ground (the rendered-page audit), and the runtime's own self-test (choose a time, confirm, change)
//
// Writes layout-bench.json and layout-bench.md to UXV0_OUT. Needs test/.tmp (node test/run.mjs builds it).
// Offline: images come from fx/, fonts are not fetched.
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

const REF = (id) => ({ provider: 'openverse', providerId: id, id: `openverse:${id}`, url: `https://images.example.test/${id}.jpg`, thumb: `https://images.example.test/${id}.jpg`, width: 1600, height: 1067, title: id, creator: 'A', creatorUrl: '', sourceUrl: `https://example.org/${id}`, license: 'CC BY 2.0', licenseUrl: '', attribution: id, category: 'imagery', state: 'kept', asContent: true });
const board = V.normalizeMoodboard({ refs: [REF('window'), REF('grid'), REF('people'), REF('dusk')] });
const KEPT = new Set(board.refs.map((r) => r.id));
const mk = (objective, extra = {}) => {
  const b = V.normalizeBrief({ pageType: 'website', platform: 'web', objective, audience: 'members', personality: ['warm', 'calm'], visualDirection: 'warm earthy', palette: [], typography: { display: 'Fraunces', body: 'Inter' }, userGoals: ['Book a time', 'See the prices'], ...extra }, KEPT);
  b.intent = V.settleIntent(V.briefWords(b), {});
  return b;
};
const sigOf = (d) => `${d.language}/${d.plan}/${d.tokens.fonts.display}+${d.tokens.fonts.body}/${d.tokens.colors.accent}`;
const structure = (s) => V.structureOf(s).join(' > ');
const report = { at: new Date().toISOString(), model_calls: 0 };

// ── 1 · one brief, one project, two projects ──────────────────────────
console.log('\n1 · the same brief');
{
  const b = mk('Booking screen for a yoga class');
  const one = V.proposeDirections({ brief: b, salt: 'p_alpha' });
  ok('one project draws the same three directions every time', J(one) === J(V.proposeDirections({ brief: b, salt: 'p_alpha' })));
  const two = V.proposeDirections({ brief: b, salt: 'p_beta' });
  const s1 = one.map((d) => structure(V.studySpec(d, b, 'X', board.refs)));
  const s2 = two.map((d) => structure(V.studySpec(d, b, 'X', board.refs)));
  ok('another project with the same brief draws other structures', J(s1) !== J(s2), J([s1, s2]));
  report.sameBrief = { projectA: s1, projectB: s2 };
}

// ── 2 · twenty booking briefs, each its own project ───────────────────
console.log('\n2 · twenty booking briefs');
const WORDS = ['yoga class', 'pilates session', 'climbing slot', 'pottery workshop', 'tennis court', 'massage', 'haircut', 'swim lesson', 'dance class', 'boxing class', 'spin class', 'museum tour', 'cooking class', 'sauna slot', 'surf lesson', 'piano lesson', 'escape room', 'barber chair', 'desk booking', 'meeting room'];
const PERSONAS = [['warm', 'calm'], ['bold', 'loud'], ['precise', 'clear'], ['playful', 'bright'], ['luxurious', 'quiet']];
const VISUALS = ['warm earthy', 'loud poster', 'technical grid', 'bright friendly', 'quiet luxury'];
const briefs = WORDS.map((w, i) => mk(`Booking screen for a ${w}`, { personality: PERSONAS[i % 5], visualDirection: VISUALS[i % 5], references: i % 2 ? ['openverse:window'] : [] }));
const studies = [];
{
  const now = new Map();
  const before = new Map();
  const looks = new Set();
  briefs.forEach((b, i) => {
    for (const d of V.proposeDirections({ brief: b, salt: `p_${i}_${WORDS[i].replace(/\W+/g, '-')}` })) {
      const s = V.studySpec(d, b, WORDS[i], board.refs);
      const k = structure(s);
      now.set(k, (now.get(k) ?? 0) + 1);
      looks.add(sigOf(d));
      studies.push({ brief: WORDS[i], language: d.language, spec: s, structure: k });
    }
    // as the engine drew them before: no project salt, no settings
    for (const d of V.proposeDirections({ brief: b })) {
      const k = structure(V.studySpec({ ...d, shapes: undefined }, b, WORDS[i], board.refs));
      before.set(k, (before.get(k) ?? 0) + 1);
    }
  });
  const top = [...now.values()].sort((a, b) => b - a)[0];
  console.log(`   60 directions: ${now.size} distinct booking structures now (${before.size} without settings or salt); ${looks.size} distinct looks; the most repeated structure appears ${top}×`);
  // a regression guard at what was measured when this was built (46 of 60; 5 before): booking screens are one
  // component, and each language keeps a deliberately narrow range, so this is near what the settings can give
  ok('60 directions from 20 booking briefs: at least 45 distinct structures (5 before settings and salt)', now.size >= 45, `${now.size} distinct`);
  ok('no structure appears more than three times', top <= 3, `${top}×`);
  report.twentyBriefs = { directions: 60, distinctStructures: now.size, distinctWithoutSettingsOrSalt: before.size, distinctLooks: looks.size, mostRepeated: top };
}

// ── 3 · one brief in twenty projects ──────────────────────────────────
console.log('\n3 · one brief in twenty projects');
{
  const b = mk('Booking screen for a yoga class', { references: ['openverse:window'] });
  const seen = new Map();
  const firsts = [];
  const threes = [];
  for (let i = 0; i < 20; i++) {
    const ks = V.proposeDirections({ brief: b, salt: `p_same_${i}` }).map((d) => structure(V.studySpec(d, b, 'Yoga', board.refs)));
    for (const k of ks) seen.set(k, 1 + (seen.get(k) ?? 0));
    firsts.push(ks[0]);
    threes.push([...ks].sort().join(' || '));
  }
  const top = [...seen.values()].sort((a, b) => b - a)[0];
  // what a person sees first: of every two projects with this brief, how often the first direction is laid out the same
  let pairs = 0;
  let sameFirst = 0;
  let sameThree = 0;
  for (let i = 0; i < 20; i++) for (let j = i + 1; j < 20; j++) (pairs++, (sameFirst += firsts[i] === firsts[j] ? 1 : 0), (sameThree += threes[i] === threes[j] ? 1 : 0));
  console.log(`   60 directions: ${seen.size} distinct structures; the most repeated appears ${top}×; of ${pairs} pairs of projects, ${sameFirst} share the first direction's structure, ${sameThree} all three`);
  ok('the same brief in 20 projects: at least 40 distinct structures among 60 directions', seen.size >= 40, `${seen.size} distinct`);
  ok('no two projects with the same brief get the same three structures', sameThree === 0, `${sameThree} pairs`);
  report.oneBriefTwentyProjects = { directions: 60, distinctStructures: seen.size, mostRepeated: top, pairs, pairsSameFirst: sameFirst, pairsSameThree: sameThree };
}

// ── 4 · decisions honoured ────────────────────────────────────────────
console.log('\n4 · what the designer decided, in every direction');
{
  const DECIDED = [
    ['the class first', { lead: 'subject' }, (s) => { const b = s.sections.find((x) => x.kind === 'booking'); return b?.variant === 'split' && b.shape?.summary === 'card'; }],
    ['the times first', { lead: 'task' }, (s) => { const b = s.sections.find((x) => x.kind === 'booking'); return ['strip', 'calendar', 'list'].includes(b?.variant) && b.shape?.summary !== 'card'; }],
    ['centred', { align: 'center' }, (s) => s.sections.find((x) => x.kind === 'booking')?.shape?.align === 'center'],
    ['uneven', { arrangement: 'asymmetric' }, (s) => { const b = s.sections.find((x) => x.kind === 'booking'); const r = b?.shape?.ratio; return ['split', 'calendar'].includes(b?.variant) && (r <= 0.38 || r >= 0.56); }],
    ['no pictures', { pictures: 'none' }, (s) => s.sections.every((x) => !x.images.length)],
  ];
  report.decisions = {};
  for (const [what, layout, holds] of DECIDED) {
    let total = 0;
    let held = 0;
    const misses = [];
    briefs.forEach((b0, i) => {
      const b = { ...b0, layout };
      for (const d of V.proposeDirections({ brief: b, salt: `p_dec_${i}` })) {
        total++;
        const s = V.studySpec(d, b, WORDS[i], board.refs);
        if (holds(s)) held++;
        else misses.push(`${WORDS[i]}/${d.language}: ${structure(s)}`);
      }
    });
    ok(`${what}: held in ${held} of ${total} directions`, held === total, misses.slice(0, 4).join(' | '));
    report.decisions[what] = { held, total };
  }
  // a site: what leads, and the alignment
  const SITES = ['A website for an experimental architecture studio', 'A website for a neighbourhood bakery', 'A website for a jazz trio', 'A website for a ceramics studio', 'A website for a cycling club', 'A website for a family law firm', 'A website for a botanical garden', 'A website for a small hotel', 'A website for a bookshop', 'A website for a climbing gym'];
  let total = 0;
  let held = 0;
  const misses = [];
  SITES.forEach((w, i) => {
    const b = { ...mk(w, { userGoals: ['See the work', 'Get in touch'], references: ['openverse:grid', 'openverse:people'] }), layout: { lead: 'work', align: 'center' } };
    for (const d of V.proposeDirections({ brief: b, salt: `p_site_${i}` })) {
      total++;
      const s = V.studySpec(d, b, w, board.refs);
      const after = s.sections.filter((x) => !['nav', 'app-nav'].includes(x.kind));
      const hero = s.sections.find((x) => x.kind === 'hero');
      if (after[0]?.kind === 'gallery' && (!hero || hero.shape?.align === 'center' || !V.SHAPE_EFFECTIVE.hero[hero.variant]?.includes('align'))) held++;
      else misses.push(`${w}/${d.language}: ${structure(s)}`);
    }
  });
  ok(`a site, the work first and centred: held in ${held} of ${total} directions`, held === total, misses.slice(0, 4).join(' | '));
  report.decisions['a site: the work first, centred'] = { held, total };
}

// ── 5 · the generated look, where nothing was decided ─────────────────
console.log('\n5 · the habits of generated pages, where nothing was decided');
{
  const SITES = ['A website for an experimental architecture studio', 'A website for a neighbourhood bakery', 'A website for a jazz trio', 'A website for a ceramics studio', 'A website for a cycling club', 'A website for a family law firm', 'A website for a botanical garden', 'A website for a small hotel', 'A website for a bookshop', 'A website for a climbing gym'];
  let openings = 0;
  let centred = 0;
  let rounded = 0;
  const why = [];
  SITES.forEach((w, i) => {
    const b = mk(w, { userGoals: ['See the work', 'Get in touch'], references: i % 2 ? ['openverse:grid'] : [] });
    for (const d of V.proposeDirections({ brief: b, salt: `p_gen_${i}` })) {
      const s = V.studySpec(d, b, w, board.refs);
      const hero = s.sections.find((x) => x.kind === 'hero');
      if (!hero) continue;
      openings++;
      const isCentred = hero.variant === 'centered' || (hero.shape?.align === 'center' && V.SHAPE_EFFECTIVE.hero[hero.variant]?.includes('align'));
      if (isCentred && !(V.ON_PURPOSE[d.language] ?? []).includes('centred')) (centred++, why.push(`${w}/${d.language}/${hero.variant}`));
      if (s.look?.containers === 'cards' && s.tokens.radius === 'round' && !(V.ON_PURPOSE[d.language] ?? []).includes('rounded')) rounded++;
    }
  });
  ok(`no centred opening nobody chose (${openings} openings across 10 site briefs)`, centred === 0, why.join(' | '));
  ok('no rounded cards everywhere nobody chose', rounded === 0, `${rounded}`);
  report.generic = { openings, centredUnchosen: centred, roundedUnchosen: rounded };
}

// ── 6 · drawn in a browser: audit and self-test ───────────────────────
console.log('\n6 · every booking study, drawn and used in a browser');
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
const audit = async (html, width, height) => {
  await page.setViewportSize({ width, height });
  await page.setContent(html, { waitUntil: 'load' });
  await page.addScriptTag({ content: V.AUDIT_SOURCE });
  return V.normalizeAudit(await page.evaluate(() => window.__uxv0Audit()));
};
{
  let drawn = 0;
  let sideways = 0;
  let lowContrast = 0;
  let selfOk = 0;
  const problems = [];
  for (const st of studies) {
    const html = V.renderDesign(st.spec, board.refs, { runtime: true }).html;
    const desk = await audit(html, 1280, 900);
    const phone = await audit(html, 390, 844);
    drawn++;
    if (phone.overflowX > 0 || desk.overflowX > 0) (sideways++, problems.push(`${st.brief}/${st.language}: scrolls sideways (${phone.overflowX}px)`));
    const low = [...desk.contrast, ...phone.contrast].filter((c) => c.ratio < c.need);
    if (low.length) (lowContrast++, problems.push(`${st.brief}/${st.language}: ${low.length} texts below contrast (${low[0].path} ${low[0].ratio}:1)`));
    // the runtime's own check: choose a time, confirm, see the confirmation, change it
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.setContent(html, { waitUntil: 'load' });
    const self = await page.evaluate(() => window.__uxBehaviors?.selfTest?.() ?? null);
    if (self && self.length >= 1 && self.every((x) => !x.problems.length)) selfOk++;
    else problems.push(`${st.brief}/${st.language}: self-test ${J(self)}`);
  }
  console.log(`   ${drawn} studies drawn at 1280 and 390 px: ${sideways} scroll sideways, ${lowContrast} have text below contrast, ${selfOk} pass the booking self-test`);
  ok(`every one of the ${drawn} booking studies: nothing scrolls sideways`, sideways === 0, problems.filter((p) => /sideways/.test(p)).slice(0, 4).join(' | '));
  ok(`every one: each text reads on its ground`, lowContrast === 0, problems.filter((p) => /contrast/.test(p)).slice(0, 4).join(' | '));
  ok(`every one: the booking works (choose, confirm, change)`, selfOk === drawn, problems.filter((p) => /self-test/.test(p)).slice(0, 4).join(' | '));
  ok('no page errors', !errors.length, errors.slice(0, 3).join(' | '));
  report.browser = { drawn, sideways, lowContrast, selfTestPassed: selfOk, problems: problems.slice(0, 20) };

  // a few to look at: the same brief in three projects
  const b = mk('Booking screen for a yoga class', { references: ['openverse:window'] });
  for (const [i, salt] of ['p_one', 'p_two', 'p_three'].entries()) {
    const d = V.proposeDirections({ brief: b, salt })[0];
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.setContent(V.renderDesign(V.studySpec(d, b, 'Yoga', board.refs), board.refs, { runtime: true }).html, { waitUntil: 'load' });
    await page.screenshot({ path: `${S}layout-same-brief-project-${i + 1}.png` });
  }
}
await browser.close();

report.checks = checks;
report.pass = pass;
report.fail = fail;
writeFileSync(`${S}layout-bench.json`, J(report, null, 2));
const md = [
  '# Layout benchmark',
  '',
  `${report.at} · no model calls · ${pass} passed, ${fail} failed`,
  '',
  `- One brief: the same project draws the same directions; another project draws other structures.`,
  `- 20 booking briefs, 60 directions: **${report.twentyBriefs.distinctStructures} distinct booking structures** (${report.twentyBriefs.distinctWithoutSettingsOrSalt} without settings or project salt), ${report.twentyBriefs.distinctLooks} distinct looks; the most repeated structure appears ${report.twentyBriefs.mostRepeated}×.`,
  `- One brief in 20 projects, 60 directions: **${report.oneBriefTwentyProjects.distinctStructures} distinct structures**; of ${report.oneBriefTwentyProjects.pairs} pairs of projects, ${report.oneBriefTwentyProjects.pairsSameFirst} share the first direction's structure and ${report.oneBriefTwentyProjects.pairsSameThree} all three (colours and type are the brief's, so they are shared when the brief sets them).`,
  `- Decisions held: ${Object.entries(report.decisions).map(([k, v]) => `${k} ${v.held}/${v.total}`).join('; ')}.`,
  `- Where nothing was decided: ${report.generic.centredUnchosen} centred openings nobody chose (of ${report.generic.openings}), ${report.generic.roundedUnchosen} rounded-cards-everywhere.`,
  `- In a browser: ${report.browser.drawn} booking studies at 1280 and 390 px; ${report.browser.sideways} scroll sideways, ${report.browser.lowContrast} with text below contrast, ${report.browser.selfTestPassed} pass the booking self-test.`,
  '',
  ...checks.map((c) => `- ${c.ok ? 'ok' : '**FAIL**'} ${c.n}${c.x ? ` — ${c.x}` : ''}`),
].join('\n');
writeFileSync(`${S}layout-bench.md`, md + '\n');
console.log(`\nlayout bench: ${pass} passed, ${fail} failed (report in ${S}layout-bench.md)`);
process.exit(fail ? 1 : 0);
