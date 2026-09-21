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
  resolveModel,
} from '@/lib/socria-prompt';
import { recall, remember } from '@/lib/mind/pipeline';
import type { ActivatedSubgraph } from '@/lib/mind/activate';
import {
  sanitizeUserUnderstanding,
  hasJourneyContent,
  renderJourneyBrief,
  buildConversationStatePrompt,
  sanitizeConversationState,
  renderTranscriptForState,
  type ConversationState,
} from '@/lib/socria-prompt';
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
    const egg = eggFor((lastUser as { content?: unknown } | undefined)?.content);
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
    const personMemory = understanding
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

    // ── the Mind Graph ────────────────────────────────────────────
    //
    // Core 4's persistent memory. Activated by what they just said — a region
    // of the graph reached through its edges, not a top-k list of snippets —
    // and rendered into the system prompt.
    //
    // Never blocks and never throws. A graph that cannot be read means a
    // conversation without memory, which is how this worked last week; a
    // conversation that breaks BECAUSE of memory is a regression nobody
    // accepts. recall() already swallows its own failures; this is the second
    // reason it is called on its own line rather than inline.
    const socriaModel = resolveModel(body?.model);
    let mindBlock: string | null = null;
    let mindSubgraph: ActivatedSubgraph | null = null;
    if (socriaModel === 'core-4' && userId) {
      const r = await recall(userId, last.content, {
        now: Date.now(),
        plan: await resolvePlanForRequest(req, userId),
        surface: 'core',
      });
      mindBlock = r.block || null;
      mindSubgraph = r.subgraph;
    }

    const { prompt: basePrompt, model, depth } = buildSystemPrompt(
      body?.model,
      body?.depth,
      body?.memory,
      typeof body?.profile === 'string' ? body.profile : null,
      journey,
      personMemory,
      mindBlock
    );

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

    const makeCompletion = (modelId: string) =>
      openai.chat.completions.create({
        model: modelId,
        messages: [
          { role: 'system', content: systemPrompt },
          ...clean,
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
      if (model === 'core-3' && isModelError && openaiModel !== CORE_3_FALLBACK_MODEL) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            `[socria/chat] model "${openaiModel}" rejected (${e?.message || status}); falling back to ${CORE_3_FALLBACK_MODEL}`
          );
        }
        completion = await makeCompletion(CORE_3_FALLBACK_MODEL);
      } else {
        throw e;
      }
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let reply = '';
        try {
          for await (const chunk of completion) {
            const delta = chunk.choices?.[0]?.delta?.content ?? '';
            if (delta) {
              reply += delta;
              controller.enqueue(encoder.encode(delta));
            }
          }
        } catch (e) {
          console.error('stream error:', e);
          controller.enqueue(
            encoder.encode('\n\n[Connection interrupted. Please try again.]')
          );
        } finally {
          controller.close();
          // ── learn from the turn ────────────────────────────────
          //
          // After the reply is closed, never before: the person waits for
          // words, not for a graph. Fire-and-forget, and remember() swallows
          // its own failures — a turn the graph did not learn from is
          // recoverable and invisible; a reply that failed because of the
          // graph is neither.
          //
          // Both halves go in. A conversation is what was said AND what
          // Socria said back, and half of it is the half that contains the
          // question somebody was answering.
          if (socriaModel === 'core-4' && userId && apiKey) {
            void remember(userId, `User: ${last.content}\n\nSocria: ${reply}`, {
              now: Date.now(),
              apiKey,
              surface: 'core',
              conversationId: typeof body?.conversationId === 'string' ? body.conversationId : undefined,
              existing: mindSubgraph,
            });
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
