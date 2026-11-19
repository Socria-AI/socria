// test/browser/ux-v0/perf-bench.mjs — SocriaUX's speed, cost and reliability, scenario by scenario, through
// the real route handlers. No provider is called and nothing is spent.
//
// THE MODEL is test/helpers/fake-openai-perf.mjs. It answers each stage after the time that stage was
// MEASURED to take in the live run of 18 November 2026 (fx/sol-eval-calls.json: the median per stage, per
// model and effort), multiplied by PERF_SCALE so a run takes minutes. When the first output arrives was not
// measured then (the calls were not streamed): the fake sends it at 80% of the time for a reasoning model and
// 30% for GPT-6 Luna, an assumption the report states. Tokens are SocriaUX's own prompts at four characters
// each; reasoning tokens are the measured median output less the answer.
//
// THE DATABASE is the in-memory fake, with PERF_DB_MS added to every query and rpc as a network round trip (an
// assumption, stated in the report; the real figure depends on where the database is).
//
// WHAT IS MEASURED is SocriaUX's own work: requests and model calls per workflow, database round trips, the
// time routes take beyond the model, prompt sizes and how much of each prompt is a prefix a provider can
// cache, what happens when the provider stalls or the designer cancels, a double-submitted action, and a
// room of designers working at once.
//
//   PERF_ROOT=<checkout> UXV0_OUT=<dir> node test/browser/ux-v0/perf-bench.mjs
//   PERF_SCALE=0.1  PERF_DB_MS=40  PERF_USERS=12  PERF_PROFILE=tiered|legacy
//
// PERF_ROOT is the code measured (default: this checkout; its test bundle must be built:
// node -e "import('./test/helpers/build.mjs').then((m) => m.buildAll())"). The fakes always come from this
// checkout, so an older checkout is measured under exactly the same conditions.

import { build } from 'esbuild';
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve as res } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SELF = join(HERE, '..', '..', '..');
const ROOT = res(process.env.PERF_ROOT || SELF);
const OUT = process.env.UXV0_OUT || join(SELF, 'test', '.tmp', 'perf-out');
const SCALE = Number(process.env.PERF_SCALE ?? 0.1);
const DB_MS = Number(process.env.PERF_DB_MS ?? 40);
const USERS = Number(process.env.PERF_USERS ?? 12);
const PROFILE = process.env.PERF_PROFILE === 'legacy' ? 'legacy' : 'tiered';
mkdirSync(OUT, { recursive: true });

// ── the routes of the checkout measured, with this checkout's fakes ──
const BUNDLES = join(ROOT, 'test', '.tmp', 'perf-bench');
rmSync(BUNDLES, { recursive: true, force: true });
mkdirSync(BUNDLES, { recursive: true });
const FAKE_DB = join(SELF, 'test', 'helpers', 'fake-supabase.mjs');
const swap = {
  name: 'swap',
  setup(b) {
    b.onResolve({ filter: /(^|\/)supabase$/ }, (a) => {
      const p = a.path.startsWith('@/') ? join(ROOT, a.path.slice(2)) : res(a.resolveDir, a.path);
      if (p === join(ROOT, 'lib', 'supabase')) return { path: pathToFileURL(FAKE_DB).href, external: true };
      return undefined;
    });
    b.onResolve({ filter: /^@clerk\/nextjs\/server$/ }, () => ({ path: pathToFileURL(join(SELF, 'test', 'helpers', 'fake-clerk.mjs')).href, external: true }));
    b.onResolve({ filter: /^openai$/ }, () => ({ path: pathToFileURL(join(SELF, 'test', 'helpers', 'fake-openai-perf.mjs')).href, external: true }));
    b.onResolve({ filter: /^server-only$/ }, () => ({ path: join(SELF, 'test', 'helpers', 'server-only-shim.mjs') }));
    b.onResolve({ filter: /^next\/(server|headers)$/ }, (a) => ({ path: `${a.path}.js`, external: true }));
  },
};
const ROUTES = ['discover', 'brief', 'direct', 'generate', 'refine', 'critique'];
await Promise.all(
  ROUTES.map((r) =>
    build({
      entryPoints: [join(ROOT, `app/api/ux-v0/${r}/route.ts`)], bundle: true, format: 'esm', platform: 'node', outfile: join(BUNDLES, `${r}.mjs`),
      tsconfig: join(ROOT, 'tsconfig.json'), plugins: [swap], external: ['next', 'next/*', 'undici', '@supabase/*', 'stripe', 'resend'], logLevel: 'error',
    })
  )
);

const quiet = { warn: console.warn, error: console.error, info: console.info };
console.warn = () => {};
console.error = () => {};
console.info = () => {};
const log = (...a) => quiet.warn(...a);

process.env.OPENAI_API_KEY = 'test';
process.env.RATE_LIMIT_DISABLED = '1';
process.env.SOCRIAUX_DAILY_CALLS = '100000';
process.env.SOCRIAUX_DAILY_GENERATIONS = '100000';
process.env.SOCRIAUX_DAILY_USD = '100000';
process.env.SOCRIAUX_MONTHLY_USD = '100000';
process.env.SOCRIAUX_PROJECT_USD = '100000';
process.env.SOCRIAUX_OPERATION_USD = '100000';
process.env.SOCRIA_TOKEN_LOG = 'off';
delete process.env.SOCRIAUX_ROUTING;
if (PROFILE === 'legacy') process.env.SOCRIAUX_MODEL = 'gpt-6.1-sol';
else delete process.env.SOCRIAUX_MODEL;
const users = Array.from({ length: Math.max(USERS, 2) }, (_, i) => `user_perf_${i}`);
process.env.SOCRIA_ONE_USER_IDS = users.join(',');
globalThis.__users = Object.fromEntries(users.map((u, i) => [u, { firstName: `Designer ${i}`, emails: [`d${i}@example.com`] }]));

const R = Object.fromEntries(await Promise.all(ROUTES.map(async (r) => [r, await import(pathToFileURL(join(BUNDLES, `${r}.mjs`)).href)])));
const { db } = await import(pathToFileURL(FAKE_DB).href);
db.rpcs.bump_ux_v0_usage = () => ({ data: null, error: null });
const { NextRequest } = await import(pathToFileURL(join(ROOT, 'node_modules', 'next', 'server.js')).href);
const V = await import(pathToFileURL(join(ROOT, 'test', '.tmp', 'ux-v0-under-test.mjs')).href);
const { projectsFor } = await import(pathToFileURL(join(HERE, 'dogfood-projects.mjs')).href);
const { PROJECTS } = projectsFor(V);
const REV = (() => {
  try {
    return readFileSync(join(ROOT, '.git', 'HEAD'), 'utf8').trim();
  } catch {
    try {
      return readFileSync(join(ROOT, '.git'), 'utf8').trim();
    } catch {
      return 'unknown';
    }
  }
})();

// ── the measured latencies (18 November 2026) ──
const LIVE = JSON.parse(readFileSync(join(HERE, 'fx', 'sol-eval-calls.json'), 'utf8')).calls;
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0;
};
const MEASURED = {};
for (const c of LIVE) ((MEASURED[c.setup] ??= {})[c.kind] ??= []).push(c);
const setupOf = (model, effort) => (/sol/.test(model) ? (effort === 'high' ? 'sol-high' : 'sol-medium') : 'luna');
const STAGE_KIND = { discover: 'discover', direction: 'direction', brief: 'brief', 'art-direction': 'art-direction', generate: 'generate', refine: 'refine', critique: 'critique' };
const measuredMs = (stage, model, effort) => median((MEASURED[setupOf(model, effort)]?.[STAGE_KIND[stage] ?? 'discover'] ?? []).map((c) => c.ms));
const measuredOut = (stage, model, effort) => median((MEASURED[setupOf(model, effort)]?.[STAGE_KIND[stage] ?? 'discover'] ?? []).map((c) => c.output));

// ── the model's answers, by stage ──
const proj = PROJECTS.find((p) => p.id === 'research') ?? PROJECTS[0];
const ANSWERS = {
  discover: (p) => {
    const answered = /"answer":"[^"]+"/.test(JSON.stringify(p.input ?? p.messages ?? ''));
    return answered
      ? { understanding: { summary: proj.brief.objective, known: { objective: proj.brief.objective, audience: proj.brief.audience }, gaps: [] }, questions: [], moodboard: { queries: [] }, ready: true, note: 'Enough to write the brief.' }
      : { understanding: { summary: proj.brief.objective, known: { objective: proj.brief.objective }, gaps: ['audience'] }, questions: [{ topic: 'audience', question: 'Who comes first?', why: 'It sets the tone.', options: ['Researchers', 'Students'], multi: false }], moodboard: { queries: [] }, ready: false, note: '' };
  },
  direction: () => ({ direction: 'Night light', moodboard: { queries: [{ category: 'imagery', query: 'night window light' }], palettes: [], type: [] } }),
  brief: () => ({ ...proj.brief, userGoals: ['Read the research', 'Download the data'], functionalRequirements: [], references: [], openQuestions: [], experience: null, rules: [], accessibility: null, responsive: null, typography: { ...proj.brief.typography, rationale: '' }, layoutDirection: proj.brief.layoutDirection || 'One column.' }),
  'art-direction': () => ({ directions: [1, 2, 3].map((i) => ({ candidate: i, name: `Direction ${i}`, concept: 'A concept for this lab.', rationale: ['It reads as research.'], voice: 'Plain and exact.', composition: 'An index.', imagery: 'Measured light.', avoid: ['decoration'], fonts: null })) }),
  generate: () => ({ title: proj.name, pageType: 'website', platform: 'web', sections: proj.sections }),
  refine: () => ({ understood: 'A more editorial layout.', challenge: null, question: null, regenerate: null, patch: { op: 'variant', sectionId: 'prog', variant: 'columns', summary: 'The programmes in columns' } }),
  critique: () => ({ read: 'A primary button.', verdict: 'mixed', issues: [], questions: ['Who taps it first?'], principles: [], alternatives: [], artifactSummary: null }),
};
let mode = { hang: null, fail: null };
globalThis.__perf = {
  calls: [],
  answer: (stage, p) => (mode.fail?.(stage, p) ?? (ANSWERS[stage] ?? (() => ({})))(p)),
  hang: (stage, p) => !!mode.hang?.(stage, p),
  latency: (stage, p) => {
    const effort = p.reasoning?.effort ?? p.reasoning_effort ?? null;
    const total = measuredMs(stage, p.model, effort) * SCALE;
    return { ttft: total * (/sol/.test(p.model) ? 0.8 : 0.3), total };
  },
  reasoning: (stage, model) => (/sol/.test(model) ? Math.max(0, measuredOut(stage, model, 'medium') - 400) : 0),
};
const calls = () => globalThis.__perf.calls;

// ── one request to a route, timed as a browser would see it ──
const J = JSON.stringify;
async function call(route, body, uid, o = {}) {
  globalThis.__uid = uid;
  const headers = { 'content-type': 'application/json', accept: o.stream ? 'application/x-ndjson, application/json' : 'application/json', ...(o.op ? { 'x-operation-id': o.op } : {}) };
  const req = new NextRequest(`http://localhost/api/ux-v0/${route}`, { method: 'POST', headers, body: J(body), ...(o.signal ? { signal: o.signal } : {}) });
  const tripsBefore = globalThis.__dbTrips ?? 0;
  const callsBefore = calls().length;
  const t0 = performance.now();
  let firstAt = null;
  let status = 0;
  let json = null;
  let events = 0;
  try {
    const r = await (o.timeoutMs ? Promise.race([R[route].POST(req), new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('no answer'), { name: 'BenchTimeout' })), o.timeoutMs))]) : R[route].POST(req));
    status = r.status;
    const type = r.headers.get('content-type') ?? '';
    if (/ndjson/.test(type) && r.body) {
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await (o.timeoutMs ? Promise.race([reader.read(), new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('no answer'), { name: 'BenchTimeout' })), o.timeoutMs))]) : reader.read());
        if (done) break;
        firstAt ??= performance.now();
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          if (!line) continue;
          events++;
          const ev = JSON.parse(line);
          if (ev.type === 'result') ((json = ev.body), (status = ev.status ?? status));
          if (o.onEvent) o.onEvent(ev, reader);
        }
      }
    } else {
      json = await r.json().catch(() => null);
      firstAt = performance.now();
    }
  } catch (e) {
    return { route, ok: false, status: 0, error: e?.name === 'BenchTimeout' ? 'no answer' : String(e?.message ?? e), ms: performance.now() - t0, firstMs: null, trips: (globalThis.__dbTrips ?? 0) - tripsBefore, modelCalls: calls().length - callsBefore, events };
  }
  const ms = performance.now() - t0;
  const made = calls().slice(callsBefore);
  const modelMs = made.reduce((s, c) => s + ((c.endedAt ?? Date.now()) - c.startedAt), 0);
  return { route, ok: status >= 200 && status < 300 && !!json && !json.error, status, json, ms, firstMs: firstAt ? firstAt - t0 : null, trips: (globalThis.__dbTrips ?? 0) - tripsBefore, modelCalls: made.length, modelMs, overheadMs: ms - modelMs, inTokens: made.reduce((s, c) => s + c.inTokens, 0), outTokens: made.reduce((s, c) => s + c.outTokens, 0), events, made };
}

// ── the bodies a browser sends, from one project ──
const board = V.normalizeMoodboard({ refs: (proj.pics ?? []).map((n) => ({ provider: 'openverse', providerId: n, id: `openverse:${n}`, url: `https://images.example.test/${n}.jpg`, thumb: `https://images.example.test/${n}.jpg`, width: 1600, height: 1067, title: n, creator: 'A', creatorUrl: '', sourceUrl: `https://example.org/${n}`, license: 'CC BY 2.0', licenseUrl: '', attribution: n, category: 'imagery', state: 'kept', asContent: true })) });
const intent = `${proj.name}. ${proj.brief.objective}`;
const understanding = V.normalizeUnderstanding ? V.normalizeUnderstanding({}) : { summary: '', known: {}, gaps: [] };
const STREAMS = typeof V.readStageStream === 'function' || existsSync(join(ROOT, 'lib', 'ux-v0', 'stage-server.ts'));

const discoverBody = (pid, questions = []) => ({ projectId: pid, action: 'turn', intent, questions, understanding, moodboard: board, remark: '' });
const briefBody = (pid, questions) => ({ projectId: pid, action: 'synthesize', intent, understanding, questions, moodboard: board, current: null, instruction: '' });
const directBody = (pid, brief) => ({ projectId: pid, brief, notes: '', avoid: '', base: null, round: 0, seen: [], board: V.readBoard ? V.readBoard(board) : null });
const generateBody = (pid, brief, art) => ({ projectId: pid, brief, moodboard: board, direction: '', artDirection: art, version: 1 });
const refineBody = (pid, brief, spec, comment, selection = null) => ({ projectId: pid, brief, spec, moodboard: board, selection, comment, force: false, locks: [] });

const sum = (xs, f) => xs.reduce((s, x) => s + (f(x) ?? 0), 0);
const round = (n, d = 0) => (n == null ? null : Math.round(n * 10 ** d) / 10 ** d);
const pct = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] : null;
};
/** a step as the report gives it: what the designer waited, and what of it was SocriaUX's own */
const stepRow = (name, r) => ({ step: name, ok: r.ok, status: r.status, requests: 1, modelCalls: r.modelCalls, dbTrips: r.trips, ms: round(r.ms), firstMs: round(r.firstMs), modelMs: round(r.modelMs), overheadMs: round(r.overheadMs), modelMsUnscaled: round((r.modelMs ?? 0) / SCALE), inTokens: r.inTokens, outTokens: r.outTokens, streamed: r.events > 0 });

globalThis.__dbLatencyMs = DB_MS;
const report = { at: new Date().toISOString(), root: ROOT, rev: REV, profile: PROFILE, scale: SCALE, dbMs: DB_MS, users: USERS, streams: STREAMS, model_calls_to_providers: 0, assumptions: [], scenarios: {} };
report.assumptions.push(`Model time per stage: the median measured on 18 November 2026 for that model and effort, × ${SCALE}. "modelMsUnscaled" puts it back.`);
report.assumptions.push('First output at 80% of a reasoning model\'s time and 30% of GPT-6 Luna\'s (not measured: the live calls were not streamed).');
report.assumptions.push(`Each database query or rpc: a ${DB_MS} ms round trip (the real figure depends on where the database is). Rate limiting off (its Upstash round trips are not counted).`);
report.assumptions.push('Tokens: SocriaUX\'s own prompt text at four characters a token (the strict fake\'s estimate). Output tokens: the answer at four characters, plus the measured median reasoning for a reasoning model.');

// ── A · Starting Fresh: the questions, the brief, the directions, the first design ──
log(`\nperf bench · ${ROOT} · ${PROFILE} · scale ${SCALE} · db ${DB_MS} ms`);
async function startingFresh(uid, pid, o = {}) {
  const steps = [];
  const d1 = await call('discover', discoverBody(pid), uid, { stream: o.stream });
  steps.push(stepRow('questions', d1));
  const qs = (d1.json?.questions ?? []).map((q) => ({ ...q, answer: q.options?.[0] ?? 'Researchers' }));
  const d2 = await call('discover', discoverBody(pid, qs), uid, { stream: o.stream });
  steps.push(stepRow('questions, answered', d2));
  const b = await call('brief', briefBody(pid, qs), uid, { stream: o.stream });
  steps.push(stepRow('brief', b));
  const brief = b.json?.brief;
  const dir = brief ? await call('direct', directBody(pid, brief), uid, { stream: o.stream }) : null;
  if (dir) steps.push(stepRow('art direction', dir));
  const art = dir?.json?.options?.[0] ?? null;
  const g = brief ? await call('generate', generateBody(pid, brief, art), uid, { stream: o.stream, op: o.op }) : null;
  if (g) steps.push(stepRow('first design', g));
  return { steps, brief, art, spec: g?.json?.spec ?? null };
}

const A = await startingFresh(users[0], 'p_perf_a', { stream: true });
const total = (steps) => ({ requests: steps.length, modelCalls: sum(steps, (s) => s.modelCalls), dbTrips: sum(steps, (s) => s.dbTrips), ms: round(sum(steps, (s) => s.ms)), overheadMs: round(sum(steps, (s) => s.overheadMs)), modelMsUnscaled: round(sum(steps, (s) => s.modelMsUnscaled)), inTokens: sum(steps, (s) => s.inTokens), outTokens: sum(steps, (s) => s.outTokens), ok: steps.every((s) => s.ok) });
report.scenarios.A = { name: 'Starting Fresh', steps: A.steps, total: total(A.steps) };
log('A', J(report.scenarios.A.total));

// ── B · Adaptive questioning: three turns ──
{
  const steps = [];
  let qs = [];
  for (let i = 0; i < 3; i++) {
    const r = await call('discover', discoverBody('p_perf_b', qs), users[1], { stream: true });
    steps.push(stepRow(`turn ${i + 1}`, r));
    qs = [...qs, ...(r.json?.questions ?? []).map((q) => ({ ...q, answer: q.options?.[0] ?? 'yes' }))];
  }
  report.scenarios.B = { name: 'Adaptive questioning', steps, total: total(steps) };
  log('B', J(report.scenarios.B.total));
}

// ── C · Creative direction, D · the initial canvas ──
{
  const c = await call('direct', directBody('p_perf_c', A.brief), users[1], { stream: true });
  report.scenarios.C = { name: 'Creative direction', steps: [stepRow('art direction', c)], total: total([stepRow('art direction', c)]) };
  const d = await call('generate', generateBody('p_perf_d', A.brief, A.art), users[1], { stream: true });
  report.scenarios.D = { name: 'Initial canvas', steps: [stepRow('first design', d)], total: total([stepRow('first design', d)]), sections: d.json?.spec?.sections?.length ?? 0 };
  log('C', J(report.scenarios.C.total), 'D', J(report.scenarios.D.total));
}

// ── E · small refinements: as the browser decides them (in code where it can, else the refine route) ──
const spec = A.spec ? V.normalizeSpec(A.spec, board) : null;
const heroTitle = spec ? { type: 'element', element: { ux: { section: 'hero', path: 'title' }, tag: 'h1', text: spec.sections.find((s) => s.id === 'hero')?.content?.title ?? '' } } : null;
const heroButton = spec ? { type: 'element', element: { ux: { section: 'hero', path: 'primary' }, tag: 'a', text: 'Explore the data' } } : null;
const SMALL = [
  { comment: 'Change the button color to black', selection: heroButton },
  { comment: 'Make the headline bigger', selection: heroTitle },
  { comment: 'More space between sections', selection: null },
  { comment: 'Make the corners rounder', selection: null },
  { comment: 'Change the headline to "Where the sea comes in"', selection: heroTitle },
  { comment: 'Use Source Serif 4 for the headlines', selection: null },
];
async function smallEdit(uid, pid, s, e) {
  const t0 = performance.now();
  // the browser's own reading first: the edits it does in code (newer checkouts read more of them)
  const quick = typeof V.readQuickEdit === 'function' ? V.readQuickEdit(e.comment, s, e.selection) : null;
  if (quick && !quick.patches?.length) return { comment: e.comment, how: 'in code (already so: nothing to change)', ok: true, requests: 0, modelCalls: 0, ms: round(performance.now() - t0, 2), firstMs: round(performance.now() - t0, 2), inTokens: 0, outTokens: 0, modelMsUnscaled: 0 };
  if (quick && quick.patches?.length) {
    let cur = s;
    let ok = true;
    for (const p of quick.patches) {
      const r = V.applyPatch(cur, p, board);
      if (!r.ok) {
        ok = false;
        break;
      }
      cur = r.spec;
    }
    return { comment: e.comment, how: 'in code', ok, requests: 0, modelCalls: 0, ms: round(performance.now() - t0, 2), firstMs: round(performance.now() - t0, 2), inTokens: 0, outTokens: 0, modelMsUnscaled: 0 };
  }
  const adj = V.readAdjust ? V.readAdjust(e.comment) : [];
  if (adj.length) {
    const r = adj.map((a) => V.adjust(s, a)).filter(Boolean);
    let cur = s;
    for (const x of r) for (const p of x.patches) cur = V.applyPatch(cur, p, board).spec ?? cur;
    return { comment: e.comment, how: 'in code (one decision of the look)', ok: r.length > 0, requests: 0, modelCalls: 0, ms: round(performance.now() - t0, 2), firstMs: round(performance.now() - t0, 2), inTokens: 0, outTokens: 0, modelMsUnscaled: 0 };
  }
  const r = await call('refine', refineBody(pid, A.brief, s, e.comment, e.selection), uid, { stream: true });
  return { comment: e.comment, how: r.modelCalls ? `model (${r.made?.[0]?.model ?? '?'})` : 'route, in code', ok: r.ok, requests: 1, modelCalls: r.modelCalls, ms: round(r.ms), firstMs: round(r.firstMs), inTokens: r.inTokens, outTokens: r.outTokens, modelMsUnscaled: round((r.modelMs ?? 0) / SCALE), dbTrips: r.trips };
}
if (spec) {
  const rows = [];
  for (const e of SMALL) rows.push(await smallEdit(users[2], 'p_perf_e', spec, e));
  report.scenarios.E = { name: 'Small refinement', edits: rows, total: { edits: rows.length, ok: rows.filter((r) => r.ok).length, requests: sum(rows, (r) => r.requests), modelCalls: sum(rows, (r) => r.modelCalls), inCode: rows.filter((r) => r.modelCalls === 0).length, ms: round(sum(rows, (r) => r.ms)), modelMsUnscaled: round(sum(rows, (r) => r.modelMsUnscaled)), inTokens: sum(rows, (r) => r.inTokens), outTokens: sum(rows, (r) => r.outTokens) } };
  log('E', J(report.scenarios.E.total));
}

// ── F · a complex refinement: the whole layout, decisions kept ──
if (spec) {
  const f = await call('refine', refineBody('p_perf_f', A.brief, spec, 'Rework the whole layout so it reads as an editorial report, and keep the palette and type exactly as they are'), users[2], { stream: true });
  const applied = f.json?.patch && f.json?.applies ? V.applyPatch(spec, f.json.patch, board) : null;
  report.scenarios.F = { name: 'Complex refinement', steps: [stepRow('refine', f)], total: total([stepRow('refine', f)]), tier: f.json?.complexity?.tier ?? null, keptTokens: applied?.ok ? J(applied.spec.tokens) === J(spec.tokens) : null };
  log('F', J(report.scenarios.F.total));
}

// ── R · reliability: a stalled provider, a cancelled generation, an answer that does not hold ──
{
  const rel = {};
  // a stalled provider on the first design: when does the designer hear something, and what?
  mode = { hang: (stage) => stage === 'generate', fail: null };
  // a short premium limit and operation deadline, so the scenario ends inside the bench's own 25 s wait (production:
  // 40 s and 55 s); a checkout that has no deadline ignores the second
  process.env.SOCRIAUX_PREMIUM_TIMEOUT_MS = '5000';
  process.env.SOCRIAUX_ROUTE_BUDGET_MS = '12000';
  const stall = await call('generate', generateBody('p_perf_r1', A.brief, A.art), users[3], { stream: true, timeoutMs: 25_000 });
  rel.stalledProvider = { answered: stall.status !== 0, status: stall.status, ms: round(stall.ms), firstMs: round(stall.firstMs), error: stall.json?.error ?? stall.error ?? null, modelCalls: stall.modelCalls };
  mode = { hang: null, fail: null };
  delete process.env.SOCRIAUX_PREMIUM_TIMEOUT_MS;
  delete process.env.SOCRIAUX_ROUTE_BUDGET_MS;
  // the designer cancels a generation a moment after starting it: does the model stop?
  const ctl = new AbortController();
  const before = calls().length;
  const slowScale = SCALE;
  setTimeout(() => ctl.abort(), Math.max(50, measuredMs('generate', 'gpt-6.1-sol', 'medium') * slowScale * 0.3));
  const cancelled = await call('generate', generateBody('p_perf_r2', A.brief, A.art), users[3], { stream: true, signal: ctl.signal, timeoutMs: 25_000 });
  // let the route notice, then read what happened to the model call
  await new Promise((r) => setTimeout(r, Math.max(200, measuredMs('generate', 'gpt-6.1-sol', 'medium') * slowScale)));
  const made = calls().slice(before);
  rel.cancelled = { modelCalls: made.length, modelOutcome: made.map((c) => c.outcome), stoppedEarly: made.some((c) => ['aborted', 'abandoned'].includes(c.outcome)), routeMs: round(cancelled.ms) };
  // an answer that does not hold together: nothing changes, and the designer is told
  mode = { hang: null, fail: (stage) => (stage === 'generate' ? '{"title": "Half a design", "sections": [' : undefined) };
  const broken = await call('generate', generateBody('p_perf_r3', A.brief, A.art), users[3], { stream: true });
  rel.brokenAnswer = { status: broken.status, error: broken.json?.error ?? null, spec: !!broken.json?.spec };
  mode = { hang: null, fail: null };
  // the provider refuses for its rate limit: how the designer hears it
  mode = { hang: null, fail: (stage) => (stage === 'discover' ? Object.assign(new Error('Rate limit reached for requests'), { status: 429, headers: { 'retry-after': '7' } }) : undefined) };
  const limited = await call('discover', discoverBody('p_perf_r4'), users[3], { stream: true });
  rel.providerLimit = { status: limited.status, error: limited.json?.error ?? null, retryAfter: limited.json?.retryAfter ?? null, modelCalls: limited.modelCalls };
  mode = { hang: null, fail: null };
  report.scenarios.R = { name: 'Reliability', ...rel };
  log('R', J(rel));
}

// ── G · a workshop: designers at once, each starting fresh and refining; one double-click each ──
{
  const before = calls().length;
  const t0 = performance.now();
  let peak = 0;
  const watch = setInterval(() => {
    const live = calls().filter((c) => c.outcome === 'pending').length;
    if (live > peak) peak = live;
  }, 5);
  const people = users.slice(0, USERS);
  const runs = await Promise.all(
    people.map(async (uid, i) => {
      const pid = `p_perf_g${i}`;
      const steps = [];
      const d1 = await call('discover', discoverBody(pid), uid, { stream: true });
      steps.push(d1);
      const qs = (d1.json?.questions ?? []).map((q) => ({ ...q, answer: q.options?.[0] ?? 'yes' }));
      const b = await call('brief', briefBody(pid, qs), uid, { stream: true });
      steps.push(b);
      const brief = b.json?.brief;
      if (!brief) return { uid, steps, duplicate: null };
      // the "Use this direction" button pressed twice, 5 ms apart: the same action twice
      const op = `op_${pid}_gen`;
      const [g1, g2] = await Promise.all([call('generate', generateBody(pid, brief, A.art), uid, { stream: true, op }), new Promise((r) => setTimeout(r, 5)).then(() => call('generate', generateBody(pid, brief, A.art), uid, { stream: true, op }))]);
      steps.push(g1, g2);
      const s = g1.json?.spec ? V.normalizeSpec(g1.json.spec, board) : null;
      const edits = s ? [await smallEdit(uid, pid, s, SMALL[0]), await smallEdit(uid, pid, s, SMALL[4])] : [];
      return { uid, steps, edits, duplicate: { first: g1.status, second: g2.status, secondSame: J(g1.json?.spec?.sections ?? null) === J(g2.json?.spec?.sections ?? null) } };
    })
  );
  clearInterval(watch);
  const made = calls().slice(before);
  const all = runs.flatMap((r) => r.steps);
  const gens = made.filter((c) => c.stage === 'generate').length;
  report.scenarios.G = {
    name: `Workshop: ${people.length} designers at once`,
    designers: people.length,
    requests: all.length + sum(runs, (r) => sum(r.edits ?? [], (e) => e.requests)),
    routeRequests: all.length,
    succeeded: all.filter((s) => s.ok).length,
    failed: all.filter((s) => !s.ok).map((s) => `${s.route} ${s.status} ${s.json?.error ?? s.error ?? ''}`.slice(0, 120)).slice(0, 6),
    modelCalls: made.length,
    generateCalls: gens,
    duplicateGenerationsPrevented: people.length * 2 - gens,
    peakModelCallsAtOnce: peak,
    p50Ms: round(pct(all.map((s) => s.ms), 50)),
    p95Ms: round(pct(all.map((s) => s.ms), 95)),
    p50FirstMs: round(pct(all.map((s) => s.firstMs ?? s.ms), 50)),
    wallMs: round(performance.now() - t0),
    inTokens: sum(made, (c) => c.inTokens),
    outTokens: sum(made, (c) => c.outTokens),
    editsInCode: sum(runs, (r) => (r.edits ?? []).filter((e) => e.modelCalls === 0).length),
    edits: sum(runs, (r) => (r.edits ?? []).length),
  };
  log('G', J(report.scenarios.G));
}

// ── prompts: their size per stage, and the prefix two different projects share (what a provider can cache) ──
{
  const stages = {};
  for (const c of calls()) (stages[c.stage] ??= []).push(c);
  const commonPrefix = (a, b) => {
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    return i;
  };
  // a second project through the stages that read the project, to compare prompts across projects
  const other = PROJECTS.find((p) => p.id !== proj.id && p.sections?.length) ?? PROJECTS[0];
  const otherBrief = V.normalizeBrief({ ...other.brief }, null);
  const mark = calls().length;
  globalThis.__dbLatencyMs = 0;
  await call('discover', { ...discoverBody('p_perf_x'), intent: `${other.name}. ${other.brief.objective}` }, users[4]);
  await call('brief', { ...briefBody('p_perf_x', []), intent: `${other.name}. ${other.brief.objective}` }, users[4]);
  await call('direct', directBody('p_perf_x', otherBrief), users[4]);
  await call('generate', generateBody('p_perf_x', otherBrief, null), users[4]);
  const second = calls().slice(mark);
  const out = {};
  for (const [stage, cs] of Object.entries(stages)) {
    const a = cs.find((c) => c.prompt);
    const b = second.find((c) => c.stage === stage);
    out[stage] = { medianInTokens: median(cs.map((c) => c.inTokens)), cachePrefixTokens: a && b ? Math.floor(commonPrefix(a.prompt, b.prompt) / 4) : null, maxOutputCap: a?.maxOutput ?? null };
  }
  report.prompts = out;
  log('prompts', J(out));
}

report.model_calls_to_providers = 0;
writeFileSync(join(OUT, 'perf-bench.json'), J(report, null, 1));
const S = report.scenarios;
const md = [
  `# SocriaUX performance bench`,
  '',
  `${report.at} · ${REV} · profile ${PROFILE} · model time × ${SCALE} · database round trip ${DB_MS} ms · ${USERS} designers in G · no provider called`,
  '',
  ...report.assumptions.map((a) => `- ${a}`),
  '',
  '| Scenario | Requests | Model calls | DB trips | Wall ms (scaled) | SocriaUX overhead ms | Model time, unscaled ms | Input tokens | Output tokens | OK |',
  '|---|---|---|---|---|---|---|---|---|---|',
  ...['A', 'B', 'C', 'D', 'F'].filter((k) => S[k]).map((k) => `| ${k} ${S[k].name} | ${S[k].total.requests} | ${S[k].total.modelCalls} | ${S[k].total.dbTrips} | ${S[k].total.ms} | ${S[k].total.overheadMs} | ${S[k].total.modelMsUnscaled} | ${S[k].total.inTokens} | ${S[k].total.outTokens} | ${S[k].total.ok} |`),
  S.E ? `| E ${S.E.name} (${S.E.total.edits} edits) | ${S.E.total.requests} | ${S.E.total.modelCalls} | — | ${S.E.total.ms} | — | ${S.E.total.modelMsUnscaled} | ${S.E.total.inTokens} | ${S.E.total.outTokens} | ${S.E.total.ok}/${S.E.total.edits} |` : '',
  '',
  S.E ? `Small edits: ${S.E.edits.map((e) => `“${e.comment}” → ${e.how}${e.ms != null ? ` (${e.ms} ms)` : ''}`).join('; ')}.` : '',
  '',
  `G · ${S.G.name}: ${S.G.requests} requests (${S.G.routeRequests} to the stage routes, ${S.G.succeeded} of them succeeded); ${S.G.modelCalls} model calls (${S.G.generateCalls} generations for ${S.G.designers * 2} presses); peak ${S.G.peakModelCallsAtOnce} model calls at once; p50 ${S.G.p50Ms} ms, p95 ${S.G.p95Ms} ms (scaled); first response p50 ${S.G.p50FirstMs} ms.${S.G.failed.length ? ` Failed: ${S.G.failed.join('; ')}` : ''}`,
  '',
  `R · stalled provider: ${S.R.stalledProvider.answered ? `answered ${S.R.stalledProvider.status} after ${S.R.stalledProvider.ms} ms (${S.R.stalledProvider.error ?? 'a result'})` : `no answer within 25 s`}. Cancelled generation: the model call ${S.R.cancelled.stoppedEarly ? 'stopped' : `ran to the end (${S.R.cancelled.modelOutcome.join(', ')})`}. An answer that did not hold: ${S.R.brokenAnswer.status}, ${S.R.brokenAnswer.spec ? 'a spec came back' : 'nothing changed'}. The provider's rate limit: ${S.R.providerLimit.status} “${S.R.providerLimit.error ?? ''}”.`,
  '',
  '| Stage | Median input tokens | Prefix shared by two projects (cacheable) | Output cap sent |',
  '|---|---|---|---|',
  ...Object.entries(report.prompts).map(([k, v]) => `| ${k} | ${v.medianInTokens} | ${v.cachePrefixTokens ?? '—'} | ${v.maxOutputCap ?? '—'} |`),
].join('\n');
writeFileSync(join(OUT, 'perf-bench.md'), md);
log(`\nwrote ${join(OUT, 'perf-bench.json')} and perf-bench.md`);
process.exit(0);
