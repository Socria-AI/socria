// test/browser/ux-v0/overhaul-bench.mjs — the creative-intelligence overhaul, benchmarked offline.
//
// Six briefs (A yoga booking, B experimental architecture studio, C scientific dashboard, D luxury fashion
// editorial, E children's nonprofit, F motion portfolio). For each, with SocriaUX's own code and a real browser,
// and NO model call (nothing is spent):
//
//   1  what is being made: the experience, the task, what it must do — read from the designer's words
//   2  three directions, their studies drawn and measured at 1280 and 390 px, and how different they are in
//      STRUCTURE (lib/ux-v0/structure.ts) as well as in tokens; the same studies without plans, for comparison
//   3  generation, with a deliberately bad answer standing in for the model (the generic landing page that
//      caused the original failure: nav, "Begin", "Read more", a "why us" grid, a footer): what the code makes
//      of it, measured, repaired in bounded rounds, and its working parts self-tested in the browser
//   4  the refinement test (A): type and colour locked; a colour change refused; a layout change; an interaction
//      change; the booking locked through a regeneration; the export opened from a file and used
//   5  cost: ESTIMATES composed from the 124 calls measured in the November evaluation (fx/sol-eval-calls.json),
//      per stage, for each routing; and each premium stage's worst case against the budgets. Nothing here is a
//      measurement of the tiered routing itself: no live call was made.
//
// Writes overhaul-bench.json, overhaul-bench.md and screenshots to UXV0_OUT. Needs test/.tmp (node test/run.mjs).
// Fonts come from Google Fonts when the network allows (free), so the screenshots are faithful.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import { chromium, S, FX, underTest } from './env.mjs';

const V = await underTest();
const J = JSON.stringify;
let pass = 0;
let fail = 0;
const checks = [];
const ok = (n, c, x = '') => {
  checks.push({ n, ok: !!c, x: c ? '' : String(x).slice(0, 400) });
  c ? (pass++, console.log('  ok  ', n)) : (fail++, console.log('  FAIL', n, String(x).slice(0, 400)));
};

const REF = (id) => ({ provider: 'openverse', providerId: id, id: `openverse:${id}`, url: `https://images.example.test/${id}.jpg`, thumb: `https://images.example.test/${id}.jpg`, width: 1600, height: 1067, title: id, creator: 'A', creatorUrl: '', sourceUrl: `https://example.org/${id}`, license: 'CC BY 2.0', licenseUrl: '', attribution: id, category: 'imagery', state: 'kept', asContent: true });
const BRIEFS = [
  { id: 'A', name: 'Yoga booking', words: 'Booking screen for an already-selected yoga class. Members choose a day and a time, then confirm.', audience: 'Members of a small yoga studio', personality: ['warm', 'earthy', 'calm'], visual: 'Warm, earthy, muted terracotta and cream', goals: [], refs: ['window'], expect: { kind: 'booking', screen: true, components: ['booking'] } },
  { id: 'B', name: 'Experimental architecture studio', words: 'A website for an experimental architecture studio: its projects, its thinking, and a way to get in touch.', audience: 'Clients, juries and collaborators', personality: ['experimental', 'rigorous', 'spatial'], visual: 'Raw concrete, a strong grid, monochrome with one signal colour', goals: ['See the projects', 'Understand the approach', 'Get in touch'], refs: ['grid', 'marble'], expect: { kind: 'site', screen: false, components: [] } },
  { id: 'C', name: 'Scientific dashboard', words: 'A scientific dashboard for monitoring lab sensor readings: temperature, humidity and pressure across rooms, with alerts.', audience: 'Lab technicians on shift', personality: ['precise', 'calm', 'trustworthy'], visual: 'Clear, technical, high legibility', goals: [], refs: [], expect: { kind: 'dashboard', screen: true, components: ['stat-cards', 'table'] } },
  { id: 'D', name: 'Luxury fashion editorial', words: 'A luxury fashion editorial story for an autumn collection, read as a magazine feature.', audience: 'Readers of a fashion house’s journal', personality: ['luxurious', 'editorial', 'restrained'], visual: 'Quiet luxury, generous space, serif headlines', goals: ['Read the story', 'See the looks'], refs: ['people', 'dusk'], expect: { kind: 'editorial', screen: false, components: [] } },
  { id: 'E', name: 'Children’s nonprofit', words: 'A website for a children’s nonprofit that funds reading programmes, with a donation form.', audience: 'Parents, teachers and donors', personality: ['hopeful', 'warm', 'trustworthy'], visual: 'Bright, friendly, accessible', goals: ['Understand the programmes', 'Give a donation', 'Volunteer'], refs: ['people'], expect: { kind: 'site', screen: false, components: ['form'] } },
  { id: 'F', name: 'Motion portfolio', words: 'A motion design portfolio to show my work: reels, case studies and how to hire me.', audience: 'Studios and agencies hiring', personality: ['kinetic', 'bold', 'playful'], visual: 'Dark, kinetic, bold type', goals: ['Watch the work', 'Hire me'], refs: ['dusk', 'grid', 'pour'], expect: { kind: 'portfolio', screen: false, components: [] } },
];

const browser = await chromium.launch(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1,images.example.test' } } : {});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.route('https://images.example.test/**', (r) => r.fulfill({ contentType: 'image/jpeg', body: readFileSync(FX + r.request().url().split('/').pop()) }));
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

async function audit(spec, board, width, height) {
  await page.setViewportSize({ width, height });
  await page.setContent(V.renderDesign(spec, board.refs, { runtime: true }).html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.addScriptTag({ content: V.AUDIT_SOURCE });
  return V.normalizeAudit(await page.evaluate(() => window.__uxv0Audit()));
}
/** as the workspace does it: measured at both widths, evaluated, word-free fixes in at most two rounds */
async function inspect(spec, board, ev0) {
  const measure = async (s) => V.evaluateDesign(s, { desktop: await audit(s, board, 1280, 900), phone: await audit(s, board, 390, 844) }, ev0.direction?.locks ?? [], ev0);
  let ev = await measure(spec);
  const fixed = [];
  for (let round = 0; round < V.MAX_REVISION_ROUNDS; round++) {
    const fixes = V.fixesFor(ev);
    if (!fixes.length) break;
    for (const f of fixes) {
      const r = V.applyPatch(spec, f.patch, board);
      if (r.ok) (spec = r.spec), fixed.push(f.patch.summary);
    }
    ev = await measure(spec);
  }
  return { spec, ev, fixed };
}
const shot = async (spec, board, path, width = 1280, full = false) => {
  await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
  await page.setContent(V.renderDesign(spec, board.refs, { runtime: true }).html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path, fullPage: full });
};

// the answer that caused the original failure, written for each brief: a landing page about the brand
const badAnswer = (b) => ({
  title: b.name,
  sections: [
    { id: 'nav', kind: 'nav', content: { brand: b.name, links: ['About', 'Contact'], cta: 'Begin' } },
    { id: 'hero', kind: 'hero', content: { eyebrow: 'Welcome', title: `Welcome to ${b.name}`, subtitle: 'Discover something new.', primary: 'Begin', secondary: 'Read more' } },
    { id: 'why', kind: 'features', content: { title: 'Why us', items: [{ title: 'Quality', text: 'We care about quality.' }, { title: 'Passion', text: 'Made with passion.' }, { title: 'Trust', text: 'Trusted by many.' }] } },
    { id: 'foot', kind: 'footer', content: { brand: b.name } },
  ],
});

const report = { when: new Date().toISOString(), note: 'Offline: no model call was made. Generation used a deliberately bad stand-in answer; cost figures are estimates composed from measured calls.', briefs: [], refinement: null, cost: null };

for (const b of BRIEFS) {
  console.log(`\n${b.id} · ${b.name}`);
  const board = V.normalizeMoodboard({ refs: b.refs.map(REF) });
  const brief0 = V.normalizeBrief({ pageType: 'website', platform: 'web', objective: b.words, audience: b.audience, personality: b.personality, visualDirection: b.visual, palette: [], typography: { display: 'Fraunces', body: 'Inter', rationale: '' }, userGoals: b.goals, functionalRequirements: [], openQuestions: [], references: board.refs.map((r) => r.id) }, new Set(board.refs.map((r) => r.id)));
  const intent = V.settleIntent(V.designerWords(b.words), {});
  const brief = { ...brief0, intent, pageType: V.pageTypeFor(intent, brief0.pageType) };
  const comps = V.requiredComponents(intent);
  // 1 · what is being made
  ok(`${b.id}: read as ${b.expect.kind}${b.expect.screen ? ', a screen' : ''}`, intent.kind === b.expect.kind && intent.screen === b.expect.screen, J({ kind: intent.kind, screen: intent.screen, signals: intent.signals }));
  ok(`${b.id}: it must have ${b.expect.components.join(', ') || 'no particular component'}`, J([...comps].sort()) === J([...b.expect.components].sort()), J(comps));
  // 2 · three directions, drawn and measured
  const dirs = V.proposeDirections({ brief });
  const studies = dirs.map((d) => V.studySpec(d, brief, b.name, board.refs));
  const flat = dirs.map((d) => V.studySpec({ ...d, compose: undefined, order: undefined, lead: undefined, plan: undefined }, brief, b.name, board.refs));
  const dv = V.diversityOf(studies);
  const fv = V.diversityOf(flat);
  const studyEvals = [];
  for (let i = 0; i < studies.length; i++) {
    const ev = V.evaluateDesign(studies[i], { desktop: await audit(studies[i], board, 1280, 900), phone: await audit(studies[i], board, 390, 844) }, [], { direction: dirs[i], brief, board });
    studyEvals.push({ quality: ev.quality, high: ev.findings.filter((f) => f.severity === 'high').map((f) => f.message), findings: ev.findings.map((f) => `${f.severity} ${f.kind}: ${f.message}`) });
    await shot(studies[i], board, `${S}bench-${b.id}-study-${i + 1}.png`);
  }
  ok(`${b.id}: three directions, three plans`, new Set(dirs.map((d) => d.plan)).size === 3, J(dirs.map((d) => d.plan)));
  ok(`${b.id}: the studies differ in structure (closest pair ${dv.minStructure}; ${fv.minStructure} without plans)`, dv.minStructure >= 0.33 && dv.minStructure > fv.minStructure, J(dv.pairs));
  ok(`${b.id}: every study carries what the work must have`, studies.every((s) => comps.every((c) => s.sections.some((x) => x.kind === c))), J(studies.map((s) => s.sections.map((x) => x.kind))));
  // 3 · generation from the bad stand-in answer
  const gen = V.parseGenerate(badAnswer(b), brief, board, 1, 'benchmark', dirs[0]);
  const inspected = await inspect(gen, board, { direction: dirs[0], brief, board });
  const final = inspected.spec;
  const html = V.renderDesign(final, board.refs, { runtime: true }).html;
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.setContent(html, { waitUntil: 'load' });
  const self = await page.evaluate(() => (window.__uxBehaviors ? window.__uxBehaviors.selfTest() : []));
  await shot(final, board, `${S}bench-${b.id}-generated.png`, 1280, true);
  await shot(final, board, `${S}bench-${b.id}-generated-phone.png`, 390, true);
  const kinds = final.sections.map((x) => x.kind);
  ok(`${b.id}: the bad answer becomes ${intent.screen ? 'the screen itself (no nav, hero, "why us" or footer)' : 'a page with what it must have'}`, comps.every((c) => kinds.includes(c)) && (!intent.screen || !kinds.some((k) => ['nav', 'hero', 'features', 'footer'].includes(k))) && final.pageType === V.pageTypeFor(intent, 'website'), J(kinds));
  ok(`${b.id}: its working parts pass their self-test in the browser`, self.every((t) => !t.problems.length), J(self));
  const stock = [...html.matchAll(/>(Begin|Read more|Why us|Welcome to [^<]+)</g)].map((m) => m[1]);
  report.briefs.push({
    id: b.id,
    name: b.name,
    intent: { kind: intent.kind, screen: intent.screen, task: intent.task, requirements: intent.requirements.map((r) => `${r.id}${r.component ? `→${r.component}` : ''}`), signals: intent.signals },
    directions: dirs.map((d, i) => ({ language: d.language, name: d.name, plan: d.plan, structure: V.structureOf(studies[i]).join(' > '), quality: studyEvals[i].quality, high: studyEvals[i].high, findings: studyEvals[i].findings })),
    diversity: { minStructure: dv.minStructure, minTokens: dv.minTokens, minStructureWithoutPlans: fv.minStructure, pairs: dv.pairs },
    generated: { from: 'the generic landing page (a deliberately bad stand-in for the model)', sections: final.sections.map((x) => `${x.kind}/${x.variant}`), notes: final.notes, fixedAutomatically: inspected.fixed, quality: inspected.ev.quality, high: inspected.ev.findings.filter((f) => f.severity === 'high').map((f) => f.message), findings: inspected.ev.findings.map((f) => `${f.severity} ${f.kind}: ${f.message}`), selfTest: self, stockPhrasesLeft: stock },
  });
}

// 4 · the refinement test, on A
console.log('\nrefinement: lock type and colour, change the layout, change the interaction, lock and regenerate, export');
{
  const b = BRIEFS[0];
  const board = V.normalizeMoodboard({ refs: b.refs.map(REF) });
  const intent = V.settleIntent(V.designerWords(b.words), {});
  const brief = { ...V.normalizeBrief({ pageType: 'website', platform: 'web', objective: b.words, audience: b.audience, personality: b.personality, visualDirection: b.visual, palette: [], typography: { display: 'Fraunces', body: 'Inter', rationale: '' }, userGoals: [], functionalRequirements: [], openQuestions: [], references: board.refs.map((r) => r.id) }, new Set(board.refs.map((r) => r.id))), intent, pageType: 'app-screen' };
  const dir = { ...V.proposeDirections({ brief })[0], locks: ['palette', 'type'] };
  const spec0 = V.parseGenerate(badAnswer(b), brief, board, 1, 'benchmark', dir);
  const tokens0 = J({ colors: spec0.tokens.colors, fonts: spec0.tokens.fonts });
  const bk = spec0.sections.find((x) => x.kind === 'booking');
  const colour = { op: 'tokens', tokens: { colors: { accent: '#0047ff' } }, summary: 'A blue accent' };
  ok('type and colour locked: a colour change is caught as a change to the locked palette', J(V.lockedChanges(spec0, colour, dir.locks)) === J(['palette']));
  const layout = V.applyPatch(spec0, { op: 'variant', sectionId: bk.id, variant: bk.variant === 'calendar' ? 'split' : 'calendar', summary: 'Another layout' }, board);
  ok('a layout change applies, and leaves the locked type and colour exactly as they were', layout.ok && J({ colors: layout.spec.tokens.colors, fonts: layout.spec.tokens.fonts }) === tokens0 && !V.lockedChanges(spec0, { op: 'variant', sectionId: bk.id, variant: 'calendar', summary: '' }, dir.locks).length);
  const inter = V.applyPatch(layout.spec, { op: 'variant', sectionId: bk.id, variant: 'list', summary: 'Every day and time in one list' }, board);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.setContent(V.renderDesign(inter.spec, board.refs, { runtime: true }).html, { waitUntil: 'load' });
  const interaction = await page.evaluate(() => ({ dayPickers: document.querySelectorAll('input[name$="-day"]').length, hiddenDays: document.querySelectorAll('.bk-times[hidden]').length, days: document.querySelectorAll('.bk-times').length }));
  ok('an interaction change: from choosing a day then a time, to every day and time in one list', inter.ok && interaction.dayPickers === 0 && interaction.hiddenDays === 0 && interaction.days >= 3, J(interaction));
  await page.click('.bk-times .bk-slot:not(.is-full) >> nth=2');
  await page.click('[data-ux-confirm]');
  await page.waitForSelector('[data-ux-done]:not([hidden])', { timeout: 3000 }).catch(() => null);
  ok('…and the new interaction works: choose, confirm, confirmed', await page.isVisible('[data-ux-done]'));
  const locked = V.setLocked(inter.spec, bk.id, true);
  const again = V.holdLocked(V.parseGenerate(badAnswer(b), brief, board, 2, 'benchmark again', dir), locked);
  ok('the booking locked, then regenerated: it comes through exactly as it was', J(again.spec.sections.find((x) => x.kind === 'booking')) === J(locked.sections.find((x) => x.id === bk.id)), J(again.spec.sections.map((x) => `${x.kind}/${x.variant}`)));
  const exported = V.renderDesign(again.spec, board.refs, { motion: 'play', runtime: true }).html;
  writeFileSync(`${S}bench-A-export.html`, exported);
  const ex = await ctx.newPage();
  const exErrors = [];
  ex.on('pageerror', (e) => exErrors.push(String(e)));
  await ex.goto(pathToFileURL(`${S}bench-A-export.html`).href, { waitUntil: 'load' });
  await ex.click('.bk-times .bk-slot:not(.is-full) >> nth=0');
  const time = (await ex.locator('.bk-slot:has(input:checked) .bk-time').textContent()).trim();
  await ex.click('[data-ux-confirm]');
  await ex.waitForSelector('[data-ux-done]:not([hidden])', { timeout: 3000 }).catch(() => null);
  const doneText = (await ex.textContent('[data-ux-done]')) ?? '';
  const exportedTokens = await ex.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
  ok('the export, opened as a file, works on its own: choose, confirm, the time confirmed, no errors', doneText.includes(time) && /no booking was made/i.test(doneText) && !exErrors.length, J({ time, doneText: doneText.slice(0, 120), exErrors }));
  ok('…and it keeps the locked colour', exportedTokens.toLowerCase() === spec0.tokens.colors.accent.toLowerCase(), `${exportedTokens} vs ${spec0.tokens.colors.accent}`);
  await ex.screenshot({ path: `${S}bench-A-export-done.png` });
  await ex.close();
  report.refinement = { locks: dir.locks, layout: layout.spec.sections.find((x) => x.kind === 'booking').variant, interaction: 'list', exported: `${S}bench-A-export.html`, checks: checks.slice(-7) };
}

// 5 · cost: estimates composed from measured calls
console.log('\ncost: estimates from the calls measured in November (no live call made here)');
{
  const { calls } = JSON.parse(readFileSync(FX + 'sol-eval-calls.json', 'utf8'));
  const STAGES = ['discover', 'direction', 'brief', 'art-direction', 'generate', 'refine', 'critique'];
  const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
  const per = (setup, kind, key) => median(calls.filter((c) => c.setup === setup && c.kind === kind && c.ok).map((c) => c[key]));
  const table = STAGES.map((k) => ({ stage: k, luna: per('luna', k, 'cost'), solMedium: per('sol-medium', k, 'cost'), solHigh: per('sol-high', k, 'cost'), lunaMs: per('luna', k, 'ms'), solMediumMs: per('sol-medium', k, 'ms'), solHighMs: per('sol-high', k, 'ms') }));
  const routed = V.routingTable({});
  const tierOf = (k) => routed.find((r) => r.stage === k)?.tier;
  const sum = (f) => Math.round(table.reduce((t, r) => t + f(r), 0) * 1e5) / 1e5;
  const routings = {
    'GPT-6 Luna everywhere (before routing)': { usd: sum((r) => r.luna), seconds: Math.round(sum((r) => r.lunaMs) / 1000) },
    'GPT-6.1 Sol at high everywhere (legacy SOCRIAUX_MODEL)': { usd: sum((r) => r.solHigh), seconds: Math.round(sum((r) => r.solHighMs) / 1000) },
    'GPT-6.1 Sol at medium everywhere': { usd: sum((r) => r.solMedium), seconds: Math.round(sum((r) => r.solMediumMs) / 1000) },
    'Tiered routing (the new default)': { usd: sum((r) => (tierOf(r.stage) === 'premium' ? r.solMedium : r.luna)), seconds: Math.round(sum((r) => (tierOf(r.stage) === 'premium' ? r.solMediumMs : r.lunaMs)) / 1000) },
  };
  // the worst a premium call can cost, against the per-call budget (prompt sizes from this benchmark's own prompts)
  const b = BRIEFS[0];
  const brief = V.normalizeBrief({ pageType: 'website', platform: 'web', objective: b.words, audience: b.audience, personality: b.personality, visualDirection: b.visual, palette: [], typography: { display: 'Fraunces', body: 'Inter' } }, new Set());
  brief.intent = V.settleIntent(b.words, {});
  const genChars = V.generateSystem(brief, V.proposeDirections({ brief })[0]).length + 4000;
  const worst = routed.map((r) => ({ stage: r.stage, tier: r.tier, model: r.model, effort: r.effort ?? 'default', worstUsd: V.worstCost(r, r.stage === 'generate' ? genChars : 8000) }));
  const B = V.budgets({});
  ok('cost: every stage has a measured median on each model it can run on', table.every((r) => r.luna != null && r.solMedium != null && r.solHigh != null));
  ok('cost: each premium stage\'s worst case fits under the per-call budget', worst.filter((w) => w.tier === 'premium').every((w) => w.worstUsd != null && w.worstUsd <= B.operationUsd), J(worst));
  report.cost = { label: 'ESTIMATE: medians of the calls measured in the November 2026 evaluation (fx/sol-eval-calls.json), one call per stage per project, composed for each routing. The tiered routing itself was not run live.', perStageMedians: table, perProject: routings, worstCase: worst, budgets: B };
  console.log(J(routings, null, 1));
}

ok('no page errors anywhere', !errors.length, errors.join(' | '));
await browser.close();

report.checks = checks;
writeFileSync(`${S}overhaul-bench.json`, J(report, null, 2));
const md = [
  `# SocriaUX overhaul benchmark (${report.when})`,
  '',
  report.note,
  '',
  '| Brief | Read as | Must have | Directions (plan) | Closest pair: structure / tokens (without plans) | Generated from the bad answer | Self-test |',
  '|---|---|---|---|---|---|---|',
  ...report.briefs.map((x) => `| ${x.id} ${x.name} | ${x.intent.kind}${x.intent.screen ? ' (screen)' : ''} | ${x.intent.requirements.join(', ') || '—'} | ${x.directions.map((d) => `${d.language}: ${d.plan}`).join('; ')} | ${x.diversity.minStructure} / ${x.diversity.minTokens} (${x.diversity.minStructureWithoutPlans}) | ${x.generated.sections.join(' › ')} | ${x.generated.selfTest.length ? (x.generated.selfTest.every((t) => !t.problems.length) ? 'works' : 'problems') : 'n/a'} |`),
  '',
  '## Cost per project, seven stages (ESTIMATE from measured calls)',
  '',
  '| Routing | US$ | Model seconds |',
  '|---|---|---|',
  ...Object.entries(report.cost.perProject).map(([k, v]) => `| ${k} | ${v.usd.toFixed(4)} | ${v.seconds} |`),
  '',
  `${pass} checks passed, ${fail} failed.`,
].join('\n');
writeFileSync(`${S}overhaul-bench.md`, md);
console.log(`\noverhaul bench: ${pass} passed, ${fail} failed (report and screenshots in ${S})`);
process.exit(fail ? 1 : 0);
