// SocriaUX on GPT-6.1 Sol: a creative-quality test of the Starting Fresh workflow, against the REAL model.
//
// For each of the six dogfood projects (./dogfood-projects.mjs) and each setup (Sol at effort high, Sol at
// medium, and with --baseline GPT-6 Luna as SocriaUX runs today), it walks the workflow with the app's own
// prompts, parsers, renderer and checks, nothing re-implemented:
//
//   1 questions      lib/ux-v0/discovery.ts  discoverSystem → parseDiscover; answered from the project's
//                    own brief (or "You decide"), as a designer would
//   2 brief          design.ts briefSystem → parseBrief, with the moodboard (inspiring references with
//                    notes, one to steer away from, pictures for the page)
//   3 moodboard      discovery.ts directionSystem: another direction for the imagery
//   4 direction      direction.ts proposeDirections (the engine) → directSystem → parseDirections
//   5 generation     design.ts generateSystem in the first direction → parseGenerate; then drawn at 1280
//                    and 390 px, measured in the page (the workspace's audit), evaluated, and given the
//                    same two rounds of word-free fixes the workspace applies before showing a design
//   6 refinement     a targeted change on the canvas: the hero headline selected, a comment, one patch
//   7 critique       the primary button selected, with a crop of it, through the critique gate
//
// What it measures, per step: whether the answer parsed and held together, how long it took, the tokens
// (reasoning included) and what they cost, whether the answer was cut short or refused; and for the work
// itself: questions asked and whether they offer options; the brief's words against the project's own;
// whether the moodboard's notes reached the brief; the directions' names against generic ones; the page's
// quality, distinctiveness and fidelity scores, its stock phrases, placeholders and overflows; whether a
// targeted change touched only its section; whether a critique cited evidence. Taste is not scored: the
// screenshots (sol-eval-*.png, sol-eval-sheet.png) are for a person to look at.
//
// IT COSTS MONEY. Nothing is sent without --yes. It prints the most it could spend first, and stops when
// what it has spent passes --max-usd (default 10). Needs OPENAI_API_KEY and network access to
// api.openai.com (HTTPS_PROXY is used when set), and test/.tmp (node test/run.mjs builds it).
//
//   node test/browser/ux-v0/sol-eval.mjs --yes [--projects=socria-promo,portfolio] [--efforts=high,medium]
//        [--baseline] [--max-usd=10] [--fallback]
//   node test/browser/ux-v0/sol-eval.mjs --dry-run     the plumbing, against the strict fake: no network,
//                                                      no cost, canned answers (NOT a test of the model)
//
// --fallback lets the ladder answer when Sol is refused (as the app does); without it a refusal of Sol is
// a failure, so every result reported as Sol is Sol.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, S, FX, ROOT, underTest } from './env.mjs';
import { projectsFor } from './dogfood-projects.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => (a.includes('=') ? a.replace(/^--/, '').split('=') : [a.replace(/^--/, ''), true])));
const DRY = !!args['dry-run'];
const MAX_USD = Number(args['max-usd'] ?? 10);
const EFFORTS = String(args.efforts ?? 'high,medium').split(',').filter(Boolean);

const V = await underTest();
const U = await import(pathToFileURL(join(ROOT, 'test/.tmp/openai-usage.mjs')).href);
const { PROJECTS, ref } = projectsFor(V);
const projects = args.projects ? PROJECTS.filter((p) => String(args.projects).split(',').includes(p.id)) : PROJECTS;

const SETUPS = [
  ...EFFORTS.map((e) => ({ label: `sol-${e}`, env: { SOCRIAUX_MODEL: 'gpt-6.1-sol', SOCRIAUX_EFFORT: e } })),
  ...(args.baseline ? [{ label: 'luna', env: { SOCRIAUX_MODEL: 'gpt-6-luna' } }] : []),
];

// the most a run could cost: every call writing its whole cap, reasoning room included, at the model's price
const KINDS = ['discover', 'brief', 'direction', 'art-direction', 'generate', 'refine', 'critique'];
const ROOM = { none: 0, minimal: 1024, low: 3072, medium: 8192, high: 16384, xhigh: 24576, max: 32768 };
const PRICE = { 'gpt-6.1-sol': [2, 10], 'gpt-6-luna': [0.1, 0.5] };
const worst = SETUPS.reduce((sum, s) => {
  const model = s.env.SOCRIAUX_MODEL;
  const [pin, pout] = PRICE[model];
  const room = ROOM[s.env.SOCRIAUX_EFFORT ?? 'none'];
  const perProject = KINDS.reduce((a, k) => a + (14000 * pin + (V.MAX_TOKENS[k] + room) * pout) / 1e6, 0);
  return sum + perProject * projects.length;
}, 0);
console.log(`SocriaUX × GPT-6.1 Sol — ${projects.length} projects × ${SETUPS.map((s) => s.label).join(', ')} × ${KINDS.length} calls`);
console.log(`the most this could cost (every call writing its whole cap): US$${worst.toFixed(2)}; it stops past US$${MAX_USD}${worst > MAX_USD ? ` (raise --max-usd to ${Math.ceil(worst)} to be sure it finishes)` : ''}`);
if (!DRY && !args.yes) {
  console.log('Nothing sent. Run again with --yes to spend it, or --dry-run to check the plumbing for free.');
  process.exit(0);
}

// ── the client ───────────────────────────────────────────────────────
let client;
if (DRY) {
  const F = await import(pathToFileURL(join(ROOT, 'test/helpers/fake-openai-contract.mjs')).href);
  client = U.tracked(new F.default(), 'ux-v0/sol-eval');
  globalThis.__contractContent = (p) => canned(p);
} else {
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY is not set.');
    process.exit(1);
  }
  const { default: OpenAI } = await import('openai');
  const proxy = process.env.HTTPS_PROXY ? new (await import('https-proxy-agent')).HttpsProxyAgent(process.env.HTTPS_PROXY) : undefined;
  client = U.tracked(new OpenAI({ ...(proxy ? { httpAgent: proxy } : {}), timeout: 300_000, maxRetries: 1 }), 'ux-v0/sol-eval');
}

let spent = 0;
const calls = [];
async function ask(setup, kind, system, user, extra = {}) {
  if (spent > MAX_USD) throw Object.assign(new Error(`budget: US$${spent.toFixed(2)} spent, past US$${MAX_USD}`), { budget: true });
  const env = { ...process.env, ...setup.env };
  const ladder = args.fallback ? V.socriauxLadder(env) : [V.socriauxModel(env)];
  const t0 = Date.now();
  const row = { setup: setup.label, project: current, kind, ms: 0, ok: false, model: null, effort: null, api: null, input: 0, output: 0, cost: 0, incomplete: null, error: null };
  calls.push(row);
  try {
    const a = await V.askJson(client, ladder, { system, user, maxTokens: V.MAX_TOKENS[kind], temperature: extra.temperature ?? 0.5, label: kind, format: extra.format ?? V.formatFor(kind), images: extra.images }, env);
    Object.assign(row, { ms: Date.now() - t0, model: a.model, effort: a.effort, api: a.api, input: a.usage.input, output: a.usage.output, cost: a.usage.cost, incomplete: a.incomplete, ok: a.json != null });
    // an answer cut short or unreadable is kept (its start and end) so what went wrong can be read
    if (a.incomplete || a.json == null) row.raw = a.raw.length > 2400 ? `${a.raw.slice(0, 1800)} … ${a.raw.slice(-600)}` : a.raw;
    spent += a.usage.cost;
    return a.json;
  } catch (e) {
    Object.assign(row, { ms: Date.now() - t0, error: String(e?.message ?? e).slice(0, 240) });
    if (e?.budget) throw e;
    return null;
  }
}

// ── small measures ───────────────────────────────────────────────────
const WORDS = (s) => new Set(String(s ?? '').toLowerCase().match(/[a-z]{4,}/g) ?? []);
/** how much of the project's own words the generated text keeps (0–1): a rough fidelity to intent */
const overlap = (mine, theirs) => {
  const a = WORDS(mine);
  const b = WORDS(theirs);
  if (!b.size) return null;
  let n = 0;
  for (const w of b) if (a.has(w)) n++;
  return Math.round((n / b.size) * 100) / 100;
};
const GENERIC_NAMES = /\b(modern|clean|minimal|minimalist|sleek|elegant|bold|fresh|simple)\b/i;
const sameExcept = (a, b, id) => JSON.stringify(a.sections.filter((s) => s.id !== id)) === JSON.stringify(b.sections.filter((s) => s.id !== id)) && JSON.stringify(a.tokens) === JSON.stringify(b.tokens) && JSON.stringify(a.look) === JSON.stringify(b.look);

// the moodboard every project is given: inspiring references with notes, one to steer away from, its pictures for the page
const boardFor = (p) =>
  V.normalizeMoodboard({
    refs: [
      ref('cafe-bar', { note: 'The light, not the bar itself', take: ['atmosphere', 'colour'], leave: ['imagery'], swatches: ['#2a1d16', '#e9d9c3', '#b8865b'], key: true, asContent: false }),
      ref('grid', { note: 'This asymmetric grid, generous white space', take: ['composition'], asContent: false }),
      ref('marble', { note: 'too corporate, rounded cards', avoid: true, asContent: false }),
      ...p.pics.map((n) => ref(n, { asContent: true })),
    ],
  });
const NOTE_IDEAS = [/\blight|glow|warm/i, /asymmetr/i, /white space|generous|space/i];

// ── the browser ──────────────────────────────────────────────────────
const proxy = process.env.HTTPS_PROXY && !DRY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1,images.example.test' } : undefined;
const browser = await chromium.launch(proxy ? { proxy } : {});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.route('https://images.example.test/**', (r) => r.fulfill({ contentType: 'image/jpeg', body: readFileSync(FX + r.request().url().split('/').pop()) }));
if (!proxy) await ctx.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: '' }));
const page = await ctx.newPage();

async function audit(spec, board, width, height) {
  await page.setViewportSize({ width, height });
  await page.setContent(V.renderDesign(spec, board.refs).html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.addScriptTag({ content: V.AUDIT_SOURCE });
  return V.normalizeAudit(await page.evaluate(() => window.__uxv0Audit()));
}
/** the workspace's own look at a new design: measured at both widths, evaluated, word-free fixes in at most two rounds */
async function inspect(spec, board, ctxEval) {
  const measure = async (s) => V.evaluateDesign(s, { desktop: await audit(s, board, 1280, 900), phone: await audit(s, board, 390, 844) }, ctxEval.direction?.locks ?? [], ctxEval);
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

// ── the workflow ─────────────────────────────────────────────────────
let current = '';
const results = [];
const ANSWER = (p, topic) =>
  ({ audience: p.brief.audience, objective: p.brief.objective, brand: p.brief.personality.join(', '), visual: p.brief.visualDirection, hierarchy: p.brief.layoutDirection, content: p.brief.layoutDirection, functionality: p.brief.objective, needs: p.brief.objective })[topic] || null;

try {
  for (const p of projects) {
    for (const setup of SETUPS) {
      current = p.id;
      const out = { project: p.id, setup: setup.label, steps: {} };
      results.push(out);
      // one project and setup failing (in the harness or the page) is recorded, and the run goes on
      try {
      const board = boardFor(p);
      const intent = `${p.name}. ${p.brief.objective}`;
      console.log(`\n${p.id} · ${setup.label}`);
      // 1 questions
      const dIn = { intent, questions: [], understanding: V.normalizeUnderstanding({}), moodboard: V.normalizeMoodboard({}), remark: '' };
      const dRaw = await ask(setup, 'discover', V.discoverSystem(), V.discoverUser(dIn));
      const disc = V.parseDiscover(dRaw, dIn);
      const questions = disc.questions.map((q) => {
        const a = ANSWER(p, q.topic);
        return a ? { ...q, answer: a } : { ...q, delegated: true, answer: 'You decide' };
      });
      out.steps.questions = { n: questions.length, withOptions: questions.filter((q) => q.options.length >= 2).length, topics: questions.map((q) => q.topic), text: questions.map((q) => q.question), note: disc.note ?? '' };
      // 2 brief
      const bIn = { intent, understanding: disc.understanding, questions, moodboard: board, current: null, instruction: '' };
      const bRaw = await ask(setup, 'brief', V.briefSystem(false), V.briefUser(bIn), { temperature: 0.4 });
      const brief = V.parseBrief(bRaw, board) ?? p.brief;
      const bText = `${brief.visualDirection} ${brief.layoutDirection}`;
      out.steps.brief = {
        parsed: !!V.parseBrief(bRaw, board),
        audienceOverlap: overlap(brief.audience, p.brief.audience),
        objectiveOverlap: overlap(brief.objective, p.brief.objective),
        notesReached: NOTE_IDEAS.filter((re) => re.test(bText)).length,
        steeredAwayFromRounded: !/rounded card/i.test(bText) || /no rounded|not rounded|avoid/i.test(bText),
        fonts: `${brief.typography.display} / ${brief.typography.body}`,
        visualDirection: brief.visualDirection,
      };
      // 3 another direction for the moodboard's imagery
      const mIn = { ...dIn, moodboard: board };
      const mRaw = await ask(setup, 'direction', V.directionSystem(), V.directionUser(mIn, 'imagery'), { temperature: 0.8, format: V.formatFor('direction', 'imagery') });
      const mood = V.parseDirection(mRaw, mIn, 'imagery');
      out.steps.moodboard = { direction: mood.direction, queries: mood.queries.map((q) => q.query) };
      // 4 art direction
      const dAsk = { brief, notes: '', board: V.readBoard(board) };
      const engine = V.proposeDirections(dAsk);
      const aRaw = await ask(setup, 'art-direction', V.directSystem(), V.directUser(dAsk, engine), { temperature: 0.8 });
      const dirs = V.parseDirections(aRaw, dAsk, engine);
      out.steps.direction = {
        written: dirs.filter((d) => d.source === 'model').length,
        names: dirs.map((d) => d.name),
        genericNames: dirs.filter((d) => GENERIC_NAMES.test(d.name)).length,
        languages: dirs.map((d) => d.language),
        concepts: dirs.map((d) => d.concept),
      };
      // 5 generation, drawn, measured and fixed as the workspace does
      const art = dirs[0];
      const gRaw = await ask(setup, 'generate', V.generateSystem(brief, art), V.generateUser({ brief, moodboard: board, direction: '' }), { temperature: 0.6 });
      const spec0 = V.parseGenerate(gRaw, brief, board, 1, `Generated in the “${art.name}” direction`, art);
      if (!spec0) {
        out.steps.generation = { parsed: false };
        continue;
      }
      const { spec, ev, fixed } = await inspect(spec0, board, { direction: art, brief, board });
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.setContent(V.renderDesign(spec, board.refs).html, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: `${S}sol-eval-${p.id}-${setup.label}.png` });
      const heroBox = await page.evaluate(() => {
        const b = document.querySelector('.btn-primary');
        if (!b) return null;
        const r = b.getBoundingClientRect();
        const cs = getComputedStyle(b);
        return { text: b.textContent.trim(), box: { x: r.x, y: r.y, w: r.width, h: r.height }, styles: { color: cs.color, 'background-color': cs.backgroundColor, 'font-size': cs.fontSize, 'font-weight': cs.fontWeight } };
      });
      // the button may sit below the first screen: cropped from the whole page, and a crop that fails is left out
      let crop = null;
      if (heroBox && heroBox.box.w > 0 && heroBox.box.h > 0) {
        try {
          const x = Math.max(0, heroBox.box.x - 120);
          const y = Math.max(0, heroBox.box.y + (await page.evaluate(() => window.scrollY)) - 80);
          crop = (await page.screenshot({ fullPage: true, clip: { x, y, width: Math.min(640, heroBox.box.w + 240), height: Math.min(360, heroBox.box.h + 160) } })).toString('base64');
        } catch {
          crop = null;
        }
      }
      if (!heroBox) out.steps.critiqueSkipped = 'no primary button on the page';
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: `${S}sol-eval-${p.id}-${setup.label}-phone.png` });
      out.steps.generation = {
        parsed: true,
        sections: spec.sections.map((s) => `${s.kind}/${s.variant}`),
        quality: ev.quality,
        distinctiveness: ev.distinctiveness,
        fidelity: ev.fidelity,
        findings: ev.findings.map((f) => `${f.kind}: ${f.message}`).slice(0, 12),
        fixedBeforeShown: fixed,
        cliches: V.clichesIn(spec).map((c) => c.phrase ?? c.text ?? String(c)),
        placeholders: V.placeholdersIn(spec),
        headline: String(spec.sections.find((s) => s.kind === 'hero')?.content?.title ?? ''),
      };
      // 6 a targeted change: the page's main headline (the hero's, or an app screen's header), selected
      const hero = spec.sections.find((s) => s.kind === 'hero') ?? spec.sections.find((s) => s.kind === 'app-header');
      if (hero) {
        const capture = V.normalizeCapture({ tag: 'h1', role: 'heading', name: String(hero.content.title ?? ''), text: String(hero.content.title ?? ''), path: 'main > section.hero > h1', selector: 'h1', attrs: {}, styles: {}, box: { x: 40, y: 200, w: 900, h: 140 }, background: 'rgb(255,255,255)', section: `hero: ${hero.content.title ?? ''}`, parent: 'div.hero-text', siblings: 2, children: 0, interactive: false, ux: { section: hero.id, path: 'title' } });
        const selection = V.elementSelection(capture, 'generated', 'desktop');
        const comment = `Make this headline shorter and more specific to ${p.brief.audience.split(/[,.]/)[0].toLowerCase()}. Keep everything else.`;
        const rRaw = await ask(setup, 'refine', V.refineSystem(), V.refineUser({ brief, spec, moodboard: board, selection, comment, force: false, locks: art.locks }), { temperature: 0.4 });
        const r = V.parseRefine(rRaw, false);
        const applied = r.patch ? V.applyPatch(spec, r.patch, board) : { ok: false };
        out.steps.refinement = {
          op: r.patch?.op ?? null,
          applies: !!applied.ok,
          onlyThatSection: applied.ok ? sameExcept(spec, applied.spec, hero.id) : null,
          before: String(hero.content.title ?? ''),
          after: applied.ok ? String(applied.spec.sections.find((s) => s.id === hero.id)?.content?.title ?? '') : null,
          challenge: r.challenge ?? null,
        };
      }
      // 7 critique of the primary button, with a crop of it
      if (heroBox) {
        const capture = V.normalizeCapture({ tag: 'a', role: 'link', name: heroBox.text, text: heroBox.text, path: 'main > section.hero > a.btn', selector: 'a.btn-primary', attrs: { href: '#' }, styles: heroBox.styles, box: heroBox.box, background: heroBox.styles['background-color'], section: `hero: ${hero?.content?.title ?? ''}`, parent: 'div.actions', siblings: 1, children: 0, interactive: true });
        const selection = V.elementSelection(capture, 'generated', 'desktop');
        const cIn = { selection, comment: 'Is this the strongest call to action for these people?', history: [], brief, summary: '', section: 'hero', kind: 'generated', name: p.name, viewport: 'desktop', wantsSummary: false };
        const cRaw = await ask(setup, 'critique', V.critiqueSystem(), V.critiqueUser(cIn), { temperature: 0.4, images: crop ? [{ url: `data:image/png;base64,${crop}`, detail: 'high' }] : undefined });
        const g = V.gateReasoning(cRaw, cIn);
        out.steps.critique = { verdict: g.reasoning.verdict, issues: g.reasoning.issues.length, demotedForNoEvidence: g.demoted, questions: g.reasoning.questions.length, read: g.reasoning.read };
      }
      } catch (e) {
        if (e?.budget) throw e;
        out.error = String(e?.message ?? e).slice(0, 300);
        console.log(`  harness error: ${out.error}`);
      }
      const mine = calls.filter((c) => c.project === p.id && c.setup === setup.label);
      console.log(`  ${mine.map((c) => `${c.kind}:${c.ok ? 'ok' : c.error ? 'error' : 'unparsed'} ${(c.ms / 1000).toFixed(1)}s`).join(' · ')}`);
    }
  }
} catch (e) {
  if (!e?.budget) throw e;
  console.log(`\nSTOPPED: ${e.message}`);
}

// ── the report ───────────────────────────────────────────────────────
const by = (xs, key) => xs.reduce((m, x) => ((m[x[key]] ??= []).push(x), m), {});
const mean = (xs) => (xs.length ? Math.round((xs.reduce((a, x) => a + x, 0) / xs.length) * 10) / 10 : null);
const summary = Object.entries(by(calls, 'setup')).map(([setup, cs]) => {
  const rs = results.filter((r) => r.setup === setup);
  const gens = rs.map((r) => r.steps.generation).filter((g) => g?.parsed);
  return {
    setup,
    calls: cs.length,
    parsed: cs.filter((c) => c.ok).length,
    errors: cs.filter((c) => c.error).length,
    cutOrRefused: cs.filter((c) => c.incomplete).length,
    servedBy: [...new Set(cs.map((c) => c.model).filter(Boolean))],
    secondsByStep: Object.fromEntries(Object.entries(by(cs, 'kind')).map(([k, v]) => [k, mean(v.map((c) => c.ms / 1000))])),
    outputTokens: cs.reduce((a, c) => a + c.output, 0),
    costUsd: Math.round(cs.reduce((a, c) => a + c.cost, 0) * 10000) / 10000,
    pages: { generated: gens.length, quality: mean(gens.map((g) => g.quality)), distinctiveness: mean(gens.map((g) => g.distinctiveness)), fidelity: mean(gens.map((g) => g.fidelity)), cliches: gens.reduce((a, g) => a + g.cliches.length, 0), placeholders: gens.reduce((a, g) => a + g.placeholders.length, 0) },
    questions: mean(rs.map((r) => r.steps.questions?.n ?? 0)),
    briefNotesReached: mean(rs.map((r) => r.steps.brief?.notesReached ?? 0)),
    genericDirectionNames: rs.reduce((a, r) => a + (r.steps.direction?.genericNames ?? 0), 0),
    refinementsOnlyThatSection: rs.filter((r) => r.steps.refinement?.onlyThatSection).length,
    critiquesWithEvidence: rs.filter((r) => (r.steps.critique?.issues ?? 0) > 0 || r.steps.critique?.verdict === 'works').length,
  };
});
const report = { when: new Date().toISOString(), dryRun: DRY, note: DRY ? 'DRY RUN: canned answers from the strict fake. These numbers test the plumbing, not GPT-6.1 Sol.' : 'Live run against the OpenAI API.', spentUsd: Math.round(spent * 10000) / 10000, summary, results, calls };
writeFileSync(`${S}sol-eval.json`, JSON.stringify(report, null, 2));
console.log(`\n${report.note}\nspent US$${report.spentUsd}`);
console.log(JSON.stringify(summary, null, 2));
console.log(`\nwrote ${S}sol-eval.json and sol-eval-*.png`);
await browser.close();

// ── canned answers, for --dry-run only ───────────────────────────────
function canned(p) {
  // the system prompt, on either API; answered as JSON text, as the provider answers
  const sys = String(p.instructions ?? p.messages?.[0]?.content ?? '');
  return JSON.stringify(cannedFor(sys));
}
function cannedFor(sys) {
  const proj = PROJECTS.find((x) => x.id === current) ?? PROJECTS[0];
  if (sys.startsWith('You are SocriaUX, helping a designer')) return { understanding: { summary: proj.brief.objective, known: { objective: proj.brief.objective }, gaps: ['audience'] }, questions: [{ topic: 'audience', question: 'Who comes first?', why: 'It sets the tone.', options: ['A', 'B'], multi: false }], moodboard: { queries: [] }, ready: true, note: 'Understood.' };
  if (sys.startsWith('You are SocriaUX. The designer asked to see another direction')) return { direction: 'Night light', moodboard: { queries: [{ category: 'imagery', query: 'night window light' }], palettes: [], type: [] } };
  if (sys.startsWith('You are SocriaUX. Synthesise') || sys.startsWith('You are SocriaUX. Revise')) return { ...proj.brief, userGoals: ['see it'], functionalRequirements: [], references: [], openQuestions: [], experience: null, rules: [], accessibility: null, responsive: null, typography: { ...proj.brief.typography, rationale: '' }, layoutDirection: proj.brief.layoutDirection || 'One column.', visualDirection: `${proj.brief.visualDirection} Warm light, an asymmetric grid with generous space.` };
  if (sys.startsWith("You are SocriaUX's art director")) return { directions: [1, 2, 3].map((i) => ({ candidate: i, language: null, name: `Canned ${i}`, concept: 'c', rationale: ['r'], voice: 'v', composition: 'c', imagery: 'i', avoid: ['a'], fonts: null })).map(({ language, ...d }) => d) };
  if (sys.startsWith("You are SocriaUX's design generator")) return { title: proj.name, pageType: proj.brief.pageType, platform: 'web', sections: proj.sections };
  if (sys.startsWith('You are SocriaUX. The designer is changing')) return { understood: 'A shorter headline.', challenge: null, question: null, regenerate: null, patch: { op: 'content', sectionId: 'hero', content: { title: 'Shorter.' }, summary: 'Shorter headline' } };
  if (sys.startsWith('You are SocriaUX, the design reasoning environment')) return { read: 'A primary button.', verdict: 'mixed', issues: [], questions: ['Who taps it first?'], principles: [], alternatives: [], artifactSummary: null };
  return {};
}
