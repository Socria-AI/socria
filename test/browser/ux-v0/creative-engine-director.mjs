// test/browser/ux-v0/creative-engine-director.mjs — the creative director, answered for real, for the benchmark.
//
// The orchestration is the product's own (lib/ux-v0/graphics/director/flow.ts: designFlow, editFlow — understand,
// decide, execute, evaluate), with the product's instructions (principles.ts), messages (prompts.ts), gates
// (schema.ts), executor (apply.ts, protect.ts), journal and measures. Only the TRANSPORT differs from the app (whose
// routes need a signed-in person), in one of two ways:
//
//   BENCH_LIVE=api      straight to the provider through the product's own call path (lib/ux-v0/ask.ts askJson with
//                       each stage's route: the model, effort, caps and prices the deployment would use). Real, paid
//                       calls; needs ANTHROPIC_API_KEY in the environment. Latency, tokens and cost are measured.
//   BENCH_LIVE=agents   each request is written to a file (the instructions once, the message, the picture when there
//                       is one) and answered by a Claude model run outside this script, which writes its JSON answer
//                       to a file beside it; this script then carries on from the answers. A request not yet answered
//                       makes the test "pending": the script lists what is waiting and exits; run again when the
//                       answers are there. The answers are a real model's to the product's real prompts, but not
//                       through the product's API path: latency and cost are NOT measured in this mode.
//
// Without BENCH_LIVE this module reports itself blocked and nothing is asked of anyone.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from './env.mjs';

export class Pending extends Error {
  constructor(key) {
    super(`waiting for an answer to ${key}`);
    this.name = 'Pending';
    this.key = key;
  }
}

export async function makeDirector({ V, settle, measure, picture, out }) {
  const MODE = process.env.BENCH_LIVE;
  if (MODE !== 'api' && MODE !== 'agents') return { blocked: 'BENCH_LIVE is not set (api | agents): nothing was asked of a model' };
  const CR = await import(pathToFileURL(join(ROOT, 'test/.tmp/creative-under-test.mjs')).href);
  const { dirPrinciples: P, dirPrompts: PR, dirSchema: SC, dirFlow: FL, dirFrame: FR, dirProtect: PT, dirJournal: JR, dirTier: TR } = CR;
  const ED = V.gfxEdit;
  const D = V.gfxDoc;
  const system = P.directorSystem();
  const calls = [];
  const pending = [];
  const env = { ...process.env };
  const ids = (sheet) => new Set(sheet.objects.map((o) => o.id));

  // ── the two transports ──
  let askOne;
  if (MODE === 'api') {
    if (!process.env.ANTHROPIC_API_KEY) return { blocked: 'BENCH_LIVE=api needs ANTHROPIC_API_KEY in the environment' };
    // this container points the SDK's default base URL at its own tooling; the benchmark talks to the provider itself
    delete process.env.ANTHROPIC_BASE_URL;
    delete process.env.ANTHROPIC_AUTH_TOKEN;
    askOne = async (stage, user, opts) => {
      const route = CR.routeFor(stage, opts.tier ? { tier: opts.tier } : {}, env);
      const t0 = Date.now();
      const asked = await CR.askJson(null, route.ladder, { system, user, maxTokens: CR.MAX_TOKENS[stage], label: `bench/${stage}`, stream: true, reasoningRoom: CR.reasoningRoomFor(route.model, route.effort, env), ...(opts.picture ? { images: [{ url: opts.picture, detail: 'high' }] } : {}) }, route);
      calls.push({ stage, model: asked.model, effort: asked.effort, tier: route.tier, ms: Date.now() - t0, ttftMs: asked.ttftMs, input: asked.usage.input, cached: asked.usage.cached, output: asked.usage.output, reasoning: asked.usage.reasoning ?? 0, cost: asked.usage.cost ?? 0, incomplete: asked.incomplete });
      return asked.json;
    };
  } else {
    const X = `${out}exchange/`;
    mkdirSync(X, { recursive: true });
    writeFileSync(`${X}system.md`, system);
    askOne = async (stage, user, opts) => {
      const key = `${stage}-${createHash('sha256').update(`${stage}\n${user}`).digest('hex').slice(0, 12)}`;
      const ans = `${X}ans-${key}.json`;
      if (existsSync(ans)) {
        const raw = readFileSync(ans, 'utf8');
        calls.push({ stage, model: 'claude (agent)', effort: 'agent', tier: opts.tier ?? null, ms: null, ttftMs: null, input: Math.round((system.length + user.length) / 3.6) + (opts.picture ? 1500 : 0), cached: 0, output: Math.round(raw.length / 3.4), reasoning: 0, cost: null, incomplete: null, estimated: true });
        try {
          return JSON.parse(raw);
        } catch {
          const m = raw.match(/\{[\s\S]*\}/);
          try {
            return m ? JSON.parse(m[0]) : null;
          } catch {
            return null;
          }
        }
      }
      let pic = null;
      if (opts.picture) {
        pic = `${X}pic-${key}.jpg`;
        writeFileSync(pic, Buffer.from(opts.picture.split(',')[1], 'base64'));
      }
      writeFileSync(`${X}req-${key}.md`, user);
      pending.push({ key, stage, request: `${X}req-${key}.md`, picture: pic, answer: ans, system: `${X}system.md` });
      throw new Pending(key);
    };
  }
  const answer = (v) => (v ? { ok: true, value: v } : { ok: false, reason: 'unreadable' });
  const transport = {
    design: async (b) => {
      const f = CR.formatOf(b.brief.formats[0]);
      return answer(SC.normalizeDesign(await askOne('graphic-design', PR.designUser({ brief: b.brief, frame: FR.frameOf(f), formatLabel: f.label, memory: b.memory, decided: b.decided, avoid: b.avoid, another: b.another }), {})));
    },
    edit: async (b) => answer(SC.normalizeEdit(await askOne('creative-edit', PR.editUser({ words: b.words, sheet: b.sheet, memory: b.memory, asked: b.asked ? { text: b.asked.text, options: b.asked.options.map((o) => o.label) } : null, protectedSaid: PT.protectionsIn(b.words).said, hasPicture: !!b.picture }), { tier: TR.editTier(b.words).tier, picture: b.picture }), { ids: ids(b.sheet), given: b.words })),
    review: async (b) => answer(SC.normalizeReview(await askOne('graphic-review', PR.reviewUser(b), { picture: b.picture }), { ids: ids(b.sheet) })),
  };
  const bench = { measure, settle, picture };
  const usageOf = (list) =>
    list.length
      ? { calls: list.length, estimated: list.some((u) => u.estimated), input: list.reduce((s, u) => s + u.input, 0), cached: list.reduce((s, u) => s + u.cached, 0), output: list.reduce((s, u) => s + u.output, 0), reasoning: list.reduce((s, u) => s + u.reasoning, 0), cost: list.some((u) => u.cost == null) ? null : +list.reduce((s, u) => s + u.cost, 0).toFixed(4), ms: list.some((u) => u.ms == null) ? null : list.reduce((s, u) => s + u.ms, 0), byCall: list.map((u) => `${u.stage} ${u.model}${u.ms == null ? '' : ` ${u.ms}ms`} in ~${u.input} out ~${u.output}`) }
      : null;
  const REVIEW = process.env.REVIEW !== 'off';
  const BASE = { name: 'base', language: 'directed', tokens: { colors: { background: '#f6f4ef', surface: '#ffffff', text: '#16181c', muted: '#5d5a52', accent: '#2b4c6f', accentText: '#ffffff', line: '#d8d3c6' }, fonts: { display: 'Inter', body: 'Inter' } }, look: { case: 'sentence', tracking: 'normal', weight: 700 }, form: null, intensity: 50 };

  return {
    mode: MODE,
    calls,
    pending,
    Pending,
    async compose(brief, _projectId, opts = {}) {
      const mark = calls.length;
      const t0 = Date.now();
      const r = await FL.designFlow(transport, bench, brief, BASE, { memory: { brief: brief.purpose, kind: brief.kind }, review: REVIEW, name: brief.content.headline, now: 1700000000000, ...(opts.avoid ? { avoid: opts.avoid } : {}) });
      if (!r.ok) throw new Error(`the design could not be made: ${r.reason}${r.error ? ` (${r.error})` : ''}`);
      return { doc: r.doc, dir: r.dir, ms: MODE === 'api' ? Date.now() - t0 : null, model: calls[mark]?.model ?? null, usage: usageOf(calls.slice(mark)), said: [`Idea: ${r.design.concept.idea}`, ...r.design.concept.decisions], direction: r.design.direction, problems: r.problems, findings: r.measured.findings, review: r.review, instructions: r.design.program.elements.length };
    },
    async edit(doc, words, dir, kind, memory = {}) {
      const mark = calls.length;
      const t0 = Date.now();
      const board = doc.artboards[0];
      const protection = PT.protectionsIn(words);
      // an exact change to something named, read whole by the precise reader and really changing the design: in code
      if (TR.editTier(words).tier === 'economy' && !protection.keep.length && !protection.only && !/[,;]|\band\b/i.test(words)) {
        const e = ED.readGraphicEdit(words, D.boardView(doc, board.id), { artboard: board.id, selection: [], dir, measure, kind });
        if (e && e.ops.length && !e.question) {
          const r = D.applyOps(D.boardView(doc, board.id), e.ops);
          if (r.ok) {
            const next = D.fromBoardView(doc, r.doc, board.id);
            if (!JR.diffBoards(board, next.artboards[0], board.tokens ?? doc.tokens, next.artboards[0].tokens ?? next.tokens).none) return { path: 'precise reader (in code, no model)', doc: JR.recordTurn(doc, next, board.id, { said: words, did: e.label, level: 'object', at: 1700000000000 }), said: e.label, ms: Date.now() - t0, question: null, plan: null, model: null, usage: null, failed: [] };
          }
        }
      }
      const r = await FL.editFlow(transport, bench, doc, board.id, words, { kind, memory: memory.brief ? { brief: memory.brief } : {}, review: REVIEW, now: 1700000000000 });
      const usage = usageOf(calls.slice(mark));
      const ms = MODE === 'api' ? Date.now() - t0 : null;
      const who = `director (${calls[mark]?.model ?? '?'})`;
      if (r.kind === 'question') return { path: `${who}: a question`, doc, said: r.question.text, ms, question: `${r.question.text} — ${r.question.options.map((o) => o.label).join(' / ')}`, plan: null, understanding: r.edit.understanding, model: calls[mark]?.model, usage, failed: [] };
      if (r.kind === 'nothing') return { path: `${who}: nothing changed`, doc, said: FL.saidOfEdit(r), ms, question: null, plan: null, understanding: r.edit.understanding, edits: r.edit.edits.length, failed: r.outcome.failed, kept: r.outcome.kept, model: calls[mark]?.model, usage };
      if (r.kind !== 'done') return { path: `${who}: ${r.kind}`, doc, said: r.error ?? r.kind, ms, question: null, plan: null, model: calls[mark]?.model, usage, failed: [r.kind] };
      return { path: `${who}, ${r.edit.understanding.level}`, doc: r.doc, said: FL.saidOfEdit(r), ms, question: null, plan: null, understanding: r.edit.understanding, edits: r.edit.edits.length + (r.edit.palette ? 1 : 0) + (r.edit.fonts ? 1 : 0), failed: r.outcome.failed, kept: r.outcome.kept, notes: r.outcome.notes, review: r.review, model: calls[mark]?.model, usage };
    },
  };
}
