// app/api/chat/route.ts
// POST /api/chat
// Body: { messages: [{role, content}, ...] }
// Returns a streaming plain-text response.

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { auth } from '@clerk/nextjs/server';
import {
  buildSystemPrompt,
  resolveOpenAIModel,
  SOCRIA_MODELS,
  SOCRIA_PROMPT_VERSION,
  CORE_3_FALLBACK_MODEL,
  CORE_4_PROMPT_VERSION,
  fallbackOpenAIModel,
  resolveModel,
  sanitizeUserUnderstanding,
  hasJourneyContent,
  renderJourneyBrief,
  buildConversationStatePrompt,
  sanitizeConversationState,
  renderTranscriptForState,
  type ConversationState,
} from '@/lib/socria-prompt';
import { recall, remember } from '@/lib/mind/pipeline';
import { getProject } from '@/lib/mind/store';
import type { ActivatedSubgraph } from '@/lib/mind/activate';
import { prepareTurn, guardReply, fallbackReply, finishTurn, SentenceGate, type PreparedTurn } from '@/lib/core4/turn';
import { modelClient, collect, type ChatTurn } from '@/lib/core4/model';
import type { GuardOutcome, NoveltyVerdict } from '@/lib/core4/types';
import { waitUntil } from '@vercel/functions';
import {
  computeGuidance,
  renderTurnDirective,
  renderStateDirective,
} from '@/lib/conversation-controller';
import { enforceRateLimit } from '@/lib/rate-limit';
import { eggFor } from '@/lib/easter-eggs';
import { reportUpstream } from '@/lib/upstream-error';
import { resolvePlanForRequest } from '@/lib/socria-one-server';
import { memoryCaps, selectRelevant, visibleEntries } from '@/lib/person-memory';
import { mayUse } from '@/lib/route-guard';
import {
  briefly,
  forMemory,
  hasSubstance,
  renderForModel,
  sanitizeChatMessages,
  type ChatMsg,
} from '@/lib/chat-attachments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_INPUT_LEN = 8000;
const MAX_HISTORY = 30;
// Cap how long we wait for the semantic state pass before falling back to the
// deterministic directive, so a slow mini-call never stalls the reply.
const STATE_TIMEOUT_MS = 4500;

// Semantic living-understanding pass. Reads the thread with a cheap model and
// returns how the latest message updated the assistant's understanding. Any
// failure/timeout resolves null so the caller falls back gracefully.
async function computeConversationState(
  openai: OpenAI,
  messages: { role: string; content: string }[],
  priorUnderstanding: string | null,
  journeyBrief?: string | null
): Promise<ConversationState | null> {
  const model =
    process.env.OPENAI_STATE_MODEL ||
    process.env.OPENAI_MEMORY_MODEL ||
    'gpt-4o-mini';
  const run = openai.chat.completions
    .create({
      model,
      temperature: 0,
      max_tokens: 220,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: buildConversationStatePrompt(priorUnderstanding, journeyBrief),
        },
        { role: 'user', content: renderTranscriptForState(messages) },
      ],
    })
    .then((c) => {
      const raw = c.choices?.[0]?.message?.content;
      if (!raw) return null;
      try {
        return sanitizeConversationState(JSON.parse(raw));
      } catch {
        return null;
      }
    })
    .catch(() => null);
  const timeout = new Promise<null>((resolve) =>
    setTimeout(() => resolve(null), STATE_TIMEOUT_MS)
  );
  return Promise.race([run, timeout]);
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OpenAI key not configured on server' },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => null);
    const messages = body?.messages;

    // Server-side gate: models flagged requiresAuth need a Clerk session OR a
    // verified unlock grant. The grant is an httpOnly cookie this server
    // signed (lib/access-codes-server.ts) after checking a typed code against
    // the environment — not, as before, a constant the browser also carried,
    // accepted from a header or from `body.accessKey`. Both of those inputs
    // are caller-composed and are no longer read.
    const { userId } = auth();
    const keyUnlocked = mayUse(req, userId);
    const requestedModelId = body?.model;
    // Read the config of the model actually asked for. Written as a ternary
    // pair it silently answered "Core 2" for any Core added later — which
    // meant a new model both skipped its own auth requirement and ran on the
    // wrong prompt. resolveModel is the single place that decides.
    const requestedConfig = SOCRIA_MODELS[resolveModel(requestedModelId)];
    if (requestedConfig.requiresAuth && !userId && !keyUnlocked) {
      return NextResponse.json(
        {
          error: `Sign in to use ${requestedConfig.label}.`,
          requiresAuth: true,
        },
        { status: 401 }
      );
    }

    // Rate limit before any expensive work — the main defense against
    // cost-abuse. Anonymous callers (open Core 2 / access key) get a stricter
    // budget; the aux background routes have their own pool.
    const limited = await enforceRateLimit(req, userId, 'chat');
    if (limited) return limited;

    // ── "Can you?" ───────────────────────────────────────────────────
    //
    // Answered here, before the model and before any counter is spent: it is
    // a fixed two-word reply, so paying OpenAI for it — or charging one of a
    // free tier's two lines of thinking for it — would both be absurd. After
    // the rate limit, though, so it cannot be used to get around one.
    //
    // See lib/easter-eggs.ts for why this is a real answer in Socria's voice
    // rather than a gag, and for the care taken to keep it from firing on
    // somebody's genuine question.
    const lastUser = Array.isArray(messages)
      ? [...messages].reverse().find((m: { role?: string }) => m?.role === 'user')
      : null;
    // Not when something is attached: "can you?" over a PDF is a real question.
    const attachedToLast =
      Array.isArray((lastUser as { attachments?: unknown } | undefined)?.attachments) &&
      ((lastUser as { attachments: unknown[] }).attachments.length > 0);
    const egg = attachedToLast ? null : eggFor((lastUser as { content?: unknown } | undefined)?.content);
    if (egg) {
      // The same content type the streamed replies use, so every client reads
      // it the way it reads any other turn — one chunk instead of many.
      return new Response(egg.reply, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }

    // Cross-conversation journey: the client sends the user's evolving
    // understanding; a fresh conversation (first user turn) may open with a
    // natural check-in on an unfinished thread.
    const understanding = body?.understanding
      ? sanitizeUserUnderstanding(body.understanding)
      : null;
    const rawUserTurns = Array.isArray(messages)
      ? messages.filter((m: any) => m?.role === 'user').length
      : 0;
    // What this plan carries of the person into the conversation. The plan
    // is resolved here rather than trusted from the body: a modified free
    // client could otherwise hand itself a member's memory. The store is one
    // store for every plan; the plan is a window onto it (lib/person-memory.ts).
    const plan = userId ? await resolvePlanForRequest(req, userId) : 'free';
    const caps = memoryCaps(plan);
    const now = Date.now();
    const contextText = Array.isArray(messages)
      ? messages
          .slice(-4)
          .map((m: any) => (typeof m?.content === 'string' ? m.content : ''))
          .join('\n')
          .slice(0, 2_000)
      : '';
    // Not computed for Core 4 at all. Its memory is the Mind Graph; selecting
    // top-k flat entries for it would be the replaced architecture running
    // alongside the new one, and paying for it.
    const personMemory =
      understanding && resolveModel(body?.model) !== 'core-4'
        ? selectRelevant(visibleEntries(understanding.entries, plan, now), contextText, {
            now,
            n: caps.injectCore,
          })
        : null;
    const journey =
      understanding && hasJourneyContent(understanding)
        ? {
            understanding,
            conversationStart: rawUserTurns <= 1,
            limits: { narrative: caps.narrative, threads: caps.threads, timeline: Math.min(caps.timeline, 14) },
          }
        : null;



    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: 'messages array required' },
        { status: 400 }
      );
    }

    // Validate the last user message
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'user' || typeof last.content !== 'string') {
      return NextResponse.json(
        { error: 'last message must be from user' },
        { status: 400 }
      );
    }
    if (last.content.length > MAX_INPUT_LEN) {
      return NextResponse.json(
        { error: `Message too long (max ${MAX_INPUT_LEN} chars).` },
        { status: 400 }
      );
    }

    // Clean / clip the message history
    const clean = messages
      .filter(
        (m: any) =>
          m &&
          (m.role === 'user' || m.role === 'assistant') &&
          typeof m.content === 'string'
      )
      .slice(-MAX_HISTORY)
      .map((m: any) => ({ role: m.role, content: m.content }));

    const socriaModel = resolveModel(body?.model);

    // ── attachments (Core 4) ──────────────────────────────────────
    //
    // Files and images arrive already reduced to text (lib/file-extract.ts,
    // /api/logos/read). They ride on the user turns they were attached to;
    // `clean` above keeps only the words, for everything that must not be
    // swamped by a 40-page PDF — the state reader, the question count. What
    // the model itself receives is `modelMessages`, where the files are.
    // Other Cores do not take attachments, and their requests are unchanged.
    const withFiles: ChatMsg[] | null =
      socriaModel === 'core-4' ? sanitizeChatMessages(messages).slice(-MAX_HISTORY) : null;
    const lastTurn = withFiles && withFiles.length ? withFiles[withFiles.length - 1] : null;
    if (!last.content.trim() && !(lastTurn && hasSubstance(lastTurn))) {
      return NextResponse.json({ error: 'Say something, or attach something.' }, { status: 400 });
    }
    const modelMessages = withFiles ? renderForModel(withFiles) : clean;
    /** The latest turn as one line — words plus the names of what came with it. */
    const lastBrief = lastTurn ? briefly(lastTurn) : last.content;

    // The Project this conversation is in, if any. Bounded like every other
    // field off a request body; whether it is actually THEIR Project is
    // settled inside recall() and remember(), where every lookup is scoped
    // to the owner — an id that is not theirs reads as no Project at all.
    const projectId =
      typeof body?.projectId === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(body.projectId)
        ? body.projectId
        : null;

    // ── Core 4: understand, allocate, choose the move ──────────────
    //
    // The Project is looked up first (its instructions are the person's
    // standing agency contract). Then the Mind Graph recall and the Core 4
    // turn preparation run IN PARALLEL: recall is seeded by what they said
    // and what they handed over; the turn preparation reads their explicit
    // words, carries the Cognitive State forward, reads the ledger, and
    // chooses the move (lib/core4/turn.ts). Neither can break the reply: each
    // fails soft on its own line.
    let prepared: PreparedTurn | null = null;
    let mindBlock: string | null = null;
    let mindSubgraph: ActivatedSubgraph | null = null;
    let projectBlock: string | null = null;
    let inProject = false;
    const conversationId =
      typeof body?.conversationId === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(body.conversationId)
        ? body.conversationId
        : null;
    if (socriaModel === 'core-4') {
      const project = userId && projectId ? await getProject(userId, projectId).catch(() => null) : null;
      const brief = (withFiles ?? clean).map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: withFiles ? briefly(m as ChatMsg) : m.content,
      }));
      const [recalled, prep] = await Promise.all([
        userId
          ? recall(userId, lastTurn ? forMemory(lastTurn).slice(0, 2000) : last.content, {
              now: Date.now(),
              plan,
              surface: 'core',
              projectId,
            }).catch((e) => {
              console.error('[socria/chat] mind graph recall failed; continuing without it', e);
              return null;
            })
          : Promise.resolve(null),
        apiKey
          ? prepareTurn({
              apiKey,
              userId: userId ?? null,
              conversationId,
              projectId: project ? projectId : null,
              brief,
              lastUserText: last.content,
              instructions: project?.instructions ?? '',
              now: Date.now(),
            }).catch((e) => {
              console.error('[socria/chat] core 4 turn preparation failed; replying from the prompt alone', e);
              return null;
            })
          : Promise.resolve(null),
      ]);
      prepared = prep;
      if (recalled) {
        mindBlock = recalled.block || null;
        mindSubgraph = recalled.subgraph;
        projectBlock = recalled.projectBlock || null;
        inProject = !!recalled.project;
      }
    }

    const { prompt: basePrompt, model, depth } = buildSystemPrompt(
      body?.model,
      body?.depth,
      body?.memory,
      typeof body?.profile === 'string' ? body.profile : null,
      journey,
      personMemory,
      mindBlock,
      prepared
        ? { state: prepared.blocks.state + prepared.blocks.verify, move: prepared.blocks.move }
        : null,
      projectBlock
    );


    // Core 3.1 per-turn conversation controller: compute compact guidance from
    // the thread (what changed this turn, anti-loop "do not" list) and append
    // it to the END of the system prompt, where the model attends most. This
    // is the forcing function that keeps 3.1 from falling into the generic
    // reassure → paraphrase → broad-question loop. Deterministic — no extra
    // model call. Core 2 is untouched.
    // Dev-only A/B knob: the eval harness sends this to compare controller-on
    // vs controller-off replies against the same server. Ignored in production.
    const controllerDisabled =
      process.env.NODE_ENV !== 'production' &&
      req.headers.get('x-socria-no-controller') === '1';

    const openai = new OpenAI({ apiKey });

    let systemPrompt = basePrompt;
    let guidance: ReturnType<typeof computeGuidance> | null = null;
    let state: ConversationState | null = null;
    if (model === 'core-3' && !controllerDisabled) {
      guidance = computeGuidance(clean, body?.memory, depth);

      // Living-understanding pass — the semantic layer. Runs from the 2nd
      // user turn on (nothing to compare against on turn 1), unless disabled.
      // Prior understanding seeds continuity from last turn's memory.
      const userTurns = clean.filter((m) => m.role === 'user').length;
      const stateEnabled =
        process.env.SOCRIA_DISABLE_STATE !== '1' &&
        !(
          process.env.NODE_ENV !== 'production' &&
          req.headers.get('x-socria-no-state') === '1'
        );
      if (stateEnabled && userTurns >= 2) {
        const priorUnderstanding =
          (Array.isArray(body?.memory?.emergingUnderstanding) &&
            body.memory.emergingUnderstanding[0]) ||
          null;
        state = await computeConversationState(
          openai,
          clean,
          priorUnderstanding,
          journey ? renderJourneyBrief(journey.understanding) : null
        );
      }

      const parts = [basePrompt];
      if (state) parts.push(renderStateDirective(state));
      parts.push(
        renderTurnDirective(guidance, {
          hasSemanticState: !!state,
          journeyCheckIn:
            !!journey &&
            journey.conversationStart &&
            journey.understanding.openThreads.length > 0,
        })
      );
      systemPrompt = parts.join('\n\n');
    }

    if (process.env.NODE_ENV !== 'production') {
      const userTurns = clean.filter((m) => m.role === 'user').length;
      const assistantTurns = clean.filter((m) => m.role === 'assistant').length;
      // Dev-only. Never logs conversation content — only routing + shape.
      console.log('[socria/chat]', {
        socriaModel: model,
        openaiModel: resolveOpenAIModel(model),
        depth,
        promptVersion:
          model === 'core-3'
            ? SOCRIA_PROMPT_VERSION
            : model === 'core-4'
              ? CORE_4_PROMPT_VERSION
              : 'core-2',
        promptChars: systemPrompt.length,
        approxPromptTokens: Math.round(systemPrompt.length / 4),
        // Core 4 receives context too — its own prompt says to expect it —
        // so these can no longer mean "Core 3.1 and nothing else".
        memoryInjected: model !== 'core-2' && !!body?.memory,
        profileInjected: model !== 'core-2' && !!body?.profile,
        journeyInjected: model !== 'core-2' && !!journey,
        mindNodes: mindSubgraph?.nodes.length ?? 0,
        mindEdges: mindSubgraph?.edges.length ?? 0,
        // Whether this turn was inside a Project, and how much came across
        // from other Projects. The second number is the one to watch: if it
        // is routinely high, cross-project retrieval is flooding.
        inProject,
        crossProject: Object.keys(mindSubgraph?.elsewhere ?? {}).length,
        // Which move was chosen, and why. The reason is the point: when
        // Socria asks instead of answering there should be a nameable cause,
        // not a shrug about model judgement.
        allocation: prepared?.allocation.mode ?? null,
        allocationReason: prepared?.allocation.reasonCode ?? null,
        withhold: prepared?.allocation.withhold?.reason ?? null,
        intervention: prepared?.decision.type ?? null,
        because: prepared?.decision.reasonCode ?? null,
        questionBudget: prepared?.budget.allowed ?? null,
        questionStreak: prepared?.budget.streak ?? null,
        diminishing: prepared?.diminishing.detected ?? null,
        guarded: prepared?.decision.guardRequired ?? null,
        work: prepared?.state.work ?? null,
        attempt: prepared?.state.attempt ?? null,
        userTurns,
        assistantTurns,
        stage: guidance?.stage ?? null,
        previousMove: guidance?.previousMove ?? null,
        avoidNext: guidance?.avoidNext ?? null,
        stateDelta: state?.delta ?? null,
        stateStakes: state?.stakes ?? null,
        stateResolved: state?.resolved ?? null,
        stateActive: !!state,
      });
    }

    const openaiModel = resolveOpenAIModel(model);

    if (model === 'core-4') {
      return core4Reply({
        apiKey,
        systemPrompt,
        messages: modelMessages as ChatTurn[],
        prepared,
        openaiModel,
        fallbackModel: fallbackOpenAIModel(model),
        after: (reply: string) => {
          if (!userId) return;
          waitUntil(
            remember(userId, `User: ${lastTurn ? forMemory(lastTurn) : last.content}\n\nSocria: ${reply}`, {
              now: Date.now(),
              apiKey,
              surface: 'core',
              conversationId: conversationId ?? undefined,
              existing: mindSubgraph,
              projectId,
            }).catch((err: unknown) => {
              console.error('[socria/chat] mind graph remember failed', err);
            })
          );
        },
      });
    }

    const makeCompletion = (modelId: string) =>
      openai.chat.completions.create({
        model: modelId,
        messages: [
          { role: 'system', content: systemPrompt },
          ...modelMessages,
        ],
        temperature: 0.7,
        max_tokens: 500,
        stream: true,
      });

    // If the configured Core 3.1 model id is unknown/unavailable, OpenAI
    // rejects the request before streaming starts. Retry once with a known-
    // good fallback so a mis-set model id never takes chat down.
    let completion;
    try {
      completion = await makeCompletion(openaiModel);
    } catch (e: any) {
      const status = e?.status ?? e?.response?.status;
      const isModelError =
        status === 404 ||
        /model/i.test(e?.code || '') ||
        /model|not found|does not exist|unknown/i.test(e?.message || '');
      // Registry-driven, not `model === 'core-3'`. Written that way, Core 4
      // inherited the same model id and none of the protection — so a
      // deployment where Core 3.1 silently fell back and worked would fail on
      // Core 4 and look like Core 4 was broken.
      const fallback = fallbackOpenAIModel(model);
      if (fallback && isModelError && openaiModel !== fallback) {
        // Logged in production too. A model quietly answering as something
        // other than what the person picked is worth knowing about, and the
        // dev-only warning meant nobody found out for weeks.
        console.warn(
          `[socria/chat] model "${openaiModel}" rejected for ${model} (${e?.message || status}); falling back to ${fallback}`
        );
        completion = await makeCompletion(fallback);
      } else {
        throw e;
      }
    }

    const encoder = new TextEncoder();

    // ── the Answer Guard ──────────────────────────────────────────
    //
    // A guarded move CANNOT STREAM. The guard's whole value is that the
    // person does not see the leaked work — checking it after they have read
    // it would be theatre. So the draft is collected, read, and only then
    // emitted.
    //
    // The latency that costs is small and lands where it is cheapest: the
    // moves that need guarding are the ones Core 4's own Response Discipline
    // keeps short — a question, a nudge, an acknowledgement. The long replies,
    // where streaming actually matters, are the ones where the work is
    // legitimately ours and there is nothing to withhold.
    // Core 4 has its own path (core4Reply); every other Core streams as is.
    const guarded = false;

    const stream = new ReadableStream({
      async start(controller) {
        let reply = '';
        try {
          for await (const chunk of completion) {
            const delta = chunk.choices?.[0]?.delta?.content ?? '';
            if (delta) {
              reply += delta;
              // Held back when the move withholds something. Nothing reaches
              // the person until the guard has read it.
              if (!guarded) controller.enqueue(encoder.encode(delta));
            }
          }

        } catch (e) {
          console.error('stream error:', e);
          // On a guarded turn nothing has been sent yet, so whatever was
          // collected before the failure goes out with the notice rather
          // than being lost entirely.
          if (guarded && reply.trim()) controller.enqueue(encoder.encode(reply));
          controller.enqueue(
            encoder.encode('\n\n[Connection interrupted. Please try again.]')
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (e: any) {
    // It used to forward `e?.message` straight to the browser. More useful
    // than Logos's opaque string, but an upstream error object carries things
    // a browser should never see, and "Internal error" when the message was
    // empty put it back in the same hole. Classified instead: a sentence the
    // person can act on, and a reference that appears in the server log.
    const f = reportUpstream('core chat', e);
    return NextResponse.json(
      { error: f.reason, code: f.code, ref: f.ref },
      { status: f.status }
    );
  }
}

// ── the Core 4 reply ────────────────────────────────────────────────────

function isModelError(e: any): boolean {
  const status = e?.status ?? e?.response?.status;
  return status === 404 || e?.code === 'model_not_found' || /model_not_found|does not exist|unknown model/i.test(e?.message || '');
}

/**
 * Generate, guard and send one Core 4 reply.
 *
 * Moves that must be read before anybody sees them (anything that holds
 * something back, anything that raises a perspective) are generated whole,
 * checked by Answer Guard 2.0, regenerated ONCE if needed — and the retry is
 * checked again; a retry that still fails is never shipped as it stands (the
 * deterministic fallback is). Every other move streams through the sentence
 * gate, which holds back questions and a sycophantic opener until the end,
 * where the question budget decides.
 *
 * Before the stream closes, the turn is written back (state, ledger,
 * outcome, trace, capability evidence). The Mind Graph extraction runs after
 * the response, kept alive by waitUntil.
 */
function core4Reply(x: {
  apiKey: string;
  systemPrompt: string;
  messages: ChatTurn[];
  prepared: PreparedTurn | null;
  openaiModel: string;
  fallbackModel: string | null;
  after: (reply: string) => void;
}): Response {
  const encoder = new TextEncoder();
  const client = modelClient(x.apiKey);
  const p = x.prepared;
  const maxTokens = p?.decision.maxTokens ?? 700;
  const req = (modelId: string, system: string, role: 'reply' | 'retry' = 'reply') => ({
    role,
    model: modelId,
    system,
    messages: x.messages,
    maxTokens,
    temperature: 0.7,
  });

  const stream = new ReadableStream({
    async start(controller) {
      let reply = '';
      let served: string | null = null;
      let guard: GuardOutcome | null = null;
      let novelty: NoveltyVerdict[] = [];
      let regenerated = false;
      const t0 = Date.now();
      try {
        const buffered = !p || p.decision.guardRequired;
        // The first delta decides the model: a rejected model id falls back once.
        const open = async (modelId: string) => {
          const s = client.stream(req(modelId, x.systemPrompt));
          const it = s.deltas[Symbol.asyncIterator]();
          const first = await it.next();
          return { s, it, first };
        };
        let opened;
        try {
          opened = await open(x.openaiModel);
          served = x.openaiModel;
        } catch (e) {
          if (x.fallbackModel && x.fallbackModel !== x.openaiModel && isModelError(e)) {
            console.warn(`[socria/chat] model "${x.openaiModel}" rejected for core-4; falling back to ${x.fallbackModel}`);
            opened = await open(x.fallbackModel);
            served = x.fallbackModel;
          } else {
            throw e;
          }
        }
        const { s, it } = opened;
        const deltas = (async function* () {
          if (!opened.first.done) yield opened.first.value as string;
          for (;;) {
            const n = await it.next();
            if (n.done) return;
            yield n.value as string;
          }
        })();

        if (buffered) {
          for await (const d of deltas) reply += d;
          const done = await s.done.catch(() => null);
          served = done?.served ?? served;
          if (p) {
            if (p) p.ms.generate = Date.now() - t0;
            const first = await guardReply(p, reply);
            guard = first.outcome;
            novelty = first.novelty;
            reply = first.text;
            if (first.retryNote) {
              regenerated = true;
              let retry: string | null = null;
              try {
                const note = `\n\n=== Your previous draft was rejected ===\nWHY: ${first.retryNote}\nWrite the reply again. Do not apologise, do not mention this instruction, and do not reference a previous attempt — the person has not seen one.\n`;
                const c = await client.complete(req(served ?? x.openaiModel, x.systemPrompt + note, 'retry'));
                retry = c.text?.trim() || null;
              } catch (e) {
                console.error('[socria/chat] guard retry failed', e);
              }
              // The retry is checked again. Nothing ships unchecked.
              const second = retry ? await guardReply(p, retry) : null;
              if (second && !second.retryNote) {
                reply = second.text;
                guard = { ...second.outcome, findings: [...(first.outcome.findings ?? []), ...second.outcome.findings] };
                novelty = [...novelty, ...second.novelty];
              } else {
                const fb = fallbackReply(p, first.text, retry);
                reply = fb.text;
                guard = { ...first.outcome, findings: [...first.outcome.findings, ...fb.codes.map((c) => ({ side: 'underhelp' as const, code: c, detail: c }))] };
              }
            }
          }
          controller.enqueue(encoder.encode(reply));
        } else {
          const gate = new SentenceGate((chunk) => controller.enqueue(encoder.encode(chunk)));
          for await (const d of deltas) gate.push(d);
          const dropped = gate.finish(p!.decision.maxQuestions);
          reply = gate.out;
          const done = await s.done.catch(() => null);
          served = done?.served ?? served;
          if (dropped.length) {
            guard = { action: 'MODIFY_FOR_MORE_HELP', findings: dropped.map(() => ({ side: 'underhelp' as const, code: 'stream_gate', detail: 'held-back question dropped' })), by: 'structure' };
          }
          if (p) p.ms.generate = Date.now() - t0;
        }
      } catch (e) {
        console.error('stream error:', e);
        if (reply.trim() && (!p || p.decision.guardRequired)) {
          // Nothing has been sent on a buffered turn; send only what the
          // deterministic guard accepts, never the raw draft.
          const safe = p ? fallbackReply(p, reply, null).text : reply;
          controller.enqueue(encoder.encode(safe));
          reply = safe;
        }
        controller.enqueue(encoder.encode('\n\n[Connection interrupted. Please try again.]'));
      } finally {
        try {
          if (p) await finishTurn(p, reply, guard, regenerated, novelty, served, CORE_4_PROMPT_VERSION);
        } catch (e) {
          console.error('[socria/chat] core 4 writeback failed', e);
        }
        controller.close();
        try {
          if (reply.trim()) x.after(reply);
        } catch (e) {
          console.error('[socria/chat] mind graph remember threw', e);
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
