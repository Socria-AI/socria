import 'server-only';
// lib/ux-v0/stage-server.ts — every SocriaUX model stage, run the same way.
//
// The questions, the moodboard's other direction, the brief, art direction, generation, a change and a
// critique each build their prompt and read their answer; everything between is here, once:
//
//   ONE OPERATION, ONCE. The browser names each action (x-operation-id). The same action arriving again — a
//   double-click, a network retry — waits for the first and gets its answer: one model call, one charge; for
//   REUSE_MS after it finished, too. An identical request without a name is the same action only while the
//   first is still running. Only an answer that succeeded is reused; a failure or a cancel is forgotten, so
//   trying again really tries again.
//
//   ENOUGH AT ONCE, NOT MORE. A person has at most SOCRIAUX_USER_CONCURRENCY model operations running
//   (default 3); an instance runs at most SOCRIAUX_MAX_CONCURRENT (default 0: no limit) — set it for a
//   workshop so a room of designers queues politely instead of tripping the provider's rate limit. Past
//   either, the answer says so with when to try again (these counts are per server instance).
//
//   CHECKS AT ONCE. The rate limit, then the daily caps, the budgets and the Socria plan and allowance are
//   read together, not one after another.
//
//   A DEADLINE. Every operation ends within SOCRIAUX_ROUTE_BUDGET_MS (default 55 s, inside the routes' 60 s
//   maxDuration), so the designer always hears back from SocriaUX itself — never a platform timeout's empty
//   page. A premium model too slow for it leaves the economy model its time (lib/ux-v0/ask.ts askRouted).
//
//   STREAMED PROGRESS. A browser that asks for it (Accept: application/x-ndjson) gets one JSON line per
//   event at once: accepted, checking, the model asked, still thinking (with the time so far), writing (so
//   many characters), a fallback, finishing — and then the result. Nothing is a percentage, and no step is
//   said before it happens. Anyone else gets the plain JSON answer, as before.
//
//   CANCEL. When the browser cancels (or leaves), the request's signal aborts the model call, which closes
//   its stream: the provider stops generating, and nothing is changed or charged beyond what it read.
//
//   THE RECORD. Each operation's time, tokens, money, retries and outcome (lib/ux-v0/telemetry.ts) is written
//   with its usage, logged as one line without prompts or the designer's words, and sent back with the answer
//   for the cost panel's diagnostics.
//
//   UNUSUAL USE. A person whose last ten minutes hold more than SOCRIAUX_UNUSUAL_CALLS model operations
//   (default 60) or more than SOCRIAUX_UNUSUAL_USD spent (default 0.50) is flagged in the logs: one
//   "[ux-v0 unusual]" line, the person hashed, at most once per ten minutes. It blocks nothing (the budgets,
//   the daily caps and the rate limit do that); it tells whoever runs a workshop where to look.

import { NextResponse, type NextRequest } from 'next/server';
import OpenAI from 'openai';
import { auth } from '@clerk/nextjs/server';
import { cacheKey } from '../model-router';
import { failureOf } from '../model-params';
import { tracked } from '../openai-usage';
import { enforceRateLimit } from '../rate-limit';
import { meterFor, sleepAnswer, sleepGate } from '../sleep-server';
import { aborted, askRouted, timedOut, type Asked, type AskProgress } from './ask';
import { budgets } from './budget';
import { economyRoute, providerOf, reasoningRoomFor, type Tier } from './model';
import type { JsonFormat } from './schemas';
import { logLine, shortHash, usageFields, type OperationRecord, type Outcome } from './telemetry';
import type { CallKind } from './types';
import { gate, noticeOf, recordUsage, type BudgetView } from './usage-server';

type Env = Record<string, string | undefined>;

/** What a stage answers: a status (200 unless said) and the JSON body the browser reads. */
export interface StageAnswer {
  status?: number;
  body: Record<string, unknown>;
}

export interface StagePrompt {
  system: string;
  user: string;
  maxTokens: number;
  temperature: number;
  format?: JsonFormat;
  images?: { url: string; detail: 'low' | 'high' }[];
  /** the tier this call asks for (a complex change asks for premium); the stage's own when unset */
  tier?: Tier;
  /** characters to add to the estimate for what is not text (an image) */
  extraChars?: number;
  /** the part of the prompt that is the same for every project, for the provider's cache key */
  cacheScope?: string;
}

export interface Stage {
  stage: CallKind;
  /** the operation, in a word, for the record: turn, direction, synthesize, revise, propose, generate, patch, critique */
  operation: string;
  /** the label the call is logged under (lib/openai-usage.ts tracked) */
  label: string;
  prompt: StagePrompt;
  /** the answer, read from the model's: the body the browser gets, or a refusal with its status */
  finish: (asked: Asked) => StageAnswer | Promise<StageAnswer>;
  /** after the answer is sent (still within the request): Unsplash's download ping, say */
  after?: (answer: StageAnswer) => Promise<void>;
}

export interface StageContext {
  userId: string;
  orgId: string | null;
  projectId: string;
  /** the raw request body's fingerprint, for recognising the same request sent twice */
  fingerprint: string;
}

// ── the settings ─────────────────────────────────────────────────────

const intEnv = (v: string | undefined, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  const n = parseInt(v ?? '', 10);
  return Number.isFinite(n) && n >= min ? Math.min(n, max) : fallback;
};
/** Within the routes' maxDuration (60 s): the time an operation may take, all of it. */
export const routeBudgetMs = (env: Env = process.env) => intEnv(env.SOCRIAUX_ROUTE_BUDGET_MS, 55_000, 5_000, 800_000);
export const userConcurrency = (env: Env = process.env) => intEnv(env.SOCRIAUX_USER_CONCURRENCY, 3, 1, 50);
export const maxConcurrent = (env: Env = process.env) => intEnv(env.SOCRIAUX_MAX_CONCURRENT, 0, 0, 10_000);
/** How long a finished operation's answer is kept for the same (named) action arriving again (ms). */
export const REUSE_MS = 30_000;

// ── one operation, once; enough at once ──────────────────────────────

interface Running {
  key: string;
  userId: string;
  stage: CallKind;
  startedAt: number;
  promise: Promise<StageAnswer>;
  done: StageAnswer | null;
  doneAt: number;
  named: boolean;
  /** everyone listening to this operation's progress: the request that began it, and any arriving again */
  listeners: Set<Emit>;
}
const running = new Map<string, Running>();
const counts = { total: 0, byUser: new Map<string, number>() };

/** For the tests: what is running and kept now. */
export const operationsNow = () => ({ running: [...running.values()].filter((r) => !r.done).length, kept: [...running.values()].filter((r) => r.done).length, total: counts.total });
/** For the tests: start from nothing. */
export function forgetOperations(): void {
  running.clear();
  counts.total = 0;
  counts.byUser.clear();
}

function prune(now: number) {
  for (const [k, r] of running) if (r.done && (!r.named || now - r.doneAt > REUSE_MS)) running.delete(k);
}

/** The browser's name for this action, when it gave a usable one. */
export function operationIdOf(req: NextRequest): string | null {
  const v = req.headers.get('x-operation-id') ?? '';
  return /^[A-Za-z0-9_.:-]{8,96}$/.test(v) ? v : null;
}

const wantsStream = (req: NextRequest) => /application\/x-ndjson/.test(req.headers.get('accept') ?? '');

// ── the answers SocriaUX gives when something stops it ───────────────

const STAGE_WORDS: Record<CallKind, string> = {
  discover: 'Thinking about the next question',
  direction: 'Finding another direction',
  brief: 'Writing the brief',
  'refine-brief': 'Changing the brief',
  'art-direction': 'Writing the directions',
  generate: 'Designing',
  refine: 'Working out the change',
  critique: 'Reading the design',
  'creative-edit': 'Working out the change',
  'graphic-design': 'Designing',
  'graphic-review': 'Looking at the result',
  'studio-questions': 'Thinking about what to ask',
  image: 'Making the picture',
};
const secondsOf = (ms: number) => Math.max(1, Math.round(ms / 1000));

function retryAfterOf(e: unknown): number | null {
  const h = (e as { headers?: Record<string, string> | Headers })?.headers;
  const v = h && typeof (h as Headers).get === 'function' ? (h as Headers).get('retry-after') : (h as Record<string, string> | undefined)?.['retry-after'];
  const n = parseFloat(String(v ?? ''));
  return Number.isFinite(n) && n > 0 ? Math.min(120, Math.ceil(n)) : null;
}

/** A failure, as the designer hears it: what happened, that nothing changed, and what to do. */
export function failureAnswer(stage: CallKind, e: unknown, why: 'cancelled' | 'timeout' | null, budgetMs: number): { answer: StageAnswer; outcome: Outcome; note: string } {
  if (why === 'cancelled') return { answer: { status: 499, body: { error: 'Cancelled. Nothing changed.', cancelled: true } }, outcome: 'cancelled', note: 'cancelled by the designer' };
  if (why === 'timeout' || timedOut(e)) {
    return {
      answer: { status: 504, body: { error: `${STAGE_WORDS[stage]} took longer than ${secondsOf(budgetMs)} seconds, so SocriaUX stopped it. Nothing changed. Try again — it is usually quicker the second time; if it keeps happening, the model provider is slow just now.`, timeout: true } },
      outcome: 'timeout',
      note: 'deadline passed',
    };
  }
  const status = (e as { status?: number })?.status;
  if (status === 429 || failureOf(e) === 'transient') {
    const after = retryAfterOf(e) ?? 10;
    return {
      answer: { status: 503, body: { error: `The AI provider is busy right now${status === 429 ? ' (its rate limit)' : ''}. Nothing changed; try again in about ${after} seconds.`, retryAfter: after, providerLimit: status === 429 } },
      outcome: status === 429 ? 'provider-limit' : 'failed',
      note: status === 429 ? 'provider rate limit' : 'provider unavailable',
    };
  }
  if ((e as { name?: string })?.name === 'SocriauxInterrupted') return { answer: { status: 502, body: { error: 'The answer was interrupted on its way. Nothing changed; try again.' } }, outcome: 'failed', note: 'stream interrupted' };
  return { answer: { status: 502, body: { error: 'SocriaUX could not answer just now. Your work is saved; try again in a moment.' } }, outcome: 'failed', note: 'error' };
}

// ── the operation ────────────────────────────────────────────────────

type Emit = (event: Record<string, unknown>) => void;

async function execute(req: NextRequest, ctx: StageContext, s: Stage, op: string, t0: number, emit: Emit, env: Env, cancel: AbortSignal): Promise<{ answer: StageAnswer; record: OperationRecord }> {
  const budgetMs = routeBudgetMs(env);
  const deadlineAt = t0 + budgetMs;
  const controller = new AbortController();
  let why: 'cancelled' | 'timeout' | null = null;
  const onCancel = () => {
    why ??= 'cancelled';
    controller.abort();
  };
  // the browser cancelling: the request's own signal, or the streamed answer's reader letting go
  if (req.signal?.aborted || cancel.aborted) onCancel();
  req.signal?.addEventListener?.('abort', onCancel, { once: true });
  cancel.addEventListener('abort', onCancel, { once: true });
  const deadline = setTimeout(() => {
    why ??= 'timeout';
    controller.abort();
  }, Math.max(0, deadlineAt - Date.now()));
  let askedAt: number | null = null;
  let asked: Asked | null = null;
  // the model last asked: its provider is the record's, even when no answer came back
  let askedModel: string | null = null;
  let budget: BudgetView | undefined;
  // while the model reasons nothing streams back: the browser hears the time so far, after every 3 s of silence
  let lastEmit = Date.now();
  const beat = setInterval(() => {
    if (Date.now() - lastEmit >= 3000) {
      emit({ type: 'progress', phase: askedAt ? 'thinking' : 'checking', elapsedMs: Date.now() - t0 });
      lastEmit = Date.now();
    }
  }, 500);
  const tell: Emit = (ev) => {
    lastEmit = Date.now();
    emit(ev);
  };
  const record = (outcome: Outcome, note?: string): OperationRecord => ({
    op,
    stage: s.stage,
    operation: s.operation,
    provider: asked ? providerOf(asked.model) : askedAt && askedModel ? providerOf(askedModel) : 'none',
    ...usageFields(asked?.usage),
    api: asked?.api ?? null,
    startedAt: t0,
    queuedMs: (askedAt ?? Date.now()) - t0,
    ttftMs: asked?.ttftMs ?? null,
    modelMs: asked?.modelMs ?? (askedAt ? Date.now() - askedAt : null),
    totalMs: Date.now() - t0,
    retries: Math.max(0, (asked?.attempts ?? 1) - 1),
    outcome,
    cancelled: why === 'cancelled',
    ...(note ? { note } : {}),
  });
  try {
    // (a turn later, so the streamed answer's reader, attached just after this begins, hears it)
    await Promise.resolve();
    tell({ type: 'progress', phase: 'checking' });
    const p = s.prompt;
    const [g, sleep] = await Promise.all([
      gate(ctx.userId, ctx.projectId, s.stage, p.system.length + p.user.length + (p.extraChars ?? 0), p.tier ? { tier: p.tier } : {}, Date.now(), ctx.orgId),
      sleepGate(req, ctx.userId),
    ]);
    if (!g.ok) return { answer: { status: 429, body: { error: g.error, limit: true } }, record: record('limited', 'budget or daily cap') };
    budget = g.budget;
    if (sleep.refuse) {
      const body = await sleep.refuse.json().catch(() => ({ error: 'SocriaUX is resting for now.' }));
      return { answer: { status: sleep.refuse.status, body }, record: record('limited', 'allowance') };
    }
    if (sleep.meter) meterFor(sleep.meter);
    if (controller.signal.aborted) throw Object.assign(new Error('Request was aborted.'), { name: 'APIUserAbortError' });
    // each provider's key: a route whose provider has none is not configured; a fallback whose provider has none is not offered
    const keyed = (model: string) => !!(providerOf(model) === 'anthropic' ? process.env.ANTHROPIC_API_KEY : process.env.OPENAI_API_KEY);
    if (!keyed(g.route.model)) return { answer: { status: 500, body: { error: `The model for this step (${g.route.model}) is not configured on this deployment.` } }, record: record('failed', 'provider key missing') };
    const economy = economyRoute(s.stage);
    // the OpenAI client is made only where it can be asked (its constructor refuses a missing key); a Claude call uses Anthropic's
    const openai = tracked(new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'not-configured' }), s.label);
    let lastChars = 0;
    asked = await askRouted(
      openai,
      g.route,
      {
        system: p.system,
        user: p.user,
        maxTokens: p.maxTokens,
        temperature: p.temperature,
        images: p.images,
        format: p.format,
        label: s.stage,
        maxRetries: budgets().maxRetries,
        stream: env.SOCRIAUX_STREAM !== 'off',
        signal: controller.signal,
        deadlineAt,
        cacheKey: cacheKey('ux-v0', `${s.stage}:${p.cacheScope ?? ''}`),
        reasoningRoom: reasoningRoomFor(g.route.model, g.route.effort, env),
        onProgress: (x: AskProgress) => {
          if (x.phase === 'asked') {
            askedModel = x.model;
            const fallback = askedAt != null;
            askedAt ??= Date.now();
            tell({ type: 'progress', phase: fallback ? 'fallback' : 'asked', model: x.model, tier: fallback ? 'economy' : g.route.tier, elapsedMs: Date.now() - t0 });
          } else if ((x.chars ?? 0) - lastChars >= 400 || lastChars === 0) {
            lastChars = x.chars ?? 0;
            tell({ type: 'progress', phase: 'writing', chars: lastChars, elapsedMs: Date.now() - t0 });
          }
        },
      },
      keyed(economy.model) ? economy : null
    );
    tell({ type: 'progress', phase: 'finishing', elapsedMs: Date.now() - t0 });
    const answer = await s.finish(asked);
    const ok = (answer.status ?? 200) < 300;
    const rec = record(ok ? (asked.fellBack ? 'fallback' : 'ok') : 'invalid', ok ? asked.fellBack : String(answer.body.error ?? '').slice(0, 120));
    // the call's usage carries its time on the server, so a project can say what each accepted design took
    const used = (answer.body.usage ?? asked.usage) as Record<string, unknown> | null | undefined;
    answer.body = { ...answer.body, usage: used ? { ...used, ms: rec.totalMs } : used, ...noticeOf(g, asked), ...(budget ? { budget } : {}) };
    return { answer, record: rec };
  } catch (e) {
    const resting = sleepAnswer(e);
    if (resting) {
      const body = await resting.json().catch(() => ({ error: 'SocriaUX is resting for now.' }));
      return { answer: { status: resting.status, body }, record: record('limited', 'allowance taken by another request') };
    }
    if (!why && controller.signal.aborted && aborted(e)) why = 'timeout';
    if (!why && timedOut(e)) why = 'timeout';
    const f = failureAnswer(s.stage, e, why, budgetMs);
    if (f.outcome === 'failed') console.error(`ux-v0 ${s.stage} failed:`, e instanceof Error ? e.message : e);
    return { answer: f.answer, record: record(f.outcome, f.note) };
  } finally {
    clearTimeout(deadline);
    clearInterval(beat);
    req.signal?.removeEventListener?.('abort', onCancel);
    cancel.removeEventListener('abort', onCancel);
  }
}

const recent = new Map<string, { at: number; usd: number }[]>();
const flagged = new Map<string, number>();
const TEN_MINUTES = 10 * 60_000;

/** Note one operation of a person's, and flag them when their last ten minutes are out of the ordinary. True when flagged now. */
export function noteUse(userId: string, usd: number, now = Date.now(), env: Env = process.env): boolean {
  const mine = (recent.get(userId) ?? []).filter((x) => now - x.at < TEN_MINUTES);
  mine.push({ at: now, usd });
  recent.set(userId, mine);
  const calls = mine.length;
  const spent = mine.reduce((t, x) => t + x.usd, 0);
  const maxCalls = intEnv(env.SOCRIAUX_UNUSUAL_CALLS, 60, 1);
  const usdSetting = parseFloat(env.SOCRIAUX_UNUSUAL_USD ?? '');
  const maxUsd = Number.isFinite(usdSetting) && usdSetting > 0 ? usdSetting : 0.5;
  if ((calls <= maxCalls && spent <= maxUsd) || now - (flagged.get(userId) ?? 0) < TEN_MINUTES) return false;
  flagged.set(userId, now);
  console.warn('[ux-v0 unusual] user=%s calls_10m=%d usd_10m=%s (limits %d calls, US$%s)', shortHash(userId), calls, spent.toFixed(4), maxCalls, maxUsd.toFixed(2));
  return true;
}

/** Write what the operation spent, and its record: within the request, after the answer is on its way. */
async function settle(ctx: StageContext, s: Stage, rec: OperationRecord, answer: StageAnswer): Promise<void> {
  console.info(logLine(rec, ctx.userId, ctx.projectId));
  if (rec.provider !== 'none') noteUse(ctx.userId, rec.cost ?? 0);
  const usage = answer.body.usage as Asked['usage'] | undefined;
  const tasks: Promise<unknown>[] = [];
  if (usage && rec.provider !== 'none' && rec.outcome !== 'coalesced') tasks.push(recordUsage(ctx.userId, ctx.projectId, s.stage, usage, Date.now(), { api: rec.api ?? 'chat', downgraded: rec.outcome === 'fallback' || !!answer.body.notice, telemetry: rec, orgId: ctx.orgId }));
  if (s.after && (answer.status ?? 200) < 300) tasks.push(s.after(answer).catch(() => undefined));
  await Promise.all(tasks);
}

/**
 * Run one model stage: the operation once, within the person's and the instance's limits, its checks at once,
 * on a deadline, streamed to a browser that asks for it, cancellable, and recorded.
 */
export async function runStage(req: NextRequest, ctx: StageContext, s: Stage, env: Env = process.env): Promise<Response> {
  const t0 = Date.now();
  prune(t0);
  const named = operationIdOf(req);
  const op = named ?? `srv_${t0.toString(36)}_${shortHash(`${ctx.fingerprint}:${Math.random()}`)}`;
  const key = `${ctx.userId}:${named ?? `same:${s.stage}:${ctx.fingerprint}`}`;
  const stream = wantsStream(req);

  // the same action again: its answer, not a second model call
  const prior = running.get(key);
  const coalesced = !!prior && (!prior.done || (prior.done.status ?? 200) < 300);
  const cancel = new AbortController();
  let work: Promise<{ answer: StageAnswer; record: OperationRecord }>;
  let listeners: Set<Emit>;
  if (prior && coalesced) {
    listeners = prior.listeners;
    work = prior.promise.then((answer) => ({ answer, record: { op, stage: s.stage, operation: s.operation, provider: 'none', model: null, api: null, tier: null, effort: null, input: 0, cached: 0, output: 0, reasoning: 0, cost: null, startedAt: t0, queuedMs: 0, ttftMs: null, modelMs: null, totalMs: Date.now() - t0, retries: 0, outcome: 'coalesced', cancelled: false, note: 'the same action, answered once' } as OperationRecord }));
  } else {
    // enough at once, not more
    const mine = counts.byUser.get(ctx.userId) ?? 0;
    const cap = maxConcurrent(env);
    const busy =
      mine >= userConcurrency(env)
        ? { status: 429, body: { error: `SocriaUX is already working on ${mine} requests for you. Let one finish, or cancel it, then try again.`, busy: true, retryAfter: 5 } }
        : cap > 0 && counts.total >= cap
          ? { status: 503, body: { error: 'SocriaUX is busy with a room full of designers just now. Nothing changed; try again in a few seconds.', busy: true, retryAfter: 8 } }
          : null;
    if (busy) {
      const rec: OperationRecord = { op, stage: s.stage, operation: s.operation, provider: 'none', model: null, api: null, tier: null, effort: null, input: 0, cached: 0, output: 0, reasoning: 0, cost: null, startedAt: t0, queuedMs: 0, ttftMs: null, modelMs: null, totalMs: 0, retries: 0, outcome: 'busy', cancelled: false, note: 'concurrency limit' };
      console.info(logLine(rec, ctx.userId, ctx.projectId));
      return respondOnce(stream, { status: busy.status, body: { ...busy.body, telemetry: rec } });
    }
    counts.total++;
    counts.byUser.set(ctx.userId, mine + 1);
    listeners = new Set<Emit>();
    const own = listeners;
    work = execute(req, ctx, s, op, t0, (ev) => own.forEach((f) => f(ev)), env, cancel.signal);
    const entry: Running = { key, userId: ctx.userId, stage: s.stage, startedAt: t0, promise: work.then((r) => r.answer), done: null, doneAt: 0, named: !!named, listeners: own };
    running.set(key, entry);
    work
      .then((r) => {
        entry.done = r.answer;
        entry.doneAt = Date.now();
        // only a named action's success is kept for it arriving again: a failure, a cancel or an unnamed request is tried afresh
        if ((r.answer.status ?? 200) >= 300 || !entry.named) running.delete(key);
      })
      .catch(() => running.delete(key))
      .finally(() => {
        counts.total = Math.max(0, counts.total - 1);
        const n = (counts.byUser.get(ctx.userId) ?? 1) - 1;
        if (n > 0) counts.byUser.set(ctx.userId, n);
        else counts.byUser.delete(ctx.userId);
      });
  }

  const finishOff = (r: { answer: StageAnswer; record: OperationRecord }) => ({
    status: r.answer.status ?? 200,
    body: { ...r.answer.body, telemetry: r.record },
    settle: () => (coalesced ? Promise.resolve(console.info(logLine(r.record, ctx.userId, ctx.projectId))) : settle(ctx, s, r.record, r.answer)),
  });

  if (!stream) {
    const r = finishOff(await work);
    await r.settle();
    return NextResponse.json(r.body, { status: r.status });
  }

  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(ctl) {
      let open = true;
      const write = (ev: Record<string, unknown>) => {
        if (!open) return;
        try {
          ctl.enqueue(enc.encode(`${JSON.stringify(ev)}\n`));
        } catch {
          open = false;
        }
      };
      listeners.add(write);
      write({ type: 'accepted', op, stage: s.stage, ...(coalesced ? { coalesced: true } : {}) });
      void (async () => {
        try {
          const r = finishOff(await work);
          listeners.delete(write);
          write({ type: 'result', status: r.status, body: r.body });
          await r.settle();
        } catch (e) {
          write({ type: 'result', status: 502, body: { error: 'SocriaUX could not answer just now. Your work is saved; try again in a moment.' } });
          console.error(`ux-v0 ${s.stage} failed:`, e instanceof Error ? e.message : e);
        } finally {
          open = false;
          try {
            ctl.close();
          } catch {
            /* already closed by the reader */
          }
        }
      })();
    },
    cancel() {
      // the browser stopped reading (it cancelled, or left): the model call is stopped with it — unless this request
      // only joined an operation another began
      if (!coalesced) cancel.abort();
    },
  });
  return new Response(body, { status: 200, headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store, no-transform', 'x-accel-buffering': 'no' } });
}

/** An answer with no operation behind it (refused before it began), in the form the browser asked for. */
export function respondOnce(stream: boolean, a: StageAnswer): Response {
  if (!stream) return NextResponse.json(a.body, { status: a.status ?? 200 });
  const line = `${JSON.stringify({ type: 'result', status: a.status ?? 200, body: a.body })}\n`;
  return new Response(line, { status: 200, headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' } });
}

/** A refusal before any operation (signed out, a bad request, the rate limit), in the form the browser asked for. */
export function refuse(req: NextRequest, res: Response, body?: Record<string, unknown>): Promise<Response> | Response {
  if (!wantsStream(req)) return res;
  return (async () => respondOnce(true, { status: res.status, body: body ?? ((await res.json().catch(() => null)) as Record<string, unknown> | null) ?? { error: 'Refused.' } }))();
}

/** The start every stage route shares: who is asking (and their organisation), the model's key, the rate limit. */
export async function admit(req: NextRequest): Promise<{ ok: true; userId: string; orgId: string | null } | { ok: false; res: Response | Promise<Response> }> {
  const a = auth() as { userId: string | null; orgId?: string | null };
  if (!a.userId) return { ok: false, res: refuse(req, NextResponse.json({ error: 'Sign in to use SocriaUX’s reasoning. Your work stays in this browser either way.', signIn: true }, { status: 401 })) };
  const limited = await enforceRateLimit(req, a.userId, 'uxmodel');
  if (limited) return { ok: false, res: refuse(req, limited) };
  if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) return { ok: false, res: refuse(req, NextResponse.json({ error: 'The model is not configured on this deployment.' }, { status: 500 })) };
  return { ok: true, userId: a.userId, orgId: typeof a.orgId === 'string' && /^[A-Za-z0-9_-]{1,96}$/.test(a.orgId) ? a.orgId : null };
}
